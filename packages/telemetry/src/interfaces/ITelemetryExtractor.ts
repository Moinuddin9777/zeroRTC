/**
 * ML-agnostic extractor contract.
 * Inject MediaPipe Pose, a custom TFLite model, or a synthetic squat counter.
 * Phase 2 Flutter ports implement the same interface over Dart FFI.
 */

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface BiometricMetrics {
  /** e.g. squat reps, heart-rate proxy, cadence */
  [key: string]: number;
}

export interface TelemetryFrame {
  /** Flattened landmarks: [x0,y0,z0, x1,y1,z1, ...] typically 33*3 = 99 floats */
  landmarks: Float32Array;
  metrics?: BiometricMetrics;
  timestampMs: number;
}

export interface ITelemetryExtractor {
  /** Landmark count expected by the packer (e.g. 33 for BlazePose). */
  readonly landmarkCount: number;
  /** Optional metric keys streamed alongside landmarks. */
  readonly metricKeys?: readonly string[];

  /**
   * Run one inference tick against a video/canvas frame.
   * Return null to skip sending this frame (model not ready / low confidence).
   */
  extract(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<TelemetryFrame | null> | TelemetryFrame | null;

  /** Release model weights / WASM heap. */
  dispose?(): void;
}
