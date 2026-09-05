// Regression test for the classic viewport crash: drawObjects must never call
// drawImage on a detached (closed) ImageBitmap. An act switch publishes the new
// sprite map then closes the previous epoch's bitmaps (classicObjectArtStore
// evictStale); the no-dep render effect can still flush a draw that holds the old
// map, and drawImage on a closed bitmap throws InvalidStateError — which, with no
// error boundary, unmounts the whole viewport (blank window). Closed ImageBitmaps
// report width/height === 0, so drawObjects treats a width-0 sprite as "no sprite"
// (hex-box fallback) rather than drawing it.

import { describe, it, expect } from 'vitest';
import { drawObjects, drawCollision, drawPriority } from '../classic-overlays';
import type { ObjectSprite } from '../../../state/classicObjectArtStore';
import type { LevelDoc } from '../../../../core/level-classic/model';
import { monoMeasureText } from '../../../../test/mono-measure';
import { COLLISION_ANGLE_TICK } from '../../../canvas/canvas-colors';
import { DETAIL_CELL_PX } from '../../../../core/collision/collision-angle-mark';

/** A recording 2D-context stand-in: captures drawImage/fillRect call counts. */
function mockCtx() {
  const calls = { drawImage: 0, fillRect: 0, strokeRect: 0, fillText: 0, arc: 0 };
  const ctx = {
    lineWidth: 0, font: '', textAlign: '' as CanvasTextAlign, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    // The overlay measures its labels now (ROADMAP 5.1 item 17), so a stand-in
    // context has to answer measureText. `monoMeasureText` reports the metric the
    // real app resolves, read at the stub's own font.
    measureText: monoMeasureText,
    drawImage() { calls.drawImage++; },
    fillRect() { calls.fillRect++; },
    strokeRect() { calls.strokeRect++; },
    fillText() { calls.fillText++; },
    arc() { calls.arc++; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Minimal doc with a single object placement — drawObjects only reads .objects. */
function docWithObject(id: number): LevelDoc {
  return {
    objects: [{ x: 100, y: 100, id, subtype: 0, xflip: false, yflip: false, respawn: false }],
  } as unknown as LevelDoc;
}

function sprite(width: number): ObjectSprite {
  // The bitmap only needs a `width` for the guard; drawImage is mocked.
  return { bitmap: { width, height: width } as unknown as ImageBitmap, width: 16, height: 16, originX: 8, originY: 8 };
}

describe('drawObjects detached-bitmap guard', () => {
  it('does not throw and skips drawImage when the sprite bitmap is detached (width 0)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['16', sprite(0)]]); // closed bitmap ($10 = 16)
    expect(() => drawObjects(ctx, docWithObject(0x10), 1, sprites, '')).not.toThrow();
    expect(calls.drawImage).toBe(0);   // never blit a detached source
    expect(calls.fillRect).toBeGreaterThan(0); // fell back to the hex box
  });

  it('draws the sprite when its bitmap is live (width > 0)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['16', sprite(16)]]);
    drawObjects(ctx, docWithObject(0x10), 1, sprites, '');
    expect(calls.drawImage).toBe(1);
  });

  it('falls back to the ring markers (no drawImage) for a detached ring sprite ($25)', () => {
    const { ctx, calls } = mockCtx();
    const sprites = new Map<string, ObjectSprite>([['37', sprite(0)]]); // $25 = 37
    expect(() => drawObjects(ctx, docWithObject(0x25), 1, sprites, '')).not.toThrow();
    expect(calls.drawImage).toBe(0);
    expect(calls.arc).toBeGreaterThan(0); // ring circle markers drawn instead
  });

  it('draws a ghost marker (labelled box, no hex) for an invisible id with no sprite', () => {
    const { ctx, calls } = mockCtx();
    // $49 Waterfall Sound Effect — an invisible/trigger id with no linked art.
    drawObjects(ctx, docWithObject(0x49), 1, new Map(), '');
    expect(calls.drawImage).toBe(0); // no sprite
    expect(calls.fillRect).toBeGreaterThan(0); // muted ghost box drawn
    expect(calls.fillText).toBeGreaterThan(0); // labelled with the object name
  });

  it('resolves the composed sprite by (id, subtype) key for a rule object', () => {
    const { ctx, calls } = mockCtx();
    // Monitor $26 subtype 6 → composed key "38:6". A sprite published under the bare
    // id ("38") must NOT be picked up (subtype rule keys by subtype).
    const wrongKey = new Map<string, ObjectSprite>([['38', sprite(16)]]);
    drawObjects(ctx, { objects: [{ x: 50, y: 50, id: 0x26, subtype: 6, xflip: false, yflip: false, respawn: false }] } as unknown as LevelDoc, 1, wrongKey, 'ghz');
    expect(calls.drawImage).toBe(0); // bare-id sprite ignored — falls back to hex box
    const rightKey = new Map<string, ObjectSprite>([['38:6', sprite(16)]]);
    const r2 = mockCtx();
    drawObjects(r2.ctx, { objects: [{ x: 50, y: 50, id: 0x26, subtype: 6, xflip: false, yflip: false, respawn: false }] } as unknown as LevelDoc, 1, rightKey, 'ghz');
    expect(r2.calls.drawImage).toBe(1); // composed sprite drawn
  });
});

/** A recording context for the angle needle: captures moveTo/lineTo endpoints. */
/**
 * A recording context that TAGS each point with the colour it was drawn in.
 *
 * The old version recorded bare points and relied on a fixture whose heights
 * were all zero so that nothing but the needle drew. That fixture no longer
 * works, and its not working is the correct behaviour: the angle mark anchors
 * ON the collidable surface, so a shape with no solid column has nothing to
 * annotate and draws no mark at all. Rather than keep a degenerate shape alive
 * to isolate the mark, the shape is now REAL and the mark is isolated by
 * colour — which is stricter, because it also proves the mark is drawn in the
 * angle colour and not, say, accidentally in the surface line's.
 *
 * `scale` feeds `getTransform().a`, the live canvas scale the overlay derives
 * its density gate and its screen-space stroke widths from.
 */
function needleCtx(scale = 1) {
  const pts: { x: number; y: number; style: string }[] = [];
  const ctx = {
    lineWidth: 0, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, setLineDash() {},
    fillRect() {}, strokeRect() {},
    moveTo(x: number, y: number) { pts.push({ x, y, style: ctx.strokeStyle }); },
    lineTo(x: number, y: number) { pts.push({ x, y, style: ctx.strokeStyle }); },
    getTransform() { return { a: scale }; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pts };
}

/** Just the points of the angle mark's bright core pass. */
const corePts = (pts: { x: number; y: number; style: string }[]) =>
  pts.filter((p) => p.style === COLLISION_ANGLE_TICK);

/**
 * One chunk, one solid cell at index 0, pointing at block 1 → shape 1.
 *
 * Shape 1 is a REAL flat floor (every column height 8), because the angle mark
 * is anchored on the collidable surface and a shape with no solid column has
 * no surface to anchor to. The surface-line pass draws too; `corePts` filters
 * it out by colour.
 */
function collisionDoc(xf: boolean, yf: boolean): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf, yf, solidity: 3 };
  const heights = [new Int8Array(16), new Int8Array(16).fill(8)];
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: { colind: new Uint8Array([0, 1]), shapes: { heights, angles: new Uint8Array([0, 0xe0]) } },
  } as unknown as LevelDoc;
}

