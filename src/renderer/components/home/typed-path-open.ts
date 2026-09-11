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
 * What the opener reports: `true` only when a project is now open from the
 * directory it was handed; `false` when the open ran and failed (the store that
 * failed has already put its notice on screen); `undefined` when the
 * unsaved-work guard stopped it before it ran. App's opener is
 * `useProject.openProjectPath`.
 */
export type TypedPathOpener = (dir: string) => Promise<boolean | undefined>;

/**
 * Decide what a submitted path field should do.
 *
 * `open` is `onOpenPath`, which App wires to `openProjectByPath`
 * (`useProject.openProjectPath`) - the GUARDED road, which awaits
 * `confirmProjectOpen()` before it touches either project store. Nothing in this
 * module may reach a switch primitive itself;
 * `shell/__tests__/project-open-door-census.test.ts` fails the whole suite if
 * any renderer file outside the four declared doors does, and this file is
 * deliberately not one of them.
 *
 * `refuse` receives the parser's OWN sentence, unrewritten. A second wording
 * here would be a fact spelled twice, and the half nobody re-reads is the half
 * that goes stale.
 *
 * `settle` is the field's own setter (React's `setText`), handed an updater.
 * It is called once, after a SUCCESSFUL open, and never otherwise.
 */
export async function submitTypedPath(
  raw: string,
  open: TypedPathOpener,
  refuse: (why: string | null) => void,
  settle: (update: (current: string) => string) => void,
): Promise<void> {
  const parsed = parseTypedProjectPath(raw);
  if (!parsed.ok) {
    refuse(parsed.why);
    return;
  }
  // Cleared BEFORE the open, not after: `open` routes into a guard that can put
  // a modal on screen, and a stale refusal sitting under the field while a
  // confirm dialog asks about something else reads as the dialog's reason.
  refuse(null);
  const opened = await open(parsed.dir);
  // HOME-PATH-FIELD-KEEPS-OLD-PATH. Home is kept alive, so on a switch between
  // two aeon projects this field outlives the open with the path it just
  // opened still in it; a click puts the caret at the end and the next typed
  // path lands APPENDED. After a success the value has served its purpose, so
  // it goes. After anything else (a failed open, a cancelled guard, a throw) it
  // stays, so a typo is corrected in place rather than retyped.
  //
  // Clearing is the whole fix. How a focus or a click treats the caret is left
  // exactly as it was: select-on-focus is the trade the owner's open card
  // NUMBERFIELD-TAB-THEN-CLICK (docs/decisions.jsonl) weighs for number boxes,
  // and it is his call, not this field's.
  if (opened === true) settle((current) => fieldAfterSuccessfulOpen(current, raw));
}

/**
 * The field's value once an open it submitted has SUCCEEDED. Empty, unless the
 * person has already typed something else while the open was in flight (a
 * project load takes seconds): that text is theirs, and erasing it would be
 * this fix's own version of the defect.
 */
export function fieldAfterSuccessfulOpen(current: string, submitted: string): string {
  return current === submitted ? '' : current;
}
