// Cursor-anchored zoom: does the art pixel under the cursor stay under the cursor?
//
// THE ORACLE IS A MEASUREMENT, not a re-derivation. Before the fix, the app was
// driven over CDP (scratchpad/probe-zoom.mjs: open s1disasm -> GHZ act 1 -> Art
// facet -> Tile tier, read the doc coordinate under a fixed screen point off the
// CANVAS's rect, dispatch one wheel notch, read it again). Three starting zooms
// gave three residual drifts, and the geometry beside each of them:
//
//   zoom      canvas vs the 240px box        K -> K'    measured drift (art px)
//   24 -> 48  centred -> overflowing         24 -> 6    0.875
//   16 -> 32  centred -> overflowing         56 -> 6    2.406      (scroll clamped)
//   32 -> 64  overflowing -> overflowing      6 -> 6    0.094
//
// K is the canvas's origin in CONTENT px: `TILE_HOLDER`'s 6px padding, plus half
// the slack while `margin: auto` still has slack to split (at zoom 16 an 8x8 tile
// is 128px in a 240px box: 6 + (240-140)/2 = 56). The pre-fix hook anchored on
// `(scrollLeft + sx) / zoom`, i.e. assumed K = 0.
//
// Every row below is checked TWICE: the pre-fix formula must reproduce the drift
// that was measured in the app (otherwise this file is not modelling the bug it
// claims to), and the shipped formula must remove it. `legacyAnchoredScroll` is
// the deleted expression, kept verbatim as the negative oracle.
//
// WHAT COULD NOT BE MADE ZERO, and it is not a rounding excuse: row 2's ask is a
// NEGATIVE scroll (see `minimum reachable` below). Rows 1 and 3 go to exactly 0.
//
// RE-MEASURED IN THE APP after the fix, same probe, same three starts:
//   24 -> 48   drift 0      (scrollLeft settled at 30 — the number `row 1` asserts)
//   32 -> 64   drift 0      (scrollLeft 66)
//   16 -> 32   drift 1.063  (scrollLeft clamped to 0, i.e. exactly the residual
//                            `minimum reachable` computes below — 2.406 before)
// The 24 row needed a probe variant (scratchpad/probe-zoom-default.mjs): the
// original harness reaches a zoom by halving to 2 and doubling back, so it can
// never sit on 24 and was quietly re-measuring 32 instead.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anchorAt, anchoredScroll, canvasOriginOf, clampScroll, docUnderPointer, AnchorSlot } from '../zoom-anchor';

/** The pre-fix hook, verbatim: anchor `(scrollLeft + sx) / z`, restore `cx * zoom - sx`. */
const legacyAnchor = (pointer: number, scroll: number, zoom: number) => (scroll + pointer) / zoom;
const legacyAnchoredScroll = (cx: number, pointer: number, zoom: number) => cx * zoom - pointer;

interface Row {
  what: string;
  /** cursor offset inside the scroller's client box, CSS px (the probe used 30% of 240 = 72) */
  pointer: number;
  before: { origin: number; scroll: number; zoom: number };
  /** measured AFTER the canvas resized: the new K', the new zoom, and the new scroll ceiling */
  after: { origin: number; zoom: number; maxScroll: number };
  /** what the app actually drifted, pre-fix */
  measuredDrift: number;
}

/** Run one row through both formulas. Everything the hook does, in five lines. */
function play(row: Row) {
  const { pointer, before, after } = row;
  const canvasEdge = before.origin - before.scroll;    // what getBoundingClientRect would report
  const truth = anchorAt(pointer, canvasEdge, before.zoom);

  const fixedScroll = clampScroll(anchoredScroll(truth, pointer, after.origin, after.zoom), after.maxScroll);
  const fixedDrift = docUnderPointer(pointer, fixedScroll, after.origin, after.zoom) - truth;

  const cx = legacyAnchor(pointer, before.scroll, before.zoom);
  const legacyScroll = clampScroll(legacyAnchoredScroll(cx, pointer, after.zoom), after.maxScroll);
  const legacyDrift = docUnderPointer(pointer, legacyScroll, after.origin, after.zoom) - truth;

  return { truth, fixedScroll, fixedDrift, legacyScroll, legacyDrift };
}

