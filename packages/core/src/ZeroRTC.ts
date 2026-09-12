/**
 * ZeroRTC — core client. Owns peer sessions, glare resolution, and the
 * ISignalingChannelFactory injection point for mesh / app backends.
 */

import { CallSession } from './CallSession';
import {
  BrowserPeerConnectionFactory,
  type IPeerConnectionFactory,
  type IceServerConfig,
} from './interfaces/IPeerConnection';
import type { ISignalingChannel, ISignalingChannelFactory } from './interfaces/ISignalingChannel';
import type { CallRequest, ControlMessage, SignalEventLog, ZeroRTCOptions } from './types';

/** Optional host-side inject hook used by BusSignalingChannel. */
type InjectChannel = ISignalingChannel & { _inject?: (m: string) => void };

export class ZeroRTC {
  readonly localPeerId: string;
  private readonly signalingFactory: ISignalingChannelFactory;
  private readonly peerFactory: IPeerConnectionFactory;
  private readonly iceServers: IceServerConfig[];
  private readonly statsIntervalMs: number;
  private readonly sessions = new Map<string, CallSession>();
  private incomingHandler: ((req: CallRequest) => void) | null = null;
  private readonly logListeners = new Set<(log: SignalEventLog) => void>();
  private readonly signalLogs: SignalEventLog[] = [];
  private readonly channels = new Map<string, InjectChannel>();
  /** Buffered offers awaiting answer() — survives until CallSession binds. */
  private readonly bufferedOffers = new Map<string, string>();
  /** Early ICE/answer lines before CallSession.onMessage is bound. */
  private readonly earlySignals = new Map<string, string[]>();
  private disposed = false;

  constructor(options: ZeroRTCOptions) {
    this.localPeerId = options.localPeerId;
    this.signalingFactory = options.signaling;
    this.peerFactory = options.peerFactory ?? new BrowserPeerConnectionFactory();
    this.iceServers = options.iceServers ?? [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ];
    this.statsIntervalMs = options.statsIntervalMs ?? 800;
  }

  onIncoming(cb: (req: CallRequest) => void): void {
    this.incomingHandler = cb;
  }

  onSignalLog(cb: (log: SignalEventLog) => void): () => void {
    this.logListeners.add(cb);
    return () => this.logListeners.delete(cb);
  }

  getSignalLogs(): SignalEventLog[] {
    return [...this.signalLogs];
  }

  /**
   * Host demux entry — feed every inbound signaling string here when using
   * a shared bus. Mesh adapters (BLE/QR) typically call channel.send/onMessage
   * directly and do not need this method.
   */
  async receiveSignal(fromPeerId: string, raw: string): Promise<void> {
    if (this.disposed) return;

    let msg: ControlMessage;
    try {
      msg = JSON.parse(raw) as ControlMessage;
    } catch {
      return;
    }

    this.recordLog({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      direction: 'received',
      channel: 'external-signaling',
      type: msg.t,
      bytes: raw.length,
      summary: `External delivered ${msg.t} from ${fromPeerId}`,
    });

    if (msg.t === 'offer' && msg.s) {
      this.bufferedOffers.set(fromPeerId, raw);
      this.emitIncoming(fromPeerId, raw);
      return;
    }

    const session = this.sessions.get(fromPeerId);
    const ch = this.channels.get(fromPeerId);

    if (session && ch?._inject) {
      ch._inject(raw);
      return;
    }

    // Buffer answer/ICE that race ahead of answer()
    if (msg.t === 'ice' || msg.t === 'answer') {
      const q = this.earlySignals.get(fromPeerId) ?? [];
      q.push(raw);
      if (q.length > 64) q.shift();
      this.earlySignals.set(fromPeerId, q);
      this.ensureChannel(fromPeerId);
    }
  }

