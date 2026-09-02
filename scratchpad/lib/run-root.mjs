/**
 * WHICH BUILT TREE A HARNESS RUNS AGAINST — question 2, and only question 2.
 *
 * "Where do I live" and "which built tree do I RUN AGAINST" are two questions.
 * The first is `AURORA_DIR` from `test/support/sibling-root.mjs`: OBSERVED from
 * that module's own file location, never overridable (empyrean
 * `contract/SUITE_PATHS.md` @ fba68d5, "A resolver's OWN checkout is observed,
 * not resolved"). The second is this module, and it is legitimately overridable,
 * because a linked git worktree shares no `node_modules` and no `dist/` with the
 * checkout it was cut from: `<worktree>/node_modules/.bin/electron` does not
 * exist there. A harness that runs the app has to be able to borrow a built tree
 * and to be POINTED at one.
 *
 * ⚠ WHY THIS IS A SPLIT AND NOT A RULE. It would be wrong to read this as
 * "split every `<TOOL>_DIR`". The contract states the condition (@ 8be3a16,
 * sigil checking the same fold against its own `AEON_DIR` and reporting what is
 * true rather than a match):
 *
 *     "the fold is safe precisely while the build is in-tree and the artifacts
 *      are revision-stamped; it becomes unsafe the moment either stops holding,
 *      and splitting before then adds a variable whose two halves are provably
 *      identical, a maintenance defect of its own."
 *
 * Sigil is NOT splitting, correctly: aeon's `build.sh` writes its ROMs into the
 * checkout root, so the two questions have one answer by construction, and its
 * goldens are revision-specific, so a stale artifact under a correct HEAD goes
 * red rather than green. AURORA FAILS THE FIRST CONDITION — the build is in-tree
 * but a linked worktree has no `dist/` of its own, which is exactly the case
 * where "the tree I live in" and "the tree with a build in it" are different
 * directories — so aurora splits and sigil does not. The trigger for the next
 * lane is an event, not a date: the day its build output can leave its checkout.
 *
 * ⚠ AND THE HAZARD IN THE SPLIT ITSELF, which is about the LANDING and not the
 * design (sigil's caution, same section): a split turns one variable into two
 * and every existing caller now names one of them, and a caller assigned to the
 * WRONG half is invisible while both variables point at the same directory —
 * which they do for everyone until someone sets the override for the first time.
 * That is why the walk lives HERE, in a module a test can execute, instead of
 * privately inside a harness that needs a built app to run: `test/support/
 * run-root.test.ts` points the two variables APART and asserts this resolver
 * follows the run-target while `AURORA_DIR` stays put. A gate asserting the two
 * AGREE was considered and declined — it fires on the one person doing the
 * legitimate thing, and it can only ever test the configuration in which the
 * misassignment is invisible.
 *
 * WHAT IS NOT YET CONVERTED, counted rather than estimated (2026-09-02):
 * 105 of the 123 `scratchpad/*.mjs` instruments that import `AURORA_DIR` use it
 * to reach `node_modules/` or `dist/` — question 2 wearing question 1's answer.
 * They are not wrong today: they run against the tree they live in, which is
 * what they want from the main checkout, and `ELECTRON_BIN` is their existing
 * escape hatch for the binary half. They are the migration surface, and they are
 * the reason the refusal in `sibling-root.mjs` names `AURORA_BUILT_TREE` as the
 * variable for "run against the tree over there" rather than promising that
 * every instrument already reads it.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { auroraBuiltTree, AURORA_BUILT_TREE_ENV } from '../../test/support/sibling-root.mjs';

/** How far up the walk climbs before giving up. */
const MAX_LEVELS = 8;

/**
 * A tree that can actually run the app: BOTH halves, because either alone is a
 * tree that fails halfway through a spawn with ENOENT rather than up front.
 */
export function isRunnableTree(dir) {
  return existsSync(join(dir, 'node_modules/.bin/electron'))
    && existsSync(join(dir, 'dist/main/index.mjs'));
}

