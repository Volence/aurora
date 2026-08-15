# Task 14 — the origination canvas, verified in the running app

**Status: DONE_WITH_CONCERNS.** All 14 rows of the plan's Task 14 table were driven in the
running Electron app against the real `s1disasm` project (GHZ act 1), over CDP, with real
pointer strokes, real keystrokes, real tab clicks and real pixel readback. **52 checks, 49
pass, 3 fail** — and all three failures are real product gaps in the New Canvas dialog, each
one a question the plan's row 11 asked by name. Every negative control reported FAIL as it
should.

**Three original bugs were reintroduced into the actual source, rebuilt, and watched to
fail** (`levelKeysEnabled`, the two-tier grid weight scale, the `sidecarRejected`
pass-through), then reverted and re-confirmed green. One of those plants *did not* fail on
the first attempt — that is recorded below, because the plan's own prediction for row 8 turns
out to be wrong about the mechanism, and finding that out is the reason the plant was worth
running.

Nothing here is inferred from the node suite. Where a row could not be driven end to end, it
says so and says exactly where it stopped.

## The harness

`scratchpad/canvas-cdp-harness.mjs`, modelled on `scratchpad/paint-through-harness.mjs`:
same launch discipline (detached `xvfb-run` + `electron`, kill the process group, verify the
debug port is free before *and* after), same evidence discipline (pixel readback off the real
canvas, undo counted via the header's Undo chip plus a dispatched `Ctrl+Z`, negative controls
that must themselves report FAIL).

```bash
VITE_AURORA_DEBUG=1 npx electron-vite build
node scratchpad/canvas-cdp-harness.mjs          # all 14 rows, ~13 minutes
ONLY=10 node scratchpad/canvas-cdp-harness.mjs  # one row, for a falsification pass
```

Screenshots land in `scratchpad/shots-canvas/` (32 PNGs + `results.json`).

**What differs from phase 1: this harness owns four app SESSIONS, not one.** Three rows need
the app restarted, so `session(label, body)` launches, runs a body and tears down, and a run
is a sequence:

| session | what it is for |
|---|---|
| A | rows 1–12 + the refused-create invariant. Clears `localStorage`, opens `s1disasm`, loads GHZ 1. |
| B | row 13, first half — restart with a canvas as the active tab. |
| C | row 13, second half — restart with the PNG deleted from disk between sessions. |
| D | rows 11/14 — restart with the sidecar hand-edited into invalid JSON. |

Two things about the restarts are worth stating because they are not obvious and both cost
real time to discover:

- **Aurora does not reopen the last project by itself.** The stored session is keyed by
  project directory and restored by the key-change effect, so a "restart" in row 13's sense
  is: relaunch, open the project, watch the session come back. The harness does not clear
  `localStorage` in sessions B/C/D.
- **The teardown has to close the window, not just signal the process.** Chromium commits a
  `localStorage` area on a throttled timer and on unload, so `SIGTERM`/`SIGKILL` alone loses
  the last writes. This is measured, not assumed — see "A failure that was mine" below.

### What I added to `__dbg`

**`window.__dbg.canvas.*`** (`src/renderer/debug-hooks.ts`) — a **strictly read-only** probe
surface: `docIds()`, `activeDocId()`, `state(docId)`, `pixelsHash(docId)`,
`drawnPixels(docId)`, `paletteWords(docId)`, `pixelAt(docId,x,y)`, `paintIndex()`,
`visibleGrids()`, `toasts()`. There is deliberately no `createCanvas`, no `setPixels` and no
`save`: every mutation in this run went through the real UI — the dialog's own fields, real
`Input.dispatchMouseEvent` strokes on the real `PixelViewport`, real `Ctrl+Z`/`Ctrl+S`, real
clicks on the tab strip and the Explorer. These only answer "what does the store now hold", so
an on-screen observation can be corroborated at the byte level.

**`window.__dbg.canvas.projectOpenGuard()`** is the one exception and needs its own
justification, given below under row 9. It calls `confirmProjectOpen()` — the same function,
with the same arguments, that `useProject`'s `openPath` calls one line before it opens a
directory. It is the mechanism, not a stand-in for it.

