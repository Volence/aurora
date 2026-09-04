// Raster PRESET documents — `{dataRoot}editor/effects/presets/<preset_id>.json`.
//
// Wave-2 surface of the parallax/raster effects arc, and a DIFFERENT FILE from
// the scene documents `scene.ts` codes. The distinction is the first thing to
// get right and the easiest to get wrong:
//
//   A SCENE is a `parallax_config` — scroll factors, deform, vsplit. It lives at
//   `{dataRoot}editor/effects/<scene_id>.json` and a section points at it with
//   `sceneRef`.
//
//   A PRESET is an `EffectsPreset`, of which the raster program is one channel
//   (`ep_raster`). Its bands live HERE. **A `bands` key on a SCENE file is
//   refused**, deliberately, by the scene loader's closed-schema path — so a
//   band panel that wrote into a scene would produce a file nothing loads.
//
// CONTRACT, both halves, pinned and read through git objects (never a sibling
// working tree):
//   • empyrean `contract/schema/aurora-effects-preset.schema.json`, the
//     NORMATIVE writer-side half, vendored beside this file. Provenance and the
//     pin of record: `aurora-effects-preset.schema.provenance.json`; the gate
//     that hashes it is test/formats/effects-preset-schema-drift.test.ts.
//   • aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §2.4 — the consumer's read set,
//     which the schema pairs with.
//   • aeon `docs/EDITOR_RASTER_PRESETS.md` (read at aeon origin/master, blob
//     94db6b3a52c33d4e59011ba7043b8b9827fab38b) is a WORKED EXAMPLE and says so
//     in its own header: "This page is NOT an authority on the format." Where it
//     and the schema disagree, the schema and `effects_gen.py` win. They agreed
//     field for field at the 6664b61 landing (docs/reviews/2026-08-29-band-
//     preset-panel.md); the 12aecd5 re-vendor opened a LAG (the schema declared
//     `cycles` and `variants` before aeon lowered them) which aeon closed on
//     2026-09-02, and the d36d704 re-vendor has opened another one with
//     `patch_world_ys` and `patch_motion` — step 4 of that key's four-step chain
//     is aeon's and has not run. The contract leading its consumer, measured and
//     NAMED by the drift gate's lag row and disclosed on screen by
//     `preset-lag.ts`, rather than papered over.
//
// THE STRUCTURAL IDEA IS SCENE.TS'S, UNCHANGED. Parse hands back what JSON.parse
// produced; serialize reorders by aeon's §5 canonical order and refuses to drop
// anything. A field this UI does not edit cannot be lost, because there is no
// list for it to be missing from.
//
// VALIDATION SPLIT, restated because the temptation is stronger here than it was
// for scenes. This module validates SHAPE (against the committed schema) and
// IDENTITY (stem == id, schema == 1). It validates NO NUMERIC VALUE and CLAMPS
// NOTHING — that is not an omission, it is aeon's §E.4 instruction: the
// generator forwards values verbatim so that the engine's own `ensure` fires
// with the measurement behind the rule ("band: height 1 is below this ON op's
// minimum — the ON fire costs 624 cyc against 488 available"). A clamp on this
// side replaces that sentence with silence, and authors something the author did
// not write. The schema is deliberately silent on bounds for the same reason and
// says so in its own `description`.

import type { FileAccess } from '../../project/adapter';
import { nameSome, type Notice } from '../../project/notice';
import type { JsonSchema } from './json-schema-subset';
import { validateAgainstSchema, canonicalizeBySchema } from './json-schema-subset';
import schemaJson from './aurora-effects-preset.schema.json';
import { canonicalJsonPretty } from '../canonical-json';

/** The committed contract schema, vendored byte-identical. */
export const EFFECTS_PRESET_SCHEMA = schemaJson as unknown as JsonSchema;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * The `on.cram` arm: raw CRAM colour words written from `addr`.
 *
 * `addr` is a CRAM **byte** address. `colours` is the word list, and its LENGTH
 * is also the derived restore's word count — the author is sizing two things
 * with one control, which is why the panel says so.
 */
export interface EffectsPresetCram {
  addr: number;
  colours: number[];
}

/**
 * The `on.pal_region` arm: colours streamed from a `Pal_Variant_Stage` slot.
 *
 * `slot` is the SOURCE, not the CRAM destination — the field most likely to be
 * misread, so the panel's title says it in those words. `pal_line` and `entry`
 * must AGREE with `addr` (`addr >> 5 == pal_line`, `(addr >> 1) & 15 == entry`),
 * which the engine checks and this module does not.
 */
export interface EffectsPresetPalRegion {
  addr: number;
  slot: number;
  pal_line: number;
  entry: number;
  count: number;
}

/**
 * The band's ON op. EXACTLY ONE ARM — zero, two, or an unknown arm are refused.
 *
 * Two arms would be two writes and therefore two restores, which is two bands
 * (schema `$defs.band.properties.on`). `vsram` is absent on purpose: a band's
 * restore is derived from the ON op's CRAM span, and a VSRAM op has none.
 */
export type EffectsPresetBandOn =
  | { cram: EffectsPresetCram }
  | { pal_region: EffectsPresetPalRegion };

/**
 * One band.
 *
 * ALL FOUR FIELDS REQUIRED, NONE WITH A DEFAULT, `sh` INCLUDED. That is
 * deliberate and it is the one place this codec's shape looks unfriendly: the
 * engine's `region_boundary` note is that whether an effect changes a mode
 * register is worth stating at the call site, and a JSON default would restore
 * the silence that ruling removed. So the panel writes `sh` every time.
 *
 * `sh` accepts a JSON boolean OR the integers 0/1, and this codec preserves
 * whichever the file carried rather than normalising — a normalising read would
 * put a diff on every load/save of a hand-written document.
 */
export interface EffectsPresetBand {
  /** Screen line the effect turns ON; the band's writes land on this line. */
  top: number;
  /** Screen line the effect turns OFF. The band covers `top..bot-1` inclusive. */
  bot: number;
  /** Shadow/Highlight for this band. `false`/`0` two fires; `true`/`1` three. */
  sh: boolean | 0 | 1;
  on: EffectsPresetBandOn;
}

/**
 * One palette-cycle channel — `$defs.cycle_channel` (empyrean 12aecd5): a
 * rotating span of CRAM entries, lowered through aeon's `cycle_channel()`.
 *
 * FOUR REQUIRED AND ONE OPTIONAL, which is the constructor's own split: only
 * `dir` has an engine default (forward). `period` is in the AUTHOR's unit
 * (frames between rotations); the engine's +1 quirk is the generator's to
 * absorb, never this codec's (ruling Q7) — so no value here is touched.
 */
export interface EffectsPresetCycleChannel {
  /** CRAM line the rotation runs on. Never 0 — the constructor refuses it. */
  line: number;
  /** First entry index within the line. */
  first: number;
  /** How many consecutive entries rotate. */
  count: number;
  /** Frames between rotations, in the author's unit. */
  period: number;
  /** Rotation direction; the only field the constructor defaults. */
  dir?: number;
}

/**
 * One palette variant descriptor — `$defs.pal_variant` (empyrean 12aecd5),
 * lowered through aeon's `variant()`: per channel, `clamp((c >> shift) + bias,
 * 0, 7)` on the CRAM lines the `lines` bitmask names.
 *
 * EVERY FIELD OPTIONAL, because every one has a constructor default — which is
 * what lets the shipped deep-water variant be `{shift_r: 1, shift_g: 1}`
 * verbatim. `lines` is the engine's INTEGER BITMASK, 1:1 with the field
 * (ruling Q4); a friendlier spelling is a panel's job, not the wire's.
 */
export interface EffectsPresetPalVariant {
  shift_r?: number;
  bias_r?: number;
  shift_g?: number;
  bias_g?: number;
  shift_b?: number;
  bias_b?: number;
  /** Which CRAM lines the derive covers, as the bitmask the engine field is. */
  lines?: number;
}

/**
 * One authored anchor MOTION — `$defs.anchor_sweep` (empyrean d36d704), lowered
 * through aeon's `anchor_sweep()` (`raster_dsl.emp:2232-2238`), which packs all
 * three fields into one motion word.
 *
 * ═══ BOTH SHIFTS ARE BASE-2 LOGARITHMS, NOT PHYSICAL UNITS ═══
 *
 * Peak excursion is `256 >> amp_shift` px and one cycle is `256 << period_shift`
 * logic ticks — so the legal domain is SEVEN amplitude rungs and NINE period
 * rungs and nothing between them. A control that takes a continuous pixel or
 * seconds value and ROUNDS it into a shift silently doubles or halves what the
 * author asked for, with no error anywhere. `ANCHOR_AMP_RUNGS` and
 * `ANCHOR_PERIOD_RUNGS` below are the ladders themselves, derived from this
 * schema, so a panel offers the rungs instead of re-deriving them.
 *
 * `phase` is the only continuous field, and the only one `anchor_sweep()`
 * defaults (to 0) — which is why it is the only optional one here.
 */
