# Phase 2C Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the two shared primitives phase 2C needs — the flip-canonicaliser and the tile-pool matcher — out of the modules that already own them, and fix the latent slot double-booking defect the extraction exposes in shipped phase 1.

**Architecture:** Two new pure modules in `src/core/art/`. `tile-canon.ts` owns the canonical-orientation rule, extracted from `countUniqueTiles` so 2B's readout and 2C's dedup share one definition — the only way 2B's "commit can never claim more than this" promise is provable. `tile-pool-match.ts` owns "is this tile already in the pool", extracted from `classic-surface-plan.ts`'s private `findContentMatch` so both phases can call it, gaining an `allowFlips` flag and a three-state availability model. Phase 1's observable behaviour is unchanged except for the bugfix.

**Tech Stack:** TypeScript, Vitest (`npm test`), no new dependencies.

**Scope:** This is plan A of three. Plan B builds `canvas-resolve.ts` + `classic-commit-plan.ts`; plan C builds the store command, the targeting UI and the PNG import path. Each ships working software on its own; this one ships a real bugfix plus the primitives the rest stand on.

**Spec:** `docs/superpowers/specs/2026-08-15-phase-2c-resolve-and-commit-design.md`, §3 (extractions) and §2 D4.

---

## File Structure

| File | Responsibility |
|---|---|
| Create `src/core/art/tile-canon.ts` | The 8×8 cell side, entry extraction from a `PixelBuffer` region, and the canonical-orientation rule. No document types, no constraint logic. |
| Create `src/core/art/__tests__/tile-canon.test.ts` | Orientation choice including both-flips and ties; entry reading. |
| Modify `src/core/art/canvas-constraints.ts` | `countUniqueTiles` consumes `tile-canon` instead of restating the rule; `CELL` re-exported from its new home. |
| Create `src/core/art/tile-pool-match.ts` | `findPoolMatch` — exact and flip-aware — plus the three-state `PoolAvailability` structure. |
| Create `src/core/art/__tests__/tile-pool-match.test.ts` | Exact match, flip match, and both exclusion directions. |
| Modify `src/core/art/classic-surface-plan.ts` | Calls `findPoolMatch` instead of its private `findContentMatch`; matched slots become ineligible for allocation. |
| Modify `src/core/art/__tests__/classic-surface-plan.test.ts` | Adds the regression test for the double-booking defect. |

---

### Task 1: `tile-canon.ts` — the canonical-orientation rule

**Files:**
- Create: `src/core/art/tile-canon.ts`
- Test: `src/core/art/__tests__/tile-canon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/core/art/__tests__/tile-canon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { CELL, TILE_ENTRIES, readCellEntries, canonicalTile } from '../tile-canon';

/** An 8x8 cell's worth of entries from `fn(x, y)`. */
function entries(fn: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(TILE_ENTRIES);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out[y * CELL + x] = fn(x, y);
  return out;
}

const mirrorX = (e: Uint8Array) => entries((x, y) => e[y * CELL + (CELL - 1 - x)]);
const mirrorY = (e: Uint8Array) => entries((x, y) => e[(CELL - 1 - y) * CELL + x]);

describe('readCellEntries', () => {
  it('reads the low nibble, so a canvas line does not change the tile', () => {
    // Same shape drawn in line 0 and in line 3: (line << 4) | entry.
    const buf = createBuffer(16, 8);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const entry = (x + y) % 16;
        buf.data[y * 16 + x] = entry;              // line 0
        buf.data[y * 16 + (8 + x)] = (3 << 4) | entry; // line 3
      }
    }
    expect(readCellEntries(buf, 0, 0)).toEqual(readCellEntries(buf, 8, 0));
  });

  it('reads the cell at an offset, not the origin', () => {
    const buf = createBuffer(16, 8);
    buf.data[8] = 5; // (x=8, y=0)
    expect(readCellEntries(buf, 8, 0)[0]).toBe(5);
    expect(readCellEntries(buf, 0, 0)[0]).toBe(0);
  });
});

describe('canonicalTile', () => {
  it('gives all four orientations of one tile the same key', () => {
    const e = entries((x, y) => (x === 0 && y === 0 ? 1 : 0)); // asymmetric: one corner lit
    const keys = [e, mirrorX(e), mirrorY(e), mirrorX(mirrorY(e))].map((t) => canonicalTile(t).key);
    expect(new Set(keys).size).toBe(1);
  });

  it('reports the orientation that maps the cell to canonical, and back again', () => {
    const e = entries((x, y) => (x === 0 && y === 0 ? 1 : 0));
    const flipped = mirrorX(e);
    const a = canonicalTile(e);
    const b = canonicalTile(flipped);
    // Exactly one of the two needs an x-flip to reach canonical form.
    expect(a.xf).not.toBe(b.xf);
    expect(a.yf).toBe(b.yf);
  });

  it('distinguishes a transposed tile — the VDP has no transpose bit', () => {
    const e = entries((x, y) => (x === 0 && y === 1 ? 1 : 0));
    const transposed = entries((x, y) => (x === 1 && y === 0 ? 1 : 0));
    expect(canonicalTile(e).key).not.toBe(canonicalTile(transposed).key);
  });

  it('prefers the identity orientation when orientations tie', () => {
    const flat = entries(() => 7); // fully symmetric: all four orientations are equal
    expect(canonicalTile(flat)).toEqual({ key: canonicalTile(flat).key, xf: false, yf: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/art/__tests__/tile-canon.test.ts`
