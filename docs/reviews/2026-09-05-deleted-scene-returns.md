# A scene deleted in the panel came back after saving — fixed

**Branch** `parcel/deleted-scene-returns` · **harness** `npm run harness:deleted-scene-returns`
(`scratchpad/deleted-scene-returns-harness.mjs`, registered in `package.json`)
**28/28 rows, 0 failed, 0 unmeasured** after the fix; **18/26 · 8 failed · 2 unmeasured** before it.

## 1. What was reproduced, before anything was changed

The report (`docs/reviews/2026-09-05-sec7-ui-reauthor.md` finding 2) was a report,
not a measurement, so it was driven end to end first — in the real app under CDP,
against a throwaway aeon clone under `mktemp -d`, with every gesture a real input
event. **It holds exactly as described, and the raster presets hold with it.**

| row | measured, pre-fix |
|---|---|
| `[1e]` | delete a scene → Ctrl+S → the file's stamp is **identical**: `ino=32557900 mtimeMs=1788620893250 size=889` before and after |
| `[1h]` | re-open the same project → **the scene is back in the library** |
| `[2d]` | the same for a raster preset: `ino=32557902 size=376` either side |
| `[2f]` | re-open → the preset is back |
| `[4b]` | a scene *created* this session, saved, then deleted keeps its file too |
| `[1c]`/`[2c]` | neither Delete asked anything before destroying a document |

**The raster presets are not a guess.** They were measured on the same run,
through their own picker and their own Delete button, and they fail identically.
They are written by the same loop with the same absent removal step.

### The three passing controls that make those failures readable

A file that is absent is also what a harness pointed at the wrong directory
produces, and an inode that did not move is what a save that never ran produces.
So the run also asserts, **and asserted green in both the red and the fixed run**:

- `[1f]`/`[2e]` — a **bystander** document the author did not delete survives with
  its **inode unmoved** (`ino=32617903` either side). A save that scythed
  everything, and a harness looking at an empty temp dir, both fail this.
- `[1g]` — two files the editor **could never have loaded** — a `.json` the parser
  refuses, and a file that is not a scene at all — are untouched.
- `[5a]` — aeon's own checkout is byte-for-byte where it was.

### One thing the first run got wrong, and what it cost

`[2b]` failed on the very first run: the *Raster band presets* section is
`defaultCollapsed` and its header sat outside the effects column's scroller, so
the press landed on whatever was at those coordinates. The preset half would have
gone **unmeasured while presenting as a second defect**. Every control is now
scrolled into its scroller first and its rect printed beside the claim it
supports.

## 2. The design, and why this one

The dispatch's own framing is the right one: *a save plan that deletes is more
dangerous than one that does not*. Nearly all of the work is in what the removal
step **cannot** reach.

### 2.1 The removable set comes from what was LOADED

Each effects library gains a required `loadedPaths` — the project-relative paths
this session has actually **seen hold a document of that kind**. The loader fills
it only from files it *parsed*; `buildAeonSavePlan` then computes

```
removable = loadedPaths  −  (paths the library still claims)  −  (unreadable)
```

Three classes of file are therefore unreachable from the removal step however it
is called:

