# ROWREMAP-STALE-ROWS-AND-CAPTURES: three rows asking for a contract the app left on purpose, and two rigs that rewrote their own evidence

Parcel size S, branch `fix/rowremap-stale-rows-and-captures`, cut from origin/master `ebf9f464`
(the SHA the brief named; `git rev-parse origin/master` agreed). The open tail of ROADMAP row 172
and of `docs/reviews/2026-09-13-rigs-dead-needle-leftovers.md` ("Stopped on, and left open"):
`rowremap-author` `[6b]` `[6c]` `[7b]` red on every run, plus a second defect the brief added. Both
rigs wrote their screenshots, and one of them its saved scene document, into their COMMITTED
capture directories on every run.

**In one paragraph.** The three rows were not broken selectors. Each held a typed literal of a fact
the app then changed on purpose. `[6b]`/`[6c]` wanted five height options, one marked "builds
today", and a "does NOT BUILD" warning at the extreme; `208ef48b` re-vendored the contract to
`height_shift: enum [4]`, where the enum IS the buildable set, so the picker offers one option and
marks nothing. `[7b]` wanted a "ramps DOWNWARD" warning; `f432e4e6` withdrew it after aeon refuted
the direction, and replaced it with `curveRateAdvisory`, a per-line shear rate in both directions.
Following `docs/reviews/2026-09-06-rowremap-three-red.md` §1, each row now asserts the current
contract, with the expectation DERIVED from source, never typed. `[7b]` now shows the advisory
present in both directions and absent below its bar, across a pair of states that differ only in
band span. Each rewritten row, and `[9h]`, went red under its own mutation. The rig goes from
**32/35** to **35/35** (three runs). A normal run of either rig now writes into a per-run temp
directory named on a `captures:` line, and `SHOTS=<the committed dir>` is the explicit refresh.
The baseline runs dirtied 9 tracked PNGs each; the final runs dirtied none. No file under `src/`
is changed by this branch.

## The three rows: what they asserted, why it was false, what they assert now

### `[6b]` and `[6c]`: the height picker

| | before (`ebf9f464`) | why it was false | now |
|---|---|---|---|
| `[6b]` | driving the picker to its LAST option writes the shift verbatim **and** the screen says `does NOT BUILD` | there is no extreme: `enum [4]` admits one value, and the "TODAY ONLY 4 BUILDS" clause that fed the warning is gone from the description, so `rowRemapBuildableToday` returns null for every shift | the picker's option VALUES are exactly the set the vendored schema admits; each label names the lines (`1 << shift`) and the shift; driving the last option writes that shift; the unbuildable warning is on screen **iff** the contract names a buildable rung and the driven value is another |
| `[6c]` | exactly ONE option marked `builds today`, and exactly FIVE options | five options was `minimum 3 / maximum 7` (empyrean `60d9f6a`); the mark was the clause's | the marked options are exactly the rungs the clause names (none today), and the offered count equals the admitted count |

**Where the expectation comes from** (`ORACLE.height` in `scratchpad/rowremap-author-harness.mjs`):
- **the admitted set** is read from `src/core/formats/effects/aurora-effects-scene.schema.json`, at the
  `rowRemap` `oneOf` branch that carries `plane_y` (the same branch `scene-ui.ts` finds with
  `oneOfBranchWith`), by the **rig's own** reader of the three shapes JSON Schema bounds an integer
  with: `enum`, `const`, `minimum`/`maximum`. It is **not** `admittedIntegers` from `scene-ui.ts`,
  because that is the app's own reading of this node, and the row checks the app against the contract.
- **the buildable rung** is the contract's `TODAY ONLY (\d+) BUILDS` clause, or null when the clause is absent;
- **the two needles** are parsed out of the composers, each required to match exactly once or the run
  throws: the suffix `buildsSuffix: '…'` from `src/renderer/providers/effects-aeon.ts`, and the
  phrase `does NOT BUILD` from `rowRemapBuildableToday` in `src/core/formats/effects/scene-ui.ts`.

What the rows print today (final run 1):

