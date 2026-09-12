# SCENE-SELECTION-SNAPS-BACK: a scene the author picks survives a sub-tab round trip

Parcel on branch `parcel/scene-selection-snaps-back`, cut from master `a04c3c0e`.

**In one paragraph.** On master, a scene the author picks in the Parallax list did not survive
a trip to another Effects sub-tab. It was replaced by the section's bound scene the moment
Parallax mounted again, so the next value typed landed in a scene the author had not picked.
- **Master.** Reproduced before any edit: `harness:raster-timeline` fails 6a and 6b and stops
  at row 7, exactly as `docs/reviews/2026-09-12-timeline-rig-reaim.md` recorded.
- **Cause.** Cold read C2's "selection follows the section" was a component `useEffect`. An
  effect also runs on MOUNT, and the sub-tabs unmount the panels they hide.
- **The fix.** The follow becomes a store subscription, `src/renderer/state/effects-scene-follow.ts`.
  It fires when the active section's identity changes (project directory, zone, act, section
  index, that section's `sceneRef`), on screen or off, and never on a mount.
- **On the fix.** The harness runs **25/25 three times out of three**. Reverting only the fix
  in a scratch commit turns 6a, 6b and the row-7 stop red again, and restoring it turns them
  green.
- **C2 still holds.** `harness:effects-scene-selection` is 15/15 on the fix.

## The reproduction, on master, before any edit

**Build.** `VITE_AURORA_DEBUG=1 npx electron-vite build` in this worktree at `a04c3c0e`, exit 0.

**Environment on every run.**
```
ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
AURORA_BUILT_TREE=<this worktree>
AEON_DIR=<a fresh cp -a of the snapshot below, in a run-unique directory>
```

**The aeon fixture.** One `rsync -a` snapshot of the aeon working tree, taken at
2026-09-12T09:54:05-04:00. It excludes `/.git`, `/.claude` and `.pytest_cache`, and comes to
199M. aeon's `refs/heads/master` read `a38ce7c9`, the same commit as the re-aim packet's
snapshot; it was read from the file, because git outside the worktree is refused here. For
the same reason I could not run `git status` in aeon, so the snapshot may carry a peer's
uncommitted edits, as the re-aim packet's did. Every run got its own copy.

**Result.** `docs/captures/2026-09-12-scene-selection-snaps-back/00-master-raster-timeline.log`:
```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a21b0e1d3a0074b6d
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a21b0e1d3a0074b6d
NOTE       dpr=1 ...
NOTE       the selected scene MOVED during a parallax round trip: before=raster_strip_probe
           -> parallax shown=ojz_act1_start -> scene form open=ojz_act1_start -> edit made=ojz_act1_start
           -> colour shown=ojz_act1_start
FAIL  [6a] ... line=undefined; strip scene=ojz_act1_start splits=[]; selected=ojz_act1_start
FAIL  [6b] ...
STOPPED after 17 rows (15 passed), on a MISSED AIM ... "Layer 1 vsplit.at (" ... found 0, want exactly 1
```
That matches the re-aim packet's three runs row for row.

**The mechanism, proven by subtraction and not by an in-app breakpoint.** The packet I was
handed inferred it from source. Here it is confirmed causally:
- The fix changes exactly two things: it removes the panel's effect, and it installs the
  subscription.
- Reverting exactly those two things, with nothing else touched, brings back the same red rows
  and the same `MOVED` trace. Restoring them brings back green (see "Red first on the fix"
  below).
- Each build's bundle was grepped for the old effect's dependency line, so each run is tied to
  the follow code it actually carried.
- The writer enumeration below shows the effect was the only writer that ran without a gesture.

I did not set a CDP breakpoint in the app.

## Every writer of `selectedEffectsSceneId`

