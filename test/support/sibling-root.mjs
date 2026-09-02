/**
 * THE ONE DERIVATION OF THE SIBLING ROOT — the directory holding this repo and
 * its peers (`aurora`, `aeon`, `s1disasm`, …).
 *
 * THE NAMES ARE THE SUITE'S, NOT AURORA'S (empyrean `contract/SUITE_PATHS.md`
 * at `origin/main` 82982b7ff3c057f347d538fcf61b7c62b18ee813, ruled 2026-09-02).
 * --------------------------------------------------------------------------
 * A tool that names another tool means one of two things and they stay two
 * things: a CHECKOUT (`AEON_DIR`, `S1DISASM_DIR`, `ORACLE_DIR`, `EMPYREAN_DIR`,
 * …) and the SUITE ROOT they all hang off (`EMPYREAN_SUITE_ROOT`). Those are
 * the names; everything else here is a transitional alias, accepted so the
 * migration need not be atomic and announced on stderr so it does not become
 * permanent:
 *
 *     canonical                | aliases accepted during the transition
 *     -------------------------+---------------------------------------
 *     EMPYREAN_SUITE_ROOT      | AURORA_PEER_ROOT
 *     <NAME>_DIR               | AURORA_<NAME>_REPO
 *     AEON_DIR                 |   … and LIVE_AEON, which most of the
 *                              |     scratchpad instruments read today
 *     AURORA_DIR               | AURORA_ROOT, which 64 instruments read
 *                              |     today for THIS repo's own tree — but see
 *                              |     the OWN CHECKOUT section: for aurora these
 *                              |     three are a CONSISTENCY CHECK, not an
 *                              |     override, because this is aurora
 *     AURORA_BUILT_TREE        | (none, on purpose) — the OTHER question:
 *                              |     which BUILT tree a run executes against
 *
 * PRECEDENCE, THE SAME FOUR STEPS IN EVERY RESOLVER IN THE SUITE
 * -------------------------------------------------------------
 *   1. the explicit checkout variable (`AEON_DIR`);
 *   2. `EMPYREAN_SUITE_ROOT` joined with the repo's directory name;
 *   3. derivation from this repo's own location — `git rev-parse
 *      --git-common-dir`, which is the MAIN checkout's `.git` even from inside
 *      a linked worktree, so `dirname(dirname(…))` is the sibling root in both
 *      cases. Never `--show-toplevel`, which answers with the worktree.
 *   4. refuse, naming what was looked for and where.
 *
 * …AND THOSE FOUR STEPS ARE ABOUT **ANOTHER** TOOL'S CHECKOUT, which is what
 * the contract's title says. This repo's OWN checkout is not on that ladder: it
 * is observed from this module's file location, its step-source is `own`, and
 * `AURORA_DIR` is a consistency check over it rather than an override. See the
 * OWN CHECKOUT section further down, which quotes the ruling.
 *
 * The contract's amendment for aeon's landing applies to us too and is the
 * reason step 1 is not skippable: *"a resolver that reaches a sibling checkout
 * through the suite root alone still owes step 1."* `siblingPath()` consults
 * `<NAME>_DIR` before it ever asks for a suite root.
 *
 * ⚠ WHAT CHANGED HERE ON 2026-09-02, AND WHAT IT BREAKS ON PURPOSE.
 * -----------------------------------------------------------------
 * Until this revision, a variable that was SET BUT NAMED SOMETHING ABSENT
 * answered `null`, and `null` fell through to a stand-in root. The contract
 * makes that a hard error at the step that read it:
 *
 *     "A variable that is set but wrong (points at a directory that is not the
 *      named checkout) is a hard error at that step, the aeon semantic, not a
 *      null that lets the next step run: a wrong value is evidence of a wrong
 *      environment, and the next step would hide it."
 *
 * So `AURORA_PEER_ROOT=/nonexistent/relocated` — the spelling this file's own
 * history quotes below, and the one every poison run used — now THROWS
 * `SuitePathError` naming the variable, its value and the step. The replacement
 * recipe for "reproduce a machine with no reference data" is an EMPTY directory
 * rather than an absent one:
 *
 *     EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test
 *
 * which reproduces true absence exactly as well (the 2026-08-29 measurement was
 * itself taken with a tmpfs mounted over the sibling root — an existing, empty
 * directory) and cannot be confused with a typo in the variable name. `null`
 * now means step 4 and only step 4: no override was set and no derivation was
 * possible.
 *
 * `siblingRootSource()` / `siblingPathSource()` say WHICH STEP ANSWERED, which
 * the contract asks of every resolver ("a test, a script and a nightly timer
 * all print the resolved path and the step that produced it before doing work
 * against it"), and the refusal messages carry it so the fix is readable from
 * the message.
 *
 * WHY THIS FILE IS `.mjs` AND NOT `.ts`, WHICH IS THE WHOLE POINT OF IT.
 * ---------------------------------------------------------------------
 * This derivation has two classes of consumer and they cannot share a
 * language:
 *
 *   · `test/support/peer-repo.ts` and everything under `test/` and `src/`,
 *     compiled by tsc and run by vitest;
 *   · `scripts/*.mjs` and `scratchpad/*.mjs` — `check-peer-path-literals`,
 *     `render-classic-act`, `probe-sonic-dplc-sharing`, `verify-s1-roundtrip`
 *     and the forty-odd harnesses — plain Node ESM, run by `node` with no
 *     loader, which therefore cannot import a `.ts`.
 *
 * A `.ts` module can only serve the first group, so the scripts kept their own
 * hand-typed `'/home/volence/sonic_hacks/s1disasm'`. A `.mjs` module serves
 * BOTH: node imports it directly, and tsc reads its signature from the
 * `.d.mts` beside it. So there is exactly one implementation of this function
 * in the repository, and every consumer of a sibling path goes through it.
 *
 * WHAT THE SECOND COPY COST, MEASURED RATHER THAN ASSERTED.
 * --------------------------------------------------------
 * Before this file existed there were two derivations: this one, living in
 * `peer-repo.ts`, and a private copy inside `scripts/check-peer-path-literals.mjs`
 * whose own docblock claimed it derived the root *"exactly as `peer-repo.ts`
 * derives it"*. It did not. `peer-repo.ts` honours `AURORA_PEER_ROOT`; the copy
 * never read it. Measured 2026-08-30:
 *
 *     $ AURORA_PEER_ROOT=/nonexistent/relocated node scripts/check-peer-path-literals.mjs
 *     … scanned 918 file(s) … for literals naming /home/volence/sonic_hacks
 *
 * — the gate went on forbidding the DEFAULT root while the tests it polices
 * were resolving their fixtures somewhere else entirely. Under that override
 * the gate forbids a string no test can use and permits the one they all do,
 * which is not a weaker version of the check: it is the check pointed at the
 * wrong target while printing a confident pass. Two copies did not drift
 * eventually; they shipped already disagreeing, and the docblock asserting
 * they agreed is what kept anyone from looking. (That command line is a RECORD
 * of a 2026-08-30 measurement. Run today it refuses, by the rule above; the
 * measurement it recorded still stands.)
 */

import { execFileSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where this module's own file sits in a tree — `test/support/` → two levels up.
 *
 * THE OBSERVATION, and therefore the answer: `AURORA_DIR` below is exported
 * straight from it. Nothing consults the environment to produce this value; see
 * "THIS REPO'S OWN CHECKOUT — OBSERVED, NOT RESOLVED" below for why.
 */
const AURORA_DIR_DERIVED = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every refusal from this module. Never a null that lets the next step run. */
export class SuitePathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SuitePathError';
  }
}

/** The suite-root variable. THIS is the name; the rest are aliases. */
export const SUITE_ROOT_ENV = 'EMPYREAN_SUITE_ROOT';

/**
 * Transitional aliases for the suite root, accepted and announced.
 * `AURORA_PEER_ROOT` was aurora's own spelling before the contract; the
 * contract rejected both brand-carrying candidates by name.
 */
export const SUITE_ROOT_ENV_ALIASES = ['AURORA_PEER_ROOT'];

/**
 * The peer checkouts this repo can name, by directory name.
 *
 * The five suite tools from the contract's own table (`AEON_DIR`, `SIGIL_DIR`,
 * `EMPYREAN_DIR`, `SERAPH_DIR`, `ORACLE_DIR` — aurora is itself, and has
 * `AURORA_DIR` above), plus `s1disasm`, the Sonic 1 reference tree aurora opens
 * as a project and which the contract does not list because no other tool reads
 * it.
 *
 * IT IS HERE SO THE GATE NEED NOT REPEAT IT. `check-peer-path-literals` forbids
 * reading any variable this module owns from `process.env` directly; the set of
 * such variables is `OWNED_ENV` at the foot of this file, which is assembled
 * from this roster plus the suite-root and aurora names. A roster typed a second
 * time inside the gate is how the gate would come to police a different set of
 * names than the resolver implements — the two-copies defect this file's header
 * already records once.
 */
