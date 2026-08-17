# Classic Collision Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Collision facet write. Pick a shape for the block under a clicked cell, with the Link/Isolate switch deciding whether the change reaches every other use of that block or forks a copy for this one cell.

**Architecture:** Stage 3b of `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md`, on top of the merged lens (master `a39afce`). Both write paths already exist in the store and neither is new machinery: **Link** is `classicSetColind`, **Isolate** is `classicPaintSurface` carrying the `colind` override added in `9e5c654`. What this plan adds is the picker, the arming tool, and — the part that needs the most care — telling the truth about what Isolate costs.

**Tech Stack:** TypeScript, React, Zustand, vitest (node-only — no DOM, `.tsx` never executed, so `.tsx` is covered by source guards plus a CDP row).

---

## What already exists — do not rebuild it

| piece | where | note |
|---|---|---|
| the lookup | `src/core/level-classic/collision-probe.ts` | `probeCollision(doc, x, y)`, level pixels in |
| the clicked point | `classicLevelStore.collisionProbe` | cleared by `openAct`'s `fresh`, not just `reset()` |
| the panel | `components/classic/ClassicCollisionPanel.tsx` | `CellSection` / `BlockSection`, tokens throughout |
| **Link write** | `classicSetColind([{ blockId, value }])` | one undo step; already refuses block 0 and ids past the table |
| **Isolate write** | `classicPaintSurface(plan)` | `newBlocks: [{ def, sourceBlockId, colind }]` — the override from `9e5c654` |
| shape rendering | `columnSolidRun`, `heightSparkline` in `core/collision/collision-render.ts` | READ from `core/collision/`; do not modify that directory |
| the Link/Isolate mode | `classicLevelStore.paintDivergeMode` (`'isolate' \| 'link'`) | the art tiers' existing switch |

**Reuse `paintDivergeMode` rather than adding a collision-specific one.** The spec's §4.2 asks for "the SAME Link/Isolate switch art painting already has" so there is one mental model, and its chips are already labelled "Edits:" from `17783ae`. The cost is that it is shared and sticky: changing it here changes it for the art tiers too. That is the intended trade, but the panel must therefore label it exactly as the composer does, not invent a second vocabulary for the same field.

---

## The hazard this stage has to be honest about

**Isolate can silently extend the colind table**, and on GHZ it will.

GHZ ships **439 blocks against a 410-byte colind**. An Isolate appends block id 439. `classicPaintSurface` then builds the next table as `new Uint8Array(Math.max(nextBlocks.length, src.length))` — 440 bytes — and its own comment concedes the consequence: *"Growing it to cover a new id necessarily defines the entries in between."* Those in-between entries (410…438) become explicit **zeros**. In ROM those blocks currently resolve into the ADJACENT ZONE's table, so they may have real in-game collision that Aurora shows as air and would now overwrite with "no collision".

`s1-io` does not stop this: its guard (`s1-io.ts:605-617`) refuses a colind that would **shrink**, and this grows.

This is pre-existing on the art Isolate path and was accepted there with the reasoning written at `classicLevelStore.ts:967-981`. It is not new. But this is the stage where a user reaches for Isolate *deliberately and repeatedly*, so the editor must say what it is about to do rather than let the file quietly grow by 30 bytes. Task 3 is that warning, and it is not optional polish.

---

## Task 1: The shape choices, as a pure model

**Files:**
- Create: `src/core/level-classic/collision-choices.ts`
- Test: `src/core/level-classic/__tests__/collision-choices.test.ts`

The picker needs the 256 shapes ordered usefully. A flat 0…255 grid is not a picker, it is a haystack: per-zone distinct usage runs from 13 (MZ) to 109 (SLZ), so the shapes this zone actually uses are a small, meaningful set and everything else is the long tail.

- [ ] **Step 1: Write the failing test**

