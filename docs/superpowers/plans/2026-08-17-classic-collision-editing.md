# Classic Collision Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Collision facet write. Pick a shape for the block under a clicked cell, with a Link/Isolate switch deciding whether the change reaches every use of that block or forks a copy for this one cell.

**Architecture:** Stage 3b of `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md`, on top of the merged lens (master `a39afce`). Both write paths already exist in the store and neither is new machinery: **Link** is `classicSetColind`, **Isolate** is `classicPaintSurface` carrying the `colind` override added in `9e5c654`. What this plan adds is one armed shape, a picker, an arming tool, one pure decision function between them, and the refusals that stop two operations doing quiet damage.

**Tech Stack:** TypeScript, React, Zustand, vitest (node-only — no DOM, `.tsx` never executed, so `.tsx` is covered by source guards plus a CDP row).

---

## Decisions taken before this plan was written

An adversarial review of the first draft found it unimplementable — it described two disconnected write models and never joined them. These were then settled by the owner, and the plan below is built on them rather than re-opening them:

1. **Both ways to write.** There is ONE armed shape. Clicking a swatch applies it to the cell you last probed *and* arms it; arming `paint-collision` then applies that same shape to each cell you click. Two gestures, one piece of state — not two write models.
2. **Collision gets its OWN Link/Isolate field, defaulting to Link.** Not the art tiers' `paintDivergeMode`. That field initialises to `'isolate'` (`classicLevelStore.ts:367`) while spec §4.5 requires the facet to default to Link, and it is sticky across surfaces — setting Link here would silently re-arm Link in the art composer, where the next stroke propagates pixels to every use of a shared tile.
3. **Refuse the table growth; warn on the loop alias.** An Isolate that would extend the colind table is refused outright, matching `classicSetColind`'s existing refusal of the same overhang ids. A write to a loop-ambiguous cell warns but proceeds.

---

## What already exists — do not rebuild it

| piece | where | note |
|---|---|---|
| the lookup | `src/core/level-classic/collision-probe.ts` | `probeCollision(doc, x, y)`, level pixels in |
| the clicked point | `classicLevelStore.collisionProbe` | cleared by `openAct`'s `fresh`, not just `reset()` |
| the panel | `components/classic/ClassicCollisionPanel.tsx` | `CellSection` / `BlockSection`, tokens throughout |
| **Link write** | `classicSetColind([{ blockId, value }])` | one undo step; refuses block 0 (`:1233`) and ids past the table (`:1252`) |
| **Isolate write** | `classicPaintSurface(plan)` | `newBlocks: [{ def, sourceBlockId, colind }]` — the override from `9e5c654` |
| shape rendering | `columnSolidRun`, `heightSparkline` in `core/collision/collision-render.ts` | READ from `core/collision/`; do not modify that directory |
| undo | `collision` is already in `ZONE_ART_FACETS` (`editorStore.ts:223`) | an Isolate undo restores blocks + colind + chunks together (`:599-608`) — the clone is not stranded |

---

## The hazard this stage refuses

**Isolate can extend the colind table, and where it would, it is refused.**

A zone's colind can be SHORTER than its block list. Cloning a block appends an id past the end, and `classicPaintSurface` then builds `new Uint8Array(Math.max(nextBlocks.length, src.length))` — its own comment (`classicLevelStore.ts:988-1015`) concedes that *"Growing it to cover a new id necessarily defines the entries in between."* Those entries become explicit **zeros**. In ROM they currently resolve into the ADJACENT ZONE's table, so they may carry real in-game collision that Aurora shows as air and would overwrite with "no collision". `s1-io.ts:607-618` refuses a colind that would SHRINK and permits one that grows, so nothing downstream stops it.

**Measured, so the cost of refusing is known rather than assumed** (block counts read from the running app; colind sizes from the files):

| zone | colind | blocks | Isolate |
|---|---|---|---|
| **ghz** | 410 | 439 | **refused** — would define 30 entries |
| lz | 200 | 196 | allowed |
| mz | 400 | 372 | allowed |
| slz | 500 | 414 | allowed |
| syz | 500 | 431 | allowed |
| **sbz** | 600 | 602 | **refused** — would define 3 entries |

