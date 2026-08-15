# Paint-through (art authoring, Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paint pixels directly on a composed block/chunk surface in classic, with strokes resolving down the tile→block→chunk reference ladder so paint lands where it was painted.

**Architecture:** Two new pure core modules — one composes a surface and records where each 8×8 cell came from, one turns surface pixel-writes into a document mutation plan under a Link/Isolate policy. One new composite store command applies the plan as a single undo entry. The renderer wires the existing `PixelEditController`/`PixelViewport` substrate to the new surfaces.

**Tech Stack:** TypeScript, Zustand store, Vitest (node environment, no DOM/canvas), React renderer, existing `PixelBuffer` substrate.

**Spec:** `docs/superpowers/specs/2026-08-15-in-app-art-authoring-design.md` §3.

> **⚠ READ `## Audit corrections` AT THE END OF THIS FILE FIRST.** An adversarial audit run
> after Task 5 found seven defects in Tasks 4–12, two of them severe. That section is
> **authoritative over the task text above it** wherever they disagree.

---

## A note on code in this plan, and why it deviates

Tasks 1–8 are pure core. Their code is complete and literal — write it as given.

Tasks 9–12 touch React components. **Their code blocks are marked ILLUSTRATIVE: derive the real thing from the source file, do not paste.** This is deliberate and follows a lesson this project already paid for — plan-authored UI code was wrong three times in the previous plan in ways only implementing revealed (`2026-08-14-plan6-handoff.md` §6). Contracts plus illustrative sketches, with the implementer reading the actual component, is the discipline that works here.

**Every guard must be seen to fail.** Before believing any new test passes, plant the violation it claims to catch and watch it go red. This is the dominant defect class in this codebase (`aurora-guards-assert-nothing`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/art/classic-surface-buffer.ts` *(create)* | Compose a block/chunk into one `PixelBuffer` + per-cell provenance. Flip composition lives here and nowhere else. |
| `src/core/art/classic-surface-plan.ts` *(create)* | Turn surface writes into a `SurfaceEditPlan` under Link/Isolate. Owns the two-tier divergence rule. |
| `src/core/art/__tests__/classic-surface-buffer.test.ts` *(create)* | Composition + flip cases. |
| `src/core/art/__tests__/classic-surface-plan.test.ts` *(create)* | Policy, cascade, limit exhaustion. |
| `src/renderer/state/classicLevelStore.ts` *(modify)* | Add `classicPaintSurface` composite command. |
| `src/renderer/components/classic/TileTab.tsx` *(modify)* | Seam-preview toggle. |
| `src/renderer/components/classic/composer-shared.tsx` *(modify)* | Reframe `SharedBanner`. |
| `src/renderer/components/classic/ChunkTab.tsx`, `BlockTab.tsx` *(modify)* | Paint mode over the composed surface. |

---

### Task 1: Provenance types and `buildBlockSurface`

The block surface is the simpler case — no chunk-cell flips — so it pins the types before the hard one.

**Files:**
- Create: `src/core/art/classic-surface-buffer.ts`
- Create: `src/core/art/__tests__/classic-surface-buffer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildBlockSurface } from '../classic-surface-buffer';
import type { LevelDoc, BlockDef } from '../../level-classic/model';

