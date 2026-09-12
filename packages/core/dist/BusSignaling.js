/**
 * In-process / BroadcastChannel signaling factory.
 * Bridges the demo SignalingBus (or any host push API) into ISignalingChannel.
 */
/**
 * Creates per-remote-peer channels that share a host register/send bus.
 * Used by the ZeroRTC demo UI and any app with a central message router.
 */
export class BusSignalingFactory {
    localPeerId;
    send;
    register;
    registered = false;
    inbox = new Set();
    unregister = null;
    constructor(opts) {
        this.localPeerId = opts.localPeerId;
        this.send = opts.send;
        this.register = opts.register;
    }
    create(remotePeerId) {
        this.ensureRegistered();
        return new BusSignalingChannel(this.localPeerId, remotePeerId, this.send, this.inbox);
    }
    ensureRegistered() {
        if (this.registered)
            return;
        this.registered = true;
        this.unregister = this.register(this.localPeerId, (from, payload) => {
            this.inbox.forEach((h) => h(from, payload));
        });
    }
    dispose() {
        this.unregister?.();
        this.unregister = null;
        this.inbox.clear();
        this.registered = false;
    }
}
class BusSignalingChannel {
    localPeerId;
    remotePeerId;
    sendFn;
    open = true;
    handlers = new Set();
    closeHandlers = new Set();
    unsubInbox = null;
    constructor(localPeerId, remotePeerId, sendFn, inbox) {
        this.localPeerId = localPeerId;
        this.remotePeerId = remotePeerId;
        this.sendFn = sendFn;
        const router = (from, payload) => {
            if (!this.open)
                return;
            if (from !== this.remotePeerId && this.remotePeerId !== this.localPeerId)
                return;
            // When remotePeerId === localPeerId this is an inbox channel — accept all
            if (this.remotePeerId === this.localPeerId || from === this.remotePeerId) {
                this.handlers.forEach((h) => h(payload));
            }
        };
        inbox.add(router);
        this.unsubInbox = () => inbox.delete(router);
    }
    get isOpen() {
        return this.open;
    }
    send(message) {
        if (!this.open)
            return;
        void this.sendFn(this.localPeerId, this.remotePeerId, message);
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
        this.unsubInbox?.();
        this.unsubInbox = null;
        this.handlers.clear();
        this.closeHandlers.forEach((h) => h());
        this.closeHandlers.clear();
    }
}
//# sourceMappingURL=BusSignaling.js.map