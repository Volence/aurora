# GUARD-SEAT-RESIDUE, the remainder: `section-wiring.ts` and `scene-ui.ts`

Branch `parcel/guard-residue-scene-ui`, base `d9fbf105`. Written as the work was
formed, not after.

The row `GUARD-SEAT-RESIDUE` closed two of its four surfaces in
`docs/reviews/2026-09-09-guard-residue-validators.md` and named what it left:
`section-wiring.ts`, `scene-ui.ts` (2,344 lines, 71 throws, **nothing ever
planted**), and six smaller unplanted files. This packet covers the first two.
The six smaller files were not reached and are named in section 8.

## 0. THE RUN THAT SCORED NINE FALSE KILLS, first, because every figure below depends on it

Nine `scene-ui.ts` plants in a row scored **KILLED** and every one of those
verdicts was **void**. `npm test` runs fourteen check scripts and a typecheck
before `vitest`, and one of them refused: `check-test-dashes` found a U+2014 in
an assertion MESSAGE in a test file **this parcel had committed twenty minutes
earlier**. The run exited 1 at the twelfth script and vitest never started.

The driver's rule was `rc != 0 => KILLED`, and a run that dies before any
assertion executes is indistinguishable from a run in which every assertion
passed judgement, if all you read is the exit code.

**What exposed it was a prediction failing in the RIGHT direction.** Two of the
nine plants were ones I had reasoned could not discriminate at all (`SU06`,
`SU12` below). Being told they were caught was not plausible, so the logs got
read. Had I planted only mutations I expected to die, the whole batch would have
been recorded as a clean sweep.

Three things follow, and they are the durable part:

1. **A green BASELINE is not a control for this.** The poison arrived in a
   commit made in the middle of the parcel, so the baseline taken at the start
   was honest and every run after it was not. The check has to be per-run.
2. **The driver now refuses to score a run that never reached vitest.** The
   verdict is `UNMEASURABLE`, not `KILLED`, unless the log carries vitest's own
   `Test Files` line; it prints what stopped the run. It fired again a few
   plants later on a genuine typecheck error (`SU21`, first form), which is what
   the gate is for.
3. **Every verdict taken after the bad commit was re-run**: the nine
   `section-wiring` red-first proofs and the entire first `scene-ui` batch. The
   re-run turned all nine of those "kills" into **six survivors and three
   kills**, which is the finding of section 4.

## 1. What does NOT discriminate

Four `scene-ui.ts` plants change the source and provably cannot change any
outcome. They are removed from the denominator rather than counted as
survivors, and each has a LOUD row in the new test file that goes red the day
its precondition ends:

- **`SU06` — the clamp reading `EFFECTS_VSPLIT_AT_BOUNDS`.** This is the exact
  defect `clampRowRemapPlaneY`'s own docblock is written against. Both nodes are
  `0..511` today, measured, so no input can tell them apart.
- **`SU12` — `isValidSceneId` reusing the module `RegExp`.** The comment beside
  it names `lastIndex` as the hazard; the pattern carries no flags (measured:
  `flags` is `""`), so `.test` is stateless and the fresh construction buys
  nothing observable today.
