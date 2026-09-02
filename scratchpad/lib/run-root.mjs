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
 * THE SURFACE IS NOW CONVERTED — O72, 2026-09-02, and the count is re-derived
 * here rather than carried over, because the previous figure in this block was
 * wrong in both directions.
 *
 *     163  scratchpad/*.mjs (depth 1; scratchpad/lib and scratchpad/handover
 *          are not in that glob)
 *     122    …importing AURORA_DIR
 *     104      …and composing a build path out of it, IN CODE
 *       1        …already converted before O72 (mapviewport-baseline-harness)
 *     103        …converted by O72
 *      18      …not composing one: 14 mention neither artifact at all, and 4
 *               matched a loose `dist` grep only in prose (`distance`,
 *               `distinct`, `distM`). All 18 are question 1 and correct as they
 *               are.
 *
 * …AND ELEVEN MORE THAT NO LINE ABOVE COUNTS, because the survey's own
 * predicate could not reach them. Every one was found by rule 4 of
 * `scripts/check-peer-path-literals.mjs` AFTER the conversion, not by any
 * search — which is the finding, not a footnote: a search that returns nothing
 * and a world with nothing in it print the same output.
 *
 *      +1  scratchpad/handover/handover-band-harness.mjs — one directory below
 *          the `*.mjs` glob every count above was taken over.
 *      +7  instruments deriving the checkout from their OWN `import.meta.url`
 *          (animated-art, canvas-cdp, priority-lens, paint-through,
 *          s1-layout-anim, s1-priority-occlusion, ozone-x11-proof). That is
 *          `AURORA_DIR` hand-rolled; they never name the resolver, so a
 *          population defined as "mentions AURORA_DIR" excluded them by
 *          construction.
 *      +3  probes IMPORTING `ROOT` from `canvas-cdp-harness` (art-agent,
 *          collision-agent, collision-gesture) — the binding is not created in
 *          those files at all. Two printed a provenance line naming the wrong
 *          tree; one read `join(ROOT, 'dist', 'renderer', 'assets')` for real.
 *
 * So 114 instruments changed: 111 import this module directly (112 with
 * mapviewport, which was already here), and the 3 canvas-cdp probes take `MAIN`
 * and `RUN` re-exported from the harness they already depend on. Of the 112,
 * 110 call `runTarget`; this one and mapviewport call `resolveRunRoot` for
 * reasons each states.
 *
 * The converted ones were never WRONG from the main checkout — they ran against
 * the tree they lived in, which is the same directory there — and `ELECTRON_BIN`
 * remains the escape hatch for the binary half, now read in one place
 * (`electronBin`) instead of sixty-one.
 *
 * ⚠ WHAT KEEPS THIS FROM COMING BACK is not this paragraph. It is rule 4,
 * `checkout-as-build-tree`, in `scripts/check-peer-path-literals.mjs`, which is
 * in the `npm test` chain: a new instrument that composes `${AURORA_DIR}/dist/…`
 * fails the suite naming the line. Prose describing a completed migration is
 * exactly the artifact that goes stale silently.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { auroraBuiltTree, AURORA_BUILT_TREE_ENV } from '../../test/support/sibling-root.mjs';

/** How far up the walk climbs before giving up. */
const MAX_LEVELS = 8;

/**
 * THE TWO ARTIFACT PATHS, SPELLED ONCE.
 *
 * Every consumer below composes from these, and so does `isRunnableTree` — the
 * predicate that decides a tree is runnable and the paths a harness then spawns
 * MUST be the same two strings, or the walk can approve a tree and the spawn can
 * miss in it. They were 114 independent pairs of spellings before O72.
 */
const ELECTRON_REL = 'node_modules/.bin/electron';
const DIST_MAIN_REL = 'dist/main/index.mjs';

/**
 * A tree that can actually run the app: BOTH halves, because either alone is a
 * tree that fails halfway through a spawn with ENOENT rather than up front.
 */
export function isRunnableTree(dir) {
  return existsSync(join(dir, ELECTRON_REL))
    && existsSync(join(dir, DIST_MAIN_REL));
}

/**
 * THE OVERRIDE FOR THE BINARY HALF, and the reason it is separate from
 * `AURORA_BUILT_TREE` rather than folded into it.
 *
 * `ELECTRON_BIN` names ONE FILE, not a tree. It predates the O70 split, 61
 * instruments took it before O72 and `docs/OVERSEER.md` documents it as the
 * override an agent worktree uses, so it keeps working exactly as it did. It is
 * NOT in the resolver's `OWNED_ENV`, deliberately: `OWNED_ENV` is the set of
 * SUITE PATH variables that rule 3 of `scripts/check-peer-path-literals.mjs`
 * forbids anyone but the resolver from reading, and this names an executable on
 * this machine, not a checkout of a suite repo. Reading it HERE rather than in
 * 61 files is the point of the helper: one reader, one spelling.
 */
export const ELECTRON_BIN_ENV = 'ELECTRON_BIN';

/**
 * The electron binary to spawn, given the tree the run is against.
 *
 * ⚠ `root` IS `resolveRunRoot(...).root` AND NOT `AURORA_DIR`. That is the whole
 * of O72: 114 instruments composed this path out of the answer to "which
 * checkout am I", which is a different question and a different directory the
 * moment the caller lives in a linked worktree — a worktree has no
 * `node_modules/`, so the composed path named a file that is not there and the
 * spawn died with ENOENT after the harness had already printed a banner.
 *
 * The pre-O72 idiom fell back to `siblingPathOrUnresolved('aurora', …)` when the
 * binary was missing in-tree — "go find the aurora checkout". `resolveRunRoot`
 * supersedes that and is strictly better: it requires BOTH artifacts before it
 * calls a tree runnable, so it cannot hand back a checkout with a stale or
 * absent `dist/` and let the failure surface one step later.
 */
export function electronBin(root) {
  return process.env[ELECTRON_BIN_ENV] ?? join(root, ELECTRON_REL);
}

/** The built main bundle to hand electron, given the tree the run is against. */
export function distMain(root) {
  return join(root, DIST_MAIN_REL);
}

/**
 * EVERYTHING A HARNESS NEEDS TO RUN THE BUILT APP, from its own location.
 *
 * One call so the three answers cannot drift apart in a caller: a harness that
 * resolved the run root and then composed its electron path off `AURORA_DIR`
 * anyway is the exact defect O72 migrated away, and it is invisible from the
 * main checkout where the two directories are the same one.
 *
 * `{ root, here, borrowed, source, electron, main }`.
 */
export function runTarget(here) {
  const run = resolveRunRoot(here);
  return { ...run, electron: electronBin(run.root), main: distMain(run.root) };
}

/**
 * PRINT the announcement the contract owes, and return the value unchanged so
 * it composes: `const RUN = announceRunRoot(runTarget(HERE));`
 *
 * TO STDERR, and that is not a detail. These instruments print measurements on
 * stdout and several are read by eye or by another script; a provenance line is
 * not a measurement. It goes out on every call rather than once per process —
 * the module's own header rules out a memoised nag as the PROOF artifact, and
 * this is the caller saying which tree it chose, which is the thing the walk's
 * carve-out owes ("a derivation that legitimately differs and SAYS SO is
 * conformant; one that differs silently is the defect").
 *
 * `write` is injectable so a row can capture the line instead of the terminal.
 */
export function announceRunRoot(run, write = (s) => process.stderr.write(s)) {
  write(`${describeRunRoot(run)}\n`);
  return run;
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
