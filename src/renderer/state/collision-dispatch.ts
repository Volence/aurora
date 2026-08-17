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
import { planCollisionWrite } from '../../core/level-classic/collision-write';

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
