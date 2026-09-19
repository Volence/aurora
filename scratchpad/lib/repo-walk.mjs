// ═══════════════════════════════════════════════════════════════════════════
// repo-walk — a directory walk that CANNOT LEAVE THIS REPOSITORY
// ═══════════════════════════════════════════════════════════════════════════
//
// ROADMAP row 205. `check-harness-guards.mjs` walked `scratchpad/` with a
// `listFiles` that followed a symlink whenever `statSync` said the target was a
// directory. `scratchpad/fixtures/aeon-build-pin/` — untracked, gitignored,
// therefore present in the owner's checkout and in NO worktree — carries four
// such links, two pointing at `sigil` and two at `skdisasm`. So this repo's
// landing gate walked another lane's live checkout: 181 GB across 670,684
// files, measured 2026-09-19. It reached 8,184 MB under
// `--max-old-space-size=8192` and still died, so `npm test` never reached
// vitest.
//
// ⚠ THE COST IS THE WALK, NOT THE ANALYSIS, and every fix aimed at the other
// one is aimed at nothing. Following those links the `.mjs` population is
// IDENTICAL to not following them: no peer file is ever read, because the
// analysis loops filter by extension and skip `fixtures/`. The heap goes to the
// directory entries themselves.
//
// ⚠ AND THE DEFECT IS NOT THE HEAP. A ceiling, an `ELOOP` skip, a depth cap or
// a timeout all make the symptom disappear and leave the gate's COLOUR a fact
// about how much a peer lane has built — which is what it already was: the run
// that first went red had no commit on either side of it, only
// `sigil/.worktrees/emp-z80-mnemonics/target/tmp/` growing. The property this
// module restores is the one that was lost:
//
//     THE VERDICT OF A GATE IN THIS REPO IS A FACT ABOUT THIS REPOSITORY.
//
// THE RULE: the walk never leaves the root it is given. A symlink whose
// resolved target is outside that root is not descended into and not read; it
// is RETURNED to the caller in `escaped`, never dropped. Deciding what to do
// about one is policy and belongs to the caller, because "which directories
// this gate has standing over" is the caller's question; `hasStandingOver` below
// is the answer this repo's gates use and the reasoning is stated there.
//
// WHY NOT THE OTHER TWO RULES THAT WERE ON THE TABLE:
//
//   · "Follow no symlinks at all" also stops the runaway, and it is a bigger
//     claim than the defect supports: a link INSIDE this repo resolves to a
//     file this repo carries, and refusing it would shrink the gate's subject
//     to protect its walk. A fix that protects a walk by shrinking its subject
//     is the same defect pointing the other way.
//   · "Do not descend into `fixtures/`" fixes today's four links and nothing
//     else. The escape is the hazard; `fixtures/` is only where this one
//     happened to sit. A link planted anywhere else under `scratchpad/` would
//     walk straight back out.
//
// CYCLES. A link that resolves INSIDE the root is followed, so a link to an
// ancestor is a loop the containment rule cannot see. Every directory is
// entered at most once, keyed by its resolved path, and a second arrival is
// returned in `revisited`. Without this the rule above would trade an
// out-of-repo runaway for an in-repo one.
//
// UNREADABLE IS NOT EMPTY. An entry that cannot be stat'ed or resolved goes in
// `unreadable` with its errno. `scratchpad/fixtures/aeon-build-pin/aeon-current`
// is a self-referential symlink and `realpathSync` throws ELOOP on it; that is
// a fact to report, not a file to skip quietly.

