// Shared machinery for every SNAPSHOT-based undo stack (classic's two domain
// stacks and each sprite document's stack). Promoted out of
// classic-domain-history.ts once the sprite document grew a third one — the
// bookkeeping (two stacks, depth cap, listener fan-out) is identical; only the
// snapshot shape and how deeply it must be cloned differ.
//
// `read` returns the live slice, `write` installs a restored one; the store
// supplies both at construction, which is what makes undo/redo argument-free
// (spec §4.1) and what lets a stack restore a document that is NOT the one the
// user is currently looking at.

import type { UndoStack } from './undo-stack';

/** Entries kept per stack. Deep enough for a long session, bounded so a
 *  pixel-by-pixel sprite session can't grow without limit. */
export const DEFAULT_MAX_DEPTH = 200;

export abstract class SnapshotHistory<S> implements UndoStack {
  // INVARIANT (emergent, not enforced): undoStack.length + redoStack.length
  // <= maxDepth, always. `record` pushes one to undoStack (capped) and clears
  // redoStack; `undo`/`redo` each move exactly one entry across, so the sum
  // never grows past whatever record last capped it to. Nothing here asserts
  // this — any future path that pushes to redoStack without popping undoStack
  // breaks it silently. It is why residency at maxDepth N is ~N snapshots, not
  // ~2N: worth stating explicitly now that canvas-history.ts's snapshots are
  // ~1 MB each and the difference is a bounded 40 MB vs. unbounded growth.
  private undoStack: S[] = [];
  private redoStack: S[] = [];
  private listeners: Array<() => void> = [];

  constructor(
    protected readonly read: () => S,
    protected readonly write: (snapshot: S) => void,
    private readonly maxDepth = DEFAULT_MAX_DEPTH,
  ) {}

  protected abstract clone(s: S): S;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Record the BEFORE snapshot of an edit. The store applies the edit itself. */
  record(before: S): void {
    this.undoStack.push(this.clone(before));
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.clone(this.read()));
    this.write(this.clone(prev));
    this.notify();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.clone(this.read()));
    this.write(this.clone(next));
    this.notify();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  protected notify(): void { for (const l of this.listeners) l(); }
}
