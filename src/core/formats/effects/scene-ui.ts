// What an effects-scene EDITOR is allowed to offer — every constraint read out
// of the committed contract schema at module load, never re-typed beside it.
//
// WHY THIS MODULE EXISTS AT ALL. §2.3's factor set is sixteen names; §2.1's
// `transition` is two; the layer count is a bounded range; `world_y` is
// 0..32767. Those are
// exactly the kind of facts a form types into a `const` array and then holds
// forever, silently, after the contract moves.
// (This paragraph used to say "the layer count is 1..8" and was wrong within
// the day empyrean `277bc15` raised the ceiling to 16 — the sentence explaining
// why numbers must not be typed in had a typed-in number inside it. The code
// below was already right and needed no edit; only the prose was stale, which
// is the perishable-claim-in-a-comment case exactly.) `scene.ts` already established the
// pattern for its three (EFFECTS_SCENE_ID_PATTERN, EFFECTS_LAYER_DEFAULTS,
// EXCLUDED_RAW_FIELDS); this is the rest of the set the wave-1 UI needs, in the
// same shape and for the same reason.
//
// EVERY READ IS LOUD. `at()` throws naming the path it could not walk, so a
// schema amendment that MOVES a constraint fails the module's import — and takes
// the whole test suite with it — rather than quietly yielding `undefined` that a
// dropdown renders as an empty list. A UI constraint that silently becomes "no
// options" is indistinguishable from a UI that has not loaded yet.
//
// NOTHING HERE VALIDATES. Shape validation is `validateAgainstSchema`'s and value
// semantics are sigil's (scene.ts's header states the split). These are the
// affordances a form offers; the codec still refuses anything they let through.

import type { JsonSchema } from './json-schema-subset';
import { EFFECTS_SCENE_SCHEMA, EFFECTS_SCENE_ID_PATTERN } from './scene';
import type { EffectsScene, EffectsFactor, EffectsFactorName, EffectsSceneLibrary } from './scene';

/**
 * Walk the committed schema, throwing with the path when it is not there.
 *
 * EXPORTED so its failure mode is testable. Every constant below is `at(...)` at
 * module load, and the one thing that must never happen is a quiet `undefined`:
 * a dropdown built from `undefined` renders as an empty list, which on screen is
 * indistinguishable from a UI that has not loaded yet. A test that could only
 * check the happy path would be checking the least interesting half.
 */
export function at(...path: (string | number)[]): Record<string, unknown> {
  let node: unknown = EFFECTS_SCENE_SCHEMA as JsonSchema;
  const walked: (string | number)[] = [];
  for (const seg of path) {
    walked.push(seg);
    node = (node as Record<string | number, unknown>)?.[seg];
    if (node === undefined || node === null) {
      throw new Error(
        `effects scene schema has nothing at ${walked.join('.')} — a UI constraint that ` +
        'used to be derivable no longer is; re-derive it against the amended schema.',
      );
    }
  }
  if (typeof node !== 'object') {
    throw new Error(`effects scene schema node ${path.join('.')} is not an object`);
  }
  return node as Record<string, unknown>;
}

function stringEnumAt(...path: (string | number)[]): readonly string[] {
  const value = at(...path).enum;
  if (!Array.isArray(value) || value.length === 0 || value.some(v => typeof v !== 'string')) {
    throw new Error(`effects scene schema ${path.join('.')}.enum is not a non-empty string enum`);
  }
  return Object.freeze(value as string[]);
}

function boundsAt(...path: (string | number)[]): { min: number; max: number } {
  const node = at(...path);
  const { minimum, maximum } = node;
  if (typeof minimum !== 'number' || typeof maximum !== 'number') {
    throw new Error(`effects scene schema ${path.join('.')} has no numeric minimum/maximum`);
  }
  return Object.freeze({ min: minimum, max: maximum });
}

// ---------------------------------------------------------------------------
// §2.3 — the representable factor set
// ---------------------------------------------------------------------------

