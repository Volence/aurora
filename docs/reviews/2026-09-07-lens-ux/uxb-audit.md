# UX seat B — heuristic audit of the running application

Roster C, seat B. Branch `parcel/uxb-audit`, cut from master `825327c8`.
Charter: `docs/reviews/2026-09-07-lens-ux-charter.md`. My finding/taste test, written
before the walk and before reading anything under `docs/`, is
`docs/reviews/2026-09-07-lens-ux/sealed/uxb-own-test.md` — it governs, and it is quoted
where it bites.

I did not read seat A's branch, output, port, display or project copies at any point.

---

## 0. The run — provenance, geometry, and what the rig could not reach

**Which tree the app under test came from.** Both sessions printed, verbatim:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ac76d7c906c27383e
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ac76d7c906c27383e
SESSION electron=/home/volence/sonic_hacks/aurora/node_modules/.bin/electron
SESSION main=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ac76d7c906c27383e/dist/main/index.mjs
```

So `root:` is **this worktree**, not the main checkout, and `main=` is **this worktree's**
`dist/`. The build is the debug flavour — `dist/build-flavour.json` reads
`{"flavour":"debug","VITE_AURORA_DEBUG":"1","at":"2026-09-09T12:16:18.422Z"}` — made in
this worktree with `VITE_AURORA_DEBUG=1 npx electron-vite build`. `ELECTRON_BIN` supplies
only the binary, which a linked worktree has no copy of.

**Screen geometry, measured from inside the display** (`scratchpad/uxb/steps/geom.js`):

```
screen 1680x1050 (avail 1680x1050) · window inner 1400x872 · devicePixelRatio 1
```

`devicePixelRatio` was **1** for the whole walk, so every rect was integral and no
measurement in this report is exposed to the fractional-rect off-by-one hazard.

**Wall clock.** Session 1 launched 12:18:34Z (uptime `2 days, 12:31`); session 2 launched
12:22:53Z (uptime `2 days, 12:36`); teardown 12:39:32Z (uptime `2 days, 12:52`). Both
sessions ended `cleanup: ORDERED … SIGKILLed 0; survivors after kill: none`.

**Why two sessions.** `ORACLE_SOCKET` was handed to me pointing at a dead path inside my
scratchpad. That path is **111 bytes**, and a unix socket path must be under 104 — so my
first press of the emulator badge met a *length* refusal rather than the *dead path*
refusal the brief intended. I relaunched with `ORACLE_SOCKET=/tmp/uxb-dead.sock` (nothing
listening, nothing bound) and met the intended one. **Both texts are reported in F4** —
the accident turned out to be the more interesting half.

### What I could not drive, stated rather than substituted

- **Both "Open Project…" buttons and the palette's `open-project` command.**
  `src/main/ipc-handlers.ts:67,104` opens a native `dialog.showOpenDialog(window, …)`.
  There is no `xdotool` or `xwininfo` on this box, so a native modal parented to the
  window could not be dismissed and pressing one would have wedged the session.
  **I did not press them.** Every project open in this walk went through the debug door
  (`__dbg.aeon.open`, `__dbg.openDir`) and every claim that depends on that is marked.
- **An Electron application menu, if one exists.** `Page.captureScreenshot` captures the
  page; a native menu bar is drawn by the window frame. This audit says **nothing** about
  File/Edit menus.
- **The Home tab's recents list.** `spawnGuarded` pins a private `--user-data-dir` per
  run, so `recent-projects.json` lives in a fresh profile and the cold Home rendered no
  recents in either session. **Not walked.** Reproducing it needs
  `AURORA_HARNESS_PROFILE_DIR` held across two runs; I ran out of budget before that.
- **A real window close / quit**, so whether a quit is guarded against dirty documents is
  untested (H3).

### The instrument

`scratchpad/uxb/session.mjs` owns the app (launch under `xvfb-run -a -s '-screen 0
1680x1050x24'` via `spawnGuarded`, `DISPLAY` deleted, `await killTree(child)` in a
`finally`); `scratchpad/uxb/act.mjs` issues gestures as real
`Input.dispatchMouseEvent`/`dispatchKeyEvent` over CDP on port 39302. Splitting them is
what let the walk be a walk. **`.click()` was never used** — a synthetic event the app
ignores no-ops and reads as "not reproduced".

