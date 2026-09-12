import React, { useState } from 'react';
import { ChevronDown, Filter, Radio, Server, Terminal, Trash2, Zap } from 'lucide-react';
import type { SignalEventLog } from '@zerortc/core';

interface InBandSignalingLogProps {
  logs: SignalEventLog[];
  onClearLogs: () => void;
}

export const InBandSignalingLog: React.FC<InBandSignalingLogProps> = ({ logs, onClearLogs }) => {
  const [filter, setFilter] = useState<'all' | 'external-signaling' | 'in-band-datachannel'>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.channel === filter;
  });

  const externalCount = logs.filter((l) => l.channel === 'external-signaling').length;
  const inBandCount = logs.filter((l) => l.channel === 'in-band-datachannel').length;

  return (
    <div id="signaling-terminal-panel" className="bg-[#0D0D10] border border-[#1F1F23] overflow-hidden">
      {/* Header */}
      <div className="bg-[#0A0A0B] px-4 py-3 border-b border-[#1F1F23] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#00FF41]" />
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            Signaling Traffic &amp; Telemetry Stream
          </h3>
          <span className="text-[11px] font-mono text-[#666]">
            ({logs.length} events logged)
          </span>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="flex bg-[#0A0A0B] p-0.5 border border-[#1F1F23]">
            <button
              id="filter-all-logs-btn"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider cursor-pointer transition-all ${
                filter === 'all' ? 'bg-[#00FF41] text-[#0A0A0B] font-bold' : 'text-[#888] hover:text-[#E0E0E0]'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              id="filter-external-logs-btn"
              onClick={() => setFilter('external-signaling')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider cursor-pointer transition-all ${
                filter === 'external-signaling'
                  ? 'bg-[#FF3B30] text-white font-bold'
                  : 'text-[#888] hover:text-[#E0E0E0]'
              }`}
            >
              External Server ({externalCount})
            </button>
            <button
              id="filter-inband-logs-btn"
              onClick={() => setFilter('in-band-datachannel')}
              className={`px-2.5 py-1 text-[10px] uppercase tracking-wider cursor-pointer transition-all ${
                filter === 'in-band-datachannel'
                  ? 'bg-[#00FF41] text-[#0A0A0B] font-bold'
                  : 'text-[#888] hover:text-[#E0E0E0]'
              }`}
            >
              In-Band P2P ({inBandCount})
            </button>
          </div>

          <button
            id="clear-logs-btn"
            onClick={onClearLogs}
            className="p-1.5 bg-[#121214] hover:bg-[#1F1F23] text-[#888] hover:text-[#FF3B30] border border-[#1F1F23] cursor-pointer transition-all"
            title="Clear Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Carmack Systems Terminal Output */}
      <div className="p-3 bg-[#0A0A0B] font-mono text-xs max-h-72 overflow-y-auto space-y-1 divide-y divide-[#1F1F23]/60">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-6 text-[#666] text-xs font-mono uppercase tracking-wider">
            No signaling packets logged yet. Click &quot;Start P2P Call&quot; to inspect traffic.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExternal = log.channel === 'external-signaling';
            return (
              <div
                key={log.id}
                className="pt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-[#121214] p-1 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-[#666] min-w-[72px]">
                    {new Date(log.timestamp).toISOString().substring(11, 19)}.
                    {String(log.timestamp % 1000).padStart(3, '0')}
                  </span>

                  {/* Channel Badge */}
                  {isExternal ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[#1F1F23] text-[#FF3B30] border border-[#FF3B30]/40 font-mono uppercase">
                      <Server className="w-2.5 h-2.5" />
                      EXT-SIGNALING
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 font-bold font-mono uppercase">
                      <Zap className="w-2.5 h-2.5 text-[#00FF41]" />
                      IN-BAND P2P
                    </span>
                  )}

                  {/* Direction */}
                  <span
                    className={`text-[10px] font-bold ${
                      log.direction === 'sent' ? 'text-[#00FF41]' : 'text-[#888]'
                    }`}
                  >
                    {log.direction === 'sent' ? 'TX →' : 'RX ←'}
                  </span>

                  {/* Summary Text */}
                  <span className="text-[#E0E0E0] text-xs font-mono">{log.summary}</span>
                </div>

                {/* Packet payload bytes */}
                <div className="text-[10px] text-[#666] font-mono sm:text-right shrink-0">
                  {log.bytes > 0 ? `${log.bytes} B` : '0 B (system)'}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Systems Legend Bar */}
      <div className="bg-[#0D0D10] px-4 py-2 border-t border-[#1F1F23] text-[10px] font-mono text-[#666] flex flex-wrap items-center justify-between gap-2 uppercase tracking-wider">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
            External Signaling: Disposable Handshake only
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF41]" />
            In-Band Control: 100% P2P over DataChannel (zero server load)
          </span>
        </div>
        <span className="text-[#00FF41]">Carmack Zero-Bloat Spec</span>
      </div>
    </div>
  );
};
