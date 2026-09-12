/**
 * Disposable Signaling Bus (Host Application Backend Simulation)
 * Provides simple `send(to, payload)` and `onMessage(from, payload)`.
 * Features an interactive "Kill Server" toggle to prove the Data-Channel First architecture.
 */

type MessageHandler = (from: string, payload: string) => void;

export class SignalingBus {
  private handlers: Map<string, MessageHandler> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  public isServerOnline = true;
  private droppedPacketCounter = 0;
  private serverDropListeners: Set<(count: number) => void> = new Set();
  private busInstanceId = Math.random().toString(36).substring(2, 11);

  constructor() {
    try {
      this.broadcastChannel = new BroadcastChannel('micrortc_signaling_bus');
      this.broadcastChannel.onmessage = (event) => {
        if (!this.isServerOnline) {
          this.droppedPacketCounter++;
          this.notifyDrop();
          return;
        }
        // Ignore loopback messages from this same window instance
        if (event.data?.busInstanceId === this.busInstanceId) {
          return;
        }

        const { from, to, payload } = event.data;
        const handler = this.handlers.get(to);
        if (handler) {
          handler(from, payload);
        }
      };
    } catch {
      // BroadcastChannel unavailable in some private sandboxes
    }
  }

  public registerPeer(peerId: string, onMessage: MessageHandler): () => void {
    this.handlers.set(peerId, onMessage);
    return () => {
      this.handlers.delete(peerId);
    };
  }

  public async send(from: string, to: string, payload: string): Promise<boolean> {
    if (!this.isServerOnline) {
      this.droppedPacketCounter++;
      this.notifyDrop();
      console.warn(`[Signaling Server OFFLINE] Dropped packet from ${from} to ${to}`);
      return false;
    }

    // Deliver to local peer handler if registered in same window
    const targetHandler = this.handlers.get(to);
    if (targetHandler) {
      setTimeout(() => {
        if (this.isServerOnline) {
          targetHandler(from, payload);
        } else {
          this.droppedPacketCounter++;
          this.notifyDrop();
        }
      }, 30); // small realistic network hop delay
      return true;
    }

    // Only broadcast across browser tabs if target peer is not in this local window
    try {
      this.broadcastChannel?.postMessage({
        busInstanceId: this.busInstanceId,
        from,
        to,
        payload,
      });
    } catch {
      // Handled
    }

    return true;
  }

  public setServerOnline(online: boolean): void {
    this.isServerOnline = online;
    if (online) {
      this.droppedPacketCounter = 0;
      this.notifyDrop();
    }
  }

  public getDroppedPacketCount(): number {
    return this.droppedPacketCounter;
  }

  public onServerDrop(cb: (count: number) => void): () => void {
    this.serverDropListeners.add(cb);
    return () => this.serverDropListeners.delete(cb);
  }

  private notifyDrop(): void {
    this.serverDropListeners.forEach((fn) => fn(this.droppedPacketCounter));
  }
}

export const globalSignalingBus = new SignalingBus();
