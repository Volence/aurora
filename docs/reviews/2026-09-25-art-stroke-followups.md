# ART-STROKE-FOLLOWUPS, 2026-09-25: the tool latches at the press, the first write no longer moves the canvas, and undo back to saved reads clean

**Branch** `parcel/art-stroke-followups`, base master `c0065e4f`. **Date** 2026-09-25.
**ROADMAP** §5.1 row 209.
**Source.** Row 209 (booked from row 207's packet, `docs/reviews/2026-09-25-art-brush-latch-rest.md`
section 8, O1 to O3) and, for (a), the hub ruling read at empyrean `origin/main`
`docs/OVERSEER-LOG.md` line 15167, `2026-09-25T08:55:30Z HUB RULING`: "RULED: the tool is a stroke
input, so it latches at the press on (a)'s ground (a stroke's inputs latch when it starts), under
the same conditions as O1/O2."
**Instrument.** Node: two new files that mount the real `ComposerCanvas`,
`src/renderer/components/art/__tests__/composer-tool-latch-mounted.test.ts` (4 rows) and
`src/renderer/components/art/__tests__/composer-chunk-undo-dirty-mounted.test.ts` (3 rows), plus one
row of `composer-brush-latch-rest-mounted.test.ts` rewritten (D2). Live: PARTs `atl` (new), `acj`
(new) and `abl` (warm-up removed) of `scratchpad/map-behaviour-fixes-harness.mjs`
(`npm run harness:map-behaviour-fixes`, already registered).
**Not done.** No emulator was touched. No aeon build, sigil or `cargo` was run. Nothing was written
into the aeon tree: every live run opened a fresh rsync copy and deleted it afterwards.

---

## 0. The answer

| item | status | commits | proof |
|---|---|---|---|
| (a) TOOL-LATCH: a tool switched under the held button does not change the rest of the stroke | **DONE** | `38e25941` fix and rows; `c7eb0e0f` PART atl | sections 1, 4 |
| (b) CANVAS-JUMP: the first write to a clean chunk document no longer moves the canvas | **DONE** (small: one badge made to reserve its box) | `c2e4f8ac` PART acj, abl warm-up removed; `ecaf2e28` fix | sections 2, 4 |
| (b) PART abl's warm-up stamp | **removed**; abl 6/6 alone and in both all-part finals | `c2e4f8ac` | section 4 |
| (c) UNDO-DIRTY: undo back to the saved state reads clean, redo away reads dirty | **DONE** (a saved state per document buffer; no undo-store change) | `b1e422fe` fix and rows; `c7eb0e0f` ACJ.c | sections 3, 4 |
| (c) the discard prompt follows the fixed flag | **yes**: `askBeforeDiscard` calls `planArtDocDiscard`, which returns `proceed` on `!open.dirty`; a node row asserts `proceed` after the undo and `confirm` after the redo | `b1e422fe` | section 3 |
| node rows | (a) 4 red before the fix, 5 red under the revert (incl. the rewritten O3 row); (c) 2 red before the fix and under the revert, the third (a control) red under its own plant | | sections 1, 3 |
| live rows | ATL.a red under the (a) revert; ACJ.a and ABL.0 red under the (b) revert (twice, two harness blobs); ACJ.c red under the (c) revert | | section 4 |
| harness finals | **38/38 PASS, 0 FAIL, 0 UNMEASURABLE in each of two all-part runs; abl 6/6, atl 6/6, acj 4/4 each alone; dpr 1 in every run** | | section 4 |
| full `npm test` | **exit 1**: `Tests 1 failed \| 10351 passed \| 9 skipped (10361)`. The one failure is the vendored aeon fixture currency row (aeon's master moved today), not this diff | | section 5 |

## 1. (a) TOOL-LATCH

**What a mid-stroke switch did, re-derived.** `hostPointer` was a `useMemo` on `[tileTools, tool]`
and closed over `t`. PixelViewport routes every event to the hook it is rendered with at that moment
(`onPointerMove`: `if (hostDrawing.current && hostPointer)`; `onPointerUp`: `hostPointer?.up(...)`).
So:
- switched to another **tile-space** tool: the object swapped, the stroke did NOT end (the new object
  shares `lastTileCellRef` and `strokeLatch`), and the rest of the stroke took the new branch with
  this stroke's latched inputs;
- switched to a **pixel** tool: `hostPointer` became null, the rest of the stroke painted nothing,
  and the release never reached `up`, so `endTileGesture` did not bank a chunk document's
  `set-chunk` step and `strokeLatch` stayed set until the next press.

No reason for the per-move read is written anywhere: the memo's comment is about routing tile tools
to the host hook at all, and row 207's D2 says only that its brief asked for the stale latch and not
the tool. Nothing was booked instead of built.

**The change (`38e25941`).** `StrokeInputs` gains `tool`; the press latches it with the rest; `move`
paints with `strokeLatch.current.tool`. The hook is ONE stable object for the component's life that
forwards to the latest render's handlers (`hostImpl`), and a `strokeHeld` state (set at a press that
latched, cleared at `up` and on a document change) keeps it handed to PixelViewport until the
release whatever tool is picked meanwhile. Once released, a pixel tool's next press reaches the
pixel engine again (the `pencil` row checks that the prop is null after `up`).

