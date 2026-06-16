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