- **`SU24` — `rowRemapHeightShiftRefusal` as a RANGE test instead of set
  membership.** The docblock names the defect ("a sparse `[4, 7]` would have
  this function bless a 5 and a 6"). The enum is `[4]`, so the range IS the set.
- **`SU25` — the contiguity check that decides whether the sentence may speak in
  ends.** With one admitted shift the `length === 1` arm short-circuits ahead of
  it, so the mutated ternary is unreachable.

`SU06`, `SU24` and `SU25` share a shape worth naming: **a docblock that
correctly identifies a hazard, guards against it, and is guarding against a
divergence that has not happened yet.** The guard is right. It is also, today,
untestable, and the honest instrument is a row that says so and names what to
write when it stops being true.

## 2. Baseline and after

`npm test` at base `d9fbf105`, exit 0:

    check-test-collection: OK: 570 test-shaped file(s) on disk, all 570 collected by vitest.
    Test Files  567 passed | 3 skipped (570)
         Tests  8463 passed | 9 skipped (8478)

`npm test` at this parcel's tip, exit 0: **see section 9**, filled in from the
final run rather than predicted. (The previous packet records an earlier draft
carrying invented after-figures; an after-figure is checkable against nothing
except the run that produced it.)

Every plant was scored against the **whole** `npm test`, never a scoped subset.
A full run is about 36s on this machine.

## 3. `section-wiring.ts` — 30 plants, 21 killed, 9 survived

All nine survivors are closed by six new rows in the file's own test, with zero
source lines changed.

| id | guard | mutation | verdict |
|---|---|---|---|
| SW01 | `sectionRasterState` | drop the library-unreadable `unknown` | KILLED |
| SW02 | `sectionRasterAdvisory` | name the descriptor whichever file failed | SURVIVED |
| SW03 | `sectionRasterAdvisory` | drop the reason parenthetical | KILLED |
| SW04 | `descriptorEffectsBindings` | grow the 800-char window | KILLED |
| SW05 | `descriptorEffectsBindings` | drop the zone prefix from the anchor | SURVIVED |
| SW05b | `descriptorEffectsBindings` | loosen `_sec` to `_sec\w*` | SURVIVED |
| SW05c | `descriptorEffectsBindings` | both clauses at once (control) | KILLED |
| SW06 | `sectionRasterState` | `sharers.length > 1` to `> 2` | KILLED |
| SW07 | `sectionRasterState` | threading as EXISTENCE, not ownership | SURVIVED |
| SW08 | `sectionWiringConditions` | `sharers.length > 0` to `> 1` | KILLED |
| SW09 | `sectionConditionsAgreeWithState` | drop the same-record clause | SURVIVED |
| SW10 | `ownPresetSections` | route back through `sectionRasterState` | KILLED |
| SW11 | `wiringPaths` | accept an empty act tail | KILLED |
| SW12 | `wiringPaths` | accept a path outside `/data/editor/` | KILLED |
| SW13 | `carries` | fold `null` into absent | KILLED |
| SW14 | `variants.owed` | drop the channel-specific null rule | KILLED |
| SW15 | `sectionExtraChannelsCondition` | drop aeon's `or {0}` | SURVIVED |
| SW16 | `sectionExtraChannelsCondition` | partial threading passes | KILLED |
| SW17 | `threadedHere` | count a chooser threaded in ANY record | KILLED |
| SW18 | `sectionExtraChannelsCondition` | drop its `unknown` | KILLED |
| SW19 | `sectionExtraChannelsCondition` | collapse the nothing-bound detail | KILLED |
| SW20 | `libraryChannelChooserCalls` | stop de-duplicating indices | SURVIVED |
| SW21 | `libraryChannelChooserCalls` | stop sorting indices | SURVIVED |
| SW22 | `libraryChannelChooserCalls` | match any word as the index param | SURVIVED |
| SW23 | `libraryRasterChooserCalls` | search the whole library per record | KILLED |
| SW24 | `extraChannelsAdvisory` | speak when there is no gap | KILLED |
| SW25 | `channelPrescription` | write the unindexed form for an indexed chooser | KILLED |
| SW26 | `boundSections` | count a null `rasterRef` as occupied | KILLED |
| SW29 | `listOf` | lose the singleton case | KILLED |
| SW30 | `sectionRasterAdvisory` | fall silent on `unthreaded` | KILLED |

### The finding: three assertions answered by a guard that is not the one they name

**A comment naming a mechanism is not a test of it.** The row "the zone key
stops the chooser call being read as a section record" states its own mechanism
in a comment: "`zzz_act1_sec_raster(sec: 5)` also matches `..._sec\(\s*sec:` if
the zone is not part of the pattern". That sentence is FALSE about its own
fixture. `zzz_act1_sec_raster(` is `_sec_raster(`, never `_sec(`, so dropping
the zone id does not make the pattern match. The anchor is TWO clauses and the
row fails only when BOTH are loosened at once (`SW05c`, the control, dies).
Each half alone survived the whole suite.

Twice more, the same shape:

- **"the THIRD fact (threaded by a record the section does not bind)"** ends with
  `expect(sectionRasterState(w2, 2)).not.toBe('wired')`. Section 2 is SHARED, so
  `sectionRasterState` returns `'shared'` two branches earlier and never reaches
  the threading test. Collapsing that test from OWNERSHIP to mere existence
  (`SW07`) survived; so did dropping the seam's same-record clause (`SW09`),
  for the same reason.
- **Every `unknown` fixture is built by `unknownWiring`**, where BOTH sources are
  unparsed, so `sectionRasterAdvisory`'s `!w.descriptor.parsed ? descriptor :
  library` selector had nothing to select. Pinning it to the descriptor (`SW02`)
  stayed green. Half-read is the live case: the descriptor is per act, the
  library per zone.

The other three survivors are normalisation and defensiveness that no fixture
reached: aeon's `or {0}` for an owed channel with an empty array (`SW15`; every
existing condition-3 fixture uses `cycles`, whose `indices` is the constant
`[0]` and can never be empty), and the dedupe and sort of the indices the parse
PRINTS to an author (`SW20`, `SW21`), and matching the index parameter BY NAME
(`SW22`, where reading `slot:` as `ch:` makes Aurora tick a condition aeon's
build refuses).

### Reported, not pinned: the parse has no right-hand bound either

The first draft of the two-zone fixture appended a line to `SYNTHETIC_DESC` and
the row went red in an unexpected place: **section 3 swallowed the appended
constructor's `effects:`**. `descriptorEffectsBindings` splits on each section
constructor and searches to the next one, so the LAST section's chunk runs to
end of text.

That is a real property, and it is not fixed here. The file's central rule is
that the search must never grow a bound; the correct repair is to end the chunk
at the constructor's closing paren, which is a parser change and not a guard
residue. **Checked against aeon's real `ojz/act1`**: section 8's `effects:`
sits inside its own block at line 358 and nothing after it carries the key, so
today's answer is right and the hazard is latent. The `comptime fn ojz_sec(sec:
int, ...)` declaration at line 224 is refused by the `\d+` in the anchor.

## 4. `scene-ui.ts` — 33 plants, 4 non-discriminating, 29 scored: 18 killed, 11 survived (62%)

| id | guard | mutation | verdict |
|---|---|---|---|
| SU01 | `clampRowRemapPlaneY` | non-finite falls to `max` | SURVIVED |
| SU02 | `clampRowRemapPlaneY` | delete the non-finite arm | SURVIVED |
| SU03 | `clampRowRemapPlaneY` | `Math.round` to `Math.trunc` | SURVIVED |
| SU04 | `clampRowRemapPlaneY` | ceiling off by one | KILLED |
| SU05 | `clampRowRemapPlaneY` | floor off by one | KILLED |
| SU06 | `clampRowRemapPlaneY` | read vsplit's bounds | (not discriminating) |
| SU07 | `bobShiftRefusal` | ladder widened by one at both ends | KILLED |
| SU08 | `bobShiftRefusal` | drop the no-bob sentinel | SURVIVED |
| SU09 | `bobShiftRefusal` | swap the two consequence sentences | SURVIVED |
| SU10 | `bobShiftRefusal` | drop the integer arm | SURVIVED |
| SU11 | `isValidSceneId` | drop the pattern's anchors | KILLED |
| SU12 | `isValidSceneId` | reuse the module RegExp | (not discriminating) |
| SU13 | `takenSceneIds` | drop the UNREADABLE half | KILLED |
| SU14 | `takenSceneIds` | keep the `.json` extension on the stem | KILLED |
| SU15 | `sceneIdRefusal` | swap the two taken-messages | KILLED |
| SU16 | `driftPxPerFrameToRate` | round toward `+inf` | KILLED |
| SU17 | `driftPxPerFrameToRate` | stop normalising `-0` | KILLED |
| SU18 | `driftRateRefusalParts` | drop the refused-rate clause | KILLED |
| SU19 | `driftRateRefusalParts` | taste bound widened by one | KILLED |
| SU20 | `driftPxPerFrameRefusalParts` | `!isFinite` narrowed to `isNaN` | SURVIVED |
| SU21 | `driftPxPerFrameRefusalParts` | always drop the wire-units prefix | KILLED |
| SU22 | `rowRemapPlaneYRefusalParts` | plane bound widened by one | KILLED |
| SU23 | `rowRemapPlaneYRefusalParts` | drop the integer arm | KILLED |
| SU24 | `rowRemapHeightShiftRefusal` | membership becomes a range test | (not discriminating) |
| SU25 | `rowRemapHeightShiftRefusal` | always speak in ends | (not discriminating) |
| SU26 | `reelRatesRefusal` | exact count becomes a ceiling | SURVIVED |
| SU27 | `reelRatesRefusal` | exempt duplicate ZEROES from uniqueItems | KILLED |
| SU28 | `reelRatesRefusal` | drop the per-value refusal | SURVIVED |
| SU29 | `reelRateRefusal` | bound widened by one at both ends | SURVIVED |
| SU30 | `reelRateGuidance` | speak about a REFUSED rate | SURVIVED |
| SU31 | `reelRateGuidance` | strobe threshold becomes exclusive | KILLED |
| SU32 | `bobShiftOf` | stop folding the sentinel into null | KILLED |
| SU33 | `reelStripScreenX` | index bound off by one | KILLED |

All eleven survivors are closed in
`test/formats/effects-scene-ui-guard-residue.test.ts`. **Zero source lines
changed anywhere in this parcel.**

## 5. THE CORRECTING GUARD, which is what this parcel was asked to answer

`clampRowRemapPlaneY` does not refuse; it repairs. The previous packet says the
whole plant method is blind to that shape. **It is not blind — the mutation
applies and scores exactly the same way — but the guard's OBSERVABLE SET is
structurally smaller, and the mechanism is worth stating because it decides
where a row has to go.**

Six mutations, one shown not to discriminate, five scored: **two killed, three
survived.** The two that died are the two that push a corrected value OUT OF the
schema's range, and both die against the same row, whose two points sit
`max + 1000` and `min - 1000` from the bounds they test.

The structural claim, and it is falsifiable:

> When a REFUSAL is widened, the bad value survives the control and then meets
> the codec, which holds the same rule out of the same schema. The refusal is
> defence in depth over a second reader that agrees with it. When a CLAMP is
> wrong, the number it returns is — everywhere except at the range edge — a
> number the codec accepts, indistinguishable afterwards from one the author
> typed, and nothing records that it was corrected. **So the validator can catch
> a clamp that corrects OUT of range and can never catch a clamp that corrects
> to the wrong value INSIDE it.**

Measured, not argued. `rowRemapFromToggle`'s row runs the seeded document
through the codec (`expect(issues(withRemap(...))).toEqual([])`), and that codec
check is what killed `SU04`: the ceiling off by one produced `plane_y: 512`,
which the schema refuses. It caught nothing at all in `SU01`, `SU02` or `SU03`,
where the corrected value stays legal. So the second reader exists, its reach is
exactly the schema's admitted set, and the clamp's job is to land inside that
set — which makes the second reader blind to every wrong answer the clamp can
give that is still an answer.

Three consequences, all of them concrete:

1. **A direct unit row on a correcting guard is not a convenience, it is the
   only instrument there is.** The three survivors are the non-finite fallback
   (which END a nonsense value falls to: the top of the plane or the bottom),
   the deletion of that arm entirely (NaN straight through), and the rounding
   mode. None is visible anywhere but at the function.
2. **"A comfortable distance from the edge" is strictly worse here than on a
   refusal.** A widened refusal can still be caught through a caller that
   renders the sentence; a wrong clamp has no such second road. The new rows
   probe at `min - 1`, `min`, `max`, `max + 1`.
3. **A correcting guard's error is unfalsifiable after the fact.** There is no
   downstream state that is invalid, so no downstream assertion can exist. The
   only remaining question a reader can ask is whether the input that
   distinguishes is REACHABLE, and for this guard the answer is honest and
   narrow: the product's one caller passes `layer.world_y` from a
   schema-validated scene, so a non-finite or fractional input is not reachable
   from a loaded document today. The arm is defensive. The rows are still worth
   writing, because they pin WHICH end the fallback chooses, and the two ends of
   this range are the top and the bottom of a Plane-B window.

## 6. The other survivors, and why each one had nothing holding it

Two classes, and they are the previous packet's classes recurring in a file it
never touched.

**Sentences whose CONTENT nobody asserted, on paths that already return
non-null.** `bobShiftRefusal`'s two consequence halves are opposite in kind
(below the ladder "would pack to silence"; above it "annihilates the amplitude
table") and swapping them (`SU09`) leaves the refusal non-null and still
mentioning the ladder. `driftPxPerFrameRefusal` narrowed from `!isFinite` to
`isNaN` (`SU20`) still refuses an infinite input, several frames later, with a
sentence about it not being an integer — the author typed no number at all and
is told about integers.

**Guards whose whole job is a case no fixture builds.** The no-bob sentinel's
short-circuit (`SU08`) — deleting it refuses `off`, which is the value the
schema's own default carries. `bobShiftRefusal`'s integer arm (`SU10`) — without
it a fractional shift inside the ladder returns null and the control would
originate a document no codec accepts. `reelRatesRefusal`'s exact count
(`SU26`) — loosened to a ceiling, a short array of distinct legal rates passes
the whole function. Its per-value loop (`SU28`) — with the call to
`reelRateRefusal` gone, nothing looks at the values at all, and every existing
row either asks `reelRateRefusal` directly or hands the array a duplicate.
`reelRateRefusal`'s own bound (`SU29`), widened by one. And
`reelRateGuidance`'s refusal short-circuit (`SU30`), whose deletion makes a
sentence at the HINT tier speak about a document that will not load — the one
thing its docblock says it must never do.

## 7. Red-first evidence

Every new row was proven red against the plant it exists for, with the mutation
quoted from disk by `git diff -U0` before the run, restored from the committed
baseline after it, and the tree proven clean. **20 red-first legs, all KILLED
with vitest confirmed to have run** (`Test Files` line present, one or two rows
red, 8478 collected):

- `section-wiring`, 9 legs: `SW02 SW05 SW05b SW07 SW09 SW15 SW20 SW21 SW22`
- `scene-ui`, 11 legs: `SU01 SU02 SU03 SU08 SU09 SU10 SU20 SU26 SU28 SU29 SU30`

Section 0's nine void verdicts are NOT in that count and were all re-run.

## 8. Where the budget ended, named so nobody reads it as covered

- **`preset.ts` (2,290 lines, 38 throws) — NOT REACHED.** It was the brief's
  stretch target and it stays exactly where the previous packet left it: only
  `parseEffectsPreset`'s dispatch has ever been read. Unplanted: `presetArmIssue`,
  `baseSwapOrderRefusal`, `isBaseSwapTargetAligned`, `presetDefFields`, the
  reserved-wave-2-key refusal, the id/filename-stem refusal, and the schema-prose
  drift throws in the 700-1450 range.
- **`ramp-scroll-mode.ts`, `preset-lag.ts`, `channel-bands.ts`,
  `ramp-sign-lag.ts`, `curve-rate.ts` — NOT REACHED**, all still unplanted. They
  were the brief's "if budget remains" list and the budget went to scoring the
  two named files properly instead.
- **`scene-ui.ts` is planted but not exhausted.** 33 plants over roughly a third
  of its exported surface. Untouched: `admittedIntegers` and the whole
  schema-derivation block above line 1000 (`EFFECTS_TABLE_REF_FORMS`,
  `EFFECTS_LAYER_DEFORM_BOUNDS`, `EFFECTS_BOB_SHIFT_LADDER`'s own derivation,
  `EFFECTS_ROW_REMAP_REFUSED_KEYS`, `EFFECTS_REEL_STRIP_WIDTH_PX`,
  `EFFECTS_REEL_X256_SURVIVORS`), `newEffectsScene` / `newEffectsLayer` /
  `cloneEffectsScene`, `reelCycleFrames` / `reelCycleLabel`, and every `throw`
  in the module-load-time derivations, which are a different guard family
  (they refuse a CONTRACT, not a value).
- **`??` sites across the effects tree** — the previous packet's blind spot 1 —
  are still not enumerated. `scene-ui.ts` has two (`newEffectsLayer`'s factor
  copy, `driftPxPerFrameRefusalParts`' mechanism join) and neither was planted.
- **No runtime confirmation anywhere.** No emulator touched, none attempted.
  Every row in this parcel is a pure-function assertion.

## 9. Final run

`npm test` at this parcel's tip, **exit 0**, aggregate lines as printed:

    check-test-collection: OK: 571 test-shaped file(s) on disk, all 571 collected by vitest.
    Test Files  568 passed | 3 skipped (571)
         Tests  8482 passed | 9 skipped (8491)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (571 module(s) reported).

Baseline was 8463 passed / 9 skipped in 570 files at `d9fbf105`; the tip is
8482 / 9 in 571. **Nineteen rows added across two files** (six appended to
`src/core/formats/effects/__tests__/section-wiring.test.ts`, thirteen in the new
`test/formats/effects-scene-ui-guard-residue.test.ts`), and the new file is
collected: the repo's own `check-test-collection` gate counts 571 test-shaped
files on disk and all 571 collected, which is the same 571 the totals line
counts. `8463 + 19 = 8482`, so nothing was displaced.

This section was written from that run and not before it. Section 2 carried a
`PENDING` marker in its place until the run finished, and that marker is in the
history at commit `bd706c17`.
