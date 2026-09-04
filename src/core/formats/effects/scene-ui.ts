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
import {
  EFFECTS_SCENE_SCHEMA, EFFECTS_SCENE_ID_PATTERN,
  EFFECTS_REEL_BAND_COUNT, EFFECTS_REEL_RATE_BOUNDS,
} from './scene';
import type {
  EffectsScene, EffectsFactor, EffectsFactorName, EffectsLayer, EffectsSceneLibrary,
} from './scene';

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
// §2.5 — the scene-level vertical bob (empyrean bc639a10, aeon 8c75722b)
// ---------------------------------------------------------------------------
//
// ⚠ THREE SEPARATE TRAPS IN ONE ENCODING, and every constant below exists to
// keep one of them out of the control:
//
//   1. `bob_shift` IS AN INVERSE AMPLITUDE. Peak excursion is 256 >> bob_shift
//      px, so 1 is 128 px and 8 is 1 px: the bigger number is the SMALLER
//      motion. A spinner over the raw shift reads backwards to every author.
//   2. ITS DOMAIN IS DISCONTINUOUS — exactly 15, or 1..8. 0 and 9..14 are
//      refused by aeon's `scene()`. A range control cannot express that, so
//      nothing below hands the UI a range.
//   3. THE SENTINEL INVERTS AT THE LOWERING. The DOCUMENT's off is 15; the WIRE
//      byte's off is 0, because `scene_bob_packed()` folds an authored 15 into
//      the packed byte 0 and otherwise emits `(shift << 4) | period`. So a
//      slider clamped 0..15 authors 15 meaning MAXIMUM while the engine reads NO
//      BOB, and a control that treats 0 as "off" authors the NARROWEST LEGAL
//      SWAY — shift 0 being illegal precisely because it would pack to the
//      no-bob byte. NEVER CLAMP TOWARD 0. Off is 15, or the keys are absent.
//      This is the third time in this suite that the top of a range has been the
//      sentinel (`v_factor` 15, layer deform shift 15, now this).
//
// EVERYTHING HERE IS READ OUT OF THE SCHEMA, on the `EFFECTS_DRIFT_UNITS_PER_PIXEL`
// precedent: the numbers that convert a shift into pixels and a period into
// seconds are the contract's, and a number typed beside the contract is the
// defect this module exists to prevent. Each is derived TWICE where the schema
// says it twice, so an amendment that moves one half fails this module's import
// — which takes the whole suite with it — instead of silently rescaling what
// Aurora shows an author.

/** `properties.bob_shift`'s two `anyOf` arms, as a pair of branch schemas. */
const BOB_SHIFT_ARMS: readonly Record<string, unknown>[] = (() => {
  const arms = at('properties', 'bob_shift').anyOf;
  if (!Array.isArray(arms) || arms.length !== 2) {
    throw new Error(
      'effects scene schema properties.bob_shift no longer has exactly two `anyOf` arms — the '
      + 'no-bob sentinel and the amplitude ladder were derived from them separately; re-derive '
      + 'them against the amended schema.',
    );
  }
  return Object.freeze(arms as Record<string, unknown>[]);
})();

/**
 * The amplitude ladder's ends, 1..8 — the CONTINUOUS arm of the discontinuous
 * domain, and the only shifts a control may offer.
 *
 * Found by SEARCHING the arms for the one with numeric bounds rather than by
 * index, because an amendment that swapped the two arms would otherwise turn
 * this silently into the sentinel's arm.
 */
export const EFFECTS_BOB_SHIFT_LADDER: { min: number; max: number } = (() => {
  const arm = BOB_SHIFT_ARMS.find(a => typeof a.minimum === 'number' && typeof a.maximum === 'number');
  if (arm === undefined) {
    throw new Error(
      'effects scene schema properties.bob_shift has no `anyOf` arm with numeric '
      + 'minimum/maximum — the amplitude ladder was derived from it.',
    );
  }
  return Object.freeze({ min: arm.minimum as number, max: arm.maximum as number });
})();

/**
 * The NO-BOB SENTINEL — the document's off. **15**, and never 0.
 *
 * DERIVED THREE WAYS, because getting this one wrong inverts the control: from
 * the `anyOf`'s constant arm, from the field's `default`, and from the
 * description's own words. A schema that moved the sentinel and said so still
 * works; one that decoupled any two of the three fails the import.
 */
export const EFFECTS_BOB_SHIFT_NONE: number = (() => {
  const arm = BOB_SHIFT_ARMS.find(a => typeof a.const === 'number');
  if (arm === undefined) {
    throw new Error(
      'effects scene schema properties.bob_shift has no `anyOf` arm pinning a constant — the '
      + 'no-bob sentinel was derived from it.',
    );
  }
  const sentinel = arm.const as number;
  const node = at('properties', 'bob_shift');
  if (node.default !== sentinel) {
    throw new Error(
      `effects scene schema properties.bob_shift's default (${JSON.stringify(node.default)}) is no `
      + `longer its no-bob sentinel (${sentinel}) — omitting the key stops meaning "no bob", which `
      + 'is what lets a scene without a bob round-trip byte-identically. Re-derive.',
    );
  }
  const description = node.description;
  if (typeof description !== 'string'
      || !new RegExp(`\\b${sentinel}\\b[^.]*NO-BOB SENTINEL`).test(description)) {
    throw new Error(
      `effects scene schema properties.bob_shift no longer names ${sentinel} as its NO-BOB `
      + 'SENTINEL — EFFECTS_BOB_SHIFT_NONE derives the off value from the `anyOf` constant, and '
      + 'that coupling has just been broken. Re-derive it against the amended schema.',
    );
  }
  return sentinel;
})();

/**
 * THE DISCONTINUITY, ASSERTED AT MODULE LOAD. The sentinel must sit OUTSIDE the
 * ladder, because every affordance below rests on "off is not a position on the
 * amplitude control". A schema that widened the ladder to swallow 15 would make
 * the toggle and the ladder mean overlapping things, and this is where that
 * stops rather than three files downstream.
 */
(function assertBobSentinelIsOutsideTheLadder(): void {
  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;
  if (EFFECTS_BOB_SHIFT_NONE >= min && EFFECTS_BOB_SHIFT_NONE <= max) {
    throw new Error(
      `effects scene schema properties.bob_shift now admits its no-bob sentinel `
      + `${EFFECTS_BOB_SHIFT_NONE} inside its amplitude ladder ${min}..${max}. Aurora's control `
      + 'presents off as a state and amplitude as a ladder precisely because the two were '
      + 'disjoint; re-design the control against the amended schema.',
    );
  }
})();

/**
 * The sine table's amplitude, **256** — the numerator of `256 >> bob_shift`.
 *
 * DERIVED TWICE from two independent sentences of the field's description: the
 * formula, and the two worked ends the contract gives an author ("1 = 128 px,
 * 8 = 1 px"). Both worked ends are checked AGAINST THE LADDER this module
 * already read out of `minimum`/`maximum`, so the description and the bounds
 * cannot drift apart either.
 */
export const EFFECTS_BOB_AMPLITUDE_BASE: number = (() => {
  const description = at('properties', 'bob_shift').description;
  const stale =
    "effects scene schema properties.bob_shift's description no longer states its amplitude in "
    + 'the shape EFFECTS_BOB_AMPLITUDE_BASE derives it from. The table amplitude is READ from the '
    + 'contract, never typed beside it; re-derive it against the amended schema rather than '
    + 'hardcoding it. (This sentence does not name the number either — a bare literal here would '
    + "be caught by effects-drift's own sweep, and rightly.)";
  if (typeof description !== 'string') throw new Error(`${stale} (no description at all)`);

  // Sentence 1: the formula.
  const formula = /peak excursion (\d+) >> bob_shift px/.exec(description);
  if (!formula) throw new Error(`${stale} (no "peak excursion <n> >> bob_shift px")`);
  const base = Number(formula[1]);

  // Sentence 2: the two worked ends — an INDEPENDENT statement of the same map.
  const worked = /\((\d+) = (\d+) px, (\d+) = (\d+) px\)/.exec(description);
  if (!worked) throw new Error(`${stale} (no "(<a> = <n> px, <b> = <n> px)")`);
  const [loShift, loPx, hiShift, hiPx] = worked.slice(1, 5).map(Number);

  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;
  if (loShift !== min || hiShift !== max) {
    throw new Error(
      `${stale} — the worked ends are shifts ${loShift} and ${hiShift} but the ladder is `
      + `${min}..${max}.`,
    );
  }
  if ((base >> loShift) !== loPx || (base >> hiShift) !== hiPx) {
    throw new Error(
      `${stale} — the formula says ${base} >> ${loShift} = ${base >> loShift} and `
      + `${base} >> ${hiShift} = ${base >> hiShift}, the worked ends say ${loPx} and ${hiPx}.`,
    );
  }
  return base;
})();

