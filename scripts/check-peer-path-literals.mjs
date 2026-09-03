/**
 * check-peer-path-literals — fail the run when a file reaches a peer checkout by
 * any route but the resolver.
 *
 * FOUR RULES, all listed on every run's own output line. Rule 1 is what this
 * file was built for; rules 2 and 3 were added by O69 (2026-09-02) after the
 * SUITE-PATHS landing left two residues rule 1 is STRUCTURALLY UNABLE TO SEE,
 * because neither contains a home-directory literal — the gate scanned both and
 * printed a confident OK. Rule 4 came the same way one day later, O72: 114
 * instruments asked "which checkout am I" — often via `AURORA_DIR`, the right
 * name imported the right way from the right module — when they meant "which
 * built tree do I run against", and rules 1-3 are all blind to that.
 *
 *   1. `sibling-literal`  — an executable line naming the sibling root.
 *   2. `session-scratchpad` — an executable line naming an agent session's
 *      scratchpad (`<tmpdir>/claude-<uid>/…`), which is gone when that session
 *      ends. 3 files defaulted to one; the worst was a harness whose whole
 *      safety property is "run against a COPY of aeon, never the live tree" —
 *      the dead default never tripped that guard, because a dead path is not the
 *      live tree, so an unset variable got PAST the refusal and died later.
 *   3. `unratified-env`   — an executable line going to `process.env` /
 *      `os.environ` for a variable the resolver owns. 64 files read
 *      `process.env.AURORA_ROOT` (not the contract's `AURORA_DIR`) and 8 read
 *      `process.env.AEON_DIR` / `AEON_ROOT`, so all of them missed the
 *      transitional aliases, the two-spellings-disagree refusal and the
 *      set-but-wrong error, and two then hand-rolled the sibling derivation by
 *      string-surgery on the worktree path.
 *   4. `checkout-as-build-tree` — an executable line composing a path to a BUILD
 *      ARTIFACT (`node_modules/…`, `dist/…`) out of `AURORA_DIR` or a local
 *      alias of it. 114 instruments did, and every one of them RAN, because in
 *      the main checkout "the tree I live in" and "the tree with a build in it"
 *      are the same directory. In a linked worktree they are not — a worktree
 *      has neither artifact — so each composed a path to a file that is not
 *      there. See the block above `CHECKOUT_IDENT` for the whole argument.
 *
 * Rule 3 does NOT cover `.sh` — see `ENV_RULE_EXEMPT_EXTS`, which says why and
 * what that leaves uncovered. Rule 4 is `.ts/.tsx/.mjs/.mts` only and is the one
 * FILE-SCOPED rule here; see its own block for both reasons.
 *
 * WHY RULE 1 EXISTS
 * -----------------
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
 * ANTI-VACUOUS — FIVE GUARDS, all checked rather than printed
 * -----------------------------------------------------------
 *   1. A CANARY PER DIALECT runs through the identical pipeline on every
 *      invocation: a synthetic source holding commented occurrences and one
 *      executable occurrence PER RULE must yield exactly the (line, rule) pairs
 *      named.
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
 *   4. EVERY RULE MUST HAVE FIRED on a canary. Guard 1 checks that the canaries
 *      and the rules agree; it cannot see a rule nobody wrote a canary line for,
 *      which would contribute zero violations for the rest of time and read as
 *      "that class is clean". Proven by deleting rule 2's two canary lines and
 *      its `at` entries: "rule session-scratchpad never fired on either canary".
 *      Exit 2. (Breaking rule 2's PATTERN instead is caught by guard 1 — proven:
 *      "expected […4:session-scratchpad…], got [3:sibling-literal,
 *      5:unratified-env, 6:unratified-env]". Exit 2.)
 *   5. EVERY EXEMPTION MUST NAME A FILE THAT EXISTS. Rule 3 exempts the two
 *      files that IMPLEMENT the resolver; an exemption for a renamed file
 *      exempts nothing while looking like it exempts something. Proven by
 *      renaming one in the list: "the exemption list names
 *      test/support/sibling-root-RENAMED.mjs, which is not a readable file
 *      here". Exit 2.
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
 *   0  no executable line violates any of the three rules
 *   1  at least one does
 *   2  could not measure
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import {
  AURORA_DIR, checkoutEnv, OWNED_ENV, siblingRoot, siblingRootSource, SUITE_PEERS,
} from '../test/support/sibling-root.mjs';

const PREFIX = 'check-peer-path-literals';
const ROOT = AURORA_DIR;
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

// ---------------------------------------------------------------------------
// THE RULES. Three classes, one pipeline.
//
// Rules 2 and 3 were added by O69 (2026-09-02), which found two residues of the
// SUITE-PATHS landing that rule 1 is structurally unable to see: NEITHER OF THEM
// CONTAINS A HOME-DIRECTORY LITERAL, so a gate that greps for the sibling root
// scanned them and printed OK.
//
//   · 64 files read `process.env.AURORA_ROOT` for "which aurora tree", which is
//     not the contract's spelling (`AURORA_DIR`) and is a second derivation
//     besides. 8 more read `process.env.AEON_DIR` / `AEON_ROOT` directly, so
//     they missed the aliases, the two-spellings-disagree refusal and the
//     set-but-wrong error the resolver raises. Two of those eight then wrote
//     their own sibling derivation by string-surgery on the worktree path.
//   · 3 files defaulted to a path under a PREVIOUS SESSION'S scratchpad
//     (`/tmp/claude-<uid>/…/<session uuid>/scratchpad/…`), long deleted. One of
//     them was the throwaway-copy path of a harness that must never touch the
//     live aeon tree: the dead default never tripped that guard (a dead path is
//     not the live tree), so an unset variable sailed past the refusal and died
//     later on a missing file, reading like a broken harness.
//
// EVERY NAME AND PATH BELOW IS DERIVED. Rule 2's prefix comes from `os.tmpdir()`;
// rule 3's variable list is the resolver's own `OWNED_ENV` export, imported
// whole, so a variable added OR renamed there is policed here without anyone
// remembering to edit this file — which was not true while this file assembled
// that list itself (see `OWNED_ENV` below). Rule 1's root comes from the
// resolver as it always did.
// ---------------------------------------------------------------------------

/** Escape a literal for use inside a RegExp. */
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every environment variable the resolver owns — canonical names and the
 * transitional aliases it accepts — IMPORTED WHOLE rather than reassembled here.
 *
 * ⚠ THIS USED TO BE A LOCAL `[SUITE_ROOT_ENV, …AURORA_DIR_ENV_ALIASES, …]`
 * ASSEMBLY, and the paragraph below claimed of it that "a variable added or
 * renamed there is policed here without anyone remembering to edit this file".
 * That was true only for a PEER: a variable added to the resolver under a new
 * constant — `AURORA_BUILT_TREE`, O70 — appeared in the resolver's exports and
 * in nothing this file read, so rule 3 would have gone on printing a confident
 * OK while not policing it at all. The list now lives once, beside the
 * variables, and this file takes it.
 */
