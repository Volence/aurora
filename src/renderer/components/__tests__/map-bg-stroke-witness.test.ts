// HAS THE BACKGROUND PLANE MOVED UNDER THE STROKE PAINTING IT?
//
// The defect (lens sweep, BG-STROKE-WRONG-ACT). `set-bg-tiles` with a null
// `bgRef` resolves `level.act.bgLayout` at COMMIT time, and `level` is
// `getActiveLevel()` — the act open now. So a stroke on the act default that
// survives an act switch commits into the NEW act's plane, at the old act's
// indices, with the old act's `oldNt` on the undo half.
//
// THE CONTROL IS `background-switched`. The pair `(source, bgRef)` changing
// inside one act is the artist moving to a section that displays a different
// background: the entries so far belong to a plane this act still owns, and
// `paintBgTile` flushes them into a command. A rule that reverted there would
// delete an edit somebody made on purpose, so this predicate has to be able to
// fail in both directions and the row that catches the over-application is here
// beside the ones that catch the omission.
//
// Expectations are derived from the source, not from a fixture: the three
// sources are `DisplayedBgSource` (`bganim-preview-aeon.ts`), and the reason
// `('act', null)` is the invisible case is `resolveDisplayedBg`'s fallback,
// which answers that pair for EVERY act that has a `bgLayout` and a section
// asking for nothing.

import { describe, it, expect } from 'vitest';
import {
  bgStrokeStatus, bgStrokeMustRevert, bgStrokeStaleReason,
  type BgStrokeFrame, type BgStrokeStatus,
} from '../map-gesture-witness';

/** Act A's own default plane: the case the map opens on. */
function actDefault(actKey: string, layout: unknown): BgStrokeFrame {
  return { actKey, source: 'act', bgRef: null, layout, doc: null };
}

