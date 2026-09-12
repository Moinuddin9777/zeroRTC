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

export class VideoInterceptor {
  private raf: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private previousEnabled: boolean | null = null;

  constructor(private readonly opts: VideoInterceptorOptions) {
    this.intervalMs = Math.max(33, Math.round(1000 / (opts.fps ?? 15)));
  }

  /** Disable RTP video sender + start sampling local preview frames. */
  start(): void {
    if (this.running) return;
    this.running = true;

    const track = this.opts.videoSender?.track;
    if (track) {
      this.previousEnabled = track.enabled;
      track.enabled = false;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  /** Restore RTP video track and stop sampling. */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }

    const track = this.opts.videoSender?.track;
    if (track && this.previousEnabled !== null) {
      track.enabled = this.previousEnabled;
      this.previousEnabled = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  private async tick(): Promise<void> {
    const v = this.opts.video;
    if (!v || v.readyState < 2) return;
    try {
      await this.opts.onFrame(v);
    } catch (err) {
      console.warn('[VideoInterceptor] frame hook error:', err);
    }
  }
}
