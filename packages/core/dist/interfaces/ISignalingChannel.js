/**
 * Platform-agnostic signaling transport.
 * Web: WebSocket / BLE / QR / BroadcastChannel adapters.
 * Flutter/Native: Dart FFI channel or C++ binding that implements the same contract.
 *
 * Disposable Signaling contract:
 * - Used ONLY for the initial SDP/ICE handshake.
 * - The moment the in-band RTCDataChannel opens, callers MUST dispose this channel.
 */
export {};
//# sourceMappingURL=ISignalingChannel.js.map