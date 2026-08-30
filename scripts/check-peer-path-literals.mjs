/**
 * check-peer-path-literals — fail the run when a test types the ABSOLUTE PATH of
 * a sibling checkout instead of deriving it.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-30 this tree held 34 executable copies of
 * `'/home/volence/sonic_hacks/s1disasm'`, plus 2 of the same shape for
 * `s4_engine`. That literal is one machine's home directory. On any other
 * checkout it names nothing, so every row behind it can only ever SKIP there —
 * unrunnable by construction, and unrunnable in a way that produces no red, no
 * error and no line anyone reads. `test/support/fixture-tree.ts`'s
 * `referencePath()` derives the same path from this repo's own git common dir
 * and honours `AURORA_PEER_ROOT` / `AURORA_<NAME>_REPO`, so the identical row
 * runs on a machine that keeps its peers somewhere else.
 *
 * Measured before and after (docs/reviews/2026-08-30-s1disasm-test-coupling.md):
 * with `AURORA_S1DISASM_REPO` pointed at an absent directory, an fs-level trace
 * of every read under the real tree went from 2 leaked reads to ZERO, and the
 * override began reproducing true absence exactly — 250 reasoned skips, 0
 * failures, byte-identical to denying the directory outright.
 *
 * WHAT IT FORBIDS, AND WHY THAT RULE AND NOT `/home/`
 * --------------------------------------------------
 * Only literals containing THIS repo's own SIBLING ROOT — the directory that
 * holds `aurora` and its peers, derived here exactly as `peer-repo.ts` derives
 * it. A blanket `/home/` ban would be wrong and loud: `join-path.test.ts`,
 * `project-path.test.ts` and `recent-projects.test.ts` legitimately pass
 * fictitious `/home/u/proj` strings to pure functions, and those are test DATA,
 * not machine coupling. The rule is derived from the machine it runs on, so it
 * is not itself a pinned path.
 *
 * COMMENTS ARE EXEMPT ON PURPOSE. Several files quote a historical ENOENT or
 * cite where a measurement was taken. Those are RECORDS; rewriting them destroys
 * provenance and buys nothing, because a comment opens no file.
 *
 * WHAT THIS COVERS — `src/`, `test/` AND `scripts/`, as of 2026-08-30. The count
 * of roots actually scanned is printed on every run; read that line rather than
 * this prose.
 *
 * ⚠ THIS FILE USED TO EXCLUDE `scripts/`, AND USED TO CARRY ITS OWN COPY OF THE
 * SIBLING-ROOT DERIVATION. Those two facts were the same fact. The exclusion was
 * argued from the cost of a second derivation — "converting them would need a
 * SECOND copy of the sibling-root derivation in JS" — while this file WAS that
 * second copy, sitting a hundred lines below the sentence, and it had already
 * drifted: `peer-repo.ts` honours `AURORA_PEER_ROOT` and the copy here never
 * read it. Measured before the fix:
 *
 *     $ AURORA_PEER_ROOT=/nonexistent/relocated node scripts/check-peer-path-literals.mjs
 *     … scanned 918 file(s) … for literals naming /home/volence/sonic_hacks
 *
 * Under that override the tests resolve their fixtures somewhere else entirely,
 * so the gate was forbidding a string no test could use and permitting the one
 * they all did — the check aimed at the wrong target while printing a confident
 * pass. The derivation now lives once, in `test/support/sibling-root.mjs`, which
 * `node` imports directly and `tsc` reads through a signature-only `.d.mts`; so
 * the scripts could be converted, and with nothing left to exclude the exclusion
 * went with them.
 *
 * ANTI-VACUOUS — TWO GUARDS, both checked rather than printed
 * ----------------------------------------------------------
 *   1. A CANARY runs through the identical pipeline on every invocation: a
 *      synthetic source holding one commented occurrence and one executable
 *      occurrence must yield exactly one violation. If the comment stripper ever
 *      eats string literals, or the pattern stops matching, the canary fails and
 *      this exits 2 — because "0 violations" and "I examined nothing" would
 *      otherwise be the same output, and today the honest answer IS 0.
 *   2. Zero files found, or a sibling root that cannot be derived, is exit 2 and
 *      says so. "Could not measure" must never render as "no problems found".
 *
 * KNOWN PROPERTY OF THE MATCH, found while verifying the override and recorded
 * rather than left for someone to rediscover: the test is a plain SUBSTRING of
 * the sibling root, so a very SHORT root produces false positives.
 * `AURORA_PEER_ROOT=/tmp` flags 18 lines, almost all of them legitimate
 * `'/tmp/test.sock'` fixtures. A real peer root (`/home/<user>/<dir>`) is
 * specific enough that this cannot happen, and the failure direction is the
 * safe one — it goes RED and prints every line it judged, so nobody is misled
 * into thinking the tree is clean. It is a usability wart under a degenerate
 * configuration, not a hole.
 *
 * EXIT CODES
 *   0  no executable line names a sibling checkout by absolute path
 *   1  at least one does
 *   2  could not measure
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { siblingRoot } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-peer-path-literals';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src', 'test', 'scripts'];
/** `.mjs` is here so `scripts/` is actually examined and not merely listed. */
const EXTS = ['.ts', '.tsx', '.mjs', '.mts'];

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE — ${msg}`);
  process.exit(2);
}

/**
 * Blank out comments, preserving every other character and all newlines so line
 * numbers stay exact. String and template literals are left INTACT — they are
 * precisely what this gate reads.
 */
function stripComments(src) {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') { if (src[i] !== '\n') out[i] = ' '; i++; }
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      continue;
    }
    if (src[i] === '"' || src[i] === "'" || src[i] === '`') {
      const q = src[i++];
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Every violating line of one source, as {line, text}. */
function scan(src, root) {
  const code = stripComments(src);
  const hits = [];
  code.split('\n').forEach((line, n) => {
    if (line.includes(root)) hits.push({ line: n + 1, text: line.trim().slice(0, 140) });
  });
  return hits;
}

