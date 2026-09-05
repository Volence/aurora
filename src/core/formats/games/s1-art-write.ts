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
// TWO WRITERS live here:
//  • encodeS1ArtWriteBack — the original Nemesis flat-mapping path (unchanged):
//    applies EVERY frame's canvas and recompresses behind the codec self-check.
//  • encodeS1ArtWriteBackDelta — the uncompressed / DPLC path (save-back parcel,
//    audit §5 "Cross-cutting"): diffs each canvas against its ORIGINAL render and
//    applies ONLY the frames that changed, so a zero-edit save serializes the
//    untouched pool byte-for-byte (uncompressed identity is the acceptance bar,
//    not "parses back"). DPLC frames resolve their frame-local mapping tile
//    indices through the frame's source-tile list into the SHARED pool; the
//    measured Sonic structure (scripts/probe-sonic-dplc-sharing.mjs: 178 of
//    1289 pool tiles shared by 2-5 frames) makes shared patches intentional
//    art reuse, so the writer PROCEEDS and reports the co-affected frames by
//    id — and refuses loudly when two EDITED frames disagree about a shared
//    tile (the semantic self-check re-renders every edited frame from the
//    patched pool and demands its exact canvas back).
//
// CAVEAT (documented, acceptable for v1 objects): the inverse render writes every
// covered canvas pixel back into its source tile. For sprites whose pieces overlap
// the same pixel with DIFFERENT underlying tiles, the composited (top) value would
// be written into both tiles. Real S1 object sprites do not overlap destructively,
// and the self-check only proves codec fidelity — not mapping semantics — so this
// is a known, narrow limitation, not a correctness hole in the codec path.

import { nemesisCompress, nemesisDecompress } from '../../compress/nemesis';
import { serializeTiles } from '../../export/tile-dedup';
import { renderFrameToIndices } from '../../art/sprite-render';
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
  localToPool?: number[],
): void {
  const { indices, width, height } = canvas;
  for (const p of frame.pieces) {
    const w = p.widthCells, h = p.heightCells;
    for (let oc = 0; oc < w; oc++) {
      for (let or = 0; or < h; or++) {
        const sc = p.xFlip ? w - 1 - oc : oc;
        const sr = p.yFlip ? h - 1 - or : or;
        const local = p.tile + sc * h + sr;
        const tile = tiles[localToPool ? (localToPool[local] ?? -1) : local];
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

// --- Delta writer: uncompressed / DPLC save-back (audit §5 cross-cutting) ---

/** Compressions the delta writer can emit. Kosinski object art has no S1 writer. */
export type S1WritableCompression = 'nemesis' | 'uncompressed';

export interface S1DeltaWriteOk {
  ok: true;
  bytes: Uint8Array;
  /** Frames whose canvas differs from its original render (at mapped pixels). */
  editedFrameIndices: number[];
  /** UNEDITED frames whose render changed because an edited frame patched a
   *  pool tile they share — the surfaced (never silent) shared-DPLC contract. */
  coAffectedFrames: number[];
  /** Pool tile indices whose 32-byte records changed. */
  changedTiles: number[];
}

export type S1DeltaWriteResult = S1DeltaWriteOk | { ok: false; error: string };

/** Per-frame tile pool: DPLC frames see their source-tile list resolved into the
 *  shared pool (missing entries render blank, exactly like renderFrames). */
function poolForFrame(originalTiles: Tile[], dplc: number[][] | undefined, i: number): Tile[] {
  if (!dplc) return originalTiles;
  const blank: Tile = { pixels: new Uint8Array(64) };
  return (dplc[i] ?? []).map((src) => originalTiles[src] ?? blank);
}

/** Canvas pixels covered by the frame's pieces whose tile actually exists —
 *  the set of pixels an edit can express. Mirrors applyFrameEditsToTiles' walk. */
function coverageMask(
  frame: SpriteFrame, width: number, height: number,
  originX: number, originY: number, poolSize: number, localToPool?: number[],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const p of frame.pieces) {
    for (let oc = 0; oc < p.widthCells; oc++) {
      for (let or = 0; or < p.heightCells; or++) {
        const sc = p.xFlip ? p.widthCells - 1 - oc : oc;
        const sr = p.yFlip ? p.heightCells - 1 - or : or;
        const local = p.tile + sc * p.heightCells + sr;
        const idx = localToPool ? (localToPool[local] ?? -1) : local;
        if (idx < 0 || idx >= poolSize) continue;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const dx = p.xOffset + originX + oc * 8 + px;
            const dy = p.yOffset + originY + or * 8 + py;
            if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
            mask[dy * width + dx] = 1;
          }
        }
      }
    }
  }
  return mask;
}

function differsAtMask(a: Uint8Array, b: Uint8Array, mask: Uint8Array): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i] && a[i] !== b[i]) return true;
  return false;
}