if (!Array.isArray(OWNED_ENV) || OWNED_ENV.length === 0) {
  die('the resolver exported no OWNED_ENV list, so rule 3 would police nothing while '
    + 'reporting a clean tree.');
}

/**
 * The shapes an environment READ takes in the dialects scanned.
 *
 * Deliberately not "the name appears anywhere": `siblingPathOrUnresolved('aeon')
 * // honours AEON_DIR` is a comment (already stripped) and this gate's own
 * guidance strings NAME these variables in prose, which is the correct thing for
 * them to do. What is forbidden is going to `process.env` / `os.environ` for
 * one, because that is the second reader.
 *
 * ⚠ NOT `$AEON_DIR`, and that omission is measured rather than assumed. A shell
 * `$VAR` shape was tried first and flagged
 * `band-art-foreground-harness.mjs:932`, where `${LIVE_AEON}` is a template
 * interpolation of a LOCAL const — the same characters, a different language.
 * The shell files that really do read these are exempt below anyway, so the
 * shape bought one false positive and no coverage.
 */
const ENV_READ = new RegExp(
  '(?:process\\.env\\.(?:' + OWNED_ENV.join('|') + ')\\b'
  + '|(?:process\\.env|import\\.meta\\.env)\\[\\s*[\'"`](?:' + OWNED_ENV.join('|') + ')[\'"`]\\s*\\]'
  + '|environ(?:\\.get)?\\s*[[(]\\s*[\'"](?:' + OWNED_ENV.join('|') + ')[\'"])',
);

/**
 * A path under an agent session's scratchpad — `<tmpdir>/claude-<uid>/…`.
 *
 * The tmp root is derived; `claude-` names the family of session directories,
 * and the uid is left open because a literal left behind by one session need not
 * carry this machine's. There is no legitimate executable use: a session
 * scratchpad is by construction gone when that session ends, so a path into one
 * is either a dead default or a value that should have come from `mkdtemp`.
 * COMMENTS stay exempt by the same rule as everywhere else — several review
 * documents record where a measurement was taken, and that is provenance.
 */
const SESSION_SCRATCH = new RegExp(reEscape(join(tmpdir(), 'claude-')) + '\\d');

/**
 * The two files that IMPLEMENT the resolver, which necessarily read the
 * variables rule 3 forbids everyone else from reading.
 *
 * Checked for existence at startup: an exemption naming a file that is not there
 * silently exempts nothing while looking like it exempts something, and a
 * renamed resolver would turn this gate red on itself with no explanation.
 */
const RESOLVER_FILES = ['test/support/sibling-root.mjs', 'scratchpad/lib/suite_paths.py'];

/**
 * WHAT RULE 3 DOES NOT COVER, stated rather than left to be discovered.
 *
 * `.sh` files are exempt from it. A shell script cannot import either resolver,
 * so the contract's answer for them — and this gate's own guidance below — is to
 * spell the four steps in-file, which necessarily means reading the variables:
 *
 *     AEON_DIR=${AEON_DIR:-${LIVE_AEON:-${SUITE_ROOT:+$SUITE_ROOT/aeon}}}
 *
 * That is `scratchpad/handover/run-handover.sh` doing it RIGHT. There is exactly
 * one such file in the tree today. So this rule covers .ts/.tsx/.mjs/.mts/.py
 * and NOT .sh; a shell script that hardcodes a peer path is still caught by rule
 * 1, and one that reads a variable badly is caught by nothing here. Recorded so
 * nobody reads this gate's OK as covering the shell.
 */
const ENV_RULE_EXEMPT_EXTS = ['.sh'];

// ---------------------------------------------------------------------------
// RULE 4 — `checkout-as-build-tree`, added by O72 (2026-09-02).
//
// WHAT IT CATCHES, and why the first three rules cannot. `AURORA_DIR` answers
// "which checkout am I", observed from the resolver's own file location. The
// BUILT TREE — the directory carrying `node_modules/.bin/electron` and
// `dist/main/index.mjs` — is a different question, and `AURORA_BUILT_TREE` /
// `scratchpad/lib/run-root.mjs` is its answer (the O70 split). In the main
// checkout the two are the same directory, which is why 103 `scratchpad/*.mjs`
// instruments composed a build path out of the checkout name and nobody saw it:
// they ran. In a LINKED WORKTREE they are not the same directory — a worktree
// has no `node_modules/` and no `dist/` — so every one of those composed a path
// to a file that is not there, and the failure surfaced as an ENOENT inside
// `xvfb-run` reading like "the CDP target never appeared".
//
// Rules 1-3 are structurally blind to it: there is no home-directory literal, no
// session scratchpad, and no `process.env` read. `AURORA_DIR` is the CORRECT
// name for a checkout, imported the correct way, from the correct module. What
// is wrong is the QUESTION it is being asked.
//
// ⚠ IT IS FILE-SCOPED, WHICH NO OTHER RULE IS, and that is forced rather than
// chosen. The composition is almost never spelled on `AURORA_DIR` itself — it
// goes through a local alias — 119 files bind `const ROOT = AURORA_DIR;` — so a
// line-local grep for `AURORA_DIR.*node_modules` returns ZERO and reads as an
// empty world. A too-narrow query and an absent population produce the same
// output. So `scan` computes the file's alias set first and the rule matches
// against it.
//
// C DIALECT ONLY, stated rather than left to be discovered: the alias shape
// below is `const X = AURORA_DIR`, which is JavaScript. The Python instruments
// under `scratchpad/` resolve through `scratchpad/lib/suite_paths.py` and none
// of them spawns the built app, so there is nothing there for this to see today;
// if one ever does, this rule will not catch it and `check-python-resolver.mjs`
// is where the row belongs.
// ---------------------------------------------------------------------------

