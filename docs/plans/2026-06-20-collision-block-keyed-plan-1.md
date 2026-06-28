# Collision v2 — Phase 1 (Block-Keyed Reuse Painting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` checkbox syntax.

**Goal:** Painting collision on the map applies to **every block with the same content** by default (the engine's block reuse), with **Alt** = "just here." Editor-only; builds on Phase 2a.

**Architecture:** A pure block-matching module (`collision-block.ts`) finds all 16px blocks (2×2 tiles) in the section whose 4 nametable words match the painted block. The Phase-2a `paintCollisionCell` handler paints the selected profile into every matched block's cells via one `set-collision-edit` command (multi-entry, undoable). Empty (all-zero) blocks and Alt paint only the clicked block. See `docs/specs/2026-06-20-collision-authoring-v2-block-keyed-design.md`.

**Tech Stack:** TypeScript, React 19, Vitest.

---

## Design notes
- A **block** = a 16px cell = the 2×2 tiles at an even-tile-aligned position (`cellCol*2, cellRow*2`). Its **content** = the 4 nametable words there. (Same unit Phase 2a already paints.)
- **Matching** = same 4 words. Reuse is **per-section** (scan this section's nametable).
- **Empty blocks** (all 4 words 0 = no art) do NOT reuse — painting them is "just here" (so collision on blank/invisible spots stays local, not smeared across every empty cell).
- The Phase-2a no-op filter (drop entries where `oldColl===newColl`) means dragging over already-painted matches emits nothing — cheap.

## File Structure
- **Create** `src/core/collision/collision-block.ts` + `test/collision/collision-block.test.ts`
- **Modify** `src/renderer/components/MapViewport.tsx` (paint handler) and `src/renderer/components/CollisionPalette.tsx` (hint text)

Gate every task: `npx tsc --noEmit && npm test && npm run build` green; raw-hex 0.

---

## Task A: block matching (pure)

**Files:** Create `src/core/collision/collision-block.ts`, `test/collision/collision-block.test.ts`

- [ ] **Step 1: Failing test**
```ts
// test/collision/collision-block.test.ts
import { describe, it, expect } from 'vitest';
import { blockTileWords, isEmptyBlock, findMatchingBlockCells } from '../../src/core/collision/collision-block';

// Build a tiny nametable: width W tiles. Helper sets a 2x2 block's 4 words.
function grid(w: number, h: number): Uint16Array { return new Uint16Array(w * h); }
function setBlock(nt: Uint16Array, w: number, cc: number, cr: number, words: [number, number, number, number]) {
  const tc = cc * 2, tr = cr * 2;
  nt[tr * w + tc] = words[0]; nt[tr * w + tc + 1] = words[1];
  nt[(tr + 1) * w + tc] = words[2]; nt[(tr + 1) * w + tc + 1] = words[3];
}

describe('blockTileWords / isEmptyBlock', () => {
  it('reads the 4 words of a 16px block', () => {
    const w = 8, nt = grid(w, 8);
    setBlock(nt, w, 1, 1, [10, 11, 12, 13]);
    expect(blockTileWords(nt, 1, 1, w)).toEqual([10, 11, 12, 13]);
  });
  it('isEmptyBlock true only when all four words are 0', () => {
    expect(isEmptyBlock([0, 0, 0, 0])).toBe(true);
    expect(isEmptyBlock([0, 0, 1, 0])).toBe(false);
  });
});

describe('findMatchingBlockCells', () => {
  it('returns every block cell with the same 4 words', () => {
    const w = 8, h = 8, nt = grid(w, h); // 4x4 block grid
    const shape: [number, number, number, number] = [5, 6, 7, 8];
    setBlock(nt, w, 0, 0, shape);
    setBlock(nt, w, 2, 1, shape);
    setBlock(nt, w, 3, 3, shape);
    setBlock(nt, w, 1, 1, [5, 6, 7, 9]); // one word differs — no match
    const cells = findMatchingBlockCells(nt, 0, 0, w, 4, 4);
    expect(cells.map((c) => `${c.cellCol},${c.cellRow}`).sort())
      .toEqual(['0,0', '2,1', '3,3'].sort());
  });
  it('an empty (all-zero) block matches only itself', () => {
    const w = 8, h = 8, nt = grid(w, h); // all zero
    const cells = findMatchingBlockCells(nt, 1, 1, w, 4, 4);
    expect(cells).toEqual([{ cellCol: 1, cellRow: 1 }]);
  });
});
```
- [ ] **Step 2:** `npx vitest run test/collision/collision-block.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/core/collision/collision-block.ts

/** The 4 nametable words of the 16px block (2x2 tiles) at cell (cellCol, cellRow). */
export function blockTileWords(nametable: Uint16Array, cellCol: number, cellRow: number, width: number): [number, number, number, number] {
  const tc = cellCol * 2, tr = cellRow * 2;
  return [
    nametable[tr * width + tc], nametable[tr * width + tc + 1],
    nametable[(tr + 1) * width + tc], nametable[(tr + 1) * width + tc + 1],
  ];
}

/** An all-zero block = no art; reuse is disabled for these (paint stays local). */
export function isEmptyBlock(words: [number, number, number, number]): boolean {
  return words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0;
}

/** Every block cell in the section whose 4 words match the block at (cellCol,
 *  cellRow) — the "apply to all matching blocks" set. An empty block matches
 *  only itself. `cellsW`/`cellsH` are the section's block-grid dimensions (=
 *  tiles/2). Returns the painted cell first. */
export function findMatchingBlockCells(
  nametable: Uint16Array, cellCol: number, cellRow: number, width: number, cellsW: number, cellsH: number,
): Array<{ cellCol: number; cellRow: number }> {
  const [a, b, c, d] = blockTileWords(nametable, cellCol, cellRow, width);
  if (isEmptyBlock([a, b, c, d])) return [{ cellCol, cellRow }];
  const out: Array<{ cellCol: number; cellRow: number }> = [];
  for (let cr = 0; cr < cellsH; cr++) {
    for (let cc = 0; cc < cellsW; cc++) {
      const tc = cc * 2, tr = cr * 2;
      if (nametable[tr * width + tc] === a && nametable[tr * width + tc + 1] === b
        && nametable[(tr + 1) * width + tc] === c && nametable[(tr + 1) * width + tc + 1] === d) {
        out.push({ cellCol: cc, cellRow: cr });
      }
    }
  }
  return out;
}
```
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** commit `feat(collision): block-content matching (find all blocks with the same tiles)`

---

## Task B: block-keyed paint + Alt override

**Files:** Modify `src/renderer/components/MapViewport.tsx`, `src/renderer/components/CollisionPalette.tsx`

- [ ] **Step 1: Import the matcher** (with the other collision-core imports in MapViewport.tsx):
```ts
import { findMatchingBlockCells } from '../../core/collision/collision-block';
```

- [ ] **Step 2: Rewrite `paintCollisionCell`** to paint all matching blocks (default) or just the clicked one (Alt). Replace the existing helper with:
```ts
  function paintCollisionCell(info: { sectionIndex: number; col: number; row: number }, justHere: boolean) {
    const section = getSectionByIndex(info.sectionIndex);
    if (!section || !section.collisionEdit) return;
    const cellCol = info.col >> 1, cellRow = info.row >> 1;
    const cellKey = `${info.sectionIndex}:${cellCol}:${cellRow}`;
    if (lastPaintedCell.current === cellKey) return;
    lastPaintedCell.current = cellKey;

    const profile = useEditorStore.getState().selectedCollisionProfile;
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;
    // Default: every block with the same content. Alt: only the clicked block.
    const targets = justHere
      ? [{ cellCol, cellRow }]
      : findMatchingBlockCells(section.tileGrid.nametable, cellCol, cellRow, SECTION_TILES_WIDE, cellsW, cellsH);

    const entries: Array<{ index: number; oldColl: number; newColl: number }> = [];
    for (const t of targets) {
      for (const index of cellTileIndices(t.cellCol, t.cellRow, SECTION_TILES_WIDE)) {
        const oldColl = section.collisionEdit[index];
        if (oldColl !== profile) entries.push({ index, oldColl, newColl: profile });
      }
    }
    if (entries.length === 0) return;
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    executeCommand({
      type: 'set-collision-edit',
      description: justHere ? `Paint collision (this block)` : `Paint collision (${targets.length} matching blocks)`,
      sectionIndex: info.sectionIndex,
      entries,
    }, level);
    useEditorStore.getState().setActiveSectionIndex(info.sectionIndex);
  }
```
(`getActiveLevel`/`useProjectStore`/`SECTION_TILES_HIGH`/`cellTileIndices` are already imported in this file — confirm before adding; do not duplicate.)

- [ ] **Step 3: Pass the Alt modifier from the handlers.** In the click handler's `paint-collision` branch, change the call to `paintCollisionCell(info, e.altKey);` (the mousedown event `e` is in scope). In the drag branch, change `paintCollisionCell(info);` to `paintCollisionCell(info, e.altKey);` (the drag handler's pointer event is in scope as `e`).

- [ ] **Step 4: Update the palette hint** in `CollisionPalette.tsx` — change the `hint` text to:
```tsx
        <div style={styles.hint}>Pick a shape, then paint on the map. Paints every block with the same tiles; hold Alt to paint just one.</div>
```

- [ ] **Step 5: Verify** `npx tsc --noEmit && npm test && npm run build` green; raw-hex 0.
- [ ] **Step 6:** commit `feat(collision): block-keyed reuse painting (default all-matching, Alt = just here)`

---

## Self-review checklist
- **Spec coverage:** §1 reuse-by-default (apply to all matching) ✓; Alt = just here ✓; empty blocks paint local ✓; per-section matching ✓; writes the same collisionEdit plane via set-collision-edit ✓.
- **No regression:** Phase 2a single-cell infra (cellTileIndices, set-collision-edit, collisionEdit, the palette) reused; legacy tileGrid.collision + selectedCollisionType untouched.
- **Performance:** matching is one 128×128 scan per painted cell; drag dedupes per cell + the no-op filter drops already-painted targets, so it stays cheap.

## Manual verification (user)
Paint a slope onto a block that repeats (e.g. a ground tile) → every instance of that block in the section gets the slope. Hold **Alt** and paint → only the one block changes. Paint on empty space → only that spot. Ctrl+Z reverts the whole reuse paint in one step. Path B / diff still work.
