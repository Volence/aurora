// WHAT ONE BAND CARD SAYS ABOUT THE PREVIEW — ROADMAP item 45.
//
// The effects column used to carry TWO cards per band: the band editor's, and
// the preview note's. Folding them left exactly two facts that only the preview
// knew — the RESOLVED RATE (what `rate_shift` means in the units this band's
// driver actually reads) and the VERDICT (previewing / licensed-but-undrawn /
// refused, and why) — and those two are now composed here rather than in the
// `.tsx`, for the reason bar 1 states: a sentence built inside a component is a
// sentence `vitest run` cannot see.
//
// THE REFUSAL PATH IS NOT DEAD AND THESE ROWS SAY SO. On the act aeon's injector
// binds, the preview no longer refuses (decision d-12, item 46) — but an act the
// override does NOT bind still shows a refusal, so the fold had to keep the text,
// not delete it. The `refused` rows below are that guarantee.

import { describe, it, expect } from 'vitest';
import {
  GAME_FRAMES_PER_SECOND, bandStatus,
  BAND_SCROLL_DIRECTION, BAND_SCROLL_DIRECTIONS, bandMotion, bandLensCaptionLines,
  BAND_MECHANISM_HINT,
} from '../bganim-preview-aeon';
import { BAND_DEFAULTS } from '../../../core/formats/bg-override/bg-override';

const previewing = (cells: number) => ({ cells, refusal: null });

describe('bandStatus: the resolved rate', () => {
  it('reads a timer band in FRAMES, and prints the px/s that follows from it', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, previewing(1244));
    // 2**2 = 4 frames per pixel; 60/4 = 15 px/s. Both derived, neither typed in.
    expect(s.rate).toContain(`${2 ** 2} frames`);
    expect(s.rate).toContain(`${GAME_FRAMES_PER_SECOND / 2 ** 2} px/s`);
  });

  it('reads a camera band in PIXELS OF CAMERA TRAVEL, and offers no px/s at all', () => {
    // A camera band's phase is a function of the pan, not of the clock. A px/s
    // figure would be a speed the engine never has. ("camera px" became "px of
    // camera travel" in parcel D — the owner could not tell what a camera px was.)
    const s = bandStatus({ driver: 'camera_x', rateShift: 3 }, previewing(10));
    expect(s.rate).toContain(`${2 ** 3} px of camera travel`);
    expect(s.rate).not.toContain('px/s');
  });

  it('says "frame", singular, at rate_shift 0', () => {
    expect(bandStatus({ driver: 'timer', rateShift: 0 }, previewing(1)).rate)
      .toContain('1 frame ');
    expect(bandStatus({ driver: 'timer', rateShift: 0 }, previewing(1)).rate)
      .not.toContain('1 frames');
  });

  it('does not print a rate of "0.00 px/s" for a band that is merely very slow', () => {
    // `(60 / units).toFixed(2)` folds to 0.00 the moment units passes 6000, and
    // a preview that tells an author their band moves at zero px/s when it moves
    // at one pixel every two minutes is lying about the one quantity this
    // readout exists for.
    const s = bandStatus({ driver: 'timer', rateShift: 20 }, previewing(4));
    expect(s.rate).not.toMatch(/[^.\d]0\.00 px\/s/);
    expect(s.rate).toMatch(/px\/s/);
  });

  it('resolves nothing itself: the caller has already applied the contract default', () => {
    // The card prints `rate_shift <n> (default)` from `describeBands`, which
    // resolves through BAND_DEFAULTS. This takes the RESOLVED number so the two
    // lines of one card cannot disagree about what an absent key means.
    const s = bandStatus({ driver: 'timer', rateShift: BAND_DEFAULTS.rate_shift }, previewing(1));
    expect(s.rate).toContain(`${2 ** (BAND_DEFAULTS.rate_shift as number)} frames`);
  });
});

