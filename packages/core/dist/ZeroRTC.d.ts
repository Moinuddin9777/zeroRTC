/**
 * ZeroRTC — core client. Owns peer sessions, glare resolution, and the
 * ISignalingChannelFactory injection point for mesh / app backends.
 */
import { CallSession } from './CallSession';
import type { CallRequest, SignalEventLog, ZeroRTCOptions } from './types';
export declare class ZeroRTC {
    readonly localPeerId: string;
    private readonly signalingFactory;
    private readonly peerFactory;
    private readonly iceServers;
    private readonly statsIntervalMs;
    private readonly sessions;
    private incomingHandler;
    private readonly logListeners;
    private readonly signalLogs;
    private readonly channels;
    /** Buffered offers awaiting answer() — survives until CallSession binds. */
    private readonly bufferedOffers;
    /** Early ICE/answer lines before CallSession.onMessage is bound. */
    private readonly earlySignals;
    private disposed;
    constructor(options: ZeroRTCOptions);
    onIncoming(cb: (req: CallRequest) => void): void;
    onSignalLog(cb: (log: SignalEventLog) => void): () => void;
    getSignalLogs(): SignalEventLog[];
    /**
     * Host demux entry — feed every inbound signaling string here when using
     * a shared bus. Mesh adapters (BLE/QR) typically call channel.send/onMessage
     * directly and do not need this method.
     */
    receiveSignal(fromPeerId: string, raw: string): Promise<void>;
    call(targetId: string, localStream?: MediaStream): Promise<CallSession>;
    destroy(): void;
    private ensureChannel;
    private emitIncoming;
    private closeSession;
    private recordLog;
}
//# sourceMappingURL=ZeroRTC.d.ts.map