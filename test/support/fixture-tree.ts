/**
 * REFERENCE-DATA FIXTURES, AND WHAT A TEST OWES A MACHINE THAT DOES NOT HAVE THEM.
 *
 * WHY THIS FILE EXISTS. A large part of this suite measures Aurora against real
 * Sonic 1 / aeon data that lives OUTSIDE this repository — `../s1disasm`,
 * `../aeon`. That data is not vendored and is not on every machine. On a machine
 * without it, every one of those tests has exactly one honest thing to report:
 *
 *     SKIPPED, and here is the specific file I could not read.
 *
 * Three dishonest things it can report instead, all of which this tree has done,
 * all measured on 2026-08-29 by mounting a private tmpfs over the sibling root
 * (`docs/reviews/2026-08-29-fixture-absent-honesty.md`):
 *
 *   1. FAIL — which says "Aurora is broken" when the truth is "the fixture is
 *      not here". 59 tests did this.
 *   2. DIE AT COLLECTION — an uncaught read in a module or `describe` body takes
 *      the whole FILE, and its other tests with it. 3 files, 29 tests.
 *   3. PASS — the worst of the three, because it can never go red again. 6 tests
 *      did this, via `if (absent) { console.warn('skip…'); return; }`, which
 *      vitest records as a pass. The skip-report gate is structurally blind to
 *      it: such a test never skips, so its failure state and its success state
 *      emit the same artifact.
 *
 * A fourth, quieter one: a test that is never REGISTERED. `it.each(files)` over
 * an empty list produces no rows at all, so the coverage does not fail, does not
 * skip, and does not appear — 58 rows evaporated with no line in the report.
 * `declareUnenumerated` exists for exactly that case.
 *
 * WHY NOT `peer-repo.ts`. That module answers a different question: it reads a
 * peer at a COMMITTED REVISION through git plumbing, deliberately never opening
 * a file inside a peer checkout. It is the right instrument for a currency check
 * against a pinned anchor. It is the wrong one for a test whose subject IS a
 * working checkout on disk — the s1disasm rows open a disassembly the way the
 * editor opens it. The sibling-root derivation is not duplicated: it is imported
 * from there, so there remains exactly one of it.
 *
 * (That those rows read a peer's LIVE working tree is a real and separate
 * defect, booked in `docs/reviews/2026-08-28-golden-live-tree.md`. This file
 * does not fix it and does not pretend to; it makes the ABSENCE honest.)
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';

import { siblingRoot } from './peer-repo';

/**
 * A reference checkout beside this repo, or null when it is not there.
 *
 * DERIVED, NEVER TYPED. The literal `/home/volence/sonic_hacks/<name>` used to
 * appear in 34 executable places in this tree (36 lines, two of them comments),
 * and that literal is wrong from any checkout but one — a test pinned to it can
 * only ever skip on someone else's machine. All 34 were converted to
 * `referencePath` on 2026-08-30
 * (`docs/reviews/2026-08-30-s1disasm-test-coupling.md`); what remains matching
 * that string anywhere under `src/` or `test/` is three COMMENT lines quoting a
 * historical error message or this very sentence, which are records and must
 * not be "fixed". Worse than merely wrong, a
 * RELATIVE hop of a fixed depth (`resolve(__dirname, '../../../../../../aeon')`)
 * is wrong in a way that hides: it happened to be right from a linked worktree,
 * six levels down, and resolved to `/aeon` from the main checkout — so the two
 * tests using it had been passing while measuring nothing, everywhere except
 * inside an agent worktree. `siblingRoot()` answers correctly from both, and
 * honours `AURORA_PEER_ROOT` / `AURORA_<NAME>_REPO`.
 */
export function referenceTree(name: string): string | null {
  const dir = referenceFile(name);
  return dir !== null && existsSync(dir) ? dir : null;
}

/**
 * The path a reference file WOULD have, whether or not it is there.
 *
 * Deliberately not existence-checked. A skip reason has to name the thing that
 * was missing — "cannot read <path>" is actionable, "no checkout found" is a
 * shrug — so the absent case must still be able to say which file it wanted.
 * Only a machine where no sibling root can be derived at all yields null, and
 * `unmeasurable` has separate wording for that.
 */
export function referenceFile(name: string, ...rel: string[]): string | null {
  const override = process.env[`AURORA_${name.toUpperCase()}_REPO`];
  const root = override ?? (() => {
    const r = siblingRoot();
    return r === null ? null : resolve(r, name);
  })();
  if (root === null) return null;
  return rel.length === 0 ? root : resolve(root, ...rel);
}

/**
 * The root a caller would have written as `'/home/volence/sonic_hacks/<name>'`,
 * with the same TYPE that literal had.
 *
 * WHY THIS EXISTS BESIDE `referenceFile`. Thirty-four sites in this tree opened
 * with `const S1DIR = '/home/volence/sonic_hacks/s1disasm';` and then used
 * `S1DIR` as a plain `string` — `join(S1DIR, rel)`, `existsSync(join(...))`,
 * template literals in skip reasons. `referenceFile` answers `string | null`, so
 * converting those sites through it turns one mechanical substitution into
 * thirty-four hand edits of the null case, each an opportunity to write a
 * different guard. This keeps the substitution mechanical and the guards
 * unchanged: every downstream `existsSync` still decides, exactly as before.
 *
 * WHAT THE NULL CASE BECOMES, and why that is honest. `referenceFile` answers
 * null only when no sibling root can be derived at all (not a git checkout, or
 * `AURORA_PEER_ROOT` names somewhere that does not exist). That case maps here
 * to a path under `UNRESOLVED_ROOT`, which is not a directory and is not
 * creatable by accident, so every `existsSync` downstream answers false and the
 * rows skip — the same outcome as an absent tree, and the path printed in the
 * skip reason says which root failed to resolve rather than pretending a
 * plausible one. It never silently reads something else.
 *
 * DEFAULT PRESERVED. With no environment set this resolves to the sibling
 * checkout beside this repo, which on the machine those literals were written on
 * is the very path they named — so the conversion changes no behaviour here, and
 * makes the rows runnable on a machine that sets `AURORA_S1DISASM_REPO` or
 * `AURORA_PEER_ROOT`.
 */
