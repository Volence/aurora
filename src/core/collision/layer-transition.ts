// ═══════════════════════════════════════════════════════════════════════════
// THE ENCODING SEAM. THIS IS THE ONLY MODULE IN AURORA THAT KNOWS A BIT NUMBER
// FOR THE LOOP CROSSOVER FIELD. Everything else refers to a crossover by name.
//
// ═══ THE ANCHOR ═══
//
//     git -C ../aeon show aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md
//
// Read at a COMMITTED revision, never through the peer's working tree. That
// document is the cross-repo contract; the constants below are transcribed from
// its §3.1/§3.2 and cross-checked against `tools/collision_pipeline.py` by
// `test/collision/layer-transition.test.ts`, which parses the peer blob rather
// than trusting this file.
//
// ═══ WHICH WORD. THIS IS THE FACT THE PREVIOUS ATTEMPT GOT WRONG ═══
//
// `tools/collision_pipeline.py` contains TWO BAKERS over TWO DIFFERENT 16-bit
// word encodings that happen to share a file:
//
//   • `bake_cell` — the sonic_hack DONOR chunk-entry word. There, bits 15:14
//     are `PATH_B_SOL_SHIFT` — LIVE path-B solidity. Aurora never writes this
//     word and must never touch those bits.
//   • `bake_plane_cell` — AURORA'S PER-PLANE cell word, the one
//     `section_N.collattr.bin` / `.collattrb.bin` carry and the one
//     `apply_editor_collision_overlay` feeds. There, bits 15:14 are the
//     crossover field and nothing else.
//
// A design doc once said "bits 15:14 are free" without naming the baker, a
// grep for `0xC000` missed `PATH_B_SOL_SHIFT = 14` because the pipeline shifts
// by a named constant, and the conclusion survived only by luck. Writing a
// crossover into the donor word would silently make ordinary ground solid on a
// path nobody painted. See docs/reviews/2026-08-28-collision-word-preservation.md
// §2 and the anchor's §3.1.
//
// EVERY word Aurora produces is a per-plane word, so this module is safe by
// construction — but the distinction is recorded here because the next person
// to find these bits is one grep away from the same mistake.
//
// ═══ WHY THE VALUES ARE WHAT THEY ARE ═══
//
// 0 = none, 1 = go to path A, 2 = go to path B, 3 = RESERVED AND ILLEGAL.
//
// 3 is reserved because of this repo's own sentinel finding: top-of-range is a
// sentinel across aeon's encodings, so a producer that CLAMPS a value into
// range lands on it. If 3 meant "toggle" — the semantically obvious fourth
// value — a clamping bug would author the most destructive value in the set.
// The bake hard-errors on 3 instead, which turns that class of bug into a build
// failure. So: NEVER CLAMP INTO THIS FIELD. `withCrossover` takes a typed value
// and cannot express 3; `readCrossover` REPORTS a 3 it finds rather than
// normalising it away, because silently rewriting someone's data to hide a
// build error is worse than the build error.
//
// ═══ WHY THERE IS NO "TOGGLE" VALUE, AND WHY EACH PLANE CARRIES ITS OWN ═══
//
// Both planes carry the field independently, and the engine reads it from THE
// PLANE THE PLAYER IS CURRENTLY ON — `Collision_GetType(x, y, layer)` only ever
// fetches the current plane's byte. That is what makes a two-way loop work with
// absolute values: the player's current layer IS the history that
// `loops-and-sprite-rotation.md` §4.5.1 correctly said the decision depends on.
//
// So a toggle is redundant: the per-plane pair {TO_B on A, TO_A on B} already
// behaves as one, in both traversal directions, at the same two cells.
//
// ═══ ⚠ SELF-MARKS ARE ILLEGAL, AND AURORA MAKES THEM UNREACHABLE ═══
//
// A plane-A cell carrying TO_A is provably a no-op — to read it you must
// already be on plane A — and aeon's bake REFUSES it (anchor §7 rule R2, at
// `apply_editor_collision_overlay`, the only site that knows which plane a word
// came from). It is a HARD BUILD ERROR, not a warning.
//
// The consequence for the editor is stronger than "add a guard": PER PLANE THE
// FIELD HAS ONLY TWO LEGAL VALUES — none, and "hand off to the other plane".
// So Aurora's brush is modelled as exactly that (`CrossoverBrush`), and the
// illegal state is not representable rather than being caught. `crossoverFor`
// is the one place a plane turns into a value; `isSelfMark` exists for the
// agent road, which takes the raw value and must refuse it loudly.
//
// ⚠ AND A CONTRADICTION IN THE ANCHOR, REPORTED RATHER THAN PAPERED OVER.
// Anchor §3.3 justifies per-plane values over a toggle by saying the pair
// "{TO_B, TO_B} is an absolute one-way force that a toggle cannot express" —
// but TO_B on plane B is exactly the self-mark the SAME SECTION declares
// illegal and R2 refuses. The conclusion survives; the example does not. A
// one-way force is {TO_B on A, NONE on B}, because a player already on B needs
// no mark to stay there. Aurora encodes the force that way, and an author who
// followed §3.3's literal example would hard-error the build.