/**
 * The sixteen published `FACTOR_*` names, in the schema's own order.
 *
 * `$defs.factor` is a `oneOf` whose FIRST branch is the named-string form and
 * whose second is the packed triple; the index is asserted below rather than
 * trusted, because a schema amendment that reordered the branches would silently
 * turn this list into `undefined`.
 */
export const EFFECTS_FACTOR_NAMES: readonly EffectsFactorName[] =
  stringEnumAt('$defs', 'factor', 'oneOf', 0) as readonly EffectsFactorName[];

/** Bounds of the custom packed form `{s1, s2, op}` (§2.3). */
export const EFFECTS_PACKED_FACTOR_BOUNDS = Object.freeze({
  s1: boundsAt('$defs', 'factor', 'oneOf', 1, 'properties', 's1'),
  s2: boundsAt('$defs', 'factor', 'oneOf', 1, 'properties', 's2'),
  /** `op` is an enum, not a range: 0 = add the second term, 1 = subtract it. */
  op: Object.freeze(
    (() => {
      const value = at('$defs', 'factor', 'oneOf', 1, 'properties', 'op').enum;
      if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'number')) {
        throw new Error('effects scene schema $defs.factor packed `op` is not a two-value numeric enum');
      }
      return value as number[];
    })() as readonly number[],
  ),
});

/**
 * The precondition the two constants above rest on: branch 0 is the names,
 * branch 1 is the packed object. Checked at module load, so a reordered `oneOf`
 * is an import-time failure rather than an empty dropdown.
 */
(function assertFactorBranchOrder(): void {
  const named = at('$defs', 'factor', 'oneOf', 0);
  const packed = at('$defs', 'factor', 'oneOf', 1);
  if (named.type !== 'string' || packed.type !== 'object') {
    throw new Error(
      'effects scene schema $defs.factor.oneOf is no longer [string-enum, packed-object]; ' +
      'EFFECTS_FACTOR_NAMES and EFFECTS_PACKED_FACTOR_BOUNDS read those branches by index.',
    );
  }
  const branches = at('$defs', 'factor').oneOf;
  if (!Array.isArray(branches) || branches.length !== 2) {
    throw new Error('effects scene schema $defs.factor.oneOf no longer has exactly two branches');
  }
})();

/** True for one of the published names — i.e. NOT the custom packed form. */
export function isNamedFactor(f: EffectsFactor): f is EffectsFactorName {
  return typeof f === 'string';
}

/** A factor as one line of UI text. `packed(2,4,-)` for the custom form. */
export function factorLabel(f: EffectsFactor): string {
  if (isNamedFactor(f)) return f;
  return `packed(${f.s1}, ${f.s2}, ${f.op === 1 ? '-' : '+'})`;
}

// ---------------------------------------------------------------------------
// §2.1 — scene-level enumerations and bounds
// ---------------------------------------------------------------------------

/*
 * `precision` LIVED HERE, as EFFECTS_PRECISION_VALUES (the schema's own enum)
 * and WAVE1_PRECISION_VALUES (that enum filtered to `"cell"`). Both are gone —
 * ROADMAP row 59, vendored schema blob 0f661b70 → dd972cf0 at empyrean 0bd4753.
 *
 * REMOVED, NOT RESERVED, and the difference is the point. aeon deleted the
 * STORAGE, not just the behaviour: `engine/level/scene_dsl.emp:422-423` records
 * `PRECISION_CELL` / `PRECISION_LINE` and the `Scene.sc_precision` field as
 * having "LIVED HERE until 2026-08-26" (retired with the per-cell HScroll path
 * under owner ruling d-29-corrected — the field's only consumer was arm 4 of the
 * per-line forcer, and with one fill there is nothing to force), and `:1009`
 * records `sc_pad_5D` shrinking `u16 -> u8` to fill the byte it vacated. So
 * there is nothing left to reserve a slot FOR. Contrast `v_factor_fg`, which
 * stays in the schema because the runtime will read it. Owner ruling d-16.
 *
 * AND THE SCHEMA IS CLOSED, so this is not only a missing dropdown: a scene file
 * still carrying `precision` is REFUSED at load rather than silently stripped.
 * That is ruled, the affected population was verified empty, and no tolerant
 * read was added — scene.ts's `precision` note carries the full reasoning.
 *
 * WHAT THIS DELETION IS EVIDENCE OF, worth one line because it is the reason the
 * module is written this way: the read above was `stringEnumAt('properties',
 * 'precision')`, and the moment the key left the vendored schema it THREW at
 * module load —
 *   "effects scene schema has nothing at properties.precision — a UI constraint
 *    that used to be derivable no longer is; re-derive it against the amended
 *    schema."
 * — and took the whole suite with it. That is "EVERY READ IS LOUD" in the header
 * doing its job. A hand-typed `['cell','line']` here would have gone on offering
 * a dead control in silence, which is precisely the defect row 59 exists to fix.
 * The fix was to DELETE the derivation, never to give it a fallback.
 */

