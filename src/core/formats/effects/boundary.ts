/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE `boundary` KEY'S CROSS-FIELD RULES — AND EVERY ONE OF THEM IS ADVISORY.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The schema (empyrean `c4a1da2`, AURORA_EFFECTS_SCHEMA.md §7.6) bounds every
 * field of `$defs.boundary` on its own and closes the object, so a document with
 * a `channel` of 4 or a `hi` of 224 is REFUSED at parse and at serialize by
 * `preset.ts` with nothing here involved. What JSON Schema cannot express is a
 * constraint over TWO fields, and this key has three of them.
 *
 * ═══ ⚠ NOTHING IN THIS FILE IS A REFUSAL, AND NOTHING HERE MAY BECOME THE ONLY
 * CHECK. ═══
 *
 * The contract says so in as many words: `lo <= hi` (aeon
 * `raster_dsl.emp:465-467`) and `line` within `[lo, hi]` (`:475-476`) are the
 * GENERATOR's to enforce, "the check the generator owes once both numbers live
 * in one document". Aurora MAY warn — an author who meets the refusal in the
 * editor is better off than one who meets it in a build log — and Aurora must
 * never present that warning as a guarantee, because:
 *
 *   • these predicates are Aurora's READING of aeon's ensures, not aeon's
 *     ensures. A reading can be stale, and a stale clearance is worse than no
 *     clearance: an author told it is fine stops looking.
 *   • the sweep-fit rule is ONE-DIRECTIONAL by the contract's own construction
 *     (`aeon-effects-channel-bands.json`'s `how_to_use`), so "does not exceed
 *     the band" is CANNOT TELL and never "fits".
 *
 * So every sentence produced here names itself an editor-side warning and names
 * who actually enforces the rule. `advisory: true` is on the type, not on a
 * comment, and `BoundaryAdvisory.enforced_by` is a field rather than prose so a
 * caller cannot paint the text and drop the attribution.
 *
 * ═══ THE FIT RULE IS NOT RE-DERIVED HERE ═══
 *
 * `2 * (256 >> amp_shift) <= hi - lo + 1` is `channel-bands.ts`'s, parsed out of
 * aeon's own sidecar sentence and cross-checked against the preset schema's
 * amplitude ladder at module load. This file supplies the BAND (from the
 * document, via `effectsChannelBandFromDocument`) and the TRAVEL (from the
 * ladder, via `anchorTravelPx`) and asks `anchorFitAgainstBand` for the verdict.
 * No constant, no formula and no comparison is restated below — which is the
 * whole reason those two functions were split out of `anchorBandFit`.
 */

import {
  EFFECTS_PRESET_MAX_PATCH,
  type EffectsPresetBoundary,
  type EffectsPreset,
  type EffectsPresetPatchMotion,
} from './preset';
import {
  anchorTravelPx,
  anchorFitAgainstBand,
  effectsChannelBandFromDocument,
  type AnchorBandFit,
} from './channel-bands';

/** One editor-side warning about a boundary, with the fact that it is one. */
export interface BoundaryAdvisory {
  /** A stable id, so a caller can order or suppress without matching on prose. */
  rule: 'lo-hi' | 'line-in-band' | 'sweep-travel' | 'no-motion';
  /**
   * ALWAYS TRUE. It is a field rather than a docblock so that a surface which
   * paints `text` cannot silently drop the fact that this is a warning; a
   * `false` here would be a type error, not a judgement call.
   */
  advisory: true;
  /** Who actually refuses this — never Aurora. Named in the sentence too. */
  enforced_by: string;
  /** The sentence, which says what is wrong and who checks it. */
  text: string;
}

const GENERATOR = "aeon's generator (tools/effects_gen.py) and the engine's own ensure";

/**
 * `lo <= hi`. The schema bounds each end to 3..223 independently and cannot
 * compare them, so `{lo: 200, hi: 100}` is a legal-shaped document that names an
 * empty band.
 */
function loHi(b: EffectsPresetBoundary): BoundaryAdvisory | null {
  if (!Number.isInteger(b.lo) || !Number.isInteger(b.hi) || b.lo <= b.hi) return null;
  return {
    rule: 'lo-hi',
    advisory: true,
    enforced_by: GENERATOR,
    text: `lo ${b.lo} is below hi ${b.hi}, so this boundary names an empty band and the anchor `
      + 'has nowhere to be patched to. This is an EDITOR-SIDE WARNING, not the refusal: the '
      + `schema bounds each end on its own and cannot compare them, so ${GENERATOR} `
      + '(raster_dsl.emp:465-467) is what actually rejects it. Saving is not blocked.',
  };
}

/**
 * `line` within `[lo, hi]`. `patchable()` refuses a template whose default fire
 * line sits outside the band it will be patched within — the line would be
 * corrected on the very first frame, so the authored default describes a state
 * that never renders.
 */
function lineInBand(b: EffectsPresetBoundary): BoundaryAdvisory | null {
  if (!Number.isInteger(b.line) || !Number.isInteger(b.lo) || !Number.isInteger(b.hi)) return null;
  if (b.lo > b.hi) return null; // `loHi` owns that one; two sentences for one defect is noise.
  if (b.line >= b.lo && b.line <= b.hi) return null;
  return {
    rule: 'line-in-band',
    advisory: true,
    enforced_by: GENERATOR,
    text: `line ${b.line} is outside this boundary's own band ${b.lo}..${b.hi}. The default line `
      + 'is where the boundary sits before any patch, and a default outside the band describes a '
      + 'state that never renders. This is an EDITOR-SIDE WARNING, not the refusal: JSON Schema '
      + `cannot compare two fields, so ${GENERATOR} (raster_dsl.emp:475-476) is what actually `
      + 'rejects it. Saving is not blocked.',
  };
}

/**
 * THE SWEEP-FIT RULE, ASKED OF THE DOCUMENT'S OWN BAND.
 *
 * ⚠ ONE-DIRECTIONAL, AND THE SILENCE IS NOT A CLEARANCE. `channel-bands.ts` has
 * no `fits` verdict at the type level and this function inherits that: it
 * returns a sentence for `cannot-fit` and NOTHING for `cannot-tell`. A caller
 * that renders "no warnings" as "this will work" is making a claim the contract
 * refuses to make.
 */
function sweepTravel(
  b: EffectsPresetBoundary, motion: EffectsPresetPatchMotion | null | undefined,
): BoundaryAdvisory | null {
  const sweep = motion?.sweep;
  if (sweep === undefined || sweep === null || !Number.isInteger(sweep.amp_shift)) return null;
  const band = effectsChannelBandFromDocument(b.channel, b.lo, b.hi, 'this preset document');
  if (band === null) return null; // `loHi` owns an inverted pair.
  const travelPx = anchorTravelPx(sweep.amp_shift);
  const fit: AnchorBandFit = anchorFitAgainstBand(band, travelPx);
  if (fit.verdict !== 'cannot-fit') return null;
  return {
    rule: 'sweep-travel',
    advisory: true,
    enforced_by: GENERATOR,
    text: `the sweep on patch channel ${b.channel} travels ${travelPx} screen lines peak-to-peak, `
      + `and this boundary's band ${b.lo}..${b.hi} is ${band.lines} lines. A sweep wider than its `
      + 'band leaves the band on every cycle: past hi the record is DROPPED and the tint vanishes '
      + 'for those frames; below lo it is clamped up and still drawn. This is an EDITOR-SIDE '
      + `WARNING, not the refusal: ${GENERATOR} owns it, and it is the check aeon's own note `
      + 'says belongs beside _check_patch_context now that both numbers live in one document. '
      + 'Saving is not blocked.',
  };
}

/**
 * A BOUNDARY THAT CANNOT MOVE — the advisory that is about a document rather
 * than about a value.
 *
 * `channel` is the index space of `patch_world_ys` and `patch_motion`. A
 * `boundary` alone is a perfectly legal document and a perfectly STILL one: the
 * schema requires neither positional key and the contract says so ("Pair it with
 * patch_world_ys[channel] and patch_motion[channel] in the same document to make
 * it move"). That is worth saying out loud precisely BECAUSE it is legal —
 * nothing refuses it anywhere, in Aurora or in aeon, so an author who expected
 * the shipped moving water and got a static line has no red anything to read.
 *
 * ⚠ SEEDED-BUT-NOT-SWEPT IS ALSO STILL. `patch_world_ys[c]` alone is a
 * stationary anchor (`preset.ts`'s own words); the motion is what sweeps it. So
 * this asks for BOTH, at THAT index, and names whichever is missing.
 */
function noMotion(preset: Partial<EffectsPreset>, b: EffectsPresetBoundary): BoundaryAdvisory | null {
  if (!Number.isInteger(b.channel) || b.channel < 0 || b.channel >= EFFECTS_PRESET_MAX_PATCH) {
    return null; // out of range is the SCHEMA's refusal; do not talk over it.
  }
  const seed = preset.patch_world_ys?.[b.channel];
  const motion = preset.patch_motion?.[b.channel];
  const missing: string[] = [];
  if (seed === undefined || seed === null) missing.push(`patch_world_ys[${b.channel}]`);
  if (motion === undefined || motion === null) missing.push(`patch_motion[${b.channel}]`);
  if (missing.length === 0) return null;
  return {
    rule: 'no-motion',
    advisory: true,
    enforced_by: 'nothing; this document is legal and builds',
    text: `this boundary follows patch channel ${b.channel}, and this document does not `
      + `author ${missing.join(' or ')}. That is LEGAL and it BUILDS, and the boundary will `
      + `sit still at line ${b.line}. A boundary MOVES only when the same channel index is both `
      + 'SEEDED (patch_world_ys) and SWEPT (patch_motion), in this one document. Nothing anywhere '
      + 'refuses a still boundary, so this note is the only thing that will tell you.',
  };
}

/**
 * Every editor-side warning this boundary earns, in a stable order.
 *
 * EMPTY IS NOT A CLEARANCE. See the header, and see `sweepTravel`: the fit test
 * has no passing verdict by construction, and the two cross-field refusals are
 * Aurora's reading of someone else's ensure. The honest sentence for an empty
 * list is "nothing here is obviously wrong", never "this is valid".
 */
export function boundaryAdvisories(preset: Partial<EffectsPreset>): readonly BoundaryAdvisory[] {
  const b = preset.boundary;
  if (b === undefined || b === null) return Object.freeze([]);
  const motion = preset.patch_motion?.[b.channel];
  return Object.freeze([
    loHi(b),
    lineInBand(b),
    sweepTravel(b, motion),
    noMotion(preset, b),
  ].filter((a): a is BoundaryAdvisory => a !== null));
}
