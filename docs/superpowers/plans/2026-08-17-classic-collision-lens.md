# Classic Collision Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give classic a Collision facet on the level map that answers "why does the player fall through *here*" — click a cell, see the chunk, the block, the shape and the solidity that decide it, and how many places share each.

**Architecture:** Stage 3a of `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md`. Read-only. The facet mounts the SHARED map canvas (`ClassicLevelViewport`, exactly as Layout/Objects/Palette do) and contributes only a right panel. The lookup itself is a pure function taking numbers, so it is unit-testable in a node-only suite and does not depend on the viewport's cursor plumbing.

**Tech Stack:** TypeScript, React, Zustand, vitest (node-only — no DOM, `.tsx` never executed, so `.tsx` behaviour is covered by source guards plus a CDP row).

---

## Why read-only first

The editing half (shape picker, Link/Isolate, the write path) is stage 3b and is **not** in this plan. Splitting here is deliberate:

- Registration and **undo routing** are the two things most likely to be silently wrong, and both are testable without a single write. A facet that edits but whose Ctrl+Z does nothing is worse than one that only reads.
- The lens is independently useful. The motivating complaint — "the player falls through committed art" — is *diagnosed* here even before it can be fixed here: you click the hole and the panel names the block and the shape.
- It is honest about what it is. The panel says the shape is not editable yet and points at the tier that can change it today (the Chunk tab for solidity).

**The strongest case against the split**, worth stating because it nearly holds: the Collision pill sits third in a row of facets that all *act*, so a read-only one reads as broken rather than as staged. That objection is fatal to a careless version of this plan — one that ships a dead "Paint Collision" button in the dock (the shell tool default), a hint line promising a write, an unshaded map, and a click that ejects you to Layout. It is **not** fatal to this one, because Tasks 2, 3, 5 and 6 close exactly those four gaps: the tool set is declared as `['view']`, the map surface serves the facet, the click reports a point, and the overlay is claimed on mount. A diagnostic lens that says what it is and answers the question it was opened for is honest; the four gaps were the real objection.

**What stage 3b will need**, already grounded so the next plan is quick to write: `facetTools` in `src/core/project/s1/index.ts:522` currently grants only `layout: ['view','stamp-chunk','select']`, so a collision tool means adding a `collision:` entry there; `paint-collision` already exists as a tool id with a label and hint in `src/renderer/workspace/tool-meta.ts`, so classic can implement the same id rather than inventing one; and the shape thumbnails can reuse `columnSolidRun` from `src/core/collision/collision-render`, which `classic-overlays.ts:12` already imports — *using* that module is fine, it is only *modifying* `src/core/collision/` that the spec puts out of scope. Budget for 3b re-touching two of the same tests this plan edits: adding a write tool changes `facetTools` again (`s1-adapter.test.ts:96`) and may move `map-status-classic.test.ts`.

---

## Background the engineer needs

**The lookup chain** (verified against `s1disasm/_incObj/sub FindNearestTile & FindFloor & FindWall.asm`):

```
FG layout byte = 1-based chunk id ($00 = air)
  └→ chunk definition, 16×16 cells of 16px
       └→ cell: solidity (2 bits) + block id + X/Y flips
            └→ colind[block] → shape index → 16 heights + an angle byte
```

- Solidity **gates** the shape; block id 0 **short-circuits before both**.
- Collision is read from the **FG plane only**. The facet must say so rather than appearing to work on BG.
- **Both tiers are shared.** Solidity lives in the chunk *definition*, so it is shared by every placement of that chunk (measured: 304 of 309 non-air GHZ layout cells reference a chunk stamped more than once). `colind` is per block and shared **zone**-wide — all three acts read one `collide/{ZONE}.bin`. The panel's job is to make that sharing visible *before* stage 3b lets anyone change it.

**Existing pieces you will use:**
- `chunkIndexForId(doc, id): number | null` in `src/core/level-classic/model.ts:137` — resolves a 1-based layout chunk id to an index into `doc.chunks`, returning null for air. It is the one place the ±1 shift lives; route through it.
- `mapFacet(id, slots)` from `src/renderer/workspace/facet-registry.ts` — builds a `FacetModule` for a map-canvas facet. `s1-facets.tsx` uses it for layout/objects/palette, each passing the same `Canvas: ClassicLevelViewport`, `ToolOptions: ClassicMapToolOptions`, `StatusBar: ClassicMapStatusBar` and its own `RightPanel`.
- `ZONE_ART_FACETS` in `src/renderer/state/editorStore.ts:220` — the set of facets whose edits belong to the ZONE-ART document rather than the act's layout document.

**Test commands.** Whole suite `npm test`; one file `npx vitest run <path>`; typecheck `npx tsc --noEmit`; build `npm run build`.

**House rule:** every fix lands with a **plant** — break the thing the new test guards and watch it fail before believing it. Steps say when.

