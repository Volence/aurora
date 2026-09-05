import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseEffectsScene,
  serializeEffectsScene,
  advisoryReelsBinding,
  EFFECTS_SCENE_SCHEMA,
  EFFECTS_REEL_BAND_COUNT,
  EFFECTS_REEL_RATE_BOUNDS,
  type EffectsScene,
} from '../../src/core/formats/effects/scene';
import { validateAgainstSchema, type JsonSchema } from '../../src/core/formats/effects/json-schema-subset';
import { EFFECTS_DRIFT_UNITS_PER_PIXEL } from '../../src/core/formats/effects/scene-ui';

/**
 * `reels` — the codec half of EFFECTS-W1 DoD item 10.
 *
 * CONTRACT: empyrean `ff3f43f`, `contract/schema/aurora-effects-scene.schema.json`
 * §2.7, vendored at `src/core/formats/effects/aurora-effects-scene.schema.json`
 * (blob `05f58fb9`, pinned by the sidecar and hashed by
 * `effects-schema-drift.test.ts` — THAT is the pin of record and this is prose
 * beside it). Engine: aeon `OJZ_Reels_Fill`,
 * `games/sonic4/data/effects/ojz_effects.emp` at `660aabc0`.
 *
 * ⚠ HOW THE EXPECTATIONS BELOW ARE OBTAINED. Every bound, length and rate span
 * is READ OUT OF THE VENDORED SCHEMA at the top of this file and used to BUILD
 * the subjects — never typed beside it. A row that compares a derived constant
 * to a literal proves that two people typed the same number; a row that compares
 * it to the node it was derived from proves nothing at all. So the rows assert
 * BEHAVIOUR ("this document is accepted / refused / comes back unchanged") over
 * subjects the schema itself sized.
 *
 * ⚠⚠ THE VACUOUS SHAPE THIS FILE MUST NOT HAVE. A round-trip over a document
 * with NO `reels` key passes whether or not anything here was implemented. Every
 * round-trip row below therefore asserts the instrument SAW the key — on the
 * TEXT that went in and on the TEXT that came out, not on a parsed object where
 * an absent key and a dropped key look alike.
 *
 * WHAT THIS FILE CANNOT SEE. It is node-only: no React, no canvas, no running
 * app, and above all NO EMULATOR. It says nothing about whether five strips
 * actually scroll — and could not, because the effect is DEBUG-TIER and renders
 * in no release build at all. Every claim here is about bytes.
 */

const RATES_NODE = ((EFFECTS_SCENE_SCHEMA.properties as Record<string, JsonSchema>)
  .reels.properties as Record<string, JsonSchema>).rates;

const GOLDEN_PATH = resolve(__dirname, '../fixtures/effects/canopy_dusk.json');
const GOLDEN = readFileSync(GOLDEN_PATH, 'utf8');

/** A minimal legal scene, with `reels` filled from the schema's own bounds. */
function sceneWithRates(rates: number[]): EffectsScene {
  return {
    schema: 1,
    id: 'reel_probe',
    layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' }],
    v_factor: 1,
    reels: { rates },
  };
}

/** `n` distinct legal rates, derived from the node: min, min+1, … */
function distinctLegalRates(n = EFFECTS_REEL_BAND_COUNT): number[] {
  return Array.from({ length: n }, (_, i) => EFFECTS_REEL_RATE_BOUNDS.min + i);
}

