// The `boundary` key — empyrean c4a1da2, AURORA_EFFECTS_SCHEMA.md §7.6,
// EFFECTS-W1 DoD item 4's authoring half: the shipped moving water, authorable
// for the first time.
//
// ═══ WHY THIS FILE EXISTS BESIDE THE CONTRACT VECTORS ═══
//
// empyrean published TWELVE vector rows with this amendment (cases 24-35) and
// they run in effects-preset-vectors.test.ts. They cover SHAPE, and the codec
// passes all of them with no evaluator change at all. Four things they cannot
// cover are this file's:
//
//   1. THE FOURTH ARM IS NOT A RASTER CHANNEL. `boundary` is exclusive with
//      `bands` / `ramp` / `base_swap` for a DIFFERENT reason than those three
//      are with each other: they compete for `EffectsPreset.ep_raster`, and this
//      one lowers into the sibling field `ep_patched`. A vector can only say
//      "both keys together are refused"; it cannot say which of Aurora's two
//      lists a key belongs in, and Aurora had ONE list serving both questions
//      until this amendment.
//   2. ROUND-TRIP STABILITY OF DOCUMENTS THAT PREDATE THE KEY. Nothing shipped
//      carries `boundary`, so no existing file is refused today — and "not
//      refused" is a claim about REFUSAL, not about BYTES. A schema that grew 58
//      leaves could still have moved canonical output for a file nobody touched.
//      That is measured against a golden produced under the PREVIOUS schema
//      blob, so it is a before/after comparison and not the new codec agreeing
//      with itself.
//   3. THE TWO REFUSALS THE SCHEMA CANNOT EXPRESS. `lo <= hi` and `line` inside
//      `[lo, hi]` are cross-field and belong to aeon's generator. Aurora's
//      warnings for them are ADVISORY, and the rows below assert that they say
//      so — a clearance Aurora cannot honour is worse than no sentence.
//   4. A BOUNDARY THAT CANNOT MOVE IS LEGAL. `boundary` alone builds and sits
//      still; it moves only when the SAME channel index is both seeded
//      (`patch_world_ys`) and swept (`patch_motion`). Nothing anywhere refuses
//      the still document, which is exactly why a sentence has to.
//
// ⚠ AND ONE POISON THIS FILE OWNS. The raster/patched split is DERIVED from the
// schema's own `lowers into EffectsPreset.ep_patched` sentence. A derivation
// that returns an empty list looks identical to a contract with no patched arms,
// so the row below re-imports the codec against a schema with that sentence
// removed and proves the failure is LOUD rather than a boundary quietly becoming
// a raster channel.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  EFFECTS_PRESET_SCHEMA,
  EFFECTS_PRESET_PROGRAM_ARMS,
  EFFECTS_PRESET_PATCHED_ARMS,
  EFFECTS_PRESET_RASTER_CHANNELS,
  EFFECTS_PRESET_ROOT_KEYS,
  EFFECTS_PRESET_BOUNDARY_KEYS,
  EFFECTS_PRESET_BOUNDARY_LINE_RANGE,
  EFFECTS_PRESET_BOUNDARY_CHANNEL_RANGE,
  EFFECTS_PRESET_BOUNDARY_LO_RANGE,
  EFFECTS_PRESET_BOUNDARY_HI_RANGE,
  EFFECTS_PRESET_BOUNDARY_ON_ARMS,
  EFFECTS_PRESET_TINT_REGION_KEYS,
  EFFECTS_PRESET_MAX_PATCH,
  presetProgramArm,
  presetRasterChannel,
  presetDefFields,
  parseEffectsPreset,
  serializeEffectsPreset,
  EffectsPresetError,
  ANCHOR_AMP_RUNGS,
  type EffectsPreset,
  type EffectsPresetBoundary,
} from '../../src/core/formats/effects/preset';
import { boundaryAdvisories } from '../../src/core/formats/effects/boundary';
import {
  anchorTravelPx, effectsChannelBandFromDocument, anchorFitAgainstBand,
} from '../../src/core/formats/effects/channel-bands';
import { validateAgainstSchema, type JsonSchema } from '../../src/core/formats/effects/json-schema-subset';
import {
  bandControlsRefusal, addBandCommand, rasterEditorGap, rasterChannelSwapAdvisory,
  setRasterChannelCommand, presetListEntries, presetListSummary, RASTER_CHANNEL_OPTIONS,
} from '../../src/renderer/providers/effects-preset';
import { peerRepo, resolveRev, readAtRev } from '../support/peer-repo';

const S = EFFECTS_PRESET_SCHEMA as unknown as JsonSchema;
const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.json',
);
const PRESET_MODULE = resolve(__dirname, '../../src/core/formats/effects/preset');
const SCHEMA_MODULE = SCHEMA_PATH;

const ID = 'ojz_water_boundary';
const base = { schema: 1 as const, id: ID };

/**
 * THE CONTRACT'S OWN PASS VECTOR (case 24) — the shipped moving water, verbatim.
 *
 * Read out of the vendored vector file rather than retyped, so this file cannot
 * quietly diverge from the document the contract vouches for. It is aeon
 * `ojz_effects.emp:1556-1557`: `patchable(fx_tint_band(line: 100, slot: 0,
 * pal_line: 2, entry: 4, count: 3, sh: 1), ch: 0, lo: 3, hi: 220,
 * offscreen_ship: 1)`.
 */
