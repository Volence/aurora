# Commit Collision Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a canvas commit give its new art collision, instead of landing blocks the player falls through and leaving the artist to fix them one at a time.

**Architecture:** Stage 4 of `docs/superpowers/specs/2026-08-16-classic-collision-authoring-design.md`, on master at `13734af`. A pure transform over `CanvasCommitPlan` plus a toggle in the commit view — **not** a repair action applied after the fact.

**Tech Stack:** TypeScript, React, vitest (node-only — no DOM, `.tsx` never executed, so `.tsx` is covered by source guards plus a CDP row).

---

## What grounding changed about this stage

The spec (§4.4) describes "one remediation action on that report". Reading the code says it can be better than that, and the difference is worth stating because it removes a whole failure mode:

**The report is a PREVIEW, not a receipt.** `CommitPlanView.tsx:164` renders `reportLines(plan.report)` from the `CanvasCommitPlan` — before anything is applied. So remediation is an **option on the commit**, folded into the same plan and the same single undo step, rather than a second edit chasing the first.

**The plan already knows the identities.** `CanvasCommitPlan.blockWrites` is `{ blockId, def, colind }[]` (`classic-commit-plan.ts:115`), so the blocks that would land with no collision are exactly those with `colind === 0`. No planner change is needed to find them.

**"Cells with no solidity" means appended chunks, precisely.** In the planner's cell loop, `const old = src?.cells[ci] ?? null` and `src` is null only when `target.chunkFileIndex === null` — an appended chunk. A REPLACED chunk has a predecessor for all 256 cells. So `cellsWithoutSolidity` counts appended-chunk cells and nothing else, which the report already says out loud ("appended chunks"). The transform can act on `chunkAppends` alone and be exactly right.

---

## The shape that must be assigned

**`$FF`, and only `$FF`.** Measured directly from `collide/Collision Array (Normal).bin` and `collide/Angle Map.bin` rather than taken on trust — all five of `$FB`–`$FF` are 16 high in every column, and their angles are:

| shape | angle | |
|---|---|---|
| `$FB` | `$E0` | −45° |
| `$FC` | `$20` | +45° |
| `$FD` | `$A0` | 225° |
| `$FE` | `$60` | 135° |
| **`$FF`** | **`$FF`** | flat |

Four of the five are the 45° diagonal family. Picking "a full block" by height alone gives flat new ground a diagonal angle, so the player runs up a floor. Only `$FF` is flat.

The same rule in the other direction: solidity `All` (3), not `Top` (1). A committed drawing is ground until someone says otherwise; jump-through is a decision, not a default.

---

## What this deliberately does NOT do

It does not guess *which* new blocks should be solid. Every block with no collision gets the same flat shape, or none do — it is one toggle, not per-block inference. The spec's §4.4 already rejected inference: a drawn bush or cloud becoming solid is an invisible wall, which is worse to debug than a hole you can see. The artist refines in the Collision facet, which now exists.

---

## Task 1: The transform, as a pure function

**Files:**
- Create: `src/core/art/commit-collision.ts`
- Test: `src/core/art/__tests__/commit-collision.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// GIVING A COMMIT'S NEW ART COLLISION, as a transform over the plan.
//
// The commit report is a PREVIEW (CommitPlanView renders it from the plan, not
// from a result), so this folds into the same plan and the same undo step
// rather than chasing the commit with a second edit.
//
// $FF is not "a full block" chosen by height. Five shapes are full-height —
// $FB..$FF — and $FB..$FE carry 45°-family angles ($E0/$20/$A0/$60). Assigning
// one of those would give flat new ground a diagonal angle, so the player runs
// up a floor. Only $FF is flat.

import { describe, it, expect } from 'vitest';
import { withCollision, FLAT_SHAPE } from '../commit-collision';
import type { CanvasCommitPlan } from '../classic-commit-plan';

const block = (blockId: number, colind: number) => ({
  blockId, colind,
  def: { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
});
const cells = (spec: Array<{ block: number; solidity: number }>) => {
  const out = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  spec.forEach((s, i) => { out[i] = { block: s.block, xf: false, yf: false, solidity: s.solidity }; });
  return out;
};

const plan = (over: Partial<CanvasCommitPlan> = {}): CanvasCommitPlan => ({
  tileWrites: [],
  blockWrites: [block(10, 0), block(11, 7), block(12, 0)],
  chunkWrites: [{ chunkFileIndex: 3, def: { cells: cells([{ block: 5, solidity: 0 }]) } }],
  chunkAppends: [{ cells: cells([{ block: 9, solidity: 0 }, { block: 0, solidity: 0 }]) }],
  paletteWrites: null,
  report: {} as CanvasCommitPlan['report'],
  ...over,
}) as CanvasCommitPlan;

describe('withCollision', () => {
  it('gives every collisionless new block the FLAT shape', () => {
    const out = withCollision(plan());
    expect(out.blockWrites.map((b) => b.colind)).toEqual([FLAT_SHAPE, 7, FLAT_SHAPE]);
  });

  it('uses $FF, not another full-height shape', () => {
    // $FB..$FE are full height too, and all four are 45° loop corners.
    expect(FLAT_SHAPE).toBe(0xff);
  });

  it('leaves inherited collision alone', () => {
    const out = withCollision(plan());
    expect(out.blockWrites.find((b) => b.blockId === 11)!.colind).toBe(7);
  });

  it('makes appended chunks solid, but only where a block is named', () => {
    const out = withCollision(plan());
    const c = out.chunkAppends[0].cells;
    expect(c[0].solidity).toBe(3);      // block 9 → solid from every direction
    expect(c[1].solidity).toBe(0);      // block 0 is blank; the engine skips it
    expect(c[2].solidity).toBe(0);      // untouched filler
  });

  it('does NOT touch replaced chunks', () => {
    // A replaced chunk has a predecessor for all 256 cells, so its solidity was
    // inherited rather than missing. Overwriting it would silently make an
    // existing jump-through platform solid.
    const out = withCollision(plan());
    expect(out.chunkWrites[0].def.cells[0].solidity).toBe(0);
  });

  it('does not mutate the plan it was given', () => {
    const p = plan();
    withCollision(p);
    expect(p.blockWrites[0].colind).toBe(0);
    expect(p.chunkAppends[0].cells[0].solidity).toBe(0);
  });

  it('reports what it changed, so the view can say so before committing', () => {
    const out = withCollision(plan());
    expect(out.applied).toEqual({ blocks: 2, cells: 1 });
  });
});
```

