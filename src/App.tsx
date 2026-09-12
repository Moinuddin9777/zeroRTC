import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bluetooth,
  ChevronDown,
  ChevronUp,
  Code,
  Link2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  BusSignalingFactory,
  ZeroRTC,
  type CallRequest,
  type CallSession,
  type NetworkStats,
  type RTCMode,
  type SignalEventLog,
} from '@zerortc/core';
import {
  ChunkDecoder,
  ChunkEncoder,
  compressToBase64,
  decompressFromBase64,
  requestWebBluetoothTransport,
  type IBLETransport,
} from '@zerortc/mesh';
import { SyntheticPoseExtractor, TelemetryEngine } from '@zerortc/telemetry';
import { CallStage } from './components/CallStage';
import { CodeExportModal } from './components/CodeExportModal';
import { InBandSignalingLog } from './components/InBandSignalingLog';
import { NetworkChaosControl } from './components/NetworkChaosControl';
import { QRExchange } from './components/QRExchange';
import { TransportSwitcher } from './components/TransportSwitcher';
import { defaultRelayUrl, LanRelayClient, type LanStatus } from './lib/LanRelayClient';
import { getOrCreatePeerId, setPeerId as persistPeerId } from './lib/peerIdentity';
import { getLocalMediaStream } from './lib/mediaHelper';
import { CarmackNeuralEngine } from './lib/SemanticCodecEngine';
import { globalSignalingBus } from './lib/SignalingBus';
import { transportMeta, type SignalingTransport } from './lib/transports';

