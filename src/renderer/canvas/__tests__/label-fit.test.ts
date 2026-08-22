// ROADMAP §5.1 item 17 — the measure/elide arithmetic, on its own.
//
// WHERE THE EXPECTATIONS COME FROM. Nothing below is a number observed once and
// pinned. Each one is computed here from two independent inputs:
//
//   * the FONT METRIC, measured in the running app's own 2D context and recorded
//     with its raw readings in `src/test/mono-measure.ts` — advance = 0.5 em, and
//     an ellipsis that costs TWO cells because U+2026 falls back off the mono
//     face;
//   * the BOX GEOMETRY, imported from the draw sites themselves
//     (`OverlayRenderer`, `classic-overlays`) so a box that changes size drags
//     these expectations with it instead of leaving them stale.
//
// The arithmetic is written out at each assertion, so a failure says which of
// the two moved.
//
// WHAT THIS FILE CANNOT SEE: whether the call sites use any of it. That is
// `object-label-draw.test.ts` (the real draw functions against a recording
// context) and `scratchpad/object-label-harness.mjs` (the real app under CDP).

import { describe, it, expect } from 'vitest';
import { fitLabel, fitLabelInContext, labelBudget, LABEL_ELLIPSIS } from '../label-fit';
import {
  MONO_ADVANCE_EM, MONO_ELLIPSIS_CELLS, monoWidth, monoCells,
} from '../../../test/mono-measure';
import {
  OBJECT_BOX_SIZE, OBJECT_BOX_STROKE_WIDTH, OBJECT_LABEL_GAP, OBJECT_LABEL_FONT_PX,
} from '../OverlayRenderer';
import {
  GHOST_MARKER_BOUNDS, HEX_MARKER_SIZE, MARKER_STROKE_PX, MARKER_LABEL_GAP_PX,
} from '../../components/classic/classic-overlays';

/** A measurer at a fixed font size, in whatever units that size is expressed in. */
const at = (fontPx: number) => (s: string) => monoWidth(s, fontPx);

/** One monospace cell at `fontPx`. */
const cell = (fontPx: number) => fontPx * MONO_ADVANCE_EM;

describe('labelBudget', () => {
  it('subtracts the half-stroke each side, plus the gap each side', () => {
    // A canvas stroke straddles the path: a 1px border eats 0.5px of interior
    // on each side, and the gap is clear space on top of that.
    expect(labelBudget(16, 1, 0.5)).toBe(16 - 2 * (0.5 + 0.5));
    expect(labelBudget(24, 1, 0.5)).toBe(24 - 2 * (0.5 + 0.5));
    // Zoom-scaled stroke/gap (the classic markers' shape).
    expect(labelBudget(24, 1 * 4, 0.5 * 4)).toBe(24 - 2 * (2 + 2));
  });

  it('never returns a negative budget for a box smaller than its own border', () => {
    expect(labelBudget(2, 4, 1)).toBe(0);
  });
});

