import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseEffectsScene,
  serializeEffectsScene,
  EFFECTS_SCENE_SCHEMA,
  type EffectsScene,
} from '../../src/core/formats/effects/scene';
import {
  EFFECTS_LAYER_KEY_DEFAULTS,
  EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS,
  EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS,
  EFFECTS_ROW_REMAP_HEIGHT_SHIFTS,
  EFFECTS_ROW_REMAP_REFUSED_KEYS,
  EFFECTS_ROW_REMAP_BUILDABLE_SHIFT,
  EFFECTS_ROW_REMAP_GENERATOR_REFUSALS,
  rowRemapHeightLines,
  rowRemapPlaneYRefusal,
  rowRemapHeightShiftRefusal,
  rowRemapBuildableToday,
  rowRemapOf,
  clampRowRemapPlaneY,
  cloneEffectsScene,
} from '../../src/core/formats/effects/scene-ui';
import { validateAgainstSchema } from '../../src/core/formats/effects/json-schema-subset';
import {
  ROW_REMAP_HEIGHT_OPTIONS,
  EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT,
  EFFECTS_ROW_REMAP_CAPABILITY_NOTE,
  rowRemapFieldValue,
  rowRemapFromToggle,
  rowRemapWithPlaneY,
  rowRemapWithHeightShift,
  rowRemapPreconditions,
  layerExtras,
} from '../../src/renderer/providers/effects-aeon';

/**
 * `layer.rowRemap` — the codec, the SHIFT/line-count hazard, the reserved names,
 * and the three `scene()` preconditions Aurora can answer from the open document.
 *
 * CONTRACT: empyrean `3992d16`, `contract/schema/aurora-effects-scene.schema.json`
 * §2.6, vendored at `src/core/formats/effects/aurora-effects-scene.schema.json`
 * (blob `b3e0ab31`, pinned by the sidecar and hashed by
 * `effects-schema-drift.test.ts`). Engine: aeon key-shape artifact `3d917657`
 * against the landed `SceneRemap.Ladder(t, y, h)` at aeon `d8baf84f`.
 *
 * ⚠ HOW THE EXPECTATIONS BELOW ARE OBTAINED. Where a row could be written either
 * as "the constant equals 511" or as "the codec refuses 512 and accepts 511", it
 * is written the second way: a row that compares a derived constant to a typed
 * number proves only that two people typed the same number, and a row that
 * compares it to the schema node it was derived FROM proves nothing at all. The
 * two places a literal does appear are marked, and each is cross-checked against
 * an INDEPENDENT statement of the same quantity inside the contract itself
 * (`height_shift`'s description carries three worked shift/line pairs, which is
 * a second spelling of `H = 1 << shift` written by the contract's author rather
 * than by this file).
 *
 * WHAT THIS FILE CANNOT SEE. Everything here is node-only, so nothing below is
 * evidence that the row RENDERS, that the picker writes on a real click, or that
 * a warning is painted where an author would read it. That is
 * `scratchpad/row-remap-control-harness.mjs`, which drives the real app.
 */

const GOLDEN_PATH = resolve(__dirname, '../fixtures/effects/canopy_dusk.json');
const GOLDEN = readFileSync(GOLDEN_PATH, 'utf8');

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

/** The golden with `mutate` applied to its parsed form, re-rendered in §5 order. */
function goldenWith(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(GOLDEN) as Record<string, unknown>;
  mutate(doc);
  return `${JSON.stringify(sortDeep(doc), null, 2)}\n`;
}

/** The layers array of the golden, as plain records. */
function layersOf(doc: Record<string, unknown>): Record<string, unknown>[] {
  return doc.layers as Record<string, unknown>[];
}

/** Validate a whole document against the vendored schema; the issue list. */
function issues(doc: unknown): string[] {
  return validateAgainstSchema(doc, EFFECTS_SCENE_SCHEMA)
    .map((i) => `${i.path || '<document>'}: ${i.message}`);
}

