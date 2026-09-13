# CHUNK-ROW9-PROBE-LIVE-DEFAULT: the chunk row-9 probe refuses a live aeon tree

2026-09-13. Branch `fix/chunk-row9-probe-refusals` off `origin/master` `ebf9f464` (the brief said
`ebf9f464`; `git rev-parse HEAD origin/master` both answered
`ebf9f4641092cb109729847bce424f754c38e5e9`). Commits: `3b8f34a0` (the two refusals), this packet's
commit, and the commit that adds the node-suite totals below. Precedent:
`docs/reviews/2026-09-13-rig-writes-live-aeon.md` (merge `2cecfb63`, fix commits `1d415cac` and
`2f945d23`), section "`scratchpad/chunk-row9-probe.mjs`: it reaches the same Save against the live
default. Not fixed."

In the quoted output below, `<worktree>` stands for this parcel's linked worktree and `<copy 1>` and
`<copy 2>` for the two `git archive` copies of aeon, each made by `mktemp -d` under the session
scratchpad. They are placeholders because those paths are scratch ids and are deleted after landing.

## The defect

Master's `scratchpad/chunk-row9-probe.mjs:83`:

```js
const AEON_DIR = siblingPathOrUnresolved('aeon');   // OPEN ONLY — never written; O66: a copy may be named
```

With nothing set, that expression answers with the aeon lane's live checkout. Evaluated through the
resolver from this worktree, with no aeon variable in the environment (`env` has none):

```
master probe :83 expression siblingPathOrUnresolved("aeon") = /home/volence/sonic_hacks/aeon
answered by: step 3: git rev-parse --git-common-dir from <worktree> → /home/volence/sonic_hacks/aurora/.git
siblingDefaultPathOrUnresolved("aeon") = /home/volence/sonic_hacks/aeon
```

