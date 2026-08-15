# Art authoring, phase 2B — constraints made visible

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The origination canvas tells the artist, live, what the Genesis will and will not accept from the drawing in front of them — per-8×8 palette-line clashes as an overlay, colour and unique-tile counts as readouts, the ceiling stated before the drawing is finished rather than at commit.

**Architecture:** One pure core evaluator (`canvas-constraints.ts`) over `{pixels, profile, gridOrigin}` — no palette, no store, no React — behind a single-entry cache so the readouts and the overlay share one scan per gesture. The renderer adds two consumers (a status readout, a `drawOverlay` tint) and one budget hook that reads the open act's free slots through a function extracted from the two classic tabs that already compute it.

**Tech Stack:** TypeScript, React, zustand, vitest. No new dependencies.

**STATUS: COMPLETE.** All 11 tasks landed on `feature/canvas-phase2b`. Suite **2805 passed / 3
skipped** (2738 at the branch point), `tsc --noEmit` and `electron-vite build` clean. CDP evidence:
`docs/superpowers/plans/2026-08-15-constraints-cdp-report.md` — 30 checks, 30 pass, against real
s1disasm data, with a planted-bug pass that fails exactly the check it should. **Read
`## Review corrections` below before treating any task text above as current.**

---

## Context an implementer needs before task 1

**Read first:**
- `docs/superpowers/specs/2026-08-15-in-app-art-authoring-design.md` §4.2 (the profile table) and §4.3 (how violations surface). §4.4 is **2C**, not this plan.
- `src/core/art/canvas-doc.ts` — the whole header. The pixel encoding `(line << 4) | entry` and the reason a document holds one spelling per colour is load-bearing for every rule below.
- `docs/superpowers/plans/2026-08-15-art-authoring-phase2a-canvas-document.md` `## Review corrections` R17–R22 — the deferrals this plan inherits.

**Decisions taken before this plan was written** (owner-confirmed 2026-08-15):

1. **The tile readout's denominator is the currently-open act, live**, plus the pool total, falling back to a bare unique count when no level is open. No new persisted state, no commit-target picker (that is 2C's).
2. **`spriteLimits` evaluates only what one indexed image can know** — the 4×4-tile frame bound, as a readout. Per-scanline and per-frame limits need mappings and belong to sprite commit. **This is a deliberate departure from the profile table's "Evaluated in 2B" comment**, recorded in task 4 and in `canvas-profiles.ts` itself.

**Decisions taken by the implementer of this plan, stated so they are not re-litigated:**

3. **Unique-tile counting is entry-only, not index-only.** A Genesis tile stores 4-bit *entries*; the palette line comes from the block/sprite attribute, not from the tile. Two cells with identical entry patterns and different lines are the **same tile**, reusable under a different attribute. Counting whole canvas indices would over-count — plausibly, silently, and in the direction that makes the budget look worse than it is. See task 3.
4. **The clash rule and the tile count are orthogonal.** A clashing cell still has entries and still counts as a tile. Reporting them as one number would conflate a structural violation with a scalar budget, which §4.3 explicitly separates.
5. **The palette is not an input.** Every rule here is about lines and entries, not about colour values. Recolouring must not re-scan a million pixels.
6. **`constraintsLive` is view state.** Persistent "unconstrained" already has a spelling — the `none` profile. A persisted toggle would give the document two ways to say the same thing and let them disagree.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `src/renderer/shell/tab-activation/level.ts` | Classic level activation (planner + glue) |
| `src/renderer/shell/tab-activation/sprite.ts` | Sprite-doc activation + close confirm |
| `src/renderer/shell/tab-activation/canvas.ts` | Canvas-doc activation + close confirm |
| `src/renderer/shell/tab-activation/dispatch.ts` | `requestOpenTab` / `requestFocusTabId` / `requestCloseTab` / `requestFocusIndex` / stack disposal |
| `src/core/art/canvas-constraints.ts` | The pure evaluator — cells, clashes, colours per line, flip-aware tiles |
| `src/core/art/free-tile-slots.ts` | `countFreeTileSlots` — the free-slot count the two classic tabs each carry today |
| `src/renderer/state/canvas-constraints-cache.ts` | Single-entry cache so two consumers share one scan |
| `src/renderer/components/canvas/use-canvas-constraints.ts` | The hook both consumers call; also `useCanvasTileBudget` |

**Modified:**

| File | Change |
|---|---|
| `src/renderer/shell/tab-activation.ts` | Becomes the index: header + re-exports only |
| `src/core/art/canvas-profiles.ts` | The `spriteLimits` doc comment tells the truth about what 2B evaluates |
| `src/renderer/state/canvasStore.ts` | `constraintsLive`, `showClashOverlay` view state + setters |
| `src/renderer/components/canvas/CanvasMode.tsx` | Constraint readouts, the two toggles |
| `src/renderer/components/canvas/CanvasHost.tsx` | `drawOverlay` clash tint |
| `src/renderer/components/classic/BlockTab.tsx` | Calls `countFreeTileSlots` instead of its own loop |
| `src/renderer/components/classic/ChunkTab.tsx` | Calls `countFreeTileSlots` instead of its own loop |

---

### Task 1: Split `tab-activation.ts` per kind (R19)

946 lines, four responsibilities, 27 activation tests on top of it. **No behaviour change, no signature change, no test change** — if a test file needs editing, the split went wrong. The current path stays as the index so every import site in the app keeps working untouched.

**Files:**
- Create: `src/renderer/shell/tab-activation/level.ts`, `sprite.ts`, `canvas.ts`, `dispatch.ts`
- Modify: `src/renderer/shell/tab-activation.ts` (down to header + re-exports)
- Test: `src/renderer/shell/__tests__/tab-activation.test.ts` (unchanged — it is the oracle)

**The seams** are already marked in the file: `// --- Sprite-doc activation ---` (line 106), `// --- Canvas-doc activation ---` (line 302), and the level block starting at `classicOpenAct` (line 602). `requestOpenTab` (764) onward is dispatch.

- [ ] **Step 1: Record the baseline the split must not move**

```bash
npx vitest run src/renderer/shell/__tests__ 2>&1 | tail -5
```

Write the pass/fail counts down. Every later step compares against these exact numbers.

- [ ] **Step 2: Move the level block**

`level.ts` takes: `Saver`/`saveImpl`/`__setActivationSaveForTest`/`__resetActivationSaveForTest`/`isSaveSuccess`, `ActivationPlan`, `planLevelActivation`, `classicOpenAct`, `activateLevelTarget`.

The two test seams keep their module-level `saveImpl` **in this file** — `activateLevelTarget` is the only reader, so the mutable binding and its one consumer stay together. Re-exporting the setters from the index is enough for the tests, because a re-export shares the module instance rather than copying the value.

- [ ] **Step 3: Move the sprite block**

`sprite.ts` takes: `getLoadedSpriteDocId`, `anySpriteDocDirty`, `closeAllSpriteDocs`, `SpriteDocPlan`, `planSpriteDocActivation`, `SpriteModule`/`__setSpriteModuleForTest`/`spriteModule`, `activateSpriteDocTarget`, `runSpriteActivation`, `confirmCloseSpriteDoc`.

`confirmCloseSpriteDoc` currently sits down among the dispatch helpers (line 821). It moves here — it is sprite policy, and the only caller is `requestCloseTab`, which will import it.

- [ ] **Step 4: Move the canvas block**

`canvas.ts` takes: `CanvasDocPlan`, `planCanvasDocActivation`, `CanvasLoader`/`defaultCanvasLoader`, `reportCanvasWarnings`, `activateCanvasDocTarget`, `activateRestoredCanvasDocTarget`, `runCanvasActivation`, `focusCanvasForTab`, `confirmCloseCanvasDoc`.

- [ ] **Step 5: Move dispatch**

`dispatch.ts` takes: `requestOpenTab`, `requestFocusTabId`, `disposeStacksForClosedTab`, `requestCloseTab`, `requestFocusIndex`. It imports from the three modules above; nothing imports *from* it except the index. That direction is the whole point of the split — the three kind modules must not know about each other.

- [ ] **Step 6: Reduce the index to a header and re-exports**

`tab-activation.ts` keeps its existing four-paragraph header (it describes the system, not any one kind) plus a new sentence naming where each part now lives, then:

```ts
export * from './tab-activation/level';
export * from './tab-activation/sprite';
export * from './tab-activation/canvas';
export * from './tab-activation/dispatch';
```

- [ ] **Step 7: Verify nothing moved**

```bash
npx tsc --noEmit && npx vitest run src/renderer/shell/__tests__ 2>&1 | tail -5
```

Expected: tsc clean; the counts from step 1, identical.

- [ ] **Step 8: Falsify the split** — the guard step this repo's standing lesson demands

Break one moved function on purpose (e.g. make `planCanvasDocActivation` return the wrong variant), re-run, watch the activation tests fail, revert. A split that no test can detect is a split whose tests were not exercising the moved code.

- [ ] **Step 9: Full suite, then commit**

```bash
npx vitest run 2>&1 | tail -5
git add -A && git commit -m "refactor(shell): split tab-activation per kind (R19)"
```

---

### Task 2: The cell grid and the palette-line clash rule

**Files:**
- Create: `src/core/art/canvas-constraints.ts`
- Test: `src/core/art/__tests__/canvas-constraints.test.ts`

The grid the profile draws and the grid the rule evaluates **must be the same grid**, offset by the document's `gridOrigin` — that is why the origin was made an undoable edit in 2A (R13). A cell is 8×8 because a Genesis tile is 8×8; the 16 and 256 pitches are guides, not rules.

**Partial cells are evaluated for clashes and excluded from tile counting.** A cell clipped by a non-zero origin or a ragged canvas edge still has pixels that will land in *some* tile once the art is placed, so a clash there is real; but it cannot itself become a tile, so counting it would invent budget that does not exist. Task 3 reports the pixels in that band rather than rounding either way.

- [ ] **Step 1: Write the failing tests**

