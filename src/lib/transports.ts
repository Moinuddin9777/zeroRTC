/** Signaling transport modes exposed in the product UI. */
export type SignalingTransport = 'bus' | 'lan' | 'ble' | 'qr';

export interface TransportMeta {
  id: SignalingTransport;
  packageLabel: string;
  title: string;
  subtitle: string;
  /** Where this works without extra hardware. */
  reach: string;
}

export const TRANSPORTS: TransportMeta[] = [
  {
    id: 'lan',
    packageLabel: '@zerortc/mesh · LocalIPSignaling',
    title: 'LAN / Internet',
    subtitle: 'WebSocket relay — same Wi-Fi or hosted relay anywhere',
    reach: 'Two phones, laptops, or tabs on a network',
  },
  {
    id: 'bus',
    packageLabel: '@zerortc/core · BusSignaling',
    title: 'Same Device (Tabs)',
    subtitle: 'BroadcastChannel bus — no relay server needed',
    reach: 'Two browser tabs on one machine',
  },
  {
    id: 'ble',
    packageLabel: '@zerortc/mesh · BLESignaling',
    title: 'Bluetooth',
    subtitle: 'GATT chunked SDP — offline, no internet',
    reach: 'Web Bluetooth central ↔ ZeroRTC peripheral',
  },
  {
    id: 'qr',
    packageLabel: '@zerortc/mesh · QRSignaling',
    title: 'QR / Paste',
    subtitle: 'Gzip+Base64 offer/answer exchange by scan or paste',
    reach: 'Any two devices that can share a code',
  },
];

export function transportMeta(id: SignalingTransport): TransportMeta {
  return TRANSPORTS.find((t) => t.id === id) ?? TRANSPORTS[0]!;
}