describe('bgStrokeStatus: the plane a BG stroke is painting', () => {
  it('is intact while nothing moved', () => {
    const plane = new Uint16Array(4);
    expect(bgStrokeStatus(actDefault('ojz/act1', plane), actDefault('ojz/act1', plane)))
      .toBe('intact');
  });

  it('is intact across the words the stroke itself lays down', () => {
    // The reason the witness is IDENTITY and not a value: a BG stroke writes
    // live, so a value witness would report "moved under me" on the first pixel.
    const plane = new Uint16Array([1, 2, 3, 4]);
    const was = actDefault('ojz/act1', plane);
    plane[0] = 0x1234;
    plane[3] = 0x0001;
    expect(bgStrokeStatus(was, actDefault('ojz/act1', plane))).toBe('intact');
  });

  it('SEES AN ACT SWITCH THE SOURCE PAIR CANNOT SEE', () => {
    // THE DEFECT. Both acts fall back to their own `bgLayout`, so both answer
    // `('act', null)` and the pair check agrees on both sides. Only the plane's
    // identity separates them.
    const actA = new Uint16Array(4), actB = new Uint16Array(4);
    const was = actDefault('ojz/act1', actA);
    const now = actDefault('ojz/act2', actB);
    expect(was.source).toBe(now.source);
    expect(was.bgRef).toBe(now.bgRef);
    expect(bgStrokeStatus(was, now)).toBe('act-changed');
    expect(bgStrokeMustRevert('act-changed')).toBe(true);
  });

  it('sees a ZONE switch too, because the key composes zone and act', () => {
    // `act1` exists in every zone (the rule `actKeyNow` states), so an act id by
    // itself cannot see this.
    const a = new Uint16Array(4), b = new Uint16Array(4);
    expect(bgStrokeStatus(actDefault('ojz/act1', a), actDefault('ghz/act1', b)))
      .toBe('act-changed');
  });

  it('reports an act switch AS an act switch even when the plane also moved', () => {
    // Order is informative: the act switch is the sentence the bug report needs,
    // and it is the verdict with the stricter outcome.
    const a = new Uint16Array(4), b = new Uint16Array(4);
    const was: BgStrokeFrame = { actKey: 'ojz/act1', source: 'act', bgRef: null, layout: a, doc: null };
    const now: BgStrokeFrame = { actKey: 'ojz/act2', source: 'library', bgRef: 'bg-7', layout: b, doc: null };
    expect(bgStrokeStatus(was, now)).toBe('act-changed');
  });

  it('sees a plane replaced under an unchanged pair', () => {
    // The other route to the same corruption with no act switch at all: an undo
    // or a reload that rebuilds `act.bgLayout` as a new array.
    const before = new Uint16Array(4), after = new Uint16Array(4);
    expect(bgStrokeStatus(actDefault('ojz/act1', before), actDefault('ojz/act1', after)))
      .toBe('plane-replaced');
    expect(bgStrokeMustRevert('plane-replaced')).toBe(true);
  });

  it('sees the override DOCUMENT replaced under an unchanged mirror', () => {
    // A band command replaces the document (the appliers are pure and return a
    // new one), which is a real way for the plane to move mid-stroke.
    const mirror = new Uint16Array(4);
    const docA = { layout: mirror }, docB = { layout: mirror };
    const was: BgStrokeFrame = { actKey: 'ojz/act1', source: 'override', bgRef: null, layout: mirror, doc: docA };
    const now: BgStrokeFrame = { actKey: 'ojz/act1', source: 'override', bgRef: null, layout: mirror, doc: docB };
    expect(bgStrokeStatus(was, now)).toBe('plane-replaced');
  });

  it('is plane-gone when nothing resolves at all', () => {
    expect(bgStrokeStatus(actDefault('ojz/act1', new Uint16Array(4)), null)).toBe('plane-gone');
    expect(bgStrokeMustRevert('plane-gone')).toBe(true);
    // And when a frame resolved but carries no plane — a level with no bgLayout.
    expect(bgStrokeStatus(actDefault('ojz/act1', new Uint16Array(4)), actDefault('ojz/act1', null)))
      .toBe('plane-gone');
  });

  describe('THE CONTROL: a pair that changed inside one act is not stale', () => {
    it('calls the act default → library entry switch a background-switch', () => {
      const plane = new Uint16Array(4), entry = new Uint16Array(4);
      const now: BgStrokeFrame = {
        actKey: 'ojz/act1', source: 'library', bgRef: 'bg-7', layout: entry, doc: null,
      };
      expect(bgStrokeStatus(actDefault('ojz/act1', plane), now)).toBe('background-switched');
    });

    it('calls one library entry → another a background-switch', () => {
      const one = new Uint16Array(4), two = new Uint16Array(4);
      const was: BgStrokeFrame = { actKey: 'ojz/act1', source: 'library', bgRef: 'bg-1', layout: one, doc: null };
      const now: BgStrokeFrame = { actKey: 'ojz/act1', source: 'library', bgRef: 'bg-2', layout: two, doc: null };
      expect(bgStrokeStatus(was, now)).toBe('background-switched');
    });

    it('does NOT revert a background-switch, and announces nothing', () => {
      // `paintBgTile` commits this one. Reverting it would delete an edit the
      // artist made on the act that still owns it, and a cancel notice would
      // tell them a lie about a stroke that landed.
      expect(bgStrokeMustRevert('background-switched')).toBe(false);
      expect(bgStrokeStaleReason('background-switched')).toBeNull();
    });
  });

  describe('an absent witness is never trusted', () => {
    // The cheapest way for this whole file to become decoration is for both
    // sides of a comparison to degrade to the same absent value at once: a
    // renamed field, or a caller that forgot one, and `undefined === undefined`
    // reports `intact` forever. `bgRef` and `doc` are legitimately null, so null
    // cannot be the sentinel here — undefined is.
    const plane = new Uint16Array(4);
    const full = actDefault('ojz/act1', plane);

    const holes: Array<[string, BgStrokeFrame]> = [
      ['no act key', { ...full, actKey: null }],
      ['act key undefined', { ...full, actKey: undefined as unknown as string }],
      ['source undefined', { ...full, source: undefined as unknown as string }],
      ['bgRef undefined', { ...full, bgRef: undefined as unknown as string }],
      ['layout null', { ...full, layout: null }],
      ['layout undefined', { ...full, layout: undefined }],
      ['doc undefined', { ...full, doc: undefined }],
    ];

    for (const [what, was] of holes) {
      it(`refuses a witness with ${what}, even against an identical frame`, () => {
        expect(bgStrokeStatus(was, was)).toBe('no-witness');
        expect(bgStrokeMustRevert('no-witness')).toBe(true);
      });
    }

    it('accepts the two nulls that are real values', () => {
      // `bgRef: null` is every source but `library`; `doc: null` is every source
      // but `override`. If either were treated as absent, the act default — the
      // case the whole defect is about — would witness nothing.
      expect(full.bgRef).toBeNull();
      expect(full.doc).toBeNull();
      expect(bgStrokeStatus(full, full)).toBe('intact');
    });
  });

  it('gives every status a revert verdict and a reason, with no default arm', () => {
    // Loud when unmeasurable: a status added without a case here would fall out
    // of the switch as `undefined`, which reads as "nothing to announce".
    const all: BgStrokeStatus[] = [
      'intact', 'no-witness', 'act-changed', 'plane-replaced', 'plane-gone',
      'background-switched',
    ];
    for (const s of all) {
      const reason = bgStrokeStaleReason(s);
      expect(typeof bgStrokeMustRevert(s), `${s} has no revert verdict`).toBe('boolean');
      // A status that must revert has to have something to say about it; the two
      // that do not must say nothing.
      if (bgStrokeMustRevert(s)) expect(reason, `${s} reverts but announces nothing`).toBeTruthy();
      else expect(reason, `${s} announces a cancellation that did not happen`).toBeNull();
    }
  });
});
