/**
 * How a pending palette-slider drag must END.
 *
 * The Genesis color sliders preview by MUTATING the live document in place —
 * that is what makes the composer canvas repaint per tick without spending a
 * history step. The cost is that a drag which merely STOPS (the panel unmounts,
 * the act switches, the facet flips) leaves the document changed with nothing on
 * the undo stack and the dirty flag unset. That state is unreachable by any user
 * action: there is no step to undo and no edit to save. So every drag has to end
 * in one of these three, including the ends the DOM never announces (Chrome does
 * not fire `blur` when a focused element is removed).
 *
 *  'noop'   — no drag was in flight; nothing was mutated, nothing to undo.
 *  'revert' — restore the pre-drag colors onto the document they were taken
 *             from, and record nothing.
 *  'commit' — restore the pre-drag colors FIRST, then run the undoable command,
 *             so the recorded step transitions pre-drag → edited.
 *
 * COMMIT-ON-TEARDOWN, not revert-on-teardown, is the rule for a drag that ends
 * on the document it started on: a teardown is standing in for the `blur` the
 * browser owed us, so it should do what blur does. Keeping the edit leaves the
 * document agreeing with what the user last saw on screen, marks it dirty so a
 * save persists it, and puts ONE undo entry on the stack — an unwanted commit
 * costs one Ctrl+Z. Reverting instead would silently discard a change the user
 * watched happen, with nothing to recover it from.
 *
 * The one case that cannot commit is a drag whose document is GONE from under it
 * (the act or sprite doc switched mid-drag). There is no stack to record on and
 * no correct place to put the step, so the mutation is rolled back rather than
 * left stranded — which is the original bug, not a lesser form of it.
 */
export type PaletteDragEnd = 'noop' | 'revert' | 'commit';

export function resolvePaletteDragEnd(o: {
  /** A pre-drag snapshot was taken, i.e. a preview mutation is outstanding. */
  hasSnapshot: boolean;
  /** The document the snapshot was taken from is still the current one. */
  sameDocument: boolean;
  /** The previewed colors actually differ from the snapshot. */
  changed: boolean;
}): PaletteDragEnd {
  if (!o.hasSnapshot) return 'noop';
  if (!o.sameDocument) return 'revert';
  return o.changed ? 'commit' : 'revert';
}
