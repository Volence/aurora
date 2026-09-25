# ART-BRUSH-WORD-LATCH, 2026-09-25: the Art facet's collision brush word is latched at the press

**Branch** `parcel/art-brush-word-latch`, base master `62bfcd6d`. **Date** 2026-09-25.
**Source.** The hub ruling of 2026-09-12T18:49:16Z in the empyrean hub's OVERSEER-LOG, read at
empyrean `c6661dc`: "RULED: (a) of 09:39:48Z covers it. Its ground is behavioural consistency (the
word latches at the press, as size does), not the map surface. Condition: it owes the same red-first
mid-stroke case, and if the live per-cell word turns out to be deliberate (a documented reason), the
parcel stops and books it rather than building over it." The defect was booked as O1 of
`docs/reviews/2026-09-12-brush-word-latch.md` section 8.
**Instrument.** Node: five rows in the new
`src/renderer/components/art/__tests__/composer-brush-word-latch-mounted.test.ts`, which mounts the
real `ComposerCanvas`. Live: PART `abw` of `scratchpad/map-behaviour-fixes-harness.mjs`
(`npm run harness:map-behaviour-fixes`, already registered, so `package.json` is unchanged).
**Not done.** No emulator was touched. No aeon build, sigil or `cargo` was run. Nothing was written
into the aeon tree: every live run opened a fresh rsync copy of it and deleted the copy afterwards.

---

## 0. The answer

| item | status | commit | proof |
|---|---|---|---|
| premise re-measured on this tree: the composer's word is LIVE per cell, and no comment or doc gives a reason | **holds** | base `62bfcd6d` | section 1 |
| the Art facet's collision brush word is latched at the press | **DONE** | `b43f26f4` | sections 2, 3, 4 |
| node rows, one per input of the word (5) | 5 red under the revert, 5 green with the fix | `b43f26f4` | section 3 |
| live row ABW.a, a mid-stroke shape pick by real Tabs and a real Space | red under the revert (cells 3 and 4 took 12399), green with the fix | `e0003e64` | section 4 |
| live controls ABW.b, ABW.c, ABW.d | green on both trees | `e0003e64` | section 4 |
| harness finals | **25/25 PASS, 0 FAIL, 0 UNMEASURABLE in each of three runs, dpr 1 in every run** | | section 4 |
| full `npm test` | exit 0, `Tests 10296 passed \| 9 skipped (10305)` | | section 5 |

**The route on screen is not the map's.** A press on the composer canvas takes focus off the shape
button the setup clicked (focus goes to `<body>`; `PixelViewport`'s pointerdown does not
`preventDefault`). So the one-key route the map had (Space on the still-focused button) does not
exist here. The defect was still reachable by real keys: with the stroke held, 19 real Tabs reached
shape button `#111` and a real Space picked it. With the fix reverted, cells 3 and 4 took 12399
(`red-abw`). With the fix, all four cells carry 12290 (the three finals).

## 1. The store reads, derived from source

Every store read in the Art facet's collision-paint path, classified at the base `62bfcd6d` and at
the fix `b43f26f4`. The path is `hostPointer.down` / `.move` (the object `ComposerCanvas` hands
`PixelViewport` while a tile-space tool is armed) into `applyTileCell(t, cx, cy)`, the collision
branch, then `paintDocCollision` (`src/core/art/composer-collision.ts`). The pure helpers it calls
read no store. A count of `useEditorStore|useProjectStore|useViewStore|useArtStore|getState` is 0 in
`composer-collision.ts` and 0 in `src/core/collision/collision-cell-word.ts`
(`selectedCollisionWord`). The same pattern counts 86 in `ComposerCanvas.tsx` (the positive control).
At the base the collision branch was lines 437 to 444, not 428 to 435 as the brief expected.