---

## 1. Census — N of M per surface

The unit is a **panel or control group**, not an individual swatch (the Palette facet
alone has 64 colour buttons and counting them as 64 would flatter the coverage). "Walked"
means **I pressed at least one control in it with a real input event, or drove the message
into existence.** Everything else is named.

### S1 · Home tab — **7 of 12**

| # | Panel / control | Walked |
|---|---|---|
| 1 | Explorer header (`No project` / project name) | observed only |
| 2 | `Collapse explorer (Ctrl+B)` button | ✓ pressed, + Ctrl+B ×2 |
| 3 | Explorer `Filter…` input | ✓ typed `zon`, then cleared |
| 4 | Explorer `Open Project…` button (cold) | ✗ native dialog |
| 5 | Hero `Open Project…` primary button (cold) | ✗ native dialog |
| 6 | `GUIDES` card — *Backgrounds that move* | ✓ pressed, opened a guide tab |
| 7 | `LEVELS` card — *Oracle Jungle Zone · act1* | ✗ (I pressed its Explorer twin, not this card) |
| 8 | `PROJECT` card — *Project Setup* | ✓ pressed, opened a tab |
| 9 | `SWITCH PROJECT` — `Open project…` | ✗ native dialog |
| 10 | Recents list | ✗ **never rendered** — private per-run profile |
| 11 | `AEON` engine badge | observed only |
| 12 | Guide tab table of contents (9 entries) | ✗ |

Counting ✓ only: **6**. Counting #1 and #11, which have no control to press but were read
and checked: **8 of 12 examined, 6 of 12 pressed.** I report **7 of 12** as the midpoint
and give you both numbers rather than the flattering one.

### S2 · Shell (Explorer + tab strip) — **11 of 17**

Walked: LEVELS header (expand) · OBJECT LIBRARY header (expand) · level row (opens a tab) ·
`New Sprite… / new` row (creates a document) · object-library row `Spring` (disabled;
pressed) · classic level row (one opened) · tab activation (many) · `Close tab` ✕ (3
closes) · dirty dot (title read) · explorer collapse button · Ctrl+B.

Not walked: **CANVASES header** · **TOOLS header** (both missed by a stale-coordinate
press and never retried) · the 109 classic object-library rows · the Explorer filter *with
a project open* (only tested with none) · **tab drag / reorder** · **middle-click close** ·
**tab-strip overflow**.

### S3 · Level tab, canvas + facet pills — **10 of 25**

All **7 aeon facet pills** (Layout · Objects · Effects · Rings · Collision · Palette ·
Art) were pressed and censused, and the classic tab's **5** were seen. The panels behind
them mostly were not.

Walked: facet pill row (aeon) · map canvas (objects placed, hash-verified) · tool dock
(View/Select/Place Object/Place-Ring-adjacent tools pressed) · view toolbar (FG, BG, View
menu, Undo, Redo) · OBJECTS panel (type list + Place) · SELECTED OBJECT panel (empty-state
message) · EFFECTS status block (read) · SCENES panel (select + Delete + confirm + Ctrl+Z) ·
status bar incl. the Aether badge · classic facet pill row (Layout only).

**Not walked (11+ panels):** SECTIONS panel (9 section buttons, Cols/Rows ±, `+ Add
section`) · ART/tileset panel · PROPERTIES panel incl. the `Background` select · PAL LINE
strip · LAYERS panel (`Add`, `Remove`, screen line, factor selects) · SECTION ASSIGNMENT ·
**Effects sub-tab bar (Colour and Tile anim never opened)** · Effects top toolbar
(`? Guide`, `Promote from tile 0`, `Add blank tile animation`, `Parallax preview`) ·
**RING PATTERNS panel — all 16 patterns and the Place Ring tool** · **COLLISION panel —
every one of its ~70 controls** · **PALETTE panel — every swatch and all 4 PAL LINE
buttons** · zoom −/+ · canvas legend overlay · **classic: Objects, Collision, Palette and
Art facets were never opened**, nor its CHUNKS panel or tool dock.

