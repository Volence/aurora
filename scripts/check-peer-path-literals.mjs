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
 * and honours the suite's variables — `<NAME>_DIR` then `EMPYREAN_SUITE_ROOT`,
 * with `AURORA_<NAME>_REPO` / `AURORA_PEER_ROOT` as transitional aliases — so
 * the identical row runs on a machine that keeps its peers somewhere else.
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
 * WHAT THIS COVERS — `src/`, `test/`, `scripts/` AND `scratchpad/`, as of
 * 2026-09-02, in `.ts .tsx .mjs .mts .py .sh`. The roots and the extensions
 * actually scanned are printed on every run; read that line rather than this
 * prose.
 *
 * WHY `.py` AND `.sh` ARE IN THE LIST, which is not a detail. `scratchpad/`
 * holds five Python instruments and one shell one, and every one of them names
 * a checkout by absolute path. A gate that scanned only the JavaScript there
 * would have covered 136 of 142 files and printed the same confident OK — the
 * partial-coverage shape, where a check earns trust from the 96% and is
 * silently wrong in the corner. Reading them costs one more comment stripper
 * (`#` to end of line, quote-aware), which is below; excluding them cost a
 * class of file.
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
 * ANTI-VACUOUS — THREE GUARDS, all checked rather than printed
 * -----------------------------------------------------------
 *   1. A CANARY PER DIALECT runs through the identical pipeline on every
 *      invocation: a synthetic source holding commented occurrences and one
 *      executable occurrence must yield exactly the violating line(s) named.
 *      If a comment stripper ever eats string literals, or stops stripping, or
 *      lets a quote run past its line, the canary fails and this exits 2 —
 *      because "0 violations" and "I examined nothing" would otherwise be the
 *      same output, and today the honest answer IS 0. ONE canary would not have
 *      been enough once `.py`/`.sh` came into scope: the C canary passes while
 *      the hash half is broken.
 *   2. THE ROUTING is asserted too, because no source canary can reach it —
 *      each names its dialect directly, so `dialect()` sending `.py` to the C
 *      stripper is invisible to both canaries. Proven by planting all three:
 *      run-on quote → "expected violations on line(s) 2, got 2,4"; hash never
 *      strips → "got 1,2,4"; `.py` routed to C → "dialect(a.py) is c, expected
 *      hash". All exit 2.
 *   3. Zero files found, or a sibling root that cannot be derived, is exit 2 and
 *      says so. "Could not measure" must never render as "no problems found".
 *
 * KNOWN PROPERTY OF THE MATCH, found while verifying the override and recorded
 * rather than left for someone to rediscover: the test is a plain SUBSTRING of
 * the sibling root, so a very SHORT root produces false positives.
 * `EMPYREAN_SUITE_ROOT=/tmp` flags 18 lines, almost all of them legitimate
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

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { siblingRoot, siblingRootSource, SUITE_ROOT_ENV, SUITE_ROOT_ENV_ALIASES } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-peer-path-literals';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src', 'test', 'scripts', 'scratchpad'];
/**
 * `.mjs` is here so `scripts/` and `scratchpad/` are actually examined and not
 * merely listed; `.py`/`.sh` so the six non-JavaScript instruments under
 * `scratchpad/` are not a quietly-excluded corner (see the header).
 */
const EXTS = ['.ts', '.tsx', '.mjs', '.mts', '.py', '.sh'];

/**
 * Which comment syntax a file uses. The gate's whole rule is "comments are
 * records, executable lines are coupling", so getting this wrong in either
 * direction breaks the gate silently: too greedy and it eats the string
 * literals it exists to read, too shy and every `#`-commented record becomes a
 * false violation nobody can clear.
 */
function dialect(file) {
  return file.endsWith('.py') || file.endsWith('.sh') ? 'hash' : 'c';
}

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE — ${msg}`);
  process.exit(2);
}

/**
 * Blank out comments, preserving every other character and all newlines so line
 * numbers stay exact. String and template literals are left INTACT — they are
 * precisely what this gate reads.
 */
function stripComments(src, kind = 'c') {
  return kind === 'hash' ? stripHashComments(src) : stripCComments(src);
}

/**
 * The `#`-to-end-of-line dialect: Python and sh.
 *
 * Quote-aware in both directions. A `#` INSIDE a string is not a comment
 * (`'/some/path#frag'`), and an ODD quote must not open a string that runs on
 * past the end of its line: `echo don't stop` is an ordinary shell line, and a
 * run-on string means every `#` record below it stops being stripped and
 * becomes a violation nobody can clear. So a quote here ends at end-of-line,
 * which is what a shell and Python (outside a triple quote) do anyway. A Python
 * docstring is a STRING and is therefore treated as executable, deliberately:
 * a path in one is a path the module carries.
 */
