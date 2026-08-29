// THE ONE PLACE A COLLISION STROKE DECIDES WHAT SIXTEEN BITS TO WRITE.
//
// Sibling of `brush-word.ts`, which landed hours earlier for the nametable's
// version of exactly this problem. The two files are deliberately the same
// shape: a rule stated once, the encoder left to encode, and every paint site
// reduced to a call. Consistency between them is worth more than any local
// improvement either could make alone.
//
// ═══ WHAT WENT WRONG ═══
//
// `packCollisionCell` writes FOUR fields into a 16-bit cell word — shape 0..9,
// xFlip 10, yFlip 11, solidity 12..13 — and leaves 15:14 alone. Every paint
// site then wrote the palette's word WHOLESALE:
//
//     const oldColl = ce[index];
//     if (oldColl !== word) entries.push({ index, oldColl, newColl: word });
//
// `newColl: word`. Not "the fields the brush owns, merged onto the cell" — the
// entire cell, replaced. Whatever bits 15:14 held, a stroke zeroed them, and
// the applier (`history.ts`, `arr[e.index] = e.newColl`) is a plain assignment
// that faithfully carries the loss through undo/redo.
//
// ═══ WHY NOBODY SAW IT, AND WHY A TEST WON'T EITHER UNLESS IT TRIES ═══
//
// Every cell in every shipped act holds ZERO in bits 15:14. So on real content
// a correct writer and a totally broken one emit the same artifact: `0`
// preserved and `0` truncated are the same sixteen bits. A test that paints
// over real cells and checks the result is not a weak test, it is a VACUOUS
// one — it can only ever be green.
//
// Every preservation test against this module must therefore author a
// destination with NON-ZERO bits outside the owned mask, deliberately, and say
// so. `collision-word.test.ts` states that rule at the top of the file and
// every row obeys it.
//
// ═══ THE RULE: THE BRUSH OWNS ITS FIELDS, THE CELL KEEPS THE REST ═══
//
// This is a rule about the WORD, not about any feature that might one day use
// the spare bits. It is stated as a mask complement rather than as "preserve
// bits 15:14" precisely so that it stays true when the layout changes: the day
// `packCollisionCell` starts writing bit 14, `COLLISION_CELL_OWNED_MASK` widens
// on its own and the brush starts owning it, with no edit here.
//
// The nametable's answer was per-field and tri-state (`brush-word.ts` explains
// why flips come from the brush but priority defaults to keep). The collision
// word's answer is simpler, and the difference is not arbitrary: every field
// the collision brush can write is DEPICTED IN THE PICKER — shape, both flips
// and solidity are all shown by the palette and chosen by the author before the
// stroke. There is no collision analogue of "priority, which nothing on screen
// depicts", so no field here needs a keep/on/off. The brush authors everything
// it owns; the cell keeps everything it does not.
//
// ═══ AIR IS A SHAPE, NOT A CLEAR ═══
//
// Painting air (shape 0) still goes through this function, so it still
// preserves 15:14. Erasing the shape out of a cell is a statement about the
// shape; it is not a statement about a field the shape does not own. The
// gesture that DOES mean "empty this cell entirely" is CollisionPalette's
// Clear, which writes a bare 0 on purpose and is documented there as the only
// escape hatch that can ever remove an unowned-bit value.
//
// ═══ WHAT 15:14 ACTUALLY ARE — GROUNDED, AND DELIBERATELY NOT ENCODED ═══
//
// Read at a committed revision, never from a sibling checkout's working tree:
//
//     git -C ../aeon show b76576ea:tools/collision_pipeline.py
//
// That file carries BOTH bakers, and they disagree about 15:14 on purpose:
//
//   • `bake_cell(block_word, ...)` — the legacy single-word encoding, where ONE
//     word drives both collision paths. There, `PATH_B_SOL_SHIFT = 14` and bits
//     15:14 ARE path-B solidity. They are a live, fully-defined field.
//   • `bake_plane_cell(cell_word, ...)` — the encoding Aurora's data actually
//     feeds, added because "Aurora paints each of the engine's TWO collision
//     planes independently, so each cell carries its OWN word". There, 13:12 is
//     THIS plane's solidity and 15:14 are read by nothing.
//
// So in Aurora's per-plane word the bits are genuinely unassigned — path B's
// solidity lives in plane B's OWN bits 13:12, which is what
// collision-cell-word.ts's docblock means by "the full Sonic 4 solidity bits =
// this 2-bit field on plane A's word + the 2-bit field on plane B's word".
//
// ═══ UPDATE 2026-08-29 — 15:14 NOW MEAN SOMETHING, AND THIS FILE STILL DOES
//     NOT KNOW WHAT ═══
//
// Aeon committed the anchor (`git -C ../aeon show
// aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md`): in Aurora's per-plane word, bits
// 15:14 are the LOOP CROSSOVER field. They remain path-B solidity in the donor
// word, exactly as the block above warned, and the two must never be crossed.
//
// THE DIVISION OF LABOUR IS UNCHANGED AND THAT IS THE POINT. This module still
// spells no bit number: `core/collision/layer-transition.ts` is the seam that
// knows them, and `collisionPaintWord` below asks it for a NAMED value. What
// changed is only that the seam is now filled.
//
// AND THE OLD RULE PAID FOR ITSELF ON THE DAY THE FIELD ARRIVED. Because the
// preservation rule was stated as a MASK COMPLEMENT — "the brush owns its
// fields, the cell keeps the rest" — rather than as "preserve bits 15:14",
// every collision stroke, stamp, paste and agent call in the editor has been
// carrying crossovers correctly since the moment they existed, with no edit.
// `keep` is therefore the free default rather than a feature. A literal
// `0xC000` anywhere in that parcel would have had to be revisited here today.

