// The raster BAND PRESET surface — derivations, wording and command builders.
//
// The panel (components/effects/BandPresetPanel.tsx) holds no logic and spells
// no rule: every predicate, every sentence and every option list is here, so the
// control and the advisory beside it cannot describe the same rule differently.
// That is the `tableRefParamOptions` idiom (providers/effects-aeon.ts), ruled the
// reference for this parcel.
//
// CONTRACT: empyrean contract/schema/aurora-effects-preset.schema.json, vendored
// and pinned — see core/formats/effects/preset.ts and its provenance sidecar.
// aeon docs/EDITOR_RASTER_PRESETS.md is a WORKED EXAMPLE and says so itself; the
// schema and effects_gen.py win over it, and at this landing they do not disagree.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS FILE OPENS WITH THREE LIMITS INSTEAD OF A FEATURE
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon wrote their page to prevent ONE SENTENCE: "authoring effects no longer
// needs a programmer." Their accurate sentence is "an author can author a raster
// band, and a programmer wires it up in one line." The difference is not
// pedantry — it is the difference between a panel an author trusts and a panel
// that quietly promises the engine cannot deliver.
//
// So the limits below are never hover-ONLY. Each one exists at TWO lengths:
// `PRESET_LIMITS[k].body` is the contract wording, and `presetLimitsShort()`
// derives the author-length sentences from it via `SHORT_BODIES`. The panel
// paints the SHORT half in a visible block at the top of the section, always,
// and puts the contract half on the same element's `title` (plus the guide) —
// a limit an author has to hover to find is a limit the panel does not really
// carry, and a limit that is only ever painted is a contract sentence deleted.
// `band-preset-wording.test.ts` (components/effects/__tests__) fails if either
// half stops reaching the panel; there is no `effects-preset-wording.test.ts`
// and never has been. See BandPresetPanel.tsx's own header for the split and
// for the rows that hold it.
//
// ⚠ AND NOTHING IN THIS EDITOR HAS EVER DRAWN ONE OF THESE BANDS. Until aeon
// `4a4d3474` (2026-08-30) nobody in the suite had looked at one on screen at
// all; that commit's `docs/research/reference_captures/2026-08-30-sec5-band/`
// is the first and only measured frame — section 5, one camera position, in
// aeon's emulator, in aeon's tree. Nothing in this file's wording may imply a
// band is visible HERE, and `NO_PREVIEW` says so in as many words — citing
// that one frame, and saying no preview is built against it — rather than
// leaving the absence of a preview to be read as "preview coming soon".

import type {
  EffectsPreset, EffectsPresetBand, EffectsPresetLibrary, EffectsPresetBandOn,
  EffectsPresetCycleChannel, EffectsPresetAnchorSweep, AnchorAmpRung, AnchorPeriodRung,
  EffectsPresetRamp, EffectsPresetBaseSwap,
} from '../../core/formats/effects/preset';
import {
  EFFECTS_PRESET_ID_PATTERN, EFFECTS_PRESET_ON_ARMS, EFFECTS_PRESET_SCHEMA,
  presetArmIssue, presetOnArms, presetArmFields, presetDefFields, effectsPresetPath,
  // THE MOVING ANCHOR'S BOUNDS AND LADDERS — every one of them DERIVED FROM THE
  // SCHEMA in the codec (EW-CHANNELS-WRITER) and imported here, never re-derived
  // and never retyped. The ladders in particular: `amp_shift` and `period_shift`
  // are base-2 logarithms, and a second opinion about a rung in this file would
  // be a silent doubling waiting for a reader who trusted the wrong copy.
  EFFECTS_PRESET_MAX_PATCH, EFFECTS_PRESET_WORLD_Y_RANGE, EFFECTS_PRESET_PATCH_ANCHOR_NONE,
  ANCHOR_AMP_RUNGS, ANCHOR_PERIOD_RUNGS, ANCHOR_PHASE_RANGE,
  // ═══ THE `ramp` CHANNEL'S BOUNDS — EVERY ONE OF THEM THE CODEC'S ═══
  //
  // Read off the vendored schema in preset.ts with module-load guards that throw
  // if the schema's wording moves, and imported here rather than re-derived. Two
  // of them are traps and the reason they are constants at all:
  //
  //   • EFFECTS_PRESET_RAMP_SPAN_MAX — `top + lines <= 223`, which NO JSON
  //     Schema keyword can express, so the per-field maxima are a valid-looking
  //     pair that fails somebody else's build.
  //   • THE DISPLAY GEOMETRY, WHICH IS **TWO** CONSTANTS AND NOT ONE. A readout
  //     that is one line high LOOKS correct, and until empyrean e9409dc a single
  //     `..._DISPLAY_LAG` served both questions because the contract's two
  //     sentences happened to give the same number. They differ now:
  //       – EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET (2) — where the run
  //         BEGINS on screen. `rampDisplaySpan` at the foot of this file is the
  //         ONE place on this surface that applies it.
  //       – EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG (1) — where value `j` lands.
  //         `RAMP_DISPLAY_LAG_NOTE` is the ONE place that states it.
  //     They differ by one because `j` starts at 1; preset.ts has the whole
  //     reasoning and an interlock that re-derives one from the other.
  EFFECTS_PRESET_RAMP_TOP_RANGE, EFFECTS_PRESET_RAMP_LINES_RANGE,
  EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE, EFFECTS_PRESET_RAMP_SPAN_MAX,
  EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET, EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG,
  EFFECTS_PRESET_FP16_WHOLE_RANGE, EFFECTS_PRESET_FP16_FRAC_RANGE,
  // THE ONE CONVERSION, AND IT IS NOT RE-IMPLEMENTED HERE. The sign lives on
  // `whole` and applies to the whole value, so `{whole: -1, frac256: 128}` is
  // -1.5 and not -0.5 — a whole pixel of error with both numbers still in range,
  // which no schema and no round trip could catch. `presetFp16FromNumber`
  // returns null off-grid and MUST NOT be made to snap.
  presetFp16FromNumber, presetFp16ToNumber,
  presetRasterChannel, EFFECTS_PRESET_RASTER_CHANNELS,
  // ═══ THE `base_swap` CHANNEL'S BOUNDS — ALSO ALL THE CODEC'S ═══
  //
  // Read off the vendored schema with module-load guards (empyrean 5bd76ba,
  // §7.5) and imported, never retyped beside a control — the defect this family
  // has produced twice. The granule is the one to know about:
  // EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE is `multipleOf` 8192, and an
  // unaligned target is NOT a range error — VDP reg $02 encodes only the address
  // bits above the granule and DROPS the rest silently, so the failure is a
  // different address with nothing else visibly wrong. `isBaseSwapTargetAligned`
  // REPORTS it; there is deliberately no snap in the codec and none here.
  EFFECTS_PRESET_BASE_SWAP_KEYS, EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE, EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  isBaseSwapTargetAligned,
} from '../../core/formats/effects/preset';
import type { SetEffectsPresetCommand, SetSectionRasterCommand } from '../../core/editing/commands';
// THE BINDING LIMIT IS NOT RE-TYPED HERE. `PRESET_LIMITS.unbound` below is the
// AUTHOR-FACING copy of a sentence the agent replies and the published tool
// descriptions also carry, and main/ cannot import renderer/ — so the words live
// in core/ and every audience quotes them. See raster-binding.ts's own header.
import { RASTER_SECTION_BINDING_LIMIT } from '../../core/formats/raster-binding';
// THE FIRE BOUND IS NOT RE-TYPED HERE. A band's two edges and a vsplit's fire
// are the same engine `ensure` — see the timeline block at the foot of this
// file — so the constant is imported from the one place that declares it.
import { EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX } from './effects-aeon';
// THE OPTION SHAPE IS THE SCENE SELECT'S, not a second one. `presetRefOptions`
// below is `sceneRefOptions`' mirror and feeds the same `<Select>`; giving it a
// private `{value,label}` twin would let the two per-section pickers drift in
// shape as well as in wording.
import type { FactorOption } from './effects-aeon';
// THE CRAM GEOMETRY IS THE HARDWARE'S AND IS NOT RE-DERIVED HERE. `addr` is a
// BYTE address and an entry is a WORD, so the divisor between an address and a
// palette line is 32 and not 16 — the constants and `cramLocation` live beside
// the rest of the Genesis word arithmetic, where the palette editor already
// reads them, and cram-geometry.test.ts cross-checks that derivation against the
// two shift formulas the vendored schema states in its own descriptions.
import {
  cramLocation, fmtGenesisWord, CRAM_LINE_ENTRIES, CRAM_LINE_COUNT, CRAM_WORD_BYTES,
} from '../../core/formats/palette';
// THE NEGATIVE-VALUE CAVEAT LIVES IN core/, NOT HERE, for `preset-lag.ts`'s
// reason: it is a self-retiring disclosure whose premise is measured against a
// peer repo at a committed revision, and a copy of it in a renderer provider
// would be a second statement of the fact that nothing measures. This module
// APPENDS it; it does not decide it.
//
// ⚠ THE PREMISE IS PASSED EXPLICITLY, NOT LEFT TO THE DEFAULT PARAMETER. A
// default argument is evaluated in the DECLARING module's scope, so a caller
// that omits it reads the real constant even when a test has stubbed the module
// — the poison would go green while the caveat stayed hard-wired on. Reading
// the constant here, through the import, is what makes both directions of the
// premise reach this sentence.
import {
  rampSignRateCaveat, RAMP_SIGN_FIELDS_AWAITING_AEON,
} from '../../core/formats/effects/ramp-sign-lag';
// WHICH OF TWO EFFECTS A VSRAM RAMP PRODUCES — the sentences and the measured
// aeon chain live in core/, this file only RESOLVES the bindings. Same split as
// the caveat above and for the same reason: the fact is a peer repo's, measured
// at a revision, and a renderer provider is not where a cross-tool measurement
// should be restated.
import {
  rampScrollModeSentence,
} from '../../core/formats/effects/ramp-scroll-mode';
import type {
  RampScrollBinding, RampScrollUnknownReason,
} from '../../core/formats/effects/ramp-scroll-mode';
// THE ONE DERIVATION OF "DOES THIS SCENE ATTACH A PER-COLUMN TABLE".
// `vDeformValue` is what the scene panel's own V-deform row reads; testing
// `=== 'none'` a second time here is how this sentence and that control would
// come to disagree about what an off state is (and `undefined` is a third
// spelling of off that a bare comparison misses).
import { vDeformValue } from './effects-aeon';
import type { EffectsSceneLibrary } from '../../core/formats/effects/scene';

// ---------------------------------------------------------------------------
// THE THREE LIMITS — one source, read by the panel and by the wording gate
// ---------------------------------------------------------------------------

/**
 * The accurate headline, in aeon's own words.
 *
 * Quoted rather than paraphrased on purpose: a paraphrase is exactly how "a
 * programmer wires it up in one line" becomes "and then it's in the game".
 */
export const PRESET_HEADLINE =
  'An author can author a raster band. A programmer wires it up in one line.';

export interface PresetLimit {
  /** Stable key, so a test can name the one it is asserting. */
  key: 'unbound' | 'debug_chord' | 'unchecked_visibility';
  /** The short label the block leads with. */
  title: string;
  /**
   * The limit itself, at CONTRACT length — the wording owed to the agent reply
   * and the published tool descriptions, never paraphrased away. This is the
   * field `presetLimitsShort()` carries through as `full` and the panel puts on
   * the element's `title`; what the panel PAINTS is `SHORT_BODIES[key]`. Both
   * must reach the render — see this file's header.
   */
  body: string;
}

/**
 * The three limits, in the order an author meets them: what saving does NOT do,
 * then what looking at it costs, then what "it built" does NOT prove.
 *
 * EACH ONE IS A FACT WITH A NAMED OWNER, not a hedge. The point is not to make
 * the panel humble; it is to make it accurate, so an author who reads it can
 * predict what happens next. A scolding panel and a lying panel fail the same
 * author in opposite directions.
 */
export const PRESET_LIMITS: readonly PresetLimit[] = Object.freeze([
  Object.freeze({
    key: 'unbound' as const,
    title: 'Saving does not install the band',
    // ⚠ THE KEY WAS RENAMED BY RULING, not by preference: empyrean
    // docs/AURORA_EFFECTS_SCHEMA.md §3.1 (adjudicated 2026-08-30) adopted
    // `rasterRef` for the per-section preset binding and left `effectsRef`
    // reserved and unspent, because a preset document supplies only the raster
    // channel of aeon's eight-channel EffectsPreset. This limit must not go
    // back to naming `effectsRef` — an author who went looking for that key
    // would find nothing.
    //
    // AND THE STATUS HAS CHANGED SIX TIMES NOW. First the key appeared in the
    // sidecar and Aurora began round-tripping it, so "not implemented in either
    // repo" became a lie. Then `assign_section_preset` landed, so "nothing binds
    // a preset to a section" became one too — a WRITER exists, it is an agent
    // tool. Then aeon `4aa2abc0` landed the READER, so "no aeon consumer reads
    // a rasterRef" became the third lie — retired on the schedule the sentence's
    // own dated expiry set. Then ROADMAP row 93's remaining half landed the
    // per-section raster select in the section BELOW this block, so "no control
    // in the band-preset panel writes a rasterRef" became the fourth — and this
    // limit is now read by an author standing directly above the control it is
    // about, which is the placement the block was built for. Then aeon
    // `9cdf32d8` threaded the chooser FOR ONE SECTION, so "nothing calls it"
    // became the fifth lie. Then aeon `c9a462be` committed section 5's sidecar
    // carrying `ojz_sec5_showcase` — the two files this repo's own handover
    // test authored through the writer below — so "no sidecar carries the key,
    // the seam gate's arm is vacuous, no section has been exercised end to end"
    // became the sixth, retired against their `6e2495a5`. What that sixth did
    // NOT change at the time: the band had not been recorded as seen (aeon's
    // own commit said so), and this viewport still composites nothing. Then
    // aeon `4a4d3474` committed the measurement — `docs/research/
    // reference_captures/2026-08-30-sec5-band/`, CRAM line 2 entry 8 `$0EA4`
    // in-band, `$0000` outside and on the control, on their emulator — so
    // "nothing has been seen on screen" became the SEVENTH, retired against
    // their `e6405428`. The sentence cites that capture, says where it lives,
    // and says nothing of it is visible here. What the seventh did NOT change:
    // this viewport still composites nothing, and `NO_PREVIEW` below still
    // said a band had never been looked at in this suite — which was
    // NO_PREVIEW's own expiry to retire, not this limit's, and was TAGGED in
    // `core/formats/raster-binding.ts`'s header rather than reworded here.
    // (Retired 2026-08-30, O64: `NO_PREVIEW` now cites the same capture as
    // the ONE frame a preview could be checked against, and still draws none.)
    //
    // ⚠ AN EIGHTH FACT WAS ADDED 2026-08-30 (O62), NOT A CORRECTION: the seven
    // above are about how far one binding travels; this one is about the TREE
    // the select leaves behind. At aeon `027ec162` three content tests in
    // their FAST=0 build accept exactly one bound set — section 5 →
    // `ojz_sec5_showcase` — so the empty option on section 5 (the very
    // control this block renders above) produces a tree aeon's canonical
    // build refuses by name, and so does a pick on any other section. The
    // sentence says so, says FAST=1 builds it, and says nothing here prevents
    // the write. The option is NOT disabled and there is NO confirm: the
    // STANDING REFUSAL in raster-binding.ts — a gate built from one act's
    // content snapshot would be wrong for the next act and read as authority.
    // This block is the instrument, which is why it renders whether or not
    // the active section is bound (band-preset-wording pins that structure).
    //
    // ⚠ AND THE FIFTH IS A DIFFERENT SHAPE FROM THE OTHER FOUR. Each of those
    // replaced one universal claim with another. This one cannot: aeon's step 5
    // MANUFACTURED a non-uniformity that did not exist before it — section 5's
    // `preset()` calls `ojz_act1_sec_raster(sec: 5, …)` and no other section's
    // does — so any single sentence about "a bound section" is now wrong for
    // half the sections it describes. What survives is a CASE SPLIT, and it
    // names the NUMBER 5 on aeon's own drafting rule: a sentence naming the
    // number expires visibly when the number moves, while "a bound section
    // plays" would go wrong silently the first time someone binds section 6.
    //
    // The third case is why the limit still exists: binding any other section
    // writes a key nothing consumes. That is no longer SILENT — aeon's
    // `tools/effects_seam_gate.py` fails a full build naming the section — but
    // the refusal is aeon's, not this editor's, and `FAST=1` skips it.
    //
    // ⚠ NO LONGER THIS FILE'S OWN WORDS, and that is the fix rather than a
    // regression. The same sentence is now owed to three audiences — this
    // panel, `assign_section_preset`'s reply, and the published tool
    // descriptions in main/ — and `bg-binding.ts` learned the hard way that two
    // hand-written near-identical sentences is how a limit ends up stated two
    // different ways. It lives in core/formats/raster-binding.ts because main
    // must not import the renderer; the author still reads it here, in full, in
    // the block that never truncates.
    body: RASTER_SECTION_BINDING_LIMIT,
  }),
  Object.freeze({
    key: 'debug_chord' as const,
    title: 'Seeing it is a debug chord',
    // ⚠ THE REACHABILITY HALF WAS NARROWED AT aeon `4aa2abc0`, and the old
    // wording ("fails loudly when a preset has NO ROW") is now too strong: a
    // section binding counts as a second installer, so the check fires only when
    // a document has neither. Corrected here rather than left, because an author
    // who binds a preset and is then told their build will fail for a missing
    // row would go add one they do not need.
    body:
      'aeon steps a band-demo table with START held + UP to install the next program and ' +
      'START + DOWN to remove it. That table is a hand-typed dc.l list — this document ' +
      'does not add itself to it. aeon\'s build fails loudly when a preset document is ' +
      'reached by neither a table row nor a section binding (aeon 4aa2abc0), so the ' +
      'omission is not silent, but adding the row is a programmer\'s edit.',
  }),
  Object.freeze({
    key: 'unchecked_visibility' as const,
    title: 'Nothing checks that a band is visible',
    body:
      'A perfectly legal band over an unused palette entry, or one whose colour matches ' +
      'the base it repaints, builds green and shows nothing. No check anywhere in the ' +
      'pipeline catches that — not this panel, not the schema, not the build.',
  }),
]);

// ═══════════════════════════════════════════════════════════════════════════
// THE SAME THREE LIMITS, AT AUTHOR LENGTH — EFFECTS-W1 defect 3
// ═══════════════════════════════════════════════════════════════════════════
//
// MEASURED: `LimitBlock` rendered 8,059 characters before the first control in
// a 285px column — roughly seven minutes of reading — of which `unbound` alone
// was 6,508. It cited `tools/effects_gen.py`, `raster_dsl.emp`, four aeon commit
// SHAs, three pytest test names and `NO_LINT=1`. Everything in it is true and
// much of it matters, including the one fact that later cost a red build; it was
// in the worst possible place. An author looking for a button scrolls past it,
// and an author who reads it is reading a design memo instead of authoring.
//
// ⚠ THE LONG SENTENCES ARE NOT DELETED AND MUST NOT BE. `PRESET_LIMITS` is the
// contract-level wording, owed to three audiences — this panel, the agent's
// `assign_section_preset` reply, and the published tool descriptions in main/ —
// and `raster-binding.ts` exists precisely so those three cannot drift. What
// changed is WHICH of them the panel PAINTS. The short line is the author's; the
// long one is still one hover away on the same element, and the guide carries
// the whole of it in prose a person can read at their own pace.
//
// ⚠ AND THE SHORT ONE IS DERIVED FROM THE LONG ONE'S SUBJECT, NOT SUMMARISED
// FROM MEMORY. Each entry below names the same `key` as its long sibling and
// `presetLimitsShort()` refuses to build if a key ever disappears — a summary
// that outlives the thing it summarises is exactly the failure this file's
// header spends four screens on.

export interface PresetLimitShort {
  key: PresetLimit['key'];
  title: string;
  /** One or two sentences. The author's version. */
  body: string;
  /** The full contract wording — the element's `title`, so nothing is lost. */
  full: string;
}

const SHORT_BODIES: Record<PresetLimit['key'], string> = {
  unbound:
    'Saving writes the document; a section has to BIND it, and aeon has to have wired that '
    + 'section. The panel says which state the section you are on is in, at the dropdown below.',
  debug_chord:
    'A preset also needs a row in aeon\'s band-demo table or a section binding to be reachable '
    + 'at all. aeon\'s build fails loudly when it has neither, so this is never silent.',
  unchecked_visibility:
    'Nothing checks that a band is VISIBLE. A legal band over an unused palette entry, or one '
    + 'whose colour matches what it repaints, builds green and shows nothing.',
};

export function presetLimitsShort(): readonly PresetLimitShort[] {
  return PRESET_LIMITS.map((l) => {
    const body = SHORT_BODIES[l.key];
    if (body === undefined) {
      throw new Error(
        `PRESET_LIMITS gained the key "${l.key}" with no author-length wording. Add one to `
        + 'SHORT_BODIES: a limit the panel cannot say in two sentences is a limit the panel '
        + 'does not really carry.',
      );
    }
    return { key: l.key, title: l.title, body, full: l.body };
  });
}

/**
 * Why there is no preview here, said out loud.
 *
 * An empty space where a preview would be reads as "not built yet". The truth is
 * stronger and worth stating. When this was written nobody in the suite had seen
 * one of these bands render, so there was no ground truth to preview AGAINST at
 * all. Since aeon `4a4d3474` (2026-08-30) there is exactly ONE: the README in
 * their `docs/research/reference_captures/2026-08-30-sec5-band/` records
 * "VERDICT: BAND SEEN" — CRAM line 2 entry 8 `$0EA4` at screen lines 40/56/72
 * and `$0000` at 8/20/96/150 in one frame, two private headless `oracle-aether`
 * instances byte-identical, `$0000` everywhere on a control ROM with the
 * sidecar's `rasterRef` null — and lists what it does NOT establish: the exact
 * transition lines, other CRAM entries, other camera positions, a walked
 * crossing, motion, hardware. One section, one camera position, one frame,
 * measured in aeon's emulator and committed to aeon's tree.
 *
 * What that does not change: this editor draws no band (the viewport composites
 * no `rasterRef`; nothing in Aurora has sampled CRAM), so a preview here would
 * still be a guess about a frame this editor has never produced — it could at
 * most be CHECKED against that one frame, and it is not built. A preview drawn
 * from a model checked against nothing would be the most confident wrong thing
 * on the screen; one checked against a single frame would be nearly as
 * confident and wrong everywhere that frame does not reach.
 *
 * ⚠ THIS IS NOT `RASTER_SECTION_BINDING_LIMIT`, and the two must not converge.
 * That sentence owns where a BINDING stops (and cites the same capture for
 * that); this one owns why there is nothing to preview AGAINST. It is kept
 * shorter than that limit, and a test row measures it.
 *
 * EXPIRES (2026-08-30, in the sentence itself): the captures directory leaving
 * aeon's tree or its README no longer saying what is quoted here, or a second
 * measured section or camera position — owner aeon's lane; this editor drawing
 * a band — owner Aurora. Evaluate, do not obey: re-read that README at a
 * revision (`git show origin/master:docs/research/reference_captures/
 * 2026-08-30-sec5-band/README.md`), never by path into their working tree.
 */
/**
 * The author's version of NO_PREVIEW — defect 3's cut, same rule as
 * `SHORT_BODIES`: what an author must know, with the provenance one hover away.
 * `NO_PREVIEW` itself is unchanged and is what the element's `title` carries.
 */
export const NO_PREVIEW_SHORT =
  'No preview. Aurora draws no raster band — there is nothing here to check one against, and a '
  + 'wrong preview would be worse than none. You see it when the ROM runs.';

export const NO_PREVIEW =
  'No preview. This editor draws no band: the viewport composites no rasterRef, and ' +
  'nothing in Aurora has sampled CRAM, so there is nothing to draw a faithful preview ' +
  'from — and an unfaithful one would be worse than none. There is now ONE measured ' +
  'frame, in aeon\'s tree and not in this one: aeon 4a4d3474 (2026-08-30), ' +
  'docs/research/reference_captures/2026-08-30-sec5-band/, section 5 at one camera ' +
  'position in aeon\'s emulator, CRAM line 2 entry 8 reading $0EA4 inside the band and ' +
  '$0000 outside it and on the control. A preview here could at most be checked against ' +
  'that one frame; none is built. Expires (2026-08-30): when that directory leaves ' +
  'aeon\'s tree or its README stops saying so, or a second section or camera position is ' +
  'measured — aeon\'s lane; or when this editor draws a band — Aurora\'s.';

// ---------------------------------------------------------------------------
// Field wording, read out of the schema rather than retyped beside it
// ---------------------------------------------------------------------------