**A warning from the previous plan in this series:** three of its snippets contained wrong expected values, and each was caught by the implementing agent checking against the engine rather than trusting the plan. Do the same here. If a snippet below disagrees with the code, the code wins — verify, then report the discrepancy.

---

## Task 1: The cell probe, as a pure function

**Files:**
- Create: `src/core/level-classic/collision-probe.ts`
- Test: `src/core/level-classic/__tests__/collision-probe.test.ts`

This is the whole lookup, taking plain numbers so it needs no DOM and no viewport.

- [ ] **Step 1: Write the failing test**

Create `src/core/level-classic/__tests__/collision-probe.test.ts`:

```ts
// THE COLLISION LOOKUP, as the engine performs it.
//
// Every field here answers a question the Collision panel asks on the user's
// behalf: which chunk am I standing on, which of its 256 cells, which block,
// which shape, and is any of it actually solid. The short-circuits are the
// interesting part — block 0 and solidity 0 each mean "no collision" for
// DIFFERENT reasons, and a panel that collapsed them would explain the wrong
// thing to someone hunting a hole in their level.

import { describe, it, expect } from 'vitest';
import { probeCollision } from '../collision-probe';
import type { LevelDoc } from '../model';

/** A 2x2-chunk act: layout row 0 = [chunk 1, air], row 1 = [air, air]. */
function doc(): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };   // top-left 16px cell: solid
  cells[1] = { block: 1, xf: false, yf: false, solidity: 0 };   // same block, NOT solid here
  cells[2] = { block: 0, xf: false, yf: false, solidity: 3 };   // blank block, solidity set
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: {
      colind: new Uint8Array([0, 5]),
      shapes: { heights: [new Int8Array(16), new Int8Array(16)], angles: new Uint8Array([0, 0]) },
    },
    fg: { width: 2, height: 2, cells: new Uint8Array([1, 0, 0, 0]) },
    bg: { width: 2, height: 2, cells: new Uint8Array([0, 0, 0, 0]) },
  } as unknown as LevelDoc;
}

describe('probeCollision', () => {
  it('resolves a solid cell all the way to its shape', () => {
    const p = probeCollision(doc(), 0, 0);
    expect(p).toMatchObject({
      chunkId: 1, cellIndex: 0, blockId: 1, shapeIndex: 5, solidity: 3, collides: true,
    });
  });

  it('picks the right 16px cell inside the chunk', () => {
    // x=16 is the second cell of row 0; x=0,y=16 is the first cell of row 1.
    expect(probeCollision(doc(), 16, 0)?.cellIndex).toBe(1);
    expect(probeCollision(doc(), 0, 16)?.cellIndex).toBe(16);
  });

  it('reports air where the layout byte is 0', () => {
    // Second chunk column is air; there is no chunk to resolve.
    expect(probeCollision(doc(), 256, 0)).toMatchObject({ chunkId: 0, collides: false, reason: 'air' });
  });

  it('distinguishes the two ways a cell can be non-solid', () => {
    // Same block, solidity 0 → the engine's `btst` fails.
    expect(probeCollision(doc(), 16, 0)).toMatchObject({ collides: false, reason: 'solidity' });
    // Block 0 → short-circuits BEFORE solidity, even though solidity is set.
    expect(probeCollision(doc(), 32, 0)).toMatchObject({ collides: false, reason: 'block0' });
  });

  it('returns null outside the layout', () => {
    expect(probeCollision(doc(), -1, 0)).toBeNull();
    expect(probeCollision(doc(), 99999, 0)).toBeNull();
  });

  it('counts how much shares what — the numbers the panel warns with', () => {
    const p = probeCollision(doc(), 0, 0)!;
    // Chunk id 1 appears once in fg.cells. Block 1 is named by exactly TWO
    // chunk-definition cells (indices 0 and 1); every other cell names block 0.
    expect(p.chunkPlacements).toBe(1);
    expect(p.blockCells).toBe(2);
  });

  it('reports the block-0 short-circuit even when solidity would allow it', () => {
    // Cell 16 (x=0,y=16) is block 0 AND solidity 0 — the ONE probe point where
    // the order of the two short-circuits is observable. See the plant step.
    expect(probeCollision(doc(), 0, 16)).toMatchObject({ reason: 'block0' });
  });
});
```

> The last case's expected numbers are derived from the fixture above: `cells[0]` and `cells[1]` both name block 1, nothing else does, and chunk id 1 appears once in `fg.cells`. If your implementation counts differently, work out which is right from the fixture before changing either — do not adjust the expectation to match the code.

- [ ] **Step 2: Run it and watch it fail**

`npx vitest run src/core/level-classic/__tests__/collision-probe.test.ts`
Expected: FAIL — `Cannot find module '../collision-probe'`.

- [ ] **Step 3: Implement**

Create `src/core/level-classic/collision-probe.ts`:

