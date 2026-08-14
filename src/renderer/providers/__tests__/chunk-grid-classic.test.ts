// Classic port for the neutral ChunkGrid: the S1-shaped facts the grid must not
// know about. All pure — the hook is the only part that touches stores, and
// every decision it makes is delegated to a function here.

import { describe, it, expect } from 'vitest';
import {
  CLASSIC_CHUNK_PX,
  classicCanLoop,
  classicChunkIds,
  classicChunkLabel,
  classicChunkTitle,
  classicEmptyKind,
  classicVersionKey,
  rasterizeClassicChunk,
} from '../chunk-grid-classic';
import type { LevelDoc } from '../../../core/level-classic/model';

/** A doc with `n` chunks, one block, one tile, one palette line. */
function doc(n: number): LevelDoc {
  const tiles = new Uint8Array(32);
  tiles.fill(0x11);
  return {
    game: 's1',
    tiles,
    blocks: [{ cells: [0, 1, 2, 3].map(() => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }],
    chunks: Array.from({ length: n }, () => ({
      cells: Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 })),
    })),
    fg: { width: 1, height: 1, cells: new Uint8Array(1) },
    bg: { width: 1, height: 1, cells: new Uint8Array(1) },
    collision: { colind: new Uint8Array(1), shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [Uint16Array.from({ length: 16 }, (_, i) => i * 0x111)],
    paletteSources: [],
    objects: [],
    start: { x: 0, y: 0 },
    sourceRefs: {},
  };
}

describe('classic chunk-grid port', () => {
  it('enumerates the ENGINE id space: a synthetic air $00 in front of 1-based ids', () => {
    // S1 layout ids are 1-based (chunkIndexForId), so the picker's id space is
    // one longer than the file's chunk list.
    expect(classicChunkIds(doc(3))).toEqual(['0', '1', '2', '3']);
    expect(classicChunkIds(doc(0))).toEqual(['0']);
  });

  it('calls id 0 air, and nothing else', () => {
    expect(classicEmptyKind('0')).toBe('air');
    expect(classicEmptyKind('1')).toBe('none');
    expect(classicEmptyKind('127')).toBe('none');
  });

  it('labels air by name and every other id in hex', () => {
    expect(classicChunkLabel('0')).toBe('air');
    expect(classicChunkLabel('1')).toBe('$01');
    expect(classicChunkLabel('26')).toBe('$1A');
    expect(classicChunkTitle('0')).toContain('erase');
    expect(classicChunkTitle('26')).toContain('$1A');
  });

  it('allows the in-band loop flag only for a real engine id', () => {
    // S1 packs the loop flag in bit 7 of the LAYOUT cell, in-band with the chunk
    // id, so only ids $01..$7F can carry one: $00 is air (nothing to loop) and
    // $80+ would collide with the flag bit itself.
    expect(classicCanLoop(0)).toBe(false);
    expect(classicCanLoop(1)).toBe(true);
    expect(classicCanLoop(0x7f)).toBe(true);
    expect(classicCanLoop(0x80)).toBe(false);
    expect(classicCanLoop(0xff)).toBe(false);
  });

  it('keys each chunk on its own version, under the act epoch', () => {
    const versions = new Map([[1, 7]]);
    expect(classicVersionKey(3, versions, '1')).toBe('3:7');
    // An unedited chunk sits at 0 …
    expect(classicVersionKey(3, versions, '2')).toBe('3:0');
    // … and a new act moves every key, whatever the per-chunk versions say.
    expect(classicVersionKey(4, versions, '1')).toBe('4:7');
  });

  it('rasterizes a real chunk to a full-resolution RGBA buffer', () => {
    const d = doc(2);
    const rgba = rasterizeClassicChunk(d, '1');
    expect(rgba).not.toBeNull();
    expect(rgba!.length).toBe(CLASSIC_CHUNK_PX * CLASSIC_CHUNK_PX * 4);
    // Palette index 1 (tile bytes 0x11) is opaque, so the buffer has content.
    expect(rgba![3]).toBe(255);
  });

  it('paints nothing for air, and for an id past the pool', () => {
    // Air has no data behind it — the grid draws a checkerboard instead, which
    // is a different thing from a blank chunk that rasterizes to nothing.
    expect(rasterizeClassicChunk(doc(2), '0')).toBeNull();
    expect(rasterizeClassicChunk(doc(2), '9')).toBeNull();
    expect(rasterizeClassicChunk(doc(2), 'nonsense')).toBeNull();
  });
});