```ts
// WHICH SHAPES TO OFFER, AND IN WHAT ORDER.
//
// The table is global across all six zones — 256 slots, ~247 distinct patterns
// — but any one zone uses a small fraction of it. Offering all 256 flat makes
// the picker a haystack; offering only the used ones makes the editor unable to
// express anything new. So: this zone's set first, marked, then the rest.

import { describe, it, expect } from 'vitest';
import { collisionShapeChoices } from '../collision-choices';
import type { LevelDoc } from '../model';

function doc(colind: number[], shapeCount = 8): LevelDoc {
  return {
    collision: {
      colind: new Uint8Array(colind),
      shapes: {
        heights: Array.from({ length: shapeCount }, () => new Int8Array(16)),
        angles: new Uint8Array(shapeCount),
      },
    },
  } as unknown as LevelDoc;
}

describe('collisionShapeChoices', () => {
  it('puts the shapes this zone uses first, and marks them', () => {
    const c = collisionShapeChoices(doc([0, 5, 3, 5]));
    const used = c.filter((s) => s.usedInZone).map((s) => s.index);
    // 0 is "no collision" and is used; 3 and 5 are real shapes in use.
    expect(used).toEqual([0, 3, 5]);
    expect(c.slice(0, 3).map((s) => s.index)).toEqual([0, 3, 5]);
  });

  it('still offers every shape the table defines', () => {
    const c = collisionShapeChoices(doc([0, 5], 8));
    expect(c).toHaveLength(8);
    expect(new Set(c.map((s) => s.index)).size).toBe(8);
  });

  it('counts how many blocks point at each shape', () => {
    const c = collisionShapeChoices(doc([5, 5, 5, 3]));
    expect(c.find((s) => s.index === 5)!.blocks).toBe(3);
    expect(c.find((s) => s.index === 3)!.blocks).toBe(1);
    expect(c.find((s) => s.index === 1)!.blocks).toBe(0);
  });

  it('carries each shape heights so the picker need not reach into the doc', () => {
    const c = collisionShapeChoices(doc([0, 1]));
    expect(c[0].heights).toBeInstanceOf(Int8Array);
    expect(c[0].heights).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

- [ ] **Step 3: Implement.** `collisionShapeChoices(doc)` returns `Array<{ index: number; usedInZone: boolean; blocks: number; heights: Int8Array; angle: number }>`, used-first (ascending within each group), then the rest ascending. Document WHY the ordering exists, citing the per-zone usage range.

- [ ] **Step 4: Run it, watch it pass.**

- [ ] **Step 5: PLANT.** Drop the used-first sort so the list is plain ascending; confirm the first test fails. Restore.

- [ ] **Step 6: Commit.**

---

## Task 2: The two write paths, as one pure decision

**Files:**
- Create: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

Both writes already exist in the store. What does NOT exist is the decision between them, and the Isolate plan's exact shape. Putting that in a pure function keeps it testable and keeps the panel from assembling a `SurfaceEditPlan` inline.

- [ ] **Step 1: Write the failing test**

```ts
// LINK vs ISOLATE, decided once.
//
// Link is a one-entry colind write: the block's shape changes everywhere the
// block is used, zone-wide. Isolate clones the block, repoints THIS chunk cell
// at the clone, and gives the clone the new shape — same pixels, different
// collision, which is exactly what SurfaceEditPlan.newBlocks' colind override
// was added for.
//
// The refusals matter as much as the writes. Block 0 can never carry collision
// (the engine short-circuits), and a cell with no chunk has no block to change.

import { describe, it, expect } from 'vitest';
import { planCollisionWrite } from '../collision-write';
import type { CollisionProbe } from '../collision-probe';
import type { LevelDoc } from '../model';

const probe = (over: Partial<CollisionProbe> = {}): CollisionProbe => ({
  chunkId: 1, chunkIndex: 0, cellIndex: 5, blockId: 3, shapeIndex: 2, solidity: 3,
  collides: true, reason: null, chunkPlacements: 4, blockCells: 9,
  looping: false, loopAmbiguous: false, ...over,
});