// ---- guard 1: the canary, through the identical pipeline -------------------
const CANARY_ROOT = '/canary-sibling-root';
const CANARY_SRC = [
  `// a record quoting ${CANARY_ROOT}/peer — a comment opens no file, so this is exempt`,
  `/* also exempt: ${CANARY_ROOT}/peer */`,
  `const DIR = '${CANARY_ROOT}/peer';`,
].join('\n');
const canary = scan(CANARY_SRC, CANARY_ROOT);
if (canary.length !== 1 || canary[0].line !== 3) {
  die(
    `the canary did not behave: expected exactly 1 violation on line 3, got ${canary.length} ` +
    `(${canary.map((h) => h.line).join(',') || 'none'}).\n` +
    '  The comment stripper or the matcher is broken, so a clean result from this run\n' +
    '  would be evidence of NOTHING. Fix the gate before trusting its answer.',
  );
}

// ---- guard 2: a root to compare against, and files to compare -------------
const SIBLING = siblingRoot();
if (!SIBLING) {
  die(
    'the sibling root could not be derived — either `git rev-parse --git-common-dir` failed,\n' +
    `  or AURORA_PEER_ROOT (${process.env.AURORA_PEER_ROOT ?? 'unset'}) names a directory that is\n` +
    '  not there. Without it there is no path to forbid, so this run is NOT evidence that no\n' +
    '  test hardcodes one.\n' +
    '\n' +
    '  ⚠ This used to be a confident PASS. The gate carried its own copy of the derivation\n' +
    '  which ignored AURORA_PEER_ROOT, so under an override it went on forbidding the DEFAULT\n' +
    '  sibling root — the one string no test could then be using — and printed OK.',
  );
}

const files = [];
for (const r of ROOTS) {
  const p = join(ROOT, r);
  try {
    if (!statSync(p).isDirectory()) throw new Error(`${p} is not a directory`);
  } catch (e) {
    die(`cannot read ${p}: ${e.message}`);
  }
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const q = join(dir, e.name);
      if (e.isDirectory()) walk(q);
      else if (EXTS.some((x) => e.name.endsWith(x))) files.push(q);
    }
  };
  walk(p);
}
if (files.length === 0) {
  die(`no ${EXTS.join('/')} files under ${ROOTS.join(', ')}. Nothing was examined.`);
}

const violations = [];
for (const f of files.sort()) {
  for (const hit of scan(readFileSync(f, 'utf8'), SIBLING)) {
    violations.push({ file: relative(ROOT, f), ...hit });
  }
}

console.log(
  `${PREFIX}: scanned ${files.length} ${EXTS.join('/')} file(s) under ${ROOTS.join(', ')} ` +
  `for literals naming ${SIBLING} (canary OK; nothing excluded).`,
);

if (violations.length === 0) {
  console.log(`${PREFIX}: OK — no executable line names a sibling checkout by absolute path.`);
  process.exit(0);
}

console.error(
  `\n${PREFIX}: FAIL — ${violations.length} executable line(s) hardcode ${SIBLING}:\n` +
  violations.map((v) => `  ${v.file}:${v.line}\n      ${v.text}`).join('\n') +
  '\n\n' +
  '  That literal is one machine\'s home directory. Every row behind it can only\n' +
  '  ever SKIP on another checkout — unrunnable by construction, and silently so.\n' +
  '\n' +
  '  Derive it instead. From TypeScript under src/ or test/:\n' +
  '\n' +
  "      import { referencePath } from '<...>/test/support/fixture-tree';\n" +
  "      const S1DIR = referencePath('s1disasm');            // whole tree\n" +
  "      const FILE  = referencePath('s1disasm', '_anim/Sonic.asm');\n" +
  '\n' +
  '  From a plain-Node script under scripts/, which cannot import a .ts —\n' +
  '  the SAME derivation, one module lower down:\n' +
  '\n' +
  "      import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';\n" +
  "      const S1DIR = siblingPathOrUnresolved('s1disasm');\n" +
  '\n' +
  '  Guard it exactly as before — `referencePath` resolves to the same directory\n' +
  '  on this machine, so no existsSync/skip needs to change — and the row becomes\n' +
  '  redirectable with AURORA_<NAME>_REPO / AURORA_PEER_ROOT.\n' +
  '\n' +
  '  A COMMENT quoting such a path is exempt and is not what this found: records\n' +
  '  of where a measurement was taken are provenance, and rewriting them destroys\n' +
  '  it. The lines above are executable.\n',
);
process.exit(1);