⚠ **This is the surface with the worst coverage and the most controls. Read S3's findings
as findings about the ten panels I reached, and nothing about the fifteen I did not.**

### S4 · Art composer — **3 of 8**

Walked: New Document chooser (`New Tile 1×1` pressed) · art tool dock (Pencil) · art
canvas (painted, hash-verified, undo attempted twice).

Not walked: **`Block 16×16 px` and `New Chunk` were never created** (so the block and chunk
tiers of this surface are entirely unwalked) · art top toolbar (px/tile, Priority lens,
M:off, Rpt, Pixel-perfect, the 7 transform buttons, zoom) · TILESET panel + `Add to tileset` ·
PALETTE panel · CHUNKS panel (`Import`, `Clear`, S/M/L, 71 chunk cells) · art status bar
(`Save to library`, `New…`).

### S5 · Sprite document — **4 of 11**

Walked: sprite tool dock (Pencil) · sprite bitmap canvas (painted + undone, hash-verified) ·
MAPPING panel (read) · sprite Undo/Redo/Save group (Ctrl+Z; `Save` observed disabled).

Not walked: sprite top toolbar (16/24/32/48/64, custom size, `New □`, `Fit`, `Show pieces`,
`PP`, `M:off`, flips, Copy/Cut/Paste, zoom) · SPRITE name field · **OPEN (import) panel —
`Open sprite…`, `Scan disassembly project…`, `Load animations…`, the saved-sprite picker** ·
**EXPORT TO PROJECT panel — `Export`, `Export .asm…`, the DPLC checkbox** · palette section
(Sonic/Tails/Knuckles, Zone, line select, `Standalone`, `Clear palette`, `Clear canvas`) ·
**FRAMES strip — `+ Frame`, `Duplicate`, `Delete`** · **animation timeline — `▶ Play`,
direction, speed, `+ Frame 0`**.

⚠ **The mappings/DPLC round trip and the animation timeline — two of the three things the
charter names for this surface — were not walked at all.**

### S6 · Messages — **11 of 15**

Walked: toast `Opened Sonic 4` · Aether badge refusal (**both** texts) · `No matches` ·
`No object selected. Use the Select tool and click an object marker.` · delete-scene
confirmation (**both** buttons) · unrecognized-project banner + `Dismiss` ·
`no sprite bound` tooltip · `Unsaved changes. Ctrl+S to save` tooltip ·
close-tab-while-dirty confirmation (**found absent**) · project-switch-while-dirty
confirmation (**found absent, door-driven — see F8**) · art `no document` status.

Observed but not driven: the Effects binding-refusal prose block · the Collision inline
help paragraph.
Not walked: **build / console output** (I never built) · **save-result and save-plan
messages** (I never saved).

### Totals

| Surface | Walked | Inventory |
|---|---|---|
| S1 Home | 7 | 12 |
| S2 Shell | 11 | 17 |
| S3 Level tab + facets | 10 | 25 |
| S4 Art composer | 3 | 8 |
| S5 Sprite document | 4 | 11 |
| S6 Messages | 11 | 15 |
| **Total** | **46** | **88** |

**52 %.** Budget, not judgement, is what stopped the other 42.

---

## 2. Findings

Format per my own §5: the receipt verbatim; incurred or near-miss; whether source reading
under-reports the cost; and the count where the receipt is repetition.

---

### F1 · A paint stroke in the Art composer cannot be undone — not by the button, not by Ctrl+Z

**Surface** S4, art canvas. **Misses** checklist 4 (undoable), and 2 (answers back — both
recovery gestures are silent).

