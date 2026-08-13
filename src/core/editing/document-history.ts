// Per-document undo (spec §10): every document owns one undo history; undo/
// redo follows the focused document. Aeon histories are resident here since
// Stage 3 (editorStore.activeHistory keys into the hub by act tab id) —
// sprite docs (sprite-history) and classic docs (classic-history) still live
// outside it until Stage 4 either generalizes the hub over a minimal
// undo-stack interface or unifies the three history classes. That rewiring
// also retires the undo-bus sibling-invalidation scheme.
//
// Doc ids are the session tab ids ('level:ghz:1', 'doc:buzzbomber', …) so a
// tab and its history share one identity.

import { EditHistory } from './history';

export class DocumentHistoryHub {
  private histories = new Map<string, EditHistory>();

  /** Get-or-create the history for a document. */
  historyFor(docId: string): EditHistory {
    let h = this.histories.get(docId);
    if (!h) {
      h = new EditHistory();
      this.histories.set(docId, h);
    }
    return h;
  }

  has(docId: string): boolean {
    return this.histories.has(docId);
  }

  /** Drop a document's history entirely (document closed without reopening intent). */
  dispose(docId: string): void {
    this.histories.get(docId)?.clear();
    this.histories.delete(docId);
  }

  /** Project close: drop everything. */
  clearAll(): void {
    for (const h of this.histories.values()) h.clear();
    this.histories.clear();
  }
}
