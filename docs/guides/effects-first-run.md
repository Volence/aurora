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
| the background to slide past at a different speed from the ground | a **scene** with **layers** | `SCENES` → `LAYERS`, top of the right panel |
| a horizontal stripe of the screen to change colour (water, heat haze, a tinted sky) | a **raster band**, inside a **preset** | `RASTER BAND PRESETS`, bottom of the panel |
| the same colours to rotate, so water shimmers | a **palette cycle**, inside the same preset | `PRESET — <id> — CYCLES, VARIANTS` |

There is a fourth thing on this tab, `TILE ANIMATIONS`, which is **not** any of
these — it animates background *tiles*, not colours. See §7.

The right panel is one long column, roughly eight screens tall, in this fixed order:

```
SCENES                       ← pick / create a scene
SCENE — <id>                 ← settings for the whole scene
LAYERS (n/16 per scene)      ← the parallax strips        ⟵ §2
SECTION ASSIGNMENT           ← which scene this section uses  ⟵ §5
RASTER TIMELINE              ← a picture of bands + layers
TILE ANIMATIONS (n/4)        ← animated background TILES. §7
NEW TILE ANIMATION           ← the form that makes one. §7
RASTER BAND PRESETS          ← raster bands live here     ⟵ §3
PRESET — <id>                ← the raster bands in one preset
PRESET — <id> — CYCLES…      ← palette cycling            ⟵ §4
PROPERTIES
```

Scroll to the bottom once, now, so the shape stops surprising you.

---

## 2. Make the background drift (a parallax layer)

A **scene** is a stack of horizontal **layers**. Each layer starts at a screen line
and says how fast the foreground and background scroll from that line down. A layer
whose background factor is *lower* than the camera drifts — that is parallax.

1. In `SCENES`, click a scene, or type an id in `Scene id` and press `New`.
2. In `LAYERS`, press `Add`. A layer appears at the next screen line.
3. On the new layer set **`Plane B (bg)`** to a fraction — `FACTOR_1_8` is a good
   first try.

**Read the tooltip on that dropdown after you set it.** It rewrites itself into the
only sentence in this panel that tells you what will actually happen:

> at 1/8 of camera speed: its 512px picture starts over every 4096px of camera travel, 1 time across this act's 5824px

Reference points: `FACTOR_1` = moves with the camera (that is the ground);
`FACTOR_1_2` = half speed, clearly behind; `FACTOR_1_16` = a distant sky;
`FACTOR_LOCKED` = does not move at all.

`Plane A (fg)` is the level itself. Leave it at `FACTOR_1` unless you know why not.

### See it

Nothing draws until you ask. Press **`Parallax preview`** on the Effects toolbar —
it is the same switch as `View ▾` → `Compose the background in the frame
(parallax)`. Tick `Screen frame (320x224)` in that menu too. The canvas then draws
the real background per strip with each layer's factor labelled. It is off by
default; turn it on the first time you open the tab and leave it on. This is the
only thing in Aurora that shows what a scene's layers do.

> The `LAYERS` list is a very short scrolling window inside an already-scrolling panel. If you can only see one layer, scroll **inside** the list.

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

1. Scroll to `RASTER BAND PRESETS`.
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

Still inside your preset, open `PRESET — <id> — CYCLES, VARIANTS`.

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

Two separate bindings, at opposite ends of the panel, both acting on **the section
named at the top of the panel**:

- **the scene** → `SECTION ASSIGNMENT`, just under `LAYERS`.
- **the raster preset** → the `Section <n>` dropdown at the bottom of
  `RASTER BAND PRESETS`.

The Effects tab has a **section strip** pinned to the top of the panel. It stays
put while the rest of the column scrolls, so it is on screen when you reach
either binding — including the raster one, which is about 1,600px further down.
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
only sign you have unsaved work. Saving rewrites every editor file in the act, not
just the ones you touched, so expect a large `git status` — most of it is
re-serialisation, not change.

Then, in your aeon checkout:

```
FAST=1 ./build.sh        # fast iteration
./build.sh               # the real one — run this before you land anything
```

**`FAST=1` does not check what you just authored.** It skips the effects seam gate
and the whole test lane, so a section binding the real build refuses builds green
under `FAST=1`. Run the plain `./build.sh` before you believe it.

### If a build error will not go away

**If you deleted or reverted a file and the same error keeps coming back, it is not
you.** `FAST=1` decides whether to regenerate by comparing file timestamps, and
deleting a file does not change any timestamp — so it keeps assembling the old
generated data. The fix:

```
touch games/sonic4/data/editor/effects/*.json
FAST=1 ./build.sh
```

### If the build says the re-bake failed and mentions donors

```
ERROR: the FAST re-bake failed. Run tools/regenerate-level.sh directly to see why
  (it needs the out-of-repo donors: sonic_hack + skdisasm/...)
```

That message is usually wrong about the cause. Do what it says — run
`tools/regenerate-level.sh` by hand — and read the last line. It is often something
precise like *"rasterRef 'x' names no preset document … Known ids: …"*, which
happens when you delete a preset a section still points at.

---

## 7. Tile animations are not raster bands

Two features on this tab used to share the word "band". They no longer do, and the
two names now share no word at all:

| control | what it makes |
|---|---|
| `Add blank tile animation` (toolbar) | a **tile animation** — animated background *tiles* |
| `NEW TILE ANIMATION` (panel) | the same thing, with all the options |
| `TILE ANIMATIONS (n/4)` | the list of those |
| `RASTER BAND PRESETS` | **raster bands** — the coloured stripes of §3 |
| `PRESET — <id>` → `Raster band 0` | one raster band |
| `bands` column of `RASTER TIMELINE` | raster bands, drawn |

A **tile animation** is a block of background tiles that cycles through eight
frames, so a waterfall runs or a trunk scrolls. It costs tile slots and has a hard
ceiling of four per act. It has nothing to do with palettes or screen lines.

A **raster band** repaints colours on a range of screen lines. It costs no tiles.

If you are looking for a coloured stripe, you want `RASTER BAND PRESETS`, not
anything on this list's top half.

---

## 8. Quick reference

| I want to… | go to |
|---|---|
| make the background move as the camera does | `LAYERS` → `Add` → set `Plane B (bg)` |
| see that | `Parallax preview` on the Effects toolbar |
| make a layer move on its own (clouds) | that layer's `Drift` row → `px/frame` |
| make a coloured stripe | `RASTER BAND PRESETS` → `Preset id` → `New` |
| make colours shimmer | `PRESET — <id> — CYCLES, VARIANTS` → `cycles: authored script` |
| delete a preset a section binds | unbind that section first — Aurora refuses the delete and says which |
| animate background tiles | `NEW TILE ANIMATION` |
| change which section I am editing | the section strip pinned to the top of the Effects panel |
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
