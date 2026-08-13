// Aeon port for the neutral ChunkGrid: the aeon-shaped facts the grid must not
// know about — string-keyed chunks, display-order hex labels, data-derived blank
// chunks, and the per-chunk repaint key that replaced the global one.

import { describe, it, expect } from 'vitest';
import {
  AEON_CHUNK_PX,
  aeonBlankIds,
  aeonChunkOrder,
  aeonChunkLabel,
  aeonChunkTitle,
  aeonEmptyKind,
  aeonVersionKey,
  isBlankChunk,
  rasterizeAeonChunk,
} from '../chunk-grid-aeon';
import { packNametableWord } from '../../../core/model/s4-types';
import type { ChunkDef, Palette, Tile } from '../../../core/model/s4-types';

/** A 2x1 chunk whose cells reference the given tile indices. */
function chunk(id: string, tileIndices: number[], name = id): ChunkDef {
  return {
    id, name,
    widthTiles: tileIndices.length, heightTiles: 1,
    nametable: Uint16Array.from(tileIndices.map((t) => packNametableWord(t, 0, false, false, false))),
    collisionA: new Uint16Array(tileIndices.length),
    collisionB: new Uint16Array(tileIndices.length),
  };
}

const tiles: Tile[] = [
  { pixels: new Uint8Array(64) },        // tile 0: all colour 0
  { pixels: new Uint8Array(64).fill(1) },
];
const palette: Palette = {
  lines: [{ colors: [{ r: 10, g: 20, b: 30, a: 40 }, { r: 200, g: 0, b: 0, a: 255 }] }],
};

describe('aeon chunk-grid port', () => {
  it('treats a chunk whose every cell is tile 0 as blank', () => {
    // These are REAL chunks with data — OJZ's $00/$2A/$2B/$45 are legitimately
    // blank, not corrupt — so "blank" is a warning that stamping erases, never
    // "this chunk is absent".
    expect(isBlankChunk(chunk('a', [0, 0]))).toBe(true);
    expect(isBlankChunk(chunk('b', [0, 1]))).toBe(false);
    expect(isBlankChunk(chunk('c', [1, 1]))).toBe(false);
  });

  it('collects the blank ids of a library', () => {
    const lib = [chunk('a', [0, 0]), chunk('b', [0, 1]), chunk('c', [0, 0])];
    expect([...aeonBlankIds(lib)].sort()).toEqual(['a', 'c']);
    expect(aeonEmptyKind(aeonBlankIds(lib), 'a')).toBe('blank');
    expect(aeonEmptyKind(aeonBlankIds(lib), 'b')).toBe('none');
  });

  it('labels chunks by DISPLAY position, not by id', () => {
    // Aeon ids are strings from the source filename ("OJZ_1A"); the hex the user
    // reads is the chunk's index in the library, which is what the map stamps.
    const lib = [chunk('x', [1]), chunk('y', [1]), chunk('z', [1])];
    const order = aeonChunkOrder(lib);
    expect(aeonChunkLabel(order, 'x')).toBe('$00');
    expect(aeonChunkLabel(order, 'z')).toBe('$02');
    // An unknown id must not crash the grid mid-import.
    expect(aeonChunkLabel(order, 'nope')).toBe('$??');
  });

  it('warns in the tooltip that a blank chunk erases', () => {
    const c = chunk('a', [0, 0], 'OJZ_00');
    expect(aeonChunkTitle(c, false)).toBe('OJZ_00');
    expect(aeonChunkTitle(c, true)).toContain('erases');
    expect(aeonChunkTitle(undefined, false)).toBe('');
  });

  it('keys each chunk on its own revision, under the zone and the library epoch', () => {
    const versions = new Map([['a', 5]]);
    // The zone is in the key because thumbnails bake the ZONE's tiles and
    // palette, and the library is project-global: switching zones restains every
    // chunk without touching a single revision.
    expect(aeonVersionKey('ojz', 2, versions, 'a')).toBe('ojz:2:5');
    expect(aeonVersionKey('ojz', 2, versions, 'b')).toBe('ojz:2:0');
    expect(aeonVersionKey('mtz', 2, versions, 'a')).toBe('mtz:2:5');
    // A re-import can hand back the same ids for different art; the epoch is
    // what stops a key from repeating across that swap.
    expect(aeonVersionKey('ojz', 3, new Map(), 'a')).toBe('ojz:3:0');
  });

  it('rasterizes a chunk at the aeon source resolution', () => {
    const rgba = rasterizeAeonChunk(chunk('a', [1]), tiles, palette);
    expect(rgba).not.toBeNull();
    expect(rgba!.length).toBe(AEON_CHUNK_PX * AEON_CHUNK_PX * 4);
    expect([rgba![0], rgba![1], rgba![2], rgba![3]]).toEqual([200, 0, 0, 255]);
  });

  it('paints colour 0 for a blank chunk — alpha included — rather than skipping it', () => {
    // Aeon and classic differ here on purpose: classic never draws colour 0,
    // aeon draws it verbatim. A blank aeon chunk is therefore not necessarily
    // transparent, which is why the grid still rasterizes it.
    const rgba = rasterizeAeonChunk(chunk('a', [0]), tiles, palette);
    expect([rgba![0], rgba![1], rgba![2], rgba![3]]).toEqual([10, 20, 30, 40]);
  });

  it('paints nothing for a missing chunk', () => {
    expect(rasterizeAeonChunk(undefined, tiles, palette)).toBeNull();
  });
});