export default function App() {
  const codecEngine = useMemo(() => new CarmackNeuralEngine(), []);

  const [localPeerId, setLocalPeerId] = useState(() => getOrCreatePeerId());
  const [remotePeerId, setRemotePeerId] = useState('');
  const [transport, setTransport] = useState<SignalingTransport>('lan');
  const [relayUrl, setRelayUrl] = useState(() => defaultRelayUrl());
  const [lanStatus, setLanStatus] = useState<LanStatus>('disconnected');
  const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
  const [identityDraft, setIdentityDraft] = useState(localPeerId);
  const [engineReady, setEngineReady] = useState(0); // bump to recreate ZeroRTC

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallRequest | null>(null);
  const [mode, setMode] = useState<RTCMode>('pixel');
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [blendshapes, setBlendshapes] = useState<Float32Array | null>(null);
  const [squatReps, setSquatReps] = useState(0);
  const [telemetryActive, setTelemetryActive] = useState(false);

  const [isServerOnline, setIsServerOnline] = useState(true);
  const [droppedPackets, setDroppedPackets] = useState(0);
  const [simulatedLoss, setSimulatedLoss] = useState(0);
  const [simulatedBandwidth, setSimulatedBandwidth] = useState(2400);
  const [forceMode, setForceMode] = useState<RTCMode | 'auto'>('auto');
  const [healthyCounterSec, setHealthyCounterSec] = useState(0);
  const [signalLogs, setSignalLogs] = useState<SignalEventLog[]>([]);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [showEngineer, setShowEngineer] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const [qrOutbound, setQrOutbound] = useState<string | null>(null);
  const [qrMeta, setQrMeta] = useState<{ bytes: number; compressed: number } | null>(null);
  const [qrQueue, setQrQueue] = useState<string[]>([]);
  const [bleReady, setBleReady] = useState(false);

  const rtcRef = useRef<ZeroRTC | null>(null);
  const busFactoryRef = useRef<BusSignalingFactory | null>(null);
  const lanRef = useRef<LanRelayClient | null>(null);
  const bleTransportRef = useRef<IBLETransport | null>(null);
  const bleDecoderRef = useRef<ChunkDecoder | null>(null);
  const bleUnsubRef = useRef<(() => void) | null>(null);
  const telemetryRef = useRef<TelemetryEngine | null>(null);
  const remotePeerIdRef = useRef(remotePeerId);
  const transportRef = useRef(transport);
  const forceModeRef = useRef(forceMode);
  const modeRef = useRef(mode);

  remotePeerIdRef.current = remotePeerId;
  transportRef.current = transport;
  forceModeRef.current = forceMode;
  modeRef.current = mode;

  // Local camera / mic (one device = one stream)
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const media = await getLocalMediaStream(true, true);
      if (mounted) setLocalStream(media);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const publishQr = useCallback(async (body: string) => {
    const compressed = await compressToBase64(body);
    setQrOutbound(compressed);
    setQrMeta({ bytes: body.length, compressed: compressed.length });
    setQrQueue((prev) => [...prev.slice(-7), compressed]);
  }, []);

  const sendSignal = useCallback(
    async (from: string, to: string, body: string) => {
      const modeNow = transportRef.current;
      if (modeNow === 'bus') {
        return globalSignalingBus.send(from, to, body);
      }
      if (modeNow === 'lan') {
        lanRef.current?.send(from, to, body);
        return;
      }
      if (modeNow === 'qr') {
        await publishQr(body);
        return;
      }
      if (modeNow === 'ble') {
        const transportBle = bleTransportRef.current;
        if (!transportBle) {
          setStatusNote('Pair Bluetooth before calling');
          return;
        }
        const encoder = new ChunkEncoder({
          mtuPayloadBytes: Math.max(32, transportBle.mtu - 3),
        });
        for (const chunk of encoder.encode(body)) {
          await transportBle.write(chunk);
        }
      }
    },
    [publishQr]
  );

  // Build ZeroRTC + transport hosts whenever identity / transport / relay changes
  useEffect(() => {
    let cancelled = false;

    lanRef.current?.dispose();
    lanRef.current = null;
    bleUnsubRef.current?.();
    bleUnsubRef.current = null;
    busFactoryRef.current?.dispose();
    rtcRef.current?.destroy();
    telemetryRef.current?.dispose();

    setCallSession(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setStats(null);
    setMode('pixel');
    setLanStatus('disconnected');
    setOnlinePeers([]);
    setQrOutbound(null);
    setQrQueue([]);
    setStatusNote(null);

    const factory = new BusSignalingFactory({
      localPeerId,
      send: (from, to, body) => sendSignal(from, to, body),
      register: () => () => undefined,
    });
    busFactoryRef.current = factory;

    const rtc = new ZeroRTC({ localPeerId, signaling: factory });
    rtcRef.current = rtc;

    rtc.onIncoming((req) => {
      if (!remotePeerIdRef.current) setRemotePeerId(req.callerId);
      setIncomingCall(req);
    });

    const unsubLog = rtc.onSignalLog((log) => {
      setSignalLogs((prev) => [log, ...prev].slice(0, 100));
    });

    telemetryRef.current = new TelemetryEngine({
      extractor: new SyntheticPoseExtractor(),
      fps: 15,
    });
    telemetryRef.current.onBiometricUpdate((m) => {
      if (typeof m.squatReps === 'number') setSquatReps(Math.floor(m.squatReps));
    });
    telemetryRef.current.onPoseUpdate((_lm, raw) => {
      if (raw.length >= 16) setBlendshapes(raw.slice(0, 16));
    });

    const unsubs: Array<() => void> = [unsubLog];

    if (transport === 'bus') {
      unsubs.push(
        globalSignalingBus.registerPeer(localPeerId, (from, payload) => {
          void rtc.receiveSignal(from, payload);
        })
      );
      unsubs.push(
        globalSignalingBus.onServerDrop((count) => setDroppedPackets(count))
      );
      setStatusNote('Open this URL in a second tab. Use different Peer IDs.');
    }

    if (transport === 'lan') {
      const client = new LanRelayClient({
        url: relayUrl,
        localPeerId,
        onStatus: (s, detail) => {
          if (!cancelled) {
            setLanStatus(s);
            if (detail) setStatusNote(detail);
          }
        },
        onPeers: (peers) => {
          if (!cancelled) setOnlinePeers(peers.filter((p) => p !== localPeerId));
        },
      });
      lanRef.current = client;
      unsubs.push(
        client.onMessage((from, body) => {
          void rtc.receiveSignal(from, body);
        })
      );
      client.connect();
      setStatusNote(`Relay ${relayUrl} — run npm run relay on the LAN (or host it online).`);
    }

    if (transport === 'ble') {
      const transportBle = bleTransportRef.current;
      if (transportBle) {
        const decoder = new ChunkDecoder();
        bleDecoderRef.current = decoder;
        bleUnsubRef.current = transportBle.onNotification((data) => {
          const complete = decoder.push(data);
          if (complete == null) return;
          const from = remotePeerIdRef.current || 'ble-peer';
          void rtc.receiveSignal(from, complete);
        });
        setBleReady(true);
        setStatusNote('BLE radio linked. Set remote peer ID, then call or wait.');
      } else {
        setBleReady(false);
        setStatusNote('Tap Pair Bluetooth (needs a ZeroRTC GATT peripheral / Web Bluetooth).');
      }
    }

    if (transport === 'qr') {
      setStatusNote('Call to emit an offer code. Paste the remote code to answer / complete ICE.');
    }

    setEngineReady((n) => n + 1);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      lanRef.current?.dispose();
      lanRef.current = null;
      bleUnsubRef.current?.();
      bleUnsubRef.current = null;
      telemetryRef.current?.dispose();
      telemetryRef.current = null;
      rtc.destroy();
      factory.dispose();
      rtcRef.current = null;
      busFactoryRef.current = null;
    };
    // bleReady intentionally triggers rebuild after pairing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPeerId, transport, relayUrl, bleReady, sendSignal]);

  useEffect(() => {
    callSession?.networkMonitorRef.setSimulation(
      simulatedLoss > 0 ? simulatedLoss : null,
      simulatedBandwidth
    );
  }, [simulatedLoss, simulatedBandwidth, callSession]);

  useEffect(() => {
    if (stats?.isCritical && simulatedLoss <= 0.15 && simulatedBandwidth >= 100) {
      const interval = setInterval(() => {
        setHealthyCounterSec((prev) => (prev >= 5.0 ? 5.0 : prev + 0.2));
      }, 200);
      return () => clearInterval(interval);
    }
    setHealthyCounterSec(0);
  }, [stats?.isCritical, simulatedLoss, simulatedBandwidth]);

  const startTelemetry = (session: CallSession) => {
    const engine = telemetryRef.current;
    const video = document.querySelector('#local-video') as HTMLVideoElement | null;
    if (!engine) return;
    engine.attach(session);
    const sender = session.getVideoSender();
    if (video) {
      engine.start(video, sender);
      setTelemetryActive(true);
    }
  };

  const stopTelemetry = () => {
    telemetryRef.current?.stop();
    setTelemetryActive(false);
  };

  const bindSessionEvents = (session: CallSession) => {
    session.onRemoteStream((stream) => setRemoteStream(stream));

    session.onModeChange((newMode) => {
      if (forceModeRef.current === 'auto') setMode(newMode);
      if (newMode === 'semantic') startTelemetry(session);
      else {
        telemetryRef.current?.stop();
        setTelemetryActive(false);
      }
    });

    session.onNetworkHealth((s) => {
      setStats(s);
      if (forceModeRef.current === 'auto' && s.mode !== modeRef.current) setMode(s.mode);
    });

    session.onBlendshapesReceived((b) => setBlendshapes(b));

    session.onDisconnect(() => {
      setCallSession(null);
      setRemoteStream(null);
      setStats(null);
      stopTelemetry();
      setMode('pixel');
    });
  };

  const handleApplyIdentity = () => {
    try {
      persistPeerId(identityDraft);
      setLocalPeerId(identityDraft.trim().replace(/\s+/g, '_'));
      setStatusNote('Identity saved for this browser.');
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Invalid peer ID');
    }
  };

  const handleTransportChange = (next: SignalingTransport) => {
    if (callSession) {
      setStatusNote('Hang up before switching signaling package.');
      return;
    }
    setTransport(next);
  };

  const handlePairBle = async () => {
    try {
      const t = await requestWebBluetoothTransport();
      if (!t) {
        setStatusNote('Web Bluetooth unavailable in this browser.');
        return;
      }
      bleTransportRef.current = t;
      setBleReady(true);
      setStatusNote('Bluetooth device connected.');
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Bluetooth pairing failed');
    }
  };

  const handleCall = async () => {
    if (!rtcRef.current || !localStream || isCalling || callSession || !remotePeerId.trim()) return;
    setIsCalling(true);
    setIncomingCall(null);
    try {
      const session = await rtcRef.current.call(remotePeerId.trim(), localStream);
      bindSessionEvents(session);
      setCallSession(session);
    } catch (err) {
      console.error(err);
      setStatusNote(err instanceof Error ? err.message : 'Call failed');
    } finally {
      setIsCalling(false);
    }
  };

  const handleAnswer = async () => {
    if (!incomingCall || !localStream || isAnswering) return;
    setIsAnswering(true);
    const req = incomingCall;
    setIncomingCall(null);
    try {
      const session = await req.answer(localStream);
      bindSessionEvents(session);
      setCallSession(session);
    } catch (err) {
      console.error(err);
      setStatusNote(err instanceof Error ? err.message : 'Answer failed');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleReject = () => {
    incomingCall?.reject();
    setIncomingCall(null);
  };

  const handleHangup = () => {
    stopTelemetry();
    callSession?.hangup();
    setCallSession(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setStats(null);
    setMode('pixel');
    setSquatReps(0);
    setQrOutbound(null);
    setQrQueue([]);
  };

  const handleForceMode = (m: RTCMode | 'auto') => {
    setForceMode(m);
    if (m === 'pixel') {
      setMode('pixel');
      callSession?.setMode('pixel');
      stopTelemetry();
    } else if (m === 'semantic') {
      setMode('semantic');
      callSession?.setMode('semantic');
      if (callSession) startTelemetry(callSession);
    }
  };

  const handleToggleServer = (online: boolean) => {
    setIsServerOnline(online);
    globalSignalingBus.setServerOnline(online);
  };

  const handleQrIngest = async (payload: string) => {
    const rtc = rtcRef.current;
    if (!rtc) return;
    const remote = remotePeerIdRef.current.trim();
    if (!remote) {
      throw new Error('Set the remote peer ID before ingesting a code');
    }
    const text = await decompressFromBase64(payload);
    await rtc.receiveSignal(remote, text);
  };

  const meta = transportMeta(transport);
  const inCall = Boolean(callSession);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E0E0E0] font-mono flex flex-col selection:bg-[#00FF41] selection:text-[#0A0A0B]">
      <header className="border-b border-[#1F1F23] bg-[#0D0D10] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`w-3 h-3 rounded-full ${
                inCall || lanStatus === 'connected' || transport === 'bus'
                  ? 'bg-[#00FF41] shadow-[0_0_8px_#00FF41]'
                  : 'bg-[#444]'
              }`}
            />
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tighter uppercase text-white flex items-center gap-2">
                ZeroRTC <span className="text-[#666]">//</span>{' '}
                <span className="text-[#00FF41]">Call</span>
              </h1>
              <p className="text-[10px] text-[#666] uppercase tracking-widest hidden sm:block">
                One peer per device · {meta.packageLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-[11px] uppercase tracking-widest text-[#666]">
            <div
              className={`px-2 py-1 bg-[#1F1F23] border text-[10px] ${
                mode === 'semantic'
                  ? 'text-[#00FF41] border-[#00FF41]'
                  : 'text-[#E0E0E0] border-[#333]'
              }`}
            >
              {mode === 'semantic' ? 'Telemetry' : 'Pixel'} mode
            </div>
            {telemetryActive && (
              <div className="px-2 py-1 border border-[#00FF41]/40 text-[#00FF41] text-[10px]">
                Squats {squatReps}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCodeModalOpen(true)}
              className="px-2.5 py-1 bg-[#121214] border border-[#1F1F23] hover:border-[#00FF41]/40 text-[#E0E0E0] text-[10px] flex items-center gap-1.5 cursor-pointer"
            >
              <Code className="w-3.5 h-3.5 text-[#00FF41]" />
              API
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5 flex-1 w-full">
        <section className="bg-[#0D0D10] border border-[#1F1F23] p-4 sm:p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2 text-[11px] text-[#00FF41] font-bold uppercase tracking-widest">
                <Zap className="w-3.5 h-3.5" />
                Product call surface
              </div>
              <p className="text-xs sm:text-[13px] text-[#999] leading-relaxed">
                Each browser is <strong className="text-[#E0E0E0]">one person</strong>. Pick a
                signaling package, share peer IDs, then call. Media is always WebRTC P2P; BLE / LAN
                / QR / bus only carry the disposable handshake.
              </p>
              {statusNote && (
                <p className="text-[11px] text-[#00FF41]/90 font-mono pt-1">{statusNote}</p>
              )}
            </div>
            {!inCall ? (
              <button
                type="button"
                onClick={handleCall}
                disabled={!remotePeerId.trim() || isCalling}
                className="shrink-0 px-5 py-2.5 bg-[#00FF41] text-[#0A0A0B] text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <Zap className="w-4 h-4" /> Start Call
              </button>
            ) : (
              <button
                type="button"
                onClick={handleHangup}
                className="shrink-0 px-5 py-2.5 bg-[#FF3B30] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Hang Up
              </button>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-4 space-y-4">
              <TransportSwitcher
                value={transport}
                onChange={handleTransportChange}
                disabled={inCall}
              />

              <div className="border-t border-[#1F1F23] pt-4 space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-[#666] flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> Identity
                </h3>
                <label className="block space-y-1">
                  <span className="text-[10px] text-[#666] uppercase">Your peer ID</span>
                  <div className="flex gap-2">
                    <input
                      value={identityDraft}
                      onChange={(e) => setIdentityDraft(e.target.value)}
                      disabled={inCall}
                      className="flex-1 bg-[#0A0A0B] border border-[#1F1F23] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#00FF41]/50 outline-none disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={inCall}
                      onClick={handleApplyIdentity}
                      className="px-3 py-2 border border-[#1F1F23] hover:border-[#00FF41]/40 text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] text-[#666] uppercase">Remote peer ID</span>
                  <input
                    value={remotePeerId}
                    onChange={(e) => setRemotePeerId(e.target.value.trim())}
                    placeholder="their_peer_id"
                    disabled={inCall}
                    className="w-full bg-[#0A0A0B] border border-[#1F1F23] px-3 py-2 text-xs text-[#E0E0E0] focus:border-[#00FF41]/50 outline-none disabled:opacity-40"
                  />
                </label>
              </div>

              {transport === 'lan' && (
                <div className="border-t border-[#1F1F23] pt-4 space-y-3">
                  <label className="block space-y-1">
                    <span className="text-[10px] text-[#666] uppercase">Relay WebSocket URL</span>
                    <input
                      value={relayUrl}
                      onChange={(e) => setRelayUrl(e.target.value.trim())}
                      disabled={inCall}
                      className="w-full bg-[#0A0A0B] border border-[#1F1F23] px-3 py-2 text-xs text-[#E0E0E0] outline-none disabled:opacity-40"
                    />
                  </label>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span
                      className={
                        lanStatus === 'connected'
                          ? 'text-[#00FF41]'
                          : lanStatus === 'error'
                            ? 'text-[#FF3B30]'
                            : 'text-[#666]'
                      }
                    >
                      {lanStatus}
                    </span>
                    <button
                      type="button"
                      onClick={() => lanRef.current?.requestPeerList()}
                      className="flex items-center gap-1 text-[#999] hover:text-[#00FF41] cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Refresh peers
                    </button>
                  </div>
                  {onlinePeers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {onlinePeers.map((p) => (
                        <button
                          key={p}
                          type="button"
                          disabled={inCall}
                          onClick={() => setRemotePeerId(p)}
                          className="px-2 py-1 text-[10px] border border-[#1F1F23] hover:border-[#00FF41]/50 bg-[#0A0A0B] cursor-pointer disabled:opacity-40"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {transport === 'ble' && (
                <div className="border-t border-[#1F1F23] pt-4">
                  <button
                    type="button"
                    disabled={inCall}
                    onClick={handlePairBle}
                    className="w-full px-3 py-2.5 border border-[#00FF41]/40 text-[#00FF41] text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    <Bluetooth className="w-4 h-4" />
                    {bleReady ? 'Re-pair Bluetooth' : 'Pair Bluetooth'}
                  </button>
                </div>
              )}
            </div>

            {transport === 'qr' && (
              <QRExchange
                outboundPayload={qrOutbound}
                outboundMeta={qrMeta}
                outboundQueue={qrQueue}
                onIngest={handleQrIngest}
                disabled={false}
              />
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <CallStage
              localPeerId={localPeerId}
              remotePeerId={remotePeerId}
              isCalling={isCalling}
              isConnected={inCall}
              incomingCall={Boolean(incomingCall)}
              callSession={callSession}
              localStream={localStream}
              remoteStream={remoteStream}
              currentMode={mode}
              networkStats={stats}
              remoteBlendshapes={blendshapes}
              onInitiateCall={handleCall}
              onAnswerCall={handleAnswer}
              onRejectCall={handleReject}
              onHangup={handleHangup}
              codecEngine={codecEngine}
              squatReps={squatReps}
            />
            {/* engineReady consumed to satisfy recreate cycle visibility in debug */}
            <span className="sr-only">{engineReady}</span>
          </div>
        </section>

        <section className="border border-[#1F1F23] bg-[#0D0D10]">
          <button
            type="button"
            onClick={() => setShowEngineer((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-[#121214]"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-[#E0E0E0]">
              Engineer tools
            </span>
            <span className="text-[10px] text-[#666] uppercase tracking-wider flex items-center gap-2">
              Chaos · disposable server · signal log
              {showEngineer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>
          {showEngineer && (
            <div className="border-t border-[#1F1F23] p-4 space-y-5">
              <NetworkChaosControl
                isServerOnline={isServerOnline}
                onToggleServer={handleToggleServer}
                droppedPackets={droppedPackets}
                simulatedLoss={simulatedLoss}
                onLossChange={setSimulatedLoss}
                simulatedBandwidth={simulatedBandwidth}
                onBandwidthChange={setSimulatedBandwidth}
                activeStats={stats}
                currentMode={mode}
                onForceMode={handleForceMode}
                forceMode={forceMode}
                healthyCounterSec={healthyCounterSec}
              />
              <InBandSignalingLog logs={signalLogs} onClearLogs={() => setSignalLogs([])} />
            </div>
          )}
        </section>
      </main>

      <footer className="h-10 bg-[#0A0A0B] border-t border-[#1F1F23] flex items-center justify-between px-6 text-[9px] text-[#444] uppercase tracking-tighter shrink-0">
        <div className="flex gap-4">
          <span>core · mesh · telemetry</span>
          <span>Disposable signaling → in-band control</span>
        </div>
        <div className="text-[#666] italic">Two devices. One call.</div>
      </footer>

      <CodeExportModal isOpen={isCodeModalOpen} onClose={() => setIsCodeModalOpen(false)} />
    </div>
  );
}