export interface EffectsPresetAnchorSweep {
  /** Amplitude rung: peak excursion `256 >> amp_shift` px. 2..8, no default. */
  amp_shift: number;
  /** Period rung: one cycle is `256 << period_shift` logic ticks. 0..8, no default. */
  period_shift: number;
  /** Starting point in the 256-entry sine table, 0..255. The only optional field. */
  phase?: number;
}

/**
 * One patch channel's motion — `$defs.patch_motion_entry`. EXACTLY ONE ARM, and
 * `sweep` is the only arm there is.
 *
 * NO `approach` ARM EXISTS AND NONE IS RESERVED, ruled at d36d704 on aeon's own
 * request rather than merely accepted: APPROACH has no preset seed field
 * (`preset.emp:81-87` scopes it out; its handle is the runtime call
 * `Effects_SetTargetY`), so a reserved arm would be a key with nothing behind
 * it. Adding one later is its own contract change — which is why this is a plain
 * interface and not a union with one member: a union would advertise a second
 * arm's arrival as a shape this codec was already shaped for, and it is not.
 */
export interface EffectsPresetPatchMotion {
  sweep: EffectsPresetAnchorSweep;
}

/**
 * A signed fixed-point value, `$defs.fp16` — the document face of aeon's
 * `fp16(whole, frac256)` helper (`engine/effects/raster.emp:684-689`).
 *
 * ═══ THE SIGN RULE, AND WHY IT IS NOT THE OBVIOUS ONE ═══
 *
 * `frac256` IS A MAGNITUDE. The sign lives on `whole` ALONE and applies to the
 * whole value, so `{whole: -1, frac256: 128}` is **-1.5**, not -0.5. The obvious
 * implementation, `whole + frac256 / 256`, yields -0.5 for that input — wrong by
 * a whole pixel, with both numbers still inside their declared ranges, so NO
 * SCHEMA CAN CATCH IT. `presetFp16ToNumber` below is the one conversion, and
 * `EFFECTS_PRESET_FP16_SIGNED_EXAMPLE` re-derives that row from the schema's own
 * sentence at module load rather than trusting this comment.
 *
 * The authored range is `fp16`'s own two ensures (`whole` -512..511,
 * `frac256` 0..255) and NOT the storage width: `rrp_start`/`rrp_step` are u32
 * fields carrying signed 16.16 whose whole part could span roughly
 * -32768..32767, about 64x what the build accepts. State the range, note the
 * width, never the reverse.
 *
 * A CONSEQUENCE WORTH KNOWING BEFORE A CONTROL IS BUILT: because the sign is
 * `whole`'s, the interval (-1, 0) is UNREACHABLE. There is no spelling of -0.5;
 * `{whole: 0, frac256: 128}` is +0.5. The smallest negative magnitude below one
 * pixel does not exist in this encoding.
 */
export interface EffectsPresetFp16 {
  /** Integer part, -512..511. Carries the SIGN of the whole value. */
  whole: number;
  /** Sub-pixel part in 1/256 px, 0..255. A MAGNITUDE — never negative. */
  frac256: number;
}

/**
 * Where a ramp writes — `$defs.ramp_target`. EXACTLY ONE ARM, and `vsram` is the
 * only arm this contract has.
 *
 * No `cram` arm exists and NONE IS RESERVED, on the same rule that kept an
 * `approach` arm out of `patch_motion`: the engine constructor does accept a CRAM
 * target (`raster.emp:652-659`), but nothing authors one, and an arm with nothing
 * behind it is a key that advertises a shape this codec is not shaped for. A CRAM
 * ramp arrives by its own contract change. This is therefore a plain interface
 * and not a union with one member.
 */
export interface EffectsPresetRampTarget {
  vsram: {
    /**
     * The VSRAM byte address written every line, 0..78. Plane A's whole-plane
     * vertical scroll is 0 and plane B's is 2. Whether an ODD address is
     * meaningful is NOT ESTABLISHED — the engine refuses only `> 78` and this
     * codec refuses exactly what the schema refuses.
     */
    addr: number;
  };
}

/**
 * The dense-tier ramp — `$defs.ramp`, the document face of
 * `raster_ramp_program(top, lines, cmd, start, step)` (`raster.emp:629-678`).
 * All five members are required because the constructor defaults none of them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ║ THE MUST NOT: A PER-LINE CURVE IS NOT AUTHORABLE, AND NEVER WILL BE HERE ║
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A ramp authors exactly ONE linear rate (`step`) and ONE starting offset
 * (`start`) over a `top`/`lines` span. There are no independent per-line values
 * and there is no curve. `RasterRampProgram` has one `rrp_step` and one
 * `rrp_start` and NO FIELD THAT COULD RECEIVE A TABLE (`raster.emp:590-591`), so
 * a control offering per-line values would author what the engine cannot honour —
 * the document would validate, generate, and then be silently wrong on hardware.
 *
 * THE NAME IS THE ENFORCEMENT. The key is `ramp` — the tree's own spelling
 * (`RasterRampProgram` / `raster_ramp_program` / `OP_RUN_RAMP`) — and a ramp is
 * linear by definition, so the forbidden model is INEXPRESSIBLE rather than
 * merely refused. The schema object is closed, so a `curve` key is refused by
 * closure; the contract vectors carry that refusal as a named row. If a future
 * control wants a curve, that is an engine change first and a contract change
 * second, in that order, and never a widened `curve` key here (aeon DoD item 12
 * names that road explicitly and closes it).
 *
 * Do not confuse this with `SceneCurve.To` (`scene_dsl.emp:392`), an older and
 * unrelated use of the word "ramp" for the BG HScroll factor curve.
 *
 * ═══ ONE RASTER PROGRAM PER DOCUMENT ═══
 *
 * `ramp` and `bands` lower into the SAME `raster:` channel and the engine has no
 * combinator that mixes a sparse fire list with a dense run. Exactly one of them
 * per document, spelled as the schema's top-level `oneOf`; see
 * `EFFECTS_PRESET_RASTER_CHANNELS`.
 */
export interface EffectsPresetRamp {
  /**
   * First screen line of the run, 3..222. NOTE the display offset, and note
   * that it is TWO numbers: for a VSRAM target the value written on run index
   * `j` DISPLAYS on line `top + j + EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG`, and
   * because `j` starts at 1 the FIRST value displays on
   * `top + EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET`. Never use one for the
   * other's question.
   */
  top: number;
  /** Run length in scanlines, 1..220. One write per line. */
  lines: number;
  target: EffectsPresetRampTarget;
  /** The accumulator's value on the run's FIRST line, in pixels. */
  start: EffectsPresetFp16;
  /**
   * The per-line delta, in pixels of vertical scroll PER SCANLINE — a RATE.
   * This is the ONLY per-line vocabulary a ramp has.
   */
  step: EffectsPresetFp16;
}

/**
 * The mid-frame nametable-base SWAP — `$defs.base_swap`, the document face of
 * `raster_program([fire(line, [reg_set($8200 | vdp_base_reg(VdpBase.PlaneA,
 * target))])])`. Both members are required; the object is CLOSED. The "Batman &
 * Robin trick": from `line` down, Plane A draws from a different nametable.
 *
 * ═══ TWO ASYMMETRIES WITH `ramp`. DO NOT ASSUME SYMMETRY BY ANALOGY. ═══
 *
 * A reader arriving here straight from `EffectsPresetRamp` will carry two of its
 * properties across, and BOTH ARE WRONG for this key. They are stated here
 * because the schema states them, and because an assumed capability gate is the
 * kind of thing a control parcel silently builds a disabled button around.
 *
 *   1. NO CAPABILITY GATE. `ramp` renders only in a game whose
 *      `Game.SCANLINE_CAPS` declares `CAP_DENSE_TIER`, and aeon's generator must
 *      re-emit that ensure at every generated call site. `base_swap` has NO such
 *      bit: `OP_SET_REG` dispatches unconditionally in every game, so nothing is
 *      gated and no ensure is re-emitted. There is no game in which authoring a
 *      base_swap silently no-ops for want of a capability.
 *   2. NOT DEBUG-GATED. The generated section-6 emission is unconditional `pub`
 *      data reaching `s4.bin` — aeon measured `EditorRaster_OJZ_Act1_ojz_sec6_
 *      baseswap` at $013446 in the RELEASE listing, its 22 bytes identical to the
 *      hand-authored `OJZ_BaseSwap` program.
 *
 * ═══ ONE RASTER PROGRAM PER DOCUMENT ═══
 *
 * `base_swap`, `ramp` and `bands` all lower into the SAME `EffectsPreset.ep_raster`
 * channel and no combinator exists, so exactly one per document — the schema's
 * top-level `oneOf`, which grew its THIRD arm for this key. See
 * `EFFECTS_PRESET_RASTER_CHANNELS`, which is read off that `oneOf` and not
 * restated.
 */
