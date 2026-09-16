// IS THE REGION GESTURE ACTUALLY WIRED TO THE MAP? — step 8B, item C.
//
// ⚠ WHAT THIS FILE ASSERTS, PRECISELY: that `MapViewport.tsx` NAMES the four
// entry points of `map-region-gesture.ts` / `region-overlay.ts` at the places a
// press, a move, a release and a repaint go through, and that the press hands
// over the viewport's real zoom. IT DOES NOT ASSERT THAT ANY OF THAT RUNS. No
// mouse is moved here, no canvas exists, no React is mounted; a listener that is
// never attached, a branch an earlier `return` makes unreachable, and a repaint
// that never fires all read as PASS below.
//
// It is a SOURCE SCAN on the `map-surface-listeners.test.ts` and
// `map-teardown.test.ts` precedent, and for the reason they give: the decision
// is not "what should this compute" -- that left for `map-region-gesture.ts`
// and is unit-tested beside this file -- it is "does the component ASK". There
// is no jsdom here to mount a 4,700-line component in, and the pure module
// cannot be asked whether anything calls it.
//
// THE PART THAT NEEDS THE RUNNING APP is TAGGED in
// `docs/reviews/2026-09-16-regions-step8b-wiring.md`: that a drag on the real
// canvas produces a rectangle, that the overlay paints, that the toast appears.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
// The repo's one comment-stripping source reader. STRIPPING IS LOAD-BEARING
// here: this file's own subject is heavily commented and every name below
// appears in prose several times, so a raw read would pass on the comments
// alone.
import { code, COMPONENTS } from './helpers/section-panels';

const MAP_VIEWPORT = join(COMPONENTS, 'MapViewport.tsx');

function mapViewport(): string {
  const src = code(MAP_VIEWPORT);
  if (!src.includes('export default function MapViewport()')) {
    throw new Error('map-region-wiring scan: MapViewport.tsx did not read back as source. '
      + 'The comment stripper or the path is wrong, so nothing below measured anything.');
  }
  return src;
}

describe('the region tool reaches the map (a SOURCE scan, not a running app)', () => {
  it('the reader really stripped comments, so every row below reads CODE', () => {
    // THE CONTROL FOR THE WHOLE FILE, and it is TWO-SIDED on purpose. Every
    // name the rows below look for is also written in this component's prose
    // several times, so a stripper that did nothing would let every one of them
    // pass on a comment. The probe is a sentence that exists ONLY in a comment:
    // it must be PRESENT in the raw bytes -- otherwise this control is checking
    // that a string nobody wrote is absent, which is true of any file -- and
    // GONE from what the rows actually read.
    //
    // ⚠ THE FIRST VERSION OF THIS ROW WAS EXACTLY THAT VACUOUS: it probed for a
    // sentence that is in `map-region-gesture.ts` and was never in this file, so
    // it passed without the stripper doing anything at all. The `raw` half is
    // what makes the claim falsifiable -- and it CAUGHT the second version too,
    // whose probe was a phrase the subject's comment wraps across two lines and
    // so never carries contiguously. A probe must be one line of one comment.
    const COMMENT_ONLY = 'a hardcoded 1 would make every resize handle unhittable';
    const raw = readFileSync(MAP_VIEWPORT, 'utf8');
    expect(raw, 'the probe is not in the file, so this control measures nothing')
      .toContain(COMMENT_ONLY);
    const src = mapViewport();
    expect(src, 'the comment stripper did nothing').not.toContain(COMMENT_ONLY);
    expect(src).toContain('export default function MapViewport()');
  });

  it('the press is gated on BOTH the tool and the facet (§3.1: the facet is the only disambiguator)', () => {
    const src = mapViewport();
    expect(src).toContain("tool === 'region'");
    expect(src).toContain('inRegionsFacet()');
    // On ONE line, so the gate is a conjunction rather than two branches that a
    // later edit could separate.
    const gate = src.split('\n').find((l) => l.includes("tool === 'region'"));
    expect(gate).toBeDefined();
    expect(gate).toContain('inRegionsFacet()');
  });

  it('the press hands over the viewport\'s REAL zoom, never a literal', () => {
    // ⚠ THE DEFECT THIS ROW IS ABOUT: the grab band is SCREEN pixels and
    // `regionPressAt` divides by the zoom, so a hardcoded 1 makes every resize
    // handle unhittable at any zoom but 1 -- silently, and only on a real
    // display, which is the class of bug no pure test can reach.
    const src = mapViewport();
    const call = src.slice(src.indexOf('beginRegionDrag('));
    const args = call.slice(0, call.indexOf(');') + 2);
    expect(args).toContain('useViewStore.getState().zoom');
    // Anti-vacuous: the slice really is the call and not the whole file.
    expect(args.length).toBeLessThan(400);
    expect(args).toContain('selectedRegionId');
  });

  it('a move updates the drag and a release ends it, so the document is written ONCE', () => {
    const src = mapViewport();
    expect(src).toContain('updateRegionDrag(');
    // The release goes through `finishGesture`, which is also the mouseleave and
    // the unmount path -- so a drag cannot survive a teardown half-committed.
    const finish = src.slice(src.indexOf('const finishGesture'));
    expect(finish.slice(0, finish.indexOf('}, ['))).toContain('endRegionDrag()');
    // EXACTLY ONE `executeCommand` on the region path. §3.3's "one command per
    // gesture" is held by there being one write, and a second one added later is
    // what this counts.
    const end = src.slice(src.indexOf('function endRegionDrag()'));
    const body = end.slice(0, end.indexOf('\n  }\n'));
    expect(body.split('executeCommand(').length - 1).toBe(1);
    // …and the press and the move contain none at all.
    const press = src.slice(src.indexOf("tool === 'region'"));
    expect(press.slice(0, press.indexOf('\n    }\n'))).not.toContain('executeCommand(');
  });

  it('a REFUSED gesture reaches a toast rather than returning silently', () => {
    const src = mapViewport();
    const end = src.slice(src.indexOf('function endRegionDrag()'));
    const body = end.slice(0, end.indexOf('\n  }\n'));
    expect(body).toContain("outcome.kind === 'refused'");
    // The reason itself, not a sentence composed here: the layer is the one
    // author of why a gesture was refused.
    expect(body).toContain('addToast(outcome.reason');
    // And the `none` arm is deliberately SILENT, which is the other half of the
    // claim: a click that changed nothing must not toast.
    expect(body).toContain("outcome.kind === 'none'");
    const noneArm = body.slice(body.indexOf("outcome.kind === 'none'"));
    expect(noneArm.slice(0, noneArm.indexOf('\n'))).not.toContain('addToast');
  });

  it('the overlay is drawn in the repaint, from the gesture when one is running', () => {
    const src = mapViewport();
    expect(src).toContain('drawRegionOverlay(');
    // The LIVE carve, not the stored document: the preview runs the same
    // transform the commit will run, so what the author sees is what lands.
    expect(src).toContain('regionDragPreview(');
  });
});
