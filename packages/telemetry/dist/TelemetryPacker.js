/**
 * TelemetryPacker — quantize ML float arrays into a tight binary buffer.
 *
 * Wire layout (little-endian, 10-byte header):
 *   magic:u16 = 0x5A54 ("ZT")
 *   version:u8 = 1
 *   flags:u8   bit0 = hasMetrics, bit1 = int8 landmarks
 *   landmarkCount:u16
 *   seq:u16
 *   metricCount:u8
 *   pad:u8
 *   landmarks: int8[n*3]  OR  float32[n*3]
 *   metrics?:  float32[m]
 *
 * 33 landmarks × int8 × 3 = 99 B + 10 B header ≈ 109 B/frame.
 * At 15 Hz ≈ 1.6 kbps — under the 2 kbps budget with Opus audio intact.
 */
export const TELEMETRY_MAGIC = 0x5a54;
export const TELEMETRY_VERSION = 1;
const HDR = 10;
export class TelemetryPacker {
    static pack(landmarks, metrics, options = {}) {
        const quantize = options.quantize !== false;
        const landmarkCount = Math.floor(landmarks.length / 3);
        const metricCount = metrics?.length ?? 0;
        const seq = (options.seq ?? 0) & 0xffff;
        const landmarkBytes = quantize ? landmarkCount * 3 : landmarkCount * 12;
        const metricBytes = metricCount * 4;
        const buf = new ArrayBuffer(HDR + landmarkBytes + metricBytes);
        const view = new DataView(buf);
        view.setUint16(0, TELEMETRY_MAGIC, true);
        view.setUint8(2, TELEMETRY_VERSION);
        let flags = 0;
        if (metricCount > 0)
            flags |= 0b01;
        if (quantize)
            flags |= 0b10;
        view.setUint8(3, flags);
        view.setUint16(4, landmarkCount, true);
        view.setUint16(6, seq, true);
        view.setUint8(8, metricCount & 0xff);
        view.setUint8(9, 0);
        let offset = HDR;
        if (quantize) {
            const i8 = new Int8Array(buf, offset, landmarkCount * 3);
            for (let i = 0; i < landmarkCount * 3; i++) {
                const v = landmarks[i] ?? 0;
                i8[i] = Math.max(-127, Math.min(127, Math.round(v * 127)));
            }
            offset += landmarkCount * 3;
        }
        else {
            new Float32Array(buf, offset, landmarkCount * 3).set(landmarks.subarray(0, landmarkCount * 3));
            offset += landmarkCount * 12;
        }
        if (metrics && metricCount > 0) {
            new Float32Array(buf, offset, metricCount).set(metrics.subarray(0, metricCount));
        }
        return buf;
    }
    static unpack(buffer) {
        const bytes = buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer)
            : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        if (bytes.byteLength < HDR) {
            if (bytes.byteLength >= 4 && bytes.byteLength % 4 === 0) {
                return {
                    landmarks: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
                    metrics: null,
                    landmarkCount: Math.floor(bytes.byteLength / 12) || bytes.byteLength / 4,
                    seq: 0,
                    quantized: false,
                };
            }
            return null;
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (view.getUint16(0, true) !== TELEMETRY_MAGIC) {
            if (bytes.byteLength % 4 === 0) {
                return {
                    landmarks: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
                    metrics: null,
                    landmarkCount: Math.floor(bytes.byteLength / 12) || bytes.byteLength / 4,
                    seq: 0,
                    quantized: false,
                };
            }
            return null;
        }
        if (view.getUint8(2) !== TELEMETRY_VERSION)
            return null;
        const flags = view.getUint8(3);
        const hasMetrics = (flags & 0b01) !== 0;
        const quantized = (flags & 0b10) !== 0;
        const landmarkCount = view.getUint16(4, true);
        const seq = view.getUint16(6, true);
        const metricCount = hasMetrics ? view.getUint8(8) : 0;
        let offset = HDR;
        const landmarks = new Float32Array(landmarkCount * 3);
        if (quantized) {
            if (bytes.byteLength < offset + landmarkCount * 3)
                return null;
            const i8 = new Int8Array(bytes.buffer, bytes.byteOffset + offset, landmarkCount * 3);
            for (let i = 0; i < i8.length; i++)
                landmarks[i] = i8[i] / 127;
            offset += landmarkCount * 3;
        }
        else {
            if (bytes.byteLength < offset + landmarkCount * 12)
                return null;
            landmarks.set(new Float32Array(bytes.buffer, bytes.byteOffset + offset, landmarkCount * 3));
            offset += landmarkCount * 12;
        }
        let metrics = null;
        if (metricCount > 0) {
            if (bytes.byteLength < offset + metricCount * 4)
                return null;
            metrics = new Float32Array(bytes.buffer, bytes.byteOffset + offset, metricCount).slice();
        }
        return { landmarks, metrics, landmarkCount, seq, quantized };
    }
    static estimateKbps(bytesPerFrame, hz) {
        return (bytesPerFrame * 8 * hz) / 1000;
    }
}
export function packMetricsOnly(metrics, seq = 0) {
    return TelemetryPacker.pack(new Float32Array(0), metrics, { quantize: true, seq });
}
//# sourceMappingURL=TelemetryPacker.js.map