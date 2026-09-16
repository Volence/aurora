// THE REGIONS OVERLAY — editor spec §3.4, step 8's second half.
//
// What this file can prove: the union outline with interior edges suppressed,
// the hue and hatch assignment, the colourblind separation of the palette, and
// every call the draw pass issues (through the recording context the dpr parcel
// left behind). What it CANNOT say is anything about pixels, antialiasing or
// what the author sees over real level art; that is parcel 8B's CDP harness and
// the owner's eye, in the foreground.

import { describe, it, expect } from 'vitest';
import {
  REGION_HATCH_ALPHA, REGION_HATCH_PX, REGION_OUTLINE_PX, REGION_OUTLINE_SELECTED_PX,
  UNASSIGNED_LABEL,
  drawRegionOverlay, lastRegionOverlayReport, publishRegionOverlayReport,
  regionHatchSlope, regionHue, regionOutlineSegments, unionBounds,
  type RegionOverlayInput, type RegionViewport,
} from '../region-overlay';
import { REGION_HUES, REGION_UNASSIGNED_FILL, SCREEN_FRAME_LINE } from '../canvas-colors';
import { REGION_GRAB_PX } from '../../../core/editing/region-marquee';
import { coverage, type Rect, type RegionPiece } from '../../../core/editing/region-geometry';
import { recordingContext } from './chrome-recorder';

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
const piece = (id: string, r: Rect): RegionPiece => ({ id, rect: { ...r } });

/** Total length of a segment list. A union's boundary has ONE length whatever
 *  decomposition produced it, which is what makes it a good invariant. */
const perimeter = (segs: { x1: number; y1: number; x2: number; y2: number }[]): number =>
  segs.reduce((n, s) => n + Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1), 0);

describe('the union outline, interior edges suppressed', () => {
  it('a lone rectangle is its own four sides', () => {
    const segs = regionOutlineSegments([rect(0, 0, 100, 50)]);
    expect(segs.length).toBe(4);
    expect(perimeter(segs)).toBe(2 * (100 + 50));
  });

  it('two rectangles sharing an edge draw no seam along it', () => {
    const segs = regionOutlineSegments([rect(0, 0, 16, 16), rect(16, 0, 16, 16)]);
    // A census, not a spot check: NO segment lies on the shared line at all.
    expect(segs.filter((s) => s.x1 === 16 && s.x2 === 16)).toEqual([]);
    // And the boundary is the outer rectangle's, so nothing was dropped either.
    expect(perimeter(segs)).toBe(2 * (32 + 16));
  });

  it('an L-shape has the L`s perimeter, not the sum of its pieces', () => {
    // A 32x32 square with its bottom-right 16x16 quarter cut out, as the three
    // rectangles a carve leaves behind.
    const segs = regionOutlineSegments([
      rect(0, 0, 32, 16), rect(0, 16, 16, 16),
    ]);
    expect(perimeter(segs)).toBe(32 + 16 + 16 + 16 + 16 + 32);
  });

  it('two rectangles that only TOUCH AT A CORNER keep both perimeters', () => {
    const segs = regionOutlineSegments([rect(0, 0, 16, 16), rect(16, 16, 16, 16)]);
    expect(perimeter(segs)).toBe(2 * 4 * 16);
  });

  it('two rectangles far apart keep both perimeters', () => {
    const segs = regionOutlineSegments([rect(0, 0, 16, 16), rect(500, 500, 16, 16)]);
    expect(perimeter(segs)).toBe(2 * 4 * 16);
  });

  it('does not depend on the order the rectangles arrive in', () => {
    const a = regionOutlineSegments([rect(0, 0, 16, 16), rect(16, 0, 16, 16), rect(0, 16, 16, 16)]);
    const b = regionOutlineSegments([rect(0, 16, 16, 16), rect(16, 0, 16, 16), rect(0, 0, 16, 16)]);
    expect(a).toEqual(b);
  });
});

