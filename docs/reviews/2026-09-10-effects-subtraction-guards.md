# SWEEP-SUBTRACTION-UNGUARDED-EFFECTS-SITES: the other two call sites

2026-09-10. Branch `parcel/effects-subtraction-guards`, off `afa43a97`.
Node/vitest only: no Electron, no CDP, no ROM build, no emulator, and none was
needed.

Closes the lens finding `SWEEP-SUBTRACTION-UNGUARDED-EFFECTS-SITES`
(`docs/lens-findings.jsonl`). Sibling of
`docs/reviews/2026-09-10-sweep-subtraction-guard.md`, which closed the same
property at the third call site an hour earlier.

## The finding, restated

`buildAeonSavePlan` in `src/core/project/aeon/save.ts` calls `removalsFor`
three times, and each call passes a set of unreadable paths as the third
argument:

```
removable = <library>.loadedPaths
            MINUS <paths this plan writes>
            MINUS <paths the loader REFUSED>
```

The third line is defence-in-depth. Today's loaders never admit a refused path
to `loadedPaths` — `loadEffectsSceneLibrary` and `loadEffectsPresetLibrary`
both push to `unreadable` in the `catch` and to `loadedPaths` only in the `try`
— so the refused file is already outside the removable set before the second
subtraction runs.

That is what makes it deletable, and it was established by DELETION rather than
inferred: the overseer replaced `[...unreadableScenePaths]` and
`[...unreadablePresetPaths]` with `[]` on the merged tree at `bb5d3548`, both
lines quoted back from disk, and `npx vitest run` stayed at 595 files passed /
3 skipped, 8876 tests passed / 8 skipped, ZERO failed, at load 12.11.

A line no row reddens on is a line a future refactor deletes as dead code, and
it would be deleted at exactly the moment a loader change made it load-bearing.
Precedent, cited by the finding: **O20** — a gate resting on its neighbour is
discovered the day the neighbour moves, so every gate gets a row asserting
**its own** refusal reason.

## What was added

Two rows in `src/core/project/aeon/__tests__/save-removals.test.ts`
(15 rows -> 17), in one new `describe`:

> `the refused subtraction is load-bearing at the effects call sites`
> * `SCENES: a loader that admitted a refused path to loadedPaths still does not get it deleted`
> * `RASTER PRESETS: a loader that admitted a refused path to loadedPaths still does not get it deleted`

**Nothing in `save.ts` changed.** It is byte-identical to master
(`git diff master -- src/core/project/aeon/save.ts` is empty).

### No seam was needed, and that is a difference from the sibling parcel

The section-file row needed `resizeSaveReopen` to grow an optional
`afterLoad(act)` callback, because its future-loader state lives on
`act.sectionFiles` behind a helper that owned the whole load→plan sequence.
These two libraries hang off `project`, which `buildAeonSavePlan` takes
directly as an argument, and `save-removals.test.ts` already calls
`loadAeonProject` and `buildAeonSavePlan` as two separate steps with the model
in hand between them — five of its existing rows already mutate
`r.project.effectsScenes` in exactly that gap. So the future-loader state is
one statement in the test body and no production path was touched at all. The
two sites did not need different seams; they needed no seam.

### The rows are phrased against the SUBTRACTION, not the feature

`save-removals.test.ts` already carries
`keeps a file it could NOT parse out of loadedPaths: the loader will not overwrite it and the save must not delete it either`
and `removalsFor: ... refuses a path that is unreadable EVEN IF it also appears as known`.
Neither covers this:

* the first passes through the LOAD side and stays green with either call-site
  argument gone;
* the second is a direct unit call on `removalsFor` with the same path in
  `known` and `unreadable`. It reddens if the `refused` filter INSIDE
  `removalsFor` is deleted, but it never touches a call site, so both measured
  mutations leave it green.

What discriminates is the FUTURE-LOADER state: a refused path deliberately
present in `loadedPaths` on a library whose `unreadable` already contains it.
Each row asserts the premise first (the loader really refused the file, and
really kept it out of `loadedPaths`), then injects that state in one statement,
then builds the real plan.

The fixture is real except that one push. Both broken documents are TRUNCATIONS
of the file's own real `sceneDoc` / `presetDoc` — an interrupted write rather
than a stub — cut at `Math.floor(len * 0.6)`, and the loader's refusal is
asserted rather than assumed, so a truncation that happened to still parse
would redden the row rather than pass it.

### Three anti-vacuity assertions each

