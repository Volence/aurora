import type { Tile, ChunkDef } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';
import { canonicalizeTile } from '../export/tile-dedup';
import { flipTile } from '../import/tile-dedup';
import type { PixelBuffer } from './pixel-ops';
import { createBuffer } from './pixel-ops';

export interface ComposerCell {
  atlasTile: number | null;  // index into the zone tileset
  localId: number | null;    // key into doc.localPixels (not-yet-saved art)
  pal: number;
  hf: boolean;
  vf: boolean;
  pri: boolean;
  coll: number;
}

export interface ComposerDoc {
  widthTiles: number;
  heightTiles: number;
  cells: ComposerCell[];                  // row-major
  localPixels: Map<number, Uint8Array>;   // localId -> 64 pixels
  nextLocalId: number;
}

function emptyCell(): ComposerCell {
  return { atlasTile: null, localId: null, pal: 0, hf: false, vf: false, pri: false, coll: 0 };
}

export function createDoc(widthTiles: number, heightTiles: number): ComposerDoc {
  return {
    widthTiles, heightTiles,
    cells: Array.from({ length: widthTiles * heightTiles }, emptyCell),
    localPixels: new Map(),
    nextLocalId: 1,
  };
}

export function docFromTile(tileIndex: number): ComposerDoc {
  const doc = createDoc(1, 1);
  doc.cells[0].atlasTile = tileIndex;
  return doc;
}

export function docFromChunk(chunk: ChunkDef): ComposerDoc {
  const doc = createDoc(chunk.widthTiles, chunk.heightTiles);
  for (let i = 0; i < doc.cells.length; i++) {
    const word = chunk.nametable[i];
    if (word !== 0) {
      const e = unpackNametableWord(word);
      doc.cells[i] = {
        atlasTile: e.tileIndex, localId: null,
        pal: e.palette, hf: e.hFlip, vf: e.vFlip, pri: e.priority,
        coll: chunk.collision[i],
      };
    } else {
      doc.cells[i] = { ...emptyCell(), coll: chunk.collision[i] };
    }
  }
  return doc;
}

export function cellAt(doc: ComposerDoc, cx: number, cy: number): ComposerCell {
  return doc.cells[cy * doc.widthTiles + cx];
}

/**
 * Resolve a cell's current 64 pixels in DOC orientation (cell flips applied).
 * Always returns a fresh array — safe to mutate.
 */
export function cellPixels(doc: ComposerDoc, atlas: Tile[], cell: ComposerCell): Uint8Array {
  let src: Uint8Array;
  if (cell.localId !== null) src = doc.localPixels.get(cell.localId)!;
  else if (cell.atlasTile !== null && atlas[cell.atlasTile]) src = atlas[cell.atlasTile].pixels;
  else src = new Uint8Array(64);
  return (cell.hf || cell.vf) ? flipTile(src, cell.hf, cell.vf) : new Uint8Array(src);
}

export function getPixel(doc: ComposerDoc, atlas: Tile[], x: number, y: number): number {
  const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
  const cell = cellAt(doc, cx, cy);
  return cellPixels(doc, atlas, cell)[(y % 8) * 8 + (x % 8)];
}

/**
 * Write pixels (doc coordinates). Cells referencing atlas tiles copy-on-write
 * into localPixels — the atlas is NEVER mutated here (in-place atlas edits are
 * the caller's job via set-tileset-tiles commands; this model is for unsaved
 * documents and chunk layouts).
 */
export function setPixels(
  doc: ComposerDoc, atlas: Tile[],
  writes: Array<{ x: number; y: number; value: number }>,
): void {
  for (const wr of writes) {
    const cx = Math.floor(wr.x / 8), cy = Math.floor(wr.y / 8);
    const cell = cellAt(doc, cx, cy);
    if (cell.localId === null) {
      // copy-on-write: bake current appearance (flips applied) into a local buffer
      const baked = new Uint8Array(cellPixels(doc, atlas, cell));
      const id = doc.nextLocalId++;
      doc.localPixels.set(id, baked);
      cell.localId = id;
      cell.atlasTile = null;
      cell.hf = false; cell.vf = false; // baked-in
    }
    doc.localPixels.get(cell.localId!)![(wr.y % 8) * 8 + (wr.x % 8)] = wr.value & 0xF;
  }
}

/**
 * Flatten the whole document into one PixelBuffer (doc orientation — cell
 * flips applied). Used by whole-doc operations (fill, shapes, transforms,
 * selection move/paste) that run pure pixel-ops and then diff back to writes.
 */