The commands, run on the final tree and saved with their full output in
`docs/captures/2026-09-12-scene-selection-snaps-back/50-writer-enumeration.txt`:
```
grep -rn "selectedEffectsSceneId\|setSelectedEffectsSceneId" src/ test/ scratchpad/*.mjs scratchpad/lib/ --include=*.ts --include=*.tsx --include=*.mjs
grep -n "setSelectedId" src/renderer/components/effects/EffectsScenePanel.tsx        # the panel aliases the setter
grep -rn "useEditorStore.setState\|editorStore.setState\|persist(\|getInitialState\|initialEditorState\|resetEditor" src/renderer --include=*.ts --include=*.tsx | grep -v __tests__
grep -rn "selectScene(" src/renderer scratchpad/*.mjs --include=*.ts --include=*.tsx --include=*.mjs
```

| # | Writer | file:line (final tree) | When it writes |
|---|---|---|---|
| 1 | the store's initial value | `src/renderer/state/editorStore.ts:772` | once, at store creation: `null` |
| 2 | the setter, the only write path | `src/renderer/state/editorStore.ts:873` | every row below calls it |
| 3 | a SCENES row click | `src/renderer/components/effects/EffectsScenePanel.tsx:555` (alias bound at `:416`) | an author gesture |
| 4 | `New` | `src/renderer/components/effects/EffectsScenePanel.tsx:526` | an author gesture, after the create command runs |
| 5 | **the follow** | `src/renderer/state/effects-scene-follow.ts:87` | on a change of the active section's identity. **On master this was `EffectsScenePanel.tsx:510`, the effect that ran on every mount: the only writer with no gesture behind it.** |
| 6 | the debug hook `selectScene` | `src/renderer/debug-hooks.ts:1509` | `VITE_AURORA_DEBUG` builds only; 20 instruments in `scratchpad/` call it (the capture lists them) |
| 7 | the node test | `src/renderer/state/__tests__/effects-scene-follow.test.ts:62`, `:72` | node only |

**What does not write it, checked rather than assumed.**
- No raw `setState` touches it. The only two in `src/renderer` write `marquee`/`pasting` and
  `bandCandidate`.
- `editorStore` has no `persist` middleware and no reset or clone of its state.
- Project open (`src/renderer/state/aeon-open.ts`) and `projectStore.reset` never touch it. A
  stale id is resolved by `resolveSelectedScene`'s fallback, which is unchanged.
- The readers are not writers: `MapViewport.tsx:206` and `:657`, `RasterTimelineStrip.tsx:118`,
  `EffectsScenePanel.tsx:415` and `debug-hooks.ts:1508`.

## The design

**In three sentences.**
1. The scene selection follows a CHANGE of the active section's identity, meaning the project's
   directory, the zone, the act, the section index and that section's `sceneRef`. It follows
   nothing else, and a mount is not an input at all.
2. The follow is a subscription installed once at app start (`installEffectsSceneFollow`, from
   `App.tsx`'s runtime wiring). It listens to the project store, the editor store and the
   history hub, because SECTION ASSIGNMENT mutates `sceneRef` in place and changes neither
   store's identity.
3. The decision itself is the pure `sceneSelectionFollowStep` beside `sceneSelectionFollow` in
   `src/renderer/providers/effects-aeon.ts`. The same identity never moves the selection; a
   different one moves it to the section's scene when one exists and is readable.

**Why a subscription, and not the "last followed key compared at the next mount" the brief
suggested.** A key compared at mount fixes the remount, but it cannot see a trip that came back
to where it started. Suppose the author, on Colour (where the section strip is still on
screen), picks section 3 and then section 0, then returns to Parallax. "Picking a section picks
its scene" would silently not have happened. This repo met the same fork once already: the
marquee clear's fix for MAP-REMOUNT-DROPS-PASTE (`src/renderer/state/editorStore.ts`, the
`useProjectStore.subscribe` block) chose a subscription for exactly this reason. Its comment
says "a comparison made at the next mount cannot see a trip that came back to where it
started". I followed the precedent rather than re-arguing it.

