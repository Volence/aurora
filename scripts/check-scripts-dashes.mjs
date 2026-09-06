#!/usr/bin/env node
// NO EM DASH AND NO EN DASH IN THE TEXT `scripts/` SHOWS A PERSON.
//
// Owner ruling, 2026-09-05, all tools: no U+2014 and no U+2013 in TEXT A TOOL
// SHOWS A PERSON, nor in the instruction docs agents read. Committed history is
// NOT retro swept.
//
// This bucket is the purest case of that ruling in the repo. `scripts/` is
// nearly all GATE OUTPUT: the COULD NOT MEASURE banner, the FAIL body, the
// remediation paragraph, the name of the canary that misbehaved. It is the text
// a person reads at the exact moment `npm test` stops, when they are least
// inclined to decode a punctuation mark. 147 in-code dashes across 15 files
// were swept on 2026-09-05 and this keeps them swept.
//
// WHY A SIBLING AND NOT A WIDENED GLOB ON ONE OF THE FOUR EXISTING GATES
//
// The obvious move is to add `scripts/` to `check-test-dashes.mjs`'s DIRS, or
// to drop a filter in `check-src-dashes.mjs`. Four reasons not to.
//
//   1. Every one of those gates is named after its population, and none of
//      those names covers this one. A name that outlives its scope is how a
//      reader learns to distrust the whole chain; check-src-dashes made that
//      argument for itself and check-test-dashes made it again.
//   2. This population needs machinery none of them has. `package.json` is in
//      it, and `package.json` is not a TypeScript file: it has to be read
//      DECODED, because it stores its dashes as escapes and a character grep of
//      it reports a clean file (see PACKAGE.JSON below). Folding a JSON decoder
//      into a gate about test titles would put this bucket's reasoning in the
//      middle of that one.
//   3. This population needs a COUPLING check none of them has, because this
//      bucket is the one whose strings other programs assert on (see THE
//      COUPLED SET).
//   4. Each of the four was swept by a different parcel on a different day.
//      Separate gates fail independently and say WHICH sweep regressed. One
//      merged gate says only that something, somewhere, came back.
//
// If they ever drift into saying the same thing, merge them and rename in one
// change, with the citations in `docs/` updated in that same change.
//
// ═══ THE POPULATION, DERIVED RATHER THAN TYPED ═══
//
// Every tracked file under `scripts/`, from `git ls-files`. NOT a hand-written
// extension list: the census that sized this parcel used
// `\.(mjs|ts|js|cjs)$` and therefore never looked at
// `scripts/skip-report-reporter.d.mts`, which is tracked, which is in the
// bucket, and which nobody had counted. So the rule here is inverted: every
// tracked file under `scripts/` is IN, and anything this gate cannot parse
// makes it REFUSE by name rather than skip in silence. A gate that quietly
// ignores a file it does not recognise reports a clean tree for a population it
// never read.
//
// Plus `package.json` (see below), and this file itself (see SELF-VISIBILITY).
//
// ═══ WHAT IT COUNTS ═══
//
// Every dash inside a StringLiteral, a JsxText, a RegularExpressionLiteral, or
// any part of a template literal, in BOTH spellings: the character, and the
// backslash-u escape, which renders identically and which no character grep can
// see. The components sweep found its 210th that way after a first count of 209.
//
// THE REGEX LITERAL IS COUNTED STRUCTURALLY, and it is not academic here. A
// dash in a `/regex/` is neither a comment nor a string, so it was invisible to
// every dash gate in this repo until 2026-09-05. This bucket had SIX of them,
// and all six were load-bearing: they were the dash patterns THEMSELVES, in
// `append-lane-log.mjs`'s refusal and in the `DASH` constant of
// `check-src-dashes.mjs` and `check-tsx-dashes.mjs`. A find-and-replace over
// this directory would have deleted the machinery each of those gates exists to
// run. All three now build the pattern from `String.fromCharCode`, proven
// equivalent by comparing `RegExp.source` and `.flags` against the literal they
// replaced. The KIND is counted because it is a kind that can hold a dash, not
// because a count happened to be non-zero.
//
// ═══ WHAT IT DELIBERATELY DOES NOT COUNT, and why in each case ═══
//
// COMMENTS. 337 of them in this bucket, against 147 in code. The reason given
// in the two oldest dash gates until 2026-09-05 was "the ruling is about text a
// person reads in the app". THAT WAS WRONG, and wrong in the direction that
// costs work: read that way, a vitest failure line, a gate's `COULD NOT
// MEASURE` banner and a thrown Error all look out of scope, because none of
// them is in the app; all three are a tool showing a person text and all three
// are in. It nearly cost this row, which is nothing BUT that kind of text. The
// rule survives, its justification changes to the one that holds: NO TOOL SHOWS
// A COMMENT TO A PERSON. A comment is never printed, thrown or logged. This
// repo's comments are its design record besides, and a gate that failed on them
// would ask for the record to be degraded in exchange for nothing anyone reads.
//
// THE OTHER BUCKETS. `src/**/*.tsx` is held by `check-tsx-dashes.mjs`, non-test
// `src/**/*.ts` plus the generated stylesheet by `check-src-dashes.mjs`, the
// test tree by `check-test-dashes.mjs`, and the in-app guide by
// `check-guide-text.mjs`.
//
// THE HARNESS SCRIPTS UNDER `scratchpad/` ARE STILL DEFERRED, and this parcel
// makes that deferral more dangerous rather than less, which is why the coupled
// set below is recorded in executable form.
//
// VENDORED DOCUMENTS, EXCLUDED STRUCTURALLY. A file whose whole point is byte
// identity with an upstream revision must keep upstream's punctuation. So the
// exclusion is a PATH RULE, derived from the presence of a sibling
// `<name>.provenance.<anything>`, and NOT from the observation that a given
// vendored file happens to be dash free today. THE EXTENSION WILDCARD IS
// LOAD-BEARING: 10 of this repo's 11 markers are `.provenance.json` and the
// eleventh is `.provenance.md`, and a `.json`-only version of this rule called
// that one file not-vendored. `assertVendoredRuleSeesEveryMarker` refuses if any
// marker in the tree fails to name a subject the rule recognises, and refuses if
// it finds no markers at all. No file in THIS population is vendored today,
// which is exactly why the rule is written rather than left out.
//
// ═══ PACKAGE.JSON, AND WHY THE ESCAPE ARM IS NOT OPTIONAL ═══
//
// `package.json` is in this population because the `npm test` chain, the
// `check:*` entries and the harness list all live in it, and because its
// `description` is text npm and every editor show a person.
//
// A CHARACTER GREP OF THAT FILE REPORTS IT CLEAN AND ALWAYS WILL. It has zero
// raw dash characters. It carried seven, every one stored as a backslash-u
// escape, because `JSON.stringify` and python's `json.dumps` both escape
// non-ASCII by default. `scripts/append-lane-log.mjs`'s own header records the
// same trap costing 151 undetected ledger entries. So this gate reads
// `package.json` DECODED, through `JSON.parse`, and judges the decoded string
// values. The `.mjs` half of the population is scanned for both spellings for
// the same reason.
//
// KEYS BEGINNING `//` ARE EXEMPT, and the exemption is structural: a leading
// `//` on a key is this repo's (and the wider npm community's) convention for a
// comment in a format with no comment syntax, and it is exactly what the
// COMMENTS paragraph above exempts. Nothing prints `scripts["//test"]`. The
// exemption is by KEY PREFIX, a fact about the document, and never by "the ones
// that are there today". `description` is not `//`-prefixed and was swept.
//
// ═══ THE COUPLED SET, RECORDED SO THE NEXT SWEEP INHERITS IT ═══
//
// A sweep that changes a producer's punctuation silently kills any consumer
// keyed to it, and a negative assertion dies without a sound. `scripts/` output
// IS consumed. The whole repo was searched from the consumer side to find out
// how much: every string, template part and regex literal in all 1,280 tracked
// code files outside `scripts/`, reduced to its dash-spanning core, looked up in
// every `scripts/` file. Exactly ONE live pair came back, and it is recorded in
// COUPLED below so this gate fails if either half moves:
//
//   test/config/skip-report-reporter.test.ts  asserts, byte for byte,
//   scripts/skip-report-reporter.mjs's `todo` line.
//
// It was proven live rather than assumed: with the producer swept and the
// consumer left at the old spelling ON DISK, that file goes from 11 passed to 1
// failed. Both halves were re-keyed together.
//
// THE PAIR THAT IS SAFE TODAY AND WILL NOT BE SAFE FOR THE DEFERRED BUCKET.
// `scripts/check-ledger-timestamps.mjs` runs 19 canaries whose `want` and
// `absent` arrays assert on the OUTPUT TEXT of
// `scratchpad/ledger-timestamp-audit.py`: a different language, and a bucket
// this parcel does not sweep. The `absent` arm is a NEGATIVE assertion, so a
// message it names changing spelling would make that arm pass vacuously
// forever. Measured here, and the measurement is re-derived on every run rather
// than quoted:
//
//   54 assertion elements: 49 string literals, plus 5 `T(...)` calls that build
//   an ISO timestamp out of digits and ASCII hyphens and can hold no dash. The
//   figure of 49 that reached this parcel counted only the literals; saying 54
//   with the 5 accounted for is what makes it a measurement rather than a
//   sample.
//   0 of the 49 carry a dash.
//   24 of them appear VERBATIM in the Python producer.
//   The producer carries 16 dashes across 15 lines, and FIVE of those 15 lines
//   ALSO carry one of the coupled 24. The coupling survives only because each
//   assertion substring sits BEFORE the dash on its line. "None of them is in
//   the coupled set" is true of the strings and false of the lines, and the
//   sweep of `scratchpad/` will be editing lines.
//
// `assertLedgerPythonCoupling` below re-derives that pairing from both files on
// every run and refuses if any coupled assertion string acquires a dash on
// either side. It is a consumer-side guard built from the producer's own text,
// which is the only shape that cannot pass by both halves being wrong together.
//
// ═══ THREE PROPERTIES THIS FILE HOLDS ABOUT ITSELF ═══
//
// SELF-VISIBILITY. `check-tsx-dashes.mjs` printed an em dash in its own success
// line and, being `.tsx`-scoped, could not detect it. This gate lives in
// `scripts/` and so is in its own population by construction, which is better
// than the arrangement it replaces but is not by itself a proof, so: it is
// scanned RAW, comments included, the way `check-test-dashes.mjs` holds itself.
// A gate's own text is read by exactly the person it just failed.
//
// IT NEVER SPELLS EITHER CHARACTER. The pattern is built from
// `String.fromCharCode`, the way `check-guide-text.mjs` and
// `check-test-dashes.mjs` do it, so a dash cannot enter this file as part of
// its own machinery.
//
// A PLANTED VIOLATION, EVERY RUN. A gate that reports zero is indistinguishable
// from a gate that looks at nothing, and this repo's dominant defect class is
// the guard that asserts nothing. Before it believes any count, this file runs
// its classifier over a synthetic source carrying six known positives (a
// comment, a string, a template, a regex, and the escape spelling in two of
// them) and refuses to print OK unless it saw exactly the four code ones and
// neither comment one. It runs a second canary over a synthetic package.json
// whose dash is stored ONLY as an escape, so the decoded arm cannot rot into a
// character grep. Proven by mutation on 2026-09-05.
//
// Run: node scripts/check-scripts-dashes.mjs   (also in the `npm test` chain)

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = 'scripts/check-scripts-dashes.mjs';
const PREFIX = 'check-scripts-dashes';
const require = createRequire(path.join(ROOT, 'package.json'));
const ts = require('typescript');