Two zones of six. The refusal must therefore SAY which zone it is on and what the alternative is (edit the block's shape with Link, accepting it changes every use), not merely decline.

**Why refuse rather than warn:** `classicSetColind` already refuses a Link write to those same overhang ids. Warning-only on Isolate would mean a user refused on Link flips one chip and performs the strictly more damaging operation — the same zero-fill, plus a spent block id. Precedent from the art Isolate path is precedent, not justification.

---

## Task 1: The shape choices, as a pure model

**Files:**
- Create: `src/core/level-classic/collision-choices.ts`
- Test: `src/core/level-classic/__tests__/collision-choices.test.ts`

Per-zone distinct shape usage runs from 13 (MZ) to 109 (SLZ), so a flat 0…255 grid is a haystack. This zone's shapes come first, marked.

**Block 0's entry does not count as "used".** `colind[0]` is writable but the engine short-circuits before reading it (`classicSetColind` refuses it at `:1233`; spec §4.6). Counting it would put a shape in the "this zone uses it" group on the strength of an entry that can never apply.

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
    //                        block: 0  1  2  3
    const c = collisionShapeChoices(doc([4, 5, 3, 5]));
    const used = c.filter((s) => s.usedInZone).map((s) => s.index);
    // Blocks 1..3 use shapes 5, 3, 5. Block 0's entry (4) is EXCLUDED — the
    // engine short-circuits before reading it, so it is not a use.
    expect(used).toEqual([3, 5]);
    expect(c.slice(0, 2).map((s) => s.index)).toEqual([3, 5]);
  });

  it('still offers every shape the table defines', () => {
    const c = collisionShapeChoices(doc([0, 5], 8));
    expect(c).toHaveLength(8);
    expect(new Set(c.map((s) => s.index)).size).toBe(8);
  });

  it('counts how many blocks point at each shape, block 0 excluded', () => {
    const c = collisionShapeChoices(doc([5, 5, 5, 3]));
    expect(c.find((s) => s.index === 5)!.blocks).toBe(2);   // blocks 1,2 — not block 0
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

- [ ] **Step 2: Run, watch it fail. Step 3: implement** — `collisionShapeChoices(doc)` returns `Array<{ index: number; usedInZone: boolean; blocks: number; heights: Int8Array; angle: number }>`, used-first ascending then the rest ascending, skipping block 0 when counting. **Step 4: run, watch it pass.**

- [ ] **Step 5: PLANT.** Count block 0's entry as a use; confirm the first test fails. Restore.

- [ ] **Step 6: Commit.**

---

## Task 2: The write decision, as one pure function

**Files:**
- Create: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// LINK vs ISOLATE, decided once, with every refusal in one place.
//
// Link is a one-entry colind write: the block's shape changes everywhere the
// block is used, ZONE-wide. Isolate clones the block, repoints THIS chunk cell
// at the clone, and gives the clone the new shape — same pixels, different
// collision, which is what SurfaceEditPlan.newBlocks' colind override exists
// for.
//
// The refusals carry as much weight as the writes, and two of them are about
// data the editor cannot see: a block id past the end of the colind table
// resolves into the NEXT ZONE's table in ROM, so both changing it (link) and
// creating one (isolate) would define entries whose real values are unknown.

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
  const blockDef = () => ({ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) });
  return {
    chunks: [{ cells }],
    blocks: [blockDef(), blockDef(), blockDef(), blockDef()],
    collision: { colind: new Uint8Array(64), shapes: { heights: [], angles: new Uint8Array() } },
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
    if (r.kind !== 'isolate') throw new Error(`expected isolate, got ${r.kind}`);
    expect(r.newBlockId).toBe(d.blocks.length);              // appended
    expect(r.plan.newBlocks).toEqual([{ def: d.blocks[3], sourceBlockId: 3, colind: 7 }]);
    // The cell keeps flips and solidity; only the block it names changes.
    expect(r.plan.chunkCellEdits).toEqual([
      { chunkIndex: 0, cellIndex: 5, cell: { block: d.blocks.length, xf: true, yf: false, solidity: 3 } },
    ]);
    expect(r.plan.tileWrites).toEqual([]);
    expect(r.plan.blockCellEdits).toEqual([]);
    // `stats` is REQUIRED on SurfaceEditPlan (classic-surface-plan.ts:59, no `?`).
    // The store never reads it, but tsc will not accept a plan without it.
    expect(r.plan.stats).toEqual({ tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 });
  });

  it('re-derives the block from the doc rather than trusting a stale probe', () => {
    // collisionProbe survives undo. If the cell now names a different block than
    // the probe recorded, the probe is stale and writing its blockId would edit
    // a block the user is not looking at.
    const d = doc();
    d.chunks[0].cells[5] = { block: 2, xf: false, yf: false, solidity: 3 };
    const r = planCollisionWrite(d, probe({ blockId: 3 }), 7, 'link');
    expect(r).toMatchObject({ kind: 'link', entries: [{ blockId: 2, value: 7 }] });
  });

  it('refuses block 0 — the engine never reads its collision', () => {
    const r = planCollisionWrite(doc(), probe({ blockId: 0, reason: 'block0' }), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/blank block|block 0/i);
  });

  it('refuses a cell with no chunk', () => {
    const r = planCollisionWrite(doc(), probe({ chunkIndex: null, reason: 'air' }), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/air|no chunk/i);
  });

  it('refuses a LINK to a block past the colind table, in the planner', () => {
    // classicSetColind refuses this too, but as a CommandResult error the panel
    // would have to render separately. One refusal path, shown in one place.
    const d = doc();
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/adjacent|next zone|past the end/i);
  });

  it('refuses an ISOLATE that would extend the colind table', () => {
    // The decided guardrail. GHZ (439 blocks, 410 entries) and SBZ (602/600)
    // hit this; the other four zones do not.
    const d = doc();
    d.collision.colind = new Uint8Array(2);                   // 4 blocks, 2 entries
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/3 entr/);      // ids 2,3 + the new 4
    expect((r as { why: string }).why).toMatch(/adjacent|next zone/i);
  });

  it('refuses an isolate at the block ceiling', () => {
    // classicPaintSurface has NO capacity check (only classicCommitCanvas at
    // :1125 and classicAddBlock at :1345 do), so without this the failure comes
    // back as validateLevelDoc's "block ref 1024 out of range".
    const d = doc();
    d.blocks = Array.from({ length: 1024 }, () => d.blocks[0]);
    d.collision.colind = new Uint8Array(2048);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/1024|capacity|ceiling/i);
  });

  it('warns but allows a write to a loop-ambiguous cell', () => {
    // $28 behind a loop may be read as $51 — runtime state no editor can see.
    // The edit is valid for one of the two answers, so it proceeds and says so.
    const r = planCollisionWrite(doc(), probe({ loopAmbiguous: true }), 7, 'link');
    expect(r.kind).toBe('link');
    expect((r as { warnings: string[] }).warnings.join(' ')).toMatch(/\$51|loop/i);
  });
});
```

> **Derive the numbers from the fixtures rather than trusting them.** With 4 blocks and a 2-entry table the clone's id is 4 and the table must reach length 5, so entries 2, 3 and 4 are all newly defined — 3. If your implementation disagrees, work out which is right before changing either, and say so in your report.

- [ ] **Step 2: Run, watch it fail. Step 3: implement.**

`planCollisionWrite(doc, probe, shapeIndex, mode)` returns a discriminated union:
- `{ kind: 'link'; entries: { blockId; value }[]; warnings: string[] }`
- `{ kind: 'isolate'; plan: SurfaceEditPlan; newBlockId: number; warnings: string[] }`
- `{ kind: 'refused'; why: string }`

Refusal order matters — check air, then block 0, then (link) past-table, then (isolate) capacity and table extension. Document each refusal with its engine or file reason.

- [ ] **Step 4: Run, watch it pass.**

- [ ] **Step 5: PLANT — mandatory.** Drop the `colind` override from the isolate branch so the clone inherits the source's shape. Confirm the isolate test fails. Restore. — this is the exact regression `9e5c654` was added to make impossible.

- [ ] **Step 6: Commit.**

---

## Task 3: The armed shape and the collision Link/Isolate mode

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts`
- Test: `src/renderer/state/__tests__/classicLevelStore.test.ts`

