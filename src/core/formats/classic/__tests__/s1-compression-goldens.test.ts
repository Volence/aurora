import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { kosinskiCompress, kosinskiDecompress } from '../../kosinski';
import { nemesisCompress, nemesisDecompress } from '../../../compress/nemesis';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

/** Deterministic PRNG (mulberry32) so the round-trip vectors are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kosRoundTrips(raw: Uint8Array): void {
  const back = kosinskiDecompress(kosinskiCompress(raw));
  expect(Array.from(back)).toEqual(Array.from(raw));
}

function nemRoundTrips(raw: Uint8Array): void {
  const back = nemesisDecompress(nemesisCompress(raw));
  expect(Array.from(back)).toEqual(Array.from(raw));
}

/**
 * The golden suite below is skipIf-gated on s1disasm, so on CI (where that tree
 * is absent) these codecs would get zero coverage. Mirror the sibling
 * enigma.test.ts and pin an UNGUARDED set of small deterministic vectors that
 * always run: all-zeros, no-repeat, and seeded buffers with mixed runs /
 * repeats / literals. Nemesis requires input length divisible by 32 (one 4bpp
 * tile), so its vectors are shaped to whole 32-byte tiles.
 */
describe('kosinski round-trip vectors (CI-safe, no fixtures)', () => {
  it('empty buffer', () => kosRoundTrips(new Uint8Array(0)));

  it('all-zeros buffer (max run length)', () => kosRoundTrips(new Uint8Array(1024)));

  it('no-repeat ramp (defeats the LZ matcher)', () => {
    const buf = new Uint8Array(512);
    for (let i = 0; i < buf.length; i++) buf[i] = i & 0xff;
    kosRoundTrips(buf);
  });

  it('seeded buffers with mixed runs / repeats / literals', () => {
    const rand = mulberry32(0x50127);
    for (let trial = 0; trial < 50; trial++) {
      const len = 64 + Math.floor(rand() * 512);
      const buf = new Uint8Array(len);
      let i = 0;
      while (i < len) {
        const roll = rand();
        if (roll < 0.4) {
          // run of a repeated byte
          const run = 1 + Math.floor(rand() * 20);
          const val = Math.floor(rand() * 256);
          for (let k = 0; k < run && i < len; k++) buf[i++] = val;
        } else {
          // literal
          buf[i++] = Math.floor(rand() * 256);
        }
      }
      kosRoundTrips(buf);
    }
  });
});

describe('nemesis round-trip vectors (CI-safe, no fixtures)', () => {
  it('all-zeros tiles (max run length)', () => nemRoundTrips(new Uint8Array(32 * 8)));

  it('no-repeat nibbles across a tile', () => {
    const buf = new Uint8Array(32 * 4);
    for (let i = 0; i < buf.length; i++) buf[i] = ((i & 0x0f) << 4) | ((i + 1) & 0x0f);
    nemRoundTrips(buf);
  });

  it('seeded whole-tile buffers with mixed runs / repeats / literals', () => {
    const rand = mulberry32(0xC0DEC);
    for (let trial = 0; trial < 50; trial++) {
      const tiles = 1 + Math.floor(rand() * 8);
      const buf = new Uint8Array(tiles * 32);
      let i = 0;
      while (i < buf.length) {
        const roll = rand();
        if (roll < 0.4) {
          const run = 1 + Math.floor(rand() * 16);
          const val = Math.floor(rand() * 256);
          for (let k = 0; k < run && i < buf.length; k++) buf[i++] = val;
        } else {
          buf[i++] = Math.floor(rand() * 256);
        }
      }
      nemRoundTrips(buf);
    }
  });
});

/**
 * Aurora's Kosinski and Nemesis codecs were previously exercised only on Sonic 4
 * and synthetic data. Before the disasm-project work builds S1 level loading on
 * them, prove they survive real Sonic 1 data: every map256 chunk table and every
 * 8x8 art bank decodes to a sanely-sized buffer and round-trips byte-for-byte.
 */
describe.skipIf(!fs.existsSync(S1DIR))('kosinski/nemesis goldens over real s1disasm data', () => {
  const map256Dir = `${S1DIR}/map256`;
  const kosFiles = fs.existsSync(map256Dir)
    ? fs.readdirSync(map256Dir).filter((f) => f.toLowerCase().endsWith('.kos'))
    : [];

  const artnemDir = `${S1DIR}/artnem`;
  const nemFiles = fs.existsSync(artnemDir)
    ? fs.readdirSync(artnemDir).filter((f) => f.toLowerCase().startsWith('8x8 - ') && f.toLowerCase().endsWith('.nem'))
    : [];

  it('map256/*.kos decompresses, is chunk-aligned, and round-trips', () => {
    expect(kosFiles.length).toBeGreaterThan(0);
    for (const file of kosFiles) {
      const compressed = new Uint8Array(fs.readFileSync(`${map256Dir}/${file}`));
      const decoded = kosinskiDecompress(compressed);
      // Each 256x256 chunk = 16x16 block words * 2 bytes = 512 bytes.
      expect(decoded.length, `empty decode for ${file}`).toBeGreaterThan(0);
      expect(decoded.length % 512, `not chunk-aligned for ${file}`).toBe(0);
      const back = kosinskiDecompress(kosinskiCompress(decoded));
      expect(Array.from(back), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });

  it('artnem/8x8 - *.nem decompresses, is tile-aligned, and round-trips', () => {
    expect(nemFiles.length).toBeGreaterThan(0);
    for (const file of nemFiles) {
      const compressed = new Uint8Array(fs.readFileSync(`${artnemDir}/${file}`));
      const decoded = nemesisDecompress(compressed);
      // One 4bpp 8x8 tile = 32 bytes.
      expect(decoded.length, `empty decode for ${file}`).toBeGreaterThan(0);
      expect(decoded.length % 32, `not tile-aligned for ${file}`).toBe(0);
      const back = nemesisDecompress(nemesisCompress(decoded));
      expect(Array.from(back), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });
});