export function referencePath(name: string, ...rel: string[]): string {
  return referenceFile(name, ...rel) ?? resolve(UNRESOLVED_ROOT, name, ...rel);
}

/**
 * Stand-in root for "no sibling root could be derived at all".
 *
 * Under `/nonexistent`, which is conventionally absent and, unlike a plausible
 * relative guess, cannot resolve onto real files if a caller forgets to guard.
 */
export const UNRESOLVED_ROOT = '/nonexistent/aurora-unresolved-peer-root';

/**
 * The reason line for a skip. NAMES THE MISSING THING — the point of routing
 * these through one helper is consistency of FORM, never anonymity: a reader of
 * the run output must be able to see which file was wanted and go get it. A
 * reason that said only "a fixture is absent" would be a worse report than the
 * hand-written strings it replaced.
 */
export function unmeasurable(path: string | null, what: string): string {
  const where = path ?? '(no sibling checkout found at all — see AURORA_PEER_ROOT)';
  return `SKIPPED, NOT PASSED: cannot measure ${what} — ${where} is absent on this machine, so this row measures nothing`;
}

/** `describe`/`it` options that skip with a reason when `path` is not readable. */
export function whenPresent(path: string | null, what: string): {
  skip: boolean;
  meta: { skipReason: string };
} {
  return {
    skip: path === null || !existsSync(path),
    meta: { skipReason: unmeasurable(path, what) },
  };
}

/** The one vitest surface that carries a reason from inside a running test. */
export interface SkippableContext {
  skip(note?: string): void;
}

/**
 * Runtime skip for a test that can only learn its fixture is missing once it is
 * running. Returns true when it skipped, so the caller returns.
 *
 * THE SHAPE THIS REPLACES, and why it was not merely untidy:
 *
 *     if (!existsSync(META)) { console.warn(`skipped: …`); return; }
 *
 * `return` from a test body is a PASS. The word "skipped" in a console line is
 * seen by no reporter, no total, and no gate; the row lands in the green column
 * and stays there forever, because there is no input that can make it red.
 */
export function skipUnlessPresent(
  ctx: SkippableContext,
  path: string | null,
  what: string,
): boolean {
  if (path !== null && existsSync(path)) return false;
  ctx.skip(unmeasurable(path, what));
  return true;
}

/**
 * Announce coverage that could not even be ENUMERATED.
 *
 * `it.each(files)` over an empty array registers nothing: no failure, no skip,
 * no row. The suite total simply gets smaller, and a total that got smaller
 * looks exactly like a total that was always that size. Call this beside every
 * dynamic `it.each` whose list comes off a fixture tree.
 */
/**
 * A `describe` whose BODY must not run when the fixture is absent.
 *
 * ⚠ THE TRAP THIS EXISTS FOR. `describe(name, { skip: true }, fn)` STILL RUNS
 * `fn`. The option marks the collected tests skipped; it does not stop
 * collection from executing the callback. So a `readFileSync` in a describe body
 * throws on a machine without the tree — and a throw during collection does not
 * fail one test, it takes the WHOLE FILE and every test in it:
 *
 *     FAIL  src/core/anim/__tests__/sonic-animate.test.ts [ …test.ts ]
 *     Error: ENOENT: … '/home/volence/sonic_hacks/s1disasm/_anim/Sonic.asm'
 *
 * Three files did this (29 tests), measured 2026-08-29.
 *
 * WHEN TO USE WHICH. Where the body only reads a value or two, prefer
 * `let x!: T; beforeAll(() => { x = read(); })` — `beforeAll` does not run
 * inside a skipped describe either, and it keeps every individual row visible
 * as its own reasoned skip, which is a better report. Reach for THIS when the
 * body derives a lot from the fixture and deferring all of it would mean
 * rewriting the block: it trades the individual row names for one announced,
 * reasoned skip, which is still honest and never dies.
 */
export function describeRequiringFixture(
  name: string,
  path: string | null,
  what: string,
  fn: () => void,
): void {
  if (path !== null && existsSync(path)) {
    describe(name, fn);
    return;
  }
  describe(name, () => {
    it(
      'BLOCK NOT COLLECTED — its body reads the fixture, so it was not executed at all',
      { skip: true, meta: { skipReason: unmeasurable(path, what) } },
      () => {},
    );
  });
}

export function declareUnenumerated(count: number, path: string | null, what: string): void {
  if (count > 0) return;
  it(
    `${what} — NOTHING ENUMERATED (0 rows registered)`,
    { skip: true, meta: { skipReason: unmeasurable(path, what) } },
    () => {},
  );
}