describe('fitLabel — the three outcomes and nothing else', () => {
  const measure = at(8);

  it('returns the whole string when it fits, unelided', () => {
    // "ring" = 4 cells x 4px = 16px, budget 20px.
    const fit = fitLabel('ring', 20, measure);
    expect(fit).toEqual({ text: 'ring', width: monoWidth('ring', 8), elided: false });
    expect(fit.width).toBeLessThanOrEqual(20);
  });

  it('elides to the longest prefix whose ellipsised form still fits', () => {
    // Budget 16px at 4px/cell = 4 cells, and "solid" is 5. The ellipsis is 2 of
    // the 4, so 2 characters survive: "so…" = 2 + 2 = 4 cells = 16px, and
    // "sol…" = 5 cells = 20px does not.
    const fit = fitLabel('solid', 16, measure);
    expect(fit.text).toBe(`so${LABEL_ELLIPSIS}`);
    expect(fit.elided).toBe(true);
    expect(fit.width).toBe(monoWidth(`so${LABEL_ELLIPSIS}`, 8));
    expect(monoCells(fit.text)).toBe(4);
    // At exactly its own width the whole string fits and is NOT elided — the
    // budget is inclusive, and an off-by-one here would cost a character on
    // every label in the app.
    expect(fitLabel('solid', monoWidth('solid', 8), measure))
      .toEqual({ text: 'solid', width: monoWidth('solid', 8), elided: false });
  });

  it('draws NOTHING when not even one character plus the ellipsis fits', () => {
    // 1 char + ellipsis = 3 cells = 12px; give it 11.
    expect(fitLabel('solid', 11, measure)).toEqual({ text: '', width: 0, elided: false });
    // ...and one more pixel is the difference between nothing and "s…".
    expect(fitLabel('solid', 12, measure).text).toBe(`s${LABEL_ELLIPSIS}`);
  });

  it('never returns a bare ellipsis', () => {
    // The boundary case above is the one that would produce it: at exactly the
    // ellipsis' own width there is room for the marker and no character.
    const ellipsisOnly = monoWidth(LABEL_ELLIPSIS, 8);
    expect(fitLabel('solid', ellipsisOnly, measure).text).toBe('');
  });

  it('suppresses rather than trusting an unmeasurable font', () => {
    // A detached / mid-teardown context answers NaN. Treating that as 0 would
    // draw the full string at full width — the defect, restored.
    expect(fitLabel('solid', 20, () => NaN)).toEqual({ text: '', width: 0, elided: false });
    expect(fitLabel('solid', 20, () => Infinity)).toEqual({ text: '', width: 0, elided: false });
  });

  it('suppresses on a non-positive budget instead of dividing into it', () => {
    for (const w of [0, -1, NaN]) {
      expect(fitLabel('solid', w, measure).text).toBe('');
    }
  });

  it('returns nothing for an empty label', () => {
    expect(fitLabel('', 100, measure).text).toBe('');
  });

  it('cuts on code points, so an astral character is never split in half', () => {
    // '🡒' is a surrogate pair; a UTF-16 slice at index 1 would emit a lone
    // high surrogate, which renders as a replacement box.
    const text = 'a🡒b🡒c';
    const fit = fitLabel(text, monoWidth('aa', 8) + monoWidth(LABEL_ELLIPSIS, 8), measure);
    expect(fit.text.endsWith(LABEL_ELLIPSIS)).toBe(true);
    // No unpaired surrogate anywhere in the result.
    const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(LONE.test(fit.text)).toBe(false);
    // Sanity that the regex can fail: a naive UTF-16 cut of the same string does
    // produce one, so this row is testing the code and not the regex.
    expect(LONE.test(text.slice(0, 2))).toBe(true);
    // Which is to say: whatever survived is whole characters plus the marker.
    expect([...fit.text].length).toBeLessThan([...text].length);
  });

  it('holds the invariant across a corpus: nothing it returns exceeds its budget', () => {
    const corpus = [
      'solid', 'ring', 'spring', 'a', 'Conveyor Belt Controller', 'Invisible Lava Marker',
      'Waterfall Sound Effect', 'Teleporter', 'Fireball Spawner', 'Invisible Block', '$54', 'FF',
      'x'.repeat(200),
    ];
    let sawFull = 0, sawElided = 0, sawNone = 0;
    for (const text of corpus) {
      for (const fontPx of [2, 4, 8, 16, 32, 64]) {
        for (const budget of [0.5, 4, 8, 12, 14, 16, 22, 40, 400]) {
          const fit = fitLabel(text, budget, at(fontPx));
          if (fit.text === '') { sawNone++; continue; }
          expect(monoWidth(fit.text, fontPx)).toBeLessThanOrEqual(budget);
          expect(fit.width).toBeCloseTo(monoWidth(fit.text, fontPx), 9);
          if (fit.elided) {
            sawElided++;
            expect(fit.text.endsWith(LABEL_ELLIPSIS)).toBe(true);
            // An elided label is a real prefix of the original, never a rewrite.
            expect(text.startsWith(fit.text.slice(0, -LABEL_ELLIPSIS.length))).toBe(true);
          } else {
            sawFull++;
            expect(fit.text).toBe(text);
          }
        }
      }
    }
    // ANTI-VACUOUS: a corpus that only ever produced one outcome would satisfy
    // the loop above while proving nothing about the other two.
    expect(sawFull).toBeGreaterThan(0);
    expect(sawElided).toBeGreaterThan(0);
    expect(sawNone).toBeGreaterThan(0);
  });

  it('finds the true maximum, not merely a fitting one', () => {
    // The binary search must not stop short: one more character must NOT fit.
    for (const text of ['Conveyor Belt Controller', 'solid', 'Invisible Lava Marker']) {
      for (const budget of [8, 12, 14, 20, 22, 40, 60]) {
        const fit = fitLabel(text, budget, at(8));
        if (!fit.elided || fit.text === '') continue;
        const kept = [...fit.text].length - [...LABEL_ELLIPSIS].length;
        const oneMore = [...text].slice(0, kept + 1).join('') + LABEL_ELLIPSIS;
        expect(monoWidth(oneMore, 8)).toBeGreaterThan(budget);
      }
    }
  });
});