/** The identifier the resolver exports for this repo's own checkout. */
const CHECKOUT_IDENT = 'AURORA_DIR';

/**
 * The build artifacts a run needs, as they appear in a composed path.
 *
 * `dist` carries a trailing "not a letter or digit" guard because `distance`,
 * `distinct` and `distM` are all real words in these files — four of them
 * matched a naive `dist` and none was a path.
 */
const ARTIFACT = '(?:node_modules|dist(?![A-Za-z0-9_]))';

/**
 * Every local name in one file that is the CHECKOUT's answer.
 *
 * THREE SEEDS, and the third one is the finding rather than the design.
 *
 *   · `AURORA_DIR` itself.
 *   · anything bound to a seed, transitively (`const ROOT = AURORA_DIR;` then
 *     `const R = ROOT;`) — a FIXPOINT, because one pass misses the second hop
 *     and reports a clean file.
 *   · anything bound to an expression over `import.meta.url`. That is
 *     `AURORA_DIR` hand-rolled: "the checkout is where my own file lives", the
 *     same derivation the resolver makes, spelled locally. SEVEN instruments
 *     used it, and a rule seeded only from the imported name would have printed
 *     a confident OK over every one of them — they never mention `AURORA_DIR`,
 *     so they were not even in the survey population O72 started from. It is
 *     the same lesson the header records for rules 2 and 3, one layer down: a
 *     failing predicate and an absent population produce the same output.
 *
 * Passing such a name INTO `runTarget(HERE)` is not a violation and is not
 * matched here — only composing an artifact path out of one is.
 *
 * A FOURTH SEED, narrower and by SPELLING: a binding IMPORTED under the local
 * name `ROOT`. Three probes import `ROOT` from `canvas-cdp-harness.mjs` and one
 * of them read `join(ROOT, 'dist', 'renderer', 'assets')` — a real build path,
 * off a checkout, and invisible to the three seeds above because the binding is
 * not created in that file at all. This seed is a convention rather than a
 * derivation, and it is the one place here that could produce a FALSE positive:
 * a module that exported a RUN-TARGET under the name `ROOT` would be flagged
 * wrongly. Nothing does — the house name for that is `RUN.root` — and the
 * failure direction is loud, so it is worth the coverage.
 */
const IMPORTED_CHECKOUT_NAMES = ['ROOT'];

function checkoutAliases(code) {
  const names = new Set([CHECKOUT_IDENT]);
  for (const m of code.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const spec of m[1].split(',')) {
      const local = spec.trim().split(/\s+as\s+/).pop()?.trim();
      if (local && IMPORTED_CHECKOUT_NAMES.includes(local)) names.add(local);
    }
  }
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*import\.meta\.url[^;\n]*);/g)) {
    names.add(m[1]);
  }
  for (let pass = 0; pass < 8; pass++) {
    const before = names.size;
    for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*[;,]/g)) {
      if (names.has(m[2])) names.add(m[1]);
    }
    for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*dirname\(\s*([A-Za-z_$][\w$]*)\s*\)\s*;/g)) {
      if (names.has(m[2])) names.add(m[1]);
    }
    if (names.size === before) break;
  }
  return names;
}

/**
 * The alias this line composes a build path out of, or null.
 *
 * Three shapes, because these files use all three: a template interpolation
 * (`` `${ROOT}/dist/main/index.mjs` ``), a path-join argument (`join(ROOT,
 * 'node_modules/.bin/electron')`, and `resolve(...)` by the same shape), and
 * plain concatenation (`ROOT + '/dist'`).
 */
function composesBuildPath(line, aliases) {
  for (const a of aliases) {
    const re = new RegExp(
      `\\$\\{\\s*${a}\\s*\\}/${ARTIFACT}`
      + `|\\b${a}\\s*,\\s*['"\`]\\.?/?${ARTIFACT}`
      + `|\\b${a}\\s*\\+\\s*['"\`]/?${ARTIFACT}`,
    );
    if (re.test(line)) return a;
  }
  return null;
}

/**
 * Files allowed to compose a build path off the checkout name.
 *
 * EMPTY, and that is the point — this list exists so that adding to it is a
 * visible act. `scratchpad/mapviewport-baseline-harness.mjs` reads like a
 * candidate and is NOT one: its `ROOT` is bound to `resolveRunRoot(...).root`,
 * the run target, so no alias of the checkout reaches an artifact there.
 */
const BUILD_RULE_EXEMPT = [];

// ---------------------------------------------------------------------------
// RULE 5 — `peer-tree-write`, added 2026-09-03 (O80, the canvas-harness delete).
//
// WHAT IT CATCHES. A file-system WRITE — and deleting is the most extreme write
// there is — whose destination derives from a resolver DEFAULT rather than from
// an explicit checkout override. The default is another lane's LIVE WORKING
// TREE, so such a line does not risk corrupting shared state, it does it every
// run, as designed. `scratchpad/canvas-cdp-harness.mjs` opened `main()` with a
// recursive `rmSync` of `<s1disasm>/.aurora/canvas`; on the day it was found
// that directory held 20 files of the owner's canvas artwork, and four sibling
// harnesses inherited the same destination through its export.
//
// THE POLICY IT ENFORCES is d-28 `COPY ONLY WHERE IT CAN WRITE`
// (docs/decisions.jsonl, id `d-28-peer-tree-open-policy-answered`): a harness
// that can write to a peer tree must be pointed at a COPY, by name, with no
// default; one that merely READS may keep using the resolver's answer. So this
// rule is deliberately keyed on the VERB and not on the path — which is also
// why rules 1-4 are structurally blind to it. All four ask how a path was
// SPELLED, and here the spelling is entirely correct: the right resolver, the
// right peer name, imported the right way. What is wrong is what the code then
// DOES with the answer.
//
// WHY IT IS NOT the repo-wide outage `docs/reviews/2026-09-03-o53-…md` §5.3
// argued against. That section rejected a verb-aware rule that would fire on the
// ~82 files which merely OPEN a peer tree. This one does not look at opens at
// all — only at `node:fs` writes — and the whole population of those was 13
// sites in 5 files, every one of them fixed on this branch, so it lands green
// with an EMPTY exemption list.
//
// ⚠ WHAT IT DOES NOT COVER, said rather than left to be discovered.
//   · An import. The four sibling harnesses reach the same directory through
//     `import { CANVAS_DIR } from './canvas-cdp-harness.mjs'`, and no seed here
//     creates that binding, exactly as rule 4 found with `ROOT`. Seeding on the
//     SPELLING `CANVAS_DIR` would fire on those four files, which are now safe
//     because the value they import is armed from an override or else points at
//     `UNRESOLVED_ROOT`. Their protection is that fallback, not this rule.
//   · A write the app performs on the harness's behalf — a dispatched Ctrl+S —
//     which is `node:fs` in the MAIN process and invisible here. That is the
//     `bganim-ui-authored-composition-harness.mjs` shape, O54's parcel.
//   · The `hash` dialect. Python's writes are spelled `open(...,'w')`, and no
//     Python instrument under `scratchpad/` writes to a peer path today; if one
//     ever does, `check-python-resolver.mjs` is where the row belongs.
// ---------------------------------------------------------------------------

