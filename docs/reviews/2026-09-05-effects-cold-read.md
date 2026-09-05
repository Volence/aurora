# Effects authoring surface — cold read, 2026-09-05

A second cold read of Aurora's Effects tab, run against the surface as it stands
after the rebuild. The task was to author **one raster band**, **one drifting
parallax layer** and **one palette cycle** into an aeon project using only the
UI and the app's own help, then run aeon's build over the result.

---

## 0. What I read before starting — judge how cold this was

I read, in this order and nothing else:

| what | why | contaminating? |
|---|---|---|
| the dispatch brief | my instructions | it names the three artifacts (raster band, drifting parallax layer, palette cycle) and nothing about how any of them is authored |
| `scratchpad/lib/harness-guard.mjs` | the launch/teardown contract, named in the brief | rig only |
| `scratchpad/confirm-focus-harness.mjs` (plumbing sections only) | a mechanical example of launch-and-drive; it is about dialogs on purpose | rig only |
| `package.json` `scripts` block | to register my harness | see the contamination note below |

I did **not** open `docs/ROADMAP.md`, any `docs/OVERSEER*`, anything under
`docs/reviews/`, `docs/superpowers/`, `docs/captures/`, any `docs/lane-*`, any
`*.test.ts`, or any source file about this feature. In particular I did **not**
open `docs/reviews/2026-09-02-effects-cold-walkthrough.md`, the earlier
walkthrough — the in-app guide cites it by path in its own opening paragraph,
which is how I know it exists.

**Three contamination leaks, stated so they can be discounted:**

1. **The debug API's key list.** My harness prints `Object.keys(window.__dbg.aeon)`
   as evidence for a boot row. That list contains the words `scenes`, `presets`,
   `rasterRef`, `bands`, `bandBudget`, `bandPhaseTile`, `crossoverLens`,
   `cameraPreview`, `rasterTimeline` and about seventy more. So I knew the nouns
   *scene*, *preset* and *band* existed before I clicked anything. I did not know
   what any of them meant or where they lived.
2. **`package.json`.** Registering my harness alphabetically put me next to
   `harness:effects-bob`, `harness:effects-column`, `harness:effects-deform`,
   `harness:effects-drift`, `harness:effects-guide(s)`,
   `harness:effects-preview-default`, `harness:effects-refusal`. Seven feature
   words, no content.
3. **I read the whole in-app guide before touching a control** (§1.3 below).
   That is what the brief asks for — it is the help the app offers — but it means
   every confusion below is a confusion that **survived a full read of the
   guide**, which makes each one worth more, and it means I cannot report on what
   the screen alone teaches. Where the screen alone would have failed me, I say so.

**The project-open step was not cold-read evidence.** aeon's only real UI route
to a project is a native folder picker CDP cannot drive, so the project was
opened with `window.__dbg.aeon.open(<path>)`, as the brief permits. Everything
after that point — every click, every keystroke, every dropdown — went through
real `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` gestures.

**Environment.** Aurora built from this worktree with `VITE_AURORA_DEBUG=1`, run
under `xvfb-run` at 1680x1050, **`devicePixelRatio = 1`** on every reading in
this document (printed with each aim). Window 1400x872. The project was a
throwaway `git clone` of aeon at `9e3d2861`, at
`/tmp/coldread-aeon-x3fBQG/aeon`. I never wrote to
`/home/volence/sonic_hacks/aeon` — proof in §6.

---

## 1. The ordered log

### 1.1 Opening the level — `01-app-opened.png`

The project opened on the **Layout** tab: level canvas, a SECTIONS grid, an ART
palette, a PROPERTIES readout. `Effects` is the third of seven tabs in the
toolbar strip. Nothing here needed explaining.

`WORKED` — finding the feature took one glance. There is a tab called Effects and
it is where the effects are.

### 1.2 The Effects tab — `02-effects-tab.png`

Dense but legible. A pinned strip at the top of the right panel says

```
Editing  [ Section 0 ▾ ]
scene ojz_act1_start · raster hand-authored
✓ own preset  OJZ_Preset_Sec0
✗ threaded    nothing threads ojz_act1_sec_raster(sec: 0)
act: own preset 0,1,2,3,4,5,6 · threaded 5,6
[ Parallax ][ Colour ][ Tile anim ]
```

then an orange paragraph explaining the ✗, then SCENES / LAYERS / SCENE / SECTION
ASSIGNMENT.

**`CONFUSION` C1 — "✗ threaded" greets you on arrival and I could not tell
whether I had done something wrong.** *Slowed me down, ~2 minutes.* The first
thing on the panel is a red ✗ on a project I had just opened and not edited. The
orange paragraph beside it does eventually resolve it — it says this is aeon's
fact, that it is one line of aeon and not a redesign, and that the binding is
written either way — but the ✗ is read before the paragraph is, and a red mark on
an untouched document reads as "you broke it". Resolved by reading the paragraph
and later by the guide's §5. **The paragraph is doing the work; the glyph is
working against it.**