Master's probe is master's `chunk-links-harness.mjs` (blob `04e5a981`) plus the row-9 PROBE lines:
the first 700 lines of each are byte-identical (`cmp` exit 0). It opens `AEON_DIR` at `:226`, runs
the rows 3 to 8 stamps and paints, reaches `runPropagationRows` at `:643` and clicks
`button[title^="Save changes back to this chunk"]` at `:886-890` (master's line numbers). Nothing
between `:83` and `:226` refused anything.

### Red first: master's probe does not refuse unset

`ELECTRON_BIN=/bin/true`, so nothing real could launch. At `ebf9f464`, the file on disk hashed to
master's blob (`git hash-object` = `git show HEAD:…| git hash-object --stdin` = `69535bd4`):

```
$ env -u AEON_DIR -u LIVE_AEON -u AEON_ROOT -u AURORA_AEON_REPO ELECTRON_BIN=/bin/true PORT=9481 timeout 120 node scratchpad/chunk-row9-probe.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED — this script lives in <worktree>, which has no built app, so the app under test is /home/volence/sonic_hacks/aurora's build
build: FRESH in /home/volence/sonic_hacks/aurora — …
guard: discovery snapshot taken before launch:
…
cleanup: ORDERED — app 0 pid(s) SIGTERMed first, gone in 0 ms; …
HARNESS ERROR: CDP target never appeared
MASTER-UNSET EXIT=2
```

It got past import, passed `assertFreshBuild`, spawned `xvfb-run … /bin/true` and waited 45 s for
a CDP target (11:47:17 to 11:48:02). `HARNESS ERROR:` is printed only by `main().catch`, which runs
after every module-top statement. Nothing refused. Master prints no `aeon:` line, so the tree it
would have opened comes from the resolver output above.

## The fix (`3b8f34a0`)

The refusal block from `chunk-links-harness.mjs` at `2f945d23` (which copied
`guard-surface-harness.mjs`), at module top, before `main()` can build, spawn or open:

```js
const aeonOverride = checkoutOverride('aeon');
if (aeonOverride === null) {
  throw new Error('AEON_DIR is unset, and this probe has no honest default: ...');
}
const AEON_DIR = aeonOverride.value;
if (AEON_DIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error(`refusing to run against the real aeon tree (${aeonOverride.name}=${AEON_DIR}): ...`);
}
console.log(`aeon: ${AEON_DIR}  (${aeonOverride.name}; a copy, refused if it is the live tree)`);
```

The block, from `const aeonOverride` to the `aeon:` line, is 20 lines in both files, and `diff`
finds one difference: "this harness" became "this probe" in the first message. The import now
takes `checkoutOverride` and `siblingDefaultPathOrUnresolved` instead of `siblingPathOrUnresolved`
(`:75`). The refusals throw at `:135` and `:147`.

The stale comment is replaced. The block above the refusals (`:100-132`) and the row-9 note in the
header (`:48-57`) now say what the probe does: it opens the tree, stamps and paints into its
project (rows 3 to 8) and clicks the chunk Save (row 9). All of that is in memory, and it is one
Ctrl+S from a write. A new header section, "THE aeon TREE: A COPY, NEVER THE LIVE ONE", asks for a
fresh copy per run. The Usage line gives the `git archive` recipe, and it now names this file: on
master it read `node scratchpad/chunk-links-harness.mjs`, the file the probe was copied from. There
is no resolver change, no `src/` change and no change to the probe's rows.

## Proof A: the refusals, at the committed fix

Each command ran at `3b8f34a0` with `ELECTRON_BIN=/bin/true`. None reached a spawn: none printed a
`guard:` or `cleanup:` line. The `root:` line prints first because `announceRunRoot` runs at
module top; it prints and spawns nothing.

**(a) Unset:**

```
$ ELECTRON_BIN=/bin/true PORT=9591 timeout 120 node scratchpad/chunk-row9-probe.mjs
root: /home/volence/sonic_hacks/aurora  BORROWED — …
<worktree>/scratchpad/chunk-row9-probe.mjs:135
Error: AEON_DIR is unset, and this probe has no honest default: rows 3 to 9 edit the project in the tree it opens (stamps, paints, a chunk Save), one Ctrl+S from writing it, so it must be pointed at a throwaway copy of aeon. Make one from the committed tip, e.g. `D=$(mktemp -d) && git -C /home/volence/sonic_hacks/aeon archive origin/master | tar -x -C "$D"`, and set AEON_DIR="$D", a fresh copy per run. (empyrean contract/SUITE_PATHS.md, precedence step 4)
(a) UNSET EXIT=1
```

**(b) The live tree:**

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon ELECTRON_BIN=/bin/true PORT=9592 timeout 120 node scratchpad/chunk-row9-probe.mjs
<worktree>/scratchpad/chunk-row9-probe.mjs:147
Error: refusing to run against the real aeon tree (AEON_DIR=/home/volence/sonic_hacks/aeon): rows 3 to 9 edit the project open on it. Use a throwaway copy.
(b) LIVE EXIT=1
```

**(c) Through the transitional alias:**

```
$ LIVE_AEON=/home/volence/sonic_hacks/aeon ELECTRON_BIN=/bin/true PORT=9593 timeout 120 node scratchpad/chunk-row9-probe.mjs
suite-paths: LIVE_AEON is a transitional alias; set AEON_DIR instead (empyrean contract/SUITE_PATHS.md)
<worktree>/scratchpad/chunk-row9-probe.mjs:147
Error: refusing to run against the real aeon tree (LIVE_AEON=/home/volence/sonic_hacks/aeon): rows 3 to 9 edit the project open on it. Use a throwaway copy.
(c) ALIAS EXIT=1
```

## Proof B: the mutation on disk, and its red

Refusal 2 deleted from the committed file:

```
$ git diff --stat
 scratchpad/chunk-row9-probe.mjs | 6 ------
 1 file changed, 6 deletions(-)
$ git diff
@@ -143,12 +143,6 @@ if (aeonOverride === null) {
   );
 }
 const AEON_DIR = aeonOverride.value;
