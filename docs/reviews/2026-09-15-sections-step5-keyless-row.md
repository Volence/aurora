# SECTIONS-STEP5-KEYLESS-ROW: the currency block re-pinned to regions step 5, and the reader against aeon's sectionless night region

2026-09-16 UTC (the evening of 2026-09-15, -0400). Branch `fix/sections-step5-keyless-row` off
master `ef6b43e3`. Target: aeon `807bfdd5c723c3eebf7fd613ef40a9709836d3cd`. Every aeon byte in
this parcel was read through git objects at a named revision (`git -C <aeon> show <rev>:<path>`,
`git -C <aeon> log`), never aeon's working tree — that lane was committing throughout the
evening, and its `origin/master` moved under this session twice. Governing bar:
`docs/OVERSEER-REVIEW-BARS.md` bar 19. Follows
`docs/reviews/2026-09-14-sections-0-7-regions-reader.md` (row 180), whose "left open" names this
parcel: *"aeon's step 5 (a key-less row) is measured when it is pushed, by re-pinning
`AEON_REGIONS_PIN`"*.

| commit | what |
|---|---|
| `9e318188` | the re-pin, the two new currency rows, the second instrument's edge resolution, and the four existing rows that read the table's length as the section count |
| this packet's commit | this packet and ROADMAP row 181 |

## What was owed, and why nothing could answer it before

