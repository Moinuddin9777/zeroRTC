/**
 * Browser client for the ZeroRTC signaling relay (LAN or hosted Internet).
 * Same envelope protocol as @zerortc/mesh LocalIPSignaling.
 */

export type LanMessageHandler = (from: string, body: string) => void;
export type LanStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LanRelayClientOptions {
  url: string;
  localPeerId: string;
  onStatus?: (status: LanStatus, detail?: string) => void;
  onPeers?: (peers: string[]) => void;
}

export class LanRelayClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Set<LanMessageHandler>();
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(private readonly opts: LanRelayClientOptions) {}

  connect(): void {
    if (this.disposed) return;
    this.intentionalClose = false;
    this.cleanupSocket();
    this.opts.onStatus?.('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch (err) {
      this.opts.onStatus?.('error', err instanceof Error ? err.message : 'Invalid URL');
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', peerId: this.opts.localPeerId }));
      this.opts.onStatus?.('connected');
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          from?: string;
          to?: string;
          body?: string;
          peers?: string[];
        };
        if (msg.type === 'peers' || msg.type === 'welcome') {
          if (Array.isArray(msg.peers)) this.opts.onPeers?.(msg.peers);
          return;
        }
        if (msg.type === 'hello') return;
        if (msg.to && msg.to !== this.opts.localPeerId) return;
        if (msg.from && msg.body) {
          this.handlers.forEach((h) => h(msg.from!, msg.body!));
        }
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.disposed || this.intentionalClose) {
        this.opts.onStatus?.('disconnected');
        return;
      }
      this.opts.onStatus?.('disconnected', 'Connection lost — retrying…');
      this.reconnectTimer = setTimeout(() => this.connect(), 1500);
    };

    ws.onerror = () => {
      this.opts.onStatus?.('error', 'WebSocket error — is the relay running?');
    };
  }

  send(from: string, to: string, body: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ from, to, body }));
  }

  onMessage(handler: LanMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  requestPeerList(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: 'peers' }));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  dispose(): void {
    this.disposed = true;
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanupSocket();
    this.handlers.clear();
  }

  private cleanupSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}

/** Guess a LAN relay URL for this page (same host, port 9000). */
export function defaultRelayUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:9000';
  const host = window.location.hostname || 'localhost';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Dev UI is on :3000; relay defaults to :9000
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'ws://localhost:9000';
  }
  return `${proto}//${host}:9000`;
}
