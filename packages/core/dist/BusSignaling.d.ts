/**
 * In-process / BroadcastChannel signaling factory.
 * Bridges the demo SignalingBus (or any host push API) into ISignalingChannel.
 */
import type { ISignalingChannel, ISignalingChannelFactory } from './interfaces/ISignalingChannel';
export type BusSendFn = (from: string, to: string, payload: string) => Promise<boolean | void> | boolean | void;
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
export declare class BusSignalingFactory implements ISignalingChannelFactory {
    private readonly localPeerId;
    private readonly send;
    private readonly register;
    private registered;
    private readonly inbox;
    private unregister;
    constructor(opts: BusSignalingOptions);
    create(remotePeerId: string): ISignalingChannel;
    private ensureRegistered;
    dispose(): void;
}
//# sourceMappingURL=BusSignaling.d.ts.map