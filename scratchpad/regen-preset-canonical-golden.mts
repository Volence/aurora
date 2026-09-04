/**
 * REGENERATE `test/fixtures/effects/preset-canonical-golden.json`.
 *
 * ═══ WHY THIS FILE EXISTS AT ALL ═══
 *
 * The golden's `$re_generate` field says it may be rebuilt "only when a
 * re-vendor legitimately changes canonical output" — and until now the generator
 * that made it was a one-off nobody committed, so the next reader met a rule
 * with no instrument. This is the instrument. A regeneration is now a reviewable
 * diff of a script rather than a fixture that changed by hand.
 *
 * ═══ ⚠ IT IS BUILT ON THE TWO MODULES A PRESET RE-VENDOR DOES NOT TOUCH ═══
 *
 * `json-schema-subset.ts` and `canonical-json.ts` — DELIBERATELY NOT
 * `preset.ts`, whose module-load derivations read the CURRENT schema and cannot
 * load an older one at all. A generator built on `preset.ts` would compare the
 * new codec to itself and the whole before/after property would be lost. That is
 * the golden's own `$how_it_was_produced` note, kept.
 *
 * ═══ WHAT IT PRODUCES, AND THE FINDING IT PRESERVES ═══
 *
 * `documents` are aeon's bytes at aeon `origin/master`, read through git
 * OBJECTS, never the sibling working tree. `canonical` is those documents put
 * through `canonicalizeBySchema` + `canonicalJsonPretty` under the PREVIOUS
 * vendored schema blob; the same run is then repeated under the CURRENT blob and
 * the two must agree BYTE FOR BYTE. That agreement is the finding: a re-vendor
 * must not rewrite a document nobody touched.
 *
 * ⚠ A DOCUMENT WHOSE OWN SHAPE MIGRATED IN THE SAME RE-VENDOR CANNOT BE
 * MEASURED THAT WAY, and this script says so rather than quietly producing a
 * number. If the previous schema REFUSES a document (because the document moved
 * to a shape that schema does not describe), the id is reported as
 * UNMEASURABLE-UNDER-PREVIOUS and its canonical form is produced under the
 * CURRENT schema with that fact recorded in the fixture — never rendered as a
 * pass.
 *
 * RUN (bundled, because this repo ships no standalone TS runner):
 *   npx esbuild scratchpad/regen-preset-canonical-golden.mts --bundle \
 *     --platform=node --format=esm --packages=external \
 *     --outfile=<tmp>/regen.mjs && node <tmp>/regen.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canonicalizeBySchema, validateAgainstSchema, type JsonSchema,
} from '../src/core/formats/effects/json-schema-subset';
import { canonicalJsonPretty } from '../src/core/formats/canonical-json';

// ⚠ RESOLVED FROM THE WORKING DIRECTORY, NOT FROM `import.meta.url`. This module
// is BUNDLED to a temp path before it runs, so `import.meta.url` points at the
// bundle and not at the repo — a resolution that looks right and silently reads
// the wrong tree. Run it from anywhere inside the Aurora checkout.
const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const GOLDEN = resolve(REPO, 'test/fixtures/effects/preset-canonical-golden.json');
const SCHEMA_PATH = 'src/core/formats/effects/aurora-effects-preset.schema.json';
const AEON_DIR = 'games/sonic4/data/editor/effects/presets';

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

/** The aeon checkout beside this repo — the same resolution the tests use. */
const aeon = (process.env.AEON_DIR ?? resolve(REPO, '..', 'aeon'));
git(aeon, 'rev-parse', '--git-dir');

const aeonTip = git(aeon, 'rev-parse', 'origin/master').trim();

/** The schema blob this repo carried BEFORE the amendment under test. */
const prevBlob = git(REPO, 'rev-parse', `${process.argv[2] ?? 'HEAD~1'}:${SCHEMA_PATH}`).trim();
const curBlob = git(REPO, 'rev-parse', `HEAD:${SCHEMA_PATH}`).trim();
if (prevBlob === curBlob) {
  throw new Error(
    `the previous and current schema blobs are the same object (${curBlob}). This script would `
    + 'produce a golden that compares the new codec to itself, which is exactly the vacuous '
    + 'fixture the row it feeds asserts against. Pass the revision whose schema PRECEDES the '
    + 'amendment as argv[2].',
  );
}
const prevSchema = JSON.parse(git(REPO, 'cat-file', 'blob', prevBlob)) as JsonSchema;
const curSchema = JSON.parse(git(REPO, 'cat-file', 'blob', curBlob)) as JsonSchema;

const ids = git(aeon, 'ls-tree', '--name-only', aeonTip, `${AEON_DIR}/`)
  .split('\n').filter(Boolean)
  .map((p) => p.slice(`${AEON_DIR}/`.length).replace(/\.json$/, ''))
  .sort();
if (ids.length === 0) throw new Error(`no presets under ${AEON_DIR} at aeon ${aeonTip}`);

const documents: Record<string, string> = {};
const canonical: Record<string, string> = {};
const unmeasurable: Record<string, string> = {};

function produce(doc: unknown, schema: JsonSchema): { ok: true; text: string } | { ok: false; why: string } {
  try {
    return { ok: true, text: canonicalJsonPretty(canonicalizeBySchema(doc, schema)) };
  } catch (e) {
    return { ok: false, why: e instanceof Error ? e.message : String(e) };
  }
}

