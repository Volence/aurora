# Effects / parallax / raster — cold walkthrough, 2026-09-02

**What this is.** A first-time-user walkthrough of Aurora's Effects tab, run under the
rule that the reader may read **only the running application** — no `docs/`, no
component source, no specs, no lane log. Confusion is the deliverable. Where I broke
the rule I say so, in place, and name the file.

**Instrument.** Aurora built from this worktree with `VITE_AURORA_DEBUG=1`, run under
`xvfb-run` at 1400×872 CSS px, driven over CDP. Project: a writable extract of
`aeon` `origin/master` (`8876459e`) — never `../aeon`. Build:
`FAST=1 ./build.sh` in that copy. **No emulator was touched.**

**Headline.** All five steps completed. `FAST=1` goes green with a raster band, a
drifting layer, a palette cycle and both bindings authored. The canonical `FAST=0`
build **refuses the result**, and the walkthrough produced **five distinct
build-time failures** — one of which is, literally, *the same error repeating after
you have already deleted the thing that caused it*.

**Counts.** 21 confusions (a) · 5 distinct build failures (b) · 7 apparent duplicates
(c) · 9 things expected and not found (d).

---

## Timeline

| time (UTC) | what |
|---|---|
| 18:34 | app boots, Home tab |
| 18:35:39 | Effects tab opened — start of the clock that matters |
| 18:37:05 | first attempt at "a raster band" — **wrong feature** |
| 18:39:04 | found the actual raster-band control |
| 18:41 | band authored (top/bot/addr/colours) |
| 18:41:55 | palette cycle authored |
| 18:42:46 | drifting layer added |
| 18:43:42 | both bindings made |
| ~18:44 | guessed Ctrl+S |
| 18:45:53 | **first build error** |
| 18:46:14 | control build of untouched tree: green |
| 18:48:57 | the repeat-error discovery |
| 18:50:59 | build error reproduced from one UI click |
| 18:53:34 | canonical `FAST=0` build refuses the tree |
| 18:55:09 | back to green |

≈20 minutes end to end, by a reader who could grep the filesystem, read every
`title=` attribute programmatically, and knew git. A person cannot do any of that.

---

## (a) Every point I did not know what to do next

**a1 — 18:34, Home. There is no help of any kind.**
I searched the whole DOM for any element whose text, `title` or `aria-label` matched
`help|guide|docs|manual|tutorial|?`. **Zero hits, in the entire application.** There
is no "?" button, no Help menu, no first-run card, no link to a README. The Home tab
has exactly two things: `Open Project…` and a list of recent projects. Everything I
learned afterwards, I learned by clicking things to see what they did.

**a2 — 18:35, no way to start a fresh act.**
The brief says "from a fresh act". `LEVELS` lists one act and offers no `+`. The
only `+`-looking glyph top-left is the Aurora logo (`aria-label="Aurora"`), which
does nothing. I gave up after ~40 s and worked in the existing act, which already
had two scenes and three raster presets in it — so I never got the clean-slate view
a genuinely new user gets. **Logged as a wall, not solved.**

**a3 — 18:35:39, the Effects tab shows nine unfamiliar nouns and no orientation.**
On arrival: a toolbar with `Promote from tile 32` and `Add blank band`; a right
panel starting `SCENES → SCENE — OJZ_ACT1_DEPTH (Name, V factor, V center, V offset,
Bob, Transition, Deform fg, Deform bg, V deform) → LAYERS (5/16 PER SCENE)`.
Nothing says what a *scene* is, what a *layer* is, or which of these produces the
three things I was asked for. There is no one-line "this tab does X" anywhere.

**a4 — 18:36, "raster band": three candidates, no way to choose between them.**
`Add blank band` (toolbar) · `Mark Band` (left icon rail) · `Screen line` on each
layer. All three read like "a horizontal band on the raster". I picked the toolbar
button because it was the only one with the word *band* and a visible label.

**a5 — 18:37:05, I picked wrong, and the app changed my project without telling me what kind of thing it made.**
`Add blank band` created a **BG animation band** — a tile-animation object with
banks and frames — not a raster band. The toast said only *"Band 1 added — selected
below, and lit on the map"*. The word "band" in that sentence means something
completely different from the word "band" in `RASTER TIMELINE` two cards above it.
It also created a state the panel immediately called out as broken:
*"Licensed, but no background cell draws its slots."*