export interface EffectsPresetBaseSwap {
  /**
   * The screen line the swap fires on, 3..223 — `fire()`'s own ensure (lines 0-2
   * belong to the priming records; 223 is the frame-rewind interlock). Read the
   * range from `EFFECTS_PRESET_BASE_SWAP_LINE_RANGE`, never retyped.
   *
   * ⚠ NOT the ramp's `top` range. A ramp's `top` maxes at 222 because a run needs
   * at least one line after it; a swap is a single fire and reaches 223.
   */
  line: number;
  /**
   * The raw VRAM BYTE ADDRESS Plane A's base register (VDP reg $02) is
   * re-pointed at — 0..65535, and a MULTIPLE OF 8192.
   *
   * ⚠ THIS IS AN ADDRESS, NOT AN INDEX OR A FLAG. The shipped section-6 preset
   * targets **57344 = $E000 = VRAM_PLANE_B**, i.e. from line 160 down, Plane A
   * draws Plane B's picture. A reader meeting `57344` with no comment has no way
   * to know that, and a control that offered it as a bare number would be asking
   * an author for a hexadecimal VRAM constant in decimal.
   *
   * THE GRANULE IS WHY `multipleOf` IS HERE AND WHY IT IS NOT A ROUNDING
   * CONVENIENCE: reg $02 encodes only the address bits ABOVE $2000 and DROPS the
   * rest SILENTLY. An unaligned target is not out of range — it is a DIFFERENT
   * address than every `VRAM_*` consumer reads and writes, with nothing else
   * visibly wrong. See `EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE`.
   */
  target: number;
}

/**
 * The preset document. `bands` is the raster channel; `cycles` and `variants`
 * (empyrean 12aecd5, AURORA_EFFECTS_SCHEMA.md §7.2) and `patch_world_ys` /
 * `patch_motion` (empyrean d36d704, §7.3) are OTHER CHANNELS OF THE SAME
 * `EffectsPreset` record, which is why they live beside it and one `rasterRef`
 * binds the whole document (ruling Q1).
 *
 * THREE STATES EACH, AND ABSENT IS ONE OF THEM — so this codec must never
 * normalise an absent key to null or an empty array, and never drop a null:
 *
 *   `cycles`   absent = keep the section's hand-authored cycle (the no-cost
 *              majority case); `null` = cycling OFF (lowers to the
 *              Pal_Cycle_None sentinel); array = the authored script. An empty
 *              array is legal JSON here and the GENERATOR's refusal (§7.2).
 *   `variants` positional, index = slot: an index the array does not reach
 *              (including an absent key) keeps that slot's hand-authored value
 *              — load-bearing, because every shipped preset carries the act's
 *              water tint; `null` at an index CLEARS that slot; an object
 *              authors it. There is no key-level null: clearing both slots is
 *              `[null, null]`.
 *
 *   `patch_world_ys` / `patch_motion` — positional, index = PATCH CHANNEL, at
 *              most `EFFECTS_PRESET_MAX_PATCH`. Same three states as `variants`,
 *              and the sentinel spelling matters more here than anywhere else in
 *              this file: `null` is `PATCH_ANCHOR_NONE` ($7FFF) and **`0` is a
 *              real world Y, above the screen top** — the most invasive state a
 *              channel can have. Never write 0 to mean absent. A SHORT ARRAY IS
 *              LEGAL AND THIS WRITER MUST NOT PAD IT: padding turns "the section
 *              keeps its hand-authored channel" into "the editor authored
 *              something here", which is a different document.
 */
export interface EffectsPreset {
  schema: 1;
  id: string;
  /** Display label. Writer-owned: read by nothing, dropped on lowering. */
  name?: unknown;
  /**
   * The SPARSE raster channel. OPTIONAL SINCE empyrean 9233883 (§7.4): `bands`
   * left the schema's top-level `required` list when `ramp` arrived, and a
   * ramp-only document is legal. A document still carries exactly one raster
   * program — see `ramp` below and `EFFECTS_PRESET_RASTER_CHANNELS`.
   *
   * WHY THIS IS OPTIONAL RATHER THAN A DISCRIMINATED UNION OF TWO DOCUMENT
   * TYPES: a union would make `preset.bands` a narrowing question at all
   * fifty-odd read sites, most of which are panels that legitimately mean "the
   * bands, if this document has any" and already handle an empty list. The
   * exactly-one rule is not weakened by that choice — it is asserted by the
   * schema's top-level `oneOf` on every parse AND on every serialize, which is
   * where a document is actually accepted or refused. `presetRasterChannel`
   * below is the narrowing helper for code that needs to branch.
   */
  bands?: EffectsPresetBand[];
  /**
   * The DENSE raster channel. Mutually exclusive with `bands` — the same
   * `raster:` slot, and no combinator exists. See `EffectsPresetRamp` for the
   * per-line-curve MUST NOT.
   */
  ramp?: EffectsPresetRamp;
  /**
   * The BASE-SWAP raster channel (empyrean 5bd76ba, §7.5). Mutually exclusive
   * with `bands` and `ramp` — the same `raster:` slot. Unlike `ramp` it is
   * neither capability-gated nor DEBUG-gated; see `EffectsPresetBaseSwap`.
   */
  base_swap?: EffectsPresetBaseSwap;
  cycles?: EffectsPresetCycleChannel[] | null;
  variants?: (EffectsPresetPalVariant | null)[];
  /**
   * The anchor SEED per patch channel, in WHOLE PIXELS of absolute level space.
   * NEITHER SIDE CONVERTS — see `EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL`.
   */
  patch_world_ys?: (number | null)[];
  /** The anchor MOTION per patch channel, in the SAME index space as the seed. */
  patch_motion?: (EffectsPresetPatchMotion | null)[];
}

// ---------------------------------------------------------------------------
// Constants derived FROM the schema, never re-typed beside it
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
 * `^[a-z][a-z0-9_]{0,31}$`, read out of the schema rather than restated.
 *
 * The same asymmetry scene ids have: this becomes a component of the generated
 * `.emp` label `EditorRaster_<ACT>_<id>`, so Aurora's hyphenated BG-library
 * slugs are not legal here.
 */
export const EFFECTS_PRESET_ID_PATTERN =
  new RegExp(schemaNode(['properties', 'id']).pattern as string);

/** The band's required keys, in the schema's own `required` order. */
export const EFFECTS_PRESET_BAND_KEYS: readonly string[] =
  Object.freeze([...(schemaNode(['$defs', 'band']).required as string[])]);

/** The two ON arms, read off the schema's declared `on` properties. */
export const EFFECTS_PRESET_ON_ARMS: readonly string[] = Object.freeze(
  Object.keys(schemaNode(['$defs', 'band', 'properties', 'on', 'properties'])),
);

/** One arm's required field names, in the schema's `required` order. */
export function presetArmFields(arm: string): readonly string[] {
  return Object.freeze([...(schemaNode(['$defs', arm]).required as string[])]);
}

/** Every root key the schema DECLARES (required, optional and writer-owned alike). */
export const EFFECTS_PRESET_ROOT_KEYS: readonly string[] =
  Object.freeze(Object.keys(schemaNode(['properties'])));

/**
 * A `$defs` object's field names split the way its schema node splits them:
 * `required` in the schema's own order, `optional` = declared and not required.
 * Read off the vendored file so the interfaces above can be checked against it
 * (test/formats/effects-preset.test.ts) rather than trusted.
 */
export function presetDefFields(def: string): { required: readonly string[]; optional: readonly string[] } {
  const node = schemaNode(['$defs', def]);
  const required = [...((node.required as string[] | undefined) ?? [])];
  const declared = Object.keys(node.properties as Record<string, unknown>);
  return Object.freeze({
    required: Object.freeze(required),
    optional: Object.freeze(declared.filter(k => !required.includes(k))),
  });
}

// ---------------------------------------------------------------------------
// The anchor keys (empyrean d36d704, §7.3) — bounds and LADDERS, derived
// ---------------------------------------------------------------------------

/**
 * Pull one number out of a schema `description`, or throw naming the sentence.
 *
 * ═══ WHY A SENTENCE AND NOT A LITERAL BESIDE IT ═══
 *
 * The three constants below (256, 256, 60) are the ones the two shift LADDERS
 * are computed from, and the schema states each of them in prose because JSON
 * Schema has no keyword for "this integer is a base-2 logarithm of a physical
 * quantity". Retyping them here would put a second copy of an engine constant in
 * this repo with nothing measuring it — the failure `EFFECTS_PRESET_RESERVED_KEYS`
 * below was built against, one level down. So they are READ, and read LOUDLY:
 * a sentence that stops matching throws at module load rather than silently
 * yielding a plausible-looking wrong ladder.
 */
function schemaNumberFromProse(path: string[], re: RegExp, what: string): number {
  const description = String(schemaNode(path).description ?? '');
  const m = re.exec(description);
  if (!m) {
    throw new Error(
      `aurora-effects-preset.schema.json no longer states ${what} at ${path.join('.')} in the ` +
      `shape ${re} that this module reads it from. Re-read the schema and update the derivation ` +
      '— do NOT hardcode the number: it is an engine constant, and a second unmeasured copy of ' +
      'one is exactly what this reader exists to avoid.',
    );
  }
  return Number(m[1]);
}

/** `RASTER_MAX_PATCH` — how many patch channels either array may reach. */
export const EFFECTS_PRESET_MAX_PATCH: number =
  schemaNode(['properties', 'patch_world_ys']).maxItems as number;

/** The seed's integer branch: `{type, minimum, maximum, not:{const}}`. */
const SEED_INT = schemaNode(['properties', 'patch_world_ys', 'items', 'oneOf', '0']);