## Setup, once, from the real doc

GHZ act 1: 965 pool tiles, 439 blocks, 82 chunks — the same numbers phase 1 pinned. The zone
palette that seeds row 1's canvas is the live `classicLevelStore.doc.palettes`, and the
canvas's own 64 words are compared against what the palette grid actually renders, not against
an expectation.

---

## The 14 rows

### 1 — New Canvas, 64×64, Genesis level art

**PASS.** Opened the dialog from ⌘K (typed "New Canvas", Enter), typed `ghz-cliffs` into the
name field with real key events, replaced both size fields with `64`, left the profile on
*Genesis level art*, clicked **Create**.

A canvas tab opened and the pane mounted a real `<canvas>`. The store reports
`{name: "ghz-cliffs", width: 64, height: 64, profileId: "genesis-level-art", gridOrigin: {0,0},
dirty: false, source: {pngPath: ".aurora/canvas/ghz-cliffs.png",
sidecarPath: ".aurora/canvas/ghz-cliffs.canvas.json", sidecarRejected: false}}` and
`activeDocId === "doc:canvas:ghz-cliffs"`.

**The palette is the zone's, not black:** 61 of 64 words are non-zero, and the 64 swatches the
`PaletteGrid` actually renders show **43 distinct backgrounds** — read off `getComputedStyle`,
not off the store. The first eight are `rgba(0,0,0,0)` (the transparent checker),
`rgb(0,0,0)`, `rgb(36,36,146)`, `rgb(73,73,182)`, `rgb(109,109,219)`, `rgb(146,146,255)`,
`rgb(255,255,255)`, `rgb(182,182,182)` — Green Hill's blue ramp.

**Falsified by:** a planted assertion that the palette is entirely black — correctly reports
false (61 non-zero words). Shot `04-canvas-created.png`.

### 2 — draw a stroke

**PASS.** Clicked the Pencil in the real tool dock, clicked the swatch that arms canvas index
6 (matched by its own title, `line 0, index 6 — paints 6`), then dragged from art (10,10) to
(40,40) in 10 batched `mouseMoved` events.

Drawn pixels went **0 → 31**. The screen pixel at art (20,20) went `42,42,58,255` (the
transparent checker) to `255,255,255,255`. The tab's unsaved dot appeared: store `dirty`
false → true, and the count of `span[title^="Unsaved changes"]` on screen went 0 → 1, on the
tab titled `Canvas · ghz-cliffs`.

**Falsified by:** a planted assertion that the screen pixel is unchanged — correctly reports
false. Shots `05-before-stroke.png` / `06-after-stroke.png`.

### 3 — Ctrl+Z once removes the whole stroke

**PASS.** The Undo chip was enabled immediately after the drag. **One** `Ctrl+Z`: drawn pixels
**31 → 0**, the document's buffer hash returned to exactly its pre-stroke value
(`1995431365`), and the Undo chip went disabled — i.e. the 31-pixel gesture was *one* entry,
and there was nothing else on the stack.

**Falsified by:** a planted assertion that the stroke survived — correctly reports false.
Shot `07-after-one-ctrl-z.png`.

### 4 — Ctrl+S clears the dot and both files exist

**PASS.** With the tab dirty, `Ctrl+S`: `dirty` true → false, the on-screen dot count 1 → 0,
and `.aurora/canvas/ghz-cliffs.png` (400 bytes, up from the 301 written at creation) plus
`.aurora/canvas/ghz-cliffs.canvas.json` are both on disk — checked from node with `fs`, not
through the app. The sidecar reads
`{ "version": 1, "profile": "genesis-level-art", "palette": [0, 0, 2082, 2628, 3174, …] }`.

### 5 — the PNG opens outside Aurora

**PASS.**
`file(1)`: `PNG image data, 64 x 64, 8-bit colormap, non-interlaced`.
The IHDR bytes parsed independently in node: `{width: 64, height: 64, bitDepth: 8,
colorType: 3}` — colour type 3 is indexed. 61 of 4096 pixels are non-zero in the document
that was written, and the drawn X is visible in `25-sidecar-rejected-toast.png`, which shows
the same file after a reload.

