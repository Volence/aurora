# Backgrounds that move: your first ten minutes

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
| background **tiles** to animate in place | a **tile animation** | the **Tile anim** sub-tab |

The fourth one is **not** a colour effect and shares no mechanism with the second,
which is why they are on different sub-tabs. See §8.

**The right panel is three sub-tabs under one permanent strip.** The strip says
which section you are editing and what it is bound to, and never moves; the three
buttons under it choose which job you are doing. One job is on screen at a time,
and the other two are not rendered at all.

```
Editing   [ Section 0            ▾ ]        ← the strip: always there, never scrolls
scene ojz_act1_start · raster hand-authored
✓ own preset  ✓ threaded  ✗ its channels    ← can this section carry a band? §6
[ Parallax ][  Colour  ][ Tile anim ]       ← the three jobs

  Parallax                        Colour                            Tile anim
  ────────                        ──────                            ─────────
  SCENES §2                       RASTER TIMELINE                   TILE ANIMATIONS (n/4) §8
  LAYERS (n/16 per scene) §2      RASTER BAND PRESETS §3            NEW TILE ANIMATION §8
  SCENE: <id>                     PRESET: <id> §3
  SECTION ASSIGNMENT §6           PRESET: <id> · CYCLES, VARIANTS §4
                                  PRESET: <id> · MOVING ANCHORS §5
```

`PROPERTIES` sits below all three. It is a readout of whatever is selected, not
one of the jobs.

`SCENE: <id>` **arrives shut.** That is deliberate and it is one click: the layer
list above it is the thing you scroll, and an open scene form takes two thirds of
the column away from it. Open it when you need `V factor`, `Bob`, `Deform` or
`V offset`; it stays open after that.

---

## 2. Make the background drift (a parallax layer)

A **scene** is a stack of horizontal **layers**. Each layer starts at a screen line
and says how fast the foreground and background scroll from that line down. A layer
whose background factor is **lower** than the camera drifts, and that is parallax.

1. Press `Parallax`, the first of the three sub-tab buttons.
2. In `SCENES`, click a scene, or type an id in `Scene id` and press `New`.
3. In `LAYERS`, press `Add`. A layer appears at the next screen line.
4. On the new layer set `Plane B (bg)` to a fraction. `FACTOR_1_8` is a good
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
per strip inside the screen frame, with each layer's factor labelled: the only
thing in Aurora that shows what a scene's layers do. You do not have to find a
switch first, which is what everybody had to do before.

The switch is `Parallax preview` on the Effects toolbar, and the same switch is
the **View** menu's `Compose the background in the frame (parallax)`. Three things
about it that are worth knowing:

- **Turn it off and it stays off.** Aurora writes your answer down, and from then on
  it is your answer: on this tab, on the other two, and the next time you open the
  application. The "on by default" only ever speaks to somebody who has never
  touched the switch.
- **It follows you across the three jobs once you have decided.** Until you do, it
  is on for `Parallax` and off for `Colour` and `Tile anim`. If you want the
  background under your raster band, press the chip on the Colour tab. That is a
  decision, and it sticks.
- **It exists only on this tab.** No other tab draws it and no other tab's **View**
  menu offers it.

While it is on, the **arrow keys move the camera** (1px, or 16 with Shift) instead
of panning the map. That is how you judge slow parallax, which a mouse drag jumps
straight past. Dragging with the mouse, space-panning and the wheel still pan.

> The `LAYERS` list has its own scrollbar and gets the height the Parallax sub-tab has to spare, measured at 211px of a ~2,400px list, so about a card and a half. Scroll **inside** the list. Opening `SCENE: <id>` under it takes that height away again; shut it when you are done in there.

### Drag the line instead of typing the number

Every layer in the scene is drawn on the map as a horizontal line labelled
`L0 y=0`, `L1 y=32`, and so on. Those lines are the `Screen line` spinner, in the
other spelling: **grab one and drag it.** Put the cursor within about six pixels of a
line and it turns into an up-down resize cursor; that is the line telling you it is
grabbable. Press, drag, release.

- **The map does not pan while you are on a line.** The line takes the press, so the
  drag moves the layer and nothing else. Anywhere off a line, the same press pans
  the map exactly as before. The wheel still zooms, space still pans, and the arrow
  keys still move the camera. None of them are on the mouse button the line uses.
