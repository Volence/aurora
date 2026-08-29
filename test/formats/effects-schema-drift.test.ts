import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  SUPPORTED_KEYWORDS,
  collectSchemaKeywords,
  validateAgainstSchema,
  UnsupportedSchemaError,
  type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';
import { EFFECTS_SCENE_SCHEMA } from '../../src/core/formats/effects/scene';
import { peerRepo, resolveRev, readAtRev, isAncestor } from '../support/peer-repo';

/**
 * The vendored-schema drift gate.
 *
 * Aurora validates scene files against a copy of empyrean's
 * contract/schema/aurora-effects-scene.schema.json that lives in this repo at
 * src/core/formats/effects/aurora-effects-scene.schema.json.
 *
 * WHY VENDORED rather than read from the sibling empyrean checkout: core must
 * work from a lone Aurora clone, inside a git worktree (where ../../empyrean is
 * not where it is from master), and in a packaged Electron build where no
 * sibling repo is shipped at all. A path-probe design would degrade to "schema
 * not found → skip validation", which is the exact loud-on-unmeasurable failure
 * this suite is not allowed to have. The cost of vendoring is staleness, and
 * this file is the payment.
 *
 * WHAT THE PIN IS. The load-bearing invariant is the schema file's GIT BLOB
 * HASH — d4345af54ad61c841a7f1797cfddaf4dc0167f98 — not a commit citation. An
 * earlier pin, 2d7a9fee37d85334103ca1a3e03e1a40466d6d9c, was byte-identical
 * from empyrean 1326ceb (the merge landing the contract) through c2c81e2, while
 * the schema DOC moved twice underneath it (2f3b6fd, 069cf59) with no §2 change.
 * A commit pin would therefore read as drift that is not there; a blob hash
 * cannot drift out from under a commit citation.
 *
 * WHY IT MOVED. empyrean a32bcb03 applied CR-1: `v_factor` and `v_factor_fg`
 * were `$ref`'d to `$defs/factor` (the packed named-factor set) and are read by
 * the engine as plain 0..15 shift counts. `$defs/factor` itself is UNTOUCHED and
 * still governs `fa`, `fb` and `curve.to`. Re-vendored by extraction from that
 * commit, never retyped — ROADMAP item 35.
 *
 * WHY IT MOVED AGAIN (cab3ca58 → d4345af5). empyrean 5c930d6 bounded
 * `v_center` (0..32767) and `v_offset` (-32768..32767, SIGNED — it always was
 * in the engine's add.w; the unsigned type was the error). Nothing else in the
 * schema changed. Re-vendored by `git show 5c930d6:contract/schema/...`, never
 * retyped — ROADMAP item 37. The UI clamps for both fields read these bounds
 * out of the vendored file (scene-ui.ts `boundsAt`), so they cannot drift.
 *
 * WHY IT MOVED A THIRD TIME (d4345af5 -> 0f661b70). empyrean 277bc15 raised
 * `layers` maxItems from 8 to 16 -- the owner's parallax band-ceiling raise,
 * reaching this contract via aeon (S3K MGZ2 precedent). Exactly one line of the
 * schema changed; nothing else in it moved. Re-vendored by
 * `git show 277bc15:contract/schema/...`, never retyped, and the extracted
 * bytes hash to what that revision holds. Currency checked AT TIP as well as at
 * the named commit: `origin/main:contract/schema/...` is the same blob, so this
 * pin is current rather than merely correctly cited.
 *
 * WHY IT MOVED A FOURTH TIME (0f661b70 -> dd972cf0). empyrean 0bd4753 RETIRED
 * `precision`. This one is a DELETE, not a reservation, and the distinction is
 * the whole content of the change: aeon's engine deleted the STORAGE, not merely
 * the behaviour -- `engine/level/scene_dsl.emp:422-423` records `precision:
 * cell | line` (PRECISION_CELL / PRECISION_LINE and the `Scene.sc_precision`
 * field) as having "LIVED HERE until 2026-08-26", retired with the per-cell
 * HScroll path under owner ruling d-29-corrected, and `:1009` records
 * `sc_pad_5D` shrinking `u16 -> u8` to fill the byte `sc_precision` vacated.
 * Contrast `v_factor_fg`, which stays in the schema RESERVED because the runtime
 * will read it: a reserved slot is for a field that is coming, and this one is
 * gone. Owner ruling d-16 in docs/decisions.jsonl chose removal over reservation
 * for exactly that reason. The hub applied it to the shared contract; ROADMAP
 * row 59 is Aurora's half. Re-vendored by `git show 0bd4753:contract/schema/...`,
 * never retyped; the extracted bytes hash to what that revision holds, exactly
 * one line left the file, and currency was checked AT TIP as well as at the
 * named commit (`origin/main:contract/schema/...` is the same blob dd972cf0, and
 * 0bd4753 is an ancestor of origin/main). The anchor bound (8->16) and the
 * `left_column_mask` conditions that rode in on the same hub commit were ALREADY
 * vendored here by ROADMAP rows 56 and 58, which is why this re-pin is one line.
 *
 * AURORA DID NEED EDITS THIS TIME, unlike the layer-ceiling re-pin below, and by
 * design: `scene-ui.ts` read the enum out of the schema with
 * `stringEnumAt('properties','precision')`, so deleting the key makes that read
 * THROW at module load and take the suite with it. That is the derived-not-copied
 * design working as specified two paragraphs down ("EVERY READ IS LOUD") -- the
 * derivation was removed, not papered over with a fallback.
 *
 * NOTHING ELSE IN AURORA NEEDED AN EDIT, and that is a property worth stating
 * because it is the whole reason this vendoring design was chosen. Every layer
 * bound in the app is read from this file through `EFFECTS_LAYER_COUNT`
 * (scene-ui.ts) -- the Add-layer button's disabled test, the Remove floor, the
 * `Layers (n/m per scene)` section title and `layerCountLine`'s readout all
 * consume it, and `grep` finds no literal ceiling anywhere. Enumerated at the
 * re-pin rather than assumed: aeon's booking CLAIMED Aurora derived the cap and
 * flagged the claim as unverified by them; it is true, and it was checked here
 * by listing the consumers, not by trusting the claim.
 *
 * THE CONSUMER WAS STRICT WHEN THIS LANDED, which is what made landing first
 * safe rather than merely convenient. At aeon's pushed master d5fb9778 the
 * engine still asserts `MAX_PARALLAX_BANDS == 8` (scene_dsl.emp) and a scene
 * with more layers is a BUILD REFUSAL that names the count, not a truncation --
 * so an author who builds a 16-layer scene against an engine that has not
 * caught up gets a named error, never silently dropped layers. (Their own
 * ceiling-raise note also has the 15+ case measured: `Parallax_Init`'s `moveq`
 * immediate is a signed byte and must become a `move.w`, which sigil refuses by
 * name. Theirs to land; recorded here only because it is why the two halves
 * want to land close together.)
 *
 * WHY IT MOVED A FIFTH TIME (dd972cf0 -> 4adfbb40). empyrean 988638f added
 * `$defs.layer.properties.drift` — a per-layer, camera-independent horizontal
 * rate, `"none" | {rate}` in the same `oneOf` shape as `curve` and `vsplit`,
 * per aeon's band-drift design §7 at aeon e0ce6011.
 *
 * AND THIS RE-PIN CARRIED A HAZARD THE OTHERS DID NOT. The same commit reflowed
 * the WHOLE FILE to one key per line, so its diff is 365 insertions / 81
 * deletions for a one-field change — a shape that invites "looks like a
 * reformat, ship it" and would hide a real change inside it. The two were
 * separated by MEASUREMENT, not by reading the diff: a recursive comparison of
 * the two PARSED documents (988638f~1 vs 988638f), key by key at every depth,
 * reports exactly one difference, the added `drift` node. Both documents were
 * extracted with `git show`; neither was retyped. See
 * docs/reviews/2026-08-29-drift-codec.md.
 *
 * AURORA NEEDED TWO EDITS, both of which THIS SUITE NAMED rather than a human
 * noticing: the coverage gate below went red on `not` (the schema spells "0 is
 * refused" as `"not": {"const": 0}`, and this evaluator implemented no such
 * keyword — refusing to validate rather than ignoring it, exactly as designed),
 * and the shape-coverage golden went red naming `drift` (effects-scene-golden
 * derives "every declared layer key is exercised" from the schema).
 *
 * WHAT THIS GATE CANNOT DO, said plainly: it proves the vendored copy is
 * byte-identical to the blob Aurora pinned. It cannot, on its own, notice that
 * empyrean has since changed the schema — a pin equals itself by construction.
 * That question has its own instrument now, the CURRENCY block at the bottom of
 * this file, which reads empyrean at a COMMITTED revision through git objects
 * (never the sibling working tree — docs/reviews/2026-08-28-golden-live-tree.md)
 * and SKIPS LOUDLY when it cannot run. Re-pinning itself stays a deliberate step
 * of the contract's own change protocol (§8: the doc, the schema and aeon's
 * consumer list amend together, and Aurora re-pins).
 *
 * WHERE THE PIN LIVES. In the sidecar, `aurora-effects-scene.schema.provenance.json`,
 * read below — NOT as a constant here. It used to be a `const` in this file,
 * with prose copies in scene.ts's header and effects-scene-golden's header;
 * scene.ts's copy went THREE re-pins stale without anything going red, because
 * nothing hashes a comment. One machine-readable copy, and the prose says it is
 * prose.
 */

