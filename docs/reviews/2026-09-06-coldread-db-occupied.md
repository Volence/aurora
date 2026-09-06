# Cold read D-B — the strip named two homes and both were already taken

Branch `parcel/coldread-db-occupied`. Closes **D-B** of
`docs/reviews/2026-09-05-effects-cold-read.md` — the one row of that packet that
was never given a row and never dispositioned. Its sibling D-A was fixed in
`docs/reviews/2026-09-05-coldread-fixes.md` §1.

Witnessed on a running app: `npm run harness:coldread-db` — **17 rows, 0 failed,
0 UNMEASURED**, 1400x872 window at 1680x1050, `devicePixelRatio = 1` on every
positional reading. Captures in `docs/captures/2026-09-06-coldread-db/`.

| commit | what |
|---|---|
| `d2bd5f4d` | the fix: the third act-wide set, the rebind notice, the guide |
| `8d0aa783` | the tooltip that was answering its own gate (found by a plant) |
| this one | the CDP harness, two stale peer harnesses, this packet |

---

## 1. What the strip said, and what it says now

**Before** (the cold reader's own transcription, and reproduced here against
aeon `a7a4f640`):

```
act: own preset 0,1,2,3,4,5,6,7,8 · threaded 5,6
```

Both of those numbers are honestly derived and both are true. What the reader
did with them is read `threaded 5,6` as *"5 and 6 are available"* — and both
sections already carried a preset (`ojz_sec5_showcase`, `ojz_sec6_baseswap`), so
every home the strip named was occupied. Binding a newly-authored preset to
either displaced the incumbent, and aeon's build then refused **the document that
was displaced**. There was no route through the UI to a green build with a new
raster band in it. It stopped the reader outright.

**After:**

```
act: own preset 0,1,2,3,4,5,6,7,8 · threaded 5,6 · bound 5,6
```

...plus, at the control that charges the cost — the `Section N` dropdown at the
bottom of RASTER BAND PRESETS — a note that appears only when rebinding would
actually orphan something:

> Section 5 binds "ojz_sec5_showcase", and no other section in this act does.
> Binding something else here leaves that document named by nothing, and aeon's
> build refuses a preset document that no section's rasterRef names and no DEBUG
> raster-table row names, by name ("reachable by NOTHING"). Aurora does not read
> that table, so it cannot tell you whether "ojz_sec5_showcase" has a row there.
> The document itself is not deleted: choosing it again restores the binding, in
> one undo step.

---

## 2. The aeon derivation — file, symbol, revision

**Read in aeon's source, not in the cold read.** The reader quoted a build log
line; a sentence Aurora paints stating a rule nobody read at the other end is
exactly how a confident-and-wrong label ships.

**`tools/test_raster_cycle_table_lint.py`** at
**`179e94b28a362bb3b0ffe59d2ddd68189d18bd00`** (that file's own last commit;
aeon HEAD at the time of reading was `a7a4f640b61f6f8c31ad3da71f6f97fad1f9d5b6`).
Read read-only through `git -C <aeon> show`; nothing was written into aeon.

The refusal is **`test_every_preset_document_is_REACHABLE`**, and it asserts that
the pure function **`unreachable_presets`** is empty:

```python
def unreachable_presets(preset_ids, row_ids, bound_ids) -> list[str]:
    return sorted(set(preset_ids) - set(row_ids) - set(bound_ids))
```

Two installers, and nothing else:

| set | what it is |
|---|---|
| `row_ids` | the `dc.l` rows of the `.raster_table` inside `games/sonic4/test/ojz_scroll_test.emp`'s `if DEBUG == 1` block — the effects-lab hotkey, stripped of the generator's own prefix |
| `bound_ids` | `effects_gen.load_section_raster_refs(repo=…)` — every `rasterRef` in every section sidecar, **game-wide**, read through the generator's own loader |

A document in NEITHER is refused by name:

> these preset documents in games/sonic4/data/editor/effects/presets/ are
> reachable by NOTHING: {orphans}.