`UnkeyedEffectsRow` was built on 2026-09-14 for a shape aeon had **not shipped**. Every row that
exercised it was synthetic; the file said so in its own words (*"the key-less row below is NOT
aeon's step-5 row, which was unpublished when this was written"*). So the reader had a path for a
region belonging to no section and no evidence it would meet the real one and recognise it.

It is published now. aeon `807bfdd5`, "content(REGIONS-P2): the night region — the act's first
identity edge off the section grid, with the first cross-fade", appends a tenth row to
`OJZ_ACT1_REGION_ROWS` with no `parallax:` and therefore no `sec:` anywhere inside its call:

    // row 9 — the night region (see the block above OJZ_NIGHT_X0)
    ojz_region(x0: OJZ_NIGHT_X0, x1: OJZ_NIGHT_X1, y0: 0, y1: 2047, effects: OJZ_Preset_Night),

## The pin, derived and not taken on report

`git -C <aeon> log origin/master -- games/sonic4/data/levels/ojz/act1/act_descriptor.emp
games/sonic4/data/effects/ojz_effects.emp` names, newest first:

| revision | subject | touches |
|---|---|---|
| `8fd994c7` | fix(E2): the preset initializer must start on the declaration's own line | `ojz_effects.emp` only |
| `7de53e2e` | fixture(REGIONS-P2 E2): a DEBUG-only palette SNAP edge at x=5600 | both, and `tools/test_lab_index_lint.py` |
| `807bfdd5` | content(REGIONS-P2): the night region | both |
| `1a657990` | regions-p1 step 4: delete the section identity fields | both |

`807bfdd5` is an ancestor of aeon `origin/master` (`git merge-base --is-ancestor`, exit 0). Its
blobs: act_descriptor `a0b99cd3`, ojz_effects `8907dff1`. The dispatch named `7de53e2e` as the
newest touching the descriptor; `8fd994c7` had landed since, and it carries the same descriptor
blob.

**The queue row's SHA was wrong and it was checked rather than assumed.** `docs/lane-log.jsonl`
line 491 says *"aeon step 5 (b010032e)"*. `git show --stat b010032e` is a one-line change to
`docs/decisions.jsonl` ("decisions: NIGHT-REGION-LOOK's options carry names") and touches neither
file. A SHA in a queue row is a claim, not a measurement.

### Why the pin stops at `807bfdd5` and not at the tip — a judgement, so it is written down

Measured at `7de53e2e` and `8fd994c7` (same descriptor blob): the reader returns the **same nine
bindings** and **two** unkeyed rows — `OJZ_Preset_NightSnap` at line 592 ahead of
`OJZ_Preset_Night` at line 624. Two reasons this block stops short, neither of them that the newer
text is harder to type.

1. **The second instrument's own validity becomes unmeasurable.** `regionRowsByLine` reads the
   table one physical line at a time and is valid only while the table is written one row per
   line. It asserts that by comparing its row-line count to the DECLARED arity. At `807bfdd5` the
   declaration is `[Region; 10]`, a literal. At `7de53e2e` it is
   `[Region; OJZ_ACT1_REGION_ROW_COUNT]`, and that constant is `10 + OJZ_E2_SNAP_ROWS_LEN` over
   `OJZ_E2_SNAP_ROWS = if DEBUG == 1 { … } else { [] }` — **two values, not one**, and no static
   reader of that file can say which. The dispatch's own rule applies: an unresolvable constant is
   a BLOCKED row, never a typed fallback. Pinning there would have cost the precondition that
   makes the instrument mean anything. (The table's terminator changes too: `] ++ OJZ_E2_SNAP_ROWS`
   does not match the instrument's `^\s*\]\s*$` end condition, so the scan would run past the
   table in silence.)
2. **The extra row is not shipped bytes.** aeon's own comment above it: *"THE RELEASE TABLE IS
   UNTOUCHED. With DEBUG == 0 the extra row is `[]` … so `OJZ_ACT1_REGION_ROWS` is the same ten
   rows"*. Whether Aurora should surface a row that exists only under aeon's DEBUG flag is a
   product question, and a currency row that quietly settled it would be the wrong place to find
   that out.

**What a later re-pin owes** is in `AEON_REGIONS_PIN`'s docblock: past `7de53e2e` both the
declared-arity assertion and the "exactly one key-less row" derivation have to be re-cut.

## The two new rows, and how each expectation is derived

Both are in the `AEON_REGIONS_PIN` block — CURRENCY rows, the file's own distinction from the PIN
rows above them (a pinned blob equals itself forever; these ask whether the reader still
understands what aeon publishes).

**1. `THE SECTIONLESS REGION: the key-less row is REPORTED, bound to no section, carried by the
load`.** The expected list is `regionRowsByLine`'s reading of the same bytes — the row lines with
zero `sec:` — mapped to `{preset, constructorName, line, sectionKeys: []}`. Nothing is typed. The
row asserts the reader's `unkeyed` equals it, that the load marks the descriptor `parsed` anyway
(a row naming no section falsifies no section's reading), that `unkeyedRows` carries it, and that
the bindings-only door throws naming the preset.

Its **anti-vacuous control moved here** from the bindings row, where it had been guarding a `[]`:
this same descriptor declares `comptime fn ojz_region(…, effects: Label, …)`, which a reader that
did not exclude `fn` parameter lists would report as a *second* orphan naming a preset called
`Label`. So "exactly the table's one orphan" is a statement about what the reader refused as much
as what it found.

**2. `AND IT IS THE ROW OFF THE SECTION GRID: its edges are CONSTANTS, resolved out of the same
file`.** The control that the row Aurora surfaced is *that region* and not any key-less text.

**The edges are named constants, and the row measures that before resolving them.** aeon's table
says `x0: OJZ_NIGHT_X0, x1: OJZ_NIGHT_X1`. This parcel was dispatched with the sentence "the night
region is x 3400 to 4799" — a value relayed from a third party. The row asserts each edge is NOT a
bare number, then resolves it with `resolveIntConst` / `resolveEdge`, which read
`const NAME = <integer>` out of the descriptor with comments stripped, require exactly one
declaration, and **return null — never a fallback — for any other shape**, so a caller must say it
could not measure.

**The grid derivation was wrong first time and the instrument said so.** The first draft derived
the section stride as "the common span of the keyed rows". That is FALSE at this pin: rows 1 and 2
were *shrunk* to make room (`x1: OJZ_NIGHT_X0 - 1`, `x0: OJZ_NIGHT_X1 + 1`), so the keyed x spans
are three distinct numbers, not one. The row went red on the first run — *"the keyed rows do not
all span one width, so no section grid can be derived from them"*, three where one was asserted —
rather than quietly taking the most common value. What **is** unanimous is the VERTICAL span: all ten rows,
the night region included, are one section tall and every y edge is a literal. That is the stride,
cross-checked against the x span of the rows the carve did NOT touch — so "the act's sections are
square" is measured on these bytes instead of assumed, and the two disagreeing reddens.

Then: `x0 % grid != 0` and `(x1 + 1) % grid != 0` (aeon's own `ensure` beside the constants says
what this means: an edge on a multiple of the section size *"would be a section edge again"*), and
the region straddles a section line. Plus a second, **grid-free** proof of the same fact: the rows
abutting it left and right, in the same y band, are keyed to DIFFERENT sections — two sections
gave up part of their rectangle for it, which is why there is no single key to read.

The pinned reading, asserted as an OUTPUT of that resolution: `[grid, x0, x1] == [2048, 3400,
4799]`.

## The table now has more rows than the act has sections

Four existing rows read those as one number and would have gone on doing so in silence. A
`secs[0]` read over the whole table is `undefined` on the last row, which `toEqual` compares
against a missing binding and calls equal.

| row | before | after |
|---|---|---|
| the second instrument SAW the table | every row has exactly one `sec:` | exactly one `effects:` per row, **at most** one `sec:`, and the split pinned at `[10, 9, 1]` |
| THE READER AGAINST IT | `unkeyed` is `[]` | one binding per KEYED row; a key-less row's preset is bound to no section |
| THE PAIRING TRAP | asserts on every row | asserts on keyed rows, `next` still drawn from the whole table, so a forward-searching reader handing section 8 the night preset is NAMED |
| THE LOAD'S READING IS PARSED | `n = t.rows.length` | `n = keyed(t).length` — `n` is fed to `ownPresetSections`/`wiredSections`/`armBarredSections` as "how many sections are there" |
| SECTIONS 0 AND 7 COME BACK BARRED | `n = t.rows.length`, `t.rows.filter(...)` | keyed rows only, before any `secs[0]` |

## Red-first

Runner: **`npx vitest run src/core/formats/effects/__tests__/section-wiring.test.ts`** (the repo's
vitest, the same runner `npm test` invokes; the file is inside `src/**/__tests__/**/*.test.ts`).
Every mutation was applied on disk, the mutated line quoted back from disk and `git diff --stat`
shown naming the file, and every restore was `git checkout 9e318188 -- <path>` from the COMMITTED
baseline with `git status --porcelain` printing nothing afterwards. Baseline: **78 passed**.

| # | mutation, on disk | red | what it proves |
|---|---|---|---|
| M1 | reader: `if (keys.length > 1) unkeyed.push(…)` — a key-less row is DROPPED | **6** red, both new rows among them | the reader never drops the row |
| M2 | the test: `AEON_REGIONS_PIN` back to `6bd8ed89`, the pre-step-5 pin | **3** red — the instrument row and both new rows; **every synthetic row stays green** | THE DISCRIMINATING ONE. The new rows answer a question about aeon's PUBLISHED bytes that no fixture in this file can. They refuse loudly: *"no region row without a section key. This block is pinned at aeon 807bfdd5 (regions step 5) for the night region; a pin before it cannot ask this question"*, and the instrument row prints `expected [9, 9, 0] to deeply equal [10, 9, 1]` |
| M3 | the test: `resolveIntConst` requires `pub const`, so aeon's bare `const OJZ_NIGHT_X0` no longer resolves | **1** red, row 2 only | the BLOCKED path: *"could not resolve x0 \"OJZ_NIGHT_X0\" to an integer out of this descriptor. NO VALUE IS SUBSTITUTED"* |
| M4 | M3 **plus** `resolveIntConst` returning `0` instead of `null` — the typed fallback the design forbids | **1** red, row 2 only | a fallback does not reach green: *"x0 = 0 IS on the 2048px section grid, so this region does not begin off it"* |
| M5 | reader: a key-less row is GIVEN the highest section seen instead of reported | **7** red | never invent a key, against real bytes. The pairing trap names it: *"section 8 … must bind OJZ_Preset_Plain, the preset in its own row, not OJZ_Preset_Night from line 560"* |

M1 and M5 also redden synthetic rows, which is why M2 is the one that carries the parcel's claim.

## Aggregate totals

`npm test` on `9e318188` (the full chain: the `check:*` scripts, `tsc --noEmit`, then
`vitest run`) — **9683 passed | 9 skipped (9692); 621 files passed | 3 skipped (624); 0 failed**,
exit 0, 22:30:09 to 22:31:15 -0400. Every skip named its reason (`skip-report: OK`) and the
failure-class reporter recorded no failures in 624 modules. Row 180's round-2 total on master
`7e261f06` was 9681 passed | 9 skipped (9690) in the same file counts, so the delta is **+2**, the
two rows this parcel adds, and nothing else moved.

`npx tsc --noEmit` clean. `check-cited-paths`, `check-doc-citations` and `check-prose-constants`
each rc 0 with this packet and ROADMAP row 181 on disk.

## Left open

- **The pin is two commits behind aeon's tip on these files**, deliberately (above). Nothing here
  measures the reader against `7de53e2e`'s DEBUG-only second orphan; what IS measured is that the
  reader returns the same nine bindings and two unkeyed rows there.
- **Whether Aurora should surface a DEBUG-only row at all** is undecided and is a product
  question, not this block's.
- **Nothing renders the row.** `unkeyedRows` is carried on the wiring and drawn nowhere; its seat
  is design Q8 (where `effectsRef` lives), owed to empyrean. No emulator was run and nothing in
  this parcel looked at a screen.
- Row 180's other open items are untouched: design Q8, a barred section that is already bound
  (UI-5), the `[data-effects-arm-unknown]` text, band-preset `[3a]`, and
  `preset-rebind-orphan.test.ts`, which still reads aeon's working tree (bar 19).
