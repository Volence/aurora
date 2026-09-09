// GUARD-SEAT-RESIDUE, preset.ts: the MODULE-LOAD half.
//
// `preset.ts` derives about forty constants from the vendored preset schema,
// and every one of those derivations carries a guard whose whole job is to
// refuse LOUDLY when the contract's shape or wording moves, rather than yield a
// plausible-looking wrong value. Thirty mutations were applied to those guards,
// one at a time, each scored against the WHOLE `npm test`. Twenty-seven of the
// twenty-eight that could be scored SURVIVED.
//
// That is not a surprise and it is the finding: a guard against a FUTURE
// amendment is exercised by no committed document, so the suite it lives in has
// nothing to say about it. The instrument that can say something is a POISONED
// SCHEMA plus a re-import, which is what this file is. The harness is the one
// `effects-preset-boundary.test.ts` already owns; this file generalises it.
//
// EVERY ROW ASSERTS THE GUARD'S OWN SENTENCE, not merely that something threw.
// Most of these poisons make the module throw either way, from a DIFFERENT
// derivation a few lines further down, and a row that only asked for a
// rejection would be green while the guard it names was gone.
//
// The packet is `docs/reviews/2026-09-09-guard-residue-preset.md`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  EFFECTS_PRESET_SCHEMA,
  EFFECTS_PRESET_PROGRAM_ARMS,
  EFFECTS_PRESET_RASTER_CHANNELS,
  EFFECTS_PRESET_PATCHED_ARMS,
} from '../../src/core/formats/effects/preset';

const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.json',
);
const PRESET_MODULE = resolve(__dirname, '../../src/core/formats/effects/preset');

type Node = Record<string, unknown>;
type Schema = {
  description?: string;
  oneOf?: unknown[];
  required?: string[];
  properties: Record<string, Node>;
  $defs: Record<string, Node>;
};

/** A fresh, mutable copy of the vendored schema, read from disk on every call. */
function fresh(): Schema {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Schema;
}

/** Import `preset.ts` against a schema `mutate` has poisoned. */
async function importPoisoned(mutate: (s: Schema) => void): Promise<unknown> {
  const s = fresh();
  mutate(s);
  vi.resetModules();
  vi.doMock(SCHEMA_PATH, () => ({ default: s }));
  return import(PRESET_MODULE);
}

/**
 * The poisoned module must refuse, AND its refusal must be the sentence this
 * guard owns. `rejects.toThrow()` alone would pass for a throw from any of the
 * forty derivations downstream.
 */
async function refuses(mutate: (s: Schema) => void, sentence: RegExp): Promise<void> {
  await expect(importPoisoned(mutate)).rejects.toThrow(sentence);
}

/** Replace a substring in a description, asserting it was there to replace. */
function reword(node: Node, was: string | RegExp, becomes: string): void {
  const before = String(node.description ?? '');
  expect(before, `the sentence this poison edits is not in the vendored schema: ${was}`)
    .toMatch(was);
  node.description = before.replace(was, becomes);
  expect(String(node.description)).not.toBe(before);
}

afterEach(() => {
  vi.doUnmock(SCHEMA_PATH);
  vi.resetModules();
});

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTROL. Without it every row below could be green for a harness reason.
// ═══════════════════════════════════════════════════════════════════════════