**Node rows** (`composer-tool-latch-mounted.test.ts`), routed exactly as PixelViewport routes (a move
reaches the hook only while it is set; the release is lost when it is gone): a tile-stamp stroke
switched to collision, to palette-apply and to pencil stamps to its end and writes no collision; a
collision stroke switched to tile-stamp paints collision to its end and stamps nothing. Each has an
anti-vacuous check that the switched-to tool would paint differently, and the non-pencil rows check
that the NEXT press takes the new tool.

| step | on disk | result | time (UTC) |
|---|---|---|---|
| pre-fix | the rows over the unfixed base | `Tests 4 failed (4)`, each at the mid-stroke assertion | 08:58:26Z |
| green | the fix, uncommitted | art `__tests__`: `Tests 54 passed (54)`; `tsc --noEmit` exit 0 | 08:59:48Z |
| **mutation** | `git checkout 38e25941^ -- ComposerCanvas.tsx`; `git diff --stat HEAD -- src`: `ComposerCanvas.tsx \| 129 +++++++++----------` (43 insertions, 86 deletions); `strokeHeld` 0 on disk; line 648 reads `applyTileCell(t, pt.x, pt.y)`, line 654 `}, [tileTools, tool]);` | `Tests 5 failed \| 7 passed (12)` (the four new rows and the rewritten O3 row; the seven other latch rows green) | 09:00:10Z |
| restore | `git checkout 38e25941 -- ...`; `git status --porcelain --untracked-files=no` empty | | |
| **plant** | `setStrokeHeld(false);` deleted from `up` (the diff is in the log) | `Tests 1 failed \| 3 passed (4)`: "the released stroke still holds the pointer: a pencil press would go to the tile stamp" | 09:00:26Z |
| restore | from `38e25941`, clean | art `__tests__` 54 passed | |

The red, quoted: "a tile-stamp stroke switched to collision mid-drag did not stamp to its end", the
same for palette-apply and pencil, "a collision stroke switched to tile-stamp mid-drag did not paint
collision to its end: expected [ 12297, 12293, 12293, 12293 ] to deeply equal [ 12297, 12297, 12297,
12293 ]", and the O3 row "expected [ 12298, 12298, 12298, 12297 ] to deeply equal [ 12293, 12293,
12293, 12297 ]". Logs: `docs/captures/2026-09-25-art-stroke-followups/logs/a-node-prefix.log`,
`a-node-green.log`, `a-node-red.log`, `a-node-red-release.log`.

## 2. (b) CANVAS-JUMP

