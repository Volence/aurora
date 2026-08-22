// ROADMAP §5.1 item 17 — the REAL draw functions, not the arithmetic.
//
// `label-fit.test.ts` proves the fitting; this file proves the two overlay draw
// paths actually route their labels through it. That distinction matters here:
// the booking exists because a label was drawn with no measurement at all, and a
// perfectly-tested helper nobody calls would reproduce the defect exactly.
//
// The context is a recording stand-in whose `measureText` models the metric the
// running app reports (`src/test/mono-measure.ts`, raw readings in its header),
// so the strings asserted below are the strings the app draws.
//
// EVERY SUPPRESSION CASE ALSO ASSERTS THE BOX WAS DRAWN. "No label" and "the
// draw loop never ran" produce the same zero, and only one of them is the
// feature working.
//
// WHAT THIS CANNOT SEE: real font resolution, real pixels, the canvas edge, and
// whether any of this is on screen at all. That is
// `scratchpad/object-label-harness.mjs`.

import { describe, it, expect } from 'vitest';
import { OverlayRenderer, OBJECT_BOX_SIZE } from '../OverlayRenderer';
import { drawObjects as drawClassicObjects, GHOST_MARKER_BOUNDS, HEX_MARKER_SIZE } from '../../components/classic/classic-overlays';
import { LABEL_ELLIPSIS } from '../label-fit';
import { monoMeasureText, monoWidth } from '../../../test/mono-measure';
import type { ObjectPlacement } from '../../../core/model/s4-types';
import type { LevelDoc } from '../../../core/level-classic/model';

interface Rec {
  fillText: { text: string; x: number; y: number; font: string }[];
  fillRect: number[][];
  strokeRect: number[][];
}