-if (AEON_DIR === siblingDefaultPathOrUnresolved('aeon')) {
-  throw new Error(
-    `refusing to run against the real aeon tree (${aeonOverride.name}=${AEON_DIR}): `
-    + 'rows 3 to 9 edit the project open on it. Use a throwaway copy.',
-  );
-}
 console.log(`aeon: ${AEON_DIR}  (${aeonOverride.name}; a copy, refused if it is the live tree)`);
$ grep -c "refusing to run against the real aeon tree" scratchpad/chunk-row9-probe.mjs
0
```

With the mutation applied, (b) and (c) **stopped refusing**. The port was checked free with `ss`
before each run, so no foreign CDP target could have answered, and `/bin/true` launched nothing:

```
$ AEON_DIR=/home/volence/sonic_hacks/aeon ELECTRON_BIN=/bin/true PORT=9594 timeout 120 node scratchpad/chunk-row9-probe.mjs
aeon: /home/volence/sonic_hacks/aeon  (AEON_DIR; a copy, refused if it is the live tree)
build: FRESH in /home/volence/sonic_hacks/aurora — …
guard: discovery snapshot taken before launch:
cleanup: ORDERED — …
HARNESS ERROR: CDP target never appeared
(b) MUTATED EXIT=2

$ LIVE_AEON=/home/volence/sonic_hacks/aeon ELECTRON_BIN=/bin/true PORT=9595 timeout 120 node scratchpad/chunk-row9-probe.mjs
suite-paths: LIVE_AEON is a transitional alias; set AEON_DIR instead (empyrean contract/SUITE_PATHS.md)
aeon: /home/volence/sonic_hacks/aeon  (LIVE_AEON; a copy, refused if it is the live tree)
…
HARNESS ERROR: CDP target never appeared
(c) MUTATED EXIT=2
```

Both runs got past import, printed the live tree on their `aeon:` line and spawned. The file was
then restored from the committed baseline: `git checkout -- scratchpad/chunk-row9-probe.mjs`, with
the mutation as the only uncommitted change. After it, `git status --short` was empty,
`git hash-object` equalled `git rev-parse HEAD:scratchpad/chunk-row9-probe.mjs` (`5f1ba4a8`), and
the refusal text count was 1.

Refusal 1 has no deletion mutation. With its `if` removed, `aeonOverride.value` on a null still
throws a `TypeError` at import, so the red would come from an accident and would test nothing.
Refusal 1's red is master's own probe, above: unset, it did not refuse.

## Proof C: the probe still runs when pointed at a copy

aeon archived at `git -C /home/volence/sonic_hacks/aeon rev-parse origin/master` =
`96a98abd0a6c34200141b6648ab6c75b2f2c62f5`, written with `git archive -o <tar> 96a98abd…`, then
`tar -x` into `mktemp -d` directories (1694 files each). The brief's one-line
`git archive | tar -x -C "$D"` was split into those two steps because this agent's worktree
isolation refused a git pipeline aimed at another repository. The bytes are the same.

**Past import, `/bin/true`, `<copy 1>`:**

```
$ AEON_DIR=<copy 1> ELECTRON_BIN=/bin/true PORT=9597 timeout 120 node scratchpad/chunk-row9-probe.mjs
root: <worktree>
aeon: <copy 1>  (AEON_DIR; a copy, refused if it is the live tree)
build: FRESH in <worktree> — dist/main/index.mjs is 377s newer than the newest of 977 .ts/.tsx under <worktree>/src (…)
build flavour: DEBUG (VITE_AURORA_DEBUG=1 at 2026-09-13T15:52:35.531Z), so window.__dbg is in this bundle
cleanup: ORDERED — …
HARNESS ERROR: CDP target never appeared
CONTROL (copy, /bin/true) NODE EXIT=2
```

**A whole live run, `<copy 2>`** (optional in the brief, done). The worktree was built first with
`VITE_AURORA_DEBUG=1 npx electron-vite build`, exit 0. Then:

```
$ AEON_DIR=<copy 2> ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron AURORA_BUILT_TREE=<worktree> PORT=9598 timeout 400 node scratchpad/chunk-row9-probe.mjs
root: <worktree>
      pinned: AURORA_BUILT_TREE=<worktree>