**Reproduced first** (run `b-repro1`, PART acj on the tree with (a) only, 09:03:18Z): one real
tile-stamp click on clean `OJZ_01` moved the canvas from `y 144` to `y 186` (dy 42.00), and the
options bar containing the doc header grew from `h 46` to `h 88`. The bar's text before:
"OJZ $01 ⚠ pixel edits to existing tiles propagate everywhere they're used Save New… px tile
Priority Keep On Off ..."; after: the same with "unsaved" after the name.

**The cause.** `ArtOptions` (`src/renderer/workspace/facets/art-facet.tsx`) mounts the `unsaved`
badge only when `open.dirty`. The doc header shares one `OptionBar` with the tool options, and
`OptionBar` (`ui/primitives.tsx`) grows to fit a wrapped line on purpose (its docblock: nothing is
truncated). At 1400x872 the badge's extra width wrapped the shared-tile warning once more, and the
canvas's scroller below moved down. Row 207's packet named it the "status row"; it is the
tool-options bar, not `ArtStatusBar` (a fixed 24px footer whose own "unsaved" cannot move anything).

**The change (`ecaf2e28`), small.** The badge is always rendered and hidden with
`visibility: hidden` plus `aria-hidden` while clean, so its box is reserved and the bar's height no
longer depends on dirtiness. Nothing else in the header changes width with dirtiness (the Save
button only changes colour). What the author sees when dirty is unchanged; when clean the bar now
has the dirty layout (see O2).

**abl's warm-up.** Removed (`c2e4f8ac`). ABL.0 already requires the canvas not to move across X, the
press and Y, so on an unfixed tree with a clean document it is the red row: b-red-abl and
b-red2-abl both FAIL ABL.0 with the canvas at `y 144` before X and `y 186` after the press.

## 3. (c) UNDO-DIRTY

