# UX seat A — task walk

**Seat:** UX A, newcomer to Aurora. **Branch:** `parcel/uxa-walk`, based on master `825327c8`.
**Date:** 2026-09-09. **Wall clock:** 12:17:00Z → 12:37:09Z, **20 min 09 s** total.

## What I was allowed to read

`README.md` at the repo root, and nothing else. I read it once (224 lines, ~40 s) and it is the
only project document behind anything in this report. Everything else here came from pressing
things in the running app and looking at what it did.

**I opened no source file to work out how to proceed.** The two files I read that are not the
README are rig, not app: `scratchpad/lib/harness-guard.mjs` and `scratchpad/lib/run-root.mjs`, for
the launch and run-root contract my brief told me to use. I took no UI knowledge from either, and
none from the ~200 existing harnesses in `scratchpad/` (I did not open one).

**Where I substituted, and where the line is.** I could not drive the native file dialog (finding
F1), so every project open in this walk went through `window.__dbg`, which the README itself
documents as the debug surface (`VITE_AURORA_DEBUG=1 … expose the window.__dbg test hooks the CDP
harnesses drive`). I enumerated it from the live page rather than from source. **Two consequences I
hold myself to:** F6 is filed as an observation about that hook and explicitly *not* as a claim
about the UI; and every other gesture in this walk — every facet pill, every swatch, every pixel,
every field, the section-binding `<select>` — was a real CDP mouse or key event at a coordinate I
read off a screenshot. There is no claim in this report about behaviour I did not observe.

## Rig, and the lines that say which tree answered

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a391630f85c85d690
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a391630f85c85d690
in-tree: YES  here=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a391630f85c85d690
electron: /home/volence/sonic_hacks/aurora/node_modules/.bin/electron
main: …/agent-a391630f85c85d690/dist/main/index.mjs  exists=true
```

Both runs printed `in-tree: YES` and `borrowed` false — **the app under test was my worktree's own
build**, not the main checkout's. Built here with `VITE_AURORA_DEBUG=1 npx electron-vite build`,
exit code 0 (checked, not assumed). Launched only through `spawnGuarded` under
`/usr/bin/xvfb-run -a -s '-screen 0 1680x1050x24'` with `DISPLAY` deleted; `ORACLE_SOCKET` pointed
at a path with nothing listening. Teardown was `await killTree(child)` in a `finally`; after it, the
owner's `~/.aurora/mcp.json` and `~/.sonic-level-editor/mcp.json` are both back at 203 bytes and no
`Xvfb :101` survives. No emulator tool was called.

**Screen geometry, measured from inside the display** (`screen`/`devicePixelRatio` read in the page,
which gets them from the X server — `xdpyinfo` is not installed on this box, so this is the
measurement I have, and I am naming the method rather than a tool I did not run):

```
screen 1680×1050   avail 1680×1050   devicePixelRatio 1   window inner 1400×872   outer 1400×900
```

Every coordinate in this report is CSS px at dpr 1, so px = device px.

Driver: `scratchpad/uxa-walk-driver.mjs` (committed on this branch). One launch serves a whole walk
through a file queue, because a newcomer's session is continuous and relaunching per gesture would
make every job read as a cold start.

## The five jobs

| # | Job | Result | Steps | Wall |
|---|---|---|---|---|
| A1a | aeon project open, level on screen | **done** | 4 (2 of them dead ends) | 3 m 28 s |
| A1b | classic project open, level on screen | **done, clean** | 1 | 12 s |
| A2 | object into the level, saved to disk | **done, clean** | 4 | ~1 m 45 s |
| A3 | palette colour changed and saved | **done, clean** | 4 | 1 m 11 s |
| A4 | background band authored on the aeon act | **done** | 17 | ~7 m 10 s |
| A5 | new tile drawn into the level's art | **done** | 7 (+4 round-trip) | ~3 m 11 s |

Nothing was unreachable. Nothing is reported BLOCKED.

### A1 — get a project open and a level on screen (doubled)

**aeon.** Launch → Home tab: a title, an `Open Project…` button, and one guide card
(`01-a1-home-on-launch.png`). No recents — this run has a private Chromium profile, which is rig,
not the app. I clicked `Open Project…` and nothing happened; see **F1**. After ~2 minutes of
diagnosis I went through the README-documented debug surface. My first try, `__dbg.openDir`,
returned the string `"not-classic"` — an accurate refusal, but that hook is classic-only.
`__dbg.aeon.open` opened it. **The level tab opened by itself**: Oracle Jungle Zone · act1 rendered
in the map canvas with all seven facet pills, sections, art and properties, with no further gesture
(`03-a1-aeon-opened.png`). That is a good result and worth saying so — from "project chosen" to "a
level is on screen" is zero clicks.

**classic.** `__dbg.openDir` on the s1disasm copy: `"opened"`, and Green Hill Zone Act 1 rendered
with the five classic facets, chunk palette and a `48×5 chunks · 82 chunks · 439 blocks · 214
objects` status line (`04-a1-classic-opened.png`). One gesture, 12 seconds, nothing to report.

Neither project was refused, so I have no refusal message to quote — the rig's two fixtures both
satisfied the app's recognition rules.

### A2 — put an object in and save it — CLEAN

Objects pill → the right panel lists 109 objects with a filter → clicked `$1F Crabmeat` → the
status strip changed to **"Placing Crabmeat: click the map to drop it, or press Esc to cancel."**
→ clicked the map. `Object #214 · $1F` appeared in the inspector with X 545, Y 904, subtype, flips
and Respawn; the status bar went 214 → **215 objects**; the tab grew a dirty dot; Undo became live.
Ctrl+S (a guess — see F2). Verified on disk, out of band:

