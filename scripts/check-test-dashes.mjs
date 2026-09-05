#!/usr/bin/env node
// NO EM DASH AND NO EN DASH IN TEXT THE TEST TREE SHOWS A PERSON.
//
// Owner ruling, 2026-09-05, all tools: no U+2014 and no U+2013 in text a tool
// shows a person, nor in the instruction docs agents read. Committed history is
// NOT retro swept.
//
// A test file shows a person text constantly. A vitest title is printed on
// every run; the message argument of an `expect` is the whole explanation a
// reader gets when it fails; a thrown Error, a `console.warn`, a `ctx.skip`
// reason all end up on somebody's terminal. Those are squarely inside the
// ruling. The test tree was swept for them on 2026-09-05 and this keeps it
// swept.
//
// WHY A SIBLING AND NOT A WIDER GLOB ON check-src-dashes
//
// The cheap move is to delete two `.filter()` lines from
// `scripts/check-src-dashes.mjs` and let it swallow the tests. Three reasons
// not to.
//
//   1. That file's name says `src`, and half this population is not under
//      `src` at all. A name that outlives its scope is how a reader learns to
//      distrust the whole chain; the components gate already made this
//      argument for itself and it applies again here.
//   2. This population needs machinery that one does not: an ALLOWANCES list
//      for expected-value strings (see below), which is a concept that only
//      exists in a test file. Folding it in would put test-only reasoning in
//      the middle of a gate about providers and stores.
//   3. The two buckets were swept by different parcels on different days. Two
//      gates fail independently and say which sweep regressed. One merged gate
//      says only that something, somewhere, came back.
//
// If they ever drift into saying the same thing, merge them and rename in one
// change, with the citations in `docs/` updated in that same change.
//
// WHAT IT COUNTS
//
// Every dash inside a StringLiteral, a JsxText, a RegularExpressionLiteral, or
// any part of a template literal, in BOTH spellings: the character, and the
// backslash-u escape, which renders identically and which no character grep can
// see. The components sweep found its 210th that way after a first count of 209.
//
// THE REGEX LITERAL IS IN THE LIST ON PURPOSE, and it is a hole the two sibling
// gates still have. A regex literal is neither a comment nor a string, so a
// dash inside one is invisible to check-src-dashes and check-tsx-dashes alike.
// Measured on 2026-09-05: that hole has NO live occupants in either of their
// populations, and SEVEN in the buckets this parcel censused (two here, five in
// the deferred harness scripts). "There are none of these today" is exactly the
// exclusion this repo has been burned by, so the kind is counted structurally
// here rather than left out on a count that happens to be zero. The two live
// ones are allowed BY NAME below, because they are quotations, not prose.
//
// WHAT IT DELIBERATELY DOES NOT COUNT, and why in each case
//
// COMMENTS. Not because the ruling is only about "the app" -- it is not, and
// reading it that way is what made this whole bucket look out of scope when it
// was first sized. The real reason is narrower and it is the only one that
// holds: NO TOOL SHOWS A COMMENT TO A PERSON. A comment is never printed by
// vitest, never thrown, never logged. This repo's comments are its design
// record, and a gate that failed on them would be asking for the record to be
// degraded in exchange for nothing a person ever reads.
//
// THE HARNESS SCRIPTS. `scratchpad/**` (the `harness:*` entries in
// package.json) is a SEPARATE, DEFERRED bucket: it carried 2,386 in-code
// dashes across 192 files when this gate was written, against 1,504 across 304
// files here. Its `check()` labels and thrown errors are just as much text a
// tool shows a person, and it should be swept. The cut is a mechanism, not a
// stopping point: this gate holds the population `npm test` executes on every
// run; that one is run by hand, one harness at a time. When it is swept, widen
// DIRS below and rewrite this paragraph.
//
// THE .tsx COMPONENTS. Held by `scripts/check-tsx-dashes.mjs`, whose glob is
// all of `src/**/*.tsx` and therefore already covers any component test. The
// non-test `src/**/*.ts` is held by `scripts/check-src-dashes.mjs`.
//
// VENDORED DOCUMENTS, EXCLUDED STRUCTURALLY. A file whose whole point is byte
// identity with an upstream revision must keep upstream's punctuation, and the
// drift gate that proves the identity is what would go red if a sweep touched
// it. So the exclusion is a PATH RULE, derived from the presence of a sibling
// `<name>.provenance.json`, and NOT from the observation that a given vendored
// file happens to be dash free today. `test/fixtures/effects/ojz_act1_depth.json`
// carries one right now, from aeon, and stripping it would be the defect.
//
// EXPECTED VALUES, VIA AN ALLOWLIST. Some strings in a test are not prose at
// all: they are the value something else produces, quoted so the test can
// compare against it. Rewriting one of those does not improve any sentence a
// person reads; it makes the test assert a string nothing emits. Those are
// listed in ALLOWANCES, each naming what produces it. AN ALLOWANCE THAT
// MATCHES NOTHING IS A FAILURE, not a silent pass: a permission with no live
// subject has outlived its reason and must be deleted rather than left
// standing.
//
// TWO PROPERTIES THIS FILE HOLDS ABOUT ITSELF
//
// SELF-VISIBILITY. `scripts/check-tsx-dashes.mjs` is scoped to `.tsx` and so
// cannot see its own text; a gate that cannot see itself is one bad success
// line away from being a liar. This one is in its own population: the last
// entry of `files()` is this file, scanned RAW, comments included. A gate's own
// text is read by exactly the person it just failed, so it is held to the
// stricter rule on purpose. It also NEVER SPELLS EITHER CHARACTER: the pattern
// is built from `String.fromCharCode`, the way `check-guide-text.mjs` does it,
// so a dash cannot enter this file as part of its own machinery.
//
// A PLANTED VIOLATION, EVERY RUN. A gate that reports zero is indistinguishable
// from a gate that looks at nothing, and this repo's dominant defect class is
// the guard that asserts nothing. So before it believes any count, this file
// runs its classifier over a synthetic source carrying four known positives --
// comment and code, character and escape -- and refuses to print OK unless it
// saw the two code ones and neither comment one. If the AST walk breaks, the
// canary dies loudly instead of the gate quietly reporting a clean tree.
//
// Run: node scripts/check-test-dashes.mjs   (also in the `npm test` chain)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = 'scripts/check-test-dashes.mjs';
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