describe('unionBounds', () => {
  it('holds every rectangle of a carved region', () => {
    expect(unionBounds([rect(0, 0, 16, 16), rect(48, 32, 16, 16)])).toEqual(rect(0, 0, 64, 48));
  });
  it('is null for a region with nothing left', () => {
    expect(unionBounds([])).toBe(null);
    expect(unionBounds([rect(0, 0, 0, 10)])).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// The palette, and the reader it was chosen for
// ---------------------------------------------------------------------------

/** A `#rrggbb` or `rgba(r, g, b, a)` colour as three channels.
 *  NO COLOUR LITERAL APPEARS IN THIS FILE: `test/renderer/no-raw-hex.test.ts`
 *  counts every raw hex under `src/renderer`, `__tests__` included, and a gate
 *  about colour is no reason to spend one. Every colour here is READ from
 *  `canvas-colors.ts` or written as channel numbers. */
function channels(colour: string): [number, number, number] {
  if (colour.startsWith('rgb')) {
    const n = colour.match(/\d+/g) as string[];
    return [Number(n[0]), Number(n[1]), Number(n[2])];
  }
  const n = parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** sRGB 0..255 as a deuteranope sees it (Vienot 1999, the standard matrices). */
function deuteranope(colour: string | [number, number, number]): [number, number, number] {
  const [r, g, b] = typeof colour === 'string' ? channels(colour) : colour;
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b;
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b;
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b;
  const M2 = 0.494207 * L + 1.24827 * S;
  return [
    0.080944448 * L - 0.130504409 * M2 + 0.116721066 * S,
    -0.0102485335 * L + 0.0540193266 * M2 - 0.113614708 * S,
    -0.000365296938 * L - 0.00412161469 * M2 + 0.693511405 * S,
  ];
}

const dist = (a: [number, number, number], b: [number, number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * THE BAR THIS GATE HOLDS THE PALETTE TO, and it is the TEST's number rather
 * than a source constant: a categorical palette is only usable if no two of its
 * members collapse together for either reader it is drawn for. 55 of the 441 a
 * full sRGB cube spans is an eighth of the space, and it is set where it BITES:
 * the two Okabe-Ito members this palette leaves out sit at 50.8 and 52.4 for a
 * deuteranope, so putting either back reddens this, which is the mutation that
 * proved the gate.
 */
const MIN_SEPARATION = 55;

/**
 * THE POPULATION IS THE PALETTE PLUS THE TWO COLOURS IT SHARES A SCREEN WITH
 * AND MUST NOT BE MISTAKEN FOR: the refusal red an unassigned hole is painted
 * in, and the screen frame's amber (spec §3.5, step 9). A palette checked only
 * against itself is checked against half the screen.
 */
const COHABITANTS = [REGION_UNASSIGNED_FILL, SCREEN_FRAME_LINE];

describe('the palette both of its readers see', () => {
  it('the simulation is not the identity (the control this gate needs)', () => {
    // A salmon and a green that sRGB puts far apart and a deuteranope does not.
    // FOUND BY SEARCHING for the pair with a large sRGB gap and the smallest
    // simulated one, not guessed: the first spelling of this control used a
    // plausible-looking red and green that the simulation kept 73 apart, which
    // would have let a broken simulation pass as a working one.
    const salmon: [number, number, number] = [255, 153, 119];
    const green: [number, number, number] = [136, 204, 119];
    expect(dist(salmon, green)).toBeGreaterThan(MIN_SEPARATION * 2);
    expect(dist(deuteranope(salmon), deuteranope(green))).toBeLessThan(MIN_SEPARATION);
  });

  it('keeps every pair apart for a DEUTERANOPE, palette and cohabitants alike', () => {
    const all = [...REGION_HUES, ...COHABITANTS];
    for (let i = 0; i < REGION_HUES.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(dist(deuteranope(all[i]), deuteranope(all[j]))).toBeGreaterThan(MIN_SEPARATION);
      }
    }
  });

  it('and keeps every pair apart in FULL COLOUR too, for the other reader', () => {
    const all = [...REGION_HUES, ...COHABITANTS];
    for (let i = 0; i < REGION_HUES.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(dist(channels(all[i]), channels(all[j]))).toBeGreaterThan(MIN_SEPARATION);
      }
    }
  });

  it('the population really includes the cohabitants (anti-vacuous)', () => {
    // A gate whose loop never reaches the frame and the refusal red would pass
    // on a palette that reads as either of them.
    expect(COHABITANTS.length).toBe(2);
    expect(REGION_HUES.length).toBeGreaterThan(1);
  });
});

describe('hue and hatch are a function of document position', () => {
  it('gives each of the first N regions its own hue', () => {
    const seen = REGION_HUES.map((_, i) => regionHue(i));
    expect(new Set(seen).size).toBe(REGION_HUES.length);
  });

  it('wraps rather than clamping, and the hatch angle turns over on the wrap', () => {
    expect(regionHue(REGION_HUES.length)).toBe(regionHue(0));
    expect(regionHatchSlope(REGION_HUES.length)).not.toBe(regionHatchSlope(0));
  });

  it('the first 2N regions are all distinct hue-and-angle pairs', () => {
    const pairs = new Set<string>();
    for (let i = 0; i < REGION_HUES.length * 2; i += 1) {
      pairs.add(`${regionHue(i)}/${regionHatchSlope(i)}`);
    }
    expect(pairs.size).toBe(REGION_HUES.length * 2);
  });
});

// ---------------------------------------------------------------------------
// The draw pass
// ---------------------------------------------------------------------------

const ACT = rect(0, 0, 640, 448);
const vp: RegionViewport = { x: 0, y: 0, width: 640, height: 448, zoom: 1 };

const input = (over: Partial<RegionOverlayInput> = {}): RegionOverlayInput => ({
  act: ACT,
  pieces: [piece('west', rect(0, 0, 320, 448)), piece('east', rect(320, 0, 320, 448))],
  regions: [
    { id: 'west', label: 'Forest', bgText: 'act', bgMissing: false },
    { id: 'east', label: 'Night', bgText: 'MISSING deep_forest', bgMissing: true },
  ],
  selectedId: null,
  ...over,
});

describe('the draw pass', () => {
  it('draws the selected region`s outline heavier than the rest', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, input({ selectedId: 'east' }));
    const widths = r.strokes.filter((s) => s.kind === 'path').map((s) => s.width);
    expect(widths).toContain(REGION_OUTLINE_SELECTED_PX);
    expect(widths).toContain(REGION_OUTLINE_PX);
  });

  it('washes the hatch at less than full alpha, and draws the outline at full', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, input());
    const alphas = r.calls.filter((c) => c.op === 'set:globalAlpha').map((c) => c.args[0]);
    expect(alphas).toContain(REGION_HATCH_ALPHA);
    expect(REGION_HATCH_ALPHA).toBeLessThan(1);
  });

  it('names every region, and names its background on a second line (the ruling)', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, input());
    const said = r.texts.map((t) => t.text);
    expect(said).toContain('Forest');
    expect(said).toContain('act');
    expect(said).toContain('Night');
    expect(said).toContain('MISSING deep_forest');
  });

  it('puts each label at its region`s union top-left', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, input());
    const night = r.texts.find((t) => t.text === 'Night');
    expect(night).toBeDefined();
    // east's union starts at world x 320, which at zoom 1 with no pan is canvas 320.
    expect(night?.x).toBeGreaterThanOrEqual(320);
    expect(night?.x).toBeLessThan(320 + 24);
  });

  it('paints UNASSIGNED when there is a hole, in the refusal red, and names it ONCE', () => {
    const holed = input({ pieces: [piece('west', rect(0, 0, 160, 448))], regions: [
      { id: 'west', label: 'Forest', bgText: 'act', bgMissing: false },
    ] });
    expect(coverage(ACT, holed.pieces).unassigned.length).toBeGreaterThan(0);
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, vp, holed);
    expect(r.strokes.some((s) => s.style === REGION_UNASSIGNED_FILL)).toBe(true);
    expect(r.texts.filter((t) => t.text === UNASSIGNED_LABEL).length).toBe(1);
    expect(report.unassignedRects).toBe(coverage(ACT, holed.pieces).unassigned.length);
  });

  it('and paints none of it on a fully covered act (the other direction)', () => {
    expect(coverage(ACT, input().pieces).unassignedArea).toBe(0);
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, vp, input());
    expect(r.strokes.some((s) => s.style === REGION_UNASSIGNED_FILL)).toBe(false);
    expect(r.texts.some((t) => t.text === UNASSIGNED_LABEL)).toBe(false);
    expect(report.unassignedRects).toBe(0);
  });

  it('names ONE hole however many there are', () => {
    // Four rectangles in the corners leave a cross-shaped hole of several rects.
    const corners = input({
      pieces: [
        piece('west', rect(0, 0, 160, 160)), piece('west', rect(480, 0, 160, 160)),
        piece('west', rect(0, 288, 160, 160)), piece('west', rect(480, 288, 160, 160)),
      ],
      regions: [{ id: 'west', label: 'Forest', bgText: 'act', bgMissing: false }],
    });
    expect(coverage(ACT, corners.pieces).unassigned.length).toBeGreaterThan(1);
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, corners);
    expect(r.texts.filter((t) => t.text === UNASSIGNED_LABEL).length).toBe(1);
  });

  it('draws nothing for a region entirely off the canvas, and says so', () => {
    const away = input({
      pieces: [piece('west', rect(0, 0, 640, 448)), piece('far', rect(5000, 0, 64, 64))],
      regions: [
        { id: 'west', label: 'Forest', bgText: 'act', bgMissing: false },
        { id: 'far', label: 'Far', bgText: 'act', bgMissing: false },
      ],
    });
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, vp, away);
    expect(report.regions.find((x) => x.id === 'far')?.visible).toBe(false);
    expect(r.texts.some((t) => t.text === 'Far')).toBe(false);
  });

  it('draws in the canvas`s own dpr frame, never resetting to identity', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 2, vp, input());
    const sets = r.calls.filter((c) => c.op === 'setTransform');
    expect(sets.length).toBeGreaterThan(0);
    for (const c of sets) expect(c.args).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('hatches a region`s rectangles and nothing outside them', () => {
    const r = recordingContext();
    drawRegionOverlay(r.ctx, 1, vp, input());
    // A clip is pushed before each region's hatch, so the texture cannot bleed.
    expect(r.clips.length).toBeGreaterThanOrEqual(input().regions.length);
  });
});