- **You can drag past the top or the bottom of the window.** The gesture follows
  your cursor off the canvas, so a layer can be put somewhere the map is not
  currently showing.
- **It is one undo.** However far you drag and however long you take, `Ctrl+Z` once
  puts the layer back where it started. A drag you release where you began writes
  nothing at all.
- **The number is the same number.** The drag runs through the spinner's own limits,
  so it cannot put a layer somewhere you could not have typed.

**When a line turns red, read the sentence beside it.** That is the layer telling
you the build will refuse it. The message says which rule and what to do, and it
appears while you are still holding the button, not after you let go.

### One layer dragged past another

Nothing stops you, and nothing quietly re-sorts your layers behind your back. Drag
`L1` above `L0` and it stays where you put it.

For most layers that is simply legal: a layer with `B split at` set to `none`
has no rule about what order it comes in.

**Where it is not legal, the line goes red and says so.** If **both** layers carry a
Plane B split, the splits have to go down the screen: two of them on one row
would be two whole-plane scroll values for one line, and the build refuses it. You
get the message the moment you drag one past the other, and it names both layers.
There are two ways out and Aurora will not choose for you: give the two layers
different screen lines, or drop one of the splits.

### Clouds that move on their own (`Drift`)

Everything above needs the camera. `Drift` does not: it is a constant sideways
speed added to one layer **every frame**, whether the camera moves or not. That is
what clouds are: Green Hill's, Angel Island's.

1. On the layer you want moving, set `Drift` to `px/frame`.
2. A number box appears, already holding `0.125`. That is Angel Island's clouds,
   the slowest speed anyone has shipped, and a good place to start.
3. Type a speed. **Negative moves left.** `1` is a pixel a frame, which is fast;
   `6` is the fastest in any of the games this engine copies.

**The box is pixels per frame. The file is in 256ths of one.** You never type the
file's number: Aurora multiplies on the way out and divides on the way back in.
If you open the scene file and see `"rate": 32` where you typed `0.125`, that is
correct.

Two things it will not let you write, and it says so under the box:

- **Zero.** In the ROM a zero drift and no drift at all are the same bytes, so the
  build refuses `0`. Set the row back to `none`, which is how you say "this layer
  does not drift". Anything that **rounds** to zero (`0.001`) is refused for the
  same reason.
- **More than ±16 px/frame.** Nothing breaks up there; it just looks absurd, and
  the build refuses it anyway.

> Four layers of one picture want the **same** number typed four times: a single
> plane cut into four strips will tear at a boundary if the strips drift at
> different speeds. There is deliberately no "apply to all": drift is per-layer,
> and hiding that would hide the tearing.

⚠ `Parallax preview` does **not** animate drift. Nothing in Aurora shows a layer
actually drifting; you see that in the game.

---

## 3. Make a raster band (a coloured stripe)

A raster band repaints part of the palette for a range of screen lines. It lives
inside a **preset**, a document that can hold several bands. There is no control
called "make a band"; you make a preset, and it comes with one.

1. Press `Colour`, the middle sub-tab, and open `RASTER BAND PRESETS`.
2. Type an id in `Preset id`: lower case, underscores, e.g. `ojz_water_tint`.
3. Press `New`. You now have a preset with `Raster band 0` in it.
4. Open `PRESET: <your id>` and fill the band in:

| field | what it means | sane first value |
|---|---|---|
| `Top` | screen line the colour turns **on** | `40` |
| `Bot` | screen line it turns **off** again | `72` |
| `S/H` | shadow/highlight mode | `off (two-fire band)` |
| `ON` | how the colour is written | `cram (raw colours)` |
| `addr` | **byte** address in CRAM. line × 32 + entry × 2 | `74` = line 2, entry 5 |
| `colours` | the colour word(s), **in decimal** | `14` |

### Two things that will catch you

**Top must be less than Bot, and both must be real screen lines (3 to 223).** Aurora
now refuses a value outside that as you type it and says which rule stopped it, so
`Top 200 / Bot 100` no longer reaches the build. Clicking a number box also selects
what is in it, so clicking `Top` and typing `40` gives `40`, not `40112`.

