/**
 * TelemetryEngine — ties extractor → packer → DataChannel, and the
 * synchronized receiver that unpacks binary frames for the UI.
 *
 * Typical critical-network path:
 *   1. NetworkMonitor emits 'critical'
 *   2. engine.attach(session) + engine.start(videoEl)
 *   3. Video RTP paused; pose/biometric frames stream at < 2 kbps
 *   4. Peer engine.onPoseUpdate / onBiometricUpdate drive canvas / dashboard
 *   5. On 'recovered', engine.stop() restores pixel video
 */
import type { CallSession } from '@zerortc/core';
import type { BiometricMetrics, ITelemetryExtractor, Landmark3D } from './interfaces/ITelemetryExtractor';
export interface TelemetryEngineOptions {
    extractor: ITelemetryExtractor;
    /** Inference + send rate (default 15 Hz). */
    fps?: number;
    quantize?: boolean;
}
export declare class TelemetryEngine {
    private extractor;
    private channel;
    private interceptor;
    private seq;
    private readonly fps;
    private readonly quantize;
    private readonly poseListeners;
    private readonly biometricListeners;
    private unsubChannel;
    private metricKeys;
    constructor(options: TelemetryEngineOptions);
    /** Swap ML backend at runtime (MediaPipe → custom model, etc.). */
    setExtractor(extractor: ITelemetryExtractor): void;
    /**
     * Bind to a live CallSession — uses the 'telemetry' DataChannel.
     * Also registers the binary receive path.
     */
    attach(session: CallSession): void;
    /** Attach directly to a DataChannel (tests / custom wiring). */
    attachChannel(channel: RTCDataChannel): void;
    /**
     * Start intercepting video + streaming packed telemetry.
     * Call when network quality drops to critical.
     */
    start(video: HTMLVideoElement, videoSender: RTCRtpSender | null): void;
    stop(): void;
    onPoseUpdate(cb: (landmarks: Landmark3D[], raw: Float32Array) => void): () => void;
    onBiometricUpdate(cb: (metrics: BiometricMetrics) => void): () => void;
    detach(): void;
    dispose(): void;
    get isStreaming(): boolean;
    private onLocalFrame;
    private handleInbound;
    private emitUnpacked;
}
//# sourceMappingURL=TelemetryEngine.d.ts.map