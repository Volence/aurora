# EW-TIMELINE-CLOCK — the moving anchor gets an authoring surface, and the one clock

**Branch** `feat/ew-timeline-clock` · **2026-09-03** · ROADMAP row 95, DoD item 12, `EFFECTS-W1`.
Seven commits, `ffb4faf6` … `c1e445d1`, on top of master `f21dc346`.

Step 3½ of the four-step anchor chain. `EW-CHANNELS-WRITER` (merge `b5c5284b`, packet
`2026-09-03-ew-channels-writer.md`) taught the codec to accept, round-trip and write
`patch_world_ys` and `patch_motion`, and deliberately carried the ladders and converters so this
panel would not re-derive them. **Nothing authored them.** This is the surface that does, plus the
clock — and the clock is smaller than the row's title implies, for a reason that is structural and
is in §4.

---

## 1. What is on screen

A new `CollapsibleSection id="aeon.effects.preset.anchors"`, declared on the **Colour** sub-tab in
`providers/effects-sub-tabs.ts`, titled `Preset — <id> — moving anchors (n/4)`.

Per patch channel, drawn the way `variants` draws its slots — every channel either key reaches plus
one to extend into, capped at the schema's own `maxItems`:

| control | what it writes |
|---|---|
| `Channel n` | the SEED's three states: `array ends here` / `channel unused (null)` / `follow a world Y` |
| `World Y` | a whole pixel of absolute level space, 1:1, refusing the u16 ends and the sentinel |
| `Movement` | the MOTION's three states: `array ends here` / `no motion (null)` / `sweep` |
| `Travel` | the amplitude LADDER — `±64 px (128 px of travel)` … `±1 px (2 px of travel)` |
| `Cycle` | the period LADDER — `every 4.27 s (256 ticks)` … `every 1092.27 s (65536 ticks)` |
| `Start at` | `phase`, the one continuous field, present-or-absent like `dir` one section up |
| the preview | the clock (§4) |

Everything is derived. `providers/effects-preset.ts` imports `EFFECTS_PRESET_MAX_PATCH`,
`EFFECTS_PRESET_WORLD_Y_RANGE`, `EFFECTS_PRESET_PATCH_ANCHOR_NONE`, `ANCHOR_AMP_RUNGS`,
`ANCHOR_PERIOD_RUNGS` and `ANCHOR_PHASE_RANGE` from the codec and re-derives none of them; the
component imports its option lists and every sentence from the provider and **spells no rule at
all** — a node row forbids a literal shift, a `* 256` and a direct write to either key in that file,
and P9 proves it fires.

### The two numbers Aurora does not get to invent

- **A new sweep is the SCHEMA'S OWN SHIPPED PRECEDENT**, parsed out of its prose — *"The shipped
  hand-authored precedent is OJZ_Preset_Sec0, `anchor_sweep(amp_shift: 4, period_shift: 1)`"* —
  with a loud throw if the sentence moves. So a fresh sweep is the one motion in the shipped game
  (32 px of travel over 8.53 s), not a pair of ladder ends this repo picked. `phase` is left
  **absent**, because it is the one field `anchor_sweep()` defaults.
- **A new channel's world Y is `(EFFECTS_FIRE_LINE_MIN + EFFECTS_FIRE_LINE_MAX) / 2`**, imported
  from the module that owns the fire bound. The one value it must not be is **0**, and that is not
  taste: 0 is a real world Y above the screen top and the most invasive state a channel can have, so
  a control that seeded it would author that state by default every time an author opened a channel.

---

## 2. The four properties, and where each one is held

Each is held in the provider, asserted in node, and — for the three that have an on-screen
consequence — measured again on the running app.

**1. Both shifts are base-2 logarithms, and the control cannot round one.**
The brief asked for a snapping control that shows the snapped value back. **The schema asks for
something stronger and it wins:** it restates the two ranges *"only as the rungs the UI must
offer"*, and says a slider *"must SNAP to a rung: rounding a shift instead of snapping silently
doubles or halves the amplitude or the period, invisibly at author time."* So `Travel` and `Cycle`
are **selects fed from the ladders themselves** — they cannot emit an off-ladder value at all, which
is the stronger form of "must snap": there is nothing left to snap.

