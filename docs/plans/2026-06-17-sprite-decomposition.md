# Sprite Auto-Decomposition — Implementation Plan (v1, Plan 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Follow TDD: failing test → see it fail → minimal impl → see it pass → commit.

**Goal:** Turn a painted whole-frame bitmap (indexed pixels) into the engine's tile pool +
hardware sprite pieces, automatically — so the artist draws the sprite and never thinks about
tiles or pieces.

**Architecture:** Pure `src/core/art/sprite-decompose.ts`. Slice the frame into 8×8 tiles,
greedily pack non-empty tiles into rectangular pieces (≤4×4 cells, single palette line),
extract each piece's tiles in VDP column-major order, dedup identical whole blocks, and emit
`SpritePiece[]` (from Plan 1's `sprite-types.ts`) + a `Tile[]` art pool. `assembleSprite`
concatenates per-frame art and rebases piece tile indices, producing `{ art, frames }` where
`frames` feeds Plan 1's `serializeSpriteMappings` and `art` feeds the existing `serializeTiles`.

**Tech Stack:** TypeScript, Vitest. Reuses `Tile` from `src/core/model/s4-types.ts`,
`SpritePiece`/`SpriteFrame` from `src/core/model/sprite-types.ts`, and `serializeTiles` from
`src/core/export/tile-dedup.ts`.

**Spec:** `docs/specs/2026-06-16-sprite-mode-design.md` §6 (auto-decomposition). v1 = single
palette line per frame; flip-aware cross-piece dedup and optimal packing are deferred (§12 —
greedy first). Tiles within a piece are numbered VDP column-major (down each column, then
right). Each piece ≤ 4×4 cells.

---

## File Structure
- `src/core/art/sprite-decompose.ts` (new) — `RawFrame` type, `decomposeFrame`, `assembleSprite`.
- `test/sprite/sprite-decompose.test.ts` (new) — packing, column-major order, dedup, origin
  offsets, multi-frame assembly.

---

## Task 1: Tile extraction + emptiness grid

**Files:**
- Create: `src/core/art/sprite-decompose.ts`
- Test: `test/sprite/sprite-decompose.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/sprite/sprite-decompose.test.ts
import { describe, it, expect } from 'vitest';
import { extractTile, tileIsEmpty } from '../../src/core/art/sprite-decompose';

// 16x16 bitmap (2x2 tiles). Fill the top-left 8x8 tile with color 1, rest 0.
function bitmap16(): Uint8Array {
  const px = new Uint8Array(16 * 16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 16 + x] = 1;
  return px;
}

describe('extractTile', () => {
  it('extracts the 8x8 tile at a grid cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 0, 0);
    expect(t.pixels.length).toBe(64);
    expect(Array.from(t.pixels).every((v) => v === 1)).toBe(true);
  });
  it('returns transparent (0) for an empty cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 1, 1);
    expect(Array.from(t.pixels).every((v) => v === 0)).toBe(true);
  });
  it('pads out-of-bounds pixels with 0 (frame not a multiple of 8)', () => {
    // 4x4 bitmap, all color 2; tile 0,0 should have the 4x4 filled, rest 0.
    const px = new Uint8Array(4 * 4).fill(2);
    const t = extractTile(px, 4, 4, 0, 0);
    expect(t.pixels[0]).toBe(2);          // (0,0) in bounds
    expect(t.pixels[5 * 8 + 5]).toBe(0);  // (5,5) out of bounds → 0
  });
});

describe('tileIsEmpty', () => {
  it('is true for an all-zero tile and false otherwise', () => {
    expect(tileIsEmpty({ pixels: new Uint8Array(64) })).toBe(true);
    const t = new Uint8Array(64); t[10] = 3;
    expect(tileIsEmpty({ pixels: t })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: FAIL — cannot resolve `sprite-decompose`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/art/sprite-decompose.ts
import type { Tile } from '../model/s4-types';

export const CELL = 8; // px per tile cell

/** Extract the 8x8 tile at grid cell (gx,gy). Out-of-bounds pixels pad to 0 (transparent). */
export function extractTile(pixels: Uint8Array, width: number, height: number, gx: number, gy: number): Tile {
  const out = new Uint8Array(64);
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      const sx = gx * CELL + px;
      const sy = gy * CELL + py;
      out[py * CELL + px] = sx < width && sy < height ? pixels[sy * width + sx] : 0;
    }
  }
  return { pixels: out };
}

export function tileIsEmpty(tile: Tile): boolean {
  for (let i = 0; i < tile.pixels.length; i++) if (tile.pixels[i] !== 0) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/sprite-decompose.ts test/sprite/sprite-decompose.test.ts
git commit -m "feat(sprite): tile extraction + emptiness for decomposition"
```

---

## Task 2: decomposeFrame — greedy packing + column-major + dedup

**Files:**
- Modify: `src/core/art/sprite-decompose.ts`
- Test: `test/sprite/sprite-decompose.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { decomposeFrame } from '../../src/core/art/sprite-decompose';
import type { RawFrame } from '../../src/core/art/sprite-decompose';

function raw(over: Partial<RawFrame> & { pixels: Uint8Array; width: number; height: number }): RawFrame {
  return { id: 'f', originX: 0, originY: 0, palette: 0, priority: false, ...over };
}

describe('decomposeFrame', () => {
  it('packs a solid 16x16 frame into one 2x2 piece with 4 column-major tiles', () => {
    // distinct color per tile so we can verify column-major ordering:
    // grid (gx,gy): (0,0)=1 (1,0)=2 (0,1)=3 (1,1)=4
    const px = new Uint8Array(16 * 16);
    const set = (gx: number, gy: number, c: number) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * 16 + (gx * 8 + x)] = c;
    };
    set(0, 0, 1); set(1, 0, 2); set(0, 1, 3); set(1, 1, 4);
    const { tiles, pieces } = decomposeFrame(raw({ pixels: px, width: 16, height: 16, originX: 8, originY: 8 }));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0, palette: 0 });
    // VDP column-major: (0,0),(0,1),(1,0),(1,1) → colors 1,3,2,4
    expect(tiles.map((t) => t.pixels[0])).toEqual([1, 3, 2, 4]);
  });

  it('splits a 5-wide run into a 4-cell piece and a 1-cell piece (max 4 cells)', () => {
    const px = new Uint8Array((5 * 8) * 8).fill(1); // 40x8 all filled
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 40, height: 8 }));
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ widthCells: 4, heightCells: 1, xOffset: 0 });
    expect(pieces[1]).toMatchObject({ widthCells: 1, heightCells: 1, xOffset: 32 });
  });

  it('skips empty tiles (a gap produces two pieces)', () => {
    // 3 tiles wide, middle empty: [filled][empty][filled]
    const px = new Uint8Array((3 * 8) * 8);
    const fill = (gx: number) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 24 + (gx * 8 + x)] = 1; };
    fill(0); fill(2);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 24, height: 8 }));
    expect(pieces.map((p) => p.xOffset).sort((a, b) => a - b)).toEqual([0, 16]);
    expect(pieces.every((p) => p.widthCells === 1)).toBe(true);
  });

  it('dedups identical tile blocks, reusing the base tile index', () => {
    // two identical filled tiles separated by an empty tile → 2 pieces, 1 pooled tile
    const px = new Uint8Array((3 * 8) * 8);
    const fill = (gx: number) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 24 + (gx * 8 + x)] = 7; };
    fill(0); fill(2);
    const { tiles, pieces } = decomposeFrame(raw({ pixels: px, width: 24, height: 8 }));
    expect(tiles).toHaveLength(1);
    expect(pieces.every((p) => p.tile === 0)).toBe(true);
  });

  it('returns no pieces for a fully transparent frame', () => {
    const { tiles, pieces } = decomposeFrame(raw({ pixels: new Uint8Array(16 * 16), width: 16, height: 16 }));
    expect(pieces).toHaveLength(0);
    expect(tiles).toHaveLength(0);
  });

  it('carries palette and priority onto every piece', () => {
    const px = new Uint8Array(8 * 8).fill(1);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 8, height: 8, palette: 2, priority: true }));
    expect(pieces[0]).toMatchObject({ palette: 2, priority: true, xFlip: false, yFlip: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: FAIL — `decomposeFrame` / `RawFrame` not exported.

- [ ] **Step 3: Write minimal implementation (append to sprite-decompose.ts)**

```ts
import type { SpritePiece } from '../model/sprite-types';

/**
 * A painted whole-frame bitmap. v1: a single palette line for the whole frame.
 * origin = the object origin within the bitmap (px); piece offsets are computed
 * relative to it. width/height need not be multiples of 8 (padded transparent).
 */
export interface RawFrame {
  id: string;
  pixels: Uint8Array; // width*height, indices 0..15 (0 = transparent)
  width: number;
  height: number;
  originX: number;
  originY: number;
  palette: number;    // 0..3
  priority: boolean;
}

function blockKey(block: Tile[]): string {
  // Identity key over the block's pixels in order. Small sprites → cheap.
  return block.map((t) => String.fromCharCode(...t.pixels)).join('|');
}

/**
 * Decompose a frame bitmap into a tile pool + pieces. Greedy rectangle packing:
 * grow right (≤4 cells) over contiguous non-empty tiles, then grow down (≤4) while
 * the full row is non-empty. Tiles within a piece are emitted VDP column-major.
 * Identical whole blocks are deduped (piece reuses the base tile index). Piece tile
 * indices are relative to THIS frame's block start (0-based); assembleSprite rebases.
 */
export function decomposeFrame(frame: RawFrame): { tiles: Tile[]; pieces: SpritePiece[] } {
  const cols = Math.ceil(frame.width / CELL);
  const rows = Math.ceil(frame.height / CELL);
  const grid: Tile[][] = [];
  const empty: boolean[][] = [];
  for (let gy = 0; gy < rows; gy++) {
    const r: Tile[] = [];
    const er: boolean[] = [];
    for (let gx = 0; gx < cols; gx++) {
      const t = extractTile(frame.pixels, frame.width, frame.height, gx, gy);
      r.push(t);
      er.push(tileIsEmpty(t));
    }
    grid.push(r);
    empty.push(er);
  }

  const visited: boolean[][] = empty.map((row) => row.map(() => false));
  const tiles: Tile[] = [];
  const blockMap = new Map<string, number>();
  const pieces: SpritePiece[] = [];

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (visited[gy][gx] || empty[gy][gx]) continue;
      // grow width (max 4 cells)
      let w = 1;
      while (w < 4 && gx + w < cols && !empty[gy][gx + w] && !visited[gy][gx + w]) w++;
      // grow height (max 4 cells) while the full row across [gx, gx+w) is usable
      const rowOk = (ry: number): boolean => {
        for (let c = 0; c < w; c++) if (empty[ry][gx + c] || visited[ry][gx + c]) return false;
        return true;
      };
      let h = 1;
      while (h < 4 && gy + h < rows && rowOk(gy + h)) h++;
      // mark visited
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) visited[gy + r][gx + c] = true;
      // extract block VDP column-major: down each column, then next column
      const block: Tile[] = [];
      for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) block.push(grid[gy + r][gx + c]);
      // dedup whole block
      const key = blockKey(block);
      let base = blockMap.get(key);
      if (base === undefined) {
        base = tiles.length;
        for (const t of block) tiles.push(t);
        blockMap.set(key, base);
      }
      pieces.push({
        xOffset: gx * CELL - frame.originX,
        yOffset: gy * CELL - frame.originY,
        widthCells: w,
        heightCells: h,
        tile: base,
        palette: frame.palette,
        priority: frame.priority,
        xFlip: false,
        yFlip: false,
      });
    }
  }
  return { tiles, pieces };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: PASS (all decomposeFrame cases).

