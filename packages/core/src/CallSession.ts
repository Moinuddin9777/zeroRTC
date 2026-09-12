/**
 * CallSession — one peer connection lifecycle.
 *
 * Architecture:
 *  1. External ISignalingChannel carries ONLY the initial SDP/ICE handshake.
 *  2. Initiator creates a reliable "control" DataChannel immediately.
 *  3. The millisecond it opens → dispose external signaling; all control
 *     (mute, camera-swap, hangup, trickle ICE) rides in-band.
 *  4. Media uses addTransceiver() so mute/unmute never tears down negotiation.
 */

import { isPolitePeer } from './glare';
import type {
  IPeerConnection,
  IPeerConnectionFactory,
  IceServerConfig,
} from './interfaces/IPeerConnection';
import type { ISignalingChannel } from './interfaces/ISignalingChannel';
import { NetworkMonitor } from './NetworkMonitor';
import type {
  ControlMessage,
  ControlMessageType,
  NetworkStats,
  RTCMode,
  SignalEventLog,
} from './types';

export interface CallSessionOptions {
  localPeerId: string;
  remotePeerId: string;
  isInitiator: boolean;
  signaling: ISignalingChannel;
  peerFactory: IPeerConnectionFactory;
  iceServers?: IceServerConfig[];
  localStream?: MediaStream;
  onLog?: (log: SignalEventLog) => void;
  onClosed?: () => void;
  statsIntervalMs?: number;
}

export class CallSession {
  readonly remotePeerId: string;
  readonly localPeerId: string;

  private readonly isInitiator: boolean;
  private readonly polite: boolean;
  private readonly pc: IPeerConnection;
  private signaling: ISignalingChannel | null;
  private controlChannel: RTCDataChannel | null = null;
  private telemetryChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null;
  private remoteStream = new MediaStream();
  private readonly networkMonitor: NetworkMonitor;
  private readonly pendingIce: RTCIceCandidateInit[] = [];
  private makingOffer = false;
  private ignoreOffer = false;
  private disposed = false;
  private controlOpen = false;

  private audioTransceiver: RTCRtpTransceiver | null = null;
  private videoTransceiver: RTCRtpTransceiver | null = null;

  mode: RTCMode = 'pixel';

  private readonly remoteStreamCbs = new Set<(s: MediaStream) => void>();
  private readonly disconnectCbs = new Set<() => void>();
  private readonly modeCbs = new Set<(m: RTCMode) => void>();
  private readonly healthCbs = new Set<(s: NetworkStats) => void>();
  private readonly telemetryCbs = new Set<(buf: ArrayBuffer) => void>();
  private readonly blendshapeCbs = new Set<(f: Float32Array) => void>();
  private readonly onLog: (log: SignalEventLog) => void;
  private readonly onClosed: () => void;
  private unsubSignal: (() => void) | null = null;

  constructor(opts: CallSessionOptions) {
    this.localPeerId = opts.localPeerId;
    this.remotePeerId = opts.remotePeerId;
    this.isInitiator = opts.isInitiator;
    this.polite = isPolitePeer(opts.localPeerId, opts.remotePeerId);
    this.signaling = opts.signaling;
    this.localStream = opts.localStream ?? null;
    this.onLog = opts.onLog ?? (() => undefined);
    this.onClosed = opts.onClosed ?? (() => undefined);

    this.pc = opts.peerFactory.create({
      iceServers: opts.iceServers,
      iceCandidatePoolSize: 2,
      bundlePolicy: 'max-bundle',
    });

    this.networkMonitor = new NetworkMonitor({ intervalMs: opts.statsIntervalMs ?? 800 });
    this.wirePeerConnection();
    this.attachTransceivers();
    this.bindExternalSignaling();

    if (this.isInitiator) {
      this.createOutboundChannels();
    }
  }

  get isControlChannelOpen(): boolean {
    return this.controlOpen;
  }

  get networkMonitorRef(): NetworkMonitor {
    return this.networkMonitor;
  }

  /** Public API aliases matching the demo UI contract. */
  onRemoteStream(cb: (stream: MediaStream) => void): void {
    this.remoteStreamCbs.add(cb);
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCbs.add(cb);
  }

  onModeChange(cb: (mode: RTCMode) => void): void {
    this.modeCbs.add(cb);
  }

  onNetworkHealth(cb: (stats: NetworkStats) => void): void {
    this.healthCbs.add(cb);
  }

  onTelemetry(cb: (buf: ArrayBuffer) => void): void {
    this.telemetryCbs.add(cb);
  }

  onBlendshapesReceived(cb: (blendshapes: Float32Array) => void): void {
    this.blendshapeCbs.add(cb);
  }

  setMode(mode: RTCMode): void {
    this.applyMode(mode, true);
  }

