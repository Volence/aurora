// Effects scene definition files — `{dataRoot}editor/effects/<scene_id>.json`.
//
// Wave-1 surface 1 of the parallax/raster effects arc. One scene per file; the
// per-section pointer at it is `sceneRef` in the meta sidecar (surface 2,
// src/core/formats/section-meta.ts, already landed).
//
// CONTRACT, both halves, pinned:
//   • empyrean docs/AURORA_EFFECTS_SCHEMA.md §2 (shape), §6 (hazards), §8
//     (golden protocol) — read at empyrean 069cf59, an ancestor of c2c81e2.
//   • empyrean contract/schema/aurora-effects-scene.schema.json — the
//     machine-readable half, vendored beside this file. Its git blob hash is
//     05f58fb9a68d03ea79e672e41d9daec1517b3b87 and the vendored copy is pinned
//     against that hash by test/formats/effects-schema-drift.test.ts, which
//     reads it from aurora-effects-scene.schema.provenance.json — THE SIDECAR IS
//     THE ONE MACHINE-READABLE COPY and this line is prose beside it. The BLOB
//     hash, not a commit citation, is the load-bearing invariant: the schema
//     doc has moved twice (2f3b6fd, 069cf59) with the schema JSON byte-identical
//     underneath, so a commit pin would read as drift that is not there.
//     THAT TEST IS THE PIN OF RECORD — it is the only citation a change can go red on,
//     and this comment is prose beside it. (Said because this line CARRIED A
//     STALE HASH for two whole re-pins: it still read cab3ca58 — item 35's
//     value — after item 37 moved the blob to d4345af5 and row 56 moved it to
//     0f661b70, and nothing went red, because nothing hashes a comment. Row 59
//     corrected it to the current value rather than adding a fifth entry to a
//     history that was already wrong.)
//     PIN HISTORY, current last: 2d7a9fee (landing) → cab3ca58 (a32bcb03, CR-1:
//     `v_factor`/`v_factor_fg` lost their `$ref` to `$defs/factor` and became
//     plain integers 0..15 — see the v_factor field comment below for why that
//     was a defect and not a preference) → d4345af5 (5c930d6, `v_center` and
//     `v_offset` bounded) → 0f661b70 (277bc15, `layers` maxItems 8 → 16) →
//     dd972cf0 (0bd4753, `precision` RETIRED — the engine deleted the storage,
//     so this is a delete and not a reservation; ROADMAP row 59) →
//     4adfbb40 (988638f, `$defs.layer.properties.drift` ADDED — see EffectsDrift
//     below, and note that this re-pin's byte diff is enormous and almost
//     entirely cosmetic: the same commit reflowed the whole file one key per
//     line. Structural equality was CHECKED, not assumed — a recursive diff of
//     the two parsed documents reports exactly one difference, the added
//     `drift` node. docs/reviews/2026-08-29-drift-codec.md) →
//     c73d5b42 (bc639a10, `bob_shift` / `bob_period` ADDED at the ROOT — the
//     scene-level vertical bob, aeon's DoD item 7 at `8c75722b`. Purely
//     additive: 16 inserted lines, 0 deleted, and a recursive diff of the two
//     parsed documents reports exactly two differences, the two added nodes.
//     `bob_shift`'s `anyOf` is the first in either committed schema and forced
//     json-schema-subset.ts to implement the keyword — the coverage gate named
//     it. See the `bob_shift` field note below for the three traps) →
//     b3e0ab31 (3992d16, `$defs.layer.properties.rowRemap` ADDED — item 9's row
//     remap; see EffectsRowRemap below) →
//     05f58fb9 (ff3f43f, `properties.reels` ADDED at the ROOT between `v_deform`
//     and `anchor` — item 10's authoring half, aeon's OJZ_Reels_Fill at
//     `660aabc0`. 12 leaf additions, 0 removals, 0 changes; the root object
//     stays closed at eighteen properties. Its `uniqueItems` is the first in
//     either committed schema and forced json-schema-subset.ts to implement the
//     keyword — the coverage gate named it, again. See the `EffectsReels` note
//     below for the four traps, the loudest being that the unit is WHOLE PIXELS
//     while its neighbour `drift.rate` is 1/256 px).
//   • aeon tools/EFFECTS_CONSUMER_CONTRACT.md §2.1/§2.3 at aeon 00607dd5 — the
//     consumer's read set, and the drift rule that governs both directions.
//
// THE ONE STRUCTURAL IDEA HERE. This codec does not enumerate fields. Parse
// hands back the object JSON.parse produced, untouched; serialize reorders keys
// using the SCHEMA's own declaration order and refuses to drop anything. That is
// the direct answer to §6 hazard 1 ("round-trip what you do not understand, or
// refuse the file") and to the failure mode the sidecar codec has to fight with
// a hostile comment at four hardcoded sites: a field the wave-1 UI does not
// edit cannot be lost here, because there is no list for it to be missing from.
//
// VALIDATION SPLIT, restated because it is easy to over-build: this module
// validates SHAPE against the committed schema and IDENTITY (stem == id,
// schema == 1). Authored VALUES are sigil's — `tools/effects_gen.py` emits .emp
// calling the same constructors the hand path uses, so every `ensure` and
// `scene_budget_enforce` fires at build time (schema doc §2 preamble, scanline
// design §7). Aurora may pre-check as ADVISORY UX; see
// advisoryLayerDeformConflicts below, which is advisory in the literal sense —
// nothing in the read or write path calls it.

