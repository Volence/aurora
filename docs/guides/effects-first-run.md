# Backgrounds that move — your first ten minutes

You are on the **Effects** tab of a level. This page answers, in order, the questions
a person actually asks here on their first day. It is written from a walkthrough by
someone who had never opened this tab (`docs/reviews/2026-09-02-effects-cold-walkthrough.md`);
every heading below is a question that reader genuinely got stuck on.

You can open this page from inside Aurora at any time: the **? Guide** button on the
Effects toolbar, the **Guides** card on the Home tab, or `Ctrl+K` → "Guide".

---

## 1. What does this tab do?

Three separate things, which look similar and are not:

| you want | you build | where |
|---|---|---|
| the background to slide past at a different speed from the ground | a **scene** with **layers** | the **Parallax** sub-tab |
| a horizontal stripe of the screen to change colour (water, heat haze, a tinted sky) | a **raster band**, inside a **preset** | the **Colour** sub-tab |
| the same colours to rotate, so water shimmers | a **palette cycle**, inside the same preset | the **Colour** sub-tab |
| background *tiles* to animate in place | a **tile animation** | the **Tile anim** sub-tab |

The fourth one is **not** a colour effect and shares no mechanism with the second,
which is why they are on different sub-tabs. See §7.

**The right panel is three sub-tabs under one permanent strip.** The strip says
which section you are editing and what it is bound to, and never moves; the three
buttons under it choose which job you are doing. One job is on screen at a time,
and the other two are not rendered at all.

```
Editing   [ Section 0            ▾ ]   ← the strip: always there, never scrolls
scene ojz_act1_start · raster hand-authored
✓ own preset / ✗ threaded              ← can this section carry a raster band? §5
[ Parallax ][  Colour  ][ Tile anim ]  ← the three jobs

  Parallax                Colour                    Tile anim
  ────────                ──────                    ─────────
  SCENES            §2    RASTER TIMELINE           TILE ANIMATIONS (n/4)  §7
  LAYERS (n/16)     §2    RASTER BAND PRESETS  §3   NEW TILE ANIMATION     §7
  SCENE — <id>            PRESET — <id>        §3
  SECTION ASSIGNMENT §5   PRESET — … CYCLES…   §4
```

`PROPERTIES` sits below all three — it is a readout of whatever is selected, not
one of the jobs.

**`SCENE — <id>` arrives shut.** That is deliberate and it is one click: the layer
list above it is the thing you scroll, and an open scene form takes two thirds of
the column away from it. Open it when you need `V factor`, `Bob`, `Deform` or
`V offset`; it stays open after that.

---

## 2. Make the background drift (a parallax layer)

A **scene** is a stack of horizontal **layers**. Each layer starts at a screen line
and says how fast the foreground and background scroll from that line down. A layer
whose background factor is *lower* than the camera drifts — that is parallax.

1. Press **`Parallax`**, the first of the three sub-tab buttons.
2. In `SCENES`, click a scene, or type an id in `Scene id` and press `New`.
3. In `LAYERS`, press `Add`. A layer appears at the next screen line.
4. On the new layer set **`Plane B (bg)`** to a fraction — `FACTOR_1_8` is a good
   first try.

**Read the tooltip on that dropdown after you set it.** It rewrites itself into the
only sentence in this panel that tells you what will actually happen:

> at 1/8 of camera speed: its 512px picture starts over every 4096px of camera travel, 1 time across this act's 5824px

Reference points: `FACTOR_1` = moves with the camera (that is the ground);
`FACTOR_1_2` = half speed, clearly behind; `FACTOR_1_16` = a distant sky;
`FACTOR_LOCKED` = does not move at all.

`Plane A (fg)` is the level itself. Leave it at `FACTOR_1` unless you know why not.

### See it

**It is already on.** Arriving on the **Parallax** sub-tab draws the real background
per strip inside the screen frame, with each layer's factor labelled — the only
thing in Aurora that shows what a scene's layers do. You do not have to find a
switch first, which is what everybody had to do before.

The switch is **`Parallax preview`** on the Effects toolbar, and the same switch is
`View ▾` → `Compose the background in the frame (parallax)`. Three things about it
that are worth knowing:

- **Turn it off and it stays off.** Aurora writes your answer down, and from then on
  it is your answer — on this tab, on the other two, and the next time you open the
  application. The "on by default" only ever speaks to somebody who has never
  touched the switch.
