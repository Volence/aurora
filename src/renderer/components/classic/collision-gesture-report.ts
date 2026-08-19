// What a collision paint gesture SAYS to the person who made it.
//
// Extracted from ClassicLevelViewport.tsx, which is .tsx and therefore never
// executes in the node-only renderer suite — the viewport's guards there are
// source scans. This logic is pure (a report in, toast calls out) and has no
// React in it, so it lives here and is tested by running it instead.

import { useToastStore } from '../../state/toastStore';
import type { CollisionRectReport, CollisionSkipReason } from '../../../core/level-classic/collision-write';

/**
 * A skip reason in words a painter can read, carrying its count.
 *
 * The raw reason strings are INTERNAL VOCABULARY — `block0` in particular is not
 * a phrase to show a person, and `overhang` names a ROM-layout fact, not
 * anything the user did. Deliberately shorter than the planner's own
 * `skipPhrase` (collision-write.ts), which writes the full explanatory sentence
 * for a refusal; this is a tally line, so it counts rather than explains.
 * `air` stays uncountable ("3 air") — "3 airs" is not English.
 */
export function collisionSkipWords(reason: CollisionSkipReason, count: number): string {
  const s = count === 1 ? '' : 's';
  switch (reason) {
    case 'air': return `${count} air`;
    case 'block0': return `${count} blank block${s}`;
    case 'no-such-block': return `${count} missing block${s}`;
    case 'overhang': return `${count} past the collision table`;
    case 'outside-layout': return `${count} outside the level`;
  }
}

/**
 * Surface what a gesture did that the canvas cannot show: what it stepped over,
 * and what it may not have written where the painter thinks.
 *
 * TWO INDEPENDENT LINES, and the warning goes first BECAUSE it is not about the
 * skips. A partial write is the one outcome a painter will misread: cells
 * silently stepped over (a stroke that crossed air, or a rectangle whose corner
 * clipped blank blocks) look exactly like the tool not working, so a stroke with
 * skips says what it did and what it stepped over. The warnings are the opposite
 * case — a gesture can write EVERY cell successfully and still be
 * loop-ambiguous, and that combination (no skips, a warning) is the one that
 * most needs saying: the canvas shows a clean write while the engine may read a
 * different chunk behind the loop. Returning early on `skipped.length === 0`
 * before emitting them is the bug this ordering exists to prevent.
 *
 * ONE TOAST PER WARNING, not one joined line. The planner emits at most one
 * today, but `warnings` is an array and each entry is a whole self-contained
 * sentence naming its own hazard; concatenating two of those makes a paragraph
 * whose halves cannot be dismissed separately and which reads as one claim.
 * Separate toasts each keep their own dwell and their own click-to-dismiss.
 *
 * SILENT OTHERWISE, in both directions. A clean write with nothing wrong needs
 * no announcement — the canvas already shows it — and a pure no-op (repainting
 * a shape that was already there) is nagging someone for making no mistake.
 * Refusals never reach here at all: `applyCollisionShapeCells/Rect` return
 * `ok: false` for those and the caller toasts `why` as an error.
 */
export function reportCollisionGesture(report: CollisionRectReport): void {
  for (const w of report.warnings) useToastStore.getState().addToast(w, 'warning');
  if (report.skipped.length === 0) return;
  const parts: string[] = [];
  if (report.applied > 0) parts.push(`painted ${report.applied} cell${report.applied === 1 ? '' : 's'}`);
  // `applied === 0` with skips is reachable only alongside no-ops: the planner
  // refuses a selection where nothing applied AND nothing already matched, so
  // this branch is what keeps the line from reading "painted 0 cells".
  if (report.noop > 0) parts.push(`${report.noop} already had it`);
  parts.push(`skipped ${report.skipped.map((s) => collisionSkipWords(s.reason, s.count)).join(', ')}`);
  useToastStore.getState().addToast(parts.join(' · '), 'info');
}