Copied in intent from the section-file row:

* **the injection reached the plan builder** — `loadedPaths` contains the
  refused path and `unreadable` does too, read back off `r.project` after the
  plan is built. Without it, a push that failed to land and a property that
  holds are the same artifact;
* **the refused path is NOT in `plan.files`** — so it is not in the `keep` set
  either, the FIRST subtraction demonstrably is not what saves it, and the
  second subtraction is the only thing between that file and an unlink. If a
  future save ever wrote refused documents, this assertion goes red rather than
  letting the row pass for the wrong reason;
* **a genuinely removable document IS removed in the same save** —
  `victim.json` / `victim_p.json` are dropped from their libraries in the same
  fixture, so neither row can pass on an empty removable set.

## Red first, ONE SITE AT A TIME

Baseline committed at `401b47f4` (the two rows), tree clean and verified with an
empty `git status --short` before each mutation. The two sites were mutated
**independently**, because a single run with both deleted would prove the pair
while leaving open which row guards which site.

### Mutation 1 — the SCENE site alone

Applied, then quoted back from disk:

```
   removals.push(...removalsFor(
-    project.effectsScenes.loadedPaths, scenePathsKept, [...unreadableScenePaths],
+    project.effectsScenes.loadedPaths, scenePathsKept, [], // MUTATION: scene-site second subtraction deleted
     p => `scene ${JSON.stringify(p.slice(p.lastIndexOf('/') + 1).replace(/\.json$/, ''))}`,
   ));
```

The preset site was quoted in the same command and was INTACT.
`git diff --stat` -> `src/core/project/aeon/save.ts | 2 +-`, 1 insertion,
1 deletion.

`npx vitest run src/core/project/aeon/__tests__/save-removals.test.ts` ->
`Tests 1 failed | 16 passed (17)`. The single failure is the SCENES row, and it
fails at THE PROPERTY:

```
AssertionError: expected [ ...(2) ] to not include 'data/editor/effects/broken.json'
  save-removals.test.ts:312  expect(plan.removals.map((x) => x.path)).not.toContain(refusedPath)
```

Read where it lands: line 312 is the removal assertion, reached only after the
two anti-vacuity assertions above it passed — not an earlier fixture invariant.
**The RASTER PRESETS row stayed GREEN**, which is what proves the rows are
site-independent.

Restored with `git checkout 401b47f4 -- src/core/project/aeon/save.ts`, from a
COMMITTED baseline rather than a dirty tree, verified by an empty
`git diff --stat`.

### Mutation 2 — the RASTER PRESET site alone

```
   removals.push(...removalsFor(
-    project.effectsPresets.loadedPaths, presetPathsKept, [...unreadablePresetPaths],
+    project.effectsPresets.loadedPaths, presetPathsKept, [], // MUTATION: preset-site second subtraction deleted
     p => `raster preset ${JSON.stringify(p.slice(p.lastIndexOf('/') + 1).replace(/\.json$/, ''))}`,
   ));
```

The scene site was quoted in the same command and was INTACT.
`git diff --stat` -> 1 insertion, 1 deletion.

`Tests 1 failed | 16 passed (17)`. The single failure is the RASTER PRESETS row:

```
AssertionError: expected [ ...(2) ] to not include 'data/editor/effects/presets/broken_p...'
  save-removals.test.ts:335  expect(plan.removals.map((x) => x.path)).not.toContain(refusedPath)
```

Line 335, again the property assertion, again reached past lines 333 and 334
(the `plan.files` and the `victim_p` removal assertions), which both passed.
**The SCENES row stayed GREEN.**

Restored the same way; `git diff master -- src/core/project/aeon/save.ts` is
empty, so `save.ts` is byte-identical to master.

## Runs

Runner: `npm test` — 15 gate scripts, then `npm run typecheck`, then
`vitest run`, chained with `&&`, so vitest running at all is proof the gates and
the typecheck passed. `vitest.config.ts` collects
`src/**/__tests__/**/*.test.ts`, which is how this file is picked up;
`scripts/check-test-collection.mjs` confirms every test-shaped file on disk is
collected.

* `npx vitest run src/core/project/aeon/__tests__/save-removals.test.ts`
  -> `Test Files 1 passed (1)`, `Tests 17 passed (17)`.
