/**
 * The donor marquee: every rectangle it can produce is on the 8-px cell grid
 * (aeon R6) and inside the crop (aeon R9). A CENSUS, not two cases: the drags
 * run over a lattice that includes off-grid, on-grid, outside-crop and reversed
 * points, so a snap that is right for the examples a person thinks of and wrong
 * at an edge has somewhere to show it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZoneManifest } from '../../src/core/formats/donors/donor-tree';
import {
  marqueeRect, marqueeReadout, onCollisionGrid, MARQUEE_SNAP_PX, COLLISION_QUANTUM_PX,
} from '../../src/core/formats/donors/donor-marquee';

const ZONE = resolve(__dirname, '../fixtures/donors/aeon-root/games/sonic4/data/donors/s2disasm/FXZ/zone.json');
const crop = parseZoneManifest(readFileSync(ZONE, 'utf8')).cropPx;

describe('the marquee snaps to 8 px and stays inside the crop', () => {
  it('a census of drags: every coordinate a multiple of 8, never outside the crop, never a cell short', () => {
    // Points from 37 px before the crop to 37 px past it, stepped by a prime so
    // every residue mod 8 is hit, both drag directions.
    const xs: number[] = [];
    for (let v = crop.x - 37; v <= crop.x + crop.w + 37; v += 173) xs.push(v);
    xs.push(crop.x, crop.x + crop.w, crop.x + crop.w - 1, crop.x + 7.5);
    const ys: number[] = [];
    for (let v = crop.y - 37; v <= crop.y + crop.h + 37; v += 211) ys.push(v);
    ys.push(crop.y, crop.y + crop.h, crop.y + crop.h - 1, crop.y + 0.25);
    let rects = 0;
    let nulls = 0;
    // Violations are COLLECTED and asserted once: an expect() per drag over
    // ~130k drags costs vitest's timeout, and a list names every failing drag.
    const bad: string[] = [];
    for (const ax of xs) for (const ay of ys) for (const bx of xs) for (const by of ys) {
      const r = marqueeRect({ x: ax, y: ay }, { x: bx, y: by }, crop);
      if (r === null) { nulls++; continue; }
      rects++;
      const tag = `(${ax},${ay})->(${bx},${by}) = ${JSON.stringify(r)}`;
      if (r.x % MARQUEE_SNAP_PX || r.y % MARQUEE_SNAP_PX || r.w % MARQUEE_SNAP_PX || r.h % MARQUEE_SNAP_PX) bad.push(`off-grid ${tag}`);
      if (r.w <= 0 || r.h <= 0) bad.push(`empty ${tag}`);
      if (r.x < crop.x || r.y < crop.y || r.x + r.w > crop.x + crop.w || r.y + r.h > crop.y + crop.h) bad.push(`outside crop ${tag}`);
      // Never a cell short: every in-crop point the drag touched is covered.
      for (const [px, py] of [[ax, ay], [bx, by]]) {
        const inside = px >= crop.x && px < crop.x + crop.w && py >= crop.y && py < crop.y + crop.h;
        if (inside && !(px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h)) bad.push(`drops (${px},${py}) ${tag}`);
      }
    }
    expect(bad.slice(0, 10), `${bad.length} violation(s)`).toEqual([]);
    // Anti-vacuous: the lattice produced both outcomes and many rectangles.
    expect(rects).toBeGreaterThan(1000);
    expect(nulls).toBeGreaterThan(0);
  });

  it('a drag wholly outside the crop gives no rectangle', () => {
    expect(marqueeRect({ x: crop.x + crop.w + 10, y: crop.y }, { x: crop.x + crop.w + 90, y: crop.y + 40 }, crop)).toBeNull();
  });

  it('the readout states the rectangle in pixels and in cells', () => {
    expect(marqueeReadout({ x: 16, y: 136, w: 64, h: 24 })).toBe('x 16 y 136 w 64 h 24 px (8 x 3 cells)');
  });

  it('the collision-grid advisory is about the ORIGIN on the 16-px quantum', () => {
    expect(COLLISION_QUANTUM_PX).toBe(16);
    expect(onCollisionGrid({ x: 32, y: 16, w: 8, h: 8 })).toBe(true);
    expect(onCollisionGrid({ x: 40, y: 16, w: 16, h: 16 })).toBe(false);
    expect(onCollisionGrid({ x: 32, y: 8, w: 16, h: 16 })).toBe(false);
  });
});
