// Aeon port for the effects (parallax) facet: every decision the scene editor
// makes, as pure functions over plain values.
//
// WHY A PROVIDER AND NOT LOGIC IN THE COMPONENT. The node-only suite cannot see
// React — ~3,900 tests pass here while a rendered surface is visibly broken — so
// anything decided inside a component is a decision nothing in `vitest run` can
// check. The interesting decisions on this surface are all of that kind: what a
// factor dropdown may offer, when a change is a no-op that must NOT consume an
// undo slot, which ids a new scene may not take, and what an edit's undo command
// carries. They live here; the component wires events to them and renders.
//
// EVERY MUTATION RETURNS A COMMAND, it does not execute one. Same rule (and same
// reason) as `aeonBackgroundCommand` in properties-aeon: `executeCommand` throws
// for a non-aeon focused document, so a function that dispatched could only be
// tested with a whole focused aeon session standing up.
//
// THE NO-OP GUARD IS LOAD-BEARING, not tidiness. A `<select>` fires onChange for
// the option already selected, and a number field fires on every keystroke that
// re-types the same value. A command either way pushes an undo entry that
// visibly does nothing, which is the §6 "one undo step per mutation" bar failing
// from the other direction.

import type {
  SetEffectsSceneCommand, SetSectionSceneCommand,
} from '../../core/editing/commands';
import {
  EFFECTS_LAYER_DEFAULTS,
  EFFECTS_REEL_BAND_COUNT, EFFECTS_REEL_RATE_BOUNDS, advisoryReelsBinding,
  type EffectsScene, type EffectsSceneLibrary, type EffectsFactor, type EffectsLayer,
  type EffectsTableRef, type EffectsCurve, type EffectsVSplit, type EffectsDrift,
  type EffectsSceneDeform, type EffectsVDeform, type EffectsLayerDeform,
  type EffectsRowRemap,
} from '../../core/formats/effects/scene';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_LAYER_COUNT,
  EFFECTS_WORLD_Y_BOUNDS, EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS,
  EFFECTS_V_OFFSET_BOUNDS, EFFECTS_V_CENTER_DEFAULT, EFFECTS_V_OFFSET_DEFAULT,
  EFFECTS_V_FACTOR_LOCK, EFFECTS_VSPLIT_AT_BOUNDS,
  EFFECTS_TABLE_REF_FORMS, EFFECTS_TABLE_REF_BIN_PATTERN, EFFECTS_DEFORM_TABLE_BYTES,
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
  EFFECTS_ANCHOR_SHIFT_BOUNDS,
  EFFECTS_LEFT_COLUMN_MASK_UNDECLARED, EFFECTS_LEFT_COLUMN_MASK_VALUES, EFFECTS_FACTOR_ZERO,
  EFFECTS_SCENE_KEY_DEFAULTS, EFFECTS_LAYER_KEY_DEFAULTS,
  type TableRefParam,
  EFFECTS_TRANSITION_VALUES,
  EFFECTS_BOB_SHIFT_LADDER, EFFECTS_BOB_SHIFT_NONE, EFFECTS_BOB_PERIOD_BOUNDS,
  EFFECTS_BOB_PERIOD_DEFAULT,
  bobPeakPixels, bobPeriodSeconds, bobShiftOf, bobShiftRefusal,
  cloneEffectsScene, factorLabel, isNamedFactor, newEffectsLayer, newEffectsScene,
  sceneIdRefusal, driftRateOf, driftRateToPxPerFrame, driftPxPerFrameToRate,
  driftRateRefusal, driftPxPerFrameRefusal,
  EFFECTS_DRIFT_UNITS_PER_PIXEL, EFFECTS_DRIFT_PX_BOUNDS, EFFECTS_DRIFT_RATE_BOUNDS,
  EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS, EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS,
  EFFECTS_ROW_REMAP_HEIGHT_SHIFTS, EFFECTS_ROW_REMAP_BUILDABLE_SHIFT,
  EFFECTS_ROW_REMAP_GENERATOR_REFUSALS,
  rowRemapHeightLines, rowRemapBuildableToday, rowRemapOf, clampRowRemapPlaneY,
  // §2.7 REELS. ⚠ `EFFECTS_REEL_RATE_BOUNDS` is imported here and the drift
  // bounds above it are a DIFFERENT UNIT — 1/256 px there, whole px here. The
  // two names sit four lines apart on purpose: an author of a future row who
  // reaches for the wrong one is exactly the defect this key's docblock is
  // about, and the two are easier to confuse when only one is in sight.
  EFFECTS_REEL_RATE_GUIDANCE, EFFECTS_REEL_COLS_PER_BAND,
  EFFECTS_REEL_STRIP_WIDTH_PX, EFFECTS_REELS_DEBUG_NOTE, EFFECTS_REELS_BINDING_NOTE,
  EFFECTS_REEL_X256_SURVIVORS, EFFECTS_REEL_X256_FULLY_CAUGHT,
  reelStripScreenX, reelCycleFrames, reelCycleLabel,
  reelRateRefusal, reelRatesRefusal, reelRateGuidance,
} from '../../core/formats/effects/scene-ui';
import { BG_LAYOUT_WORDS, TILE_WIDTH_PX } from '../../core/formats/bg-override/bg-override';
import { BG_WIDTH } from '../../core/formats/bg-tiles';

// ---------------------------------------------------------------------------
// Factor picker
// ---------------------------------------------------------------------------

/**
 * The sentinel a factor `<select>` uses for "custom packed value".
 *
 * Not a legal FACTOR_* name by the schema's own enum (every published name
 * starts `FACTOR_`), so it can never collide with one. Asserted in the tests
 * rather than merely asserted here.
 */
export const CUSTOM_FACTOR_VALUE = '__packed__';

export interface FactorOption { value: string; label: string }

/**
 * What a factor dropdown offers: the published names, then the custom packed
 * escape hatch. Derived from the schema (EFFECTS_FACTOR_NAMES), so §2.3's
 * "constrained to representable shift-add fractions" cannot drift into a
 * hand-typed list.
 */
export function factorOptions(): FactorOption[] {
  return [
    ...EFFECTS_FACTOR_NAMES.map((n) => ({ value: n, label: n })),
    { value: CUSTOM_FACTOR_VALUE, label: 'Custom…' },
  ];
}

// ---------------------------------------------------------------------------
// What fa / fb ARE — parcel D (triage 2026-08-26 §A.5)
// ---------------------------------------------------------------------------
//
// The owner asked what "plane a packed scroll factor" means. The rows were the
// raw keys with the schema's own words for titles. Engine meaning (schema
// §2.2/§2.3): per layer, `fa` is how far PLANE A (the foreground / level
// plane) scrolls per pixel of camera movement and `fb` the same for PLANE B
// (the background); `FACTOR_1` moves with the camera, `FACTOR_1_16` at a
// sixteenth (far away), `FACTOR_LOCKED` not at all. "Packed" is the engine's
// shift-add ENCODING of that fraction — the custom escape hatch — and the word
// belongs inside the custom expander, where `s1`/`s2`/`op` live, not on the
// row an author reads first.
//
// WHY `(fg)` / `(bg)` AND NOT THE FULL WORDS (parcel label-column-align): the
// label column is a fixed 64px that wraps at spaces (column-layout.tsx), and
// `(foreground)` is one 12-character token — wider than any token the column
// was measured on (`Transition`, `Blank band`: 10). The first cut shipped the
// full words and the live app drew the layer card's label column at three
// widths. The short form wraps as `Plane A` / `(fg)`; the full words are said
// once, in the hint under both rows, and in each row's title.

/** The two factor rows of a layer: label, and the title the label carries. */
export const PLANE_FACTOR_ROWS = Object.freeze({
  fa: Object.freeze({
    key: 'fa' as const,
    label: 'Plane A (fg)',
    title: 'fa — how far Plane A, the foreground level plane, scrolls per pixel of camera movement',
  }),
  fb: Object.freeze({
    key: 'fb' as const,
    label: 'Plane B (bg)',
    title: 'fb — how far Plane B, the background, scrolls per pixel of camera movement',
  }),
});

/** One line under both rows, said once per layer. */
export const PLANE_FACTOR_HINT =
  'A = foreground, B = background; fraction of camera movement this strip scrolls; 1 = with the camera';

// ---------------------------------------------------------------------------
// curve.to and vsplit.at — parcel H (triage 2026-08-26 §A.7, §B row H)
// ---------------------------------------------------------------------------
//
// What the engine does with each (schema §2.2; aeon engine/level/scene_dsl.emp
// SceneCurve / SceneVSplit banners):
//   curve   Plane B's scroll factor RAMPS across the layer, from the layer's own
//           `fb` at its top to `curve.to` at its bottom. `to` IS a factor
//           (§2.3), so the control is the same picker `fb` uses, plus a none
//           state. The engine refuses `to == fb` (a ramp that goes nowhere,
//           layer() guard 4) — surfaced here as ADVICE, never enforced.
//   vsplit  from this layer's top DOWN, Plane B's whole-plane vertical scroll
//           is `at` — one raster fire. `at` is a Plane-B ROW and the plane wraps
//           at 512, so 0..511 (EFFECTS_VSPLIT_AT_BOUNDS, from the schema).
// Both were read-only on the card (parcel E) and are controls now; the extras
// line no longer lists them, so a value is said once.

/**
 * The curve row: label, title, the one hint, and the word for its none state.
 *
 * ⚠ THE LABEL IS `B curve to` AND THE DROPPED WORD IS DELIBERATE. It read
 * `Plane B curve to`, which needs 84px of the shared 64px label column and
 * wrapped onto two lines on every layer card of the shipped scene — measured
 * under CDP, `effects-column-harness` `[r4]`. The column is not widened for it:
 * it is 300px total and every pixel the label takes is one a `flex: 1` control
 * loses, and the controls in this column are the part carrying sentences. The
 * plane is not lost — the row DIRECTLY above this one is `Plane B (bg)`, and
 * the title below spells `curve.to` out in full. See `column-layout.tsx`.
 */
export const LAYER_CURVE_ROW = Object.freeze({
  key: 'curve' as const,
  label: 'B curve to',
  title: 'curve.to — the Plane B factor at this strip\'s bottom; none keeps fb the whole way down',
  hint: "Plane B speed ramps from fb at this strip's top to this value at its bottom",
  none: 'none',
});

/**
 * The vsplit row: label, title (with the schema's bound), hint, and its two states.
 *
 * ⚠ `B split at`, not `Plane B split at`, for the reason on `LAYER_CURVE_ROW`:
 * the full spelling needs 77px of a 64px column and wrapped.
 */
export const LAYER_VSPLIT_ROW = Object.freeze({
  key: 'vsplit' as const,
  label: 'B split at',
  title: `vsplit.at — the Plane B row scrolled to from this strip down `
    + `(${EFFECTS_VSPLIT_AT_BOUNDS.min}..${EFFECTS_VSPLIT_AT_BOUNDS.max}); none leaves the plane alone`,
  hint: 'from this strip down, Plane B scrolls vertically as a whole',
  none: 'none',
  at: 'row',
});

/** The curve picker's value: the far-end factor, or none (absent and explicit "none" alike). */
export function curveFieldValue(layer: Pick<EffectsLayer, 'curve'>): EffectsFactor | 'none' {
  const c = layer.curve;
  return c === undefined || c === 'none' ? 'none' : c.to;
}

/** What the picker's choice writes: `undefined` clears the key (setLayerFieldCommand), else `{to}`. */
export function curveFromField(f: EffectsFactor | 'none'): EffectsCurve | undefined {
  return f === 'none' ? undefined : { to: f };
}

/** The vsplit spinner's value, or null when the layer has no split. */
export function vsplitFieldValue(layer: Pick<EffectsLayer, 'vsplit'>): number | null {
  const v = layer.vsplit;
  return v === undefined || v === 'none' ? null : v.at;
}

/**
 * Turning the split on or off. Off clears the key. On seeds the strip's own
 * top clamped into the plane: "from this strip down" is the sentence, and on
 * a locked scene `world_y` already IS a plane line, so the row under the
 * strip's top is the least surprising first value to then tune.
 */
export function vsplitFromToggle(on: boolean, layer: Pick<EffectsLayer, 'world_y'>): EffectsVSplit | undefined {
  return on ? { at: clampVSplitAt(layer.world_y) } : undefined;
}

// ---------------------------------------------------------------------------
// drift — EW-DRIFT-CTL
// ---------------------------------------------------------------------------
//
// A constant horizontal rate added to this strip's scroll EVERY FRAME,
// independent of the camera: S1 GHZ's clouds, S3K AIZ1's. It is the one thing on
// this card that moves with the camera standing still, which is why the row's
// hint says exactly that and nothing else — the neighbouring rows are all
// camera-relative and an author reads "drift" as parallax otherwise.
//
// THE UNIT IS THE WHOLE PARCEL. The wire is 1/256 px per FRAME; the card is
// px/frame. aeon's generator does NOT convert (`render_drift`'s docstring: the
// multiply "happens in AURORA'S UI, on export, above the wire — so a multiply
// here would apply it twice and every authored rate would come out 256x too
// fast"), so the ×256 exists in exactly ONE place in this repo,
// `driftPxPerFrameToRate`, and this row is its only caller on the write path.
// Nothing here re-derives it; a 256× error is invisible to every one-directional
// test because every wrong value is itself a legal rate.
//
// A LAYER KEY, NOT A BAND KEY, and there is deliberately no group control. The
// four OJZ canopy strips carry ONE rate on purpose — that art is a single visual
// plane cut into four records and per-strip rates would shear it at a boundary —
// but that is an author typing the same number four times, not a reason to hide
// the per-layer nature behind an "apply to all".

/**
 * The rate a new drift starts at: ⅛ px/frame, which is S3K AIZ1's clouds — the
 * schema's own worked corpus value, and the slowest rate in it.
 *
 * DERIVED FROM THE FACTOR, not typed as `32`, and CHECKED at import: a contract
 * that moved the unit or narrowed the range so ⅛ px/frame stopped being legal
 * fails this module's load instead of seeding every new drift with a value the
 * build refuses.
 */
export const EFFECTS_DRIFT_SEED_RATE: number = (() => {
  const rate = EFFECTS_DRIFT_UNITS_PER_PIXEL / 8;
  const why = driftRateRefusal(rate);
  if (why !== null) {
    throw new Error(
      `the drift row's seed (1/8 px/frame = ${rate}) is no longer a legal rate: ${why} `
      + 'Re-derive the seed against the amended contract.',
    );
  }
  return rate;
})();

/**
 * The spinner's arrow step, in px/frame — the seed's own magnitude.
 *
 * NOT 1, which is what `<input type="number">` defaults to. The corpus runs from
 * ⅛ to 6 px/frame, so a step of 1 makes the arrows useless at the slow end and
 * (because a browser snaps to a multiple of the step) turns one press on `0.125`
 * into `1`. Stepping by the slowest corpus rate makes the arrows walk the range
 * an author actually authors in.
 */
export const EFFECTS_DRIFT_PX_STEP = driftRateToPxPerFrame(EFFECTS_DRIFT_SEED_RATE);

/** The drift row: label, title (with the schema's bound, in px/frame), hint, and its two states. */
export const LAYER_DRIFT_ROW = Object.freeze({
  key: 'drift' as const,
  label: 'Drift',
  title: 'drift.rate — a constant horizontal speed added every frame, with or without the camera; '
    + `${EFFECTS_DRIFT_PX_BOUNDS.min}..${EFFECTS_DRIFT_PX_BOUNDS.max} px/frame, negative = leftward`,
  hint: 'moves on its own, camera or no camera — clouds; set it to none for a strip that should not',
  none: 'none',
  on: 'px/frame',
  /** The box's own title: the unit, said where the number is typed. */
  rateTitle: `drift.rate in PIXELS PER FRAME (the file stores 1/256ths: `
    + `1 px/frame = ${EFFECTS_DRIFT_UNITS_PER_PIXEL}). S3K AIZ1's clouds are `
    + `${driftRateToPxPerFrame(EFFECTS_DRIFT_SEED_RATE)}; the fastest in the corpus is 6`,
});

/** The drift spinner's value in px/frame, or null when the layer does not drift. */
export function driftPxFieldValue(layer: Pick<EffectsLayer, 'drift'>): number | null {
  const rate = driftRateOf(layer.drift);
  return rate === null ? null : driftRateToPxPerFrame(rate);
}

/**
 * Turning drift on or off. Off clears the key — `"none"` and absent mean the
 * same thing and an absent key is the spelling that puts no diff on a file that
 * never carried it (`setLayerFieldCommand`'s rule). On seeds the corpus's
 * slowest rate rather than zero, because ZERO IS REFUSED: it is
 * indistinguishable from no drift at all in ROM, so a control that seeded it
 * would land every new drift in the refused state.
 */
export function driftFromToggle(on: boolean): EffectsDrift | undefined {
  return on ? { rate: EFFECTS_DRIFT_SEED_RATE } : undefined;
}

/**
 * What a typed px/frame value writes. The ×256 lives in `driftPxPerFrameToRate`
 * and this is the only place on the write path that calls it.
 *
 * ⚠ ONLY EVER REACHED THROUGH `driftPxPerFrameRefusal` — `NumberField`'s
 * `refuse` withholds the commit, so an out-of-range or rounds-to-zero value
 * never arrives here. This function does NOT clamp, deliberately: a clamp would
 * substitute a number the author did not type, which is the defect the whole
 * refusal path exists to avoid.
 */
export function driftFromPxPerFrame(pxPerFrame: number): EffectsDrift {
  return { rate: driftPxPerFrameToRate(pxPerFrame) };
}

// ---------------------------------------------------------------------------
// rowRemap — EW-9-ROWREMAP-CONTROL
// ---------------------------------------------------------------------------
//
// Hydrocity's waterline, as a layer key. This strip's Plane-B scroll words are
// re-fetched through a perspective index ladder, so screen line `i` takes the
// value that belonged to line `ladder[i]`; the band compresses toward the
// surface as the camera separates the background's picture of the surface from
// the foreground's truth about it. empyrean `3992d16` (§2.6), aeon key-shape
// artifact `3d917657` against the landed `SceneRemap.Ladder(t, y, h)`.
//
// ═══ WHAT THIS ROW HAS TO SAY THAT NO OTHER ROW ON THE CARD DOES ═══
//
// 1. THE PICKER SHOWS LINES AND WRITES A SHIFT. `height_shift` is a SHIFT
//    (`H = 1 << shift`), every value 3..7 is legal, and an editor that exported
//    a line count would land a band four times too tall WITH A GREEN BUILD. The
//    option labels are built by `rowRemapHeightLines`, the only `<<` on this key
//    in the repo; `rowRemapWithHeightShift` writes the shift and never touches
//    it. Each label spells the shift beside the line count, so an author reading
//    the file afterwards recognises what they picked.
//
// 2. FOUR OF THE FIVE LEGAL OPTIONS DO NOT BUILD TODAY, and saying so is not
//    optional. Only `height_shift: 4` has a ladder (`row_remap_ladder16()`);
//    aeon refuses the other four BY NAME until 9b's generator lands. The owner's
//    recorded complaint about this tooling is exactly this failure — "it kept
//    giving errors during build time that I would have to stop and revert the
//    changes" — so the picker MARKS the buildable option, warns under the row
//    when a non-buildable one is selected, and still LETS THE AUTHOR PICK IT: a
//    control that hid four legal values would disagree with the format, and an
//    author who opened a hand-authored `height_shift: 6` would be looking at a
//    list that cannot represent their own file. Nothing here hardcodes "only 4
//    works": the state and its reason are read from the contract
//    (`EFFECTS_ROW_REMAP_BUILDABLE_SHIFT`), so when 9b lands and the clause goes,
//    every warning here goes with it and no Aurora edit is needed.
//
// 3. THE THREE `scene()` PRECONDITIONS ARE CHECKABLE HERE AND NOWHERE ELSE THE
//    AUTHOR CAN SEE. §2.6 ruling (3) keeps them OUT of the schema on purpose —
//    "JSON Schema cannot express a cross-key conditional over an array element's
//    siblings legibly, and the message is worth more than the encoding" — and
//    assigns them to aeon's GENERATOR, with the engine `ensure`s kept for
//    hand-authored `.emp`. So neither party the author is talking to refuses
//    them until a build runs. Every input, though, is a key Aurora already holds
//    in the open document: `anchor`, `deform_bg`, per-layer `curve` and `dsb`,
//    and the layers array itself. `rowRemapPreconditions` reports them under the
//    row, which is the difference between meeting them in the editor and meeting
//    them in a build log.
//
//    ⚠ THEY ARE WARNINGS, NOT REFUSALS, and that follows §2.6 rather than
//    softening it: the refusals belong to aeon's generator, the document stays
//    schema-legal either way, and Aurora refusing to WRITE one would be a fourth
//    party inventing a rule. What Aurora owes is that the author never learns it
//    from a red build.
//
// 4. `ladder` AND `table` ARE REFUSED BY NAME. There is no control for either
//    and nothing here writes one; `EFFECTS_ROW_REMAP_REFUSED_KEYS` reads the
//    names out of the schema's `{"not": {}}` nodes, so a third reserved name
//    would surface with no edit here.

/**
 * The `height_shift` a NEW remap is born on — the one that BUILDS, while the
 * contract still names one.
 *
 * A NEW REMAP MUST NEVER BE BORN UNBUILDABLE. That is this parcel's whole
 * owner-facing point, and it is why the seed is derived rather than chosen: when
 * 9b lands and the contract stops naming a buildable shift,
 * `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` reads `null` and the seed falls back to the
 * narrowest band the format admits — the least the author is committed to before
 * they have touched the picker, and still a number the schema produced.
 */
export const EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT: number =
  EFFECTS_ROW_REMAP_BUILDABLE_SHIFT ?? EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS.min;

/** The row: label, titles, hint and its two states. Every bound comes from the schema. */
export const LAYER_ROW_REMAP_ROW = Object.freeze({
  key: 'rowRemap' as const,
  label: 'Row remap',
  title: 'rowRemap — this strip\'s Plane-B scroll words re-fetched through a perspective ladder, '
    + 'so the band compresses toward a surface line as the camera moves (Hydrocity\'s waterline). '
    + 'At most ONE strip per scene may carry it',
  hint: 'the rows of this strip are reordered toward a surface line — one strip per scene, and '
    + 'the scene needs an anchor and something for the remap to vary',
  none: 'none',
  on: 'ladder',
  /** The plane-line box's own title: the coordinate space, said where the number is typed. */
  planeYTitle: 'rowRemap.plane_y — the BG PLANE LINE where this strip\'s art paints the surface, '
    + `${EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS.min}..${EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS.max}. NOT a `
    + 'world Y and NOT a screen line (the runtime reads plane_y - Vscroll_BG); the same space as '
    + 'a strip\'s vertical split. This range is the contract\'s ONLY enforcement — aeon checks the '
    + 'floor and not the ceiling',
  /** The picker's own title: the unit hazard, said where the choice is made. */
  heightTitle: 'rowRemap.height_shift — the band height. The FILE STORES A SHIFT and this list '
    + 'shows the lines it means (H = 1 << shift), because exporting a line count would land a '
    + 'band four times too tall with no build error',
  /** Suffix on the option the engine can build today; empty once the contract stops naming one. */
  buildsSuffix: ' — builds today',
});

