# LAST THREE SEAT FINDINGS — uxa F4, uxa F5, uxb F6

**Branch:** `parcel/last-three-seat-findings`, base master `558c0e1e` (contains `fb4a0328`).
**Source findings:** `docs/reviews/2026-09-07-lens-ux/uxa-walk.md` (F4, F5) and
`docs/reviews/2026-09-07-lens-ux/uxb-audit.md` (F6). Each was read in full, in the seat's own
words, before anything was touched.
**Machine constraint honoured:** no ROM build, no Electron launch, no CDP harness run, no emulator
tool called or attempted.

> ## ⚠ WHICH ROWS NEVER OBSERVED A RENDERED PIXEL
>
> **All of them.** Every claim in this packet is executed at the pure-rule, store or source layer
> under `vitest`. **F4 and F5 are fundamentally about layout, and this repo's node suite cannot
> render React** — there is no jsdom and the vitest glob is `.test.ts` — so what is proved is
> **order and default state**, which is the *mechanism* behind the reported cost, and never the
> cost itself. §6 is the tagged foreground list. Nothing below is dressed up as more.

---

## 1 · What shipped, in one line each

| Finding | Verdict | What changed |
|---|---|---|
| **uxa F4** | **fixed** (layout), one residual named, one alternative mechanism tagged | A field group's messages now render after the whole group, never between two boxes. Six pairs across four cards. |
| **uxa F5** | **fixed**, three of four contributors removed | The preset section is first on the Colour tab, arrives open, and the create row is first inside it. The guide was updated with the app. |
| **uxb F6** | **fixed** | A labelled affordance names the command palette on screen with no hover, in both explorer states; `Ctrl+Shift+P` added; `Ctrl+K` untouched. |

Three commits, one per finding, each carrying its finding in the body:

```
e313ee3e  uxb F6: the command palette gets a door a person can see, and a second chord
ff789781  uxa F4: a field group speaks after its boxes, so neither box moves under a hand
8e3727ad  uxa F5: the control the guide calls step 1 is now the top of the tab
```

---

## 2 · uxa F4 — the panel grew 120px under the reader's hand

### 2.1 What the seat established, and what this parcel therefore did not re-litigate

Two things in the seat's report are load-bearing and both were honoured.

**They ran a control before believing their own diagnosis.** With the panel settled they repeated
the identical click and typed `72` again and got `72`, so click-selects-contents works and the
`12872` was not an inconsistency between the two boxes. **This parcel treats F4 as a layout defect
and changes no selection behaviour.**

**The refusal is exemplary and is not the defect.** It named the value, the rule, the legal range,
*why* the range is what it is, and what the field still held, and clamped nothing. **Not one word
of any refusal string was touched.**

### 2.2 The mechanism in the source

`BandPresetPanel.tsx` rendered each edge box's message immediately after that box:

```
<Field label="Top">…</Field>
{edgeRefusal.top !== null && <Hint under tone="warning">{edgeRefusal.top}</Hint>}
<Field label="Bot">…</Field>
{edgeRefusal.bot !== null && <Hint under tone="warning">{edgeRefusal.bot}</Hint>}
<Field label="S/H">…</Field>
```

A message in that position is in the flow **between** two controls of one gesture, so it displaces
the next one. That is the 120px.

### 2.3 The fix, and why it is this shape

`GroupHints` (`src/renderer/components/effects/column-layout.tsx`) renders a group's messages after
the whole group. Applied to **six pairs**, not one:

| Card | Pair | Why they are one group |
|---|---|---|
| `BandCard` | `Top` / `Bot` | the pair the seat measured; two edges of one band, refused against each other |
| `RampCard` | `Top` / `Lines` | one refusal function reads both boxes to decide either |
| `RampCard` | `Start` / `Step` | the fp16 rate pair, set together, one refusal function |
| `BaseSwapBandCard` | `Line` / `Target` | two number boxes in a row |
| `BoundaryCard` | `Line` / `Channel` | first two of a run of four |
| `BoundaryCard` | `Lo` / `Hi` | the interval; refused against each other |

The seat authored a band rather than a ramp; that is the only reason they measured the reflow on
one card and not on four. Fixing only the card they walked is the partial-coverage trap.

**Consistency with `home/OpenByPath.tsx` (master `558c0e1e`):** same shape, same argument. That
component's docblock says a message below the only control in its group cannot move that control.
`GroupHints` is that generalised from one control to a pair. Nothing about this surface made it
wrong.

