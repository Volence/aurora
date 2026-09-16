import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  SUPPORTED_KEYWORDS,
  collectSchemaKeywords,
  assertSchemaSupported,
} from '../../src/core/formats/effects/json-schema-subset';
import { REGIONS_SCHEMA } from '../../src/core/formats/regions/document';
import {
  peerRepo, resolveRev, readAtRev, isAncestor, currencyBranch, CURRENCY_BRANCH_SHAPE,
} from '../support/peer-repo';

/**
 * The vendored-schema drift gate for the REGIONS document, the same instrument
 * test/formats/effects-schema-drift.test.ts is for the scene.
 *
 * WHY VENDORED rather than read from the sibling empyrean checkout: core must
 * work from a lone Aurora clone, inside a git worktree (where ../../empyrean is
 * not where it is from master), and in a packaged Electron build where no
 * sibling repo is shipped at all. A path-probe design would degrade to "schema
 * not found, so skip validation", which is the exact loud-on-unmeasurable
 * failure this suite is not allowed to have. The cost of vendoring is
 * staleness, and this file is the payment.
 *
 * WHAT THE PIN IS. The load-bearing invariant is the schema file's GIT BLOB
 * HASH, not a commit citation, and NOT A NUMBER SPELLED HERE. It lives once, in
 * `aurora-regions.schema.provenance.json`, which this file reads. The scene
 * gate's own header records what happens otherwise: the value that used to sit
 * in its source was three re-pins stale, in the very paragraph explaining why
 * nothing hashes a comment.
 *
 * WHAT THIS GATE CANNOT DO, said plainly: it proves the vendored copy is
 * byte-identical to the blob Aurora pinned. It cannot, on its own, notice that
 * empyrean has since changed the schema, because a pin equals itself by
 * construction. That question is the CURRENCY block at the bottom, which reads
 * empyrean at a COMMITTED revision through git objects (never the sibling
 * working tree, docs/reviews/2026-08-28-golden-live-tree.md) and SKIPS LOUDLY
 * when it cannot run.
 *
 * ⚠ THE RE-VENDOR REMEDIATION TEXT BELOW NAMES THE TIP, and following it
 * literally would pin a revision that does not carry the change. The pin of
 * record is the commit `git log origin/main -- <path>` names as the last to
 * touch the file. Kept in the shape the effects gates use so the three gates
 * read alike; the warning is in the sidecar's
 * `why_this_revision_and_not_the_tip` and repeated here for the reader who is
 * looking at the failure and not at the sidecar.
 */

const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/regions/aurora-regions.schema.json',
);
const PROVENANCE_PATH = resolve(
  __dirname, '../../src/core/formats/regions/aurora-regions.schema.provenance.json',
);

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  // `branch_that_answers_currency` is deliberately NOT declared here. A
  // `JSON.parse` cast cannot know a field is present, and declaring it as a
  // `string` is what made a bare property access look safe in the effects
  // gates: on a sidecar that had lost the key, `TIP` was `undefined` and the
  // currency rows skipped blaming the peer. It is read through
  // `currencyBranch`, which asserts.
  empyrean: { path: string; revision: string; blob: string };
  vendored: { git_blob: string; bytes: number };
};

const PINNED_BLOB = PROV.empyrean.blob;

const { tip: TIP, defect: TIP_DEFECT } = currencyBranch(PROV.empyrean, PROVENANCE_PATH, 'empyrean');

/** git's object id: sha1 over "blob <bytelen>\0" + the file's bytes. */
function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
}