function schemaNode(path: string[]): Record<string, unknown> {
  let node: unknown = EFFECTS_PRESET_SCHEMA;
  for (const seg of path) node = (node as Record<string, unknown>)[seg];
  if (typeof node !== 'object' || node === null) {
    throw new Error(`effects preset schema is missing ${path.join('.')}`);
  }
  return node as Record<string, unknown>;
}

/**
 * A field's `title`: the CONTRACT'S OWN `description`, verbatim.
 *
 * ═══ WHY QUOTED AND NOT WRITTEN ═══
 *
 * The schema deliberately carries no numeric bounds, and aeon's §E.4 is explicit
 * that a writer must not add any: "Do not validate ranges, and do not clamp.
 * Forward what the author typed", so the author reads the ENGINE's refusal with
 * the measurement behind it ("the ON fire costs 624 cyc against 488 available").
 * A clamp — or a range hint of my own invention — replaces that sentence with
 * silence, or worse, with a bound Aurora made up.
 *
 * What the schema DOES carry is a description per field that names the rule and
 * the engine file enforcing it. Showing that text at the point of use is the
 * honest middle: the author learns what the field means and where the refusal
 * will come from, and Aurora asserts nothing it does not own. Because it is read
 * out of the vendored bytes, it cannot drift from the contract.
 */
export function presetFieldTitle(path: string[]): string {
  const d = schemaNode(path).description;
  return typeof d === 'string' ? d : '';
}

/** The `top`/`bot`/`sh` field titles, straight from the schema. */
export const BAND_FIELD_TITLES = Object.freeze({
  top: presetFieldTitle(['$defs', 'band', 'properties', 'top']),
  bot: presetFieldTitle(['$defs', 'band', 'properties', 'bot']),
  sh: presetFieldTitle(['$defs', 'band', 'properties', 'sh']),
  on: presetFieldTitle(['$defs', 'band', 'properties', 'on']),
});

/** One arm field's title, straight from the schema. */
export function armFieldTitle(arm: string, field: string): string {
  return presetFieldTitle(['$defs', arm, 'properties', field]);
}

/** Human label for an ON arm — the schema's key, which is also what aeon lowers. */
export function armLabel(arm: string): string {
  return arm === 'pal_region' ? 'pal_region (staged variant)' : 'cram (raw colours)';
}

// ---------------------------------------------------------------------------
// The ON-arm picker — the `tableRefParamOptions` idiom, applied
// ---------------------------------------------------------------------------

export interface ArmOption {
  value: string;
  label: string;
  /** True when the ENGINE/schema refuses this value HERE, whatever else changes. */
  disabled: boolean;
  title: string;
}

/**
 * What the ON-arm picker offers.
 *
 * ═══ THE STRICTNESS QUESTION, ANSWERED RATHER THAN ASSUMED ═══
 *
 * `tableRefParamOptions`' test is the rule: DISABLE ONLY WHEN NO DOCUMENT
 * CONTENT CAN MAKE THE VALUE LEGAL; when the precondition is another control's
 * value, ADVISE instead of disabling.
 *
 * Both arms pass that test in the ACCEPTING direction — `cram` and `pal_region`
 * are each legal in every document — so NOTHING here is disabled, and that is
 * the answer, not an omission. There is no third value to grey out: `vsram` is
 * not an arm the schema declares, so it is not an option to disable, it is a
 * key that does not exist. Offering it disabled would advertise a capability the
 * contract does not have.
 *
 * WHAT IS STILL RENDERED, THOUGH, is an arm a FILE already carries that the
 * schema does not declare. A `<select>` whose current value has no option
 * silently shows a DIFFERENT one — the quiet lie `unassignableSceneRef` and
 * `leftColumnMaskOptions` both exist to stop — and here it would be worse than
 * usual: the author would see `cram` and the file would hold something else. So
 * an unknown arm appears, disabled, carrying why.
 */
export function armOptions(current: string | null): ArmOption[] {
  const options: ArmOption[] = EFFECTS_PRESET_ON_ARMS.map((arm) => ({
    value: arm,
    label: armLabel(arm),
    disabled: false,
    title: presetFieldTitle(['$defs', arm]) || armLabel(arm),
  }));
  if (current !== null && !EFFECTS_PRESET_ON_ARMS.includes(current)) {
    options.push({
      value: current,
      label: current,
      disabled: true,
      title:
        `the build refuses it: "${current}" is not an ON arm. The arms are ` +
        `${EFFECTS_PRESET_ON_ARMS.join(' and ')}.`,
    });
  }
  return options;
}

/**
 * The arm rule as an ADVISORY sentence for one band, or null.
 *
 * THE SAME DERIVATION THE CODEC REFUSES ON — `presetArmIssue`, imported, not
 * re-implemented. That is the brief's rule: the predicate and its sentence come
 * from one source both the control and the advisory read. If this file spelled
 * its own comparison, the panel could say a band is fine while the writer path
 * refuses it, which is the failure mode both halves exist to prevent.
 */
export function bandArmAdvisory(band: EffectsPresetBand): string | null {
  return presetArmIssue(band.on);
}

/** Which arm a band currently carries, or null when it carries none or many. */
export function bandArm(band: EffectsPresetBand): string | null {
  const arms = presetOnArms(band.on);
  return arms.length === 1 ? arms[0] : null;
}

// ---------------------------------------------------------------------------
// Preset list + selection
// ---------------------------------------------------------------------------

export interface PresetListEntry {
  id: string;
  /** `name` when the document has a string one, else the id — never an empty row. */
  label: string;
  bands: number;
  /**
   * WHICH RASTER PROGRAM THE DOCUMENT CARRIES, so the row can say `ramp` instead
   * of `0 bands`.
   *
   * A ramp document has no `bands` key at all, and the count alone would render
   * it as an empty band list — which reads as a broken or half-authored preset
   * rather than a different kind of one. `presetRasterChannel` is the codec's
   * narrowing helper and the one spelling of the question; `null` is a document
   * that carries no raster program, which the schema refuses and which therefore
   * only exists mid-edit.
   *
   * ⚠ DERIVED FROM THE HELPER'S RETURN TYPE, not restated. It was spelled out as
   * `'bands' | 'ramp' | null` until `base_swap` arrived (empyrean 5bd76ba) and
   * the restatement was the ONLY thing that had to be edited for a third raster
   * channel. Deriving it means the next channel is a codec change alone.
   */
  channel: ReturnType<typeof presetRasterChannel>;
}

export function presetListEntries(library: EffectsPresetLibrary): PresetListEntry[] {
  return library.presets.map((p) => ({
    id: p.id,
    label: (typeof p.name === 'string' && p.name !== '') ? p.name : p.id,
    bands: (p.bands ?? []).length,
    channel: presetRasterChannel(p),
  }));
}

/**
 * What one list row says on its right — `3 bands`, `ramp`, or `base swap`.
 *
 * EVERY NON-BANDS CHANNEL NEEDS A WORD HERE. A document whose channel is not
 * `bands` has no `bands` key at all, so falling through to the count renders it
 * as `0 bands` — which reads as a broken or half-authored preset rather than a
 * different kind of one. That is exactly what a `base_swap` preset did before
 * this row learned its name.
 *
 * ⚠ THE WORD IS THE CHANNEL'S OWN NOUN, NOT A TEST PER CHANNEL. This was an
 * `if` per channel with the count as its fallthrough, so the fourth arm would
 * have gone straight back to reading `0 bands`. Now the only test is the
 * POSITIVE one — is this the channel that HAS a count? — and every other
 * channel, present or future, gets the noun `RASTER_CHANNEL_NOUNS` already has
 * to carry for it (a channel with no noun cannot load this module at all).
 */
export function presetListSummary(entry: PresetListEntry): string {
  if (entry.channel !== null && entry.channel !== 'bands') {
    return RASTER_CHANNEL_NOUNS[entry.channel] ?? entry.channel;
  }
  return `${entry.bands} band${entry.bands === 1 ? '' : 's'}`;
}

/**
 * The preset a selected id resolves to — the id if it still exists, else the
 * first preset, else nothing.
 *
 * The fallback is load-bearing for `resolveSelectedScene`'s reason: undoing a
 * create, or opening a different project, leaves a stale id in the selection,
 * and without it the whole editor below would vanish rather than land on the
 * preset that IS there.
 */
export function resolveSelectedPreset(
  library: EffectsPresetLibrary, selectedId: string | null,
): EffectsPreset | null {
  return library.presets.find((p) => p.id === selectedId) ?? library.presets[0] ?? null;
}

/**
 * Why this id cannot be created, or null.
 *
 * ONE WORDING for the rule, so the panel and any later agent tool cannot
 * describe it differently — `sceneIdRefusal`'s reason, and its shape.
 *
 * THE `unreadable` CHECK IS NOT DECORATIVE. Creating a preset whose id collides
 * with a file that exists and will not parse would, at save, write over that
 * file — destroying the author's broken document instead of letting them fix it.
 * The save plan throws as a backstop; this is the user-facing path that means
 * the backstop is never reached.
 */
export function presetIdRefusal(id: string, library: EffectsPresetLibrary): string | null {
  if (id === '') return 'Enter an id.';
  if (!EFFECTS_PRESET_ID_PATTERN.test(id)) {
    return `"${id}" is not a legal preset id. It must match ` +
      `${EFFECTS_PRESET_ID_PATTERN.source} — lower case, starting with a letter, up to 32 ` +
      'characters. The id becomes part of a generated .emp symbol, which is why hyphens ' +
      'and capitals are out.';
  }
  if (library.presets.some((p) => p.id === id)) {
    return `"${id}" is already a preset in this project.`;
  }
  const taken = library.unreadable.find((u) => u.path.endsWith(`/${id}.json`));
  if (taken) {
    return `"${id}" is taken by ${taken.path}, which exists but could not be read. Saving ` +
      'over it would destroy it — fix or remove that file by hand, or pick another id.';
  }
  return null;
}

/** Where this preset will be written, for the panel to show at the point of saving. */
export function presetPathFor(dataRoot: string, id: string): string {
  return effectsPresetPath(dataRoot, id);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function clonePreset(p: EffectsPreset): EffectsPreset {
  return structuredClone(p);
}

function presetCommand(
  presetId: string, description: string,
  oldPreset: EffectsPreset | null, newPreset: EffectsPreset | null,
): SetEffectsPresetCommand {
  return {
    type: 'set-effects-preset',
    description,
    // -1: act-ambient. See the command's docblock.
    sectionIndex: -1,
    presetId,
    oldPreset: oldPreset && clonePreset(oldPreset),
    newPreset: newPreset && clonePreset(newPreset),
  };
}

/**
 * A brand-new band.
 *
 * ALL FOUR FIELDS WRITTEN, `sh` INCLUDED, because there is no default to fall
 * back on in the JSON or in the engine — aeon's §E.3. The numbers are a starting
 * point an author will replace, NOT a validated or "safe" band: Aurora does not
 * know what is safe here, and a seed that pretended to would be the clamp §E.4
 * forbids wearing a different hat.
 *
 * `top`/`bot` seed 16 apart rather than 1, so a fresh band is not born tripping
 * the engine's height rule for a reason the author had no hand in. `addr` seeds
 * on palette line 2 rather than 0, because line 0 is the character's line and
 * both `stream_cram` and the derived `pal_restore` refuse it — a seed that
 * cannot build is a worse first impression than one that can.
 */
export function newBand(): EffectsPresetBand {
  return { top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0] } } };
}

/** A new, empty-but-legal preset. `bands` has one member: the schema refuses zero. */
export function newPreset(id: string, name?: string): EffectsPreset {
  const preset: EffectsPreset = { schema: 1, id, bands: [newBand()] };
  if (name !== undefined && name !== '') preset.name = name;
  return preset;
}

export type CreatePresetResult =
  | { ok: true; command: SetEffectsPresetCommand }
  | { ok: false; reason: string };

export function createPresetCommand(
  library: EffectsPresetLibrary, id: string, name?: string,
): CreatePresetResult {
  const refusal = presetIdRefusal(id, library);
  if (refusal) return { ok: false, reason: refusal };
  return { ok: true, command: presetCommand(id, `New preset ${id}`, null, newPreset(id, name)) };
}

/** Delete a preset. Null when there is no such preset to delete. */
export function deletePresetCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  if (!existing) return null;
  return presetCommand(id, `Delete preset ${id}`, existing, null);
}

/** Which sections' sidecars name this preset. Empty when none do. */
export function sectionsBindingPreset(
  sections: readonly ({ rasterRef: string | null } | null)[], id: string,
): number[] {
  const out: number[] = [];
  sections.forEach((s, i) => { if (s && s.rasterRef === id) out.push(i); });
  return out;
}

/**
 * Why this preset cannot be deleted right now, or null.
 *
 * ═══ EFFECTS-W1 DEFECT 11 — THE UNGUARDED DELETE ═══
 *
 * `Delete` removed the document with no confirmation and left every binding
 * that named it DANGLING. aeon's generator then refuses the build BY NAME
 * ("rasterRef 'x' names no preset document … Known ids: …"), and the walkthrough
 * met that message through the FAST wrapper, which replaces it with a wrong one
 * about missing donor directories. One unguarded click, one misattributed build
 * failure.
 *
 * ⚠ IT REFUSES RATHER THAN CLEARING THE BINDINGS FOR YOU, and that is the
 * choice worth stating. Clearing them would be one click and would silently
 * change an author's per-section assignments — a second edit they did not ask
 * for, on files they were not looking at, folded into a delete. Unbinding is one
 * control away, it is one undo step of its own, and the sentence says exactly
 * where it is. `lastBandRefusal` is the idiom: disabled, with the reason beside
 * it, from one derivation both the button and the sentence read.
 *
 * ⚠ IT IS NOT A CONFIRM DIALOG EITHER. A confirm asks "are you sure?" about a
 * consequence the author cannot see; this names the sections, which is the thing
 * they would have had to go and find out.
 */
export function deletePresetRefusal(
  sections: readonly ({ rasterRef: string | null } | null)[], id: string,
): string | null {
  const bound = sectionsBindingPreset(sections, id);
  if (bound.length === 0) return null;
  const list = bound.length === 1
    ? `Section ${bound[0]}`
    : `Sections ${bound.slice(0, -1).join(', ')} and ${bound[bound.length - 1]}`;
  return `${list} ${bound.length === 1 ? 'binds' : 'bind'} "${id}". Deleting it would leave `
    + `${bound.length === 1 ? 'that binding' : 'those bindings'} naming a document that does not `
    + 'exist, and aeon\'s build refuses that by name. Set the raster binding back to '
    + `"${RASTER_REF_ROW.unbound}" on ${bound.length === 1 ? 'that section' : 'those sections'} `
    + 'first — the Section dropdown above.';
}

/**
 * Put a WHOLE preset document at `id`, creating or replacing.
 *
 * THE AGENT SURFACE'S SHAPE rather than the panel's, and the one operation this
 * file did not already carry. Every function above takes a mutator over the
 * preset that is already in the library, because a control only ever changes a
 * field of a document the author is looking at; `set_effects_preset` hands over a
 * COMPLETE document instead, for the reason `editPresetCommand` gives about
 * itself — a field-patch API would need the field enumeration this format is
 * deliberately handled without.
 *
 * Null when the document is identical to what is already there, so a re-send is
 * not an undo step. That is the same JSON comparison `editPresetCommand` makes,
 * and for the same reason: it is honest about what "changed" means (any key at
 * any depth, including ones no control shows).
 *
 * It does NOT check the id rules — `replaceSceneCommand`'s reason, unchanged: a
 * REPLACE must not be refused for an id that is obviously already in use, and a
 * CREATE's extra question (is this id taken by an UNREADABLE file?) belongs to
 * the caller, which is the only party that knows which of the two it is doing.
 * `presetIdRefusal` is that question, and the caller asks it.
 */
export function replacePresetCommand(
  library: EffectsPresetLibrary, id: string, preset: EffectsPreset,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id) ?? null;
  if (existing && JSON.stringify(existing) === JSON.stringify(preset)) return null;
  return presetCommand(id, existing ? `Replace preset ${id}` : `New preset ${id}`, existing, preset);
}

// ---------------------------------------------------------------------------
// The per-section raster binding — the select's options, label and advisory
// ---------------------------------------------------------------------------

/**
 * The row's label and its control title.
 *
 * IN THE PROVIDER, NOT THE PANEL, on this file's own rule — but note what is
 * NOT here. `title` defines the two kinds of value the control offers; it does
 * NOT restate where the binding stops. That sentence is
 * `RASTER_SECTION_BINDING_LIMIT`, rendered in full by `LimitBlock` at the top of
 * the very section this control sits in, and a second near-identical wording
 * beside the select is precisely the drift core/formats/raster-binding.ts exists
 * to prevent (bg-binding.ts learned it the expensive way). If this control ever
 * seems to need something the constant does not say, that is a change to the
 * constant, not a new sentence here.
 *
 * `unbound` is the empty option's label. `sceneRef`'s empty option reads "Act
 * default" because a section with no scene falls back to the act's own; a
 * section with no `rasterRef` falls back to nothing of Aurora's — aeon's
 * `preset()` keeps the `raster:` label a programmer typed, which is what
 * core/model/s4-types.ts calls "this section keeps its hand-authored raster
 * channel". The label names that state rather than calling it "none", because
 * "none" would read as "no raster program at all", which is a different and
 * false thing.
 */
export const RASTER_REF_ROW = Object.freeze({
  unbound: 'Hand-authored raster',
  title: 'Which raster band preset this section uses (rasterRef). '
    + "Hand-authored raster means the section keeps the raster: label aeon's effects source "
    + 'already names for it.',
});

/**
 * The `rasterRef` dropdown for one section: the unbound option plus every
 * LOADED preset.
 *
 * `sceneRefOptions`' EXACT MIRROR (providers/effects-aeon.ts), including the
 * omission: unreadable preset files are deliberately absent, because binding a
 * section to a file Aurora could not read writes a ref aeon's generator then
 * refuses BY NAME at build time. They are not silent — the load already raised a
 * notice per file, the panel counts them, and `unassignablePresetRef` below
 * reports a section already pointing at one.
 */
export function presetRefOptions(library: EffectsPresetLibrary): FactorOption[] {
  return [
    { value: '', label: RASTER_REF_ROW.unbound },
    ...presetListEntries(library).map((e) => ({ value: e.id, label: e.label })),
  ];
}

/**
 * A warning for a section whose `rasterRef` names nothing this project can
 * offer, or null.
 *
 * REACHABLE WITHOUT ANY BUG, and `unassignableSceneRef`'s reasons hold here
 * unchanged: the sidecar is hand-editable, and a preset can be deleted, renamed,
 * or left sitting in `unreadable` while a section still names it. A plain
 * `<select>` shows an unknown value by falling back to its first option, so
 * saying nothing would draw this section as "Hand-authored raster" — a quiet lie
 * about what is in the file.
 *
 * ⚠ AND HERE IT IS A LIE WITH A BUILD ATTACHED, which is the one thing this
 * differs from the scene case in. aeon's `tools/effects_gen.py` refuses an id
 * naming no preset document BY NAME and lists the ids it does know
 * (core/formats/raster-binding.ts, verified at aeon `6e2495a5`), so the author
 * who is not told here meets it as a build failure instead. There is a SECOND
 * build failure behind this one now, and it is the reason the advisory is not
 * the only safety net: `tools/effects_seam_gate.py` refuses a build where a
 * section's `rasterRef` names a perfectly good preset but that section's
 * `preset()` does not thread the chooser — which at `6e2495a5` is every section
 * except 5 (and section 5 IS bound there, since aeon `c9a462be`, so the arm has
 * a live subject it passes rather than an empty set it prints).
 */
export function unassignablePresetRef(
  library: EffectsPresetLibrary, rasterRef: string | null, sectionIndex?: number,
): string | null {
  if (rasterRef === null) return null;
  if (library.presets.some((p) => p.id === rasterRef)) return null;
  // THE SECTION IS NAMED (EFFECTS-W1 defect 7). One control draws every
  // section in turn, so "Assigned to X" alone left the reader to work out
  // WHICH section's sidecar carries the dangling id — and the build's own
  // message for the same fault names the section, so the two now agree.
  const where = sectionIndex === undefined ? 'This section' : `Section ${sectionIndex}`;
  if (library.unreadable.some((u) => u.path.endsWith(`/${rasterRef}.json`))) {
    return `${where} is assigned to "${rasterRef}", whose file exists but could not be read.`;
  }
  return `${where} is assigned to "${rasterRef}", which is not a raster preset in this project.`;
}

/**
 * Assign which raster PRESET a section uses — `Section.rasterRef`.
 *
 * `sectionSceneCommand`'s EXACT MIRROR (providers/effects-aeon.ts), deliberately
 * down to the `''` sentinel: a `<select>`'s empty option and an agent's explicit
 * `null` are the SAME STATE for this key, exactly as for `sceneRef`, so both
 * arrive here as "no binding" and neither can produce a `rasterRef: ""` the
 * sidecar would then read back as null and erase. Unbinding is expressible, and
 * it is expressible the same way from both doors.
 *
 * Null when the ref is already what the caller asked for, so a re-send burns no
 * undo slot — the no-op rule the whole surface shares.
 *
 * IT DOES NOT VALIDATE THE ID, and that is the same division of labour
 * `replacePresetCommand` states: the caller knows the library and asks
 * `presetIdRefusal`-shaped questions itself. `assign_section_preset` refuses an
 * id that is not a READABLE preset before it gets here, because a ref the build
 * cannot resolve is worse than no ref.
 *
 * ⚠ THIS WRITES `rasterRef`, NEVER `effectsRef` — see the command type's
 * docblock and core/formats/section-meta.ts for the ruling. And see
 * `RASTER_SECTION_BINDING_LIMIT` for where the binding stops, which is now a
 * question of WHICH SECTION: aeon's generator reads the key and emits the
 * chooser, and at `6e2495a5` exactly one `preset()` in their `ojz_effects.emp`
 * threads it — `OJZ_Preset_Sec5`, on `sec: 5`, whose sidecar carries
 * `ojz_sec5_showcase` since their `c9a462be`. This function does not know or
 * care which section it is writing (nor should it: the limit is the surface
 * that carries that, said once), but a caller reading its result as "bound"
 * should read the limit for what "bound" buys on the section they picked.
 *
 * TWO CALLERS NOW, AND THAT IS THE POINT OF THE FUNCTION. `assign_section_preset`
 * (renderer/agent/agent-handler.ts) and the per-section raster select in
 * `BandPresetPanel` — ROADMAP row 93's remaining half, landed. The select MUST
 * come through here and MUST NOT assign `rasterRef`: this function owns the `''`
 * sentinel, so a select's empty option and an agent's explicit `null` are the
 * same unbind, and it owns the no-op rule, so neither door can disagree about
 * what counts as a change worth an undo step.
 */
export function sectionPresetCommand(
  sectionIndex: number, currentRef: string | null, value: string,
): SetSectionRasterCommand | null {
  const newRef = value === '' ? null : value;
  if (newRef === currentRef) return null;
  return {
    type: 'set-section-raster',
    description: `Section ${sectionIndex} raster preset`,
    sectionIndex,
    oldRef: currentRef,
    newRef,
  };
}

/**
 * THE ONE EDIT PATH. Every control on this surface goes through it: clone the
 * preset, let `mutate` change whatever it likes, emit a whole-document swap — or
 * null when nothing actually moved.
 *
 * A mutator over a clone rather than a `{field, value}` delta, for the reason
 * the codec states about itself: a delta API needs a field enumeration, and the
 * whole point of this format's handling is that no such list exists. The no-op
 * check is a JSON comparison of the WHOLE document, which is honest about what
 * "changed" means (any key at any depth, including ones no control shows) and
 * cheap — a preset is a handful of bands of scalars.
 *
 * The no-op guard is what stops a `<select>` re-selecting the value it already
 * has from pushing an empty undo entry.
 */
export function editPresetCommand(
  library: EffectsPresetLibrary, id: string, description: string,
  mutate: (preset: EffectsPreset) => void,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  if (!existing) return null;
  const next = clonePreset(existing);
  mutate(next);
  if (JSON.stringify(next) === JSON.stringify(existing)) return null;
  return presetCommand(id, description, existing, next);
}

