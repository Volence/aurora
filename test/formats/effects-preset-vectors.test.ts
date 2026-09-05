// The contract's OWN accept/reject vectors, run through Aurora's preset codec.
//
// empyrean published `contract/schema/tests/effects-preset-vectors.json` with
// the 12aecd5 amendment (cycles / variants, AURORA_EFFECTS_SCHEMA.md §7.2):
// every case is derived from a §7.2 rule or the demand artifact's field table,
// none from a generator's behaviour, and each `fail` case was proven RED against
// the schema before being declared one. That makes the file the one fixture the
// contract itself vouches for — so it is vendored byte-identical (its sidecar is
// the pin of record, hashed here the way the schema's drift gate hashes the
// schema) and EVERY case is executed, by name, against `parseEffectsPreset`.
//
// WHAT A GREEN HERE MEANS: Aurora's evaluator agrees with the contract's
// validator on every document the contract chose to spell out — including the
// three-state `cycles` and the positional `variants` with a null slot. What it
// does NOT mean: any numeric value is checked (the vectors carry none; the
// schema is shape-only by design).
//
// THE ID RULE IS KEPT OUT OF THE WAY ON PURPOSE. `parseEffectsPreset` refuses a
// document whose `id` disagrees with the filename stem — a loader rule the
// vectors do not exercise. Each document is parsed under its own id as the
// stem, and a `fail` vector must be refused with the SCHEMA's sentence, so a
// stray identity refusal could not pass for a shape refusal.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  parseEffectsPreset, serializeEffectsPreset, EffectsPresetError,
  type EffectsPresetLibrary,
} from '../../src/core/formats/effects/preset';
import { addBandCommand } from '../../src/renderer/providers/effects-preset';
import { peerRepo, resolveRev, readAtRev, isAncestor } from '../support/peer-repo';

const VECTORS_PATH = resolve(__dirname, '../fixtures/effects/effects-preset-vectors.json');
const PROVENANCE_PATH = resolve(__dirname, '../fixtures/effects/effects-preset-vectors.provenance.json');

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  empyrean: { path: string; revision: string; blob: string; branch_that_answers_currency: string };
  vendored: { git_blob: string; bytes: number };
};

interface Vector {
  name: string;
  expect: 'pass' | 'fail';
  why: string;
  doc: Record<string, unknown> & { id: string; bands: unknown[] };
}

/** git's object id: sha1 over "blob <bytelen>\0" + the file's bytes. */
function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
}

const BYTES = readFileSync(VECTORS_PATH);
const FILE = JSON.parse(BYTES.toString('utf8')) as { $comment: string; cases: Vector[] };
const CASES = FILE.cases;
const ACCEPT = CASES.filter((c) => c.expect === 'pass');
const REJECT = CASES.filter((c) => c.expect === 'fail');

describe('contract preset vectors: vendored copy drift gate', () => {
  it('the vendored vectors are byte-identical to the pinned contract blob', () => {
    // Anti-vacuous: we hashed a real vector file, not an empty or missing one.
    expect(BYTES.length).toBeGreaterThan(1000);
    expect(PROV.empyrean.blob, 'the sidecar records no 40-hex empyrean blob').toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(BYTES)).toBe(PROV.empyrean.blob);
  });

  it('the provenance sidecar describes the file actually on disk', () => {
    expect(PROV.empyrean.revision, 'no 40-hex empyrean revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.empyrean.path).toBe('contract/schema/tests/effects-preset-vectors.json');
    expect(PROV.vendored.git_blob).toBe(PROV.empyrean.blob);
    expect(PROV.vendored.bytes).toBe(BYTES.length);
  });

  it('the vectors and the schema are pinned at the SAME empyrean revision', () => {
    const schemaProv = JSON.parse(readFileSync(
      resolve(__dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.provenance.json'),
      'utf8',
    )) as { empyrean: { revision: string } };
    expect(schemaProv.empyrean.revision).toBe(PROV.empyrean.revision);
  });

  it('carries both accept and reject cases, each with a name, an outcome and a reason', () => {
    // Anti-vacuous: a vector file with no reject case certifies without checking.
    expect(ACCEPT.length).toBeGreaterThan(0);
    expect(REJECT.length).toBeGreaterThan(0);
    expect(ACCEPT.length + REJECT.length).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.name.length, JSON.stringify(c)).toBeGreaterThan(0);
      expect(c.why.length, c.name).toBeGreaterThan(0);
      expect(typeof c.doc.id, c.name).toBe('string');
    }
    // The contract's own claim about its cases — every one is derived from a
    // §7.2 rule — is at least stated in the file we run.
    expect(FILE.$comment).toMatch(/EVERY CASE IS DERIVED FROM A SECTION 7\.2 RULE/);
  });
});

describe('every ACCEPT vector parses, and survives a save with nothing dropped', () => {
  for (const c of ACCEPT) {
    it(`accepts: ${c.name}`, () => {
      const text = JSON.stringify(c.doc, null, 2) + '\n';
      const preset = parseEffectsPreset(text, c.doc.id);
      // The reader hands back what JSON.parse produced: no key gained, none lost,
      // and a `cycles: null` or a null variants slot is still there.
      expect(preset).toEqual(c.doc);
      // ...and the writer carries every key back out in canonical form: the
      // CONTENT is identical, only the key order is aeon's §5 sort.
      expect(JSON.parse(serializeEffectsPreset(preset))).toEqual(c.doc);
    });
  }
});

