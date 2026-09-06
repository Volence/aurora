#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// NUMBERS A PERSON READS, TYPED INSTEAD OF DERIVED — the census instrument.
//
// A constant restated in author-facing prose has TWO AUTHORS AND NO ARBITER:
// the code enforces one value, the sentence beside it states another, and the
// two rot on separate clocks. aeon shipped the worst instance of this class on
// 2026-09-06 (a refusal telling a blocked author "the limit is 12 KiB" while the
// code enforced 20480) and fixed it by DERIVING the figure. This script finds
// the same shape in Aurora.
//
// ═══ WHY THIS IS NOT aeon's PREDICATE ═══
//
// aeon swept for: a string literal of 20+ chars carrying BOTH a bound word
// (limit|ceiling|budget|max|…) AND a numeric literal. Borrowed unchanged, that
// predicate is near-useless here, for two INDEPENDENT reasons:
//
//   1. SHAPE. It matches one literal at a time. Aurora's author-facing prose is
//      overwhelmingly multi-line JSX `title=` attributes and `+`-concatenated
//      chunks, so the number and the word it qualifies routinely live in
//      DIFFERENT literals and neither half matches alone. This script parses
//      with the TypeScript compiler and FOLDS `+` chains, template literals and
//      adjacent chunks into one string before matching. (JSX attributes whose
//      value is a multi-line plain string are folded on whitespace too — JSX
//      keeps the newlines and indentation, so `cols * 32 bytes per\n   pattern
//      ROW` must be normalised before any word/number test.)
//
//   2. VOCABULARY. Aurora's instances of the class are not BOUND sentences at
//      all, they are ENCODING sentences: "s2: second shift (15 = single term)",
//      "cols * 32 bytes per pattern ROW". There is no bound word anywhere in
//      them. A word list tuned to budgets would return empty here and that
//      emptiness would mean nothing. So the predicate here is: an author-facing
//      string, 20+ chars, carrying a STANDALONE INTEGER — and the integer is
//      RANKED by whether it equals a value this repo derives from a vendored
//      artifact (the bganim consumer contract, the effects scene schema).
//      Ranking, not filtering: coincidence is possible, so a hit is a candidate
//      for a human verdict, never a finding.
//
// ═══ POSITIVE CONTROL ═══
//
// `--control` re-runs the predicate against a git revision KNOWN to contain the
// defect (default: the parcel's base commit, before any fix) and prints the four
// sites the parcel was briefed with. An empty sweep and a predicate that can
// never match are the same artifact; this is what tells them apart. It prints
// the control's OUTPUT, not merely that a control exists.
//
// ═══ STATED BOUND — what this does NOT cover ═══
//
//   • COMMENTS. Only string EXPRESSIONS are collected. A wrong number in a
//     comment misleads the next author but is not "text a tool shows a person".
//   • .md guide prose, .mjs harnesses, shell scripts, and JSON fixtures.
//   • Strings assembled at runtime from a variable this script cannot fold
//     (`msg = base; if (x) msg += '...15...'`). Substitution SITES are reported
//     as already-derived, but a number that arrives via a variable holding a
//     literal elsewhere is invisible here.
//   • Non-integer figures (3.5 KiB, percentages) and hex literals in prose.
//   • Whether a flagged number is WRONG. This instrument finds re-typing, not
//     staleness; the verdict per site is a human's.
//
// Usage:
//   node scratchpad/numbers-in-prose-sweep.mjs            # census of the worktree
//   node scratchpad/numbers-in-prose-sweep.mjs --control  # positive control
//   node scratchpad/numbers-in-prose-sweep.mjs --rev <sha>
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── The derived-constant table, itself derived ───────────────────────────────
// Read out of the SAME vendored artifacts the source reads, so this instrument
// cannot be the thing that goes stale. If a contract value moves, the ranking
// moves with it.
function derivedValues() {
  const table = new Map(); // value -> [names]
  const add = (name, value) => {
    if (!Number.isInteger(value)) return;
    if (!table.has(value)) table.set(value, []);
    table.get(value).push(name);
  };
  const contract = JSON.parse(readFileSync(
    path.join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
  for (const [name, node] of Object.entries(contract.constants ?? {})) add(name, node.value);

  const schema = JSON.parse(readFileSync(
    path.join(ROOT, 'src/core/formats/effects/aurora-effects-scene.schema.json'), 'utf8'));
  // Walk the whole schema for minimum/maximum/default/const — every one of them
  // is a number a form could have typed into a sentence instead of reading.
  (function walk(node, at) {
    if (node === null || typeof node !== 'object') return;
    for (const key of ['minimum', 'maximum', 'default', 'const']) {
      if (typeof node[key] === 'number') add(`schema ${at}.${key}`, node[key]);
    }
    for (const [k, v] of Object.entries(node)) walk(v, at ? `${at}.${k}` : k);
  })(schema, '');
  return table;
}

// ── Collecting author-facing strings ─────────────────────────────────────────
// AUTHOR-FACING is a position, not a word: a JSX attribute a person reads
// (title/label/placeholder/alt/aria-label/hint/help), or an object property or
// a returned/thrown message whose KEY says it is shown. Everything else — enum
// values, css, ids, import paths — is machine text and out of scope.
const FACING_JSX_ATTRS = new Set([
  'title', 'label', 'placeholder', 'alt', 'aria-label', 'aria-description',
  'hint', 'help', 'tooltip', 'summary', 'caption', 'legend', 'noneLabel',
]);
const FACING_KEYS = new Set([
  'title', 'label', 'hint', 'help', 'message', 'description', 'placeholder',
  'summary', 'caption', 'text', 'note', 'detail', 'details', 'reason',
  'advisory', 'tooltip', 'noneLabel', 'shiftATitle', 'shiftBTitle', 'phaseTitle',
]);

/**
 * Fold a string-valued expression into { text, subs }.
 *
 * THIS IS THE WHOLE POINT OF USING A PARSER. `'a' + '15' + 'b'` is three
 * literals to a grep and one sentence to a reader; a template literal's cooked
 * chunks are the same problem wearing backticks. Returns null for anything that
 * is not entirely made of literals and substitutions.
 *
 * `subs` counts `${...}` holes: a sentence with holes is already deriving
 * something, which changes its verdict.
 */
function foldString(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, subs: 0 };
  }
  if (ts.isJsxExpression(node) && node.expression) return foldString(node.expression);
  if (ts.isParenthesizedExpression(node)) return foldString(node.expression);
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    let subs = 0;
    for (const span of node.templateSpans) {
      subs += 1;
      text += '<sub>'; // a hole: never matches a digit test
      text += span.literal.text;
    }
    return { text, subs };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = foldString(node.left), r = foldString(node.right);
    if (!l || !r) return null;
    return { text: l.text + r.text, subs: l.subs + r.subs };
  }
  if (ts.isConditionalExpression(node)) {
    // Two sentences at one site; fold each and report the pair joined, so a
    // number in only one arm is still seen.
    const a = foldString(node.whenTrue), b = foldString(node.whenFalse);
    if (!a && !b) return null;
    return {
      text: [a?.text, b?.text].filter(Boolean).join(' ‖ '),
      subs: (a?.subs ?? 0) + (b?.subs ?? 0),
    };
  }
  return null;
}

