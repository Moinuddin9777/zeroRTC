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

export function isPolitePeer(localPeerId: string, remotePeerId: string): boolean {
  return localPeerId > remotePeerId;
}

/**
 * Returns true if this peer should act as the offerer for a fresh call
 * when both sides dial simultaneously (callerId < calleeId wins).
 */
export function shouldOfferOnGlare(localPeerId: string, remotePeerId: string): boolean {
  return localPeerId < remotePeerId;
}