/** `bob_period`'s bounds, 0..8. Unlike the amplitude this arm is CONTINUOUS. */
export const EFFECTS_BOB_PERIOD_BOUNDS = boundsAt('properties', 'bob_period');

/** `bob_period`'s schema default — the FASTEST sway, not the slowest. */
export const EFFECTS_BOB_PERIOD_DEFAULT = integerDefaultAt('properties', 'bob_period');

/**
 * One full sway's length in logic ticks at period 0, **256**, and the tick rate,
 * **60 Hz** — the two numbers that turn a period shift into a duration an author
 * can judge.
 *
 * DERIVED TOGETHER from the description's parenthetical, and CROSS-CHECKED three
 * ways: the tick base against the formula sentence beside it, the two glossed
 * periods against `minimum`/`maximum`, and the glossed seconds against the
 * quotient the rate implies. The seconds check is what actually pins the Hz: 256
 * ticks and "about 4.3 s" only agree at 60.
 */
const BOB_PERIOD_SCALE: { baseTicks: number; hz: number } = (() => {
  const description = at('properties', 'bob_period').description;
  const stale =
    "effects scene schema properties.bob_period's description no longer states its timing in the "
    + 'shape Aurora derives it from. Both the base cycle length and the tick rate are READ from '
    + 'the contract, never typed beside it; re-derive them against the amended schema.';
  if (typeof description !== 'string') throw new Error(`${stale} (no description at all)`);

  // Sentence 1: the formula.
  const formula = /one full sway is (\d+) << bob_period ticks/.exec(description);
  if (!formula) throw new Error(`${stale} (no "one full sway is <n> << bob_period ticks")`);
  const baseTicks = Number(formula[1]);

  // Sentence 2: the parenthetical, glossing BOTH ends and the wall-clock rate.
  const gloss = /\(([\d,]+) at (\d+), about ([\d.]+) s at (\d+) Hz; ([\d,]+) at (\d+)\)/
    .exec(description);
  if (!gloss) throw new Error(`${stale} (no "(<t> at <p>, about <s> s at <n> Hz; <t> at <p>)")`);
  const num = (s: string) => Number(s.replace(/,/g, ''));
  const [loTicks, loPeriod, seconds, hz, hiTicks, hiPeriod] =
    [num(gloss[1]), num(gloss[2]), Number(gloss[3]), num(gloss[4]), num(gloss[5]), num(gloss[6])];

  const { min, max } = EFFECTS_BOB_PERIOD_BOUNDS;
  if (loPeriod !== min || hiPeriod !== max) {
    throw new Error(`${stale} — the gloss covers periods ${loPeriod} and ${hiPeriod}, the bounds are ${min}..${max}.`);
  }
  if (loTicks !== baseTicks << loPeriod || hiTicks !== baseTicks << hiPeriod) {
    throw new Error(
      `${stale} — the formula gives ${baseTicks << loPeriod} and ${baseTicks << hiPeriod} ticks, `
      + `the gloss says ${loTicks} and ${hiTicks}.`,
    );
  }
  if (hz === 0 || Math.round((loTicks / hz) * 10) / 10 !== seconds) {
    throw new Error(
      `${stale} — ${loTicks} ticks at ${hz} Hz is ${loTicks / hz} s, the gloss says ${seconds} s.`,
    );
  }
  return Object.freeze({ baseTicks, hz });
})();

export const EFFECTS_BOB_PERIOD_BASE_TICKS = BOB_PERIOD_SCALE.baseTicks;
export const EFFECTS_BOB_TICKS_PER_SECOND = BOB_PERIOD_SCALE.hz;

/**
 * A bob amplitude shift as its PEAK EXCURSION IN PIXELS — the quantity an author
 * is actually choosing, and the one the schema itself suggests presenting.
 *
 * MONOTONE DECREASING in its argument. That inversion is the whole reason this
 * function exists rather than a control over the raw shift.
 */
export function bobPeakPixels(shift: number): number {
  return EFFECTS_BOB_AMPLITUDE_BASE >> shift;
}

/** A bob period shift as the length of one full sway, in logic ticks. */
export function bobPeriodTicks(period: number): number {
  return EFFECTS_BOB_PERIOD_BASE_TICKS << period;
}

/** A bob period shift as the length of one full sway, in seconds of wall clock. */
export function bobPeriodSeconds(period: number): number {
  return bobPeriodTicks(period) / EFFECTS_BOB_TICKS_PER_SECOND;
}

/**
 * Why `shift` is not a legal `bob_shift`, or null when it is — every clause read
 * out of the schema above, so this cannot approximate the contract.
 *
 * ADVISORY in scene.ts's sense: nothing in the read or write path calls it.
 * `validateAgainstSchema` is what refuses a document. This exists so the control
 * can refuse to ORIGINATE the discontinuity and say why in a sentence, and so a
 * test can name the illegal values without restating them as literals.
 */
export function bobShiftRefusal(shift: number): string | null {
  if (!Number.isInteger(shift)) {
    return `a bob amplitude is a whole right-shift count; ${shift} is not an integer.`;
  }
  if (shift === EFFECTS_BOB_SHIFT_NONE) return null;
  const { min, max } = EFFECTS_BOB_SHIFT_LADDER;
  if (shift < min || shift > max) {
    return `${shift} is not a bob amplitude: the contract admits ${min}..${max} `
      + `(${bobPeakPixels(min)} px down to ${bobPeakPixels(max)} px of peak excursion) or the `
      + `no-bob sentinel ${EFFECTS_BOB_SHIFT_NONE}. `
      + (shift < min
        ? 'Below the ladder is NOT "less motion" — the wire byte spells no bob as 0, so shift 0 '
          + 'would pack to silence and aeon refuses it. Off is '
          + `${EFFECTS_BOB_SHIFT_NONE}, never 0.`
        : `Above the ladder annihilates the ${EFFECTS_BOB_AMPLITUDE_BASE}-amplitude table, `
          + 'leaving a sub-pixel droop and no motion at all.');
  }
  return null;
}

/**
 * The `bob_shift` a scene carries, or null when it does not bob.
 *
 * ABSENT AND THE SENTINEL BOTH READ AS NULL, which is the point: the schema's
 * default IS the sentinel, so "no key" and "key set to 15" are the same
 * document, and no caller should have to know which spelling a file used.
 */
export function bobShiftOf(scene: Pick<EffectsScene, 'bob_shift'>): number | null {
  const shift = scene.bob_shift;
  if (typeof shift !== 'number' || shift === EFFECTS_BOB_SHIFT_NONE) return null;
  return shift;
}

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

// ---------------------------------------------------------------------------
// §2.2 — `drift`, and the ONE place the 1/256 factor is spelled
// ---------------------------------------------------------------------------
//
// `drift` arrived at empyrean 988638f. It is a per-layer, camera-independent
// horizontal rate: the band scrolls by itself, every frame (S1 GHZ clouds, S2
// WFZ/HTZ, S3K AIZ1). Engine design: aeon
// docs/superpowers/specs/2026-08-29-band-drift-design.md §7 at aeon e0ce6011.
//
// THERE IS A CONTROL NOW (EW-DRIFT-CTL). When this block was written aeon's
// `tools/effects_gen.py` REFUSED the key — a control would have originated a
// value the build rejected for EVERY input — and the codec shipped without one.
// aeon's emission parcel landed at aeon `ce4dbb7c` ("chain 205 — drift becomes
// authorable in the editor"): `LAYER_KEYS` there now carries `drift` and
// `render_drift` lowers it to `SceneDrift.Rate(n)`. The row lives on the layer
// card (EffectsScenePanel, `LAYER_DRIFT_ROW`); everything below is still the
// only place the unit is known. See docs/reviews/2026-08-29-drift-codec.md and
// docs/reviews/2026-09-02-effects-drift-control.md.
//
// ⚠ WHAT THE GENERATOR DOES NOT DO, and why the refusals below are load-bearing:
// `render_drift`'s own docstring says it does NOT convert (the px/frame ↔ 1/256
// multiply "happens in AURORA'S UI, on export, above the wire — so a multiply
// here would apply it twice"), and it FORWARDS `Rate(0)` and `Rate(9000)` as
// shape-legal, leaving them to aeon's build-time `ensure`. So Aurora's control is
// the only place an author learns the bound before a red build.

