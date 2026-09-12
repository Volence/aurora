# BRUSH-WORD-LATCH, 2026-09-12: the collision brush word is latched at the press

**Branch** `parcel/brush-word-latch`, base master `d7049505`. **Date** 2026-09-12.
**Source.** The hub ruling of 2026-09-12T09:39:48Z in the empyrean hub's OVERSEER-LOG, read at
empyrean `origin/main`: "aurora BRUSH-WORD-LATCH = (a), latch the brush word at the press ...
Shape, flip and solidity latch at the press as M4 latches size; every other brush property
already is. cdp-sweep-4 measurement is aurora's agent's, unre-measured by aurora or the hub;
parcel owes a red-first mid-stroke case." The defect is `docs/reviews/2026-09-12-map-behaviour-fixes.md`
section 7 O1, measured on screen in `docs/reviews/2026-09-12-cdp-sweep-4.md` section 5.4 O2.
**Instrument.** Node: five rows in `src/renderer/components/__tests__/map-viewport-mounted.test.ts`
(the block holding M4's row). Live: PART `bw` of `scratchpad/map-behaviour-fixes-harness.mjs`
(`npm run harness:map-behaviour-fixes`, already registered, so `package.json` is unchanged).
**Not done.** The Art facet's collision brush, a second writer with the same shape (section 8,
O1). No emulator was touched. No aeon build, sigil, `emit_sound_blob` or `cargo` was run.
Nothing was written into the aeon tree.

---

## 0. The answer

| item | status | commit | proof |
|---|---|---|---|
| the collision brush word is latched at the press | **DONE** | `b29b5564` | sections 2, 3, 4 |
| node rows, one per input of the word (5) | 5 red under the revert, green with the fix | `b29b5564` | section 3 |
| live row BW.a, the mid-stroke Space on a focused shape button | red under the revert (cells 3 and 4 took 12291), green with the fix | `602d57ff` | section 4 |
| live controls BW.b, BW.c, BW.d | green on both trees | `602d57ff` | section 4 |
| harness finals | **20/20 PASS, 0 FAIL, 0 UNMEASURABLE in each of three runs, dpr 1 in every run** | | section 5 |

**The cdp-sweep-4 measurement is now re-measured here, both ways.** The route is its own: the
setup's last click is shape button `#2` (word 12290), which keeps focus through the press; with
the stroke held, a real Tab reaches `#3` and a real Space picks word 12291. With the fix reverted,
cells 3 and 4 took 12291 (`red-bw`); with it, all four cells carry 12290 (the three finals).

## 1. The store reads, derived from source

Every store read in `paintCollisionCell` (`src/renderer/components/MapViewport.tsx`) and in what it
calls, classified at the base `d7049505` and at the fix `b29b5564`. The helpers it calls
(`ensureCollisionPlanes`, `crossoverSpanForCursor`, `cellTileIndices`, `crossoverMarkIndices`,
`collisionPaintWord`, `collisionPaintTargets`, `buildBothPlanesEntries`, and inside
`selectedCollisionWord` the pure `packCollisionCell` and `effectiveXFlip`) read no store: a count of
`useEditorStore|useProjectStore|useViewStore|getState` over the seven `src/core` files they live in
is 0 in each, and the same pattern counts 197 in `MapViewport.tsx` (the positive control).
`recordPaint` reads the section (its run key) and writes the dirty flags; nothing in the word.