aeon: <copy 2>  (AEON_DIR; a copy, refused if it is the live tree)
build flavour: DEBUG (VITE_AURORA_DEBUG=1 at 2026-09-13T15:52:35.531Z), so window.__dbg is in this bundle
guard: private profile for this RUN: /tmp/aurora-harness-profiles/chunk-row9-probe-1437065-ae916c27 — see HAZARD 6
        [open] resolved:true after 0.5s
PASS  [1] … PASS  [2] … PASS  [2b] …
        [env] dpr=1 mapRect={…"left":284} integerOrigin=(284,74)
PASS  [3] … PASS  [4] …
FAIL  [4b] the panel's Detach button is painted at the size its own style declares (--text-xs-size), not at whatever it inherits
PASS  [5] … PASS  [6] … PASS  [7] … PASS  [8] …
  PROBE after save: open={"chunkId":"OJZ_00",…,"dirty":false,"tool":"tile-stamp","brushTile":1,…}
  PROBE toasts: [{"message":"Saved chunk \"OJZ $00\"","type":"success"}]
PASS  [9] a chunk edited and SAVED in the real Art facet rewrites the section tiles that still remember it
        save=clicked composerCell=(3,0) armedTile=1 previousTile=0
        section word before=0 after=16385 (tileIndex 1)
PASS  [10] …
11/12 rows passed — FAILED: 4b
LIVE RUN NODE EXIT=1
```

`root:` and `pinned:` both name this worktree, so the run executed this branch's build and not the
main checkout's `dist/`. The run took 11:55:01 to 11:55:23 wall clock (`uptime` load 2.81 before,
2.84 after). `4b` is red on purpose (CHIP-FONT-13PX, the owner's call), as in every precedent run;
exit 1 is that row.

**The probe's own Save did not reach disk.** The precedent measured this for `chunk-links-harness`
and did not run the probe. The start epoch was written one second before the run:

```
start epoch 1789314900 = 11:55:00
--- files in copy2 newer than start:
--- count: 0
--- after touching a control file:
POSITIVE-CONTROL-HIT 11:55:35.5341843060
POSITIVE-CONTROL-HIT 11:55:35.5341843060 newer-probe.txt
```

The first predicate had no `-type f`, so it covered directories as well and still counted 0. The
same predicate found the control file touched afterwards (and the directory that touch modified),
so the 0 is a measurement, not a blind predicate. The Save clicked, the toast said
`Saved chunk "OJZ $00"`, and the section word moved from 0 to 16385 in memory, but nothing was
written to `<copy 2>`. The escape hatch "the probe turns out to write disk after all" did not fire.

The live aeon tree had **no file** (its `.git` pruned) newer than 11:55:00 when read at 11:55:52.
That was expected: every run here that could reach the live path was stopped by a refusal or had
`/bin/true` for electron. The same `find` over the tree's `games/` from epoch 0 lists 571 files, so
the tree is visible to it.

## `check-harness-guards`, before and after

The gate is `scratchpad/check-harness-guards.mjs` (`npm run check:harness-guards`, inside
`npm test`). The brief placed it under `scripts/`, where there is no such file: run from there, node
answers `Cannot find module`. On master's probe (`ebf9f464`), exit 0:

```
════ 282 clean / 283 classified (272 .mjs + 11 .sh) · 0 failure(s) · 1 unguarded-untracked · 0 unmeasurable ════
```

After the fix (working tree equal to `3b8f34a0`), exit 0:

```
════ 282 clean / 283 classified (272 .mjs + 11 .sh) · 0 failure(s) · 1 unguarded-untracked · 0 unmeasurable ════
```

`diff` of the two whole outputs is empty (exit 0), and neither names `chunk-row9-probe`. The probe
is among the 282 clean files both times. The gate has rules about spawning, killing, discovery
files, staleness, sleeps and registration (G1 to G9, S1 to S5), and none about which tree a rig
opens. Like `check-peer-path-literals` rule 5 in the precedent, **no static gate sees this class.
The refusal is the guard.** No check is added here.

## Registration

Registered: `"harness:chunk-row9": "node scratchpad/chunk-row9-probe.mjs"` at `package.json:106`.
The precedent rigs of its kind are registered too: `harness:chunk-links` (`:105`) and
`harness:guard-surface` (`:172`). No change.

## Proof D: the node suite

`VITEST_MAX_WORKERS=4 npm test`, foreground, over this packet's commit `5035ae99` (the fix plus
this packet, before these totals were added). **Exit 0.** The aggregate block:

```
 Test Files  618 passed | 3 skipped (621)
      Tests  9603 passed | 9 skipped (9612)
   Start at  11:59:55
   Duration  33.03s (transform 5.85s, setup 53.61s, import 12.14s, tests 27.85s, environment 28ms)
