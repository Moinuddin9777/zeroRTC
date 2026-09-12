import React, { useState } from 'react';
import { Check, Copy, QrCode, ScanLine } from 'lucide-react';

interface QRExchangeProps {
  outboundPayload: string | null;
  outboundMeta?: { bytes: number; compressed: number } | null;
  /** Recent trickle codes (offer / answer / ICE) — ingest in order on the remote. */
  outboundQueue?: string[];
  onIngest: (payload: string) => Promise<void> | void;
  disabled?: boolean;
}

export const QRExchange: React.FC<QRExchangeProps> = ({
  outboundPayload,
  outboundMeta,
  outboundQueue = [],
  onIngest,
  disabled,
}) => {
  const [paste, setPaste] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyOut = async () => {
    if (!outboundPayload) return;
    try {
      await navigator.clipboard.writeText(outboundPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard blocked — select and copy manually');
    }
  };

  const ingest = async () => {
    if (!paste.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onIngest(paste.trim());
      setPaste('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest payload');
    } finally {
      setBusy(false);
    }
  };

  const qrImg =
    outboundPayload && outboundPayload.length < 1800
      ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=M&data=${encodeURIComponent(outboundPayload)}`
      : null;

  return (
    <div className="bg-[#0A0A0B] border border-[#1F1F23] p-4 space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#00FF41]">
        <QrCode className="w-3.5 h-3.5" />
        QR / Manual SDP Exchange
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-[#666]">Your outbound code</p>
          {outboundPayload ? (
            <>
              {qrImg && (
                <img
                  src={qrImg}
                  alt="Signaling QR"
                  className="w-[220px] h-[220px] bg-white p-2 border border-[#1F1F23]"
                />
              )}
              {!qrImg && (
                <p className="text-[11px] text-[#999]">
                  Payload too large for a single QR — copy/paste below (or use LAN/BLE).
                </p>
              )}
              <textarea
                readOnly
                value={outboundPayload}
                className="w-full h-24 bg-[#121214] border border-[#1F1F23] p-2 text-[10px] font-mono text-[#999] resize-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] text-[#555] font-mono">
                  {outboundMeta
                    ? `${outboundMeta.bytes}B → ${outboundMeta.compressed}B gzip`
                    : `${outboundPayload.length} chars`}
                  {outboundQueue.length > 1 ? ` · ${outboundQueue.length} codes` : ''}
                </span>
                <button
                  type="button"
                  onClick={copyOut}
                  className="px-2.5 py-1 text-[10px] uppercase tracking-wider border border-[#1F1F23] hover:border-[#00FF41]/40 bg-[#121214] text-[#E0E0E0] flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-[#00FF41]" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy latest'}
                </button>
              </div>
              {outboundQueue.length > 1 && (
                <p className="text-[9px] text-[#666]">
                  Trickle ICE may emit several codes — paste each on the remote in order (latest shown
                  above). Prefer LAN for multi-candidate handshakes.
                </p>
              )}
            </>
          ) : (
            <div className="h-40 border border-dashed border-[#1F1F23] flex items-center justify-center text-[11px] text-[#555] px-4 text-center">
              Start a call to generate an offer code, or answer to emit an answer code.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-[#666] flex items-center gap-1.5">
            <ScanLine className="w-3 h-3" /> Paste remote code
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={disabled}
            placeholder="Paste gzip/Base64 payload from the other device…"
            className="w-full h-40 bg-[#121214] border border-[#1F1F23] p-2 text-[10px] font-mono text-[#E0E0E0] resize-none disabled:opacity-40"
          />
          <button
            type="button"
            disabled={disabled || busy || !paste.trim()}
            onClick={ingest}
            className="w-full px-3 py-2 bg-[#00FF41] hover:bg-[#00FF41]/90 text-[#0A0A0B] text-xs font-bold uppercase tracking-wider disabled:opacity-40 cursor-pointer"
          >
            {busy ? 'Ingesting…' : 'Ingest Scanned Payload'}
          </button>
          {error && <p className="text-[10px] text-[#FF3B30]">{error}</p>}
        </div>
      </div>
    </div>
  );
};
