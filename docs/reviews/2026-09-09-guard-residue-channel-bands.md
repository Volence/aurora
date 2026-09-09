# GUARD-SEAT-RESIDUE, the last two: `channel-bands.ts`, plus `ramp-sign-lag.ts`

Branch `parcel/guard-residue-channel-bands`, base `9ee4859d`. Written as the
work was formed, not after.

`GUARD-SEAT-RESIDUE` has now been worked five times. The first
(`docs/reviews/2026-09-09-guard-residue-validators.md`) took
`json-schema-subset.ts` and the collision tree; the second
(`docs/reviews/2026-09-09-guard-residue-scene-ui.md`) took `section-wiring.ts`
and `scene-ui.ts`; the third (`docs/reviews/2026-09-09-guard-residue-preset.md`)
took `preset.ts` and `curve-rate.ts`; the fourth
(`docs/reviews/2026-09-09-guard-residue-ramp.md`) took `ramp-scroll-mode.ts` and
`preset-lag.ts`. All four named the same remainder. This packet takes what is
left of it: `channel-bands.ts`, the main target, and `ramp-sign-lag.ts`.

**THE HEADLINE IS THE POPULATION AND NOT THE PERCENTAGE.** 26 percent is the
lowest number this row has produced. That is the expected result for this file
and it is stated up front so nobody has to decide whether it is a verdict on the
work: `channel-bands.ts` is almost entirely MODULE-LOAD DERIVATION over a
vendored sidecar, which is the class the `preset.ts` parcel measured at 2 killed
of 29, and the previous parcel scored 79 percent precisely because neither of
its two files had that half at all. The ratio measures which file was picked.

## 0. The environment, measured before anything rests on it

`grep` in this shell is a ugrep wrapper carrying `--ignore-files`, so it honours
`.gitignore` and returns a clean, quiet **zero** for an ignored path. Measured
with a canary rather than assumed. The first attempt at the canary was itself a
false negative and is reported rather than tidied: this worktree has **no
`node_modules/` directory at all** (node resolves the main checkout's by walking
up), so writing the canary into `node_modules/` failed and BOTH greps returned
rc 1, which looks exactly like "the wrapper is fine". The directory had to be
created first:

    $ mkdir -p node_modules && echo CANARY_CHB_XYZZY > node_modules/.canary-chb.txt
    $ git check-ignore -v node_modules/.canary-chb.txt
    .gitignore:1:node_modules/    node_modules/.canary-chb.txt
    $ grep -rl CANARY_CHB_XYZZY .          -> nothing, rc 1
    $ command grep -rl CANARY_CHB_XYZZY .  -> ./node_modules/.canary-chb.txt, rc 0

Consequence taken rather than noted: **both plant populations were enumerated by
reading the module end to end**, and every plant's anchor text was proved to
occur exactly once by a Python `str.count` over the file's bytes, never by a
grep. All anchors were unique on the first pass.

Second environment fact, because the brief asked for both ends: there is **no
second React instance and no phantom failures here**. Base and tip are both exit
0 and every failure quoted below is one this parcel planted on purpose.

## 1. Baseline and after

`npm test` at base `9ee4859d`, **exit 0**:

    check-test-collection: OK: 581 test-shaped file(s) on disk, all 581 collected by vitest.
    Test Files  578 passed | 3 skipped (581)
         Tests  8652 passed | 9 skipped (8661)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (581 module(s) reported).

`npm test` at this parcel's tip, **exit 0**:

    check-test-collection: OK: 582 test-shaped file(s) on disk, all 582 collected by vitest.
    Test Files  579 passed | 3 skipped (582)
         Tests  8695 passed | 9 skipped (8704)
    skip-report: OK. Every skip named its reason.
    failure-class: no failures in this run (582 module(s) reported).

`8652 + 43 = 8695`, so the 43 new rows displaced nothing. The repo's own gate
counts 582 test-shaped files on disk and all 582 collected, the same 582 the
totals line counts. **Zero source lines changed anywhere in this parcel.**

A full `npm test` is 36 to 71 seconds here, so **every plant was scored against
the WHOLE suite**; no verdict below rests on a scope argument. The red-first
legs in section 7 are deliberately scoped to the one new file, because there the
question is whether ONE named row goes red.

