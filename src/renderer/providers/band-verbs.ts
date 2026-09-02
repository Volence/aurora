// THE TWO BAND VERBS, DERIVED ONCE FOR EVERY SURFACE THAT OFFERS THEM.
//
// `BgAnimBandPanel`'s `New band` section arrives collapsed (item 45), and until
// parcel B it was the only place a band could be made — the owner asked "is
// there a way to add these bands?" with the door shut (triage 2026-08-26 §A.2).
// The Effects facet's tool-options bar now carries the same two verbs as
// chips. Two surfaces means one derivation: the label, the disabled reason
// and the command each chip runs come from here, so the bar cannot say a
// promotion is possible while the panel refuses it, or run a spec the panel
// would not.
//
// THE SPEC IS THE STORE'S CANDIDATE. `bandCandidate` (editorStore) used to hold
// only the geometry the lens needs — base, cols, rows — with the phase fill,
// driver and rate living in the panel's React state, which a sibling bar
// cannot read. They are on the candidate now, optional, ABSENT meaning "the
// key is left out of the document" exactly as the panel's `(default)` options
// meant it. `bandSpecOf` is the one place that turns the candidate into a
// `BandSpec`.
//
// NO DOCUMENT WRITE HAPPENS HERE. `run()` BUILDS the command result; the
// caller executes it on the focused level (or shows the refusal), which keeps
// this module pure and the node suite able to compare it against the panel's
// own `promoteBandCommand` / `addBandCommand` calls verbatim.

import type { BgOverrideDocument } from '../../core/formats/bg-override/bg-override';
import {
  DEFAULT_PHASE_FILL, addBandCommand, insertUnavailableReason, promoteBandCommand,
  promoteUnavailableReason, type BandCommandResult, type BandPhaseFill, type BandSpec,
} from './bg-anim-aeon';

/** The promotion form's state, as `editorStore.bandCandidate` holds it. */
export interface BandCandidate {
  staticBase: number;
  /**
   * True once the AUTHOR set `staticBase` themselves — typed it, or dragged a
   * range on the strip. Absent/false means the number is the panel's own seed,
   * following the document's animated prefix.
   *
   * ═══ WHY A PROVENANCE FLAG AND NOT A COMPARISON ═══
   *
   * EFFECTS-W1 defect 12. Adding a tile animation grows the animated prefix, so
   * the panel's seed follows it — `Promote from tile 32` becomes `33`. UNDO
   * shrinks the prefix back to 32, and the toolbar went on saying 33: a control
   * advertising an operation from a world the author had just left, which is
   * the same shape as the owner's "some seem like they're just a repeat of
   * things".
   *
   * The fix cannot be "always follow the document", because that would rewrite
   * a base the author deliberately chose every time a band came or went. It
   * cannot be "never follow" either — that is the bug. The missing fact is WHO
   * last wrote the number, and nothing in the document can answer it, so the
   * candidate carries it.
   *
   * ⚠ IT IS NOT PERSISTED AND MUST NOT BE. It describes this session's editing,
   * not the project; a stored `true` would freeze a seed forever on a document
   * that had moved underneath it.
   */
  staticBaseAuthored?: boolean;
  cols: number;
  rows: number;
  /** Absent = the panel's default fill (`DEFAULT_PHASE_FILL`). */
  phaseFill?: BandPhaseFill;
  /** Absent = the key is left out of the document. */
  driver?: BandSpec['driver'];
  /** Absent = the key is left out of the document. */
  rateShift?: number;
}

/**
 * What `staticBase` should be once the DOCUMENT has moved under it — the whole
 * of EFFECTS-W1 defect 12, as one comparison a test can run.
 *
 * IT LIVES HERE AND NOT IN THE PANEL'S `useEffect` for this file's own reason
 * and `BgAnimBandPanel`'s: the node suite cannot see React, so a rule spelled
 * inside a hook is a rule nothing in `vitest run` can check — and this rule was
 * WRONG in the shipped panel for exactly as long as nobody could check it.
 *
 * THE TWO CASES, AND WHY THEY DIFFER:
 *
 *   NOT AUTHORED — the number is the panel's own seed, so it tracks the
 *     animated prefix in BOTH directions. Adding a tile animation moved it
 *     32 -> 33; undoing that add must move it back, or the toolbar goes on
 *     offering `Promote from tile 33` in a world where 33 does not exist.
 *
 *   AUTHORED — the author typed it, marked it on the map, or dragged it in the
 *     strip. It is only ever RAISED, and only when the prefix has grown past it
 *     and made it illegal. Following it DOWN would rewrite a deliberate choice
 *     every time a band came or went, which is what the original one-directional
 *     clamp was right to avoid.
 */
export function seededStaticBase(c: BandCandidate, firstPromotableSlot: number): number {
  return c.staticBaseAuthored
    ? Math.max(c.staticBase, firstPromotableSlot)
    : firstPromotableSlot;
}

/** The candidate as the command layer wants it. Absent keys STAY absent. */
export function bandSpecOf(c: BandCandidate): BandSpec {
  return {
    cols: c.cols,
    rows: c.rows,
    phaseFill: c.phaseFill ?? DEFAULT_PHASE_FILL,
    ...(c.driver !== undefined ? { driver: c.driver } : {}),
    ...(c.rateShift !== undefined ? { rateShift: c.rateShift } : {}),
  };
}

export interface BandVerb {
  /** Chip text. Names the base on a promotion, because that is the one input a
   *  reader cannot see from the bar. */
  label: string;
  /** Why the chip is off, or null when it is on — the panel's predicate, verbatim. */
  reason: string | null;
  /** Build the command. Never executes; never throws — a refusal is `ok: false`. */
  run: () => BandCommandResult;
}

export function bandVerbs(
  doc: BgOverrideDocument | null, c: BandCandidate,
): { promote: BandVerb; add: BandVerb } {
  const spec = bandSpecOf(c);
  return {
    promote: {
      label: `Promote from tile ${c.staticBase}`,
      reason: promoteUnavailableReason(doc),
      run: () => promoteBandCommand(doc, c.staticBase, spec),
    },
    add: {
      label: 'Add blank tile animation',
      reason: insertUnavailableReason(doc, c.cols, c.rows),
      run: () => addBandCommand(doc, spec),
    },
  };
}
