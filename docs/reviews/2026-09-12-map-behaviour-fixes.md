# Map behaviour fixes, 2026-09-12: M1, M2, M4, M6

**Branch** `parcel/map-behaviour-fixes`, base master `b2116bc4`. **Date** 2026-09-12.
**Source.** `docs/reviews/2026-09-12-rulings-asked.md` section 2 (rows M1 to M7) and its
"Rulings received" (the empyrean hub, 2026-09-12T07:08:52Z, ruling in the owner's place under the
standing delegation, overturnable by him): "M1 drop focus (d-27 precedent). M2 put the plane in the
key. M3 leave it. M4 latch at press. M6 refresh." M5 and M7 are PARKED for the owner.
The measurements behind the rows: `docs/reviews/2026-09-11-map-coverage-4.md`,
`docs/reviews/2026-09-12-map-coverage-5.md`, `docs/reviews/2026-09-12-map-coverage-6.md`, and
`docs/reviews/2026-09-12-cdp-sweep-4.md` (F-1 on screen).
**Instrument** `scratchpad/map-behaviour-fixes-harness.mjs` (`npm run harness:map-behaviour-fixes`),
plus rows in `src/renderer/components/__tests__/map-viewport-mounted.test.ts` and
`src/renderer/components/__tests__/d27-act-and-drop-focus.test.ts`.
**Not done.** M3, M5, M7 (section 6). No emulator was touched. No aeon build, sigil or
`emit_sound_blob` was run. No `cargo`.

---

## 0. The answer

| fix | status | commit | node rows (red first) | live rows, 3 finals |
|---|---|---|---|---|
| M1 the Plane buttons drop focus | **DONE** | `6fcacce0` | M1 row + d27 CollisionPalette site: 2 red under the revert | M1.a, M1.b (red under the revert), M1.c control: 3/3 x3 |
| M2 the plane is in the drag cache key | **DONE** | `ece9735f` | M2 row: 1 red | M2.0 premise, M2.a (red), M2.b control: 3/3 x3 |
| M4 the brush size is latched at the press | **DONE** | `3abca0b8` | M4 row: 1 red | M4.0 premise, M4.a (red), M4.b and M4.c controls: 4/4 x3 |
| M6 a stamp press refreshes the link hover | **DONE** | `0b45bf77` | M6 row + 2 restated premises: 3 red | M6.0 premise, M6.a and M6.b (both red): 3/3 x3 |

**Harness: 15/15 PASS, 0 FAIL, 0 UNMEASURABLE in each of three final runs, dpr 1 in every run.**
`npm test` at the tip: see section 4. **One thing the tree says that the M1 row did not:** M1
closes the BARE Space, but not the Tab-then-Space route F-1 actually took (section 5.1).

## 1. The four fixes, re-derived from source

### M1. `CollisionPalette`'s Plane A and B buttons act and then drop focus

**Defect, from source.** The two buttons were `onClick={() => pickPlane('a')}` /
`('b')`, so a real click left the `<button>` focused. `MapViewport`'s paint-collision press
calls `preventDefault` and never takes focus, and no window key handler claims Tab or Space (a
grep of `src/renderer` for a Space handler finds none), so for the whole of a held stroke a Space
reached the focused Plane button. `paintCollisionCell` reads `collisionPaintPlane` per cell and
`recordPaint`'s `sameRun` flushes on a plane change.
**Change.** Both go through the existing `actAndDropFocus` (`src/renderer/components/ui/act-and-drop-focus.ts`,
decision `d-27-space-refires-wipe-answered` in `docs/decisions.jsonl`); no second mechanism.
`pickPlane` itself stays a plain function, because the overlay claim calls it as `show` with
no event. The helper's header gains a paragraph naming these as its first non-destructive callers.
**Node rows.** New `M1:` row in the Plane-change block: each button blurs the element it was
pressed on, THEN moves the plane (log `['blur:B', 'plane:b', 'blur:A', 'plane:a']`). The d27
guard's CollisionPalette site gains the two calls. The block's `renderPalette` used to call
`onClick()` with no argument, which the fix turns into a TypeError; it now hands each press an
event whose `currentTarget.blur` records into the log.