describe('bandStatus: the verdict', () => {
  it('reports a drawn, licensed band with its cell count', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, previewing(1244));
    expect(s.kind).toBe('previewing');
    expect(s.verdict).toContain('1244');
    expect(s.verdict).toContain('background cells');
    // The motion harness keys its "no refusal" row on this string never
    // appearing on a previewing band.
    expect(s.verdict).not.toContain('Not previewing');
  });

  it('separates "licensed" from "drawn": zero cells is a real answer, not an error', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, { cells: 0, refusal: null });
    expect(s.kind).toBe('no-cells');
    expect(s.verdict).toMatch(/no background cell/i);
  });

  it('KEEPS THE REFUSAL AND NAMES ITS REASON', () => {
    const why = 'band 0 rest art does not match blob slots 0..32';
    const s = bandStatus({ driver: 'camera_x', rateShift: 1 }, { cells: 0, refusal: why });
    expect(s.kind).toBe('refused');
    expect(s.verdict).toContain(why);
    expect(s.verdict).toContain('Not previewing');
  });

  it('a refusal outranks a cell count: a band that cannot preview is not previewing', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, { cells: 99, refusal: 'nope' });
    expect(s.kind).toBe('refused');
    expect(s.verdict).not.toContain('99');
  });

  it('says NOTHING per band when there is no verdict at all, and says so in its kind', () => {
    // No document, or an active section that resolves to no background: the
    // strip carries one column-wide warning for that, and repeating it inside
    // every card would be the duplication this item exists to remove. The kind
    // still distinguishes it from "previewing", so a caller cannot mistake
    // silence for success.
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, undefined);
    expect(s.kind).toBe('unresolved');
    expect(s.verdict).toBeNull();
    // The rate is still knowable without a background, and is still printed.
    expect(s.rate).toContain('frames');
  });
});

// ---------------------------------------------------------------------------
// WHAT A BAND DOES — the mechanism sentence (parcel D, triage §A.6)
// ---------------------------------------------------------------------------
//
// The owner: the magenta cells "don't say what they do at all — draw left to
// right? rotate?". The caption said WHICH cells and the card said `driver timer
// · rate_shift 2`; nothing said the band SCROLLS. One sentence, one provider,
// printed verbatim on the canvas caption and on the card, so the two cannot
// drift apart. The direction word is FOREGROUND-gated behind one constant per
// axis that ships empty until the direction has been watched. Both arms are now
// non-empty and the two rows below record what each one rests on — they are NOT
// the same evidence, and the provider's block says which link is still open.

describe('bandMotion: the one sentence that says what a band does', () => {
  it.each([0, 2, 3])('derives "1px per 2^%i" from rate_shift, in the driver\'s units', (n) => {
    const units = 2 ** n;
    const timer = bandMotion({ driver: 'timer', rateShift: n }, 'band');
    expect(timer).toContain(`1px per ${units} frame${units === 1 ? '' : 's'}`);
    for (const driver of ['camera_x', 'camera_y']) {
      const cam = bandMotion({ driver, rateShift: n }, 'band');
      expect(cam).toContain(`1px per ${units} px of camera travel`);
      expect(cam).not.toContain('px/s');
    }
  });

  it('leads with the verb (a band SCROLLS) and a candidate says "would scroll"', () => {
    expect(bandMotion({ driver: 'timer', rateShift: 2 }, 'band')).toMatch(/^scrolls/);
    expect(bandMotion({ driver: 'timer', rateShift: 2 }, 'candidate')).toMatch(/^would scroll/);
  });

  it('says the art scrolls LEFT: measured on the built ROM 2026-08-26, not read off the fill', () => {
    // aeon master ROM (built 2026-08-26 19:06, 8x4 timer band), private oracle-aether,
    // scratchpad band-direction-probe: VRAM band image == phase 0 rolled by s, with
    // s = 50,52,53,54,55,57,58,59,60,62 across 5-frame samples — the content at each
    // screen pixel comes from progressively further RIGHT in phase 0, so the art
    // moves LEFT, ~1px per 4 frames (rate_shift 2). Column-major slot layout was the
    // only layout that matched at all (row-major: 0 of 10 samples).
    expect(BAND_SCROLL_DIRECTION).toBe('left');
    const s = bandMotion({ driver: 'timer', rateShift: 2 }, 'band');
    expect(s).toMatch(/^scrolls left · 1px per /);
  });

  it("says a vertical band scrolls UP: measured in VRAM by aeon, in the band's own row order", () => {
    // aeon tools/bganim_vprobe_witness.py, read at aeon f0aebbd3 (verified an
    // ancestor of their origin/master). A purpose-built 2x4 probe band's VRAM
    // bytes, sampled at 16 settled step plateaux covering all four coarse
    // rotate positions, decode ROW-MAJOR to phase 0 rolled toward DECREASING
    // row index by exactly the engine's committed step — a hard verdict gate,
    // and a matched horizontal control over the same art fails the same
    // predicate. DOWN is excluded because a downward roll of s is the same
    // image as an upward roll of 32-s only at s in {0, 16}, and the run's own
    // coarse-coverage gate forces samples in steps 8..15 and 24..31.
    //
    // STILL UNDERIVED, and it is why the two axes are not symmetric: the probe
    // sits in aeon's `band_reserve` run, which no plane cell references, so
    // "up" is the band's row order and not a viewer's screen. The horizontal
    // word was measured on the act's live, plane-cell-referenced band. See the
    // provider's block for the hop and who closes it.
    expect(BAND_SCROLL_DIRECTIONS.vertical).toBe('up');
    const s = bandMotion({ driver: 'timer', rateShift: 2, axis: 'vertical' }, 'band');
    expect(s).toMatch(/^scrolls up · 1px per /);
  });

  it('an axis with no measured word drops it, which is what keeps the fix one constant', () => {
    // The provider promises "a foreground run that contradicts either edits a
    // word and not a paragraph". That holds only while the direction word is
    // the SOLE thing an axis arm contributes to the sentence, so pin exactly
    // that: an axis absent from the table composes the identical sentence with
    // the word and its one space removed, and nothing else moves.
    const vertical = bandMotion({ driver: 'timer', rateShift: 2, axis: 'vertical' }, 'band');
    const unmeasured = bandMotion({ driver: 'timer', rateShift: 2, axis: 'no-such-axis' }, 'band');
    expect(BAND_SCROLL_DIRECTIONS['no-such-axis']).toBeUndefined();
    expect(vertical).toBe(unmeasured.replace('scrolls', 'scrolls up'));
  });

  it("IS the card's rate line: bandStatus prints it verbatim", () => {
    for (const band of [
      { driver: 'timer', rateShift: 0 }, { driver: 'timer', rateShift: 2 },
      { driver: 'camera_x', rateShift: 3 }, { driver: 'camera_y', rateShift: 5 },
    ]) {
      expect(bandStatus(band, previewing(1)).rate).toBe(bandMotion(band, 'band'));
    }
  });
});

