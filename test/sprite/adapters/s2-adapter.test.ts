import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { s2Adapter } from '../../../src/core/formats/games/s2';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));
const map = fx('s2_obj0B_map.bin');
const dplc = fx('s2_obj08_dplc.bin');

describe('s2 adapter — readMappings vs real assembled s2disasm fixture', () => {
  const frames = s2Adapter.readMappings(map);

  it('recovers all 5 frames', () => {
    expect(frames).toHaveLength(5);
  });

  it('reads frame 0 piece count (plain word count, not count-1)', () => {
    expect(frames[0].pieces).toHaveLength(2);
  });

  it('reads frame 0 piece 0 fields (spritePiece -$10,-$10,4,1,0)', () => {
    expect(frames[0].pieces[0]).toEqual({
      xOffset: -16, yOffset: -16, widthCells: 4, heightCells: 1,
      tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
  });

  it('reads frame 0 piece 1 fields and IGNORES the 2P-tile word', () => {
    expect(frames[0].pieces[1]).toEqual({
      xOffset: -16, yOffset: -8, widthCells: 4, heightCells: 3,
      tile: 0x24, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
  });

  it('reads a yflip piece (frame 3 piece 0: spritePiece -$10,0,4,4,4,0,1)', () => {
    expect(frames[3].pieces[0]).toMatchObject({
      xOffset: -16, yOffset: 0, widthCells: 4, heightCells: 4, tile: 4, yFlip: true, xFlip: false,
    });
  });
});

describe('s2 adapter — writeMappings reproduces the real fixture byte-for-byte', () => {
  it('write ∘ read is identity on the real Sega-format bytes (incl. derived 2P word)', () => {
    const frames = s2Adapter.readMappings(map);
    expect(Array.from(s2Adapter.writeMappings(frames))).toEqual(Array.from(map));
  });
});

describe('s2 adapter — DPLC vs real assembled fixture', () => {
  const perFrame = s2Adapter.readDPLC!(dplc);

  it('recovers 22 frames', () => {
    expect(perFrame).toHaveLength(22);
  });

  it('frame 0 is empty, frame 1 loads 8 tiles from 0, frame 2 loads 16 from 8', () => {
    expect(perFrame[0]).toEqual([]);
    expect(perFrame[1]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(perFrame[2]).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it('writeDPLC packs entry words exactly as the real game does', () => {
    // Real fixture frame 1 entry = 0x7000 = ((8-1)<<12)|0; frame 2 = 0xf008.
    const out8 = s2Adapter.writeDPLC!([[0, 1, 2, 3, 4, 5, 6, 7]]);
    const dv8 = new DataView(out8.buffer, out8.byteOffset, out8.byteLength);
    expect(dv8.getUint16(dv8.getUint16(0, false), false)).toBe(1); // count word
    expect(dv8.getUint16(dv8.getUint16(0, false) + 2, false)).toBe(0x7000);

    const out16 = s2Adapter.writeDPLC!([Array.from({ length: 16 }, (_, i) => 8 + i)]);
    const dv16 = new DataView(out16.buffer, out16.byteOffset, out16.byteLength);
    expect(dv16.getUint16(dv16.getUint16(0, false) + 2, false)).toBe(0xf008);
  });

  it('round-trips the whole real table semantically (write ∘ read ∘ write)', () => {
    // Byte-identity is not guaranteed: the source reuses one empty block across
    // several frames; the logical model emits a block per frame. Semantics match.
    expect(s2Adapter.readDPLC!(s2Adapter.writeDPLC!(perFrame))).toEqual(perFrame);
  });
});

describe('s2 adapter identity', () => {
  it('is s2 / nemesis art', () => {
    expect(s2Adapter.id).toBe('s2');
    expect(s2Adapter.artCompression).toBe('nemesis');
  });
});
