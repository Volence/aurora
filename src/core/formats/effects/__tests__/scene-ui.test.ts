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
  EFFECTS_TRANSITION_VALUES,
  EFFECTS_LEFT_COLUMN_MASK_VALUES,
  EFFECTS_LAYER_COUNT,
  EFFECTS_WORLD_Y_BOUNDS,
  EFFECTS_V_FACTOR_BOUNDS,
  EFFECTS_V_FACTOR_LOCK,
  EFFECTS_V_CENTER_BOUNDS,
  EFFECTS_V_OFFSET_BOUNDS,
  EFFECTS_V_CENTER_DEFAULT,
  EFFECTS_V_OFFSET_DEFAULT,
  EFFECTS_ANCHOR_CHANNEL_BOUNDS,
  EFFECTS_ANCHOR_SHIFT_BOUNDS,
  EFFECTS_ANCHOR_NONE,
  EFFECTS_LAYER_SHIFT_BOUNDS,
  EFFECTS_LAYER_SHIFT_NONE,
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
  it('reads transition and left_column_mask out of the schema', () => {
    expect([...EFFECTS_TRANSITION_VALUES]).toEqual(S.properties.transition.enum);
    expect([...EFFECTS_LEFT_COLUMN_MASK_VALUES]).toEqual(S.properties.left_column_mask.enum);
  });

  /**
   * THE RETIREMENT GATE (ROADMAP row 59). `precision` was a scene-level enum with
   * a derived constant and a dropdown; empyrean `0bd4753` deleted the key because
   * aeon deleted the STORAGE (`scene_dsl.emp:422-423`, `Scene.sc_precision`).
   *
   * WHAT THIS ROW IS FOR, since "a key is absent" sounds like it could only ever
   * be green. It is the gate on the RE-VENDOR, not on Aurora's own code: the
   * schema is a blob-pinned file extracted from empyrean, so this row goes red
   * the moment someone re-vendors a schema that brings `precision` back, or
   * hand-edits the vendored copy to re-add it — which is exactly how a dead
   * control would grow back, because scene-ui.ts derives its dropdowns FROM this
   * file. It is checked at BOTH levels deliberately: the key is gone from
   * `properties`, and `at()` — the accessor every derived constant goes through —
   * throws for it rather than yielding undefined.
   */
  it('has RETIRED precision: no schema key, and the accessor is loud about it', () => {
    // Anti-vacuous: we are looking at a real schema whose §2.1 siblings are here,
    // not at an empty object that would make any absence assertion pass.
    expect(Object.keys(S.properties)).toContain('transition');
    expect(Object.keys(S.properties)).toContain('left_column_mask');
    expect(Object.keys(S.properties)).not.toContain('precision');
    expect(() => at('properties', 'precision'))
      .toThrow(/nothing at properties\.precision/);
    // And nothing anywhere else in the schema spells it either — a retired field
    // moved into $defs rather than deleted would satisfy the row above.
    expect(JSON.stringify(rawSchema)).not.toMatch(/precision/);
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

  it('REFUSES every FACTOR_* name at v_factor: the item-35 regression', () => {
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

  /**
   * ROADMAP item 37: the UI clamps for v_center/v_offset read THESE, and this
   * row is what keeps them and the schema from drifting apart. Walked by hand
   * from the raw JSON, not through scene-ui's own `boundsAt`.
   */
  it('reads v_center and v_offset bounds and defaults out of the schema', () => {
    expect(EFFECTS_V_CENTER_BOUNDS).toEqual({
      min: S.properties.v_center.minimum,
      max: S.properties.v_center.maximum,
    });
    expect(EFFECTS_V_OFFSET_BOUNDS).toEqual({
      min: S.properties.v_offset.minimum,
      max: S.properties.v_offset.maximum,
    });
    expect(EFFECTS_V_CENTER_DEFAULT).toBe(S.properties.v_center.default);
    expect(EFFECTS_V_OFFSET_DEFAULT).toBe(S.properties.v_offset.default);
    // The shape the contract settled: v_center is a world_y (same space, same
    // range), v_offset is signed. Asserted so a schema that quietly went back
    // to unsigned would fail here, not at aeon's emit.
    expect(EFFECTS_V_CENTER_BOUNDS).toEqual(EFFECTS_WORLD_Y_BOUNDS);
    expect(EFFECTS_V_OFFSET_BOUNDS.min).toBeLessThan(0);
  });

  it('offers v_center/v_offset ranges the codec really enforces at both ends', () => {
    // ANTI-VACUOUS, on the v_factor row's pattern: one past each end is refused
    // with the bounds rule's OWN wording, the ends themselves are accepted.
    for (const [field, { min, max }] of [
      ['v_center', EFFECTS_V_CENTER_BOUNDS],
      ['v_offset', EFFECTS_V_OFFSET_BOUNDS],
    ] as const) {
      for (const v of [min, max, 0]) {
        const scene = newEffectsScene('probe');
        scene[field] = v;
        expect(() => serializeEffectsScene(scene), `${field} ${v} was refused`).not.toThrow();
      }
      const scene = newEffectsScene('probe');
      scene[field] = min - 1;
      expect(() => serializeEffectsScene(scene), `${field} ${min - 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${min - 1} is below the minimum ${min}`));
      scene[field] = max + 1;
      expect(() => serializeEffectsScene(scene), `${field} ${max + 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${max + 1} is above the maximum ${max}`));
      // And the read path refuses the same file, so a document authored
      // elsewhere cannot smuggle the value in.
      const onDisk = JSON.parse(serializeEffectsScene(newEffectsScene('probe')));
      onDisk[field] = max + 1;
      expect(() => parseEffectsScene(JSON.stringify(onDisk), 'probe'))
        .toThrow(new RegExp(`${field}: ${max + 1} is above the maximum ${max}`));
    }
  });

  /**
   * THE THREE NUMBERS INSIDE `anchor.at`, EACH DERIVED SEPARATELY.
   *
   * They are 0..3 / 0..15 / 0..15 today and it would be one line to read one
   * bound and reuse it three times. That is exactly the coupling
   * `EFFECTS_ANCHOR_SHIFT_BOUNDS`'s docblock exists to refuse — the shifts are
   * shift AMOUNTS whose top is a no-deform sentinel, `channel` is an ORDINAL
   * whose top is an ordinary channel, and a reader that shared a bound between
   * them would silently test the wrong sentinel the day the contract moves one.
   * Walked by hand out of the raw JSON, three separate walks.
   */
  it('reads anchor.at\'s channel and both shift bounds as THREE separate derivations', () => {
    const atArm = S.properties.anchor.oneOf.find((b: any) => b?.properties?.at);
    expect(atArm, 'the schema no longer has an anchor `at` branch').toBeTruthy();
    const props = atArm.properties.at.properties;
    expect(EFFECTS_ANCHOR_CHANNEL_BOUNDS)
      .toEqual({ min: props.channel.minimum, max: props.channel.maximum });
    expect(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa)
      .toEqual({ min: props.dsa.minimum, max: props.dsa.maximum });
    expect(EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb)
      .toEqual({ min: props.dsb.minimum, max: props.dsb.maximum });
    // ANTI-VACUOUS: all three walks landed on real, distinct schema nodes rather
    // than on one node reached three ways.
    expect(atArm.required).toEqual(['at']);
    expect(atArm.properties.at.required.slice().sort()).toEqual(['channel', 'dsa', 'dsb']);
  });

  /**
   * THE TWO OFFS ARE DIFFERENT STATES, AND THE SCHEMA SAYS SO IN TWO PLACES.
   *
   * `anchor: "none"` is no anchored split at all; an anchor whose two shifts are
   * both the sentinel still splits the bands and just deforms neither plane.
   * `rowRemap`'s precondition 2 needs the second and is not satisfied by the
   * first, so a control that offered one "off" would be offering an author a
   * choice they cannot see. This row is what keeps the two constants from being
   * folded together.
   */
  it('derives anchor\'s "no anchor" spelling, and it is NOT the shift sentinel', () => {
    expect(EFFECTS_ANCHOR_NONE).toBe(
      S.properties.anchor.oneOf.map((b: any) => b?.const).find((c: any) => typeof c === 'string'),
    );
    expect(EFFECTS_ANCHOR_NONE).toBe(S.properties.anchor.default);
    // Different TYPES, not merely different values — which is the structural
    // reason they can never be confused at the wire and the reason the UI must
    // not confuse them either.
    expect(typeof EFFECTS_ANCHOR_NONE).toBe('string');
    expect(typeof EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max).toBe('number');
    // And both really are accepted by the codec: an anchor with both shifts on
    // the sentinel is a legal document, not a spelling of "none".
    for (const anchor of [
      EFFECTS_ANCHOR_NONE,
      { at: {
        channel: EFFECTS_ANCHOR_CHANNEL_BOUNDS.min,
        dsa: EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max,
        dsb: EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max,
      } },
    ]) {
      const scene = newEffectsScene('probe');
      (scene as unknown as Record<string, unknown>).anchor = anchor;
      expect(() => serializeEffectsScene(scene), `anchor ${JSON.stringify(anchor)} was refused`)
        .not.toThrow();
      // Round-tripped, not merely accepted: the codec writes it and reads it back
      // as the same value, which is what a writer for this key depends on.
      const text = serializeEffectsScene(scene);
      expect(parseEffectsScene(text, 'probe').anchor).toEqual(anchor);
    }
  });

  it('offers anchor.at ranges the codec really enforces at both ends', () => {
    // ANTI-VACUOUS, on the v_center row's pattern: every legal value in each of
    // the three ranges serializes, and one past each end is refused with the
    // bounds rule's own wording. A clamp into a range nothing enforces would
    // otherwise look exactly like this.
    const seed = () => ({
      channel: EFFECTS_ANCHOR_CHANNEL_BOUNDS.min,
      dsa: EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa.max,
      dsb: EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb.max,
    });
    for (const [field, { min, max }] of [
      ['channel', EFFECTS_ANCHOR_CHANNEL_BOUNDS],
      ['dsa', EFFECTS_ANCHOR_SHIFT_BOUNDS.dsa],
      ['dsb', EFFECTS_ANCHOR_SHIFT_BOUNDS.dsb],
    ] as const) {
      for (let v = min; v <= max; v++) {
        const scene = newEffectsScene('probe');
        (scene as unknown as Record<string, unknown>).anchor = { at: { ...seed(), [field]: v } };
        expect(() => serializeEffectsScene(scene), `anchor.at.${field} ${v} was refused`)
          .not.toThrow();
      }
      const scene = newEffectsScene('probe');
      (scene as unknown as Record<string, unknown>).anchor =
        { at: { ...seed(), [field]: min - 1 } };
      expect(() => serializeEffectsScene(scene), `anchor.at.${field} ${min - 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${min - 1} is below the minimum ${min}`));
      (scene as unknown as Record<string, unknown>).anchor =
        { at: { ...seed(), [field]: max + 1 } };
      expect(() => serializeEffectsScene(scene), `anchor.at.${field} ${max + 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${max + 1} is above the maximum ${max}`));
    }
  });

  /**
   * A LAYER'S OWN dsa/dsb, DERIVED FROM `$defs/layer` AND FROM NOWHERE ELSE.
   *
   * Three shift spaces in this contract read 0..15 today: a layer's plain
   * `dsa`/`dsb`, `$defs/layerDeform`'s `own.shift_a`/`shift_b`, and the anchor's
   * `at.dsa`/`dsb`. Sharing a bound between any two of them is one line and
   * looks harmless while the numbers agree. It is the coupling that INVERTS a
   * control the day one moves: the sentinel would be offered as a rung and the
   * loudest rung labelled off. Walked by hand out of the raw JSON, by a
   * different route than the module takes.
   */
  it('reads a LAYER\'s dsa/dsb bounds out of $defs.layer, not out of the two neighbouring shift spaces', () => {
    const lp = S.$defs.layer.properties;
    expect(EFFECTS_LAYER_SHIFT_BOUNDS.dsa).toEqual({ min: lp.dsa.minimum, max: lp.dsa.maximum });
    expect(EFFECTS_LAYER_SHIFT_BOUNDS.dsb).toEqual({ min: lp.dsb.minimum, max: lp.dsb.maximum });
    // ANTI-VACUOUS: the three spaces are three DISTINCT schema nodes, so the two
    // walks above landed somewhere the other constants do not reach. (Their
    // VALUES agree today - that is the coincidence, and asserting the values
    // differed would be asserting the bug.)
    const ownArm = S.$defs.layerDeform.oneOf.find((b: any) => b?.properties?.own);
    expect(ownArm, 'the schema no longer has a layerDeform `own` branch').toBeTruthy();
    expect(ownArm.properties.own.properties.shift_a).not.toBe(lp.dsa);
    const atArm = S.properties.anchor.oneOf.find((b: any) => b?.properties?.at);
    expect(atArm.properties.at.properties.dsa).not.toBe(lp.dsa);
  });

  /**
   * THE SENTINEL IS SAID TWICE AND THE TWO MUST AGREE.
   *
   * `maximum` makes 15 the top of the range - the value a clamping control
   * authors by accident. `default` makes 15 the value an ABSENT key already
   * means - which is what licenses OFF to clear the key instead of writing it,
   * and it is aeon's `layer(… dsa: int = 15, dsb: int = 15)` from the other
   * side. The control rests on both sentences, so this row asserts they are the
   * same number rather than trusting that they still are.
   *
   * ⚠ THE ANCHOR'S PAIR COULD NOT HAVE THIS ROW, and the difference is the whole
   * reason the two controls WRITE differently: `anchor.at` declares channel, dsa
   * and dsb all `required` with no default, so an anchor's sentinel must be
   * SPELLED. A layer's is optional and defaulted, so it need not be.
   */
  it('derives a layer\'s no-deform sentinel from BOTH maximum and default, and they agree', () => {
    const lp = S.$defs.layer.properties;
    for (const field of ['dsa', 'dsb'] as const) {
      expect(EFFECTS_LAYER_SHIFT_NONE, field).toBe(lp[field].maximum);
      expect(EFFECTS_LAYER_SHIFT_NONE, field).toBe(lp[field].default);
    }
    // The structural asymmetry this row's docblock rests on, asserted rather
    // than asserted-in-prose: the layer's pair is OPTIONAL and defaulted, the
    // anchor's is REQUIRED and undefaulted.
    expect(S.$defs.layer.required).not.toContain('dsa');
    expect(S.$defs.layer.required).not.toContain('dsb');
    const atArm = S.properties.anchor.oneOf.find((b: any) => b?.properties?.at);
    expect(atArm.properties.at.required).toContain('dsa');
    expect(atArm.properties.at.properties.dsa.default).toBeUndefined();
  });

  it('offers a layer dsa/dsb range the codec really enforces at both ends', () => {
    // ANTI-VACUOUS, on the anchor row's pattern: every legal value serializes
    // and one past each end is refused in the bounds rule's own wording. A
    // ladder over a range nothing enforces would otherwise look identical.
    for (const field of ['dsa', 'dsb'] as const) {
      const { min, max } = EFFECTS_LAYER_SHIFT_BOUNDS[field];
      for (let v = min; v <= max; v++) {
        const scene = newEffectsScene('probe');
        (scene.layers[0] as unknown as Record<string, unknown>)[field] = v;
        expect(() => serializeEffectsScene(scene), `layer ${field} ${v} was refused`).not.toThrow();
        // Round-tripped, not merely accepted - a writer for this key depends on
        // reading back what it wrote.
        expect(parseEffectsScene(serializeEffectsScene(scene), 'probe').layers[0][field]).toBe(v);
      }
      const scene = newEffectsScene('probe');
      (scene.layers[0] as unknown as Record<string, unknown>)[field] = min - 1;
      expect(() => serializeEffectsScene(scene), `layer ${field} ${min - 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${min - 1} is below the minimum ${min}`));
      (scene.layers[0] as unknown as Record<string, unknown>)[field] = max + 1;
      expect(() => serializeEffectsScene(scene), `layer ${field} ${max + 1} was accepted`)
        .toThrow(new RegExp(`${field}: ${max + 1} is above the maximum ${max}`));
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
      notices: [], loadedPaths: [],
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
    for (const defaulted of ['transition', 'v_center', 'v_offset', 'deform_bg']) {
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