/** Minimal doc: tile N is filled entirely with palette value N. */
export function makeDoc(blocks: BlockDef[], tileCount = 8): LevelDoc {
  const tiles = new Uint8Array(tileCount * 32);
  for (let t = 1; t < tileCount; t++) {
    // 4bpp: both nibbles = t, so every pixel of tile t reads back as t.
    tiles.fill((t << 4) | t, t * 32, t * 32 + 32);
  }
  return {
    game: 's1', tiles, blocks, chunks: [],
    fg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind: new Uint8Array(blocks.length), shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [], objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

const cell = (tile: number, xf = false, yf = false, pal = 0) => ({ tile, xf, yf, pal, pri: false });

describe('buildBlockSurface', () => {
  it('is 16x16 with 2x2 cells laid out TL, TR, BL, BR', () => {
    const doc = makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);
    const { buffer, provenance } = buildBlockSurface(doc, 0);

    expect(buffer.width).toBe(16);
    expect(buffer.height).toBe(16);
    expect(provenance.cellsX).toBe(2);
    expect(provenance.cellsY).toBe(2);

    // One pixel from each quadrant proves the layout order.
    expect(buffer.data[0 * 16 + 0]).toBe(1);   // TL
    expect(buffer.data[0 * 16 + 8]).toBe(2);   // TR
    expect(buffer.data[8 * 16 + 0]).toBe(3);   // BL
    expect(buffer.data[8 * 16 + 8]).toBe(4);   // BR
  });

  it('records provenance per cell, with no chunk cell', () => {
    const doc = makeDoc([{ cells: [cell(1), cell(2, true), cell(3), cell(4)] }]);
    const { provenance } = buildBlockSurface(doc, 0);

    expect(provenance.cells[1]).toEqual({
      chunkCellIndex: null, blockId: 0, blockCellIndex: 1,
      tileIndex: 2, xf: true, yf: false, pal: 0,
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts`
Expected: FAIL — `Failed to resolve import "../classic-surface-buffer"`.

- [ ] **Step 3: Implement**

```ts
// src/core/art/classic-surface-buffer.ts
//
// Composes classic's referenced-by-id art into ONE editable pixel surface, and
// records where every 8x8 cell came from so a write can be resolved back down.
//
// Flip composition lives here and ONLY here: a chunk cell's flip mirrors the whole
// 16x16 block, which both reorders which block cell sits where AND mirrors the tile
// inside it. Getting that wrong produces plausible-looking but wrong pixels, so it
// is isolated in one pure function with direct test coverage.
//
// Pure core — no fs, no DOM, no store.

import type { PixelBuffer } from './pixel-ops';
import { tileToBuffer } from './classic-tile-buffer';
import { chunkIndexForId, type LevelDoc } from '../level-classic/model';

const TILE_PX = 8;

/** One 8x8 cell of a composed surface, and the document location it came from. */
export interface SurfaceCell {
  /** Index into `doc.chunks[i].cells`, or null when the surface is a bare block. */
  chunkCellIndex: number | null;
  blockId: number;
  /** 0..3 — index into `BlockDef.cells` (TL, TR, BL, BR). */
  blockCellIndex: number;
  tileIndex: number;
  /** COMPOSED orientation: the block cell's flip XORed with the chunk cell's. */
  xf: boolean;
  yf: boolean;
  pal: number;
}

export interface SurfaceProvenance {
  /** Row-major, length cellsX * cellsY. */
  cells: SurfaceCell[];
  cellsX: number;
  cellsY: number;
  /** The chunk this surface composes, as an index into doc.chunks; null for a block. */
  chunkIndex: number | null;
}

export interface Surface {
  buffer: PixelBuffer;
  provenance: SurfaceProvenance;
}

/** Blit one tile into the surface at a cell position, honouring the composed flips. */
function blitCell(
  out: PixelBuffer, doc: LevelDoc, c: SurfaceCell, cellX: number, cellY: number,
): void {
  const tile = tileToBuffer(doc.tiles, c.tileIndex);
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const sx = c.xf ? TILE_PX - 1 - px : px;
      const sy = c.yf ? TILE_PX - 1 - py : py;
      const dx = cellX * TILE_PX + px;
      const dy = cellY * TILE_PX + py;
      out.data[dy * out.width + dx] = tile.data[sy * TILE_PX + sx];
    }
  }
}

function composeFrom(doc: LevelDoc, cells: SurfaceCell[], cellsX: number, cellsY: number,
  chunkIndex: number | null): Surface {
  const buffer: PixelBuffer = {
    width: cellsX * TILE_PX,
    height: cellsY * TILE_PX,
    data: new Uint8Array(cellsX * cellsY * TILE_PX * TILE_PX),
  };
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      blitCell(buffer, doc, cells[cy * cellsX + cx], cx, cy);
    }
  }
  return { buffer, provenance: { cells, cellsX, cellsY, chunkIndex } };
}

/** Compose one 16x16 block into a 2x2-cell surface. */
export function buildBlockSurface(doc: LevelDoc, blockId: number): Surface {
  const block = doc.blocks[blockId];
  const cells: SurfaceCell[] = [];
  for (let i = 0; i < 4; i++) {
    const bc = block?.cells[i];
    cells.push({
      chunkCellIndex: null,
      blockId,
      blockCellIndex: i,
      tileIndex: bc?.tile ?? 0,
      xf: bc?.xf ?? false,
      yf: bc?.yf ?? false,
      pal: bc?.pal ?? 0,
    });
  }
  return composeFrom(doc, cells, 2, 2, null);
}
```

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Falsify the guard**

Temporarily swap `cells.push` order so `blockCellIndex` 1 and 2 are reversed. Re-run: the layout test MUST fail. Restore from a byte copy — **never `git checkout --`/`git restore`**, which aborts on untracked pathspecs and silently reverts real edits (this bit two agents in the previous plan).

- [ ] **Step 6: Commit**

```bash
git add src/core/art/classic-surface-buffer.ts src/core/art/__tests__/classic-surface-buffer.test.ts
git commit -m "feat(art): compose a classic block into an editable pixel surface"
```

---

### Task 2: `buildChunkSurface` — the flip composition

**This is the highest-risk task in the plan.** A chunk cell's flip does two things at once and both must happen.

**Files:**
- Modify: `src/core/art/classic-surface-buffer.ts`
- Modify: `src/core/art/__tests__/classic-surface-buffer.test.ts`

- [ ] **Step 0: Close a hole in Task 1's coverage (amendment, added 2026-08-15 after spec review)**

Task 1's fixture fills tile N with the uniform value N, so **its tests cannot detect whether `blitCell` mirrors anything** — every pixel of a tile is identical, flipped or not. Task 2's tests below assert *provenance* (`xf`/`yf` fields), not blitted pixels, so without this step the blit's flip handling would have no permanent coverage anywhere. Add it before starting Task 2 proper:

The marker pixel sits at local **(1,0)**, deliberately NOT (0,0): a marker on the diagonal is symmetric under transposition, so an `sx`/`sy` swap would still read back correctly and the test would pass while the blit was wrong. (1,0) is asymmetric and catches the wider class the code-quality review named — transposition and off-by-one inside the cell, not only flips.

```ts
describe('buildBlockSurface — the blit places pixels within a cell correctly', () => {
  /** A doc whose tile 1 is blank except for value 5 at local (1,0). */
  function docWithMarker(xf: boolean, yf: boolean): LevelDoc {
    const d = makeDoc([{ cells: [cell(1, xf, yf), cell(0), cell(0), cell(0)] }]);
    d.tiles.fill(0, 32, 64);   // clear tile 1
    d.tiles[32] = 0x05;        // byte 0: pixel (0,0) = 0, pixel (1,0) = 5
    return d;
  }

  it('unflipped, the marker stays at (1,0) — and NOT at (0,1)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(false, false), 0);
    expect(buffer.data[0 * 16 + 1]).toBe(5);
    expect(buffer.data[1 * 16 + 0]).toBe(0);   // transposition guard
  });

  it('xf mirrors it across the cell to (6,0)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(true, false), 0);
    expect(buffer.data[0 * 16 + 6]).toBe(5);
    expect(buffer.data[0 * 16 + 1]).toBe(0);
  });

  it('yf mirrors it down the cell to (1,7)', () => {
    const { buffer } = buildBlockSurface(docWithMarker(false, true), 0);
    expect(buffer.data[7 * 16 + 1]).toBe(5);
    expect(buffer.data[0 * 16 + 1]).toBe(0);
  });
});
```

Run it, confirm 3 more tests pass, then **falsify twice**: (a) delete the `c.xf ? TILE_PX - 1 - px : px` conditional in `blitCell` (use `px` directly) — the xf case MUST fail; (b) swap the source lookup to `tile.data[sx * TILE_PX + sy]` — the unflipped transposition guard MUST fail. Restore from a byte copy after each. Commit separately as `test(art): pin blitCell's pixel placement, which uniform-colour fixtures could not see`.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
import { buildChunkSurface } from '../classic-surface-buffer';
import type { ChunkDef256, ChunkCell } from '../../level-classic/model';

const chunkCell = (block: number, xf = false, yf = false): ChunkCell =>
  ({ block, xf, yf, solidity: 0 });

/** A chunk whose cell 0 is `first`, every other cell block 0. */
function chunkWith(first: ChunkCell): ChunkDef256 {
  return { cells: Array.from({ length: 256 }, (_, i) => (i === 0 ? first : chunkCell(0))) };
}

describe('buildChunkSurface — flip composition', () => {
  // Block 0's four cells are tiles 1,2,3,4 (TL,TR,BL,BR), all unflipped.
  const doc = () => {
    const d = makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);
    return d;
  };

  it('is 256x256 with 32x32 cells', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0))];
    const { buffer, provenance } = buildChunkSurface(d, 0);
    expect(buffer.width).toBe(256);
    expect(buffer.height).toBe(256);
    expect(provenance.cellsX).toBe(32);
    expect(provenance.cellsY).toBe(32);
  });

  it('unflipped: block cells appear in TL,TR,BL,BR order', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(1);              // surface cell (0,0)
    expect(provenance.cells[1].tileIndex).toBe(2);              // (1,0)
    expect(provenance.cells[32].tileIndex).toBe(3);             // (0,1)
    expect(provenance.cells[33].tileIndex).toBe(4);             // (1,1)
  });

  it('chunk xflip SWAPS the left/right sub-tiles AND mirrors each tile', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, true, false))];
    const { provenance } = buildChunkSurface(d, 0);
    // Left half of the block now shows what was the RIGHT sub-tile.
    expect(provenance.cells[0].tileIndex).toBe(2);
    expect(provenance.cells[1].tileIndex).toBe(1);
    // ...and each of those tiles is itself mirrored.
    expect(provenance.cells[0].xf).toBe(true);
    expect(provenance.cells[0].yf).toBe(false);
  });

  it('chunk yflip swaps top/bottom and mirrors vertically', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, false, true))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(3);
    expect(provenance.cells[32].tileIndex).toBe(1);
    expect(provenance.cells[0].yf).toBe(true);
    expect(provenance.cells[0].xf).toBe(false);
  });

  it('BOTH flips compose — the diagonal case', () => {
    const d = doc(); d.chunks = [chunkWith(chunkCell(0, true, true))];
    const { provenance } = buildChunkSurface(d, 0);
    expect(provenance.cells[0].tileIndex).toBe(4);   // BR ends up at TL
    expect(provenance.cells[33].tileIndex).toBe(1);  // TL ends up at BR
    expect(provenance.cells[0].xf).toBe(true);
    expect(provenance.cells[0].yf).toBe(true);
  });

  it('a chunk flip XORs with the block cell\'s own flip rather than replacing it', () => {
    // Block cell TL is ALREADY xflipped; the chunk flips too -> they cancel.
    const d = makeDoc([{ cells: [cell(1, true), cell(2), cell(3), cell(4)] }]);
    d.chunks = [chunkWith(chunkCell(0, true, false))];
    const { provenance } = buildChunkSurface(d, 0);
    // TL of the flipped block is the old TR (tile 2, unflipped) -> xf true.
    expect(provenance.cells[0].tileIndex).toBe(2);
    expect(provenance.cells[0].xf).toBe(true);
    // The old TL (tile 1, xf true) lands right, and its flip CANCELS.
    expect(provenance.cells[1].tileIndex).toBe(1);
    expect(provenance.cells[1].xf).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts`
Expected: FAIL — `buildChunkSurface is not a function`.

- [ ] **Step 3: Implement**

Append to `classic-surface-buffer.ts`:

```ts
/**
 * Compose one 256x256 chunk into a 32x32-cell surface.
 *
 * `chunkIndex` is a FILE-ORDER index into `doc.chunks`, not an engine id — use
 * `chunkIndexForId` to convert a layout byte first.
 *
 * The flip rule, stated once: a chunk cell's xflip mirrors the whole 16x16 block.
 * That means (a) the left and right sub-tiles trade places, and (b) each tile is
 * itself mirrored. (a) is the `srcSx` lookup; (b) is the XOR into `xf`. Doing only
 * one of the two is the classic way to get this wrong, and it looks almost right.
 */
export function buildChunkSurface(doc: LevelDoc, chunkIndex: number): Surface {
  const chunk = doc.chunks[chunkIndex];
  const cellsX = 32, cellsY = 32;
  const cells: SurfaceCell[] = new Array(cellsX * cellsY);

  for (let by = 0; by < 16; by++) {
    for (let bx = 0; bx < 16; bx++) {
      const chunkCellIndex = by * 16 + bx;
      const cc = chunk?.cells[chunkCellIndex];
      const blockId = cc?.block ?? 0;
      const cxf = cc?.xf ?? false;
      const cyf = cc?.yf ?? false;
      const block = doc.blocks[blockId];

      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          // (a) the chunk flip reorders which block cell sits at this sub-position
          const srcSx = cxf ? 1 - sx : sx;
          const srcSy = cyf ? 1 - sy : sy;
          const blockCellIndex = srcSy * 2 + srcSx;
          const bc = block?.cells[blockCellIndex];

          cells[(by * 2 + sy) * cellsX + (bx * 2 + sx)] = {
            chunkCellIndex,
            blockId,
            blockCellIndex,
            tileIndex: bc?.tile ?? 0,
            // (b) ...and mirrors the tile within it
            xf: (bc?.xf ?? false) !== cxf,
            yf: (bc?.yf ?? false) !== cyf,
            pal: bc?.pal ?? 0,
          };
        }
      }
    }
  }
  return composeFrom(doc, cells, cellsX, cellsY, chunkIndex);
}

/** Convenience: compose by ENGINE chunk id (layout byte), returning null for air. */
export function buildChunkSurfaceById(doc: LevelDoc, chunkId: number): Surface | null {
  const idx = chunkIndexForId(doc, chunkId);
  return idx === null ? null : buildChunkSurface(doc, idx);
}
```

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Falsify — twice, once per half of the rule**

First delete the `srcSx`/`srcSy` reordering (use `sx`/`sy` directly): the xflip and both-flips tests MUST fail. Restore. Then change `xf:` to `bc?.xf ?? false` (dropping the XOR): the xflip orientation assertions MUST fail. Restore. **A rule with two halves needs two plants** — one plant passing does not prove the other half is covered.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/classic-surface-buffer.ts src/core/art/__tests__/classic-surface-buffer.test.ts
git commit -m "feat(art): compose a chunk surface, composing chunk and block flips"
```

---

### Task 3: Surface coordinate → tile coordinate