## 2. What was inherited, and what changed

The previous parcel enumerated a 32-plant population for `channel-bands.ts` and
deliberately did not run it. **What it committed was the COUNT and the shape
guidance, not the membership** — the enumeration itself lived only in that
session. So there was no list to check line by line, and this is what was
actually inherited, all four of which held:

1. **The shape claim**: this file is module-load derivation over a vendored
   sidecar, so a plant through a caller will mostly survive. **Confirmed, and
   more sharply than predicted**: 28 of 30 refusal predicates survived.
2. **The instrument**: a POISONED SIDECAR and a re-import, the pattern
   `test/formats/effects-preset-boundary.test.ts` already owns for the preset
   schema. **Used as named, not replaced.** The one thing added to it is a
   second mock for `./preset`, because three of the guards compare aeon's
   sidecar against the PRESET SCHEMA's amplitude ladder and the poison has to be
   on the other document.
3. **`anchorFitAgainstBand`'s `travel > lines` already has both edges asserted**
   (`[6b]` in `effects-preset-anchors.test.ts`). **Confirmed by measurement**:
   `>` loosened to `>=` and tightened to `+ 1` were both killed, three rows each.
4. **The brief's "advisory tested a comfortable distance from its edge" class
   does not obviously live here.** Confirmed. It does not.

**What changed: the count.** Read end to end, this file holds **63 distinct
guard predicates**, not 32, and two more were added mid-parcel (section 6), for
**65**. The gap is not a disagreement about the file; it is that the earlier
enumeration counted GUARDS and this one counts PREDICATES. `edge()` is one guard
and four predicates: the record exists, the behaviour word matches, each pinned
phrase is present, and each refusal names the right end. The channels loader is
one guard and eight. That distinction is the whole finding of section 4, so
collapsing it would have hidden it.

## 3. The result

**65 plants, plus one edit that did not parse and was re-planted. 1 shown not to
discriminate (section 5). 64 scored: 17 killed, 47 survived, 0 unmeasurable
after the re-plant. 26 percent killed.** 46 of the 47 survivors are closed by 43
new rows in one new file, with **zero source lines changed**. The 47th is
reported and not closed.

| | plants | non-discriminating | scored | killed | survived |
|---|---|---|---|---|---|
| `channel-bands.ts` | 65 | 1 | 64 | 17 | 47 |

### THE PARTITION, WHICH IS THE FINDING AND IS NOT THE RATIO

The previous parcel's better cut applies here and discriminates far harder than
the ratio does. **Partition by what a predicate decides.** Membership is derived
programmatically from the plant table and published so the split can be checked
rather than taken:

| half of `channel-bands.ts` | scored | killed | survived |
|---|---|---|---|
| **WHICH ANSWER** — the value or verdict handed to a caller from a GOOD document | 25 | 15 | 10 |
| **WHETHER IT REFUSES** — that a BAD document is stopped at all | 30 | 2 | 28 |
| **WHICH WORDS** — which sentence the refusal speaks, and what it names | 9 | 0 | 9 |

- WHICH ANSWER: `CB14` `CB17` `CB19` `CB21` `CB32` `CB36` `CB38` `CB39` `CB40b`
  `CB42` `CB46` `CB49` `CB50` `CB51` `CB52` `CB53` `CB54` `CB55` `CB56` `CB58`
  `CB59` `CB60` `CB63` `CB64` `CB65`
- WHETHER IT REFUSES: `CB01`-`CB11`, `CB15` `CB16` `CB20` `CB22` `CB23` `CB26`
  `CB27` `CB28` `CB29` `CB33` `CB35` `CB37` `CB41` `CB43` `CB44` `CB45` `CB57`
- WHICH WORDS: `CB24` `CB25` `CB30` `CB31` `CB34` `CB47` `CB48` `CB61` `CB62`
- The one non-discriminating plant, `CB18`, is in none of them.

**Fifteen of twenty-five, then two of thirty, then ZERO OF NINE.** Taking the
two refusal halves together, which is what "a bad document arrives" actually
means: **2 killed of 39, five percent.**

### AND THE TWO KILLS IN THAT HALF ARE ONE INSTRUMENT, WHICH IS NOT A TEST OF THE MODULE