```
objpos/ghz1.bin  1290 → 1296 bytes
… 0221 0388 1f00 …        X=$0221=545, Y=$0388=904, id $1F, subtype $00
```

Four steps, no confusion, the affordance told me what mode I was in at every point.

### A3 — change a palette colour and save it — CLEAN

Palette pill → a 4×16 swatch grid with the hint *"click a swatch to edit · line 0 index 0 =
transparent"* → clicked a swatch → an editor appeared reading `Line 2 · Index 3`, `$0026`, and R/G/B
sliders at 3/1/0 → clicked the B track at its right end → `$0E26`, B=7. **The map canvas repainted
live** — GHZ's ground went purple (`12-a3-after-save.png`). Ctrl+S. On disk, against the fixture's
own git HEAD:

```
palette/Green Hill Zone.bin, one word changed, nothing else:
-  0e80 0002 0eee 0026 …
+  0e80 0002 0eee 0e26 …
```

Four steps, 1 m 11 s, exactly one word written. This is the cleanest job of the five.

### A4 — author a background band on the aeon act

The word **band** appears nowhere in the Effects panel; it speaks in scenes, layers, presets, splits
and channels. The `? Guide` button on the Effects toolbar closed that gap in one click: its §1 table
says a raster band is built *"inside a preset, the **Colour** sub-tab"*, and §3 gives the field
list with sane first values. **This guide is the best thing I met in the app** and it is why A4
finished at all.

