import { findMatchingBlockCells } from './collision-block';
import { cellTileIndices } from './collision-cell';
import { collisionPaintWord } from '../editing/collision-word';

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
        const oldColl = plane[index]!;
        // Same rule as the interactive stroke, and deliberately the same
        // function: the agent surface writing a whole word where the brush owns
        // only fourteen bits would be the identical defect on a second road.
        const newColl = collisionPaintWord(word, oldColl);
        if (oldColl !== newColl) entries.push({ index, oldColl, newColl });
      }
    }
  }
  return entries;
}

/** `paintCollisionCellEntries`'s outcome — the writes, plus what it declined to
 *  write and why, because a silent skip in a per-cell write is indistinguishable
 *  from a cell that happened to already match. */
export interface CollisionCellPaintPlan {
  entries: CollisionEditEntry[];
  /** Cells whose requested word was null ("leave this one alone"). This is the
   *  form `get_collision_region` hands back for a cell whose four sub-tiles
   *  DISAGREE: there is no single word to restore, so the write half refuses to
   *  invent one, and says how often it did. */
  skipped: number;
}

/**
 * Build the diffed entries for writing ONE WORD PER CELL over a w*h CELL
 * rectangle — the per-cell counterpart of `paintCollisionRectEntries`, and the
 * write half of `get_collision_region`.
 *
 * ⚠ THIS IS A DECIDER (docs/reviews/2026-08-28-collision-word-preservation.md §3),
 * and deliberately the SAME KIND as the fill form it sits beside. `words[i]` is
 * a packed cell word meaning shape + flips + solidity, exactly as
 * `paint_collision`'s `word` does — it is not a whole-cell transfer out of a
 * source plane the way a chunk stamp or a clipboard paste is. Two forms of one
 * tool that classified differently would be two rules for one gesture, free to
 * disagree; so this goes through `collisionPaintWord` like every other decider,
 * the brush's fields are masked to the fields it owns, and the DESTINATION
 * cell's unowned bits survive.
 *
 * The consequence is worth stating because it bounds the round trip: reading a
 * region and writing it back OVER ITSELF is exact, because each cell's unowned
 * bits are its own. Reading a region and writing it SOMEWHERE ELSE carries the
 * owned fields only — the destination keeps whatever it had in 15:14. That is
 * the rule working, not a lossy copy: a decider is not a transfer.
 *
 * `words.length` must equal `w * h` (row-major); the caller validates that
 * along with the rectangle.
 */
export function paintCollisionCellEntries(args: {
  x: number; y: number; w: number; h: number; words: (number | null)[];
  plane: Uint16Array; tileWidth: number;
}): CollisionCellPaintPlan {
  const { x, y, w, h, words, plane, tileWidth } = args;
  const entries: CollisionEditEntry[] = [];
  let skipped = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const word = words[r * w + c];
      if (word === null || word === undefined) { skipped++; continue; }
      for (const index of cellTileIndices(x + c, y + r, tileWidth)) {
        const oldColl = plane[index]!;
        const newColl = collisionPaintWord(word, oldColl);
        if (oldColl !== newColl) entries.push({ index, oldColl, newColl });
      }
    }
  }
  return { entries, skipped };
}