describe('the poison harness', () => {
  it('CONTROL: the UNPOISONED schema loads through the same path', async () => {
    const clean = await importPoisoned(() => { /* no mutation at all */ }) as {
      EFFECTS_PRESET_PROGRAM_ARMS: readonly string[];
    };
    expect(clean.EFFECTS_PRESET_PROGRAM_ARMS).toEqual(EFFECTS_PRESET_PROGRAM_ARMS);
  });

  it('CONTROL: the stub really replaces the schema the module reads', async () => {
    // If `doMock` silently missed, every `refuses` row below would be asking
    // the REAL schema to fail and would be red rather than falsely green, so
    // this is belt and braces. It is here because a poison that does not take
    // is the one failure mode this whole file cannot survive.
    const armed = await importPoisoned((s) => {
      s.$defs.band.description = 'poisoned marker, not the vendored text';
    }) as { EFFECTS_PRESET_SCHEMA: { $defs: Record<string, Node> } };
    expect(armed.EFFECTS_PRESET_SCHEMA.$defs.band.description)
      .toBe('poisoned marker, not the vendored text');
    expect((EFFECTS_PRESET_SCHEMA as unknown as Schema).$defs.band.description)
      .not.toBe('poisoned marker, not the vendored text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The two readers every other derivation is built on
// ═══════════════════════════════════════════════════════════════════════════

describe('schemaNode and schemaNumberFromProse', () => {
  it('PLANT MP01: a node that is not an OBJECT is refused, not read through', async () => {
    await refuses(
      (s) => { (s.properties as Record<string, unknown>).id = 'no longer an object'; },
      /schema is missing properties\.id/,
    );
  });

  it('PLANT MP03: a sentence that stops matching THROWS, it does not default', async () => {
    // Replacing the throw with a silent 0 survived the whole suite. A zero
    // amplitude base makes every rung of the ladder zero, which is a plausible
    // looking array of seven objects and no error anywhere.
    await refuses(
      (s) => reword(
        (s.$defs.anchor_sweep.properties as Record<string, Node>).amp_shift,
        /peak excursion \d+ >> amp_shift px/,
        'peak excursion is whatever the engine says',
      ),
      /no longer states the amplitude base/,
    );
  });

  it('PLANT MP04: a unit sentence with a ZERO denominator is refused', async () => {
    await refuses(
      (s) => reword(s.properties.patch_world_ys, /NEITHER SIDE CONVERTS, 1:1\./, 'NEITHER SIDE CONVERTS, 1:0.'),
      /zero denominator/,
    );
  });

  it('PLANT MP05, NOT DISCRIMINATING: the unit pattern ends at a full stop', () => {
    // Dropping the trailing `\.` from the matcher cannot change the parse,
    // because the ratio is followed by a full stop and nothing else could
    // extend the digit runs. The PRECONDITION is that wording.
    expect(String((EFFECTS_PRESET_SCHEMA as unknown as Schema).properties.patch_world_ys.description))
      .toMatch(/NEITHER SIDE CONVERTS, 1:1\./);
  });

  it('PLANT MP06: an INVERTED minimum..maximum is refused', async () => {
    await refuses(
      (s) => {
        const node = (s.$defs.anchor_sweep.properties as Record<string, Node>).amp_shift;
        expect(Number.isInteger(node.minimum)).toBe(true);
        node.maximum = (node.minimum as number) - 1;
      },
      /does not declare an integer minimum\.\.maximum/,
    );
  });

  it('PLANT MP07: a range node missing its MAXIMUM is refused', async () => {
    // The mutation this row exists for (requiring only the minimum to be
    // numeric) does not COMPILE: `schemaRange` returns `{min: number; max:
    // number}` and dropping half the narrowing leaves `max` as `unknown`, so
    // tsc refuses it and the run never reached vitest. The guard is held by the
    // compiler; this row holds its RUNTIME half, which the compiler cannot.
    await refuses(
      (s) => {
        const node = (s.$defs.ramp.properties as Record<string, Node>).top;
        expect(typeof node.maximum).toBe('number');
        delete node.maximum;
      },
      /no longer bounds .*ramp\.properties\.top with both a numeric/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The exclusive arms, and the raster / patched split
// ═══════════════════════════════════════════════════════════════════════════

describe('the top-level oneOf, read as the exclusivity rule', () => {
  it('PLANT MP08: an EMPTY oneOf is refused where it is read, not two guards later', async () => {
    await refuses((s) => { s.oneOf = []; }, /no longer carries a top-level oneOf/);
  });

  it('PLANT MP09: a branch requiring TWO keys is refused, not read for its first', async () => {
    await refuses(
      (s) => { (s.oneOf as Node[])[0] = { required: ['bands', 'ramp'] }; },
      /is not the single-`required` shape/,
    );
  });

  it('PLANT MP11: an arm with no property node is refused', async () => {
    await refuses(
      (s) => { (s.oneOf as Node[]).push({ required: ['not_a_declared_key'] }); },
      /which its `properties` does not declare/,
    );
  });

  it('PLANT MP12, NOT DISCRIMINATING: the partition holds BY CONSTRUCTION today', () => {
    // The interlock compares `raster ++ patched` against `arms`. Both lists are
    // derived from ONE filter over `arms`, so their union is always exactly
    // `arms` and no schema can make the comparison fire. It is defence against
    // a refactor that computes the two independently, and it is right to keep.
    // This row states the property the interlock claims, so that a refactor
    // which breaks it is caught by something that CAN fire.
    expect([...EFFECTS_PRESET_RASTER_CHANNELS, ...EFFECTS_PRESET_PATCHED_ARMS].sort())
      .toEqual([...EFFECTS_PRESET_PROGRAM_ARMS].sort());
    expect(EFFECTS_PRESET_RASTER_CHANNELS.length).toBeGreaterThan(0);
    expect(EFFECTS_PRESET_PATCHED_ARMS.length).toBeGreaterThan(0);
  });

  it('PLANT MP13: a schema where EVERY arm is patched is refused', async () => {
    await refuses(
      (s) => {
        const sentence = 'lowers into EffectsPreset.ep_patched';
        let touched = 0;
        for (const arm of (s.oneOf as { required: string[] }[]).map((b) => b.required[0])) {
          const node = s.properties[arm];
          if (!String(node.description ?? '').includes(sentence)) {
            node.description = `${String(node.description ?? '')} It ${sentence}.`;
            touched += 1;
          }
        }
        expect(touched, 'no arm needed the patched sentence added, so this poison changed nothing')
          .toBeGreaterThan(0);
      },
      /there is no raster channel left/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The ramp's two display sentences, and its target arms
// ═══════════════════════════════════════════════════════════════════════════

describe('the ramp display geometry is TWO numbers that must agree', () => {
  it('PLANT MP14: a per-index lag of ZERO is refused, being the same as no lag', async () => {
    await refuses(
      (s) => reword(
        s.properties.ramp,
        /displays on screen line top \+ j \+ 1/,
        'displays on screen line top + j + 0',
      ),
      /not a positive whole number of scanlines/,
    );
  });

  it('PLANT MP15: the two sentences must agree EXACTLY, not merely not shrink', async () => {
    await refuses(
      (s) => reword(
        (s.$defs.ramp.properties as Record<string, Node>).top,
        /DISPLAYS on top \+ 2/,
        'DISPLAYS on top + 3',
      ),
      /two ramp display sentences no longer agree/,
    );
  });

  it('PLANT MP16: a SECOND ramp target arm is refused, because CRAM lands a line earlier', async () => {
    await refuses(
      (s) => {
        const props = s.$defs.ramp_target.properties as Record<string, Node>;
        expect(Object.keys(props)).toEqual(['vsram']);
        props.cram = { type: 'object', properties: {}, unevaluatedProperties: false };
      },
      /not \[vsram\] alone/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The fp16 worked example, which is the only contract statement of the sign rule
// ═══════════════════════════════════════════════════════════════════════════

describe('the worked fp16 example still exercises the trap it exists for', () => {
  it('PLANT MP17: an example whose whole is NOT NEGATIVE is refused', async () => {
    await refuses(
      (s) => reword(
        s.$defs.fp16,
        /\{whole: -1, frac256: 128\} is -1\.5, not -0\.5/,
        '{whole: 0, frac256: 128} is 0.5, not 1.5',
      ),
      /no longer NEGATIVE/,
    );
  });

  it('PLANT MP18: an example that no longer DISTINGUISHES the naive value is refused', async () => {
    await refuses(
      (s) => reword(
        s.$defs.fp16,
        /\{whole: -1, frac256: 128\} is -1\.5, not -0\.5/,
        '{whole: -1, frac256: 128} is 0, not 0',
      ),
      /no longer distinguishes the correct value from the naive one/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// base_swap: the shape, the bounds, the granule and the two cross-checks
// ═══════════════════════════════════════════════════════════════════════════

describe('base_swap is a bounded LIST of bands on an aligned address', () => {
  it('PLANT MP19: the pre-migration single-object form is refused, not accepted again', async () => {
    await refuses(
      (s) => { s.$defs.base_swap.type = 'object'; },
      /no longer declares \$defs\.base_swap as an ARRAY/,
    );
  });

  it('PLANT MP20: a minItems of ZERO is refused', async () => {
    await refuses(
      (s) => { expect(s.$defs.base_swap.minItems).toBe(1); s.$defs.base_swap.minItems = 0; },
      /integer\s+minItems >= 1/,
    );
  });

  it('PLANT MP21: a plane enum with ONE spelling is refused, being a constant not a choice', async () => {
    await refuses(
      (s) => {
        const plane = ((s.$defs.base_swap.items as Node).properties as Record<string, Node>).plane;
        expect((plane.enum as string[]).length).toBeGreaterThan(1);
        plane.enum = [(plane.enum as string[])[0]];
      },
      /at least two string spellings/,
    );
  });

  it('PLANT MP22: a granule of ONE is refused, being the same as no constraint', async () => {
    await refuses(
      (s) => {
        const target = ((s.$defs.base_swap.items as Node).properties as Record<string, Node>).target;
        expect(target.multipleOf).toBeGreaterThan(1);
        target.multipleOf = 1;
      },
      /multipleOf >= 2/,
    );
  });

  it('PLANT MP23: a range that is not a WHOLE number of granules is refused, by ANY remainder', async () => {
    await refuses(
      (s) => {
        const target = ((s.$defs.base_swap.items as Node).properties as Record<string, Node>).target;
        const granule = target.multipleOf as number;
        expect(target.minimum).toBe(0);
        // A remainder of exactly ONE, which is the case a `> 1` tolerance lets
        // through and an exact test does not.
        target.maximum = granule;
        expect((granule + 1) % granule).toBe(1);
      },
      /is not a whole number of \d+-byte granules/,
    );
  });

  it('PLANT MP24: the edge rule must reproduce BOTH ends of the measured witness', async () => {
    await refuses(
      (s) => reword(
        s.$defs.base_swap,
        /the fully swapped rows are line\+1 \.\. restore_line-1/,
        'the fully swapped rows are line+1 .. restore_line-2',
      ),
      /does not reproduce the schema's own measured witness/,
    );
  });

  it('PLANT MP25: the order rule needs its ASCENDING sentence, not just the authority', async () => {
    await refuses(
      (s) => reword(
        s.$defs.base_swap,
        /strictly ASCENDING across the whole list/,
        'strictly ascending across the whole list',
      ),
      /strictly ASCENDING/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// boundary, tint_region, and the reserved vocabulary
// ═══════════════════════════════════════════════════════════════════════════

describe('the interlocks the schema states twice and this module compares', () => {
  it('PLANT MP26: the channel index space is compared at BOTH ends', async () => {
    await refuses(
      (s) => {
        const channel = (s.$defs.boundary.properties as Record<string, Node>).channel;
        expect(channel.minimum).toBe(0);
        channel.minimum = 1;
      },
      /two statements of RASTER_MAX_PATCH disagree/,
    );
  });

  it('PLANT MP27: an addr DECLARED on tint_region is refused even when it is optional', async () => {
    await refuses(
      (s) => {
        const props = s.$defs.tint_region.properties as Record<string, Node>;
        expect(Object.keys(props)).not.toContain('addr');
        props.addr = { type: 'integer', minimum: 0, maximum: 127 };
      },
      /\$defs\.tint_region now declares `addr`/,
    );
  });

  it('PLANT MP28: tint_region is pal_region minus addr by NAME, not by count', async () => {
    await refuses(
      (s) => {
        // The rename keeps the field COUNT identical and changes one NAME, so
        // a length comparison cannot see it and a set comparison must.
        const node = s.$defs.tint_region;
        const props = node.properties as Record<string, Node>;
        const required = node.required as string[];
        const [first] = Object.keys(props);
        expect(required).toContain(first);
        props[`${first}_renamed`] = props[first];
        delete props[first];
        node.required = required.map((k) => (k === first ? `${first}_renamed` : k));
        expect(Object.keys(props)).toHaveLength(required.length);
      },
      /is no longer \$defs\.pal_region minus/,
    );
  });

  it('PLANT MP29: a reserved-key sentence that parses to NOTHING is refused', async () => {
    await refuses(
      (s) => reword(
        s as unknown as Node,
        /Reserved and refused by name \(still wave-2 open\): fires\./,
        'Reserved and refused by name (still wave-2 open): ,.',
      ),
      /parsed to an empty list/,
    );
  });

  it('PLANT MP30: the matcher requires a NON-EMPTY name list', async () => {
    await refuses(
      (s) => reword(
        s as unknown as Node,
        /Reserved and refused by name \(still wave-2 open\): fires\./,
        'Reserved and refused by name (still wave-2 open): .',
      ),
      /no longer carries the "Reserved and refused by name" sentence/,
    );
  });
});