/**
 * The resolver exports that answer with a DEFAULT — the peer's live checkout
 * when nothing is set.
 *
 * An ARRAY joined into the regex rather than a typed-out alternation, so this
 * file's own source never contains the text `siblingPath` immediately followed
 * by an open paren. It is one of the files the run scans, and a constant that
 * matched its own seed would make every write line below it a violation.
 */
const PEER_DEFAULT_RESOLVERS = [
  'siblingPathOrUnresolved', 'siblingDefaultPathOrUnresolved',
  'siblingPath', 'siblingDefaultPath', 'requireSiblingPath',
];

/** The resolver export that answers ONLY from an explicit `<NAME>_DIR`. */
const PEER_OVERRIDE_RESOLVER = 'checkoutOverride';

/**
 * The `node:fs` calls that change a directory's contents, split by WHERE the
 * destination sits — and that split is load-bearing, not tidiness.
 *
 * `cpSync(S1DIR, WORK, { recursive: true })` in `scripts/verify-s1-roundtrip.mjs`
 * is the CORRECT pattern: it reads the peer tree and copies it into a local
 * scratch directory, which is exactly what d-28 asks a write-capable instrument
 * to do. A rule that matched the peer name anywhere in the argument list flagged
 * that line — i.e. it reported the remedy as the defect. The peer path in
 * argument ONE of a two-place verb is the SOURCE.
 *
 * `mkdirSync` is a write because materialising a directory inside somebody
 * else's checkout is one, and because it is the line that PRECEDES the write in
 * every one of the sites this rule was derived from.
 */
const WRITE_VERBS_DEST_FIRST = [
  'rmSync', 'rmdirSync', 'unlinkSync', 'writeFileSync', 'appendFileSync',
  'mkdirSync', 'truncateSync', 'createWriteStream', 'writeSync',
];
const WRITE_VERBS_DEST_SECOND = ['cpSync', 'copyFileSync', 'renameSync', 'linkSync', 'symlinkSync'];
const WRITE_VERBS = [...WRITE_VERBS_DEST_FIRST, ...WRITE_VERBS_DEST_SECOND];

const RESOLVER_DEFAULT_CALL = new RegExp(`(?:${PEER_DEFAULT_RESOLVERS.join('|')})\\s*\\(`);
const RESOLVER_OVERRIDE_CALL = new RegExp(`${PEER_OVERRIDE_RESOLVER}\\s*\\(`);

/** Every `const|let|var NAME = EXPR` in one file, EXPR possibly spanning lines. */
function* bindings(code) {
  // Two passes over the same shape. The line-bounded one is what rule 4 uses and
  // is exact for the common case; the `;`-bounded one is what reaches a ternary
  // written across three lines, which is precisely how the fixed harness spells
  // its armed-or-poisoned destination. Neither alone sees both.
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g)) yield [m[1], m[2]];
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);/g)) yield [m[1], m[2]];
}

/**
 * Does EXPR build a PATH out of NAME — as opposed to merely mentioning it?
 *
 * ⚠ THIS DISTINCTION IS THE RULE'S ACCURACY, and the first draft did not have
 * it. Propagating taint on any mention made `const mapText =
 * readFileSync(join(S1DIR, '_maps/Sonic.asm'), 'utf8')` a "peer path", and from
 * there the whole dataflow of a rendering script — `doc`, `grid`, `img` — so
 * `writeFileSync(args.out, encodePng(img))` came back as a write into somebody's
 * checkout. Nine such lines, in four scripts, none of them a violation. CONTENT
 * READ OUT OF A PEER TREE IS NOT A PEER PATH.
 *
 * The four shapes below are the ones a path is actually composed with, and they
 * are the same three rule 4 matches plus a bare re-binding.
 */
function composesPathOver(expr, name) {
  const n = `(?<![.\\w$])${name}\\b`;
  return new RegExp(
    `(?:^|[^\\w$.])(?:join|resolve)\\s*\\(\\s*${n}`          // join(X, …) / resolve(X, …)
    + `|\\$\\{\\s*${name}\\s*\\}`                              // `${X}/…`
    + `|${n}\\s*\\+\\s*['"\`]`                                 // X + '/…'
    + `|^\\s*${n}\\s*$`,                                       // const Y = X;
  ).test(expr);
}

/**
 * Every local name in one file that is a peer path the resolver DEFAULTED.
 *
 * A FIXPOINT for the same reason rule 4 needs one — `S1DIR` then `CANVAS_DIR`
 * then `PNG` is three hops, and one pass reports the file clean.
 *
 * A RESOLVER DEFAULT ANYWHERE IN THE EXPRESSION TAINTS, even beside an override.
 * `const S1DIR = S1_COPY ?? siblingPath…('s1disasm')` still CAN be the live tree
 * — that is what the `??` means — so letting the override half clear it would
 * open a hole the shape of the defect. What the override half does is stop taint
 * SPREADING: a name composed purely over a `checkoutOverride` answer is a path
 * the caller was forced to name, which is what d-28 asks for, and that is how
 * `const CANVAS_DIR = S1_COPY ? … : …` stops being a violation without an
 * exemption entry.
 */
