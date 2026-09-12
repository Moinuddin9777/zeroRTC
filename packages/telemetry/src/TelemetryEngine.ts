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
import { TelemetryPacker } from './TelemetryPacker';
import { VideoInterceptor } from './VideoInterceptor';

export interface TelemetryEngineOptions {
  extractor: ITelemetryExtractor;
  /** Inference + send rate (default 15 Hz). */
  fps?: number;
  quantize?: boolean;
}

export class TelemetryEngine {
  private extractor: ITelemetryExtractor;
  private channel: RTCDataChannel | null = null;
  private interceptor: VideoInterceptor | null = null;
  private seq = 0;
  private readonly fps: number;
  private readonly quantize: boolean;
  private readonly poseListeners = new Set<(landmarks: Landmark3D[], raw: Float32Array) => void>();
  private readonly biometricListeners = new Set<(metrics: BiometricMetrics) => void>();
  private unsubChannel: (() => void) | null = null;
  private metricKeys: readonly string[];

  constructor(options: TelemetryEngineOptions) {
    this.extractor = options.extractor;
    this.fps = options.fps ?? 15;
    this.quantize = options.quantize !== false;
    this.metricKeys = options.extractor.metricKeys ?? [];
  }

  /** Swap ML backend at runtime (MediaPipe → custom model, etc.). */
  setExtractor(extractor: ITelemetryExtractor): void {
    this.extractor.dispose?.();
    this.extractor = extractor;
    this.metricKeys = extractor.metricKeys ?? [];
  }

  /**
   * Bind to a live CallSession — uses the 'telemetry' DataChannel.
   * Also registers the binary receive path.
   */
  attach(session: CallSession): void {
    this.detach();
    this.channel = session.getTelemetryChannel();

    const onBuf = (buf: ArrayBuffer) => this.handleInbound(buf);
    session.onTelemetry(onBuf);

    // If channel not yet negotiated, poll briefly
    if (!this.channel) {
      const poll = setInterval(() => {
        this.channel = session.getTelemetryChannel();
        if (this.channel || session.getConnection().connectionState === 'closed') {
          clearInterval(poll);
        }
      }, 200);
    }
  }

  /** Attach directly to a DataChannel (tests / custom wiring). */
  attachChannel(channel: RTCDataChannel): void {
    this.detach();
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    const handler = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) this.handleInbound(ev.data);
    };
    channel.addEventListener('message', handler);
    this.unsubChannel = () => channel.removeEventListener('message', handler);
  }

  /**
   * Start intercepting video + streaming packed telemetry.
   * Call when network quality drops to critical.
   */
  start(video: HTMLVideoElement, videoSender: RTCRtpSender | null): void {
    this.stop();
    this.interceptor = new VideoInterceptor({
      video,
      videoSender,
      fps: this.fps,
      onFrame: (v) => this.onLocalFrame(v),
    });
    this.interceptor.start();
  }

  stop(): void {
    this.interceptor?.stop();
    this.interceptor = null;
  }

  onPoseUpdate(cb: (landmarks: Landmark3D[], raw: Float32Array) => void): () => void {
    this.poseListeners.add(cb);
    return () => this.poseListeners.delete(cb);
  }

  onBiometricUpdate(cb: (metrics: BiometricMetrics) => void): () => void {
    this.biometricListeners.add(cb);
    return () => this.biometricListeners.delete(cb);
  }

  detach(): void {
    this.stop();
    this.unsubChannel?.();
    this.unsubChannel = null;
    this.channel = null;
  }

  dispose(): void {
    this.detach();
    this.extractor.dispose?.();
    this.poseListeners.clear();
    this.biometricListeners.clear();
  }

  get isStreaming(): boolean {
    return this.interceptor?.isRunning ?? false;
  }

  // ─── private ─────────────────────────────────────────────────

  private async onLocalFrame(video: HTMLVideoElement): Promise<void> {
    const frame = await this.extractor.extract(video);
    if (!frame) return;

    const metricsArr =
      frame.metrics && this.metricKeys.length
        ? Float32Array.from(this.metricKeys.map((k) => frame.metrics![k] ?? 0))
        : frame.metrics
          ? Float32Array.from(Object.values(frame.metrics))
          : null;

    const packed = TelemetryPacker.pack(frame.landmarks, metricsArr, {
      quantize: this.quantize,
      seq: this.seq++ & 0xffff,
    });

    // Local mirror for UI
    this.emitUnpacked(TelemetryPacker.unpack(packed)!);

    if (this.channel?.readyState === 'open') {
      try {
        this.channel.send(packed);
      } catch {
        /* unordered channel — drop ok */
      }
    }
  }

  private handleInbound(buf: ArrayBuffer): void {
    const unpacked = TelemetryPacker.unpack(buf);
    if (!unpacked) return;
    this.emitUnpacked(unpacked);
  }

  private emitUnpacked(u: NonNullable<ReturnType<typeof TelemetryPacker.unpack>>): void {
    const landmarks: Landmark3D[] = [];
    for (let i = 0; i < u.landmarkCount; i++) {
      const o = i * 3;
      landmarks.push({
        x: u.landmarks[o]!,
        y: u.landmarks[o + 1]!,
        z: u.landmarks[o + 2]!,
      });
    }
    this.poseListeners.forEach((cb) => cb(landmarks, u.landmarks));

    if (u.metrics && u.metrics.length) {
      const metrics: BiometricMetrics = {};
      for (let i = 0; i < u.metrics.length; i++) {
        const key = this.metricKeys[i] ?? `m${i}`;
        metrics[key] = u.metrics[i]!;
      }
      this.biometricListeners.forEach((cb) => cb(metrics));
    }
  }
}
