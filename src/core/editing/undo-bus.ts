// A tiny neutral registry that lets independent undo histories (the level command
// history and the sprite snapshot history) invalidate each other's redo stack
// without importing one another. When a new edit lands on one history, the redo
// of every *sibling* history must be discarded — otherwise a stale redo entry
// from before the new edit could be replayed out of order. Both stores register
// their redo-clearer here; the editing stores never import each other.
type RedoClearer = () => void;

const clearers = new Set<RedoClearer>();

/** Register a history's redo-clearer. Returns an unsubscribe function. */
export function registerRedoClearer(clear: RedoClearer): () => void {
  clearers.add(clear);
  return () => clearers.delete(clear);
}

/** A new edit was recorded; clear every redo stack except the caller's own. */
export function invalidateSiblingRedos(own: RedoClearer): void {
  for (const clear of clearers) if (clear !== own) clear();
}
