# ART-BRUSH-LATCH-REST, 2026-09-25: every input of an Art-facet tile-space stroke is latched at the press

**Branch** `parcel/art-brush-latch-rest`, base master `e1a26f54`. **Date** 2026-09-25.
**ROADMAP** §5.1 row 207.
**Source.** The hub ruling of 2026-09-25T07:43:58Z in the empyrean hub's OVERSEER-LOG (read at
`origin/main`, line 15151): "RULED: O1 (composer latches the paint plane at the press) and O2
(tile-stamp and palette-apply brushes read inputs per cell) = YES, latch at the press, on (a)'s
ground of 09-12T09:39:48Z and 18:49:16Z: a stroke's inputs latch when it starts. Same conditions:
red-first mid-stroke case; if a live per-cell read is deliberate and documented, stop and book it."
O1 and O2 are section 8 of `docs/reviews/2026-09-25-art-brush-word-latch.md`.
**Instrument.** Node: eight rows in the new
`src/renderer/components/art/__tests__/composer-brush-latch-rest-mounted.test.ts`, which mounts the
real `ComposerCanvas`. Live: PART `abl` of `scratchpad/map-behaviour-fixes-harness.mjs`
(`npm run harness:map-behaviour-fixes`, already registered, so `package.json` is unchanged).
**Not done.** No emulator was touched. No aeon build, sigil or `cargo` was run. Nothing was written
into the aeon tree: every live run opened a fresh rsync copy of it and deleted the copy afterwards.

---

## 0. The answer

| item | status | commit | proof |
|---|---|---|---|
| premise re-measured on this tree: seven inputs read per cell, none with a documented reason | **holds** | base `e1a26f54` | section 1 |
| O1: the composer's collision plane is latched at the press | **DONE** | `a88330fb` | sections 2, 3 |
| O2: the tile stamp's tile, line, priority, X flip and Y flip, and the palette-apply line, latched at the press | **DONE** | `a88330fb` | sections 2, 3, 4 |
| O3: a stroke switched to collision mid-drag painted an earlier collision stroke's word | **FIXED, because it fell out of O1/O2** (D2) | `a88330fb` | section 3 (its own row) |
| node rows, one per latched input (7) plus O3 (1) | 8 red under the revert, 8 green with the fix | `a88330fb` | section 3 |
| live row ABL.a, the Y flip toggled mid-stroke by a real Y key | red under the revert (tiles 3 and 4 took vf true), green with the fix | `8894d40a` | section 4 |
| live controls ABL.b, ABL.c, ABL.d | green on both trees | `8894d40a` | section 4 |
| harness finals | **30/30 PASS, 0 FAIL, 0 UNMEASURABLE in each of three all-part runs, and 6/6 in a PART abl run alone; dpr 1 in every run** | | section 4 |
| full `npm test` | exit 0, `Tests 10325 passed \| 9 skipped (10334)` | | section 5 |

## 1. The store reads, derived from source

Every store read in the composer's tile-space path at the base `e1a26f54`, classified before and
after. The path is `hostPointer.down` / `.move` (the object `ComposerCanvas` hands `PixelViewport`
while a tile-space tool is armed) into `applyTileCell(t, cx, cy)`, then `stampTile`,
`applyPaletteLineToDocCell` (`src/core/art/composer-buffer.ts`) or `paintDocCollision`
(`src/core/art/composer-collision.ts`). A count of
`useEditorStore|useProjectStore|useViewStore|useArtStore|getState` is 0 in both core files, so the
reads are all in the component. Line numbers are the base's.