export function addBandCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Add band to ${id}`, (p) => { if (!p.bands) return; p.bands.push(newBand()); });
}

/**
 * Remove one band.
 *
 * REFUSES THE LAST ONE, and this is the one refusal on the surface. `bands` has
 * `minItems: 1`, so a zero-band document does not validate and could not be
 * written — the schema's own reason being that "a document that emits a
 * zero-band program is a document that should not exist". Returning null here
 * means the panel disables the button; `lastBandRefusal` is the sentence beside
 * it, so the disabled control and its reason come from the same place.
 */
export function removeBandCommand(
  library: EffectsPresetLibrary, id: string, index: number,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  const existingBands = existing?.bands ?? [];
  if (!existing || index < 0 || index >= existingBands.length) return null;
  if (existingBands.length <= 1) return null;
  return editPresetCommand(library, id, `Remove band ${index} from ${id}`,
    (p) => { if (!p.bands) return; p.bands.splice(index, 1); });
}

/**
 * Why the remove button is disabled, or null when it is not.
 *
 * THE SAME PREDICATE `removeBandCommand` REFUSES ON — `bands.length <= 1` lives
 * here once and both read it, rather than the component re-comparing a length it
 * happens to know. That is the brief's rule, and it is the difference between a
 * disabled button with a reason and a disabled button with a coincidence.
 *
 * ⚠ TWO ARMS SINCE THE ROOT BECAME A `oneOf`, AND THE CHANNEL IS ASKED FIRST.
 * On a RAMP document `(preset.bands ?? []).length` is 0, so the floor arm below
 * would answer "this is its only raster band" — FALSE, about a document that has
 * no bands at all — and a reader would go looking for the band it named. The
 * band controls really are refused there, but for a different reason, and
 * `bandControlsRefusal` (at the foot of this file) is that reason.
 * `removeBandCommand` refuses a ramp document too, on its index bound, so the
 * two still refuse together; what changes is only which true sentence is given.
 */
export function lastBandRefusal(preset: EffectsPreset): string | null {
  const channel = bandControlsRefusal(preset);
  if (channel !== null) return channel;
  if ((preset.bands ?? []).length > 1) return null;
  return `preset "${preset.id}": this is its only raster band, and a preset must have at least `
    + 'one — the schema refuses an empty bands list, because a document that emits a zero-band '
    + 'program is a document that should not exist. Delete the preset instead.';
}

/** Set `top`, `bot` or `sh` on one band. */
export function setBandFieldCommand<K extends 'top' | 'bot' | 'sh'>(
  library: EffectsPresetLibrary, id: string, index: number, field: K, value: EffectsPresetBand[K],
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} ${field}`, (p) => {
    const band = p.bands?.[index];
    if (!band) return;
    band[field] = value;
  });
}

/**
 * Switch a band's ON arm.
 *
 * REPLACES the arm rather than merging, because exactly one arm may be present
 * and the fields do not correspond: `cram` carries a colour LIST, `pal_region` a
 * staging slot and a count. Keeping the old arm's keys around "in case they come
 * back" would author a two-arm band the moment anything read the object.
 *
 * The author's old arm body is NOT lost to them — the swap is one undo step.
 */
export function setBandArmCommand(
  library: EffectsPresetLibrary, id: string, index: number, arm: string,
): SetEffectsPresetCommand | null {
  if (!EFFECTS_PRESET_ON_ARMS.includes(arm)) return null;
  return editPresetCommand(library, id, `Band ${index} ON arm`, (p) => {
    const band = p.bands?.[index];
    if (!band) return;
    if (bandArm(band) === arm) return;
    band.on = (arm === 'cram'
      ? { cram: { addr: 74, colours: [0] } }
      : { pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 } }
    ) as EffectsPresetBandOn;
  });
}

/** Set one integer field inside whichever arm the band carries. */
export function setArmFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} ${field}`, (p) => {
    const band = p.bands?.[index];
    if (!band) return;
    const arm = bandArm(band);
    if (arm === null) return;
    if (!presetArmFields(arm).includes(field)) return;
    const body = (band.on as unknown as Record<string, Record<string, unknown>>)[arm];
    body[field] = value;
  });
}

/**
 * Set the `cram` arm's colour list from the author's text.
 *
 * ═══ WHY A TEXT FIELD AND NOT N SPINNERS ═══
 *
 * `colours` is variable-length and its LENGTH is a second authored quantity — it
 * is also the derived restore's word count, so adding a colour changes what the
 * band costs, not only what it looks like. A row of spinners hides that; a list
 * the author edits as a list does not.
 *
 * PARSING IS SHAPE, NOT VALUE. A token that is not an integer means the panel
 * cannot build a document at all, so it refuses with `coloursRefusal` and writes
 * nothing. It does NOT range-check the integers it does parse — that is §E.4's
 * line, and the engine's own refusal carries the burst ceiling behind it.
 */
export function parseColours(
  text: string, subject?: string,
): { ok: true; colours: number[] } | { ok: false; reason: string } {
  // NAMED, LIKE EVERY OTHER MESSAGE ON THIS SURFACE (defect 7). The caller
  // passes `bandSubject(presetId, index, 'colours')`; the parameter is optional
  // only because this function is also reachable from a test and from the agent
  // path, where there is no card to point at.
  const where = subject === undefined ? '' : `${subject}: `;
  const tokens = text.split(/[\s,]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return {
      ok: false,
      reason: `${where}enter at least one colour word. An empty list is refused by the engine — `
        + 'the ON op would write nothing and the derived restore would have no span.',
    };
  }
  const colours: number[] = [];
  for (const t of tokens) {
    const n = /^0[xX][0-9a-fA-F]+$/.test(t) ? Number.parseInt(t, 16) : Number(t);
    if (!Number.isInteger(n)) {
      return { ok: false, reason: `${where}"${t}" is not an integer. Colours are CRAM words — `
        + 'decimal, or 0x-prefixed hex.' };
    }
    colours.push(n);
  }
  return { ok: true, colours };
}

export function setColoursCommand(
  library: EffectsPresetLibrary, id: string, index: number, colours: number[],
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} colours`, (p) => {
    const band = p.bands?.[index];
    if (!band || !('cram' in band.on)) return;
    band.on.cram.colours = colours.slice();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAKING CRAM SIGHTED — THE SWATCH AND THE ADDRESS GLOSS (EW-COLOUR-PICKER)
// ═══════════════════════════════════════════════════════════════════════════
//
// The cold-read walkthrough (docs/reviews/2026-09-02-effects-cold-walkthrough.md,
// a12 / a13, defect 13's colour half) measured what this surface asked of an
// author: `colours` wanted a decimal integer with no swatch anywhere — to learn
// what one looked like the reader opened a shipped preset and read `14` and
// `3584` out of it — and `addr = 74` had no rendering at all beyond a three-letter
// label, "though the panel elsewhere is happy to render a line mask as L0 L1 L2 L3
// chips". Both halves are answered here, and neither changes a byte of the wire.
//
// ⚠ THE WIRE FORMAT DOES NOT MOVE, and that is the `lines` bitmask precedent
// (ROADMAP row 97) applied a second time: ONE TOGGLE FLIPS ONE BIT, THE READOUT
// PRINTS THE INTEGER. `colours` stays an array of decimal integers; `addr` stays
// a byte address. The swatch is added BESIDE the text field an author may already
// be using, never instead of it, and the gloss is added BESIDE the raw spinner.
// An author who knows the BBB GGG RRR packing loses nothing.

/**
 * What `addr` MEANS, in the palette editor's own vocabulary.
 *
 * ⚠ DERIVED FROM `cramLocation`, WHICH IS DERIVED FROM THE HARDWARE CONSTANTS —
 * never from the value of a neighbouring field. `pal_region` carries `pal_line`
 * and `entry` as their own keys, and the obvious shortcut is to print those:
 * that would print what the FILE claims rather than what the ADDRESS says, and
 * the schema's own description of both keys is that they "must AGREE with addr"
 * — a rule the engine checks, which means a document can be on screen while they
 * disagree. This function is the address's answer, so the gloss stays true for
 * the `cram` arm (which has no such keys at all) and stays USEFUL for
 * `pal_region` (where a disagreement is now visible instead of silent).
 *
 * The three abnormal cases are NAMED rather than rendered as a plausible
 * location, because a confident "line 6 · entry 5" for an address the engine
 * will refuse is worse than the silence this replaces.
 */
export function addrGloss(addr: number): string {
  const at = cramLocation(addr);
  if (at === null) return 'not a CRAM address';
  const where = `line ${at.line} · entry ${at.entry}`;
  if (!at.inCram) return `${where} — past CRAM's ${CRAM_LINE_COUNT} lines`;
  if (!at.aligned) return `${where} — odd byte, not a word boundary`;
  return where;
}

/**
 * One swatch's hover text: which colour of the list it is, where in CRAM it
 * lands, and the word itself in both spellings the author may meet.
 *
 * BOTH SPELLINGS ON PURPOSE. The document holds decimal (that is the wire form
 * and what the text field beside the swatches shows); every other Genesis
 * surface in this app shows `$0EEE` (`fmtGenesisWord`). An author moving between
 * the palette facet and this panel has to be able to carry a colour across, and
 * a swatch that shows one spelling makes them do the conversion the walkthrough
 * was complaining about.
 */
export function colourSwatchTitle(addr: number, i: number, word: number): string {
  const at = cramLocation(addr + i * CRAM_WORD_BYTES);
  const where = at === null ? 'not a CRAM address'
    : `line ${at.line} · entry ${at.entry}`;
  return `Colour ${i} → ${where} — ${word} (${fmtGenesisWord(word)}). `
    + 'Click to open the R/G/B sliders. The list beside it stays the wire value.';
}

/**
 * Set ONE colour of the list, leaving every other entry byte-identical.
 *
 * ONE GESTURE, ONE UNDO STEP, and `editPresetCommand` supplies both halves: it
 * clones, mutates, and returns NULL when the document did not change. That last
 * clause is what makes the shared slider control safe here — `GenesisColorSliders`
 * commits on pointerup AND again on the blur that follows, and the second commit
 * carries the same word, so it builds no command and burns no undo slot. (The
 * palette grid solves the same double-commit by clearing a pre-drag snapshot;
 * this surface has no snapshot to clear, and does not need one.)
 */
export function setColourCommand(
  library: EffectsPresetLibrary, id: string, index: number, at: number, word: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Band ${index} colour ${at}`, (p) => {
    const band = p.bands?.[index];
    if (!band || !('cram' in band.on)) return;
    const colours = band.on.cram.colours;
    if (!Array.isArray(colours) || at < 0 || at >= colours.length) return;
    colours[at] = word;
  });
}

/**
 * The span this band's colours occupy, when it runs off the end of its line —
 * or null when it does not.
 *
 * ⚠ AN ADVISORY, NOT A REFUSAL, and the line is the same one `parseColours` draws:
 * that function refuses SHAPE (a token that is not an integer means no document
 * can be built at all) and forwards VALUE verbatim, because aeon §E.4 says a
 * writer must not range-check or clamp — the author is owed the engine's own
 * refusal with the measurement behind it. This sentence exists because the length
 * is authored in one control and the address in another, so the two can be
 * individually reasonable and jointly refused, and nothing on screen said so:
 * `stream_cram`'s value rules include "span within the line" (the schema's own
 * words, `$defs.cram.properties.addr`).
 *
 * The bound is CRAM_LINE_ENTRIES, so it moves with the hardware constant and not
 * with a 16 typed here.
 */
export function cramSpanAdvisory(
  band: EffectsPresetBand, presetId: string, index: number,
): string | null {
  if (!('cram' in band.on)) return null;
  const { addr, colours } = band.on.cram;
  if (!Array.isArray(colours) || colours.length === 0) return null;
  const at = cramLocation(addr);
  if (at === null) return null;
  const end = at.entry + colours.length;
  if (end <= CRAM_LINE_ENTRIES) return null;
  return `${bandSubject(presetId, index)}: ${colours.length} colours from entry ${at.entry} `
    + `run to entry ${end - 1}, past the end of line ${at.line} — a CRAM line holds `
    + `${CRAM_LINE_ENTRIES}. stream_cram requires the span to stay within the line, so this `
    + 'builds red. Lower the address or shorten the list.';
}

/** Set the writer-owned display label, or drop it when the author clears it. */
export function setPresetNameCommand(
  library: EffectsPresetLibrary, id: string, name: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} name`, (p) => {
    if (name === '') delete p.name;
    else p.name = name;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE OTHER TWO CHANNELS — `cycles` AND `variants` (ROADMAP §5.1 row 97, 2nd half)
// ═══════════════════════════════════════════════════════════════════════════
//
// Both keys are OPTIONAL at the root and both encode THREE STATES the schema
// keeps distinct on purpose (§7.2, rulings Q2 and Q5). The controls below author
// exactly those states and never fold one into another:
//
//   cycles    ABSENT  = keep the section's hand-authored cycle (the key is not
//                       written);  null = cycling OFF;  array = the script.
//   variants  ABSENT  = every slot keeps its hand value;  present = an array
//                       whose index IS the slot — a slot the array does not
//                       reach keeps its hand value, null at an index CLEARS it,
//                       an object authors it.
//
// So `[]` is a real document for both keys and is NEVER rewritten as null or
// as absence: for `cycles` it is the generator's refusal (the schema says so, and
// `emptyCyclesAdvisory` quotes it); for `variants` it reaches no slot. A control
// that "tidied" `[]` into null on first touch would have authored "cycling OFF"
// on the author's behalf — the exact defect the brief names.
//
// NO BOUNDS AND NO CLAMPING, as for the band spinners (aeon §E.4): every value
// is forwarded verbatim, and `variants[].lines` stays the engine's integer
// bitmask on the wire (ruling Q4) even where the panel offers checkboxes.
//
// NOTHING BELOW IS CONSUMED BY THE ENGINE YET — see core/formats/effects/
// preset-lag.ts, whose sentence the panel renders above these controls.

export type CyclesState = 'absent' | 'off' | 'authored';

/** Which of the three spellings the document carries for `cycles`. */
export function cyclesState(preset: EffectsPreset): CyclesState {
  if (!('cycles' in preset) || preset.cycles === undefined) return 'absent';
  if (preset.cycles === null) return 'off';
  return 'authored';
}

export const CYCLES_TITLE = presetFieldTitle(['properties', 'cycles']);
export const VARIANTS_TITLE = presetFieldTitle(['properties', 'variants']);

/** One cycle-channel field's title, straight from the schema. */
export function cycleFieldTitle(field: string): string {
  return presetFieldTitle(['$defs', 'cycle_channel', 'properties', field]);
}

/** One variant field's title, straight from the schema. */
export function variantFieldTitle(field: string): string {
  return presetFieldTitle(['$defs', 'pal_variant', 'properties', field]);
}

/**
 * The three `cycles` options, each labelled with the spelling it WRITES, so an
 * author reading the picker reads the file. The order is the schema's own.
 */
export const CYCLES_STATE_OPTIONS: readonly { value: CyclesState; label: string }[] = Object.freeze([
  { value: 'absent', label: 'keep the section\'s hand-authored cycle (key absent)' },
  { value: 'off', label: 'off (null)' },
  { value: 'authored', label: 'authored script (array of channels)' },
]);

/**
 * The seed channel an author starts from when switching `cycles` to a script.
 *
 * ONE CHANNEL, NOT ZERO, for the reason `newPreset` seeds one band: an empty
 * `cycles` array is legal JSON and the generator's refusal, so a script born
 * empty is born refused for a reason the author had no hand in. The numbers are
 * a starting point to replace, NOT a validated or "safe" channel — Aurora does
 * not know what is safe here. `line` seeds 2 because the schema's own sentence
 * on it is "Never 0: line 0 is the character's"; `period` seeds the schema's
 * own worked number ("period 8 means a rotation every 8 frames"). `dir` is left
 * absent because it is the one field the constructor defaults.
 */
export function newCycleChannel(): EffectsPresetCycleChannel {
  return { line: 2, first: 8, count: 4, period: 8 };
}

/**
 * Author one of the three `cycles` spellings.
 *
 * `absent` DELETES the key — `p.cycles = undefined` would still serialise as
 * a key on some writers and is a fourth spelling the schema does not have.
 * Switching to `authored` from either other state seeds ONE channel; an array
 * already there is kept as it is (so re-picking the current option is a no-op
 * and burns no undo slot, through `editPresetCommand`'s guard).
 */
export function setCyclesStateCommand(
  library: EffectsPresetLibrary, id: string, state: CyclesState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} cycles: ${state}`, (p) => {
    if (state === 'absent') { delete p.cycles; return; }
    if (state === 'off') { p.cycles = null; return; }
    if (!Array.isArray(p.cycles)) p.cycles = [newCycleChannel()];
  });
}

export function addCycleChannelCommand(
  library: EffectsPresetLibrary, id: string,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Add cycle channel to ${id}`, (p) => {
    if (!Array.isArray(p.cycles)) return;
    p.cycles.push(newCycleChannel());
  });
}

/**
 * Remove one channel — DOWN TO AN EMPTY ARRAY, deliberately. The schema accepts
 * `[]` and names it the generator's refusal; refusing it here would leave a
 * file that carries `[]` un-editable, and silently writing null instead would
 * author "cycling OFF". The empty array stays on screen with
 * `emptyCyclesAdvisory` under it, and the author picks the spelling they mean.
 */
export function removeCycleChannelCommand(
  library: EffectsPresetLibrary, id: string, index: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Remove cycle channel ${index} from ${id}`, (p) => {
    if (!Array.isArray(p.cycles) || index < 0 || index >= p.cycles.length) return;
    p.cycles.splice(index, 1);
  });
}

/**
 * Set one channel field. `dir` is the only optional one: `undefined` deletes
 * it, handing the value back to the constructor's default.
 */
export function setCycleFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number | undefined,
): SetEffectsPresetCommand | null {
  const { required, optional } = presetDefFields('cycle_channel');
  if (!required.includes(field) && !optional.includes(field)) return null;
  if (value === undefined && !optional.includes(field)) return null;
  return editPresetCommand(library, id, `Cycle channel ${index} ${field}`, (p) => {
    if (!Array.isArray(p.cycles)) return;
    const ch = p.cycles[index] as unknown as Record<string, unknown> | undefined;
    if (!ch) return;
    if (value === undefined) delete ch[field];
    else ch[field] = value;
  });
}

/**
 * The sentence under an EMPTY `cycles` array — the SCHEMA's own, read out of
 * the `cycles` description rather than retyped, and read loudly: if the
 * contract stops saying it, this throws at module load rather than advising
 * something the schema no longer holds.
 */
export const EMPTY_CYCLES_ADVISORY: string = (() => {
  const m = /An EMPTY array is legal JSON here[^.]*\.[^.]*\./.exec(CYCLES_TITLE);
  if (!m) {
    throw new Error('the schema\'s `cycles` description no longer carries its "An EMPTY array is '
      + 'legal JSON here" sentence — re-read the contract before advising on an empty script');
  }
  return m[0];
})();

export function emptyCyclesAdvisory(preset: EffectsPreset): string | null {
  return Array.isArray(preset.cycles) && preset.cycles.length === 0 ? EMPTY_CYCLES_ADVISORY : null;
}

export type VariantsState = 'absent' | 'present';
export type VariantSlotState = 'unreached' | 'cleared' | 'authored';

/** Whether the `variants` key is written at all. */
export function variantsState(preset: EffectsPreset): VariantsState {
  return !('variants' in preset) || preset.variants === undefined ? 'absent' : 'present';
}

export const VARIANTS_STATE_OPTIONS: readonly { value: VariantsState; label: string }[] = Object.freeze([
  { value: 'absent', label: 'every slot keeps its hand-authored value (key absent)' },
  { value: 'present', label: 'array — slot by slot below' },
]);

/**
 * The state of slot `index` as the document spells it. A slot past the end of
 * the array — and every slot when the key is absent — is `unreached`.
 */
export function variantSlotState(preset: EffectsPreset, index: number): VariantSlotState {
  const v = preset.variants;
  if (!Array.isArray(v) || index >= v.length) return 'unreached';
  return v[index] === null ? 'cleared' : 'authored';
}

/**
 * The slots the panel draws: every slot the array reaches, PLUS ONE unreached
 * slot the author can extend into. No slot COUNT is shown or enforced — the
 * schema carries none (PAL_MAX_VARIANTS is the engine's), and an over-long
 * array is the generator's refusal, named by it.
 */
export function variantSlotIndices(preset: EffectsPreset): number[] {
  const n = Array.isArray(preset.variants) ? preset.variants.length : 0;
  return Array.from({ length: n + 1 }, (_, i) => i);
}

export const VARIANT_SLOT_OPTIONS: readonly { value: VariantSlotState; label: string }[] = Object.freeze([
  { value: 'unreached', label: 'keep hand-authored value (array ends before this slot)' },
  { value: 'cleared', label: 'clear (null)' },
  { value: 'authored', label: 'author (object)' },
]);

/**
 * Write the `variants` key or delete it.
 *
 * `present` from absent writes `[]` — an array that reaches no slot. That is
 * semantically what absent means too, and the two are STILL different
 * documents: the author chose to write the key, and the file says so. Dropping
 * to `absent` deletes whatever slots were there, in ONE undo step.
 */
export function setVariantsStateCommand(
  library: EffectsPresetLibrary, id: string, state: VariantsState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} variants: ${state}`, (p) => {
    if (state === 'absent') { delete p.variants; return; }
    if (!Array.isArray(p.variants)) p.variants = [];
  });
}

/**
 * Author one slot's spelling.
 *
 *   unreached  — the array ENDS BEFORE this slot: it and every slot after it
 *                are dropped (the only spelling of "not reached" there is).
 *   cleared    — null at the index.
 *   authored   — an object at the index, born EMPTY: every variant field is
 *                optional with a constructor default, so `{}` is a complete,
 *                legal, number-free seed. Nothing is invented for it.
 *
 * Only the slot just past the end can be extended into (the panel offers no
 * other), so the array never grows a hole of undefined.
 */
