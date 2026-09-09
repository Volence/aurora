# A chunk document's every gesture now records one step on the stack it belongs to

Branch `parcel/chunk-undo-routing`, base `bbff194b`.
Implements owner ruling **d-37 `route_onto_zone_stack`** (`docs/decisions.jsonl`), which
closes the defect measured in `docs/reviews/2026-09-09-chunk-undo-measure.md` and
`docs/reviews/2026-09-09-chunk-undo-redo.md`. Nothing here was a design decision of mine;
§2 says exactly what the ruled shape forced and §7 says what it cost.

Both harnesses are green and both were shown to go red again on a reverted tree:

| | before the fix | after | reverted, rebuilt |
|---|---|---|---|
| `npm run harness:chunk-undo-measure` | 31 pass / 2 fail / 5 note (38 rows), **exit 1** | **39 / 0 / 5 (44 rows), exit 0** | 26 / 13 / 5, **exit 1** |
| `npm run harness:chunk-undo-redo` | 44 / 2 / 8 (54 rows), **exit 1** | **46 / 0 / 8 (54 rows), exit 0** | 36 / 10 / 8, **exit 1** |

**⚠ Read §7 before anything else if you use the tool.** What Save means on a chunk
document changed, and so did what Discard means.

---

## 1. The defect, in one paragraph

A chunk document was **half live-editing and half buffered**. A pencil stroke on an
**atlas-backed** cell was a `set-tileset-tiles` command on the zone-art stack (census path
P3a). Its **empty** cells, every `allowCow` gesture (paste, cut, selection move, the seven
transforms) and every `applyTileCell` write (tile stamp, collision paint, palette-apply)
wrote only into `artStore.open.doc` and recorded **nothing** — while `focusedDocId()`
resolved the art facet to `zoneart:<zone>` regardless. `Ctrl+Z` therefore reached the
zone-art stack and reverted an **earlier edit made on another document**, one per press,
while the author's own gesture survived untouched. Because the chunk's atlas-backed cells
reference the reverted tile, the canvas repainted, so it looked like the undo had worked.
Redo restored the eaten edit exactly — until the author's next real command truncated the
redo side, after which it was gone.

---

## 2. What routes where now

| Gesture, on a chunk document | Before | After |
|---|---|---|
| pencil on an **atlas-backed** cell (P3a) | `set-tileset-tiles`, zone-art stack | unchanged, and now **batched with the rest of the same gesture** |
| pencil on an **empty** cell (P3b) | nothing | `set-tileset-tiles` (the painted tile, appended) **+** `set-chunk`, one batch, zone-art stack |
| paste / cut / selection move / the seven transforms (`allowCow`) | nothing | same batch shape, zone-art stack |
| tile stamp | nothing | `set-chunk`, zone-art stack, **one step per drag** |
| collision paint | nothing | `set-chunk` (it carries both planes), zone-art stack |
| palette-apply | nothing | `set-chunk`, zone-art stack |
| the map clipboard's collision paste | nothing | `set-chunk`, zone-art stack |

**One document, one stack.** `set-chunk` is already in
`editorStore.ZONE_SCOPED_COMMAND_TYPES`, so every one of those routes to the **same**
`zoneart:<zone>` document P3a routes to. No second stack is minted anywhere, which is the
whole point: this codebase already closed a live defect by refusing one, in the comment
that created the `bgOverride` branch of `focusedDocId()` — *"Without this, one document had
two undo stacks interleaved by facet (live-app finding F1)"*.

### 2.1 What changed

| File | What |
|---|---|
| `src/renderer/state/chunk-doc-commit.ts` **(new)** | `isChunkDocument`, `commitChunkDocStep`, `syncChunkDocFromLibrary` — 238 lines, most of them the reasoning |
| `src/renderer/components/art/ComposerCanvas.tsx` | four call sites and one effect (§2.2) |

Nothing else. `focusedDocId()` is **untouched**: it was already right about a chunk
document, and the defect was entirely in what got *routed* onto the stack it names.

### 2.2 The four call sites and the effect