describe('effects scene `reels`: the constants are the schema\'s, not this file\'s', () => {
  it('EFFECTS_REEL_BAND_COUNT is the length the schema enforces, both bounds', () => {
    // Not "equals 5": an array one SHORT and one LONG of the derived count are
    // both refused, and one AT it is accepted. That is the property; the number
    // is whatever the contract says.
    const ok = distinctLegalRates(EFFECTS_REEL_BAND_COUNT);
    expect(validateAgainstSchema(ok, RATES_NODE, EFFECTS_SCENE_SCHEMA)).toEqual([]);

    const short = ok.slice(0, -1);
    expect(validateAgainstSchema(short, RATES_NODE, EFFECTS_SCENE_SCHEMA)
      .some(i => /minimum/.test(i.message))).toBe(true);

    const long = [...ok, EFFECTS_REEL_RATE_BOUNDS.max];
    expect(validateAgainstSchema(long, RATES_NODE, EFFECTS_SCENE_SCHEMA)
      .some(i => /maximum/.test(i.message))).toBe(true);
  });

  it('EFFECTS_REEL_RATE_BOUNDS names the span the schema accepts, edges included', () => {
    const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
    // Both EXTREMES are legal — the bound is inclusive, and an off-by-one at
    // either end is a refusal the author would never see coming.
    const atEdges = [min, max, 0, 1, -1].slice(0, EFFECTS_REEL_BAND_COUNT);
    expect(validateAgainstSchema(atEdges, RATES_NODE, EFFECTS_SCENE_SCHEMA)).toEqual([]);

    for (const outside of [min - 1, max + 1]) {
      const rates = [outside, ...distinctLegalRates(EFFECTS_REEL_BAND_COUNT - 1)];
      const issues = validateAgainstSchema(rates, RATES_NODE, EFFECTS_SCENE_SCHEMA);
      expect(issues, `${outside} must be refused`).toHaveLength(1);
      expect(issues[0].path).toBe('/0');
    }
  });

  /**
   * ⚠ THE ×256 PROHIBITION, asserted as the schema's own arithmetic rather than
   * as a promise about code.
   *
   * `drift.rate` is 1/256 px per frame and Aurora multiplies by
   * `EFFECTS_DRIFT_UNITS_PER_PIXEL` on export. `reels.rates` is WHOLE PIXELS and
   * must not. A panel copied from the drift path would emit 768 for an intended
   * 3, and the contract says this bound is "the ONLY place that mistake is
   * caught today". So the row measures exactly that: for every legal rate the
   * conversion could be applied to, the CONVERTED value is refused.
   *
   * Both numbers are read from the two contracts (`EFFECTS_DRIFT_UNITS_PER_PIXEL`
   * out of the drift node's description, the span out of the reels node), so a
   * future amendment that widened the reels bound past ±256 would move this row
   * rather than leave it asserting yesterday's arithmetic.
   *
   * AND THE ONE HOLE IS NAMED, not papered over: 0 × 256 is 0, which is legal.
   * A panel that applied the conversion to a scene of all-zero rates would emit
   * a legal document. Nothing catches that, here or anywhere.
   */
  it('the schema refuses every ×256 of a legal nonzero rate: the only catch there is', () => {
    const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
    const item = RATES_NODE.items as JsonSchema;
    const legal = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    // Anti-vacuous: the span really is a span, and really includes 3 — the
    // contract's own worked example of the mistake ("768 for an intended 3").
    expect(legal.length).toBeGreaterThan(2);
    expect(legal).toContain(3);
    expect(EFFECTS_DRIFT_UNITS_PER_PIXEL).toBeGreaterThan(1);

    const survived = legal
      .map(r => r * EFFECTS_DRIFT_UNITS_PER_PIXEL)
      .filter(scaled => validateAgainstSchema(scaled, item, EFFECTS_SCENE_SCHEMA).length === 0);
    // Zero is the sole survivor, and it survives because it is unchanged.
    expect(survived).toEqual([0]);

    // The contract's worked example, spelled out.
    expect(3 * EFFECTS_DRIFT_UNITS_PER_PIXEL).toBe(768);
    expect(validateAgainstSchema(768, item, EFFECTS_SCENE_SCHEMA)).toHaveLength(1);
  });

  /**
   * ZERO IS A VALUE HERE — deliberately unlike `drift.rate`, whose node spells
   * `not: {const: 0}`. Asserted as a CONTRAST between the two committed nodes,
   * so it cannot pass by both having been given the same ruling.
   */
  it('accepts 0 as a rate, where the neighbouring drift.rate refuses it', () => {
    const item = RATES_NODE.items as JsonSchema;
    expect(validateAgainstSchema(0, item, EFFECTS_SCENE_SCHEMA)).toEqual([]);
    expect(item.not, 'reels rates must NOT carry a not-zero hole').toBeUndefined();

    const drift = ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>)
      .layer.properties as Record<string, JsonSchema>).drift;
    const rateForm = (drift.oneOf as JsonSchema[])
      .find(b => (b.properties as Record<string, unknown> | undefined)?.rate !== undefined)!;
    const driftRate = (rateForm.properties as Record<string, JsonSchema>).rate;
    // Anti-vacuous: the contrast is real — the other node genuinely refuses 0.
    expect(validateAgainstSchema(0, driftRate, EFFECTS_SCENE_SCHEMA)).toHaveLength(1);

    // ...and `uniqueItems` is what caps the stationary strip at ONE.
    const twoZeros = [0, 0, ...distinctLegalRates(EFFECTS_REEL_BAND_COUNT - 2)];
    expect(validateAgainstSchema(twoZeros, RATES_NODE, EFFECTS_SCENE_SCHEMA)
      .some(i => /distinct/.test(i.message))).toBe(true);
  });

  /**
   * The node is CLOSED, so the geometry cannot be reopened by an author. A
   * `cols_per_band` key is the one a panel author is most likely to reach for,
   * because 64 px is a number the contract states in prose and nowhere in JSON.
   */
  it('refuses any member beside `rates`, so the geometry is not a field', () => {
    const scene = sceneWithRates(distinctLegalRates()) as unknown as Record<string, unknown>;
    (scene.reels as Record<string, unknown>).cols_per_band = 4;
    const issues = validateAgainstSchema(scene, EFFECTS_SCENE_SCHEMA);
    expect(issues.some(i => /unknown property "cols_per_band"/.test(i.message))).toBe(true);
  });

  it('requires `rates`: an empty reels object is not "no reels"', () => {
    const scene = { ...sceneWithRates([]), reels: {} } as unknown as EffectsScene;
    expect(validateAgainstSchema(scene, EFFECTS_SCENE_SCHEMA)
      .some(i => /missing required property "rates"/.test(i.message))).toBe(true);
  });

  /**
   * ABSENT = NO REELS, and there is no `"none"` spelling. `v_deform`'s
   * absent-key precedent governs, NOT `drift`/`curve`/`vsplit`/`rowRemap`'s
   * `oneOf` with a `"none"` arm — so a document that says `"reels": "none"` is
   * REFUSED rather than read as off.
   */
  it('has no "none" arm: absent is legal and the string is refused', () => {
    const { reels: _dropped, ...withoutReels } = sceneWithRates(distinctLegalRates());
    expect(validateAgainstSchema(withoutReels, EFFECTS_SCENE_SCHEMA)).toEqual([]);

    const asNone = { ...withoutReels, reels: 'none' } as unknown as EffectsScene;
    expect(validateAgainstSchema(asNone, EFFECTS_SCENE_SCHEMA)
      .some(i => /expected object, got string/.test(i.message))).toBe(true);
  });
});

