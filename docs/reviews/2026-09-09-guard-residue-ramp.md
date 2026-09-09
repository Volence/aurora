# GUARD-SEAT-RESIDUE, the named remainder: `ramp-scroll-mode.ts`, plus `preset-lag.ts`

Branch `parcel/guard-residue-ramp`, base `736988d4`. Written as the work was
formed, not after, so a death costs the run and not the read.

`GUARD-SEAT-RESIDUE` has now been worked four times. The first parcel
(`docs/reviews/2026-09-09-guard-residue-validators.md`) took
`json-schema-subset.ts` and the collision tree; the second
(`docs/reviews/2026-09-09-guard-residue-scene-ui.md`) took `section-wiring.ts`
and `scene-ui.ts`; the third
(`docs/reviews/2026-09-09-guard-residue-preset.md`) took `preset.ts` and
`curve-rate.ts`. All three named the same four small modules as unreached:
`ramp-scroll-mode.ts`, `preset-lag.ts`, `channel-bands.ts` and
`ramp-sign-lag.ts`. This packet takes the first two of them, scored end to end,
and says plainly which two it did not reach.

`ramp-scroll-mode.ts` leads because of what its `'unknown'` state is. Its two
reporters answer a union in which `'unknown'` ("I could not look") sits beside
`'full'` / `'column'` ("I looked, and this is what the scene says") -- the
one-value-two-meanings shape that surfaced five times in a day in this suite. It
was the only instance that was **named, located and unplanted**, so it was the
cheapest one available.

**AND THE SHAPE WAS THERE, one road over from where the brief pointed.** The
union itself is well held: every arm is asserted and every mutation that
collapsed one into another died. What was NOT held is the four-way `unknown`
REASON, and only on one of its two roads. `section-dangling` versus
`section-unreadable` is asserted by an existing row and a plant there died;
`act-dangling` versus `act-unreadable` is asserted by nothing, and reporting a
missing act-default scene with the unreadable-file sentence left the entire
suite green. Partial coverage on a two-road guard reads as covered from
everywhere except a mutation.

## 0. The environment, measured before anything rests on it

`grep` in this shell is a ugrep wrapper carrying `--ignore-files`, so it honours
`.gitignore` and returns a clean, quiet **zero** for an ignored path. Measured
with a canary rather than assumed:

    $ echo CANARY_RAMP_XYZZY > node_modules/.canary-ramp.txt
    $ git check-ignore -v node_modules/.canary-ramp.txt
    .gitignore:1:node_modules/    node_modules/.canary-ramp.txt
    $ grep -rl CANARY_RAMP_XYZZY .          -> nothing, rc 1
    $ command grep -rl CANARY_RAMP_XYZZY .  -> ./node_modules/.canary-ramp.txt, rc 0
    $ typeset -f grep
    ... ARGV0=ugrep "$_cc_bin" -G --ignore-files --hidden -I --exclude-dir=.git ...

Consequence taken, not merely noted: **both plant populations were enumerated by
reading the module end to end**, and each plant's anchor text was proved to occur
exactly once by a Python `str.count` over the file's bytes, never by a grep. All
48 anchors were unique on the first pass.

Second environment fact, because the brief warned that worktrees differ: this
worktree's `node_modules/` holds only `.vite`, so node resolves the main
checkout's `node_modules` by walking up. There is **no second React instance and
no phantom failures** here: base and tip are both exit 0, and every failure
quoted below is one this parcel planted on purpose.

Third: aeon is present at `origin/master` `b0f1927e`, so the drift rows that read
a peer repo MEASURED rather than skipping. One plant (`RS03`) was killed by
`test/formats/aeon-vsram-mode-drift.test.ts`, which could not have happened in a
worktree without the peer.

## 1. Baseline and after

`npm test` at base `736988d4`, **exit 0**:

    check-test-collection: OK: 579 test-shaped file(s) on disk, all 579 collected by vitest.
    Test Files  576 passed | 3 skipped (579)
         Tests  8635 passed | 9 skipped (8644)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (579 module(s) reported).

