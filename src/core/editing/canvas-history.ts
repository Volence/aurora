// ONE canvas document's undo stack. Bound at construction to that document's
// read/write closures (never to "the active document"), exactly like
// SpriteDocHistory — so a background canvas tab's edits can be undone from its
// close confirm without checking it out first.
//
// The snapshot is the whole editable state: pixels, the 64-word palette and the
// marquee. Name, profile and grid origin are document IDENTITY, not edits, and
// deliberately sit outside (matching SpriteSnapshot's split).

import type { PixelBuffer } from '../art/pixel-ops';
import type { Selection } from '../art/pixel-edit-controller';
import { SnapshotHistory } from './snapshot-history';

export interface CanvasSnapshot {
  pixels: PixelBuffer;
  palette: number[];
  selection: Selection | null;
}

/** Entries kept per stack. Canvas pixels are dense buffers cloned in full per
 *  entry, same reasoning as SPRITE_MAX_DEPTH — and a canvas can be much larger
 *  than a sprite frame (MAX_SIDE = 1024 in canvas-doc.ts, ~1 MB/snapshot at
 *  full size), so the cap is tighter than the shared default. */
export const CANVAS_MAX_DEPTH = 40;

export function cloneCanvasSnapshot(s: CanvasSnapshot): CanvasSnapshot {
  return {
    pixels: { width: s.pixels.width, height: s.pixels.height, data: new Uint8Array(s.pixels.data) },
    palette: s.palette.slice(),
    selection: s.selection ? { ...s.selection } : null,
  };
}

export class CanvasDocHistory extends SnapshotHistory<CanvasSnapshot> {
  constructor(read: () => CanvasSnapshot, write: (s: CanvasSnapshot) => void) {
    super(read, write, CANVAS_MAX_DEPTH);
  }

  protected clone(s: CanvasSnapshot): CanvasSnapshot { return cloneCanvasSnapshot(s); }
}
