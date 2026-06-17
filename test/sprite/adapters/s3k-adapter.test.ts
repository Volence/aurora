import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { s3kAdapter } from '../../../src/core/formats/games/s3k';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));
const map = fx('s3k_obj0B_map.bin');
const dplc = fx('s3k_obj08_dplc.bin');

describe('s3k adapter — vs real assembled Ver 3 fixture', () => {
  const frames = s3kAdapter.readMappings(map);

  it('recovers all 5 frames (6-byte pieces, no 2P word)', () => {
    expect(frames).toHaveLength(5);
    expect(frames[0].pieces).toHaveLength(2);
  });

  it('reads piece fields', () => {
    expect(frames[0].pieces[0]).toEqual({
      xOffset: -16, yOffset: -16, widthCells: 4, heightCells: 1,
      tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
  });

  it('writeMappings reproduces the real fixture byte-for-byte', () => {
    expect(Array.from(s3kAdapter.writeMappings(frames))).toEqual(Array.from(map));
  });
});

describe('s3k adapter — reads real Sonic Clean Engine (S.C.E.) mappings', () => {
  // S.C.E. is S3K-based: its sprite mappings use the Ver-3 6-byte piece layout.
  // Assembled verbatim from S.C.E. "Map - Insta-Shield.asm" (pure dc.b/dc.w).
  const frames = s3kAdapter.readMappings(fx('sce_instashield_map.bin'));

  it('decodes the real S.C.E. table (8 frames, Ver-3 pieces)', () => {
    expect(frames).toHaveLength(8);
    expect(frames[0].pieces).toHaveLength(3);
    expect(frames[0].pieces[0]).toEqual({
      xOffset: -16, yOffset: -24, widthCells: 3, heightCells: 1,
      tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
  });

  it('round-trips real S.C.E. mappings byte-for-byte', () => {
    expect(Array.from(s3kAdapter.writeMappings(frames))).toEqual(Array.from(fx('sce_instashield_map.bin')));
  });
});

describe('s3k adapter — DPLC reversed packing + count-1 header', () => {
  const perFrame = s3kAdapter.readDPLC!(dplc);

  it('reads expanded source-tile lists despite the reversed entry packing', () => {
    expect(perFrame[0]).toEqual([]);
    expect(perFrame[1]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(perFrame[2]).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
  });

  it('writeDPLC packs entries reversed and stores count-1, matching the real game', () => {
    // Real fixture: frame 1 entry = 0x0007 = (0<<4)|(8-1); count word = 0x0000 (count-1).
    const out = s3kAdapter.writeDPLC!([[0, 1, 2, 3, 4, 5, 6, 7]]);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const off = dv.getUint16(0, false);
    expect(dv.getUint16(off, false)).toBe(0x0000);     // count-1 = 0 for 1 entry
    expect(dv.getUint16(off + 2, false)).toBe(0x0007);

    // offset 8, 16 tiles → (8<<4)|(16-1) = 0x008f.
    const out2 = s3kAdapter.writeDPLC!([Array.from({ length: 16 }, (_, i) => 8 + i)]);
    const dv2 = new DataView(out2.buffer, out2.byteOffset, out2.byteLength);
    expect(dv2.getUint16(dv2.getUint16(0, false) + 2, false)).toBe(0x008f);
  });

  it('an empty frame writes a 0xffff count-1 header', () => {
    const out = s3kAdapter.writeDPLC!([[]]);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(dv.getUint16(dv.getUint16(0, false), false)).toBe(0xffff);
  });

  it('round-trips semantically', () => {
    expect(s3kAdapter.readDPLC!(s3kAdapter.writeDPLC!(perFrame))).toEqual(perFrame);
  });
});

describe('s3k adapter — vs REAL skdisasm DPLC data (closes the bit-order risk)', () => {
  // Assembled verbatim from skdisasm "DPLC - Miniboss Splash.asm" (literal dc.w,
  // no macros) — independent ground truth for the reversed Ver-3 entry packing.
  const real = s3kAdapter.readDPLC!(fx('s3k_real_dplc_minibosssplash.bin'));

  it('decodes the real reversed entries (0x0005→6 tiles@0, 0x006F→16 tiles@6)', () => {
    expect(real).toHaveLength(9);
    expect(real[0]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(real[1]).toEqual(Array.from({ length: 16 }, (_, i) => 6 + i));
    expect(real[5]).toEqual(Array.from({ length: 12 }, (_, i) => 0x46 + i)); // 0x046B → 12 tiles@0x46
  });

  it('round-trips real S3K data semantically', () => {
    expect(s3kAdapter.readDPLC!(s3kAdapter.writeDPLC!(real))).toEqual(real);
  });
});
