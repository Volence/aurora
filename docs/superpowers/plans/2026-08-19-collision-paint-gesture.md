# Collision paint gesture — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a *person* the collision-painting reach the agent got on 2026-08-19 — drag to paint the cells you touch, Shift-drag to paint a rectangle — as ONE undo step per gesture.

**Architecture:** Generalise the pure planner from a rectangle to a **cell list** (`planCollisionCells`), leaving `planCollisionRect` as a thin wrapper so the agent tool's contract is untouched. The viewport gains a collision stroke gesture modelled exactly on the existing `stamp-chunk` stroke: accumulate into a ref, preview from the render pass, commit ONE store command on mouseup.

**Tech Stack:** TypeScript, React, canvas 2D, Zustand, Vitest (node), Electron + CDP for the runtime proof.

---

## Why this exists

`set_block_collision` (merged, master `4df618f`) gave an agent a rectangle in 16px FG cell units. The human Collision panel is still **one cell per click** — `ClassicLevelViewport.tsx`'s collision branch writes a single `applyCollisionShape(shape)` on mousedown.

Spec §4.2 designed the panel that way deliberately and §8 never listed a gesture as out of scope, so this is **new design work, not a spec gap**. The gesture was chosen by the owner on 2026-08-19: **freehand drag by default, Shift-drag for a rectangle.**

## TRUST SOURCE OVER THIS PLAN

The previous plan in this series had **seven** defects found by implementers reading source — one that did not typecheck, one that crashed on a zero-area rectangle, two guards that asserted nothing. **If a code block here disagrees with the file in front of you, the file wins.** Report the disagreement rather than forcing the plan's version.

Two specific warnings:

- **The node suite cannot see this feature.** It is React + canvas + mouse events; `vitest` here is node-only. Tasks 1–3 are node-testable; **Tasks 4–5 are provable only under CDP** (Task 6). Do not claim a gesture works because `npm test` is green — that is precisely the false claim this repo's memory warns about.
- **`npm test` does not typecheck.** Run `npx tsc --noEmit` separately at every gate.

---

## Decisions taken before writing this

### G1 — Freehand is the default; Shift makes a rectangle

Chosen by the owner over freehand-only and rectangle-only. The cost is two preview shapes and two commit paths; the benefit is precision when following a diagonal slope and speed over a large solid region.

**Shift is free.** `grep -n "shiftKey\|altKey\|ctrlKey\|metaKey" ClassicLevelViewport.tsx` returns **nothing** — this viewport uses no modifier today, so Shift carries no existing meaning to collide with.

### G2 — The core generalises to a CELL LIST, and the rectangle becomes a wrapper

A freehand drag produces an arbitrary set of cells, not a rectangle. Two ways to serve it:

- Take the drag's bounding box — **wrong**: it would write cells the user never touched, which on a Link write is a zone-wide change they did not ask for.
- Generalise the planner to a cell list, and expand the rectangle into one.

The second, obviously. `planCollisionRect(doc, rect, …)` keeps its exact signature and behaviour and becomes four lines that build the cell list and delegate — so **the agent tool's contract does not move at all**, and both callers share one copy of the Link/Isolate decision, which is the invariant `collision-write.ts`'s header exists to protect.

### G3 — The cell list must be DEDUPED, and the rectangle never needed that

A rectangle scan visits each cell once. A freehand drag revisits cells constantly — a wiggling cursor crosses the same cell dozens of times. Without a dedupe, `applied` would count a cell once per visit and the reported numbers would be fiction.

The viewport dedupes anyway (its stroke is a `Map` keyed by linear cell index, exactly like `stamp-chunk`), but **the planner must not depend on its caller having done so** — it is a pure core function with a second, agent-shaped caller. Dedupe in `planCollisionCells`, and pin it with a test that passes duplicates in.

### G4 — Commit on mouseUP, not mousedown

Today the collision branch writes on **mousedown**. A drag gesture must commit once, on mouseup, or a 40-cell drag is 40 undo entries — the exact failure `stamp-chunk`'s stroke ref exists to prevent, and the property the whole `set_block_collision` design turned on.

A plain click with no movement is then simply a one-cell stroke, so **the existing single-click behaviour survives as the degenerate case**.

### G5 — While `paint-collision` is armed, a left-drag paints and does NOT pan

The collision branch currently falls through to the pan-arm on purpose, with a comment saying so: the map must still pan on this facet. That was right when a click was the whole interaction; it is wrong once a drag paints.