/**
 * WHICH OF THE THREE SHAPES THIS SPLIT'S UNSET CASE TAKES — the contract makes
 * the split declare it (@ c9bc05f), so it is declared here rather than inferred.
 *
 * `AURORA_BUILT_TREE` is **no default**: unset, `auroraBuiltTree()` reports none.
 * The consumer of that none is not a fallback to the old name, though — it is
 * **an independent second derivation**, the walk below, and it is the sub-case
 * that is MEANT to differ: it searches for a BUILD (both artifacts present)
 * rather than for a checkout, and those legitimately come apart, because a
 * linked worktree is a real checkout and an unrunnable one. That is the
 * artifacts carve-out, and what it owes is not equality but an ANNOUNCEMENT:
 *
 *     "the row asserts what 'say which step answered' already requires of every
 *      resolver: that the run ANNOUNCES the tree it chose, by name, and marks it
 *      when that tree is not the one the script lives in. A derivation that
 *      legitimately differs and says so is conformant; one that differs silently
 *      is the defect the precedence rules exist to prevent."
 *
 * So `source` is returned from every branch (a value, recomputed per call — not
 * a memoised stderr nag, which the contract forbids as the proof artifact), and
 * `describeRunRoot` renders the line a person reads FROM that value. The walk
 * predates the O70 split and was keyed off the CHECKOUT name, which is the
 * misassignment the split exists to end; O70 rekeyed it, and this is where it
 * says so.
 */

/**
 * The line a harness PRINTS before doing work — rendered from the returned
 * value, never a second derivation of it.
 *
 * It lives here, and not inline in the harness that prints it, for one reason:
 * the harness spawns Electron against a built `dist/` on import, so an
 * announcement composed inside it can never be executed by a test, and an
 * announcement nothing checks is how "differs silently" arrives. Here, a row
 * drives it against a `mkdtemp` tree layout.
 */
export function describeRunRoot({ root, here, borrowed, source }) {
  return `root: ${root}`
    + (borrowed
      ? `  BORROWED — this script lives in ${here}, which has no built app, so the app under `
        + `test is ${root}'s build`
      : '')
    + `\n      ${source}`;
}

/**
 * `{ root, here, borrowed, source }` for a harness that runs the built app.
 *
 * `here` is the caller's OWN location and is passed IN, not derived here: it is
 * the other operand of the comparison this function exists to make — "the tree
 * this script lives in" against "the tree the run is against" — and it belongs
 * to the caller's file, not to this one. It is also what makes the resolver
 * testable: a bed can stand it anywhere.
 *
 * `borrowed` is true when the run is against a tree the caller does not live in.
 * The caller must say so in its output; a number measured against somebody
 * else's build and reported as this tree's is the failure this reports around.
 */
export function resolveRunRoot(here) {
  const pin = auroraBuiltTree();
  if (pin !== null) {
    return {
      root: pin.value,
      here,
      borrowed: pin.value !== here,
      source: `pinned: ${pin.name}=${pin.value}`,
    };
  }
  let dir = here;
  for (let i = 0; i < MAX_LEVELS; i++) {
    if (isRunnableTree(dir)) {
      return {
        root: dir,
        here,
        borrowed: dir !== here,
        source: dir === here
          ? `in-tree: ${dir} has node_modules/.bin/electron and dist/main/index.mjs`
          : `walked up ${i} level(s) from ${here} to the nearest built tree ${dir}`,
      };
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return {
    root: here,
    here,
    borrowed: false,
    source: `NO BUILT TREE FOUND within ${MAX_LEVELS} level(s) above ${here} — falling back to `
      + `the tree this script lives in, which has no dist/main/index.mjs, so the spawn below is `
      + `about to fail. Build it (\`npm run build\`) or set ${AURORA_BUILT_TREE_ENV} to a tree `
      + 'that is already built.',
  };
}