describe('drawCollision angle mark', () => {
  // The mark's core pass at the DETAIL tier is: moveTo/lineTo for the tangent
  // bar, then moveTo/lineTo for the outward stem. Four points, in that order.
  const BAR_A = 0, BAR_B = 1, STEM_ROOT = 2, STEM_TIP = 3;
  // Scale that puts a 16px cell over DETAIL_CELL_PX (57) so the fine tangent
  // bar is drawn beside the stem. DERIVED from the constant, so the fixture
  // follows the rule if the rule ever moves. `+ 1` clears the boundary itself.
  const DETAIL_SCALE = (DETAIL_CELL_PX + 1) / 16;

  it('draws the bar along angleNeedle, not its vertical mirror', () => {
    const { ctx, pts } = needleCtx(DETAIL_SCALE);
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    const core = corePts(pts);
    expect(core.length).toBe(4);
    const dy = core[BAR_B].y - core[BAR_A].y;
    expect(dy).toBeLessThan(0); // $E0 ascends
  });

  it('honours the chunk cell flips the heights already honour', () => {
    const { ctx, pts } = needleCtx(DETAIL_SCALE);
    drawCollision(ctx, collisionDoc(true, false), 0, 0, 1, true);
    const core = corePts(pts);
    expect(core.length).toBe(4);
    const dy = core[BAR_B].y - core[BAR_A].y;
    expect(dy).toBeGreaterThan(0); // X-flipped $E0 descends
  });

  // THE ASYMMETRY, ON CLASSIC'S SURFACE. The old bar was symmetric and so could
  // not say which side of the surface was solid; this row is the one that fails
  // if the stem is ever dropped back to a plain segment.
  it('the stem leaves the surface on the open side (up, for a floor)', () => {
    const { ctx, pts } = needleCtx(DETAIL_SCALE);
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    const core = corePts(pts);
    // The stem is rooted at the bar's midpoint...
    expect(core[STEM_ROOT].x).toBeCloseTo((core[BAR_A].x + core[BAR_B].x) / 2, 10);
    expect(core[STEM_ROOT].y).toBeCloseTo((core[BAR_A].y + core[BAR_B].y) / 2, 10);
    // ...and points AWAY from the solid, which for a floor is upward (-y).
    expect(core[STEM_TIP].y).toBeLessThan(core[STEM_ROOT].y);
    // ...and it is the DOMINANT element: longer than either half of the bar.
    // Classic draws the same mark as aeon, so the hierarchy has to hold here
    // too — a call site that forgot to pass its cell size would fall to the
    // compact tier and this row would find only two points above.
    const stemLen = Math.hypot(core[STEM_TIP].x - core[STEM_ROOT].x, core[STEM_TIP].y - core[STEM_ROOT].y);
    const halfBar = Math.hypot(core[BAR_B].x - core[BAR_A].x, core[BAR_B].y - core[BAR_A].y) / 2;
    expect(stemLen).toBeGreaterThan(halfBar);
  });

  it('the mark sits on the surface, not at the cell centre', () => {
    const { ctx, pts } = needleCtx(DETAIL_SCALE);
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    const core = corePts(pts);
    // Heights are all 8 -> columnSolidRun(8) = { y: 8, h: 8 } -> surface y 8.
    // Cell 0 is at world y 0, so the anchor is world y 8. That coincides with
    // the cell centre HERE only because the fixture floor is exactly half
    // height; the discriminating row for the anchor is in
    // collision-angle-mark.test.ts, which uses a shallow slope.
    expect(core[STEM_ROOT].y).toBeCloseTo(8, 10);
  });

  // THE SIZE RULE REACHES CLASSIC TOO. Between the density gate and
  // DETAIL_CELL_PX the tangent bar is demoted away and the stem is drawn alone
  // — two core points, not four, and the one that survives is the NORMAL.
  it('at a cell size under DETAIL_CELL_PX the stem is drawn ALONE', () => {
    const { ctx, pts } = needleCtx(1); // 16 screen px per cell: over the gate, under detail
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    const core = corePts(pts);
    expect(core.length).toBe(2);
    // Rooted on the surface (y 8) and pointing out of the solid, i.e. up.
    expect(core[0].y).toBeCloseTo(8, 10);
    expect(core[1].y).toBeLessThan(core[0].y);
    // Anti-vacuous: it is the normal that survived, not the tangent. $E0's
    // tangent ASCENDS to the right, its outward normal points up-LEFT, so the
    // x sign separates the two.
    expect(core[1].x).toBeLessThan(core[0].x);
  });

  // The density gate: below MIN_CELL_PX_FOR_MARK screen px per 16px cell the
  // mark is skipped outright. At scale 0.5 a cell is 8 screen px.
  it('is suppressed when a cell is too small to hold it', () => {
    const { ctx, pts } = needleCtx(0.5);
    drawCollision(ctx, collisionDoc(false, false), 0, 0, 1, true);
    expect(corePts(pts).length).toBe(0);
    // Anti-vacuous: the overlay still ran and still drew the surface line, so
    // the zero above is the gate and not a fixture that drew nothing at all.
    expect(pts.length).toBeGreaterThan(0);
  });
});