Expected: FAIL — `Failed to resolve import "../tile-canon"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/art/tile-canon.ts`:

```ts
// src/core/art/tile-canon.ts
//
// THE CANONICAL FORM OF AN 8x8 TILE, stated once.
//
// Two callers need to answer "are these the same tile, allowing for flips": 2B's
// unique-tile readout (canvas-constraints.ts) and 2C's commit dedup. That readout
// promises commit can never claim more slots than the number it shows, and the
// promise is only PROVABLE if both sides share one definition of sameness — two
// copies would drift, and the drift direction that over-counts makes the budget
// look tighter, so the number would never look wrong enough to question.
//
// KEYED ON ENTRIES, NOT ON CANVAS INDICES. A Genesis tile holds 4-bit entries;
// which palette LINE they resolve against comes from the block or sprite
// attribute referencing the tile, not from the tile. The same shape drawn in
// line 0 and line 3 is ONE tile referenced twice, which is how the shipped data
// is built.
//
// FLIPS ARE X, Y AND XY ONLY. The VDP has an H bit and a V bit and no transpose,
// so a rotated tile is a different tile; folding rotations in here would have 2C
// emit art that draws wrong.
//
// Pure core — no store, no React, no document types.

import type { PixelBuffer } from './pixel-ops';
import { paletteEntryOf } from './canvas-doc';

/** A Genesis tile is 8x8. Hardware. */
export const CELL = 8;
/** Entries in one tile. */
export const TILE_ENTRIES = CELL * CELL;

export interface CanonicalTile {
  /** Equal for two cells that are the same tile under some flip. */
  key: string;
  /**
   * The orientation relating this cell to its canonical form. Flips are
   * involutions, so this maps the cell TO canonical and canonical BACK to the
   * cell — which is why a block cell storing these bits renders the drawn cell.
   */
  xf: boolean;
  yf: boolean;
}

/**
 * The 8x8 cell at (x0, y0), as 64 palette ENTRIES.
 *
 * `out` is an optional scratch buffer: this runs once per cell and a max-size
 * canvas holds 16 384 of them, so the caller is given a way to avoid 16 384
 * allocations. Not required — omit it and get a fresh array.
 */
export function readCellEntries(
  pixels: PixelBuffer, x0: number, y0: number, out?: Uint8Array,
): Uint8Array {
  const dst = out ?? new Uint8Array(TILE_ENTRIES);
  for (let y = 0; y < CELL; y++) {
    const src = (y0 + y) * pixels.width + x0;
    for (let x = 0; x < CELL; x++) dst[y * CELL + x] = paletteEntryOf(pixels.data[src + x]);
  }
  return dst;
}

/**
 * The canonical orientation: the lexicographically smallest of the four.
 *
 * Chosen WITHOUT materialising all four — the loop walks the 64 positions once,
 * keeping the set of orientations still tied for smallest, so the common case
 * (an early entry decides it) costs a handful of comparisons.
 *
 * TIES PREFER THE IDENTITY. A fully symmetric tile is equal in all four
 * orientations, and `tied[0]` is orientation 0 because the candidate list starts
 * ascending — so a tile that needs no flip is never reported as needing one.
 * Ties produce identical bytes, so this can only affect the reported
 * orientation, never the key.
 */
export function canonicalTile(entries: Uint8Array): CanonicalTile {
  // Orientation as two bits — bit 0 flips x, bit 1 flips y — rather than four
  // closures returning [sx, sy]: this runs up to 64 x 4 times per cell, and a
  // two-element array per read would be millions of allocations per scan.
  const at = (o: number, i: number): number => {
    const cx = i % CELL, cy = (i / CELL) | 0;
    const sx = (o & 1) ? CELL - 1 - cx : cx;
    const sy = (o & 2) ? CELL - 1 - cy : cy;
    return entries[sy * CELL + sx];
  };

  let tied = [0, 1, 2, 3];
  for (let i = 0; i < TILE_ENTRIES && tied.length > 1; i++) {
    let min = 16;
    for (const o of tied) { const v = at(o, i); if (v < min) min = v; }
    tied = tied.filter((o) => at(o, i) === min);
  }
  const winner = tied[0];
  const scratch = new Uint8Array(TILE_ENTRIES);
  for (let i = 0; i < TILE_ENTRIES; i++) scratch[i] = at(winner, i);
  return {
    key: String.fromCharCode(...scratch),
    xf: (winner & 1) !== 0,
    yf: (winner & 2) !== 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/art/__tests__/tile-canon.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/tile-canon.ts src/core/art/__tests__/tile-canon.test.ts
git commit -m "feat(art): extract the tile canonical-orientation rule

2B's unique-tile readout and 2C's commit dedup both need one definition of
'same tile, allowing flips'. The readout promises commit can never claim more
slots than it shows, and that is only provable if both read the same rule."
```