**Why the project is its directory (`S4Project.basePath`), not its object and not its
`config`.** P4 needs "a library reload that re-parses the same scenes" not to yank the pick,
and the only path that re-parses the scene library is a project open.
`loadEffectsSceneLibrary`'s one caller is `src/core/project/aeon/load.ts:1073`, so a
same-directory reopen IS that reload.
- The marquee precedent keys the project on the `config` reference. That object is fresh on
  every open, same directory included, so here it would yank.
- The `project` object is replaced by edits (`addChunks` and its two siblings).
- The directory is the one handle that is the same across a reopen of one checkout and
  different between two checkouts of one tree.

**The one behaviour change beyond the bug.** The follow now fires when the change happens,
whether or not Effects is showing: at project open, or on a section change made on the Layout
facet. Master followed at the next Parallax mount instead. The selection is drawn only by the
Effects column and by MapViewport's effects guides. The guides are drawn only on the Effects
facet: `activeGuideScene` returns null unless the tab's facet is `EFFECTS_FACET`
(`src/renderer/components/MapViewport.tsx:203`). So on arrival the author sees what
master showed. One side effect: an instrument that calls `selectScene` BEFORE the panel mounts
now keeps its selection, where master overwrote it at the mount.
`scratchpad/row-remap-control-harness.mjs` documented that overwrite as a trap. Its comment now
carries a dated note beside the old text, which is left in place.

### P3: every way the panel's identity inputs can change

"Master" is the old effect's behaviour: dependencies `[activeSectionIndex, sceneRef]`, plus a
re-run on every mount.

| Change | What changes in the identity | This branch | Master | Evidence |
|---|---|---|---|---|
| Sub-tab round trip (Parallax, then Colour or Tile anim, then Parallax) | nothing | **pick kept** | re-selected the section's scene on the return: the bug | raster-timeline 6a..9c: green 3 of 3 on the fix, red on the revert; node P1 row |
| Facet round trip (Effects, then Layout or any facet, then Effects) | nothing: the facet lives in the workspace store | pick kept | re-selected on return, since the column remounts | node P1 by construction; **runtime NOT MEASURED** |
| Main-tab switch to a non-level tab (Home, a sprite or canvas document) and back | nothing: `currentActId`'s only writers are `aeon-open.ts:152`, `shell/tab-activation/level.ts:165`, `projectStore.reset` and the debug `resetAct` | pick kept | re-selected on return if the column remounted | by construction; **runtime NOT MEASURED** |
| Level tab of another act (act switch) | `actId` | follows to that act's section's scene | followed only if the new `sceneRef` string differed, or at the next mount | node rows (pure and subscription); **runtime NOT MEASURED: the fixture has one zone and one act** |
| Zone (level) switch | `zoneId` | follows | as the act switch | node rows |
| Project open, another directory | `projectPath` | follows | followed at the next mount only | node "another checkout" row |
| Same-directory reopen: the one path that re-parses the library (P4) | nothing, if the author was on the act the open selects (`zones[0].acts[0]`); otherwise the act changes and it follows | pick kept | kept while mounted; re-selected at the next mount | node P4 row |
| An edit that replaces the project object (`addChunks`) | nothing | pick kept | kept | node P4 row |
| Project close (`projectStore.reset`) | path, zone and act go to null | nothing to follow: the stale id stays and `resolveSelectedScene` falls back | same | by construction |
| Active section change, anywhere (the strip, a map click, the Layout facet, the agent handler), on screen or off | `sectionIndex` | follows | followed while mounted, or at the next mount | C2 harness [5a] on the fix; node rows |
| A, then B, then back to A, while Parallax is unmounted | changes twice | follows, ending on A's scene | ended on A's scene through the mount | node row |
| SECTION ASSIGNMENT, or its undo or redo | `sceneRef`, in place, seen through the history hub | follows | followed (`sceneRef` was a dependency) | node row; **runtime NOT MEASURED in this parcel** |
| A section bound to the act default, or to a ref no readable scene claims | `sceneRef` | nothing to follow: the pick is kept and the relation sentence says so | same | C2 harness [5b]; node row |
| Scene create, delete or edit | nothing | pick kept (`New` selects the new scene itself) | kept while mounted | node P1 row |
| First arrival | from no identity | follows at project open, before any panel mounts | followed at the first Parallax mount | C2 harness [2b] on the fix |