- **`commitWrites`, chunk branch.** The doc-local writes are applied first, then
  `commitChunkDocStep(desc, cmds)` folds the atlas edits **and** the chunk's new contents
  into **one** batch. Before this, a stroke crossing an atlas-backed cell and an empty one
  left one undoable command and one unrecorded mutation; now it is one Ctrl+Z.
- **`commitWrites`' `allowCow` doc-local tail** — the tail paste, cut, selection move and
  all seven transforms share. `recordComposerEdit()` (the pure-doc-local snapshot stack)
  still sits in front of it and is still a no-op for a chunk document; the two mechanisms
  each state the other's half in their headers.
- **`endTileGesture`** — at pointer `up`, not per cell. `commitChunkDocStep` diffs the
  whole document against the library chunk, so a twelve-cell drag is one step, which is the
  same "one gesture, one step" rule the snapshot bookkeeping beside it already stated.
- **The map clipboard's collision paste.**
- **`useEffect([historyVersion, open])` → `syncChunkDocFromLibrary`.** ⚠ **This is what
  makes undo visible**, and it is not optional. Undoing a `set-chunk` rewrites the *library
  chunk* — a project object the composer read once, at open time. Without the re-sync the
  canvas would keep showing the reverted stroke, **and the next gesture would diff against
  that stale document and fold the reverted stroke straight back in**: an undo that silently
  undoes itself.

### 2.3 Two decisions inside the ruled shape

**The painted tile is materialised into the zone tileset at gesture time.** This is forced,
not chosen: a chunk in the library is a nametable of atlas tiles and nothing else, so pixels
painted on an empty cell have **nowhere else to live**. It is the same `sliceForSave` Save
has always run, moved from Save-time to gesture-time, with the same flip-aware dedup — so
the tile count after N gestures is the count Save would have produced, not more. Undo
removes the appended tiles because they are in the same batch. §3 is the measurement, and
§4 is the four harness rows this forced.

**`commitChunkDocStep` always executes the atlas edits it was handed, even when the chunk
half cannot be built** — no project, the chunk gone from the library (reported with the same
sentence `composerSaveState` uses for Save), or a tileset that would pass 2048 tiles. In
those cases the doc-local write stays in the document unrecorded, exactly as before this
parcel, and the author is told why. Dropping the atlas edits there would turn a refusal to
*record* into a refusal to *edit*.

---

## 3. The measurement

### 3.1 Rig

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a1a26af882e2e6795
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a1a26af882e2e6795
```

`AURORA_BUILT_TREE` **and** `ELECTRON_BIN` both passed, `ELECTRON_BIN` pointing at this
worktree's own `node_modules/.bin/electron`. `VITE_AURORA_DEBUG=1 npx electron-vite build`
before every run and after every source change. `spawnGuarded` under `xvfb-run` (Ozone
pinned to x11, private profile — nothing attaches to the owner's compositor); a hardlinked
copy of aeon as the project, opened through the debug door; `killTree` in a `finally`. The
worktree's `node_modules` is a real hardlink copy (`cp -al`) of the parent's, not a symlink.

**devicePixelRatio 1 in every run below.** Composer rect `{x:308, y:135, w:1024, h:1024}`,
integral; `zoom = 8` recovered from the element; every aim an **integer client pixel** whose
doc pixel is derived through PixelViewport's own arithmetic and asserted to be in the cell
named. The redo harness's `armAndAim` re-derives every aim after arming a tool.

**No emulator was touched, and none was attempted.**

### 3.2 GREEN — `harness:chunk-undo-measure`, 39 pass / 0 fail / 5 note (44 rows), exit 0

```
  chunk under test: OJZ_00 (OJZ $00), aim cell (1,0) EMPTY, integer client (404,167), dpr=1
  zone-art witness  start=628154474  edit1=218895101  edit2=3069218194
  CONTROL   (empty stack)  pencil: zone 628154474 -> 1260435675 -> 628154474   collision: zone 628154474 -> 628154474 -> 628154474
  TREATMENT (2 on stack)   pencil: zone 3069218194 -> 2936393219 -> 3069218194   collision: zone 3069218194 -> 3069218194
  doc-local witness  control pencil 0->1->0, treatment pencil 0->1->0; collision control 0->12289->0, treatment 0->12289->0
  focusedDocId()  control=zoneart:ojz  treatment=zoneart:ojz
