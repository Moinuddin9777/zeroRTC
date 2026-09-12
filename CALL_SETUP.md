# Two-machine call setup

ZeroRTC: disposable signaling handshake → WebRTC P2P media.  
**Best for two machines on the same Wi‑Fi: LAN mode.**

---

## 1. One-time setup (both machines)

```bash
cd zeroRTC
npm install
```

Need Node.js 18+.

---

## 2. Start services (pick one host machine)

On **Machine A** (the host):

```bash
# terminal 1 — signaling relay
npm run relay

# terminal 2 — UI
npm run dev
```

Relay: `ws://0.0.0.0:9000` · UI: `http://0.0.0.0:3000`

Find Machine A’s LAN IP (e.g. `192.168.1.42`):

```bash
# macOS
ipconfig getifaddr en0
```

Allow camera/mic in the browser when prompted.

---

## 3. Open UI on both machines

| Machine | URL |
|---------|-----|
| A (host) | `http://localhost:3000` |
| B | `http://<A-LAN-IP>:3000` |

Example: `http://192.168.1.42:3000`

---

## 4. Start a call (LAN)

On **both** browsers:

1. Signaling package → **LAN / Internet**
2. Relay URL → `ws://<A-LAN-IP>:9000` (same on both)
3. Set **different** peer IDs (e.g. `alice` / `bob`) → Save
4. Wait until status shows **connected**; remote should appear in the online list
5. Set **Remote peer ID** to the other person’s ID
6. Caller taps **Start Call** → callee taps **Answer**

Video appears when the P2P link is up. Hang up either side when done.

---

## Other modes (optional)

| Mode | When | How |
|------|------|-----|
| **QR / Paste** | No shared Wi‑Fi / no relay | Choose QR → Start Call → copy/show code → other pastes → answer code returns |
| **Same Device (Tabs)** | One machine only | Two tabs, different peer IDs, no relay |
| **Bluetooth** | Offline BLE | Web Bluetooth central ↔ GATT peripheral (limited on desktop browsers) |

---

## Quick checklist

- [ ] Relay running on host (`npm run relay`)
- [ ] Both open UI over the **host LAN IP** (not `localhost` on Machine B)
- [ ] Both use the same `ws://<host-ip>:9000`
- [ ] Distinct peer IDs
- [ ] Camera/mic allowed
- [ ] Same Wi‑Fi (for LAN); firewall allows ports **3000** and **9000**