/** Everything the schema permits for `transition`, in schema order. */
export const EFFECTS_TRANSITION_VALUES = stringEnumAt('properties', 'transition');

/** Everything the schema permits for `left_column_mask`, in schema order. */
export const EFFECTS_LEFT_COLUMN_MASK_VALUES = stringEnumAt('properties', 'left_column_mask');

/**
 * The `layers` array's item bounds, READ FROM THE SCHEMA — the maximum is the
 * engine's `MAX_PARALLAX_BANDS` (§2.1) and it MOVES: empyrean `277bc15` took it
 * from 8 to 16. Deliberately not restated here as a number, because every
 * surface that shows a ceiling (the Add-layer button's disabled test, the
 * Remove floor, the section title, `layerCountLine`) consumes this constant,
 * so the schema is the single authority and a number in this sentence would be
 * a second one.
 */
export const EFFECTS_LAYER_COUNT = Object.freeze((() => {
  const node = at('properties', 'layers');
  const { minItems, maxItems } = node;
  if (typeof minItems !== 'number' || typeof maxItems !== 'number') {
    throw new Error('effects scene schema properties.layers has no numeric minItems/maxItems');
  }
  return { min: minItems, max: maxItems };
})());

/** `world_y` is an act-axis coordinate, 0..32767 (§2.2). */
export const EFFECTS_WORLD_Y_BOUNDS = boundsAt('$defs', 'layer', 'properties', 'world_y');

/**
 * `vsplit.at` is a PLANE-B ROW, 0..511 (§2.2) — read out of the `oneOf`'s
 * object branch, the same index rule `$defs/factor` uses above (branch 0 is the
 * `"none"` const, branch 1 the `{at}` object). The engine's own guard is
 * `split_off >= 0 && split_off < 512` (aeon engine/level/scene_dsl.emp,
 * `layer()`): VSRAM is read modulo the plane's 512-row height, so a wider or
 * negative value is not a bigger scroll, it is silently one of the rows that
 * already had a spelling. The clamp in the provider is the bound (ROADMAP item
 * 37: a NumberField's min/max only style the spinner).
 */
export const EFFECTS_VSPLIT_AT_BOUNDS =
  boundsAt('$defs', 'layer', 'properties', 'vsplit', 'oneOf', 1, 'properties', 'at');

// ---------------------------------------------------------------------------
// §2.4 — the deform surface (wave 2 authoring)
// ---------------------------------------------------------------------------
//
// `$defs/tableRef`, `$defs/layerDeform`, `$defs/sceneDeform` and `v_deform` are
// all `oneOf`s, and the two constants above reach into a `oneOf` BY INDEX with a
// module-load assertion behind them. Everything below finds its branch BY SHAPE
// instead — `oneOfBranchWith(path, key)` returns the branch that declares a
// property, or throws naming the path. A schema amendment that reorders the
// branches is then simply not an event: index pinning plus an assertion turns a
// harmless reorder into an import failure, where a shape search survives it and
// still fails loudly on a genuine REMOVAL, which is the case that matters.