/** The seed's inclusive range on the wire — the engine field is a `u16`. */
export const EFFECTS_PRESET_WORLD_Y_RANGE: Readonly<{ min: number; max: number }> =
  Object.freeze({ min: SEED_INT.minimum as number, max: SEED_INT.maximum as number });

/**
 * `PATCH_ANCHOR_NONE` — the one seed value the schema REFUSES, read off its own
 * `not`. "Channel unused" is spelled `null`; writing the sentinel as an integer
 * is refused so the two spellings cannot both mean it.
 */
export const EFFECTS_PRESET_PATCH_ANCHOR_NONE: number =
  (SEED_INT.not as Record<string, unknown>).const as number;

/**
 * HOW MANY WIRE UNITS MAKE ONE PIXEL FOR A PATCH SEED. **One.**
 *
 * ═══ THE ONE NUMBER THIS PARCEL SHIPS A SILENT BUG WITHOUT ═══
 *
 * `drift.rate` — the OTHER effects key an author sets in pixels — is 1/256 px
 * per frame, and Aurora multiplies by 256 on export in exactly one place
 * (`scene-ui.ts`'s `EFFECTS_DRIFT_UNITS_PER_PIXEL`). A world Y carried through
 * that habit lands 256 times down the level, `anchor - Camera_Y` is enormous,
 * and THE BAND SILENTLY NEVER APPEARS. The schema cannot catch it: 224 × 256 =
 * 57344 is inside the u16 range and validates clean. empyrean's §7.3 says so in
 * its own verification note.
 *
 * So the ratio is stated HERE, as a constant a test can be written against, and
 * it is READ FROM THE CONTRACT rather than typed: the schema's own unit sentence
 * ends "NEITHER SIDE CONVERTS, 1:1". If a future amendment ever gives this field
 * a scale, this line changes with the contract instead of disagreeing with it.
 */
export const EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL: number = (() => {
  const description = String(schemaNode(['properties', 'patch_world_ys']).description ?? '');
  const m = /NEITHER SIDE CONVERTS, (\d+):(\d+)\./.exec(description);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer carries the "NEITHER SIDE CONVERTS, 1:1" ' +
      'sentence that EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL is derived from. Re-read the ' +
      'unit paragraph before writing another world Y: if the contract has given this field a ' +
      'scale, every seed Aurora has written is wrong by that factor.',
    );
  }
  const [wire, px] = [Number(m[1]), Number(m[2])];
  if (px === 0) throw new Error('the seed unit sentence parsed to a zero denominator');
  return wire / px;
})();

/** One rung of the amplitude ladder. */
export interface AnchorAmpRung {
  amp_shift: number;
  /** Peak excursion from the seed, in pixels: `base >> amp_shift`. */
  peak_px: number;
  /** Total travel — twice the peak. What an author actually sees move. */
  peak_to_peak_px: number;
}

/** One rung of the period ladder. */
export interface AnchorPeriodRung {
  period_shift: number;
  /** One full cycle, in logic ticks: `base << period_shift`. */
  ticks: number;
  /** The same cycle in seconds at the engine's tick rate. */
  seconds: number;
}

const SWEEP = ['$defs', 'anchor_sweep'] as const;
const AMP = [...SWEEP, 'properties', 'amp_shift'];
const PERIOD = [...SWEEP, 'properties', 'period_shift'];
const PHASE = [...SWEEP, 'properties', 'phase'];

/** `ANCHOR_SINE_AMP` — peak excursion is this many pixels shifted RIGHT. */
const ANCHOR_AMP_BASE_PX =
  schemaNumberFromProse(AMP, /peak excursion (\d+) >> amp_shift px/, 'the amplitude base');
/** One cycle at `period_shift` 0, in logic ticks; higher rungs shift it LEFT. */
const ANCHOR_PERIOD_BASE_TICKS =
  schemaNumberFromProse(PERIOD, /one cycle is (\d+) << period_shift logic ticks/, 'the period base');
/** The tick rate the schema quotes its seconds at. */
const ANCHOR_TICKS_PER_SECOND =
  schemaNumberFromProse([...SWEEP], /at (\d+) Hz/, 'the tick rate');

function inclusiveRange(path: string[]): number[] {
  const node = schemaNode(path);
  const lo = node.minimum as number;
  const hi = node.maximum as number;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || hi < lo) {
    throw new Error(`${path.join('.')} does not declare an integer minimum..maximum`);
  }
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * THE AMPLITUDE LADDER — every peak a sweep can have, and nothing between.
 *
 * Seven rungs, computed from the schema's own `minimum`/`maximum` and the base
 * it states in prose. A panel that offers this array cannot offer an illegal
 * amplitude, and cannot round one into the wrong rung.
 */
export const ANCHOR_AMP_RUNGS: readonly AnchorAmpRung[] = Object.freeze(
  inclusiveRange(AMP).map((amp_shift) => Object.freeze({
    amp_shift,
    peak_px: ANCHOR_AMP_BASE_PX >> amp_shift,
    peak_to_peak_px: (ANCHOR_AMP_BASE_PX >> amp_shift) * 2,
  })),
);

/** THE PERIOD LADDER — nine rungs, on the same terms as the amplitude ladder. */
export const ANCHOR_PERIOD_RUNGS: readonly AnchorPeriodRung[] = Object.freeze(
  inclusiveRange(PERIOD).map((period_shift) => Object.freeze({
    period_shift,
    ticks: ANCHOR_PERIOD_BASE_TICKS * (2 ** period_shift),
    seconds: (ANCHOR_PERIOD_BASE_TICKS * (2 ** period_shift)) / ANCHOR_TICKS_PER_SECOND,
  })),
);

/** `phase`'s inclusive range — the sweep's one CONTINUOUS field. */
export const ANCHOR_PHASE_RANGE: Readonly<{ min: number; max: number }> = Object.freeze({
  min: schemaNode(PHASE).minimum as number,
  max: schemaNode(PHASE).maximum as number,
});

// ---------------------------------------------------------------------------
// The ramp key (empyrean 9233883, §7.4) — bounds, the fp16 SIGN RULE, and the
// display lag. Every number below is READ OUT of the vendored schema; none is
// typed beside it, and every prose read throws at module load when its sentence
// moves rather than yielding a plausible-looking wrong value.
// ---------------------------------------------------------------------------

/** An inclusive `{min, max}` read off one schema node's own minimum/maximum. */
function schemaRange(path: string[]): Readonly<{ min: number; max: number }> {
  const node = schemaNode(path);
  const min = node.minimum;
  const max = node.maximum;
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error(
      `aurora-effects-preset.schema.json no longer bounds ${path.join('.')} with both a numeric ` +
      'minimum and maximum, which this module reads its range from. Re-read the schema — do NOT ' +
      'hardcode the bounds.',
    );
  }
  return Object.freeze({ min, max });
}

const RAMP = ['$defs', 'ramp'] as const;

/**
 * ⚠ THE RAMP'S PROSE LIVES IN TWO PLACES AND THEY ARE NOT INTERCHANGEABLE.
 *
 * `$defs.ramp` (`RAMP` above) carries the SHAPE rules — the fields, the span
 * interlock `top + lines <= 223`, the per-field sentences. `properties.ramp`
 * carries the KEY's paragraph: what the channel is, the exclusivity with
 * `bands`, the generator obligations, and — the reason this constant exists —
 * the PER-INDEX display sentence and the CRAM sentence. A derivation that reads
 * the wrong one of the two throws at module load rather than yielding a
 * plausible number, which is how this path was found in the first place.
 */
const RAMP_KEY = ['properties', 'ramp'] as const;

/**
 * The raster channels, read off the schema's TOP-LEVEL `oneOf` rather than
 * restated: exactly one of these keys per document.
 *
 * Read from the `oneOf` and not from `properties`, because it is the `oneOf`
 * that carries the exclusivity. When a channel is added, or the exclusivity is
 * ever relaxed, this list changes with it and the gate that asserts its contents
 * goes red.
 *
 * ⚠ IT WAS TWO AND IS NOW THREE (`base_swap`, empyrean 5bd76ba). Nothing here
 * needed editing for that, which is the point of deriving it — but the sentence
 * "the two raster channels" was in this docblock and would have gone quietly
 * wrong, so treat the COUNT as a thing that moves and the DERIVATION as the
 * thing that does not.
 */
export const EFFECTS_PRESET_RASTER_CHANNELS: readonly string[] = (() => {
  const branches = (EFFECTS_PRESET_SCHEMA as Record<string, unknown>).oneOf;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer carries a top-level oneOf, which is where the ' +
      'exactly-one-raster-channel rule lives and where EFFECTS_PRESET_RASTER_CHANNELS is derived ' +
      'from. Re-read the schema — do NOT hardcode the channel names.',
    );
  }
  const names = branches.map((b) => {
    const req = (b as Record<string, unknown>).required;
    if (!Array.isArray(req) || req.length !== 1 || typeof req[0] !== 'string') {
      throw new Error(
        'a top-level oneOf branch in aurora-effects-preset.schema.json is not the single-`required`' +
        ' shape EFFECTS_PRESET_RASTER_CHANNELS reads. Re-read the schema.',
      );
    }
    return req[0];
  });
  return Object.freeze(names.slice().sort());
})();