// Never spelled literally in this file: see SELF-VISIBILITY above.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const DASH_SRC = `[${EM}${EN}]|\\\\u201[34]`;
const dashRe = () => new RegExp(DASH_SRC, 'g');

/**
 * The test tree, as a DIRECTORY rule. Anything under one of these prefixes with
 * a code extension is in the population. Derived from where this repo puts
 * tests, and cross-checked below against vitest's own default test glob so the
 * rule cannot quietly go stale when someone adds a directory.
 */
const DIRS = ['test/', 'src/test/'];
const IN_TESTS_DIR = '/__tests__/';
const CODE_EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;

/**
 * Strings a test QUOTES rather than writes: the value some other program emits,
 * carried here so an assertion can compare against it. `text` must appear on the
 * offending line and must itself be free of both dashes (asserted below, or this
 * file could not hold its own self-scan). `produced_by` is what emits it.
 */
const ALLOWANCES = [
  {
    file: 'src/renderer/agent/__tests__/agent-handler.assign-section-preset.test.ts',
    text: 'no sidecar carries a rasterRef',
    why: 'a regex matching RASTER_SECTION_BINDING_LIMIT, which quotes aeon\'s own pytest '
      + 'failure message verbatim so an author can match a build log. Rewriting the pattern '
      + 'would make the test assert a message aeon does not emit.',
    produced_by: 'src/core/formats/raster-binding.ts, itself an allowed quotation in '
      + 'scripts/check-src-dashes.mjs, read from aeon tools/test_effects_seam_gate.py:758',
  },
  {
    file: 'src/renderer/components/effects/__tests__/band-preset-wording.test.ts',
    text: 'no sidecar carries a rasterRef',
    why: 'the same quotation, asserted here against the disclosure body the panel renders',
    produced_by: 'src/core/formats/raster-binding.ts, itself an allowed quotation in '
      + 'scripts/check-src-dashes.mjs, read from aeon tools/test_effects_seam_gate.py:758',
  },
];

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const allTracked = git('ls-files');
if (allTracked.length === 0) {
  console.error(`${SELF}: git ls-files returned NOTHING. Cannot measure; refusing to report a`);
  console.error('clean tree from an empty enumeration.');
  process.exit(1);
}
const trackedSet = new Set(allTracked);