The inverse of the blit. Small, but every write depends on it.

**File placement, decided 2026-08-15 after Task 2's code review.** The review asked whether this belongs in a sibling `classic-surface-resolve.ts` instead of growing the buffer module. It stays in `classic-surface-buffer.ts`, deliberately: `surfaceToTile` must **exactly invert** `blitCell`, and the cheapest way to keep an inverse honest is to have it sit next to the thing it inverts, where any reviewer can check the two against each other. Splitting a forward and inverse map across files is how they drift. The resolver proper — which is a different job, not a mirror of this one — gets its own file in Task 4.

**Files:**
- Modify: `src/core/art/classic-surface-buffer.ts`
- Modify: `src/core/art/__tests__/classic-surface-buffer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { surfaceToTile } from '../classic-surface-buffer';

describe('surfaceToTile', () => {
  it('maps an unflipped cell straight through', () => {
    const d = makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);
    const { provenance } = buildBlockSurface(d, 0);
    expect(surfaceToTile(provenance, 3, 5)).toEqual({ cellIndex: 0, tileIndex: 1, tx: 3, ty: 5 });
  });

  it('un-flips x for a mirrored cell', () => {
    const d = makeDoc([{ cells: [cell(1, true), cell(2), cell(3), cell(4)] }]);
    const { provenance } = buildBlockSurface(d, 0);
    // surface x=3 in a mirrored tile reads stored x = 7-3 = 4
    expect(surfaceToTile(provenance, 3, 5)).toEqual({ cellIndex: 0, tileIndex: 1, tx: 4, ty: 5 });
  });

  it('returns null outside the surface', () => {
    const d = makeDoc([{ cells: [cell(1), cell(2), cell(3), cell(4)] }]);
    const { provenance } = buildBlockSurface(d, 0);
    expect(surfaceToTile(provenance, 16, 0)).toBeNull();
    expect(surfaceToTile(provenance, -1, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts -t surfaceToTile`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

```ts
export interface TileHit {
  /** Index into provenance.cells. */
  cellIndex: number;
  tileIndex: number;
  /** Coordinates within the STORED tile (flips undone), 0..7. */
  tx: number;
  ty: number;
}

/** Resolve a surface pixel to the stored tile pixel it is drawn from. */
export function surfaceToTile(p: SurfaceProvenance, x: number, y: number): TileHit | null {
  if (x < 0 || y < 0 || x >= p.cellsX * TILE_PX || y >= p.cellsY * TILE_PX) return null;
  const cellIndex = (y >> 3) * p.cellsX + (x >> 3);
  const c = p.cells[cellIndex];
  if (!c) return null;
  const px = x & 7, py = y & 7;
  return {
    cellIndex,
    tileIndex: c.tileIndex,
    tx: c.xf ? TILE_PX - 1 - px : px,
    ty: c.yf ? TILE_PX - 1 - py : py,
  };
}
```

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-buffer.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Falsify**

Drop the `c.xf ?` conditional (always use `px`). The un-flip test MUST fail. Restore from a byte copy.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/art
git commit -m "feat(art): map a surface pixel back to its stored tile pixel"
```

---

### Task 4: The plan types and the in-place case

Isolate mode, tile used exactly once, block used exactly once → mutate in place. The common stroke (65% of tiles are used once).

**Files:**
- Create: `src/core/art/classic-surface-plan.ts`
- Create: `src/core/art/__tests__/classic-surface-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { planSurfaceEdit } from '../classic-surface-plan';
import { buildChunkSurface } from '../classic-surface-buffer';
import { buildUsageIndex } from '../../level-classic/usage-index';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../../level-classic/model';

const cell = (tile: number, xf = false, yf = false, pal = 0) => ({ tile, xf, yf, pal, pri: false });
const chunkCell = (block: number, xf = false, yf = false): ChunkCell =>
  ({ block, xf, yf, solidity: 0 });

/**
 * Doc with TWO chunks so block sharing is expressible.
 * blocks[0] = tiles 1,2,3,4 ; blocks[1] = tiles 5,6,7,8
 * chunk 0 cell 0 -> block 0, everything else block 1
 * chunk 1 -> all block 1   (so block 1 is shared, block 0 is not)
 */
