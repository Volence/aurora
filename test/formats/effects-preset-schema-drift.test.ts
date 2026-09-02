// The vendored PRESET-schema drift gate — the scene gate's twin.
//
// It answers three separate questions, and they are separate on purpose:
//
//   1. Is the vendored copy the blob Aurora pinned?  (byte identity)
//   2. Does the sidecar describe the file on disk?   (no hand-edited provenance)
//   3. Is that pin still what empyrean publishes?    (CURRENCY — the question a
//                                                     pinned blob can never
//                                                     answer about itself)
//
// A failure in (3) is NOT an Aurora regression: the contract moved and the pin
// needs re-vendoring. The message says how.
//
// AND ONE MORE THIS FILE OWNS THAT THE SCENE GATE DOES NOT: whether aeon's
// WORKED EXAMPLE still agrees with the schema. aeon's page says of itself that
// the schema and effects_gen.py win over it — so a disagreement is not a build
// break anywhere, it is a silent invitation to write a panel against the wrong
// field names. The parcel's brief asked to hear about one immediately; this is
// the thing that would notice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  SUPPORTED_KEYWORDS, collectSchemaKeywords, assertSchemaSupported, validateAgainstSchema,
  canonicalizeBySchema, UnsupportedSchemaError, type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';
import {
  EFFECTS_PRESET_SCHEMA, EFFECTS_PRESET_BAND_KEYS, EFFECTS_PRESET_ON_ARMS,
  EFFECTS_PRESET_RESERVED_KEYS, EFFECTS_PRESET_ROOT_KEYS, presetArmFields,
} from '../../src/core/formats/effects/preset';
import { PRESET_KEYS_AWAITING_AEON } from '../../src/core/formats/effects/preset-lag';
import { peerRepo, resolveRev, readAtRev, isAncestor } from '../support/peer-repo';

const SCHEMA_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.json',
);
const PROVENANCE_PATH = resolve(
  __dirname, '../../src/core/formats/effects/aurora-effects-preset.schema.provenance.json',
);

const PROV = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8')) as {
  empyrean: { path: string; revision: string; blob: string; branch_that_answers_currency: string };
  vendored: { git_blob: string; bytes: number };
  the_worked_example_is_not_an_authority: { page: string };
};

/** git's object id: sha1 over "blob <bytelen>\0" + the file's bytes. */
function gitBlobHash(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
}