/** The `oneOf` branch under `path` that declares `key`, as a path `at()` can walk. */
function oneOfBranchWith(path: (string | number)[], key: string): (string | number)[] {
  const branches = at(...path).oneOf;
  if (!Array.isArray(branches)) {
    throw new Error(`effects scene schema ${path.join('.')} is not a oneOf`);
  }
  const index = branches.findIndex((b) => {
    const props = (b as Record<string, unknown> | null)?.properties;
    return typeof props === 'object' && props !== null && key in (props as object);
  });
  if (index < 0) {
    throw new Error(
      `effects scene schema ${path.join('.')}.oneOf has no branch declaring "${key}" — the ` +
      'shape a UI constraint was derived from is gone; re-derive it against the amended schema.',
    );
  }
  return [...path, 'oneOf', index];
}

/**
 * The table length, in bytes, that `$defs/tableRef` describes itself as producing.
 *
 * READ OUT OF THE DESCRIPTION, then CHECKED AGAINST `period`'s `maximum` below —
 * the same two-derivations trick `EFFECTS_V_FACTOR_LOCK` uses for the lock
 * sentinel, and for the same reason. The number is load-bearing twice over: a
 * generator's `period` must DIVIDE it (sigil enforces; schema doc §2.4), which is
 * the advisory the form shows, and one whole cycle over the table is the neutral
 * period a new attachment seeds with. Typing 256 here would make both of those a
 * guess that survives the contract moving.
 */
export const EFFECTS_DEFORM_TABLE_BYTES: number = (() => {
  const description = at('$defs', 'tableRef').description;
  const m = typeof description === 'string' ? /\b(\d+)-byte signed\b/.exec(description) : null;
  if (!m) {
    throw new Error(
      'effects scene schema $defs.tableRef no longer describes itself as an N-byte signed ' +
      'table — the deform table length was derived from that sentence.',
    );
  }
  return Number(m[1]);
})();

/** One parameter of a `tableRef` form: its key and whatever range the schema declares. */
export interface TableRefParam {
  key: string;
  /** `null` when the schema declares no bound (`focal`, `center`, `max_offset`). */
  min: number | null;
  max: number | null;
}

/** One authorable spelling of a `tableRef`: a generator call, or the raw `.bin`. */
export interface TableRefForm {
  /** The generator's name, or `'bin'` for the raw-file branch — the select's value. */
  id: string;
  kind: 'generator' | 'bin';
  /** The form's own parameters, in the schema's `required` order. */
  params: readonly TableRefParam[];
}

/**
 * Every `tableRef` form the schema admits, in schema order.
 *
 * SIX, not the two a form would think to offer: `sine`, `triangle`, `zero`,
 * `v_column_perspective`, `v_column_floor` and the raw `.bin`. Derived from the
 * `oneOf` so a seventh arrives in the dropdown by re-vendoring the schema, and so
 * the parameters and their ranges cannot drift from the branch that declares them.
 */
export const EFFECTS_TABLE_REF_FORMS: readonly TableRefForm[] = Object.freeze((() => {
  const branches = at('$defs', 'tableRef').oneOf;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('effects scene schema $defs.tableRef is not a non-empty oneOf');
  }
  return branches.map((raw, i) => {
    const branch = raw as Record<string, unknown>;
    const props = branch.properties as Record<string, Record<string, unknown>> | undefined;
    const required = Array.isArray(branch.required) ? (branch.required as string[]) : [];
    if (!props) {
      throw new Error(`effects scene schema $defs.tableRef.oneOf[${i}] declares no properties`);
    }
    if ('bin' in props) {
      return Object.freeze({ id: 'bin', kind: 'bin' as const, params: Object.freeze([]) });
    }
    const generator = props.generator?.const;
    if (typeof generator !== 'string') {
      throw new Error(
        `effects scene schema $defs.tableRef.oneOf[${i}] is neither a {bin} branch nor a ` +
        'generator branch with a const name — the tableRef form list was derived from those two shapes.',
      );
    }
    const params = required
      .filter((k) => k !== 'generator')
      .map((k) => {
        const p = props[k];
        if (!p || p.type !== 'integer') {
          throw new Error(
            `effects scene schema $defs.tableRef generator "${generator}" requires "${k}", ` +
            'which is not a declared integer property.',
          );
        }
        return Object.freeze({
          key: k,
          min: typeof p.minimum === 'number' ? p.minimum : null,
          max: typeof p.maximum === 'number' ? p.maximum : null,
        });
      });
    return Object.freeze({ id: generator, kind: 'generator' as const, params: Object.freeze(params) });
  });
})());

