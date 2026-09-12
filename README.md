# ZeroRTC

<img width="1376" height="768" alt="image_e8a4ef79" src="https://github.com/user-attachments/assets/934ca205-f214-4ce4-b869-91d46478c6a3" />


**Elevator pitch.** ZeroRTC is a data-channel-first WebRTC stack that throws away the signaling server the instant the call is up: peers handshake over LAN, Bluetooth, QR, or a shared bus, then all control (mute, ICE, hangup) rides in-band while media stays pure P2P — and when the network dies, video flips to binary AI pose/biometric telemetry under ~2 kbps so the session never goes dark.

Hyper-optimized, modular WebRTC ecosystem — **Data-Channel First**, disposable signaling, and AI telemetry under 2 kbps.

| Package | Role |
|---------|------|
| `@zerortc/core` | Base engine: `ZeroRTC`, `CallSession`, `NetworkMonitor`, `ISignalingChannel` |
| `@zerortc/mesh` | Off-grid adapters: BLE GATT chunking, LAN WebSocket, QR gzip |
| `@zerortc/telemetry` | ML-agnostic video interceptor + binary pose/biometric packing |

Phase 1 is Web/TypeScript. Phase 2 (Flutter) swaps `IPeerConnectionFactory` / signaling transports for Dart FFI — business logic stays untouched.

---

## Quick start

```bash
npm install
npm run relay   # terminal 1 — LAN/Internet signaling on :9000
npm run dev     # terminal 2 — product UI on :3000 (host 0.0.0.0)
```

Open the UI on **two devices** (or two browsers). Each window is one peer:

1. Choose a signaling package (LAN / same-device tabs / Bluetooth / QR).
2. Set distinct peer IDs; on LAN, pick the remote from the online list (or type it).
3. One side taps **Start Call**, the other **Answer**.

| Transport | Package | How to test |
|-----------|---------|-------------|
| **LAN / Internet** | `@zerortc/mesh` LocalIP protocol via relay | Same Wi-Fi: `ws://<lan-ip>:9000`. Anywhere: host the relay and use that `ws://` / `wss://` URL. |
| **Same device (tabs)** | `@zerortc/core` BusSignaling | Two tabs, different peer IDs — no relay. |
| **Bluetooth** | `@zerortc/mesh` BLESignaling | Web Bluetooth central ↔ ZeroRTC GATT peripheral (Phase 2 native advertises). |
| **QR / paste** | `@zerortc/mesh` QRSignaling | Call → copy/show code → remote pastes → answer code returns. |

Engineer tools (chaos, kill disposable bus, signal log) stay under a collapsible panel. Media is always WebRTC P2P after the disposable handshake.

---

## 1. Initialize `@zerortc/core`

```ts
import { ZeroRTC, BusSignalingFactory } from '@zerortc/core';

const signaling = new BusSignalingFactory({
  localPeerId: 'alice',
  send: (from, to, body) => myBackend.push(from, to, body),
  register: (id, handler) => myBackend.subscribe(id, handler),
});

const rtc = new ZeroRTC({
  localPeerId: 'alice',
  signaling,
});

// Host demux — required when using a shared message bus
myBackend.onMessage((from, body) => rtc.receiveSignal(from, body));

rtc.onIncoming(async (req) => {
  const session = await req.answer(localStream);
  session.onRemoteStream((s) => (remoteVideo.srcObject = s));
});

const session = await rtc.call('bob', localStream);
```

### Disposable signaling

1. External `ISignalingChannel` carries **only** the initial SDP/ICE handshake.
2. Initiator opens a reliable `control` DataChannel immediately.
3. The millisecond it opens → `signaling.dispose()`.
4. Mute, camera-swap, hangup, and trickle ICE ride **in-band**.

### O(1) glare

```ts
polite = localPeerId > remotePeerId   // lexical only — no clocks
```

### Transceiver dominance

Media uses `pc.addTransceiver()` (not `addTrack()`), so mute/unmute never tears renegotiation.

### NetworkMonitor

Polls `getStats()` and emits `'good' | 'poor' | 'critical'` (plus `'recovered'` after 5s healthy).

---

## 2. Inject `@zerortc/mesh` BLE adapter

SDPs are 2–5 KB; BLE ATT MTU is ~512 B. `BLESignaling` chunks deterministically:

```
[msgId:u16][chunk_index:u16][total_chunks:u16][payload...]
```

```ts
import { ZeroRTC } from '@zerortc/core';
import { BLESignalingFactory, LoopbackBLETransport } from '@zerortc/mesh';

const radioA = new LoopbackBLETransport(512);
const radioB = new LoopbackBLETransport(512);
LoopbackBLETransport.pair(radioA, radioB);

const signaling = new BLESignalingFactory(() => radioA);
const rtc = new ZeroRTC({ localPeerId: 'alice', signaling });

// Production: requestWebBluetoothTransport() from a user-gesture click
```

Also available:

- `LocalIPSignaling` / `LocalIPSignalingFactory` — LAN WebSocket (`ws://192.168.x.x:9000`)
- `QRSignaling` — gzip + Base64 SDP for QR scan exchange

---

## 3. Attach `@zerortc/telemetry` (kill video, stream squat reps)

When the network drops into the death zone:

```ts
import { TelemetryEngine, SyntheticPoseExtractor } from '@zerortc/telemetry';

const telemetry = new TelemetryEngine({
  extractor: new SyntheticPoseExtractor(), // or your MediaPipe ITelemetryExtractor
  fps: 15,
});

telemetry.attach(session);
telemetry.onBiometricUpdate((m) => {
  dashboard.setReps(m.squatReps); // stays in sync with Opus audio
});
telemetry.onPoseUpdate((landmarks) => {
  canvas.drawSkeleton(landmarks);
});

session.networkMonitorRef.on('critical', () => {
  // Pauses RTCRtpSender video track — frees bandwidth
  telemetry.start(localVideoEl, session.getVideoSender());
});

session.networkMonitorRef.on('recovered', () => {
  telemetry.stop(); // restores pixel video
});
```

### Binary packing (no JSON on the wire)

```
magic | ver | flags | landmarkCount | seq | metricCount | Int8 landmarks | Float32 metrics
```

33 landmarks × 3 × int8 ≈ **109 bytes/frame → ~1.6 kbps @ 15 Hz**.

Inject any model via `ITelemetryExtractor` — MediaPipe is **not** hardcoded.

---

## Monorepo layout

```
packages/
  core/src/     # ZeroRTC engine
  mesh/src/     # BLE · LAN · QR adapters
  telemetry/src/
server/
  signaling-relay.ts   # disposable WS fan-out for LAN / hosted Internet
src/                   # product call UI (one peer per browser)
```

```bash
npm run build:packages   # emit dist/ for each package
npm run relay            # signaling on :9000
npm run dev              # product UI on :3000
```

---

## Phase 2 (Flutter) readiness

| Web (Phase 1) | Native (Phase 2) |
|---------------|------------------|
| `BrowserPeerConnectionFactory` | Dart FFI / libwebrtc wrapper implementing `IPeerConnection` |
| `BLESignaling` + Web Bluetooth | Flutter Blue Plus GATT writes |
| `HTMLVideoElement` interceptor | `Texture` / `ImageProxy` frame pump |
| `ITelemetryExtractor` | Same interface over TFLite / MediaPipe Android/iOS |

Keep call orchestration inside `CallSession` — only swap the factories.
