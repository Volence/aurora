# SUITE-SUBPROCESS-ROWS-TIME-OUT-UNDER-LOAD: measured as work, not a window

2026-09-11. Branch `parcel/suite-timeout-rows`, off `3676a447`.
Node/vitest only: no Electron, no CDP, no ROM build, no emulator.

Closes the ledger row `SUITE-SUBPROCESS-ROWS-TIME-OUT-UNDER-LOAD`
(`docs/lens-findings.jsonl`). Its last entry records that this repo was once
wrong to call these reds "a load-shaped false red, not a defect": a failure
that appears only under load can be a narrow window that load OPENS. So the
question this parcel answered FIRST was which one this is, and only then what
to change.

**The verdict, in one sentence: every row in the population spends its time
in real CPU work (a synchronous subprocess, a synchronous transpile loop, or
one module graph's first load), none of them waits on a timer, a poll, a
watcher or a race, and each now pays that work once, in a hook with a bound
derived from measurement.**

Line numbers in sections 1 to 3 are base `3676a447`'s, which is where the
ledger and the brief cite them.

## 1. The population, and what each row waits on

The two rows the brief named, plus every row in their files with the same
shape, plus the ledger's third file. Then a full-suite census (sections 3.4
and 3.5) to check nobody was missed.

### 1.1 `test/config/prose-constant-fold.test.ts`, "the real gate, over the real repo"

Three rows, four spawns of the real gate at base:

- `:177` "exits 0 today": `expect(() => run()).not.toThrow()`, one spawn.
- `:181` "has the DERIVED FG_PAGE_FRAMES in its table": `run('--table')`, one spawn.
- `:194` "says on its PASSING line that it is not full coverage": `run()` and
  `run('--blind')`, two spawns. This is the row that timed out at 5902ms.

`run` was `execFileSync('node', [GATE, ...args], { cwd: REPO, encoding: 'utf8' })`.
A synchronous spawn: the row's thread blocks until the child exits, so the row
itself cannot wait on anything else, and vitest cannot interrupt it either.

The child, `scripts/check-prose-constants.mjs`, is one straight line of
synchronous work: `execFileSync('git', ['ls-files', '--', 'src'])` (line
368), then `readFileSync` and `ts.createSourceFile` over every enumerated file
(the `parse` function, lines 262 to 283, called at line 384), then the fold
from `scripts/prose-constant-fold.mjs`, then a scan. A search for
`await|setTimeout|setInterval|setImmediate|Promise|.on(|fs.watch|Atomics`
over both files returns zero. The same pattern over
`src/renderer/workspace/__tests__/facet-modules.test.ts` returns 10, so the
query is live and the zero is real.

**Waits on: nothing. Pure CPU in a child process.**

### 1.2 `src/renderer/workspace/__tests__/facet-modules.test.ts`

Six rows `await import('../register-facets')`. Only the FIRST one to run pays:
every later import resolves from the module cache (0 to 1ms measured). At base
that was `:83` "covers all six built facets", the first row of the
`registerAeonFacetModules` describe. `register-facets.ts` imports every facet
module (`layout-facet`, `art-facet`, ... `s1-facets`) and the React surfaces
under them, so the first import costs the whole graph's transform and
evaluation.

This is the one row in the population that genuinely `await`s, so it is the
one where a window was possible. Two ways it could wait on something other
than work, both checked with a live control:

- A module in the graph with a top-level `await`. `git grep -E
  '^(export )?(const|let|var) [^=]+= await |^await '` over non-test
  `src/*.ts(x)`: 0 files. Same pathspec, `^import `: 438 files, so the query
  reaches the tree. The same regex over a three-line sample matches the two
  column-0 awaits and not the indented one.
- A facet module registering itself at import time (which would make the
  import's side effects race `facetModules.clear()`). `^registerFacetModule\(`
  or `^registerBuiltinFacets\(` over `src/renderer` and `src/core`: 0. Same
  pathspec, `^import `: 804 files.

**Waits on: vitest's module runner loading that graph, which is work (worker
evaluation plus the main process's transform queue, shared by every worker in
a full run). No timer, no event, no race.**

### 1.3 `src/renderer/components/art/__tests__/art-discard-guard.test.ts`

Not named by the brief; named by the ledger (`:518`, 5273ms at load 14.80).
The file ran every tracked source file under `src/` through
`ts.transpileModule` THREE times per run:

