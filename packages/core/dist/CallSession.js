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
import { NetworkMonitor } from './NetworkMonitor';
export class CallSession {
    remotePeerId;
    localPeerId;
    isInitiator;
    polite;
    pc;
    signaling;
    controlChannel = null;
    telemetryChannel = null;
    localStream;
    remoteStream = new MediaStream();
    networkMonitor;
    pendingIce = [];
    makingOffer = false;
    ignoreOffer = false;
    disposed = false;
    controlOpen = false;
    audioTransceiver = null;
    videoTransceiver = null;
    mode = 'pixel';
    remoteStreamCbs = new Set();
    disconnectCbs = new Set();
    modeCbs = new Set();
    healthCbs = new Set();
    telemetryCbs = new Set();
    blendshapeCbs = new Set();
    onLog;
    onClosed;
    unsubSignal = null;
    constructor(opts) {
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
    get isControlChannelOpen() {
        return this.controlOpen;
    }
    get networkMonitorRef() {
        return this.networkMonitor;
    }
    /** Public API aliases matching the demo UI contract. */
    onRemoteStream(cb) {
        this.remoteStreamCbs.add(cb);
    }
    onDisconnect(cb) {
        this.disconnectCbs.add(cb);
    }
    onModeChange(cb) {
        this.modeCbs.add(cb);
    }
    onNetworkHealth(cb) {
        this.healthCbs.add(cb);
    }
    onTelemetry(cb) {
        this.telemetryCbs.add(cb);
    }
    onBlendshapesReceived(cb) {
        this.blendshapeCbs.add(cb);
    }
    setMode(mode) {
        this.applyMode(mode, true);
    }
    sendInBandControl(type, data) {
        const msg = { t: type, ts: Date.now() };
        if (data?.mode !== undefined)
            msg.v = String(data.mode);
        if (data?.candidate)
            msg.c = data.candidate;
        if (data?.enabled !== undefined)
            msg.v = Boolean(data.enabled);
        this.sendControl(msg);
    }
    /** Expose the telemetry DataChannel for @zerortc/telemetry attachment. */
    getTelemetryChannel() {
        return this.telemetryChannel;
    }
    getConnection() {
        return this.pc;
    }
    getVideoSender() {
        return this.videoTransceiver?.sender ?? null;
    }
    /** Mute/unmute without renegotiation — transceiver dominance. */
    setTrackEnabled(kind, enabled) {
        const tx = kind === 'audio' ? this.audioTransceiver : this.videoTransceiver;
        const track = tx?.sender.track;
        if (track)
            track.enabled = enabled;
        this.sendControl({ t: 'media-state', v: enabled ? 1 : 0, ts: Date.now() });
    }
    async swapCamera(newTrack) {
        if (!this.videoTransceiver)
            return;
        await this.videoTransceiver.sender.replaceTrack(newTrack);
        this.sendControl({ t: 'camera-swap', ts: Date.now() });
    }
    hangup() {
        if (this.disposed)
            return;
        this.sendControl({ t: 'hangup', ts: Date.now() });
        this.destroy();
    }
    /** Initiator entry — create & send offer over external signaling. */
    async startAsOfferer() {
        await this.createAndSendOffer();
    }
    // ─── internals ───────────────────────────────────────────────
    attachTransceivers() {
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
    createOutboundChannels() {
        this.controlChannel = this.pc.createDataChannel('control', { ordered: true });
        this.bindControl(this.controlChannel);
        this.telemetryChannel = this.pc.createDataChannel('telemetry', {
            ordered: false,
            maxPacketLifeTime: 250,
        });
        this.bindTelemetry(this.telemetryChannel);
    }
    wirePeerConnection() {
        this.pc.onicecandidate = (ev) => {
            if (!ev.candidate)
                return;
            const init = ev.candidate.toJSON();
            if (this.controlOpen) {
                this.sendControl({ t: 'ice', c: init, ts: Date.now() });
            }
            else {
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
            }
            else if (ev.channel.label === 'telemetry' || ev.channel.label === 'semantic') {
                this.telemetryChannel = ev.channel;
                this.bindTelemetry(ev.channel);
            }
        };
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState;
            if (state === 'connected') {
                this.networkMonitor.attach(this.pc);
            }
            else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                if (state !== 'disconnected')
                    this.destroy();
            }
        };
        this.networkMonitor.on('stats', (s) => {
            if (s)
                this.healthCbs.forEach((cb) => cb(s));
        });
        this.networkMonitor.on('critical', () => this.applyMode('semantic', true));
        this.networkMonitor.on('recovered', () => this.applyMode('pixel', true));
    }
    bindExternalSignaling() {
        if (!this.signaling)
            return;
        this.unsubSignal = this.signaling.onMessage((raw) => {
            void this.handleExternal(raw);
        });
    }
    bindControl(ch) {
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
            if (typeof ev.data !== 'string')
                return;
            try {
                const msg = JSON.parse(ev.data);
                this.log('received', 'in-band-datachannel', msg.t, ev.data.length, `P2P in-band ${msg.t}`);
                void this.handleControl(msg);
            }
            catch {
                /* drop malformed */
            }
        };
    }
    bindTelemetry(ch) {
        ch.binaryType = 'arraybuffer';
        ch.onmessage = (ev) => {
            if (!(ev.data instanceof ArrayBuffer))
                return;
            this.telemetryCbs.forEach((cb) => cb(ev.data));
            // Legacy blendshape path: raw Float32Array payloads
            if (ev.data.byteLength % 4 === 0) {
                this.blendshapeCbs.forEach((cb) => cb(new Float32Array(ev.data)));
            }
        };
    }
    /**
     * Disposable Signaling: tear down external transport the instant
     * the in-band control channel is live. Subsequent ICE / control
     * never touches the mesh/WS/QR path again.
     */
    disposeExternalSignaling() {
        this.unsubSignal?.();
        this.unsubSignal = null;
        this.signaling?.dispose();
        this.signaling = null;
    }
    async createAndSendOffer() {
        try {
            this.makingOffer = true;
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.sendExternal({ t: 'offer', s: offer.sdp, ts: Date.now() });
        }
        finally {
            this.makingOffer = false;
        }
    }
    async handleExternal(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return;
        }
        this.log('received', 'external-signaling', msg.t, raw.length, `External ${msg.t} from ${this.remotePeerId}`);
        if (msg.t === 'offer' && msg.s) {
            await this.onRemoteOffer(msg.s);
        }
        else if (msg.t === 'answer' && msg.s) {
            await this.onRemoteAnswer(msg.s);
        }
        else if (msg.t === 'ice' && msg.c) {
            await this.addIce(msg.c);
        }
    }
    async onRemoteOffer(sdp) {
        const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';
        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer)
            return;
        if (offerCollision) {
            try {
                await this.pc.setLocalDescription({ type: 'rollback' });
            }
            catch {
                return;
            }
        }
        await this.pc.setRemoteDescription({ type: 'offer', sdp });
        await this.drainIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendExternal({ t: 'answer', s: answer.sdp, ts: Date.now() });
    }
    async onRemoteAnswer(sdp) {
        if (this.pc.signalingState !== 'have-local-offer')
            return;
        try {
            await this.pc.setRemoteDescription({ type: 'answer', sdp });
            await this.drainIce();
        }
        catch {
            /* already applied */
        }
    }
    async handleControl(msg) {
        if (msg.t === 'ice' && msg.c) {
            await this.addIce(msg.c);
        }
        else if (msg.t === 'hangup') {
            this.destroy();
        }
        else if (msg.t === 'mode' && typeof msg.v === 'string') {
            this.applyMode(msg.v, false);
        }
        else if (msg.t === 'mute' || msg.t === 'media-state') {
            /* remote UI may react via mode / custom listeners */
        }
    }
    async addIce(c) {
        if (!this.pc.remoteDescription) {
            this.pendingIce.push(c);
            return;
        }
        try {
            await this.pc.addIceCandidate(c);
        }
        catch {
            /* transient */
        }
    }
    async drainIce() {
        const batch = this.pendingIce.splice(0);
        for (const c of batch) {
            try {
                await this.pc.addIceCandidate(c);
            }
            catch {
                /* skip */
            }
        }
    }
    applyMode(mode, broadcast) {
        if (this.mode === mode)
            return;
        this.mode = mode;
        const videoTrack = this.videoTransceiver?.sender.track;
        if (videoTrack)
            videoTrack.enabled = mode === 'pixel';
        if (broadcast)
            this.sendControl({ t: 'mode', v: mode, ts: Date.now() });
        this.modeCbs.forEach((cb) => cb(mode));
    }
    sendExternal(msg) {
        if (!this.signaling?.isOpen)
            return;
        const raw = JSON.stringify(msg);
        this.log('sent', 'external-signaling', msg.t, raw.length, `Sent ${msg.t} via disposable signaling`);
        void this.signaling.send(raw);
    }
    sendControl(msg) {
        if (!this.controlChannel || this.controlChannel.readyState !== 'open')
            return;
        const raw = JSON.stringify(msg);
        this.log('sent', 'in-band-datachannel', msg.t, raw.length, `P2P in-band sent ${msg.t}`);
        try {
            this.controlChannel.send(raw);
        }
        catch {
            /* closing */
        }
    }
    log(direction, channel, type, bytes, summary) {
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
    destroy() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.networkMonitor.destroy();
        this.disposeExternalSignaling();
        try {
            this.controlChannel?.close();
            this.telemetryChannel?.close();
            this.pc.close();
        }
        catch {
            /* already closed */
        }
        this.disconnectCbs.forEach((cb) => cb());
        this.onClosed();
    }
}
//# sourceMappingURL=CallSession.js.map