import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { enigmaCompress, enigmaDecompress } from '../enigma';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../../test/support/fixture-tree';
import { whenS1Glob } from '../../../../../test/support/s1-checkout';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);

/** Deterministic PRNG (mulberry32) so the round-trip property is reproducible. */
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

function roundTrips(raw: Uint8Array): void {
  const back = enigmaDecompress(enigmaCompress(raw));
  expect(Array.from(back)).toEqual(Array.from(raw));
}

describe('enigma round-trip property', () => {
  it('empty buffer', () => roundTrips(new Uint8Array(0)));

  it('random even-length buffers (seeded)', () => {
    const rand = mulberry32(0xC0FFEE);
    for (let trial = 0; trial < 200; trial++) {
      const words = Math.floor(rand() * 64); // 0..63 words
      const buf = new Uint8Array(words * 2);
      for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(rand() * 256);
      roundTrips(buf);
    }
  });

  it('rejects odd-length input', () => {
    expect(() => enigmaCompress(new Uint8Array(3))).toThrow();
  });
});

/**
 * Hand-built Enigma streams that exercise decoder actions 0–4. The property tests
 * above only cover action 5 (the encoder's only output), so without these the
 * copy/inline paths have zero coverage when s1disasm is absent (CI). Each stream
 * is a 6-byte header + a bitstream written MSB-first, one bit per character.
 *
 * Header layout: [totalInlineBits, renderFlagsMask, incBE16 hi, lo, litBE16 hi, lo].
 * We use renderFlagsMask=0 so an inline value is just its low `totalInlineBits`
 * bits (here 11) — top 5 bits are always zero, keeping the vectors readable.
 */
function streamFromBits(header: number[], bitStr: string): Uint8Array {
  const bits = bitStr.replace(/[^01]/g, '');
  const bytes = [...header];
  let cur = 0;
  let n = 0;
  for (const ch of bits) {
    cur = (cur << 1) | (ch === '1' ? 1 : 0);
    if (++n === 8) { bytes.push(cur); cur = 0; n = 0; }
  }
  if (n > 0) bytes.push((cur << (8 - n)) & 0xff);
  return new Uint8Array(bytes);
}

function words(u8: Uint8Array): number[] {
  const w: number[] = [];
  for (let i = 0; i < u8.length; i += 2) w.push((u8[i] << 8) | u8[i + 1]);
  return w;
}

// Action code = "0"+bit (0/1) or "1"+2bits (2/3/4/5); then a 4-bit count-1 field.
// Terminator = action 5 with count 16 = "111" + "1111".
const TERM = '1111111';

describe('enigma decoder byte vectors (CI-safe, no fixtures)', () => {
  it('action 0 — incremental copy (word++ from header inc-word)', () => {
    // header inc-word = 0x0100; action "00", count-1 = 2 (count 3).
    const stream = streamFromBits([11, 0, 0x01, 0x00, 0x00, 0x00], `00 0010 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0x0100, 0x0101, 0x0102]);
  });

  it('action 1 — literal copy (repeat header lit-word)', () => {
    // header lit-word = 0xABCD; action "01", count-1 = 1 (count 2).
    const stream = streamFromBits([11, 0, 0x00, 0x00, 0xab, 0xcd], `01 0001 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0xabcd, 0xabcd]);
  });

  it('action 2 — inline same (one value repeated)', () => {
    // action "1"+"00"; count-1 = 2 (count 3); inline 0x123 as 11 bits = 00100100011.
    const stream = streamFromBits([11, 0, 0, 0, 0, 0], `100 0010 00100100011 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0x123, 0x123, 0x123]);
  });

  it('action 3 — inline increment', () => {
    // action "1"+"01"; count-1 = 3 (count 4); inline 0x00F as 11 bits = 00000001111.
    const stream = streamFromBits([11, 0, 0, 0, 0, 0], `101 0011 00000001111 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0x000f, 0x0010, 0x0011, 0x0012]);
  });

  it('action 4 — inline decrement', () => {
    // action "1"+"10"; count-1 = 2 (count 3); inline 0x014 as 11 bits = 00000010100.
    const stream = streamFromBits([11, 0, 0, 0, 0, 0], `110 0010 00000010100 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0x0014, 0x0013, 0x0012]);
  });

  it('action 5 — raw copy of distinct inline values', () => {
    // action "1"+"11"; count-1 = 1 (count 2); two inline values 0x0AA, 0x055.
    const stream = streamFromBits([11, 0, 0, 0, 0, 0], `111 0001 00010101010 00001010101 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0x00aa, 0x0055]);
  });

  it('reconstructs render-flag bits (mask 0x1F, top 5 bits inline)', () => {
    // With mask 0x1F and 11 inline bits, an inline value carries all 16 bits:
    // 5 render-flag bits (top) then 11 tile bits. Value 0xF807 = 11111 00000000111.
    const stream = streamFromBits([11, 0x1f, 0, 0, 0, 0], `100 0000 11111 00000000111 ${TERM}`);
    expect(words(enigmaDecompress(stream))).toEqual([0xf807]);
  });
});

describe('enigma against s1disasm goldens', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
  const map16Dir = `${S1DIR}/map16`;
  const eniFiles = fs.existsSync(map16Dir)
    ? fs.readdirSync(map16Dir).filter((f) => f.toLowerCase().endsWith('.eni'))
    : [];

  it('decodes GHZ.eni to a non-empty block table (length divisible by 8)', { skip: !fs.existsSync(`${map16Dir}/GHZ.eni`), meta: { skipReason: `${map16Dir}/GHZ.eni is absent — this machine has no s1disasm checkout` } }, () => {
    const decoded = enigmaDecompress(new Uint8Array(fs.readFileSync(`${map16Dir}/GHZ.eni`)));
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.length % 8).toBe(0);
  });

  // Gated on its own glob, matching the GHZ.eni row above: `expect(eniFiles
  // .length).toBeGreaterThan(0)` reported a missing `map16/` as
  // `AssertionError: expected 0 to be greater than 0`, which names neither the
  // directory nor the checkout (2026-08-30 incomplete-checkout audit).
  it('re-encodes every map16 golden to an equivalent stream', whenS1Glob('map16', 'map16/*.eni', eniFiles), () => {
    for (const file of eniFiles) {
      const decoded = enigmaDecompress(new Uint8Array(fs.readFileSync(`${map16Dir}/${file}`)));
      const reDecoded = enigmaDecompress(enigmaCompress(decoded));
      expect(Array.from(reDecoded), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });
});
