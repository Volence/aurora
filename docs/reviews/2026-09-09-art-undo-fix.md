# A PURE doc-local art document now owns one undo stack. Four other things still do not.

Branch `parcel/art-undo-fix`, base `9fd11455`.
Implements **option 1 of `docs/reviews/2026-09-09-art-undo-path.md` §4**, ruled by the
overseer and approved by the owner. Nothing here was a design decision of mine; §4 lists
the two options that were refused and why.

**Do not carry this away as "undo works in the Art composer now."** That is the same
shape of headline as the one this parcel's predecessor had to reframe, and it would hide
the same thing. §5 is the bounded claim, and §6 is what is still one-way.

---

## 1. What was wrong, in one paragraph

`markOpenDirty` is a **save** signal and was never a history one. `ComposerCanvas`'
doc-local `commitWrites` tail mutates `open.doc` in place through `setPixels` and calls
it; `applyTileCell` (tile-stamp / collision / palette-apply) is a **second writer that
never reaches `commitWrites` at all** and does the same. Neither recorded anything. And
`focusedDocId()` resolved the art facet to the **zone-art** document unless
`open.bgOverride` was set, so for a document that is neither there was no stack a stroke
*could* have been recorded on — and Ctrl+Z was not inert, it was **aimed at another
document's stack**.

That is the whole of the defect for the five openers whose every write takes one of those
paths: **New Tile**, **New Block**, **New Chunk**, and the map's **"Edit 128×128 chunk
region"** and **marquee → Block** captures. For an unsaved document, "no undo until save"
means no undo for its entire life.

---

## 2. What changed

| File | What |
|---|---|
| `src/renderer/shell/tabs.ts` | `COMPOSER_DOC_PREFIX` / `composerDocId(serial)` / `isComposerDocId`, beside `zoneArtDocId` — which is also not a tab id, for the same reason |
| `src/core/editing/composer-history.ts` **(new)** | `ComposerSnapshot`, `ComposerDocHistory extends SnapshotHistory`, `COMPOSER_MAX_DEPTH = 40`. Eleven lines of substance; the engine is the shared one |
| `src/core/art/composer-buffer.ts` | `cloneComposerDoc`, `restoreComposerDoc`, `sameComposerCell` — beside `ComposerDoc` itself, so a field added to the interface is read here |
| `src/renderer/state/artStore.ts` | `composerDocId`, `isPureDocLocal`, `setOpenDirty`; the stack's whole lifetime is two lines in `openDocument`/`closeDocument` |
| `src/renderer/state/composer-history.ts` **(new)** | `readComposerSnapshot` / `writeComposerSnapshot` / `takeComposerSnapshot` / `recordComposerSnapshot` / `recordComposerEdit`, wired to `artStore` — the sprite store's trio, one document kind over |
| `src/renderer/state/history-factories.ts` | the `doc:composer:` factory |
| `src/renderer/state/editorStore.ts` | one branch in `focusedDocId()`, beside the `bgOverride` one |
| `src/renderer/components/art/ComposerCanvas.tsx` | three call sites (§2.2) |
| `src/core/editing/document-history.ts` | the doc-id vocabulary in its header gained a line |
| `src/renderer/shell/dirty-snapshot.ts` | a comment that named `markOpenDirty` as the sole writer of `open.dirty` now names both |

The machinery is the one that already existed. **Sprite and canvas documents each own one
stack keyed by document id** (`SpriteDocHistory`, `CanvasDocHistory`, both on
`SnapshotHistory`), and this is the third of exactly that shape — same constructor
signature, same read/write-closure binding, same "minted on open, dropped on close".

### 2.1 Two decisions inside the ruled shape, and why

