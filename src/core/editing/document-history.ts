// Per-document undo (spec §10): every document (level layout doc, zone art
// doc, sprite doc) owns one EditHistory; undo/redo follows the focused
// document. Stages 3–4 rewire the existing stores onto a shared hub instance,
// retiring the undo-bus sibling-invalidation scheme.
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