export function setVariantSlotStateCommand(
  library: EffectsPresetLibrary, id: string, index: number, state: VariantSlotState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} variant slot ${index}: ${state}`, (p) => {
    if (!Array.isArray(p.variants) || index < 0 || index > p.variants.length) return;
    if (state === 'unreached') { p.variants.length = Math.min(index, p.variants.length); return; }
    const current = p.variants[index];
    if (state === 'cleared') { p.variants[index] = null; return; }
    if (current === null || current === undefined) p.variants[index] = {};
  });
}

/** The variant fields, in the schema's order — all optional. */
export const VARIANT_FIELDS: readonly string[] = presetDefFields('pal_variant').optional;

/**
 * The value a variant field is born with when the author sets it.
 *
 * A starting point, NOT a default: the constructor's defaults are aeon's and
 * are not restated here. 0 for every shift and bias is simply the smallest
 * integer to type over. `lines` seeds every line the SCHEMA's own rule permits
 * — bit 0 clear ("Line 0 is the character's and the mask's bit for it must be
 * clear"), at least one line named — which on a four-line CRAM is lines 1–3,
 * mask %1110 = 14.
 */
export function variantFieldSeed(field: string): number {
  return field === 'lines' ? 0b1110 : 0;
}

/**
 * Set or unset one field on an authored slot. `undefined` deletes the key —
 * every field is optional, and an absent field is the constructor's default,
 * which is a different document from an explicit value that happens to equal it.
 */
export function setVariantFieldCommand(
  library: EffectsPresetLibrary, id: string, index: number, field: string, value: number | undefined,
): SetEffectsPresetCommand | null {
  if (!VARIANT_FIELDS.includes(field)) return null;
  return editPresetCommand(library, id, `Variant slot ${index} ${field}`, (p) => {
    if (!Array.isArray(p.variants)) return;
    const slot = p.variants[index] as unknown as Record<string, unknown> | null | undefined;
    if (slot === null || slot === undefined) return;
    if (value === undefined) delete slot[field];
    else slot[field] = value;
  });
}

/**
 * The CRAM lines a `lines` mask names, for the checkbox spelling: bit n ⇔ line
 * n. Four lines, because the Genesis CRAM has four — and it now COUNTS from
 * `CRAM_LINE_COUNT` rather than spelling `[0, 1, 2, 3]`, so this list and the
 * address gloss cannot come to disagree about how many lines there are. The wire
 * value is still the integer, and bits above the last line — a hand-written file
 * could carry them — are preserved by `toggleVariantLineCommand`, which flips
 * ONE bit and nothing else.
 */
export const CRAM_LINES: readonly number[] =
  Object.freeze(Array.from({ length: CRAM_LINE_COUNT }, (_, i) => i));

export function variantLineOn(mask: number, line: number): boolean {
  return (mask & (1 << line)) !== 0;
}

export function toggleVariantLineCommand(
  library: EffectsPresetLibrary, id: string, index: number, line: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Variant slot ${index} line ${line}`, (p) => {
    if (!Array.isArray(p.variants)) return;
    const slot = p.variants[index];
    if (slot === null || slot === undefined || typeof slot.lines !== 'number') return;
    slot.lines = slot.lines ^ (1 << line);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TIMELINE'S EDITING HALF — WHAT A SPLIT IS, AND WHAT BOUNDS AN EDGE
// ═══════════════════════════════════════════════════════════════════════════
//
// ROADMAP §5.1 row 94. Everything below is DERIVED from aeon's shipped
// `engine/effects/raster_dsl.emp`, cited by the TEXT of the ensure rather than
// by a line number, because these are the rules a drag has to obey and a number
// copied out of a moving file is this repo's most-paid-for defect. Four rules,
// and they are not the same KIND of rule:
//
//   1. THE FIRE BOUND — `fire()` opens with
//        "fire: screen line {line} outside 3..223 (lines 0-2 belong to the
//         priming records)"
//      and BOTH of a band's edges go through `fire()`: `band()` returns
//      `[fire(top, ...), fire(bot, ...)]`. So `top` and `bot` are each bounded
//      3..223 — the SAME bound `EFFECTS_FIRE_LINE_MIN/MAX` already carries for
//      a vsplit's fire, imported here rather than re-typed.
//
//   2. THE ORDER RULE — `band()`'s own
//        ensure(top < bot, "band: top {top} must be above bot {bot}")
//      and the vendored schema says it twice more, on `top` and on `bot`.
//
//   3. THE GAP RULE — TWO BANDS MAY NOT SHARE A FIRE LINE, and this is the one
//      that decides what a SPLIT is. `compose` merges every fire on one screen
//      line into ONE record (`for line in 3..224 { ... }`, gathering across all
//      programs), and `raster_program` then refuses that record by name:
//        "the fire at line {n} carries the restore plus {n} other op(s) — the
//         restore's fire carries the restore ONLY ... a second stream op cannot
//         be placed in the same blanking window at all"
//      `check_intervals` says the same thing one level up ("Records must occupy
//      STRICTLY ASCENDING, DISJOINT fire-line intervals"), and names the
//      consequence: the arm gap is stored as the low byte of an $8Axx word, so
//      two records on one line make it -1, whose byte is $FF — RASTER_ARM_PARK,
//      which kills every remaining fire in the frame silently.
//
//      ⚠ SO ABUTTING BANDS DO NOT BUILD. `{top, bot: L}` beside `{top: L, bot}`
//      is a refused program, not a tight one. A split therefore leaves ONE
//      CLEAR LINE between the halves, and that line shows the base palette.
//
//      ═══ AND THAT SENTENCE IS A DATED CLAIM, NOT AN ENGINE LAW ═══
//
//      OVERLAP IS DESIGNED, NOT IMPOSSIBLE — aeon's own words, at the head of
//      `check_intervals`, and the reason this paragraph carries an expiry
//      instead of reading as physics. It shipped with ROADMAP row 94 stated as
//      a law in five places; this is the ONE statement of it in this repo, and
//      every other site quotes that sentence and points here rather than
//      re-deriving the rule. What a prohibition with no date costs is not
//      hypothetical: it is re-read by people who cannot tell "true today" from
//      "true always", and nothing ever goes red when the world moves.
//
//        • WRITTEN 2026-08-30, verified against aeon `2e976223` — their
//          `origin/master` at that moment, read with `git -C ../aeon show
//          <rev>:<path>` and never out of anyone's working tree.
//        • OWNER: aeon's lane. This is their engine rule and their design.
//          This editor does not own it, does not vote on it, and must not
//          pre-empt it.
//        • WHAT WOULD END IT: their **effects tail Part A** — "runtime
//          patchable-overlap resolution", BANKED 2026-08-17 by owner ruling
//          (demand-pull), design COMPLETE and three-times swept
//          (`docs/superpowers/specs/2026-08-17-effects-tail-design-v3.md`,
//          r3.1, zero open mechanisms). Its stated revival condition is
//          a real program that needs overlapping patchable bands — the
//          expected one being an Aurora-authored multi-band showcase, which
//          is to say: possibly a document written on THIS surface.
//        • ⚠ AND PART A LANDING WOULD NOT, BY ITSELF, LET THESE BANDS ABUT.
//          Two qualifications, both read at `2e976223`, and a reader who skips
//          them will sit waiting for the wrong event:
//            (a) Part A deletes `check_intervals`' disjointness wall for
//                PATCHABLE-vs-PATCHABLE pairs ONLY — DEFERRED_WORK.md's own
//                words are that statics stay sacrosanct via a symmetric
//                comptime scan. A preset document emits `band()` calls
//                (`tools/effects_gen.py`'s `render_band`), and `band()`'s
//                header says it is Static by construction — BOTH fires, and
//                not handable to `patchable`. So a route from a preset
//                document to a patchable fire would have to exist too, and at
//                this revision none does.
//            (b) The ensure an abutting PAIR actually reaches is not
//                `check_intervals`: `compose` merges the upper band's restore
//                and the lower band's ON onto line L as ONE record, and it is
//                `raster_program`'s restore-alone ensure (spec §4.2a, claim
//                D-B — quoted above) that refuses it. Part A does not name
//                that guard, and it is cost-founded rather than
//                bookkeeping-founded.
//        • RE-READ, at aeon's then-current master and NOT at `2e976223`, which
//          is a revision and not "now": `docs/DEFERRED_WORK.md` ("Effects tail
//          Part A" — whether it is still BANKED), `engine/effects/
//          raster_dsl.emp` (`check_intervals`' GUARD 2 block, `band()`'s
//          header, and `raster_program`'s restore-alone ensure) and
//          `tools/effects_gen.py` (`render_band` — whether a preset document
//          still lowers to a static `band()`).
//        • EVALUATE, DO NOT OBEY. If Part A ships AND a preset band can become
//          patchable, this paragraph is the lie it exists to prevent and the
//          advisory below is over-strict — fix it then, against the artifact.
//          If it is still banked, the paragraph is still true and nothing here
//          moves. Do not re-bank the prohibition without re-reading; do not
//          relax it because a design exists.
//
//      ⚠ AND THE ONE THING THIS IS NOT A LICENCE FOR. aeon's guard says it in
//      as many words: do not relax it ad hoc, because every naive relaxation
//      was proven unsound — three adjudications, 38 accepted defects, two of
//      them latent regressions a green suite would not have caught. So nothing
//      in this editor loosens on the strength of a banked design.
//      `bandCollisionAdvisory` stays exactly as strict as it is, and a session
//      that wants overlapping bands goes to aeon's design — never to this
//      file's comparisons.
//
//   4. THE OWNERSHIP RULE — `check_band_ownership`, the per-CRAM-entry
//      timeline, refuses two bands live on one entry at once:
//        "Two bands may share colours only if they do not overlap vertically"
//      Bands whose CRAM spans are DISJOINT are not constrained by it at all —
//      nesting them is legal, which is why this is an advisory and not a wall.
//
// ⚠ WHAT IS DELIBERATELY NOT HERE. The HEIGHT MINIMUM is not transcribed. It is
// `fire_cost_cycles(f_on) <= (bot - top) * RASTER_SCANLINE_CYC` — cost-keyed on
// purpose ("they re-price themselves the day the model does"), so any number
// Aurora wrote down would be a copied pin that goes stale silently. Neither is
// the S/H minimum, nor the band count. The engine's own `ensure` carries the
// measurement behind each ("the ON fire costs 624 cyc against 488 available"),
// which is aeon's §E.4 instruction to a writer and the whole reason this codec
// clamps nothing.
//
// ═══ CLAMP OR ADVISE — THE TWO RULINGS, AND THEIR JOIN ═══
//
// `effects-aeon.ts` rules that "the control that OWNS a value refuses to
// originate an illegal one and says why; every other route surfaces it rather
// than silently rewriting or blocking" — that is `clampLayerTop` plus
// `guideBoundNotice`, and a timeline drag is the same kind of gesture.
// `armOptions` above rules the other half: "DISABLE ONLY WHEN NO DOCUMENT
// CONTENT CAN MAKE THE VALUE LEGAL; when the precondition is another control's
// value, ADVISE instead of disabling."
//
// Their join, and it is exactly the 1/2 versus 3/4 line above:
//   • rules 1 and 2 are true whatever else the document says, so the DRAG
//     CLAMPS to them and says why it stopped (`bandEdgeNotice`, tone 'held').
//   • rules 3 and 4 depend on ANOTHER BAND's values, so they ADVISE
//     (`bandCollisionAdvisory`) and the drag lets the author make the mess and
//     read it named. Walling them would refuse legal programs — a nested band
//     over a disjoint CRAM span builds fine.
//
// And a SPINNER still writes what the author typed, unclamped, because §E.4 is
// about values FORWARDED to the generator and a typed number is the author's.
// A drag has no typed number: its value is where the pointer is.

// ═══════════════════════════════════════════════════════════════════════════
// NAMING THE THING — the prefix every message on this surface carries
// ═══════════════════════════════════════════════════════════════════════════
//
// EFFECTS-W1 defect 7. A failure an author met read, in full:
//
//     [Error] variant: lines mask 15 selects line 0 (the character's) — use
//     bits 1-3 @ Span { source: SourceId(8), start: 2800, end: 2906 }
//
// and could not be walked back to any control: no preset id, no band index, no
// field name — a byte offset into a generated file the author has never opened.
// aeon owns that message. What Aurora owns is every sentence IT produces, and
// the rule adopted here is that each one opens with the coordinates a person
// can act on.
//
// ⚠ WHICH COORDINATES, AND WHY NOT ALWAYS THREE. The brief asked for "the
// preset, the section, and the field". A BAND is not section-scoped — a preset
// document is act-ambient and any number of sections may bind it — so naming a
// section in a band's refusal would be a guess dressed as a fact. The split is:
//
//     a band / cycle / variant message   →  preset · which card · which field
//     a per-section binding message      →  section · preset
//
// so the coordinate named is always one the author can actually go and change.

/** `preset "x" · Raster band 0 · Top` — the coordinates, in the panel's own words. */
export function bandSubject(presetId: string, index: number, field?: string): string {
  return `preset "${presetId}" · Raster band ${index}${field === undefined ? '' : ` · ${field}`}`;
}

/** `preset "x" · Channel 0 · line`. */
export function cycleSubject(presetId: string, index: number, field?: string): string {
  return `preset "${presetId}" · Channel ${index}${field === undefined ? '' : ` · ${field}`}`;
}

/** `preset "x" · Slot 0 · lines`. */
export function variantSubject(presetId: string, index: number, field?: string): string {
  return `preset "${presetId}" · Slot ${index}${field === undefined ? '' : ` · ${field}`}`;
}

/** A band's two authored edges. Both are fire lines; neither is a payload. */
export type BandEdge = 'top' | 'bot';

/**
 * The CRAM BYTE range a band's ON op writes, or null when the band carries no
 * arm this codec recognises.
 *
 * BOTH ARMS SIZE THEIR SPAN FROM A COUNT THE AUTHOR EDITS: `cram` from the
 * LENGTH of `colours`, `pal_region` from `count` — the schema says of each that
 * it "is also the derived restore's word count". Two bytes per word.
 */
export function bandCramSpan(band: EffectsPresetBand): { start: number; end: number } | null {
  if ('cram' in band.on) {
    const colours = band.on.cram.colours;
    if (!Array.isArray(colours)) return null;
    return { start: band.on.cram.addr, end: band.on.cram.addr + 2 * colours.length };
  }
  if ('pal_region' in band.on) {
    const r = band.on.pal_region;
    return { start: r.addr, end: r.addr + 2 * r.count };
  }
  return null;
}

/**
 * Every SCREEN LINE this band puts a raster fire on.
 *
 * TWO for a plain band (`[fire(top, ...), fire(bot, ...)]`) and THREE when `sh`
 * is set, because the S/H shape adds the de-mix fire: aeon's `band()` returns
 * `[f_on_sh, fire(bot - 1, [reg_sh_off()]), fire(bot, ...)]`. The extra line is
 * INSIDE the band's own interval, so it never widens the band's footprint — it
 * only matters to rule 3, where a neighbour could land on it.
 */
export function bandFireLines(band: EffectsPresetBand): number[] {
  const sh = band.sh === true || band.sh === 1;
  if (!sh) return [band.top, band.bot];
  return band.bot - 1 === band.top ? [band.top, band.bot] : [band.top, band.bot - 1, band.bot];
}

/** Rule 1, as a sentence, in the engine's own numbers. */
export const BAND_EDGE_LAW =
  `both of a band's edges are raster fires, and a fire must land on ${EFFECTS_FIRE_LINE_MIN}..`
  + `${EFFECTS_FIRE_LINE_MAX} (lines 0-${EFFECTS_FIRE_LINE_MIN - 1} belong to the priming records)`;

/** Rule 2, as a sentence. */
export const BAND_ORDER_LAW =
  'a band covers top..bot-1, so top must stay above bot — the engine refuses top >= bot';

/**
 * Rule 3, as a sentence. The one a split is shaped by.
 *
 * ⚠ THE SENTENCE IS UNCHANGED AND SO IS THE REFUSAL — but the rule it describes
 * is DATED, not physics: see the GAP RULE block above (written 2026-08-30,
 * owner aeon's lane, ends if their banked effects-tail Part A revives AND a
 * preset band can become patchable). It is left as a flat present-tense
 * statement on purpose: it is read by an AUTHOR mid-drag, who needs to know
 * what today's build does, not who is going to change it. The provenance is
 * owed to whoever edits this file, and it is one screen up.
 */
export const BAND_GAP_LAW =
  'two bands cannot fire on one screen line: compose merges same-line fires into ONE record, and '
  + "the restore's fire carries the restore ALONE — a second stream op cannot be placed in the same "
  + 'blanking window. Two records on one fire line also store an arm gap of -1, whose byte is the '
  + 'PARK word, which kills every later fire in the frame silently';

/** Rule 4, as a sentence. */
export const BAND_OVERLAP_LAW =
  'two bands may share CRAM colours only if they do not overlap vertically — whichever restore '
  + "comes first writes this frame's BASE palette over the whole span, so the outer band's tint "
  + "ends at the inner band's bottom edge";

/**
 * What a DRAG of this edge may reach — rules 1 and 2 only.
 *
 * ⚠ THE NEIGHBOURS ARE NOT IN HERE, ON PURPOSE. See the "clamp or advise" block
 * above: a neighbouring band's position is another control's value, and walling
 * an edge off with it would refuse programs the engine builds (two bands over
 * disjoint CRAM spans may nest). Rules 3 and 4 are `bandCollisionAdvisory`.
 */
export function bandEdgeBounds(
  band: EffectsPresetBand, edge: BandEdge,
): { min: number; max: number } {
  if (edge === 'top') {
    return { min: EFFECTS_FIRE_LINE_MIN, max: Math.min(EFFECTS_FIRE_LINE_MAX, band.bot - 1) };
  }
  return { min: Math.max(EFFECTS_FIRE_LINE_MIN, band.top + 1), max: EFFECTS_FIRE_LINE_MAX };
}

/** The value a drag of this edge actually writes. Rounded, then held at the bound. */
export function clampBandEdge(band: EffectsPresetBand, edge: BandEdge, value: number): number {
  const b = bandEdgeBounds(band, edge);
  return Math.max(b.min, Math.min(b.max, Math.round(value)));
}

/**
 * ═══ WHY A TYPED NUMBER IS NOW REFUSED, AFTER A YEAR OF BEING FORWARDED ═══
 *
 * The block above ("clamp or advise") settled what a DRAG does and left the
 * SPINNER forwarding whatever the author typed, on aeon's §E.4: "Do not
 * validate ranges, and do not clamp. Forward what the author typed", so the
 * author reads the ENGINE's refusal with its measurement attached.
 *
 * ⚠ THAT WAS RIGHT ABOUT CLAMPING AND WRONG ABOUT SILENCE, and the cold
 * walkthrough measured the cost. `Top 200 / Bot 100` was accepted with no
 * error, no red and no warning, and became FOUR build errors in three
 * vocabularies quoting two specs the author cannot open. `Top = 40112` — a
 * typo the panel itself caused, by not selecting on click — was accepted just
 * as silently. The author's own report of this surface was that it "kept giving
 * errors during build time that I would have to stop and revert".
 *
 * SO THIS IS NOT A CLAMP AND §E.4 IS NOT BROKEN. Nothing here substitutes a
 * number: an illegal value is REFUSED, by name, at the control, with the
 * engine's own rule quoted — the value the author typed is never quietly
 * replaced by one Aurora invented, which is the thing §E.4 forbids. The
 * distinction is the whole design:
 *
 *     clamp   →  the document silently holds something the author did not type
 *     refuse  →  the document is unchanged and the author is told why
 *
 * ⚠ AND ONLY RULES 1 AND 2 ARE REFUSED — the two that are true whatever else
 * the document says. Rules 3 and 4 depend on ANOTHER band's values and stay
 * advisory (`bandCollisionAdvisory`), because walling them would refuse
 * programs the engine builds. That is the same 1/2-versus-3/4 line the drag
 * already draws, and it is drawn once, here, in `bandEdgeBounds`.
 *
 * ⚠ ORDER-RULE REFUSALS ARE ESCAPABLE, and the sentence says how. Refusing
 * `top >= bot` means a band cannot be moved DOWN by typing `top` first; the
 * message therefore ends "Move Bot first to make room", which is the same
 * escape `bandEdgeNotice` already gives a held drag. Both edges bound each
 * other, so there is always an order that works.
 */
export function bandEdgeRefusal(
  band: EffectsPresetBand, presetId: string, index: number, edge: BandEdge, value: number,
): string | null {
  if (!Number.isInteger(value)) {
    return `${bandSubject(presetId, index, edge === 'top' ? 'Top' : 'Bot')}: ${value} is not a `
      + 'whole number. A screen line is an integer.';
  }
  const b = bandEdgeBounds(band, edge);
  if (value >= b.min && value <= b.max) return null;
  const other = edge === 'top' ? band.bot : band.top;
  const outsideFire = value < EFFECTS_FIRE_LINE_MIN || value > EFFECTS_FIRE_LINE_MAX;
  const label = edge === 'top' ? 'Top' : 'Bot';
  // ⚠ IT NAMES WHAT THE DOCUMENT STILL HOLDS, and the first draft said "Not
  // written." instead — which is true of the refused number and NOT the whole
  // truth. `NumberField` commits per keystroke, so typing `40112` over `112`
  // walks through `4` and `40`, both of which are legal and both of which land;
  // the box then holds `40112` and the document holds `40`. Measured in the CDP
  // harness, not reasoned about. A message that says only "not written" leaves
  // an author looking at `40112` on screen with no idea what is in the file.
  const holds = `${label} is still ${band[edge]}.`;
  if (outsideFire) {
    return `${bandSubject(presetId, index, label)}: ${value} is not a `
      + `screen line — ${BAND_EDGE_LAW}. Refused; ${holds}`;
  }
  return `${bandSubject(presetId, index, label)}: ${value} would put Top `
    + `at or below Bot (${edge === 'top' ? `Bot is ${other}` : `Top is ${other}`}) — `
    + `${BAND_ORDER_LAW}. Move the other edge first to make room. Refused; ${holds}`;
}

/**
 * Why lighting this line in a `variants` mask is refused, or null.
 *
 * THE ONE CLICK THAT COST A RED BUILD. `L0` was offered because "a file can
 * carry it and the constructor's refusal is the constructor's to give" — and
 * the tooltip ON THE BUTTON ITSELF already said "Line 0 is the character's and
 * the mask's bit for it must be clear". One click, zero feedback, a build
 * failure naming a byte offset. The rule was in the product, at the control,
 * and did nothing.
 *
 * ⚠ IT REFUSES SETTING THE BIT, NEVER CLEARING IT. A hand-written file can
 * carry bit 0, and a panel that refused the click that FIXES it would trap the
 * author inside the illegal state with no control that can leave it. So the
 * asymmetry is deliberate and is what keeps the old "a file can carry it"
 * reasoning true.
 */
export function variantLineRefusal(
  presetId: string, slotIndex: number, mask: number, line: number,
): string | null {
  if (line !== 0) return null;
  if (variantLineOn(mask, line)) return null;   // turning it OFF is always allowed
  return `${variantSubject(presetId, slotIndex, 'lines')}: ${VARIANT_LINE_0_LAW} `
    + `Bits 1-3 are yours. Refused; the mask is still ${mask}.`;
}

/** The line-0 rule, in the schema's own words, read out of the contract. */
export const VARIANT_LINE_0_LAW: string =
  'Line 0 is the character\'s palette line and the mask\'s bit for it must be clear — aeon\'s '
  + 'build refuses the program with "variant: lines mask N selects line 0 (the character\'s) — '
  + 'use bits 1-3".';

/**
 * Why this cycle-channel field cannot hold this value, or null.
 *
 * ONLY `line` HAS A RULE HERE, and only the one the schema states outright
 * ("Never 0: line 0 is the character's"). `first`, `count` and `period` carry
 * no bound in the contract and none is invented: §E.4's instruction stands
 * wherever there is a rule to forward rather than a rule to enforce.
 */
export function cycleFieldRefusal(
  presetId: string, index: number, field: string, value: number,
): string | null {
  if (field !== 'line') return null;
  if (value !== 0) return null;
  return `${cycleSubject(presetId, index, 'line')}: 0 is the character's palette line, and the `
    + 'schema\'s own rule on this field is "Never 0". Pick 1, 2 or 3. Refused.';
}

/** `GuideBoundNotice`'s shape, for the same job on this surface. */
export interface BandEdgeNotice {
  tone: 'held';
  edge: 'min' | 'max';
  /** Which rule did the narrowing — the fire bound, or the band's other edge. */
  rule: 'fire' | 'order';
  limit: number;
  text: string;
}

/**
 * Why the edge being dragged stopped, or null when it did not.
 *
 * `requested` is the raw line the pointer is asking for. It must NOT speak when
 * nothing is wrong — `guideBoundNotice`'s requirement, and for its reason: an
 * advisory that is always on screen is read as decoration within a day and is
 * then not read at the one moment it matters.
 */
export function bandEdgeNotice(
  band: EffectsPresetBand, edge: BandEdge, requested: number, subject?: string,
): BandEdgeNotice | null {
  if (!Number.isFinite(requested)) return null;
  const want = Math.round(requested);
  const b = bandEdgeBounds(band, edge);
  if (want >= b.min && want <= b.max) return null;
  const which = want < b.min ? 'min' : 'max';
  const limit = which === 'min' ? b.min : b.max;
  // WHICH rule narrowed it, asked of the bounds rather than assumed from the
  // edge: `top`'s ceiling is the fire ceiling on a band whose `bot` is off the
  // bottom, and the ORDER rule's ceiling otherwise. Saying "order" there would
  // send the author to move the wrong number.
  const byFire = limit === (which === 'min' ? EFFECTS_FIRE_LINE_MIN : EFFECTS_FIRE_LINE_MAX);
  // NAMED WHERE THE CALLER KNOWS THE NAME (defect 7). A drag's notice used to
  // open "held at 223", which is true of any edge of any band of any preset.
  const where = subject === undefined ? '' : `${subject}: `;
  const text = byFire
    ? `${where}held at ${limit}. ${BAND_EDGE_LAW}. The build refuses a fire outside it.`
    : `${where}held at ${limit}. ${BAND_ORDER_LAW}. Move the other edge first to make room.`;
  return { tone: 'held', edge: which, rule: byFire ? 'fire' : 'order', limit, text };
}

/**
 * What this band collides with in the rest of the preset, or null.
 *
 * ⚠ THE 'ILLEGAL' TONE OF THE PAIR — it speaks about a DOCUMENT STATE, not about
 * a gesture, so it is true whether or not anything is being dragged. That is the
 * `v_offset` hole's lesson on the guide surface: the route that CREATES an
 * illegal state is often not the control that owns it, so the state itself has
 * to be visible with nobody asking.
 */
export function bandCollisionAdvisory(preset: EffectsPreset, index: number): string | null {
  const bands = preset.bands ?? [];
  const band = bands[index];
  if (!band) return null;
  const mine = bandFireLines(band);
  const mySpan = bandCramSpan(band);
  for (let j = 0; j < bands.length; j++) {
    if (j === index) continue;
    const other = bands[j];
    if (!other) continue;
    // ⚠ THE PAIR IS NAMED IN INDEX ORDER, NOT IN ASKING ORDER, and that is not
    // tidiness: a collision is a fact about a PAIR, and both members are asked
    // about it. Phrased from the asker's side the two answers would be two
    // different strings saying one thing, which the strip's notice list cannot
    // de-duplicate — and an author would read one defect as two.
    const [lo, hi] = index < j ? [index, j] : [j, index];
    const shared = bandFireLines(other).find((l) => mine.includes(l));
    if (shared !== undefined) {
      return `preset "${preset.id}": Raster band ${lo} and Raster band ${hi} both fire on screen `
        + `line ${shared}. ${BAND_GAP_LAW}. The build refuses the program.`;
    }
    const theirSpan = bandCramSpan(other);
    if (mySpan === null || theirSpan === null) continue;
    const spansMeet = mySpan.start < theirSpan.end && theirSpan.start < mySpan.end;
    const linesMeet = band.top < other.bot && other.top < band.bot;
    if (spansMeet && linesMeet) {
      const first = bands[lo]!;
      const second = bands[hi]!;
      return `preset "${preset.id}": Raster band ${lo} (lines ${first.top}..${first.bot}) and `
        + `Raster band ${hi} (lines ${second.top}..`
        + `${second.bot}) overlap vertically AND share CRAM bytes `
        + `${Math.max(mySpan.start, theirSpan.start)}..${Math.min(mySpan.end, theirSpan.end) - 1}. `
        + `${BAND_OVERLAP_LAW}. The build refuses the program.`;
    }
  }
  return null;
}

/**
 * What a split IS, said once, for the strip's hint and for the refusal.
 *
 * The one-clear-line half is not a policy choice — see rule 3 above, INCLUDING
 * its dated-claim block: the clear line is what aeon's build requires as of
 * 2026-08-30, not a law of the hardware, and the sentence an author reads stays
 * present-tense for the reason `BAND_GAP_LAW`'s docblock gives.
 */
export const BAND_SPLIT_LAW =
  'A split cuts one band into two over the same ON op, and leaves the cut line CLEAR: the upper '
  + "half's restore fires on it, and the lower half's ON op cannot share that fire. So the cut "
  + 'line shows the base palette, and a band needs at least three lines to have one to give.';

/**
 * The smallest height a band can be split at all.
 *
 * COMPUTED FROM THE TWO INEQUALITIES rather than written as 3, so it moves if
 * either of them does: the upper half needs `top < cut` and the lower half needs
 * `cut + 1 < bot`, so a legal cut exists exactly when `bot - top >= 1 + 2`.
 *
 * ⚠ THE `+ 1` IN `cut + 1` IS THE GAP RULE, AND THE GAP RULE IS DATED. It is
 * the one term here that comes from aeon rather than from arithmetic — see the
 * GAP RULE block above for its date, its owner and what would retire it. If
 * that rule ever goes, this function is where the 3 stops being 3, which is
 * exactly why the 3 was never written down.
 */
export function bandSplitMinHeight(): number {
  const shortestHead = 1;      // cut - top, at its minimum (top < cut)
  const shortestTail = 2;      // bot - cut, at its minimum (cut + 1 < bot)
  return shortestHead + shortestTail;
}

/** Why this band cannot be split, or null. */
export function bandSplitRefusal(band: EffectsPresetBand): string | null {
  const need = bandSplitMinHeight();
  if (band.bot - band.top >= need) return null;
  return `lines ${band.top}..${band.bot} is ${band.bot - band.top} line(s) tall and a split needs `
    + `${need}. ${BAND_SPLIT_LAW}`;
}

/** The line a split actually cuts on, held inside the band's legal cut range. */
export function bandSplitLine(band: EffectsPresetBand, requested: number): number {
  return Math.max(band.top + 1, Math.min(band.bot - 2, Math.round(requested)));
}

/**
 * Split one band in two at `requestedLine`. ONE undo step.
 *
 * THE LOWER HALF IS INSERTED IMMEDIATELY AFTER THE UPPER, and its ON op is a
 * structural clone of the original's — the two halves are the SAME effect over
 * two intervals, which is the only reading of "split" this format has.
 *
 * ⚠ THE ARRAY ORDER IS AUTHORING, NOT SEMANTICS, and it is worth saying which.
 * `compose` emits by SCREEN LINE (`for line in 3..224`), so the ownership walk
 * reads the two halves in line order whatever order they sit in `bands`. Array
 * order would decide that walk only for two fires ON ONE LINE — which rule 3
 * refuses anyway, at the revision the GAP RULE block above names. Adjacency
 * here is for the author reading the panel's list.
 *
 * THE BAND ID CANNOT COLLIDE, structurally: aeon derives it as
 * `band_id = top * 128 + sa`, the halves share `sa` (they share the ON op) and
 * differ in `top` by at least one, so the packed pair differs.
 */
export function splitBandCommand(
  library: EffectsPresetLibrary, id: string, index: number, requestedLine: number,
): SetEffectsPresetCommand | null {
  const existing = library.presets.find((p) => p.id === id);
  const band = existing?.bands?.[index];
  if (!existing || !band) return null;
  if (bandSplitRefusal(band) !== null) return null;
  const cut = bandSplitLine(band, requestedLine);
  return editPresetCommand(library, id, `Split band ${index} of ${id} at line ${cut}`, (p) => {
    const bands = p.bands;
    if (!bands) return;
    const b = bands[index];
    if (!b) return;
    const lower: EffectsPresetBand = {
      top: cut + 1, bot: b.bot, sh: b.sh, on: structuredClone(b.on),
    };
    b.bot = cut;
    bands.splice(index + 1, 0, lower);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MOVING ANCHOR — `patch_world_ys` + `patch_motion` (EW-TIMELINE-CLOCK)
// ═══════════════════════════════════════════════════════════════════════════
//
// EW-CHANNELS-WRITER (empyrean d36d704 / AURORA_EFFECTS_SCHEMA.md §7.3) taught
// the codec to accept, round-trip and write these two keys, and carried the
// ladders and converters so THIS surface would not re-derive them. Nothing
// authored them until now. Everything below is either read from the schema or
// imported from `core/formats/effects/preset.ts`; no bound and no ladder is
// retyped here.
//
// ═══ THE FOUR PROPERTIES A CONTROL ON THIS PATH CAN SILENTLY VIOLATE ═══
//
// 1. BOTH SHIFTS ARE BASE-2 LOGARITHMS. The schema's own words: the ranges are
//    "restated here only as THE RUNGS THE UI MUST OFFER", and "a slider must
//    SNAP to a rung: rounding a shift instead of snapping silently doubles or
//    halves the amplitude or the period, invisibly at author time". So this
//    surface OFFERS THE RUNGS — `ANCHOR_AMP_OPTIONS` / `ANCHOR_PERIOD_OPTIONS`
//    are the ladders themselves, and a control fed from them cannot emit an
//    off-ladder value at all, which is the stronger form of "must snap": there
//    is nothing left to snap. `phase` is the only continuous field.
//
// 2. THREE STATES PER INDEX, AND THEY ARE THREE. An index the array does not
//    reach KEEPS the section's hand-authored value; `null` is the sentinel
//    (`PATCH_ANCHOR_NONE` for a seed, `ANCHOR_MOTION_NONE` for a motion); a
//    value authors it. ⚠ **`0` IS A REAL WORLD Y** — above the screen top, the
//    most invasive state a channel can have — so no control here may map a
//    cleared field to 0, and `newAnchorWorldY` is deliberately not 0.
//    `anchorSeedRefusal` refuses the sentinel spelled as an integer for the
//    matching reason: two spellings of "unused" is one too many.
//
// 3. A MOTION ON A CHANNEL WITH NO SEED SHOWS NOTHING. The schema says it;
//    `ANCHOR_MOTION_WITHOUT_SEED` is that sentence read out of the contract,
//    and `anchorMotionWithoutSeedAdvisory` puts it under the control that
//    produced the state instead of letting an author ship a no-op.
//
// 4. THE SEED IS WHOLE PIXELS, 1:1. `EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL`
//    is 1 and NOTHING ON THIS PATH MULTIPLIES — the `drift.rate` habit (×256 on
//    export) lands a world Y 256 times down the level, where 224 × 256 = 57344
//    validates clean and the band silently never appears. The codec has a row
//    that goes red if anything here starts converting; it is not defeated.
//
// ═══ NO PADDING, AND NO HOLES EITHER ═══
//
// A SHORT ARRAY IS LEGAL AND IS NEVER PADDED — padding turns "the section keeps
// its hand-authored channel" into "the editor authored something here", which is
// a different document. The consequence is that a positional array cannot grow a
// HOLE either, so this surface offers a state change only at an index the array
// already reaches or ends exactly at (the `variants` slot rule), and
// `anchorExtendRefusal` is the sentence for the one case that leaves —
// authoring channel 2's motion while channel 1's is unspelled.
//
// AND AURORA NEVER WRITES AN EMPTY ARRAY. When the last spelled channel of a key
// is taken back to `unreached` the KEY IS DELETED, because `[]` and absent mean
// exactly the same thing for these two keys (unlike `cycles`, whose `[]` is the
// generator's own refusal and is preserved verbatim). Writing `[]` would put a
// key in the file that the author never asked for.

/** How the document spells one channel's SEED. */
export type AnchorSeedState = 'unreached' | 'unused' | 'authored';
/** How the document spells one channel's MOTION. */
export type AnchorMotionState = 'unreached' | 'still' | 'sweep';

export const ANCHOR_SEED_TITLE = presetFieldTitle(['properties', 'patch_world_ys']);
export const ANCHOR_MOTION_TITLE = presetFieldTitle(['properties', 'patch_motion']);
export const ANCHOR_SWEEP_TITLE = presetFieldTitle(['$defs', 'anchor_sweep']);

/** One sweep field's title, straight from the schema. */
export function anchorSweepFieldTitle(field: string): string {
  return presetFieldTitle(['$defs', 'anchor_sweep', 'properties', field]);
}

/**
 * THE SENTENCE ABOUT A MOTION WITH NO SEED — the schema's own, extracted rather
 * than retyped, and extracted LOUDLY. If the contract stops saying it this
 * throws at module load instead of quietly advising something the schema no
 * longer holds — `EMPTY_CYCLES_ADVISORY`'s posture, one key over.
 */
export const ANCHOR_MOTION_WITHOUT_SEED: string = (() => {
  const m = /A seed without a motion is legal and stationary;[^.]*\./.exec(ANCHOR_SEED_TITLE);
  if (!m) {
    throw new Error('the schema\'s `patch_world_ys` description no longer carries its "A seed '
      + 'without a motion is legal and stationary" sentence — re-read the contract before '
      + 'advising an author about a motion with no seed');
  }
  return m[0];
})();

/**
 * THE SEED A NEW SWEEP IS BORN WITH — the schema's OWN shipped precedent, parsed
 * out of its prose ("The shipped hand-authored precedent is OJZ_Preset_Sec0,
 * anchor_sweep(amp_shift: 4, period_shift: 1)"), never typed beside it.
 *
 * Two numbers Aurora does not get to invent: a fresh sweep is the one motion in
 * the shipped game, which is a starting point an author can SEE working rather
 * than a pair of ladder ends this repo picked. `phase` is left ABSENT because it
 * is the one field `anchor_sweep()` defaults, and an absent optional field is a
 * different document from an explicit 0 that happens to equal the default.
 */
export function newAnchorSweep(): EffectsPresetAnchorSweep {
  const m = /anchor_sweep\(amp_shift: (\d+), period_shift: (\d+)\)/.exec(ANCHOR_SWEEP_TITLE);
  if (!m) {
    throw new Error('the schema\'s `anchor_sweep` description no longer names its shipped '
      + 'hand-authored precedent in the shape anchor_sweep(amp_shift: N, period_shift: N) that a '
      + 'new sweep is seeded from — do NOT hardcode a rung pair: read the contract and re-derive');
  }
  return { amp_shift: Number(m[1]), period_shift: Number(m[2]) };
}

/**
 * The world Y a brand-new channel is born on.
 *
 * NOT 0, AND NOT A NUMBER THIS FILE INVENTED EITHER: it is the middle of the
 * engine's own visible band, `(EFFECTS_FIRE_LINE_MIN + EFFECTS_FIRE_LINE_MAX)/2`,
 * imported from the one module that declares that bound. With the camera at the
 * top of a level that is a seed an author can see, and it is a starting point to
 * type over rather than a value Aurora claims is right — `newBand`'s posture.
 *
 * ⚠ THE ONE VALUE IT MUST NOT BE IS 0, and that is not a style preference: 0 is
 * a real world Y above the screen top and the most invasive state a channel can
 * have, so a control that seeded it would author that state by default every
 * time an author opened a channel.
 */
export function newAnchorWorldY(): number {
  return Math.round((EFFECTS_FIRE_LINE_MIN + EFFECTS_FIRE_LINE_MAX) / 2);
}

/** The amplitude ladder as `<Select>` options — the rungs, in the schema's order. */
export const ANCHOR_AMP_OPTIONS: readonly { value: number; label: string }[] = Object.freeze(
  ANCHOR_AMP_RUNGS.map((r) => Object.freeze({
    value: r.amp_shift,
    label: `±${r.peak_px} px (${r.peak_to_peak_px} px of travel)`,
  })),
);

/**
 * The period ladder as `<Select>` options.
 *
 * SECONDS FIRST AND TICKS BESIDE THEM: seconds is what an author can judge, and
 * ticks is what the engine counts. Both come off the rung, so the two can never
 * disagree. Two decimals because the first rung is 4.27 s and rounding it to 4
 * would put a number on screen that is not the one the file means.
 *
 * ⚠ NO LEADING "every", AND IT WAS NOT A STYLE CHOICE. `every 1092.27 s (65536
 * ticks)` — the ladder's TOP RUNG — needed 192px in the 190px select and was
 * truncated on screen. This is a GENERATED label, so no one reading the source
 * would ever see the string that overflowed, and it is the one an author
 * reaches by picking the slowest sweep. The word was pure redundancy: the row's
 * own label is `Cycle`, so it read "Cycle: every 8.53 s". Found by
 * `anchor-authoring-harness` `[W1]`, which measures EVERY option rather than
 * whichever one the fixture happened to select.
 */
export const ANCHOR_PERIOD_OPTIONS: readonly { value: number; label: string }[] = Object.freeze(
  ANCHOR_PERIOD_RUNGS.map((r) => Object.freeze({
    value: r.period_shift,
    label: `${r.seconds.toFixed(2)} s (${r.ticks} ticks)`,
  })),
);

/** The rung a sweep's `amp_shift` names, or null when the file is off-ladder. */
export function anchorAmpRungOf(sweep: EffectsPresetAnchorSweep): AnchorAmpRung | null {
  return ANCHOR_AMP_RUNGS.find((r) => r.amp_shift === sweep.amp_shift) ?? null;
}

/** The rung a sweep's `period_shift` names, or null when the file is off-ladder. */
export function anchorPeriodRungOf(sweep: EffectsPresetAnchorSweep): AnchorPeriodRung | null {
  return ANCHOR_PERIOD_RUNGS.find((r) => r.period_shift === sweep.period_shift) ?? null;
}

/**
 * One line saying what this sweep DOES, in the units an author thinks in.
 *
 * Null when either shift is off the ladder. A hand-written file the schema would
 * refuse cannot reach this panel today, but a sentence that invented a number
 * for one would be worse than no sentence at all.
 */
export function anchorSweepSummary(sweep: EffectsPresetAnchorSweep): string | null {
  const amp = anchorAmpRungOf(sweep);
  const period = anchorPeriodRungOf(sweep);
  if (!amp || !period) return null;
  const steps = ANCHOR_PHASE_RANGE.max + 1;
  const pct = Math.round(((sweep.phase ?? 0) / steps) * 100);
  return `${amp.peak_to_peak_px} px of travel, up and down, once every `
    + `${period.seconds.toFixed(2)} s — starting ${pct}% into the cycle`;
}

/** The state of channel `index`'s SEED as the document spells it. */
export function anchorSeedState(preset: EffectsPreset, index: number): AnchorSeedState {
  const a = preset.patch_world_ys;
  if (!Array.isArray(a) || index >= a.length) return 'unreached';
  return a[index] === null ? 'unused' : 'authored';
}

/** The state of channel `index`'s MOTION as the document spells it. */
export function anchorMotionState(preset: EffectsPreset, index: number): AnchorMotionState {
  const a = preset.patch_motion;
  if (!Array.isArray(a) || index >= a.length) return 'unreached';
  return a[index] === null ? 'still' : 'sweep';
}

/** Channel `index`'s authored world Y, or null when it is not authored. */
export function anchorSeedValue(preset: EffectsPreset, index: number): number | null {
  const a = preset.patch_world_ys;
  if (!Array.isArray(a) || index >= a.length) return null;
  const v = a[index];
  return typeof v === 'number' ? v : null;
}

/** Channel `index`'s authored sweep, or null when it carries no motion object. */
export function anchorSweepOf(
  preset: EffectsPreset, index: number,
): EffectsPresetAnchorSweep | null {
  const a = preset.patch_motion;
  if (!Array.isArray(a) || index >= a.length) return null;
  const m = a[index];
  return m && typeof m === 'object' ? m.sweep : null;
}

/**
 * The channels the panel draws: every channel EITHER key reaches, plus one to
 * extend into — capped at `EFFECTS_PRESET_MAX_PATCH`, which is the schema's own
 * `maxItems` and not a number chosen here.
 *
 * `variants` draws its slots the same way and for the same reason. The cap is
 * the one difference: `variants` has none in the schema, `patch_world_ys` has 4.
 */
export function anchorChannelIndices(preset: EffectsPreset): number[] {
  const seeds = Array.isArray(preset.patch_world_ys) ? preset.patch_world_ys.length : 0;
  const motion = Array.isArray(preset.patch_motion) ? preset.patch_motion.length : 0;
  const n = Math.min(Math.max(seeds, motion) + 1, EFFECTS_PRESET_MAX_PATCH);
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * The three seed spellings, each labelled with what it WRITES.
 *
 * ⚠ `unused` READS "null", NOT "0" AND NOT A BARE "none". The whole hazard this
 * key carries is that 0 is a real — and the most invasive — world Y; a picker
 * saying "none" beside a number field is one an author can reasonably read as
 * "zero". The option says the spelling the file gets.
 *
 * ═══ THESE ARE SHORT BECAUSE THE BOX IS 190px, AND THAT IS NOT NEGOTIABLE ═══
 *
 * These labels sit in a `<select>` that gets **190px** — the effects column is
 * 300px, the shared label column takes 64 of it, and the rest is padding and
 * gaps (`anchor-authoring-harness` `[W0]`, measured). The first spelling of
 * this table needed **347px** and was ellipsed to `keep the section's hand-auth…`
 * on screen, so the one word that distinguishes the three states — *keep* —
 * survived only by luck of being first.
 *
 * ⚠ AND NO LABEL-COLUMN WIDTH CAN FIX THAT. Even at `LABEL_W = 0` the select
 * would reach about 254px, still short of 347. A `<select>` does not wrap and
 * does not overflow; it truncates, silently, and `scrollWidth` is clamped so
 * the element itself will not admit it. The words had to come down.
 *
 * WHAT WAS TRADED, said plainly rather than quietly:
 *   - `the section's` → gone. "hand-authored" already means "already in the
 *     file, not written by this editor", which is the distinction that matters
 *     at the control. The full sentence survives in the select's `title`, which
 *     is the schema's own description.
 *   - `(array ends here)` → gone from the option. It is the FILE SPELLING, and
 *     it is still said in full by `anchorExtendRefusal` at the moment it
 *     constrains anybody ("anything but ... will do") and by the title.
 *   - `(whole pixels)` → gone. The unit is on the World Y row itself
 *     (`px, level space`), and `anchorSeedRefusal` names the whole-pixel rule
 *     in a sentence at the moment a fraction is typed, which is the only moment
 *     it is actionable.
 *   - `about the seed` → gone from `sweep`. The section's own opening
 *     paragraph already says a sweep "makes that point drift up and down on a
 *     timer", and the seed's row sits immediately above this one.
 *   - `(object)` → gone from `sweep`, and it is the one asymmetry here.
 *     `(null)` stays on both spellings that write one, because null-versus-a-
 *     number is the documented hazard this whole key carries. `(object)` is a
 *     JSON type name that helps only somebody reading the file, and the object
 *     itself becomes visible the instant `sweep` is picked — Travel, Cycle and
 *     Start at are its three keys, drawn directly below.
 * Nothing that distinguishes one state from another was traded.
 *
 * ⚠ MEASURED, NOT ESTIMATED, AND THE FIRST ATTEMPT AT THIS WAS WRONG. Guessing
 * a character budget from a couple of samples put two of these labels 4px and
 * 10px over — an em-dash between spaces is dearer than the letters around it.
 * Every string here is sized by `[W1]` against the rendered box; when one is
 * reworded, re-run `npm run harness:anchor-authoring` rather than counting.
 */
export const ANCHOR_SEED_OPTIONS: readonly { value: AnchorSeedState; label: string }[] =
  Object.freeze([
    { value: 'unreached', label: 'keep hand-authored anchor' },
    { value: 'unused', label: 'channel unused (null)' },
    { value: 'authored', label: 'follow a world Y' },
  ]);

/** The three motion spellings, on the same terms — and the same 190px. */
export const ANCHOR_MOTION_OPTIONS: readonly { value: AnchorMotionState; label: string }[] =
  Object.freeze([
    { value: 'unreached', label: 'keep hand-authored motion' },
    { value: 'still', label: 'no motion (null)' },
    { value: 'sweep', label: 'sweep up and down' },
  ]);

/**
 * Why this world Y cannot be written, or null.
 *
 * TWO REFUSALS AND NOTHING ELSE, both of them the schema's own and neither of
 * them a clamp: the u16 range, and the sentinel spelled as an integer. Every
 * other number is forwarded verbatim — this surface does not know where a level
 * ends, and the band spinners' rule (aeon §E.4) holds here too.
 */
export function anchorSeedRefusal(worldY: number): string | null {
  if (!Number.isInteger(worldY)) {
    return 'A world Y is a whole pixel of absolute level space — there is no sub-pixel here.';
  }
  if (worldY < EFFECTS_PRESET_WORLD_Y_RANGE.min || worldY > EFFECTS_PRESET_WORLD_Y_RANGE.max) {
    return `The engine field is a u16, so a world Y is ${EFFECTS_PRESET_WORLD_Y_RANGE.min} to `
      + `${EFFECTS_PRESET_WORLD_Y_RANGE.max}. ${worldY} would not validate and could not be saved.`;
  }
  if (worldY === EFFECTS_PRESET_PATCH_ANCHOR_NONE) {
    return `${EFFECTS_PRESET_PATCH_ANCHOR_NONE} is the engine's "channel unused" sentinel and the `
      + 'schema refuses it as a number, so the two spellings cannot both mean it. To leave this '
      + 'channel unused pick "channel unused (null)" above.';
  }
  return null;
}

/** Why this phase cannot be written, or null. `phase` is the one continuous field. */
export function anchorPhaseRefusal(phase: number): string | null {
  if (!Number.isInteger(phase)
    || phase < ANCHOR_PHASE_RANGE.min || phase > ANCHOR_PHASE_RANGE.max) {
    return `Phase is a whole step into the 256-entry sine table: ${ANCHOR_PHASE_RANGE.min} to `
      + `${ANCHOR_PHASE_RANGE.max}, one full cycle.`;
  }
  return null;
}

/**
 * Why a channel's state cannot be changed on this key yet, or null.
 *
 * THE ONE CASE A POSITIONAL ARRAY LEAVES. Both arrays are positional and neither
 * may grow a hole, so a channel can only be spelled when its key's array already
 * reaches it or ends exactly at it. Authoring channel 2's motion while channel
 * 1's is unspelled would have to invent channel 1 — and the only value it could
 * invent is `null`, which is not "unspelled", it is "no motion": a different
 * document. So it REFUSES, and names the channel to spell first.
 *
 * ⚠ THIS IS A REFUSAL, NOT A CLAMP AND NOT A FILL. Filling the gap would be one
 * click and would silently author a channel the author was not looking at —
 * `deletePresetRefusal`'s reasoning, on a smaller surface.
 */
export function anchorExtendRefusal(
  preset: EffectsPreset, key: 'seed' | 'motion', index: number,
): string | null {
  const arr = key === 'seed' ? preset.patch_world_ys : preset.patch_motion;
  const len = Array.isArray(arr) ? arr.length : 0;
  if (index <= len) return null;
  const what = key === 'seed' ? 'anchor' : 'motion';
  return `Channel ${len}'s ${what} is not spelled yet, and a positional array cannot have a hole. `
    + `Spell channel ${len} first — anything but "array ends here" will do.`;
}

/**
 * The sentence under a motion authored on a channel with no seed, or null.
 *
 * The SCHEMA'S OWN sentence (`ANCHOR_MOTION_WITHOUT_SEED`), shown exactly when
 * the document is in the state it describes: a sweep at an index whose seed is
 * not authored. An author who writes that ships a no-op, and nothing else in the
 * suite would tell them — aeon's generator lowers it without complaint, and in a
 * game whose `SCANLINE_CAPS` does not raise `CAP_ANCHOR_MOTION` the whole motion
 * is a silent no-op anyway (the schema's `patch_motion` sentence, one hover away
 * on this field's own title).
 */
export function anchorMotionWithoutSeedAdvisory(
  preset: EffectsPreset, index: number,
): string | null {
  if (anchorMotionState(preset, index) !== 'sweep') return null;
  if (anchorSeedState(preset, index) === 'authored') return null;
  return ANCHOR_MOTION_WITHOUT_SEED;
}

/** Drop a key that has become an empty array. Aurora never writes `[]` here. */
function pruneEmptyAnchorKey(p: EffectsPreset, key: 'patch_world_ys' | 'patch_motion'): void {
  const arr = p[key];
  if (Array.isArray(arr) && arr.length === 0) delete p[key];
}

/**
 * Author one channel's SEED spelling.
 *
 *   unreached — the array ENDS BEFORE this channel: it and every channel after
 *               it are dropped, and an array left empty takes its key with it.
 *   unused    — `null` at the index.
 *   authored  — a number at the index, `newAnchorWorldY()` and never 0.
 *
 * An index past the end of the array (`anchorExtendRefusal`'s case) and an index
 * at or past `EFFECTS_PRESET_MAX_PATCH` both change nothing, so a caller that is
 * not the panel cannot open a hole or overrun the schema's `maxItems` either.
 */
export function setAnchorSeedStateCommand(
  library: EffectsPresetLibrary, id: string, index: number, state: AnchorSeedState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} channel ${index} anchor: ${state}`, (p) => {
    const a = Array.isArray(p.patch_world_ys) ? p.patch_world_ys : [];
    if (index < 0 || index > a.length || index >= EFFECTS_PRESET_MAX_PATCH) return;
    p.patch_world_ys = a;
    if (state === 'unreached') a.length = Math.min(index, a.length);
    else if (state === 'unused') a[index] = null;
    else if (typeof a[index] !== 'number') a[index] = newAnchorWorldY();
    pruneEmptyAnchorKey(p, 'patch_world_ys');
  });
}

/** Set one channel's authored world Y. A refused value never reaches the document. */
export function setAnchorSeedCommand(
  library: EffectsPresetLibrary, id: string, index: number, worldY: number,
): SetEffectsPresetCommand | null {
  if (anchorSeedRefusal(worldY) !== null) return null;
  return editPresetCommand(library, id, `Preset ${id} channel ${index} world Y`, (p) => {
    const a = p.patch_world_ys;
    if (!Array.isArray(a) || index < 0 || index >= a.length) return;
    if (typeof a[index] !== 'number') return;
    a[index] = worldY;
  });
}

/** Author one channel's MOTION spelling. Mirrors the seed's three states exactly. */
export function setAnchorMotionStateCommand(
  library: EffectsPresetLibrary, id: string, index: number, state: AnchorMotionState,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} channel ${index} motion: ${state}`, (p) => {
    const a = Array.isArray(p.patch_motion) ? p.patch_motion : [];
    if (index < 0 || index > a.length || index >= EFFECTS_PRESET_MAX_PATCH) return;
    p.patch_motion = a;
    if (state === 'unreached') a.length = Math.min(index, a.length);
    else if (state === 'still') a[index] = null;
    else {
      const cur = a[index];
      if (!cur || typeof cur !== 'object') a[index] = { sweep: newAnchorSweep() };
    }
    pruneEmptyAnchorKey(p, 'patch_motion');
  });
}

/**
 * Set one shift on a channel's sweep.
 *
 * ⚠ THE VALUE IS A RUNG, NOT A PHYSICAL QUANTITY, and this REFUSES anything the
 * ladder does not carry rather than rounding it. `ANCHOR_AMP_OPTIONS` /
 * `ANCHOR_PERIOD_OPTIONS` are the only thing the panel feeds it, so from the UI
 * the refusal is unreachable — it is here because an agent, a paste or a later
 * caller is not the UI, and a shift rounded by one rung is a doubling that
 * nothing downstream would report.
 */
export function setAnchorSweepShiftCommand(
  library: EffectsPresetLibrary, id: string, index: number,
  field: 'amp_shift' | 'period_shift', shift: number,
): SetEffectsPresetCommand | null {
  const onLadder = field === 'amp_shift'
    ? ANCHOR_AMP_RUNGS.some((r) => r.amp_shift === shift)
    : ANCHOR_PERIOD_RUNGS.some((r) => r.period_shift === shift);
  if (!onLadder) return null;
  return editPresetCommand(library, id, `Preset ${id} channel ${index} ${field}`, (p) => {
    const a = p.patch_motion;
    if (!Array.isArray(a) || index < 0 || index >= a.length) return;
    const m = a[index];
    if (!m || typeof m !== 'object' || !m.sweep) return;
    m.sweep[field] = shift;
  });
}

/**
 * Set or unset a sweep's `phase`. `undefined` deletes it, handing the value back
 * to `anchor_sweep()`'s own default of 0 — a different document from an explicit
 * 0, which is why the panel offers both spellings.
 */
export function setAnchorPhaseCommand(
  library: EffectsPresetLibrary, id: string, index: number, phase: number | undefined,
): SetEffectsPresetCommand | null {
  if (phase !== undefined && anchorPhaseRefusal(phase) !== null) return null;
  return editPresetCommand(library, id, `Preset ${id} channel ${index} phase`, (p) => {
    const a = p.patch_motion;
    if (!Array.isArray(a) || index < 0 || index >= a.length) return;
    const m = a[index];
    if (!m || typeof m !== 'object' || !m.sweep) return;
    if (phase === undefined) delete m.sweep.phase;
    else m.sweep.phase = phase;
  });
}

/**
 * WHERE THE ANCHOR IS AT TICK `t`, in pixels of offset from its seed.
 *
 * THE PREVIEW'S ONE PIECE OF ARITHMETIC, and it lives here rather than inside
 * the canvas that draws it so that a node row can read it: peak `256 >>
 * amp_shift` px, one cycle `256 << period_shift` ticks, `phase` a whole step
 * into a 256-entry sine table. Every number comes off a rung; nothing is retyped
 * and nothing is scaled.
 *
 * ⚠ IT IS NOT A CLAIM ABOUT A SCREEN, AND THAT LIMIT IS STRUCTURAL. The band's
 * screen line is `anchor - Camera_Y`, and THIS DOCUMENT DOES NOT SAY WHICH BAND
 * A CHANNEL DRIVES — a preset `band` carries `top`, `bot`, `sh` and `on`, and no
 * channel index — so nothing here can draw a moving band. What this returns is
 * the EXCURSION about the seed, which is exactly what the two authored rungs
 * mean and no more.
 */
export function anchorOffsetAtTick(sweep: EffectsPresetAnchorSweep, tick: number): number {
  const amp = anchorAmpRungOf(sweep);
  const period = anchorPeriodRungOf(sweep);
  if (!amp || !period) return 0;
  const steps = ANCHOR_PHASE_RANGE.max + 1;
  const turns = (tick / period.ticks) + ((sweep.phase ?? 0) / steps);
  return amp.peak_px * Math.sin(turns * 2 * Math.PI);
}

/**
 * Logic ticks per second, taken from a RUNG (`ticks / seconds`) rather than
 * typed as 60. The ladder already carries both, so the preview's clock and the
 * period labels cannot come to disagree about how long a cycle is.
 */
export const ANCHOR_TICK_HZ: number =
  ANCHOR_PERIOD_RUNGS[0].ticks / ANCHOR_PERIOD_RUNGS[0].seconds;

/**
 * The tallest peak on the ladder — what the preview scales its envelope to, so
 * a 1 px sweep LOOKS like a 1 px sweep beside a 64 px one instead of every rung
 * filling the strip and every sweep looking identical.
 */
export const ANCHOR_MAX_PEAK_PX: number =
  ANCHOR_AMP_RUNGS.reduce((m, r) => Math.max(m, r.peak_px), 0);

// ---------------------------------------------------------------------------
// THE DENSE RASTER CHANNEL — `ramp`'s derivations, refusals and commands
// ---------------------------------------------------------------------------
//
// ═══ WHAT THE CONTROL IS, AND WHAT IT MUST NEVER BECOME ═══
//
// ONE LINEAR RATE AND ONE START, OVER A `top`/`lines` SPAN. That is the whole
// mechanism. `RasterRampProgram` has one `rrp_step` and one `rrp_start` and no
// field that could receive a table, so a per-line curve is not merely refused
// here — it is INEXPRESSIBLE, and a control that implied otherwise would let an
// author write a document that validates, generates, and is silently wrong on
// hardware. There is no curve editor below, no multi-point widget and no
// per-line table, and there must never be one: that is an engine change first
// and a contract change second, in that order. `RAMP_MUST_NOT` is the schema's
// own statement of it, parsed out of the contract rather than retyped, so it
// cannot drift from the rule it states.
//
// ═══ NOTHING HERE RE-DERIVES A BOUND ═══
//
// Every number below comes from `core/formats/effects/preset.ts`, which reads
// them off the vendored schema with module-load guards. In particular
// `EFFECTS_PRESET_RAMP_SPAN_MAX` — the per-field maxima are a VALID-LOOKING PAIR
// THAT FAILS THE BUILD (`top` 222 and `lines` 220 each satisfy every schema
// keyword and their sum does not) — and the two display constants,
// `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET` and
// `EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG`, whose whole point is that a readout one
// line high looks correct. They are DIFFERENT QUANTITIES that agreed until
// empyrean `e9409dc`; do not substitute one for the other.

/** The `ramp` key's own title — the contract's paragraph, at the point of use. */
export const RAMP_TITLE = presetFieldTitle(['properties', 'ramp']);

/** Every ramp field's title, straight from the schema. */
export const RAMP_FIELD_TITLES = Object.freeze({
  top: presetFieldTitle(['$defs', 'ramp', 'properties', 'top']),
  lines: presetFieldTitle(['$defs', 'ramp', 'properties', 'lines']),
  start: presetFieldTitle(['$defs', 'ramp', 'properties', 'start']),
  step: presetFieldTitle(['$defs', 'ramp', 'properties', 'step']),
  addr: presetFieldTitle(['$defs', 'ramp_target', 'properties', 'vsram', 'properties', 'addr']),
  target: presetFieldTitle(['$defs', 'ramp_target']),
});

/** The ramp's required keys, in the schema's own `required` order. */
export const RAMP_KEYS: readonly string[] =
  Object.freeze([...(schemaNode(['$defs', 'ramp']).required as string[])]);

/**
 * THE MUST NOT, IN THE CONTRACT'S OWN WORDS — parsed, never retyped.
 *
 * The schema states it in the `ramp` property's description, and this reads that
 * sentence. If empyrean ever drops it, this throws at module load rather than
 * leaving the panel quietly asserting a rule the contract no longer states —
 * which is the direction that matters, because the rule exists to stop a control
 * being built that the engine cannot honour.
 */
export const RAMP_MUST_NOT: string = (() => {
  const m = /THE MUST NOT: (.*?engine cannot honour\.)/s.exec(RAMP_TITLE);
  if (!m || !/curve/i.test(m[1])) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer states the per-line-curve MUST NOT in its ' +
      '`ramp` property description, which is the only contract-side statement of it and the reason ' +
      'this panel offers one rate and one start rather than a per-line table. Re-read the schema — ' +
      'do NOT retype the sentence here.',
    );
  }
  return m[1];
})();

/**
 * The painted half of it, at an author's length.
 *
 * `presetLimitsShort()`'s split, for its reason: the contract sentence carries
 * `raster.emp` line numbers and an artifact section number, which is owed to the
 * agent surface and useless in a 285px column. The short one is PAINTED and the
 * contract one is on the same element's `title`; `ramp-control-wording.test.ts`
 * fails if either half stops reaching the panel, and asserts they make the same
 * claim (both name the curve, both name the single rate).
 */
export const RAMP_MUST_NOT_SHORT =
  'One rate and one start, over the whole span. There is no per-line curve and there cannot be '
  + 'one: the engine has a single step and a single start and no field that could hold a table.';

/**
 * A brand-new ramp — every one of the five keys written, because the
 * constructor defaults NONE of them (`newBand`'s rule, and the schema says so).
 *
 * THE NUMBERS ARE A STARTING POINT AN AUTHOR WILL REPLACE, not a validated or
 * "safe" ramp: Aurora does not know what is safe on a scanline budget, and a
 * seed that pretended to would be the clamp aeon's §E.4 forbids wearing a
 * different hat. What they ARE is a ramp that BUILDS: `top` 64 + `lines` 128 is
 * 192, inside `EFFECTS_PRESET_RAMP_SPAN_MAX`, so a fresh ramp is not born
 * tripping the frame-rewind interlock for a reason the author had no hand in —
 * the seed rule `newBand` sets for the band height rule.
 *
 * `addr` seeds 0, plane A's whole-plane vertical scroll, which is the one
 * address the contract establishes a meaning for. `step` seeds a QUARTER PIXEL
 * per scanline rather than zero: a zero step is legal and inert, and a control
 * whose first state does nothing teaches the author it does nothing.
 */
export function newRamp(): EffectsPresetRamp {
  return {
    top: 64,
    lines: 128,
    target: { vsram: { addr: 0 } },
    start: { whole: 0, frac256: 0 },
    step: { whole: 0, frac256: 64 },
  };
}

// ── the fp16 grid, as an author's decimal ───────────────────────────────────

/**
 * How many `frac256` units make one pixel, off the field's own maximum — the
 * codec's own derivation, imported rather than a second `256` typed here.
 */
const RAMP_RATE_UNITS_PER_PX = EFFECTS_PRESET_FP16_FRAC_RANGE.max + 1;

/** The smallest step an author can spell — one `frac256` unit. */
export const RAMP_RATE_UNIT = 1 / RAMP_RATE_UNITS_PER_PX;

/**
 * The authored range's ends, BUILT FROM THE ENCODING rather than stated.
 *
 * The schema is explicit that the STORAGE is wider than the authored range —
 * signed 16.16, roughly 64 times as much — and that "a control built on the
 * storage width offers an author values the build refuses". So these come from
 * `whole`'s and `frac256`'s own bounds through the codec's one conversion.
 */
export const RAMP_RATE_MIN: number = presetFp16ToNumber({
  whole: EFFECTS_PRESET_FP16_WHOLE_RANGE.min, frac256: EFFECTS_PRESET_FP16_FRAC_RANGE.max,
});
export const RAMP_RATE_MAX: number = presetFp16ToNumber({
  whole: EFFECTS_PRESET_FP16_WHOLE_RANGE.max, frac256: EFFECTS_PRESET_FP16_FRAC_RANGE.max,
});

/**
 * A rate as text. Every representable value is a multiple of 1/256, which is
 * exact in binary floating point, so `String` prints it without a tail.
 */
export function fmtRampPx(px: number): string {
  return String(Math.round(px * RAMP_RATE_UNITS_PER_PX) / RAMP_RATE_UNITS_PER_PX);
}

/**
 * WHY A TYPED RATE HAS NO SPELLING, or null when it has one.
 *
 * Four reasons and they get four different sentences, because "that number is
 * not available" is useless without "here is what is". The one that surprises is
 * `sign-hole`:
 *
 *   ⚠ THE INTERVAL BETWEEN -1 AND 0 IS UNREACHABLE. `frac256` is a MAGNITUDE and
 *   the sign lives on `whole` alone, so a negative value needs a negative
 *   `whole` and there is none between -1 and 0. `{whole: 0, frac256: 128}` is
 *   **+**0.5. **-0.5 HAS NO SPELLING**, and a control that quietly rounded it to
 *   0, or to -1, would move an author's rate without saying so — the same class
 *   as the sign bug the codec parcel caught, which reads fine and is wrong.
 *
 * This is the DISCRIMINATOR; `presetFp16FromNumber` is the ANSWER, and
 * `ramp-control.test.ts` cross-checks that the two agree on every case (this
 * returns null exactly when that returns an object). Two functions because the
 * codec must not grow a sentence and the panel must not grow a conversion.
 */
export type RampRateProblem = 'off-grid' | 'sign-hole' | 'above-range' | 'below-range';

export function rampRateProblem(px: number): RampRateProblem | null {
  if (!Number.isFinite(px)) return 'off-grid';
  if (px > RAMP_RATE_MAX) return 'above-range';
  if (px < RAMP_RATE_MIN) return 'below-range';
  // The hole BEFORE the grid check, because a value in it is unreachable however
  // it is rounded — "not on the 1/256 grid" would be a true sentence that sent
  // the author looking for a nearby value that does not exist either.
  if (px > -1 && px < 0) return 'sign-hole';
  if (!Number.isInteger(px * RAMP_RATE_UNITS_PER_PX)) return 'off-grid';
  return null;
}

/**
 * The nearest values that DO have a spelling, below and above — what the
 * refusal offers instead of the one that does not.
 *
 * Null on a side means there is nothing there: past the top of the range there
 * is no larger value, and past the bottom no smaller one.
 *
 * ⚠ THE `-1` / `0` FALLBACK IS THE HOLE AND PROVABLY ONLY THE HOLE. Inside
 * `[RAMP_RATE_MIN, RAMP_RATE_MAX]` the floor and ceiling are whole numbers of
 * 1/256 by construction and cannot leave the `whole` range (both ends are
 * themselves on the grid), so the only remaining way `presetFp16FromNumber` says
 * null is the (-1, 0) interval — whose own edges are -1 and 0.
 */
export function rampRateNeighbours(px: number): { below: number | null; above: number | null } {
  if (!Number.isFinite(px)) return { below: null, above: null };
  if (px > RAMP_RATE_MAX) return { below: RAMP_RATE_MAX, above: null };
  if (px < RAMP_RATE_MIN) return { below: null, above: RAMP_RATE_MIN };
  const units = px * RAMP_RATE_UNITS_PER_PX;
  const lo = Math.floor(units) / RAMP_RATE_UNITS_PER_PX;
  const hi = Math.ceil(units) / RAMP_RATE_UNITS_PER_PX;
  return {
    below: presetFp16FromNumber(lo) !== null ? lo : -1,
    above: presetFp16FromNumber(hi) !== null ? hi : 0,
  };
}

/** `start` is a position, `step` is a rate — and the units say which. */
export type RampRateField = 'start' | 'step';

export function rampRateUnits(field: RampRateField): string {
  return field === 'step' ? 'px per scanline' : 'px';
}

/**
 * WHY THIS RATE CANNOT BE WRITTEN, or null.
 *
 * NOT A SNAP, and that is the whole point. `presetFp16FromNumber` returns null
 * off-grid and MUST NOT be made to round; this is the sentence beside that
 * refusal, and every branch of it NAMES WHAT THE AUTHOR CAN HAVE instead. It
 * also says what the document still holds, `bandEdgeRefusal`'s rule: the box
 * commits per keystroke, so an author typing `-0.5` walks through values that DO
 * land, and the field they are looking at is not necessarily the value in the
 * file.
 *
 * ⚠ THE NEGATIVE-OFFER CAVEAT RETIRED 2026-09-03 AND THE HOOK STAYS.
 * `rampSignRateCaveat` (core/formats/effects/ramp-sign-lag.ts) used to append a
 * clause when the value this sentence just OFFERED was below zero, because
 * aeon's `raster_ramp_program` could not encode a negative 16.16 and the offer
 * would otherwise read as a fix. aeon now encodes it (`origin/master`
 * `065dc790`), `RAMP_SIGN_FIELDS_AWAITING_AEON` is `[]`, and the call below
 * returns null on every branch — so this refusal carries its arithmetic alone,
 * which is the state it was always meant to reach. THE ARITHMETIC WAS NEVER
 * TOUCHED in either state — `-1` and `0` really are the nearest spellable
 * values, and falsifying that to route around a build limitation would have put
 * a lie in the panel to hide a defect in a peer.
 *
 * ⚠ THE THIRD ARGUMENT IS PASSED EXPLICITLY AND MUST STAY THAT WAY.
 * `rampSignRateCaveat`'s `awaiting` parameter has a default, and a default
 * parameter is a HIDDEN IMPORT: it resolves in ITS OWN module's scope, so an
 * omitted argument reads the real constant straight through a test's stub and
 * the retirement poison goes green against a caveat that is still hard-wired on
 * — measured on this very function, not imagined.
 * `__tests__/ramp-sign-lag-disclosure.test.ts` pins this call's spelling.
 */
export function rampRateRefusal(
  ramp: EffectsPresetRamp, presetId: string, field: RampRateField, px: number,
): string | null {
  const problem = rampRateProblem(px);
  if (problem === null) return null;
  const subject = `preset "${presetId}" ramp ${field}`;
  const units = rampRateUnits(field);
  const holds = `${field} is still ${fmtRampPx(presetFp16ToNumber(ramp[field]))} ${units}.`;
  const n = rampRateNeighbours(px);
  const pair = `${n.below === null ? '(nothing lower)' : fmtRampPx(n.below)} and `
    + `${n.above === null ? '(nothing higher)' : fmtRampPx(n.above)}`;
  // The values this sentence is about to OFFER, per branch — the caveat's input,
  // so it can never fire about a number that is not on screen.
  const caveat = (named: readonly (number | null)[]): string =>
    rampSignRateCaveat(field, named, RAMP_SIGN_FIELDS_AWAITING_AEON) ?? '';
  if (problem === 'sign-hole') {
    return `${subject}: ${px} ${units} HAS NO SPELLING in this encoding. frac256 is a MAGNITUDE `
      + 'and the sign lives on whole alone, so a negative value needs a negative whole and there is '
      + 'none between -1 and 0 — {whole: 0, frac256: 128} is +0.5, not -0.5. The whole interval '
      + `between -1 and 0 is unreachable. The nearest rates you CAN have are ${pair}. Refused, and `
      + `not rounded to either — ${holds}${caveat([n.below, n.above])}`;
  }
  if (problem === 'above-range' || problem === 'below-range') {
    const end = problem === 'above-range'
      ? `the largest is ${fmtRampPx(RAMP_RATE_MAX)}`
      : `the smallest is ${fmtRampPx(RAMP_RATE_MIN)}`;
    return `${subject}: ${px} ${units} is outside the AUTHORED range. fp16's whole part is `
      + `${EFFECTS_PRESET_FP16_WHOLE_RANGE.min}..${EFFECTS_PRESET_FP16_WHOLE_RANGE.max} and its `
      + `fraction 0..${EFFECTS_PRESET_FP16_FRAC_RANGE.max}/${RAMP_RATE_UNITS_PER_PX}, so ${end}. `
      + 'The engine\'s STORAGE is wider — signed 16.16, about 64 times this — and a control built '
      + 'on the storage width would offer you values the build refuses. '
      + `Refused; ${holds}`
      + caveat([problem === 'above-range' ? RAMP_RATE_MAX : RAMP_RATE_MIN]);
  }
  return `${subject}: ${px} ${units} is not a whole number of 1/${RAMP_RATE_UNITS_PER_PX} px, `
    + `which is the finest rate fp16(whole, frac256) can spell. The nearest it has are ${pair}. `
    + `Refused, and not rounded to either — ${holds}${caveat([n.below, n.above])}`;
}

// ── the span, and the pair the per-field maxima do not describe ─────────────

export type RampSpanField = 'top' | 'lines';

/**
 * WHY THIS `top` OR `lines` CANNOT BE WRITTEN, or null.
 *
 * ═══ THE PAIR IS THE POINT ═══
 *
 * `top <= 222` and `lines <= 220` are each satisfied by `{top: 222, lines: 220}`,
 * and that document is REFUSED — by aeon's generator and by the engine, not by
 * the schema, because no JSON Schema keyword constrains two fields. So the
 * per-field maxima are a VALID-LOOKING PAIR THAT FAILS SOMEBODY ELSE'S BUILD,
 * and this is where an author meets it instead: at the control, at typing time,
 * with the schema's own number (`EFFECTS_PRESET_RAMP_SPAN_MAX`, read out of the
 * contract's prose) and with the largest value the OTHER field then admits.
 *
 * NOT A CLAMP — `bandEdgeRefusal`'s rule, and aeon's §E.4. Nothing here
 * substitutes a number the author did not type.
 */
export function rampSpanRefusal(
  ramp: EffectsPresetRamp, presetId: string, field: RampSpanField, value: number,
): string | null {
  const subject = `preset "${presetId}" ramp ${field}`;
  const holds = `${field} is still ${ramp[field]}.`;
  if (!Number.isInteger(value)) {
    return `${subject}: ${value} is not a whole number. `
      + `${field === 'top' ? 'A screen line' : 'A run length'} is an integer. Refused; ${holds}`;
  }
  const range = field === 'top' ? EFFECTS_PRESET_RAMP_TOP_RANGE : EFFECTS_PRESET_RAMP_LINES_RANGE;
  if (value < range.min || value > range.max) {
    return `${subject}: ${value} is outside ${range.min}..${range.max}, which is what the schema `
      + `declares for ${field} — and even inside it the PAIR is bounded: top + lines must be at `
      + `most ${EFFECTS_PRESET_RAMP_SPAN_MAX}. Refused; ${holds}`;
  }
  const otherField: RampSpanField = field === 'top' ? 'lines' : 'top';
  const other = ramp[otherField];
  const sum = value + other;
  if (sum > EFFECTS_PRESET_RAMP_SPAN_MAX) {
    const room = EFFECTS_PRESET_RAMP_SPAN_MAX - value;
    const otherRange = otherField === 'top'
      ? EFFECTS_PRESET_RAMP_TOP_RANGE : EFFECTS_PRESET_RAMP_LINES_RANGE;
    const largest = room < otherRange.min
      ? `${room}, which is below ${otherField}'s own floor of ${otherRange.min} — move `
        + `${otherField} down first`
      : String(room);
    return `${subject}: ${value} with ${otherField} ${other} spans to ${sum}, and top + lines must `
      + `be at most ${EFFECTS_PRESET_RAMP_SPAN_MAX} — the frame-rewind interlock. ⚠ THE PER-FIELD `
      + `MAXIMA ARE NOT THE PAIR'S CONTRACT: top ${EFFECTS_PRESET_RAMP_TOP_RANGE.max} and lines `
      + `${EFFECTS_PRESET_RAMP_LINES_RANGE.max} each satisfy the schema and the pair is still `
      + 'refused, by aeon\'s generator and by the engine rather than by the schema — which is why '
      + `you meet it here and not at somebody else's build. With ${field} ${value} the largest `
      + `${otherField} is ${largest}. Refused; ${holds}`;
  }
  return null;
}

/** Why this VSRAM address cannot be written, or null. */
export function rampAddrRefusal(
  ramp: EffectsPresetRamp, presetId: string, value: number,
): string | null {
  const subject = `preset "${presetId}" ramp target.vsram.addr`;
  const holds = `the address is still ${ramp.target.vsram.addr}.`;
  if (!Number.isInteger(value)) {
    return `${subject}: ${value} is not a whole number. A VSRAM byte address is an integer. `
      + `Refused; ${holds}`;
  }
  const r = EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE;
  if (value < r.min || value > r.max) {
    return `${subject}: ${value} is outside ${r.min}..${r.max}, which is the engine's own ensure `
      + `(addr <= ${r.max}). Refused; ${holds}`;
  }
  return null;
}

/**
 * WHAT THIS ADDRESS MEANS, or as much of it as the contract establishes.
 *
 * ⚠ IT INVENTS NOTHING. The schema establishes exactly two meanings — 0 is
 * plane A's whole-plane vertical scroll and 2 is plane B's — and says in as many
 * words that whether an ODD address is meaningful IS NOT ESTABLISHED. So every
 * other value gets a sentence saying the contract admits it and this editor does
 * not know what it does, rather than a per-column gloss Aurora would be making
 * up. `addrGloss` above is the CRAM one and is not this: a CRAM byte address and
 * a VSRAM byte address share a spelling and nothing else.
 */
export function rampAddrGloss(addr: number): string {
  if (addr === 0) return 'plane A, whole-plane vertical scroll';
  if (addr === 2) return 'plane B, whole-plane vertical scroll';
  return `admitted (0..${EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE.max}); only 0 and 2 are established`;
}

// ── the display lag: the one place it is applied, and why ───────────────────

/**
 * ═══ WHERE THE LAG IS APPLIED, AND WHY IT IS APPLIED HERE ═══
 *
 * ⚠ MEASURED BY THE ENGINE LANE, 2026-09-03, AND SETTLED: **NO STAGE OF THE
 * ENGINE PATH COMPENSATES FOR THE LAG.** Not the constructor, not the generator,
 * not the interpreter. The compensation is PREVIEW-ONLY and it is ENTIRELY
 * OURS — so there is no double-application to avoid anywhere, and the question
 * "should this readout add it" has one answer: yes.
 *
 * ⚠ THIS FUNCTION USES THE **FIRST-LINE OFFSET**, NOT THE PER-INDEX LAG. They
 * are different quantities and they differ by one (`j` starts at 1, so the first
 * written value is index 1 and lands at `top + 1 + 1`). A span is a claim about
 * where the run BEGINS and ENDS, so it takes the offset; only a sentence that
 * quantifies over `j` takes `EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG`, and the one
 * such sentence on this surface is `RAMP_DISPLAY_LAG_NOTE` below.
 *
 * `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET` IS APPLIED BY THIS FUNCTION AND
 * NOWHERE ELSE ON THIS SURFACE, because of what the two numbers mean:
 *
 *   • `ramp.top` is the ENGINE's `top`. The field, its refusal and the document
 *     are all in engine coordinates, and the codec keeps them verbatim — a
 *     document's `top` is written and read exactly as the engine reads it, and
 *     baking a display correction into the FILE would change what the engine
 *     runs in order to fix what an editor draws.
 *   • THIS is a claim about SCREEN LINES — what an author will actually see —
 *     and a screen-line claim that did not add the lag would be one line high
 *     everywhere and WOULD LOOK CORRECT, which is precisely why the codec made
 *     it a named constant instead of a `+ 1` in whichever renderer needed it
 *     first.
 *
 * So: the fields stay in the engine's numbers, this one derived readout is in
 * the screen's, and the panel LABELS it as a display span rather than letting it
 * be read back as `top`. The lag appears exactly once on this surface, and
 * `ramp-control.test.ts` asserts both halves — that this readout DOES add it,
 * derived from the constant, and that nothing writes it into the document.
 *
 * ⚠ WHAT THE BOTTOM EDGE ACTUALLY DOES, CORRECTED 2026-09-03 (empyrean
 * `e9409dc`), BECAUSE THE OLD PARAGRAPH HERE ARGUED THE WRONG WAY ROUND. It used
 * to read "the two constants meet exactly at the bottom of the display... a lag
 * of 2 would run off the screen", offered as corroboration that the offset was
 * 1. The offset IS 2, and the run DOES go one line over: the last displayed line
 * of a run is `top + lines - 1 + 2` = `top + lines + 1`, so at the span interlock
 * `top + lines <= 223` a MAXIMAL run puts its last value on line 224 — one past
 * the bottom of a 224-line screen (0..223), where it can never be seen. A
 * 220-line run from `top` 3 therefore RENDERS 219 LINES. That is the contract's
 * own sentence and a fact about the engine, not a defect in this derivation, and
 * an argument of the old shape must not be used to "correct" the constant back.
 *
 * ⚠ AND NO PIXELS ARE DRAWN. This surface has no ramp preview and does not claim
 * one — `NO_PREVIEW` states the general case and nothing here weakens it. A
 * drawn preview is where this constant is most dangerous; the decision not to
 * build one in this parcel is recorded in the packet.
 */
export function rampDisplaySpan(ramp: EffectsPresetRamp): { first: number; last: number } {
  const offset = EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET;
  return { first: ramp.top + offset, last: ramp.top + ramp.lines - 1 + offset };
}

/** The painted readout: the run's own lines, then the lines a viewer sees. */
export function rampDisplayGloss(ramp: EffectsPresetRamp): string {
  const d = rampDisplaySpan(ramp);
  return `writes on lines ${ramp.top}-${ramp.top + ramp.lines - 1}, shows on screen lines `
    + `${d.first}-${d.last}`;
}

/**
 * The reason, on the readout's own title — the contract half of the split.
 *
 * ⚠ THIS SENTENCE QUANTIFIES OVER `j`, so it takes the PER-INDEX LAG, and the
 * span readout it titles takes the FIRST-LINE OFFSET. Interpolating one number
 * into both is how this string would ship a false statement to an author: they
 * differ by one because `j` starts at 1. Both are stated here, each from its own
 * constant, precisely so a reader can see that the two lines of the readout are
 * answering two different questions and are not a contradiction.
 */
export const RAMP_DISPLAY_LAG_NOTE: string =
  'A VSRAM run\'s value for index j DISPLAYS on screen line top + j + '
  + `${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG} — the N+1 VSRAM latency (raster.emp:602-609). `
  + 'AND j STARTS AT 1: the interpreter adds the step before it writes, so `start` itself is never '
  + `emitted and the FIRST value an author sees lands on top + `
  + `${EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET}, not top + `
  + `${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG}. A run of `
  + `lines values therefore occupies screen lines top + ${EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET}`
  + ` .. top + lines + ${EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET - 1}, so a run at the very `
  + `bottom (top + lines = ${EFFECTS_PRESET_RAMP_SPAN_MAX}) puts its last value on line `
  + `${EFFECTS_PRESET_RAMP_SPAN_MAX + EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET - 1}, where it `
  + 'can never be seen. '
  + 'NO STAGE OF THE ENGINE PATH compensates for any of it — not the constructor, not the generator '
  + '(measured by the engine lane, 2026-09-03). The Top field above is the ENGINE\'s top and is '
  + 'written to the file verbatim; the lag is a DISPLAY fact, so it is applied to this readout and '
  + 'to nothing else. Correcting it in the document instead would change what the engine runs in '
  + 'order to fix what an editor shows.';

/**
 * WHAT THE RAMP DOES, in one sentence of the author's own arithmetic.
 *
 * ⚠ THIS IS THE SHAPE THAT MAKES A CURVE UNTHINKABLE, and that is deliberate.
 * The only quantities a ramp has are a first value, a rate and a length, so the
 * only summary it can have is a first value, a last value and a total — there is
 * nowhere in this sentence for a per-line list to go.
 *
 * The engine writes the WHOLE PART of the accumulator each line (the schema's
 * own words); these are the accumulator's values, not the bytes written.
 */
export function rampDriftSummary(ramp: EffectsPresetRamp): string {
  const start = presetFp16ToNumber(ramp.start);
  const step = presetFp16ToNumber(ramp.step);
  const end = start + step * (ramp.lines - 1);
  return `One rate over ${ramp.lines} line${ramp.lines === 1 ? '' : 's'}: the accumulator starts `
    + `at ${fmtRampPx(start)} px and ends at ${fmtRampPx(end)} px, a total of `
    + `${fmtRampPx(end - start)} px. The engine writes the whole part of it every line.`;
}

// ── which effect this ramp actually produces: the bindings, resolved ────────

/**
 * WHOSE SCENE DECIDES THIS SECTION'S VSRAM MODE — one binding per section that
 * names this preset, resolved through the SAME fallback chain the model
 * declares.
 *
 * ═══ A PRESET IS NOT A SCENE, AND THEY MEET ONLY AT A SECTION ═══
 *
 * The ramp is authored in a preset document; `v_deform` lives on a scene
 * document; `section_N.meta.json` carries `rasterRef` AND `sceneRef`, so the
 * section is the only place the two can be joined. That makes the honest answer
 * PER SECTION, and this function refuses to collapse it: it returns one row per
 * binding and lets `rampScrollModeSentence` say so when the rows disagree.
 *
 * ⚠ `sceneRef: null` IS THE ACT DEFAULT, NOT "NO SCENE". `Section.sceneRef`'s
 * own docblock: null falls back to `Act.sceneRef`, and only below THAT to the
 * engine's hand-authored config. Treating null as absent would report every
 * section that never touched the scene dropdown as unanswerable while the act
 * was in fact naming a scene for all of them.
 *
 * ⚠ AND THE BOTTOM OF THE CHAIN IS NOT AN ARM — IT IS `unknown`. When the act
 * names no scene either, the config is aeon's `act_parallax_config` in
 * `act_descriptor.emp`, a file this editor has never opened. That is the common
 * case in aeon's tree today (their `project.json` has `sceneRef: null` and there
 * is no `data/editor/effects/` at all), which is exactly why it must not be
 * quietly folded into "full-screen": it would be a confident sentence about a
 * document nobody here has read.
 *
 * A DANGLING REF IS ALSO `unknown`, and it is reachable with no bug: the sidecar
 * is hand-editable, aeon's generator writes it too, and a scene can be deleted,
 * renamed, or sitting in `unreadable`. `unassignableSceneRef`'s own reason,
 * applied one layer further out — and the `unreadable` test is spelled the same
 * way it is there, so the two cannot disagree about which failure it was.
 */
export function rampScrollBindings(
  sections: readonly ({ rasterRef: string | null; sceneRef: string | null } | null)[],
  actSceneRef: string | null,
  scenes: EffectsSceneLibrary,
  presetId: string,
): RampScrollBinding[] {
  const out: RampScrollBinding[] = [];
  sections.forEach((s, index) => {
    if (!s || s.rasterRef !== presetId) return;
    const via: 'section' | 'act' = s.sceneRef !== null ? 'section' : 'act';
    const ref = s.sceneRef !== null ? s.sceneRef : actSceneRef;
    if (ref === null) {
      out.push({ section: index, mode: 'unknown', sceneId: null, via: null, reason: 'act-unset' });
      return;
    }
    const scene = scenes.scenes.find((sc) => sc.id === ref);
    if (scene !== undefined) {
      out.push({
        section: index,
        mode: vDeformValue(scene) === null ? 'full' : 'column',
        sceneId: ref,
        via,
        reason: null,
      });
      return;
    }
    const unreadable = scenes.unreadable.some((u) => u.path.endsWith(`/${ref}.json`));
    const reason: RampScrollUnknownReason = via === 'section'
      ? (unreadable ? 'section-unreadable' : 'section-dangling')
      : (unreadable ? 'act-unreadable' : 'act-dangling');
    out.push({ section: index, mode: 'unknown', sceneId: ref, via, reason });
  });
  return out;
}

/**
 * The ramp card's scroll-mode sentence: the painted half and the contract half.
 *
 * ONE CALL FOR THE PANEL, because the panel holds no rules — it has the act and
 * the two libraries and asks this one question, exactly as it asks
 * `deletePresetRefusal` and `sectionRasterAdvisory`.
 *
 * ⚠ IT ADVISES; IT DOES NOT GATE. Both arms are features. Nothing is disabled by
 * this sentence and no document is refused because of it — `raster-binding.ts`'s
 * standing refusal, and the reason it applies here is stronger than usual: an
 * author who WANTS a 16-pixel sliver is not making a mistake.
 */
export function rampScrollModeAdvisory(
  sections: readonly ({ rasterRef: string | null; sceneRef: string | null } | null)[],
  actSceneRef: string | null,
  scenes: EffectsSceneLibrary,
  presetId: string,
): { short: string; full: string } {
  return rampScrollModeSentence(rampScrollBindings(sections, actSceneRef, scenes, presetId));
}

// ── commands ───────────────────────────────────────────────────────────────

/** Set `top` or `lines`. Null when the value is refused or nothing moved. */
export function setRampSpanCommand(
  library: EffectsPresetLibrary, id: string, field: RampSpanField, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} ramp ${field}`, (p) => {
    if (!p.ramp) return;
    if (rampSpanRefusal(p.ramp, id, field, value) !== null) return;
    p.ramp[field] = value;
  });
}

/** Set the VSRAM byte address the run writes every line. */
export function setRampAddrCommand(
  library: EffectsPresetLibrary, id: string, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} ramp addr`, (p) => {
    if (!p.ramp) return;
    if (rampAddrRefusal(p.ramp, id, value) !== null) return;
    p.ramp.target.vsram.addr = value;
  });
}

