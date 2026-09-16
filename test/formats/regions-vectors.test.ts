import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { validateAgainstSchema, type SchemaIssue } from '../../src/core/formats/effects/json-schema-subset';
import {
  REGIONS_SCHEMA, parseRegionsDocument, serializeRegionsDocument, RegionsDocumentError,
} from '../../src/core/formats/regions/document';
import {
  allPointers, resolvePointer, withoutPointer, withPointer,
  parentPointer, lastSegment, pointerDepth,
} from '../support/json-pointer';
import {
  peerRepo, resolveRev, readAtRev, isAncestor, currencyBranch, CURRENCY_BRANCH_SHAPE,
} from '../support/peer-repo';

/**
 * The contract's OWN accept/reject vectors for the regions document, run
 * through Aurora's regions codec.
 *
 * empyrean published `contract/schema/tests/regions-vectors.json` with the
 * regions schema itself (c3f892f, part 2 step 10): every case is derived from a
 * rule in the schema doc or the part 2 spec, none from a generator's behaviour,
 * and each `fail` case was proven RED against the schema before being declared
 * one. That makes the file the one fixture the contract itself vouches for, so
 * it is vendored byte-identical (its sidecar is the pin of record, hashed here
 * the way the schema's drift gate hashes the schema) and EVERY case is
 * executed, by name.
 *
 * ⚠ THESE ARE NOT A GOLDEN AND NOTHING HERE PRETENDS OTHERWISE. Aeon has not
 * built the generator half of regions part 2, so no generated artifact exists
 * to compare against; a self-made file presented as a shared golden would be
 * the failure this repo has a banked lesson about. What a green here means is
 * narrower and worth stating exactly: Aurora's evaluator agrees with the
 * contract's validator on every document the contract chose to spell out. What
 * it does not mean: that any REFERENCE resolves, that any number is in range,
 * or that `bg.span` agrees with its layout. The schema is shape-only by its own
 * words and the vectors' $comment lists what it deliberately leaves out.
 *
 * ═══ HOW A REJECT VECTOR IS CHECKED, AND WHY NOT "IT THREW" ═══
 *
 * A codec that refuses every document passes a reject-only assertion, so the
 * rows below assert the REASON. The reason is stated in the vector as prose
 * (`why`), which no assertion can read, and copying the pointer out of a
 * measurement into this file would be a constant that stops measuring the
 * moment the vectors are re-pinned. So the location is DERIVED, from the
 * vectors' own promise that "Each FAIL case perturbs a PASS document in exactly
 * ONE forbidden way":
 *
 *   1. Search for every SINGLE-POINTER REPAIR that makes the document valid.
 *      A repair is either deleting the value at one pointer, or writing at one
 *      pointer the value an ACCEPT vector has at that same pointer. The whole
 *      document is excluded as a pointer, or every case would be "repairable"
 *      by replacing it wholesale.
 *   2. Keep the DEEPEST repairs. That is the most specific localization of the
 *      perturbation; shallower repairs work by replacing a bigger subtree.
 *   3. Turn each into the pointer the refusal MUST be reported at:
 *      a wrong VALUE is reported at the pointer itself, while an extra key and
 *      a missing key are both reported on the object that contains them, which
 *      is where JSON Schema's closure and `required` rules live.
 *   4. Assert that every issue the schema reports is at that pointer, and that
 *      it NAMES THE KEY when the key is an object member.
 *
 * Nothing in that chain is typed by hand, so a re-pin that moves a case moves
 * the expectation with it, and a validator that answers "no" at the document
 * root fails six of the seven cases.
 */

const VECTORS_PATH = resolve(__dirname, '../fixtures/regions/regions-vectors.json');
const PROVENANCE_PATH = resolve(__dirname, '../fixtures/regions/regions-vectors.provenance.json');

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  // `branch_that_answers_currency` is deliberately NOT declared here; it is
  // read through `currencyBranch`, which asserts rather than assumes. See the
  // effects gates for the measurement of what assuming it cost.
  empyrean: { path: string; revision: string; blob: string };
  vendored: { git_blob: string; bytes: number };
};

const { tip: TIP, defect: TIP_DEFECT } = currencyBranch(PROV.empyrean, PROVENANCE_PATH, 'empyrean');