### 6 — close the tab, reopen the canvas

**PASS.** Closed the tab with a real mousedown on its own `×` (the tab strip listens for
mousedown, not click — a `.click()` here silently does nothing). Reopened it from the
**Explorer**: typed `ghz-cliffs` into the real filter field, which force-expands the groups,
and clicked the row.

Pixel hash `203401955` → `203401955`, **byte-identical**; the 64 palette words identical; the
reopened state `{w: 64, h: 64, profile: "genesis-level-art", dirty: false}`.

**Falsified by:** a planted assertion that the reopened document is blank — correctly reports
false (61 drawn pixels). Shot `11-reopened-from-explorer.png`.

### 7 — two canvases, each with its own pixels and its own dot

**PASS.** Created a second canvas (`second`, 48×48), drew a rectangle on it with a different
colour, then switched A → B → A by clicking the tabs.

A: `activeDocId = doc:canvas:ghz-cliffs`, buffer hash `203401955`, the mounted canvas
**640×640** (64px at 10×), composed-bitmap hash `1658551241`.
B: `activeDocId = doc:canvas:second`, buffer hash `229469433` (1225 drawn), the mounted canvas
**672×672** (48px at 14×), composed-bitmap hash `1956293508`.

Dots: only `second` (and `gridtest`, row 10's own canvas) carry one; `ghz-cliffs`, which had
been saved, does not.

**Falsified by:** a planted assertion that both tabs render the same bitmap — correctly
reports false. Shots `12-second-canvas.png` / `13-switched-back-to-A.png`.

### 8 — Ctrl+Z with a canvas tab active does not touch the level

**PASS — and this row's assertion had to be rewritten, see the falsification section.**

Focused the level tab, went to the **Art** facet → **Chunk** tier → **Paint**, and painted one
pixel: the classic pool moved `{tiles: 965, blocks: 439, chunks: 82}` →
`{blocks: 440}`, so a real, undoable level edit was on the stack. Focused the canvas tab, drew
a stroke, pressed `Ctrl+Z` once.

- **8a:** the canvas's buffer hash changed (`3211761003` → `203401955`) — the canvas undid —
  and the classic pool was **unmoved** at `{965, 440, 82}`.
- **8b:** drew **two** separate strokes on the canvas (77 drawn, hash `470095601`; then 93
  drawn, hash `880481923`) and pressed `Ctrl+Z` **once**: back to 77 drawn, hash `470095601`
  — exactly one entry consumed, with the level pane mounted (`display: none`) and its keydown
  handler registered the whole time.

**Falsified by** planted assertions on both halves (the pool moved; one Ctrl+Z collapsed both
strokes) — both correctly report false — **and by breaking the real code**, below.

### 9 — switch projects with a dirty canvas

**PASS, with one part of the route not driven.** Dirtied `ghz-cliffs` with a stroke, then ran
the project-open guard.

- **9a:** the real `ConfirmDialog` appeared, `aria-label="Unsaved changes"`, body *"Opening a
  project discards unsaved edits and undo history in the current one."*, buttons
  `["Save & open", "Discard & open", "Cancel"]`.
- **9b:** clicked **Cancel** with a real mouse event — the guard answered `false`, all five
  canvas documents stayed open, and `ghz-cliffs` was still dirty.
- **9c:** raised it again and clicked **Discard & open** — the guard answered `true`, every
  canvas document was dropped (`docIds() === []`, `activeDocId === null`), and
  `ghz-cliffs.png` on disk is **byte-identical** before and after (400 bytes, `Buffer.compare
  === 0`): the unsaved stroke was not written into the project being left.

**Falsified by:** a planted assertion that the discard wrote the stroke to disk — correctly
reports false.

**What was NOT driven, and why.** The guard runs inside `useProject`'s `openPath`, whose only
two entry points are **"Open Project…"** — which begins with `window.api.selectDirectory()`,
an OS folder picker CDP cannot drive — and the **"Open recent"** commands, which
`buildCommands` emits *only* while `engine === null`, i.e. never while a project is open,
which is the only state in which a dirty canvas can exist. So the harness calls
`confirmProjectOpen()` itself, exactly as `openPath` does, and drives the dialog that appears.
**The folder picker is the only skipped part**; the guard, its copy, its buttons, its
save/discard branches and the disk check are all real. The subsequent `openDirectory` is
deliberately not performed, so the session survives to be measured.

Shots `17-project-switch-confirm.png`, `18-after-discard-and-open.png`.

### 10 — the offset grid

**PASS on all four sub-checks, and this is the row that was worth the most care.**

Done on **its own canvas** (`gridtest`, 64×64), flood-filled with a single colour first. Grid
strokes are alpha-composited over the art, so measuring them over a checkerboard or over
existing strokes measures the art rather than the grid. A dedicated uniform ground makes every
sample literally "background, or background plus the grid stroke" — and the harness asserts
that ground is uniform before it asserts anything else (check `10z`).

Turned on both the **8** and **16** grid chips in the real options bar (`visibleGrids` →
`[8, 16]`), at 11× zoom. Sampled backing-store pixels by device column, re-deriving the zoom
on every read.

**Origin (0,0)** — the *shared viewport's* path (`planCanvasGrids` → `layerGrids`):

| what | art column | colour |
|---|---|---|
| background | 5, 13 | `73,73,182` |
| 8px line | 8, 24, 40 | `95,95,190` |
| 16px line | 16, 32, 48 | `130,130,204` |

**Origin (3,3)** — the *pane's own underlay* (`CanvasHost.drawUnderlay`):

| what | art column | colour |
|---|---|---|
| background | 6, 14 | `73,73,182` |
| 8px line | 11, 27, 43 | `95,95,190` |
| 16px line | 19, 35, 51 | `130,130,204` |
| old 8px column | 8 | `73,73,182` (plain background) |
| old 16px column | 16 | `73,73,182` (plain background) |

So: the guides **moved** by exactly 3, and every line is drawn at **exactly the same colour**
it had when aligned — the offset 8px mesh does not brighten, and the 16px block grid stays
clearly distinct from it (`130,130,204` vs `95,95,190`). The full 40-column device-pixel scans
at both origins are in the log and in `results.json`.

**Falsified by** two planted assertions (the offset 8px mesh matches the 16px weight; the grid
did not move at all) — both correctly report false — **and by restoring the two-tier scale in
the real source**, below. Shots `09-grid-origin-0.png`, `10-grid-origin-3.png`.

### 11 — the New Canvas dialog itself

**Nine sub-checks pass, three fail.** This is the first time this component has rendered, and
the three failures are exactly the three "polish nobody has seen" questions the plan listed.

**Passing:**

- **11a** it opens from ⌘K and renders.
- **11b** it opens with **no** refusal on screen and Create **disabled** (`opacity 0.5`).
- **11c** it opens on the documented defaults: `128 × 128`, *Genesis level art*, with all four
  profiles offered (`genesis-level-art`, `genesis-sprite`, `genesis-unrestricted`, `none`).
- **11d** `autoFocus` lands on the name field.
- **11f/11g** typing `sky tiles` shows the name rule inline and disables Create. Measured on
  screen: **426 × 62 px in a 460px panel, line-height 16.5px → 4 lines**. It wraps; nothing is
  clipped.
- **11n/11o** typing the name of a canvas that already exists refuses it **with the path**:
  *"A canvas named "entertest" already exists (.aurora/canvas/entertest.png). Creating over it
  would replace that art with a blank canvas — pick another name, or open the existing one
  from the Explorer."* — 426 × 62 px, 4 lines, inside the 460px panel, not clipped.
- **11h** Enter on an invalid name neither creates nor closes.
- **11k** Escape closes it.
- **11l/11m** clicking the backdrop with a filled-in form (`backdroptest`, 200 × 200) closes it
  **without asking**, and reopening gives a fresh form (`name: ""`, `128/128`).

**Failing — three real gaps:**

- **11e — THERE IS NO FOCUS TRAP.** Eight `Tab` presses from the name field walk:
  `INPUT/number → INPUT/number → SELECT → BUTTON(Cancel) → BUTTON(Create)` and then **out of
  the dialog** into the application behind it — the next four landed on elements outside the
  panel (`[OUTSIDE]` in the log). A modal that leaks focus lets a keyboard user tab onto the
  Explorer and the level editor while the dialog is still up.
- **11i — an emptied number field shows a literal `0`.** Select-all + Backspace in the width
  field leaves the field reading `"0"`, a value the user did not type. `onChange` does
  `Number(e.target.value)` and `Number("") === 0`. Worse, the refusal shown at that moment is
  about the **name**, not the width (`validateNewCanvas` checks the name first), so the user
  sees a `0` they did not enter and a message about a different field. Screenshot
  `03-dialog-emptied-width.png`.
- **11j — Enter does not submit from a number field.** With a fully valid form
  (`entertest`, 64 × 64), pressing Enter with the height field focused leaves the dialog open
  and creates nothing. Only the name `<input>` carries an `onKeyDown` Enter handler; there is
  no `<form>`, so there is no implicit submission from the others. (The harness then clicks
  **Create**, which works, and 11n's collision test runs against the canvas that produces.)

Shots `01-dialog-open.png`, `02-dialog-refusal-unsafe-name.png`,
`02b-dialog-refusal-collision.png`, `03-dialog-emptied-width.png`.

### 12 — create a canvas with no zone open

**PASS.** Put the classic level store back to idle (`{status: "idle", zone: null, act: null}`)
with the project still open, then created `nozone`, 64 × 64.

**59 of 64 palette words are non-zero and the swatch grid renders 59 distinct backgrounds** —
the four ramps, not black. The brush is armed on canvas index **15**, whose word is `0x0EEE`
(white), and the status bar reads `nozone · Genesis level art · 64×64 · colour 15 · line 0 idx
15 · 11× zoom` — line 0's brightest entry, exactly as R18 specifies.

Then drew a stroke to check the claim on screen rather than in the store: the pixel at art
(20,20) went `42,42,58,255` → `255,255,255,255`.

**Falsified by:** a planted assertion that the canvas is black on black — correctly reports
false. Shots `15-no-zone-canvas.png`, `16-no-zone-stroke.png`.

### 13 — restart, and restart again with the PNG deleted

**PASS on all four sub-checks**, after one harness defect was found and fixed (below).

- **13a-tab:** session A exited with `Canvas · ghz-cliffs` focused and everything saved.
  Session B relaunched, opened the project, and the tab strip came back as
  `["Green Hill Zone Act 1", "Canvas · gridtest", "Canvas · ghz-cliffs", "Canvas · second"]`.
- **13a-focus:** the stored session handed to the restore carries
  `activeId: "doc:canvas:ghz-cliffs"`, and after the restore the live session still holds it.
- **13a-pixels:** pixel hash `203401955` → `203401955`, byte-identical; 61 drawn pixels both
  sides; a real `<canvas>` mounted. **Falsified by** a planted "the restored document is
  empty" — correctly reports false.
- **13b-toast:** with `ghz-cliffs.png` deleted between sessions, the restore *did* run its
  canvas activation (the stored `activeId` proves it) and its load *did* fail — and **no toast
  appeared at boot**, in the store or in the DOM.
- **13b-pane:** clicking the tab afterwards — a user's own click, which *should* report —
  raises `Could not open the canvas "ghz-cliffs": ENOENT: no such file or directory, open
  '/home/volence/sonic_hacks/s1disasm/.aurora/canvas/ghz-cliffs.png'` and shows the "could not
  be loaded" pane: *"This canvas could not be loaded, so the tab has no document. Its files are
  .aurora/canvas/ghz-cliffs.png and the sidecar beside them — check they are still there and
  readable."* with a **Retry** button.
- **13c:** Retry with the file still missing re-runs the real load, reports the same ENOENT and
  stays on the pane.
- **13d:** restored the PNG on disk and pressed Retry again — the document came back
  (`docIds()` includes it, the card is gone, 61 drawn pixels).

Shots `20-restart-canvas-restored.png`, `20b-restart-canvas-focused.png`,
`21-restart-png-deleted.png`, `21b-unloaded-pane.png`, `22-retry-still-missing.png`,
`23-retry-recovered.png`.

### 14 — the sidecar-rejection toast, read on screen

**PASS on all six sub-checks.** Between sessions the sidecar was hand-edited to
`{ "version": 1, "profile": "genesis-level-art", "DELIBERATELY BROKEN": "…", "gridOrigin":
{ … }, }` — a trailing comma, R12's own example.

- **14a:** the canvas still **opens**, with `profileId` fallen back to `"none"` and
  `source.sidecarRejected === true`.
- **14a2:** the **load itself** warns, before any save (R12): *"Canvas "ghz-cliffs": the
  sidecar could not be read (sidecar is not valid JSON: Expected double-quoted property name
  in JSON at position 141 (line 1 column 142)); opening the art without it — the canvas is
  unconstrained until this is fixed, and the sidecar file will not be overwritten on save"*.
- **14b:** drew a stroke and pressed Ctrl+S. The toast reads, in full:

  > Saved the pixels of "ghz-cliffs", but not its settings:
  > .aurora/canvas/ghz-cliffs.canvas.json could not be read when this canvas was opened, so
  > Aurora left it alone instead of overwriting it. The constraint profile and grid origin were
  > NOT written. Fix that file by hand (it must be valid JSON) and reopen the canvas to recover
  > them.

- **14c — it is legible.** At a **1400px** window the toast box is **560 × 82 px at
  x 420..980**, `white-space: normal`, `overflow-wrap: anywhere`, about **5 lines**. The
  container's `max-width` resolves to `560px`; the strip is `pointer-events: none` and the
  toast itself `auto`.
- **14d — nothing is clipped.** `scrollWidth 558` vs `clientWidth 558`; `scrollHeight 80` vs
  `clientHeight 80`. The recovery instruction is the last sentence and it is on screen —
  visible in `25-sidecar-rejected-toast.png`.
- **14e — it stays long enough.** Still on screen at ~3.5s and at ~8.5s. **Falsified by** a
  planted "it vanished within 3.5 seconds" — correctly reports false.
- **14f:** a real click on the toast dismisses it (0 remain).
- **14g:** the unreadable sidecar was **left alone** — the `DELIBERATELY BROKEN` key is still
  on disk after the save.

### Extra — a refused create over a *dirty* canvas (the 4375bbb invariant)

**PASS.** With `ghz-cliffs` dirty and its tab active, opened the dialog and typed the name of a
canvas that is already open (`second`). The refusal appeared; the pane was sampled **eight
times over 1.2s** while it was on screen and the "could not be loaded" card was **never**
seen; `activeDocId` stayed on `doc:canvas:ghz-cliffs`; the buffer hash was unchanged; the
document was still dirty. Shot `18-refused-create-over-dirty-canvas.png`.

---

## The falsification cycles

### Plant 1 — revert the `levelKeysEnabled` canvas branch

`src/renderer/workspace/level-keys.ts`, `return !isSpriteDocTabId(activeId) &&
!isCanvasDocTabId(activeId)` → `return !isSpriteDocTabId(activeId)`. Rebuilt with
`VITE_AURORA_DEBUG=1`, re-ran `ONLY=8`.

**It did not fail. That is a finding, and it corrects the plan.** Row 8 as written asserts the
level does not undo, and the plan predicts "Ctrl+Z should fire both the canvas undo and the
hidden level undo". Reading the code after the plant refused to fail: `LevelWorkspace`'s
Ctrl+Z handler — the only Ctrl+Z handler gated on `levelKeysEnabled` — calls
`focusedHistory()?.undo()`, **the same function `CanvasMode`'s handler calls**, and with a
canvas tab active that resolves to the canvas document. So the ungated handler is not a second
*level* undo at all; it is a second caller of the *canvas's own* undo. The classic pool can
never move, and an assertion about the pool can never see the bug.

Rewrote row 8 to add **8b**: draw two separate strokes, press Ctrl+Z once, and require the
document to land on the state after stroke 1.

- **With the bug planted:** 8b **FAILED** — one keypress collapsed both strokes, the buffer
  hash returning all the way to the pre-stroke value `1995431365`. Two handlers, one keypress,
  two entries gone.
- **Reverted** (`git checkout`, `git status` clean for that file), rebuilt, re-ran `ONLY=8`:
  8b **PASSES** — two strokes at hashes `470095601` and `880481923`, one Ctrl+Z, back to
  `470095601`.

### Plant 2 — restore the two-tier grid weight scale

`src/renderer/components/canvas/CanvasHost.tsx`, `ctx.strokeStyle =
CANVAS_GRID_STROKE[g.weight]` → `ctx.strokeStyle = g.weight === 'chunk' ? CANVAS_GRID_CHUNK :
CANVAS_GRID_BLOCK` — i.e. the 8px mesh drawn at the block weight, which is both halves of the
historical defect. Rebuilt, re-ran `ONLY=10`.

- **With the bug planted:** 10b and 10d **FAILED**, exactly as described. At origin 3 the 8px
  mesh read **`113,113,198`** instead of `95,95,190` — visibly brighter — and the 16px lines
  read `144,144,210` instead of `130,130,204`. The offset-scan in the log shows it plainly.
  (10c still passed, because a 16px line is stroked twice — once by the 8px pass, once by the
  16px pass — so it compounds to a different value even when both use the same colour. Worth
  knowing: 10c alone would not catch this; 10b is the check that does.)
- **Reverted**, rebuilt, re-ran `ONLY=10`: all four **PASS**, back to `95,95,190` /
  `130,130,204`.

### Plant 3 — revert the `sidecarRejected` pass-through

`src/renderer/state/canvas-save.ts`, `saveCanvasFile(…, source.sidecarRejected, api)` →
`saveCanvasFile(…, false, api)`. Rebuilt, re-ran `ONLY=1,14`.

- **With the bug planted:** three failures, including the one that matters —
  **14g FAILED: the unreadable sidecar was silently overwritten.** No toast at save (14b, 14e
  failed too), the dirty dot cleared, and the file the user hand-edited replaced by a
  freshly generated one. That is the exact silent data loss R12/R15 describe.
- **Reverted**, rebuilt, re-ran `ONLY=1,14`: all ten **PASS**, `DELIBERATELY BROKEN` still on
  disk.

After all three cycles, `git status` shows no modification to any file other than
`src/renderer/debug-hooks.ts` (the probe additions), and `npx tsc --noEmit` plus
`npm test` (2701 passed / 3 skipped) are clean.

## A failure that was mine, not the app's

Row 13's focus check **failed for two full runs**, reporting that the tab focused at exit was
not focused after the restart — with the stored session apparently reverting to a value from
several minutes earlier. Rather than report that, I wrote a control that involves no Aurora
behaviour at all: `scratchpad/storage-flush-probe.mjs` writes two `localStorage` markers,
tears the app down exactly the way the harness does, relaunches and reads them back.

- Torn down with `SIGTERM`/`SIGKILL`: the early marker survived, **the late marker came back
  `null`**.
- Torn down with `window.close()` first: **both markers survived**.

Chromium commits a `localStorage` area on a throttled timer and on unload; a signal never
gives it the chance. The harness now closes the window before killing the process, and row 13
passes. **The two earlier "failures" were the harness dropping the evidence on the floor**, and
I would have reported a product defect that does not exist. The probe is committed alongside
the harness so the next person does not have to rediscover it.

Two smaller harness defects, both caught the same way — by a result that looked convenient
rather than by reading the code:

1. **`14a2` reported "the load does not warn" about a load it had itself hidden.** The harness
   dismissed all toasts and *then* clicked the tab — but the restore had already loaded the
   document, so the click resolved to a plain focus and raised nothing. Fixed by reading the
   boot toasts before touching anything.
2. **`11n` reported "no error shown" for a collision that could not happen.** It depended on
   `entertest` existing, which depended on `11j` (Enter from a number field) succeeding — and
   `11j` genuinely fails. The harness now creates that canvas with the button before testing
   the collision.

## What I could NOT verify, and why

- **The OS folder picker on the project-open route (row 9).** `window.api.selectDirectory()`
  is a native modal; CDP cannot drive it, and the "Open recent" commands are not emitted while
  a project is open. The guard itself, its dialog, both of its branches and the disk check were
  all driven; only the picker was skipped. See row 9.
- **Row 13 was driven with `__dbg.openDir` as the "open the project" step**, because Aurora has
  no auto-reopen and the UI route to opening a project is the same native picker. That call is
  `classicProjectStore.openDirectory`, which is what `openPath` calls; the session restore that
  row 13 is actually about is triggered by the resulting key change and was not bypassed.
- **The level workspace's own Undo chip could not be read** while the Art facet was mounted —
  `chipEnabled("Undo")` returned `null` there. Row 8 does not depend on it (the classic pool
  and the canvas buffer hash are stronger evidence), but "the level's Undo chip went
  enabled/disabled" is not something this run observed.
- **Only the classic (s1disasm) engine was exercised.** A canvas has no engine, and
  `buildCommands` gates New Canvas on any project being open, but an aeon project was not
  opened, so the aeon-side seeding fallback (`newCanvasPalette` with no classic doc) was
  covered only via row 12's no-zone path, not via an actual aeon project.
- **No sub-byte-depth or Aseprite-authored PNG was opened.** Row 5 checks the file Aurora
  wrote; the decoder's foreign-file paths (1/2/4bpp, every row filter, a short PLTE, a `tRNS`
  naming an index other than 0) are covered only by the node suite.
- **The three failing dialog checks were observed, not diagnosed to a fix.** I read the cause
  out of `NewCanvasDialog.tsx` in each case, but did not change it — this task is verification.

## Bugs and observations found

**Three defects, all in `NewCanvasDialog.tsx`, all first seen here:**

1. **No focus trap** (11e). Tab walks out of the modal into the app behind it.
2. **An emptied number field displays a literal `0`** (11i), and the refusal on screen at that
   moment is about a different field. `Number("") === 0` in `onChange`.
3. **Enter does not submit from the number fields** (11j). Only the name input has an Enter
   handler and there is no `<form>`, so there is no implicit submission.

**Two observations that are not failures but are worth recording:**

4. **A reopened canvas can arm an invisible brush** — R18's problem through the *reopen* door
   rather than the *create* door. `canvasStore.paintIndex` defaults to `canvasIndex(0, 1)`, and
   R18's `mostVisiblePaintIndex` is applied only in `createCanvasDocument`. Opening an existing
   zone-seeded canvas in a fresh session therefore arms index 1 — which in GHZ's palette is
   word `0` (black), per the sidecar this run wrote: `"palette": [0, 0, 2082, …]`. Visible in
   `25-sidecar-rejected-toast.png`: the status bar reads `colour 1 · line 0 idx 1` and the
   stroke drawn at y=50 is black on a dark checkerboard. The stroke *is* committed — it is only
   invisible-looking — so this is a usability trap of the same shape R18 fixed, not data loss.
5. **A backdrop click discards a filled-in form with no confirmation** (11l). Recorded rather
   than judged: it costs a retyped name and three fields, never art. Consistent with the
   dialog's own comment about Escape, and arguably fine — but it is now observed rather than
   assumed.

**And one correction to the plan itself:** row 8's stated symptom for the `levelKeysEnabled`
regression ("Ctrl+Z should fire both the canvas undo and the hidden level undo") is wrong. Both
handlers route through `focusedHistory()`, so the real symptom is a **double canvas undo** —
one keypress, two strokes gone. An assertion about the level's state cannot see it. Row 8b in
the harness is the check that can.

## Housekeeping

The harness creates `<project>/.aurora/canvas/` and wipes it at the start of every run, so a
run leaves five test canvases in `s1disasm` — one of them with a **deliberately corrupted
sidecar**, which would toast on the next open. That directory did not exist before this run
and has been removed again; re-running the harness recreates it.

## Files

- `src/renderer/debug-hooks.ts` — the read-only `__dbg.canvas.*` probe surface plus
  `projectOpenGuard()` (product code, tracked).
- `scratchpad/canvas-cdp-harness.mjs` — the harness.
- `scratchpad/storage-flush-probe.mjs` — the localStorage-durability control.
- `docs/superpowers/plans/2026-08-15-canvas-cdp-report.md` — this report.
- `scratchpad/shots-canvas/` — 32 screenshots and `results.json`.
