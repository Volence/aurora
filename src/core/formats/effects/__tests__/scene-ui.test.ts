// The UI constraint set, checked against the SCHEMA FILE rather than against a
// list retyped in the test.
//
// THE RULE THIS FILE IS BUILT ON: an expectation copied from the module under
// test proves only that someone typed the same thing twice. So every row here
// re-derives its expectation from `aurora-effects-scene.schema.json` by a
// DIFFERENT route than scene-ui.ts takes — reading the raw JSON import and
// walking it explicitly — and compares the two. When the contract moves, both
// sides move together and the row stays honest; when only the module moves, the
// row fails.
//
// The blob-pin on that file (effects-schema-drift.test.ts) is what makes the
// schema a fixed point worth deriving from at all.

import { describe, it, expect } from 'vitest';
import rawSchema from '../aurora-effects-scene.schema.json';
import {
  EFFECTS_FACTOR_NAMES,
  EFFECTS_PACKED_FACTOR_BOUNDS,
  EFFECTS_PRECISION_VALUES,
  WAVE1_PRECISION_VALUES,
  EFFECTS_TRANSITION_VALUES,
  EFFECTS_LEFT_COLUMN_MASK_VALUES,
  EFFECTS_LAYER_COUNT,
  EFFECTS_WORLD_Y_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS,
  EFFECTS_V_FACTOR_LOCK,
  isNamedFactor,
  factorLabel,
  isValidSceneId,
  takenSceneIds,
  sceneIdRefusal,
  newEffectsScene,
  newEffectsLayer,
  cloneEffectsScene,
  at,
} from '../scene-ui';
import { parseEffectsScene, serializeEffectsScene, type EffectsSceneLibrary } from '../scene';

// The schema, walked by hand — deliberately not through scene-ui's own `at()`.
const S = rawSchema as unknown as Record<string, any>;

describe('factor set (schema §2.3)', () => {
  it('offers exactly the named factors the schema publishes, in its order', () => {
    const fromSchema = S.$defs.factor.oneOf[0].enum;
    expect(fromSchema, 'the schema branch this derives from is gone').toBeInstanceOf(Array);
    expect([...EFFECTS_FACTOR_NAMES]).toEqual(fromSchema);
    // Sixteen is what the contract prose says; asserted so a schema that lost
    // half its factors would fail here as well as agreeing with itself.
    expect(EFFECTS_FACTOR_NAMES).toHaveLength(16);
    expect(EFFECTS_FACTOR_NAMES).toContain('FACTOR_LOCKED');
    expect(EFFECTS_FACTOR_NAMES).toContain('FACTOR_15_16');
  });

  it('bounds the custom packed form from the schema, not from prose', () => {
    const packed = S.$defs.factor.oneOf[1].properties;
    expect(EFFECTS_PACKED_FACTOR_BOUNDS.s1)
      .toEqual({ min: packed.s1.minimum, max: packed.s1.maximum });
    expect(EFFECTS_PACKED_FACTOR_BOUNDS.s2)
      .toEqual({ min: packed.s2.minimum, max: packed.s2.maximum });
    expect([...EFFECTS_PACKED_FACTOR_BOUNDS.op]).toEqual(packed.op.enum);
  });

  it('accepts every published name and the packed form through the real validator', () => {
    // ANTI-VACUOUS: the list is only worth offering if the codec accepts what it
    // offers. Each name is round-tripped through serializeEffectsScene, which
    // validates on the way out and throws on anything the schema refuses — so a
    // list carrying a name the schema dropped fails here, not in the running UI.
    for (const name of EFFECTS_FACTOR_NAMES) {
      const scene = newEffectsScene('probe');
      scene.layers[0].fa = name;
      // NOT `scene.v_factor = name` — that line used to be here, and it was the
      // defect. `v_factor` is a shift count, not a $defs/factor (item 35); its
      // own coverage is the v_factor describe block below.
      expect(() => serializeEffectsScene(scene), `factor ${name} was refused`).not.toThrow();
    }
    const packedScene = newEffectsScene('probe');
    packedScene.layers[0].fb = {
      s1: EFFECTS_PACKED_FACTOR_BOUNDS.s1.max,
      s2: EFFECTS_PACKED_FACTOR_BOUNDS.s2.min,
      op: EFFECTS_PACKED_FACTOR_BOUNDS.op[1] as 0 | 1,
    };
    expect(() => serializeEffectsScene(packedScene)).not.toThrow();
  });

  it('labels both factor forms distinguishably', () => {
    expect(isNamedFactor('FACTOR_1_2')).toBe(true);
    expect(isNamedFactor({ s1: 2, s2: 4, op: 1 })).toBe(false);
    expect(factorLabel('FACTOR_1_2')).toBe('FACTOR_1_2');
    expect(factorLabel({ s1: 2, s2: 4, op: 1 })).toBe('packed(2, 4, -)');
    expect(factorLabel({ s1: 2, s2: 4, op: 0 })).toBe('packed(2, 4, +)');
  });
});