`npm test` at this parcel's tip, **exit 0**:

    check-test-collection: OK: 581 test-shaped file(s) on disk, all 581 collected by vitest.
    Test Files  578 passed | 3 skipped (581)
         Tests  8652 passed | 9 skipped (8661)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (581 module(s) reported).

**Seventeen rows added** in two new files, and `8635 + 17 = 8652`, so nothing was
displaced. Both new files are collected: the repo's own gate counts 581
test-shaped files on disk and all 581 collected, which is the same 581 the totals
line counts. **Zero source lines changed anywhere in this parcel.**

A full `npm test` is 38 to 75 seconds on this machine, so **every plant was
scored against the WHOLE suite.** No verdict below rests on a scope argument. The
red-first proofs in section 6 are deliberately scoped to the two new files,
because there the question is whether ONE named row goes red.

## 2. Method, and the scorer's own guard

The unit is the **guard predicate**: one condition whose truth changes what the
module says, refuses or hands back. Every plant was applied to a committed-clean
file by exact string replacement (refusing unless the anchor occurred exactly
once), run, and restored with a path-scoped `git checkout HEAD -- <that file>`.
The driver records per plant the `git diff -U0` of the mutation as it sat on
disk, `git diff --stat`, the exit code, the wall time, whether the restore left
the path clean, vitest's own `Test Files` and `Tests` lines, and the titles of
the failing rows. **48 plants, 48 clean restores**, plus 12 more in section 6,
all restored clean.

### The scorer refuses a run that never reached vitest

`npm test` here runs **fifteen check scripts and a typecheck before vitest**. A
previous parcel scored **nine false kills** against a run that died at the
twelfth script, because `rc != 0` was read as KILLED. So the verdict here comes
from **vitest's own `Test Files` line and nothing else**: absent, the verdict is
`UNMEASURABLE` and the driver keeps the log and prints what stopped the run. A
green baseline is not a control for this, because that poison arrived mid-parcel,
so the check is per run.

**It did not fire this time, and one thing was done to keep it that way:**
nothing was written into the repository tree while plants were running. The one
file that did exist on disk uncommitted throughout (this packet) was checked
against `check-cited-paths`, `check-doc-citations`, `check-guide-text` and
`check-prose-constants` **before** the first plant, all four rc 0, precisely
because a document is inside several of those gates' populations and a mid-parcel
poison is indistinguishable from a kill.

### The controls

Five plants were predicted **in writing before the run** to be incapable of
discriminating at all: `RS10`, `RS24`, `RS27`, `PL02`, `PL16`. **All five
survived, in a batch that killed 34 others.** A batch with no predicted survivor
cannot detect that its own scorer has stopped working, and that is how the
previous parcel's nine void verdicts were caught.

The predictions were wrong in both directions and are recorded as made, not
retro-fitted: **seven plants predicted to survive were killed** (`RS03`, `RS04`,
`RS06`, `RS22`, `RS23`, `RS31`, `RS32`) and **three predicted to be killed
survived** (`RS11`, `RS18`, `PL13`). I under-estimated this surface's coverage
substantially, which is itself the honest headline of section 3.

## 3. The result

**48 plants. 5 shown not to discriminate (section 5). 43 scored: 34 killed, 9
survived, 0 unmeasurable, 0 uncompilable -- 79% killed.** All 9 survivors are
closed by 17 new rows across 2 new files, with **zero source lines changed.**

| file | plants | non-discriminating | scored | killed | survived |
|---|---|---|---|---|---|
| `ramp-scroll-mode.ts` | 32 | 3 | 29 | 22 | 7 |
| `preset-lag.ts` | 16 | 2 | 14 | 12 | 2 |
| **total** | **48** | **5** | **43** | **34** | **9** |

### THE SHAPE, WHICH IS THE FINDING AND IS NOT THE RATIO

**79% is the highest this row has measured, and the reason is structural rather
than a compliment.** The three previous parcels' finding was a split between
guards a committed document exercises (which die readily) and guards that exist
so a FUTURE schema amendment cannot pass silently (which died at 8 of 20, then 2
of 29). **Neither of these two files has a module-load derivation half at all.**
Every predicate in both is a hand-written sentence assembled from constants and
from a join over documents a test can build in memory, so the class with no
artifact is simply absent from the population. The ratio measures which file was
picked, not which suite is better.