describe('raster preset schema — vendored copy drift gate', () => {
  it('the vendored schema is byte-identical to the pinned contract blob', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    // Anti-vacuous: we hashed a real schema, not an empty or missing file.
    expect(bytes.length).toBeGreaterThan(1000);
    expect(JSON.parse(bytes.toString('utf8')).$id)
      .toBe('https://empyrean/contract/aurora-effects-preset.schema.json');
    expect(PROV.empyrean.blob, 'the sidecar records no 40-hex empyrean blob')
      .toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobHash(bytes)).toBe(PROV.empyrean.blob);
  });

  it('the provenance sidecar describes the schema actually on disk', () => {
    const bytes = readFileSync(SCHEMA_PATH);
    expect(PROV.empyrean.revision, 'no 40-hex empyrean revision').toMatch(/^[0-9a-f]{40}$/);
    expect(PROV.empyrean.path).toBe('contract/schema/aurora-effects-preset.schema.json');
    expect(PROV.vendored.git_blob).toBe(PROV.empyrean.blob);
    expect(PROV.vendored.bytes).toBe(bytes.length);
  });

  it('the module validates against the vendored file, not a restatement', () => {
    const onDisk = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    expect(EFFECTS_PRESET_SCHEMA).toEqual(onDisk);
  });

  /**
   * The subset evaluator's coverage gate, on THIS schema. Derived by walking it
   * — not a hand list — so an amendment introducing a keyword the evaluator
   * does not implement fails HERE, loudly, rather than being silently ignored.
   */
  it('every keyword in the committed preset schema is implemented', () => {
    const used = collectSchemaKeywords(EFFECTS_PRESET_SCHEMA);
    // Anti-vacuous: the walk really found the schema's keywords.
    expect(used.size).toBeGreaterThan(10);
    expect(used.has('unevaluatedProperties')).toBe(true);
    expect(used.has('oneOf')).toBe(true);
    expect([...used].filter((k) => !SUPPORTED_KEYWORDS.has(k))).toEqual([]);
  });

  /**
   * ═══ THE KEYWORD CENSUS ABOVE WAS GREEN ON A SCHEMA THE EVALUATOR REFUSED ═══
   *
   * At the 12aecd5 re-vendor, `cycles` arrived spelled `"type": ["array",
   * "null"]`. `type` is an implemented keyword NAME, so the census passed; the
   * refusal of a type ARRAY lived inside validateNode and only fired on a node a
   * DOCUMENT reached. Every bands-only document parsed. The first document with
   * a `cycles` key threw `UnsupportedSchemaError: type arrays are not implemented
   * (at /cycles)` — the exact partial-coverage shape the evaluator's header
   * promises not to have. This row asks the stronger question: run the per-node
   * check over EVERY node, reachable or not.
   */
  it('every NODE of the committed preset schema passes the evaluator\'s per-node check', () => {
    // Anti-vacuous: the construct that motivated this row really is in the
    // schema, so a green here is a green on a type array.
    const cycles = (EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).cycles;
    expect(Array.isArray(cycles.type)).toBe(true);
    expect(() => assertSchemaSupported(EFFECTS_PRESET_SCHEMA)).not.toThrow();
    // ...and the walk really refuses, on a schema whose only defect is one the
    // census cannot see.
    const censusBlind: JsonSchema = {
      type: 'object',
      properties: { a: { type: 'object' }, b: { type: ['array', 'bignum'] } },
    };
    expect([...collectSchemaKeywords(censusBlind)].filter((k) => !SUPPORTED_KEYWORDS.has(k)))
      .toEqual([]);
    expect(() => assertSchemaSupported(censusBlind))
      .toThrow(/type "bignum" at \/properties\/b is not implemented/);
  });

  /**
   * `type` as an ARRAY — implemented at the 12aecd5 re-vendor, because `cycles`
   * has THREE states and two of them are JSON types: absent (keep the hand-
   * authored cycle), null (cycling OFF, the Pal_Cycle_None sentinel), array
   * (the script). Asserted on the committed schema's own `cycles` node, not a
   * hand-built fragment, and on BOTH sides: what it must refuse, refused; what
   * it must accept, accepted.
   */
  it('implements a type ARRAY, on the committed schema\'s own cycles node', () => {
    const cycles = (EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).cycles;
    expect(cycles.type).toEqual(['array', 'null']);
    const root = EFFECTS_PRESET_SCHEMA;

    // ACCEPTS both spellings the schema names.
    expect(validateAgainstSchema(null, cycles, root)).toEqual([]);
    expect(validateAgainstSchema([{ line: 2, first: 8, count: 4, period: 8 }], cycles, root))
      .toEqual([]);

    // REFUSES every other JSON type, naming both alternatives in one sentence.
    for (const wrong of [0, 'off', false, {}]) {
      const issues = validateAgainstSchema(wrong, cycles, root);
      expect(issues.map((i) => i.message)).toEqual([`expected array or null, got ${
        wrong === null ? 'null' : Array.isArray(wrong) ? 'array' : typeof wrong}`]);
    }
    // ...and a wrong type does NOT cascade into the items check.
    expect(validateAgainstSchema('off', cycles, root)).toHaveLength(1);
    // ...and the array branch still validates its items — the type array did
    // not turn `items` off.
    expect(validateAgainstSchema([{ line: 2 }], cycles, root).map((i) => i.path))
      .toEqual(['/0', '/0', '/0']);

    // The canonicalizer carries a null through the type array untouched.
    expect(canonicalizeBySchema(null, cycles, root)).toBeNull();
  });

  /**
   * The one-slot-of-null shape `variants` uses: `items: { oneOf: [ {$ref},
   * {type: null} ] }`. Nothing new had to be implemented for it — `oneOf`,
   * `$ref` and `type: null` were all there — but "nothing new" is exactly the
   * claim that deserves a row, on the committed node.
   */
  it('keeps a null slot in `variants` at its index, on the committed schema\'s own node', () => {
    const variants = (EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).variants;
    const root = EFFECTS_PRESET_SCHEMA;
    const arms = ((variants.items as JsonSchema).oneOf as JsonSchema[]);
    expect(arms.map((a) => a.$ref ?? a.type)).toEqual(['#/$defs/pal_variant', 'null']);

    const doc = [null, { shift_r: 1, shift_g: 1 }, null];
    expect(validateAgainstSchema(doc, variants, root)).toEqual([]);
    expect(canonicalizeBySchema(doc, variants, root)).toEqual(doc);
    // A string is neither arm, and the refusal lands on the slot's index.
    expect(validateAgainstSchema(['Variant_Water_Deep'], variants, root).map((i) => i.path))
      .toEqual(['/0']);
    // A variant object with an unknown key is refused THROUGH the $ref arm.
    expect(validateAgainstSchema([{ shift_q: 1 }], variants, root)
      .some((i) => /shift_q/.test(i.message))).toBe(true);
  });

  it('the walker refuses a $ref that does not resolve, and an empty type array', () => {
    expect(() => assertSchemaSupported({ items: { $ref: '#/$defs/nowhere' } }))
      .toThrow(UnsupportedSchemaError);
    expect(() => assertSchemaSupported({ properties: { a: { type: [] } } }))
      .toThrow(/empty type array at \/properties\/a/);
  });

  /**
   * The shape this schema is the FIRST committed contract to use, asserted on
   * the committed schema's own node rather than a hand-built fragment: a locally
   * written `oneOf`+`unevaluatedProperties` would prove the evaluator can do
   * something, not that it does it to the node that needs it.
   */
  it('validates the exactly-one-arm node the schema really declares', () => {
    const band = (EFFECTS_PRESET_SCHEMA.$defs as Record<string, JsonSchema>).band;
    const on = (band.properties as Record<string, JsonSchema>).on;
    // Anti-vacuous: this really is the oneOf + unevaluatedProperties node.
    expect(on.unevaluatedProperties).toBe(false);
    expect((on.oneOf as JsonSchema[]).map((b) => (b.required as string[])[0]).sort())
      .toEqual(['cram', 'pal_region']);

    const root = EFFECTS_PRESET_SCHEMA;
    const oneArm = { cram: { addr: 74, colours: [14] } };
    expect(validateAgainstSchema(oneArm, on, root)).toEqual([]);
    // Zero, two and unknown arms are all refused by the schema itself.
    expect(validateAgainstSchema({}, on, root)).not.toEqual([]);
    expect(validateAgainstSchema(
      { cram: { addr: 74, colours: [14] }, pal_region: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 } },
      on, root)).not.toEqual([]);
    expect(validateAgainstSchema({ vsram: { addr: 0 } }, on, root)).not.toEqual([]);
  });
});