import type { FileAccess } from '../../project/adapter';
import { nameSome, type Notice } from '../../project/notice';
import type { JsonSchema } from './json-schema-subset';
import {
  validateAgainstSchema,
  canonicalizeBySchema,
} from './json-schema-subset';
import schemaJson from './aurora-effects-scene.schema.json';
import { canonicalJsonPretty } from '../canonical-json';

/** The committed contract schema, vendored byte-identical. */
export const EFFECTS_SCENE_SCHEMA = schemaJson as unknown as JsonSchema;

// ---------------------------------------------------------------------------
// Model (§2.1 top level, §2.2 layer, §2.3 factor, §2.4 tableRef)
//
// Optional fields are optional in the TYPE too, and absent means "the schema's
// default applies". Parse never fills a default in and serialize never writes
// one out that was not on disk: injecting defaults would turn every load/save
// of an untouched file into a diff, and would silently freeze today's default
// into files that should track the contract's.
// ---------------------------------------------------------------------------

export type EffectsFactorName =
  | 'FACTOR_LOCKED' | 'FACTOR_0' | 'FACTOR_1' | 'FACTOR_1_2' | 'FACTOR_1_4'
  | 'FACTOR_1_8' | 'FACTOR_1_16' | 'FACTOR_1_32' | 'FACTOR_3_4' | 'FACTOR_3_8'
  | 'FACTOR_3_16' | 'FACTOR_5_8' | 'FACTOR_5_16' | 'FACTOR_7_8' | 'FACTOR_7_16'
  | 'FACTOR_15_16';

/** `packed(s1:, s2:, op:)` — s1=15 term zero/locked, s2=15 single-term, op 0 add / 1 sub. */
export interface EffectsPackedFactor { s1: number; s2: number; op: 0 | 1 }

export type EffectsFactor = EffectsFactorName | EffectsPackedFactor;

/** A 256-byte signed deform/column table: a generator call, or a raw .bin. */
export type EffectsTableRef =
  | { generator: 'sine'; amplitude: number; period: number }
  | { generator: 'triangle'; amplitude: number; period: number }
  | { generator: 'zero' }
  | { generator: 'v_column_perspective'; focal: number; max_offset: number }
  | { generator: 'v_column_floor'; center: number; max_offset: number }
  | { bin: string };

export type EffectsLayerDeform =
  | 'none'
  | { own: { table: EffectsTableRef; shift_a: number; shift_b: number; phase: number; speed: number } };

export type EffectsSceneDeform =
  | 'none'
  | { shared: { table: EffectsTableRef; speed: number } };

export type EffectsCurve = 'none' | { to: EffectsFactor };
export type EffectsVSplit = 'none' | { at: number };
export type EffectsVDeform =
  | 'none'
  | { columns: { table: EffectsTableRef; speed: number; amp_shift: number } };
export type EffectsAnchor = 'none' | { at: { channel: number; dsa: number; dsb: number } };

/**
 * Time-driven drift: a constant horizontal rate added to a band's scroll every
 * frame, independent of the camera (S1 GHZ clouds, S2 WFZ/HTZ, S3K AIZ1).
 *
 * `rate` IS NOT PIXELS PER FRAME. It is 1/256 px per frame — the schema's own
 * description names the hazard ("an author writing 1 meaning 1 px/frame gets
 * 1/256 px/frame") and asks the editor to present px/frame and multiply on
 * export. Aurora takes that SHOULD: see `driftPxPerFrameToRate` /
 * `driftRateToPxPerFrame` in scene-ui.ts, which are the ONLY two places the
 * factor is applied, and `EFFECTS_DRIFT_UNITS_PER_PIXEL`, which is the only
 * place it is spelled — derived out of this schema's description, not typed.
 *
 * `0` IS NOT A VALUE. It is refused by the schema (`"not": {"const": 0}`)
 * because `Rate(0)` and `None` are indistinguishable in ROM; aeon refuses it at
 * build time too (`scene_dsl.emp` `layer()` ensure). A layer that should not
 * drift spells `"none"` or omits the key.
 *
 * NOT AUTHORABLE FROM AURORA, DELIBERATELY, and this is the whole reason there
 * is a type here and no control anywhere. aeon's `tools/effects_gen.py` REFUSES
 * the key until their `CAP_BAND_DRIFT` emission parcel lands, so a scene
 * carrying `drift` does not build today. Shipping a spinner for it would
 * originate a value the build rejects for EVERY input — the open defect ROADMAP
 * row O13 already tracks for the curve dropdown, in a worse form. What Aurora
 * owes the field now is the other thing: reading it, round-tripping it, and not
 * destroying it. See docs/reviews/2026-08-29-drift-codec.md.
 */
export type EffectsDrift = 'none' | { rate: number };