// Never spelled literally in this file: see SELF-VISIBILITY above.
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const BSL = String.fromCharCode(0x5c);
// Two backslash characters in the SOURCE STRING, which the RegExp constructor
// reads as one escaped backslash, so the pattern matches a literal backslash
// followed by `u2014`/`u2013`. Written out because the first attempt used four
// and matched two backslashes: the escape arm went dark and only the planted
// canary said so.
const DASH_SRC = `[${EM}${EN}]|${BSL}${BSL}u201[34]`;
const dashRe = () => new RegExp(DASH_SRC, 'g');
const charRe = () => new RegExp(`[${EM}${EN}]`, 'g');

const die = (lines) => {
  for (const l of [].concat(lines)) console.error(l);
  process.exit(1);
};
const cannotMeasure = (msg) => die([
  `${PREFIX}: COULD NOT MEASURE: ${msg}`,
  '  A run that could not measure is a FAILURE here and not a pass. A gate that',
  '  cannot see is not a gate that reported a clean tree.',
]);

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const allTracked = git('ls-files');
if (allTracked.length === 0) cannotMeasure('git ls-files returned NOTHING.');
const trackedSet = new Set(allTracked);

/**
 * Vendored: a file with a sibling `<name>.provenance.<anything>`. See the docblock.
 * The extension is a wildcard on purpose.
 */
