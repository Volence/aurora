import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveCell, resolvePlaneWords, SECTION_PLANE_WORDS, resetPlaneLengthReports,
  ensureCollisionPlanes,
} from '../../src/core/collision/collision-cell-resolve';
import { packCollisionCell, unpackCollisionCell } from '../../src/core/collision/collision-cell-word';
import type { CollisionProfile, CollisionProfileSet } from '../../src/core/collision/collision-model';
import { OverlayRenderer } from '../../src/renderer/canvas/OverlayRenderer';
import type { OverlayOptions } from '../../src/renderer/state/viewStore';
import type { Section } from '../../src/core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';

function ramp(): CollisionProfile {
  const heights = new Int8Array(16);
  for (let c = 0; c < 16; c++) heights[c] = c + 1;
  return { heights, angle: 0x20, hasAngle: true, solidity: 'all' };
}
const SET: CollisionProfileSet = {
  engine: 's4',
  solidCount: 2, // index 0 air, index 1 = ramp
  profiles: [
    { heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'none' },
    ramp(),
  ],
};

describe('resolveCell', () => {
  it('air word resolves to air with no profile', () => {
    const r = resolveCell(SET, 0);
    expect(r.air).toBe(true);
    expect(r.profile).toBeNull();
  });

  it('a plain shape resolves to that base profile', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' }));
    expect(r.known).toBe(true);
    expect(Array.from(r.profile!.heights)).toEqual(Array.from(ramp().heights));
  });

  it('an x-flipped shape resolves to the mirrored profile', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: true, yFlip: false, solidity: 'all' }));
    expect(Array.from(r.profile!.heights)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("substitutes the word's solidity (jump-through over a solid base)", () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'top' }));
    expect(r.profile!.solidity).toBe('top');
  });

  it('an out-of-range shape resolves known=false', () => {
    const r = resolveCell(SET, packCollisionCell({ shape: 200, xFlip: false, yFlip: false, solidity: 'all' }));
    expect(r.air).toBe(false);
    expect(r.known).toBe(false);
    expect(r.profile).toBeNull();
  });

  /**
   * ⚠ A SHAPE FAR PAST THE BANK IS THE WRONG FIXTURE ON ITS OWN. The row above
   * uses one two hundred past the end, which any loosening of the bound still
   * catches; loosening `<` to `<=` left the whole suite green
   * (docs/reviews/2026-09-09-guard-residue-validators.md). The FIRST index past
   * the bank is both the case that separates them and the one a real stale
   * plane produces, because a bank that shrank leaves exactly that index behind.
   */
  it('the FIRST index past the bank is already unknown, and the last one in is known', () => {
    const past = resolveCell(SET, packCollisionCell({
      shape: SET.solidCount, xFlip: false, yFlip: false, solidity: 'all',
    }));
    expect(past.known).toBe(false);
    expect(past.profile).toBeNull();
    // The accepting side of the same comparison, so the row cannot be met by a
    // bound that rejects everything.
    const last = resolveCell(SET, packCollisionCell({
      shape: SET.solidCount - 1, xFlip: false, yFlip: false, solidity: 'all',
    }));
    expect(last.known).toBe(true);
  });
});

