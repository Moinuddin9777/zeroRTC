import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Cpu,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  Sliders,
  Sparkles,
  Video,
} from 'lucide-react';
import type { CallSession, NetworkStats, RTCMode } from '@zerortc/core';
import { CarmackNeuralEngine } from '../lib/SemanticCodecEngine';

interface CallStageProps {
  localPeerId: string;
  remotePeerId: string;
  isCalling: boolean;
  isConnected: boolean;
  incomingCall: boolean;
  callSession: CallSession | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  currentMode: RTCMode;
  networkStats: NetworkStats | null;
  remoteBlendshapes: Float32Array | null;
  onInitiateCall: () => void;
  onAnswerCall: () => void;
  onRejectCall: () => void;
  onHangup: () => void;
  codecEngine: CarmackNeuralEngine;
  squatReps?: number;
}

export const CallStage: React.FC<CallStageProps> = ({
  localPeerId,
  remotePeerId,
  isCalling,
  isConnected,
  incomingCall,
  callSession,
  localStream,
  remoteStream,
  currentMode,
  networkStats,
  remoteBlendshapes,
  onInitiateCall,
  onAnswerCall,
  onRejectCall,
  onHangup,
  codecEngine,
  squatReps = 0,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const neuralCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showBlendshapeDebugger, setShowBlendshapeDebugger] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    let animFrameId: number;
    const renderLoop = () => {
      if (neuralCanvasRef.current && currentMode === 'semantic') {
        const dummyArray = remoteBlendshapes || new Float32Array(16);
        codecEngine.renderNeuralReconstruction(neuralCanvasRef.current, dummyArray, null, {
          showWireframe,
          showTelemetry: true,
        });
      }
      animFrameId = requestAnimationFrame(renderLoop);
    };
    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [currentMode, remoteBlendshapes, showWireframe, codecEngine]);

  const toggleAudio = () => {
    if (!localStream) return;
    const next = !isAudioMuted;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    callSession?.setTrackEnabled('audio', !next);
    setIsAudioMuted(next);
  };

  const toggleVideo = () => {
    if (!localStream) return;
    const next = !isVideoMuted;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    callSession?.setTrackEnabled('video', !next);
    setIsVideoMuted(next);
  };

  return (
    <div
      id="call-stage"
      className="bg-[#0A0A0B] border border-[#1F1F23] overflow-hidden flex flex-col"
    >
      <div className="bg-[#0D0D10] px-4 py-2.5 border-b border-[#1F1F23] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-[#00FF41] shadow-[0_0_6px_#00FF41]'
                : isCalling
                  ? 'bg-[#00FF41] animate-ping'
                  : 'bg-[#444]'
            }`}
          />
          <span className="text-xs font-mono font-bold tracking-wider text-[#E0E0E0] uppercase">
            {isConnected ? `In call with ${remotePeerId}` : 'Ready'}
          </span>
          <span className="text-[11px] font-mono text-[#666]">you · {localPeerId}</span>
        </div>

        {isConnected && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono bg-[#1F1F23] text-[#00FF41] border border-[#00FF41]/40 px-2.5 py-0.5 uppercase tracking-wider">
            <Radio className="w-3 h-3 animate-pulse" />
            In-band: {callSession?.isControlChannelOpen ? 'Active' : 'Ready'}
          </div>
        )}
      </div>

      <div className="relative aspect-video w-full bg-[#0A0A0B] flex items-center justify-center overflow-hidden border-b border-[#1F1F23]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

        {isConnected ? (
          <>
            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                currentMode === 'pixel'
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur px-2.5 py-1 border border-white/10 text-[10px] font-mono text-[#E0E0E0] flex items-center gap-1.5 uppercase tracking-wider">
                <Video className="w-3.5 h-3.5 text-[#00FF41]" />
                Pixel stream · remote
              </div>
            </div>

            <div
              className={`absolute inset-0 transition-opacity duration-300 ${
                currentMode === 'semantic'
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
            >
              <canvas
                ref={neuralCanvasRef}
                width={480}
                height={360}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-[#00FF41]/10 backdrop-blur px-3 py-1 border border-[#00FF41]/30 text-[#00FF41] text-[10px] font-mono uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 animate-pulse" />
                <span>Semantic fallback (&lt; 2 kbps)</span>
                {squatReps > 0 && (
                  <span className="bg-[#00FF41] text-[#0A0A0B] px-1.5 text-[9px] font-bold">
                    Squats {squatReps}
                  </span>
                )}
              </div>
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => setShowWireframe(!showWireframe)}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 cursor-pointer border ${
                    showWireframe
                      ? 'bg-[#00FF41] text-[#0A0A0B] font-bold border-[#00FF41]'
                      : 'bg-[#121214] text-[#00FF41] border-[#00FF41]/40'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Mesh
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center p-6 space-y-3 relative z-10">
            <div className="w-14 h-14 bg-[#121214] border border-[#1F1F23] flex items-center justify-center mx-auto text-[#666]">
              <Phone className="w-6 h-6 text-[#00FF41]" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#E0E0E0]">
                {incomingCall ? 'Incoming call' : 'Waiting to connect'}
              </p>
              <p className="text-[11px] font-mono text-[#666] mt-0.5">
                Remote:{' '}
                <span className="text-[#00FF41]">{remotePeerId || 'set remote peer id'}</span>
              </p>
            </div>
            {incomingCall ? (
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onAnswerCall}
                  className="px-4 py-2 bg-[#00FF41] text-[#0A0A0B] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <Phone className="w-3.5 h-3.5" /> Answer
                </button>
                <button
                  type="button"
                  onClick={onRejectCall}
                  className="px-4 py-2 bg-[#FF3B30] text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onInitiateCall}
                disabled={isCalling || !remotePeerId}
                className="px-5 py-2 bg-[#00FF41] text-[#0A0A0B] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 mx-auto cursor-pointer disabled:opacity-50"
              >
                <Phone className="w-3.5 h-3.5" />
                {isCalling ? 'Connecting…' : `Call ${remotePeerId || '…'}`}
              </button>
            )}
          </div>
        )}

        <div className="absolute bottom-4 right-4 w-32 sm:w-40 h-20 sm:h-24 bg-[#121214] border border-[#1F1F23] overflow-hidden">
          <video
            ref={localVideoRef}
            id="local-video"
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="absolute top-0 right-0 p-1 bg-black/80 text-[8px] uppercase tracking-wider font-mono text-[#999]">
            You
          </div>
        </div>

        {isConnected && networkStats && (
          <div className="absolute bottom-4 left-4 bg-black/80 border border-[#1F1F23] px-3 py-1 text-[10px] font-mono text-[#999] flex items-center gap-3">
            <span>
              BITRATE:{' '}
              <strong className="text-white">{networkStats.bitrateKbps} kbps</strong>
            </span>
            <span>
              LOSS:{' '}
              <strong
                className={
                  networkStats.fractionLost > 0.15 ? 'text-[#FF3B30]' : 'text-[#00FF41]'
                }
              >
                {(networkStats.fractionLost * 100).toFixed(0)}%
              </strong>
            </span>
            <span>
              RTT: <strong className="text-white">{networkStats.rttMs}ms</strong>
            </span>
          </div>
        )}
      </div>

      <div className="p-3 bg-[#0D0D10] border-t border-[#1F1F23] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAudio}
            className={`p-2 border cursor-pointer ${
              isAudioMuted
                ? 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/40'
                : 'bg-[#121214] text-[#E0E0E0] border-[#1F1F23]'
            }`}
            title={isAudioMuted ? 'Unmute' : 'Mute'}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={toggleVideo}
            className={`p-2 border cursor-pointer ${
              isVideoMuted
                ? 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/40'
                : 'bg-[#121214] text-[#E0E0E0] border-[#1F1F23]'
            }`}
            title={isVideoMuted ? 'Camera on' : 'Camera off'}
          >
            {isVideoMuted ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setShowBlendshapeDebugger(!showBlendshapeDebugger)}
            className="p-2 bg-[#121214] text-[#00FF41] border border-[#1F1F23] cursor-pointer"
            title="Telemetry debugger"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>

        {isConnected && (
          <button
            type="button"
            onClick={onHangup}
            className="px-3.5 py-1.5 bg-[#FF3B30] text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
          >
            <PhoneOff className="w-3.5 h-3.5" /> End Call
          </button>
        )}
      </div>

      {showBlendshapeDebugger && (
        <div className="p-3 bg-[#0A0A0B] border-t border-[#1F1F23] text-[10px] font-mono text-[#999] space-y-1.5">
          <div className="flex justify-between text-[#E0E0E0]">
            <span className="font-bold uppercase text-[#00FF41]">Telemetry vector</span>
            <span className="text-[#666]">@zerortc/telemetry</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">
              Jaw: {(remoteBlendshapes?.[0] || 0).toFixed(2)}
            </div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">
              Smile: {(remoteBlendshapes?.[1] || 0).toFixed(2)}
            </div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">
              Blink: {(remoteBlendshapes?.[3] || 0).toFixed(2)} /{' '}
              {(remoteBlendshapes?.[4] || 0).toFixed(2)}
            </div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">
              Yaw: {(remoteBlendshapes?.[8] || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
