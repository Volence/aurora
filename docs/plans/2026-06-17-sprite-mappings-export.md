# Sprite Mappings Export — Implementation Plan (v1, Plan 1 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure, byte-exact serializer that turns logical sprite frames (lists of
pieces) into the `s4_engine` S4 VDP-order mappings binary.

**Architecture:** Pure `src/core/` modules, zero UI. A logical `SpritePiece`/`SpriteFrame`
model, a flip-invariant bounding-box computer, and a serializer that emits the exact
offset-table + 6-byte-header + 8-byte-piece layout the engine's `Render_Sprites` consumes.
Verified against the worked example in `s4_engine/data/mappings/test_mappings.asm`.

**Tech Stack:** TypeScript, Vitest. No new dependencies. `DataView` for big-endian (68000)
byte output.

**Spec:** `docs/specs/2026-06-16-sprite-mode-design.md` §2.1, §4, §6. This plan implements
the serializer half of §8 (`generateMappingsBin`). Decomposition (bitmap→pieces), animation
`.asm`, art blob, the shared-core refactor, the Sprite-mode UI, and object previews are
Plans 2–6.

**Roadmap (context, not this plan):** Plan 2 = auto-decomposition + art blob; Plan 3 =
animation `.asm` export; Plan 4 = shared art-core extraction; Plan 5 = Sprite-mode UI; Plan 6
= object previews.

---

## File Structure

- `src/core/model/sprite-types.ts` (new) — logical sprite model + `sizeCode` helper. One
  responsibility: the data shapes + the size-byte encoding.
- `src/core/export/sprite-mappings-export.ts` (new) — `computeFrameBbox` + `serializeSpriteMappings`.
  One responsibility: pieces → S4 mappings bytes.
- `test/sprite/sprite-types.test.ts` (new) — `sizeCode` table.
- `test/sprite/sprite-mappings-export.test.ts` (new) — bbox rules + byte-exact serialization
  asserted against `test_mappings.asm`.

---

## Task 1: Sprite model + size-byte encoding

**Files:**
- Create: `src/core/model/sprite-types.ts`
- Test: `test/sprite/sprite-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/sprite/sprite-types.test.ts
import { describe, it, expect } from 'vitest';
import { sizeCode } from '../../src/core/model/sprite-types';

describe('sizeCode', () => {
  // Verified against s4_engine macros.asm: sprSize w,h = ((((w)-1)<<2)|((h)-1))<<8
  // size byte = sprSize(w,h) >> 8. bits 3-2 = WIDTH-1, bits 1-0 = HEIGHT-1.
  it('encodes width in bits 3-2 and height in bits 1-0', () => {
    expect(sizeCode(1, 1)).toBe(0x00);
    expect(sizeCode(2, 2)).toBe(0x05);
    expect(sizeCode(4, 1)).toBe(0x0c);
    expect(sizeCode(1, 4)).toBe(0x03);
    expect(sizeCode(4, 4)).toBe(0x0f);
    expect(sizeCode(3, 2)).toBe(0x09); // ((3-1)<<2)|(2-1) = 8|1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-types.test.ts`
Expected: FAIL — `Failed to resolve import ... sprite-types` / `sizeCode is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/model/sprite-types.ts

/**
 * One hardware sprite piece, in LOGICAL (authoring) form: offsets are the
 * UNFLIPPED top-left corner relative to the object origin; flips are bits only
 * (the engine recomputes flipped corners at render time). Tile index is relative
 * to the object's art_tile base, never absolute VRAM.
 * See docs/specs/2026-06-16-sprite-mode-design.md §2.1.
 */
export interface SpritePiece {
  xOffset: number;      // signed, unflipped top-left
  yOffset: number;      // signed, unflipped top-left
  widthCells: number;   // 1..4 (cells; 1 cell = 8px)
  heightCells: number;  // 1..4
  tile: number;         // 0..0x7FF, relative to art base
  palette: number;      // 0..3
  priority: boolean;
  xFlip: boolean;
  yFlip: boolean;
}

export interface SpriteFrame {
  id: string;
  pieces: SpritePiece[];
}

/**
 * VDP size byte = ((widthCells-1)<<2) | (heightCells-1).
 * bits 3-2 = WIDTH-1, bits 1-0 = HEIGHT-1. (s4_engine macros.asm `sprSize`.)
 */
export function sizeCode(widthCells: number, heightCells: number): number {
  return (((widthCells - 1) & 3) << 2) | ((heightCells - 1) & 3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-types.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/model/sprite-types.ts test/sprite/sprite-types.test.ts
git commit -m "feat(sprite): logical sprite model + VDP size-byte encoding"
```

---

## Task 2: Flip-invariant bounding box

