# Migrate-sections and a DEBUG-only descriptor row: read past it, say so, never carry it

**2026-09-16. A ruling on the product question ROADMAP row 181 declined to settle and step 7
(row 185) made consequential — taken under the owner's standing instruction of
2026-09-16T05:2xZ** (empyrean `docs/OVERSEER.md` at `origin/main` `6ccb36f0`, verbatim: *"I'm
going to bed, continue to guide everything towards finishing regions phase 2. if anything needs
decisions just ask a fable agent. clear + reboot anything that needs it. goodnight!"*; the hub's
application at the same revision: *"the look/taste park is LIFTED FOR THE NIGHT, for REGIONS
PHASE 2 items only … overturnable by one word in the morning"*). **Every verdict below is
overturnable by one word from him.** Aurora read at master `2afbe371`; aeon read at
`origin/master` `9332c1af8402869cffd6b2092727f967e8bfa545` through git objects, never the
working tree; empyrean read at `origin/main` `6ccb36f0`. No code was changed; the lane applies
what follows. No emulator was used.

## 1. Verdict

**Arm A, sharpened: Aurora migrates the rows that are in every build, says on screen which rows
it read past and why, and REFUSES — naming the switch — in the two cases where reading past a
conditional would invent something.** Concretely:

1. A region-row block inside a value-position conditional (`if DEBUG == 1 { [ … ] } else { [] }`)
   is **not carried** into `regions.json`. The migration's existing notes channel — the one that
   already says *"bgLayoutRef … was read and DROPPED"* — gets a second sentence naming the
   constructor, the descriptor lines, the switch (`if DEBUG == 1`), the preset it bound, and the
   rectangle it would have carved.
2. A conditional whose **both** arms carry rows is a **refusal** naming it: there is no
   unconditional table to write, and skipping both arms would leave a hole in every build.
3. A key-less row whose **edge** is a constant declared as a conditional is a **refusal** that
   says *"behind a build switch"*, in the same words as the note in (1) — not today's generic
   *"could not resolve its four edges"*.

The one principle: **Aurora never picks a build shape.** Where a conditional can be left unread
without inventing anything, it is left unread and the author is told. Where leaving it unread
would invent a rectangle or a hole, Aurora refuses and names the conditional.

"Release truth", the brief's label for arm A, is a misnomer and the panel must not use it:
Aurora has no way to know which arm is release. What it can honestly say is *"this row is behind
a build switch Aurora does not read"*. That the unconditional table equals the release table is a
fact about aeon's contract (§4 below), not something Aurora measured.

## 2. What was measured, at which revision

**The descriptor at aeon `9332c1af`**, `games/sonic4/data/levels/ojz/act1/act_descriptor.emp`
lines 624-627, verbatim:

```
const OJZ_SEC2_X1 = if DEBUG == 1 { OJZ_SNAP_X0 - 1 } else { 6143 }
const OJZ_E2_SNAP_ROWS: array = if DEBUG == 1 {
    [ ojz_region(x0: OJZ_SNAP_X0, x1: 6143, y0: 0, y1: 2047, effects: OJZ_Preset_NightSnap) ]
} else { [] }
```

with aeon's own comment above it: *"THE RELEASE TABLE IS UNTOUCHED. With DEBUG == 0 the extra
row is `[]` and row 2 keeps x1 = 6143, so `OJZ_ACT1_REGION_ROWS` is the same ten rows"*, and the
table's row 2 written `x1: OJZ_SEC2_X1`. `build.sh:133` at the same revision:
`if [[ "${DEBUG:-0}" == "1" ]]` — release is the default shape. The descriptor's diff between the
golden's revision `9772326` and the tip touches neither line (two comment lines and one
`sec_bg_layout` field; `git diff --stat` 2 insertions, 3 deletions).

