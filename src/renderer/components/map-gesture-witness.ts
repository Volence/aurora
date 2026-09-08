/**
 * IS THE GESTURE'S SUBJECT STILL THE THING IT GRABBED? Decided out of `.tsx` so
 * the node suite can pin it; `MapViewport` asks this and acts.
 *
 * ═══ THE DEFECT THIS IS THE FIX FOR ═══
 *
 * A GESTURE CAN OUTLIVE THE THING IT STARTED ON, WITH NO POINTER EVENT IN
 * BETWEEN. `App.tsx`'s window keydown handler switches the focused tab on the
 * number keys (`requestFocusIndex`), which can change the open act; the level
 * pane is not keyed, so `MapViewport` is never remounted; and every read of the
 * subject goes through `getSectionByIndex`, which resolves `getCurrentAct()`
 * FRESH at call time. So the mouse stays down, the drag keeps running, and from
 * the switch onward it resolves an object in a DIFFERENT ACT at the same index.
 * Measured damage (lens sweep, DRAG-SURVIVES-ACT-SWITCH, critical): once per
 * mousemove the new act's object took the cursor's coordinates with no command
 * at all, and then the release wrote the OLD act's start coordinates into it
 * through a real move command, losing the original move as well.
 *
 * `layers[3]` still resolves after the subject moves, and `sections[2]` still
 * resolves after the act changes. That is what makes this class silent: the
 * write SUCCEEDS against the wrong row rather than failing loudly.
 *
 * ═══ WHY A REFERENCE AND NOT A VALUE ═══
 *
 * `guideDrag` (MapViewport.tsx) carries a JSON witness of the layer it grabbed
 * and drops the drag when it stops matching. That works there because a guide
 * drag previews through a ref and never touches the document until release. An
 * object drag WRITES LIVE, so its subject's value changes on every mousemove by
 * design, and a value witness would report "moved under me" on the first pixel.
 *
 * The witness here is therefore IDENTITY: the `Section` object and the row
 * object as they were at mousedown. Identity survives every live mutation the
 * gesture itself makes, and it is exact under all four ways the subject moves:
 * an act switch, a zone switch, a project reopen, and an undo that rebuilds the
 * rows. It is also what makes the cleanup possible: the gesture still holds the
 * row it wrote to, so it can put back what it wrote even after the act carrying
 * that row has been closed.
 *
 * ═══ AN ABSENT WITNESS IS NEVER TRUSTED ═══
 *
 * `no-witness` exists because the cheapest way for this whole file to become
 * decoration is for both sides of a comparison to degrade to `undefined` at
 * once: a field renamed on the gesture struct, or a frame built by a caller
 * that forgot one, and `undefined === undefined` reports `intact` forever. A
 * witness missing any of its three fields is stale by definition.
 */
export type GestureStatus =
  | 'intact'
  | 'no-witness'
  | 'act-changed'
  | 'section-changed'
  | 'subject-changed'
  | 'subject-gone';

/**
 * What a gesture grabbed, or what is there now: the same three fields, read at
 * two moments.
 *
 * `actKey` is the ZONE AND THE ACT composed, not the act alone: act ids are
 * unique inside a zone and `act1` exists in every one of them, so an act id by
 * itself cannot see a zone switch.
 *
 * `subject` is `null` for a gesture whose subject IS the section (a paint
 * stroke, a marquee drag). `undefined` is not the same thing: it means the
 * caller did not fill the field, and that is `no-witness`.
 */
export interface GestureFrame {
  actKey: string | null;
  section: unknown;
  subject: unknown;
}

/**
 * How the world moved under a gesture since it began. `intact` is the only
 * verdict that permits a write.
 *
 * ORDER IS INFORMATIVE, not just short-circuiting: an act switch is reported as
 * an act switch even though it also changes the section, because that is the
 * sentence an author (and the next reader of a bug report) needs.
 */
export function gestureStatus(was: GestureFrame, now: GestureFrame): GestureStatus {
  if (was.actKey === null || was.actKey === undefined) return 'no-witness';
  if (was.section === null || was.section === undefined) return 'no-witness';
  if (was.subject === undefined) return 'no-witness';
  if (now.actKey !== was.actKey) return 'act-changed';
  // Covers a section that is simply gone: `sections[i]` is nullable in the
  // model, and a shorter act answers `undefined` at the same index.
  if (now.section !== was.section) return 'section-changed';
  if (was.subject === null) return 'intact';
  if (now.subject === null || now.subject === undefined) return 'subject-gone';
  if (now.subject !== was.subject) return 'subject-changed';
  return 'intact';
}

/** `gestureStatus` as the one-bit question every write site asks. */
export function gestureIsStale(was: GestureFrame, now: GestureFrame): boolean {
  return gestureStatus(was, now) !== 'intact';
}

/**
 * WHY A GESTURE WAS DROPPED, as a clause for the author-facing sentence that
 * says so. `null` for `intact`, so a caller cannot accidentally announce a
 * cancellation that did not happen.
 *
 * The whole message is not built here: one cancel notice, built at the one place
 * that cancels (MapViewport's `abandonStaleGestures`), out of this clause.
 */
export function gestureStaleReason(status: GestureStatus): string | null {
  switch (status) {
    case 'intact': return null;
    case 'act-changed': return 'the act changed under it';
    case 'section-changed': return 'its section was replaced';
    case 'subject-changed': return 'what it grabbed was replaced';
    case 'subject-gone': return 'what it grabbed is gone';
    case 'no-witness': return 'it carried no witness of what it grabbed';
  }
}
