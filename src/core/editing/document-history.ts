// Per-document undo (spec §10, §4.1): every document owns one undo stack; undo
// and redo follow the focused document. The hub is data-model agnostic — it
// holds anything implementing UndoStack, so aeon's command history, classic's
// two domain snapshot histories and each sprite doc's snapshot history all live
// here. Concrete stacks are built by per-prefix factories registered at startup
// (see renderer/state/history-factories.ts), which is the only place that knows
// which doc-id prefix maps to which store.
//
// Doc ids are the session tab ids plus one synthetic kind:
//   level:<zone>:<act>        layout doc
//   zoneart:<zone>            zone art doc (no tab of its own; see tabs.ts)
//   doc:sprite:<engine>:<ref> sprite doc
//   doc:canvas:<name>         origination-canvas doc

import type { UndoStack } from './undo-stack';

export type UndoStackFactory = (docId: string) => UndoStack;

/** Notified with the doc id of the stack that changed. */
export type HubListener = (docId: string) => void;

export class DocumentHistoryHub {
  private stacks = new Map<string, UndoStack>();
  private unsubs = new Map<string, () => void>();
  private factories: Array<{ prefix: string; make: UndoStackFactory }> = [];
  private listeners: Array<HubListener> = [];

  /** Register the factory for a doc-id prefix. Longest matching prefix wins. */
  registerFactory(prefix: string, make: UndoStackFactory): void {
    const existing = this.factories.findIndex((f) => f.prefix === prefix);
    if (existing >= 0) this.factories[existing] = { prefix, make };
    else this.factories.push({ prefix, make });
    this.factories.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /** Get-or-create the stack for a document. */
  historyFor(docId: string): UndoStack {
    const existing = this.stacks.get(docId);
    if (existing) return existing;

    const factory = this.factories.find((f) => docId.startsWith(f.prefix));
    if (!factory) throw new Error(`No undo-stack factory registered for doc id '${docId}'`);

    const stack = factory.make(docId);
    this.stacks.set(docId, stack);
    this.unsubs.set(docId, stack.onChange(() => this.notify(docId)));
    return stack;
  }

  has(docId: string): boolean { return this.stacks.has(docId); }

  /** Drop a document's stack entirely (tab closed). */
  dispose(docId: string): void {
    this.unsubs.get(docId)?.();
    this.unsubs.delete(docId);
    this.stacks.get(docId)?.clear();
    this.stacks.delete(docId);
  }

  /** Project close: drop every stack. Factories survive (they are startup wiring). */
  clearAll(): void {
    for (const docId of [...this.stacks.keys()]) this.dispose(docId);
  }

  /**
   * Subscribe to "a stack changed", told WHICH document's stack it was. The doc
   * id is what lets a subscriber ignore documents it doesn't render: without it
   * every listener is woken by every other document's edits, and the expensive
   * per-document caches (the tileset thumbnail atlas, a section prerender) get
   * rebuilt because an unrelated sprite or act tab moved its undo pointer.
   *
   * Returns an unsubscribe function.
   */
  onChange(cb: HubListener): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  /** Test support: forget registered factories so tests don't leak into each other. */
  clearFactories(): void { this.factories = []; }

  private notify(docId: string): void { for (const l of this.listeners) l(docId); }
}
