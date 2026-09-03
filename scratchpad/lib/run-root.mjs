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
 *          are not in that glob) — TRACKED files, `git ls-files`
 *
 * ⚠ SAY WHICH 163, because two people counted this and got 163 and 173 and
 * NEITHER WAS WRONG. 163 is what git tracks at depth 1; 173 was a filesystem
 * walk, which also sees the instruments `.gitignore` names — NINE of them at
 * that depth on the owner's machine, 172 present against 163 tracked — plus
 * subdirectories. An agent worktree is a fresh checkout and carries none of the
 * nine, so the same command answers differently there, and a count that does not
 * say which set it counted cannot be reconciled with another one. The ignored
 * nine are deliberately outside this repo's contract and are NOT part of any
 * figure below; `test/support/run-root.test.ts` enumerates from git for exactly
 * that reason, after a `readdirSync` version of it went green in a worktree and
 * red on the merged tree naming four of them.
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

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

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

/* ═══════════════════════════════════════════════════════════════════════════
 * IS THE BUNDLE I AM ABOUT TO RUN OLDER THAN THE SOURCES IT WAS BUILT FROM?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O52, 2026-09-03. Eighteen instruments carried this gate inline, and every one
 * of them wrote it as
 *
 *     const distM  = statSync(MAIN).mtimeMs;                    // question 2
 *     const newest = find `${join(ROOT, 'src')}` … stat -c %Y;  // question 1
 *     if (Number(newest) * 1000 > distM) throw 'dist/ is STALER than src/';
 *
 * — which is THE VERY CONFUSION THIS MODULE EXISTS TO END, surviving inside the
 * one expression that mixes the two. `MAIN` comes from `runTarget()`: the tree
 * the run is AGAINST. `ROOT` is the caller's own location: the tree the file
 * LIVES IN. In the main checkout those are one directory and the comparison is
 * sound. IN A LINKED WORKTREE THEY ARE TWO, and a fresh worktree's `src/`
 * mtimes are its CHECKOUT TIME — later than any build that preceded it — so the
 * gate fired unconditionally however fresh the bundle was.
 *
 * MEASURED on this machine, 2026-09-03T05:0xZ, one bundle, one instant, the two
 * trees the operand can name:
 *
 *     dist/main/index.mjs (main checkout)      mtime 1788411497
 *     newest .ts/.tsx under main/src           mtime 1788410271   ->  SILENT
 *     newest .ts/.tsx under the worktree's src mtime 1788411610   ->  FIRES
 *
 * The 113 s that flip the verdict are the `git worktree add`, not a source
 * edit. Every agent in this repo works in a worktree, so for them the gate was
 * incapable of green — a refusal that carried no information.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 *
 * BOTH HALVES NAME `run.root`. The question is about ONE tree — the built one —
 * and it is the only tree in which mtimes are commensurable, because the build
 * and the sources it consumed were written by the same machine in one order.
 * `run.here` never enters the comparison: mtimes do not compare across trees at
 * all, and using one as the source operand is how this defect happened.
 *
 * ── WHAT `borrowed` DOES AND DOES NOT DO ───────────────────────────────────
 *
 * A borrowed run measures another tree's build. The staleness question is still
 * answerable there — and is answered — but a SECOND question appears with it:
 * *are this checkout's sources in that bundle?* Announcing "cannot check" would
 * be a "couldn't check" rendered as green, which this repo does not do, so it is
 * not announced: `borrowedSourceDrift` ANSWERS it, by CONTENT (the only
 * instrument that works across trees), naming how many files under `src/`
 * differ and which. Zero differing files is a positive result — the borrowed
 * bundle's sources ARE this checkout's.
 *
 * ⚠ AND DRIFT IS A WARNING, NOT A REFUSAL — a deliberate ruling, recorded so a
 * later reader does not mistake it for an oversight. Borrowing is legitimate
 * (it is the whole reason this module exists: a linked worktree has no
 * `node_modules` and no `dist/`), and it is CONFORMANT while it announces
 * itself — "a derivation that legitimately differs and SAYS SO is conformant;
 * one that differs silently is the defect". Refusing on drift would make these
 * eighteen instruments unrunnable from any worktree whose branch touches
 * `src/`, which is most of them: it would replace a gate that could never be
 * green with a gate that could never be green, and call it a fix.
 *
 * ── WHEN IT GENUINELY CANNOT BE EVALUATED ──────────────────────────────────
 *
 * A tree with no `dist/main/index.mjs`, no `src/`, or no `.ts`/`.tsx` under it
 * (a packaged or pinned build, say) leaves the question with no answer. That is
 * `unmeasurable`, and `assertFreshBuild` REFUSES on it, loudly, naming which of
 * the three it hit. It is never folded into `fresh`: an unanswerable question
 * does not become a pass, here as everywhere else in this repo.
 */

