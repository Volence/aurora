# Three lens-sweep defects in MapViewport: a witness, a teardown, and the guard that was 54 lines too low

`parcel/viewport-gesture-guards` · branched from master `4cf66084` · 2026-09-08

Code tip `f6818a4d`; the commit that adds this file changes nothing under `src/`.
The suite figures below were measured at `f6818a4d` and re-measured at the branch
tip after this file landed, with the same result.

Three findings, one file, four commits. Each commit carries its own finding; this
packet is the index, the evidence, and what is left open.

| Finding | Severity | Fixed by | Gate |
|---|---|---|---|
| DRAG-SURVIVES-ACT-SWITCH | critical | `map-gesture-witness.ts` + witnesses on four carriers | 17 rows, `map-gesture-witness.test.ts` |
| UNMOUNT-DISCARDS-STROKE | high | unmount cleanup calling `finishGesture` | 4 rows, `map-teardown.test.ts` |
| DELETE-ABOVE-MODIFIER-GUARD | high | `map-chords.ts`, one modifier policy | 11 rows, `map-chords.test.ts` |

Files changed: `src/renderer/components/MapViewport.tsx`, plus new
`map-chords.ts`, `map-gesture-witness.ts` and three test files under
`src/renderer/components/__tests__/`.

## Suite

Measured in this worktree, both numbers from logs only this agent wrote (the
shared scratch directory had four agents in it; the first `baseline.log` I read
turned out to be another parcel's run, so every figure below comes from a
namespaced file whose own output names this worktree).

* baseline, master `4cf66084`: **3 failed / 7648 passed / 9 skipped (7660)** in
  **525** files, rc=1.
* tip `f6818a4d`: **3 failed / 7680 passed / 9 skipped (7692)** in **528** files,
  rc=1.

Same three failures at both ends, all in
`test/formats/bg-override-contract-currency.test.ts`, all self-labelled `NOT AN
AURORA REGRESSION`: `BG_TILE_CAPACITY` is vendored as 400 and aeon
`54e2be2217ebed0082039e7b5bdbd34c7546c346` now declares 376. Pre-existing, out of
scope, and it is what makes `npm test` exit 1 on this branch.

The counts sum: +3 files and +32 rows are exactly 11 + 17 + 4.

**On the baseline discrepancy the coordinator raised** (a main-checkout run
reporting 7649 passed / 8 skipped against a worktree run reporting 7648 / 9):
both are right, and the difference is one environment-conditional row.
`test/support/sibling-root.test.ts`'s "step 3 ... and THIS checkout, when it is a
main one" SKIPS in a linked worktree and runs in the main checkout. My log carries
its skip note naming this worktree by path. Nothing to adjudicate.

## 1. DRAG-SURVIVES-ACT-SWITCH

Commit `8daa197a`. The brief left the shape of the fix open: witness, pane key,
or both. **Witness only**, and the argument is in the commit message. The short
form:

* the pane key fixes neither damage. It removes the component, not the stale
  index: act A keeps what the mousemoves wrote, with no command, and once a
  teardown commits (finding 2) the commit resolves against act B anyway;
* an act switch is not the only no-pointer route. An undo that rebuilds the rows,
  a zone switch and a project reopen all move the subject with the pane's key
  unchanged;
* the precedent is already on this axis: `endGuideDrag` carries a witness and its
  docblock names this exact defect.

The one departure from that precedent is deliberate: the witness is **identity**,
not JSON. A guide drag previews through a ref, so its value witness is stable for
the whole gesture; an object drag writes live, so a value witness would fire on
the first pixel. Identity also holds the row after the act closes, which is what
makes the revert possible.

All four carriers the sweep named now carry one, and `abandonStaleGestures` is
the single place that acts on the verdict: it puts back what the gesture wrote,
drops it, and says so once. It issues no command, because there is no correct one
to issue.

## 2. UNMOUNT-DISCARDS-STROKE

Commit `db50962b`. One cleanup, deliberately through a ref with an empty dep list
rather than `[finishGesture]`: today those mean the same thing, and the day
`finishGesture` gains a dependency they stop meaning the same thing, and the
failure mode then is a gesture committed halfway through an unrelated re-render.

**This commit is only safe on top of commit 1.** A teardown-commit resolves its
section against the act open at commit time, so on its own it would have traded a
lost stroke for a corrupted one. `finishGesture` asks the witness first.

