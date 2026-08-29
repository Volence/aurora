import { findMatchingBlockCells } from './collision-block';
import { cellTileIndices } from './collision-cell';
import { buildPlaneEntries, buildBothPlanesEntries, type BothPlanesEntries } from './both-planes-paint';
import type { CrossoverBrush, CollisionPlaneId } from './layer-transition';

export interface CellRC { cellCol: number; cellRow: number; }

/** The block cells a collision paint stroke writes — the single source of truth
 *  shared by the actual paint (MapViewport.paintCollisionCell) and the hover
 *  preview, so the preview can never drift from what painting does.
 *
 *  - brush > 1 → the N×N block area centred on the cell (clamped to the section),
 *    `propagate` is ignored,
 *  - brush 1 default (propagate: false) → only the clicked block ("just here"),
 *  - brush 1 + propagate (Alt) → every block in the section with the same
 *    tiles (reuse), explicit opt-in.
 *
 *  Returns { primary, all }: `primary` is the cell under the cursor; `all` is
 *  every cell that would change. Cell coords are in 16px-block units (0..cellsW). */
export function collisionPaintTargets(args: {
  cellCol: number; cellRow: number; brush: number; propagate: boolean;
  nametable: Uint16Array; width: number; cellsW: number; cellsH: number;
}): { primary: CellRC; all: CellRC[] } {
  const { cellCol, cellRow, brush, propagate, nametable, width, cellsW, cellsH } = args;
  const primary: CellRC = { cellCol, cellRow };

  if (brush > 1) {
    const half = brush >> 1;
    const all: CellRC[] = [];
    for (let dr = -half; dr <= half; dr++) {
      for (let dc = -half; dc <= half; dc++) {
        const cc = cellCol + dc, cr = cellRow + dr;
        if (cc >= 0 && cr >= 0 && cc < cellsW && cr < cellsH) all.push({ cellCol: cc, cellRow: cr });
      }
    }
    return { primary, all };
  }
  if (!propagate) return { primary, all: [primary] };
  return { primary, all: findMatchingBlockCells(nametable, cellCol, cellRow, width, cellsW, cellsH) };
}

export interface CollisionEditEntry { index: number; oldColl: number; newColl: number; }

/** Build the diffed set-collision-edit entries for filling a w*h CELL rectangle
 *  (16px units, top-left at x,y) of one collision plane with a single packed
 *  word — the core of the agent's paint_collision tool. Expands each cell to
 *  its four 8px sub-tile indices via cellTileIndices (same expansion
 *  MapViewport.paintCollisionCell uses), and skips indices already equal to
 *  `word` so the emitted command only touches what actually changes. Rect
 *  bounds are pre-validated by the caller (agent-handler). */
export function paintCollisionRectEntries(args: {
  x: number; y: number; w: number; h: number; word: number;
  plane: Uint16Array; tileWidth: number;
}): CollisionEditEntry[] {
  const { x, y, w, h, word, plane, tileWidth } = args;
  // Same rule as the interactive stroke, and deliberately the same function:
  // the agent surface writing a whole word where the brush owns only fourteen
  // bits would be the identical defect on a second road.
  return buildPlaneEntries(plane, collisionRectIndices(x, y, w, h, tileWidth), word);
}

/** Every 8px sub-tile index a w*h CELL rectangle covers, row-major. Split out of
 *  `paintCollisionRectEntries` because the "solid on both planes" road needs the
 *  SAME index set for two planes, and a second loop would be a second chance to
 *  disagree about what a rectangle covers. */
export function collisionRectIndices(
  x: number, y: number, w: number, h: number, tileWidth: number,
): number[] {
  const indices: number[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      for (const index of cellTileIndices(x + c, y + r, tileWidth)) indices.push(index);
    }
  }
  return indices;
}

/**
 * The agent's `paint_collision` when it names `plane: "both"` — the same
 * gesture the "A+B" chip drives on the human road, through the same builder.
 *
 * TWO ROADS, ONE RULE. The whole point of routing this through
 * `buildBothPlanesEntries` rather than calling `paintCollisionRectEntries`
 * twice is that the merge must happen against EACH plane's own destination
 * cell; two calls would be correct only by accident of both being written the
 * same way, and the agent road has already been the place where a second copy
 * of a paint rule drifted (docs/reviews/2026-08-29-agent-paint-priority.md).
 */
export function paintCollisionRectBothPlanes(args: {
  x: number; y: number; w: number; h: number; word: number;
  aimedPlane: Uint16Array; otherPlane: Uint16Array | null | undefined;
  tileWidth: number; bothPlanes: boolean;
  aimedPlaneId?: CollisionPlaneId;
  crossover?: CrossoverBrush;
}): BothPlanesEntries {
  return buildBothPlanesEntries({
    aimedPlaneWords: args.aimedPlane,
    otherPlaneWords: args.otherPlane,
    indices: collisionRectIndices(args.x, args.y, args.w, args.h, args.tileWidth),
    brushWord: args.word,
    bothPlanes: args.bothPlanes,
    aimedPlaneId: args.aimedPlaneId,
    crossover: args.crossover,
  });
}