const PROVENANCE = /\.provenance\.[^./]+$/;
const isVendored = (rel) => {
  const base = rel.replace(/\.[^./]+$/, '') + '.provenance.';
  for (const f of trackedSet) if (f.startsWith(base) && PROVENANCE.test(f)) return true;
  return false;
};

function assertVendoredRuleSeesEveryMarker() {
  const markers = allTracked.filter((f) => PROVENANCE.test(f));
  if (markers.length === 0) {
    cannotMeasure('found NO .provenance.* markers anywhere in the tree. This repo has them; '
      + 'an enumeration that finds none is broken, not clean.');
  }
  const orphans = [];
  for (const m of markers) {
    const stem = m.replace(PROVENANCE, '');
    const subjects = allTracked.filter((f) => f !== m && f.replace(/\.[^./]+$/, '') === stem);
    if (subjects.length === 0) { orphans.push(`${m}: names no subject file`); continue; }
    for (const s of subjects) {
      if (!isVendored(s)) orphans.push(`${m}: its subject ${s} is NOT recognised as vendored`);
    }
  }
  if (orphans.length > 0) {
    die([`${PREFIX}: ${orphans.length} provenance marker(s) do not line up with a subject.`,
      'A vendored file must keep upstream punctuation, so a marker this gate cannot follow is',
      'a file this gate would sweep. Refusing rather than guessing.',
      ...orphans.map((o) => `  ${o}`)]);
  }
  return markers.length;
}

