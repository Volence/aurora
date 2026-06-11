import { describe, it, expect } from 'vitest';
import {
  createDoc, docFromChunk, docFromTile, getPixel, setPixels, stampTile,
  sliceForSave, cellAt, docToBuffer, bufferToWrites, adoptPaletteLineForEmptyCells,
} from '../../src/core/art/composer-buffer';
import { packNametableWord, createChunkDef } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

const atlas: Tile[] = [
  { pixels: new Uint8Array(64) },
  { pixels: (() => { const p = new Uint8Array(64); p.fill(7); return p; })() },
];

describe('createDoc / docFromTile / docFromChunk', () => {
  it('creates an empty doc of the right size', () => {
    const doc = createDoc(16, 16);
    expect(doc.widthTiles).toBe(16);
    expect(doc.cells.length).toBe(256);
    expect(doc.cells[0].atlasTile).toBeNull();
  });
  it('docFromTile wraps one atlas tile', () => {
    const doc = docFromTile(1);
    expect(doc.widthTiles).toBe(1);
    expect(doc.cells[0].atlasTile).toBe(1);
  });
  it('docFromChunk decodes nametable words', () => {
    const chunk = createChunkDef('c', 'C', 2, 1);
    chunk.nametable[1] = packNametableWord(1, 2, true, false, true);
    chunk.collision[1] = 9;
    const doc = docFromChunk(chunk);
    const cell = cellAt(doc, 1, 0);
    expect(cell.atlasTile).toBe(1);
    expect(cell.pal).toBe(2);
    expect(cell.hf).toBe(true);
    expect(cell.coll).toBe(9);
  });
});

describe('pixel access', () => {
  it('reads through atlas tiles honoring cell flips', () => {
    const tile: Tile = { pixels: new Uint8Array(64) };
    tile.pixels[0] = 5; // top-left
    const doc = docFromTile(0);
    expect(getPixel(doc, [tile], 0, 0)).toBe(5);
    doc.cells[0].hf = true;
    expect(getPixel(doc, [tile], 7, 0)).toBe(5); // mirrored
  });
  it('setPixels on an atlas cell in a NEW doc copies-on-write to local', () => {
    const doc = createDoc(1, 1);
    doc.cells[0].atlasTile = 1;
    setPixels(doc, atlas, [{ x: 3, y: 3, value: 2 }]);
    expect(doc.cells[0].atlasTile).toBeNull();
    expect(doc.cells[0].localId).not.toBeNull();
    expect(getPixel(doc, atlas, 3, 3)).toBe(2);
    expect(getPixel(doc, atlas, 0, 0)).toBe(7); // copied source pixels kept
    expect(atlas[1].pixels[3 * 8 + 3]).toBe(7); // atlas untouched
  });
});

describe('stampTile', () => {
  it('writes a cell reference with flips', () => {
    const doc = createDoc(2, 2);
    stampTile(doc, 1, 0, { tile: 1, pal: 3, hf: true, vf: false, pri: true, coll: 4 });
    const cell = cellAt(doc, 1, 0);
    expect(cell.atlasTile).toBe(1);
    expect(cell.pal).toBe(3);
    expect(cell.coll).toBe(4);
  });

  it('cleans up orphaned local when overwriting a local cell', () => {
    const doc = createDoc(1, 1);
    setPixels(doc, atlas, [{ x: 0, y: 0, value: 9 }]); // creates localId=1
    const oldId = doc.cells[0].localId!;
    expect(doc.localPixels.has(oldId)).toBe(true);
    stampTile(doc, 0, 0, { tile: 1, pal: 0, hf: false, vf: false, pri: false, coll: 0 });
    expect(doc.localPixels.has(oldId)).toBe(false); // orphan must be deleted
  });
});

describe('cellPixels', () => {
  it('returns a copy for atlas cells (no flips), so mutation does not alias the atlas', () => {
    const doc = createDoc(1, 1);
    doc.cells[0].atlasTile = 1; // atlas tile 1 is all-7s
    // getPixel exercises cellPixels internally; we need cellPixels directly
    // but we can test alias safety via setPixels (which uses cellPixels result as CoW source)
    // Simpler: reach cellPixels via the exported path — it is not exported, so test indirectly.
    // Instead we test that getPixel on a non-flipped atlas cell does not share the atlas buffer:
    // paint the cell; if cellPixels returned the same buffer, doc.localPixels would share atlas memory
    setPixels(doc, atlas, [{ x: 0, y: 0, value: 2 }]);
    expect(atlas[1].pixels[0]).toBe(7); // atlas still intact — no aliasing
    expect(getPixel(doc, atlas, 0, 0)).toBe(2);
  });
});