describe('scene-level enumerations and bounds (schema §2.1/§2.2)', () => {
  it('reads precision, transition and left_column_mask out of the schema', () => {
    expect([...EFFECTS_PRECISION_VALUES]).toEqual(S.properties.precision.enum);
    expect([...EFFECTS_TRANSITION_VALUES]).toEqual(S.properties.transition.enum);
    expect([...EFFECTS_LEFT_COLUMN_MASK_VALUES]).toEqual(S.properties.left_column_mask.enum);
  });

  it('offers only "cell" precision in wave 1, and derives that BY FILTERING the schema', () => {
    // The wave-1 policy: "line" is a reserved engine tier (§2.1).
    expect([...WAVE1_PRECISION_VALUES]).toEqual(['cell']);
    // The derivation, not just the answer: what it offers is a subset of what the
    // schema permits, and it is what remains after dropping "line". A hardcoded
    // ['cell'] would satisfy the line above and fail this one the moment the
    // schema renamed the value.
    for (const v of WAVE1_PRECISION_VALUES) expect(EFFECTS_PRECISION_VALUES).toContain(v);
    expect([...WAVE1_PRECISION_VALUES])
      .toEqual(S.properties.precision.enum.filter((v: string) => v !== 'line'));
  });

  it('reads v_factor\'s range out of the schema, NOT out of $defs/factor', () => {
    expect(EFFECTS_V_FACTOR_BOUNDS).toEqual({
      min: S.properties.v_factor.minimum,
      max: S.properties.v_factor.maximum,
    });
    // The derivation that matters: this field is NOT a factor. If a future
    // amendment $ref'd it back to $defs/factor, `minimum`/`maximum` would be
    // gone and boundsAt would have thrown at import — but assert the shape
    // directly too, because that is the class of defect item 35 was.
    expect(S.properties.v_factor.$ref, 'v_factor must not be a $ref again').toBeUndefined();
    expect(S.properties.v_factor.type).toBe('integer');
    // $defs/factor is deliberately untouched and still governs fa/fb/curve.to.
    expect(S.$defs.factor.oneOf, 'the factor set must survive the retype').toBeInstanceOf(Array);
    expect(S.$defs.layer.properties.fa.$ref).toBe('#/$defs/factor');
  });

  it('derives the lock sentinel from the schema, and the schema still names it', () => {
    expect(EFFECTS_V_FACTOR_LOCK).toBe(S.properties.v_factor.maximum);
    // The other half of the derivation: the number is `maximum`, and the CLAIM
    // that this number means "locked" is the schema's own description. scene-ui
    // asserts this at module load; restated here so the coupling is visible.
    expect(S.properties.v_factor.description)
      .toMatch(new RegExp(`\\b${EFFECTS_V_FACTOR_LOCK}\\b[^.]*LOCK SENTINEL`));
  });

  it('offers a v_factor range the validator really enforces at both ends', () => {
    // ANTI-VACUOUS: the bounds are only worth offering if one past each end is
    // actually refused, and every value inside is actually accepted.
    const { min, max } = EFFECTS_V_FACTOR_BOUNDS;
    for (let v = min; v <= max; v++) {
      const scene = newEffectsScene('probe');
      scene.v_factor = v;
      expect(() => serializeEffectsScene(scene), `v_factor ${v} was refused`).not.toThrow();
    }
    // MATCHERS ARE THE BOUNDS RULE'S OWN WORDING, not just "/v_factor/". A loose
    // matcher here would be satisfied by the `required` error too, so a schema
    // that DROPPED the field would report this row green (bar 2c/2d(i)).
    const scene = newEffectsScene('probe');
    scene.v_factor = min - 1;
    expect(() => serializeEffectsScene(scene), `v_factor ${min - 1} was accepted`)
      .toThrow(new RegExp(`v_factor: ${min - 1} is below the minimum ${min}`));
    scene.v_factor = max + 1;
    expect(() => serializeEffectsScene(scene), `v_factor ${max + 1} was accepted`)
      .toThrow(new RegExp(`v_factor: ${max + 1} is above the maximum ${max}`));
  });

  it('REFUSES every FACTOR_* name at v_factor — the item-35 regression', () => {
    // The defect, stated as a property: the sixteen names that are legal at a
    // LAYER's fa are all illegal at the SCENE's v_factor. Driven off the schema's
    // own enum, so it covers whatever set §2.3 publishes.
    expect(EFFECTS_FACTOR_NAMES.length, 'the factor enum is empty').toBeGreaterThan(0);
    for (const name of EFFECTS_FACTOR_NAMES) {
      const scene = newEffectsScene('probe');
      // The cast is the point: TypeScript refuses this now, and the run-time
      // codec must refuse it too — a document off disk carries no types.
      (scene as unknown as Record<string, unknown>).v_factor = name;
      expect(() => serializeEffectsScene(scene), `v_factor accepted the name ${name}`)
        .toThrow(/v_factor: expected integer, got string/);
    }
  });

  it('reads the layer count and world_y range out of the schema', () => {
    expect(EFFECTS_LAYER_COUNT)
      .toEqual({ min: S.properties.layers.minItems, max: S.properties.layers.maxItems });
    expect(EFFECTS_WORLD_Y_BOUNDS).toEqual({
      min: S.$defs.layer.properties.world_y.minimum,
      max: S.$defs.layer.properties.world_y.maximum,
    });
  });

  it('has a layer ceiling the validator really enforces', () => {
    // ANTI-VACUOUS again: EFFECTS_LAYER_COUNT.max is only useful if a scene with
    // one more layer is actually refused.
    const scene = newEffectsScene('probe');
    for (let i = 1; i <= EFFECTS_LAYER_COUNT.max; i++) scene.layers.push(newEffectsLayer(i * 16));
    expect(scene.layers.length).toBe(EFFECTS_LAYER_COUNT.max + 1);
    expect(() => serializeEffectsScene(scene)).toThrow(/schema/);
    scene.layers.pop();
    expect(() => serializeEffectsScene(scene)).not.toThrow();
  });
});