/** A document whose layer 1 carries `value` as its `rowRemap`. */
function withRemap(value: unknown): Record<string, unknown> {
  const doc = JSON.parse(GOLDEN) as Record<string, unknown>;
  layersOf(doc)[1].rowRemap = value;
  return doc;
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

describe('rowRemap survives the load -> save round trip', () => {
  /**
   * ANTI-VACUOUS FIRST: a round trip where both sides drop the key passes while
   * proving nothing, so the INPUT is checked to carry it, the OUTPUT is checked
   * to carry it, and the output is PRINTED.
   */
  it('round-trips the golden byte for byte, carrying the remap', () => {
    expect(GOLDEN).toContain('"rowRemap"');
    expect(GOLDEN).toContain('"height_shift": 4');
    expect(GOLDEN).toContain('"plane_y": 101');

    const out = serializeEffectsScene(parseEffectsScene(GOLDEN, 'canopy_dusk'));
    console.log('--- serializeEffectsScene(parseEffectsScene(canopy_dusk.json)) ---\n' + out);

    expect(out).toContain('"height_shift": 4');
    expect(out).toContain('"plane_y": 101');
    expect(out).toBe(GOLDEN);
  });

  /**
   * THE GOLDEN'S VALUES ARE AEON'S, NOT THIS REPO'S. `Ladder(RowRemapLadder_Waterline16,
   * 101, 4)` is the one authored site in the shipped game
   * (`games/sonic4/data/effects/ojz_scenes.emp:252` at aeon `d8baf84f`, quoted
   * verbatim by the key-shape artifact). This row exists so a future edit to the
   * fixture cannot quietly turn it into a pair of numbers Aurora invented.
   */
  it('carries the shipped hand-authored pair, not invented numbers', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    expect(rowRemapOf(scene.layers[1].rowRemap)).toEqual({ plane_y: 101, height_shift: 4 });
  });

  /**
   * NEGATIVE CONTROL. The round trip must be passing because `rowRemap` is
   * DECLARED, not because the layer object stopped being closed.
   */
  it('still refuses an undeclared layer key, at both ends', () => {
    const text = goldenWith((d) => { layersOf(d)[0].rowShuffle = { plane_y: 1, height_shift: 4 }; });
    expect(() => parseEffectsScene(text, 'canopy_dusk'))
      .toThrow(/\/layers\/0: unknown property "rowShuffle" \(the schema is closed\)/);
    const inMemory = JSON.parse(text) as EffectsScene;
    expect(() => serializeEffectsScene(inMemory))
      .toThrow(/\/layers\/0: unknown property "rowShuffle" \(the schema is closed\)/);
  });

  /** Absent and `"none"` both mean no remap, and neither is rewritten into the other. */
  it('leaves absent absent and "none" spelled, and treats both as no remap', () => {
    const text = goldenWith((d) => {
      delete layersOf(d)[1].rowRemap;
      layersOf(d)[2].rowRemap = 'none';
    });
    const scene = parseEffectsScene(text, 'canopy_dusk');
    expect(scene.layers[1].rowRemap).toBeUndefined();
    expect(scene.layers[2].rowRemap).toBe('none');
    expect(rowRemapOf(scene.layers[1].rowRemap)).toBeNull();
    expect(rowRemapOf(scene.layers[2].rowRemap)).toBeNull();

    const out = serializeEffectsScene(scene);
    expect(out).toBe(text);
  });

  /** An unrelated edit must not cost the remap (`cloneEffectsScene` is structuredClone). */
  it('survives a clone-and-edit of an unrelated field', () => {
    const edited = cloneEffectsScene(parseEffectsScene(GOLDEN, 'canopy_dusk'));
    edited.name = 'Canopy — dawn';
    edited.layers[0].world_y = 8;
    const back = JSON.parse(serializeEffectsScene(edited)) as EffectsScene;
    expect(back.layers[1].rowRemap).toEqual({ plane_y: 101, height_shift: 4 });
  });

  /** The card edits it, so it does not also print read-only in the extras line. */
  it('is not repeated in the read-only extras line', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    expect(layerExtras(scene.layers[1]).map((e) => e.key as string)).not.toContain('rowRemap');
  });

  /** `"none"` is the schema's default, which is what makes clearing DELETE the key. */
  it('declares "none" as its default, so an absent key already means it', () => {
    expect(EFFECTS_LAYER_KEY_DEFAULTS.get('rowRemap')).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// The bounds, as CONSEQUENCES rather than as restated numbers
// ---------------------------------------------------------------------------

describe('the payload the schema accepts', () => {
  it('accepts both ends of plane_y and refuses one step past each', () => {
    const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
    for (const y of [min, max]) {
      expect(issues(withRemap({ plane_y: y, height_shift: 4 })), `plane_y ${y}`).toEqual([]);
    }
    for (const y of [min - 1, max + 1]) {
      expect(issues(withRemap({ plane_y: y, height_shift: 4 })).join(' '), `plane_y ${y}`)
        .toMatch(/plane_y/);
    }
  });

  it('accepts both ends of height_shift and refuses one step past each', () => {
    const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
    for (const h of [min, max]) {
      expect(issues(withRemap({ plane_y: 101, height_shift: h })), `shift ${h}`).toEqual([]);
    }
    for (const h of [min - 1, max + 1]) {
      expect(issues(withRemap({ plane_y: 101, height_shift: h })).join(' '), `shift ${h}`)
        .toMatch(/height_shift/);
    }
  });

  it('requires BOTH fields — neither alone is a payload', () => {
    expect(issues(withRemap({ plane_y: 101 })).join(' ')).toMatch(/height_shift/);
    expect(issues(withRemap({ height_shift: 4 })).join(' ')).toMatch(/plane_y/);
  });

  it('accepts the string "none" and refuses any other string, null, or a float', () => {
    expect(issues(withRemap('none'))).toEqual([]);
    for (const bad of ['off', 'None', '', null, 4]) {
      expect(issues(withRemap(bad)).length, JSON.stringify(bad)).toBeGreaterThan(0);
    }
    expect(issues(withRemap({ plane_y: 101.5, height_shift: 4 })).length).toBeGreaterThan(0);
    expect(issues(withRemap({ plane_y: 101, height_shift: 4.5 })).length).toBeGreaterThan(0);
  });

  /**
   * THE `{"not": {}}` PAIR — the reserved names, refused BY NAME.
   *
   * This is the row that matters for the evaluator: `not` with an EMPTY
   * subschema is the refuse-everything idiom (an empty schema matches every
   * value, so its negation matches none), and it is the first time either
   * committed contract schema uses it. The names are NOT listed here — they come
   * from `EFFECTS_ROW_REMAP_REFUSED_KEYS`, which finds them by the idiom — and
   * the row is anti-vacuous: the set must be non-empty, and an ordinary
   * undeclared key must fail DIFFERENTLY (closed-object, not `not`), so this
   * cannot be passing merely because the object is closed.
   */
  it('refuses every reserved name by name, through the `not: {}` idiom', () => {
    expect(EFFECTS_ROW_REMAP_REFUSED_KEYS.length).toBeGreaterThan(0);
    for (const key of EFFECTS_ROW_REMAP_REFUSED_KEYS) {
      const found = issues(withRemap({ plane_y: 101, height_shift: 4, [key]: 'waterline16' }));
      console.log(`--- rowRemap carrying reserved "${key}" ---\n${found.join('\n')}`);
      expect(found.length, key).toBeGreaterThan(0);
      expect(found.join(' '), key).toContain(key);
    }
  });

  it('refuses an undeclared payload key for the CLOSED-object reason, not the `not` one', () => {
    const found = issues(withRemap({ plane_y: 101, height_shift: 4, anchor: 2 }));
    expect(found.join(' ')).toMatch(/anchor/);
    expect(EFFECTS_ROW_REMAP_REFUSED_KEYS).not.toContain('anchor');
  });
});

// ---------------------------------------------------------------------------
// A SHIFT, NOT A LINE COUNT
// ---------------------------------------------------------------------------

describe('height_shift is a shift and the editor must export the shift', () => {
  /**
   * THE ONE PLACE A NUMBER PAIR IS TYPED IN THIS FILE, AND IT IS NOT TYPED: the
   * contract's own `height_shift` description carries three worked pairs — "4 is
   * a 16-line ladder", "6 is 64 lines", "7 is 128 lines". They are parsed out
   * here and compared with `rowRemapHeightLines`, so the shift/line relation is
   * checked against a statement written by the contract's author rather than
   * against `1 << shift` spelled a second time by this file.
   */
  it('agrees with every worked shift/line pair the contract writes down', () => {
    const description = (EFFECTS_SCENE_SCHEMA as unknown as Record<string, never>)
      && (JSON.parse(readFileSync(
        resolve(__dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.json'),
        'utf8',
      )) as Record<string, never>);
    const node = (description as unknown as {
      $defs: { layer: { properties: { rowRemap: { oneOf: Record<string, unknown>[] } } } };
    }).$defs.layer.properties.rowRemap.oneOf
      .map((b) => (b.properties as Record<string, { description?: string }> | undefined))
      .find((props) => props?.height_shift !== undefined)?.height_shift;
    const text = node?.description ?? '';
    expect(text.length, 'the contract carries no height_shift description').toBeGreaterThan(0);

    const pairs = [...text.matchAll(/(\d+) is (?:a )?(\d[\d,]*)[ -]lines?/g)]
      .map((m) => ({ shift: Number(m[1]), lines: Number(m[2].replace(/,/g, '')) }));
    console.log('--- worked shift/line pairs the contract states ---\n'
      + JSON.stringify(pairs));
    expect(pairs.length, 'the contract states no worked shift/line pair to check against')
      .toBeGreaterThan(0);
    for (const { shift, lines } of pairs) {
      expect(rowRemapHeightLines(shift), `contract says shift ${shift} is ${lines} lines`)
        .toBe(lines);
    }
  });

  /**
   * THE POISON THIS PARCEL EXISTS FOR. Every option the picker offers has a LINE
   * COUNT that differs from its SHIFT, and the writer must emit the shift. An
   * editor that exported the line count would be schema-legal for shift 4
   * (16 is outside 3..7, so that one WOULD be caught) but the row asserts the
   * value written equals `o.shift` and NOT `o.lines`, on every option.
   */
  it('writes the SHIFT for every option the picker offers, never the line count', () => {
    expect(ROW_REMAP_HEIGHT_OPTIONS.length).toBe(EFFECTS_ROW_REMAP_HEIGHT_SHIFTS.length);
    for (const o of ROW_REMAP_HEIGHT_OPTIONS) {
      expect(o.lines, `option ${o.shift} is vacuous: lines == shift`).not.toBe(o.shift);
      const written = rowRemapWithHeightShift({ plane_y: 101, height_shift: 4 }, o.shift);
      expect(written, o.label).toEqual({ plane_y: 101, height_shift: o.shift });
      expect((written as { height_shift: number }).height_shift, o.label).not.toBe(o.lines);
      // And the option the AUTHOR reads names the lines, so the display half of
      // "display the lines, export the shift" is present too.
      expect(o.label).toContain(String(o.lines));
    }
  });

  it('refuses a shift outside the contract range and says which unit it is', () => {
    const { min, max } = EFFECTS_ROW_REMAP_HEIGHT_SHIFT_BOUNDS;
    const why = rowRemapHeightShiftRefusal(rowRemapHeightLines(max));
    expect(why, `${rowRemapHeightLines(max)} is a line count, not a shift`).not.toBeNull();
    console.log('--- typing the line count into the shift ---\n' + why);
    expect(why).toContain('SHIFT, NOT A LINE COUNT');
    expect(rowRemapHeightShiftRefusal(min)).toBeNull();
    expect(rowRemapHeightShiftRefusal(max)).toBeNull();
    expect(rowRemapHeightShiftRefusal(min - 1)).not.toBeNull();
    expect(rowRemapHeightShiftRefusal(4.5)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// plane_y — the bound with no other enforcement
// ---------------------------------------------------------------------------

describe('plane_y, whose ceiling this schema alone enforces', () => {
  it('refuses past the ceiling and says the engine will not catch it', () => {
    const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
    expect(rowRemapPlaneYRefusal(min)).toBeNull();
    expect(rowRemapPlaneYRefusal(max)).toBeNull();
    const why = rowRemapPlaneYRefusal(max + 1);
    expect(why).not.toBeNull();
    console.log('--- one past the ceiling ---\n' + why);
    expect(why).toContain('ONLY ENFORCEMENT');
    expect(rowRemapPlaneYRefusal(min - 1)).not.toBeNull();
    expect(rowRemapPlaneYRefusal(1.5)).not.toBeNull();
  });

  it('clamps a SEED into range and leaves a TYPED value alone', () => {
    const { min, max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
    expect(clampRowRemapPlaneY(max + 1000)).toBe(max);
    expect(clampRowRemapPlaneY(min - 1000)).toBe(min);
    // The writer does not clamp: a clamp would substitute a number the author
    // did not type. The refusal above is what withholds the commit instead.
    expect(rowRemapWithPlaneY({ plane_y: 10, height_shift: 4 }, max + 1))
      .toEqual({ plane_y: max + 1, height_shift: 4 });
  });

  /**
   * A NEW REMAP IS SEEDED FROM THE STRIP'S OWN TOP, CLAMPED. The strip whose
   * `world_y` is past the plane's last line must still seed a legal window,
   * because nothing downstream would catch it.
   */
  it('seeds a new remap from the strip, inside the plane, and never unbuildable', () => {
    const { max } = EFFECTS_ROW_REMAP_PLANE_Y_BOUNDS;
    expect(rowRemapFromToggle(false, { world_y: 96 })).toBeUndefined();
    expect(rowRemapFromToggle(true, { world_y: 96 }))
      .toEqual({ plane_y: 96, height_shift: EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT });
    expect(rowRemapFromToggle(true, { world_y: 30000 }))
      .toEqual({ plane_y: max, height_shift: EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT });
    // The seed is legal on both fields, checked through the codec rather than by eye.
    expect(issues(withRemap(rowRemapFromToggle(true, { world_y: 30000 })))).toEqual([]);
    // And it is the shift that builds, while the contract still names one.
    expect(rowRemapBuildableToday(EFFECTS_ROW_REMAP_SEED_HEIGHT_SHIFT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SCHEMA-LEGAL IS NOT BUILDABLE
// ---------------------------------------------------------------------------

describe('the four legal shifts that do not build yet', () => {
  it('marks exactly one option buildable while the contract names one', () => {
    const buildable = ROW_REMAP_HEIGHT_OPTIONS.filter((o) => o.buildsToday);
    console.log('--- the height picker as an author sees it ---\n'
      + ROW_REMAP_HEIGHT_OPTIONS.map((o) => `${o.buildsToday ? '*' : ' '} ${o.label}`).join('\n'));
    if (EFFECTS_ROW_REMAP_BUILDABLE_SHIFT === null) {
      // 9b landed and the contract dropped the clause: every shift builds and no
      // warning is left behind. This branch is the retirement condition working.
      expect(buildable.length).toBe(ROW_REMAP_HEIGHT_OPTIONS.length);
      return;
    }
    expect(buildable.map((o) => o.shift)).toEqual([EFFECTS_ROW_REMAP_BUILDABLE_SHIFT]);
    expect(buildable[0].label).toContain('builds');
  });

  it('offers every legal shift anyway — none is hidden', () => {
    expect(ROW_REMAP_HEIGHT_OPTIONS.map((o) => o.shift))
      .toEqual([...EFFECTS_ROW_REMAP_HEIGHT_SHIFTS]);
  });

  it('warns for a legal-but-unbuildable shift, naming what unblocks it', () => {
    if (EFFECTS_ROW_REMAP_BUILDABLE_SHIFT === null) return;
    const other = EFFECTS_ROW_REMAP_HEIGHT_SHIFTS
      .find((s) => s !== EFFECTS_ROW_REMAP_BUILDABLE_SHIFT)!;
    const why = rowRemapBuildableToday(other);
    console.log(`--- picking shift ${other} today ---\n` + why);
    expect(why).not.toBeNull();
    // The sentence is the CURRENT STATE with its reason, not "only 4 works":
    // it names what is missing (the generated ladder) and what does build.
    expect(why).toContain('generat');
    expect(why).toContain(String(rowRemapHeightLines(EFFECTS_ROW_REMAP_BUILDABLE_SHIFT)));
    // And it is a warning, never a refusal: the document stays schema-legal.
    expect(issues(withRemap({ plane_y: 101, height_shift: other }))).toEqual([]);
    expect(rowRemapHeightShiftRefusal(other)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The three scene() preconditions
// ---------------------------------------------------------------------------

/** The rowRemap description, read straight off the vendored bytes. */
const ROW_REMAP_DESCRIPTION: string = (() => {
  const raw = JSON.parse(readFileSync(
    resolve(__dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.json'),
    'utf8',
  )) as { $defs: { layer: { properties: { rowRemap: { description: string } } } } };
  return raw.$defs.layer.properties.rowRemap.description;
})();

describe('the three scene() preconditions, answered from the open document', () => {
  const golden = (): EffectsScene => parseEffectsScene(GOLDEN, 'canopy_dusk');

  /**
   * THE GOLDEN MEETS ALL THREE, which is what makes every failing case below a
   * measurement rather than a coincidence: layer 1 carries the remap AND its own
   * curve, the scene declares an anchor, and no other layer is remapped.
   */
  it('says nothing about a scene that meets them', () => {
    expect(rowRemapPreconditions(golden(), 1)).toEqual([]);
  });

  it('says nothing at all about a strip that carries no remap', () => {
    expect(rowRemapPreconditions(golden(), 0)).toEqual([]);
    expect(rowRemapOf(golden().layers[0].rowRemap)).toBeNull();
  });

  it('reports a scene with no anchor, in the contract\'s own words', () => {
    const scene = golden();
    scene.anchor = 'none';
    const said = rowRemapPreconditions(scene, 1);
    console.log('--- no anchor ---\n' + said.join('\n'));
    expect(said.length).toBe(1);
    // THE SENTENCE THE AUTHOR READS IS THE CONTRACT'S. Checked by asking whether
    // the quoted clause really occurs in the vendored description, so a
    // paraphrase would fail here even though it would read fine.
    expect(ROW_REMAP_DESCRIPTION).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.anchor);
    expect(said[0]).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.anchor);
  });

  it('reports a SECOND remapped strip and names it', () => {
    const scene = golden();
    scene.layers[3].rowRemap = { plane_y: 200, height_shift: 4 };
    const said = rowRemapPreconditions(scene, 1);
    console.log('--- two remapped strips ---\n' + said.join('\n'));
    expect(said.length).toBe(1);
    expect(said[0]).toContain('3');
    expect(ROW_REMAP_DESCRIPTION).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.single);
    expect(said[0]).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.single);
    // Symmetric: the OTHER strip is told about this one too.
    expect(rowRemapPreconditions(scene, 3).join(' ')).toContain('1');
  });

  /**
   * NOTHING TO VARY — the one whose failure is INVISIBLE rather than wrong: the
   * remap becomes the identity and the effect is ABSENT, so an author who met
   * the other two would see a scene that builds, ships, and does nothing.
   *
   * Built by removing all three of the contract's sources one at a time, so the
   * row cannot pass by removing something else.
   */
  it('reports a strip with nothing to vary once all three sources are gone', () => {
    const scene = golden();
    // Source 1: its own curve.
    scene.layers[1].curve = 'none';
    expect(rowRemapPreconditions(scene, 1), 'a live dsb + deform_bg still varies it').toEqual([]);
    // Source 2: a live dsb with a deform_bg table. Take the table away.
    scene.deform_bg = 'none';
    // Source 3 is the anchor's live dsb, which also needs that table — so both
    // fall together and the strip now has nothing.
    const said = rowRemapPreconditions(scene, 1);
    console.log('--- nothing to vary ---\n' + said.join('\n'));
    expect(said.length).toBe(1);
    expect(ROW_REMAP_DESCRIPTION).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.vary);
    expect(said[0]).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.vary);
    // Putting ONE source back silences it — so the row is about the disjunction,
    // not about the last thing that was deleted.
    const withCurve = cloneEffectsScene(scene);
    withCurve.layers[1].curve = { to: 'FACTOR_1_2' };
    expect(rowRemapPreconditions(withCurve, 1)).toEqual([]);
    const withTable = cloneEffectsScene(scene);
    withTable.deform_bg = { shared: { speed: 0, table: { generator: 'zero' } } };
    expect(rowRemapPreconditions(withTable, 1)).toEqual([]);
  });

  /**
   * A LAYER'S OWN DEFORM TABLE FOLDS OVER ITS `dsb` — `layer()` stores
   * `own.shift_b` in `ly_dsb` (aeon `scene_dsl.emp:558`), so a strip with an
   * `own` attachment has a live amplitude its `dsb` field does not show. A check
   * that read `layer.dsb` alone would report "nothing to vary" for exactly the
   * strips this parcel makes most interesting.
   */
  it('reads the layer\'s EFFECTIVE dsb, not the raw field', () => {
    const scene = golden();
    scene.layers[1].curve = 'none';
    delete scene.layers[1].dsa;
    delete scene.layers[1].dsb;              // raw dsb now defaults to the sentinel
    // The scene's anchor is the THIRD source, and the golden's is live — park it
    // at its own sentinel so this row is about the LAYER's amplitude alone.
    scene.anchor = { at: { channel: 2, dsa: 6, dsb: 15 } };
    expect(rowRemapPreconditions(scene, 1).length, 'sentinel dsb, no curve').toBe(1);
    scene.layers[1].deform = {
      own: { table: { generator: 'zero' }, shift_a: 15, shift_b: 4, phase: 0, speed: 0 },
    };
    expect(rowRemapPreconditions(scene, 1), 'own.shift_b is live and deform_bg has a table')
      .toEqual([]);
  });

  /** All three at once, each reported, so one does not mask the others. */
  it('reports every unmet condition, not the first', () => {
    const scene = golden();
    scene.anchor = 'none';
    scene.deform_bg = 'none';
    scene.layers[1].curve = 'none';
    scene.layers[3].rowRemap = 'none';
    scene.layers[4].rowRemap = { plane_y: 8, height_shift: 4 };
    const said = rowRemapPreconditions(scene, 1);
    console.log('--- all three unmet ---\n' + said.join('\n'));
    expect(said.length).toBe(3);
  });

  /**
   * THE FOURTH CONDITION IS NAMED RATHER THAN OMITTED. `CAP_ROW_REMAP` is not a
   * function of the document, so it can never appear in the list above — and a
   * silence there would read as coverage.
   */
  it('states the capability condition it cannot check, instead of staying silent', () => {
    expect(EFFECTS_ROW_REMAP_CAPABILITY_NOTE).toContain('CAP_ROW_REMAP');
    expect(ROW_REMAP_DESCRIPTION).toContain(EFFECTS_ROW_REMAP_GENERATOR_REFUSALS.capability);
    const everything = rowRemapPreconditions(golden(), 1).join(' ');
    expect(everything).not.toContain('CAP_ROW_REMAP');
  });
});

// ---------------------------------------------------------------------------
// The row's own plumbing
// ---------------------------------------------------------------------------

describe('the row reads and writes what it says it does', () => {
  it('shows the payload and nothing for none/absent', () => {
    const scene = parseEffectsScene(GOLDEN, 'canopy_dusk');
    expect(rowRemapFieldValue(scene.layers[1])).toEqual({ plane_y: 101, height_shift: 4 });
    expect(rowRemapFieldValue(scene.layers[0])).toBeNull();
    expect(rowRemapFieldValue({ rowRemap: 'none' })).toBeNull();
  });

  it('keeps the other field when one is edited', () => {
    expect(rowRemapWithPlaneY({ plane_y: 101, height_shift: 6 }, 12))
      .toEqual({ plane_y: 12, height_shift: 6 });
    expect(rowRemapWithHeightShift({ plane_y: 101, height_shift: 6 }, 3))
      .toEqual({ plane_y: 101, height_shift: 3 });
  });
});