/**
 * CURRENCY — the question a pinned blob can never answer.
 *
 * Under the three rules the aeon-fixture gate established: read the peer at a
 * COMMITTED REVISION through git objects (never the sibling working tree — on
 * this machine `../empyrean` is a peer lane's live checkout); NAME the revision
 * in every message; and when it cannot run, SKIP LOUDLY rather than green.
 */
describe('CURRENCY: is the vendored preset schema still what empyrean publishes?', () => {
  const empyrean = peerRepo('empyrean');
  const TIP = PROV.empyrean.branch_that_answers_currency;
  const NOT_OURS = 'NOT AN AURORA REGRESSION — the vendored preset contract schema is stale.';

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
    expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
    if (!at.ok) return;
    expect(
      at.blob,
      `${NOT_OURS}\n`
      + `  pinned at empyrean ${PROV.empyrean.revision} (blob ${PROV.empyrean.blob})\n`
      + `  empyrean ${TIP} is now ${tip} (blob ${at.blob})\n`
      + `  ${PROV.empyrean.path} changed between them.\n`
      + `  Re-vendor:  git -C ${empyrean} show ${tip}:${PROV.empyrean.path} `
      + '> src/core/formats/effects/aurora-effects-preset.schema.json\n'
      + '  then update the provenance sidecar, and let the coverage gate and the derived\n'
      + '  constants in preset.ts tell you what else moved.',
    ).toBe(PROV.empyrean.blob);
  });

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