**Also fixed in passing:** the two edge boxes wrote one state object from a *captured* value
(`setEdgeRefusal({ ...edgeRefusal, top: r })`), so two refusals in one tick could drop a sentence.
Functional updates now. Latent; nothing observed it.

### 2.4 ⚠ The residual, and the two alternatives that were rejected

**Content *below* a group still moves when the group speaks.** A refused `Bot` still displaces the
`S/H` select. This is stated rather than hidden, and both ways to close it are worse:

- **Reserving the row's height** (the seat's first proposal) costs ~120px of blank column *per
  group* in a ~300px column that already has cards below the fold. These messages are long because
  they carry the rule plus the committed-drift clause.
- **Taking the message out of flow** (absolute) moves nothing and then either eats the clicks meant
  for the control it covers, or — with pointer events off — paints an undismissable sentence over a
  `<select>`, which has no focus handler to clear it.

What is *not* an option is moving the message far from its field: a refusal an author cannot see is
a silent refusal, which is the defect the whole refuse-at-the-control parcel exists to end. The rule
encoded is **"after the group, still beside it"**, and the residual is one `<select>` moving after a
refused edge rather than a number field taking an appended value.

### 2.5 ⚠ A second candidate mechanism, TAGGED, not asserted

Reading `ui/fields.tsx` while making this change turned up a mechanism the seat's control does not
separate from the reflow, and it is recorded because it could mean the exact gesture still
misbehaves after this fix.

`NumberField` selects its contents **`onFocus`** (`e.currentTarget.select()`), and its own comment
records that this is the fix for the original `40112` defect. A box that is **already focused**
therefore does *not* re-select when clicked: the click places a caret. The seat's sequence was
*type into Top → **tab** → click Bot → type* — and a Tab into `Bot` focuses it and selects it, so
their subsequent click landed on an already-focused box and would place a caret whether or not
anything had moved. Their control run began from a different focus state and is silent on this.

**This is not a re-diagnosis and nothing here rests on it.** The reflow is real, was measured, and
is a defect on its own terms. But if the foreground reproduces `12872` on the *fixed* build, this
is where to look, and the recipe is exactly: focus `Top`, type, press Tab, then **click** `Bot`
(do not re-focus it any other way) and type two digits. Changing click-to-select semantics on a
shared numeric field is a behaviour change to every field in the app and was refused as out of
scope for a finding whose measured content is layout.

### 2.6 Same shape, out of this parcel, named rather than left silent

`armAdvice` renders between the `ON` select and the `addr` field in the same card. It is the same
class. It is not fixed here: its trigger is a `<select>` commit rather than a numeric commit, so the
measured harm (a pre-measured coordinate taking an appended value) does not apply to it, and moving
it would separate it from the select it explains. Recorded so the next reader does not think the
sweep was complete.

### 2.7 Gate

`src/renderer/components/effects/__tests__/field-group-message-placement.test.ts` — **17 rows**,
wired into **`npm test`** (the vitest glob `src/**/__tests__/**/*.test.ts`).

The assertion is deliberately **"nothing renders between the two `<Field>`s"**, not "no `<Hint>`":
a paragraph of plain advice displaces the second box exactly as far as a refusal does, and the
seat's 120px *was* one block of prose. Comments are stripped **including their JSX braces**, or a
bare `{}` reads as a violation and the obvious repair would be to loosen the assertion.

Plus one re-spelled row in `authoring-refusals.test.ts` (`every refusal is RENDERED, at the warning
tone, in the field column`), which now asserts the `GroupHints` slot *and* reads `GroupHints`'s own
source to confirm it paints `<Hint under tone={tone}>`. The property is unchanged: a refusal that is
computed and never painted is a silent refusal.

**Red-first, each mutation shown applied via `git diff` against the committed baseline `ff789781`:**

| Mutation | Applied to | Result |
|---|---|---|
| A. put `{edgeRefusal.top !== null && <Hint …>}` back between `Top` and `Bot` | `BandPresetPanel.tsx` | **4 failed / 35 passed** — `BandCard: nothing renders between Top and Bot`, `BandCard: the Top/Bot messages render after the group`, `the old shape is gone from the panel entirely`, and `authoring-refusals`' re-spelled row |
| B. insert a plain `<Hint under>` advisory between `Lo` and `Hi` | `BandPresetPanel.tsx` | **1 failed / 16 passed** — `BoundaryCard: nothing renders between Lo and Hi` (this is the row that proves the assertion is "nothing", not "no warning") |
| C. `GroupHints` returns `<div style={{minHeight:120}}/>` when empty | `column-layout.tsx` | **1 failed / 16 passed** — `renders nothing at all when the group has nothing to say` |