```ts
import { chunkIndexForId, type LevelDoc } from './model';

/**
 * Everything the Collision panel needs about one point of the FG plane.
 *
 * `reason` is why the point does NOT collide, and the three values are not
 * interchangeable: 'air' is a layout byte of 0 (no chunk at all), 'block0' is
 * the engine short-circuiting on the blank block BEFORE it tests solidity, and
 * 'solidity' is the `btst` failing on a real block. Someone hunting a hole in
 * their level needs to know which of the three they are looking at, because the
 * fix is different for each.
 */
export interface CollisionProbe {
  /** 1-based engine chunk id; 0 = air. */
  chunkId: number;
  /** Index into doc.chunks, or null for air. */
  chunkIndex: number | null;
  /** 0..255 within the chunk, row-major. */
  cellIndex: number;
  blockId: number;
  shapeIndex: number;
  solidity: number;
  collides: boolean;
  reason: 'air' | 'block0' | 'solidity' | null;
  /** How many layout cells stamp this chunk id (FG plane). */
  chunkPlacements: number;
  /** How many chunk cells, across every chunk, name this block. */
  blockCells: number;
}

/**
 * Probe the FG plane at a level pixel. Returns null outside the layout.
 *
 * FG ONLY, deliberately: the engine reads collision from `v_lvllayout_fg` and
 * nothing else, so a BG probe would be a confident answer to a question the
 * console never asks.
 */
export function probeCollision(doc: LevelDoc, x: number, y: number): CollisionProbe | null {
  if (x < 0 || y < 0) return null;
  const col = Math.floor(x / 256);
  const row = Math.floor(y / 256);
  if (col >= doc.fg.width || row >= doc.fg.height) return null;

  const raw = doc.fg.cells[row * doc.fg.width + col] ?? 0;
  const chunkId = raw & 0x7f;              // strip S1's bit-7 loop flag
  const cellIndex = (Math.floor((y % 256) / 16) * 16) + Math.floor((x % 256) / 16);

  let chunkPlacements = 0;
  for (const c of doc.fg.cells) if ((c & 0x7f) === chunkId) chunkPlacements++;

  const chunkIndex = chunkIndexForId(doc, chunkId);
  if (chunkIndex === null) {
    return {
      chunkId, chunkIndex: null, cellIndex, blockId: 0, shapeIndex: 0, solidity: 0,
      collides: false, reason: 'air', chunkPlacements, blockCells: 0,
    };
  }

  const cell = doc.chunks[chunkIndex]?.cells[cellIndex];
  const blockId = cell?.block ?? 0;
  const solidity = cell?.solidity ?? 0;
  const shapeIndex = doc.collision.colind[blockId] ?? 0;

  let blockCells = 0;
  for (const c of doc.chunks) for (const cc of c.cells) if (cc.block === blockId) blockCells++;

  // Engine order: block 0 short-circuits before the solidity test.
  const reason = blockId === 0 ? 'block0' : solidity === 0 ? 'solidity' : null;
  return {
    chunkId, chunkIndex, cellIndex, blockId, shapeIndex, solidity,
    collides: reason === null, reason, chunkPlacements, blockCells,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

`npx vitest run src/core/level-classic/__tests__/collision-probe.test.ts`

- [ ] **Step 5: PLANT — mandatory**

Swap the reason order to `solidity === 0 ? 'solidity' : blockId === 0 ? 'block0' : null` and re-run.
Expected: FAIL on "distinguishes the two ways a cell can be non-solid". **Restore.**

> **The order is only observable on a cell where BOTH are zero.** An earlier
> draft of this plan claimed cell 2 (block 0, solidity 3) would expose it — it
> does not: under both orderings that cell reports `'block0'`, because the
> `solidity === 0` test is false and control falls through. Likewise cell 1
> (block 1, solidity 0) reports `'solidity'` either way. That is why the test
> above probes `(0, 16)` → cell 16, which is block 0 AND solidity 0: original
> order says `'block0'` (the engine's answer), swapped says `'solidity'`. If
> your plant does not fail, you have dropped that assertion.

- [ ] **Step 6: Commit**

```bash
git add src/core/level-classic/collision-probe.ts src/core/level-classic/__tests__/collision-probe.test.ts
git commit -m "feat(classic): a pure probe for what decides collision at a point

The whole FindFloor lookup as one function taking numbers: layout byte to
chunk to 16px cell to block to shape, plus the two sharing counts the
panel has to warn with.