/**
 * Which raster channel a document carries, or null when it carries neither.
 *
 * The narrowing helper the `EffectsPreset` interface's comment points at: code
 * that must branch on the channel asks HERE rather than testing `bands` for
 * undefined, so there is one spelling of the question. It reports what the
 * document HAS; it is not the refusal — the schema's `oneOf` is, on parse and on
 * serialize alike, and it is what refuses a document carrying both.
 */
export function presetRasterChannel(
  preset: Partial<EffectsPreset>,
): 'bands' | 'ramp' | 'base_swap' | null {
  if (preset.base_swap !== undefined) return 'base_swap';
  if (preset.ramp !== undefined) return 'ramp';
  if (preset.bands !== undefined) return 'bands';
  return null;
}

/** `top`'s inclusive range, 3..222 in the vendored schema. */
export const EFFECTS_PRESET_RAMP_TOP_RANGE = schemaRange([...RAMP, 'properties', 'top']);

/** `lines`'s inclusive range, 1..220 in the vendored schema. */
export const EFFECTS_PRESET_RAMP_LINES_RANGE = schemaRange([...RAMP, 'properties', 'lines']);

/** The VSRAM byte address's inclusive range, 0..78 in the vendored schema. */
export const EFFECTS_PRESET_RAMP_VSRAM_ADDR_RANGE =
  schemaRange(['$defs', 'ramp_target', 'properties', 'vsram', 'properties', 'addr']);

/**
 * `top + lines <= 223` — the frame-rewind interlock, READ OUT OF THE SCHEMA'S
 * OWN PROSE because JSON Schema cannot express a constraint over two fields.
 *
 * THIS IS WHY THE PER-FIELD MAXIMA ARE NOT THE CONTRACT. `top <= 222` and
 * `lines <= 220` are only the loosest values the SUM admits; `{top: 222,
 * lines: 220}` satisfies both and is refused by the engine. The schema itself
 * says so and refuses neither, so this bound is the generator's and the engine's
 * — a control that offers the per-field maxima as a valid pair offers a build
 * failure. Stated here so the follow-up control has one place to read it.
 */
export const EFFECTS_PRESET_RAMP_SPAN_MAX: number = schemaNumberFromProse(
  [...RAMP],
  /top \+ lines <= (\d+)/,
  'the top + lines span bound',
);

/**
 * ═══ THE RAMP'S DISPLAY GEOMETRY IS **TWO** NUMBERS, NOT ONE ═══
 *
 * ⚠ READ THIS BEFORE USING EITHER CONSTANT BELOW. Until empyrean `e9409dc` this
 * module exported ONE constant, `EFFECTS_PRESET_RAMP_VSRAM_DISPLAY_LAG`, and two
 * consumers used it two different ways — as a FIRST-LINE OFFSET in
 * `rampDisplaySpan` and as a PER-INDEX LAG in the readout's own title. While the
 * contract said `top + 1` in both sentences the two readings happened to agree
 * and nothing distinguished them. THEY NO LONGER AGREE, and one number serving
 * both would have painted a false sentence at an author. So the quantity is
 * split, each half is parsed from ITS OWN schema sentence, and the name says
 * which question it answers.
 *
 * THE TWO QUESTIONS, AND WHY THE ANSWERS DIFFER BY EXACTLY ONE:
 *
 *   • "Where does the value at run index `j` land?"   -> `..._INDEX_LAG` (1)
 *         value j (= start + j*step) displays on screen line `top + j + 1`.
 *   • "Where does the FIRST thing an author sees land?" -> `..._FIRST_LINE_OFFSET` (2)
 *         the first written value displays on `top + 2`.
 *
 * The difference is NOT a second latency and NOT a rounding: **`j` STARTS AT 1.**
 * The interpreter adds `step` to the accumulator BEFORE it writes, so `start`
 * itself is never emitted and there is no index 0. Substituting j = 1 into the
 * per-index rule gives `top + 1 + 1` = `top + 2`, which is the `top` sentence,
 * and the interlock below asserts exactly that rather than trusting the pair.
 *
 * CONSEQUENCE WORTH KNOWING, and it is the schema's own words: a run of `lines`
 * values occupies screen lines `top + 2 .. top + lines + 1`. With the span
 * interlock at `top + lines <= 223`, a MAXIMAL run puts its last value on line
 * 224 — one past the bottom of a 224-line screen (0..223) — so a 220-line run
 * from `top` 3 renders 219 lines. The old docblock here claimed the opposite
 * ("a lag of 2 would run off the screen", offered as corroboration that the lag
 * was 1); it was reasoning from a first-line offset of 1 and it is now known to
 * have been reasoning from a wrong premise. The bottom edge really is one line
 * over, and that is a fact about the ENGINE, not an error in this derivation.
 *
 * ⚠ CRAM IS A THIRD RULE AND WE CANNOT EXPRESS IT. The contract now also states
 * the CRAM case: a CRAM target's value `j` displays on `top + j` — ONE LINE
 * EARLIER than VSRAM, because the N+1 latency is VSRAM's alone. There is no CRAM
 * constant below ON PURPOSE: `$defs.ramp_target` declares `properties: {vsram}`,
 * `required: [vsram]` and `unevaluatedProperties: false`, so a CRAM ramp CANNOT
 * BE AUTHORED through this contract at all and a CRAM path here would be code
 * with no document that could reach it. `EFFECTS_PRESET_RAMP_TARGET_ARMS` below
 * pins that, so whoever adds the arm is stopped by a failing derivation and
 * finds this paragraph instead of assuming the VSRAM numbers generalise.
 *
 * NEITHER IS APPLIED BY THIS CODEC. A document's `top` is the ENGINE's `top`,
 * written and read verbatim; both numbers are DISPLAY facts, and correcting one
 * in the FILE would change what the engine runs in order to fix what an editor
 * draws. NO STAGE OF THE ENGINE PATH COMPENSATES either — not this codec, not
 * `tools/effects_gen.py`, not the constructor, not the interpreter (measured by
 * the engine lane, 2026-09-03) — so there is no double-application to avoid, and
 * the compensation belongs entirely to whatever draws or describes a ramp in
 * screen lines.
 *
 * ⚠ AND AN OLDER CORRECTION KEPT BECAUSE IT WOULD STILL MISLEAD. This docblock
 * once ended "...where the generator would apply it a second time", i.e. it
 * justified not applying the lag by claiming somebody else already did. THAT
 * CLAUSE WAS FALSE; see the measurement above. A reader who believed it would
 * conclude a consumer adding the offset was a bug.
 */

/**
 * THE PER-INDEX LAG, **1**. Value `j` displays on screen line `top + j + LAG`.
 *
 * Parsed from the `properties.ramp` description's own sentence, "value j (=
 * start + j*step) displays on screen line top + j + 1" — the KEY's paragraph,
 * not `$defs.ramp`'s; see `RAMP_KEY`. Use this ONLY in a statement that
 * quantifies over `j`. It is NOT where the run starts — `j` starts at 1, so the
 * first line is `EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET` below.
 */
export const EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG: number = (() => {
  const lag = schemaNumberFromProse(
    [...RAMP_KEY],
    /value j \(= start \+ j\*step\) displays on screen line top \+ j \+ (\d+)/,
    'the VSRAM per-index display lag',
  );
  if (!Number.isInteger(lag) || lag < 1) {
    throw new Error(
      `the VSRAM per-index display-lag sentence in aurora-effects-preset.schema.json parsed to ` +
      `${lag}, which is not a positive whole number of scanlines. A lag of 0 is indistinguishable ` +
      'from "no lag" in every rendered output, so this refuses rather than shipping it.',
    );
  }
  return lag;
})();

/**
 * THE FIRST-LINE OFFSET, **2**. The run's FIRST written value displays on
 * `top + OFFSET`, and its last on `top + lines - 1 + OFFSET`.
 *
 * Parsed from `$defs.ramp.properties.top`'s own sentence, "the first written
 * value DISPLAYS on top + 2". Use this for a span, a highlight, a hit-test or
 * any other claim about where the run BEGINS on screen. It is NOT a per-index
 * lag — see `EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG` and the block above.
 */
export const EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET: number = (() => {
  const off = schemaNumberFromProse(
    [...RAMP, 'properties', 'top'],
    /DISPLAYS on top \+ (\d+)/,
    'the VSRAM first-line display offset',
  );
  if (!Number.isInteger(off) || off < 1) {
    throw new Error(
      `the VSRAM first-line display-offset sentence in aurora-effects-preset.schema.json parsed ` +
      `to ${off}, which is not a positive whole number of scanlines. An offset of 0 is ` +
      'indistinguishable from "no lag" in every rendered output, so this refuses rather than ' +
      'shipping it.',
    );
  }
  if (off !== EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG + 1) {
    throw new Error(
      `aurora-effects-preset.schema.json's two ramp display sentences no longer agree: the ` +
      `per-index rule gives value j on top + j + ${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG} and, with ` +
      'j starting at 1, that puts the FIRST value on top + ' +
      `${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG + 1}, but the top sentence says top + ${off}. One of ` +
      'the two moved, or j no longer starts at 1. Re-read both sentences and re-derive BOTH ' +
      'constants — do NOT reconcile them by hardcoding either number.',
    );
  }
  return off;
})();