export const SUITE_PEERS = ['aeon', 'sigil', 'empyrean', 'seraph', 'oracle', 's1disasm'];

/** The canonical checkout variable for a peer: `aeon` → `AEON_DIR`. */
export function checkoutEnv(name) {
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_DIR`;
}

/**
 * Transitional aliases for one peer's checkout variable.
 *
 * `LIVE_AEON` is here because it is what the scratchpad instruments read
 * today; the contract lists it among the aeon spellings "to retire at their
 * owners' pace", and `AEON_ROOT` is another from that same list, read by
 * `src/core/editing/__tests__/bg-override-art-injector-gate.test.ts`. `S1_DIR`
 * is aurora's own older spelling for `S1DISASM_DIR`, accepted so migrating the
 * instruments that read it drops no override.
 *
 * THIS LIST AND `checkout_env_aliases` IN `scratchpad/lib/suite_paths.py` ARE TWO
 * COPIES OF ONE FACT, and they drifted: `AEON_ROOT` was accepted here and not
 * there, so an operator who exported it got a JavaScript instrument that
 * resolved and a Python one that refused. `scratchpad/lib/test_suite_paths.py`
 * now compares both tables live — over `SUITE_PEERS` plus a non-peer name, in
 * order, since the first spelling that answers wins — and goes red when either
 * side gains, loses or reorders an alias. Edit this function and that row is
 * where it will be noticed.
 */
export function checkoutEnvAliases(name) {
  const upper = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const extra = { aeon: ['LIVE_AEON', 'AEON_ROOT'], s1disasm: ['S1_DIR'] }[name] ?? [];
  return [`AURORA_${upper}_REPO`, ...extra];
}

/** Announced at most once per process per variable — a nag, not a log. */
const announced = new Set();

function announceAlias(aliasName, canonicalName) {
  if (announced.has(aliasName)) return;
  announced.add(aliasName);
  process.stderr.write(
    `suite-paths: ${aliasName} is a transitional alias — set ${canonicalName} instead `
    + '(empyrean contract/SUITE_PATHS.md)\n',
  );
}

function expand(value) {
  return resolve(value.startsWith('~/') || value === '~' ? homedir() + value.slice(1) : value);
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The spelling that answers for one question, or null when nothing is set.
 *
 * Canonical first, then aliases in order. Two spellings set to DIFFERENT
 * directories is the same defect as a wrong one — two answers to one question
 * is evidence of a wrong environment — and is refused naming both.
 */
function pickEnv(canonical, aliases) {
  const found = [canonical, ...aliases]
    .filter((n) => (process.env[n] ?? '') !== '')
    .map((n) => ({ name: n, value: process.env[n] }));
  if (found.length === 0) return null;
  const first = found[0];
  for (const other of found.slice(1)) {
    if (expand(other.value) !== expand(first.value)) {
      throw new SuitePathError(
        `${first.name}=${first.value} and ${other.name}=${other.value} DISAGREE — this names one `
        + `directory, so two different answers is a wrong environment, not a preference. Unset `
        + `${other.name} (a transitional alias) and set only ${canonical}. `
        + '(empyrean contract/SUITE_PATHS.md @ 82982b7f)',
      );
    }
  }
  return first;
}

/**
 * An override that is SET must be right. The contract's "set but wrong is a
 * hard error at that step, not a null that lets the next step run".
 */
function requireDir(pick, step, what) {
  if (!isDir(expand(pick.value))) {
    throw new SuitePathError(
      `${pick.name}=${pick.value} is not a directory — ${what}. Precedence step ${step} refuses `
      + 'rather than falling through: a variable that is set but wrong is evidence of a wrong '
      + 'environment, and the next step would hide it. To reproduce a machine WITHOUT the '
      + `reference trees, point ${pick.name} at an EMPTY directory (\`$(mktemp -d)\`), not at an `
      + 'absent one. (empyrean contract/SUITE_PATHS.md @ 82982b7f)',
    );
  }
  return expand(pick.value);
}

