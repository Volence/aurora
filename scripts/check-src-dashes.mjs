#!/usr/bin/env node
// NO EM DASH AND NO EN DASH IN NON-COMPONENT SOURCE TEXT.
//
// Owner ruling, 2026-09-05, all tools: no U+2014 and no U+2013 in TEXT A TOOL
// SHOWS A PERSON, nor in the instruction docs agents read. Committed history is
// not retro swept. In this bucket that means labels, panel prose, tooltips,
// refusals and generated help; it also means a thrown Error and anything
// printed, which is wider than "the app" and is the point of the next
// paragraph but one.
// `src/**/*.tsx` was swept that day and is held by `scripts/check-tsx-dashes.mjs`.
// This is its SIBLING for the other half: the non-test `src/**/*.ts` prose
// (providers, core, stores, the agent tool descriptions) plus the one generated
// stylesheet, swept the same day.
//
// WHY A SIBLING AND NOT ONE WIDER GATE. The obvious move is to widen the .tsx
// gate's glob, and the reason not to is that its NAME would then be false, and
// a name that outlives its scope is how a reader learns to distrust the whole
// chain. Renaming it instead would rot the citations in the components parcel's
// landed review and in `docs/lane-log.jsonl`, neither of which this parcel gets
// to rewrite. Two gates, each honestly named, each stating what it does NOT
// look at, is the cheaper of the two mistakes. If they ever drift, merge them
// and rename in one change with the ledger citations updated.
//
// WHAT IT COUNTS
//
// Every dash inside a StringLiteral or any part of a template literal, in BOTH
// spellings: the character, and the backslash-u escape, which renders
// identically and which no character grep can see. The components sweep found
// its 210th that way after a first count of 209.
//
// WHAT IT DELIBERATELY DOES NOT COUNT, and why in each case
//
// COMMENTS. The reason given here until 2026-09-05 was "the ruling is about
// text a person reads in the app". THAT WAS WRONG, and it was wrong in the
// direction that costs work: read that way, a vitest failure line, a harness
// `check()` label and a thrown Error all look out of scope, because none of
// them is in the app. All three are a tool showing a person text and all three
// are in. The rule (comments are exempt) survives; only its justification
// changes, and it changes to the one that actually holds: NO TOOL SHOWS A
// COMMENT TO A PERSON. A comment is never printed, thrown or logged. This
// repo's comments are its design record besides, and a gate that failed on them
// would be asking for the record to be degraded in exchange for nothing anyone
// ever reads. A wrong reason attached to a correct rule is how the rule gets
// applied in the wrong scope later, which is exactly what happened here.
//
// TESTS. `src/**/__tests__/`, `src/test/` and `test/` at the repo root are a
// separate bucket, swept on 2026-09-05 and held by
// `scripts/check-test-dashes.mjs`. The harness scripts under `scratchpad/` are
// deferred; that gate's docblock carries the count and the cut.
//
// VENDORED DOCUMENTS, EXCLUDED STRUCTURALLY. A file whose whole point is byte
// identity with an upstream revision must keep upstream's punctuation, and the
// drift gate that proves the identity is what would go red if a sweep touched
// it. So the exclusion is a PATH RULE, derived from the presence of a sibling
// `<name>.provenance.json`, and NOT from the observation that a given vendored
// file happens to be dash free today. `test/fixtures/effects/ojz_act1_depth.json`
// carries one right now, from aeon, and stripping it would be the defect.
// (Only .ts is scanned here, so no vendored file is in the population today.
// The rule is written anyway, because the day someone vendors a .ts is the day
// nobody remembers to add it.)
//
// THE GENERATED STYLESHEET. `src/renderer/styles/theme.css` is written by
// `scripts/gen-theme.mjs` from the Empyrean design tokens. It is scanned RAW,
// comments included, because in a generated file the comments are emitted by
// the generator and are as much its output as the rules are. A finding there is
// fixed AT THE GENERATOR and the file regenerated; editing the .css alone is
// undone by the next `npm run gen:theme`.
//
// TWO SANCTIONED QUOTATIONS, and why an allowlist rather than a rule
//
// Aurora quotes two of aeon's own messages VERBATIM, so an author can match a
// build log against them. The dashes in those are aeon's, and rewriting them
// would make Aurora quote a message aeon does not emit. Each allowance below
// names the aeon file it was read from. AN ALLOWANCE THAT MATCHES NOTHING IS A
// FAILURE, not a silent pass: a permission with no live subject has outlived
// its reason and must be deleted rather than left standing.
//
// Run: node scripts/check-src-dashes.mjs   (also in the `npm test` chain)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

