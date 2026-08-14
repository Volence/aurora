// What one classic tile-editor gesture MEANS: given the PixelEditController's
// result, does the marquee move, and are there bytes to commit?
//
// WHY THIS IS ITS OWN MODULE: these three rules are the whole bug surface of
// hosting the shared pixel substrate on classic's Art facet, and TileTab.tsx —
// like every .tsx in this repo — is invisible to the test suite (there is no
// jsdom and .tsx files are not collected at all). Lifting the decision out of
// the React commit callback is the only way any of it gets real coverage.
//
// RULE 1 — `selection === undefined` is NOT `selection === null`.
//   `end()` returns an explicit `null` to mean "the marquee was cleared" and
//   OMITS the key entirely for every non-select tool (pixel-edit-controller.ts
//   :209/:220/:224/:226). A truthiness test collapses both into "leave the
//   marquee alone", which strands a cleared marquee on screen; a `!= null` test
//   collapses them the other way, so an ordinary pencil stroke would wipe the
//   user's selection. Only `!== undefined` distinguishes them, so this module
//   reports the two answers separately: `applySelection` (did the gesture say
//   anything about the marquee) and `selection` (what it said).
//
// RULE 2 — a locked tile still takes selections; it only refuses WRITES.
//   Selecting is reading, so the marquee answer is computed before the lock is
//   consulted and is returned even when `bytes` is null. This is not hypothetical
//   tidiness: the select tool's move-drag produces BOTH a new marquee and moved
//   pixels in one result, and on an anim/gap tile the marquee must land while the
//   pixels are refused.
//
// RULE 3 — a gesture that changed nothing commits nothing.
//   Every commit on this path is one `classicEditTiles`, i.e. exactly one undo
//   entry, so a result byte-identical to what was already there must not push
//   one. The hand-rolled editor this replaced had the same rule in cruder form
//   (it bailed on an empty stroke map or an empty fill region). It became
//   load-bearing when the marquee arrived: a plain select drag returns the
//   UNCHANGED snapshot as its buffer, so without this every marquee drag would
//   mint an empty undo step for the user to press Ctrl+Z through.

import type { PixelBuffer } from './pixel-ops';
import type { GestureResult, Selection } from './pixel-edit-controller';
import { bufferToTileBytes } from './classic-tile-buffer';

export interface TileGestureOutcome {
  /** The gesture reported a marquee answer — the host must apply `selection`. */
  applySelection: boolean;
  /** The new marquee when `applySelection`; `null` means "cleared". */
  selection: Selection | null;
  /** The 32 tile bytes to commit, or null when this gesture writes nothing. */
  bytes: Uint8Array | null;
}

/** True when two buffers differ in shape or in any pixel. */
function differs(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return true;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return true;
  return false;
}

/**
 * Resolve a gesture against the tile it started from.
 *
 * `before` is the buffer the host handed the viewport (the tile as the document
 * has it); `result` is what `PixelEditController.begin`/`end` returned; `locked`
 * is the composer's lock verdict for that tile.
 */
export function resolveTileGesture(
  before: PixelBuffer, result: GestureResult, locked: boolean,
): TileGestureOutcome {
  const applySelection = result.selection !== undefined;   // rule 1
  const selection = result.selection ?? null;
  // rules 2 and 3: the marquee answer above survives both of these.
  if (locked || !differs(before, result.buffer)) return { applySelection, selection, bytes: null };
  return { applySelection, selection, bytes: bufferToTileBytes(result.buffer) };
}
