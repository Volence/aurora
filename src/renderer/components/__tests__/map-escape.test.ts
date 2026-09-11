// WHAT ESCAPE CLEARS ON THE MAP, AND IN WHICH ORDER.
//
// The owner lit the band lens with an ordinary click on the Plane-B rectangle
// and could not get out: nothing wrote `bandLensTarget = null` except the
// initial state (docs/reviews/2026-08-26-effects-feedback-triage.md §A.2).
// The DECISION is a pure function here and `MapViewport`'s Escape branch only
// acts on its verdict. The order is the contract: paste, then marquee, then the
// lens. The first two are the precedent and keep winning.
//
// THIS FILE PINS THE VERDICT, NOT THE ACT. That the branch DOES what the verdict
// says is driven behaviourally now, against the mounted component, in
// `map-viewport-mounted.test.ts` ("Escape acts on the verdict" and its control
// row). This header used to say that effect was out of the node suite's reach;
// map-coverage-2 reached it, so that sentence was retired in map-coverage-3.
// ONE ARM IS STILL NOT DRIVEN THERE: 'lens' is gated on `inEffectsFacet()`, a
// facet that fixture does not open. Its verdict is pinned below; that the
// branch acts on it is a foreground follow-up.

import { describe, it, expect } from 'vitest';
import { resolveEscape } from '../map-escape';

const LIT = { kind: 'candidate' as const };

describe('resolveEscape', () => {
  it('clears a lit band lens in the Effects facet', () => {
    expect(resolveEscape({ pasting: false, marquee: null, bandLensTarget: LIT }, true)).toBe('lens');
    expect(resolveEscape(
      { pasting: false, marquee: null, bandLensTarget: { kind: 'band', index: 0 } }, true,
    )).toBe('lens');
  });

  it('leaves the lens alone outside the Effects facet: that facet owns it', () => {
    expect(resolveEscape({ pasting: false, marquee: null, bandLensTarget: LIT }, false)).toBe(null);
  });

  it('does nothing when nothing is lit', () => {
    expect(resolveEscape({ pasting: false, marquee: null, bandLensTarget: null }, true)).toBe(null);
  });

  it('paste and marquee still win first, in that order', () => {
    const marquee = { x: 0, y: 0, w: 1, h: 1 } as never;
    expect(resolveEscape({ pasting: true, marquee, bandLensTarget: LIT }, true)).toBe('paste');
    expect(resolveEscape({ pasting: false, marquee, bandLensTarget: LIT }, true)).toBe('marquee');
    expect(resolveEscape({ pasting: true, marquee: null, bandLensTarget: null }, false)).toBe('paste');
  });
});