describe('scene identity', () => {
  it('accepts and refuses ids by the schema pattern, not by a retyped regex', () => {
    const pattern = new RegExp(S.properties.id.pattern);
    for (const id of ['canopy_dusk', 'a', 'z9_0', 'a'.repeat(32)]) {
      expect(isValidSceneId(id), id).toBe(pattern.test(id));
      expect(isValidSceneId(id), id).toBe(true);
    }
    // The asymmetry scene.ts's docblock names: a perfectly good bgLayoutRef is
    // not a legal sceneRef.
    for (const id of ['forest-1718000000', 'Canopy', '9lives', '', 'a'.repeat(33), 'a b']) {
      expect(isValidSceneId(id), id).toBe(pattern.test(id));
      expect(isValidSceneId(id), id).toBe(false);
    }
  });

  it('counts an UNREADABLE file as a taken id, not a free one', () => {
    const library: EffectsSceneLibrary = {
      scenes: [newEffectsScene('canopy_dusk')],
      unreadable: [{ path: 'data/editor/effects/broken.json', reason: 'nope' }],
      notices: [],
    };
    expect([...takenSceneIds(library)].sort()).toEqual(['broken', 'canopy_dusk']);
    // ...and the refusal SAYS which kind of collision it is, because the two need
    // different actions from the author.
    expect(sceneIdRefusal('canopy_dusk', library)).toMatch(/already a scene/);
    expect(sceneIdRefusal('broken', library)).toMatch(/could not be read/);
    expect(sceneIdRefusal('new_one', library)).toBeNull();
    expect(sceneIdRefusal('Not-Legal', library)).toMatch(/not a legal scene id/);
  });
});