The lint's own banner records why this arm is a disjunction rather than the hard
equality it used to be: the `rasterRef` installer was added on 2026-08-30 for
EFFECTS-W1 item 1, and under the old equality "authoring a band through Aurora
would STILL have required a hand-typed `dc.l` here plus a `RASTER_CYCLE_COUNT`
bump — a programmer's edit, which is the exact thing item 1 exists to remove."

**Measured at `a7a4f640`, and this is why it was those two sections:**

| preset document | `.raster_table` row | sidecar binding |
|---|---|---|
| `aurora_ramp_witness` | yes | no |
| `authored_probe` | yes | no |
| `ojz_sec3_shimmer` | yes | no |
| `ramp_probe` | yes | no |
| **`ojz_sec5_showcase`** | **no** | section 5 only |
| **`ojz_sec6_baseswap`** | **no** | section 6 only |

Threaded sections, from `games/sonic4/data/effects/ojz_effects.emp` at the same
revision: `raster: ojz_act1_sec_raster(sec: 5, …)` at line 1635 and `sec: 6` at
line 1693. So the two sections aeon threads are exactly the two whose incumbents
have no lab row — each reachable only by its single binding.

**So the orphan is the incumbent, not the section.** Nothing is wrong with
rebinding a section as such; what aeon refuses is a preset DOCUMENT that ends up
in neither installer. If two sections bind one document, rebinding one leaves the
other and there is no orphan — which is the arm that makes this a derivation
rather than a mood, and which `rebindOrphanNotice` returns `null` for.

### The half of D-B the reader reasoned rather than measured

The cold read says of section 6: *"I reasoned that binding there orphans
`ojz_sec6_baseswap` exactly as section 5 orphaned `ojz_sec5_showcase`, from the
lint's own wording. I did not run it. That half of D-B is reasoned, not
measured."* It is now **derived**: `ojz_sec6_baseswap` is in the preset directory,
is in no `.raster_table` row, and is bound by section 6 alone — the same three
facts that make section 5's incumbent an orphan. A test row re-derives this
against aeon's real tree on every run. Still not measured *by a build*; see §7.

---

## 3. The wording and placement decision, and why not a fourth row

### Two surfaces, because there are two different facts

| fact | where | why there |
|---|---|---|
| WHICH sections are occupied | the `act:` line, as a third derived set `bound` | the false impression was formed on that line, in that line's grammar |
| WHAT taking one costs | a note under the `Section N` select | that select is the control that displaces the incumbent |

### Not a fourth condition row — the reasoning

Conditions 1-3 answer **one** question — *can this section carry an
editor-authored raster band?* — and each of the three is a fact about **aeon's
level data** whose remedy is something a programmer performs (a preset split, one
aeon line on the raster chooser, one aeon line on a different chooser). That is
the split `section-wiring.ts` exists to defend, in its own written words: *which*
condition you fail decides what you do next.

Occupancy fails every part of that shape:

- it answers a **different question** (*is something already here?*);
- it is a fact about **Aurora's own editor files** (`section.rasterRef`), not
  aeon's;
- its remedy is the author's own next click, not a programmer's;
- it would read `yes` on a section where binding is refused outright, so a mark
  in the same column would contradict the rows beside it.

A row sharing a column, a mark vocabulary (`✓ ☐ ✗ ?`) and an "N of 3" caption
with three rows it does not belong to would be read as a fourth condition on the
same question. So it is a **set on the act line**, in that line's own grammar,
which costs no row. The D-A commit weighed one ~14px row against a wrong verdict
and paid it; this parcel had a cheaper option and took it.

### Not a "free sections" set

Deliberately. Hiding an occupied section would renumber the world for the reader
— the rule the section `<select>`'s own docblock already states about empty
sections ("offered and labelled, not hidden") — and "free" is a verdict word for
something that is not a prohibition: rebinding an occupied section is legal and
has a price. `core/formats/raster-binding.ts`'s standing refusal forbids Aurora
from publishing the prohibition. The set names the occupancy; the note names the
price; nothing is disabled and no confirm is added.

### `bound`, not `taken` or `occupied`