What the ratio hides is that the survivors are not scattered. Split
`ramp-scroll-mode.ts` by what a predicate decides, and the two halves are not
close:

| half of `ramp-scroll-mode.ts` | scored | killed | survived |
|---|---|---|---|
| WHICH ANSWER (constants, hover note, census, arm selection, silence gate) | 16 | 16 | 0 |
| WHICH WORDS (the five clause helpers, once the arm is already known) | 13 | 6 | 7 |

The membership is stated so it can be checked rather than taken: WHICH ANSWER is
`RS01`-`RS06`, `RS19`-`RS23`, `RS25`, `RS26`, `RS30`, `RS31`, `RS32`; WHICH WORDS
is `RS07`-`RS09`, `RS11`-`RS18`, `RS28`, `RS29`. The three non-discriminating
plants are in neither.

**Sixteen of sixteen, then six of thirteen, and every survivor in the parcel is
in the second half.** Every existing row asserts the
LEAD that comes out and that the section indices and scene ids appear in the
text. None asserts the words BETWEEN them. So the sentence could name one scene
twice (`RS09`), lose its singular form and read `their scenes  and "sky"`
(`RS11`), tell an author to open the act when the answer is on the section
(`RS12`), emit a dangling `; and ` in front of a lone clause (`RS18`) or name one
preset twice (`RS29`), and every row stayed green because the lead was right and
the id was still a substring.

### And the sharp one, which is not a grammar nicety

**`RS15`: partial coverage on a two-road guard.** `unknownClause` has four
reasons over two roads. Reporting a missing SECTION scene with the
unreadable-file sentence is caught (`RS14`, killed). Reporting a missing ACT
DEFAULT scene with the unreadable-file sentence is caught by nothing. They are
different repairs -- make the scene, or fix the file -- and an author sent at the
wrong one has been misdirected by a sentence whose whole job is to say which
failure it was. The existing row that covers the section road is one
`expect(...).toContain('is not a scene in this project')`, and a single find
retired the search.

### `preset-lag.ts`'s two survivors are neither an arm nor a clause

They are the two facts ABOUT the sentence that live outside it.

- **`PL07`, THE DATE.** `PRESET_LAG_MEASURED_ON` is the staleness bound the whole
  hold rests on and is printed twice inside the disclosure. Every row that
  touches it READS THE CONSTANT, so moving the constant a month back moved every
  reader with it and nothing noticed. The module's own docblock had already
  diagnosed this class one layer up: between the arming and the retirement its
  header banner still read `RETIRED (AGAIN) 2026-09-03` while the constant below
  held `['boundary']`, and it records why nothing caught it -- *"Nothing measured
  the banner, so nothing went red."*
- **`PL13`, THE DEFAULT ARGUMENT, and it is a class the brief did not list.**
  `presetLagDisclosure`'s default parameter IS `PRESET_KEYS_AWAITING_AEON`, and
  that identity is the module's stated contract that re-filling ONE list re-arms
  the disclosure at all five mount sites. Detaching it to a fresh `[]` left the
  whole suite green -- and **no behavioural row anywhere could have caught it.**
  While the premise is retired the constant IS `[]`, so the two defaults are the
  same function for every input. The existing poison row stubs the constant
  through `vi.doMock` and it does not reach this either: a default expression
  resolves against the module's OWN binding, not against what an importer was
  handed, and the leaf reads the constant explicitly anyway. **The failure is
  unobservable from behaviour in the current state**, which is a fourth class
  beside the brief's three, and the honest instrument is the source text.

## 4. The plant tables

### 4a. `ramp-scroll-mode.ts`, 32 plants: 22 killed, 7 survived, 3 non-discriminating