describe('bandLensCaptionLines: the caption prints the same sentence as the card', () => {
  const range = { base: 0, count: 32 };
  // A real-shaped empty coverage: `coverageSummary` reads `range` off it.
  const coverage = { range, cells: [], largest: null, undrawnSlots: 0, perSlot: [] } as never;

  it('line 2 of a band caption is bandStatus(...).rate, character for character', () => {
    const band = { driver: 'timer', rateShift: 2 };
    const lines = bandLensCaptionLines({
      kind: 'band', bandIndex: 0, range, motion: bandMotion(band, 'band'),
      coverage, reason: null,
    });
    expect(lines[0]).toMatch(/^highlighted/);
    expect(lines[1]).toBe(bandStatus(band, previewing(1)).rate);
  });

  it('a candidate caption says "would scroll", and a refusal still follows the motion', () => {
    const band = { driver: 'camera_x', rateShift: 3 };
    const lines = bandLensCaptionLines({
      kind: 'candidate', bandIndex: null, range, motion: bandMotion(band, 'candidate'),
      coverage: null, reason: 'the active section resolves to no background',
    });
    expect(lines[1]).toMatch(/^would scroll left · 1px per 8 px of camera travel/);
    expect(lines[2]).toContain('no background');
  });

  it('prints no motion line when none is resolved, rather than an empty line', () => {
    const lines = bandLensCaptionLines({
      kind: 'band', bandIndex: 1, range, motion: null, coverage, reason: null,
    });
    expect(lines.every((l) => l !== '')).toBe(true);
  });
});

describe('BAND_MECHANISM_HINT: what a band IS, said once at the top of the section', () => {
  it('names the pattern, the eight frames over the same tiles, and the shared motion', () => {
    expect(BAND_MECHANISM_HINT).toMatch(/cols\s*[x×]\s*rows/);
    expect(BAND_MECHANISM_HINT).toMatch(/\b8\b|eight/);
    expect(BAND_MECHANISM_HINT).toMatch(/same tiles/);
    expect(BAND_MECHANISM_HINT).toMatch(/every cell/i);
  });
});