/** The `oneOf` branch of `drift` that carries a rate, as a path `at()` can walk. */
const DRIFT_RATE_PATH: (string | number)[] = [
  ...oneOfBranchWith(['$defs', 'layer', 'properties', 'drift'], 'rate'),
  'properties', 'rate',
];

/**
 * `rate`'s bounds ON THE WIRE, in 1/256 px per frame — NOT px/frame.
 *
 * The schema calls ±4096 (= ∓16 px/frame) a TASTE bound, not a correctness one:
 * nothing breaks at 100 px/frame, it just looks absurd. Aurora still holds it,
 * because the party that refuses a build is aeon and a scene Aurora wrote
 * outside the contract's range would be a build failure with Aurora's name on it.
 */
export const EFFECTS_DRIFT_RATE_BOUNDS = boundsAt(...DRIFT_RATE_PATH);

/**
 * The one rate the schema refuses INSIDE its own range, read out of the `not`.
 *
 * DERIVED RATHER THAN TYPED AS `0`, on the `EFFECTS_V_FACTOR_LOCK` precedent:
 * the reason `0` is refused is that `Rate(0)` and `None` are indistinguishable
 * in ROM (aeon design §7 row 1), which is a fact about the ENCODING and could in
 * principle be spelled with a different sentinel by a future amendment.
 */
export const EFFECTS_DRIFT_RATE_REFUSED: number = (() => {
  const excluded = at(...DRIFT_RATE_PATH).not;
  const value = (excluded as Record<string, unknown> | null)?.const;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(
      `effects scene schema ${DRIFT_RATE_PATH.join('.')} no longer excludes an integer constant ` +
      'via `not` — the rate the contract refuses was derived from it; re-derive it against the ' +
      'amended schema.',
    );
  }
  return value;
})();

/**
 * How many wire units make one pixel per frame. **256.**
 *
 * THIS IS THE ONLY PLACE THE FACTOR IS SPELLED IN AURORA, and it is not spelled
 * as a literal even here: it is read out of the schema's own description, which
 * is where the contract chose to put it ("1 px/frame = 256"). A number typed
 * beside the schema is the exact defect this module exists to prevent, and a
 * 256× unit error is the top authoring hazard the engine design names (§7.1) —
 * an author writing 1 meaning 1 px/frame gets 1/256 px/frame, which no assertion
 * anywhere can catch, because 1 is itself a legal rate.
 *
 * DERIVED TWICE, from two independent sentences of that description, exactly as
 * `EFFECTS_V_FACTOR_LOCK` is: once from the worked conversion, and once from the
 * bound gloss ("+/-4096 (16 px/frame)") checked against the bound this module
 * already read out of `maximum`. A schema that moved the unit and updated both
 * still works; one that decoupled them fails this module's import — which takes
 * the whole suite with it — instead of silently rescaling every drift Aurora
 * shows.
 */
export const EFFECTS_DRIFT_UNITS_PER_PIXEL: number = (() => {
  const path = ['$defs', 'layer', 'properties', 'drift'];
  const description = at(...path).description;
  if (typeof description !== 'string') {
    throw new Error(`effects scene schema ${path.join('.')} has no string description`);
  }
  const stale =
    `effects scene schema ${path.join('.')}'s description no longer states its unit in the shape ` +
    'EFFECTS_DRIFT_UNITS_PER_PIXEL derives it from. The 1/256 factor is READ from the contract, ' +
    'never typed beside it; re-derive it against the amended schema rather than hardcoding a number.';

  // Sentence 1: the worked conversion the contract gives an author.
  const worked = /\b1 px\/frame = (\d+)\b/.exec(description);
  if (!worked) throw new Error(`${stale} (no "1 px/frame = <n>")`);
  const factor = Number(worked[1]);

  // Sentence 2: the bound gloss — an INDEPENDENT statement of the same ratio.
  const gloss = /\+\/-(\d+) \((\d+) px\/frame\)/.exec(description);
  if (!gloss) throw new Error(`${stale} (no "+/-<units> (<px> px/frame)")`);
  const [glossUnits, glossPx] = [Number(gloss[1]), Number(gloss[2])];

  if (glossUnits !== EFFECTS_DRIFT_RATE_BOUNDS.max) {
    throw new Error(
      `${stale} — the description glosses the bound as ${glossUnits} but \`maximum\` is ` +
      `${EFFECTS_DRIFT_RATE_BOUNDS.max}.`,
    );
  }
  if (glossPx === 0 || glossUnits / glossPx !== factor) {
    throw new Error(
      `${stale} — the worked conversion says ${factor} units per px/frame, the bound gloss says ` +
      `${glossUnits}/${glossPx} = ${glossUnits / glossPx}.`,
    );
  }
  return factor;
})();

/**
 * A wire rate as px/frame, for display. Exact for every legal rate: the factor
 * is a power of two, so the quotient is representable.
 */
export function driftRateToPxPerFrame(rate: number): number {
  return rate / EFFECTS_DRIFT_UNITS_PER_PIXEL;
}

/**
 * px/frame as a wire rate — the multiply the schema's SHOULD asks for, in the
 * one place it happens.
 *
 * ROUNDS, because the wire is an integer and px/frame is what a human types.
 *
 * HALF-AWAY-FROM-ZERO, not `Math.round`. `Math.round` breaks ties toward +∞, so
 * it is not symmetric about zero: it sends +0.5 to 1 and −0.5 to −0. On a SIGNED
 * quantity that means the same typed magnitude survives in one direction and
 * vanishes in the other, which is a difference an author would see and could not
 * explain. Rounding the magnitude and reapplying the sign makes the two
 * directions mirror images, which is what "the same speed, leftward" should mean.
 *
 * `-0` is normalised to `0` so a rounded-to-nothing negative cannot present as a
 * value distinct from zero; `0` is a REFUSED rate either way
 * (`driftRateRefusal`), and that refusal is deliberately NOT folded in here — a
 * conversion that sometimes returns a number and sometimes an error is a
 * conversion nobody can compose.
 */
export function driftPxPerFrameToRate(pxPerFrame: number): number {
  const units = pxPerFrame * EFFECTS_DRIFT_UNITS_PER_PIXEL;
  const rate = Math.sign(units) * Math.round(Math.abs(units));
  return rate === 0 ? 0 : rate;
}

/**
 * Why `rate` is not a legal wire rate, or null when it is — every clause read
 * out of the schema above, so this cannot approximate the contract.
 *
 * ADVISORY, in scene.ts's sense: nothing in the read or write path calls it.
 * `validateAgainstSchema` is what actually refuses a document, and it refuses
 * the same three cases from the same schema node. This exists so a future
 * control can say WHY before it writes, in a sentence, rather than handing an
 * author a validator dump.
 */
export function driftRateRefusal(rate: number): string | null {
  if (!Number.isInteger(rate)) {
    return `a drift rate is a whole number of 1/256 px per frame; ${rate} is not an integer.`;
  }
  if (rate === EFFECTS_DRIFT_RATE_REFUSED) {
    return `${rate} is not a drift rate — it is indistinguishable from no drift at all in ROM, ` +
      'and aeon refuses it at build time. A layer that should not drift spells "none".';
  }
  const { min, max } = EFFECTS_DRIFT_RATE_BOUNDS;
  if (rate < min || rate > max) {
    return `${rate} (${driftRateToPxPerFrame(rate)} px/frame) is outside the contract's ` +
      `${min}..${max} (${driftRateToPxPerFrame(min)}..${driftRateToPxPerFrame(max)} px/frame). ` +
      'That is a TASTE bound, not a correctness one — raise it in the contract rather than ' +
      'working around it.';
  }
  return null;
}

