/**
 * Built-in extractors — no MediaPipe dependency.
 * Swap via TelemetryEngine.setExtractor() for production ML.
 */
import type { ITelemetryExtractor, TelemetryFrame } from './interfaces/ITelemetryExtractor';
/** 33-landmark BlazePose topology (synthetic motion for demos). */
export declare const POSE_LANDMARK_COUNT = 33;
export declare class SyntheticPoseExtractor implements ITelemetryExtractor {
    readonly landmarkCount = 33;
    readonly metricKeys: readonly ["squatReps", "kneeAngle", "cadence"];
    private reps;
    private lastPhase;
    private t0;
    extract(_source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): TelemetryFrame;
    dispose(): void;
}
/**
 * Adapts the existing CarmackNeuralEngine blendshape extractor
 * into the ITelemetryExtractor contract (16 floats as pseudo-landmarks).
 */
export declare class BlendshapeTelemetryAdapter implements ITelemetryExtractor {
    private readonly extractBlendshapes;
    readonly landmarkCount = 16;
    readonly metricKeys: readonly ["speakingEnergy", "jawOpen"];
    constructor(extractBlendshapes: (el: HTMLVideoElement | HTMLCanvasElement) => Float32Array);
    extract(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): TelemetryFrame | null;
}
//# sourceMappingURL=extractors.d.ts.map