**The dirty flag is IN the snapshot, not derived from a counter.** The save contract's R5
gave an *act* a monotone edit counter that `markUndone` walks back. That shape does not
transfer, because the composer's dirty flag is not monotone over document kinds: a New
Tile opens **clean** and a map capture opens **dirty** ("copied off the map and not yet in
the library"). So "undone back to the start state" means `false` for one document and
`true` for the other, and only the start state itself knows which. Carrying the boolean in
the snapshot makes the answer the document's own rather than a rule about documents, and
it costs one boolean per entry. **Row D2 of the harness and one vitest row exist purely to
hold the second direction**, because a fix that simply cleared dirty on every undo would
pass every other row here.

**The restore is in place, not an object swap.** `ComposerCanvas` keys its "the document
changed identity" effect on `open?.doc`, so installing the snapshot's `ComposerDoc` object
would drop the marquee and the stamp flips on every Ctrl+Z. `restoreComposerDoc` copies
the (cloned) contents into the live object instead. There is a row for it.

### 2.2 The three call sites, and one that is not in the ruling

- **P4**, the doc-local `commitWrites` tail — `recordComposerEdit()` before
  `adoptPaletteLineForEmptyCells`. `writes` is a pixel diff and non-empty by construction,
  so it needs no "did it land" check.
- **P5**, `applyTileCell` — snapshot at the gesture's `down`, banked by the first cell that
  actually changes, cleared at `up`. **One undo step per drag, not per cell**: this writer
  is driven straight off the host-pointer hook once per cell entered, so unlike a pixel
  gesture it has no natural batch, and a twelve-cell stamp would otherwise cost twelve
  Ctrl+Zs.
- **The map clipboard's collision paste** (`applyClipboardCollisionToDoc`,
  `ComposerCanvas.tsx` ~:756) — **this is neither P4 nor P5 and is covered anyway.** It is
  a third doc-local writer, and leaving it out would have been worse than merely leaving it
  un-undoable: an undo of an *earlier* step restores the whole document, so an unrecorded
  write in between is **silently reverted by somebody else's Ctrl+Z**. On a pure doc-local
  document these three are now the complete set of writers of `open.doc`, enumerated with
  `command grep` over `src/` for every mutator of a `ComposerDoc` (`setPixels`, `stampTile`,
  `paintDocCollision`, `applyPaletteLineToDocCell`, `applyClipboardCollisionToDoc`,
  `adoptPaletteLineForEmptyCells`, `seedDocCollisionFromSection` — the last only ever runs
  *before* `openDocument`).

### 2.3 One behaviour change that is not undo

A **tile-stamp that changes nothing no longer marks the document dirty**. It used to call
`markOpenDirty` + `bumpDoc` unconditionally, while `palette-apply` and `collision` already
returned early on an unchanged cell. It had to change: a write that dirties the document
without recording a step leaves a dirty flag no undo can walk back, which is the shape the
save contract's R5 near-miss was about. Detected by comparing the cell before and after
(`sameComposerCell`), because `stampTile` replaces the cell object unconditionally and so
cannot be asked afterwards.

---

## 3. Why chunk documents are excluded, and why that is not laziness

A chunk document **already splits**: a pencil stroke on an atlas-backed cell records a
`set-tileset-tiles` command on the **zone-art** stack (P3a), while its empty cells and
every paste / move / transform are doc-local (P3b / P4). Giving the doc-local half a stack
of its own would put **one document's gestures on two stacks**, so a single Ctrl+Z would
unwind them in an order that is neither the author's nor either stack's.

**This codebase has already ruled against exactly that, in writing**, in the comment that
created the `bgOverride` branch this parcel's branch now sits beside
(`editorStore.ts`): *"Without this, one document had two undo stacks interleaved by facet
(live-app finding F1)"*. Re-introducing the interleave here would undo a defect a previous
live finding closed. It is one lens row (§7), not a silence.

`isPureDocLocal` is the sole statement of the distinction, `composerDocId` is null whenever
it is false, and `focusedDocId`'s new branch keys on that id — so the branch **cannot**
fire for a chunk, live-tile or bgOverride document. Three vitest rows assert each of those
three still resolves where it did.

---

## 4. The proof, both ways

### 4.1 Rig