describe('resolvePlaneWords', () => {
  it('prefers the editable plane verbatim', () => {
    const edit = new Uint16Array([5, 6, 7]);
    expect(resolvePlaneWords(edit, null, 3)).toBe(edit);
  });
  it('packs the engine baseline (raw indices) to solid words', () => {
    const out = resolvePlaneWords(null, new Uint8Array([0, 1]), 2);
    expect(out[0]).toBe(0); // air stays air
    expect(out[1]).toBe(packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' }));
  });
  it('all-air when neither source present', () => {
    expect(Array.from(resolvePlaneWords(null, null, 3))).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// ROADMAP §5.1 item 10: resolvePlaneWords must not hand back a plane shorter
// than the index space its consumers address.
//
// The consumers are rendered surfaces, so what is provable HERE is the index
// space and the drawing CALLS — OverlayRenderer takes a plain 2D context, so a
// recording stand-in drives the real method. Whether the resulting pixels look
// right on a real canvas, and the MapViewport hover readout (React, not
// reachable from node), are CDP-harness questions, not node ones.
// ---------------------------------------------------------------------------

/** A recording 2D-context stand-in — same pattern as classic-overlays.test.ts. */
function mockCtx() {
  const calls = { fillRect: 0, strokeRect: 0, stroke: 0 };
  const ctx = {
    lineWidth: 0, font: '', textAlign: '' as CanvasTextAlign, fillStyle: '', strokeStyle: '',
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {},
    moveTo() {}, lineTo() {},
    stroke() { calls.stroke++; },
    fillRect() { calls.fillRect++; },
    strokeRect() { calls.strokeRect++; },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Only the fields the collision overlay reads; the rest of Section is inert here. */
function sectionWith(p: Partial<Section>): Section {
  return {
    index: 0, name: 's', objects: [], rings: [], tiles: null,
    paletteRef: null, bgLayoutRef: null,
    tileGrid: {
      width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH,
      nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    },
    engineCollision: null, engineCollisionB: null,
    collisionEdit: null, collisionEditB: null,
    ...p,
  } as unknown as Section;
}

/** Both collision overlays on, everything else off. */
const BOTH_PLANES: OverlayOptions = {
  showObjects: false, showRings: false, showTileGrid: false, showBlockGrid: false,
  showChunkGrid: false, showCollision: true, showCollisionAngles: false,
  showCollisionPathB: true, showBgPlane: false, showStart: false, showPriority: false,
  occludeSprites: false, playAnimatedArt: false,
  showSolidBothPlanes: false, showCrossover: false,
  showScreenFrame: false,
};

/** A viewport that covers one whole section at 1:1 — every cell is in range. */
const WHOLE_SECTION = { x: 0, y: 0, width: SECTION_PIXEL_SIZE, height: SECTION_PIXEL_SIZE, zoom: 1 };

const SOLID = packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' });

beforeEach(() => resetPlaneLengthReports());

describe('resolvePlaneWords length contract', () => {
  it('pads a short editable plane to the requested length instead of returning it as-is', () => {
    const edit = new Uint16Array([SOLID, SOLID, SOLID]);
    const out = resolvePlaneWords(edit, null, 8);
    expect(out.length).toBe(8);
    expect(Array.from(out)).toEqual([SOLID, SOLID, SOLID, 0, 0, 0, 0, 0]);
  });

  it('reports a short editable plane loudly rather than degrading in silence', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      resolvePlaneWords(new Uint16Array(3), null, 8);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('[COLLISION_PLANE_LENGTH]');
      expect(String(spy.mock.calls[0][0])).toContain('3');
      expect(String(spy.mock.calls[0][0])).toContain('8');
    } finally { spy.mockRestore(); }
  });

  it('reports a short engine baseline too (its tail silently packs to air)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const out = resolvePlaneWords(null, new Uint8Array([1, 1]), 5);
      expect(out.length).toBe(5);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('[COLLISION_PLANE_LENGTH]');
    } finally { spy.mockRestore(); }
  });

  /**
   * ⚠ THE THREE ROWS ABOVE ARE ABOUT THE SHORT PLANE, and a plant-and-count
   * audit found the reporter's other two properties unheld
   * (docs/reviews/2026-09-09-guard-residue-validators.md). Both matter for the
   * same reason the reporter exists at all: this is a render path that must not
   * throw, so a console line is the ONLY signal a producer bug ever produces,
   * and a swallowed line is indistinguishable from a healthy plane.
   */
  it('reports an OVER-LONG editable plane, which it hands back untouched', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const edit = new Uint16Array(9);
      // Handing it back verbatim is correct and is the reason the report is the
      // only signal: nothing downstream reads past `length`, so a plane sized
      // for the wrong section looks exactly like a right one.
      expect(resolvePlaneWords(edit, null, 8)).toBe(edit);
      expect(spy, 'an over-long plane was accepted in silence').toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('[COLLISION_PLANE_LENGTH]');
    } finally { spy.mockRestore(); }
  });

  /**
   * THE SENTENCE NAMES WHICH WAY THE PLANE IS WRONG, and the two consequences
   * are opposite: a short plane renders cells that are not there as air, an
   * over-long one carries a tail nothing will ever read. A reporter that fires
   * on both and describes one is a reporter that sends a reader looking for
   * missing cells in a plane that has too many.
   */
  it('names the RIGHT consequence for each direction', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      resolvePlaneWords(new Uint16Array(3), null, 8);
      const shortMsg = String(spy.mock.calls[0][0]);
      expect(shortMsg).toContain('render as air');
      expect(shortMsg).not.toContain('unreachable');

      resolvePlaneWords(new Uint16Array(9), null, 8);
      const longMsg = String(spy.mock.calls[1][0]);
      expect(longMsg).toContain('unreachable');
      expect(longMsg).not.toContain('render as air');
    } finally { spy.mockRestore(); }
  });

  /**
   * THE ONCE-ONLY RULE IS PER FAULT, NOT PER SOURCE. The reporter deduplicates
   * so a per-frame render path states a fault once; if that key collapsed to
   * the source name, the SECOND distinct mismatch on the same source would be
   * swallowed for the life of the process, and the plane that silently renders
   * as air would be the one nobody was told about.
   */
  it('states a SECOND, different mismatch on the same source rather than deduplicating it away', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      resolvePlaneWords(new Uint16Array(3), null, 8);
      expect(spy).toHaveBeenCalledTimes(1);
      // The same fault again is correctly silent: that is the property the
      // dedupe exists for, and asserting it here is what stops the row below
      // from being met by a reporter that never deduplicates at all.
      resolvePlaneWords(new Uint16Array(3), null, 8);
      expect(spy).toHaveBeenCalledTimes(1);
      // A DIFFERENT fault on the same source is a different fault.
      resolvePlaneWords(new Uint16Array(4), null, 8);
      expect(spy, 'a second, different plane-length fault was swallowed by the once-only rule')
        .toHaveBeenCalledTimes(2);
    } finally { spy.mockRestore(); }
  });

  it('says nothing, and copies nothing, when the editable plane already matches', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const edit = new Uint16Array(SECTION_PLANE_WORDS);
      expect(resolvePlaneWords(edit, null, SECTION_PLANE_WORDS)).toBe(edit);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});

