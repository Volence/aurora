import { describe, it, expect } from 'vitest';
import {
  createDoc, docFromChunk, docFromTile, getPixel, setPixels, stampTile,
  sliceForSave, cellAt,
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
});