**The rule, matching `stamp-chunk`:** with `paint-collision` armed AND a shape picked, a left-drag paints and returns before the pan-arm. Otherwise — tool not armed, no shape picked, middle-drag — the existing pan behaviour is untouched. So a user who has not armed the tool still pans exactly as before.

### G6 — The probe still fires on every mousedown, whatever the tool

`setCollisionProbe` is what tells the panel *where you clicked*, and its comment is explicit that it must work whether or not the write tool is armed — "a readout that only works while holding paint-collision could not be consulted before deciding whether to write, which is backwards for a tool whose whole job is to inform that decision." **Do not move it inside the armed branch.**

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/core/level-classic/collision-write.ts` | Modify | `planCollisionCells` (new, general) + `planCollisionRect` (becomes a wrapper). Stays ONE file — its header's "every refusal in one place" claim depends on it. |
| `src/renderer/state/collision-dispatch.ts` | Modify | `applyCollisionShapeCells` — the gesture's single write route. |
| `src/renderer/components/classic/viewport-math.ts` | Modify | `worldToCollisionCell` — 16px cells, beside the existing 256px `worldToLayoutCell`. |
| `src/renderer/components/classic/ClassicLevelViewport.tsx` | Modify | The stroke gesture: ref, mousedown/move/up, preview, Shift. |
| `src/renderer/components/classic/ClassicCollisionPanel.tsx` | Modify | The Shift hint — an undiscoverable modifier is not a feature. |
| `scratchpad/collision-gesture-harness.mjs` | Create | The runtime proof. Nothing else can see this feature. |

---

## Baseline

Measured in this worktree before any change:

```
Test Files  292 passed | 1 skipped (293)
Tests  3253 passed | 3 skipped (3256)
```
`npx tsc --noEmit` clean. `scratchpad/collision-agent-harness.mjs` 8/8 (must stay 8/8 — Task 1 touches its planner).

**Known pre-existing, NOT yours:** `scratchpad/commit-collision-harness.mjs` reports 5/6, row 4. Stage 4's. Do not "fix" it.

---

## Task 1: `planCollisionCells` — the planner generalises

**Files:**
- Modify: `src/core/level-classic/collision-write.ts`
- Test: `src/core/level-classic/__tests__/collision-write.test.ts`

- [ ] **Step 1: Write the failing tests**

The fixture `doc()` ships 4 blocks, a 64-entry colind, `fg` `{ width: 2, height: 1, cells: [1, 1] }` — a 32×16-cell act where both layout columns stamp chunk 1 → `doc.chunks[0]`, and `cellIndex = (cy % 16) * 16 + (cx % 16)`. Re-derive every number.

```ts
describe('planCollisionCells', () => {
  const withCells = (assign: [number, number][]) => {
    const d = doc();
    for (const [cellIndex, block] of assign) {
      d.chunks[0].cells[cellIndex] = { block, xf: false, yf: false, solidity: 3 };
    }
    return d;
  };

  it('plans an arbitrary set of cells, not just a rectangle', () => {
    // A diagonal — the shape a slope actually has, and the reason this exists.
    const d = withCells([[0, 1], [17, 2], [34, 3]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(3);
    expect(r.report.blocks).toBe(3);
  });

  it('DEDUPES repeated cells — a freehand drag revisits them constantly', () => {
    // The planner must not depend on its caller having deduped: it is pure core
    // with a second, agent-shaped caller. Without this, `applied` counts a cell
    // once per visit and every reported number is fiction.
    const d = withCells([[0, 1]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect((r as { entries: unknown[] }).entries).toEqual([{ blockId: 1, value: 7 }]);
  });

  it('dedupes before counting skips too', () => {
    const d = doc();   // every cell of the 2x2 origin is block 0
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 0, y: 0 }], 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { skipped: { count: number }[] } }).refusal.skipped)
      .toEqual([{ reason: 'block0', count: 1 }]);
  });

  it('is what planCollisionRect is built on — same answer for the same cells', () => {
    // The guard against a SECOND copy of the decision. If the rect stops
    // delegating, the human gesture and the agent tool drift apart silently.
    const d = withCells([[0, 1], [1, 2], [16, 3], [17, 1]]);
    const viaRect = planCollisionRect(d, { x: 0, y: 0, w: 2, h: 2 }, 7, 'link');
    const viaCells = planCollisionCells(
      d, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 7, 'link',
    );
    expect(viaCells).toEqual(viaRect);
  });

  it('refuses an empty cell list without throwing', () => {
    // The freehand equivalent of the zero-area rectangle that crashed the
    // previous plan: an empty list means an empty `skipped`, and an unseeded
    // reduce over it throws.
    const r = planCollisionCells(doc(), [], 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/no cells/i);
  });

  it('isolate over a cell list clones once per distinct block', () => {
    const d = withCells([[0, 1], [17, 1], [34, 2]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 7, 'isolate');
    expect(r.kind).toBe('isolate');
    expect((r as { plan: SurfaceEditPlan }).plan.newBlocks.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: FAIL — `planCollisionCells is not a function`.

- [ ] **Step 3: Implement**

Rename the existing `planCollisionRect` body to `planCollisionCells`, taking `cells: { x: number; y: number }[]` instead of a rect, and replace its nested `for` loops with a single deduped pass:

```ts
/** One FG cell, in 16px units. */
export interface CollisionCell { x: number; y: number }

/**
 * Plan ONE write of `shapeIndex` across an arbitrary SET of FG cells.
 *
 * The general form. `planCollisionRect` is this with the rectangle expanded —
 * a rectangle is just the cell set a marquee produces, and keeping one planner
 * is what stops the human gesture and the agent tool from drifting apart.
 *
 * DEDUPES ITS INPUT. A rectangle scan visits each cell once, but a freehand
 * drag revisits them constantly — a wiggling cursor crosses the same cell
 * dozens of times. The viewport dedupes its own stroke as well, but this
 * function must not depend on that: it is pure core with a second caller.
 */
export function planCollisionCells(
  doc: LevelDoc,
  cells: readonly CollisionCell[],
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const skips = new Map<CollisionSkipReason, number>();
  const bump = (r: CollisionSkipReason) => skips.set(r, (skips.get(r) ?? 0) + 1);
  const writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[] = [];
  let noop = 0;
  let ambiguous = 0;

  // Deduped by cell coordinate, insertion-ordered, so counts are honest and the
  // scan order stays deterministic (first-seen).
  const seenCells = new Set<string>();
  for (const c of cells) {
    const key = `${c.x},${c.y}`;
    if (seenCells.has(key)) continue;
    seenCells.add(key);

    const at = locateCell(doc, c.x, c.y);
    if (!at) { bump('outside-layout'); continue; }
    const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);
    if (outcome.kind === 'skip') { bump(outcome.reason); continue; }
    if (outcome.kind === 'noop') { noop++; continue; }
    if (at.loopAmbiguous) ambiguous++;
    writes.push(outcome);
  }

  // …everything from `const skipped = [...skips]` onward is UNCHANGED from the
  // current planCollisionRect body. Move it verbatim.
}
```

Then make the rectangle a wrapper:

```ts
/**
 * Plan a RECTANGLE of FG cells — `planCollisionCells` with the box expanded.
 *
 * Kept as its own entry point because it is the agent tool's contract
 * (`set_block_collision` takes x/y/w/h) and because a rectangle can be stated
 * in four numbers where its cell list cannot.
 */
export function planCollisionRect(
  doc: LevelDoc,
  rect: CollisionRect,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const cells: CollisionCell[] = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) cells.push({ x: rect.x + dx, y: rect.y + dy });
  }
  return planCollisionCells(doc, cells, shapeIndex, mode);
}
```

**Check `dominantSkipWhy`'s empty-list branch still reads correctly.** It currently says "this rectangle covers no cells — its width or height is zero", which is wrong wording for an empty cell list. Reword so it is true for both callers (e.g. "no cells were given"), and confirm the existing zero-area-rectangle test still passes — if its regex pins the old wording, update the test and say so.

- [ ] **Step 4: Run to verify**

```bash
npx vitest run src/core/level-classic/__tests__/collision-write.test.ts
```
Expected: PASS, **including every pre-existing `planCollisionRect` test untouched**. Those are the acceptance criterion: the rectangle's behaviour must not move. If you edit an old test to make it pass, STOP and report — the wrapper changed behaviour, which it must not.

- [ ] **Step 5: Prove the delegation is real**

Temporarily make `planCollisionRect` build its cell list with `dx <= rect.w` (one cell too wide). The `is what planCollisionRect is built on` test must FAIL, and so must several pre-existing rect tests. Restore, re-run.

- [ ] **Step 6: Full gates + the agent harness must still be 8/8**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
VITE_AURORA_DEBUG=1 npm run build && node scratchpad/collision-agent-harness.mjs 2>&1 | tail -3
```
The agent harness exercises the very planner you just rewrote, against the real disassembly. **8/8 or this task is not done.**

- [ ] **Step 7: Commit**

```bash
git add src/core/level-classic/collision-write.ts src/core/level-classic/__tests__/collision-write.test.ts
git commit -m "refactor(collision): the planner takes a cell list; a rectangle is one"
git show --stat
```

---

## Task 2: `applyCollisionShapeCells` — the gesture's write route

**Files:**
- Modify: `src/renderer/state/collision-dispatch.ts`
- Test: `src/renderer/state/__tests__/collision-dispatch.test.ts`

- [ ] **Step 1: Write the failing tests**

Reuse this suite's existing `rectDoc()`, `RECT_ORIGIN`, `st()`, `artStack()` helpers — read them first.

```ts
describe('applyCollisionShapeCells', () => {
  it('writes a freehand cell set as ONE undo step', () => {
    openReady(rectDoc());
    // Cells (16,0) and (17,0) are definition cells 0 and 1 → blocks 1 and 2.
    const r = applyCollisionShapeCells([{ x: 16, y: 0 }, { x: 17, y: 0 }], 7, 'link');

    expect(r.ok).toBe(true);
    expect(st().doc!.collision.colind[1]).toBe(7);
    expect(st().doc!.collision.colind[2]).toBe(7);

    artStack().undo();
    expect(st().doc!.collision.colind[1]).toBe(0);
    expect(st().doc!.collision.colind[2]).toBe(0);
  });

  it('refuses an empty cell set rather than throwing', () => {
    openReady(rectDoc());
    const r = applyCollisionShapeCells([], 7, 'link');
    expect(r.ok).toBe(false);
  });

  it('refuses rather than throwing when no level is open', () => {
    const r = applyCollisionShapeCells([{ x: 16, y: 0 }], 7, 'link');
    expect(r.ok).toBe(false);
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('no-level');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

`applyCollisionShapeRect` and the new function differ only in which planner they call. **Extract the shared tail rather than copying it** — the no-level guard, the refusal pass-through, the `nothing` short-circuit, `dryRun`, the command dispatch and the store-disagreement branch are all identical, and a second copy is a second place for them to drift.

```ts
/** The half both entry points share: dispatch a planned write, or hand back why not. */
function dispatchCollisionPlan(
  plan: CollisionRectPlan,
  opts: { dryRun?: boolean },
): ApplyCollisionRectResult {
  // …the body of applyCollisionShapeRect from `if (plan.kind === 'refused')` down.
}

/** Apply `shape` to an arbitrary set of FG cells as ONE undo step. The freehand
 *  gesture's route; `applyCollisionShapeRect` is the marquee's. */
export function applyCollisionShapeCells(
  cells: readonly CollisionCell[],
  shape: number,
  mode: CollisionWriteMode,
  opts: { dryRun?: boolean } = {},
): ApplyCollisionRectResult {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) return noLevelResult(mode);
  return dispatchCollisionPlan(planCollisionCells(s.doc, cells, shape, mode), opts);
}
```

…and rewrite `applyCollisionShapeRect` to the same two lines with `planCollisionRect`. Factor the fabricated no-level result into `noLevelResult(mode)` so both share it.

- [ ] **Step 4: Run, then prove the shared tail**

```bash
npx vitest run src/renderer/state/__tests__/collision-dispatch.test.ts
```
Expected: PASS, every pre-existing rect test included.

Plant: make `dispatchCollisionPlan` ignore `opts.dryRun`. **Both** the rect dryRun test and any cells dryRun test must fail — proving they share one implementation. Restore.

- [ ] **Step 5: Gates + commit**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/renderer/state/collision-dispatch.ts src/renderer/state/__tests__/collision-dispatch.test.ts
git commit -m "feat(collision): one dispatch for a cell set, sharing the rectangle's tail"
git show --stat
```

---

## Task 3: `worldToCollisionCell`

**Files:**
- Modify: `src/renderer/components/classic/viewport-math.ts`
- Test: `src/renderer/components/classic/__tests__/viewport-math.test.ts` (it EXISTS — append, do not create)

- [ ] **Step 1: Write the failing test**

```ts
describe('worldToCollisionCell', () => {
  it('quantises level pixels to 16px cells', () => {
    expect(worldToCollisionCell(0, 0)).toEqual({ x: 0, y: 0 });
    expect(worldToCollisionCell(15, 15)).toEqual({ x: 0, y: 0 });
    expect(worldToCollisionCell(16, 32)).toEqual({ x: 1, y: 2 });
  });

  it('agrees with worldToLayoutCell about which chunk a point is in', () => {
    // A collision cell is 16px and a layout cell is a 256px CHUNK, so 16 collision
    // cells span one layout cell. If these two ever disagree the map would paint
    // one chunk and highlight another.
    for (const [x, y] of [[0, 0], [255, 255], [256, 0], [1000, 300]] as const) {
      const cc = worldToCollisionCell(x, y);
      const lc = worldToLayoutCell(x, y);
      expect(Math.floor(cc.x / 16), `col at ${x},${y}`).toBe(lc.col);
      expect(Math.floor(cc.y / 16), `row at ${x},${y}`).toBe(lc.row);
    }
  });
});
```

- [ ] **Step 2: Implement**

```ts
/** The 16px COLLISION cell containing a level pixel — the unit the collision
 *  facet and `set_block_collision` speak. `worldToLayoutCell` above is the
 *  256px CHUNK cell; 16 of these span one of those. */
export function worldToCollisionCell(worldX: number, worldY: number): { x: number; y: number } {
  return { x: Math.floor(worldX / COLLISION_CELL_PX), y: Math.floor(worldY / COLLISION_CELL_PX) };
}
```

Define `COLLISION_CELL_PX = 16` beside `CHUNK_PX` (line 13) — the file has `CHUNK_PX = 256` and no 16px constant, so add one rather than writing a bare 16.

- [ ] **Step 3: Run, gates, commit**

```bash
npx vitest run src/renderer/components/classic/__tests__/viewport-math.test.ts
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/renderer/components/classic/viewport-math.ts src/renderer/components/classic/__tests__/viewport-math.test.ts
git commit -m "feat(viewport): the 16px collision cell under a level pixel"
git show --stat
```

---

## Task 4: The gesture

**THIS IS THE TASK THE NODE SUITE CANNOT VERIFY.** Its correctness is established in Task 6 under CDP. Write it carefully and do not claim it works because the suite is green.

**Files:**
- Modify: `src/renderer/components/classic/ClassicLevelViewport.tsx`

- [ ] **Step 1: Read the `stamp-chunk` gesture end to end**

`strokeRef` (declared ~line 640), its use in `onMouseDown`, `onMouseMove`, `onMouseUp`, the cancel paths (Esc / mouseleave), and the preview block in the render effect (~line 575). **This task is that gesture again, in 16px cells, with a Shift variant.** Match its structure, its ref-not-state discipline, and its comment density.

- [ ] **Step 2: Add the stroke ref**

```tsx
// The active COLLISION paint gesture (null when not painting). Mirrors
// strokeRef exactly: a ref, not state, so a drag mutates it without a render
// per cell; deduped by linear cell index so wiggling over a cell counts once;
// committed as ONE applyCollisionShapeCells on mouseup, discarded on cancel.
//
// `mode` is fixed at mousedown from the Shift key and does NOT re-read during
// the drag — a marquee that changed shape mid-gesture because a modifier was
// released would be unpredictable, and the anchor would be meaningless.
// `anchor` is the cell the gesture started on; for 'rect' the committed set is
// the box from anchor to the current cell, for 'free' it is `cells`.
const collisionStrokeRef = useRef<
  | { mode: 'free'; cells: Map<number, { x: number; y: number }> }
  | { mode: 'rect'; anchor: { x: number; y: number }; current: { x: number; y: number } }
  | null
>(null);
```

- [ ] **Step 3: Start the gesture in `onMouseDown`**

Inside the existing `facetFor(tabId) === 'collision'` branch, **after** `setCollisionProbe` (G6 — the probe fires whatever the tool), replace the immediate `applyCollisionShape` write with gesture arming:

```tsx
if (tool === 'paint-collision') {
  const shape = useClassicLevelStore.getState().collisionShape;
  if (shape != null) {
    const cell = worldToCollisionCell(world.x, world.y);
    collisionStrokeRef.current = e.shiftKey
      ? { mode: 'rect', anchor: cell, current: cell }
      : { mode: 'free', cells: new Map([[cellKey(cell), cell]]) };
    redraw();
    // PAINT, DON'T PAN. Returning here is the one behavioural change to the
    // pan-arm below, and it is gated on the tool being armed AND a shape being
    // picked — so a user who has not armed the tool still pans exactly as before.
    return;
  }
}
```

`cellKey` is a module-level `(c) => c.y * COLLISION_CELLS_PER_ROW + c.x`-style linear index; **derive the row stride from the doc's `fg.width * 16`, do not hardcode it** — a key collision would silently drop cells from the stroke.

- [ ] **Step 4: Extend in `onMouseMove`**

Before the existing gesture branches (so a collision stroke owns the move and the hover ghosts stay cleared — see the `hoverCellRef` comment):

```tsx
const cstroke = collisionStrokeRef.current;
if (cstroke) {
  const world = worldUnderCursor(e);
  if (world) {
    const cell = worldToCollisionCell(world.x, world.y);
    if (cstroke.mode === 'free') {
      const k = cellKey(cell);
      if (!cstroke.cells.has(k)) { cstroke.cells.set(k, cell); redraw(); }
    } else if (cell.x !== cstroke.current.x || cell.y !== cstroke.current.y) {
      cstroke.current = cell;
      redraw();
    }
  }
  return;
}
```

Note the redraw is **conditional on the cell actually changing** — the same discipline the hover refs use, so a stationary cursor does not redraw-storm.

- [ ] **Step 5: Commit in `onMouseUp`**

```tsx
const cstroke = collisionStrokeRef.current;
if (cstroke) {
  collisionStrokeRef.current = null;
  const shape = useClassicLevelStore.getState().collisionShape;
  if (shape != null) {
    const mode = useClassicLevelStore.getState().collisionDiverge;
    const res = cstroke.mode === 'free'
      ? applyCollisionShapeCells([...cstroke.cells.values()], shape, mode)
      : applyCollisionShapeRect(rectFromCorners(cstroke.anchor, cstroke.current), shape, mode);
    if (!res.ok) useToastStore.getState().addToast(res.why, 'error');
    else reportCollisionGesture(res.report);   // see step 7
  }
  redraw();
  return;
}
```

`rectFromCorners(a, b)` normalises either drag direction into `{ x: min, y: min, w: |dx|+1, h: |dy|+1 }` — **inclusive of both corners**, which is what a marquee means. Put it in `viewport-math.ts` beside `worldToCollisionCell` and give it its own test in Task 3 if you add it there; a marquee dragged up-and-left is the case that breaks a naive implementation.

**`collisionDiverge` is read HERE**, from the store — this is the human path, and that field is the panel's own Link/Isolate toggle. (The agent path deliberately does the opposite and takes mode as an argument.)

- [ ] **Step 6: Cancel paths**

Wherever `strokeRef.current = null` happens on Esc and on mouse-leave, clear `collisionStrokeRef` the same way, and `redraw()`. A stroke abandoned by leaving the canvas must write nothing.

- [ ] **Step 7: Preview + the partial-write report**

In the render effect, beside the stamp preview, draw the collision stroke — filled cells for `free`, an outlined box for `rect` — using `COLLISION_CELL_PX`, not `CHUNK_PX`. Reuse the stamp preview's colours unless they read badly over the collision overlay; if you add new ones, put them with the existing constants.

`reportCollisionGesture(report)` should surface a **partial** write, because silently skipping is the one outcome a painter will misread. Suggested: nothing on a clean write; an `info` toast when `report.skipped.length > 0` naming the counts (e.g. `"painted 6 cells · skipped 3 (air), 1 (blank block)"`). Keep it one line, use the existing `useToastStore`, and do NOT toast on a pure no-op (nothing changed and nothing was wrong).

- [ ] **Step 8: Gates**

```bash
npm test 2>&1 | tail -6
npx tsc --noEmit
```
Both must be clean. **This proves the file compiles and nothing else regressed — it does NOT prove the gesture works.** Say exactly that in your report.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/classic/ClassicLevelViewport.tsx src/renderer/components/classic/viewport-math.ts
git commit -m "feat(collision): drag to paint cells, shift-drag to paint a rectangle"
git show --stat
```

---

## Task 5: The Shift hint

An undiscoverable modifier is not a feature. `ClassicCollisionPanel.tsx` already carries the "This block" / "This cell" headings and the Link/Isolate switch.

**Files:**
- Modify: `src/renderer/components/classic/ClassicCollisionPanel.tsx`
- Test: `src/renderer/components/classic/__tests__/collision-panel.test.ts`

- [ ] **Step 1: Write the failing guard**

That suite is a **source scan** — it never executes `.tsx`. Match its idiom:

```ts
it('tells the user the drag gestures exist', () => {
  // Shift is the only modifier this viewport uses, and a modifier nobody
  // documents is a feature nobody finds.
  expect(src).toMatch(/drag/i);
  expect(src).toMatch(/Shift/);
});
```

- [ ] **Step 2: Add the hint under the shape picker**

One line, in the panel's existing muted style. Something like *"Drag to paint · Shift-drag for a rectangle"*.

**Use the file's own style tokens — do not invent typography.** It has a `styles` object at the bottom with `dim: { color: T.textLo, fontSize: T.tSm }` and `warn`/`reason` variants already; reuse `dim` (or add a sibling built from the same `T.*` tokens). A hardcoded colour or px size here would be the only one in the file.

- [ ] **Step 3: Gates + commit**

```bash
npx vitest run src/renderer/components/classic/__tests__/collision-panel.test.ts
npm test 2>&1 | tail -6
npx tsc --noEmit
git add src/renderer/components/classic/ClassicCollisionPanel.tsx src/renderer/components/classic/__tests__/collision-panel.test.ts
git commit -m "feat(collision): say that the gestures exist"
git show --stat
```

---

## Task 6: The runtime proof

**Everything about Tasks 4–5 that matters is invisible to the node suite.** This harness is the only evidence the gesture works.

**Files:**
- Create: `scratchpad/collision-gesture-harness.mjs`

Model it on `scratchpad/collision-agent-harness.mjs` (same session helpers, same `check(id, what, pass, detail)` convention, same abort-if-not-this-build discipline) and on `scratchpad/paint-through-harness.mjs`, which drives real mouse drags — read how it synthesises them.

**Rows:**

| Row | What | Why |
|---|---|---|
| 1 | The build under test is this worktree's, and GHZ 1 opens on the Collision facet | Aborts the run otherwise. |
| 2 | A freehand drag across N cells writes them, and the document shows it | The feature. |
| 3 | That whole drag is **ONE** undo step — one undo restores every block it touched | The property the design turns on. Must cross ≥2 distinct blocks. |
| 4 | A Shift-drag paints the whole rectangle, including cells the cursor never entered | Proves the marquee is a rectangle, not a freehand path. |
| 5 | A Shift-drag dragged **up-and-left** paints the same box as down-and-right | `rectFromCorners` normalisation — the case a naive implementation gets wrong. |
| 6 | With the tool NOT armed, a drag still PANS and writes nothing | G5's other half. A regression here breaks navigation on the facet. |
| 7 | A drag that leaves the canvas mid-gesture writes nothing | The cancel path. |
| 8 | A drag over air/blank cells reports the skips (toast or panel) and still writes the rest | Partial application, visible to a human. |

**THE SHIFT TRAP — read this before writing a single row.** `canvas-cdp-harness.mjs`'s exported `mouse(c, type, x, y, opts)` helper forwards only `type`, `x`, `y`, `button` and `buttons` to `Input.dispatchMouseEvent`. **It silently drops `modifiers`.** A Shift-drag row written against it dispatches WITHOUT Shift, performs a freehand paint, and then reports PASS for the rectangle — a false pass of exactly the kind this series keeps finding.

Fix it at the source: extend `mouse()` to forward `modifiers: opts.modifiers ?? 0`. That is purely additive (every existing caller omits it and gets 0) and it fixes the trap for every future harness rather than only this one. CDP's bitmask is **Alt=1, Ctrl=2, Meta=4, Shift=8**.

Then PROVE the modifier actually arrives, because a dropped modifier is invisible: row 4 must assert something only a rectangle can produce — a cell **inside the box that the cursor never entered**. If Shift never reached the page, that cell is unpainted and the row fails. Do not settle for asserting "some cells were painted".

**Discover coordinates at runtime** — read the level and find real solid cells, exactly as the agent harness does. Do not hardcode.

- [ ] **Step 1: Write it. Step 2: `node --check`. Step 3: commit.**

- [ ] **Step 4: THE CONTROLLER RUNS IT.** Do not run it from a background agent — it launches Electron under xvfb. Report that it is ready.

- [ ] **Step 5: Plant defects for rows 3, 5 and 6** and record in the file exactly what to change for each, as the agent harness does. The controller will run these.

---

## Task 7: Full verification

- [ ] `npm test` — aggregate totals, never a tail excerpt
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] `node scratchpad/collision-agent-harness.mjs` — **must still be 8/8**; Task 1 rewrote its planner
- [ ] `node scratchpad/collision-gesture-harness.mjs` — the new rows
- [ ] `node scratchpad/commit-collision-harness.mjs` — still 5/6, still row 4, still NOT ours
- [ ] Merge to master, verify the branch at merge time (parallel sessions share this tree)

---

## Runtime results (2026-08-19, controller foreground run)

`scratchpad/collision-gesture-harness.mjs` against the built worktree app under xvfb, driving the real `/home/volence/sonic_hacks/s1disasm` with synthetic mouse events: **8/8**.

The setup line shows it discovered its own targets rather than being handed them:

```
box at cell (380,7) in chunk 56: blocks [15,3,360,16,19,19,17,35,35]
freehand path [[380,7],[381,7],[382,7],[382,8],[382,9]] over blocks [15,3,360,19,35];
  WITNESS cell (380,8) is block 16, which appears nowhere on the path
```

**The witness cell is what makes rows 2 and 4 mean anything.** It sits inside the bounding box but is never under the cursor, and its block appears on no cell the cursor touches:

- Row 2 (freehand): `block 16: 255 -> 255` — *a rectangle would have taken it*
- Row 4 (Shift): `block 16: 255 -> 1` — *unchanged here means Shift never reached the page*

One cell, distinguishing both branches in both directions. Without it, a straight-line drag paints identical cells either way and neither row could tell freehand from marquee.

### Three defects planted, each rebuilt and re-run

| Plant | Result |
|---|---|
| `dispatchCollisionPlan`'s link branch → per-entry `classicSetColind` loop | **row 3 FAILS** (5/8; rows 4–5 collateral, the dirty document). The node suite caught it too (2 failed). |
| `rectFromCorners` → no normalisation (`w: b.x - a.x + 1` from the raw corners) | **row 5 FAILS ALONE** (7/8). Row 4 still passes, because a down-and-right drag works fine un-normalised — this bug only ever appears when someone drags the other way. |
| `onMouseDown`'s `tool === 'paint-collision'` condition → `true` | **row 6 FAILS ALONE** (7/8). Painting while unarmed, i.e. the map stops panning on this facet. |

**A false start, again worth recording.** The first attempt at the row-3 plant would have gone into `applyCollisionShape` — the SINGLE-CELL path, where `entries` always holds one element and the "loop" is behaviourally identical. That is the same trap that wasted a full build-and-run cycle on the previous plan. `grep` for the call site and check WHICH function you are in; there are two.

### Regression gates on the restored tree

- `npm test` — **3268 passed, 3 skipped, 293 files**
- `npx tsc --noEmit` — clean
- `scratchpad/collision-agent-harness.mjs` — **8/8**. Task 1 rewrote the planner the shipped `set_block_collision` tool runs on, so this is the gate that says the agent surface did not move.
- `scratchpad/commit-collision-harness.mjs` — **5/6, row 4**, exactly as before. Stage 4's, not ours.

### Harness setup, and why row 1 aborted on the first run

The first foreground run stopped at row 1: `shape armed=null`, `click landed on the swatch=false`. The picker's grid is `maxHeight:220, overflow:auto` and every unused shape sits below every used one, so `scrollIntoView({block:'nearest'})` parked the target against the grid's bottom edge — off-window, where `elementFromPoint` returns null.

**The abort was the harness working.** Seven rows would otherwise have run against an unarmed tool, painted nothing, changed nothing, and reported that no unintended writes occurred.

The fix is worth carrying forward: arming is now confirmed by **reading the shape back out of the panel** (the probed block's shape must change from 0 to the clicked index), not by a hit test. A hit test only says the pointer was over the element; it never says the handler ran.

## Notes for the implementer

- **Trust source over this plan.** Seven defects were found in the previous plan this way.
- **The node suite cannot see Tasks 4–5.** Green tests there prove compilation and non-regression, nothing more.
- **Plant every guard.** This repo's dominant defect class is guards that assert nothing — and in the last plan, one planted defect went into the wrong function and looked convincing through a full build-and-run before it was caught. Check that the plant actually changes behaviour.
- **`git add` enumerated paths only.** Never `-A`. Verify each commit with `git show --stat`.
- **Never add a `Co-Authored-By: Claude` trailer.**
- **Do not touch `src/core/collision/`** — that is aeon's system, a different model.
- **The agent tool's contract must not move.** `set_block_collision` keeps taking x/y/w/h and behaving identically; if you find yourself changing `planCollisionRect`'s signature or its reply, stop and report.