// ---- the three measured rows, as geometry -----------------------------------
//
// `maxScroll` is not invented either: at zoom 32 the content is 8*32 + 2*6 = 268
// and the measured clamp landed at 43, which pins the scroller's CLIENT width at
// 225 — the 240px box less a 15px scrollbar, which appears exactly when the
// content overflows. The same 225 gives the zoom-48 and zoom-64 ceilings below
// (neither of which binds).
const R1: Row = {
  what: '24 -> 48, centred canvas becomes an overflowing one',
  pointer: 72,
  before: { origin: 24, scroll: 0, zoom: 24 },     // 8*24 = 192 + 12 padding = 204 < 240, so centred
  after: { origin: 6, zoom: 48, maxScroll: 171 },  // 8*48 + 12 = 396, less 225
  measuredDrift: 0.875,
};
const R2: Row = {
  what: '16 -> 32, the clamped one',
  pointer: 72,
  before: { origin: 56, scroll: 0, zoom: 16 },     // 128 + 12 = 140 in 240: 50px of slack each side
  after: { origin: 6, zoom: 32, maxScroll: 43 },   // 268 less 225
  measuredDrift: 2.40625,
};
const R3: Row = {
  what: '32 -> 64, overflowing throughout',
  pointer: 72,
  before: { origin: 6, scroll: 20, zoom: 32 },     // already scrolled; the probe did not record how far
  after: { origin: 6, zoom: 64, maxScroll: 299 },  // 8*64 + 12 = 524, less 225
  measuredDrift: 0.09375,
};

describe('anchored zoom: the measured rows', () => {
  it('reproduces the drift the app was measured to have, from the old formula', () => {
    // If this ever goes green-by-accident the whole file is worthless: it is the
    // half that proves the oracle can SEE the bug.
    for (const row of [R1, R2, R3]) {
      expect(play(row).legacyDrift, row.what).toBeCloseTo(row.measuredDrift, 6);
    }
  });

  it('removes it entirely wherever the scroll can reach', () => {
    for (const row of [R1, R3]) {
      expect(play(row).fixedDrift, row.what).toBeCloseTo(0, 12);
    }
  });

  it('does not need the scroll to be freely settable in row 1', () => {
    // 0 drift AND inside the range — a fix that only looked right because the
    // clamp happened to save it would fail here.
    const { fixedScroll } = play(R1);
    expect(fixedScroll).toBeGreaterThan(0);
    expect(fixedScroll).toBeLessThan(R1.after.maxScroll);
    expect(fixedScroll).toBe(30);
  });

  it('is scroll-invariant in row 3 (the probe never recorded the starting scroll)', () => {
    // The old drift there is K/z - K'/z' whatever the scroll was, so picking 20
    // above is not a fitted parameter.
    for (let s = 0; s <= 43; s++) {
      const row: Row = { ...R3, before: { ...R3.before, scroll: s } };
      expect(play(row).legacyDrift, `scroll ${s}`).toBeCloseTo(0.09375, 12);
      expect(play(row).fixedDrift, `scroll ${s}`).toBeCloseTo(0, 12);
    }
  });
});