---

## 3 · uxa F5 — step 1 of the guide was four scroll gestures down

### 3.1 The four contributors, and which three moved

The seat measured **4 wheel gestures** (2×600 + 2×700 deltaY) from the top of the Colour sub-tab to
the `Preset id` input.

| # | Contributor | Now |
|---|---|---|
| 1 | ~440px of the **raster timeline** section standing in front of the panel | **moved**: the preset panel is mounted *first* on the tab |
| 2 | the presets accordion arriving **shut**, costing an expand gesture | **removed**: it arrives open |
| 3 | the preset **list** and the unreadable-files warning sitting above the create row (the list grows without bound) | **removed**: the create row is above both |
| 4 | `LimitBlock`, the three limits | **kept, deliberately** — see below |

### 3.2 What was chosen, and the two things that were declined

**The section is first on the tab and arrives open.** `effects-facet.tsx` now mounts
`<BandPresetPanel />` before `<RasterTimelineStrip />`, and `providers/effects-sub-tabs.ts`'s
declared column order says so — that array is what `revealEffectsSection` routes on, so it had to
move with the render or start lying.

**The create row is first inside the section**, above the list and the unreadable warning. The
empty-list hint said *"Create one below"* and now points **above**; a stale direction in the one
sentence a project with no presets ever sees would have been the whole cost of the reorder.

**⚠ The create row is NOT above `LimitBlock`, which is the seat's literal remedy, declined with a
reason.** Saving does not install, there is no preview, and "it built" does not prove it runs: those
three sentences are what this surface is shaped around, and `band-preset-wording.test.ts` already
pins the block as the first thing inside the section body with *nothing* between it and the body's
opening tag — unconditionally, so that no future guard can decide an author has already read it. An
author creating a preset with those off screen is the failure the panel exists to prevent, and it
costs one short block. What was actually in the way was everything *after* the limits, and that is
what moved.

**⚠ The timeline was NOT collapsed to buy the 440px back**, and this is the trap in this finding.
Collapsing it is the cheapest-looking fix and it would undo an earlier one: `CollapsibleSection`
renders `{!collapsed && children}`, so a collapsed timeline **has no canvas at all**, and that strip
exists precisely because `vsplit.at` was authorable and *unseeable*. Its own header says so.
**Order is not disclosure**: the strip is still expanded, still mounted, one short scroll down. The
gate carries a standing guard on this, because the pressure to collapse it returns every time
somebody measures this tab's arrival depth.

### 3.3 The guide was updated with the app

`docs/guides/effects-first-run.md` step 1 said *"Press `Colour`, the middle sub-tab, and open
`RASTER BAND PRESETS`"*. It arrives open now, so it reads *"`RASTER BAND PRESETS` is the first
section on it and arrives open."* `npm run check:guide-text` passes: 275 inline-code spans, 143
distinct, 103 re-derived against the source that renders them.

### 3.4 Gate

`src/renderer/components/effects/__tests__/colour-tab-arrival.test.ts` — **10 rows**, in `npm test`.

Two rows are **executed** over the provider's declared data (first section, last section). One
crosses a seam nothing else in this repo checks: the declaration in `effects-sub-tabs.ts` and the
mount order in `effects-facet.tsx` are two files whose whole value is that they agree. A landmark
row fails loudly if any anchor is renamed — `indexOf` returns `-1`, and `-1` is less than
everything, so a renamed landmark would otherwise make every order row pass while measuring
nothing.

**Red-first, from committed baseline `8e3727ad`:**

| Mutation | Applied to | Result |
|---|---|---|
| D. swap the two mounts back (timeline first) | `effects-facet.tsx` | **1 failed / 9 passed** — `the facet mounts the panels in the order the provider declares` |
| E. add `defaultCollapsed` to the raster timeline section | `RasterTimelineStrip.tsx` | **1 failed / 9 passed** — `the timeline is STILL never defaultCollapsed, whatever the arrival depth costs` |
| F. move the create row back below the preset list | `BandPresetPanel.tsx` | **2 failed / 8 passed** — `the create row precedes the preset list, which has no upper bound`, `the create row precedes the unreadable-files warning` |

---

## 4 · uxb F6 — the palette was unreachable unless you already knew it existed