**Files:**
- Create: `src/core/export/sprite-mappings-export.ts`
- Test: `test/sprite/sprite-mappings-export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/sprite/sprite-mappings-export.test.ts
import { describe, it, expect } from 'vitest';
import { computeFrameBbox } from '../../src/core/export/sprite-mappings-export';
import type { SpritePiece } from '../../src/core/model/sprite-types';

function piece(p: Partial<SpritePiece>): SpritePiece {
  return {
    xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0,
    palette: 0, priority: false, xFlip: false, yFlip: false, ...p,
  };
}

describe('computeFrameBbox', () => {
  it('is exact for a symmetric frame (matches test_mappings F0)', () => {
    // one 2x2 (16px) piece at (-8,-8): far edges (8,8); already symmetric.
    const bbox = computeFrameBbox([piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2 })]);
    expect(bbox).toEqual({ xMin: -8, xMax: 8, yMin: -8, yMax: 8 });
  });

  it('symmetrizes an asymmetric frame so one box covers all 4 flips', () => {
    // piece at x 0..8 (1 cell). raw x = (0, 8); symmetrized to (-8, 8).
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
    // raw x: min(-16, 8) = -16 ; max(-16+8=-8, 8+16=24) = 24
    // symmetrized: xMin = min(-16,-24) = -24 ; xMax = max(24,16) = 24
    expect(bbox.xMin).toBe(-24);
    expect(bbox.xMax).toBe(24);
  });

  it('hard-fails when an extent exceeds signed byte range', () => {
    expect(() => computeFrameBbox([piece({ xOffset: 120, widthCells: 4, heightCells: 1 })]))
      .toThrow(/signed byte/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-mappings-export.test.ts`
Expected: FAIL — cannot resolve `sprite-mappings-export` / `computeFrameBbox` undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/export/sprite-mappings-export.ts
import type { SpriteFrame, SpritePiece } from '../model/sprite-types';
import { sizeCode } from '../model/sprite-types';

export interface FrameBbox { xMin: number; xMax: number; yMin: number; yMax: number; }

/**
 * Flip-invariant bbox over a frame's pieces. Far edges = offset + cells*8.
 * Union, then symmetrize so one box is valid for all 4 flip states (exact for
 * symmetric frames, conservative otherwise). Hard-fails outside signed byte.
 * Mirrors s4_engine tools/convert_s2_mappings.py `_compute_bbox`.
 */
export function computeFrameBbox(pieces: SpritePiece[]): FrameBbox {
  if (pieces.length === 0) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 };
  let xMin = 127, xMax = -128, yMin = 127, yMax = -128;
  for (const p of pieces) {
    const wpx = p.widthCells * 8;
    const hpx = p.heightCells * 8;
    if (p.xOffset < xMin) xMin = p.xOffset;
    if (p.xOffset + wpx > xMax) xMax = p.xOffset + wpx;
    if (p.yOffset < yMin) yMin = p.yOffset;
    if (p.yOffset + hpx > yMax) yMax = p.yOffset + hpx;
  }
  const sxMin = Math.min(xMin, -xMax);
  const sxMax = Math.max(xMax, -xMin);
  const syMin = Math.min(yMin, -yMax);
  const syMax = Math.max(yMax, -yMin);
  for (const [name, v] of [['x_min', sxMin], ['x_max', sxMax], ['y_min', syMin], ['y_max', syMax]] as const) {
    if (v < -128 || v > 127) {
      throw new Error(`Frame bbox ${name}=${v} exceeds signed byte range [-128,127]`);
    }
  }
  return { xMin: sxMin, xMax: sxMax, yMin: syMin, yMax: syMax };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-mappings-export.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/export/sprite-mappings-export.ts test/sprite/sprite-mappings-export.test.ts
git commit -m "feat(sprite): flip-invariant frame bounding box"
```

---

## Task 3: Serialize mappings to S4 binary (byte-exact)

**Files:**
- Modify: `src/core/export/sprite-mappings-export.ts` (add `serializeSpriteMappings` + `tileAttrs`)
- Test: `test/sprite/sprite-mappings-export.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

This asserts byte-for-byte against the worked example in
`s4_engine/data/mappings/test_mappings.asm` (frames F0/F1/F2). Append to the test file:

```ts
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import type { SpriteFrame } from '../../src/core/model/sprite-types';

const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ');

describe('serializeSpriteMappings (vs test_mappings.asm)', () => {
  const frames: SpriteFrame[] = [
    // F0: bbox -8,8,-8,8 ; 1 piece 2x2 at (-8,-8), tile 0
    { id: 'f0', pieces: [piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0 })] },
    // F1: same but tile 4
    { id: 'f1', pieces: [piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 4 })] },
    // F2: bbox -4,4,-4,4 ; 1 piece 1x1 at (-4,-4), tile 0
    { id: 'f2', pieces: [piece({ xOffset: -4, yOffset: -4, widthCells: 1, heightCells: 1, tile: 0 })] },
  ];

  it('emits the offset table then frame blocks', () => {
    const out = serializeSpriteMappings(frames);
    // 3-frame offset table = 6 bytes. F0 block = 6+8 = 14. F1 at 6+14=0x14. F2 at 0x22.
    expect(hex(out.subarray(0, 6))).toBe('00 06 00 14 00 22');
  });

  it('emits F0 block exactly (header + 8-byte piece)', () => {
    const out = serializeSpriteMappings(frames);
    // header: F8 08 F8 08  count: 00 01
    // piece: y=-8 (FF F8), size $05, link 00, attrs 0000, x=-8 (FF F8)
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
    // attrs = (1<<15)|(2<<13)|(1<<12)|(1<<11)|1 = 0x8000|0x4000|0x1000|0x0800|1 = 0xD801
    // 1-frame mapping: table=2, header=6, piece+4 ⇒ tile_attrs at byte 2+6+4 = 12.
    expect(hex(out.subarray(12, 14))).toBe('d8 01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-mappings-export.test.ts`