/** The rate a layer's `drift` carries, or null for `"none"` / absent. */
export function driftRateOf(drift: EffectsLayer['drift']): number | null {
  if (drift === undefined || drift === 'none') return null;
  return drift.rate;
}

/**
 * `rate`'s bounds IN THE UNIT THE AUTHOR TYPES — px/frame — for the control's
 * title and its spinner.
 *
 * DIVIDED, never a second pair of numbers: ±16 written here would be a copy of
 * ±4096 that a contract amendment could leave behind, which is the whole defect
 * this module exists to stop.
 */
export const EFFECTS_DRIFT_PX_BOUNDS = Object.freeze({
  min: driftRateToPxPerFrame(EFFECTS_DRIFT_RATE_BOUNDS.min),
  max: driftRateToPxPerFrame(EFFECTS_DRIFT_RATE_BOUNDS.max),
});

/**
 * Why a TYPED px/frame value cannot be written, or null when it can — the
 * refusal the control passes to `NumberField`'s `refuse`, which withholds the
 * commit.
 *
 * ONE SOURCE OF RULES. Every clause is `driftRateRefusal`'s, reached by
 * converting first: this function adds no bound, no exclusion and no arithmetic
 * of its own, it only says the verdict in the units the author is looking at.
 * A second copy of "±4096, not 0" phrased in px is exactly the drift the
 * derivation above refuses to allow.
 *
 * THE WIRE GLOSS APPEARS EXACTLY WHEN THE CONVERSION CHANGED THE NUMBER, which
 * is the one case an author cannot reconstruct. Type `0.001` and the sentence
 * that comes back is about `0`; without "0.001 px/frame is 0 in wire units" that
 * reads as a non sequitur, and the ×256 — invisible by construction, since every
 * wrong value is itself a legal rate — never becomes visible anywhere. Type `20`
 * and the delegated sentence is ALREADY in the author's own units ("5120 (20
 * px/frame) is outside…"); a gloss there restates the arithmetic a second time in
 * one paragraph, and the paragraph is painted in a 129px-tall list scroller
 * (MEASURED, effects-drift-harness [5e]) where a third line costs the sentence
 * its bottom edge.
 *
 * ROUNDING IS PART OF THE REFUSAL, not a step before it. A typed `0.001` is not
 * zero, but it LOWERS to zero, and zero is the value aeon refuses; catching it
 * here is why the control cannot write a layer that says "drifts" and builds red.
 */
export function driftPxPerFrameRefusal(pxPerFrame: number): string | null {
  if (!Number.isFinite(pxPerFrame)) {
    return `${pxPerFrame} is not a drift rate — type a signed number of pixels per frame.`;
  }
  const rate = driftPxPerFrameToRate(pxPerFrame);
  const why = driftRateRefusal(rate);
  if (why === null) return null;
  if (driftRateToPxPerFrame(rate) === pxPerFrame) return why;
  return `${pxPerFrame} px/frame is ${rate} in wire units `
    + `(1 px/frame = ${EFFECTS_DRIFT_UNITS_PER_PIXEL}). ${why}`;
}

// ---------------------------------------------------------------------------
// §2.6 — `rowRemap`, a SHIFT that must never be exported as a line count
// ---------------------------------------------------------------------------
//
// `rowRemap` arrived at empyrean `3992d16` (AURORA_EFFECTS_SCHEMA.md §2.6), filed
// from aeon's key-shape artifact `3d917657` against the LANDED constructor
// `SceneRemap.Ladder(t, y, h)` rather than against aeon's own design doc, none of
// whose three proposed field names survived contact with the shipped code.
//
// The band's Plane-B scroll words are re-fetched through a perspective index
// ladder, so screen line `i` takes the value that belonged to line `ladder[i]`.
// Rows are reordered, repeated and dropped; the band compresses toward the
// surface as the camera separates the background's picture of the surface from
// the foreground's truth about it. Hydrocity's waterline.
//
// ═══ TWO NUMBERS, TWO WAYS TO BE WRONG THAT NO BUILD CAN SEE ═══
//
// 1. `height_shift` IS A SHIFT, NOT A LINE COUNT. `H = 1 << height_shift`, and
//    the contract says in its own words that an editor "may DISPLAY
//    `1 << height_shift` beside the control and MUST EXPORT the shift". EVERY
//    value 3..7 is legal, so an editor that exported the line count would land a
//    band FOUR TIMES TOO TALL rather than a refusal — aeon's own ensure names the
//    trap ("If you meant 64 LINES, you want 6"). The `<<` therefore exists in
//    exactly one place in this repo, `rowRemapHeightLines`, and the control's
//    write path never calls it.
//
// 2. `plane_y` IS A PLANE-B LINE, 0..511 — the `vsplit.at` coordinate space, and
//    a THIRD space on a surface that already reconciles world pixels and screen
//    lines. The runtime's only use of it is `plane_y - Vscroll_BG`, whose second
//    term is a per-frame quantity, so no editor arithmetic could improve it: the
//    right conversion is none.
//
// ⚠ AND THE CEILING IS THIS SCHEMA'S ALONE. aeon's `ensure`
// (`scene_dsl.emp:1008`) tests `>= 0` only, and `brm_plane_y` is `u16`, so
// 512..65535 emits a SILENTLY-WRONG window — aeon booked that as
// `ROWREMAP-PLANEY-CEILING`. The usual "the engine already refuses it" argument
// is inverted here, which is why `rowRemapPlaneYRefusal` is not a convenience.

/** The `oneOf` branch of `rowRemap` that carries the payload, as a path `at()` can walk. */
const ROW_REMAP_OBJECT_PATH: (string | number)[] =
  oneOfBranchWith(['$defs', 'layer', 'properties', 'rowRemap'], 'plane_y');

/** `plane_y`'s bounds — a PLANE-B LINE, the `vsplit.at` space. */
export const EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS =
  boundsAt(...ROW_REMAP_OBJECT_PATH, 'properties', 'plane_y');

/** `height_shift`'s bounds — SHIFTS, not line counts. */
export const EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS =
  boundsAt(...ROW_REMAP_OBJECT_PATH, 'properties', 'height_shift');

/**
 * Every shift the schema admits, low to high — the ladder a picker may offer.
 *
 * Enumerated FROM THE BOUNDS rather than typed, so a contract that widens the
 * range grows the picker with no edit here and one that narrows it shrinks it.
 */
export const EFFECTS_ROW_REMAP_HEIGHT_SHIFTS: readonly number[] = Object.freeze((() => {
  const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
  const out: number[] = [];
  for (let s = min; s <= max; s++) out.push(s);
  return out;
})());

/**
 * The names the contract RESERVES and refuses inside the payload — `ladder` and
 * `table` today.
 *
 * DERIVED, NOT LISTED, and derived from the MECHANISM rather than from the
 * prose: a reserved name is a declared property whose schema is `{"not": {}}`,
 * the refuse-everything idiom (an empty subschema matches every value, so its
 * negation matches none). Reading the mechanism means a contract that reserves a
 * THIRD name gets it surfaced here with no edit, and one that PROMOTES `ladder`
 * to a real field drops it from this set the same way.
 *
 * ⚠ THE NODES THIS READS ARE INVISIBLE TO A SCALAR-LEAF WALK. `{"not": {}}` has
 * no scalar under it, so a diff that flattens a document to its leaves reports
 * nothing for either name — the two nodes that ARE the refusal. That is why this
 * constant asks the schema for the shape instead of trusting a leaf census.
 */
export const EFFECTS_ROW_REMAP_REFUSED_KEYS: readonly string[] = Object.freeze((() => {
  const props = at(...ROW_REMAP_OBJECT_PATH, 'properties');
  const refused = Object.keys(props).filter((k) => {
    const node = (props as Record<string, unknown>)[k] as Record<string, unknown> | null;
    const not = node?.not;
    return typeof not === 'object' && not !== null && Object.keys(not).length === 0;
  });
  if (refused.length === 0) {
    throw new Error(
      'effects scene schema $defs.layer.properties.rowRemap\'s payload declares no `{"not": {}}` ' +
      'property — the reserved names Aurora refuses to offer were derived from that idiom, and ' +
      'the mechanism is gone. Re-derive against the amended schema rather than listing names.',
    );
  }
  return refused;
})());