const DASH = /[—–]|\\u201[34]/g;

/**
 * The verbatim quotations of another tool's output that this repo is allowed to
 * carry. `text` must appear on the offending line; `read_from` is where the
 * quotation was checked against its source.
 */
const ALLOWANCES = [
  {
    file: 'src/renderer/providers/effects-preset.ts',
    text: 'lines mask N selects line 0',
    why: 'VARIANT_LINE_0_LAW quotes aeon\'s build refusal so an author can match a build log',
    read_from: 'aeon engine/effects/palette_dsl.emp:43',
  },
  {
    file: 'src/core/formats/raster-binding.ts',
    text: 'no sidecar carries a rasterRef',
    why: 'RASTER_SECTION_BINDING_LIMIT quotes three of aeon\'s pytest failure messages by name',
    read_from: 'aeon tools/test_effects_seam_gate.py:758',
  },
];

/** Tracked files, from git rather than a filesystem walk. */
const tracked = (glob) => execFileSync('git', ['-C', ROOT, 'ls-files', '--', glob], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

/**
 * Vendored: a file with a sibling `<name>.provenance.<anything>`. See the docblock.
 *
 * THE EXTENSION IS A WILDCARD, corrected 2026-09-05. This rule matched
 * `.provenance.json` only. The repo has 11 markers and one of them is
 * `test/fixtures/effects/writer_session_ojz.provenance.md`, so the narrow rule
 * called a genuinely vendored file "not vendored". No vendored file is in THIS
 * gate's population today, which is exactly why the defect could sit here
 * unnoticed and be copied into a gate whose population does contain one. See
 * `scripts/check-test-dashes.mjs`, which additionally refuses if any marker in
 * the tree fails to name a subject the rule recognises.
 */
const allTracked = new Set(tracked('.'));
const PROVENANCE = /\.provenance\.[^./]+$/;
const isVendored = (rel) => {
  const base = rel.replace(/\.[^./]+$/, '') + '.provenance.';
  for (const f of allTracked) if (f.startsWith(base) && PROVENANCE.test(f)) return true;
  return false;
};

function sourceFiles() {
  return tracked('src/**/*.ts')
    .filter((f) => !f.includes('__tests__/'))
    .filter((f) => !f.startsWith('src/test/'))
    .filter((f) => !isVendored(f));
}

/** Byte ranges of every comment, found by walking to the leaf tokens. */
function commentRanges(text, sf) {
  const out = [];
  const add = (a) => { if (a) for (const c of a) out.push([c.pos, c.end]); };
  const walk = (node) => {
    const kids = node.getChildren(sf);
    if (kids.length === 0) {
      add(ts.getLeadingCommentRanges(text, node.pos));
      add(ts.getTrailingCommentRanges(text, node.end));
      return;
    }
    for (const k of kids) walk(k);
  };
  walk(sf);
  return out;
}

const STRINGY = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

const lineAt = (text, off) => {
  const a = text.lastIndexOf('\n', off) + 1;
  let b = text.indexOf('\n', off);
  if (b < 0) b = text.length;
  return text.slice(a, b);
};

const findings = [];
const srcs = sourceFiles();
for (const rel of srcs) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  DASH.lastIndex = 0;
  if (!DASH.test(text)) continue;

  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const comments = commentRanges(text, sf);
  const inComment = (off) => comments.some(([a, b]) => off >= a && off < b);

  const leaves = [];
  const walk = (node) => {
    const kids = node.getChildren(sf);
    if (kids.length === 0) { leaves.push(node); return; }
    for (const k of kids) walk(k);
  };
  walk(sf);
  const stringyAt = (off) => leaves.some((l) => STRINGY.has(l.kind) && off >= l.getStart(sf) && off < l.end);

  DASH.lastIndex = 0;
  let m;
  while ((m = DASH.exec(text)) !== null) {
    const off = m.index;
    if (inComment(off) || !stringyAt(off)) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(off);
    findings.push({
      rel, line: line + 1, col: character + 1,
      spelling: m[0].length === 1 ? 'literal' : 'escape',
      src: lineAt(text, off).trim().slice(0, 140),
    });
  }
}