function makeDoc(): LevelDoc {
  const tiles = new Uint8Array(16 * 32);
  const blocks: BlockDef[] = [
    { cells: [cell(1), cell(2), cell(3), cell(4)] },
    { cells: [cell(5), cell(6), cell(7), cell(8)] },
  ];
  const chunk = (fill: number, firstBlock: number): ChunkDef256 =>
    ({ cells: Array.from({ length: 256 }, (_, i) => chunkCell(i === 0 ? firstBlock : fill)) });
  return {
    game: 's1', tiles, blocks, chunks: [chunk(1, 0), chunk(1, 1)],
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 2]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind: new Uint8Array(2), shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [], objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

/** Every tile in this fixture is claimable except tile 0 (transparent). */
const allEditable = (t: number) => t !== 0;

describe('planSurfaceEdit — the in-place case', () => {
  it('mutates the tile in place when tile and block are each used once', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const idx = buildUsageIndex(doc);

    // Surface (0,0) is chunk 0 cell 0 -> block 0 (used once) -> tile 1 (used once).
    const r = planSurfaceEdit({
      doc, provenance, index: idx, mode: 'isolate', isEditableTile: allEditable,
      writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(1);
    expect(r.plan.tileWrites[0].tileIndex).toBe(1);
    expect(r.plan.newBlocks).toHaveLength(0);
    expect(r.plan.blockCellEdits).toHaveLength(0);
    expect(r.plan.chunkCellEdits).toHaveLength(0);
    expect(r.plan.stats.tilesClaimed).toBe(0);
    expect(r.plan.stats.blocksCloned).toBe(0);
  });

  it('writes the new value at the un-flipped position', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 1, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 4bpp, pixel 1 is the LOW nibble of byte 0.
    expect(r.plan.tileWrites[0].data[0] & 0x0f).toBe(9);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: FAIL — cannot resolve `../classic-surface-plan`.

- [ ] **Step 3: Implement**

```ts
// src/core/art/classic-surface-plan.ts
//
// Turns pixel writes on a composed surface into a document mutation plan.
//
// THE RULE, stated once. Paint stays where it was painted only if the tile is
// referenced by exactly one block cell AND the block by exactly one chunk cell.
// The two checks are independent and BOTH are required — cloning the block alone
// does not help, because the clone still points at the same shared tile. That is
// the two-tier cascade the single-indirection model (Aseprite's) does not have.
//
// Pure core — no store, no fs. The editable-tile predicate is injected so this
// module shares the ONE definition of "writable tile" with the store rather than
// restating the rule.

import type { LevelDoc, BlockDef, BlockCell, ChunkCell } from '../level-classic/model';
import type { UsageIndex } from '../level-classic/usage-index';
import type { SurfaceProvenance } from './classic-surface-buffer';
import { surfaceToTile } from './classic-surface-buffer';
import { tileToBuffer, bufferToTileBytes } from './classic-tile-buffer';

export type PaintMode = 'isolate' | 'link';

export interface SurfaceWrite { x: number; y: number; value: number }

export interface SurfaceEditPlan {
  /** Tile-pool pixel writes, 32 bytes each. */
  tileWrites: { tileIndex: number; data: Uint8Array }[];
  /** Blocks appended to the pool; ids are doc.blocks.length + arrayIndex. */
  newBlocks: BlockDef[];
  /** Repoints within an existing or newly-added block. */
  blockCellEdits: { blockId: number; cellIndex: number; cell: BlockCell }[];
  /** Repoints within a chunk. */
  chunkCellEdits: { chunkIndex: number; cellIndex: number; cell: ChunkCell }[];
  stats: { tilesClaimed: number; blocksCloned: number; placesAffected: number };
}

export type PlanResult =
  | { ok: true; plan: SurfaceEditPlan }
  | { ok: false; reason: string };

export interface PlanInput {
  doc: LevelDoc;
  provenance: SurfaceProvenance;
  index: UsageIndex;
  mode: PaintMode;
  writes: SurfaceWrite[];
  /** Shares core/project/editable-tiles' predicate — do NOT restate the rule. */
  isEditableTile: (tileIndex: number) => boolean;
}

/** Distinct chunks whose appearance changes if `tileIndex` is mutated in place. */
function chunksTouchedByTile(index: UsageIndex, tileIndex: number): number {
  const chunks = new Set<number>();
  for (const blockId of index.tileToBlocks.get(tileIndex) ?? []) {
    for (const ci of index.blockToChunks.get(blockId) ?? []) chunks.add(ci);
  }
  return chunks.size;
}

export function planSurfaceEdit(input: PlanInput): PlanResult {
  const { doc, provenance, index, mode, writes, isEditableTile } = input;

  // 1 · Group writes by the surface CELL they land in, in tile coordinates.
  const perCell = new Map<number, { tileIndex: number; px: { tx: number; ty: number; v: number }[] }>();
  for (const w of writes) {
    const hit = surfaceToTile(provenance, w.x, w.y);
    if (!hit) continue; // outside the surface — silently ignored, as strokes overshoot
    let e = perCell.get(hit.cellIndex);
    if (!e) { e = { tileIndex: hit.tileIndex, px: [] }; perCell.set(hit.cellIndex, e); }
    e.px.push({ tx: hit.tx, ty: hit.ty, v: w.value });
  }

  const plan: SurfaceEditPlan = {
    tileWrites: [], newBlocks: [], blockCellEdits: [], chunkCellEdits: [],
    stats: { tilesClaimed: 0, blocksCloned: 0, placesAffected: 0 },
  };
  if (perCell.size === 0) return { ok: true, plan };

  const placesAffected = new Set<number>();

  for (const [cellIndex, e] of perCell) {
    const c = provenance.cells[cellIndex];

    // 2 · The pixels this tile should end up with.
    const buf = tileToBuffer(doc.tiles, e.tileIndex);
    for (const p of e.px) buf.data[p.ty * 8 + p.tx] = p.v & 0x0f;

    if (mode === 'link') {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: bufferToTileBytes(buf) });
      placesAffected.add(...[]); // counted below from the index
      for (const ci of index.blockToChunks.get(c.blockId) ?? []) placesAffected.add(ci);
      continue;
    }

    // 3 · Isolate. Both questions, independently.
    const tileLinked = index.tileUsage(e.tileIndex).cells > 1;
    const blockLinked = c.chunkCellIndex !== null && index.blockUsage(c.blockId).cells > 1;

    if (!tileLinked && !blockLinked) {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: bufferToTileBytes(buf) });
      if (provenance.chunkIndex !== null) placesAffected.add(provenance.chunkIndex);
      continue;
    }

    return { ok: false, reason: 'divergence not implemented yet' }; // Tasks 5 and 6
  }

  plan.stats.placesAffected = placesAffected.size;
  return { ok: true, plan };
}
```

> The `placesAffected.add(...[])` line above is a deliberate no-op placeholder left by the
> in-place slice and is **removed in Task 7** when Link's readout is built. Do not
> ship it — Task 7's test pins the real count.

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Falsify**

Change `buf.data[p.ty * 8 + p.tx]` to `buf.data[p.tx * 8 + p.ty]`. The un-flipped-position test MUST fail. Restore from a byte copy.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/classic-surface-plan.ts src/core/art/__tests__/classic-surface-plan.test.ts
git commit -m "feat(art): plan surface edits, in-place case"
```

---

### Task 5: Tile divergence — content match, free slot, or refuse

**Files:**
- Modify: `src/core/art/classic-surface-plan.ts`
- Modify: `src/core/art/__tests__/classic-surface-plan.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('planSurfaceEdit — tile divergence', () => {
  /** Make tile 1 shared by pointing block 1's first cell at it too. */
  function docWithSharedTile1(): LevelDoc {
    const doc = makeDoc();
    doc.blocks[1] = { cells: [cell(1), cell(6), cell(7), cell(8)] };
    return doc;
  }

  it('claims a free editable slot when the tile is linked elsewhere', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tile 1 must NOT be rewritten; a spare slot takes the divergent copy.
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).not.toContain(1);
    expect(r.plan.tileWrites).toHaveLength(1);
    expect(r.plan.stats.tilesClaimed).toBe(1);
    // ...and the block cell now points at the claimed slot.
    const claimed = r.plan.tileWrites[0].tileIndex;
    expect(r.plan.blockCellEdits).toEqual([
      { blockId: 0, cellIndex: 0, cell: { tile: claimed, xf: false, yf: false, pal: 0, pri: false } },
    ]);
  });

  it('reuses an existing tile whose content already matches instead of claiming', () => {
    const doc = docWithSharedTile1();
    // Pre-build the exact bytes the edit will produce, and park them in tile 12.
    const want = tileToBuffer(doc.tiles, 1);
    want.data[0] = 9;
    doc.tiles.set(bufferToTileBytes(want), 12 * 32);

    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);          // nothing written
    expect(r.plan.stats.tilesClaimed).toBe(0);
    expect(r.plan.blockCellEdits[0].cell.tile).toBe(12); // just repointed
  });

  it('refuses, naming the limit, when no editable slot is free', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: () => false,   // nothing claimable — the Labyrinth case
      writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no free/i);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts -t "tile divergence"`
Expected: FAIL — all three hit `divergence not implemented yet`.

- [ ] **Step 3: Implement**

Add helpers above `planSurfaceEdit`:

```ts
const TILE_BYTES = 32;

function bytesEqualAt(pool: Uint8Array, tileIndex: number, want: Uint8Array): boolean {
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) if (pool[base + i] !== want[i]) return false;
  return true;
}

/** An existing pool tile whose bytes already equal `want`, or null. */
function findContentMatch(doc: LevelDoc, want: Uint8Array): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 0; t < count; t++) if (bytesEqualAt(doc.tiles, t, want)) return t;
  return null;
}

/**
 * A pool slot that is BOTH unreferenced and writable. "Free" is not the same as
 * "claimable" — tileLockReason marks tiles the save path would refuse, and
 * claiming one would produce an edit that can never be saved.
 */
function findFreeSlot(
  doc: LevelDoc, index: UsageIndex, isEditableTile: (t: number) => boolean, taken: Set<number>,
): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 1; t < count; t++) {          // 0 is the transparent tile — never claim it
    if (taken.has(t)) continue;
    if (index.tileUsage(t).cells !== 0) continue;
    if (!isEditableTile(t)) continue;
    return t;
  }
  return null;
}
```

Then replace the `return { ok: false, reason: 'divergence not implemented yet' };` line with:

```ts
    // The tile must diverge if it is linked elsewhere — OR if we are about to clone
    // the block, since the clone would otherwise share the original's tiles.
    const wantBytes = bufferToTileBytes(buf);
    let targetTile = e.tileIndex;

    if (tileLinked || blockLinked) {
      const match = findContentMatch(doc, wantBytes);
      if (match !== null) {
        targetTile = match;
      } else {
        const slot = findFreeSlot(doc, index, isEditableTile, claimed);
        if (slot === null) {
          return {
            ok: false,
            reason: `no free editable tile slot to hold the divergent copy — this zone is at its tile limit. Switch to Link mode to edit every place at once.`,
          };
        }
        claimed.add(slot);
        targetTile = slot;
        plan.tileWrites.push({ tileIndex: slot, data: wantBytes });
        plan.stats.tilesClaimed++;
      }
    }
```

Declare `const claimed = new Set<number>();` beside `placesAffected`. Block cloning and the repoint bookkeeping arrive in Task 6; for now append, immediately after the block above:

**CORRECTED 2026-08-15, before implementation.** An earlier revision of this step wrote
`cell: { tile: targetTile, xf: c.xf, yf: c.yf, pal: c.pal, ... }`. That is **wrong**:
`SurfaceCell.xf` is the *composed* flip (block cell XOR chunk cell), so storing it back into
the block cell would double-apply the chunk's flip on every later render, and any paint on a
flipped chunk cell would come out mirrored. Only the tile pointer changes here — the cell's
orientation is unchanged, because `buf` was built in STORED tile coordinates — so preserve the
source cell and swap `tile` alone:

```ts
    const srcCell = doc.blocks[c.blockId]?.cells[c.blockCellIndex];
    plan.blockCellEdits.push({
      blockId: owningBlock,
      cellIndex: c.blockCellIndex,
      // Only the tile pointer moves. Never write `c.xf`/`c.yf` here — those are
      // COMPOSED flips and would double-apply the chunk cell's flip.
      cell: { ...srcCell, tile: targetTile },
    });
    if (provenance.chunkIndex !== null) placesAffected.add(provenance.chunkIndex);
    continue;
```

`c.blockCellIndex` is already the SOURCE cell index (it accounts for the chunk flip's
reordering), and a clone copies the block's cells in the same order, so the same index is
correct for both the original and the clone.

**This needs a regression test, added in this task:** paint on a chunk cell that is itself
flipped, where the tile is linked so divergence is forced, and assert the resulting
`blockCellEdits[0].cell.xf` equals the ORIGINAL block cell's `xf` — not the composed value.
Without it, the bug reintroduces silently.

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Falsify — the claimable check specifically**

Delete `if (!isEditableTile(t)) continue;` from `findFreeSlot`. The refusal test MUST fail (it will now happily claim a locked tile). Restore from a byte copy. This is the guard that keeps Isolate from minting an unsaveable edit — prove it works.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/art
git commit -m "feat(art): diverge a linked tile by content match or free slot, else refuse"
```

---

### Task 6: Block divergence — clone once per gesture and repoint

**Files:**
- Modify: `src/core/art/classic-surface-plan.ts`
- Modify: `src/core/art/__tests__/classic-surface-plan.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('planSurfaceEdit — block divergence', () => {
  it('clones a linked block and repoints only the painted chunk cell', () => {
    const doc = makeDoc();               // block 1 is used by both chunks
    const { provenance } = buildChunkSurface(doc, 0);
    // Surface (16,0) is chunk cell 1, which is block 1 (linked).
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.newBlocks).toHaveLength(1);
    expect(r.plan.stats.blocksCloned).toBe(1);
    // The new block's id is appended after the existing pool.
    const newId = doc.blocks.length;
    expect(r.plan.chunkCellEdits).toEqual([
      { chunkIndex: 0, cellIndex: 1, cell: { block: newId, xf: false, yf: false, solidity: 0 } },
    ]);
    // The repoint lands on the CLONE, never the original.
    expect(r.plan.blockCellEdits.every((b) => b.blockId === newId)).toBe(true);
  });

  it('clones a linked block ONCE even when several of its cells are painted', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    // Two pixels in different 8x8 cells of the SAME chunk cell 1 (block 1).
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable,
      writes: [{ x: 16, y: 0, value: 9 }, { x: 24, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.newBlocks).toHaveLength(1);
    expect(r.plan.chunkCellEdits).toHaveLength(1);
  });

  it('diverges the tile too when the block is cloned, even if the tile is used once', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tile 5 is used once, but the clone would share it — so it must NOT be mutated.
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).not.toContain(5);
    expect(r.plan.stats.tilesClaimed).toBe(1);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts -t "block divergence"`
