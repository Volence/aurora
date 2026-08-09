import { findMatchingBlockCells } from './collision-block';
import { cellTileIndices } from './collision-cell';

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
  const entries: CollisionEditEntry[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      for (const index of cellTileIndices(x + c, y + r, tileWidth)) {
        const oldColl = plane[index];
        if (oldColl !== word) entries.push({ index, oldColl, newColl: word });
      }
    }
  }
  return entries;
}
