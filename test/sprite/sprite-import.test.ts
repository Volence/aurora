import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { reconstructSpriteFrames, reconstructDPLCSprite, parseDPLC } from '../../src/core/import/sprite-import';
import { decomposeFrame, assembleSprite } from '../../src/core/art/sprite-decompose';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import type { SpritePiece } from '../../src/core/model/sprite-types';

function paint(fill: (set: (gx: number, gy: number, c: number) => void) => void, w = 16, h = 16): Uint8Array {
  const px = new Uint8Array(w * h);
  const set = (gx: number, gy: number, c: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * w + (gx * 8 + x)] = c;
  };
  fill(set);
  return px;
}

describe('reconstructSpriteFrames', () => {
  it('round-trips a single 16x16 frame (export bytes → editable bitmap)', () => {
    const pixels = paint((set) => { set(0, 0, 1); set(1, 0, 2); set(0, 1, 3); set(1, 1, 4); });
    const ox = 8, oy = 8;
    const { tiles, pieces } = decomposeFrame({ id: 'f', pixels, width: 16, height: 16, originX: ox, originY: oy, palette: 0, priority: false });
    const mappings = serializeSpriteMappings([{ id: 'f', pieces }]);
    const art = serializeTiles(tiles);

    const recon = reconstructSpriteFrames(mappings, art);
    expect(recon.width).toBe(16);
    expect(recon.height).toBe(16);
    expect(recon.frames).toHaveLength(1);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(pixels));
  });

  it('round-trips a multi-frame sprite via assembleSprite', () => {
    const a = paint((set) => { set(0, 0, 5); set(1, 1, 6); });
    const b = paint((set) => { set(1, 0, 7); set(0, 1, 8); });
    const { art, frames } = assembleSprite([
      { id: 'a', pixels: a, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
      { id: 'b', pixels: b, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
    ]);
    const recon = reconstructSpriteFrames(serializeSpriteMappings(frames), serializeTiles(art));
    expect(recon.frames).toHaveLength(2);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(a));
    expect(Array.from(recon.frames[1])).toEqual(Array.from(b));
  });

  it('always yields at least one frame', () => {
    const recon = reconstructSpriteFrames(new Uint8Array(0), new Uint8Array(0));
    expect(recon.frames.length).toBeGreaterThanOrEqual(1);
  });
});

function piece(p: Partial<SpritePiece>): SpritePiece {
  return { xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false, ...p };
}

describe('parseDPLC', () => {
  it('expands entries into per-frame source-tile lists', () => {
    // 1 frame; entry count 1; entry (count-1=2)<<12 | start 5 = 0x2005 → [5,6,7]
    const bytes = new Uint8Array([0x00, 0x02, 0x00, 0x01, 0x20, 0x05]);
    expect(parseDPLC(bytes)).toEqual([[5, 6, 7]]);
  });
  it('returns [] for empty input', () => {
    expect(parseDPLC(new Uint8Array(0))).toEqual([]);
  });
});

describe('reconstructDPLCSprite', () => {
  it('resolves mapping tile indices through the per-frame DPLC list', () => {
    // mapping: 1 frame, 1 piece (1x1) referencing local tile 0
    const mappings = serializeSpriteMappings([{ id: 'f', pieces: [piece({ tile: 0 })] }]);
    // dplc: frame 0 loads source tile 3 → local 0 = source 3.  bytes: off 0x0002, count 1, entry 0x0003
    const dplc = new Uint8Array([0x00, 0x02, 0x00, 0x01, 0x00, 0x03]);
    // art: tile 3 filled with 9
    const tiles = [0, 1, 2, 3].map((v) => ({ pixels: new Uint8Array(64).fill(v === 3 ? 9 : 0) }));
    const art = serializeTiles(tiles);
    const recon = reconstructDPLCSprite(mappings, dplc, art);
    expect(recon.frames).toHaveLength(1);
    expect(Array.from(recon.frames[0]).every((v) => v === 9)).toBe(true);
  });
});

// Integration check against the REAL Sonic engine binaries (skips if absent).
const ENGINE = '/home/volence/sonic_hacks/s4_engine';
const haveSonic = existsSync(`${ENGINE}/data/mappings/sonic.bin`);
(haveSonic ? describe : describe.skip)('real Sonic data (s4_engine)', () => {
  it('parses 224 frames and reconstructs sane, non-empty character bitmaps', () => {
    const map = new Uint8Array(readFileSync(`${ENGINE}/data/mappings/sonic.bin`));
    const dplc = new Uint8Array(readFileSync(`${ENGINE}/data/dplc/sonic.bin`));
    const art = new Uint8Array(readFileSync(`${ENGINE}/art/uncompressed/characters/sonic.bin`));
    const recon = reconstructDPLCSprite(map, dplc, art);
    expect(recon.frames.length).toBe(224);
    const nonEmpty = recon.frames.filter((fr) => fr.some((v) => v !== 0)).length;
    expect(nonEmpty).toBeGreaterThan(100); // most frames have visible art
    expect(recon.width).toBeGreaterThanOrEqual(16);
    expect(recon.width).toBeLessThanOrEqual(128);
    expect(recon.height).toBeLessThanOrEqual(128);
  });
});
