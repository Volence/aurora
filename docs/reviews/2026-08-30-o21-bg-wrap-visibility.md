# O21 — the background repeats, and the row's number was on the wrong axis

**Date** 2026-08-30 · **Queue** O21 · **Branch** `fix/bg-wrap-visibility` ·
**Instrument** `scratchpad/bg-wrap-harness.mjs` (`npm run harness:bg-wrap`) ·
**Captures** `scratchpad/shots-bg-wrap/` (not committed)

---

## 1. The arithmetic, and which axis each number is on

The row read: *"The background image wraps 2,048 px before the act ends and nothing checks
it."* Three numbers get compared in this conversation and **no two of them are on the same
axis**:

| number | unit | what it is | authority |
|---|---|---|---|
| **64** | Plane-B **cells** | Plane B's width, and its height | `BG_WIDTH` (`src/core/formats/bg-tiles.ts`); `BG_LAYOUT_WORDS / BG_WIDTH` — aeon `PLANE_H_CELLS` = `PLANE_V_CELLS` = 64, `engine/system/constants.emp` |
| **512** | Plane-B **pixels** | the wrap modulus, both axes | `64 × TILE_WIDTH_PX` — `PLANE_COLUMN_SPAN` (new) and `PLANE_LINE_SPAN` (existing) |
| **2048** | **world** pixels | one act section | `SECTION_PIXEL_SIZE`; aeon `SECTION_SIZE = $800`, `SECTION_SIZE_SHIFT = 11` |

A world pixel and a plane pixel are different units and the exchange rate is the **parallax
factor** — per band horizontally, per scene vertically. So "the background wraps every N px"
has no answer until N's axis is named, and comparing 2048 to 512 is not an arithmetic
error, it is a **category error**: it answers confidently and wrongly.

**The dispatch's own reconciliation attempt was right to stall.** 64 tiles × 8 px is 512 px,
and that is genuinely not 2048. Neither figure was wrong; they were on different axes.

### Where the row's 2,048 actually comes from — and it is not a wrap width

It is the **vertical overshoot in world pixels**, traced to this repo's own BG capability
survey, row 11 (`docs/reviews/2026-08-26-bg-capability-survey-s1-s2-s3k.md`, re-grounded by
O19):

> a 512-px background covers an act of at most `512 << v_factor_bg`, and OJZ act 1 (6,144 px
> at v_factor 3, ceiling 4,096) is **2,048 px past it**

`6144 − 4096 = 2048`. That is `act_height − ceiling`, and it **coincides numerically with
`SECTION_PIXEL_SIZE` by accident** — which is exactly why it reads as a wrap width when it
is relayed without its axis. The lane-log entry for O19 carries the same sentence in the
shorter form the queue row inherited.

### The real numbers, derived

Non-wrapping requires `camera_travel >> v_factor < 512`, i.e. travel below `512 << v_factor`
**world** px. For OJZ act 1 (`GRID_W = 3`, `GRID_H = 3`, aeon
`games/sonic4/data/levels/ojz/act1/act_descriptor.emp`):

- act extent **6,144 × 6,144** world px;
- camera travel **5,824 × 5,920** world px (`extent − SCREEN_WIDTH/HEIGHT`);
- at `v_factor 3`: ceiling **4,096** world px, seam at camera Y **4,096**, and the last
  **1,824 px** of the act are drawn over the seam;
- at `v_factor 4` (what aeon runs now): ceiling **8,192** — no wrap at all.

**Independent corroboration that this models the right camera:** the derived vertical travel
is **5,920**, and aeon's d-31 detail records `Camera_Y_Max` read **live off the running ROM**
as `0x1720` = 5,920. Aurora reaches that from `SECTION_PIXEL_SIZE` and `SCREEN_HEIGHT` alone.
`bg-wrap.test.ts` carries that as an explicitly-labelled **agreement** row, not a derivation.

### ⚠ A correction to the survey's own headline, offered rather than edited

The survey compares **act extent** (6,144) to the ceiling and gets **2,048**. The camera
never reaches the last screenful, so the quantity that predicts where the seam falls is
**travel** (5,920), which gives **1,824**. Both statements are true about different things;
only the travel one is a statement about the seam. Aurora now reports 1,824.

### Does the row's premise survive?

**Half of it, and the surviving half is the important half.**

- *"wraps 2,048 px"* — **no.** Wrong axis, wrong quantity, wrong name. The wrap period is
  512 **plane** px, which is `512 << v_factor` world px vertically and, horizontally, the
  camera-X at which a band's decoded scroll reaches 512 — a different number per band.