`bound` is this surface's own verb for exactly this relation: the delete guard
says "Section 5 binds …", the guide says "what it is bound to", and the wire key
is `rasterRef`. `taken` and `occupied` both imply a prohibition that is not
there. The residual ambiguity is named and accepted: condition 1's detail also
uses "binds", of the **aeon preset record**, which is a different relation. The
line's `title` disambiguates all three sets at the line.

### Not the alarm tier

The note renders as a plain `Hint`, not `tone="warning"`. Nothing is refused
while the binding stands — the build is green — and C1 of the same cold read is
exactly what drawing a not-yet-a-problem in the vocabulary of damage costs.
Measured on screen: the notice's left border is `rgb(110, 117, 137)` against the
section advisory's `rgb(251, 191, 36)` in the same card, in the same frame.

### What the sentence refuses to promise

Aurora reads **neither** of the two things it would need to promise a refusal:

- the `.raster_table` is in `games/sonic4/test/ojz_scroll_test.emp`, a
  game-specific DEBUG source Aurora does not open;
- Aurora sees the **loaded act's** sidecars, while `load_section_raster_refs`
  walks the whole game.

So the sentence is conditional in both places and says so at both. A confident
"this will break the build" would be **wrong** for exactly the four documents
that do have a lab row.

---

## 4. The guide

`docs/guides/effects-first-run.md` is imported with Vite `?raw`; the page an
author reads and the file edited here are the same bytes, and
`scripts/check-guide-text.mjs` (`8550c904`) asserts its quoted labels against the
components that render them.

**Two stale snapshots removed rather than re-pinned.** Both were wrong at aeon
HEAD before this parcel touched them:

| the guide said | the truth at `a7a4f640` |
|---|---|
| "In `ojz act1` today that is sections **0 to 5**… Sections **6, 7 and 8 all share** `OJZ_Preset_Plain`" | all nine sections own their preset; nothing is shared |
| "condition 1 holds for sections 0 to 5 and condition 2 for section 5" | condition 1 holds for 0-8, condition 2 for 5 **and** 6 |

`section-wiring.ts`'s own rule is that every list is a snapshot and every snapshot
was wrong, so the guide now sends the reader to the `act:` line instead of
carrying numbers that rot. The `OJZ_Preset_Plain` example survives as an example
of the shape rather than a claim about today.

**Added**: the §1 strip schematic gains the act line; §6 gains a paragraph for the
third set and a paragraph for what rebinding costs the incumbent, with aeon's own
two-installer rule and the explicit statement that Aurora does not read the lab
table.

**Gate**: `RENDERED` rows for `act:` and `bound` (both `prefix: true`), and the
`ojz act1` `NOT_A_LABEL` row deleted with the span that was its only subject. The
act line's separator is now its own JSX node so `bound` LEADS its string: the gate
verifies a quoted label against a **leading chunk** of a source string, and
` · bound ` leads with punctuation.

---

## 5. Red-first — the mutations, applied on disk

Every check below was disbelieved until a planted violation took it red. Each
mutation was applied to the working tree, quoted back from disk, run, and then
restored from the **committed** baseline.

### The unit rows (`npm test`)

| # | mutation | shown on disk | result |
|---|---|---|---|
| M1 | `boundSections` counts a section with no `rasterRef` | `git diff --stat` 1 file 1+/1-; line 517 reads `if (s !== null) out.push(i);` | **1 failed / 44 passed** — `boundSections is OCCUPANCY…`: `expected [0,1,3] to deeply equal [1,3]` |
| M2 | `rebindOrphanNotice` drops the sole-binder arm (`!== 1` → `< 1`) | line 902 reads `…length < 1) return null;` | **1 failed / 7 passed** — `ANOTHER section binds the same document…`: `expected 'Section 0 binds "shared"…' to be null` |
| M3 | a fourth `ConditionRow` planted in the strip | `git diff --stat` 4 insertions; `ConditionRow n={4}` at line 347 | **1 failed / 7 passed** — `the strip prints bound as a THIRD SET…`: "the strip grew or lost a condition row… expected 4 to be 3" |