## Proof

### `harness:raster-timeline`: master, the fix three times, the revert, the restore

Every run printed `root:` and `pinned:` naming this worktree:
```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a21b0e1d3a0074b6d
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a21b0e1d3a0074b6d
```
As the re-aim packet found, a pinned worktree run prints `pinned:` and no `in-tree:` line.
Each log starts with my wrapper's header: the worktree HEAD at launch, and that run's own aeon
copy.

| Run | Build (HEAD) | dpr | Tally | Log |
|---|---|---|---|---|
| master | `a04c3c0e` | 1 | 15 PASS, FAIL 6a 6b, STOPPED at row 7 (17 of 25 reached) | `00-master-raster-timeline.log` |
| fix, run 1 | `e9482f68` | 1 | **25/25** | `20-fix-raster-timeline-run1.log` |
| fix, run 2 | `e9482f68` | 1 | **25/25** | `20-fix-raster-timeline-run2.log` |
| fix, run 3 | `e9482f68` | 1 | **25/25** | `20-fix-raster-timeline-run3.log` |
| fix reverted (scratch `10d9c350`) | `10d9c350` | 1 | 15 PASS, FAIL 6a 6b, STOPPED at row 7, and the `MOVED` trace is back | `40-reverted-raster-timeline.log` |
| restored | `c381efdd` | 1 | **25/25** | `43-restored-raster-timeline.log` |

(All logs are under `docs/captures/2026-09-12-scene-selection-snaps-back/`.)
- dpr was 1 on all six runs; 1.35 did not occur.
- No claim here combines rows from two runs.
- On the fix no run printed the "selected scene MOVED" note, and rows 7a through 9c, unreached
  on master, all pass.

### `harness:effects-scene-selection` (cold read C2's own instrument) on the fix