**How dirty is tracked, re-derived.** A flag, `open.dirty`, set by `markOpenDirty` and cleared only
by opening a document or by Save (which re-opens). A pure doc-local document already restores the
flag on undo (`state/composer-history.ts`, the save contract's R5). A chunk document writes through
(d-37): its gestures are steps on the `zoneart:<zone>` stack, an undo rewrites the library chunk,
and `syncChunkDocFromLibrary` rebuilds the document on the history clock. Nothing on that path
touched the flag. `EditHistory` (`core/editing/history.ts`) has no save point, so a revision marker
on the stack would have been an undo-store change; a content comparison was enough and is what was
built.

**The change (`b1e422fe`).** `reconcileChunkDocDirty` in `state/chunk-doc-commit.ts` keeps a saved
state per document buffer (a `WeakMap` on `open.doc`, cloned the first time the document is seen
CLEAN; Save re-opens and so mints a new one) and sets the flag to "the contents differ from it". It
runs in its own effect on `chunkDocSyncKey`, declared after the sync effect so it sees the rebuilt
document. Contents are the cells, local art and both collision planes: the same writes
`markOpenDirty` is called for (`commitWrites` does not mark a chunk document dirty for a pixel edit
of an atlas-backed cell, and those pixels are not compared either). A document opened dirty never
gets a saved state, so it is never computed clean (`artStore.setOpenDirty`'s own rule for a map
capture). The sync effect's line is untouched, because two source gates pin it verbatim
(`chunk-doc-commit.test.ts` [F2], `chunk-doc-sync-key.test.ts` [K0]); a first version that put both
calls in one effect was red on those two, and was changed before commit.

**Node rows** (`composer-chunk-undo-dirty-mounted.test.ts`, the real `ComposerCanvas`, strokes through
its hook, undo and redo through `focusedHistory()`, which resolves `zoneart:ojz` as a premise): one
stroke then one Ctrl+Z reads clean and `planArtDocDiscard` answers `proceed`, and a redo reads dirty
and answers `confirm`; two strokes then one Ctrl+Z stays dirty and the second reads clean; a
document opened dirty stays dirty after an undo to its opening state.

| step | on disk | result | time (UTC) |
|---|---|---|---|
| pre-fix | the rows over the tree with (a) and (b) | `Tests 2 failed \| 1 passed (3)`, both at the dirty assertions; the opened-dirty control green | 09:09:55Z |
| green | the fix | the file 3 passed; `components/art` and `state` 924 passed | |
| **mutation** | `git checkout b1e422fe^ --` both source files; `git diff --stat HEAD -- src`: `ComposerCanvas.tsx \| 7 +--`, `chunk-doc-commit.ts \| 68 +------`; `reconcileChunkDocDirty` 0 in each | `Tests 2 failed \| 1 passed (3)`: "undoing back to the saved state left the chunk document marked dirty: expected true to be false", "the second Ctrl+Z, back to the saved state, left it dirty" | 09:11:27Z |
| **plant** (the control) | the `if (!o!.dirty)` guard on the saved-state capture removed | `Tests 1 failed \| 2 passed (3)`: "a document opened dirty read clean after an undo to its opening state" | 09:11:38Z |
| restore | from `b1e422fe`, `git status --porcelain --untracked-files=no` empty | art `__tests__` 57 passed | |

**The prompt.** `confirmArtDocumentOpen` and `confirmArtDocumentClose` go through `askBeforeDiscard`,
whose first act is `planArtDocDiscard(useArtStore.getState().open, ...)`, and that returns
`{ kind: 'proceed' }` when `!open.dirty` (`components/art/open-document.ts` lines 123 to 126). So the
prompt follows the fixed flag; the node row asserts it on both sides. Live, the all-part finals show
the consequence: PART abw's and PART abl's own undos now leave the document clean (`ABL.cleanup`:
"dirty false"), and PART acj, which refuses a dirty document, runs after them and finds it clean.
The prompt dialog itself was not driven live (D6).

## 4. The harness, every run

**Rig.** The harness's own: `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only, integer aims
derived back to their tiles, dpr and rects printed, Xvfb's pointer parked, every mouse event logged,
`spawnGuarded` + `await killTree`. **Which tree:** every run printed `root:` and
`pinned: AURORA_BUILT_TREE=` naming this worktree, `build: FRESH`, `build flavour: DEBUG`,
`in-tree: yes`; `ELECTRON_BIN` named the main checkout's electron. The one run on a stale build
(dev-atl1) was refused by the harness ("dist/ is STALER than src/") and ran no row. **The copy:** a
fresh rsync of the aeon working tree (`.git`, `.claude` excluded) into a run-unique scratchpad
directory, deleted after every run (`copy removed: yes` each time). **Display:** screen 1680x1050,
window 1400x872 inner, **dpr 1 in every run**. Composer canvas `{x 308, w 1024, h 1024}` at zoom 8 on
`OJZ_01`.

**What the new parts do.** PART **atl**: a shape armed by real clicks (so the collision brush has a
word), the Tile stamp armed by a real click, a stroke held across tiles 1 and 2, real Tabs from
`<body>` to the rail's Collision paint button (181 hops) and a real Space; ATL.a asks that tiles 3 and
4 are stamped and that no collision cell under the five tiles changed on either plane; ATL.b to ATL.d
are controls (tiles 1, 2 and 5; one Ctrl+Z; the NEXT press paints collision and stamps nothing).
PART **acj**: on a CLEAN chunk document (UNMEASURABLE otherwise), one real stamp click; ACJ.a asks
that the canvas rect is unchanged, ACJ.c that one real Ctrl+Z brings the tile back, the flag to false
and the badge to not visible.

| run | harness blob | src | parts | totals | start, end (UTC) |
|---|---|---|---|---|---|
| b-repro1 | `86221109` (uncommitted) | HEAD `38e25941` | acj | 2/3: **FAIL ACJ.a**, dy 42.00, bar 46 to 88 | 09:03:18Z, 09:03:37Z |
| b-green1 | `2ad3680a` | HEAD `ecaf2e28` | acj,abl | 6/7: abl 5/5 with no warm-up; ACJ.0 UNMEASURABLE (abl left the document dirty: (c) not yet fixed) | 09:04:50Z, 09:05:16Z |
| b-green2 | `2ad3680a` | HEAD | acj | 3/3 PASS, dy 0.00, bar 88 to 88 | 09:05:26Z, 09:05:46Z |
| **b-red-acj** | `2ad3680a` | art-facet.tsx at `ecaf2e28^` | acj | 2/3: **FAIL ACJ.a**, dy 42.00 | 09:05:54Z, 09:06:12Z |
| **b-red-abl** | `2ad3680a` | the same | abl | 1/2: **FAIL ABL.0**, canvas 144 to 186 under the press | 09:06:13Z, 09:06:34Z |
| dev-atl1 | | HEAD `b1e422fe`, stale dist | atl,acj | refused by the build guard, no rows | 09:14:10Z |
| dev-atl2 | `3db726dc` | HEAD | atl,acj | 4/5: ATL.0 UNMEASURABLE (brush word 0); ACJ 3/3 | 09:14:21Z, 09:14:45Z |
| dev-atl3 | `7cb7fce8` | HEAD | atl,acj | 4/5: FAIL ATL.0, 80 Tab hops did not reach the rail | 09:15:06Z, 09:15:39Z |
| dev-atl4 | `d632b011` | HEAD | atl | 1/2: FAIL ATL.0, the canvas moved on the tool switch (O1) | 09:15:55Z, 09:16:28Z |
| dev-atl5 | `435ee02a` | HEAD | atl | 6/6 PASS | 09:16:54Z, 09:17:28Z |
| **a-red-atl** | `0b6500df` (`c7eb0e0f`) | `38e25941`'s ComposerCanvas hunks reverse-applied | atl | 5/6: **FAIL ATL.a** | 09:17:53Z, 09:18:31Z |
| **c-red-acj** | `0b6500df` | `b1e422fe`'s two source files reverse-applied | acj | 3/4: **FAIL ACJ.c** | 09:18:40Z, 09:19:00Z |
| **final1** | `0b6500df` | HEAD | all | **38/38 PASS, 0 FAIL, 0 UNMEASURABLE** | 09:19:10Z, 09:20:49Z |
| **final2** | `0b6500df` | HEAD | all | **38/38 PASS, 0 FAIL, 0 UNMEASURABLE** | 09:20:57Z, 09:22:41Z |
| **final-abl-alone** | `0b6500df` | HEAD | abl | **6/6 PASS** | 09:22:41Z, 09:23:05Z |
| **final-atl-alone** | `0b6500df` | HEAD | atl | **6/6 PASS** | 09:23:09Z, 09:23:45Z |
| **final-acj-alone** | `0b6500df` | HEAD | acj | **4/4 PASS** | 09:23:45Z, 09:24:05Z |
| **b-red2-acj** | `0b6500df` | `ecaf2e28`'s art-facet hunk reverse-applied | acj | 3/4: **FAIL ACJ.a**, dy 42.00; ACJ.c PASS | 09:26:46Z, 09:27:05Z |
| **b-red2-abl** | `0b6500df` | the same | abl | 1/2: **FAIL ABL.0**, canvas 144 to 186 | 09:27:05Z, 09:27:28Z |

Logs: `docs/captures/2026-09-25-art-stroke-followups/logs/`, one file per run named as above. Every
red run printed `src on disk: DIFFERS FROM HEAD (a mutation?)`; every restore was a `git checkout`
of the file from a commit, then `git status --porcelain --untracked-files=no` empty, then a fresh
debug build. The box was loaded by other work (1-min load 11 to 39) and no row timed out. Every part
of every final printed "no mouse event reached the page at a position this harness did not send".
The b-red2 pair re-establishes (b)'s red under the final harness blob (D7).

**The reds, quoted.** a-red-atl ATL.a: "tiles 1..4
[{"t":0,"hf":false,"vf":false},{"t":0,"hf":false,"vf":false},{"t":0,"hf":false,"vf":true},{"t":null,"hf":false,"vf":false}],
the stamp writes {"t":0,"hf":false,"vf":false}; collision A [0,0,12290,12290,0] (before [0,0,0,0,0])":
tiles 3 and 4 kept their own cells and the collision brush painted under them. c-red-acj ACJ.c:
"dirty after the write true, after Ctrl+Z true; badge after the write {"present":true,"visible":true},
after Ctrl+Z {"present":true,"visible":true}" with the tile back at its start.

`node scratchpad/check-harness-guards.mjs` at `c7eb0e0f`: "293 clean / 294 classified ... 0
failure(s) · 1 unguarded-untracked · 0 unmeasurable" (the same G9 probe as row 207's O7).

## 5. Suite

| tree | `npm test` | Test Files | Tests | start, end (UTC) |
|---|---|---|---|---|
| `e41e372e` (all fixes, rows, harness, logs) | **exit 1** | 1 failed \| 658 passed \| 3 skipped (662) | 1 failed \| 10351 passed \| 9 skipped (10361) | 09:24:17Z, 09:25:50Z |

Foreground, `VITEST_MAX_WORKERS=4`, the exit code read directly. The one failure:
`test/formats/aeon-fixture-currency.test.ts` "regions/act-constants/act_descriptor.emp matches
games/sonic4/data/levels/ojz/act1/act_descriptor.emp at aeon origin/master", message "NOT AN AURORA
REGRESSION: a vendored aeon fixture is stale. pinned at aeon 4518b7f5 ... aeon origin/master is now
40c891f5 ...": aeon added a clip-act region table (S2-COMPRESSED-ACT row 7, 2026-09-25) to that file.
This branch changes nothing under `test/` (`git diff --stat c0065e4f..HEAD -- test/` is empty), so
master fails the same row today. Not re-vendored here (O6). Every other gate printed OK:
`check-test-collection`, `check-doc-citations`, the four dash checks, `skip-report`, and
`failure-class` named the one ASSERTION above and nothing else. The run with this packet and the
ROADMAP edit committed is reported in the landing message.

## 6. Deviations from the brief, and the calls I made

- **D1. (a) is fixed in `ComposerCanvas`, not in `PixelViewport`.** Latching the hook inside the
  viewport would also have worked, but the viewport is shared with classic's `TileTab` and the node
  rows drive the hook off the viewport's props; a composer-side fix keeps the rows' model of the
  routing true and touches no other surface.
- **D2. Row 207's O3 row was rewritten.** It asserted that a tile-stamp stroke switched to collision
  paints collision cells with the word of ITS press, which is exactly the unlatched tool the ruling
  removes. It now asserts that such a stroke paints no collision word at all and stamps to its end;
  the stale-latch property it guarded still holds (nothing from the earlier stroke is painted).
- **D3. (b) reserves the badge's box**, the brief's own first suggestion. The consequence is that a
  clean document now shows the dirty layout (O2).
- **D4. (c) compares contents with a saved state** rather than marking a stack revision:
  `EditHistory` has no save point, and adding one would have been the undo-store change the brief
  said to stop at.
- **D5. The live (c) row lives in PART acj (ACJ.c)**, beside the first write it undoes, rather than
  in a part of its own.
- **D6. The discard prompt is proven by node and by source, not driven live.** Its decision function
  is asserted both ways in node; live, the all-part finals show the undone documents reading clean.
- **D7. The proof method changed after (b)'s first red** (ACJ.c was added to PART acj, PART atl
  added), so (b)'s red was re-run under the final blob (b-red2-acj, b-red2-abl).