/**
 * The precondition `EFFECTS_DEFORM_TABLE_BYTES` rests on: the prose length and
 * `period`'s ceiling are the same number, so "one cycle over the whole table" is
 * a value the schema actually admits. Checked at module load — a schema that
 * decoupled them fails the import instead of quietly seeding an illegal period.
 */
(function assertPeriodSpansTheTable(): void {
  const period = EFFECTS_TABLE_REF_FORMS
    .flatMap((f) => f.params)
    .find((p) => p.key === 'period');
  if (!period || period.max !== EFFECTS_DEFORM_TABLE_BYTES) {
    throw new Error(
      `effects scene schema $defs.tableRef: period's maximum (${period?.max}) is no longer the ` +
      `${EFFECTS_DEFORM_TABLE_BYTES}-byte table length its own description names. One cycle over ` +
      'the whole table was derived from that coupling.',
    );
  }
})();

/** The `.bin` path pattern (`no `..` segments`), read out of the schema. */
export const EFFECTS_TABLE_REF_BIN_PATTERN: RegExp = (() => {
  const branch = at(...oneOfBranchWith(['$defs', 'tableRef'], 'bin'));
  const pattern = (branch.properties as Record<string, Record<string, unknown>>).bin.pattern;
  if (typeof pattern !== 'string') {
    throw new Error('effects scene schema $defs.tableRef {bin} branch declares no string pattern');
  }
  return new RegExp(pattern);
})();

/** `$defs/layerDeform`'s `own` — the three shift-space bounds (§2.2, §2.4). */
export const EFFECTS_LAYER_DEFORM_BOUNDS = Object.freeze({
  shift_a: boundsAt(...oneOfBranchWith(['$defs', 'layerDeform'], 'own'), 'properties', 'own', 'properties', 'shift_a'),
  shift_b: boundsAt(...oneOfBranchWith(['$defs', 'layerDeform'], 'own'), 'properties', 'own', 'properties', 'shift_b'),
  phase: boundsAt(...oneOfBranchWith(['$defs', 'layerDeform'], 'own'), 'properties', 'own', 'properties', 'phase'),
});

/**
 * `anchor.at`'s two deform shifts — the anchor's OWN bounds, not a layer's.
 *
 * A SECOND SHIFT SPACE THAT LOOKS LIKE THE FIRST. The anchor overlay carries
 * `dsa`/`dsb` in the same 0..15 encoding a layer does, with the same top-of-range
 * no-deform sentinel — and because the two numbers agree today, code that wanted
 * the anchor's sentinel has been reading `EFFECTS_LAYER_DEFORM_BOUNDS` for it.
 * That is a coincidence held in place by nothing: the two live in different
 * `$defs` and a contract amendment could move one without the other, at which
 * point the reader silently tests the wrong sentinel and every anchor advisory
 * inverts. Derived from `properties/anchor` itself so it cannot.
 */
export const EFFECTS_ANCHOR_SHIFT_BOUNDS = Object.freeze({
  dsa: boundsAt(...oneOfBranchWith(['properties', 'anchor'], 'at'), 'properties', 'at', 'properties', 'dsa'),
  dsb: boundsAt(...oneOfBranchWith(['properties', 'anchor'], 'at'), 'properties', 'at', 'properties', 'dsb'),
});