```

Read the treatment row against the ladder. Before the fix it was
`3069218194 -> 3069218194 -> 218895101`: the stroke moved nothing and the Ctrl+Z took back
**edit2**. Now it is `3069218194 -> 2936393219 -> 3069218194`: the stroke moves the witness
to a value that is **no rung of the ladder** (its own new tile) and the Ctrl+Z puts it back
exactly. **T2 and T5 — the finding rows — pass with their assertions unchanged.**

**The one-field control is intact and now pays off in the other direction.** Rows C and T
are still the same chunk document, opened from the same library cell, the same gestures at
the same integer client pixel, in the same session, differing only in whether row Z ran.
After the fix they behave **identically** (`0->1->0` in both). Before it, the same two
gestures destroyed two zone-art edits in T and read as inert in C.

Selected rows, verbatim:

```
PASS  [C3] the stroke on the EMPTY cell MATERIALISES its tile into the zone tileset
        zoneArtHash 628154474 -> 1260435675; zoneTileCount 919 -> 920
PASS  [C3b] and the cell that was EMPTY now references that appended tile
        cell (1,0) after the stroke: {"atlasTile":919,"localId":null,"pal":2,...}
PASS  [C6] the doc-local stroke ENABLES the Undo control on a stack C1 found empty
        chip disabled true -> false, canUndo() false -> true, focusedDocId()=zoneart:ojz
PASS  [C8] the collision paint and its Ctrl+Z change NO zone art — `set-chunk` carries
           both collision planes and touches no tile
        zoneArtHash 628154474 -> 628154474 (paint) -> 628154474 (Ctrl+Z)
PASS  [T2] THE FINDING: Ctrl+Z after a DOC-LOCAL pencil stroke leaves the earlier
           ZONE-ART edits alone                       zone art unchanged at 3069218194
PASS  [T3] the doc-local stroke IS what that Ctrl+Z takes back
        doc pixel 0 -> 1 (stroke) -> 0 (Ctrl+Z)
PASS  [F4] THE ROW: Ctrl+Z takes back the TRANSFORM
        first row restored: true; zoneArtHash 3522785170 -> 3069218194
```

### 3.3 GREEN — `harness:chunk-undo-redo`, 46 pass / 0 fail / 8 note (54 rows), exit 0

```
  zone-art ladder  start=628154474  e1=218895101  e2=3069218194  e3=3765034709
                   + the author's own gesture=395238756
  CELL 1  Ctrl+Z then Ctrl+Y: zone 395238756 -> 3765034709 -> 395238756 —
          THE AUTHOR'S OWN STEP, out and back; the ladder untouched
  CELL 2  Redo chip disabled=false, canRedo()=true at that instant
  CELL 3  doc-local stroke across the presses: 1 -> 0 -> 1
  CELL 4  four Ctrl+Z 3765034709 -> 3069218194 -> 218895101 -> 628154474 ;
          four Ctrl+Y 218895101 -> 3069218194 -> 3765034709 -> 395238756
```

The ladder **gained a rung** — the author's own gesture sits on top of the three zone-art
edits — and both sides walk all four, in order, on both bindings, with the chips honest at
both ends. `S3` (tile stamp) passes with its assertion unchanged.

### 3.4 RED on revert, and it is a different red on each harness

The mutation, on disk: `git checkout bbff194b -- src/renderer/components/art/ComposerCanvas.tsx`
and `rm src/renderer/state/chunk-doc-commit.ts`. `git diff --stat HEAD -- src/` at that
moment:

```
 src/renderer/components/art/ComposerCanvas.tsx |  75 ++------
 src/renderer/state/chunk-doc-commit.ts         | 238 -------------------------
 2 files changed, 11 insertions(+), 302 deletions(-)