/** One `height_shift` as the picker offers it: the value, its label, and whether it builds. */
export interface RowRemapHeightOption {
  shift: number;
  lines: number;
  label: string;
  buildsToday: boolean;
}

/**
 * The height picker's options — every shift the schema admits, labelled in LINES
 * with the shift spelled beside it, and the buildable one marked.
 *
 * NOTHING IS HIDDEN; see point 2 of the banner above.
 */
export const ROW_REMAP_HEIGHT_OPTIONS: readonly RowRemapHeightOption[] = Object.freeze(
  EFFECTS_ROW_REMAP_HEIGHT_SHIFTS.map((shift) => {
    const lines = rowRemapHeightLines(shift);
    const buildsToday = rowRemapBuildableToday(shift) === null;
    const named = EFFECTS_ROW_REMAP_BUILDABLE_SHIFT !== null;
    return Object.freeze({
      shift,
      lines,
      buildsToday,
      label: `${lines} lines (shift ${shift})`
        + (buildsToday && named ? LAYER_ROW_REMAP_ROW.buildsSuffix : ''),
    });
  }),
);

/** The payload the row's boxes show, or null when this strip carries no remap. */
export function rowRemapFieldValue(
  layer: Pick<EffectsLayer, 'rowRemap'>,
): { plane_y: number; height_shift: number } | null {
  return rowRemapOf(layer.rowRemap);
}

/**
 * Turning the remap on or off.
 *
 * OFF CLEARS THE KEY — `setLayerFieldCommand`'s rule: absent and `"none"` lower
 * to the same NULL ladder, and an absent key is the spelling that puts no diff
 * on a file that never carried it.
 *
 * ON SEEDS THE STRIP'S OWN `world_y`, CLAMPED — `vsplitFromToggle`'s precedent,
 * and for a stronger reason here: the contract says `plane_y` lives in the same
 * coordinate space as `vsplit.at`, so the one number already on the card that is
 * a plausible plane line is the strip's own top. It is a starting point to type
 * over, not a claim that it is right, and it is CLAMPED because `plane_y`'s
 * ceiling has no enforcement anywhere but the schema — an unclamped seed is the
 * one value in this repo that could reach a ROM as a window pointing nowhere.
 * The clamp uses `rowRemap`'s OWN bounds, not `vsplit`'s.
 */
export function rowRemapFromToggle(
  on: boolean, layer: Pick<EffectsLayer, 'world_y'>,
): EffectsRowRemap | undefined {
  return on
    ? {
      plane_y: clampRowRemapPlaneY(layer.world_y),
      height_shift: EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT,
    }
    : undefined;
}

/**
 * What a typed plane line writes, keeping the shift the strip already carries.
 *
 * ⚠ ONLY EVER REACHED THROUGH `rowRemapPlaneYRefusal` — `NumberField`'s `refuse`
 * withholds the commit — and it does NOT clamp, for `driftFromPxPerFrame`'s
 * reason: a clamp substitutes a number the author did not type. The seed above
 * clamps because a seed has no author to disagree with; a typed value does.
 */
export function rowRemapWithPlaneY(
  current: { plane_y: number; height_shift: number }, planeY: number,
): EffectsRowRemap {
  return { plane_y: planeY, height_shift: current.height_shift };
}

/**
 * What a picked height writes — THE SHIFT, never the line count.
 *
 * The only function on the write path for this field, so the unit hazard has one
 * place it could be got wrong and that place is three lines long.
 */
export function rowRemapWithHeightShift(
  current: { plane_y: number; height_shift: number }, shift: number,
): EffectsRowRemap {
  return { plane_y: current.plane_y, height_shift: shift };
}

/**
 * THE THREE `scene()` PRECONDITIONS, EVALUATED AGAINST THE OPEN DOCUMENT.
 *
 * Empty when this strip's remap is fine (or when it carries none); otherwise one
 * sentence per unmet condition, each pairing AURORA'S FINDING about this document
 * with THE CONTRACT'S OWN CLAUSE, so the rule an author reads is the one aeon
 * wrote and only the diagnosis is Aurora's.
 *
 * WHY THREE AND NOT FOUR. The contract names a fourth — the game must raise
 * `CAP_ROW_REMAP` — and it is the one that is NOT a function of the document:
 * nothing in a scene file says which game will bind it. Reporting it per-layer
 * would be a warning an author can neither satisfy nor dismiss, so it is stated
 * once as a note (`EFFECTS_ROW_REMAP_CAPABILITY_NOTE`) and never as a verdict.
 * Naming the one Aurora cannot see is the point: silence about it would read as
 * coverage.
 *
 * THE PREDICATES ARE THE ENGINE'S. "Something to vary" is spelled by the
 * contract as "its own curve, or a live dsb with a deform_bg table, or the scene
 * anchor's live dsb with a deform_bg table", and that is what the first arm
 * tests. The no-deform sentinels come from `EFFECTS_LAYER_DEFORM_BOUNDS` and
 * `EFFECTS_ANCHOR_SHIFT_BOUNDS` as two SEPARATE reads, because the two shift
 * spaces live in different `$defs` and agree only by coincidence today —
 * `EFFECTS_ANCHOR_SHIFT_BOUNDS`'s own docblock records why that matters.
 *
 * `effectiveDsb` and not `layer.dsb`: `layer()` folds `own`'s `shift_b` over a
 * layer's `dsb` (`scene_dsl.emp:558`), so a strip with its own deform table has
 * a live amplitude its `dsb` field does not show.
 */
export function rowRemapPreconditions(scene: EffectsScene, index: number): string[] {
  const layer = scene.layers[index];
  if (!layer || rowRemapOf(layer.rowRemap) === null) return [];
  const out: string[] = [];

  const layerOff = EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max;
  const anchorOff = EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max;
  const bgTable = sceneDeformValue(scene, 'deform_bg') !== null;
  const ownCurve = curveFieldValue(layer) !== 'none';
  const dsb = effectiveDsb(layer);
  const anchor = scene.anchor !== undefined && scene.anchor !== 'none' ? scene.anchor.at : null;
  const anchorLive = anchor !== null && anchor.dsb !== anchorOff;

  // (1) Something to vary — else the remap is the IDENTITY and the effect is
  //     ABSENT, not subtle. Each half of the diagnosis says which input was
  //     missing, because "nothing to vary" alone does not tell an author where
  //     to go.
  if (!ownCurve && !(dsb !== layerOff && bgTable) && !(anchorLive && bgTable)) {
    const why: string[] = ['no curve on this strip'];
    why.push(dsb === layerOff
      ? `its dsb is ${layerOff}, the no-deform sentinel`
      : `its dsb is ${dsb} but the scene has no deform_bg table`);
    why.push(anchor === null
      ? 'no scene anchor'
      : anchorLive
        ? 'the anchor\'s dsb is live but the scene has no deform_bg table'
        : `the anchor's dsb is ${anchorOff}`);
    out.push(`nothing for the remap to vary — ${why.join('; ')}. `
      + `The contract: "${EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.vary}"`);
  }

  // (2) The scene must declare an anchor — the remap takes its channel from the
  //     SCENE's `anchor`, never from a per-layer field.
  if (anchor === null) {
    out.push('this scene declares no anchor, and the remap takes its channel from the scene\'s '
      + 'own anchor rather than from the strip. '
      + `The contract: "${EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.anchor}"`);
  }

  // (3) At most one remapped strip per scene — the others NAMED, so the author
  //     knows where to go and does not have to open every card.
  const others = scene.layers
    .map((l, i) => (i !== index && rowRemapOf(l.rowRemap) !== null ? i : -1))
    .filter((i) => i >= 0);
  if (others.length > 0) {
    out.push(`strip${others.length > 1 ? 's' : ''} ${others.join(', ')} `
      + `${others.length > 1 ? 'also carry' : 'also carries'} a row remap. `
      + `The contract: "${EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.single}"`);
  }

  return out;
}

/**
 * The fourth refusal, which is NOT a function of the document — stated once
 * beside the row, so its absence from `rowRemapPreconditions` cannot be read as
 * coverage.
 */
export const EFFECTS_ROW_REMAP_CAPABILITY_NOTE =
  'Aurora cannot check the fourth condition from a scene file — nothing here says which game '
  + `will bind it. The contract: "${EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.capability}"`;

/**
 * THE ENGINE'S layer() GUARD 4, AS ONE PREDICATE — the only place the rule is
 * spelled. `curveAdvisory` (what a document already CARRIES) and
 * `curveFieldOptions` (what the picker may LAND on) both read it, and neither
 * restates it, so the sentence under the row and the greyed row in the list
 * cannot come to disagree after an edit to one of them.
 *
 * Equality is BY VALUE, so a packed triple spelled twice is caught too — the
 * comparison a `===` would miss and the reason this is `JSON.stringify` rather
 * than the obvious operator. Both operands are schema-shaped (a `FACTOR_*`
 * string, or `{s1,s2,op}` written in that key order by every producer in this
 * module), so key order is not a hazard here.
 */
export function curveGoesNowhere(fb: EffectsFactor, to: EffectsFactor): boolean {
  return JSON.stringify(to) === JSON.stringify(fb);
}

/**
 * The engine's reason, in one sentence, for one candidate far end.
 *
 * ALSO ONLY SPELLED ONCE, for the same reason the predicate is: the advisory
 * under the row and the disabled option's own tooltip say the identical thing
 * about the identical value, because they ARE the same string.
 */
export function curveFlatReason(to: EffectsFactor): string {
  return `curve to ${factorLabel(to)} is the same factor as Plane B — the ramp goes nowhere and the build refuses it`;
}

/**
 * Advice, not enforcement: the engine's layer() guard 4 refuses a curve whose
 * far end equals `fb` ("the ramp's two ends are equal and the emitted HScroll
 * is byte-identical to the flat path").
 *
 * STILL LOAD-BEARING NOW THAT THE PICKER DISABLES THAT OPTION (ROADMAP row 13).
 * The picker governs what an author can LAND on; this governs what a document
 * already CARRIES — a hand-edited file, an MCP write, a scene authored before
 * the option was disabled, and the PACKED path, which no dropdown option can
 * express at all (see `curveFieldOptions`). That is the same two-paths split
 * `tableRefAdvisory` keeps beside its own picker, and removing either half
 * re-opens the path it covers.
 */
export function curveAdvisory(layer: Pick<EffectsLayer, 'fb' | 'curve'>): string | null {
  const to = curveFieldValue(layer);
  if (to === 'none') return null;
  if (!curveGoesNowhere(layer.fb, to)) return null;
  return curveFlatReason(to);
}

/** A factor `<select>` option that can carry the engine's refusal of itself. */
export interface FactorFieldOption extends FactorOption {
  /** True for a value the ENGINE refuses outright HERE; the picker must not take it. */
  disabled: boolean;
  /** The engine's reason, for the option's own title. Empty for a plain value. */
  title: string;
}

/**
 * What the CURVE picker offers for one layer — `factorOptions()`, with the one
 * value the engine refuses on THIS layer rendered disabled and carrying why.
 *
 * ═══ WHY DISABLED AND NOT DROPPED (the row-13 remedy, named by the drift-codec
 * packet as the shape two later parcels copy) ═══
 *
 * A `<select>` whose current value has no option silently shows a DIFFERENT
 * one. Drop `FACTOR_1_4` here and a file that already carries `curve.to
 * FACTOR_1_4` beside `fb FACTOR_1_4` draws the picker on `none` — the author
 * reads "no curve" while the build reads a curve and refuses it. That is the
 * quiet lie `leftColumnMaskOptions` and `tableRefParamOptions` both exist to
 * stop, and it is why "merely hidden" was ruled out rather than preferred.
 *
 * ═══ THE STRICTNESS QUESTION, ON `tableRefParamOptions`' OWN TEST ═══
 *
 * That test disables an option only when NO scene content can make it legal,
 * and it rules `factor0_lock` the other way precisely because that value's
 * precondition is about the rest of the scene. `curve.to == fb` passes the
 * test, and the reason is worth stating because it looks at first like the
 * `factor0_lock` case:
 *
 *   • THE REFUSED VALUE IS RECOMPUTED FROM `fb` ON EVERY RENDER. It is not a
 *     claim about the scene that an author might declare now and make true
 *     later — the ONLY way to make `to == fb` build is to change `fb`, which
 *     is two rows up on the same card and immediately moves which option is
 *     disabled. So the picker never withholds something the build would have
 *     taken from the document as it stands.
 *   • guard 4 IS UNCONDITIONAL on the pair. No other key, on the layer or the
 *     scene, can license it.
 *   • THE DOCUMENT STILL SAVES. Nothing here refuses a write; `curveAdvisory`
 *     is untouched and sigil stays the rulebook (row 58's posture).
 *
 * ═══ THE PACKED ESCAPE HATCH IS NEVER DISABLED, AND THAT IS CORRECT ═══
 *
 * `CUSTOM_FACTOR_VALUE` is a SENTINEL, not a factor — picking it opens the
 * s1/s2/op spinners rather than committing a value, so there is no refusal to
 * attach to it. And when `fb` is itself packed, `curveGoesNowhere` compares an
 * object against a `FACTOR_*` string for every named option and disables NONE
 * of them, which is right: no named factor equals a packed triple by value.
 * The packed collision is reachable only through the spinners, where there is
 * no option to grey, and `curveAdvisory` is what covers it.
 */
export function curveFieldOptions(layer: Pick<EffectsLayer, 'fb'>): FactorFieldOption[] {
  return factorOptions().map((o) => {
    if (o.value === CUSTOM_FACTOR_VALUE) {
      return { ...o, disabled: false, title: 'a packed shift-add factor, spelled by hand' };
    }
    const to = o.value as EffectsFactor;
    const refused = curveGoesNowhere(layer.fb, to);
    return {
      ...o,
      disabled: refused,
      title: refused ? curveFlatReason(to) : `Plane B ramps to ${factorLabel(to)} at this strip's bottom`,
    };
  });
}

// ---------------------------------------------------------------------------
// DEFORM — the panel's own wave 2 (schema §2.1 deform_fg/deform_bg/v_deform,
// §2.2 layer deform, §2.4 tableRef)
// ---------------------------------------------------------------------------
//
// WHAT THE CARD SAID ABOUT ITSELF UNTIL THIS PARCEL: "deform is wave 2". The
// contract has carried it since wave 1, the codec round-trips it, `layerExtras`
// could already PRINT it — and no author could reach it from the app. Four
// attachments arrive here:
//
//   deform_fg / deform_bg   ONE table each plane samples, whole scene
//                           (SceneDeform.Shared(table, speed)).
//   v_deform                the per-COLUMN vertical table
//                           (SceneVDeform.Columns(table, speed, amp_shift)),
//                           which is a different VSRAM mode, not a variant of
//                           the two above.
//   layer deform            one layer's OWN table, overriding the plane-shared
//                           one for that band (SceneDeform.Own).
//
// EVERY ONE OF THEM POINTS AT A `tableRef`, which has SIX spellings and not the
// two "a generator or a file" suggests: sine, triangle, zero, two v_column
// generators, and a raw .bin. The list, the parameters and their ranges are all
// read out of the schema (scene-ui EFFECTS_TABLE_REF_FORMS).
//
// ADVISORY, NEVER ENFORCEMENT — the posture scene.ts states for
// advisoryLayerDeformConflicts and `curveAdvisory` already follows. The deform
// surface is where that matters most, because aeon's `scene()` carries FIVE
// comptime `ensure`s an author can trip from these controls alone, and until
// this parcel the only way to find out was a failed build. They are transcribed
// below as sentences, with sigil left as the rulebook.
//
// ⚠ AND ONE OF THEM IS NOT REACHABLE FROM THIS PANEL AT ALL. Turning `v_deform`
// on makes `left_column_mask` MANDATORY (aeon engine/level/scene_dsl.emp P3
// Task 12 guard 1) and this panel has no control for it — out of this parcel's
// scope by its brief. `vDeformAdvisories` therefore says so in as many words,
// naming the file, rather than letting the author discover it at build time.
// Booked in the parcel report as the immediate follow-up.

/** A `tableRef` parameter's label: the schema's key, title-cased at the spaces. */
export function tableParamLabel(key: string): string {
  return key
    .split('_')
    .map((t, i) => (t.length === 1 ? t.toUpperCase() : i === 0 ? t[0].toUpperCase() + t.slice(1) : t))
    .join(' ');
}

/** What the table `<select>` offers: every form the schema admits, in schema order. */
export function tableRefFormOptions(): FactorOption[] {
  return EFFECTS_TABLE_REF_FORMS.map((f) => ({
    value: f.id,
    // The GENERATOR'S OWN NAME for a generator — it is the word the schema, the
    // generated .emp and `tableRefLabel`'s read-only summary all use, so a
    // prettier synonym here would be a fourth name for one thing. The raw-file
    // branch has no generator name, and `.bin file` is what it is.
    label: f.kind === 'bin' ? '.bin file' : f.id,
  }));
}

/** The form a table value is spelled in — `'bin'` for the raw-file branch. */
export function tableRefFormOf(t: EffectsTableRef): string {
  return 'bin' in t ? 'bin' : t.generator;
}

/** One form's parameters, or `[]` for a form that has none (`zero`, `.bin`). */
export function tableRefParams(formId: string): readonly TableRefParam[] {
  return EFFECTS_TABLE_REF_FORMS.find((f) => f.id === formId)?.params ?? [];
}

/**
 * Clamp one table parameter to the schema's range for it.
 *
 * THE CLAMP IS THE BOUND (ROADMAP item 37), as everywhere else on this surface.
 * An UNBOUNDED parameter (`focal`, `center`, `max_offset` declare no range) is
 * rounded and otherwise passed through — inventing a ceiling the contract does
 * not have would refuse a value aeon's emit accepts, which the item-37 docblock
 * names as the worse of the two failures.
 */
export function clampTableRefParam(formId: string, key: string, value: number): number {
  const p = tableRefParams(formId).find((q) => q.key === key);
  const min = p?.min ?? null;
  if (!Number.isFinite(value)) return min ?? 0;
  const rounded = Math.round(value);
  const lo = min === null ? rounded : Math.max(min, rounded);
  return p?.max === null || p?.max === undefined ? lo : Math.min(p.max, lo);
}

/**
 * The neutral value a parameter seeds with when a table takes a new form.
 *
 * `period` seeds at the WHOLE TABLE: its schema maximum IS the table length
 * (scene-ui asserts that coupling at module load), so one cycle over the table
 * is both in range and — the half that matters — guaranteed to divide the table
 * length, which is sigil's own rule for a period. Every other bounded parameter
 * seeds at its minimum: the quietest legal deflection, which is the value an
 * author turns UP, exactly as `factorFromSelect` seeds the packed triple at the
 * spelling closest to "one shift, nothing added". An unbounded parameter seeds
 * at 0, which for `max_offset` is a column table that displaces nothing.
 */
function seedTableRefParam(p: TableRefParam): number {
  if (p.key === 'period' && p.max !== null) return p.max;
  return p.min ?? 0;
}

/**
 * The table a form choice means, keeping every same-named parameter the current
 * table already carries (sine ↔ triangle is the switch this is for: the two
 * generators take the same amplitude and period, and an author comparing them
 * must not lose the numbers they just tuned).
 */
export function tableRefFromForm(formId: string, current: EffectsTableRef): EffectsTableRef {
  if (formId === tableRefFormOf(current)) return current;
  if (formId === 'bin') return { bin: '' };
  const next: Record<string, unknown> = { generator: formId };
  for (const p of tableRefParams(formId)) {
    const carried = (current as unknown as Record<string, unknown>)[p.key];
    next[p.key] = typeof carried === 'number'
      ? clampTableRefParam(formId, p.key, carried)
      : seedTableRefParam(p);
  }
  return next as unknown as EffectsTableRef;
}

/** A brand-new table: the schema's FIRST form, at its seed values. */
export function newTableRef(): EffectsTableRef {
  const first = EFFECTS_TABLE_REF_FORMS[0];
  if (first.kind === 'bin') return { bin: '' };
  const t: Record<string, unknown> = { generator: first.id };
  for (const p of first.params) t[p.key] = seedTableRefParam(p);
  return t as unknown as EffectsTableRef;
}

/** One parameter's current value, or its seed when the table does not carry it. */
export function tableRefParamValue(t: EffectsTableRef, key: string): number {
  const v = (t as unknown as Record<string, unknown>)[key];
  if (typeof v === 'number') return v;
  const p = tableRefParams(tableRefFormOf(t)).find((q) => q.key === key);
  return p ? seedTableRefParam(p) : 0;
}

/** A table with one parameter changed, clamped to the schema's range for it. */
export function setTableRefParam(t: EffectsTableRef, key: string, value: number): EffectsTableRef {
  return {
    ...(t as unknown as Record<string, unknown>),
    [key]: clampTableRefParam(tableRefFormOf(t), key, value),
  } as unknown as EffectsTableRef;
}

/** The `.bin` path a table names, or null when it is a generator. */
export function tableRefBinPath(t: EffectsTableRef): string | null {
  return 'bin' in t ? t.bin : null;
}

/**
 * Why a `.bin` path is not one the codec will write, or null.
 *
 * THE SCHEMA'S OWN PATTERN decides — `EFFECTS_TABLE_REF_BIN_PATTERN`, which
 * carries the `..`-rejecting lookahead — so this cannot drift into a second,
 * gentler rule. Aurora does not check the file EXISTS: the table is baked by
 * aeon's `embed()` out of its own tree, and a path Aurora cannot see is not the
 * same fact as a path that is malformed.
 */
export function binPathRefusal(path: string): string | null {
  if (path === '') return null;   // an empty box is "not typed yet", not a refusal
  if (EFFECTS_TABLE_REF_BIN_PATTERN.test(path)) return null;
  return `"${path}" is not a legal table path — ${TABLE_REF_ROW.binRule}`;
}

