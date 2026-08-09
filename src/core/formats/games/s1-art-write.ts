// s1-art-write — Sonic 1 object sprite ART save-back (Task 15, spec §2.4). The
// sprite mode edits object art as pixels on a per-frame canvas that was rendered
// from the object's Nemesis art + its (READ-ONLY) mappings. This module inverts
// that render — patching the edited canvas pixels back into the ORIGINAL decoded
// tiles in place, so the unchanged mappings still reference the right tiles —
// then re-encodes with Nemesis behind a self-check gate that mirrors s1-io's
// `emitCompressed`: re-decode the encoded buffer and refuse the write on any
// mismatch. Mappings and tile COUNT are never changed here (v1 writes art bytes
// only); a shape/frame change the mappings can't express simply isn't captured.
//
// CAVEAT (documented, acceptable for v1 objects): the inverse render writes every
// covered canvas pixel back into its source tile. For sprites whose pieces overlap
// the same pixel with DIFFERENT underlying tiles, the composited (top) value would
// be written into both tiles. Real S1 object sprites do not overlap destructively,
// and the self-check only proves codec fidelity — not mapping semantics — so this
// is a known, narrow limitation, not a correctness hole in the codec path.

import { nemesisCompress, nemesisDecompress } from '../../compress/nemesis';
import { serializeTiles } from '../../export/tile-dedup';
import type { Tile } from '../../model/s4-types';
import type { SpriteFrame } from '../../model/sprite-types';

/** One edited frame canvas: 4bpp pixel indices laid out width*height (0 = transparent). */
export interface EditedFrame {
  indices: Uint8Array;
  width: number;
  height: number;
}

export type S1ArtWriteResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

function cloneTiles(tiles: Tile[]): Tile[] {
  return tiles.map((t) => ({ pixels: new Uint8Array(t.pixels) }));
}

/**
 * Inverse of `renderFrameToIndices`: write a frame's edited canvas pixels back
 * into the tiles its pieces reference. Mirrors the render's cell/flip walk exactly
 * (VDP column-major `tile + col*heightCells + row`, whole-piece xFlip/yFlip) but
 * copies FROM the canvas INTO `tiles` (mutated in place). All covered pixels are
 * written — including 0 — so an erase to transparent is captured.
 * See the module-header CAVEAT for the destructive-overlap limitation.
 */
function applyFrameEditsToTiles(
  frame: SpriteFrame,
  canvas: EditedFrame,
  originX: number,
  originY: number,
  tiles: Tile[],
): void {
  const { indices, width, height } = canvas;
  for (const p of frame.pieces) {
    const w = p.widthCells, h = p.heightCells;
    for (let oc = 0; oc < w; oc++) {
      for (let or = 0; or < h; or++) {
        const sc = p.xFlip ? w - 1 - oc : oc;
        const sr = p.yFlip ? h - 1 - or : or;
        const tile = tiles[p.tile + sc * h + sr];
        if (!tile) continue;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const spx = p.xFlip ? 7 - px : px;
            const spy = p.yFlip ? 7 - py : py;
            const dx = p.xOffset + originX + oc * 8 + px;
            const dy = p.yOffset + originY + or * 8 + py;
            if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
            tile.pixels[spy * 8 + spx] = indices[dy * width + dx];
          }
        }
      }
    }
  }
}

/**
 * Build the edited tile pool from the original decoded tiles + the edited frame
 * canvases, driven by the (read-only) mappings. Returns fresh Tile copies — the
 * originals are never mutated. The tile COUNT equals the original pool, so the
 * unchanged mappings/DPLC stay valid. Frames/mappings are paired by index; any
 * extra editor frames past the mapping count are ignored (they can't be expressed
 * without a mapping change).
 */
export function buildEditedTiles(
  originalTiles: Tile[],
  editedFrames: EditedFrame[],
  mappings: SpriteFrame[],
  originX: number,
  originY: number,
): Tile[] {
  const tiles = cloneTiles(originalTiles);
  const n = Math.min(mappings.length, editedFrames.length);
  for (let i = 0; i < n; i++) {
    applyFrameEditsToTiles(mappings[i], editedFrames[i], originX, originY, tiles);
  }
  return tiles;
}

/**
 * Re-encode edited S1 object art for save-back: apply the canvas edits to the
 * original tiles, Nemesis-compress, and SELF-CHECK by re-decoding with the real
 * decoder and comparing to the pre-compression bytes. Returns the buffer to write,
 * or a failure — a mismatch or a codec throw never yields writable bytes. The
 * compressor is injectable so tests can prove the gate fires; the decoder used for
 * verification is always the real one.
 */
export function encodeS1ArtWriteBack(
  originalTiles: Tile[],
  editedFrames: EditedFrame[],
  mappings: SpriteFrame[],
  originX: number,
  originY: number,
  compress: (b: Uint8Array) => Uint8Array = nemesisCompress,
): S1ArtWriteResult {
  const raw = serializeTiles(buildEditedTiles(originalTiles, editedFrames, mappings, originX, originY));
  let bytes: Uint8Array;
  try {
    bytes = compress(raw);
    const back = nemesisDecompress(bytes);
    if (back.length !== raw.length || back.some((b, i) => b !== raw[i])) {
      return { ok: false, error: 'self-check failed: re-decoded art differs from the edited tiles' };
    }
  } catch (e) {
    return { ok: false, error: `self-check failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { ok: true, bytes };
}
