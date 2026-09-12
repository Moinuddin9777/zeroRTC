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

interface PeerWindowProps {
  id: string;
  peerName: string;
  targetPeerId: string;
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
}

export const PeerWindow: React.FC<PeerWindowProps> = ({
  id,
  peerName,
  targetPeerId,
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
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const neuralCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showBlendshapeDebugger, setShowBlendshapeDebugger] = useState(false);

  // Bind local media stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream for Mode A (Pixel RTC)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Render Neural Reconstruction loop for Mode B (Semantic RTC)
  useEffect(() => {
    let animFrameId: number;

    const renderLoop = () => {
      if (neuralCanvasRef.current && currentMode === 'semantic') {
        const dummyArray = remoteBlendshapes || new Float32Array(16);
        codecEngine.renderNeuralReconstruction(
          neuralCanvasRef.current,
          dummyArray,
          null, // uses cached keyframe or synthetic subject
          { showWireframe, showTelemetry: true }
        );
      }
      animFrameId = requestAnimationFrame(renderLoop);
    };

    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [currentMode, remoteBlendshapes, showWireframe, codecEngine]);

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = isAudioMuted;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoMuted;
      });
      setIsVideoMuted(!isVideoMuted);
    }
  };

  return (
    <div id={`peer-card-${id}`} className="bg-[#0A0A0B] border border-[#1F1F23] overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="bg-[#0D0D10] px-4 py-2.5 border-b border-[#1F1F23] flex items-center justify-between">
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
          <span className="text-xs font-mono font-bold tracking-wider text-[#E0E0E0] uppercase">{peerName}</span>
          <span className="text-[11px] font-mono text-[#666]">({id})</span>
        </div>

        {/* DataChannel In-Band Status Badge */}
        {isConnected && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono bg-[#1F1F23] text-[#00FF41] border border-[#00FF41]/40 px-2.5 py-0.5 uppercase tracking-wider">
            <Radio className="w-3 h-3 text-[#00FF41] animate-pulse" />
            <span>IN-BAND CONTROL: {callSession?.isControlChannelOpen ? 'ACTIVE' : 'READY'}</span>
          </div>
        )}
      </div>

      {/* Main Viewport Container */}
      <div className="relative aspect-video w-full bg-[#0A0A0B] flex items-center justify-center overflow-hidden border-b border-[#1F1F23]">
        {/* Subtle matrix scan grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />

        {isConnected ? (
          <>
            {/* Mode A: Pixel RTC (Standard WebRTC Video Track) */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${currentMode === 'pixel' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-black/80 backdrop-blur px-2.5 py-1 border border-white/10 text-[10px] font-mono text-[#E0E0E0] flex items-center gap-1.5 uppercase tracking-wider">
                <Video className="w-3.5 h-3.5 text-[#00FF41]" />
                PIXEL STREAM (720p H.264/VP8 ~1.8 Mbps)
              </div>
            </div>

            {/* Mode B: Semantic Neural Fallback (Canvas piecewise mesh warp at < 2 kbps) */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${currentMode === 'semantic' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
              <canvas
                ref={neuralCanvasRef}
                width={480}
                height={360}
                className="w-full h-full object-cover"
              />

              {/* Bandwidth Savings Badge */}
              <div className="absolute top-3 left-3 bg-[#00FF41]/10 backdrop-blur px-3 py-1 border border-[#00FF41]/30 text-[#00FF41] text-[10px] font-mono uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-[#00FF41] animate-pulse" />
                <span>SEMANTIC NEURAL FALLBACK (1.92 kbps)</span>
                <span className="bg-[#00FF41] text-[#0A0A0B] px-1.5 py-0.2 text-[9px] font-bold">
                  99.9% SAVED
                </span>
              </div>

              {/* Neural Mesh Controls Overlay */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  id={`toggle-wireframe-${id}`}
                  onClick={() => setShowWireframe(!showWireframe)}
                  className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all border ${
                    showWireframe
                      ? 'bg-[#00FF41] text-[#0A0A0B] font-bold border-[#00FF41] shadow-[0_0_8px_rgba(0,255,65,0.4)]'
                      : 'bg-[#121214] hover:bg-[#1F1F23] text-[#00FF41] border-[#00FF41]/40'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  {showWireframe ? 'Hide Mesh' : 'Mesh Wireframe'}
                </button>
              </div>

              {/* Bottom Semantic Stream Indicator Bars */}
              <div className="absolute bottom-14 left-4 w-36 grid grid-cols-4 gap-1 pointer-events-none">
                <div className="h-1 bg-[#00FF41]/60 animate-pulse" />
                <div className="h-1 bg-[#00FF41]/60 animate-pulse" />
                <div className="h-1 bg-[#00FF41]/30" />
                <div className="h-1 bg-[#00FF41]/30" />
              </div>
            </div>
          </>
        ) : (
          /* Idle / Disconnected State */
          <div className="text-center p-6 space-y-3 relative z-10">
            <div className="w-14 h-14 bg-[#121214] border border-[#1F1F23] flex items-center justify-center mx-auto text-[#666]">
              <Phone className="w-6 h-6 text-[#00FF41]" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#E0E0E0]">Ready for Connection</p>
              <p className="text-[11px] font-mono text-[#666] mt-0.5">
                Target Node: <span className="text-[#00FF41]">{targetPeerId}</span>
              </p>
            </div>
            {incomingCall ? (
              <div className="pt-2 flex items-center justify-center gap-2">
                <button
                  id={`answer-btn-${id}`}
                  onClick={onAnswerCall}
                  className="px-4 py-2 bg-[#00FF41] hover:bg-[#00FF41]/90 text-[#0A0A0B] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(0,255,65,0.4)] transition-all"
                >
                  <Phone className="w-3.5 h-3.5" /> Answer Call
                </button>
                <button
                  id={`reject-btn-${id}`}
                  onClick={onRejectCall}
                  className="px-4 py-2 bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(255,59,48,0.4)] transition-all"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            ) : (
              <button
                id={`call-btn-${id}`}
                onClick={onInitiateCall}
                disabled={isCalling}
                className="px-5 py-2 bg-[#00FF41] hover:bg-[#00FF41]/90 text-[#0A0A0B] text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-2 mx-auto cursor-pointer shadow-[0_0_12px_rgba(0,255,65,0.35)] transition-all disabled:opacity-50"
              >
                <Phone className="w-3.5 h-3.5" />
                {isCalling ? 'Establishing WebRTC Handshake...' : `Call ${targetPeerId}`}
              </button>
            )}
          </div>
        )}

        {/* Local Stream Picture-in-Picture */}
        <div className="absolute bottom-4 right-4 w-36 sm:w-44 h-24 sm:h-28 bg-[#121214] border border-[#1F1F23] shadow-2xl overflow-hidden group">
          <video
            ref={localVideoRef}
            id="local-video"
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover mirror"
          />
          <div className="absolute top-0 right-0 p-1 bg-black/80 text-[8px] uppercase tracking-wider font-mono text-[#999]">
            Local View
          </div>
          <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#00FF41]" />
        </div>

        {/* Live Network Health Indicator on Screen */}
        {isConnected && networkStats && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur border border-[#1F1F23] px-3 py-1 text-[10px] font-mono text-[#999] flex items-center gap-3">
            <span>BITRATE: <strong className="text-white">{networkStats.bitrateKbps} kbps</strong></span>
            <span>LOSS: <strong className={networkStats.fractionLost > 0.15 ? 'text-[#FF3B30]' : 'text-[#00FF41]'}>{(networkStats.fractionLost * 100).toFixed(0)}%</strong></span>
            <span>RTT: <strong className="text-white">{networkStats.rttMs}ms</strong></span>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="p-3 bg-[#0D0D10] border-t border-[#1F1F23] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            id={`toggle-mic-${id}`}
            onClick={toggleAudio}
            className={`p-2 text-xs transition-all cursor-pointer border ${
              isAudioMuted
                ? 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/40'
                : 'bg-[#121214] hover:bg-[#1F1F23] text-[#E0E0E0] border-[#1F1F23]'
            }`}
            title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            id={`toggle-cam-${id}`}
            onClick={toggleVideo}
            className={`p-2 text-xs transition-all cursor-pointer border ${
              isVideoMuted
                ? 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/40'
                : 'bg-[#121214] hover:bg-[#1F1F23] text-[#E0E0E0] border-[#1F1F23]'
            }`}
            title={isVideoMuted ? 'Enable Camera' : 'Disable Camera'}
          >
            {isVideoMuted ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>

          <button
            id={`toggle-blendshapes-debugger-${id}`}
            onClick={() => setShowBlendshapeDebugger(!showBlendshapeDebugger)}
            className="p-2 text-xs bg-[#121214] hover:bg-[#1F1F23] text-[#00FF41] border border-[#1F1F23] hover:border-[#00FF41]/40 transition-all cursor-pointer"
            title="Inspect 16-Blendshape Telemetry Vector"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>

        {isConnected && (
          <button
            id={`hangup-btn-${id}`}
            onClick={onHangup}
            className="px-3.5 py-1.5 bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(255,59,48,0.3)] transition-all"
          >
            <PhoneOff className="w-3.5 h-3.5" /> End Call
          </button>
        )}
      </div>

      {/* Blendshapes Telemetry Debugger (Collapsible) */}
      {showBlendshapeDebugger && (
        <div className="p-3 bg-[#0A0A0B] border-t border-[#1F1F23] text-[10px] font-mono text-[#999] space-y-1.5">
          <div className="flex justify-between items-center text-[#E0E0E0]">
            <span className="font-bold uppercase text-[#00FF41]">P2P Blendshapes Float32Array (64 Bytes):</span>
            <span className="text-[#666]">Rate: 30 Hz</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">Jaw Open: {((remoteBlendshapes?.[0] || 0)).toFixed(2)}</div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">Mouth Smile: {((remoteBlendshapes?.[1] || 0)).toFixed(2)}</div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">Blink L/R: {((remoteBlendshapes?.[3] || 0)).toFixed(2)} / {((remoteBlendshapes?.[4] || 0)).toFixed(2)}</div>
            <div className="bg-[#0D0D10] border border-[#1F1F23] p-1.5">Head Yaw: {((remoteBlendshapes?.[8] || 0)).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
};
