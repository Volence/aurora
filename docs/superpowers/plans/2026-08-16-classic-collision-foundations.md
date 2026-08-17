# Classic Collision Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make classic's collision overlay tell the truth, and give the store the one thing it cannot currently express — cloning a block with a *different* collision shape — so the Collision facet can be built on top.

**Architecture:** Stages 1 and 2 of `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md`. No UI. The angle-needle maths comes out of the draw function into a pure, exhaustively-testable helper; `SurfaceEditPlan.newBlocks` gains an optional colind override; `classicSetColind` learns to explain its two refusals. Everything here is independently shippable and everything later depends on it.

**Tech Stack:** TypeScript, React (untouched here), Zustand store, vitest (node-only — no DOM, `.tsx` files are never executed, so canvas code is tested through a recording context stand-in).

---

## Background the engineer needs

**The collision chain.** An FG layout byte is a 1-based chunk id ($00 = air). A chunk has 16×16 cells. Each cell packs *solidity* (2 bits, 13..14) and a *block id* + X/Y flips. The block id indexes `doc.collision.colind`, giving a shape index; the shape is 16 height columns plus one angle byte. Solidity gates the shape, and **block id 0 short-circuits before either** is read.

**The angle convention, anchored on the engine.** `Sonic_Jump` (`s1disasm/'01 Sonic.asm':1224-1231`) jumps along angle−$40 through the standard `CalcSine` table, so flat ground (angle 0) must launch the player upward. Working back from that, the screen-space direction of angle *a* is **(cos a, sin a)** with canvas y **down**. The current overlay draws `(cos a, −sin a)` — a stray negation, so an ascending slope renders as descending.

**Flips.** The engine transforms the angle when the chunk cell is flipped: xflip negates it, yflip maps it to −a−$80. Applied in that order (x, then y). The overlay's *height* rendering already honours flips; the needle ignores them entirely.

**Files you will touch:**
- Modify: `src/renderer/components/classic/classic-overlays.ts` (the `drawCollision` export, ~line 48-95)
- Create: `src/renderer/components/classic/collision-needle.ts`
- Create: `src/renderer/components/classic/__tests__/collision-needle.test.ts`
- Modify: `src/renderer/components/classic/__tests__/classic-overlays.test.ts`
- Modify: `src/core/art/classic-surface-plan.ts` (the `SurfaceEditPlan` interface, ~line 30-55)
- Modify: `src/renderer/state/classicLevelStore.ts` (`classicPaintSurface` ~line 982-992, `classicSetColind` ~line 1189)
- Modify: `src/renderer/state/__tests__/classicLevelStore.test.ts`
- Modify: `src/core/project/profiles/s1.ts` (the doc comment at line 82)

**Test commands.** Whole suite: `npm test`. One file: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`. The suite is node-only; there is no DOM.

**House rule, non-negotiable:** every fix lands with a *plant* — before you believe a new test guards anything, break the thing it guards and watch it fail. Steps below tell you when.

---

## Task 1: The angle needle, as a pure function

**Files:**
- Create: `src/renderer/components/classic/collision-needle.ts`
- Test: `src/renderer/components/classic/__tests__/collision-needle.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/classic/__tests__/collision-needle.test.ts`:

```ts
// THE COLLISION ANGLE NEEDLE, in screen space.
//
// The convention is anchored on the ENGINE, not guessed: Sonic_Jump
// ('01 Sonic.asm':1224-1231) jumps along angle-$40 through CalcSine, so flat
// ground (angle 0) must launch the player UP. Working back from that, the
// screen direction of angle a is (cos a, sin a) with canvas y DOWN.
//
// The overlay used to draw (cos a, -sin a), which mirrored every slope
// vertically: $E0 is an ascending slope and it rendered as descending.

import { describe, it, expect } from 'vitest';
import { angleNeedle } from '../collision-needle';