/**
 * DOES AEON'S WORKED EXAMPLE STILL AGREE WITH THE SCHEMA?
 *
 * ═══ WHY THIS IS A TEST AND NOT A ONE-TIME READING ═══
 *
 * aeon's `docs/EDITOR_RASTER_PRESETS.md` §B carries a machine-checked key list —
 * their own `tools/test_effects_gen.py::TestEditorRasterPresetsDoc` reads it out
 * of the page and compares it against `effects_gen.py`'s `PRESET_KEYS` /
 * `BAND_KEYS` / `BAND_ON_ARMS` on every build. So a wrong field NAME there fails
 * AEON's build, and Aurora is protected from transcription drift.
 *
 * What that check does NOT do is compare the page to THIS schema. aeon's page is
 * explicit that where it and the schema disagree, the schema and effects_gen.py
 * win — which means a disagreement would break nothing anywhere and silently
 * invite the next panel author to build against the wrong half. This row is the
 * thing that would notice, and it reads the page's OWN machine-checked block
 * rather than any prose around it.
 *
 * At the 6664b61 landing the two AGREED, field for field (recorded in
 * docs/reviews/2026-08-29-band-preset-panel.md).
 *
 * ═══ AT THE 12aecd5 RE-VENDOR THEY DO NOT, AND THE DIRECTION IS THE CONTRACT'S ═══
 *
 * The schema now DECLARES `cycles` and `variants` and reserves only `fires`;
 * aeon's page and `effects_gen.py` at origin/master 15efabca still REFUSE all
 * three by name. That is the contract leading its consumer — empyrean's vectors
 * say so in their own `$comment` ("the contract leads and aeon's
 * tools/effects_gen.py implements against it, the direction section 8
 * requires") — and it is a LAG, not a contradiction: nothing aeon lowers is a
 * name the schema does not declare, and nothing the schema reserves is a name
 * aeon lowers. So the rows below assert the invariants that hold ACROSS a lag
 * (same vocabulary on both sides; aeon refuses at least what the schema
 * reserves; whatever else aeon refuses is a key the schema declares), and the
 * last row NAMES the lag as it stood, so the day aeon catches up is a red row
 * here and not a silent green.
 */