| input | what it feeds | before | after |
|---|---|---|---|
| `collisionPaintPlane` | which plane `paintDocCollision` writes (collision branch, line 471) | **LIVE per cell** | **LATCHED** (`strokeLatch.plane`) |
| `brushTile` | the stamped cell's `atlasTile` (line 434) | **LIVE per cell** | **LATCHED** (`.tile`) |
| `paletteLine` (tile stamp) | the stamped cell's `pal` (line 435) | **LIVE per cell** | **LATCHED** (`.pal`) |
| `flipRef.current.hf` (the X key) | the stamped cell's `hf` (line 436) | **LIVE per cell** | **LATCHED** (`.hf`) |
| `flipRef.current.vf` (the Y key) | the stamped cell's `vf` (line 437) | **LIVE per cell** | **LATCHED** (`.vf`) |
| `stampPriority` | the stamped cell's `pri`, through `resolveBrushPriority` (line 450) | **LIVE per cell** | **LATCHED** (`.pri`) |
| `paletteLine` (palette apply) | the line `applyPaletteLineToDocCell` writes (line 457) | **LIVE per cell** | **LATCHED** (`.pal`) |
| the collision word (5 fields) | the painted word | latched per collision press (`paintBrushWord`, ART-BRUSH-WORD-LATCH) | **LATCHED** (`.word`), now at EVERY press (D2) |
| `artStore.open` (the document, its bounds, `liveTileIndex`, `bgOverride`) | the document being painted | live | live (the document, not a brush property) |
| `artStore.tool` | which branch `applyTileCell` takes | fixed per `hostPointer` (memo on `tool`) | unchanged (O3 below) |

**Deliberate?** No, for every input. `git log -S` puts the stamp's reads at `fbd85623` (2026-06-11,
"tile-stamp tool stamps brushTile per cell crossed ... with X/Y-key flip toggles shown in a corner
HUD") and the palette-apply read at `607f2fce` (2026-08-13). Neither message gives a reason for a
per-cell read; "per cell crossed" describes where the stamp lands, not when its inputs are read. The
`pri` line's long comment (ROADMAP O17) is about the tri-state, not about timing. The one comment on
the plane read, "The PLANE is still read per cell: it is not part of the word, and the ruling latches
the word", was the predecessor's scope note, and that packet's D5 says the map's reason for a live
plane (a mid-drag plane change flushes a second `recordPaint` command) has no subject in the
composer. `docs/ROADMAP.md` holds no row giving a reason; its only hits are row 162 (the map's word)
and row 207 (this parcel). The premise held for all seven inputs, and none was booked instead of
built.

## 2. The change (`a88330fb`)

- A module-level `StrokeInputs` type (`word`, `plane`, `tile`, `pal`, `hf`, `vf`, `pri`) and one
  `strokeLatch` ref, replacing `paintBrushWord`, with a docblock naming the ruling, the predecessor
  and the map's twin.
- `strokeInputsNow()` replaces `brushWordNow()`: the one place every input is read, the collision
  word built by the same `selectedCollisionWord` call as before.
- `hostPointer.down` sets `strokeLatch.current = strokeInputsNow()` at EVERY press, whatever the
  tool, after the live-tile and BG-override refusals (a refused press latches nothing) and before
  `beginTileGesture` and the first `applyTileCell`.
- `applyTileCell` reads `const inp = strokeLatch.current ?? strokeInputsNow()` once and paints every
  branch from `inp`. The fallback is not reachable from the pointer hook (`move` needs
  `lastTileCellRef`, which the same press sets and the same places clear), and it paints the live
  values, never a made-up word that would erase.
- `up` clears `strokeLatch`, and so does the document-change effect, beside `lastTileCellRef`.
- **Unchanged on purpose:** `drawOverlay`'s corner HUD chip still reads the live values (it describes
  the NEXT press), and its per-cell collision overlay still shows the live plane (O8). `MapViewport`
  is not in the diff: the map keeps its own `paintBrushWord` and its deliberately live plane.

## 3. Red first, node side

**Runner:** vitest (`npx vitest run <file>`), the runner `npm test` ends with. Every row mounts
`ComposerCanvas` with `src/test/render-hooked.ts` and drives the `hostPointer` taken off the rendered
`PixelViewport`, re-read after every change because PixelViewport routes each event to the hook it is
rendered with at that moment. The document is 8x2 tiles, every 8px cell seeded with atlas tile 7 on
line 0 and no flips, every 16px collision cell with `FILL` (12293). The stores start at tile 1, line
1, priority `on`, plane A, shape 9.