describe('anchored zoom: the clamped case (row 2)', () => {
  it('asks for a negative scroll, which is why zero is unreachable', () => {
    const truth = anchorAt(R2.pointer, R2.before.origin - R2.before.scroll, R2.before.zoom);
    expect(truth).toBe(1);      // the cursor sits on art pixel 1.0 of the centred tile
    // To hold art pixel 1 at x=72 the 256px canvas would have to START at x=40,
    // i.e. show 40px of nothing before content that already overflows on the right.
    // No scroll container can express that; the ask comes out negative.
    expect(anchoredScroll(truth, R2.pointer, R2.after.origin, R2.after.zoom)).toBe(-34);
    expect(clampScroll(-34, R2.after.maxScroll)).toBe(0);
  });

  it('lands on the minimum reachable residual, and less than half the old one', () => {
    const { truth, fixedScroll, fixedDrift, legacyDrift } = play(R2);
    expect(fixedScroll).toBe(0);
    expect(fixedDrift).toBeCloseTo(1.0625, 12);
    expect(legacyDrift).toBeCloseTo(2.40625, 12);
    // MINIMALITY, proven rather than asserted: sweep every scroll the container
    // can actually hold and check none of them gets the pixel closer.
    for (let s = 0; s <= R2.after.maxScroll * 4; s++) {
      const scroll = s / 4;
      const drift = Math.abs(docUnderPointer(R2.pointer, scroll, R2.after.origin, R2.after.zoom) - truth);
      expect(drift, `scroll ${scroll}`).toBeGreaterThanOrEqual(Math.abs(fixedDrift) - 1e-12);
    }
  });

  it('is exact again as soon as the canvas is big enough to scroll', () => {
    // The same cursor, one notch further in: 32 -> 64 out of the clamped state
    // row 2 left behind (scroll 0, K = 6). Nothing lingers.
    const next = play({
      what: '32 -> 64 after the clamp',
      pointer: 72,
      before: { origin: 6, scroll: 0, zoom: 32 },
      after: { origin: 6, zoom: 64, maxScroll: 299 },
      measuredDrift: 0,
    });
    expect(next.fixedDrift).toBeCloseTo(0, 12);
  });
});

describe('anchored zoom: canvas edges', () => {
  // The probe deliberately sampled 30% into the box because the box CENTRE is a
  // fixed point of auto-centring and hides the bug. The edges are the other
  // interesting points: they are where a mis-anchored zoom throws the pixel off
  // the canvas entirely.
  const AFTER = { origin: 6, zoom: 64, maxScroll: 299 };

  it('holds the LEFT edge of the canvas', () => {
    // zoom 32, unscrolled: the canvas starts 6px into the box, so x=6 is art x=0.
    const row: Row = {
      what: 'left edge', pointer: 6,
      before: { origin: 6, scroll: 0, zoom: 32 }, after: AFTER, measuredDrift: 0,
    };
    const { truth, fixedScroll, fixedDrift, legacyDrift } = play(row);
    expect(truth).toBe(0);
    expect(fixedScroll).toBe(0);          // pinned to the left, as it should be
    expect(fixedDrift).toBeCloseTo(0, 12);
    expect(legacyDrift).toBeCloseTo(0.09375, 12);   // the old formula drifts even here
  });

  it('holds the RIGHT edge of the canvas', () => {
    // zoom 32 scrolled to its own ceiling (43): the canvas's right edge is at
    // x=219 and that is art x=8, the far corner of the tile.
    const row: Row = {
      what: 'right edge', pointer: 219,
      before: { origin: 6, scroll: 43, zoom: 32 }, after: AFTER, measuredDrift: 0,
    };
    const { truth, fixedScroll, fixedDrift } = play(row);
    expect(truth).toBe(8);
    expect(fixedDrift).toBeCloseTo(0, 12);
    // Anchoring at the right edge must end pinned to the right edge — exactly at
    // the new ceiling, not clamped down to it from some larger ask.
    expect(anchoredScroll(truth, row.pointer, AFTER.origin, AFTER.zoom)).toBe(AFTER.maxScroll);
    expect(fixedScroll).toBe(AFTER.maxScroll);
  });

  it('survives a zoom OUT back to a centred canvas', () => {
    // 48 -> 24 from where row 1's fix leaves the view (scroll 30, K = 6). The
    // canvas becomes 192px in a 240px box: it re-centres, maxScroll is 0, and the
    // answer is still exact because K' = 24 puts the pixel back by itself.
    const row: Row = {
      what: 'zoom out, re-centring', pointer: 72,
      before: { origin: 6, scroll: 30, zoom: 48 },
      after: { origin: 24, zoom: 24, maxScroll: 0 },
      measuredDrift: 0,
    };
    const { truth, fixedScroll, fixedDrift, legacyDrift } = play(row);
    expect(truth).toBe(2);                 // the same art pixel row 1 anchored — a round trip
    expect(fixedScroll).toBe(0);
    expect(fixedDrift).toBeCloseTo(0, 12);
    // AND THE OLD FORMULA IS RIGHT HERE TOO, for a reason worth writing down: it
    // asks for scroll -21, the clamp takes that to 0, and 0 is also the correct
    // answer because a re-centred canvas has nowhere else to be. That is why the
    // bug read as "zooming IN drifts" — every zoom out into a centred canvas hides
    // it. A test suite that only exercised zoom-out would have proved nothing.
    expect(legacyDrift).toBeCloseTo(0, 12);
  });
});