`colours` **is a decimal Genesis CRAM word,** not a hex code and not a swatch. The
format is `0000 BBB0 GGG0 RRR0`. Useful values:

| colour | decimal | colour | decimal |
|---|---|---|---|
| black | `0` | red | `14` |
| dark red | `6` | green | `224` |
| blue | `3584` | white | `3822` |

To mix your own: `red + green×16 + blue×256`, each of R/G/B being an even number
0 to 14. (`Authored probe (red / blue)`, shipped with the project, uses `14` and
`3584`; open it if you want a worked example.) A `0x`-prefixed hex value is
accepted too.

**There is no preview of a raster band.** Aurora draws parallax layers (§2) but not
raster bands. There is nothing here to check one against, and a wrong preview would
be worse than none. You will not see a band until the ROM runs.

---

## 4. Make a palette cycle (shimmer)

Still on the **Colour** sub-tab and still inside your preset, open
`PRESET: <id> · CYCLES, VARIANTS`.

1. Set `cycles` to `authored script (array of channels)`. A `Channel 0` appears.
2. Fill it in:

| field | what it means | sane first value |
|---|---|---|
| `line` | which CRAM line rotates. **Never 0**: line 0 is the player's | `2` |
| `first` | first entry in that line | `8` |
| `count` | how many consecutive entries rotate | `4` |
| `period` | frames between rotations, higher is slower | `8` |
| `dir` | forward / reverse. Optional; leave it absent | absent |

The other two `cycles` settings are wire-format states, not behaviours:
`keep the section's hand-authored cycle (key absent)` leaves whatever the engine
already had; `off (null)` actively turns cycling off. Pick "authored script".

### `variants`, and the line mask

`variants` is a separate thing that lives in the same card: it stages a whole palette
line shifted darker or lighter. If you open it, `lines` renders as `L0`, `L1`, `L2`
and `L3` chips.

`L0` **cannot be lit.** Line 0 is the player's palette and the engine refuses a mask
that includes it. Aurora used to let you click it and fail the build; it now refuses
the click and says why. If a hand-written file already carries bit 0, you can still
click `L0` to clear it.

If you do not need `variants`, leave the slot on
`keep hand-authored value (array ends before this slot)`.

---

## 5. Make a band follow the scenery (a moving anchor)

The raster band of §3 is nailed to the screen. `Top` and `Bot` are screen lines, so the
stripe stays exactly where it is while the level scrolls underneath it. A **moving anchor**
unpins that. You give one of the preset's four **patch channels** a point in the **level**,
and the engine turns that point into a screen line on every frame, so the boundary rides
with the scenery instead of with the camera. A **sweep** then makes the point drift up and
down on a timer, whether the camera moves or not, the way `Drift` in §2 does for a
parallax layer.

Still on the **Colour** sub-tab and still inside your preset, open
`PRESET: <id> · MOVING ANCHORS`.

**The section title carries a count once the preset uses one.** It reads 1/4, 2/4 and so
on, and it counts the channels this preset has written something for, not the channels
that are moving. A preset that uses none carries no count at all, so there is never a 0/4
on screen to read as a broken counter.

1. On `Channel 0`, set the first dropdown to `follow a world Y`. A `World Y` box appears,
   already holding a value near the middle of the screen.
2. Type the level Y you want the boundary to follow.
3. Set `Movement` to `sweep up and down`. Three more rows appear, and a strip that draws
   the sweep.

| field | what it means | sane first value |
|---|---|---|
| `Channel 0` | which channel you are writing, and how. `keep hand-authored anchor` leaves whatever the section already had, and `channel unused (null)` writes the engine's own "unused" spelling | `follow a world Y` |
| `World Y` | the point in the level the boundary follows, in whole pixels down from the top of the act | the value it arrives with |
| `Movement` | the same three states for the motion: `keep hand-authored motion`, `no motion (null)`, or a sweep | `sweep up and down` |
| `Travel` | how far the point swings. Seven fixed rungs | `±16 px (32 px of travel)` |
| `Cycle` | how long one full up and down takes. Nine fixed rungs | `8.53 s (512 ticks)` |
| `Start at` | where in the cycle it begins, in 256ths of a cycle. Optional, and it arrives absent | leave it on `absent · set` |

