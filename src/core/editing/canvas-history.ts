// ONE canvas document's undo stack. Bound at construction to that document's
// read/write closures (never to "the active document"), exactly like
// SpriteDocHistory — so a background canvas tab's edits can be undone from its
// close confirm without checking it out first.
//
// The snapshot is the whole editable state: pixels, the 64-word palette, the
// marquee, the constraint profile and the grid origin. Only the name is
// document IDENTITY and sits outside. Profile is an EDIT and sits inside —
// same split SpriteSnapshot makes for paletteMode (spriteStore.setPaletteMode
// calls recordEdit; profileId is the canvas's analogue, both answering "what
// colour/constraint model is this document under"). Leaving profileId out
// would let a profile switch dirty the document while being un-undoable, and
// a later Ctrl+Z would silently revert the previous paint stroke instead while
// leaving the new (wrong) profile in place — the worst of both, since 2B's
// clash overlay depends on which profile is active.
//
// gridOrigin is inside for the SAME reason, not merely by analogy: it decides
// where the profile's tile grid starts, so it decides which pixels share a tile
// and therefore which palette-line clashes exist. It is a deliberate
// document-level choice with visible consequences, it is persisted in the
// sidecar, and two numbers cost nothing to clone. Leaving it out would have
// made it dirty-but-un-undoable — the exact shape R13 rejected for the field
// sitting next to it.

import type { PixelBuffer } from '../art/pixel-ops';
import { clonePixelBuffer } from '../art/pixel-ops';
import type { Selection } from '../art/pixel-edit-controller';
import type { ConstraintProfileId } from '../art/canvas-profiles';
import type { CanvasGridOrigin } from '../art/canvas-doc';
import { SnapshotHistory } from './snapshot-history';

/** A full snapshot of one canvas document for undo/redo. */
export interface CanvasSnapshot {
  pixels: PixelBuffer;
  palette: number[];
  selection: Selection | null;
  profileId: ConstraintProfileId;
  gridOrigin: CanvasGridOrigin;
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
    // Copied, not aliased: a snapshot that shares the document's origin object
    // would be rewritten by the next nudge, and undo would restore the value it
    // was supposed to revert (the R4/R5 `palette: d.palette` bug, one field over).
    gridOrigin: { ...s.gridOrigin },
  };
}

export class CanvasDocHistory extends SnapshotHistory<CanvasSnapshot> {
  constructor(read: () => CanvasSnapshot, write: (s: CanvasSnapshot) => void) {
    super(read, write, CANVAS_MAX_DEPTH);
  }

  protected clone(s: CanvasSnapshot): CanvasSnapshot { return cloneCanvasSnapshot(s); }
}