**`CONFUSION` C2 — the panel below the strip was editing a *different* scene from
the one the strip says the section is bound to.** *Slowed me down, ~3 minutes.*
The strip said `Editing Section 0 / scene ojz_act1_start`. Directly underneath,
the SCENES list had **OJZ act 1 depth** highlighted and the form below it was
headed `SCENE — OJZ_ACT1_DEPTH`, while SECTION ASSIGNMENT at the bottom read
`OJZ act 1 start — banded canopy`. Both scenes have 5 layers, so the layer list
gave no clue either. I edited nothing for several minutes because I could not
tell which document my keystrokes would land in. It *is* a coherent design —
scenes are free-standing documents, assignment is a separate binding — but
"Editing Section 0" sitting directly above a form for a scene that section is not
using is the single most disorienting thing on the screen.

### 1.3 The in-app guide — `03-guide.png`

`? Guide` opens **as its own tab**, titled "Backgrounds that move", with a
sidebar of eight numbered sections.

`WORKED` — **and it is the strongest thing on this surface by a distance.** §1
opens with a four-row table (`you want` / `you build` / `where`) that answered all
three of my tasks in about fifteen seconds:

- drifting background → a **scene with layers** → **Parallax** sub-tab
- coloured stripe → a **raster band inside a preset** → **Colour** sub-tab
- shimmer → a **palette cycle** inside the same preset → **Colour** sub-tab

It then draws the whole right panel as ASCII with section-number cross-references,
explains why `SCENE — <id>` arrives collapsed, gives per-task recipes with "sane
first value" columns, states the units, states what the app refuses and what the
build still refuses, and ends with an eight-row "I want to… / go to" index. It
told me the drift box is px/frame while the file is 256ths, that
`FACTOR_LOCKED` = does not move, that CRAM line 0 is the player's, and where every
binding lives. **I did not get stuck on a single one of the things it covers.**

`TASTE` — it is also ~3,400 words, which is a lot before your first click. The §1
table and the §8 quick reference between them carry most of the value; the
middle is reference material a reader will come back for rather than read
through.

### 1.4 Task A — the drifting parallax layer — `05` … `12`

Following §2. Every step did what it said:

| step | result |
|---|---|
| type `coldread_drift` into **Scene id**, press **New** | `WORKED` — scene created, selected, and **it arrives with Layer 0 already in it** ("1 of 16 layers") |
| set **Plane B (bg)** to `FACTOR_1_8` | `WORKED` |
| set **Drift** to `px/frame` | `WORKED` — a number box appears **pre-filled with `0.125`**, exactly as the guide promises, with an inline sentence under it |
| **SECTION ASSIGNMENT** → `coldread_drift` | `WORKED` — the pinned strip immediately rewrote itself to `scene coldread_drift · raster hand-authored` |
| Ctrl+S | `WORKED` |

`WORKED` — **the Plane B tooltip is the best single sentence in the product.**
After setting `FACTOR_1_8` its `title` reads:

> Layer 0 fb — how far Plane B, the background, scrolls per pixel of camera
> movement — at 1/8 of camera speed: its 512px picture starts over every 4096px
> of camera travel, 1 time across this act's 5824px

That is derived from *this act's* width. Nothing else on the panel tells you what
a factor will actually look like.