`CB12` and `CB13` are the travel-formula regex, and both were killed by
`test/formats/effects-channel-bands-prose-repin.test.ts` — which does not run
this module at all. It **extracts the regex literal from the source text** and
applies it to sentences of its own, precisely because (in its own words) the
module "parses the sentence at MODULE LOAD, against the one document it imports,
and exposes no seam to re-run it on another string."

So before this parcel, **the number of `channel-bands.ts` load-time guards held
by anything that executes the module was ZERO out of thirty-nine.** One file had
noticed the problem, solved it for the one predicate it cared about by reading
source text, and said out loud that there was no seam for the rest.

### WHAT A GREEN SUITE LOOKED LIKE WHEN ONE OF THESE GUARDS WAS WRONG

Measured, not argued. Six plants made the module throw at load (`CB14`, `CB17`,
`CB21`, `CB32`, `CB42`, `CB46`). Each produced, from the repo's own reporter:

    failure-class: 127 failure record(s) in 63 file(s) (68 failed test(s)).
      ASSERTION        0
      TIMEOUT          0
      UNCLASSIFIED   127

**Sixty-three files, and zero assertion failures.** They are collection errors:
the module threw, 63 unrelated test files could not be imported, and the rows
listed in the output are about camera clamps and undo entries. Per the reporting
rule that is **one finding wearing a big number**, and the part that matters for
this row is the other half of it: not one of those 127 records says anything
about the band contract. A reader looking at that output learns that something
threw and has to read the stack to find out which of sixteen sentences moved.

### THE THREE SURVIVORS THAT ARE NOT LOAD-TIME AT ALL

Three plants in the WHICH ANSWER half were predicted killed and were not. These
are reachable from a good document, today, through the running app.