export function docToBuffer(doc: ComposerDoc, atlas: Tile[]): PixelBuffer {
  const w = doc.widthTiles * 8;
  const buf = createBuffer(w, doc.heightTiles * 8);
  for (let cy = 0; cy < doc.heightTiles; cy++) {
    for (let cx = 0; cx < doc.widthTiles; cx++) {
      const px = cellPixels(doc, atlas, doc.cells[cy * doc.widthTiles + cx]);
      for (let row = 0; row < 8; row++) {
        buf.data.set(px.subarray(row * 8, row * 8 + 8), (cy * 8 + row) * w + cx * 8);
      }
    }
  }
  return buf;
}

/** Diff two equal-sized buffers into setPixels-ready writes (after wins). */
export function bufferToWrites(
  before: PixelBuffer, after: PixelBuffer,
): Array<{ x: number; y: number; value: number }> {
  const out: Array<{ x: number; y: number; value: number }> = [];
  for (let i = 0; i < before.data.length; i++) {
    if (before.data[i] !== after.data[i]) {
      out.push({ x: i % before.width, y: Math.floor(i / before.width), value: after.data[i] });
    }
  }
  return out;
}

export interface StampSpec { tile: number; pal: number; hf: boolean; vf: boolean; pri: boolean; coll: number; }

export function stampTile(doc: ComposerDoc, cx: number, cy: number, spec: StampSpec): void {
  const old = doc.cells[cy * doc.widthTiles + cx];
  if (old.localId !== null) doc.localPixels.delete(old.localId);
  doc.cells[cy * doc.widthTiles + cx] = {
    atlasTile: spec.tile, localId: null,
    pal: spec.pal, hf: spec.hf, vf: spec.vf, pri: spec.pri, coll: spec.coll,
  };
}

export interface SliceResult {
  nametable: Uint16Array;   // final words; local tiles resolved to atlas.length+K indices
  collision: Uint8Array;
  newTiles: Tile[];         // tiles to append to the atlas (in order)
}

/**
 * Resolve a document for saving: every local tile is deduped flip-aware
 * against the atlas (and against other locals); survivors become newTiles
 * appended after atlas.length. Cell flips compose with dedup compensation.
 */
export function sliceForSave(doc: ComposerDoc, atlas: Tile[]): SliceResult {
  const atlasByHash = new Map<string, { index: number; fx: boolean; fy: boolean }>();
  atlas.forEach((tile, i) => {
    const canon = canonicalizeTile(tile.pixels);
    if (!atlasByHash.has(canon.hash)) atlasByHash.set(canon.hash, { index: i, fx: canon.fx, fy: canon.fy });
  });

  const newTiles: Tile[] = [];
  const pending = new Map<string, { index: number; fx: boolean; fy: boolean }>();
  const nametable = new Uint16Array(doc.cells.length);
  const collision = new Uint8Array(doc.cells.length);

  doc.cells.forEach((cell, i) => {
    collision[i] = cell.coll;
    let tileIndex: number; let hf = cell.hf; let vf = cell.vf;
    if (cell.localId !== null) {
      // Snapshot before canonicalizing so the WeakMap cache key is unique
      // per logical version of the buffer (avoids stale dedup after re-edits).
      const snapshot = new Uint8Array(doc.localPixels.get(cell.localId)!);
      const canon = canonicalizeTile(snapshot);
      const hit = atlasByHash.get(canon.hash) ?? pending.get(canon.hash);
      if (hit) {
        tileIndex = hit.index;
        // Honor cell flips (may be non-false when caller sets them manually);
        // compose with flip compensation from canonicalization.
        hf = cell.hf !== (canon.fx !== hit.fx);
        vf = cell.vf !== (canon.fy !== hit.fy);
      } else {
        if (atlas.length + newTiles.length >= 0x800)
          throw new Error('tileset would exceed 2048 tiles (11-bit index)');
        tileIndex = atlas.length + newTiles.length;
        pending.set(canon.hash, { index: tileIndex, fx: canon.fx, fy: canon.fy });
        newTiles.push({ pixels: snapshot });
        // Preserve cell flips (baked invariant: normally false, but honored if set)
        hf = cell.hf; vf = cell.vf;
      }
    } else if (cell.atlasTile !== null) {
      tileIndex = cell.atlasTile;
    } else {
      // Empty cell: word 0 (tile #0, palette 0, no flags). This is ambiguous
      // with a stamp of tile #0/pal 0/no flags — unreachable via UI (palette
      // lines are 1-3 for user painting); relevant to programmatic callers.
      nametable[i] = 0;
      return;
    }
    nametable[i] = packNametableWord(tileIndex, cell.pal, cell.pri, vf, hf);
  });

  return { nametable, collision, newTiles };
}
