/**
 * ═══ A DELETE REFUSAL, IN THE TWO LENGTHS THE TWO SURFACES NEED ═══
 *
 * `deletePresetRefusal` and `deleteSceneRefusal` each speak ONE sentence of
 * about 250 characters. That sentence is right for the place it has always been
 * painted, the section BODY, and it is far too long for the place the control
 * it explains actually lives: a `CollapsibleSection` header row, which arrives
 * COLLAPSED. Measured on screen (scratchpad/delete-refusal-onscreen-harness.mjs
 * rows [p3]/[s3], 2026-09-18): while the section is shut the sentence is not
 * merely off screen, it is NOT IN THE DOM — `ui/CollapsibleSection.tsx` renders
 * `{!collapsed && children}` — so an author meets a greyed Delete with nothing
 * beside it, and nothing a search or a screen reader can reach either. Card
 * DISABLED-CONTROL-REASON-BEHIND-DISCLOSURE, closed `reason-in-header`.
 *
 * ⚠ SO THERE ARE TWO LENGTHS, AND THEY MUST NOT BE ABLE TO DISAGREE. The cost
 * the card names is drift: a short form typed beside a long one agrees on the
 * day it is written and stops agreeing the day somebody rewords either. This
 * module is the answer to that, and it is a CONSTRUCTION rather than a test —
 * a clause is a `lead` (who binds what, and it is the whole of the short form)
 * plus a `joiner` plus the `rest`, and BOTH lengths are built from the same
 * `lead`. There is no second place to state which sections or which regions
 * bind the document, so no edit can make the header name one thing and the body
 * another. `deleteRefusalIsPrefixed` states that property for a test to assert;
 * it is a check on the construction, not the thing that holds it up.
 *
 * ⚠ THE `lead` CARRIES NO TRAILING PUNCTUATION, and the `joiner` is where the
 * two lengths differ: the section arm reads `... binds "x". Deleting it would
 * leave ...` and joins with `'. '`, while the cannot-tell arm reads `Aurora
 * cannot tell whether a region binds "x": this act is in region mode ...` and
 * joins with `': '`. The short form always ends in a full stop, because it is a
 * sentence on its own in the header. That is the ONE character the two lengths
 * do not share, and it is punctuation rather than content.
 *
 * ⚠ IT IS NOT A SUMMARY, AND IT DOES NOT SAY WHAT TO DO. The short form is the
 * FACT (who still names this document); the repair, the consequence and the
 * pointer at the control that undoes it stay in the body, where there is room
 * for them. A header that tried to carry the repair would be a paraphrase of
 * the body, which is the drift this module exists to make impossible.
 *
 * WHY core/ AND NOT EITHER PROVIDER. `effects-preset.ts` imports FROM
 * `effects-aeon.ts`, so the arrow cannot also point back (the same constraint
 * `sceneBindingListWords`'s docblock records), and both refusals need this. The
 * `{ short, full }` shape itself is this repo's established idiom: see
 * `vDeformRampSentence` in ./ramp-scroll-mode.ts and `EFFECTS_REELS_BINDING_NOTE`
 * in ./scene-ui.ts.
 */

/**
 * One refusal, in both lengths.
 *
 * `short` is PAINTED in the always-visible section header beside the disabled
 * control; `full` is painted in the section body and rides the header
 * element's own `title`. Neither is ever composed at a call site.
 */
export interface DeleteRefusal {
  readonly short: string;
  readonly full: string;
}

/**
 * One clause of a refusal, split where the two lengths part company.
 *
 * A refusal has one clause in section mode and up to two in region mode (a
 * region cause and a leftover-sidecar cause, which are reported together
 * because both bindings dangle if the document goes).
 */
export interface DeleteRefusalClause {
  /**
   * WHO STILL NAMES THE DOCUMENT, with no trailing punctuation. This is the
   * whole of the short form and the opening of the full one, so it is stated
   * exactly once.
   */
  readonly lead: string;
  /** What separates the lead from the rest in the FULL sentence: `'. '`, `': '` or `' '`. */
  readonly joiner: string;
  /** The consequence and the repair. Painted in the body only. */
  readonly rest: string;
}

/**
 * Both lengths of a refusal, or null when there is nothing to refuse.
 *
 * Null rather than an empty pair, because every caller's own contract is
 * "null means the control is enabled" and an empty string is a sentence a panel
 * can paint.
 */
export function deleteRefusalOf(
  clauses: readonly DeleteRefusalClause[],
): DeleteRefusal | null {
  if (clauses.length === 0) return null;
  return {
    short: clauses.map((c) => `${c.lead}.`).join(' '),
    full: clauses.map((c) => `${c.lead}${c.joiner}${c.rest}`).join(' '),
  };
}

/**
 * Does this pair still come from one composition?
 *
 * True when every clause's lead, in order, opens the corresponding clause of
 * the full sentence — which is what `deleteRefusalOf` guarantees by building
 * both from one `lead`. A test asserts it over the real refusals so that a
 * future hand-built `{ short, full }` literal, which would reintroduce exactly
 * the drift this module removes, is caught rather than shipped.
 *
 * The comparison drops the short form's final full stop, the one character the
 * two lengths deliberately do not share.
 */
export function deleteRefusalIsPrefixed(refusal: DeleteRefusal): boolean {
  const clauses = refusal.short.split('. ');
  let at = 0;
  for (const clause of clauses) {
    const lead = clause.endsWith('.') ? clause.slice(0, -1) : clause;
    const found = refusal.full.indexOf(lead, at);
    if (found < 0) return false;
    at = found + lead.length;
  }
  return true;
}