  async call(targetId: string, localStream?: MediaStream): Promise<CallSession> {
    this.closeSession(targetId);

    const channel = this.ensureChannel(targetId);
    const session = new CallSession({
      localPeerId: this.localPeerId,
      remotePeerId: targetId,
      isInitiator: true,
      signaling: channel,
      peerFactory: this.peerFactory,
      iceServers: this.iceServers,
      localStream,
      statsIntervalMs: this.statsIntervalMs,
      onLog: (log) => this.recordLog(log),
      onClosed: () => {
        this.sessions.delete(targetId);
        this.channels.delete(targetId);
      },
    });

    this.sessions.set(targetId, session);
    // Flush any ICE that arrived absurdly early
    const early = this.earlySignals.get(targetId) ?? [];
    this.earlySignals.delete(targetId);
    if (early.length) {
      queueMicrotask(() => {
        for (const line of early) channel._inject?.(line);
      });
    }
    await session.startAsOfferer();
    return session;
  }

  destroy(): void {
    this.disposed = true;
    for (const s of [...this.sessions.values()]) s.hangup();
    this.sessions.clear();
    for (const ch of this.channels.values()) ch.dispose();
    this.channels.clear();
    this.bufferedOffers.clear();
    this.logListeners.clear();
  }

  // ─── private ─────────────────────────────────────────────────

  private ensureChannel(remotePeerId: string): InjectChannel {
    let ch = this.channels.get(remotePeerId);
    if (ch?.isOpen) return ch;

    const base = this.signalingFactory.create(remotePeerId);
    const handlers = new Set<(m: string) => void>();
    const origOnMessage = base.onMessage.bind(base);

    const wrapped: InjectChannel = {
      get isOpen() {
        return base.isOpen;
      },
      send: (m) => base.send(m),
      dispose: () => {
        handlers.clear();
        base.dispose();
      },
      onClose: base.onClose?.bind(base),
      onMessage: (handler) => {
        handlers.add(handler);
        const unsub = origOnMessage(handler);
        return () => {
          handlers.delete(handler);
          unsub();
        };
      },
      _inject: (m: string) => {
        handlers.forEach((h) => h(m));
      },
    };

    this.channels.set(remotePeerId, wrapped);
    return wrapped;
  }

  private emitIncoming(fromPeerId: string, offerRaw: string): void {
    if (!this.incomingHandler) return;

    let settled = false;
    const req: CallRequest = {
      callerId: fromPeerId,
      answer: async (localStream?: MediaStream) => {
        if (settled) return this.sessions.get(fromPeerId)!;
        settled = true;
        this.closeSession(fromPeerId);

        const channel = this.ensureChannel(fromPeerId);
        const session = new CallSession({
          localPeerId: this.localPeerId,
          remotePeerId: fromPeerId,
          isInitiator: false,
          signaling: channel,
          peerFactory: this.peerFactory,
          iceServers: this.iceServers,
          localStream,
          statsIntervalMs: this.statsIntervalMs,
          onLog: (log) => this.recordLog(log),
          onClosed: () => {
            this.sessions.delete(fromPeerId);
            this.channels.delete(fromPeerId);
          },
        });
        this.sessions.set(fromPeerId, session);

        const buffered = this.bufferedOffers.get(fromPeerId) ?? offerRaw;
        this.bufferedOffers.delete(fromPeerId);
        const early = this.earlySignals.get(fromPeerId) ?? [];
        this.earlySignals.delete(fromPeerId);

        // Defer so CallSession finishes binding onMessage
        queueMicrotask(() => {
          channel._inject?.(buffered);
          for (const line of early) channel._inject?.(line);
        });
        return session;
      },
      reject: () => {
        if (settled) return;
        settled = true;
        this.bufferedOffers.delete(fromPeerId);
        const ch = this.ensureChannel(fromPeerId);
        void ch.send(JSON.stringify({ t: 'hangup', ts: Date.now() }));
        ch.dispose();
        this.channels.delete(fromPeerId);
      },
    };

    this.incomingHandler(req);
  }

  private closeSession(peerId: string): void {
    const existing = this.sessions.get(peerId);
    if (existing) {
      existing.hangup();
      this.sessions.delete(peerId);
    }
  }

  private recordLog(log: SignalEventLog): void {
    this.signalLogs.unshift(log);
    if (this.signalLogs.length > 80) this.signalLogs.pop();
    this.logListeners.forEach((fn) => fn(log));
  }
}
