/**
 * Compatibility shims — demo UI imports from ./lib/* while the real
 * implementation lives in @zerortc/* packages.
 */

export type {
  RTCMode,
  NetworkStats,
  CallRequest,
  SignalEventLog,
  ControlMessageType as SignalType,
} from '@zerortc/core';

export type { CallSession } from '@zerortc/core';

/** Legacy SemanticCodecEngine interface kept for CarmackNeuralEngine. */
export interface SemanticCodecEngine {
  captureReferenceFrame(videoElement: HTMLVideoElement | HTMLCanvasElement): ImageData;
  extractBlendshapes(videoElement: HTMLVideoElement | HTMLCanvasElement): Float32Array;
  renderNeuralReconstruction(
    canvas: HTMLCanvasElement,
    blendshapes: Float32Array,
    referenceFrame: ImageData | null,
    options?: { showWireframe?: boolean; showTelemetry?: boolean }
  ): void;
}

export interface MicroRTCOptions {
  onSendSignal: (targetId: string, payload: string) => Promise<void> | void;
  iceServers?: RTCIceServer[];
  codecEngine?: SemanticCodecEngine;
  statsIntervalMs?: number;
  localPeerId?: string;
}