/**
 * THE SEAM THE CODEC CANNOT SEE. The reader and writer above keep every key
 * because they never enumerate keys. The renderer's edit path is the one place
 * a preset is REBUILT — `editPresetCommand` clones the document, applies a
 * band mutation and hands the clone to the command. A clone written as a field
 * list (`{ schema, id, bands }`) would drop `cycles` / `variants` on the first
 * band edit and nothing in the codec would notice: the document is still legal.
 * So every accept vector that carries an item-5 key is pushed through a real
 * band edit and the keys are checked on the OTHER side, by value, nulls included.
 */
describe('every ACCEPT vector survives a band edit in the renderer with its item-5 keys intact', () => {
  const ITEM5 = ['cycles', 'variants'] as const;
  const carrying = ACCEPT.filter((c) => ITEM5.some((k) => k in c.doc));
  it('at least one accept vector carries cycles or variants (else the rows below prove nothing)', () => {
    expect(carrying.map((c) => c.name)).not.toEqual([]);
  });
  for (const c of carrying) {
    it(`keeps cycles/variants across "add band": ${c.name}`, () => {
      const preset = parseEffectsPreset(JSON.stringify(c.doc, null, 2) + '\n', c.doc.id);
      const library: EffectsPresetLibrary = { presets: [preset], unreadable: [], notices: [], loadedPaths: [] };
      const cmd = addBandCommand(library, c.doc.id);
      expect(cmd, 'the edit path refused a contract-accepted document').not.toBeNull();
      const after = cmd!.newPreset!;
      expect(after.bands!.length).toBe(c.doc.bands!.length + 1);
      for (const k of ITEM5) {
        expect(k in after, `${k} was present before the edit and absent after`).toBe(k in c.doc);
        expect(after[k]).toEqual(c.doc[k]);
      }
      // ...and the edited document is still one the contract's schema accepts.
      expect(() => parseEffectsPreset(serializeEffectsPreset(after), c.doc.id)).not.toThrow();
    });
  }
});

describe('every REJECT vector is refused by the SCHEMA, not by the id rule', () => {
  for (const c of REJECT) {
    it(`refuses: ${c.name}`, () => {
      const text = JSON.stringify(c.doc, null, 2) + '\n';
      let thrown: unknown = null;
      try { parseEffectsPreset(text, c.doc.id); } catch (e) { thrown = e; }
      expect(thrown, `${c.name}: the contract says FAIL (${c.why}) and Aurora parsed it`)
        .toBeInstanceOf(EffectsPresetError);
      expect((thrown as Error).message).toMatch(/does not match the raster preset schema/);
      expect((thrown as Error).message).not.toMatch(/filename stem and the id must match/);
    });
  }
});

/**
 * CURRENCY — the question a pinned blob can never answer, asked the way the
 * schema gate asks it: at a committed revision, through git objects, skipping
 * LOUDLY when it cannot run.
 */
describe('CURRENCY: are the vendored vectors still what empyrean publishes?', () => {
  const empyrean = peerRepo('empyrean');
  const TIP = PROV.empyrean.branch_that_answers_currency;
  const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored preset vectors are stale.';

  it(`matches ${PROV.empyrean.path} at empyrean ${TIP}`, (ctx) => {
    if (empyrean === null) {
      ctx.skip('SKIPPED, NOT PASSED: no empyrean checkout beside this repo (set '
        + `AURORA_EMPYREAN_REPO). CANNOT MEASURE whether the pin ${PROV.empyrean.revision} is still current`);
      return;
    }
    const tip = resolveRev(empyrean, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${empyrean}. CANNOT MEASURE `
        + `currency of pin ${PROV.empyrean.revision}`);
      return;
    }
    const at = readAtRev(empyrean, tip, PROV.empyrean.path);
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    expect(
      at.blob,
      `${NOT_OURS}\n`
      + `  pinned at empyrean ${PROV.empyrean.revision} (blob ${PROV.empyrean.blob})\n`
      + `  empyrean ${TIP} is now ${tip} (blob ${at.blob})\n`
      + `  Re-vendor:  git -C ${empyrean} show ${tip}:${PROV.empyrean.path} `
      + '> test/fixtures/effects/effects-preset-vectors.json\n'
      + '  then update its provenance sidecar, and re-vendor the schema at the same revision.',
    ).toBe(PROV.empyrean.blob);
  });

  it('the pinned empyrean revision is PUBLISHED, not local-only', (ctx) => {
    if (empyrean === null) {
      ctx.skip('SKIPPED, NOT PASSED: no empyrean checkout beside this repo. CANNOT MEASURE '
        + `whether ${PROV.empyrean.revision} is reachable from ${TIP}`);
      return;
    }
    const tip = resolveRev(empyrean, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${empyrean}. CANNOT MEASURE reachability`);
      return;
    }
    expect(
      isAncestor(empyrean, PROV.empyrean.revision, tip),
      `${PROV.empyrean.revision} is NOT reachable from empyrean ${TIP} (${tip})`,
    ).toBe(true);
  });
});
