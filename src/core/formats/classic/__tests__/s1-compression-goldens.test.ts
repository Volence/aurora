import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { kosinskiCompress, kosinskiDecompress } from '../../kosinski';
import { referencePath } from '../../../../../test/support/fixture-tree';
import {
  nemesisCompress, nemesisDecompress, nemesisCompressPlainForTest,
} from '../../../compress/nemesis';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;

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

  // --- XOR mode ------------------------------------------------------------
  //
  // Nemesis has two modes; bit 15 of the header picks one. In XOR mode each
  // decoded row is XORed with the row before it, so vertically coherent art —
  // which is nearly all tile art — encodes as long runs of zero instead of a
  // fresh symbol per nibble. ALL SEVEN stock Sonic 1 zone art files are XOR
  // mode. Aurora emitted plain mode only, which made every re-encode ~2.5x
  // LARGER than the original and, for varied art, larger than uncompressed:
  // once the symbol alphabet outgrows 8-bit codes the encoder inlines the
  // rarest symbols at 13 bits each, against 4 bits raw.
  function vertBands(tiles: number): Uint8Array {
    // Rows that mostly repeat the row above — a band of colour with an
    // occasional edge, i.e. what level art actually looks like.
    const out = new Uint8Array(tiles * 32);
    for (let t = 0; t < tiles; t++) {
      for (let row = 0; row < 8; row++) {
        const v = ((t + (row >> 1)) & 0x0f);
        for (let b = 0; b < 4; b++) out[t * 32 + row * 4 + b] = (v << 4) | v;
      }
    }
    return out;
  }

  it('round-trips vertically coherent art', () => nemRoundTrips(vertBands(24)));

  it('picks XOR mode for vertically coherent art, and says so in the header', () => {
    const enc = nemesisCompress(vertBands(24));
    expect((enc[0] & 0x80) !== 0).toBe(true);
  });

  // THE GUARANTEE. The encoder tries both modes and keeps the smaller, so it can
  // never be worse than the plain-only encoder it replaces — whatever the art.
  it('is never larger than a plain-mode encoding, for any of these inputs', () => {
    const cases = [
      vertBands(24),
      new Uint8Array(32 * 8),
      new Uint8Array(32 * 8).map((_, i) => (i * 37) & 0xff),
      new Uint8Array(32 * 4).map((_, i) => (i & 1) ? 0xff : 0x00),
    ];
    for (const raw of cases) {
      const enc = nemesisCompress(raw);
      const plain = nemesisCompressPlainForTest(raw);
      expect(enc.length, 'chosen encoding is larger than plain').toBeLessThanOrEqual(plain.length);
      expect(Array.from(nemesisDecompress(enc))).toEqual(Array.from(raw));
    }
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
describe('kosinski/nemesis goldens over real s1disasm data', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
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

  // SIZE, not just correctness. Round-tripping says nothing about how big the
  // result is, and Aurora's plain-only encoder was inflating every zone's art
  // ~2.5x on every save — +100,851 bytes across the seven files, measured. That
  // matters beyond tidiness: the disassembly's SegaPCM sample sits at exactly
  // zero slack against an `align $8000` bank-boundary guard
  // (s1.sounddriver.asm), so growing the ROM at all can relocate it and jump
  // the build by up to 32KB.
  //
  // The bound is pinned just above MEASURED cost, not at a comfortable round
  // number: the seven stock files re-encode at 1.02x-1.05x, so 1.10 leaves room
  // for art this repo does not contain while still failing loudly on a real
  // regression. Before this work they came in at 2.1x-3.0x — and an earlier
  // draft of this very test used 1.35, which a 2.16x regression still failed
  // but a subtler one would have sailed through.
  it('artnem/8x8 - *.nem re-encodes without inflating the file', () => {
    expect(nemFiles.length).toBeGreaterThan(0);
    for (const file of nemFiles) {
      const compressed = new Uint8Array(fs.readFileSync(`${artnemDir}/${file}`));
      const decoded = nemesisDecompress(compressed);
      const re = nemesisCompress(decoded);
      expect(re.length / compressed.length, `${file} inflated`).toBeLessThan(1.10);
      // And never worse than storing the tiles uncompressed.
      expect(re.length, `${file} bigger than raw`).toBeLessThan(decoded.length);
    }
  });
});