describe('fitLabelInContext measures at the context\'s own font', () => {
  it('answers differently for the same string when the context font changes', () => {
    const ctx = { font: '8px monospace', measureText(s: string) { return { width: monoWidth(s, Number(/(\d+)px/.exec(this.font)![1])) }; } };
    expect(fitLabelInContext(ctx, 'solid', 16).text).toBe(`so${LABEL_ELLIPSIS}`);
    ctx.font = '4px monospace';
    expect(fitLabelInContext(ctx, 'solid', 16).text).toBe('solid');
  });
});

// ---------------------------------------------------------------------------
// The three real budgets, derived from the constants the draw sites use.
// ---------------------------------------------------------------------------

describe('the aeon object marker (OverlayRenderer.drawObjects)', () => {
  // Box 16 world px, 1 world px border, 0.5 world px gap => 14 world px.
  const budget = labelBudget(OBJECT_BOX_SIZE, OBJECT_BOX_STROKE_WIDTH, OBJECT_LABEL_GAP);
  /** Label font in WORLD px at a given zoom — screen-constant, so 8 / zoom. */
  const worldFont = (zoom: number) => OBJECT_LABEL_FONT_PX / zoom;

  it('the budget is the box minus its own border and gap', () => {
    expect(budget).toBe(14);
  });

  it('THE BOOKED CASE: "solid" does not fit this box at zoom 1', () => {
    // 5 cells x (8/2) = 20 world px of label in 16 world px of box — the
    // 19.999771px the app measures, and the ~2px each side it spilled.
    expect(monoWidth('solid', worldFont(1))).toBeCloseTo(20, 6);
    expect(monoWidth('solid', worldFont(1))).toBeGreaterThan(OBJECT_BOX_SIZE);
  });

  it('at zoom 1 it elides to one character plus the marker', () => {
    // 14 px budget / 4 px cell = 3 cells; the ellipsis is 2 of them.
    expect(budget / cell(worldFont(1))).toBe(3.5);
    const fit = fitLabel('solid', budget, at(worldFont(1)));
    expect(fit.text).toBe(`s${LABEL_ELLIPSIS}`);
    expect(fit.elided).toBe(true);
    expect(fit.width).toBeLessThanOrEqual(budget);
  });

  it('at zoom 2 the whole id reads — which is the point of a screen-sized font', () => {
    // The box doubles on screen while the glyphs do not: cells go 3 -> 7.
    expect(Math.floor(budget / cell(worldFont(2)))).toBe(7);
    expect(fitLabel('solid', budget, at(worldFont(2)))).toEqual({
      text: 'solid', width: monoWidth('solid', worldFont(2)), elided: false,
    });
  });

  it('at zoom 0.5 and below the box has no room for a label at all', () => {
    // 1 cell of room; a character plus the 2-cell marker needs 3.
    expect(Math.floor(budget / cell(worldFont(0.5)))).toBe(1);
    expect(fitLabel('solid', budget, at(worldFont(0.5))).text).toBe('');
    expect(fitLabel('solid', budget, at(worldFont(0.125))).text).toBe('');
  });
});