Expected: FAIL — `newBlocks` is empty; no chunk cell edits.

- [ ] **Step 3: Implement**

Inside `planSurfaceEdit`, before the per-cell loop:

```ts
  // blockId -> the id its clone will take. One clone per block per gesture, so two
  // strokes inside the same block do not mint two copies.
  const cloneOf = new Map<number, number>();
  const nextBlockId = () => doc.blocks.length + plan.newBlocks.length;
```

In the divergence branch, immediately before pushing `blockCellEdits`, resolve the owning block:

```ts
    let owningBlock = c.blockId;
    if (blockLinked) {
      let cloned = cloneOf.get(c.blockId);
      if (cloned === undefined) {
        cloned = nextBlockId();
        cloneOf.set(c.blockId, cloned);
        const src = doc.blocks[c.blockId];
        plan.newBlocks.push({ cells: src.cells.map((cc) => ({ ...cc })) });
        plan.stats.blocksCloned++;
        if (provenance.chunkIndex !== null && c.chunkCellIndex !== null) {
          const cc = doc.chunks[provenance.chunkIndex].cells[c.chunkCellIndex];
          plan.chunkCellEdits.push({
            chunkIndex: provenance.chunkIndex,
            cellIndex: c.chunkCellIndex,
            cell: { ...cc, block: cloned },
          });
        }
      }
      owningBlock = cloned;
    }
```

and change the `blockCellEdits.push` to use `blockId: owningBlock`.

> **Note on the cascade.** `blockLinked` already forces the tile branch in Task 5's
> condition (`tileLinked || blockLinked`), which is what makes the third test pass. Do
> not "optimise" that to `tileLinked` alone — the clone shares the original's tiles, so
> mutating one in place would leak into the original block.

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Falsify — twice**

First remove the `cloneOf` memo (always clone): the clone-once test MUST fail. Restore. Then change Task 5's condition from `tileLinked || blockLinked` to `tileLinked`: the cascade test MUST fail. Restore from a byte copy.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/art
git commit -m "feat(art): clone a linked block once per gesture and repoint its chunk cell"
```

---

### Task 7: Link mode and the honest `placesAffected` count

**Files:**
- Modify: `src/core/art/classic-surface-plan.ts`
- Modify: `src/core/art/__tests__/classic-surface-plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('planSurfaceEdit — link mode', () => {
  it('mutates in place and reports every chunk that will change', () => {
    const doc = makeDoc();              // block 1 lives in chunks 0 and 1
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'link',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).toEqual([5]); // in place
    expect(r.plan.newBlocks).toHaveLength(0);
    expect(r.plan.chunkCellEdits).toHaveLength(0);
    expect(r.plan.stats.placesAffected).toBe(2);   // both chunks
  });

  it('isolate reports only the chunk being edited', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stats.placesAffected).toBe(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts -t "link mode"`
Expected: FAIL — `placesAffected` is wrong (the placeholder no-op from Task 4).

- [ ] **Step 3: Implement**

Delete the `placesAffected.add(...[]);` placeholder. Replace the Link branch's counting with the real reverse lookup:

```ts
    if (mode === 'link') {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: bufferToTileBytes(buf) });
      // Mutating a tile in place changes every chunk that reaches it, through any block.
      for (const ci of chunksTouchedByTile(index, e.tileIndex)) placesAffected.add(ci);
      continue;
    }
```

and change `chunksTouchedByTile` to return the set rather than its size:

```ts
function chunksTouchedByTile(index: UsageIndex, tileIndex: number): Set<number> {
  const chunks = new Set<number>();
  for (const blockId of index.tileToBlocks.get(tileIndex) ?? []) {
    for (const ci of index.blockToChunks.get(blockId) ?? []) chunks.add(ci);
  }
  return chunks;
}
```

- [ ] **Step 4: Run and verify green**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Falsify**

Make the Link branch add only `provenance.chunkIndex`. The count MUST drop to 1 and fail. Restore from a byte copy.

- [ ] **Step 6: Commit**

```bash
git add -A src/core/art
git commit -m "feat(art): link mode mutates in place and counts every affected chunk"
```

---

### Task 8: `classicPaintSurface` — one gesture, one undo entry

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts`
- Modify: `src/renderer/state/__tests__/classicLevelStore.test.ts`

**Contract, verified against the store:** every classic command builds one immutable `newDoc`, runs `structuralError(newDoc)` once and calls `commitArt(newDoc, dirtyPatch, versionEffect)` once. `assertSingleDomain` rejects only domains belonging to the *other* undo document, so `{ tiles, blocks, chunks }` is legal together. One `commitArt` records one history snapshot — the single-undo guarantee is structural.

- [ ] **Step 1: Write the failing test**

Follow the existing file's fixture conventions. The test must assert:

```ts
it('applies tiles, blocks and chunks as ONE undo entry', () => {
  // ...open a doc, then:
  const before = /* current zoneart history depth */;
  const r = classicPaintSurface({
    tileWrites: [{ tileIndex: 3, data: new Uint8Array(32).fill(0x11) }],
    newBlocks: [{ cells: [/* 4 cells */] }],
    blockCellEdits: [{ blockId: /* new id */, cellIndex: 0, cell: { tile: 3, xf: false, yf: false, pal: 0, pri: false } }],
    chunkCellEdits: [{ chunkIndex: 0, cellIndex: 1, cell: { block: /* new id */, xf: false, yf: false, solidity: 0 } }],
    stats: { tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 },
  });
  expect(r.ok).toBe(true);
  expect(/* history depth */).toBe(before + 1);   // ONE entry, not four
});
```

Add a second case asserting one undo restores **all three** tiers (tile bytes, block count, chunk cell) — the point of a composite is that it cannot half-undo.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts -t classicPaintSurface`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Place beside `classicEditTiles`. Reuse the file's existing helpers (`requireDoc`, `err`, `isInt`, `structuralError`, `editableTileRange`, `tileLockReason`, `commitArt`) rather than restating any rule:

```ts
/**
 * classic:paint-surface — apply one paint gesture across all three art tiers.
 *
 * Composite by design: tile pixels, new blocks, block-cell repoints and chunk-cell
 * repoints land in ONE commitArt, so a stroke that diverges a block is a single
 * Ctrl+Z. Splitting it would let an undo strand a cloned block with nothing
 * pointing at it. Validation mirrors classicEditTiles for tile writes — including
 * the SAME tileLockReason predicate, so a plan can never write a locked tile.
 */