/**
 * EFFECTS-W1 item 9's ROW REMAP — this layer's Plane-B scroll words re-fetched
 * through a perspective index ladder, so screen line `i` of the band takes the
 * value that belonged to line `ladder[i]` (empyrean `3992d16`,
 * AURORA_EFFECTS_SCHEMA.md §2.6; aeon key-shape artifact `3d917657` against the
 * landed constructor `SceneRemap.Ladder(t, y, h)`).
 *
 * TWO NUMBERS, BOTH FORWARDED VERBATIM, AND BOTH EASY TO GET WRONG IN A WAY NO
 * BUILD CAN SEE.
 *
 * `height_shift` IS A SHIFT, NOT A LINE COUNT — `H = 1 << height_shift`. The
 * contract's own words: "an editor may DISPLAY `1 << height_shift` beside the
 * control and MUST EXPORT the shift", because every value 3..7 is legal, so a
 * conversion bug lands as a band four times too tall rather than as a refusal.
 * Aurora's control shows the line count and writes the shift; the conversion
 * lives once, in `rowRemapHeightLines` (scene-ui.ts), and nothing else in this
 * repo computes it.
 *
 * `plane_y` IS A PLANE-B LINE, 0..511 — the `vsplit.at` coordinate space. NOT a
 * world Y and NOT a screen line: the runtime's only use of it is
 * `plane_y - Vscroll_BG`, whose second term is a per-frame runtime quantity, so
 * there is no editor arithmetic that could improve it. ⚠ THIS SCHEMA IS THE
 * ONLY ENFORCEMENT OF THE 511 CEILING anywhere in the pipeline: aeon's ensure
 * (`scene_dsl.emp:1008`) tests `>= 0` only and `brm_plane_y` is `u16`, so
 * 512..65535 would emit a silently-wrong window (aeon's own booked row
 * `ROWREMAP-PLANEY-CEILING`). The usual "the engine already refuses it"
 * argument is inverted for this field.
 *
 * `ladder` and `table` are RESERVED and REFUSED BY NAME by the schema (the
 * `"not": {}` idiom) — the ladder is derived from `height_shift`, one number
 * with one source. Aurora offers neither and writes neither; the names are read
 * back out of the schema by `EFFECTS_ROW_REMAP_REFUSED_KEYS` rather than listed.
 *
 * ABSENT vs `"none"`: both lower to the same NULL ladder, so the distinction is
 * authorial — `"none"` says the author chose no remap. `setLayerFieldCommand`'s
 * existing rule already spells that (clearing DELETES a key that is not
 * explicitly `"none"` on disk).
 */
export type EffectsRowRemap = 'none' | { plane_y: number; height_shift: number };

/**
 * EFFECTS-W1 item 10's REELS — up to five independently scrolling 64-px-wide
 * vertical strips of the BACKGROUND, the slot-machine-reel demo (empyrean
 * `ff3f43f`, AURORA_EFFECTS_SCHEMA.md §2.7; aeon `OJZ_Reels_Fill`,
 * games/sonic4/data/effects/ojz_effects.emp at `660aabc0`).
 *
 * ⚠⚠ THIS EFFECT SHOWS IN NO RELEASE BUILD, AND NO JSON KEYWORD CAN SAY SO.
 * The mechanism's table, its proc and its on-switch all sit inside
 * `if DEBUG == 1` — `OJZ_Reel_Speed`'s EMITTED LENGTH IS 0 in release
 * (ojz_effects.emp:1766-1767) and the only writer of `OJZ_Reel_Active` is
 * aeon's `tools/reels_witness.py`. So a scene saved with `reels` validates,
 * builds, ships, and renders NOTHING. A panel for this key MUST SAY THAT ON
 * SCREEN; it is the one fact about the field a document cannot carry.
 *
 * AND IT IS NOT CAPABILITY-GATED. There is NO `CAP_` bit for reels — the
 * contract says so in as many words, and adds that "a generator arm must not
 * emit a check that does not exist". Aurora therefore adds no capability check
 * of any kind here. Do not pattern-match this onto `CAP_BAND_DRIFT`.
 *
 * ⚠ THE UNIT IS SIGNED WHOLE PIXELS PER FRAME. THERE IS NO FIXED POINT
 * ANYWHERE ON THIS PATH — the engine does `add.b (a2)+, d0` into a byte phase
 * that wraps mod 256. `drift.rate`'s ×256 export conversion MUST NOT be applied
 * here. A panel or converter copied from the drift path emits **768 for an
 * intended 3**, and the `-128..127` bound is the ONLY place that mistake is
 * caught today (aeon has no magnitude ensure yet). Nothing in the reels path
 * calls `driftPxPerFrameToRate` / `driftRateToPxPerFrame`, the only two places
 * in this repo the ×256 lives, and both are named for drift; a future panel
 * must keep it that way. `EFFECTS_REEL_RATE_BOUNDS` below is read out of the
 * schema so the bound cannot drift from the contract that enforces it.
 *
 * ⚠ SCREEN ORDER IS ARRAY ORDER. Index `i` owns screen X `64i .. 64i+63`
 * (column-pairs `4i..4i+3`; the column→band map is a hardcoded `lsr.b #2`). The
 * contract's own words: an editor that sorts `rates` or round-trips them
 * through a dict keyed by band name "silently relocates every strip". This
 * codec never does — parse hands back what `JSON.parse` produced,
 * `canonicalizeBySchema` maps arrays POSITIONALLY, and `canonicalJsonPretty`
 * sorts OBJECT keys only — and a permutation round-trip is asserted rather than
 * argued, in test/formats/effects-reels.test.ts.
 *
 * ZERO IS A VALUE HERE, deliberately unlike `drift.rate` (whose schema spells
 * `"not": {"const": 0}` because `Rate(0)` and `None` are indistinguishable in
 * ROM). A stationary strip among moving ones is a real authored choice;
 * `uniqueItems` caps it at one occurrence. Two neighbouring keys, opposite
 * rulings on the same literal.
 *
 * ABSENT = NO REELS. There is no `"none"` spelling — the binding table is
 * generated whole, so "keep" and "off" are the same state for it. That is
 * `v_deform`'s absent-key precedent and NOT `drift`/`curve`/`vsplit`/`rowRemap`'s
 * `oneOf` with a `"none"` arm; do not add a null arm for consistency.
 *
 * THE GEOMETRY IS FIXED AT FIVE STRIPS OF FOUR COLUMN-PAIRS. `REEL_BAND_COUNT`
 * and `REEL_COLS_PER_BAND` (aeon games/sonic4/config/constants.emp) size a RAM
 * array and are COMPILED INTO A SHIFT, so a band count is a code shape and not
 * a field. `minItems`/`maxItems` 5 is a COPY of that constant; a
 * `cols_per_band` key is refused by the node's closure. Do not invent one.
 *
 * NOT AUTHORABLE FROM AURORA YET, deliberately: this parcel is the codec half.
 * What Aurora owes the field now is reading it, round-tripping it verbatim, and
 * not destroying it.
 */
