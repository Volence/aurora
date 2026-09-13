# RIG-WRITES-LIVE-AEON: the chunk-links rig refuses a live aeon tree, and its row 9 was not writing

2026-09-13. Branch `parcel/rig-writes-live-aeon` off master `2414288d`. Commits `1d415cac` (the
two refusals), `2f945d23` (the correction below), and this packet's commit. Booked by
`docs/reviews/2026-09-12-chunklinks-row9-determination.md`, "The aeon observation, SETTLED",
limit 3. Governing ruling: hub d-28 option 2, copy only where a harness can WRITE.

## The defect as booked

Master's `scratchpad/chunk-links-harness.mjs:83`:

```js
const AEON_DIR = siblingPathOrUnresolved('aeon');   // OPEN ONLY — never written; O66: a copy may be named
```

With nothing set, that expression answers with the live tree. Evaluated through the resolver
from this worktree without launching anything:

```
master:83 expression siblingPathOrUnresolved("aeon") = /home/volence/sonic_hacks/aeon
answered by: step 3: git rev-parse --git-common-dir from /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a41bd85f09732be69 → /home/volence/sonic_hacks/aurora/.git
```

Master then opens it at `:226` (`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`), reaches
`runPropagationRows` at `:643` and clicks `Save changes back to this chunk` at `:810`. Nothing
between `:83` and `:226` refuses anything. Master's rig was not run unset: the argument that it
does not refuse comes from that source and from the resolver output above.

## What measuring it found: row 9's Save does not write the disk

The booking says the rig's row 9 "clicks Save, which writes". Measured on this tree, it does not.

- **Source.** The button (`src/renderer/workspace/facets/art-facet.tsx:196-198`) calls
  `saveComposerDocument` (`src/renderer/state/art-composer-save.ts:133`), which runs
  `set-tileset-tiles`, `set-chunk` and the propagation batch through `executeCommand` against the
  in-memory project store. The "chunk-library write" in that file's header is the in-memory
  library.
- **Disk.** Three fresh `git archive` copies of aeon `c28a4173`, each driven through a whole run
  (master's rig once, this branch's twice), had **no file newer than the run's start**
  (`find <copy> -type f -newermt @<start epoch>`, empty every time). The same predicate found a
  control file touched after each floor (`POSITIVE-CONTROL-HIT 06:22:57 newer-probe.txt`,
  `06:26:52 newer-probe-2.txt`), so the empty answers are measurements, not a blind predicate.
  Row 9 passed in all three runs with `save=clicked` and the in-memory section word going
  `before=0 after=16385 (tileIndex 1)`: the edit landed in the document and never reached disk.
- **Why nothing writes.** The rig presses `k`, `t` and `b` (`:300`, `:578`, `:593`, `:626`, `:652`
  in the fixed file), never with a modifier. The project save is Ctrl+S
  (`src/renderer/shell/commands.ts:53`). `src/` has no autosave, and `close-guard.ts:20` records
  that there never was one. The app is torn down by SIGTERM, which runs no save.

So the old header comment, "OPEN ONLY — never written", **was true on disk**, and the booking's
"that comment is false" does not survive measurement. The two parts of the booking that do hold:
the default resolved to the aeon lane's live working copy, and the rig edits the project open on
that tree (stamps in rows 3, 5 and 8, paints in rows 6 and 7, the chunk Save in row 9). Only two
omissions keep those edits off disk: no row sends Ctrl+S, and the app has no autosave. Nothing in
the rig checks either one.

## The fix

The two refusals `scratchpad/guard-surface-harness.mjs` carries, copied rather than invented,
at import and before `main()` can build, spawn or open anything:

```js
const aeonOverride = checkoutOverride('aeon');
if (aeonOverride === null) {
  throw new Error('AEON_DIR is unset, and this harness has no honest default: ...');
}
const AEON_DIR = aeonOverride.value;
if (AEON_DIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error(`refusing to run against the real aeon tree (${aeonOverride.name}=${AEON_DIR}): ...`);
}
```

`checkoutOverride` brings the aliases, the disagreement refusal and the set-but-absent error.
The live-tree comparison is against the resolved default location, never a literal. The header
now says what the rig does: it edits the open project, it is one keystroke from a write, and it
needs a fresh copy per run. The rig prints its tree on an `aeon:` line beside `root:`/`pinned:`.
No resolver change, no `src/` change.