/**
 * Set `start` or `step` from the author's decimal.
 *
 * ⚠ THE CONVERSION IS THE CODEC'S AND IS NOT RE-IMPLEMENTED HERE.
 * `presetFp16FromNumber` owns the sign rule — `{whole: -1, frac256: 128}` is
 * -1.5, not -0.5 — and it returns null rather than snapping. A second opinion
 * about that in this file would be a whole pixel of error with both numbers
 * still in range, which no schema and no round trip can catch.
 */
export function setRampRateCommand(
  library: EffectsPresetLibrary, id: string, field: RampRateField, px: number,
): SetEffectsPresetCommand | null {
  const fp = presetFp16FromNumber(px);
  if (fp === null) return null;
  return editPresetCommand(library, id, `Preset ${id} ramp ${field}`, (p) => {
    if (!p.ramp) return;
    p.ramp[field] = fp;
  });
}

// ---------------------------------------------------------------------------
// THE BASE-SWAP RASTER CHANNEL — `base_swap`'s derivations, refusals, commands
// ---------------------------------------------------------------------------
//
// ═══ WHAT THE CONTROL IS ═══
//
// TWO NUMBERS AND DELIBERATELY NOTHING ELSE: a screen `line` and a VRAM
// `target`. At that line, one OP_SET_REG fire re-points Plane A's nametable base
// register (VDP reg $02) at `target`; from there down, Plane A draws from a
// different nametable — the "Batman & Robin trick". The document is a CLOSED
// object of exactly those two required members, so a third control here would be
// authoring a key the schema refuses.
//
// ═══ ⚠ TWO ASYMMETRIES WITH `ramp`, AND A READER WHO JUST READ THAT BLOCK WILL
//     CARRY BOTH ACROSS WRONGLY ═══
//
//   1. NO CAPABILITY GATE. `ramp` renders only where `Game.SCANLINE_CAPS`
//      declares CAP_DENSE_TIER; `base_swap` has no such bit, OP_SET_REG
//      dispatches unconditionally in every game, and no ensure is re-emitted at
//      the generated call site. There is no game in which a base swap silently
//      no-ops for want of a capability — so nothing on this surface is gated,
//      and a disabled control built around an assumed gate would be a lie.
//   2. NOT DEBUG-GATED. The generated emission is unconditional `pub` data that
//      reaches the RELEASE ROM (aeon measured the section-6 program at $013446
//      in the release listing, 22 bytes identical to hand-authored
//      `OJZ_BaseSwap`). Authoring one here is not a debug-only affordance.
//
// BOTH ARE THE CONTRACT'S OWN WORDS, PARSED (`BASE_SWAP_ASYMMETRIES`) rather
// than retyped, and both are PAINTED in the card — an asymmetry stated only in a
// docblock is an asymmetry the author never learns.
//
// ═══ ⚠ THE ADDRESS IS AN ADDRESS ═══
//
// `target` is a raw VRAM BYTE ADDRESS and an author meeting `57344` in a bare
// number box has no way to know that. Every place this surface shows one, it
// shows the hex beside the decimal (`fmtVramBase`) and NAMES the address when
// the contract names it (`BASE_SWAP_NAMED_TARGETS`, parsed out of the schema:
// 57344 = $E000 = VRAM_PLANE_B). It NAMES NOTHING THE CONTRACT DOES NOT —
// `rampAddrGloss`'s rule, for the same reason: a per-address gloss Aurora made
// up would be an invention wearing a contract's clothes.
//
// ═══ ⚠ AND NOTHING SNAPS ═══
//
// `isBaseSwapTargetAligned` reports; `baseSwapTargetNeighbours` COMPUTES the two
// legal addresses either side of a refused one so the sentence can offer them.
// Rounding an author's address to the nearest granule draws a DIFFERENT PLANE'S
// PICTURE without saying so, which is the exact failure the granule exists to
// make visible. aeon §E.4's no-clamp rule, with hardware behind it.

