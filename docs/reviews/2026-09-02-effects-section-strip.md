# EW-SHAPE-STRIP — the permanent section strip

**What this answers.** The owner ruled the Effects tooling's shape on 2026-09-02
(`docs/decisions.jsonl`, `d-26b-effects-tooling-shape-ANSWERED`:
`three_sub_tabs_plus_section_strip`). Its centrepiece is *"a strip that always
states which section you are editing and what it is bound to"* — the missing fact
behind three of the fourteen defects in
`docs/reviews/2026-09-02-effects-cold-walkthrough.md`, including the one that
cost a red build (defect 6, log §b4).

**Branch** `feat/effects-section-strip`, three commits.
**Suite** 6357 → 6365 passing, 0 failing, 8 skipped (each naming its reason), tsc
clean. **Harnesses** `effects-section-strip` 14/14 (new) and
`effects-section-picker` 15/15 (wave 1's, kept green against the new shape).

---

## 1. The measured delta — what wave 1 already had

Step 1 of this lane was a measurement, not an assumption.
`scratchpad/effects-strip-delta-probe.mjs` drives the real app and asserts
nothing; it prints the picker's geometry at three scroll positions. Run against
**master's** build, 1680×1050 under xvfb, on a writable extract of aeon
`origin/master` `cb0e5eb1`.

**Already shipped by EFFECTS-W1, and NOT rebuilt here.** The picker is first in
the column and never collapsible; it names the section, prints `scene … · raster
…` read from the section itself, changes `activeSectionIndex` without leaving the
tab (and the raster binding far below follows), carries the derived wiring, and
refuses to gate. `core/formats/effects/section-wiring.ts` derives everything per
act, per load, from aeon's own two files. **All fifteen of its harness rows are
taken with the column at the top**, and every one of them still passes.

**What did not hold is the word "permanent".** With every section of the column
open:

| where | the picker's box | `checkVisibility()` | `getClientRects()` | strict `elementFromPoint` |
|---|---|---|---|---|
| top of the column | `top = 106` (in view) | true | 1 | the select |
| at the raster binding (`scrollTop 1602`) | **`top = -1496`** | **true** | **1** | **null** |
| bottom of the column (`scrollTop 2741`) | **`top = -2635`** | **true** | **1** | **null** |

Column: **742px visible against 3,483px of content.** The second per-section
binding — the control this caption is *about* — is ~1,600px down; the strip was
1,496px above the top of the window by the time you reached it.

> ⚠ **Two thirds of this repo's standard paint trio go green on an element
> scrolled 2,635px out of its own scroller.** A permanence row written with
> `checkVisibility()` + `getClientRects()` — the pattern this repo uses
> everywhere, for good reasons about hidden disclosures — would have gone green
> on the defect. Every permanence row in the new harness compares the strip's
> rect **against the scroller's own box** and requires the strict
> `elementFromPoint`; the other two are printed as evidence and are never the
> gate.

**So the honest delta is three things**, and the first is the parcel:

1. **permanence** — the fact was in the column, not on the screen;
2. **the two conditions stated apart** — wave 1 printed one collapsed chip
   (`raster: needs one aeon line`), and which of the two conditions a section
   fails is the only thing that decides what its author does next;
3. **the cost of being permanent** — the old box was 200px of a 742px column,
   most of it a five-line paragraph.

---

## 2. What shipped

### The strip is sticky, and that forced the component's shape

`position: sticky; top: 0` on a **direct child of the scrolling `Panel`**. Sticky
resolves against the nearest scrollport, so a sticky box nested inside a
non-scrolling wrapper would stick to the wrapper and scroll away with it — which
is why `SectionPicker` now renders a **fragment of two siblings** rather than one
box. Row `[2a]`'s `firstInColumn` assertion still pins the strip itself as the
column's first child.

### Permanent: the section, its bindings, and the two conditions

```
Editing   [ Section 0                      ▾ ]
scene ojz_act1_start · raster hand-authored
✓ own preset  OJZ_Preset_Sec0
✗ threaded    nothing threads ojz_act1_sec_raster(sec: 0)
act: own preset 0,1,2,3,4,5 · threaded 5
```

**108px**, where the pre-strip box was 200px. A permanent header costing 27% of
the column is a different defect, so the five-line advisory paragraph moved
**out** of the sticky box to a sibling directly beneath it — still first in the
scrolling flow, still never collapsed, and carried verbatim on each condition
row's `title`.

### The two conditions, and why they are two rows

`raster-binding.ts`'s standing refusal and `section-wiring.ts`'s header both turn
on keeping these apart; conflating them is how three different wrong answers were
published in one day. The strip now prints them as two rows with their own
`✓` / `✗` / `?`, because **which one you fail decides what you ask for**:

| | fails when | the ask |
|---|---|---|
| **1 — own preset** | another section binds the same preset record | a programmer **splits the record** |
| **2 — threaded** | no `preset()` passes `<act>_sec_raster(sec: N)` | **one line of aeon** |

`sectionWiringConditions()` returns both, and **condition 2 is asked even when
condition 1 fails** — no short-circuit, because "which one do I fail" is the
question the strip exists to answer and a short-circuit answers it for only half
the sections. Condition 2 is **existence**, worded to match aeon's own gate
message; whether the threading record is the one the section actually binds is a
third fact, reported in the detail rather than folded into the verdict, and
`sectionConditionsAgreeWithState()` is the asserted seam between the two rows and
the collapsed word the rest of the column still reads.

### It advises; it does not gate

Nothing is disabled. Each condition reads its own file, and the two **degrade
independently**: hide the act descriptor and condition 1 reads `? could not read
act_descriptor.emp` while condition 2 still answers; hide the effects library and
it is the other way round. Rows `[4a]` `[4b]` `[4c]` are that, on the running app,
with the files actually renamed aside and put back.

---

## 3. Two things the instruments told me I had wrong

**1. I expected both conditions to go blind when one file is missing.** Row `[4b]`
went red on its first run. With only the descriptor gone the effects library is
still there, so condition 2 is genuinely answerable and genuinely `no`. The row
now asserts that **asymmetry**, and `[4c]` was added to prove it in the other
direction — a stronger claim than the one I set out to make.

**2. The strip contradicted itself, in one box, at one moment.** With the library
unreadable it printed

```
✓ own preset OJZ_Preset_Sec0          ← the condition row
act: own preset none · threaded ?     ← the act-wide line, two lines below
```

`eligibleSections()` goes through `sectionRasterState()`, which answers `unknown`
for **every** section as soon as **either** file is unreadable. The act-wide
statement of a condition must be derived from *that condition*:
`ownPresetSections()` is, and the contradiction is pinned by a unit row and by a
clause in harness row `[4c]`. **It was visible only in the harness's own printed
detail — no row was gating on it** — which is the argument for printing the
subject and not just the verdict.

---

## 4. Red-first, from a committed baseline

`scratchpad/poisons-effects-section-strip.sh`. Baseline `96859315`; each poison
shows the mutation as a real `git diff` of the working tree, names the runner,
and restores with `git checkout --` (`0 dirty file(s)` printed after each).
Poisons 1 and 2 rebuild the app with `VITE_AURORA_DEBUG=1` between the mutation
and the run. Poison 3 uses `vitest.poison.config.ts` — a fresh transform cache
per run, printed **0 before, 1 after**, because vitest keys transforms on
mtime+size.

| poison | mutation | runner | result |
|---|---|---|---|
| 1 | `position: 'sticky', top: 0,` deleted | `effects-section-strip-harness` | **11/14** — `[2b] [2c]` and, as collateral, `[3a]` |
| 2 | the second `<ConditionRow>` deleted | `effects-section-strip-harness` | **7/14** — `[3a] [3b] [3c] [3d] [3e] [4b] [4c]` |
| 3 | `ownPresetSections` routed back through `sectionRasterState` | `vitest … section-wiring.test.ts` | **1 failed / 21 passed**, naming the contradiction row; restored → 22/22 |

**Poison 1's collateral is worth reading**: `[3a]` measures the condition rows'
`elementFromPoint` immediately after the scroll to the raster binding, so without
sticky those rows are off-screen too. It is reported rather than tuned away —
the row is about paint, and the poison genuinely destroys their paint.
`[4b]`/`[4c]` stay green under poison 1 because they reload the page, which
resets the scroll; that is correct, and it is why permanence needs its own rows.

**Plant.** `PLANT=rot-strip` finds the strip by an attribute nothing carries:
`[2a]` fails and the run **aborts** — `3/4 rows had run — this is NOT a pass over
the rows that never ran.`

---

## 5. For the owner — the appearance is UNRATIFIED

d-26b's own note says he chose the reasoning, not the picture. The built strip is
captured **scrolled 1,922px down of 3,494px** (read back and printed by the
harness), because a shot at `scrollTop 0` would show him the one state that was
never in question:

```
scratchpad/shots-effects-section-strip/effects-section-strip-scrolled.png
```

(`scratchpad/shots*/` is gitignored, as wave 1's capture was.)

Granular calls made without asking, each reversible in one line: `Editing` rather
than `Editing section` as the label (the shared 64px label column wraps the
longer string to two lines, spending ~14px of a permanent strip on a word the
option beside it already says); the `✓ ✗ ?` marks in success/warning/faint rather
than words; the act-wide sets line kept in the monospace micro tier.

---

## 6. What the instruments cannot see

- **Nothing here ran a ROM.** No emulator, no `mcp__oracle__*`. What a bound band
  looks like on screen remains `NO_PREVIEW`'s subject.
- **The two sub-tab clauses of d-26b are still not built** — this parcel is the
  strip only. Everything here survives that re-layout; the strip is already a
  direct child of the scrolling column, so it becomes the sub-tabs' header
  unchanged.
- **The wiring numbers are today's** (aeon `cb0e5eb1`: own preset 0–5, threaded
  5), asserted so a changed world is distinguishable from a broken parser. The
  product never sees a literal; the harness re-derives them in its own process
  from aeon's files rather than importing Aurora's module.