---

### Task 2: `countUniqueTiles` consumes `tile-canon`

The behaviour must not change. The guard is the existing `canvas-constraints` suite passing **without being edited**.

**Files:**
- Modify: `src/core/art/canvas-constraints.ts:20-21` (the `CELL` definition) and `:169-199` (`countUniqueTiles`)

- [ ] **Step 1: Confirm the existing suite is green before touching anything**

Run: `npx vitest run src/core/art/__tests__/canvas-constraints.test.ts`
Expected: PASS. Note the test count — it must be identical after the refactor.

- [ ] **Step 2: Replace the `CELL` definition with a re-export**

In `src/core/art/canvas-constraints.ts`, delete these two lines:

```ts
/** A Genesis tile is 8x8. The 16 and 256 grids are guides; this one is a rule. */
export const CELL = 8;
```

and add to the import block at the top, after the `canvas-doc` imports:

```ts
import { CELL, TILE_ENTRIES, readCellEntries, canonicalTile } from './tile-canon';

/** Re-exported from its owner: the 8x8 rule now lives in tile-canon, which 2C
 *  shares. Kept exported here so existing importers do not move. */
export { CELL };
```

- [ ] **Step 3: Replace the body of `countUniqueTiles`**

Replace the whole function body (everything between `export function countUniqueTiles(...)` and its closing brace) with:

```ts
export function countUniqueTiles(pixels: PixelBuffer, origin: CanvasGridOrigin): UniqueTileCount {
  const seen = new Set<string>();
  let fullCells = 0, pixelsOutsideGrid = 0;
  const scratch = new Uint8Array(TILE_ENTRIES);

  for (const cell of canvasCells(pixels.width, pixels.height, origin)) {
    if (!cell.full) { pixelsOutsideGrid += cell.w * cell.h; continue; }
    fullCells++;
    seen.add(canonicalTile(readCellEntries(pixels, cell.x, cell.y, scratch)).key);
  }
  return { unique: seen.size, fullCells, pixelsOutsideGrid };
}
```