| input | what it feeds | before | after |
|---|---|---|---|
| `selectedCollisionProfile` (shape) | the word | **LIVE per cell** | **LATCHED** (`paintBrushWord`) |
| `selectedCollisionEntryFlipX` (the picked shape entry's mirror flag) | the word (XOR with Flip H) | **LIVE per cell** | **LATCHED** |
| `selectedCollisionXFlip` (Flip H) | the word | **LIVE per cell** | **LATCHED** |
| `selectedCollisionYFlip` (Flip V) | the word | **LIVE per cell** | **LATCHED** |
| `selectedCollisionSolidity` (Floor) | the word | **LIVE per cell** | **LATCHED** |
| `collisionPaintPlane` | which plane `paintDocCollision` writes | live per cell | **live, unchanged** (deviation D5) |
| `artStore.open` (the document, its bounds, `liveTileIndex`, `bgOverride`) | the document being painted | live | live (the document, not a brush property) |
| `artStore.tool` | which branch `applyTileCell` takes | fixed per `hostPointer` (memo on `tool`) | unchanged |
| brush size, both planes, crossover brush and span, Alt | | **none exist in this path**: the composer's collision brush paints one 16px cell per 8px tile entered | |

**Deliberate?** No. The only comment on the live read was "Same packed-word pattern as
MapViewport.paintCollisionCell — one palette drives both surfaces via selectedCollisionWord." Its
origin, `70ac7aed` (2026-08-08), says the helper was shared "so both paint sites can't drift". That
is a reason to share the word builder, not a reason to read it per cell. Since `b29b5564` the map
latches, so the live read was itself the drift. `docs/ROADMAP.md` held no row or ruling giving a
reason. The premise held, and the parcel built.

**"As size does".** The composer's collision brush has no size, so the ruling's comparison is to the
map's latch. Its ground, "behavioural consistency (the word latches at the press)", applies unchanged.

## 2. The change (`b43f26f4`)

- A `paintBrushWord` ref beside `lastTileCellRef`, with a docblock that names the ruling and the
  map's twin.
- `brushWordNow()`, the one place the word is built (the same `selectedCollisionWord` call over the
  same five fields that `applyTileCell` used to make per cell).
- `hostPointer.down` sets `paintBrushWord.current = brushWordNow()` when the tool is `collision`,
  before `beginTileGesture` and the first `applyTileCell`. It is set after the live-tile and
  BG-override refusals, so a refused press latches nothing.
- `applyTileCell`'s collision branch paints `paintBrushWord.current ?? brushWordNow()`. The ref is
  `null` only until the mount's first collision press (deviation D3).
- **Unchanged on purpose:** `collisionPaintPlane` is still read per cell (D5). The corner HUD chip in
  `drawOverlay` still reads the live selection, because it describes the NEXT press. The composer has
  no ghost preview. `CollisionPalette.tsx` is not in this branch's diff.

## 3. Red first, node side

**Runner:** vitest (`npx vitest run <file>`), the runner `npm test` ends with. The five rows are one
`it.each` over the five inputs. Each mounts `ComposerCanvas` with `src/test/render-hooked.ts`, takes
the `hostPointer` prop off the rendered `PixelViewport`, and asserts it is non-null. It presses tile
0 of an 8x2-tile doc-local document (four 16px cells, each holding `FILL` = 12293), makes the change
through the setter the palette control calls, then moves to tiles 2 and 4. Expected words come from
the tree's `selectedCollisionWord` and `collisionPaintWord`. **ANTI-VACUOUS, in every row:**
`(W1 ^ W2) & bits` is non-zero, with `bits` from `packCollisionCell` with only that field set, and
`collisionPaintWord(W2, FILL) !== collisionPaintWord(W1, FILL)`. The rows also assert the premise
that the press painted cell 0 only, with W1. They assert that plane B is untouched, that one undo
takes the stroke back, and that the NEXT press paints W2.

The fix and the rows were committed together (`b43f26f4`). The mutation is the fix reverted on disk
from its parent. The restore is from the commit.

| step | what was on disk | result | time (UTC), load |
|---|---|---|---|
| pre-fix | the rows, uncommitted, over the unfixed base | vitest exit 1, `Tests 5 failed (5)`, all five at the mid-stroke assertion | 06:56:36Z to 06:56:39Z, 32.45 |
| green | the fix, uncommitted | `Tests 9 passed (9)` (these 5 and the 4 paste rows beside them) | 06:57:00Z to 06:57:03Z, 35.25 |
| **mutation** | `git checkout b43f26f4^ -- src/renderer/components/art/ComposerCanvas.tsx`; `git diff --stat HEAD -- src`: `src/renderer/components/art/ComposerCanvas.tsx \| 42 +++++---------------------` (7 insertions, 35 deletions); lines 439 to 444 read back `const est = useEditorStore.getState();` ... `if (!paintDocCollision(doc, est.collisionPaintPlane, cx, cy, word)) return;`; `paintBrushWord` occurs 0 times on disk | | |
| **red** | the mutation | vitest exit 1, `Tests 5 failed (5)`, every failure an `AssertionError` (the failure-class reporter: ASSERTION 5, TIMEOUT 0) | 06:57:51Z to 06:57:53Z, 32.63 |
| restore | `git checkout b43f26f4 -- ...`; `git status --porcelain --untracked-files=no` empty; `paintBrushWord` 6 on disk | | |
| green | restored | `Tests 5 passed (5)` | 06:57:58Z to 06:58:01Z, 32.98 |

The red, quoted. Each row failed on "`<name>` picked mid-drag changed the word for the rest of the
stroke", comparing plane A's four cells:

| row | expected | received | the bits that moved |
|---|---|---|---|
| another shape (a shape button, `pickCollisionShape`) | `[12297, 12297, 12297, 12293]` | `[12298, 12298, 12298, 12293]` | shape 9 to 10 |
| the mirrored entry of the same shape (a shape button) | same | `[13321, 13321, 13321, 12293]` | +0x400, X-flip |
| Flip H (`setSelectedCollisionXFlip`) | same | `[13321, 13321, 13321, 12293]` | +0x400, X-flip |
| Flip V (`setSelectedCollisionYFlip`) | same | `[14345, 14345, 14345, 12293]` | +0x800, Y-flip |
| another floor type (a Floor button, `setSelectedCollisionSolidity`) | same | `[4105, 4105, 4105, 12293]` | solidity all to top |

Cell 0 changes as well as cells 1 and 2 because the move from tile 0 to tile 2 fills tile 1 with
`linePoints`, and tile 1 is still cell 0. Before the fix, that re-entry repainted the pressed cell
with the new word too. `npx tsc --noEmit` exit 0, no output, 06:57:06Z to 06:57:25Z.

## 4. The harness, every run

**Rig.** The harness's own, unchanged: `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only,
integer client aims with the cell derived back from each integer, dpr and the canvas rect printed,
Xvfb's real pointer parked outside the window, every mouse event the page receives logged,
`spawnGuarded` + `await killTree(child)`. **PART `abw`, added:** the document is opened by a real
double-click (two presses, the second with `clickCount: 2`) on a Chunks grid thumbnail, a chunk with
art at least 8 tiles wide. That is `ChunkGrid`'s `onDoubleClick`, then `openChunkInComposer`, which
switches to the Art facet. The Collision paint tool, Plane A and shape button index 3 are armed by
real clicks. The composer canvas is found by `composer-collision-gesture-harness.mjs`'s selector, and
its zoom is `canvas.width / (widthTiles * 8)`. Words are read with `__dbg.aeon.artDocCollisionAt`.
Every expected word is `collisionPaintWord(W, old)` over the cell's word before the stroke, bundled
from the tree. W is read from the running store with `armCollisionBrush({})`, which writes nothing.
**The rows.** ABW.0 premise: focus on a shape button after the setup. With the stroke held, cells 1
and 2 are painted with W1. Real Tabs, bounded at 60 with every hop recorded, reach ANOTHER shape
button, and no Tab produced a click. The Space's click reached a button titled `#<n>`. W2 differs
from W1 and paints differently, and the canvas did not move. **ABW.a** is the discriminating row:
all four cells carry W1. ABW.b, ABW.c and ABW.d are controls that hold with or without the latch:
cells 1 and 2 carry W1 and plane B is untouched, one Ctrl+Z restores both planes, and the NEXT press
paints cell 1 with W2 and nothing else.
**Which tree.** Every run printed `root:` and `pinned: AURORA_BUILT_TREE=` naming this worktree,
`build: FRESH`, `build flavour: DEBUG`, and `in-tree: yes`. `ELECTRON_BIN` named the main checkout's
electron. **Build check:** the bundle's count of `=== "collision") paintBrushWord` (the composer's
press latch) was 0 after the red build and 1 after the final build. The map's own four
`paintBrushWord` lines are in both builds.
**The copy.** Per run, a fresh rsync of the aeon working tree (read only; `.git` and `.claude`
excluded, 273M) into a run-unique directory of this session's scratchpad, named by `AEON_DIR` and
deleted after the run (every run printed `copy removed: yes`). The harness copies it again into its
own mkdtemp. Nothing is saved.
**Display.** `xvfb-run -a`, screen 1680x1050, window 1400x872 inner. **dpr 1 in every run.**
Composer canvas `{x 308, y 135, w 1024, h 1024}` at zoom 8 on chunk `OJZ_01` (16x16 tiles), cells
(0,0) to (3,0), aims `(372,199)`, `(500,199)`, `(628,199)`, `(756,199)`, each derived back to its
own cell. The same in every run that reached the rows.

