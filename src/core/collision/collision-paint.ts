import { findMatchingBlockCells } from './collision-block';
import { cellTileIndices } from './collision-cell';
import {
  buildPlaneEntries, buildBothPlanesEntries, buildPlaneCellEntries, buildBothPlanesCellEntries,
  type BothPlanesEntries, type CellWordPlan,
} from './both-planes-paint';
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
 * ⚠ UPDATED 2026-08-29 BY THE MERGE, AND THE UPDATE IS THE SHARP EDGE.
 * Bits 15:14 are no longer "a field nothing names" — layer-transition.ts gave
 * them a name (the LOOP CROSSOVER) hours after this function was written. The
 * rule above is unchanged and still correct, but its consequence now has teeth:
 * a `words` array read out of a region carrying crossovers and written
 * ELSEWHERE arrives with NO crossovers, because the value in `words[i]`'s bits
 * 15:14 is masked off like every other unowned bit and the destination's own
 * value is kept. That is not a defect to fix here — a per-cell word is a brush
 * word, and the crossover is authored by the `crossover` PARAMETER, per plane,
 * so that a self-mark stays unreachable. But an agent cannot read this file, so
 * `paint_collision`'s description says it in those words.
 *
 * `words.length` must equal `w * h` (row-major); the caller validates that
 * along with the rectangle.
 */
export function paintCollisionCellEntries(args: {
  x: number; y: number; w: number; h: number; words: (number | null)[];
  plane: Uint16Array; tileWidth: number;
  /** The loop-crossover tri-state, and the plane it is written on. Defaults to
   *  `keep`, which is a no-op by construction. It applies to every cell this
   *  call WRITES; a `null` cell is skipped entirely and therefore keeps its
   *  crossover even under `clear`. See both-planes-paint.ts. */
  crossover?: CrossoverBrush; planeId?: CollisionPlaneId;
}): CollisionCellPaintPlan {
  const { x, y, w, h, words, plane, tileWidth } = args;
  return buildPlaneCellEntries(
    plane, collisionRectCells(x, y, w, h, tileWidth, words), args.crossover, args.planeId);
}

/** A w*h CELL rectangle paired cell-by-cell with `words`, row-major — the
 *  per-cell counterpart of `collisionRectIndices`, and split out for the same
 *  reason: the "solid on both planes" road needs the SAME cell plan for two
 *  planes, and a second loop would be a second chance to disagree about which
 *  sub-tiles a cell covers or which word belongs to it. */
export function collisionRectCells(
  x: number, y: number, w: number, h: number, tileWidth: number, words: (number | null)[],
): CellWordPlan[] {
  const cells: CellWordPlan[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cells.push({
        indices: cellTileIndices(x + c, y + r, tileWidth),
        word: words[r * w + c] ?? null,
      });
    }
  }
  return cells;
}

/**
 * `paint_collision`'s PER-CELL form when it also names `plane: "both"` — the
 * combination the two parcels' merge had to decide
 * (docs/reviews/2026-08-29-paint-collision-reconcile.md).
 *
 * It is implemented rather than refused because its meaning is forced, not
 * chosen: `plane: "both"` already means "write A and B in one undo step, each
 * cell merged against its OWN plane's word", and `words` already means "one
 * brush word per cell instead of one for the rectangle". Composing them changes
 * neither rule — the same cell plan is built once and handed to each plane's
 * own merge, exactly as the fill form hands one index list to each plane's own
 * merge. There is no third behaviour for it to have.
 *
 * The nulls are the same cells on both planes (they come from one `words`
 * array), so `skipped` is one number and a skipped cell keeps BOTH planes'
 * existing words.
 */
export function paintCollisionCellsBothPlanes(args: {
  x: number; y: number; w: number; h: number; words: (number | null)[];
  aimedPlane: Uint16Array; otherPlane: Uint16Array | null | undefined;
  tileWidth: number; bothPlanes: boolean;
  aimedPlaneId?: CollisionPlaneId;
  crossover?: CrossoverBrush;
}): BothPlanesEntries & { skipped: number } {
  return buildBothPlanesCellEntries({
    aimedPlaneWords: args.aimedPlane,
    otherPlaneWords: args.otherPlane,
    cells: collisionRectCells(args.x, args.y, args.w, args.h, args.tileWidth, args.words),
    bothPlanes: args.bothPlanes,
    aimedPlaneId: args.aimedPlaneId,
    crossover: args.crossover,
  });
}