interface Vector {
  name: string;
  expect: 'pass' | 'fail';
  why: string;
  doc: Record<string, unknown>;
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
const ACCEPT = CASES.filter(c => c.expect === 'pass');
const REJECT = CASES.filter(c => c.expect === 'fail');

/** Does the vendored schema accept this document? */
const accepted = (doc: unknown): boolean => validateAgainstSchema(doc, REGIONS_SCHEMA).length === 0;

type RepairKind = 'delete' | 'set-absent' | 'set-present';
interface Repair { pointer: string; kind: RepairKind }

/**
 * Every single-pointer edit that makes `doc` valid: see step 1 of the header.
 * `donors` are the accept vectors, the only source of a replacement value, so
 * no value in this file was invented to make a repair work.
 */
function singlePointerRepairs(doc: unknown, donors: unknown[]): Repair[] {
  const candidates = new Set<string>(allPointers(doc));
  for (const d of donors) for (const p of allPointers(d)) candidates.add(p);

  const found: Repair[] = [];
  for (const pointer of candidates) {
    const here = resolvePointer(doc, pointer);
    if (here.present && accepted(withoutPointer(doc, pointer))) {
      found.push({ pointer, kind: 'delete' });
    }
    // A write needs its CONTAINER to exist in the broken document, or the edit
    // is not one pointer's worth of change.
    const parent = parentPointer(pointer);
    if (parent !== '' && !resolvePointer(doc, parent).present) continue;
    for (const donor of donors) {
      const from = resolvePointer(donor, pointer);
      if (!from.present) continue;
      if (accepted(withPointer(doc, pointer, from.value))) {
        found.push({ pointer, kind: here.present ? 'set-present' : 'set-absent' });
        break;
      }
    }
  }
  return found;
}

interface Expectation {
  /** The pointer the refusal must be reported at. */
  pointer: string;
  /** The object member the message must name, or null when the container is an array. */
  key: string | null;
}

/** Step 3: the repair, turned into what the refusal must say and where. */
function expectationFor(doc: unknown, repair: Repair): Expectation {
  if (repair.kind === 'set-present') return { pointer: repair.pointer, key: null };
  const parent = parentPointer(repair.pointer);
  const inArray = Array.isArray(resolvePointer(doc, parent).value);
  return { pointer: parent, key: inArray ? null : lastSegment(repair.pointer) };
}

/**
 * The whole derivation for one reject vector, computed once so the rows below
 * and the census at the bottom cannot disagree about it.
 */
function localize(v: Vector) {
  const repairs = singlePointerRepairs(v.doc, ACCEPT.map(a => a.doc));
  const deepest = repairs.length === 0
    ? []
    : repairs.filter(r => pointerDepth(r.pointer) === Math.max(...repairs.map(x => pointerDepth(x.pointer))));
  const expectations = deepest.map(r => expectationFor(v.doc, r));
  const pointers = [...new Set(expectations.map(e => e.pointer))];
  const keys = [...new Set(expectations.map(e => e.key))];
  return { repairs, deepest, expectations, pointers, keys };
}

describe('contract regions vectors: vendored copy drift gate', () => {
  it('the vendored vectors are byte-identical to the pinned contract blob', () => {
    // Anti-vacuous: a real vector file was hashed, not an empty or missing one.
    expect(BYTES.length).toBeGreaterThan(1000);
    expect(PROV.empyrean.blob, 'the sidecar records no 40-hex empyrean blob').toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(BYTES)).toBe(PROV.empyrean.blob);
  });

  /**
   * IT ALSO ASSERTS THE FIELD THE CURRENCY BLOCK STEERS BY, and this row is
   * where that assertion has to live: it needs no peer checkout, so it is the
   * one row that still runs on a machine with no empyrean beside it.
   */
  it('the provenance sidecar describes the file actually on disk', () => {
    expect(PROV.empyrean.revision, 'no 40-hex empyrean revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.empyrean.path).toBe('contract/schema/tests/regions-vectors.json');
    expect(PROV.vendored.git_blob).toBe(PROV.empyrean.blob);
    expect(PROV.vendored.bytes).toBe(BYTES.length);
    expect(TIP_DEFECT, 'the sidecar cannot say which branch answers currency').toBeNull();
    expect(TIP, 'the branch that answers currency is not a remote-tracking ref')
      .toMatch(CURRENCY_BRANCH_SHAPE);
  });

  /**
   * A schema re-pinned without its vectors, or the other way round, would show
   * up as the schema refusing a case the contract says it accepts. That is a
   * confusing way to learn it, so the mismatch is asserted directly.
   */
  it('the vectors and the schema are pinned at the SAME empyrean revision', () => {
    const schemaProv = JSON.parse(readFileSync(
      resolve(__dirname, '../../src/core/formats/regions/aurora-regions.schema.provenance.json'),
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
      expect(typeof c.doc, c.name).toBe('object');
    }
    // The contract's own claim about its cases is at least stated in the file
    // this suite runs, so a re-pin that drops the claim is visible.
    expect(FILE.$comment).toMatch(/EVERY CASE IS DERIVED FROM A RULE/);
  });
});

describe('every ACCEPT vector parses, and survives a write with nothing dropped', () => {
  for (const c of ACCEPT) {
    it(`accepts: ${c.name}`, () => {
      const text = JSON.stringify(c.doc, null, 2) + '\n';
      const doc = parseRegionsDocument(text, `${c.name}.json`);
      // The reader hands back what JSON.parse produced: no key gained, none lost.
      expect(doc).toEqual(c.doc);
      // ...and the writer carries every key back out. The CONTENT is identical;
      // only the key order is aeon's section 5 sort.
      expect(JSON.parse(serializeRegionsDocument(doc))).toEqual(c.doc);
    });
  }

  /**
   * BYTE IDENTITY, stated precisely rather than loosely. Aurora writes the
   * canonical form (alphabetical recursively, indent 2, one trailing newline),
   * so a document whose author typed the keys in some other order is
   * NORMALIZED on its first save. What must hold, and what the round-trip claim
   * actually is, is that the canonical text is a FIXED POINT: read it back and
   * write it again and not one byte moves. Anything less means a save loop
   * rewrites a file nobody edited.
   */
  for (const c of ACCEPT) {
    it(`canonical text is a fixed point: ${c.name}`, () => {
      const once = serializeRegionsDocument(
        parseRegionsDocument(JSON.stringify(c.doc, null, 2) + '\n', `${c.name}.json`),
      );
      const twice = serializeRegionsDocument(parseRegionsDocument(once, `${c.name}.json`));
      expect(twice).toBe(once);
      // Anti-vacuous: the fixed point is a real document and not an empty one,
      // and it really is the canonical form rather than whatever came in.
      expect(once.endsWith('}\n')).toBe(true);
      expect(once.startsWith('{\n  "act":')).toBe(true);
    });
  }
});

describe('every REJECT vector is refused by the SCHEMA, at the pointer its perturbation names', () => {
  for (const c of REJECT) {
    it(`refuses: ${c.name}`, () => {
      const issues: SchemaIssue[] = validateAgainstSchema(c.doc, REGIONS_SCHEMA);
      // The weak half first: the SCHEMA refuses it, so whatever refused this
      // document, it was not some rule Aurora invented on the side.
      expect(
        issues,
        `the contract says FAIL (${c.why}) and the vendored SCHEMA accepts it`,
      ).not.toEqual([]);

      const { repairs, deepest, pointers, keys } = localize(c);

      // LOUD ON UNMEASURABLE. If no single-pointer repair exists, this row
      // cannot say where the defect is, and that is a failure of the
      // instrument, never a quiet pass on the weak half above.
      expect(
        repairs.map(r => `${r.pointer} (${r.kind})`),
        'NO SINGLE-POINTER REPAIR: this row cannot localize the perturbation, so it cannot '
        + 'check that the refusal is for the stated reason. Either the vector perturbs more '
        + 'than one place (which its own $comment forbids) or the repair search is broken.',
      ).not.toEqual([]);

      // The deepest repairs must agree on one location, or "the reason" is
      // ambiguous and this row would be choosing one arbitrarily.
      expect(
        pointers,
        `the deepest repairs disagree about where the defect is: ${JSON.stringify(deepest)}`,
      ).toHaveLength(1);
      const pointer = pointers[0];

      // THE STRONG HALF. Every complaint is at the derived pointer: not one
      // elsewhere, and none at the document root standing in for a reason.
      expect(
        issues.map(i => i.path),
        `the contract says FAIL (${c.why}); the perturbation is at ${pointer} and the schema `
        + `complains at ${JSON.stringify(issues.map(i => i.path))}`,
      ).toEqual(issues.map(() => pointer));

      // ...and where the container is an object, the message NAMES the member,
      // so "something is wrong here" cannot pass for "this key is wrong".
      if (keys.length === 1 && keys[0] !== null) {
        expect(
          issues.map(i => i.message).join(' | '),
          `the refusal at ${pointer} never names ${keys[0]}`,
        ).toContain(`"${keys[0]}"`);
      }

      // ...and the CODEC speaks the same refusal, with the pointer in it, so an
      // author is told where and not only that.
      let thrown: unknown = null;
      try { parseRegionsDocument(JSON.stringify(c.doc, null, 2) + '\n', 'act.json'); } catch (e) { thrown = e; }
      expect(thrown, `the contract says FAIL (${c.why}) and Aurora parsed it`)
        .toBeInstanceOf(RegionsDocumentError);
      expect((thrown as RegionsDocumentError).issues.some(line => line.startsWith(`${pointer}:`)))
        .toBe(true);
    });
  }

  /**
   * ANTI-VACUOUS CENSUS OVER THE WHOLE SET. The rows above each check one case;
   * this checks that the set as a whole exercises what it is carried for.
   *
   * THE NESTED CLOSURE IS THE ONE THAT EARNS THE FILE. A document closed only
   * at its root would pass every other reject case here, and a nested open
   * object is how a key nobody agreed to reaches a consumer. So at least one
   * refusal must land BELOW a region object, and that is derived from the
   * localization rather than named: a re-pin that drops the case fails here.
   */
  it('the set refuses somewhere deeper than a region object, not only at the root', () => {
    const depths = REJECT.map(c => {
      const { pointers } = localize(c);
      return { name: c.name, pointer: pointers[0] ?? '(unlocalized)', depth: pointerDepth(pointers[0] ?? '') };
    });
    // /regions/0 is depth 2, so "deeper than a region object" is depth 3 or more.
    expect(
      depths.filter(d => d.depth >= 3).map(d => `${d.name} at ${d.pointer}`),
      'NO REJECT VECTOR LANDS BELOW A REGION OBJECT. The closure at the nested levels is then '
      + `untested by this file. Measured depths: ${JSON.stringify(depths)}`,
    ).not.toEqual([]);
  });

  /**
   * ⚠ WHAT THESE VECTORS DO NOT REACH, recorded as an assertion so the silence
   * cannot be read as coverage. Every one of the ten cases declares
   * `"schema": 1`, so NO vector exercises the version rule, and
   * `parseRegionsDocument`'s own version sentence, which runs BEFORE the schema,
   * is never spoken here. Aurora's own rows for it are in
   * test/formats/regions-codec.test.ts. This is the exact shape the effects
   * vectors hit from the other side: two version cases arrived there, were
   * refused by the codec's own sentence, and tripped a row that had only ever
   * been correct because no vector exercised the rule.
   */
  it('NO vector exercises the schema-version rule, so the codec rows carry it alone', () => {
    const versions = CASES.map(c => c.doc.schema);
    expect(
      versions.filter(v => v !== 1),
      'a vector now exercises the version rule. That is good news and it means the reject rows '
      + 'above will be refused by the codec\'s OWN version sentence before the schema runs, so '
      + 'their pointer derivation no longer describes what the codec speaks. Re-read the rows.',
    ).toEqual([]);
  });
});

/**
 * CURRENCY, the question a pinned blob can never answer, asked at a committed
 * revision through git objects and skipping LOUDLY when it cannot run.
 */
describe('CURRENCY: are the vendored regions vectors still what empyrean publishes?', () => {
  const empyrean = peerRepo('empyrean');
  const NOT_OURS = 'NOT AN AURORA REGRESSION: the vendored regions vectors are stale.';

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
      + '  Re-vendor from the commit that LAST TOUCHED the path, not from the tip:\n'
      + `      git -C <empyrean> log ${TIP} -- ${PROV.empyrean.path}\n`
      + `      git -C <empyrean> show <that commit>:${PROV.empyrean.path} `
      + '> test/fixtures/regions/regions-vectors.json\n'
      + '  then update its provenance sidecar, and re-vendor the SCHEMA at the same revision.\n'
      + '  Diff the case set BY NAME and never by index.',
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