function doc(): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[5] = { block: 3, xf: true, yf: false, solidity: 3 };
  return {
    chunks: [{ cells }],
    blocks: [0, 1, 2, 3].map(() => ({ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) })),
    collision: { colind: new Uint8Array([0, 0, 0, 2]), shapes: { heights: [], angles: new Uint8Array() } },
  } as unknown as LevelDoc;
}

describe('planCollisionWrite', () => {
  it('link is a single colind entry', () => {
    const r = planCollisionWrite(doc(), probe(), 7, 'link');
    expect(r).toMatchObject({ kind: 'link', entries: [{ blockId: 3, value: 7 }] });
  });

  it('isolate clones the block, repoints the cell, and overrides the clone shape', () => {
    const d = doc();
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    if (r.kind !== 'isolate') throw new Error('expected an isolate plan');
    // The clone is appended, so its id is the current length.
    expect(r.newBlockId).toBe(d.blocks.length);
    expect(r.plan.newBlocks).toEqual([
      { def: d.blocks[3], sourceBlockId: 3, colind: 7 },
    ]);
    // The cell keeps its flips and solidity and only changes which block it names.
    expect(r.plan.chunkCellEdits).toEqual([
      { chunkIndex: 0, cellIndex: 5, cell: { block: d.blocks.length, xf: true, yf: false, solidity: 3 } },
    ]);
    expect(r.plan.tileWrites).toEqual([]);
    expect(r.plan.blockCellEdits).toEqual([]);
  });

  it('refuses block 0 — the engine never reads its collision', () => {
    const r = planCollisionWrite(doc(), probe({ blockId: 0, reason: 'block0' }), 7, 'link');
    expect(r).toMatchObject({ kind: 'refused' });
    expect((r as { why: string }).why).toMatch(/blank block|block 0/i);
  });

  it('refuses a cell with no chunk', () => {
    const r = planCollisionWrite(doc(), probe({ chunkIndex: null, reason: 'air' }), 7, 'link');
    expect(r).toMatchObject({ kind: 'refused' });
    expect((r as { why: string }).why).toMatch(/air|no chunk/i);
  });

  it('reports when an isolate would EXTEND the colind table, and by how much', () => {
    // GHZ's shape in miniature: more blocks than the table has entries. The
    // clone's id is past the end, so growing the table to reach it defines
    // every entry in between — which in ROM currently resolves into the
    // adjacent zone's table.
    const d = doc();
    d.collision.colind = new Uint8Array([0, 0]);      // 2 entries, 4 blocks
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    if (r.kind !== 'isolate') throw new Error('expected an isolate plan');
    expect(r.extendsTableBy).toBe(3);                  // ids 2,3 defined + the new 4
  });

  it('reports no extension when the table already covers the new id', () => {
    const d = doc();
    d.collision.colind = new Uint8Array(64);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    if (r.kind !== 'isolate') throw new Error('expected an isolate plan');
    expect(r.extendsTableBy).toBe(0);
  });
});
```

> **Work `extendsTableBy` out from the fixture rather than trusting the number above.** With 4 blocks and a 2-entry table, the clone's id is 4 and the table must reach length 5, so entries 2, 3 and 4 all become defined where they were not — 3. If your implementation disagrees, decide which is right from the fixture before changing either, and say so.

- [ ] **Step 2: Run, watch it fail.**

- [ ] **Step 3: Implement** `planCollisionWrite(doc, probe, shapeIndex, mode)` returning a discriminated union: `{ kind: 'link', entries }`, `{ kind: 'isolate', plan, newBlockId, extendsTableBy }`, or `{ kind: 'refused', why }`.

  Document the refusals with their engine reasons, and document `extendsTableBy` with the GHZ numbers and what the in-between entries mean in ROM.

- [ ] **Step 4: Run, watch it pass.**

- [ ] **Step 5: PLANT.** Make the isolate branch drop the `colind` override (so the clone inherits the source's shape). Confirm the isolate test fails. Restore. — This is the exact regression the foundations' override was added to make impossible.

- [ ] **Step 6: Commit.**

---

## Task 3: Say what Isolate costs, before it costs it

**Files:**
- Modify: `src/renderer/components/classic/ClassicCollisionPanel.tsx`
- Test: `src/renderer/components/classic/__tests__/collision-panel.test.ts`

When the armed mode is Isolate and `extendsTableBy > 0`, the panel must say so **before** the click, in the same place the mode is chosen. Wording must name the real consequence, not "the table will grow":

> Isolate here appends block $1B7 and extends this zone's collision table by 30 entries. Blocks $19A–$1B6 currently have no entry of their own and resolve into the next zone's table in ROM; extending it writes them as "no collision".

It must also state the block budget: Isolate consumes one of 1024 block ids (`MAX_BLOCKS_TOTAL`, `classicLevelStore.ts:1288`).

- [ ] **Step 1: Extend the source guard**

```ts
  it('warns before an Isolate that would extend the collision table', () => {
    expect(src).toMatch(/extendsTableBy/);
    // The number alone is not the warning — what the entries MEAN is.
    expect(src).toMatch(/adjacent|next zone/i);
  });

  it('states the block budget Isolate spends', () => {
    expect(src).toMatch(/1024|MAX_BLOCKS_TOTAL/);
  });
