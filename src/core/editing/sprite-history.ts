import type { PixelBuffer } from '../art/pixel-ops';
import type { Color } from '../model/s4-types';
import type { SpritePaletteMode } from '../art/sprite-palette';
import { nextEditSeq } from './edit-seq';
import { SnapshotHistory } from './snapshot-history';

/** A full snapshot of one sprite document for undo/redo. */
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
export function cloneSpriteSnapshot(s: SpriteSnapshot): SpriteSnapshot {
  return {
    frames: s.frames.map(cloneBuf),
    currentIndex: s.currentIndex,
    selection: s.selection ? { ...s.selection } : null,
    paletteMode: s.paletteMode,
    zoneLine: s.zoneLine,
    standalonePalette: s.standalonePalette.map((c) => ({ ...c })),
  };
}

/** Sprite frames are dense pixel buffers cloned in full on every entry, so the
 *  cap is far tighter than the shared default. */
const SPRITE_MAX_DEPTH = 50;

/**
 * One sprite DOCUMENT's undo stack. Bound at construction to that document's
 * read/write closures (never to "the active document") so a background tab's
 * edits can be undone without checking it out first.
 *
 * Carries edit-sequence stamps on top of the shared snapshot machinery: sprite
 * mode still merges its timeline with the level command history by recency (see
 * renderer/state/sprite-undo.ts). Classic's domain stacks deliberately have no
 * stamps — this is the last consumer of edit-seq, and it retires with that
 * coordinator.
 */
export class SpriteDocHistory extends SnapshotHistory<SpriteSnapshot> {
  // Index-aligned with the base's undo/redo stacks; every override below moves a
  // stamp exactly when the base moves the entry it belongs to.
  private undoSeq: number[] = [];
  private redoSeq: number[] = [];

  constructor(read: () => SpriteSnapshot, write: (s: SpriteSnapshot) => void) {
    super(read, write, SPRITE_MAX_DEPTH);
  }

  protected clone(s: SpriteSnapshot): SpriteSnapshot { return cloneSpriteSnapshot(s); }

  /** Edit-seq of the top undo entry, or -1. */
  topUndoSeq(): number { return this.undoSeq.length ? this.undoSeq[this.undoSeq.length - 1] : -1; }
  /** Edit-seq of the top redo entry, or -1. */
  topRedoSeq(): number { return this.redoSeq.length ? this.redoSeq[this.redoSeq.length - 1] : -1; }

  override record(before: SpriteSnapshot): void {
    super.record(before);
    this.undoSeq.push(nextEditSeq());
    if (this.undoSeq.length > SPRITE_MAX_DEPTH) this.undoSeq.shift();
    this.redoSeq = [];
  }

  override undo(): void {
    if (!this.canUndo) return;
    const seq = this.undoSeq.pop()!;
    super.undo();
    this.redoSeq.push(seq);
  }

  override redo(): void {
    if (!this.canRedo) return;
    const seq = this.redoSeq.pop()!;
    super.redo();
    this.undoSeq.push(seq);
  }

  override clear(): void {
    super.clear();
    this.undoSeq = [];
    this.redoSeq = [];
  }
}