describe('the classic ghost marker (invisible/trigger objects)', () => {
  // Box 24 world px; border and gap are SCREEN px, so both scale with invZoom.
  const budget = (zoom: number) => labelBudget(
    GHOST_MARKER_BOUNDS.width, MARKER_STROKE_PX / zoom, MARKER_LABEL_GAP_PX / zoom);
  const worldFont = (zoom: number) => 8 / zoom;
  const NAME = 'Conveyor Belt Controller'; // s1-objects.ts $68, the longest of the six

  it('THE UNBOOKED CASE: the longest ghost name is 4x its box at zoom 1', () => {
    // 24 cells x 4 world px = 96 world px through a 24 world px box.
    expect(monoWidth(NAME, worldFont(1))).toBeCloseTo(96, 6);
    expect(monoWidth(NAME, worldFont(1)) / GHOST_MARKER_BOUNDS.width).toBe(4);
  });

  it('at zoom 1 it elides to three characters plus the marker', () => {
    // budget 24 - 2 = 22 world px; 22 / 4 = 5.5 cells; 5 usable, 2 for the
    // ellipsis, 3 for the name.
    expect(budget(1)).toBe(22);
    const fit = fitLabel(NAME, budget(1), at(worldFont(1)));
    expect(fit.text).toBe(`Con${LABEL_ELLIPSIS}`);
    expect(fit.width).toBeLessThanOrEqual(budget(1));
  });

  it('zooming in buys characters, one per cell', () => {
    const kept = (zoom: number) => {
      const fit = fitLabel(NAME, budget(zoom), at(worldFont(zoom)));
      return fit.text === '' ? 0 : [...fit.text].length - 1;
    };
    // Strictly more of the name at each step in, and the whole of it eventually.
    expect(kept(2)).toBeGreaterThan(kept(1));
    expect(kept(4)).toBeGreaterThan(kept(2));
    expect(fitLabel(NAME, budget(8), at(worldFont(8))).text).toBe(NAME);
  });

  it('zooming out drops the label rather than smearing it across the map', () => {
    expect(fitLabel(NAME, budget(0.25), at(worldFont(0.25))).text).toBe('');
  });
});

describe('the classic hex fallback marker', () => {
  const budget = (zoom: number) => labelBudget(
    HEX_MARKER_SIZE, MARKER_STROKE_PX / zoom, MARKER_LABEL_GAP_PX / zoom);
  const worldFont = (zoom: number) => 8 / zoom;

  it('two hex digits fit unchanged at zoom 1 — this fix costs the common case nothing', () => {
    expect(fitLabel('0E', budget(1), at(worldFont(1)))).toEqual({
      text: '0E', width: monoWidth('0E', 8), elided: false,
    });
  });

  it('but the SAME two digits overflow once the screen-sized font outgrows the box', () => {
    // zoom 0.5: cells are 8 world px, so "0E" is 16 world px in a 16 world px
    // box — edge to edge, over the border, before any gap.
    expect(monoWidth('0E', worldFont(0.5))).toBe(HEX_MARKER_SIZE);
    expect(monoWidth('0E', worldFont(0.5))).toBeGreaterThan(budget(0.5));
    expect(fitLabel('0E', budget(0.5), at(worldFont(0.5))).text).toBe('');
    // zoom 0.25: double the box.
    expect(monoWidth('0E', worldFont(0.25))).toBe(2 * HEX_MARKER_SIZE);
    expect(fitLabel('0E', budget(0.25), at(worldFont(0.25))).text).toBe('');
  });
});

describe('the measured metric this all rests on', () => {
  it('is the one recorded from the app, not a guess about monospace', () => {
    expect(MONO_ADVANCE_EM).toBe(0.5);
    expect(MONO_ELLIPSIS_CELLS).toBe(2);
    // The booked figure, reproduced from the metric: "solid" at an 8px font.
    expect(monoWidth('solid', 8)).toBe(20);
    // The app measured 19.999771118164062 — 0.0011% under, which is the face's
    // own advance (3.9999542px) rather than the ideal 4px. Well inside the
    // tolerance any of the fits above turn on.
    expect(Math.abs(19.999771118164062 - monoWidth('solid', 8))).toBeLessThan(0.001);
  });
});