/**
 * ────────────────────────────────────────────────────────────────────────────
 * THIS REPO'S OWN CHECKOUT — OBSERVED, NOT RESOLVED. Step-source `own`.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * "Which aurora tree am I?" was, until O69, answered by hand in 93 files: 64
 * spelled it `process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(
 * import.meta.url)))` and 29 more wrote the derivation with no override at all,
 * so an operator pointing a run at another tree moved 64 of them and silently
 * failed to move the other 29. O69 gave them one derivation; it also gave
 * `AURORA_DIR` a step-1 OVERRIDE, and that half was wrong.
 *
 * ⚠ THE PRECEDENCE ABOVE IS FOR NAMING ANOTHER TOOL'S CHECKOUT. The hub ruled
 * on 2026-09-02, from this repo's own O69 question (empyrean
 * `contract/SUITE_PATHS.md` @ fba68d5, "A resolver's OWN checkout is observed,
 * not resolved"):
 *
 *     "For the resolver's own tree the module's file location is a direct
 *      observation, and steps 1 and 2 are guesses about a fact already in hand.
 *      … Own checkout = the module's own location (`import.meta.url`, …), never
 *      cwd and never `--show-toplevel`. Its step-source says so (`own`) …
 *      `<OWN>_DIR`, if set, is a consistency check, not an override:
 *      set-and-agreeing is fine, set-but-wrong throws … The row for `AURORA_DIR`
 *      in the variable table exists so that OTHER tools can name aurora; it is
 *      not aurora's instruction to itself."
 *
 * So there is NO step 1 here and no step 2, and the source string does not
 * pretend otherwise: it says `own`. Step 2 would break the documented poison
 * recipe on purpose —
 *
 *     EMPYREAN_SUITE_ROOT=$(mktemp -d) npm test
 *
 * exists to reproduce a machine with no REFERENCE trees. If it also relocated
 * aurora, every harness would stop finding its own `dist/`, `src/` and schema
 * files, and a run meant to prove "the peer-dependent half skips honestly"
 * would instead die of unrelated absence. It would also make a linked worktree
 * resolve to the MAIN checkout, which is precisely the `--show-toplevel` bug
 * the contract's step 3 warns about, reintroduced from the other side. Step 1
 * would be worse still, because it is silent: `AURORA_DIR=/elsewhere npm test`
 * relocated the repo UNDER TEST, which is the exact hazard the rest of this file
 * is built to prevent, left open one step inward.
 *
 * TWO QUESTIONS WERE WEARING ONE VARIABLE, AND THEY ARE NOW TWO.
 * -------------------------------------------------------------
 *   · "Where do I live?" — `AURORA_DIR`, observed here, never overridable.
 *   · "Which built tree do I RUN AGAINST?" — `AURORA_BUILT_TREE` below, which
 *     is a genuinely different question and legitimately overridable.
 *
 * They were the same variable because a linked worktree shares no `node_modules`
 * and no `dist/` with the checkout it was cut from, so an instrument that has to
 * borrow a built tree reached for the only knob there was. That is the second
 * question, and the contract already has the shape for it: *"A variable that
 * names a directory of artifacts rather than a checkout (oracle's
 * `ORACLE_AEON_DIR`, defaulting to a frozen copy) keeps its own name; it is not
 * an alias of `AEON_DIR`."*
 */

/** The canonical variable naming THIS repo's checkout. THIS is the name. */
export const AURORA_DIR_ENV = 'AURORA_DIR';

/**
 * Transitional aliases for it, accepted and announced.
 *
 * `AURORA_ROOT` is what 64 instruments read; `AURORA_REPO` is a third spelling
 * two of them grew for the same fact. They are still accepted, still announced,
 * and — like the canonical name — are now CHECKED rather than obeyed.
 */