- **Six nametable rows** (one `it.each`): tile (`setBrushTile(2)`), stamp line (`setPaletteLine(2)`),
  priority (`setStampPriority('off')`), X flip and Y flip (the composer's own window keydown handler,
  dispatched through `src/test/window-stub.ts`), palette-apply line (`setPaletteLine(2)`). Press tile
  0, change the input, move to tiles 2 and 4. Expected cells are built by the tree's `stampTile` /
  `applyPaletteLineToDocCell` over a `cloneComposerDoc` of the seeded document with the values the
  stores held at the press. **ANTI-VACUOUS:** the changed value must paint tile 2 differently. The
  rows also assert the premise that the press painted tile 0 only, and that the NEXT press (tile 6)
  takes the changed value and leaves tile 7 alone.
- **The plane row:** press on A, `setCollisionPaintPlane('b')`, move on. Plane A cells 0 to 2 must
  carry `collisionPaintWord(W, FILL)` and plane B must be untouched; the next press paints plane B.
- **The O3 row:** a collision stroke on cell 3 latches W0; shape 10 is picked (W1, anti-vacuous: it
  paints differently); a tile-stamp press on tile 0; the tool switched to collision under the held
  button; moves to tiles 2 and 4. Cells 0 to 2 must carry W1, the word selected at this stroke's
  press, and cell 3 keeps W0.

The fix was written first and set aside in the session scratchpad; the base file was put back with
`git show HEAD:<path> >`, the rows were written over it and run, and the fix was then copied back.
The fix and the rows were committed together (`a88330fb`). The mutation is the fix reverted on disk
from its parent; the restore is from the commit.

| step | what was on disk | result | time (UTC), load |
|---|---|---|---|
| pre-fix | the rows, uncommitted, over the unfixed base file | vitest exit 1, `Tests 8 failed (8)`, all eight at the mid-stroke assertion | 08:22:03Z to 08:22:05Z |
| green | the fix, uncommitted | art `__tests__`: `Tests 50 passed (50)`; `npx tsc --noEmit` exit 0 | 08:22:11Z to 08:22:17Z |
| **mutation** | `git checkout a88330fb^ -- src/renderer/components/art/ComposerCanvas.tsx`; `git diff --stat HEAD -- src`: `src/renderer/components/art/ComposerCanvas.tsx \| 118 +++++++++----------------` (42 insertions, 76 deletions); lines 434 to 437 read back `tile: s.brushTile,` `pal: s.paletteLine,` `hf: flipRef.current.hf,` `vf: flipRef.current.vf,`, line 457 `applyPaletteLineToDocCell(doc, cx, cy, useArtStore.getState().paletteLine)`, line 471 `paintDocCollision(doc, useEditorStore.getState().collisionPaintPlane, cx, cy, word)`; `strokeLatch` occurs 0 times on disk | | |
| **red** | the mutation | vitest exit 1, `Tests 8 failed (8)`, every failure an `AssertionError` (the failure-class reporter: ASSERTION 8) | 08:23:08Z to 08:23:10Z, 42.13 |
| restore | `git checkout a88330fb -- ...`; `git status --porcelain --untracked-files=no` empty; `strokeLatch` 8 on disk | | |
| green | restored | `Tests 8 passed (8)` | 08:23:29Z to 08:23:31Z |

The red, quoted. Each failure is at the row's mid-stroke assertion. For the nametable rows the diff
is over the eight row-0 cells; tile 0 holds the pressed value in both trees (tiles 2 and 4 are
entered by `linePoints` from tile 0, so tile 0 is not re-entered at 8px resolution):