**a6 — 18:37, Undo does not fully undo.**
Before the add, the toolbar read `Promote from tile 32`. After the add, `tile 33`.
After **Undo**, the band count went back to `1/4` — and the toolbar still read
`Promote from tile 33`. The tab also stayed dirty (•) with the project back at its
original state. So after undoing, the toolbar is advertising an operation from the
world I just left.

**a7 — 18:37:49, `NEW BAND` is a second, richer door to the thing I did not want.**
Expanding `NEW BAND` gave `Cols / Rows / Driver / Rate shift / Banks / From existing
tiles` — the full form for the same BG-animation band the toolbar button makes in
one click with no options. Nothing links the two.

**a8 — 18:38, the panel is eight screens tall and I had to scroll to discover its shape.**
Measured on the running app: the Effects right panel is **727 px visible against a
6008 px scroll height** — 8.3 screens. There is no map of it, no section index, no
sticky headers. Its order is: SCENES · SCENE · LAYERS · SECTION ASSIGNMENT · RASTER
TIMELINE · BG ANIMATION BANDS · NEW BAND · RASTER BAND PRESETS · PRESET — *id* ·
PRESET — *id* — CYCLES, VARIANTS · PROPERTIES. I only learned that by enumerating
headings in the DOM. **This is the first point at which I used a capability a user
does not have.**

**a9 — 18:38, the layers list is a 129 px window onto a 2466 px list.**
Nested inside the panel. Nineteen screens of content in one sixth of one screen. To
edit layer 5 of 6 I had to scroll an inner pane inside an outer pane; the two scroll
independently and neither is labelled.

**a10 — 18:39, `RASTER BAND PRESETS` opens with 8,465 characters of engineering prose before the first control.**
Measured: from the heading to the first input is **8,465 characters** — about
seven minutes of reading, in a 285 px-wide column. It is written to a programmer:
it cites `tools/effects_gen.py`, `raster_dsl.emp`, aeon commit SHAs, pytest test
names (`test_the_bound_sections_are_exactly_the_threaded_ones`), and `NO_LINT=1`.
Everything in it is true and much of it is important — including *"binding any
section other than 5 makes the canonical build refuse"*, which is the single fact
that later cost me a red build. **It is in the worst possible place**: an author
looking for a button scrolls past it, and an author who reads it is reading a design
memo instead of authoring.

**a11 — 18:39, so where do I actually make a raster band?**
The answer turned out to be: type an id into `Preset id` and press `New`. Nothing
says a *preset* is how you get a *band*; the word "band" does not appear in
`Preset id` or `New`. I found it by scrolling to the bottom of the card past the
prose. Elapsed from entering the Effects tab: **3 min 25 s**.

**a12 — 18:40, `colours` wants a decimal integer and there is no colour picker.**
A new preset comes with `colours = 0`. The helper line under it says *"1 colour"* —
so the same word means both the list and its length. To find out what a colour looks
like I opened the shipped `Authored probe (red / blue)` preset and read its numbers:
`14` and `3584`. Those are Genesis CRAM words in decimal. An author must know the
BBB GGG RRR packing **and** convert it to base 10, by hand, in an application that
has a full palette editor one tab away. Nothing offers a swatch.

**a13 — 18:40, `addr = 74` and no idea what that is.**
The tooltip (which I only saw because I dumped `title` attributes) says *"CRAM BYTE
address the colours are written to"*. On screen the label is three letters. There is
no "palette line 2, entry 5" rendering of it anywhere, though the panel elsewhere is
happy to render a line mask as `L0 L1 L2 L3` chips.

**a14 — 18:41, number fields do not select on click.**
Clicking `Top` (value `112`) and typing `40` gives `40112`. I ended up with
`Top = 40112`, `Bot = 72128` — both far outside the documented `0..511` — and the
panel showed **no error, no red, no warning**. See b5.

**a15 — 18:41:55, `cycles`, `variants` and the three-state selects.**
`cycles` offers *keep the section's hand-authored cycle (key absent)* / *off (null)*
/ *authored script (array of channels)*. The distinction between "absent" and "null"
is a wire-format distinction surfaced raw in an author's dropdown. It is explained,
at length, in a tooltip that cites `docs/AURORA_EFFECTS_SCHEMA.md section 7.2,
ruling Q2` — a document not reachable from the app.