```

**0 failed**, so there are no failing names to list. The log has 621 per-file result lines, one
for each file in the total. The run took 11:59:38 to 12:00:29 wall clock for the whole chain,
gates and `tsc --noEmit` included, at `uptime` load 10.46 before and 8.09 after. The gates in the
chain printed `check-peer-path-literals: OK`, `check-cited-paths: OK`, `check-doc-citations: OK`
(this packet's citations are bound by it and pass) and the `check-harness-guards` line quoted
above, unchanged. The totals match the precedent's exactly (618 | 3 files, 9603 | 9 tests), as
expected for a change that touches a scratchpad rig and a doc. The worktree had **no** `node_modules` at all (not the symlink
the brief described). It was given a `cp -al` hardlink copy of the main checkout's `node_modules`
(217 top-level entries, the same as the source; not a symlink). `check-cited-paths` therefore
measures rather than dying "COULD NOT MEASURE".

## Also seen, not this parcel

- **The probe and `chunk-links-harness` write screenshots to the same directory**
  (both set `SHOTS` to the git-ignored `shots-chunk-links` directory beside them), so a run of one
  overwrites the other's `1-stamped.png` and siblings. They are ephemeral, and nothing cites them.
- During the live run, the discovery snapshot showed `~/.aurora/mcp.json` naming a **live** pid
  (1386235), an Aurora this parcel did not start. The probe ran on a private profile (HAZARD 6)
  and its own debug port, and its cleanup touched only its own tree. Recorded only because the
  unset runs 8 minutes earlier had shown that file STALE.

## Left open

- **The d-28 reading** the precedent flagged ("can WRITE" versus a rig kept safe by two omissions)
  applies to this probe unchanged. It is still the controller's call. If it is ruled against
  refusals for read-only rigs, `3b8f34a0` reverts alone.
- **The probe's purpose may be spent.** Its commits (`599d9d00` "row 9's stamp never reaches the
  document", `82e25aa5` the fix) closed the row-9 investigation, and this run's row 9 is green.
  Whether to retire it, which would mean unregistering it and adding it to `RETIRED_UNREGISTERED`
  in `check-harness-guards`, is not this parcel's call.
- **Neither rig reads the project's `dirty` flag after row 1.** "Rows 3 to 9 leave the project
  dirty" still rests on source (`executeCommand` → `markDirty`), as in the precedent.
- **`4b`**, CHIP-FONT-13PX, untouched.

## For the overseer to ratify

Calls the brief did not dictate:

1. **The refusal message says "this probe"** where `chunk-links-harness` says "this harness". It
   is the only textual divergence in the block. The alternative is byte-for-byte identity with a
   noun that is wrong for this file.
2. **The Usage line now names `scratchpad/chunk-row9-probe.mjs`.** On master it named
   `chunk-links-harness.mjs`, the file this one was copied from.
3. **The header gained the precedent's "THE aeon TREE" section and row-9 note**, reworded to say
   the no-disk measurement was taken on `chunk-links-harness` and extends to this probe through
   the shared rows and Save. This packet's live run now measures the probe directly, and the code
   comment was not updated to cite it.
4. **The optional whole live run was done**, on a fresh copy with `AURORA_BUILT_TREE` pinned. It
   extends the precedent's no-disk measurement to the probe itself.
5. **Only refusal 2 was mutated.** Deleting refusal 1 would still throw at import (a `TypeError`),
   so the check would not discriminate. Master's probe is refusal 1's red.
6. **The aeon copies were made under the session scratchpad** (`mktemp -d -p`) rather than
   `/tmp`, and through `git archive -o <tar>` then `tar -x` rather than a pipe. The worktree
   isolation refused the pipeline. Both copies and the tar were deleted after the runs.
7. **`node_modules` was absent in the worktree, not a symlink**, and the hardlink copy was made
   from nothing rather than replacing a link.
8. **No gate was added or changed.** `check-harness-guards` cannot see this class (above), and a
   rule for "a rig opens the tree the resolver defaulted" would be a new instrument with its own
   red-first. That belongs in a parcel of its own if wanted.

## ROADMAP row (for the overseer to place)

| ? | **THE CHUNK ROW-9 PROBE NOW REFUSES A LIVE aeon TREE, AND ITS OWN SAVE IS MEASURED AS NEVER REACHING DISK.** **DELIVERED 2026-09-13 on the branch, for landing** (CHUNK-ROW9-PROBE-LIVE-DEFAULT, the OPEN left by row 173), branch `fix/chunk-row9-probe-refusals` off `ebf9f464`, commit `3b8f34a0` (the refusals) and this row's docs; packet `docs/reviews/2026-09-13-chunk-row9-probe-refusals.md`. **THE DEFECT:** master's `chunk-row9-probe.mjs:83` took `siblingPathOrUnresolved('aeon')` (step 3, the aeon lane's LIVE checkout) under the comment "OPEN ONLY — never written", and its first 700 lines are byte-identical to master's `chunk-links-harness`, so it opened that tree (`:226`), stamped and painted into it, and clicked the chunk Save (`:886-890`). Run unset with `ELECTRON_BIN=/bin/true` it got past import, spawned and died at `CDP target never appeared`, exit 2: nothing refused. **THE FIX is row 173's block, copied:** `checkoutOverride('aeon')` null throws naming `AEON_DIR` and the `git archive` recipe, and an override equal to `siblingDefaultPathOrUnresolved('aeon')` throws, both at import (`:135`, `:147`). The block differs from `chunk-links-harness` by one word (harness to probe), and the stale comment and the Usage line now say what the probe does. Shown exit 1 unset, exit 1 at the live tree, and exit 1 through `LIVE_AEON`, each with `ELECTRON_BIN=/bin/true`. With refusal 2 deleted on disk, the live tree and the alias both got past import to exit 2, and the file was restored from the committed baseline (blob `5f1ba4a8`). **Against a copy:** past import with `/bin/true` (exit 2 at the CDP wait), and one whole run on a fresh `git archive` of aeon `96a98abd` (`root:`/`pinned:` naming the worktree, dpr 1, load 2.8) at `11/12 rows passed — FAILED: 4b`, `4b` red on purpose (CHIP-FONT-13PX), row 9 `save=clicked`, `before=0 after=16385`, toast `Saved chunk "OJZ $00"`, and **no file or directory in the copy newer than the run's start**, a control file touched afterwards found by the same predicate. `check-harness-guards` prints byte-identical output before and after (`282 clean / 283 classified … 0 failure(s)`) and never names the probe: no static gate sees this class. Registered as `harness:chunk-row9` (`package.json:106`), like its precedents; unchanged. `npm test` over the fix plus the packet (`5035ae99`): **9603 passed | 9 skipped (9612), 618 files passed | 3 skipped (621), 0 failed**, exit 0 (load 10.46); `check-cited-paths` and `check-doc-citations` OK. **For ratification:** the one-word message divergence, the Usage rename, and d-28's "can WRITE" reading carried over from row 173 (reverting is `3b8f34a0` alone). **OPEN:** whether the probe, whose investigation (`599d9d00`, `82e25aa5`) is closed, should be retired; it shares `chunk-links-harness`'s screenshot directory. |