⚠ **STATED PLAINLY BECAUSE IT IS A DEVIATION FROM THE BRIEF:** this means
`anchorSnapPeakPx` / `anchorSnapCycleSeconds` — the codec's log-domain snappers — **have no consumer
in this panel**, and the "show the snapped value back" affordance the brief named does not exist,
because nothing is ever snapped. What is shown back instead is the *physical* meaning of the rung,
on the option label and in a summary line under the card (`32 px of travel, up and down, once every
8.53 s — starting 0% into the cycle`). The converters stay in the codec for a caller that does take
a continuous value; `setAnchorSweepShiftCommand` **refuses** an off-ladder shift rather than
rounding it, so an agent or a paste cannot do what the select cannot (P1: refused → snapped is
RED 1).

**2. Three states per index, and `0` is a real world Y.**
`unreached` keeps the section's hand-authored value, `null` is the sentinel, a value authors it.
`anchorSeedState` reads all three apart; `anchorSeedValue(preset,0)` is `0` for an authored zero and
`null` for a `null`; the seed picker's `unused` option reads **"channel unused (null)"** and the
string `0` does not appear in it. `anchorSeedRefusal` refuses `32767` *as an integer* and the
sentence points at the other spelling, so the two spellings cannot both mean "unused".

**3. A motion with no seed shows nothing, and the author is told — in the schema's words.**
`ANCHOR_MOTION_WITHOUT_SEED` is extracted from the `patch_world_ys` description with a loud throw
(`EMPTY_CYCLES_ADVISORY`'s posture), and `anchorMotionWithoutSeedAdvisory` renders it under the
control that produced the state. ⚠ It is **silent on an authored 0** — the same 0-is-real defect one
layer up, and P5 is that mutation.

**4. The seed is whole pixels, 1:1.** Nothing on this path multiplies.
`EFFECTS_PRESET_PATCH_SEED_UNITS_PER_PIXEL` is 1 and stays unread by any arithmetic here because
there is none. Harness `[3c]` types `320` into the real field and reads `320` back out of the
document; the ×256 value, `81920`, is inside the u16 range and would validate clean.

### Two shape rules the positional arrays impose

**Never pad.** A short array is left short, and the round trip asserts the two arrays end at
*different* lengths and stay that way. **And Aurora never writes `[]` either**: when the last spelled
channel goes back to `unreached` the KEY IS DELETED, because `[]` and absent mean the same thing for
these two keys — unlike `cycles`, whose `[]` is the generator's own refusal and is preserved
verbatim.

**Never hole.** The consequence of never padding is that a positional array cannot grow a hole, so a
state may only be set at an index the key's array reaches or ends exactly at. The one case that
leaves is authoring channel 2's motion while channel 1's is unspelled: `anchorExtendRefusal`
**refuses and names the channel to spell first**, and the offending options are `disabled` with the
sentence under them. It does not fill the gap, because the only value it could invent is `null`,
which is not "unspelled" — it is "no motion", a different document (P6).

---

## 3. Reachability, because a correct control he cannot find has not shipped

The owner: *"so confusing and convoluted and difficult to understand… I was just lost."* Three
things this parcel did about it, and one it did not.

- **The section is DECLARED on a tab.** `effects-sub-tabs.ts` is the table, and
  `effects-sub-tabs.test.ts` walks the panels' own source and requires the set to equal the union —
  so a section rendered by a panel and claimed by no tab **fails in node** rather than becoming a
  control nobody can reach. P7 removes the declaration and that row goes red.
- **The header counts.** `moving anchors (2/4)` when the preset spells channels, and no counter at
  all when it spells none, so a preset that does not use the feature does not carry a `0/4` that
  reads like a broken widget. This is the `Tile animations (n/4)` idiom — the one header on this
  facet that announces itself — applied to a section that O55's finding would otherwise have made
  another silent accordion. Harness `[8a]`.
- **A one-line hint before anything is armed**, which is O56's own first recommendation, in the
  words an author would use: *"A patch channel pins a band to a point in the LEVEL instead of to a
  screen line, so it stays with the scenery as the camera moves — and a sweep makes that point drift
  up and down on a timer. Set a world Y to place it; add a sweep to move it."* Not a tooltip: O56
  measured a feature whose entire on-screen vocabulary before interaction was four characters.
- **What it did NOT do:** the section arrives `defaultCollapsed`, like the three preset sections
  above it. That is the second half of O55's stacked-disclosure finding and this parcel does not
  resolve it — see §7.

### ⚠ THE NO-BUILD DISCLOSURE IS FIRST IN THE BODY, AND IT MATTERS MORE HERE THAN ANYWHERE

`PRESET_KEYS_AWAITING_AEON` currently reads `['patch_motion','patch_world_ys']` — **the two keys
this section authors** — and the sentence it produces says aeon's generator *"does not accept them
at origin/master and refuses the WHOLE DOCUMENT, so a preset carrying either key will not build."*
An author who cannot see that sentence breaks aeon's build with no warning at all, so
`<PresetLagDisclosure />` is the first, unconditional child of this section's body, and three new
rows in `preset-lag-disclosure.test.ts` hold it there. The key-naming row states **both** readings,
so the day aeon lands step 4 it says so rather than passing mutely.

**This is the honest headline of the whole parcel: everything below those controls is authored, saved
and round-tripped, and none of it builds today.**

---

## 4. Half 2 — the clock, what was built and what was NOT

### What was built

`components/effects/AnchorSweepPreview.tsx`: a 224×56 canvas inside the sweep card that draws one
cycle of `anchor_sweep()` — the ±peak envelope, the seed as the centre line, the curve, and a
**playhead moving in real time at the authored period**, at `ANCHOR_TICK_HZ` taken off a rung
(`ticks / seconds`) rather than typed as 60. The window slides with the playhead, which is the only
way a 1092 s cycle is legible at all. The amplitude is scaled to the ladder's **tallest** rung, so a
1 px sweep looks nearly flat beside a 64 px one — which is true, and normalising each sweep to fill
the strip would have made all seven rungs draw the same picture.

**The clock exists only while something is animating, and that is structural:**

1. the loop draws to its own canvas and **calls no `setState`**, so not one frame schedules a React
   render anywhere;
2. the component is mounted only for a channel whose motion is an authored **sweep**, inside a
   `CollapsibleSection` that renders no children while shut, on a sub-tab whose siblings are
   **unmounted** — harness `[7b]` (set movement to "no motion" → the canvas is gone) and `[7c]`
   (switch to Parallax → gone);
3. `Pause` **tears the loop down** rather than idling it — `[7a]` requires the canvas to be replaced
   by a placeholder, so there is nothing left ticking;
4. a hidden window stops it.

### What was NOT built, and why it is not deferred work

**The strip does not show a moving band, and it cannot.** The band's screen line is
`anchor - Camera_Y`, and **this document does not say which band a patch channel drives** — a preset
`band` declares `top`, `bot`, `sh` and `on`, and no channel index (read off the vendored schema's
`$defs.band`, which declares exactly those four properties). A `RasterTimelineStrip` preview of a
band whose top moves would have had to invent that link and would have been a picture of a program
the file does not describe. So the clock is scoped to **the excursion about its own seed**, which is
exactly what the two authored rungs mean and no more.

That is the honest reading of row 95's "scoped to the anchor mover, never to the strip generally",
and it is a smaller thing than the row's title suggests. **If the intent was a moving band on the
timeline, that needs a contract change naming the channel↔band link, not a parcel here.** Flagged
for the controller rather than attempted.

### ⚠ The idle-repaint measurement, and where the instrument is blind

`MapViewport`'s zero-idle-repaint property (37/37, `mapviewport-baseline-harness.mjs`) **is not
regressed, measured rather than asserted.** Harness `[6c]`, one run, 5 s window, aeon `ojz_act1`,
xvfb 1680×1050, `dpr = 1`, at 31.4 s of process uptime:

```
map repaints = 0   preview frames = 301 (382 → 683)   page rAF ticks = 301
pixels changed = true   bound = true
```

All five clauses are the row, deliberately: a zero with no page ticks is a dead renderer, a zero
with no preview frames is a clock that never started, and a zero on an unbound probe is a probe
watching a canvas React replaced. `[6d]` is its anti-vacuous companion — a real pan through the
app's own view store must be RECORDED before `[6c]`'s zero is believed.

⚠ **AND [6c] HAS A BLIND SPOT THAT A POISON FOUND AND THAT IS REPORTED RATHER THAN TUNED AWAY.**
The first form of poison H2 pointed the loop at `#map-canvas` and clobbered it (`width = width`)
every frame — and the harness came back **25/25 GREEN**. The probe records a repaint only when 2D
ops FOLLOW the width write, so what it measures is *"MapViewport ran a draw"*, not *"something
touched the map canvas"*. The row is watching the right quantity for the property it claims (the
component's draw effect is what the 37/37 measured) and the wrong one for "the clock cost the map
something". H2 now nudges the camera through the app's view store every frame — which is what an
implementation wanting to draw the moving band ON the map would actually do — and `[6c]` goes red.
**The old mutation is kept as H2b, labelled, so the blind spot stays on the record.**

---

## 5. Verification — both sides measured in this session

| | Test files | Tests |
|---|---|---|
| master `f21dc346`, this worktree, `npx vitest run` | 469 passed / 2 skipped (471) | **0 failed / 6498 passed / 8 skipped (6506)** |
| `feat/ew-timeline-clock` `c1e445d1`, `npm test` | 470 passed / 2 skipped (472) | **0 failed / 6534 passed / 8 skipped (6542)** |

**The arithmetic closes with nothing unaccounted: +36 = 32** (`effects-preset-anchors.test.ts`, new)
**+ 3** (`preset-lag-disclosure.test.ts` 12→15) **+ 1** (`effects-sub-tabs.test.ts` 11→12, its
per-section row, which is the declaration gate counting the new section).

⚠ **THE CONTROLLER'S MASTER FIGURE AND MINE DISAGREE BY ONE SKIP AND THE INSTRUMENT EXPLAINS IT.**
The brief gives master as 0 failed / 6499 passed / **7** skipped (6506); I measure 6498 passed /
**8** skipped, same total 6506. The extra skip is `test/support/sibling-root.test.ts` step 3, which
skips **by design in a linked worktree** and names that in its own reason — the controller ran in
the main checkout, I ran in an agent worktree. Neither number is wrong; they are two configurations.

`npx tsc --noEmit` clean, exit 0. All seven `check:*` green:
`harness-guards` **189 clean / 189 classified · 0 failures · 0 unmeasurable** (188 before; the new
harness is the 189th), `ledger-timestamps`, `object-stringify`, `peer-path-literals`,
`pseudo-skip` (5937 bodies), `python-resolver`, `test-collection` (472/472). The 8 skips are
pre-existing, each names its reason, none is mine.

**`npm run harness:anchor-authoring` — 25/25**, on a fresh `VITE_AURORA_DEBUG=1` build of this
branch's source, under xvfb at 1680×1050, against an `rsync` copy of aeon at
`$SCRATCH/aeon-copy` (`.git`, `.claude`, `build`, `tools/asl` excluded; 154 MB). `../aeon` was never
written to.

### 5.1 Poisons — twelve, red-first, each restored from a COMMITTED baseline

`scratchpad/poisons-anchor-authoring.sh`, baseline `c1e445d1`. Every one: the mutation applied, then
**quoted back from disk** (`git diff --stat` naming the file plus the mutated line read with `grep`)
BEFORE the run, then a named runner, then `git checkout --` on a tree `git status --porcelain` says
is clean before and after. The harness half **rebuilds `dist/` between mutation and run**, because
the harness measures the build.

| # | mutation | runner | result |
|---|---|---|---|
| P1 | the shift command SNAPS off-ladder instead of refusing | `vitest … anchors` | **RED 1** — the off-ladder row |
| P2 | a new channel is born on `0` | " | **RED 1** — the not-born-on-0 row |
| P3 | the state command PADS to `MAX_PATCH` | " | **RED 6** — the length rows, the spellings row, the round trip |
| P4 | the seed goes out ×256 | " | **RED 3** — the unit row, the refusal row, the round trip |
| P5 | the no-seed advisory reads `0` as "no seed" | " | **RED 1** — exactly the silent-on-0 row |
| P6 | the extend refusal FILLS the gap | " | **RED 2** — the refusal row and the no-hole row |
| P7 | the section is removed from the sub-tab table | `vitest … effects-sub-tabs` | **RED 1** — *"none is rendered nowhere"* |
| P8 | the no-build disclosure dropped from this section | `vitest … preset-lag-disclosure` | **RED 1** |
| P9 | the panel spells a rung of its own | " | **RED 1** — the no-rule-in-the-component row |
| H1 | the seed goes out ×256 | `harness:anchor-authoring` | **23/25** — `[3c]` and `[3d]` |
| H2 | the clock nudges the CAMERA every frame | " | **24/25** — exactly `[6c]` |
| H2b | the clock clobbers `#map-canvas` every frame | " | **25/25 — GREEN, and reported** (§4) |
| H3 | the clock never starts | " | **24/25** — exactly `[6c]`, on its other clause |

**Plant.** `PLANT=rot-section` looks for the section under a title nothing renders: `[2d]` fails and
the run **ABORTS** — `6/7 rows had run — this is NOT a pass over the rows that never ran.`

---

## 6. For the owner — the LOOK is unratified

`scratchpad/shots-anchor-authoring/anchors-section-open.png` (gitignored, as this facet's captures
are): the section open, one channel authored, a sweep running, at 1680×1050.

⚠ **The first version of that capture shot the arrival scroll position, with the section it is about
764px below the frame.** It would have been handed over as "the look". The harness scrolls to the
card first now and prints the offset it used.

**Granular calls I made without asking, each reversible in one line:**

- **`Travel` and `Cycle`, not `amp_shift` and `period_shift`.** The wire names are on the field's
  `title`; the label is what the control does.
- **`±16 px (32 px of travel)`** — both the peak and the peak-to-peak, because the engine field is a
  peak and what an author watches is the travel.
- **Seconds before ticks**, two decimals, because the first rung is 4.27 s and rounding it to 4
  would put a number on screen that is not the one the file means.
- **The option labels name the SPELLING they write** (`channel unused (null)`, `array ends here`),
  the `cycles`/`variants` idiom — an author reads the file from the control.
- **The preview is scaled to the ladder's tallest rung**, so a small sweep looks small.
- **`Pause` is a chip, on by default.** A preview that starts stopped is a preview nobody sees.

**What I would change, and did not:**

⚠ **THE SELECT LABELS TRUNCATE IN THE 280px COLUMN.** On the shot, `Movement` reads
`sweep — up and down about` and an unreached channel reads `keep the section's hand-auth…`. The full
text is in the dropdown and on the `title`, but a truncated *primary* label is exactly the "very
quietly labelled" finding O56 booked against another panel. The fix is a short lead phrase with the
spelling as a gloss under the row — which trades away "an author reads the file from the control",
so it is a real call and it is his, not mine. **This is the one thing on this screen I would change
first.**

---

## 7. Open, and tagged for the controller

- ⚠ **NO EMULATOR, NO ROM, NO aeon BUILD.** Nothing in this parcel has seen an anchor move, and
  nothing here claims one has. Background agents must not drive the emulator; tagged for the
  controller's foreground follow-up.
- ⚠ **AND TODAY THESE KEYS DO NOT BUILD AT ALL** — aeon's generator refuses the whole document
  (§3). The disclosure says so on screen. The panel is complete and the pipeline behind it is not;
  that is step 4's, and it is the honest state of the feature.
- **A moving band on the raster timeline is NOT possible from this document** (§4) and would need a
  contract change naming the channel↔band link. If row 95's intent was that picture rather than the
  mover's own excursion, this parcel has delivered the smaller thing and says so.
- **The section arrives `defaultCollapsed`**, which is the second half of O55's stacked-disclosure
  finding (sub-tab, then accordion). The counting header mitigates it; it does not remove it.
  Opening by default would put ~470px of controls in a 742px column above the three sections that
  were there first, which is the arithmetic d-26b's sub-tabs exist to fix. **A layout call, and his.**
- **The fold, measured and not gated** (harness `[2e]`): the Colour tab is 742px visible against
  1,036px shut (1.40 screens) and **1,506px with this section open and one channel drawn** (2.03
  screens); reaching its first control took a 764px scroll. Reported rather than turned into a
  budget this file would then own.
- **`anchorSnapPeakPx` / `anchorSnapCycleSeconds` have no consumer** (§2, property 1). Deliberate,
  and the reasoning is the schema's own sentence — but it is a departure from the brief and it is
  named here so the controller can overrule it cheaply.
- **The two warnings EW-CHANNELS-WRITER left recommended** are still not built and are still not
  Aurora's to state: a sweep whose travel leaves the channel's `patchable(lo, hi)` band makes the
  band VANISH until the next zero crossing, and in a game without `CAP_ANCHOR_MOTION` (`demo`) an
  authored sweep is a silent no-op. **Both sentences are on screen today, via the schema's own
  descriptions on the two fields' `title`s** — so they are carried by the contract rather than
  authored here, and they stay true by construction. Neither has an owner who measures it.
