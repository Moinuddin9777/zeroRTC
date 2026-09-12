/**
 * Deterministic BLE MTU chunking / reassembly.
 *
 * Wire format (little-endian header + UTF-8 payload slice):
 *   [msgId:u16][chunkIndex:u16][totalChunks:u16][payload...]
 *
 * Header = 6 bytes. With a 512-byte ATT MTU and 3-byte ATT overhead,
 * safe payload per chunk ≈ 512 - 3 - 6 = 503 bytes (configurable).
 *
 * SDPs are 2–5 KB → typically 5–10 chunks. Reassembly is O(n) and
 * allocates exactly once when the final chunk arrives.
 */
export declare const BLE_CHUNK_HEADER_BYTES = 6;
export interface ChunkCodecOptions {
    /** Max bytes available for the full ATT write (header + payload). Default 509. */
    mtuPayloadBytes?: number;
}
export interface AssembledMessage {
    msgId: number;
    text: string;
}
export declare class ChunkEncoder {
    private readonly maxPayload;
    private nextMsgId;
    constructor(options?: ChunkCodecOptions);
    /** Split a UTF-8 string into MTU-safe ArrayBuffers. */
    encode(text: string): ArrayBuffer[];
}
/**
 * Stateful reassembler. Feed every GATT notification; get complete
 * strings back when all chunks for a msgId have arrived.
 */
export declare class ChunkDecoder {
    private readonly pending;
    private readonly maxPending;
    constructor(maxPendingMessages?: number);
    /**
     * @returns Assembled UTF-8 string, or null if more chunks are needed.
     */
    push(buffer: ArrayBuffer | ArrayBufferView): string | null;
    /** Drop incomplete messages (call on disconnect). */
    reset(): void;
    get pendingCount(): number;
}
/**
 * Convenience: encode → iterate chunks with an async writer (GATT write).
 */
export declare function sendChunked(text: string, write: (chunk: ArrayBuffer) => Promise<void> | void, options?: ChunkCodecOptions): Promise<number>;
//# sourceMappingURL=chunking.d.ts.map