Leave the function's doc comment in place, but replace its last two paragraphs (the ones describing the orientation bits and the tie-breaking loop) with:

```
 * The canonical form and the entry-keying rule both live in tile-canon.ts, which
 * 2C's commit dedup also reads — see its header for why there is exactly one
 * copy of that rule.
```

- [ ] **Step 4: Run the suite to verify nothing changed**

Run: `npx vitest run src/core/art/__tests__/canvas-constraints.test.ts`
Expected: PASS, with the **same test count** as Step 1 and no edits to the test file.

- [ ] **Step 5: Prove the shared rule is actually shared**

Plant a deliberate bug: in `src/core/art/tile-canon.ts`, change `let tied = [0, 1, 2, 3];` to `let tied = [0];` (canonicalisation now ignores flips entirely).

Run: `npx vitest run src/core/art/__tests__/tile-canon.test.ts src/core/art/__tests__/canvas-constraints.test.ts`
Expected: **BOTH suites FAIL.** That two-witness failure is the whole point of the extraction — if only one fails, the refactor did not land and `countUniqueTiles` is still using its own copy.

Confirm the plant applied before believing the result:

```bash
grep -n "let tied = \[0\];" src/core/art/tile-canon.ts
```
Expected: one match. If there is no match, the edit did not apply and the test result means nothing.

Now revert it:

```bash
git checkout src/core/art/tile-canon.ts
grep -n "let tied = \[0, 1, 2, 3\];" src/core/art/tile-canon.ts
```
Expected: one match.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

```bash
git add src/core/art/canvas-constraints.ts
git commit -m "refactor(art): countUniqueTiles reads the shared canonicaliser

Behaviour-identical — the canvas-constraints suite passes unedited. Verified
two-witness: planting a wrong orientation in tile-canon now fails both that
suite and tile-canon's own."
```

---

### Task 3: `tile-pool-match.ts` — extract the matcher, exact-only

Phase 1's behaviour must not change in this task. `allowFlips` arrives in Task 5.

**Files:**
- Create: `src/core/art/tile-pool-match.ts`
- Test: `src/core/art/__tests__/tile-pool-match.test.ts`
- Modify: `src/core/art/classic-surface-plan.ts:82-105` (remove `bytesEqualAt` and `findContentMatch`), `:285`

- [ ] **Step 1: Write the failing test**

Create `src/core/art/__tests__/tile-pool-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findPoolMatch, emptyAvailability } from '../tile-pool-match';

const TILE_BYTES = 32;

/** A pool of `n` tiles where tile t is filled with byte value t. */
function pool(n: number): Uint8Array {
  const p = new Uint8Array(n * TILE_BYTES);
  for (let t = 0; t < n; t++) p.fill(t, t * TILE_BYTES, (t + 1) * TILE_BYTES);
  return p;
}

const want = (v: number) => new Uint8Array(TILE_BYTES).fill(v);

describe('findPoolMatch — exact', () => {
  it('finds a byte-identical tile', () => {
    const r = findPoolMatch(pool(8), want(5), emptyAvailability(), { allowFlips: false });
    expect(r).toEqual({ tileIndex: 5, xf: false, yf: false });
  });

  it('returns null when nothing matches', () => {
    expect(findPoolMatch(pool(8), want(99), emptyAvailability(), { allowFlips: false })).toBeNull();
  });

  it('skips a slot whose bytes this gesture already replaced', () => {
    const avail = emptyAvailability();
    avail.allocated.add(5);
    expect(findPoolMatch(pool(8), want(5), avail, { allowFlips: false })).toBeNull();
  });

  it('still matches a slot this gesture merely REUSED — its bytes are unchanged', () => {
    const avail = emptyAvailability();
    avail.matched.add(5);
    const r = findPoolMatch(pool(8), want(5), avail, { allowFlips: false });
    expect(r).toEqual({ tileIndex: 5, xf: false, yf: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/art/__tests__/tile-pool-match.test.ts`