**a16 — 18:42:46, I added a layer and could not tell whether "drifting" meant this.**
`Add` under LAYERS produced Layer 5 at screen line 192 with `fa=FACTOR_1,
fb=FACTOR_1_2`. Whether that is "a drifting layer" or whether "drifting" meant the
BG-animation band's `scrolls left · 1px per 4 frames` is not answerable from the UI:
both are motion, both are called neither. I chose the parallax reading and set
`fb=FACTOR_1_8`.

**a17 — 18:42, and then the single best control in the panel.**
Setting `fb` rewrote its own tooltip to: *"at 1/8 of camera speed: its 512px picture
starts over every 4096px of camera travel, 1 time across this act's 5824px"*. That
is exactly the sentence an author needs — the engine value translated into what
happens in **this act**. It is the model the rest of the panel should copy. It is
also invisible unless you hover.

**a18 — 18:43, I had been editing a scene the section does not use.**
`SECTION ASSIGNMENT` showed `Section 0 → ojz_act1_start`, while the SCENE card I had
spent eight minutes in was `ojz_act1_depth`. Nothing in the SCENE card says which
sections use it. Nothing warned me.

**a19 — 18:43, "bind them to a section" — but which section, and where?**
There are two per-section bindings and they are ~4000 px apart in the same column
(`SECTION ASSIGNMENT` for the scene, and a second `Section 0` select at the bottom of
`RASTER BAND PRESETS` for the raster). Both are hard-wired to **section 0** — the
*active* section — and the Effects tab has no section picker. To bind section 5 you
must go to the Layout tab, click 5 in the SECTIONS grid, and come back. Nothing says
so.

**a20 — 18:44, how do I save?**
There is **no Save control on the level tab**. The toolbar has FG / BG / View / Undo
/ Redo. The tab shows a dirty dot. I guessed Ctrl+S; it worked; nothing confirmed it.
(The Sprite tab, by contrast, has a visible `Save` button — so the app is
inconsistent with itself.)

**a21 — 18:53, I expected to see my drifting layer and could not.**
The Effects tab draws layer boundaries as labelled lines but not the background
itself. The composite preview I wanted exists — `View ▾ → Compose the background in
the frame (parallax)` — **off by default, in a menu the Effects tab never mentions**.
Turning it on immediately drew per-strip parallax with `L1 FACTOR_1_16 (1/16) x=+0`
labels and my new `L5 FACTOR_1_8`. I found it only while auditing the View menu for
duplicates, 10 minutes after I needed it.

---

## (b) Build-time errors, verbatim

Setup errors (`SIGIL_BUILD` unset, missing suite root, donor dirs) are **plumbing and
excluded**, per the brief.

**Control first.** An untouched extract of the same `origin/master`, built the same
way, is **green** (`BUILD_RC=0`, 18:46:14) and passes
`tools/test_effects_seam_gate.py` **30/30**. Every failure below is attributable.

---

### b1 — an authoring click the panel's own tooltip says is illegal

**Repro.** Effects → `RASTER BAND PRESETS` → select a preset → `PRESET — <id> —
CYCLES, VARIANTS` → `variants` = *array* → `Slot 0` = *author (object)* → click the
`lines` chip → click the **`L0`** chip. Ctrl+S. `FAST=1 ./build.sh`.

```
error: native build (sonic4 plain): build_program: 1 error(s);
  [Error] variant: lines mask 15 selects line 0 (the character's) — use bits 1-3 @ Span { source: SourceId(8), start: 2800, end: 2906 }
```

**Could the editor have known?** It already does. The tooltip **on the `L0` button
itself** reads: *"Line 0 is the character's and the mask's bit for it must be clear."*
The button is not disabled, does not turn red, and produces no message. One click,
zero feedback, red build.

**And the message cannot be walked back to the UI.** It names no preset id, no
section, no field — only `SourceId(8), start: 2800`, a byte offset into a generated
file the author has never opened. There is no path from that string to the `L0` chip.

---

### b2 — the same error again after you have deleted the thing that caused it  ★

This is the owner's sharpest complaint, reproduced exactly.

**Repro.**
1. Author the illegal state above, save, build → fails with the error in b1.
2. **Revert it the way a person reverts**: delete the preset document.
   `rm games/sonic4/data/editor/effects/presets/cold_test_band.json`
3. `FAST=1 ./build.sh` →

