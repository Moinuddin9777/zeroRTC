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
import type { NetworkQuality, NetworkStats } from './types';
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
export declare class NetworkMonitor {
    private pc;
    private timer;
    private quality;
    private healthySince;
    private prevBytes;
    private prevTs;
    private simulatedLoss;
    private simulatedBw;
    private readonly listeners;
    private readonly intervalMs;
    private readonly criticalLoss;
    private readonly criticalBw;
    private readonly poorLoss;
    private readonly poorBw;
    private readonly recoveryHoldMs;
    constructor(options?: NetworkMonitorOptions);
    attach(pc: IPeerConnection): void;
    detach(): void;
    on(event: NetworkEventType, cb: Listener): () => void;
    /** Chaos injection for the demo workbench. */
    setSimulation(lossFraction: number | null, bandwidthKbps: number | null): void;
    getQuality(): NetworkQuality;
    poll(): Promise<NetworkStats | null>;
    private classify;
    private transition;
    private emit;
    destroy(): void;
}
export {};
//# sourceMappingURL=NetworkMonitor.d.ts.map