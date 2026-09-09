# GUARD-SEAT-RESIDUE, the named remainder: `preset.ts`, plus `curve-rate.ts`

Branch `parcel/guard-residue-preset`, base `4e66b570`. Written as the work was
formed, not after, so a death costs the run and not the read.

`GUARD-SEAT-RESIDUE` has now been worked three times. The first parcel
(`docs/reviews/2026-09-09-guard-residue-validators.md`) took
`src/core/formats/effects/json-schema-subset.ts` and the collision tree; the
second (`docs/reviews/2026-09-09-guard-residue-scene-ui.md`) took
`section-wiring.ts` and `scene-ui.ts`. Both named
`src/core/formats/effects/preset.ts` (2,290 lines, 38 throws, only
`parseEffectsPreset`'s dispatch ever read) as the thing they did not reach.
This packet is that file, scored end to end, plus one of the five small
advisory modules the brief listed as the stretch.

## 0. The environment measurement, done first because a later absence rests on it

`grep` in this shell is a **ugrep wrapper carrying `--ignore-files`**, so it
honours `.gitignore` and returns a clean, quiet zero for a path git ignores.
Measured with a canary rather than assumed:

    $ echo CANARY_GUARDRESIDUE_PRESET_XYZZY > node_modules/.canary-probe.txt
    $ git check-ignore -v node_modules/.canary-probe.txt
    .gitignore:1:node_modules/    node_modules/.canary-probe.txt
    $ grep -rl CANARY_GUARDRESIDUE_PRESET_XYZZY .          -> nothing, rc 1
    $ command grep -rl CANARY_GUARDRESIDUE_PRESET_XYZZY .  -> ./node_modules/.canary-probe.txt, rc 0

    $ typeset -f grep
    ... ARGV0=ugrep "$_cc_bin" -G --ignore-files --hidden -I --exclude-dir=.git ...

Consequences taken, not merely noted: **the plant population was enumerated
from the source read end to end**, never from a search, and every plant's
anchor text was proven to occur exactly once by a Python `str.count` over the
file's bytes rather than by a grep.

Second environment fact, because the brief warned about a worktree's
`node_modules`: this worktree's `node_modules/` holds only `.vite`, so node
resolves the MAIN checkout's `node_modules` by walking up. There is no second
React instance here and **no phantom failures: base and tip are both green**,
and every failure quoted below is one this parcel planted on purpose.

## 1. Baseline and after

`npm test` at base `4e66b570`, **exit 0**:

    check-test-collection: OK: 574 test-shaped file(s) on disk, all 574 collected by vitest.
    Test Files  571 passed | 3 skipped (574)
         Tests  8524 passed | 9 skipped (8533)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (574 module(s) reported).

`npm test` at this parcel's tip, **exit 0**:

    check-test-collection: OK: 576 test-shaped file(s) on disk, all 576 collected by vitest.
    Test Files  573 passed | 3 skipped (576)
         Tests  8579 passed | 9 skipped (8588)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (576 module(s) reported).

**Fifty-five rows added** across two new files and one existing one, and
`8524 + 55 = 8579`, so nothing was displaced. Both new files are collected:
the repo's own gate counts 576 test-shaped files on disk and all 576 collected,
which is the same 576 the totals line counts.

A full `npm test` is about 55 seconds on this machine, so **every plant was
scored against the WHOLE suite**. No verdict below rests on a scope argument.
The red-first proofs in section 6 are deliberately scoped to the three touched
files, because there the question is whether ONE named row goes red.

## 2. Method, and the scorer's own guard

The unit is the **guard predicate**: one condition whose truth changes what the
module refuses, what it reports, or what number it hands back. Every plant was
applied to a committed-clean file, run, and restored with a path-scoped
`git checkout HEAD -- <that one file>`; the driver records per plant the
`git diff -U0` of the mutation as it sat on disk, `git diff --stat`, the exit
code, the wall time, whether the restore left the path clean, and vitest's own
`Test Files` and `Tests` lines. **101 plants, 101 clean restores.**

### The scorer refuses a run that never reached vitest

`npm test` here runs **fifteen check scripts and a typecheck before vitest**.
The previous parcel scored **nine false kills** against a run that died at the
twelfth script, because `rc != 0` was read as KILLED. So the verdict here comes
from **vitest's own `Test Files` line and nothing else**: absent, the verdict is
`UNMEASURABLE` and the driver keeps the log. **It fired once, on `MP07`**
(section 4), and the answer it gave was a real one.

Nothing was committed to this tree while plants were running, precisely so the
mid-parcel poison that broke the last parcel could not arrive; but the check is
per run regardless, because a green baseline is not a control for it.

### The controls

Six plants were predicted **in writing before the run** to be incapable of
discriminating at all: `PR21`, `PR27`, `PR33`, `PR38`, `PR43`, `MP05`. All six
survived, in a batch that killed 46 others. A batch with no predicted survivor
cannot detect that its own scorer has stopped working, and that is exactly how
the previous parcel's nine void verdicts were caught.

## 3. The result

**101 plants. 46 killed, 54 survived, 1 UNMEASURABLE.** Of the 54 survivors,
**42 are closed by new rows**, **11 are shown not to discriminate** and are
removed from the denominator rather than counted, and **1 is reported unfixed
with its reason** (section 5). **Zero source lines changed.**

On the 89 plants that both discriminate and were measurable: **46 killed, 43
survived, 52%.** The unmeasurable one gets a row too, so 43 guards that had
nothing holding them now have something.

### THE SHAPE, WHICH IS THE FINDING AND IS NOT THE RATIO

Split `preset.ts` the way its own file is split, and the two halves are not
close:

| half of `preset.ts` | plants | killed | survived |
|---|---|---|---|
| RUNTIME predicates (what a document or a control reaches) | 51 | 31 | 20 |
| MODULE-LOAD derivation guards (what a future schema amendment reaches) | 30 | 2 | 27 (+1 unmeasurable) |

**Two of twenty-nine.** And the two that died did not die because anything
tested them: `MP02` (reading the whole regex match instead of the capture
group) produced a `NaN` that a DIFFERENT derivation four hundred lines later
refused by name, and `MP10` (dropping a `.sort()`) changed a constant a drift
gate happens to compare against a sorted list.

This is the previous parcel's finding recurring in a file it never touched, in
its sharper form: **the half whose failure produces no artifact is the half
with nothing holding it.** A derivation guard exists so that when empyrean
amends the schema, Aurora refuses loudly instead of yielding a plausible wrong
value. No committed document exercises it. A suite built out of committed
documents therefore has, structurally, nothing to say about any of them, and
the ratio 2/29 is what "nothing to say" looks like when you measure it.

The instrument that CAN say something is a **poisoned schema and a re-import**,
which `test/formats/effects-preset-boundary.test.ts` already owns for one
derivation. `test/formats/effects-preset-guard-residue-schema.test.ts`
generalises it to twenty-six.

### And the third class, exactly where the brief said to look

`curve-rate.ts` is the small advisory module, and its survivors are the
brief's predicted third class: **advisory predicates tested a comfortable
distance from their edge.** `CR13` tightens the scan's `camX <= maxCamX` to
`<` and survives, because every existing row scans to a bound well past the
onset. `CR16` turns the estimate's `Math.ceil` into `Math.floor` and survives,
because the one row on the estimate compares it with the scan and allows eight
camera pixels of slack for the decode's truncation, which swallows one. `CR12`
and `CR19` loosen a `spanLines < 2` floor to `< 1` and survive, and neither is
tidiness: with one line there are ZERO adjacent pairs, so the scan divides by
zero and answers camera 0, which reads to an author as "garbled from the very
first pixel."

## 4. The plant tables

### 4a. `preset.ts`, the runtime half: 51 plants, 31 killed, 20 survived

| id | guard | mutation | predicted | verdict |
|---|---|---|---|---|
| PR01 | `presetFp16ToNumber` sign rule | the naive conversion: magnitude from `whole` itself | killed | KILLED |
| PR02 | `presetFp16ToNumber` sign rule | `whole < 0` loosened to `<= 0` | killed | KILLED |
| PR03 | `presetFp16FromNumber` finiteness | `!isFinite` narrowed to `isNaN` | survived | SURVIVED |
| PR04 | `presetFp16FromNumber` exactness | drop the whole-units-of-1/256 refusal | killed | KILLED |
| PR05 | `presetFp16FromNumber` the (-1,0) hole | drop the unspellable-negative refusal | killed | KILLED |
| PR06 | `presetFp16FromNumber` range | whole range widened by one at both ends | survived | KILLED |
| PR07 | `presetFp16FromNumber` sign detection | `px < 0` loosened to `<= 0` | survived | KILLED |
| PR08 | `anchorAmpRungForPeakPx` exactness | `===` becomes `>=` | killed | KILLED |
| PR09 | `anchorPeriodRungForTicks` exactness | `===` becomes `>=` | killed | KILLED |
| PR10 | `anchorSnapPeakPx` log domain | snap in the LINEAR domain | survived | KILLED |
| PR11 | `anchorSnapCycleSeconds` log domain | snap in the LINEAR domain | survived | SURVIVED |
| PR12 | `anchorSnapPeakPx` zero guard | drop the `MIN_VALUE` floor | survived | KILLED |
| PR13 | `isBaseSwapTargetAligned` integrality | drop the integer arm | survived | SURVIVED |
| PR14 | `isBaseSwapTargetAligned` upper bound | `<= max` widened to `max + 1` | survived | KILLED |
| PR15 | `isBaseSwapTargetAligned` granule | half the granule | killed | KILLED |
| PR16 | `isBaseSwapTargetAligned` lower bound | `>= min` tightened to `> min` | survived | KILLED |
| PR17 | `baseSwapInsideRows.empty` | `last < first` widened to `<=` | survived | SURVIVED |
| PR18 | `baseSwapInsideRows.first` | the ON fire line counted as fully swapped | killed | KILLED |
| PR19 | `baseSwapInsideRows.last` | the OFF fire line counted as fully swapped | killed | KILLED |
| PR20 | `baseSwapFires` document order | emit the OFF fire before the ON fire | killed | KILLED |
| PR21 | `baseSwapFires` absent restore_line | `!== undefined` becomes `!= null` | non-discriminating | SURVIVED |
| PR22 | `baseSwapOrderRefusal` strict ascent | `>` loosened to `>=` | killed | KILLED |
| PR23 | `baseSwapOrderRefusal` how-clause | swap DUPLICATES and goes BACKWARDS | survived | KILLED |
| PR24 | `baseSwapOrderRefusal` same-band consequence | always speak the overlap sentence | survived | KILLED |
| PR25 | `baseSwapOrderRefusal` window | start at `i = 2` | killed | KILLED |
| PR26 | `presetProgramArm` multi-arm report | report null when TWO arms are carried | killed | SURVIVED |
| PR27 | `presetProgramArm` key presence | `!== undefined` becomes `in` | non-discriminating | SURVIVED |
| PR28 | `presetRasterChannel` classification | any program arm counts as raster | killed | KILLED |
| PR29 | `presetOnArms` shape | drop the array refusal | survived | SURVIVED |
| PR30 | `presetArmIssue` unknown-arm arm | speak only for TWO unknown arms | killed | KILLED |
| PR31 | `presetArmIssue` two-arm arm | `> 1` loosened to `> 2` | killed | KILLED |
| PR32 | `presetIdFromFileName` extension test | `endsWith` becomes `includes` | survived | SURVIVED |
| PR33 | `presetIdFromFileName` stem | slice becomes an anchored replace | non-discriminating | SURVIVED |
| PR34 | `presetDefFields` optional split | optional stops excluding required | killed | KILLED |
| PR35 | `everyKey` recursion | stop descending into nested objects | killed | SURVIVED |
| PR36 | `everyKey` array descent | stop descending into arrays | killed | SURVIVED |
| PR37 | `parseEffectsPreset` version refusal | the version compared coerced | survived | SURVIVED |
| PR38 | `parseEffectsPreset` id/stem identity | compared through `String()` | non-discriminating | SURVIVED |
| PR39 | `parseEffectsPreset` reserved-key search | reserved names looked for at the ROOT only | survived | SURVIVED |
| PR40 | `parseEffectsPreset` reserved-key sentence | always singular | survived | SURVIVED |
| PR41 | `dedupe` both oneOf spellings | the `none` spelling dropped | survived | KILLED |
| PR42 | `dedupe` arm-path census | the unknown-arm sentence stops marking its path | survived | KILLED |
| PR43 | `parseEffectsPreset` band-arm loop | `'on' in band` becomes an undefined test | non-discriminating | SURVIVED |
| PR44 | `serializeEffectsPreset` write-side validation | drop the refusal | killed | KILLED |
| PR45 | `serializeEffectsPreset` canonicalization | skip `canonicalizeBySchema` | killed | SURVIVED |
| PR46 | `loadEffectsPresetLibrary` `exists()` cannot-tell | the blind catch returns "absent" | killed | KILLED |
| PR47 | `loadEffectsPresetLibrary` `list()` cannot-tell | an unreadable listing reads as empty | killed | KILLED |
| PR48 | `loadEffectsPresetLibrary` listing order | drop the sort | survived | SURVIVED |
| PR49 | `loadEffectsPresetLibrary` `loadedPaths` | an UNREADABLE path recorded as loaded | killed | SURVIVED |
| PR50 | `loadEffectsPresetLibrary` notice coalescing | the single-file notice speaks for any number | killed | KILLED |
| PR51 | `noteEffectsPresetsPersisted` normalisation | drop the dedupe and the sort | survived | KILLED |

### 4b. `preset.ts`, the module-load half: 30 plants, 2 killed, 27 survived, 1 unmeasurable

| id | guard | mutation | verdict |
|---|---|---|---|
| MP01 | `schemaNode` existence | a NON-OBJECT node passes as a schema node | SURVIVED |
| MP02 | `schemaNumberFromProse` capture | read the whole match, not the capture group | KILLED |
| MP03 | `schemaNumberFromProse` loud failure | a sentence that stops matching yields 0 | SURVIVED |
| MP04 | patch-seed unit denominator | drop the zero-denominator refusal | SURVIVED |
| MP05 | patch-seed unit matcher | drop the trailing full stop | (not discriminating) |
| MP06 | `inclusiveRange` ordering | an inverted range of one is accepted | SURVIVED |
| MP07 | `schemaRange` both bounds | only the minimum need be numeric | **UNMEASURABLE** |
| MP08 | `PROGRAM_ARMS` oneOf presence | an EMPTY top-level `oneOf` is accepted | SURVIVED |
| MP09 | `PROGRAM_ARMS` branch shape | a branch requiring TWO keys is accepted | SURVIVED |
| MP10 | `PROGRAM_ARMS` ordering | the arms are no longer sorted | KILLED |
| MP11 | `PATCHED_ARMS` undeclared arm | an arm with no property node passes | SURVIVED |
| MP12 | raster/patched partition | membership compared by LENGTH | (not discriminating) |
| MP13 | raster channels non-empty | an empty raster list is accepted | SURVIVED |
| MP14 | ramp per-index lag positivity | a lag of ZERO is accepted | SURVIVED |
| MP15 | the two ramp display sentences agree | exact agreement becomes one-sided | SURVIVED |
| MP16 | `ramp_target` closed to `vsram` | a SECOND (CRAM) arm is accepted | SURVIVED |
| MP17 | fp16 example is NEGATIVE | `>= 0` narrowed to `> 0` | SURVIVED |
| MP18 | fp16 example distinguishes the naive value | the two may now coincide | SURVIVED |
| MP19 | `base_swap` is an ARRAY | the pre-migration object form is accepted | SURVIVED |
| MP20 | `base_swap` `minItems >= 1` | a `minItems` of 0 is accepted | SURVIVED |
| MP21 | plane enum has two spellings | a ONE-value enum passes | SURVIVED |
| MP22 | granule is not vacuous | a granule of 1 passes | SURVIVED |
| MP23 | range is a whole number of granules | a remainder of exactly one is tolerated | SURVIVED |
| MP24 | edge rule reproduces the witness | only the FIRST offset is checked | SURVIVED |
| MP25 | order-authority sentence | drop the strictly-ASCENDING conjunct | SURVIVED |
| MP26 | the ONE patch index space | the interlock becomes one-sided | SURVIVED |
| MP27 | `tint_region` declares no `addr` | only a REQUIRED `addr` is refused | SURVIVED |
| MP28 | `tint_region` is `pal_region` minus `addr` | compared by LENGTH | SURVIVED |
| MP29 | reserved list is non-empty | drop the empty-list refusal | SURVIVED |
| MP30 | reserved sentence matcher | the name list may match EMPTY | SURVIVED |

**MP07 is the scorer's guard firing, and its answer is real.** The mutation
(`typeof min !== 'number' || typeof max !== 'number'` reduced to the first
clause) does not COMPILE: `schemaRange` returns `{min: number; max: number}`,
so dropping half the narrowing leaves `max` as `unknown` and `tsc` refuses at
`preset.ts(864,3)`. The run exited 2 at the typecheck and vitest never started,
which under the old `rc != 0 => KILLED` rule would have been recorded as a kill
by the test suite. **That predicate is held by the compiler, and no test in
this repo was holding it.** It is out of the denominator, not counted as a
survivor. A second form of the same mutation that DOES compile (delete the
check and cast both reads, `MP07b`) was planted for the red-first leg, and the
new row goes red against it.

### 4c. `curve-rate.ts`: 20 plants, 13 killed, 7 survived

| id | guard | mutation | verdict |
|---|---|---|---|
| CR01 | `curveShearRate` pair floor | `spanLines < 2` loosened to `< 1` | KILLED |
| CR02 | `curveShearRate` pair count | divide by lines, not adjacent pairs | KILLED |
| CR03 | `curveShearRate` magnitude | drop the absolute value | SURVIVED |
| CR04 | `curveShearRate` finiteness | only `spanLines` need be finite | KILLED |
| CR05 | `CURVE_RATE_CLEAN_MAX` arm selection | take the CLEAN max from the GARBLED arms | KILLED |
| CR06 | `CURVE_RATE_CLEAN_MAX` extremum | take the LOWEST clean arm | (not discriminating) |
| CR07 | `CURVE_RATE_GARBLED_MIN` arm selection | take the GARBLED min from the clean arms | KILLED |
| CR08 | `CURVE_RATE_GARBLED_MIN` extremum | take the HIGHEST garbled arm | (not discriminating) |
| CR09 | `curveExcursionPx` magnitude | drop the absolute value | KILLED |
| CR10 | `curveExcursionPx` camera | decode the FROM end at camera 0 | KILLED |
| CR11 | `curveRateOnsetCamX` crossing test | `>= rate` tightened to `>` | KILLED |
| CR12 | `curveRateOnsetCamX` span floor | `spanLines < 2` loosened to `< 1` | SURVIVED |
| CR13 | `curveRateOnsetCamX` scan bound | `camX <= maxCamX` tightened to `<` | SURVIVED |
| CR14 | `curveRateOnsetCamX` pair count | `pairs` becomes `spanLines` | KILLED |
| CR15 | `curveRateOnsetEstimate` no-ramp arm | a zero factor gap divides | KILLED |
| CR16 | `curveRateOnsetEstimate` rounding | `ceil` becomes `floor` | SURVIVED |
| CR17 | `curveRateOnsetEstimate` pair count | the same off-by-one | KILLED |
| CR18 | `curveRateOnsetEstimate` gap magnitude | drop the absolute value | KILLED |
| CR19 | `curveRateOnsetEstimate` span floor | `spanLines < 2` loosened to `< 1` | SURVIVED |
| CR20 | `CURVE_RATE_ARM_SPAN_LINES` | the arms' span becomes `SCREEN_HEIGHT - 1` | KILLED |

## 5. What does NOT discriminate, and the one survivor left open

Eleven plants change the source and provably cannot change any outcome. Each is
removed from the denominator and each has a **loud row asserting its own
precondition**, so it goes red the day that precondition ends.

- **`PR03` and `PR13`, both DEFENCE IN DEPTH over a later arm in the same
  function.** `presetFp16FromNumber`'s finiteness test is unreachable because a
  non-finite `px` multiplies to a non-finite `units` and the exactness arm one
  line later refuses that. `isBaseSwapTargetAligned`'s integer arm is
  unreachable because `x % g` keeps `x`'s fractional part, so `x % g === 0` is
  already false for every non-integer. Both rows assert the arithmetic
  property, not the outcome, so they die if the ordering ever changes.
- **`PR21`, `PR38`, `PR43`: three cases where the distinguishing value cannot
  come out of JSON.** `restore_line: null` is refused at parse; `id` is
  REQUIRED and typed `string`, so `String(id)` is identity; and a key present
  with the value `undefined` is not expressible in a JSON document at all.
- **`PR33`**: after `endsWith('.json')` has proved the suffix, a slice and an
  anchored replace are the same function.
- **`PR40`: a plural arm with no document that reaches it.** The reserved list
  has exactly ONE member today, so no document can carry two reserved names and
  the sentence's `are` branch is unreachable. The row pins the count.
- **`MP05`**: the ratio sentence is followed by a full stop, so dropping the
  `\.` from the matcher cannot change what the digit runs capture.
- **`MP12`: an interlock that is vacuous by construction, and correctly kept.**
  It compares `raster ++ patched` with `arms`, but both lists are derived from
  ONE filter over `arms`, so their union is always exactly `arms` and no schema
  can make the comparison fire. It is defence against a refactor that computes
  the two independently. The new row states the property the interlock claims,
  in a place that CAN fire.
- **`CR06` and `CR08`: an extremum over a single-element list.** Each side of
  aeon's bracket has exactly one arm today, so `reduce` returns it whatever the
  comparator says. The row pins the arm census, and says in its own message
  what to write when aeon measures a third.

### The one survivor reported and NOT fixed

**`PR45`, `serializeEffectsPreset`'s `canonicalizeBySchema`.** Serializing the
object as given, skipping the canonicalizer, left the whole suite green.
`canonicalizeBySchema`'s remaining job is its undeclared-key refusal, and
`validateAgainstSchema` runs two lines ABOVE it against a schema that is closed
at every level. Measured over the vendored schema rather than assumed: a walk
over every object node reports **zero nodes without a closure keyword**, so
every document the canonicalizer would refuse is already refused by the
validation above it, and the recursive alphabetical key order the writer
contracts for is produced by `canonicalJsonPretty` either way.

This is the `matchesType`-default precedent from the first parcel: defence in
depth over a second reader that agrees, correctly left as such. It is **not**
filed as non-discriminating, because the argument rests on a property of the
CURRENT vendored schema rather than on arithmetic, and the honest instrument is
therefore the closure census going red rather than a claim in this document.
That census does not exist as a row today, and **that is the open item**: it
belongs beside the schema-support gate, not in this parcel's file, because it
is a statement about `json-schema-subset.ts`'s reach and not about `preset.ts`.

## 6. Red-first evidence

Every new row that closes a survivor was proven red against the plant it exists
for, with the mutation quoted from disk by `git diff -U0` before the run and the
path restored from the committed baseline after it. **43 legs, every one red,
and every one red BY ITS OWN ROW**: the driver requires both vitest's `Test
Files` line to be present AND the failing test's title to carry the plant id, so
a red run caused by some other row does not count as a proof.

- runtime, 12 legs: `PR11 PR17 PR26 PR27 PR29 PR32 PR35 PR36 PR37 PR39 PR48 PR49`
- module-load, 26 legs: `MP01 MP03 MP04 MP06 MP07b MP08 MP09 MP11 MP13 MP14
  MP15 MP16 MP17 MP18 MP19 MP20 MP21 MP22 MP23 MP24 MP25 MP26 MP27 MP28 MP29 MP30`
- `curve-rate`, 5 legs: `CR03 CR12 CR13 CR16 CR19`

**One correction, recorded rather than quietly fixed.** `MP07b` first scored
`RED-BUT-NOT-THIS-ROW`, because the driver matches the plant id against the
failing test's title and the row is titled `PLANT MP07`, not `MP07b`. Read by
hand, the failing row is exactly the intended one:

    × PLANT MP07: a range node missing its MAXIMUM is refused

The classifier was wrong, not the leg. It is worth keeping because the same
classifier is what makes the other 42 legs mean anything.

**And one trap this parcel walked into and did not fall for.** `MP02` reddened
**every one of the 574 files** and dropped the totals to `574 failed (574)`,
which is the exact signature two previous parcels discarded runs for. It is a
real kill: the mutation makes `schemaNumberFromProse` return `NaN`, and the
ramp lag derivation four hundred lines later refuses a non-integer lag by name
at module load, so every file importing anything downstream fails at import.
The discriminator is the error TEXT, not the totals line:

    Error: the VSRAM per-index display-lag sentence in aurora-effects-preset.schema.json
    parsed to NaN, which is not a positive whole number of scanlines.
      at src/core/formats/effects/preset.ts:1167:11

That is a named module invariant, not a `SyntaxError`, so the run judged and
the verdict stands. It is also a finding in its own right: **the file's
derivations defend each other**, which is why the module-load half's two kills
are both accidents of a neighbouring guard rather than of a test.

## 7. Where the budget ended, named so nobody reads it as covered

- **`preset.ts` is now planted end to end** and is the first of the row's
  surfaces that can be called scored: 81 plants over its runtime predicates and
  its schema derivations. What is NOT planted in it: the TypeScript interfaces
  above line 620 (they carry no predicate), and `presetArmFields`,
  `effectsPresetDir` / `effectsPresetPath`, and `EffectsPresetError`'s message
  assembly, which were read and judged to hold no guard worth a mutation.
- **`curve-rate.ts` is planted end to end** (20 plants over every predicate it
  exports).
- **`ramp-scroll-mode.ts` (531 lines), `preset-lag.ts` (467),
  `channel-bands.ts` (440) and `ramp-sign-lag.ts` (327) are STILL UNPLANTED.**
  The budget went to scoring two files properly rather than six thinly, which
  was the explicit judgement on the previous parcel. `ramp-scroll-mode.ts` is
  the one to do next and it is almost entirely class C: `rampScrollModeSentence`
  and `vDeformRampSentence` are blindness reporters whose `'unknown'` state
  shares a union with "I looked and found nothing", and whose whole output is a
  sentence nobody has asserted the CONTENT of.
- **The `??` sites across the effects tree** remain unenumerated. That was the
  first parcel's blind spot 1, it was still open after the second, and it is
  still open now. `preset.ts` has several; none was planted, because a `??` is a
  correcting guard and the second parcel's measurement says a correcting guard
  needs a direct unit row rather than a plant through a caller.
- **The schema-closure census `PR45` needs** (section 5) is not written.
- **No runtime confirmation anywhere.** No emulator touched, none attempted:
  every row in this parcel is a pure-function or module-load assertion.