Then: Colour sub-tab → four wheel gestures to reach `RASTER BAND PRESETS` (**F5**) → typed
`uxa_walk_band`, pressed New → *"uxa_walk_band · 1 band"*, exactly as §3 promised ("you make a
preset, and it comes with one"). Filled the band in; the Top→Bot sequence cost me a bad value and a
control run (**F4**). Final: Top 40, Bot 72, S/H off, ON cram, addr 74, colours 14. Ctrl+S, then
bound it to Section 0 through the section dropdown and saved again. On disk:

```
new     games/sonic4/data/editor/effects/presets/uxa_walk_band.json
        {"bands":[{"bot":72,"on":{"cram":{"addr":74,"colours":[14]}},"sh":false,"top":40}],
         "id":"uxa_walk_band","schema":1}
edited  games/sonic4/data/editor/ojz/act1/section_0.meta.json
        + "rasterRef": "uxa_walk_band"
```

**Two honest limits, both of which the app told me before I hit them, neither of which is a
finding.** There is no preview: the panel says so in as many words (*"Aurora draws no raster band:
there is nothing here to check one against, and a wrong preview would be worse than none. You see it
when the ROM runs."*). And section 0's strip said up front that aeon's canonical build would refuse
a binding here because nothing threads `ojz_act1_sec_raster(sec: 0)`, and that *"the binding is
written either way"* — which is exactly what happened, and after saving the strip flipped its
threaded marker to `✗` rather than pretending. Being told the truth in advance is the opposite of a
cost.

### A5 — draw a new tile into the level's art

Art pill → a Chunk/Block/Tile tier strip with a `Chunk $1 › Block $1 › Tile $1` breadcrumb. The
Chunk tier has `+ New blank`; **the Tile tier has only Copy and Paste.** The route to a new tile is
in a legend under the tile list: *"badge = used-in count · no badge = unused (safe to repurpose)"*,
and unused tiles carry the title `tile $30 · unused`. That is a correct model for S1's fixed art
pool, and once found it is unambiguous; finding it cost ~1 minute of reading a 965-cell grid.

Picked `$30 · unused` (`in 0 blocks · 0 cells`, so the shared-edit warning correctly went away),
pressed `+` three times (5× → 10× → 20× → 40×, **P2**), and painted a 14-pixel X in colour index 15.
The thumbnail in the tile list updated live. Ctrl+S — which wrote more than I expected (**F3**).

**Round-trip verified**, which is the real test of "saved": I reopened the project from disk, went
Art → Tile → `$30`, and the X came back (`18-a5-reload-roundtrip.png`).

---

## Findings — ranked by time burned

Every finding gives the moment, the currency and magnitude, whether it was paid or predicted, and
the remedy separately where I have one.

### F1 — the app's one advertised way in produced nothing I could observe, and there is no second way

**The moment.** A1, the first gesture after launch. On the Home tab I clicked `Open Project…`. I
confirmed the click point was the button (`document.elementFromPoint(537,167)` → `BUTTON … "Open
Project…"`), and confirmed the button's own centre with `getBoundingClientRect` (537,168). Clicked
twice, waited 1.5 s, 3 s and 8 s. Captured the **whole X root window** of `:101` three times — all
three byte-identical (`md5 5b79b80f1b4b37f709be2af1d4096e31`). No dialog anywhere on the display, no
page change, nothing on the app's stderr. The main process was not hung: an Aether `initialize` over
HTTP answered **200 in 4.7 ms** while the click was outstanding.

**Currency and magnitude.** **Time — ~2 minutes paid** (two clicks, three root captures, a
main-process liveness probe, a portal-process check), and then the structural cost: every project
open in the rest of this walk went through `window.__dbg` instead of the UI.

**Paid.**

⚠ **Attribution, stated rather than glossed.** I cannot separate *"the app failed to show a dialog"*
from *"a headless Xvfb with no window manager, whose portal services are bound to the owner's real
session, cannot show one"*. `xdg-desktop-portal`, `-gtk` and `-kde` are all installed on this box.
**I am not claiming an app defect, and nothing below depends on it being one.** What I am reporting
is the shape I actually hit: the app has exactly one advertised entry point, it is a native modal,
and when it does not appear there is nothing else in the UI to fall back to — no path field, no
recents on a fresh profile, and no drop target I could find. A newcomer whose desktop's portal is
misconfigured lands where I landed, with no second door.

**Remedy — mine, and preference.** A path text field beside the button, or accepting a directory as
`argv`. Either one is also what makes this walk drivable without a debug build.

### F2 — a save reports nothing, so I never knew what I had written

**The moment.** A2, immediately after Ctrl+S with the Crabmeat placed — and then again in A3 and
again in A5. Ctrl+S was itself a guess: the README documents Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z,
Ctrl+Shift+B and F7, and never states the save gesture; the app chrome has no Save control anywhere
I could see. The **only** signal that anything happened is a ~6 px dirty dot disappearing from the
tab title. No toast, no status line, no list of files.

**Currency and magnitude.** **Certainty — paid, three times.** Time: ~1 minute per job to hash the
fixture from outside the app (`md5sum`, then `git diff` against the fixture's own HEAD). A person
without a shell beside the editor has no way at all to answer "did that write, and what did it
write?".

**Paid.**

**Remedy — mine, and preference.** A transient toast naming the files written. F3 is the same
remedy's other half.

### F3 — 14 pixels in one *unused* tile rewrote two art files and grew the ROM art by 329 bytes, unannounced

**The moment.** A5, the Ctrl+S after painting tile `$30`, which the panel itself said was `in 0
blocks · 0 cells`. Measured on the fixture immediately after:

```
artnem/8x8 - GHZ1.nem   5727 → 5894 bytes
artnem/8x8 - GHZ2.nem   5031 → 5193 bytes
```

Two files, `+329` bytes. Before that save the fixture's only modifications were A2's and A3's, so
this save introduced both.

**Currency and magnitude.** **Certainty — paid, ~2 minutes.** I had no way inside the app to learn
that a second art file was touched, or that the art had grown. In a ROM project growth is precisely
the thing that breaks a build later, in someone else's assembler, far from the gesture that caused
it.

**Paid. I did not determine the cause and I am not asserting one** — I observed two files change and
both grow; why is not something a walk can establish without reading source, which I did not do.

**Remedy — mine, and preference.** Report bytes written per file after a save, and flag growth.

### F4 — committing the Top field grew the panel 120 px under my hand, and the next field took an appended value

**The moment.** A4, filling `Raster band 0`. I set Top 112 → 40 (which worked — clicking the box
selected its contents, exactly as the guide promises), tabbed, clicked Bot at its measured position
and typed `72`. **Bot became `12872`.**

Measured either side of that: after Top committed, an explanatory block rendered between Bot and
S/H, and **S/H moved from y=704 to y=824 (+120 px)**, addr from 763 to 883. After Bot committed,
both returned to 704 / 763.

**I ran a control before believing my own diagnosis.** With the layout settled, I clicked Bot at the
same coordinate and typed `72` again: `focus=INPUT val=128 selectionStart=null` → **`val=72`**. So
click-selects-contents *does* work on Bot; the `12872` came from the reflow, not from an
inconsistency between the two fields. I would have filed the wrong finding without the control.

**Currency and magnitude.** **Time and one bad edit — ~4 minutes paid**: the wrong value, reading the
refusal, then designing and running the control.

**Paid.**

**And the reason it was 4 minutes and not an hour belongs in the record.** The app refused and told
me everything:

> preset "uxa_walk_band" · Raster band 0 · Bot: 12872 is not a screen line: both of a band's edges
> are raster fires, and a fire must land on 3..223 (lines 0-2 belong to the priming records).
> **Refused; Bot is still 128.**

It named the value, the rule, the legal range, *why* the range is what it is, and what the field
still holds. Nothing was silently clamped. The finding here is the reflow alone.

**Remedy — mine, and preference.** Reserve the message row's height, or render validation below the
whole field group rather than between two fields.

### F5 — the control the guide names as step 1 is four scroll gestures down, behind prose about a different mechanism

**The moment.** A4. The guide's §3 step 1 is *"Press Colour, the middle sub-tab, and open RASTER BAND
PRESETS. Type an id in Preset id. Press New."* On the Colour sub-tab, `RASTER BAND PRESETS` sits
below roughly 440 px of explanation of raster **splits** — which the same panel is at pains to say is
a *different* thing (*"A split is ONE edge… A palette band is an INTERVAL with two edges"*).
Expanding the accordion then yields five more paragraphs before the `Preset id` input. Measured: **4
wheel gestures** (2×600 + 2×700 deltaY) from the top of the sub-tab to that input.

**Currency and magnitude.** **Time — ~1 minute paid.** Small once; it is the first thing anyone
following the guide does.

**Paid.**

**Remedy — mine, and preference.** Put `Preset id` + `New` at the top of their own accordion, above
the note.

### F6 — opening the aeon project while the classic project was open did nothing, silently

**The moment.** Start of A4. I called the same open path that had worked from a cold start. It
returned `undefined`, threw nothing (I retried inside a `try/catch` to be sure), and the shell stayed
on `Sonic 1 Disassembly (GitHub)` with the classic five-pill facet set. I restarted the app and
opened aeon first; it worked immediately.

**Currency and magnitude.** **Time — ~1 m 40 s paid** (two attempts plus a full app restart).

**Paid.**

⚠ **This is `window.__dbg.aeon.open`, not a UI gesture.** Because of F1 I could not drive the UI's
project-open path at all, so **I cannot say the UI behaves this way**, and I am not saying it. Filed
as an observation about the only surface I could drive, and worth a check by someone who can press
the real control.

## Predicted — filed, labelled, and not the same kind of evidence

**P2 — the tile editor opens at 5×, three zoom presses short of usable.** Selecting a tile gives a
40×40 px drawing surface floating in a ~600×640 px empty pane; three `+` presses take it to 40×
(5 → 10 → 20 → 40) and a 320×320 px canvas. I paid this once, about ten seconds. **Predicted** for
the shape that matters: an artist opening thirty tiles pays ninety presses, and the pane was
already large enough to fit the tile at 40× on arrival. *Remedy, mine: fit-to-pane on tile select.*

**P3 — switching projects replaced the open one with no confirmation.** I had nothing unsaved when
it happened, so I paid nothing, and **I did not test whether it prompts when there are unsaved
edits** — so this is an open question rather than a prediction of loss. Recording it so someone can
answer it.

## Bin count

**Twelve observations binned as taste** — each one failed "would it still have cost me time,
certainty, or work?", so none is listed. For calibration on how hard the filter ran: they included
control styling, a display-only readout, a breadcrumb that names a parent the child isn't in, badge
units, hit-target sizes, and a toolbar label whose meaning isn't in the label.

## Evidence

30 screenshots in `docs/reviews/2026-09-07-lens-ux/uxa/`, one or more per step, committed on this
branch. Cap is 40; I used 30 and dropped nothing I wanted.

## What went right, since a walk that only lists costs misdescribes the app

- **Opening a project puts a level on screen with no further gesture**, in both engines.
- **Modal state is narrated in the status strip** — "Placing Crabmeat: click the map to drop it, or
  press Esc to cancel", then "click selects · drag moves · … · arm from the Objects panel to place".
  I was never unsure what a click would do.
- **The palette edit repainted the map live**, and wrote exactly one word.
- **The Effects `? Guide`** answered the exact vocabulary question I was stuck on (band → preset →
  Colour sub-tab) in one click, and its field table was correct.
- **Refusals name the rule and say what the value still is** (F4's quote), and the Effects panel
  states its own limits in advance — no preview, saving does not install, this section will be
  refused by aeon's build — rather than letting me discover them.
- **Shared-edit warnings are load-bearing**: "Linked: used in 2 blocks · 2 cells. Edits appear in all
  of them", which vanished correctly on an unused tile.