const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.json',
);
const PROVENANCE_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.provenance.json',
);

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  empyrean: { path: string; revision: string; blob: string; branch_that_answers_currency: string };
  vendored: { git_blob: string; bytes: number };
};

/** empyrean contract/schema/aurora-effects-scene.schema.json, blob hash. */
const PINNED_BLOB = PROV.empyrean.blob;

/** git's object id: sha1 over "blob <bytelen>\0" + the file's bytes. */
function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
}

describe('effects scene schema — vendored copy drift gate', () => {
  it('the vendored schema is byte-identical to the pinned contract blob', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    // Anti-vacuous: we hashed a real schema, not an empty or missing file.
    expect(bytes.length).toBeGreaterThan(1000);
    expect(JSON.parse(bytes.toString('utf8')).$id)
      .toBe('https://empyrean/contract/aurora-effects-scene.schema.json');
    expect(PINNED_BLOB, 'the sidecar records no 40-hex empyrean blob').toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(bytes)).toBe(PINNED_BLOB);
  });

  /**
   * The sidecar cannot describe a file other than the one on disk. Catches a
   * schema edited by hand to make something else pass, and a provenance record
   * edited away from it. `empyrean.blob` and `vendored.git_blob` are the same
   * object id said twice on purpose — one is "what empyrean stores", the other
   * "what Aurora holds", and the whole vendoring claim is that they are equal.
   */
  it('the provenance sidecar describes the schema actually on disk', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    expect(PROV.empyrean.revision, 'no 40-hex empyrean revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.empyrean.path).toBe('contract/schema/aurora-effects-scene.schema.json');
    expect(PROV.vendored.git_blob).toBe(PROV.empyrean.blob);
    expect(PROV.vendored.bytes).toBe(bytes.length);
  });

  it('the module validates against the vendored file, not a restatement', () => {
    // EFFECTS_SCENE_SCHEMA must BE the file on disk, so the hash above pins
    // what the codec actually uses. Compare parsed values: the import goes
    // through the bundler, so identity of the object is not the question.
    const onDisk = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    expect(EFFECTS_SCENE_SCHEMA).toEqual(onDisk);
  });

  /**
   * The subset evaluator's coverage gate. Every keyword appearing anywhere in
   * the committed schema must be one this evaluator implements. Derived by
   * walking the schema — not a hand list — so a future amendment that
   * introduces `allOf` / `if` / `patternProperties` fails HERE, loudly, instead
   * of being silently ignored by an evaluator that does not know the keyword.
   */
  it('every keyword in the committed schema is implemented', () => {
    const used = collectSchemaKeywords(EFFECTS_SCENE_SCHEMA);
    // Anti-vacuous: the walk really found the schema's keywords.
    expect(used.size).toBeGreaterThan(10);
    expect(used.has('unevaluatedProperties')).toBe(true);
    expect(used.has('oneOf')).toBe(true);
    expect([...used].filter(k => !SUPPORTED_KEYWORDS.has(k))).toEqual([]);
  });

  /**
   * The evaluator implements `unevaluatedProperties: false` as
   * `additionalProperties: false`. That is exact only while no in-place
   * applicator sits beside it (an applicator can contribute the "evaluated"
   * annotations the keyword is defined against). The evaluator asserts the
   * precondition at every schema object it meets; this proves the assertion
   * fires rather than being decorative.
   */
  it('refuses unevaluatedProperties beside an in-place applicator', () => {
    const bad: JsonSchema = {
      type: 'object',
      allOf: [{ type: 'object' }],
      properties: { a: { type: 'string' } },
      unevaluatedProperties: false,
    };
    // `allOf` is itself unimplemented, so the unknown-keyword guard is what
    // fires first — either way it REFUSES, which is the property under test.
    expect(() => validateAgainstSchema({ a: 'x' }, bad)).toThrow(UnsupportedSchemaError);

    const withRef: JsonSchema = {
      $defs: { base: { type: 'object' } },
      type: 'object',
      oneOf: [{ type: 'object' }],
      properties: { a: { type: 'string' } },
      unevaluatedProperties: false,
    };
    expect(() => validateAgainstSchema({ a: 'x' }, withRef))
      .toThrow(/in-place applicator "oneOf"/);
  });

  it('refuses a keyword it does not implement rather than ignoring it', () => {
    const bad: JsonSchema = { type: 'object', patternProperties: { '^x': { type: 'string' } } };
    expect(() => validateAgainstSchema({ xa: 1 }, bad))
      .toThrow(/"patternProperties".*is not implemented/s);
  });

  /**
   * `not` — implemented at empyrean 988638f's re-pin, because `drift.rate`
   * spells "0 is refused" as a hole in a range and no other keyword in this
   * subset can express one.
   *
   * ASSERTED ON THE COMMITTED SCHEMA'S OWN NODE, not on a hand-built fragment:
   * a locally written `{not: {const: 0}}` would prove the evaluator can do
   * something, not that it does it to the field that needs it.
   */
  it('implements `not` as a refusal, on the committed schema\'s own rate node', () => {
    const layer = (EFFECTS_SCENE_SCHEMA.$defs as Record<string, JsonSchema>).layer;
    const drift = (layer.properties as Record<string, JsonSchema>).drift;
    const rateForm = (drift.oneOf as JsonSchema[])
      .find(b => (b.properties as Record<string, unknown> | undefined)?.rate !== undefined);
    // Anti-vacuous: the branch really exists and really carries a `not`.
    expect(rateForm, 'no drift branch declares `rate`').toBeDefined();
    const rate = (rateForm!.properties as Record<string, JsonSchema>).rate;
    expect(rate.not).toEqual({ const: 0 });

    // The excluded value is refused, and the message names it.
    const refused = validateAgainstSchema(0, rate, EFFECTS_SCENE_SCHEMA);
    expect(refused).toHaveLength(1);
    expect(refused[0].message).toMatch(/forbids the constant 0/);

    // ...and a neighbouring value is not, so this is a hole and not a wall.
    expect(validateAgainstSchema(1, rate, EFFECTS_SCENE_SCHEMA)).toEqual([]);
    expect(validateAgainstSchema(-1, rate, EFFECTS_SCENE_SCHEMA)).toEqual([]);
  });
});