function peerDefaultAliases(code) {
  const def = new Set(), ovr = new Set();
  for (let pass = 0; pass < 8; pass++) {
    const before = def.size + ovr.size;
    for (const [name, expr] of bindings(code)) {
      if (RESOLVER_DEFAULT_CALL.test(expr) || [...def].some((d) => composesPathOver(expr, d))) { def.add(name); continue; }
      if (RESOLVER_OVERRIDE_CALL.test(expr) || [...ovr].some((o) => composesPathOver(expr, o))) ovr.add(name);
    }
    if (def.size + ovr.size === before) break;
  }
  return def;
}

/**
 * The alias this line writes THROUGH, or null.
 *
 * The second-argument form skips one argument with `[^,)]*,`, which is an
 * approximation — it would be wrong for `cpSync(join(a, b), DEST)`, where the
 * first argument carries its own comma. It errs toward NOT matching, i.e.
 * toward a missed violation rather than a false one, and no site in this repo
 * spells it that way today.
 */
function writesPeerDefault(line, aliases) {
  if (!aliases.size) return null;
  for (const a of aliases) {
    const n = `(?<![.\\w$])${a}\\b`;
    const first = new RegExp(`\\b(?:${WRITE_VERBS_DEST_FIRST.join('|')})\\s*\\(\\s*[^)]*?${n}`);
    const second = new RegExp(`\\b(?:${WRITE_VERBS_DEST_SECOND.join('|')})\\s*\\(\\s*[^,)]*,\\s*[^)]*?${n}`);
    if (first.test(line) || second.test(line)) return a;
  }
  return null;
}

/**
 * Files allowed to write to a resolver-defaulted peer path.
 *
 * EMPTY, and — like `BUILD_RULE_EXEMPT` — that is the point. An entry here says
 * "this instrument may delete inside another lane's working tree", which is a
 * claim that should have to be written down and reviewed.
 */
const WRITE_RULE_EXEMPT = [];

/** The rules, built once the sibling root is known. */
function makeRules(sibling) {
  return [
    {
      id: 'sibling-literal',
      what: `an executable line naming the sibling root ${sibling} by absolute path`,
      match: (line) => line.includes(sibling),
    },
    {
      id: 'session-scratchpad',
      what: `an executable line naming an agent session scratchpad (${join(tmpdir(), 'claude-')}…)`,
      match: (line) => SESSION_SCRATCH.test(line),
    },
    {
      id: 'unratified-env',
      what: 'an executable line reading a suite path variable from the environment '
        + 'instead of through the resolver',
      match: (line) => ENV_READ.test(line),
      exempt: (rel) => RESOLVER_FILES.includes(rel)
        || ENV_RULE_EXEMPT_EXTS.some((x) => rel.endsWith(x)),
    },
    {
      id: 'checkout-as-build-tree',
      what: 'an executable line composing a build path (node_modules/… or dist/…) out of '
        + `${CHECKOUT_IDENT} or a local alias of it, which answers "which checkout am I" and `
        + 'not "which built tree do I run against"',
      // The only rule that needs the whole file: the composition goes through a
      // local alias, so the line alone cannot say what it is composing off.
      match: (line, ctx) => ctx !== undefined && ctx.kind === 'c'
        && composesBuildPath(line, ctx.checkoutAliases) !== null,
      exempt: (rel) => BUILD_RULE_EXEMPT.includes(rel),
    },
    {
      id: 'peer-tree-write',
      what: `an executable line writing (${WRITE_VERBS.join('/')}) to a path a resolver `
        + 'DEFAULTED to a peer checkout, i.e. another lane\'s LIVE working tree. d-28 says '
        + `COPY ONLY WHERE IT CAN WRITE: take the destination from ${PEER_OVERRIDE_RESOLVER}(), `
        + 'which has no default, and refuse when it names the live tree',
      // File-scoped for rule 4's reason and one more: the destination is almost
      // never spelled on the resolver call — it is three hops away through
      // `S1DIR` then `CANVAS_DIR` then `PNG`.
      match: (line, ctx) => ctx !== undefined && ctx.kind === 'c'
        && writesPeerDefault(line, ctx.peerDefaultAliases) !== null,
      exempt: (rel) => WRITE_RULE_EXEMPT.includes(rel),
    },
  ];
}

/** Every violating line of one source, as {rule, line, text}. */
function scan(src, rules, kind = 'c', rel = '') {
  const code = stripComments(src, kind);
  // FILE SCOPE, computed once and handed to every matcher. Rule 4 needs it:
  // the build path is composed off a LOCAL ALIAS of the checkout name, so a
  // line read on its own cannot tell that alias from any other variable.
  const ctx = {
    kind,
    rel,
    checkoutAliases: kind === 'c' ? checkoutAliases(code) : new Set(),
    peerDefaultAliases: kind === 'c' ? peerDefaultAliases(code) : new Set(),
  };
  const hits = [];
  code.split('\n').forEach((line, n) => {
    for (const r of rules) {
      if (r.exempt?.(rel)) continue;
      if (r.match(line, ctx)) hits.push({ rule: r.id, line: n + 1, text: line.trim().slice(0, 140) });
    }
  });
  return hits;
}

// ---- guard 1: the canary, through the identical pipeline -------------------
// ONE PER DIALECT. A single canary would have gone on passing while the `#`
// stripper — the half added when scratchpad/ came into scope — ate string
// literals or matched nothing, and the run would still have printed OK.
const CANARY_ROOT = '/canary-sibling-root';

/**
 * A session-scratchpad path shaped like the real ones, built from the SAME
 * derivation rule 2 uses. Typing `/tmp/claude-1000/…` here would let the rule
 * and its canary agree while both were wrong about `os.tmpdir()`.
 */
const CANARY_SESSION = join(tmpdir(), 'claude-4242', '-canary', 'deadbeef', 'scratchpad', 'x');

/**
 * A canonical variable name rule 3 owns, taken from the resolver.
 *
 * `AEON_DIR` spelled out here would go on passing after someone renamed it in
 * the resolver — the canary would be testing a name the gate no longer polices,
 * which is the exact shape of a check that covers nothing while printing OK.
 */
const CANARY_ENV = checkoutEnv(SUITE_PEERS[0]);

/**
 * The identifier rule 4 owns, taken from the constant the rule itself reads, so
 * the canary cannot go on passing against a name the rule no longer polices.
 */