It reports WHY a point does not collide, and keeps the three reasons
apart. Air, the blank block short-circuiting, and solidity failing all
look identical in the viewport and need different fixes, which is the
question someone hunting a hole in their level is actually asking."
```

---

## Task 2: Grant and register the facet

**Files:**
- Modify: `src/core/project/s1/index.ts:83` (`S1_FACETS`) and the note above it at `:76-83`
- Modify: `src/renderer/workspace/facets/s1-facets.tsx` (add `ClassicCollisionPanels` + `s1CollisionFacet`)
- Modify: `src/renderer/workspace/register-facets.ts:38`
- Modify: `src/renderer/workspace/__tests__/facet-visibility.test.ts:43`
- Modify: `src/core/project/__tests__/s1-adapter.test.ts:96`

- [ ] **Step 1: Update the FIVE tests that assert classic's facet set**

These are assertions of intent, so they change first and should then FAIL. An
earlier draft of this plan named only two of them; all five were found by
reading, and any one left stale fails the suite:

| file:line | what it asserts | becomes |
|---|---|---|
| `facet-visibility.test.ts:43` | the visible pill list | gains `collision`, **before** `palette` |
| `facet-visibility.test.ts:70` | `resolveFacet(...,'collision')` heals to `'layout'` | now resolves to `'collision'` itself |
| `facet-visibility.test.ts:137` | `openCapabilities()?.facets` | gains `collision` in grant order |
| `facet-modules.test.ts:120` | `moduleFor('s1', f)` is null for `['rings','collision']` | now only `rings` |
| `map-status-classic.test.ts:127` | s1 facets with `mapOverlays` | gains `collision` (it IS a map facet) |
| `s1-adapter.test.ts:96` | `capabilities.facets` **and** `facetTools` | both change — see Step 3b |

Read each one's surrounding comment as you go: several explain *why* collision
was absent, and a stale explanation left beside a corrected expectation is worse
than the failure was.

In `src/renderer/workspace/__tests__/facet-visibility.test.ts` around line 38-44, the comment says classic's bar is "the aeon one minus rings and collision". That is no longer true — it is now minus rings only. Update the comment and the expectation:

```ts
    // Registry order, not grant order — the pills follow core/shell/facets so
    // the bar reads the same way under both engines. Classic's bar is now the
    // aeon one minus rings.
    expect(visible.map((f) => f.id)).toEqual(['layout', 'objects', 'collision', 'palette', 'art']);
```

> **`collision` sits BEFORE `palette`, and that is not a typo.** The pills follow REGISTRY order, not grant order: `core/shell/facets.ts:50-56` gives layout 0, objects 10, rings 20, collision 30, palette 40, art 50. (The first draft of this plan wrote `palette` before `collision` from memory and was wrong — checked, not assumed.) Write the grant in the same order anyway, so the two read alike for a human.

In `src/core/project/__tests__/s1-adapter.test.ts:96`, the literal `facets: ['layout', 'objects', 'palette', 'art']` must gain `'collision'` in **grant** order (that assertion reads `capabilities.facets`, which is `[...S1_FACETS]`). Its `facetTools` half changes too — Step 3b.

- [ ] **Step 2: Run both and watch them fail**

```
npx vitest run src/renderer/workspace/__tests__/facet-visibility.test.ts src/core/project/__tests__/s1-adapter.test.ts
```
Expected: FAIL on both — the grant does not include `collision` yet.

Note there is a THIRD test in `facet-visibility.test.ts` (~line 59) asserting every granted facet has a registered module. It will fail as soon as step 3 lands and stay failing until step 4 registers one. That is the guard doing its job; do not touch it.

- [ ] **Step 3: Grant the facet**

In `src/core/project/s1/index.ts`, replace the `collision` bullet in the comment above `S1_FACETS` (currently "`collision` is ABSENT… restore when the classic collision editor lands as its own designed feature") with:

```
 *  - `collision` is the READ side of the collision editor (spec stage 3a): the
 *    lookup that decides whether the player stands on a cell, shown where the
 *    hole is. It does not write yet — solidity stays in ChunkTab's Assign mode,
 *    and the shape picker is stage 3b. Granted 2026-08-17.
```

and the grant itself:

```ts
export const S1_FACETS = ['layout', 'objects', 'collision', 'palette', 'art'] as const satisfies readonly FacetCapability[];
```

- [ ] **Step 3b: Declare the facet's tool set**

Still in `src/core/project/s1/index.ts`, extend `facetTools` at line 522:

```ts
        facetTools: {
          layout: ['view', 'stamp-chunk', 'select'],
          // DECLARED, not defaulted. The shell default for collision is
          // `['paint-collision', 'view']` (renderer/workspace/facet-tools.ts:23)
          // and its FIRST ENTRY IS THE FACET DEFAULT (same file, line 3) — so
          // leaving this out lands the user on paint-collision, renders a
          // "Paint Collision" button in the dock, prints a hint promising a
          // write, and the viewport has no branch for that tool so the click
          // falls through to pan. This facet reads; `view` is the truth.
          collision: ['view'],
        },