**Commit `1d415cac` repeated the booking's premise** in its comment, error text and commit body
("its row 9 SAVES a chunk edit ..., which WRITES project files"). `2f945d23` corrects all three
and says so in its body. The first commit's message is left as history, not amended.

## Why the refusals stay, and the call that belongs to the controller

Read by its letter, d-28 option 2 ("copy only where a harness can WRITE") could put this rig in
the read-only class, which is out of scope. The refusals are kept for three reasons:

1. The rig is **one keystroke from a write**: a row that sends Ctrl+S, or an autosave landing in
   the app, turns the rig as it stands into a writer of the aeon lane's working copy. Nothing
   would change in the rig and nothing would announce it.
2. **It has already been copied once with the live default kept**: `scratchpad/chunk-row9-probe.mjs`,
   below. The next copy could add the save.
3. The cost is one `git archive` per run. The bill is the one the booking described.

**For ratification:** whether "can WRITE" covers a rig kept safe by omission. If it does not,
reverting this parcel takes two commits (`2f945d23`, `1d415cac`). This packet and its ROADMAP
row would then need re-reading, not deleting, because the measurement stands either way.

## Proof A: the two refusals, and master's contrast

Every refusal run pointed `ELECTRON_BIN=/bin/true`, so even a broken guard could not have
opened a tree. None reached a spawn: each throws at import. The `root:` line prints first
because `announceRunRoot` runs at module top; it prints and spawns nothing.

**Unset** (`env -u AEON_DIR ELECTRON_BIN=/bin/true PORT=9471 timeout 60 node scratchpad/chunk-links-harness.mjs`), at `2f945d23`:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a41bd85f09732be69
Error: AEON_DIR is unset, and this harness has no honest default: rows 3 to 9 edit the project in the tree it opens (stamps, paints, a chunk Save), one Ctrl+S from writing it, so it must be pointed at a throwaway copy of aeon. Make one from the committed tip, e.g. `D=$(mktemp -d) && git -C /home/volence/sonic_hacks/aeon archive origin/master | tar -x -C "$D"`, and set AEON_DIR="$D", a fresh copy per run. (empyrean contract/SUITE_PATHS.md, precedence step 4)
UNSET EXIT=1
```

**The live tree** (`AEON_DIR=/home/volence/sonic_hacks/aeon ELECTRON_BIN=/bin/true PORT=9472 ...`):

```
Error: refusing to run against the real aeon tree (AEON_DIR=/home/volence/sonic_hacks/aeon): rows 3 to 9 edit the project open on it. Use a throwaway copy.
LIVE EXIT=1
```

**Through an alias** (`env -u AEON_DIR LIVE_AEON=/home/volence/sonic_hacks/aeon ...`), not asked
for but cheap:

```
suite-paths: LIVE_AEON is a transitional alias; set AEON_DIR instead (empyrean contract/SUITE_PATHS.md)
Error: refusing to run against the real aeon tree (LIVE_AEON=/home/volence/sonic_hacks/aeon): rows 3 to 9 edit the project open on it. Use a throwaway copy.
ALIAS EXIT=1
```

The same two refusals at `1d415cac`, with the older wording, also exited 1 at import (`:119`
unset, `:131` live).

**Master does not refuse unset:** the resolver output and the `:83` → `:226` → `:643` → `:810`
path above. Master's rig ran only against a copy.

## Proof B: behaviour unchanged against a copy

aeon archived at `git -C /home/volence/sonic_hacks/aeon rev-parse origin/master` =
`c28a41730f780919e57d7cc1c9976da4bf2e1eb6`. Each run used its own fresh `mktemp -d` copy made
by `git archive origin/master | tar -x`. Worktree debug build (`VITE_AURORA_DEBUG=1 npx
electron-vite build`), `ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=` this worktree. Master's rig was `git show master:scratchpad/chunk-links-harness.mjs`,
blob `04e5a981`, placed beside the fixed one and deleted afterwards.

| | master rig, `c28a4173` copy 1 | fixed rig `1d415cac`, copy 2 | fixed rig `2f945d23`, copy 3 |
|---|---|---|---|
| port | 9471 | 9473 | 9474 |
| `root:` | the worktree | the worktree | the worktree |
| `pinned:` | `AURORA_BUILT_TREE=<the worktree>` | same | same |
| `aeon:` | (master prints none) | copy 2 | copy 3 |
| dpr | 1 | 1 | 1 |
| started (local) | 06:19:49 | 06:20:11 | 06:26:18 |
| 1, 2, 2b, 3, 4 | PASS | PASS | PASS |
| **4b** | **FAIL** | **FAIL** | **FAIL** |
| 5, 6, 7, 8, 9, 10 | PASS | PASS | PASS |
| summary | `11/12 rows passed — FAILED: 4b` | same | same |
| files written in the copy | 0 | 0 | 0 |

`diff` of the verdict lines, master against `1d415cac`, is empty. `4b` is red on purpose
(CHIP-FONT-13PX, the owner's call): `declared --text-xs-size="11px" computed="13px"` in every
run. The three runs ran one after another, not overlapped, at loads between 0.9 and 2.6. The live
aeon tree had no file modified (`.git` excluded) from 06:19:40 to 06:26:50, which covers all
three runs. The same `find`, pointed at `games/`, finds files, so that tree is visible to it.
**No difference between master and the fix.**

## Proof C: suite and gates

`VITEST_MAX_WORKERS=4 npm test` at `1d415cac`: **Test Files 618 passed | 3 skipped (621); Tests
9603 passed | 9 skipped (9612); 0 failed**, exit 0. Identical over `2f945d23` plus this packet
and row 173 (exit 0, load 8.41). `check-cited-paths` and `check-doc-citations` both end `OK`.

```
check-peer-path-literals: OK: no executable line names a sibling checkout by absolute path, names a session scratchpad, reads a suite path variable outside the resolver, composes a build path out of AURORA_DIR, or writes to a peer path the resolver defaulted.
════ 282 clean / 283 classified (272 .mjs + 11 .sh) · 0 failure(s) · 1 unguarded-untracked · 0 unmeasurable ════
```

Both gates were **also green on master's rig**. Rule 5 (`peer-tree-write`) cannot see this
class: any write would be the app's, reached over CDP, not an fs call in the rig. No static gate
covers it, and none is added here. The refusal is the guard.

## `scratchpad/chunk-row9-probe.mjs`: it reaches the same Save against the live default. Not fixed.

- Lines 1 to 700 are **byte-identical** to master's `chunk-links-harness.mjs` (`diff` of the two
  prefixes is empty). That includes `:58`, which imports `siblingPathOrUnresolved`, and `:83`,
  `const AEON_DIR = siblingPathOrUnresolved('aeon');   // OPEN ONLY — never written`.