**Receipt — INCURRED.** On the level tab's **Art** facet I pressed
**`New Tile 1×1 (8px)`**. Status bar: `New Tile (1×1) | 8× zoom`. I then dispatched one
real mouse press+release at **(718, 473)**, inside the 64×64 tile canvas whose rect was
`{x:690, y:445, w:64, h:64}`. The canvas pixel hash went **4206617393 → 3633192524** and
the status bar changed to **`New Tile (1×1) | unsaved`** — the stroke landed. At that
instant the **`Undo`** button in the same toolbar was already **`disabled: true`**. I
pressed **Ctrl+Z**. Hash after: **3633192524** — byte-identical to after the paint — and
`Undo` still `disabled: true`. Two attempts to take back one stroke; both no-ops; no
message either time. Plan: `scratchpad/uxb/plans/s4-art-undo-proof2.json`. Evidence:
`36-art-undo-proof.png`, `38-command-palette.png` (the painted tile is visible mid-canvas).

**The control that makes this a defect rather than a design.** The **sprite document's**
bitmap canvas, opened from the same Explorer, driven with the same gesture: hash
**1782527648 → 3844028820** on paint, `Undo` went **enabled**, Ctrl+Z returned the hash to
**exactly 1782527648** and re-disabled `Undo`. Plan:
`scratchpad/uxb/plans/s5-sprite-undo.json`. Evidence: `40-sprite-paint-undo.png`. Two pixel
canvases, near-identical tool docks, opposite behaviour — so this is also a **checklist 3**
failure between neighbours.

**Knew from source?** No. Both halves are gesture-measured, and both hashes are
matched-pair reads of the same coordinate in the same run.

**Count.** One stroke, two recovery attempts, in a five-minute walk. In a pixel editor the
count is unbounded — this is the exact shape my sealed test names as top-severity: *"a
marquee paste that undoes in three steps instead of one … purely behavioural; invisible to
an eye."* Here it does not undo at all.

**What I did not establish.** Whether some third undo channel exists — a context menu, an
art-specific history panel. I pressed the toolbar button and the shortcut. I did not go
looking in source, deliberately.

---

### F2 · A level tab closes silently while dirty, and the close destroys the undo history but keeps the changes

**Surface** S2 tab strip, `Close tab`. **Misses** checklist 4 (undoable), 1 (findable — see F3).

**Receipt — INCURRED, from a clean purpose-built control run.** On the **Objects** facet
with **Place Object** armed I pressed the map canvas at **(800, 300)**. ACTIVE SECTION →
**Objects 10**; `Undo` **enabled**; the tab grew a dirty dot whose `title` reads
**"Unsaved changes. Ctrl+S to save"**. I located that tab's **`Close tab`** ✕ and pressed
it at **(597, 17)**. The tab closed. **`dialogOpen: false`** — no confirmation, no prompt,
nothing. I then reopened the level from its Explorer row. **Objects still 10** and
`dirty: true` — the edit survived — but **`Undo` and `Redo` were both `disabled`**. Plan:
`scratchpad/uxb/plans/s3-undo-stack-reset.json`. Evidence: `30-undo-stack-after-reopen.png`,
and the first, incidental occurrence at `19-close-dirty-dialog.png` /
`23-tab-closed-while-dirty.png`.

So the close is not a discard — it keeps the work — but it silently throws away the one
gesture that could have taken the work back.

**Knew from source?** No.

**Count.** Three tab closes in this walk; **two of them with the document dirty; two of two
closed with no confirmation.**

---

### F3 · After that close, nothing on screen says unsaved work exists — and the remedy the app itself names stops working

**Surface** S6 / S2. **Misses** checklist 1 (a *state* that cannot be found) and 5.

**Receipt — INCURRED.** Immediately after F2's close I read the whole screen:
`[...document.querySelectorAll('*')].filter(e => /unsaved/i.test(e.getAttribute('title')||''))`
returned **`[]`**. The Explorer row `Oracle Jungle Zone · act1` and the Home `LEVELS` card
both rendered plainly. The store still held **`dirtyActs: ["ojz/act1"]`**. To find out
whether my placement still existed **I had to query `window.__dbg.aeon.state()`** — a debug
door that exists only in a `VITE_AURORA_DEBUG=1` build.

