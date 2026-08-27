// THE FACTOR DECODER — a packed `FACTOR_*` and a camera X, into a number of
// pixels of Plane scroll.
//
// ⚠ AURORA HAD NEVER TURNED A FACTOR INTO A NUMBER before this file. Every
// surface upstream carries a factor as a NAME (`'FACTOR_1_16'`) or as the packed
// triple (`{s1, s2, op}`) and passes it along — the panel labels it, the codec
// round-trips it, the schema bounds it. Nothing evaluated one, because nothing
// needed to until the map canvas had to show where a band would actually sit.
//
// ═══ THE DEFINITION IS THE ENGINE PROC, NOT THE FRACTION IN THE NAME ═══
//
// `FACTOR_3_4` looks like 0.75. That is a HINT. The definition is
// `packed(s1: 0, s2: 2, op: 1)` — `camX - (camX >> 2)` — and the two are not the
// same function of `camX`, because `>>` on the 68000 is `asr.w`: it rounds
// toward negative infinity, per TERM, before the terms are combined. At
// camX = 7, `7 - (7 >> 2)` is 6, while `7 * 3 / 4` is 5.25 and `floor(7*3/4)` is
// 5. All three differ. `decodeFactorScroll` is the first of those; the other two
// are not what the hardware does and are not offered.
//
// `factorRatio` exists for LABELS and for the agreement test only, and it is
// derived from the triple (`2^-s1 ± 2^-s2`), never parsed out of the name. The
// test in test/formats/effects-factor-decode.test.ts asserts that the ratio each
// published name's TRIPLE produces equals the fraction its NAME spells — so the
// hint and the definition are shown to agree rather than assumed to.
//
// ═══ THE SENTINEL, WHICH IS NOT A SHIFT ═══
//
// 15 is a SENTINEL in both shift fields and it means different things in each:
//
//   s1 == 15   the WHOLE factor is zero. The band is LOCKED and does not move,
//              at all, for any camera position. `Decode_Factor_A` branches to
//              `.locked` and returns 0 before it looks at s2 or at op.
//   s2 == 15   the factor is SINGLE-TERM: just `camX >> s1`, no second term and
//              no op.
//
// A decoder that treated 15 as an ordinary shift count would return
// `camX >> 15` for a locked band — which is 0 for a small positive camX and -1
// for any negative one. It would look almost right, and the band would creep by
// a pixel exactly when the camera crossed the origin. `EFFECTS_FACTOR_SENTINEL`
// is the number, named once, and `decodeFactorScroll` tests it before shifting
// on both arms.
//
// ═══ SIGN, AND THE NEGATION THIS FILE DOES NOT DO ═══
//
// `Decode_Factor_A` returns `-decode(camX, factor)`, because a VDP HScroll word
// is a NEGATED offset: an HScroll of `H` displaces the plane RIGHT by `H`, so
// the plane pixel under screen column `c` is `c - H`. With `H = -decode`, that
// pixel is `c + decode`.
//
// This function returns the un-negated `decode` — the plane's SCROLL, the number
// of pixels of Plane content that have passed the screen's left edge, which is
// what a preview needs to index its source with (`sourceX = scroll + column`).
// `hscrollWord` applies the engine's negation for anyone who wants the word the
// buffer would hold. Keeping the two apart named is deliberate: a sign error
// here is a background that scrolls the wrong way, which reads as "the art is
// mirrored" rather than as an arithmetic bug.

import type { EffectsFactor, EffectsFactorName, EffectsPackedFactor } from './scene';

/**
 * 15 — the sentinel that is not a shift count.
 *
 * In `s1`: the whole factor is zero (locked). In `s2`: the factor is
 * single-term. See the file docblock.
 */
export const EFFECTS_FACTOR_SENTINEL = 15;

/**
 * The published `FACTOR_*` set, as the packed triples aeon defines them.
 *
 * TRANSCRIBED FROM `aeon engine/level/parallax_dsl.emp:25-40` — the `packed(s1:,
 * s2:, op:)` call on each `pub const`, verbatim, in the order that file declares
 * them. The comment beside each is aeon's own.
 *
 * `FACTOR_LOCKED` and `FACTOR_0` are ONE VALUE with two spellings (parallax_dsl:
 * `pub const FACTOR_0 = FACTOR_LOCKED`), and both must be here: the schema's
 * enum publishes both names, and a lookup that only knew one would leave the
 * other resolving to undefined — a locked band that silently moved.
 */