`Travel` and `Cycle` are dropdowns rather than number boxes, and that is the engine's
shape rather than a simplification: both are powers of two, so there are seven amplitudes
and nine periods and nothing at all in between. A value you cannot pick here is a value
you could not have shipped.

**Those two numbers are two different measurements.** In `±16 px (32 px of travel)` the
first is how far the point goes from its `World Y` in one direction, and the second is the
whole swing, top to bottom, peak to peak. The second is the one every other number on this
page is measured against, the band check below included.

### `World Y` is whole pixels, and it is not `Drift`'s number

⚠ `Drift` in §2 is the one row on this tab where the box and the file hold different
numbers: you type px/frame and Aurora writes 256ths on the way out. `World Y` does not do
that. The box, the file and the engine all hold the same whole pixel of level space, and
the row says so with `px, level space` printed beside it. A world Y multiplied by 256 out
of that habit lands 256 times down the level, saves and validates without a complaint, and
the band then simply never appears.

### What Aurora will not let you write

- A `World Y` that is not a whole number, or one outside 0 to 65535. The engine's field is
  16 bits wide.
- `32767` typed into `World Y`. That is the engine's own "this channel is unused" value,
  and two spellings of the same thing is one too many: pick `channel unused (null)`.
- A `Start at` outside 0 to 255. That range is one whole cycle.
- A channel whose earlier neighbour you have not written yet. The two settings are
  positional lists that cannot have a hole in them, so Aurora refuses the change and names
  the channel to write first.

**One thing it warns about instead of refusing:** a `Movement` on a channel with no
`World Y`. That saves, aeon's build accepts it, and it shows nothing whatsoever. The
sentence Aurora puts under the control is the schema's own.

**And one nothing warns about at all:** a sweep is only read by a game whose engine
switches anchor motion on. The game this project builds does; another game on this engine
need not, and there an authored sweep is installed and never read. That is a silent no-op
rather than an error.

### ⚠ Aurora cannot tell you that a sweep fits

aeon publishes the screen band each channel's boundary is confined to, and Aurora measures
your `Travel` against it. **That check runs in one direction only.**

If the travel is wider than the band, it is certain: the sweep cannot stay inside it
whatever the camera does. A warning appears under `Travel` with both numbers, with what
happens at each end of the band, and with the remedy, which is a smaller `Travel`.

If the travel is not wider than the band, **Aurora says nothing, and nothing is not a
clearance.** The screen line the boundary lands on is your world Y minus the camera's Y,
so where inside the band the sweep actually sits is decided by where the camera happens to
be, which nothing can know while you are still authoring. There is no green tick beside
`Travel` and there is not going to be one. Aurora can prove a sweep is too wide; it can
never prove one is safe.

aeon's own build runs the same test across the whole act, so an over-wide sweep fails
there too. It is the same one-directional test rather than a second opinion, so a green
build is not the clearance either.

> A sweep with no warning under it has not been approved. It has only failed to be caught. If it matters exactly where that boundary lands, the thing that settles it is running the ROM and looking.

Two consequences worth having:

- On a channel whose band is wider than the widest rung on the ladder,
  `±64 px (128 px of travel)`, no warning can ever appear, whatever you pick. Silence there
  is guaranteed rather than earned, and it is the same silence a well-judged sweep gets.
- **The two ends of the band do not behave alike**, which is why the warning names both.
  Past the bottom of the band the record is not emitted at all: no boundary is drawn
  anywhere and the band vanishes for that frame rather than pinning to the bottom line.
  Above the top of the band it is still emitted, pinned onto the top line, and stays
  visible. The warning calls that second one "clamped up", which is about the line number
  going up and not about the boundary rising up the screen. A sweep one rung too wide
  therefore reads as a band flickering out once a cycle,
  which looks like a rendering bug rather than like an amplitude somebody chose.

### The strip that draws the sweep, and what it does not prove