| row | expected (tiles 1 to 4) | received (tiles 1 to 4) |
|---|---|---|
| the stamp tile | `atlasTile: 1` | `atlasTile: 2` |
| the stamp palette line | `pal: 1` | `pal: 2` |
| the stamp priority | `pri: true` | `pri: false` |
| the stamp X flip | `hf: false` | `hf: true` |
| the stamp Y flip | `vf: false` | `vf: true` |
| the palette-apply line | `pal: 1` | `pal: 2` |
| Plane B picked mid-drag (plane A cells) | `[12297, 12297, 12297, 12293]` | `[12297, 12293, 12293, 12293]` (cells 1 and 2 went to plane B) |
| O3, the switched stroke (plane A cells) | `[12298, 12298, 12298, 12297]` | `[12297, 12297, 12297, 12297]` (the earlier stroke's W0) |

Logs: `docs/captures/2026-09-25-art-brush-latch-rest/logs/node-prefix.log`, `node-red.log`,
`node-restored.log`.

## 4. The harness, every run

**Rig.** The harness's own, unchanged: `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only,
integer client aims with the tile derived back from each integer, dpr and the canvas rect printed,
Xvfb's real pointer parked outside the window, every mouse event the page receives logged,
`spawnGuarded` + `await killTree(child)`. **PART `abl`, added:** PART abw's real double-click on a
Chunks grid thumbnail is now the shared `openArtChunk` helper (abw's steps unchanged). When a chunk is
already open in the composer, abl reaches it by a real click on the Art facet instead (D5). The
Tile stamp tool is armed by a real click. A warm-up stamp (D4) makes the document dirty, the canvas
is measured again, and five tiles in a row off the warm-up row are chosen where the stamp visibly
changes tiles 1, 2 and 5. Focus is taken to `<body>`, a real X arms the H flip, the stroke is pressed
on tile 1 and moved to tile 2, a real **Y** toggles the V flip with the stroke held, and the stroke
moves on to tiles 3 and 4 and is released. Cells are read with `__dbg.aeon.artDocCellAt`. Expected
cells are `stampTile`'s `{ atlasTile: spec.tile, hf: spec.hf, vf: spec.vf }` with the armed
`brushTile` (read with `artChunkOpen`, which writes nothing) and the flips `ComposerCanvas` starts a
document with (`{ hf: false, vf: false }`) plus the one X.
**The rows.** ABL.0 premise: the canvas did not move across X, the press and Y; focus was `<body>`
both times; neither key clicked anything; the tool is still the stamp; tiles 1 and 2 carry
`{ hf: true, vf: false }`. **ABL.a** is the discriminating row: tiles 1 to 4 all carry
`{ hf: true, vf: false }`. ABL.b, ABL.c and ABL.d are controls that hold with or without the latch:
tiles 1 and 2 carry the press-time flips and tile 5 is untouched; one Ctrl+Z restores the five
tiles; the NEXT press stamps tile 5 with `{ hf: true, vf: true }` and nothing else, which is also
the proof that the Y key fired.
**Which tree.** Every run printed `root:` and `pinned: AURORA_BUILT_TREE=` naming this worktree,
`build: FRESH`, `build flavour: DEBUG`, and `in-tree: yes`. `ELECTRON_BIN` named the main checkout's
electron. **Build check:** the bundle's count of `strokeLatch` was 6 after each fixed build and 0
after each red build.
**The copy.** Per run, a fresh rsync of the aeon working tree (read only; `.git` and `.claude`
excluded, 238M) into a run-unique directory of this session's scratchpad, named by `AEON_DIR` and
deleted after the run (every run printed `copy removed: yes`). The harness copies it again into its
own mkdtemp. Nothing is saved.
**Display.** `xvfb-run -a`, screen 1680x1050, window 1400x872 inner. **dpr 1 in every run.**
Composer canvas `{x 308, y 186, w 1024, h 1024}` at zoom 8 on chunk `OJZ_01` (16x16 tiles) in every
run that reached the stroke, tiles (0,0) to (4,0), aims `(340,218)` to `(596,218)` 64px apart, each
derived back to its own tile.

| run | harness | src | parts | totals | start (load), end (load), UTC |
|---|---|---|---|---|---|
| dev1 | `b5723724` (blob `ddb8a60e`) | HEAD | abl | 1/2: **FAIL ABL.0**, the canvas moved 42px under the stroke (D4) | 08:25:45Z (29.86), 08:26:08Z (28.70) |
| dev2 | uncommitted | HEAD | abl | 1/2: FAIL ABL.0, the same | 08:27:15Z (27.91), 08:27:39Z (33.40) |
| dev3 | uncommitted, with a diagnostic | HEAD | abl | 1/2: FAIL ABL.0; the diagnostic named the status bar (D4) | 08:28:05Z (32.11), 08:28:29Z (30.01) |
| dev4 | uncommitted | HEAD | abl | 1/2: **ABL.0 UNMEASURABLE**, the warm-up row was off screen | 08:29:24Z (26.61), 08:29:44Z (27.88) |
| dev5 | uncommitted (the blob committed as `6290f15b`) | HEAD | abl | 6/6 PASS | 08:30:02Z (26.77), 08:30:30Z (26.56) |
| **red-abl** | `6290f15b` (blob `2a248df1`) | ComposerCanvas.tsx at `a88330fb^` | abl | 5/6: **FAIL ABL.a** | 08:30:51Z (30.56), 08:31:18Z (30.68) |
| final1 | `6290f15b` | HEAD | all | 25/26: **ABL.0 UNMEASURABLE**, abw's dirty document blocked the double-click (D5) | 08:31:31Z (34.03), 08:32:43Z (32.51) |
| dev6 | uncommitted (blob `3412d0be`) | HEAD | all | 30/30 PASS | 08:33:10Z (29.09), 08:34:29Z (25.92) |
| **red2** | `8894d40a` (blob `d75d1835`) | ComposerCanvas.tsx at `a88330fb^` | abw,abl | 10/11: **FAIL ABL.a**; ABW's five rows PASS | 08:34:58Z (26.63), 08:35:36Z (28.33) |
| **final2** | `8894d40a` | HEAD | all | **30/30 PASS, 0 FAIL, 0 UNMEASURABLE** | 08:35:48Z (28.32), 08:37:07Z (25.03) |
| **final3** | `8894d40a` | HEAD | all | **30/30 PASS, 0 FAIL, 0 UNMEASURABLE** | 08:37:07Z (25.03), 08:38:24Z (20.82) |
| **final4** | `8894d40a` | HEAD | all | **30/30 PASS, 0 FAIL, 0 UNMEASURABLE** | 08:38:25Z (20.82), 08:39:44Z (28.59) |
| **final-abl-alone** | `8894d40a` | HEAD | abl | **6/6 PASS, 0 FAIL, 0 UNMEASURABLE** | 08:39:52Z (30.09), 08:40:19Z (33.30) |

Logs: `docs/captures/2026-09-25-art-brush-latch-rest/logs/` (one file per run, named as above).
Every part of every run printed "no mouse event reached the page at a position this harness did not
send". The box was loaded by other work (1-min load 20 to 36) and no row timed out.

**The red runs.** In both, the mutation was on disk before its rebuild (`VITE_AURORA_DEBUG=1 npm run
build`, 08:30:43Z to 08:30:45Z and 08:34:53Z to 08:34:55Z), and the run printed
`src on disk: DIFFERS FROM HEAD (a mutation?)` naming `M  src/renderer/components/art/ComposerCanvas.tsx`.
**ABL.a FAIL** in both: "tiles 1..4
[{"t":0,"hf":true,"vf":false},{"t":0,"hf":true,"vf":false},{"t":0,"hf":true,"vf":true},{"t":0,"hf":true,"vf":true}];
the press-time flips stamp {"t":0,"hf":true,"vf":false}; the live flips would stamp
{"t":0,"hf":true,"vf":true}". ABL.0, ABL.b, ABL.c and ABL.d PASS. red-abl reached the document by
the double-click, red2 by the Art facet click (after abw). Each restore was
`git checkout a88330fb -- src/renderer/components/art/ComposerCanvas.tsx`, then
`git status --porcelain --untracked-files=no` empty (the whole tree), then a fresh debug build.

**The finals.** ABL.a in each: tiles 1 to 4 all `{"t":0,"hf":true,"vf":false}`. Each printed
`ABL.cleanup`: "the five tiles match the start, and the warm-up tile matches its start". final2 to
final4 reached the document by the Art facet click (abw runs first); final-abl-alone by the
double-click, so both routes are green on the committed blob. The twenty-four rows of the earlier
parcels (SETUP.0, M1, M2, M4, BW, ABW, M6) pass beside them, and M6 runs after `abl`.
`node scratchpad/check-harness-guards.mjs` at `8894d40a`: "293 clean / 294 classified ... 0
failure(s) · 1 unguarded-untracked · 0 unmeasurable" (O7).

## 5. Suite

| tree | `npm test` | Test Files | Tests | start (load), end (load), UTC |
|---|---|---|---|---|
| `8894d40a` (fix, rows, harness), with the run logs untracked | exit 0 | 656 passed \| 3 skipped (659) | 10325 passed \| 9 skipped (10334) | 08:40:36Z (35.34), 08:43:51Z (33.45) |

It was run in the foreground with `VITEST_MAX_WORKERS=4`, and the exit code was read directly, not
through a pipe. The new file adds eight tests. The run printed
`check-test-collection: OK: 659 test-shaped file(s) on disk, all 659 collected by vitest.`,
`check-doc-citations: OK, every path cited by a document line written since
2026-09-06T00:39:36Z is tracked.`, `skip-report: OK. Every skip named its reason.` and
`failure-class: no failures in this run (659 module(s) reported).` The run with this packet and the
ROADMAP edit staged is reported in the landing message, not here, so this table does not describe a
tree it was written inside.

## 6. Deviations from the brief, and the calls I made

- **D1. One latch object for every input, not one ref per input.** `strokeLatch` replaces
  `paintBrushWord` in the composer (the map's `paintBrushWord` is untouched). Latching the set whole
  means an input added to `strokeInputsNow()` later is latched without a second edit.
- **D2. O3 is fixed, because it fell out of doing O1/O2 correctly.** The stamp and palette-apply
  inputs have to be latched by the stamp and palette-apply presses, so the press latches at every
  tool, not only at a collision press. Once every press latches the whole set, a stroke whose tool is
  switched to collision under the held button paints the word selected at ITS press, and the stale
  word from an earlier collision stroke can no longer be reached. Clearing the latch at `up` (and on
  a document change) is the one line added for it. It has its own node row (red under the revert).
  The TOOL is still read when the hook is rebuilt, so the switched stroke still changes branch (O3
  below): the brief asked for the stale latch, not for the tool.
- **D3. The live part drives the flips, not the plane or the tile.** The flips are the only inputs a
  real key changes with the stroke held and focus on `<body>`. The plane, tile, line and priority
  are palette controls that need a Tab route like PART abw's; they are node-covered. The Y flip is
  toggled mid-stroke and the X flip is armed before the press, so stamped tiles differ from the
  chunk's own (OJZ_01's row 0 holds tile 0 with `vf` true in three of five tiles).
- **D4. A warm-up stamp before the stroke.** dev1 to dev3 found the composer canvas 42px lower after
  the first write to a clean chunk document (O1 below), so the stroke's second aim landed above the
  canvas. The part now stamps one tile of the lowest row on screen, re-measures, aims the stroke
  after, and takes the warm-up back with its own Ctrl+Z at the end. dev4 was UNMEASURABLE because the
  first version warmed up on the last row, which is off screen at zoom 8.
- **D5. An already-open document is reached by the Art facet, not a second double-click.** final1
  (all parts) was UNMEASURABLE: PART abw leaves its document open and dirty (O2 below), so abl's
  double-click went to `confirmArtDocumentOpen` and the facet never switched. final1 is kept as a
  log and proves nothing about ABL.a.
- **D6. The proof method changed once, and the red was re-established under it.** red-abl ran blob
  `2a248df1`; D5 changed the harness to `d75d1835`, so the red was run again at `8894d40a` (red2,
  PART abw,abl, exercising the new route) before the finals.
- **D7. `node_modules`:** the worktree had none. I made it with
  `cp -al <main>/node_modules node_modules`, as the brief prescribes. `ELECTRON_BIN` named the main
  checkout's electron, as briefed.
- **D8. The run helper was a shell script in this session's scratchpad**, not committed, as the
  predecessor's D9. Per run it ran `node --check` on the harness, rsynced aeon into a run-unique
  directory, ran the harness with `AEON_DIR`, `AURORA_BUILT_TREE`, `ELECTRON_BIN` and `PART` under
  `timeout -s TERM 420`, and deleted the copy.

## 7. Where the tree disagreed with the brief

- The predecessor's line numbers were stale, as the brief expected: at `e1a26f54` the collision
  branch is lines 458 to 471 and the stamp spec lines 433 to 451.
- The brief lists "the X/Y flip ref" as one input; it is two fields driven by two keys, and each has
  its own node row.
- The brief's live route follows PART abw, whose double-click does not work a second time in the
  same run once abw's document is dirty (D5).
- `docs/ROADMAP.md` row 207 existed as a booked row, as the brief said. It is replaced in place.

## 8. Observations for the overseer, not acted on

- **O1. The composer canvas jumps 42px down under the pointer on the first write to a clean chunk
  document.** Measured in dev1 to dev3: the rect read `y 144` before the press and `y 186` after it.
  The element at the old top edge after the press was the Art facet's status row, reading "OJZ $01
  unsaved ⚠ pixel edits to existing tiles propagate ...", so the row grows when "unsaved" appears. At
  zoom 8 that is two thirds of a tile: the rest of that first stroke lands up to one row above where
  the author aims. Not in this parcel's scope. Measured, cause read from one `elementsFromPoint`.
- **O2. Undo does not clear a chunk document's dirty flag.** After PART abw's two Ctrl+Z the four
  cells match the start, yet `artChunkOpen().dirty` was `true` when abl began, and a double-click on
  a chunk then asked to discard it. Seen through harness state only; whether this is intended for
  chunk documents (the save contract's R5 is written for the composer stack) is not answered here.
- **O3. The tool itself is not latched.** A tool switched under the held button (a tool-rail click
  or its key) still moves the rest of the stroke to another branch, with this stroke's latched
  inputs. The ruling latches "a stroke's inputs"; whether the tool is one of them is a ruling.
- **O4. Focus differs between the facets** (the predecessor's O4, still true): a composer press
  leaves focus on `<body>`, which is what lets the X and Y keys reach the composer mid-stroke.
- **O5. The pixel tools' `commitWrites` reads `paletteLine` for `adoptPaletteLineForEmptyCells`.**
  That is the pixel path, once per committed gesture, not the tile-space path this parcel covers.
  Read, not measured.
- **O6. `composer-collision-gesture-harness.mjs` cites "ComposerCanvas :383-388"** for the plane
  read, which no longer exists as a live read. Its palette and tool presses are `.click()`. Not
  touched (the predecessor's O6).
- **O7. `check-harness-guards` reports "1 unguarded-untracked"**, `scratchpad/preset-schema-key-probe.mjs`
  (registered, never prints PASS; G9), as for the predecessor. Not in this diff. 0 failures.
- **O8. The collision overlay shows the LIVE plane while a stroke paints the latched one.** With
  Plane B picked mid-stroke the per-cell value overlay switches to plane B while the stroke keeps
  writing A. That is the overlay describing the next press, like the HUD chip; it is also a visible
  mismatch during the stroke. Read, not measured.

## 9. TAGGED for the foreground

- A real (not emulated) scale factor other than 1: every run read dpr 1.
- The owner's window size: measured at the harness's 1400x900 only.
- The plane, tile, line, priority, X flip and palette-apply routes are node-covered, not driven live;
  the live route drives the Y flip only (D3).
- O1 (the 42px jump) is visible to an author on the first stroke into a clean chunk; its practical
  cost is a foreground look.
- Nothing here needs the emulator. None was started, attached to or read.

## 10. Commits

`a88330fb` every input of a composer tile-space stroke latched at the press, with the eight node rows ·
`b5723724` the harness's PART abl · `6290f15b` PART abl on the Y flip after a warm-up stamp ·
`8894d40a` PART abl reaches an already-open document by the Art facet · this packet, its run logs,
and `docs/ROADMAP.md` row 207 replaced in place by its DELIVERED row.