// ── The population ──────────────────────────────────────────────────────────
//
// Every tracked file under scripts/. Anything this parser cannot read makes the
// gate refuse BY NAME. See THE POPULATION, DERIVED RATHER THAN TYPED.
const PARSEABLE = /\.(?:[mc]?[jt]sx?)$/;

function population() {
  const under = allTracked.filter((f) => f.startsWith('scripts/'));
  if (under.length === 0) cannotMeasure('no tracked files under scripts/ at all.');
  const unreadable = under.filter((f) => !PARSEABLE.test(f) && !isVendored(f));
  if (unreadable.length > 0) {
    die([`${PREFIX}: ${unreadable.length} tracked file(s) under scripts/ that this gate cannot parse.`,
      'It refuses rather than skipping them, because a gate that silently ignores a file it does',
      'not recognise reports a clean tree for a population it never read. That is exactly how',
      'scripts/skip-report-reporter.d.mts went uncounted: the census filter was a typed list of',
      'four extensions. Teach the parser, or give the file a .provenance.* marker if it is vendored.',
      ...unreadable.map((f) => `  ${f}`)]);
  }
  const pop = under.filter((f) => PARSEABLE.test(f)).filter((f) => !isVendored(f));
  if (!pop.includes(SELF)) {
    cannotMeasure(`${SELF} is not in its own population. See SELF-VISIBILITY: a gate that cannot `
      + 'read itself is one bad success line away from being a liar.');
  }
  return pop;
}

/**
 * Cross-check against what package.json actually RUNS. Every `node scripts/<f>`
 * named anywhere in package.json must be in the population; if the rule above
 * ever goes stale, the gate says so instead of quietly shrinking.
 */
