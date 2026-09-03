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
  EFFECTS_PRESET_RESERVED_KEYS, EFFECTS_PRESET_ROOT_KEYS, presetArmFields, presetDefFields,
} from '../../src/core/formats/effects/preset';
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

  /**
   * ═══ THE d36d704 AMENDMENT FORCED NO EVALUATOR EDIT — MEASURED, NOT ASSUMED ═══
   *
   * The 12aecd5 re-vendor's lesson was that a keyword NAME can be implemented
   * while a VALUE SHAPE of it is not, and that only the walk sees the shape. So
   * "nothing new was needed for `patch_world_ys` / `patch_motion`" is a claim
   * that has to be made on the committed nodes themselves, with the constructs
   * the amendment actually uses named, or it is a claim about a schema nobody
   * ran. The two rows below do that on both new root nodes.
   */
  it('keeps a null slot in `patch_world_ys`, and refuses the sentinel written as an integer', () => {
    const seeds = (EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).patch_world_ys;
    const root = EFFECTS_PRESET_SCHEMA;
    const arms = ((seeds.items as JsonSchema).oneOf as JsonSchema[]);
    // Anti-vacuous: this really is the integer-or-null shape with a hole in it.
    expect(arms.map((a) => a.type)).toEqual(['integer', 'null']);
    expect((arms[0].not as JsonSchema).const).toBe(32767);
    expect(seeds.maxItems).toBe(4);

    // aeon §2.2's own example, and the nulls stay at their index.
    const doc = [224, 314, null, null];
    expect(validateAgainstSchema(doc, seeds, root)).toEqual([]);
    expect(canonicalizeBySchema(doc, seeds, root)).toEqual(doc);
    // A SHORT array is legal — an index the array does not reach keeps the
    // section's hand-authored channel, so the writer must never pad to 4.
    expect(validateAgainstSchema([224], seeds, root)).toEqual([]);
    // The three refusals the schema owns, each on its own value.
    expect(validateAgainstSchema([32767], seeds, root).map((i) => i.path)).toEqual(['/0']);
    expect(validateAgainstSchema([65536], seeds, root).map((i) => i.path)).toEqual(['/0']);
    expect(validateAgainstSchema([0, 1, 2, 3, 4], seeds, root)
      .some((i) => /has 5 items, maximum 4/.test(i.message))).toBe(true);
    // 32766 is not the sentinel and 0 is a real world Y: the `not` is a HOLE in
    // a range, not a floor.
    expect(validateAgainstSchema([0, 32766, 65535], seeds, root)).toEqual([]);
  });

  it('validates `patch_motion` through its $ref arms, and the sweep node the amendment added', () => {
    const motion = (EFFECTS_PRESET_SCHEMA.properties as Record<string, JsonSchema>).patch_motion;
    const defs = EFFECTS_PRESET_SCHEMA.$defs as Record<string, JsonSchema>;
    const root = EFFECTS_PRESET_SCHEMA;
    // Anti-vacuous: the $ref-inside-oneOf shape and the two closed $defs nodes
    // the amendment introduced really are what is being exercised.
    expect(((motion.items as JsonSchema).oneOf as JsonSchema[]).map((a) => a.$ref ?? a.type))
      .toEqual(['#/$defs/patch_motion_entry', 'null']);
    expect(defs.patch_motion_entry.unevaluatedProperties).toBe(false);
    expect(defs.anchor_sweep.unevaluatedProperties).toBe(false);
    // ...and NEITHER sits beside an in-place applicator, so the
    // additionalProperties equivalence holds without the prover being consulted
    // — a different situation from `$defs.band.properties.on`, where it is.
    for (const node of [defs.patch_motion_entry, defs.anchor_sweep]) {
      expect(Object.keys(node).filter((k) => ['oneOf', 'anyOf', 'allOf', 'not', '$ref'].includes(k)))
        .toEqual([]);
    }

    const doc = [{ sweep: { amp_shift: 4, period_shift: 1, phase: 0 } }, null];
    expect(validateAgainstSchema(doc, motion, root)).toEqual([]);
    expect(canonicalizeBySchema(doc, motion, root)).toEqual(doc);
    // `phase` is the only optional field, and the split is read off the schema.
    expect(presetDefFields('anchor_sweep')).toEqual({
      required: ['amp_shift', 'period_shift'], optional: ['phase'],
    });
    expect(presetDefFields('patch_motion_entry')).toEqual({ required: ['sweep'], optional: [] });
    // An unknown arm is refused THROUGH the $ref, and the message names it.
    expect(validateAgainstSchema([{ approach: {} }], motion, root)
      .some((i) => /unknown property "approach"/.test(i.message))).toBe(true);
    // A shift off the end of its ladder is refused with the bound.
    expect(validateAgainstSchema([{ sweep: { amp_shift: 1, period_shift: 0 } }], motion, root)
      .some((i) => /1 is below the minimum 2/.test(i.message))).toBe(true);
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
 * ═══ THE LAG HAS OPENED AND CLOSED TWICE, AND THE ROWS SURVIVE BOTH ═══
 *
 * At the 12aecd5 re-vendor the schema DECLARED `cycles` and `variants` and
 * reserved only `fires`, while aeon's page and `effects_gen.py` still REFUSED
 * all three by name. That was the contract leading its consumer — empyrean's
 * vectors say so in their own `$comment` ("the contract leads and aeon's
 * tools/effects_gen.py implements against it, the direction section 8
 * requires") — a LAG, not a contradiction. aeon merged EFFECTS-W1 DoD item 5
 * (`445a5856`, 2026-09-02) and it closed. empyrean `d36d704` declared item 4's
 * `patch_world_ys` / `patch_motion` (§7.3) and it re-opened, in the SHARPER
 * flavour: names aeon's page did not mention at all. aeon merged item 4's step 4
 * later the same day and it closed again. empyrean `9233883` then declared item
 * 6's `ramp` (§7.4) and it re-opened once more, in that same sharper flavour;
 * aeon merged item 6's step 4 later the same day and it closed again.
 *
 * MEASURED FIRSTHAND at aeon `origin/master` `c7ee7075`, page blob `55147199`:
 * `preset:` carries all EIGHT names — `bands, cycles, id, patch_motion,
 * patch_world_ys, ramp, schema, variants` — `preset-refused:` is `fires` alone,
 * and the block carries the `sweep:` / `sweep-optional:` rows item 4 grew (as it
 * grew `cycle-channel` / `variant` for item 5). The lag is EMPTY.
 *
 * ⚠ THE ARTIFACT IS THE PAGE, NOT `tools/effects_gen.py`. This row reads
 * `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block, which aeon's own test
 * compares against the generator. Evidence about the generator source is
 * evidence about a different artifact than the one measured here.
 *
 * SO THE ROWS BELOW SPLIT THE QUESTION IN TWO, and they must stay split,
 * because a lag is a legitimate state of this pair and a rename is not:
 *
 *   - The first two rows assert the invariants that hold ACROSS a lag — same
 *     vocabulary on both sides; every REQUIRED key accepted; nothing accepted
 *     that the schema does not declare; aeon refuses at least what the schema
 *     reserves; and the shapes ONE LEVEL DOWN agree field for field. A name one
 *     side knows and the other does not is a SPLIT.
 *   - The last row is the PIN: the lag is EMPTY. It goes red in either
 *     direction — aeon un-building a key (a regression), or the contract
 *     declaring one aeon has not built (a new lag) — and its message says which
 *     fix each is. It has held both values repeatedly; on 2026-09-02 it went
 *     from naming `['cycles','variants']` to asserting EMPTY, on 2026-09-03 to
 *     naming the premise list, back to EMPTY when item 4's step 4 landed, to
 *     naming it again for `ramp`, and back to EMPTY when item 6's step 4 landed.
 *     It is never DELETED, because deletion is how "nothing is watching" passes
 *     as green.
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
      // is known to spell it at this landing — TWO required, one ignored, the
      // rest optional — and EFFECTS_PRESET_ROOT_KEYS agrees.
      //
      // ⚠ THIS WAS THREE UNTIL empyrean 9233883, AND THE THIRD DID NOT VANISH.
      // `bands` LEFT the top-level `required` list when `ramp` arrived, because
      // a ramp-only document is legal; the document still carries exactly one
      // raster program, and that rule moved into a top-level `oneOf` over
      // `required: [bands]` / `required: [ramp]`. So the count going 3 -> 2 is
      // NOT a loosening, and reading it as one is the misreading this comment
      // exists to prevent — the row below asserts the `oneOf` is what took over,
      // so the pair cannot both be quietly dropped.
      //
      // `required` has stayed at TWO across every raster key since: a new raster
      // channel arrives as another `oneOf` ARM, never as another required key,
      // because requiring it would make every existing document illegal. The two
      // counts move independently and only the arm count grows.
      expect(schemaRequired).toHaveLength(2);
      // The `oneOf` that took over, asserted STRUCTURALLY and without naming the
      // lagging key: one branch per raster channel, each a single `required` over
      // a root key the schema declares, one of which is the sparse channel.
      // Naming the others here would put a second copy of a premise-list name in
      // this file, which preset-lag-disclosure.test.ts forbids for exactly the
      // reason it forbids the rest: a key name lives in the premise list and
      // nowhere else.
      //
      // ⚠ RE-PINNED 2 -> 3 at empyrean 5bd76ba (the base_swap CR). The count is
      // the number of MUTUALLY EXCLUSIVE raster channels the contract declares,
      // so it rises by one per raster-key CR and is expected to keep rising; it
      // must never FALL, which would mean an arm was dropped and a document that
      // used to be legal is not.
      const oneOfNames = (EFFECTS_PRESET_SCHEMA.oneOf as { required: string[] }[])
        .map((b) => b.required[0]).sort();
      expect(oneOfNames, 'the exactly-one-raster-program rule left `required` and no top-level '
        + 'oneOf took it over').toHaveLength(3);
      for (const n of oneOfNames) expect(EFFECTS_PRESET_ROOT_KEYS).toContain(n);
      expect(oneOfNames).toContain('bands');
      expect(schemaIgnored).toEqual(['name']);
      expect(schemaOptional.length).toBeGreaterThan(0);
      expect([...schemaRequired, ...schemaIgnored, ...schemaOptional].sort())
        .toEqual([...EFFECTS_PRESET_ROOT_KEYS].sort());

      // ═══ `preset` IS AEON'S ACCEPTED SET, NOT THE SCHEMA'S REQUIRED SET ═══
      //
      // This row asserted `keys.preset === schemaRequired` until 2026-09-02, and
      // it was green only by COINCIDENCE: during the lag the two optional keys
      // were refused, so the accepted set and the required set were the same
      // three names. Item 5 landed and the row went red on a page that had done
      // nothing wrong. The lag-tolerant statement is a pair of one-sided ones —
      // every required key must be accepted, and nothing may be accepted that
      // the schema does not declare. The gap between them IS the lag, and the
      // pin row below is the only thing entitled to have an opinion about it.
      for (const req of schemaRequired) {
        expect(keys.preset, `${SPLIT(tip)} aeon does not accept "${req}", which the schema `
          + 'REQUIRES — a document the schema demands would be refused').toContain(req);
      }
      expect(
        keys.preset.filter((k) => !schemaRequired.includes(k) && !schemaOptional.includes(k)),
        `${SPLIT(tip)} aeon accepts a root key the schema does not declare`,
      ).toEqual([]);

      expect(keys['preset-ignored'], SPLIT(tip)).toEqual(schemaIgnored);
      expect(keys.band, SPLIT(tip)).toEqual([...EFFECTS_PRESET_BAND_KEYS].sort());
      expect(keys['on-arms'], SPLIT(tip)).toEqual([...EFFECTS_PRESET_ON_ARMS].sort());
      expect(keys['on.cram'], SPLIT(tip)).toEqual([...presetArmFields('cram')].sort());
      expect(keys['on.pal_region'], SPLIT(tip)).toEqual([...presetArmFields('pal_region')].sort());

      // ═══ THE SHAPES ITEM 5 ADDED — the same question, one level down ═══
      //
      // The page grew `cycle-channel`, `cycle-channel-optional` and `variant`
      // when aeon built the two keys, and those are field names an Aurora panel
      // writes into a document. Unchecked, they are exactly what the row above
      // exists to stop: a spelling the two halves disagree about, breaking
      // nothing anywhere and inviting the next author to build against the
      // wrong one. Derived from the schema's own `$defs` nodes, never retyped.
      const cycleChannel = presetDefFields('cycle_channel');
      const palVariant = presetDefFields('pal_variant');
      // Anti-vacuous: the derivations really found split, non-empty field sets.
      expect(cycleChannel.required.length).toBeGreaterThan(0);
      expect(cycleChannel.optional.length).toBeGreaterThan(0);
      expect(palVariant.required).toEqual([]);
      expect(palVariant.optional.length).toBeGreaterThan(0);

      expect(keys['cycle-channel'], SPLIT(tip)).toEqual([...cycleChannel.required].sort());
      expect(keys['cycle-channel-optional'], SPLIT(tip)).toEqual([...cycleChannel.optional].sort());
      expect(keys.variant, SPLIT(tip)).toEqual([...palVariant.optional].sort());

      // ═══ AND THE SHAPE ITEM 4's STEP 4 ADDED, on 2026-09-03 ═══
      //
      // The page grew `sweep` / `sweep-optional` when aeon's generator learned
      // `patch_motion`, exactly as it grew the three rows above for item 5.
      // These are field names the anchors section of BandPresetPanel writes into
      // a document, and `amp_shift` / `period_shift` are base-2 LOGARITHMS: a
      // disagreement about their spelling breaks nothing anywhere and doubles
      // or halves whatever the next author builds against the wrong half. So
      // they get the same treatment, derived from the schema's own `$defs`
      // node and never retyped beside it.
      const anchorSweep = presetDefFields('anchor_sweep');
      // Anti-vacuous: the derivation really found a split, non-empty field set.
      expect(anchorSweep.required.length).toBeGreaterThan(0);
      expect(anchorSweep.optional.length).toBeGreaterThan(0);

      expect(keys.sweep, `${SPLIT(tip)} the sweep's REQUIRED fields`)
        .toEqual([...anchorSweep.required].sort());
      expect(keys['sweep-optional'], `${SPLIT(tip)} the sweep's OPTIONAL fields`)
        .toEqual([...anchorSweep.optional].sort());
    });
  });

  it('the two sides know the SAME root vocabulary, and aeon refuses at least what the schema reserves', (ctx) => {
    onPage(ctx, ({ tip, keys }) => {
      const pageVocabulary = [...keys.preset, ...keys['preset-ignored'], ...keys['preset-refused']].sort();
      const schemaVocabulary = [...EFFECTS_PRESET_ROOT_KEYS, ...schemaReserved].sort();

      // ═══ TWO ONE-SIDED CLAIMS, NOT ONE EQUALITY (widened 2026-09-03) ═══
      //
      // A plain `toEqual` was right while every lagging key sat in aeon's
      // `preset-refused` row — a key the contract had declared and aeon had not
      // built was still a name aeon's page KNEW. empyrean d36d704 produced the
      // other flavour: `patch_world_ys` and `patch_motion` are not in aeon's
      // vocabulary at all (their step 4 has not run), so the equality went red
      // on a page that had done nothing wrong, exactly as the `preset` row did
      // on 2026-09-02. The lag-tolerant statement is again a PAIR:
      //
      //   ← aeon knows no name the schema does not. A rename or a typo on
      //     aeon's side, or a key aeon invented, still fails here.
      //   → every name the schema knows must be a name aeon's page knows too —
      //     accepted, ignored or refused, but ACCOUNTED FOR, never absent.
      //
      // The gap between them IS a lag, and the pin row below owns it. THE PAIR
      // STAYS A PAIR even now that both sides are equal: folding them back into
      // one `toEqual` would go red on a legitimate lag, which is what happened
      // on 2026-09-03 to a page that had done nothing wrong.
      expect(
        pageVocabulary.filter((k) => !schemaVocabulary.includes(k)),
        `${SPLIT(tip)} aeon's page knows a root key the schema neither declares nor reserves`,
      ).toEqual([]);
      expect(
        schemaVocabulary.filter((k) => !pageVocabulary.includes(k)),
        `${SPLIT(tip)} the schema knows these root keys and aeon's page does not mention them at `
        + 'all. If aeon has RENAMED one, this is the split. If instead the contract has DECLARED '
        + 'a key aeon has not built, that is the contract leading its consumer — a lag, the state '
        + 'this pair was in from 12aecd5 to 2026-09-02 and again on 2026-09-03 — and the fix is '
        + 'to name them in the premise list in src/core/formats/effects/preset-lag.ts so the '
        + 'panel discloses them, then relax this row to allow exactly those names (git log it for '
        + 'the shape it had while a lag was open).',
      ).toEqual([]);

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
   * THE LAG IS EMPTY — the pin, which has now held both values three times.
   *
   * ═══ THE PIN CHANGES VALUE. IT IS NEVER DELETED. ═══
   *
   * This row has said, in order: "the lag is exactly `['cycles','variants']`"
   * (12aecd5), "the lag is EMPTY" (2026-09-02, item 5 merged), "the lag is
   * exactly `PRESET_KEYS_AWAITING_AEON`" (2026-09-03, empyrean d36d704 declared
   * item 4's keys), "the lag is EMPTY" again (2026-09-03, item 4's step 4
   * merged), the premise list once more (2026-09-03, empyrean 9233883 declared
   * item 6's `ramp`), and now EMPTY again (2026-09-03, aeon `c7ee7075` grew
   * `ramp` into its accepted `preset:` row). Each time its own message named the
   * fix, and each time the fix was to change what it asserts — never to remove
   * it.
   *
   * DELETING IT WOULD LEAVE NOTHING WATCHING. aeon un-building a key moves that
   * name from the page's `preset:` row into `preset-refused:` (or off the page
   * entirely). The vocabulary row above stays GREEN through the first of those —
   * the union is unchanged, the name merely moves between rows — and Aurora
   * would go on shipping controls for a key that reaches the file and nothing
   * further, with no disclosure above them and no test with an opinion. That is
   * the O62/O64 defect wearing the opposite costume, and it is exactly what a
   * suite that "still passes" looks like when it has stopped asserting anything.
   *
   * IT GOES RED IN BOTH DIRECTIONS, and the message distinguishes them:
   *   - aeon UN-builds a key it used to lower → a regression, and the panel
   *     owes its author the sentence again.
   *   - the contract DECLARES a key aeon has not built → a new lag, the same
   *     legitimate state as 12aecd5 and d36d704, and the fix is to re-fill the
   *     premise constant.
   * Either way the fix is one edit in ONE file, and the sentence follows into
   * BOTH of the panel's mount sites by construction.
   *
   * THE ROW CARRIES NO COPY OF ANY KEY NAME, and — while the lag is empty — it
   * does not name `PRESET_KEYS_AWAITING_AEON` either: the left side is read from
   * aeon's page and the right side is the empty set. A row asserting "the
   * measured lag equals <a constant known to be empty>" would be the same claim
   * spelled through an indirection nobody can read.
   * `preset-lag-disclosure.test.ts` checks from the other side that this row is
   * still here AND still computes the WIDE lag, so the retirement cannot itself
   * rot into an unmeasured claim.
   */
  it(`the contract-leads-consumer lag at aeon ${page.kind === 'ok' ? page.tip.slice(0, 8) : TIP} is `
     + 'EMPTY — aeon accepts every key the schema declares (retired 2026-09-03, item 6; red in '
     + 'both directions)', (ctx) => {
    onPage(ctx, ({ tip, keys }) => {
      // Anti-vacuous: this row is only meaningful because the schema declares
      // keys BEYOND the required ones for aeon to have built, and because
      // aeon's page really lists what it accepts.
      expect(schemaOptional.length, 'the schema declares no optional root key, so there is no lag '
        + 'this row could ever measure').toBeGreaterThan(0);
      expect(keys.preset.length, 'aeon accepts nothing at all, so the accepted list this row '
        + 'subtracts from is not being read').toBeGreaterThan(0);

      // ═══ THE MEASUREMENT WIDENED, AND THE OLD ONE HAD A HOLE ═══
      //
      // Until 2026-09-03 the lag was `keys['preset-refused'] minus the reserved
      // names` — which sees a key aeon refuses BY NAME and is blind to a key
      // aeon's page does not mention at all. empyrean d36d704 produced exactly
      // the blind flavour, and that clause stayed GREEN through it; only the
      // one-sided check underneath it went red. So the lag is now what the
      // premise constant always MEANT: every root key the schema declares that
      // aeon's page does not ACCEPT, whichever way aeon declines it.
      const lag = schemaOptional.filter((k) => !keys.preset.includes(k)).sort();
      expect(
        lag,
        `A LAG HAS RE-OPENED between ${PROV.empyrean.path} (blob ${PROV.empyrean.blob}) and aeon `
        + `${PAGE} at ${tip}: the schema declares ${JSON.stringify(lag)}, and aeon's page does not `
        + 'ACCEPT them. This row is red in BOTH directions and the fix differs:\n'
        + '  • THE CONTRACT DECLARED A KEY AEON HAS NOT BUILT — not a split: it is the contract '
        + 'leading its consumer, the state this pair was in from the 12aecd5 re-vendor to '
        + '2026-09-02 and again from the d36d704 one. Aurora is authoring a key that reaches the '
        + 'file and nothing further (or, if aeon\'s page does not mention it AT ALL, one that '
        + 'fails aeon\'s build outright), with NO disclosure above the controls. FIX: put these '
        + 'names into the premise list in src/core/formats/effects/preset-lag.ts — the '
        + 'panel\'s sentence is derived from it and comes back on screen in both mount sites by '
        + 'construction — re-date it, and flip this row back to asserting that list (git log this '
        + 'row for the shape it had on 2026-09-03).\n'
        + '  • AEON HAS UN-BUILT A KEY IT USED TO LOWER — that is a REGRESSION, not a lag, and it '
        + 'is what this row exists to catch: the vocabulary row above stays green through it, '
        + 'because the name merely moves from the page\'s `preset:` row to `preset-refused:`. '
        + 'Report it to aeon BEFORE re-filling anything here.',
      ).toEqual([]);

      // The same fact from the other side, so the row cannot pass on a page that
      // simply stopped listing its refusals: every name aeon REFUSES is one the
      // schema still reserves. (While a lag is open this clause gains the
      // premise list as a second allowed source — see the 2026-09-03 shape.)
      expect(
        keys['preset-refused'].filter((k) => !schemaReserved.includes(k)),
        `${SPLIT(tip)} aeon refuses a root key the schema does not reserve. If the schema DECLARES `
        + 'it, that is a lag and the row above owns it; if the schema does not know the name at '
        + 'all, that is a split.',
      ).toEqual([]);
    });
  });
});