### The aeon-derivation rows — mutated in a COPY, never in aeon

aeon is another lane's live tree and is read-only here (aurora card d-28). The
plants were applied to a copy under `scratchpad/`, reached by pointing `AEON_DIR`
at it, which also proves the resolver override is what those rows are reading.

| # | mutation | shown on disk | result |
|---|---|---|---|
| M4a | a third installer in `unreachable_presets` (`- set(agent_ids)`) | line 151 of the copy | `unreachable_presets subtracts EXACTLY TWO installers` **red**: "aeon's unreachable_presets now subtracts [row_ids, bound_ids, agent_ids]…" |
| M4b | a `dc.l EditorRaster_OJZ_Act1_ojz_sec5_showcase` row added to `.raster_table` | line 2374 of the copy | `D-B REPRODUCED` **red**: "ojz_sec5_showcase now has a DEBUG .raster_table row, so displacing it from section 5 no longer orphans it." |
| M4c | `section_5.meta.json`'s `rasterRef` set to `null` | `"rasterRef": null` at line 4 of the copy | `D-B REPRODUCED` **red**: "aeon now threads section(s) [5] with no rasterRef on them. That is a FREE home…" |
| M4d | `AEON_DIR` pointed at an empty directory | — | both rows **SKIP, loudly**, naming the path and what went unmeasured. Not green. |

### The guide gate — and it went GREEN on the mutation the first time

| # | mutation | result |
|---|---|---|
| M5 | rename the rendered act-line label `bound` → `taken` | **GREEN.** A defect, fixed in `8d0aa783`. |