describe('anchored zoom: the other two hosts', () => {
  it('fixes aeon, whose padding is four times classic\'s', () => {
    // ComposerCanvas: `styles.holder` = { margin: auto, padding: 24 }. A 128px
    // chunk at zoom 4 is 512px in a 600px viewport, so it is centred too:
    // K = 24 + (600 - 560)/2 = 44, and the old drift is 44/4 - 24/8 = 8 ART PX —
    // two thirds of a tile, in a host nobody had measured.
    const row: Row = {
      what: 'aeon 4 -> 8', pointer: 180,
      before: { origin: 44, scroll: 0, zoom: 4 },
      after: { origin: 24, zoom: 8, maxScroll: 472 },
      measuredDrift: 8,
    };
    const { truth, fixedScroll, fixedDrift, legacyDrift } = play(row);
    expect(truth).toBe(34);
    expect(legacyDrift).toBeCloseTo(8, 12);
    expect(fixedDrift).toBeCloseTo(0, 12);
    expect(fixedScroll).toBe(116);
    expect(fixedScroll).toBeLessThan(row.after.maxScroll);   // reached, not clamped
  });

  it('fixes the sprite canvas, which pads but never centres', () => {
    // SpriteMode: `canvasPad` is an inline-block with padding 24, so K is a flat
    // 24 at every zoom — the one host where the error is a pure 24/z - 24/z'.
    const row: Row = {
      what: 'sprite 4 -> 8', pointer: 100,
      before: { origin: 24, scroll: 0, zoom: 4 },
      after: { origin: 24, zoom: 8, maxScroll: 160 },
      measuredDrift: 3,
    };
    const { truth, fixedDrift, legacyDrift } = play(row);
    expect(truth).toBe(19);
    expect(legacyDrift).toBeCloseTo(3, 12);
    expect(fixedDrift).toBeCloseTo(0, 12);
  });
});