describe('regions schema: vendored copy drift gate', () => {
  /*
   * ⚠ THIS ROW GOES FIRST AND EVERY ROW BELOW IT DEPENDS ON IT. `gitBlobHash`
   * is a hand-rolled reimplementation of git's object id, and a
   * content-addressed gate whose hasher is wrong can be green for the wrong
   * reason on every row at once, which is the one failure a mismatch cannot
   * report. The three answers below are git's own, from
   * `git hash-object --stdin`, so they hold whatever anyone later does to the
   * sidecar: today the pin was produced by real git and this side is computed
   * here, so the gate is controlled by construction, but nothing STOPS a future
   * script from writing the pin with this same helper, and on that day both
   * sides would share one bug and go green together.
   */
  it('CONTROL ON THE HASHER, and nothing below it means anything without this', () => {
    expect(gitBlobHash(Buffer.from(''))).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    expect(gitBlobHash(Buffer.from('hello'))).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
    // A trailing newline, because the length prefix is where a reimplementation
    // goes wrong and an off-by-one there is invisible on a fixed-size sample.
    expect(gitBlobHash(Buffer.from('a\n'))).toBe('78981922613b2afb6025042ff6bd878ac1994e85');
  });

  it('the vendored schema is byte-identical to the pinned contract blob', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    // Anti-vacuous: a real schema was hashed, not an empty or missing file.
    expect(bytes.length).toBeGreaterThan(1000);
    expect(JSON.parse(bytes.toString('utf8')).$id)
      .toBe('https://empyrean/contract/aurora-regions.schema.json');
    expect(PINNED_BLOB, 'the sidecar records no 40-hex empyrean blob').toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(bytes)).toBe(PINNED_BLOB);
  });

  /**
   * The sidecar cannot describe a file other than the one on disk. Catches a
   * schema edited by hand to make something else pass, and a provenance record
   * edited away from it.
   *
   * IT ALSO ASSERTS THE FIELD THE CURRENCY BLOCK STEERS BY, and this row is
   * where that assertion has to live: it needs no peer checkout, so it is the
   * one row that still runs on a machine with no empyrean beside it. Put the
   * check only in the currency rows and a lost field would go quiet again on
   * exactly the machines where the currency rows already skip.
   */
  it('the provenance sidecar describes the schema actually on disk', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    expect(PROV.empyrean.revision, 'no 40-hex empyrean revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.empyrean.path).toBe('contract/schema/aurora-regions.schema.json');
    expect(PROV.vendored.git_blob).toBe(PROV.empyrean.blob);
    expect(PROV.vendored.bytes).toBe(bytes.length);
    // The received value IS the defect sentence, so the failure names what is
    // wrong with which block of which file.
    expect(TIP_DEFECT, 'the sidecar cannot say which branch answers currency').toBeNull();
    expect(TIP, 'the branch that answers currency is not a remote-tracking ref')
      .toMatch(CURRENCY_BRANCH_SHAPE);
  });

  it('the module validates against the vendored file, not a restatement', () => {
    // REGIONS_SCHEMA must BE the file on disk, so the hash above pins what the
    // codec actually uses. Compare parsed values: the import goes through the
    // bundler, so object identity is not the question.
    const onDisk = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    expect(REGIONS_SCHEMA).toEqual(onDisk);
  });

  /**
   * The subset evaluator's coverage gate. Every keyword appearing anywhere in
   * the committed schema must be one the evaluator implements. DERIVED by
   * walking the schema, never a hand list, so a future amendment that
   * introduces `allOf` / `if` / `patternProperties` fails HERE, loudly, instead
   * of being silently ignored by an evaluator that does not know the keyword.
   *
   * This is the row that named the one keyword this parcel had to implement:
   * `maxLength`, at /$defs/region/properties/name. It was MEASURED by running
   * this walk over the vendored bytes before a line of the codec was written,
   * and it disagreed with the guess that arrived with the work: const, $ref
   * with $defs, unevaluatedProperties, pattern, minItems, the union type
   * [string, null] and minimum were every one of them already implemented.
   */
  it('every keyword in the committed schema is implemented', () => {
    const used = collectSchemaKeywords(REGIONS_SCHEMA);
    // Anti-vacuous: the walk really found the schema's keywords.
    expect(used.size).toBeGreaterThan(10);
    expect(used.has('unevaluatedProperties')).toBe(true);
    expect(used.has('maxLength')).toBe(true);
    expect([...used].filter(k => !SUPPORTED_KEYWORDS.has(k))).toEqual([]);
  });

  /**
   * The census above answers "is every keyword NAME implemented?". This asks
   * the stronger question, "would the evaluator refuse ANY node?", which the
   * preset gate learned to ask at empyrean 12aecd5 when a type ARRAY passed the
   * census and threw on the first document that reached it. The regions schema
   * carries two type arrays of its own (`rasterRef` and `sceneRef`, both
   * [string, null]), so this is not a hypothetical shape here.
   */
  it('every NODE of the committed schema passes the evaluator per-node check', () => {
    expect(() => assertSchemaSupported(REGIONS_SCHEMA)).not.toThrow();
  });

  /**
   * THE CLOSURE IS AT THREE LEVELS, NOT ONE, and that is the property the
   * document codec's whole "refuses, never erases" claim rests on. Derived from
   * the schema on disk rather than counted once and written down: a future
   * amendment that adds a nested object and forgets to close it fails here.
   */
  it('every object node of the committed schema is CLOSED', () => {
    const open: string[] = [];
    const walk = (node: unknown, where: string): void => {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
      const obj = node as Record<string, unknown>;
      if (obj.properties !== undefined && obj.unevaluatedProperties !== false) {
        open.push(where || '<root>');
      }
      for (const key of ['properties', '$defs']) {
        const held = obj[key] as Record<string, unknown> | undefined;
        if (held) for (const [name, sub] of Object.entries(held)) walk(sub, `${where}/${key}/${name}`);
      }
      if (obj.items) walk(obj.items, `${where}/items`);
    };
    walk(REGIONS_SCHEMA, '');
    expect(open, 'these object nodes declare properties and are NOT closed').toEqual([]);
    // Anti-vacuous: the walk really visited more than the root, so an empty
    // `open` is a measurement and not a walk that found nothing to look at.
    const closed: string[] = [];
    const count = (node: unknown, where: string): void => {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
      const obj = node as Record<string, unknown>;
      if (obj.unevaluatedProperties === false) closed.push(where || '<root>');
      for (const key of ['properties', '$defs']) {
        const held = obj[key] as Record<string, unknown> | undefined;
        if (held) for (const [name, sub] of Object.entries(held)) count(sub, `${where}/${key}/${name}`);
      }
      if (obj.items) count(obj.items, `${where}/items`);
    };
    count(REGIONS_SCHEMA, '');
    expect(closed.length, 'the closure walk found fewer than two closed nodes').toBeGreaterThan(1);
  });
});