`21-fix-effects-scene-selection.log`: **15/15**, dpr 1 (row [3z]'s aim), HEAD `e9482f68`.
- [2b] first arrival shows section 0's scene.
- [3a] a real press on another scene moves the selection and paints the relation sentence.
- [5a] picking section 8 moves the selection to its scene.
- [5b] a section bound to nothing leaves it where it was.

### Red first on the fix

1. **The scratch revert.** Commit `10d9c350` puts back master's `App.tsx`,
   `EffectsScenePanel.tsx` and `effects-aeon.ts` and removes
   `src/renderer/state/effects-scene-follow.ts`. The node test file was left alone: it is not
   the fix, and it is not bundled. Evidence: `40a-scratch-revert-show.txt` and
   `40b-scratch-revert-diffstat.txt`, which reads
   `4 files changed, 22 insertions(+), 188 deletions(-)` against the fix.
2. **The reverted lines, read back from disk** (`40c-scratch-revert-on-disk.txt`):
   ```
   509:    if (useEditorStore.getState().selectedEffectsSceneId === follow) return;
   515:  }, [activeSectionIndex, boundSceneRef]);
   === effects-scene-follow.ts: ABSENT
   === installEffectsSceneFollow in App.tsx: 0
   installEffectsSceneFollow 0 / sceneSelectionFollowStep 0 / old effect deps line 1   (the reverted bundle)
   ```
3. **Red on the revert.** Built and run: red, as in the table above.
4. **Restored and green.** `git reset --hard c381efdd` dropped the scratch commit, the tree was
   rebuilt (the bundle has `installEffectsSceneFollow` twice and the old dependency line zero
   times; see `42-restored-state.txt`), and the run was green.

### The node rows, red first

`src/renderer/state/__tests__/effects-scene-follow.test.ts`: **22 rows**. They cover the pure
step, with one row per identity field, and the subscription over the REAL project store, editor
store and history hub (P1 to P4). They are collected by `npm test` through vitest's
`src/**/__tests__/**/*.test.ts` include. Each plant was shown on disk, run, and restored from
the committed fix:

| Plant | Diff | Result |
|---|---|---|
| A: `actId` dropped from `sameSectionIdentity` | `10-node-plant-a-diff.txt` | exactly the two act rows red: **2 failed, 20 passed (22)**, `10-node-plant-a-red.log` |
| B: the identity check removed, so every step re-follows (the snap-back, in store form) | `11-node-plant-b-diff.txt` | **6 failed, 16 passed (22)**: P1, both P4 rows, the same-identity row, and two P2 rows whose pick is re-followed at once, `11-node-plant-b-red.log` |
| restored | (plant B's diff contained only plant B, so plant A's restore was clean) | **22 passed (22)**, `12-node-restored-green.log` |

**What these rows cannot see.** There is no mount in node. The rows would pass on a regression
that put the follow back into a component. That is why the harness is the proof of P1, and why
the test's header says so.

## The sweep: the thirteen instruments `1fe514f2` gave a sub-tab click

Classification by what each file does, measured with greps for: a SCENES-row click
(`button[title$=`), `selectScene(`, `new_scene_id`, and its sub-tab clicks.

| Instrument | Authors or selects a scene | Crosses sub-tabs | Run on the fix | Run on the revert | Reading |
|---|---|---|---|---|---|
| `scratchpad/raster-timeline-harness.mjs` | yes (`New`) | both ways, every step | 25/25 (x3) | 15 PASS, 6a 6b FAIL, stop at 7 | the subject of this parcel |
| `scratchpad/effects-deform-harness.mjs` | yes (`New` twice) | Colour, then Parallax | 6 PASS, FAIL [2c] [0a], then `HARNESS ERROR: wrong build` | **identical** | stops at its provenance row on this tree: `controls titled deform_fg: []`, and its [2c] door answers `no-scene-header` (the retired `/^SCENE\s*<dash>/` header aim the re-aim packet fixed elsewhere). It never reaches its round trip, so it measured **nothing** about this bug |
| `scratchpad/vsplit-advisory-harness.mjs` | yes (`New`) | Colour, then Parallax (lines 813/816) | 11 PASS, 13 FAIL ([5a0] to [5j]), then a TypeError at `:865` | **identical failing set** | [5a0] is `no-element` on the v_factor spinner, BEFORE the round trip, so the failures predate this parcel. Rows after the round trip are not reached: **unmeasured** for this bug |
| `scratchpad/timeline-edit-harness.mjs` | yes (`New`) | to Colour, never back | 4 PASS, FAIL [3z] [3a], then `preset not created` | **identical** | leaving Parallax writes nothing (only a return remounts), so it is not exposed; it stops on the Colour job's preset authoring anyway |
| `scratchpad/band-preset-harness.mjs` | no | to Colour once | NOT RUN | NOT RUN | no scene gesture: not exposed |
| `scratchpad/bganim-strip-range-harness.mjs` | no | to Tile anim twice | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/effects-bob-harness.mjs` | no | no sub-tab click | NOT RUN | NOT RUN | not exposed |
| `scratchpad/effects-refusal-harness.mjs` | no | to Colour once | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/effects-section-picker-harness.mjs` | no | to Colour once | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/effects-section-strip-harness.mjs` | no | to Colour three times | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/section-raster-select-harness.mjs` | no | to Colour twice | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/variant-cycle-harness.mjs` | no | to Colour once | NOT RUN | NOT RUN | no scene gesture |
| `scratchpad/writer-originated-scene-harness.mjs` | yes (`New` four times) | no sub-tab click | NOT RUN | NOT RUN | never leaves Parallax: not exposed |

Logs: `30-fix-sweep-*.log` and `41-reverted-sweep-*.log`.

**What the sweep says about the hypothesis.** Of the three instruments besides raster-timeline
that author a scene and cross sub-tabs:
- **timeline-edit** is not exposed.
- **effects-deform** and **vsplit-advisory** would be exposed, but both stop on aim misses that
  are identical with and without the fix, before or at their round trip.

So the hypothesis is confirmed for raster-timeline alone, and **unmeasured** for those two
until they are re-aimed. They are the candidates for the next harness re-aim parcel.

The 20 instruments that select through the debug hook `selectScene` are not in the thirteen,
and none was run. The fix removes an overwrite they had to work around, so none should get
worse, but that is reasoning, not a measurement.

## `npm test`

Filled in by the commit after this one, on the committed tree.

## Proposed ROADMAP row (for the overseer to write; `docs/ROADMAP.md` is not touched here)

> **SCENE-SELECTION-SNAPS-BACK: DONE 2026-09-12.**
>
> **What changed.** The Effects scene selection follows a change of the active section's
> identity (project directory, zone, act, section index, `sceneRef`). That happens through a
> store subscription (`src/renderer/state/effects-scene-follow.ts`), never on a panel mount. A
> scene the author picks now survives sub-tab, facet and main-tab round trips.
>
> **Measured.**
> - `harness:raster-timeline`: master 15 PASS with 6a/6b red and a row-7 stop; the fix 25/25,
>   three runs of three; the revert red again.
> - C2's `harness:effects-scene-selection`: 15/15.
> - A 22-row node file over the real stores and history hub.
>
> **Follow-ups.**
> - `effects-deform` and `vsplit-advisory` stop on pre-existing aim misses before their
>   Parallax round trip, so neither measures this; they are re-aim candidates.
> - The act switch and SECTION ASSIGNMENT are proven in node only, because the fixture has one
>   zone and one act.

## Open, and not measured

- **Runtime act or zone switch.** Not driven: the aeon fixture has one zone and one act. Node
  only.
- **Runtime facet round trip, main-tab round trip and SECTION ASSIGNMENT.** Not driven. Node
  rows, plus the argument from the identity's writers.
- **`effects-deform` and `vsplit-advisory`.** Pre-existing aim misses stop them before any row
  about this could run.
- **The mechanism.** It is proven by subtraction, not by an in-app breakpoint.
- **A wrong count in the record.** The fix commit's message says the node file has 18 rows; it
  has 22. The captures commit `c381efdd` records the correction.

## What the brief got wrong, or left open

1. **"A last-followed key compared at mount" was the suggested shape.** It re-breaks nothing C2
   promised, but it cannot see a section change that returns to where it started while the
   panel is unmounted. The repo's own precedent for this exact fork (MAP-REMOUNT-DROPS-PASTE)
   is a subscription, for exactly that reason. The brief allowed the design call; this is it.
2. **"Read the `root:`/`in-tree:` lines."** A pinned worktree run prints `root:` and `pinned:`;
   `in-tree:` appears only when the tree has its own electron binary. The re-aim packet
   recorded the same.
3. **P4's "library reload" has exactly one route.** It is a project open, and a same-directory
   reopen is that reload. That is why the project identity is the directory. It could not be
   the `config` reference the marquee precedent uses: that reference is fresh on every open
   and would yank.

## Commits on `parcel/scene-selection-snaps-back`, oldest first

| Commit | Purpose |
|---|---|
| `e9482f68` | the fix and its 22-row node file |
| `c381efdd` | captures: master red, three green fix runs, the node plants |
| `10d9c350` | SCRATCH: the fix reverted for the harness red-first. Dropped by `git reset --hard c381efdd` and NOT on the branch; recorded here only |
| (this commit) | this packet, the remaining captures, and two comment corrections: the node file's header, and the dated note in `row-remap-control-harness.mjs` |
| (next) | the `npm test` totals |
