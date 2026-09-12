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
import type { ISignalingChannel, ISignalingChannelFactory } from '@zerortc/core';
export interface QRSignalingOptions {
    localPeerId: string;
    remotePeerId: string;
    /** Called whenever a new QR payload should be displayed. */
    onQRCode?: (base64Payload: string, meta: {
        peerId: string;
        bytes: number;
        compressed: number;
    }) => void;
}
export declare class QRSignaling implements ISignalingChannel {
    private readonly opts;
    private open;
    private readonly handlers;
    private readonly closeHandlers;
    constructor(opts: QRSignalingOptions);
    get isOpen(): boolean;
    send(message: string): Promise<void>;
    /**
     * Feed a scanned QR string (gzip/Base64). Decompresses and emits onMessage.
     */
    ingestScanned(base64Payload: string): Promise<void>;
    onMessage(handler: (message: string) => void): () => void;
    onClose(handler: () => void): () => void;
    dispose(): void;
}
export declare class QRSignalingFactory implements ISignalingChannelFactory {
    private readonly localPeerId;
    private readonly onQRCode?;
    private readonly channels;
    constructor(localPeerId: string, onQRCode?: QRSignalingOptions['onQRCode']);
    create(remotePeerId: string): ISignalingChannel;
    /** Look up channel to push a scanned code into. */
    get(remotePeerId: string): QRSignaling | undefined;
}
export declare function compressToBase64(text: string): Promise<string>;
export declare function decompressFromBase64(b64: string): Promise<string>;
//# sourceMappingURL=QRSignaling.d.ts.map