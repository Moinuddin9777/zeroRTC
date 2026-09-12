/**
 * LocalIPSignaling — lightweight WebSocket signaling for LAN / mDNS peers.
 *
 * Designed to run against a tiny local WS relay (same device or LAN broadcast
 * discovery). Implements ISignalingChannel so @zerortc/core can dispose it
 * the instant the control DataChannel opens — no internet required.
 */
export class LocalIPSignaling {
    opts;
    ws = null;
    open = false;
    handlers = new Set();
    closeHandlers = new Set();
    outboundQueue = [];
    disposed = false;
    constructor(opts) {
        this.opts = opts;
        this.connect();
    }
    get isOpen() {
        return this.open && !this.disposed;
    }
    send(message) {
        if (this.disposed)
            return;
        const envelope = JSON.stringify({
            from: this.opts.localPeerId,
            to: this.opts.remotePeerId,
            body: message,
        });
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(envelope);
        }
        else {
            this.outboundQueue.push(envelope);
        }
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
        if (this.disposed)
            return;
        this.disposed = true;
        this.open = false;
        this.outboundQueue.length = 0;
        try {
            this.ws?.close();
        }
        catch {
            /* ignore */
        }
        this.ws = null;
        this.handlers.clear();
        this.closeHandlers.forEach((h) => h());
        this.closeHandlers.clear();
    }
    connect() {
        try {
            this.ws = new WebSocket(this.opts.url, this.opts.protocols);
        }
        catch (err) {
            console.error('[LocalIPSignaling] WebSocket construct failed:', err);
            return;
        }
        this.ws.onopen = () => {
            this.open = true;
            // Announce presence for simple LAN relays
            this.ws?.send(JSON.stringify({
                type: 'hello',
                peerId: this.opts.localPeerId,
            }));
            while (this.outboundQueue.length) {
                this.ws?.send(this.outboundQueue.shift());
            }
        };
        this.ws.onmessage = (ev) => {
            if (typeof ev.data !== 'string')
                return;
            try {
                const parsed = JSON.parse(ev.data);
                if (parsed.type === 'hello')
                    return;
                if (parsed.to && parsed.to !== this.opts.localPeerId)
                    return;
                if (parsed.body) {
                    this.handlers.forEach((h) => h(parsed.body));
                }
            }
            catch {
                // Bare SDP string passthrough
                this.handlers.forEach((h) => h(ev.data));
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
export class LocalIPSignalingFactory {
    opts;
    constructor(opts) {
        this.opts = opts;
    }
    create(remotePeerId) {
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
    bc;
    peers = new Set();
    constructor(channelName = 'zerortc-lan') {
        this.bc = new BroadcastChannel(channelName);
    }
    /** Attach a LocalIP-compatible handler that receives demuxed bodies. */
    subscribe(localPeerId, onBody) {
        const listener = (ev) => {
            const data = ev.data;
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
    publish(from, to, body) {
        this.bc.postMessage({ from, to, body });
    }
    close() {
        this.bc.close();
        this.peers.clear();
    }
}
//# sourceMappingURL=LocalIPSignaling.js.map