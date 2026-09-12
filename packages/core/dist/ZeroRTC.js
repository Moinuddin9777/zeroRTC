/**
 * ZeroRTC — core client. Owns peer sessions, glare resolution, and the
 * ISignalingChannelFactory injection point for mesh / app backends.
 */
import { CallSession } from './CallSession';
import { BrowserPeerConnectionFactory, } from './interfaces/IPeerConnection';
export class ZeroRTC {
    localPeerId;
    signalingFactory;
    peerFactory;
    iceServers;
    statsIntervalMs;
    sessions = new Map();
    incomingHandler = null;
    logListeners = new Set();
    signalLogs = [];
    channels = new Map();
    /** Buffered offers awaiting answer() — survives until CallSession binds. */
    bufferedOffers = new Map();
    /** Early ICE/answer lines before CallSession.onMessage is bound. */
    earlySignals = new Map();
    disposed = false;
    constructor(options) {
        this.localPeerId = options.localPeerId;
        this.signalingFactory = options.signaling;
        this.peerFactory = options.peerFactory ?? new BrowserPeerConnectionFactory();
        this.iceServers = options.iceServers ?? [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
        ];
        this.statsIntervalMs = options.statsIntervalMs ?? 800;
    }
    onIncoming(cb) {
        this.incomingHandler = cb;
    }
    onSignalLog(cb) {
        this.logListeners.add(cb);
        return () => this.logListeners.delete(cb);
    }
    getSignalLogs() {
        return [...this.signalLogs];
    }
    /**
     * Host demux entry — feed every inbound signaling string here when using
     * a shared bus. Mesh adapters (BLE/QR) typically call channel.send/onMessage
     * directly and do not need this method.
     */
    async receiveSignal(fromPeerId, raw) {
        if (this.disposed)
            return;
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
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
            if (q.length > 64)
                q.shift();
            this.earlySignals.set(fromPeerId, q);
            this.ensureChannel(fromPeerId);
        }
    }
    async call(targetId, localStream) {
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
                for (const line of early)
                    channel._inject?.(line);
            });
        }
        await session.startAsOfferer();
        return session;
    }
    destroy() {
        this.disposed = true;
        for (const s of [...this.sessions.values()])
            s.hangup();
        this.sessions.clear();
        for (const ch of this.channels.values())
            ch.dispose();
        this.channels.clear();
        this.bufferedOffers.clear();
        this.logListeners.clear();
    }
    // ─── private ─────────────────────────────────────────────────
    ensureChannel(remotePeerId) {
        let ch = this.channels.get(remotePeerId);
        if (ch?.isOpen)
            return ch;
        const base = this.signalingFactory.create(remotePeerId);
        const handlers = new Set();
        const origOnMessage = base.onMessage.bind(base);
        const wrapped = {
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
            _inject: (m) => {
                handlers.forEach((h) => h(m));
            },
        };
        this.channels.set(remotePeerId, wrapped);
        return wrapped;
    }
    emitIncoming(fromPeerId, offerRaw) {
        if (!this.incomingHandler)
            return;
        let settled = false;
        const req = {
            callerId: fromPeerId,
            answer: async (localStream) => {
                if (settled)
                    return this.sessions.get(fromPeerId);
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
                    for (const line of early)
                        channel._inject?.(line);
                });
                return session;
            },
            reject: () => {
                if (settled)
                    return;
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
    closeSession(peerId) {
        const existing = this.sessions.get(peerId);
        if (existing) {
            existing.hangup();
            this.sessions.delete(peerId);
        }
    }
    recordLog(log) {
        this.signalLogs.unshift(log);
        if (this.signalLogs.length > 80)
            this.signalLogs.pop();
        this.logListeners.forEach((fn) => fn(log));
    }
}
//# sourceMappingURL=ZeroRTC.js.map