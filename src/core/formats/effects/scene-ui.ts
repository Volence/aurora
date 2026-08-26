// What an effects-scene EDITOR is allowed to offer — every constraint read out
// of the committed contract schema at module load, never re-typed beside it.
//
// WHY THIS MODULE EXISTS AT ALL. §2.3's factor set is sixteen names; §2.1's
// `precision` is two; the layer count is 1..8; `world_y` is 0..32767. Those are
// exactly the kind of facts a form types into a `const` array and then holds
// forever, silently, after the contract moves. `scene.ts` already established the
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

/** Everything the schema permits for `precision`, in schema order. */
export const EFFECTS_PRECISION_VALUES = stringEnumAt('properties', 'precision');

/**
 * What the WAVE-1 UI offers for `precision` — `"cell"` only.
 *
 * `"line"` is a reserved engine tier (schema §2.1's own note: "wave-1 UI exposes
 * `cell` only"). It is FILTERED OUT OF the schema's list rather than written as a
 * one-element literal, so if a future amendment renames or removes `cell` this
 * becomes empty and its test fails loudly, instead of the UI offering a value the
 * schema no longer has.
 *
 * The filter is a wave-1 UI policy and NOT a validation rule: a scene document on
 * disk carrying `"line"` still loads, still round-trips and still saves — the
 * codec is the rulebook, and this list only decides what a dropdown shows.
 */
export const WAVE1_PRECISION_VALUES: readonly string[] =
  Object.freeze(EFFECTS_PRECISION_VALUES.filter(v => v === 'cell'));

/** Everything the schema permits for `transition`, in schema order. */
export const EFFECTS_TRANSITION_VALUES = stringEnumAt('properties', 'transition');

/** Everything the schema permits for `left_column_mask`, in schema order. */
export const EFFECTS_LEFT_COLUMN_MASK_VALUES = stringEnumAt('properties', 'left_column_mask');

/** `layers` is 1..8 items — 8 is the engine's MAX_PARALLAX_BANDS (§2.1). */
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
 * NO DEFAULTS ARE WRITTEN OUT. `dsa`, `phase`, `precision`, `transition` and the
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