/** Where the sources live, relative to a tree. One spelling, like the two above. */
const SOURCE_REL = 'src';

/** What the build actually compiles out of that directory. */
const SOURCE_EXT = /\.(ts|tsx)$/;

/**
 * Newest `.ts`/`.tsx` under `dir`, walked in JS.
 *
 * NOT `find … | xargs stat -c %Y`, which is what the eighteen inline copies ran
 * and which had two faults of its own beyond the tree mix: fourteen of them
 * spelled it without `-print0`/`-0`, so one source path containing a space
 * would have split into two nonexistent paths and `stat` would have printed an
 * error to stderr while the pipeline still exited 0 with a WRONG maximum; and
 * an empty result made `Number('') * 1000` = 0, which compares as "everything
 * is fresh" — an empty source tree read as a pass. Both are gone: this returns
 * `null` for "the directory is not there" and a `count` the caller checks.
 */
function newestSource(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true, recursive: true }); }
  catch { return null; }
  let ms = -Infinity, file = null, count = 0;
  for (const e of entries) {
    if (!e.isFile() || !SOURCE_EXT.test(e.name)) continue;
    const p = join(e.parentPath ?? e.path ?? dir, e.name);
    let m;
    try { m = statSync(p).mtimeMs; } catch { continue; }
    count++;
    if (m > ms) { ms = m; file = p; }
  }
  return { ms, file, count };
}

/** Every `.ts`/`.tsx` under `dir`, as tree-relative path -> sha1 of its bytes. */
function sourceHashes(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true, recursive: true }); }
  catch { return null; }
  const out = new Map();
  for (const e of entries) {
    if (!e.isFile() || !SOURCE_EXT.test(e.name)) continue;
    const p = join(e.parentPath ?? e.path ?? dir, e.name);
    try { out.set(relative(dir, p), createHash('sha1').update(readFileSync(p)).digest('hex')); }
    catch { /* raced with a write; a file we cannot read is reported as missing below */ }
  }
  return out;
}

/**
 * `{ verdict, … }` for the tree the run is against. `verdict` is one of:
 *
 *   `'fresh'`         the built bundle is newer than every source under it.
 *   `'stale'`         a source under it is newer than the bundle — every row
 *                     the caller is about to measure would be vacuous.
 *   `'unmeasurable'`  the question has no answer in this tree; `why` says which
 *                     of the three cases it is.
 */
export function buildFreshness(run) {
  const root = run.root;
  const main = distMain(root);
  const srcDir = join(root, SOURCE_REL);
  let distMs;
  try { distMs = statSync(main).mtimeMs; }
  catch (e) {
    return {
      verdict: 'unmeasurable', root, main, srcDir,
      why: `there is no readable built bundle at ${main} (${e.code ?? e.message}), so "is the `
        + 'bundle older than its sources" has no answer',
    };
  }
  const src = newestSource(srcDir);
  if (src === null) {
    return {
      verdict: 'unmeasurable', root, main, srcDir, distMs,
      why: `${srcDir} does not exist, so the sources that built ${main} are not in this tree and `
        + 'nothing in it can be compared against the bundle',
    };
  }
  if (src.count === 0) {
    return {
      verdict: 'unmeasurable', root, main, srcDir, distMs,
      why: `${srcDir} exists but holds no .ts/.tsx file, so there is no source mtime to compare `
        + '(an empty maximum used to read as "everything is fresh")',
    };
  }
  return {
    verdict: src.ms > distMs ? 'stale' : 'fresh',
    root, main, srcDir, distMs,
    newestMs: src.ms, newestFile: src.file, count: src.count,
    marginMs: distMs - src.ms,
  };
}

