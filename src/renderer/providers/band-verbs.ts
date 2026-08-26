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
  cols: number;
  rows: number;
  /** Absent = the panel's default fill (`DEFAULT_PHASE_FILL`). */
  phaseFill?: BandPhaseFill;
  /** Absent = the key is left out of the document. */
  driver?: BandSpec['driver'];
  /** Absent = the key is left out of the document. */
  rateShift?: number;
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
      label: 'Add blank band',
      reason: insertUnavailableReason(doc, c.cols, c.rows),
      run: () => addBandCommand(doc, spec),
    },
  };
}
