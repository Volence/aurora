// ROW 208, REGIONS-MIDDRAG-PREVIEW: with the regions tint hidden, a region drag
// draws only the gesture (ROADMAP §5.1 row 208; the options are section 7 of
// docs/reviews/2026-09-25-regions-list.md; ruled C by the aurora overseer).
//
// TWO HALVES, AND THE FIRST IS A CONTROL THAT MUST BE GREEN ON BOTH TREES.
//
//   1. THE TINT ON CHANGES NOTHING. Every call `drawRegionOverlay` issues for the
//      scenarios in `region-overlay-cases.ts` (at rest, and mid-drag with the
//      preview pieces, at dpr 1 and 1.35) equals the call log recorded from
//      master 6072f9df's own code, before row 208 touched anything
//      (`region-overlay-full-master.golden.json`, written by a one-off generator
//      the packet quotes). The report's pre-existing fields are compared too.
//
//   2. THE TINT OFF DRAWS THE GESTURE AND NOTHING ELSE (the rows further down).
//
// WHAT THIS FILE CANNOT SAY: which branch MapViewport takes when a real mouse
// is down, or what the author sees. That is harness row 7c of
// scratchpad/region-gesture-harness.mjs, which reads pixels off the map canvas.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawRegionOverlay } from '../region-overlay';
import { recordingContext } from './chrome-recorder';
import { fullCases, CASE_VP } from './region-overlay-cases';

const golden = JSON.parse(readFileSync(
  fileURLToPath(new URL('./region-overlay-full-master.golden.json', import.meta.url)), 'utf8',
)) as { generatedFrom: string; cases: Record<string, { calls: unknown[]; report: Record<string, unknown> }> };

/** JSON's view of a value: what the golden was written through (it also folds -0 to 0). */
const roundTrip = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('row 208 control: with the tint ON the full overlay issues exactly master\'s calls', () => {
  it('the golden was recorded from master 6072f9df and names the same cases (anti-vacuous)', () => {
    expect(golden.generatedFrom).toMatch(/^master 6072f9df/);
    expect(Object.keys(golden.cases).sort()).toEqual(fullCases().map((c) => c.name).sort());
    // A mid-drag case is in the set, or "nothing changed mid-drag" was never asked.
    expect(fullCases().some((c) => c.name.startsWith('mid-drag'))).toBe(true);
  });

  for (const c of fullCases()) {
    it(`${c.name}: same calls, same report`, () => {
      const r = recordingContext();
      const rep = drawRegionOverlay(r.ctx, c.dpr, CASE_VP, c.input);
      expect(roundTrip(r.calls)).toEqual(golden.cases[c.name].calls);
      expect(roundTrip({
        regions: rep.regions, selectedId: rep.selectedId, unassignedRects: rep.unassignedRects,
        unassignedArea: rep.unassignedArea, visual: rep.visual,
      })).toEqual(golden.cases[c.name].report);
    });
  }

  it('the comparison can fail: selecting a different region changes the calls (anti-vacuous)', () => {
    const c = fullCases()[0];
    const r = recordingContext();
    drawRegionOverlay(r.ctx, c.dpr, CASE_VP, { ...c.input, selectedId: 'south' });
    expect(roundTrip(r.calls)).not.toEqual(golden.cases[c.name].calls);
  });
});