/**
 * The `period` values the ENGINE will accept — the divisors of the table length.
 *
 * COMPUTED, NEVER A LITERAL LIST. `EFFECTS_DEFORM_TABLE_BYTES` is itself derived
 * from the schema's own prose and cross-checked against `period`'s ceiling at
 * module load, so a contract that moved the table length moves this list with
 * it. Typing `[1, 2, 4, …]` here would be a fourth place the number 256 lives.
 *
 * THE RULE IS THE ENGINE'S, NOT SIGIL'S AND NOT THE SCHEMA'S — a correction the
 * guard-transcription parcel made and this parcel keeps:
 *   engine/level/parallax_dsl.emp:52  ensure(256 % period == 0, "deform_sine: period {period} must divide 256")
 *   engine/level/parallax_dsl.emp:87  the same, for deform_triangle
 * Both measured refusing at `period: 100`, each naming its own generator.
 *
 * Bounded by the PARAMETER's declared range rather than by 1..length, so a
 * schema that narrowed `period` narrows this too instead of offering a value the
 * codec would then refuse.
 */
export function deformPeriodChoices(p: TableRefParam): number[] {
  const lo = Math.max(1, p.min ?? 1);
  const hi = p.max ?? EFFECTS_DEFORM_TABLE_BYTES;
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) if (EFFECTS_DEFORM_TABLE_BYTES % v === 0) out.push(v);
  return out;
}

/** One option on a table parameter rendered as a picker. */
export interface TableParamOption {
  value: number;
  label: string;
  /** True for a value the ENGINE refuses; rendered so a file's value shows, unpickable. */
  disabled: boolean;
  title: string;
}

/**
 * A table parameter's options when it should be a PICKER, or null when it stays
 * a spinner — ROADMAP row 63.
 *
 * WHY `period` STOPPED BEING A SPINNER. Its schema range is 1..256 and only the
 * nine divisors of 256 build, so the control advertised 247 illegal values out
 * of 256 — and two independent parcels had already had to work around it without
 * anybody writing the constraint down (`seedTableRefParam` seeds at `max`
 * *"guaranteed to divide the table length"*; row 60's harness rule R14 takes
 * `max ÷ N` *"because the build refuses a period that does not divide it"*).
 * Two workarounds for one control is the tell that the affordance was wrong
 * rather than its users.
 *
 * ⚠ AND `min`/`max` ON A NUMBER INPUT WERE NEVER GOING TO FIX IT (ROADMAP item
 * 37's bar). They govern the spinner and `:invalid`; they stop no TYPED value,
 * and a clamp beside them can only hold a value inside a RANGE — it has no way
 * to express "divides". A `<select>` has no typed value at all, so the
 * constraint holds structurally rather than by a check somebody has to remember.
 *
 * ═══ THE STRICTNESS QUESTION, ANSWERED RATHER THAN ASSUMED ═══
 *
 * The schema is the LOOSER document: it admits every integer 1..256, and the
 * engine refuses the non-divisors later. So a picker over nine values is
 * stricter than the CONTRACT — the trap scene.ts names, where "the editor
 * refused a file the build accepts" is the far worse failure. It is taken
 * deliberately, on the same test that licenses `sprite_mask`'s disabled option
 * and rules `factor0_lock`'s the other way:
 *
 *   • NO SCENE CONTENT CAN MAKE A NON-DIVISOR LEGAL. The two ensures are
 *     unconditional and `sine`/`triangle` are the only forms with a `period` at
 *     all, so there is no document where the picker's omission costs the author
 *     something the build would have taken. (Contrast `factor0_lock`, whose
 *     precondition is about the scene's own contents — which is exactly why
 *     THAT one stays selectable and only advises.)
 *   • A VALUE ALREADY IN THE FILE IS STILL RENDERED, disabled, and still
 *     advised by `tableRefAdvisory`. A `<select>` whose current value has no
 *     option silently shows a DIFFERENT one, which is the quiet lie
 *     `unassignableSceneRef` and `leftColumnMaskOptions` both exist to stop —
 *     and here it would be worse than the spinner it replaced, because the
 *     author would see a legal number and the build would read an illegal one.
 *   • THE DOCUMENT STILL SAVES. Narrowing the picker is not enforcement: the
 *     advisory is untouched, nothing refuses the write, and sigil stays the
 *     rulebook. Row 58's posture is intact.
 *
 * The derivation cannot leak into the `.bin` branch, which declares no
 * parameters at all — `tableRefParams('bin')` is `[]`, so there is nothing here
 * for it to reach.
 */
export function tableRefParamOptions(
  formId: string, key: string, current: number,
): TableParamOption[] | null {
  if (key !== 'period') return null;
  const p = tableRefParams(formId).find((q) => q.key === key);
  if (!p) return null;
  const legal = deformPeriodChoices(p);
  if (legal.length === 0) return null;
  const options: TableParamOption[] = legal.map((v) => ({
    value: v,
    label: String(v),
    disabled: false,
    title: v === EFFECTS_DEFORM_TABLE_BYTES
      ? `one cycle over the whole ${EFFECTS_DEFORM_TABLE_BYTES}-byte table`
      : `${EFFECTS_DEFORM_TABLE_BYTES / v} cycles over the ${EFFECTS_DEFORM_TABLE_BYTES}-byte table`,
  }));
  // The value the FILE carries, when the engine would refuse it: rendered so the
  // control cannot show a number the build will not read, and disabled so the
  // author cannot pick it back.
  if (!legal.includes(current) && Number.isFinite(current)) {
    options.push({
      value: current,
      label: String(current),
      disabled: true,
      title: `the build refuses it: ${current} does not divide `
        + `${EFFECTS_DEFORM_TABLE_BYTES}, so the cycle would not close`,
    });
    options.sort((a, b) => a.value - b.value);
  }
  return options;
}

/**
 * Advice on a table, or null: the ENGINE requires a generator's period to DIVIDE
 * the table length (`engine/level/parallax_dsl.emp:52` for `deform_sine`, `:87`
 * for `deform_triangle` — both literally `ensure(256 % period == 0, …)`), and
 * nothing in the shape validator can see it. Said before the build says it,
 * never enforced.
 *
 * STILL LOAD-BEARING NOW THAT `period` IS A PICKER (ROADMAP row 63). The picker
 * governs what an author can LAND on; this governs what a document already
 * CARRIES — a hand-edited file, an MCP write, a scene from before the picker.
 * That is the same two-paths split `sprite_mask` has, and removing either half
 * re-opens the path it covers.
 */
export function tableRefAdvisory(t: EffectsTableRef): string | null {
  if ('bin' in t || !('period' in t)) return null;
  const period = t.period;
  if (EFFECTS_DEFORM_TABLE_BYTES % period === 0) return null;
  return `period ${period} does not divide the ${EFFECTS_DEFORM_TABLE_BYTES}-byte table — `
    + 'the cycle would not close and the build refuses it';
}

/** The table sub-form's wording, including the path rule the refusal quotes. */
export const TABLE_REF_ROW = Object.freeze({
  label: 'Table',
  title: `table — the ${EFFECTS_DEFORM_TABLE_BYTES}-byte signed curve this deform samples: `
    + 'a generator the build computes, or a raw .bin you drew',
  binLabel: 'File',
  binTitle: 'bin — a raw table file under data/editor/effects/',
  binRule: 'a path under data/editor/effects/ ending in .bin, with no ".." segments',
});

/** The two scene-level plane attachments (`SceneDeform.Shared`), by key. */
export const SCENE_DEFORM_ROWS = Object.freeze({
  deform_fg: Object.freeze({
    key: 'deform_fg' as const,
    label: 'Deform fg',
    title: 'deform_fg — one table Plane A samples on every line of the whole scene',
  }),
  deform_bg: Object.freeze({
    key: 'deform_bg' as const,
    label: 'Deform bg',
    title: 'deform_bg — one table Plane B samples on every line of the whole scene',
  }),
});

/**
 * The one hint under both plane rows, and the words their select uses.
 *
 * NO LABELS HERE. Every field label on the deform rows comes from
 * `tableParamLabel(<the schema key>)`, so `speed` is `Speed` and `amp_shift` is
 * `Amp shift` by derivation rather than by a second spelling that can drift from
 * the key it edits.
 */
export const SCENE_DEFORM_ROW_SHARED = Object.freeze({
  none: 'none',
  on: 'shared',
  hint: 'a plane-wide horizontal wobble; each layer\'s own shifts decide how much of it it takes',
  speedTitle: 'speed — how fast the sample point walks the table each frame; 0 holds it still',
});

/** The per-column vertical attachment (`SceneVDeform.Columns`). */
export const V_DEFORM_ROW = Object.freeze({
  key: 'v_deform' as const,
  label: 'V deform',
  title: 'v_deform — a per-column VERTICAL table: each 16px column of Plane B scrolls to its own row',
  none: 'none',
  on: 'columns',
  hint: 'per-column vertical scroll — a different VSRAM mode, not a variant of the plane rows above',
  ampTitle: `amp_shift — right-shift applied to each sampled byte, `
    + `${EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS.min}..${EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS.max}; bigger = flatter`,
});

/** The per-layer attachment (`SceneDeform.Own`). */
export const LAYER_DEFORM_ROW = Object.freeze({
  key: 'deform' as const,
  label: 'Deform',
  title: 'deform.own — this strip\'s OWN table, overriding the scene\'s for this strip only',
  none: 'none',
  on: 'own',
  hint: 'overrides the scene table for this strip; 15 on a shift means that plane takes none of it',
  shiftATitle: `shift_a — Plane A amplitude as a right-shift, `
    + `${EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.min}..${EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max}; `
    + `${EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max} = no sample`,
  shiftBTitle: `shift_b — Plane B amplitude as a right-shift, `
    + `${EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.min}..${EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max}; `
    + `${EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max} = no sample`,
  phaseTitle: `phase — where in the table this strip starts, `
    + `${EFFECTS_LAYER_DEFORM_BOUNDS.phase.min}..${EFFECTS_LAYER_DEFORM_BOUNDS.phase.max}`,
});