```

> `s1-adapter.test.ts:96` asserts `capabilities` with **one** `toEqual`, covering both the `facets` array and the `facetTools` object — so this change and the grant change land in the same assertion. Update both halves.

- [ ] **Step 4: Register a module**

In `src/renderer/workspace/facets/s1-facets.tsx`, add the panel and the module. Follow the file's existing shape — `ClassicLayoutPanels` (line ~314) is the smallest example:

```tsx
/**
 * COLLISION's right-hand column: one readout, split by the tier each half
 * belongs to. Nothing here writes — see ClassicCollisionPanel's own docblock
 * for why the two halves are labelled rather than merged.
 */
function ClassicCollisionPanels(): React.ReactElement {
  return (
    <Panel width={260} scroll>
      <CollapsibleSection id="classic.collision" title="Collision">
        <ClassicCollisionPanel />
      </CollapsibleSection>
    </Panel>
  );
}

// SAME CANVAS, SAME STATUS BAR, SAME HINT BAR as Layout/Objects/Palette — the
// COLUMN is the difference, which is the established shape for classic's map
// facets. The tool set is DECLARED (see s1/index.ts facetTools) rather than
// left to the shell default, because that default is ['paint-collision','view']
// and its first entry is the facet default — so omitting it would land the user
// on a write tool this facet does not implement.
export const s1CollisionFacet: FacetModule = mapFacet('collision', {
  Canvas: ClassicLevelViewport,
  ToolOptions: ClassicMapToolOptions,
  StatusBar: ClassicMapStatusBar,
  RightPanel: ClassicCollisionPanels,
});
```

Import `ClassicCollisionPanel` from the component Task 6 creates. **Until Task 6 exists, stub it in this file** as a component returning a single `<div>Collision</div>` so the registration can be verified on its own; Task 6 replaces the stub with the real import.

Then in `src/renderer/workspace/register-facets.ts:38`, add it to the loop:

```ts
  for (const m of [s1LayoutFacet, s1ObjectsFacet, s1PaletteFacet, s1CollisionFacet, s1ArtFacet]) {
```

and to the import on line 12.

- [ ] **Step 5: Run the facet tests and the suite**

```
npx vitest run src/renderer/workspace/__tests__/facet-visibility.test.ts src/core/project/__tests__/s1-adapter.test.ts
npm test
```
Expected: all green, including the "every granted facet has a module" cross-check. If a file outside the six in Step 1's table goes red, stop and report it — the table was built by reading and a seventh means something is registered that this plan did not anticipate.

- [ ] **Step 6: PLANT — mandatory**

Comment `s1CollisionFacet` out of the `register-facets.ts` loop and re-run `facet-visibility.test.ts`.
Expected: FAIL on "every facet the REAL s1 manifest grants has a module" — the guard that a pill never leads nowhere. **Restore.**

- [ ] **Step 7: Commit**

```bash
git add src/core/project/s1/index.ts src/renderer/workspace/facets/s1-facets.tsx src/renderer/workspace/register-facets.ts src/renderer/workspace/__tests__/facet-visibility.test.ts src/core/project/__tests__/s1-adapter.test.ts
git commit -m "feat(classic): grant the Collision facet

The read side of the collision editor. Same shared map canvas as the other
three classic map facets; the right-hand column is the difference.

The tool set is DECLARED as \`['view']\` rather than left to the shell
default, which is \`['paint-collision','view']\` — and the first entry is
the facet default, so defaulting would have landed the user on a write
tool this facet does not implement. The 2026-08-13 note explaining why the
facet was withheld is replaced with what it now is, rather than deleted."
```

---

## Task 3: Let the map surface serve the facet

**Files:**
- Modify: `src/renderer/components/classic/classic-surface.ts:107`
- Test: `src/renderer/components/classic/__tests__/classic-surface.test.ts`

**This one is not optional and not cosmetic — without it the facet does not work at all.** Every pointer-down in the classic viewport calls `focusClassicSurface('map')`. A facet that is not in the surface's served set gets switched to that surface's PRIMARY facet, which for `map` is `layout`. So the single gesture this whole facet exists for — clicking a cell to probe it — would throw the user off Collision, unmount the panel mid-read, and re-scope the tool. The file's own docblock documents exactly this failure for `palette`: *"Take it out of `map` and panning the act you are recolouring throws you onto Layout."*

- [ ] **Step 1: Write the failing test**

Add to `classic-surface.test.ts`, matching its existing style:

```ts
  it('serves the collision facet from the map surface', () => {
    // A pointer-down on the map calls focusClassicSurface('map'), which switches
    // any facet outside the served set to the surface primary — `layout`. The
    // Collision facet's whole interaction is clicking a cell, so being absent
    // here means every probe click ejects you from the facet doing the probing.
    expect(SURFACE_FACETS.map).toContain('collision');
  });
```

> If the file drives `focusClassicSurface` behaviourally rather than asserting on the set, follow that instead and assert the stronger thing: focus the map surface while the collision facet is active, and confirm the facet is still collision afterwards.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Add it**

```ts
export const SURFACE_FACETS: Record<ClassicSurface, readonly FacetCapability[]> = {
  map: ['layout', 'objects', 'palette', 'collision'],
  art: ['art', 'palette'],
};
```

- [ ] **Step 4: Run and watch it pass**, then `npm test` — `history-routing.test.ts` loops over `SURFACE_FACETS`, so this widens what it covers.

- [ ] **Step 5: PLANT — remove `'collision'` again, confirm the new test fails, restore.**

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/classic/classic-surface.ts src/renderer/components/classic/__tests__/classic-surface.test.ts
git commit -m "fix(classic): the map surface serves the Collision facet

Without this, focusClassicSurface('map') — which every pointer-down in the
viewport calls — switches any unserved facet to the surface primary. The
probe click would have ejected the user from the facet doing the probing,
which is the same failure the file's docblock already records for palette."
```

## Task 4: Route its undo to the zone-art document

**Files:**
- Modify: `src/renderer/state/editorStore.ts:220`
- Test: `src/renderer/state/__tests__/history-routing.test.ts` (verified to exist; it imports `ZONE_ART_FACETS` from the store so it reads the real set rather than a copy)

**Why this is its own task:** `colind` is an `ART_DOMAIN`, so a collision edit records on the zone-art stack — but the map tab resolves *which* document Ctrl+Z reaches by facet, through `ZONE_ART_FACETS`. Miss this and every collision edit made on the map is un-undoable from the map. It is wired now, before anything can write, because stage 3b would otherwise have to discover it.

- [ ] **Step 1: Write the failing test**

Add to the history-routing test file (match its existing style and helpers):

```ts
  it('routes the collision facet to the zone-art document', () => {
    // colind is an ART_DOMAIN, so a collision edit lands on the ZONE-ART stack.
    // If the facet is not in ZONE_ART_FACETS, focusedDocId resolves to the act's
    // layout document instead and Ctrl+Z on the map reaches a stack the edit was
    // never recorded on — an edit that cannot be undone from where it was made.
    expect(ZONE_ART_FACETS.has('collision')).toBe(true);
  });
```

> Then strengthen it: the neighbouring tests in that file drive `focusedDocId()` with a real tab + facet rather than asserting set membership. Follow whichever pattern is there — a behavioural assertion through `focusedDocId()` is worth more than a membership check, and the file already shows how.

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Add the facet to the set**

```ts
export const ZONE_ART_FACETS = new Set<string>(['art', 'palette', 'collision']);
```

Extend the docblock above it to say why collision belongs: colind is zone-scoped like the art it hangs off, shared by all three acts through one `collide/{ZONE}.bin`.

- [ ] **Step 4: Run and watch it pass**, then `npm test`.

- [ ] **Step 5: PLANT — mandatory**

Remove `'collision'` again, re-run, confirm the new test fails, restore.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/editorStore.ts src/renderer/state/__tests__/
git commit -m "fix(classic): route collision undo to the zone-art document

colind is an ART_DOMAIN, so a collision edit records on the zone-art
stack — but the map tab picks the document by FACET. Without this the
facet's edits would be un-undoable from the map they were made on.

Wired before anything can write, so stage 3b does not have to discover it
the hard way."
```

---

## Task 5: The click channel

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts` (add `collisionProbe` + its setter, beside `setSelectedChunkId`)
- Modify: `src/renderer/components/classic/ClassicLevelViewport.tsx` (the `onMouseDown` tool branch at ~:683)
- Test: `src/renderer/state/__tests__/classicLevelStore.test.ts`

**This is the only genuinely new mechanism in the plan, so it gets its own task rather than a clause inside the panel's.** There is no existing "user clicked here, nothing was written" channel: with `view` armed, a left-drag pans, and the right-click path eyedrops a whole chunk into the stamp selection. The panel needs a *point*.

Keep it as small as it sounds: one nullable `{ x: number; y: number }` on the classic level store, set from the viewport when the collision facet is active and the gesture was a click rather than a drag, read by the panel, cleared on act change.

- [ ] **Step 1: Write the failing store test**

```ts
describe('collision probe point', () => {
  beforeEach(() => { openReady(); });

  it('records and clears the probed point', () => {
    expect(useClassicLevelStore.getState().collisionProbe).toBeNull();
    useClassicLevelStore.getState().setCollisionProbe({ x: 40, y: 72 });
    expect(useClassicLevelStore.getState().collisionProbe).toEqual({ x: 40, y: 72 });
    useClassicLevelStore.getState().setCollisionProbe(null);
    expect(useClassicLevelStore.getState().collisionProbe).toBeNull();
  });

  it('drops the probe when the act changes', () => {
    // A point is meaningless against a different act's layout, and a stale one
    // would have the panel confidently describing a cell the user is not
    // looking at — worse than showing nothing.
    useClassicLevelStore.getState().setCollisionProbe({ x: 40, y: 72 });
    useClassicLevelStore.getState().reset();
    expect(useClassicLevelStore.getState().collisionProbe).toBeNull();
  });
});
```

> Check how `reset()` and the act-open path actually clear per-act state in that store and follow the same route — if there is an existing "clear on act change" list, add the field to it rather than adding a second mechanism.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Add the store field**, following the shape of the neighbouring `selectedChunkId` state + setter, including its placement in whatever resets on act change.

- [ ] **Step 4: Report the point from the viewport.** In `onMouseDown`'s left-button path, add a branch that fires only on the collision facet, records the level-space point under the cursor, and does **not** consume the event — panning must still work, so the point is recorded on a click that did not become a drag. Read how `cellUnderCursor` converts client coordinates and reuse it rather than re-deriving the transform; the probe needs level PIXELS, not layout cells, so convert once and comment which unit you are in.

- [ ] **Step 5: Guard it by source scan** (the viewport is `.tsx` and never executed):

```ts
  it('reports a probe point on the collision facet without eating the pan', () => {
    expect(VIEWPORT).toMatch(/setCollisionProbe/);
    // The branch must not return early — a probe that swallowed the gesture
    // would make the collision facet the one place the map cannot be panned.
    expect(VIEWPORT, 'probe branch returns before the pan path')
      .not.toMatch(/setCollisionProbe\([^)]*\);\s*\n\s*return;/);
  });