- [ ] **Step 5: Commit**

```bash
git add src/core/art/sprite-decompose.ts test/sprite/sprite-decompose.test.ts
git commit -m "feat(sprite): greedy frame decomposition (column-major pieces, block dedup)"
```

---

## Task 3: assembleSprite — concat art + rebase frames

**Files:**
- Modify: `src/core/art/sprite-decompose.ts`
- Test: `test/sprite/sprite-decompose.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { assembleSprite } from '../../src/core/art/sprite-decompose';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import { serializeTiles } from '../../src/core/export/tile-dedup';

describe('assembleSprite', () => {
  it('concatenates per-frame art and rebases piece tile indices', () => {
    // frame A: one filled tile (color 1). frame B: one filled tile (color 2).
    const a = new Uint8Array(8 * 8).fill(1);
    const b = new Uint8Array(8 * 8).fill(2);
    const { art, frames } = assembleSprite([
      { id: 'a', pixels: a, width: 8, height: 8, originX: 0, originY: 0, palette: 0, priority: false },
      { id: 'b', pixels: b, width: 8, height: 8, originX: 0, originY: 0, palette: 0, priority: false },
    ]);
    expect(art).toHaveLength(2);             // one tile per frame, not deduped across frames
    expect(frames[0].pieces[0].tile).toBe(0); // frame A base 0
    expect(frames[1].pieces[0].tile).toBe(1); // frame B rebased to 1
  });

  it('produces frames that serialize and art that serializes (integration with Plan 1)', () => {
    const px = new Uint8Array(16 * 16).fill(5);
    const { art, frames } = assembleSprite([
      { id: 'f0', pixels: px, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
    ]);
    const mapBytes = serializeSpriteMappings(frames);
    const artBytes = serializeTiles(art);
    expect(mapBytes.length).toBeGreaterThan(0);
    expect(artBytes.length).toBe(art.length * 32); // 32 bytes per 8x8 4bpp tile
    // single 2x2 piece → frame block = 6-byte header + 8-byte piece; table = 2 bytes
    expect(mapBytes.length).toBe(2 + 6 + 8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: FAIL — `assembleSprite` not exported.

- [ ] **Step 3: Write minimal implementation (append to sprite-decompose.ts)**

```ts
import type { SpriteFrame } from '../model/sprite-types';

