import { describe, it, expect } from 'vitest';
import {
  parseBgTiles, serializeBgTiles, normalizeBgLayout, BG_TILE_BASE_SLOT, BG_WIDTH,
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

describe('normalizeBgLayout (engine VRAM-absolute -> local BG-blob indices)', () => {
  it('exports the engine BG region base slot and Plane B width', () => {
    expect(BG_TILE_BASE_SLOT).toBe(1024);
    expect(BG_WIDTH).toBe(64);
  });

  it('subtracts the base from engine-convention indices, preserving pal/flip/pri bits', () => {
    const layout = new Uint16Array(BG_WIDTH * 32);
    layout[0] = 1024;
    layout[1] = (1 << 15) | (2 << 13) | (1 << 12) | (1 << 11) | 1025; // pri, pal 2, vf, hf
    layout[2] = (3 << 13) | 1026;                                     // pal 3
    const out = normalizeBgLayout(layout, BG_TILE_BASE_SLOT);
    expect(out[0]).toBe(0);
    expect(out[1] & 0x7FF).toBe(1);
    expect(out[1] & 0xF800).toBe((1 << 15) | (2 << 13) | (1 << 12) | (1 << 11));
    expect(out[2] & 0x7FF).toBe(2);
    expect(out[2] & 0xF800).toBe(3 << 13);
  });

  it('leaves blank words (tile bits 0) untouched, flags and all', () => {
    const layout = new Uint16Array(BG_WIDTH * 32);
    layout[0] = 1024;            // engine convention trigger
    layout[1] = 0;               // blank
    layout[2] = (1 << 13) | 0;   // tile 0 with pal bits — VRAM blank tile ref
    const out = normalizeBgLayout(layout, BG_TILE_BASE_SLOT);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe((1 << 13) | 0);
  });

  it('passes already-local layouts through unchanged (min nonzero index < base)', () => {
    const layout = new Uint16Array(BG_WIDTH * 32);
    layout[0] = (2 << 13) | 1;
    layout[1] = 5;
    expect(normalizeBgLayout(layout, BG_TILE_BASE_SLOT)).toBe(layout);
  });

  it('passes an all-blank layout through unchanged', () => {
    const layout = new Uint16Array(BG_WIDTH * 32);
    expect(normalizeBgLayout(layout, BG_TILE_BASE_SLOT)).toBe(layout);
  });

  it('does not mutate the input when converting', () => {
    const layout = new Uint16Array(BG_WIDTH * 32);
    layout[0] = 1024;
    normalizeBgLayout(layout, BG_TILE_BASE_SLOT);
    expect(layout[0]).toBe(1024);
  });
});

describe('load/save round-trip in the local convention', () => {
  it('round-trips an engine-shaped fixture: load -> normalize -> save -> reload, render-equivalent', () => {
    // Synthetic engine output: 3 tiles, layout indices 1024-1026.
    const engineTiles = [tile(1), tile(2), tile(3)];
    const engineBlob = serializeBgTiles(engineTiles);
    const engineLayout = new Uint16Array(BG_WIDTH * 32);
    engineLayout[0] = 1024;
    engineLayout[1] = (1 << 13) | 1025;
    engineLayout[2] = 1026;

    // Load: parse + normalize once. In-memory is local from here on.
    const loadedTiles = parseBgTiles(engineBlob);
    const loadedLayout = normalizeBgLayout(engineLayout, BG_TILE_BASE_SLOT);
    expect(Array.from(loadedLayout.slice(0, 3)).map(w => w & 0x7FF)).toEqual([0, 1, 2]);

    // Save: serialize the in-memory arrays directly (editor files stay local).
    const savedBlob = serializeBgTiles(loadedTiles);
    const savedLayout = loadedLayout;

    // Reload: normalize is a no-op on local data.
    const reloadedTiles = parseBgTiles(savedBlob);
    const reloadedLayout = normalizeBgLayout(savedLayout, BG_TILE_BASE_SLOT);
    expect(reloadedLayout).toBe(savedLayout);
    expect(reloadedTiles).toHaveLength(3);

    // Render-equivalence: every layout word resolves to the same pixels the
    // engine layout resolved to.
    for (let i = 0; i < 3; i++) {
      const localIdx = reloadedLayout[i] & 0x7FF;
      expect(Array.from(reloadedTiles[localIdx].pixels)).toEqual(Array.from(engineTiles[i].pixels));
      expect(reloadedLayout[i] & 0xF800).toBe(engineLayout[i] & 0xF800);
    }
  });

  it('preserves blank tile 0 + unreferenced trailing tiles (the old strip/pad corruption case)', () => {
    // Local layout whose min nonzero index is 1, blob with a blank tile 0 and
    // unreferenced trailing tiles. The deleted strip-at-save/pad-at-load pair
    // shifted these blobs by one tile on reload; the local convention must
    // round-trip them byte-identically.
    const tiles = [tile(0), tile(7), tile(0), tile(9)];
    const layout = new Uint16Array(BG_WIDTH * 32);
    layout[0] = 1;
    expect(normalizeBgLayout(layout, BG_TILE_BASE_SLOT)).toBe(layout);
    const reloaded = parseBgTiles(serializeBgTiles(tiles));
    expect(reloaded).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(Array.from(reloaded[i].pixels)).toEqual(Array.from(tiles[i].pixels));
    }
  });
});