import { packCollisionCell } from './collision-cell-word';

// ── The field, transcribed from the anchor §3.1/§3.2 ─────────────────────────

/** Bit position of the crossover field in AURORA'S PER-PLANE cell word.
 *  `XOVER_SHIFT` in `tools/collision_pipeline.py` (anchor §3.1). */
export const CROSSOVER_SHIFT = 14;
/** Width mask, pre-shift. `XOVER_MASK` in the pipeline. */
export const CROSSOVER_VALUE_MASK = 0x3;
/** Every bit of the cell word this field owns. DERIVED from the two above so a
 *  width change cannot leave it behind. */
export const CROSSOVER_BITS = CROSSOVER_VALUE_MASK << CROSSOVER_SHIFT;

/** The raw encoded values. `RESERVED` is illegal and the bake hard-errors on
 *  it; it is named so code can DETECT one, never so code can write one. */
export const CROSSOVER_NONE = 0;
export const CROSSOVER_TO_A = 1;
export const CROSSOVER_TO_B = 2;
export const CROSSOVER_RESERVED = 3;

/** What a cell does to the layer of an object standing on it, BY NAME. */
export type Crossover = 'none' | 'to-a' | 'to-b';

/** What `readCrossover` returns for a cell holding the reserved value 3. A
 *  distinct member of the union, not folded into `none`, because the whole
 *  point of reserving 3 is that its presence is a defect somebody must see. */
export type CrossoverRead = Crossover | 'reserved';

export type CollisionPlaneId = 'a' | 'b';

const VALUE_BY_NAME: Record<Crossover, number> = {
  none: CROSSOVER_NONE, 'to-a': CROSSOVER_TO_A, 'to-b': CROSSOVER_TO_B,
};
const NAME_BY_VALUE: readonly CrossoverRead[] = ['none', 'to-a', 'to-b', 'reserved'];

/** The crossover a per-plane cell word carries. `reserved` means the cell holds
 *  the illegal value 3 — reported, never normalised away. */
export function readCrossover(word: number | undefined): CrossoverRead {
  return NAME_BY_VALUE[((word ?? 0) >> CROSSOVER_SHIFT) & CROSSOVER_VALUE_MASK]!;
}

/**
 * `word` with its crossover field replaced.
 *
 * Takes a NAMED value, so the reserved 3 is not expressible: there is no
 * argument this function accepts that produces it. That is the anti-clamp rule
 * enforced by the type system rather than by a range check that could be
 * relaxed later.
 */
export function withCrossover(word: number, crossover: Crossover): number {
  return ((word & ~CROSSOVER_BITS) | (VALUE_BY_NAME[crossover] << CROSSOVER_SHIFT)) & 0xFFFF;
}

// ── Legality ────────────────────────────────────────────────────────────────

/** The crossover value that hands an object OFF this plane — the only non-`none`
 *  value that plane's word may legally carry (see the self-mark block above). */
export function handOffFrom(plane: CollisionPlaneId): Crossover {
  return plane === 'a' ? 'to-b' : 'to-a';
}