`sweep up and down` adds a small animated strip to the bottom of the channel. It is the
only thing in this editor that runs on a timer. It draws one full cycle of the sweep you
authored: the `World Y` as the centre line, the peak excursion as a band either side of
it, the curve itself, and a dot moving along the curve in real time at the `Cycle` you
picked. `Pause` stops it, and pausing removes the loop rather than idling it, so a stopped
strip reads `preview paused` and costs nothing at all.

**It is not a picture of your band on a screen**, and that is structural rather than
unfinished. A band carries `Top`, `Bot`, `S/H` and `ON` and no channel number, so the
document never says which band a channel drives. A strip that drew a stripe sliding up and
down a screen would have had to invent that link, and would be a picture of a program your
file does not describe.

**Nothing in Aurora has ever seen one of these move.** The strip is the arithmetic your two
rungs mean, drawn faithfully. It is not a frame from an emulator, and it is not an answer
to the question above that Aurora cannot answer.

Two smaller things about it, both deliberate:

- **Every strip is drawn to the same scale**, the tallest rung on the ladder, so
  `±1 px (2 px of travel)` really does look nearly flat beside `±64 px (128 px of travel)`.
  Letting each sweep fill its own strip would have drawn all seven rungs the same picture,
  which is the `Travel` control lying about its own value.
- **When it cannot draw the curve it draws nothing.** A file written by hand can carry a
  value that is not on either ladder; the dropdowns here cannot produce one. If one ever
  reaches the strip, it paints an empty frame rather than a plausible looking wrong curve.

A preset that carries moving anchors owes aeon a generated chooser for that key as well as
for its bands, which is condition **3** in §6.

---

## 6. Bind it to a section

Two separate bindings, now on two different sub-tabs, both acting on **the section
named in the strip at the top**:

- **the scene** → `SECTION ASSIGNMENT`, at the bottom of the **Parallax** sub-tab.
- **the raster preset** → the `Section <n>` dropdown at the bottom of
  `RASTER BAND PRESETS`, on the **Colour** sub-tab.

The Effects tab has a **section strip** pinned to the top of the panel, above the
three sub-tab buttons. It stays put while the rest of the column scrolls and while
you change job, so it is on screen when you reach either binding.
It names the section you are editing under `Editing`, prints what that section is
bound to (`scene <id> · raster <id>`), lets you change which section without leaving
the tab, and states the raster-wiring conditions as three rows (below). It is the
same number the Layout tab's `SECTIONS` grid sets: one section, two tabs.

### Which section can carry a raster band?

This is a fact about **the level's own data**, not a limit of the editor, and Aurora
derives it per project rather than shipping a list.

A section's effects come from a `preset()` record in aeon's effects library, and
`Sec.sec_effects` is a **pointer**, so several sections can point at the same record.
Giving a section-keyed raster band to a record that two sections share would give the
band to **both** of them, so aeon's build refuses it.

> A section can carry an editor-authored raster band **only if it binds a preset that no other section binds.**

In `ojz act1` today that is sections **0 to 5**: each has its own preset. Sections
**6, 7 and 8 all share** `OJZ_Preset_Plain`, so none of the three can have one until
a programmer splits that record. Aurora says so at the control, naming the
sections that share and what would happen.

There are two further steps behind that one, and Aurora keeps all three apart
because conflating them is how the wrong answer got published twice in one day:

| condition | what it means | what clears a `✗` |
|---|---|---|
| **1**, `own preset` | no other section binds this section's preset record | a programmer **splits a preset record** |
| **2**, `threaded` | some `preset()` also threads the raster chooser on this index | **one line of aeon** |
| **3**, `its channels` | the preset bound here today owes a generated chooser for every **other** key it carries (`cycles`, `variants`, the moving anchors of §5), and has one | **one line of aeon**, on a different chooser |

The strip prints these as **three rows**, each with its own `✓` / `✗` / `?`, because
which one you fail decides what you do next, and a single verdict cannot tell you
which. In `ojz act1` today, condition 1 holds for sections 0 to 5 and condition 2
for section 5.

**Two ticks used to be the whole answer, and it was wrong.** Conditions 1 and 2 can
both read `✓` while the build still refuses, because one `rasterRef` binds the
**whole preset document**: a preset that also carries `cycles` owes a second
generated chooser beside the raster one. That is condition 3, and it is about the
document you have bound **today**, so it re-derives the moment you change the
binding.