Expected: FAIL — `Failed to resolve import "../tile-pool-match"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/art/tile-pool-match.ts`:

```ts
// src/core/art/tile-pool-match.ts
//
// "IS THIS TILE ALREADY IN THE POOL?" — one answer, two callers.
//
// Lifted out of classic-surface-plan.ts, where it was private, because 2C needs
// the identical question with flips allowed. Phase 1 asks with allowFlips
// false and behaves exactly as it always did.
//
// THREE STATES, NOT ONE EXCLUSION SET. A gesture touches pool slots in two ways
// and they are not interchangeable:
//
//   matched   — reused as-is. Its bytes are what is on disk, so it stays a legal
//               match for another cell wanting the same content (that is the
//               conservation this whole function exists for) — but it must NOT
//               be handed out as a free slot, or the allocator overwrites art a
//               block is already pointing at.
//   allocated — given new bytes this gesture. Neither matchable (its on-disk
//               bytes are stale, so a match would repoint one cell at another's
//               paint) nor allocatable.
//
// Collapsing these into one set costs correctness in one direction or
// conservation in the other. See the spec's §2 D4 table.
//
// Pure core — no store, no document types.

import { canonicalTile, TILE_ENTRIES } from './tile-canon';

export const TILE_BYTES = 32;

/** Pool slots this gesture has already committed to. See the header. */
export interface PoolAvailability {
  /** Reused as-is: still matchable, never allocatable. */
  matched: Set<number>;
  /** Given new bytes: neither matchable nor allocatable. */
  allocated: Set<number>;
}

export function emptyAvailability(): PoolAvailability {
  return { matched: new Set<number>(), allocated: new Set<number>() };
}

/** Every slot that must not be handed out as free. */
export function unavailableForAllocation(a: PoolAvailability): Set<number> {
  return new Set<number>([...a.matched, ...a.allocated]);
}

export interface PoolMatch {
  tileIndex: number;
  /** The orientation a referencing cell must carry to render `want`. */
  xf: boolean;
  yf: boolean;
}

function bytesEqualAt(pool: Uint8Array, tileIndex: number, w: Uint8Array): boolean {
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) if (pool[base + i] !== w[i]) return false;
  return true;
}

/** The 64 entries of a packed 4bpp tile — two entries per byte, high nibble first. */
export function poolTileEntries(pool: Uint8Array, tileIndex: number, out?: Uint8Array): Uint8Array {
  const dst = out ?? new Uint8Array(TILE_ENTRIES);
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) {
    const b = pool[base + i];
    dst[i * 2] = (b >> 4) & 0x0f;
    dst[i * 2 + 1] = b & 0x0f;
  }
  return dst;
}

/**
 * A pool tile whose content equals `want`, or null.
 *
 * With `allowFlips`, "equals" means "equals under one of the four VDP
 * orientations", and the returned xf/yf are what a referencing cell must carry.
 * Without it, only a byte-identical tile matches and the orientation is always
 * false/false — which is exactly phase 1's historical behaviour.
 */
export function findPoolMatch(
  pool: Uint8Array,
  want: Uint8Array,
  availability: PoolAvailability,
  opts: { allowFlips: boolean },
): PoolMatch | null {
  const count = Math.floor(pool.length / TILE_BYTES);
  if (!opts.allowFlips) {
    for (let t = 0; t < count; t++) {
      if (availability.allocated.has(t)) continue;
      if (bytesEqualAt(pool, t, want)) return { tileIndex: t, xf: false, yf: false };
    }
    return null;
  }

  const wantCanon = canonicalTile(poolTileEntriesFromBytes(want));
  const scratch = new Uint8Array(TILE_ENTRIES);
  for (let t = 0; t < count; t++) {
    if (availability.allocated.has(t)) continue;
    const canon = canonicalTile(poolTileEntries(pool, t, scratch));
    if (canon.key !== wantCanon.key) continue;
    // Both sides are expressed relative to the SAME canonical form, so the
    // orientation a cell needs is the one that takes the stored tile to
    // canonical and canonical on to `want` — the XOR of the two. Flips are
    // involutions, so this composes without a direction to get backwards.
    return {
      tileIndex: t,
      xf: canon.xf !== wantCanon.xf,
      yf: canon.yf !== wantCanon.yf,
    };
  }
  return null;
}

/** `poolTileEntries` for a standalone 32-byte tile rather than a pool slot. */
function poolTileEntriesFromBytes(bytes: Uint8Array): Uint8Array {
  const dst = new Uint8Array(TILE_ENTRIES);
  for (let i = 0; i < TILE_BYTES; i++) {
    dst[i * 2] = (bytes[i] >> 4) & 0x0f;
    dst[i * 2 + 1] = bytes[i] & 0x0f;
  }
  return dst;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/art/__tests__/tile-pool-match.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Point `classic-surface-plan.ts` at it**

In `src/core/art/classic-surface-plan.ts`, delete `bytesEqualAt` (lines 82–86), delete `findContentMatch` and its doc comment (lines 88–105), and delete the `const TILE_BYTES = 32;` line (line 77). Add to the imports:

```ts
import { findPoolMatch, emptyAvailability, unavailableForAllocation, TILE_BYTES } from './tile-pool-match';
import type { PoolAvailability } from './tile-pool-match';
```

Replace the match call at line 285:

```ts
    const match = findContentMatch(doc, wantBytes, claimed);
    if (match !== null) {
      targetTile = match;
    } else {
```

with:

```ts
    const match = findPoolMatch(doc.tiles, wantBytes, avail, { allowFlips: false });
    if (match !== null) {
      // Reused as-is. Recorded so the allocator below cannot hand this same slot
      // to a later cell and overwrite the bytes this one is now pointing at.
      avail.matched.add(match.tileIndex);
      targetTile = match.tileIndex;
    } else {
```

Rename the gesture's claim set. Replace line 179:

```ts
  const claimed = new Set<number>();
```

with:

```ts
  const avail: PoolAvailability = emptyAvailability();
```

and update the two remaining `claimed` uses in the allocation branch:

```ts
      const slot = findFreeSlot(doc, index, isEditableTile, reserved, unavailableForAllocation(avail));
      if (slot === null) {
        return {
          ok: false,
          reason: 'no free editable tile slot to hold the divergent copy — this zone is at its tile limit. Switch to Link mode to edit every place at once.',
        };
      }
      avail.allocated.add(slot);
```

- [ ] **Step 6: Run phase 1's suite — it must pass unedited**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS. Do **not** edit this test file in this task; it passing untouched is the guard that phase 1's behaviour is unchanged.

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: exit 0.

```bash
git add src/core/art/tile-pool-match.ts src/core/art/__tests__/tile-pool-match.test.ts src/core/art/classic-surface-plan.ts
git commit -m "refactor(art): extract findPoolMatch from the surface planner

2C needs the same question with flips allowed, and a private function cannot be
shared. Phase 1 passes allowFlips false; its suite passes unedited."
```

---

### Task 4: fix the slot double-booking defect in phase 1

A latent defect found while extracting the matcher: a content-matched slot was never recorded, so the allocator could hand the same slot to a later cell and overwrite it. Task 3 introduced the structure that fixes it; this task proves the fix with a test that **fails against the pre-fix code**.

**Files:**
- Modify: `src/core/art/__tests__/classic-surface-plan.test.ts`

- [ ] **Step 1: Verify the defect is real against the pre-fix code**

```bash
git stash push src/core/art/classic-surface-plan.ts
grep -n "claimed" src/core/art/classic-surface-plan.ts
```
Expected: matches on the OLD `const claimed = new Set<number>();` — confirming the working tree is back on the unfixed version.

- [ ] **Step 2: Write the regression test**

Append to `src/core/art/__tests__/classic-surface-plan.test.ts`:

```ts
describe('planSurfaceEdit — slot double-booking (regression)', () => {
  /**
   * Two chunk cells whose tiles are both linked, so both must diverge. The first
   * one's painted result happens to equal the bytes already sitting in free slot
   * 12; the second one needs a fresh slot. Before the fix, the matcher handed
   * cell A slot 12 without recording it, and findFreeSlot then handed the SAME
   * slot to cell B — so A's block pointed at B's paint.
   */
  it('never allocates a slot another cell in the same gesture matched', () => {
    const doc = makeDoc();
    const index = buildUsageIndex(doc);

    // Slot 12 is unreferenced (makeDoc only uses tiles 1..8) and holds the bytes
    // that painting value 9 over tile 5's top-left pixel produces.
    const painted = new Uint8Array(doc.tiles.subarray(5 * 32, 6 * 32));
    painted[0] = (9 << 4) | (painted[0] & 0x0f);
    doc.tiles.set(painted, 12 * 32);

    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index, mode: 'isolate', isEditableTile: allEditable,
      // Two cells that both reference the shared block/tile, so both diverge.
      writes: [{ x: 0, y: 8, value: 9 }, { x: 16, y: 8, value: 10 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const targets = r.plan.blockCellEdits.map((e) => e.cell.tile);
    const written = r.plan.tileWrites.map((w) => w.tileIndex);
    // No slot may be both repointed-to by one cell and written by another.
    for (const w of written) {
      const repointedElsewhere = targets.filter((t) => t === w).length;
      const writtenHere = written.filter((t) => t === w).length;
      expect(writtenHere).toBe(1);
      expect(repointedElsewhere).toBeLessThanOrEqual(1);
    }
    expect(new Set(written).size).toBe(written.length);
  });
});
```

- [ ] **Step 3: Run it against the unfixed code and watch it fail**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts -t "double-booking"`
Expected: **FAIL.** A test that passes here is testing nothing — if it passes, the fixture did not reproduce the collision and must be corrected before continuing.

- [ ] **Step 4: Restore the fix**

```bash
git stash pop
grep -n "avail.matched.add" src/core/art/classic-surface-plan.ts
```
Expected: one match.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run src/core/art/__tests__/classic-surface-plan.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/__tests__/classic-surface-plan.test.ts
git commit -m "fix(art): never allocate a slot another cell already matched

Shipped defect in phase 1, found while extracting the matcher. A content match
was taken without being recorded, so findFreeSlot could hand the same slot to a
later cell in the same gesture and overwrite bytes the earlier cell's block was
already pointing at. Reachable because free pool slots hold leftover art, not
zeros. The regression test fails against the pre-fix code."
```

---

### Task 5: flip-aware matching, proven against real pool data

**Files:**
- Modify: `src/core/art/__tests__/tile-pool-match.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/core/art/__tests__/tile-pool-match.test.ts`:

```ts
import { poolTileEntries, TILE_BYTES as TB } from '../tile-pool-match';
import { canonicalTile } from '../tile-canon';

/** Pack 64 entries into a 32-byte 4bpp tile, high nibble first. */
function pack(entries: Uint8Array): Uint8Array {
  const out = new Uint8Array(TB);
  for (let i = 0; i < TB; i++) out[i] = ((entries[i * 2] & 15) << 4) | (entries[i * 2 + 1] & 15);
  return out;
}

const asymmetric = () => {
  const e = new Uint8Array(64);
  e[0] = 1; e[9] = 2; // two lit entries, no symmetry in any axis
  return e;
};

const flipX = (e: Uint8Array) => {
  const o = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) o[y * 8 + x] = e[y * 8 + (7 - x)];
  return o;
};

describe('findPoolMatch — flip-aware', () => {
  it('matches an x-flipped tile and reports the flip', () => {
    const stored = pack(asymmetric());
    const pool = new Uint8Array(TB * 4);
    pool.set(stored, 2 * TB);
    const want = pack(flipX(asymmetric()));

    const r = findPoolMatch(pool, want, emptyAvailability(), { allowFlips: true });
    expect(r).not.toBeNull();
    expect(r!.tileIndex).toBe(2);
    expect(r!.xf).toBe(true);
    expect(r!.yf).toBe(false);
  });

  it('does not match a flip when allowFlips is off', () => {
    const pool = new Uint8Array(TB * 4);
    pool.set(pack(asymmetric()), 2 * TB);
    const want = pack(flipX(asymmetric()));
    expect(findPoolMatch(pool, want, emptyAvailability(), { allowFlips: false })).toBeNull();
  });

  it('reports an orientation that actually reproduces the wanted tile', () => {
    const pool = new Uint8Array(TB * 4);
    pool.set(pack(asymmetric()), 2 * TB);
    const want = pack(flipX(asymmetric()));
    const r = findPoolMatch(pool, want, emptyAvailability(), { allowFlips: true })!;
    // Applying the reported orientation to the STORED tile must give `want`.
    const storedEntries = poolTileEntries(pool, r.tileIndex);
    const applied = new Uint8Array(64);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sx = r.xf ? 7 - x : x, sy = r.yf ? 7 - y : y;
        applied[y * 8 + x] = storedEntries[sy * 8 + sx];
      }
    }
    expect(Array.from(applied)).toEqual(Array.from(poolTileEntries(want, 0)));
    // And the canonical keys agree, which is what the matcher actually compared.
    expect(canonicalTile(applied).key).toBe(canonicalTile(poolTileEntries(want, 0)).key);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/core/art/__tests__/tile-pool-match.test.ts`
Expected: PASS, 7 tests. The flip-aware branch was written in Task 3; this task is the proof that its XOR composes in the right direction, which is the single most error-prone line in the module.

If the third test fails, the xf/yf XOR in `findPoolMatch` is inverted — that is exactly what this test exists to catch, and it must be fixed in `tile-pool-match.ts`, not in the test.

- [ ] **Step 3: Verify against real s1disasm pool data**

Synthetic fixtures are tidier than reality, which has been the dominant defect class in this codebase. Write a scratch check that runs the matcher over a real decompressed GHZ pool:

Create `scratchpad/flip-match-real-data.mjs` — see `docs/superpowers/specs/2026-08-15-in-app-art-authoring-design.md` §0 C4 for the expected magnitude: GHZ should report on the order of **111** flip-duplicate tiles, LZ and SBZ **0**.

Run it and compare. A GHZ count near zero means the flip branch is not firing; a count wildly above 111 means it is matching things it should not.

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npm test`
Expected: PASS — 2816+ passed, 3 skipped, no new failures.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/__tests__/tile-pool-match.test.ts
git commit -m "test(art): prove the flip-aware match composes in the right direction

The XOR that turns two canonical orientations into the flip a referencing cell
must carry is the most error-prone line in the module. Verified by applying the
reported orientation to the stored tile and comparing to the wanted one, and
against real GHZ pool data (C4 measured 111 flip-duplicates there, 0 in LZ)."
```

---

## Self-Review

**Spec coverage.** This plan covers §3's two extractions and §2 D4 in full: `tile-canon` (Tasks 1–2), `findPoolMatch` with `allowFlips` and the three-state availability model (Tasks 3, 5), and the latent phase-1 defect D4 names (Task 4). Everything else in the spec — reclaim, the palette gate, collision inheritance, id spaces, the report, the store command, the UI, the PNG path — belongs to plans B and C and is deliberately absent here.

**Placeholders.** None: every step names exact files, exact commands, expected output, and complete code. The one item that is not literal code is Task 5 Step 3's scratch script, which is a verification against real data rather than shipped code; its expected magnitudes are given so a wrong result is recognisable.

**Type consistency.** `PoolAvailability` / `emptyAvailability` / `unavailableForAllocation` / `PoolMatch` / `findPoolMatch` / `poolTileEntries` / `TILE_BYTES` are defined in Task 3 and used with those exact names in Tasks 3–5. `CELL` / `TILE_ENTRIES` / `readCellEntries` / `canonicalTile` / `CanonicalTile` are defined in Task 1 and used with those names in Tasks 2–3, 5. `canonicalTile` returns `{ key, xf, yf }` everywhere.

**Known wrinkle carried into plan B.** `poolTileEntries` assumes high-nibble-first packing. That matches `classic-tile-buffer.ts`'s existing reader; plan B's first task should assert the two agree rather than assume it, because a swapped nibble order would make every flip match wrong in a way that still looks like art.