```

- [ ] **Step 2: Run, watch it fail. Step 3: Implement. Step 4: Run, watch it pass.**

- [ ] **Step 5: PLANT.** Remove the "adjacent zone" half of the warning, leaving only the count; confirm the guard fails. Restore.

- [ ] **Step 6: Commit.**

---

## Task 4: Arm the tool

**Files:**
- Modify: `src/core/project/s1/index.ts` (`facetTools.collision`)
- Modify: `src/renderer/components/classic/ClassicMapToolOptions.tsx` (the classic hint)
- Modify: `src/renderer/components/classic/ClassicLevelViewport.tsx` (write on click when armed)
- Modify: `src/core/project/__tests__/s1-adapter.test.ts` (the `facetTools` assertion changes again)
- Test: `src/renderer/components/classic/__tests__/collision-probe-click.test.ts`

`facetTools.collision` becomes `['view', 'paint-collision']` — **`view` stays first, because the first entry is the facet default** (`renderer/workspace/facet-tools.ts:3`) and arriving on a facet holding a tool that writes is the thing the lens deliberately avoided. The user arms the write tool; they are not handed it.

The hint at `tool-meta.ts:46` reads *"Click to set the collision type on tiles"*, which is aeon's model (a type per tile). Classic assigns a SHAPE to a BLOCK, so the classic hint belongs in `ClassicMapToolOptions`'s own branch chain beside `stamp-chunk` / `place-object` / `select`, which is where classic already overrides per-tool copy.

The viewport must keep probing on every click regardless of tool — the panel should update whether or not you are armed — and write only when `paint-collision` is the active tool. Guard both halves.

- [ ] **Step 1: Extend the click guard** in `collision-probe-click.test.ts`:

```ts
  it('probes on every click but writes only when paint-collision is armed', () => {
    // The panel must update whether or not you are armed — a readout that only
    // works while holding a write tool is a readout you cannot consult before
    // deciding to write. The WRITE is what the tool gates.
    expect(VIEWPORT).toMatch(/setCollisionProbe/);
    expect(VIEWPORT, 'the write must be gated on the tool, not the facet')
      .toMatch(/paint-collision/);
  });