- **D8. `node_modules`** was made with `cp -al` from the main checkout, as briefed; the run helper was
  a scratchpad shell script, not committed.

## 7. Where the tree disagreed with the brief

- (a): the brief asks "does the pointer object swap, does the stroke end?". It swapped and did not
  end for a tile-space switch; for a switch to a pixel tool the hook was dropped and the release was
  lost (section 1).
- (b): the growing element is the tool-options bar (`OptionBar`), not a status bar, and the bar
  was already wrapping on a clean document (46px, not 32px).
- (c): dirty is a flag, and the pure doc-local document already restored it on undo; only the chunk
  document (the write-through kind) had the bug.
- `npm test` is not green on this tree or on master today, for the peer fixture reason in section 5.

## 8. Observations for the overseer, not acted on

- **O1. Switching the tool moves the composer canvas.** The options bar is tool-dependent: dev-atl5
  measured it 88px under the Tile stamp and 37px under Collision paint at 1400x872, and the canvas
  moved from `y 186` to `y 135`. With the tool now latched, a stroke whose tool is switched mid-drag
  keeps painting while the canvas slides 51px (0.8 of a tile at zoom 8) under the pointer. Same class
  as (b), outside its scope. Measured.
- **O2. The clean doc header now takes the dirty layout.** At 1400x872 the bar is 88px on a clean
  chunk document (it was 46px), so the canvas starts 42px lower than before. The header wraps at all
  because the shared-tile warning is long; that is a layout question for a look.