export function classicPaintSurface(plan: SurfaceEditPlan): CommandResult {
  const doc = requireDoc();
  if (!doc) return err('no classic level is open');

  const poolTiles = Math.floor(doc.tiles.length / 32);
  const range = editableTileRange();
  for (const { tileIndex, data } of plan.tileWrites) {
    if (!isInt(tileIndex) || tileIndex < 0 || tileIndex >= poolTiles) {
      return err(`tile ${tileIndex} does not exist (0..${poolTiles - 1})`);
    }
    if (!(data instanceof Uint8Array) || data.length !== 32) {
      return err(`tile ${tileIndex} data must be 32 bytes (got ${data?.length})`);
    }
    const lock = tileLockReason(range, tileIndex);
    if (lock) return err(`tile ${tileIndex} is not editable: ${lock}`);
  }

  const nextTiles = plan.tileWrites.length ? new Uint8Array(doc.tiles) : doc.tiles;
  for (const { tileIndex, data } of plan.tileWrites) nextTiles.set(data, tileIndex * 32);

  const nextBlocks = (plan.newBlocks.length || plan.blockCellEdits.length)
    ? doc.blocks.slice() : doc.blocks;
  for (const b of plan.newBlocks) nextBlocks.push({ cells: b.cells.map((c) => ({ ...c })) });
  for (const { blockId, cellIndex, cell } of plan.blockCellEdits) {
    if (!isInt(blockId) || blockId < 0 || blockId >= nextBlocks.length) {
      return err(`block ${blockId} does not exist (0..${nextBlocks.length - 1})`);
    }
    if (!isInt(cellIndex) || cellIndex < 0 || cellIndex > 3) {
      return err(`block cell index ${cellIndex} out of range 0..3`);
    }
    const cells = nextBlocks[blockId].cells.slice();
    cells[cellIndex] = { ...cell };
    nextBlocks[blockId] = { cells };
  }

  const nextChunks = plan.chunkCellEdits.length ? doc.chunks.slice() : doc.chunks;
  for (const { chunkIndex, cellIndex, cell } of plan.chunkCellEdits) {
    if (!isInt(chunkIndex) || chunkIndex < 0 || chunkIndex >= nextChunks.length) {
      return err(`chunk index ${chunkIndex} does not exist (0..${nextChunks.length - 1})`);
    }
    if (!isInt(cellIndex) || cellIndex < 0 || cellIndex > 255) {
      return err(`chunk cell index ${cellIndex} out of range 0..255`);
    }
    const cells = nextChunks[chunkIndex].cells.slice();
    cells[cellIndex] = { ...cell };
    nextChunks[chunkIndex] = { cells };
  }

  const newDoc: LevelDoc = { ...doc, tiles: nextTiles, blocks: nextBlocks, chunks: nextChunks };
  const e = structuralError(newDoc);
  if (e) return err(e);

  // State the dirty domains TRUTHFULLY — only what actually changed.
  const dirtyPatch: DirtyDomains = {};
  if (plan.tileWrites.length) dirtyPatch.tiles = true;
  if (plan.newBlocks.length || plan.blockCellEdits.length) dirtyPatch.blocks = true;
  if (plan.chunkCellEdits.length) dirtyPatch.chunks = true;
  if (Object.keys(dirtyPatch).length === 0) return { ok: true };  // no-op gesture

  // A block or tile change repaints every chunk that reaches it — bump the epoch,
  // naming written tiles so the composer's tile strip repaints only those thumbs.
  commitArt(newDoc, dirtyPatch, { kind: 'all', tiles: plan.tileWrites.map((w) => w.tileIndex) });
  return { ok: true };
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS with no new failures; tsc clean. Note the known flake at `src/renderer/providers/__tests__/map-status-classic.test.ts:109` (5s timeout under load) — re-run that file alone before treating it as a regression.

- [ ] **Step 5: Falsify**

Split the single `commitArt` into two calls (tiles, then blocks). The one-undo-entry test MUST fail. Restore from a byte copy.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/state
git commit -m "feat(classic): classicPaintSurface applies a paint gesture as one undo entry"
```

---

### Task 9: Seam preview in `TileTab` *(ILLUSTRATIVE — derive from source)*

`PixelViewport` already implements this; aeon's `ComposerCanvas.tsx:704` passes `repeat: repeatPreview ? { tilesX: 3, tilesY: 3 } : null`. Classic simply never wires it.

**Files:**
- Modify: `src/renderer/components/classic/TileTab.tsx`
- Modify: `src/renderer/components/classic/__tests__/` (add a wiring assertion)

- [ ] **Step 1: Read the two sources** — `ComposerCanvas.tsx` around line 704 for the prop shape, and `PixelViewport.tsx:104-108,145,206` for how `repeat` shifts the origin and hit-testing. **The pointer mapping already accounts for the repeat origin; do not add your own offset.**

- [ ] **Step 2: Write a source-level guard test**

The node suite cannot render this component, so assert the wiring by source inspection, the way plan 4's tool-split guard does. Read `TileTab.tsx` as text and assert it passes `repeat` into the viewport's `layers`. Then plant the violation — delete the prop — and confirm the test fails before believing it.

- [ ] **Step 3: Add the toggle** *(ILLUSTRATIVE)*

```tsx
const [seamPreview, setSeamPreview] = useState(false);
// ...in the layers object handed to PixelViewport:
repeat: seamPreview ? { tilesX: 3, tilesY: 3 } : null,
```

Place the control beside the existing zoom control in the tile tab's options row, matching the surrounding `Chip` usage — note the ui kit's `Chip` is a `<span>`, not a button, which tripped a harness in the previous plan.

- [ ] **Step 4: Verify in the running app**

`npx electron-vite build`, launch, open a classic project's Art facet → Tile tier, toggle it, confirm the centre tile stays the editable one and the eight neighbours are read-only repeats.

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/components/classic
git commit -m "feat(classic): seam preview on the tile tier"
```

---

### Task 10: Reframe `SharedBanner` *(ILLUSTRATIVE — derive from source)*

**Files:**
- Modify: `src/renderer/components/classic/composer-shared.tsx`

Current copy warns. The research says this same mechanism is Pyxel Edit's headline feature; the words should match the framing we want. Spec §1 vocabulary: **linked / unique**, never shared / forked; **limit**, never budget.

- [ ] **Step 1** Read `SharedBanner` and every call site (`grep -rn "SharedBanner" src/renderer`).
- [ ] **Step 2** Rewrite the copy to state the mechanism and offer the action: *"Used in 14 blocks · 31 cells — edits appear in all of them"* with a **Make unique** button.
- [ ] **Step 3** Wire **Make unique** to the Task 6 clone path for the current selection.
- [ ] **Step 4** Add a source guard asserting the banner renders the usage numbers it is given; plant a violation and watch it fail.
- [ ] **Step 5** Commit: `refactor(classic): state tile linkage as a mechanism, not a hazard`

---

### Task 11: Paint mode on `ChunkTab` / `BlockTab` *(ILLUSTRATIVE — derive from source)*

**Files:**
- Modify: `src/renderer/components/classic/ChunkTab.tsx`, `BlockTab.tsx`

Open decision from spec §7 resolved here: painting is a **tool mode on the existing tabs**, not a new surface, so there stays one place per tier.

- [ ] **Step 1** Read both tabs fully. They are assignment grids today (`ChunkTab` paints a block id; `BlockTab` a tile id). Painting must not replace that — it is a second mode selected by the active tool.
- [ ] **Step 2** When a pixel tool is active, compose the surface (`buildChunkSurface` / `buildBlockSurface`) and render through `PixelViewport` instead of the cell grid.
- [ ] **Step 3** Drive the gesture with the existing `PixelEditController`, exactly as `TileTab` does after H1. On gesture end, `diffWrites` → `planSurfaceEdit` → `classicPaintSurface`.
- [ ] **Step 4** Add the Link/Isolate control and the limits readout to the tool options row: `blocks 439/1024 · tiles 819/965`. Say **limit**, not budget. On a refusal, surface `reason` as a toast and offer the Link-mode edit.
- [ ] **Step 5** Guard test: assert the composed path calls `planSurfaceEdit` before `classicPaintSurface` and never calls `classicEditTiles` directly. Plant a violation; watch it fail.
- [ ] **Step 6** Commit: `feat(classic): paint pixels across a block or chunk surface`

---

### Task 12: Verify in the running app under CDP

The node suite sees no canvas, no React and no event ordering, so nothing above proves the feature works. Plan 4 and step H both established this as the closing step.

**Files:**
- Create: `scratchpad/paint-through-harness.mjs` (untracked, alongside the existing harnesses)

- [ ] **Step 1** Model it on `scratchpad/camera-harness.mjs` and `composer-fill-harness.mjs`; use the `__dbg` hooks those rely on.
- [ ] **Step 2** Assert, in the running app: a 6-pixel drag on a chunk surface is **one** undo entry; undo restores all three tiers; painting on a linked block leaves the *other* chunk visually unchanged; painting in Link mode changes both.
- [ ] **Step 3** **Falsify the harness itself** before trusting it. A previous round reported three defects that did not exist — a selector matching extra buttons, and a stale marquee turning a later drag into a move. Prove each assertion can fail.
- [ ] **Step 4** Record measurements in `docs/superpowers/plans/` as a short report, as plan 5 and 6 did.
- [ ] **Step 5** Commit the report.

---

## Self-Review

**Spec coverage.** §3.1 → Tasks 1–2. §3.2 → Tasks 3–6. §3.3 Link/Isolate → Tasks 4, 7, 11. §3.4 composite command → Task 8. §3.5 limits and the tile lock → Tasks 5, 8, 11. §3.6 seam preview → Task 9; banner reframe → Task 10. §5 testing discipline → falsification steps throughout, CDP in Task 12.

**Known gap, deliberate:** the spec's Isolate-cannot-isolate fallback is implemented as a refusal with a reason (Task 5) and surfaced in Task 11, but the *one-click* "switch to Link and retry" convenience is not planned. It is a small follow-up and does not block the feature.

**Type consistency.** `SurfaceCell`, `SurfaceProvenance`, `Surface`, `TileHit`, `PaintMode`, `SurfaceWrite`, `SurfaceEditPlan`, `PlanResult`, `PlanInput` are defined in Tasks 1, 3 and 4 and used unchanged after. `planSurfaceEdit` keeps one signature throughout. `chunksTouchedByTile` changes return type in Task 7 — called out explicitly there, and it has no other caller.

**Placeholder note.** Task 4 deliberately ships a `divergence not implemented yet` branch and a no-op `placesAffected` line, both removed by name in Tasks 5 and 7. These are TDD stepping stones with named removal points, not unfinished plan text.

---

## Audit corrections

**Added 2026-08-15, after an adversarial pre-implementation audit of Tasks 6–12 plus a
review of the built Tasks 4–5. Authoritative over the task text above.** Seven defects, two
severe. Five tasks in, every defect found in this plan has been the author's, not an
implementer's, and every one has the same shape: reasoning slightly too fast about
reference composition, with a fixture too symmetric to tell right from wrong.

### A1 (SEVERE, Task 6) — the clone memo key is wrong

`cloneOf` is keyed by **block id**. Isolation is per **chunk cell**. Two painted chunk cells
sharing one block produce one clone and one repoint, so:

- when both map to the same block-cell index, the second `blockCellEdit` **overwrites the
  first on the same slot** at apply time — the second location's paint appears in the first
  location, the first location's paint is destroyed, and a written tile is orphaned;
- when they map to different block-cell indices, the first chunk cell shows *both* edits and
  the second shows neither.

The existing "clones ONCE" test cannot see this: its writes at x=16 and x=24 are both inside
chunk cell 1 (cells are 16px wide).

Key the memo by `c.chunkCellIndex` instead. `blockLinked` already guarantees it is non-null.
Two 8×8 cells of the *same* chunk cell still share one clone, so the existing test stays green
— keep it, and add:

```ts
it('repoints EVERY painted chunk cell of a linked block, not just the first', () => {
  const doc = makeDoc();                       // chunk 0 cells 1..255 all use block 1
  const { provenance } = buildChunkSurface(doc, 0);
  const r = planSurfaceEdit({
    doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
    isEditableTile: allEditable,
    writes: [{ x: 16, y: 0, value: 9 }, { x: 32, y: 0, value: 7 }],  // chunk cells 1 AND 2
  });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.plan.chunkCellEdits.map((e) => e.cellIndex).sort((a, b) => a - b)).toEqual([1, 2]);
  const [a, b] = r.plan.chunkCellEdits;
  expect(a.cell.block).not.toBe(b.cell.block);
  // No two blockCellEdits may collide on one (block, cell) slot — the buggy memo
  // produces exactly such a collision, silently last-write-wins at apply.
  const keys = r.plan.blockCellEdits.map((e) => `${e.blockId}:${e.cellIndex}`);
  expect(new Set(keys).size).toBe(keys.length);
});
```

### A2 (SEVERE, new task) — a claimed "free" tile can be object art

`findFreeSlot` treats a tile as free when `tileUsage(t).cells === 0` and `isEditableTile(t)`.
Neither sees **objects that draw from the level tile pool via mappings** rather than through
blocks — GHZ platforms and collapsing ledges, MZ bricks, and the other `artSource: 'levelArt'`
links. Those tiles are block-unreferenced and not lock-flagged, so the **first Isolate
divergence in GHZ claims one and overwrites platform art, then saves it.** Silent and
permanent.

The injected predicate is the right seam — core stays pure. **This needs its own task before
paint-through is reachable by a user** (see New Task 5c). Do not ship Isolate without it.

Blast radius per zone is UNVERIFIED; the mechanism is code-verified. Task 12's CDP pass in
GHZ would show it instantly: make one Isolate divergence, then look at a platform.

### A3 (HIGH, Task 7) — Link mode drops paint across cells sharing a tile

Each surface cell builds its own `buf` from the **unmodified** pool and pushes its own
`tileWrite`. Two cells drawing the same tile — routine in S1 — produce two writes for that
tile, and Task 8 applies them in order, so the earlier stroke is silently discarded.

In link mode accumulate per **tile**, not per cell: a `Map<number, PixelBuffer>` keyed by tile
index, lazily seeded from `tileToBuffer`, every cell's pixels applied into the shared buffer,
one `tileWrite` emitted per entry after the loop.

Test: link mode with writes at `{x:16,y:0,value:9}` and `{x:33,y:0,value:7}` (chunk cells 1
and 2, both drawing tile 5) → exactly one `tileWrite` for tile 5, with
`data[0] === (9 << 4) | 7`. Asymmetric values, so an overwrite is visible.

### A4 (HIGH, built code) — a no-op stroke commits

Demonstrated in both branches: repainting a pixel with the value it already holds pushes a
`tileWrite` of identical bytes, and in the divergence branch `findContentMatch` matches the
original tile *against itself* and emits a repoint to where the cell already points. Either
way: a dirty document and an undo entry for nothing.

`src/core/art/classic-tile-gesture.ts` already states **"RULE 3 — a gesture that changed
nothing commits nothing"**, built on `tileBytesIfChanged`. This resolver breaks a convention
living one file away.

Fix in `planSurfaceEdit`: hoist `wantBytes` above the mode split and `continue` when
`bytesEqualAt(doc.tiles, e.tileIndex, wantBytes)` — one check covering all three branches,
since in every case the question is "would this cell end up showing the bytes it already
shows".

### A5 (MEDIUM, Task 6) — no block-capacity refusal

Cloning can push the pool past 1024 (the chunk cell's block field is 10 bits). Tile
exhaustion refuses with an actionable message; block exhaustion currently surfaces only as
raw `structuralError` text at apply. Atomic, but late and inconsistent — and Task 11 would
toast it verbatim. Add, in the clone branch:

```ts
if (nextBlockId() > 0x3ff) {
  return { ok: false, reason: 'no free block slot to hold the divergent copy — this zone is at its block limit (1024). Switch to Link mode to edit every place at once.' };
}
```

### A6 (LOW-MEDIUM, Tasks 5/6) — content match can hit a slot already claimed

`findContentMatch` scans the stale pool and does not exclude slots `claimed` earlier in the
same gesture. Cell A claims slot 9 and schedules new bytes; if cell B's wanted bytes equal
slot 9's *old* content, B matches slot 9 and renders A's paint. Also mints duplicates when
two cells diverge to identical content. Pass `claimed` in and skip its members.

### A7 (LOW, Task 7) — placesAffected is dishonest on a block surface, and mislabelled

On a block surface `provenance.chunkIndex` is null, so Isolate reports 0 even when the block
sits in N chunks; use `index.blockUsage(blockId).containers` there. And the number counts
distinct chunk **definitions**, not layout placements — a chunk stamped 40 times counts once.
The arithmetic is right and no id-spaces are mixed (the set holds file indices throughout),
but **the UI label must say "chunks", not "places"**. Task 11's copy depends on this.

### A8 (Task 10) — "Make unique" has nothing to call

The clone path exists only inside `planSurfaceEdit` and only fires when there are pixel
writes; an empty `writes` array short-circuits to an empty plan. Either specify a write-less
entry point (`planMakeUnique(provenance, cellIndex)` returning the same `SurfaceEditPlan`
shape, applied through `classicPaintSurface`) or descope the button. **Decide before Task 10
starts** rather than discovering it mid-task.

### A9 (Task 12) — the CDP assertions would not catch A1

"Painting on a linked block leaves the other chunk unchanged" paints one chunk cell. Add: one
drag across **two** chunk cells of the same linked block → each shows its own paint, and the
sibling chunk is unchanged.

### Checked and explicitly cleared

Not skipped — examined and believed correct: Task 6's `nextBlockId` plan/apply agreement
(ids are computed pre-push and Task 8 pushes before validating, so they line up); the cascade
surviving Task 6's edit (the built branch fires on `tileLinked || blockLinked` and always
diverges the tile, so a clone never shares the original's tiles); `srcCell` being read from
the original block even when the edit targets the clone (byte-identical, order-independent);
Task 8's single-undo contract, validation atomicity, dirty domains, version effect, and
file-order `chunkIndex` handling; Task 7's `chunksTouchedByTile` reachability walk; and Task
11's `diffWrites` → `SurfaceWrite` shape match.

### New Task 5b — fix the built resolver (A4, A6)

Do before Task 6. Hoist `wantBytes`, add the no-op guard, pass `claimed` into
`findContentMatch`. Tests: a no-op stroke yields an empty plan in all three modes; the A6
stale-match scenario. Falsify each.

### New Task 5c — make the claimability predicate object-aware (A2)

Do before any UI can reach Isolate. Compose the injected `isEditableTile` so it also excludes
tiles reachable from this act's `levelArt` object art. `objectArtTiles`
(`src/core/level-classic/object-sprite.ts`) and the act's object list are the inputs; a
tile→object reverse index alongside `buildUsageIndex` is the likely shape. Core stays pure —
the composition happens at the injection site. Test at the seam (a predicate excluding tile 9
forces `findFreeSlot` to 10) **and** with a real GHZ act, asserting a known object-art tile is
excluded.

---

## Task 5c — object-aware tile claimability, in detail

**Designed 2026-08-15. Supersedes the stub in Audit corrections A2/New Task 5c.** Gates every
UI task: nothing may reach Isolate before T1–T5 land.

### The rule

Reserve, per open act, every level-pool tile index any level-art-drawn object sprite can read.
**Reserved tiles stay editable in place** — painting GHZ platform art is a feature, and the
sprite updates live through `tileEpoch` — so this must NOT be folded into `tileLockReason`. It
is a third, additive rule: **never claim a reserved slot, and always diverge away from one.**

For `(zone, act)` with pool size `poolTileCount`, the union over reservation requests
`{mapAsm, tileBase, frames?}` of:

```
{ tileBase + piece.tile + k
  | frame ∈ (frames ?? all frames of parseAsmMappings(mapAsm)),
    piece ∈ frame.pieces,
    k ∈ [0, piece.widthCells * piece.heightCells) }  ∩  [0, poolTileCount)
```

The request list is **zone-static** — not placement-, subtype-, or preview-frame-dependent.

- **Derived:** for each `id ∈ linkedObjectIds(zone)` whose `resolveObjectArt(id, zone).artSource`
  is `'levelArt'`, one request with `tileBase = -(link.tileIndexOffset ?? 0)`. Today: ghz
  Platforms + Collapsing Ledge; mz Large Grassy Platforms + Bricks; syz Light, Platforms,
  Floating Blocks and Doors; slz those plus Elevators, Circling Platform, Staircase; lz and sbz
  none derived.
- **Supplemental** — engine truth Aurora's table cannot see, found by grepping `ArtTile_Level`
  across `s1disasm/_incObj`:
  - **syz**: `_maps/SYZ Boss Blocks.asm`, base 0. Object `$76` is **spawned by boss `$75`**, never
    in `objpos`, unlinked in Aurora — the concrete proof a placement-derived set is wrong.
  - **lz (all acts) and sbz act 3**: `_maps/SBZ Stomper and Door.asm`, base `0x1F0`, frame 0.
    **SBZ3 borrows LZ's tile/block/chunk files**, so editing LZ can corrupt SBZ3's door.

Why zone-static holds: subtype rules only change which *frames* draw — none swaps a levelArt
link's `mapAsm` or `artSource`. Taking all frames removes subtype from the question entirely,
and is required anyway because the ROM animates frames Aurora never previews.

### Measured, real s1disasm

GHZ act 1: pool 965, reserved **158** tiles (0x3B..0xE4), **119** of them currently claimable.
Claimable slots fall **136 → 17**. Other zones: mz 86, syz 120, slz 79, lz/sbz 0 plus the
15-tile SBZ3 door run at 0x39F..0x3AD.

**The earlier framing was wrong in a way that matters:** the first four claims land on genuinely
free slots and **the fifth** hits object art — so casual testing looks fine.

### Two questions that were open, now answered

- **The `tileIndexOffset` bug does not infect this.** That drop is in `openDiscoveredSet`, the
  Sprite-mode path; this builds from `resolveObjectArt` + `objectArtTiles`, which apply the
  offset correctly. And every offsetted object (`$32`, `$61`) is `artSource: 'file'`, so its
  tiles are not in the level pool at all. Keep `tileBase` in the request shape anyway, so a
  future offsetted levelArt link stays correct and SBZ3's `+0x1F0` has somewhere to live.
- **Cross-act via blocks is impossible; via objects it is real.** `tileToBlocks`/`blockToChunks`
  come from files shared by every act of a zone, so "unused in act 1, used in act 2" cannot
  happen through blocks. The real channel is per-act objects reading the shared pool through
  mappings — hence the SBZ3 entry in **lz's** reservations.

### Where it lives, and why

Computing the set **requires reading the zone's `_maps/*.asm` files** — mappings are the only
source of which pool indices are read, and Aurora stores paths, not ranges. That decides it:
core cannot do IO, and putting it in the renderer would strand S1 engine knowledge outside the
node suite. So it splits along the existing `editableTileRange` seam:

- **Pure core** — request derivation and set computation from *passed-in* mapping texts.
- **IO in the s1 adapter** — read the ≤6 mapping texts during `levels.read()`, where `fa` is
  already in scope, cache beside the editable-range bookkeeping, expose as an optional sync
  `reservedTiles?(ref)` exactly like `editableTileRange`.
- **Renderer** only threads it into `planSurfaceEdit`'s input.

A missing mappings file contributes nothing (permissive, matching the `editableTileRange` null
convention).

### Tasks

**T1 — core module** `src/core/project/profiles/s1-levelart-reservations.ts`:

```ts
export interface LevelArtReservationRequest {
  mapAsm: string;             // disasm-relative mappings path
  tileBase: number;           // pool index of mappings tile 0 (engine base − tileIndexOffset)
  frames?: readonly number[]; // restrict; undefined = all frames
  ids: readonly number[];     // contributing object ids, for messaging and tests
}
export function levelArtReservationRequests(zone: string, act: number): LevelArtReservationRequest[];
export function buildReservedTileSet(
  requests: readonly LevelArtReservationRequest[],
  mapTextByPath: ReadonlyMap<string, string>,
  poolTileCount: number,
): { tiles: ReadonlySet<number>; byTile: ReadonlyMap<number, readonly number[]> };
```

Tests with synthetic mappings text: multi-frame, multi-cell pieces, `tileBase` shift, pool
clamp, `frames` filter, `byTile` attribution; plus a table test pinning each zone's expected
request paths and the lz/sbz-act-3 door entry.

**T2 — the plan honours reservations.** Add `reservedTiles?: ReadonlySet<number>` to
`PlanInput` (default empty). Two changes: `findFreeSlot` skips reserved slots; and
`tileLinked` becomes `index.tileUsage(e.tileIndex).cells > 1 || reserved.has(e.tileIndex)`, so
isolate diverges away from a reserved tile rather than repainting the object in place. Link
mode is deliberately unchanged — edit-everywhere includes the sprite, which is what link means.
`findContentMatch` may still repoint *to* a reserved tile: byte-identical, corrupts nothing,
conserves scarce slots. Tests: reserved zero-usage slot skipped; reserved used-once tile
diverges instead of writing in place; **negative control** — the same fixture without
`reservedTiles` claims the reserved slot.

**T3 — adapter surface.** Optional `reservedTiles?(ref): ReadonlySet<number> | null` on
`ClassicLevelAccess` (null = unknown = permissive; semantics are "never claim / always diverge",
NOT "not editable"). `s1/index.ts` `read()` fetches the mapping texts tolerantly, builds the
set, stashes it in `readStates`.

**T4 — store threading.** Capture at act read beside `editableTileRange`; pass into
`planSurfaceEdit`. Merges with the Task 11 wiring if they land together.

**T5 — real-act regression test** — the one that would have caught this. Follow the
`S1_PRESENT`-skip pattern in `src/core/project/__tests__/editable-tiles.test.ts`. Open GHZ 1;
assert the reserved set covers the platform run {0x3B..0x4A} and has ≥150 entries; drive
`planSurfaceEdit` with **six** forced divergences and assert no `tileWrite` index is reserved;
then the planted violation — the same six with `reservedTiles` omitted claims 0x3B. Also assert
lz act 1 and sbz act 3 both cover {0x39F..0x3AD}.

**T6 — rule-invariant lock.** For every zone × rule object id × all 256 subtypes,
`resolveEffectiveObjectArt(...).link.artSource` equals the base link's, and every levelArt
effective link's `mapAsm` is in that zone's request paths with zero offset. This is what keeps
the zone-static set sound when someone adds a subtype rule later.

### Consequences to design for

- **Slot scarcity is the next cliff.** 17 claimable slots in GHZ. The refusal message should
  state remaining capacity, and content-match dedup becomes load-bearing rather than an
  optimisation.
- **"0 blocks" currently reads as "unused"** in the composer tile strip, which invites manual
  repurposing of object art. The `byTile` map gives object ids for a "drawn by GHZ Platform"
  badge. Separate small task, but it is the same misunderstanding at the UI layer.
- Verified and recorded so nobody re-audits: MZ `$45` and SBZ `$66` are file-backed, no
  reservation needed; `$1D` and MZ `$35` need none either.

---

## A8 resolved — "Make unique" is descoped

**Decided 2026-08-15.** Do not build `planMakeUnique`. Task 10 becomes copy and styling only.

Three reasons, the second of which is the one that settles it:

1. **The banner has no instance to detach.** Every composer tab selects a resource by ID — the
   shared source itself. `BlockTab` shows "used in 31 chunk cells" but holds no selected chunk
   cell; `TileTab` holds no selected block cell. A Make-unique click there cannot know which of
   the 31 uses to repoint. The only thing it could mean from a source editor is "copy to a new
   id and select the copy" — which already exists on the Block and Chunk banners, correctly
   named **Duplicate**.
2. **A write-less divergence is unstable in a content-deduplicating pool.** `findContentMatch`
   repoints to any byte-identical tile before claiming a slot. A write-less copy is byte-
   identical by definition, so it would have to BYPASS dedup — and then any later Isolate stroke
   whose result matches those bytes content-matches onto the user's "unique" copy, silently
   re-linking the thing they spent a scarce slot to detach. Uniqueness of identical bytes is not
   a stable property here; the gesture cannot deliver what its name promises.
3. **It spends a scarce or nonexistent resource for zero visible change.** LZ is 454/454 — the
   button could never work there. GHZ has 17 claimable slots after reservations. Meanwhile
   63–65% of tiles are used once, so most edits never diverge, and Isolate handles the rest at
   the moment it actually matters, with dedup working *for* the user.

### Task 10, revised

Copy, per spec §1 vocabulary (linked/unique, never shared/forked):

- **TileTab:** `Linked — used in 14 blocks · 31 cells. Edits appear in all of them.` No button.
  Once Task 11 lands, append the discovery breadcrumb: `To change one place only, paint it on
  the Chunk tab (Isolate).`
- **BlockTab:** `Linked — used in 12 chunks · 31 cells. Edits appear in all of them.` Keep
  **Duplicate** — it is a copy, not a detach, and the label should keep saying so.
- **ChunkTab:** `Linked — placed 40×. Edits appear in every placement.` Keep **Duplicate chunk**.

Styling: drop the ⚠ glyph and amber hazard tint; neutral status strip. The spec's "same facts,
stated as a tool" needs the visual reframe, not just new words. **The red locked-tile banner in
TileTab is a genuine refusal and keeps its hazard styling.**

No new commands, no `planSurfaceEdit` change, no undo implications. Keep the guard test (the
banner renders the numbers it is given), planted first.

### The follow-up this leaves open

**Instance-anchored block detach**, if demand ever appears: right-click a cell in ChunkTab's
assignment grid → "Make block unique in this cell". Clones the block (plentiful slots),
repoints that one chunk cell, claims **zero tiles** — the clone shares tiles and later Isolate
paint diverges them on demand, which the two-tier cascade already handles. Fits
`SurfaceEditPlan` as `newBlocks` + `chunkCellEdits` with no `tileWrites`, commits through
`classicPaintSurface` as one undo entry, lives on the instance, targets the measured dangerous
tier. **Not now** — it duplicates what Isolate delivers implicitly. Build it only if Task 12 or
real use shows people hunting for an explicit detach.