> Work the expected counts out from the fixture rather than trusting them: two blockWrites have `colind === 0`, and the appended chunk names a non-zero block in exactly one cell.

- [ ] **Step 2: Run, watch it fail.**

- [ ] **Step 3: Implement.** `withCollision(plan)` returns a NEW plan (no mutation — the caller re-renders the preview from the untransformed plan when the toggle is off) plus an `applied: { blocks, cells }` count. Export `FLAT_SHAPE = 0xff` with the `$FB`–`$FE` reasoning in its docblock.

- [ ] **Step 4: Run, watch it pass.**

- [ ] **Step 5: PLANT — mandatory.** Change `FLAT_SHAPE` to `0xfb` (also full height). Confirm the `$FF` test fails. Restore. Then plant a second: make the transform touch `chunkWrites` as well as `chunkAppends`; confirm the replaced-chunk test fails. Restore.

- [ ] **Step 6: Commit.**

---

## Task 2: The toggle in the commit view

**Files:**
- Modify: `src/renderer/components/canvas/CommitPlanView.tsx`
- Modify: `src/renderer/components/canvas/canvas-commit-model.ts` (report line)
- Test: `src/renderer/components/canvas/__tests__/` (source guard — `.tsx` is never executed)

A `Chip` beside the report: **"Give new art collision"**, off by default. When on, the plan passed to the commit is `withCollision(plan)` and the report line says what that will do.

**Off by default, deliberately.** The commit is already an irreversible-feeling operation over someone's level, and silently assigning collision to art the artist has not looked at yet is a decision they did not make. The report already tells them the art will have none; this makes acting on it one click, not zero.

The existing line reads *"collision: X inherited · N have none"*. With the toggle on it should say what will happen instead — e.g. *"collision: X inherited · N will get flat ($FF)"* — so the preview describes the plan that will actually be applied.

- [ ] **Step 1: Write the source guard**

```ts
  it('routes the toggle through the pure transform', () => {
    expect(src).toMatch(/withCollision/);
    // The view must not assign shapes itself — a second copy of the $FF rule
    // is how one of them ends up being $FB.
    expect(src, 'the view must not name a shape byte itself').not.toMatch(/0xff|255/i);
  });

  it('defaults the toggle off', () => {
    expect(src).toMatch(/useState\(false\)|= false/);
  });
```

- [ ] **Steps 2-4: run/fail, implement, run/pass.**

- [ ] **Step 5: PLANT.** Inline `0xff` in the view instead of calling the transform; confirm the first guard fails. Restore.

- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`, commit.

---

## Task 3: Verification

- [ ] `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] **Drive it.** Adapt `scratchpad/canvas-cdp-harness.mjs` (it already opens s1disasm, creates a canvas through the real New Canvas dialog, and reaches the commit view) or `scratchpad/collision-edit-harness.mjs`. Rows:
  1. commit a small drawing with the toggle OFF, then probe a committed cell on the Collision facet — it must report **no collision**;
  2. undo, commit the same drawing with the toggle ON, probe the same cell — it must report shape **255** and solidity **All**;
  3. **one** Ctrl+Z undoes the whole commit either way — the remediation must not be a second undo step.
- [ ] The run must leave `s1disasm` unmodified — check `git -C /home/volence/sonic_hacks/s1disasm status --short` before and after, and **do not save**.

---

## Not in this plan

Stage 5 (MCP parity: `commit_canvas`, `import_art_sheet`, and a classic `paint_collision` in facet coordinates). Per-block inference of what *should* be solid — explicitly rejected in spec §4.4, because an invisible wall is worse to debug than a visible hole.