| input | what it feeds | before | after |
|---|---|---|---|
| `selectedCollisionProfile` (shape) | the word | **LIVE per cell** | **LATCHED** (`paintBrushWord`) |
| `selectedCollisionEntryFlipX` (the picked shape entry's mirror flag) | the word (XOR with Flip H) | **LIVE per cell** | **LATCHED** |
| `selectedCollisionXFlip` (Flip H) | the word | **LIVE per cell** | **LATCHED** |
| `selectedCollisionYFlip` (Flip V) | the word | **LIVE per cell** | **LATCHED** |
| `selectedCollisionSolidity` (Floor) | the word | **LIVE per cell** | **LATCHED** |
| `collisionBrushSize` | the target area | latched (M4, `paintBrushSize`) | latched |
| `collisionPaintBothPlanes` | the second plane's write | latched (`paintBothPlanes`) | latched |
| `collisionCrossoverBrush` | the crossover bits | latched (`paintCrossover`) | latched |
| `collisionCrossoverSpanMode` | the crossover span | latched (`paintCrossoverSpanMode`) | latched |
| Alt (`e.altKey`, off the event) | propagate | latched (`paintPropagate`) | latched |
| `collisionPaintPlane` | the plane, the drag cache key, `recordPaint`'s run | live | **live, out of scope** (its mid-drag change flushes into a second command by design) |
| project store: act, section, its planes and nametable | the document being painted | live | live (the document, not a brush property) |

**What the ruling's three words map to.** "Shape" is one field. "Solidity" is one field. "Flip" is
THREE: Flip H, Flip V, and the picked shape entry's mirror flag, which a shape button writes
together with the shape (`pickCollisionShape(shape, entryFlipX)`) and which `selectedCollisionWord`
XORs with Flip H. The ruling does not name that last one; see deviation D1.

## 2. The change (`b29b5564`)

- A `paintBrushWord` ref beside `paintBrushSize`, with a docblock naming the ruling and the
  cdp-sweep-4 measurement.
- `brushWordNow()`, the one place the press builds the word (the same `selectedCollisionWord` call
  over the same five fields that `paintCollisionCell` used to make per cell).
- The paint-collision press sets `paintBrushWord.current = brushWordNow()` beside
  `paintBrushSize.current = ...`, before its first `paintCollisionCell`.
- `paintCollisionCell` reads `const word = paintBrushWord.current ?? brushWordNow();` The ref is
  `null` only until the mount's first collision press (deviation D3).
- **Unchanged on purpose:** `collisionPaintPlane` is still read per cell. `drawCollisionPreview`
  still builds its own live `ghostWord`, because it previews the NEXT press, and during a drag the
  move handler returns in the paint branch before reaching it. No palette control's focus
  behaviour changed: `CollisionPalette.tsx` is not in this branch's diff.

## 3. Red first, node side

The fix and the rows were committed together (`b29b5564`); the mutation is the fix reverted on disk;
the restore is `git checkout b29b5564 -- src/renderer/components/MapViewport.tsx`.

| step | what was on disk | result | time (UTC), load |
|---|---|---|---|
| green | the fix, uncommitted | `Tests 166 passed (166)`; `-t BRUSH-WORD-LATCH` lists the five rows by name, `5 passed \| 161 skipped` | 18:09:07Z to 18:09:10Z, 14.97 |
| **mutation** | `git checkout b29b5564^ -- src/renderer/components/MapViewport.tsx`; `git diff --stat HEAD -- src`: `src/renderer/components/MapViewport.tsx \| 36 +++++-----` (5 insertions, 31 deletions); line 2964 reads `const est = useEditorStore.getState();`; `paintBrushWord` occurs 0 times on disk and 5 times at `b29b5564` | | |
| **red** | the mutation | vitest exit 1, `Tests 5 failed \| 161 passed (166)` | 18:12:11Z to 18:12:13Z, 13.63 |
| restore | `git checkout b29b5564 -- ...`; `paintBrushWord` 5 on disk | `git status --porcelain --untracked-files=no -- src` empty (the whole-tree status listed ` M scratchpad/map-behaviour-fixes-harness.mjs`, the harness edit in progress; see D6) | |
| green | restored | `Tests 166 passed (166)` | 18:13:05Z to 18:13:07Z, 8.87 |

The red, quoted. Each of the five failed on the same assertion, "`<name>` picked mid-drag changed the
word for the rest of the stroke", with cell P (the press) holding the expected word and cells Q and R
(after the change) holding the new one:

| row | expected, every sub-tile of P, Q, R | received on Q and R | the bits that moved |
|---|---|---|---|
| another shape (a shape button, `pickCollisionShape`) | 12297 (shape 9, all) | 12298 | shape 9 to 10 |
| the mirrored entry of the same shape (a shape button) | 12297 | 13321 | +0x400, X-flip |
| Flip H (`setSelectedCollisionXFlip`) | 12297 | 13321 | +0x400, X-flip |
| Flip V (`setSelectedCollisionYFlip`) | 12297 | 14345 | +0x800, Y-flip |
| another floor type (a Floor button, `setSelectedCollisionSolidity`) | 12297 | 4105 | solidity all to top |

The shape row's diff in full: expected `12297` twelve times; received `12297` four times, then
`12298` eight times. **ANTI-VACUOUS, in every row:** `(W1 ^ W2) & bits` is non-zero, where `bits` is
that field's mask from `packCollisionCell` with only that field set; and
`collisionPaintWord(W2, fill) !== collisionPaintWord(W1, fill)`. The rows also assert the premise
that the press painted P with W1, that one undo takes the stroke back, and that the NEXT press
paints W2. Expected words come from the tree's `selectedCollisionWord` and `collisionPaintWord`.

## 4. The harness, every run

**Rig.** The harness's own, unchanged: `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only,
integer client aims with the cell derived back from the integer, dpr and the map canvas rect
printed per part, Xvfb's real pointer parked outside the window, every mouse event the page
receives logged, `spawnGuarded` + `await killTree(child)`. Additions for PART `bw`: the click log
records each button's `title` (the M rows read only `text` and `row`), a read of the focused element
and its index among the shape buttons, and two more bundles from the tree, `collisionPaintWord` and
`unpackCollisionCell`. Every expected cell word is `collisionPaintWord(W, old)` over the sub-tile's
word before the stroke, with W read from the running store (`armCollisionBrush({})`, an empty
selection, which writes nothing); BW.a's claim is about the painted words, read back per sub-tile.
**The rows.** BW.0 premise (focus on a shape button through the press; cells 1 and 2 painted with
W1; after the Tab, focus on ANOTHER shape button; the Space's click reached a button titled `#<n>`;
W2 differs from W1 and paints differently; the canvas did not move). **BW.a** the discriminating
row: all four cells carry W1. BW.b, BW.c and BW.d are controls that hold with or without the latch:
cells 1 and 2 carry W1 and plane B is untouched; one Ctrl+Z restores both planes; the NEXT press
paints cell 1 with W2 and nothing else.
**Which tree.** Every run printed `root:` and `pinned: AURORA_BUILT_TREE=` naming this worktree,
`build: FRESH`, `build flavour: DEBUG`, and the harness's own `in-tree: yes`; `ELECTRON_BIN` named
the main checkout's electron.
**The copy.** Per run, a fresh rsync of the aeon working tree (read only; `.git` and `.claude`
excluded, 165M) into a run-unique directory of this session's scratchpad, named by `AEON_DIR` and
deleted after the run (every run printed `copy removed: yes`); the harness copies it again into its
own mkdtemp. Nothing saved. Aeon's HEAD was not recorded (this worktree's guard refuses git against
another repo).
**Display.** `xvfb-run -a`, screen 1680x1050, window 1400x872 inner. **dpr 1 in every run.** Map
canvas rect `{x 284, y 74, w 876, h 774}` at zoom 2 for m1, m2, m4 and bw; `{x 284, y 74, w 876,
h 721}` at zoom 1 for m6; the same in every run.

