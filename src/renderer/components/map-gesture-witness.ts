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

// ═══════════════════════════════════════════════════════════════════════════
// THE BACKGROUND STROKE, WHICH IS THE SAME QUESTION ABOUT A DIFFERENT CARRIER
// ═══════════════════════════════════════════════════════════════════════════
//
// A BG paint stroke was the fifth gesture on this surface and the one the drag
// parcel above examined and left, on the reading that "its commands name their
// own target document, so an act switch cannot redirect them". That is true of
// TWO of its three sources and false of the third, which is the one the map
// opens on:
//
//   • `override` — the command is `set-bg-override-layout`, and the document is
//     PER-GAME (`project.bgOverride`). No act names it. Safe.
//   • `library`  — the command is `set-bg-tiles` with a non-null `bgRef`, and
//     `history.ts resolveBgLayout` finds it by id in `project.bgLibrary`, also
//     per-game. Safe, and this is the case that docblock was written for.
//   • `act`      — the command is `set-bg-tiles` with `bgRef: null`, and
//     `resolveBgLayout` falls back to `level.act.bgLayout`. `level` is
//     `getActiveLevel()`, rebuilt at commit time from `getCurrentAct()`. So the
//     act default is resolved LATE, exactly like `sections[i]` is, and an act
//     switch redirects it: the words go into the NEW act's plane at the OLD
//     act's indices, and the undo half puts the OLD act's `oldNt` values there
//     too. That is a write to a document nobody painted, not a misfiled entry.
//
// AND THE SOURCE PAIR CANNOT SEE IT. `paintBgTile` already re-checks
// `(source, bgRef)` on every move and flushes the stroke when the pair changes.
// Between two acts that both fall back to their own default that pair is
// `('act', null)` on both sides, so the check agrees and the ONE stroke carries
// entries from two different planes into one command. Two operands that both
// degrade to the same value is how this class of check becomes decoration.
//
// SO THE WITNESS IS THE PLANE ITSELF, BY IDENTITY — the `Uint16Array` the stroke
// wrote through — for the reason the identity witness above exists: a BG stroke
// writes live, so any witness of its VALUES reports "moved under me" on the
// first pixel. Identity distinguishes act A's `bgLayout` from act B's while
// surviving every word the gesture itself lays down, and it is also what makes
// the revert exact: the stroke still holds the array it wrote to, so it can put
// back what it wrote even after the act carrying that array has been closed.
// `doc` is witnessed beside it because the override's mirror array is rebuilt
// when `doc.layout` is replaced (bg-override-view.ts's cache), and a band edit
// that replaces the document mid-stroke is a real way for the plane to move.

/**
 * What a BG stroke is painting, or what the canvas is painting now.
 *
 * `source` and `bgRef` are kept BESIDE the plane identity rather than replaced
 * by it, and not as a second-best test: they are what separates the two
 * outcomes. A pair that changed inside one act is the artist's own doing (the
 * active section now displays a different background) and the entries so far
 * still belong to a plane this act owns, so that stroke is FLUSHED and
 * committed. A plane that changed under an unchanged pair is the defect, and
 * that stroke is reverted. One verdict cannot carry both, so there are two.
 *
 * `bgRef` and `doc` are legitimately `null` (only `library` has an id, only
 * `override` has a document), so `null` cannot be this frame's absent-field
 * sentinel the way it is for `GestureFrame.actKey`. `undefined` is: a field a
 * caller forgot, or one a rename left behind.
 */
export interface BgStrokeFrame {
  actKey: string | null;
  source: string;
  bgRef: string | null;
  /** The `Uint16Array` the stroke writes through — the plane's identity. */
  layout: unknown;
  /** The override document, or `null` for the other two sources. */
  doc: unknown;
}

export type BgStrokeStatus =
  | 'intact'
  | 'no-witness'
  | 'act-changed'
  | 'plane-replaced'
  | 'plane-gone'
  | 'background-switched';

/**
 * How the background moved under a stroke since it began. `now` is `null` when
 * nothing resolves at all (no act open, no plane on it).
 *
 * ORDER IS INFORMATIVE, the rule `gestureStatus` states. An act switch is
 * reported as an act switch even though it also replaces the plane, because
 * that is the sentence a bug report needs — and because it is the verdict with
 * the stricter outcome: committing act A's stroke while act B is open is the
 * corruption whether or not the source pair also moved.
 */
export function bgStrokeStatus(was: BgStrokeFrame, now: BgStrokeFrame | null): BgStrokeStatus {
  if (was.actKey === null || was.actKey === undefined) return 'no-witness';
  if (was.source === undefined) return 'no-witness';
  if (was.bgRef === undefined) return 'no-witness';
  if (was.layout === null || was.layout === undefined) return 'no-witness';
  if (was.doc === undefined) return 'no-witness';
  if (now === null) return 'plane-gone';
  if (now.layout === null || now.layout === undefined) return 'plane-gone';
  if (now.actKey !== was.actKey) return 'act-changed';
  if (now.source !== was.source || now.bgRef !== was.bgRef) return 'background-switched';
  if (now.layout !== was.layout || now.doc !== was.doc) return 'plane-replaced';
  return 'intact';
}

/**
 * DOES THIS STROKE HAVE TO BE THROWN AWAY? — the one-bit question
 * `abandonStaleGestures` asks.
 *
 * `background-switched` is deliberately NOT stale, and it is the row that makes
 * this predicate able to fail in both directions. Reverting there would delete
 * an edit the artist made and meant, on the act that still owns it; the caller
 * that flushes it into a command is `paintBgTile`, and it was already right.
 */
export function bgStrokeMustRevert(status: BgStrokeStatus): boolean {
  return status !== 'intact' && status !== 'background-switched';
}

/**
 * WHY A BG STROKE WAS DROPPED, as a clause for the one cancel notice
 * `abandonStaleGestures` builds. `null` for the two verdicts that write no
 * cancellation — the intact one, and the switch that commits instead — so a
 * caller cannot announce a cancellation that did not happen.
 */
export function bgStrokeStaleReason(status: BgStrokeStatus): string | null {
  switch (status) {
    case 'intact': return null;
    case 'background-switched': return null;
    case 'act-changed': return 'the act changed under the background it was painting';
    case 'plane-replaced': return 'the background plane it was painting was replaced';
    case 'plane-gone': return 'the background it was painting is no longer on screen';
    case 'no-witness': return 'it carried no witness of which background it was painting';
  }
}
