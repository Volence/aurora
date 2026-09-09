// GUARD-SEAT-RESIDUE, preset.ts: the plants the suite did not catch.
//
// Mutations were applied to `src/core/formats/effects/preset.ts` one at a time,
// each scored against the WHOLE `npm test`, with the verdict taken from
// vitest's own `Test Files` line and never from the aggregate exit code. The
// packet is `docs/reviews/2026-09-09-guard-residue-preset.md`.
//
// This file closes the survivors of the RUNTIME half (the predicates a document
// or a control reaches) and changes no source line. The MODULE-LOAD half lives
// in `effects-preset-guard-residue-schema.test.ts`, because closing one of
// those needs a poisoned schema and a re-import, which is a different harness.
//
// Rows whose plant is marked NOT DISCRIMINATING assert the PRECONDITION that
// makes it so, and are written to go red the day that precondition ends. A
// mutation nothing can observe is not evidence about the suite, so it is out of
// the denominator rather than counted as a survivor.

import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../src/core/project/adapter';
import {
  presetFp16FromNumber,
  anchorSnapCycleSeconds,
  ANCHOR_PERIOD_RUNGS,
  isBaseSwapTargetAligned,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE,
  baseSwapInsideRows,
  baseSwapFires,
  presetProgramArm,
  presetOnArms,
  presetArmIssue,
  presetIdFromFileName,
  parseEffectsPreset,
  EffectsPresetError,
  loadEffectsPresetLibrary,
  effectsPresetDir,
  EFFECTS_PRESET_SCHEMA,
  EFFECTS_PRESET_RESERVED_KEYS,
  EFFECTS_PRESET_PROGRAM_ARMS,
  type EffectsPreset,
  type EffectsPresetBaseSwapBand,
} from '../../src/core/formats/effects/preset';

const MINIMAL_DOC = {
  bands: [{ bot: 128, on: { cram: { addr: 74, colours: [14] } }, sh: false, top: 112 }],
  id: 'minimal',
  schema: 1,
};