```
NOTE oracle: height_shift  …schema.json admits [4] (enum [4]); TODAY ONLY clause: ABSENT;
                           mark needle "(builds today)"; warning needle "does NOT BUILD"
PASS [6b] offered values ["4"] vs admitted ["4"] … labels ["16 lines (shift 4)"] name the lines
          (1 << shift) and the shift: true · last option … -> document height_shift = 4 ·
          "does NOT BUILD" on screen: false, owed: false (TODAY ONLY clause: absent)
PASS [6c] 1 option(s) offered for 1 admitted; marked with "(builds today)": [], owed []
```

⚠ **What the drive cannot show today, said in the row.** With one admitted value, the seed (`[6a]`)
already holds it, so "drive the last option" cannot move the document. The verbatim-shift half is
carried by the option VALUES (M1 below: a picker whose values are line counts offers `"16"`) and by
`[9c]` on disk.

### `[7b]`: the curve advisory

**Before:** `/ramps DOWNWARD/.test(body.innerText) && /garbl/i.test(…)` with the curve driven down.
**Why false:** aeon refuted the direction on 2026-09-06 (`92663a53`), and `f432e4e6` removed
`curveDescendingAdvisory` on purpose. **Now:** the advisory under the curve row appears exactly when
the band's per-line shear rate at the act's furthest camera x reaches the bar, in **both**
directions, and it is absent below the bar.

**Where the verdict comes from** (`ORACLE.curve`, computed per state, never read off the app):

