import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { s1Adapter } from '../../../src/core/formats/games/s1';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));
const map = fx('s1_obj0B_map.bin');
const dplc = fx('s1_obj08_dplc.bin');

describe('s1 adapter — vs real assembled Ver 1 fixture', () => {
  const frames = s1Adapter.readMappings(map);

  it('recovers all 5 frames with a byte piece-count header', () => {
    expect(frames).toHaveLength(5);
    expect(frames[0].pieces).toHaveLength(2);
  });

  it('reads 5-byte piece fields (ypos.b/size.b/tile.w/xpos.b)', () => {
    expect(frames[0].pieces[0]).toEqual({
      xOffset: -16, yOffset: -16, widthCells: 4, heightCells: 1,
      tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
    expect(frames[0].pieces[1]).toMatchObject({ tile: 0x24, widthCells: 4, heightCells: 3, yOffset: -8, xOffset: -16 });
  });

  it('writeMappings reproduces the real fixture byte-for-byte (incl. even pad)', () => {
    expect(Array.from(s1Adapter.writeMappings(frames))).toEqual(Array.from(map));
  });
});

describe('s1 adapter — DPLC (byte count, standard packing)', () => {
  const perFrame = s1Adapter.readDPLC!(dplc);

  it('reads expanded source-tile lists', () => {
    expect(perFrame[0]).toEqual([]);
    expect(perFrame[1]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('round-trips semantically', () => {
    expect(s1Adapter.readDPLC!(s1Adapter.writeDPLC!(perFrame))).toEqual(perFrame);
  });
});

describe('s1 adapter identity', () => {
  it('is s1 / nemesis art', () => {
    expect(s1Adapter.id).toBe('s1');
    expect(s1Adapter.artCompression).toBe('nemesis');
  });
});