### 4.1 The seat's disclosure is what decided the fix

Their three presses are a **floor, not a measurement**: they knew a palette existed only because
they had read `src/renderer/shell/commands.ts` while checking something else. A reader without that
prior presses **nothing**, and the whole feature — the guides, Save All, Build & Run, New Sprite,
every level in the project, and the *only* route to a first sprite in an aeon project — is invisible
to them forever. **Another chord alone would not have touched that.**

### 4.2 What shipped

1. **A labelled affordance, above the explorer's filter**: a command glyph, the words
   `Run a command`, and `Ctrl+K` on the right. No hover required, which is the point — a tooltip
   answers *"what does this button do"* and never *"does this app have a command palette"*.
2. **The collapsed 44px rail gets the icon and the same `title`**, because that is the channel the
   seat correctly identified as already existing (`Collapse explorer (Ctrl+B)`) and 44px has room
   for nothing else.
3. **`Ctrl+Shift+P` now opens it** — the second press the seat made. **`Ctrl+K` is untouched**, per
   the seat's own note that people may already use it.
4. **`Ctrl+P` is deliberately left unbound, and the source says why**: in every editor this
   convention comes from it is *quick open a file*, a different control with a different result set,
   and in a Chromium renderer it is also the print chord.
5. **The open state moved to a store** (`state/commandPaletteStore.ts`). It was private `useState`
   inside `CommandPalette`, so the keydown listener was the only writer that could exist and **no
   affordance could have opened it however well labelled**. `openCommandPalette()` carries the same
   asymmetric dialog guard the chord does.
6. **The chord decision is a pure function** (`shell/command-palette-chord.ts`), so the node suite
   executes what actually fires rather than reading it.

The advertised labels and the working bindings come from **one array**, so "the tooltip says Ctrl+K
and the app answers Ctrl+J" cannot happen unnoticed.

### 4.3 A nuance the seats could not have seen, recorded rather than used to discount them

One screen *does* name the chord: the no-act empty canvas reads
`Open a level from the Explorer, or press Ctrl+K.` (pinned in
`src/renderer/workspace/__tests__/facet-chrome.test.ts`). **Neither seat could reach it** — opening
a project puts a level on screen with zero further gestures, so a working author essentially never
sees that screen. The finding stands exactly as filed.

### 4.4 Gate

`src/renderer/shell/__tests__/command-palette-discovery.test.ts` — **13 rows**, in `npm test`.

**Ten rows are executed** (the decision function and the store): `Ctrl+K` in three spellings,
`Ctrl+Shift+P` in three, `Ctrl+P` returning `null`, unmodified keys, `Escape` in both states, the
asymmetric modal guard in all four combinations, and the store's two paths. The strongest is a
**census**: every label in the advertised array is turned back into a keystroke and offered to the
rule, so a shortcut in the tooltip with no binding behind it fails. **Three rows read
`Explorer.tsx`** and prove the affordance is mounted in both branches from the shared constants.

**Red-first, from committed baseline `e313ee3e`:**

| Mutation | Applied to | Result |
|---|---|---|
| 1. `const isShiftP = false` | `command-palette-chord.ts` | **2 failed / 11 passed** — `Ctrl+Shift+P opens it…`, `every shortcut the tooltip advertises actually fires` |
| 2. delete the labelled row from the open explorer | `Explorer.tsx` | **1 failed / 12 passed** — `the open explorer carries a row that NAMES it without a hover` |
| 3. drop `if (modalIsOpen()) return false` | `commandPaletteStore.ts` | **1 failed / 12 passed** — `the button path carries the same dialog guard the chord does` |

---

## 5 · Executed vs read, row by row

| Rows | Kind | What they actually prove |
|---|---|---|
| `command-palette-discovery` §chords (7 rows) | **executed** | the exact set of keystrokes the palette answers, and the modal asymmetry |
| `command-palette-discovery` §store (2 rows) | **executed** | a non-keyboard caller can open it, and carries the dialog guard |
| `command-palette-discovery` §affordance (4 rows) | **source** | the element is in the render, in both branches, from the shared constants |
| `field-group-message-placement` (17 rows) | **source** | between the two `<Field>`s of six declared groups there is no element at all, and each group's messages follow its second box |
| `colour-tab-arrival` (2 rows) | **executed** | the declared column order puts the presets section first and the timeline last |
| `colour-tab-arrival` (8 rows) | **source** | mount order, default collapse state, in-section order, guide text |
| `authoring-refusals` (1 re-spelled row) | **source** | every refusal is still painted, at the warning tone, in the field column |