```
  [Error] variant: lines mask 15 selects line 0 (the character's) — use bits 1-3 @ Span { source: SourceId(8), start: 2800, end: 2906 }
BUILD_RC=1
```

4. Run it **again** → byte-identical error again.

The file is gone. The error is about its contents. It comes back as many times as you
run the build.

**Why.** `FAST=1`'s re-bake trigger is *"newest editor source mtime vs newest
generated file mtime"*. **Deleting a file lowers no mtime**, so the tree reads
"fresh", `effects_gen` never re-runs, and the stale
`data/generated/ojz/act1/effects_scenes.emp` — which still contains
`pub data EditorVariant_..._0: pal_variant = variant(shift_r: 3, lines: 11)` — is
assembled again. The escape is `touch` on any editor file, which nothing tells you.

I hit this twice before I understood it, on two different documents. *"Some seem like
they're just a repeat of things"* is not a perception problem.

---

### b3 — a dangling `rasterRef`, and a build message that blames the wrong thing

**Repro.** Bind a raster preset to a section, then delete the preset (the editor's own
`Delete` button does this with no confirmation). Build.

What `FAST=1 ./build.sh` prints:

```
FAST: re-baking the level tree (tools/regenerate-level.sh)...
ERROR: the FAST re-bake failed. Run tools/regenerate-level.sh directly to see why
  (it needs the out-of-repo donors: sonic_hack + skdisasm/AEON_SKDISASM_DIR).
```

That sends the reader after donor directories. The **actual** message, only visible if
you run the re-bake by hand, is excellent and completely different:

```
effects_gen: REFUSED — section_0.meta.json: rasterRef 'cold_test_band' names no preset
document in .../data/editor/effects/presets — a rasterRef binds one Aurora-authored
preset document's raster program, so it cannot name a hand-authored `.emp` program.
Known ids: authored_probe, ojz_sec3_shimmer, ojz_sec5_showcase.
```

**Could the editor have known?** Yes, and partly does: after the delete, the section
select shows a yellow line — *"Assigned to "cold_test_band", which is not a raster
preset in this project."* Credit where it is due. But the delete itself is
unguarded, the ref is left dangling rather than cleared, and the warning is only
visible if you are already looking at that one card 5,000 px down the panel.

**The wrapper hiding the real message is a defect in its own right** and is the
cheapest fix in this document.

---

### b4 — the canonical build refuses the binding the UI offered ★

**Repro.** `SECTION ASSIGNMENT` and the raster `Section 0` select both offer every
scene and every preset. Bind `cold_test_band` to section 0. Save. Run the **canonical**
build (`./build.sh`, no `FAST`).

```
AssertionError: False is not true : sections [0] bind a rasterRef that no preset
threads — the generator emits the binding and nothing reads it, which presents to the
author as an assignment that did nothing
```

and

```
"section 0's sidecar names rasterRef 'cold_test_band', but no preset threads
 ojz_act1_sec_raster(sec: 0) — the generator would emit the binding row and nothing
 would read it, which presents to the author as an assignment that did nothing."
```

`tools/test_effects_seam_gate.py`: **7 failed, 34 passed** on my tree; **30/30 passed**
on the untouched control.

**Could the editor have known?** The panel *literally already knows and says so* —
buried at character ~1,900 of the 8,465-character prose block: **"WHICH SECTION YOU
BIND NOW DECIDES WHAT HAPPENS, AND ONLY SECTION 5 IS WIRED."** The knowledge is in the
product. It is in prose, in a collapsed card, thousands of pixels away from the
dropdown that acts on it, instead of being the dropdown's own disabled state or
inline warning.

**And `FAST=1` hides it.** `FAST=1` sets `NO_LINT=1`, which skips the pytest lane and
`effects_seam_gate`. So the iteration build the owner is told to use is **green on a
tree the real build refuses**. You find out when you land.

---

### b5 — one two-field mistake, four error lines

**Repro.** Set `Top = 200`, `Bot = 100` on a band (the panel accepts it silently — and
accepts `40112` / `72128` just as silently, see a14). Save. Build.

