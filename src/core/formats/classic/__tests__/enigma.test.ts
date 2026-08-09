import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { enigmaCompress, enigmaDecompress } from '../enigma';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

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

describe.skipIf(!fs.existsSync(S1DIR))('enigma against s1disasm goldens', () => {
  const map16Dir = `${S1DIR}/map16`;
  const eniFiles = fs.existsSync(map16Dir)
    ? fs.readdirSync(map16Dir).filter((f) => f.toLowerCase().endsWith('.eni'))
    : [];

  it('decodes GHZ.eni to a non-empty block table (length divisible by 8)', () => {
    const decoded = enigmaDecompress(new Uint8Array(fs.readFileSync(`${map16Dir}/GHZ.eni`)));
    expect(decoded.length).toBeGreaterThan(0);
    expect(decoded.length % 8).toBe(0);
  });

  it('re-encodes every map16 golden byte-for-byte through a decode', () => {
    expect(eniFiles.length).toBeGreaterThan(0);
    for (const file of eniFiles) {
      const decoded = enigmaDecompress(new Uint8Array(fs.readFileSync(`${map16Dir}/${file}`)));
      const reDecoded = enigmaDecompress(enigmaCompress(decoded));
      expect(Array.from(reDecoded), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });
});