/**
 * The one `height_shift` that BUILDS today — 4, and read out of the contract
 * rather than typed, because it is a statement about aeon's generator on a date
 * and not a property of the format.
 *
 * DERIVED TWICE FROM TWO INDEPENDENT SENTENCES of the same description, the
 * `EFFECTS_DRIFT_UNITS_PER_PIXEL` pattern: the "TODAY ONLY n BUILDS" clause gives
 * the shift, and the ladder function aeon names (`row_remap_ladder16()`) gives
 * the LINE COUNT. They are cross-checked through `1 << shift`, so a contract that
 * moved one and not the other fails this module's import instead of letting the
 * control bless an unbuildable value — which is the exact failure the owner has
 * already paid for once ("it kept giving errors during build time that I would
 * have to stop and revert the changes").
 *
 * `null` IS A LEGITIMATE ANSWER and the reason the type is nullable: when 9b's
 * generator lands, the contract drops the clause, this reads `null`, and every
 * consumer below stops warning — no Aurora edit, no stale caution left behind.
 * A caution with no expiry is a false negative wearing caution's costume.
 */
export const EFFECTS_ROW_REMAP_BUILDABLE_SHIFT: number | null = (() => {
  const path = [...ROW_REMAP_OBJECT_PATH, 'properties', 'height_shift'];
  const description = at(...path).description;
  if (typeof description !== 'string') {
    throw new Error(`effects scene schema ${path.join('.')} has no string description`);
  }
  const only = /TODAY ONLY (\d+) BUILDS/.exec(description);
  if (!only) return null;
  const shift = Number(only[1]);

  const ladder = /row_remap_ladder(\d+)\(\)/.exec(description);
  if (!ladder) {
    throw new Error(
      `effects scene schema ${path.join('.')} still says "TODAY ONLY ${shift} BUILDS" but no ` +
      'longer names the one ladder function it builds from, so the claim cannot be ' +
      'cross-checked. Re-derive the buildable shift against the amended schema.',
    );
  }
  const lines = Number(ladder[1]);
  if ((1 << shift) !== lines) {
    throw new Error(
      `effects scene schema ${path.join('.')} says only shift ${shift} builds and names ` +
      `row_remap_ladder${lines}() as the one ladder, but 1 << ${shift} is ${1 << shift}, not ` +
      `${lines}. Two statements of one quantity disagree; re-read the contract.`,
    );
  }
  const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
  if (shift < min || shift > max) {
    throw new Error(
      `effects scene schema ${path.join('.')} names ${shift} as the buildable shift, which is ` +
      `outside its own ${min}..${max} range.`,
    );
  }
  return shift;
})();

/**
 * The band height a shift means, IN LINES — `1 << shift`. The only `<<` on this
 * key anywhere in the repo, and it is display-only: nothing on the write path
 * calls it.
 */
export function rowRemapHeightLines(shift: number): number {
  return 1 << shift;
}

/** Why `plane_y` is not a legal plane line, or null when it is. */
export function rowRemapPlaneYRefusal(planeY: number): string | null {
  if (!Number.isInteger(planeY)) {
    return `a plane line is a whole number; ${planeY} is not an integer.`;
  }
  const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
  if (planeY < min || planeY > max) {
    return `${planeY} is outside the Plane-B line range ${min}..${max}. This bound is the `
      + 'CONTRACT\'S ONLY ENFORCEMENT: aeon checks the floor and not the ceiling, so a larger '
      + 'value would build clean and emit a window pointing nowhere.';
  }
  return null;
}

/** Why `height_shift` is not a legal shift, or null when it is. */
export function rowRemapHeightShiftRefusal(shift: number): string | null {
  if (!Number.isInteger(shift)) {
    return `a height shift is a whole number; ${shift} is not an integer.`;
  }
  const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
  if (shift < min || shift > max) {
    return `${shift} is outside the contract's ${min}..${max}. THIS IS A SHIFT, NOT A LINE `
      + `COUNT — the band is 1 << shift lines tall, so ${min} is ${rowRemapHeightLines(min)} `
      + `lines and ${max} is ${rowRemapHeightLines(max)}. If you meant `
      + `${rowRemapHeightLines(max)} lines, you want ${max}.`;
  }
  return null;
}

/**
 * Why a legal shift will still fail aeon's build TODAY, or null when it will not.
 *
 * SEPARATE FROM THE REFUSAL ABOVE, deliberately, and the separation is the whole
 * point: `height_shift: 6` is a correct document that this schema accepts and
 * aeon's generator refuses by name, because only one ladder exists so far. A
 * control that folded the two together would either refuse a legal value
 * forever, or offer five options of which four break the build in silence.
 * Aurora says which is which and lets the author choose.
 *
 * SPELLED AS THE CURRENT STATE WITH ITS REASON, never as "only 4 works": the
 * sentence names what unblocks it, so it retires itself when 9b lands and the
 * contract drops the clause (`EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` then reads
 * `null` and this returns `null` for every shift).
 */
export function rowRemapBuildableToday(shift: number): string | null {
  const only = EFFECTS_ROW_REMAP_BUILDABLE_SHIFT;
  if (only === null || shift === only) return null;
  return `${shift} (${rowRemapHeightLines(shift)} lines) is a legal shift that does NOT BUILD `
    + `yet: the engine can generate only the ${rowRemapHeightLines(only)}-line ladder, so aeon `
    + `refuses every other shift by name until its generator half lands. ${only} `
    + `(${rowRemapHeightLines(only)} lines) is the one that builds today.`;
}

/** The payload a layer's `rowRemap` carries, or null for `"none"` / absent. */
export function rowRemapOf(
  rowRemap: EffectsLayer['rowRemap'],
): { plane_y: number; height_shift: number } | null {
  if (rowRemap === undefined || rowRemap === 'none') return null;
  return rowRemap;
}

/**
 * THE FOUR REFUSALS THIS SCHEMA DELIBERATELY DOES NOT ENCODE, in the contract's
 * own words — extracted from the `rowRemap` description, never paraphrased here.
 *
 * §2.6 ruling (3) puts them OUTSIDE the schema on purpose: "JSON Schema cannot
 * express a cross-key conditional over an array element's siblings legibly, and
 * the message is worth more than the encoding." They belong to aeon's GENERATOR,
 * with the engine `ensure`s kept for hand-authored `.emp`. So nothing an author
 * is talking to refuses them until a build runs — which is exactly why Aurora
 * checks the three that ARE functions of the open document and says so.
 *
 * THE SENTENCE THE AUTHOR READS IS AEON'S, NOT AURORA'S. A restatement here
 * would be a fourth copy of a rule that lives in three places already (the
 * engine's ensure, the generator, this description), free to drift from all
 * three. Each clause is located by a distinguishing phrase and the read is LOUD:
 * a contract that stops carrying one fails this module's import, which takes the
 * suite with it, rather than leaving a control advising something the contract no
 * longer holds.
 */
export const EFFECTS_ROW_REMAP_GENERATOR_REFUSALS: Readonly<Record<
  'vary' | 'anchor' | 'single' | 'capability', string