/** `v_deform.columns.amp_shift` — 0..15, read out of the schema. */
export const EFFECTS_V_DEFORM_AMP_SHIFT_BOUNDS =
  boundsAt(...oneOfBranchWith(['properties', 'v_deform'], 'columns'), 'properties', 'columns', 'properties', 'amp_shift');

/**
 * Every key that declares a schema `default`, mapped to it — the keys where an
 * ABSENT key and the default spelled out mean the same thing.
 *
 * WHY IT IS DERIVED AND NOT A LIST. This is the rule the write path needs to
 * clear an optional field without turning a file that never carried the key into
 * a diff (scene.ts's model comment, from the other side), and it is the rule
 * that says a default spelled out on disk must be LEFT AS SPELLED. It was a
 * hand-written pair for `curve`/`vsplit`; wave 2's four deform attachments made
 * it a set of six, and the next amendment's members are whatever it declares.
 *
 * IT USED TO TEST FOR THE STRING `"none"` SPECIFICALLY, AND THAT WAS ONE FIELD
 * TOO NARROW. `left_column_mask`'s "absent" spelling is `"undeclared"`, not
 * `"none"` — so a rule keyed on the word would have silently rewritten a
 * hand-authored `"left_column_mask": "undeclared"` into an absent key the first
 * time an author cleared the row. The general rule is the schema's own default,
 * whatever word it is, which is the rule that was always meant.
 */
function keyDefaults(props: Record<string, unknown>): ReadonlyMap<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, node] of Object.entries(props)) {
    const d = (node as Record<string, unknown> | null)?.default;
    if (d !== undefined) out.set(key, d);
  }
  return out;
}
export const EFFECTS_SCENE_KEY_DEFAULTS = keyDefaults(at('properties'));
export const EFFECTS_LAYER_KEY_DEFAULTS = keyDefaults(at('$defs', 'layer', 'properties'));

/**
 * `FACTOR_0` — the packed factor the engine spells `$0FF` and tests a layer's
 * `fb` against when it adjudicates `left_column_mask: Factor0Lock`
 * (aeon engine/level/scene_dsl.emp, P3 Task 12 guard 3 half one).
 *
 * DERIVED WITH A CHECK, not typed: the name must still be one the schema's own
 * factor enum publishes, so a contract that renamed or dropped it fails this
 * module's import rather than leaving a UI precondition quietly comparing
 * against a string nothing can hold.
 */
export const EFFECTS_FACTOR_ZERO: EffectsFactorName = (() => {
  const name = EFFECTS_FACTOR_NAMES.find((n) => n === 'FACTOR_0');
  if (name === undefined) {
    throw new Error(
      'effects scene schema $defs.factor no longer publishes FACTOR_0 — the left-column '
      + 'Factor0Lock precondition compares a layer\'s fb against it.',
    );
  }
  return name;
})();

/** `left_column_mask`'s own default — the "no policy declared" spelling. */
export const EFFECTS_LEFT_COLUMN_MASK_UNDECLARED: string = (() => {
  const d = at('properties', 'left_column_mask').default;
  if (typeof d !== 'string' || !EFFECTS_LEFT_COLUMN_MASK_VALUES.includes(d)) {
    throw new Error(
      'effects scene schema properties.left_column_mask has no string default inside its own enum',
    );
  }
  return d;
})();

/**
 * `v_factor` is a RIGHT-SHIFT AMOUNT, 0..15 — read out of the schema, not typed.
 *
 * NOT A FACTOR, despite the name. `fa`/`fb` are packed `$defs/factor` values
 * where locked is the byte `$0FF`; this is a shift count the engine hands to
 * `asr.w`, where locked is the sentinel **15**. The contract used to `$ref` both
 * to `$defs/factor`, which is what made the two spaces look like one type
 * (empyrean CR-1, `a32bcb03`; ROADMAP item 35). Reading the bounds through
 * `boundsAt` rather than through `$defs/factor` is what stops that recurring: if
 * a future amendment `$ref`s this field again, `boundsAt` finds no numeric
 * minimum/maximum on it and the module's import fails loudly.
 */
export const EFFECTS_V_FACTOR_BOUNDS = boundsAt('properties', 'v_factor');

