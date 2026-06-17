import { describe, it, expect } from 'vitest';
import { computeFrameBbox, serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import type { SpritePiece, SpriteFrame } from '../../src/core/model/sprite-types';

function piece(p: Partial<SpritePiece>): SpritePiece {
  return {
    xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0,
    palette: 0, priority: false, xFlip: false, yFlip: false, ...p,
  };
}

describe('computeFrameBbox', () => {
  it('is exact for a symmetric frame (matches test_mappings F0)', () => {
    const bbox = computeFrameBbox([piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2 })]);
    expect(bbox).toEqual({ xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
  });
  it('symmetrizes an asymmetric frame so one box covers all 4 flips', () => {
    const bbox = computeFrameBbox([piece({ xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1 })]);
    expect(bbox.xMin).toBe(-8);
    expect(bbox.xMax).toBe(8);
    expect(bbox.yMin).toBe(-8);
    expect(bbox.yMax).toBe(8);
  });
  it('unions multiple pieces before symmetrizing', () => {
    const bbox = computeFrameBbox([
      piece({ xOffset: -16, yOffset: -8, widthCells: 1, heightCells: 1 }),
      piece({ xOffset: 8, yOffset: 0, widthCells: 2, heightCells: 1 }),
    ]);
    expect(bbox.xMin).toBe(-24);
    expect(bbox.xMax).toBe(24);
  });
  it('hard-fails when an extent exceeds signed byte range', () => {
    expect(() => computeFrameBbox([piece({ xOffset: 120, widthCells: 4, heightCells: 1 })]))
      .toThrow(/signed byte/);
  });
});

const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ');

describe('serializeSpriteMappings (vs test_mappings.asm)', () => {
  const frames: SpriteFrame[] = [
    { id: 'f0', pieces: [piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0 })] },
    { id: 'f1', pieces: [piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 4 })] },
    { id: 'f2', pieces: [piece({ xOffset: -4, yOffset: -4, widthCells: 1, heightCells: 1, tile: 0 })] },
  ];
  it('emits the offset table then frame blocks', () => {
    const out = serializeSpriteMappings(frames);
    expect(hex(out.subarray(0, 6))).toBe('00 06 00 14 00 22');
  });
  it('emits F0 block exactly (header + 8-byte piece)', () => {
    const out = serializeSpriteMappings(frames);
    expect(hex(out.subarray(6, 6 + 14))).toBe('f8 08 f8 08 00 01 ff f8 05 00 00 00 ff f8');
  });
  it('encodes tile index into tile_attrs (F1 uses tile 4)', () => {
    const out = serializeSpriteMappings(frames);
    expect(hex(out.subarray(0x14, 0x14 + 14))).toBe('f8 08 f8 08 00 01 ff f8 05 00 00 04 ff f8');
  });
  it('emits F2 (1x1, -4 offsets) exactly', () => {
    const out = serializeSpriteMappings(frames);
    expect(hex(out.subarray(0x22, 0x22 + 14))).toBe('fc 04 fc 04 00 01 ff fc 00 00 00 00 ff fc');
  });
  it('encodes flip + palette + priority bits in tile_attrs', () => {
    const out = serializeSpriteMappings([
      { id: 'x', pieces: [piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 1, palette: 2, priority: true, xFlip: true, yFlip: true })] },
    ]);
    // attrs = (1<<15)|(2<<13)|(1<<12)|(1<<11)|1 = 0xD801.
    // 1-frame mapping: table=2, header=6, piece+4 => tile_attrs at byte 12.
    expect(hex(out.subarray(12, 14))).toBe('d8 01');
  });
});

describe('serializeSpriteMappings (structural invariants)', () => {
  it('offset table entries point at valid frame starts and total length is exact', () => {
    const frames: SpriteFrame[] = [
      { id: 'a', pieces: [piece({ widthCells: 2, heightCells: 2 }), piece({ xOffset: 16, widthCells: 1, heightCells: 1 })] },
      { id: 'b', pieces: [piece({ widthCells: 1, heightCells: 1 })] },
    ];
    const out = serializeSpriteMappings(frames);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const off0 = dv.getUint16(0, false);
    const off1 = dv.getUint16(2, false);
    expect(off0).toBe(4);
    expect(off1).toBe(4 + (6 + 2 * 8));
    expect(out.length).toBe(off1 + (6 + 1 * 8));
    expect(dv.getUint16(off0 + 4, false)).toBe(2);
    expect(dv.getUint16(off1 + 4, false)).toBe(1);
  });
});