A binding on a section that owns its preset but is not threaded writes the key,
and aeon's canonical build refuses it by name ("no preset threads
`ojz_act1_sec_raster(sec: N)`") until that line is added.

**Aurora derives these facts from aeon's own files on every load**: the act
descriptor and the effects library. It prints the first two sets act-wide, on the
line under the rows. The two files are read separately and degrade independently:
if only one is unreadable, that condition draws `?` and says
`could not read <file>`, and the others still answer.
Nothing here is a list somebody wrote down, so the answer changes on its own when
aeon changes the level. It does **not** stop you binding: whether a section is
wired is aeon's fact to change, and a lock built on a snapshot would be wrong the
day they change it. If Aurora cannot read those files it says so, and still lets
you bind.

Scenes have no such restriction: bind a scene to any section.

---

## 7. Save, and build

**Ctrl+S.** There is no Save button on a level tab; the dot on the tab title is the
only sign you have unsaved work. **A save writes a file only when that file's
meaning changed.** Every JSON document Aurora writes is compared against the one
already on disk as a parsed value, so indentation, key order and the trailing
newline do not count as a change, and a document you did not touch is left alone.
So read your `git status` after a save. It is the work you actually did, and a
file in it you never opened is worth opening rather than scrolling past.

One thing that is bigger than you expect, and it is the diff and not the file
count: a document whose meaning has changed is rewritten in full canonical form,
so it can pick up formatting aeon's own writers do not emit.

Then, in your aeon checkout. **The re-bake is a step of this path, not a recovery
from an error:**

```
tools/regenerate-level.sh   # re-bake the level tree from what you just saved
./build.sh                  # the real one: run this before you land anything

FAST=1 ./build.sh           # the iteration loop: re-bakes for you, skips the gates
```

**Why a save on its own is not enough.** aeon's generated level tree is a
committed artifact (`games/<game>/prebuild.sh` is a documented no-op), so nothing
rebuilds it just because you saved. Both builds ask `tools/level_staleness.py`
whether the committed tree was baked from the editor sources that are there now, and
after any save the answer is no. What happens next is the only difference between
the two commands:

- `./build.sh` **refuses, and it refuses before it assembles anything.** So a red
  build here is not a verdict on what you authored: nothing downstream has looked
  at it yet. The message names which check fired, lists your files by name, and
  gives `tools/regenerate-level.sh` as the remedy. Re-bake and run it again.
- `FAST=1 ./build.sh` **runs the re-bake for you** and prints how long it took. That
  is the loop's whole point, and it is why the fast path needs no separate step.

**What the fast path still will not tell you.** It skips the whole test lane and every
gate that has to read the listing the build just emitted, so a green FAST run is not
a landing. It does run one check first, the editor-scene binding seam read out of
the source, so binding a preset to a section nothing threads now fails in the loop
instead of at landing. What it cannot answer is whether your effect actually
reached the ROM: the reachability evidence is minted by the build it runs before.
Run the plain `./build.sh` before you believe it.

`touch` **is not a shortcut past this.** The gate has a second arm that reads no
timestamps at all. It compares a content stamp of your editor sources against the
one the last re-bake wrote, so a delete, a rename or a revert moves the answer
whatever the mtimes say. Touching a file silences only the timestamp arm, and it
lights that arm again in the process; the tree stays stale and the same error comes
back. Re-bake.

### If a build error will not go away after you reverted

**Re-bake. It is the reverting case, not a stuck build.** Removing a document the
way a person reverts (`rm`) is exactly what the content-stamp arm exists for: an
added, removed, renamed or modified editor source all move the answer, so
`tools/regenerate-level.sh` clears the generated module that still carries the
deleted document's data. There is nothing to touch and nothing to force.

### If the re-bake itself fails

**Read the re-bake's own output. The build prints it in full, and it is the part
that names your file.** The failing line is usually precise: "rasterRef 'x' names
no preset document … Known ids: …", which is what you get when you delete a preset
a section still points at. Missing out-of-repo donors is the other cause, and the
build says so as a footnote, after its output; suspect it only when nothing above
names a file or an id.

---

## 8. Tile animations are not raster bands