| id | guard | mutation | predicted | verdict |
|---|---|---|---|---|
| RS01 | `RAMP_SCROLL_COLUMN_SPAN` is the MEASURED strip | tidied to `{first: 0, last: 15}` | killed | KILLED |
| RS02 | `RAMP_SCROLL_COLUMN_WIDTH_PX` is the hardware granule | 16 px becomes 8 | killed | KILLED |
| RS03 | the provenance revision in the hover | a different sha | survived | KILLED |
| RS04 | the CONJUNCT is said rather than dropped | the demo-game half deleted | survived | KILLED |
| RS05 | it is `v_deform`, NOT `deform_fg`/`deform_bg` | the disambiguating sentence deleted | killed | KILLED |
| RS06 | the strip position is marked RELAYED | the relayed marker dropped | survived | KILLED |
| RS07 | `sectionList` plural selection | always plural | killed | KILLED |
| RS08 | `sectionList` last-element join | the final `and N` names the FIRST index | killed | KILLED |
| RS09 | `sceneList` deduplicates | the dedupe dropped | survived | SURVIVED |
| RS10 | `sceneList` skips a null `sceneId` | a null id is rendered | non-discriminating | SURVIVED |
| RS11 | `sceneList` singular form | the singular arm deleted | killed | SURVIVED |
| RS12 | `viaClause` names BOTH roads when both are used | mixed described as act-only | survived | SURVIVED |
| RS13 | `viaClause` is silent when every section names its own | the section-only case claims the act | killed | KILLED |
| RS14 | `section-dangling` and `section-unreadable` differ | missing reported as unreadable | killed | KILLED |
| RS15 | `act-dangling` and `act-unreadable` differ | missing reported as unreadable | survived | SURVIVED |
| RS16 | `act-unset` names the document Aurora does not read | collapsed to the generic sentence | killed | KILLED |
| RS17 | the default arm does NOT guess a reason | a reason-less unknown reported as act-unset | survived | SURVIVED |
| RS18 | `joinClauses` single-part early return | one clause gains a leading `; and ` | killed | SURVIVED |
| RS19 | the disagreement census counts NON-EMPTY groups | it counts all three | killed | KILLED |
| RS20 | TWO disagreeing groups take the split arm | `groups > 1` tightened to `> 2` | killed | KILLED |
| RS21 | an UNBOUND preset asserts neither arm | the unbound test can never fire | killed | KILLED |
| RS22 | the capability conjunct rides the COLUMN arm | it rides the FULL arm | survived | KILLED |
| RS23 | the column arm publishes the measured span | it prints the tidy `0-15` | survived | KILLED |
| RS24 | the two single-answer arms are mutually exclusive | the arms tested in the other order | non-discriminating | SURVIVED |
| RS25 | every arm hands back the SAME contract text | the short text is handed back as the contract | killed | KILLED |
| RS26 | `vDeformRampSentence` is silent only with NOTHING to say | `&&` loosened to `\|\|` | killed | KILLED |
| RS27 | the narrowed partition tests for `'ramp'` | spelled as the complement of the other member | non-discriminating | SURVIVED |
| RS28 | `preset-dangling` and `preset-unreadable` differ | the two swapped | killed | KILLED |
| RS29 | `presetList` deduplicates | the dedupe dropped | survived | SURVIVED |
| RS30 | the two V-deform leads are told apart | the CANNOT-READ arm painted with the confident lead | killed | KILLED |
| RS31 | `V_DEFORM_RAMP_NOTE` quotes the chain | the quoted note dropped from the tail | survived | KILLED |
| RS32 | the narrowed V-deform arm carries the conjunct | the conjunct sentence dropped | survived | KILLED |

### 4b. `preset-lag.ts`, 16 plants: 12 killed, 2 survived, 2 non-discriminating

