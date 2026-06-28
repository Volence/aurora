import type { PixelBuffer } from '../art/pixel-ops';
import type { Color } from '../model/s4-types';
import type { SpritePaletteMode } from '../art/sprite-palette';
import { nextEditSeq } from './edit-seq';

/** A full snapshot of the sprite document for undo/redo. */
export interface SpriteSnapshot {
  frames: PixelBuffer[];
  currentIndex: number;
  selection: { x: number; y: number; w: number; h: number } | null;
  paletteMode: SpritePaletteMode;
  zoneLine: number;
  standalonePalette: Color[];
}

function cloneBuf(b: PixelBuffer): PixelBuffer {
  return { width: b.width, height: b.height, data: new Uint8Array(b.data) };
}
function cloneSnap(s: SpriteSnapshot): SpriteSnapshot {
  return {
    frames: s.frames.map(cloneBuf),
    currentIndex: s.currentIndex,
    selection: s.selection ? { ...s.selection } : null,
    paletteMode: s.paletteMode,
    zoneLine: s.zoneLine,
    standalonePalette: s.standalonePalette.map((c) => ({ ...c })),
  };
}

/**
 * Snapshot-based undo/redo for the sprite document. `record(before)` is called
 * with the state BEFORE an edit; `undo(current)`/`redo(current)` stash the live
 * state and hand back the cloned target state. Mirrors EditHistory's
 * canUndo/canRedo/undo/redo surface (not its command model). Bounded depth.
 */
export class SpriteHistory {
  private undoStack: SpriteSnapshot[] = [];
  private redoStack: SpriteSnapshot[] = [];
  // Edit-sequence stamps (see edit-seq.ts), index-aligned with the stacks, so
  // sprite-mode undo can be merged with the level history by recency.
  private undoSeq: number[] = [];
  private redoSeq: number[] = [];

  constructor(private cap = 50) {}

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get depth(): number { return this.undoStack.length; }

  /** Edit-seq of the top undo entry, or -1. */
  topUndoSeq(): number { return this.undoSeq.length ? this.undoSeq[this.undoSeq.length - 1] : -1; }
  /** Edit-seq of the top redo entry, or -1. */
  topRedoSeq(): number { return this.redoSeq.length ? this.redoSeq[this.redoSeq.length - 1] : -1; }
  /** Drop the redo stack (a new edit on a sibling history invalidates it). */
  clearRedo(): void { this.redoStack = []; this.redoSeq = []; }

  record(snapshot: SpriteSnapshot): void {
    this.undoStack.push(cloneSnap(snapshot));
    this.undoSeq.push(nextEditSeq());
    if (this.undoStack.length > this.cap) { this.undoStack.shift(); this.undoSeq.shift(); }
    this.redoStack = [];
    this.redoSeq = [];
  }

  undo(current: SpriteSnapshot): SpriteSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneSnap(current));
    this.redoSeq.push(this.undoSeq.pop()!);
    return cloneSnap(prev);
  }

  redo(current: SpriteSnapshot): SpriteSnapshot | null {
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