- `:226` opens that path; `:643` calls `runPropagationRows`; `:886-890` clicks
  `button[title^="Save changes back to this chunk"]`. It is registered as `npm run
  harness:chunk-row9` (`package.json:106`).
- With nothing set, it opens `/home/volence/sonic_hacks/aeon` and reaches the Save there. Under
  the measurement above, that Save is in-memory. The probe presses the same keys (`:247`, `:525`,
  `:540`, `:573`, `:599`) with no modifier, and its only file write is screenshots (`:151`). So it
  sits exactly where master's rig sat: it opens and edits the live tree's project, one keystroke
  from a write.
- **Not run and not changed**: the controller decides scope.

## Also seen, not this parcel

- `check-harness-guards` lists `scratchpad/preset-schema-key-probe.mjs` under "UNGUARDED BUT
  UNTRACKED" (G9, never prints PASS). In this worktree, `git ls-files --error-unmatch` names it
  as tracked. Not investigated.
- The determination packet's sentence "its row 9 clicks Save, which writes" stands as that
  night's record. This packet is the correction, and the determination packet is not edited.

## Left open

- **The d-28 reading above**, for the controller.
- **`chunk-row9-probe.mjs`**, same exposure, unfixed.
- **The rig never reads `dirty` after row 1.** "Rows 3 to 9 leave the project dirty" rests on
  source: `executeCommand` calls `markDirty({ undoable: true })`
  (`src/renderer/state/editorStore.ts:1102`), and row 9 reads its after-word from the in-memory
  document. No run read the flag off `window.__dbg.aeon.state()`.
- **`4b`**, the owner's CHIP-FONT-13PX call, untouched.