function assertPopulationCoversEveryRunner(pop, pkgText) {
  const covered = new Set(pop);
  const named = [...pkgText.matchAll(/node (scripts\/[A-Za-z0-9._-]+)/g)].map((m) => m[1]);
  const uniq = [...new Set(named)];
  if (uniq.length === 0) {
    cannotMeasure('package.json names NO `node scripts/...` runner. That is not a clean tree, '
      + 'it is a broken enumeration.');
  }
  const missed = uniq.filter((f) => !covered.has(f));
  if (missed.length > 0) {
    die([`${PREFIX}: ${missed.length} script(s) package.json RUNS are not in this gate's population.`,
      'Their output is text a person reads on a failing run, and it is not being scanned.',
      ...missed.map((f) => `  ${f}`)]);
  }
  return uniq.length;
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
 * Every dash in `text` inside a string, template part, JSX text or regex
 * literal. `raw: true` reports every dash anywhere, comments included (this
 * file's own rule).
 */
function scan(rel, text, { raw = false } = {}) {
  const found = [];
  if (!dashRe().test(text)) return found;

  if (raw) {
    const re = dashRe();
    let m;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index).split('\n');
      found.push({
        rel, line: before.length, col: before[before.length - 1].length + 1,
        spelling: m[0].length === 1 ? 'literal' : 'escape', kind: 'RAW',
        src: lineAt(text, m.index).trim().slice(0, 140),
      });
    }
    return found;
  }

  const kind = /\.[jt]sx$/.test(rel) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
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
  const stringyAt = (off) => leaves.find((l) => STRINGY.has(l.kind)
    && off >= l.getStart(sf) && off < l.end);

  const re = dashRe();
  let m;
  while ((m = re.exec(text)) !== null) {
    const off = m.index;
    if (inComment(off)) continue;
    const leaf = stringyAt(off);
    if (!leaf) continue;
    const { line, character } = sf.getLineAndCharacterOfPosition(off);
    found.push({
      rel, line: line + 1, col: character + 1,
      spelling: m[0].length === 1 ? 'literal' : 'escape',
      kind: ts.SyntaxKind[leaf.kind],
      src: lineAt(text, off).trim().slice(0, 140),
    });
  }
  return found;
}

/**
 * package.json, judged on DECODED values. Keys beginning `//` are this repo's
 * comment convention and are exempt, structurally, by prefix. See PACKAGE.JSON.
 */
