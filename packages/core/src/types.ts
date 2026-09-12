/**
 * ZeroRTC shared types — keep payload shapes binary-friendly and JSON-minimal.
 */

export type NetworkQuality = 'good' | 'poor' | 'critical';

export type ControlMessageType =
  | 'offer'
  | 'answer'
  | 'ice'
  | 'mute'
  | 'camera-swap'
  | 'hangup'
  | 'ping'
  | 'mode'
  | 'media-state';

export interface ControlMessage {
  t: ControlMessageType;
  /** SDP string for offer/answer */
  s?: string;
  /** ICE candidate JSON */
  c?: RTCIceCandidateInit;
  /** Boolean flags / mode string */
  v?: string | boolean | number;
  /** Monotonic ms — debug only; never used for glare */
  ts?: number;
}

export type RTCMode = 'pixel' | 'semantic';

export interface NetworkStats {
  timestamp: number;
  packetsLost: number;
  fractionLost: number;
  jitter: number;
  bitrateKbps: number;
  framesDropped: number;
  rttMs: number;
  quality: NetworkQuality;
  isCritical: boolean;
  mode: RTCMode;
}

export interface ZeroRTCOptions {
  localPeerId: string;
  /** Injected signaling factory (mesh BLE / LAN / QR / app backend). */
  signaling: import('./interfaces/ISignalingChannel').ISignalingChannelFactory;
  peerFactory?: import('./interfaces/IPeerConnection').IPeerConnectionFactory;
  iceServers?: import('./interfaces/IPeerConnection').IceServerConfig[];
  statsIntervalMs?: number;
}

export interface CallRequest {
  callerId: string;
  answer: (localStream?: MediaStream) => Promise<import('./CallSession').CallSession>;
  reject: () => void;
}

export type SignalLogChannel = 'external-signaling' | 'in-band-datachannel';

export interface SignalEventLog {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  channel: SignalLogChannel;
  type: ControlMessageType;
  bytes: number;
  summary: string;
}
