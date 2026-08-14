import { describe, it, expect } from 'vitest';
import { isBlankChunk, firstEditableChunk } from '../chunk-pick';
import { packNametableWord } from '../../model/s4-types';
import type { ChunkDef } from '../../model/s4-types';

function chunk(id: string, tiles: number[]): ChunkDef {
  return {
    id, name: id, widthTiles: 2, heightTiles: 2,
    nametable: Uint16Array.from(tiles.map((t) => packNametableWord(t, 0, false, false, false))),
    collisionA: new Uint16Array(1),
    collisionB: new Uint16Array(1),
  };
}

const BLANK = (id: string) => chunk(id, [0, 0, 0, 0]);

describe('isBlankChunk', () => {
  it('is blank when every cell references tile 0', () => {
    expect(isBlankChunk(BLANK('a'))).toBe(true);
  });

  it('is not blank as soon as one cell references anything else', () => {
    expect(isBlankChunk(chunk('b', [0, 0, 7, 0]))).toBe(false);
  });

  it('ignores palette line and flips, which are invisible on a blank tile', () => {
    const c = BLANK('c');
    c.nametable[0] = packNametableWord(0, 2, true, true, true);
    // The bug this pins is classic's, one engine over: firstNonBlankBlock used
    // to treat pal/flip metadata on a tile-0 cell as content, and so landed the
    // Block tier on a block that draws four black quadrants.
    expect(isBlankChunk(c)).toBe(true);
  });
});

describe('firstEditableChunk', () => {
  it('skips leading blanks — aeon OJZ opens on $00, which is one', () => {
    expect(firstEditableChunk([BLANK('a'), BLANK('b'), chunk('c', [1, 0, 0, 0])])?.id).toBe('c');
  });

  it('falls back to the first chunk when every chunk is blank', () => {
    expect(firstEditableChunk([BLANK('a'), BLANK('b')])?.id).toBe('a');
  });

  it('is null for an empty library — the launcher is the honest screen then', () => {
    expect(firstEditableChunk([])).toBeNull();
  });
});