- *"before the act ends"* — **yes**, for OJZ act 1 at `v_factor 3`, and the seam is a
  measured fact, not a prediction: aeon witnessed it on the running ROM (d-31: *"camY 61 →
  scroll −57 → VDP row 455; predicted seam 57 px down and confirmed by a background-only
  capture"*).
- *"and nothing checks it"* — **yes, fully.** aeon's own `DEFERRED_WORK` says no build rule
  checks it, and Aurora had nothing: `renderBg` draws the 512×512 plane once at world origin
  with no parallax and no tiling; `cameraPreviewPlan` composites correctly but only at the
  frame's single anchor. Nothing anywhere related a background's reach to an act's length.

## 2. What was built, and why not the alternatives

Repetition is **normal and desirable horizontally** — the survey's row 19 states the
invariant outright: *"every background layer must be periodic at 512 px horizontally"*,
because Plane B is blitted once at level load and only scrolled. Vertically it is a tear.
The two halves therefore get **different treatments**, and that split is the whole design.

**Horizontal — a readout, in the `fb` control's tooltip.** How much camera one pass costs and
how many passes the act buys. Zero panel height, on the control that decides the number.
*Rejected:* a visible line per layer — it would add height to every layer card of every scene
to report the normal case, which is precisely the defect O15 spent a parcel removing from
this panel. *Rejected:* a warning — a warning nearly every band earns is a warning nobody
reads, and it would be strictly worse than the current silence.

**Vertical — an advisory under `V factor`, and only when the plane over-commits.** It names
the shift, the ceiling, the act's travel, where the seam lands, how much act is past it, and
the smallest larger shift that fits (found by searching with the same function that produced
the verdict, so it cannot recommend a shift that still wraps).

**Why it does not fire on every act — the constraint the dispatch set, met three ways:**

1. It is silent on **every locked scene** (`v_factor 15`), forever. That is both of Aurora's
   scene files and 18 of aeon's 20.
2. It is silent on any unlocked scene whose shift has **room for its act** — proven live:
   taking the remedy silences it while the plane stays unlocked (`[4h]`).
3. It fires on **zero scenes that exist today.** What it catches is the one gesture with no
   feedback at all: dropping this spinner off the lock on a tall act, free to do in this
   panel, silently tearing the background in the ROM.

⚠ **That "fires on nothing today" is the trap this parcel is shaped like** — a correct
implementation and a deleted one look identical from outside. Every discriminating harness
row therefore drops the spinner off the lock through the real control first, and every one
is paired with a locked control that must be silent in the same session.

**Not built, deliberately:** any prevention. No clamp, no refusal; the spinner still offers
every shift and the document still saves (ROADMAP row 58). Proven live at `[4f]`.

**Not built, and named:** canvas marks on the map at each repeat's world position. It is the
most direct reading of *"see where the repeat lands relative to the act's length"*, and the
geometry to draw it now exists (`bandReach().wrapCamXs`). It was cut because the panel half
answers the same question at a fraction of the surface area, and a half-built overlay with no
harness would be worse than none.

## 3. What changed

| file | what |
|---|---|
| `src/renderer/canvas/bg-wrap.ts` | **new.** The arithmetic: `PLANE_COLUMN_SPAN`, `actReach`, `bandReach`, `bandReachClause`, `verticalReach`, `verticalWrapAdvisory`. |
| `src/renderer/canvas/__tests__/bg-wrap.test.ts` | **new**, 21 rows, every expectation derived. |
| `src/renderer/components/effects/EffectsScenePanel.tsx` | the `fb` tooltip clause; the `V factor` advisory. |
| `src/renderer/canvas/effects-guides.ts` | `layerIsEnabled` param widened to `Pick<…, 'enabled'>` — strictly looser, no behaviour change. |
| `src/renderer/debug-hooks.ts` | `aeon.state()` reports `gridWidth`/`gridHeight`, so a harness can derive its expectations from the act instead of copying the app's answer. |
| `scratchpad/bg-wrap-harness.mjs` | **new**, 27 rows. |
| `package.json` | `harness:bg-wrap`. |

**No literal `512`, `2048` or `5920` appears as an expectation** in either instrument. The
vitest file spells each figure as the expression producing it; the harness rebuilds
`PLANE_SPAN` from the vendored consumer contract and `bg-tiles.ts` — the same two authorities
`bg-wrap.ts` uses, reached independently — and takes the act's grid live from `__dbg`.

## 4. Red-first

**Node, plant 1 — the row's own category error** (`PLANE_COLUMN_SPAN = SECTION_PIXEL_SIZE`):

```
× the horizontal span and the vertical span agree without either quoting the other
× a plane span is NOT a section — the two numbers the row confused
AssertionError: expected 2048 to be 512 // Object.is equality
AssertionError: expected 2048 not to be 2048 // Object.is equality
      Tests  2 failed | 19 passed (21)
```

**Node, plant 2 — the warning everyone sees on every act** (drop the `wrapCamY === null`
early return):

```
× a LOCKED plane cannot wrap, so both shipped scenes are silent
× the remedy it offers is the shift aeon actually chose, and it is found by search not by guess
× DOES NOT FIRE ON EVERY ACT: the same shift is silent on an act that fits under it
AssertionError: expected 'Plane B\'s vertical scroll tracks the…' to be null
      Tests  3 failed | 18 passed (21)
```

**Harness, plant 3 — the advisory returns to nobody** (`const wrap = null` in the panel):
**17/27**, ten rows red including every derived-number row.

```
FAIL  [4a] the wrap advisory APPEARS when the plane is dropped off the lock on a tall act
FAIL  [4b] it is really painted — boxes, checkVisibility, and a hit test at its own centre
FAIL  [4d:starts over at c] the sentence carries the seam's camera Y (4096)
FAIL  [4e] AND IT IS NOT THE SECTION SIZE — the number the queue row carried is absent
```

⚠ `[4h]` — *"taking the remedy silences it"* — **stayed green under that plant**, which is
the whole reason it is paired with `[4a]` rather than trusted alone.

**Harness, plant 4 — the horizontal readout never reaches the tooltip**: **25/27**.

```
FAIL  [5a] every layer's fb control carries its repeat readout in its tooltip
FAIL  [5b] the readout names the plane span and this act's HORIZONTAL travel
PASS  [5c] it is a TOOLTIP and not a row — the same sentence is in no text node
```

`[5c]` green under the plant is correct and shows why it is not a substitute for `[5a]`.

All four reverted; `grep -n PLANT` returns nothing; `tsc --noEmit` clean.

## 5. Totals

| | before | after |
|---|---|---|
| test **files** | 432 passed / 2 skipped (**434 collected**) | 433 passed / 2 skipped (**435 collected**) |
| test **rows** | 5,883 passed / 7 skipped (**5,890 collected**) | 5,904 passed / 7 skipped (**5,911 collected**) |
| harness `bg-wrap` | did not exist | **27/27** |

Collected rows moved **+21**, exactly the new file's 21, with zero failures and zero skips —
so nothing died at collection and took its rows out quietly.

## 6. What was read at a committed revision, and what it said

`git -C ../aeon show origin/master:docs/decisions.jsonl`. **d-31 is superseded twice**:
`d-31-refiled` (2026-08-29 02:10Z) then `d-31-scoped` (02:56Z). Read in full; cited by text,
never by line.

- The whole d-31 lineage is about the **vertical** axis, and every option in it is an
  **engine or art** choice: halve the scroll rate (shipped, `v_factor 3 → 4`), repaint the art
  to tile top-to-bottom, or stream background rows so a background can exceed the plane.
- **`d-31-scoped` recommends `build`, and its cost sentence names Aurora directly:** *"the
  editor's canvas becomes a strip with a viewport, and its live preview needs rebuilding
  because it currently assumes the background never redraws."*
- **Does that change what Aurora should build here? No — and this is a finding, not a wait.**
  Everything above is arithmetic over `PLANE_LINE_SPAN` and the scene's own factor. If the
  owner takes `build`, the plane stops being the ceiling and this advisory stops firing **by
  itself**, because `verticalReach` measures the relation rather than asserting the constant;
  the horizontal readout is untouched either way. Nothing here forecloses that parcel and
  nothing here should wait for it. What *would* need rebuilding on that day is the BG editing
  canvas and the live preview — which d-31-scoped already prices as the bigger half, and
  which is not this row.

## 7. Held back

- **No canvas overlay** (§2), named rather than half-built.
- **No emulator.** Nothing in this parcel needs runtime confirmation beyond what the harness
  drives; aeon's seam is already witnessed on the ROM in d-31.
- **The survey document is not edited.** §1's correction to its headline is relayed for its
  owner, per this repo's own rule about editing a peer's record.
- **No sibling repo touched.** `../aeon` was read only, at `origin/master`.