function stripHashComments(src) {
  const out = src.split('');
  let i = 0;
  while (i < src.length) {
    if (src[i] === '#') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') break;  // an unterminated quote ends at the line
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

function stripCComments(src) {
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
function scan(src, root, kind = 'c') {
  const code = stripComments(src, kind);
  const hits = [];
  code.split('\n').forEach((line, n) => {
    if (line.includes(root)) hits.push({ line: n + 1, text: line.trim().slice(0, 140) });
  });
  return hits;
}

// ---- guard 1: the canary, through the identical pipeline -------------------
// ONE PER DIALECT. A single canary would have gone on passing while the `#`
// stripper — the half added when scratchpad/ came into scope — ate string
// literals or matched nothing, and the run would still have printed OK.
const CANARY_ROOT = '/canary-sibling-root';
const CANARIES = [
  {
    kind: 'c',
    src: [
      `// a record quoting ${CANARY_ROOT}/peer — a comment opens no file, so this is exempt`,
      `/* also exempt: ${CANARY_ROOT}/peer */`,
      `const DIR = '${CANARY_ROOT}/peer';`,
    ].join('\n'),
  },
  {
    kind: 'hash',
    src: [
      `# a record quoting ${CANARY_ROOT}/peer — a comment opens no file, so this is exempt`,
      `AEON="${CANARY_ROOT}/peer"  # trailing record, also ${CANARY_ROOT}/peer, also exempt`,
      "echo don't stop here",
      `# and one more record, ${CANARY_ROOT}/peer, still exempt after that apostrophe`,
    ].join('\n'),
    // LINE 2 AND ONLY LINE 2, and each of the other three lines is a different
    // way for this to break. Line 2 itself: the trailing `#` must not shield
    // the assignment BEFORE it, and the two occurrences on that line count as
    // one violating LINE, not two. Line 1 and line 4 must stay exempt, and
    // line 4 is the interesting one — the apostrophe in line 3's `don't` is a
    // bare word in shell, so a stripper that lets a quote run to the next quote
    // (or to EOF) leaves everything after it unstripped, and every `#` record
    // below turns into a violation nobody can clear.
    at: [2],
  },
];

// …and the ROUTING, which no source canary can reach because each of those
// names its dialect directly. Sending `.py` to the C stripper is the way the
// hash half stops being used at all while both canaries go on passing.
for (const [file, want] of [['a.py', 'hash'], ['a.sh', 'hash'], ['a.mjs', 'c'], ['a.ts', 'c'], ['a.mts', 'c'], ['a.tsx', 'c']]) {
  if (dialect(file) !== want) {
    die(`dialect(${file}) is ${dialect(file)}, expected ${want} — files are being read with the `
      + 'wrong comment syntax, so what this run examined is not what it says it examined.');
  }
}

for (const c of CANARIES) {
  const hits = scan(c.src, CANARY_ROOT, c.kind);
  const want = c.at ?? [3];
  const got = hits.map((h) => h.line);
  if (got.length !== want.length || got.some((l, i) => l !== want[i])) {
    die(
      `the ${c.kind} canary did not behave: expected violations on line(s) ${want.join(',')}, ` +
      `got ${got.join(',') || 'none'}.\n` +
      '  The comment stripper or the matcher is broken, so a clean result from this run\n' +
      '  would be evidence of NOTHING. Fix the gate before trusting its answer.',
    );
  }
}

// ---- guard 2: a root to compare against, and files to compare -------------
// A set-but-wrong variable now THROWS out of the resolver rather than becoming
// this null (empyrean contract/SUITE_PATHS.md @ 82982b7f), which is the case
// this die() used to have to describe. What is left here is genuine step 4.
const SIBLING = siblingRoot();
const SIBLING_SOURCE = siblingRootSource();
if (!SIBLING) {
  die(
    `${SIBLING_SOURCE}\n` +
    `  Nothing was set (${[SUITE_ROOT_ENV, ...SUITE_ROOT_ENV_ALIASES].join(' / ')}) and\n` +
    '  `git rev-parse --git-common-dir` produced nothing. Without a root there is no path to\n' +
    '  forbid, so this run is NOT evidence that no test hardcodes one.\n' +
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

/**
 * Drop the files git IGNORES — and only those.
 *
 * `scratchpad/` is where the harnesses write, and some of them materialise a
 * whole vendored copy of a peer repo (`scratchpad/fixtures/aeon-bganim-coherent/`,
 * .gitignore line 15) whose own scripts naturally carry that peer's paths.
 * Judging generated output is not this gate's question: it polices what THIS
 * repo ships. Running one such harness took the count from 1,163 files to
 * 11,688 and the violations from 252 to 5,200, none of them a line anybody here
 * wrote — a gate whose colour depends on whether a harness has been run since
 * the last clean is a gate people learn to ignore.
 *
 * UNTRACKED-BUT-NOT-IGNORED FILES ARE STILL SCANNED, deliberately. A brand-new
 * instrument is exactly what this exists to catch, and it is untracked at the
 * moment its author runs `npm test`. Filtering on "tracked" instead of
 * "ignored" would open that hole in the ordinary write-test-commit path.
 */
let ignored = 0;
try {
  const listed = execFileSync('git', ['check-ignore', '--stdin'], {
    cwd: ROOT,
    input: files.join('\n'),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
    // One line per ignored path. A harness that has materialised a vendored
    // peer copy pushes this well past node's 1 MB default, and the failure is
    // ENOBUFS — which this file turns into COULD NOT MEASURE rather than a
    // pass, but there is no reason to hit it.
    maxBuffer: 64 * 1024 * 1024,
  });
  const drop = new Set(listed.split('\n').filter(Boolean).map((p) => resolve(ROOT, p)));
  ignored = drop.size;
  for (let i = files.length - 1; i >= 0; i--) if (drop.has(files[i])) files.splice(i, 1);
} catch (e) {
  // Exit 1 means "nothing matched", which is the ordinary clean-tree answer.
  if (e.status !== 1) die(`git check-ignore failed (${e.message}) — cannot tell generated output from source, so this run judges an unknown set of files`);
}
if (files.length === 0) {
  die(`every ${EXTS.join('/')} file under ${ROOTS.join(', ')} is git-ignored. Nothing was examined.`);
}

const violations = [];
for (const f of files.sort()) {
  for (const hit of scan(readFileSync(f, 'utf8'), SIBLING, dialect(f))) {
    violations.push({ file: relative(ROOT, f), ...hit });
  }
}

// The contract asks every resolver's caller to print the resolved path AND the
// step that produced it before doing work against it, so a reader can tell a
// run that consulted an override from one that derived its own answer.
console.log(
  `${PREFIX}: scanned ${files.length} ${EXTS.join('/')} file(s) under ${ROOTS.join(', ')} ` +
  `for literals naming ${SIBLING} (canary OK, both dialects; ` +
  `${ignored} git-ignored file(s) excluded, nothing else).\n` +
  `${PREFIX}: sibling root ${SIBLING} — ${SIBLING_SOURCE}`,
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
  '  From a plain-Node script under scripts/ or scratchpad/, which cannot import\n' +
  '  a .ts — the SAME derivation, one module lower down:\n' +
  '\n' +
  "      import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';\n" +
  "      const S1DIR = siblingPathOrUnresolved('s1disasm');\n" +
  "      const AEON  = siblingPathOrUnresolved('aeon');   // honours AEON_DIR / LIVE_AEON\n" +
  '\n' +
  '  Three shapes a scratchpad/ instrument needs and a naive substitution gets wrong:\n' +
  '\n' +
  '    · THIS repo\'s own root is AURORA_DIR from the same module — never a\n' +
  '      literal, and never `.claude/worktrees/<name>`, which names a tree that no\n' +
  '      longer exists.\n' +
  '    · The electron binary is `process.env.ELECTRON_BIN ?? resolve(AURORA_DIR,\n' +
  '      \'node_modules/.bin/electron\')`. An agent worktree has no node_modules, so\n' +
  '      the override is how a harness runs there; a literal is not a default.\n' +
  '    · A guard that REFUSES the live tree compares against `siblingDefaultPath`,\n' +
  '      not `siblingPath`: with AEON_DIR set the latter answers with AEON_DIR\n' +
  '      itself, so the guard would compare the value against itself.\n' +
  '\n' +
  '  From Python or sh, which cannot import it at all: spell the same four steps\n' +
  '  in-file — <NAME>_DIR, then EMPYREAN_SUITE_ROOT/<name>, then a derivation, then\n' +
  '  die naming the variables. `scratchpad/handover/aeon-banks-move.py` and\n' +
  '  `scratchpad/handover/run-handover.sh` are the worked examples.\n' +
  '\n' +
  '  Guard it exactly as before — `referencePath` resolves to the same directory\n' +
  '  on this machine, so no existsSync/skip needs to change — and the row becomes\n' +
  '  redirectable with <NAME>_DIR / EMPYREAN_SUITE_ROOT (empyrean contract/SUITE_PATHS.md).\n' +
  '\n' +
  '  A COMMENT quoting such a path is exempt and is not what this found: records\n' +
  '  of where a measurement was taken are provenance, and rewriting them destroys\n' +
  '  it. The lines above are executable.\n',
);
process.exit(1);