```

then `VITE_AURORA_DEBUG=1 npx electron-vite build` (exit 0) and the two harness commands.

**`harness:chunk-undo-measure` — 26 pass / 13 fail / 5 note, exit 1.** The finding rows go
red again with the identical baseline numbers:

```
  TREATMENT (2 on stack)  pencil: zone 3069218194 -> 3069218194 -> 218895101
                          collision: zone 218895101 -> 628154474
  doc-local witness       treatment pencil 0->1->1, collision 0->12289->12289
FAIL [T2] THE FINDING: Ctrl+Z after a DOC-LOCAL pencil stroke leaves the earlier ZONE-ART edits alone
FAIL [T5] THE FINDING, second gesture
FAIL [F3] the transform ENABLES Undo, so it recorded a step   chip disabled=true, canUndo()=false
FAIL [F4] Ctrl+Z takes back the TRANSFORM                      first row restored: false
```

**`harness:chunk-undo-redo` — 36 pass / 10 fail / 8 note, exit 1**, with **`S3` and `X3`,
the two finding rows, both red.** They only reach a verdict at all because of a change made
for this proof: `R1v`'s fatal check used to stop the file the moment the misfire failed to
reproduce, and inverting it naively would have stopped the file the moment it *did* — leaving
S3 and X3 **unrun**, and an unrun row cannot be shown to discriminate. A returning misfire is
now reported loudly and the run continues; only "the press did neither" is fatal, because
that means the instrument is broken rather than the app.

**Every control held on both red runs**: C1/C2/C4/C7/C8, T0a–T0d, T1, T2a, T4, T5a, T5b,
F0, F1 ("the transform LANDS" — it does, it just records nothing), R0, R2a, R2b, R6, R9, X2
and every aim row.

Restored with `git checkout HEAD -- src/` from the committed baseline `bc2b3489`, rebuilt,
and both harnesses re-run to exit 0 — the numbers in §3.2 and §3.3 are from those
post-restore runs, not from before the revert.

⚠ **One red row discriminates less than it looks.** `F2` ("the transform leaves the witness
off every rung") fails on the red side because by the time row F runs the T-row misfires
have already walked the witness down onto `ZONE_START`. That is a consequence of the defect
rather than a statement about the transform. `F3` and `F4` are row F's real discriminators
and both are clean.

---

## 4. The harness rows that changed, and why each had to

**No assertion in `T2`, `T5` or `S3` changed.** Those are the finding rows and they are the
acceptance test. What changed is rows that asserted the **old** behaviour, and each is
annotated at its call site with its reason. Every one is a **stronger** claim than the one
it replaces, not a weaker one.

| Rows | Said | Now say | Why it had to change |
|---|---|---|---|
| `C3`, `T2b`, `R0b`, `X0` | the stroke "moved no zone art" | it moves the witness to a value that is **no rung of the ladder** (`C3` also reads `zoneTileCount` and the cell) | painting an empty cell has to materialise the painted tile; a chunk in the library is a nametable of atlas tiles and the pixels have nowhere else to live (§2.3) |
| `C5`, `C9`, `T3`, `T6`, `S3b` | the author's gesture is **not** taken back by their own Ctrl+Z | it **is** | that was the defect stated from the other side |
| `C6` | the Undo control stayed **disabled** through a doc-local gesture on an empty stack | the gesture **enables** it | "recorded nothing" is the defect; C1 is what makes "the stack was empty" a measurement |
| `C8` | Ctrl+Z after the collision paint changes no zone art | *and neither does the paint* — both halves asserted | strictly more |
| `R1`, `R1v` | staged the misfire's victim, fatal if absent | the press took the author's own gesture and left `e3` intact; fatal only if the misfire **returns** or the press did neither | §3.4 |
| `R3`, `R4` | Redo rescued the eaten edit / left the author's stroke alone | Redo re-applies the author's own step, and the two presses walk their stroke out and back | there is no eaten edit to rescue |
| `R5`, `R7`, `R8`, `R10` | three presses each way | **four** | the author's gesture is a real rung now; every rung the old rows asserted is still asserted, in the same order |
| `S4` | the tileset hash is back where it started after Ctrl+Y | Redo puts the **cell** back, and the zone art is still where `S2` left it | the old row became **vacuous**: a stamp never moves the tileset (`S2`), so its assertion held whether or not Redo did anything |
| `X1`, `X3` | staged the victim / asked whether it survived truncation | the Ctrl+Z put the zone art back exactly where the stroke found it, and the truncation — which still happens and is still measured — now discards only the author's own undone gesture | the truncation is a loss only while somebody else's edit is on the redo side |

Both harnesses' headers and epilogues were rewritten: they said "exits 1 by design" and now
say a non-zero exit is a **regression**, naming which row fired.

---

## 5. What row F adds, and what stays derived

**Three gestures were measured before this parcel** (pencil P3b, collision paint, tile
stamp), and they cover two of the **three** doc-local writers. The third —
`commitWrites`' `allowCow` tail, which **paste, cut, selection move and all seven
transforms** share — had no row at all. **Row F drives it**, as a real gesture: one click on
the options bar's own `Flip horizontal` button, through the app's `pendingAction` handler.

Its witness is the document's whole **first row of cells**, not one pixel and not a canvas
hash — a horizontal flip moves art *across* cells, so a single sampled pixel can return to
its value by coincidence, and the canvas is the trap both earlier packets hit.

```
[F] first row of cells changed: true
[F] zoneArtHash 3069218194 -> 3522785170        off every ladder rung; tiles appended
[F] Undo chip disabled=false, canUndo()=true
[F] Ctrl+Z -> first row restored: true   zoneArtHash 3522785170 -> 3069218194
```

**Now measured (4):** pencil on an empty cell, collision paint, tile stamp, one transform.
**Still derived, and named rather than implied:**

- **The other six transforms, paste, cut and selection move.** All reach the tail row F
  drives, through the identical `commitWrites(writes, true)` call — but no row drives one.
- **Palette-apply.** The third mode of `applyTileCell`; the other two are driven, and the
  routing decision is in `endTileGesture`, which is mode-independent — but that is a reading.
- **The map clipboard's collision paste on a chunk document.** It needs a chunk copied off
  the map first, which is a flow no row here sets up.
- **Everything about non-chunk documents.** Untouched; `harness:art-undo-path` covers the
  pure doc-local ones and this parcel changes nothing they can see.
- **No vitest was added.** The two live harnesses are the specification and the red/green
  proof; a node-suite row for `commitChunkDocStep` would guard the routing in CI, where the
  harnesses do not run, and is the obvious follow-up.

---

## 6. Two things the measurement showed that the source reading did not

**The write-through dedupes, so repeated art does not bloat the tileset.** Row X paints the
same single pixel at the same offset in a *different* cell from row R's stroke.
`sliceForSave` deduped it flip-aware against the tile row R had already appended, so the
cell just referenced it and **not one tileset byte moved**: `zoneArtHash 395238756 ->
395238756`. A row demanding a move there would have failed on correct, tile-saving
behaviour, and `X0` now tolerates and reports both outcomes.

**The reads have to be taken before the press.** The first version of `C3`/`C3b` sampled
`artDocCellAt` and `zoneTileCount` inside the check block — after `Ctrl+Z` — and reported
`zoneTileCount 919 -> 919` with an empty cell, which reads exactly like "the stroke changed
nothing". It was reading what the **undo** did. Both reads moved above the press, and the
row now carries a comment saying so.

---

## 7. ⚠ What Save now means on a chunk document, and what Discard now means

**A chunk document is no longer a scratch buffer.** This is the cost the owner accepted in
d-37, and a reader who uses the tool needs it stated plainly:

- **Your edits reach the chunk library as you make them.** Painting a cell, stamping a tile,
  painting collision or running a transform on a chunk document changes the project's chunk
  **immediately**, as a recorded, undoable step. It no longer waits for Save.
- **Save on a chunk document is now "publish this chunk into the act", not "commit my
  strokes".** `saveComposerDocument` is unchanged and still does three things; only the
  first has become a formality. (1) The `set-chunk` it issues is now usually a no-op,
  because the chunk already holds what the document holds. (2) It **propagates** the chunk's
  contents into every placement in the current act that still links it (owner ruling d-18c),
  which nothing else does — **that is the part Save is still for**. (3) It reports the copies
  in *other* acts it did not reach, and re-opens the document clean.
- **Discard no longer discards.** The unsaved-work perimeter still asks (the document's
  dirty flag is set exactly as before), but "Discard & close" now throws away only the
  document, not the edits — those are in the library, and the way back is `Ctrl+Z`, one
  press per gesture. **Undo is now the way to abandon work on a chunk, not Discard.**
- **The zone tileset grows as you paint.** A stroke on an empty cell claims a tile in the
  shared zone tileset there and then. It is the same tile Save would have appended, and the
  dedup means repainting or overpainting a cell does not claim another — but the tileset
  panel now changes while you draw. Undo gives the tile back.

Nothing above applies to any other document kind. **New Tile / New Block / New Chunk** and
the map's two capture openers are `isPureDocLocal`, still own the per-document stack
`docs/reviews/2026-09-09-art-undo-fix.md` gave them, and are untouched here.

---

## 8. ⚠ What was NOT done, deliberately

**The `tell_the_author` interim from d-37 is not implemented.** The owner did not answer
that half, and it was explicitly out of scope for this parcel. It is also now **moot as
written** — there is no silent loss left to announce — so if he still wants a message it is
a different message, about a different thing, and it is his call.

**`focusedDocId()` was not touched**, and `composerSaveState` / `art-composer-save.ts` were
not touched. Both were already correct; §7's change of meaning is a consequence of what now
happens *before* Save, not of any edit to Save.

---

## 9. `npm test`, both ends, aggregate

| | Test Files | Tests | exit | `failure-class` verdict |
|---|---|---|---|---|
| **base** `bbff194b` (detached checkout, same worktree, same `node_modules`) | 4 failed \| 568 passed \| 3 skipped (575) | **77 failed \| 8452 passed \| 9 skipped (8538)** | **1** | ASSERTION 0, TIMEOUT 0, UNCLASSIFIED 77 |
| **tip** `bc2b3489` | 7 failed \| 565 passed \| 3 skipped (575) | **79 failed \| 8431 passed \| 28 skipped (8538)** | **1** | ASSERTION 0, **TIMEOUT 3**, UNCLASSIFIED 77 |

**Zero assertion failures at either end, and this parcel adds no test**, so the totals could
not move: 8538 rows both ends.

- **The 77 UNCLASSIFIED are the same four files at both ends** — `aether-badge-identity`,
  `classic-map-wheel`, `map-device-scale`, `map-viewport-mounted` — every row
  `TypeError: Cannot read properties of null (reading 'useCallback')`. That is the
  node-suite half of the second-React-instance defect in
  `docs/reviews/2026-09-09-save-contract.md` §7, still open; `resolve.dedupe` does not reach
  vitest.
- **The 3 TIMEOUTs at the tip are load, and were checked rather than assumed.** They are
  `art-discard-guard`, `prose-constant-fold` and `harness-guard-profile` — the same
  load-sensitive set `docs/reviews/2026-09-09-art-undo-fix.md` §4.5 recorded. Run together
  in isolation: **3 files, 70 tests, 0 failures, 5.19s**, and the repo's own reporter says
  `failure-class: no failures in this run`. The 19 extra "skipped" at the tip are the
  remaining rows of those three files, which is why the totals still add to 8538.
  `art-discard-guard` counts `openDocument` call sites and is exactly the file someone
  would suspect of being mine; it never reached an assertion.

---

## 10. Evidence

- `docs/captures/2026-09-09-chunk-undo-routing/measure-rows.json` and `redo-rows.json` —
  the green runs' own row records.
- `docs/captures/2026-09-09-chunk-undo-routing/T-treatment-after-pencil-ctrl-z.png` and
  `F-transform-after-ctrl-z.png`.
- The instruments themselves: `scratchpad/chunk-undo-measure-harness.mjs`,
  `scratchpad/chunk-undo-redo-harness.mjs`.