describe('anchored zoom: the arithmetic itself', () => {
  it('reads the anchor off the canvas rect, scroll and all', () => {
    // `canvasEdge` already contains the scroll, which is the whole reason the
    // capture side needs no scroll term: these two must agree.
    for (const scroll of [0, 7, 43.5]) {
      const edge = 6 - scroll;
      expect(anchorAt(72, edge, 32)).toBeCloseTo(docUnderPointer(72, scroll, canvasOriginOf(edge, scroll), 32), 12);
    }
  });

  it('round-trips: the scroll it returns is the scroll that reproduces the anchor', () => {
    for (const anchor of [0, 0.5, 3.25, 7.9]) {
      for (const zoom of [1, 3, 24, 64]) {
        for (const origin of [0, 6, 24, 56]) {
          const s = anchoredScroll(anchor, 72, origin, zoom);
          expect(docUnderPointer(72, s, origin, zoom)).toBeCloseTo(anchor, 10);
        }
      }
    }
  });

  it('keeps fractions: rounding the anchor is what makes a zoom creep', () => {
    expect(anchorAt(75, 6, 32)).toBeCloseTo(2.15625, 12);
    expect(anchorAt(75, 6, 32) % 1).not.toBe(0);
  });

  it('clamps the way the DOM does', () => {
    expect(clampScroll(-34, 43)).toBe(0);
    expect(clampScroll(500, 43)).toBe(43);
    expect(clampScroll(20, 43)).toBe(20);
    expect(clampScroll(20, 0)).toBe(0);      // content smaller than the viewport: no scrolling at all
    expect(clampScroll(20, -5)).toBe(0);     // a negative ceiling is still no scrolling
    expect(clampScroll(Number.NaN, 43)).toBe(0);
  });

  it('does not divide by a zoom that is not there', () => {
    // A host that mounts before its document resolves would otherwise hand the
    // scroller Infinity or NaN, which the DOM turns into scroll 0 silently.
    expect(anchorAt(72, 6, 0)).toBe(0);
    expect(anchorAt(72, 6, Number.NaN)).toBe(0);
    expect(docUnderPointer(72, 0, 6, 0)).toBe(0);
  });
});

// ---- wiring ----------------------------------------------------------------
//
// The suite is node-only: it cannot mount a component, cannot dispatch a wheel
// event and has no layout, so NONE of the above proves the hook is fed real
// numbers. What can be pinned is the specific way this fails, which is silently:
// `useAnchoredZoom` needs a CANVAS ref, and a host that does not pass one gets a
// zoom that does not anchor at all rather than an error. Three hosts, three
// chances to forget.

const readSrc = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const HOOK = readSrc('art-shared', 'use-anchored-zoom.ts');
const HOSTS: [string, string][] = [
  ['classic TileTab', readSrc('classic', 'TileTab.tsx')],
  ['aeon ComposerCanvas', readSrc('art', 'ComposerCanvas.tsx')],
  ['SpriteMode', readSrc('sprite', 'SpriteMode.tsx')],
];

// A STALE ANCHOR IS A JUMP. The anchor is captured on the wheel event and spent
// by the layout effect that follows the re-render — but two paths used to skip
// the line that cleared it: a wheel notch the store's clamp refused (no zoom
// change, so no re-render and no layout effect at all), and the layout effect's
// own canvas/scroller guard, which sat ABOVE that line. Either one leaves an
// anchor from an old cursor position to be spent by the next zoom change from any
// source — the option bar's ZoomControl, which classic now exposes. The slot's
// consume-on-read is what makes the second unwritable; the wheel handler still
// owns the first.
describe('AnchorSlot', () => {
  const a = { cx: 3.5, cy: 1.25, sx: 120, sy: 60 };

  it('starts empty', () => {
    const s = new AnchorSlot();
    expect(s.pending).toBe(false);
    expect(s.take()).toBeNull();
  });

  it('hands back exactly what was captured', () => {
    const s = new AnchorSlot();
    s.capture(a);
    expect(s.pending).toBe(true);
    expect(s.take()).toEqual(a);
  });

  it('EMPTIES on take: an anchor is spendable exactly once', () => {
    // The layout-effect bug in one line: `take()` clears before the caller has a
    // chance to return early on a guard, so a second consumer gets nothing.
    const s = new AnchorSlot();
    s.capture(a);
    expect(s.take()).toEqual(a);
    expect(s.pending).toBe(false);
    expect(s.take(), 'the anchor survived being spent').toBeNull();
  });

  it('can be dropped unspent', () => {
    // The wheel handler's path when the zoom did not move, or when there is no
    // canvas to anchor against.
    const s = new AnchorSlot();
    s.capture(a);
    s.clear();
    expect(s.pending).toBe(false);
    expect(s.take()).toBeNull();
  });

  it('keeps only the most recent capture', () => {
    const s = new AnchorSlot();
    s.capture(a);
    s.capture({ ...a, cx: 9 });
    expect(s.take()!.cx).toBe(9);
  });
});

