import { describe, it, expect } from 'vitest';
import {
  bgOverrideDisplay, writeBgOverrideLayoutWord,
} from '../../src/core/formats/bg-override/bg-override-view';
import {
  BG_LAYOUT_WORDS, TILE_PIXELS, type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';

/**
 * The document, in the shapes the canvas speaks — and the ONE writer that keeps
 * the two representations equal.
 *
 * The rows here are about identity and about write-through, because those are
 * the two ways this module can fail SILENTLY:
 *
 *   • a fresh array per call means the paint gesture writes a throwaway while
 *     the renderer repaints from the array it kept — a stroke that does nothing,
 *     with nothing on screen to say so;
 *   • a write that lands in only one representation means either a picture the
 *     file does not carry, or a file the picture does not show.
 *
 * Sizes are DERIVED: the plane is BG_LAYOUT_WORDS words and a tile is
 * TILE_PIXELS values, both read from the vendored consumer contract.
 */
function doc(tileCount = 4): BgOverrideDocument {
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, (_, i) => i % tileCount),
    tiles: Array.from({ length: tileCount }, (_, t) =>
      Array.from({ length: TILE_PIXELS }, (_, p) => (t + p) & 0xF)),
  };
}

describe('bgOverrideDisplay', () => {
  it('converts the document into a Uint16Array plane and Tile[] blob', () => {
    const d = doc();
    const view = bgOverrideDisplay(d);
    expect(view.layout).toBeInstanceOf(Uint16Array);
    expect(view.layout.length).toBe(d.layout.length);
    expect([...view.layout.slice(0, 8)]).toEqual(d.layout.slice(0, 8));
    expect(view.tiles).toHaveLength(d.tiles.length);
    expect([...view.tiles[2].pixels]).toEqual(d.tiles[2]);
  });

  it('measures the plane height from the document: it does not assume 64 rows', () => {
    // The legacy 64x32 shape is legal input the consumer zero-pads; a converter
    // that assumed either length would either truncate or invent rows.
    const legacy = doc();
    legacy.layout = legacy.layout.slice(0, BG_LAYOUT_WORDS / 2);
    expect(bgOverrideDisplay(legacy).layout.length).toBe(BG_LAYOUT_WORDS / 2);
  });

  it('returns THE SAME Uint16Array for the same document: the renderer holds it', () => {
    const d = doc();
    expect(bgOverrideDisplay(d).layout).toBe(bgOverrideDisplay(d).layout);
  });

  it('returns a DIFFERENT array for a different document', () => {
    expect(bgOverrideDisplay(doc()).layout).not.toBe(bgOverrideDisplay(doc()).layout);
  });

  it('rebuilds the tiles when the document\'s tile array is REPLACED (a band edit)', () => {
    const d = doc();
    const before = bgOverrideDisplay(d).tiles;
    d.tiles = d.tiles.map((t) => t.map((p) => (p + 1) & 0xF));
    const after = bgOverrideDisplay(d).tiles;
    expect(after).not.toBe(before);
    expect([...after[0].pixels]).toEqual(d.tiles[0]);
  });

  it('does not alias the document\'s tile arrays: a Tile is a copy', () => {
    const d = doc();
    const view = bgOverrideDisplay(d);
    d.tiles[0][0] = 0xF;
    expect(view.tiles[0].pixels[0]).not.toBe(0xF);
  });

  it('re-syncs the mirror from the document on every resolve, keeping its identity', () => {
    // The safety net: a write that bypassed the writer is corrected at the next
    // resolve rather than persisting as a picture that disagrees with the file.
    const d = doc();
    const first = bgOverrideDisplay(d).layout;
    d.layout[7] = 0x1234;
    const second = bgOverrideDisplay(d);
    expect(second.layout).toBe(first);
    expect(second.layout[7]).toBe(0x1234);
  });
});

describe('writeBgOverrideLayoutWord', () => {
  it('writes the DOCUMENT and the MIRROR in one call', () => {
    const d = doc();
    const view = bgOverrideDisplay(d);
    writeBgOverrideLayoutWord(d, 11, 0x2003);
    expect(d.layout[11]).toBe(0x2003);
    expect(view.layout[11]).toBe(0x2003);
  });

  it('writes the document even when no view has ever been resolved', () => {
    const d = doc();
    writeBgOverrideLayoutWord(d, 3, 9);
    expect(d.layout[3]).toBe(9);
  });

  it('refuses to grow the plane: an out-of-range index writes nothing', () => {
    const d = doc();
    const len = d.layout.length;
    writeBgOverrideLayoutWord(d, len, 1);
    writeBgOverrideLayoutWord(d, -1, 1);
    writeBgOverrideLayoutWord(d, 1.5, 1);
    expect(d.layout.length).toBe(len);
    expect(d.layout[len]).toBeUndefined();
  });
});