- **It follows you across the three jobs once you have decided.** Until you do, it
  is on for `Parallax` and off for `Colour` and `Tile anim`. If you want the
  background under your raster band, press the chip on the Colour tab — that is a
  decision, and it sticks.
- **It exists only on this tab.** No other tab draws it and no other tab's `View ▾`
  offers it.

While it is on, the **arrow keys move the camera** (1px, or 16 with Shift) instead
of panning the map — that is how you judge slow parallax, which a mouse drag jumps
straight past. Dragging with the mouse, space-panning and the wheel still pan.

> The `LAYERS` list has its own scrollbar and gets the height the Parallax sub-tab has to spare — measured at 211px of a ~2,400px list, so about a card and a half. Scroll **inside** the list. Opening `SCENE — <id>` under it takes that height away again; shut it when you are done in there.

### Drag the line instead of typing the number

Every layer in the scene is drawn on the map as a horizontal line labelled
`L0 y=0`, `L1 y=32`, and so on. **Those lines are the `Screen line` spinner, in the
other spelling — grab one and drag it.** Put the cursor within about six pixels of a
line and it turns into an up-down resize cursor; that is the line telling you it is
grabbable. Press, drag, release.

- **The map does not pan while you are on a line.** The line takes the press, so the
  drag moves the layer and nothing else. Anywhere off a line, the same press pans
  the map exactly as before. The wheel still zooms, space still pans, and the arrow
  keys still move the camera — none of them are on the mouse button the line uses.
- **You can drag past the top or the bottom of the window.** The gesture follows
  your cursor off the canvas, so a layer can be put somewhere the map is not
  currently showing.
- **It is one undo.** However far you drag and however long you take, `Ctrl+Z` once
  puts the layer back where it started. A drag you release where you began writes
  nothing at all.
- **The number is the same number.** The drag runs through the spinner's own limits,
  so it cannot put a layer somewhere you could not have typed.

**When a line turns red, read the sentence beside it.** That is the layer telling
you the build will refuse it — the message says which rule and what to do, and it
appears while you are still holding the button, not after you let go.

### One layer dragged past another

Nothing stops you, and nothing quietly re-sorts your layers behind your back. Drag
`L1` above `L0` and it stays where you put it.

For most layers that is simply legal: a layer with `Plane B split at` set to `none`
has no rule about what order it comes in.

**Where it is not legal, the line goes red and says so.** If *both* layers carry a
`Plane B split`, the splits have to go down the screen — two of them on one row
would be two whole-plane scroll values for one line, and the build refuses it. You
get the message the moment you drag one past the other, and it names both layers.
There are two ways out and Aurora will not choose for you: give the two layers
different screen lines, or drop one of the splits.

### Clouds that move on their own (`Drift`)

Everything above needs the camera. **`Drift`** does not: it is a constant sideways
speed added to one layer **every frame**, whether the camera moves or not. That is
what clouds are — Green Hill's, Angel Island's.

1. On the layer you want moving, set **`Drift`** to `px/frame`.
2. A number box appears, already holding `0.125`. That is Angel Island's clouds —
   the slowest speed anyone has shipped, and a good place to start.
3. Type a speed. **Negative moves left.** `1` is a pixel a frame, which is fast;
   `6` is the fastest in any of the games this engine copies.

**The box is pixels per frame. The file is in 256ths of one.** You never type the
file's number — Aurora multiplies on the way out and divides on the way back in.
If you open the scene file and see `"rate": 32` where you typed `0.125`, that is
correct.

Two things it will not let you write, and it says so under the box:

- **`0`.** In the ROM a zero drift and no drift at all are the same bytes, so the
  build refuses it. Set the row back to `none` — that is how you say "this layer
  does not drift". Anything that *rounds* to zero (`0.001`) is refused for the
  same reason.
- **More than ±16 px/frame.** Nothing breaks up there; it just looks absurd, and
  the build refuses it anyway.

> Four layers of one picture want the **same** number typed four times — a single
> plane cut into four strips will tear at a boundary if the strips drift at
> different speeds. There is deliberately no "apply to all": drift is per-layer,
> and hiding that would hide the tearing.

⚠ `Parallax preview` does **not** animate drift. Nothing in Aurora shows a layer
actually drifting; you see that in the game.

---

## 3. Make a raster band (a coloured stripe)

A raster band repaints part of the palette for a range of screen lines. It lives
inside a **preset** — a document that can hold several bands. There is no control
called "make a band"; you make a preset, and it comes with one.