const VECTORS = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/effects/effects-preset-vectors.json'), 'utf8'),
) as { cases: { name: string; expect: string; doc: Record<string, unknown> }[] };

const SHIPPED_WATER: EffectsPresetBoundary = (() => {
  const c = VECTORS.cases.find((v) => v.expect === 'pass' && v.doc.boundary !== undefined);
  if (c === undefined) {
    throw new Error(
      'the vendored contract vectors carry no PASSING document with a `boundary` key, so every '
      + 'row in this file would be built on a fixture Aurora invented. Re-check the vendored '
      + 'vectors before relaxing this.',
    );
  }
  return c.doc.boundary as EffectsPresetBoundary;
})();

// ═══════════════════════════════════════════════════════════════════════════
// THE FOURTH ARM, AND THE SPLIT IT FORCED
// ═══════════════════════════════════════════════════════════════════════════
describe('the fourth oneOf arm is a PROGRAM and NOT a raster channel', () => {
  it('the schema really carries the construct these rows are about (anti-vacuous)', () => {
    // The arm exists, as a single-`required` branch, and `boundary` is a
    // declared-but-not-required root key.
    const arms = (EFFECTS_PRESET_SCHEMA.oneOf as { required: string[] }[]).map((b) => b.required[0]);
    expect(arms).toContain('boundary');
    expect(EFFECTS_PRESET_ROOT_KEYS).toContain('boundary');
    expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain('boundary');
    // The `$defs` node is CLOSED and requires six members.
    const def = presetDefFields('boundary');
    expect(def.required).toEqual(['line', 'channel', 'lo', 'hi', 'on', 'sh']);
    expect(def.optional).toEqual(['offscreen_ship']);
    expect((EFFECTS_PRESET_SCHEMA.$defs as Record<string, Record<string, unknown>>)
      .boundary.unevaluatedProperties).toBe(false);
    // ...and the codec's derived list is that `required` list read back, not a
    // second copy of it.
    expect(EFFECTS_PRESET_BOUNDARY_KEYS).toEqual([...def.required]);
  });

  it('it is in PROGRAM_ARMS, is NOT in RASTER_CHANNELS, and the two partition the oneOf', () => {
    expect(EFFECTS_PRESET_PROGRAM_ARMS).toContain('boundary');
    expect(
      EFFECTS_PRESET_RASTER_CHANNELS,
      'boundary has leaked into the RASTER channel list. It lowers into ep_patched, the SIBLING '
      + 'of the ep_raster field bands/ramp/base_swap share — so every per-channel registry keyed '
      + 'off this list (nouns, labels, seeds, editors) would now claim to speak for a patched '
      + 'program, and the panel would offer to seed one.',
    ).not.toContain('boundary');
    expect(EFFECTS_PRESET_PATCHED_ARMS).toEqual(['boundary']);
    expect([...EFFECTS_PRESET_RASTER_CHANNELS, ...EFFECTS_PRESET_PATCHED_ARMS].sort())
      .toEqual([...EFFECTS_PRESET_PROGRAM_ARMS].sort());
    // Anti-vacuous: the split is not trivially "everything on one side".
    expect(EFFECTS_PRESET_RASTER_CHANNELS.length).toBeGreaterThan(0);
    expect(EFFECTS_PRESET_PATCHED_ARMS.length).toBeGreaterThan(0);
  });

  it('the schema really states the lowering field this split is derived FROM', () => {
    // The derivation is a regex over the arm's own description. If this sentence
    // is not there, the derivation is reading nothing and the row above would be
    // green for the wrong reason — so the sentence itself is asserted.
    const d = String(
      (EFFECTS_PRESET_SCHEMA.properties as Record<string, Record<string, unknown>>)
        .boundary.description ?? '',
    );
    expect(d).toMatch(/lowers into EffectsPreset\.ep_patched/);
    expect(d).toMatch(/the sibling of the ep_raster field the other three share/);
    // ...and no RASTER arm claims it, which is what makes the filter a filter.
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const dc = String(
        (EFFECTS_PRESET_SCHEMA.properties as Record<string, Record<string, unknown>>)
          [c].description ?? '',
      );
      expect(dc, `${c} claims to lower into ep_patched`)
        .not.toMatch(/lowers into EffectsPreset\.ep_patched/);
    }
  });

  it('presetProgramArm names it; presetRasterChannel does NOT, and the difference is the point', () => {
    const doc: Partial<EffectsPreset> = { ...base, boundary: SHIPPED_WATER };
    expect(presetProgramArm(doc)).toBe('boundary');
    expect(
      presetRasterChannel(doc),
      'presetRasterChannel names boundary as a raster channel — a caller branching on it would '
      + 'reach for a raster editor for a patched program',
    ).toBeNull();
    // ...and it still answers correctly for the three that ARE raster channels,
    // so this is not a function that has stopped working.
    expect(presetProgramArm({ ...base, bands: [] })).toBe('bands');
    expect(presetRasterChannel({ ...base, bands: [] })).toBe('bands');
    // A document with NO program: both null, and they mean different things.
    expect(presetProgramArm({ ...base })).toBeNull();
    expect(presetRasterChannel({ ...base })).toBeNull();
  });

  it('boundary + every raster channel is REFUSED, on BOTH codec paths', () => {
    // Enumerated from the derived lists so a fifth arm cannot leave a pair
    // silently untested.
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      const other = c === 'bands'
        ? { bands: [{ top: 64, bot: 96, sh: false, on: { cram: { addr: 34, colours: [546, 306] } } }] }
        : c === 'base_swap'
          ? { base_swap: { line: 3, target: 57344 } }
          : {
            ramp: {
              top: 128, lines: 64, target: { vsram: { addr: 2 } },
              start: { whole: 0, frac256: 0 }, step: { whole: 1, frac256: 128 },
            },
          };
      const doc = { ...base, boundary: SHIPPED_WATER, ...other };
      expect(
        validateAgainstSchema(doc, S),
        `a document carrying boundary + ${c} was ACCEPTED. They install into ep_patched and `
        + 'ep_raster and preset() refuses a record carrying both, because whichever installs last '
        + 'wins DESTRUCTIVELY.',
      ).not.toEqual([]);
      expect(() => parseEffectsPreset(JSON.stringify(doc), ID)).toThrow(EffectsPresetError);
      expect(() => serializeEffectsPreset(doc as unknown as EffectsPreset))
        .toThrow(EffectsPresetError);
    }
  });

  /**
   * ═══ THE POISON THIS FILE OWNS ═══
   *
   * `EFFECTS_PRESET_PATCHED_ARMS` is a regex over the schema's own sentence, and
   * a regex that matches nothing returns an EMPTY LIST — which is exactly what a
   * contract with no patched arms would produce. Those two states must not emit
   * the same artifact, so this re-imports the codec against a schema whose
   * `ep_patched` sentence has been removed and measures what actually happens.
   *
   * WHAT IT RULES OUT: "the split is green because the derivation happens to
   * work", by showing the failure mode is a boundary landing in
   * `EFFECTS_PRESET_RASTER_CHANNELS` — and that the renderer's registries then
   * REFUSE TO LOAD rather than offering a raster editor for a patched program.
   * That second half is the one that matters: an empty patched list on its own
   * is silent, and the loud consequence is what makes it survivable.
   */
  describe('POISON: the ep_patched sentence removed from the vendored schema', () => {
    afterEach(() => {
      vi.doUnmock(SCHEMA_MODULE);
      vi.resetModules();
    });

    it('boundary falls INTO the raster channels — and the renderer refuses to load', async () => {
      const real = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as
        { properties: Record<string, { description?: string }> };
      // Anti-vacuous: the sentence really is in the bytes we are removing it
      // from, so the mutation is a mutation and not a no-op.
      expect(real.properties.boundary.description)
        .toMatch(/lowers into EffectsPreset\.ep_patched/);
      real.properties.boundary.description = real.properties.boundary.description!
        .replace(/lowers into EffectsPreset\.ep_patched/, 'lowers into somewhere else entirely');
      expect(real.properties.boundary.description)
        .not.toMatch(/lowers into EffectsPreset\.ep_patched/);

      vi.resetModules();
      vi.doMock(SCHEMA_MODULE, () => ({ default: real }));
      const poisoned = await import(PRESET_MODULE) as typeof import('../../src/core/formats/effects/preset');

      // The stub took, and the classification collapsed the way it must.
      expect(poisoned.EFFECTS_PRESET_PATCHED_ARMS).toEqual([]);
      expect(
        poisoned.EFFECTS_PRESET_RASTER_CHANNELS,
        'the ep_patched sentence was removed and boundary did NOT fall into the raster channels — '
        + 'so this poison is not exercising the derivation it claims to, and the split above is '
        + 'green for a reason this row cannot see',
      ).toContain('boundary');

      // ═══ AND THE CONSEQUENCE IS LOUD ═══
      //
      // The renderer's per-channel registries are keyed by the raster list and
      // each has a module-load guard. With `boundary` in that list and no noun
      // for it, importing the provider must THROW — which is what makes an
      // empty patched list survivable rather than silent.
      await expect(
        import('../../src/renderer/providers/effects-preset'),
        'the provider loaded happily with boundary counted as a raster channel. The per-channel '
        + 'registries have stopped guarding, so a patched program would be offered a raster '
        + 'editor and a Raster-row seed with nothing saying so.',
      ).rejects.toThrow(/RASTER_CHANNEL_NOUNS|RASTER_CHANNEL_LABELS/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE RANGES AND THE CLOSED tint_region
// ═══════════════════════════════════════════════════════════════════════════
describe('boundary bounds and $defs.tint_region', () => {
  it('every range is read off the schema, and none is retyped', () => {
    const defs = EFFECTS_PRESET_SCHEMA.$defs as Record<string, Record<string, Record<string, Record<string, number>>>>;
    const props = defs.boundary.properties;
    expect(EFFECTS_PRESET_BOUNDARY_LINE_RANGE)
      .toEqual({ min: props.line.minimum, max: props.line.maximum });
    expect(EFFECTS_PRESET_BOUNDARY_LO_RANGE)
      .toEqual({ min: props.lo.minimum, max: props.lo.maximum });
    expect(EFFECTS_PRESET_BOUNDARY_HI_RANGE)
      .toEqual({ min: props.hi.minimum, max: props.hi.maximum });
    expect(EFFECTS_PRESET_BOUNDARY_CHANNEL_RANGE)
      .toEqual({ min: props.channel.minimum, max: props.channel.maximum });
    // ⚠ THE CHANNEL RANGE AND THE POSITIONAL ARRAYS' maxItems ARE TWO STATEMENTS
    // OF RASTER_MAX_PATCH. The codec asserts they agree at module load; this
    // pins that the two really are different schema nodes, so the interlock is
    // comparing two things and not one thing to itself.
    expect(EFFECTS_PRESET_BOUNDARY_CHANNEL_RANGE.max).toBe(EFFECTS_PRESET_MAX_PATCH - 1);
    expect(EFFECTS_PRESET_MAX_PATCH)
      .toBe((EFFECTS_PRESET_SCHEMA.properties as Record<string, Record<string, number>>)
        .patch_world_ys.maxItems);
  });

  it('`on` has exactly ONE arm, pal_region — no cram arm, and none reserved', () => {
    expect(EFFECTS_PRESET_BOUNDARY_ON_ARMS).toEqual(['pal_region']);
    // A cram arm is refused (contract vector case 33) — asserted here through
    // the codec so the "no arm is reserved" claim is about behaviour.
    const withCram = {
      ...base,
      boundary: { ...SHIPPED_WATER, on: { cram: { addr: 34, colours: [546, 306] } } },
    };
    expect(() => parseEffectsPreset(JSON.stringify(withCram), ID)).toThrow(EffectsPresetError);
  });

  it('tint_region is pal_region MINUS addr, and addr is refused by closure', () => {
    const tint = presetDefFields('tint_region');
    const pal = presetDefFields('pal_region');
    expect([...tint.required].sort()).toEqual(['count', 'entry', 'pal_line', 'slot']);
    expect(tint.optional).toEqual([]);
    expect(EFFECTS_PRESET_TINT_REGION_KEYS).toEqual([...tint.required]);
    // The absence, stated as a difference rather than as a list: whatever
    // pal_region declares, tint_region declares the same minus `addr`.
    expect([...pal.required, ...pal.optional].filter((k) => k !== 'addr').sort())
      .toEqual([...tint.required, ...tint.optional].sort());
    expect([...pal.required, ...pal.optional]).toContain('addr');
    // ...and a document carrying it is refused (contract vector case 32).
    const withAddr = {
      ...base,
      boundary: {
        ...SHIPPED_WATER,
        on: { pal_region: { ...SHIPPED_WATER.on.pal_region, addr: 72 } },
      },
    };
    expect(() => parseEffectsPreset(JSON.stringify(withAddr), ID)).toThrow(EffectsPresetError);
  });

  it('there is NO null spelling — absent means none', () => {
    // A null arm would be a document with zero programs (contract vector 27).
    expect(() => parseEffectsPreset(JSON.stringify({ ...base, boundary: null }), ID))
      .toThrow(EffectsPresetError);
    // ...and the schema does not offer one: the property node is a bare `$ref`,
    // with no `oneOf` over a null branch the way `cycles` has.
    const node = (EFFECTS_PRESET_SCHEMA.properties as Record<string, Record<string, unknown>>).boundary;
    expect(node.$ref).toBe('#/$defs/boundary');
    expect(node.type).toBeUndefined();
    expect(node.oneOf).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUND TRIP — the shipped water, and every document that PREDATES the key
// ═══════════════════════════════════════════════════════════════════════════
describe('round trip', () => {
  it('the shipped water parses, serializes and re-parses with nothing dropped', () => {
    const doc = { ...base, name: 'OJZ act 1 - moving water tint boundary', boundary: SHIPPED_WATER };
    const text = serializeEffectsPreset(doc as unknown as EffectsPreset);
    const back = parseEffectsPreset(text, ID);
    expect(back).toEqual(doc);
    // ...and serializing what came back is byte-identical, so the writer has a
    // fixed point rather than a shape it keeps nudging.
    expect(serializeEffectsPreset(back)).toBe(text);
    // Every authored member survived, by name.
    for (const k of EFFECTS_PRESET_BOUNDARY_KEYS) {
      expect(Object.keys(back.boundary!), `${k} was dropped on the way through`).toContain(k);
    }
    expect(back.boundary!.offscreen_ship).toBe(SHIPPED_WATER.offscreen_ship);
  });

  it('the whole moving water in ONE document — boundary + seed + motion at the same index', () => {
    // The contract's case 25: this is what "make this water move" is.
    const c = VECTORS.cases.find((v) => v.doc.boundary !== undefined
      && v.doc.patch_world_ys !== undefined && v.doc.patch_motion !== undefined);
    expect(c, 'the vendored vectors no longer carry the boundary+seed+motion document').toBeTruthy();
    const doc = c!.doc as unknown as EffectsPreset;
    const text = serializeEffectsPreset(doc);
    expect(parseEffectsPreset(text, doc.id)).toEqual(doc);
    // The index really is shared — the whole reason the three keys are one
    // document.
    expect(doc.patch_world_ys!.length).toBeGreaterThan(doc.boundary!.channel);
    expect(doc.patch_motion!.length).toBeGreaterThan(doc.boundary!.channel);
    expect(doc.patch_world_ys![doc.boundary!.channel]).not.toBeNull();
    expect(doc.patch_motion![doc.boundary!.channel]).not.toBeNull();
  });

  /**
   * ⚠ NOTHING SHIPPED CARRIES `boundary`, SO NO EXISTING FILE IS REFUSED TODAY —
   * AND "NOT REFUSED" IS A CLAIM ABOUT REFUSAL, NOT ABOUT BYTES.
   *
   * The amendment added 58 leaves to the schema, and `serializeEffectsPreset`
   * runs `canonicalizeBySchema` over the WHOLE document against the WHOLE
   * schema. A new `$defs` or a new `oneOf` arm is exactly the kind of change
   * that can move canonical output for a file nobody touched — at which point
   * opening an untouched preset and saving it REWRITES it, and every diff after
   * that is noise an author did not author.
   *
   * ═══ THE GOLDEN WAS PRODUCED UNDER THE **OLD** SCHEMA ═══
   *
   * `preset-canonical-golden.json` holds Aurora's canonical output for every
   * preset aeon ships, generated against schema blob `13473a43` — the blob this
   * repo carried BEFORE this parcel. So the row below is a genuine before/after
   * comparison and not the new codec agreeing with itself. Its sidecar fields
   * record how it was made and why the generator is built on the two modules
   * this parcel did NOT touch (`json-schema-subset.ts`, `canonical-json.ts`)
   * rather than on `preset.ts`, which at the new revision cannot load the old
   * schema at all.
   *
   * ⚠ AND IT IS NOT A CLAIM THAT AURORA AGREES WITH AEON. aeon's own bytes are
   * in the fixture too, and they are NOT the canonical form — aeon's generator
   * writes its own key order and Aurora's writer sorts recursively. The row
   * asserts the two things separately: aeon's document PARSES, and Aurora's
   * answer for it has not MOVED.
   */
  it('every preset aeon ships still canonicalises to EXACTLY the pre-parcel bytes', () => {
    const golden = JSON.parse(readFileSync(
      resolve(__dirname, '../fixtures/effects/preset-canonical-golden.json'), 'utf8',
    )) as {
      produced_under_schema_blob: string;
      documents: Record<string, string>;
      canonical: Record<string, string>;
    };
    const ids = Object.keys(golden.canonical).sort();
    // Anti-vacuous, three ways: the fixture is not empty, it really was made
    // under a DIFFERENT schema blob from the one on disk now, and its two halves
    // cover the same documents.
    expect(ids.length).toBeGreaterThan(0);
    expect(
      golden.produced_under_schema_blob,
      'the golden was produced under the schema this repo carries NOW, so this row compares the '
      + 'new codec to itself and proves nothing about the re-vendor',
    ).not.toBe(JSON.parse(readFileSync(
      resolve(__dirname, '../fixtures/effects/effects-preset-vectors.provenance.json'), 'utf8',
    )).empyrean.blob);
    expect(Object.keys(golden.documents).sort()).toEqual(ids);

    for (const id of ids) {
      const parsed = parseEffectsPreset(golden.documents[id], id);
      expect(parsed.id).toBe(id);
      // The premise of "no shipped document is refused today": not one of them
      // carries the new key.
      expect(parsed.boundary, `${id} carries a boundary key — this row's premise has changed`)
        .toBeUndefined();
      expect(
        serializeEffectsPreset(parsed),
        `${id}.json no longer canonicalises to the bytes it did before the c4a1da2 re-vendor. The `
        + 'amendment has moved canonical output for a document that predates the key, so opening '
        + 'and saving an untouched preset would rewrite it. That is a MIGRATION of every shipped '
        + 'preset and needs saying out loud — do not regenerate the golden to make this green.',
      ).toBe(golden.canonical[id]);
    }
  });

  /**
   * ⚠ AND THE DOCUMENTS IN THE GOLDEN ARE STILL AEON'S, at the revision the
   * fixture names. A golden nobody re-checks against its source is a fixture
   * that has quietly become a copy of Aurora's own opinion — so this reads
   * aeon's tip and reports a drift rather than letting the pair diverge in
   * silence. It skips LOUDLY without an aeon checkout: never green.
   */
  it('CURRENCY: the golden\'s source documents are still what aeon ships', (ctx) => {
    const aeon = peerRepo('aeon');
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR) — CANNOT '
        + 'MEASURE whether preset-canonical-golden.json still describes aeon\'s preset library');
      return;
    }
    const tip = resolveRev(aeon, 'origin/master');
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: origin/master does not resolve in ${aeon} — CANNOT MEASURE`);
      return;
    }
    const golden = JSON.parse(readFileSync(
      resolve(__dirname, '../fixtures/effects/preset-canonical-golden.json'), 'utf8',
    )) as { documents: Record<string, string> };
    const DIR = 'games/sonic4/data/editor/effects/presets';
    const drifted: string[] = [];
    for (const id of Object.keys(golden.documents).sort()) {
      const at = readAtRev(aeon, tip, `${DIR}/${id}.json`);
      if (!at.ok) { drifted.push(`${id}: ${at.why}`); continue; }
      if (at.text !== golden.documents[id]) drifted.push(`${id}: bytes differ at aeon ${tip}`);
    }
    expect(
      drifted,
      'NOT AN AURORA REGRESSION — preset-canonical-golden.json\'s source documents are stale '
      + 'against aeon origin/master. Re-generate the fixture FROM THE SCHEMA THIS REPO CARRIED '
      + 'WHEN THE DOCUMENTS LAST AGREED (its $how_it_was_produced field says how), or the '
      + 'before/after property the row above measures is lost.',
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CROSS-FIELD RULES — ADVISORY, AND SAYING SO
// ═══════════════════════════════════════════════════════════════════════════
describe('the two refusals the schema CANNOT express, and the one it never will', () => {
  /** The shipped water, plus whatever this row is about. */
  const withB = (b: Partial<EffectsPresetBoundary>, rest: Partial<EffectsPreset> = {}) => ({
    ...base, boundary: { ...SHIPPED_WATER, ...b }, ...rest,
  }) as Partial<EffectsPreset>;

  it('ANTI-VACUOUS: the schema really does ACCEPT both of these documents', () => {
    // This is the whole reason the advisories exist. If the schema refused
    // `{lo: 200, hi: 100}` there would be nothing for Aurora to warn about, and
    // every row below would be theatre.
    expect(validateAgainstSchema(withB({ lo: 200, hi: 100 }), S)).toEqual([]);
    expect(validateAgainstSchema(withB({ line: 10, lo: 100, hi: 200 }), S)).toEqual([]);
    // ...and the CODEC accepts them too, on both paths — the advisories are not
    // a refusal wearing a different name.
    for (const d of [withB({ lo: 200, hi: 100 }), withB({ line: 10, lo: 100, hi: 200 })]) {
      expect(() => parseEffectsPreset(JSON.stringify(d), ID)).not.toThrow();
      expect(() => serializeEffectsPreset(d as EffectsPreset)).not.toThrow();
    }
  });

  it('lo > hi earns an advisory that names the GENERATOR as the enforcer', () => {
    const a = boundaryAdvisories(withB({ lo: 200, hi: 100 }));
    const r = a.find((x) => x.rule === 'lo-hi');
    expect(r, 'an inverted band produced no advisory at all').toBeTruthy();
    expect(r!.advisory).toBe(true);
    expect(r!.text).toMatch(/EDITOR-SIDE WARNING, not the refusal/);
    expect(r!.text).toMatch(/effects_gen\.py/);
    expect(r!.text).toMatch(/Saving is not blocked/);
    // ...and a well-formed band earns none.
    expect(boundaryAdvisories(withB({})).map((x) => x.rule)).not.toContain('lo-hi');
  });

  it('line outside [lo, hi] earns an advisory, and the two do not talk over each other', () => {
    const a = boundaryAdvisories(withB({ line: 10, lo: 100, hi: 200 }));
    const r = a.find((x) => x.rule === 'line-in-band');
    expect(r, 'a default line outside the band produced no advisory').toBeTruthy();
    expect(r!.text).toMatch(/EDITOR-SIDE WARNING, not the refusal/);
    expect(r!.text).toMatch(/raster_dsl\.emp:475-476/);
    // Both ends of the band, so the predicate is not one-sided.
    expect(boundaryAdvisories(withB({ line: 210, lo: 100, hi: 200 })).map((x) => x.rule))
      .toContain('line-in-band');
    expect(boundaryAdvisories(withB({ line: 100, lo: 100, hi: 200 })).map((x) => x.rule))
      .not.toContain('line-in-band');
    expect(boundaryAdvisories(withB({ line: 200, lo: 100, hi: 200 })).map((x) => x.rule))
      .not.toContain('line-in-band');
    // ⚠ AN INVERTED BAND MAKES "inside [lo, hi]" MEANINGLESS, so only ONE
    // sentence is produced for it. Two sentences for one defect is noise, and
    // the second one would be arithmetically true and useless.
    const inverted = boundaryAdvisories(withB({ line: 150, lo: 200, hi: 100 })).map((x) => x.rule);
    expect(inverted).toContain('lo-hi');
    expect(inverted).not.toContain('line-in-band');
  });

  it('NOTHING here refuses: an advisory-only document still parses and saves', () => {
    // Stated as its own row because it is the load-bearing half of "advisory".
    const d = withB({ lo: 200, hi: 100 });
    expect(boundaryAdvisories(d).length).toBeGreaterThan(0);
    expect(() => parseEffectsPreset(JSON.stringify(d), ID)).not.toThrow();
    expect(() => serializeEffectsPreset(d as EffectsPreset)).not.toThrow();
  });

  it('every advisory carries `advisory: true` and an `enforced_by` that is not Aurora', () => {
    // Swept over every rule this module can produce, so a future one cannot
    // arrive as a bare sentence.
    const all = [
      ...boundaryAdvisories(withB({ lo: 200, hi: 100 })),
      ...boundaryAdvisories(withB({ line: 10, lo: 100, hi: 200 })),
      ...boundaryAdvisories(withB({}, {
        patch_world_ys: [1024], patch_motion: [{ sweep: { amp_shift: 2, period_shift: 3 } }],
      })),
      ...boundaryAdvisories(withB({})),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.advisory, `${a.rule} does not declare itself advisory`).toBe(true);
      expect(a.enforced_by.length).toBeGreaterThan(0);
      expect(a.enforced_by.toLowerCase(), `${a.rule} names Aurora as the enforcer`)
        .not.toMatch(/aurora/);
      // No sentence may promise anything about what the author will SEE — the
      // panel's standing wording rule, applied to a core-side string.
      expect(a.text).not.toMatch(/\bpreview\b/i);
      expect(a.text).not.toMatch(/\bas you (?:can )?see\b|\blooks like\b|\bwill look\b/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE SWEEP-FIT RULE — REUSED, NOT RE-DERIVED
// ═══════════════════════════════════════════════════════════════════════════
describe('the sweep-fits rule against the document\'s OWN lo/hi', () => {
  const withMotion = (lo: number, hi: number, amp_shift: number): Partial<EffectsPreset> => ({
    ...base,
    boundary: { ...SHIPPED_WATER, channel: 0, line: lo, lo, hi },
    patch_world_ys: [1024],
    patch_motion: [{ sweep: { amp_shift, period_shift: 3 } }],
  });

  it('the formula is channel-bands.ts\'s, applied to a document band — nothing is restated here', () => {
    // ANTI-VACUOUS AND THE POINT OF THE ROW: the travel this file compares
    // against is the SAME number `anchorTravelPx` produces from aeon's own
    // sentence, and the same number the preset schema's amplitude ladder states.
    // Those two are cross-checked at module load in channel-bands.ts; this pins
    // that the boundary path uses them rather than a third copy.
    for (const rung of ANCHOR_AMP_RUNGS) {
      expect(anchorTravelPx(rung.amp_shift)).toBe(rung.peak_to_peak_px);
    }
    // A band from the document behaves like a band from aeon's file: `lines` is
    // the INCLUSIVE count, so travel == lines is the widest that fits.
    const band = effectsChannelBandFromDocument(0, 100, 109, 'row');
    expect(band!.lines).toBe(10);
    expect(anchorFitAgainstBand(band!, 10).verdict).toBe('cannot-tell');
    expect(anchorFitAgainstBand(band!, 11).verdict).toBe('cannot-fit');
    // ⚠ AND THERE IS NO `fits` VERDICT, at the type level and at run time.
    expect(anchorFitAgainstBand(band!, 1).verdict).not.toBe('fits');
  });

  it('a sweep wider than the authored band earns the advisory; one that fits earns SILENCE', () => {
    // The widest rung on the ladder, against a band far too small for it.
    const widest = ANCHOR_AMP_RUNGS.reduce((a, b) => (a.peak_to_peak_px > b.peak_to_peak_px ? a : b));
    const narrowest = ANCHOR_AMP_RUNGS.reduce((a, b) => (a.peak_to_peak_px < b.peak_to_peak_px ? a : b));
    // A band ONE LINE narrower than the widest rung's travel — the boundary
    // case, not a comfortable one, because a rule off by one passes on a
    // comfortable case in both directions.
    const lo = 10;
    const tooSmall = withMotion(lo, lo + widest.peak_to_peak_px - 2, widest.amp_shift);
    const exact = withMotion(lo, lo + widest.peak_to_peak_px - 1, widest.amp_shift);
    const a = boundaryAdvisories(tooSmall).find((x) => x.rule === 'sweep-travel');
    expect(a, `a ${widest.peak_to_peak_px}px sweep in a ${widest.peak_to_peak_px - 1}-line band `
      + 'produced no advisory').toBeTruthy();
    expect(a!.text).toContain(`${widest.peak_to_peak_px} screen lines peak-to-peak`);
    expect(a!.text).toMatch(/EDITOR-SIDE WARNING, not the refusal/);
    // travel == lines is the widest that FITS — and "fits" is spelled by
    // SILENCE here, never by a clearance sentence.
    expect(boundaryAdvisories(exact).map((x) => x.rule)).not.toContain('sweep-travel');
    // ...and the narrowest rung in the same band is silent too, so the row is
    // not passing because the advisory never fires.
    expect(boundaryAdvisories(withMotion(lo, lo + widest.peak_to_peak_px - 2, narrowest.amp_shift))
      .map((x) => x.rule)).not.toContain('sweep-travel');
  });

  it('a boundary with no motion at its index earns NO sweep verdict, and says so differently', () => {
    const still = { ...base, boundary: { ...SHIPPED_WATER, channel: 0 } } as Partial<EffectsPreset>;
    const rules = boundaryAdvisories(still).map((x) => x.rule);
    expect(rules).not.toContain('sweep-travel');
    expect(rules).toContain('no-motion');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A BOUNDARY MOVES ONLY IF THE SAME INDEX IS SEEDED **AND** SWEPT
// ═══════════════════════════════════════════════════════════════════════════
describe('the pairing rule — legal, buildable, and still', () => {
  const at = (channel: number, extra: Partial<EffectsPreset> = {}) => ({
    ...base, boundary: { ...SHIPPED_WATER, channel }, ...extra,
  }) as Partial<EffectsPreset>;

  it('boundary alone is ACCEPTED — and earns the sentence, because nothing refuses it', () => {
    const doc = at(0);
    expect(validateAgainstSchema(doc, S)).toEqual([]);
    expect(() => parseEffectsPreset(JSON.stringify(doc), ID)).not.toThrow();
    const a = boundaryAdvisories(doc).find((x) => x.rule === 'no-motion');
    expect(a).toBeTruthy();
    expect(a!.enforced_by).toMatch(/nothing/);
    expect(a!.text).toMatch(/LEGAL and it BUILDS/);
    expect(a!.text).toContain('patch_world_ys[0]');
    expect(a!.text).toContain('patch_motion[0]');
  });

  it('SEEDED but not SWEPT is still still — and only the missing half is named', () => {
    const a = boundaryAdvisories(at(0, { patch_world_ys: [1024] }))
      .find((x) => x.rule === 'no-motion');
    expect(a, 'a seeded-but-unswept boundary produced no advisory — a stationary anchor reads as '
      + 'motion').toBeTruthy();
    expect(a!.text).toContain('patch_motion[0]');
    expect(a!.text, 'the sentence names the key that IS authored').not.toContain('patch_world_ys[0]');
  });

  it('SWEPT but not SEEDED is named too — the other half of the same rule', () => {
    const a = boundaryAdvisories(at(0, { patch_motion: [{ sweep: { amp_shift: 4, period_shift: 3 } }] }))
      .find((x) => x.rule === 'no-motion');
    expect(a).toBeTruthy();
    expect(a!.text).toContain('patch_world_ys[0]');
    expect(a!.text).not.toContain('patch_motion[0]');
  });

  it('BOTH at the boundary\'s own index earns silence; both at ANOTHER index does not', () => {
    const both = at(0, {
      patch_world_ys: [1024], patch_motion: [{ sweep: { amp_shift: 4, period_shift: 3 } }],
    });
    expect(boundaryAdvisories(both).map((x) => x.rule)).not.toContain('no-motion');
    // ⚠ THE INDEX IS THE WHOLE RULE. The same two keys, authored at index 1
    // while the boundary follows channel 0, leave the boundary just as still —
    // and a check that only asked "does this document have patch_motion?" would
    // go quiet here. `null` at the index is the same "not authored" as a short
    // array, and both are exercised.
    const wrongIndex = at(0, {
      patch_world_ys: [null, 1024], patch_motion: [null, { sweep: { amp_shift: 4, period_shift: 3 } }],
    });
    expect(boundaryAdvisories(wrongIndex).map((x) => x.rule)).toContain('no-motion');
    const shortArrays = at(1, {
      patch_world_ys: [1024], patch_motion: [{ sweep: { amp_shift: 4, period_shift: 3 } }],
    });
    expect(boundaryAdvisories(shortArrays).map((x) => x.rule)).toContain('no-motion');
  });

  it('a document with no boundary at all earns nothing from this module', () => {
    expect(boundaryAdvisories({ ...base, bands: [] })).toEqual([]);
    expect(boundaryAdvisories({ ...base })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WHAT THE PANEL DOES WITH A DOCUMENT IT CANNOT AUTHOR
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THIS PARCEL BUILDS NO AUTHORING UI FOR `boundary`, DELIBERATELY — that is a
// separate parcel. What it must not do is leave the panel's EXISTING controls
// silently wrong on a document that can now exist. Three of them were, the
// moment the fourth arm was vendored, and each was wrong in the same direction:
// `presetRasterChannel` answers null for a boundary document, and null used to
// mean "this preset carries nothing, write what you like".
describe('the panel on a boundary document: refusals, not silence', () => {
  const doc = { ...base, boundary: SHIPPED_WATER } as unknown as EffectsPreset;
  const library = { presets: [doc], unreadable: [] as never[] };

  it('the band controls are REFUSED with a reason, not woken up', () => {
    const why = bandControlsRefusal(doc);
    expect(
      why,
      'the band controls are live on a boundary document. Clicking one grows a `bands` key onto '
      + 'a preset that already carries a program, which is the two-arm document the schema '
      + 'refuses — authored on every click, with no sentence anywhere.',
    ).not.toBeNull();
    expect(why!).not.toContain('undefined');
    expect(why!).toMatch(/EXACTLY ONE program/);
    // ...and the WAY OUT it offers is the honest one: the Raster row cannot
    // convert a patched program, so it must not be offered as the fix.
    expect(why!).toMatch(/not a raster program at all/);
    expect(why!).not.toMatch(/Set the Raster program row above back to bands/);
    // And the command really is a no-op, so the sentence is not describing a
    // refusal that does not happen.
    expect(addBandCommand(library as never, ID)).toBeNull();
  });

  it('the panel SAYS it has no editor for this document', () => {
    const gap = rasterEditorGap(doc);
    expect(
      gap,
      'a boundary document opens with no editor and nothing on screen saying so — the exact dead '
      + 'surface rasterEditorGapFor exists to prevent, arriving as a null channel rather than as '
      + 'an unknown channel name',
    ).not.toBeNull();
    expect(gap!).toContain('patchable palette boundary');
    expect(gap!).not.toContain('undefined');
    // The control: a document the panel CAN edit gets no gap sentence.
    expect(rasterEditorGap({ ...base, bands: [] } as unknown as EffectsPreset)).toBeNull();
  });

  it('the library row names the program instead of reading "0 bands"', () => {
    const [entry] = presetListEntries(library as never);
    expect(entry.channel).toBe('boundary');
    expect(presetListSummary(entry)).toBe('patchable palette boundary');
    expect(presetListSummary(entry)).not.toContain('band');
  });

  it('switching the Raster row DELETES the boundary — it does not leave a two-arm document', () => {
    // The Raster row does not OFFER boundary (seeding one is the follow-on
    // parcel), so this is the one direction that can be driven today.
    expect(RASTER_CHANNEL_OPTIONS.map((o) => o.value)).not.toContain('boundary');
    const cmd = setRasterChannelCommand(library as never, ID, 'bands');
    expect(cmd).not.toBeNull();
    const after = cmd!.newPreset!;
    expect(
      (after as unknown as Record<string, unknown>).boundary,
      'switching a boundary document to bands LEFT the boundary in place, authoring the two-arm '
      + 'document the top-level oneOf refuses — the delete loop is running over the raster list '
      + 'instead of over the arms',
    ).toBeUndefined();
    expect(presetProgramArm(after)).toBe('bands');
    // ...and the result is a document the codec accepts, which is the only
    // check that cannot be fooled by the key set looking right.
    expect(() => serializeEffectsPreset(after)).not.toThrow();
  });

  it('the swap advisory names what would be DISCARDED, not "0 bands"', () => {
    const s = rasterChannelSwapAdvisory(doc);
    expect(s).toContain('patchable palette boundary');
    expect(s).not.toMatch(/0 raster bands/);
  });
});
