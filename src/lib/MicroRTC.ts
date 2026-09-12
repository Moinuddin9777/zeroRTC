/**
 * MicroRTC compatibility facade over @zerortc/core.
 * Existing demo UI keeps importing MicroRTC; new code should use ZeroRTC directly.
 */

import {
  BusSignalingFactory,
  ZeroRTC,
  type CallRequest,
  type CallSession,
  type SignalEventLog,
} from '@zerortc/core';
import type { MicroRTCOptions, SemanticCodecEngine } from './types';
import { CarmackNeuralEngine } from './SemanticCodecEngine';

export type { SignalEventLog };

export class MicroRTC {
  private readonly rtc: ZeroRTC;
  private readonly busFactory: BusSignalingFactory;
  private readonly unregisterBus: (() => void) | null = null;
  readonly codecEngine: SemanticCodecEngine;

  constructor(options: MicroRTCOptions & {
    localPeerId: string;
    registerPeer: (peerId: string, handler: (from: string, payload: string) => void) => () => void;
  }) {
    this.codecEngine = options.codecEngine ?? new CarmackNeuralEngine();
    this.busFactory = new BusSignalingFactory({
      localPeerId: options.localPeerId,
      send: async (from, to, payload) => {
        await options.onSendSignal(to, payload);
        // onSendSignal in the demo is (target, payload) — from is implicit via closure
        void from;
      },
      register: options.registerPeer,
    });

    this.rtc = new ZeroRTC({
      localPeerId: options.localPeerId,
      signaling: this.busFactory,
      iceServers: options.iceServers,
      statsIntervalMs: options.statsIntervalMs,
    });
  }

  onIncoming(callback: (callRequest: CallRequest) => void): void {
    this.rtc.onIncoming(callback);
  }

  async receiveSignal(fromPeerId: string, rawPayload: string): Promise<void> {
    await this.rtc.receiveSignal(fromPeerId, rawPayload);
  }

  async call(targetId: string, localStream?: MediaStream): Promise<CallSession> {
    return this.rtc.call(targetId, localStream);
  }

  onSignalLog(cb: (log: SignalEventLog) => void): () => void {
    return this.rtc.onSignalLog(cb);
  }

  getSignalLogs(): SignalEventLog[] {
    return this.rtc.getSignalLogs();
  }

  /** Access the underlying ZeroRTC client for telemetry attachment. */
  get zeroRTC(): ZeroRTC {
    return this.rtc;
  }

  destroy(): void {
    this.rtc.destroy();
    this.busFactory.dispose();
    this.unregisterBus?.();
  }
}

export { ZeroRTC, BusSignalingFactory } from '@zerortc/core';
export type { CallSession } from '@zerortc/core';
