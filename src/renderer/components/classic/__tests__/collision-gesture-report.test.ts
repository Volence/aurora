// What a paint gesture TELLS the painter — run, not scanned.
//
// `reportCollisionGesture` used to live inside ClassicLevelViewport.tsx, which
// this node-only suite cannot execute, so nothing here was tested at all. It is
// pure (a report in, toast calls out), so it now lives in its own module and
// this suite calls it.
//
// The case that matters most is the one the old code dropped: a gesture whose
// cells ALL wrote (`skipped: []`) but which crossed a loop. The painter sees a
// clean canvas while the engine may read a different chunk — and the old
// `if (report.skipped.length === 0) return;` fired before anything looked at
// `warnings`.

import { describe, it, expect, beforeEach } from 'vitest';
import { reportCollisionGesture } from '../collision-gesture-report';
import { useToastStore } from '../../../state/toastStore';
import type { CollisionRectReport } from '../../../../core/level-classic/collision-write';

/**
 * A report shaped like the planner's own output.
 *
 * Every default here is a SUCCESS: `applied` non-zero with no skips and no
 * warnings is the clean write the planner returns for a rectangle wholly inside
 * writable blocks, so a test that adds nothing is asserting silence on the
 * genuinely uneventful case. `mode: 'link'` because that is the panel's default
 * toggle and the reporter branches on neither mode nor block counts.
 */
function report(over: Partial<CollisionRectReport> = {}): CollisionRectReport {
  return {
    mode: 'link', applied: 3, noop: 0, skipped: [], blocks: 1, warnings: [],
    // Present because the report REQUIRES them, and defaulted to the clean-write
    // answer like everything else here — nothing skipped, so nothing elided.
    skippedCells: [], skippedCellsTruncated: false,
    ...over,
  };
}

// The planner's real sentence shape (collision-write.ts), trimmed: what is
// asserted is that the STRING SURVIVES, so the fixture only has to be the
// planner's own wording, not a paraphrase.
const LOOP_WARNING = '2 cells are behind a loop: the engine may read chunk $51 instead of $28 '
  + 'while the player is looping, so those writes may not be the ones that apply';

beforeEach(() => { useToastStore.setState({ toasts: [] }); });

const toasts = () => useToastStore.getState().toasts.map((t) => ({ message: t.message, type: t.type }));

describe('reportCollisionGesture', () => {
  it('surfaces a warning on a gesture that skipped NOTHING', () => {
    // The dropped case. `applied: 4` with `skipped: []` is a fully successful
    // write — exactly the report the old early return threw away.
    reportCollisionGesture(report({ applied: 4, warnings: [LOOP_WARNING] }));
    expect(toasts()).toEqual([{ message: LOOP_WARNING, type: 'warning' }]);
  });

  it('surfaces warnings AND the skip line, the skip line still an info', () => {
    reportCollisionGesture(report({
      applied: 1, skipped: [{ reason: 'block0', count: 2 }], warnings: [LOOP_WARNING],
    }));
    const t = toasts();
    expect(t).toHaveLength(2);
    expect(t).toContainEqual({ message: LOOP_WARNING, type: 'warning' });
    // Unchanged wording and unchanged type: a skip is a tally, not a hazard.
    expect(t).toContainEqual({ message: 'painted 1 cell · skipped 2 blank blocks', type: 'info' });
  });

  it('emits one toast per warning, not one joined line', () => {
    // The planner emits at most one today; the field is an array, and two
    // self-contained sentences concatenated read as one claim and dismiss
    // together.
    reportCollisionGesture(report({ warnings: ['first hazard', 'second hazard'] }));
    expect(toasts()).toEqual([
      { message: 'first hazard', type: 'warning' },
      { message: 'second hazard', type: 'warning' },
    ]);
  });

  it('stays silent on a clean write with nothing wrong', () => {
    reportCollisionGesture(report());
    expect(toasts()).toEqual([]);
  });

  it('stays silent on a pure no-op', () => {
    reportCollisionGesture(report({ applied: 0, noop: 3 }));
    expect(toasts()).toEqual([]);
  });

  it('still says what it painted and what it stepped over', () => {
    reportCollisionGesture(report({
      applied: 0, noop: 2, skipped: [{ reason: 'air', count: 1 }, { reason: 'overhang', count: 3 }],
    }));
    expect(toasts()).toEqual([
      { message: '2 already had it · skipped 1 air, 3 past the collision table', type: 'info' },
    ]);
  });
});