```
error: native build (sonic4 plain): build_program: 4 error(s);
  [Error] band: top 200 must be above bot 100 @ Span { source: SourceId(11), start: 54630, end: 54690 }
  [Error] band: height -100 is below this ON op's minimum — the ON fire costs 624 cyc against -48800 available; a 1-word pal_region tint needs height 2 (spec §6.2, measured model) @ Span { source: SourceId(11), start: 56614, end: 56929 }
  [Error] raster_program: the band's ON op is at screen line 200, at or below its restore at line 100 — a band turns ON above and OFF below (design §3.2, rule OWN-3). @ Span { source: SourceId(11), start: 202530, end: 202759 }
  [Error] raster_program: the restore at screen line 100 closes band 25674 on CRAM entry 37, but the band live on that entry is 0 (0 = none). A restore writes this frame's BASE palette over its whole span, so on this entry it is either turning off something it never turned on, or turning off a DIFFERENT band's tint (design §3.2, rule OWN-1). @ Span { source: SourceId(11), start: 206004, end: 206412 }
```

Four failures, three vocabularies, two spec references the author cannot open
(`spec §6.2`, `design §3.2 rules OWN-1 / OWN-3`), a cycle budget of `-48800`, and an
invented band id `25674`. One transposed pair of numbers.

**Could the editor have known?** `Top` and `Bot` are adjacent inputs in the same card,
and `Top`'s own tooltip states the rule (`band (top < bot, …)`). This is a two-number
comparison the panel already has both operands for.

---

## (c) Things that look like repeats of each other

**c1 — the word "band" means two unrelated features, on one tab.**
A *BG animation band* (tile animation: cols × rows, 8 frames, banks, a driver) and a
*raster / palette band* (a screen-line interval that repaints CRAM). Six controls
carry the word: `Add blank band` · `Mark Band` · the `bands` column of RASTER TIMELINE
· `BG ANIMATION BANDS (n/4)` · `NEW BAND` · `RASTER BAND PRESETS`. **Three of those
six are one feature and three are the other, and nothing on screen says which is
which.** This alone cost me 2 minutes and one wrong edit to my project.

**c2 — two doors to a BG animation band.** `Add blank band` (toolbar, one click, no
options) and `NEW BAND` (panel, full form). Neither mentions the other.

**c3 — two per-section binding controls, ~4000 px apart.** `SECTION ASSIGNMENT`
(*"Saved to section_0.meta.json as sceneRef"*) and the raster `Section 0` select
inside `RASTER BAND PRESETS` (*"Saved to section_0.meta.json as rasterRef"*). Same
section, same file, same sentence pattern, opposite ends of the panel.

**c4 — a self-declared duplicate.** The tooltip on `Play bands` says: *"The same
switch as View > Play animations — playback is view state, not a property of this
panel."* The product knows the control appears twice and explains it in a hover.

**c5 — three ways to say "a horizontal line on the screen".** A layer's `Screen line`,
a band's `Top`/`Bot`, and `Plane B split at`. Different mechanisms, one visual idea,
no shared vocabulary. The RASTER TIMELINE draws two of them in adjacent columns
(`bands` / `layers`) without saying they are different mechanisms.

**c6 — scene deform vs layer deform.** `Deform fg` / `Deform bg` on the scene and
`Deform: none | own` on every layer. The layer tooltip says it *overrides* the scene's
— which is the only place that relationship is stated.

**c7 — `V factor` (scene) and `Plane B split at` (layer)** both move Plane B
vertically, by different mechanisms, with no cross-reference.

---

## (d) Expected and not found

- **d1 — any help at all.** Zero help/guide/docs/tutorial affordances in the entire
  application (measured, not impression).
- **d2 — a Save control on the level tab.** Ctrl+S works; nothing says so; the Sprite
  tab has a button.
- **d3 — a way to create a new act.**
- **d4 — a preview of a raster band.** The panel states plainly: *"No preview. This
  editor draws no band."* So the one feature the owner most wanted is authored
  entirely blind, in decimal.
- **d5 — a colour picker for `colours`.** Decimal CRAM words, typed.
- **d6 — a section picker on the Effects tab.** Both bindings act on "the active
  section", set on a different tab.
- **d7 — "which sections use this scene?"** on the SCENE card.
- **d8 — any authoring-time validation.** Nothing in this panel refuses, warns about,
  or reds out a value — not `top > bot`, not a screen line of 40112, not `L0` in a line
  mask, not binding a section the build will reject. The **one** exception found is the
  dangling-`rasterRef` yellow line (b3), which proves the pattern exists and is used
  exactly once.