>> = (() => {
  const path = ['$defs', 'layer', 'properties', 'rowRemap'];
  const description = at(...path).description;
  if (typeof description !== 'string') {
    throw new Error(`effects scene schema ${path.join('.')} has no string description`);
  }
  const head = /REFUSALS THIS SCHEMA DOES NOT ENCODE[^:]*:([\s\S]*?)(?:\.\s|\.$)/.exec(description);
  if (!head) {
    throw new Error(
      `effects scene schema ${path.join('.')}'s description no longer carries a "REFUSALS THIS ` +
      'SCHEMA DOES NOT ENCODE ...:" clause. Aurora derives the sentences it shows an author from ' +
      'that clause rather than restating the rules; re-derive against the amended schema.',
    );
  }
  // The clause list opens after the parenthetical that cites aeon's three
  // `ensure` lines, and those cites are `file:line` — so the FIRST clause comes
  // back carrying the tail of a citation whenever the head regex stopped at a
  // colon inside it. Strip a leading citation from each clause rather than
  // trying to spell a head pattern that anticipates every future parenthetical:
  // a clause is what follows the last `): ` or `: ` in its own text, if any.
  const clauses = head[1]
    .split(';')
    .map((c) => c.replace(/^[\s\S]*?\):\s*/, '').trim())
    .filter((c) => c.length > 0);
  const find = (what: string, needle: RegExp): string => {
    const hit = clauses.find((c) => needle.test(c));
    if (hit === undefined) {
      throw new Error(
        `effects scene schema ${path.join('.')}'s refusal clause no longer states the ` +
        `"${what}" condition (looked for ${needle}). It has ${clauses.length} clause(s): ` +
        `${JSON.stringify(clauses)}. Re-derive against the amended schema.`,
      );
    }
    return hit;
  };
  return Object.freeze({
    vary: find('nothing to vary', /to vary/),
    anchor: find('no anchor declared', /declare anchor/),
    single: find('more than one remapped layer', /at most ONE layer/),
    capability: find('capability not raised', /CAP_ROW_REMAP/),
  });
})();

/**
 * Clamp a plane line into `rowRemap`'s OWN range.
 *
 * NOT `clampVSplitAt`, even though the two ranges are the same numbers today and
 * the contract calls them the same coordinate space. They are different schema
 * nodes, and `EFFECTS_ANCHOR_SHIFT_BOUNDS`'s docblock already records what
 * happens when this repo lets two spaces share one reader: an amendment moves one
 * and the other silently starts clamping to a bound that is not its own.
 */
