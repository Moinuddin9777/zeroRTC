/**
 * NetworkMonitor — polls getStats() and emits quality tiers.
 * Events: 'good' | 'poor' | 'critical' (+ 'stats' for UI telemetry).
 *
 * Thresholds (defaults):
 *   critical: loss > 15% OR bitrate < 100 kbps
 *   poor:     loss > 5%  OR bitrate < 500 kbps
 *   good:     otherwise
 *
 * Recovery from critical requires `recoveryHoldMs` of continuous healthy stats.
 */

import type { IPeerConnection } from './interfaces/IPeerConnection';
import type { NetworkQuality, NetworkStats, RTCMode } from './types';

export type NetworkEventType = 'good' | 'poor' | 'critical' | 'stats' | 'recovered';

export interface NetworkMonitorOptions {
  intervalMs?: number;
  criticalLossThreshold?: number;
  criticalBandwidthKbps?: number;
  poorLossThreshold?: number;
  poorBandwidthKbps?: number;
  recoveryHoldMs?: number;
}

type Listener = (payload?: NetworkStats) => void;

export class NetworkMonitor {
  private pc: IPeerConnection | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private quality: NetworkQuality = 'good';
  private healthySince: number | null = null;
  private prevBytes = 0;
  private prevTs = 0;

  private simulatedLoss: number | null = null;
  private simulatedBw: number | null = null;

  private readonly listeners = new Map<NetworkEventType, Set<Listener>>([
    ['good', new Set()],
    ['poor', new Set()],
    ['critical', new Set()],
    ['stats', new Set()],
    ['recovered', new Set()],
  ]);

  private readonly intervalMs: number;
  private readonly criticalLoss: number;
  private readonly criticalBw: number;
  private readonly poorLoss: number;
  private readonly poorBw: number;
  private readonly recoveryHoldMs: number;

  constructor(options: NetworkMonitorOptions = {}) {
    this.intervalMs = options.intervalMs ?? 800;
    this.criticalLoss = options.criticalLossThreshold ?? 0.15;
    this.criticalBw = options.criticalBandwidthKbps ?? 100;
    this.poorLoss = options.poorLossThreshold ?? 0.05;
    this.poorBw = options.poorBandwidthKbps ?? 500;
    this.recoveryHoldMs = options.recoveryHoldMs ?? 5000;
  }

  attach(pc: IPeerConnection): void {
    this.detach();
    this.pc = pc;
    this.prevBytes = 0;
    this.prevTs = performance.now();
    this.healthySince = null;
    this.quality = 'good';
    this.timer = setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  detach(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.pc = null;
  }

  on(event: NetworkEventType, cb: Listener): () => void {
    this.listeners.get(event)?.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  /** Chaos injection for the demo workbench. */
  setSimulation(lossFraction: number | null, bandwidthKbps: number | null): void {
    this.simulatedLoss = lossFraction;
    this.simulatedBw = bandwidthKbps;
  }

  getQuality(): NetworkQuality {
    return this.quality;
  }

  async poll(): Promise<NetworkStats | null> {
    if (!this.pc || this.pc.connectionState === 'closed') return null;

    const now = performance.now();
    let fractionLost = 0;
    let packetsLost = 0;
    let jitter = 0;
    let framesDropped = 0;
    let currentBytes = 0;
    let rttMs = 24;

    try {
      const report = await this.pc.getStats();
      report.forEach((row) => {
        if (row.type === 'inbound-rtp') {
          const r = row as RTCInboundRtpStreamStats & {
            fractionLost?: number;
            framesDropped?: number;
          };
          if (typeof r.fractionLost === 'number') fractionLost = Math.max(fractionLost, r.fractionLost);
          if (typeof r.packetsLost === 'number') packetsLost += r.packetsLost;
          if (typeof r.jitter === 'number') jitter = Math.max(jitter, r.jitter * 1000);
          if (typeof r.bytesReceived === 'number') currentBytes += r.bytesReceived;
          if (typeof r.framesDropped === 'number') framesDropped += r.framesDropped;
        }
        if (row.type === 'candidate-pair' && (row as RTCIceCandidatePairStats).state === 'succeeded') {
          const pair = row as RTCIceCandidatePairStats;
          if (typeof pair.currentRoundTripTime === 'number') {
            rttMs = Math.round(pair.currentRoundTripTime * 1000);
          }
        }
      });
    } catch {
      /* transient */
    }

    const elapsed = Math.max(0.1, (now - this.prevTs) / 1000);
    let bitrateKbps = Math.round(((currentBytes - this.prevBytes) * 8) / (elapsed * 1000));
    if (bitrateKbps < 0 || this.prevBytes === 0) bitrateKbps = 1800;
    this.prevBytes = currentBytes;
    this.prevTs = now;

    if (this.simulatedLoss !== null) {
      fractionLost = this.simulatedLoss;
      packetsLost = Math.round(fractionLost * 100);
    }
    if (this.simulatedBw !== null) bitrateKbps = this.simulatedBw;

    const next = this.classify(fractionLost, bitrateKbps);
    this.transition(next, now);

    const mode: RTCMode = this.quality === 'critical' ? 'semantic' : 'pixel';
    const stats: NetworkStats = {
      timestamp: Date.now(),
      fractionLost,
      packetsLost,
      jitter: Math.round(jitter),
      bitrateKbps: Math.max(1, bitrateKbps),
      framesDropped,
      rttMs,
      quality: this.quality,
      isCritical: this.quality === 'critical',
      mode,
    };

    this.emit('stats', stats);
    return stats;
  }

  private classify(loss: number, bw: number): NetworkQuality {
    if (loss > this.criticalLoss || bw < this.criticalBw) return 'critical';
    if (loss > this.poorLoss || bw < this.poorBw) return 'poor';
    return 'good';
  }

  private transition(next: NetworkQuality, now: number): void {
    if (next === 'critical') {
      this.healthySince = null;
      if (this.quality !== 'critical') {
        this.quality = 'critical';
        this.emit('critical');
      }
      return;
    }

    if (this.quality === 'critical') {
      if (this.healthySince === null) this.healthySince = now;
      else if (now - this.healthySince >= this.recoveryHoldMs) {
        this.quality = next;
        this.healthySince = null;
        this.emit('recovered');
        this.emit(next);
      }
      return;
    }

    if (this.quality !== next) {
      this.quality = next;
      this.emit(next);
    }
  }

  private emit(event: NetworkEventType, data?: NetworkStats): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error(`[NetworkMonitor] ${event} listener error:`, err);
      }
    });
  }

  destroy(): void {
    this.detach();
    this.listeners.forEach((set) => set.clear());
  }
}
