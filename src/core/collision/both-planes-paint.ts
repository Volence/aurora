// SOLID ON BOTH PLANES — ONE GESTURE, TWO PLANES, ONE UNDO STEP.
//
// ═══ WHY THIS NEEDS NO NEW FIELD, AND WHY THAT IS THE WHOLE POINT ═══
//
// Aeon's Route P proposes "solid on both planes" as a THIRD CELL STATE
// (borrowed from Sonic Worlds Next, `docs/research/loops-and-sprite-rotation.md`
// §10.4), riding in the spare cell-word bits alongside the layer transition.
//
// It does not need to be a state, and reading it as one would have blocked half
// this parcel behind an encoding it never required. In aeon's per-plane model
// each plane carries its OWN 16-bit word (`bake_plane_cell`, written for
// Aurora), and the runtime keeps two collision arrays that `Collision_GetType`
// selects between with `d3.b = layer`. "Solid on both planes" is therefore
// ALREADY EXPRESSIBLE, exactly: the same shape and solidity present in both
// arrays. There is nothing a third state could say that two words cannot.
//
// What was actually missing was never expressiveness — it was the GESTURE.
// Aeon measured OJZ act 1 section 0 and found plane B a strict subset of plane
// A: 644 cells solid on A and air on B, and ZERO the other way (§4.2). That
// asymmetry is not carelessness, it is the predictable signature of an author
// painting shared ground into a second plane by hand and stopping partway. The
// fix is one stroke that writes both planes, which is this file.
//
// ═══ THE TRAP THIS MODULE EXISTS TO CLOSE ═══
//
// The obvious implementation computes the merged word ONCE and writes it to
// both planes:
//
//     const w = collisionPaintWord(brush, planeA[i]);   // WRONG
//     entriesA.push({ index: i, oldColl: planeA[i], newColl: w });
//     entriesB.push({ index: i, oldColl: planeB[i], newColl: w });
//
// That copies PLANE A'S UNOWNED BITS ONTO PLANE B. `collisionPaintWord` merges
// the brush's fields onto the DESTINATION cell's other bits — so the answer is
// per-destination, and there are two destinations. A single merge silently
// makes plane B's reserved bits equal plane A's, which is the collision-word
// preservation defect wearing a new hat: not "the stroke dropped bits it did
// not own" but "the stroke INVENTED bits it did not own, from the wrong cell".
//
// It is also invisible on every act shipped so far, for the same reason the
// original defect was: every cell in every act holds zero in those bits, so a
// correct implementation and this broken one emit identical artifacts. A test
// that does not author non-zero unowned bits into BOTH PLANES, DIFFERENTLY,
// cannot tell them apart.
//
// So: ONE decider (`collisionPaintWord`), called ONCE PER PLANE, against that
// plane's own cell. `buildPlaneEntries` is the only way this parcel builds a
// plane's entries, and both roads — the interactive brush and the agent's
// `paint_collision` — go through it.
//
// ═══ THE STATE IS DERIVED, NOT STORED ═══
//
// Because "both" is a gesture rather than a field, nothing records that the
// author *said* "both". What CAN be observed is the fact itself — this cell is
// solid on plane A and solid on plane B — and that is what `solidOnBothPlanes`
// computes and what the lens draws. That is strictly better than a stored flag:
// a flag could disagree with the data, and this cannot.

import { collisionPaintWord, type CollisionCellWrite } from '../editing/collision-word';
import { unpackCollisionCell } from './collision-cell-word';
import { otherPlaneId, type CrossoverBrush, type CollisionPlaneId } from './layer-transition';

export type { CollisionPlaneId };

/** The plane a "both planes" stroke also writes, given the one it is aimed at.
 *  Re-exported from the seam rather than re-spelled: the crossover legality
 *  rules turn on the same ternary and two copies could drift. */
export const otherPlane = otherPlaneId;

/**
 * Diffed entries writing `brushWord` into `plane` at every index in `indices`.
 *
 * THE MERGE IS AGAINST THIS PLANE'S OWN CELL — that is the whole reason this
 * function takes a plane rather than a precomputed word. See the docblock.
 *
 * Duplicate indices are harmless: the second visit sees the plane unmodified
 * (this builds a diff, it does not apply it) and produces an identical entry.
 * Callers that can generate duplicates should not, but the result stays
 * consistent if they do.
 */
