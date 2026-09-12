/**
 * In-process / BroadcastChannel signaling factory.
 * Bridges the demo SignalingBus (or any host push API) into ISignalingChannel.
 */

import type { ISignalingChannel, ISignalingChannelFactory } from './interfaces/ISignalingChannel';

export type BusSendFn = (
  from: string,
  to: string,
  payload: string
) => Promise<boolean | void> | boolean | void;
export type BusRegisterFn = (peerId: string, onMessage: (from: string, payload: string) => void) => () => void;

export interface BusSignalingOptions {
  localPeerId: string;
  send: BusSendFn;
  register: BusRegisterFn;
}

/**
 * Creates per-remote-peer channels that share a host register/send bus.
 * Used by the ZeroRTC demo UI and any app with a central message router.
 */
export class BusSignalingFactory implements ISignalingChannelFactory {
  private readonly localPeerId: string;
  private readonly send: BusSendFn;
  private readonly register: BusRegisterFn;
  private registered = false;
  private readonly inbox = new Set<(from: string, payload: string) => void>();
  private unregister: (() => void) | null = null;

  constructor(opts: BusSignalingOptions) {
    this.localPeerId = opts.localPeerId;
    this.send = opts.send;
    this.register = opts.register;
  }

  create(remotePeerId: string): ISignalingChannel {
    this.ensureRegistered();
    return new BusSignalingChannel(this.localPeerId, remotePeerId, this.send, this.inbox);
  }

  private ensureRegistered(): void {
    if (this.registered) return;
    this.registered = true;
    this.unregister = this.register(this.localPeerId, (from, payload) => {
      this.inbox.forEach((h) => h(from, payload));
    });
  }

  dispose(): void {
    this.unregister?.();
    this.unregister = null;
    this.inbox.clear();
    this.registered = false;
  }
}

class BusSignalingChannel implements ISignalingChannel {
  private open = true;
  private readonly handlers = new Set<(m: string) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private unsubInbox: (() => void) | null = null;

  constructor(
    private readonly localPeerId: string,
    private readonly remotePeerId: string,
    private readonly sendFn: BusSendFn,
    inbox: Set<(from: string, payload: string) => void>
  ) {
    const router = (from: string, payload: string) => {
      if (!this.open) return;
      if (from !== this.remotePeerId && this.remotePeerId !== this.localPeerId) return;
      // When remotePeerId === localPeerId this is an inbox channel — accept all
      if (this.remotePeerId === this.localPeerId || from === this.remotePeerId) {
        this.handlers.forEach((h) => h(payload));
      }
    };
    inbox.add(router);
    this.unsubInbox = () => inbox.delete(router);
  }

  get isOpen(): boolean {
    return this.open;
  }

  send(message: string): void {
    if (!this.open) return;
    void this.sendFn(this.localPeerId, this.remotePeerId, message);
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
    if (!this.open) return;
    this.open = false;
    this.unsubInbox?.();
    this.unsubInbox = null;
    this.handlers.clear();
    this.closeHandlers.forEach((h) => h());
    this.closeHandlers.clear();
  }
}