describe('SECTION_PLANE_WORDS is the space the overlay actually addresses', () => {
  it('bounds every index drawCollisionOverlay reads, with no row to spare', () => {
    // Derive the bound by MEASURING the consumer rather than restating a number:
    // record every numeric index drawCollisionOverlay reads off the plane.
    const reads: number[] = [];
    const backing = new Uint16Array(SECTION_PLANE_WORDS);
    const probe = new Proxy(backing, {
      get(t, p) {
        if (typeof p === 'string' && /^\d+$/.test(p)) reads.push(Number(p));
        return (t as unknown as Record<string, unknown>)[p as string];
      },
    }) as unknown as Uint16Array;

    const { ctx } = mockCtx();
    new OverlayRenderer().drawCollisionOverlay(ctx, WHOLE_SECTION, probe, 0, 0, SET, false, probe);

    expect(reads.length).toBeGreaterThan(0);
    let max = -1;
    for (const i of reads) if (i > max) max = i;
    // The furthest index is the last cell's top-left tile — the consumer's own
    // formula, (cr*2)*W + cc*2, at its loop maximum cr = H/2-1, cc = W/2-1.
    const lastCellTopLeft =
      (SECTION_TILES_HIGH / 2 - 1) * 2 * SECTION_TILES_WIDE + (SECTION_TILES_WIDE / 2 - 1) * 2;
    expect(max).toBe(lastCellTopLeft);
    // Nothing it reads may fall outside a plane of SECTION_PLANE_WORDS words...
    expect(max).toBeLessThan(SECTION_PLANE_WORDS);
    // ...and nothing much smaller would do: the furthest read sits in the final
    // cell row, so any bound a cell row lower truncates cells the artist sees.
    expect(max).toBeGreaterThan(SECTION_PLANE_WORDS - 2 * SECTION_TILES_WIDE);
  });
});