`bound` is a `RENDERED` row with `prefix: true`, so the gate asks whether **any**
string in `SectionPicker.tsx` BEGINS with the label. The tooltip added in the
first commit opened its line with the literal `'bound: the sections whose sidecar
ALREADY NAMES…'`, so the file answered the gate's question twice and the rendered
label was free to drift. The gate was asking the right question; the file was
answering it wrong. The tooltip now reads "the third set, bound, is…", the only
string beginning with `bound` is the one the strip renders, and the same mutation
now fails by name ("RENDERED says the app renders "bound", and
SectionPicker.tsx no longer contains a string that can produce it"). Reverting it
passes.

### The CDP harness

Two violations planted in the app source **together**, rebuilt, and run once
(`VITE_AURORA_DEBUG=1 npm run build`, exit 0, then the harness):

- `boundSections` counts unbound sections (`if (s !== null) out.push(i);`);
- `rebindOrphanNotice` returns `null` unconditionally (`if (true) return null; // PLANTED` at line 899).

**11 passed, 3 failed, 0 UNMEASURED**, each failure naming its own cause:

```
FAIL [1b] the strip prints "bound 0,1,2,3,4,5,6,7,8"; the clone's sidecars on disk say "5,6"
FAIL [3d] no [data-testid="effects-rebind-notice"] after binding authored_probe
FAIL [3h] no notice on screen; the clone's section 5 binds ojz_sec5_showcase
```

**And the plant found a vacuous row.** `[3f]` ("unbinding removes the notice")
went **green** under a build where the notice never rendered at all — a notice
that was never there is also a notice that "went away". It now asserts its own
precondition (`bound0 !== null`) and says so in its detail line when that
precondition is missing. Restored and rebuilt: **17 passed, 0 failed, 0
UNMEASURED**.

---

## 6. What the screen actually does — measured

`npm run harness:coldread-db`, 17/17, dpr 1, against a throwaway `git clone` of
aeon at `a7a4f640` under `scratchpad/`. The live `/home/volence/sonic_hacks/aeon`
was never opened by the app and never written; the harness refuses by name if
`COLDREAD_DB_AEON` names aeon's default checkout. No Ctrl+S, no Build & Run, no
emulator tool.

| what | reading |
|---|---|
| the act line | `act: own preset 0,1,2,3,4,5,6,7,8 · threaded 5,6 · bound 5,6`, 287x30px |
| `bound` against the clone's own sidecars, read in node | strip says `5,6`; disk says `5,6` |
| condition rows | still exactly **3** |
| the act line's own overflow | `scrollWidth 287` vs `clientWidth 287` — none |
| the strip against its scrollport | left edge 1px inside; `scrollLeft 0`; `overflowX hidden` |
| the notice on section 5 | 200x231px, aim at 1277,555 hits it, `onTarget=true` |
| the notice on section 0 (nothing bound) | **absent** |
| the notice after binding `authored_probe` to section 0 | present, naming `"authored_probe"` |
| after unbinding | gone |
| the notice's tier vs the warning advisory in the same card | border `rgb(110,117,137)` vs `rgb(251,191,36)` |

### The permanent cost, stated

**The strip stands at 162.53px, against the 147.53px `SectionPicker.tsx`'s own
docblock recorded before this parcel, at the same 1680x1050.** The act line now
wraps to two lines: `act: own preset 0,1,2,3,4,5,6,7,8 · threaded 5,6` is 47
characters and fitted the 287px line; adding ` · bound 5,6` makes it 58 and it
does not. **+15px of a permanent strip in a 742px column.**

**The option that would have cost zero, considered and declined.** Rendering the
sets as ranges (`own preset 0-8` instead of `0,1,2,3,4,5,6,7,8`) puts all three
back on one line — 45 characters. It was declined for two reasons, and the second
is the one that decided it:

1. it changes the rendering of two sets this parcel does not own, in a
   disclosure fix;
2. `join(',')` is a format rule three separate instruments can each state without
   drifting — this repo's suite plus `effects-section-picker-harness.mjs` plus
   `effects-section-strip-harness.mjs` all reproduce it independently, which is
   what makes them checks. A range collapser is not trivially reproducible, so it
   would either be duplicated three times or the harnesses would have to take
   their expectation from the app, which is no check at all.

The measurement is here so the owner can overturn it: 15px buys the fact that
stopped a cold reader, and the alternative costs a shared format rule.

---

## 7. What this did NOT establish

- **No build was run.** The claim that displacing `ojz_sec5_showcase` turns
  aeon's build red is derived from aeon's lint source and from the state of aeon's
  own files, not from a red build in this parcel. The cold read's own §2 records
  the same class of failure firing for real (B3, B4) but not this one. **Tagged
  for foreground follow-up** if the owner wants the build witnessed.
- **No ROM, no emulator.** No `mcp__oracle__*` call was made and Build & Run was
  never pressed.
- **Aurora still does not read the `.raster_table`.** So it cannot tell an author
  whether a given document has a lab row, and the note says so rather than
  guessing. Making Aurora read it was not attempted: the path is game-specific
  (`games/sonic4/test/ojz_scroll_test.emp`), it is a DEBUG lab artifact, and a
  wrong parse of it would turn a conditional sentence into a confident wrong one.
  **Open, with a stated reason.**
- **Cross-act bindings are invisible to Aurora.** `bound` and "no other section in
  this act does" are scoped to the loaded act; aeon's loader walks the whole game.
  A document bound from another act would make Aurora's sentence pessimistic (it
  would warn where no orphan occurs). Stated in the sentence itself ("in this
  act"), not fixed.
- **The act line stays gated on the act descriptor parsing.** With
  `act_descriptor.emp` unreadable the whole line is absent, so `bound` is absent
  too — deliberate (the two aeon sets are not printed either, so there is no false
  impression to correct, and `bound` alone under an `act:` label would read as a
  statement about wiring). The rebind notice reads no aeon file and is unaffected,
  which is the half that always survives.
- **No claim about whether an author can now reach a green build with a new
  raster band.** They still cannot without one line of aeon: this parcel makes the
  dead end legible, it does not open it. That is the brief's own framing and it is
  restated here so nobody reads the fix as more than it is.
- **`effects-section-strip-harness.mjs` is still red for a pre-existing reason**
  (§8), and this parcel did not fix that.

---

## 8. Peer instruments this change touched

Two CDP harnesses assert the act line. Both were read, and each was corrected
only for what this change broke.

**`scratchpad/effects-section-picker-harness.mjs`** — two breakages, both mine,
both fixed and re-run **14 passed / 1 failed** (the one failure is pre-existing;
see below):

- `[4d]` compared the act line by **exact equality** against
  `` `act: own preset … · threaded …` ``. `independentDerivation()` now parses the
  sidecars for a third set and the expectation includes it. Re-run: **PASS**, and
  it is still an independent parse — the harness reads the same tree the app read,
  in its own process.
- `[6a]` finds "the reason painted beside the disabled Delete button" by looking
  for a leaf div containing `binds "ojz_sec5_showcase"`. The new notice **opens
  with the same seven words** and sits EARLIER in the DOM, so `leaves[0]` silently
  became the wrong sentence and the row failed on text that was perfectly correct
  for the other control. The finder now asks for `Deleting it would leave`, which
  is unique to `deletePresetRefusal`. (`Hand-authored raster` was tried first and
  is **not** discriminating: it is also in the LimitBlock prose and in every option
  of the select, so a leaf-ness test built on it resolves to a container holding
  the whole card. That intermediate state was measured, not assumed.)
  - ⚠ **Worth a reader's attention**: two sentences in one card now open with
    `Section 5 binds "ojz_sec5_showcase"`. They are about different acts (delete
    vs rebind), they sit at their own controls, and their second clauses differ —
    but the collision is real and is recorded here rather than discovered again.

**`scratchpad/effects-section-strip-harness.mjs`** — one clause fixed, the harness
still red for an older reason:

- `[4c]` matched the act line with the **end-anchored** `/ · threaded \?$/`.
  A line another parcel may extend is exactly where an end-anchored pattern
  silently matches nothing, which reads like the property having broken. Now
  `/ · threaded \?(?: ·|$)/`, and the measured line under an unreadable library is
  `act: own preset 0,1,2,3,4,5,6,7,8 · threaded ? · bound 5,6` — `bound` correctly
  still printed, because it is Aurora's own data and does not degrade with aeon's.
- **PRE-EXISTING, NOT FIXED**: rows `[3a] [3b] [3c] [3d] [3e] [4b] [4c]` all assert
  `conds.rows.length === 2` and the `✗` mark, and the strip has published **three**
  rows with a `☐`/`✗` split since the D-A + C1 parcel of 2026-09-05. That is that
  parcel's debt, not this one's; deciding what those seven rows should assert now
  is a separate change. Reported, not touched.

**`scratchpad/effects-section-picker-harness.mjs` `[4a]` is also pre-existing**: it
asserts that a SHARED section names its sharers, and aeon has no shared preset
record any more — `section-wiring.test.ts`'s own real-tree row asserts the shared
set is EMPTY. The row's subject does not exist. Untouched by this parcel and
failing before it.

---

## 9. Files

| file | what |
|---|---|
| `src/core/formats/effects/section-wiring.ts` | `boundSections`, with the docblock for why it is a set and not a row and why it takes the sections |
| `src/renderer/providers/effects-preset.ts` | `rebindOrphanNotice`, with the aeon derivation cited at the code |
| `src/renderer/components/effects/SectionPicker.tsx` | the third set on the act line, its title, and the separator-as-its-own-node |
| `src/renderer/components/effects/BandPresetPanel.tsx` | the notice under the Section select, in the note tier |
| `src/core/formats/effects/__tests__/section-wiring.test.ts` | `boundSections` rows |
| `src/renderer/components/effects/__tests__/preset-rebind-orphan.test.ts` | new: the notice's arms, both components' wiring, and the two aeon-derivation rows |
| `docs/guides/effects-first-run.md` | the schematic, §6's third set and rebind cost, two stale snapshots removed |
| `scripts/check-guide-text.mjs` | `act:` and `bound` rows; the `ojz act1` row deleted with its span |
| `scratchpad/coldread-db-harness.mjs` + `package.json` | the CDP harness, registered |
| `scratchpad/effects-section-picker-harness.mjs`, `scratchpad/effects-section-strip-harness.mjs` | peer instruments this change broke |
| `docs/captures/2026-09-06-coldread-db/` | four captures from the green run |