export interface EffectsReels {
  /** Exactly five signed whole px/frame rates, pairwise distinct, in SCREEN ORDER. */
  rates: number[];
}

export interface EffectsLayer {
  world_y: number;
  fa: EffectsFactor;
  fb: EffectsFactor;
  dsa?: number;
  dsb?: number;
  phase?: number;
  enabled?: boolean;
  deform?: EffectsLayerDeform;
  curve?: EffectsCurve;
  vsplit?: EffectsVSplit;
  drift?: EffectsDrift;
  rowRemap?: EffectsRowRemap;
}

export interface EffectsScene {
  schema: 1;
  id: string;
  /** Display label. Writer-owned: the generator ignores it and must keep ignoring it. */
  name?: string;
  layers: EffectsLayer[];
  /**
   * Whole-plane Plane-B vertical scroll, as a RIGHT-SHIFT AMOUNT 0..15 — a plain
   * integer, NOT a packed `EffectsFactor`.
   *
   * TWO DIFFERENT SPACES THAT LOOKED LIKE ONE TYPE. A layer's `fa`/`fb` are
   * packed factors where locked is the byte `$0FF`; this field is a shift count
   * the engine feeds straight to `asr.w`, where locked is the sentinel **15**.
   * The contract originally `$ref`'d both to `$defs/factor` — the mistake this
   * type exists to make un-writable — and the near-miss is why it survived: a
   * `FACTOR_0` here folds to 255, a 68000 register shift is taken mod 64, and
   * `ASR.W` by 63 sign-fills, so the term collapses and the plane renders
   * *almost* like a locked one instead of failing visibly. Fixed at empyrean
   * `a32bcb03` (CR-1); Aurora followed in ROADMAP item 35. `$defs/factor` is
   * untouched and still governs `fa`, `fb` and `curve.to`, which were correct.
   */
  v_factor: number;
  v_center?: number;
  v_offset?: number;
  /** Plane-A counterpart of `v_factor`, same shift encoding. RESERVED in v1. */
  v_factor_fg?: number;
  /**
   * The scene-level vertical bob's AMPLITUDE, as a right-shift of the
   * 256-amplitude sine table: peak excursion `256 >> bob_shift` px, so **1 is
   * 128 px and 8 is 1 px** — bigger number, smaller motion.
   *
   * ⚠ THE DOMAIN IS DISCONTINUOUS: exactly **15**, or **1..8**. 0 and 9..14 are
   * refused by aeon's `scene()` (`engine/level/scene_dsl.emp` at aeon
   * `8c75722b`), and the schema spells that as `anyOf: [{const: 15}, {1..8}]` —
   * the first `anyOf` in either committed contract schema.
   *
   * ⚠⚠ AND THE SENTINEL INVERTS AT THE LOWERING, which is why this field gets a
   * paragraph instead of a line. **15 is NO BOB** — the same 15 that means no
   * deform on `pcfg_anchor_dsa/dsb` — and it is the default. But the WIRE byte
   * `pcfg_bob` is **0** for no bob and `(bob_shift << 4) | bob_period`
   * otherwise, so `scene_bob_packed()` folds the authored 15 into the packed 0
   * that all twenty shipped records already emit. Document-off and wire-off are
   * OPPOSITE ENDS OF THE RANGE. A control clamped 0..15 authors 15 meaning
   * MAXIMUM while the engine reads NO BOB; a control treating 0 as off authors
   * the NARROWEST LEGAL SWAY, shift 0 being illegal precisely because it would
   * pack to the no-bob byte. Never clamp toward 0. See scene-ui.ts §2.5, which
   * derives every one of these numbers from the schema rather than restating
   * them, and [[top-of-range-is-a-sentinel]].
   */
  bob_shift?: number;
  /**
   * The bob's PERIOD, as a right-shift of the logic tick: one full sway is
   * `256 << bob_period` ticks, so **0 is the FASTEST** (~4.3 s at 60 Hz) and 8
   * the slowest (~18 min). Also an inverse shift, and also 0-is-not-off:
   * **IGNORED ENTIRELY when `bob_shift` is 15.**
   */
  bob_period?: number;
  deform_fg?: EffectsSceneDeform;
  deform_bg?: EffectsSceneDeform;
  v_deform?: EffectsVDeform;
  /**
   * The five reels. See `EffectsReels` above for the four hazards — DEBUG tier,
   * whole-pixel units (NO ×256), screen order is array order, and absent means
   * absent because there is no `"none"` spelling.
   */
  reels?: EffectsReels;
  anchor?: EffectsAnchor;
  left_column_mask?: 'undeclared' | 'sprite_mask' | 'factor0_lock' | 'accept';
  /*
   * `precision?: 'cell' | 'line'` LIVED HERE until 2026-08-27 (ROADMAP row 59).
   * empyrean 0bd4753 retired it from the contract because aeon deleted the
   * STORAGE — see the pin history above and scene-ui.ts's note.
   *
   * AND A DOCUMENT THAT STILL CARRIES IT IS NOW REFUSED, which is worth stating
   * HERE because the paragraph above ("a field the wave-1 UI does not edit
   * cannot be lost here") reads like it promises the opposite. It does not. That
   * paragraph is about fields the SCHEMA still declares and the UI merely does
   * not edit; `precision` is no longer declared at all, and this schema is CLOSED
   * (`unevaluatedProperties: false`), so validation refuses it before any
   * round-trip question arises. The two rules compose exactly as intended: the
   * schema decides what may exist, and the codec refuses to drop anything the
   * schema allows.
   *
   * NO TOLERANT READ WAS ADDED, and the hub explicitly left that call to Aurora
   * ("a tolerant read that discards a stray `precision` is aurora's call"). The
   * population is empty — checked on the owner's live aeon tree, not assumed —
   * and a silent discard is the lossy behaviour §6 hazard 1 forbids. The refusal
   * names the file; the author deletes one line. See
   * test/formats/effects-scene.test.ts, "REFUSES a legacy scene", and
   * docs/reviews/2026-08-27-retire-precision.md.
   */
  transition?: 'smooth' | 'instant';
  budget_class?: string;
}