| run | harness | src | parts | totals | time | start (load), end (load), UTC |
|---|---|---|---|---|---|---|
| dev1 | uncommitted (blob `f2bd2051`) | identical to HEAD `b29b5564` | bw | 6/6 PASS | 18.9 s | 18:14:16Z (8.94), 18:14:35Z (9.77) |
| red-bw-hung | `602d57ff` (blob `673b939a`) | MapViewport.tsx at `b29b5564^` | bw | **DID NOT RUN A ROW** (below) | killed | 18:16:04Z (16.38), SIGTERM 18:27:31Z (10.08), exit 130 |
| **red-bw** | `602d57ff` | MapViewport.tsx at `b29b5564^` | bw | 5/6: **FAIL BW.a** | 18.6 s | 18:28:28Z (11.94), 18:28:47Z (9.83) |
| **final1** | `602d57ff` | identical to HEAD | all | **20/20 PASS, 0 FAIL, 0 UNMEASURABLE** | 49.0 s | 18:30:14Z (12.04), 18:31:04Z (6.45) |
| **final2** | `602d57ff` | identical to HEAD | all | **20/20 PASS, 0 FAIL, 0 UNMEASURABLE** | 49.0 s | 18:31:14Z (5.61), 18:32:03Z (3.90) |
| **final3** | `602d57ff` | identical to HEAD | all | **20/20 PASS, 0 FAIL, 0 UNMEASURABLE** | 49.0 s | 18:32:58Z (3.91), 18:33:47Z (3.46) |

Logs: `docs/captures/2026-09-12-brush-word-latch/logs/` (`dev1.log`, `red-bw-hung.log`, `red-bw.log`,
`final1.log`, `final2.log`, `final3.log`). The blob every red and final run printed, `673b939a`, is
`git rev-parse 602d57ff:scratchpad/map-behaviour-fixes-harness.mjs`. Every part of every completed
run printed "no mouse event reached the page at a position this harness did not send".