| run | harness | src | parts | totals | time | start (load), end (load), UTC |
|---|---|---|---|---|---|---|
| dev1 | uncommitted (blob `00a53104`) | identical to HEAD `b43f26f4` | abw | 1/2: **ABW.0 UNMEASURABLE**, `doc null` (below) | 16.7 s | 07:01:14Z (11.66), 07:01:33Z (15.62) |
| dev2 | uncommitted, blob `9287e2bb` (the blob committed as `e0003e64`) | identical to HEAD | abw | 6/6 PASS | 21.7 s | 07:02:04Z (26.49), 07:02:26Z (20.62) |
| **red-abw** | `e0003e64` (blob `9287e2bb`) | ComposerCanvas.tsx at `b43f26f4^` | abw | 5/6: **FAIL ABW.a** | 27.5 s | 07:03:17Z (45.55), 07:03:47Z (51.63) |
| **final1** | `e0003e64` | identical to HEAD | all | **25/25 PASS, 0 FAIL, 0 UNMEASURABLE** | 62.6 s | 07:04:00Z (45.83), 07:05:04Z (31.00) |
| **final2** | `e0003e64` | identical to HEAD | all | **25/25 PASS, 0 FAIL, 0 UNMEASURABLE** | 63.9 s | 07:05:08Z (29.72), 07:06:12Z (30.75) |
| **final3** | `e0003e64` | identical to HEAD | all | **25/25 PASS, 0 FAIL, 0 UNMEASURABLE** | 66.5 s | 07:06:12Z (30.75), 07:07:20Z (51.78) |