| id | guard | mutation | predicted | verdict |
|---|---|---|---|---|
| PL01 | an EMPTY lag yields NO sentence | the empty test can never fire | killed | KILLED |
| PL02 | the singular/plural selector | `=== 1` loosened to `<= 1` | non-discriminating | SURVIVED |
| PL03 | the singular/plural selector | inverted to `=== 2` | killed | KILLED |
| PL04 | the key list names the LAST key last | it names the first | killed | KILLED |
| PL05 | key names are code spans | the backticks dropped | killed | KILLED |
| PL06 | `PRESET_LAG_LEAD` | the lead reworded | killed | KILLED |
| PL07 | the measurement DATE inside the sentence | moved back a month | survived | SURVIVED |
| PL08 | the sentence names the PAGE, not the generator source | it names `tools/effects_gen.py` | killed | KILLED |
| PL09 | the premise itself is EMPTY | re-armed with `['boundary']` | killed | KILLED |
| PL10 | the SHARPER flavour: the WHOLE DOCUMENT is refused | softened to partial lowering | killed | KILLED |
| PL11 | the sentence says nothing below reaches a ROM | the no-ROM clause dropped | killed | KILLED |
| PL12 | the disclosure carries its own EXPIRY | the expiry clause deleted | killed | KILLED |
| PL13 | the default argument IS the premise constant | detached to a fresh `[]` | killed | SURVIVED |
| PL14 | subject-verb agreement | always the plural verb | killed | KILLED |
| PL15 | the measurement names the row that can retire the sentence | it names a test file that does not exist | killed | KILLED |
| PL16 | the premise list is FROZEN | `Object.freeze` dropped | non-discriminating | SURVIVED |

## 5. What does NOT discriminate, and why

Five plants change the source and cannot change any outcome. Each is removed from
the denominator rather than counted as a survivor, and **each is given a row
asserting its own PRECONDITION**, in a place that can fail, so the claim goes red
the day the precondition ends rather than this document quietly being wrong.
Section 6 proves all three of the ramp ones red against a precondition-breaking
plant.

- **`RS10`, `sceneList`'s null-id filter.** `sceneList` is only ever called on
  the `full` and `column` groups, and a binding lands in one of those only when a
  scene was FOUND, with the id it was found by in the field. The precondition row
  drives the join over six configurations and requires every decided binding to
  carry a non-null id, and the mirror: a null id occurs only on `act-unset`, the
  one reason with no scene to name.
- **`RS24`, the order of the two single-answer arms.** Both are reached only when
  the census says exactly ONE group is non-empty, because two non-empty groups
  take the split arm one branch earlier. Reordering them is the same function.
  The precondition row requires a set holding both a `full` and a `column`
  binding to take the split arm, and requires each alone to take its own, so the
  first half is not vacuous.
- **`RS27`, `carries === 'ramp'` versus `carries !== 'unknown'`.**
  `VDeformRampBinding.carries` is a closed two-member union, so the two spellings
  are one predicate. That is a property of the type and stops being one the day a
  third member is added, so it is pinned over the join: every row the provider
  emits is one of exactly two members, both are reachable, and `reason` is
  non-null on exactly one of them.
- **`PL02`, `keys.length === 1` loosened to `<= 1`.** The empty list has already
  returned `null` one line above, so length is at least 1 wherever the selector is
  read and the two are the same test.
- **`PL16`, dropping `Object.freeze` from the premise list.** Nothing in the tree
  writes to that array, so no existing caller can observe the freeze. Recorded
  rather than closed: a row asserting "this array is frozen" would assert the
  spelling of the declaration and not a property anything depends on, and the
  premise is `[]` today so there is nothing to protect. It is reported here rather
  than given a row, and it is the one plant in this parcel with neither.

## 6. Red-first evidence

Every new row that closes a survivor was proven red against the plant it exists
for, with the mutation quoted from disk by `git diff -U0` before the run and the
path restored from the committed baseline after it. The runs are scoped to the
two new files, deliberately: the question is whether ONE named row goes red.

**Twelve legs, every one red, and every one red BY ITS OWN ROW.**

Nine against the survivors:

| plant | the row that went red |
|---|---|
| RS09 | two sections bound to the SAME scene name it ONCE, in the singular |
| RS11 | one scene is `its scene`, two scenes are `their scenes A and B`, with no dangling joiner |
| RS12 | act only, section only, and MIXED are three different clauses |
| RS15 | the ACT road tells a MISSING scene apart from an UNREADABLE one |
| RS17 | an unknown with NO reason says only that, and does not guess the act default |
| RS18 | one unknown section reads as a sentence, two are joined with `; and ` |
| RS29 | two sections binding the SAME preset name it ONCE, in the singular |
| PL07 | every CURRENT banner carrying a date carries the measured-on date |
| PL13 | the default argument names the premise constant, not a fresh empty list |

Three more against the PRECONDITIONS of section 5's non-discriminating plants,
because a row asserting a precondition is worth nothing until it is shown to fail
when the precondition ends:

