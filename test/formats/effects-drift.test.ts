import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  parseEffectsScene,
  serializeEffectsScene,
  loadEffectsSceneLibrary,
  EFFECTS_SCENE_SCHEMA,
  type EffectsScene,
} from '../../src/core/formats/effects/scene';
import {
  EFFECTS_DRIFT_RATE_BOUNDS,
  EFFECTS_DRIFT_RATE_REFUSED,
  EFFECTS_DRIFT_UNITS_PER_PIXEL,
  EFFECTS_LAYER_KEY_DEFAULTS,
  driftRateToPxPerFrame,
  driftPxPerFrameToRate,
  driftRateRefusal,
  driftPxPerFrameRefusal,
  EFFECTS_DRIFT_PX_BOUNDS,
  driftRateOf,
  cloneEffectsScene,
} from '../../src/core/formats/effects/scene-ui';
import { validateAgainstSchema } from '../../src/core/formats/effects/json-schema-subset';
import {
  layerExtras, layerExtrasLine,
  EFFECTS_DRIFT_SEED_RATE, EFFECTS_DRIFT_PX_STEP,
  driftPxFieldValue, driftFromToggle, driftFromPxPerFrame,
} from '../../src/renderer/providers/effects-aeon';

/**
 * `layer.drift` — the codec, the round trip, and the unit conversion.
 * empyrean 988638f; engine design aeon e0ce6011 §7.
 *
 * WHAT AURORA DID BEFORE THIS PARCEL, measured on the tree at 4463331 rather
 * than assumed, because it decides whether this file documents a FIX or a
 * FEATURE: it REFUSED the document, loudly, at both ends.
 *
 *     parseEffectsScene(<scene with drift>)
 *       -> EffectsSceneError: "…does not match the effects scene schema
 *            - /layers/0: unknown property "drift" (the schema is closed)"
 *     serializeEffectsScene(<scene with drift in memory>)
 *       -> EffectsSceneError: "refusing to write scene "ojz_act1_depth"…
 *            - /layers/0: unknown property "drift" (the schema is closed)"
 *
 * So Aurora never DESTROYED a drift and this is not a data-loss fix. The
 * "refuse the file" half of §6 hazard 1 was already holding, and it held for the
 * `"none"` spelling too. What it was, was INERT: a scene carrying the new field
 * could not be opened at all, landing in `EffectsSceneLibrary.unreadable` with
 * a notice — safe, and useless. This parcel moves it from refused to
 * round-tripped. The negative control below is what keeps that distinction
 * honest: an actually-undeclared key must STILL be refused, so these round trips
 * cannot be passing because the schema went open.
 *
 * THE CONTROL EXISTS NOW (EW-DRIFT-CTL). When this file was written aeon's
 * `tools/effects_gen.py` REFUSED the key, so a spinner would have originated a
 * value the build rejected for every input and none was built. aeon's emission
 * parcel landed at aeon `ce4dbb7c` ("chain 205 — drift becomes authorable in the
 * editor"): `LAYER_KEYS` carries `drift` and `render_drift` lowers it to
 * `SceneDrift.Rate(n)`. The layer card grew the row, `layerExtras` gave the key
 * up (a value the card edits is not printed read-only beside it), and the
 * round-trip block at the bottom of this file is the gate on the ×256.
 * See docs/reviews/2026-08-29-drift-codec.md and
 * docs/reviews/2026-09-02-effects-drift-control.md.
 */

const GOLDEN_PATH = resolve(__dirname, '../fixtures/effects/canopy_dusk.json');
const GOLDEN = readFileSync(GOLDEN_PATH, 'utf8');

const ROOT = 'games/sonic4/data/';
const DIR = `${ROOT}editor/effects/`;

/** In-memory FileAccess, the shape effects-scene.test.ts already uses. */
function memFs(files: Record<string, string>): FileAccess {
  return {
    exists: async (rel) => rel.endsWith('/')
      ? Object.keys(files).some(p => p.startsWith(rel))
      : rel in files,
    read: async (rel) => {
      if (!(rel in files)) throw new Error(`ENOENT: ${rel}`);
      return new TextEncoder().encode(files[rel]);
    },
    list: async (relDir) => Object.keys(files)
      .filter(p => p.startsWith(relDir) && !p.slice(relDir.length).includes('/'))
      .map(p => p.slice(relDir.length)),
  };
}