export const AURORA_DIR_ENV_ALIASES = ['AURORA_ROOT', 'AURORA_REPO'];

/**
 * The tree an instrument RUNS AGAINST: a built tree, not a checkout.
 *
 * NOT `AURORA_*_DIR`, deliberately. `<TOOL>_DIR` is the ratified spelling for a
 * CHECKOUT, and one token away from `AURORA_DIR` is exactly where these two
 * questions fused in the first place; a reader who sees `AURORA_BUILT_TREE`
 * cannot mistake it for the checkout row in the contract's table. It names what
 * makes the answer different from the checkout, too: a tree with no
 * `node_modules/.bin/electron` and no `dist/` is not a candidate, however
 * genuinely it is an aurora checkout.
 *
 * NO ALIASES, and that is a decision rather than an omission. `AURORA_ROOT` is
 * what the harnesses' headers used to document for "pin the tree", but it is a
 * transitional alias of `AURORA_DIR` read by ~64 instruments for a DIFFERENT
 * fact; making it mean both is the fusion again. An operator who types it at the
 * old job now gets the consistency check's refusal, which names this variable.
 *
 * ⚠ NOT A RULE — A CONDITIONAL. The contract (@ 8be3a16, sigil checking the same
 * fold against its own `AEON_DIR`) says *"the fold is safe precisely while the
 * build is in-tree AND the artifacts are revision-stamped; it becomes unsafe the
 * moment either stops holding, and splitting before then adds a variable whose
 * two halves are provably identical."* Sigil is NOT splitting and is right not
 * to. Aurora fails the first condition — a linked worktree has no `dist/` of its
 * own — which is why aurora splits. Do not read this as "split every
 * `<TOOL>_DIR`".
 *
 * WHO READS IT TODAY: `scratchpad/lib/run-root.mjs`, whose docblock carries the
 * migration surface (105 of 123 `scratchpad/*.mjs` instruments use `AURORA_DIR`
 * to reach `node_modules/` or `dist/`, counted 2026-09-02 — question 2 wearing
 * question 1's answer, benign from the main checkout, unconverted).
 */
export const AURORA_BUILT_TREE_ENV = 'AURORA_BUILT_TREE';

/**
 * The raw observation, and the only answer: this module's own file location.
 *
 * `test/support/` → two levels up. Never cwd (a harness is run from anywhere),
 * never `--show-toplevel` (it answers with the main checkout from a worktree).
 */
export const AURORA_DIR = AURORA_DIR_DERIVED;

/**
 * Same path, compared with symlinks followed — for the consistency check ONLY.
 *
 * `/tmp` is a symlink on some machines and `.claude/worktrees/` is reached
 * through one on this one, so an operator who exports the realpath while the
 * module observes the symlinked path has AGREED and must not be refused. The
 * returned/exported value stays the unresolved observation, because that is the
 * path every instrument's output has always printed.
 */