- **O3. The shared-tile warning can appear on a first write too.** `hasSharedTiles` turns true when a
  chunk document's first cell gets an atlas tile, which would change the header's width the same way
  on a chunk that started empty. Read, not measured.
- **O4. A chunk document now reads dirty when its library chunk changes under it from elsewhere** (an
  undo, from another facet, of a zone-art step made before the document was opened), because its
  contents then differ from what was opened. The conservative side: the prompt asks. Read, not
  measured.
- **O5. Undo past a Save reads dirty**, because Save re-opens the document and the saved state is
  taken there. Read from the code path, not measured.
- **O6. The aeon fixture currency row is red on master today** (section 5). Re-vendoring
  `test/fixtures/regions/act-constants/act_descriptor.emp` and its provenance, and re-checking the
  codec rows that read it, is its own small parcel.
- **O7. The keyboard route from `<body>` to the Art tool rail is 181 Tab stops.** Measured by PART
  atl; an accessibility note, nothing here depends on it.
- **O8. A pixel-tool stroke (pencil, line, ...) with its tool switched mid-drag** runs through
  `PixelEditController`, whose config is reset from the store on every render. Not examined; the
  ruling's wording covers it.
- **O9. `check-harness-guards` still reports the one G9 probe** (`preset-schema-key-probe.mjs`), as
  row 207 did. Not in this diff.

## 9. TAGGED for the foreground

- **O2 is a look.** Is the taller clean header acceptable, or should the header stop wrapping (a
  shorter warning, or the warning moved)? The fix keeps the canvas still either way.
- **O1 is the next bug-tier row** if the owner wants the canvas still across tool switches too.
- A real scale factor other than 1, and the owner's window size: every run read dpr 1 at 1400x872.
- (a) live drives the rail by Tab and Space; a rail click with a second pointer (a pen and a mouse)
  was not driven.
- Nothing here needs the emulator. None was started, attached to or read.

## 10. Commits

`38e25941` the composer latches the tool at the press, with four node rows and the O3 row rewritten ·
`c2e4f8ac` PART acj, and PART abl without its warm-up · `ecaf2e28` the "unsaved" badge reserves its
box · `b1e422fe` a chunk document undone back to its saved state reads clean, with three node rows ·
`c7eb0e0f` PART atl and ACJ.c · `e41e372e` the run logs · this packet and `docs/ROADMAP.md` row 209
replaced in place by its DELIVERED row.