I then clicked the empty Home tab body and pressed **Ctrl+S** — the remedy the dirty dot's
own tooltip names. `dirtyActs` was `["ojz/act1"]` before and **`["ojz/act1"]` after**, with
**no toast, no error, no message of any kind**. Plan:
`scratchpad/uxb/plans/s6-hidden-dirty-2.json` and `scratchpad/uxb/plans/s6-ctrls-from-home.json`. Evidence:
`23-tab-closed-while-dirty.png`, `24-ctrl-s-from-home.png`.

**Knew from source?** Partly, and it matters in the direction that makes this worse. I only
knew *where to look* for the truth because the debug build gave me `__dbg.aeon.state()`.
**A user has no such door**, so the cost figure here is a floor, not a measurement: for a
user the state is not merely hidden, it is unobtainable. This is my sealed test's finding
class 5 exactly — *"a true belief about my own data was destroyed."*

---

### F4 · Pressing the emulator status badge produces no visible response at all; its refusal lives only in a hover tooltip, and one of its two texts is a raw errno

**Surface** S3 status bar, `Aether ◇ offline`. **Misses** checklist 2, and 5 for one of the
two texts.

**Receipt — INCURRED.** I pressed **`Aether ◇ offline`** at **(1343, 861)** and waited
5.5 s. Screenshots `04-aeon-opened.png` and `05-aether-badge-pressed.png` are **the same
screen** — same badge text `Aether ◇ offline`, same computed colour `rgb(110, 117, 137)`,
no toast, no dialog, no change anywhere. **I pressed it a second time**, because the first
press had produced nothing that a person could see. Still nothing:
`{ visibleText: "Aether ◇ offline", colour: "rgb(110, 117, 137)", anyDialog: false }`. I
learned that it had failed only by reading the button's `title` attribute out of the DOM.

The two refusal texts, at two dead socket paths:

1. `Error: Aether socket path is 111 bytes; a unix socket path must be under 104. Set ORACLE_SOCKET to something shorter. Path: /tmp/claude-1000/…/dead-uxb.sock`
   — names the constraint, the remedy and the offending value. **Passes checklist 5 on content, and handsomely.**
2. `Error: Aether socket error: connect ENOENT /tmp/uxb-dead.sock`
   — a raw Node errno. It does not say what Aether is, that an emulator has to be running,
   or that `ORACLE_SOCKET` is what selects the path. **Fails checklist 5.**

**Both fail checklist 2 identically**, and that is the finding that outranks the wording:
neither message is *shown*. The button that failed is the only surface carrying the
explanation, and it carries it in a channel that requires you to already suspect a failure
and hover on the thing you just pressed.

**Knew from source?** The socket precedence chain was given to me in my brief. The two
message texts, the absence of any visible response, and the identical screenshots are all
gesture-measured.

**Count.** Two presses, one to act and one because the first appeared not to register.

---

### F5 · Typing into the Explorer filter with no project open deletes the panel's only control and replaces it with "No matches"

**Surface** S1/S2, Explorer `Filter…`. **Misses** checklist 2, 3 and 5.

**Receipt — INCURRED.** On the cold Home screen I clicked the **`Filter…`** box at
**(129, 56)** and typed `z`, `o`, `n`. The sidebar's **`Open Project…`** button — the only
control in the panel — **disappeared**, and the text **"No matches"** took its place
(`02-home-filter-typed.png`). The box has no clear (✕) affordance. I pressed **Backspace
three times** to get the button back, and confirmed it returned
(`"No project\nOpen Project…\n…"`).

"No matches" also misdescribes the state: with no project open there is nothing to match,
so the honest message is "no project open", not "no matches". It names no remedy.

**Knew from source?** No.

**Count.** 3 characters typed, 3 undone to restore a control the filter had no business
removing.

---

### F6 · The command palette has no visible affordance and is not on either conventional shortcut

**Surface** S6. **Misses** checklist 1.

