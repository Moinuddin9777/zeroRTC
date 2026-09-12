/**
 * Built-in extractors — no MediaPipe dependency.
 * Swap via TelemetryEngine.setExtractor() for production ML.
 */
/** 33-landmark BlazePose topology (synthetic motion for demos). */
export const POSE_LANDMARK_COUNT = 33;
export class SyntheticPoseExtractor {
    landmarkCount = POSE_LANDMARK_COUNT;
    metricKeys = ['squatReps', 'kneeAngle', 'cadence'];
    reps = 0;
    lastPhase = 'up';
    t0 = performance.now();
    extract(_source) {
        const t = (performance.now() - this.t0) / 1000;
        const landmarks = new Float32Array(POSE_LANDMARK_COUNT * 3);
        // Procedural stick-figure squat cycle
        const squat = (Math.sin(t * 2.2) + 1) / 2; // 0..1
        const hipY = 0.45 + squat * 0.18;
        const kneeY = 0.65 + squat * 0.12;
        const skeleton = [
            [0.5, 0.12, 0], // nose
            [0.47, 0.1, 0], [0.53, 0.1, 0], // eyes
            [0.45, 0.11, 0], [0.55, 0.11, 0], // ears
            [0.4, 0.25, 0], [0.6, 0.25, 0], // shoulders
            [0.35, 0.4, 0], [0.65, 0.4, 0], // elbows
            [0.32, 0.55, 0], [0.68, 0.55, 0], // wrists
            [0.42, hipY, 0], [0.58, hipY, 0], // hips
            [0.42, kneeY, 0], [0.58, kneeY, 0], // knees
            [0.42, 0.92, 0], [0.58, 0.92, 0], // ankles
        ];
        for (let i = 0; i < POSE_LANDMARK_COUNT; i++) {
            const src = skeleton[Math.min(i, skeleton.length - 1)];
            const o = i * 3;
            landmarks[o] = src[0] + Math.sin(t + i) * 0.002;
            landmarks[o + 1] = src[1];
            landmarks[o + 2] = src[2];
        }
        // Rep counter: phase transition at bottom of squat
        const phase = squat > 0.7 ? 'down' : 'up';
        if (this.lastPhase === 'down' && phase === 'up')
            this.reps++;
        this.lastPhase = phase;
        const kneeAngle = 180 - squat * 90;
        return {
            landmarks,
            metrics: {
                squatReps: this.reps,
                kneeAngle,
                cadence: 2.2 / (2 * Math.PI) * 60,
            },
            timestampMs: performance.now(),
        };
    }
    dispose() {
        /* no-op */
    }
}
/**
 * Adapts the existing CarmackNeuralEngine blendshape extractor
 * into the ITelemetryExtractor contract (16 floats as pseudo-landmarks).
 */
export class BlendshapeTelemetryAdapter {
    extractBlendshapes;
    landmarkCount = 16;
    metricKeys = ['speakingEnergy', 'jawOpen'];
    constructor(extractBlendshapes) {
        this.extractBlendshapes = extractBlendshapes;
    }
    extract(source) {
        if (source instanceof ImageBitmap)
            return null;
        const blends = this.extractBlendshapes(source);
        // Pack each blendshape as (value, 0, 0) so packer landmark stride stays 3
        const landmarks = new Float32Array(blends.length * 3);
        for (let i = 0; i < blends.length; i++) {
            landmarks[i * 3] = blends[i];
        }
        return {
            landmarks,
            metrics: {
                speakingEnergy: blends[13] ?? 0,
                jawOpen: blends[0] ?? 0,
            },
            timestampMs: performance.now(),
        };
    }
}
//# sourceMappingURL=extractors.js.map