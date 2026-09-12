/**
 * VideoInterceptor — pause the outbound video RTP track to reclaim bandwidth,
 * while continuing to sample frames from an HTMLVideoElement for on-device ML.
 */
export interface VideoInterceptorOptions {
    video: HTMLVideoElement;
    /** RTCRtpSender whose track will be disabled (not stopped) during intercept. */
    videoSender: RTCRtpSender | null;
    /** Target inference FPS (default 15 — keeps telemetry under 2 kbps). */
    fps?: number;
    onFrame: (video: HTMLVideoElement) => void | Promise<void>;
}
export declare class VideoInterceptor {
    private readonly opts;
    private raf;
    private timer;
    private running;
    private readonly intervalMs;
    private previousEnabled;
    constructor(opts: VideoInterceptorOptions);
    /** Disable RTP video sender + start sampling local preview frames. */
    start(): void;
    /** Restore RTP video track and stop sampling. */
    stop(): void;
    get isRunning(): boolean;
    private tick;
}
//# sourceMappingURL=VideoInterceptor.d.ts.map