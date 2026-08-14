// What one classic tile-editor TRANSFORM means: given the tile's pixels, the
// action the shared option bar armed, the marquee (if any) and the tile's lock
// verdict — which 32 bytes, if any, should be committed?
//
// WHY THIS IS ITS OWN MODULE: the same reason classic-tile-gesture.ts is. The
// host is TileTab.tsx, and no .tsx in this repo is visible to the test suite
// (there is no jsdom and .tsx files are not collected at all). The decision here
// has four independent inputs and three refusal paths, so leaving it inside a
// React effect would mean shipping it untested.
//
// THE SLOT IS CROSS-ENGINE. `artStore.pendingAction` is one string shared by
// every art host; aeon's ComposerCanvas reads it too. This module only decides
// what to write — the host is responsible for calling `clearAction()`
// UNCONDITIONALLY afterwards, including on every path here that returns no
// bytes. An action left in the slot is an action that fires on some later mount.
//
// RULE A — the target is `selection ?? the whole tile`, CLAMPED.
//   A marquee is not guaranteed to be inside the tile: the select tool's
//   move-drag returns `sel.x + dx` with no bounds check
//   (pixel-edit-controller.ts:220), so dragging a marquee half off the 8x8 leaves
//   a selection that overhangs. Transforming that region unclamped would read and
//   write out of the buffer. The intersection is used instead; an empty
//   intersection transforms nothing.
//
// RULE B — `rotate90` is square-only, and a marquee need not be square.
//   `pixel-ops.ts`'s rotate90 THROWS on a non-square buffer, and even if it did
//   not, its result has width and height swapped and so cannot be written back
//   into the region it came from. Aeon's ComposerCanvas guards this with
//   `if (region.w === region.h)` and then does nothing at all — a silent no-op.
//   The verdict here is the same (refuse; never rotate within a bounding box,
//   which would destroy pixels outside the marquee), but the refusal is REPORTED
//   rather than swallowed, so the host can say why the button did nothing. See
//   TileTab.tsx's effect for the divergence note.
//
// RULE C — locked refuses the write, and the no-op rule still applies first.
//   A transform that changes nothing (wrap-shifting a uniform tile, flipping a
//   symmetric one) must not mint an undo entry even when unlocked — that is
//   classic-tile-gesture's rule 3, and it is reused here rather than restated. A
//   locked tile that WOULD have changed gets a refusal message; a locked tile
//   whose transform was a no-op anyway gets silence, because there is nothing to
//   explain.

import { createBuffer, flipH, flipV, rotate90, wrapShift } from './pixel-ops';
import type { PixelBuffer } from './pixel-ops';
import type { Selection } from './pixel-edit-controller';
import { resolveTileGesture } from './classic-tile-gesture';

/** The actions the shared option bar's transform grid can arm (ArtToolOptions'
 *  TRANSFORMS table). `artStore.pendingAction` is typed `string | null`, so this
 *  set is the only thing standing between an unknown action and a bad write. */
export type TileTransform =
  | 'flip-h' | 'flip-v' | 'rotate-90'
  | 'shift-up' | 'shift-down' | 'shift-left' | 'shift-right';

const TRANSFORMS: ReadonlySet<string> = new Set<TileTransform>([
  'flip-h', 'flip-v', 'rotate-90', 'shift-up', 'shift-down', 'shift-left', 'shift-right',
]);

export function isTileTransform(action: string): action is TileTransform {
  return TRANSFORMS.has(action);
}

export interface TileTransformOutcome {
  /** The 32 tile bytes to commit, or null when this transform writes nothing. */
  bytes: Uint8Array | null;
  /** A user-facing reason the transform wrote nothing, or null when there is
   *  nothing worth saying (unknown action, empty region, or a genuine no-op). */
  refusal: string | null;
}

const NOTHING: TileTransformOutcome = { bytes: null, refusal: null };

/** The marquee ∩ the tile, or null when they do not overlap (see rule A). */
function clampRegion(sel: Selection | null, buf: PixelBuffer): Selection | null {
  if (!sel) return { x: 0, y: 0, w: buf.width, h: buf.height };
  const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y);
  const x1 = Math.min(buf.width, sel.x + sel.w), y1 = Math.min(buf.height, sel.y + sel.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Copy a region out of `buf` into its own buffer. */
function extract(buf: PixelBuffer, r: Selection): PixelBuffer {
  const sub = createBuffer(r.w, r.h);
  for (let ry = 0; ry < r.h; ry++) {
    const row = (r.y + ry) * buf.width + r.x;
    sub.data.set(buf.data.subarray(row, row + r.w), ry * r.w);
  }
  return sub;
}

/** `buf` with `sub` written back over region `r` (same shape as `r`). */
function splice(buf: PixelBuffer, sub: PixelBuffer, r: Selection): PixelBuffer {
  const out: PixelBuffer = { width: buf.width, height: buf.height, data: new Uint8Array(buf.data) };
  for (let ry = 0; ry < r.h; ry++) {
    out.data.set(sub.data.subarray(ry * r.w, (ry + 1) * r.w), (r.y + ry) * out.width + r.x);
  }
  return out;
}

function apply(action: TileTransform, sub: PixelBuffer): PixelBuffer {
  switch (action) {
    case 'flip-h': return flipH(sub);
    case 'flip-v': return flipV(sub);
    case 'rotate-90': return rotate90(sub);   // caller has already proved it square
    case 'shift-left': return wrapShift(sub, -1, 0);
    case 'shift-right': return wrapShift(sub, 1, 0);
    case 'shift-up': return wrapShift(sub, 0, -1);
    case 'shift-down': return wrapShift(sub, 0, 1);
  }
}

/**
 * Resolve a pending transform against the tile it would edit.
 *
 * `before` is the tile as the document has it, `action` is the raw
 * `artStore.pendingAction` string, `selection` is the live marquee (null = the
 * whole tile) and `locked` is the composer's lock verdict.
 *
 * Whatever this returns, the caller must clear the pending-action slot.
 */
export function resolveTileTransform(
  before: PixelBuffer, action: string, selection: Selection | null, locked: boolean,
): TileTransformOutcome {
  if (!isTileTransform(action)) return NOTHING;          // not ours; still clear the slot

  const region = clampRegion(selection, before);         // rule A
  if (!region) return NOTHING;

  if (action === 'rotate-90' && region.w !== region.h) { // rule B
    return {
      bytes: null,
      refusal: `Rotate needs a square selection — this marquee is ${region.w}×${region.h}.`,
    };
  }

  const after = splice(before, apply(action, extract(before, region)), region);

  // rule C. Asked UNLOCKED on purpose: `resolveTileGesture` folds "locked" and
  // "nothing changed" into the same null, and those two want different messages.
  const written = resolveTileGesture(before, { buffer: after }, false);
  if (!written.bytes) return NOTHING;                    // genuine no-op — no undo entry, no toast
  if (locked) return { bytes: null, refusal: 'This tile is view-only — transform refused.' };
  return { bytes: written.bytes, refusal: null };
}
