import React, { useState } from 'react';
import { Check, Copy, FileCode, X } from 'lucide-react';

interface CodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SNIPPET_USAGE = `import { ZeroRTC, BusSignalingFactory } from '@zerortc/core';
import { BLESignalingFactory, LoopbackBLETransport } from '@zerortc/mesh';
import { TelemetryEngine, SyntheticPoseExtractor } from '@zerortc/telemetry';

// 1. Inject signaling (bus, BLE, LAN, or QR)
const signaling = new BusSignalingFactory({
  localPeerId: 'alice',
  send: (from, to, body) => backend.push(from, to, body),
  register: (id, h) => backend.on(id, h),
});

const rtc = new ZeroRTC({ localPeerId: 'alice', signaling });
backend.onMessage((from, body) => rtc.receiveSignal(from, body));

// 2. Or go off-grid with BLE MTU chunking:
const radioA = new LoopbackBLETransport(512);
const radioB = new LoopbackBLETransport(512);
LoopbackBLETransport.pair(radioA, radioB);
const ble = new BLESignalingFactory(() => radioA);

// 3. Call + answer
const session = await rtc.call('bob', localStream);
rtc.onIncoming(async (req) => {
  const s = await req.answer(localStream);
});

// 4. On critical network — kill video, stream squat reps < 2 kbps
const telemetry = new TelemetryEngine({ extractor: new SyntheticPoseExtractor() });
telemetry.attach(session);
telemetry.onBiometricUpdate((m) => console.log('reps', m.squatReps));

session.onNetworkHealth((stats) => {
  if (stats.quality === 'critical') {
    telemetry.start(localVideoEl, session.getVideoSender());
  } else if (stats.quality === 'good') {
    telemetry.stop();
  }
});

// 5. Control channel already carries mute / hangup in-band
session.setTrackEnabled('video', false);
session.hangup();`;

export const CodeExportModal: React.FC<CodeExportModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'usage' | 'architecture' | 'semantic'>('usage');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const contentMap = {
    usage: {
      title: 'ZeroRTC Monorepo Integration',
      code: SNIPPET_USAGE,
    },
    architecture: {
      title: 'Disposable Signaling & Data-Channel First',
      code: `// THE SHIFT:
// 1. ISignalingChannel is untrusted, slow, and disposable.
// 2. Used EXCLUSIVELY for initial SDP Offer/Answer + first ICE.
// 3. CallSession creates RTCDataChannel("control") immediately.
// 4. The millisecond it opens → signaling.dispose() — all control
//    (trickle ICE, mute, camera-swap, hangup) shifts in-band P2P.
// 5. O(1) glare: polite = localPeerId > remotePeerId (no clocks).
// 6. Media via addTransceiver() — mute never tears negotiation.
// 7. IPeerConnectionFactory swaps browser ↔ Flutter FFI in Phase 2.`,
    },
    semantic: {
      title: 'Telemetry Packer & ITelemetryExtractor',
      code: `// Binary wire format (~109 B/frame @ 15 Hz ≈ 1.6 kbps):
// magic:u16 | ver:u8 | flags:u8 | landmarks:u16 | seq:u16 | metrics:u8
// landmarks as Int8 quantized [-1,1] → [-127,127]

import { TelemetryPacker } from '@zerortc/telemetry';
import type { ITelemetryExtractor } from '@zerortc/telemetry';

class MediaPipePoseExtractor implements ITelemetryExtractor {
  landmarkCount = 33;
  metricKeys = ['squatReps', 'kneeAngle'];
  async extract(video) {
    const results = await pose.detect(video);
    return { landmarks: flatten(results), metrics: {...}, timestampMs: performance.now() };
  }
}

const packed = TelemetryPacker.pack(landmarks, metrics, { quantize: true });
channel.send(packed); // RTCDataChannel binary`,
    },
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(contentMap[activeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 font-mono">
      <div className="bg-[#0D0D10] border border-[#1F1F23] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="bg-[#0A0A0B] px-5 py-3.5 border-b border-[#1F1F23] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#00FF41]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              @zerortc Library API
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#1F1F23] text-[#666] hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-[#1F1F23] bg-[#0A0A0B]">
          {(
            [
              ['usage', 'Usage'],
              ['architecture', 'Architecture'],
              ['semantic', 'Telemetry'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 text-[11px] uppercase tracking-wider cursor-pointer transition-all ${
                activeTab === key
                  ? 'text-[#00FF41] border-b-2 border-[#00FF41] font-bold'
                  : 'text-[#666] hover:text-[#E0E0E0]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs text-[#888] uppercase tracking-wider">{contentMap[activeTab].title}</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider border border-[#1F1F23] hover:border-[#00FF41]/40 text-[#E0E0E0] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#00FF41]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-[11px] leading-relaxed text-[#A0A0A0] whitespace-pre-wrap bg-[#0A0A0B] border border-[#1F1F23] p-4 overflow-x-auto">
            {contentMap[activeTab].code}
          </pre>
        </div>
      </div>
    </div>
  );
};