- `:518` §E "no window.confirm, window.alert or window.prompt anywhere":
  `files.filter((f) => /window\.(confirm|alert|prompt)\s*\(/.test(codeOf(f)))`,
  inside the row, on the 5s default.
- §F's describe body built `callers` with `codeOf(f)` over every file AT
  COLLECTION, which has no time bound at all.
- `:625` §F "every gesture that replaces the document goes through the replace
  door": `codeOf(f)` over every file again, inside the row.

All synchronous. `await|setTimeout|setInterval|Promise|async` over lines 460
to 650: zero matches. The same pattern over §C, lines 240 to 410 of the same
file: 24. A synchronous row cannot wait on anything.

**Waits on: nothing. Pure CPU in the worker.**

## 2. What discriminates work from a window here

The failure text decides it, not the machine's business. For these rows the
text was measured by the parcel that filed the ledger row, not by me:
`Error: Test timed out in 5000ms.` on all three of its reds (prose `:181` at
5246ms, prose `:194` at 6498ms, art `:518` at 5273ms, one run at load 14.80).
My own two reds (section 3.2) failed past 5000ms by DURATION; that run used
the JSON reporter alone, which keeps only a placeholder stack, so I did not
read their text. So the mode is a timeout, and the question was whether a
timeout here is slow WORK that load stretches, or a WAIT that load exposes.
Three independent measurements, and all three say work:

1. **Shape of the duration against load.** Work stretches smoothly and
   stays unimodal; a window shows a threshold, a second mode, or an occasional
   hang. Every condition below is one tight mode.
