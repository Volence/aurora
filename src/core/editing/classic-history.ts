// Snapshot-based undo/redo for the classic (Sonic 1) LevelDoc editing store
// (Task 12, spec §2.2). Mirrors SpriteHistory's surface (record/undo/redo,
// canUndo/canRedo, edit-seq stamps) rather than EditHistory's command model:
//
// WHY A SIBLING HISTORY (undo integration): the aeon level history (EditHistory
// in history.ts) is hardcoded to the S4Level shape — applyCommand/undoCommand
// switch on S4Level structure — so a LevelDoc edit CANNOT push into that instance
// without refactoring aeon core. The repo already solves exactly this problem for
// sprite editing (a different data model that must share one uniform Ctrl+Z): a
// SEPARATE snapshot history that joins the shared timeline through the neutral
// undo-bus (redo-invalidation) + edit-seq (recency merge). Classic editing follows
// that sanctioned pattern — it is NOT a silently-forked stack. A classic (s1)
// project and an aeon project are never open at once, and within a classic
// session classic-level edits and (s1 object) sprite edits interleave by recency,
// keeping Ctrl+Z uniform.
//
// Pure core: LevelDoc / DirtyDomains are pure data; the store drives this class.

import type { LevelDoc } from '../level-classic/model';
import type { DirtyDomains } from '../project/adapter';
import { nextEditSeq } from './edit-seq';

/**
 * The full slice of editing-store state a single undo step must restore: the
 * document, the per-domain dirty flags, and the chunk content-version keys the
 * viewport caches on. Kept together so undo/redo restore the triple consistently
 * (the plan's hard requirement).
 *
 * `doc` is treated immutably by the store (each command produces a new doc that
 * shares unchanged sub-arrays), so snapshots hold references cheaply; only the
 * small mutable containers (dirty object, chunkVersions map) are cloned.
 */
export interface ClassicSnapshot {
  doc: LevelDoc;
  dirty: DirtyDomains;
  chunkVersions: Map<number, number>;
  chunkEpoch: number;
}

function cloneSnap(s: ClassicSnapshot): ClassicSnapshot {
  return {
    doc: s.doc, // immutable by convention — never mutated in place by the store
    dirty: { ...s.dirty },
    chunkVersions: new Map(s.chunkVersions),
    chunkEpoch: s.chunkEpoch,
  };
}

export class ClassicHistory {
  private undoStack: ClassicSnapshot[] = [];
  private redoStack: ClassicSnapshot[] = [];
  // Edit-seq stamps, index-aligned with the stacks, so a Ctrl+Z coordinator can
  // merge this timeline with the sprite history by recency (see edit-seq.ts).
  private undoSeq: number[] = [];
  private redoSeq: number[] = [];

  constructor(private cap = 200) {}

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get depth(): number { return this.undoStack.length; }

  /** Edit-seq of the top undo entry (the one a next undo would revert), or -1. */
  topUndoSeq(): number { return this.undoSeq.length ? this.undoSeq[this.undoSeq.length - 1] : -1; }
  /** Edit-seq of the top redo entry (the one a next redo would re-apply), or -1. */
  topRedoSeq(): number { return this.redoSeq.length ? this.redoSeq[this.redoSeq.length - 1] : -1; }
  /** Drop the redo stack (a new edit on a sibling history invalidates it). */
  clearRedo(): void { this.redoStack = []; this.redoSeq = []; }

  /** Record the BEFORE snapshot of an edit (the store applies the edit itself). */
  record(before: ClassicSnapshot): void {
    this.undoStack.push(cloneSnap(before));
    this.undoSeq.push(nextEditSeq());
    if (this.undoStack.length > this.cap) { this.undoStack.shift(); this.undoSeq.shift(); }
    this.redoStack = [];
    this.redoSeq = [];
  }

  /** Stash `current`, return the snapshot to restore (or null if nothing to undo). */
  undo(current: ClassicSnapshot): ClassicSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneSnap(current));
    this.redoSeq.push(this.undoSeq.pop()!);
    return cloneSnap(prev);
  }

  /** Stash `current`, return the snapshot to re-apply (or null if nothing to redo). */
  redo(current: ClassicSnapshot): ClassicSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneSnap(current));
    this.undoSeq.push(this.redoSeq.pop()!);
    return cloneSnap(next);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.undoSeq = [];
    this.redoSeq = [];
  }
}
