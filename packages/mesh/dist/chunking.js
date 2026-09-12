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
export const BLE_CHUNK_HEADER_BYTES = 6;
export class ChunkEncoder {
    maxPayload;
    nextMsgId = 1;
    constructor(options = {}) {
        const mtu = options.mtuPayloadBytes ?? 509;
        this.maxPayload = Math.max(16, mtu - BLE_CHUNK_HEADER_BYTES);
    }
    /** Split a UTF-8 string into MTU-safe ArrayBuffers. */
    encode(text) {
        const bytes = new TextEncoder().encode(text);
        const total = Math.max(1, Math.ceil(bytes.byteLength / this.maxPayload));
        const msgId = this.nextMsgId++ & 0xffff;
        const chunks = [];
        for (let i = 0; i < total; i++) {
            const start = i * this.maxPayload;
            const slice = bytes.subarray(start, start + this.maxPayload);
            const buf = new ArrayBuffer(BLE_CHUNK_HEADER_BYTES + slice.byteLength);
            const view = new DataView(buf);
            view.setUint16(0, msgId, true);
            view.setUint16(2, i, true);
            view.setUint16(4, total, true);
            new Uint8Array(buf, BLE_CHUNK_HEADER_BYTES).set(slice);
            chunks.push(buf);
        }
        return chunks;
    }
}
/**
 * Stateful reassembler. Feed every GATT notification; get complete
 * strings back when all chunks for a msgId have arrived.
 */
export class ChunkDecoder {
    pending = new Map();
    maxPending;
    constructor(maxPendingMessages = 8) {
        this.maxPending = maxPendingMessages;
    }
    /**
     * @returns Assembled UTF-8 string, or null if more chunks are needed.
     */
    push(buffer) {
        const bytes = buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer)
            : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        if (bytes.byteLength < BLE_CHUNK_HEADER_BYTES)
            return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const msgId = view.getUint16(0, true);
        const index = view.getUint16(2, true);
        const total = view.getUint16(4, true);
        const payload = bytes.subarray(BLE_CHUNK_HEADER_BYTES);
        if (total === 0 || index >= total)
            return null;
        let entry = this.pending.get(msgId);
        if (!entry) {
            if (this.pending.size >= this.maxPending) {
                // Evict oldest (first map key) — aggressive GC under BLE churn
                const oldest = this.pending.keys().next().value;
                if (oldest !== undefined)
                    this.pending.delete(oldest);
            }
            entry = {
                total,
                received: 0,
                parts: new Array(total),
                byteLength: 0,
            };
            this.pending.set(msgId, entry);
        }
        if (entry.parts[index])
            return null; // duplicate chunk — ignore
        entry.parts[index] = payload;
        entry.received++;
        entry.byteLength += payload.byteLength;
        if (entry.received < entry.total)
            return null;
        // Single allocation for the full payload
        const merged = new Uint8Array(entry.byteLength);
        let offset = 0;
        for (let i = 0; i < entry.total; i++) {
            const part = entry.parts[i];
            merged.set(part, offset);
            offset += part.byteLength;
        }
        this.pending.delete(msgId);
        return new TextDecoder().decode(merged);
    }
    /** Drop incomplete messages (call on disconnect). */
    reset() {
        this.pending.clear();
    }
    get pendingCount() {
        return this.pending.size;
    }
}
/**
 * Convenience: encode → iterate chunks with an async writer (GATT write).
 */
export async function sendChunked(text, write, options) {
    const chunks = new ChunkEncoder(options).encode(text);
    for (const chunk of chunks) {
        await write(chunk);
    }
    return chunks.length;
}
//# sourceMappingURL=chunking.js.map