**Aurora's migration against that descriptor**, measured through a scratchpad vitest file that
calls `descriptorEffectsRows` → `planSectionMigration` on the blobs at a revision (no file under
`test/` was touched; the config lives in this session's scratchpad):

| revision | key-less rows read (file order) | refusals | regions | `sec_2` rect |
|---|---|---|---|---|
| `9332c1af` (tip) | `OJZ_Preset_NightSnap` line 626 edges {5600, 6143, 0, 2047}; `OJZ_Preset_Night` line 658 edges {3400, 4799, 0, 2047} | **none** | **11** | `{x: 4800, w: 800}` = x1 5599 |
| `807bfdd5` (pin, control) | `OJZ_Preset_Night` line 560 | none | 10 | `{x: 4800, w: 1344}` = x1 6143 |

So at the tip Aurora writes the DEBUG shape with **zero refusals and one note** (the existing
`bgLayoutRef … DROPPED` sentence). The eleventh region is emitted **ahead of** the night region,
because the reader walks the text and `OJZ_E2_SNAP_ROWS` is declared above the table — this
repo's own row `⚠ AT AEON'S LATER REVISION THE SAME READING GIVES ELEVEN REGIONS`
(`test/formats/regions-migrate-act1.test.ts:239-275`) predicted exactly this at `9772326`, as a
tested limit; the measurement above extends it to the tip.

**The ruling the arms must be consistent with.** empyrean `39b8405` (ancestor of `origin/main`),
`docs/AURORA_REGIONS_SCHEMA.md`, ruled 2026-09-16T05:28:50Z on the card
`REGIONS-EMITTER-DEBUG-ROW`: *"THE VERDICT: the delta (aeon's option 3). This schema is NOT
amended and stays closed."* Its reasons: *"an Aurora author has no DEBUG and no release. Any key
that encodes build shape … is a build concept sitting in a document edited through a GUI, where a
mis-set flag becomes an invisible eleventh region in somebody's ROM."* And its condition: *"the
delta must be applied against a NAMED row, never a positional one: an `ensure` that the row it
shortens is `sec2` at x1 = 6143 binding `OJZ_Preset_Sec2`, so that a document edit which moves or
renames `sec2` fails the build instead of silently cutting the wrong row."* The E2 look was ruled
the same night (empyrean `c54a868`, row 1, *"it reads as a TRANSITION"*), and its falsifier is
*"the owner watching the x=5600 crossing on a running ROM"* — so the fixture stays for now, and
`39b8405` says retiring it *"becomes correct later"*, after step 6 has been on screen.

## 3. The three arms, each as something he can picture

**(A) Unconditional rows, said aloud — RECOMMENDED, with the two refusals in §1.**
*Author:* clicks Migrate sections on today's aeon tree; sees *"Migrated: 10 regions."* and under it
a note: *"the `ojz_region` row at descriptor lines 625-627 binding `OJZ_Preset_NightSnap`
(x 5600..6143, y 0..2047) is behind a build switch (`if DEBUG == 1`) and was read and NOT
CARRIED: the regions file has no build shape; the build applies that row as a delta (empyrean
AURORA_REGIONS_SCHEMA.md, ruled 2026-09-16)."* The panel then shows ten regions, `sec_2` at
x 4800..6143. *On disk:* a ten-row document identical in preset, rect, sceneRef and rasterRef to
aeon's own golden — the same document the pinned test already proves. *Release build (once aeon's
emitter lands):* the generated table is the ten release rows; the DEBUG build finds `sec2` at
x1 = 6143 binding `OJZ_Preset_Sec2` and applies its delta. *Cost:* the document is not the whole
truth about the DEBUG ROM. `39b8405` already accepted exactly that: *"the generated table is then
not the whole truth about the DEBUG ROM, and anyone diffing them finds eleven rows against ten
… this makes an existing caveat permanent"*. Aurora's note is the place that caveat is said to
the person it affects, at the moment it affects them.

**(B) Refuse.**
*Author:* clicks Migrate sections on today's aeon tree; gets a warning-toned refusal naming lines
625-627 and no document. Nothing to undo, nothing to save. *On disk:* nothing, ever, for act 1 —
for as long as any look fixture lives in the descriptor, which `39b8405` says is until after step 6
has been judged, and which recurs the next time aeon wants a DEBUG-only crossing to judge a look
against. *Release build:* unchanged (legacy mode). *Cost:* B treats the **designed** state as a
defect. `39b8405` put the DEBUG delta in the descriptor on purpose; a descriptor carrying a
conditional row block is therefore what a correctly-built aeon tree looks like, and an editor that
refuses it refuses the contract it was written against. It also makes step 7's acceptance path
(the golden comparison) untestable on the real tree from the tip forward, and it has no answer for
the author beyond "wait for aeon". Nothing wrong is written, which is B's one genuine virtue, and
§1's two refusals keep that virtue for the cases where it is the only honest answer.

**(C) Include, as today.**
*Author:* clicks Migrate sections; sees *"Migrated: 11 regions."*, the existing `bgLayoutRef`
note, and a panel listing `ojz_preset_nightsnap` **before** `ojz_preset_night`, with `sec_2`
ending at 5599. Nothing on screen says any of this is a DEBUG shape; the author edits and saves
it as the game. *On disk:* an eleven-row document in a schema `39b8405` deliberately left with no
shape key, so the file itself cannot say it is DEBUG-shaped. *Release build (once the emitter
lands):* the release table gains a `NightSnap` region at x 5600..6143 — a palette snap in the
shipped game that exists in no aeon release today and that `OJZ_Preset_NightSnap`'s own comment
says *"emits zero bytes"* in release — and the DEBUG build's named-row ensure **fails**, because
`sec2` is at x1 = 5599, not 6143. Both are the outcome `39b8405` refused by name: *"an invisible
eleventh region in somebody's ROM"*. *Today, before the emitter:* aeon's `generate()` runs only
`check_mode_conflict` (*"NOTHING CONSUMES THE ROWS"*, `tools/effects_gen.py:3554` at
`9332c1af`), so the wrong document sits unread until the parcel that reads it lands — in whoever's
tree saved it, with no marker. *Cost:* the one arm that writes something the ruled contract
cannot express, and hides that it did.

## 4. The house rules it turns on, quoted from the artifacts

**Represent a state; never leave it to absence.** `src/renderer/providers/regions-aeon.ts:455-461`
at `2afbe371`: *"`unmeasurable` is NOT a third shade of warning. It means the check did not run,
and it exists so that a rule Aurora cannot answer never renders as green"*; and at `:555-557`,
*"the house rule this file states at `RegionStatusTone` (represent a state, never by absence) and
the exact confusion the `unmeasurable` tone exists to prevent"*. C violates it twice: the
DEBUG-ness of the eleventh row is nowhere on screen, and the file cannot carry it. B does not
violate it, but it represents the state as a fault rather than as a fact. A represents it as what
it is: a row Aurora read and did not carry, and says so where the author is looking.

**An instrument must be loud when it could not measure.** `docs/OVERSEER-REFERENCE.md:385` at
`2afbe371`, the `boundSocketPaths` entry: *"'I could not look' and 'I looked and nothing is bound'
were the same value; no caller could have distinguished them, however carefully written … Ask of
any instrument: can it report its own blindness, or does not-looking render as a clean result?"*
Today's reader is blind to `if DEBUG == 1` and renders its blindness as a clean eleventh row —
the `boundSocketPaths` shape exactly: a value the caller cannot tell from a measurement. A silent
skip would be the same defect with the opposite sign (not-looking rendering as ten clean rows).
The note in §1 is what makes A's skip a report of blindness rather than a clean result.

**The load path's own statement of the same rule**, `src/core/formats/regions/validate.ts:47-54`:
*"`presetRecords: null` therefore means 'Aurora could not read the library', and it produces a
notice SAYING the bindings were not checked. It must never produce 'every preset is
unresolvable' … and it must never produce silence, which would read as 'checked, all fine'."*

**The migration's own rule for a row it cannot place**, `src/core/editing/migrate-sections.ts:416-420`:
*"NO VALUE IS SUBSTITUTED: dropping the row would hand its area to the section regions it was cut
out of"*. This is the sentence that looks like it forbids A, and it does not: it is about a row
whose area **belongs to it** in the shipped table. The snap row's area belongs to `sec2` in every
build but DEBUG — aeon's `else { 6143 }` says so — so not carrying it hands nothing to the wrong
owner. §1's refusal (2) is what keeps this rule intact for a conditional where the area really
would be orphaned.

**The panel's existing pattern for read-and-not-carried**, `RegionsPanel.tsx:386-390`: *"The
NOTES are shown on success for the same reason: `bgLayoutRef` and `paletteRef` are read and
DROPPED, and an author who bound a background to a section deserves to be told that binding did
not survive rather than to discover it the next time they open the act."* A is that sentence
applied to a second thing Aurora reads and does not carry. No new surface is needed.

**The precedent this ruling closes.** ROADMAP row 181: *"whether Aurora should surface a
DEBUG-only row is a product question a currency row has no standing to settle."* Settled here: it
does not surface it as a region; it surfaces the fact that it did not.

## 5. The second half: an EDGE that is a conditional, and whether A is consistent

**The brief's premise needs correcting before it can be answered.** It says section 2's edge
*"is unresolvable on today's tree … `resolveIntConst` returns null for it today and the migration
refuses on a null edge."* The first half is true and the second is not reached: `rowEdges` is
called **only for key-less rows** (`section-wiring.ts:482-486` at `2afbe371`: *"A keyed row's
rectangle is the section grid's and the migration derives it there; a key-less row has no section
to derive from, so its rectangle is read here or nowhere"*). Row 2 is keyed (`sec: 2`), so
`OJZ_SEC2_X1` is never consulted and nothing refuses — the measurement in §2 shows zero
refusals at the tip. Section 2's shape comes from the grid, carved by whatever key-less rows are
carried; under today's code it is carved by the snap row (x1 5599), under A it is not (x1 6143).
**So on today's tree A produces no refusal at all**, and the "refusal with a confusing reason"
the brief fears cannot occur for act 1 as written.

**Where it can occur, and what A does.** The shape is reachable: a key-less row written
`x0: OJZ_SEC2_X1 + 1` would hand `resolveIntConst` a name whose declaration is
`if DEBUG == 1 { … } else { … }`, and `resolveIntConst` (`section-wiring.ts:403-408`, a regex for
`const NAME = <integer>`) returns null for it — indistinguishably from "no such constant" and
"declared twice". Today that null becomes the sentence *"could not resolve its four edges"*. Under
A that is the inconsistency the brief names: the same switch would be *"read past, not carried"*
in a note and *"could not resolve"* in a refusal. **§1(3) closes it:** the refusal must say
*"behind a build switch (`if DEBUG == 1`)"*, which requires `resolveIntConst` to report **why** it
returned null — absent, duplicate, or declared as a conditional — so the sentence can name the
cause. That is the one code consequence of this ruling beyond the skip itself, and it is a
refinement of a refusal Aurora already makes, not a new behaviour.

**Why an edge is refused while a row is skipped, in one sentence for the author:** a row behind
a switch can be left out and the table is still whole; an edge behind a switch cannot be left out
without Aurora choosing a number, and Aurora does not choose build shapes. Both sentences use the
words *build switch*; that shared phrase is the consistency.

**Why not take the `else` arm for the edge.** Reading `else { 6143 }` as release is evaluating
`DEBUG == 1` to false — a guess about a build flag `39b8405` says an Aurora author does not have.
It would also be the first place Aurora evaluated any `.emp` expression, in a reader whose whole
contract is *"this module reports what the file says"* (`section-wiring.ts:257-263`). Refuse,
and let aeon write the row's edge as a literal or as a constant that is not a switch.

## 6. What I did NOT verify

- **No emulator, no build.** Nothing here looked at a screen or a ROM. "What happens on a release
  build" in §3 is derived from `effects_gen.py` and `39b8405`'s text at the revisions named, not
  from running either.
- **The ten-row result under A at the tip is DERIVED, not measured**: no code implements A yet.
  The derivation is that the ten unconditional rows at `9332c1af` differ from those at `807bfdd5`
  only in row 2's `x1` (a keyed row, whose edge Aurora never reads) and in line numbers, and the
  night row's constants resolve to the same {3400, 4799, 0, 2047} at both. The lane's acceptance
  test should measure it.
- **The population of conditionals is one.** `git grep 'if DEBUG'` over `act_descriptor.emp`
  files at `9332c1af` finds exactly the two lines quoted, in the only `act_descriptor.emp` in the
  tree. What other value-position conditional shapes `.emp` permits (`EMP_PITFALLS §1` is cited
  by aeon's comment and was not read) is the lane's to survey before fixing the detector's scope.
- **I did not check whether the `Hint` note tone is loud enough by the panel's own standard.**
  `Hint` carries `tone?: 'warning'` only (`column-layout.tsx:200-201`); the existing `DROPPED`
  note uses the plain tone. Whether a not-carried region row deserves the warning tone where a
  dropped `bgLayoutRef` does not is a look call I leave to the lane, with a lean toward warning:
  a region is what the panel is for.
- **I did not read the whole editor spec**, only §4 at empyrean `origin/main` (the corrected
  paragraph at `2026-09-14-aurora-regions-editor-design.md:496-520`), and I did not check whether
  aeon's board has absorbed `39b8405`.

## 7. What one word from the owner changes

- **"include"** → arm C. But it cannot stand alone: a document carrying a DEBUG-shaped row is the
  thing `39b8405` refused, so that ruling reopens with it (a shape key, or a second document), and
  the named-row ensure it mandated would fail on Aurora's `sec_2` at 5599. Two rulings move, not one.
- **"refuse"** → arm B. Act 1 cannot migrate from the tip forward until the E2 fixture is retired;
  step 7's real-tree acceptance path goes dark for that span; nothing wrong is ever written.
- **"retire"** (the fixture — aeon's option 1, which `39b8405` says *"becomes correct later"*) →
  the question is moot for act 1 today, and A stays as the standing rule for the next fixture.
- **"toggle"** (Aurora should show both shapes) → this is the shape-key path `39b8405` refused;
  it reopens that ruling and the schema, not this note.
- **"flash"** or **"fault"** at the x = 5600 crossing → overturns `c54a868`, likely retires the
  fixture, and lands on "retire" above.

## 8. Left open, not ruled here

- **A cross-lane hazard found on the way, for aeon's emitter parcel and the editor spec, not for
  this ruling:** `39b8405` mandates the delta be applied *"against a NAMED row … `sec2` at
  x1 = 6143 binding `OJZ_Preset_Sec2`"*. Aurora's migration names that row **`sec_2`** (editor spec
  §4: `sec_<lowest>`; the pinned test asserts `sec_2` against the golden's `sec2` as a known,
  by-design difference). If the emitter's ensure keys on the id string, a freshly migrated act 1
  fails the DEBUG build on the id alone. The ensure should key on (preset, x1) or the two specs
  should agree on an id; whichever, it is a sentence someone must write before the emitter lands.
- **Nothing persistent says "an eleventh row exists in DEBUG" after the migration click.** The
  note is shown at the moment of migration; design Q8 (*"nothing renders `unkeyedRows`"*, row 181's
  open item) is where a standing surface would live. Not widened here.
- **The detector's scope** — which conditional shapes count as "a block the reader cannot
  evaluate" — is the lane's, with §6's caveat that only one shape exists in the tree today.
