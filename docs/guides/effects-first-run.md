# Backgrounds that move — your first ten minutes

You are on the **Effects** tab of a level. This page answers, in order, the questions
a person actually asks here on their first day. It is written from a walkthrough by
someone who had never opened this tab (`docs/reviews/2026-09-02-effects-cold-walkthrough.md`);
every heading below is a question that reader genuinely got stuck on.

---

## 1. What does this tab do?

Three separate things, which look similar and are not:

| you want | you build | where |
|---|---|---|
| the background to slide past at a different speed from the ground | a **scene** with **layers** | `SCENES` → `LAYERS`, top of the right panel |
| a horizontal stripe of the screen to change colour (water, heat haze, a tinted sky) | a **raster band**, inside a **preset** | `RASTER BAND PRESETS`, bottom of the panel |
| the same colours to rotate, so water shimmers | a **palette cycle**, inside the same preset | `PRESET — <id> — CYCLES, VARIANTS` |

There is a fourth thing on this tab, `BG ANIMATION BANDS`, which is **not** any of
these. See §7 — read it before you click anything called "band".

The right panel is one long column, roughly eight screens tall, in this fixed order:

```
SCENES                       ← pick / create a scene
SCENE — <id>                 ← settings for the whole scene
LAYERS (n/16 per scene)      ← the parallax strips        ⟵ §2
SECTION ASSIGNMENT           ← which scene this section uses  ⟵ §5
RASTER TIMELINE              ← a picture of bands + layers
BG ANIMATION BANDS (n/4)     ← NOT raster. §7
NEW BAND                     ← NOT raster either. §7
RASTER BAND PRESETS          ← raster bands live here     ⟵ §3
PRESET — <id>                ← the bands in one preset
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

> *at 1/8 of camera speed: its 512px picture starts over every 4096px of camera
> travel, 1 time across this act's 5824px*

Reference points: `FACTOR_1` = moves with the camera (that is the ground);
`FACTOR_1_2` = half speed, clearly behind; `FACTOR_1_16` = a distant sky;
`FACTOR_LOCKED` = does not move at all.

`Plane A (fg)` is the level itself. Leave it at `FACTOR_1` unless you know why not.

### See it
Nothing draws until you ask. **`View ▾` → tick `Compose the background in the frame
(parallax)`**, and tick `Screen frame (320x224)` too. The canvas then draws the real
background per strip with each layer's factor labelled. This is off by default and
the Effects tab does not mention it; turn it on the first time you open the tab and
leave it on.

> The `LAYERS` list is a very short scrolling window inside an already-scrolling
> panel. If you can only see one layer, scroll **inside** the list.

---

## 3. Make a raster band (a coloured stripe)

A raster band repaints part of the palette for a range of screen lines. It lives
inside a **preset** — a document that can hold several bands. There is no control
called "make a band"; you make a preset, and it comes with one.

1. Scroll to `RASTER BAND PRESETS`. **The card opens with several screens of design
   notes for programmers. Scroll past them.** (What matters in them is §6 below.)
2. Type an id in `Preset id` — lower case, underscores, e.g. `ojz_water_tint`.
3. Press `New`. You now have a preset with `Band 0` in it.
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

**`Top` must be less than `Bot`, and both must be real screen lines (3–223).** Nothing
in this panel checks that. `Top 200 / Bot 100` is accepted in silence and produces
four separate build errors.

**Clicking a number field does not select what is in it.** Click `Top`, type `40`,
and you get `40112`. Select the contents first (⌘/Ctrl-A, or triple-click).

**`colours` is a decimal Genesis CRAM word,** not a hex code and not a swatch. The
format is `0000 BBB0 GGG0 RRR0`. Useful values:

| colour | decimal | colour | decimal |
|---|---|---|---|
| black | `0` | red | `14` |
| dark red | `6` | green | `224` |
| blue | `3584` | white | `3822` |

To mix your own: `red + green×16 + blue×256`, each of R/G/B being an even number
0–14. (`Authored probe (red / blue)`, shipped with the project, uses `14` and `3584`
— open it if you want a worked example.)

**There is no preview.** Aurora does not draw raster bands. You will not see this
until the ROM runs.

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

### `variants`, and the one click that will break your build

`variants` is a separate thing that lives in the same card: it stages a whole palette
line shifted darker or lighter. If you open it, `lines` renders as `L0 L1 L2 L3`
chips.

**Never light `L0`.** Line 0 is the player's palette and the engine refuses a mask
that includes it. Aurora will let you click it, will not warn you, and the build
fails with:

```
[Error] variant: lines mask 15 selects line 0 (the character's) — use bits 1-3
```

If you do not need `variants`, leave it on *every slot keeps its hand-authored value*.

---

## 5. Bind it to a section

Two separate bindings, at opposite ends of the panel, both acting on **the currently
active section**:

- **the scene** → `SECTION ASSIGNMENT`, just under `LAYERS`.
- **the raster preset** → the `Section <n>` dropdown at the bottom of
  `RASTER BAND PRESETS`.

**To bind a different section you must change the active section, and you do that on
the Layout tab.** Layout → click the number in `SECTIONS` → back to Effects. The
Effects tab has no section picker.

### Which section can you bind a raster preset to?

**Today: section 5, and only section 5.** Binding any other section writes the key,
and the engine has nothing wired to read it — so the band never appears, and the
**canonical build refuses the tree**:

```
sections [0] bind a rasterRef that no preset threads — the generator emits the
binding and nothing reads it, which presents to the author as an assignment that
did nothing
```

Wiring a second section is a one-line change in aeon by a programmer, not something
you can do here. Scenes have no such restriction — bind a scene to any section.

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

## 7. "Band" means two different things. Read this before clicking one.

| control | what it makes |
|---|---|
| `Add blank band` (toolbar) | a **BG animation band** — animated *tiles* |
| `NEW BAND` (panel) | the same BG animation band, with all the options |
| `BG ANIMATION BANDS (n/4)` | the list of those |
| `RASTER BAND PRESETS` | **raster bands** — the coloured stripes of §3 |
| `PRESET — <id>` → `Band 0` | one raster band |
| `bands` column of `RASTER TIMELINE` | raster bands, drawn |

A **BG animation band** is a block of background tiles that cycles through eight
frames, so a waterfall runs or a trunk scrolls. It costs tile slots and has a hard
ceiling of four per act. It has nothing to do with palettes or screen lines.

A **raster band** repaints colours on a range of screen lines. It costs no tiles.

If you clicked `Add blank band` looking for a raster band — that is the commonest
first mistake here — press **Undo** immediately, and go to `RASTER BAND PRESETS`.

---

## 8. Quick reference

| I want to… | go to |
|---|---|
| make the background drift | `LAYERS` → `Add` → set `Plane B (bg)` |
| see the drift | `View ▾` → `Compose the background in the frame (parallax)` |
| make a coloured stripe | `RASTER BAND PRESETS` → `Preset id` → `New` |
| make colours shimmer | `PRESET — <id> — CYCLES, VARIANTS` → `cycles: authored script` |
| animate background tiles | `NEW BAND` |
| use a scene on a section | Layout tab → pick the section → Effects → `SECTION ASSIGNMENT` |
| save | Ctrl+S |

### Things Aurora will let you do that the build refuses

- `Top ≥ Bot`, or a screen line outside 3–223, on a raster band.
- `L0` lit in a `variants` line mask.
- Binding a raster preset to any section other than 5.
- Deleting a preset a section still binds.

None of these are flagged while you author them. If a build goes red right after you
touched this tab, check these four first.
