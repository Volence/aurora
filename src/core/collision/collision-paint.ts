import { findMatchingBlockCells } from './collision-block';
import { cellTileIndices } from './collision-cell';
import {
  buildPlaneEntries, buildBothPlanesEntries, buildPlaneCellEntries, buildBothPlanesCellEntries,
  type BothPlanesEntries, type CellWordPlan,
} from './both-planes-paint';

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

// ═══ THERE IS NO SINGLE-PLANE FORM, AND THAT IS THE DESIGN ══════════════════
//
// `paintCollisionRectEntries` and `paintCollisionCellEntries` used to sit here,
// one per form, each returning one plane's entries. They were DELETED on
// 2026-09-08 (lens row COLLISION-PAINT-DEAD-FUNCTIONS) because nothing in the
// app called either: `agent-handler`'s `paint-collision` reaches
// `paintCollisionRectBothPlanes` / `paintCollisionCellsBothPlanes` for EVERY
// plane argument, `bothPlanes` being false for `'a'` and `'b'`, and
// `MapViewport` calls `buildBothPlanesEntries` directly. Their only callers were
// their own tests, and their docblocks called them "the core of the agent's
// paint_collision tool" and "the write half of get_collision_region" IN THE
// PRESENT TENSE, which is the defect: a comment asserting a role the code does
// not have is believed, and it made four test files read as coverage of the
// shipping path when they covered a branch of it that does not exist.
//
// SO IF YOU WANT ONE PLANE: call the both-planes form with `bothPlanes: false`,
// which is what production does, and read `.aimed`. That is one road for one
// gesture, which is this module's whole rule (see `paintCollisionRectBothPlanes`).
// `CollisionEditEntry` went with them: it was a second, identical declaration of
// `CollisionCellWrite` (editing/collision-word.ts), which is what the live
// builders return.

/** Every 8px sub-tile index a w*h CELL rectangle covers, row-major. Split out
 *  because the "solid on both planes" road needs the SAME index set for two
 *  planes, and a second loop would be a second chance to disagree about what a
 *  rectangle covers. */
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
 * THE AGENT'S `paint_collision`, FILL FORM, FOR EVERY PLANE ARGUMENT. With
 * `bothPlanes: true` it is `plane: "both"`, the same gesture the "A+B" chip
 * drives on the human road through the same builder; with `bothPlanes: false` it
 * is `plane: "a"` or `"b"` and `other` comes back empty, so the handler never
 * branches on the mode twice. That is why there is no separate single-plane
 * entry point: see the note above `collisionRectIndices`.
 *
 * TWO ROADS, ONE RULE. The whole point of routing this through
 * `buildBothPlanesEntries` rather than calling a single-plane builder
 * twice is that the merge must happen against EACH plane's own destination
 * cell; two calls would be correct only by accident of both being written the
 * same way, and the agent road has already been the place where a second copy
 * of a paint rule drifted (docs/reviews/2026-08-29-agent-paint-priority.md).
 */
export function paintCollisionRectBothPlanes(args: {
  x: number; y: number; w: number; h: number; word: number;
  aimedPlane: Uint16Array; otherPlane: Uint16Array | null | undefined;
  tileWidth: number; bothPlanes: boolean;
}): BothPlanesEntries {
  return buildBothPlanesEntries({
    aimedPlaneWords: args.aimedPlane,
    otherPlaneWords: args.otherPlane,
    indices: collisionRectIndices(args.x, args.y, args.w, args.h, args.tileWidth),
    brushWord: args.word,
    bothPlanes: args.bothPlanes,
  });
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
 * `paint_collision`'s PER-CELL form, and the write half of
 * `get_collision_region` — for one plane (`bothPlanes: false`, which is what the
 * handler passes for `'a'` and `'b'`) and for two, the combination the two
 * parcels' merge had to decide
 * (docs/reviews/2026-08-29-paint-collision-reconcile.md).
 *
 * ⚠ THIS IS A DECIDER (docs/reviews/2026-08-28-collision-word-preservation.md §3),
 * and deliberately the SAME KIND as the fill form it sits beside. `words[i]` is
 * a packed cell word meaning shape + flips + solidity, exactly as
 * `paint_collision`'s `word` does — it is not a whole-cell transfer out of a
 * source plane the way a chunk stamp or a clipboard paste is. Two forms of one
 * tool that classified differently would be two rules for one gesture, free to
 * disagree; so this goes through `collisionPaintWord` like every other decider,
 * the brush's fields are masked to the fields it owns, and the DESTINATION
 * cell's unowned bits survive. (This paragraph and the two below were the
 * docblock of `paintCollisionCellEntries`, the single-plane form deleted on
 * 2026-09-08 for having no caller; the rules are the live path's and are kept
 * where the live path is.)
 *
 * The consequence is worth stating because it bounds the round trip: reading a
 * region and writing it back OVER ITSELF is exact, because each cell's unowned
 * bits are its own. Reading a region and writing it SOMEWHERE ELSE carries the
 * owned fields only — the destination keeps whatever it had in 15:14. That is
 * the rule working, not a lossy copy: a decider is not a transfer.
 *
 * Bits 15:14 in `words[i]` are therefore IGNORED (masked off like every other
 * unowned bit). They are RESERVED (core/collision/reserved-bits.ts): this road
 * can neither write a non-zero value into them nor erase the destination's.
 *
 * `words.length` must equal `w * h` (row-major); the caller validates that
 * along with the rectangle.
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
}): BothPlanesEntries & { skipped: number } {
  return buildBothPlanesCellEntries({
    aimedPlaneWords: args.aimedPlane,
    otherPlaneWords: args.otherPlane,
    cells: collisionRectCells(args.x, args.y, args.w, args.h, args.tileWidth, args.words),
    bothPlanes: args.bothPlanes,
  });
}