  sendInBandControl(type: ControlMessageType, data?: Record<string, unknown>): void {
    const msg: ControlMessage = { t: type, ts: Date.now() };
    if (data?.mode !== undefined) msg.v = String(data.mode);
    if (data?.candidate) msg.c = data.candidate as RTCIceCandidateInit;
    if (data?.enabled !== undefined) msg.v = Boolean(data.enabled);
    this.sendControl(msg);
  }

  /** Expose the telemetry DataChannel for @zerortc/telemetry attachment. */
  getTelemetryChannel(): RTCDataChannel | null {
    return this.telemetryChannel;
  }

  getConnection(): RTCPeerConnection {
    return this.pc as unknown as RTCPeerConnection;
  }

  getVideoSender(): RTCRtpSender | null {
    return this.videoTransceiver?.sender ?? null;
  }

  /** Mute/unmute without renegotiation — transceiver dominance. */
  setTrackEnabled(kind: 'audio' | 'video', enabled: boolean): void {
    const tx = kind === 'audio' ? this.audioTransceiver : this.videoTransceiver;
    const track = tx?.sender.track;
    if (track) track.enabled = enabled;
    this.sendControl({ t: 'media-state', v: enabled ? 1 : 0, ts: Date.now() });
  }

  async swapCamera(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.videoTransceiver) return;
    await this.videoTransceiver.sender.replaceTrack(newTrack);
    this.sendControl({ t: 'camera-swap', ts: Date.now() });
  }

  hangup(): void {
    if (this.disposed) return;
    this.sendControl({ t: 'hangup', ts: Date.now() });
    this.destroy();
  }

  /** Initiator entry — create & send offer over external signaling. */
  async startAsOfferer(): Promise<void> {
    await this.createAndSendOffer();
  }

  // ─── internals ───────────────────────────────────────────────

  private attachTransceivers(): void {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    const videoTrack = this.localStream?.getVideoTracks()[0];

    this.audioTransceiver = this.pc.addTransceiver(audioTrack ?? 'audio', {
      direction: 'sendrecv',
      streams: this.localStream ? [this.localStream] : undefined,
    });

    this.videoTransceiver = this.pc.addTransceiver(videoTrack ?? 'video', {
      direction: 'sendrecv',
      streams: this.localStream ? [this.localStream] : undefined,
    });
  }

  private createOutboundChannels(): void {
    this.controlChannel = this.pc.createDataChannel('control', { ordered: true });
    this.bindControl(this.controlChannel);

    this.telemetryChannel = this.pc.createDataChannel('telemetry', {
      ordered: false,
      maxPacketLifeTime: 250,
    });
    this.bindTelemetry(this.telemetryChannel);
  }

  private wirePeerConnection(): void {
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const init = ev.candidate.toJSON();
      if (this.controlOpen) {
        this.sendControl({ t: 'ice', c: init, ts: Date.now() });
      } else {
        this.sendExternal({ t: 'ice', c: init, ts: Date.now() });
      }
    };

    this.pc.ontrack = (ev) => {
      for (const track of ev.streams[0]?.getTracks() ?? [ev.track]) {
        if (!this.remoteStream.getTracks().some((t) => t.id === track.id)) {
          this.remoteStream.addTrack(track);
        }
      }
      this.remoteStreamCbs.forEach((cb) => cb(this.remoteStream));
    };

    this.pc.ondatachannel = (ev) => {
      if (ev.channel.label === 'control') {
        this.controlChannel = ev.channel;
        this.bindControl(ev.channel);
      } else if (ev.channel.label === 'telemetry' || ev.channel.label === 'semantic') {
        this.telemetryChannel = ev.channel;
        this.bindTelemetry(ev.channel);
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'connected') {
        this.networkMonitor.attach(this.pc);
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        if (state !== 'disconnected') this.destroy();
      }
    };

    this.networkMonitor.on('stats', (s) => {
      if (s) this.healthCbs.forEach((cb) => cb(s));
    });
    this.networkMonitor.on('critical', () => this.applyMode('semantic', true));
    this.networkMonitor.on('recovered', () => this.applyMode('pixel', true));
  }

  private bindExternalSignaling(): void {
    if (!this.signaling) return;
    this.unsubSignal = this.signaling.onMessage((raw) => {
      void this.handleExternal(raw);
    });
  }

  private bindControl(ch: RTCDataChannel): void {
    ch.onopen = () => {
      this.controlOpen = true;
      this.log('received', 'in-band-datachannel', 'ping', 0, '⚡ control DataChannel OPEN — disposing external signaling');
      this.disposeExternalSignaling();
      this.sendControl({ t: 'ping', v: this.isInitiator ? 'initiator' : 'responder', ts: Date.now() });
    };
    ch.onclose = () => {
      this.controlOpen = false;
    };
    ch.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as ControlMessage;
        this.log('received', 'in-band-datachannel', msg.t, ev.data.length, `P2P in-band ${msg.t}`);
        void this.handleControl(msg);
      } catch {
        /* drop malformed */
      }
    };
  }

  private bindTelemetry(ch: RTCDataChannel): void {
    ch.binaryType = 'arraybuffer';
    ch.onmessage = (ev) => {
      if (!(ev.data instanceof ArrayBuffer)) return;
      this.telemetryCbs.forEach((cb) => cb(ev.data as ArrayBuffer));
      // Legacy blendshape path: raw Float32Array payloads
      if ((ev.data as ArrayBuffer).byteLength % 4 === 0) {
        this.blendshapeCbs.forEach((cb) => cb(new Float32Array(ev.data as ArrayBuffer)));
      }
    };
  }

  /**
   * Disposable Signaling: tear down external transport the instant
   * the in-band control channel is live. Subsequent ICE / control
   * never touches the mesh/WS/QR path again.
   */
  private disposeExternalSignaling(): void {
    this.unsubSignal?.();
    this.unsubSignal = null;
    this.signaling?.dispose();
    this.signaling = null;
  }

  private async createAndSendOffer(): Promise<void> {
    try {
      this.makingOffer = true;
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.sendExternal({ t: 'offer', s: offer.sdp, ts: Date.now() });
    } finally {
      this.makingOffer = false;
    }
  }

  private async handleExternal(raw: string): Promise<void> {
    let msg: ControlMessage;
    try {
      msg = JSON.parse(raw) as ControlMessage;
    } catch {
      return;
    }
    this.log('received', 'external-signaling', msg.t, raw.length, `External ${msg.t} from ${this.remotePeerId}`);

    if (msg.t === 'offer' && msg.s) {
      await this.onRemoteOffer(msg.s);
    } else if (msg.t === 'answer' && msg.s) {
      await this.onRemoteAnswer(msg.s);
    } else if (msg.t === 'ice' && msg.c) {
      await this.addIce(msg.c);
    }
  }

  private async onRemoteOffer(sdp: string): Promise<void> {
    const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    if (offerCollision) {
      try {
        await this.pc.setLocalDescription({ type: 'rollback' });
      } catch {
        return;
      }
    }

    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    await this.drainIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.sendExternal({ t: 'answer', s: answer.sdp, ts: Date.now() });
  }

  private async onRemoteAnswer(sdp: string): Promise<void> {
    if (this.pc.signalingState !== 'have-local-offer') return;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp });
      await this.drainIce();
    } catch {
      /* already applied */
    }
  }

  private async handleControl(msg: ControlMessage): Promise<void> {
    if (msg.t === 'ice' && msg.c) {
      await this.addIce(msg.c);
    } else if (msg.t === 'hangup') {
      this.destroy();
    } else if (msg.t === 'mode' && typeof msg.v === 'string') {
      this.applyMode(msg.v as RTCMode, false);
    } else if (msg.t === 'mute' || msg.t === 'media-state') {
      /* remote UI may react via mode / custom listeners */
    }
  }

  private async addIce(c: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(c);
      return;
    }
    try {
      await this.pc.addIceCandidate(c);
    } catch {
      /* transient */
    }
  }

  private async drainIce(): Promise<void> {
    const batch = this.pendingIce.splice(0);
    for (const c of batch) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* skip */
      }
    }
  }

  private applyMode(mode: RTCMode, broadcast: boolean): void {
    if (this.mode === mode) return;
    this.mode = mode;

    const videoTrack = this.videoTransceiver?.sender.track;
    if (videoTrack) videoTrack.enabled = mode === 'pixel';

    if (broadcast) this.sendControl({ t: 'mode', v: mode, ts: Date.now() });
    this.modeCbs.forEach((cb) => cb(mode));
  }

  private sendExternal(msg: ControlMessage): void {
    if (!this.signaling?.isOpen) return;
    const raw = JSON.stringify(msg);
    this.log('sent', 'external-signaling', msg.t, raw.length, `Sent ${msg.t} via disposable signaling`);
    void this.signaling.send(raw);
  }

  private sendControl(msg: ControlMessage): void {
    if (!this.controlChannel || this.controlChannel.readyState !== 'open') return;
    const raw = JSON.stringify(msg);
    this.log('sent', 'in-band-datachannel', msg.t, raw.length, `P2P in-band sent ${msg.t}`);
    try {
      this.controlChannel.send(raw);
    } catch {
      /* closing */
    }
  }

  private log(
    direction: 'sent' | 'received',
    channel: SignalEventLog['channel'],
    type: ControlMessageType,
    bytes: number,
    summary: string
  ): void {
    this.onLog({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      direction,
      channel,
      type,
      bytes,
      summary,
    });
  }

  private destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.networkMonitor.destroy();
    this.disposeExternalSignaling();
    try {
      this.controlChannel?.close();
      this.telemetryChannel?.close();
      this.pc.close();
    } catch {
      /* already closed */
    }
    this.disconnectCbs.forEach((cb) => cb());
    this.onClosed();
  }
}