1. **A document in a checkout Aurora has not opened.** It is in no ledger. This
   is the case that would turn "open a project, press Ctrl+S" into a scythe, and
   it is asserted directly (`save-removals.test.ts`: *"NEVER removes a document
   this session did not load"*) rather than inferred from the loader's behaviour.
2. **A `.json` the parser refused.** It lands in `unreadable`, which keeps it out
   of `loadedPaths` — and `removalsFor` subtracts `unreadable` a **second time**,
   so the rule survives a future loader that ever admitted such a path. Aurora
   already refuses to *overwrite* those files; it now refuses to *delete* them,
   on the same one sentence: it does not destroy bytes it could not read.
3. **A file that is not such a document at all** — a `.bin` deform table, an
   author's notes. The loader skips it and it enters no list.

`loadedPaths` is **required, not optional**. A construction site that forgets it
fails to compile (that is the 21 fixture files in the fix commit), and the `[]`
it is then forced to write means *remove nothing* — the safe direction.

### 2.2 The ledger follows the session, not only the load

`noteEffectsScenesPersisted` / `noteEffectsPresetsPersisted` let a completed save
adopt "what is on disk now". Without it, *create a scene → save → change your
mind → delete → save* orphans that file for ever: it was written, never
**loaded**, so a ledger seeded only at load could not reach it. Row `[4b]` of the
harness is that exact sequence, driven through the UI.

A removal that **failed** is deliberately kept in the ledger, so one `EPERM` is
not permanent and the next save retries it.

### 2.3 Ordering: writes first, removals last

`plan.files` is applied in full, then `plan.removals`.

**What a crash between them leaves behind:** the new state written *and* the
deleted documents still on disk — which is precisely the pre-fix behaviour. The
author re-opens, finds the scene they deleted has come back, deletes it again,
and nothing else is wrong. It is recoverable by repeating the gesture.

The other order can take the file away while the rest of the save — the meta
sidecar that stopped pointing at it, the section wiring — never lands, leaving a
project whose sections reference a document that no longer exists, and no file to
restore it from. Between *an undone deletion* and *a dangling reference plus a
destroyed file*, the recoverable one goes last. `aeon-save-removals.test.ts`
pins it from the ordered op log rather than from a count.

### 2.4 Saying what it will remove — the existing surface, not a new one

`AeonSavePlan` gained `removals: AeonSaveRemoval[]`, each carrying its own
author-facing sentence (`scene "victim"`), so the plan *is* the channel. Above it:

- the save toast names one removal outright and **counts + samples** more than one
  through `nameSome` — the same fold `core/formats/effects/scene.ts` and
  `state/save-outcome-report.ts` already use, so a long list can never render "I
  could not tell" as silence;
- every removal gets its own `console.warn`, because a summary that lost *which*
  document went would make the author's next step impossible;
- a removal that **failed** gets the **error** channel beside the success line,
  never folded into it. Coalescing changes the count, never the channel.

`CommitReport` (`core/art/classic-commit-plan.ts`) was read and is not this
surface — it is the classic art-commit plan's report and has no aeon save path.

### 2.5 The confirm goes on the DELETE, not on Ctrl+S

This is the one place I departed from the dispatch's sketch, and the argument is
the reason.

The dispatch asked that the last copy of something unrecoverable not be destroyed
without an explicit, visible act. A **save-time** confirm was considered and
rejected on the merits: at save time both answers are bad — "Cancel" means either
*abandon the whole save* or *save but keep the file*, and the second is the
reported defect re-offered as a feature. At **delete** time, Cancel has exactly
one clean meaning, and the author still has the context that made them press the
button. So the question goes where the intent is, and the save **reports** what
it removed rather than asking again.

There is a second reason. The previous commit changed what that button *means*:
it used to be recoverable by simply not saving, and `d-27` already found this
exact control keeps keyboard focus after its own press and silently retargets at
another document — a bare Space then deletes a *different* scene. Making it
destroy a file without a question would have been the d-29 sprite defect arriving
by a new door.

`shell/effects-delete-guard.ts` uses the **existing** mechanism: the same
`useConfirmStore` the tab-close, project-open, window-close, new-sprite and
clear-library doors ask through, rendered by the same `ConfirmDialog` under
`ui/safe-focus.ts`'s rule. Measured on the live dialog at `[1c3]`:
`focusedKey="cancel" focusedTone="neutral"` — the destructive arm is not the one a
bare Space would hit.

**A document with no file gets no dialog.** A scene created this session and never
saved destroys nothing a Ctrl+Z cannot return, so it must not interrupt — the rule
`new-sprite-guard.ts` states for a clean sprite. That makes a proof of this feature
need three rows, not one, and the harness carries all three: `[1c]` asks and
deletes, `[3a]` Cancel keeps it *in the panel and on disk with the same inode*,
`[3b]` the no-file case does not ask.

The guard is **not** in the command: `agent-handler` still calls
`deleteSceneCommand` directly, because an agent's request *is* its explicit act
and there is no human at a modal on that path.

### 2.6 The delete channel

`file:delete` is the only channel in Aurora that removes a file: one
project-relative path per call, `isRelPathSafe` as a **hard** refusal with no
legacy absolute-path exception, no recursion, no directories. `ENOENT` is a
**success** — the caller wanted the path gone and somebody else got there first.
*Which* paths may be named is not the channel's business and must never become
it; that judgement is `removalsFor`'s.

## 3. Do the raster presets share the shape?

**Yes, identically, and it is measured rather than assumed.** Same absent removal
step, same loop, same result on disk (`[2d]`/`[2f]` above), same fix, same
confirm. The one difference is upstream of all this and predates the parcel: the
preset Delete button also carries a `disabled` refusal when a section still binds
the preset (`deletePresetRefusal`), which stops a delete that would dangle a
binding. That guard and this one answer different questions and both now apply.

## 4. Proof

### Red first, on the real thing

The harness was committed **red** at `0666e6a`, before a line of the fix existed:
18/26 · 8 failed · 2 unmeasured, with the failing rows quoted in §1. That is the
strongest red-first available here — it is the actual defect, in the actual app,
not a planted one.

### The disk-level assertion

`[1e]` and `[2d]` read the **file system**, not the model: `existsSync` on the
document's path, with the full `ino=/mtimeMs=/size=` stamp printed from before the
save beside the reading from after it. A row that only asked the library would have
passed against the bug on the day it was reported — the library dropped the scene
*then* too. The inode is load-bearing in the other direction as well: `[1f]`/`[2e]`
fail if a bystander's inode **moves**, which catches a save that rewrote
everything, and `[3a]` fails if the cancelled scene's inode moves.

The node suites say so about themselves: neither can see a file system, and both
file headers name the harness as the instrument for that claim.

### Poisons — mutation shown applied, restored from a committed baseline

Run on a clean, committed tree; each `git diff --stat` and the mutated line read
back **off disk**; each restored with `git checkout --` (safe precisely because
the tree was committed first).

| # | mutation | rows that reddened |
|---|---|---|
| P1 | the scene removal push, deleted | **7** — 2 core, 5 glue |
| P2 | the `unreadable` subtraction dropped from `removalsFor` | **1**, and exactly the one that feeds the same path to both arguments |
| P3 | the loader stops recording what it read (`loadedPaths.push` deleted) | **6** |
| P4 | **the scythe** — removable set derived from the directory listing instead of the ledger | **7**, including *"NEVER removes a document this session did not load"* |
| P5 | removals moved **before** the writes | **4**, including the ordering row |
| P6 | the confirm removed from the guard | **3** |

P2 is worth its own line. `loadedPaths` and `unreadable` are disjoint by
construction today, so a test that only opened a project would leave that
subtraction entirely unexercised — a guard asserting nothing, which is this
repo's dominant defect class. The row that catches it feeds one path to **both**
arguments on purpose, and the test says so where a reader will find it.

### Suite

`npm test` — **7321 passed / 9 skipped / 0 failed** (507 test files passed, 3
skipped) in a linked worktree. **Master's number was measured here too, not
quoted**: this same worktree checked out at `44ae4de3` gives **7290 passed / 9
skipped** (504 files passed, 3 skipped). The delta is
**+31 passing rows and no change to the skips**, attributed exactly:
`save-removals.test.ts` 15, `aeon-save-removals.test.ts` 7,
`effects-delete-guard.test.ts` 9. The ninth skip is `sibling-root`'s step-3 row,
which declines to measure in a worktree and says so; it is master's result here.

One existing row changed rather than being added to: `test/formats/effects-scene.test.ts`'s
absent-directory case asserts the **whole** library object with `toEqual`, so it
had to learn about `loadedPaths`. That exhaustiveness is the right shape and was
kept — it is what makes a future field that the absent-directory path forgets to
fill land there rather than at whatever consumer reads it first.

## 5. Boundaries honoured

No emulator tool was touched; no Build & Run. **Nothing wrote to the aeon
checkout** — the harness resolves it read-only through `test/support/sibling-root.mjs`
(`siblingPathOrUnresolved('aeon')`, never `process.env`), copies `project.json`
and `games/` into a `mktemp -d` clone, and `[5a]` re-stamps the source at the end
to prove it. All authoring happened in that clone.

## 6. Nothing BLOCKED

No constraint forced a worse design. The one place the delivered shape differs
from the dispatch's sketch — the confirm on the delete gesture rather than on the
save — is argued in §2.5 and is offered as an argument, not as a fait accompli.