function realish(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

/**
 * `<OWN>_DIR`, IF SET, IS A CONSISTENCY CHECK — the contract's words. Eager.
 *
 * Set-and-agreeing is fine and silent (bar the alias nag, which is about the
 * SPELLING and still owed). Set-but-wrong throws, for the same reason a wrong
 * `AEON_DIR` throws: it is evidence of a wrong environment, and the alternative
 * is relocating the repo under test without saying so.
 *
 * Run at module load, which is the loudest place: the throw lands on the import
 * rather than on the first `readFileSync` that opens the wrong tree.
 */
function checkOwnCheckoutClaim() {
  const pick = pickEnv(AURORA_DIR_ENV, AURORA_DIR_ENV_ALIASES);
  if (pick === null) return null;
  if (pick.name !== AURORA_DIR_ENV) announceAlias(pick.name, AURORA_DIR_ENV);
  const claimed = expand(pick.value);
  if (claimed !== AURORA_DIR && realish(claimed) !== realish(AURORA_DIR)) {
    throw new SuitePathError(
      `${pick.name}=${pick.value} does not agree with where this module actually is. `
      + `${AURORA_DIR_ENV} is a CONSISTENCY CHECK on aurora's own checkout, NOT an override: `
      + `the own checkout is observed from ${fileURLToPath(import.meta.url)}, which makes it `
      + `${AURORA_DIR}. Setting it to something else cannot move this repo; it can only relocate `
      + 'the repo under test silently, so it is refused. That row in the contract\'s variable table '
      + `exists so OTHER tools can name aurora. If you meant "run against the built tree over `
      + `there" — a different question — set ${AURORA_BUILT_TREE_ENV}=${pick.value} instead. `
      + '(empyrean contract/SUITE_PATHS.md @ fba68d5, "A resolver\'s OWN checkout is observed, '
      + 'not resolved")',
    );
  }
  return pick;
}

const OWN_CHECKOUT_CLAIM = checkOwnCheckoutClaim();

/**
 * Which step produced `AURORA_DIR`. `own`, always — never a precedence step.
 *
 * It names the file it observed, so a reader can tell a run standing in a linked
 * worktree from one standing in the main checkout, and it says when a variable
 * was checked, so "the check ran and agreed" and "nothing was set" are not the
 * same line.
 */
export function auroraDirSource() {
  const checked = OWN_CHECKOUT_CLAIM === null ? ''
    : ` (${OWN_CHECKOUT_CLAIM.name}=${OWN_CHECKOUT_CLAIM.value} agrees — a consistency check, `
      + 'not an override)';
  return `own: this module's own location (${fileURLToPath(import.meta.url)}) → ${AURORA_DIR}`
    + checked;
}

/**
 * The BUILT TREE this run is aimed at, as `{ name, value }`, or null.
 *
 * The second question, answered separately. For the instrument that must
 * distinguish "an operator pointed me at another tree's build" from "I am
 * running against the tree I live in" (`mapviewport-baseline-harness`, which
 * reports the run as BORROWED when they differ, because a linked worktree has
 * neither `node_modules` nor `dist/`).
 *
 * Set-but-wrong is a hard error on the contract's own terms — a variable that
 * points at a directory that is not there is evidence of a wrong environment,
 * and a harness that fell through would run against a tree the operator did not
 * name and report a number for it.
 */
export function auroraBuiltTree() {
  const pick = pickEnv(AURORA_BUILT_TREE_ENV, []);
  if (pick === null) return null;
  if (!isDir(expand(pick.value))) {
    throw new SuitePathError(
      `${pick.name}=${pick.value} is not a directory — it is meant to name a BUILT aurora tree `
      + '(one with `node_modules/` and `dist/`) for this run to execute against. It refuses rather '
      + 'than falling back to the tree this instrument lives in: a run that quietly measured a '
      + 'different build than the one you named is the failure this variable exists to prevent. '
      + `${AURORA_BUILT_TREE_ENV} is NOT ${AURORA_DIR_ENV}: it names artifacts, not a checkout, so `
      + 'it does not move where this repo is. (empyrean contract/SUITE_PATHS.md @ fba68d5)',
    );
  }
  return { name: pick.name, value: expand(pick.value) };
}

/** `{ root, source }` for the suite root; `root` is null only at step 4. */
function resolveSuiteRoot() {
  const pick = pickEnv(SUITE_ROOT_ENV, SUITE_ROOT_ENV_ALIASES);
  if (pick !== null) {
    const root = requireDir(pick, 2, 'it is meant to be the directory holding the suite checkouts');
    if (pick.name !== SUITE_ROOT_ENV) announceAlias(pick.name, SUITE_ROOT_ENV);
    const note = pick.name === SUITE_ROOT_ENV ? '' : ` (transitional alias; the name is ${SUITE_ROOT_ENV})`;
    return { root, source: `step 2: ${pick.name}=${pick.value}${note}` };
  }
  let common = '';
  try {
    common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: AURORA_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    common = '';
  }
  if (common) {
    return {
      root: dirname(dirname(common)),
      source: `step 3: git rev-parse --git-common-dir from ${AURORA_DIR} → ${common}`,
    };
  }
  return {
    root: null,
    source: `step 4: REFUSED — ${SUITE_ROOT_ENV} is unset (aliases: ${SUITE_ROOT_ENV_ALIASES.join(', ')}) `
      + `and \`git rev-parse --git-common-dir\` in ${AURORA_DIR} produced nothing, so there is no `
      + 'directory to call the suite root',
  };
}

/**
 * The directory that holds this repo and its siblings, or null.
 *
 * Null means STEP 4 and only step 4 — nothing was set and nothing could be
 * derived. A set-but-wrong variable throws (see the header); it never quietly
 * becomes this null and then a fallback, which is how an override that exists
 * to redirect a run silently snapped back to this machine's own layout.
 */
export function siblingRoot() {
  return resolveSuiteRoot().root;
}

/**
 * Which precedence step produced `siblingRoot()`, as prose to print before
 * doing work against the path. Never throws for step 4; it describes it.
 */
export function siblingRootSource() {
  return resolveSuiteRoot().source;
}

/** `{ path, source }` for one peer; `path` is null only at step 4. */
function resolveSiblingPath(name, rel, { allowCheckoutEnv = true } = {}) {
  if (allowCheckoutEnv) {
    const canonical = checkoutEnv(name);
    const pick = pickEnv(canonical, checkoutEnvAliases(name));
    if (pick !== null) {
      const dir = requireDir(pick, 1, `it is meant to be the ${name} checkout`);
      if (pick.name !== canonical) announceAlias(pick.name, canonical);
      const note = pick.name === canonical ? '' : ` (transitional alias; the name is ${canonical})`;
      return {
        path: rel.length === 0 ? dir : resolve(dir, ...rel),
        source: `step 1: ${pick.name}=${pick.value}${note}`,
      };
    }
  }
  const { root, source } = resolveSuiteRoot();
  if (root === null) return { path: null, source };
  const dir = resolve(root, name);
  return { path: rel.length === 0 ? dir : resolve(dir, ...rel), source };
}

/**
 * The path a peer checkout WOULD have, whether or not it is there.
 *
 * Deliberately not existence-checked at steps 2–3: a skip reason has to be able
 * to name the file it wanted. Only an EXPLICIT override is checked, because
 * that one is a claim someone typed.
 */
export function siblingPath(name, ...rel) {
  return resolveSiblingPath(name, rel).path;
}

/** Which precedence step answered for this peer, for the line printed before work. */
export function siblingPathSource(name) {
  return resolveSiblingPath(name, []).source;
}

/**
 * The path a peer checkout would have IGNORING its own `<NAME>_DIR` override —
 * i.e. where it lives by default beside this repo.
 *
 * WHAT THIS IS FOR, and why it is not the same function as `siblingPath`. Seven
 * harnesses take `AEON_DIR` as "the writable COPY to edit" and must REFUSE to
 * run when it is the real tree. They spelled that refusal
 * `AEONDIR.startsWith('/home/volence/sonic_hacks/aeon')` — a literal, so the
 * guard stops guarding the moment the suite moves. Routed through `siblingPath`
 * instead it would be worse than a literal: with `AEON_DIR` set, step 1 answers
 * with `AEON_DIR` itself, so the guard would compare the value against itself
 * and refuse every run. The default location is the thing being guarded
 * against, so the default location is what the resolver has to be able to say.
 */
export function siblingDefaultPath(name, ...rel) {
  return resolveSiblingPath(name, rel, { allowCheckoutEnv: false }).path;
}

/**
 * The explicit checkout override for a peer, as `{ name, value }`, or null.
 *
 * For an instrument that REQUIRES one to have been set (a harness that writes,
 * and must be pointed at a copy). It exists so such a site does not hand-roll
 * `process.env.AEON_DIR` and thereby miss the aliases, the disagreement
 * refusal and the set-but-wrong error.
 */
export function checkoutOverride(name) {
  const canonical = checkoutEnv(name);
  const pick = pickEnv(canonical, checkoutEnvAliases(name));
  if (pick === null) return null;
  const dir = requireDir(pick, 1, `it is meant to be the ${name} checkout`);
  if (pick.name !== canonical) announceAlias(pick.name, canonical);
  return { name: pick.name, value: dir };
}

/**
 * Resolve a peer path and REFUSE, by name, when no step could answer.
 *
 * The contract's step 4 in its loudest form: for a caller that is about to open
 * the path and has nothing useful to do with a null.
 */
export function requireSiblingPath(name, ...rel) {
  const { path, source } = resolveSiblingPath(name, rel);
  if (path === null) {
    throw new SuitePathError(
      `cannot resolve the ${name} checkout: looked for ${checkoutEnv(name)} (aliases: `
      + `${checkoutEnvAliases(name).join(', ')}), then ${SUITE_ROOT_ENV} (aliases: `
      + `${SUITE_ROOT_ENV_ALIASES.join(', ')}), then a derivation from ${AURORA_DIR}. ${source}. `
      + `Set ${checkoutEnv(name)} or ${SUITE_ROOT_ENV}. (empyrean contract/SUITE_PATHS.md @ 82982b7f)`,
    );
  }
  return path;
}

/**
 * Stand-in root for "no sibling root could be derived at all".
 *
 * Under `/nonexistent`, which is conventionally absent and, unlike a plausible
 * relative guess, cannot resolve onto real files if a caller forgets to guard.
 */
export const UNRESOLVED_ROOT = '/nonexistent/aurora-unresolved-peer-root';

/**
 * `siblingPath`, but always a `string` — the TYPE the hand-typed
 * `'/home/volence/sonic_hacks/s1disasm'` literals had.
 *
 * WHY THIS EXISTS BESIDE `siblingPath`. Every call site being converted opened
 * with `const S1DIR = '…'` and then used `S1DIR` as a plain string —
 * `join(S1DIR, rel)`, `existsSync(join(…))`, template literals in skip
 * reasons. Answering `string | null` turns one mechanical substitution into a
 * hand edit of the null case at every site, each an opportunity to write a
 * different guard. This keeps the substitution mechanical and leaves every
 * downstream `existsSync` deciding exactly as before.
 *
 * THE NULL CASE IS NOW STEP 4 ALONE — not a checkout, and no override set. It
 * maps to a path under `UNRESOLVED_ROOT`, which is not a directory and is not
 * creatable by accident, so every `existsSync` downstream answers false and the
 * caller skips — the same outcome as an absent tree, and the printed path says
 * which root failed to resolve rather than pretending a plausible one. A
 * set-but-wrong variable does NOT arrive here: it throws at the step that read
 * it, which is the whole change.
 */
export function siblingPathOrUnresolved(name, ...rel) {
  return siblingPath(name, ...rel) ?? resolve(UNRESOLVED_ROOT, name, ...rel);
}

/** `siblingDefaultPath`, but always a string, on the same terms. */
export function siblingDefaultPathOrUnresolved(name, ...rel) {
  return siblingDefaultPath(name, ...rel) ?? resolve(UNRESOLVED_ROOT, name, ...rel);
}

/**
 * EVERY ENVIRONMENT VARIABLE THIS MODULE OWNS — assembled here, once.
 *
 * `check-peer-path-literals.mjs` rule 3 forbids reading any of these from
 * `process.env` / `os.environ` anywhere but the resolver, and it takes the list
 * from HERE. It used to assemble the same list itself out of the individual
 * exports, which made its own docblock's claim — *"a variable added or renamed
 * there is policed here without anyone remembering to edit this file"* — false
 * for anything but a renamed peer: adding `AURORA_BUILT_TREE` to this module
 * would have left the gate silently not policing it. One list, one owner.
 */
export const OWNED_ENV = [
  SUITE_ROOT_ENV, ...SUITE_ROOT_ENV_ALIASES,
  AURORA_DIR_ENV, ...AURORA_DIR_ENV_ALIASES,
  AURORA_BUILT_TREE_ENV,
  ...SUITE_PEERS.flatMap((n) => [checkoutEnv(n), ...checkoutEnvAliases(n)]),
];

// A one-line answer to "where does this think the suite is?", for a human at a
// prompt and for the instruments' own `--where` flags.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { root, source } = resolveSuiteRoot();
  const built = auroraBuiltTree();
  process.stdout.write(`aurora ${AURORA_DIR}\n`);
  process.stdout.write(`from   ${auroraDirSource()}\n`);
  process.stdout.write(`built  ${built === null ? `(none — ${AURORA_BUILT_TREE_ENV} unset)` : built.value}\n`);
  process.stdout.write(`suite  ${root ?? '(unresolved)'}\n`);
  process.stdout.write(`from   ${source}\n`);
}