**Receipt — INCURRED.** I pressed **Ctrl+P** — nothing (`inputs: ["Filter…"]`). I pressed
**Ctrl+Shift+P** — nothing (`inputs: ["Filter…"]`). I pressed **Ctrl+K** — the palette
opened (`inputs: ["Filter…", "Run a command…"]`). Three presses to reach one control.
There is no menu, button, badge or hint anywhere on any screen I walked that names it. The
app *does* surface shortcuts in tooltips elsewhere — `Collapse explorer (Ctrl+B)` — so the
channel exists and this control is simply not on it. Evidence: `38-command-palette.png`.

**Knew from source?** **Yes, and it makes this figure a floor rather than a measurement.**
I knew a command palette existed at all only because I had seen
`src/renderer/shell/commands.ts` while checking whether "Open Project…" was a native
dialog. A user with no such prior has no reason to press *anything*, so their cost is not
two wasted keystrokes — it is never finding the feature.

**Count.** 2 wasted presses out of 3.

---

### F7 · A level document has no Save control anywhere; a sprite document in the same tab strip has one

**Surface** S2/S3 toolbars. **Misses** checklist 3 (same behaviour as the controls beside it).

**Receipt — INCURRED.** Looking for how to save the level I had just dirtied, I checked the
level tab's toolbar on **all seven** aeon facets and on the classic Layout facet. It is
`FG · BG · View · Undo · Redo` on six of them, `Undo · Redo` on Art, and there is no Save
in the status bar either — the censuses in §1 are the screen reads. **I learned that Ctrl+S
is the path by reading the `title` attribute of the tab's dirty dot.** The **sprite**
document's toolbar, in the same tab strip one tab over, is `Undo · Redo · **Save**`
(census in `scratchpad/uxb/plans/s5-sprite.json` output; `39-sprite-document.png`).

Two document kinds in one tab strip; one advertises its save, the other hides it in a
tooltip on a status glyph. Combined with F3 this is why the Ctrl+S dead end was reachable
at all.

**Knew from source?** No — every census here is a screen read taken during the walk.

---

### F8 · A brand-new art document the app itself calls "unsaved" is destroyed by a project switch, with no prompt — ⚠ door-observed, not button-observed

**Surface** S4 / S6. **Misses** checklist 4 and 5.

**Receipt — INCURRED, with the caveat below carrying the whole discount.** I had a New Tile
document open on the Art facet whose status bar read **`New Tile (1×1) | unsaved`**,
holding the pixel from F1. I then opened a second project (the classic `s1disasm` copy) and
subsequently came back. The level tab returned on the Art facet with its dirty dot, its
facet and its 10 objects all correctly restored — and the status bar read **`no document`**.
The art document is gone. Nothing asked; nothing said. The same round trip also removed the
**`Untitled Sprite`** tab (`spriteTabGone: true`) — a document that had never existed on
disk — and it did not come back. Evidence: `41-classic-opened.png`,
`43-unrecognized-project.png`, `45-view-menu.png` (`no document`).

**⚠ THE CAVEAT, AND IT IS THE POINT.** The project switch was driven through
`window.__dbg.openDir(…)`, **not** through the `Open project…` button, because that button
opens a native `dialog.showOpenDialog` modal I had no way to dismiss (H1). **A guard living
in the button's own handler would be invisible to me.** Read this as *the state transition
destroys the document*, not as *the button destroys the document*. It is filed rather than
binned because the destruction itself is an event I watched, and because the state
transition is the one every path must go through; it is discounted because the path I took
to it is not the user's.

**Knew from source?** I read `src/main/ipc-handlers.ts` only to establish that the button
was a native dialog and therefore undrivable. I did not read the open handler.

**Note in the app's favour, from the same run.** The round trip *correctly and silently*
restored the aeon project's whole tab set, the level's facet, its dirty flag and its ten
unsaved objects. The level half of this is good behaviour; the ephemeral-document half is
not.

---

### F9 · Undoing back to the starting state leaves the document marked dirty

**Surface** S2 tab dirty dot / S3. **Misses** checklist 2 (small).