```ts
// src/core/art/__tests__/canvas-constraints.test.ts
import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { canvasIndex } from '../canvas-doc';
import { canvasCells, findCellClashes } from '../canvas-constraints';

/** A buffer with `fn(x, y)` at every pixel — the fixtures below are all one-liners over it. */
function buf(w: number, h: number, fn: (x: number, y: number) => number) {
  const b = createBuffer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data[y * w + x] = fn(x, y);
  return b;
}

describe('canvasCells', () => {
  it('covers an aligned canvas in whole cells', () => {
    const cells = canvasCells(16, 8, { originX: 0, originY: 0 });
    expect(cells).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true },
      { x: 8, y: 0, w: 8, h: 8, full: true },
    ]);
  });

  it('emits the leading partial band a non-zero origin creates', () => {
    const cells = canvasCells(16, 8, { originX: 3, originY: 0 });
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 3, h: 8, full: false });
    expect(cells[1]).toEqual({ x: 3, y: 0, w: 8, h: 8, full: true });
    expect(cells[2]).toEqual({ x: 11, y: 0, w: 5, h: 8, full: false });
  });

  it('treats an origin of 8 as an origin of 0 — the grid repeats every 8px', () => {
    expect(canvasCells(16, 8, { originX: 8, originY: 0 }))
      .toEqual(canvasCells(16, 8, { originX: 0, originY: 0 }));
  });

  it('folds a negative origin into the same 0..7 phase', () => {
    expect(canvasCells(16, 8, { originX: -3, originY: 0 }))
      .toEqual(canvasCells(16, 8, { originX: 5, originY: 0 }));
  });

  it('covers every pixel exactly once', () => {
    const seen = new Uint8Array(23 * 19);
    for (const c of canvasCells(23, 19, { originX: 4, originY: 6 })) {
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) seen[y * 23 + x]++;
    }
    expect(Array.from(seen).every((n) => n === 1)).toBe(true);
  });
});

describe('findCellClashes', () => {
  it('finds nothing when every cell draws from one line', () => {
    const b = buf(16, 8, (x) => canvasIndex(x < 8 ? 0 : 1, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([]);
  });

  it('reports a cell whose pixels come from two lines', () => {
    const b = buf(8, 8, (x) => canvasIndex(x === 0 ? 2 : 0, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true, kind: 'multi-line', lines: [0, 2] },
    ]);
  });

  // THE ONE THIS RULE EXISTS TO GET RIGHT. Transparent pixels have no line —
  // canvasIndex folds 16/32/48 to 0 — so a cell of line-3 art on transparency
  // is legal. Reading the raw high nibble instead would call this a clash
  // between "line 0" and line 3, and flag every sprite ever drawn.
  it('does not count transparent pixels as a line', () => {
    const b = buf(8, 8, (x) => (x < 4 ? 0 : canvasIndex(3, 7)));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 4)).toEqual([]);
  });

  it('flags a line the profile does not have, even alone in its cell', () => {
    const b = buf(8, 8, () => canvasIndex(2, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 1)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, full: true, kind: 'line-out-of-range', lines: [2] },
    ]);
  });

  it('evaluates a partial cell — a clash in the offset band is still a clash', () => {
    const b = buf(16, 8, (x) => canvasIndex(x === 0 ? 1 : 0, 5));
    const clashes = findCellClashes(b, { originX: 3, originY: 0 }, 4);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]).toMatchObject({ x: 0, w: 3, full: false, kind: 'multi-line' });
  });

  it('reports multi-line ahead of out-of-range when a cell is both', () => {
    const b = buf(8, 8, (x) => canvasIndex(x === 0 ? 3 : 0, 5));
    expect(findCellClashes(b, { originX: 0, originY: 0 }, 1)[0])
      .toMatchObject({ kind: 'multi-line', lines: [0, 3] });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts
```

Expected: every test fails on `Failed to resolve import "../canvas-constraints"`.

- [ ] **Step 3: Implement**

```ts
// src/core/art/canvas-constraints.ts
//
// THE RULES, EVALUATED — spec §4.3. Pure: no store, no React, no palette.
//
// The palette is deliberately not an input. Every rule here is about which LINE
// a pixel draws from and which ENTRY it uses, never about what colour that entry
// holds — so recolouring a document cannot change any answer in this file, and
// the cache in canvas-constraints-cache.ts is free to ignore palette identity.
//
// NEVER PREVENT (spec §4.3). Nothing here refuses, clamps or rewrites a pixel.
// It reports; the pane decides how loudly to say so.

import type { PixelBuffer } from './pixel-ops';
import { CANVAS_LINES, paletteEntryOf, paletteLineOf, isTransparent } from './canvas-doc';
import type { CanvasGridOrigin } from './canvas-doc';

/** A Genesis tile is 8x8. The 16 and 256 grids are guides; this one is a rule. */
export const CELL = 8;

export interface CanvasCell {
  x: number; y: number; w: number; h: number;
  /** A full 8x8 cell can become a tile. A clipped one cannot — see the header
   *  of task 2 in the plan, and `pixelsOutsideGrid` in the report. */
  full: boolean;
}

/**
 * Every cell the document's grid cuts it into, row-major, covering each pixel
 * exactly once.
 *
 * The origin is taken MODULO the cell: the grid repeats every 8px, so an origin
 * of 8 and an origin of 0 describe the same grid, and a negative origin folds
 * into the same 0..7 phase rather than shifting the whole plane off the canvas.
 * (`((n % 8) + 8) % 8`, not `n % 8` — JavaScript's `%` keeps the sign of the
 * dividend, so `-3 % 8` is `-3` and a bare remainder would emit cells at
 * negative coordinates.)
 */
export function canvasCells(width: number, height: number, origin: CanvasGridOrigin): CanvasCell[] {
  const phase = (n: number) => ((n % CELL) + CELL) % CELL;
  const bands = (span: number, ph: number): [number, number][] => {
    const out: [number, number][] = [];
    if (ph > 0) out.push([0, Math.min(ph, span)]);
    for (let s = ph; s < span; s += CELL) out.push([s, Math.min(CELL, span - s)]);
    return out;
  };
  const cols = bands(width, phase(origin.originX));
  const rows = bands(height, phase(origin.originY));
  const cells: CanvasCell[] = [];
  for (const [y, h] of rows) {
    for (const [x, w] of cols) {
      cells.push({ x, y, w, h, full: w === CELL && h === CELL });
    }
  }
  return cells;
}

export type CellClashKind = 'multi-line' | 'line-out-of-range';

export interface CanvasCellClash extends CanvasCell {
  kind: CellClashKind;
  /** The lines the cell actually draws from, ascending. */
  lines: number[];
}

/**
 * Cells that violate the per-8x8 palette-line rule, in two flavours:
 *
 *   multi-line        — the cell draws from more than one line. No block or
 *                       sprite attribute can express that; the hardware picks
 *                       ONE line per tile.
 *   line-out-of-range — the cell draws from a line this profile does not have
 *                       (a genesis-sprite canvas has one line, not four).
 *
 * Multi-line wins when a cell is both, because it is the one the artist has to
 * fix by redrawing rather than by re-assigning.
 *
 * TRANSPARENT PIXELS HAVE NO LINE. `canvasIndex` folds every entry-0 spelling
 * to 0 (canvas-doc.ts), so a cell of line-3 art sitting on transparency is
 * legal — and a rule that read the high nibble raw would call that a clash
 * between line 0 and line 3, flagging every sprite ever drawn.
 */
export function findCellClashes(
  pixels: PixelBuffer, origin: CanvasGridOrigin, profileLines: number,
): CanvasCellClash[] {
  const out: CanvasCellClash[] = [];
  for (const cell of canvasCells(pixels.width, pixels.height, origin)) {
    let mask = 0;
    for (let y = cell.y; y < cell.y + cell.h; y++) {
      const row = y * pixels.width;
      for (let x = cell.x; x < cell.x + cell.w; x++) {
        const v = pixels.data[row + x];
        if (isTransparent(v)) continue;
        mask |= 1 << paletteLineOf(v);
      }
    }
    if (mask === 0) continue;
    const lines: number[] = [];
    for (let l = 0; l < CANVAS_LINES; l++) if (mask & (1 << l)) lines.push(l);
    if (lines.length > 1) out.push({ ...cell, kind: 'multi-line', lines });
    else if (lines[0] >= profileLines) out.push({ ...cell, kind: 'line-out-of-range', lines });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts
```

Expected: all pass.

- [ ] **Step 5: Falsify every guard — one plant per rule**

Standing lesson (`aurora-guards-assert-nothing`): a guard nobody has watched fail is not a guard. Make each of these edits, run the file, confirm the *named* test fails, revert.

| Plant | Test that must fail |
|---|---|
| Drop the `isTransparent` skip | `does not count transparent pixels as a line` |
| `n % CELL` instead of the double-mod | `folds a negative origin into the same 0..7 phase` |
| `lines.length >= 1` for multi-line | `finds nothing when every cell draws from one line` |
| Emit only full cells | `evaluates a partial cell` and `covers every pixel exactly once` |
| Check out-of-range before multi-line | `reports multi-line ahead of out-of-range` |

If any plant breaks *nothing*, that is the finding — say so in the commit body rather than recording "falsification performed".

- [ ] **Step 6: Commit**

```bash
git add src/core/art/canvas-constraints.ts src/core/art/__tests__/canvas-constraints.test.ts
git commit -m "feat(canvas): the 8x8 cell grid and the palette-line clash rule"
```

---

### Task 3: Colours per line, and flip-aware unique tiles

**Files:**
- Modify: `src/core/art/canvas-constraints.ts`
- Test: `src/core/art/__tests__/canvas-constraints.test.ts`

**The decision this task turns on, stated once:** unique-tile counting keys on **entries only** (`v & 15`), not on the whole canvas index. A Genesis tile stores 4-bit entries; the palette line lives in the block or sprite attribute that *references* the tile. Two cells with identical entry patterns and different lines are one tile used twice under two attributes — which is exactly how the shipped data is built. Keying on the full index would over-count, and it would over-count in the direction that makes the budget look tighter than it is, so nobody would ever question the number.

Flip equivalence is **x, y, and xy only** — the VDP has an H and a V flip bit and no transpose. Rotations are not tile-equivalent on this hardware and must not be folded in.

- [ ] **Step 1: Write the failing tests**

```ts
// Append to src/core/art/__tests__/canvas-constraints.test.ts
import { colorsPerLine, countUniqueTiles } from '../canvas-constraints';

describe('colorsPerLine', () => {
  it('counts distinct non-transparent entries in each line', () => {
    const b = buf(8, 8, (x, y) => {
      if (y === 0) return canvasIndex(0, 1 + (x % 3)); // line 0: entries 1,2,3
      if (y === 1) return canvasIndex(2, 9);           // line 2: entry 9
      return 0;                                        // transparent
    });
    expect(colorsPerLine(b)).toEqual([3, 0, 1, 0]);
  });

  it('never counts entry 0 — it is transparency, not a colour choice', () => {
    expect(colorsPerLine(buf(8, 8, () => 0))).toEqual([0, 0, 0, 0]);
  });

  it('counts a colour once however many pixels use it', () => {
    expect(colorsPerLine(buf(8, 8, () => canvasIndex(1, 4)))).toEqual([0, 1, 0, 0]);
  });
});

describe('countUniqueTiles', () => {
  const origin = { originX: 0, originY: 0 };

  it('counts identical cells once', () => {
    const b = buf(16, 8, (x, y) => canvasIndex(0, 1 + (y % 2)));
    expect(countUniqueTiles(b, origin)).toMatchObject({ unique: 1, fullCells: 2 });
  });

  // THE ONE THIS FUNCTION EXISTS FOR. Left cell and right cell are mirror
  // images; the VDP draws both from one tile with the H-flip bit set.
  it('counts an x-mirrored pair as one tile', () => {
    const b = buf(16, 8, (x, y) => {
      const lx = x < 8 ? x : 15 - x;             // right half mirrors the left
      return canvasIndex(0, lx < 2 ? 1 + y % 3 : 0);
    });
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('counts a y-mirrored pair as one tile', () => {
    const b = buf(8, 16, (x, y) => {
      const ly = y < 8 ? y : 15 - y;
      return canvasIndex(0, ly < 2 ? 1 + x % 3 : 0);
    });
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('counts an xy-mirrored pair as one tile', () => {
    const src = (x: number, y: number) => canvasIndex(0, (x < 3 && y < 2) ? 1 + x : 0);
    const b = buf(16, 8, (x, y) => (x < 8 ? src(x, y) : src(7 - (x - 8), 7 - y)));
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  // A TRANSPOSE IS NOT A FLIP. The VDP has H and V bits and no diagonal; if
  // this passes as 1, the canonicaliser folded in a rotation the hardware
  // cannot perform, and 2C would emit tiles that draw wrong.
  it('does NOT count a transposed pair as one tile', () => {
    const src = (x: number, y: number) => canvasIndex(0, (x < 3 && y === 0) ? 1 + x : 0);
    const b = buf(16, 8, (x, y) => (x < 8 ? src(x, y) : src(y, x - 8)));
    expect(countUniqueTiles(b, origin).unique).toBe(2);
  });

  // The line lives in the block/sprite attribute, not in the tile.
  it('counts two cells drawn in different lines as ONE tile', () => {
    const b = buf(16, 8, (x, y) => canvasIndex(x < 8 ? 0 : 3, y < 2 ? 5 : 0));
    expect(countUniqueTiles(b, origin).unique).toBe(1);
  });

  it('excludes partial cells and reports their pixels instead', () => {
    const b = buf(12, 8, () => canvasIndex(0, 1));
    expect(countUniqueTiles(b, { originX: 0, originY: 0 }))
      .toEqual({ unique: 1, fullCells: 1, pixelsOutsideGrid: 4 * 8 });
  });

  it('counts the blank tile like any other', () => {
    expect(countUniqueTiles(buf(16, 8, () => 0), origin))
      .toEqual({ unique: 1, fullCells: 2, pixelsOutsideGrid: 0 });
  });
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts
```