Two fields, beside `collisionProbe`, following its exact treatment (interface, `IDLE`, `openAct`'s `fresh`, setter):

```ts
  /** The shape the picker last armed, applied by a swatch click and by the
   *  paint-collision tool. Null until the user picks one. */
  collisionShape: number | null;
  /**
   * Link | Isolate for COLLISION writes, defaulting to Link.
   *
   * Deliberately NOT the art tiers' `paintDivergeMode`, though the concept is
   * the same: that field initialises to 'isolate' and is sticky across
   * surfaces, so sharing it would (a) default this facet to the block-spending,
   * table-growing path against spec §4.5, and (b) mean setting Link here
   * silently re-arms Link in the art composer, where the next stroke propagates
   * pixels to every use of a shared tile.
   */
  collisionDiverge: 'link' | 'isolate';
```

- [ ] **Step 1: Write the failing test** — that both default correctly (`null`, `'link'`), that both survive a probe change, and that `openAct` clears the armed shape but LEAVES the mode (a mode is a preference; an armed shape belongs to the act you armed it in). Assert the default is `'link'` explicitly and say why in a comment: it is the non-destructive path and the spec requires it.

- [ ] **Step 2-4: run/fail, implement, run/pass.**

- [ ] **Step 5: PLANT.** Initialise `collisionDiverge` to `'isolate'`; confirm the default test fails. Restore.

- [ ] **Step 6: Commit.**

---

## Task 4: The dispatch helper

**Files:**
- Create: `src/renderer/state/collision-dispatch.ts`
- Test: `src/renderer/state/__tests__/collision-dispatch.test.ts`

The planner lives in `core/` and cannot call the store — `core/` is store-free by convention (see `classic-surface-plan.ts`'s header). The panel must not assemble plans or call store commands itself either, or the Link/Isolate decision exists in two places. So one renderer-side function owns the join:

```ts
/** Apply `shape` to the cell the user last probed. Returns what happened, so
 *  the caller can show a refusal where the user is looking. */
export function applyCollisionShape(shape: number): { ok: true } | { ok: false; why: string };
```

It reads doc + probe + mode from the store, calls `planCollisionWrite`, and dispatches `classicSetColind` or `classicPaintSurface` accordingly.

- [ ] Steps: test first (each of link, isolate, and a refusal reaching the caller unchanged), run/fail, implement, run/pass, **plant** (make the refusal path return `{ ok: true }`; confirm a test fails), commit.

---

## Task 5: Arm the tool

**Files:**
- Modify: `src/core/project/s1/index.ts` (`facetTools.collision`)
- Modify: `src/renderer/components/classic/ClassicMapToolOptions.tsx` (classic hint)
- Modify: `src/renderer/components/classic/ClassicLevelViewport.tsx`
- Modify: `src/core/project/__tests__/s1-adapter.test.ts` (the `facetTools` assertion changes again)
- Test: `src/renderer/components/classic/__tests__/collision-probe-click.test.ts`

`facetTools.collision` becomes `['view', 'paint-collision']` — **`view` stays first, because the first entry is the facet default** (`facet-tools.ts:3`). The user arms the write tool; they are not handed it.

The shared hint at `tool-meta.ts:46` reads *"Click to set the collision type on tiles"*, which is aeon's model (a type per tile). Classic assigns a SHAPE to a BLOCK, so the classic wording belongs in `ClassicMapToolOptions`'s own branch chain beside `stamp-chunk` / `place-object` / `select`, where classic already overrides per-tool copy. Say what the armed shape and mode are, or that no shape is armed yet.

The viewport must keep probing on EVERY click regardless of tool — a readout that only works while holding a write tool cannot be consulted before deciding to write — and call `applyCollisionShape` only when `paint-collision` is armed and a shape is set.

- [ ] **Step 1: Extend the click guard**

```ts
  it('probes on every click but writes only when paint-collision is armed', () => {
    expect(VIEWPORT).toMatch(/setCollisionProbe/);
    expect(VIEWPORT, 'the write must be gated on the tool').toMatch(/paint-collision/);
    expect(VIEWPORT, 'the write goes through the dispatch helper, not the store directly')
      .toMatch(/applyCollisionShape/);
    expect(VIEWPORT).not.toMatch(/classicSetColind\(|classicPaintSurface\(/);
  });
```

- [ ] **Steps 2-4: run/fail, implement, run/pass.**

- [ ] **Step 5: PLANT.** Remove the tool condition so the write fires under `view`. Confirm a test fails; if none does, strengthen the guard against your actual shape and say so.

- [ ] **Step 6:** `npm test`, commit.

---

## Task 6: The picker, and the footer that is now false

**Files:**
- Modify: `src/renderer/components/classic/ClassicCollisionPanel.tsx`
- Modify: `src/renderer/components/classic/__tests__/diverge-vocabulary.test.ts` (add this panel to its surfaces)
- Test: `src/renderer/components/classic/__tests__/collision-panel.test.ts`

The shape grid from Task 1 in the `This block` section, this zone's shapes first and marked, the current shape indicated. Clicking a swatch calls `applyCollisionShape` and arms it. Link/Isolate chips drive `collisionDiverge`, labelled **exactly as the composer labels the same idea** — "Edits:" from `17783ae` — since a second vocabulary for one concept is the defect that commit removed.

Thumbnails: `columnSolidRun` for a drawn 16×16, or `heightSparkline` for a text-cheap row. Pick one and say in the docblock why. Do not add a renderer to `core/collision/`.

**Refusals appear where the picker is**, not in a toast that scrolls away — including the two zone-specific ones, which must name the zone's numbers and the alternative (use Link, accepting it changes every use of the block).

**THE FOOTER IS NOW FALSE.** It reads *"Read-only for now — solidity is edited on the Chunk tab."* (`ClassicCollisionPanel.tsx:88`) and `collision-panel.test.ts:29` pins it there. The facet writes from this stage on, so the sentence is false in its first three words. It becomes an accurate statement of the split — the shape is editable here, solidity is still the Chunk tab's — and the guard asserts the true claim rather than being deleted. A stale reassurance is worse than none: someone reading "read-only" will not believe the change they just made was real.

- [ ] **Step 1: Extend the guard**

```ts
  it('routes every write through the dispatch helper', () => {
    expect(src).toMatch(/applyCollisionShape/);
    expect(src, 'the panel must not build a plan or call a store command itself')
      .not.toMatch(/newBlocks:|classicSetColind\(|classicPaintSurface\(/);
  });

  it('no longer claims to be read-only, and still says where solidity lives', () => {
    expect(src).not.toMatch(/Read-only/i);
    expect(src).toMatch(/Chunk tab/);
  });

  it('shows a refusal where the picker is', () => {
    expect(src).toMatch(/refus|why/i);
  });

  it('uses the composer vocabulary for the mode, not a second one', () => {
    expect(src).toMatch(/Edits:/);
    expect(src).not.toMatch(/Diverge/);
  });
```

Add `ClassicCollisionPanel` to `diverge-vocabulary.test.ts`'s surface list so the one-word-per-concept rule covers it mechanically rather than by imitation.

- [ ] **Steps 2-4: run/fail, implement, run/pass.**

- [ ] **Step 5: PLANT.** Call `classicSetColind` from the panel directly; confirm the first guard fails. Restore.

- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`, commit.

---

## Task 7: Verification

- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] **Drive it.** Adapt `scratchpad/collision-lens-harness.mjs` (it already opens s1disasm, clears the session, lands on GHZ act 1, selects the Collision pill and clicks exact level points). Rows:
  1. click a solid cell, click a different shape in the picker, read the panel back — the shape must change;
  2. **one** Ctrl+Z restores it. This is the row the undo-routing task existed for and the first that can prove it;
  3. switch to Isolate on GHZ and confirm the refusal appears, naming the 30 entries;
  4. open a zone where Isolate is allowed (LZ, MZ, SLZ or SYZ), isolate a cell, and confirm `blocks` grew by one and one Ctrl+Z returns it — the clone must not be stranded.
- [ ] **The run must leave `s1disasm` unmodified.** Check `git -C /home/volence/sonic_hacks/s1disasm status --short` before and after. **Do not save.** Row 2's undo is the point; a saved colind would rewrite a real file.

---

## Not in this plan

Stage 4 (canvas-commit remediation — must assign `$FF`, since `$FB`–`$FE` are full-height 45° loop corners) and stage 5 (MCP parity: a classic `paint_collision` in facet coordinates, plus `commit_canvas` / `import_art_sheet`, which do not exist at all). Also not here: editing the shape TABLE itself, which the spec puts out of scope for the whole phase.

**Known follow-up:** GHZ and SBZ cannot use Isolate at all under this plan's refusal. The only faithful fix is reading the adjacent zone's colind to fill the in-between entries with their real ROM values, which needs cross-file reach Aurora does not have (`classicLevelStore.ts:988-1015` says so). That is a phase of its own, not a papercut.