describe('effects scene `reels`: the codec round-trips it verbatim', () => {
  /**
   * ⚠ SCREEN ORDER IS ARRAY ORDER — index i owns screen X 64i..64i+63. The
   * contract says an editor that sorts `rates`, or round-trips them through a
   * dict keyed by band name, "silently relocates every strip".
   *
   * THE SUBJECT IS A PERMUTATION THAT SORTING WOULD VISIBLY MOVE, and the row
   * asserts the exact sequence comes back — not merely the same multiset. A
   * membership assertion would pass under a sort, which is the failure.
   */
  it('preserves rate ORDER through parse → serialize, not just membership', () => {
    const rates = [6, -4, 2, -5, 3].slice(0, EFFECTS_REEL_BAND_COUNT);
    // Anti-vacuous: this order is NOT the sorted order, so a sort is detectable.
    expect(rates).not.toEqual([...rates].sort((a, b) => a - b));

    const text = serializeEffectsScene(sceneWithRates(rates));
    // The instrument saw the key in the TEXT, not merely in a parsed object.
    expect(text).toContain('"reels"');
    const back = parseEffectsScene(text, 'reel_probe');
    expect(back.reels?.rates).toEqual(rates);

    // ...and again, so the order is a fixed point rather than one lucky pass.
    expect(serializeEffectsScene(back)).toBe(text);
  });

  /**
   * `canonicalJsonPretty` sorts OBJECT keys. This asserts it does not sort
   * ARRAY elements — the one thing that would silently relocate every strip.
   * The two permutations differ only in order, so if the writer sorted, both
   * would render identically.
   */
  it('two permutations of the same rates render DIFFERENTLY', () => {
    const a = [6, -4, 2, -5, 3].slice(0, EFFECTS_REEL_BAND_COUNT);
    const b = [...a].reverse();
    expect(a).not.toEqual(b);
    expect(serializeEffectsScene(sceneWithRates(a)))
      .not.toBe(serializeEffectsScene(sceneWithRates(b)));
  });

  /**
   * The golden carries aeon's OWN shipped rates — `OJZ_REEL_SPEEDS`,
   * games/sonic4/data/effects/ojz_effects.emp:1756 at aeon `660aabc0` — so the
   * fixture is the corpus rather than five numbers this repo invented, and the
   * whole document round-trips byte for byte with the key on it.
   */
  it('round-trips the golden, which really does carry reels', () => {
    // ANTI-VACUOUS, the trap this parcel was warned about by name: a round-trip
    // over a document with no `reels` key passes whether or not anything was
    // implemented. Assert the key is in the bytes going IN.
    expect(GOLDEN).toContain('"reels"');
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    expect(scene.reels?.rates).toHaveLength(EFFECTS_REEL_BAND_COUNT);
    expect(new Set(scene.reels!.rates).size).toBe(EFFECTS_REEL_BAND_COUNT);

    const out = serializeEffectsScene(scene);
    // ...and in the bytes coming OUT, before comparing them.
    expect(out).toContain('"reels"');
    expect(out).toBe(GOLDEN);
  });

  /**
   * A scene WITHOUT the key stays without it. This is the other half of
   * "absent = no reels": the writer must not helpfully materialise a default,
   * which would turn every save of an untouched file into a diff and freeze
   * today's geometry into documents that should track the contract's.
   */
  it('never invents the key on a scene that does not carry it', () => {
    const { reels: _dropped, ...withoutReels } = sceneWithRates(distinctLegalRates());
    const text = serializeEffectsScene(withoutReels as EffectsScene);
    expect(text).not.toContain('reels');
    expect(parseEffectsScene(text, 'reel_probe').reels).toBeUndefined();
  });

  /**
   * The writer VALIDATES on the way out, so an illegal rates array cannot reach
   * disk even when it was built in memory rather than parsed. Three ways to be
   * illegal, one row each way, because they fail through different keywords.
   */
  it('refuses to serialize a scene whose rates are illegal', () => {
    const legal = distinctLegalRates();
    const cases: Array<[string, number[], RegExp]> = [
      ['too few', legal.slice(0, -1), /minimum/],
      ['out of range', [EFFECTS_REEL_RATE_BOUNDS.max + 1, ...legal.slice(1)], /above the maximum/],
      ['a duplicate', [legal[0], legal[0], ...legal.slice(2)], /distinct/],
    ];
    for (const [why, rates, matcher] of cases) {
      expect(() => serializeEffectsScene(sceneWithRates(rates)), why).toThrow(matcher);
    }
  });
});

