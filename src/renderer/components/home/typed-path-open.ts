// The second door's SUBMIT RULE, extracted from OpenByPath.tsx.
//
// WHY IT IS NOT IN THE COMPONENT. This repo's vitest suite is node-only: there
// is no jsdom, so nothing that lives inside a React component can be asserted on
// here at all, and the standing failure mode is a door whose wiring is "checked"
// by a source-text grep that a rename defeats. The one property that matters -
// A REFUSED PATH NEVER REACHES THE OPENER - is a pure decision over two
// callbacks, so it is written where it can be executed rather than read.
//
// The component keeps exactly the parts that need a browser: the input's value,
// the Enter key, and where the sentence renders.

import { parseTypedProjectPath } from '../../../shared/project-path';

/**
 * Decide what a submitted path field should do.
 *
 * `open` is `onOpenPath`, which App wires to `openProjectByPath`
 * (`useProject.openPath`) - the GUARDED road, which awaits `confirmProjectOpen()`
 * before it touches either project store. Nothing in this module may reach a
 * switch primitive itself; `shell/__tests__/project-open-door-census.test.ts`
 * fails the whole suite if any renderer file outside the four declared doors
 * does, and this file is deliberately not one of them.
 *
 * `refuse` receives the parser's OWN sentence, unrewritten. A second wording
 * here would be a fact spelled twice, and the half nobody re-reads is the half
 * that goes stale.
 */
export function submitTypedPath(
  raw: string,
  open: (dir: string) => void,
  refuse: (why: string | null) => void,
): void {
  const parsed = parseTypedProjectPath(raw);
  if (!parsed.ok) {
    refuse(parsed.why);
    return;
  }
  // Cleared BEFORE the open, not after: `open` routes into a guard that can put
  // a modal on screen, and a stale refusal sitting under the field while a
  // confirm dialog asks about something else reads as the dialog's reason.
  refuse(null);
  open(parsed.dir);
}