const cssFiles = tracked('src/**/*.css').filter((f) => !isVendored(f));
const cssFindings = [];
for (const rel of cssFiles) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  DASH.lastIndex = 0;
  let m;
  while ((m = DASH.exec(text)) !== null) {
    const upto = text.slice(0, m.index);
    cssFindings.push({ rel, line: upto.split('\n').length, src: lineAt(text, m.index).trim().slice(0, 140) });
  }
}

// Apply the allowlist, and refuse a stale allowance in the same pass.
const used = new Set();
const live = findings.filter((f) => {
  const a = ALLOWANCES.find((x) => x.file === f.rel && f.src.includes(x.text));
  if (a) { used.add(a); return false; }
  return true;
});
const stale = ALLOWANCES.filter((a) => !used.has(a));

let bad = false;

if (stale.length > 0) {
  bad = true;
  console.error(`check-src-dashes: ${stale.length} allowance(s) match NOTHING in the tree.`);
  console.error('An allowance with no live subject has outlived its reason. Delete it rather than');
  console.error('leaving a standing permission nobody can trace to a string.');
  for (const a of stale) console.error(`  ${a.file}: ${JSON.stringify(a.text)}  (${a.read_from})`);
}

if (live.length > 0 || cssFindings.length > 0) {
  bad = true;
  const n = live.length + cssFindings.length;
  console.error(`check-src-dashes: ${n} dash(es) in non-component source text, across `
    + `${new Set([...live, ...cssFindings].map((f) => f.rel)).size} file(s) of ${srcs.length + cssFiles.length}.`);
  console.error('A dash does several different jobs and each wants a different repair: commas or');
  console.error('brackets for an aside, a colon for an appositive, a full stop before a consequence,');
  console.error('"to" for a range. Read the sentence and repair it; do not substitute blindly.');
  for (const f of live) console.error(`  ${f.rel}:${f.line}:${f.col}  (${f.spelling})\n      ${f.src}`);
  for (const f of cssFindings) {
    console.error(`  ${f.rel}:${f.line}  (GENERATED)\n      ${f.src}`);
    console.error('      Fix this at scripts/gen-theme.mjs and re-run `npm run gen:theme`.');
    console.error('      Editing the .css alone is undone by the next regeneration.');
  }
}

if (bad) process.exit(1);

console.log(`check-src-dashes: OK: ${srcs.length} non-test .ts file(s) and ${cssFiles.length} `
  + 'stylesheet(s) under src, no U+2014 or U+2013 in any string or template, in either spelling. '
  + `Out of scope and saying so: comments (no tool shows one to a person), the test tree (held `
  + `by check-test-dashes), .tsx (held by `
  + `check-tsx-dashes), and any file with a sibling .provenance.json (vendored, byte identity `
  + `with upstream). ${ALLOWANCES.length} sanctioned verbatim quotation(s) of aeon's own `
  + 'messages, each still live.');
