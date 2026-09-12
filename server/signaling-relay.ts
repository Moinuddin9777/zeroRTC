/**
 * ZeroRTC disposable signaling relay — LAN / Internet fan-out.
 *
 * Peers announce with { type: 'hello', peerId } then exchange
 * { from, to, body } envelopes. Media is never relayed — only the
 * initial SDP/ICE handshake (then CallSession disposes this path).
 *
 * Usage:
 *   npm run relay
 *   # → ws://0.0.0.0:9000  (devices on same Wi-Fi or via public host)
 */

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

const PORT = Number(process.env.SIGNAL_PORT ?? 9000);
const HOST = process.env.SIGNAL_HOST ?? '0.0.0.0';

interface PeerSocket extends WebSocket {
  peerId?: string;
}

interface Envelope {
  type?: string;
  peerId?: string;
  from?: string;
  to?: string;
  body?: string;
}

const peers = new Map<string, PeerSocket>();

function listPeers(): string[] {
  return [...peers.keys()];
}

function broadcastPresence(): void {
  const payload = JSON.stringify({ type: 'peers', peers: listPeers() });
  for (const sock of peers.values()) {
    if (sock.readyState === sock.OPEN) sock.send(payload);
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      service: 'zerortc-signaling-relay',
      peers: listPeers(),
      ws: `ws://<host>:${PORT}`,
    })
  );
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket: PeerSocket) => {
  socket.on('message', (raw) => {
    let msg: Envelope;
    try {
      msg = JSON.parse(String(raw)) as Envelope;
    } catch {
      return;
    }

    if (msg.type === 'hello' && typeof msg.peerId === 'string' && msg.peerId.length > 0) {
      const id = msg.peerId.trim();
      const existing = peers.get(id);
      if (existing && existing !== socket) {
        try {
          existing.close(4000, 'replaced');
        } catch {
          /* ignore */
        }
      }
      socket.peerId = id;
      peers.set(id, socket);
      socket.send(JSON.stringify({ type: 'welcome', peerId: id, peers: listPeers() }));
      broadcastPresence();
      return;
    }

    if (msg.type === 'peers') {
      socket.send(JSON.stringify({ type: 'peers', peers: listPeers() }));
      return;
    }

    if (msg.from && msg.to && typeof msg.body === 'string') {
      const target = peers.get(msg.to);
      if (target && target.readyState === target.OPEN) {
        target.send(JSON.stringify({ from: msg.from, to: msg.to, body: msg.body }));
      }
      return;
    }
  });

  socket.on('close', () => {
    if (socket.peerId && peers.get(socket.peerId) === socket) {
      peers.delete(socket.peerId);
      broadcastPresence();
    }
  });

  socket.on('error', () => {
    /* close follows */
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[zerortc-relay] listening on ws://${HOST}:${PORT}`);
  console.log(`[zerortc-relay] open two browsers → pick LAN transport → same relay URL`);
});