/** Clamp one of `own`'s three integer fields to the schema's range for it. */
export function clampLayerDeformField(
  field: 'shift_a' | 'shift_b' | 'phase', value: number,
): number {
  const { min, max } = EFFECTS_LAYER_DEFORM_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Clamp `v_deform.columns.amp_shift` to the schema's range. */
export function clampAmpShift(value: number): number {
  const { min, max } = EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * `speed` has NO schema bound on any of the three attachments — it is a plain
 * integer — so this rounds and does nothing else. Present so the form has one
 * write path per field rather than a bare `Math.round` at three call sites, and
 * so the day the contract bounds it there is one place to bound.
 */
export function clampDeformSpeed(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/** A scene plane attachment's payload, or null when the scene has none. */
export function sceneDeformValue(
  scene: Pick<EffectsScene, 'deform_fg' | 'deform_bg'>, key: 'deform_fg' | 'deform_bg',
): { table: EffectsTableRef; speed: number } | null {
  const d = scene[key];
  return d === undefined || d === 'none' ? null : d.shared;
}

/** Turning a plane attachment on (a fresh table, held still) or off (clears the key). */
export function sceneDeformFromToggle(on: boolean): EffectsSceneDeform | undefined {
  return on ? { shared: { table: newTableRef(), speed: 0 } } : undefined;
}

/** The per-column attachment's payload, or null. */
export function vDeformValue(
  scene: Pick<EffectsScene, 'v_deform'>,
): { table: EffectsTableRef; speed: number; amp_shift: number } | null {
  const d = scene.v_deform;
  return d === undefined || d === 'none' ? null : d.columns;
}

/** Turning the per-column attachment on or off. */
export function vDeformFromToggle(on: boolean): EffectsVDeform | undefined {
  return on
    ? { columns: { table: newTableRef(), speed: 0, amp_shift: EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS.min } }
    : undefined;
}

/** A layer's own attachment, or null. */
export function layerDeformValue(
  layer: Pick<EffectsLayer, 'deform'>,
): { table: EffectsTableRef; shift_a: number; shift_b: number; phase: number; speed: number } | null {
  const d = layer.deform;
  return d === undefined || d === 'none' ? null : d.own;
}

/**
 * Turning a layer's own attachment on or off.
 *
 * ON SEEDS A TRUE NO-OP, and that is the deliberate half. `own`'s shift_a /
 * shift_b / phase lower into the SAME record fields as the layer's own dsa /
 * dsb / phase (the two-sources guard), so seeding each at the schema DEFAULT of
 * the field it lowers into is the only seed that leaves the strip rendering
 * exactly as it did a moment ago. The alternative — seeding a live shift — makes
 * the toggle jump the picture before the author has chosen a table, and there is
 * no non-arbitrary number to jump it by. The row's advisory says the attachment
 * is silent and which spinner wakes it, so the no-op is legible rather than
 * mysterious.
 */
export function layerDeformFromToggle(on: boolean): EffectsLayerDeform | undefined {
  return on
    ? {
      own: {
        table: newTableRef(),
        shift_a: EFFECTS_LAYER_DEFAULTS.dsa,
        shift_b: EFFECTS_LAYER_DEFAULTS.dsb,
        phase: EFFECTS_LAYER_DEFAULTS.phase,
        speed: 0,
      },
    }
    : undefined;
}

/**
 * What aeon's `scene()` would refuse about this scene's deform, as sentences.
 *
 * MOST OF THE guards on this surface are cross-field, so no control can carry
 * them and the codec's shape validator cannot see them either. Each is
 * transcribed from the `ensure` it mirrors (aeon engine/level/scene_dsl.emp),
 * and each is ADVICE: sigil stays the rulebook, exactly as scene.ts's
 * advisoryLayerDeformConflicts docblock argues.
 *
 * ONE ARM IS NOT CROSS-FIELD — `sprite_mask` (ROADMAP row 62), which the engine
 * refuses on the declaration alone. It is here anyway because "here" is where
 * the panel already renders warnings, and because the reason it was MISSING was
 * precisely that a single-field refusal looked like the picker's problem. It is
 * not: the picker only governs values an author selects.
 *
 * The fifth — `own` alongside a live dsa/dsb/phase — is already written, in the
 * codec, as `advisoryLayerDeformConflicts`. It is per-layer, so the card renders
 * it on the layer it is about rather than here.
 */
export function sceneDeformAdvisories(scene: EffectsScene): string[] {
  const out: string[] = [];
  const anyOwn = scene.layers.some((l) => layerDeformValue(l) !== null);
  const sceneTable = sceneDeformValue(scene, 'deform_fg') !== null
    || sceneDeformValue(scene, 'deform_bg') !== null;
  if (anyOwn && !sceneTable) {
    out.push(
      'a strip attaches its own table but the scene attaches none on either plane — every other '
      + 'strip with a live shift would sample from nothing, and the build refuses it. Set '
      + `${SCENE_DEFORM_ROWS.deform_fg.label} or ${SCENE_DEFORM_ROWS.deform_bg.label}.`,
    );
  }
  const vDeform = vDeformValue(scene) !== null;
  const vsplitLayer = scene.layers.findIndex((l) => vsplitFieldValue(l) !== null);
  // ⚠ COMPOSED, NOT TYPED OUT — `VSPLIT_VDEFORM_CLAUSES` is the declaration and
  // this is one of its three surfaces (the layer card and the raster strip are
  // the others). Until 2026-09-04 this was the ONLY place in Aurora that said
  // anything about the pair, which is the position ROADMAP row 80 judged
  // insufficient for the twin refusal one ensure above it in aeon's source.
  //
  // THE MECHANISM CLAUSE IS DELIBERATELY NOT HERE. These arms render as plain
  // warning hints with no hover, and `column-layout.tsx`'s `Advisory` block
  // records what an unsplit advisory costs this column (the v_factor row's ran
  // to 21 wrapped lines / ~460px). The diagnosis and the remedies are what an
  // author must act on; the "one column of forty" mechanism rides on the layer
  // card's `Advisory`, which has a hover to put it in.
  if (vDeform && vsplitLayer >= 0) {
    out.push(
      `layer ${vsplitLayer} authors a Plane B split while ${VSPLIT_VDEFORM_CLAUSES.sceneIs} — `
      + `the build refuses this scene. ${VSPLIT_VDEFORM_CLAUSES.remedies}`,
    );
  }
  const mask = scene.left_column_mask ?? EFFECTS_LEFT_COLUMN_MASK_UNDECLARED;
  if (vDeform && mask === EFFECTS_LEFT_COLUMN_MASK_UNDECLARED) {
    out.push(
      'V deform is on and this scene declares no left_column_mask policy, which the build '
      + 'requires: in per-column mode the leftmost partial column renders at a scroll nothing '
      + `wrote. Answer it on the ${LEFT_COLUMN_MASK_ROW.label} row below.`,
    );
  }
  // GUARD 3, FOR A VALUE THAT ARRIVED RATHER THAN WAS PICKED (ROADMAP row 62).
  //
  // `sprite_mask` is rendered as a DISABLED option, and row 58 reasoned that
  // correctly — but disabling an option protects the PICKER and protects nothing
  // about a document that already holds the value. A hand-edited file, a scene
  // copied from elsewhere, an MCP `edit_effects_scene` write or a future tool
  // can all put it there, and until this arm existed the author opened such a
  // scene, saw no warning anywhere, saved, and met the refusal at build time
  // with no in-app explanation. Measured, not reasoned: on the identical
  // document `sceneDeformAdvisories` returned `(none)` while the build went
  // rc=1 (docs/reviews/2026-08-27-guard-transcription.md §4 guard 3, re-measured
  // 2026-08-27 in docs/reviews/2026-08-27-guard-surface-gaps.md).
  //
  // THE DISABLED OPTION STAYS. The two cover different paths — the option stops
  // the value being AUTHORED here, this arm explains it once it has ARRIVED —
  // and removing either re-opens the one it covers.
  //
  // UNCONDITIONAL, unlike every other arm on this surface, because the engine's
  // refusal is: `scene_dsl.emp:1354` fires on the declaration alone, with no
  // reference to `v_deform` or to anything else the scene contains. So there is
  // no scene edit that clears it and the remedy is to change the value — which
  // is what the sentence asks for. A scene carrying `sprite_mask` with no
  // `v_deform` therefore reads TWO advisories, this one and guard 2's; both are
  // true, both are cleared by the same single edit, and suppressing either would
  // be Aurora deciding which of two real refusals the author is allowed to see.
  if (mask === 'sprite_mask') {
    out.push(
      'this scene declares left_column_mask "sprite_mask", which the build refuses in every '
      + 'scene: the engine\'s left-column strip emission has not landed, so the declaration '
      + 'would be accepted while the sliver stays uncovered. Declare factor0_lock or accept '
      + `on the ${LEFT_COLUMN_MASK_ROW.label} row instead — the picker will not offer `
      + 'sprite_mask back.',
    );
  }
  // GUARD 2's ARM IS NOT DEAD CODE NOW THAT THE TOGGLE CLEARS THE POLICY WITH
  // `v_deform`. The state is unreachable through the panel by construction —
  // and it is one hand-edited file away, which is precisely when an author has
  // nothing else to tell them. `leftColumnMaskRowVisible` keeps the control on
  // screen for exactly this case so the advice has something to act on.
  if (!vDeform && mask !== EFFECTS_LEFT_COLUMN_MASK_UNDECLARED) {
    out.push(
      `this scene declares left_column_mask "${mask}" but attaches no per-column V deform, so `
      + 'the policy adjudicates an artifact that cannot occur; the build refuses it. Clear it '
      + `to ${EFFECTS_LEFT_COLUMN_MASK_UNDECLARED}, or attach a V deform.`,
    );
  }
  const anchorClash = curveAnchorDeformAdvisory(scene);
  if (anchorClash !== null) out.push(anchorClash);
  const claim = leftColumnMaskAdvisory(scene);
  if (claim !== null) out.push(claim);
  return out;
}

/**
 * Advice on a scene, or null: a curve layer alongside an anchor carrying LIVE
 * deform shifts — aeon `scene_dsl.emp:1251` (ROADMAP row 64).
 *
 * WHY THIS ONE WAS MISSED, which is the useful half. Guard 5 is FOUR ensures,
 * not the two Aurora's summary named. Three of them are per-LAYER facts and
 * `layerCurveDeformAdvisory` carries them: `:580` (a curve with a live amplitude
 * on the SAME layer) and `:586` (a curve with `deform: Own` on the same layer),
 * plus `:1271`'s vsplit pair above. This one is not a layer fact at all — the
 * curve is on one layer and the shifts are on the SCENE's anchor, so no
 * per-layer scan can see the pair and the scene-level scan had no anchor arm.
 * A guard whose two halves sit on different objects is exactly the one a
 * transcription drops.
 *
 * THE MECHANISM, in the engine's own terms: the anchor overlay writes its
 * shifts into every band from the split DOWN, including bands whose layer
 * authored no deform. So a curve layer below the split becomes curve ∧ deform
 * at RUNTIME, past every per-layer comptime check — and the fill resolves the
 * collision by testing the curve first, silently dropping the anchor's deform
 * on those rows. Refusing the combination is the honest half.
 *
 * ⚠ THE SENTINEL IS THE TRAP, and it is the same top-of-range shape row 60
 * booked for `v_factor`. `15` here means NO DEFORM, so a pure-boundary anchor
 * (`dsa 15, dsb 15`) is not the extreme case — it is the PERMITTED case, and
 * design §2's own: "an anchor split inside a curve layer CONTINUES the curve".
 * A check written as "shifts are large" would fire on the composing case and
 * stay silent on the refused one. The condition is `!== the sentinel`, and the
 * sentinel is read from the ANCHOR's own schema bounds rather than a layer's.
 *
 * EITHER shift arms it, matching the engine's `if dsa != 15 { … } if dsb != 15 { … }`
 * over one flag — not both, which would miss `dsa 15 / dsb 2`, the shape the
 * game's own `ojz_act1_start` already ships.
 */
export function curveAnchorDeformAdvisory(scene: EffectsScene): string | null {
  const anchor = scene.anchor;
  if (anchor === undefined || anchor === 'none') return null;
  const offA = EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max;
  const offB = EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max;
  if (anchor.at.dsa === offA && anchor.at.dsb === offB) return null;
  const curveLayer = scene.layers.findIndex((l) => curveFieldValue(l) !== 'none');
  if (curveLayer < 0) return null;
  return `layer ${curveLayer} authors a curve while this scene's anchor carries live deform `
    + `shifts (anchor dsa ${anchor.at.dsa} / dsb ${anchor.at.dsb}; ${offA} is the no-deform `
    + 'sentinel) — the anchor writes those shifts into every strip below the split, including '
    + 'that one, so it would be curve and deform at once and the build refuses the pair. Take '
    + `both anchor shifts to ${offA}, which composes with curves, or drop the curve.`;
}

// ---------------------------------------------------------------------------
// left_column_mask — the policy `v_deform` makes MANDATORY
// ---------------------------------------------------------------------------
//
// WHY THIS IS PART OF THE DEFORM PARCEL AND NOT A LATER ONE. The `v_deform`
// control above can author a scene aeon's build REFUSES, with no in-app remedy —
// the ROADMAP item 35 defect class, shipped knowingly. aeon's own poison suite
// pins the refusal (`tools/emp_expect_fail.py`, `poison_scene_lcm_undeclared.emp`,
// count 1), so it is load-bearing, not a style note.
//
// THE GUARD IS MUTUAL (aeon engine/level/scene_dsl.emp, P3 Task 12):
//
//   (1) :1288  v_deform on  + policy undeclared -> REFUSED
//   (2) :1293  v_deform off + policy declared   -> REFUSED ("adjudicates an
//              artifact that cannot occur")
//
// So the control cannot merely APPEAR when `v_deform` is set: turning `v_deform`
// off must take the policy back to undeclared in the SAME gesture, which is
// `vDeformToggleCommand` below.
//
// AND THE VALUES ARE NOT A FLAT ENUM — three of the four carry preconditions,
// transcribed here from the guards themselves:
//
//   accept        always legal. The engine's own message calls it "a real
//                 answer, it is what this game's Rocking and Perspective
//                 families do", so it is presented as an answer and not a
//                 fallback.
//   factor0_lock  a VERIFIED CLAIM, both halves or not at all:
//                   half one (:1310) every real layer's `fb` is FACTOR_0
//                     ($0FF). The engine's scan covers DORMANT layers too —
//                     a disabled band inherits the previous band's scroll
//                     words — so `enabled` is deliberately not consulted.
//                   half two (:1347) no live plane-B amplitude WITH a table
//                     that can reach the plane: `dsb != 15` on any layer (an
//                     own() layer's `shift_b` IS that layer's dsb — layer()
//                     folds it at :558) or on the anchor, AND either
//                     `deform_bg` or any layer's own() table (an own table
//                     serves BOTH planes).
//   sprite_mask   REFUSED OUTRIGHT (:1354) until the engine's left-column strip
//                 emission lands. Aurora's schema still admits the value, so
//                 this is a live schema-vs-engine divergence and not a UI
//                 preference.
//   undeclared    the required value when there is no `v_deform`.
//
// ═══ TWO DESIGN FORKS, AND WHY THEY GO DIFFERENT WAYS ═══
//
// `sprite_mask` IS DISABLED IN THE PICKER. `factor0_lock` IS NOT, even when its
// precondition fails. That asymmetry is principled, and the principle is
// scene.ts's: "the editor let me save a file the build rejects" is bad, but "the
// editor refused a file the build accepts" is FAR WORSE.
//
//   • No scene content can make `sprite_mask` legal — the engine refuses it
//     unconditionally — so disabling it cannot produce the worse failure.
//   • `factor0_lock`'s precondition is about the scene's own contents and
//     Aurora's evaluation of it is deliberately STRICTER than the engine's (see
//     `layerFbIsZero`), so disabling it on a failed precondition WOULD produce
//     the worse failure. It stays selectable and the row advises.
//
// The option is rendered either way, disabled or not, so a value already in the
// file is always DISPLAYED. A `<select>` whose current value has no option shows
// the first one instead, which is a quiet lie about what the build will read —
// the same failure `unassignableSceneRef` exists to stop for `sceneRef`.

/** The row's wording, and the one hint under it. */
export const LEFT_COLUMN_MASK_ROW = Object.freeze({
  key: 'left_column_mask' as const,
  label: 'Left col',
  title: 'left_column_mask — how this scene answers for the leftmost partial column, '
    + 'which per-column V scroll renders at a scroll the program never wrote',
  hint: 'per-column V scroll needs this answered; the build refuses a scene that leaves it open',
});

/**
 * Is a layer's Plane-B factor provably `FACTOR_0`?
 *
 * CONSERVATIVE, AND IN THE SAFE DIRECTION — this is the load-bearing sentence of
 * the whole precondition. The engine tests the PACKED BYTE (`ly_fb != $0FF`);
 * Aurora holds a factor as either a published `FACTOR_*` name or a `{s1,s2,op}`
 * triple, and it has no packer — deriving one would put a second copy of the
 * engine's 9-bit encoding in this repo, free to drift from the one that counts.
 *
 * So a packed triple answers **false**: not "this is not FACTOR_0" but "Aurora
 * cannot prove it is". That makes Aurora STRICTER than the engine in exactly one
 * case — `{s1:15, s2:15, op:0}`, which does pack to `$0FF` — and stricter is the
 * direction that cannot hurt: Aurora offers `factor0_lock` less often than it is
 * legal, and the author picks `accept` or hand-authors the policy, which the
 * codec round-trips and this row then DISPLAYS. The opposite slip — Aurora
 * green-lighting a scene the build refuses — is this whole finding repeating one
 * layer up, and it is the one this asymmetry buys off.
 */
function layerFbIsZero(layer: Pick<EffectsLayer, 'fb'>): boolean {
  return layer.fb === EFFECTS_FACTOR_ZERO;
}

/**
 * A layer's EFFECTIVE plane-B deform amplitude — `own`'s `shift_b` when it has
 * one, else its own `dsb`, else the schema default.
 *
 * THE FOLD IS THE ENGINE'S, NOT AN INTERPRETATION: `layer()` computes
 * `eff_dsb = is_own ? own_sb : dsb` and stores THAT in `ly_dsb`
 * (scene_dsl.emp:558), which is the field every amplitude scan in the engine
 * reads — the left-column guard's included. A check here that read `layer.dsb`
 * alone would miss every own() layer, which is most of what this parcel just
 * made authorable.
 */
function effectiveDsb(layer: EffectsLayer): number {
  const own = layerDeformValue(layer);
  if (own !== null) return own.shift_b;
  return layer.dsb ?? EFFECTS_LAYER_DEFAULTS.dsb;
}

/**
 * Why `factor0_lock` is not a claim this scene can make, or null when it is.
 *
 * Both halves of scene_dsl.emp's guard 3, in the engine's own order, each
 * naming the layer that breaks it so the author knows where to look.
 */
export function factor0LockRefusal(scene: EffectsScene): string | null {
  const unlocked = scene.layers.findIndex((l) => !layerFbIsZero(l));
  if (unlocked >= 0) {
    const l = scene.layers[unlocked];
    return `layer ${unlocked}'s Plane B factor is ${factorLabel(l.fb)}, not ${EFFECTS_FACTOR_ZERO}`
      + (typeof l.fb === 'string' ? '' : ' (a custom packed factor: Aurora cannot prove it is locked)')
      + ` — the partial column exists on every line where Plane B scrolls, so the claim is false `
      + 'as authored and the build refuses it.';
  }
  // Half two: a live plane-B amplitude WITH a table that can reach the plane.
  const noSentinel = EFFECTS_LAYER_DEFORM_BOUNDS.shift_b.max;
  const ampLayer = scene.layers.findIndex((l) => effectiveDsb(l) !== noSentinel);
  const anchorDsb = scene.anchor !== undefined && scene.anchor !== 'none'
    ? scene.anchor.at.dsb : noSentinel;
  const amp = ampLayer >= 0 || anchorDsb !== noSentinel;
  const table = sceneDeformValue(scene, 'deform_bg') !== null
    || scene.layers.some((l) => layerDeformValue(l) !== null);
  if (amp && table) {
    return `${ampLayer >= 0 ? `layer ${ampLayer}` : 'the anchor'} has a live Plane B deform `
      + `amplitude (shift ${ampLayer >= 0 ? effectiveDsb(scene.layers[ampLayer]) : anchorDsb}; `
      + `${noSentinel} is the no-sample sentinel) while a table can reach the plane — deform adds `
      + 'per-line Plane B scroll on top of the locked factor, so the sliver comes back on those '
      + 'rows. The build refuses it, conservatively: table contents are invisible at build time, '
      + 'so even an all-zero table counts.';
  }
  return null;
}

export interface LeftColumnMaskOption {
  value: string;
  label: string;
  /** True for a value the ENGINE refuses outright; the picker must not offer it. */
  disabled: boolean;
  /** The engine's reason, for the option's own title. Empty for a plain value. */
  title: string;
}

/**
 * What the policy `<select>` offers, in the schema's own enum order.
 *
 * Every value is rendered — see the section banner: an option missing for a
 * value the FILE carries makes the select show a different value than the build
 * will read.
 */
export function leftColumnMaskOptions(scene: EffectsScene): LeftColumnMaskOption[] {
  const f0 = factor0LockRefusal(scene);
  return EFFECTS_LEFT_COLUMN_MASK_VALUES.map((value) => {
    if (value === 'sprite_mask') {
      return {
        value,
        label: value,
        disabled: true,
        title: 'refused by the engine: the left-column strip emission has not landed, so the '
          + 'declaration would be accepted while the sliver stays uncovered. Declare '
          + 'factor0_lock or accept.',
      };
    }
    if (value === 'factor0_lock') {
      return {
        value,
        label: value,
        // NOT disabled on a failed precondition — see the section banner.
        disabled: false,
        title: f0 === null
          ? 'Plane B provably never H-scrolls, so the partial column cannot exist'
          : `this scene cannot make that claim: ${f0}`,
      };
    }
    if (value === 'accept') {
      return {
        value, label: value, disabled: false,
        title: 'ship the artifact — a real answer, and the one this game\'s Rocking and '
          + 'Perspective families give',
      };
    }
    return {
      value, label: value, disabled: false,
      title: 'no policy declared — legal only while this scene has no per-column V deform',
    };
  });
}

/** The policy this scene declares — absent reads as the schema's own default. */
export function leftColumnMaskValue(scene: Pick<EffectsScene, 'left_column_mask'>): string {
  return scene.left_column_mask ?? EFFECTS_LEFT_COLUMN_MASK_UNDECLARED;
}

/**
 * Should the policy row be on screen at all?
 *
 * WHEN `v_deform` IS ON, obviously — the build demands an answer. But ALSO
 * whenever the document already declares a policy, even with no `v_deform`:
 * that state is refused by guard 2, it is reachable from a hand-edited file,
 * and hiding the row would leave the author staring at an advisory with no
 * control to act on it — which is the exact trap this addition exists to close,
 * rebuilt one field over.
 */
export function leftColumnMaskRowVisible(scene: EffectsScene): boolean {
  return vDeformValue(scene) !== null
    || leftColumnMaskValue(scene) !== EFFECTS_LEFT_COLUMN_MASK_UNDECLARED;
}

/** Set the policy; the schema's default CLEARS the key (setSceneFieldCommand's rule). */
export function leftColumnMaskCommand(
  library: EffectsSceneLibrary, id: string, value: string,
): SetEffectsSceneCommand | null {
  return setSceneFieldCommand(
    library, id, 'left_column_mask',
    value === EFFECTS_LEFT_COLUMN_MASK_UNDECLARED
      ? undefined
      : value as EffectsScene['left_column_mask'],
  );
}

/**
 * Turning `v_deform` on or off — AND, turning it off, clearing the policy with
 * it, in ONE command.
 *
 * TWO KEYS, ONE GESTURE, ONE UNDO STEP. Guard 2 refuses a declared policy on a
 * scene with no per-column V deform, so a toggle that cleared only `v_deform`
 * would leave the document in a state the build refuses — the author having done
 * nothing but turn a feature off. `editSceneCommand` takes a mutator over a whole
 * clone, so a gesture that changes two keys is naturally one command; nothing
 * about the undo stack had to learn anything.
 *
 * TURNING IT *ON* SEEDS NO POLICY, deliberately. Guard 1 demands one, but which
 * one is an engine-visible claim about the scene — `factor0_lock` is a verifiable
 * assertion and `accept` ships a visible artifact — and Aurora picking on the
 * author's behalf would be Aurora answering a design question in a file the
 * author signs. The row appears with the advisory pointing at it instead.
 */
export function vDeformToggleCommand(
  library: EffectsSceneLibrary, id: string, on: boolean,
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Scene ${id} v_deform`, (scene) => {
    const next = vDeformFromToggle(on);
    if (next === undefined) {
      if (!(EFFECTS_SCENE_KEY_DEFAULTS.get('v_deform') === scene.v_deform)) delete scene.v_deform;
      // The policy goes with it — guard 2.
      if (!(EFFECTS_SCENE_KEY_DEFAULTS.get('left_column_mask') === scene.left_column_mask)) {
        delete scene.left_column_mask;
      }
    } else {
      scene.v_deform = next;
    }
  });
}

/**
 * Advice on the policy itself, or null: the scene declares `factor0_lock` and
 * cannot support the claim. The two MUTUAL-gating advisories live in
 * `sceneDeformAdvisories` with the rest of the cross-field set.
 */
export function leftColumnMaskAdvisory(scene: EffectsScene): string | null {
  if (leftColumnMaskValue(scene) !== 'factor0_lock') return null;
  const why = factor0LockRefusal(scene);
  return why === null ? null : `left_column_mask factor0_lock: ${why}`;
}

/**
 * Advice on one layer, or null: `curve` and `deform` on the same strip.
 *
 * REACHABLE FROM TWO CONTROLS THAT NOW SIT FOUR ROWS APART on the same card —
 * the curve picker (parcel H) and the deform toggle (wave 2) — which is the
 * shape a cross-field advisory exists for. The engine refuses the pair twice
 * over: layer() guard 1 (a curve with a live deform amplitude; design §2 forbids
 * curve ∧ deform because the fill's curve loop already spends every usable data
 * register) and guard 2, which names the attachment rather than the amplitude it
 * folded into.
 *
 * ⚠ THIS IS THE PER-LAYER HALF ONLY — `scene_dsl.emp:580` and `:586`. The
 * engine's curve∧deform family has a THIRD member (`:1251`) whose two halves sit
 * on different objects: a curve on a LAYER and live shifts on the SCENE's
 * anchor. Nothing per-layer can see that pair, and it was silent here for a
 * whole parcel because this function looked like it covered "curve and deform"
 * entirely. It lives in `curveAnchorDeformAdvisory`, scene-level.
 */
export function layerCurveDeformAdvisory(layer: EffectsLayer): string | null {
  if (curveFieldValue(layer) === 'none') return null;
  if (layerDeformValue(layer) !== null) {
    return 'this strip authors both a curve and its own deform table — the build forbids '
      + 'curve and deform on one strip (the fill\'s curve loop has no registers left for a '
      + 'sampled channel). Move the deform to another strip, or drop the curve.';
  }
  const off = EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max;
  const dsa = layer.dsa ?? EFFECTS_LAYER_DEFAULTS.dsa;
  const dsb = layer.dsb ?? EFFECTS_LAYER_DEFAULTS.dsb;
  if (dsa === off && dsb === off) return null;
  return `this strip authors a curve and a live deform amplitude (dsa ${dsa} / dsb ${dsb}; `
    + `${off} is the no-deform sentinel) — the build forbids curve and deform on one strip.`;
}

/**
 * Advice on one layer's own attachment, or null: both shifts at the no-sample
 * sentinel is LEGAL — nothing refuses it — and completely silent. That is the
 * state `layerDeformFromToggle` deliberately seeds, so the line saying so is
 * what makes the seed legible rather than a control that appears to do nothing.
 */
export function layerDeformAdvisory(layer: Pick<EffectsLayer, 'deform'>): string | null {
  const own = layerDeformValue(layer);
  if (own === null) return null;
  const off = EFFECTS_LAYER_DEFORM_BOUNDS.shift_a.max;
  if (own.shift_a !== off || own.shift_b !== off) return null;
  return `both shifts are ${off}: the table is attached but neither plane samples it. `
    + 'Lower a shift to give that plane amplitude.';
}

/** Which option is selected for a factor that may be either form. */
export function factorSelectValue(f: EffectsFactor): string {
  return isNamedFactor(f) ? f : CUSTOM_FACTOR_VALUE;
}

/**
 * The factor a dropdown choice means.
 *
 * Picking "Custom packed…" keeps the packed triple already on the field when
 * there is one, and otherwise seeds the identity-ish `{s1: 0, s2: max, op: 0}` —
 * `s2 = 15` is the schema's own "single-term" encoding (§2.3), i.e. the packed
 * spelling closest to "one shift, nothing added", which is what an author
 * switching to custom is almost always about to tune.
 */
export function factorFromSelect(value: string, current: EffectsFactor): EffectsFactor {
  if (value !== CUSTOM_FACTOR_VALUE) return value as EffectsFactor;
  if (!isNamedFactor(current)) return current;
  return { s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.min, s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.max, op: 0 };
}

/**
 * The sentinel a factor `<select>` WITH A NONE STATE uses for "none".
 *
 * Same argument as CUSTOM_FACTOR_VALUE: not a `FACTOR_*` name, and not the
 * custom sentinel either (asserted in the tests). Only the curve picker has a
 * none state — `fa`/`fb` are required and never offer it.
 */
export const NONE_FACTOR_VALUE = '__none__';

/** `factorSelectValue`, for a field that may also be none. */
export function factorFieldSelectValue(f: EffectsFactor | 'none'): string {
  return f === 'none' ? NONE_FACTOR_VALUE : factorSelectValue(f);
}

/**
 * `factorFromSelect`, for a field that may also be none. Picking custom from
 * the none state has no packed triple to keep, so it seeds the same
 * single-term identity a named factor would (`factorFromSelect`'s rule).
 */
export function factorFieldFromSelect(value: string, current: EffectsFactor | 'none'): EffectsFactor | 'none' {
  if (value === NONE_FACTOR_VALUE) return 'none';
  return factorFromSelect(value, current === 'none' ? EFFECTS_FACTOR_NAMES[0] : current);
}

/** Clamp a packed-factor field to the schema's range for it. */
export function clampPackedField(field: 's1' | 's2', value: number): number {
  const { min, max } = EFFECTS_PACKED_FACTOR_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Clamp a layer's `world_y` to the schema's range (§2.2). */
export function clampWorldY(value: number): number {
  const { min, max } = EFFECTS_WORLD_Y_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Which space a layer top is authored in
// ---------------------------------------------------------------------------
//
// Owner feedback 2026-08-26, point 4 ("why max 8 layers if they go well beyond
// the screen?"). Schema §2.2 calls a layer's `world_y` an act-axis coordinate,
// and for an UNLOCKED plane it is: aeon `scene_dsl.emp` `scene_plane_line`
// lowers it to a Plane-B line as `((world_y - v_center) >> v_factor) + v_offset`
// — the same mapping Parallax_Step5_Vscroll applies to the camera. But when
// `v_factor` is the lock sentinel the plane ignores the camera entirely, that
// expression collapses every top onto one line, and the engine's ruling is:
//
//   "For a locked plane the authoring space IS the plane, so the mapping is
//    the identity. EIGHTEEN OF THE TWENTY shipped scenes are that case (tops
//    0/32/80/112/160, which read as screen lines because v_offset is 0)."
//
// Both Aurora scene files are locked. So for every scene that exists a layer
// top is a screen/plane line, and the eight layers divide the visible screen,
// not the act — which is what the owner was asking for. The provider decides
// the space per scene; the panel's label and bound, the drag clamp, the guide
// origin and the guide caption all read it here rather than each re-deriving
// "locked" from `v_factor`.

/** `'screen'`: the top is a plane/screen line. `'act'`: it is a world Y the scene maps. */
export type LayerTopSpace = 'screen' | 'act';

/**
 * The Plane-B vertical span in pixels — the modulus aeon's Step 4a rotates
 * tops in, and the ceiling `scene_plane_line` refuses beyond (`pl < 512`).
 *
 * DERIVED THE WAY AEON DERIVES IT (`parallax.emp`: `PLANE_B_SPAN =
 * PLANE_B_CELL_ROWS * 8`), not typed. Aurora carries no plane-rows constant;
 * the plane is `BG_LAYOUT_WORDS / BG_WIDTH` rows (64x64 nametable words, from
 * the vendored consumer contract) of `TILE_WIDTH_PX` each.
 */
export const PLANE_LINE_SPAN: number = (BG_LAYOUT_WORDS / BG_WIDTH) * TILE_WIDTH_PX;

export function layerTopSpace(scene: Pick<EffectsScene, 'v_factor'>): LayerTopSpace {
  return scene.v_factor === EFFECTS_V_FACTOR_LOCK ? 'screen' : 'act';
}

export interface LayerTopBounds {
  space: LayerTopSpace;
  /** The row label the panel shows for the field. */
  label: 'Screen line' | 'world_y';
  min: number;
  max: number;
}

/**
 * The label and bound for a layer's top in this scene's space.
 *
 * Locked: `0..PLANE_LINE_SPAN-1`, the engine's own ensure. The visible screen
 * is the top 224 of those lines, but the plane is the authoring space (a top
 * below the visible strip is legal and the plane wraps), so the bound is the
 * plane's. Unlocked: the schema's `world_y` range, as before; `planeLineOf`
 * carries the mapped-line advisory for that arm.
 *
 * ⚠ PASS THE LAYER WHENEVER YOU HAVE ONE (2026-08-27). A layer that carries a
 * vsplit becomes a raster fire, and a fire's line must be 3..223 — so ITS bound
 * is narrower than the plane's, and the difference is not cosmetic: the owner
 * produced 303, then 304, then 302 in twenty minutes by DRAGGING a guide, three
 * dead builds, because `canvasYToLayerTop` collapsed to `canvasY / zoom` and
 * nothing on the canvas marked where line 223 was. The clamp's own docblock
 * below has promised since ROADMAP item 37 that "a locked layer cannot be
 * dragged to a line the bake would refuse"; without the layer that promise is
 * false for exactly the layers that can break a build.
 *
 * Omitting the layer keeps the plane's bound, which is the right answer when
 * the caller genuinely does not know which layer it is holding — and it is the
 * LOOSE direction, so a forgetful call site refuses nothing the build accepts.
 */
export function layerTopBounds(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>,
  layer?: Pick<EffectsLayer, 'vsplit'>,
): LayerTopBounds {
  if (layerTopSpace(scene) === 'screen') {
    const plane = { space: 'screen' as const, label: 'Screen line' as const, min: 0, max: PLANE_LINE_SPAN - 1 };
    if (layer === undefined || !layerEmitsFire(layer)) return plane;
    // `line = top - v_offset` must be in 3..223, so `top` is in
    // `3 + v_offset .. 223 + v_offset` — intersected with the plane's own span,
    // because a fire line legal on the screen is still refused by
    // `scene_plane_line` if it falls off the plane.
    const vo = scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT;
    return {
      ...plane,
      min: Math.max(plane.min, EFFECTS_FIRE_LINE_MIN + vo),
      max: Math.min(plane.max, EFFECTS_FIRE_LINE_MAX + vo),
    };
  }
  return {
    space: 'act', label: 'world_y',
    min: EFFECTS_WORLD_Y_BOUNDS.min, max: EFFECTS_WORLD_Y_BOUNDS.max,
  };
}

/**
 * Clamp a layer top to the scene's space. THE CLAMP IS THE BOUND (ROADMAP
 * item 37): the spinner's min/max only style it, and the guide drag routes
 * through this too, so a locked layer cannot be dragged to a line the bake
 * would refuse.
 *
 * ⚠ THIS IS THE ONE PREVENTION IN THIS PARCEL, AND IT IS A NARROW ONE. It bounds
 * a GESTURE and a KEYSTROKE; it does not touch loading, does not touch saving,
 * and does not narrow anything for a layer that emits no fire. A document that
 * ARRIVES holding 303 keeps 303, shows `fireLineAdvisory`, and still saves —
 * ROADMAP row 58's ruling is untouched. What it removes is the ability to
 * ORIGINATE an unauthorable value from a control that gave no sign of a limit.
 */
export function clampLayerTop(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>, value: number,
  layer?: Pick<EffectsLayer, 'vsplit'>,
): number {
  const { min, max } = layerTopBounds(scene, layer);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The Plane-B line a layer top lands on — aeon `scene_plane_line`, transcribed:
 *
 *     locked:   line = world_y
 *     unlocked: line = ((world_y - v_center) >> v_factor) + v_offset
 *
 * with the engine's two `ensure`s returned as ADVISORY HINTS rather than
 * thrown: the panel shows them beside the field so the author learns the bake
 * would refuse before it does. `>>` is deliberate — the runtime is `asr.w`.
 */
export function planeLineOf(
  scene: Pick<EffectsScene, 'v_factor' | 'v_center' | 'v_offset'>, worldY: number,
): { line: number; hint: string | null } {
  const vf = scene.v_factor;
  const vc = scene.v_center ?? EFFECTS_V_CENTER_DEFAULT;
  const vo = scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT;
  const locked = layerTopSpace(scene) === 'screen';
  if (!locked && worldY < vc) {
    return {
      line: ((worldY - vc) >> vf) + vo,
      hint: `world_y ${worldY} is above this scene's v_center ${vc}: the plane never reaches it. `
        + 'Move the top down, or v_center up.',
    };
  }
  const line = locked ? worldY : ((worldY - vc) >> vf) + vo;
  if (line < 0 || line >= PLANE_LINE_SPAN) {
    return {
      line,
      hint: `${locked ? 'line' : `maps to plane line ${line},`} outside the ${PLANE_LINE_SPAN}-px `
        + 'Plane-B span: the engine would wrap it onto another band\'s rows.',
    };
  }
  return { line, hint: null };
}

// ---------------------------------------------------------------------------
// A LAYER THAT BECOMES A RASTER FIRE — the 3..223 bound, and who it is FOR
// ---------------------------------------------------------------------------
//
// The owner's build died with
//
//   [Error] fire: screen line 303 outside 3..223 (lines 0-2 belong to the
//   priming records)
//
// twice (303 and 319), from tops he had set in this panel, which offered him
// 0..511 and no reason to think 303 was different from 112. `layerTopBounds`
// above returns `0..PLANE_LINE_SPAN-1` and IS CORRECT AND STAYS: 511 is the
// Plane-B row span, which is what `scene_plane_line` bounds, and a layer that
// is only a BAND RECORD may legitimately sit anywhere in it.
//
// ⚠ THE BOUND BELOW IS NOT A SECOND OPINION ABOUT THE SAME NUMBER — IT IS ABOUT
// A DIFFERENT SET OF LAYERS. Only SOME layers become raster fires, and only
// those are bounded to 3..223. Blanket-clamping every screen-space top to
// 3..223 would make Aurora refuse scenes the build accepts — `ojz_act1_start`
// ships a top at 160 with no split and would be unaffected, but any locked scene
// wanting a plane row below 223 for a pure band boundary would be refused for a
// rule that does not apply to it.
//
// WHICH LAYERS, MEASURED RATHER THAN GUESSED (aeon, read 2026-08-27):
//
//   - `scene_vsplit_fires()` (engine/level/scene_dsl.emp:2497-2508) walks the
//     scene's real layers and emits one fire per layer for which
//     `scene_vsplit_is_none(l.ly_vsplit) == 0` — and that predicate
//     (scene_dsl.emp:832-837) is a VARIANT test, `None => 1, At(off) => 0`.
//     So the condition is "this layer carries a vsplit attachment", full stop.
//     `At(0)` counts: 0 is a legal scroll value, not a sentinel
//     (scene_dsl.emp:347-349).
//   - The fire itself is `fx_vscroll_split(line, offset)`
//     (engine/effects/raster_dsl.emp:590-592) = `fire(line, [stream_vsram(...)])`,
//     and `fire()` (raster_dsl.emp:326-327) is what carries 3..223.
//   - The generator emits NO raster construct at all: `tools/effects_gen.py`'s
//     `render_module()` writes `scene(...)`/`layer(...)`, the binding, the caps
//     and the witnesses, and nothing else. The one live path from an editor
//     scene to a fire is hand-authored — `games/sonic4/data/effects/
//     ojz_effects.emp:671`, `scene_vsplit_fires(Scene_Editor_ojz_act1_depth)`.
//   - Every OTHER `fire`/`patchable` call site in the aeon tree uses a typed
//     literal line, so no other layer top reaches the bound. `patchable`'s
//     sibling rule (raster_dsl.emp:432) is therefore NOT reachable from the
//     editor path today; when wave 2 lands preset composition it will be, and
//     its bound is the same 3..223, so nothing here would need loosening.
//   - The other scene-side consumer of a top is `scene_band()`
//     (scene_dsl.emp:2566), which produces a BAND RECORD and never a fire.
//     That is the layer this panel's 0..511 belongs to.
//
// THE LINE IS NOT THE TOP. `scene_vsplit_line()` (scene_dsl.emp:2456-2461) is
// `scene_plane_line(s, wy) - v_offset`, and under the lock `scene_plane_line` is
// the identity — so the SCREEN line is `world_y - v_offset`. Both shipped scenes
// have `v_offset: 0`, which is exactly why writing the rule as `3 <= world_y <=
// 223` would have looked right forever and been wrong the first time anyone set
// a `v_offset`.
//
// ⚠ ADVISORY, NOT PREVENTION, and that is ROADMAP row 58's ruling rather than a
// softness: a warned scene still SAVES. So this returns a sentence; it does not
// clamp `world_y`, does not narrow `layerTopBounds`, and does not disable the
// spinner. The author gets the engine's own diagnostic before the build says it.

/** The first and last screen line a raster fire may land on (aeon `fire()`). */
export const EFFECTS_FIRE_LINE_MIN = 3;
export const EFFECTS_FIRE_LINE_MAX = 223;

/**
 * Does this layer lower to a raster fire?
 *
 * The transcription of `scene_vsplit_is_none(l.ly_vsplit) == 0`: a vsplit
 * attachment is present. `vsplitFieldValue` returns the `at` row or null, and
 * `at: 0` is a real split — so the test is against `null`, never falsiness.
 */
export function layerEmitsFire(layer: Pick<EffectsLayer, 'vsplit'>): boolean {
  return vsplitFieldValue(layer) !== null;
}

/** The SCREEN line a locked scene's layer fires on: `world_y - v_offset`. */
export function fireScreenLineOf(
  scene: Pick<EffectsScene, 'v_offset'>, worldY: number,
): number {
  return worldY - (scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT);
}

// ═══ ONE RULE, ONE SENTENCE — the three clauses every surface shares ═══
//
// ⚠ THESE EXIST BECAUSE A SECOND SPELLING IS A DEFECT. The fire bound is now
// reported from THREE places — the panel's hint (`fireLineAdvisory`), the
// canvas plate under a held guide, and the canvas plate under a layer the
// document is already holding out of range (`guideBoundNotice`). An author who
// reads two different sentences about one engine `ensure` has to work out
// whether they are two rules; the owner already lost time to exactly that class
// of confusion on this bound. So the clauses are declared ONCE and composed.
//
// `fireLineAdvisory`'s output is BYTE-IDENTICAL to what it returned before the
// clauses were extracted — this was a refactor, not a rewording, and its tests
// were deliberately left untouched to prove that.

/** What the layer IS, and why the rule applies to it at all. */
const FIRE_IS = 'this layer authors a Plane B split, so it becomes a raster fire';
/** The engine's own `ensure`, in the engine's own numbers (raster_dsl.emp:326-327). */
const FIRE_LAW = `a fire must land on ${EFFECTS_FIRE_LINE_MIN}..${EFFECTS_FIRE_LINE_MAX} `
  + `(lines 0-${EFFECTS_FIRE_LINE_MIN - 1} belong to the priming records)`;
/** The remedy that is about the LAYER rather than about the camera. */
const FIRE_REMEDY = `drop the split — a layer without one may sit anywhere in `
  + `0..${PLANE_LINE_SPAN - 1}`;
/**
 * THE SENTENCE THIS WHOLE PARCEL EXISTS FOR.
 *
 * The owner reported *"layers are still bound to the window view — I can't move
 * that above the orange line"*, twice, at `v_offset` 64 (stuck at 67) and then
 * at 135 (stuck at 138). **His reading was the most reasonable one available
 * from what was on screen**: on a locked scene the screen frame's top edge IS
 * `v_offset` (`frameAnchorFor` / `commitVOffset`), and the fire floor is
 * `EFFECTS_FIRE_LINE_MIN + v_offset` — so the floor really does sit three lines
 * under the box and really does move with it. The correlation he could see was
 * perfect and the cause was invisible.
 *
 * A message that printed only "min 138" would leave that reading intact. This
 * one names the coupling he had already, correctly, noticed.
 */
const FIRE_FLOOR_IS_THE_BOX = (vo: number) =>
  `On a locked scene the view box's top edge IS v_offset (${vo}), so this floor `
  + `sits ${EFFECTS_FIRE_LINE_MIN} lines under the box and moves with it — that is `
  + 'why the guide looks welded to the box';

/**
 * The advisory for a layer whose top cannot exist as a screen line, or null.
 *
 * Null for every layer that emits no fire — see the block above for how "emits a
 * fire" was determined, and why bounding the rest would refuse scenes the build
 * accepts.
 */
export function fireLineAdvisory(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>,
  layer: Pick<EffectsLayer, 'world_y' | 'vsplit'>,
): string | null {
  if (!layerEmitsFire(layer)) return null;
  // An unlocked scene with a split is refused by `scene()` itself, on a
  // different rule and with a different message (the two-writer collision), and
  // a layer top is not what is wrong with it: on that scene NO top has a screen
  // line at all, so this function has nothing true to say about one.
  //
  // ⚠ THIS COMMENT USED TO END "it already has its own advisory" AND THAT WAS
  // FALSE — nothing in Aurora said anything about the combination, so this early
  // return silenced the one message the author would have got, on the strength
  // of a message that did not exist. `vsplitLockAdvisory` is that advisory now;
  // its block below carries the whole account. The early return itself was
  // always right and is unchanged.
  if (layerTopSpace(scene) !== 'screen') return null;
  const line = fireScreenLineOf(scene, layer.world_y);
  if (line >= EFFECTS_FIRE_LINE_MIN && line <= EFFECTS_FIRE_LINE_MAX) return null;
  const vo = scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT;
  const from = vo === 0 ? '' : ` (top ${layer.world_y} less v_offset ${vo})`;
  return `${FIRE_IS} at screen line ${line}${from} — and ${FIRE_LAW}. `
    + `The build refuses it. Move the top onto the visible screen, or ${FIRE_REMEDY}.`;
}

// ---------------------------------------------------------------------------
// THE BOUND, SAID OUT LOUD — the legibility half (2026-08-28)
// ---------------------------------------------------------------------------
//
// ⚠ A CLAMP THAT CANNOT EXPLAIN ITSELF IS INDISTINGUISHABLE FROM A BUG. That is
// not a slogan, it is the incident: `clampLayerTop` shipped doing exactly what
// it promised, the guide stopped exactly where the engine says it must, and the
// owner filed it as a broken editor — because the wall had no label. The clamp
// was the whole of the last parcel's answer to "the author could originate an
// unauthorable value from a control that gave no sign of a limit", and it fixed
// the ORIGINATION and left the NO SIGN OF A LIMIT standing.
//
// ═══ THREE PATHS, ONE RULE, AND THEY DID NOT AGREE ═══
//
//   1. LOADING a document holding an out-of-range top: KEEPS it, advises, saves
//      (ROADMAP row 58's explicit ruling).
//   2. The layer's own CONTROLS (the panel spinner, the canvas guide drag):
//      REFUSE it, via `clampLayerTop` (ROADMAP row 37's "the clamp is the
//      bound") — silently, until now.
//   3. CHANGING `v_offset` (the view-box drag, the arrow keys): *CREATES* an
//      out-of-range top with no comment at all. `setSceneFieldCommand` writes
//      one key and re-checks nothing, so raising `v_offset` lifts the floor PAST
//      an already-placed layer and the document is left holding a top the bake
//      refuses — reached without ever touching the layer. See the hole's own
//      note on `guideBoundNotice` below.
//
// THE RULE THAT RECONCILES THEM, and it is about AUTHORSHIP rather than about
// permissiveness: **the control that OWNS a value refuses to originate an
// illegal one and says why; every other route surfaces it rather than silently
// rewriting or blocking.** Path 2 keeps its clamp and gains a sentence; paths 1
// and 3 both become permit-and-advise, which is what path 1 already was. Two
// behaviours, one line between them, statable in a sentence.
//
// ⚠ THE REJECTED ALTERNATIVE, recorded because it is the tempting one. Making
// path 3 REFUSE — clamping `v_offset` so it can never lift the floor past a
// placed layer — would stop the view box moving because of a layer three lines
// below it. That is a strictly worse spelling of the bug being reported here: an
// invisible wall, on a second control, for a reason even further away. And
// silently dragging the author's layers when the box moves is worse still: it
// rewrites placements the author chose and did not ask about.

/** What `guideBoundNotice` found, or nothing. */
export interface GuideBoundNotice {
  /** 'held' — a gesture asked for this value and was refused it NOW.
   *  'illegal' — no gesture; the document is ALREADY holding an out-of-range top. */
  tone: 'held' | 'illegal';
  /** Which rule did the narrowing: the raster-fire `ensure`, or the Plane-B row span. */
  rule: 'fire' | 'plane';
  /** Which edge was hit ('held' only). */
  edge: 'min' | 'max' | null;
  /** The bound edge the value was held at ('held'), or the offending screen line ('illegal'). */
  limit: number;
  text: string;
}

/**
 * The sentence to put in front of the author about this layer's top, or null.
 *
 * ⚠ IT MUST NOT SPEAK WHEN NOTHING IS WRONG. A guide dragged nowhere near its
 * bound says nothing, and that is a requirement rather than a nicety: an
 * advisory that is always on screen is read as decoration within a day and is
 * then not read at the one moment it matters. The null cases are the majority
 * case and the tests sweep the whole legal band to hold them.
 *
 * `requested` is the raw value a gesture is asking for — pass it during a drag,
 * omit it otherwise. Rounded here, because `canvasYToLayerTop` is fractional and
 * a guide dropped on 66.6 is asking for 67, not for a refusal.
 *
 * THE TWO TONES ARE DIFFERENT EVENTS, not two dressings of one:
 *   - 'held' answers "why did the thing I am dragging stop?" — path 2.
 *   - 'illegal' answers "why is this guide marked, when I never touched it?" —
 *     path 3, the `v_offset` hole, whose whole problem was that nothing asked.
 */
export function guideBoundNotice(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>,
  layer: Pick<EffectsLayer, 'world_y' | 'vsplit'>,
  requested?: number,
): GuideBoundNotice | null {
  const vo = scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT;
  const bound = layerTopBounds(scene, layer);
  const fires = layerEmitsFire(layer) && layerTopSpace(scene) === 'screen';

  if (typeof requested === 'number' && Number.isFinite(requested)) {
    const want = Math.round(requested);
    if (want < bound.min || want > bound.max) {
      const edge = want < bound.min ? 'min' : 'max';
      const limit = edge === 'min' ? bound.min : bound.max;
      // WHICH rule is doing the narrowing, asked of the bounds rather than
      // assumed from the layer: a fire layer at a `v_offset` big enough to push
      // its ceiling past the plane's is held by the PLANE at that edge, and
      // saying "fire" there would send the author to change the wrong field.
      const plane = layerTopBounds(scene);
      const byFire = fires && (edge === 'min' ? bound.min > plane.min : bound.max < plane.max);
      const text = byFire
        ? (edge === 'min'
          ? `held at ${limit}. ${FIRE_IS}, and ${FIRE_LAW}. `
            + `${FIRE_FLOOR_IS_THE_BOX(vo)}. Drag the view box up to lower the floor, or ${FIRE_REMEDY}.`
          : `held at ${limit}. ${FIRE_IS}, and ${FIRE_LAW}. `
            + `With v_offset ${vo} that is rows ${bound.min}..${bound.max} of the plane. `
            + `Drag the view box down to raise the ceiling, or ${FIRE_REMEDY}.`)
        : `held at ${limit}. A layer top is a Plane B row, and the plane is `
          + `${PLANE_LINE_SPAN} rows (0..${PLANE_LINE_SPAN - 1}).`;
      return { tone: 'held', rule: byFire ? 'fire' : 'plane', edge, limit, text };
    }
    return null;
  }

  // NO GESTURE — so the only thing that can be wrong is a top the document is
  // ALREADY holding, which is the `v_offset` hole's whole signature.
  if (!fires) return null;
  const line = fireScreenLineOf(scene, layer.world_y);
  if (line >= EFFECTS_FIRE_LINE_MIN && line <= EFFECTS_FIRE_LINE_MAX) return null;
  // ⚠ NOT `FIRE_FLOOR_IS_THE_BOX` HERE, and the difference is the tense rather
  // than the fact. That clause explains a wall the author is pushing against
  // RIGHT NOW; this one explains damage that has ALREADY happened to a layer the
  // author is not touching. Splicing the two produced a genuine run-on in the
  // first build ("...welded to the box, so MOVING THE BOX MOVED THIS FLOOR..."),
  // which buries the one clause that assigns the cause.
  const text = `top ${layer.world_y} is now screen line ${line} — ${FIRE_IS}, and ${FIRE_LAW}. `
    + `The build refuses it. On a locked scene the view box's top edge IS v_offset (${vo}), `
    + `so MOVING THE BOX MOVED THIS FLOOR and left the layer under it. `
    + `Drag the box back, move the top into ${bound.min}..${bound.max}, or ${FIRE_REMEDY}.`;
  return { tone: 'illegal', rule: 'fire', edge: null, limit: line, text };
}

/**
 * The advisory for a split that does not sit BELOW the split above it, or null.
 *
 * aeon `scene_vsplit_fires()` (engine/level/scene_dsl.emp) walks the layers in
 * order and, for each one carrying a split, ensures `line > prev`:
 *
 *   "layer {i}'s vertical split lands on screen line {line}, which is not below
 *    the previous split's — two whole-plane vertical scroll values for one row.
 *    compose() would merge them into a single fire carrying both writes and the
 *    second would silently win."
 *
 * ⚠ WHY THIS RULE AND NOT THE OTHER ONE. A `== 2` on the vsplit COUNT lives in
 * `games/sonic4/data/effects/ojz_effects.emp` — one scene's game data, whose own
 * comment called itself derived while being a literal. It refused the owner's
 * third split and there is NO engine cap on vsplit count at all. A rule in a
 * game's data file is not an engine rule; every bound this module transcribes is
 * checked to live in `scene_dsl.emp` or `raster_dsl.emp` first. This one does.
 *
 * ⚠ ADVISORY, NEVER A CLAMP. An ordering violation is a fact about TWO layers
 * and there are two ways to resolve it — move either top, or drop either split.
 * A control that picked one silently would be choosing for the author.
 *
 * `prev` starts at -1 in the engine, so the FIRST split can never trip this.
 */
export function vsplitOrderAdvisory(
  scene: Pick<EffectsScene, 'v_factor' | 'v_offset'>,
  layers: readonly Pick<EffectsLayer, 'world_y' | 'vsplit'>[],
  index: number,
): string | null {
  const layer = layers[index];
  if (layer === undefined || !layerEmitsFire(layer)) return null;
  if (layerTopSpace(scene) !== 'screen') return null;
  // The nearest split ABOVE this one in layer order — the engine's `prev`.
  let prevIndex = -1;
  for (let i = index - 1; i >= 0; i--) {
    if (layerEmitsFire(layers[i])) { prevIndex = i; break; }
  }
  if (prevIndex < 0) return null;
  const line = fireScreenLineOf(scene, layer.world_y);
  const prevLine = fireScreenLineOf(scene, layers[prevIndex].world_y);
  if (line > prevLine) return null;
  return `this split lands on screen line ${line}, which is not BELOW layer ${prevIndex}'s `
    + `split at line ${prevLine} — two whole-plane vertical scroll values for one row, and `
    + 'the merged fire would carry both writes with the second silently winning. The build '
    + 'refuses it. Give the two layers different screen lines, or drop one split.';
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO-WRITER RULING, SAID IN THE PANEL — ROADMAP row 80 (2026-08-28)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THE DEFECT WAS A COMMENT ASSERTING A GUARD NOBODY HAD WRITTEN.
// `fireLineAdvisory` carried, from the day it landed, this early return:
//
//     // An unlocked scene with a split is refused by `scene()` itself, on a
//     // different rule and with a different message (the two-writer collision);
//     // it ALREADY HAS ITS OWN ADVISORY, and a layer top is not what is wrong
//     // with it.
//     if (layerTopSpace(scene) !== 'screen') return null;
//
// The early return is correct — a layer top genuinely is not what is wrong with
// that scene. The premise it rests on was not: NOTHING in Aurora said anything
// about the combination. Grepping the whole tree for a second sentence on this
// bound found `canvas/raster-timeline.ts`'s `splitRefusal`, which landed the
// same day and lives in a DIFFERENT collapsible section from the controls that
// originate the fault, and even there it named only one of the engine's two
// remedies and never named the mechanism. So the panel silenced the one message
// the author would have got, on the strength of a message that did not exist,
// and an author could build a document the engine refuses OUTRIGHT with nothing
// on screen saying so. See docs/reviews/2026-08-28-vsplit-advisory.md.
//
// ═══ THE ENGINE'S SIDE, at aeon ea343260c42c961b544f14cede0a8f25a7a7a5fd ═══
//
// `engine/level/scene_dsl.emp:1290` — `scene()` itself:
//
//   ensure(any_vsplit == 0 || v_factor == 15,
//     "scene(): a layer authors vsplit: At(..) while this scene's Plane-B vertical
//      scroll TRACKS THE CAMERA (v_factor {v_factor}; 15 is the lock sentinel).
//      That is the two-writer collision: Parallax_Step5_Vscroll recomputes
//      ((camY - v_center) >> v_factor) + v_offset every VBlank and Vscroll_Write
//      ships it to VSRAM entry 1 at frame top, while the lowered split writes an
//      ABSOLUTE constant to the same word mid-frame. The two do not merely
//      disagree about a value — the split cannot express what the other writer is
//      for: it carries ONE baked scroll value at ONE baked fire line, and that
//      line is derived at comptime from the layer top, which is a screen line
//      only while Vscroll_BG is constant. Lock the plane (v_factor: 15) and
//      author the depth as a split, or express it horizontally (layer(fb:) /
//      curve:), which the walker recomputes every frame")
//
// `engine/level/scene_dsl.emp:2479` — `scene_vsplit_line()`'s backstop, whose
// last clause is the reason this must be an EDITOR message rather than a build
// one: "An authored scene cannot reach this (scene() refuses the combination
// outright); a Scene{{ .. }} literal can, and this is where it stops." The
// author's document takes the AUTHORED path, so the sentence he will eventually
// see is `scene()`'s — at build time, in a terminal, after the fact.
//
// ═══ WHY THE MECHANISM AND NOT THE ILLEGALITY ═══
//
// The precedent is `FIRE_FLOOR_IS_THE_BOX` above. The owner's confusion about
// the fire floor was resolved by a sentence naming the COUPLING he had already
// correctly noticed; "min 138" would have left his wrong model intact. The same
// applies here and harder, because the author's model is not merely incomplete
// — it is that `v_factor` and `vsplit` are two independent fields. TWO WRITERS
// TO ONE WORD is the fact that makes them one field, and no amount of "this is
// refused" gets there.
//
// ═══ WHY BOTH REMEDIES ═══
//
// They are genuinely different products, not two spellings of one fix. Locking
// the plane keeps the depth VERTICAL and gives up camera-tracked vertical
// parallax for the whole scene. Expressing it horizontally keeps the camera
// tracking and moves the depth onto `fb`/`curve`, which the walker recomputes
// every frame. An advisory offering only the first silently narrows what the
// author can build — which is what `splitRefusal` was doing.
//
// ═══ ONE DECLARATION, THREE COMPOSITIONS ═══
//
// Same rule as the fire-bound clauses above: the bound is now reported from the
// LAYER card, the SCENE's v_factor row and the raster timeline strip, and an
// author reading three different sentences about one engine `ensure` has to work
// out whether they are three rules. `canvas/raster-timeline.ts` imports these.
//
// ⚠ ADVISORY, NOT PREVENTION, and deliberately so on BOTH controls. The rule
// "the control that owns a value refuses to originate an illegal one" is real
// and is pending the owner's review (it touches ROADMAP rows 37/58/66), so
// neither the v_factor spinner nor the split select is narrowed here: they still
// originate the combination, the document still keeps it, and it still saves
// (ROADMAP row 58). This parcel makes it VISIBLE, nothing more.

/**
 * What the scene is doing, in the field the author can see.
 *
 * ⚠ SUBJECT-FREE ON PURPOSE. Three surfaces compose this and each already has
 * its own subject ("this layer…", "Layer 3's split…", the v_factor row itself),
 * so a clause that carried "this scene's" would read as a doubled subject in two
 * of the three — which is how a shared clause quietly becomes three clauses.
 */
const VSPLIT_LOCK_SCENE_IS = (vf: number) =>
  `Plane B's vertical scroll TRACKS THE CAMERA (v_factor ${vf}; `
  + `${EFFECTS_V_FACTOR_LOCK} is the lock sentinel)`;

/**
 * THE MECHANISM — the clause this whole parcel exists to put on screen.
 *
 * Transcribed from `scene()`'s own ensure and shortened for a panel hint, but
 * never past the point where it stops being an explanation: the two writers,
 * the one word, and WHY the split cannot stand in for the other writer.
 */
const VSPLIT_LOCK_MECHANISM =
  'Two writers, one word: the parallax step recomputes Plane B\'s vertical scroll every '
  + 'VBlank and ships it at frame top, while the split writes an ABSOLUTE constant to the '
  + 'same word mid-frame. The split cannot express what the other writer is for — it carries '
  + 'ONE baked scroll value at ONE baked fire line, and that line is derived at build time '
  + 'from the layer top, which is a screen line only while the plane\'s scroll is constant.';

/** REMEDY 1 — keep the split; the whole scene gives up camera-tracked vertical scroll. */
const VSPLIT_LOCK_REMEDY_LOCK =
  `lock the plane (v_factor ${EFFECTS_V_FACTOR_LOCK}) and author the depth as a split`;

/** REMEDY 2 — keep the camera tracking; the depth moves onto the horizontal factors. */
const VSPLIT_LOCK_REMEDY_HORIZONTAL =
  'express the depth horizontally instead (the layer\'s Plane B factor, or a Plane B curve), '
  + 'which the walker recomputes every frame';

/** Both remedies, in the engine's own order, as one sentence. */
const VSPLIT_LOCK_REMEDIES =
  `Either ${VSPLIT_LOCK_REMEDY_LOCK}, or ${VSPLIT_LOCK_REMEDY_HORIZONTAL}.`;

/** The clauses, exported so every surface composes the SAME words and no test retypes them. */
export const VSPLIT_LOCK_CLAUSES = Object.freeze({
  sceneIs: VSPLIT_LOCK_SCENE_IS,
  mechanism: VSPLIT_LOCK_MECHANISM,
  remedyLock: VSPLIT_LOCK_REMEDY_LOCK,
  remedyHorizontal: VSPLIT_LOCK_REMEDY_HORIZONTAL,
  remedies: VSPLIT_LOCK_REMEDIES,
});

// ═══════════════════════════════════════════════════════════════════════════
// ║ THE TWO-WRITER RULING'S **SECOND** REFUSAL, WHICH HAD ONE SURFACE       ║
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon's `scene()` carries TWO ensures against a `vsplit`, not one, and they sit
// next to each other in the same block (`engine/level/scene_dsl.emp`, measured
// here at `origin/master` `e81fd349` through git objects):
//
//   ensure(any_vsplit == 0 || v_factor == 15,               …)   ← the lock
//   ensure(any_vsplit == 0 || scene_vdeform_is_none(v_deform) == 1, …)   ← THIS
//
// and the engine's own words for the second one are:
//
//   "in per-column mode (VDP reg $0B bit 2) VSRAM entry 1 is PLANE B OF COLUMN
//    0, not the plane, and Vscroll_Write ships the whole 80-byte column buffer
//    by DMA each frame — so a whole-plane mid-frame write below the line would
//    shift ONE 16-px column of forty and leave the rest where the column buffer
//    put them."
//
// ⚠ AURORA HAD ONE SENTENCE FOR IT AND THREE FOR ITS TWIN, AND THAT ASYMMETRY IS
// THE DEFECT. `sceneDeformAdvisories` said it, in the Deform section — which is
// EXACTLY the position ROADMAP row 80 judged insufficient for the lock half:
// "it was, until row 80, the ONLY thing in Aurora that said anything about this
// combination, in a collapsible section away from the controls that create it".
// Row 80's ruling is not about `v_factor`; it is about where a cross-field
// refusal has to appear. The second refusal simply never had it applied.
//
// SO THESE CLAUSES EXIST FOR ROW 80'S REASON, and the three surfaces that
// compose them are the three that compose `VSPLIT_LOCK_CLAUSES`: the layer card
// that creates the split, the strip that draws it, and the scene-level list.
// One declaration; no surface retypes it; no two can drift apart.

/**
 * What the scene is doing, in the field the author can see.
 *
 * SUBJECT-FREE, `VSPLIT_LOCK_SCENE_IS`'s reason: every surface composing it
 * already has a subject of its own.
 */
const VSPLIT_VDEFORM_SCENE_IS =
  'this scene attaches a per-column V deform table, which puts VSRAM in per-column '
  + 'mode (VDP reg $0B bit 2)';

/**
 * THE MECHANISM, transcribed from the ensure rather than paraphrased.
 *
 * ⚠ THE NUMBER THAT MAKES IT LEGIBLE IS "ONE OF FORTY". A reader told only that
 * "both write the same word" has been told a fact about addressing and nothing
 * about what they will SEE — and what they will see is a 16-pixel sliver moving
 * while the other 39 columns stay put. That is the sentence the old one-liner
 * was missing.
 */
const VSPLIT_VDEFORM_MECHANISM =
  'Two writers, one word — but in per-column mode that word is not the plane. VSRAM entry 1 '
  + 'is PLANE B OF COLUMN 0, the frame-top writer ships the whole 80-byte column buffer every '
  + 'frame, and the split\'s whole-plane write below its line would shift ONE 16-pixel column '
  + 'of forty and leave the other thirty-nine where the column buffer put them.';

/** REMEDY 1 — keep the split; the per-column wobble goes. */
const VSPLIT_VDEFORM_REMEDY_SPLIT =
  'turn V deform off and keep the split as whole-plane vertical depth';

/** REMEDY 2 — keep the wobble; the depth goes onto the horizontal factors. */
const VSPLIT_VDEFORM_REMEDY_VDEFORM =
  'keep V deform and drop the split, expressing the depth horizontally instead (the layer\'s '
  + 'Plane B factor, or a Plane B curve)';

/** Both remedies, as one sentence. The engine's own closing words are the shape. */
const VSPLIT_VDEFORM_REMEDIES =
  `Whole-plane vertical depth and per-column V deform are two spellings of the same VSRAM; `
  + `author one of them. Either ${VSPLIT_VDEFORM_REMEDY_SPLIT}, or `
  + `${VSPLIT_VDEFORM_REMEDY_VDEFORM}.`;

/** The clauses, exported so every surface composes the SAME words and no test retypes them. */
export const VSPLIT_VDEFORM_CLAUSES = Object.freeze({
  sceneIs: VSPLIT_VDEFORM_SCENE_IS,
  mechanism: VSPLIT_VDEFORM_MECHANISM,
  remedySplit: VSPLIT_VDEFORM_REMEDY_SPLIT,
  remedyVDeform: VSPLIT_VDEFORM_REMEDY_VDEFORM,
  remedies: VSPLIT_VDEFORM_REMEDIES,
});

/**
 * The layer card's half: this layer authors a split and this scene has a
 * `v_deform`, so the build refuses the scene — in parts, or null.
 *
 * ⚠ A DIFFERENT EVENT FROM THE SCENE-LEVEL ONE, `sceneVsplitLockAdvisoryParts`'s
 * precedent exactly. This answers "what did turning this split on do?" for the
 * author whose hand is on the vsplit select; `sceneDeformAdvisories` answers
 * "what does this scene now refuse?" for the author who is looking at the deform
 * section. The two routes are taken by different people at different moments and
 * neither one passes through the other's control.
 *
 * Null when the scene has no `v_deform`, and null when this layer has no split.
 */
export function vsplitVDeformAdvisoryParts(
  scene: Pick<EffectsScene, 'v_deform'>,
  layer: Pick<EffectsLayer, 'vsplit'>,
): VsplitLockAdvisoryParts | null {
  if (vDeformValue(scene) === null) return null;
  if (!layerEmitsFire(layer)) return null;
  return {
    diagnosis: `this layer authors a Plane B split while ${VSPLIT_VDEFORM_SCENE_IS} `
      + '— the build refuses this scene.',
    mechanism: VSPLIT_VDEFORM_MECHANISM,
    remedies: VSPLIT_VDEFORM_REMEDIES,
  };
}

/** The layer advisory as one sentence — for surfaces that cannot hold three parts. */
export function vsplitVDeformAdvisory(
  scene: Pick<EffectsScene, 'v_deform'>,
  layer: Pick<EffectsLayer, 'vsplit'>,
): string | null {
  const parts = vsplitVDeformAdvisoryParts(scene, layer);
  return parts === null ? null : joinAdvisory(parts);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SHAPE OF THAT RULING — ROADMAP O15 (2026-08-30)
// ═══════════════════════════════════════════════════════════════════════════
//
// Row 80 put the right words on screen and made them 21 wrapped lines, ~460px
// of a ~1010px panel, which pushed `V center`, `V offset`, `Transition`,
// `Deform fg` and `Deform bg` below the fold — measured off
// `scratchpad/shots-o15/before-1920x1080-panel.png` and ruled in
// `docs/reviews/2026-08-30-o15-advisory-shape.md`. The content is not in
// question; the shape is.
//
// ⚠ THE SPLIT IS SEMANTIC AND MUST STAY THAT WAY. The three parts do three
// different jobs — DIAGNOSIS ("what is wrong, and on the scene surface WHICH
// layers"), MECHANISM ("why"), REMEDIES ("what to do next") — and the remedies
// are LAST in the composed sentence. So any length-based truncation, any "show
// more" that slices at a character count, hides precisely the part an author
// acts on and keeps the part they can skip. That is why the parts are returned
// SEPARATELY ADDRESSABLE from here rather than a finished sentence being cut up
// by whoever renders it: a downstream `slice()` cannot be told which half is
// actionable, and would be re-derived (wrongly) at every call site.
//
// The composed strings below are UNCHANGED, byte for byte — `joinAdvisory` is
// the three parts joined by single spaces, which is exactly what the two
// functions used to build inline. Every existing consumer (the tests, and
// `canvas/raster-timeline.ts` through `VSPLIT_LOCK_CLAUSES`) keeps reading the
// same words.

/**
 * The two-writer advisory, in the three parts that are doing three jobs.
 *
 * ⚠ `diagnosis` and `remedies` are the halves an author ACTS on and must be on
 * screen without a click. `mechanism` is the explanation and is the bulk of the
 * height; a surface may put it behind a disclosure. A surface that hides
 * `remedies` has inverted the ruling.
 */
export interface VsplitLockAdvisoryParts {
  /** What is wrong — and, on the scene surface, which layers. Never hidden. */
  diagnosis: string;
  /** Why, in the engine's own terms. The part a disclosure may hold. */
  mechanism: string;
  /** What to do next, both remedies. Never hidden. */
  remedies: string;
}

/** The three parts as one sentence — the pre-O15 wording, unchanged. */
export function joinAdvisory(parts: VsplitLockAdvisoryParts): string {
  return `${parts.diagnosis} ${parts.mechanism} ${parts.remedies}`;
}

/**
 * The advisory for THIS LAYER's split on a camera-tracked scene, in parts, or null.
 *
 * The subject is the LAYER, because this is what the layer card renders and the
 * author reached it by turning THIS split on. Null for every layer without a
 * split, and null on a locked scene — where the split is legal and the fire
 * rules (`fireLineAdvisory`, `vsplitOrderAdvisory`) take over.
 *
 * ⚠ IT MUST STAY SILENT ON A LOCKED SCENE, and that is this parcel's own worst
 * trap rather than a nicety: every scene that ships is locked, so a null return
 * is the majority case AND is exactly what a completely broken implementation
 * produces. Nothing here can be believed without a locked control beside it.
 */
export function vsplitLockAdvisoryParts(
  scene: Pick<EffectsScene, 'v_factor'>,
  layer: Pick<EffectsLayer, 'vsplit'>,
): VsplitLockAdvisoryParts | null {
  if (!layerEmitsFire(layer)) return null;
  if (layerTopSpace(scene) === 'screen') return null;
  return {
    diagnosis: `this layer authors a Plane B split while ${VSPLIT_LOCK_SCENE_IS(scene.v_factor)} — `
      + 'the build refuses the WHOLE SCENE, not just this layer.',
    mechanism: VSPLIT_LOCK_MECHANISM,
    remedies: VSPLIT_LOCK_REMEDIES,
  };
}

/** The layer advisory as one sentence — for surfaces that cannot hold three parts. */
export function vsplitLockAdvisory(
  scene: Pick<EffectsScene, 'v_factor'>,
  layer: Pick<EffectsLayer, 'vsplit'>,
): string | null {
  const parts = vsplitLockAdvisoryParts(scene, layer);
  return parts === null ? null : joinAdvisory(parts);
}

/**
 * The same rule with the SCENE as its subject, for the `v_factor` row, in parts,
 * or null.
 *
 * ⚠ A DIFFERENT EVENT, NOT A SECOND DRESSING — the `guideBoundNotice` precedent.
 * The layer-card sentence answers "what did turning this split on do?"; this one
 * answers "what did moving v_factor off the lock do?", and the author who took
 * that route never touched a layer. It is also the only surface that can name
 * WHICH layers are now illegal, which is the fact that route destroys — and that
 * naming lives in `diagnosis`, which is why `diagnosis` is the half that can
 * never be the one behind the disclosure.
 *
 * Null on a locked scene, and null on an unlocked scene carrying no split —
 * unlocked-with-no-split is a perfectly legal scene and the majority of what the
 * engine's parallax exists for.
 */
export function sceneVsplitLockAdvisoryParts(
  scene: Pick<EffectsScene, 'v_factor' | 'layers'>,
): VsplitLockAdvisoryParts | null {
  if (layerTopSpace(scene) === 'screen') return null;
  const guilty = scene.layers.reduce<number[]>(
    (acc, l, i) => (layerEmitsFire(l) ? [...acc, i] : acc), []);
  if (guilty.length === 0) return null;
  const which = guilty.length === 1
    ? `layer ${guilty[0]} authors a Plane B split`
    : `layers ${guilty.join(', ')} author Plane B splits`;
  return {
    diagnosis: `${VSPLIT_LOCK_SCENE_IS(scene.v_factor)}, and ${which} `
      + '— the build refuses this scene.',
    mechanism: VSPLIT_LOCK_MECHANISM,
    remedies: VSPLIT_LOCK_REMEDIES,
  };
}

/** The scene advisory as one sentence — for surfaces that cannot hold three parts. */
export function sceneVsplitLockAdvisory(
  scene: Pick<EffectsScene, 'v_factor' | 'layers'>,
): string | null {
  const parts = sceneVsplitLockAdvisoryParts(scene);
  return parts === null ? null : joinAdvisory(parts);
}

/**
 * "N of M layers (per scene; scenes are assigned per section)" — the cap and
 * its scope, stated where the owner reads the count. M is `EFFECTS_LAYER_COUNT.max`,
 * the schema's own `maxItems` = the engine's `MAX_PARALLAX_BANDS` per SCENE
 * (schema §2.1); a section binds its own scene (§3), so "per what's drawn" is
 * the section, and on a locked scene the layers divide one screen. This
 * docblock said "8" until empyrean `277bc15` raised it to 16 — the function was
 * always derived, so only the sentence describing it was ever wrong.
 */
export function layerCountLine(scene: Pick<EffectsScene, 'layers'>): string {
  return `${scene.layers.length} of ${EFFECTS_LAYER_COUNT.max} layers `
    + '(per scene; scenes are assigned per section)';
}

/**
 * The V-factor row's inline hint — the sentinel's meaning said on the row,
 * not only in a tooltip. A hint under the control rather than in the label:
 * the label column is a fixed width (`column-layout` LABEL_W) and a sentence
 * there would push every control in the section rightward.
 *
 * Deliberately no number here: this line read "a fixed 72px" while LABEL_W was
 * 64, and a comment that restates a constant it already names by symbol can
 * only ever go stale — nothing re-reads a comment to check it.
 */
export function vFactorHint(): string {
  return `${EFFECTS_V_FACTOR_LOCK} = locked (no vertical scroll)`;
}

/**
 * Clamp a scene's `v_factor` to the schema's range.
 *
 * DELIBERATELY NOT A FACTOR PICKER. `v_factor` is a right-shift amount 0..15,
 * not a `$defs/factor` — see EFFECTS_V_FACTOR_BOUNDS. The form offers a spinner
 * over this range and nothing else, because the FACTOR_* names that used to be
 * on offer here are values no engine can consume (ROADMAP item 35).
 */
export function clampVFactor(value: number): number {
  const { min, max } = EFFECTS_V_FACTOR_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Clamp a scene's `v_center` (0..32767) / `v_offset` (-32768..32767, signed) to
 * the schema's range. THE CLAMP IS THE BOUND — `NumberField`'s `min`/`max`
 * only style the spinner and never stop a typed value (ROADMAP item 37), so
 * these are what keep the document inside what aeon's emit accepts.
 *
 * A non-finite value falls to the schema's `default`, not to `min`: for the
 * signed `v_offset`, `min` would be -32768, which is not a sane thing to write
 * into a document.
 *
 * THAT ARM IS NOT THE FIELD'S MID-KEYSTROKE STATE, and this line used to claim
 * it was ("a half-typed '-' in the input"). It was wrong twice over. `NumberField`
 * used to hand on `Number(e.target.value)`, and an `<input type="number">`
 * reports '' — not '-' — for text that is not yet a number, so a half-typed '-'
 * arrived here as `Number('')`, which is **0**: a finite, in-range, silently
 * COMMITTED zero that this branch never saw. `NumberField` now commits nothing
 * at all for text with no number in it (see its docblock), so nothing
 * mid-keystroke reaches this function from the form. What is left for this arm
 * is a value from somewhere else — a drag, a port, a caller's own arithmetic.
 */
function clampSceneField(bounds: { min: number; max: number }, fallback: number, value: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}
export function clampVCenter(value: number): number {
  return clampSceneField(EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_CENTER_DEFAULT, value);
}
export function clampVOffset(value: number): number {
  return clampSceneField(EFFECTS_V_OFFSET_BOUNDS, EFFECTS_V_OFFSET_DEFAULT, value);
}

// ---------------------------------------------------------------------------
// The vertical bob (§2.5) — a ladder in PIXELS, a period in SECONDS, and off as
// a STATE
// ---------------------------------------------------------------------------
//
// ═══ WHY THIS IS NOT TWO SPINNERS ═══
//
// `bob_shift` and `bob_period` are a correct data model and a hostile control.
// Both are INVERSE shifts (bigger number, less motion / slower sway), the
// amplitude's domain has a SIX-VALUE HOLE in it (0 and 9..14 are refused), and
// its off value is 15 — the TOP of the range, while the wire byte's off is 0 at
// the bottom. A spinner over either raw field is wrong in all three ways at once:
// it drags the wrong direction, it drags THROUGH the hole, and its natural
// "minimum" is the one value the engine refuses because it would pack to
// silence. Three decisions follow, and each is answering one of those.
//
// 1. AMPLITUDE IS A CLOSED LADDER SHOWN IN PIXELS, not a number field over the
//    shift. Eight options — 128, 64, 32, 16, 8, 4, 2, 1 px of peak excursion —
//    each carrying the shift it means. The author reads the quantity they are
//    choosing (how far the background moves) instead of an exponent that means
//    the reciprocal of it, and the LIST IS THE GUARD: a `<select>` built from
//    eight enumerated options has no state that can express 0 or 9..14, so the
//    discontinuity is unreachable by dragging, by typing, or by holding a
//    spinner's arrow. This repo's own note on `NumberField` says the same thing
//    from the other side — "`min`/`max` only style the spinner and never stop a
//    typed value" — so a bounded spinner would NOT have made 0 unreachable, only
//    unusual.
//
//    ORDERED SMALLEST SWAY FIRST, which is the shift order REVERSED. A list of
//    magnitudes reads small-to-large in every control an author has ever used,
//    and hiding the inversion is the entire job; ordering by the underlying
//    shift would leak it back into the one place it was being hidden.
//
// 2. PERIOD IS A LADDER SHOWN IN SECONDS, same argument, and it carries the
//    schema's own second hazard: 0 is the FASTEST, not "none". Nine options,
//    ~4.3 s up to ~18 min. Showing 18 minutes in words is also the honest way to
//    say that the top of this ladder is nearly a static background.
//
// 3. OFF IS A SEPARATE STATE, not a ladder position. It has to be: 15 is not at
//    either end of 1..8, it is OUTSIDE it, and folding it in as a ninth entry
//    would rebuild the exact trap — a list whose off position sits next to its
//    loudest setting. A toggle also maps one-to-one onto the thing the document
//    must do, which is OMIT BOTH KEYS: every scene in both trees omits them
//    today, the schema's default IS the sentinel, and a control that wrote
//    `bob_shift: 15` on save would touch every scene file in the tree to say
//    exactly what their silence already said.
//
// Nothing below clamps toward 0, and nothing below can produce 0.

/** The bob rows' labels and titles, in one place so the panel decides only layout. */
export const BOB_ROW = Object.freeze({
  label: 'Bob',
  amplitudeLabel: 'Sway',
  periodLabel: 'Period',
  title: 'bob_shift / bob_period — a scene-level vertical sway of the background plane',
  off: 'none',
  on: 'sway',
  amplitudeTitle: 'bob_shift — peak excursion of the sway, in pixels. The wire field is an '
    + `INVERSE right-shift (${EFFECTS_BOB_SHIFT_LADDER.min} = ${bobPeakPixels(EFFECTS_BOB_SHIFT_LADDER.min)} px, `
    + `${EFFECTS_BOB_SHIFT_LADDER.max} = ${bobPeakPixels(EFFECTS_BOB_SHIFT_LADDER.max)} px); `
    + 'this list shows the pixels.',
  periodTitle: 'bob_period — how long one full sway takes. Also an inverse shift: '
    + `${EFFECTS_BOB_PERIOD_BOUNDS.min} is the FASTEST, ${EFFECTS_BOB_PERIOD_BOUNDS.max} the slowest.`,
  hint: `off writes no key at all (the contract's default is the no-bob sentinel `
    + `${EFFECTS_BOB_SHIFT_NONE}, never 0)`,
});

/** One entry on the amplitude ladder: the wire shift, and what it means on screen. */
export interface BobAmplitudeOption { shift: number; px: number; label: string }

/**
 * The eight amplitudes a scene may bob by, SMALLEST SWAY FIRST.
 *
 * Built from the ladder's own bounds, so it is exactly the legal set — never a
 * range the UI then has to police. `bobShiftRefusal` is asserted over every
 * entry in the tests, which is what makes "the discontinuity is unreachable" a
 * measured claim about this list rather than a claim about the component.
 */
export const BOB_AMPLITUDE_OPTIONS: readonly BobAmplitudeOption[] = Object.freeze((() => {
  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;
  const out: BobAmplitudeOption[] = [];
  // Descending shift == ascending pixels, because the shift is an inverse.
  for (let shift = max; shift >= min; shift -= 1) {
    const px = bobPeakPixels(shift);
    out.push(Object.freeze({ shift, px, label: `${px} px` }));
  }
  return out;
})());

/** One entry on the period ladder. */
export interface BobPeriodOption { period: number; seconds: number; label: string }

/**
 * How long one sway takes, as words. Under a minute reads as seconds with one
 * decimal (the contract's own gloss shape, "about 4.3 s"); past that, minutes,
 * because "1092.3 s" is a number nobody converts in their head and the top of
 * this ladder really is eighteen minutes.
 */
export function bobPeriodLabel(period: number): string {
  const seconds = bobPeriodSeconds(period);
  if (seconds < 60) return `${Math.round(seconds * 10) / 10} s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}

/** The nine sway durations, fastest first — which is also period order. */
export const BOB_PERIOD_OPTIONS: readonly BobPeriodOption[] = Object.freeze((() => {
  const { min, max } = EFFECTS_BOB_PERIOD_BOUNDS;
  const out: BobPeriodOption[] = [];
  for (let period = min; period <= max; period += 1) {
    out.push(Object.freeze({ period, seconds: bobPeriodSeconds(period), label: bobPeriodLabel(period) }));
  }
  return out;
})());

/**
 * The amplitude a freshly-enabled bob takes: THE LADDER'S MIDPOINT, derived.
 *
 * NOT AN END, and both ends are wrong for the same reason from opposite
 * directions. The loudest rung is half the Plane-B span and reads on screen as a
 * fault rather than a setting; the quietest is one pixel, and a toggle whose ON
 * state produces no visible change is indistinguishable from a toggle that does
 * not work. The midpoint is the only choice that is defensible without knowing
 * the scene, and it is computed from the bounds so a widened ladder re-centres
 * instead of quietly drifting toward an end.
 */
export const BOB_SHIFT_SEED: number = (() => {
  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;
  return Math.round((min + max) / 2);
})();

/** Does this scene sway? Absent and the sentinel both read as no. */
export function bobEnabled(scene: Pick<EffectsScene, 'bob_shift'>): boolean {
  return bobShiftOf(scene) !== null;
}

/** The amplitude the form shows — the seed when the scene does not bob. */
export function bobShiftValue(scene: Pick<EffectsScene, 'bob_shift'>): number {
  return bobShiftOf(scene) ?? BOB_SHIFT_SEED;
}

/**
 * The period the form shows. Falls to the schema's default when absent, which is
 * the FASTEST sway — the field's own inversion, surfaced rather than smoothed.
 */
export function bobPeriodValue(scene: Pick<EffectsScene, 'bob_period'>): number {
  const period = scene.bob_period;
  return typeof period === 'number' ? period : EFFECTS_BOB_PERIOD_DEFAULT;
}

/**
 * Turn the bob on or off — TWO KEYS, ONE GESTURE, ONE UNDO STEP, on
 * `vDeformToggleCommand`'s precedent.
 *
 * OFF DELETES BOTH KEYS rather than writing the sentinel. Three reasons, and the
 * first is the one that decides it: `bob_period` is IGNORED when `bob_shift` is
 * 15, so leaving a period behind on a scene that does not sway leaves a key
 * nothing reads. Second, the schema's default IS the sentinel, so an absent key
 * and `bob_shift: 15` are the same document and the shorter one is the one every
 * scene in both trees already holds — writing 15 on save would put a diff in
 * every scene file to restate their silence. Third, it is scene.ts's model rule
 * ("serialize never writes out a default that was not on disk") as an editing
 * affordance.
 *
 * A FILE THAT SPELLS THE DEFAULT KEEPS ITS SPELLING, exactly as
 * `setSceneFieldCommand` and `vDeformToggleCommand` do: a hand-authored
 * `"bob_shift": 15` is left alone, because deleting it would be Aurora
 * rewriting a line the author chose and did not ask about.
 *
 * ON SEEDS THE AMPLITUDE AND NOT THE PERIOD. The amplitude has no usable default
 * (the schema's is "off"), so one must be chosen — see BOB_SHIFT_SEED. The
 * period's default is a real period, so absent already means something correct,
 * and seeding it would write a key to say what its absence says.
 */
export function bobToggleCommand(
  library: EffectsSceneLibrary, id: string, on: boolean,
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Scene ${id} bob`, (scene) => {
    if (on) {
      scene.bob_shift = BOB_SHIFT_SEED;
      return;
    }
    if (!(EFFECTS_SCENE_KEY_DEFAULTS.get('bob_shift') === scene.bob_shift)) delete scene.bob_shift;
    // The period goes with it: the engine ignores it once the amplitude is off.
    if (!(EFFECTS_SCENE_KEY_DEFAULTS.get('bob_period') === scene.bob_period)) delete scene.bob_period;
  });
}

/**
 * Set the sway amplitude.
 *
 * THROWS ON AN ILLEGAL SHIFT rather than clamping it, and the throw is the
 * point. Clamping is what authors the trap: `Math.min(max, Math.max(min, v))`
 * over 0..15 lands 0 on 1 (the NARROWEST legal sway, for a caller that meant
 * "none") and 15 on 8, and a clamp toward 0 on the raw field is the exact
 * mistake the contract's HAZARD note names. There is no value this function
 * could substitute that is not a guess about intent.
 *
 * IT IS ALSO UNREACHABLE FROM THE FORM — the ladder `<select>` cannot produce an
 * argument that reaches it — so this exists for the caller that does not go
 * through `BOB_AMPLITUDE_OPTIONS`: a port, a paste, a future gesture. Turning
 * the bob off is `bobToggleCommand`, not a shift.
 */
export function setBobShiftCommand(
  library: EffectsSceneLibrary, id: string, shift: number,
): SetEffectsSceneCommand | null {
  const refusal = bobShiftRefusal(shift);
  if (refusal !== null) {
    throw new Error(
      `setBobShiftCommand: refusing to author bob_shift ${shift} — ${refusal} `
      + 'Aurora does not clamp this field: the contract\'s off value is '
      + `${EFFECTS_BOB_SHIFT_NONE} and the wire byte's is 0, so a clamp would silently author `
      + 'one end meaning the other. Use bobToggleCommand to turn the bob off.',
    );
  }
  if (shift === EFFECTS_BOB_SHIFT_NONE) return bobToggleCommand(library, id, false);
  return editSceneCommand(library, id, `Scene ${id} bob_shift`, (scene) => {
    scene.bob_shift = shift;
  });
}

/**
 * Set the sway period.
 *
 * WRITES NOTHING WHEN THE SCENE DOES NOT SWAY. The engine ignores `bob_period`
 * at `bob_shift` 15, so a period on a still scene is a key with no reader — and
 * the period row is not on screen in that state anyway, so reaching here means a
 * caller went round the form.
 *
 * The schema's default is DELETED rather than written, on the same rule as the
 * toggle: absent already means the fastest sway.
 */
export function setBobPeriodCommand(
  library: EffectsSceneLibrary, id: string, period: number,
): SetEffectsSceneCommand | null {
  const { min, max } = EFFECTS_BOB_PERIOD_BOUNDS;
  if (!Number.isInteger(period) || period < min || period > max) {
    throw new Error(
      `setBobPeriodCommand: refusing to author bob_period ${period} — the contract admits `
      + `${min}..${max}, where ${min} is the FASTEST sway and ${max} the slowest.`,
    );
  }
  const existing = library.scenes.find((s) => s.id === id);
  if (existing === undefined || !bobEnabled(existing)) return null;
  return editSceneCommand(library, id, `Scene ${id} bob_period`, (scene) => {
    if (period === EFFECTS_BOB_PERIOD_DEFAULT) {
      if (!(EFFECTS_SCENE_KEY_DEFAULTS.get('bob_period') === scene.bob_period)) {
        delete scene.bob_period;
      }
      return;
    }
    scene.bob_period = period;
  });
}

/** The bob's one-line readout for a scene: what it does, in pixels and seconds. */
export function bobLine(scene: Pick<EffectsScene, 'bob_shift' | 'bob_period'>): string | null {
  const shift = bobShiftOf(scene);
  if (shift === null) return null;
  return `${bobPeakPixels(shift)} px peak, one sway every ${bobPeriodLabel(bobPeriodValue(scene))}`;
}

// ---------------------------------------------------------------------------
// Scene list
// ---------------------------------------------------------------------------

export interface SceneListEntry {
  id: string;
  /** `name` when the document has one, else the id — never an empty row. */
  label: string;
  layers: number;
}

export function sceneListEntries(library: EffectsSceneLibrary): SceneListEntry[] {
  return library.scenes.map((s) => ({
    id: s.id,
    label: (typeof s.name === 'string' && s.name !== '') ? s.name : s.id,
    layers: s.layers.length,
  }));
}

/**
 * The scene a selected id resolves to — id if it still exists, else the first
 * scene, else nothing.
 *
 * LIFTED OUT OF THE PANEL VERBATIM (ROADMAP item 43). This was one expression
 * inside EffectsScenePanel and its fallback is load-bearing: undoing a create,
 * or opening a different project, leaves a stale id in the selection, and
 * without the fallback the whole editor below it would vanish rather than land
 * on the scene that IS there.
 *
 * It is a function now because there are two readers. The panel draws the form;
 * MapViewport draws that scene's layers as world-Y guides. If they resolved a
 * stale id differently — one falling back, one showing nothing — the canvas
 * would be editing a scene the panel is not, which is worse than either
 * behaviour alone.
 */
export function resolveSelectedScene(
  library: EffectsSceneLibrary, selectedId: string | null,
): EffectsScene | null {
  return library.scenes.find((s) => s.id === selectedId) ?? library.scenes[0] ?? null;
}

/**
 * The `sceneRef` dropdown for one section: the act default plus every LOADED
 * scene.
 *
 * Unreadable scenes are deliberately absent — assigning a section to a file
 * Aurora could not read would write a ref the build then cannot resolve. They are
 * not silent, though: the load already raised a notice per file, and
 * `unassignableSceneRef` below reports a section already pointing at one.
 */
export function sceneRefOptions(library: EffectsSceneLibrary): FactorOption[] {
  return [
    { value: '', label: 'Act default' },
    ...sceneListEntries(library).map((e) => ({ value: e.id, label: e.label })),
  ];
}

/**
 * A warning for a section whose `sceneRef` names nothing this project can offer,
 * or null.
 *
 * REACHABLE WITHOUT ANY BUG: the sidecar is hand-editable and aeon's generator
 * writes it too, so a ref can name a scene that was deleted, renamed, or is
 * sitting in `unreadable`. Showing the ref as "Act default" (what a plain
 * `<select>` does with an unknown value) would be a quiet lie about what the
 * build will use.
 */
export function unassignableSceneRef(
  library: EffectsSceneLibrary, sceneRef: string | null,
): string | null {
  if (sceneRef === null) return null;
  if (library.scenes.some((s) => s.id === sceneRef)) return null;
  if (library.unreadable.some((u) => u.path.endsWith(`/${sceneRef}.json`))) {
    return `Assigned to "${sceneRef}", whose file exists but could not be read.`;
  }
  return `Assigned to "${sceneRef}", which is not a scene in this project.`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Assign (or clear) one section's `sceneRef`. `''` from a select = act default. */
export function sectionSceneCommand(
  sectionIndex: number, currentRef: string | null, value: string,
): SetSectionSceneCommand | null {
  const newRef = value === '' ? null : value;
  if (newRef === currentRef) return null;
  return {
    type: 'set-section-scene',
    description: `Section ${sectionIndex} scene`,
    sectionIndex,
    oldRef: currentRef,
    newRef,
  };
}

function sceneCommand(
  sceneId: string, description: string,
  oldScene: EffectsScene | null, newScene: EffectsScene | null,
): SetEffectsSceneCommand {
  return {
    type: 'set-effects-scene',
    description,
    // -1: act-ambient. See the command's docblock.
    sectionIndex: -1,
    sceneId,
    oldScene: oldScene && cloneEffectsScene(oldScene),
    newScene: newScene && cloneEffectsScene(newScene),
  };
}

/**
 * Create a new scene, or explain why not.
 *
 * A DISCRIMINATED RESULT rather than `null`-for-both: the two failures need
 * different things from the author (fix the id / pick another) and a bare null
 * would make the button do nothing with no reason on screen. `sceneIdRefusal`
 * owns the wording so the UI and the agent tool cannot describe the rule
 * differently.
 */
export type CreateSceneResult =
  | { ok: true; command: SetEffectsSceneCommand }
  | { ok: false; reason: string };

export function createSceneCommand(
  library: EffectsSceneLibrary, id: string, name?: string,
): CreateSceneResult {
  const refusal = sceneIdRefusal(id, library);
  if (refusal) return { ok: false, reason: refusal };
  return {
    ok: true,
    command: sceneCommand(id, `New scene ${id}`, null, newEffectsScene(id, name)),
  };
}

/** Delete a scene. Null when there is no such scene to delete. */
export function deleteSceneCommand(
  library: EffectsSceneLibrary, id: string,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  return sceneCommand(id, `Delete scene ${id}`, existing, null);
}

/**
 * Put a WHOLE scene document at `id`, creating or replacing.
 *
 * The agent surface's shape rather than the form's: a caller that already has a
 * complete document (`set_effects_scene` takes one, because a field-patch API
 * would need the field enumeration this format is handled without). Null when the
 * document is byte-identical to what is already there, so a re-send is not an
 * undo step.
 *
 * It does NOT check the id rules — a REPLACE of an existing scene must not be
 * refused for an id that is obviously already in use, and a CREATE's extra
 * question (is this id taken by an unreadable file?) belongs to the caller, which
 * is the only party that knows which of the two it is doing.
 */
export function replaceSceneCommand(
  library: EffectsSceneLibrary, id: string, scene: EffectsScene,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id) ?? null;
  if (existing && JSON.stringify(existing) === JSON.stringify(scene)) return null;
  return sceneCommand(id, existing ? `Replace scene ${id}` : `New scene ${id}`, existing, scene);
}

/**
 * THE ONE EDIT PATH. Every form control on this surface goes through it: clone
 * the scene, let `mutate` change whatever it likes, and emit a whole-document
 * swap — or null when nothing actually moved.
 *
 * A mutator over a clone rather than a `{ field, value }` delta, for the reason
 * the codec states about itself: a delta API would need a field enumeration, and
 * the whole point of this format's handling is that no such list exists. It also
 * means a single gesture that changes three things is naturally one command.
 *
 * The no-op check is a JSON comparison of the whole document. That is honest
 * about what "changed" means here (any key, at any depth, including ones no form
 * shows) and is cheap: a scene is at most `EFFECTS_LAYER_COUNT.max` layers of
 * scalars.
 */
export function editSceneCommand(
  library: EffectsSceneLibrary, id: string, description: string,
  mutate: (scene: EffectsScene) => void,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  const next = cloneEffectsScene(existing);
  mutate(next);
  if (JSON.stringify(next) === JSON.stringify(existing)) return null;
  return sceneCommand(id, description, existing, next);
}

/** Add a layer below the last one. Null at the schema's ceiling. */
export function addLayerCommand(
  library: EffectsSceneLibrary, id: string,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing || existing.layers.length >= EFFECTS_LAYER_COUNT.max) return null;
  return editSceneCommand(library, id, `Add layer to ${id}`, (scene) => {
    const last = scene.layers[scene.layers.length - 1];
    // A band below the last one, at a `world_y` that is still in range even when
    // the last layer already sits at the ceiling.
    scene.layers.push(newEffectsLayer(clampWorldY(last.world_y + 32), last));
  });
}

/** Remove one layer. Null at the schema's floor (a scene needs >= 1 layer). */
export function removeLayerCommand(
  library: EffectsSceneLibrary, id: string, index: number,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (!existing) return null;
  if (existing.layers.length <= EFFECTS_LAYER_COUNT.min) return null;
  if (index < 0 || index >= existing.layers.length) return null;
  return editSceneCommand(library, id, `Remove layer ${index} from ${id}`, (scene) => {
    scene.layers.splice(index, 1);
  });
}

/**
 * The layer keys the card has a control for. `curve`/`vsplit` are parcel H,
 * `deform` is wave 2, `drift` is EW-DRIFT-CTL, `rowRemap` is EW-9-ROWREMAP-CONTROL.
 */
export type LayerCardKey =
  | 'world_y' | 'fa' | 'fb' | 'curve' | 'vsplit' | 'deform' | 'drift' | 'rowRemap';
/** The optional ones, where the control has a "none" state that CLEARS the key. */
export type LayerCardOptionalKey = 'curve' | 'vsplit' | 'deform' | 'drift' | 'rowRemap';

/**
 * Set one field of one layer.
 *
 * For `curve` / `vsplit` / `deform`, `undefined` means the control's "none"
 * state, and it DELETES the key rather than writing `"none"` — the same rule
 * setSceneFieldCommand states: the schema's default for all three is `"none"`,
 * so an absent key already means it, and writing the word would turn a file that
 * never carried the key into a diff (§6 hazard 1, from the other side).
 *
 * A layer whose file spells the key as an explicit `"none"` is LEFT AS SPELLED
 * on clear: it already means none, so the gesture is a no-op (null, no undo
 * slot), and the spelling on disk survives the next write untouched. Only a
 * SET key is ever rewritten.
 *
 * WHICH KEYS THOSE ARE IS DERIVED (`EFFECTS_LAYER_KEY_DEFAULTS`), not listed. It
 * was a hand-written pair here until wave 2 made it a trio, which is one
 * revision short of the drift every constant in `scene-ui` exists to stop: the
 * rule is "the value equals this key's own schema default", and that is a
 * question the schema answers.
 */
export function setLayerFieldCommand<K extends LayerCardKey>(
  library: EffectsSceneLibrary, id: string, index: number, field: K,
  value: K extends LayerCardOptionalKey ? EffectsLayer[K] | undefined : EffectsLayer[K],
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Layer ${index} ${field}`, (scene) => {
    const layer = scene.layers[index];
    if (!layer) return;
    if (value === undefined) {
      // Only a none-defaulted key can be cleared; a required one stays as it was.
      if (EFFECTS_LAYER_KEY_DEFAULTS.has(field)
          && layer[field] !== EFFECTS_LAYER_KEY_DEFAULTS.get(field)) delete layer[field];
      return;
    }
    layer[field] = value as EffectsLayer[K];
  });
}

/** Clamp a layer's `vsplit.at` to the Plane-B row span the schema declares (0..511). */
export function clampVSplitAt(value: number): number {
  const { min, max } = EFFECTS_VSPLIT_AT_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * The scene-level keys the form owns. Wave 2 adds the three deform attachments,
 * which are the first OBJECT-valued fields on this path — every wave-1 caller
 * passed a scalar or a string enum.
 *
 * NOTHING BELOW HAD TO CHANGE FOR THAT, and the reason is worth stating because
 * it is the codec's design paying off one layer up: `editSceneCommand` takes a
 * MUTATOR over a whole clone and diffs the whole document, so the value's shape
 * was never part of the write path. A `{field, value}` delta API — the shape
 * this could easily have been — would have needed a per-field kind here, and
 * that is a field enumeration, which is the one thing this format is handled
 * without.
 */
export type SceneFormKey =
  | 'name' | 'v_factor' | 'v_center' | 'v_offset' | 'transition'
  | 'deform_fg' | 'deform_bg' | 'v_deform' | 'left_column_mask';

/**
 * Set a scene-level field the form owns.
 *
 * `undefined` DELETES the key rather than writing a default. That is the model
 * rule scene.ts states — "parse never fills a default in and serialize never
 * writes one out that was not on disk" — expressed as an editing affordance:
 * clearing `v_center` must return the document to not-having-it, not to having
 * it set to the current default.
 *
 * A key whose schema default is the string `"none"` and whose file spells it
 * that way explicitly is LEFT AS SPELLED, exactly as `setLayerFieldCommand` has
 * always done for a layer's. Wave 1 had no such key at scene level and so had no
 * arm for it; `deform_fg`, `deform_bg` and `v_deform` are three, and without
 * this a scene that hand-authored `"deform_fg": "none"` would silently lose the
 * line the first time an author toggled the row off.
 */
export function setSceneFieldCommand<K extends SceneFormKey>(
  library: EffectsSceneLibrary, id: string, field: K, value: EffectsScene[K] | undefined,
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Scene ${id} ${field}`, (scene) => {
    if (value === undefined) {
      if (EFFECTS_SCENE_KEY_DEFAULTS.has(field)
          && scene[field] === EFFECTS_SCENE_KEY_DEFAULTS.get(field)) return;
      delete scene[field];
    } else scene[field] = value;
  });
}

// ---------------------------------------------------------------------------
// Layer extras — what a layer carries beyond world_y / fa / fb (parcel E)
// ---------------------------------------------------------------------------
//
// The card edits three keys. §2.2 has seven more, and the shipped curved-horizon
// scene USES two of them (`curve.to`, `vsplit.at`) — which is how a file could
// carry the curve the owner was looking at and the UI show nothing setting it.
// This is the read-only answer: one short descriptor per non-default key, in
// schema key order, and NOTHING for a default so a plain layer gets no line.
// `curve` and `vsplit` LEFT this line in parcel H, when they got controls: a
// value the card edits two rows up is not repeated here.
//
// `deform` LEFT IT IN WAVE 2, for the same rule and on the same precedent. What
// is left is exactly the set with no control anywhere on the card: `dsa`, `dsb`,
// `phase` and `enabled` — and the first three of those are the two-sources
// guard's other half, which is now surfaced beside the deform row as advice
// rather than only printed here.

// `drift` JOINED IT AT empyrean 988638f and LEFT IT AT EW-DRIFT-CTL, on the same
// rule and the same precedent: it joined because aeon's generator refused the key
// and a spinner would have originated a value the build rejected for every input;
// it left the moment aeon's emission parcel landed (aeon `ce4dbb7c`) and the card
// grew a real row for it (`LAYER_DRIFT_ROW`). A value the card edits is not
// repeated here.
//
// What is left is exactly the set with no control anywhere on the card: `dsa`,
// `dsb`, `phase` and `enabled`.
//
// THE px/frame RULING OUTLIVED THIS LINE. It used to be the one place the
// decision was visible; it is now the row's own spinner, its title and its
// refusals. See docs/reviews/2026-08-29-drift-codec.md (the codec) and
// docs/reviews/2026-09-02-effects-drift-control.md (the control).

export interface LayerExtra {
  /** The §2.2 key the descriptor is about. */
  key: 'dsa' | 'dsb' | 'phase' | 'enabled';
  /** The descriptor as the card prints it. */
  text: string;
}

/**
 * A deform table as one line of text, in the spelling the schema's generator
 * names use — `sine(8, 64)`, `zero`, `tables/canopy.bin`.
 *
 * EXPORTED since wave 2: it was the read-only extras line's summary of a layer's
 * deform, and that line no longer carries one (see the section banner above).
 * The deform ROWS carry it now instead, on the table sub-form's title, where it
 * is the whole attachment said in the one place a control cannot say it — a
 * `<select>` on the form plus two spinners never spells the call.
 */
export function tableRefLabel(t: EffectsTableRef): string {
  if ('bin' in t) return t.bin;
  switch (t.generator) {
    case 'zero': return 'zero';
    case 'sine': case 'triangle': return `${t.generator}(${t.amplitude}, ${t.period})`;
    case 'v_column_perspective': return `${t.generator}(${t.focal}, ${t.max_offset})`;
    case 'v_column_floor': return `${t.generator}(${t.center}, ${t.max_offset})`;
  }
}

/** Every non-default §2.2 key on a layer that the card has no control for. */
export function layerExtras(layer: EffectsLayer): LayerExtra[] {
  const out: LayerExtra[] = [];
  for (const key of ['dsa', 'dsb', 'phase'] as const) {
    const v = layer[key];
    if (v !== undefined && v !== EFFECTS_LAYER_DEFAULTS[key]) out.push({ key, text: `${key} ${v}` });
  }
  if (layer.enabled === false) out.push({ key: 'enabled', text: 'disabled' });
  return out;
}

/** The extras as one line for the card, or null when there is no line to draw. */
export function layerExtrasLine(layer: EffectsLayer): string | null {
  const extras = layerExtras(layer);
  return extras.length === 0 ? null : extras.map((e) => e.text).join(' · ');
}

/** Everything the scene-level form may offer, in one place for the component. */
export const SCENE_FORM_CHOICES = {
  transition: EFFECTS_TRANSITION_VALUES,
} as const;

export {
  factorLabel, EFFECTS_LAYER_COUNT, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_WORLD_Y_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS, EFFECTS_V_OFFSET_BOUNDS,
  EFFECTS_VSPLIT_AT_BOUNDS,
  EFFECTS_BOB_SHIFT_LADDER, EFFECTS_BOB_SHIFT_NONE, EFFECTS_BOB_PERIOD_BOUNDS,
  bobPeakPixels, bobPeriodSeconds, bobShiftRefusal,
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
  EFFECTS_DEFORM_TABLE_BYTES, EFFECTS_TABLE_REF_FORMS,
  // The drift row's contract half. `driftPxPerFrameRefusal` is what the card
  // hands `NumberField`'s `refuse`, and it is re-exported rather than reimplemented
  // here so the ONE source of the rules stays scene-ui's.
  EFFECTS_DRIFT_RATE_BOUNDS, EFFECTS_DRIFT_PX_BOUNDS, EFFECTS_DRIFT_UNITS_PER_PIXEL,
  driftPxPerFrameRefusal, driftRateToPxPerFrame, driftPxPerFrameToRate, driftRateOf,
  // §2.7's contract half, re-exported for the same reason as drift's above: the
  // ONE source of these rules is scene-ui's, and the panel hands
  // `reelRateWriteRefusal` (not `reelRateRefusal`) to the box's `refuse`,
  // because `uniqueItems` is a property of the array and not of a value.
  // ⚠ NOTE THE UNIT SPLIT ON THIS VERY LINE: the drift bounds above are 1/256
  // px and the reel bounds below are WHOLE px. Nothing converts between them,
  // and there is deliberately no function here that could.
  EFFECTS_REEL_BAND_COUNT, EFFECTS_REEL_RATE_BOUNDS, EFFECTS_REEL_RATE_GUIDANCE,
  EFFECTS_REEL_STRIP_WIDTH_PX, EFFECTS_REEL_COLS_PER_BAND,
  EFFECTS_REEL_X256_SURVIVORS, EFFECTS_REEL_X256_FULLY_CAUGHT,
  reelStripScreenX, reelCycleFrames, reelCycleLabel,
  reelRateRefusal, reelRatesRefusal, reelRateGuidance,
};

// ---------------------------------------------------------------------------
// §2.7 — REELS, the authoring half (EW-REELS-PANEL)
// ---------------------------------------------------------------------------
//
// Five 64-px-wide vertical strips of the BACKGROUND, each scrolling at its own
// signed whole-pixel-per-frame rate. The codec half is EW-REELS-CODEC
// (`docs/reviews/2026-09-04-ew-reels-codec.md`); every constraint below is read
// out of the contract by `scene-ui.ts` §2.7 and nothing here restates one.
//
// ═══ WHY THIS ROW IS SHAPED THE WAY IT IS, HAZARD BY HAZARD ═══
//
// 1. ⚠⚠ THE UNIT COLLISION IS THE WHOLE DESIGN. `reels.rates` is SIGNED WHOLE
//    PIXELS PER FRAME; the layer card directly above this row authors
//    `drift.rate`, which is 1/256 px and goes through `driftPxPerFrameToRate`'s
//    ×256 on the way to the document. Two adjacent rows in one column, two
//    units, and the wrong one emits 768 for an intended 3.
//
//    SO THE REELS WRITE PATH HAS NO CONVERSION IN IT AT ALL. `setReelRateCommand`
//    stores the integer it was handed. There is no `reelPxPerFrameToRate` and
//    there must never be one: the moment this key has a converter, the drift
//    row's converter and this row's converter differ by a factor of 256 and are
//    one autocomplete apart. The absence is asserted BEHAVIOURALLY — the write
//    is the identity over the whole legal span — because a comment saying "do
//    not multiply" is not a gate.
//
//    ⚠ AND THE MISTAKE IS CAUGHT FOR EVERY DOCUMENT, WHICH THE CODEC PACKET
//    THOUGHT IT WAS NOT. §4.1 of that packet names one hole: 0 × 256 is 0, so
//    an all-zero document survives the bound. It does — and it does not survive
//    `uniqueItems`, because five zeroes are not pairwise distinct.
//    `EFFECTS_REEL_X256_FULLY_CAUGHT` is that argument as a computation over
//    the two constraints, and the panel's own defence is one layer earlier: the
//    box refuses out-of-bound values before a command is ever built.
//
// 2. ZERO IS A VALUE AND THE CONTROL MUST NOT TREAT IT AS "UNSET". Unlike
//    `drift.rate` (`not: {const: 0}`), a stationary strip among moving ones is a
//    real authored choice here — so a rate of 0 commits, reads back as 0, and
//    the readout says "stationary", never a blank. What caps it at one strip is
//    `uniqueItems`, which is why the box's refusal is `reelRateWriteRefusal`
//    (the candidate ARRAY) and not `reelRateRefusal` (the value alone). Two
//    neighbouring keys, opposite rulings on the same literal.
//
// 3. SCREEN ORDER IS ARRAY ORDER, SO THE LABEL IS THE SCREEN SPAN. The contract
//    says an editor that sorts `rates` "silently relocates every strip". Nothing
//    here sorts, reorders, filters or normalises: the panel maps the array in
//    place and `setReelRateCommand` replaces exactly one index. There is
//    deliberately NO add/remove/reorder affordance — the length is aeon's
//    `REEL_BAND_COUNT`, which sizes a RAM array and is compiled into a shift.
//    `reelStripLabel` puts `x 0–63` … `x 256–319` in the label column so an
//    array that ever did get reordered is out of order ON SCREEN rather than
//    only in the JSON.
//
// 4. DEBUG TIER, AND THE PANEL IS REQUIRED TO SAY SO. The mechanism's table,
//    proc and on-switch all sit inside `if DEBUG == 1`, so a scene saved with
//    `reels` validates, builds, ships and renders nothing. No JSON keyword can
//    carry that, and the contract's own description says the editor panel must.
//    `REELS_ROW.debug` is the CONTRACT'S SENTENCE (`EFFECTS_REELS_DEBUG_NOTE`),
//    extracted rather than typed, so it cannot drift from the fact and goes
//    loud if aeon ever ships the effect in release.
//
// ⚠ NO CAPABILITY CHECK, AND ITS ABSENCE IS DELIBERATE. There is no `CAP_` bit
// for reels; the contract says "a generator arm must not emit a check that does
// not exist". Do not pattern-match this onto `CAP_BAND_DRIFT`, and note that
// this is the OPPOSITE call from `EFFECTS_ROW_REMAP_CAPABILITY_NOTE` beside it —
// there a real capability exists and is not a function of the document, so it is
// stated as a note; here there is nothing to state.
//
// ⚠ ABSENT IS ABSENT. `"reels": "none"` is REFUSED by the schema — there is no
// `"none"` arm the way `drift`/`curve`/`vsplit`/`rowRemap` have one. Turning the
// row off DELETES the key, and `reelsToggleCommand` is the only writer of that.

/** The reels rows' labels, titles and the two sentences the panel must paint. */
export const REELS_ROW = Object.freeze({
  key: 'reels' as const,
  label: 'Reels',
  title: 'reels — five independently scrolling 64px-wide vertical strips of the BACKGROUND '
    + '(the slot-machine reel). DEBUG BUILDS ONLY: '
    + EFFECTS_REELS_DEBUG_NOTE.short,
  none: 'none',
  on: 'five strips',
  /** Off state: absent is absent, and there is no `"none"` spelling to write. */
  hint: 'off writes no key at all — this key has no "none" spelling, so absent IS off',
  /** The unit, said where the numbers are typed. Hazard 1, on screen. */
  unitHint: 'signed WHOLE pixels per frame, one strip per row, left to right. Not drift\'s '
    + '1/256 px, and nothing on this path converts anything',
  /** THE REQUIRED DISCLOSURE — the contract's own sentence, both lengths. */
  debug: EFFECTS_REELS_DEBUG_NOTE,
  /** The binding rule, always on, so the one-sided advisory's silence is not read as a pass. */
  binding: EFFECTS_REELS_BINDING_NOTE,
});

/**
 * The rates a freshly-enabled `reels` takes — THE SMALLEST DISTINCT POSITIVE
 * WHOLE RATES, one per strip, derived from the band count.
 *
 * ⚠ NOT ZEROES, AND THIS IS THE ONE PLACE THE SEED HAD A WRONG ANSWER
 * AVAILABLE. An all-stationary seed is the natural "neutral" choice and it is
 * wrong twice over: `uniqueItems` REFUSES five equal values, so the document
 * would not even load; and an all-zero `rates` is precisely the shape the codec
 * packet named as the ×256 blind spot, so seeding it would put every new scene
 * in the one state where a unit error is hardest to see.
 *
 * ⚠ NOR ONE VALUE REPEATED, for the first of those reasons alone. Whatever this
 * seed is, it must be pairwise distinct — which is also why it cannot be "the
 * midpoint" the way `BOB_SHIFT_SEED` is: a scalar field can seed a midpoint, a
 * pairwise-distinct array cannot.
 *
 * The RULE is "the smallest distinct positive rates", and the numbers fall out
 * of the band count. Positive and ascending so a new scene reads immediately as
 * five separate strips (a negative rate reverses travel, it does not lift the
 * strip); inside the contract's own useful range so the seed is never a strobe;
 * and every one of those properties is checked here at module load rather than
 * asserted in a comment, because a widened band count would otherwise walk this
 * list off the end of the guidance without a word.
 */
export const REEL_RATE_SEED: readonly number[] = Object.freeze((() => {
  const seed = Array.from({ length: EFFECTS_REEL_BAND_COUNT }, (_, i) => i + 1);
  const refusal = reelRatesRefusal(seed);
  if (refusal !== null) {
    throw new Error(
      `REEL_RATE_SEED ${JSON.stringify(seed)} is not a legal rates array: ${refusal}`,
    );
  }
  const g = EFFECTS_REEL_RATE_GUIDANCE;
  const stray = seed.filter((r) => r === 0 || r < g.min || r > g.max);
  if (stray.length > 0) {
    throw new Error(
      `REEL_RATE_SEED ${JSON.stringify(seed)} contains ${JSON.stringify(stray)}, which is `
      + `either stationary or outside the contract's useful range ${g.min}..${g.max}. A new `
      + 'scene must not be born on a rate the contract itself calls a strobe, and must not be '
      + 'born all-stationary — that is the one shape a drift-unit error hides in.',
    );
  }
  return seed;
})());

/** Does this scene carry reels? ABSENT is the only off state; there is no `"none"`. */
export function reelsEnabled(scene: Pick<EffectsScene, 'reels'>): boolean {
  return scene.reels !== undefined;
}

/**
 * The rates the form shows — the document's own array, IN DOCUMENT ORDER, or the
 * seed when the scene carries no reels.
 *
 * ⚠ RETURNED AS-IS. No sort, no copy-and-sort, no normalise. Index `i` is strip
 * `i` is screen X `64i..64i+63`, and the contract's word for an editor that
 * reorders this array is that it "silently relocates every strip".
 */
export function reelRatesValue(scene: Pick<EffectsScene, 'reels'>): readonly number[] {
  return scene.reels === undefined ? REEL_RATE_SEED : scene.reels.rates;
}

/** `x 0–63` … `x 256–319` — the strip's own screen span, as its label. */
export function reelStripLabel(index: number): string {
  const { min, max } = reelStripScreenX(index);
  return `x ${min}–${max}`;
}

/** One box's title: which strip, which pixels, what the number does. */
export function reelStripTitle(index: number, rate: number): string {
  const { min, max } = reelStripScreenX(index);
  return `reels.rates[${index}] — screen X ${min}..${max}, ${EFFECTS_REEL_COLS_PER_BAND} `
    + `column-pairs. SIGNED WHOLE PIXELS PER FRAME (${reelCycleLabel(rate)}); the background `
    + 'scrolls down by this much each frame and a negative rate reverses the travel, it does '
    + 'not lift the strip';
}

/**
 * Why this typed value cannot be written to THIS strip, or null when it can.
 *
 * ⚠ IT ASKS ABOUT THE CANDIDATE ARRAY, NOT THE VALUE. `uniqueItems` is a
 * property of the array, so a rate that is perfectly legal on its own is refused
 * when a sibling strip already scrolls at it — including 0, which is legal
 * exactly once. A box that asked `reelRateRefusal` alone would author a document
 * the codec refuses at load, which is the failure this repo has already paid for
 * on `min`/`max` (EFFECTS-W1 defect 5: bounds on an `<input type="number">` stop
 * no typed value).
 */
export function reelRateWriteRefusal(
  scene: Pick<EffectsScene, 'reels'>, index: number, rate: number,
): string | null {
  const next = reelRatesValue(scene).slice();
  if (index < 0 || index >= next.length) {
    return `strip ${index} does not exist: a scene has exactly ${next.length} reel strips.`;
  }
  next[index] = rate;
  return reelRatesRefusal(next);
}

/**
 * Turn the reels on or off.
 *
 * OFF DELETES THE KEY, and there is nothing else it could do. `reels` has NO
 * `"none"` spelling — `"reels": "none"` is refused by the schema — so unlike
 * `drift`, `curve`, `vsplit` and `rowRemap`, whose toggles have a `"none"` arm
 * to choose between, absent is the only representation of off. That is
 * `v_deform`'s absent-key precedent, and the contract's reason is that the
 * binding table is generated whole, so "keep" and "off" are the same state for
 * it.
 *
 * ON SEEDS ALL FIVE, because there is no partial state: `minItems`/`maxItems`
 * are both the band count, so the key exists with five rates or it does not
 * exist. See `REEL_RATE_SEED` for why the seed is not zeroes.
 */
export function reelsToggleCommand(
  library: EffectsSceneLibrary, id: string, on: boolean,
): SetEffectsSceneCommand | null {
  return editSceneCommand(library, id, `Scene ${id} reels`, (scene) => {
    if (on) {
      scene.reels = { rates: REEL_RATE_SEED.slice() };
      return;
    }
    delete scene.reels;
  });
}

/**
 * Set ONE strip's rate — in place, at its index.
 *
 * ⚠ THE VALUE IS STORED AS GIVEN. There is no conversion on this path and there
 * must never be one; the neighbouring `drift` row multiplies by 256 on the way
 * to its document and this row does not, which is hazard 1 in one line of code.
 *
 * ⚠ IT REPLACES, IT NEVER SORTS OR REORDERS. Index is screen position.
 *
 * THROWS ON A REFUSED WRITE rather than clamping, on `setBobShiftCommand`'s
 * precedent and for a sharper reason: the two ways to be wrong here are a ×256
 * (which lands far outside the bound) and a duplicate (which is a legal number
 * in an illegal place). A clamp would turn the first into a silently-wrong
 * document at the bound — 127 px/frame for an intended 3 — and there is no
 * substitute at all for the second. Unreachable from the form, which passes
 * `reelRateWriteRefusal` to the box's `refuse`; this is for the caller that does
 * not go through it.
 */
export function setReelRateCommand(
  library: EffectsSceneLibrary, id: string, index: number, rate: number,
): SetEffectsSceneCommand | null {
  const existing = library.scenes.find((s) => s.id === id);
  if (existing === undefined || existing.reels === undefined) return null;
  const refusal = reelRateWriteRefusal(existing, index, rate);
  if (refusal !== null) {
    throw new Error(
      `setReelRateCommand: refusing to author reels.rates[${index}] = ${rate} — ${refusal} `
      + 'Aurora does not clamp this field: the unit is SIGNED WHOLE PIXELS PER FRAME and the '
      + 'likeliest way to land outside the bound is drift.rate\'s x256 export conversion '
      + 'applied here by mistake, so a '
      + 'clamp would author the bound as though it were the intent.',
    );
  }
  return editSceneCommand(library, id, `Scene ${id} reel ${index}`, (scene) => {
    if (scene.reels === undefined) return;
    scene.reels.rates[index] = rate;
  });
}

/**
 * The binding advisory, for the sections this act actually has.
 *
 * ⚠ THIS IS A LOOKUP, NOT A RULE. The refusal is aeon's — its generator keys
 * the association table on the scene's lowered config label, which is unique
 * only for a section bound at `Effects_ResolveParallax`'s rung 1 (an editor
 * `sceneRef`). `advisoryReelsBinding` in the codec is one-sided by construction:
 * it speaks only in the negative case, names aeon as the authority, does not
 * block saving, and says in its own words that its silence is NOT a clearance.
 * Nothing here softens that, and nothing here manufactures a "looks fine" —
 * there is no such return value, on purpose. The panel pairs it with
 * `REELS_ROW.binding`, which is always on, so an absent warning cannot be read
 * as a pass.
 *
 * EMPTY SECTIONS ARE NOT PASSED THROUGH. An act slot with no section binds
 * nothing, and the advisory treats an EMPTY list as "this project has no
 * sections" and stays silent — a different fact from "no section binds this
 * scene", and warning on the first is the loud-on-nothing failure that trains
 * people to ignore a channel. Dropping the nulls is what keeps an act of empty
 * slots in the first case rather than the second.
 */
export function reelsBindingAdvisories(
  scene: EffectsScene,
  sections: readonly ({ sceneRef?: string | null } | null)[],
): string[] {
  const refs = sections
    .filter((s): s is { sceneRef?: string | null } => s !== null)
    .map((s) => s.sceneRef ?? null);
  return advisoryReelsBinding(scene, refs).map((a) => a.message);
}
