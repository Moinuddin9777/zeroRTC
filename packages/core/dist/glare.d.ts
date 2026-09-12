/**
 * O(1) glare / perfect-negotiation collision fix.
 *
 * Lexical peer-id ordering replaces timestamps:
 *   polite = localPeerId > remotePeerId
 * When both peers glare (simultaneous offers), the impolite peer ignores
 * the remote offer; the polite peer rolls back and accepts.
 *
 * Complexity: string compare only — no clocks, no randomness.
 */
export declare function isPolitePeer(localPeerId: string, remotePeerId: string): boolean;
/**
 * Returns true if this peer should act as the offerer for a fresh call
 * when both sides dial simultaneously (callerId < calleeId wins).
 */
export declare function shouldOfferOnGlare(localPeerId: string, remotePeerId: string): boolean;
//# sourceMappingURL=glare.d.ts.map