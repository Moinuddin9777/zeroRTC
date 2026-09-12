import React from 'react';
import { Activity, AlertTriangle, Cpu, Globe, Server, ShieldAlert, Wifi, WifiOff, Zap } from 'lucide-react';
import type { NetworkStats, RTCMode } from '@zerortc/core';

interface NetworkChaosControlProps {
  isServerOnline: boolean;
  onToggleServer: (online: boolean) => void;
  droppedPackets: number;
  simulatedLoss: number;
  onLossChange: (loss: number) => void;
  simulatedBandwidth: number;
  onBandwidthChange: (bw: number) => void;
  activeStats: NetworkStats | null;
  currentMode: RTCMode;
  onForceMode: (mode: RTCMode | 'auto') => void;
  forceMode: RTCMode | 'auto';
  healthyCounterSec: number;
}

export const NetworkChaosControl: React.FC<NetworkChaosControlProps> = ({
  isServerOnline,
  onToggleServer,
  droppedPackets,
  simulatedLoss,
  onLossChange,
  simulatedBandwidth,
  onBandwidthChange,
  activeStats,
  currentMode,
  onForceMode,
  forceMode,
  healthyCounterSec,
}) => {
  const isCritical = (activeStats?.fractionLost ?? 0) > 0.15 || (activeStats?.bitrateKbps ?? 1800) < 100;

  const setPreset = (loss: number, bw: number) => {
    onLossChange(loss);
    onBandwidthChange(bw);
  };

  return (
    <div id="network-chaos-panel" className="bg-[#0D0D10] border border-[#1F1F23] p-5 space-y-5 text-[#E0E0E0] font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1F1F23] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0A0A0B] text-[#00FF41] border border-[#1F1F23]">
            <Activity className="w-5 h-5 text-[#00FF41]" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-white flex items-center gap-2">
              Network Telemetry &amp; Chaos Controller
            </h2>
            <p className="text-[10px] text-[#666] uppercase tracking-widest">
              Simulate packet loss &amp; extreme bandwidth throttling to test in-band semantic fallback
            </p>
          </div>
        </div>

        {/* Live Codec Mode Badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#666] uppercase tracking-widest">Active Mode:</span>
          <div
            className={`px-2.5 py-1 text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all border ${
              currentMode === 'semantic'
                ? 'bg-[#1F1F23] text-[#00FF41] border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.25)]'
                : 'bg-[#0A0A0B] text-[#E0E0E0] border-[#333]'
            }`}
          >
            {currentMode === 'semantic' ? (
              <>
                <Cpu className="w-3.5 h-3.5 text-[#00FF41] animate-pulse" />
                MODE B: SEMANTIC RTC (&lt; 2 kbps)
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-[#00FF41]" />
                MODE A: PIXEL RTC (~1.8 Mbps)
              </>
            )}
          </div>
        </div>
      </div>

      {/* Row 1: External Signaling Server Kill Switch */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0A0A0B] border border-[#1F1F23] p-4 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#00FF41]" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  External Signaling Server
                </span>
              </div>
              <p className="text-[11px] text-[#888] leading-relaxed">
                Carmack Philosophy: Cut external server mid-call. In-band DataChannel keeps call alive with 0 server dependency.
              </p>
            </div>
            <button
              id="toggle-signaling-server-btn"
              onClick={() => onToggleServer(!isServerOnline)}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all border ${
                isServerOnline
                  ? 'bg-[#00FF41] hover:bg-[#00FF41]/90 text-[#0A0A0B] border-[#00FF41] shadow-[0_0_10px_rgba(0,255,65,0.3)]'
                  : 'bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white border-[#FF3B30] shadow-[0_0_10px_rgba(255,59,48,0.3)]'
              }`}
            >
              {isServerOnline ? (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  SERVER ONLINE
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  SERVER CUT
                </>
              )}
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#1F1F23] flex items-center justify-between text-xs font-mono">
            <span className="text-[#666] uppercase text-[10px] tracking-wider">Server State:</span>
            {isServerOnline ? (
              <span className="text-[#00FF41] flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41] animate-pulse" />
                Listening (Ready for Handshake)
              </span>
            ) : (
              <span className="text-[#FF3B30] flex items-center gap-1.5 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-[#FF3B30]" />
                Severed ({droppedPackets} packets dropped by host)
              </span>
            )}
          </div>
        </div>

        {/* Mode Override Controls */}
        <div className="bg-[#0A0A0B] border border-[#1F1F23] p-4 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#00FF41]" />
              State Machine Mode Override
            </span>
            <p className="text-[11px] text-[#888]">
              By default, NetworkMonitor triggers automatic fallback based on real-time telemetry.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              id="mode-auto-btn"
              onClick={() => onForceMode('auto')}
              className={`py-1.5 px-2 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                forceMode === 'auto'
                  ? 'bg-[#00FF41] text-[#0A0A0B] font-bold border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.25)]'
                  : 'bg-[#121214] hover:bg-[#1F1F23] text-[#999] border-[#1F1F23]'
              }`}
            >
              Auto (Health)
            </button>
            <button
              id="mode-pixel-btn"
              onClick={() => onForceMode('pixel')}
              className={`py-1.5 px-2 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                forceMode === 'pixel'
                  ? 'bg-[#00FF41] text-[#0A0A0B] font-bold border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.25)]'
                  : 'bg-[#121214] hover:bg-[#1F1F23] text-[#999] border-[#1F1F23]'
              }`}
            >
              Force Pixel
            </button>
            <button
              id="mode-semantic-btn"
              onClick={() => onForceMode('semantic')}
              className={`py-1.5 px-2 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer border ${
                forceMode === 'semantic'
                  ? 'bg-[#00FF41] text-[#0A0A0B] font-bold border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.25)]'
                  : 'bg-[#121214] hover:bg-[#1F1F23] text-[#999] border-[#1F1F23]'
              }`}
            >
              Force Neural
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
            Network Health Simulator Presets:
          </span>
          {isCritical && currentMode === 'semantic' && healthyCounterSec > 0 && (
            <span className="text-[11px] font-mono text-[#00FF41] flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
              Network recovering... ({healthyCounterSec.toFixed(1)}s / 5.0s hold)
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            id="preset-5g-btn"
            onClick={() => setPreset(0, 2500)}
            className="p-2.5 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F23] hover:border-[#00FF41]/40 text-left transition-all cursor-pointer group"
          >
            <div className="text-xs font-bold text-white group-hover:text-[#00FF41] flex items-center gap-1.5 uppercase tracking-wider">
              <Wifi className="w-3.5 h-3.5 text-[#00FF41]" />
              5G Fiber (Clean)
            </div>
            <div className="text-[11px] text-[#666] mt-1 font-mono">0% Loss · 2.5 Mbps</div>
          </button>

          <button
            id="preset-4g-btn"
            onClick={() => setPreset(0.04, 1200)}
            className="p-2.5 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F23] hover:border-[#00FF41]/40 text-left transition-all cursor-pointer group"
          >
            <div className="text-xs font-bold text-white group-hover:text-[#00FF41] flex items-center gap-1.5 uppercase tracking-wider">
              <Wifi className="w-3.5 h-3.5 text-[#00FF41]" />
              4G LTE (Mild Jitter)
            </div>
            <div className="text-[11px] text-[#666] mt-1 font-mono">4% Loss · 1.2 Mbps</div>
          </button>

          <button
            id="preset-subway-btn"
            onClick={() => setPreset(0.18, 450)}
            className="p-2.5 bg-[#0A0A0B] hover:bg-[#121214] border border-[#1F1F23] hover:border-[#FF3B30]/40 text-left transition-all cursor-pointer group"
          >
            <div className="text-xs font-bold text-[#FF3B30] flex items-center gap-1.5 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5 text-[#FF3B30]" />
              3G / Subway Tunnel
            </div>
            <div className="text-[11px] text-[#FF3B30]/70 mt-1 font-mono">&gt;15% Loss Threshold</div>
          </button>

          <button
            id="preset-deathzone-btn"
            onClick={() => setPreset(0.24, 45)}
            className="p-2.5 bg-[#121214] hover:bg-[#1F1F23] border border-[#FF3B30] text-left transition-all cursor-pointer group shadow-[0_0_8px_rgba(255,59,48,0.2)]"
          >
            <div className="text-xs font-bold text-[#FF3B30] flex items-center gap-1.5 uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5 text-[#FF3B30]" />
              50kbps Death Zone
            </div>
            <div className="text-[11px] text-[#FF3B30] mt-1 font-mono">24% Loss · 45 kbps</div>
          </button>
        </div>
      </div>

      {/* Row 3: Sliders with threshold markers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2 border-t border-[#1F1F23]">
        {/* Packet Loss Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-[#999] uppercase text-[10px] tracking-wider">Simulated Packet Loss:</span>
            <span className={`font-bold ${simulatedLoss > 0.15 ? 'text-[#FF3B30]' : 'text-[#00FF41]'}`}>
              {(simulatedLoss * 100).toFixed(0)}%
              {simulatedLoss > 0.15 && ' (CRITICAL > 15%)'}
            </span>
          </div>
          <input
            id="packet-loss-slider"
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            value={simulatedLoss}
            onChange={(e) => onLossChange(parseFloat(e.target.value))}
            className="w-full accent-[#00FF41] bg-[#1F1F23] h-1.5 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-[#666] uppercase tracking-wider">
            <span>0% (Ideal)</span>
            <span className="text-[#FF3B30] font-bold">15% Fallback Threshold</span>
            <span>40% (Severe)</span>
          </div>
        </div>

        {/* Bandwidth Throttling Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-[#999] uppercase text-[10px] tracking-wider">Bandwidth Cap:</span>
            <span className={`font-bold ${simulatedBandwidth < 100 ? 'text-[#FF3B30]' : 'text-[#00FF41]'}`}>
              {simulatedBandwidth} kbps
              {simulatedBandwidth < 100 && ' (CRITICAL < 100kbps)'}
            </span>
          </div>
          <input
            id="bandwidth-slider"
            type="range"
            min="20"
            max="2500"
            step="10"
            value={simulatedBandwidth}
            onChange={(e) => onBandwidthChange(parseInt(e.target.value, 10))}
            className="w-full accent-[#00FF41] bg-[#1F1F23] h-1.5 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-[#666] uppercase tracking-wider">
            <span className="text-[#FF3B30] font-bold">50kbps Death Zone</span>
            <span className="text-[#00FF41] font-bold">100kbps Threshold</span>
            <span>2.5 Mbps (HD)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