export function clampRowRemapPlaneY(value: number): number {
  const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// ---------------------------------------------------------------------------
// §2.7 — `reels`, and the four facts a panel has to carry for it
// ---------------------------------------------------------------------------
//
// `reels` arrived at empyrean `ff3f43f` (AURORA_EFFECTS_SCHEMA.md §2.7); the
// codec half is EW-REELS-CODEC (`docs/reviews/2026-09-04-ew-reels-codec.md`)
// and this is the authoring half's derivation layer. Five 64-px-wide vertical
// strips of the BACKGROUND, each scrolling at its own rate — the slot-machine
// reel demo, aeon `OJZ_Reels_Fill`.
//
// ═══ NOTHING BELOW IS TYPED. EVERY NUMBER AND EVERY SENTENCE IS READ ═══
//
// The reason is sharper here than anywhere else in this file. Four of this
// key's constraints CANNOT be expressed as JSON keywords, so they exist only as
// prose inside the contract's own `description`, and the panel is REQUIRED to
// put one of them ON SCREEN. A component that typed that sentence out would be
// a fifth copy of a fact that lives in the schema, in `EffectsReels`'s
// docblock, in aeon's `.emp` and in the codec packet — free to drift from all
// four, silently, on a key nothing can render.
//
//   1. THE UNIT COLLISION. `reels.rates` is SIGNED WHOLE PIXELS PER FRAME.
//      There is no fixed point anywhere on the path. Its NEIGHBOUR
//      `drift.rate` is 1/256 px and Aurora multiplies by 256 on export, so a
//      panel copied from the drift path emits 768 for an intended 3. Nothing
//      in this block converts anything: a rate is authored, stored and emitted
//      as the same integer, and the only appearance of the factor below is in
//      the ADVERSARIAL census at the end.
//
//      ⚠ AND THE HOLE THE CODEC PACKET NAMED IS CLOSED — MEASURED, NOT
//      ASSERTED. §4.1 of that packet says "0 × 256 = 0, so the conversion
//      applied to an all-zero document is legal and nothing anywhere catches
//      it". That is right about the BOUND and one keyword short of the schema.
//      `rates` also carries `uniqueItems`, and an all-zero array of
//      `EFFECTS_REEL_BAND_COUNT` elements is five EQUAL values, which
//      `uniqueItems` refuses. `EFFECTS_REEL_X256_SURVIVORS` below is the census
//      that says so from the two constraints rather than from this comment.
//
//   2. ZERO IS A VALUE, deliberately unlike `drift.rate`'s `not: {const: 0}` —
//      a stationary strip among moving ones is a real authored choice.
//      `reelRateRefusal` therefore does NOT refuse 0, and `uniqueItems` is
//      what caps it at one occurrence (`reelRatesRefusal`).
//
//   3. SCREEN ORDER IS ARRAY ORDER. Index `i` owns screen X `64i..64i+63`, and
//      the contract's own words are that an editor which sorts `rates`
//      "silently relocates every strip". `reelStripScreenX` exists so the SPAN
//      can be the control's LABEL: a reordered array is then visibly out of
//      order in the label column, rather than being a fact only a reader of the
//      JSON could notice.
//
//   4. DEBUG TIER. The effect renders in NO release build, and no JSON keyword
//      can say so — the contract says the panel must. `EFFECTS_REELS_DEBUG_NOTE`
//      is that sentence, extracted verbatim.
//
// ⚠ THE GUIDANCE RANGE IS NOT A BOUND, and the contract says so in as many
// words ("that is UI guidance, never a refusal"). `EFFECTS_REEL_RATE_GUIDANCE`
// and `EFFECTS_REEL_RATE_BOUNDS` are two different quantities and the split is
// `rowRemapBuildableToday`'s: a control that folded them together would refuse
// a legal 100 for ever. The spinner's range is the SCHEMA's; the guidance is a
// sentence under it.

/** The `reels` node's own description — the only place four of its rules live. */
const REELS_DESCRIPTION: string = (() => {
  const d = at('properties', 'reels').description;
  if (typeof d !== 'string' || d.length === 0) {
    throw new Error(
      'effects scene schema properties.reels has no string description. Four of this key\'s '
      + 'constraints — the DEBUG tier, the screen-order map, the unit prohibition and the '
      + 'binding rule — exist ONLY in that prose, and Aurora extracts rather than restates '
      + 'them. Re-derive against the amended schema.',
    );
  }
  return d;
})();

/** Pull one clause out of that description, LOUDLY. */
function reelsClause(what: string, re: RegExp, group = 1): string {
  const m = re.exec(REELS_DESCRIPTION);
  if (!m || typeof m[group] !== 'string') {
    throw new Error(
      `effects scene schema properties.reels's description no longer states the "${what}" `
      + `clause (looked for ${re}). Aurora shows an author the CONTRACT'S sentence rather than `
      + 'a restatement of it, so there is nothing here to fall back to. Re-derive against the '
      + 'amended schema.',
    );
  }
  return m[group].trim();
}

/**
 * THE SENTENCE THE PANEL IS REQUIRED TO PUT ON SCREEN — hazard 4.
 *
 * The contract's own words, in both lengths, because a 300px column cannot hold
 * the long one and a hover cannot be the only place a required disclosure
 * lives: `short` is PAINTED and `full` rides the same element's `title`. That
 * split is `vDeformRampAdvisory`'s (`impact.short` / `impact.full`), and the
 * ramp card's before it.
 *
 * ⚠ BOTH HALVES ARE EXTRACTED, NEITHER IS COMPOSED. The requirement is a fact
 * about aeon's build (`OJZ_Reel_Speed`'s emitted length is 0 in release), and a
 * paraphrase in a `.tsx` file is a claim about another repo that no gate in this
 * one can re-check. If aeon ever ships the effect in release the contract drops
 * the clause and this module's import fails — loudly, taking the suite with it —
 * instead of leaving a panel warning about a limitation that is gone.
 */
export const EFFECTS_REELS_DEBUG_NOTE: { readonly short: string; readonly full: string } =
  Object.freeze({
    short: reelsClause('DEBUG tier, short',
      /so (a scene saved with reels shows NOTHING in a release build)/),
    full: reelsClause('DEBUG tier, full', /(DEBUG-ONLY[\s\S]*?must say so on screen\.)/),
  });

/**
 * WHY THE BUILD MAY REFUSE THE KEY WITH NOTHING ON SCREEN SAYING SO.
 *
 * `advisoryReelsBinding` speaks ONLY in the negative case and says in its own
 * words that its silence is not a clearance — so a surface that rendered that
 * advisory ALONE would present silence as an all-clear, which is the defect its
 * docblock names. This is the always-on half: the RULE, in aeon's words, shown
 * whenever the key is present, so an absent warning reads as "Aurora has
 * nothing to add" rather than as "the build will accept this".
 */
export const EFFECTS_REELS_BINDING_NOTE: { readonly short: string; readonly full: string } =
  Object.freeze({
    short: reelsClause('binding rule, short', /so (the generator REFUSES a reels key[^,]*)/),
    full: reelsClause('binding rule, full',
      /(BINDING \(section 2\.7\)[\s\S]*?silently reach other sections\.)/),
  });

/** The `rates` prohibition, verbatim — the sentence a refused rate is shown with. */
export const EFFECTS_REEL_NO_X256: string = reelsClause('x256 prohibition',
  /PROHIBITION: ([\s\S]*?\bbound is the ONLY place that mistake is caught today)/);

/**
 * How wide one strip is ON SCREEN, in pixels — walked out of the contract's own
 * `screen X 64i..64i+63` and CROSS-CHECKED against its `column-pairs 4i..4i+3`
 * in the same sentence.
 *
 * TWO STATEMENTS OF ONE GEOMETRY, so a contract that moved one and not the other
 * fails this import rather than letting the panel label a strip with a span it
 * does not own — and a wrong SPAN on a screen-order control is exactly the class
 * of error the label exists to make visible.
 */
export const EFFECTS_REEL_STRIP_WIDTH_PX: number = (() => {
  const x = /screen X (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESCRIPTION);
  if (!x) {
    throw new Error(
      'effects scene schema properties.reels no longer maps an index to a screen X span '
      + '("screen X 64i..64i+63"). That map is the whole reason array order is screen order; '
      + 're-derive it against the amended schema.',
    );
  }
  const stride = Number(x[1]);
  if (Number(x[2]) !== stride || Number(x[3]) !== stride - 1) {
    throw new Error(
      `effects scene schema properties.reels states the screen span as "${x[0]}", which is not `
      + `a contiguous tiling: a stride of ${stride} must run ${stride}i..${stride}i+${stride - 1}.`,
    );
  }
  const c = /column-pairs (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESCRIPTION);
  if (!c) {
    throw new Error(
      'effects scene schema properties.reels no longer states the column-pair span, so the '
      + 'screen stride cannot be cross-checked against the geometry it comes from.',
    );
  }
  const cols = Number(c[1]);
  if (Number(c[2]) !== cols || Number(c[3]) !== cols - 1 || stride % cols !== 0) {
    throw new Error(
      `effects scene schema properties.reels says a strip is ${stride} px wide ("${x[0]}") and `
      + `${cols} column-pairs ("${c[0]}"); ${stride} is not a whole multiple of ${cols}, so the `
      + 'two statements of one geometry disagree.',
    );
  }
  return stride;
})();

/** How many column-pairs a strip owns — the second half of the geometry above. */
export const EFFECTS_REEL_COLS_PER_BAND: number =
  Number((/column-pairs (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESCRIPTION) as RegExpExecArray)[1]);

/**
 * The screen X span strip `index` owns — `64i .. 64i+63`.
 *
 * THE PANEL'S LABEL, NOT A TOOLTIP. Hazard 3 is that array order IS screen order
 * and that an editor which reorders the array relocates every strip; the one
 * cheap defence a form has is to label each row with the pixels it governs, so a
 * row out of place is out of order ON SCREEN. Derived, so a contract that
 * changed the stride relabels the column instead of lying in it.
 */
export function reelStripScreenX(index: number): { min: number; max: number } {
  if (!Number.isInteger(index) || index < 0 || index >= EFFECTS_REEL_BAND_COUNT) {
    throw new Error(
      `reelStripScreenX: ${index} is not one of the ${EFFECTS_REEL_BAND_COUNT} strips. The band `
      + 'count is a code shape in aeon (it sizes a RAM array and is compiled into a shift), not '
      + 'a range an editor may extend.',
    );
  }
  const w = EFFECTS_REEL_STRIP_WIDTH_PX;
  return { min: index * w, max: index * w + w - 1 };
}

/**
 * The byte phase a rate accumulates into — the cycle length in frames at rate 1.
 *
 * DERIVED FROM TWO INDEPENDENT SENTENCES of the same description ("wraps mod
 * 256" and "256/|rate| frames") and cross-checked, the
 * `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` pattern. One is the mechanism and one is
 * the gloss; a contract that moved one and not the other would leave the readout
 * below stating a period no engine keeps.
 */
export const EFFECTS_REEL_PHASE_SPAN: number = (() => {
  const wrap = /wraps mod (\d+)/.exec(REELS_DESCRIPTION);
  const gloss = /(\d+)\/\|rate\| frames/.exec(REELS_DESCRIPTION);
  if (!wrap || !gloss) {
    throw new Error(
      'effects scene schema properties.reels no longer states BOTH the phase modulus '
      + '("wraps mod N") and the cycle gloss ("N/|rate| frames"); the reel period readout is '
      + 'derived from their agreement and has nothing to fall back to.',
    );
  }
  if (wrap[1] !== gloss[1]) {
    throw new Error(
      `effects scene schema properties.reels says the phase wraps mod ${wrap[1]} and that a `
      + `strip cycles every ${gloss[1]}/|rate| frames. Two statements of one quantity disagree.`,
    );
  }
  return Number(wrap[1]);
})();

/**
 * How many frames one full cycle of a strip takes, or `null` for a stationary
 * strip — which has no cycle, and 0 is legal here (hazard 2).
 *
 * IN FRAMES, NOT SECONDS, deliberately. The contract glosses its worked example
 * in seconds ("3 is a 1.4 s reel") but never states a refresh rate, and the one
 * this file already holds — `EFFECTS_BOB_TICKS_PER_SECOND` — is a LOGIC TICK
 * rate belonging to a different field. Borrowing it would be this file's own
 * recorded mistake (`clampRowRemapPlaneY`: two spaces sharing one reader) for a
 * conversion nobody asked for. Frames are exact, and are what the contract
 * states.
 */
export function reelCycleFrames(rate: number): number | null {
  if (!Number.isInteger(rate) || rate === 0) return null;
  return EFFECTS_REEL_PHASE_SPAN / Math.abs(rate);
}

/**
 * That cycle as words — "85.3 frames", or the stationary case said in full.
 *
 * ⚠ "STATIONARY" IS NOT "OFF" AND THIS IS THE STRING THAT HAS TO SAY SO. Zero
 * is a legal, deliberate value here (hazard 2), so a readout that rendered it as
 * an em-dash or a blank would put the one control state that means "this strip
 * deliberately does not move" on screen looking exactly like a control nobody
 * has filled in yet.
 *
 * THE FRACTION IS KEPT TO ONE DECIMAL rather than rounded to a whole frame: the
 * contract's own worked example is 256/3, which is 85⅓, and a readout that said
 * "85 frames" would be quietly claiming the phase divides evenly when the whole
 * mechanism is a byte accumulator that wraps.
 */
export function reelCycleLabel(rate: number): string {
  const frames = reelCycleFrames(rate);
  if (frames === null) return 'stationary (0 is a legal, deliberate rate here)';
  const shown = Math.round(frames * 10) / 10;
  return `${shown} frames per cycle`;
}

/**
 * THE USEFUL RANGE — AND IT IS NOT A BOUND.
 *
 * The contract's own qualifier is "that is UI guidance, never a refusal", so
 * this is kept strictly apart from `EFFECTS_REEL_RATE_BOUNDS` and never reaches
 * a spinner's `min`/`max` or a refusal. Same split and same reason as
 * `rowRemapBuildableToday` beside `rowRemapHeightShiftRefusal`: a legal value an
 * author has a reason for must stay authorable, and a control that folded the
 * two would refuse a legal 100 for ever.
 *
 * The interlock is what makes it safe to keep them adjacent: guidance must sit
 * INSIDE the legal span and the strobe threshold OUTSIDE the guidance, checked
 * at module load, so a contract that swapped the two quantities fails the import
 * rather than turning a hint into a bound.
 */
export const EFFECTS_REEL_RATE_GUIDANCE: {
  readonly min: number; readonly max: number; readonly strobe: number; readonly sentence: string;
} = (() => {
  const range = /useful slider range is about (-?\d+)\.\.(-?\d+)/.exec(REELS_DESCRIPTION);
  const strobe = /(\d+) and up is a strobe/.exec(REELS_DESCRIPTION);
  if (!range || !strobe) {
    throw new Error(
      'effects scene schema properties.reels no longer states its useful slider range and its '
      + 'strobe threshold. Both are UI GUIDANCE the contract wrote for a panel and neither is a '
      + 'refusal; re-derive against the amended schema rather than typing numbers in.',
    );
  }
  const min = Number(range[1]);
  const max = Number(range[2]);
  const strobeAt = Number(strobe[1]);
  const bounds = EFFECTS_REEL_RATE_BOUNDS;
  if (min >= max || min < bounds.min || max > bounds.max
      || strobeAt <= max || strobeAt > bounds.max) {
    throw new Error(
      `effects scene schema properties.reels states a useful range of ${min}..${max} and a `
      + `strobe threshold of ${strobeAt} against a legal span of ${bounds.min}..${bounds.max}. `
      + 'Guidance must sit INSIDE the bound and the strobe threshold OUTSIDE the guidance, or '
      + 'the two quantities have been confused for each other.',
    );
  }
  return Object.freeze({
    min, max, strobe: strobeAt,
    sentence: reelsClause('useful range',
      /(the useful slider range is about[^)]*never a refusal)/),
  });
})();

