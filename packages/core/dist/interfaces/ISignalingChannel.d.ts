/**
 * Platform-agnostic signaling transport.
 * Web: WebSocket / BLE / QR / BroadcastChannel adapters.
 * Flutter/Native: Dart FFI channel or C++ binding that implements the same contract.
 *
 * Disposable Signaling contract:
 * - Used ONLY for the initial SDP/ICE handshake.
 * - The moment the in-band RTCDataChannel opens, callers MUST dispose this channel.
 */
export type SignalingMessage = string;
export interface ISignalingChannel {
    readonly isOpen: boolean;
    send(message: SignalingMessage): Promise<void> | void;
    onMessage(handler: (message: SignalingMessage) => void): () => void;
    onClose?(handler: () => void): () => void;
    /** Tear down external transport — no-op after first call. */
    dispose(): void;
}
/**
 * Factory that produces a per-peer signaling channel.
 * Keeps business logic free of transport specifics (BLE vs WS vs QR).
 */
export interface ISignalingChannelFactory {
    create(remotePeerId: string): ISignalingChannel;
}
//# sourceMappingURL=ISignalingChannel.d.ts.map