- **`CB56`: a `cannot-fit` verdict reporting channel 0 instead of its own
  channel.** The refusal is reachable on channels 1 and 3 and unreachable on 0
  and 2 (0 and 2 are wider than the ladder's widest rung), so this mutation
  makes every refusal an author can actually earn name **the one channel that
  can never earn one**. The existing rows assert the verdict and the travel and
  the band's numbers; none asserts that the channel in the verdict is the
  channel that was asked about.
- **`CB58`: `hi < lo` loosened by one in `effectsChannelBandFromDocument`.** The
  bound exists so an inverted `lo`/`hi` pair from a document yields no band
  rather than a negative one. `hi === lo - 1` is the FIRST inverted pair and a
  bound off by one lets exactly it through, producing a band of ZERO lines that
  refuses every sweep including a zero-width one. The comfortable inverted case
  is asserted; the edge is not. This is the brief's class (c) after all, just not
  where the previous parcel expected it.
- **`CB39`: `EFFECTS_CHANNEL_BANDS_DECLARED`'s comparator reversed.** It is
  published as "the channels aeon declares a band for, ascending" and read into
  a sentence an author sees. Every existing row asserts the SET.

## 4. The plant table

65 plants, applied one at a time to a committed-clean file by exact string
replacement, each scored against the whole `npm test`, each restored with a
path-scoped `git checkout HEAD -- <that file>`. **65 of 65 clean restores**,
plus 47 more in section 7. The driver records per plant the `git diff -U0` of
the mutation AS IT SAT ON DISK, `git diff --stat`, the exit code, the wall time,
whether the restore left the path clean, vitest's own `Test Files` and `Tests`
lines, and the failing rows' titles.

| id | guard | mutation | axis | predicted | verdict |
|---|---|---|---|---|---|
| CB01 | the schema id is pinned | the check disabled | refuses | survived | SURVIVED |
| CB02 | the schema id is pinned to ONE version | widened to accept `/2` | refuses | survived | SURVIVED |
| CB03 | a prose leaf is a NON-EMPTY string | the emptiness half dropped | refuses | survived | SURVIVED |
| CB04 | `game` is a NON-EMPTY string | the emptiness half dropped | refuses | survived | SURVIVED |
| CB05 | `units` says SCREEN LINES 1:1 | that half disabled | refuses | survived | SURVIVED |
| CB06 | `units` says Do not convert. | that half disabled | refuses | survived | SURVIVED |
| CB07 | the two units clauses are BOTH required | `\|\|` loosened to `&&` | refuses | survived | SURVIVED |
| CB08 | how_to_use says travel > lines is a CERTAIN refusal | the check disabled | refuses | survived | SURVIVED |
| CB09 | how_to_use says CANNOT TELL, never a clearance | the check disabled | refuses | survived | SURVIVED |
| CB10 | how_to_use says `lines` is an INCLUSIVE COUNT | the check disabled | refuses | survived | SURVIVED |
| CB11 | the CANNOT-TELL interlock is the WHOLE clause | narrowed to `CANNOT TELL` alone | refuses | survived | SURVIVED |
| CB12 | the travel regex accepts ONLY the refusal tail | re-widened to accept `is <=` | refuses | killed | KILLED |
| CB13 | the travel regex is NARROW, not `.*` | the tail loosened | refuses | killed | KILLED |
| CB14 | the MULTIPLIER is read out of the sentence | capture groups swapped | decides | killed | KILLED |
| CB15 | a parsed multiplier of 0 is refused | the `< 1` half dropped | refuses | survived | SURVIVED |
| CB16 | a parsed base of 0 is refused | the `< 1` half dropped | refuses | survived | SURVIVED |
| CB17 | the fit is PEAK-TO-PEAK, not peak | the multiplier dropped (aeon's own 2x bug) | decides | killed | KILLED |
| CB18 | the shift is arithmetic | `>>` becomes `>>>` | (control) | non-discriminating | SURVIVED |
| CB19 | the multiply happens AFTER the shift | reassociated to `(m * b) >> s` | decides | non-discriminating | SURVIVED |
| CB20 | the ladder interlock RUNS at module load | the call deleted | refuses | survived | SURVIVED |
| CB21 | the interlock flags rungs that DISAGREE | the filter inverted | decides | killed | KILLED |
| CB22 | an EMPTY ladder is itself a refusal | the guard disabled | refuses | survived | SURVIVED |
| CB23 | ONE disagreeing rung is enough | the threshold loosened to `> 1` | refuses | survived | SURVIVED |
| CB24 | the disagreement names WHICH rung | the rung index hardcoded | words | survived | SURVIVED |
| CB25 | each number sits beside the document that states it | the two sides swapped | words | survived | SURVIVED |
| CB26 | `channels` is an object, and null is not one | the null half dropped | refuses | survived | SURVIVED* |
| CB27 | a channel key is an INDEX | the check disabled | refuses | survived | SURVIVED |
| CB28 | a channel key is a plain decimal | loosened to allow a sign and a fraction | refuses | survived | SURVIVED |
| CB29 | lo, hi and lines are each INTEGERS | the check disabled | refuses | survived | SURVIVED |
| CB30 | the integer census covers all THREE fields | `lines` dropped from the census | words | non-discriminating | SURVIVED |
| CB31 | hi < lo is refused with its OWN sentence | the check disabled | words | survived | SURVIVED |
| CB32 | `lines` is checked against an INCLUSIVE count | the count made exclusive in the CONDITION | decides | killed | KILLED |
| CB33 | `lines` is CHECKED rather than trusted | the check disabled | refuses | survived | SURVIVED |
| CB34 | the refusal REPORTS the count it expected | the reported count made exclusive | words | survived | SURVIVED |
| CB35 | a channel NAMES its source line | the emptiness half dropped | refuses | survived | SURVIVED |
| CB36 | a band record is frozen | the freeze dropped | decides | non-discriminating | SURVIVED |
| CB37 | a document declaring NO channels is refused | the check disabled | refuses | survived | SURVIVED |
| CB38 | the map is keyed by the NUMERIC index | keyed by the raw string key | decides | killed | KILLED |
| CB39 | the declared list is ASCENDING | the comparator reversed | decides | killed | **SURVIVED** |
| CB40 | the declared list is frozen | the freeze dropped | (did not parse) | non-discriminating | **UNMEASURABLE** |
| CB40b | the declared list is frozen | the freeze dropped, re-planted | decides | non-discriminating | SURVIVED |
| CB41 | an edge's declared BEHAVIOUR is pinned | the check disabled | refuses | survived | SURVIVED |
| CB42 | the hi edge behaves as `drop` | the expected word changed | decides | killed | KILLED |
| CB43 | the edge NOTE's phrases are pinned | the phrase loop's check disabled | refuses | survived | SURVIVED |
| CB44 | the hi note says it does NOT pin to hi | that phrase dropped from the list | refuses | survived | SURVIVED |
| CB45 | the lo note says the boundary STAYS VISIBLE | that phrase dropped from the list | refuses | survived | SURVIVED |
| CB46 | each edge reads ITS OWN record | both edges read the hi record | decides | killed | KILLED |
| CB47 | the missing-edge refusal names WHICH edge | hardcoded to hi | words | survived | SURVIVED |
| CB48 | the phrase refusal names the edge that moved | hardcoded to hi | words | survived | SURVIVED |
| CB49 | an edge record is frozen | the freeze dropped | decides | non-discriminating | SURVIVED |
| CB50 | behaviour and note keep their own fields | the two crossed | decides | killed | KILLED |
| CB51 | a channel with NO band gets `no-band` | the arm removed | decides | killed | KILLED |
| CB52 | the lookup is by the channel ASKED FOR | shifted by one | decides | killed | KILLED |
| CB53 | travel EQUAL to lines is CANNOT TELL | `>` loosened to `>=` | decides | killed | KILLED |
| CB54 | travel one line OVER is a CERTAIN refusal | `>` tightened by one | decides | killed | KILLED |
| CB55 | the two verdicts are the right way round | the arms swapped | decides | killed | KILLED |
| CB56 | the verdict names the band's OWN channel | the cannot-fit arm reports channel 0 | decides | killed | **SURVIVED** |
| CB57 | a document band's ends are INTEGERS | both integer checks dropped | refuses | survived | SURVIVED |
| CB58 | `lo > hi` yields NO band | the pair check loosened by one | decides | killed | **SURVIVED** |
| CB59 | a document band's `lines` is INCLUSIVE | the `+ 1` dropped | decides | killed | KILLED |
| CB60 | a document band is frozen | the freeze dropped | decides | non-discriminating | SURVIVED |
| CB61 | the refusal names the file and its sidecar | the naming dropped from the lead | words | survived | SURVIVED |
| CB62 | the refusal says not to trust the warning | that sentence dropped | words | survived | SURVIVED |
| CB63 | every refusal is a THROW | `Error` becomes `TypeError` | decides | non-discriminating | SURVIVED |
| CB64 | `AnchorBandFit` has no `fits` member | a `fits` arm added, nothing returns it | decides | survived | SURVIVED |
| CB65 | no code path hands back a clearance | the `fits` arm added AND returned | decides | killed | KILLED |

`*` **`CB26`'s FIRST run was KILLED and the verdict was wrong.** Its single red
was `test/config/prose-constant-fold.test.ts > says on its PASSING line that it
is not full coverage, with both counts`, a row that shells out to a gate twice
and took 6469ms against a 5000ms limit. The repo's own reporter said so in as
many words: `failure-class: EVERY failure above is a timeout or would-block.` It
was re-run and **SURVIVED**, and the verdict recorded is the re-run's. The same
row also appeared as a fourth record in `CB12`'s output, where three genuine
assertion failures were also present, so that verdict stands.

**This is why the brief's instruction to read the reporter's verdict rather than
a bare count is not a formality: one plant in sixty-five would have been scored
backwards by counting.**

## 5. What does NOT discriminate, and the seven predictions that were wrong

**`CB18` is the only plant in this parcel that provably cannot discriminate.**
`>>` and `>>>` differ only on a NEGATIVE left operand, and `TRAVEL.base` cannot
be negative twice over: it is captured with `(\d+)`, so no sign can survive the
parse, and the load-time guard rules out the one remaining value, zero. It is
removed from the denominator and **given a precondition row** that asserts both
halves rather than arguing them, in a place that can fail. Section 7 proves that
row red against `CB16`, the plant that ends its precondition.

**Seven other plants were predicted in writing to be non-discriminating and all
seven were wrong.** They are recorded as made:

- **`CB19`** (`m * (b >> s)` reassociated to `(m * b) >> s`) really is the same
  function on every rung the preset schema declares, which is what the
  prediction was about. It is NOT the same function below the ladder's floor:
  at `amp_shift 9` the contract's spelling gives 0 and the reassociated one
  gives 1. `boundary.ts` reaches `anchorTravelPx` with any integer `amp_shift` a
  document carries, so a document can reach the disagreement. Closed with a row.
- **`CB36`, `CB40b`, `CB49`, `CB60`** (four `Object.freeze` calls dropped).
  `Object.isFrozen` is a real observable and it changes, so these are genuine
  survivors, not controls. Closed with one row, because the band records are
  module singletons: `anchorBandFit` hands the SAME object to every caller and
  the panel puts it in a sentence, so a caller that could write to one would
  move the band for everybody for the life of the process with no other trace.
- **`CB30`** (`lines` dropped from the integer census) changes no VERDICT, which
  is what the prediction was about: a non-integer `lines` also fails the
  inclusive-count check one line down, because `hi - lo + 1` is an integer and
  the comparison is strict. It changes WHICH SENTENCE refuses, and the two point
  at different repairs ("aeon emitted a non-number" versus "aeon counts some
  other way"). It is scored on the words axis and closed.
- **`CB63`** (`throw new Error` becomes `throw new TypeError`) is the one plant
  in this parcel **reported and not closed**. The class is observable and
  nothing depends on it; a row asserting `err.constructor.name` would assert the
  spelling of a declaration rather than a property any caller reads. It is named
  here rather than given a row, and it is the only plant with neither a kill nor
  a test.

**And one plant did not COMPILE, which is a third outcome and not a kill.**
`CB40`'s first form removed `Object.freeze(` and left the trailing comma inside
a bare parenthesised expression, a syntax error. `npm test` exited 2 at
`check-prose-constants`, the twelfth script, and vitest never started. **The
scorer refused it:** absent vitest's own `Test Files` line the verdict is
`UNMEASURABLE`, and the driver printed what stopped the run:

    src/core/formats/effects/channel-bands.ts (syntax error at line 306: Expression expected.)
    check-prose-constants CANNOT RUN: 526 file(s) enumerated, 525 parsed. ...
    A partial run is NOT a pass.

Under an `rc != 0 => KILLED` rule this would have been scored as a kill by the
test suite. It was re-planted in a form that parses (`CB40b`) and survived.

## 6. The fourth class, and it is here too

`CB64` is the brief's class (d): **a guard whose failure is unobservable from
behaviour in the current state.** The module's headline claim is that a
reassuring "fits ✓" verdict is UNREPRESENTABLE rather than merely unwritten,
because a comment saying "do not add a pass" is one `||` away from being
ignored.

The RUN-TIME half of that is well held, and it was measured rather than assumed:
adding a `fits` arm to `AnchorBandFit` **and returning it** (`CB65`) reddens
three rows in `effects-preset-anchors.test.ts` and one in
`effects-preset-boundary.test.ts`.

The TYPE-LEVEL half is not held and cannot be from behaviour. Adding the arm to
the union and returning it from nowhere (`CB64`) left the entire suite green: no
consumer switches exhaustively on `verdict`, so an unreturned arm changes no
value anywhere. The honest instrument is the source text, and per the brief the
row **says when to retire itself**: the day a consumer switches exhaustively
over `AnchorBandFit['verdict']` (tsc then holds it and the row is noise), or the
day aeon amends `how_to_use` to state a fit direction (the arm is then
legitimate, and the module's load guards refuse the old wording anyway).

## 7. Red-first evidence

Every new row that closes a survivor was proven red against the plant it exists
for, with the mutation quoted from disk by `git diff -U0` before the run and the
path restored from the committed baseline after it.

**47 legs, every one red, and every one red BY ITS OWN ROW.** 46 close a
survivor; the 47th is `CB16`, run against the PRECONDITION row that makes `CB18`
a control, because a row asserting a precondition is worth nothing until it is
shown to fail when the precondition ends.

| plants | the row that went red |
|---|---|
| CB01, CB02 | another schema version is REFUSED, and the refusal names both versions |
| CB03 | an EMPTY prose leaf is refused, and the refusal names WHICH leaf |
| CB04 | an EMPTY or non-string `game` is refused |
| CB05, CB06, CB07 | BOTH units clauses are required, each on its own |
| CB08 | the CERTAIN-REFUSAL clause is pinned |
| CB09, CB11 | the NEVER-A-CLEARANCE clause is pinned WHOLE, not just its first half |
| CB10 | the INCLUSIVE-COUNT clause is pinned |
| CB05-CB10 | CENSUS: the five prose guards speak five DIFFERENT sentences |
| CB15 | a stated multiplier of ZERO is refused, and the refusal quotes it |
| CB16 | a stated base of ZERO is refused, and the refusal quotes it |
| CB16 | PRECONDITION: the parsed base is POSITIVE (the `CB18` control's own precondition) |
| CB19 | the travel is multiplier TIMES a shifted base, not a shifted product |
| CB20, CB22 | an EMPTY amplitude ladder is itself a refusal |
| CB20, CB23, CB24 | ONE disagreeing rung is enough, and the refusal names WHICH rung |
| CB20, CB23, CB25 | ...and it puts each number beside the document that states it |
| CB23 | the interlock RUNS: it is called at load, not merely declared |
| CB26, CB61 | a `channels` that is not an object is refused in the module's OWN words |
| CB27, CB28 | a key that is not a plain index is refused, and the refusal quotes the key |
| CB29, CB30 | a non-integer lo, hi or lines is refused, and the refusal names WHICH field |
| CB31 | hi < lo is refused with its OWN sentence, not the inclusive-count one |
| CB33, CB34 | a `lines` that is not the inclusive count is refused, and the count is REPORTED |
| CB35 | a channel that does not name its source is refused |
| CB37 | a document declaring NO channels at all is refused |
| CB39 | the declared list is ASCENDING, not merely the right set |
| CB41 | a changed behaviour word is refused, and the refusal quotes BOTH words |
| CB43, CB44, CB45, CB48 | ...and so does a note that lost a pinned phrase |
| CB47 | a MISSING edge record names WHICH edge is missing, in both directions |
| CB56 | a verdict names the band's OWN channel, on both arms and every channel |
| CB57, CB58 | a document band refuses a non-integer end, and hi one BELOW lo |
| CB36, CB40b, CB49, CB60 | nothing the module hands out can be mutated by a caller |
| CB61, CB62 | every refusal names the file and tells the reader not to trust the warning |
| CB64 | the union declares exactly the three verdicts the contract can support |

Several plants redden more than one row and that is reported rather than
trimmed. `CB20` (the interlock's call site deleted) reddens all four ladder
rows, which is the point: no single one of them is what proves the call is live,
and the fourth row says so in a place a reader will look.

## 8. The rows, and where they live

`test/formats/effects-channel-bands-guard-residue.test.ts`, 43 rows, beside the
two existing `channel-bands` files in `test/formats/`. It follows the poison
harness of `test/formats/effects-preset-boundary.test.ts` rather than inventing
a second one, with two additions:

- **A second mock, for `./preset`.** Three guards compare aeon's sidecar against
  the PRESET SCHEMA's amplitude ladder, so the poison has to be on the other
  document. `vi.importActual` supplies the rest of the module so only
  `ANCHOR_AMP_RUNGS` moves.
- **Two anti-vacuous rows on the harness itself, before anything rests on it.**
  The real vendored document must LOAD through the same harness (otherwise a
  file of refusals that refuse everything measures nothing), and a mocked leaf
  must reach an export (otherwise a `doMock` that silently failed to intercept
  would let every row read the real document and pass).

**Every row asserts the guard's own sentence, not merely that the module threw.**
Sixteen of these guards refuse for sixteen reasons naming different repairs, and
most of the poisons make the module throw from somewhere downstream anyway, so a
row asking only for a rejection would be green while its subject was gone. One
row is a CENSUS over five of them that requires the sentences to stay distinct,
because two guards sharing a sentence is how a row written for one silently
starts passing for the other.

**Both directions, everywhere it is a rule.** The `||` joining the two units
clauses is asserted from each side singly, so an `&&` fails; the schema pin is
asserted to refuse three wrong values and accept the right one; the edge
refusals are asserted to name `hi` when hi moved and `lo` when lo moved, and
explicitly NOT to name the other; `hi === lo - 1` is refused and `hi === lo` is
accepted as a legal one-line band.

## 9. `ramp-sign-lag.ts`

See section 10.

## 10. Where the budget ended, named so nobody reads it as covered

Filled in at the end of the parcel.