describe('OverlayRenderer.render with a mis-sized plane', () => {
  it('does not outline a dual-layer diff that only exists past a short plane B', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { ctx, calls } = mockCtx();
      const section = sectionWith({
        collisionEdit: new Uint16Array(SECTION_PLANE_WORDS),   // all air, full size
        collisionEditB: new Uint16Array(1000),                 // all air, but SHORT
      });
      new OverlayRenderer().render(ctx, [{ section, offsetX: 0, offsetY: 0 }], BOTH_PLANES, WHOLE_SECTION, undefined, SET);
      // Both planes are all-air, so no cell disagrees with the other and the
      // diff outline must never be drawn. Reading past the short plane yields
      // `undefined`, and `undefined !== 0` is true, so every cell past its end
      // used to be outlined as a dual-layer disagreement that is not there.
      expect(calls.strokeRect).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('still outlines a cell where the planes genuinely disagree (counter-check)', () => {
    const { ctx, calls } = mockCtx();
    const b = new Uint16Array(SECTION_PLANE_WORDS);
    b[0] = SOLID; // cell (0,0) only — plane A is air there
    const section = sectionWith({ collisionEdit: new Uint16Array(SECTION_PLANE_WORDS), collisionEditB: b });
    new OverlayRenderer().render(ctx, [{ section, offsetX: 0, offsetY: 0 }], BOTH_PLANES, WHOLE_SECTION, undefined, SET);
    expect(calls.strokeRect).toBe(1);
  });

  it('sizes the resolved planes from the section geometry, not from plane A’s array', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { ctx, calls } = mockCtx();
      const engineB = new Uint8Array(SECTION_PLANE_WORDS).fill(1); // every cell solid on B
      const section = sectionWith({
        engineCollision: new Uint8Array(1000),  // SHORT plane A: all air
        engineCollisionB: engineB,
      });
      new OverlayRenderer().render(ctx, [{ section, offsetX: 0, offsetY: 0 }], BOTH_PLANES, WHOLE_SECTION, undefined, SET);
      // Every cell disagrees (A air, B solid), so every cell the loop visits is
      // outlined. The expected count is drawCollisionOverlay's own loop bound:
      // cellsW * cellsH, with the viewport covering the whole section.
      const cells = (SECTION_TILES_WIDE / 2) * (SECTION_TILES_HIGH / 2);
      expect(calls.strokeRect).toBe(cells);
    } finally { spy.mockRestore(); }
  });
});

/**
 * `ensureCollisionPlanes` SEEDS EACH PLANE FROM ITS OWN BASELINE, and nothing
 * said so. A plant-and-count audit swapped plane B's source for plane A's and
 * the whole suite stayed green (docs/reviews/2026-09-09-guard-residue-validators.md).
 *
 * That is the one survivor in this cluster that corrupts DATA rather than
 * muting a report: seeding is a write path (paint, stamp, the agent's stamp
 * handler all reach it), it is idempotent, and a plane seeded from the wrong
 * baseline is then indistinguishable from one an author painted that way.
 * Nothing downstream can tell, because both planes are the same SHAPE.
 */
describe('ensureCollisionPlanes seeds each plane from its own baseline', () => {
  const baselines = (a: number, b: number) => ({
    engineCollision: new Uint8Array(SECTION_PLANE_WORDS).fill(a),
    engineCollisionB: new Uint8Array(SECTION_PLANE_WORDS).fill(b),
  }) as unknown as Section;

  it('plane B carries plane B\'s indices, not plane A\'s', () => {
    const s = baselines(1, 2);
    ensureCollisionPlanes(s);
    // The two baselines are DIFFERENT before anything is compared, so a row
    // that passes cannot be passing because both sides are the same value.
    expect(unpackCollisionCell(s.collisionEdit![0]).shape).toBe(1);
    expect(unpackCollisionCell(s.collisionEditB![0]).shape).toBe(2);
    expect(s.collisionEditB!.length).toBe(SECTION_PLANE_WORDS);
  });

  it('is idempotent: a plane already seeded is left alone', () => {
    const s = baselines(1, 2);
    ensureCollisionPlanes(s);
    const a = s.collisionEdit;
    const b = s.collisionEditB;
    ensureCollisionPlanes(s);
    expect(s.collisionEdit).toBe(a);
    expect(s.collisionEditB).toBe(b);
  });
});