1. Press **`Colour`**, the middle sub-tab, and open `RASTER BAND PRESETS`.
2. Type an id in `Preset id` — lower case, underscores, e.g. `ojz_water_tint`.
3. Press `New`. You now have a preset with `Raster band 0` in it.
4. Open `PRESET — <your id>` and fill the band in:

| field | what it means | sane first value |
|---|---|---|
| `Top` | screen line the colour turns **on** | `40` |
| `Bot` | screen line it turns **off** again | `72` |
| `S/H` | shadow/highlight mode | `off — two-fire band` |
| `ON` | how the colour is written | `cram (raw colours)` |
| `addr` | **byte** address in CRAM. line × 32 + entry × 2 | `74` = line 2, entry 5 |
| `colours` | the colour word(s), **in decimal** | `14` |

### Two things that will catch you

**`Top` must be less than `Bot`, and both must be real screen lines (3–223).** Aurora
now refuses a value outside that as you type it and says which rule stopped it, so
`Top 200 / Bot 100` no longer reaches the build. Clicking a number box also selects
what is in it, so clicking `Top` and typing `40` gives `40`, not `40112`.

**`colours` is a decimal Genesis CRAM word,** not a hex code and not a swatch. The
format is `0000 BBB0 GGG0 RRR0`. Useful values:

| colour | decimal | colour | decimal |
|---|---|---|---|
| black | `0` | red | `14` |
| dark red | `6` | green | `224` |
| blue | `3584` | white | `3822` |

To mix your own: `red + green×16 + blue×256`, each of R/G/B being an even number
0–14. (`Authored probe (red / blue)`, shipped with the project, uses `14` and `3584`
— open it if you want a worked example.) A `0x`-prefixed hex value is accepted too.

**There is no preview of a raster band.** Aurora draws parallax layers (§2) but not
raster bands — there is nothing here to check one against, and a wrong preview would
be worse than none. You will not see a band until the ROM runs.

---

## 4. Make a palette cycle (shimmer)

Still on the **Colour** sub-tab and still inside your preset, open
`PRESET — <id> — CYCLES, VARIANTS`.

1. Set `cycles` to **`authored script (array of channels)`**. A `Channel 0` appears.
2. Fill it in:

| field | what it means | sane first value |
|---|---|---|
| `line` | which CRAM line rotates. **Never 0** — line 0 is the player's | `2` |
| `first` | first entry in that line | `8` |
| `count` | how many consecutive entries rotate | `4` |
| `period` | frames between rotations — higher is slower | `8` |
| `dir` | forward / reverse. Optional; leave it absent | absent |

The other two `cycles` settings are wire-format states, not behaviours:
*keep the section's hand-authored cycle (key absent)* leaves whatever the engine
already had; *off (null)* actively turns cycling off. Pick "authored script".

### `variants`, and the line mask

`variants` is a separate thing that lives in the same card: it stages a whole palette
line shifted darker or lighter. If you open it, `lines` renders as `L0 L1 L2 L3`
chips.

**`L0` cannot be lit.** Line 0 is the player's palette and the engine refuses a mask
that includes it. Aurora used to let you click it and fail the build; it now refuses
the click and says why. If a hand-written file already carries bit 0, you can still
click `L0` to clear it.

If you do not need `variants`, leave it on *every slot keeps its hand-authored value*.

---

## 5. Bind it to a section

Two separate bindings, now on two different sub-tabs, both acting on **the section
named in the strip at the top**:

- **the scene** → `SECTION ASSIGNMENT`, at the bottom of the **Parallax** sub-tab.
- **the raster preset** → the `Section <n>` dropdown at the bottom of
  `RASTER BAND PRESETS`, on the **Colour** sub-tab.

The Effects tab has a **section strip** pinned to the top of the panel, above the
three sub-tab buttons. It stays put while the rest of the column scrolls and while
you change job, so it is on screen when you reach either binding.
It names the section you are editing, prints what that section is bound to
(`scene … · raster …`), lets you change which section without leaving the tab,
and states the two raster-wiring conditions as two rows (below). It is the same
number the Layout tab's `SECTIONS` grid sets — one section, two tabs.

### Which section can carry a raster band?

This is a fact about **the level's own data**, not a limit of the editor, and Aurora
derives it per project rather than shipping a list.