- **d9 — a save that only writes what I changed.** One Ctrl+S rewrote **25 files**.
  Twenty-three were byte-different but semantically identical (re-serialisation only):
  every section's `.objects.json` and `.rings.json`, `chunks.json`, `ojz_bglib.json`,
  and a scene I never opened. One (`section_4.meta.json`) gained a key I never
  authored (`"rasterRef": null`). A person reverting a bad experiment has to find his
  two real changes inside a 25-file diff — which is precisely the situation the owner
  describes.

---

## Defect list — ordered by what blocks the walkthrough earliest

Each has a repro above.

| # | blocks at | defect | repro |
|---|---|---|---|
| **1** | before you start | **No entry point of any kind.** Nothing in the app says what the Effects tab does or how to make anything. | a1, d1. Search the DOM for help/guide/docs/? — zero hits. |
| **2** | first click | **"Band" names two unrelated features and six controls.** The first control an author reaches, `Add blank band`, silently builds the wrong one and dirties the project. | a4, a5, c1. Effects → `Add blank band` → lands you in `BG ANIMATION BANDS`. |
| **3** | ~2 min in | **The raster band control is behind 8,465 characters of programmer prose**, and is not called "band". | a10, a11. Expand `RASTER BAND PRESETS`; count to the first input. |
| **4** | ~3 min in | **The panel is 8.3 screens with a 19-screen list nested inside it**, with no index and no section picker. | a8, a9, d6. Measured: 727/6008 px outer, 129/2466 px inner. |
| **5** | while typing values | **No authoring-time validation anywhere.** `top > bot`, screen line 40112, `L0` in a line mask — all accepted in silence, all fatal at build. | a14, b1, b5, d8. |
| **6** | at the binding step | **The UI offers every section, and the canonical build accepts only section 5.** `FAST=1` is green; `./build.sh` fails with 7 test failures. The product knows this and says so only in prose. | b4. |
| **7** | at the first red build | **Errors cannot be walked back to a control.** `SourceId(8), start: 2800`; `spec §6.2`; `design §3.2 rule OWN-1`; band id `25674`. No preset id, no section, no field name. | b1, b5. |
| **8** | when you try to revert | **★ The same error repeats after the cause is deleted.** `FAST=1`'s mtime staleness check cannot see a deletion, so a stale generated `.emp` is reassembled indefinitely. | b2 — reproduced twice, on two documents. |
| **9** | when you try to revert | **One Ctrl+S rewrites 25 files**, 23 of them re-serialisation noise, plus one key you never authored. | d9. |
| **10** | when you diagnose | **The FAST wrapper replaces the real generator refusal with a wrong one** ("it needs the out-of-repo donors"), hiding an excellent message. | b3. |
| **11** | throughout | **Deleting a bound preset is unguarded** and leaves a dangling `rasterRef`. | b3. |
| **12** | throughout | **Undo leaves the toolbar stale** (`Promote from tile 33` after undoing the add that made it 33). | a6. |
| **13** | throughout | **No band preview and no colour picker** — raster authoring is blind, in decimal. | d4, d5, a12. |
| **14** | at the end | **The parallax preview exists but is hidden** in `View ▾`, off by default, unmentioned by the Effects tab. | a21. |

---

## What I completed, and how

| step | result |
|---|---|
| 1. one raster band | **completed unaided** (preset `cold_test_band`, band `top 40 / bot 72 / sh off / cram addr 74 / colours [14]`), after one wrong turn and 3 min 25 s of hunting. I did read an existing shipped preset's numbers to learn the `colours` format. |
| 2. one drifting layer | **completed unaided** (Layer 5, line 192, `fa FACTOR_1`, `fb FACTOR_1_8`). |
| 3. one palette cycle | **completed unaided** (channel `line 2 / first 8 / count 4 / period 8`), entirely on the seeded defaults — I could not have chosen these values from what the UI told me. |
| 4. bind to a section | **completed, and wrong.** The UI let me bind section 0; the canonical build refuses it. Binding the one section that works (5) requires a tab change nothing mentions. |
| 5. save, then build | **completed.** `FAST=1` → `Build complete: s4.bin — 719528 bytes`, `BUILD_RC=0`. `./build.sh` (canonical) → `BUILD_RC=1`, 7 seam-gate failures. |

