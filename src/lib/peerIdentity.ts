const STORAGE_KEY = 'zerortc.localPeerId';

/** Stable per-browser identity so two devices can address each other. */
export function getOrCreatePeerId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{3,64}$/.test(existing)) return existing;
  } catch {
    /* private mode */
  }
  const id = `peer_${Math.random().toString(36).slice(2, 8)}`;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function setPeerId(id: string): void {
  const cleaned = id.trim().replace(/\s+/g, '_');
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(cleaned)) {
    throw new Error('Peer ID must be 3–64 chars: letters, numbers, _ or -');
  }
  try {
    localStorage.setItem(STORAGE_KEY, cleaned);
  } catch {
    /* ignore */
  }
}

export function suggestPeerId(prefix = 'peer'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
