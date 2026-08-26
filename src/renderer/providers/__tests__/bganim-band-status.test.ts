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
import { GAME_FRAMES_PER_SECOND, bandStatus } from '../bganim-preview-aeon';
import { BAND_DEFAULTS } from '../../../core/formats/bg-override/bg-override';

const previewing = (cells: number) => ({ cells, refusal: null });

describe('bandStatus — the resolved rate', () => {
  it('reads a timer band in FRAMES, and prints the px/s that follows from it', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, previewing(1244));
    // 2**2 = 4 frames per pixel; 60/4 = 15 px/s. Both derived, neither typed in.
    expect(s.rate).toContain(`${2 ** 2} frames`);
    expect(s.rate).toContain(`${GAME_FRAMES_PER_SECOND / 2 ** 2} px/s`);
  });

  it('reads a camera band in CAMERA PIXELS, and offers no px/s at all', () => {
    // A camera band's phase is a function of the pan, not of the clock. A px/s
    // figure would be a speed the engine never has.
    const s = bandStatus({ driver: 'camera_x', rateShift: 3 }, previewing(10));
    expect(s.rate).toContain(`${2 ** 3} camera px`);
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

  it('resolves nothing itself — the caller has already applied the contract default', () => {
    // The card prints `rate_shift <n> (default)` from `describeBands`, which
    // resolves through BAND_DEFAULTS. This takes the RESOLVED number so the two
    // lines of one card cannot disagree about what an absent key means.
    const s = bandStatus({ driver: 'timer', rateShift: BAND_DEFAULTS.rate_shift }, previewing(1));
    expect(s.rate).toContain(`${2 ** (BAND_DEFAULTS.rate_shift as number)} frames`);
  });
});

describe('bandStatus — the verdict', () => {
  it('reports a drawn, licensed band with its cell count', () => {
    const s = bandStatus({ driver: 'timer', rateShift: 2 }, previewing(1244));
    expect(s.kind).toBe('previewing');
    expect(s.verdict).toContain('1244');
    expect(s.verdict).toContain('background cells');
    // The motion harness keys its "no refusal" row on this string never
    // appearing on a previewing band.
    expect(s.verdict).not.toContain('Not previewing');
  });

  it('separates "licensed" from "drawn" — zero cells is a real answer, not an error', () => {
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

  it('a refusal outranks a cell count — a band that cannot preview is not previewing', () => {
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