// ---------------------------------------------------------------------------
// Constants derived FROM the schema, never re-typed beside it
// ---------------------------------------------------------------------------

function schemaProp(path: string[]): Record<string, unknown> {
  let node: unknown = EFFECTS_SCENE_SCHEMA;
  for (const seg of path) node = (node as Record<string, unknown>)[seg];
  if (typeof node !== 'object' || node === null) {
    throw new Error(`effects scene schema is missing ${path.join('.')}`);
  }
  return node as Record<string, unknown>;
}

/**
 * `^[a-z][a-z0-9_]{0,31}$`, read out of the schema rather than restated.
 *
 * THE ASYMMETRY THAT BITES: Aurora's BG-library ids are hyphenated slugs
 * (`makeBgId` in ../bg-library.ts emits `forest-1718000000`), and unicode is
 * legal there. Neither is legal here — a scene id becomes part of generated
 * .emp symbol names (schema doc §2 "Identity"). A ref that is a perfectly good
 * bgLayoutRef is not a legal sceneRef.
 */
export const EFFECTS_SCENE_ID_PATTERN =
  new RegExp(schemaProp(['properties', 'id']).pattern as string);

/** Per-layer defaults, read out of the schema (`$defs.layer.properties.*.default`). */
export const EFFECTS_LAYER_DEFAULTS = {
  dsa: schemaProp(['$defs', 'layer', 'properties', 'dsa']).default as number,
  dsb: schemaProp(['$defs', 'layer', 'properties', 'dsb']).default as number,
  phase: schemaProp(['$defs', 'layer', 'properties', 'phase']).default as number,
} as const;

/**
 * How many reel strips a scene declares — aeon's `REEL_BAND_COUNT`, reached
 * here as the `rates` array's own length bound rather than typed.
 *
 * THE TWO BOUNDS ARE CHECKED AGAINST EACH OTHER, not just read. `minItems` and
 * `maxItems` both spell the same engine constant, so a contract that moved one
 * and not the other would leave this module quietly reporting the wrong band
 * count for a schema that no longer means it — the loud-on-unmeasurable failure
 * this file's derivations exist to avoid. It throws instead.
 */
export const EFFECTS_REEL_BAND_COUNT: number = (() => {
  const rates = schemaProp(['properties', 'reels', 'properties', 'rates']);
  const min = rates.minItems as number;
  const max = rates.maxItems as number;
  if (typeof min !== 'number' || min !== max) {
    throw new Error(
      `effects scene schema: reels.rates declares minItems ${JSON.stringify(min)} and maxItems ` +
      `${JSON.stringify(max)}. Both are copies of aeon's REEL_BAND_COUNT and must agree; a band ` +
      'count is a code shape (it sizes a RAM array and is compiled into a shift), not a range.',
    );
  }
  return min;
})();

