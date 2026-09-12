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
export declare class LocalIPSignaling implements ISignalingChannel {
    private readonly opts;
    private ws;
    private open;
    private readonly handlers;
    private readonly closeHandlers;
    private readonly outboundQueue;
    private disposed;
    constructor(opts: LocalIPSignalingOptions);
    get isOpen(): boolean;
    send(message: string): void;
    onMessage(handler: (message: string) => void): () => void;
    onClose(handler: () => void): () => void;
    dispose(): void;
    private connect;
}
export interface LocalIPSignalingFactoryOptions {
    url: string;
    localPeerId: string;
    protocols?: string | string[];
}
export declare class LocalIPSignalingFactory implements ISignalingChannelFactory {
    private readonly opts;
    constructor(opts: LocalIPSignalingFactoryOptions);
    create(remotePeerId: string): ISignalingChannel;
}
/**
 * Minimal in-browser LAN relay for demos (no Node server required).
 * Uses BroadcastChannel to simulate mDNS-discovered peers on the same machine.
 * For a real LAN, point LocalIPSignaling at any tiny WS fan-out (e.g. `ws` npm).
 */
export declare class BroadcastLanRelay {
    private readonly bc;
    private readonly peers;
    constructor(channelName?: string);
    /** Attach a LocalIP-compatible handler that receives demuxed bodies. */
    subscribe(localPeerId: string, onBody: (from: string, body: string) => void): () => void;
    publish(from: string, to: string, body: string): void;
    close(): void;
}
//# sourceMappingURL=LocalIPSignaling.d.ts.map