function scanJson(rel, text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { cannotMeasure(`${rel} does not parse: ${e.message}`); }
  const found = [];
  const visit = (v, at, underComment) => {
    if (typeof v === 'string') {
      if (underComment) return;
      const n = (v.match(charRe()) || []).length;
      if (n > 0) found.push({ rel, line: 0, col: 0, spelling: 'decoded', kind: 'JSON', at, n, src: v.slice(0, 140) });
      return;
    }
    if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${at}[${i}]`, underComment)); return; }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) visit(x, `${at}.${k}`, underComment || k.startsWith('//'));
    }
  };
  visit(doc, '$', false);
  return found;
}

// ── THE COUPLED SET. See the docblock. ──────────────────────────────────────
//
// Each row is text that BOTH files must carry, dash free. A sweep of either side
// that changes the spelling names the pair here instead of leaving an assertion
// to pass vacuously.
const COUPLED = [
  {
    text: 'todo: declared unwritten',
    producer: 'scripts/skip-report-reporter.mjs',
    consumer: 'test/config/skip-report-reporter.test.ts',
    why: 'the consumer asserts the reporter\'s todo line byte for byte. Proven live on '
      + '2026-09-05: producer swept, consumer at the old spelling, 11 passed became 1 failed.',
  },
];

function assertCoupledSet() {
  const problems = [];
  for (const c of COUPLED) {
    if (charRe().test(c.text)) { problems.push(`${c.text}: the recorded text itself carries a dash`); continue; }
    for (const side of ['producer', 'consumer']) {
      const p = path.join(ROOT, c[side]);
      if (!existsSync(p)) { problems.push(`${c[side]}: gone, so the pair cannot be checked`); continue; }
      if (!readFileSync(p, 'utf8').includes(c.text)) {
        problems.push(`${c[side]}: no longer carries ${JSON.stringify(c.text)}`);
      }
    }
  }
  if (problems.length > 0) {
    die([`${PREFIX}: ${problems.length} recorded producer/consumer pair(s) no longer agree.`,
      'A sweep that changes a producer\'s punctuation silently kills any consumer keyed to it,',
      'and a negative assertion dies without a sound. Repair BOTH halves together, or delete',
      'the row here if the coupling is genuinely gone.',
      ...problems.map((p) => `  ${p}`)]);
  }
  return COUPLED.length;
}

/**
 * The pair that is safe today and will not be safe for the deferred
 * `scratchpad/` bucket. Re-derived from both files, never quoted. See THE
 * COUPLED SET in the docblock.
 */
const LEDGER_GATE = 'scripts/check-ledger-timestamps.mjs';
const LEDGER_AUDIT = 'scratchpad/ledger-timestamp-audit.py';

function assertLedgerPythonCoupling() {
  for (const f of [LEDGER_GATE, LEDGER_AUDIT]) {
    if (!trackedSet.has(f)) cannotMeasure(`${f} is not tracked, so the ledger/Python coupling cannot be re-derived.`);
  }
  const text = readFileSync(path.join(ROOT, LEDGER_GATE), 'utf8');
  const sf = ts.createSourceFile(LEDGER_GATE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const literals = [];
  let elements = 0;
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name)
      && (n.name.text === 'want' || n.name.text === 'absent')
      && ts.isArrayLiteralExpression(n.initializer)) {
      for (const el of n.initializer.elements) {
        elements += 1;
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) literals.push(el.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (literals.length === 0) {
    cannotMeasure(`found NO want/absent assertion literals in ${LEDGER_GATE}. That gate has 19 `
      + 'canaries; an enumeration that finds none is broken, not clean.');
  }
  const py = readFileSync(path.join(ROOT, LEDGER_AUDIT), 'utf8');
  const coupled = literals.filter((s) => py.includes(s));
  if (coupled.length === 0) {
    cannotMeasure(`none of the ${literals.length} assertion string(s) in ${LEDGER_GATE} appears in `
      + `${LEDGER_AUDIT}. They are supposed to be assertions ON ITS OUTPUT; a pairing that finds `
      + 'nothing means this check is measuring nothing.');
  }
  const dirty = coupled.filter((s) => charRe().test(s));
  if (dirty.length > 0) {
    die([`${PREFIX}: ${dirty.length} coupled ledger assertion string(s) carry a dash.`,
      `${LEDGER_GATE} asserts these against the OUTPUT of ${LEDGER_AUDIT}, which is a different`,
      'language and a bucket nobody has swept. The `absent` arm is a NEGATIVE assertion: if a',
      'message it names changes spelling, that arm passes vacuously forever. Sweep BOTH sides.',
      ...dirty.map((s) => `  ${JSON.stringify(s)}`)]);
  }
  return { elements, literals: literals.length, coupled: coupled.length };
}

// ── The planted violations. See A PLANTED VIOLATION, EVERY RUN. ─────────────
function canary() {
  // The escape spelling is assembled rather than typed: this file is scanned raw
  // against its own rule, and a literal one here would be a finding in the gate
  // that reports it.
  const esc = (n) => `${BSL}u201${n}`;
  const src = [
    `// a comment ${EM} and an escape ${esc(3)} in a comment too`,
    `const inString = "prose ${EN} here";`,
    'const inTemplate = `prose ' + esc(4) + ' here`;',
    `const inRegex = /prose ${EM} here/;`,
    `const alsoEscaped = "prose ${esc(4)} here";`,
  ].join('\n');
  const hits = scan('canary.ts', src);
  const spellings = hits.map((h) => h.spelling).sort().join(',');
  const kinds = new Set(hits.map((h) => h.kind));
  const ok = hits.length === 4
    && spellings === 'escape,escape,literal,literal'
    && kinds.has('RegularExpressionLiteral');
  if (!ok) {
    die([`${PREFIX}: THE CODE CANARY FAILED. Its own classifier was given six known positives`,
      '(comment, string, template and regex; both spellings) and did not come back with exactly',
      `the four code ones. It saw ${hits.length}: ${spellings || '(none)'};`,
      `kinds ${[...kinds].join(',') || '(none)'}.`,
      'A count from a broken classifier is not a clean tree, it is no measurement at all.',
      ...hits.map((h) => `  line ${h.line} (${h.spelling}, ${h.kind})  ${h.src}`)]);
  }

  // The decoded arm, over a package.json whose dash exists ONLY as an escape, so
  // this can never rot back into a character grep. `//`-prefixed keys exempt.
  const jsonText = `{"description":"a ${BSL}u2014 b","//note":"a ${BSL}u2014 b","nested":{"//c":["a ${BSL}u2013 b"],"live":["a ${BSL}u2013 b"]}}`;
  if (charRe().test(jsonText)) {
    die([`${PREFIX}: the JSON canary's own source carries a raw dash character, so it would pass`,
      'for the wrong reason. It must carry the escape spelling ONLY.']);
  }
  const jhits = scanJson('canary.json', jsonText);
  const ats = jhits.map((h) => h.at).sort().join(',');
  if (jhits.length !== 2 || ats !== '$.description,$.nested.live[0]') {
    die([`${PREFIX}: THE JSON CANARY FAILED. Given four escape-spelled dashes, two of them under`,
      '`//`-prefixed (comment) keys, it must report exactly the two live ones.',
      `It reported ${jhits.length}: ${ats || '(none)'}.`,
      'A character grep of package.json reports it clean whether or not a dash is there; if this',
      'arm breaks, this gate becomes that grep.']);
  }
  return { code: hits.length, json: jhits.length };
}