/**
 * The arms `$defs.ramp_target` actually declares — **`['vsram']` today**.
 *
 * This exists to keep the CRAM paragraph above HONEST rather than merely
 * written down. The contract states a CRAM display rule (`top + j`, one line
 * earlier) but declares no CRAM arm, so no document can carry one; if an arm is
 * ever added, the guard below throws at module load and whoever added it reads
 * the block above before assuming VSRAM's two numbers generalise.
 */
export const EFFECTS_PRESET_RAMP_TARGET_ARMS: readonly string[] = (() => {
  const arms = Object.keys(
    schemaNode(['$defs', 'ramp_target']).properties as Record<string, unknown>,
  );
  if (arms.length !== 1 || arms[0] !== 'vsram') {
    throw new Error(
      `$defs.ramp_target in aurora-effects-preset.schema.json now declares [${arms.join(', ')}], ` +
      'not [vsram] alone. Aurora derives its ramp display geometry from the VSRAM sentences only ' +
      '— a CRAM target displays ONE LINE EARLIER (value j on top + j, not top + j + ' +
      `${EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG}) — so a new arm needs its own derived constants and ` +
      'its own readout wording before any span or gloss can be trusted for it.',
    );
  }
  return Object.freeze(arms);
})();

/** `fp16.whole`'s inclusive range — the SIGNED part, -512..511. */
export const EFFECTS_PRESET_FP16_WHOLE_RANGE =
  schemaRange(['$defs', 'fp16', 'properties', 'whole']);

/** `fp16.frac256`'s inclusive range — a MAGNITUDE in 1/256 px, 0..255. */
export const EFFECTS_PRESET_FP16_FRAC_RANGE =
  schemaRange(['$defs', 'fp16', 'properties', 'frac256']);

/** How many `frac256` units make one pixel, read off the field's own maximum. */
const FP16_UNITS_PER_PIXEL = EFFECTS_PRESET_FP16_FRAC_RANGE.max + 1;

/**
 * ═══ THE fp16 SIGN RULE, THE ONE CONVERSION, AND THE TRAP ═══
 *
 * `frac256` is a MAGNITUDE and the sign is `whole`'s alone, applying to the whole
 * value. So the conversion is NOT `whole + frac256 / 256`:
 *
 *     whole >= 0  ->  whole + frac256 / 256
 *     whole <  0  ->  whole - frac256 / 256      <-- the one that surprises
 *
 * `{whole: -1, frac256: 128}` is therefore **-1.5**. The naive form yields -0.5,
 * a whole pixel out, with BOTH NUMBERS STILL IN RANGE — no schema, and no
 * round-trip through this codec, can catch that. It is the same class as the
 * band-seed unit bug: a legal-looking document that puts the effect somewhere
 * else entirely.
 *
 * The engine spells it `(whole * 65536) - (frac256 * 256)` for `whole < 0`
 * (`raster.emp:687`), i.e. it moves AWAY from zero in both directions.
 *
 * `EFFECTS_PRESET_FP16_SIGNED_EXAMPLE` below re-derives the -1.5 row from the
 * schema's own sentence at module load, so this function is checked against the
 * contract rather than against this comment.
 */
export function presetFp16ToNumber(fp: EffectsPresetFp16): number {
  const magnitude = Math.abs(fp.whole) + fp.frac256 / FP16_UNITS_PER_PIXEL;
  return fp.whole < 0 ? -magnitude : magnitude;
}

/**
 * The inverse: a pixel value as the fp16 object the schema declares, or null
 * when it cannot be spelled exactly.
 *
 * NULL RATHER THAN THE NEAREST, on the rule `anchorAmpRungForPeakPx` already
 * sets in this file: a converter that quietly rounded would move an author's
 * value without saying so. Two separate ways a value has no spelling, and both
 * return null:
 *
 *   • it is not a whole number of 1/256 px (`0.3` is not representable);
 *   • it lies in the open interval (-1, 0). The sign is `whole`'s, so a negative
 *     value needs a negative `whole`, and there is none between -1 and 0. -0.5
 *     HAS NO SPELLING in this encoding. That is the encoding's own hole, not a
 *     limitation of this function, and a control must show it rather than snap
 *     across it.
 *
 * Out-of-range values return null too — the authored range is fp16's ensures,
 * and offering an author a value the build refuses is the failure §7.4 names.
 */
export function presetFp16FromNumber(px: number): EffectsPresetFp16 | null {
  if (!Number.isFinite(px)) return null;
  const units = px * FP16_UNITS_PER_PIXEL;
  if (!Number.isInteger(units)) return null;
  const negative = px < 0;
  const magnitude = Math.abs(units);
  const whole = (negative ? -1 : 1) * Math.floor(magnitude / FP16_UNITS_PER_PIXEL);
  const frac256 = magnitude % FP16_UNITS_PER_PIXEL;
  // The (-1, 0) hole: a negative value whose whole part rounds to -0 cannot be
  // spelled, because `{whole: 0, ...}` is POSITIVE.
  if (negative && whole === 0 && frac256 !== 0) return null;
  if (whole < EFFECTS_PRESET_FP16_WHOLE_RANGE.min || whole > EFFECTS_PRESET_FP16_WHOLE_RANGE.max) {
    return null;
  }
  return { whole, frac256 };
}

/**
 * The schema's own worked negative example, `{whole, frac256} -> value`, parsed
 * out of the `$defs.fp16` description.
 *
 * THIS IS THE GATE ON THE SIGN RULE, and it is why the rule above is not merely
 * asserted in a test written from the same prose a human read. The schema states
 * the example precisely because the value semantics "are not the obvious ones";
 * this reads that sentence and `test/formats/effects-preset-ramp.test.ts` asserts
 * `presetFp16ToNumber` reproduces it. If empyrean ever restates the example with
 * different numbers, the row moves with the contract; if it DROPS the sentence,
 * this throws at module load rather than leaving the trap unguarded.
 */
export const EFFECTS_PRESET_FP16_SIGNED_EXAMPLE: Readonly<{
  fp: EffectsPresetFp16;
  value: number;
}> = (() => {
  const description = String(schemaNode(['$defs', 'fp16']).description ?? '');
  const m = /\{whole: (-?\d+), frac256: (\d+)\} is (-?\d+(?:\.\d+)?), not (-?\d+(?:\.\d+)?)/
    .exec(description);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer states the worked NEGATIVE fp16 example ' +
      '("{whole: -1, frac256: 128} is -1.5, not -0.5") that EFFECTS_PRESET_FP16_SIGNED_EXAMPLE is ' +
      'derived from. That sentence is the only contract-side statement of the sign rule, and the ' +
      'naive conversion (whole + frac256/256) is wrong by a whole pixel with both numbers still ' +
      'in range. Re-read the schema and re-derive — do NOT hardcode -1.5.',
    );
  }
  const fp = Object.freeze({ whole: Number(m[1]), frac256: Number(m[2]) });
  const value = Number(m[3]);
  const naive = Number(m[4]);
  if (fp.whole >= 0) {
    throw new Error(
      'the worked fp16 example in aurora-effects-preset.schema.json is no longer NEGATIVE, so it ' +
      'no longer exercises the sign rule it exists to state. Re-read the schema.',
    );
  }
  if (value === naive) {
    throw new Error(
      'the worked fp16 example in aurora-effects-preset.schema.json no longer distinguishes the ' +
      'correct value from the naive one, so it can no longer catch the sign trap. Re-read the schema.',
    );
  }
  return Object.freeze({ fp, value });
})();

/**
 * The rung with EXACTLY this peak, or null.
 *
 * NULL RATHER THAN THE NEAREST RUNG, deliberately. `amp_shift = log2(256 /
 * peak_px)` is only defined on the ladder, and a converter that quietly rounded
 * would be the doubling/halving §7.3 names — a caller that means to snap must
 * say so by calling `anchorSnapPeakPx`, and then it has the snapped rung in hand
 * to show the author what the value actually became.
 */
export function anchorAmpRungForPeakPx(peakPx: number): AnchorAmpRung | null {
  return ANCHOR_AMP_RUNGS.find((r) => r.peak_px === peakPx) ?? null;
}

/** The rung with EXACTLY this cycle length in ticks, or null. Same rule. */
export function anchorPeriodRungForTicks(ticks: number): AnchorPeriodRung | null {
  return ANCHOR_PERIOD_RUNGS.find((r) => r.ticks === ticks) ?? null;
}

/**
 * The nearest amplitude rung to a requested peak — SNAP, not round.
 *
 * Nearest in the LOG domain, which is where the ladder is uniform: in pixels the
 * gap from 32 to 64 is 32 and the gap from 1 to 2 is 1, so a linear nearest
 * would bias every request toward the small end. A request outside the ladder
 * clamps to its nearest END rung, which is a real rung and therefore a value the
 * author can see and correct.
 */