/** The plane this crossover sends an object to, or null for `none`. */
export function crossoverTarget(c: Crossover): CollisionPlaneId | null {
  if (c === 'to-a') return 'a';
  if (c === 'to-b') return 'b';
  return null;
}

/** A no-op mark the bake REFUSES: a plane's word telling you to go where you
 *  already are. Aurora's brush cannot produce one; the agent road can ask for
 *  one and must be refused. */
export function isSelfMark(plane: CollisionPlaneId, c: Crossover): boolean {
  return crossoverTarget(c) === plane;
}

/** Why this crossover may not be written on this plane, or null when it may.
 *  Prose rather than a boolean because every refusal in this parcel has to be
 *  loud, and the caller should not have to compose the sentence. */
export function crossoverRefusal(plane: CollisionPlaneId, c: Crossover): string | null {
  if (!isSelfMark(plane, c)) return null;
  return `A plane-${plane.toUpperCase()} cell cannot carry "${c}": to read that mark the player `
    + `must already be on path ${plane.toUpperCase()}, so it can never fire. Aeon's bake refuses `
    + `it (rule R2) and the build hard-errors. Write it on plane ${otherPlaneId(plane).toUpperCase()} instead.`;
}

/** The other collision plane. Declared here beside the legality rules that turn
 *  on it, and re-exported by both-planes-paint.ts's `otherPlane`. */
export function otherPlaneId(p: CollisionPlaneId): CollisionPlaneId {
  return p === 'a' ? 'b' : 'a';
}

// ── The brush ───────────────────────────────────────────────────────────────

/**
 * What a collision stroke does to the destination cell's crossover.
 *
 * TRI-STATE WITH `keep` AS THE DEFAULT, and the reasoning is `brush-word.ts`'s
 * verbatim, because it is the same situation: a crossover is a property of the
 * CELL'S ROLE IN A LOOP, not of the shape being painted, and nothing in the
 * shape picker depicts it. An author retouching a slope is choosing a picture;
 * they are saying nothing about layer handoff, and an editor that answered for
 * them is the defect that parcel exists to prevent. `keep` falls out of
 * `collisionPaintWord`'s existing preservation rule at no cost — the crossover
 * bits are outside `COLLISION_CELL_OWNED_MASK`, so a stroke has ALWAYS
 * preserved them since 2026-08-28. That is this parcel inheriting a fix rather
 * than needing one.
 *
 * `hand-off` rather than `to-a`/`to-b` is the load-bearing choice. Per plane
 * there are only two legal values, so the brush that offers two cannot author
 * an illegal one. It also means the SAME armed brush does the right thing on
 * either plane, which is what makes a two-way loop two strokes instead of a
 * lookup table the author has to hold in their head.
 */
export type CrossoverBrush = 'keep' | 'clear' | 'hand-off';

/** The value this brush writes on this plane, or null for `keep`. Cannot return
 *  a self-mark: `hand-off` is defined as the value that leaves the plane. */
export function crossoverFor(brush: CrossoverBrush, plane: CollisionPlaneId): Crossover | null {
  if (brush === 'keep') return null;
  if (brush === 'clear') return 'none';
  return handOffFrom(plane);
}

/** Does this brush AUTHOR the crossover field rather than leave it alone? The
 *  lens-surfacing rule turns on exactly this, and it lives here so the
 *  condition and the rule cannot drift — same shape as
 *  `brushAuthorsPriority`. */
export function crossoverBrushAuthors(brush: CrossoverBrush): boolean {
  return brush !== 'keep';
}

// ── The cross-check against the collision word's other fields ───────────────

/**
 * The crossover field must not overlap anything `packCollisionCell` writes.
 *
 * DERIVED, not asserted in prose: the mask comes from the encoder itself
 * (saturating every field), so the day `packCollisionCell` starts writing bit
 * 14 this stops being zero and the test blows up rather than two fields
 * silently sharing a bit. The 2026-08-28 parcel's whole method, reused.
 */
export const CROSSOVER_OVERLAP_WITH_PACKED_FIELDS = CROSSOVER_BITS
  & packCollisionCell({ shape: 0xFFFF, xFlip: true, yFlip: true, solidity: 'all' });