Expected: the new tests fail on missing exports; the task-2 tests still pass.

- [ ] **Step 3: Implement**

```ts
// Append to src/core/art/canvas-constraints.ts

/**
 * Distinct non-transparent entries used in each palette line, indexed by line.
 * A line can hold 15 paintable colours (entry 0 is transparency in every line),
 * which is the denominator the readout shows.
 */
export function colorsPerLine(pixels: PixelBuffer): number[] {
  const masks = new Array<number>(CANVAS_LINES).fill(0);
  for (let i = 0; i < pixels.data.length; i++) {
    const v = pixels.data[i];
    if (isTransparent(v)) continue;
    masks[paletteLineOf(v)] |= 1 << paletteEntryOf(v);
  }
  // popcount over 16 bits — the entries are a set, not a running counter, so a
  // colour used a thousand times still counts once.
  return masks.map((m) => { let n = 0; for (let b = 1; b < 16; b++) if (m & (1 << b)) n++; return n; });
}

export interface UniqueTileCount {
  /** Distinct tiles, counting the four flip orientations as one. */
  unique: number;
  /** Full cells scanned — the denominator `unique` came out of. */
  fullCells: number;
  /** Pixels in clipped cells. They cannot become a tile, so they are neither
   *  counted nor silently dropped. */
  pixelsOutsideGrid: number;
}

/**
 * Flip-aware unique 8x8 tile count.
 *
 * KEYED ON ENTRIES, NOT ON CANVAS INDICES. A Genesis tile holds 4-bit entries;
 * which palette LINE those entries resolve against comes from the block or
 * sprite attribute that references the tile, not from the tile itself. So the
 * same shape drawn in line 0 and in line 3 is ONE tile referenced twice — which
 * is how the shipped data is built, heavily. Keying on the full 0..63 index
 * would over-count, and would do it in the direction that makes the budget look
 * tighter, so the number would never look suspicious enough to question.
 *
 * FLIPS ARE X, Y AND XY ONLY. The VDP has an H bit and a V bit. It has no
 * transpose, so a rotated tile is a different tile and folding rotations in here
 * would have 2C emit art that draws wrong.
 *
 * The canonical form is the lexicographically smallest of the four
 * orientations, chosen WITHOUT materialising all four: `pick` walks the 64
 * positions once, keeping the set of orientations still tied for smallest, so
 * the common case (an early byte decides it) costs a handful of comparisons.
 * Only the winner is turned into a string, which is what goes in the Set.
 */
export function countUniqueTiles(pixels: PixelBuffer, origin: CanvasGridOrigin): UniqueTileCount {
  const seen = new Set<string>();
  let fullCells = 0, pixelsOutsideGrid = 0;
  const scratch = new Uint8Array(CELL * CELL);

  for (const cell of canvasCells(pixels.width, pixels.height, origin)) {
    if (!cell.full) { pixelsOutsideGrid += cell.w * cell.h; continue; }
    fullCells++;

    // Orientation as two bits — bit 0 flips x, bit 1 flips y — rather than four
    // closures returning [sx, sy]. This runs up to 64 x 4 times per cell and
    // 16 384 cells fit in a max-size canvas, so a two-element array per read
    // would be four million allocations per scan.
    const at = (o: number, i: number): number => {
      const cx = i % CELL, cy = (i / CELL) | 0;
      const sx = (o & 1) ? CELL - 1 - cx : cx;
      const sy = (o & 2) ? CELL - 1 - cy : cy;
      return paletteEntryOf(pixels.data[(cell.y + sy) * pixels.width + (cell.x + sx)]);
    };

    let tied = [0, 1, 2, 3];
    for (let i = 0; i < CELL * CELL && tied.length > 1; i++) {
      let min = 16;
      for (const o of tied) { const v = at(o, i); if (v < min) min = v; }
      tied = tied.filter((o) => at(o, i) === min);
    }
    for (let i = 0; i < CELL * CELL; i++) scratch[i] = at(tied[0], i);
    seen.add(String.fromCharCode(...scratch));
  }
  return { unique: seen.size, fullCells, pixelsOutsideGrid };
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts
```

Expected: all pass.

- [ ] **Step 5: Falsify**

| Plant | Test that must fail |
|---|---|
| Key on `pixels.data[...]` instead of `paletteEntryOf(...)` | `counts two cells drawn in different lines as ONE tile` |
| Add a transpose orientation `(x, y) => [y, x]` | `does NOT count a transposed pair as one tile` |
| Use only orientation 0 | all three mirror tests |
| Count partial cells as full | `excludes partial cells and reports their pixels instead` |
| Skip the `isTransparent` guard in `colorsPerLine` | `never counts entry 0` |

- [ ] **Step 6: Check the cost against the real ceiling**

The scan runs once per gesture on a buffer up to 1024×1024 (16 384 cells). Measure it rather than assuming:

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts -t 'cost'
```

Add this test to the file first:

```ts
it('cost: a full 1024x1024 scan stays under 150ms', () => {
  const b = buf(1024, 1024, (x, y) => canvasIndex((x >> 8) & 3, (x + y) & 15));
  const t0 = performance.now();
  countUniqueTiles(b, { originX: 0, originY: 0 });
  colorsPerLine(b);
  findCellClashes(b, { originX: 0, originY: 0 }, 4);
  expect(performance.now() - t0).toBeLessThan(150);
});
```

150ms is the ceiling at which a per-gesture scan stops being invisible, not a target. If it fails, do **not** reach for incremental invalidation yet — the interface is pure and a dirty-rect pass can land behind it later. Record the measured number in the commit body either way; task 11's CDP pass will confirm whether it is felt.

- [ ] **Step 7: Commit**

```bash
git add src/core/art/canvas-constraints.ts src/core/art/__tests__/canvas-constraints.test.ts
git commit -m "feat(canvas): colours per line, and flip-aware unique tile counting"
```

---

### Task 4: The one entry point, and the sprite frame bound

**Files:**
- Modify: `src/core/art/canvas-constraints.ts`, `src/core/art/canvas-profiles.ts`
- Test: `src/core/art/__tests__/canvas-constraints.test.ts`

Profile gating lives **here**, in one function, not spread across the consumers — a pane that decides for itself whether `cellPaletteRule` applies is a second answer to a question the profile already answers.

**The spriteLimits departure, recorded:** the profile table says the sprite limits are evaluated in 2B. Only the 4×4-tile frame bound is knowable from one indexed image; 20-sprites-and-320px-per-scanline is a property of an assembled frame with mappings, which arrives with sprite commit. So this reports the canvas's size in tiles against the 4×4 bound as a **readout** (spec §4.3's scalar class) and evaluates nothing else sprite-shaped. It is a readout rather than a violation because a canvas is a legitimate place to draw a whole sheet of frames, and a rule that flags every sheet is a rule the artist turns off.

- [ ] **Step 1: Write the failing tests**

```ts
// Append to src/core/art/__tests__/canvas-constraints.test.ts
import { evaluateCanvasConstraints } from '../canvas-constraints';
import { constraintProfile } from '../canvas-profiles';