/**
 * CURRENCY, the question a pinned blob can never answer, asked at a committed
 * revision through git objects and skipping LOUDLY when it cannot run.
 */
describe('CURRENCY: is the vendored regions schema still what empyrean publishes?', () => {
  const empyrean = peerRepo('empyrean');
  const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored regions schema is stale.';

  /**
   * Assert the operand BEFORE the skip. A row that reaches
   * `resolveRev(empyrean, undefined)` skips saying the revision does not
   * resolve, which reads as an unfetched peer and hides an Aurora-side sidecar
   * defect behind a peer-shaped excuse. This is a FAILURE, not a skip: nothing
   * about it is unmeasurable from here.
   */
  const assertSteerable = () => expect(
    TIP_DEFECT, 'this row cannot ask its question: the sidecar names no usable currency branch',
  ).toBeNull();

  it(`matches ${PROV.empyrean.path} at empyrean ${TIP}`, (ctx) => {
    assertSteerable();
    if (empyrean === null) {
      ctx.skip('SKIPPED, NOT PASSED: no empyrean checkout beside this repo (set EMPYREAN_DIR). '
        + `CANNOT MEASURE whether the pin ${PROV.empyrean.revision} is still current`);
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
      + '  Re-vendor from the commit that LAST TOUCHED the path, which is what the sidecar\n'
      + `  pins, and not from ${tip} unless the two are the same commit:\n`
      + `      git -C <empyrean> log ${TIP} -- ${PROV.empyrean.path}\n`
      + `      git -C <empyrean> show <that commit>:${PROV.empyrean.path} `
      + '> src/core/formats/regions/aurora-regions.schema.json\n'
      + '  then update its provenance sidecar, and re-vendor the VECTORS at the same revision.',
    ).toBe(PROV.empyrean.blob);
  });

  it('the pinned empyrean revision is PUBLISHED, not local-only', (ctx) => {
    assertSteerable();
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