export function buildPlaneEntries(
  plane: ArrayLike<number>,
  indices: Iterable<number>,
  brushWord: number,
  /** The crossover tri-state and the plane it is being written on. `keep` (the
   *  default) leaves the destination's crossover alone, which is what an
   *  ordinary shape stroke means. */
  crossover: CrossoverBrush = 'keep',
  planeId?: CollisionPlaneId,
): CollisionCellWrite[] {
  const entries: CollisionCellWrite[] = [];
  for (const index of indices) {
    const oldColl = plane[index] ?? 0;
    const newColl = collisionPaintWord(brushWord, oldColl, crossover, planeId);
    if (oldColl !== newColl) entries.push({ index, oldColl, newColl });
  }
  return entries;
}

/** Both planes' entries for one "solid on both planes" stroke. `other` is empty
 *  when the stroke was aimed at a single plane, so a caller never branches on
 *  the mode twice. */
export interface BothPlanesEntries {
  /** Entries for the plane the brush is aimed at (`collisionPaintPlane`). */
  aimed: CollisionCellWrite[];
  /** Entries for `otherPlane(aimed)`. Empty unless the stroke wrote both. */
  other: CollisionCellWrite[];
}

/**
 * The whole gesture, once: build the aimed plane's entries and — when
 * `bothPlanes` — the other plane's, each merged against its own cells.
 *
 * `otherPlaneWords` may be `undefined` (a section whose second plane has not
 * been seeded). That yields an empty `other` rather than a throw, because a
 * caller that has not seeded the plane has nothing to write and the aimed half
 * of the stroke is still correct. Every interactive path calls
 * `ensureCollisionPlanes` first, so in practice it is present.
 */
export function buildBothPlanesEntries(args: {
  aimedPlaneWords: ArrayLike<number>;
  otherPlaneWords: ArrayLike<number> | undefined | null;
  indices: Iterable<number>;
  brushWord: number;
  bothPlanes: boolean;
  /** Aimed plane id — required once the crossover brush authors, because the
   *  legal crossover value is per-plane. */
  aimedPlaneId?: CollisionPlaneId;
  crossover?: CrossoverBrush;
}): BothPlanesEntries {
  const crossover = args.crossover ?? 'keep';
  // `indices` may be a one-shot iterator; materialise before the second pass.
  const idx = [...args.indices];
  const aimed = buildPlaneEntries(
    args.aimedPlaneWords, idx, args.brushWord, crossover, args.aimedPlaneId);
  if (!args.bothPlanes || !args.otherPlaneWords) return { aimed, other: [] };
  // ⚠ THE OTHER PLANE GETS THE OTHER PLANE'S CROSSOVER VALUE, not a copy.
  //
  // `hand-off` means "leave THIS plane", so on plane A it is TO_B and on plane
  // B it is TO_A — and that per-plane pair IS the two-way loop crossover
  // (anchor §3.3). Copying the aimed plane's value here would write TO_B into
  // plane B's own word, which is a SELF-MARK: a provable no-op that aeon's bake
  // refuses with a hard build error (rule R2). `crossoverFor` is what makes
  // that unreachable, and it is called per plane precisely so it can be.
  //
  // This is the same shape as the unowned-bit trap this file opens with — one
  // value computed once and broadcast to two planes is wrong BOTH times, for
  // two independent reasons.
  const otherId = args.aimedPlaneId === undefined ? undefined : otherPlane(args.aimedPlaneId);
  return {
    aimed,
    other: buildPlaneEntries(args.otherPlaneWords, idx, args.brushWord, crossover, otherId),
  };
}

// ═══ THE PER-CELL FORM OF THE SAME TWO RULES ════════════════════════════════
//
// `get_collision_region` hands an agent one word PER CELL, and
// `paint_collision`'s `words` form feeds them straight back
// (docs/reviews/2026-08-29-collision-read.md). Combining that with `plane:
// "both"` and with the crossover brush is what
// docs/reviews/2026-08-29-paint-collision-reconcile.md decides, and the answer
// is that NEITHER of this file's two rules changes — only the brush word does,
// per cell:
//
//   1. the merge is against EACH PLANE'S OWN destination cell (so plane A's
//      crossover bits can never land in plane B's word), and
//   2. the other plane gets `crossoverFor(brush, otherPlane(aimed))`, never a
//      copy of the aimed plane's value (so `hand-off` on "both" is the two-way
//      pair and never a self-mark).
//
// Both are inherited here by CALLING the same `buildPlaneEntries` /
// `otherPlane` this file already uses, once per cell instead of once per
// rectangle — not by restating them.

