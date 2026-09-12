/**
 * QRSignaling — compress SDP with gzip + Base64 for QR exchange.
 *
 * Flow:
 *  1. Offerer: session creates offer → QRSignaling.send(sdpJson) → render QR
 *  2. Answerer: scan QR → QRSignaling.ingestScanned(code) → feeds onMessage
 *  3. Answerer encodes answer as QR → offerer scans → handshake complete
 *  4. ICE trickle may need a second QR round-trip or fall back to BLE/LAN;
 *     once the control DataChannel opens, QR transport is disposed.
 */
export class QRSignaling {
    opts;
    open = true;
    handlers = new Set();
    closeHandlers = new Set();
    constructor(opts) {
        this.opts = opts;
    }
    get isOpen() {
        return this.open;
    }
    async send(message) {
        if (!this.open)
            return;
        const compressed = await compressToBase64(message);
        this.opts.onQRCode?.(compressed, {
            peerId: this.opts.localPeerId,
            bytes: message.length,
            compressed: compressed.length,
        });
    }
    /**
     * Feed a scanned QR string (gzip/Base64). Decompresses and emits onMessage.
     */
    async ingestScanned(base64Payload) {
        if (!this.open)
            return;
        const text = await decompressFromBase64(base64Payload);
        this.handlers.forEach((h) => h(text));
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    onClose(handler) {
        this.closeHandlers.add(handler);
        return () => this.closeHandlers.delete(handler);
    }
    dispose() {
        if (!this.open)
            return;
        this.open = false;
        this.handlers.clear();
        this.closeHandlers.forEach((h) => h());
        this.closeHandlers.clear();
    }
}
export class QRSignalingFactory {
    localPeerId;
    onQRCode;
    channels = new Map();
    constructor(localPeerId, onQRCode) {
        this.localPeerId = localPeerId;
        this.onQRCode = onQRCode;
    }
    create(remotePeerId) {
        const ch = new QRSignaling({
            localPeerId: this.localPeerId,
            remotePeerId,
            onQRCode: this.onQRCode,
        });
        this.channels.set(remotePeerId, ch);
        return ch;
    }
    /** Look up channel to push a scanned code into. */
    get(remotePeerId) {
        return this.channels.get(remotePeerId);
    }
}
/* ─── gzip / base64 helpers (CompressionStream when available) ─── */
export async function compressToBase64(text) {
    const input = new TextEncoder().encode(text);
    if (typeof CompressionStream !== 'undefined') {
        const cs = new CompressionStream('gzip');
        const stream = new Blob([input]).stream().pipeThrough(cs);
        const buf = await new Response(stream).arrayBuffer();
        return bytesToBase64(new Uint8Array(buf));
    }
    // Fallback: raw base64 (larger QR — still functional)
    return bytesToBase64(input);
}
export async function decompressFromBase64(b64) {
    const bytes = base64ToBytes(b64);
    if (typeof DecompressionStream !== 'undefined') {
        try {
            const ds = new DecompressionStream('gzip');
            const stream = new Blob([bytes]).stream().pipeThrough(ds);
            return await new Response(stream).text();
        }
        catch {
            // Not gzip — treat as raw UTF-8
        }
    }
    return new TextDecoder().decode(bytes);
}
function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
function base64ToBytes(b64) {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        out[i] = binary.charCodeAt(i);
    return out;
}
//# sourceMappingURL=QRSignaling.js.map