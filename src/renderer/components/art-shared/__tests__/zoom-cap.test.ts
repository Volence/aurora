// The one part of pan/zoom that is pure, and therefore the one part this suite
// can actually execute. Everything else in H1.6 — the wheel anchor, the pan
// drag, the scroller box — lives in .tsx or in a DOM event listener, and the
// renderer suite has neither a DOM nor .tsx collection; those are pinned by
// source scan (workspace/__tests__/classic-art-dock.test.ts) and must be checked
// by hand in the app.
//
// What is worth executing here is the CEILING, because its failure mode is
// silent and total: a canvas past the platform's maximum edge renders BLANK with
// no error, and the same value has to feed the hit-test, so a wrong cap is a
// white canvas or clicks landing on the wrong pixel — never an exception.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cappedZoom, MAX_CANVAS_PX } from '../zoom-cap';

/** The expression this function was extracted from (ComposerCanvas's inline
 *  `effectiveZoom` memo, pre-H1.6), kept here as the parity oracle. */
const legacy = (zoom: number, contentPx: number) =>
  Math.max(1, Math.min(zoom, Math.floor(16000 / contentPx)));

describe('cappedZoom', () => {
  it('returns the requested zoom when the canvas fits', () => {
    expect(cappedZoom(24, 8)).toBe(24);      // classic's 8x8 tile at the default zoom
    expect(cappedZoom(64, 8)).toBe(64);      // and at artStore's own ceiling — 512px
    expect(cappedZoom(24, 128)).toBe(24);    // aeon's 128px chunk
  });

  it('caps to the largest zoom that still fits', () => {
    expect(cappedZoom(64, 500)).toBe(32);            // 500 * 32 = 16000 exactly
    expect(cappedZoom(64, 501)).toBe(31);            // floors — 32 would overflow
    expect(cappedZoom(64, 1000, 4000)).toBe(4);      // an explicit smaller ceiling
  });

  it('never returns a zoom whose canvas exceeds the ceiling (unless 1 already does)', () => {
    for (const zoom of [1, 2, 3, 8, 24, 64, 512]) {
      for (const contentPx of [1, 8, 64, 128, 384, 999, 4096, 15999, 16000, 16001, 100000]) {
        const z = cappedZoom(zoom, contentPx);
        expect(z).toBeGreaterThanOrEqual(1);
        expect(z, `zoom ${zoom} / content ${contentPx}`).toBeLessThanOrEqual(Math.max(1, zoom));
        if (z > 1) expect(z * contentPx, `zoom ${zoom} / content ${contentPx}`).toBeLessThanOrEqual(MAX_CANVAS_PX);
      }
    }
  });

  it('floors to 1 rather than 0 when even 1x overflows', () => {
    // `Math.floor(16000 / 20000)` is 0, and a zero-width canvas is a blank one.
    expect(cappedZoom(4, 20000)).toBe(1);
    expect(cappedZoom(1, 1e9)).toBe(1);
  });

  it('survives a degenerate content size', () => {
    // A host that renders before its document resolves would otherwise divide by
    // zero and hand the viewport Infinity (or NaN) as a canvas dimension.
    expect(cappedZoom(24, 0)).toBe(24);
    expect(cappedZoom(24, Number.NaN)).toBe(24);
    expect(cappedZoom(0.5, 0)).toBe(1);
  });

  it('matches the inline expression it replaced in ComposerCanvas', () => {
    // The composer's cap is behaviour aeon has shipped with; the extraction must
    // not have moved it by a pixel. Covers the repeat-preview multiplier, which
    // the caller folds into `contentPx` (docPx * 3).
    for (const zoom of [2, 8, 24, 32, 64]) {
      for (const docPx of [8, 64, 128, 256, 1024, 5333, 8000]) {
        for (const repeat of [1, 3]) {
          expect(cappedZoom(zoom, docPx * repeat), `${zoom}/${docPx}x${repeat}`)
            .toBe(legacy(zoom, docPx * repeat));
        }
      }
    }
  });
});

// ---- call sites -------------------------------------------------------------
//
// `contentPx` is DOCUMENTED as the content's larger axis, and the module exists
// because getting it wrong renders a BLANK canvas with no error — there is no
// runtime signal to notice. Aeon's composer used to pass the width alone, so a
// doc taller than it is wide was capped against the wrong dimension: faithfully
// carried over from the inline expression, and still the exact failure the module
// describes. Neither host can be rendered here (.tsx), so the argument is pinned
// by scan; `chunk-pick.ts`'s `fitComposerZoom` already spells the same
// `Math.max(widthTiles, heightTiles)` for the same reason.

const readHost = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('cappedZoom — what the hosts pass it', () => {
  it('aeon\'s composer caps against the larger axis, not the width', () => {
    const src = readHost('art', 'ComposerCanvas.tsx');
    const call = /cappedZoom\(([^;]*?)\);/.exec(src);
    expect(call, 'ComposerCanvas no longer caps its zoom at all').not.toBeNull();
    expect(call![1], 'the composer caps on width alone — a tall doc is under-capped')
      .toMatch(/Math\.max\(\s*doc\.widthTiles\s*,\s*doc\.heightTiles\s*\)/);
  });

  it('classic\'s tile host caps against the larger axis too', () => {
    const src = readHost('classic', 'TileTab.tsx');
    const call = /cappedZoom\(([^;]*?)\);/.exec(src);
    expect(call, 'TileTab no longer caps its zoom at all').not.toBeNull();
    expect(call![1]).toMatch(/Math\.max\(\s*buffer\.width\s*,\s*buffer\.height\s*\)/);
  });
});