**`CONFUSION` C3 — that sentence is a hover tooltip, and I would never have found
it.** *Slowed me down; would have stopped me understanding the control.* The
guide has to spend a paragraph telling you to hover a dropdown, because there is
no other route to it. Under the dropdown sits a **different**, permanent, much
weaker sentence ("A = foreground, B = background; fraction of camera movement
this strip scrolls; 1 = with the camera"). The good sentence is the hidden one.

**`CONFUSION` C4 — "there is no Name field", except there is.** *Slowed me down,
~4 minutes.* Every stock scene shows a descriptive title in the SCENES list
("OJZ act 1 depth — curved horizon over a split canopy"). Mine showed the raw id
`coldread_drift`, in both the SCENES list and the SECTION ASSIGNMENT dropdown, and
I could find no field to name it. Creating a scene never asks for one. The
**Name** field does exist — it is the first row of `SCENE — <id>`, the card the
guide tells you "arrives shut" because you only need it for *V factor, Bob,
Deform, V offset*. Name is not in that list, so the guide's own justification for
collapsing the card omits the one field a new scene definitely needs. Resolved by
opening the card on a hunch (`10-scene-form.png`).

`WORKED` — `V factor` shows `15` with `15 = locked (no vertical scroll)` printed
under it. A sentinel-valued field that says what its sentinel means, at the
field.

`WORKED` — the layer form's **inline help under every single control**: `B curve
to`, `B split at`, `Deform`, `Drift`, `Row remap` each carry a one-line
explanation. `Bob`/`Reels` even explain their *wire format* ("off writes no key at
all (the contract's default is the no-bob sentinel 15, never 0)").

**`CONFUSION` C5 — one entry of `B curve to` is labelled "(engine refuses)" and
nothing says why.** *Slowed me down, ~1 minute.* It is a **different** entry on
each layer. I worked out by inspection that the refused entry is always that
layer's current `Plane B` value, i.e. "you cannot curve to the value you started
at" — but that is a deduction, not something the screen says, and every other
control on this card carries a sentence.

**`REPEAT` R1 — one quantity, three spellings.** The layer's vertical position is
`Screen line` in the form, `L0 y=0` on the map overlay, and `world_y` in the file
Aurora writes. The guide notices two of the three ("Those lines are the Screen
line spinner, in the other spelling") and not the third.

**`CONFUSION` C6 — the guide over-warns about saving.** *Slowed me down, ~0; noted
because it teaches distrust.* §6 says "Saving rewrites every editor file in the
act, not just the ones you touched, so expect a large git status". My Ctrl+S
produced exactly **two** entries: the new scene file and the one section meta I
had rebound. A warning that dramatic and that wrong makes a reader discount the
next one.

**On disk after Ctrl+S** (`12-after-save.png`):

```json
{ "id": "coldread_drift",
  "layers": [ { "drift": { "rate": 32 }, "fa": "FACTOR_1",
                "fb": "FACTOR_1_8", "world_y": 0 } ],
  "name": "Cold read drift test - one clouds layer",
  "schema": 1, "v_factor": 15 }
```

`WORKED` — `0.125 px/frame` came out as `"rate": 32` (= 0.125 × 256), exactly as
the guide predicts. **Task A authored.**

### 1.5 Task B — the raster band — `13` … `23`

`WORKED` — pressing **Colour** switched job cleanly, and the `Parallax preview`
chip on the toolbar went dark by itself, which the guide had told me to expect
("on for Parallax and off for Colour and Tile anim until you decide"). A
behaviour that looks like a bug and is documented as deliberate.

`WORKED` — the **RASTER TIMELINE** at the top of the Colour tab draws screen lines
0–223 with a `bands` column and a `layers` column, and my `L0 FACTOR_1_8` from
Task A was already drawn in the layers column. Two jobs, one shared coordinate,
drawn once.

**`TASTE` T1 — `RASTER BAND PRESETS` opens onto ~150 words of warnings before any
control.** Four stacked paragraphs — *an author can author / saving does not
install / seeing it is a debug chord / nothing checks that a band is visible / no
preview* — then a `? Read the whole note in the guide` link, and only then the
preset list. On a 742px panel that is the whole viewport. Every sentence is true
and useful; collectively they are a wall in front of the door.

| step | result |
|---|---|
| type `coldread_water_tint`, press **New** | `WORKED` — preset created **with `Raster band 0` already in it**, exactly as §3 says ("There is no control called 'make a band'") |
| open `PRESET — COLDREAD_WATER_TINT` | `WORKED` |
| fill Top / Bot / addr / colours | see C7 and C8 |

`WORKED` — the band form is seeded with a **complete legal band** (Top 112, Bot
128, S/H off, ON cram, addr 74, colours 0) and prints `line 2 · entry 5` beside
`addr 74`, decoding the address live as you type it. Typing `9` there produced
`line 0 · entry 4 — odd byte, not a word boundary` — a real, immediate, correct
diagnosis.

`WORKED` — **there is a live colour swatch under `colours`.** Type 14 and it turns
red. The guide never mentions it and it is the only thing on the Colour tab that
shows you a colour.

**`CONFUSION` C7 — `colours` is the one box among four that does not select its
contents on click, and the guide explicitly promises that it does.**
*Slowed me down; it silently corrupted a value.* §3 says, in bold-adjacent prose:
"Clicking a number box also selects what is in it, so clicking Top and typing 40
gives 40, not 40112." True for `Top`, `Bot` and `addr` — they are
`<input type=number>`. False for `colours`, which is `<input type=text>`, looks
identical, sits in the same column, and **appends**. Measured, `19` and
`20-colours-append-trap.png`:

- default `0`, clicked, typed `14` → **`014`** (parses to 14, so it looks fine)
- then clicked again and typed `3584` → **`0143584`**

`0143584` is accepted with no warning, no red, no refusal, and the swatch happily
turns green. A CRAM word is 16 bits; 143,584 is not one. The guide's own "Things
Aurora refuses while you author" list covers "a colours list that is empty or
holds a non-integer" — an integer that cannot fit a CRAM word is not on it.
`selectionStart`/`selectionEnd` after a real click: `3, 3` on `colours` (caret at
the end) versus `null, null` on `Top` (a number input, browser-selected). *This is
the finding I would fix first.*

**`CONFUSION` C8 — a refused value still lands, because the guard runs per
keystroke.** *Slowed me down; it destroyed a value I had set and told me it had
not.* With `Top = 40`, I clicked Top and typed `250`. The panel showed a full,
well-written refusal:

> preset "coldread_water_tint" · Raster band 0 · Top: 250 is not a screen line —
> both of a band's edges are raster fires, and a fire must land on 3..223 (lines
> 0-2 belong to the priming records). Refused; **Top is still 25.**

`22-top-250.png`. Note *25*, not *40*. The three keystrokes were evaluated one at
a time: `2` → 2, `25` → 25 (legal, **committed**), `250` → refused. Clicking away
left **Top = 25** (`23-top-after-blur.png`), and the box that read `250` snapped
back to `25`. So a message whose last four words are "Top is still 25" is
*literally* accurate and reads to a human as "nothing changed" — while the value
they had actually set (40) is gone, replaced by a prefix of the number they were
in the middle of typing. Anyone typing a three-digit `Top` or `Bot` hits this.
The guard is not vacuous — it fires, it explains, it names the rule — it simply
guards the wrong instant.

`WORKED` — the **Program** dropdown (`bands` / `base swap` / `boundary` / `ramp`)
warns, before you touch it, that switching *discards* the band and seeds a fresh
one, explains why the four are mutually exclusive, and states that it is one undo
step. A destructive control that says so at the control.

**On disk after Ctrl+S:**

```json
{ "bands": [ { "bot": 72, "on": { "cram": { "addr": 74, "colours": [14] } },
               "sh": false, "top": 40 } ],
  "id": "coldread_water_tint", "schema": 1 }
```

**Task B authored.**

### 1.6 Task C — the palette cycle — `24` … `26`

Following §4, still inside `PRESET — COLDREAD_WATER_TINT — CYCLES, VARIANTS`.

`WORKED` — **this was one gesture.** Setting `cycles` to `authored script (array of
channels)` produced a `Channel 0` pre-filled with **exactly the guide's suggested
values** — `line 2`, `first 8`, `count 4`, `period 8`, `dir absent — set`. I typed
nothing. `25-cycles-authored.png`.

`WORKED` — the three `cycles` states are spelled as what they *write*, not as
moods: *keep the section's hand-authored cycle (key absent)* / *off (null)* /
*authored script (array of channels)*, with `Saved to
data/editor/effects/presets/coldread_water_tint.json as cycles and variants. An
absent key is not written.` underneath. Absent-versus-null is the exact
distinction that is normally left to a reader to guess.

**`CONFUSION` C9 — opening this card scrolls the "pinned" strip sideways and clips
the ✓/✗ glyphs off it.** *Slowed me down; it removed the panel's own verdict from
the screen.* Measured, not eyeballed (`26-strip-clipped-by-hscroll.png`, dpr 1):

```
the right-panel scroller:  scrollWidth 294   clientWidth 284   scrollLeft 10
```

The `cycles` `<select>` is 294px wide because its widest option is *"keep the
section's hand-authored cycle (key absent)"*. The panel is **one** scroller and the
section strip is inside it, so those 10px of horizontal overflow scroll the strip
too. The guide's §1 draws the strip and annotates it *"the strip: always there,
never scrolls"*; after this it reads `diting`, `cene coldread_drift`, and the ✓ and
✗ before `own preset` / `threaded` are gone — the two rows the guide spends a whole
section teaching you to read. It does not scroll back on its own.

`WORKED` — after Ctrl+S the preset carried both, and `variants` correctly wrote
nothing:

```json
{ "bands": [ { "bot": 72, "on": { "cram": { "addr": 74, "colours": [14] } },
               "sh": false, "top": 40 } ],
  "cycles": [ { "count": 4, "first": 8, "line": 2, "period": 8 } ],
  "id": "coldread_water_tint", "schema": 1 }
```

**Task C authored. All three artifacts exist.**

### 1.7 Binding the raster preset, and Build & Run — `27` … `30`

Bound `coldread_water_tint` to **Section 0** from the `Section 0` dropdown at the
bottom of RASTER BAND PRESETS. `WORKED` — the pinned strip rewrote itself to
`scene coldread_drift · raster coldread_water_tint`, and a **new** paragraph
appeared under the preset card:

> Section 0 binds "coldread_water_tint". Deleting it would leave that binding
> naming a document that does not exist, and aeon's build refuses that by name.
> Set the raster binding back to "Hand-authored raster" on that section first —
> the Section dropdown above.

A delete guard that names the blocker *and* the control that clears it.

**`DEAD END` D1 — there is no Build & Run anywhere you can see.** I searched the
Effects toolbar, the `View ▾` menu, the whole Home tab (`29-home-tab.png` — it
offers only Levels, Project Setup, the Guides card and Open project…) and a
full-text scan of the level tab for `build|run|rom|regenerate`; the only hits were
prose inside the panel's own warnings. It exists **only in `Ctrl+K`**, as
`Build & Run` / `Ctrl+Shift+B` (`30-cmdk-build.png`).

**I would have pressed it here and I was forbidden to.** I dismissed the palette
with Escape without activating the entry, and verified it closed. Everything below
was built from a shell instead. Note that the guide's §6 sends you to a shell too
and never mentions the command exists — so a first-time author never learns Aurora
can do this at all.

---

## 2. The build

Four `BUILD ERROR`s, in the order they fired, against the throwaway clone with
`SIGIL_BUILD` / `SIGIL_EMIT` set as the brief specifies. Wall-clock UTC beside each.

### B1 — `suite_paths: REFUSED` (10:47:33Z → 10:47:39Z, exit 1)

```
Resolving suite paths...
repo      /tmp/coldread-aeon-x3fBQG/aeon
suite_paths: REFUSED — no suite root above /tmp/coldread-aeon-x3fBQG/aeon/tools/suite_paths.py
  — no ancestor holds all of aeon/, empyrean/. Set EMPYREAN_SUITE_ROOT to the
  directory containing the Empyrean repos.
```

**Environmental, and it named its own remedy in the same sentence.** A clone in
`/tmp` has no suite root above it; fixed with
`EMPYREAN_SUITE_ROOT=/home/volence/sonic_hacks`. *Not a verdict on anything I
authored.* Not a defect — but worth recording that following the brief's own
clone-to-`/tmp` recipe produces it, and that it costs 7 unrelated tool-suite
failures for the rest of the run (see the isolation below).

### B2 — the staleness gate (10:47:48Z, exit 1)

```
level staleness: STALE (mtime) — editor source is newer than the generated tree.
    newest editor source : games/sonic4/data/editor/ojz/act1/section_0.meta.json  (2026-09-05 06:46:51)
    newest generated file: games/sonic4/data/generated/effects_channel_bands.json  (2026-09-05 06:30:18)
level staleness: STALE (stamp) — the editor sources are not the ones the last re-bake read
    added since the bake (2): games/sonic4/data/editor/effects/coldread_drift.json,
                              games/sonic4/data/editor/effects/presets/coldread_water_tint.json
    changed since the bake (1): games/sonic4/data/editor/ojz/act1/section_0.meta.json
    NOTE: a REMOVED file is invisible to a timestamp compare — deleting a file lowers
    no mtime — so `touch` is not the fix and never was. Re-bake.

ERROR: the committed level tree is STALE — it was not baked from the editor
  sources that are here now. ...
  REMEDY:  tools/regenerate-level.sh
           FAST=1 ./build.sh sonic4
  NOT a remedy: `touch`. ...
```

`WORKED` — **this is the best error message I saw all day.** It fires at the
staleness stage and says so, names the arm that fired, names my three files
individually, gives the remedy, and pre-empts the wrong fix.

**The brief asked me to record verbatim whether I had to work this out myself or
whether the app told me. The app did not tell me. The BUILD told me.** Aurora says
nothing about `tools/regenerate-level.sh` anywhere in its UI, and the in-app
guide's §6 "Save, and build" gives the whole happy path as

> Ctrl+S. … Then, in your aeon checkout:
> `FAST=1 ./build.sh` … `./build.sh` — the real one

with no re-bake step. `tools/regenerate-level.sh` appears in the guide **only**
under the troubleshooting heading *"If the build says the re-bake failed and
mentions donors"* — a different symptom from the one you actually get. So the
documented happy path stops at a red build every time and the recovery comes from
aeon's output rather than from Aurora. **`CONFUSION` C10, and it is the guide's,
not the panel's.** *Slowed me down ~1 minute, only because the build's message was
so good.*

`tools/regenerate-level.sh` then ran clean (10:47:59Z → 10:48:02Z, exit 0).

### B3 — binding on an un-threaded section (10:48:07Z → 10:48:38Z, exit 1)

18 failed / 2453 passed. The load-bearing rows:

> `section 0's sidecar names rasterRef 'coldread_water_tint', but no preset threads
> ojz_act1_sec_raster(sec: 0) — the generator would emit the binding row and nothing
> would read it, which presents to the author as an assignment that did nothing.`

> `AssertionError: Lists differ: [0, 5, 6] != [5, 6] : the bound sections are
> [0, 5, 6], not [5, 6]`

`WORKED` — **the loop closes.** Aurora warned at the control, in orange, before I
bound it; aeon then refused by name, quoting the same symbol. Two independent
statements of one rule that agree. This is the outcome the surface predicted, so it
is not a defect — it is the surface being right.

### B4 — binding on a section that passes BOTH of Aurora's conditions (10:50:41Z → 10:51:06Z, exit 1)

I moved the binding to **Section 5**, the section Aurora's own strip marks
`✓ own preset` **and** `✓ threaded` (`31-section5.png`: *"OJZ_Preset_Sec5 threads
ojz_act1_sec_raster(sec: 5)"*), saved, re-baked and rebuilt. **It still refuses**,
for a condition Aurora never mentions:

> `section 5's sidecar names rasterRef 'coldread_water_tint', whose document carries
> cycles — so the generator emits 1 cycle binding row(s) for sec 5 into
> ojz_act1_sec_cycle. But OJZ_Preset_Sec5, the preset section 5 binds … threads
> ojz_act1_sec_cycle for sec 5 NOWHERE. One rasterRef binds the WHOLE document
> (ruling Q1), so every key it carries owes its own chooser at that section's
> preset() — a row nothing calls is a row nothing reads, which presents to the
> author as an assignment that did nothing, and this is what made the whole binding
> green and byte-identical (Aurora, 2026-09-04). Write, inside that preset():
>       cycle: ojz_act1_sec_cycle(sec: 5, hand: Pal_Cycle_None)`

**This is the headline finding — §3, D-A.**

### The isolation, and the definitive table

The `/tmp` clone is not a clean baseline (B1's environment alone costs 7 unrelated
failures), so no failure count taken there means anything on its own. I therefore
did two things: (a) cloned a **pristine control** at the same commit into `/tmp` and
set-differenced the failure lists, and (b) re-ran everything in a clone placed
**inside the suite root**, where the baseline is genuinely green. The two agree.
The suite-root numbers are below; that clone was deleted afterwards (§6).

| what was authored | `./build.sh` | tool suite | `s4.bin` |
|---|---|---|---|
| nothing — pristine `9e3d2861` | **exit 0** | 2471 passed, 0 failed | built, md5 `310c4894…` |
| **Task A only** — drift layer + section 0 scene binding | **exit 0** | 2471 passed, 0 failed | built, md5 `89ca14e7…` |
| **+ Task B** — raster band on section 5, no cycles | exit 1 | **2 failed**, 2469 passed | not reached |
| **+ Task C** — palette cycle in the same preset | exit 1 | **11 failed**, 2460 passed | not reached |

`WORKED` — Task A's ROM is **not** byte-identical to the baseline (`89ca14e7…` vs
`310c4894…`, both 819,775 bytes). The parallax layer I authored in the UI reached
the ROM.

The `/tmp` set-difference produced exactly the same 11 rows, so the two methods
corroborate.

**`BLOCKED` — I never got a ROM out of any run carrying Task B or C**, because the
tool-suite gate runs before assembly. "Does the raster band assemble correctly?" is
**unmeasured** — not green and not red. I cannot answer it without either a change
to aeon or a threaded section that is free, and neither is in my parcel.

---

## 3. Defects, sorted by whether they STOPPED me

### STOPPED me

**D-A — Aurora's two-condition verdict is missing a third condition, and authoring
a palette cycle is what makes it wrong.** *The one I would fix first.*

The pinned strip publishes exactly two rows, `own preset` and `threaded`, and the
guide's §5 is emphatic that they are kept separate because "a single verdict cannot
tell you which". Section 5 shows **✓ ✓**. Aurora is therefore stating, in its own
derived words, *this section can carry an editor-authored raster band*. It cannot,
once the preset also carries a `cycles` key: the build refuses because
`ojz_act1_sec_cycle` is threaded nowhere for that section, and **Aurora publishes no
row for the cycle chooser at all**.

That is exactly the intersection of two of the three things this parcel asked for.
Task B alone on section 5 costs 2 failures; Task B **plus** Task C costs 11. The
seam gate's own message says this shape *"is what made the whole binding green and
byte-identical (Aurora, 2026-09-04)"*, so it is a known failure mode the strip still
does not report. **It stopped me: there is no arrangement reachable from the UI in
which all three artifacts build.**

**D-B — there is no free section to bind a new raster preset to, and nothing says
so.** Only 5 and 6 are threaded, and both already carry a preset
(`ojz_sec5_showcase`, `ojz_sec6_baseswap`). Binding mine to either **orphans** the
incumbent, and a lint refuses that by name:

> `these preset documents … are reachable by NOTHING: ['ojz_sec5_showcase'].`

So the act's only two legal homes for an editor-authored raster band are both
occupied, and taking one is a regression. The strip prints `threaded 5,6` as though
those were available. **It stopped me getting a green build with a raster band in
it by any route the UI offers.**

### SLOWED me down

| id | what | where | why it matters |
|---|---|---|---|
| **C7** | `colours` is `<input type=text>` among three identical-looking `<input type=number>` siblings, so it does not select-on-click and **appends**; `0143584` is accepted with no warning and a cheerful green swatch | Colour → PRESET — `<id>` → `colours` | the guide *explicitly promises the opposite*, and this is the only value on the card with no range check |
| **C8** | the Top/Bot guard runs per keystroke, so typing `250` over a `40` leaves **25** committed while the message ends "Refused; Top is still 25" | same card, `Top` / `Bot` | anyone typing a 3-digit line number hits it, and the refusal reads as "nothing changed" |
| **C9** | the `cycles` select is 10px wider than the panel, so opening the CYCLES card scrolls the **pinned strip** sideways and clips its ✓/✗ | Colour → CYCLES, VARIANTS | it hides the exact two glyphs D-A is about, on the strip the guide calls "never scrolls" |
| **C2** | "Editing Section 0" sits directly above a form for a scene section 0 is not bound to | Parallax | the most disorienting thing on the tab for a newcomer |
| **C3** | the one sentence that says what a factor *does* is a hover tooltip; the permanent sentence under the same control is much weaker | Parallax → Plane B | the guide has to spend a paragraph telling you to hover a dropdown |
| **C4** | a new scene has no name and shows its raw id; `Name` is inside the card that "arrives shut", and the guide's list of reasons to open that card omits Name | Parallax → SCENE — `<id>` | every stock scene has a title, so yours looking different reads as broken |
| **C1** | a red ✗ greets you on an untouched project | the strip | reads as "you broke it" before the paragraph beside it is read |
| **C5** | one entry of `B curve to` is marked "(engine refuses)" — a different one on each layer — and nothing says why | Parallax → layer card | it is the only control on that card with no explanation |
| **C6** | the guide warns Ctrl+S produces "a large git status"; mine produced **two** files | guide §6 | an over-warning teaches you to discount the next one |
| **C10** | the guide's happy path (`Ctrl+S` → `./build.sh`) always fails; `tools/regenerate-level.sh` is mentioned only under a different symptom, and the app never mentions it | guide §6 | the recovery came from aeon's output, not Aurora's |
| **D1** | `Build & Run` exists only in `Ctrl+K`; no button anywhere, and the guide never says it exists | global | first-time authors are sent to a shell for something the app can do |

### `REPEAT`

- **R1** — the layer's vertical position is `Screen line` in the form, `L0 y=0` on
  the map overlay, and `world_y` in the file Aurora writes. Three spellings; the
  guide reconciles two of them.
- **R2** — the preset list's right-hand column is unlabelled and mixes two kinds of
  value: `2 bands`, `1 band`, `3 bands` (counts) sitting next to `ramp` and
  `base swap` (program names). One column, two meanings, no header.

I looked for, and did **not** find, the repeat this surface is said to have had:
"band" now means raster band only, tile animations live on their own sub-tab with
their own vocabulary, and §7 of the guide states that split deliberately. It holds
on the screen.

### `TASTE` — recorded, not defects

- **T1** — `RASTER BAND PRESETS` opens onto ~150 words of caveats (five stacked
  paragraphs) before the first control; on a 742px panel that is the whole viewport.
  Every sentence is true; together they are a wall in front of the door.
- **T2** — the guide is ~3,400 words. The §1 table and §8 index carry most of the
  value; the middle is reference material.
- **T3** — the ✓/✗ glyphs duplicate work the sentences beside them do better, and
  they are the part that gets clipped (C9).
- **T4** — the three-sub-tab layout is settled and I am not arguing with it. For the
  record it read clearly: I never once looked for a control on the wrong sub-tab.

---

## 4. The ratio

Because a log of only complaints is not a measurement:

| | count |
|---|---|
| `WORKED` — obvious, and did what I expected | **21** |
| `CONFUSION` — could not act with confidence | **10** |
| `BUILD ERROR` | **4** (1 environmental, 1 procedural, 2 substantive) |
| `REPEAT` | **2** |
| `DEAD END` | **1** |
| `TASTE` | **4** |
| artifacts authored | **3 of 3** |
| artifacts that reach a green build | **1 of 3** |

Ten confusions on a surface this dense is a good number, and **none of the ten
stopped me authoring**. What stopped me was downstream of the panel: both entries
under "STOPPED me" are about a *verdict Aurora publishes being incomplete*, not
about a control being unusable.

The most striking thing about this surface is how much of its usability is carried
by **prose written at the control** — the inline sentence under every layer field,
the self-rewriting factor tooltip, the live `addr` decode, the delete guard that
names the control that clears it, the destructive-switch warning on `Program`.
Where those sentences exist, I was never lost. **Every one of my ten confusions is
somewhere a sentence is missing, wrong, or hidden** — C3 hidden, C5 missing, C6 and
C10 wrong, C9 clipped. That is consistent enough to be one design rule rather than
eleven separate fixes.

---

## 5. What I did not manage to test — stated plainly

- **Whether the raster band or the palette cycle is correct in the ROM.** No run
  carrying either produced an `s4.bin`; the tool-suite gate precedes assembly.
  Unmeasured — not green.
- **What the band or the cycle looks like.** The panel says twice that Aurora draws
  no preview of either. I could not run the ROM (D1) and did not try.
- **What the screen teaches without the guide.** I read the guide first, as the
  brief directs. Everything above survives a full read of it.
- **`variants`, `MOVING ANCHORS`, `B split at`, `Deform`, `Row remap`, `Bob`,
  `Reels`, `Transition`, the `Program` switch, and the whole `Tile anim` sub-tab.**
  Out of scope for three artifacts; untouched.
- **The layer-line drag gesture** the guide describes at length (grab a line on the
  map, drag it, one undo). I typed screen lines instead and never exercised it.
- **`FAST=1 ./build.sh`.** Only the plain build was run, which is what the guide
  says to trust.
- **Section 6.** I reasoned that binding there orphans `ojz_sec6_baseswap` exactly as
  section 5 orphaned `ojz_sec5_showcase`, from the lint's own wording. I did not run
  it. **That half of D-B is reasoned, not measured.**
- **Undo.** Several controls advertise "it is one undo step". I never pressed Ctrl+Z,
  so every one of those claims is unverified here.

---

## 6. Proof I did not touch the owner's aeon

`/home/volence/sonic_hacks/aeon` was never written. Both snapshots:

```
AT START (before launch)                                    AT END
 M docs/lane-status.json                                     M docs/lane-status.json
 M games/sonic4/data/generated/effects_channel_bands.json
 M games/sonic4/data/generated/ojz/act1/DONOR_PROVENANCE.json
?? docs/loop-rollmarks-restore-section0.json
?? waterline_art_witness.json
HEAD 85fc9082                                               HEAD 722d1cf2
```

They are **not identical, and neither difference is mine**: `HEAD` advanced because
another lane committed during my run, which is what removed four of the five
entries. The positive check is the one that matters — none of my files exist there
and neither binding moved:

```
$ ls .../aeon/.../effects/coldread_drift.json                 No such file or directory
$ ls .../aeon/.../effects/presets/coldread_water_tint.json    No such file or directory
$ grep Ref .../aeon/.../section_0.meta.json    "sceneRef": "ojz_act1_start"  (no rasterRef key)
$ grep Ref .../aeon/.../section_5.meta.json    "rasterRef": "ojz_sec5_showcase"
```

All authoring went to `/tmp/coldread-aeon-x3fBQG/aeon`. The green-baseline builds
used a second clone at `/home/volence/sonic_hacks/coldread-aeon-scratch`, created
only because `suite_paths` refuses a repo outside the suite root (B1); it was a
fresh `git clone` of the same commit, it is **deleted**, and it was never the
owner's tree.

**No emulator MCP tool was called. `Build & Run` was never pressed.**

---

## 7. The rig, and one defect that was mine

`scratchpad/effects-cold-read-harness.mjs`, registered as
`npm run harness:effects-cold-read` in the same commit. It is an interactive control
port rather than a fixed script — a cold read has no gesture sequence to assert
about — but its boot preconditions are real `PASS`/`FAIL` rows and it **refuses to
hand over the port** if any is red, because a reading taken through a broken rig is
worse than no reading.

The three named rig traps, and what each cost:

- **`.click()` is not a click.** Every gesture went through
  `Input.dispatchMouseEvent` press/release, hit-tested with `elementFromPoint`
  first, and the aim **refuses** rather than clicking whatever is underneath. It
  refused once, correctly, when a stale element index resolved to (0,0).
- **`devicePixelRatio`.** Read as **1** on every aim in this run and printed beside
  each. No positional finding here rests on a fractional rect.
- **`checkVisibility()` lies.** Not used. C9's visibility claim is made by comparing
  `scrollWidth` / `clientWidth` / `scrollLeft` on the scroller and printing all
  three.

**And one defect that was mine, caught before it became a finding.** My first
`/type` implementation sent a CDP `keyDown` *with* `text` **and** a separate `char`
event. Blink synthesises the keypress from the `keyDown` alone, so every character
was typed twice: `coldread_drift` arrived as `ccoollddrreeaadd__ddrriifftt`. Had I
not read the field's value back after typing, I would have filed "the Scene id box
duplicates input" as a product defect. Fixed in the harness, not the app, and the
run restarted. C7 was then established the same way — by proving the gesture landed
(`selectionStart` / `selectionEnd` after a real click, `3,3` on `colours` versus
`null,null` on `Top`) before calling it a product defect.

