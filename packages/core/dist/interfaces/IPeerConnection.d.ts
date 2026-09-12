/**
 * Thin WebRTC surface so Phase 2 (Flutter/Dart FFI / C++ bindings) can swap
 * the browser RTCPeerConnection without touching CallSession business logic.
 */
export interface IceServerConfig {
    urls: string | string[];
    username?: string;
    credential?: string;
}
export interface PeerConnectionConfig {
    iceServers?: IceServerConfig[];
    iceCandidatePoolSize?: number;
    bundlePolicy?: 'balanced' | 'max-compat' | 'max-bundle';
}
export type SignalingState = 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer' | 'closed';
export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
export interface SessionDescriptionInit {
    type: 'offer' | 'answer' | 'pranswer' | 'rollback';
    sdp?: string;
}
export interface IceCandidateInit {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
}
export interface TransceiverInit {
    direction?: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';
    streams?: MediaStream[];
}
export interface DataChannelInit {
    ordered?: boolean;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    protocol?: string;
    negotiated?: boolean;
    id?: number;
}
/**
 * Minimal peer-connection contract used by CallSession.
 * Browser implementation wraps RTCPeerConnection; native wraps libwebrtc.
 */
export interface IPeerConnection {
    readonly signalingState: SignalingState;
    readonly connectionState: ConnectionState;
    readonly localDescription: SessionDescriptionInit | null;
    readonly remoteDescription: SessionDescriptionInit | null;
    addTransceiver(trackOrKind: MediaStreamTrack | string, init?: TransceiverInit): RTCRtpTransceiver;
    createDataChannel(label: string, init?: DataChannelInit): RTCDataChannel;
    createOffer(options?: RTCOfferOptions): Promise<SessionDescriptionInit>;
    createAnswer(options?: RTCAnswerOptions): Promise<SessionDescriptionInit>;
    setLocalDescription(desc: SessionDescriptionInit): Promise<void>;
    setRemoteDescription(desc: SessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate: IceCandidateInit | null): Promise<void>;
    getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;
    getSenders(): RTCRtpSender[];
    getReceivers(): RTCRtpReceiver[];
    getTransceivers(): RTCRtpTransceiver[];
    close(): void;
    onicecandidate: ((ev: {
        candidate: RTCIceCandidate | null;
    }) => void) | null;
    ontrack: ((ev: RTCTrackEvent) => void) | null;
    ondatachannel: ((ev: RTCDataChannelEvent) => void) | null;
    onconnectionstatechange: (() => void) | null;
    onsignalingstatechange: (() => void) | null;
}
export interface IPeerConnectionFactory {
    create(config?: PeerConnectionConfig): IPeerConnection;
}
/** Default browser factory — swap for Flutter FFI in Phase 2. */
export declare class BrowserPeerConnectionFactory implements IPeerConnectionFactory {
    create(config?: PeerConnectionConfig): IPeerConnection;
}
//# sourceMappingURL=IPeerConnection.d.ts.map