| plant | mutation | the row that went red |
|---|---|---|
| PRE10 | `rampScrollBindings` emits a decided binding with `sceneId: null` | a DECIDED binding always carries the scene that decided it |
| PRE24 | the split arm can never fire (`groups > 9`) | a binding set with BOTH arms in it never reaches either single-answer arm |
| PRE27 | the ramp branch reports `carries: 'unknown'` | `carries` has exactly two members, and `reason` is set on exactly one of them |

`RS11` and `RS15` each reddened TWO rows, which is reported rather than trimmed:
dropping the singular scene form breaks both `sceneList` rows, and swapping the
act road's two reasons breaks both the act-road row and the four-sentences
census. Neither was written to catch the other; the overlap is the census row
doing its job.

## 7. What the new rows are, and where they live

- `src/renderer/providers/__tests__/effects-preset-ramp-scroll-guard-residue.test.ts`
  (13 rows). It lives beside the provider tests rather than under
  `src/core/formats/effects/__tests__/` because three of its rows have to drive
  the JOIN (`rampScrollBindings`, `vDeformRampBindings`) to pin a precondition,
  and the sentence rows drive `rampScrollModeSentence` / `vDeformRampSentence`
  directly, since several survivors are only reachable through the exported
  signature and not from any binding the provider can build (`RS17` is exactly
  that: the provider sets a reason on every unknown, so `unknownClause`'s default
  arm is unreachable from the join and reachable from the module's own API).
- `src/core/formats/effects/__tests__/preset-lag.test.ts` (4 rows). The banner
  interlock, the date reaching the reader in both numbers, the source-level
  default-argument row, and the behavioural half of the default-argument claim,
  which is **labelled vacuous today in its own comment** and kept because it
  becomes the load-bearing one the moment the premise re-arms.

## 8. Where the budget ended, named so nobody reads it as covered

- **`ramp-scroll-mode.ts` is planted end to end** (32 plants over every predicate
  it holds: five constants, the four clause helpers, the census, all five arms of
  `rampScrollModeSentence` and both arms of `vDeformRampSentence`). What is NOT
  planted in it: the type declarations and the docblocks, which carry no
  predicate.
- **`preset-lag.ts` is planted end to end** (16 plants over its four constants
  and every predicate in `presetLagDisclosure`).
- **`channel-bands.ts` (440 lines) and `ramp-sign-lag.ts` (327) are STILL
  UNPLANTED, and nothing here is claimed about either.** A 32-plant population
  for `channel-bands.ts` was enumerated from the source and then deliberately NOT
  run: a plant batch takes the tree, so no test can be written or verified while
  one is in flight, and a third file's runs would have been half an hour in which
  the two files already scored could not be closed. Two files scored and closed
  beat three scored and one closed. That is the same judgement the last two
  parcels made and I would make it again.
- **What the next parcel needs for `channel-bands.ts`, since its shape is the
  opposite of this one's.** It is almost entirely module-load derivation over a
  vendored sidecar -- the class that died at 2 of 29 in the `preset.ts` parcel --
  so a plant through a caller will mostly survive and the instrument is a
  POISONED SIDECAR and a re-import. That instrument already exists and was read
  during this parcel: `test/formats/effects-preset-boundary.test.ts` does
  `vi.doMock` on the schema module and `await import`s the codec against it. The
  module imports its data as `import bandsJson from './aeon-effects-channel-bands.json'`,
  which is mockable the same way. Its one predicate that is NOT module-load,
  `anchorFitAgainstBand`'s `travel > lines`, already has both edges asserted
  (`[6b]` in `effects-preset-anchors.test.ts` pins `travel == lines` as
  `cannot-tell` and `lines + 1` as `cannot-fit`), so the brief's third class does
  not obviously live there.
- **`PL16` is reported and not closed** (section 5), and it is the only plant in
  this parcel with neither a kill nor a row.
- **The `??` sites across the effects tree** remain unenumerated. That was the
  first parcel's blind spot 1 and it has now been open through four.
- **No runtime confirmation anywhere.** No emulator touched, none attempted:
  every row in this parcel is a pure-function assertion over in-memory documents.