`npm run harness:art-undo-path`, in-tree build of this worktree:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a64e08b9527aaffad
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a64e08b9527aaffad
```

`VITE_AURORA_DEBUG=1 npx electron-vite build`; `spawnGuarded` under `xvfb-run` (so Ozone is
pinned to x11 and nothing attaches to the owner's compositor); a **hardlinked copy** of aeon
as the project, opened through the debug door — no native dialog anywhere; `killTree` in a
`finally`. `AURORA_BUILT_TREE` **and** `ELECTRON_BIN` both passed. **devicePixelRatio for
every run below: 1**, and every aim is an integer client pixel whose doc pixel is derived
through PixelViewport's own `floor((client − rect.left) / zoom)` with `zoom` recovered from
the element, and printed.

The worktree's `node_modules` is a **real hardlink copy** of the parent's
(`cp -al`), not a symlink — which is the environment note the previous packet's §6 left:
`scripts/check-cited-paths.mjs` cannot run against a symlinked `node_modules` and exits 2
`COULD NOT MEASURE`. With a hardlink copy the whole `npm test` chain runs.

### 4.2 GREEN, after the fix — **23 pass, 0 fail, 4 note (27 rows)**

```
  B LIVE-TILE     1523021819 -> 3126058246 -> 1523021819  UNDONE
  A DOC-LOCAL     1523021819 ->  524852502 -> 1523021819  UNDONE
  D MAP-CAPTURE   3069092495 ->  959760282 -> 3069092495  UNDONE

PASS [C2] a collision stroke LANDS on the doc plane   collisionA[0] 0 -> 12399
PASS [C3] Ctrl+Z takes back a TILE-SPACE (applyTileCell) write   back to 0
PASS [C5] the write marks the document dirty                     dirty true
PASS [C6] undoing back to the start CLEARS dirty (opened clean)   dirty false
PASS [D2] undoing a document that OPENED DIRTY leaves it dirty    dirty true
```

**The one-field control is intact and untouched.** Row B is the same `ComposerCanvas`, the
same `PixelViewport`, the same toolbar, the same integer client point `(702,457)` → doc
pixel `(1,1)`, in the same session seconds apart, differing from row A only in
`open.liveTileIndex`. Its numbers are byte-identical to the census run.

**No assertion in A2 or A3 changed.** What changed in the harness is the header's statement
of what to expect (it said "EXPECTED TO EXIT 1 TODAY, and that is the finding") and the
epilogue that named A2/A3 as expected red — that epilogue now names A2/A3/C3/D1 as a
**regression** list instead. Rows C and D were **added**.

### 4.3 RED, on revert — **17 pass, 6 fail (same 27 rows)**

The mutation, on disk: `git checkout 9fd11455 --` over the eight modified source files, and
the two new modules moved out of the tree. `git diff --stat HEAD -- src/` at that moment:

```
 src/core/art/composer-buffer.ts                |  68 --------------
 src/core/editing/composer-history.ts           |  59 -------------
 src/core/editing/document-history.ts           |   1 -
 src/renderer/components/art/ComposerCanvas.tsx |  64 +-------------
 src/renderer/shell/dirty-snapshot.ts           |   9 +-
 src/renderer/shell/tabs.ts                     |  22 -----
 src/renderer/state/artStore.ts                 |  84 +-----------------
 src/renderer/state/composer-history.ts         | 117 -------------------------
 src/renderer/state/editorStore.ts              |  20 -----
 src/renderer/state/history-factories.ts        |   9 --
 10 files changed, 9 insertions(+), 444 deletions(-)
```

then `VITE_AURORA_DEBUG=1 npx electron-vite build` (exit 0) and the same harness command:

```
FAIL [A2] Ctrl+Z takes back a stroke on a New Tile document
          hash after Ctrl+Z is 524852502, BYTE-IDENTICAL to after the paint