* `npm test` -> `Test Files 595 passed | 3 skipped (598)`,
  `Tests 8877 passed | 9 skipped (8886)`, **zero failed**,
  `failure-class: no failures in this run (598 module(s) reported)`,
  `skip-report: OK. Every skip named its reason.` Duration 27.24s; machine load
  average at launch 25.85 / 16.15 / 12.32, so the wall-clock figure is not a
  quiet-box number — this box is shared and load ran between 8 and 26 through
  the parcel.

### One flake seen, not mine, and NOT fully diagnosed

The `npm test` run made immediately after the packet and ledger were written
came back `Test Files 1 failed | 594 passed | 3 skipped`, `Tests 1 failed |
8876 passed`. The single failure was
`test/config/prose-constant-fold.test.ts > the real gate, over the real repo >
says on its PASSING line that it is not full coverage, with both counts`, at
load 22.69 and a 43.92s duration (against 27.24s for the green run).

What is established:

* it is NOT caused by this parcel's content. The very next `npm test`, on the
  BYTE-IDENTICAL tree with the packet and the ledger line both present, came
  back 595 passed / 8877 passed / **zero failed** at a HIGHER load (31.46).
  Same files, green — so the "my docs added a foldable constant" hypothesis is
  refuted, not merely doubted;
* the file passes alone: `npx vitest run test/config/prose-constant-fold.test.ts`
  -> `Tests 18 passed (18)`;
* the mechanism it is exposed to: that row shells out with `execFileSync` to
  run the real gate as a node subprocess, which takes **2441ms even on an
  otherwise idle run**, and `vitest.config.ts` sets no `testTimeout`, so the
  budget is vitest's default 5000ms. Roughly 2.5s of headroom for a subprocess,
  on a box running the rest of the suite in parallel at load 22+.

⚠ What is NOT established: **I did not capture the failure text, so I cannot
say the mode was a TIMEOUT rather than an ASSERTION.** The timing above is a
mechanism it is consistent with, not a measurement of that run. Recorded as a
LEAD for the overseer — a thin-headroom `execFileSync` row on the default
timeout is worth an explicit `testTimeout` — and deliberately not written up as
a finding I proved.

The 8877 is exactly the sibling parcel's 8875 plus these two rows. The 9 skips
are the suite's standing opt-in rows (foreground band-art harness, bench, live
warp, the absent `s4_engine` tree, and the main-checkout-only sibling-root row,
which this linked worktree cannot measure). None was introduced here.

## What these rows do NOT prove

* They prove the SUBTRACTION discriminates, not that any reachable code path
  produces the state they are given. Today neither loader can put a refused
  path in `loadedPaths`; the rows synthesise that state on purpose, so this is
  evidence about the guard and **no evidence at all about a live data-loss
  bug**.
* Each row is **ambiguous between two places the same rule can be deleted** —
  its own call site's third argument, and the `refused` filter inside
  `removalsFor` — and goes red for either. That is correct, because they are
  one rule; but it means a red row does not by itself say which of the two
  moved. It is NOT ambiguous between the three call sites: mutation 1 reddened
  only the scene row and mutation 2 only the preset row, measured separately.
* They judge the PLAN, not the file system. This file's own banner says so:
  the claim "the byte on disk actually went away" is out of reach here and is
  made by the CDP harness `npm run harness:deleted-scene-returns`. A refused
  file's survival is asserted as its absence from `plan.removals`; nothing here
  watches an `unlink`.
* They say nothing about the WRITE-side refusal at the same two sites — the
  throw when a scene or preset id would land on an unreadable file. That is a
  different guard. The SCENE half of it has a row
  (`aeon-effects-scenes.test.ts:287`, `rejects.toThrow(/broken\.json exists and
  could not be read/)`). For the PRESET half I found no equivalent: the preset
  `rejects.toThrow` rows I located are in
  `agent-handler.effects-preset.test.ts` and assert the AGENT tool's refusal,
  not `buildAeonSavePlan`'s. ⚠ That is a grep, not a census, and I did NOT
  establish it by deleting the throw — so it is a LEAD for the overseer and not
  a finding. It was out of this parcel's scope and I did not widen into it.

With this parcel, all three `removalsFor` call sites in `save.ts` now have a
row that reddens when their own second subtraction is deleted. There is no
fourth site.

## For the foreground

Nothing here needs the app or the emulator. The sibling packet's open
foreground item is unchanged and still worth one pass: a real Ctrl+S after a
grid resize, confirming `window.api.deleteFile` actually unlinks the stranded
`section_N.tiles.bin` and that the save summary names it. The equivalent for
these two libraries is already covered by `harness:deleted-scene-returns`.