Logs: `docs/captures/2026-09-25-art-brush-word-latch/logs/` (`dev1.log`, `dev2.log`, `red-abw.log`,
`final1.log`, `final2.log`, `final3.log`). Every part of every run printed "no mouse event reached
the page at a position this harness did not send". The box was heavily loaded by other work (1-min
load up to 52) and no row timed out.

**dev1, and what it does not prove.** The first version of the part assumed that the chunk the
aeon open puts in the composer (`firstEditableChunk`) would still be open after the setup's Explorer
click. It was not: `artChunkOpen()` was `null`. The row said UNMEASURABLE and reached no gesture. The
part now opens a chunk itself by the real double-click described above. dev1 is kept as a log. It
proves nothing about ABW.a.

**The red run.** The mutation was on disk before its rebuild (`VITE_AURORA_DEBUG=1 npm run build`,
07:02:55Z to 07:02:59Z). The run printed `src on disk: DIFFERS FROM HEAD (a mutation?)` naming
`M  src/renderer/components/art/ComposerCanvas.tsx`. ABW.0 PASS: focus after the setup was on
`#2 · solid · all` (shape-button index 3). While the stroke was held, focus was `<body>`. 19 Tab hops
went through two untitled buttons, the four Brush size buttons, Mirror, Flip V, the four Floor
buttons, five untitled buttons and "Erase (air)", and ended on `#111 · solid · all` (index 0), with
no click during the Tabs. The Space produced one click, `{BUTTON, "--", title "#111 · solid · all",
detail 0}`. W1 was 12290 `{shape 2, all}` and W2 12399 `{shape 111, all}`. **ABW.a FAIL:** "A cells
1..4 [12290,12290,12399,12399]; W1 paints [12290,12290,12290,12290]; the live word W2 would paint
[12399,12399,12399,12399]". ABW.b, ABW.c and ABW.d PASS. The restore was
`git checkout b43f26f4 -- src/renderer/components/art/ComposerCanvas.tsx`, then
`git status --porcelain --untracked-files=no` empty (the whole tree), then a fresh debug build
(07:03:52Z to 07:03:53Z) for the finals.