| quantity | derivation |
|---|---|
| the bar | min over the garbled arms of `CURVE_RATE_ARMS` (`curve-rate.ts`, the two transcribed numbers) of `excursion / (CURVE_RATE_ARM_SPAN_LINES - 1)`, the rig's own `rate_mean` (aeon `tools/depth_onset_probe.py`), **written in the rig, not imported**, so an app that changed its divisor disagrees with it = **1.5830** (353 / 223) |
| excursion | `|decodeFactorScroll(maxCamX, fb) - decodeFactorScroll(maxCamX, to)|`, the engine decode from `factor-decode.ts` |
| span | off the document the app holds: on a LOCKED scene (`v_factor` equal to the schema's `N is the LOCK SENTINEL`, 15) with `v_offset` 0, next top minus this top, tops clamped to `SCREEN_HEIGHT` |
| maxCamX | `__dbg.aeon.state().gridWidth x SECTION_PIXEL_SIZE - SCREEN_WIDTH`, aeon's camera clamp, the range `curveRateAdvisory` documents it reads = 3 x 2048 - 320 = **5824** |

These are bundled from the tree under test with esbuild, the `loadOracle` pattern of
`switch-window-onscreen-harness.mjs`.

**Present** means ONE rendered block under the curve row carrying the rate (2 dp), the camera x,
and the bar (2 dp). **Absent** means the row's standing hint (`curveRowHint`, always rendered) alone.
The blocks are the siblings of the curve picker's `Field` row, up to the next row holding a control,
**scoped to that row**, so another card's warning cannot answer for this one.

**The four states** (final run 1, identical in all three finals):

```
A descending: FACTOR_1_8 -> FACTOR_1_16 over 64 lines, excursion 364 px at camera x 5824,
  rate 5.7778 vs bar 1.5830 -> OWED present, SAW present
B ascending, the saved shape: FACTOR_1_8 -> FACTOR_1_2 over 64 lines, excursion 2184 px,
  rate 34.6667 -> OWED present, SAW present
C descending, the same band: FACTOR_1_16 -> FACTOR_1_32 over 64 lines, excursion 182 px,
  rate 2.8889 -> OWED present, SAW present
D C's curve, the band grown: FACTOR_1_16 -> FACTOR_1_32 over 128 lines, excursion 182 px,
  rate 1.4331 -> OWED absent, SAW absent
```

**C and D differ only in span**, so they are the pair that crosses the bar: the advisory's own
remedy ("spread the same ramp over a taller band"), driven. A and B are one in each direction,
both above the bar.

⚠ **Why the probe had to touch more than the curve.** At the authored 64-line band, no named factor
paired with `fb FACTOR_1_8` falls below the bar at camera x 5824. The nearest factors are a
sixteenth away (`FACTOR_1_16`, `FACTOR_3_16`), which is 364 px of excursion, 5.78 px/line. Even a
band as tall as the screen would need a 230-line span. So the probe also moves `fb` to `FACTOR_1_16`,
the curve to `FACTOR_1_32` (a thirty-second apart, 182 px), and the next strip's top to
`SCREEN_HEIGHT`. It undoes all three through the same controls, and `[7c]` now asserts the whole
document equals the one before `[7a]` (canonical key order). Before this change `[7c]` checked only
the curve.

**Loud when it cannot measure:** if the derivation stops putting a state on each side of the bar,
or stops putting one of each direction above it, `[7b]` is `UNMEASURED` (non-zero exit), never a pass.

## Red-first: each mutation on disk, then its red

Every mutation came after the rig commit `07618f93`. Each was shown with `git diff --stat` and the
mutated line, rebuilt with `VITE_AURORA_DEBUG=1 npx electron-vite build` (a fresh stamp each time),
confirmed in the bundle by grep, run, and restored with `git restore --source=HEAD -- <path>`, with
porcelain then read back empty. Each run's `root:`/`pinned:` named this worktree.

| id | row | the mutation (on disk) | build stamp (UTC) | result |
|---|---|---|---|---|
| M1 | `[6b]` | `EffectsScenePanel.tsx \| 2 +-`, line 1259: `<option key={o.shift} value={String(o.lines)}>` (the unit hazard) | 16:10:47Z | **`[6b]` RED**: `offered values ["16"] vs admitted ["4"]` and `document height_shift = 16`. 25/30, also red: `[6d]` `[6f]` `[9b]` `[9g]`, `[9c]` unmeasured (the document with shift 16 fails the schema and the save refuses it). `[6c]` stayed green, correctly |
| M2 | `[6c]` | `effects-aeon.ts \| 2 +-`, line 540: `+ (buildsToday ? LAYER_ROW_REMAP_ROW.buildsSuffix : '')` (the `&& named` dropped) | 16:11:50Z | **`[6c]` alone RED**, 34/35: `marked with "(builds today)": ["4"], owed []`. `[6b]` green |
| M3 | `[7b]`, present half | `effects-aeon.ts \| 2 ++`, lines 941-942: `if (plantM3(to) > plantM3(layer.fb)) return null; // PLANT M3: only a DESCENDING ramp warns` (the retired premise) | 16:13:28Z | **`[7b]` alone RED**, 34/35: `B ascending … OWED present, SAW absent`. A, C, D unchanged |
| M4 | `[7b]`, absent half | `effects-aeon.ts \| 2 +-`, line 1007: `if (rateAtMax === null) return null; // PLANT M4: the bar comparison dropped, so every curve warns` | 16:14:37Z | **`[7b]` alone RED**, 34/35: `D … rate 1.4331 vs bar 1.5830 -> OWED absent, SAW present`. A, B, C unchanged |
| M5 | `[9h]` | `scene.ts \| 2 +-`, line 653: `canonicalJsonPretty(…).replace(/\n( +)/g, '\n$1$1'); // PLANT M5` | 16:15:48Z | **`[9h]` alone RED**, 34/35: `727 B now vs 561 B in the committed capture (git show HEAD:docs/captures/2026-09-05-rowremap/aurora_rowremap_waterline.json, HEAD 07618f93)` |

M3 and M4 are each blind to the other's poison: M3 leaves D absent, and M4 leaves B present. So
`[7b]` has a red for each half, and neither half passes on an empty screen or on an always-on one.
The clean rebuild after M5 is stamped **16:16:41Z**. The bundle greps for every plant string
(`plantM3`, `PLANT M`, the M5 replace) came back empty, and every final run used that build.

## The captures

**Found:** `rowremap-author` wrote `SHOTS = join(ROOT, 'docs/captures/2026-09-05-rowremap')`: nine
screenshots, the saved scene JSON and `section_2.meta.json` on every run. `scene-anchor-writer`
wrote nine screenshots into `docs/captures/2026-09-05-scene-anchor-writer/`. Measured on
`ebf9f464`: each baseline run left **9 tracked PNGs modified** in `git status`. The two JSON writes
did not show, only because their bytes were identical.

**Was there already a convention? Partly, and it was reused.** A census of every `process.env.*`
name in `scratchpad/`, taken with a pattern that did find a known positive (`SHOTS`), turned up
`SHOTS` in four rigs, in two meanings:
- a PATH in `capture-harness.mjs` and `effects-cold-read-harness.mjs` (`process.env.SHOTS ?? <dir>`);
- an on/off FLAG in `marquee-flip-button-harness.mjs` and `collision-mark-normal-harness.mjs` (`SHOTS === '1'`).

It also found `OUT`, `RUN_TAG`, `EMIT_DIR` and `KEEP_COPY`, none of which switches between a temp
directory and the committed one. No rig had "temp by default, opt in to the committed tree". So the
overseer's grep was right that no such switch existed, but not that nothing controlled capture
output.

**The change:** new `scratchpad/lib/capture-dir.mjs`, used by both rigs:
- `SHOTS` unset: a fresh `mkdtemp` under the OS temp dir, announced as
  `captures: /tmp/aurora-rowremap-author-XXXXXX (a per-run temp dir; the committed captures in … are NOT touched. Set SHOTS=<abs> to refresh them.)`
- `SHOTS=<absolute dir>`: that directory. Naming the rig's committed capture directory is the
  opt-in, and the line says `SHOTS NAMES THE COMMITTED CAPTURES: this run REWRITES tracked evidence`.
- a relative `SHOTS` is **refused**, because `SHOTS=1` from the flag rigs would otherwise write the
  run into a directory called `1` in the working tree.

**`[9h]` still compares against the committed bytes.** It reads `git show HEAD:<capture>` through
`committedBytes()` and no longer reads the working copy, so an opt-in refresh cannot compare a run
with its own output. It writes this run's copy into the run's directory afterwards. M5 above shows
it can still go red.

**Measured:**
- **Every default run left porcelain `[]`**: after1, and the six finals, on both rigs. They wrote
  somewhere, and the positive control shows where: after1's temp dirs held 9 PNGs + the 561 B scene
  + the meta (rowremap), and 9 PNGs (scene-anchor-writer).
- **The opt-in** (`SHOTS=<worktree>/docs/captures/2026-09-05-rowremap`) printed the capitals line,
  went 35/35, left the 9 PNGs modified, and `[9h]` still read `561 B … (git show HEAD:…)`. Those
  files were **restored from `HEAD`, not committed**, so the committed captures are unrefreshed.
- **`SHOTS=1`**: `HARNESS ERROR: REFUSING: SHOTS="1" is not an absolute path…`, exit 1, before any
  app launched, porcelain `[]`.

## Runs

Runner: `npm run harness:<name>` through a session-scratchpad wrapper (not committed). The wrapper
extracts a **fresh `git archive` of aeon `96a98abd0a6c34200141b6648ab6c75b2f2c62f5`** (aeon
`origin/master`) per run into the session scratchpad, and deletes it after. It sets
`ELECTRON_BIN=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron`,
`AURORA_BUILT_TREE=<this worktree>` and `AEON_DIR=<that copy>`, and logs app `HEAD`, porcelain
before and after, `dist/build-flavour.json` (`flavour: debug` in every run), `uptime` before and
after, and the exit code. Every log's `root:` and `pinned:` lines named
`/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a97fbe04da2ca8806`. Every rect print said
**dpr=1**. The `SHOTS=1` run launched nothing, so it has none. All runs were foreground and
sequential, and no claim is assembled from two runs. Load is the 1-minute average; times are -0400.

| run | wall clock | load | app HEAD | stamp (UTC) | rig | result |
|---|---|---|---|---|---|---|
| baseline | 11:54:37 to 11:55:04 | 3.44 to 2.81 | `ebf9f464`, porcelain `[]` | 15:53:59Z | rowremap-author | **32/35**, FAIL `[6b]` `[6c]` `[7b]`; after: 9 PNGs modified |
| baseline | 11:55:20 to 11:55:45 | 2.84 to 4.33 | `ebf9f464`, porcelain `[]` | 15:53:59Z | scene-anchor-writer | **34/34**; after: 9 PNGs modified |
| after1 | 12:08:35 to 12:09:06 | 4.59 to 8.80 | `07618f93`, `[]` | 15:53:59Z | rowremap-author | 35/35, after `[]` |
| after1 | 12:09:52 to 12:10:18 | 17.07 to 19.93 | `07618f93`, `[]` | 15:53:59Z | scene-anchor-writer | 34/34, after `[]` |
| M1 | 12:10:51 to 12:11:21 | 18.90 to 14.97 | `07618f93` + M1 | 16:10:47Z | rowremap-author | 25/30, `[6b]` red (+ 4 downstream, 1 unmeasured) |
| M2 | 12:11:57 to 12:12:28 | 12.15 to 8.92 | `07618f93` + M2 | 16:11:50Z | rowremap-author | 34/35, `[6c]` red |
| M3 | 12:13:34 to 12:14:04 | 5.39 to 4.52 | `07618f93` + M3 | 16:13:28Z | rowremap-author | 34/35, `[7b]` red (B) |
| M4 | 12:14:43 to 12:15:13 | 3.65 to 3.22 | `07618f93` + M4 | 16:14:37Z | rowremap-author | 34/35, `[7b]` red (D) |
| M5 | 12:15:58 to 12:16:27 | 2.93 to 2.56 | `07618f93` + M5 | 16:15:48Z | rowremap-author | 34/35, `[9h]` red |
| opt-in | 12:16:59 to 12:17:28 | 2.06 to 2.06 | `07618f93`, `[]` | 16:16:41Z | rowremap-author, `SHOTS`=committed | 35/35; after: 9 PNGs modified (restored from `HEAD`) |
| `SHOTS=1` | 12:17:39 to 12:17:39 | 3.90 | `07618f93`, `[]` | 16:16:41Z | rowremap-author | HARNESS ERROR (refusal), exit 1, after `[]` |
| **final 1** | 12:18:00 to 12:18:30 | 7.47 to 5.54 | `07618f93`, `[]` | 16:16:41Z | rowremap-author | **35/35**, exit 0, after `[]` |
| **final 2** | 12:18:30 to 12:19:00 | 5.54 to 5.89 | `07618f93`, `[]` | 16:16:41Z | rowremap-author | **35/35**, exit 0, after `[]` |
| **final 3** | 12:19:00 to 12:19:30 | 5.89 to 6.66 | `07618f93`, `[]` | 16:16:41Z | rowremap-author | **35/35**, exit 0, after `[]` |
| **final 1** | 12:19:30 to 12:19:55 | 6.66 to 5.82 | `07618f93`, `[]` | 16:16:41Z | scene-anchor-writer | **34/34**, exit 0, after `[]` |
| **final 2** | 12:19:55 to 12:20:20 | 5.82 to 5.12 | `07618f93`, `[]` | 16:16:41Z | scene-anchor-writer | **34/34**, exit 0, after `[]` |
| **final 3** | 12:20:20 to 12:20:45 | 5.12 to 5.82 | `07618f93`, `[]` | 16:16:41Z | scene-anchor-writer | **34/34**, exit 0, after `[]` |

The finals ran on `07618f93`, the last commit that changes a rig or a lib. Commits after it change
only `docs/`.

## Gates

`check-harness-guards`: `283 clean / 284 classified … 0 failure(s)` with `scratchpad/lib/capture-dir.mjs`
on disk. `test/harness-effects-selectors.test.ts` (the gate that reads both rigs): 7/7.

**The whole node suite**, `VITEST_MAX_WORKERS=4 npm test`, foreground, on `07618f93` (12:21:00 to
12:21:54, load 6.53 to 8.35), exit 0:

```
 Test Files  618 passed | 3 skipped (621)
      Tests  9603 passed | 9 skipped (9612)
failure-class: no failures in this run (621 module(s) reported).
```

And again with this packet and the ROADMAP row on disk, not yet committed (12:26:09 to 12:27:03,
load 5.46 to 8.03), exit 0, the same totals, `skip-report: OK. Every skip named its reason.`,
`check-cited-paths: OK` and `check-doc-citations: OK, every path cited by a document line written
since 2026-09-06T00:39:36Z is tracked`. The only bytes changed after that run are this paragraph
and the matching clause in the row.

## Left open

- **`[6d]` passes on a dormant half.** Its name says "choosing the marked option clears that warning -
  the row tracks the state". Under `enum [4]` no option is marked and no legal state raises the
  warning, so it drives nothing and measures only "no unbuildable warning is on screen". It now
  **prints that** in its detail. It will exercise its other half again the day the clause returns.
  Not rewritten: it is outside the three rows the brief named, and its assertion is not false.
- **The literal `4` in `[6a]`, `[6d]`, `[6f]` and `[9c]`** is the one admitted shift. On an
  amendment those rows go red loudly rather than follow; left as they are, for the same reason.
- **Sixteen other rig files NAME a `docs/captures/` path** (a grep for the string, not a reading of
  what each does with it): `cdp-sweep-0911`, `cdp-sweep-2-0911`, `cdp-sweep-4-0912`, `coldread-c1`,
  `coldread-db`, `coldread-fixes`, `effects-cold-read`, `f7-frame-09`, `floor-curve-end`,
  `layer-dsa-dsb`, `plane-y-referent-capture`, `sec7-drop-vsplit`, `sec7-fa-fix`, `sec7-ui-reauthor`,
  `sec7-worldwater`, `switch-window-onscreen`. `handover-band-harness`, booked on 2026-09-03,
  rewrites the tracked `scratchpad/handover/shots/`. **Not measured** which of the sixteen write
  there by default, which rewrite TRACKED files, and which only read a capture or add run-tagged
  ones. `lib/capture-dir.mjs` is there for any of them that do.
- **Temp capture directories are never deleted** by the rigs; they accumulate under the OS temp
  dir, as the evidence of the run that named them.
- **`check-harness-guards` lists `scratchpad/preset-schema-key-probe.mjs` as "UNGUARDED BUT
  UNTRACKED"**, and the file is tracked (`git ls-files --error-unmatch` exit 0, last touched by
  `423f3bb3`). The misreport predates this branch; not investigated.