describe('construction', () => {
  it('makes a scene the codec accepts, carrying no defaults it did not have to', () => {
    const scene = newEffectsScene('canopy_dusk', 'Canopy at dusk');
    const text = serializeEffectsScene(scene);
    expect(parseEffectsScene(text, 'canopy_dusk')).toEqual(scene);

    // Required keys, plus `name`, and NOTHING ELSE. Derived from the schema's own
    // `required` list so a contract change that adds a required key fails here.
    const written = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(written).sort())
      .toEqual([...S.required, 'name'].sort());
    // Named explicitly because it is the property scene.ts's model comment turns
    // on: writing a default out would make every untouched load/save a diff.
    for (const defaulted of ['precision', 'transition', 'v_center', 'v_offset', 'deform_bg']) {
      expect(written, `${defaulted} must not be written`).not.toHaveProperty(defaulted);
    }
    expect(Object.keys(written.layers as object[])).toHaveLength(1);
    expect(Object.keys((written.layers as Record<string, unknown>[])[0]).sort())
      .toEqual(['fa', 'fb', 'world_y']);

    // ITEM 35. A new scene starts LOCKED, spelled in the shift space this field
    // actually occupies — a number, and specifically the schema's own sentinel.
    // The default used to be the string 'FACTOR_0', which is locked in the PACKED
    // space and folds to the byte 255 in this one.
    expect(written.v_factor).toBe(EFFECTS_V_FACTOR_LOCK);
    expect(typeof written.v_factor, 'a FACTOR_* name would be a string').toBe('number');
  });

  it('omits an empty name rather than writing an empty string', () => {
    expect(newEffectsScene('a')).not.toHaveProperty('name');
    expect(newEffectsScene('a', '')).not.toHaveProperty('name');
  });

  it('copies the factors of the layer it is added under', () => {
    expect(newEffectsLayer(96, { fa: 'FACTOR_1_4', fb: { s1: 2, s2: 4, op: 1 } }))
      .toEqual({ world_y: 96, fa: 'FACTOR_1_4', fb: { s1: 2, s2: 4, op: 1 } });
    expect(newEffectsLayer(96)).toEqual({ world_y: 96, fa: 'FACTOR_1', fb: 'FACTOR_1' });
  });

  it('deep-copies a scene INCLUDING fields no form knows about', () => {
    // The whole reason the clone is structuredClone and not a hand-written
    // copier: `budget_class` and the packed `fb` are not in any wave-1 form, and
    // a field-enumerating clone would drop exactly these.
    const original = parseEffectsScene(JSON.stringify({
      schema: 1, id: 'canopy_dusk', name: 'x',
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: { s1: 2, s2: 4, op: 1 } }],
      v_factor: EFFECTS_V_FACTOR_LOCK, budget_class: 'heavy',
      anchor: { at: { channel: 1, dsa: 3, dsb: 4 } },
    }), 'canopy_dusk');

    const copy = cloneEffectsScene(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.layers[0]).not.toBe(original.layers[0]);
    expect(copy.budget_class).toBe('heavy');

    // Mutating the copy must not reach the original — the property an undo
    // command's two halves depend on.
    copy.layers[0].world_y = 999;
    copy.budget_class = 'light';
    expect(original.layers[0].world_y).toBe(0);
    expect(original.budget_class).toBe('heavy');
  });
});

describe('a constraint that stops being derivable is LOUD', () => {
  // Every constant in the module is `at(...)` evaluated at import. This is the
  // half a happy-path test never reaches: what `at` does when the contract MOVED
  // a node someone is still reading. Silence there is the dangerous answer.
  it('throws naming the full path it could not walk', () => {
    expect(() => at('$defs', 'factor', 'oneOf', 7))
      .toThrow('effects scene schema has nothing at $defs.factor.oneOf.7');
    expect(() => at('properties', 'no_such_key'))
      .toThrow('effects scene schema has nothing at properties.no_such_key');
  });

  it('throws rather than returning a scalar a caller would read properties off', () => {
    // `properties.id.pattern` is a string. Handing that back would let
    // `stringEnumAt`/`boundsAt` read `.enum`/`.minimum` off it and get undefined
    // — the quiet path again, one level in.
    expect(() => at('properties', 'id', 'pattern')).toThrow(/is not an object/);
  });

  it('still walks a path that IS there', () => {
    // The control. Without it the two rows above would pass for an `at` that
    // throws unconditionally.
    expect(at('$defs', 'factor', 'oneOf', 0)).toHaveProperty('enum');
  });
});