/** MINIMAL's document with `mutate` applied, serialized the way a file holds it. */
function withDoc(mutate: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(JSON.stringify(MINIMAL_DOC)) as Record<string, unknown>;
  mutate(doc);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** A minimal, VALID document under a chosen id. */
function docWithId(id: string): string {
  return withDoc((d) => { d.id = id; });
}

/** In-memory FileAccess. `list` answers in INSERTION order, never sorted. */
function memFs(files: Record<string, string>): FileAccess {
  return {
    async exists(rel) {
      if (rel.endsWith('/')) return Object.keys(files).some((k) => k.startsWith(rel));
      return rel in files;
    },
    async read(rel) {
      const text = files[rel];
      if (text === undefined) throw new Error(`ENOENT ${rel}`);
      return new TextEncoder().encode(text);
    },
    async list(relDir) {
      return Object.keys(files)
        .filter((k) => k.startsWith(relDir) && !k.slice(relDir.length).includes('/'))
        .map((k) => k.slice(relDir.length));
    },
  };
}

const ROOT = 'games/sonic4/data/';
const DIR = effectsPresetDir(ROOT);

// ═══════════════════════════════════════════════════════════════════════════
// fp16, the anchor ladders, and the granule
// ═══════════════════════════════════════════════════════════════════════════

describe('presetFp16FromNumber: the arms that had nothing holding them', () => {
  it('PLANT PR03, NOT DISCRIMINATING: the finiteness arm is defence in depth', () => {
    // Narrowing `!Number.isFinite(px)` to `Number.isNaN(px)` survived the whole
    // suite, and it cannot be caught: a non-finite px multiplies to a
    // non-finite `units`, and the exactness arm one line later refuses that.
    // The PRECONDITION, asserted rather than argued, is this property of
    // Number.isInteger. If a future edit moves the exactness arm below the
    // sign work, or drops it, this row is what says the finiteness arm has
    // stopped being redundant and needs its own case.
    expect(Number.isInteger(Infinity)).toBe(false);
    expect(Number.isInteger(-Infinity)).toBe(false);
    expect(Number.isInteger(NaN)).toBe(false);
    expect(presetFp16FromNumber(Infinity)).toBeNull();
    expect(presetFp16FromNumber(-Infinity)).toBeNull();
    expect(presetFp16FromNumber(NaN)).toBeNull();
  });
});

describe('anchorSnapCycleSeconds snaps in the LOG domain, where the ladder is uniform', () => {
  it('PLANT PR11: a request above the GEOMETRIC midpoint goes UP, not down', () => {
    // The amplitude snapper's twin row exists; this one did not, so switching
    // the period snapper to a linear nearest survived the whole suite. The
    // discriminating point is derived from the ladder rather than typed: any
    // request between the geometric and the arithmetic midpoint of two
    // adjacent rungs is answered differently by the two rules.
    const [lo, hi] = [ANCHOR_PERIOD_RUNGS[0], ANCHOR_PERIOD_RUNGS[1]];
    const geometric = Math.sqrt(lo.seconds * hi.seconds);
    const arithmetic = (lo.seconds + hi.seconds) / 2;
    expect(
      geometric,
      'the two midpoints coincide, so there is no request that tells a log snap from a linear '
      + 'one and this row is proving nothing',
    ).toBeLessThan(arithmetic);

    const between = (geometric + arithmetic) / 2;
    expect(anchorSnapCycleSeconds(between).period_shift).toBe(hi.period_shift);
    // And the other side of the log midpoint still goes down, so the row is not
    // just asserting that everything rounds up.
    const below = (lo.seconds + geometric) / 2;
    expect(anchorSnapCycleSeconds(below).period_shift).toBe(lo.period_shift);
  });
});

describe('isBaseSwapTargetAligned', () => {
  it('PLANT PR13, NOT DISCRIMINATING: the granule test already implies integrality', () => {
    // Dropping `Number.isInteger(target)` survived, and no input can catch it:
    // `x % g` keeps x's fractional part, so `x % g === 0` is already false for
    // every non-integer, and NaN and the infinities fail it too. The
    // PRECONDITION is that the granule is an integer greater than one; a
    // fractional granule would make the integer arm load-bearing again.
    const g = EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE;
    expect(Number.isInteger(g)).toBe(true);
    expect(g).toBeGreaterThan(1);
    for (const x of [0.5, g + 0.5, g / 2 + 0.25, Infinity, NaN]) {
      expect(x % g === 0, `${x} % ${g} is zero, so the granule test admits a non-integer`)
        .toBe(false);
      expect(isBaseSwapTargetAligned(x)).toBe(false);
    }
    // The bound the granule cannot answer for, kept beside it: the first
    // multiple ABOVE the range is on the granule and must still be refused.
    const past = EFFECTS_PRESET_BASE_SWAP_TARGET_RANGE.max + 1;
    expect(past % g).toBe(0);
    expect(isBaseSwapTargetAligned(past)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// base_swap: the rows a band swaps, and the fires it emits
// ═══════════════════════════════════════════════════════════════════════════

describe('baseSwapInsideRows at the edge nobody probed', () => {
  function band(line: number, restore_line?: number): EffectsPresetBaseSwapBand {
    const b: Record<string, unknown> = { plane: 'PlaneA', line, target: 0 };
    if (restore_line !== undefined) b.restore_line = restore_line;
    return b as unknown as EffectsPresetBaseSwapBand;
  }

  it('PLANT PR17: EXACTLY ONE fully swapped row is not empty', () => {
    // `empty: last < first` widened to `last <= first` survived: the existing
    // rows probe a band with no swapped row and bands with many, never the
    // single-row band where the two spellings disagree. A band told it swaps
    // nothing when it swaps one row is a control that hides a real effect.
    const one = baseSwapInsideRows(band(10, 12));
    expect(one.first).toBe(11);
    expect(one.last).toBe(11);
    expect(one.empty).toBe(false);

    // The neighbour on each side, so the boundary is pinned from both directions.
    expect(baseSwapInsideRows(band(10, 11)).empty).toBe(true);
    expect(baseSwapInsideRows(band(10, 13)).empty).toBe(false);
  });

  it('PLANT PR21, NOT DISCRIMINATING: a null restore_line cannot reach baseSwapFires', () => {
    // `!== undefined` relaxed to `!= null` survived, and no document can tell
    // them apart: the schema types restore_line as an integer, so a null one is
    // refused at parse and never reaches this function. The PRECONDITION is
    // that refusal.
    expect(() => parseEffectsPreset(JSON.stringify({
      base_swap: [{ line: 10, plane: 'PlaneA', restore_line: null, target: 0 }],
      id: 'nullrestore',
      schema: 1,
    }, null, 2), 'nullrestore')).toThrow(EffectsPresetError);

    // And the ABSENT case, which is the one the guard is actually for.
    expect(baseSwapFires([band(10)])).toEqual([{ line: 10, band: 0, kind: 'on' }]);
    expect(baseSwapFires([band(10, 20)]).map((f) => f.kind)).toEqual(['on', 'off']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Which program is in this document
// ═══════════════════════════════════════════════════════════════════════════

describe('presetProgramArm reports what the document HAS, including the illegal state', () => {
  it('PLANT PR26: a TWO-ARM document names an arm rather than answering null', () => {
    // Narrowing the report to `carried.length === 1` survived the whole suite.
    // Its own docblock says why that matters: a caller reading null as "this
    // document is empty, anything may be written here" authors the two-arm
    // document the schema refuses, which is what bandControlsRefusal did until
    // the boundary arm landed. Null must mean NO program, and nothing else.
    const twoArm = { bands: [], ramp: { lines: 1, start: 0, step: 1, target: { vsram: { addr: 0 } }, top: 3 } };
    const arm = presetProgramArm(twoArm as unknown as Partial<EffectsPreset>);
    expect(arm, 'a document carrying two exclusive arms reported NO program').not.toBeNull();
    expect(EFFECTS_PRESET_PROGRAM_ARMS).toContain(arm as string);
    expect(presetProgramArm({} as Partial<EffectsPreset>)).toBeNull();
  });

  it('PLANT PR27: a key written as undefined is ABSENT, not carried', () => {
    // Rewriting the presence test as `a in preset` survived. The repo's own
    // writer convention is to `delete` rather than assign undefined, so nothing
    // produces the distinguishing object today; but the arm identity decides
    // which editor opens, and reading an erased key as a carried program opens
    // the wrong one.
    const erased = {
      bands: undefined,
      ramp: { lines: 1, start: 0, step: 1, target: { vsram: { addr: 0 } }, top: 3 },
    };
    expect(presetProgramArm(erased as unknown as Partial<EffectsPreset>)).toBe('ramp');
  });
});

describe('presetOnArms refuses an ARRAY, so index keys are never read as arms', () => {
  it('PLANT PR29: an array `on` declares no arm at all', () => {
    // Dropping `Array.isArray(on)` survived. Without it the arms of
    // `on: [{cram: ...}]` are its INDICES, so the author is told that "0" is
    // not an ON arm instead of that a band needs an object with one arm.
    expect(presetOnArms([{ cram: { addr: 74, colours: [14] } }])).toEqual([]);
    expect(presetOnArms([])).toEqual([]);
    const sentence = presetArmIssue([{ cram: { addr: 74, colours: [14] } }]);
    expect(sentence).toMatch(/declares no arm/);
    expect(sentence, 'the array index was reported to the author as an ON arm name')
      .not.toMatch(/"0"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The filename is the id, and the extension test is the whole of it
// ═══════════════════════════════════════════════════════════════════════════

describe('presetIdFromFileName claims a file only by its LAST extension', () => {
  it('PLANT PR32: a name that merely CONTAINS .json is not a preset', () => {
    // `endsWith` loosened to `includes` survived, and the consequence is not
    // cosmetic: the loader calls this to decide what to open, so a backup or an
    // editor swap file beside the library would be parsed as a preset and its
    // id taken from a truncated stem.
    expect(presetIdFromFileName('notes.json.txt')).toBeNull();
    expect(presetIdFromFileName('minimal.json.bak')).toBeNull();
    expect(presetIdFromFileName('minimal.json')).toBe('minimal');
  });

  it('PLANT PR33, NOT DISCRIMINATING: the stem drops the LAST extension only', () => {
    // Rewriting the slice as an ANCHORED replace cannot differ, because the
    // guard above has already proved the suffix. This row pins the property
    // both spellings have and an unanchored replace does not.
    expect(presetIdFromFileName('a.json.json')).toBe('a.json');
    expect(presetIdFromFileName('.json')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The reserved wave-2 vocabulary, and where the search for it reaches
// ═══════════════════════════════════════════════════════════════════════════

describe('a RESERVED name is found wherever it is written, not only at the root', () => {
  const reserved = EFFECTS_PRESET_RESERVED_KEYS[0];

  it('the population this describe block quantifies over is not empty', () => {
    expect(EFFECTS_PRESET_RESERVED_KEYS.length).toBeGreaterThan(0);
    expect(typeof reserved).toBe('string');
  });

  it('PLANTS PR35 and PR39: nested in an OBJECT under the root', () => {
    // Both the recursion in everyKey and the root-only rewrite of the filter
    // survived. Every existing row writes the reserved name at the root, so
    // nothing said the search descends at all, and a document that put it a
    // level down would be refused only as an unknown property.
    const text = JSON.stringify({
      id: 'nested',
      ramp: {
        lines: 1, start: 0, step: 1, target: { vsram: { addr: 0 } }, top: 3, [reserved]: 1,
      },
      schema: 1,
    }, null, 2);
    expect(() => parseEffectsPreset(text, 'nested')).toThrow(/RESERVED wave-2/);
  });

  it('PLANT PR36: nested inside an ARRAY member', () => {
    // Dropping the array descent survived, and `bands` is an array, so this is
    // the position an author is most likely to write the name in.
    const text = withDoc((d) => {
      (d.bands as Record<string, unknown>[])[0][reserved] = 1;
    });
    expect(() => parseEffectsPreset(text, 'minimal')).toThrow(/RESERVED wave-2/);
  });

  it('PLANT PR40, NOT DISCRIMINATING: the plural arm has no document that reaches it', () => {
    // Forcing the sentence to the singular survived because the reserved list
    // has exactly ONE member today, so no document can carry two of them. The
    // PRECONDITION is that count. When the contract reserves a second name this
    // row goes red, and the plural arm needs a document carrying both.
    expect(
      EFFECTS_PRESET_RESERVED_KEYS.length,
      'the reserved list has grown, so a document CAN now carry two reserved names and the '
      + 'plural arm of the refusal sentence is reachable and untested',
    ).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseEffectsPreset: the version gate and the identity gate
// ═══════════════════════════════════════════════════════════════════════════

describe('the version gate compares the VALUE, not a coercion of it', () => {
  it('PLANT PR37: "1" as a STRING gets the wave-2 sentence, not a type complaint', () => {
    // Comparing `Number(obj.schema) !== 1` survived: the schema's `const` still
    // refuses the string, so the document is refused either way. But the two
    // refusals say different things, and the one this gate exists to say is the
    // one about there being no migration machinery to ask for.
    const text = withDoc((d) => { d.schema = '1'; });
    expect(() => parseEffectsPreset(text, 'minimal'))
      .toThrow(/wave 2 refuses|not a file\s+the reader upgrades|contract change to both halves/);
  });

  it('PLANT PR38, NOT DISCRIMINATING: the id is a validated string by the time it is compared', () => {
    // Comparing through String() cannot differ: `id` is REQUIRED at the root
    // and typed `string`, and the identity check runs after validation. The
    // PRECONDITION is those two schema facts.
    const root = EFFECTS_PRESET_SCHEMA as unknown as {
      required: string[]; properties: Record<string, { type?: string }>;
    };
    expect(root.required).toContain('id');
    expect(root.properties.id.type).toBe('string');
  });

  it('PLANT PR43, NOT DISCRIMINATING: a band cannot carry an `on` that is undefined', () => {
    // `'on' in band` rewritten as an undefined test survived, and JSON cannot
    // express the difference: a key is either absent or has a JSON value, and
    // `null` answers both spellings the same way. The PRECONDITION is that this
    // path is fed by JSON.parse.
    expect(() => JSON.parse('{"on": undefined}')).toThrow();
    const text = withDoc((d) => { (d.bands as Record<string, unknown>[])[0].on = null; });
    expect(() => parseEffectsPreset(text, 'minimal')).toThrow(EffectsPresetError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The library loader
// ═══════════════════════════════════════════════════════════════════════════

describe('the preset library, at the two places the plants got through', () => {
  it('PLANT PR48: the presets come back SORTED even when the listing does not', async () => {
    // Dropping the `.sort()` survived because every existing fixture happens to
    // be listed in order. The order is what a panel shows an author, and a
    // directory listing is not contracted to be sorted anywhere.
    const lib = await loadEffectsPresetLibrary(memFs({
      [`${DIR}zeta.json`]: docWithId('zeta'),
      [`${DIR}alpha.json`]: docWithId('alpha'),
      [`${DIR}mid.json`]: docWithId('mid'),
    }), ROOT);
    expect(lib.presets.map((p) => p.id)).toEqual(['alpha', 'mid', 'zeta']);
    expect(lib.loadedPaths).toEqual([
      `${DIR}alpha.json`, `${DIR}mid.json`, `${DIR}zeta.json`,
    ]);
  });

  it('PLANT PR49: an UNREADABLE path is never recorded as loaded', async () => {
    // Adding the failed path to `loadedPaths` survived the whole suite, and it
    // is the one survivor here that could destroy an author's file:
    // `loadedPaths` is documented as THE ONLY PATHS A SAVE IS ALLOWED TO
    // REMOVE, and a file that would not parse is exactly the one a save must
    // not touch. Nothing asserted the negative.
    const lib = await loadEffectsPresetLibrary(memFs({
      [`${DIR}minimal.json`]: docWithId('minimal'),
      [`${DIR}broken.json`]: '{ not json',
    }), ROOT);
    expect(lib.presets.map((p) => p.id)).toEqual(['minimal']);
    expect(lib.unreadable.map((u) => u.path)).toEqual([`${DIR}broken.json`]);
    expect(
      lib.loadedPaths,
      'an unreadable file was recorded as loaded, so a save is now permitted to delete it',
    ).toEqual([`${DIR}minimal.json`]);
  });
});