describe('sliceForSave', () => {
  it('dedups local tiles flip-aware against the atlas and returns nametable + new tiles', () => {
    const doc = createDoc(2, 1);
    // cell 0: hand-painted copy of atlas tile 1 -> should dedup, no append
    setPixels(doc, atlas, Array.from({ length: 64 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8), value: 7 })));
    // cell 1: brand-new art
    stampTile(doc, 1, 0, { tile: 0, pal: 1, hf: false, vf: false, pri: false, coll: 0 });
    setPixels(doc, atlas, [{ x: 8, y: 0, value: 9 }]); // doc x=8 -> cell 1
    const result = sliceForSave(doc, atlas);
    expect(result.newTiles.length).toBe(1);            // only the genuinely new one
    expect(result.nametable.length).toBe(2);
    const w0 = result.nametable[0] & 0x7FF;
    expect(w0).toBe(1);                                 // deduped to atlas tile 1
    const w1 = result.nametable[1] & 0x7FF;
    expect(w1).toBe(atlas.length);                      // first appended index
  });

  it('re-slicing after further edits to a local does not reuse stale dedup results', () => {
    const doc = createDoc(1, 1);
    // paint the local to exactly match atlas tile 1 (all 7s)
    setPixels(doc, atlas, Array.from({ length: 64 }, (_, i) => ({ x: i % 8, y: Math.floor(i / 8), value: 7 })));
    const first = sliceForSave(doc, atlas);
    expect(first.newTiles.length).toBe(0); // deduped to atlas tile 1
    // now edit the local and re-slice
    setPixels(doc, atlas, [{ x: 0, y: 0, value: 3 }]);
    const second = sliceForSave(doc, atlas);
    expect(second.newTiles.length).toBe(1); // edits must NOT vanish
    expect(second.newTiles[0].pixels[0]).toBe(3);
  });

  it('honors flips manually set on a local cell', () => {
    const doc = createDoc(1, 1);
    setPixels(doc, atlas, [{ x: 0, y: 0, value: 5 }]); // local, asymmetric
    doc.cells[0].hf = true; // manually flipped local (constructible via public types)
    const result = sliceForSave(doc, atlas);
    expect(result.newTiles.length).toBe(1);
    const e = result.nametable[0];
    expect((e >> 11) & 1).toBe(1); // hFlip bit set
  });

  it('throws when appending would exceed the 2048-tile ceiling', () => {
    // Build 2047 distinct atlas tiles. Each tile has a unique pattern in bytes
    // 0-2 (nibble-encoded i) and byte 63 = 0xFF (sentinel). This ensures the
    // atlas covers 2047 slots leaving exactly one open slot (index 2047).
    const bigAtlas: Tile[] = Array.from({ length: 2047 }, (_, i) => {
      const p = new Uint8Array(64);
      p[0] = i & 0xF; p[1] = (i >> 4) & 0xF; p[2] = (i >> 8) & 0xF;
      p[63] = 0xF; // sentinel nibble present in all atlas tiles
      return { pixels: p };
    });
    // Two distinct locals whose sentinel byte (63) is 0 — can never match atlas.
    // First local fills slot 2047 (OK), second would reach 2048 (must throw).
    const doc = createDoc(2, 1);
    const id1 = doc.nextLocalId++;
    const p1 = new Uint8Array(64); p1[0] = 0xA; // sentinel byte 63 stays 0
    doc.localPixels.set(id1, p1);
    doc.cells[0].localId = id1;

    const id2 = doc.nextLocalId++;
    const p2 = new Uint8Array(64); p2[0] = 0xB; p2[1] = 0x1; // different from p1
    doc.localPixels.set(id2, p2);
    doc.cells[1].localId = id2;

    expect(() => sliceForSave(doc, bigAtlas)).toThrow(/2048/);
  });
});

describe('docToBuffer / bufferToWrites', () => {
  it('round-trips: buffer reflects atlas + local cells, and writes from a diff reproduce the edit', () => {
    const doc = createDoc(2, 1);
    doc.cells[0].atlasTile = 1;                       // all-7s atlas tile
    setPixels(doc, atlas, [{ x: 9, y: 1, value: 3 }]); // cell 1 becomes local
    const buf = docToBuffer(doc, atlas);
    expect(buf.width).toBe(16);
    expect(buf.height).toBe(8);
    expect(buf.data[0]).toBe(7);              // atlas-backed pixel
    expect(buf.data[1 * 16 + 9]).toBe(3);     // local pixel
    expect(buf.data[8]).toBe(0);              // untouched local stays empty

    // round-trip: edit the buffer, diff, apply, re-extract — buffers match
    const after = { width: buf.width, height: buf.height, data: new Uint8Array(buf.data) };
    after.data[5 * 16 + 12] = 9;
    setPixels(doc, atlas, bufferToWrites(buf, after));
    expect(Array.from(docToBuffer(doc, atlas).data)).toEqual(Array.from(after.data));
  });

  it('bufferToWrites returns only changed pixels with correct coordinates', () => {
    const doc = createDoc(1, 1);
    const before = docToBuffer(doc, atlas);
    const after = { width: 8, height: 8, data: new Uint8Array(before.data) };
    after.data[3 * 8 + 2] = 5;
    const writes = bufferToWrites(before, after);
    expect(writes).toEqual([{ x: 2, y: 3, value: 5 }]);
    expect(bufferToWrites(before, before)).toEqual([]);
  });
});

describe('adoptPaletteLineForEmptyCells', () => {
  it('empty cells under the writes adopt the active palette line', () => {
    const doc = createDoc(2, 1);
    adoptPaletteLineForEmptyCells(doc, [{ x: 1, y: 1 }], 3);
    expect(cellAt(doc, 0, 0).pal).toBe(3);
    expect(cellAt(doc, 1, 0).pal).toBe(0); // untouched cell keeps its line
  });

  it('occupied cells (atlas or local) keep their existing line', () => {
    const doc = createDoc(2, 1);
    cellAt(doc, 0, 0).atlasTile = 1;
    cellAt(doc, 0, 0).pal = 2;
    setPixels(doc, atlas, [{ x: 8, y: 0, value: 5 }]); // cell (1,0) becomes local
    cellAt(doc, 1, 0).pal = 1;
    adoptPaletteLineForEmptyCells(doc, [{ x: 0, y: 0 }, { x: 8, y: 0 }], 3);
    expect(cellAt(doc, 0, 0).pal).toBe(2);
    expect(cellAt(doc, 1, 0).pal).toBe(1);
  });

  it('masks the line to 0-3', () => {
    const doc = createDoc(1, 1);
    adoptPaletteLineForEmptyCells(doc, [{ x: 0, y: 0 }], 6);
    expect(cellAt(doc, 0, 0).pal).toBe(2);
  });
});