describe('angleNeedle', () => {
  it('draws flat ground flat', () => {
    const { dx, dy } = angleNeedle(0x00, false, false);
    expect(dx).toBeCloseTo(1, 6);
    expect(dy).toBeCloseTo(0, 6);
  });

  it('draws $E0 ASCENDING (dy negative is up, canvas y-down)', () => {
    // The exact bug this file exists for. With the old (cos a, -sin a) this
    // came back positive and the slope drew downhill.
    const { dx, dy } = angleNeedle(0xe0, false, false);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
  });

  it('draws $20 DESCENDING', () => {
    const { dx, dy } = angleNeedle(0x20, false, false);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
  });

  it('mirrors with X flip, as the engine does (neg)', () => {
    // An ascending slope, flipped horizontally, is a descending one.
    const plain = angleNeedle(0xe0, false, false);
    const flipped = angleNeedle(0xe0, true, false);
    expect(flipped.dy).toBeCloseTo(-plain.dy, 6);
    expect(flipped.dx).toBeCloseTo(plain.dx, 6);
  });

  it('mirrors with Y flip, as the engine does (-a - $80)', () => {
    const plain = angleNeedle(0x20, false, false);
    const flipped = angleNeedle(0x20, false, true);
    expect(flipped.dy).toBeCloseTo(-plain.dy, 6);
  });

  it('applies X then Y when both are set', () => {
    // Order is the engine's: negate for xflip, THEN -a-$80 for yflip. Stated as
    // a test because "both flips" is the case a reader would otherwise have to
    // re-derive from the disassembly.
    const both = angleNeedle(0x20, true, true);
    const stepwise = angleNeedle((-((-0x20) & 0xff) - 0x80) & 0xff, false, false);
    expect(both.dx).toBeCloseTo(stepwise.dx, 6);
    expect(both.dy).toBeCloseTo(stepwise.dy, 6);
  });

  it('is a unit vector for every one of the 256 angles', () => {
    for (let a = 0; a < 256; a++) {
      const { dx, dy } = angleNeedle(a, false, false);
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/components/classic/__tests__/collision-needle.test.ts`
Expected: FAIL — `Cannot find module '../collision-needle'`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/classic/collision-needle.ts`:

```ts
/**
 * The screen-space direction of a collision angle byte, canvas y-DOWN.
 *
 * Pulled out of `drawCollision` so it can be tested at all: this suite is
 * node-only and never executes a canvas. It was also wrong for the whole life
 * of the overlay — a stray negation drew `(cos a, -sin a)`, mirroring every
 * slope vertically — and a lie that small is invisible until someone authors
 * collision against it.
 *
 * The convention is the ENGINE's. `Sonic_Jump` ('01 Sonic.asm':1224-1231)
 * jumps along angle-$40 through the standard CalcSine table, so angle 0 (flat
 * ground) must send the player up; that fixes the direction as (cos a, sin a)
 * with y increasing downward.
 *
 * Flips are the engine's too (FindFloor): xflip NEGATES the angle, yflip maps
 * it to -a-$80, applied in that order. The overlay's height rendering already
 * honoured flips while the needle did not, so a flipped cell drew a correct
 * slope under a wrong angle.
 */
export function angleNeedle(angleByte: number, xf: boolean, yf: boolean): { dx: number; dy: number } {
  let a = angleByte & 0xff;
  if (xf) a = -a & 0xff;
  if (yf) a = (-a - 0x80) & 0xff;
  const r = (a / 256) * Math.PI * 2;
  return { dx: Math.cos(r), dy: Math.sin(r) };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/renderer/components/classic/__tests__/collision-needle.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Plant a violation**

Put the old negation back — change `return { dx: Math.cos(r), dy: Math.sin(r) };` to `return { dx: Math.cos(r), dy: -Math.sin(r) };` — and re-run.
Expected: FAIL on "draws $E0 ASCENDING". **Then restore the correct line.** If it does not fail, the test is not guarding anything and must be fixed before you continue.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/classic/collision-needle.ts src/renderer/components/classic/__tests__/collision-needle.test.ts
git commit -m "fix(classic): the collision angle needle pointed the wrong way

Anchored on the engine rather than guessed: Sonic_Jump launches along
angle-\$40 through CalcSine, so angle 0 must send the player up, which
fixes the screen direction as (cos a, sin a) with y down. The overlay
drew (cos a, -sin a) — a stray negation — so every ascending slope
rendered as descending.

Pulled into a pure helper because this suite is node-only and never runs
a canvas, so the maths had no way to be tested where it lived."
```

---

## Task 2: Wire `drawCollision` to the helper, flips and all

**Files:**
- Modify: `src/renderer/components/classic/classic-overlays.ts:83-92`
- Test: `src/renderer/components/classic/__tests__/classic-overlays.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/components/classic/__tests__/classic-overlays.test.ts`:

```ts
import { drawCollision } from '../classic-overlays';
import { angleNeedle } from '../collision-needle';

/** A recording context that captures the needle's two endpoints. */
function needleCtx() {
  const pts: { x: number; y: number }[] = [];
  const ctx = {
    lineWidth: 0, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    fillRect() {}, strokeRect() {},
    moveTo(x: number, y: number) { pts.push({ x, y }); },
    lineTo(x: number, y: number) { pts.push({ x, y }); },
    getTransform() { return { a: 1 }; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pts };
}

/** One chunk, one solid cell at index 0, pointing at block 1 → shape 1. */
function collisionDoc(xf: boolean, yf: boolean): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf, yf, solidity: 3 };
  const heights = [new Int8Array(16), new Int8Array(16).fill(8)];
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: { colind: new Uint8Array([0, 1]), shapes: { heights, angles: new Uint8Array([0, 0xe0]) } },
  } as unknown as LevelDoc;
}

describe('drawCollision angle needle', () => {
  it('draws the needle along angleNeedle, not its vertical mirror', () => {
    const { ctx, pts } = needleCtx();
    // Signature is (ctx, doc, col, row, chunkId, showAngles) — chunkId is the
    // FIFTH argument and is 1-based, so passing 0 there is air and the function
    // returns before drawing anything.
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    // The needle is the only moveTo/lineTo pair drawn; endpoints straddle the
    // cell centre along the direction, length 6.
    expect(pts.length).toBe(2);
    const want = angleNeedle(0xe0, false, false);
    const dy = pts[1].y - pts[0].y;
    expect(Math.sign(dy)).toBe(Math.sign(want.dy));
    expect(dy).toBeLessThan(0); // $E0 ascends
  });

  it('honours the chunk cell flips the heights already honour', () => {
    const { ctx, pts } = needleCtx();
    drawCollision(ctx, collisionDoc(true, false), 0, 0, 1, true);
    const dy = pts[1].y - pts[0].y;
    expect(dy).toBeGreaterThan(0); // X-flipped $E0 descends
  });
});
```

> `drawCollision`'s signature is `(ctx, d, col, row, chunkId, showAngles)` — verified at `classic-overlays.ts:48-55`. `chunkId` is the **fifth** argument and is 1-based (0 = air, and the function returns immediately), which is why the calls above pass `0, 0, 1, true` and not `1, 0, 0, true`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/components/classic/__tests__/classic-overlays.test.ts`
Expected: FAIL on "honours the chunk cell flips" (the needle currently ignores `xf`/`yf`), and likely on the first case too.

- [ ] **Step 3: Replace the needle block**

In `src/renderer/components/classic/classic-overlays.ts`, replace:

```ts
    if (showAngles) {
      const ang = angles[shapeIndex] ?? 0;
      const a = (ang / 256) * Math.PI * 2;
      const mx = cx + 8, my = cy + 8, len = 6;
      ctx.strokeStyle = COLLISION_ANGLE_TICK;
      ctx.lineWidth = 1 / ctx.getTransform().a;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(a) * len, my + Math.sin(a) * len);
      ctx.lineTo(mx + Math.cos(a) * len, my - Math.sin(a) * len);
      ctx.stroke();
    }
```

with:

```ts
    if (showAngles) {
      // Direction and flips both come from collision-needle.ts, which is
      // anchored on the engine's own convention and unit-tested; this block
      // used to inline a mirrored formula and ignore cell.xf/yf entirely,
      // while the height rendering above honoured them.
      const { dx, dy } = angleNeedle(angles[shapeIndex] ?? 0, cell.xf, cell.yf);
      const mx = cx + 8, my = cy + 8, len = 6;
      ctx.strokeStyle = COLLISION_ANGLE_TICK;
      ctx.lineWidth = 1 / ctx.getTransform().a;
      ctx.beginPath();
      ctx.moveTo(mx - dx * len, my - dy * len);
      ctx.lineTo(mx + dx * len, my + dy * len);
      ctx.stroke();
    }
```

Add the import at the top of the file, beside the existing imports:

```ts
import { angleNeedle } from './collision-needle';
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/renderer/components/classic/__tests__/classic-overlays.test.ts`
Expected: PASS.

- [ ] **Step 5: Plant a violation**

Change `angleNeedle(angles[shapeIndex] ?? 0, cell.xf, cell.yf)` to `angleNeedle(angles[shapeIndex] ?? 0, false, false)` and re-run.
Expected: FAIL on "honours the chunk cell flips". **Restore the correct line.**

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/classic/classic-overlays.ts src/renderer/components/classic/__tests__/classic-overlays.test.ts
git commit -m "fix(classic): the needle now honours cell flips, like the heights do

drawCollision transformed the column heights for xf/yf and then drew the
angle needle from the raw byte, so a flipped cell showed a correct slope
under a wrong angle. Both halves now go through collision-needle.ts."
```

---

## Task 3: The overlay's missing block-0 short-circuit

**Files:**
- Modify: `src/renderer/components/classic/classic-overlays.ts:64-68`
- Test: `src/renderer/components/classic/__tests__/classic-overlays.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/components/classic/__tests__/classic-overlays.test.ts`:

```ts
describe('drawCollision block 0', () => {
  it('draws nothing for block 0, which the engine never consults', () => {
    // The engine short-circuits on block 0 (`andi.w #$7FF,d0 / beq.s .isblank`)
    // BEFORE the solidity test and before colind. The overlay skipped shape 0
    // and solidity 0 but not block 0, so a non-zero colind[0] would paint
    // phantom collision the game does not have. Latent in stock (colind[0]=0
    // in all six zones) — and exactly the kind of thing a collision EDITOR
    // makes reachable.
    const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
    cells[0] = { block: 0, xf: false, yf: false, solidity: 3 };
    const doc = {
      chunks: [{ cells }],
      blocks: [{ cells: [] }],
      collision: {
        colind: new Uint8Array([1]),                      // colind[0] non-zero
        shapes: { heights: [new Int8Array(16), new Int8Array(16).fill(8)], angles: new Uint8Array([0, 0]) },
      },
    } as unknown as LevelDoc;

    const { ctx, pts } = needleCtx();
    let fills = 0;
    (ctx as unknown as { fillRect: () => void }).fillRect = () => { fills++; };
    drawCollision(ctx, doc, 0, 0, 1, true);
    expect(fills).toBe(0);
    expect(pts.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/components/classic/__tests__/classic-overlays.test.ts`
Expected: FAIL — `expected 0 to be 16` or similar; the overlay paints the phantom shape.

- [ ] **Step 3: Add the short-circuit**

In `drawCollision`, change:

```ts
    const cell = chunk.cells[i];
    if (!cell || cell.solidity === 0) continue;
```

to:

```ts
    const cell = chunk.cells[i];
    // Block 0 first, because that is the order the engine tests in: FindFloor
    // does `andi.w #$7FF,d0 / beq.s .isblank` BEFORE `btst d5,d4`. Without
    // this, a non-zero colind[0] draws collision the game will never apply.
    if (!cell || cell.block === 0 || cell.solidity === 0) continue;
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/renderer/components/classic/__tests__/classic-overlays.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all files pass. Stock zones have `colind[0] = 0`, so no existing expectation changes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/classic/classic-overlays.ts src/renderer/components/classic/__tests__/classic-overlays.test.ts
git commit -m "fix(classic): the overlay skips block 0, as the engine does

FindFloor short-circuits on block 0 before both the solidity test and the
colind lookup; the overlay skipped shape 0 and solidity 0 but not block 0.
Latent while colind[0] is 0 everywhere in stock — and reachable the moment
a collision editor exists."
```

---

## Task 4: A colind override on the Isolate clone path

**Files:**
- Modify: `src/core/art/classic-surface-plan.ts:30-55`
- Modify: `src/renderer/state/classicLevelStore.ts:982-992`
- Test: `src/renderer/state/__tests__/classicLevelStore.test.ts`

**Why this exists:** the Collision facet's Isolate means "clone this block, repoint this chunk cell, and give the clone a *different* shape". Today `classicPaintSurface` hard-codes the clone's colind to the source's, and `SurfaceEditPlan.newBlocks` has nowhere to say otherwise. Composing `classicAddBlock` + `classicEditChunkCells` + `classicSetColind` instead would be three commits — three undo entries — and an undo could strand a cloned block, which is the exact hazard the store's own comment at `classicLevelStore.ts:930` forbids.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/state/__tests__/classicLevelStore.test.ts` (the file already imports `classicPaintSurface`, `SurfaceEditPlan` and the fixture helpers):

```ts
describe('classicPaintSurface colind override', () => {
  // Same helpers the file's existing classicPaintSurface tests use; redeclared
  // here because they are scoped to that describe block.
  const blankBlockCell = (tile: number) => ({ tile, xf: false, yf: false, pal: 0, pri: false });
  const clonePlan = (colind?: number): SurfaceEditPlan => ({
    tileWrites: [],
    newBlocks: [{
      def: { cells: Array.from({ length: 4 }, () => blankBlockCell(1)) },
      sourceBlockId: 1,
      ...(colind === undefined ? {} : { colind }),
    }],
    blockCellEdits: [],
    chunkCellEdits: [],
    stats: { tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 },
  });

  beforeEach(() => { openReady(); });

  it('gives a cloned block the OVERRIDE shape, not the source shape', () => {
    // Isolate-for-collision: same pixels, deliberately different collision.
    // Without the override this is inexpressible in one command.
    useClassicLevelStore.getState().doc!.collision.colind[1] = 7;
    expect(classicPaintSurface(clonePlan(9))).toEqual({ ok: true });
    const doc = useClassicLevelStore.getState().doc!;
    expect(doc.collision.colind[doc.blocks.length - 1]).toBe(9);
  });

  it('still inherits the source shape when no override is given', () => {
    // The existing contract, locked so the override cannot quietly become
    // mandatory: an art-side Isolate clone must keep its collision.
    useClassicLevelStore.getState().doc!.collision.colind[1] = 7;
    expect(classicPaintSurface(clonePlan())).toEqual({ ok: true });
    const doc = useClassicLevelStore.getState().doc!;
    expect(doc.collision.colind[doc.blocks.length - 1]).toBe(7);
  });

  it('refuses an out-of-range override rather than truncating it', () => {
    const r = classicPaintSurface(clonePlan(300));
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/0\.\.255/);
  });
});
```

> `openReady()` is the file's existing helper for opening the fixture doc into a ready state — it is already defined in `classicLevelStore.test.ts` and used by the surrounding `classicPaintSurface` tests. The fixture's colind is `Uint8Array([0, 0])` for two blocks, so block 2 is past its end (Task 5 relies on that).

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts -t "colind override"`
Expected: FAIL — TypeScript rejects the `colind` property, and the first case returns 7 instead of 9.

- [ ] **Step 3: Widen the plan type**

In `src/core/art/classic-surface-plan.ts`, change the `newBlocks` field:

```ts
  newBlocks: { def: BlockDef; sourceBlockId: number; colind?: number }[];
```

and extend the docblock above it with:

```
   * `colind`, when present, OVERRIDES that inheritance. It exists for
   * Isolate-for-collision: same pixels, deliberately different collision. It is
   * optional because the art-side Isolate must keep inheriting — a clone that
   * silently lost its shape is ground the player falls through.
```

- [ ] **Step 4: Honour it in the store**

In `src/renderer/state/classicLevelStore.ts`, inside `classicPaintSurface`, replace:

```ts
      plan.newBlocks.forEach((b, i) => {
        out[doc.blocks.length + i] = src[b.sourceBlockId] ?? 0;
      });
```

with:

```ts
      plan.newBlocks.forEach((b, i) => {
        out[doc.blocks.length + i] = b.colind ?? src[b.sourceBlockId] ?? 0;
      });
```

And add validation before the `nextColind` block, beside the plan's other validation:

```ts
  for (const b of plan.newBlocks) {
    if (b.colind !== undefined && (!isInt(b.colind) || b.colind < 0 || b.colind > 255)) {
      return err(`colind override ${b.colind} out of range 0..255`);
    }
  }
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts`
Expected: PASS, including every pre-existing `classicPaintSurface` test.

- [ ] **Step 6: Plant a violation**

Change `b.colind ?? src[b.sourceBlockId] ?? 0` back to `src[b.sourceBlockId] ?? 0` and re-run.
Expected: FAIL on "gives a cloned block the OVERRIDE shape". **Restore it.**

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/core/art/classic-surface-plan.ts src/renderer/state/classicLevelStore.ts src/renderer/state/__tests__/classicLevelStore.test.ts
git commit -m "feat(classic): a surface plan can clone a block with a different shape

Isolate-for-collision needs 'same pixels, different collision' as ONE
command. classicPaintSurface hard-coded the clone's colind to the source's
and SurfaceEditPlan.newBlocks had nowhere to say otherwise, so the only
route was three commands = three undo entries, which can strand a cloned
block on undo.

The override is optional on purpose: the art-side Isolate must keep
inheriting, because a clone that loses its shape is ground the player
falls through."
```

---

## Task 5: `classicSetColind` explains its two refusals

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts:1189-1210`
- Test: `src/renderer/state/__tests__/classicLevelStore.test.ts`

**Why:** block 0 is unreachable by the engine, and blocks past the end of the colind table are the CLASSIC-A4 overhang — GHZ ships **439 blocks against a 410-byte table**, and in ROM the overhang resolves into the *adjacent zone's* table, so those blocks may have real in-game collision Aurora draws as air. The existing range check already refuses them; both refusals just need to say why, because a collision editor turns each into a message a user will actually read.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/state/__tests__/classicLevelStore.test.ts`:

```ts
describe('classicSetColind refusals', () => {
  beforeEach(() => { openReady(); });

  it('refuses block 0 and says the engine cannot read it', () => {
    const r = classicSetColind([{ blockId: 0, value: 3 }]);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/block 0/);
    expect((r as { error: string }).error).toMatch(/short-circuit|never/i);
  });

  it('refuses a block past the colind table and names the overhang', () => {
    // The fixture's colind is 2 bytes for 2 blocks; block 2 is past the end.
    const r = classicSetColind([{ blockId: 2, value: 3 }]);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/overhang|adjacent zone/i);
  });

  it('still accepts an in-range block', () => {
    expect(classicSetColind([{ blockId: 1, value: 3 }])).toEqual({ ok: true });
    expect(useClassicLevelStore.getState().doc!.collision.colind[1]).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts -t "refusals"`
Expected: FAIL — block 0 is currently accepted, and the out-of-range message says only "out of range 0..1".

- [ ] **Step 3: Rewrite the validation loop**

In `classicSetColind`, replace the validation loop:

```ts
  for (const { blockId, value } of entries) {
    if (!isInt(blockId) || blockId < 0 || blockId >= colind.length) {
      return err(`colind block ${blockId} out of range 0..${colind.length - 1}`);
    }
```

with:

```ts
  for (const { blockId, value } of entries) {
    // Block 0 is the blank block. FindFloor does `andi.w #$7FF,d0 / beq.s
    // .isblank` before it reads either solidity or colind, so a shape stored
    // here can never apply in game — writing it would be an edit the editor
    // shows and the console ignores.
    if (blockId === 0) {
      return err('block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply');
    }
    if (!isInt(blockId) || blockId < 0) {
      return err(`colind block ${blockId} out of range 0..${colind.length - 1}`);
    }
    // THE OVERHANG (CLASSIC-A4). A zone can ship more blocks than its colind
    // has bytes — GHZ is 439 against 410 — and in ROM the tail resolves into
    // the ADJACENT zone's table, so these blocks may have real collision that
    // Aurora cannot see and draws as air. Growing the table here would write
    // zeros over that, silently changing every other overhang block's in-game
    // collision. Refused rather than guessed; reading the true values needs
    // cross-file reach Aurora does not have.
    if (blockId >= colind.length) {
      return err(`block ${blockId} is past the end of this zone's collision table (${colind.length} entries) — the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks`);
    }
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts`
Expected: PASS. If a pre-existing test asserted the old "out of range 0..N" string for a too-large id, update it to the new message — do not weaken the new message to satisfy it.

- [ ] **Step 5: Plant a violation**

Delete the `if (blockId === 0)` arm and re-run.
Expected: FAIL on "refuses block 0". **Restore it.**

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/classicLevelStore.ts src/renderer/state/__tests__/classicLevelStore.test.ts
git commit -m "fix(classic): set_colind refuses block 0, and explains the overhang

Two refusals a collision editor turns into messages people read. Block 0
was accepted outright though FindFloor short-circuits before it can ever
be consulted. Blocks past the colind table were already refused, by a
range check that read like an off-by-one; it is really the CLASSIC-A4
overhang — GHZ ships 439 blocks against 410 bytes and the tail resolves
into the adjacent zone's table in ROM — so it now says so."
```

---

## Task 6: Fix the colind doc drift

**Files:**
- Modify: `src/core/project/profiles/s1.ts:82`

- [ ] **Step 1: Read the line**

Run: `sed -n '78,86p' src/core/project/profiles/s1.ts`
The comment describes colind as per-chunk. It is per-**block**, and it is shared by all three acts of the zone (one `collide/{ZONE}.bin`).

- [ ] **Step 2: Correct it**

Replace the words "per-chunk" in that comment with a correct sentence:

```
 * per-BLOCK collision-shape indices, shared by all three acts of the zone
 * (one collide/{ZONE}.bin) — block id → shape index, not chunk → anything.
```

- [ ] **Step 3: Verify nothing depended on the wording**

Run: `npm test`
Expected: all pass (a comment change).

- [ ] **Step 4: Commit**

```bash
git add src/core/project/profiles/s1.ts
git commit -m "docs(classic): colind is indexed by block, not chunk

Found while designing the collision editor. The profile documented colind
as per-chunk; it is per-block and zone-wide."
```

---

## Task 7: Full verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 2: Whole suite**

Run: `npm test`
Expected: all files pass; the count is higher than the branch point by the tests added here.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`. The `INEFFECTIVE_DYNAMIC_IMPORT` warning about `export-sprite.ts` is pre-existing and unrelated.

- [ ] **Step 4: Confirm the overlay is visibly right**

Open the app on a GHZ act with the collision overlay and angles on, and look at a slope: an ascending slope must show a needle rising to the right, and a horizontally-flipped copy of it must mirror. This is the one claim no node test can make, and the whole point of the two bug-fix tasks.

---

## Not in this plan

The Collision facet itself, the commit remediation, and MCP parity — stages 3, 4 and 5 of the spec. Each gets its own plan, and each depends on this one landing first: the facet must not be built on a needle that lies, and Isolate-for-collision cannot be expressed until Task 4 exists.