// ── Run ─────────────────────────────────────────────────────────────────────

const canarySaw = canary();
const markerCount = assertVendoredRuleSeesEveryMarker();
const coupledCount = assertCoupledSet();
const ledger = assertLedgerPythonCoupling();

const PKG = 'package.json';
const pkgText = readFileSync(path.join(ROOT, PKG), 'utf8');
const pop = population();
const runnerCount = assertPopulationCoversEveryRunner(pop, pkgText);

const findings = [];
for (const rel of pop) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8');
  findings.push(...scan(rel, text, { raw: rel === SELF }));
}
findings.push(...scanJson(PKG, pkgText));

if (findings.length > 0) {
  const selfHits = findings.filter((f) => f.rel === SELF);
  console.error(`${PREFIX}: ${findings.length} dash(es) in text scripts/ shows a person, across `
    + `${new Set(findings.map((f) => f.rel)).size} file(s) of ${pop.length + 1}.`);
  console.error('Nearly all of this bucket is gate output: the text a person reads at the exact');
  console.error('moment `npm test` stops. A dash does several different jobs and each wants a');
  console.error('different repair: commas or brackets for an aside, a colon for an appositive, a');
  console.error('full stop before a consequence, "to" for a range. Read the sentence and repair');
  console.error('it; do not substitute blindly, and check THE COUPLED SET before touching a');
  console.error('string another program asserts on.');
  if (selfHits.length > 0) {
    console.error(`${selfHits.length} of them are in THIS FILE, which is in its own population and is`);
    console.error('scanned raw, comments included. Build the pattern from character codes.');
  }
  for (const f of findings) {
    console.error(f.kind === 'JSON'
      ? `  ${f.rel}  ${f.at}  (${f.n} decoded)\n      ${f.src}`
      : `  ${f.rel}:${f.line}:${f.col}  (${f.spelling}, ${f.kind})\n      ${f.src}`);
  }
  process.exit(1);
}

console.log(`${PREFIX}: OK: ${pop.length} tracked file(s) under scripts/ plus package.json, no `
  + `U+2014 or U+2013 in any string, template, JSX text or regex literal, in either spelling. `
  + `The code canary saw its ${canarySaw.code} positives (including the regex literal) and neither `
  + `comment one; the JSON canary saw its ${canarySaw.json} decoded positives and neither `
  + `comment-key one, so a character grep could not be standing in for the decoded read. `
  + `${runnerCount} \`node scripts/...\` runner(s) named in package.json, every one inside the `
  + `population; ${markerCount} provenance marker(s), each naming a subject the vendored rule `
  + `recognises. ${coupledCount} recorded producer/consumer pair(s) still agree, and the `
  + `ledger/Python pairing re-derived this run: ${ledger.elements} assertion element(s), `
  + `${ledger.literals} of them string literals, ${ledger.coupled} appearing verbatim in `
  + `${LEDGER_AUDIT}, none carrying a dash. Out of scope and saying so: comments (no tool shows `
  + `one to a person) and package.json keys beginning \`//\` (the same thing in a format with no `
  + `comment syntax), the deferred scratchpad/ harness bucket, .tsx (check-tsx-dashes), non-test `
  + `src .ts (check-src-dashes), the test tree (check-test-dashes), the in-app guide `
  + `(check-guide-text), and any file with a sibling .provenance.* marker (vendored).`);