### M2. The collision drag cache key names the plane

**Defect, from source.** `paintCollisionCell` keyed its skip on
`${sectionIndex}:${cellCol}:${cellRow}:${crossoverSpan}` while reading the plane from the store
per cell. After a plane switch under a held drag the cell under the pointer made the same key, so
`lastPaintedCell.current === cellKey` returned "same cursor cell, skip" for the new plane, until
the pointer left the cell (map-coverage-6 O2, `b: []`). The key's own comment gave this exact
reason for the span.
**Change.** `:${plane}` appended; the span comment says what the span does on its own, and the
plane has its own paragraph. With both planes armed the extra visit writes nothing:
`buildPlaneEntries` (`src/core/collision/both-planes-paint.ts`) pushes an entry only
`if (oldColl !== newColl)`, so `paintCollisionCell` returns before `recordPaint` (read, not
measured). `recordPaint` itself is untouched (M3).
**Node row.** `M2:` press on cell (1, CR) on A, press B through the palette's own button, move to
the SAME 16px cell's other 8px tile (both asserted ANTI-VACUOUS), expect the cell on both planes.

### M4. The collision brush size is latched at the press

**Defect, from source.** `paintCollisionCell` read `useEditorStore.getState().collisionBrushSize`
per cell, while `paintPropagate` (Alt), `paintBothPlanes`, `paintCrossover` and
`paintCrossoverSpanMode` are set at the paint-collision press (map-coverage-4).
**Change.** A `paintBrushSize` ref beside them, set at the press with them, read by
`paintCollisionCell`. `drawCollisionPreview` still reads the live size on purpose: it previews
the NEXT press, and during a drag the move handler returns in the paint branch before reaching it.
**Node row.** `M4:` press with brush 1, set 3 mid-drag, move on: exactly the two 1x1 cells; undo;
the next press paints the 3x3 area. ANTI-VACUOUS: the area is asserted wider than the two cells.

### M6. A stamp press refreshes the chunk-link hover

