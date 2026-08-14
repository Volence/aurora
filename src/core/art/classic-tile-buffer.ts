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
// the note at src/core/project/adapter.ts:87). composer-math re-exports it, so
// every existing caller keeps its import path. `bufferToTileBytes` MUST stay
// equivalent to `packTilePixels` — it wraps it rather than reimplementing, and the
// "bufferToTileBytes agrees with packTilePixels" case enforces that by importing
// the packer through composer-math's re-export, so the seam fails loudly if it is
// rewired. That case lives in the RENDERER's
// src/renderer/components/classic/__tests__/composer-math.test.ts, not next to
// this module: it asserts a cross-layer contract, and keeping it there is what
// lets this module's own tests import nothing from src/renderer.
//
// SCOPE OF THAT CLAIM: "one implementation" holds for the classic art-edit path
// ONLY — it is NOT true of the codebase. This format is decoded in four places and
// written in two. The others are recorded here, not fixed; none is reachable from
// this module:
//   decoders
//     rasterize.ts unpack4bppTile        — canonical; new code should use this one
//     composer-math.ts readTilePixels    — now a thin delegate to the above
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
 * is pinned by unit tests in both composer-math.test.ts (via the re-export) and
 * this module's own round-trip case: a swap would silently corrupt every art edit.
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
 * That is deliberate on two counts: it preserves the contract `readTilePixels`
 * has always had (so no existing caller's behaviour changes), and `PixelViewport`
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