/** One cell's worth of a per-cell write: the 8px sub-tile indices the cell
 *  covers, and the word to paint into it. `word: null` is
 *  `get_collision_region`'s report for a cell whose four sub-tiles DISAGREE,
 *  and means "leave this cell alone" — on BOTH planes when the stroke writes
 *  both, because a caller who declined to name a word for a cell has declined
 *  it for the cell, not for one plane of it. */
export interface CellWordPlan { indices: readonly number[]; word: number | null }

/** What a per-cell build produced: the writes, and how many cells were declined
 *  (`word: null`). `skipped` counts CELLS, never sub-tile entries, so it is
 *  directly comparable with the `w*h` the caller asked for. */
export interface PlaneCellEntries { entries: CollisionCellWrite[]; skipped: number }

/**
 * Diffed entries for writing one word PER CELL into a single plane.
 *
 * Deliberately a loop over `buildPlaneEntries` rather than a second merge loop:
 * the fill form and the per-cell form are two forms of ONE tool, and two merge
 * loops would be two rules free to disagree — the exact defect
 * `paintCollisionRectBothPlanes` was written to avoid on the other axis.
 *
 * The crossover brush applies to every cell this call WRITES and to no other:
 * a `null` cell is skipped entirely, so it keeps its existing crossover even
 * under `clear`. That falls out of "null means leave this cell alone" rather
 * than being a separate rule, and it is what makes a `hand-off` over a region
 * read back from a mixed area mark exactly the cells it also reshaped.
 */
export function buildPlaneCellEntries(
  plane: ArrayLike<number>,
  cells: Iterable<CellWordPlan>,
  crossover: CrossoverBrush = 'keep',
  planeId?: CollisionPlaneId,
): PlaneCellEntries {
  const entries: CollisionCellWrite[] = [];
  let skipped = 0;
  for (const cell of cells) {
    if (cell.word === null || cell.word === undefined) { skipped++; continue; }
    for (const e of buildPlaneEntries(plane, cell.indices, cell.word, crossover, planeId)) {
      entries.push(e);
    }
  }
  return { entries, skipped };
}

/** `buildBothPlanesEntries` for the per-cell form. `skipped` is ONE number, not
 *  one per plane, because the null cells are the same cells on both planes —
 *  they come from a single `words` array. */
export function buildBothPlanesCellEntries(args: {
  aimedPlaneWords: ArrayLike<number>;
  otherPlaneWords: ArrayLike<number> | undefined | null;
  cells: Iterable<CellWordPlan>;
  bothPlanes: boolean;
  aimedPlaneId?: CollisionPlaneId;
  crossover?: CrossoverBrush;
}): BothPlanesEntries & { skipped: number } {
  const crossover = args.crossover ?? 'keep';
  // `cells` may be a one-shot iterator; materialise before the second pass.
  const cells = [...args.cells];
  const aimed = buildPlaneCellEntries(
    args.aimedPlaneWords, cells, crossover, args.aimedPlaneId);
  if (!args.bothPlanes || !args.otherPlaneWords) {
    return { aimed: aimed.entries, other: [], skipped: aimed.skipped };
  }
  const otherId = args.aimedPlaneId === undefined ? undefined : otherPlane(args.aimedPlaneId);
  const other = buildPlaneCellEntries(args.otherPlaneWords, cells, crossover, otherId);
  return { aimed: aimed.entries, other: other.entries, skipped: aimed.skipped };
}

/**
 * Is this cell solid on BOTH collision planes?
 *
 * The DERIVED fact the lens draws. "Solid" is the same predicate the engine
 * applies: a cell contributes a surface when its solidity is anything but
 * `none` AND it has a shape. Air (shape 0) is never solid whatever its bits
 * say — `selectedCollisionWord` guarantees air is the bare word, but a cell
 * poked by hand or arriving from an older file need not be, so the shape is
 * checked rather than assumed.
 *
 * A `undefined` word (an unseeded plane, an index past the end) is not solid,
 * which makes "the second plane does not exist yet" read as "not both" — the
 * honest answer, and the one that makes the half-finished-copy case visible.
 */
export function solidOnBothPlanes(wordA: number | undefined, wordB: number | undefined): boolean {
  return isSolidCell(wordA) && isSolidCell(wordB);
}

/** One plane's cell contributes a surface. Exported because the lens's
 *  "solid on exactly one plane" complement needs the same predicate and must
 *  not restate it. */
export function isSolidCell(word: number | undefined): boolean {
  if (word === undefined) return false;
  const cell = unpackCollisionCell(word);
  return cell.shape !== 0 && cell.solidity !== 'none';
}
