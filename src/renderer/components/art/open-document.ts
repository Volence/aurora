import { useArtStore } from '../../state/artStore';
import type { OpenDocument } from '../../state/artStore';

/**
 * Open a new document, but ask the user to confirm if the current document
 * has unsaved changes.  Returns true if the document was opened, false if
 * the user cancelled.
 *
 * NOTE: The save flow's own re-open (after a successful save) must NOT go
 * through this guard — it calls openDocument directly because the document
 * is no longer dirty at that point.
 */
export function openDocumentGuarded(next: OpenDocument): boolean {
  const open = useArtStore.getState().open;
  if (open?.dirty) {
    const ok = window.confirm(
      `Discard unsaved changes to "${open.name}"?`,
    );
    if (!ok) return false;
  }
  useArtStore.getState().openDocument(next);
  return true;
}

/**
 * Close the open document, asking first if it has unsaved changes. Returns true
 * if it was closed.
 *
 * THE WAY BACK TO THE NEW-DOCUMENT LAUNCHER. The launcher is the art facet's
 * no-document state, and it was reachable only by never having opened one —
 * which stopped being true when the aeon open path started landing on the first
 * chunk. Without this, defaulting to a document would have deleted "make a new
 * tile/block/chunk" from the product.
 */
export function closeDocumentGuarded(): boolean {
  const open = useArtStore.getState().open;
  if (open === null) return true;
  if (open.dirty && !window.confirm(`Discard unsaved changes to "${open.name}"?`)) return false;
  useArtStore.getState().closeDocument();
  return true;
}