export const EFFECTS_FACTOR_PACKED: Readonly<Record<EffectsFactorName, EffectsPackedFactor>> =
  Object.freeze({
    // $0FF — s1 15 -> factor 0 ("locked layer")
    FACTOR_LOCKED: Object.freeze({ s1: 15, s2: 15, op: 0 }) as EffectsPackedFactor,
    FACTOR_0: Object.freeze({ s1: 15, s2: 15, op: 0 }) as EffectsPackedFactor,
    FACTOR_1: Object.freeze({ s1: 0, s2: 15, op: 0 }) as EffectsPackedFactor,   // camX
    FACTOR_1_2: Object.freeze({ s1: 1, s2: 15, op: 0 }) as EffectsPackedFactor, // camX>>1
    FACTOR_1_4: Object.freeze({ s1: 2, s2: 15, op: 0 }) as EffectsPackedFactor, // camX>>2
    FACTOR_1_8: Object.freeze({ s1: 3, s2: 15, op: 0 }) as EffectsPackedFactor, // camX>>3
    FACTOR_1_16: Object.freeze({ s1: 4, s2: 15, op: 0 }) as EffectsPackedFactor, // camX>>4
    FACTOR_1_32: Object.freeze({ s1: 5, s2: 15, op: 0 }) as EffectsPackedFactor, // camX>>5
    FACTOR_3_4: Object.freeze({ s1: 0, s2: 2, op: 1 }) as EffectsPackedFactor,  // camX - camX>>2
    FACTOR_3_8: Object.freeze({ s1: 2, s2: 3, op: 0 }) as EffectsPackedFactor,  // camX>>2 + camX>>3
    FACTOR_3_16: Object.freeze({ s1: 3, s2: 4, op: 0 }) as EffectsPackedFactor, // camX>>3 + camX>>4
    FACTOR_5_8: Object.freeze({ s1: 1, s2: 3, op: 0 }) as EffectsPackedFactor,  // camX>>1 + camX>>3
    FACTOR_5_16: Object.freeze({ s1: 2, s2: 4, op: 0 }) as EffectsPackedFactor, // camX>>2 + camX>>4
    FACTOR_7_8: Object.freeze({ s1: 0, s2: 3, op: 1 }) as EffectsPackedFactor,  // camX - camX>>3
    FACTOR_7_16: Object.freeze({ s1: 1, s2: 4, op: 1 }) as EffectsPackedFactor, // camX>>1 - camX>>4
    FACTOR_15_16: Object.freeze({ s1: 0, s2: 4, op: 1 }) as EffectsPackedFactor, // camX - camX>>4
  });

/**
 * The 9-bit packed word aeon's `packed()` builds:
 * `bits 0-3 = s1, bits 4-7 = s2, bit 8 = op`.
 *
 * Aurora never needs to EMIT this — the editor JSON carries names and triples,
 * and `tools/effects_gen.py` does the packing. It is here because
 * `FACTOR_LOCKED == $0FF` is the one numeric fact aeon asserts about the
 * encoding in two separate files (`scene_dsl.emp`'s pin `ensure`), so it is the
 * cheapest independent check that this table's triples are the right triples.
 */
export function packFactor(f: EffectsPackedFactor): number {
  return ((f.op & 1) << 8) | ((f.s2 & 15) << 4) | (f.s1 & 15);
}

/**
 * A factor in either spelling, as the triple. `null` for a name this table does
 * not know — which cannot happen for a schema-valid document, and is returned
 * rather than thrown because the caller is a DRAW PASS: a viewport that stops
 * painting is worse than a band that does not move.
 */
export function resolveFactor(f: EffectsFactor): EffectsPackedFactor | null {
  if (typeof f !== 'string') return f;
  return EFFECTS_FACTOR_PACKED[f] ?? null;
}

