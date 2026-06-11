import { describe, it, expect } from 'vitest';
import {
  parseBgTiles, serializeBgTiles, padBgTilesToLayout, stripBgTilePadding,
} from '../../src/core/formats/bg-tiles';
import type { Tile } from '../../src/core/model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

describe('BG tile blob format (2-byte BE byte-length header + raw 4bpp tiles)', () => {
  it('serializes with a big-endian byte-length header', () => {
    const data = serializeBgTiles([tile(1), tile(2), tile(3)]);
    expect(data.length).toBe(2 + 3 * 32);
    expect((data[0] << 8) | data[1]).toBe(3 * 32); // header = body byte length
  });

  it('round-trips serialize -> parse', () => {
    const tiles = [tile(0), tile(7), tile(15)];
    const parsed = parseBgTiles(serializeBgTiles(tiles));
    expect(parsed).toHaveLength(3);
    expect(Array.from(parsed[1].pixels)).toEqual(Array.from(tiles[1].pixels));
    expect(Array.from(parsed[2].pixels)).toEqual(Array.from(tiles[2].pixels));
  });

  it('parses an engine-style blob (header matches body length)', () => {
    // 2 tiles, header = 64
    const data = new Uint8Array(2 + 64);
    data[0] = 0x00; data[1] = 0x40;
    data.fill(0x11, 2, 34); // tile 0 all pixel-value 1
    const parsed = parseBgTiles(data);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].pixels[0]).toBe(1);
    expect(parsed[1].pixels[0]).toBe(0);
  });

  it('falls back to headerless raw parsing when no header is present', () => {
    const raw = new Uint8Array(2 * 32).fill(0x22); // 2 tiles, length % 32 == 0
    const parsed = parseBgTiles(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].pixels[0]).toBe(2);
  });

  it('serializes an empty tile list as a zero header', () => {
    const data = serializeBgTiles([]);
    expect(data.length).toBe(2);
    expect(parseBgTiles(data)).toHaveLength(0);
  });
});

describe('VRAM-base padding (loader) and stripping (saver)', () => {
  it('pads blob tiles up to the min nonzero layout index when indices are VRAM-absolute', () => {
    const layout = new Uint16Array(64 * 32);
    layout[0] = 1024;       // min nonzero index
    layout[1] = 1025;
    const blob = [tile(3), tile(4)];
    const padded = padBgTilesToLayout(layout, blob);
    expect(padded).toHaveLength(1026);
    expect(padded[1024].pixels[0]).toBe(3);
    expect(padded[1025].pixels[0]).toBe(4);
    expect(padded[0].pixels.every(p => p === 0)).toBe(true);
  });

  it('leaves blob untouched when layout indices are already local to the blob', () => {
    const layout = new Uint16Array(64 * 32);
    layout[0] = 0x2001; // tile 1 of 3 — max index < blob length
    layout[1] = 2;
    const blob = [tile(1), tile(2), tile(3)];
    expect(padBgTilesToLayout(layout, blob)).toBe(blob);
  });

  it('strips a blank padding prefix so save inverts load', () => {
    const layout = new Uint16Array(64 * 32);
    layout[0] = 1024;
    layout[1] = 1025;
    const padded = padBgTilesToLayout(layout, [tile(3), tile(4)]);
    const stripped = stripBgTilePadding(layout, padded);
    expect(stripped).toHaveLength(2);
    expect(stripped[0].pixels[0]).toBe(3);
  });

  it('does not strip when the prefix contains art (local indices using tile 0)', () => {
    const layout = new Uint16Array(64 * 32);
    layout[0] = 1;          // min nonzero index = 1, but tiles[0] has art
    const tiles = [tile(9), tile(1)];
    expect(stripBgTilePadding(layout, tiles)).toBe(tiles);
  });

  it('round-trips load -> save -> load for both index conventions', () => {
    for (const base of [0, 1024]) {
      const layout = new Uint16Array(64 * 32);
      layout[0] = base === 0 ? 1 : base;
      layout[5] = (base === 0 ? 1 : base) + 1;
      const inMemory = padBgTilesToLayout(layout, [tile(0), tile(5), tile(6)].slice(base === 0 ? 0 : 1));
      // save
      const blobBytes = serializeBgTiles(stripBgTilePadding(layout, inMemory));
      // load
      const reloaded = padBgTilesToLayout(layout, parseBgTiles(blobBytes));
      expect(reloaded.length).toBe(inMemory.length);
      for (let i = 0; i < inMemory.length; i++) {
        expect(Array.from(reloaded[i].pixels)).toEqual(Array.from(inMemory[i].pixels));
      }
    }
  });
});
