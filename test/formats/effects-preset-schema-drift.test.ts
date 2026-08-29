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
  SUPPORTED_KEYWORDS, collectSchemaKeywords, validateAgainstSchema, type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';
import {
  EFFECTS_PRESET_SCHEMA, EFFECTS_PRESET_BAND_KEYS, EFFECTS_PRESET_ON_ARMS,
  EFFECTS_PRESET_RESERVED_KEYS, presetArmFields,
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
 * At this landing the two AGREE, field for field. Recorded in
 * docs/reviews/2026-08-29-band-preset-panel.md.
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

  it(`agrees with ${PAGE} at aeon ${TIP}, row for row`, (ctx) => {
    if (aeon === null) {
      ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AURORA_AEON_REPO) — '
        + 'CANNOT MEASURE whether aeon\'s worked example still agrees with the schema');
      return;
    }
    const tip = resolveRev(aeon, TIP);
    if (tip === null) {
      ctx.skip(`SKIPPED, NOT PASSED: ${TIP} does not resolve in ${aeon} — CANNOT MEASURE `
        + 'agreement with aeon\'s page');
      return;
    }
    const at = readAtRev(aeon, tip, PAGE);
    // Not a skip: the revision resolved, so this WAS measured, and the page
    // vanishing from aeon's tip is a fact worth failing on.
    expect(at.ok, at.ok ? '' : `aeon ${tip}: ${at.ok ? '' : at.why}`).toBe(true);
    if (!at.ok) return;

    const keys = pageKeys(at.text);
    // Not a skip either: the page is there and its machine-checked block is not.
    // That is exactly the drift this row exists to catch.
    expect(keys, `${PAGE} at aeon ${tip} no longer carries its `
      + 'KEYS-CHECKED-AGAINST-effects_gen.py block — the one part of that page that cannot rot '
      + 'silently has been removed').not.toBeNull();
    if (keys === null) return;

    const SPLIT = `A SPLIT BETWEEN aeon ${PAGE} (at ${tip}) AND `
      + `${PROV.empyrean.path} (blob ${PROV.empyrean.blob}). THE SCHEMA WINS — but report this: `
      + 'aeon asked to hear about it immediately.';

    expect(keys.preset, SPLIT).toEqual(['bands', 'id', 'schema']);
    expect(keys.band, SPLIT).toEqual([...EFFECTS_PRESET_BAND_KEYS].sort());
    expect(keys['on-arms'], SPLIT).toEqual([...EFFECTS_PRESET_ON_ARMS].sort());
    expect(keys['on.cram'], SPLIT).toEqual([...presetArmFields('cram')].sort());
    expect(keys['on.pal_region'], SPLIT).toEqual([...presetArmFields('pal_region')].sort());
    expect(keys['preset-refused'], SPLIT).toEqual([...EFFECTS_PRESET_RESERVED_KEYS]);
    expect(keys['preset-ignored'], SPLIT).toEqual(['name']);
  });
});