- **`window.__dbg.aeon.open` still answers `Promise was collected`**; out of scope, not investigated.
- **The bar follows `curve-rate.ts`.** If aeon's bracket moves, `test/formats/aeon-curve-rate-drift.test.ts`
  is what notices; this rig moves only when `curve-rate.ts` is re-transcribed.
- **No emulator was touched.** Every claim is about a DOM control, the document the app holds, a
  file the app wrote, or a source line.

## For the overseer to ratify

1. **`SHOTS` reused with its PATH meaning**, rather than a new variable, and a relative value
   refused so the `SHOTS=1` flag rigs cannot write into the tree. The refresh opt-in is naming the
   committed directory explicitly; there is no boolean.
2. **The temp dir is under the OS temp dir**, not the repo's `scratchpad/`, and it is never cleaned.
3. **`[7b]`'s probe drives two controls beyond the curve** (the strip's `fb` and the next strip's
   top) to reach a state below the bar, and **`[7c]` was widened** to whole-document equality to
   cover them. Without them no state is below the bar at this act's camera range.
4. **`[7b]` is scoped to the curve row's sibling blocks**, found through `Field`'s label SPAN, and
   "absent" is exactly one block. A future always-on note under that row would read as a red
   `other`, loudly, not as a pass.
5. **The oracle imports the engine decode and the two transcribed arms from the tree under test**,
   through esbuild, and writes the rate formula and the admitted-set reader itself. An app that
   changes `decodeFactorScroll` moves the rig with it; the drift and decode suites own that.
6. **`[6b]`'s warning needle is a typed regex that must match once in `scene-ui.ts`.** A rewording
   makes the oracle throw (HARNESS ERROR) instead of silently following.
7. **Stale prose on PASSING rows was corrected** (`[5a]`, `[6e]`, `[6e2]`, `[7e]`, the banner). It
   repeated the refuted direction claim or the retired "ONLY enforcement" claim to a reader. No
   assertion changed.
8. **`scene-anchor-writer` got the capture change as well.** The brief named it for the captures
   half, and it has no `[9h]`-like row.
9. **The committed captures were not refreshed.** The opt-in run's output was restored from `HEAD`.
   The shot name `04-height-extreme` was kept, though there is no extreme now, so the committed set
   stays coherent.

## Where the brief was not quite right

- **`node_modules` was not a symlink in this worktree: it did not exist.** A `cp -al` copy was made;
  `git check-ignore node_modules` then answered.
- **"A quick grep found none"**: there was no temp-by-default switch, but there was an existing
  capture-output variable, `SHOTS`, in two meanings. It was reused (see Captures).
- **`[7b]` could be driven across its threshold, but not by the curve alone** (see "Why the probe
  had to touch more than the curve"), so it is not BLOCKED.