**No row in this parcel measured a pixel, a wheel gesture, a scroll position, a reflow or a click.**

---

## 6 · ⚠ Split for the foreground — what must be SEEN

These are held below a rendered pixel. They join the three rows already booked.

| # | Finding | What must be observed | Why source cannot answer it |
|---|---|---|---|
| **P1** | F4 | Set `Top` on a raster band, then commit `Bot` with an illegal value. **`Bot`'s own y must not change when `Top` commits.** | Proves the reflow is gone at the geometry level, not only in the element order. |
| **P2** | F4 | The same walk the seat ran, on the fixed build: `Top` → **Tab** → **click** `Bot` → type `72`. **If this still yields `12872`, §2.5's second mechanism is live** and the finding is not fully closed. | This is the one row that could reopen F4. The already-focused-click mechanism is invisible to a structure gate. |
| **P3** | F4 | The refused message is still legible beside its group at a squeezed column width (this panel's scroller has measured 129px). | `GroupHints` moves messages one row further from their box; nothing in node can measure whether they still fit. |
| **P4** | F5 | Arrive on the Colour sub-tab of an aeon act **cold** (no persisted panel state) and count wheel gestures to `Preset id`. Seat's baseline: **4**. | The whole finding is a depth measurement. Order is the mechanism; the number is the claim. |
| **P5** | F5 | The raster timeline is still **expanded, with its canvas drawn**, below the preset panel. | Guards the earlier `vsplit.at` fix against this parcel. Source proves the absence of `defaultCollapsed`; only a screen proves the canvas is there. |
| **P6** | F6 | The `Run a command` row is legible in the 240px explorer, does not read as a second search box beside `Filter…`, and the rail icon is distinguishable from `IconPanelToggle` at 16px. | Pure visual judgement on a new element and a new glyph. |
| **P7** | F6 | `Ctrl+Shift+P` opens the palette in the real app, and does not collide with anything the runtime claims. | The rule is executed; delivery through the real `window` keydown path is not. |

---

## 7 · Refused, and why

- **Improving F4's refusal message.** The seat praised it explicitly and the brief forbids it. Not
  one refusal string was edited.
- **Re-diagnosing F4 as a selection bug.** Declined as the parcel's frame; §2.5 records the second
  candidate mechanism as a tagged observation with a reproduction recipe instead, and nothing in
  the fix depends on it.
- **Changing click-to-select semantics on `NumberField`.** That is a behaviour change to every
  numeric field in the app, unverifiable without a screen, for a finding whose measured content is
  layout. Tagged as P2 rather than guessed at.
- **Collapsing the raster timeline by default** to buy F5's 440px. It would delete the canvas that
  made an authored `vsplit.at` visible. §3.2.
- **Putting the create row above `LimitBlock`** (the seat's literal F5 remedy). §3.2.
- **Removing or rebinding `Ctrl+K`.** Out of scope by the seat's own note.
- **Binding `Ctrl+P`.** Conventionally quick-open-a-file, and the Chromium print chord. §4.2.
- **`armAdvice`'s placement.** Same class as F4, different trigger, named in §2.6 rather than swept
  in silently.

---

## 8 · Verification

```
npm test        Test Files  593 passed | 3 skipped (596)
                     Tests  8844 passed | 9 skipped (8853)
                  Duration  22.60s
```

The chain in front of `vitest` is green too: `check-test-collection` (596 test-shaped files on
disk, 596 collected), `check-pseudo-skip`, `check-peer-path-literals`, `check-cited-paths`,
`check-doc-citations`, `check-object-stringify`, `check-tsx-dashes` (117 component files),
`check-src-dashes` (409 files), `check-test-dashes` (615 files), `check-guide-text`,
`check-prose-constants`, `check-scripts-dashes`, `check-ledger-timestamps`,
`check-python-resolver`, `check-harness-guards`, `npm run typecheck`.

The three skips are pre-existing and each names its reason (two absent `s4_engine` fixtures, and
`sibling-root` step 3, which cannot be measured from a linked worktree).

**Tip at hand-off:** the head of `parcel/last-three-seat-findings`, which is this packet's own
commit. The three fixes it sits on are `e313ee3e` (F6), `ff789781` (F4), `8e3727ad` (F5); any of
them is enough for an `--is-ancestor` check. A missing branch later is expected — `--is-ancestor`
proves it landed; a non-ancestor does not disprove it.