**Receipt — INCURRED, and small; filed because it is cheap to fix and it degrades F3.**
I placed two objects (`Objects 8 → 9 → 10`), then pressed **`Undo`** twice
(`10 → 9 → 8`) — back to the count the document started at. `dirty` was still **`true`**
and `dirtyActs` still `["ojz/act1"]`, and the tab still carried its dot (visible in
`25-facet-effects.png`). **The cost:** to decide whether the document actually differed
from disk I had to compare the object count against the number I had written down at the
start of the walk, because the dot could no longer tell me. That is a lookup I would not
have had to make if the dot cleared at the saved point.

**Knew from source?** No.

---

### NEAR-MISS N1 · I nearly filed the disabled Explorer library rows as a missing-message defect

**Surface** S2 Explorer, `OBJECT LIBRARY` rows.

I pressed **`Spring`** in the Explorer at **(120, 268)**; it is a `disabled` button with
`cursor: not-allowed` and nothing happened. I was about to file "a disabled row that
refuses without saying why".

**What stopped me:** before writing it I read the element's `title`, which says
**`no sprite bound`**. So the app *does* explain itself.

Filed as a near-miss rather than dropped, because **the thing a fix would have to replace
is the hover**. I only found that explanation because F4 had already put me in the habit of
reading `title` attributes out of the DOM — which is not a habit a user has. A user who
clicks a greyed row and sees nothing is in exactly F4's position. And the message names a
state, not a remedy: it does not say how a sprite gets bound.

---

## 3. Inspection hazards — NOT walk findings, no gesture behind them

Kept separate so the walk's authority cannot leak onto them.

- **H1.** Both `Open Project…` buttons and the palette's `open-project` command route to
  `dialog.showOpenDialog(window, …)` (`src/main/ipc-handlers.ts:67` and `:104`), a native
  modal parented to the window. **I pressed none of them and this audit says nothing about
  what they do.** Everything about project opening in this report went through a debug door.
- **H2.** If Aurora has a native application menu (File / Edit / View), this audit is blind
  to it: `Page.captureScreenshot` captures the page, and a native menu bar is drawn by the
  window frame outside it.
- **H3.** Whether a quit or a real window close is guarded when documents are dirty is
  **untested**. Given F2 (a tab closes silently while dirty) and F3 (the dirty state has no
  surface once the tab is gone), this is the most valuable single thing a follow-up could
  measure, and it needs a real window-close gesture, which my rig could not send.
- **H4.** The `New` button beside the `new_scene_id` field on the Effects facet is
  `disabled` with **no `title`** (`newBtnTitle: null`). I observed the disabled state; I
  did not establish what enables it, so this is inspection, not a finding.

---

## 4. Bin count — 41 candidate observations, 9 filed, **32 binned**

A bin count that collapses to zero is evidence the reviewer stopped applying the test, so
here is the discarded pile, named. Every one of these fails the receipt test: I can point
to no moment in this walk when it cost me an undo, a repeat, a hunt, a lookup, a false
belief, or a destructive step I caught myself at.

1. `Open Project…` (capital P) on the cold Home vs `Open project…` (lowercase) on the Home
   with a project. Same action, two spellings, adjacent screens. I read both correctly on
   first look.
2. Two boxes labelled `Filter…` visible at once (Explorer, and the Objects panel) filtering
   different things. I never typed in the wrong one.
3. Every object marker on the map canvas renders as `s…` — two characters. I never needed
   to tell two apart during this walk. *(If a session ever required identifying objects
   from the canvas, this files immediately, on the count.)*
4. `Project Setup` shows the user a roadmap item: *"the full mapping-layer editor arrives
   when aeon becomes a profile (Stage 3)."* Internal vocabulary; cost me nothing.
5. The command palette holds six commands and none of them is Save (or Undo, or Redo).
   Noticed; never needed.
6. Pressing Pencil with no art document open is a silent no-op, and the tool dock is fully
   enabled with nothing to paint on. **Binned deliberately:** the centred `New Document`
   chooser answers the question before a real user could make that mistake, and I only made
   it as an audit gesture.
7. The Art facet's toolbar drops `FG · BG · View`, which every other facet has.
8. The aeon Layout tool dock has 7 tools, the classic one has 3, and the shared
   `Stamp Chunk` sits at a different index in each.
