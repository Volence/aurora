// ═══════════════════════════════════════════════════════════════════════════
// BITS 15:14 OF AURORA'S PER-PLANE COLLISION CELL WORD ARE RESERVED.
// THIS IS THE ONLY MODULE IN AURORA THAT KNOWS THEIR BIT NUMBERS.
//
// ═══ THE HISTORY, IN ONE PARAGRAPH ═══
//
// From 2026-08-29 until 2026-09-26 these two bits were the painted LOOP
// CROSSOVER mark (1 = hand the player to path A, 2 = to path B, 3 illegal), and
// Aurora had a brush, a lens, a preview, an audit and agent parameters for it
// (all in this file's predecessor, `layer-transition.ts`). The OWNER then ruled
// (aeon `docs/decisions.jsonl` S2CLIP-PLANE-SWITCH, answered 2026-09-26T16:27:40Z,
// chose `line-table`) that layer-switch LINES are the engine's ONLY layer-switch
// mechanism, and aeon's LINES-EVERYWHERE parcel (aeon 19978b00) retired the marks.
// Aurora removed every writer of them in ROADMAP rows 223+224.
//
// ═══ WHAT AEON DOES WITH THEM NOW (read at aeon d3b98868) ═══
//
// `tools/collision_pipeline.py`:
//     PLANE_RESERVED_SHIFT = 14   # per-plane cell word ONLY
//     PLANE_RESERVED_MASK = 3
//     def plane_reserved_bits(cell_word): return (cell_word >> 14) & 3
// A NON-ZERO VALUE IS REFUSED, twice: `tools/ojz_strip_gen.py`'s preflight
// censuses every word of both plane files and names the cells, and
// `bake_plane_cell` raises on any word it bakes. The clip bake refuses by clip
// (rule C4). `test/collision/reserved-bits.test.ts` reads those constants out of
// aeon's published source instead of trusting this file.
//
// ═══ WHAT AURORA DOES WITH THEM ═══
//
//  • It NEVER WRITES a non-zero value. No brush, no agent parameter and no
//    encoder produces one: `packCollisionCell` stops at bit 13, and
//    `collisionPaintWord` masks the brush word to the fields the encoder owns.
//  • It NEVER SILENTLY CLEARS one either. A word read from disk keeps its bits
//    through load, every stroke (the unowned-bit preservation rule in
//    `core/editing/collision-word.ts`), undo and redo. Erasing someone's data to
//    make a refusal go away is the defect "Aurora refuses, not erases" forbids.
//  • It REPORTS them as an ERROR (`reserved-bits-audit.ts`) naming the cells,
//    and the aeon save REFUSES to write a plane that carries them, naming the
//    cells, so a stale value can never be carried to aeon by a save.
//  • The ONE gesture that clears them is explicit and names what it does: the
//    audit's "Clear retired marks" action (`clearReservedBitsEntries`), which
//    zeroes bits 15:14 ONLY, as one undo step. (Painting air or "Clear section"
//    also removes them, because those write a bare word on purpose.)
//
// ═══ WHICH WORD. A FACT THAT OUTLIVES THE CROSSOVER ═══
//
// `tools/collision_pipeline.py` carries TWO bakers over TWO word encodings.
// In the DONOR chunk-entry word (`bake_cell`), bits 15:14 are LIVE path-B
// solidity (`PATH_B_SOL_SHIFT = 14`). In Aurora's PER-PLANE word
// (`bake_plane_cell`), they are these reserved bits. Aurora only ever holds
// per-plane words; the distinction is recorded because the next person to
// meet these bits is one grep away from confusing the two.

import { packCollisionCell } from './collision-cell-word';

/** Bit position of the reserved field. aeon `PLANE_RESERVED_SHIFT`. */
export const PLANE_RESERVED_SHIFT = 14;
/** Width mask, pre-shift. aeon `PLANE_RESERVED_MASK`. */
export const PLANE_RESERVED_MASK = 0x3;
/** Every bit of the cell word the reserved field covers. DERIVED from the two
 *  above so a width change cannot leave it behind. */
export const PLANE_RESERVED_BITS = PLANE_RESERVED_MASK << PLANE_RESERVED_SHIFT;

/** Bits 15:14 of a per-plane cell word: 0 in every legal word. aeon
 *  `plane_reserved_bits`. An absent word (`undefined`) is 0 — callers that
 *  need to tell "no cell" from "a clean cell" check the index themselves. */
export function planeReservedBits(word: number | undefined): number {
  return ((word ?? 0) >> PLANE_RESERVED_SHIFT) & PLANE_RESERVED_MASK;
}

/** `word` with bits 15:14 zeroed and every other bit kept. The ONLY function in
 *  Aurora that changes these bits, and it can only clear them. */
export function withoutReservedBits(word: number): number {
  return word & ~PLANE_RESERVED_BITS & 0xFFFF;
}

export type CollisionPlaneId = 'a' | 'b';

/** The other collision plane. Re-exported by both-planes-paint.ts's
 *  `otherPlane`. */
export function otherPlaneId(p: CollisionPlaneId): CollisionPlaneId {
  return p === 'a' ? 'b' : 'a';
}

/**
 * The reserved field must not overlap anything `packCollisionCell` writes.
 *
 * DERIVED from the encoder (every field saturated), so the day it starts
 * writing bit 14 this stops being zero and `reserved-bits.test.ts` fails,
 * rather than a picture field and the reserved bits silently sharing a bit.
 */
export const RESERVED_OVERLAP_WITH_PACKED_FIELDS = PLANE_RESERVED_BITS
  & packCollisionCell({ shape: 0xFFFF, xFlip: true, yFlip: true, solidity: 'all' });