/** The golden with `mutate` applied to its parsed form, re-rendered in §5 order. */
function goldenWith(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(GOLDEN) as Record<string, unknown>;
  mutate(doc);
  return `${JSON.stringify(sortDeep(doc), null, 2)}\n`;
}

/** §5 canonical order — alphabetical, recursively. */
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (typeof v !== 'object' || v === null) return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortDeep((v as Record<string, unknown>)[k]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The round trip — on disk bytes, with the artifact PRINTED
// ---------------------------------------------------------------------------

describe('drift survives the load -> save round trip', () => {
  /**
   * The golden is the shape-coverage document, and since this parcel it carries
   * BOTH drift forms: layer 2 an authored rate (32 = S3K AIZ1's clouds, the
   * schema's own worked corpus value), layer 3 the `"none"` default spelled out.
   *
   * ANTI-VACUOUS, and this is the shape that matters most here: a round trip
   * where BOTH sides drop the field passes while proving nothing. So the input
   * is checked to carry a drift, the OUTPUT is checked to carry it, and the
   * output is PRINTED — bar 2d cause (iii), docs/OVERSEER.md: a row must print
   * the artifact it judges.
   */
  it('round-trips the golden byte for byte, carrying both drift forms', () => {
    expect(GOLDEN).toContain('"rate": 32');
    expect(GOLDEN).toContain('"drift": "none"');

    const out = serializeEffectsScene(parseEffectsScene(GOLDEN, 'canopy_dusk'));

    // THE ARTIFACT THIS ROW JUDGES. Not a boolean about it.
    console.log('--- serializeEffectsScene(parseEffectsScene(canopy_dusk.json)) ---\n' + out);

    // The output really carries both spellings — checked on the OUTPUT, not on
    // the input, and not via the boolean the byte compare would also satisfy.
    expect(out).toContain('"rate": 32');
    expect(out).toContain('"drift": "none"');
    expect(out).toBe(GOLDEN);
  });

  /**
   * NEGATIVE CONTROL. The round trip above must be passing because `drift` is
   * DECLARED, not because the schema stopped being closed. An undeclared key is
   * still refused, at both ends, with the same message the pre-parcel measurement
   * quoted for `drift` itself.
   */
  it('still refuses an undeclared layer key, at both ends', () => {
    const text = goldenWith(d => {
      ((d.layers as Record<string, unknown>[])[0]).wobble = { rate: 32 };
    });
    expect(() => parseEffectsScene(text, 'canopy_dusk'))
      .toThrow(/\/layers\/0: unknown property "wobble" \(the schema is closed\)/);

    const inMemory = JSON.parse(text) as EffectsScene;
    expect(() => serializeEffectsScene(inMemory))
      .toThrow(/\/layers\/0: unknown property "wobble" \(the schema is closed\)/);
  });

  /**
   * The library path — the one an author actually travels. Before this parcel a
   * drift-carrying file landed in `unreadable` with a notice and was skipped by
   * the save plan; now it loads, and the scene that comes back out carries the
   * rate.
   */
  it('loads a drift-carrying scene into the library rather than into `unreadable`', async () => {
    const lib = await loadEffectsSceneLibrary(memFs({ [`${DIR}canopy_dusk.json`]: GOLDEN }), ROOT);
    expect(lib.unreadable).toEqual([]);
    expect(lib.notices).toEqual([]);
    expect(lib.scenes).toHaveLength(1);
    expect(lib.scenes[0].layers[2].drift).toEqual({ rate: 32 });
    expect(lib.scenes[0].layers[3].drift).toBe('none');
  });

  /**
   * An EDIT elsewhere in the scene must not cost the drift. `cloneEffectsScene`
   * is `structuredClone`, so this is a property of the design rather than of a
   * hand-written copier — which is exactly why it is worth a row: the day
   * someone replaces it with an enumerating clone, this is what says so.
   */
  it('survives a clone-and-edit of an unrelated field', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    const edited = cloneEffectsScene(scene);
    edited.name = 'Canopy — dawn';
    edited.layers[0].world_y = 8;

    const out = serializeEffectsScene(edited);
    console.log('--- after an unrelated edit, layers[2] and layers[3] ---\n'
      + JSON.stringify((JSON.parse(out) as EffectsScene).layers.slice(2, 4), null, 2));

    expect((JSON.parse(out) as EffectsScene).layers[2].drift).toEqual({ rate: 32 });
    expect((JSON.parse(out) as EffectsScene).layers[3].drift).toBe('none');
    expect(out).toContain('"name": "Canopy — dawn"');
  });

  /**
   * ABSENT AND `"none"` BOTH MEAN NO DRIFT, and neither is rewritten into the
   * other. scene.ts's model rule: parse never fills a default in and serialize
   * never writes one out that was not on disk, because injecting one turns every
   * load/save of an untouched file into a diff.
   */
  it('leaves absent absent and "none" spelled, and treats both as no drift', () => {
    const absent = goldenWith(d => {
      for (const l of d.layers as Record<string, unknown>[]) delete l.drift;
    });
    const out = serializeEffectsScene(parseEffectsScene(absent, 'canopy_dusk'));
    expect(out).not.toContain('drift');
    expect(out).toBe(absent);

    // The schema agrees the two are the same fact: `"none"` is `drift`'s default.
    expect(EFFECTS_LAYER_KEY_DEFAULTS.get('drift')).toBe('none');
    expect(driftRateOf(undefined)).toBeNull();
    expect(driftRateOf('none')).toBeNull();
    expect(driftRateOf({ rate: 32 })).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// Refusals — every clause DERIVED from the vendored schema
// ---------------------------------------------------------------------------

describe('drift refusals match the contract rather than approximating it', () => {
  /** `drift`'s schema node, walked out of the vendored file. */
  const driftNode = ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, Record<string, Record<string, Record<string, unknown>>>>)
    .layer.properties.drift);

  it('the bounds and the refused value come from the schema, not from prose', () => {
    // Derived, then cross-checked against the node this test walked itself.
    const rate = (driftNode.oneOf as Record<string, Record<string, Record<string, unknown>>>[])
      .find(b => b.properties?.rate !== undefined)!.properties.rate;
    expect(EFFECTS_DRIFT_RATE_BOUNDS).toEqual({ min: rate.minimum, max: rate.maximum });
    expect(EFFECTS_DRIFT_RATE_REFUSED).toBe((rate.not as Record<string, unknown>).const);
    // Anti-vacuous: those really are numbers, not two undefineds agreeing.
    expect(typeof EFFECTS_DRIFT_RATE_BOUNDS.min).toBe('number');
    expect(typeof EFFECTS_DRIFT_RATE_REFUSED).toBe('number');
    console.log('--- derived from the vendored schema ---\n' + JSON.stringify({
      bounds: EFFECTS_DRIFT_RATE_BOUNDS,
      refused: EFFECTS_DRIFT_RATE_REFUSED,
      unitsPerPixel: EFFECTS_DRIFT_UNITS_PER_PIXEL,
    }, null, 2));
  });

  it('refuses the excluded rate, naming it', () => {
    const text = goldenWith(d => {
      ((d.layers as Record<string, unknown>[])[2]).drift = { rate: EFFECTS_DRIFT_RATE_REFUSED };
    });
    let message = '';
    try { parseEffectsScene(text, 'canopy_dusk'); } catch (e) { message = (e as Error).message; }
    console.log('--- refusal for rate ' + EFFECTS_DRIFT_RATE_REFUSED + ' ---\n' + message);
    expect(message).toMatch(/\/layers\/2\/drift: matches none of the 2 allowed forms/);
    expect(message).toMatch(new RegExp(`forbids the constant ${EFFECTS_DRIFT_RATE_REFUSED}`));
  });

  it('refuses either side of the bound, and accepts the bound itself', () => {
    const { min, max } = EFFECTS_DRIFT_RATE_BOUNDS;
    for (const rate of [min - 1, max + 1]) {
      const text = goldenWith(d => {
        ((d.layers as Record<string, unknown>[])[2]).drift = { rate };
      });
      expect(() => parseEffectsScene(text, 'canopy_dusk'), `rate ${rate} should be refused`)
        .toThrow(/\/layers\/2\/drift: matches none of the 2 allowed forms/);
    }
    // ...and the bound is INCLUSIVE, so this is a fence and not an off-by-one.
    for (const rate of [min, max]) {
      const text = goldenWith(d => {
        ((d.layers as Record<string, unknown>[])[2]).drift = { rate };
      });
      expect(parseEffectsScene(text, 'canopy_dusk').layers[2].drift).toEqual({ rate });
    }
  });

  it('refuses a fractional rate and a stringly-typed one', () => {
    for (const rate of [0.5, 32.0001, '32' as unknown as number]) {
      const text = goldenWith(d => {
        ((d.layers as Record<string, unknown>[])[2]).drift = { rate };
      });
      expect(() => parseEffectsScene(text, 'canopy_dusk'), `rate ${rate} should be refused`)
        .toThrow(/\/layers\/2\/drift: matches none of the 2 allowed forms/);
    }
    // 32.0 IS 32 in JSON — there is no such thing as a fractional 32.0 on the
    // wire, and a row that claimed otherwise would be testing JavaScript.
    const text = goldenWith(d => {
      ((d.layers as Record<string, unknown>[])[2]).drift = { rate: 32.0 };
    });
    expect(parseEffectsScene(text, 'canopy_dusk').layers[2].drift).toEqual({ rate: 32 });
  });

  it('refuses a mis-spelled `"none"` and an extra key beside `rate`', () => {
    for (const drift of ['None', 'off', {}, { rate: 32, speed: 1 }]) {
      const text = goldenWith(d => {
        ((d.layers as Record<string, unknown>[])[2]).drift = drift;
      });
      expect(() => parseEffectsScene(text, 'canopy_dusk'), `${JSON.stringify(drift)} should be refused`)
        .toThrow(/\/layers\/2\/drift: matches none of the 2 allowed forms/);
    }
  });

  /**
   * `driftRateRefusal` is the SENTENCE half — advisory, in scene.ts's sense, for
   * a control that does not exist yet. Its job is to agree with the validator on
   * every case, which is checked here by running both over the same values
   * rather than by trusting the reading.
   */
  it('the advisory refusal agrees with the validator on every case', () => {
    const { min, max } = EFFECTS_DRIFT_RATE_BOUNDS;
    const cases = [min - 1, min, -1, EFFECTS_DRIFT_RATE_REFUSED, 1, 32, 1536, max, max + 1, 0.5];
    const rows = cases.map(rate => {
      const advisory = driftRateRefusal(rate) !== null;
      const validator = validateAgainstSchema({ rate }, { $ref: '#/$defs/layer/properties/drift/oneOf/1' } as never,
        EFFECTS_SCENE_SCHEMA).length > 0;
      return { rate, advisory, validator };
    });
    console.log('--- advisory vs validator ---\n' + JSON.stringify(rows, null, 2));
    // Anti-vacuous: both verdicts really do vary across the sample.
    expect(new Set(rows.map(r => r.validator)).size).toBe(2);
    expect(rows.filter(r => r.advisory !== r.validator)).toEqual([]);
  });

  it('the advisory names the unit, the corpus framing, and the taste bound', () => {
    expect(driftRateRefusal(EFFECTS_DRIFT_RATE_REFUSED)).toMatch(/indistinguishable from no drift/);
    expect(driftRateRefusal(0.5)).toMatch(/1\/256 px per frame/);
    expect(driftRateRefusal(EFFECTS_DRIFT_RATE_BOUNDS.max + 1)).toMatch(/TASTE bound/);
    expect(driftRateRefusal(32)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The unit conversion — one factor, one place, both directions
// ---------------------------------------------------------------------------

describe('px/frame <-> wire rate: the 256x hazard', () => {
  /**
   * The factor is DERIVED from the schema's own description, twice. This row
   * proves the derivation landed on the number the contract means, using the
   * corpus values the description itself gives — so it is not a restatement of
   * the constant it is checking.
   */
  it('derives the factor the contract states, and agrees with its worked examples', () => {
    expect(EFFECTS_DRIFT_UNITS_PER_PIXEL).toBe(256);
    // The three conversions the schema spells out in prose.
    expect(driftPxPerFrameToRate(1)).toBe(256);            // "1 px/frame = 256"
    expect(driftRateToPxPerFrame(32)).toBe(0.125);          // "S3K AIZ1's clouds = 32"
    expect(driftRateToPxPerFrame(1536)).toBe(6);            // "corpus max 6 px/frame = 1536"
    // ...and the bound gloss, "+/-4096 (16 px/frame)".
    expect(driftRateToPxPerFrame(EFFECTS_DRIFT_RATE_BOUNDS.max)).toBe(16);
    expect(driftRateToPxPerFrame(EFFECTS_DRIFT_RATE_BOUNDS.min)).toBe(-16);
  });

  /**
   * THE DEFECT THIS PAIR EXISTS TO PREVENT: applying the factor twice, or not at
   * all. Both directions compose to the identity over every legal rate — checked
   * exhaustively over the sign-symmetric range at a stride, plus every boundary.
   */
  it('round-trips every legal rate through px/frame and back', () => {
    const { min, max } = EFFECTS_DRIFT_RATE_BOUNDS;
    const sample: number[] = [min, min + 1, -1536, -256, -32, -1, 1, 32, 256, 1536, max - 1, max];
    for (let r = min; r <= max; r += 7) sample.push(r);
    const bad = sample.filter(r => driftPxPerFrameToRate(driftRateToPxPerFrame(r)) !== r);
    expect(sample.length).toBeGreaterThan(1000);
    expect(bad).toEqual([]);

    // ANTI-VACUOUS, and the trap this row is actually here for: a factor
    // applied HALF as hard must be caught. It is, for every rate but ±1 — half
    // of one wire unit rounds back to one wire unit, so the smallest
    // representable rate cannot detect a scaling error by construction. Stated
    // as an exemption rather than dropped from the sweep, because "the sweep was
    // quietly narrowed until it passed" is the shape this bar exists for. The
    // exemption is SYMMETRIC, which is itself the check on the rounding rule:
    // `Math.round` alone would exempt +1 and not −1.
    const undetectable = sample.filter(
      r => driftPxPerFrameToRate(driftRateToPxPerFrame(r) / 2) === r,
    );
    expect([...new Set(undetectable)].sort((a, b) => a - b)).toEqual([-1, 1]);
  });

  it('rounds px/frame to the wire symmetrically, and never yields -0', () => {
    // A human types px/frame; the wire is an integer.
    expect(driftPxPerFrameToRate(0.125)).toBe(32);
    expect(driftPxPerFrameToRate(-0.125)).toBe(-32);
    expect(driftPxPerFrameToRate(0.1)).toBe(26);            // 25.6 -> 26
    expect(driftPxPerFrameToRate(-0.1)).toBe(-26);

    // HALF-AWAY-FROM-ZERO. The exact tie is the case `Math.round` gets
    // asymmetric: it sends +0.5 to 1 and -0.5 to -0, so the same magnitude
    // survives one way and vanishes the other.
    const half = 0.5 / EFFECTS_DRIFT_UNITS_PER_PIXEL;
    expect(driftPxPerFrameToRate(half)).toBe(1);
    expect(driftPxPerFrameToRate(-half)).toBe(-1);
    expect(Math.round(-0.5), 'the asymmetry this rule exists to avoid').toBe(-0);
    // Rounded to nothing: a REFUSED rate, and `0` rather than `-0`, so the two
    // spellings of nothing cannot present as different values.
    expect(driftPxPerFrameToRate(-0.001)).toBe(0);
    expect(Object.is(driftPxPerFrameToRate(-0.001), -0)).toBe(false);
    expect(driftRateRefusal(driftPxPerFrameToRate(-0.001))).not.toBeNull();
  });

  /**
   * THE FACTOR IS SPELLED IN EXACTLY ONE PLACE. Not asserted by reading the
   * file — asserted by grepping the effects source for a bare 256 outside the
   * derivation, which is the check that would have caught the second copy.
   */
  it('no second copy of the factor exists in the effects source', () => {
    const files = [
      ...['scene.ts', 'scene-ui.ts', 'json-schema-subset.ts', 'factor-decode.ts']
        .map(f => resolve(__dirname, '../../src/core/formats/effects', f)),
      // EXTENDED AT EW-DRIFT-CTL to the two files the control lives in. Before
      // the row existed these were not plausible homes for a stray 256; now they
      // are the FIRST place a second copy would appear — someone converting "one
      // more time" in the provider or inline in the panel is exactly the
      // double-multiply aeon's generator docstring warns about.
      resolve(__dirname, '../../src/renderer/providers/effects-aeon.ts'),
      resolve(__dirname, '../../src/renderer/components/effects/EffectsScenePanel.tsx'),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Only CODE, and only a bare literal — the derivation reads the number
        // out of a string, and the prose is allowed to say 256 as often as it
        // likes. `/256` is the unit written as a fraction, also prose.
        const code = line.replace(/\/\/.*$/, '').replace(/\*.*$/, '');
        if (/(^|[^\w/.])256(?![\w.])/.test(code) && !code.includes('EFFECTS_DEFORM_TABLE_BYTES')) {
          offenders.push(`${file.split('/').pop()}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    console.log('--- bare 256 literals in effects source ---\n'
      + (offenders.length ? offenders.join('\n') : '(none)'));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The card EDITS it now, so the read-only line gave the key up (EW-DRIFT-CTL)
// ---------------------------------------------------------------------------
//
// `layerExtras` is "what the file sets that the card cannot". `curve` and
// `vsplit` left it in parcel H and `deform` in wave 2, each when it got a
// control; drift leaves it here, for the same rule. A value said twice, in two
// units, by two surfaces that can disagree is the defect that rule exists to
// stop — and the extras line printed px/frame while the file held 1/256ths, so
// a stale copy of it would have been the 256× hazard wearing a descriptor.

describe('the extras line no longer speaks for drift', () => {
  it('prints nothing for a drifting layer that carries no other extra', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    const lines = scene.layers.map((l, i) =>
      `${i}: drift=${JSON.stringify(l.drift ?? null)} extras=${layerExtrasLine(l) ?? '(no line)'}`);
    console.log('--- layerExtrasLine per layer ---\n' + lines.join('\n'));

    // Layer 2 carries {rate: 32} and nothing else the line reports.
    expect(driftRateOf(scene.layers[2].drift)).toBe(32);
    expect(layerExtrasLine(scene.layers[2])).toBeNull();
    for (const layer of scene.layers) {
      expect(layerExtras(layer).map(e => e.key as string)).not.toContain('drift');
    }
  });

  it('leaves the other extras exactly as they were', () => {
    const line = layerExtrasLine({
      world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1',
      phase: 64, enabled: false, drift: { rate: -256 },
    });
    console.log('--- combined extras line ---\n' + line);
    expect(line).toBe('phase 64 · disabled');
  });
});

// ---------------------------------------------------------------------------
// THE CONTROL — the ×256, once, and the refusals the build would otherwise give
// ---------------------------------------------------------------------------
//
// aeon FORWARDS `Rate(0)` and `Rate(9000)` as shape-legal (`render_drift`'s own
// docstring) and leaves them to its build-time `ensure`, so this control is the
// only place an author learns the bound before a red build.

describe('the drift row seeds, converts and refuses', () => {
  it('seeds a legal, non-zero rate — the corpus\'s slowest', () => {
    console.log(`--- seed --- rate=${EFFECTS_DRIFT_SEED_RATE} `
      + `px=${driftRateToPxPerFrame(EFFECTS_DRIFT_SEED_RATE)} step=${EFFECTS_DRIFT_PX_STEP}`);
    // ⅛ px/frame, which the SCHEMA'S OWN DESCRIPTION names as S3K AIZ1's clouds.
    // Read out of the contract here rather than typed, so a re-vendor that moved
    // the corpus value fails this row instead of the seed silently disagreeing
    // with the sentence the row's title tells the author.
    const description = String(
      ((EFFECTS_SCENE_SCHEMA.$defs as Record<string, Record<string, Record<string, Record<string, unknown>>>>)
        .layer.properties.drift).description);
    const aiz = /S3K AIZ1's clouds = (\d+)/.exec(description);
    expect(aiz, 'the schema no longer names the AIZ1 corpus rate').not.toBeNull();
    expect(EFFECTS_DRIFT_SEED_RATE).toBe(Number(aiz![1]));

    expect(driftRateRefusal(EFFECTS_DRIFT_SEED_RATE)).toBeNull();
    expect(EFFECTS_DRIFT_SEED_RATE).not.toBe(EFFECTS_DRIFT_RATE_REFUSED);
    expect(driftFromToggle(true)).toEqual({ rate: EFFECTS_DRIFT_SEED_RATE });
    // Off CLEARS the key rather than writing "none" — setLayerFieldCommand's rule.
    expect(driftFromToggle(false)).toBeUndefined();
  });

  it('shows the file\'s wire rate as px/frame and nothing when there is no drift', () => {
    const rows = [
      { drift: { rate: 32 } as const, expect: 0.125 },
      { drift: { rate: 1536 } as const, expect: 6 },
      { drift: { rate: -256 } as const, expect: -1 },
      { drift: 'none' as const, expect: null },
      { drift: undefined, expect: null },
    ];
    console.log('--- driftPxFieldValue ---\n' + rows.map(r =>
      `${JSON.stringify(r.drift ?? null)} -> ${driftPxFieldValue({ drift: r.drift })}`).join('\n'));
    for (const r of rows) expect(driftPxFieldValue({ drift: r.drift })).toBe(r.expect);
  });

  /**
   * THE ×256, AND THAT IT HAPPENS EXACTLY ONCE.
   *
   * A doubled multiply is invisible to a one-directional check because every
   * wrong value is itself a legal rate: 1 px/frame written twice is 65536, which
   * only the BOUND catches, and 0.001 px/frame written twice is 65, which
   * nothing catches. So this walks the whole path the author walks — type
   * px/frame, write the document, SERIALIZE, PARSE BACK, read the box — and
   * asserts the box shows what was typed.
   */
  it('round-trips a typed px/frame value through a real document, unchanged', () => {
    const typed = [0.125, 1, -1, 6, -6, 0.5, 2.25, 16, -16];
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');

    const table: string[] = [];
    for (const px of typed) {
      expect(driftPxPerFrameRefusal(px), `${px} px/frame must be authorable`).toBeNull();

      const authored = cloneEffectsScene(scene);
      authored.layers[0].drift = driftFromPxPerFrame(px);
      const wire = authored.layers[0].drift as { rate: number };

      const text = serializeEffectsScene(authored);
      const back = parseEffectsScene(text, 'canopy_dusk');
      const shown = driftPxFieldValue(back.layers[0]);

      table.push(`typed ${px} px/frame -> wire ${wire.rate} -> on disk `
        + `${/"rate": (-?\d+)/.exec(text.slice(text.indexOf('"drift"')))?.[1]} -> box shows ${shown}`);

      expect(shown, `${px} px/frame did not survive the round trip`).toBe(px);
      // The multiply happened, and it happened ONCE: the file holds the px value
      // scaled by the factor exactly one time. A doubled multiply lands on
      // px*F*F, a missing one on px.
      expect(wire.rate).toBe(px * EFFECTS_DRIFT_UNITS_PER_PIXEL);
    }
    console.log('--- px/frame round trip through serialize + parse ---\n' + table.join('\n'));
  });

  /**
   * THE REFUSALS, in the author's units. Every clause is `driftRateRefusal`'s,
   * reached by converting first — asserted here by running BOTH over the same
   * values and requiring they never disagree on the verdict.
   */
  it('refuses zero, everything that rounds to zero, and everything out of range', () => {
    const { min, max } = EFFECTS_DRIFT_PX_BOUNDS;
    const rows: { px: number; refused: boolean; why: string }[] = [
      { px: 0, refused: true, why: 'zero — indistinguishable from none in ROM' },
      { px: 0.001, refused: true, why: 'rounds to zero on the wire' },
      { px: -0.001, refused: true, why: 'rounds to zero, leftward' },
      { px: 1 / EFFECTS_DRIFT_UNITS_PER_PIXEL, refused: false, why: 'one wire unit — the slowest legal' },
      { px: min, refused: false, why: 'the bound itself' },
      { px: max, refused: false, why: 'the bound itself' },
      { px: min - 0.01, refused: true, why: 'past the bound, leftward' },
      { px: max + 0.01, refused: true, why: 'past the bound' },
      { px: 9000 / EFFECTS_DRIFT_UNITS_PER_PIXEL, refused: true, why: 'the generator forwards Rate(9000)' },
      { px: Number.NaN, refused: true, why: 'not a number' },
      { px: 0.125, refused: false, why: 'AIZ1 clouds' },
      { px: 6, refused: false, why: 'the corpus maximum' },
    ];
    const printed: string[] = [];
    for (const r of rows) {
      const px = driftPxPerFrameRefusal(r.px);
      // The wire-side rule, run independently on the same value.
      const wire = Number.isFinite(r.px) ? driftRateRefusal(driftPxPerFrameToRate(r.px)) : 'not finite';
      printed.push(`${String(r.px).padEnd(22)} ${px === null ? 'ACCEPTED' : 'REFUSED '} `
        + `(${r.why})\n    ${px ?? ''}`);
      expect(px === null, `${r.px} px/frame: expected refused=${r.refused}`).toBe(!r.refused);
      // Never disagree with the wire-side rule this delegates to.
      expect(px === null).toBe(wire === null);
    }
    console.log('--- driftPxPerFrameRefusal ---\n' + printed.join('\n'));

    // Both verdicts really do vary across the sample — a refusal that always
    // says yes, or always no, would pass a same-verdict check vacuously.
    expect(rows.some(r => r.refused)).toBe(true);
    expect(rows.some(r => !r.refused)).toBe(true);
  });

  /**
   * THE SENTENCE NAMES THE WIRE VALUE. The 256× hazard is invisible by
   * construction, and a refusal is the one moment an author can be shown the
   * conversion at no cost.
   */
  it('says the wire value and the factor exactly when the conversion changed it', () => {
    const tiny = driftPxPerFrameRefusal(0.001)!;
    const zero = driftPxPerFrameRefusal(0)!;
    const over = driftPxPerFrameRefusal(EFFECTS_DRIFT_PX_BOUNDS.max + 1)!;
    console.log('--- refusal sentences ---\n'
      + `0.001: ${tiny}\n0: ${zero}\n${EFFECTS_DRIFT_PX_BOUNDS.max + 1}: ${over}`);

    // ROUNDING LOST SOMETHING → the gloss, which is the one place the ×256 is
    // ever visible: the sentence is about `0` while the box holds `0.001`.
    expect(tiny).toContain('0.001 px/frame is 0 in wire units');
    expect(tiny).toContain(`1 px/frame = ${EFFECTS_DRIFT_UNITS_PER_PIXEL}`);

    // THE CONVERSION WAS EXACT → no gloss. Not brevity for its own sake: the
    // out-of-range sentence is already in the author's own units, and the
    // paragraph is painted in a 129px-tall list scroller (measured,
    // effects-drift-harness [5e]) where restating it costs the bottom edge.
    expect(over).not.toContain('in wire units');
    expect(zero).not.toContain('in wire units');

    // The REASON survives in every case — this is the sentence the owner could
    // not get out of the build without reverting.
    for (const s of [tiny, zero]) {
      expect(s).toContain('indistinguishable from no drift at all in ROM');
      expect(s).toContain('"none"');
    }
    expect(over).toContain(String(EFFECTS_DRIFT_RATE_BOUNDS.max));
    expect(over).toContain('TASTE bound');
    // And the out-of-range sentence still names BOTH units without the gloss.
    expect(over).toContain(String((EFFECTS_DRIFT_PX_BOUNDS.max + 1) * EFFECTS_DRIFT_UNITS_PER_PIXEL));
    expect(over).toContain(`${EFFECTS_DRIFT_PX_BOUNDS.max + 1} px/frame`);
  });

  /**
   * THE WIRING, READ OUT OF THE PANEL SOURCE — and ⚠ THIS IS NOT THE GATE.
   *
   * It says the drift box is handed `refuse` and `driftFromPxPerFrame` rather
   * than writing a typed number straight into `drift.rate`. What it CANNOT say
   * is that either one reaches a browser: `refuse` withholding a commit, and the
   * ×256 happening on the real write path, are facts about the running app, and
   * `scratchpad/effects-drift-harness.mjs` rows [4a] and [5a]–[5e] are what
   * measure them by typing into the real box. A source assertion about
   * validation is the shape of the bug this control exists to fix (`min`/`max`
   * look identical in source and stop nothing), so this row exists to catch a
   * REWIRE in a suite run, never to stand in for the harness.
   */
  it('the panel hands the box the refusal and the conversion (SOURCE ONLY — see the harness)', () => {
    const panel = readFileSync(resolve(
      __dirname, '../../src/renderer/components/effects/EffectsScenePanel.tsx'), 'utf8');
    // Comments stripped: this file's own prose names both functions.
    const code = panel.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.length).toBeGreaterThan(5000);

    const box = /<NumberField title=\{`Layer \$\{i\} \$\{LAYER_DRIFT_ROW\.rateTitle\}`\}[\s\S]*?\/>/
      .exec(code)?.[0];
    console.log('--- the drift NumberField, comments stripped ---\n' + (box ?? '(NOT FOUND)'));
    expect(box, 'the drift box is no longer identifiable by its title').toBeDefined();
    expect(box).toContain('refuse={(n) => driftPxPerFrameRefusal(n)}');
    expect(box).toContain('driftFromPxPerFrame(n)');
    // The typed number must NOT reach `rate` directly — that is the missing
    // multiply, and it produces a legal document that drifts 256x too slow.
    expect(box).not.toMatch(/rate:\s*n\b/);
  });

  /**
   * A DOCUMENT THE CONTROL WROTE IS A DOCUMENT THE CONTRACT ACCEPTS. The refusal
   * and the validator are two implementations of one rule; this is the row that
   * would catch them parting.
   */
  it('writes only documents the schema validates', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    for (const px of [0.125, 6, -16, 1 / EFFECTS_DRIFT_UNITS_PER_PIXEL]) {
      const authored = cloneEffectsScene(scene);
      authored.layers[0].drift = driftFromPxPerFrame(px);
      const errors = validateAgainstSchema(authored, EFFECTS_SCENE_SCHEMA);
      expect(errors, `${px} px/frame produced ${JSON.stringify(authored.layers[0].drift)}`)
        .toEqual([]);
    }
  });
});
