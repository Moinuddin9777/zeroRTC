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
import type { IPeerConnectionFactory, IceServerConfig } from './interfaces/IPeerConnection';
import type { ISignalingChannel } from './interfaces/ISignalingChannel';
import { NetworkMonitor } from './NetworkMonitor';
import type { ControlMessageType, NetworkStats, RTCMode, SignalEventLog } from './types';
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
export declare class CallSession {
    readonly remotePeerId: string;
    readonly localPeerId: string;
    private readonly isInitiator;
    private readonly polite;
    private readonly pc;
    private signaling;
    private controlChannel;
    private telemetryChannel;
    private localStream;
    private remoteStream;
    private readonly networkMonitor;
    private readonly pendingIce;
    private makingOffer;
    private ignoreOffer;
    private disposed;
    private controlOpen;
    private audioTransceiver;
    private videoTransceiver;
    mode: RTCMode;
    private readonly remoteStreamCbs;
    private readonly disconnectCbs;
    private readonly modeCbs;
    private readonly healthCbs;
    private readonly telemetryCbs;
    private readonly blendshapeCbs;
    private readonly onLog;
    private readonly onClosed;
    private unsubSignal;
    constructor(opts: CallSessionOptions);
    get isControlChannelOpen(): boolean;
    get networkMonitorRef(): NetworkMonitor;
    /** Public API aliases matching the demo UI contract. */
    onRemoteStream(cb: (stream: MediaStream) => void): void;
    onDisconnect(cb: () => void): void;
    onModeChange(cb: (mode: RTCMode) => void): void;
    onNetworkHealth(cb: (stats: NetworkStats) => void): void;
    onTelemetry(cb: (buf: ArrayBuffer) => void): void;
    onBlendshapesReceived(cb: (blendshapes: Float32Array) => void): void;
    setMode(mode: RTCMode): void;
    sendInBandControl(type: ControlMessageType, data?: Record<string, unknown>): void;
    /** Expose the telemetry DataChannel for @zerortc/telemetry attachment. */
    getTelemetryChannel(): RTCDataChannel | null;
    getConnection(): RTCPeerConnection;
    getVideoSender(): RTCRtpSender | null;
    /** Mute/unmute without renegotiation — transceiver dominance. */
    setTrackEnabled(kind: 'audio' | 'video', enabled: boolean): void;
    swapCamera(newTrack: MediaStreamTrack): Promise<void>;
    hangup(): void;
    /** Initiator entry — create & send offer over external signaling. */
    startAsOfferer(): Promise<void>;
    private attachTransceivers;
    private createOutboundChannels;
    private wirePeerConnection;
    private bindExternalSignaling;
    private bindControl;
    private bindTelemetry;
    /**
     * Disposable Signaling: tear down external transport the instant
     * the in-band control channel is live. Subsequent ICE / control
     * never touches the mesh/WS/QR path again.
     */
    private disposeExternalSignaling;
    private createAndSendOffer;
    private handleExternal;
    private onRemoteOffer;
    private onRemoteAnswer;
    private handleControl;
    private addIce;
    private drainIce;
    private applyMode;
    private sendExternal;
    private sendControl;
    private log;
    private destroy;
}
//# sourceMappingURL=CallSession.d.ts.map