describe('drawCollision block 0', () => {
  it('draws nothing for block 0, which the engine never consults', () => {
    // The engine short-circuits on block 0 (`andi.w #$7FF,d0 / beq.s .isblank`)
    // BEFORE the solidity test and before colind. The overlay skipped shape 0
    // and solidity 0 but not block 0, so a non-zero colind[0] would paint
    // phantom collision the game does not have.
    const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
    cells[0] = { block: 0, xf: false, yf: false, solidity: 3 };
    const doc = {
      chunks: [{ cells }],
      blocks: [{ cells: [] }],
      collision: {
        colind: new Uint8Array([1]),                      // colind[0] non-zero
        shapes: { heights: [new Int8Array(16), new Int8Array(16).fill(8)], angles: new Uint8Array([0, 0]) },
      },
    } as unknown as LevelDoc;

    const { ctx, pts } = needleCtx();
    let fills = 0;
    (ctx as unknown as { fillRect: () => void }).fillRect = () => { fills++; };
    drawCollision(ctx, doc, 0, 0, 1, true);
    expect(fills).toBe(0);
    expect(pts.length).toBe(0);
  });
});

/** A recording context for the priority lens: captures veil rects + edge lines. */
function priorityCtx() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const lines: { x: number; y: number }[] = [];
  const ctx = {
    lineWidth: 0, fillStyle: '', strokeStyle: '',
    beginPath() {}, stroke() {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }); },
    moveTo(x: number, y: number) { lines.push({ x, y }); },
    lineTo(x: number, y: number) { lines.push({ x, y }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, lines };
}

