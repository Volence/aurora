/**
 * THE ONE DERIVATION OF THE SIBLING ROOT — the directory holding this repo and
 * its peers (`aurora`, `aeon`, `s1disasm`, …).
 *
 * WHY THIS FILE IS `.mjs` AND NOT `.ts`, WHICH IS THE WHOLE POINT OF IT.
 * ---------------------------------------------------------------------
 * This derivation has two classes of consumer and they cannot share a
 * language:
 *
 *   · `test/support/peer-repo.ts` and everything under `test/` and `src/`,
 *     compiled by tsc and run by vitest;
 *   · `scripts/*.mjs` — `check-peer-path-literals`, `render-classic-act`,
 *     `probe-sonic-dplc-sharing`, `verify-s1-roundtrip` — plain Node ESM,
 *     run by `node` with no loader, which therefore cannot import a `.ts`.
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
 * they agreed is what kept anyone from looking.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This repository's own root. `test/support/` → two levels up. */
export const AURORA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The directory that holds this repo and its siblings, or null.
 *
 * Derived, not typed: `--git-common-dir` is the MAIN checkout's `.git` even
 * when we are running inside a linked worktree (where `--show-toplevel` would
 * answer with the worktree, several levels down), so `dirname(dirname(...))`
 * is the sibling root in both cases.
 *
 * `AURORA_PEER_ROOT` overrides it, and an override naming somewhere absent is
 * null rather than a fallback to the default — a redirect that silently snaps
 * back to this machine's own layout would make the override untestable, which
 * is the one thing it exists for.
 */
export function siblingRoot() {
  const override = process.env.AURORA_PEER_ROOT;
  if (override) return existsSync(override) ? override : null;
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: AURORA_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return common ? dirname(dirname(common)) : null;
  } catch {
    return null;
  }
}

/**
 * The path a peer checkout WOULD have, whether or not it is there.
 * `AURORA_<NAME>_REPO` overrides an individual peer.
 */
export function siblingPath(name, ...rel) {
  const override = process.env[`AURORA_${name.toUpperCase()}_REPO`];
  const root = override ?? (() => {
    const r = siblingRoot();
    return r === null ? null : resolve(r, name);
  })();
  if (root === null) return null;
  return rel.length === 0 ? root : resolve(root, ...rel);
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
 * The null case maps to a path under `UNRESOLVED_ROOT`, which is not a
 * directory and is not creatable by accident, so every `existsSync` downstream
 * answers false and the caller skips — the same outcome as an absent tree, and
 * the printed path says which root failed to resolve rather than pretending a
 * plausible one. It never silently reads something else.
 */
export function siblingPathOrUnresolved(name, ...rel) {
  return siblingPath(name, ...rel) ?? resolve(UNRESOLVED_ROOT, name, ...rel);
}
