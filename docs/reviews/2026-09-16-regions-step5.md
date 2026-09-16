# Regions step 5 (EDITOR spec): the command, the save plan, and the load-time notices

2026-09-16, branch `regions-step5` off master `9893d69e`, tip `7df953cd`
(the totals below were taken at `51b3da88`, the last commit that touches code;
`7df953cd` is this packet and the ROADMAP row).

⚠ **STEP 5 OF THE EDITOR SPEC** — empyrean's `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`, read at `origin/main`, never through a sibling path. **Not** part 2's step 5: the two specs number their
steps independently and the collisions are live (part 2's step 10 IS the editor
spec's step 1). Every step number in this document is the editor spec's.

Its §7 row 5, verbatim:

> | 5 | aurora | `SetRegionsCommand` and history cases; load/save plan entries under `dataPath` (understood/unreadable split); load-time validation notices (§2.5 rules 1 to 3) | `aeon-save.test.ts` shape: plan contains the file when regions exist, absent otherwise; undo/redo round trip | S |

Step 4 landed first: the codec (`docs/reviews/2026-09-16-regions-codec.md`) and the
flattening against aeon's shared golden (`docs/reviews/2026-09-16-regions-seam-leg.md`).
Nothing here re-derives either.

## The headline: three findings, each one a value that meant two things

**1. `RegionsDocument | null` on the act is not enough, and the second meaning is
the destructive one.** `null` would say BOTH "this act has no regions" and "this
act has a `regions.json` Aurora refused", and those lead the save to opposite
actions: create nothing, versus remove or overwrite the very file the refusal was
protecting. `ActRegionsState` (`src/core/formats/regions/act-regions.ts`) spells
three states instead — absent, understood, refused — and its header carries the
table. It is the same defect class `ActSectionFileLedger` was built for, at a new
document.

**2. The meta/chunklinks three-way shape does not transcribe here, and the
CONTRACT is what forbids it.** Those two sidecars answer "the author emptied
this" by writing an empty body over the stale file. `regions` is `minItems: 1` in
`src/core/formats/regions/aurora-regions.schema.json`, so **there is no cleared
regions document to write**. The honest answer to "the author deleted every
region" is to REMOVE the file — which is the dangerous direction, so it is gated
on `Act.regions.loadedPath`, what this session actually READ, and never on a path
the save derived and probed for. That is `removalsFor`'s own argument
(`src/core/project/aeon/save.ts`) applied to a document it does not cover.

**3. Aurora had no way to answer rule 3's preset half without producing FALSE
refusals.** A region's `preset` names an `EffectsPreset` record in the game's
effects library (ruling Q8), and `SectionRasterWiring`'s three existing maps are
each a strict SUBSET of that library — `bindings` is what the descriptor binds,
`threadedBy` what calls one chooser, `patchedArm` what binds an arm. Using any of
them as a membership test would have reported a real record as unresolvable: a
refusal Aurora speaks in aeon's name that aeon never made.
`libraryPresetRecordNames` extracts the vocabulary itself.

### And the pattern of that extractor is load-bearing in a way a first draft gets wrong

MEASURED against aeon's real `games/sonic4/data/effects/ojz_effects.emp`, not
assumed: a `: EffectsPreset` pattern with ONE literal space finds **3** records.
The file aligns its columns — `pub data OJZ_Preset_Sec0:  EffectsPreset = preset(…)`,
two spaces — so seven of the ten are missed. With `\s*` it finds all **ten**,
which are exactly the ten presets aeon's shared golden binds.
`OJZ_Preset_NightSnap` is declared `[EffectsPreset; OJZ_PRESET_NIGHT_SNAP_LEN]`, a
DEBUG-gated look fixture that no region can bind, and it is excluded by the
pattern (the colon sits immediately before the type) rather than by a name list.

The row that holds this is in
`src/core/formats/effects/__tests__/section-wiring.test.ts`, inside the block that
reads aeon at `AEON_REGIONS_PIN` through git objects. **Its expectation is derived
from the descriptor's own region rows**, never a literal list, so a re-pin that
adds or renames a preset needs no edit there.

**Its control had to be re-cut against a measurement, and that is worth keeping.**
The first version asserted "some declared record is NOT bound by a region row", as
the anti-superset control. It went RED: at that pin the declared set and the bound
set are EXACTLY EQUAL, so the assertion was false about aeon rather than about
Aurora. The control is now the TYPE FILTER — the library declares far more
`const`/`data` records than it declares `EffectsPreset`s — with both counts
derived from the same text.

## What each half of row 5 actually is

### `SetRegionsCommand` and the history cases

`src/core/editing/commands.ts`, `src/core/editing/history.ts`. Type `set-regions`,
whole `regions.json` old/new, `sectionIndex: -1` (act-ambient), one case pair in
`applyCommand`/`undoCommand` on the `set-effects-scene` precedent.

Whole-document rather than a per-rect delta because the owner's Q1 ruling
(2026-09-14T14:54:34Z, "cut right away") made carve the DEFAULT: one drag rewrites
every neighbouring rectangle, and "Migrate sections" rewrites the act. A delta
would make one gesture N undo steps and let Ctrl+Z stop in the middle of a carve,
in a state no author ever drew. The document is tens of rectangles, so the memory
argument that forces deltas on `set-tiles` does not arise.

`writeActRegionsDocument` is the ONE writer both directions go through, and it
**moves `document` and nothing else**: `loadedPath` and `unreadable` are the LOAD's
verdict about a file on disk, and clearing `unreadable` from an edit would
reintroduce, from the other side, the collapse the save's gate exists to prevent.
It also clones on the way in, so the act and a command can never share one object
whatever a future call site forgets.

Routing needed no change — `set-regions` is absent from
`ZONE_SCOPED_COMMAND_TYPES`, so `commandDocId` sends it to the current act — but
that is now asserted rather than assumed, with the zone-scoped answer beside it as
the anti-vacuous control.

### The load, the save, and the understood/unreadable split

`src/core/project/aeon/load.ts` reads `{dataPath}regions.json` per act.
`src/core/project/aeon/save.ts` writes, removes or refuses it.

Two things the load does that are easy to get wrong and are written down at the
site:

* **`regions.json` must NOT enter `ledger.loaded`.** That ledger is the
  stranded-`section_N` sweep's permission to delete, and a path in it that the
  section loop does not re-write on the next save is a path the save unlinks.
  Mutation M11 below is that defect, and it turns four rows red.
* **A probe that could not answer means the file MAY be there.** `markUnreadable`'s
  rule, spelled out at this site because there is no `Section` to mark. Guessing
  'absent' would make the save's gate unreachable for exactly the failures that
  need it most.

The refusal gets its own notice rather than joining `unreadableFiles`, whose
folded plural sentence says "N SECTION FILES" — true of everything else in that
collection and false of this one. An act has exactly one regions document, so this
produces at most one notice per act, not one per suffix per section.

### Load-time validation notices, §2.5 rules 1 to 3

`src/core/formats/regions/validate.ts`. Its header carries the rule-by-rule map;
in short:

| rule | where |
|---|---|
| 1, shape / closed schema | a REFUSAL, not a notice: the codec throws, the load records the file `unreadable`, the save touches it in neither direction, and the author's sentence names the file and the JSON pointer |
| 2, every rect inside the act, `w, h >= 1` | here, through `validateRectInAct` |
| 3, every binding resolves | here, four bindings and four independent sentences |
| 4, 5, 6 | NOT here, and named in the header so the silence is not read as coverage |

`validateRectInAct` is a new narrow entry point in
`src/core/editing/region-geometry.ts` for the three rules that need nothing but the
act's size. Rule 4's minimum span and reachable-edge family need
`CENTRE_{X,Y}_{MIN,MAX}` and `REGION_MIN_SPAN` from the act's `.emp` descriptor,
which this repository does not read — the limit the seam review already booked on
both sides of the seam. Calling `validateRect` with invented camera constants and
filtering its findings would have been a number with no source quietly producing
verdicts; `validateRect` now DELEGATES to the new function, so there is still one
transcription of each rule.

Rule 3 is four sentences and not one "N bindings do not resolve", because the
repair is a different file for each. Two distinctions are load-bearing:

* **a REFUSED document is not a MISSING one.** A scene file that exists and would
  not parse is absent from `EffectsSceneLibrary.scenes`, so the naive check sends
  the author to create a file that is already there.
* **a BODYLESS bg layout is the untracked-body class** (C hazard A): the manifest
  names the entry and this checkout could not open its binary. The id is right and
  the checkout is incomplete, so the sentence must not suggest a rename.

**Loud on unmeasurable.** `presetRecords: null` means "Aurora could not read the
library" and produces a notice saying the bindings were NOT CHECKED. It must never
produce "every preset is unresolvable" (what an empty vocabulary would produce)
and never silence (which reads as "checked, all fine"). A row asserts `null` and
`[]` are different answers, with each other as the control.

### Coverage and non-overlap are deliberately NOT load notices

`region-geometry.ts` answers both already. Under the Q1 ruling an UNASSIGNED area
is a first-class editing state — the thing the editor paints red and gives to a
region in one action — so an error toast on every open would make an ordinary
half-finished act shout at its author. It belongs to the facet's status line
(§3.4), which is step 6. Written down here so the silence is not read as coverage.

## The red-first log

Baseline for every mutation is the COMMITTED tree, never `git checkout --` on a
dirty one. `git status --porcelain` was empty before each mutation and after each
restore, and the mutation is shown by `git diff -U0` naming the file and quoting
the changed line **before** the red run.

| # | mutation, applied on disk | subject | result |
|---|---|---|---|
| M1 | `writeActRegionsDocument`'s `document:` stops cloning (`document: doc`) | the no-aliasing row | **RED**, 1 failed / 7 passed |
| M2 | the `set-regions` UNDO case passes `cmd.newDocument` | every round-trip row | **RED**, 4 failed / 4 passed |
| M3 | the one writer also sets `unreadable: null` | the load's-verdict rows | **RED**, 1 failed / 7 passed |
| M4 | `'set-regions'` added to `ZONE_SCOPED_COMMAND_TYPES` | routing | **RED**, 3 failed / 0 passed |
| M5 | `EditHistory.execute` pushes the command TWICE | the "one gesture is ONE undo step" rows | **RED**, 2 failed / 6 passed |
| M6 | the ABSENT case PRODUCES the file (an `else if (true)` branch writing `{}`) | the absent-case row's vacuity | **RED**, 2 failed / 6 passed |
| M7 | the `understood()` gate removed (`if (false)`) | the refused-file row | **RED**, 1 failed / 7 passed |
| M8 | the blind probe guesses ABSENT (`catch { present = false }`) | the cannot-tell row | **RED**, 1 failed / 7 passed |
| M9 | the removal no longer gated on `loadedPath` | the absent-act row's "removes nothing" | **RED**, 1 failed / 7 passed |
| M10 | the writer bypasses `serializeRegionsDocument` for `JSON.stringify` | the canonical-form row | **RED**, 1 failed / 7 passed |
| M11 | `ledger.loaded.push(regionsPath)` in the load | the section-ledger row, and three more | **RED**, 4 failed / 4 passed |
| M12 | the unmeasurable-library notice suppressed | loud-on-unmeasurable | **RED**, 2 failed / 16 passed |
| M13 | an unread library becomes an EMPTY vocabulary, not `null` | the same, through the real load | **RED**, 1 failed / 17 passed |
| M14 | `outside-act` off by one (`b.x1 > actW`) | rule 2's boundary | **RED**, 4 failed / 61 passed, across the validation file AND region-geometry's own suite |

Four are worth more than their count.

**M6 is the one the brief demanded, and it is the vacuity that matters here.**
"the plan does not contain `regions.json`" passes for an empty plan, a broken
fixture, an act that failed to load. The row therefore also asserts the plan is a
REAL plan with this act's other files in it, and M6 — making the absent case
produce the file — is what shows the assertion can fail at all.

**M11 is a real defect, not a contrived one.** Admitting `regions.json` to the
section-file ledger is the obvious tidy thing to do, and it makes the stranded
sweep unlink the act's regions on EVERY save. Four rows catch it.

**M7 and M9 fail independently, which is the point of having both.** Under M7 the
refused file is still not removed, because a refused path never sets `loadedPath`;
under M9 the absent act's file is still not written, because there is nothing to
write. Two gates, each sufficient alone against the failure it is nearest to.

**M5's first attempt did not apply, and reading the diff is what caught it.** A
`perl -0pi -e` substitution whose pattern did not match left the file untouched;
the run came back 8 passed, which is exactly what a correctly restored baseline
prints. `git diff --stat` said "no changes", so the green was discarded rather
than recorded, and the mutation was re-applied with python and verified on disk
before the real run. An unapplied mutation and a clean tree produce the identical
artifact; only the diff tells them apart.

## The suite

Foreground, `VITEST_MAX_WORKERS=4`, at `51b3da88`:

```
Test Files  631 passed | 3 skipped (634)
     Tests  9866 passed | 9 skipped (9875)
  Duration  34.20s
failure-class: no failures in this run (634 module(s) reported).
skip-report: 9 SKIPPED test(s) in 7 file(s). OK. Every skip named its reason.
```

Zero failures, and `npm test` exits **0** end to end, so the fifteen `check:*`
gates and `tsc --noEmit` are inside that green. The 9 skips are the same 9 the
codec review recorded and none is in a regions file.

New rows this parcel: `set-regions` 8, `set-regions-routing` 3,
`aeon-regions-roundtrip` 8, `regions-validation` 18, plus 1 in `section-wiring`.

## Two things that were wrong with the environment, not with the code

**1. `npm test`'s `check-doc-citations` gate failed on master, before this branch
existed.** `docs/reviews/2026-09-16-shared-background-marking-ruling.md:207` cited a
`docs/superpowers/notes/` ruling note that is not in this repository. Reproduced at
master `9893d69e` in the PRIMARY checkout, with no working-tree changes, by running
`node scripts/check-doc-citations.mjs` directly — so it is not this branch's, and it
blocked the whole chain for every lane.

**REPAIRED HERE, and the repair is a reflow rather than an edit to the claim.** The
sentence already says the verdict is at empyrean `d945eb0`; the PATH sat on the
following line, and the gate judges per line, so a bare `docs/…` with no peer named
beside it resolved against this repository and dangled. The line now carries
"empyrean" and the path together, which is what the citation always meant. Nothing
about the ruling, the pin or the prose changed. ⚠ **It is another lane's document**
— revert this one line if that lane would rather answer it differently.

**2. This worktree's `node_modules` contained a nested duplicate of itself**, an
artifact of `cp -al node_modules <worktree>/node_modules` run against an existing
target. Two resolvable copies of React meant a null dispatcher: **225 failures
across 10 renderer test files**, all `TypeError: Cannot read properties of null
(reading 'useCallback')`, with `node_modules/node_modules/react/…` in the stack.

Proven to be the environment and not this branch: the same file passes in the
primary checkout at the same commit, and **fails in this worktree at the BASE
commit `9893d69e`** with the branch's own work checked out of the way. The nested
tree was hardlinks onto the same inodes (`stat` showed one inode with three names
before, two after), so removing it changed nothing in the primary checkout, which
was re-checked afterwards. The totals above are the run after that removal.

## What is left open

* **No emulator, no ROM, no screen.** Nothing in this parcel wanted one and none
  was run. **TAGGED for foreground follow-up:** nothing here has been seen in the
  running app — there is no Regions facet yet (step 6), so a regions document
  reaches the model and the save plan and is drawn nowhere.
* **Rules 4, 5 and 6 of §2.5 are not built**, by the brief's own scope. Rule 4 is
  additionally BLOCKED on a capability this repository does not have: the
  descriptor constants. If a later step wants it, the parcel is "Aurora reads an
  act descriptor", not "add a check".
* **Coverage and non-overlap are not surfaced anywhere.** The instruments exist and
  have no consumer; this is the facet's, and the seam review already said the same
  of `uncoveredRects`.
* **`documentIdFromPath` is the inverse of `effectsScenePath`/`effectsPresetPath`
  by transcription, not by construction.** It takes the basename without `.json`,
  which is what those two build; if either ever nests an id under a directory, the
  "exists and refused" half of rule 3 silently becomes the "missing" half. A row
  would need a path builder and a parser that agree, which is a small parcel of its
  own.
* **One act, one document, as the seam review already noted.** `ojz_act1` is still
  the only regions document that exists anywhere, and the fixtures here are
  hand-built one-section acts.
* **The save's refusal sentences are pinned in the node suite and have never been
  read on screen**, because the save report's rendering is renderer glue this
  parcel did not touch.

---

## Overseer's landing note, 2026-09-16 — merged at master `b70ec81b`

Verified firsthand on the MERGED tree, not on the branch and not from the report:
`npm test` exit **0**, `Test Files 631 passed | 3 skipped (634)`, `Tests 9867 passed
| 8 skipped (9875)`, zero failures, all fifteen `check:*` gates and `tsc --noEmit`
inside that green. (My run shows one more test passed and one fewer skipped than the
agent's; totals agree at 9875 and the difference is a test that RAN here, which is
strictly more coverage, not less.)

**M6 re-proved independently, because it is the row this parcel was dispatched to get
right.** I applied my own narrower mutation — a plain `else` on the three-state branch
in `save.ts`, writing `{}` only in the genuinely-absent case — quoted it back from
`git diff` before the run, and got **1 failed / 7 passed**, the failure being exactly
*"an act with NO regions.json creates no file and removes nothing"*. The agent reported
2 failed for M6 because its `else if (true)` also hijacked the `loadedPath` removal
case. Both reddens prove the row; mine isolates the absent case, so the assertion is
non-vacuous on its own terms and not only as collateral of a broader break. Tree was
clean before the mutation and `git status --porcelain` empty after the restore.

### RULED: coverage and non-overlap stay OUT of load-time notices

The agent asked. The answer is its own recommendation, and the reason is the owner's
Q1 ruling rather than a preference: under Q1 an UNASSIGNED area is a **first-class
editing state**, not a malformed document. A load-time error on every open would make
an ordinary half-finished act shout at its author, which is the behaviour the ruling
exists to prevent. They belong in the Regions facet's status line (§3.4, step 6),
where the author is looking at the thing being judged. The instruments already exist
in `region-geometry.ts`; step 6 wires them to a surface, not to a notice.

### Booked, not built

- **Rule 4 (minimum span, reachable edge) is BLOCKED on a parcel, not on effort.** It
  needs `CENTRE_{X,Y}_{MIN,MAX}` / `REGION_MIN_SPAN` from the act descriptor, which
  Aurora does not read. "Aurora reads an act descriptor" is that parcel. Rules 5 and 6
  remain out of step 5's scope by the spec.
- **`documentIdFromPath` is the inverse of `effectsScenePath`/`effectsPresetPath` by
  TRANSCRIPTION, not construction.** If either ever nests an id under a directory,
  rule 3's "exists but was refused" half silently degrades to "missing" — a wrong
  notice, not a crash. Booked as a small row.

### One correction to the packet's environment finding, which is MINE, not the agent's

The packet reports the worktree's nested `node_modules/node_modules` as reproduced at
the base commit and absent in the primary checkout — both true, and the implication
that it pre-existed the parcel is **wrong**. I caused it during worktree setup. My
first command ran `cp -al` and then counted the result with `ls`, which is aliased to
`eza` in this shell and errored; I read the compound command's error as the `cp`
having failed, and re-ran it. The destination now existed, so the second `cp` nested a
full copy inside the first. 211 entries + 1 nested = the 212 I measured and misread as
success. The agent had no way to see either call and its report is honest about what it
could observe. The cost was real: 225 failures across 10 renderer files from two
resolvable copies of React, and the agent spent time proving it was not its own doing.

### Board tidy at the same landing — the 20/20 ceiling, flagged by the hub

`SECTION-3-IS-THE-FREE-ONE` is removed from `docs/lane-status.json`, freeing the
slot rule 7's ceiling had taken. **Nothing is lost and nothing was decided.** The row
was a pointer, not a task — its own text said *"DO NOT THREAD — information for you,
not a task"* — and the fact it pointed at is already recorded durably in two tracked
places: `docs/lens-findings.jsonl` under that same id, `state: open`, carrying the
full measurement (`OJZ_Preset_Sec3` at `:1574` hands `raster: Raster_Program_None`,
the descriptor binds it to section 3 alone, and what threading it would cost), and
the packet `docs/reviews/2026-09-10-section0-special-case.md`.

The general form, since this board will hit the ceiling again: **a queue row whose
content is a FACT rather than a task is the right thing to drop first**, because the
queue is the one place that information does not need to live — a finding ledger is
greppable by id and a queue is not, and the row was costing a slot a future session
will need for something that genuinely has to be done. Verify the fact has a tracked
home before dropping the row, which is what the two citations above are for.
