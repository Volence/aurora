# Nemesis Decode — Implementation Plan (multi-game, Plan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD: failing test → see it fail → minimal impl → see it pass → commit.

**Goal:** A pure-TypeScript Nemesis **decompressor** — the keystone that lets the editor read
Nemesis-compressed Sonic sprite/level art (S1/S2/S3K), verified against real Sega-compressed
fixtures.

**Architecture:** New `src/core/compress/nemesis.ts`. Faithful port of `programs/clownnemesis/
decompress.c`: parse the 2-byte header (XOR-mode flag + tile count), parse the code table
(`0x80|nibble` value markers + `(runLen-1)<<4|codeBits` code entries terminated by `0xFF`),
then decode the MSB-first bitstream (with the 6-bit `0x3F` inline escape) into nibble runs,
flushing 8 nibbles (one 4-byte row) at a time and XOR-ing against the previous row when
XOR-mode is set. No deps.

**Tech Stack:** TypeScript, Vitest. Reads binary fixtures via `fs`.

**Spec:** `docs/specs/2026-06-17-multi-game-sprite-roundtrip-design.md` §3. This plan covers
**decode only**; Nemesis encode (Fano path) and Kosinski encode are Plan 2; the format adapters
and UI are later plans.

**Fixtures (already committed in this plan, real Sega data):**
- `test/fixtures/nemesis/sample.nem` (plain mode, header `00 0A` = 10 tiles) + `sample.raw` (320 B, ground-truth decompressed)
- `test/fixtures/nemesis/xor.nem` (XOR mode, header `80 08` = 8 tiles) + `xor.raw` (256 B)
- `test/fixtures/nemesis/sample.acc.nem` (Sega-accurate recompress — used by Plan 2's encoder, not here)

---

## File Structure
- `src/core/compress/nemesis.ts` (new) — `nemesisHeader`, `nemesisDecompress`.
- `test/compress/nemesis.test.ts` (new) — decode vs the real fixtures (both modes) + header.

---

## Task 1: Nemesis decompressor

**Files:**
- Create: `src/core/compress/nemesis.ts`
- Create: `test/compress/nemesis.test.ts`
- Commit (existing, generated): `test/fixtures/nemesis/{sample.nem,sample.raw,xor.nem,xor.raw,sample.acc.nem}`

- [ ] **Step 1: Write the failing test**

```ts
// test/compress/nemesis.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nemesisHeader, nemesisDecompress } from '../../src/core/compress/nemesis';

const fx = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/nemesis/${name}`, import.meta.url)));

describe('nemesisHeader', () => {
  it('reads tile count + XOR flag (big-endian, bit15 = XOR)', () => {
    expect(nemesisHeader(fx('sample.nem'))).toEqual({ xorMode: false, tileCount: 10 });
    expect(nemesisHeader(fx('xor.nem'))).toEqual({ xorMode: true, tileCount: 8 });
  });
});