**The finals.** In each, ABW.0 printed the same route and words as the red run. **ABW.a:** "A cells
1..4 [12290,12290,12290,12290]; W1 paints [12290,12290,12290,12290]; the live word W2 would paint
[12399,12399,12399,12399]". ABW.b: cells 1 and 2 12290, plane B `[0,0,0,0]` before and after. ABW.c:
after one Ctrl+Z both planes are `[0,0,0,0]`. ABW.d: cell 1 `12399`, cells 2 to 4 `0`. The detail
lines under the five ABW rows, taken from each final log and hashed, give `07314b7c` in all three (5
lines each). The twenty rows of the earlier parcels (SETUP.0, M1, M2, M4, BW, M6) pass beside them,
and M6 runs after `abw`. `node scratchpad/check-harness-guards.mjs` at `e0003e64`: "292 clean / 293
classified ... 0 failure(s) · 1 unguarded-untracked" (O5).

## 5. Suite

| tree | `npm test` | Test Files | Tests | start (load), end (load), UTC |
|---|---|---|---|---|
| `e0003e64` (fix, rows, harness) | exit 0 | 654 passed \| 3 skipped (657) | 10296 passed \| 9 skipped (10305) | 07:07:37Z (56.90), 07:11:17Z (59.55) |
| `e0003e64` with this packet, its six logs and the ROADMAP edit staged (the content committed next) | exit 0 | 654 passed \| 3 skipped (657) | 10296 passed \| 9 skipped (10305) | 07:13:40Z (51.93), 07:16:35Z (35.28) |

The base's totals were not re-measured in this session. The new file adds five tests. The run
printed `check-test-collection: OK: 657 test-shaped file(s) on disk, all 657 collected by vitest`,
`check-doc-citations: OK, every path cited by a document line written since
2026-09-06T00:39:36Z is tracked`, `skip-report: OK. Every skip named its reason` and
`failure-class: no failures in this run (657 module(s) reported)`. It was run with
`VITEST_MAX_WORKERS=4`. Both runs printed the same lines. After the table's second run, the only
change to this file was that row.

## 6. Deviations from the brief, and the calls I made

- **D1. The picked entry's mirror flag is latched with the word**, as the hub ratified for the map. It
  has its own node row.
- **D2. One ref for the packed word, not one per field**, as on the map. Latching the word whole means
  no input of `selectedCollisionWord` can be missed now or later.
- **D3. The `null` fallback paints the live word.** `hostPointer` is rebuilt when `tool` changes, but
  `lastTileCellRef` is not cleared. So a tile-stamp or palette-apply drag whose tool changes to
  collision under the held button reaches the collision branch with no collision press behind it.
  Before the mount's first collision press, the ref is `null` and the cell takes the live word, as
  every cell did before the fix. An air default would erase. After the first press the ref holds the
  last press's word (O3).
- **D4. New test file, not the paste file.** The nearest mounted ComposerCanvas test,
  `composer-collision-paste-mounted.test.ts`, states in its header "Nothing here paints", so
  the brush rows went into a sibling in the same style and on the same harness.
- **D5. The plane is left live, and the map's reason for it does not transfer. This is the brief's
  instruction I could not follow as written.** The brief says to leave the plane live "if that
  matches the map's reasoning". The map's reason was that a mid-drag plane change flushes into a
  second command through `recordPaint`'s plane clause. The composer has no `recordPaint`: its undo is
  one snapshot per gesture (`beginTileGesture` / `commitTileGestureStep`), or one `set-chunk` at `up`
  for a chunk document. So that reason does not apply here. I left the plane live anyway, because
  the ruling latches "the word" and the plane is not part of it. Latching it would be a behaviour
  change no ruling covers. Booked as O1 for a ruling, not decided here.
- **D6. The live route is "Tabs until another shape button", not one Tab.** A composer press moves
  focus to `<body>`, so the map's route does not exist in this facet. The premise row records every
  hop and requires that no Tab clicked anything. 19 Tabs in every run.
- **D7. The live part extends `map-behaviour-fixes-harness.mjs`, not
  `composer-collision-gesture-harness.mjs`.** The latter drives the palette with `.click()` (which the
  brief forbids for this proof) and opens the live aeon checkout (open only). The former has the
  real-input driver, the aeon-copy refusal, the stray-event log and focus reads PART `bw` already uses.
