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
import { ChunkDecoder, ChunkEncoder, type ChunkCodecOptions } from './chunking';

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

export class BLESignaling implements ISignalingChannel {
  private open = true;
  private readonly encoder: ChunkEncoder;
  private readonly decoder = new ChunkDecoder();
  private readonly handlers = new Set<(m: string) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private unsubNotify: (() => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly opts: BLESignalingOptions) {
    const mtuPayload = Math.min(opts.mtuPayloadBytes ?? opts.transport.mtu - 3, opts.transport.mtu - 3);
    this.encoder = new ChunkEncoder({ mtuPayloadBytes: Math.max(32, mtuPayload) });
    this.unsubNotify = opts.transport.onNotification((data) => this.onChunk(data));
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Encode → serial GATT writes. Chunks are queued so MTU-sized writes
   * never race on a single characteristic.
   */
  async send(message: string): Promise<void> {
    if (!this.open) return;
    const chunks = this.encoder.encode(message);
    this.writeQueue = this.writeQueue.then(async () => {
      for (const chunk of chunks) {
        if (!this.open) return;
        await this.opts.transport.write(chunk);
      }
    });
    await this.writeQueue;
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
    this.unsubNotify?.();
    this.unsubNotify = null;
    this.decoder.reset();
    this.handlers.clear();
    try {
      this.opts.transport.disconnect();
    } catch {
      /* radio already down */
    }
    this.closeHandlers.forEach((h) => h());
    this.closeHandlers.clear();
  }

  private onChunk(data: ArrayBuffer): void {
    if (!this.open) return;
    const complete = this.decoder.push(data);
    if (complete === null) return;
    this.handlers.forEach((h) => h(complete));
  }
}

/**
 * Factory that vends BLESignaling channels.
 * Typically one GATT link ↔ one remote peer for off-grid pairing.
 */
export class BLESignalingFactory implements ISignalingChannelFactory {
  constructor(
    private readonly createTransport: (remotePeerId: string) => IBLETransport,
    private readonly codec?: ChunkCodecOptions
  ) {}

  create(remotePeerId: string): ISignalingChannel {
    return new BLESignaling({
      transport: this.createTransport(remotePeerId),
      ...this.codec,
    });
  }
}

/**
 * In-memory loopback transport for demos / tests — proves the chunking
 * path without Web Bluetooth hardware.
 */
export class LoopbackBLETransport implements IBLETransport {
  readonly mtu: number;
  private readonly peers = new Set<LoopbackBLETransport>();
  private readonly listeners = new Set<(data: ArrayBuffer) => void>();

  constructor(mtu = 512) {
    this.mtu = mtu;
  }

  /** Pair two loopback radios so writes on A notify B and vice versa. */
  static pair(a: LoopbackBLETransport, b: LoopbackBLETransport): void {
    a.peers.add(b);
    b.peers.add(a);
  }

  async write(chunk: ArrayBuffer): Promise<void> {
    // Clone buffer — BLE stacks deliver fresh ArrayBuffers per notification
    const copy = chunk.slice(0);
    for (const peer of this.peers) {
      peer.listeners.forEach((l) => l(copy));
    }
  }

  onNotification(handler: (data: ArrayBuffer) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  disconnect(): void {
    this.peers.clear();
    this.listeners.clear();
  }
}

/* ─── Optional Web Bluetooth helper (feature-detected) ─────────── */

export const ZERO_RTC_BLE_SERVICE = '0000zrtc-0000-1000-8000-00805f9b34fb';
export const ZERO_RTC_BLE_CHAR = '0000zrt1-0000-1000-8000-00805f9b34fb';

/**
 * Request a ZeroRTC signaling peripheral. Must run from a user gesture.
 * Returns null when Web Bluetooth is unavailable.
 */
export async function requestWebBluetoothTransport(
  optionalServices: string[] = [ZERO_RTC_BLE_SERVICE]
): Promise<IBLETransport | null> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice(opts: {
        filters?: { services?: string[]; namePrefix?: string }[];
        optionalServices?: string[];
        acceptAllDevices?: boolean;
      }): Promise<{
        gatt?: {
          connect(): Promise<{
            getPrimaryService(uuid: string): Promise<{
              getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
            }>;
            disconnect(): void;
          }>;
        };
      }>;
    };
  };

  if (!nav.bluetooth) return null;

  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices,
  });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(ZERO_RTC_BLE_SERVICE);
  const characteristic = await service.getCharacteristic(ZERO_RTC_BLE_CHAR);
  await characteristic.startNotifications();

  return {
    mtu: 512,
    write: async (chunk) => {
      await characteristic.writeValueWithoutResponse(chunk);
    },
    onNotification: (handler) => {
      const listener = (ev: Event) => {
        const target = ev.target as unknown as BluetoothRemoteGATTCharacteristicLike;
        const value = target.value;
        if (!value) return;
        handler(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      };
      characteristic.addEventListener('characteristicvaluechanged', listener);
      return () => characteristic.removeEventListener('characteristicvaluechanged', listener);
    },
    disconnect: () => server.disconnect(),
  };
}

interface BluetoothRemoteGATTCharacteristicLike {
  value?: DataView;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
}