```

- [ ] **Step 2: Run, watch it fail. Step 3: implement. Step 4: run, watch it pass.**

- [ ] **Step 5: PLANT — mandatory.** Remove the tool condition so the write fires under `view` as well. Confirm a test fails. If nothing does, the guard above is too weak — strengthen it against your actual code shape before continuing, and say so in your report.

- [ ] **Step 6:** `npm test`, then commit.

---

## Task 5: The picker, wired

**Files:**
- Modify: `ClassicCollisionPanel.tsx` (the `This block` section)
- Test: `collision-panel.test.ts`

The shape grid from Task 1, this zone's shapes first and marked; the current shape indicated; clicking one routes through `planCollisionWrite` and dispatches the store command. The Link/Isolate chips reuse `paintDivergeMode` with the composer's own "Edits:" label.

Thumbnails: draw the 16 column heights with `columnSolidRun`, or use `heightSparkline` for a text-cheap version — pick one, and say in the docblock why. Do not add a new renderer to `core/collision/`.

Refusals must be visible, not silent: when `planCollisionWrite` returns `refused`, show the reason where the picker is, not in a toast that scrolls away.

**THE FOOTER IS NOW A LIE AND MUST CHANGE.** The panel reads *"Read-only for now — solidity is edited on the Chunk tab."* (`ClassicCollisionPanel.tsx:88`) and `collision-panel.test.ts:29` asserts `/Chunk tab/` to keep it there. Once this stage lands the facet writes, so the sentence is false in its first three words. It must become an accurate statement of the split — the shape is editable **here**, solidity is still the Chunk tab's — and the guard must be updated to assert the true claim rather than deleted. A stale reassurance is worse than none: someone reading "read-only" will not believe the change they just made was real.

- [ ] **Step 1: Extend the guard**

```ts
  it('routes every write through the pure planner', () => {
    // A panel that assembles a SurfaceEditPlan inline is a second copy of the
    // Link/Isolate decision, and the two will drift.
    expect(src).toMatch(/planCollisionWrite/);
    expect(src, 'the panel must not build a plan or call the store command itself')
      .not.toMatch(/newBlocks:|classicSetColind\(/);
  });

  it('no longer claims to be read-only, and still says where solidity lives', () => {
    expect(src).not.toMatch(/Read-only/i);
    expect(src).toMatch(/Chunk tab/);   // solidity is still edited there
  });

  it('shows a refusal where the picker is, not in a toast', () => {
    expect(src).toMatch(/refused/);
  });
```

- [ ] **Step 2: Run, watch it fail. Step 3: implement. Step 4: run, watch it pass.**

- [ ] **Step 5: PLANT — mandatory.** Bypass `planCollisionWrite` and call `classicSetColind` inline from the panel; confirm the first guard fails. Restore.

- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`, commit.

---

## Task 6: Verification

- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] **Drive it.** Adapt `scratchpad/collision-lens-harness.mjs`, which already opens s1disasm, clears the session, lands on GHZ act 1, selects the Collision pill and clicks exact level points. Add rows that:
  1. arm `paint-collision`, click a solid cell, pick a different shape, and read the panel back — the shape must change;
  2. press Ctrl+Z **once** and confirm the shape returns. This is the row the whole undo-routing task existed for, and the first that can actually prove it;
  3. switch to Isolate on GHZ and confirm the extend-warning appears with a non-zero count.
- [ ] The run must leave `s1disasm` unmodified — check `git -C /home/volence/sonic_hacks/s1disasm status --short` before and after. **Do not save.** Row 2's undo is the point; a saved colind would rewrite a real file.

---

## Not in this plan

Stage 4 (canvas-commit remediation — must assign `$FF`, since `$FB`–`$FE` are full-height 45° loop corners) and stage 5 (MCP parity: a classic `paint_collision` in facet coordinates, plus `commit_canvas` / `import_art_sheet`, which do not exist at all). Also not here: editing the shape TABLE itself, which the spec puts out of scope for the whole phase — ~17 free slots in a table shared by all six zones, three files to keep in sync, and no encoder.