A section's effects come from a `preset()` record in aeon's effects library, and
`Sec.sec_effects` is a **pointer** — several sections can point at the same record.
Giving a section-keyed raster band to a record that two sections share would give the
band to **both** of them, so aeon's build refuses it.

> A section can carry an editor-authored raster band **only if it binds a preset that no other section binds.**

In `ojz act1` today that is sections **0–5**: each has its own preset. Sections
**6, 7 and 8 all share `OJZ_Preset_Plain`**, so none of the three can have one until
a programmer splits that record — and Aurora says so at the control, naming the
sections that share and what would happen.

There is a second, smaller step behind that one, and Aurora keeps the two apart
because conflating them is how the wrong answer got published twice in one day:

| condition | what it means | today, in `ojz act1` |
|---|---|---|
| **1 — own preset** | no other section binds this section's preset record | 0, 1, 2, 3, 4, 5 |
| **2 — threaded** | some `preset()` also *threads the chooser* on this index — one line in aeon | 5 |

The strip prints these as **two rows**, each with its own `✓` / `✗` / `?`, because
which one you fail decides what you do next: condition 1 needs a programmer to
**split a preset record**; condition 2 needs **one line of aeon**. A single
verdict cannot tell you which.

A binding on a section that owns its preset but is not threaded writes the key,
and aeon's canonical build refuses it by name (*"no preset threads
`ojz_act1_sec_raster(sec: N)`"*) until that line is added.

**Aurora derives both facts from aeon's own files on every load** — the act
descriptor and the effects library — and prints both sets act-wide on the strip's
last line. The two are read from different files and degrade independently: if
only one file is unreadable, that condition reads `?  could not read <file>` and
the other still answers.
Nothing here is a list somebody wrote down, so the answer changes on its own when
aeon changes the level. It does **not** stop you binding: whether a section is
wired is aeon's fact to change, and a lock built on a snapshot would be wrong the
day they change it. If Aurora cannot read those files it says so, and still lets
you bind.

Scenes have no such restriction — bind a scene to any section.

---

## 6. Save, and build

**Ctrl+S.** There is no Save button on a level tab; the dot on the tab title is the
only sign you have unsaved work. **A save writes a file only when that file's
meaning changed.** Every JSON document Aurora writes is compared against the one
already on disk as a parsed value, so indentation, key order and the trailing
newline do not count as a change, and a document you did not touch is left alone.
So read your `git status` after a save — it is the work you actually did, and a
file in it you never opened is worth opening rather than scrolling past.

One thing that is bigger than you expect, and it is the diff and not the file
count: a document whose meaning has changed is rewritten in full canonical form,
so it can pick up formatting aeon's own writers do not emit.

Then, in your aeon checkout. **The re-bake is a step of this path, not a recovery
from an error:**

```
tools/regenerate-level.sh   # re-bake the level tree from what you just saved
./build.sh                  # the real one — run this before you land anything

FAST=1 ./build.sh           # the iteration loop — re-bakes for you, skips the gates
```

**Why a save on its own is not enough.** aeon's generated level tree is a
committed artifact — `games/<game>/prebuild.sh` is a documented no-op — so nothing
rebuilds it just because you saved. Both builds ask `tools/level_staleness.py`
whether the committed tree was baked from the editor sources that are there now, and
after any save the answer is no. What happens next is the only difference between
the two commands:

- **`./build.sh` refuses, and it refuses before it assembles anything.** So a red
  build here is not a verdict on what you authored — nothing downstream has looked
  at it yet. The message names which check fired, lists your files by name, and
  gives `tools/regenerate-level.sh` as the remedy. Re-bake and run it again.
- **`FAST=1 ./build.sh` runs the re-bake for you** and prints how long it took. That
  is the loop's whole point, and it is why the fast path needs no separate step.

**What `FAST=1` still will not tell you.** It skips the whole test lane and every
gate that has to read the listing the build just emitted, so a green FAST run is not
a landing. It does run one check first — the editor-scene binding seam, read out of
the source — so binding a preset to a section nothing threads now fails in the loop
instead of at landing. What it cannot answer is whether your effect actually
reached the ROM: the reachability evidence is minted by the build it runs before.
Run the plain `./build.sh` before you believe it.

**`touch` is not a shortcut past this.** The gate has a second arm that reads no
timestamps at all — it compares a content stamp of your editor sources against the
one the last re-bake wrote — so a delete, a rename or a revert moves the answer
whatever the mtimes say. Touching a file silences only the timestamp arm, and it
lights that arm again in the process; the tree stays stale and the same error comes
back. Re-bake.

