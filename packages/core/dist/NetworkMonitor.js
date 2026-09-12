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
export class NetworkMonitor {
    pc = null;
    timer = null;
    quality = 'good';
    healthySince = null;
    prevBytes = 0;
    prevTs = 0;
    simulatedLoss = null;
    simulatedBw = null;
    listeners = new Map([
        ['good', new Set()],
        ['poor', new Set()],
        ['critical', new Set()],
        ['stats', new Set()],
        ['recovered', new Set()],
    ]);
    intervalMs;
    criticalLoss;
    criticalBw;
    poorLoss;
    poorBw;
    recoveryHoldMs;
    constructor(options = {}) {
        this.intervalMs = options.intervalMs ?? 800;
        this.criticalLoss = options.criticalLossThreshold ?? 0.15;
        this.criticalBw = options.criticalBandwidthKbps ?? 100;
        this.poorLoss = options.poorLossThreshold ?? 0.05;
        this.poorBw = options.poorBandwidthKbps ?? 500;
        this.recoveryHoldMs = options.recoveryHoldMs ?? 5000;
    }
    attach(pc) {
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
    detach() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.pc = null;
    }
    on(event, cb) {
        this.listeners.get(event)?.add(cb);
        return () => this.listeners.get(event)?.delete(cb);
    }
    /** Chaos injection for the demo workbench. */
    setSimulation(lossFraction, bandwidthKbps) {
        this.simulatedLoss = lossFraction;
        this.simulatedBw = bandwidthKbps;
    }
    getQuality() {
        return this.quality;
    }
    async poll() {
        if (!this.pc || this.pc.connectionState === 'closed')
            return null;
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
                    const r = row;
                    if (typeof r.fractionLost === 'number')
                        fractionLost = Math.max(fractionLost, r.fractionLost);
                    if (typeof r.packetsLost === 'number')
                        packetsLost += r.packetsLost;
                    if (typeof r.jitter === 'number')
                        jitter = Math.max(jitter, r.jitter * 1000);
                    if (typeof r.bytesReceived === 'number')
                        currentBytes += r.bytesReceived;
                    if (typeof r.framesDropped === 'number')
                        framesDropped += r.framesDropped;
                }
                if (row.type === 'candidate-pair' && row.state === 'succeeded') {
                    const pair = row;
                    if (typeof pair.currentRoundTripTime === 'number') {
                        rttMs = Math.round(pair.currentRoundTripTime * 1000);
                    }
                }
            });
        }
        catch {
            /* transient */
        }
        const elapsed = Math.max(0.1, (now - this.prevTs) / 1000);
        let bitrateKbps = Math.round(((currentBytes - this.prevBytes) * 8) / (elapsed * 1000));
        if (bitrateKbps < 0 || this.prevBytes === 0)
            bitrateKbps = 1800;
        this.prevBytes = currentBytes;
        this.prevTs = now;
        if (this.simulatedLoss !== null) {
            fractionLost = this.simulatedLoss;
            packetsLost = Math.round(fractionLost * 100);
        }
        if (this.simulatedBw !== null)
            bitrateKbps = this.simulatedBw;
        const next = this.classify(fractionLost, bitrateKbps);
        this.transition(next, now);
        const mode = this.quality === 'critical' ? 'semantic' : 'pixel';
        const stats = {
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
    classify(loss, bw) {
        if (loss > this.criticalLoss || bw < this.criticalBw)
            return 'critical';
        if (loss > this.poorLoss || bw < this.poorBw)
            return 'poor';
        return 'good';
    }
    transition(next, now) {
        if (next === 'critical') {
            this.healthySince = null;
            if (this.quality !== 'critical') {
                this.quality = 'critical';
                this.emit('critical');
            }
            return;
        }
        if (this.quality === 'critical') {
            if (this.healthySince === null)
                this.healthySince = now;
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
    emit(event, data) {
        this.listeners.get(event)?.forEach((fn) => {
            try {
                fn(data);
            }
            catch (err) {
                console.error(`[NetworkMonitor] ${event} listener error:`, err);
            }
        });
    }
    destroy() {
        this.detach();
        this.listeners.forEach((set) => set.clear());
    }
}
//# sourceMappingURL=NetworkMonitor.js.map