const CANARY_CHECKOUT = CHECKOUT_IDENT;

/**
 * The two artifact paths rule 4's canary composes, INTERPOLATED rather than
 * typed into the canary lines.
 *
 * Same trick rules 2 and 3 already use (`${CANARY_SESSION}`, `${CANARY_ENV}`),
 * and for the same reason: this file's own source is one of the 1,170 files the
 * run scans, so a canary line carrying the violating text verbatim makes the
 * gate fail on itself. Exempting this file instead would have been the wrong
 * fix — it would switch rule 4 off for the whole gate, including the parts of it
 * that legitimately bind `const ROOT = AURORA_DIR;`.
 */
const CANARY_ART = ['node_modules/.bin/electron', 'dist/main/index.mjs'];

/**
 * The three names rule 5 owns, taken from the rule's OWN constants and
 * INTERPOLATED, for both of the reasons the block above gives.
 *
 * Taken from the constants so a rename in the rule cannot leave the canary
 * exercising a name the rule no longer polices — the shape that makes a check
 * cover nothing while printing OK. Interpolated because this file is scanned:
 * typing the resolver name beside an open paren here would seed rule 5's own
 * alias set against this file and turn every write line below into a violation.
 *
 * The peer NAME is arbitrary on purpose — rule 5 keys on the resolver call and
 * the verb, never on which peer is being written to, and taking it from
 * `SUITE_PEERS` says so while keeping it a name the resolver would accept.
 */
const CANARY_DEFAULT_RESOLVER = PEER_DEFAULT_RESOLVERS[0];
const CANARY_OVERRIDE_RESOLVER = PEER_OVERRIDE_RESOLVER;
const CANARY_PEER = SUITE_PEERS[SUITE_PEERS.length - 1];
/**
 * Three write verbs taken FROM the rule's own lists, one of them from the
 * two-place half so the source/destination split is actually exercised.
 *
 * The `find` keeps the canary semantically readable while still failing loudly
 * if the list it is drawn from ever loses the member — a canary that hard-typed
 * `writeFileSync` would go on passing after the rule stopped policing it.
 */
const CANARY_WRITE_DIR = WRITE_VERBS_DEST_FIRST[0];
const CANARY_WRITE_FILE = WRITE_VERBS_DEST_FIRST.find((v) => v === 'writeFileSync')
  ?? WRITE_VERBS_DEST_FIRST[WRITE_VERBS_DEST_FIRST.length - 1];
const CANARY_COPY = WRITE_VERBS_DEST_SECOND[0];
for (const [what, v] of [['CANARY_WRITE_DIR', CANARY_WRITE_DIR], ['CANARY_WRITE_FILE', CANARY_WRITE_FILE],
  ['CANARY_COPY', CANARY_COPY]]) {
  if (typeof v !== 'string' || v.length === 0) {
    die(`${what} came out empty, so rule 5's canary would carry no write verb at all and would `
      + 'prove nothing about the rule while still printing OK.');
  }
}
// The read used as rule 5's negative control must NOT be a write verb, or the
// "reads are the deferred half" line below would be asserting nothing.
if (WRITE_VERBS.includes('readFileSync')) {
  die('readFileSync is in WRITE_VERBS, so rule 5\'s read-only negative control is a second '
    + 'positive and the canary would prove the opposite of what it claims.');
}

/**
 * THE CANARIES, one per dialect, each carrying all three rules.
 *
 * `at` is now a list of `[line, ruleId]`, in the order `scan` yields them
 * (line, then rule order), so a rule that silently stops matching is not merely
 * a smaller count but a named absence. The two `expected/got` strings below are
 * compared verbatim.
 */