FAIL [A3] the Undo control offers itself                    chip disabled=true, canUndo()=false
FAIL [C3] Ctrl+Z takes back a TILE-SPACE write   collisionA[0] is 12399, want 0
FAIL [C4] the Undo control offers itself after a tile-space write
FAIL [C6] undoing back to the start CLEARS dirty            dirty after Ctrl+Z: true
FAIL [D1] Ctrl+Z takes back a stroke on a MAP-CAPTURE document
```

**Every control held**: B1/B2/B3, C2 (the stroke still lands), C5 (it still dirties), and
every precondition. Restored with `git checkout HEAD -- src/`, from the committed baseline
`c1826b29`.

⚠ **D2 passed on both sides and therefore discriminates nothing on its own.** With the fix
reverted the document simply stays dirty, which is trivially "dirty after Ctrl+Z". D2 is a
guard against a *different* wrong fix (one that clears dirty unconditionally), and it is
only meaningful in a run where D1 passes. Its real proof is the vitest mutation below,
where it fails.

⚠ **The discard arm of `closeDocDiscarding` is not decoration and was added for this
run.** With the fix reverted, row A leaves its document dirty, so the "New…" control raises
the unsaved-strokes dialog and rows C and D would have failed for the wrong reason. The red
run's log shows it firing twice (`the unsaved-strokes dialog was up; pressed "Discard &
close"`), and the green run shows `no dialog — the document was clean`. **An instrument that
only works on the green side cannot be used to show the red side.**

### 4.4 The node suite, three mutations

`src/renderer/state/__tests__/composer-doc-undo.test.ts`, 12 rows, green. Each mutation
applied on disk and restored from the commit:

| Mutation | Result |
|---|---|
| revert `focusedDocId`'s composer branch only (20 lines) | **5 failed / 7 passed** |
| `writeComposerSnapshot` always `setOpenDirty(false)` | **2 failed / 10 passed** — the two dirty-direction rows |
| `openDocument` does not drop the previous stack | **2 failed / 10 passed** — the two lifetime rows |

⚠ **Two rows were vacuous under the first mutation and were strengthened because of it**
(commit `0a8816af`): "leaves a document that OPENED dirty dirty when it is unwound" and
"restores the document in place" both passed while the undo had gone to the zone-art stack
and reverted nothing — an undo that does nothing also leaves the flag set and the object
identical. Each now asserts the pixel came back **first**. First mutation went 3 failed →
5 failed after that change. **A row about what an undo left behind has to say the undo
happened before it can say anything else.**

### 4.5 `npm test`, both ends, aggregate

| | Test Files | Tests | exit |
|---|---|---|---|
| **base** `9fd11455` (detached checkout, same worktree, same `node_modules`) | 4 failed \| 566 passed \| 3 skipped (573) | **77 failed \| 8435 passed \| 9 skipped (8521)** | **1** |
| **tip** `0a8816af` | 4 failed \| 567 passed \| 3 skipped (574) | **77 failed \| 8447 passed \| 9 skipped (8533)** | **1** |

Both figures are from the whole `npm test` chain — fourteen check scripts and a typecheck
before vitest — and every check script printed `OK` at the tip, including
`check-cited-paths` (which this parcel's predecessor could not run at all under a symlinked
`node_modules`) and `check-doc-citations` over this very packet.