import { readdirSync, lstatSync, statSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Directory prefixes, relative to the walked directory, that this repo's gates
 * have NO STANDING OVER — so an escape from one of them is reported and not
 * fatal.
 *
 * ⚠ THIS IS PRIOR ART, NOT A NEW JUDGEMENT. The shell pass of
 * `check-harness-guards.mjs` already skips `fixtures/` with the reason written
 * out beside it: those are whole checked-out copies of OTHER repos, pinned as
 * test data, and their build scripts are not this repo's launchers. A symlink
 * inside a vendored copy of another repo pointing at that repo is that same
 * fact wearing a link. The four links row 205 names all sit here.
 *
 * Everywhere else, an escape is a defect of THIS repo's own tree, and
 * `hasStandingOver` says so.
 */
export const OUT_OF_SCOPE_PREFIXES = ['fixtures/'];

/**
 * Does the calling gate have standing over this walked-directory-relative
 * path? An escape or an unreadable entry it has standing over is a defect of
 * THIS tree and must fail the run; one it does not is reported and survived.
 *
 * ⚠ STATE THE BOUND RATHER THAN IMPLY COVERAGE: this asks WHERE THE ENTRY
 * SITS, not whether git tracks it. A symlink committed under `fixtures/` would
 * be excused by this predicate. `fixtures/` is gitignored, so that path is
 * narrow, but it is open and saying so is cheaper than discovering it later.
 */
export function hasStandingOver(rel) {
  const norm = String(rel).split(sep).join('/');
  return !OUT_OF_SCOPE_PREFIXES.some((p) => norm === p.slice(0, -1) || norm.startsWith(p));
}

/** Is `p` the root itself, or under it? Both arguments must be resolved paths,
 *  or a symlinked ancestor makes this answer about spelling instead of about
 *  location. */
export function contains(root, p) {
  return p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Walk `dir`, collecting files whose name ends with one of `exts`, and never
 * leave `root`.
 *
 * Returns `{ files, escaped, revisited, unreadable, root }`:
 *
 *   files      absolute paths, in `readdir` sort order, depth first
 *   escaped    `{ link, target }` for each symlink resolving outside `root`
 *   revisited  `{ link, target }` for each directory reached a second time
 *   unreadable `{ path, code }` for each entry that could not be resolved
 *
 * THE LAST THREE ARE THE POINT OF THE RETURN SHAPE. A walker that answered with
 * `files` alone would let a caller render "291 clean" over a tree it had
 * declined to look at, which is the one thing this repo's gates may not do.
 *
 * `node_modules` is not descended into, exactly as before this module existed.
 */
export function walkContained(dir, exts, { root } = {}) {
  if (!root) throw new Error('walkContained needs an explicit root: a containment rule with a guessed boundary is not a containment rule');
  const files = [];
  const escaped = [];
  const revisited = [];
  const unreadable = [];
  const seen = new Set();

  let rootReal;
  let startReal;
  try { rootReal = realpathSync(root); } catch (e) { unreadable.push({ path: root, code: e.code ?? e.message }); return { files, escaped, revisited, unreadable, root }; }
  try { startReal = realpathSync(dir); } catch (e) { unreadable.push({ path: dir, code: e.code ?? e.message }); return { files, escaped, revisited, unreadable, root: rootReal }; }

  const walk = (here, hereReal) => {
    let names;
    try { names = readdirSync(here).sort(); }
    catch (e) { unreadable.push({ path: here, code: e.code ?? e.message }); return; }
    for (const name of names) {
      const p = join(here, name);
      let st;
      // lstat, not stat: a symlink is classified by the LINK, so a loop or a
      // dangling target is a fact about this entry rather than an exception.
      try { st = lstatSync(p); } catch (e) { unreadable.push({ path: p, code: e.code ?? e.message }); continue; }

      if (st.isSymbolicLink()) {
        let target;
        try { target = realpathSync(p); } catch (e) { unreadable.push({ path: p, code: e.code ?? e.message }); continue; }
        // ⚠ THE CONTAINMENT TEST COMES BEFORE THE DIRECTORY TEST. A link to a
        // FILE outside this repo is the same escape as a link to a directory:
        // it would be read, and its contents would decide a verdict that is
        // supposed to be about this tree.
        if (!contains(rootReal, target)) { escaped.push({ link: p, target }); continue; }
        let resolved;
        try { resolved = statSync(p); } catch (e) { unreadable.push({ path: p, code: e.code ?? e.message }); continue; }
        if (resolved.isDirectory()) {
          if (name === 'node_modules') continue;
          if (seen.has(target)) { revisited.push({ link: p, target }); continue; }
          seen.add(target);
          walk(p, target);
          continue;
        }
      } else if (st.isDirectory()) {
        if (name === 'node_modules') continue;
        const real = join(hereReal, name);
        if (seen.has(real)) { revisited.push({ link: p, target: real }); continue; }
        seen.add(real);
        walk(p, real);
        continue;
      }

      if (exts.some((e) => name.endsWith(e))) files.push(p);
    }
  };

  seen.add(startReal);
  walk(dir, startReal);
  return { files, escaped, revisited, unreadable, root: rootReal };
}