/** The `base_swap` key's own title — the contract's paragraph, at the point of use. */
export const BASE_SWAP_TITLE = presetFieldTitle(['properties', 'base_swap']);

/** Every base_swap field's title, straight from the schema. */
export const BASE_SWAP_FIELD_TITLES = Object.freeze({
  line: presetFieldTitle(['$defs', 'base_swap', 'properties', 'line']),
  target: presetFieldTitle(['$defs', 'base_swap', 'properties', 'target']),
});

/**
 * THE TWO ASYMMETRIES IN THE CONTRACT'S OWN WORDS — parsed, never retyped.
 *
 * Both sentences live in the `base_swap` property's description and this reads
 * them out. If empyrean ever drops either, this throws at module load rather
 * than leaving the panel quietly asserting a property of the engine that the
 * contract no longer states — which is the direction that matters here, because
 * the whole hazard is a reader ASSUMING ramp's gating by analogy.
 */
export const BASE_SWAP_ASYMMETRIES: string = (() => {
  const m = /(NO capability bit gates it[\s\S]*?own program\)\.)/.exec(BASE_SWAP_TITLE);
  if (!m || !/CAP_DENSE_TIER/.test(m[1]) || !/DEBUG-gated/.test(m[1])) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer states base_swap\'s two asymmetries with ramp '
      + '(no capability gate, not DEBUG-gated) in its `base_swap` property description. Those are '
      + 'the two properties a reader carries across from ramp and gets wrong, and this panel paints '
      + 'the contract\'s own statement of them. Re-read the schema — do NOT retype the sentences.',
    );
  }
  return m[1];
})();