⚠ **One tip run reported 6 failed files / 79 failed tests and both extras were 5-second
TIMEOUTS under load, not assertions**: `test/config/prose-constant-fold.test.ts` ("says on
its PASSING line that it is not full coverage") and
`src/renderer/components/art/__tests__/art-discard-guard.test.ts` ("every gesture that
replaces the document goes through the replace door"), each ~10s in that run. Run alone
they are **51 passed / 0 failed in 3.97s**, and a repeat of the whole chain returned to
4/77. Recorded because a reader comparing two of my own runs would otherwise find two
numbers and no explanation — and because `art-discard-guard` counts `openDocument` call
sites, so a timeout there is exactly the row someone would suspect of being mine. It is
not: it never reached an assertion.

**Exit 1 at both ends, and none of the 77 are mine.** The same four files fail at the base
commit — `aether-badge-identity`, `classic-map-wheel`, `map-device-scale`,
`map-viewport-mounted` — every row `TypeError: Cannot read properties of null (reading
'useCallback')`. That is the second-React-instance defect documented in
`docs/reviews/2026-09-09-save-contract.md` §7, whose renderer half was fixed by
`resolve.dedupe` and whose **node-suite half is still open**; `resolve.dedupe` does not
apply to vitest. +12 rows, all mine, all in the one new file.

---

## 5. What this covers — the bounded claim

A composer document is **pure doc-local** when `liveTileIndex === null`, `bgOverride` is
unset **and** `chunkId === null` — i.e. every write on it lands in `open.doc` and nowhere
else. Exactly five openers produce one:

| Opener | Source |
|---|---|
| New Tile (1×1) | `workspace/facets/art-facet.tsx` |
| New Block (2×2) | `workspace/facets/art-facet.tsx` |
| New Chunk (W×H, up to 64×64 tiles) | `workspace/facets/art-facet.tsx` |
| "Edit 128×128 chunk region" (right-click on the map) | `components/MapViewport.tsx` |
| marquee → Block capture | `components/MapViewport.tsx` |

On those documents, and **only** those, all three doc-local writers now record one undo
step per gesture, Ctrl+Z and the header chips reach them, and unwinding to the state the
document was opened in restores its dirty flag to what it was then.

Nothing about `P1` (live-tile), `P2` (bgOverride) or `P3a` (chunk doc, atlas cells)
changed; the three vitest rows that assert their routing is untouched are controls, not
coverage.

---

## 6. ⚠ What this does NOT cover

1. **A chunk document's doc-local half is still one-way.** `P3b` (a pencil stroke on an
   *empty* cell of a chunk document) and every `allowCow` gesture on one — **paste, cut,
   selection move, and all seven transforms** (`flip-h`, `flip-v`, `rotate-90`, the four
   `shift-*`) — record nothing, exactly as before. §3 is why. **Lens row
   `ART-UNDO-CHUNK-SPLIT`.**
2. **`applyTileCell` on a chunk document is still one-way** — tile-stamp, collision paint
   and palette-apply. Same row, same reason: recording them would be the second stack.
3. **The map clipboard's collision paste on a chunk document** — same.
4. **The "Ctrl+Z hits the zone-art stack instead" consequence is fixed for pure doc-local
   documents and still live for chunk documents' doc-local half.** On a chunk document
   `focusedDocId()` still resolves to zone art (correctly, since its pencil records there),
   so an undo after a doc-local-only gesture still takes back some *other* zone-art edit.
   The census called this out as derived-not-measured and **it is still not measured** — no
   row here drives a prior zone-art edit followed by a chunk-document paste and a Ctrl+Z.
5. **Redo on the composer stack is implemented and covered by one vitest row, and was not
   driven live.** The harness reads only the `Undo` chip's `disabled`, exactly as the
   census did.
6. **`COMPOSER_MAX_DEPTH = 40` is reasoned, not measured.** A 64×64-tile document's
   snapshot is 4096 cells plus up to 4096 local 64-byte tiles; no memory profile was taken.

---

## 7. Surprises

- **The default collision brush paints air.** `selectedCollisionProfile` defaults to `0`
  and `selectedCollisionWord` maps shape 0 to `AIR_CELL`, so the first version of row C
  measured `collisionA[0] 0 → 0` and read exactly like "the tile-space writer does
  nothing". It was the app being right: `paintDocCollision` correctly refuses an unchanged
  write. The row now arms a real shape off the collision palette (`#111 · solid · all`)
  and C2 is the anti-vacuous precondition that would catch it again.
- **The tool survives a document change**, so row C left `collision` armed and row D's
  "pencil stroke" was a collision paint that moved no pixel — presenting as "the stroke
  never landed" in the capture path, which would have been read as a defect there. Row D
  re-arms the pencil and **asserts** `tool === 'pencil'` in its precondition.
- **The launcher's button says `Block 16×16 px (2×2 tiles)`, not "New Block"** — the string
  `New Block (16×16)` is the name the handler gives the *document*. Typing the document's
  name found no button.
- **The census's label for the map opener was `"Edit block…"`; the app says
  `Edit 128×128 chunk region`.** Corrected here rather than propagated.
- **`useAeonHistoryVersion()` cannot see a composer stack**, by design — it is scoped to the
  zone-art and level documents. So `writeComposerSnapshot` has to call `bumpDoc()` itself or
  an undo moves the document and leaves the picture on screen untouched. The global
  `useHistoryVersion()` that the Undo chip uses *does* see it, which is why the chip was
  right while the canvas would have been stale.

**No emulator was touched, and none was attempted.**