/**
 * Why this rate cannot be written, or null when it can — the ONE enforcement of
 * this unit that exists anywhere in the pipeline today.
 *
 * ⚠ 0 IS NOT REFUSED (hazard 2). `drift.rate` spells `not: {const: 0}` and this
 * node deliberately does not: a stationary strip among moving ones is a real
 * authored choice. What caps it at one occurrence is `uniqueItems`, a property
 * of the ARRAY, and therefore `reelRatesRefusal`'s job rather than this one's.
 *
 * THE MESSAGE CARRIES THE CONTRACT'S OWN PROHIBITION SENTENCE, because the
 * single likeliest way to land outside this bound is a ×256 nobody typed — a
 * panel or a paste off the drift path. 768 in this box means someone meant 3,
 * and the sentence saying so is aeon's rather than Aurora's.
 */
export function reelRateRefusal(rate: number): string | null {
  if (!Number.isInteger(rate)) {
    return `a reel rate is a whole number of pixels per frame; ${rate} is not an integer. `
      + 'There is no fixed point anywhere on this path.';
  }
  const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
  if (rate < min || rate > max) {
    return `${rate} is outside the contract's ${min}..${max}. THE UNIT IS SIGNED WHOLE PIXELS `
      + `PER FRAME — ${EFFECTS_REEL_NO_X256}.`;
  }
  return null;
}

/**
 * Why this whole array cannot be written, or null when it can — length and
 * `uniqueItems`, the two constraints no single box can see.
 *
 * SEPARATE FROM THE PER-VALUE REFUSAL, deliberately: a rate can be perfectly
 * legal on its own and still be the second 0 in the array, and a control that
 * asked only `reelRateRefusal` would author a document the codec refuses at
 * load. `uniqueItems` is what the contract uses to cap a stationary strip at one
 * occurrence, so this is hazard 2's other half.
 */
export function reelRatesRefusal(rates: readonly number[]): string | null {
  if (rates.length !== EFFECTS_REEL_BAND_COUNT) {
    return `a scene declares exactly ${EFFECTS_REEL_BAND_COUNT} reel rates and this has `
      + `${rates.length}. The count is a COPY of aeon's REEL_BAND_COUNT, which sizes a RAM `
      + 'array and is compiled into a shift — a code shape, not a field.';
  }
  for (let i = 0; i < rates.length; i++) {
    const why = reelRateRefusal(rates[i]);
    if (why !== null) return `strip ${i} (screen X ${reelStripScreenX(i).min}): ${why}`;
  }
  for (let i = 0; i < rates.length; i++) {
    const j = rates.indexOf(rates[i]);
    if (j !== i) {
      const zero = rates[i] === 0
        ? ' Zero IS a legal rate — a stationary strip is a real choice — but uniqueItems caps it '
          + 'at ONE strip.'
        : '';
      return `strips ${j} and ${i} both scroll at ${rates[i]} px/frame, and the contract requires `
        + 'the five to be PAIRWISE DISTINCT (two strips sharing a rate read as one wide strip).'
        + zero;
    }
  }
  return null;
}

/**
 * WHY THIS RATE IS LEGAL AND PROBABLY NOT WHAT YOU WANTED, or null.
 *
 * NEVER A REFUSAL, and the contract is explicit about that. It carries two of
 * the schema's own UI notes — the useful range and the strobe threshold — and
 * the panel renders it at the hint tier, not the warning tier, for the same
 * reason `rowRemapBuildableToday` is separate from `rowRemapHeightShiftRefusal`:
 * the document is correct and the build will take it.
 */
export function reelRateGuidance(rate: number): string | null {
  if (reelRateRefusal(rate) !== null) return null;
  const g = EFFECTS_REEL_RATE_GUIDANCE;
  if (Math.abs(rate) >= g.strobe) {
    return `${rate} px/frame is a strobe — ${reelCycleLabel(rate)}. Legal; the contract's own `
      + `guidance is a useful range of about ${g.min}..${g.max}.`;
  }
  if (rate < g.min || rate > g.max) {
    return `${rate} px/frame is outside the contract's suggested ${g.min}..${g.max}. Legal, and `
      + 'nothing refuses it — this is UI guidance, not a bound.';
  }
  return null;
}

/**
 * EVERY LEGAL RATE WHOSE ×256 IS ALSO LEGAL — the census that closes the hole
 * the codec packet left open, computed rather than argued.
 *
 * ═══ WHAT IT IS FOR ═══
 *
 * EW-REELS-CODEC §4.1 named one hole in "the bound is the only place the ×256
 * mistake is caught": `0 × 256 = 0`, so a drift-shaped converter applied to an
 * ALL-ZERO document emits a legal document. That sentence is right about the
 * BOUND and one keyword short of the schema. `rates` also carries `uniqueItems`,
 * and a document of `EFFECTS_REEL_BAND_COUNT` zeroes is that many EQUAL values,
 * which `uniqueItems` refuses.
 *
 * So a ×256'd document survives the bound only if EVERY rate is in this census,
 * and survives `uniqueItems` only if the five are distinct. This census's LENGTH
 * is therefore the whole answer: while it is smaller than the band count, NO
 * ×256'd document is legal, and the mistake is caught for every input rather
 * than for every nonzero input.
 *
 * ⚠ THE FACTOR IS SPELLED HERE AND NOWHERE ELSE ON THIS PATH, AND THIS IS NOT
 * THE WRITE PATH — it is the adversary, not a converter. Hazard 1 is that reels
 * must never route through drift's arithmetic; `EFFECTS_DRIFT_UNITS_PER_PIXEL`
 * is read here to compute what the mistake WOULD produce, which is the opposite
 * of applying it. Every reels write stores the integer it was given.
 */
export const EFFECTS_REEL_X256_SURVIVORS: readonly number[] = Object.freeze((() => {
  const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
  const out: number[] = [];
  for (let r = min; r <= max; r++) {
    if (reelRateRefusal(r * EFFECTS_DRIFT_UNITS_PER_PIXEL) === null) out.push(r);
  }
  return out;
})());

/**
 * Is the ×256 mistake caught for EVERY document, not merely for every nonzero
 * rate?
 *
 * True exactly when a ×256'd document cannot satisfy `items` and `uniqueItems`
 * at once — i.e. when the survivor census cannot fill the array with distinct
 * values. Derived from the two constraints, so a contract that widened the bound
 * or dropped `uniqueItems` flips this to `false` and the gate reading it goes
 * red, rather than leaving a comment claiming a defence the schema no longer
 * provides.
 */
export const EFFECTS_REEL_X256_FULLY_CAUGHT: boolean =
  EFFECTS_REEL_X256_SURVIVORS.length < EFFECTS_REEL_BAND_COUNT;