/**
 * The painted half, at an author's length — `presetLimitsShort()`'s split.
 *
 * The contract sentence carries a symbol name and a ROM address, which is owed
 * to the agent surface and useless in a 285px column; this is what an author has
 * to act on. Both halves reach the same element, and the wording rows assert
 * they make the same claim.
 */
export const BASE_SWAP_ASYMMETRIES_SHORT =
  'No capability gate, and not DEBUG-gated: unlike a ramp, this runs in every game and reaches '
  + 'the release ROM. Nothing here is disabled for want of an engine capability.';

/**
 * WHAT AN AUTHOR SEES, in the contract's own words — parsed out of the same
 * description.
 *
 * Aurora draws no raster program (`NO_PREVIEW`), so what the swap LOOKS like is
 * a claim this editor cannot make on its own evidence. It can quote the one who
 * measured it: aeon's on-screen captures, via the schema.
 */
export const BASE_SWAP_WHAT_YOU_SEE: string = (() => {
  const m = /WHAT AN AUTHOR SEES: ([\s\S]*?)(?:\s*$)/.exec(BASE_SWAP_TITLE);
  if (!m || !/self-restoring/.test(m[1])) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer states what an author sees (the swap line down, '
      + 'the untouched frame top, the self-restore) in its `base_swap` property description. This '
      + 'panel QUOTES that rather than asserting it, because Aurora draws no raster program and '
      + 'has not measured one. Re-read the schema — do NOT retype the sentence.',
    );
  }
  return m[1].trim();
})();

// ── the address, shown as an address ────────────────────────────────────────

/**
 * How many hex digits a VRAM base address is written with, FROM THE RANGE — so
 * `$E000` and `$0000` are the same width and a reader can compare two at a
 * glance. 65535 is four digits; a wider range would widen this rather than
 * printing a ragged column.
 */
const VRAM_BASE_HEX_DIGITS = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max.toString(16).length;

/** A VRAM byte address in the notation every `VRAM_*` consumer is written in. */
export function fmtVramBase(addr: number): string {
  if (!Number.isInteger(addr) || addr < 0) return String(addr);
  return `$${addr.toString(16).toUpperCase().padStart(VRAM_BASE_HEX_DIGITS, '0')}`;
}

/** An address as an author needs to read it: the hex it is, and the decimal the file holds. */
export function fmtVramBaseBoth(addr: number): string {
  return `${fmtVramBase(addr)} (${addr})`;
}

/**
 * THE ADDRESSES THE CONTRACT NAMES — parsed out of the schema, and NOTHING IS
 * INVENTED BESIDE THEM.
 *
 * The schema names exactly one: the shipped section-6 target, `57344 ($E000,
 * VRAM_PLANE_B)`. `rampAddrGloss`'s rule applies unchanged — every other legal
 * address gets a sentence saying the contract admits it and this editor does not
 * know what is there, rather than a name Aurora would be making up. A wrong name
 * on a VRAM base is worse than none: it would tell an author they are pointing
 * at a plane they are not.
 *
 * Guarded three ways at module load: the decimal and the hex must agree, the
 * address must be inside the declared range, and it must be ON the granule —
 * because the contract's own worked example failing its own constraint would
 * mean one of the two had moved.
 */
export const BASE_SWAP_NAMED_TARGETS: ReadonlyMap<number, string> = (() => {
  const desc = BASE_SWAP_FIELD_TITLES.target;
  const m = /targets (\d+) \(\$([0-9A-Fa-f]+), (VRAM_[A-Z0-9_]+)/.exec(desc);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer names a worked VRAM base in '
      + '$defs.base_swap.properties.target (the shipped "57344 ($E000, VRAM_PLANE_B)"), which is '
      + 'the ONLY address this editor is allowed to put a name on. Re-read the schema — do NOT '
      + 'retype the address or invent a second one.',
    );
  }
  const dec = Number(m[1]);
  const hex = parseInt(m[2], 16);
  if (dec !== hex) {
    throw new Error(
      `the schema's worked base address disagrees with itself: ${dec} decimal is not $${m[2]}. One `
      + 'of the two was edited by hand; re-read the schema.',
    );
  }
  if (!isBaseSwapTargetAligned(dec)) {
    throw new Error(
      `the schema's own worked base address ${dec} is not a legal base_swap target (range `
      + `${EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min}..${EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max}`
      + `, granule ${EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE}). The worked example and the `
      + 'constraints have drifted apart; re-read both.',
    );
  }
  return Object.freeze(new Map<number, string>([[dec, m[3]]]));
})();

/**
 * WHAT THIS ADDRESS IS, as much of it as the contract establishes — the gloss
 * that sits beside the number box.
 *
 * ⚠ IT INVENTS NOTHING, and that is the whole design. One address is named by
 * the contract; every other legal one is reported as admitted, on the granule,
 * and unnamed. An unaligned one says so first, because that is the only thing
 * about it worth reading.
 */
export function baseSwapTargetGloss(target: number): string {
  const named = BASE_SWAP_NAMED_TARGETS.get(target);
  if (named !== undefined) return `${fmtVramBase(target)} — ${named}`;
  if (!isBaseSwapTargetAligned(target)) {
    return `${fmtVramBase(target)} — NOT on the $${EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE
      .toString(16).toUpperCase()} granule`;
  }
  const only = [...BASE_SWAP_NAMED_TARGETS].map(([a, n]) => `${fmtVramBase(a)} (${n})`).join(', ');
  return `${fmtVramBase(target)} — on the granule; the contract names only ${only}`;
}

/**
 * WHAT THE SWAP DOES, in one sentence of the document's own numbers.
 *
 * The `rampDriftSummary` idiom: the arithmetic an author would otherwise do in
 * their head, from the two values in front of them. It states the mechanism and
 * the address in BOTH bases, and it names the target only when the contract
 * does — so this sentence is never the place a made-up plane name gets in.
 */
