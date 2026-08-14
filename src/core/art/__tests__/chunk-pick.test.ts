import { describe, it, expect } from 'vitest';
import { isBlankChunk, firstEditableChunk, fitComposerZoom } from '../chunk-pick';
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

describe('fitComposerZoom', () => {
  it('fits a standard 16x16-tile chunk on screen', () => {
    // 128 art px wide; at artStore's default 24 that is 3072px, so the composer
    // opened on the top-left corner of an auto-opened chunk — sky, for OJZ $01.
    const z = fitComposerZoom(16, 16);
    expect(z).toBeLessThan(24);
    expect(z * 16 * 8).toBeLessThanOrEqual(640);
    expect((z + 1) * 16 * 8).toBeGreaterThan(640);
  });

  it('does not magnify a tiny document past the editing default', () => {
    expect(fitComposerZoom(1, 1)).toBe(24);
    expect(fitComposerZoom(2, 2)).toBe(24);
  });

  it('never goes below 1:1, however large the document', () => {
    expect(fitComposerZoom(64, 64)).toBe(1);
    expect(fitComposerZoom(4096, 4096)).toBe(1);
  });

  it('fits the LONGER edge, so a wide document still lands whole', () => {
    expect(fitComposerZoom(32, 4)).toBe(fitComposerZoom(4, 32));
  });

  it('answers the default for a degenerate document rather than dividing by zero', () => {
    expect(fitComposerZoom(0, 0)).toBe(24);
  });
});
