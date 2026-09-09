// THE `??` SITES IN src/core/formats/effects/, AND THE ONE THAT NEEDED MEASURING.
//
// docs/reviews/2026-09-09-effects-fallback-census.md enumerates all 27 `??`/`??=`
// operators in that tree and classifies each. Twenty-six of them are BENIGN or
// LOAD-BEARING for reasons a reader can check by reading: the fallback is
// unreachable, or it means the same thing as the value it replaces, or it is
// funnelled straight into a loud `throw`.
//
// ONE is different — `preset.ts:979`:
//
//     return /lowers into EffectsPreset\.ep_patched/.test(String(node.description ?? ''));
//
// Absence here (`description` missing from the arm's property node) produces
// `false`, which is exactly what a PRESENT description that does not mention
// `ep_patched` produces. The arm silently joins `EFFECTS_PRESET_RASTER_CHANNELS`.
// The site's own docblock says that is survivable because the failure is loud
// downstream — so this file MEASURES that rather than believing it.
//
// ⚠ THIS IS NOT THE MUTATION test/formats/effects-preset-boundary.test.ts
// ALREADY MAKES. That poison REWRITES the sentence
// (`'lowers into somewhere else entirely'`), so `description` is still a string
// and the `??` never fires. The census site is about the key being ABSENT, which
// is the only input that reaches the `?? ''`. The two mutations travel the same
// downstream path, but only this one exercises the operator being censused, and
// a census that cited the existing row would be citing a test of a different
// input.
//
// BOTH DIRECTIONS, because a rule that only ever fires one way has not been
// shown to be a rule:
//   • ABSENT  — the description key is deleted, and the consequence is loud.
//   • PRESENT — the real vendored schema still classifies the arm as patched
//               and the provider still loads.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.json',
);
const PRESET_MODULE = resolve(__dirname, '../../src/core/formats/effects/preset');
const PROVIDER_MODULE = resolve(__dirname, '../../src/renderer/providers/effects-preset');
const SCHEMA_MODULE = SCHEMA_PATH;

/** The sentence `preset.ts`'s classification reads. Spelled once, here. */
const EP_PATCHED = /lowers into EffectsPreset\.ep_patched/;

type VendoredSchema = {
  oneOf?: { required?: string[] }[];
  properties: Record<string, { description?: string }>;
};

/** A fresh mutable copy of the vendored schema, read off disk each time. */
function readSchema(): VendoredSchema {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as VendoredSchema;
}

/**
 * The patched arm, DERIVED from the schema the same way `preset.ts` derives it
 * — never typed as 'boundary'. If the contract ever moves the sentence to a
 * different arm, this file follows it instead of going vacuously green against
 * a name nobody publishes any more.
 */
function patchedArmFromSchema(s: VendoredSchema): string {
  const arms = (s.oneOf ?? []).map((b) => (b.required ?? [])[0]).filter((a): a is string => !!a);
  const hits = arms.filter((a) => EP_PATCHED.test(String(s.properties[a]?.description ?? '')));
  // LOUD WHEN IT CANNOT MEASURE. A tree where no arm (or more than one) carries
  // the sentence gives this file nothing to delete, and a silent skip here would
  // read exactly like a pass.
  if (hits.length !== 1) {
    throw new Error(
      `this census row needs exactly one arm whose description carries ${EP_PATCHED}, and the `
      + `vendored schema has ${hits.length} (arms: ${JSON.stringify(arms)}). The contract has `
      + 'changed shape; re-read it and re-derive, do NOT hardcode the arm name.',
    );
  }
  return hits[0];
}

describe('preset.ts:979 `node.description ?? \'\'`: the census\'s one conflating site', () => {
  afterEach(() => {
    vi.doUnmock(SCHEMA_MODULE);
    vi.resetModules();
  });

  it('PRESENT: the real schema classifies the patched arm as patched, and the provider loads', async () => {
    const real = readSchema();
    const arm = patchedArmFromSchema(real);

    vi.resetModules();
    const preset = await import(PRESET_MODULE) as typeof import('../../src/core/formats/effects/preset');

    expect(preset.EFFECTS_PRESET_PATCHED_ARMS).toEqual([arm]);
    expect(preset.EFFECTS_PRESET_RASTER_CHANNELS).not.toContain(arm);
    // And the surface that carries the second, independent statement of the
    // classification is happy with it.
    await expect(import(PROVIDER_MODULE)).resolves.toBeTruthy();
  });

  it('ABSENT: deleting the description key collapses the classification, and it is LOUD', async () => {
    const real = readSchema();
    const arm = patchedArmFromSchema(real);

    // Anti-vacuous: the key really is there in the bytes we are removing it
    // from, so the mutation is a mutation and not a no-op.
    expect(typeof real.properties[arm].description).toBe('string');
    delete real.properties[arm].description;
    expect(real.properties[arm].description).toBeUndefined();

    vi.resetModules();
    vi.doMock(SCHEMA_MODULE, () => ({ default: real }));
    const poisoned = await import(PRESET_MODULE) as typeof import('../../src/core/formats/effects/preset');

    // The `?? ''` fired and the arm fell into the raster list — i.e. this row is
    // exercising the operator it claims to.
    expect(
      poisoned.EFFECTS_PRESET_PATCHED_ARMS,
      `the ${arm} description key was deleted and the patched set did NOT collapse, so the `
      + '`?? \'\'` at preset.ts:979 is not on the path this row believes it is on',
    ).toEqual([]);
    expect(poisoned.EFFECTS_PRESET_RASTER_CHANNELS).toContain(arm);

    // ═══ AND THE CONSEQUENCE IS LOUD ═══
    //
    // This is the whole reason the site is classified LOAD-BEARING rather than
    // reported as a finding. The hand-written dropdown label still says the arm
    // is patched, the derivation now says it is not, and
    // `PROGRAM_ARM_OPTIONS` compares the two in both directions at module load.
    // If this stops throwing, the census's verdict on preset.ts:979 is wrong and
    // the site becomes a real finding: an arm silently offered a raster editor.
    await expect(
      import(PROVIDER_MODULE),
      'the provider loaded with the patched arm counted as a raster channel. An absent '
      + '`description` is now indistinguishable from one that does not claim ep_patched, with no '
      + 'loud consequence anywhere. preset.ts:979 has become a CONFLATING site and the census '
      + 'row for it must be re-opened.',
    ).rejects.toThrow(/PROGRAM_ARM_LABELS/);
  });
});
