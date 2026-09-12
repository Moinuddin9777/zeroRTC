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
export declare const TELEMETRY_MAGIC = 23124;
export declare const TELEMETRY_VERSION = 1;
export interface PackOptions {
    /** Quantize landmarks to Int8 (default true — ~4× smaller than f32). */
    quantize?: boolean;
    seq?: number;
}
export interface UnpackedTelemetry {
    landmarks: Float32Array;
    metrics: Float32Array | null;
    landmarkCount: number;
    seq: number;
    quantized: boolean;
}
export declare class TelemetryPacker {
    static pack(landmarks: Float32Array, metrics?: Float32Array | null, options?: PackOptions): ArrayBuffer;
    static unpack(buffer: ArrayBuffer | ArrayBufferView): UnpackedTelemetry | null;
    static estimateKbps(bytesPerFrame: number, hz: number): number;
}
export declare function packMetricsOnly(metrics: Float32Array, seq?: number): ArrayBuffer;
//# sourceMappingURL=TelemetryPacker.d.ts.map