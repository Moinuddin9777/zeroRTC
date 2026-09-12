/**
 * LocalIPSignaling — lightweight WebSocket signaling for LAN / mDNS peers.
 *
 * Designed to run against a tiny local WS relay (same device or LAN broadcast
 * discovery). Implements ISignalingChannel so @zerortc/core can dispose it
 * the instant the control DataChannel opens — no internet required.
 */

import type { ISignalingChannel, ISignalingChannelFactory } from '@zerortc/core';

export interface LocalIPSignalingOptions {
  /** e.g. ws://192.168.1.20:9000 or ws://localhost:9000 */
  url: string;
  localPeerId: string;
  remotePeerId: string;
  /** Optional protocols / auth token query */
  protocols?: string | string[];
}

export class LocalIPSignaling implements ISignalingChannel {
  private ws: WebSocket | null = null;
  private open = false;
  private readonly handlers = new Set<(m: string) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private readonly outboundQueue: string[] = [];
  private disposed = false;

  constructor(private readonly opts: LocalIPSignalingOptions) {
    this.connect();
  }

  get isOpen(): boolean {
    return this.open && !this.disposed;
  }

  send(message: string): void {
    if (this.disposed) return;
    const envelope = JSON.stringify({
      from: this.opts.localPeerId,
      to: this.opts.remotePeerId,
      body: message,
    });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(envelope);
    } else {
      this.outboundQueue.push(envelope);
    }
  }

  onMessage(handler: (message: string) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.open = false;
    this.outboundQueue.length = 0;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.handlers.clear();
    this.closeHandlers.forEach((h) => h());
    this.closeHandlers.clear();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.opts.url, this.opts.protocols);
    } catch (err) {
      console.error('[LocalIPSignaling] WebSocket construct failed:', err);
      return;
    }

    this.ws.onopen = () => {
      this.open = true;
      // Announce presence for simple LAN relays
      this.ws?.send(
        JSON.stringify({
          type: 'hello',
          peerId: this.opts.localPeerId,
        })
      );
      while (this.outboundQueue.length) {
        this.ws?.send(this.outboundQueue.shift()!);
      }
    };

    this.ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        const parsed = JSON.parse(ev.data) as {
          to?: string;
          from?: string;
          body?: string;
          type?: string;
        };
        if (parsed.type === 'hello') return;
        if (parsed.to && parsed.to !== this.opts.localPeerId) return;
        if (parsed.body) {
          this.handlers.forEach((h) => h(parsed.body!));
        }
      } catch {
        // Bare SDP string passthrough
        this.handlers.forEach((h) => h(ev.data as string));
      }
    };

    this.ws.onclose = () => {
      this.open = false;
      if (!this.disposed) {
        this.closeHandlers.forEach((h) => h());
      }
    };

    this.ws.onerror = () => {
      /* onclose follows */
    };
  }
}

export interface LocalIPSignalingFactoryOptions {
  url: string;
  localPeerId: string;
  protocols?: string | string[];
}

export class LocalIPSignalingFactory implements ISignalingChannelFactory {
  constructor(private readonly opts: LocalIPSignalingFactoryOptions) {}

  create(remotePeerId: string): ISignalingChannel {
    return new LocalIPSignaling({
      url: this.opts.url,
      localPeerId: this.opts.localPeerId,
      remotePeerId,
      protocols: this.opts.protocols,
    });
  }
}

/**
 * Minimal in-browser LAN relay for demos (no Node server required).
 * Uses BroadcastChannel to simulate mDNS-discovered peers on the same machine.
 * For a real LAN, point LocalIPSignaling at any tiny WS fan-out (e.g. `ws` npm).
 */
export class BroadcastLanRelay {
  private readonly bc: BroadcastChannel;
  private readonly peers = new Set<string>();

  constructor(channelName = 'zerortc-lan') {
    this.bc = new BroadcastChannel(channelName);
  }

  /** Attach a LocalIP-compatible handler that receives demuxed bodies. */
  subscribe(localPeerId: string, onBody: (from: string, body: string) => void): () => void {
    const listener = (ev: MessageEvent) => {
      const data = ev.data as { from?: string; to?: string; body?: string; type?: string; peerId?: string };
      if (data.type === 'hello' && data.peerId) {
        this.peers.add(data.peerId);
        return;
      }
      if (data.to === localPeerId && data.from && data.body) {
        onBody(data.from, data.body);
      }
    };
    this.bc.addEventListener('message', listener);
    this.bc.postMessage({ type: 'hello', peerId: localPeerId });
    return () => this.bc.removeEventListener('message', listener);
  }

  publish(from: string, to: string, body: string): void {
    this.bc.postMessage({ from, to, body });
  }

  close(): void {
    this.bc.close();
    this.peers.clear();
  }
}