/** Vendored: a file with a sibling `<name>.provenance.json`. See the docblock. */
const isVendored = (rel) => trackedSet.has(rel.replace(/\.[^./]+$/, '') + '.provenance.json');

const inTestTree = (rel) => CODE_EXT.test(rel)
  && (DIRS.some((d) => rel.startsWith(d)) || rel.includes(IN_TESTS_DIR));

function files() {
  const pop = allTracked.filter(inTestTree).filter((f) => !isVendored(f));
  // This file is in its own population, scanned raw. See SELF-VISIBILITY.
  pop.push(SELF);
  return pop;
}

// ── The population rule, cross-checked against vitest's own default glob ─────
//
// vitest's zero-config include is `**/*.{test,spec}.?(c|m)[jt]s?(x)`. Every
// tracked file matching that under `src/` or `test/` is a file whose author had
// every reason to expect would run and be printed. If the DIRS rule above ever
// stops covering one of them, the gate has a hole, and a hole that reports zero
// is the failure mode this repo keeps hitting. Loud, not silent.
const VITEST_DEFAULT = /\.(test|spec)\.(c|m)?[jt]sx?$/;
function assertPopulationCoversVitestDefault(pop) {
  const covered = new Set(pop);
  const shaped = allTracked
    .filter((f) => (f.startsWith('src/') || f.startsWith('test/')) && VITEST_DEFAULT.test(f))
    .filter((f) => !isVendored(f));
  if (shaped.length === 0) {
    console.error(`${SELF}: found NO test-shaped files anywhere under src/ or test/.`);
    console.error('That is not a clean tree, it is a broken enumeration. Refusing to pass.');
    process.exit(1);
  }
  const missed = shaped.filter((f) => !covered.has(f));
  if (missed.length > 0) {
    console.error(`${SELF}: ${missed.length} test-shaped file(s) are NOT in this gate's`);
    console.error('population. The DIRS rule at the top of this file has gone stale: a test');
    console.error('vitest would collect by its own default glob is not being scanned, so a');
    console.error('dash in its titles would pass unseen. Widen DIRS.');
    for (const f of missed) console.error(`  ${f}`);
    process.exit(1);
  }
  return shaped.length;
}

const STRINGY = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
  // Neither a comment nor a string. See THE REGEX LITERAL above.
  ts.SyntaxKind.RegularExpressionLiteral,
]);

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

const lineAt = (text, off) => {
  const a = text.lastIndexOf('\n', off) + 1;
  let b = text.indexOf('\n', off);
  if (b < 0) b = text.length;
  return text.slice(a, b);
};

/**
 * Every dash in `text` that sits inside a string, a template part or JSX text.
 * `raw: true` reports every dash anywhere, comments included (this file's own
 * rule).
 */
function scan(rel, text, { raw = false } = {}) {
  const found = [];
  const probe = dashRe();
  if (!probe.test(text)) return found;

  if (raw) {
    const re = dashRe();
    let m;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index).split('\n');
      found.push({
        rel, line: before.length, col: before[before.length - 1].length + 1,
        spelling: m[0].length === 1 ? 'literal' : 'escape',
        src: lineAt(text, m.index).trim().slice(0, 140),
      });
    }
    return found;
  }

  const kind = /\.(tsx|jsx)$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
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

  const re = dashRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    const off = m.index;
    if (inComment(off) || !stringyAt(off)) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(off);
    found.push({
      rel, line: line + 1, col: character + 1,
      spelling: m[0].length === 1 ? 'literal' : 'escape',
      src: lineAt(text, off).trim().slice(0, 140),
    });
  }
  return found;
}

