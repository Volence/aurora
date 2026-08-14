// Classic's 8x8 tile <-> the shared PixelBuffer substrate.
//
// WHY THIS EXISTS: the pixel-editing substrate (PixelEditController/PixelViewport,
// shared with the sprite editor) speaks `PixelBuffer` — width/height plus one
// palette index per pixel. Classic's store speaks the ROM's packed form: 32 bytes
// per tile, 4 bits per pixel. Neither side should learn the other's shape, so the
// conversion lives here, in exactly one place, and stays pure/node-testable —
// which matters because the test suite cannot render React or canvas, so a pure
// seam like this one is the only part of the pixel path that gets real coverage.
//
// This module owns BOTH directions of that 4bpp packing for the classic art-edit
// path. `packTilePixels` used to live in renderer/components/classic/composer-math.ts;
// it moved here so core can reach it (core must never import the renderer — see
// the note at src/core/project/adapter.ts:87). composer-math kept a re-export
// through H1.3–H1.6 so its existing callers did not have to move; H1.7 deleted it
// once TileTab — the last one — imported straight from here. There is now exactly
// ONE import path for the packer, which is this file.
//
// `bufferToTileBytes` MUST stay equivalent to `packTilePixels`: it wraps it rather
// than reimplementing, so equivalence is by construction, not by test. (A case
// asserting it once lived in the renderer suite, importing the packer through the
// re-export so it was not f(x) === f(x). With the re-export gone that is the only
// spelling left and the case could no longer fail, so it went with it. The
// round-trip below still pins the nibble order, and rasterize.test.ts pins
// `unpack4bppTile`'s.)
//
// SCOPE OF THAT CLAIM: "one implementation" holds for the classic art-edit path
// ONLY — it is NOT true of the codebase. This format is decoded in three places and
// written in two. The others are recorded here, not fixed; none is reachable from
// this module:
//   decoders
//     rasterize.ts unpack4bppTile        — canonical; new code should use this one
//     formats/tiles.ts parseTiles        — bulk decode of a whole pool
//     formats/sprite-mappings.ts         — inline inside renderSpriteFrame, decodes
//                                          straight to RGBA and shares no helper
//   packers
//     packTilePixels (this module)       — the classic art-edit path
//     export/tile-dedup.ts serializeTiles — pre-existing bulk export path
// If you ever unify these, correct this list rather than trusting it: comments in
// this codebase have outlived their accuracy before.

import type { PixelBuffer } from './pixel-ops';
import { TILE_PX, TILE_PIXELS, unpack4bppTile } from './rasterize';

// 4bpp: two pixels share a byte, so a 64-pixel tile is 32 bytes. Derived rather
// than written as a literal so it cannot drift from the pixel count above it.
const TILE_BYTES = TILE_PIXELS / 2;

/**
 * Pack 64 palette indices into one tile's 32 bytes. The HIGH nibble is the LEFT
 * (even-x) pixel, the low nibble the right — the inverse of `unpack4bppTile`.
 *
 * This is the SOLE pixels->bytes path for classic art edits, so the nibble order
 * is pinned by this module's own round-trip case: a swap would silently corrupt
 * every art edit.
 */
export function packTilePixels(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(TILE_BYTES);
  for (let i = 0; i < TILE_PIXELS; i++) {
    const b = i >> 1;
    if ((i & 1) === 0) out[b] = (out[b] & 0x0f) | ((px[i] & 0xf) << 4);
    else out[b] = (out[b] & 0xf0) | (px[i] & 0xf);
  }
  return out;
}

/**
 * Read one 8x8 tile out of a packed tile-pool blob as a `PixelBuffer`.
 *
 * An out-of-range `tileIndex` yields a zero-filled 8x8 buffer rather than null.
 * That is deliberate on two counts: it preserves the contract the tile tab's old
 * `readTilePixels` had (so no caller's behaviour changed), and `PixelViewport`
 * takes a non-nullable `buffer` prop — returning null would force a guard at
 * every call site to express what a blank tile already says. Index 0 is the
 * transparent entry, so a missing tile simply renders as nothing, which is
 * exactly what happens today.
 */
export function tileToBuffer(tiles: Uint8Array, tileIndex: number): PixelBuffer {
  // unpack4bppTile returns null out of range; the zero-fill is this wrapper's job.
  const data = unpack4bppTile(tiles, tileIndex) ?? new Uint8Array(TILE_PIXELS);
  return { width: TILE_PX, height: TILE_PX, data };
}

/**
 * Pack a `PixelBuffer` back into one tile's 32 bytes, ready for the store.
 *
 * Only the first 64 entries participate — the caller is expected to hand back a
 * buffer the substrate derived from `tileToBuffer`, so it is 8x8 by construction.
 */
export function bufferToTileBytes(buf: PixelBuffer): Uint8Array {
  return packTilePixels(buf.data);
}

/** True when two buffers differ in shape or in any pixel. */
function differs(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return true;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return true;
  return false;
}

/**
 * The 32 bytes for `after`, or NULL when `after` is byte-identical to `before`.
 *
 * "Nothing changed → write nothing" is one rule with two callers —
 * `classic-tile-gesture` (its rule 3) and `classic-tile-transform` (its rule C,
 * which used to reach through the gesture resolver with a synthesised result and
 * `locked: false` purely to borrow this pair). Both spellings mean the same
 * thing, so it lives here, next to the packer it wraps.
 *
 * WHY IT MATTERS: every commit on the classic art-edit path is one
 * `classicEditTiles`, i.e. exactly one undo entry. A result identical to what is
 * already in the document must not push one — a plain marquee drag returns the
 * UNCHANGED snapshot as its buffer, so without this every select drag would mint
 * an empty undo step.
 *
 * DELIBERATELY LOCK-BLIND. It answers "did this change anything", never "is this
 * allowed" — the two verdicts want different messages (a locked no-op is silent;
 * a locked change is refused out loud), and folding them together here is what
 * forced the transform resolver to lie about the lock in the first place.
 */
export function tileBytesIfChanged(before: PixelBuffer, after: PixelBuffer): Uint8Array | null {
  return differs(before, after) ? bufferToTileBytes(after) : null;
}
