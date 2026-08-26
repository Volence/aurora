// THE TWO BAND VERBS, ONCE.
//
// `BgAnimBandPanel` carries `Promote` and `Add band`; parcel B puts the same
// two on the Effects facet's tool-options bar as `Promote from tile N` and
// `Add blank band`, so the collapsed panel section is no longer the only door
// (triage 2026-08-26 §A.2/§A.3). Two surfaces, ONE derivation: the label, the
// disabled reason and the command each chip runs come from `bandVerbs`, and
// these rows pin that the reasons ARE the panel's predicates
// (`promoteUnavailableReason` / `insertUnavailableReason`) rather than a
// second table that could drift.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBgOverride, type BgOverrideDocument } from '../../../core/formats/bg-override/bg-override';
import {
  DEFAULT_PHASE_FILL, addBandCommand, bandBudget, insertUnavailableReason,
  promoteBandCommand, promoteUnavailableReason,
} from '../bg-anim-aeon';
import { bandSpecOf, bandVerbs } from '../band-verbs';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const doc = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

describe('bandSpecOf', () => {
  it('omits driver and rate_shift when the candidate leaves them out, and fills phaseFill with the default', () => {
    expect(bandSpecOf({ staticBase: 0, cols: 2, rows: 4 }))
      .toEqual({ cols: 2, rows: 4, phaseFill: DEFAULT_PHASE_FILL });
  });
  it('carries every field the author spelled', () => {
    expect(bandSpecOf({ staticBase: 0, cols: 1, rows: 1, phaseFill: 'shift', driver: 'camera_x', rateShift: 3 }))
      .toEqual({ cols: 1, rows: 1, phaseFill: 'shift', driver: 'camera_x', rateShift: 3 });
  });
});

describe('bandVerbs — no document', () => {
  const v = bandVerbs(null, { staticBase: 0, cols: 1, rows: 1 });
  it('disables both with the panel\'s own reasons', () => {
    expect(v.promote.reason).toBe(promoteUnavailableReason(null));
    expect(v.add.reason).toBe(insertUnavailableReason(null, 1, 1));
    expect(v.promote.reason).not.toBeNull();
    expect(v.add.reason).not.toBeNull();
  });
  it('and running them refuses rather than throws', () => {
    expect(v.promote.run().ok).toBe(false);
    expect(v.add.run().ok).toBe(false);
  });
});

describe('bandVerbs — the fixture document', () => {
  const d = doc();
  const base = bandBudget(d).firstPromotableSlot;
  const candidate = { staticBase: base, cols: 1, rows: 1 } as const;
  const v = bandVerbs(d, candidate);

  it('labels name the tile and the blankness', () => {
    expect(v.promote.label).toBe(`Promote from tile ${base}`);
    expect(v.add.label).toBe('Add blank band');
  });
  it('the label follows the candidate\'s base — it is derived, not fixed', () => {
    expect(bandVerbs(d, { ...candidate, staticBase: base + 5 }).promote.label)
      .toBe(`Promote from tile ${base + 5}`);
  });
  it('reasons are the panel\'s predicates, verbatim', () => {
    expect(v.promote.reason).toBe(promoteUnavailableReason(d));
    expect(v.add.reason).toBe(insertUnavailableReason(d, 1, 1));
  });
  it('both are enabled here (anti-vacuous)', () => {
    expect(v.promote.reason).toBeNull();
    expect(v.add.reason).toBeNull();
  });
  it('runs the SAME two commands the panel runs', () => {
    expect(v.promote.run()).toEqual(promoteBandCommand(d, base, bandSpecOf(candidate)));
    expect(v.add.run()).toEqual(addBandCommand(d, bandSpecOf(candidate)));
    expect(v.promote.run().ok).toBe(true);
    expect(v.add.run().ok).toBe(true);
  });
  it('a band the blob cannot hold disables Add with the insert predicate\'s reason', () => {
    const huge = { staticBase: base, cols: 10_000, rows: 1 };
    const w = bandVerbs(d, huge);
    expect(w.add.reason).toBe(insertUnavailableReason(d, 10_000, 1));
    expect(w.add.reason).not.toBeNull();
    // Promote is a different predicate and does not read cols — still open.
    expect(w.promote.reason).toBe(promoteUnavailableReason(d));
  });
});