/** JSX and `+`-folded prose keeps source newlines and indentation. */
// ISO DATES ARE NOT BOUNDS. Measured on this tree: `2026-08-29` inside a
// collision-tool description yields a bare "8" that matches BGANIM_PHASE_BANKS
// and TILE_WIDTH_PX. Masked before any digit test, like the `${…}` holes.
const maskDates = (s) => s.replace(/\d{4}-\d{2}-\d{2}/g, '<date>');
const normalise = (s) => maskDates(s.replace(/\s+/g, ' ').trim());

function collect(sourceText, fileName) {
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const push = (node, where) => {
    const folded = foldString(node);
    if (!folded) return;
    const text = normalise(folded.text);
    if (text.length < 20) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    found.push({ file: fileName, line, where, text, subs: folded.subs });
  };
  (function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (FACING_JSX_ATTRS.has(name)) push(node.initializer, `jsx ${name}=`);
    } else if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)
        ? node.name.text : null;
      if (key && FACING_KEYS.has(key)) push(node.initializer, `prop ${key}:`);
    } else if (ts.isJsxText(node)) {
      const text = normalise(node.text);
      if (text.length >= 20) {
        found.push({
          file: fileName,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          where: 'jsx text', text, subs: 0,
        });
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
  return found;
}

// A STANDALONE integer: not part of a word, not part of a version or a path, not
// inside a `${}` hole. `8x8` and `4bpp` are deliberately excluded — those are
// compound tokens, not a restated constant.
const INT_RE = /(?<![\w.$])(\d+)(?![\w.])/g;

function integersIn(text) {
  const out = [];
  for (const m of text.matchAll(INT_RE)) {
    const v = Number(m[1]);
    if (v >= 2) out.push(v); // 0 and 1 are almost never a restated constant
  }
  return out;
}

function sweep(files, readFile) {
  const derived = derivedValues();
  const hits = [];
  for (const f of files) {
    const src = readFile(f);
    if (src === null) continue;
    for (const s of collect(src, f)) {
      const ints = integersIn(s.text);
      if (ints.length === 0) continue;
      const matched = ints.filter(v => derived.has(v));
      hits.push({
        ...s, ints,
        derivedMatches: matched.map(v => `${v} = ${derived.get(v).join(' / ')}`),
      });
    }
  }
  return hits;
}

function listFiles(rev) {
  const args = rev
    ? ['ls-tree', '-r', '--name-only', rev, '--', 'src']
    : ['ls-files', '--', 'src'];
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')))
    .filter(f => !f.includes('__tests__') && !f.endsWith('.d.ts'));
}

function readerFor(rev) {
  if (!rev) return (f) => (existsSync(path.join(ROOT, f)) ? readFileSync(path.join(ROOT, f), 'utf8') : null);
  return (f) => {
    try { return execFileSync('git', ['show', `${rev}:${f}`], { cwd: ROOT, encoding: 'utf8' }); }
    catch { return null; }
  };
}

// ── THE THREE-ARM SELF TEST ──────────────────────────────────────────────────
//
// A positive control alone is not enough, and the third arm is the one that
// matters. An instrument can be built that flags EVERY message carrying a
// number — including the correctly-derived ones — and it would pass a
// find-the-known-defect control perfectly while making the census unreviewable
// and inviting a "fix" to sentences that were already right. So:
//
//   ARM 1  a typed constant on ONE line          -> must be FLAGGED
//   ARM 2  a typed constant SPLIT across literals -> must be FLAGGED
//          (the shape a line-based predicate is structurally unable to see)
//   ARM 3  the DERIVED form, `${TILE_BYTES}`      -> must NOT be flagged
//
// Arm 3 is why `foldString` replaces every `${…}` hole with a non-numeric token
// before any digit test: masking interpolations is NOT free the way folding is,
// and skipping it is what turns a sweep into noise.
const SELFTEST_ARMS = [
  {
    name: 'ARM 1 — typed constant, one line',
    expect: 'flag',
    src: `const R = { title: 'cols * 32 bytes per pattern ROW must be a power of two' };`,
  },
  {
    name: 'ARM 2 — typed constant SPLIT across two adjacent literals',
    expect: 'flag',
    // Neither literal carries the finding alone: the first has the subject and
    // no number, the second has the number and no subject. This is the shape
    // aeon named as their predicate's blind spot, and it is Aurora's DOMINANT
    // shape — multi-line JSX titles and `+`-concatenated hints.
    src: `const R = { title: 'cols must be constrained so that the pattern row is '\n`
      + `  + '32 bytes times cols, an exact power of two' };`,
  },
  {
    name: 'ARM 3 — the DERIVED form must NOT be flagged',
    expect: 'clean',
    src: 'const R = { title: `cols * ${TILE_BYTES} bytes per pattern ROW must be a power of two` };',
  },
];

function runSelfTest() {
  const derived = derivedValues();
  let failed = 0;
  for (const arm of SELFTEST_ARMS) {
    const strings = collect(arm.src, 'selftest.ts');
    const flagged = strings.filter(s => integersIn(s.text).some(v => derived.has(v)));
    const got = flagged.length > 0 ? 'flag' : 'clean';
    const ok = got === arm.expect;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${arm.name}`);
    console.log(`        expected ${arm.expect}, got ${got}`);
    for (const s of strings) {
      console.log(`        folded: ${JSON.stringify(s.text)}`);
      console.log(`        integers seen: [${integersIn(s.text).join(', ')}]`);
    }
    if (strings.length === 0) {
      console.log('        folded: (no author-facing string collected)');
      // A collect() that returns nothing makes "clean" meaningless — arm 3
      // would pass for the wrong reason, which is the vacuous-green shape.
      if (arm.expect === 'clean') {
        console.log('        ⚠ ARM 3 IS VACUOUS: nothing was collected, so "not flagged"');
        console.log('          proves nothing about masking. Counted as a FAILURE.');
        failed += 1;
      }
    }
    console.log('');
  }
  return failed;
}

// The four sites this parcel was briefed with — the control's expected returns.
const CONTROL_SITES = [
  ['src/renderer/components/effects/EffectsScenePanel.tsx', /15 = term zero/],
  ['src/renderer/components/effects/EffectsScenePanel.tsx', /15 = single term/],
  ['src/renderer/components/effects/BgAnimBandPanel.tsx', /cols \* 32 bytes per pattern ROW/],
  ['src/renderer/components/effects/BgAnimBandPanel.tsx', /rows \* 32 bytes per column/],
];

const argv = process.argv.slice(2);
const control = argv.includes('--control');
const revFlag = argv.indexOf('--rev');
let rev = revFlag >= 0 ? argv[revFlag + 1] : null;
if (control && !rev) {
  rev = execFileSync('git', ['merge-base', 'HEAD', 'master'], { cwd: ROOT, encoding: 'utf8' }).trim();
}

const hits = sweep(listFiles(rev), readerFor(rev));
hits.sort((a, b) => (b.derivedMatches.length - a.derivedMatches.length)
  || a.file.localeCompare(b.file) || a.line - b.line);

if (control) {
  console.log('THREE-ARM SELF TEST (synthetic, independent of tree state)\n');
  const armFailures = runSelfTest();

  console.log(`POSITIVE CONTROL against ${rev}`);
  console.log(`  swept ${listFiles(rev).length} source files, ${hits.length} candidate strings\n`);
  let missing = 0;
  for (const [file, re] of CONTROL_SITES) {
    const hit = hits.find(h => h.file === file && re.test(h.text));
    if (hit) {
      console.log(`  FOUND  ${hit.file}:${hit.line}  [${hit.where}]  subs=${hit.subs}`);
      console.log(`         ${JSON.stringify(hit.text)}`);
      console.log(`         derived-value matches: ${hit.derivedMatches.join('; ') || '(none)'}`);
    } else {
      missing += 1;
      console.log(`  MISSED ${file}  ${re}`);
    }
    console.log('');
  }
  if (missing || armFailures) {
    if (missing) {
      console.log(`CONTROL FAILED: ${missing}/${CONTROL_SITES.length} briefed sites not returned.`);
      console.log('The predicate is broken, not the repo clean.');
    }
    if (armFailures) {
      console.log(`SELF TEST FAILED: ${armFailures}/${SELFTEST_ARMS.length} arm(s).`);
    }
    process.exit(1);
  }
  console.log(`CONTROL PASSED: ${CONTROL_SITES.length}/${CONTROL_SITES.length} briefed sites returned by the predicate, `
    + `${SELFTEST_ARMS.length}/${SELFTEST_ARMS.length} self-test arms green `
    + '(finds a same-line bound, finds a split-literal bound, does NOT flag the derived form).');
  process.exit(0);
}

console.log(`Swept ${listFiles(rev).length} source files${rev ? ` at ${rev}` : ' in the worktree'}.`);
console.log(`${hits.length} author-facing strings carry a standalone integer.\n`);
const ranked = hits.filter(h => h.derivedMatches.length > 0);
console.log(`── RANK 1: integer equals a value the repo DERIVES from a vendored artifact (${ranked.length}) ──\n`);
for (const h of ranked) {
  console.log(`${h.file}:${h.line}  [${h.where}]  subs=${h.subs}`);
  console.log(`  ${JSON.stringify(h.text)}`);
  console.log(`  ${h.derivedMatches.join('; ')}`);
  console.log('');
}
console.log(`── RANK 2: integer with no vendored counterpart (${hits.length - ranked.length}) ──\n`);
for (const h of hits.filter(h => h.derivedMatches.length === 0)) {
  console.log(`${h.file}:${h.line}  [${h.where}] ${JSON.stringify(h.text.slice(0, 140))}`);
}
