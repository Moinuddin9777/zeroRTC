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
import { ChunkDecoder, ChunkEncoder } from './chunking';
export class BLESignaling {
    opts;
    open = true;
    encoder;
    decoder = new ChunkDecoder();
    handlers = new Set();
    closeHandlers = new Set();
    unsubNotify = null;
    writeQueue = Promise.resolve();
    constructor(opts) {
        this.opts = opts;
        const mtuPayload = Math.min(opts.mtuPayloadBytes ?? opts.transport.mtu - 3, opts.transport.mtu - 3);
        this.encoder = new ChunkEncoder({ mtuPayloadBytes: Math.max(32, mtuPayload) });
        this.unsubNotify = opts.transport.onNotification((data) => this.onChunk(data));
    }
    get isOpen() {
        return this.open;
    }
    /**
     * Encode → serial GATT writes. Chunks are queued so MTU-sized writes
     * never race on a single characteristic.
     */
    async send(message) {
        if (!this.open)
            return;
        const chunks = this.encoder.encode(message);
        this.writeQueue = this.writeQueue.then(async () => {
            for (const chunk of chunks) {
                if (!this.open)
                    return;
                await this.opts.transport.write(chunk);
            }
        });
        await this.writeQueue;
    }
    onMessage(handler) {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }
    onClose(handler) {
        this.closeHandlers.add(handler);
        return () => this.closeHandlers.delete(handler);
    }
    dispose() {
        if (!this.open)
            return;
        this.open = false;
        this.unsubNotify?.();
        this.unsubNotify = null;
        this.decoder.reset();
        this.handlers.clear();
        try {
            this.opts.transport.disconnect();
        }
        catch {
            /* radio already down */
        }
        this.closeHandlers.forEach((h) => h());
        this.closeHandlers.clear();
    }
    onChunk(data) {
        if (!this.open)
            return;
        const complete = this.decoder.push(data);
        if (complete === null)
            return;
        this.handlers.forEach((h) => h(complete));
    }
}
/**
 * Factory that vends BLESignaling channels.
 * Typically one GATT link ↔ one remote peer for off-grid pairing.
 */
export class BLESignalingFactory {
    createTransport;
    codec;
    constructor(createTransport, codec) {
        this.createTransport = createTransport;
        this.codec = codec;
    }
    create(remotePeerId) {
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
export class LoopbackBLETransport {
    mtu;
    peers = new Set();
    listeners = new Set();
    constructor(mtu = 512) {
        this.mtu = mtu;
    }
    /** Pair two loopback radios so writes on A notify B and vice versa. */
    static pair(a, b) {
        a.peers.add(b);
        b.peers.add(a);
    }
    async write(chunk) {
        // Clone buffer — BLE stacks deliver fresh ArrayBuffers per notification
        const copy = chunk.slice(0);
        for (const peer of this.peers) {
            peer.listeners.forEach((l) => l(copy));
        }
    }
    onNotification(handler) {
        this.listeners.add(handler);
        return () => this.listeners.delete(handler);
    }
    disconnect() {
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
export async function requestWebBluetoothTransport(optionalServices = [ZERO_RTC_BLE_SERVICE]) {
    const nav = navigator;
    if (!nav.bluetooth)
        return null;
    const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices,
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(ZERO_RTC_BLE_SERVICE);
    const characteristic = await service.getCharacteristic(ZERO_RTC_BLE_CHAR);
    await characteristic.startNotifications();
    return {
        mtu: 512,
        write: async (chunk) => {
            await characteristic.writeValueWithoutResponse(chunk);
        },
        onNotification: (handler) => {
            const listener = (ev) => {
                const target = ev.target;
                const value = target.value;
                if (!value)
                    return;
                handler(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
            };
            characteristic.addEventListener('characteristicvaluechanged', listener);
            return () => characteristic.removeEventListener('characteristicvaluechanged', listener);
        },
        disconnect: () => server.disconnect(),
    };
}
//# sourceMappingURL=BLESignaling.js.map