- **D8. `node_modules`:** the worktree had none at all, not a symlink. I made it with
  `cp -al <main>/node_modules node_modules`, as the brief prescribes for the symlink case. After that,
  `node_modules/.bin/electron` existed in the worktree. `ELECTRON_BIN` still named the main
  checkout's, as briefed. `check-cited-paths` printed OK.
- **D9. The run helper was a shell script in this session's scratchpad**, not committed. Per run it
  ran `node --check` on the harness and rsynced aeon (excludes read from a file) into a run-unique
  directory. It then ran the harness with `AEON_DIR`, `AURORA_BUILT_TREE`, `ELECTRON_BIN` and `PART`
  under `timeout -s TERM 420`, and deleted the copy.
- **Red-first (e): the proof method did not change.** dev1 and dev2 ran uncommitted blobs. Every claim
  above rests on the committed blob `9287e2bb` and the committed fix `b43f26f4`.

## 7. Where the tree disagreed with the brief

- The collision branch sat at lines 437 to 444 of `ComposerCanvas.tsx` at the base, not 428 to 435.
- "Mirroring the map's `paintBrushWord` / `brushWordNow()` shape": done. But "as size does" has no
  subject in this facet, because the composer's collision brush has no size and no other press latch.
  `paintBrushWord` is the first one here.
- The brief said `node_modules/.bin/electron` does not exist in an agent worktree. True before the
  `cp -al`, false after (D8).
- `docs/ROADMAP.md` held no separate row for this parcel. It was booked as the "(O1)" clause of row
  162's "Booked, not fixed" list, which said "queue row ART-BRUSH-WORD-LATCH", but no such row
  existed. That clause is replaced in place by a DELIVERED clause (section 10), and no row is added.

## 8. Observations for the overseer, not acted on

- **O1. The composer's plane is read per cell, with no reason on record (D5).** A Plane button
  pressed mid-stroke moves the rest of the stroke to the other plane, inside the same undo step. The
  map keeps this deliberately, for a reason that does not exist here. Whether the composer should
  latch its plane is a ruling. Read, not measured.
- **O2. The composer's OTHER tile-space brushes read their inputs live per cell, the same class.**
  The tile-stamp branch reads `brushTile`, `paletteLine`, `stampPriority` and the X/Y flip ref per
  cell. The palette-apply branch reads `paletteLine` per cell. The ruling's ground ("the word latches
  at the press") names the collision word. No ruling covers these. Read, not measured.
- **O3. The latch goes stale between strokes, as on the map (its O2).** Nothing clears
  `paintBrushWord` on `up`. A tile stroke switched to the collision tool mid-drag paints the last
  collision press's word. Read, not measured.
- **O4. Focus differs between the two facets.** A map press leaves a palette button focused, and a
  composer press moves focus to `<body>`. With focus on `<body>` a mid-stroke Space goes to the
  composer's hand-pan hook (`use-hand-pan.ts`) instead of pressing a button. Neither behaviour was
  changed.
- **O5. `check-harness-guards` reports "1 unguarded-untracked"**, which is
  `scratchpad/preset-schema-key-probe.mjs` (registered, never prints PASS; G9). The file is tracked
  and not in this branch's diff. 0 failures.
- **O6. `composer-collision-gesture-harness.mjs` cites "ComposerCanvas :383-388"** for the plane read,
  which is now at another line. Its palette and tool presses are `.click()`. Not touched.

## 9. TAGGED for the foreground

- A real (not emulated) scale factor other than 1: every run read dpr 1.
- The owner's window size: measured at the harness's 1400x900 only.
- The Flip H, Flip V, mirrored-entry and Floor routes in the Art facet are node-covered, not driven
  live. The live route drives a shape button only, as the map's did.
- Whether an author would ever reach a shape button mid-stroke by keyboard in this facet: it takes 19
  Tabs (D6). The defect was real and is fixed, but its practical reach is a foreground question.
- Nothing here needs the emulator. None was started, attached to or read.

## 10. Commits

`b43f26f4` the Art facet's collision brush word latched at the press, with the five node rows ·
`e0003e64` the harness's PART abw · this packet, its six run logs, and `docs/ROADMAP.md` row 162's O1
clause replaced by the DELIVERED clause.