**TAG FOR THE OWNER — not run here:** the ROM at
`<scratchpad>/suite/aeon/s4.bin` was built with a raster band bound to **section 0**,
which the panel's own prose says reaches nothing at runtime. Running it in Oracle
would show no band, and that would be *correct behaviour*, not a bug. If you want to
see a band on screen, section 5 is the only wired one today.

---

## What I had to read that a new user would not

Logged honestly, in order:

1. **`title` attributes, dumped programmatically.** Roughly half the real
   documentation in this panel is in hover text. A person hovering one control at a
   time would take far longer than I did and would never see the ones on off-screen
   controls.
2. **The DOM**, to learn the panel's section order (a8) and to find controls below
   the fold. A person scrolls and guesses.
3. **A shipped preset's stored values**, to learn that `colours` is decimal (a12).
4. **`tools/regenerate-level.sh` output**, run by hand, to get the real error the
   FAST wrapper hides (b3).
5. **`tools/test_effects_seam_gate.py` output and `tools/suite_paths.py`** — to
   attribute b4 and to stand up a suite root. `suite_paths.py` was setup plumbing.
6. **`git ls-tree` on aeon**, to prove a stray preset document in my working copy was
   contamination from an earlier agent run and *not* an Aurora defect. Without that
   check I would have reported a fabricated write. It is excluded from every count
   above.

**I did not read** `docs/`, any spec, any review packet, the lane log, or the source
of any effects/raster/band/preset component or test.

---

## The first-run guide, and how it should reach the app

The guide is `docs/guides/effects-first-run.md`. It is written from the log above, in
the order the questions were actually asked, and reads in about ten minutes.

**It is not yet reachable from inside the app, and wiring it is more than a small
change.** Verified, not assumed:

- `package.json` has **no** markdown renderer — no `marked`, `react-markdown`,
  `remark`, `mdx`. Rendering a `.md` in-app needs a dependency or a hand-rolled
  renderer, and this guide leans on tables, which is the expensive part of a
  hand-rolled one.
- There is **no** `shell.openExternal` / `shell.openPath` anywhere in `src/`. The
  only `openPath` in the tree is `useProject`'s project-open. So "open the file in the
  OS" is not a route that exists either.
- `src/renderer/components/home/HomeTab.tsx` is the only Home component; tab kinds are
  enumerated in the shell (`home`, `level`, `sprite-doc`, …), so a guide tab is a new
  kind, not a new prop.

**The wiring I would do**, in the order it pays off:

1. **A `?` button in the Effects toolbar**, immediately right of `Add blank band` —
   the point of maximum confusion (defects 1–3). One click, opens the guide.
2. **A card on the Home tab**, above `RECENT PROJECTS`: *"New here? Backgrounds that
   move — parallax, raster bands and palette cycles."* This is the one-click-from-the-app
   requirement for someone who has not opened a project yet.
3. Both open a **new tab kind `guide`** rendered by a `GuideTab.tsx`. To avoid a new
   dependency, the smallest honest version is a ~60-line subset renderer (h2/h3,
   paragraphs, `|`-tables, fenced code, lists) reading the `.md` at build time via
   `?raw`, so the markdown file stays the single source of record and the doc does not
   fork from the app. That renderer is the part that is "more than a small change" —
   everything else is a button and a tab case.
4. **Deep links from the four worst controls**, once the tab exists: a `?` on
   `Add blank band` → §7, on `RASTER BAND PRESETS` → §3, on the `Section` selects →
   §5, on `colours` → the colour table in §3. These are the four places the
   walkthrough lost the most time.

Until 1–3 land, the guide is repo-only, and I am saying so rather than claiming the
deliverable is met.

## Method notes

- Aurora: this worktree at `b2e5a2b5`, built with `VITE_AURORA_DEBUG=1`.
- Project: `git -C ../aeon archive origin/master` (`8876459e`) extracted to a
  scratchpad copy. `../aeon` was never written to.
- Control: a second extract of the same revision, built identically → green,
  seam gate 30/30.
- Build env (plumbing, not findings): `SIGIL_BUILD` / `SIGIL_EMIT` pointing at
  `sigil/target/release/{sigil,emit_sound_blob}`, `AEON_SONIC_HACK_DIR`,
  `AEON_SKDISASM_DIR`, and a synthetic suite root holding `aeon/` + `empyrean/`.
- No emulator or `mcp__oracle__*` tool was used at any point.
