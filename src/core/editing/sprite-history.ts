import type { PixelBuffer } from '../art/pixel-ops';
import type { Color } from '../model/s4-types';
import type { SpritePaletteMode } from '../art/sprite-palette';
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
 * Nothing beyond the shared snapshot machinery: the edit-sequence stamps this
 * used to carry existed only so sprite mode could merge its timeline with the
 * level command history by recency, and per-document stacks removed the reason
 * to merge — undo follows the focused document instead.
 */
export class SpriteDocHistory extends SnapshotHistory<SpriteSnapshot> {
  constructor(read: () => SpriteSnapshot, write: (s: SpriteSnapshot) => void) {
    super(read, write, SPRITE_MAX_DEPTH);
  }

  protected clone(s: SpriteSnapshot): SpriteSnapshot { return cloneSpriteSnapshot(s); }
}
