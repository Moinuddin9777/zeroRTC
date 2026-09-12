import React from 'react';
import { Bluetooth, QrCode, Radio, Wifi } from 'lucide-react';
import { TRANSPORTS, type SignalingTransport } from '../lib/transports';

const ICONS: Record<SignalingTransport, React.ReactNode> = {
  lan: <Wifi className="w-4 h-4" />,
  bus: <Radio className="w-4 h-4" />,
  ble: <Bluetooth className="w-4 h-4" />,
  qr: <QrCode className="w-4 h-4" />,
};

interface TransportSwitcherProps {
  value: SignalingTransport;
  onChange: (t: SignalingTransport) => void;
  disabled?: boolean;
}

export const TransportSwitcher: React.FC<TransportSwitcherProps> = ({
  value,
  onChange,
  disabled,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white">
          Signaling Package
        </h2>
        <span className="text-[10px] text-[#666] uppercase tracking-wider">
          Swap factory · same CallSession
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {TRANSPORTS.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={`text-left p-3 border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                active
                  ? 'bg-[#00FF41]/10 border-[#00FF41] shadow-[0_0_12px_rgba(0,255,65,0.15)]'
                  : 'bg-[#0A0A0B] border-[#1F1F23] hover:border-[#00FF41]/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={active ? 'text-[#00FF41]' : 'text-[#666]'}>{ICONS[t.id]}</span>
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    active ? 'text-[#00FF41]' : 'text-[#E0E0E0]'
                  }`}
                >
                  {t.title}
                </span>
              </div>
              <p className="text-[11px] text-[#999] leading-snug mb-2">{t.subtitle}</p>
              <p className="text-[9px] font-mono text-[#555] uppercase tracking-wider truncate">
                {t.packageLabel}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