for (const id of ids) {
  const text = git(aeon, 'show', `${aeonTip}:${AEON_DIR}/${id}.json`);
  documents[id] = text;
  const doc = JSON.parse(text);
  // ⚠ "IT CANONICALISED THE SAME UNDER BOTH" IS NOT EVIDENCE IF THE OLD SCHEMA
  // NEVER LOOKED INSIDE. `canonicalizeBySchema` walks a document THROUGH its
  // schema, so where the instance and the schema disagree about a node's TYPE
  // the walk does not descend and the output falls through unchanged — which
  // reads as agreement and measures nothing. So the previous schema must also
  // ACCEPT the document before its output counts as a before-half.
  const acceptedByPrev = validateAgainstSchema(doc, prevSchema);
  const under_prev = produce(doc, prevSchema);
  const under_cur = produce(doc, curSchema);
  if (!under_cur.ok) {
    throw new Error(
      `${id}.json does not canonicalise under the CURRENT schema (${curBlob}): ${under_cur.why}. `
      + 'That is a live defect, not a fixture question — the writer would refuse a document aeon '
      + 'ships. Stop and fix the codec.',
    );
  }
  if (acceptedByPrev.length > 0 || !under_prev.ok) {
    // LOUD, NOT SILENT. This document's own SHAPE migrated in the same
    // amendment, so the previous schema cannot describe it and the before/after
    // property is genuinely unmeasurable for it. Recorded as such.
    unmeasurable[id] = under_prev.ok
      ? `the previous schema REFUSES this document (${acceptedByPrev.length} issue(s), first: `
        + `${acceptedByPrev[0].path || '<document>'}: ${acceptedByPrev[0].message}), so it never `
        + 'descended into the migrated key and its canonical output is not a before-half. '
        + `(For the record the two outputs did ${under_prev.text === under_cur.text
          ? 'happen to agree' : 'DISAGREE'} — which is a fact about the walk falling through, `
        + 'not about the amendment.)'
      : `the previous schema could not canonicalise this document at all: ${under_prev.why}`;
    canonical[id] = under_cur.text;
    continue;
  }
  if (under_prev.text !== under_cur.text) {
    throw new Error(
      `${id}.json canonicalises DIFFERENTLY under the previous schema (${prevBlob}) and the `
      + `current one (${curBlob}). The amendment has moved canonical output for a shipped `
      + 'document, so opening an untouched preset and saving it would REWRITE it. That is a '
      + 'MIGRATION of every shipped preset and must be said out loud, not absorbed into a '
      + 'regenerated fixture.',
    );
  }
  canonical[id] = under_prev.text;
}

const old = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, unknown>;
// EVERY FIELD IS GENERATED, including the prose. The fixture is never hand
// edited: a note that drifts from the run that produced it is worse than no
// note, and `$re_generate` is a rule nobody can follow if half the file is
// manual. `$what` / `$why` / `$not_a_claim_about_aeon` / `$re_generate` are
// carried forward verbatim when they exist so an amendment does not silently
// rewrite the reasons this fixture is kept.
const carried = (k: string, fallback: string): string =>
  typeof old[k] === 'string' ? (old[k] as string) : fallback;
const out = {
  $what: carried('$what', ''),
  $why: carried('$why', ''),
  $how_it_was_produced:
    `Generated by scratchpad/regen-preset-canonical-golden.mts (see its header). \`documents\` `
    + `are aeon's bytes at origin/master ${aeonTip}, read through git OBJECTS and never the `
    + `sibling working tree. \`canonical\` is those documents through canonicalizeBySchema + `
    + `canonicalJsonPretty (src/core/formats/effects/json-schema-subset.ts and `
    + `src/core/formats/canonical-json.ts, the two modules a preset re-vendor does not touch) `
    + `under the PREVIOUS vendored schema blob ${prevBlob}; the same run was repeated under the `
    + `CURRENT blob ${curBlob} and every measured output was byte-identical, which is the finding `
    + `this fixture preserves. The generator is deliberately NOT built on preset.ts, which at the `
    + `current revision reads $defs.base_swap.items and cannot load the previous schema at all - `
    + `so a naive before/after would have compared the new codec to itself.`,
  $not_a_claim_about_aeon: carried('$not_a_claim_about_aeon', ''),
  $re_generate: carried('$re_generate', ''),
  $unmeasurable_under_previous_schema:
    'IDS LISTED IN `unmeasurable_under_previous_schema` HAVE NO BEFORE-HALF, AND THEIR '
    + '`canonical` ENTRY IS NOT EVIDENCE ABOUT THE AMENDMENT. A document whose own SHAPE migrated '
    + 'in the same re-vendor is REFUSED by the previous schema, so canonicalizeBySchema never '
    + 'descends into the migrated key and its output falls through unchanged - which reads as '
    + '"identical under both" and measures nothing. Those ids are canonicalised under the CURRENT '
    + 'schema and recorded here with the reason, rather than counted as a pass. The '
    + 'before/after property is genuinely measured only over the ids NOT in that map, and the row '
    + 'that consumes this fixture must assert that set is non-empty.',
  aeon_revision: aeonTip,
  aeon_path: carried('aeon_path', 'games/sonic4/data/editor/effects/presets/<id>.json'),
  produced_under_schema_blob: prevBlob,
  unmeasurable_under_previous_schema: unmeasurable,
  documents,
  canonical,
};
writeFileSync(GOLDEN, `${JSON.stringify(out, null, 2)}\n`);
process.stdout.write(
  `aeon ${aeonTip}\nprev schema blob ${prevBlob}\ncur schema blob ${curBlob}\n`
  + `ids: ${ids.join(', ')}\n`
  + `unmeasurable under previous schema: ${Object.keys(unmeasurable).join(', ') || '(none)'}\n`,
);
