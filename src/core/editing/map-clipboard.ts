import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { Section } from '../model/s4-types';

/** A copied map region: art + both collision planes, footprint-aligned to 16px
 *  (2-tile) blocks so cells never straddle a paste boundary. */
export interface MapClipboard {
  widthTiles: number;   // even, snapped to 16px blocks
  heightTiles: number;  // even
  nametable: Uint16Array;    // widthTiles*heightTiles, row-major
  collisionA: Uint16Array;   // (w/2)*(h/2)
  collisionB: Uint16Array;
}

export type PasteLayers = 'both' | 'art' | 'collision';

/** Snap a tile-coord drag rect to 16px block boundaries (round OUT so the
 *  marquee always covers what was dragged), clamped to the section. Corners
 *  may arrive in any order. */
export function snapMarquee(c0: number, r0: number, c1: number, r1: number):
  { col: number; row: number; w: number; h: number } {
  let minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  let minR = Math.min(r0, r1), maxR = Math.max(r0, r1);

  // Clamp to the section BEFORE snapping — an out-of-bounds drag endpoint
  // must not push the snapped rect past the section edge.
  minC = Math.max(0, Math.min(minC, SECTION_TILES_WIDE - 1));
  maxC = Math.max(0, Math.min(maxC, SECTION_TILES_WIDE - 1));
  minR = Math.max(0, Math.min(minR, SECTION_TILES_HIGH - 1));
  maxR = Math.max(0, Math.min(maxR, SECTION_TILES_HIGH - 1));

  const col = Math.floor(minC / 2) * 2;
  const row = Math.floor(minR / 2) * 2;
  const endCol = Math.min(SECTION_TILES_WIDE, Math.ceil((maxC + 1) / 2) * 2);
  const endRow = Math.min(SECTION_TILES_HIGH, Math.ceil((maxR + 1) / 2) * 2);

  return { col, row, w: endCol - col, h: endRow - row };
}

/** Capture art + both collision planes from a section region (tile coords,
 *  pre-snapped/even). Missing/unseeded collision planes read as air. */
export function copyFromSection(section: Section, col: number, row: number,
  w: number, h: number): MapClipboard {
  const nametable = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const srcIdx = (row + r) * SECTION_TILES_WIDE + (col + c);
      nametable[r * w + c] = section.tileGrid.nametable[srcIdx];
    }
  }

  const cellsW = w >> 1, cellsH = h >> 1;
  const collisionA = new Uint16Array(cellsW * cellsH);
  const collisionB = new Uint16Array(cellsW * cellsH);
  const planeA = section.collisionEdit ?? null;
  const planeB = section.collisionEditB ?? null;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tlCol = col + cx * 2, tlRow = row + cy * 2;
      const srcIdx = tlRow * SECTION_TILES_WIDE + tlCol;
      const outIdx = cy * cellsW + cx;
      collisionA[outIdx] = planeA ? planeA[srcIdx] : 0;
      collisionB[outIdx] = planeB ? planeB[srcIdx] : 0;
    }
  }

  return { widthTiles: w, heightTiles: h, nametable, collisionA, collisionB };
}
