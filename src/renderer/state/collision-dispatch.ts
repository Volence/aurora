// THE JOIN between the pure planner and the store.
//
// core/level-classic/collision-write.ts is store-free by convention (see
// classic-surface-plan.ts's header) and so cannot dispatch a command. The
// panel must not assemble a plan or call a store command itself either — if
// it did, the Link/Isolate decision would exist in two places and they would
// drift. This module is the single function that reads doc + probe + mode
// from the store, asks the planner what to do, and dispatches the one write
// command it names.
//
// Refusals are handed straight back to the caller unchanged — no store write
// happens on a refused plan, so there is nothing for the caller to undo.

import { useClassicLevelStore, classicSetColind, classicPaintSurface } from './classicLevelStore';
import { probeCollision } from '../../core/level-classic/collision-probe';
import {
  planCollisionWrite,
  planCollisionRect,
  planCollisionCells,
  type CollisionCell,
  type CollisionRect,
  type CollisionRectPlan,
  type CollisionRectReport,
  type CollisionRectRefusal,
  type CollisionWriteMode,
} from '../../core/level-classic/collision-write';

export type ApplyCollisionShapeResult = { ok: true } | { ok: false; why: string };

/** Apply `shape` to the cell the user last probed. Returns what happened, so
 *  the caller can show a refusal where the user is looking. */
export function applyCollisionShape(shape: number): ApplyCollisionShapeResult {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) {
    return { ok: false, why: 'no classic level is open' };
  }

  const point = s.collisionProbe;
  if (!point) {
    return { ok: false, why: 'no cell has been probed yet — click a cell in the viewport first' };
  }

  const probe = probeCollision(s.doc, point.x, point.y);
  if (!probe) {
    // Only reachable if the probed point has fallen outside the layout since
    // it was recorded (e.g. an act swap that openAct's `fresh` did not catch).
    return { ok: false, why: 'the probed point is outside this act\'s layout' };
  }

  const plan = planCollisionWrite(s.doc, probe, shape, s.collisionDiverge);
  // Nothing to write: the block already carries this shape. Reported as
  // success because from the user's side the shape IS what they asked for —
  // and silently doing nothing beats spending a block id and an undo entry to
  // arrive at the state we were already in.
  if (plan.kind === 'noop') return { ok: true };
  if (plan.kind === 'refused') {
    return { ok: false, why: plan.why };
  }

  const result = plan.kind === 'link'
    ? classicSetColind(plan.entries)
    : classicPaintSurface(plan.plan);

  if (!result.ok) {
    return { ok: false, why: result.error };
  }
  return { ok: true };
}

export type ApplyCollisionRectResult =
  | { ok: true; report: CollisionRectReport }
  | { ok: false; refusal: CollisionRectRefusal; why: string; resolution: string; report: CollisionRectReport };

/**
 * The fabricated result for "there is nothing open to write to".
 *
 * The counts are all zero because NOTHING WAS SCANNED — there was no document
 * to scan. It is the same shape a refused plan carries so callers have one
 * report field to read, not an estimate of a selection we looked at.
 *
 * SHARED so the two entry points cannot disagree about what a no-level refusal
 * looks like — an agent branching on `refusal.kind` would be the one to notice.
 */
function noLevelResult(mode: CollisionWriteMode): ApplyCollisionRectResult {
  const report: CollisionRectReport = {
    mode, applied: 0, noop: 0, skipped: [], blocks: 0, warnings: [],
  };
  return {
    ok: false,
    // NOT 'nothing-applicable': that kind means "cells were scanned and none
    // could take a shape", and here no cell was scanned at all.
    refusal: { kind: 'no-level' },
    why: 'no classic level is open',
    resolution: 'Open an act first (get_classic_level).',
    report,
  };
}

/**
 * The half both multi-cell entry points share: dispatch a planned write, or
 * hand back why not. Everything except WHICH planner produced the plan.
 *
 * A second copy of this tail would be a second place for the refusal shapes,
 * the no-op short-circuit and the dryRun skip to drift — the exact failure this
 * module exists to prevent.
 */
function dispatchCollisionPlan(
  plan: CollisionRectPlan,
  opts: { dryRun?: boolean },
): ApplyCollisionRectResult {
  if (plan.kind === 'refused') {
    return { ok: false, refusal: plan.refusal, why: plan.why, resolution: plan.resolution, report: plan.report };
  }
  // Every cell already carried the shape: success, and deliberately NO command,
  // so no undo entry is spent arriving at the state we were already in.
  if (plan.kind === 'nothing') return { ok: true, report: plan.report };
  if (opts.dryRun) return { ok: true, report: plan.report };

  const result = plan.kind === 'link'
    ? classicSetColind(plan.entries)
    : classicPaintSurface(plan.plan);

  // A rejection HERE is a genuine fault: the planner is the authority on what is
  // legal, so the command re-validating and disagreeing means the two drifted.
  //
  // It gets its OWN kind, and carried 'nothing-applicable' before: cells WERE
  // applicable here — the planner built a command out of them — and the
  // `skipped` counts that kind carries have nothing to do with the rejection.
  if (!result.ok) {
    return {
      ok: false,
      refusal: { kind: 'store-disagreement', error: result.error },
      why: result.error,
      resolution: 'This is an Aurora bug — the planner and the store command disagree.',
      report: plan.report,
    };
  }
  return { ok: true, report: plan.report };
}

/**
 * Apply `shape` across a rectangle of FG cells as ONE undo step.
 *
 * The rectangle sibling of `applyCollisionShape`, and the tool's only write
 * route — the same reason that function exists: the panel must not assemble a
 * plan or call a store command, or the Link/Isolate decision would live in two
 * places and drift.
 *
 * `mode` is an ARGUMENT and is never read from `collisionDiverge`. That field is
 * the human's panel toggle; an agent's call must not be steered by whatever a
 * person last clicked. Only `applyCollisionShape` reads it.
 *
 * Refusals are handed back unchanged — no store write happens on a refused
 * plan, so there is nothing to undo.
 *
 * `dryRun` lives HERE rather than in the agent handler so the handler has
 * exactly one call to make. If the handler planned for itself it would have to
 * import the planner, which is precisely what its source guard forbids — and
 * the guard is right: a second planning call site is a second place for the
 * Link/Isolate decision to drift. It also means a dry run's numbers ARE the
 * real ones, not a second estimate.
 */
export function applyCollisionShapeRect(
  rect: CollisionRect,
  shape: number,
  mode: CollisionWriteMode,
  opts: { dryRun?: boolean } = {},
): ApplyCollisionRectResult {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) return noLevelResult(mode);
  return dispatchCollisionPlan(planCollisionRect(s.doc, rect, shape, mode), opts);
}

/**
 * Apply `shape` to an arbitrary SET of FG cells as ONE undo step — the freehand
 * gesture's route. `applyCollisionShapeRect` is the marquee's and the agent's.
 *
 * Identical to it in every respect but the planner call, deliberately: a stroke
 * and a rectangle must refuse the same way, spend the same one undo entry, and
 * report the same numbers, because they are the same write with a different
 * selection. `planCollisionCells` dedupes the cell list itself, so a wiggling
 * cursor handing the same cell in a hundred times still costs one write.
 *
 * `mode` is an ARGUMENT here too — the caller passes the panel's toggle if it
 * wants it; this function never reads `collisionDiverge` on its behalf.
 */
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