import { packCollisionCell } from '../collision/collision-cell-word';
import {
  crossoverFor, withCrossover,
  type CrossoverBrush, type CollisionPlaneId,
} from '../collision/layer-transition';

/**
 * Every bit `packCollisionCell` can set — the brush's fields, and nothing else.
 *
 * DERIVED FROM THE ENCODER, never typed. Handing it a saturated shape and every
 * flag on makes it OR together each field's full width, so the mask is whatever
 * the encoder currently writes. A literal here would be the copied-pin defect
 * this repo keeps paying for: move a field and the constant stays confidently
 * wrong. (`packCollisionCell` masks its own shape argument, which is why an
 * out-of-range `0xFFFF` is the right probe rather than a lie.)
 *
 * At the layout of 2026-08-28 this evaluates to 0x3FFF:
 *   shape 0x03FF | xFlip 0x0400 | yFlip 0x0800 | (solidity 3 << 12) 0x3000
 * matching aeon's BLOCK_ID_MASK / CHUNK_XFLIP_BIT / CHUNK_YFLIP_BIT /
 * PATH_A_SOL_SHIFT at collision_pipeline.py rev b76576ea. The test asserts that
 * agreement rather than trusting it.
 */
export const COLLISION_CELL_OWNED_MASK = packCollisionCell({
  shape: 0xFFFF, xFlip: true, yFlip: true, solidity: 'all',
});

/** The complement within 16 bits: everything a stroke must leave alone. */
export const COLLISION_CELL_UNOWNED_MASK = (~COLLISION_CELL_OWNED_MASK) & 0xFFFF;

/**
 * The word a collision stroke should write into `oldWord`'s cell.
 *
 * `brushWord` is what the palette selected (`selectedCollisionWord`); `oldWord`
 * is READ, not passed through — its unowned bits are the other half of the
 * answer. A caller with nothing there (an out-of-range index reads `undefined`)
 * contributes 0, which is what an absent cell means.
 *
 * The brush word is masked too, so a caller that hands over a word with stray
 * high bits cannot smuggle them past the rule.
 */
export function collisionPaintWord(
  brushWord: number,
  oldWord: number | undefined,
  /**
   * What the stroke does to the destination's LOOP CROSSOVER field
   * (bits 15:14 of the per-plane word — see core/collision/layer-transition.ts,
   * the one module allowed to know that).
   *
   * DEFAULTS TO `keep`, AND `keep` IS A NO-OP HERE BY CONSTRUCTION. The
   * crossover bits are outside `COLLISION_CELL_OWNED_MASK`, so the preservation
   * rule above already carries them across untouched. That is not a
   * coincidence to be relied on quietly — the test asserts it — but it does
   * mean this parcel INHERITED the fix rather than needing one, which is the
   * clearest possible argument for having stated the 2026-08-28 rule as a mask
   * complement instead of as "preserve bits 15:14".
   *
   * `plane` is required whenever the brush authors, because the legal value
   * depends on which plane the word belongs to. There is no way to call this
   * that produces a self-mark — the value is DERIVED from (brush, plane) and
   * never supplied, which is also why value 3 is unreachable from here.
   * ⚠ Rule R2 says a self-mark is a hard build error in aeon's bake. As of
   * 2026-08-29 that is SPECIFIED AND NOT IMPLEMENTED: the bake does not read
   * bits 15:14. Keep this derivation honest on its own merits, not because
   * something downstream is expected to catch a mistake — nothing is.
   */
  crossover: CrossoverBrush = 'keep',
  plane?: CollisionPlaneId,
): number {
  const merged = ((brushWord & COLLISION_CELL_OWNED_MASK)
    | ((oldWord ?? 0) & COLLISION_CELL_UNOWNED_MASK)) & 0xFFFF;
  if (crossover === 'keep') return merged;
  if (plane === undefined) {
    // A caller that authors without naming a plane has asked for something this
    // function cannot answer. THROW rather than defaulting: silently picking a
    // plane here would author a self-mark half the time, and a self-mark is a
    // build failure in aeon rather than a visible editor defect.
    throw new Error('collisionPaintWord: a crossover brush that authors must name its plane');
  }
  const value = crossoverFor(crossover, plane);
  return value === null ? merged : withCrossover(merged, value);
}