/**
 * One chunk placing real SBZ block $5A's pattern (single high tile at TL —
 * words 0xC0AE 0x4087 0x4015 0x4015, pinned against the file in
 * core/level-classic/__tests__/priority-mask.test.ts) at chunk cell 0 with the
 * given chunk-cell flips. Every other cell points at the all-low block 0.
 */
function priorityDoc(xf: boolean, yf: boolean, allLow = false): LevelDoc {
  const lowCell = { tile: 0, xf: false, yf: false, pal: 0, pri: false };
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf, yf, solidity: 0 };
  return {
    chunks: [{ cells }],
    blocks: [
      { cells: [lowCell, lowCell, lowCell, lowCell] },
      allLow
        ? { cells: [lowCell, lowCell, lowCell, lowCell] }
        : { cells: [{ ...lowCell, tile: 0xae, pri: true }, lowCell, lowCell, lowCell] },
    ],
  } as unknown as LevelDoc;
}

describe('drawPriority', () => {
  it('veils exactly the high tile: at TL unflipped, mirrored to TR when the CHUNK cell is x-flipped', () => {
    const plain = priorityCtx();
    drawPriority(plain.ctx, priorityDoc(false, false), 0, 0, 1, 1);
    expect(plain.rects).toEqual([{ x: 0, y: 0, w: 8, h: 8 }]); // TL tile of cell (0,0)
    const flipped = priorityCtx();
    drawPriority(flipped.ctx, priorityDoc(true, false), 0, 0, 1, 1);
    // The flip trap: the chunk-cell xf mirrors the ARRANGEMENT, so the single
    // high tile lands in the TR quadrant (x=8), not still at x=0.
    expect(flipped.rects).toEqual([{ x: 8, y: 0, w: 8, h: 8 }]);
  });

  it('outlines the lone high tile on its interior boundaries only', () => {
    const { ctx, lines } = priorityCtx();
    drawPriority(ctx, priorityDoc(false, true), 0, 0, 1, 1);
    // yf puts the high tile at BL of cell (0,0) = tile (0,1): y=8..16, x=0..8.
    // Its left side sits ON the chunk perimeter → skipped; the other 3 stroke.
    expect(lines.length).toBe(6); // 3 segments × (moveTo + lineTo)
    for (const p of lines) {
      expect(p.x === 0 || p.x === 8).toBe(true);
      expect(p.y === 8 || p.y === 16).toBe(true);
    }
  });

  it('draws NOTHING when every tile is low priority (anti-vacuous)', () => {
    const { ctx, rects, lines } = priorityCtx();
    drawPriority(ctx, priorityDoc(false, false, true), 0, 0, 1, 1);
    expect(rects).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('draws nothing for air ($00) and offsets veils by the layout cell', () => {
    const air = priorityCtx();
    drawPriority(air.ctx, priorityDoc(false, false), 3, 2, 0, 1);
    expect(air.rects).toEqual([]);
    const placed = priorityCtx();
    drawPriority(placed.ctx, priorityDoc(false, false), 3, 2, 1, 1);
    expect(placed.rects).toEqual([{ x: 3 * 256, y: 2 * 256, w: 8, h: 8 }]);
  });
});
