/**
 * check-pseudo-skip — fail the run when a test body announces a skip and then
 * RETURNS, because `return` from a test body is a PASS.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE SKIP REPORTER
 * ---------------------------------------------------
 * `scripts/skip-report-reporter.mjs` (the layer above) closes "a test skipped
 * and would not say why". It is structurally UNABLE to close this one. A test
 * shaped like
 *
 *     it('measures the real file', () => {
 *       if (!existsSync(FIXTURE)) { console.warn('skipped: no checkout'); return; }
 *       …
 *     });
 *
 * never skips. It reports PASSED. Its failure state and its success state emit
 * the same artifact — a green row — so no reporter, no total and no exit code
 * can tell them apart. Nothing downstream of the runner can see it. The only
 * place the difference is still visible is the SOURCE, which is why this gate is
 * a static pass and not a reporter.
 *
 * Measured 2026-08-29 (docs/reviews/2026-08-29-fixture-absent-honesty.md): six
 * tests across four files were in exactly this state. Two of them had been
 * passing while measuring nothing on every checkout but a linked worktree, for
 * as long as they had existed, and no run of the suite could ever have said so.
 *
 * WHAT IT LOOKS FOR — two shapes, both found in the tree, both inside a test
 * callback (nothing outside `it(...)`/`test(...)` is examined, so a helper that
 * walks a directory and returns early is not touched):
 *
 *   1. ANNOUNCED — a `console.warn|log|error` whose message says "skip" or
 *      "unmeasurable", followed by a `return`. This is the loud one: the author
 *      knew the row was not measuring and said so to a stream nobody reads.
 *   2. SILENT — a `return` guarded directly by an absence check
 *      (`existsSync`, `peerRepo`, `referenceTree`, `referenceFile`). This one
 *      does not even leave a console line; one instance in the tree carried a
 *      comment delegating its honesty to a DIFFERENT file's skip.
 *
 * THE FIX IS ALWAYS THE SAME, and the message below says it: take `ctx` and
 * call `ctx.skip(reason)`. That reaches `TestCase.result().note`, which the skip
 * reporter prints and enforces. This gate does NOT object to skipping.
 *
 * ANTI-VACUOUS
 * ------------
 * A checker that scanned no files would print "0 violations" and pass, which is
 * the exact disease this repo keeps catching. So: zero test files found is a
 * COULD-NOT-MEASURE exit, and the count of files actually scanned is printed on
 * every run, clean or not.
 *
 * EXIT CODES
 *   0  no pseudo-skips
 *   1  at least one pseudo-skip
 *   2  could not measure (no test files found, or a directory could not be read)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Same two roots vitest.config.ts collects from. */
const ROOTS = ['test', 'src'];

function testFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.ts')) out.push(p);
    }
  };
  for (const r of ROOTS) {
    const p = join(ROOT, r);
    // A root that cannot be read must not look like a root with no tests in it.
    try {
      if (!statSync(p).isDirectory()) throw new Error(`${p} is not a directory`);
    } catch (e) {
      console.error(`check-pseudo-skip: COULD NOT MEASURE — cannot read ${p}: ${e.message}`);
      process.exit(2);
    }
    walk(p);
  }
  return out.sort();
}

/**
 * Mark every character that sits inside a string, template or comment, so the
 * paren matcher below cannot be fooled by a brace in a message and the pattern
 * matcher can still read message TEXT (the mask is consulted, not applied).
 */
function maskOf(src) {
  const mask = new Uint8Array(src.length); // 1 = inside string/template/comment
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') mask[i++] = 1;
      continue;
    }
    if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') mask[i++] = 1;
      mask[i++] = 1; mask[i++] = 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      mask[i++] = 1;
      while (i < src.length) {
        if (src[i] === '\\') { mask[i++] = 1; mask[i++] = 1; continue; }
        if (src[i] === quote) { mask[i++] = 1; break; }
        mask[i++] = 1;
      }
      continue;
    }
    i++;
  }
  return mask;
}

