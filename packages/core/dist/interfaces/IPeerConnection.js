/**
 * Thin WebRTC surface so Phase 2 (Flutter/Dart FFI / C++ bindings) can swap
 * the browser RTCPeerConnection without touching CallSession business logic.
 */
/** Default browser factory — swap for Flutter FFI in Phase 2. */
export class BrowserPeerConnectionFactory {
    create(config) {
        return new RTCPeerConnection({
            iceServers: config?.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
            iceCandidatePoolSize: config?.iceCandidatePoolSize ?? 2,
            bundlePolicy: config?.bundlePolicy ?? 'max-bundle',
        });
    }
}
//# sourceMappingURL=IPeerConnection.js.map