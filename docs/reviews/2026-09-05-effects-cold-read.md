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

---

*(Task C, the section binding, the build, and the defect list follow in the next
commits on this branch.)*