/**
 * CURRENCY — the question a pinned blob can never answer, for the SCHEMA.
 *
 * The gate above proves the vendored copy equals the blob Aurora pinned; it
 * equals itself by construction and so can never notice that empyrean has moved
 * on. This block asks the other question, under the three rules
 * test/formats/aeon-fixture-currency.test.ts established for the aeon fixture
 * (docs/reviews/2026-08-28-golden-live-tree.md):
 *
 *   1. Read empyrean at a COMMITTED REVISION through git objects. Never the
 *      sibling working tree — on this machine `../empyrean` is a peer lane's
 *      live checkout, and a test that opens it by path has its colour decided
 *      by whatever that peer has not committed yet.
 *   2. NAME the revision it read, in every message.
 *   3. When it cannot run — no empyrean checkout, branch unfetched — SKIP
 *      LOUDLY, saying what could not be measured. Never green-and-silent.
 *
 * A failure here is NOT an Aurora regression: it means the contract moved and
 * the pin needs re-vendoring. The message says how.
 */
describe('CURRENCY: is the vendored schema still what empyrean publishes?', () => {
  const empyrean = peerRepo('empyrean');
  const TIP = PROV.empyrean.branch_that_answers_currency;
  const NOT_OURS = 'NOT AN AURORA REGRESSION — the vendored effects contract schema is stale.';

  it(`matches ${PROV.empyrean.path} at empyrean ${TIP}`, (ctx) => {
    if (empyrean === null) {
      ctx.skip('SKIPPED, NOT PASSED: no empyrean checkout beside this repo (set '
        + 'AURORA_EMPYREAN_REPO) — CANNOT MEASURE whether the pin '
        + `${PROV.empyrean.revision} is still current`);
      return;
    }
    const tip = resolveRev(empyrean, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${empyrean} — CANNOT MEASURE `
        + `currency of pin ${PROV.empyrean.revision}`);
      return;
    }
    const at = readAtRev(empyrean, tip, PROV.empyrean.path);
    // Not a skip: the revision resolved, so this WAS measured, and "the contract
    // schema is gone at empyrean's tip" is drift of the loudest kind.
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    expect(
      at.blob,
      `${NOT_OURS}\n`
      + `  pinned at empyrean ${PROV.empyrean.revision} (blob ${PROV.empyrean.blob})\n`
      + `  empyrean ${TIP} is now ${tip} (blob ${at.blob})\n`
      + `  ${PROV.empyrean.path} changed between them.\n`
      + `  Re-vendor:  git -C ${empyrean} show ${tip}:${PROV.empyrean.path} `
      + '> src/core/formats/effects/aurora-effects-scene.schema.json\n'
      + '  then update src/core/formats/effects/aurora-effects-scene.schema.provenance.json,\n'
      + '  and let the coverage gate and the golden\'s derived key sweeps tell you what else moved.',
    ).toBe(PROV.empyrean.blob);
  });

  /**
   * The revision you PINNED AT is an anchor too, and it is the one nobody
   * checks, because it reads as provenance rather than payload. A pin at a
   * local-only SHA looks perfect from this machine and is unresolvable from
   * anywhere else.
   */
  it('the pinned empyrean revision is PUBLISHED, not local-only', (ctx) => {
    if (empyrean === null) {
      ctx.skip('SKIPPED, NOT PASSED: no empyrean checkout beside this repo — CANNOT MEASURE '
        + `whether ${PROV.empyrean.revision} is reachable from ${TIP}`);
      return;
    }
    const tip = resolveRev(empyrean, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${empyrean} — CANNOT MEASURE `
        + 'reachability');
      return;
    }
    expect(
      isAncestor(empyrean, PROV.empyrean.revision, tip),
      `${PROV.empyrean.revision} is NOT reachable from empyrean ${TIP} (${tip}) — local-only, or `
      + 'the branch was rewritten; a peer cannot check a pin at a SHA they cannot fetch',
    ).toBe(true);
  });
});