/** True when this factor is the locked one — `s1` is the sentinel. */
export function factorIsLocked(f: EffectsFactor): boolean {
  const p = resolveFactor(f);
  return p === null || p.s1 === EFFECTS_FACTOR_SENTINEL;
}

/** `asr.w` — a 16-bit signed arithmetic right shift, rounding toward -inf. */
function asrW(value: number, shift: number): number {
  return toWord(value) >> shift;
}

/** Sign-extend to a 16-bit signed word, as every `.w` operation here does. */
function toWord(value: number): number {
  return ((value | 0) << 16) >> 16;
}

/**
 * The band's Plane scroll, in pixels, for this camera X.
 *
 * ⚠ THIS IS `Decode_Factor_A` (aeon `engine/level/parallax.emp:1665`), TERM FOR
 * TERM, with the proc's closing `neg.w` LEFT OFF — see the file docblock on
 * sign. `Decode_Factor_B` is the same body over the `factor_b` fields; there is
 * one function here because there is one algorithm there.
 *
 *     s1 == 15            -> 0                       (.locked)
 *     s2 == 15            -> camX >> s1              (.negate, single term)
 *     op == 0             -> (camX >> s1) + (camX >> s2)
 *     op == 1             -> (camX >> s1) - (camX >> s2)
 *
 * Every shift is `asr.w` and every combine is `add.w`/`sub.w`, so this works in
 * signed 16-bit throughout: a camera X is a signed word in the engine
 * (`move.l Camera_X, d0; swap d0`), every act extent is asserted <= $8000, and
 * the arithmetic wraps exactly where the hardware's does.
 */
export function decodeFactorScroll(camX: number, f: EffectsFactor): number {
  const p = resolveFactor(f);
  if (p === null) return 0;
  if (p.s1 === EFFECTS_FACTOR_SENTINEL) return 0;          // .locked
  const first = asrW(camX, p.s1);
  if (p.s2 === EFFECTS_FACTOR_SENTINEL) return toWord(first); // single term
  const second = asrW(camX, p.s2);
  return toWord(p.op === 1 ? first - second : first + second);
}

/**
 * The HScroll word the engine's buffer would hold — the negation
 * `Decode_Factor_A` ends with. Present so the relationship is written down
 * somewhere in Aurora rather than living only in a comment.
 */
export function hscrollWord(camX: number, f: EffectsFactor): number {
  return toWord(-decodeFactorScroll(camX, f));
}

/**
 * The factor as an exact rational `num/den`, derived from the TRIPLE.
 *
 * `2^-s1` for a single term, `2^-s1 ± 2^-s2` for two — reduced onto the common
 * denominator `2^max(s1,s2)`. Locked is `0/1`.
 *
 * ⚠ FOR LABELS AND FOR THE AGREEMENT TEST. It is NOT the decode: the decode
 * truncates each term separately (see the file docblock), so
 * `decodeFactorScroll(camX, f)` and `camX * num / den` differ by up to one pixel
 * per term. Anything that draws must call the decode.
 */
export function factorRatio(f: EffectsFactor): { num: number; den: number } {
  const p = resolveFactor(f);
  if (p === null || p.s1 === EFFECTS_FACTOR_SENTINEL) return { num: 0, den: 1 };
  if (p.s2 === EFFECTS_FACTOR_SENTINEL) return reduce(1, 1 << p.s1);
  const den = 1 << Math.max(p.s1, p.s2);
  const a = den >> p.s1;
  const b = den >> p.s2;
  return reduce(p.op === 1 ? a - b : a + b, den);
}

function reduce(num: number, den: number): { num: number; den: number } {
  const g = gcd(Math.abs(num), Math.abs(den)) || 1;
  return { num: num / g, den: den / g };
}

function gcd(a: number, b: number): number {
  while (b !== 0) { const t = a % b; a = b; b = t; }
  return a;
}

/** `1/16`, `3/4`, `locked` — the ratio as one short label. */
export function factorRatioLabel(f: EffectsFactor): string {
  const r = factorRatio(f);
  if (r.num === 0) return 'locked';
  return r.den === 1 ? `${r.num}` : `${r.num}/${r.den}`;
}
