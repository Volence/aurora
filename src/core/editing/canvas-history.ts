// ONE canvas document's undo stack. Bound at construction to that document's
// read/write closures (never to "the active document"), exactly like
// SpriteDocHistory — so a background canvas tab's edits can be undone from its
// close confirm without checking it out first.
//
// The snapshot is the whole editable state: pixels, the 64-word palette, the
// marquee and the constraint profile. Name and grid origin are document
// IDENTITY, not edits, and sit outside. Profile is an EDIT and sits inside —
// same split SpriteSnapshot makes for paletteMode (spriteStore.setPaletteMode
// calls recordEdit; profileId is the canvas's analogue, both answering "what
// colour/constraint model is this document under"). Leaving profileId out
// would let a profile switch dirty the document while being un-undoable, and
// a later Ctrl+Z would silently revert the previous paint stroke instead while
// leaving the new (wrong) profile in place — the worst of both, since 2B's
// clash overlay depends on which profile is active.

import type { PixelBuffer } from '../art/pixel-ops';
import { clonePixelBuffer } from '../art/pixel-ops';
import type { Selection } from '../art/pixel-edit-controller';
import type { ConstraintProfileId } from '../art/canvas-profiles';
import { SnapshotHistory } from './snapshot-history';

/** A full snapshot of one canvas document for undo/redo. */
export interface CanvasSnapshot {
  pixels: PixelBuffer;
  palette: number[];
  selection: Selection | null;
  profileId: ConstraintProfileId;
}

/** Entries kept per stack. Canvas pixels are dense buffers cloned in full per
 *  entry, same reasoning as SPRITE_MAX_DEPTH — and a canvas can be much larger
 *  than a sprite frame (MAX_SIDE = 1024 in canvas-doc.ts, ~1 MB/snapshot at
 *  full size). Residency at this cap is ~N snapshots, not ~2N: undoStack and
 *  redoStack share one invariant-capped budget (see SnapshotHistory), so 40
 *  is ~40 MB worst case, not ~80 MB. */
export const CANVAS_MAX_DEPTH = 40;

export function cloneCanvasSnapshot(s: CanvasSnapshot): CanvasSnapshot {
  return {
    pixels: clonePixelBuffer(s.pixels),
    palette: s.palette.slice(),
    selection: s.selection ? { ...s.selection } : null,
    profileId: s.profileId,
  };
}

export class CanvasDocHistory extends SnapshotHistory<CanvasSnapshot> {
  constructor(read: () => CanvasSnapshot, write: (s: CanvasSnapshot) => void) {
    super(read, write, CANVAS_MAX_DEPTH);
  }

  protected clone(s: CanvasSnapshot): CanvasSnapshot { return cloneCanvasSnapshot(s); }
}