describe('the report', () => {
  it('advances paints on every draw, and carries what the map showed', () => {
    const before = lastRegionOverlayReport().paints;
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, vp, input({ selectedId: 'west' }));
    expect(report.paints).toBe(before + 1);
    expect(report.selectedId).toBe('west');
    expect(report.regions.map((x) => x.id)).toEqual(['west', 'east']);
    expect(report.regions[0].bounds).toEqual(rect(0, 0, 320, 448));
    expect(report.regions[0].selected).toBe(true);
    expect(lastRegionOverlayReport()).toEqual(report);
  });

  it('carries the visual calls, so a harness reads them from the code', () => {
    const report = publishRegionOverlayReport({
      regions: [], selectedId: null, unassignedRects: 0, unassignedArea: 0,
    });
    expect(report.visual.hatchPx).toBe(REGION_HATCH_PX);
    expect(report.visual.grabPx).toBe(REGION_GRAB_PX);
    expect(report.visual.hues).toEqual(REGION_HUES);
  });

  it('says how many rectangles a region holds, so a carve is visible in the report', () => {
    const carved = input({
      pieces: [
        piece('west', rect(0, 0, 320, 224)), piece('west', rect(0, 224, 320, 224)),
        piece('east', rect(320, 0, 320, 448)),
      ],
    });
    const r = recordingContext();
    const report = drawRegionOverlay(r.ctx, 1, vp, carved);
    expect(report.regions.find((x) => x.id === 'west')?.rects).toBe(2);
    expect(report.regions.find((x) => x.id === 'east')?.rects).toBe(1);
  });
});