```

- [ ] **Step 6: PLANT** — make the branch `return` after recording, confirm the guard fails, restore.

- [ ] **Step 7: Commit.**

---

## Task 6: The panel

**Files:**
- Create: `src/renderer/components/classic/ClassicCollisionPanel.tsx`
- Modify: `src/renderer/workspace/facets/s1-facets.tsx` (replace the Task 2 stub with the real import)
- Test: `src/renderer/components/classic/__tests__/collision-panel.test.ts` (source guard — `.tsx` is never executed)

The panel reads `classicLevelStore.collisionProbe` (Task 5) and runs it through `probeCollision` (Task 1). It owns two further jobs that a first draft of this plan missed entirely:

**It must claim the collision overlay.** `viewStore.ts:69` has `showCollision: false` by default, so a Collision facet that does not switch the overlay on renders an unshaded map beside a panel describing shading the user cannot see. The house pattern already exists and must be reused rather than reinvented: `claimCollisionOverlay(port, plane, variant)` in `src/renderer/components/collision-overlay-scope.ts:46`, whose whole rule is **an implicit enable is implicitly reverted** — what the facet switched on, leaving the facet switches back off; what the user switched on in the View menu, the facet never touches. `CollisionOverlayPort` is a three-method interface (`anyOn` / `show` / `hideAll`) over `viewStore`, engine-agnostic, so classic supplies its own port. Pass `variant: 'map'` and plane `'a'` (S1 has one collision plane; path B is an aeon concept).

**It must give the shading a key.** `CollisionLegend` is mounted only by aeon's `MapViewport`; `ClassicLevelViewport` never mounts it. Turning the overlay on without a legend hands the user four colours and no key.

**What it shows**, split by the tier each half belongs to:

- **This cell** — solidity by name (None / Top / L-R-B / All), the owning chunk id, and `stamped N×` for that chunk. Plus, when the point does not collide, the reason in words: *"air — no chunk here"*, *"blank block ($00) — the engine skips it before checking anything else"*, or *"solidity None — the shape is ignored"*.
- **This block** — the block id, its shape index, and `used by N cells`.
- A line stating the facet is read-only in this stage, pointing at the Chunk tab for solidity.

**Both counts must name their tier AND their scope**, or they will be read as bigger or smaller than they are:
- `stamped N×` is counted from `doc.fg` — **this act only**. Solidity is shared zone-wide across all three acts, and one `LevelDoc` cannot see the other two, so the copy must say "in this act" rather than implying the whole blast radius.
- `used by N cells` counts chunk-**definition** cells, not on-map positions. The true on-map reach is each definition cell multiplied by its chunk's placements across all three acts. Say "chunk cells", not "cells".

This is the plan's own "Diverge:" lesson (`17783ae`) applied to its numbers rather than only to its headings.

**Two caveats from spec §5 belong here**, because this is the first map-first collision surface.

The first is now DRIVEN BY THE PROBE rather than printed as static prose: `probeCollision` returns `looping` (the layout byte had bit 7) and `loopAmbiguous` (a loop-flagged cell naming chunk `$28`, which `FindNearestTile` swaps for `$51` — but only while the player's `sprite_looping_bit` is set, which is runtime state no editor can see). When `loopAmbiguous` is true the panel must say the reading is one of two possible answers and name `$51` as the other; the fields exist precisely so the panel does not have to re-derive that.

The second stays prose: `collision.rotated` is enumerated but never loaded (`s1-io.ts:371-372`), so the shading is a floor heightmap only — correct for stock, misleading on a hack with a desynced Rotated array.

Keep the two headings. The tier a value belongs to must be stated, not inferred — the same lesson that removed the "Diverge:" label in `17783ae`.

- [ ] **Step 1: Write the source guard first**

```ts
// The collision panel, by source scan: this suite is node-only and never
// executes .tsx. What is guarded is the shape of the thing, not its pixels —
// that both tiers are labelled, that the read-only state is stated rather than
// implied, and that the panel routes through the pure probe instead of
// re-deriving the lookup inline (a second copy of FindFloor's order is exactly
// how the overlay came to disagree with the engine).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'ClassicCollisionPanel.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('ClassicCollisionPanel', () => {
  it('uses the pure probe rather than re-deriving the lookup', () => {
    expect(src).toMatch(/probeCollision/);
    expect(src, 'colind indexed inline = a second copy of the lookup')
      .not.toMatch(/collision\.colind\[/);
  });

  it('labels both tiers', () => {
    expect(src).toMatch(/This cell/);
    expect(src).toMatch(/This block/);
  });

  it('states that it cannot write yet, and where solidity is edited', () => {
    expect(src).toMatch(/Chunk tab/);
  });

  it('claims the collision overlay through the shared scope helper', () => {
    // The overlay is OFF by default (viewStore.ts:69). A collision facet that
    // does not turn it on describes shading nobody can see; one that turns it
    // on WITHOUT claimCollisionOverlay leaks it into every other facet, which
    // is the exact leak that helper was written to close.
    expect(src).toMatch(/claimCollisionOverlay/);
    expect(src, 'setOverlay called directly bypasses the implicit-revert rule')
      .not.toMatch(/setOverlay\(/);
  });

  it('qualifies both sharing counts by scope', () => {
    // "stamped N×" is this ACT only; colind is shared by all three. "N chunk
    // cells" is the definition tier, not on-map positions. Unqualified, both
    // numbers misrepresent the blast radius.
    expect(src).toMatch(/this act/i);
    expect(src).toMatch(/chunk cells/i);
  });

  it('names all three non-collision reasons', () => {
    for (const r of ['air', 'block0', 'solidity']) expect(src).toContain(`'${r}'`);
  });

  it('surfaces the loop ambiguity the probe reports', () => {
    // $28 behind a loop may be read as $51, decided by runtime player state.
    // The probe reports the ambiguity rather than resolving it; a panel that
    // ignored the field would show one of two answers as if it were the only
    // one — which is the specific thing spec §5 warned a map-first collision
    // surface would do.
    expect(src).toMatch(/loopAmbiguous/);
  });
});
```

- [ ] **Step 2: Run and watch it fail** (no such file yet).

- [ ] **Step 3: Build the panel**, following `src/renderer/components/classic/` conventions — `T` tokens for all styling (no raw `fontSize` numbers that have a token; `src/renderer/components/__tests__/type-scale.test.ts` enforces this and will fail the build otherwise), `Chip` for any pressable, and the file's existing `styles` object pattern.

- [ ] **Step 4: Replace the Task 2 stub** in `s1-facets.tsx` with the real import.

- [ ] **Step 5: Run the guard, then `npm test` and `npx tsc --noEmit`.**

- [ ] **Step 6: PLANT — mandatory.** Change `probeCollision(...)` to an inline `doc.collision.colind[blockId]` lookup and confirm the first guard fails. Restore.

- [ ] **Step 7: Commit.**

---

## Task 7: Verification

- [ ] **Step 1:** `npx tsc --noEmit` — no output.
- [ ] **Step 2:** `npm test` — all pass; the count is up by the tests added here.
- [ ] **Step 3:** `npm run build` — `✓ built`. (The `INEFFECTIVE_DYNAMIC_IMPORT` warning about `export-sprite.ts` is pre-existing.)
- [ ] **Step 4: Drive it in the real app.** Adapt `scratchpad/collision-needle-harness.mjs`, which already opens s1disasm, clears the stored session, lands on GHZ act 1 and photographs the viewport. Add rows that:
  1. switch to the **Collision** pill and confirm the panel renders;
  2. click a cell on solid ground and read back the panel text — it must name a chunk, a block and a shape;
  3. click a cell over open sky and confirm it says **air**, not a block.

  Row 3 is the one that matters: it is the difference between a panel that reports and a panel that reports *something* whatever you click. Photograph both.

  Note the harness's own lesson — its first framing photographed empty sky because the camera coordinates were guessed. Derive click points from the level, not from the screenshot.

---

## Not in this plan

Stage 3b (the shape picker, the `paint-collision` tool for classic, the Link/Isolate switch and the write path), stage 4 (commit remediation), stage 5 (MCP parity). Also not here: any change to `src/core/collision/` — reading `columnSolidRun` from it is fine and already done by `classic-overlays.ts`; modifying that module is aeon's system and out of scope.