describe('aeon\'s worked example vs the schema (the schema wins; this reports a split)', () => {
  const aeon = peerRepo('aeon');
  const PAGE = 'docs/EDITOR_RASTER_PRESETS.md';
  const TIP = 'origin/master';

  /** Parse the page's `<!-- KEYS-CHECKED-AGAINST-effects_gen.py -->` block. */
  function pageKeys(text: string): Record<string, string[]> | null {
    const block = /<!-- KEYS-CHECKED-AGAINST-effects_gen\.py -->\s*```([\s\S]*?)```/.exec(text);
    if (!block) return null;
    const out: Record<string, string[]> = {};
    for (const line of block[1].split('\n')) {
      const m = /^([a-z._-]+):\s+(.+)$/.exec(line.trim());
      if (!m) continue;
      out[m[1]] = m[2].split(',').map((s) => s.trim()).filter((s) => s.length > 0).sort();
    }
    return out;
  }

  /**
   * The page's key block, or the reason it could not be read. Resolved ONCE at
   * collection so the lag row's title can name what it found; the rows below
   * skip loudly on the not-measurable outcomes and fail on the measured ones.
   */
  type PageRead =
    | { kind: 'skip'; why: string }
    | { kind: 'fail'; why: string }
    | { kind: 'ok'; tip: string; keys: Record<string, string[]> };
  function readPage(): PageRead {
    if (aeon === null) {
      return { kind: 'skip', why: 'SKIPPED, NOT PASSED: no aeon checkout beside this repo (set '
        + 'AURORA_AEON_REPO) — CANNOT MEASURE whether aeon\'s worked example still agrees with '
        + 'the schema' };
    }
    const tip = resolveRev(aeon, TIP);
    if (tip === null) {
      return { kind: 'skip', why: `SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} — `
        + 'CANNOT MEASURE agreement with aeon\'s page' };
    }
    const at = readAtRev(aeon, tip, PAGE);
    // Not a skip: the revision resolved, so this WAS measured, and the page
    // vanishing from aeon's tip is a fact worth failing on.
    if (!at.ok) return { kind: 'fail', why: `aeon ${tip}: ${at.why}` };
    const keys = pageKeys(at.text);
    // Not a skip either: the page is there and its machine-checked block is not.
    // That is exactly the drift this row exists to catch.
    if (keys === null) {
      return { kind: 'fail', why: `${PAGE} at aeon ${tip} no longer carries its `
        + 'KEYS-CHECKED-AGAINST-effects_gen.py block — the one part of that page that cannot '
        + 'rot silently has been removed' };
    }
    return { kind: 'ok', tip, keys };
  }
  const page = readPage();

  /** Runs `body` on a measured page; skips loudly or fails on the other outcomes. */
  function onPage(ctx: { skip: (why: string) => void }, body: (p: PageRead & { kind: 'ok' }) => void): void {
    if (page.kind === 'skip') { ctx.skip(page.why); return; }
    expect(page.kind, page.kind === 'fail' ? page.why : '').toBe('ok');
    if (page.kind !== 'ok') return;
    body(page);
  }

  const SPLIT = (tip: string): string => `A SPLIT BETWEEN aeon ${PAGE} (at ${tip}) AND `
    + `${PROV.empyrean.path} (blob ${PROV.empyrean.blob}). THE SCHEMA WINS — but report this: `
    + 'aeon asked to hear about it immediately.';

  // The schema's own account of its root, derived: what it requires, what it
  // declares without constraining (the writer-owned `name`: a property node
  // carrying no assertion keyword), and what it declares beyond both.
  const rootProps = EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>;
  const schemaRequired = [...(EFFECTS_PRESET_SCHEMA.required as string[])].sort();
  const schemaIgnored = Object.keys(rootProps)
    .filter((k) => Object.keys(rootProps[k]).every((kw) => kw === 'description' || kw === 'title'))
    .sort();
  const schemaOptional = Object.keys(rootProps)
    .filter((k) => !schemaRequired.includes(k) && !schemaIgnored.includes(k)).sort();
  const schemaReserved = [...EFFECTS_PRESET_RESERVED_KEYS];

  it(`agrees with ${PAGE} at aeon ${TIP} on every shape the schema and the page both spell`, (ctx) => {
    onPage(ctx, ({ tip, keys }) => {
      // Anti-vacuous: the derivations partitioned the root the way the schema
      // is known to spell it at this landing — three required, one ignored,
      // the rest optional — and EFFECTS_PRESET_ROOT_KEYS agrees.
      expect(schemaRequired).toHaveLength(3);
      expect(schemaIgnored).toEqual(['name']);
      expect(schemaOptional.length).toBeGreaterThan(0);
      expect([...schemaRequired, ...schemaIgnored, ...schemaOptional].sort())
        .toEqual([...EFFECTS_PRESET_ROOT_KEYS].sort());

      expect(keys.preset, SPLIT(tip)).toEqual(schemaRequired);
      expect(keys['preset-ignored'], SPLIT(tip)).toEqual(schemaIgnored);
      expect(keys.band, SPLIT(tip)).toEqual([...EFFECTS_PRESET_BAND_KEYS].sort());
      expect(keys['on-arms'], SPLIT(tip)).toEqual([...EFFECTS_PRESET_ON_ARMS].sort());
      expect(keys['on.cram'], SPLIT(tip)).toEqual([...presetArmFields('cram')].sort());
      expect(keys['on.pal_region'], SPLIT(tip)).toEqual([...presetArmFields('pal_region')].sort());
    });
  });

  it('the two sides know the SAME root vocabulary, and aeon refuses at least what the schema reserves', (ctx) => {
    onPage(ctx, ({ tip, keys }) => {
      const pageVocabulary = [...keys.preset, ...keys['preset-ignored'], ...keys['preset-refused']].sort();
      const schemaVocabulary = [...EFFECTS_PRESET_ROOT_KEYS, ...schemaReserved].sort();
      // A name one side knows and the other does not is a rename or a typo —
      // a real split, whichever direction the lag runs.
      expect(pageVocabulary, SPLIT(tip)).toEqual(schemaVocabulary);
      // A name the schema still RESERVES must not be one aeon claims to lower.
      for (const reserved of schemaReserved) {
        expect(keys['preset-refused'], `${SPLIT(tip)} aeon lowers "${reserved}", which the schema `
          + 'still reserves').toContain(reserved);
      }
      // Whatever ELSE aeon refuses is a key the schema declares and aeon has not
      // built yet — the contract-leads-consumer lag, never an unknown name.
      const lag = keys['preset-refused'].filter((k) => !schemaReserved.includes(k));
      expect(lag.filter((k) => !schemaOptional.includes(k)), SPLIT(tip)).toEqual([]);
    });
  });

  /**
   * THE LAG, NAMED. A pinned expectation on purpose — the same kind of pin the
   * CURRENCY rows keep — whose job is to go red the day it stops being true.
   * When aeon lands its half of item 5 (effects_gen.py lowering cycles and
   * variants, the page's `preset-refused` row shrinking to `fires`), this row
   * fails: empty `PRESET_KEYS_AWAITING_AEON` (or delete it and this row
   * together), and re-read docs/reviews for anything that quoted the lag.
   *
   * THE PIN LIVES IN src/, NOT HERE. `PRESET_KEYS_AWAITING_AEON`
   * (core/formats/effects/preset-lag.ts) is the premise of the band-preset
   * panel's "not consumed by the engine yet" sentence, and this row is its
   * MEASUREMENT: one fact, hand-typed once, measured here, rendered there.
   * The row carries no copy of the names, so the sentence cannot say one thing
   * while the test asserts another. `preset-lag-disclosure.test.ts` checks
   * from the other side that this row still exists while the premise does.
   */
  it(`the contract-leads-consumer lag at aeon ${page.kind === 'ok' ? page.tip.slice(0, 8) : TIP} is `
     + 'exactly PRESET_KEYS_AWAITING_AEON, the panel\'s disclosure premise (goes red when aeon catches up)', (ctx) => {
    onPage(ctx, ({ tip, keys }) => {
      // Anti-vacuous: a premise with nothing in it has no business being
      // measured — if aeon has caught up, retire the constant AND this row.
      expect(PRESET_KEYS_AWAITING_AEON.length, 'PRESET_KEYS_AWAITING_AEON is empty: the disclosure '
        + 'has retired, so delete this row with it').toBeGreaterThan(0);
      const lag = keys['preset-refused'].filter((k) => !schemaReserved.includes(k)).sort();
      expect(lag, `the lag between ${PROV.empyrean.path} (blob ${PROV.empyrean.blob}) and aeon `
        + `${PAGE} at ${tip} has MOVED away from PRESET_KEYS_AWAITING_AEON. If it is now empty, `
        + 'aeon has built item 5: empty the constant (the panel\'s sentence retires with it) and '
        + 'delete this row. If it is something else, that is a split to report.')
        .toEqual([...PRESET_KEYS_AWAITING_AEON].sort());
    });
  });
});