/** The bits of `word` that no field of the collision encoding owns. 0 for every
 *  cell in every act shipped so far — which is exactly why a test that does not
 *  author them itself proves nothing. */
export function unownedCollisionBits(word: number | undefined): number {
  return (word ?? 0) & COLLISION_CELL_UNOWNED_MASK;
}

/**
 * How many cells of a plane carry unowned bits.
 *
 * Used by the one gesture that unavoidably discards them — CollisionPalette's
 * Reset to engine, whose destination is a baked per-cell BYTE that cannot carry
 * them (aeon `bake_plane_cell` interns on `(heights, angle, solidity)` only, so
 * there is nothing in baked data to revert TO). Discarding may be unavoidable;
 * doing it silently is not, so the count goes in the command description.
 */
export function countCellsCarryingUnownedBits(plane: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < plane.length; i++) if (unownedCollisionBits(plane[i]) !== 0) n++;
  return n;
}

/** One diffed cell write, as `set-collision-edit` carries it. Structurally the
 *  same record `collision-paint.ts` builds; declared here so the two whole-plane
 *  builders below do not have to import from a paint module they precede. */
export interface CollisionCellWrite { index: number; oldColl: number; newColl: number; }

// ═══ CLEAR: THE ONE GESTURE THAT MAY WIPE AN UNOWNED FIELD ═══════════════════
//
// DECIDED, not inherited. `clearSectionEntries` writes a bare 0 — unowned bits
// included — and it is the only writer in the editor that does.
//
// The argument is not "that is what it did before". It is that Clear is the
// single gesture whose stated intent is the WHOLE CELL rather than a field of
// it. Every other writer means something narrower: a stroke means "this shape,
// this solidity", a stamp means "this source cell", a reset means "the engine's
// baseline". Only Clear means "empty". Preservation is the rule for writers
// that mean something narrower than the cell, and Clear does not.
//
// The consequence of deciding the other way is what settles it: if Clear also
// preserved 15:14, the editor would contain NO gesture that could ever remove a
// value from them. A section the author had explicitly emptied would still be
// carrying state that nothing on screen depicts and nothing in the UI can
// reach — invisible, undeletable residue. That is a strictly worse failure than
// losing a field to a command that is named "Clear collision", is scoped to one
// plane of one section, is invoked deliberately, and whose undo restores every
// cell EXACTLY, because `oldColl` captures the full sixteen bits.
export const COLLISION_CLEAR_WORD = 0;

/** Diffed entries that empty one collision plane. See the block above for why
 *  this — alone among the writers — discards unowned bits. */
export function clearCollisionEntries(plane: ArrayLike<number>): CollisionCellWrite[] {
  const entries: CollisionCellWrite[] = [];
  for (let i = 0; i < plane.length; i++) {
    const oldColl = plane[i] ?? 0;
    if (oldColl !== COLLISION_CLEAR_WORD) entries.push({ index: i, oldColl, newColl: COLLISION_CLEAR_WORD });
  }
  return entries;
}

// ═══ RESET TO ENGINE: DISCARD IS UNAVOIDABLE, SILENCE IS NOT ═════════════════
//
// The engine baseline is a per-cell BYTE. aeon's `bake_plane_cell`
// (collision_pipeline.py @ b76576ea) ends in
// `attrset.intern(heights, angle, solidity)` — three things, none of which is
// bits 15:14 — so a baked plane cannot carry them and there is nothing in
// baked data to revert TO. `resolvePlaneWords` unpacks that byte into a word
// with shape + solidity and zeros everywhere else, which is the honest
// representation of a baseline that never had the field.
//
// So Reset to engine ALWAYS discards unowned bits, and no amount of care here
// changes that. What can change is whether it happens quietly. The count of
// cells about to lose them goes into the command description, which is the
// text the undo stack shows — so the discard is named at the moment it is
// recorded, and is undoable from that same list.
export interface CollisionResetPlan {
  entries: CollisionCellWrite[];
  /** Cells whose unowned bits this reset destroys. Non-zero ⇒ say so. */
  discardedUnownedCells: number;
}

/**
 * Diffed entries reverting one plane to its engine baseline, plus the count of
 * cells that lose unowned bits by doing so.
 *
 * `engineWords` is sized by the section geometry by the caller, never by the
 * baseline's own length — a short baseline would otherwise read `undefined`
 * past its end and write it into the command (ROADMAP §5.1 item 10).
 */
export function resetToEngineEntries(
  plane: ArrayLike<number>, engineWords: ArrayLike<number>,
): CollisionResetPlan {
  const entries: CollisionCellWrite[] = [];
  let discardedUnownedCells = 0;
  for (let i = 0; i < plane.length; i++) {
    const oldColl = plane[i] ?? 0;
    const newColl = engineWords[i] ?? 0;
    if (oldColl === newColl) continue;
    if (unownedCollisionBits(oldColl) !== 0 && unownedCollisionBits(newColl) === 0) discardedUnownedCells++;
    entries.push({ index: i, oldColl, newColl });
  }
  return { entries, discardedUnownedCells };
}