Expected: FAIL — `serializeSpriteMappings` is not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/export/sprite-mappings-export.ts`:

```ts
function tileAttrs(p: SpritePiece): number {
  return (
    ((p.priority ? 1 : 0) << 15) |
    ((p.palette & 3) << 13) |
    ((p.yFlip ? 1 : 0) << 12) |
    ((p.xFlip ? 1 : 0) << 11) |
    (p.tile & 0x7ff)
  ) & 0xffff;
}

function serializeFrameBlock(frame: SpriteFrame): Uint8Array {
  const bbox = computeFrameBbox(frame.pieces);
  const out = new Uint8Array(6 + frame.pieces.length * 8);
  const dv = new DataView(out.buffer);
  dv.setInt8(0, bbox.xMin);
  dv.setInt8(1, bbox.xMax);
  dv.setInt8(2, bbox.yMin);
  dv.setInt8(3, bbox.yMax);
  dv.setUint16(4, frame.pieces.length, false); // big-endian
  let o = 6;
  for (const p of frame.pieces) {
    dv.setInt16(o, p.yOffset, false); o += 2;
    out[o++] = sizeCode(p.widthCells, p.heightCells);
    out[o++] = 0; // VDP link byte placeholder (engine fills at runtime)
    dv.setUint16(o, tileAttrs(p), false); o += 2;
    dv.setInt16(o, p.xOffset, false); o += 2;
  }
  return out;
}

/**
 * Serialize frames to the S4 VDP-order mappings binary:
 * word offset table (one per frame, offset from table start) + frame blocks.
 * See docs/specs/2026-06-16-sprite-mode-design.md §2.1.
 */
export function serializeSpriteMappings(frames: SpriteFrame[]): Uint8Array {
  const tableSize = frames.length * 2;
  const blocks = frames.map(serializeFrameBlock);
  const total = tableSize + blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let off = tableSize;
  frames.forEach((_, i) => {
    dv.setUint16(i * 2, off, false); // big-endian offset from table start
    out.set(blocks[i], off);
    off += blocks[i].length;
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-mappings-export.test.ts`
Expected: PASS (all bbox + serialization assertions).

- [ ] **Step 5: Commit**

```bash
git add src/core/export/sprite-mappings-export.ts test/sprite/sprite-mappings-export.test.ts
git commit -m "feat(sprite): byte-exact S4 mappings serializer (verified vs test_mappings.asm)"
```

---

## Task 4: Full-suite regression + cross-check helper

**Files:**
- Test: `test/sprite/sprite-mappings-export.test.ts` (add a round-trip-shape guard)

- [ ] **Step 1: Write the failing test**

Append a guard that the total length and per-frame offsets are internally consistent for an
arbitrary multi-piece frame (catches offset-table drift if block sizes change later):

```ts
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
    expect(off0).toBe(4);                       // 2-frame table = 4 bytes
    expect(off1).toBe(4 + (6 + 2 * 8));         // after frame a (2 pieces)
    expect(out.length).toBe(off1 + (6 + 1 * 8)); // after frame b (1 piece)
    // each offset begins a frame: piece_count word matches what we passed
    expect(dv.getUint16(off0 + 4, false)).toBe(2);
    expect(dv.getUint16(off1 + 4, false)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npx vitest run test/sprite/sprite-mappings-export.test.ts`
Expected: PASS (implementation from Task 3 already satisfies it — this is a regression guard).
If it FAILS, the offset math in `serializeSpriteMappings` is wrong; fix before continuing.

- [ ] **Step 3: Run the whole suite to confirm no regressions**

Run: `npm test`
Expected: all existing tests still pass, plus the new `test/sprite/*` files. Confirm the
summary shows the new tests included and 0 failures.

- [ ] **Step 4: Commit**

```bash
git add test/sprite/sprite-mappings-export.test.ts
git commit -m "test(sprite): offset-table structural invariants for mappings serializer"
```

---

## Done criteria

- `serializeSpriteMappings` emits bytes identical to `test_mappings.asm` for F0/F1/F2.
- `computeFrameBbox` matches `_compute_bbox` (symmetrized, hard-fail on overflow).
- `sizeCode` matches `sprSize` (width in bits 3-2).
- `npm test` green, including the new `test/sprite/` files, with no regressions.

Next: Plan 2 (auto-decomposition: frame bitmap → pieces + contiguous column-major art blocks,
reusing `canonicalizeTile`/`serializeTiles`), which produces the `SpriteFrame[]` this plan
serializes.