describe('nemesisDecompress', () => {
  it('decompresses a real plain-mode Sega .nem byte-for-byte', () => {
    const out = nemesisDecompress(fx('sample.nem'));
    expect(out.length).toBe(10 * 32);
    expect(Array.from(out)).toEqual(Array.from(fx('sample.raw')));
  });
  it('decompresses a real XOR-mode Sega .nem byte-for-byte', () => {
    const out = nemesisDecompress(fx('xor.nem'));
    expect(out.length).toBe(8 * 32);
    expect(Array.from(out)).toEqual(Array.from(fx('xor.raw')));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/compress/nemesis.test.ts`
Expected: FAIL — cannot resolve `../../src/core/compress/nemesis`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/compress/nemesis.ts

export interface NemesisHeader {
  xorMode: boolean;
  tileCount: number;
}

/** Parse the 2-byte big-endian Nemesis header: bit15 = XOR mode, bits14-0 = tile count. */
export function nemesisHeader(input: Uint8Array): NemesisHeader {
  const word = ((input[0] ?? 0) << 8) | (input[1] ?? 0);
  return { xorMode: (word & 0x8000) !== 0, tileCount: word & 0x7fff };
}

/**
 * Decompress Nemesis-compressed art to raw 4bpp tile bytes (tileCount * 32 bytes).
 * Faithful port of clownnemesis/decompress.c. See spec §3.
 */
export function nemesisDecompress(input: Uint8Array): Uint8Array {
  let pos = 0;
  const readByte = (): number => (pos < input.length ? input[pos++] : 0);

  const word = (readByte() << 8) | readByte();
  const xorMode = (word & 0x8000) !== 0;
  const tileCount = word & 0x7fff;

  // Code table: indexed by `code << (8 - codeBits)`; -1 value = empty slot.
  const tValue = new Int16Array(256).fill(-1);
  const tLength = new Uint8Array(256);
  const tBits = new Uint8Array(256);
  let nybbleValue = 0;
  let b = readByte();
  while (b !== 0xff) {
    if ((b & 0x80) !== 0) { nybbleValue = b & 0x0f; b = readByte(); continue; }
    const runLength = ((b >> 4) & 7) + 1;
    const codeBits = b & 0x0f;
    const code = readByte();
    const idx = (code << (8 - codeBits)) & 0xff;
    tValue[idx] = nybbleValue;
    tLength[idx] = runLength;
    tBits[idx] = codeBits;
    b = readByte();
  }

  // Bitstream — MSB-first, matching clownnemesis PopBit exactly.
  let bitBuffer = 0;
  let bitsAvailable = 0;
  const popBit = (): number => {
    bitBuffer = (bitBuffer << 1) & 0xff;
    if (bitsAvailable === 0) { bitsAvailable = 8; bitBuffer = readByte(); }
    bitsAvailable--;
    return (bitBuffer & 0x80) !== 0 ? 1 : 0;
  };
  const popBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | popBit();
    return v;
  };

  const out = new Uint8Array(tileCount * 32);
  let outPos = 0;
  let rowBuffer = 0;       // 32-bit nibble accumulator (kept unsigned via >>> 0)
  let nybblesDone = 0;
  let prevRow = 0;
  const outputNybble = (nyb: number): void => {
    rowBuffer = ((rowBuffer << 4) | nyb) >>> 0;
    if ((++nybblesDone & 7) === 0) {
      const finalRow = (rowBuffer ^ (xorMode ? prevRow : 0)) >>> 0;
      out[outPos++] = (finalRow >>> 24) & 0xff;
      out[outPos++] = (finalRow >>> 16) & 0xff;
      out[outPos++] = (finalRow >>> 8) & 0xff;
      out[outPos++] = finalRow & 0xff;
      prevRow = finalRow;
    }
  };

  const totalNybbles = tileCount * 64;
  let produced = 0;
  while (produced < totalNybbles) {
    // FindCode: read bits MSB-first until a table entry matches or the 0x3F inline escape.
    let code = 0;
    let bits = 0;
    let matchIdx = -1;
    let inline = false;
    for (;;) {
      if (bits === 8) break; // malformed data guard (no match found)
      code = ((code << 1) | popBit()) & 0xff;
      bits++;
      if (bits === 6 && code === 0x3f) { inline = true; break; }
      const idx = (code << (8 - bits)) & 0xff;
      if (tValue[idx] >= 0 && tBits[idx] === bits) { matchIdx = idx; break; }
    }
    let value: number;
    let runLength: number;
    if (inline) { runLength = popBits(3) + 1; value = popBits(4); }
    else if (matchIdx >= 0) { value = tValue[matchIdx]; runLength = tLength[matchIdx]; }
    else break; // malformed — stop rather than loop forever
    for (let i = 0; i < runLength && produced < totalNybbles; i++) { outputNybble(value); produced++; }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/compress/nemesis.test.ts`
Expected: PASS — both fixtures decode byte-for-byte; header reads correctly.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: all existing tests still pass + the 3 new ones.

- [ ] **Step 6: Commit (impl + tests + fixtures)**

```bash
git add src/core/compress/nemesis.ts test/compress/nemesis.test.ts test/fixtures/nemesis/
git commit -m "feat(compress): Nemesis decompressor (verified vs real Sega .nem fixtures)"
```

---

## Done criteria
- `nemesisDecompress` reproduces the `.raw` ground truth for both a plain-mode and an
  XOR-mode real Sega `.nem`, byte-for-byte.
- `nemesisHeader` reads tile count + XOR flag.
- `npm test` green.

Next: Plan 2 — Nemesis **encode** (Fano path, validated to match `sample.acc.nem` from
`nemdec -ca`) + Kosinski encode + the `compressionFor` registry.