describe('anchored zoom: wiring', () => {
  it('spends the anchor through the slot rather than a bare ref', () => {
    // Comment-stripped source: the docblock above discusses every one of these
    // names at length, so a raw read would pass on prose alone.
    expect(HOOK, 'the hook is back to a hand-rolled anchor ref').toMatch(/new AnchorSlot\(\)/);
    expect(HOOK, 'the anchor is read without being consumed').toMatch(/\.take\(\)/);
    expect(HOOK, 'nothing clears the slot when a zoom is refused').toMatch(/\.clear\(\)/);
    // And the specific shape of the refused-zoom check: read the store's own value
    // across setZoom rather than guessing the clamp bounds, which differ per host.
    expect(HOOK, 'a refused zoom no longer drops its anchor')
      .toMatch(/const\s+before\s*=\s*getZoom\(\)[\s\S]*setZoom\([\s\S]*getZoom\(\)\s*===\s*before[\s\S]*\.clear\(\)/);
  });

  it('consumes the anchor BEFORE the guards that can return early', () => {
    // The order is the assertion. `take()` below `if (!a || !scroller || !canvas)`
    // would compile and behave identically in the happy path.
    const effect = /useLayoutEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}, \[/.exec(HOOK);
    expect(effect, 'the post-zoom layout effect is gone: check what replaced it').not.toBeNull();
    const body = effect![1];
    expect(body.indexOf('.take()'), 'the layout effect never consumes the slot').toBeGreaterThanOrEqual(0);
    expect(body.indexOf('return'), 'the early-out guard is gone: re-read this test').toBeGreaterThanOrEqual(0);
    expect(body.indexOf('.take()'), 'a guard can return before the anchor is consumed')
      .toBeLessThan(body.indexOf('return'));
  });

  it('measures the canvas, not the scroller\'s content origin', () => {
    expect(HOOK).toMatch(/canvas\.getBoundingClientRect\(\)/);
    expect(HOOK, 'the hook re-derives the anchor instead of using the tested module')
      .toMatch(/from '\.\/zoom-anchor'/);
    expect(HOOK, 'the K = 0 assumption is back').not.toMatch(/scrollLeft\s*\+\s*sx/);
    expect(HOOK, 'the K = 0 assumption is back').not.toMatch(/scrollTop\s*\+\s*sy/);
  });

  it('is handed a canvas by every host that uses it', () => {
    for (const [name, src] of HOSTS) {
      expect(src, `${name} does not pass a canvas ref to the zoom hook`)
        .toMatch(/useAnchoredZoom\([^)]*canvasRef\s*,/);
      expect(src, `${name} never fills canvasRef in: the hook would silently stop anchoring`)
        .toMatch(/canvasRef=\{canvasRef\}/);
    }
  });

  it('keeps the pan hook on the scroller', () => {
    // useHandPan drives the same element and takes no canvas; threading the wrong
    // ref into it would break panning without touching a single test above.
    for (const [name, src] of HOSTS) {
      // `[,)]` — the pan hook grew an optional second argument (the keyboard gate,
      // see pixel-viewport-wiring.test.ts); this assertion is about the FIRST one.
      expect(src, `${name} moved the pan hook off the scroller`).toMatch(/useHandPan\((\w*)[,)]/);
      const [, arg] = /useHandPan\((\w*)[,)]/.exec(src)!;
      expect(arg, `${name} pans the canvas instead of the scroller`).not.toBe('canvasRef');
      expect(src).toMatch(new RegExp(`useAnchoredZoom\\(\\s*${arg}\\s*,`));
    }
  });
});