export function anchorSnapPeakPx(peakPx: number): AnchorAmpRung {
  const target = Math.log2(Math.max(peakPx, Number.MIN_VALUE));
  return ANCHOR_AMP_RUNGS.reduce((best, r) =>
    Math.abs(Math.log2(r.peak_px) - target) < Math.abs(Math.log2(best.peak_px) - target) ? r : best);
}

/** The nearest period rung to a requested cycle in SECONDS. Same rule. */
export function anchorSnapCycleSeconds(seconds: number): AnchorPeriodRung {
  const target = Math.log2(Math.max(seconds, Number.MIN_VALUE));
  return ANCHOR_PERIOD_RUNGS.reduce((best, r) =>
    Math.abs(Math.log2(r.seconds) - target) < Math.abs(Math.log2(best.seconds) - target) ? r : best);
}

// ---------------------------------------------------------------------------
// The base_swap key (empyrean 5bd76ba, §7.5) — the line range, the address
// range, and the $2000 GRANULE. Every number below is READ OUT of the vendored
// schema; none is typed beside it, and each read throws at module load when the
// schema's wording moves rather than yielding a plausible-looking wrong value.
//
// ⚠ THE TWO ASYMMETRIES WITH `ramp`, restated here where a constants reader will
// see them: base_swap has NO capability gate (no CAP_DENSE_TIER analogue —
// OP_SET_REG dispatches unconditionally) and its generated emission is NOT
// DEBUG-gated (it is unconditional pub data in the release ROM). Do not carry
// ramp's gating across by analogy; see `EffectsPresetBaseSwap`.
// ---------------------------------------------------------------------------

const BASE_SWAP = ['$defs', 'base_swap'] as const;

/** `base_swap`'s required member names, in the schema's own `required` order. */
export const EFFECTS_PRESET_BASE_SWAP_KEYS: readonly string[] =
  Object.freeze([...(schemaNode([...BASE_SWAP]).required as string[])]);

/**
 * `line`'s inclusive range, 3..223 in the vendored schema — `fire()`'s ensure.
 *
 * ⚠ NOT the same as the ramp's `top` range even though both are screen lines:
 * `top` maxes at 222 because a run occupies at least one line after its start,
 * and a swap is one fire that reaches the last line before the rewind interlock.
 */
export const EFFECTS_PRESET_BASE_SWAP_LINE_RANGE =
  schemaRange([...BASE_SWAP, 'properties', 'line']);

/**
 * `target`'s inclusive range, 0..65535 — `vdp_base_reg`'s parameter range. A
 * raw VRAM BYTE ADDRESS; see `EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE` for why
 * the range alone is not the contract.
 */
export const EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE =
  schemaRange([...BASE_SWAP, 'properties', 'target']);

/**
 * THE $2000 GRANULE — `multipleOf`, read off the schema keyword itself.
 *
 * Plane A's nametable base register (VDP reg $02) encodes only the address bits
 * ABOVE this granule and DROPS the rest SILENTLY. So an unaligned `target` is
 * NOT a range error and does not fail loudly anywhere downstream: the VDP simply
 * fetches from a different address than every `VRAM_*` consumer reads and writes,
 * and nothing else looks wrong. That is why the granule is a first-class constant
 * and not an implementation detail of a rounding helper — a control that snaps
 * silently would hide exactly the misalignment this refuses.
 *
 * WORKED VALUE, because the key is meaningless without one: the shipped
 * section-6 document targets **57344 = $E000 = VRAM_PLANE_B** — 7 granules up —
 * so Plane A draws Plane B's picture from line 160 down.
 *
 * Derived LOUDLY: a granule of 0 or 1, or a non-integer, would make every target
 * "aligned" and the constraint indistinguishable from absent, so this throws at
 * module load rather than shipping a vacuous granule.
 */
export const EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE: number = (() => {
  const node = schemaNode([...BASE_SWAP, 'properties', 'target']);
  const granule = node.multipleOf;
  if (typeof granule !== 'number' || !Number.isInteger(granule) || granule < 2) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer bounds $defs.base_swap.properties.target with ' +
      `an integer multipleOf >= 2 (read: ${JSON.stringify(granule)}), which is where the Plane A ` +
      'base-register granule is read from. A granule of 0 or 1 would make every address "aligned" ' +
      'and is indistinguishable from no constraint at all, so this refuses rather than shipping ' +
      'it. Re-read the schema — do NOT hardcode $2000.',
    );
  }
  // The range and the granule are two schema facts that must agree: the address
  // space has to be a whole number of granules, or the top granule is a partial
  // one and the last legal base address is not what either number says.
  const span = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max
    - EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min + 1;
  if (span % granule !== 0) {
    throw new Error(
      `the base_swap target range ${EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min}..` +
      `${EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max} is not a whole number of ${granule}-byte ` +
      'granules. One of those two schema facts has moved; re-read both.',
    );
  }
  return granule;
})();

/**
 * Is `target` a legal Plane A base address — in range AND on the granule?
 *
 * The predicate exists so no caller re-spells `% 8192`. It reports; it does not
 * snap. There is deliberately no `snapBaseSwapTarget` here: rounding an author's
 * address to the nearest granule produces a DIFFERENT plane's picture without
 * saying so, which is the failure the granule exists to make visible.
 */
export function isBaseSwapTargetAligned(target: number): boolean {
  return Number.isInteger(target)
    && target >= EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.min
    && target <= EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max
    && target % EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE === 0;
}

/**
 * The wave-2 vocabulary the contract has AGREED and this generator has NOT
 * BUILT. At 6664b61 that was `fires`, `variants`, `cycles`; at 12aecd5 the
 * schema DECLARES `cycles` and `variants` (§7.2) and only `fires` stays
 * reserved — which this derivation reads, and does not restate. THE d36d704
 * AMENDMENT DID NOT MOVE THIS SENTENCE: `patch_world_ys` and `patch_motion`
 * arrived DECLARED, not reserved, so the list is still `fires` alone. That is a
 * measured reading of the new bytes, not an assumption — the derivation below
 * would have thrown at module load if the sentence had moved, and the drift
 * gate asserts what it yields.
 *
 * WHY THEY ARE WORTH SEPARATING from a plain unknown key. They are not typos —
 * they are empyrean `docs/AURORA_EFFECTS_SCHEMA.md` §7's reserved names, so an
 * author (or an agent) who read that document and wrote one of them deserves
 * "reserved, not built yet" rather than "unknown property". The schema refuses
 * them either way, because it is closed; this only improves the sentence.
 *
 * DERIVED FROM THE SCHEMA'S OWN `description`, NOT TYPED BESIDE IT, and derived
 * LOUDLY: if the sentence ever stops matching, this throws at module load rather
 * than silently returning an empty list and degrading every reserved-key refusal
 * back to "unknown property" with nothing going red. That is the whole design —
 * the failure state and the success state must not emit the same artifact.
 */
export const EFFECTS_PRESET_RESERVED_KEYS: readonly string[] = (() => {
  const description = String(EFFECTS_PRESET_SCHEMA.description ?? '');
  const m = /Reserved and refused by name \(still wave-2 open\): ([a-z, ]+?)\./.exec(description);
  if (!m) {
    throw new Error(
      'aurora-effects-preset.schema.json no longer carries the "Reserved and refused by name" ' +
      'sentence its reserved-key list is derived from. Re-read the schema and update ' +
      'EFFECTS_PRESET_RESERVED_KEYS\'s derivation — do NOT hardcode the names.',
    );
  }
  const names = m[1].split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (names.length === 0) throw new Error('the reserved-key sentence parsed to an empty list');
  return Object.freeze(names.slice().sort());
})();

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * `{dataRoot}editor/effects/presets/` — the whole preset library.
 *
 * A SUBDIRECTORY of the scene library's directory, which is safe in both
 * directions: `loadEffectsSceneLibrary` skips any entry that does not end in
 * `.json`, so the `presets` directory entry is not mistaken for a scene, and
 * this loader never looks up a level.
 */
export function effectsPresetDir(dataRoot: string): string {
  return `${dataRoot}editor/effects/presets/`;
}

/** `{dataRoot}editor/effects/presets/<preset_id>.json`. */
export function effectsPresetPath(dataRoot: string, id: string): string {
  return `${effectsPresetDir(dataRoot)}${id}.json`;
}

/** The preset id a library filename claims, or null when it is not a preset file. */
export function presetIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith('.json')) return null;
  return fileName.slice(0, -'.json'.length);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EffectsPresetError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'EffectsPresetError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// The arm rule, spelled ONCE
// ---------------------------------------------------------------------------

/**
 * Which arms a band's `on` object declares — the single derivation both the
 * codec's refusal and the panel's advisory read.
 *
 * Spelled once on purpose: the brief's rule is that a predicate and its sentence
 * come from one source both the control and the advisory read, never a
 * comparison duplicated into a component. `armIssue` below is that sentence.
 */
export function presetOnArms(on: unknown): string[] {
  if (typeof on !== 'object' || on === null || Array.isArray(on)) return [];
  return Object.keys(on as Record<string, unknown>);
}

/**
 * The exactly-one-arm rule as a sentence, or null when the band satisfies it.
 *
 * The schema's `oneOf` refuses all three of these already; this exists because
 * "matches 0 of the 2 allowed forms" does not tell an author WHY two writes
 * cannot share a band, and that reason is the whole design.
 */