The gate's third row is a **control against over-application**: mouseleave must
still commit nothing. "Call `finishGesture` from every teardown" is the wrong
rule, and that row is what would catch someone applying it.

## 3. DELETE-ABOVE-MODIFIER-GUARD

Commit `bc668532`. Five branches dispatched above a guard whose own comment
claims every modified key, and the one that DESTROYS data tested no modifier at
all. One pure module, one question per branch. Shift is deliberately not judged;
the guard never judged it either.

## Red-first evidence

Every mutation was applied on disk, shown by `git diff --stat` plus a grep of the
mutated line, and restored with `git checkout --` from a **committed** baseline.
`git status` is clean of all of them.

| # | Mutation | Rows red |
|---|---|---|
| 1 | `map-chords.ts`: `if (e.altKey) return null;` deleted | 4 (Alt+Delete, Alt+S, Ctrl+Alt+C, Ctrl+F7 rows) |
| 2 | `MapViewport.tsx`: the old raw `e.key === 'Delete'` branch put back | 2 source-scan rows |
| 3 | the scan's anchor reworded (`{ return; }`) | 3 rows, by a THROW naming the anchor, not a pass |
| 4 | `gestureStatus`: act comparison deleted | 3 |
| 5 | `gestureStatus`: the three `no-witness` floors deleted | 2 |
| 6 | `handleMouseMove` no longer asks | 1 |
| 7 | `recordPaint`'s same-run compares the index only | 1 |
| 8 | the unmount cleanup deleted | 2 |
| 9 | mouseleave made to commit (over-application control) | 1 |
| 10 | the witness ask moved after the `end*` calls | 1 |
| 11 | the reproduction's act switch removed (control) | 1 |

Mutation 3 is the one worth reading: a source scan that cannot find its anchor
must not report success. It throws with the instruction to re-anchor.

## What is TAGGED for foreground follow-up

**No live confirmation was attempted, by design** (no emulator, and no CDP run).
What that leaves unmeasured, precisely:

1. **The pointer gesture itself.** The node suite cannot mount a React
   component. Commit `f6818a4d` measures the mechanism the defect rests on
   against the real `projectStore` (after `setCurrentAct`, the held index still
   resolves and resolves a different section and object), and the source scans
   measure the wiring, but nobody has held the button down, pressed `2`, and
   watched the object stay put.
2. **The cancel notice's wording in the app.** `Cancelled a gesture in flight:
   <clause>. Nothing was written.` has never been on screen.
3. **Ctrl+Delete in the running app.** The fix is a pure table with 11 rows and a
   scan proving the branch consults it; a real key press through
   `Input.dispatchKeyEvent` would close it outright. `harness:tool-keys` is the
   nearest existing rig.

Anyone building that harness from a worktree needs BOTH `ELECTRON_BIN` and
`AURORA_BUILT_TREE`, or it silently drives the main checkout's `dist/`.

## Known residue, stated rather than left to be found

* `revertPaintStroke` calls `sectionRenderer.markDirty(stroke.sectionIndex, ...)`
  even when the section moved, so on an act switch it marks an index in the NEW
  act. `markDirty` returns early on an unknown index and otherwise only adds to a
  dirty set, so the cost is at most one redundant re-raster of art that is
  already correct. Not fixed, to keep the measured tree the tested tree.
* `bgStroke` was examined and deliberately left alone: it already witnesses
  `(source, bgRef)`, and both commands it can issue name their own target
  document, so an act switch cannot redirect them into another act's data. It
  CAN file that command on the new act's history stack. That is misfiling rather
  than corruption, it predates this parcel, and it is not fixed here.

## One correction to the sweep, and one to myself

The sweep's line numbers were **exact** at `4cf66084` (`s` at :1805, F7 at :1850,
Delete at :1869, the guard at :1923; `App.tsx:159` and `:273` likewise). I had
written a sentence claiming they had drifted and had to amend it before pushing:
the drift I measured was drift my own edit had just caused. The only coarse
citation is `App.tsx:312`, which lands on the CanvasMode block's opening comment;
the `key={canvasPane.docId}` it is pointing at is at `:332` and the sentence
naming in-flight gestures at `:327`. The claim holds.