/**
 * Save-back for uncompressed and/or DPLC S1 art. Unlike encodeS1ArtWriteBack
 * (which re-applies every canvas), this diffs each canvas against its ORIGINAL
 * render and patches the pool from CHANGED frames only:
 *  • zero edits → the pool serializes untouched → byte-identical output for
 *    uncompressed sources (the round-trip acceptance);
 *  • an edit through frame F lands exactly in the pool tiles F's pieces cover
 *    (through F's DPLC list when one exists);
 *  • a patched tile shared with unedited frames is REPORTED (coAffectedFrames),
 *    never silently propagated;
 *  • two edited frames disagreeing about a shared tile REFUSE: the semantic
 *    self-check re-renders every edited frame from the patched pool and demands
 *    its exact canvas back at every mapped pixel.
 * Edits outside any mapped piece are not expressible in art bytes and are
 * dropped exactly as the Nemesis writer drops them (documented v1 contract).
 * Nemesis output additionally passes the codec self-check gate.
 */
export function encodeS1ArtWriteBackDelta(
  originalTiles: Tile[],
  editedFrames: EditedFrame[],
  mappings: SpriteFrame[],
  originX: number,
  originY: number,
  compression: S1WritableCompression,
  dplc?: number[][],
): S1DeltaWriteResult {
  const n = Math.min(mappings.length, editedFrames.length);

  // 1. Original renders + coverage masks; collect the frames that changed.
  const origRender: Uint8Array[] = [];
  const masks: Uint8Array[] = [];
  const editedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = editedFrames[i];
    const pool = poolForFrame(originalTiles, dplc, i);
    origRender.push(renderFrameToIndices(mappings[i], pool, c.width, c.height, originX, originY));
    // Coverage is judged against the REAL pool (through the DPLC list when one
    // exists) so "covered" means exactly "applyFrameEditsToTiles can write it".
    masks.push(coverageMask(mappings[i], c.width, c.height, originX, originY, originalTiles.length, dplc?.[i]));
    if (differsAtMask(c.indices, origRender[i], masks[i])) editedIdx.push(i);
  }

  // 2. Patch the pool from the edited frames only.
  const tiles = cloneTiles(originalTiles);
  for (const i of editedIdx) {
    applyFrameEditsToTiles(mappings[i], editedFrames[i], originX, originY, tiles, dplc?.[i]);
  }

  // 3. Semantic self-check: every edited frame must re-render to its exact
  // canvas at every mapped pixel. A miss means the pool cannot express the
  // combined edits (edited frames fighting over a shared tile) — refuse.
  for (const i of editedIdx) {
    const c = editedFrames[i];
    const re = renderFrameToIndices(mappings[i], poolForFrame(tiles, dplc, i), c.width, c.height, originX, originY);
    if (differsAtMask(c.indices, re, masks[i])) {
      return {
        ok: false,
        error: `conflicting edits: frame ${i} cannot re-render to its edited pixels; `
          + `another edited frame changed a shared pool tile differently. Revert one of the edits to save.`,
      };
    }
  }

  // 4. Changed pool tiles + co-affected (unedited frames whose render moved).
  const changedTiles: number[] = [];
  for (let t = 0; t < tiles.length; t++) {
    const a = tiles[t].pixels, b = originalTiles[t].pixels;
    for (let j = 0; j < 64; j++) if (a[j] !== b[j]) { changedTiles.push(t); break; }
  }
  const editedSet = new Set(editedIdx);
  const coAffectedFrames: number[] = [];
  if (changedTiles.length > 0) {
    for (let i = 0; i < n; i++) {
      if (editedSet.has(i)) continue;
      const c = editedFrames[i];
      const re = renderFrameToIndices(mappings[i], poolForFrame(tiles, dplc, i), c.width, c.height, originX, originY);
      if (re.length !== origRender[i].length || re.some((v, j) => v !== origRender[i][j])) coAffectedFrames.push(i);
    }
  }

  // 5. Serialize; Nemesis output passes the codec gate, uncompressed is identity.
  const raw = serializeTiles(tiles);
  if (compression === 'uncompressed') {
    return { ok: true, bytes: raw, editedFrameIndices: editedIdx, coAffectedFrames, changedTiles };
  }
  try {
    const bytes = nemesisCompress(raw);
    const back = nemesisDecompress(bytes);
    if (back.length !== raw.length || back.some((b, i) => b !== raw[i])) {
      return { ok: false, error: 'self-check failed: re-decoded art differs from the edited tiles' };
    }
    return { ok: true, bytes, editedFrameIndices: editedIdx, coAffectedFrames, changedTiles };
  } catch (e) {
    return { ok: false, error: `self-check failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