export function baseSwapSummary(bs: EffectsPresetBaseSwap): string {
  const named = BASE_SWAP_NAMED_TARGETS.get(bs.target);
  const what = named === undefined
    ? `the nametable at ${fmtVramBaseBoth(bs.target)}`
    : `${fmtVramBaseBoth(bs.target)} — ${named}`;
  return `At screen line ${bs.line}, Plane A's base register (VDP reg $02) is re-pointed at `
    + `${what}. One fire, one register write; the ${bs.line} line${bs.line === 1 ? '' : 's'} above `
    + 'it are untouched.';
}

// ── the seed, from the contract's own worked example ────────────────────────

/**
 * A BRAND-NEW BASE SWAP — both keys written, because the constructor defaults
 * NEITHER (`newBand`'s rule, and the schema says so in as many words).
 *
 * ⚠ THE TWO NUMBERS ARE THE CONTRACT'S OWN WORKED EXAMPLE, PARSED, NOT CHOSEN.
 * The schema states that the shipped section-6 preset fires on 160 and targets
 * $E000 (VRAM_PLANE_B), and those are exactly the two values a fresh swap gets.
 * The reason is `newRamp`'s and one more:
 *
 *   • A SEED MUST NOT BE BORN ILLEGAL — asserted below against the line range
 *     and the granule, not assumed.
 *   • A SEED MUST NOT BE BORN INERT. A `target` this editor cannot name is a
 *     first state whose effect the panel cannot explain; $E000 is the one
 *     address the contract explains, so a fresh swap is one the author can read
 *     a sentence about.
 *
 * It is NOT a claim that this is the right swap for their section — Aurora does
 * not know that, and a seed that pretended to would be the clamp aeon's §E.4
 * forbids wearing a different hat.
 */
const BASE_SWAP_SEED_LINE: number = (() => {
  const m = /shipped section-6 preset fires on (\d+)/.exec(BASE_SWAP_FIELD_TITLES.line);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer states the shipped section-6 fire line in '
      + '$defs.base_swap.properties.line, which is where a fresh swap\'s seed line is read from. '
      + 'Re-read the schema — do NOT type a line number here.',
    );
  }
  const line = Number(m[1]);
  const r = EFFECTS_PRESET_BASE_SWAP_LINE_RANGE;
  if (!Number.isInteger(line) || line < r.min || line > r.max) {
    throw new Error(
      `the schema's own worked fire line ${line} is outside the range it declares (${r.min}..`
      + `${r.max}). A seed born outside the range would put a fresh document in a state the author `
      + 'had no hand in; re-read both.',
    );
  }
  return line;
})();

const BASE_SWAP_SEED_TARGET: number = [...BASE_SWAP_NAMED_TARGETS.keys()][0];

export function newBaseSwap(): EffectsPresetBaseSwap {
  return { line: BASE_SWAP_SEED_LINE, target: BASE_SWAP_SEED_TARGET };
}

// ── the refusals ────────────────────────────────────────────────────────────

/** Why this fire line cannot be written, or null. */
export function baseSwapLineRefusal(
  bs: EffectsPresetBaseSwap, presetId: string, value: number,
): string | null {
  const subject = `preset "${presetId}" base_swap line`;
  const holds = `line is still ${bs.line}.`;
  if (!Number.isInteger(value)) {
    return `${subject}: ${value} is not a whole number. A screen line is an integer. `
      + `Refused; ${holds}`;
  }
  const r = EFFECTS_PRESET_BASE_SWAP_LINE_RANGE;
  if (value < r.min || value > r.max) {
    return `${subject}: ${value} is outside ${r.min}..${r.max}, which is the engine's own ensure `
      + `for a raster fire — lines below ${r.min} belong to the priming records and ${r.max} is the `
      + 'frame-rewind interlock. ⚠ THIS IS NOT THE RAMP\'S RANGE even though both are screen '
      + `lines: a ramp's top stops at ${EFFECTS_PRESET_RAMP_TOP_RANGE.max} because a run needs a `
      + `line after it, and a swap is a single fire that reaches ${r.max}. Refused; ${holds}`;
  }
  return null;
}

/**
 * THE TWO LEGAL BASES EITHER SIDE OF A VALUE — computed, never typed.
 *
 * `rampRateNeighbours`' idiom, and for the same reason: "that address is not
 * available" is useless without "here is what is". Null on a side means there is
 * nothing there — below the first granule, or above the last.
 *
 * The granule is an ABSOLUTE multiple (`isBaseSwapTargetAligned` asks
 * `target % granule === 0`), so the legal set is the multiples of the granule
 * that fall inside the declared range, and both ends are derived from the range
 * rather than assumed to be its endpoints.
 */
export function baseSwapTargetNeighbours(
  target: number,
): { below: number | null; above: number | null } {
  const g = EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE;
  const r = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE;
  const first = Math.ceil(r.min / g) * g;
  const last = Math.floor(r.max / g) * g;
  if (!Number.isFinite(target)) return { below: null, above: null };
  const below = Math.min(Math.floor(target / g) * g, last);
  const above = Math.max(Math.ceil(target / g) * g, first);
  return {
    below: below < first ? null : below,
    above: above > last ? null : above,
  };
}

/**
 * WHY THIS VRAM BASE CANNOT BE WRITTEN, or null.
 *
 * ═══ THE GRANULE IS THE POINT, AND IT IS NOT A ROUNDING CONVENIENCE ═══
 *
 * An unaligned target is NOT out of range and fails loudly NOWHERE downstream:
 * VDP reg $02 encodes only the address bits above the granule and DROPS the rest
 * SILENTLY, so the VDP fetches from a different address than every `VRAM_*`
 * consumer reads and writes and nothing else looks wrong. The engine's own
 * ensure names the granule in its refusal and the schema's `multipleOf` is that
 * same refusal one step earlier; this is it one step earlier again, at the
 * control, at typing time.
 *
 * NOT A SNAP, and here that rule has hardware behind it rather than taste:
 * rounding to the nearest granule produces A DIFFERENT PLANE'S PICTURE, without
 * saying so. So the neighbours are OFFERED and nothing is written.
 */
export function baseSwapTargetRefusal(
  bs: EffectsPresetBaseSwap, presetId: string, value: number,
): string | null {
  const subject = `preset "${presetId}" base_swap target`;
  const holds = `target is still ${fmtVramBaseBoth(bs.target)}.`;
  const g = EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE;
  const r = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE;
  const n = baseSwapTargetNeighbours(value);
  const pair = `${n.below === null ? '(nothing lower)' : fmtVramBaseBoth(n.below)} and `
    + `${n.above === null ? '(nothing higher)' : fmtVramBaseBoth(n.above)}`;
  if (!Number.isInteger(value)) {
    return `${subject}: ${value} is not a whole number. A VRAM byte address is an integer, and `
      + `this one must also be a multiple of ${g} (${fmtVramBase(g)}). The nearest legal bases are `
      + `${pair}. Refused; ${holds}`;
  }
  if (value < r.min || value > r.max) {
    return `${subject}: ${fmtVramBaseBoth(value)} is outside ${fmtVramBaseBoth(r.min)}..`
      + `${fmtVramBaseBoth(r.max)}, which is the range vdp_base_reg takes. The nearest legal bases `
      + `are ${pair}. Refused; ${holds}`;
  }
  if (!isBaseSwapTargetAligned(value)) {
    return `${subject}: ${fmtVramBaseBoth(value)} is not on the ${fmtVramBase(g)} granule. ⚠ THIS `
      + 'IS NOT A RANGE ERROR AND IT FAILS LOUDLY NOWHERE: Plane A\'s base register (VDP reg $02) '
      + 'encodes only the address bits ABOVE the granule and DROPS the rest SILENTLY, so an '
      + 'unaligned base is a DIFFERENT ADDRESS than every VRAM_* consumer reads and writes, with '
      + `nothing else visibly wrong. The nearest legal bases are ${pair}. Refused, and NOT snapped `
      + 'to either — snapping would point Plane A at another picture without telling you. '
      + `${holds}`;
  }
  return null;
}

// ── the commands ────────────────────────────────────────────────────────────

/** Set the screen line the swap fires on. Null when refused or nothing moved. */
export function setBaseSwapLineCommand(
  library: EffectsPresetLibrary, id: string, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} base_swap line`, (p) => {
    if (!p.base_swap) return;
    if (baseSwapLineRefusal(p.base_swap, id, value) !== null) return;
    p.base_swap.line = value;
  });
}

/** Set the VRAM base Plane A is re-pointed at. Null when refused or nothing moved. */
export function setBaseSwapTargetCommand(
  library: EffectsPresetLibrary, id: string, value: number,
): SetEffectsPresetCommand | null {
  return editPresetCommand(library, id, `Preset ${id} base_swap target`, (p) => {
    if (!p.base_swap) return;
    if (baseSwapTargetRefusal(p.base_swap, id, value) !== null) return;
    p.base_swap.target = value;
  });
}

// ── exactly one raster program, and switching between them ─────────────────
//
// ⚠ NOTHING IN THIS SECTION MAY COUNT THE CHANNELS. It said "the two" until
// 2026-09-03, and on the day a third arrived a ternary mislabelled it, an
// if/else authored the two-key document the schema refuses, and a `!== 'ramp'`
// test woke the band controls on a document with no bands. All three were
// invisible while there were two. Every list below is DERIVED from
// `EFFECTS_PRESET_RASTER_CHANNELS` (the schema's own `oneOf`) or is a MAP keyed
// by channel with a module-load guard, so a fourth arm is a data change and the
// places that must learn about it SAY SO OUT LOUD instead of guessing.

/**
 * WHY THE BAND CONTROLS CANNOT WRITE HERE, or null when they can.
 *
 * ═══ THE DEAD CONTROL WITH NO SENTENCE, WHICH THIS FIXES ═══
 *
 * `bands` left the schema's top-level `required` when `ramp` arrived, and the
 * root became an `oneOf`: EXACTLY ONE of `bands` | `ramp`, both refused, neither
 * refused. `addBandCommand`, `removeBandCommand` and `splitBandCommand` are
 * therefore SILENT NO-OPS on a ramp document — correctly, because growing a
 * `bands` key onto a ramp preset would author the both-keys document the schema
 * refuses, on every click, in a panel that had no idea which kind of document it
 * was looking at.
 *
 * But a no-op is a dead control, and a dead control with no sentence beside it
 * is this repo's standing complaint. This is `lastBandRefusal`'s idiom applied
 * to it: ONE predicate, read by the disabled control AND by the reason under it,
 * so the greyed button and the sentence cannot disagree.
 */
export function bandControlsRefusal(preset: EffectsPreset): string | null {
  const channel = presetRasterChannel(preset);
  // ⚠ ASKED AS "IS IT bands?", NOT AS "IS IT ramp?". It was the latter until
  // `base_swap` arrived (empyrean 5bd76ba) and a THIRD channel appeared — at
  // which point `!== 'ramp'` returned null on a base_swap document, the band
  // controls came back to life on a preset with no `bands` key, and every one of
  // them was a silent no-op with no sentence beside it. A negative test against
  // one sibling is wrong the moment there are two; the positive test against the
  // channel these controls DO write is right for every channel there will be.
  if (channel === null || channel === 'bands') return null;
  return `preset "${preset.id}" carries a ${RASTER_CHANNEL_NOUNS[channel]}, not bands. A preset `
    + 'holds EXACTLY ONE raster program: every raster key lowers into the same raster: slot and '
    + 'the engine has no combinator that mixes them, so the schema refuses a document carrying '
    + 'two — which means the band controls cannot write here at all. Set the Raster program row '
    + `above back to bands to author bands; that discards the ${RASTER_CHANNEL_NOUNS[channel]}, `
    + 'and it is one undo step.';
}

/**
 * ONE NOUN PER RASTER CHANNEL, so a sentence can name what a document carries.
 *
 * Keyed by the codec's channel names and checked against the schema's own
 * `oneOf` at module load: a channel with no noun here would otherwise reach a
 * sentence as `undefined`, which is the shape of "a preset carries a undefined".
 */
const RASTER_CHANNEL_NOUNS: Record<string, string> = {
  bands: 'band list',
  ramp: 'ramp',
  base_swap: 'base swap',
};

/**
 * ONE SEED PER CHANNEL THIS PANEL CAN AUTHOR — A MAP, NOT A BRANCH.
 *
 * `setRasterChannelCommand` switches a document by DISCARDING the old channel
 * and seeding a fresh one, so it can only offer a channel it has a seed for.
 * Every seed lives here, keyed by the channel it writes, and the command LOOKS
 * ITS SEED UP rather than choosing between two of them.
 *
 * ⚠ THIS WAS AN `if`/`else` AND THE `else` WAS A LIE. `if (channel === 'ramp')
 * p.ramp = newRamp(); else p.bands = [newBand()]` is correct while there are
 * exactly two channels and authors the WRONG DOCUMENT for every one after that
 * — a `base_swap` switch would have seeded bands. A map cannot do that: an
 * unknown channel has no entry, which is a refusal rather than a wrong guess.
 *
 * `RASTER_CHANNEL_SEEDABLE` is the key set, not a second list typed beside it,
 * so a channel cannot gain a seed and stay "not authorable" in the dropdown.
 */
const RASTER_CHANNEL_SEEDS: Readonly<Record<string, (p: EffectsPreset) => void>> = Object.freeze({
  bands: (p: EffectsPreset) => { p.bands = [newBand()]; },
  ramp: (p: EffectsPreset) => { p.ramp = newRamp(); },
  base_swap: (p: EffectsPreset) => { p.base_swap = newBaseSwap(); },
});

const RASTER_CHANNEL_SEEDABLE: readonly string[] = Object.freeze(Object.keys(RASTER_CHANNEL_SEEDS));

/**
 * WHICH CHANNELS HAVE AN EDITOR ON THIS PANEL — the registry `rasterEditorGap`
 * reads.
 *
 * A card is genuinely per-channel content (two numbers here, five there, a list
 * of band cards for the third) and cannot be derived. What CAN be derived is
 * whether one is MISSING: a fourth arm would otherwise open, select correctly in
 * the Raster row, and render no editor at all, with nothing on screen saying so.
 */
const RASTER_CHANNEL_EDITORS: readonly string[] = Object.freeze(['bands', 'ramp', 'base_swap']);

// ═══ THE MODULE-LOAD GUARDS — every per-channel registry, checked against the
// schema's own channel set, so a channel cannot be added to the contract and
// quietly fall out of any of them.
for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
  if (RASTER_CHANNEL_NOUNS[c] === undefined) {
    throw new Error(
      `raster channel "${c}" is declared by aurora-effects-preset.schema.json's top-level oneOf `
      + 'but has no noun in RASTER_CHANNEL_NOUNS, so every sentence that names what a document '
      + 'carries would say "undefined". Add the noun — and decide whether the panel can seed it '
      + '(RASTER_CHANNEL_SEEDS) and whether it has an editor (RASTER_CHANNEL_EDITORS) rather than '
      + 'letting either default.',
    );
  }
}
for (const c of RASTER_CHANNEL_SEEDABLE) {
  if (!EFFECTS_PRESET_RASTER_CHANNELS.includes(c)) {
    throw new Error(
      `RASTER_CHANNEL_SEEDS carries a seed for "${c}", which the contract's top-level oneOf does `
      + 'not declare as a raster channel. A seed for a key the schema refuses would offer the '
      + 'author a switch that authors an invalid document.',
    );
  }
  // ⚠ AND THE SEED MUST WRITE ITS OWN KEY. A copy-paste that left `ramp`'s seed
  // under `base_swap`'s key would silently author the wrong channel on every
  // switch — the exact defect the map replaced an if/else to prevent, sneaking
  // back in as data. Cheap to prove: run it and ask the codec what it made.
  const probe: EffectsPreset = { schema: 1, id: 'seed-guard' };
  RASTER_CHANNEL_SEEDS[c](probe);
  if (presetRasterChannel(probe) !== c) {
    throw new Error(
      `RASTER_CHANNEL_SEEDS["${c}"] does not write the "${c}" key — it produced a `
      + `${presetRasterChannel(probe) ?? 'channel-less'} document. Every switch into that channel `
      + 'would author a different raster program than the one the author picked.',
    );
  }
}

/**
 * Why the panel cannot switch a preset INTO this channel, or null when it can.
 *
 * Read by the option label AND by `setRasterChannelCommand`'s refusal, so the
 * dropdown entry and the reason cannot disagree — `lastBandRefusal`'s idiom.
 */
export function rasterChannelSeedRefusal(channel: string): string | null {
  if (RASTER_CHANNEL_SEEDABLE.includes(channel)) return null;
  if (!EFFECTS_PRESET_RASTER_CHANNELS.includes(channel)) {
    return `"${channel}" is not a raster channel this contract declares.`;
  }
  // ⚠ NO CHANNEL'S NAME AND NO CHANNEL'S FIELDS APPEAR IN THIS SENTENCE. It
  // used to say what a `base_swap` seed would need ("a screen line and a VRAM
  // base address"), which was true for exactly one channel and would have been
  // quietly wrong for the next one to arrive without a seed.
  return `a ${RASTER_CHANNEL_NOUNS[channel]} cannot be authored in this panel yet: switching to a `
    + 'channel means seeding a fresh one and this panel has no seed for that channel. A document '
    + 'that already carries one opens, reads and saves correctly; only creating one from here is '
    + 'missing.';
}

/**
 * WHY THIS DOCUMENT HAS NO EDITOR BELOW, or null when it has one.
 *
 * ═══ THE FOURTH ARM'S LANDING PAD ═══
 *
 * Every raster channel this contract declares has a card on this panel today, so
 * this returns null for every real document — which is exactly why it exists.
 * The day a fifth arm is vendored, the Raster row will offer it and select it
 * correctly (both are derived from the schema) and the section below it would
 * render NOTHING, with no sentence saying why: an author looking at a preset
 * whose editor silently is not there. That is the shape of dead surface this
 * whole parcel is about, one level up.
 *
 * It takes the channel rather than the preset so it can be measured against a
 * channel that does not exist yet — a row that could only pass a real document
 * through it would be untestable until the defect it guards against had already
 * shipped.
 */
export function rasterEditorGapFor(channel: string | null, presetId: string): string | null {
  if (channel === null || RASTER_CHANNEL_EDITORS.includes(channel)) return null;
  const noun = RASTER_CHANNEL_NOUNS[channel] ?? channel;
  return `preset "${presetId}" carries a ${noun}, and this panel has no editor for it yet. The `
    + 'document opens, reads and saves correctly and nothing here has changed it — but its fields '
    + 'cannot be edited from this panel, so edit the JSON directly until this channel has a card. '
    + 'Switching the Raster program row above would DISCARD it.';
}

/** The same question, asked of a document. */
export function rasterEditorGap(preset: EffectsPreset): string | null {
  return rasterEditorGapFor(presetRasterChannel(preset), preset.id);
}

/**
 * The raster programs, off the schema's own top-level `oneOf`.
 *
 * ⚠ EVERY CHANNEL IS LISTED, INCLUDING THE ONES THE PANEL CANNOT SEED, because
 * this list is also what the `Select` renders the CURRENT channel from: leave
 * `base_swap` out and a base_swap document's Raster row shows the wrong program's
 * name. A channel that cannot be seeded says so IN ITS OWN LABEL, from
 * `rasterChannelSeedRefusal`, and `setRasterChannelCommand` refuses it — so the
 * entry is honest rather than silently dead.
 *
 * ⚠ AND THE LABELS ARE A MAP, NOT A TERNARY. This was
 * `c === 'ramp' ? ... : 'bands — a sparse fire list'`, which is correct while
 * there are exactly two channels and silently mislabels every one after that:
 * the day `base_swap` arrived it rendered as "bands — a sparse fire list".
 */
const RASTER_CHANNEL_LABELS: Record<string, string> = {
  bands: 'bands — a sparse fire list',
  ramp: 'ramp — one dense per-line run',
  base_swap: 'base swap — one mid-frame plane A base change',
};

export const RASTER_CHANNEL_OPTIONS: readonly { value: string; label: string }[] =
  Object.freeze(EFFECTS_PRESET_RASTER_CHANNELS.map((c) => {
    const label = RASTER_CHANNEL_LABELS[c];
    if (label === undefined) {
      throw new Error(
        `raster channel "${c}" is declared by the contract's top-level oneOf but has no label in `
        + 'RASTER_CHANNEL_LABELS, so the Raster dropdown would render an empty row. Add the label.',
      );
    }
    return Object.freeze({
      value: c,
      label: rasterChannelSeedRefusal(c) === null ? label : `${label} (not authorable here yet)`,
    });
  }));

/**
 * WHAT SWITCHING THE RASTER PROGRAM WILL DISCARD — said BEFORE the switch, not
 * after it.
 *
 * ═══ WHY THIS IS A SENTENCE AND NOT A CONFIRM DIALOG ═══
 *
 * `deletePresetRefusal`'s ruling, and the same reason: a confirm asks "are you
 * sure?" about a consequence the author cannot see. This NAMES the consequence —
 * how many bands, or that there is a ramp — which is the thing they would
 * otherwise have had to find out by doing it.
 *
 * ⚠ AND IT IS ONE UNDO STEP, WHICH IS THE BAR THIS CONTROL HAD TO CLEAR.
 * `editPresetCommand` builds a `set-effects-preset` carrying the WHOLE old
 * document and the whole new one; undo re-places the old one verbatim, so Ctrl+Z
 * restores exactly what was there, bands and all. That is `setBandArmCommand`'s
 * established shape on this very panel ("the author's old arm body is NOT lost
 * to them — the swap is one undo step"), and it is why a destructive conversion
 * was buildable here at all: decision cards d-29 and d-30 are about destructive
 * controls that are NOT one Ctrl+Z away, and this one is.
 */
export function rasterChannelSwapAdvisory(preset: EffectsPreset): string {
  const channel = presetRasterChannel(preset);
  const bands = (preset.bands ?? []).length;
  // ⚠ WHAT IT DISCARDS IS KNOWN; WHAT IT BECOMES IS NOT. This advisory is
  // painted UNDER the select and BEFORE the gesture, so it cannot know which
  // channel the author will pick. It said "seeds a fresh ramp" on a bands
  // document — true while there were exactly two channels, and a false promise
  // the moment a third existed: switching bands → base_swap would have promised
  // a ramp. Only the discarded side is named, because only that side is decided.
  //
  // The `bands` arm is a POSITIVE test on the one channel that has a countable
  // body, not a test against "the other one", so it stays right for every
  // channel there will ever be.
  const discards = channel === 'bands' || channel === null
    ? `${bands} raster band${bands === 1 ? '' : 's'}`
    : `this ${RASTER_CHANNEL_NOUNS[channel]}`;
  return `A preset holds exactly one raster program, so switching DISCARDS ${discards} and seeds a `
    + 'fresh one of whichever program you pick. It is ONE undo step — Ctrl+Z puts back exactly '
    + 'what was here.';
}

/**
 * Swap a preset's raster program.
 *
 * ONE `executeCommand`, ONE undo entry, and the old channel restored verbatim by
 * it — see `rasterChannelSwapAdvisory` for why that was the condition of
 * building this at all. The seed is `newRamp()` / `newBand()`, the same
 * every-key-written seeds a fresh document gets.
 *
 * `delete` rather than assigning `undefined`: the writer must emit neither an
 * absent key nor a null one, and an own property holding `undefined` is a
 * different object from an absent key to everything that enumerates it. The
 * `oneOf` is asserted on serialize as well as on parse, so a both-keys document
 * could not reach disk — but it could reach a panel, which is worse, because
 * there it silently looks like an editor that supports both.
 */
export function setRasterChannelCommand(
  library: EffectsPresetLibrary, id: string, channel: string,
): SetEffectsPresetCommand | null {
  if (rasterChannelSeedRefusal(channel) !== null) return null;
  return editPresetCommand(library, id, `Preset ${id} raster program: ${channel}`, (p) => {
    if (presetRasterChannel(p) === channel) return;
    // ⚠ EVERY OTHER CHANNEL IS DELETED, NOT JUST THE ONE SIBLING. This was an
    // if/else over two keys; with three channels an if/else would leave the
    // third in place and author the two-key document the `oneOf` refuses — which
    // serialize would catch, but only after the panel had shown an editor that
    // appeared to support both.
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      if (c !== channel) delete (p as unknown as Record<string, unknown>)[c];
    }
    // ⚠ THE SEED IS LOOKED UP, NOT CHOSEN. This was
    // `if (channel === 'ramp') … else p.bands = [newBand()]`, whose `else` meant
    // "the only other one" — so the first switch into a third channel would have
    // seeded BANDS while the dropdown said otherwise. The refusal above
    // guarantees the entry exists; the module-load guard above that guarantees
    // it writes its own key.
    RASTER_CHANNEL_SEEDS[channel](p);
  });
}