/**
 * `v_center` is a world Y the vertical mapping pivots about — same space as a
 * layer's `world_y`, 0..32767. `v_offset` is a SIGNED pixel offset added after
 * the shift, -32768..32767 (a 16-bit add.w in the engine; it was always signed
 * there, the unsigned field type was the error). Both read out of the schema,
 * never typed: empyrean 5c930d6 bounded them, and aeon refuses out-of-range at
 * emit, so Aurora's clamps must match EXACTLY (ROADMAP item 37).
 */
export const EFFECTS_V_CENTER_BOUNDS = boundsAt('properties', 'v_center');
export const EFFECTS_V_OFFSET_BOUNDS = boundsAt('properties', 'v_offset');

/** The schema's `default` for a field, which the UI clamps fall to on a non-finite input. */
function integerDefaultAt(...path: (string | number)[]): number {
  const node = at(...path);
  const d = node.default;
  if (typeof d !== 'number' || !Number.isInteger(d)) {
    throw new Error(`effects scene schema ${path.join('.')} has no integer default`);
  }
  return d;
}
export const EFFECTS_V_CENTER_DEFAULT = integerDefaultAt('properties', 'v_center');
export const EFFECTS_V_OFFSET_DEFAULT = integerDefaultAt('properties', 'v_offset');

/**
 * The value that pins the BG plane: `v_factor`'s maximum, which the schema's own
 * description names as the lock sentinel.
 *
 * DERIVED, TWICE, so the two halves cannot drift apart. The number comes from
 * `maximum`; the claim that this particular number is the sentinel comes from
 * the schema's `description`, checked at module load below. A schema that moved
 * the ceiling and the sentinel together still works; one that decoupled them
 * fails the import instead of quietly redefining "locked".
 */
export const EFFECTS_V_FACTOR_LOCK: number = EFFECTS_V_FACTOR_BOUNDS.max;

(function assertVFactorLockSentinel(): void {
  const description = at('properties', 'v_factor').description;
  if (typeof description !== 'string'
      || !new RegExp(`\\b${EFFECTS_V_FACTOR_LOCK}\\b[^.]*LOCK SENTINEL`).test(description)) {
    throw new Error(
      `effects scene schema properties.v_factor no longer names ${EFFECTS_V_FACTOR_LOCK} as its ` +
      'LOCK SENTINEL — EFFECTS_V_FACTOR_LOCK derives the locked value from `maximum`, and that ' +
      'coupling has just been broken. Re-derive it against the amended schema.',
    );
  }
})();

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Does `id` match the schema's id pattern (`^[a-z][a-z0-9_]{0,31}$`)? */
export function isValidSceneId(id: string): boolean {
  // A fresh RegExp per call: EFFECTS_SCENE_ID_PATTERN carries no /g, so `lastIndex`
  // cannot bite, but constructing from `.source` keeps that true even if the
  // schema's pattern ever grows a flag.
  return new RegExp(EFFECTS_SCENE_ID_PATTERN.source).test(id);
}

/**
 * The one sentence to show an author whose id was refused. Written once here so
 * the UI and the agent tool cannot describe the same rule differently.
 */
export const SCENE_ID_RULE =
  'a scene id is 1-32 characters: a lowercase letter, then lowercase letters, digits or ' +
  'underscores. It becomes part of generated .emp symbol names, so hyphens are not legal ' +
  '(unlike a background id).';

/**
 * Every id a NEW scene may not take.
 *
 * The union of the ids that loaded AND the filename stems of files that did not.
 * The second half is the whole point: an unreadable scene is invisible in the
 * scene list, so `broken` looks free to an author while the save path refuses to
 * write over it. Refusing the id at create time is where that collision should be
 * caught; buildAeonSavePlan's throw is the backstop behind it.
 */
export function takenSceneIds(library: EffectsSceneLibrary): Set<string> {
  const taken = new Set(library.scenes.map(s => s.id));
  for (const u of library.unreadable) {
    const stem = u.path.split('/').pop();
    if (stem?.endsWith('.json')) taken.add(stem.slice(0, -'.json'.length));
  }
  return taken;
}

