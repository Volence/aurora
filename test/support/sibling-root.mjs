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
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repository's own root. `test/support/` → two levels up. */
export const AURORA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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

/** The canonical checkout variable for a peer: `aeon` → `AEON_DIR`. */
export function checkoutEnv(name) {
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_DIR`;
}

/**
 * Transitional aliases for one peer's checkout variable.
 *
 * `LIVE_AEON` is here because it is what the scratchpad instruments read
 * today; the contract lists it among the aeon spellings "to retire at their
 * owners' pace". `S1_DIR` is aurora's own older spelling for `S1DISASM_DIR`,
 * accepted so migrating the instruments that read it drops no override.
 */
export function checkoutEnvAliases(name) {
  const upper = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const extra = { aeon: ['LIVE_AEON'], s1disasm: ['S1_DIR'] }[name] ?? [];
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
      cwd: AURORA_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    common = '';
  }
  if (common) {
    return {
      root: dirname(dirname(common)),
      source: `step 3: git rev-parse --git-common-dir from ${AURORA_ROOT} → ${common}`,
    };
  }
  return {
    root: null,
    source: `step 4: REFUSED — ${SUITE_ROOT_ENV} is unset (aliases: ${SUITE_ROOT_ENV_ALIASES.join(', ')}) `
      + `and \`git rev-parse --git-common-dir\` in ${AURORA_ROOT} produced nothing, so there is no `
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
      + `${SUITE_ROOT_ENV_ALIASES.join(', ')}), then a derivation from ${AURORA_ROOT}. ${source}. `
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

// A one-line answer to "where does this think the suite is?", for a human at a
// prompt and for the instruments' own `--where` flags.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { root, source } = resolveSuiteRoot();
  process.stdout.write(`aurora ${AURORA_ROOT}\n`);
  process.stdout.write(`suite  ${root ?? '(unresolved)'}\n`);
  process.stdout.write(`from   ${source}\n`);
}