/**
 * Decompose every frame and lay the sprite's art out contiguously (v1: per-frame
 * blocks, no cross-frame dedup — fine for non-DPLC objects where all art is resident).
 * Piece tile indices are rebased to the sprite's art pool. Returns the art pool (feed
 * to serializeTiles) and the SpriteFrame[] (feed to serializeSpriteMappings).
 */
export function assembleSprite(raws: RawFrame[]): { art: Tile[]; frames: SpriteFrame[] } {
  const art: Tile[] = [];
  const frames: SpriteFrame[] = [];
  for (const rawFrame of raws) {
    const { tiles, pieces } = decomposeFrame(rawFrame);
    const base = art.length;
    for (const t of tiles) art.push(t);
    frames.push({ id: rawFrame.id, pieces: pieces.map((p) => ({ ...p, tile: p.tile + base })) });
  }
  return { art, frames };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sprite/sprite-decompose.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all pass (Plan 1 tests + new decomposition tests), 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/sprite-decompose.ts test/sprite/sprite-decompose.test.ts
git commit -m "feat(sprite): assembleSprite — contiguous art + rebased frames (integrates Plan 1)"
```

---

## Done criteria
- `decomposeFrame` packs into ≤4×4 pieces, emits VDP column-major tiles, dedups identical
  blocks, skips empty tiles, and carries palette/priority.
- `assembleSprite` yields `{ art, frames }` where `frames` serialize via Plan 1 and `art` via
  `serializeTiles`.
- `npm test` green with no regressions.

Next: Plan 3 (animation `.asm` export — `AF_*` control/event codes, `DUR_DYNAMIC` slotting).