**Defect, from source.** `setLinkHover` had one caller on the map, the stamp-chunk branch of
`handleMouseMove`. The stamp-chunk branch of the press ran `buildStampCommand` /
`executeCommand` and wrote no hover, so a stamp under a still pointer left the Chunk links panel
saying "Under cursor: no chunk link" over the chunk it had just stamped (map-coverage-5).
**Change.** The write moved into one helper, `reportLinkHover(info)` (through `chunkOriginAt`, as
before), called by the move branch unchanged and by the press AFTER the command, so a detached or
refused stamp reports what is really there.
**Node rows.** `M6:` stamp with no move; the store and the rendered panel both name it. Two
existing rows asserted the defect as their premise and were restated, not deleted:
"the premise: a stamp click writes no hover of its own" (now: the last stamp press named its own
placement, and the row moves off onto an unlinked tile, asserted null, before the move it is
about); and "CONTROL: with another tool armed, hovering a placement writes nothing" (it asserted
`toBeNull`; now the hover must be UNCHANGED, and a write would name another section's placement).

## 2. Red first, node side

Each fix was committed first; the mutation is that fix reverted on disk; each restore is
`git checkout <the fix commit> -- <path>` from the committed baseline, and
`git status --porcelain --untracked-files=no` was empty after every one.

| fix | mutation on disk | red (`npx vitest run` of the file(s)) | green before |
|---|---|---|---|
| M1 | `git checkout 6fcacce^ -- src/renderer/components/CollisionPalette.tsx`; `CollisionPalette.tsx \| 16 ++--------------`; lines 326 and 327 read `<button onClick={() => pickPlane('a')} ...>A</button>` and `('b')` | `Tests 2 failed \| 168 passed (170)`: "a Plane button moved the plane without dropping its own focus, or dropped it after: expected [ 'plane:b', 'plane:a' ] to deeply equal [ 'blur:B', 'plane:b', 'blur:A', …(1) ]"; "components/CollisionPalette.tsx lost the wiring at: actAndDropFocus(e, () => pickPlane('a'))". 04:57:04, load 1.90 | 170/170, 04:56:13, load 2.62 |
| M2 | `git checkout ece9735^ -- src/renderer/components/MapViewport.tsx`; `MapViewport.tsx \| 12 ++----------`; the key reads `` `${info.sectionIndex}:${cellCol}:${cellRow}:${crossoverSpan}` `` | `Tests 1 failed \| 158 passed (159)`: "the cell under the pointer at the switch was skipped for the new plane: expected { a: [ 514, 515, 770, 771 ], b: [] }". 05:11:48, load 4.10 | 159/159, 04:57:50, load 1.04 |
| M4 | `git checkout 3abca0b^ -- src/renderer/components/MapViewport.tsx`; `MapViewport.tsx \| 13 +------------`; `paintCollisionCell` reads `const brush = useEditorStore.getState().collisionBrushSize;` | `Tests 1 failed \| 159 passed (160)`: "a size picked mid-drag changed the area for the rest of the stroke: expected [ 1544, 1545, 1546, 1547, 1548, …(31) ] to deeply equal [ 2056, 2057, 2058, 2059, 2312, …(3) ]" (36 sub-tiles, the 3x3 area, against 8). 05:14:07, load 15.29 | 160/160, 05:13:14, load 4.95 |
| M6 | `git checkout 0b45bf7^ -- src/renderer/components/MapViewport.tsx` (made as `HEAD^` at `0b45bf77`); `MapViewport.tsx \| 33 +++++++--------`; `reportLinkHover` occurs 0 times | `Tests 3 failed \| 158 passed (161)`: the M6 row ("the stamp press left the link hover stale under a still pointer: expected null ...") and both restated premises ("expected null to deeply equal { sectionIndex: 1, …(2) }"). 05:16:28, load 7.10 | 161/161, 05:16:01, load 8.59 |

`npx tsc --noEmit` exit 0 after each fix (04:56:14, 04:57:51, 05:13:15, 05:16:02).

## 3. The harness, every run

**Rig.** cdp-sweep-4's, re-used: `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only,
integer client aims with the cell or tile derived back from the integer, dpr and the map canvas
rect printed per part, Xvfb's real pointer parked outside the window (cdp-sweep-4 section 5.3) and
every mouse event the page receives logged, `spawnGuarded` + `await killTree`. New: a click log,
because the only way to see a key press reach or not reach a button is the click it dispatches;
M6.a sends only a press and a release at the point the pointer already rests on, and is
UNMEASURABLE if any mousemove at all arrives in between (the move branch writes the same hover); the
selected Brush size is read from computed style (no `__dbg` read exists for it). Expected
footprints are `collisionPaintTargets` and `cellTileIndices` bundled from the tree; literals (the
Brush sizes, the no-link text) come from the committed HEAD.
**Which tree.** Every run printed `root:` and `pinned: AURORA_BUILT_TREE=` naming this worktree,
`build: FRESH`, `build flavour: DEBUG`, and its own `in-tree: yes`. Launched with the main
checkout's electron.
**The copy.** An rsync copy of the aeon working tree taken 2026-09-12T09:07Z, `.git` and `.claude`
excluded (165M), held in this session's scratchpad outside the repo; `AEON_DIR` named it, the
harness refuses the live sibling, and each run copies it again into a fresh mkdtemp that it deletes
at the end. Nothing saved. Aeon's HEAD at the time read `a38ce7c9`.
**Display.** `xvfb-run -a`, screen 1680x1050, window 1400x872 inner. **dpr 1 in every run.**
Map canvas rect: parts m1, m2, m4 `{x 284, y 74, w 876, h 774}` at zoom 2; part m6
`{x 284, y 74, w 876, h 721}` at zoom 1 (the Layout facet), the same in every run.

| run | harness | src | parts | totals | time | uptime (load) at start, end |
|---|---|---|---|---|---|---|
| dev1 | `9dd78286` (blob `8d140e1f`) | clean | all | 12/13 PASS, 0 FAIL, **1 UNMEASURABLE** (M2.0) | 49.3 s | 05:17:54 (16.42), 05:18:43 (10.20) |
| dev2 | uncommitted (blob `b4807295`) | clean | m2 | 4/4 PASS | 19.0 s | 05:19:44 (6.13), 05:20:03 (5.45) |
| red-m1 | `5947cd81` (blob `61817b2e`) | M1 reverted | m1, m2 | 6/8: **FAIL M1.a, M1.b** | 27.1 s | 05:21:14 (6.09), 05:21:41 (4.89) |
| red-m2 | `5947cd81` | M2 reverted | m2 | 3/4: **FAIL M2.a** | 19.0 s | 05:21:58 (4.46), 05:22:17 (4.65) |
| red-m4 | `5947cd81` | M4 reverted | m4 | 4/5: **FAIL M4.a** | 19.3 s | 05:22:48 (4.31), 05:23:07 (4.61) |
| red-m6 | `5947cd81` | M6 reverted | m6 | 2/4: **FAIL M6.a, M6.b** | 15.5 s | 05:23:22 (8.19), 05:23:37 (7.02) |
| **final1** | `5947cd81` | identical to HEAD | all | **15/15 PASS, 0 FAIL, 0 UNMEASURABLE** | 41.0 s | 05:24:41 (6.35), 05:25:22 (6.46) |
| **final2** | `5947cd81` | identical to HEAD | all | **15/15 PASS, 0 FAIL, 0 UNMEASURABLE** | 41.0 s | 05:25:22 (6.46), 05:26:03 (4.80) |
| **final3** | `5947cd81` | identical to HEAD | all | **15/15 PASS, 0 FAIL, 0 UNMEASURABLE** | 41.2 s | 05:26:03 (4.80), 05:26:44 (4.19) |

Logs: `docs/captures/2026-09-12-map-behaviour-fixes/logs/` (`dev1.log`, `dev2.log`, `red-m1.log`,
`red-m2.log`, `red-m4.log`, `red-m6.log`, `final1.log`, `final2.log`, `final3.log`). Every part of
every final printed "no mouse event reached the page at a position this harness did not send".

**Dev run 1's UNMEASURABLE, and the method change.** M2.0's detail read "focus before
{BUTTON `--`, row `∅air`}": the setup's last click is a shape button, which keeps focus, so the Tab
walk ran through the shape grid for 150 presses. The harness's setup, not the app. From `5947cd81`
the part clicks Plane A right before the press, as F-1 did. Dev run 2 and every later run used it;
the red runs and the finals are all at `5947cd81`, so no claim rests on the earlier version.

**The red runs.** Each mutation was on disk before its rebuild (`VITE_AURORA_DEBUG=1 npm run build`)
and each run printed it under `src on disk: DIFFERS FROM HEAD`. M1 is `CollisionPalette.tsx` at
`6fcacce^`; M2, M4 and M6 are each fix's own `MapViewport.tsx` diff reverse-applied with
`git apply -R` (the file carries all three, so a parent checkout would revert more than one). Each
restore was `git checkout HEAD -- <path>` from `5947cd81`, status empty after; the finals ran on a
fresh debug build made after the last restore.

- **red-m1.** M1.a: after the click on B, activeElement `BUTTON B (row Plane)`; after A,
  `BUTTON A`. M1.b: "clicks the Space produced [{BUTTON, A, row Plane, detail 0}]", focus still on
  A. M1.c (control) and all of m2 PASS; Tab from the kept focus reached B in **1** press.
- **red-m2.** M2.a: "cell k on B [0,0,0,0]; on A [12290,12290,12290,12290]". M2.0, M2.b PASS.
- **red-m4.** M4.a: "changed 196 sub-tiles; latched expects 8, the live size would give 196".
  M4.0, M4.b, M4.c PASS.
- **red-m6.** M6.a: "page events after the press [[mousedown,480,270,1],[mouseup,480,270,0]];
  added [{id 6, OJZ_01}]; link at the tile {id 6}; hover null; readout 'Under cursor: no chunk link'".
  M6.b: the readout is the no-link text before and after. The press-and-release-only discipline
  held: no move reached the page, so the red is the press's, and so is the green.

**The finals, row by row (final1; final2 and final3 print the same values).**

- **M1.a** B aimed at (1252, 112), plane `b`, activeElement `<body>`; A at (1222, 112), plane `a`,
  `<body>`. **M1.b** `<body>` while held; the Space produced no click; plane `a`; A cells 1 and 2
  `[12290 x4]`. **M1.c** all four cells on A, B untouched, one Ctrl+Z restores both planes.
- **M2.0** aims (324, 146) and (340, 162): world (20, 36) and (28, 44), both cell (1, 2), tiles
  (2, 4) and (3, 5); cell k on A after the press; **Tab presses 2, stops [Plane A, Plane B]**; the
  Space clicked Plane B (`detail 0`); plane `b`. **M2.a** cell k on B `[12290 x4]`, on A kept.
  **M2.b** two commands, B run undone first.
- **M4.0** window top-left (1, 2), reach 3 (from `collisionPaintTargets` at 7); P (396, 250) cell
  (3, 5), Q (428, 250) cell (4, 5); focus on Brush 1 after the click, drawn selected `1`; after Tab
  Brush 7; the Space clicked 7; drawn selected `7`. **M4.a** "changed 8 sub-tiles; latched expects
  8, the live size would give 196". **M4.b** one Ctrl+Z restores the window. **M4.c** the next
  press: "changed 196 sub-tiles; expected 196".
- **M6.0** chunk `OJZ_01` ("OJZ $01", 16x16 tiles, 211 with art); spot (16, 16); aim (480, 270),
  tile (24, 24); hover null; readout "Under cursor: no chunk link". **M6.a** page events exactly
  mousedown and mouseup at (480, 270); placement #6 of `OJZ_01`; hover
  `{sectionIndex 0, placementId 6, chunkId OJZ_01}`. **M6.b** readout "Under cursor: OJZ $01 (#6)".

`node scratchpad/check-harness-guards.mjs` with the new file registered: 276 clean / 276
classified, 0 failures.

## 4. Suite

| tree | `npm test` | Test Files | Tests | uptime (load) start, end |
|---|---|---|---|---|
| base `b2116bc4` | exit 0 | 612 passed \| 3 skipped (615) | 9244 passed \| 9 skipped (9253) | 04:54:17 (1.22), 04:54:52 (7.23) |
| after the four fixes (src as at `0b45bf77`) | exit 0 | 612 passed \| 3 skipped (615) | 9248 passed \| 9 skipped (9257) | 05:16:43 (6.11), 05:17:35 (19.79) |
| `5947cd81` with this packet and its nine logs staged (the content committed next) | exit 0 | 612 passed \| 3 skipped (615) | 9248 passed \| 9 skipped (9257) | 05:30:22 (19.31), 05:31:06 (21.25) |

+4 tests: the M1, M2, M4 and M6 rows (the d27 guard gained calls, not tests). Every run printed
`failure-class: no failures in this run (615 module(s) reported)` and `skip-report: OK. Every skip
named its reason`. With this packet in the tree, `check-doc-citations` printed "OK, every path
cited by a document line written since 2026-09-06T00:39:36Z is tracked", and
`check-harness-guards` 276 clean / 276. `npx tsc --noEmit` exit 0 with no output, 05:31:06 (21.25)
to 05:31:12 (20.35).

## 5. Where the tree disagreed with the rows or the brief

### 5.1 M1 closes the bare Space, not the route F-1 took

The M1 row says: "A Plane button keeps focus, so Space pressed mid-drag switches plane and splits
the stroke". Measured, before the fix a BARE Space after a click re-pressed the SAME button
(red-m1 M1.b: the click went to Plane A and the plane stayed `a`). The switch F-1 recorded needed a
Tab first (cdp-sweep-4 F1.c), and still does after the fix: focus drops to `<body>`, but Chromium
keeps its sequential-navigation starting point at the blurred button, so the first Tab lands on
Plane A and the second on Plane B (M2.0, "Tab presses 2", in every final), and a Space there
switches the aimed plane under the held stroke. So the ruled fix does exactly what it says (the
button drops focus, and a bare Space presses nothing: M1.a, M1.b), and a keyboard author who Tabs
can still switch mid-stroke with one extra Tab. M2 makes the cell under the pointer land on the new
plane; the split into two undo entries is M3, ruled "leave it". Not BLOCKED: the ruling's words are
implemented as written. Reported so the hub can see the difference between the row's wording and
what the fix changes.

### 5.2 Premises the rulings consumed, which the rows did not mention

- `scratchpad/cdp-sweep-4-0912-harness.mjs` PART plane (F1.a to F1.e) asserted that a Plane button
  KEEPS focus; its own red plant `f1-drop` was this fix. Retired explicitly in `5f460bb3`, the way
  d-27 retired collision-destructive's `[k2]`: `planePart` prints `F1.RETIRED` and runs no row, the
  old body is kept as `retiredPlanePartF1` (not called), and the header says so.
- The mounted test's Plane-change rows called `onClick()` with no event (section 1, M1), and two
  link-hover rows asserted a null hover after a stamp (section 1, M6). Both restated in the fix
  commits that consumed them.

### 5.3 The brief

- "a node test where the logic is separable (e.g. the cache key, the latched size)": neither is a
  separable function in the tree (`cellKey` is a local in `paintCollisionCell`, the size a ref). I
  did not extract them; the node rows drive `MapViewport`'s own handlers through the mounted
  component, so they test the key and the latch where they live, not a copy.
- The brief expects `root:` and `in-tree:` lines. `scratchpad/lib/run-root.mjs` prints `root:`,
  `pinned:`, `build:` and `build flavour:`, and no `in-tree:` (cdp-sweep-4 section 8 found the
  same); the harness prints its own `in-tree:`.
- "dpr varies (seen at 1 and 1.35)": every run here read 1. The aims are integer and derived back
  anyway, and the rect is printed per part.
- Early in the session I ran two read-only git commands against the aeon checkout
  (`rev-parse HEAD`, and `archive HEAD` piped to `wc -c` to size a copy) before this worktree's
  own-repo-only rule refused a later command. The fixture copy was made with rsync, not git.

## 6. Not done, and why

- **M3** ruled "leave it": `recordPaint` and its `sameRun` are unchanged (M2.b watches the split
  still happen).
- **M5 and M7 PARKED for the owner.** Neither was touched: `git diff b2116bc4 HEAD --
  src/renderer/components/MapViewport.tsx` has 57 changed lines and none of them mentions
  `paint-block`, `writeHoverReadout`, `hoverBarRef`, `sameRun`, `recordPaint(` or the paint-drag
  gate `isPaintDragging.current && (tool` (grep exit 1). No fix here needed either.
- `docs/ROADMAP.md` section 5.1 carries no row for M1 to M7, so it is not edited.

## 7. Observations for the overseer, not acted on

- **O1. The brush WORD is still read live per cell.** `paintCollisionCell` builds the painted word
  from the store's shape, flip and solidity on every cell, the same shape as M4.
  cdp-sweep-4 section 5.4 O2 measured a Space mid-drag re-picking a shape through a focused shape
  button, and cells 3 and 4 of one stroke took another word. No ruling covers it.
- **O2. The other palette controls still keep focus**: A+B, Brush, Flip, Floor, Loop and the shape
  grid. M4's live route depends on the Brush buttons keeping it, and after M4 a Space there no
  longer changes the held stroke. A+B and Loop feed latched state. Flip, Floor and the shape grid
  feed the live word (O1).

## 8. TAGGED for the foreground

- A real (not emulated) scale factor of 1.35: every run read dpr 1.
- The owner's window size: measured at the harness's 1400x900 only.
- The Art facet's copy of the same two Plane buttons (one component, `variant="art"`): not driven
  in the running app here.
- Nothing here needs the emulator; none was started, attached to or read.

## 9. Commits

`6fcacce0` M1 · `ece9735f` M2 · `9dd78286` the harness · `3abca0b8` M4 · `5f460bb3` cdp-sweep-4 F1
retired · `0b45bf77` M6 · `5947cd81` the harness's m2 setup · this packet with the run logs.
