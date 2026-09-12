/**
 * BLESignaling — Web Bluetooth GATT adapter implementing ISignalingChannel.
 *
 * SDPs (2–5 KB) exceed the standard BLE ATT MTU (512 B). This adapter
 * deterministically chunks every outbound string and reassembles inbound
 * GATT notifications before forwarding a complete message to @zerortc/core.
 *
 * Packet layout: [msgId:u16][chunk_index:u16][total_chunks:u16][payload]
 *
 * Browser note: Web Bluetooth requires a user gesture to requestDevice().
 * Pass a pre-connected GATT characteristic, or call connect() from a click handler.
 */
import type { ISignalingChannel, ISignalingChannelFactory } from '@zerortc/core';
import { type ChunkCodecOptions } from './chunking';
/** Minimal GATT surface so unit tests / Flutter FFI can mock the radio. */
export interface IBLETransport {
    readonly mtu: number;
    write(chunk: ArrayBuffer): Promise<void>;
    onNotification(handler: (data: ArrayBuffer) => void): () => void;
    disconnect(): void;
}
export interface BLESignalingOptions extends ChunkCodecOptions {
    transport: IBLETransport;
}
export declare class BLESignaling implements ISignalingChannel {
    private readonly opts;
    private open;
    private readonly encoder;
    private readonly decoder;
    private readonly handlers;
    private readonly closeHandlers;
    private unsubNotify;
    private writeQueue;
    constructor(opts: BLESignalingOptions);
    get isOpen(): boolean;
    /**
     * Encode → serial GATT writes. Chunks are queued so MTU-sized writes
     * never race on a single characteristic.
     */
    send(message: string): Promise<void>;
    onMessage(handler: (message: string) => void): () => void;
    onClose(handler: () => void): () => void;
    dispose(): void;
    private onChunk;
}
/**
 * Factory that vends BLESignaling channels.
 * Typically one GATT link ↔ one remote peer for off-grid pairing.
 */
export declare class BLESignalingFactory implements ISignalingChannelFactory {
    private readonly createTransport;
    private readonly codec?;
    constructor(createTransport: (remotePeerId: string) => IBLETransport, codec?: ChunkCodecOptions | undefined);
    create(remotePeerId: string): ISignalingChannel;
}
/**
 * In-memory loopback transport for demos / tests — proves the chunking
 * path without Web Bluetooth hardware.
 */
export declare class LoopbackBLETransport implements IBLETransport {
    readonly mtu: number;
    private readonly peers;
    private readonly listeners;
    constructor(mtu?: number);
    /** Pair two loopback radios so writes on A notify B and vice versa. */
    static pair(a: LoopbackBLETransport, b: LoopbackBLETransport): void;
    write(chunk: ArrayBuffer): Promise<void>;
    onNotification(handler: (data: ArrayBuffer) => void): () => void;
    disconnect(): void;
}
export declare const ZERO_RTC_BLE_SERVICE = "0000zrtc-0000-1000-8000-00805f9b34fb";
export declare const ZERO_RTC_BLE_CHAR = "0000zrt1-0000-1000-8000-00805f9b34fb";
/**
 * Request a ZeroRTC signaling peripheral. Must run from a user gesture.
 * Returns null when Web Bluetooth is unavailable.
 */
export declare function requestWebBluetoothTransport(optionalServices?: string[]): Promise<IBLETransport | null>;
//# sourceMappingURL=BLESignaling.d.ts.map