describe('effects scene `reels`: the binding warning is ADVICE and says so', () => {
  const scene = sceneWithRates(distinctLegalRates());

  it('warns when no section in the project names this scene by sceneRef', () => {
    const out = advisoryReelsBinding(scene, ['other_scene', null]);
    expect(out).toHaveLength(1);
    expect(out[0].path).toBe('/reels');
    // It must name itself as advice, name the authority, and refuse to read as
    // a guarantee. All three, because dropping any one turns it into the
    // refusal it is not.
    expect(out[0].message).toMatch(/EDITOR-SIDE WARNING, not the refusal/);
    expect(out[0].message).toMatch(/aeon's generator refuses/);
    expect(out[0].message).toMatch(/Saving is not blocked/);
    expect(out[0].message).toMatch(/silence is not a clearance/);
    expect(out[0].message).toContain(scene.id);
  });

  it('stays silent when a section does name it, and when there is no key at all', () => {
    expect(advisoryReelsBinding(scene, [null, scene.id])).toEqual([]);
    const { reels: _dropped, ...withoutReels } = scene;
    expect(advisoryReelsBinding(withoutReels as EffectsScene, ['other_scene'])).toEqual([]);
  });

  /**
   * AN EMPTY LIST IS NOT EVIDENCE. "This project has no sections" and "no
   * section binds this scene" are different facts, and warning on the first
   * would be a warning about a project the function was handed none of — the
   * loud-on-nothing failure that trains people to ignore the channel.
   */
  it('says nothing when handed no sections at all', () => {
    expect(advisoryReelsBinding(scene, [])).toEqual([]);
  });

  /**
   * NOTHING IN THE READ OR WRITE PATH CALLS IT. Asserted rather than promised:
   * a document the advisory would warn about still parses and still serializes.
   */
  it('is not enforcement: the same scene parses and serializes regardless', () => {
    expect(advisoryReelsBinding(scene, ['other_scene'])).toHaveLength(1);
    const text = serializeEffectsScene(scene);
    expect(text).toContain('"reels"');
    expect(parseEffectsScene(text, 'reel_probe').reels?.rates).toEqual(scene.reels!.rates);
  });
});