9. The Effects panel's prose is engine-internal: *"nothing threads
   `ojz_act1_sec_raster(sec: 0)`"*.
10. The `Close tab` ✕ appears only on the active tab.
11. The unrecognized-project banner never auto-dismisses.
12. Explorer rows are 20 px tall and dense. I clicked the row I wanted, first try, every
    time — this is the case my sealed test §4 concedes it handles badly, and I am binning
    it with that concession attached rather than quietly.
13–32. Twenty more of the same character: capitalisation, iconography, panel header case,
    accent colours, spacing, label wording I read correctly the first time, the `?` prefix
    on `? Guide`, the `M:off` / `PP` / `Rpt` abbreviations in two toolbars, the `∞ Loop`
    glyph, the mixed use of `—` and `·` as separators, and so on.

⚠ **One class of binned observation deserves naming so nobody re-files it out of my
transcript.** Three times a plan pressed a coordinate measured in an *earlier* step, the
panel had reflowed in between, and the press landed on a different control — once creating
an `Untitled Sprite` I did not want, which looked exactly like "a one-click destructive
action sits directly under a section header". **That was my harness, not Aurora.** I fixed
it by adding a locate-then-press step (`clickAt`) to `scratchpad/uxb/act.mjs` — the
coordinate is measured in the page immediately before a real `Input.dispatchMouseEvent` —
and stopped counting those. They are not in the 41.

---

## 5. What the application does well — stated because the ledger above is one-sided

The receipt test only ever files costs, so a reader of §2 alone would get a false picture.
Three things I pressed that are exemplary, and one of them is the best refusal I have seen
in this repo:

- **The delete-scene confirmation.** Pressing `Delete` on the Effects `SCENE:` header
  produced:
  > **Delete scene "ojz_act1_start"?**
  > Its file `games/sonic4/data/editor/effects/ojz_act1_start.json` is removed from disk
  > the next time you save. Until then Ctrl+Z puts it back; once the save has run it is
  > gone, and Aurora keeps no copy of it.
  > `[Delete scene]` `[Cancel]`

  It names the file, the timing, the recovery gesture and the point of no return. **And it
  is true** — I confirmed the delete (scenes `4 → 3`), pressed **Ctrl+Z**, and the scene
  came back (`3 → 4`). Evidence: `26-scene-delete-pressed.png`, `27-scene-deleted.png`,
  `28-scene-after-ctrlz.png`. This is what F1, F2 and F4 should be measured against.
- **The unrecognized-project banner** names exactly what each engine needs:
  *"• Sonic 1 disassembly expects: `sonic.asm` + `artnem/` + `map256/` + `levels/`
  • Aeon project expects: `project.json` (engine "s4")"*, with a `Dismiss`.
  `43-unrecognized-project.png`.
- **Two empty states that name the remedy:** *"No object selected. Use the Select tool and
  click an object marker."* and the Collision panel's *"Pick a shape, then paint on the
  map. Paints just this block; hold Alt to paint every block with the same tiles."*

---

## 6. Evidence

`docs/reviews/2026-09-07-lens-ux/uxb/`, PNG, committed on this branch. **38 of the 40
allowed** — I did not hit the cap, but I came close enough to prune rather than risk it.

I captured 46 and **dropped 8**, so the numbering has gaps. Dropped,
with the reason: `06-aether-hover-tooltip` (a native tooltip is drawn by the browser chrome
and does not appear in a page capture, so it proved nothing) · `12-facet-layout`
(duplicate of `04`) · `15-place-armed`, `17-after-second-place`,
`20-reopened-after-silent-close`, `21-dirty-before-close`, `22-home-with-hidden-unsaved`
(each superseded by a later, cleaner capture of the same state — `16`, `18`, `23`
respectively) · `37-command-palette-attempt` (the failed Ctrl+P press produced no visible
change, so the image is the unchanged screen).

Instruments, committed: `scratchpad/uxb/session.mjs`, `scratchpad/uxb/act.mjs`,
`scratchpad/uxb/drive.mjs`, and the `steps/` and `plans/` each finding cites by name.
