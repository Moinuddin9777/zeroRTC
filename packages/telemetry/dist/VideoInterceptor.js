/**
 * VideoInterceptor — pause the outbound video RTP track to reclaim bandwidth,
 * while continuing to sample frames from an HTMLVideoElement for on-device ML.
 */
export class VideoInterceptor {
    opts;
    raf = null;
    timer = null;
    running = false;
    intervalMs;
    previousEnabled = null;
    constructor(opts) {
        this.opts = opts;
        this.intervalMs = Math.max(33, Math.round(1000 / (opts.fps ?? 15)));
    }
    /** Disable RTP video sender + start sampling local preview frames. */
    start() {
        if (this.running)
            return;
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
    stop() {
        if (!this.running)
            return;
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
    get isRunning() {
        return this.running;
    }
    async tick() {
        const v = this.opts.video;
        if (!v || v.readyState < 2)
            return;
        try {
            await this.opts.onFrame(v);
        }
        catch (err) {
            console.warn('[VideoInterceptor] frame hook error:', err);
        }
    }
}
//# sourceMappingURL=VideoInterceptor.js.map