/** Spans of every `it(...)` / `test(...)` call, as [start,end) into src. */
function testCallSpans(src, mask) {
  const spans = [];
  const re = /\b(it|test)\s*(\.\s*\w+\s*)?\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    if (mask[open]) continue;
    // A char before an identifier start would make this `xit(` or `unit(`.
    const prev = m.index > 0 ? src[m.index - 1] : ' ';
    if (/[A-Za-z0-9_$.]/.test(prev)) continue;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (mask[i]) continue;
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { i++; break; } }
    }
    spans.push([open, i]);
  }
  return spans;
}

const ANNOUNCED = /console\s*\.\s*(?:warn|log|error)\s*\([^;]*?(?:skip|unmeasurable)[^;]*?;\s*(?:\n\s*)?return\s*;/gis;
const SILENT = /if\s*\([^;{)]*\b(?:existsSync|peerRepo|referenceTree|referenceFile)\b[^;{]*\)\s*return\s*;/gis;

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

const files = testFiles();
if (files.length === 0) {
  console.error(
    'check-pseudo-skip: COULD NOT MEASURE — no *.test.ts files were found under ' +
    ROOTS.join(', ') + '.\n' +
    '  This run says NOTHING about whether any test fakes a skip; it is not evidence that none does.',
  );
  process.exit(2);
}

const violations = [];
let spans = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const mask = maskOf(src);
  for (const [start, end] of testCallSpans(src, mask)) {
    spans++;
    const body = src.slice(start, end);
    for (const [rule, re] of [['ANNOUNCED', ANNOUNCED], ['SILENT', SILENT]]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(body)) !== null) {
        const at = start + m.index;
        if (mask[at]) continue;
        violations.push({
          file: relative(ROOT, file),
          line: lineOf(src, at),
          rule,
          text: m[0].replace(/\s+/g, ' ').trim().slice(0, 140),
        });
      }
    }
  }
}

console.log(`check-pseudo-skip: scanned ${spans} test bod(y|ies) in ${files.length} file(s).`);

// THE ALTERNATIVE GREEN PATH, ruled out rather than assumed away. Everything
// above only examines text INSIDE an `it(...)`/`test(...)` call. If that matcher
// stopped finding calls — a formatting change, a wrapper macro, a bad regex —
// this gate would examine nothing, find nothing, and report a confident clean
// bill of health. Files scanned would still read 418. So the number that has to
// be non-zero is the number of BODIES, and it is checked, not merely printed.
if (spans === 0) {
  console.error(
    'check-pseudo-skip: COULD NOT MEASURE — found ' + files.length + ' test file(s) but not one\n' +
    '  `it(...)`/`test(...)` call inside them. Nothing was examined, so this run is\n' +
    '  NOT evidence that no test fakes a skip.',
  );
  process.exit(2);
}

if (violations.length === 0) {
  console.log('check-pseudo-skip: OK — no test body announces a skip and then returns.');
  process.exit(0);
}

console.error('');
console.error(`check-pseudo-skip: FAIL — ${violations.length} test body/bodies RETURN instead of skipping.`);
console.error('');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(`      ${v.text}`);
}
console.error(
  '\n' +
  '  A `return` from a test body is a PASS. The row lands in the green column\n' +
  '  having touched none of its subject, and — this is the part that matters —\n' +
  '  there is then NO INPUT that can ever turn it red. A console line saying\n' +
  '  "skipped" reaches no reporter, no total and no exit code.\n' +
  '\n' +
  '  SKIPPING IS NOT THE PROBLEM and this gate does not object to it. Take the\n' +
  '  test context and say so on the one surface that carries a reason:\n' +
  '\n' +
  "      it('name', (ctx) => {\n" +
  "        if (!existsSync(FIXTURE)) { ctx.skip(`${FIXTURE} is absent`); return; }\n" +
  '        …\n' +
  '      });\n' +
  '\n' +
  '  or, for a whole block, the options form that scripts/skip-report-reporter.mjs\n' +
  '  reads:\n' +
  '\n' +
  "      describe('name', { skip: !PRESENT, meta: { skipReason: `${FIXTURE} is absent` } }, …)\n" +
  '\n' +
  '  test/support/fixture-tree.ts has helpers for both, and its skip reasons name\n' +
  '  the exact file that could not be read.\n',
);
process.exit(1);
