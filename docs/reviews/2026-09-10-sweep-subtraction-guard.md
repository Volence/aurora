# SWEEP-SUBTRACTION-GUARD: a row for the line that had none

2026-09-10. Branch `parcel/sweep-subtraction-guard`, off `33ccee18`.
Node/vitest only: no Electron, no CDP, no ROM build, no emulator, and none was
needed.

Closes the lens finding `SWEEP-SECOND-SUBTRACTION-UNGUARDED`
(`docs/lens-findings.jsonl`), raised out of
`docs/reviews/2026-09-10-resize-orphan-sweep.md`.

## The finding, restated

The stranded-section sweep in `src/core/project/aeon/save.ts` computes

```
removable = act.sectionFiles.loadedPaths
            MINUS sectionPathsWritten
            MINUS act.sectionFiles.unreadablePaths
```

and the third line is defence-in-depth. Today's loader never admits a refused
path to `loadedPaths` (`load.ts` records the refusal and drops the section), so
the refused file is already outside the removable set before the second
subtraction runs. Replacing that argument with `[]` is a one-line diff that
leaves the whole suite green, including the row named
`a section file the loader REFUSED is neither swept nor overwritten` -- because
that row passes through the LOAD side.

A line no row reddens on is a line a future refactor deletes as dead code, and
it would be deleted at exactly the moment a loader change made it load-bearing.
Precedent, cited by the finding: **O20** -- a gate resting on its neighbour is
discovered the day the neighbour moves, so every gate gets a row asserting
**its own** refusal reason.

## What was added

One row in `src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts`
(5 rows -> 6):

> `the refused subtraction is load-bearing: a loader that admitted a refused path to loadedPaths still does not get it deleted`

and one seam it needed: `resizeSaveReopen` gained an optional `afterLoad(act)`
callback that runs between the real `loadAeonProject` and the real
`buildAeonSavePlan`. Every other row leaves it undefined and is unchanged.

The row is deliberately phrased against the SUBTRACTION, not the feature. A row
phrased against the defect ("a refused file is not deleted") is the row that
already exists and it stays green with the subtraction gone.

Everything in the fixture is real except one push: the truncated `tiles.bin`
(one nametable row short, an interrupted write rather than a stub), the loader's
refusal, the 2x2 -> 3x2 resize through `resizeGrid` and `set-sections`, and the
plan builder. The injected line is the FUTURE LOADER in one statement --
`act.sectionFiles.loadedPaths.push(refusedPath)` on an act whose
`unreadablePaths` already contains it. `M4` in the previous packet reached this
state only by suspending a fixture invariant with a throwaway edit; the
injection makes that step standing.

Three assertions carry the row beyond the property itself:

* the injected state reached the plan builder (`loadedPaths` contains the
  refused path, `unreadablePaths` too). Without it, a push that failed to land
  and a property that holds are the same artifact;
* **anti-vacuity, and the reason the row discriminates**: the refused path is
  NOT in `plan.files`, because `understood()` refuses to write a file the load
  could not read. So it is not in the `keep` set either, the FIRST subtraction
  demonstrably is not what saves it, and the second subtraction is the only
  thing between that file and an unlink. If a future save ever wrote refused
  files, this assertion goes red rather than letting the row pass for the wrong
  reason;
* the sweep was live in the same save (`section_3.tiles.bin` is in
  `plan.removals`), so the row cannot pass on an empty removable set.

## Red first

Baseline committed at `8612cb03` (the row itself), tree clean, then the mutation
applied to `src/core/project/aeon/save.ts` and quoted from disk:

```
   removals.push(...removalsFor(
     act.sectionFiles.loadedPaths,
     sectionPathsWritten,
-    act.sectionFiles.unreadablePaths,
+    [], // MUTATION: the SECOND subtraction deleted
     (path) => `stranded section file ${path.slice(path.lastIndexOf('/') + 1)}`,
   ));
```

`git diff --stat` -> `src/core/project/aeon/save.ts | 2 +-`, 1 insertion,
1 deletion.

`npx vitest run src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts
src/core/project/aeon/__tests__/section-file-ledger.test.ts` ->
`Test Files 1 failed | 1 passed (2)`, `Tests 1 failed | 11 passed (12)`.

The single failure is the new row, and it fails at THE PROPERTY:

```
AssertionError: expected [ ...(2) ] to not include 'data/ojz/act1/section_2.tiles.bin'
  grid-resize-roundtrip.test.ts:371  expect(plan.removals.map(r => r.path)).not.toContain(refusedPath)
```

Read where it lands, because M4's first reading did not: this is the removal
assertion, not an earlier fixture invariant. The other 11 rows across both files
stayed GREEN under the same mutation, which is the finding reproduced on this
base.

Restored with `git checkout 8612cb03 -- src/core/project/aeon/save.ts`, from a
COMMITTED baseline rather than a dirty tree, verified by an empty
`git diff --stat`.

## Runs

Runner: `npm test` -- 14 gate scripts, then `npm run typecheck`, then
`vitest run`, chained with `&&`, so vitest running at all is proof the gates and
the typecheck passed. `vitest.config.ts` collects
`src/**/__tests__/**/*.test.ts`, which is how this file is picked up;
`scripts/check-test-collection.mjs` confirms every test-shaped file on disk is
collected.

* `npx vitest run src/core/project/aeon/__tests__/grid-resize-roundtrip.test.ts`
  -> `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
* `npm test` -> `Test Files 595 passed | 3 skipped (598)`,
  `Tests 8875 passed | 9 skipped (8884)`, **zero failed**,
  `failure-class: no failures in this run (598 module(s) reported)`. Duration
  21.94s; machine load average at launch 5.49 / 6.46 / 7.40, uptime 8h34m, so
  the wall-clock figure is not a quiet-box number.
* `npx tsc --noEmit` -> rc 0.

The 9 skips are the suite's standing opt-in rows (foreground band-art harness,
bench, live warp, the absent `s4_engine` tree, and the main-checkout-only
sibling-root row, which this linked worktree cannot measure). None was
introduced here.

## What this row does NOT prove

It proves the SUBTRACTION discriminates, not that any reachable code path
produces the state it is given. Today's `load.ts` cannot put a refused path in
`loadedPaths`; the row synthesises that state on purpose, so it is evidence
about the guard and no evidence at all about a live data-loss bug. It is also
ambiguous between the two places the same property can be deleted -- the
`unreadablePaths` argument at the call site, and the `refused` filter inside
`removalsFor` -- and goes red for either, which is correct, because they are one
rule. Finally it says nothing about the OTHER two `removalsFor` call sites (the
effects libraries); their second subtraction remains unguarded and this parcel
deliberately did not widen into them.

## For the foreground

Nothing here needs the app or the emulator. The previous packet's open
foreground item is unchanged and still worth one pass: a real Ctrl+S after a
grid resize, confirming `window.api.deleteFile` actually unlinks the stranded
`section_N.tiles.bin` and that the save summary names it. The plan is exercised
in node; the IPC delete is not.