Two features on this tab used to share the word "band". They no longer do: the two
names share no word, **and they are on different sub-tabs**, so they can no longer
be read as one list.

| control | sub-tab | what it makes |
|---|---|---|
| `Add blank tile animation` (toolbar) | any (see below) | a **tile animation**: animated background **tiles** |
| `NEW TILE ANIMATION` | Tile anim | the same thing, with all the options |
| `TILE ANIMATIONS (n/4)` | Tile anim | the list of those |
| `RASTER BAND PRESETS` | Colour | **raster bands**: the coloured stripes of §3 |
| `PRESET: <id>` → `Raster band 0` | Colour | one raster band |
| `bands` column of `RASTER TIMELINE` | Colour | raster bands, drawn |

`Add blank tile animation` is on the toolbar, which is on screen whichever job you
are doing, so pressing it from `Parallax` brings the **Tile anim** sub-tab
forward, opens the list and scrolls to the animation it just made. The tab
changing under you is the click working.

A **tile animation** is a block of background tiles that cycles through eight
frames, so a waterfall runs or a trunk scrolls. It costs tile slots and has a hard
ceiling of four per act. It has nothing to do with palettes or screen lines.

A **raster band** repaints colours on a range of screen lines. It costs no tiles.

If you are looking for a coloured stripe, you want the **Colour** sub-tab, not the
**Tile anim** one.

---

## 9. Quick reference

| I want to… | go to |
|---|---|
| make the background move as the camera does | `Parallax` → `LAYERS` → `Add` → set `Plane B (bg)` |
| see that | `Parallax preview` on the Effects toolbar |
| make a layer move on its own (clouds) | that layer's `Drift` row → `px/frame` |
| make a coloured stripe | `Colour` → `RASTER BAND PRESETS` → `Preset id` → `New` |
| make colours shimmer | `Colour` → `PRESET: <id> · CYCLES, VARIANTS` → `cycles` → `authored script (array of channels)` |
| delete a preset a section binds | unbind that section first: Aurora refuses the delete and says which |
| make a stripe follow the scenery instead of the screen | `Colour` → `PRESET: <id> · MOVING ANCHORS` → `Channel 0` → `follow a world Y` |
| make that point move on a timer | that channel's `Movement` row → `sweep up and down` |
| animate background tiles | `Tile anim` → `NEW TILE ANIMATION` |
| change which section I am editing | the section strip pinned to the top of the Effects panel |
| change which job I am doing | the three buttons under the strip: `Parallax` / `Colour` / `Tile anim` |
| find `V factor`, `Bob`, `Deform`, `V offset` | `Parallax` → open `SCENE: <id>` (it arrives shut) |
| use a scene on a section | pick the section, then `SECTION ASSIGNMENT` |
| save | Ctrl+S |
| open this page | `? Guide` on the Effects toolbar |

### Things Aurora refuses while you author, so the build does not have to

- A `Top` or `Bot` outside screen lines 3 to 223.
- `Top` at or below `Bot` on the same raster band.
- Lighting `L0` in a `variants` line mask.
- A `colours` list that is empty or holds a non-integer.
- A `Drift` of `0`, or anything that rounds to it, or one past ±16 px/frame.
- A `World Y` that is fractional, outside 0 to 65535, or the unused sentinel `32767`.
- A `Start at` outside 0 to 255.
- A moving-anchor channel written while an earlier channel is still unwritten.

### Things the build can still refuse

- Binding a raster preset to a section aeon has not threaded yet (§6). Aurora warns
  at the control and does not block it, because that is aeon's fact to change.
- A band whose colour is invisible against the palette it repaints. Nothing anywhere
  catches that: not this panel, not the schema, not the build.
- Overlapping bands that share CRAM colours, or two bands firing on one screen line.
  Aurora warns; it does not refuse, because a nested band over a disjoint colour span
  is legal and walling it would refuse programs the engine builds.
- A sweep whose `Travel` is too wide for its channel's band (§5). Aurora warns at the
  control; the silence on every other sweep is not a clearance and never becomes one.

Deleting a preset a section still binds used to be on this list. It is not any more:
Aurora refuses the delete, names the sections that bind it, and tells you to set them
back to `Hand-authored raster` first.