/**
 * The legal rate span, read out of the schema's `items` node.
 *
 * ⚠ THE UNIT IS SIGNED WHOLE PIXELS PER FRAME — see `EffectsReels`. These are
 * NOT the 1/256-px units `EFFECTS_DRIFT_RATE_BOUNDS` carries, and this bound is
 * the ONLY enforcement of the range anywhere in the pipeline today.
 */
export const EFFECTS_REEL_RATE_BOUNDS: { readonly min: number; readonly max: number } = (() => {
  const item = schemaProp(['properties', 'reels', 'properties', 'rates', 'items']);
  const min = item.minimum as number;
  const max = item.maximum as number;
  if (typeof min !== 'number' || typeof max !== 'number' || min >= max) {
    throw new Error(
      'effects scene schema: reels.rates.items declares no usable minimum/maximum pair ' +
      `(${JSON.stringify(min)}..${JSON.stringify(max)})`,
    );
  }
  return { min, max };
})();

/**
 * §2.1 "Deliberately excluded from the JSON surface". Both are byte-identity
 * bridges for hand-migrated legacy scenes; editor-authored scenes derive them
 * (-1). The consumer contract lists them under NOT read (§2.1).
 */
export const EXCLUDED_RAW_FIELDS = ['layer_mask_raw', 'v_deform_shift_raw'] as const;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** `{dataRoot}editor/effects/` — the whole editor scene library, one file per scene. */
export function effectsSceneDir(dataRoot: string): string {
  return `${dataRoot}editor/effects/`;
}

/** `{dataRoot}editor/effects/<scene_id>.json`. */
export function effectsScenePath(dataRoot: string, id: string): string {
  return `${effectsSceneDir(dataRoot)}${id}.json`;
}