2. **CPU against wall for the gate child.** A child that waits shows wall far
   above user+sys even on a quiet box. This one shows the reverse: user CPU
   is about TWICE its wall (V8's helper threads), and under load wall grows
   while user+sys stays nearly flat.
3. **Structure.** Sections 1.1 and 1.3 are synchronous code, which cannot
   wait on anything; section 1.2 awaits only module loading.

## 3. Measurements

Every load figure is the machine's 1-minute load average (16 cores), sampled
immediately before and after the run it sits beside. Two caveats, both of
which make my created-load numbers UNDERSTATE the real condition, not
overstate it:

- The 1-minute average LAGS. A fresh set of busy loops reads low for the
  first half-minute (48 loops read 13 to 16 during a 5-second series).
- This kernel runs BORE (`cachyos-bore`), which favours a short bursty
  process over long-running loops. Synthetic loops therefore starve the gate
  less than the suite's own 16 workers do, which is why section 3.4, the real
  condition, is the one the headroom is checked against.

### 3.1 Per-row wall time at base, one file per vitest process

JSON reporter, `duration` per row, ms.

| Row | Idle, load 7.9 to 8.5 (3 runs) | Ambient, load 53.4 to 51.9, 3 files in one process |
|---|---|---|
| prose `:177` exits 0 (1 spawn) | 554, 540, 543 | 1722 |
| prose `:181` table (1 spawn) | 558, 556, 529 | 2114 |
| prose `:194` coverage (2 spawns) | 1090, 1105, 1147 | 3774 |
| facet `:83` covers all six (first import) | 610, 645, 653 | 1933 |
| art `:518` §E native dialogs (full transpile) | 966, 916, 1032 | 3108 |
| art `:625` §F replace door (full transpile) | 921, 897, 978 | 1894 |

### 3.2 Under created load at base: 16 busy loops plus ambient

Load 26.2 at the start, 54.7 at the end (the lag above).

| Row | Run 0 | Run 1 |
|---|---|---|
| prose `:177` | 2080 | 3143 |
| prose `:181` | 2376 | 2407 |
| prose `:194` | **5700 FAILED** | **5355 FAILED** |
| facet `:83` | 1803 | 1918 |
| art `:518` | 3764 | 3573 |
| art `:625` | 3593 | 4170 |

The two reds reproduce the ledger's failure on the same row. They are past the
5000ms default by duration; the JSON reporter kept only vitest's
`STACK_TRACE_ERROR` placeholder stack (pointing at the `it(` site, `:194:3`),
so their class is inferred from the duration, not read. The measured text for
this row is the ledger's (section 2).

Stretch over the idle median: `:177` 3.8 to 5.8x, `:194` 4.8 to 5.2x, facet
2.8 to 3.0x, art 3.7 to 4.5x. Smooth, one mode per row, no hang.

### 3.3 The gate child: CPU against wall

`scripts/check-prose-constants.mjs`, timed with bash's `time` builtin, seconds.

| Condition | Runs | Wall | User | Sys |
|---|---|---|---|---|
| Ambient, load 28.0 to 29.8 | 8 | 0.566 to 0.643 | 1.131 to 1.254 | 0.072 to 0.085 |
| 16 busy loops (load read 21.6, lagging) | 6 | 1.038 to 1.218 | 1.496 to 1.566 | 0.106 to 0.120 |
| 48 busy loops (load read 13.1 to 16.3, lagging) | 4 | 1.076 to 1.480 | 1.477 to 1.558 | 0.105 to 0.127 |

Wall is never above user+sys, at any load. Wall roughly doubles under load
while CPU rises only about 25% (cache and contention). That is starvation of
real work.

### 3.4 The real condition: the full suite at base, 16 workers

`npx vitest run` with the failure-class and JSON reporters, twice, 9057 tests,
0 failed, failure-class "no failures in this run (605 module(s) reported)".

| Row | Run 1, load 15.2 to 17.8 | Run 2, load 17.8 to 20.2 |
|---|---|---|
| facet `:83` | 3045 | 3026 |
| prose `:194` | 2430 | 2986 |
| art `:518` | 1888 | 2574 |
| art `:625` | 1871 | 1910 |
| prose `:177` | 1280 | 1685 |
| prose `:181` | 1383 | 1560 |

**Census, every row at or above 2000ms in either run:** the rows above, plus
`src/renderer/providers/__tests__/map-status-classic.test.ts:109` (2727ms,
run 2). That row imports the same `register-facets` graph and already carries
an explicit `20_000` from an earlier author, with its reasoning written
beside it. Nothing else in the suite reached 2000ms. The facet row's stretch
inside the suite (4.7x at load 15 to 20) is larger than under 16 busy loops
(2.9x), which fits its cost including the main process's transform queue, the
one resource all 16 workers share.

### 3.5 The tip, with the work in hooks

Every watched row now takes 0 to 26ms, in every condition below. The work
shows up as FILE time instead (hooks, collection and import together), which
is an upper bound on each hook. ms.

| Condition | prose file (hook bound 45s) | facet file (15s) | art file (20s) |
|---|---|---|---|
| One process per file, ambient load 14.8 to 20.9 (3 runs) | 4315, 3838, 2582 | 1769, 1593, 969 | 2726, 2848, 1182 |
| 16 busy loops, load read 10.3 to 16.2 (2 runs) | 3589, 3539 | 1231, 1277 | 2491, 3219 |
| Full suite, load 11.6 to 14.0 | 3586 | 1835 | 2688 |

The worst file time is under a sixth of its hook's bound: prose 4315 of 45000,
facet 1835 of 15000, art 3219 of 20000. These tip runs happened at LOWER load
than base's worst, because the box got quieter, so they show the bounds fit;
they are not a like-for-like speed comparison with base. The tip full suite:
9057 tests, 0 failed, failure-class "no failures in this run (605 module(s)
reported)".

**Census at tip, every row at or above 2000ms:** `map-status-classic.test.ts:109`
(2539ms, already bounded) and
`src/renderer/workspace/__tests__/classic-art-dock.test.ts:119` "declares both
a ToolDock and a ToolOptions" (2021ms). The second is the same shape and is
not new: it is its file's first `await import('../facets/s1-facets')`, the
classic half of the same facet graph, and it measured 413ms and 1612ms in the
two base runs. The spread across runs is which file's first import pays the
main process's transform of the shared graph that time (`map-status-classic`
moved 626, 2727, 2539 over the same three runs). NOT TOUCHED: it is outside the
population this parcel was given, and it stayed under 2.1s at every load
measured here. If it ever reddens, the answer is section 4's (a derived hook
for the first import), not a raise.

## 4. The change, per row, and the derivation

**One headroom rule for all three files.** The worst stretch MEASURED here is
5.8x (prose `:177`, 3143ms against 543ms). The worst REPORTED is at least
7.8x: facet `:83`, 645ms idle, timed out at 5000ms in the 2026-09-11 landings
at load 33 to 36, a lower bound because the timeout cut it off. A factor of
20 on the idle median is about 2.5 times that, rounded up to the next 5s.
Every bound carries the same written instruction as
`test/formats/bg-override-section-ceiling.test.ts:463`: if it is ever hit, do
not raise it; measure what changed.