const CANARIES = [
  {
    kind: 'c',
    src: [
      `// a record quoting ${CANARY_ROOT}/peer — a comment opens no file, so this is exempt`,
      `/* also exempt: ${CANARY_ROOT}/peer, ${CANARY_SESSION}, process.env.${CANARY_ENV} */`,
      `const DIR = '${CANARY_ROOT}/peer';`,
      `const SHOTS = '${CANARY_SESSION}';`,
      `const AEON = process.env.${CANARY_ENV};`,
      `const ALSO = process.env['${CANARY_ENV}'];`,
      // ── rule 4, and the two ways it goes wrong in opposite directions ──
      // Lines 8-9 are the violation in its two spellings, THROUGH A LOCAL ALIAS
      // (line 7) — which is the whole reason the rule is file-scoped, and the
      // reason a line-local grep for the checkout name beside an artifact
      // returns zero and reads as an empty world.
      `const ROOT = ${CANARY_CHECKOUT};`,
      `const ELECTRON = \`\${ROOT}/${CANARY_ART[0]}\`;`,
      `const MAIN = join(ROOT, '${CANARY_ART[1]}');`,
      // Line 10 must NOT fire: the checkout name is the RIGHT answer for output
      // a human reads, and a rule that flagged it would be un-clearable.
      "const SHOTS = join(ROOT, 'scratchpad/shots-canary');",
      // Line 11 must NOT fire either: `dist` is the start of several ordinary
      // words in these files (`distance`, `distinct`, `distM`), and a naive
      // substring matched four lines that were not paths at all.
      "const TABLE = ROOT + '/distance-table.json';",
      // Lines 12-13: the SECOND HOP. One alias pass would miss this and report
      // the file clean, which is the failure the fixpoint exists to prevent.
      'const R2 = ROOT;',
      `const E2 = \`\${R2}/${CANARY_ART[0]}\`;`,
      // Lines 14-15: AURORA_DIR HAND-ROLLED. Seven instruments derived the
      // checkout from their own file location and never named the resolver at
      // all, so a rule seeded only from the imported identifier reported every
      // one of them clean. This is the seed that found them.
      "const OWN = fileURLToPath(new URL('..', import.meta.url));",
      `const E3 = \`\${OWN}/${CANARY_ART[0]}\`;`,
      // Lines 16-17: the alias IMPORTED from a sibling harness, and the SEGMENT
      // spelling of the join. One probe read the built renderer assets exactly
      // this way; no seed above can see a binding the file never creates.
      "import { session, ROOT as ROOT } from './canvas-cdp-harness.mjs';",
      `const A = join(ROOT, '${CANARY_ART[1].split('/')[0]}', 'renderer', 'assets');`,
      // ── rule 5, and the three ways it goes wrong ───────────────────────────
      // Lines 18-19 build the destination the way the defect did: a resolver
      // DEFAULT, then a subdirectory of it. Neither line writes, so neither
      // fires — the rule is about the verb.
      `const S1 = ${CANARY_DEFAULT_RESOLVER}('${CANARY_PEER}');`,
      'const CANVASD = `${S1}/.aurora/canvas`;',
      // Line 20 IS the defect, verbatim in shape: a recursive delete of another
      // lane's live working tree, as harness setup.
      `${CANARY_WRITE_DIR}(CANVASD, { recursive: true, force: true });`,
      // Lines 21-22: the THIRD HOP. `S1` → `CANVASD` → `PNGP` is one hop deeper
      // than rule 4's canary goes, and it is the depth the real file used
      // (`S1DIR` → `CANVAS_DIR` → `PNG`). A fixpoint that stopped at two passes
      // would report line 22 clean, which is the failure this pair prevents.
      "const PNGP = join(CANVASD, 'ghz-cliffs.png');",
      `${CANARY_WRITE_FILE}(PNGP, buf);`,
      // Line 23 must NOT fire. READING a peer tree from the resolver's default
      // is the half d-28 explicitly DEFERRED, and a rule that flagged it would
      // go red on ~82 files the ruling leaves alone — the outage
      // docs/reviews/2026-09-03-o53-…md §5.3 argued against.
      'const bytes = readFileSync(PNGP);',
      // Line 24 must NOT fire, and it is the one that cost nine false positives
      // in four scripts before the rule distinguished a PATH from CONTENT. What
      // came out of a peer file is bytes; writing them somewhere is not writing
      // to the peer, and taint that spreads on a bare mention says it is.
      `${CANARY_WRITE_FILE}(bytes, buf);`,
      // Lines 25-27 must NOT fire, and this is the trio that makes the rule
      // clearable at all: a destination taken from the OVERRIDE resolver has no
      // default, so the caller was forced to name a copy. Without this, the fix
      // for a violation would be an exemption entry rather than a fix.
      `const OVR = ${CANARY_OVERRIDE_RESOLVER}('${CANARY_PEER}')?.value;`,
      'const SAFE = `${OVR}/.aurora/canvas`;',
      `${CANARY_WRITE_DIR}(SAFE, { recursive: true, force: true });`,
      // Line 28 must NOT fire: a write to this repo's own output directory is
      // most of what these instruments do, and flagging it would be un-clearable.
      `${CANARY_WRITE_FILE}(join(ROOT, 'scratchpad/shots-canary/x.png'), buf);`,
      // Lines 29-31: SOURCE vs DESTINATION, the pair that decides whether the
      // rule reports the remedy as the defect. Copying a peer tree INTO a local
      // scratch directory (line 30) is precisely what d-28 asks a write-capable
      // instrument to do and must stay clean; copying anything INTO the peer
      // (line 31) is the violation. A rule matching the alias anywhere in the
      // argument list flags both, which is how `scripts/verify-s1-roundtrip.mjs`
      // came back red for doing the right thing.
      "const LOCALWORK = join(ROOT, 'scratchpad/work-canary');",
      `${CANARY_COPY}(CANVASD, LOCALWORK, { recursive: true });`,
      `${CANARY_COPY}(LOCALWORK, CANVASD, { recursive: true });`,
    ].join('\n'),
    at: [
      [3, 'sibling-literal'], [4, 'session-scratchpad'], [5, 'unratified-env'], [6, 'unratified-env'],
      [8, 'checkout-as-build-tree'], [9, 'checkout-as-build-tree'],
      [13, 'checkout-as-build-tree'], [15, 'checkout-as-build-tree'],
      [17, 'checkout-as-build-tree'],
      [20, 'peer-tree-write'], [22, 'peer-tree-write'], [31, 'peer-tree-write'],
    ],
  },
  {
    kind: 'hash',
    src: [
      `# a record quoting ${CANARY_ROOT}/peer — a comment opens no file, so this is exempt`,
      `AEON="${CANARY_ROOT}/peer"  # trailing record, also ${CANARY_ROOT}/peer, also exempt`,
      "echo don't stop here",
      `# and one more record, ${CANARY_ROOT}/peer, still exempt after that apostrophe`,
      `SHOTS="${CANARY_SESSION}"`,
      `aeon = os.environ["${CANARY_ENV}"]`,
      `aeon = os.environ.get("${CANARY_ENV}")`,
    ].join('\n'),
    // LINE 2 AND ONLY LINE 2 for rule 1, and each of lines 1, 3 and 4 is a
    // different way for that to break. Line 2 itself: the trailing `#` must not
    // shield the assignment BEFORE it, and the two occurrences on that line
    // count as one violating LINE, not two. Line 1 and line 4 must stay exempt,
    // and line 4 is the interesting one — the apostrophe in line 3's `don't` is
    // a bare word in shell, so a stripper that lets a quote run to the next
    // quote (or to EOF) leaves everything after it unstripped, and every `#`
    // record below turns into a violation nobody can clear. Lines 5-7 carry the
    // two new rules in this dialect's own spellings — `os.environ[…]` and
    // `os.environ.get(…)`, neither of which the C canary can reach.
    at: [[2, 'sibling-literal'], [5, 'session-scratchpad'], [6, 'unratified-env'], [7, 'unratified-env']],
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

const CANARY_RULES = makeRules(CANARY_ROOT);
const canaryFired = new Set();
for (const c of CANARIES) {
  const hits = scan(c.src, CANARY_RULES, c.kind);
  const want = c.at.map(([l, r]) => `${l}:${r}`).join(', ');
  const got = hits.map((h) => `${h.line}:${h.rule}`).join(', ');
  if (got !== want) {
    die(
      `the ${c.kind} canary did not behave: expected violations at [${want}], ` +
      `got [${got || 'none'}].\n` +
      '  The comment stripper or one of the matchers is broken, so a clean result from this\n' +
      '  run would be evidence of NOTHING. Fix the gate before trusting its answer.',
    );
  }
  for (const h of hits) canaryFired.add(h.rule);
}

// EVERY RULE MUST HAVE FIRED. A rule whose pattern silently stops matching —
// a renamed export, an over-escaped regex — would otherwise contribute zero
// violations for the rest of time and read as "that class is clean". This is the
// same argument as guard 1 itself, one level up: it is not enough that the
// canary agrees with the rules, the rules must all have been exercised.
for (const r of CANARY_RULES) {
  if (!canaryFired.has(r.id)) {
    die(`rule "${r.id}" never fired on either canary, so this run says nothing about it: `
      + `${r.what}. Its pattern matches nothing, and every file would pass it.`);
  }
}

// AND EVERY EXEMPTION MUST NAME A FILE THAT EXISTS. An exemption for a renamed
// or deleted file exempts nothing while looking like it exempts something, and
// the file it was written for is then policed by a rule it must violate.
for (const rel of [...RESOLVER_FILES, ...BUILD_RULE_EXEMPT, ...WRITE_RULE_EXEMPT]) {
  try {
    if (!statSync(join(ROOT, rel)).isFile()) throw new Error('not a file');
  } catch (e) {
    die(`the exemption list names ${rel}, which is not a readable file here (${e.message}). `
      + 'Either it moved — in which case update RESOLVER_FILES — or this gate is about to '
      + 'report the resolver as violating the rule the resolver implements.');
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

const RULES = makeRules(SIBLING);
const violations = [];
for (const f of files.sort()) {
  const rel = relative(ROOT, f);
  for (const hit of scan(readFileSync(f, 'utf8'), RULES, dialect(f), rel)) {
    violations.push({ file: rel, ...hit });
  }
}

// The contract asks every resolver's caller to print the resolved path AND the
// step that produced it before doing work against it, so a reader can tell a
// run that consulted an override from one that derived its own answer.
console.log(
  `${PREFIX}: scanned ${files.length} ${EXTS.join('/')} file(s) under ${ROOTS.join(', ')} ` +
  `against ${RULES.length} rule(s) — ${RULES.map((r) => r.id).join(', ')} ` +
  `(all ${RULES.length} fired on the canaries, both dialects; ` +
  `${ignored} git-ignored file(s) excluded, nothing else).\n` +
  `${PREFIX}: sibling root ${SIBLING} — ${SIBLING_SOURCE}\n` +
  `${PREFIX}: aurora ${AURORA_DIR}; ${OWNED_ENV.length} suite variable(s) policed, ` +
  `read only by ${RESOLVER_FILES.join(' and ')}`,
);

if (violations.length === 0) {
  console.log(`${PREFIX}: OK — no executable line names a sibling checkout by absolute path, `
    + 'names a session scratchpad, reads a suite path variable outside the resolver, '
    + `composes a build path out of ${CHECKOUT_IDENT}, or writes to a peer path the `
    + 'resolver defaulted.');
  process.exit(0);
}

const byRule = new Map(RULES.map((r) => [r.id, []]));
for (const v of violations) byRule.get(v.rule).push(v);

console.error(
  `\n${PREFIX}: FAIL — ${violations.length} executable line(s) across ` +
  `${[...byRule.values()].filter((v) => v.length).length} rule(s):\n` +
  RULES.filter((r) => byRule.get(r.id).length).map((r) =>
    `\n  [${r.id}] ${byRule.get(r.id).length} line(s) — ${r.what}:\n` +
    byRule.get(r.id).map((v) => `    ${v.file}:${v.line}\n        ${v.text}`).join('\n'),
  ).join('\n') +
  '\n\n' +
  '  [session-scratchpad] A path under an agent session\'s scratchpad stops\n' +
  '  existing when that session ends. As a DEFAULT it is the worst kind: it never\n' +
  '  trips a guard that compares against the live tree, so the run gets past the\n' +
  '  refusal and dies later and further away. Use `mkdtemp(os.tmpdir())` for a\n' +
  '  scratch directory, `${AURORA_DIR}/scratchpad/…` for output a human reads, or\n' +
  '  REFUSE naming the variable when a copy is something the operator must make.\n' +
  '\n' +
  '  [unratified-env] Going to the environment for a <PEER>_DIR yourself reads ONE\n' +
  '  spelling and nothing else:\n' +
  '  no transitional aliases, no refusal when two spellings disagree, no error\n' +
  '  when the variable is set but names nothing. Go through the resolver —\n' +
  '  `siblingPathOrUnresolved(name)` to resolve, `checkoutOverride(name)` when an\n' +
  '  override is REQUIRED, `AURORA_DIR` for this repo\'s own tree.\n' +
  '\n' +
  '  [checkout-as-build-tree] AURORA_DIR answers "which checkout am I" — observed\n' +
  '  from the resolver\'s own file location. The tree carrying node_modules/.bin/\n' +
  '  electron and dist/main/index.mjs is a DIFFERENT question, and in a linked git\n' +
  '  worktree it is a different directory: a worktree has neither, so a path\n' +
  '  composed off the checkout name points at a file that is not there and the run\n' +
  '  dies with an ENOENT inside xvfb-run that reads like "the CDP target never\n' +
  '  appeared". From a scratchpad/ instrument:\n' +
  '\n' +
  "      import { runTarget, announceRunRoot } from './lib/run-root.mjs';\n" +
  '      const ROOT = AURORA_DIR;                        // question 1: where I live\n' +
  '      const RUN = announceRunRoot(runTarget(ROOT));   // question 2: what I run\n' +
  '      const ELECTRON = RUN.electron;                  // honours ELECTRON_BIN\n' +
  '      const MAIN = RUN.main;\n' +
  '\n' +
  '  `runTarget` walks up for a tree carrying BOTH artifacts, honours\n' +
  '  AURORA_BUILT_TREE when an operator pins one, and `announceRunRoot` prints the\n' +
  '  tree it chose and marks it BORROWED when that is not the tree the script lives\n' +
  '  in — the announcement the artifacts carve-out owes (empyrean\n' +
  '  contract/SUITE_PATHS.md @ c9bc05f).\n' +
  '\n' +
  '  AURORA_DIR stays right for everything that is NOT a build artifact: reading\n' +
  '  src/, writing scratchpad/shots-*, opening test/fixtures/. Those are the tree\n' +
  '  you edited, and they are not what this rule flags.\n' +
  '\n' +
  '  [sibling-literal] That literal is one machine\'s home directory. Every row\n' +
  '  behind it can only ever SKIP on another checkout — unrunnable by\n' +
  '  construction, and silently so.\n' +
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