export function presetArmIssue(on: unknown): string | null {
  const known = EFFECTS_PRESET_ON_ARMS;
  const arms = presetOnArms(on);
  const recognised = arms.filter(a => known.includes(a));
  const unknown = arms.filter(a => !known.includes(a));
  if (unknown.length > 0) {
    return `on carries ${unknown.map(a => `"${a}"`).join(' and ')}, which is not an ON arm. ` +
      `The arms are ${known.join(' and ')}. (vsram is deliberately not one: a band's restore ` +
      "is derived from the ON op's CRAM span, and a VSRAM op has none.)";
  }
  if (recognised.length === 0) {
    return `on declares no arm; exactly one of ${known.join(' / ')} is required. ` +
      'A band with no ON op is a band that turns nothing on.';
  }
  if (recognised.length > 1) {
    return `on declares ${recognised.length} arms (${recognised.join(' and ')}); exactly one is ` +
      'allowed. Two arms would be two writes and therefore two restores, which is two bands — ' +
      'author the second one as a second band.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Every object key appearing anywhere in a parsed document. */
function everyKey(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) { value.forEach(v => everyKey(v, out)); return out; }
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.add(k);
    everyKey(v, out);
  }
  return out;
}

/**
 * Parse and validate one preset document.
 *
 * `filenameStem` is the `<preset_id>` part of the path the text came from. The
 * identity check is required rather than optional because the id becomes a
 * symbol and the filename is how a human finds the file; aeon's loader refuses a
 * mismatch and so does this.
 *
 * Throws `EffectsPresetError` on anything wrong. Loud, never lenient — a
 * document the reader "fixed up" would be written back in the fixed shape over
 * the author's file.
 */
export function parseEffectsPreset(text: string, filenameStem: string): EffectsPreset {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new EffectsPresetError(
      `${filenameStem}.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new EffectsPresetError(`${filenameStem}.json must contain a JSON object`);
  }
  const obj = doc as Record<string, unknown>;

  // Version first, with its own words, for the reason scene.ts gives: the
  // schema's `const` would refuse it anyway, but "expected the constant 1" does
  // not tell an author there is deliberately no migration machinery to ask for.
  if (obj.schema !== 1) {
    throw new EffectsPresetError(
      `${filenameStem}.json declares "schema": ${JSON.stringify(obj.schema)}; wave 2 refuses ` +
      'anything but 1. A new schema version is a contract change to both halves, not a file ' +
      'the reader upgrades.',
    );
  }

  const issues = validateAgainstSchema(obj, EFFECTS_PRESET_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);

  // The reserved wave-2 names get their reason, not just "unknown property".
  const present = everyKey(obj);
  const reservedHits = EFFECTS_PRESET_RESERVED_KEYS.filter(k => present.has(k));
  if (reservedHits.length > 0) {
    issues.push(
      `${reservedHits.join(' and ')} ${reservedHits.length > 1 ? 'are' : 'is'} RESERVED wave-2 ` +
      'vocabulary (empyrean AURORA_EFFECTS_SCHEMA.md §7): the suite has agreed the name and ' +
      "aeon's generator has not built it. It is refused by name rather than as a typo. Adding " +
      'it is a contract change to both halves.',
    );
  }

  // The arm rule in its own words, ahead of the schema's "matches 0 of 2 forms".
  if (Array.isArray(obj.bands)) {
    obj.bands.forEach((band, i) => {
      if (typeof band !== 'object' || band === null || Array.isArray(band)) return;
      if (!('on' in (band as Record<string, unknown>))) return;
      const sentence = presetArmIssue((band as Record<string, unknown>).on);
      if (sentence) issues.push(`/bands/${i}/on: ${sentence}`);
    });
  }

  if (issues.length > 0) {
    throw new EffectsPresetError(
      `${filenameStem}.json does not match the raster preset schema`,
      // The arm sentence and the schema's oneOf message describe the same
      // defect; de-duplicate so an author is not told twice in two vocabularies.
      dedupe(issues),
    );
  }

  const preset = obj as unknown as EffectsPreset;

  if (preset.id !== filenameStem) {
    throw new EffectsPresetError(
      `${filenameStem}.json declares "id": ${JSON.stringify(preset.id)}; the filename stem and ` +
      'the id must match. The id becomes an .emp label component and the filename is how a human ' +
      "finds the file, so aeon's loader refuses a mismatch.",
    );
  }

  return preset;
}

/**
 * Drop the schema's generic `oneOf` complaint where a band already has ours.
 *
 * BOTH SPELLINGS, and the second one is easy to miss: the evaluator says
 * "matches NONE of the 2 allowed forms" for zero matches and "matches 2 of the
 * 2 allowed forms" for too many. A `\d+` alone silently covers only the
 * two-arm case, leaving a zero-arm band told off twice — which is the exact
 * shape of defect this function exists to prevent.
 */
function dedupe(issues: string[]): string[] {
  const armPaths = new Set(
    issues
      .filter(i => / on declares | which is not an ON arm/.test(i))
      .map(i => i.slice(0, i.indexOf(':'))),
  );
  return issues.filter(i => {
    const path = i.slice(0, i.indexOf(':'));
    if (!armPaths.has(path)) return true;
    return !/matches (?:none|\d+) of the \d+ allowed forms/.test(i);
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Serialize a preset. Validates on the way out — the writer path is the one this
 * schema is closed for, so an invalid document must never reach disk.
 *
 * KEY ORDER is aeon's §5 canonical order — alphabetical, RECURSIVELY, so the
 * band objects and the arm bodies sort too. That is why a serialized band reads
 * `bot, on, sh, top` rather than in the order a human would type them, and it
 * matches `json.dumps(obj, sort_keys=True, indent=2)` exactly, which is what
 * aeon's page calls normative.
 *
 * `canonicalizeBySchema` still runs for the OTHER thing it does: it throws on
 * any key the schema does not declare, so serializing can never silently erase a
 * field.
 */
export function serializeEffectsPreset(preset: EffectsPreset): string {
  const issues = validateAgainstSchema(preset, EFFECTS_PRESET_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);
  if (issues.length > 0) {
    throw new EffectsPresetError(
      `refusing to write preset ${JSON.stringify(preset?.id)}: it does not match the raster ` +
      'preset schema',
      issues,
    );
  }
  return canonicalJsonPretty(canonicalizeBySchema(preset, EFFECTS_PRESET_SCHEMA));
}

// ---------------------------------------------------------------------------
// Library load
// ---------------------------------------------------------------------------

export interface UnreadablePreset {
  /** Project-relative path of the file that could not be read. */
  path: string;
  reason: string;
}

export interface EffectsPresetLibrary {
  presets: EffectsPreset[];
  /**
   * Files that exist but will not parse. NOT presets and NOT silently dropped —
   * a caller that later writes the library must skip these paths.
   */
  unreadable: UnreadablePreset[];
  notices: Notice[];
}

/**
 * Load every preset in `{dataRoot}editor/effects/presets/`.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME FACT. An absent directory is the
 * ordinary "this project has no authored presets yet" and is silent. A file that
 * exists and will not parse is loud: it lands in `unreadable` with a notice, and
 * its id is NOT returned, so nothing can round-trip a repaired-looking empty
 * document over the author's broken one.
 */
export async function loadEffectsPresetLibrary(
  fa: FileAccess,
  dataRoot: string,
): Promise<EffectsPresetLibrary> {
  const dir = effectsPresetDir(dataRoot);
  const presets: EffectsPreset[] = [];
  const unreadable: UnreadablePreset[] = [];
  const notices: Notice[] = [];

  let present = false;
  try { present = await fa.exists(dir); } catch { present = false; }
  if (!present) return { presets, unreadable, notices };

  const entries = (await fa.list(dir)).slice().sort();
  for (const entry of entries) {
    const stem = presetIdFromFileName(entry);
    if (stem === null) continue;
    const path = `${dir}${entry}`;
    try {
      presets.push(parseEffectsPreset(new TextDecoder().decode(await fa.read(path)), stem));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      unreadable.push({ path, reason });
      // The per-file reason, unabridged — see the scene loader one file over.
      console.warn(`[effects] ${path} could not be read as a raster preset: ${reason}`);
    }
  }

  // ONE notice for the whole directory, coalesced on exactly the same terms as
  // the scene loader: 'error' either way, and a single failure keeps the message
  // it always had.
  if (unreadable.length === 1) {
    const only = unreadable[0];
    notices.push({
      severity: 'error',
      message:
        `${only.path} exists but could not be read as a raster preset (${only.reason}). ` +
        'Aurora is ignoring it and will NOT overwrite the file — fix it by hand and reopen.',
    });
  } else if (unreadable.length > 1) {
    notices.push({
      severity: 'error',
      message:
        `${unreadable.length} files in ${dir} exist but could not be read as raster presets — ` +
        `${nameSome(unreadable.map((u) => u.path))}. ` +
        'Aurora is ignoring them and will NOT overwrite them — fix them by hand and reopen. ' +
        'Each file and its own reason is in the developer console.',
    });
  }

  return { presets, unreadable, notices };
}