| File | Before | After | Bound |
|---|---|---|---|
| prose-constant-fold | 4 spawns, one or two per row, each on 5s | 3 spawns (plain, `--table`, `--blind`) in one `beforeAll`; rows unchanged | 553ms x20 = 11.1s, so **15s per spawn** as the child's own `execFileSync` `timeout`; hook **45s** = the sum |
| facet-modules | first import paid by whichever row ran first, on 5s | `beforeAll(warmRegistry)` in each of the three describes that import the registry; rows unchanged | 645ms x20 = 12.9s, so **15s** |
| art-discard-guard | 3 full transpiles: 2 in rows on 5s, 1 at collection unbounded | 1 memoised transpile, in §E's and §F's `beforeAll`; rows read `transpiled(f)`, which throws if the pass never covered `f` | 966ms x20 = 19.3s, so **20s** on each hook |

553ms is the median of nine single-spawn times inside vitest at idle (the six
one-spawn rows of section 3.1, plus the two-spawn row's three runs halved).

Why a hook and not a bigger per-row number: the rows each paid the SAME work
(the same gate, the same transpile, the same import), so paying it once
removes cost rather than just permitting it. For the gate, three spawns now do
the work of four. For the transpile, one pass does the work of three, and the
pass that used to run at collection with NO bound now runs under one.

Three details worth keeping:

- **Nothing a row asserts changed.** In prose, `run()` returns exactly what
  `execFileSync` returned, or re-throws exactly what it threw, so the row
  bodies are byte-identical to base. In art, the rows read the same files
  through the same `codeOf`, from disk, in the same run. In facet, the rows
  still `await import` the registry; the hook only moves who pays first.
- **A hung gate now fails instead of hanging.** vitest cannot interrupt a
  synchronous call, so at base a gate that never exited blocked its worker
  forever and the 5s limit could never have fired. Each spawn now carries its
  own kill bound; a hang fails as `ETIMEDOUT`, which
  `scripts/failure-class-reporter.mjs` files as would-block. Because the hook's
  bound is the sum of the spawns' bounds, the per-spawn kill always fires
  first, so a slow gate FAILS the rows rather than skipping them. The facet and
  art hooks have no such inner bound: if one of them times out, vitest records
  a hook failure (classed TIMEOUT) and reports the rows beneath as skipped.
- **§F's `callers` had to move into the hook, not stay at collection.**
  Collection runs before any hook, so a collection-time `callers` built from
  the shared pass would have read an empty map and the allowlist row would
  have been measuring nothing. The dead-rows row would have caught that, but
  it should not have to.

Not changed, and why: `map-status-classic.test.ts:139` already bounds the same
import at `20_000`; `classic-art-dock.test.ts:119` is section 3.5's;
`dirty-tabs.test.ts` and `facet-visibility.test.ts` import the registry too and
never exceeded 6ms as whole files; the other subprocess-spawning test files
stayed under 2000ms in all three full runs.

## 5. Proof: each touched row still fails for its real reason

Each mutation was applied on disk to the code the row guards, the file was run
under the repo's failure-class reporter, and the mutation was restored from
the COMMITTED tip (`git show HEAD:<path> > <path>`, or `git checkout HEAD --`).
The tree was clean afterwards (`git status --short` empty).

| Mutation (on disk) | Rows red | Class |
|---|---|---|
| gate's pass line: `NOT FULL COVERAGE:` becomes `COVERAGE:` | prose `:194` ("expected 'check-prose-constants: 536 of 536 enu...' to contain 'NOT FULL COVERAGE'") | ASSERTION 1 |
| gate's `--table` loop filters out `FG_PAGE_FRAMES` | prose `:181` ("the derived constant is absent from the gate's table ... expected undefined to be 12") | ASSERTION 1 |
| gate's passing `process.exit(0)` becomes `process.exit(1)` | prose `:177` ASSERTION ("expected [Function] to not throw"); `:181` and `:194` re-throw execFileSync's error | ASSERTION 1, UNCLASSIFIED 2 |
| `register-facets.ts`: aeon list drops `ringsFacet` | facet `:83` ("aeon/rings: expected null not to be null"); mapOverlays row ("rings.mapOverlays: expected undefined to be true") | ASSERTION 2 |
| `register-facets.ts`: s1 list drops `s1PaletteFacet` | "serves all five" plus four sibling s1 rows (ASSERTION); "gives every classic module its OWN canvas" dereferences a null module (UNCLASSIFIED) | ASSERTION 5, UNCLASSIFIED 1 |
| `ArtBrowser.tsx` gains a function calling `window.confirm` and `closeDocument()` | art `:518` §E and `:594` §F allowlist | ASSERTION 2 |
| `aeon-open.ts` stops calling the store; `chunk-grid-aeon.ts` stops calling the replace door | art `:606` §F dead rows and `:625` §F replace door | ASSERTION 2 |

**The exit-1 control was also run against BASE** (`3676a447`'s test file, same
mutation): the identical split, `:177` ASSERTION and `:181`/`:194`
UNCLASSIFIED. So the two UNCLASSIFIED reds are not something this change
introduced: those rows always re-threw the spawn's own error, and still do.

## 6. Suite totals

| Tree | `npm test` exit | Test Files | Tests | failure-class |
|---|---|---|---|---|
| base `3676a447` (the three test files checked out from it) | 0 | 602 passed, 3 skipped (605) | 9048 passed, 9 skipped (9057) | no failures in this run (605 module(s) reported) |
| tip | 0 | 602 passed, 3 skipped (605) | 9048 passed, 9 skipped (9057) | no failures in this run (605 module(s) reported) |

`npx tsc --noEmit`: exit 0.

## 7. What the brief or the tree said that did not hold

- **The brief's scratch location refuses a landing.** It put scratch files at
  `scratchpad/suite-timeout-*`. `scratchpad/check-harness-guards.mjs` scans
  UNTRACKED `.sh` and `.mjs` files there, and my first base `npm test` exited 1
  on them: a `.sh` that dispatches a script outside `scratchpad/` is
  UNMEASURABLE ("a file this check could not classify is NOT a pass"), and a
  `.sh` whose trap covered EXIT but not INT and TERM is its hazard S5. I moved
  the instruments to the session scratchpad and the base run went green. A
  brief that puts scratch there has to say "not `.sh` or `.mjs`", or name
  another place.
- **A standing sentence argues against per-row limits.**
  `scripts/failure-class-reporter.mjs`'s header says "IT DOES NOT RAISE ANY
  LIMIT. Raising census timeouts one at a time as they bite would eventually
  license raising every census row", and `SUITE-TIMEOUTS-ASSUME-IDLE-BOX` left
  per-row work open on that warning. The later overseer entry on THIS row asks
  for exactly a derived limit. I read those as compatible, not contradictory:
  the reporter's sentence describes what the REPORTER does, and the warning is
  against raising limits as they bite, without a measurement. Each bound here
  is derived from one written rule, is paired with removing repeated work
  rather than just permitting it, and says what to do instead of raising it
  again. The overseer should rule if that reading is wrong.
- **The session's opening git snapshot was stale.** It gave master as
  `5361cd67`; the worktree was cut at `3676a447`, and master moved to
  `3d5ba0ad` during this parcel. The branch is based on `3676a447`.
- **The rest held.** The two rows the brief named do time out under load and
  pass alone (my idle 645ms and 1105ms against its 649ms and 1073ms), and the
  ledger's `art-discard-guard.test.ts:518` is the same shape.

## 8. Recipe, to re-derive any number here

Per-row wall, one file per process (run from the repo root):

```
npx vitest run <file> --reporter=json --outputFile=<out.json>
# rows: testResults[].assertionResults[].duration; file: endTime - startTime
```

Class of a red, as the repo reports it:

```
npx vitest run <file> --reporter=default --reporter=./scripts/failure-class-reporter.mjs
```

Gate child CPU against wall:

```
TIMEFORMAT='%R %U %S'; time node scripts/check-prose-constants.mjs >/dev/null
```

Created load: start K copies of `node -e 'for(;;){}' &`, record each `$!`,
trap `kill` of exactly those PIDs on EXIT, INT and TERM, wait 3s, measure,
exit. Never `pkill`. Keep the script OUT of `scratchpad/` (section 7).