/** The scene id a library filename claims, or null when it is not a scene file. */
export function sceneIdFromFileName(fileName: string): string | null {
  if (!fileName.endsWith('.json')) return null;
  return fileName.slice(0, -'.json'.length);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EffectsSceneError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(i => `  - ${i}`).join('\n')}` : message);
    this.name = 'EffectsSceneError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Every object key appearing anywhere in a parsed document, for the raw-field scan. */
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
 * Parse and validate one scene definition file.
 *
 * `filenameStem` is the `<scene_id>` part of the path the text came from; the
 * identity check (§2 "Identity": the stem must equal `id`, and the generator
 * refuses a mismatch) is why it is required rather than optional. A caller with
 * no file — a paste, a test — passes the id it intends.
 *
 * Throws EffectsSceneError on anything wrong. Loud, never lenient: a scene the
 * reader "fixed up" would be written back over the author's file in that fixed
 * shape, which is the silent-erasure class the whole contract is built against.
 */
export function parseEffectsScene(text: string, filenameStem: string): EffectsScene {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new EffectsSceneError(
      `${filenameStem}.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new EffectsSceneError(`${filenameStem}.json must contain a JSON object`);
  }
  const obj = doc as Record<string, unknown>;

  // Version first, with its own words. `"schema": {"const": 1}` would reject it
  // anyway, but "expected the constant 1, got 2" does not tell an author that
  // there is deliberately no migration machinery to ask for.
  if (obj.schema !== 1) {
    throw new EffectsSceneError(
      `${filenameStem}.json declares "schema": ${JSON.stringify(obj.schema)}; wave 1 refuses ` +
      'anything but 1. There is no migration machinery in v1 (AURORA_EFFECTS_SCHEMA.md §2, ' +
      'Versioning) — a new schema version is a contract change, not a file the reader upgrades.',
    );
  }

  const issues = validateAgainstSchema(obj, EFFECTS_SCENE_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);

  // The two excluded raw fields get their reason, not just "unknown property".
  // They are REJECTED, not preserved: the schema is closed on the writer path
  // (§8), and the consumer lists them under NOT read (§2.1), so a file carrying
  // one asks for behaviour nothing in the pipeline honours. Failing at read is
  // the loud half of "round-trip what you do not understand, or refuse the
  // file" (§6 hazard 1) — preserve-and-refuse-on-write would let the file live
  // in the editor and only blow up at save, after the author had worked on it.
  const present = everyKey(obj);
  const rawHits = EXCLUDED_RAW_FIELDS.filter(f => present.has(f));
  if (rawHits.length > 0) {
    issues.push(
      `${rawHits.join(' and ')} ${rawHits.length > 1 ? 'are' : 'is'} deliberately excluded from ` +
      'the JSON surface (AURORA_EFFECTS_SCHEMA.md §2.1): byte-identity bridges for hand-migrated ' +
      'legacy scenes, which editor-authored scenes derive. A layer that should be off authors ' +
      '"enabled": false.',
    );
  }

  if (issues.length > 0) {
    throw new EffectsSceneError(`${filenameStem}.json does not match the effects scene schema`, issues);
  }

  const scene = obj as unknown as EffectsScene;

  if (scene.id !== filenameStem) {
    throw new EffectsSceneError(
      `${filenameStem}.json declares "id": ${JSON.stringify(scene.id)}; the filename stem and the ` +
      'id must match (AURORA_EFFECTS_SCHEMA.md §2, Identity — the generator refuses a mismatch).',
    );
  }

  return scene;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Serialize a scene. Validates on the way out — the writer path is the one this
 * schema is closed for (§8: "the party validating is the party publishing what
 * it writes"), so an invalid scene must never reach disk.
 *
 * KEY ORDER is aeon's §5 canonical order — alphabetical, recursively — via
 * `canonicalKeyOrder`. It used to be the schema's own `properties` order; §5's
 * scope ruling (aeon 768eb2d8) replaced that, and the reason generalizes past
 * this file: a declaration order has to be maintained identically in two repos,
 * where alphabetical is derivable by both from the data alone.
 *
 * `canonicalizeBySchema` still runs, for the OTHER thing it does: it refuses any
 * key the schema does not declare, so serializing can never silently erase a
 * field. Its ordering no longer reaches disk — the sort runs after it.
 *
 * PRETTY-PRINTED at indent 2, and that is not an oversight. §5 splits
 * COMPACTNESS by document class while DETERMINISM binds universally: a scene
 * file is a handful of scalars, so a pretty diff is genuinely more reviewable,
 * where `editor_bg_override.json` is dominated by tile arrays and minifies.
 *
 * The cost §5 names and accepts: alphabetical puts `schema` and `id` in the
 * middle of the file rather than at the top, which reads worse than contract
 * order. "A self-describing order that cannot drift is worth more than a
 * familiar one that can."
 *
 * ENDS IN EXACTLY ONE `\n` after the closing brace — the canonical file form
 * (empyrean e1ebd20, AURORA_EFFECTS_SCHEMA.md §8, ruled 2026-08-26): it is a
 * POSIX text file, aeon's own shipped instance already ends that way, and a
 * newline-less file puts "\ No newline at end of file" on every diff. Nothing
 * else about surrounding whitespace is canonical; the parser accepts a file
 * with zero or two terminators and the writer lands on one.
 */
export function serializeEffectsScene(scene: EffectsScene): string {
  const issues = validateAgainstSchema(scene, EFFECTS_SCENE_SCHEMA)
    .map(i => `${i.path || '<document>'}: ${i.message}`);
  if (issues.length > 0) {
    throw new EffectsSceneError(
      `refusing to write scene ${JSON.stringify(scene?.id)}: it does not match the effects scene schema`,
      issues,
    );
  }
  // The trailing newline is the chokepoint's (canonical-json.ts jsonFileText)
  // since the §8 rule was generalised to every editor-owned JSON — not spelled
  // here, or a scene would end in two.
  return canonicalJsonPretty(canonicalizeBySchema(scene, EFFECTS_SCENE_SCHEMA));
}

// ---------------------------------------------------------------------------
// Library load (§2: an absent directory is "no editor scenes", not an error)
// ---------------------------------------------------------------------------

export interface UnreadableScene {
  /** Project-relative path of the file that could not be read. */
  path: string;
  reason: string;
}

export interface EffectsSceneLibrary {
  scenes: EffectsScene[];
  /**
   * Files that exist but could not be parsed. They are NOT scenes and NOT
   * silently dropped: a caller that later writes the library must skip these
   * paths, exactly as buildAeonSavePlan skips a section's `unreadable` files.
   */
  unreadable: UnreadableScene[];
  notices: Notice[];
}

/**
 * Load every scene in `{dataRoot}editor/effects/`.
 *
 * ABSENT AND UNREADABLE ARE NOT THE SAME FACT (the rule aeon/load.ts's
 * markUnreadable already states for section sidecars). An absent directory is
 * the ordinary "this project has no editor scenes yet" and is silent — §2 says
 * so in as many words. A file that exists and will not parse is loud: it lands
 * in `unreadable` with a notice, and its id is NOT returned, so nothing can
 * round-trip a repaired-looking empty scene over the author's broken one.
 */
export async function loadEffectsSceneLibrary(
  fa: FileAccess,
  dataRoot: string,
): Promise<EffectsSceneLibrary> {
  const dir = effectsSceneDir(dataRoot);
  const scenes: EffectsScene[] = [];
  const unreadable: UnreadableScene[] = [];
  const notices: Notice[] = [];

  let present = false;
  try { present = await fa.exists(dir); } catch { present = false; }
  if (!present) return { scenes, unreadable, notices };

  const entries = (await fa.list(dir)).slice().sort();
  for (const entry of entries) {
    const stem = sceneIdFromFileName(entry);
    if (stem === null) continue; // .bin deform tables and anything else live here too
    const path = `${dir}${entry}`;
    try {
      scenes.push(parseEffectsScene(new TextDecoder().decode(await fa.read(path)), stem));
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      unreadable.push({ path, reason });
      // The per-file reason, unabridged. The notice below names only the first
      // few, and this directory is a LISTING — its length is whatever the tree
      // holds, so the notice cannot be per file.
      console.warn(`[effects] ${path} could not be read as an effects scene: ${reason}`);
    }
  }

  // ONE notice for the whole directory, on the shape bgLibraryUnresolved already
  // ships. 'error' either way — the read FAILED and the scene is not in the
  // library; see core/project/notice.ts, severity is the producer's to assign,
  // and coalescing changes the count, never the channel. A single failure keeps
  // the message it always had, because one broken scene is the common case and
  // naming it outright is already right.
  if (unreadable.length === 1) {
    const only = unreadable[0];
    notices.push({
      severity: 'error',
      message:
        `${only.path} exists but could not be read as an effects scene (${only.reason}). ` +
        'Aurora is ignoring it and will NOT overwrite the file — fix it by hand and reopen.',
    });
  } else if (unreadable.length > 1) {
    notices.push({
      severity: 'error',
      message:
        `${unreadable.length} files in ${dir} exist but could not be read as effects scenes — ` +
        `${nameSome(unreadable.map((u) => u.path))}. ` +
        'Aurora is ignoring them and will NOT overwrite them — fix them by hand and reopen. ' +
        'Each file and its own reason is in the developer console.',
    });
  }

  return { scenes, unreadable, notices };
}

// ---------------------------------------------------------------------------
// Advisory only — NOT enforcement
// ---------------------------------------------------------------------------

export interface SceneAdvisory { path: string; message: string }

/**
 * The two-sources guard, as ADVICE.
 *
 * §2.2: "When `own` is present, `dsa`/`dsb`/`phase` must be absent or at their
 * defaults — they lower into the SAME record fields (two-sources guard; sigil
 * enforces with the exact reason)."
 *
 * Aurora does NOT enforce it. The contract assigns value semantics to sigil and
 * says the build gate is the rulebook; a second enforcement here would be a
 * second rulebook, free to drift from sigil's in either its condition or its
 * wording, and the first divergence would present as "the editor let me save a
 * file the build rejects" or — far worse — "the editor refused a file the build
 * accepts". What §2 does license is advisory UX ("Aurora may pre-check anything
 * it likes as advisory UX"), which is this: a pure function nothing in the read
 * or write path calls, for a UI to surface as a warning.
 *
 * The defaults it compares against are read out of the schema
 * (EFFECTS_LAYER_DEFAULTS), so even the advisory cannot drift on what "at their
 * defaults" means.
 */
/**
 * The reels BINDING warning, as ADVICE — and one-sided advice at that.
 *
 * §2.7: aeon's generator emits one DEBUG-gated `[i8; REEL_BAND_COUNT]` table per
 * authoring scene plus an association table keyed on the scene's LOWERED CONFIG
 * LABEL, matched at runtime against `Parallax_Current_Config`. That label is
 * unique only for a section bound at `Effects_ResolveParallax`'s RUNG 1 — an
 * editor `sceneRef`. So the generator REFUSES `reels` on a scene whose sections
 * resolve through a preset (rung 2) or the act default (rung 3), where the
 * pointer is shared and the rates would silently reach other sections.
 *
 * ⚠ THAT REFUSAL IS AEON'S, AND THIS IS NOT IT. Aurora does not model
 * `Effects_ResolveParallax`, does not know a preset's contents, and cannot see
 * the generator's constants; a second rulebook here would be free to drift from
 * the one that actually decides, in either its condition or its wording. What
 * this is licensed to be (§2, "Aurora may pre-check anything it likes as
 * advisory UX") is a pure function nothing in the read or write path calls.
 *
 * ⚠⚠ AND IT IS ONE-SIDED ON PURPOSE. It speaks only in the NEGATIVE case — no
 * section in the project names this scene by `sceneRef`, so no section can
 * possibly reach it at rung 1. SILENCE IS NOT A CLEARANCE: a scene that IS named
 * by a `sceneRef` may still be refused for a reason only aeon can see, and a
 * surface must never present the absence of this warning as a guarantee that the
 * build will accept the key. There is deliberately no "looks fine" return value
 * for a caller to render as one.
 *
 * `sceneRefs` is every section meta sidecar's `sceneRef` in the project (null =
 * act default). Passing an EMPTY list means "this project has no sections",
 * which is a different fact from "no section binds this scene" — so the function
 * says nothing at all rather than warning about a project it was handed none of.
 */
export function advisoryReelsBinding(
  scene: EffectsScene,
  sceneRefs: readonly (string | null)[],
): SceneAdvisory[] {
  if (scene.reels === undefined) return [];
  if (sceneRefs.length === 0) return [];
  if (sceneRefs.some(ref => ref === scene.id)) return [];
  return [{
    path: '/reels',
    message:
      `EDITOR-SIDE WARNING, not the refusal: no section in this project names "${scene.id}" in ` +
      'its sceneRef, and aeon\'s generator refuses a reels key on a scene whose sections resolve ' +
      'through a preset or the act default instead of an editor sceneRef (the association table ' +
      'is keyed on the lowered config label, which is unique only for a sceneRef-bound section). ' +
      'Saving is not blocked, and this check is one-sided — its silence is not a clearance, ' +
      'because only the build can say whether the key is accepted.',
  }];
}

export function advisoryLayerDeformConflicts(scene: EffectsScene): SceneAdvisory[] {
  const out: SceneAdvisory[] = [];
  scene.layers.forEach((layer, i) => {
    const deform = layer.deform;
    if (deform === undefined || deform === 'none' || !('own' in deform)) return;
    const clashes = (['dsa', 'dsb', 'phase'] as const)
      .filter(k => layer[k] !== undefined && layer[k] !== EFFECTS_LAYER_DEFAULTS[k]);
    if (clashes.length === 0) return;
    out.push({
      path: `/layers/${i}`,
      message:
        `deform.own is set alongside ${clashes.join('/')}; both lower into the same record fields ` +
        '(two-sources guard). sigil refuses this at build time with the exact reason — ' +
        'clear one source before building.',
    });
  });
  return out;
}