**The red run.** The mutation was on disk before its rebuild (`VITE_AURORA_DEBUG=1 npm run build`,
18:15:55Z), and the run printed `src on disk: DIFFERS FROM HEAD (a mutation?)` naming
`M  src/renderer/components/MapViewport.tsx`. BW.0 PASS: focus after the setup on `#2 · solid · all`
(shape-button index 3), still there while held, `#3 · solid · all` (index 4) after the Tab; the
Space produced one click, `{BUTTON, "--", title "#3 · solid · all", detail 0}`; W1 12290
`{shape 2, all}` to W2 12291 `{shape 3, all}`. **BW.a FAIL:** "A cells 1..4
[[12290,12290,12290,12290],[12290,12290,12290,12290],[12291,12291,12291,12291],[12291,12291,12291,12291]];
W1 paints [12290,12290,12290,12290] per cell; the live word W2 would paint [12291,12291,12291,12291]".
BW.b, BW.c, BW.d PASS. The restore was `git checkout b29b5564 -- src/renderer/components/MapViewport.tsx`,
`git status --porcelain --untracked-files=no` empty (the whole tree), then a fresh debug build
(18:29:14Z) for the finals.

**The hung run, and what it does and does not prove.** The first red attempt printed its preamble
and `setup:` at 18:16:12Z and nothing after. At 18:26Z: the page was listed by CDP in 8 ms as
"Aurora - Sonic 4 - Oracle Jungle Zone · act1" (the copy had opened), but no `--type=renderer`
process existed under Electron's zygotes, and a second client's `Runtime.evaluate` got no answer in
5 s. `coredumpctl` since 18:15Z shows no Electron core (one Steam SIGSEGV). The box ran out of
memory at 18:17:15Z to 18:17:22Z: earlyoom SIGKILLed six processes (Steam, Vivaldi and Discord
helpers, none of ours) and the kernel OOM killer took `claude-desktop` (12 GB anonymous). The renderer's
death is not attributed further. The harness waits 45 s per CDP call and setup's open loop makes 80,
so a dead renderer reads as an hour's hang (O3). I SIGTERMed the harness (its guard reaped the tree;
exit 130, copy removed, no process left), kept its log as `red-bw-hung.log`, put a
`timeout -s TERM 420` around the harness in the run helper, and re-ran on a fresh copy: `red-bw`.
**It proves nothing about BW.a: it reached no row.**

**The finals, row by row (final1; final2 and final3 print the same BW values: the detail line under
each of the five BW rows, taken from each log with `grep -A1` and hashed, gives `0e6ce494` in all
three, and each log has 5 of 5 BW rows PASS).** BW.0: cells
`(1,2)`, `(2,2)`, `(3,2)`, `(4,2)`, aims `(332,154)`, `(364,154)`, `(396,154)`, `(428,154)`, world
`(24,40)` to `(72,40)`, each derived back to its own cell; focus `#2` through the press, `#3` after
the Tab; W1 12290, W2 12291, differing in `shape`. **BW.a:** "A cells 1..4
[[12290 x4] x4]; ... the live word W2 would paint [12291,12291,12291,12291]". BW.b: cells 1 and 2
12290, plane B `0` before and after. BW.c: one Ctrl+Z, both planes `0`. BW.d: cell 1 `12291`, cells 2
to 4 `0`. The fifteen rows of the earlier parcel (SETUP.0, M1, M2, M4, M6) pass beside them.
`node scratchpad/check-harness-guards.mjs` at the tip: 278 clean / 278 classified, 0 failures.

## 5. Suite

| tree | `npm test` | Test Files | Tests | start (load), end (load), UTC |
|---|---|---|---|---|
| base `d7049505` | exit 0 | 615 passed \| 3 skipped (618) | 9548 passed \| 9 skipped (9557) | 18:05:00Z (20.50), 18:05:48Z (19.63) |
| `602d57ff` (the fix, the rows and the harness) | exit 0 | 615 passed \| 3 skipped (618) | 9553 passed \| 9 skipped (9562) | 18:29:16Z (6.97), 18:29:57Z (14.35) |
| `602d57ff` with this packet and its six logs staged (the content committed next) | exit 0 | 615 passed \| 3 skipped (618) | 9553 passed \| 9 skipped (9562) | 18:38:23Z (7.62), 18:39:06Z (14.57) |

+5 tests: the five BRUSH-WORD-LATCH rows. With this packet in the tree, `check-doc-citations`
printed "OK, every path cited by a document line written since 2026-09-06T00:39:36Z is tracked",
and `check-harness-guards` 278 clean / 278; `npx tsc --noEmit` exit 0, 18:39:06Z to 18:39:13Z
(14.05). Every run printed `failure-class: no failures in this run
(618 module(s) reported)` and `skip-report: OK. Every skip named its reason`. `npx tsc --noEmit`
exit 0, no output: 18:08:57Z to 18:09:07Z (13.43 to 14.97) on the fix, and 18:29:57Z to 18:30:04Z
(13.68) at `602d57ff`.

