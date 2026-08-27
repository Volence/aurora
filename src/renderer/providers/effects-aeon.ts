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
  type EffectsScene, type EffectsSceneLibrary, type EffectsFactor, type EffectsLayer,
  type EffectsTableRef, type EffectsCurve, type EffectsVSplit,
  type EffectsSceneDeform, type EffectsVDeform, type EffectsLayerDeform,
} from '../../core/formats/effects/scene';
import {
  EFFECTS_FACTOR_NAMES, EFFECTS_PACKED_FACTOR_BOUNDS, EFFECTS_LAYER_COUNT,
  EFFECTS_WORLD_Y_BOUNDS, EFFECTS_V_FACTOR_BOUNDS, EFFECTS_V_CENTER_BOUNDS,
  EFFECTS_V_OFFSET_BOUNDS, EFFECTS_V_CENTER_DEFAULT, EFFECTS_V_OFFSET_DEFAULT,
  EFFECTS_V_FACTOR_LOCK, EFFECTS_VSPLIT_AT_BOUNDS,
  EFFECTS_TABLE_REF_FORMS, EFFECTS_TABLE_REF_BIN_PATTERN, EFFECTS_DEFORM_TABLE_BYTES,
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
  EFFECTS_LEFT_COLUMN_MASK_UNDECLARED, EFFECTS_LEFT_COLUMN_MASK_VALUES, EFFECTS_FACTOR_ZERO,
  EFFECTS_SCENE_KEY_DEFAULTS, EFFECTS_LAYER_KEY_DEFAULTS,
  type TableRefParam,
  EFFECTS_TRANSITION_VALUES,
  cloneEffectsScene, factorLabel, isNamedFactor, newEffectsLayer, newEffectsScene,
  sceneIdRefusal,
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

/** The curve row: label, title, the one hint, and the word for its none state. */
export const LAYER_CURVE_ROW = Object.freeze({
  key: 'curve' as const,
  label: 'Plane B curve to',
  title: 'curve.to — the Plane B factor at this strip\'s bottom; none keeps fb the whole way down',
  hint: "Plane B speed ramps from fb at this strip's top to this value at its bottom",
  none: 'none',
});

/** The vsplit row: label, title (with the schema's bound), hint, and its two states. */
export const LAYER_VSPLIT_ROW = Object.freeze({
  key: 'vsplit' as const,
  label: 'Plane B split at',
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

/**
 * Advice, not enforcement: the engine's layer() guard 4 refuses a curve whose
 * far end equals `fb` ("the ramp's two ends are equal and the emitted HScroll
 * is byte-identical to the flat path"). Equality is by value, so a packed
 * triple spelled twice is caught too.
 */
export function curveAdvisory(layer: Pick<EffectsLayer, 'fb' | 'curve'>): string | null {
  const to = curveFieldValue(layer);
  if (to === 'none') return null;
  if (JSON.stringify(to) !== JSON.stringify(layer.fb)) return null;
  return `curve to ${factorLabel(to)} is the same factor as Plane B — the ramp goes nowhere and the build refuses it`;
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
 * Advice on a table, or null: sigil requires a generator's period to DIVIDE the
 * table length ("period must divide 256", schema doc §2.4), and nothing in the
 * shape validator can see it. Said before the build says it, never enforced.
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
  if (vDeform && vsplitLayer >= 0) {
    out.push(
      `V deform is on and layer ${vsplitLayer} authors a Plane B split — both write the same `
      + 'VSRAM word, and the build refuses the pair. Author one of them.',
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
  const claim = leftColumnMaskAdvisory(scene);
  if (claim !== null) out.push(claim);
  return out;
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
 */
export function layerTopBounds(scene: Pick<EffectsScene, 'v_factor'>): LayerTopBounds {
  if (layerTopSpace(scene) === 'screen') {
    return { space: 'screen', label: 'Screen line', min: 0, max: PLANE_LINE_SPAN - 1 };
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
 */
export function clampLayerTop(scene: Pick<EffectsScene, 'v_factor'>, value: number): number {
  const { min, max } = layerTopBounds(scene);
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
 * the label column is a fixed 72px (`column-layout` LABEL_W) and a sentence
 * there would push every control in the section rightward.
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

/** The layer keys the card has a control for. `curve`/`vsplit` are parcel H, `deform` is wave 2. */
export type LayerCardKey = 'world_y' | 'fa' | 'fb' | 'curve' | 'vsplit' | 'deform';
/** The optional ones, where the control has a "none" state that CLEARS the key. */
export type LayerCardOptionalKey = 'curve' | 'vsplit' | 'deform';

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
  EFFECTS_LAYER_DEFORM_BOUNDS, EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS,
  EFFECTS_DEFORM_TABLE_BYTES, EFFECTS_TABLE_REF_FORMS,
};