/** Recording 2D-context stand-in with the app's own monospace metric. */
function recCtx() {
  const rec: Rec = { fillText: [], fillRect: [], strokeRect: [] };
  const ctx = {
    __rec: rec,
    lineWidth: 0, font: '', textAlign: 'left' as CanvasTextAlign,
    fillStyle: '', strokeStyle: '', globalAlpha: 1, imageSmoothingEnabled: false,
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
    fill() {}, stroke() {}, setLineDash() {}, moveTo() {}, lineTo() {}, arc() {},
    drawImage() {},
    measureText: monoMeasureText,
    fillRect(...a: number[]) { rec.fillRect.push(a); },
    strokeRect(...a: number[]) { rec.strokeRect.push(a); },
    fillText(text: string, x: number, y: number) { rec.fillText.push({ text, x, y, font: this.font }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rec };
}

// Placed well inside the viewport at EVERY zoom below: at zoom 8 the visible
// world is 800/8 = 100px wide, and drawObjects culls anything past it. (Which
// is itself worth knowing — the first draft of this file put the fixture at 200
// and the zoom-8 row recorded no box at all.)
const placement = (typeId: string): ObjectPlacement => ({ x: 40, y: 40, typeId, subtype: 0 });
const viewportAt = (zoom: number) => ({ x: 0, y: 0, width: 800, height: 600, zoom });

// ---------------------------------------------------------------------------
// aeon — OverlayRenderer.drawObjects
// ---------------------------------------------------------------------------

describe('OverlayRenderer.drawObjects labels its no-preview box', () => {
  const draw = (typeId: string, zoom: number) => {
    const { ctx, rec } = recCtx();
    new OverlayRenderer().drawObjects(ctx, [placement(typeId)], viewportAt(zoom), 0, 0, undefined);
    return rec;
  };

  it('draws the box for the fixture placement, at every zoom (the instrument saw its subject)', () => {
    for (const zoom of [0.125, 0.5, 1, 2, 8]) {
      const rec = draw('solid', zoom);
      expect(rec.fillRect, `zoom ${zoom}`).toEqual([[40 - 8, 40 - 8, OBJECT_BOX_SIZE, OBJECT_BOX_SIZE]]);
      expect(rec.strokeRect, `zoom ${zoom}`).toHaveLength(1);
    }
  });

  it('THE BOOKED DEFECT IS GONE: "solid" is never drawn whole into a 16px box', () => {
    const rec = draw('solid', 1);
    expect(rec.fillText).toHaveLength(1);
    expect(rec.fillText[0].text).not.toBe('solid');
    // ...and what IS drawn fits, measured at the font the call site set.
    const { text, font } = rec.fillText[0];
    const px = Number(/([\d.]+)px/.exec(font)![1]);
    expect(monoWidth(text, px)).toBeLessThanOrEqual(OBJECT_BOX_SIZE);
  });

  it('elides with the marker at zoom 1 and shows the whole id once it fits', () => {
    expect(draw('solid', 1).fillText.map((f) => f.text)).toEqual([`s${LABEL_ELLIPSIS}`]);
    expect(draw('solid', 2).fillText.map((f) => f.text)).toEqual(['solid']);
    // A short id was never the problem and must not be elided at zoom 1.
    expect(draw('sp', 1).fillText.map((f) => f.text)).toEqual(['sp']);
  });

  it('drops the label rather than smearing it when the box cannot hold one', () => {
    for (const zoom of [0.5, 0.25, 0.125]) {
      const rec = draw('solid', zoom);
      expect(rec.fillText, `zoom ${zoom}`).toHaveLength(0);
      // ANTI-VACUOUS: the marker itself is still there.
      expect(rec.fillRect, `zoom ${zoom}`).toHaveLength(1);
    }
  });

  it('sizes the label in SCREEN pixels, so the box outgrows it as you zoom in', () => {
    // 8 / zoom world px at the draw site; the box stays 16 world px.
    for (const zoom of [1, 2, 4]) {
      const rec = draw('ab', zoom);
      expect(rec.fillText[0].font, `zoom ${zoom}`).toBe(`${8 / zoom}px monospace`);
    }
  });

  it('an id long enough to be hopeless still draws its box', () => {
    const rec = draw('a_very_long_object_type_id', 1);
    expect(rec.fillRect).toHaveLength(1);
    expect(rec.fillText.map((f) => f.text)).toEqual([`a${LABEL_ELLIPSIS}`]);
  });
});

// ---------------------------------------------------------------------------
// classic — classic-overlays.drawObjects
// ---------------------------------------------------------------------------

/** Minimal doc: drawObjects reads only `.objects` on these paths. */
const classicDoc = (id: number): LevelDoc => ({
  objects: [{ x: 100, y: 100, id, subtype: 0, xflip: false, yflip: false, respawn: false }],
} as unknown as LevelDoc);

const CONVEYOR = 0x68; // "Conveyor Belt Controller" — the longest ghost name
const UNLINKED = 0x10; // no sprite, not invisible => the $XX hex fallback

describe('classic drawObjects labels its ghost marker', () => {
  const draw = (id: number, zoom: number) => {
    const { ctx, rec } = recCtx();
    drawClassicObjects(ctx, classicDoc(id), 1 / zoom, new Map(), '');
    return rec;
  };

  it('draws the ghost box for the fixture (the instrument saw its subject)', () => {
    const rec = draw(CONVEYOR, 1);
    expect(rec.fillRect).toEqual([[100 - 12, 100 - 8, GHOST_MARKER_BOUNDS.width, GHOST_MARKER_BOUNDS.height]]);
  });

  it('THE UNBOOKED DEFECT: the 24-char name is no longer drawn through a 24px box', () => {
    const rec = draw(CONVEYOR, 1);
    expect(rec.fillText).toHaveLength(1);
    expect(rec.fillText[0].text).toBe(`Con${LABEL_ELLIPSIS}`);
    expect(monoWidth(rec.fillText[0].text, 8)).toBeLessThanOrEqual(GHOST_MARKER_BOUNDS.width);
  });

  it('zooming in reveals more of the name, and eventually all of it', () => {
    const kept = (zoom: number) => draw(CONVEYOR, zoom).fillText[0]?.text ?? '';
    expect(kept(2).length).toBeGreaterThan(kept(1).length);
    expect(kept(8)).toBe('Conveyor Belt Controller');
  });

  it('zooming out drops the name and keeps the marker', () => {
    const rec = draw(CONVEYOR, 0.25);
    expect(rec.fillText).toHaveLength(0);
    expect(rec.fillRect).toHaveLength(1);
  });
});

describe('classic drawObjects labels its hex fallback', () => {
  const draw = (zoom: number) => {
    const { ctx, rec } = recCtx();
    drawClassicObjects(ctx, classicDoc(UNLINKED), 1 / zoom, new Map(), '');
    return rec;
  };

  it('the common case is untouched: two hex digits at zoom 1', () => {
    const rec = draw(1);
    expect(rec.fillRect).toEqual([[100 - 8, 100 - 8, HEX_MARKER_SIZE, HEX_MARKER_SIZE]]);
    expect(rec.fillText.map((f) => f.text)).toEqual(['10']);
  });

  it('but they are dropped once the screen-sized font no longer fits the box', () => {
    for (const zoom of [0.5, 0.25]) {
      const rec = draw(zoom);
      expect(rec.fillText, `zoom ${zoom}`).toHaveLength(0);
      expect(rec.fillRect, `zoom ${zoom}`).toHaveLength(1);
    }
  });
});