describe('evaluateCanvasConstraints', () => {
  const origin = { originX: 0, originY: 0 };
  const clashing = () => buf(8, 8, (x) => canvasIndex(x === 0 ? 2 : 0, 5));

  it('reports clashes when the profile has the cell rule on', () => {
    const r = evaluateCanvasConstraints({
      pixels: clashing(), profile: constraintProfile('genesis-level-art'), origin,
    });
    expect(r.clashes).toHaveLength(1);
  });

  it('reports no clashes when the profile has the cell rule off', () => {
    const r = evaluateCanvasConstraints({
      pixels: clashing(), profile: constraintProfile('genesis-unrestricted'), origin,
    });
    expect(r.clashes).toEqual([]);
  });

  // Counting is INFORMATION, not a check — it survives a profile that checks
  // nothing, because "how many tiles is this" is a fair question to ask of any
  // drawing.
  it('still counts tiles and colours under the `none` profile', () => {
    const r = evaluateCanvasConstraints({
      pixels: clashing(), profile: constraintProfile('none'), origin,
    });
    expect(r.tiles.unique).toBe(1);
    expect(r.colorsPerLine).toEqual([1, 0, 1, 0]);
  });

  it('passes the profile line count through to the out-of-range rule', () => {
    const r = evaluateCanvasConstraints({
      pixels: buf(8, 8, () => canvasIndex(2, 5)),
      profile: constraintProfile('genesis-sprite'), origin,
    });
    expect(r.clashes[0]).toMatchObject({ kind: 'line-out-of-range' });
  });

  it('sizes the frame in tiles, flagging past 4x4 only for a sprite profile', () => {
    const big = buf(48, 16, () => canvasIndex(0, 1));
    expect(evaluateCanvasConstraints({ pixels: big, profile: constraintProfile('genesis-sprite'), origin }).frame)
      .toEqual({ tilesWide: 6, tilesHigh: 2, maxTiles: 4, overBound: true });
    expect(evaluateCanvasConstraints({ pixels: big, profile: constraintProfile('genesis-level-art'), origin }).frame)
      .toBeNull();
  });

  it('rounds a ragged canvas UP when sizing the frame — a part-tile still costs a tile', () => {
    const r = evaluateCanvasConstraints({
      pixels: buf(20, 8, () => canvasIndex(0, 1)), profile: constraintProfile('genesis-sprite'), origin,
    });
    expect(r.frame).toMatchObject({ tilesWide: 3, tilesHigh: 1 });
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
npx vitest run src/core/art/__tests__/canvas-constraints.test.ts
```

- [ ] **Step 3: Implement**

```ts
// Append to src/core/art/canvas-constraints.ts
import type { ConstraintProfile } from './canvas-profiles';

export interface CanvasFrameSize {
  tilesWide: number; tilesHigh: number;
  /** The sprite hardware's per-frame bound, in tiles on a side. */
  maxTiles: number;
  overBound: boolean;
}

export interface CanvasConstraintReport {
  /** Empty when the profile's cell rule is off — NOT "unknown". */
  clashes: CanvasCellClash[];
  colorsPerLine: number[];
  /** Paintable entries per line — the readout's denominator. Entry 0 is
   *  transparency in every line, so it is 15 rather than lineLength. */
  colorsPerLineMax: number;
  tiles: UniqueTileCount;
  /** Null unless the profile carries sprite limits. */
  frame: CanvasFrameSize | null;
}

/**
 * THE ONE ENTRY POINT. Profile gating lives here and nowhere else: a pane that
 * decides for itself whether `cellPaletteRule` applies is a second answer to a
 * question the profile already answers, and the two will drift.
 *
 * Counting is not gated. "How many unique tiles is this drawing" is a fair
 * question to ask of any canvas, including one whose profile checks nothing —
 * so `none` still gets its numbers, it just gets no clashes and no bound.
 *
 * SPRITE LIMITS, HONESTLY (spec §4.2 departure, owner-confirmed 2026-08-15).
 * Of the sprite rules, only the 4x4-tile frame bound is knowable from one
 * indexed image; 20 sprites and 320px per scanline are properties of an
 * assembled frame with mappings, and belong to sprite commit. So this reports a
 * size against the bound and evaluates nothing else sprite-shaped. It is a
 * READOUT rather than a violation because a canvas is a legitimate place to
 * draw a whole sheet of frames, and a rule that flags every sheet is a rule the
 * artist switches off — after which it protects nothing.
 */
export function evaluateCanvasConstraints(input: {
  pixels: PixelBuffer; profile: ConstraintProfile; origin: CanvasGridOrigin;
}): CanvasConstraintReport {
  const { pixels, profile, origin } = input;
  const SPRITE_MAX_TILES = 4;
  const ceil8 = (n: number) => Math.ceil(n / CELL);
  return {
    clashes: profile.cellPaletteRule
      ? findCellClashes(pixels, origin, profile.paletteLines)
      : [],
    colorsPerLine: colorsPerLine(pixels),
    colorsPerLineMax: profile.lineLength - 1,
    tiles: countUniqueTiles(pixels, origin),
    frame: profile.spriteLimits
      // Rounded UP: a drawing 20px wide occupies three tiles, two of them part
      // empty. Rounding down would report a frame that cannot hold the art.
      ? {
        tilesWide: ceil8(pixels.width), tilesHigh: ceil8(pixels.height),
        maxTiles: SPRITE_MAX_TILES,
        overBound: ceil8(pixels.width) > SPRITE_MAX_TILES || ceil8(pixels.height) > SPRITE_MAX_TILES,
      }
      : null,
  };
}
```

- [ ] **Step 4: Correct the profile table's comment**

In `src/core/art/canvas-profiles.ts`, replace the `spriteLimits` doc comment:

```ts
  /** Sprite-hardware limits. 2B evaluates ONLY the 4x4-tile frame bound, as a
   *  readout — see evaluateCanvasConstraints. The per-scanline (20 sprites,
   *  320px) and per-frame (80) limits are properties of an assembled frame with
   *  mappings, which a single indexed image does not have; they belong to sprite
   *  commit. Owner-confirmed departure from spec §4.2's "evaluated in 2B",
   *  2026-08-15. */
  spriteLimits: boolean;
```

And the file header's last line, which currently promises more than 2B delivers:

```ts
// Pure data — no evaluation lives here. canvas-constraints.ts evaluates it.
```

- [ ] **Step 5: Run the tests, then the whole core suite**

```bash
npx vitest run src/core/art
```

Expected: all pass, including `canvas-profiles.test.ts` (a comment change moves nothing).

- [ ] **Step 6: Falsify**

| Plant | Test that must fail |
|---|---|
| Gate `colorsPerLine`/`tiles` on the profile too | `still counts tiles and colours under the none profile` |
| Pass `CANVAS_LINES` instead of `profile.paletteLines` | `passes the profile line count through` |
| `Math.floor` in `ceil8` | `rounds a ragged canvas UP` |
| Build `frame` regardless of `spriteLimits` | `flagging past 4x4 only for a sprite profile` |

- [ ] **Step 7: Commit**

```bash
git add src/core/art/canvas-constraints.ts src/core/art/canvas-profiles.ts src/core/art/__tests__/canvas-constraints.test.ts
git commit -m "feat(canvas): one gated entry point for constraint evaluation, and the frame bound"
```

---

### Task 5: The shared scan — cache and store state

**Files:**
- Create: `src/renderer/state/canvas-constraints-cache.ts`
- Modify: `src/renderer/state/canvasStore.ts`
- Test: `src/renderer/state/__tests__/canvas-constraints-cache.test.ts`

Two consumers (the readout in `CanvasMode`, the overlay in `CanvasHost`) need the same report. A `useMemo` in each would scan the buffer twice per gesture — React memoises per component instance, not per input. A single-entry module cache keyed on **input identity** gives both callers one scan and stays trivially testable.

`constraintsLive` is the *unconstrained* escape hatch (spec §4.3), and `showClashOverlay` is the overlay's own toggle. Both are view state on the store, next to `visibleGrids`, for the same reason it lives there: `CanvasMode` is not keep-alive, so component state would reset on every tab switch.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/state/__tests__/canvas-constraints-cache.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createBuffer } from '../../../core/art/pixel-ops';
import { constraintProfile } from '../../../core/art/canvas-profiles';
import { cachedConstraints, __resetConstraintsCache, __constraintsScanCount } from '../canvas-constraints-cache';

const profile = constraintProfile('genesis-level-art');
const origin = { originX: 0, originY: 0 };

describe('cachedConstraints', () => {
  beforeEach(() => __resetConstraintsCache());

  it('scans once for repeated identical calls', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile, origin });
    expect(__constraintsScanCount()).toBe(1);
  });

  it('returns the identical object, so a React consumer sees a stable reference', () => {
    const pixels = createBuffer(16, 16);
    expect(cachedConstraints({ pixels, profile, origin }))
      .toBe(cachedConstraints({ pixels, profile, origin }));
  });

  it('rescans when the buffer identity changes', () => {
    cachedConstraints({ pixels: createBuffer(16, 16), profile, origin });
    cachedConstraints({ pixels: createBuffer(16, 16), profile, origin });
    expect(__constraintsScanCount()).toBe(2);
  });

  it('rescans when the origin moves', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 0 } });
    expect(__constraintsScanCount()).toBe(2);
  });

  it('rescans when the profile changes', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin });
    cachedConstraints({ pixels, profile: constraintProfile('genesis-sprite'), origin });
    expect(__constraintsScanCount()).toBe(2);
  });

  // The origin is compared BY VALUE, not by identity: canvasStore hands out a
  // fresh {originX, originY} object on every read, so an identity comparison
  // would miss the cache on every single call and quietly scan per render.
  it('hits the cache for an equal origin object', () => {
    const pixels = createBuffer(16, 16);
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 4 } });
    cachedConstraints({ pixels, profile, origin: { originX: 3, originY: 4 } });
    expect(__constraintsScanCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/renderer/state/__tests__/canvas-constraints-cache.test.ts
```

- [ ] **Step 3: Implement the cache**

```ts
// src/renderer/state/canvas-constraints-cache.ts
//
// ONE SCAN PER GESTURE, SHARED. The readout (CanvasMode) and the clash overlay
// (CanvasHost) want the same report from the same inputs. A useMemo in each
// would scan the buffer twice, because React memoises per component instance —
// so the sharing has to happen outside React, here.
//
// A single entry is the right size. There is exactly one canvas editor showing
// exactly one document, and the inputs change together (a stroke replaces the
// buffer); a bigger cache would hold megabyte-scale reports for documents
// nobody is looking at.

import type { PixelBuffer } from '../../core/art/pixel-ops';
import type { ConstraintProfile } from '../../core/art/canvas-profiles';
import type { CanvasGridOrigin } from '../../core/art/canvas-doc';
import {
  evaluateCanvasConstraints, type CanvasConstraintReport,
} from '../../core/art/canvas-constraints';

interface Entry {
  pixels: PixelBuffer; profileId: string; originX: number; originY: number;
  report: CanvasConstraintReport;
}
let entry: Entry | null = null;
let scans = 0;

/** Scan count since the last reset (tests only) — the only way to assert that
 *  the cache actually caches rather than merely returning correct answers. */
export function __constraintsScanCount(): number { return scans; }
export function __resetConstraintsCache(): void { entry = null; scans = 0; }

/**
 * The report for these inputs, scanning only when they have changed.
 *
 * The buffer is compared BY IDENTITY — canvasStore replaces it wholesale on
 * every committed gesture and never mutates in place (see `setPixels`'s
 * ownership note), so identity is exact here and a content comparison would
 * cost as much as the scan it is trying to avoid.
 *
 * The origin is compared BY VALUE. `cloneCanvasDoc` and the store's `patch`
 * hand out a fresh `{originX, originY}` on every read, so an identity test
 * would miss on every call and scan per render while looking like a cache.
 */
export function cachedConstraints(input: {
  pixels: PixelBuffer; profile: ConstraintProfile; origin: CanvasGridOrigin;
}): CanvasConstraintReport {
  const { pixels, profile, origin } = input;
  if (entry
    && entry.pixels === pixels
    && entry.profileId === profile.id
    && entry.originX === origin.originX
    && entry.originY === origin.originY) {
    return entry.report;
  }
  scans++;
  const report = evaluateCanvasConstraints({ pixels, profile, origin });
  entry = {
    pixels, profileId: profile.id, originX: origin.originX, originY: origin.originY, report,
  };
  return report;
}
```

- [ ] **Step 4: Add the two view flags to the store**

In `src/renderer/state/canvasStore.ts`, alongside `visibleGrids` in the interface:

```ts
  /**
   * The *unconstrained* escape hatch (spec §4.3): false suspends live checking
   * entirely — no scan, no readouts, no overlay — and re-enabling rescans.
   *
   * VIEW STATE, not a document field, and deliberately not persisted: a document
   * that permanently checks nothing already has a spelling, the `none` profile.
   * Two ways to say one thing is two things to keep in agreement.
   */
  constraintsLive: boolean;
  /** Whether clash cells are tinted. Independent of `constraintsLive` — the
   *  readouts are useful with the tint off, so they are separate switches. */
  showClashOverlay: boolean;
```

with the defaults and setters:

```ts
  constraintsLive: true,
  showClashOverlay: true,
  setConstraintsLive: (constraintsLive) => set({ constraintsLive }),
  setShowClashOverlay: (showClashOverlay) => set({ showClashOverlay }),
```

and their signatures next to `setVisibleGrids`:

```ts
  setConstraintsLive: (v: boolean) => void;
  setShowClashOverlay: (v: boolean) => void;
```

- [ ] **Step 5: Test the store flags**

Append to `src/renderer/state/__tests__/canvasStore.test.ts`:

```ts
describe('constraint view flags', () => {
  it('default to live checking with the overlay on', () => {
    const s = useCanvasStore.getState();
    expect(s.constraintsLive).toBe(true);
    expect(s.showClashOverlay).toBe(true);
  });

  it('toggle independently', () => {
    useCanvasStore.getState().setConstraintsLive(false);
    expect(useCanvasStore.getState().showClashOverlay).toBe(true);
    useCanvasStore.getState().setShowClashOverlay(false);
    expect(useCanvasStore.getState().constraintsLive).toBe(false);
    useCanvasStore.getState().setConstraintsLive(true);
    useCanvasStore.getState().setShowClashOverlay(true);
  });

  // They are VIEW state: no undo entry, no dirty dot. A document that checks
  // nothing permanently is the `none` profile, not this flag.
  it('do not dirty a document or record undo', () => {
    openCanvasDoc('c1', { name: 'c1', width: 16, height: 16, profileId: 'genesis-level-art' });
    const before = canvasHistory('c1').canUndo();
    useCanvasStore.getState().setConstraintsLive(false);
    expect(useCanvasStore.getState().isDirty('c1')).toBe(false);
    expect(canvasHistory('c1').canUndo()).toBe(before);
    useCanvasStore.getState().setConstraintsLive(true);
    closeCanvasDoc('c1');
  });
});
```

Match the existing imports at the top of that test file; add `canvasHistory` if it is not already imported.

- [ ] **Step 6: Run both files**

```bash
npx vitest run src/renderer/state/__tests__/canvas-constraints-cache.test.ts src/renderer/state/__tests__/canvasStore.test.ts
```

Expected: all pass.

- [ ] **Step 7: Falsify**

| Plant | Test that must fail |
|---|---|
| Compare the origin by identity (`entry.origin === origin`) | `hits the cache for an equal origin object` |
| Drop `profileId` from the key | `rescans when the profile changes` |
| Never store the entry (scan every call) | `scans once for repeated identical calls` |
| Make `setConstraintsLive` call `recordEdit` | `do not dirty a document or record undo` |

- [ ] **Step 8: Commit**

```bash
git add src/renderer/state/canvas-constraints-cache.ts src/renderer/state/canvasStore.ts src/renderer/state/__tests__/
git commit -m "feat(canvas): share one constraint scan, and the unconstrained toggle"
```

---

### Task 6: Extract the free-slot count the classic tabs each carry

**Files:**
- Create: `src/core/art/free-tile-slots.ts`
- Modify: `src/renderer/components/classic/BlockTab.tsx:183-198`, `src/renderer/components/classic/ChunkTab.tsx:213-232`
- Test: `src/core/art/__tests__/free-tile-slots.test.ts`

The identical 8-line loop lives in both tabs today, tested through neither — it is inside a `useMemo` in a `.tsx`, which the suite cannot reach. The canvas budget in task 7 would be the third copy. Extract it once, into core, where it can be tested.

**Keep the "approximate, display only" contract exactly as the tabs state it:** this mirrors `findFreeSlot`'s three conditions without importing it (that function is private to the planner), so it can be off by the slots a single in-flight gesture claims. `planSurfaceEdit` remains the sole authority over what an edit may do. That comment must survive the move — it is the reason the drift is acceptable.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/free-tile-slots.test.ts
import { describe, it, expect } from 'vitest';
import { countFreeTileSlots } from '../free-tile-slots';

/** Minimal stand-in for UsageIndex — the count only ever asks for `.cells`. */
const usageOf = (used: number[]) => ({
  tileUsage: (t: number) => ({ cells: used.includes(t) ? 1 : 0 }),
});

describe('countFreeTileSlots', () => {
  it('counts unreferenced, unreserved, editable slots', () => {
    expect(countFreeTileSlots({
      poolTileCount: 5, usage: usageOf([1]), reserved: null, isEditable: () => true,
    })).toBe(3); // 2, 3, 4 — tile 1 is used, tile 0 never counts
  });

  // Tile 0 is the transparent tile. Claiming it would punch holes in every
  // block that leans on it, everywhere in the zone at once.
  it('never counts tile 0, even when nothing references it', () => {
    expect(countFreeTileSlots({
      poolTileCount: 1, usage: usageOf([]), reserved: null, isEditable: () => true,
    })).toBe(0);
  });

  it('excludes object-reserved tiles', () => {
    expect(countFreeTileSlots({
      poolTileCount: 4, usage: usageOf([]), reserved: new Set([2]), isEditable: () => true,
    })).toBe(2); // 1 and 3
  });

  it('excludes tiles outside the editable range', () => {
    expect(countFreeTileSlots({
      poolTileCount: 4, usage: usageOf([]), reserved: null, isEditable: (t) => t < 2,
    })).toBe(1); // 1 only
  });

  it('is zero for a pool with no spare slots at all — the Labyrinth case', () => {
    expect(countFreeTileSlots({
      poolTileCount: 3, usage: usageOf([1, 2]), reserved: null, isEditable: () => true,
    })).toBe(0);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/core/art/__tests__/free-tile-slots.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/core/art/free-tile-slots.ts
//
// How many tile slots this zone's pool has spare — the number BlockTab and
// ChunkTab each computed inline, and the number the origination canvas's budget
// readout needs as its denominator. One copy, in core, where the suite can
// reach it: inside a useMemo in a .tsx it was three identical loops that no
// test could execute.
//
// APPROXIMATE, FOR DISPLAY ONLY. It mirrors `findFreeSlot`'s three conditions
// (classic-surface-plan.ts: unreferenced, not object-reserved, editable)
// without importing it — that function is a private implementation detail of
// the planner, not an exported predicate — so this can only ever be off by the
// handful of slots a single in-flight gesture claims, never wrong about what an
// edit is ALLOWED to do: `planSurfaceEdit` remains the sole authority for that,
// every time.

/** The one thing this needs from a UsageIndex, named so a caller can pass the
 *  real index and a test can pass four lines. */
export interface TileUsageLookup { tileUsage(t: number): { cells: number } }

export function countFreeTileSlots(input: {
  poolTileCount: number;
  usage: TileUsageLookup;
  /** Tiles this act's objects draw through mappings. Null when unknown. */
  reserved: ReadonlySet<number> | null;
  isEditable: (t: number) => boolean;
}): number {
  const { poolTileCount, usage, reserved, isEditable } = input;
  let n = 0;
  // Tile 0 is the transparent tile — never counted free, at any pool size.
  for (let t = 1; t < poolTileCount; t++) {
    if (usage.tileUsage(t).cells !== 0) continue;
    if (reserved?.has(t)) continue;
    if (!isEditable(t)) continue;
    n++;
  }
  return n;
}
```

- [ ] **Step 4: Point both tabs at it**

In `ChunkTab.tsx`, replace the `freeTileSlots` memo and its comment block with:

```ts
  // Approximate, display only — see countFreeTileSlots' header for why that is
  // acceptable and what stays authoritative.
  const freeTileSlots = useMemo(() => countFreeTileSlots({
    poolTileCount, usage, reserved: reservedTiles ?? null, isEditable: (t) => isTileEditable(range, t),
  }), [poolTileCount, usage, reservedTiles, range]);
```

with `import { countFreeTileSlots } from '../../../core/art/free-tile-slots';`. Make the identical change in `BlockTab.tsx`. Leave `limitsReadout` in both files exactly as it is.

- [ ] **Step 5: Verify the classic tabs still behave**

```bash
npx tsc --noEmit && npx vitest run src/renderer/components/classic src/core/art
```

Expected: all pass. If a classic test moves, the extraction changed behaviour — most likely by dropping the `t = 1` start or the `?.` on `reserved`.

- [ ] **Step 6: Falsify**

| Plant | Test that must fail |
|---|---|
| Start the loop at `t = 0` | `never counts tile 0` |
| Drop the `reserved?.has` check | `excludes object-reserved tiles` |
| `cells === 0` inverted to `!== 0` | `counts unreferenced, unreserved, editable slots` |

- [ ] **Step 7: Commit**

```bash
git add src/core/art/free-tile-slots.ts src/core/art/__tests__/free-tile-slots.test.ts src/renderer/components/classic/BlockTab.tsx src/renderer/components/classic/ChunkTab.tsx
git commit -m "refactor(art): one countFreeTileSlots, tested, in place of two untestable copies"
```

---

### Task 7: The budget — what the canvas's tile count is measured against

**Files:**
- Create: `src/renderer/components/canvas/use-canvas-constraints.ts`
- Test: `src/renderer/components/canvas/__tests__/canvas-budget.test.ts`

Owner decision 1: the denominator is the **currently-open act, live**, with the pool total beside it, falling back to a bare count when no level is open.

**The number must not overstate its own certainty.** The canvas's unique-tile count is what the drawing *contains*; commit (2C step 3) matches against the existing pool first, so the slots actually claimed can be far fewer. The readout therefore reports both numbers and says what it means in the tooltip — it must never render as "37 > 17, this cannot land", because that is not known yet.

The pure part is the shaping; the hook is the wiring. Test the shaping.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/components/canvas/__tests__/canvas-budget.test.ts
import { describe, it, expect } from 'vitest';
import { shapeTileBudget, budgetReadout } from '../use-canvas-constraints';

describe('shapeTileBudget', () => {
  it('is act-less when no classic level is open', () => {
    expect(shapeTileBudget({ ref: null, poolTileCount: 0, freeSlots: 0 }))
      .toEqual({ act: null, freeSlots: null, poolUsed: null, poolTotal: null });
  });

  it('reports the open act, its free slots and its pool', () => {
    expect(shapeTileBudget({ ref: { zone: 'GHZ', act: 1 }, poolTileCount: 256, freeSlots: 17 }))
      .toEqual({ act: { zone: 'GHZ', act: 1 }, freeSlots: 17, poolUsed: 239, poolTotal: 256 });
  });

  it('survives a zone at its limit — zero free is a number, not a missing one', () => {
    expect(shapeTileBudget({ ref: { zone: 'LZ', act: 1 }, poolTileCount: 256, freeSlots: 0 }))
      .toMatchObject({ freeSlots: 0, poolUsed: 256 });
  });
});

describe('budgetReadout', () => {
  const tiles = { unique: 37, fullCells: 64, pixelsOutsideGrid: 0 };

  it('shows the bare count with no act open', () => {
    expect(budgetReadout(tiles, { act: null, freeSlots: null, poolUsed: null, poolTotal: null }))
      .toBe('tiles 37 unique');
  });

  it('names the act it is measuring against', () => {
    expect(budgetReadout(tiles, {
      act: { zone: 'GHZ', act: 1 }, freeSlots: 17, poolUsed: 239, poolTotal: 256,
    })).toBe('tiles 37 unique · 17 free in GHZ 1 · pool 239/256');
  });

  // The unaligned band is reported, never folded into the tile count — a
  // rounded number here is budget the artist does not have.
  it('reports pixels the grid cannot turn into tiles', () => {
    expect(budgetReadout(
      { unique: 4, fullCells: 4, pixelsOutsideGrid: 96 },
      { act: null, freeSlots: null, poolUsed: null, poolTotal: null },
    )).toBe('tiles 4 unique · 96px outside the grid');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/renderer/components/canvas/__tests__/canvas-budget.test.ts
```

- [ ] **Step 3: Implement the pure half plus the hooks**

```ts
// src/renderer/components/canvas/use-canvas-constraints.ts
//
// What the canvas's constraint numbers are, and what they are measured against.
//
// The SHAPING is pure and lives at the bottom of this file so the suite (which
// renders no React) can reach it; the hooks above are wiring only. That split is
// the same one canvas-pane-model.ts makes, for the same reason: a rule inside a
// hook is a rule no test can execute.

import { useMemo } from 'react';
import { useCanvasStore } from '../../state/canvasStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useEditableTileRange } from '../classic/composer-shared';
import { isTileEditable } from '../../../core/project/editable-tiles';
import { buildUsageIndex } from '../../../core/level-classic/usage-index';
import { countFreeTileSlots } from '../../../core/art/free-tile-slots';
import { constraintProfile } from '../../../core/art/canvas-profiles';
import { cachedConstraints } from '../../state/canvas-constraints-cache';
import type { CanvasConstraintReport, UniqueTileCount } from '../../../core/art/canvas-constraints';

/**
 * This document's constraint report, or NULL while the unconstrained toggle is
 * off.
 *
 * Null rather than a stale or empty report: an empty `clashes` array means "no
 * clashes", and handing that back while checking is suspended would report a
 * clean canvas that nobody checked. The consumers render `—`.
 */
export function useCanvasConstraints(docId: string): CanvasConstraintReport | null {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const live = useCanvasStore((s) => s.constraintsLive);
  return useMemo(() => {
    if (!doc || !live) return null;
    // Through the shared cache, so the readout and the overlay scan once
    // between them rather than once each.
    return cachedConstraints({
      pixels: doc.pixels, profile: constraintProfile(doc.profileId), origin: doc.gridOrigin,
    });
  }, [doc?.pixels, doc?.profileId, doc?.gridOrigin, live]);
}

export interface CanvasTileBudget {
  /** Null when no classic act is open — the canvas is a free-standing document
   *  and may well be the only thing on screen. */
  act: { zone: string; act: number } | null;
  freeSlots: number | null;
  poolUsed: number | null;
  poolTotal: number | null;
}

/** The open act's tile budget, live. Recomputed when the level doc changes
 *  identity, which is what a command, an undo and an act switch all produce. */
export function useCanvasTileBudget(): CanvasTileBudget {
  const ref = useClassicLevelStore((s) => s.ref);
  const doc = useClassicLevelStore((s) => s.doc);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();

  return useMemo(() => {
    if (!ref || !doc) return shapeTileBudget({ ref: null, poolTileCount: 0, freeSlots: 0 });
    const poolTileCount = Math.floor(doc.tiles.length / 32);
    const freeSlots = countFreeTileSlots({
      poolTileCount, usage: buildUsageIndex(doc),
      reserved: reservedTiles ?? null, isEditable: (t) => isTileEditable(range, t),
    });
    return shapeTileBudget({ ref: { zone: ref.zone, act: ref.act }, poolTileCount, freeSlots });
  }, [ref, doc, reservedTiles, range]);
}

// --- The pure half ----------------------------------------------------------

export function shapeTileBudget(input: {
  ref: { zone: string; act: number } | null;
  poolTileCount: number;
  freeSlots: number;
}): CanvasTileBudget {
  if (!input.ref) return { act: null, freeSlots: null, poolUsed: null, poolTotal: null };
  return {
    act: input.ref,
    freeSlots: input.freeSlots,
    poolUsed: input.poolTileCount - input.freeSlots,
    poolTotal: input.poolTileCount,
  };
}

/**
 * The tile line of the readout.
 *
 * IT DOES NOT COMPARE THE TWO NUMBERS, and that is deliberate. The unique count
 * is what the drawing CONTAINS; commit matches against the existing pool first
 * (spec §4.4 step 3), so the slots actually claimed can be far fewer. Rendering
 * "37 > 17, this will not fit" would state as fact something 2C has not
 * computed yet. Both numbers, side by side, and the tooltip explains the gap.
 */
export function budgetReadout(tiles: UniqueTileCount, budget: CanvasTileBudget): string {
  const parts = [`tiles ${tiles.unique} unique`];
  if (budget.act) {
    parts.push(`${budget.freeSlots} free in ${budget.act.zone} ${budget.act.act}`);
    parts.push(`pool ${budget.poolUsed}/${budget.poolTotal}`);
  }
  if (tiles.pixelsOutsideGrid > 0) parts.push(`${tiles.pixelsOutsideGrid}px outside the grid`);
  return parts.join(' · ');
}

export const BUDGET_TOOLTIP =
  'Unique 8x8 tiles in this canvas, counting flips as one. Committing matches '
  + 'against the pool first, so the slots actually claimed can be fewer than this.';
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/renderer/components/canvas/__tests__/canvas-budget.test.ts && npx tsc --noEmit
```

Expected: all pass, tsc clean.

- [ ] **Step 5: Falsify**

| Plant | Test that must fail |
|---|---|
| Return `poolUsed: poolTileCount` (ignore free) | `reports the open act, its free slots and its pool` |
| Emit the act clause when `act` is null | `shows the bare count with no act open` |
| Fold `pixelsOutsideGrid` into `unique` | `reports pixels the grid cannot turn into tiles` |
| Return `{ freeSlots: null }` when free is 0 | `survives a zone at its limit` |

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/canvas/use-canvas-constraints.ts src/renderer/components/canvas/__tests__/canvas-budget.test.ts
git commit -m "feat(canvas): measure the canvas's tiles against the open act, honestly"
```

---

### Task 8: The readouts and the two toggles

**Files:**
- Modify: `src/renderer/components/canvas/CanvasMode.tsx`
- Test: `src/renderer/components/canvas/__tests__/canvas-readout.test.ts`

Spec §4.3, held to exactly: **scalar limits get numbers, structural violations get the overlay and never a number.** So there is no "3 cells clash" anywhere. The overlay toggle *lights* when clashes exist, which is the whole structural signal, and the artist looks at the canvas to see where.

The colour line reads `colours 5·12·7·0 / 15 per line`. Fifteen, not sixteen: entry 0 is transparency in every line and is not a colour the artist can spend.

- [ ] **Step 1: Write the failing test for the pure strings**

```ts
// src/renderer/components/canvas/__tests__/canvas-readout.test.ts
import { describe, it, expect } from 'vitest';
import { colorsReadout, frameReadout, clashSignal } from '../use-canvas-constraints';

describe('colorsReadout', () => {
  it('shows every line and the per-line ceiling', () => {
    expect(colorsReadout([5, 12, 7, 0], 15)).toBe('colours 5·12·7·0 / 15 per line');
  });

  it('shows only the lines a one-line profile has', () => {
    expect(colorsReadout([5, 0, 0, 0], 15, 1)).toBe('colours 5 / 15 per line');
  });

  // A one-line profile with paint in line 2 is a violation the CLASH overlay
  // reports (line-out-of-range). The readout must not hide the pixels, or the
  // artist sees a tint with no number that explains it.
  it('still shows a line the profile does not have, when it is in use', () => {
    expect(colorsReadout([5, 0, 3, 0], 15, 1)).toBe('colours 5·—·3 / 15 per line');
  });
});

describe('frameReadout', () => {
  it('is empty for a profile with no sprite limits', () => {
    expect(frameReadout(null)).toBe('');
  });

  it('sizes the frame in tiles', () => {
    expect(frameReadout({ tilesWide: 3, tilesHigh: 2, maxTiles: 4, overBound: false }))
      .toBe('frame 3×2 tiles');
  });

  it('names the bound only when it is exceeded', () => {
    expect(frameReadout({ tilesWide: 6, tilesHigh: 2, maxTiles: 4, overBound: true }))
      .toBe('frame 6×2 tiles (one sprite is 4×4 max)');
  });
});

describe('clashSignal', () => {
  // §4.3: structural violations NEVER get a number. This returns a boolean, and
  // if it ever returns a count that is the bug.
  it('is a boolean, not a count', () => {
    expect(clashSignal([{ x: 0, y: 0, w: 8, h: 8, full: true, kind: 'multi-line', lines: [0, 1] }]))
      .toBe(true);
    expect(clashSignal([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/renderer/components/canvas/__tests__/canvas-readout.test.ts
```

- [ ] **Step 3: Implement the strings in `use-canvas-constraints.ts`**

```ts
// Append to the pure half of src/renderer/components/canvas/use-canvas-constraints.ts
// (task 9 adds no further imports — CellClashKind comes in here, with the rest)
import type {
  CanvasCellClash, CanvasFrameSize, CellClashKind,
} from '../../../core/art/canvas-constraints';

/**
 * Colours in use per line, against the 15 an artist can actually spend — entry
 * 0 is transparency in every line, so a "16" here would promise a colour that
 * does not exist.
 *
 * Lines the profile does not have print as `—` UNLESS something is drawn in
 * them, in which case the count shows. Hiding it would leave the artist with a
 * clash tint and no number anywhere that explains where the stray pixels are.
 */
export function colorsReadout(perLine: number[], max: number, profileLines = perLine.length): string {
  const shown = perLine.map((n, i) => (i < profileLines || n > 0 ? String(n) : '—'));
  while (shown.length > profileLines && shown[shown.length - 1] === '—') shown.pop();
  return `colours ${shown.join('·')} / ${max} per line`;
}

/** The sprite frame's size in tiles, naming the hardware bound only when it is
 *  exceeded — a canvas holding a sheet of frames is legitimate, so this states
 *  a size rather than nagging about one. */
export function frameReadout(frame: CanvasFrameSize | null): string {
  if (!frame) return '';
  const size = `frame ${frame.tilesWide}×${frame.tilesHigh} tiles`;
  return frame.overBound ? `${size} (one sprite is ${frame.maxTiles}×${frame.maxTiles} max)` : size;
}

/**
 * Whether ANY cell violates the palette-line rule — a boolean, never a count.
 *
 * Spec §4.3: structural violations surface as a live highlight and never as a
 * number, because no surveyed tool gives this class a numeric count and none
 * combines both for one constraint. The overlay toggle lights off this; the
 * canvas itself says where.
 */
export function clashSignal(clashes: readonly CanvasCellClash[]): boolean {
  return clashes.length > 0;
}
```

- [ ] **Step 4: Wire the readouts into the status bar**

In `CanvasMode.tsx`'s `CanvasStatusBar`, after the profile label:

```tsx
  const report = useCanvasConstraints(docId);
  const budget = useCanvasTileBudget();
```

and inside the `right` span, before the zoom:

```tsx
          {report ? (
            <>
              <span title={BUDGET_TOOLTIP}>{budgetReadout(report.tiles, budget)}</span>
              <span>{colorsReadout(report.colorsPerLine, report.colorsPerLineMax,
                constraintProfile(doc.profileId).paletteLines)}</span>
              {report.frame && <span>{frameReadout(report.frame)}</span>}
            </>
          ) : (
            // Not "0 clashes" and not a stale number: checking is SUSPENDED, and
            // a readout that keeps showing its last value while nothing is
            // being checked is the exact shape of a guard that asserts nothing.
            <span style={{ color: T.textLo }} title="Constraint checking is off">constraints —</span>
          )}
```

- [ ] **Step 5: Wire the two toggles into the options bar**

In `CanvasToolOptions`, after the grid chips and their `<Divider />`:

```tsx
      <Chip
        active={constraintsLive}
        title="Check this canvas against its profile as you draw. Off is the unconstrained escape hatch — draw freely, reconcile deliberately; re-enabling rescans."
        onClick={() => st().setConstraintsLive(!constraintsLive)}
      >
        Constraints
      </Chip>
      <Chip
        active={constraintsLive && showClashOverlay}
        disabled={!constraintsLive}
        // The chip lights when something is wrong — the whole structural
        // signal, with no number attached (spec §4.3).
        tone={hasClashes ? 'warning' : undefined}
        title={hasClashes
          ? 'Cells drawing from more than one palette line, or from a line this profile does not have. Tinted on the canvas.'
          : 'Tint cells that break the one-line-per-8×8 rule'}
        onClick={() => st().setShowClashOverlay(!showClashOverlay)}
      >
        Clashes
      </Chip>
```

with these reads at the top of the component:

```tsx
  const constraintsLive = useCanvasStore((s) => s.constraintsLive);
  const showClashOverlay = useCanvasStore((s) => s.showClashOverlay);
  const report = useCanvasConstraints(docId);
  const hasClashes = report ? clashSignal(report.clashes) : false;
```

`CanvasToolOptions` already takes `docId`. `Chip` (`src/renderer/components/ui/primitives.tsx:80`) already has `disabled` and already suppresses `onClick` with it — nothing to add there. It has **no** `tone`, so add one:

```tsx
export function Chip({ children, active, onClick, disabled, title, tone }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void;
  disabled?: boolean; title?: string;
  /** Colours the chip's border and text without making it look ACTIVE — a chip
   *  that is off but reporting a problem (the Clashes chip with the tint
   *  hidden) needs to say so without claiming the tint is on. */
  tone?: 'warning';
}) {
```

and inside its style, after the existing colour rules, `...(tone === 'warning' ? { borderColor: T.warning, color: T.warning } : {})`. A `tone` rather than a raw `style` prop, because one escape hatch on a shared primitive becomes every caller's private styling within a release.

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit && npx vitest run src/renderer/components/canvas
```

Expected: all pass, tsc clean.

- [ ] **Step 7: Falsify the readout rules**

| Plant | Test that must fail |
|---|---|
| `colorsReadout` divides by 16 | `shows every line and the per-line ceiling` |
| Hide out-of-profile lines unconditionally | `still shows a line the profile does not have` |
| `frameReadout` always names the bound | `names the bound only when it is exceeded` |
| `clashSignal` returns `clashes.length` | `is a boolean, not a count` |

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/canvas/ src/renderer/components/ui
git commit -m "feat(canvas): constraint readouts, and the two toggles that govern them"
```

---

### Task 9: The clash overlay

**Files:**
- Modify: `src/renderer/components/canvas/CanvasHost.tsx`, `src/renderer/canvas/canvas-colors.ts`
- Test: `src/renderer/components/canvas/__tests__/canvas-clash-overlay.test.ts`

`drawOverlay` (not `drawUnderlay`) — the tint has to sit **above** the art, or it is invisible on dark pixels, which is where clashes actually happen. `PixelViewport` already translates to the art origin and hands the zoom in.

GrafX2's red-tinted clash cells are the precedent. A fill alone disappears at zoom 1 and swamps the art at zoom 32, so it is a low-alpha fill **plus** a 1px outline: the fill carries at high zoom, the outline carries at low.

- [ ] **Step 1: Write the failing test for the pure draw plan**

The drawing itself is `ctx` calls in a `.tsx` that no test can reach — so what gets drawn is decided by a pure function that can be.

```ts
// src/renderer/components/canvas/__tests__/canvas-clash-overlay.test.ts
import { describe, it, expect } from 'vitest';
import { planClashOverlay } from '../use-canvas-constraints';

const cell = (x: number, kind: 'multi-line' | 'line-out-of-range' = 'multi-line') =>
  ({ x, y: 0, w: 8, h: 8, full: true, kind, lines: [0, 1] });

describe('planClashOverlay', () => {
  it('draws nothing when the overlay is off', () => {
    expect(planClashOverlay([cell(0)], false)).toEqual([]);
  });

  it('draws nothing when there is nothing to draw', () => {
    expect(planClashOverlay([], true)).toEqual([]);
  });

  it('emits one rect per clashing cell, in document pixels', () => {
    expect(planClashOverlay([cell(0), cell(8)], true)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, kind: 'multi-line' },
      { x: 8, y: 0, w: 8, h: 8, kind: 'multi-line' },
    ]);
  });

  // The two kinds are distinguishable so the tint can differ — a cell drawing
  // from a line the profile lacks is fixed by re-assigning, a cell spanning two
  // lines is fixed by redrawing, and they should not look identical.
  it('carries the kind through', () => {
    expect(planClashOverlay([cell(0, 'line-out-of-range')], true)[0].kind)
      .toBe('line-out-of-range');
  });

  it("keeps a partial cell's real size, not a rounded 8x8", () => {
    expect(planClashOverlay([{ x: 0, y: 0, w: 3, h: 8, full: false, kind: 'multi-line', lines: [0, 1] }], true))
      .toEqual([{ x: 0, y: 0, w: 3, h: 8, kind: 'multi-line' }]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npx vitest run src/renderer/components/canvas/__tests__/canvas-clash-overlay.test.ts
```

- [ ] **Step 3: Implement the plan and the colours**

Append to the pure half of `use-canvas-constraints.ts`:

```ts
export interface ClashRect { x: number; y: number; w: number; h: number; kind: CellClashKind }

/**
 * What the overlay draws, in DOCUMENT pixels — the viewport applies the zoom
 * and the origin translation, so nothing here knows about either.
 *
 * A partial cell keeps its real width and height. Rounding it up to 8x8 would
 * tint pixels outside the canvas at the offset edge; rounding it away would
 * hide a real clash in the band a non-zero grid origin creates.
 */
export function planClashOverlay(
  clashes: readonly CanvasCellClash[], show: boolean,
): ClashRect[] {
  if (!show) return [];
  return clashes.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind }));
}
```

In `src/renderer/canvas/canvas-colors.ts`, beside the existing grid colours:

```ts
/** Clash tint (GrafX2's red-tinted clash cells are the precedent). Low-alpha
 *  fill PLUS a solid outline: the fill carries at high zoom where a hairline
 *  vanishes, the outline carries at zoom 1 where an 8px fill is 8 screen px. */
export const CANVAS_CLASH_FILL = 'rgba(255, 64, 64, 0.28)';
export const CANVAS_CLASH_EDGE = 'rgba(255, 96, 96, 0.9)';
/** A cell drawing from a line the profile does not have is a DIFFERENT repair
 *  from one spanning two lines — re-assign versus redraw — so it does not get
 *  the same colour. */
export const CANVAS_RANGE_FILL = 'rgba(255, 176, 32, 0.26)';
export const CANVAS_RANGE_EDGE = 'rgba(255, 196, 64, 0.9)';
```

- [ ] **Step 4: Draw it in `CanvasHost.tsx`**

```tsx
  const showClashOverlay = useCanvasStore((s) => s.showClashOverlay);
  const report = useCanvasConstraints(docId);
  const clashRects = useMemo(
    () => planClashOverlay(report?.clashes ?? [], showClashOverlay),
    [report, showClashOverlay],
  );

  // ABOVE the art, not below it (drawUnderlay): a tint under the pixels is
  // invisible exactly where clashes live — in drawn areas.
  const drawClashes = React.useCallback((ctx: CanvasRenderingContext2D, z: number) => {
    for (const r of clashRects) {
      const multi = r.kind === 'multi-line';
      ctx.fillStyle = multi ? CANVAS_CLASH_FILL : CANVAS_RANGE_FILL;
      ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z);
      ctx.strokeStyle = multi ? CANVAS_CLASH_EDGE : CANVAS_RANGE_EDGE;
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x * z + 0.5, r.y * z + 0.5, r.w * z - 1, r.h * z - 1);
    }
  }, [clashRects]);
```

and pass `drawOverlay={drawClashes}` to `PixelViewport`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit && npx vitest run src/renderer/components/canvas
```

- [ ] **Step 6: Falsify**

| Plant | Test that must fail |
|---|---|
| Ignore the `show` flag | `draws nothing when the overlay is off` |
| Emit `w: 8, h: 8` always | `keeps a partial cell's real size` |
| Drop `kind` from the rect | `carries the kind through` |

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/canvas/ src/renderer/canvas/canvas-colors.ts
git commit -m "feat(canvas): tint the cells that break the one-line-per-cell rule"
```

---

### Task 10: Colour-space snapping — verify the door that is already shut, and name the one that is not

**Files:**
- Test: `src/core/art/__tests__/canvas-file-format.test.ts` (append)
- Modify: `docs/superpowers/plans/2026-08-15-art-authoring-phase2b-constraints-visible.md` (this file, `## Review corrections`)

Spec §4.3 lists colour-space snapping on paste and import as 2B work. **Import is already snapped** — `canvas-file-format.ts` runs every PLTE entry through `encodeGenesisColor` on load (line ~314), so a 24-bit PNG from Aseprite lands as CRAM words with the low bit of each nibble clear. That is a claim to *verify by planting*, not to accept from a reading.

**Paste has no door yet.** 2A deferred copy/paste entirely (R17), so there is no path by which unsnapped colour can arrive that way. Record it as the owner of the remaining half rather than building a snap for a path that does not exist.

- [ ] **Step 1: Write the verification test**

The path under test is **the real one an Aseprite export takes**: `decodeCanvasFiles(png, null)` — no sidecar, so the palette is recovered from PLTE, which is where the snap lives (`canvas-file-format.ts:314`).

```ts
// Append to src/core/art/__tests__/canvas-file-format.test.ts
import { encodeIndexedPng } from '../indexed-png';
import { decodeGenesisColor } from '../../formats/palette';

describe('colour-space snapping on import (spec §4.3)', () => {
  it('snaps an arbitrary 24-bit PLTE colour into the Genesis 512', async () => {
    // 0x7B/0xC5/0x39 — no channel is on the hardware's 3-bit ladder. This is
    // exactly what a plain Aseprite export hands us.
    const png = await encodeIndexedPng({
      width: 8, height: 8, indices: new Uint8Array(64),
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0x7b, g: 0xc5, b: 0x39 }],
      transparentIndex: 0,
    });
    const { doc } = await decodeCanvasFiles(png, null);

    // The stored word must round-trip exactly — which is only true if it was
    // snapped on the way in. decodeGenesisColor spreads 3 bits over 0..255 in
    // steps of 36, so every channel of a snapped colour is a multiple of 36.
    const back = decodeGenesisColor(doc.palette[1]);
    for (const ch of [back.r, back.g, back.b]) expect(ch % 36).toBe(0);
    // And it is the NEAREST such colour, not a truncation to black.
    expect(back).not.toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
});
```

Check `decodeGenesisColor`'s actual expansion before trusting the `% 36`: if it returns a different ladder (e.g. `v * 32`), use that spacing. The assertion that matters is that every channel lands **on** the ladder — adjust the arithmetic, never the claim. If `decodeGenesisColor` returns no alpha, drop `a` from the second expectation.

- [ ] **Step 2: Run it**

```bash
npx vitest run src/core/art/__tests__/canvas-file-format.test.ts
```

Expected: PASS on the first run — this verifies existing behaviour rather than driving new behaviour.

- [ ] **Step 3: Plant, and watch it fail**

Temporarily change the load path to store the raw 8-bit channel instead of the snapped word. Re-run. **The test must fail.** If it passes, the test is not reaching the snap and needs rewriting before it means anything. Revert.

- [ ] **Step 4: Record the paste gap in this plan's Review corrections**

Add a numbered entry stating: paste is the only unsnapped door, 2A deferred paste itself (R17), so the snap belongs to whichever plan lands paste — and it belongs *inside* `normalizeCanvasPixels`' neighbourhood, at the same choke point, not bolted onto the paste handler.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/__tests__/canvas-file-format.test.ts docs/superpowers/plans/2026-08-15-art-authoring-phase2b-constraints-visible.md
git commit -m "test(canvas): pin colour-space snapping on import; record paste as the open door"
```

---

### Task 11: CDP verification in the running app

**Files:**
- Create: `docs/superpowers/plans/2026-08-15-constraints-cdp-report.md`

The suite renders no React and no canvas (`aurora-runtime-only-bugs`), so every claim in tasks 8 and 9 is unverified until the real app is driven. Follow the harness `docs/superpowers/plans/2026-08-15-canvas-cdp-report.md` describes, against **real s1disasm data**, not a fixture.

- [ ] **Step 1: Build and launch under CDP**

```bash
npx tsc --noEmit && npx electron-vite build
```

Then launch with the remote debugging port the previous report used.

- [ ] **Step 2: Work the checklist**

Each line is a claim this plan makes that only the running app can settle:

1. Create a canvas from an open GHZ act. The status bar shows `tiles 0 unique · N free in GHZ 1 · pool U/T`, with N and T matching what BlockTab shows for the same act.
2. Draw one stroke. The tile count rises. The colours readout moves on the line you painted in and on no other.
3. Paint two palette lines into one 8×8 cell. That cell tints red, and only that cell.
4. Erase back to one line. The tint clears.
5. Draw line-3 art on transparency in one cell. **No tint** — this is the transparent-has-no-line rule, live.
6. Switch the profile to *Genesis sprite*. Cells drawing from lines 1–3 tint amber (`line-out-of-range`), and the colours readout still shows those lines' counts.
7. Nudge the grid origin by 3px. The tinted cells move with the grid, and the tile count changes — the origin decides which pixels share a cell.
8. Turn *Constraints* off. Every readout becomes `constraints —`, the tint disappears, the Clashes chip greys. Turn it back on: everything returns without a redraw or a tab switch.
9. Turn *Clashes* off alone. The tint goes, the readouts stay.
10. Close the level (no act open). The tile readout drops to the bare count; nothing else changes.
11. Undo/redo across a stroke and across a grid-origin change. Readouts and tint follow both.
12. At 1024×1024, draw continuously for several seconds. Note whether the stroke stutters — this is the only real answer to task 3's cost question.

- [ ] **Step 3: Reintroduce one bug on purpose**

The strongest verification available (standing lesson): revert the `isTransparent` skip in `findCellClashes`, rebuild, confirm the app now tints every cell of line-3-on-transparency art, then revert back and confirm it stops. A checklist that only ever passes has not been tested.

- [ ] **Step 4: Write the report**

`docs/superpowers/plans/2026-08-15-constraints-cdp-report.md` — every checklist line with its evidence, the planted-bug result, the 1024² timing, and anything that failed. **Findings are the point; a report with no findings needs to say what was tried that could have produced one.**

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-15-constraints-cdp-report.md
git commit -m "test(canvas): CDP verification of the constraint readouts and clash overlay"
```

---

## Spec coverage

| Spec §4.3 requirement | Task |
|---|---|
| Scalar limits → live numeric readout | 3, 7, 8 |
| Structural violations → live highlight, never a number | 2, 8 (`clashSignal`), 9 |
| Toggleable overlay | 5 (`showClashOverlay`), 8, 9 |
| Never prevent | 2 (header), 4 — nothing in this plan refuses or rewrites a pixel |
| *Unconstrained* escape hatch, rescanning on re-enable | 5, 7 (null report), 8 |
| Flip-aware unique-tile counting | 3 |
| Colour-space snapping on paste/import | 10 (import verified; paste recorded as deferred, with its owner) |
| Cell palette rule per 8×8 | 2 |
| Colour space / palette lines from the profile | 4 |
| Sprite limits | 4, owner-confirmed departure — frame bound only |
| State the ceiling up front, not at commit (§4.4) | 7 |
| `tab-activation.ts` split (R19 carry-forward) | 1 |

**Out of scope, by decision:** resolve-and-commit (§4.4) is 2C; tile-pool growth is phase 3, which the owner has confirmed runs *before* 2C; layers, brushes and onion skinning stay out per §6.5; copy/paste stays deferred per R17.

---

## Review corrections

_(Entries added during implementation. They are AUTHORITATIVE over the task text above them.)_

**R1 — `activationGen` is shared by all three activation systems, and task 1's split had no home for it.** The plan named four modules; the file needed five. The counter is not incidental shared state — bumping it from any path supersedes an in-flight flow in either of the others, which is how a canvas activation cancels an open classic dirty-switch confirm (`runCanvasActivation` says so explicitly). Putting it in one of the three kind modules would have made the other two import that one for a reason unrelated to it, and would have hidden a cross-kind rule inside whichever file won. It lives in `tab-activation/generation.ts` with `beginActivation()` / `isCurrentActivation()`.

**R2 — the index re-exports explicitly, not `export *`.** The plan specified `export *`. That would have widened the public surface: the split forced `confirmCloseSpriteDoc` and `focusCanvasForTab` to become module exports so `dispatch` could reach them, and each is *half* an operation — a close confirm with no close behind it, a focus change with no session write behind it. The file's own first line claims the activation guards "cannot be bypassed"; `export *` would have quietly made that false. The explicit list keeps the surface byte-identical to before the split.

**R3 — the precedence test in task 2 asserted nothing, as written.** The plan's fixture for "multi-line wins over line-out-of-range" used lines 0 and 3 against a one-line profile. The out-of-range branch reads `lines[0]` — the *lowest* line — and line 0 is in range for every profile, so swapping the two branches passed that test unchanged. Discovered by planting exactly that swap and watching nothing break. The fixture is now lines 2 and 3, the only shape where the orderings differ.

**R4 — the `isTransparent` guard in `colorsPerLine` was redundant, and redundancy made both halves unfalsifiable.** The popcount loop started at bit 1, so "entry 0 is not a colour" was enforced twice and deleting *either* mechanism changed no result. Two mechanisms for one rule is a rule no test can cover. The popcount now runs from bit 0 and the guard is the single source.

**R5 — `spriteLimits`' departure is recorded at the definition, not only in this plan.** A decision that lives only in a plan file is a decision the next reader of `canvas-profiles.ts` will not find. The doc comment on the flag now states what 2B evaluates (the 4×4 frame bound), what it does not (per-scanline and per-frame limits), why (they are properties of an assembled frame with mappings), and that it is an owner-confirmed departure from spec §4.2.

**R6 — task 3's cost test was flaky by construction, and its replacement was too loose on the first attempt.** `expect(elapsed).toBeLessThan(150)` measured 71ms alone and 184ms inside the full suite, where ~250 files run in parallel: it was reading the machine's load. Replaced with a deterministic read count (a `Proxy` over the buffer). **The first replacement then failed the same way** — it allowed 12 reads/pixel, derived from the theoretical worst case, and the regression it exists to catch (materialising all four orientations per cell, which changes no answer and so trips no other test) came in at 6 and passed. Both bounds are now pinned one step above measured cost: varied art 3.13, fully symmetric art 11.00.

**R7 — import-side colour snapping was already tested in 2A; this plan added two assertions, not the coverage.** Task 10 was written as "verify the door 2A closed". It is closed, and `canvas-file-format.test.ts` *already* had `snaps an off-grid PLTE colour to the nearest Genesis word, verified against hand-computed values`. What was genuinely missing: an assertion that every channel lands **on** the hardware ladder (not merely on a hand-computed pair of values), and that the stored word round-trips so a later save cannot drift it. The plan's own suggested assertion — `channel % 36 === 0` — **was wrong**: the ladder is `round(n × 255/7)` = 0, 36, 73, 109, 146, 182, 219, 255, and 73 is not a multiple of 36. Verified against `decodeGenesisColor` rather than assumed.

**R8 — paste is the one unsnapped door, and it belongs to whichever plan lands paste.** 2A deferred copy/paste entirely (R17), so there is no path today by which unsnapped colour arrives that way, and building a snap for a door that does not exist is speculative. When paste lands, the snap belongs at `normalizeCanvasPixels`' choke point in `canvas-doc.ts` — the same place every other foreign-value path is folded — and **not** in the paste handler, which would make it the second place that decides what a legal pixel is.


**R9 — CDP found one real defect, and it was one no unit test could have found.** The tile readout
printed the internal zone slug: `17 free in ghz 1`, on the same status bar that says "Green Hill Zone
Act 1" a few inches away. `ZoneActRef.zone` holds a lowercase slug; every unit fixture in
`canvas-budget.test.ts` happened to pass an already-uppercase zone, so the tests were tidier than the
data. Fixed at the presentation boundary in `budgetReadout`, with a regression test that feeds it the
slug the store actually holds. Everything else in tasks 8 and 9 — the overlay, both toggles, profile
gating, the transparency rule, the grid-origin re-cut, the undo coupling, the no-count rule — was
correct on first contact with the running app.

**R10 — four harness defects, each of which first presented as an app bug.** Recorded because three
of the four would have been written up as defects by anyone who trusted the first run: the level pane
stays mounted at `display:none`, so `querySelector('footer')` read *its* status bar; a canvas file
left by the previous run made the next run's create refuse as a duplicate, so an entire run proceeded
against a level tab; the amber tint detector was calibrated against the nominal colour rather than
the low-alpha composite and could not see amber at all; and two checks asserted things that were
never true (the unique-tile count need not change when the grid origin moves, and one Ctrl+Z does not
undo a four-gesture paint). The common shape is the phase-1 lesson one level up — **every check that
failed had a fixture tidier than reality** — and the specific remedy that closed it is that
`makeCanvas` now *proves* it produced a focused canvas rather than returning as soon as it has
clicked Create. A setup step that cannot fail poisons every check after it.

**R11 — phase 2A's harness is now importable, and that is deliberate infrastructure.** Reusing it
cost one main-module guard and an export list; rewriting its launch discipline, helper bundle, input
dispatch and dialog driver would have cost a day and started by re-earning trust 2A's own report had
already paid for with three defects. Future phases should import it too.