// ── The planted violation. See A PLANTED VIOLATION, EVERY RUN. ───────────────
function canary() {
  // The escape spelling is assembled rather than typed, for the same reason the
  // characters are: this file is scanned raw against its own rule, and a literal
  // `backslash u 2014` here would be a finding in the gate that reports it.
  const esc = (n) => `${String.fromCharCode(0x5c)}u201${n}`;
  const src = [
    `// a comment ${EM} and an escape ${esc(3)} in a comment too`,
    `const inString = "prose ${EN} here";`,
    'const inTemplate = `prose ' + esc(4) + ' here`;',
    `const inRegex = /prose ${EM} here/;`,
  ].join('\n');
  const hits = scan('canary.ts', src);
  const spellings = hits.map((h) => h.spelling).sort().join(',');
  const ok = hits.length === 3 && spellings === 'escape,literal,literal';
  if (!ok) {
    console.error(`${SELF}: THE CANARY FAILED. Its own classifier was given five known`);
    console.error('positives (comment, string, template and regex; character and escape) and did');
    console.error(`not come back with exactly the three code ones. It saw ${hits.length}: ${spellings || '(none)'}.`);
    console.error('A count from a broken classifier is not a clean tree, it is no measurement');
    console.error('at all, so this refuses rather than reporting zero.');
    for (const h of hits) console.error(`  line ${h.line} (${h.spelling})  ${h.src}`);
    process.exit(1);
  }
  return hits.length;
}

const canarySaw = canary();

for (const a of ALLOWANCES) {
  if (dashRe().test(a.text)) {
    console.error(`${SELF}: an ALLOWANCE's own \`text\` carries a dash, so this file cannot`);
    console.error('pass its own raw self-scan. Quote a dash-free fragment of the offending line.');
    console.error(`  ${a.file}: ${JSON.stringify(a.text)}`);
    process.exit(1);
  }
}

const pop = files();
const shapedCount = assertPopulationCoversVitestDefault(pop);

const findings = [];
for (const rel of pop) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  findings.push(...scan(rel, text, { raw: rel === SELF }));
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
  console.error(`${SELF}: ${stale.length} allowance(s) match NOTHING in the tree.`);
  console.error('An allowance with no live subject has outlived its reason. Delete it rather than');
  console.error('leaving a standing permission nobody can trace to a string.');
  for (const a of stale) console.error(`  ${a.file}: ${JSON.stringify(a.text)}  (${a.produced_by})`);
}

if (live.length > 0) {
  bad = true;
  const selfHits = live.filter((f) => f.rel === SELF);
  console.error(`${SELF}: ${live.length} dash(es) in text the test tree shows a person, across `
    + `${new Set(live.map((f) => f.rel)).size} file(s) of ${pop.length}.`);
  console.error('A dash does several different jobs and each wants a different repair: commas or');
  console.error('brackets for an aside, a colon for an appositive, a full stop before a consequence,');
  console.error('"to" for a range. Read the sentence and repair it; do not substitute blindly.');
  if (selfHits.length > 0) {
    console.error(`${selfHits.length} of them are in THIS FILE, which is in its own population and`);
    console.error('is scanned raw, comments included. Build the pattern from character codes.');
  }
  for (const f of live) console.error(`  ${f.rel}:${f.line}:${f.col}  (${f.spelling})\n      ${f.src}`);
}

if (bad) process.exit(1);

console.log(`${SELF.replace('scripts/', '').replace('.mjs', '')}: OK: ${pop.length} file(s) of the `
  + `test tree (test/, src/test/, any __tests__/) plus this gate itself, no U+2014 or U+2013 in any `
  + `string, template or JSX text, in either spelling. The planted canary saw its ${canarySaw} code `
  + `positives and neither comment one, so the classifier is live. ${shapedCount} test-shaped file(s) `
  + `by vitest's own default glob, all inside the population. Out of scope and saying so: comments `
  + `(no tool shows one to a person), scratchpad/ harness scripts (a separate deferred bucket), .tsx `
  + `(check-tsx-dashes) and non-test src .ts (check-src-dashes), and any file with a sibling `
  + `.provenance.json (vendored, byte identity with upstream). ${ALLOWANCES.length} quoted `
  + `expected-value string(s), each still live.`);