/**
 * DOES THE BORROWED BUILD CARRY THIS CHECKOUT'S SOURCES? By content, because
 * mtimes are meaningless across two checkouts.
 *
 * `{ comparable, differing, onlyHere, onlyRoot, total }`, or `comparable:false`
 * with a `why` when either `src/` cannot be read. Only meaningful when
 * `run.borrowed`; `assertFreshBuild` calls it only then.
 */
export function borrowedSourceDrift(run) {
  const here = sourceHashes(join(run.here, SOURCE_REL));
  const there = sourceHashes(join(run.root, SOURCE_REL));
  if (here === null || there === null) {
    return {
      comparable: false,
      why: `${here === null ? join(run.here, SOURCE_REL) : join(run.root, SOURCE_REL)} could not be `
        + 'read, so the two trees\' sources cannot be compared',
    };
  }
  const differing = [], onlyHere = [];
  for (const [rel, h] of here) {
    if (!there.has(rel)) onlyHere.push(rel);
    else if (there.get(rel) !== h) differing.push(rel);
  }
  const onlyRoot = [...there.keys()].filter((rel) => !here.has(rel));
  return { comparable: true, differing, onlyHere, onlyRoot, total: here.size, thereTotal: there.size };
}

/** The provenance line a fresh run prints — rendered from the value, never a
 *  second derivation of it, for the same reason `describeRunRoot` is. */
export function describeFreshness(f, drift = null) {
  const age = (ms) => `${(ms / 1000).toFixed(0)}s`;
  let s = `build: FRESH in ${f.root} — dist/main/index.mjs is ${age(f.marginMs)} newer than the `
    + `newest of ${f.count} .ts/.tsx under ${f.srcDir} (${f.newestFile})`;
  if (drift) {
    if (!drift.comparable) {
      s += `\n      ⚠ BORROWED, AND THE DRIFT CHECK COULD NOT RUN: ${drift.why}. This run does not `
        + 'establish that this checkout\'s sources are in that bundle.';
    } else {
      const moved = drift.differing.length + drift.onlyHere.length + drift.onlyRoot.length;
      s += moved === 0
        ? `\n      BORROWED but NOT DRIFTED: all ${drift.total} source files under src/ are `
          + 'byte-identical between this checkout and the built tree, so that bundle IS this '
          + 'checkout\'s sources.'
        : `\n      ⚠ BORROWED AND DRIFTED: ${moved} source file(s) differ between this checkout and `
          + `the built tree (${drift.differing.length} changed, ${drift.onlyHere.length} only here, `
          + `${drift.onlyRoot.length} only there) — e.g. `
          + `${[...drift.differing, ...drift.onlyHere, ...drift.onlyRoot].slice(0, 3).join(', ')}. `
          + 'THE ROWS BELOW DO NOT MEASURE THOSE EDITS. Build in-tree to measure them.';
    }
  }
  return s;
}

/**
 * REFUSE TO MEASURE A VACUOUS RUN. Throws on `stale` and on `unmeasurable`;
 * prints the verdict and, when borrowed, the drift, and returns the value.
 *
 * The call replaces the eighteen inline copies:  `assertFreshBuild(RUN);`
 */
export function assertFreshBuild(run, write = (s) => process.stderr.write(s)) {
  const f = buildFreshness(run);
  if (f.verdict === 'unmeasurable') {
    throw new Error(`BUILD FRESHNESS UNMEASURABLE — ${f.why}. A run whose bundle cannot be shown `
      + 'fresh is a run whose every row may be vacuous, so this refuses rather than proceeding. '
      + `Build the tree the run is against (VITE_AURORA_DEBUG=1 npm run build in ${f.root}), or `
      + `point ${AURORA_BUILT_TREE_ENV} at a tree that is built.`);
  }
  if (f.verdict === 'stale') {
    throw new Error(`dist/ is STALER than src/ in ${f.root} — ${f.newestFile} is `
      + `${((f.newestMs - f.distMs) / 1000).toFixed(0)}s newer than ${f.main}. Every row below `
      + `would measure code that is not in the bundle. Run VITE_AURORA_DEBUG=1 npm run build in `
      + `${f.root}.`);
  }
  write(`${describeFreshness(f, run.borrowed ? borrowedSourceDrift(run) : null)}\n`);
  return f;
}