### If a build error will not go away after you reverted

**Re-bake — it is the reverting case, not a stuck build.** Removing a document the
way a person reverts (`rm`) is exactly what the content-stamp arm exists for: an
added, removed, renamed or modified editor source all move the answer, so
`tools/regenerate-level.sh` clears the generated module that still carries the
deleted document's data. There is nothing to touch and nothing to force.

### If the re-bake itself fails

**Read the re-bake's own output — the build prints it in full, and it is the part
that names your file.** The failing line is usually precise: *"rasterRef 'x' names
no preset document … Known ids: …"*, which is what you get when you delete a preset
a section still points at. Missing out-of-repo donors is the other cause, and the
build says so as a footnote, after its output — suspect it only when nothing above
names a file or an id.

---

## 7. Tile animations are not raster bands

Two features on this tab used to share the word "band". They no longer do: the two
names share no word, **and they are on different sub-tabs**, so they can no longer
be read as one list.

| control | sub-tab | what it makes |
|---|---|---|
| `Add blank tile animation` (toolbar) | any — see below | a **tile animation** — animated background *tiles* |
| `NEW TILE ANIMATION` | Tile anim | the same thing, with all the options |
| `TILE ANIMATIONS (n/4)` | Tile anim | the list of those |
| `RASTER BAND PRESETS` | Colour | **raster bands** — the coloured stripes of §3 |
| `PRESET — <id>` → `Raster band 0` | Colour | one raster band |
| `bands` column of `RASTER TIMELINE` | Colour | raster bands, drawn |

`Add blank tile animation` is on the toolbar, which is on screen whichever job you
are doing — so pressing it from `Parallax` brings the **Tile anim** sub-tab
forward, opens the list and scrolls to the animation it just made. The tab
changing under you is the click working.

A **tile animation** is a block of background tiles that cycles through eight
frames, so a waterfall runs or a trunk scrolls. It costs tile slots and has a hard
ceiling of four per act. It has nothing to do with palettes or screen lines.

A **raster band** repaints colours on a range of screen lines. It costs no tiles.

If you are looking for a coloured stripe, you want the **Colour** sub-tab, not the
**Tile anim** one.

---

## 8. Quick reference

| I want to… | go to |
|---|---|
| make the background move as the camera does | `Parallax` → `LAYERS` → `Add` → set `Plane B (bg)` |
| see that | `Parallax preview` on the Effects toolbar |
| make a layer move on its own (clouds) | that layer's `Drift` row → `px/frame` |
| make a coloured stripe | `Colour` → `RASTER BAND PRESETS` → `Preset id` → `New` |
| make colours shimmer | `Colour` → `PRESET — <id> — CYCLES, VARIANTS` → `cycles: authored script` |
| delete a preset a section binds | unbind that section first — Aurora refuses the delete and says which |
| animate background tiles | `Tile anim` → `NEW TILE ANIMATION` |
| change which section I am editing | the section strip pinned to the top of the Effects panel |
| change which job I am doing | the three buttons under the strip: `Parallax` / `Colour` / `Tile anim` |
| find `V factor`, `Bob`, `Deform`, `V offset` | `Parallax` → open `SCENE — <id>` (it arrives shut) |
| use a scene on a section | pick the section, then `SECTION ASSIGNMENT` |
| save | Ctrl+S |
| open this page | `? Guide` on the Effects toolbar |

### Things Aurora refuses while you author, so the build does not have to

- A `Top` or `Bot` outside screen lines 3–223.
- `Top` at or below `Bot` on the same raster band.
- Lighting `L0` in a `variants` line mask.
- A `colours` list that is empty or holds a non-integer.
- A `Drift` of `0`, or anything that rounds to it, or one past ±16 px/frame.

### Things the build can still refuse

- Binding a raster preset to a section aeon has not threaded yet (§5) — Aurora warns
  at the control and does not block it, because that is aeon's fact to change.
- A band whose colour is invisible against the palette it repaints. Nothing anywhere
  catches that — not this panel, not the schema, not the build.
- Overlapping bands that share CRAM colours, or two bands firing on one screen line.
  Aurora warns; it does not refuse, because a nested band over a disjoint colour span
  is legal and walling it would refuse programs the engine builds.

Deleting a preset a section still binds used to be on this list. It is not any more:
Aurora refuses the delete, names the sections that bind it, and tells you to set them
back to `Hand-authored raster` first.