## 6. Deviations from the brief, and the calls I made

- **D1. The word has an input the ruling does not name, and it is latched.** The picked shape
  entry's mirror flag (`selectedCollisionEntryFlipX`) is written by the shape button with the shape
  and XORed with Flip H inside `selectedCollisionWord`. It is plainly part of the brush word (it
  arrives through the very button the defect was measured on), so it is latched with the rest; it
  has its own node row. Flagged, as the brief asked.
- **D2. One ref for the packed word, not one per field.** The ruling's heading is "latch the brush
  word at the press", and the word is what `paintCollisionCell` consumes; latching it whole means no
  input of `selectedCollisionWord` can be missed now or later.
- **D3. The `null` fallback is my call.** The move handler reads the live tool and no tool change
  ends a paint drag, so a tile stroke whose tool changes to the collision brush under the held button
  reaches `paintCollisionCell` with no collision press behind it. Before the first collision press of
  a mount, the ref is `null` and the cell takes the live word, as it did before the fix. An air
  default would ERASE collision in that route. After the first press the ref holds the last press's
  word, as the other six latches do (O2).
- **D4. The node rows change the word through the store setters the palette buttons call** (as M4's
  row did), not through rendered buttons. The live route is driven for the shape button only (the
  one the brief owes); Flip H, Flip V and Floor are node-covered, not driven live.
- **D5. Extended the registered harness** rather than adding one, so `package.json` is unchanged.
- **D6. After the NODE red's restore, the whole-tree status was not empty:** it listed
  ` M scratchpad/map-behaviour-fixes-harness.mjs`, the harness edit then in progress (committed next as
  `602d57ff`), while `src` was clean. After the HARNESS red's restore the whole-tree status was empty.
- **D7. The run helper was a shell script in this session's scratchpad**, not committed. What it did
  per run: `node --check` the harness; rsync the aeon tree with `.git` and `.claude` excluded (read
  from a file, because this worktree's guard refuses a command line carrying the literal `.git`) into a
  run-unique directory; run the harness with `AEON_DIR`, `AURORA_BUILT_TREE`, `ELECTRON_BIN` and
  `PART`, under `timeout -s TERM 420` from the retry on; delete the copy.
- **Red-first (e): the proof method did not change.** dev1 ran an uncommitted blob; every claim
  above rests on the committed blob `673b939a`.

## 7. Where the tree disagreed with the brief

- The brief's "shape, flip and solidity" is five store fields, not three (section 1, D1).
- "Every other brush property already is" latched: true for the size, both planes, the crossover
  brush, its span and Alt. The plane is the one live brush input left, and the brief rules it out of
  scope; its live read is the M1/M2/M3 territory (`recordPaint`'s plane clause).

## 8. Observations for the overseer, not acted on

- **O1. The Art facet's collision brush has the same shape, and is untouched.**
  `src/renderer/components/art/ComposerCanvas.tsx` lines 428 to 435 build the word from the live
  store on every cell and read `collisionPaintPlane` live, then call `paintDocCollision`. Its comment
  reads "Same packed-word pattern as MapViewport.paintCollisionCell"; after this fix that is true of
  the map's preview and not of its paint. A different writer; no ruling covers it; not measured.
- **O2. The latches go stale between strokes.** Nothing clears the seven press-latched refs on
  release. The move handler reads the live tool and no tool change ends a paint drag, so a tile stroke
  switched to the collision tool mid-drag paints with the LAST collision press's size, modes and word.
  Read, not measured; pre-existing for the six older latches.
- **O3. The harness cannot report a renderer that dies during setup.** Each CDP call waits 45 s and
  setup's open loop makes 80 of them, so the run hangs for about an hour instead of saying
  UNMEASURABLE. Bounding setup by wall time, or checking for a renderer process, would make it loud.
  Worked around outside the harness here (D7), not fixed.
- **O4. Palette focus is as it was.** The shape grid, Flip and Floor buttons keep focus; after this
  fix a Space there changes the NEXT stroke's word and leaves the held stroke alone (BW.a, BW.d).

## 9. TAGGED for the foreground

- A real (not emulated) scale factor other than 1: every run read dpr 1.
- The owner's window size: measured at the harness's 1400x900 only.
- The Art facet's collision brush (O1): not driven.
- Nothing here needs the emulator; none was started, attached to or read.

## 10. Commits

`b29b5564` the brush word latched at the press, with the five node rows · `602d57ff` the harness's
PART bw · this packet with the six run logs.