/** Why `id` cannot be used for a new scene, or null when it can. */
export function sceneIdRefusal(id: string, library: EffectsSceneLibrary): string | null {
  if (!isValidSceneId(id)) return `"${id}" is not a legal scene id — ${SCENE_ID_RULE}`;
  if (takenSceneIds(library).has(id)) {
    const unreadable = library.unreadable.some(u => u.path.endsWith(`/${id}.json`));
    return unreadable
      ? `"${id}" names a file that already exists and could not be read. Fix or remove it by hand first.`
      : `"${id}" is already a scene in this project.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * A new scene with the fewest keys that satisfy the schema's `required` list:
 * `schema`, `id`, `layers` (one), `v_factor`. Plus `name`, which is the only
 * writer-owned field in the format and the only one an author sees in a list.
 *
 * NO DEFAULTS ARE WRITTEN OUT. `dsa`, `phase`, `transition` and the
 * rest are all absent, which is exactly what scene.ts's model comment demands:
 * "injecting defaults would turn every load/save of an untouched file into a diff,
 * and would silently freeze today's default into files that should track the
 * contract's". A new scene is the same document a hand author would write.
 *
 * `FACTOR_1` for the layer's two factors and the LOCK SENTINEL for `v_factor`
 * are the neutral starting point an author edits away from — 1:1 with the camera
 * horizontally, no vertical scroll — not a schema default, and there is no schema
 * default for either (both are `required`).
 *
 * `v_factor` USED TO BE `'FACTOR_0'` HERE, AND THAT WAS THE DEFECT. In the packed
 * factor space `FACTOR_0` genuinely is locked; in the shift space this field
 * actually occupies, locked spells `EFFECTS_V_FACTOR_LOCK` (15) and `FACTOR_0`
 * is not a value at all — it folded to the byte 255, which a 68000 `asr.w` takes
 * mod 64 as 63, sign-filling the term so the plane rendered *almost* like a
 * locked one. Every scene this function has ever created carried it. Migrated
 * under ROADMAP item 35, behind empyrean's CR-1 (`a32bcb03`).
 */
export function newEffectsScene(id: string, name?: string): EffectsScene {
  const scene: EffectsScene = {
    schema: 1,
    id,
    layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' }],
    v_factor: EFFECTS_V_FACTOR_LOCK,
  };
  if (name !== undefined && name !== '') scene.name = name;
  return scene;
}

/**
 * A new layer for an existing scene, at `world_y`.
 *
 * Same minimal-keys rule as `newEffectsScene`, and the same reason. `fa`/`fb`
 * copy the layer above when there is one, because a new band that scrolls
 * identically to its neighbour is a visible no-op an author then TUNES — where a
 * band springing to `FACTOR_1` from a scene of slow distant bands reads as a bug.
 */
export function newEffectsLayer(
  worldY: number, copyFactorsFrom?: { fa: EffectsFactor; fb: EffectsFactor },
): EffectsScene['layers'][number] {
  return {
    world_y: worldY,
    fa: copyFactorsFrom?.fa ?? 'FACTOR_1',
    fb: copyFactorsFrom?.fb ?? 'FACTOR_1',
  };
}

/**
 * A structural deep copy of a scene, for building the `old`/`new` halves of an
 * undo command.
 *
 * `structuredClone`, NOT a hand-written copier. That is the whole point: a
 * hand-enumerated clone is precisely the defect this repo has already paid for
 * once (a `cloneSection` with no test let a dropped ref survive a 3,909-test
 * suite), and here it would silently drop every field the wave-1 UI does not
 * know about — undoing the codec's one structural idea from the outside. A scene
 * document is plain JSON by construction (it came out of `JSON.parse` or a
 * literal), so structuredClone is total over it.
 */
export function cloneEffectsScene(scene: EffectsScene): EffectsScene {
  return structuredClone(scene);
}
