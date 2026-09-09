# Redo DOES bring the eaten edit back — until the author's next real edit

Branch `parcel/chunk-undo-redo`, base `e3109bd0`.
Instrument: `scratchpad/chunk-undo-redo-harness.mjs` (committed, registered as
`npm run harness:chunk-undo-redo`). **It exits 1 by design**; §6 says which rows and why.
Evidence: `docs/captures/2026-09-09-chunk-undo-redo/` — the run's own `rows.json` and two
screenshots, tracked so a reader can open them.

`docs/reviews/2026-09-09-chunk-undo-measure.md` §5 left exactly one thing derived:

> **Redo.** Only the `Undo` chip's `disabled` was read. Whether the destroyed zone-art
> edit can be recovered with Ctrl+Shift+Z was **not measured**, and it matters to how bad
> this is: a recoverable loss and an unrecoverable one are different rows.

**It is recoverable.** Pressed straight after the misfire, Redo restores the destroyed
zone-art edit exactly, on both bindings, to full stack depth, and without touching the
author's own doc-local work. That is a result that **lowers** the severity of the measured
defect, and it is stated here without hedging.

**And it stops being recoverable the moment the author makes one more real edit.** The
redo side truncates the way any undo stack's does, so the rescue exists only in the window
between the misfire and the author's next zone-art command. That is measured too (§4), and
it is the finding that keeps this above "cosmetic".

---

## 1. The four cells

Sampled with `zoneArtHash()` — FNV over the open zone's whole tileset, read from the
**tileset bytes** and not from any canvas, so it can be taken while the composer is showing
some other document. **A canvas hash cannot answer this question**, and §5 says why.

| | Answer | Rows |
|---|---|---|
| **1. Does Redo restore the eaten zone-art edit?** | **YES, exactly.** `3069218194 → 3765034709` — back to the value it held before the misfire, bit for bit. `Ctrl+Shift+Z` does the same thing as `Ctrl+Y`. | `R3`, `R10` |
| **2. Is the Redo control ENABLED at that moment?** | **YES.** Redo chip `disabled=false`, `focusedHistory().canRedo` `true`. The author is offered the control that would in fact rescue them. | `R2a`, `R2b` |
| **3. Does Redo instead do something to the author's doc-local work?** | **NO.** The doc pixel at (12,4) reads `1` after the stroke, `1` after the Ctrl+Z and `1` after the Ctrl+Y. Redo never touches it. | `R4` |
| **4. What happens on a SECOND press?** | **It keeps working, one rung per press, in both directions.** Three `Ctrl+Z` walk the zone art down all three rungs; three `Ctrl+Y` walk it back up all three. The chips are honest at both ends. | `R5`–`R9` |

The ladder those numbers are read against, staged on a **different** document (a live-tile
document opened from the Tileset panel), three `set-tileset-tiles` commands and so three
stack entries:

```
zone-art witness:  start 628154474  ->  e1 218895101  ->  e2 3069218194  ->  e3 3765034709
```

and the presses, verbatim from the run:

```
pencil (doc-local)  zone 3765034709        the stroke is P3b: it moves no zone art
Ctrl+Z  #1          zone 3069218194        THE MISFIRE — e3, made on another document, is gone
                    Redo chip disabled=false, canRedo()=true
Ctrl+Y  #1          zone 3765034709        RESTORED
Ctrl+Z  #2,#3,#4    3069218194 -> 218895101 -> 628154474
                    at the bottom: Undo disabled=true, Redo disabled=false
Ctrl+Y  #2,#3,#4    218895101 -> 3069218194 -> 3765034709
                    at the top:    Redo disabled=true, canRedo()=false
Ctrl+Z ; Ctrl+Shift+Z   3069218194 ; 3765034709      the other binding, same answer
```

The doc-local witness across the whole of it: **`0 → 1 → 1 → 1`**. The author's stroke is
made, survives the undo, and survives the redo.

### 1.1 Which control, and how the author would find it

Both `Undo` and `Redo` are `Chip`s in `LevelWorkspace`'s header, driven by
`focusedHistory()`. The keyboard bindings are that file's own handler: `Ctrl/Cmd+Z` without
shift undoes, and `Ctrl/Cmd+Y` **or** `Ctrl/Cmd+Shift+Z` redoes. Row `R10` drives the
second spelling so a reader who only knows `Ctrl+Shift+Z` is not left with a derived
answer.

---

## 2. The rig

`npm run harness:chunk-undo-redo`, in-tree build of this worktree:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a450f0dc7c3fd751a
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-a450f0dc7c3fd751a
```

`AURORA_BUILT_TREE` **and** `ELECTRON_BIN` both passed. `VITE_AURORA_DEBUG=1 npx
electron-vite build`; `spawnGuarded` under `xvfb-run` (Ozone pinned to x11, private
profile — nothing attaches to the owner's compositor); a **hardlinked copy** of aeon as the
project, opened through the debug door; `killTree` in a `finally`.

**devicePixelRatio for every run below: 1.** The composer canvas rect is
`{x:308, y:135, w:1024, h:1024}` — integral. `zoom = 8` is recovered from the element
(`width / (widthTiles * 8)`). Every aim is an **integer client pixel**, and the doc pixel
it lands on is derived from that integer through PixelViewport's own
`floor((client − rect.left) / zoom)` and **asserted** to be in the cell it names.

**The chunk under test is `OJZ_00` ("OJZ $00")**, 16×16 tiles. Cell (1,0) is empty and is
the doc-local aim; cell (3,0) is the second empty cell row X needs; cell (0,0) is
atlas-backed (`atlasTile 0`) and is the census-P3a aim.

**Deterministic.** Two consecutive runs, the PASS/FAIL block byte-identical (`md5
70f7b912b236f19691c920ad2c4145f6` both times), same ladder, same aim, same counts:
**44 pass, 2 fail, 8 note over 54 rows**.

**No emulator was touched, and none was attempted.**

---

## 3. The tile-stamp row — the one derived gesture driven here

The measurement covered pencil (P3b) and collision paint. **Paste, cut, selection move, the
seven transforms, tile-stamp and palette-apply** were all still derived. One was to be
driven; **tile stamp** is the one, and the reason is not a coin toss: **a chunk IS a
nametable of atlas tiles**, so placing a tile into a cell is the *primary* authoring gesture
on a chunk document. Of the six, it is the one most likely to be performed on one at all.

It behaves exactly as the pencil and the collision paint did:

```
[S] cell (1,0)  {"atlasTile":null,"localId":1,...}  ->  {"atlasTile":0,"localId":null,...}
[S] zoneArtHash 3765034709 -> 3765034709        S2: the stamp is DOC-LOCAL
[S] Ctrl+Z ->  zoneArtHash 3765034709 -> 3069218194     S3: it ate e3
[S]            cell (1,0) unchanged                     S3b: the stamp itself survives
[S] Ctrl+Y ->  zoneArtHash 3069218194 -> 3765034709     S4: recoverable, same as the pencil
```

So the misfire is now measured on **three** gestures rather than two, and the recovery
holds for all three. **The other five stay derived** and are named as such in §7.

---

## 4. The row that keeps this above cosmetic: the rescue truncates

A redo stack is discarded when a new command is pushed. On a chunk document that is not a
hypothetical: the author who pressed Ctrl+Z, saw the canvas change and carried on working
will, sooner or later, make a stroke on an **atlas-backed** cell — which is census path
P3a, a real `set-tileset-tiles` command on the very stack holding their rescue.

Row X drives exactly that, on the same document, in the same session:

```
[X] doc-local stroke on cell (3,0)   zone 3765034709 (unchanged — X0)
[X] Ctrl+Z                            zone 3069218194   THE MISFIRE — e3 is gone (X1)
[X]                                   Redo chip disabled=false, canRedo()=true (X1b)
[X] pencil on cell (0,0), ATLAS-BACKED, atlasTile 0
[X]                                   zone 3069218194 -> 165717223   a REAL command (X2)
[X]                                   Redo chip disabled=TRUE, canRedo()=FALSE
[X] Ctrl+Y                            zone 165717223 — nothing happens (X3)
```

**The rescue is gone, and the control that offered it is now greyed out.** The zone art
never returns to `3765034709`: the edit made on the other document is destroyed for good.

This is the shape of the whole defect in one line: **the author is given a working rescue
for a loss they were never told about, and it expires on their next brush stroke.**

### 4.1 What this does and does not say

It says the loss becomes unrecoverable **through Redo**. It does **not** say the edit is
unrecoverable by every route: the zone art is still whatever the last **Save** wrote to
disk, so an author who has not saved since making the eaten edit can still lose it to a
reload, and one who has can still get it back from the file. Nothing here measured either
of those, and neither is claimed.

---

## 5. Two instrument findings

**A canvas hash still cannot measure this**, and the run shows why in its own numbers. The
composer canvas hash across the four presses is
`3137667855 → 1486512426 → 2836917162 → 1486512426`: it moves on the Ctrl+Z **and** on the
Ctrl+Y, and it returns to the exact value it had after the stroke. A reader hashing the
canvas would conclude "the undo took the stroke back and the redo put it back", which is
false in both halves — the document's own pixel never moved at all. Those repaints are the
chunk's **atlas-backed** cells being redrawn from a zone tile that is being reverted and
restored underneath an untouched document. Row `R4b` reports the hash and asserts nothing
on it, and every measurement above reads `artDocPixelAt` / `artDocCellAt` / `zoneArtHash`
instead.

**Arming a tool can move the canvas out from under a cached aim, and the failure looks
exactly like the finding.** `ArtToolDock` renders eleven tools in a fixed column order;
`Pencil` is first and `Tile stamp` is ninth, and the harness arms a tool by clicking its
dock button, which calls `scrollIntoView({block:'center'})`. Scrolling to the ninth button
moved the composer rect from `y=135` to `y=172` — **37 px** — while scrolling to the first
did nothing. The first run of this harness reused a client point derived before that
scroll, dispatched its press at a coordinate the canvas no longer occupied, and got:

```
[S] cell (1,0) {"atlasTile":null,...} -> {"atlasTile":null,...}     the stamp landed on NOTHING
[S] Ctrl+Z -> zoneArtHash 3765034709 -> 3069218194                  and the Ctrl+Z ate an edit anyway
```

— a row that reads precisely like "the tile stamp is doc-local and its Ctrl+Z misfires"
while actually measuring a no-op followed by a misfire that belongs to nothing. The
gesture's aim is now **re-derived from the rect after the tool is armed** and asserted to
be inside the named cell before anything is dispatched (`armAndAim`, rows `*aim`). The doc
pixel is invariant under this — a cell centre is always `(cx*8+4, cy*8+4)` — so the
witness is the same pixel in every row; only the client integer moves.

That is the same class of hazard as the previous packet's `y=2796` Tileset panel: **a setup
that silently degrades is how a weaker claim gets reported as a stronger one.**

---

## 6. What was added to the app, and why it is not a fix

**One** read-only entry on `AeonProbeApi` (`src/renderer/debug-hooks.ts`):

| Hook | Why nothing else served |
|---|---|
| `canRedo()` | The store-side twin of the Redo chip's `disabled`, read for the same reason `canUndo()` is read beside the Undo chip. The chip alone cannot distinguish "the app decided there is nothing to redo" from "the chip is stale"; the two together are what row `R2a`/`R2b` and row `X3` rest on. `focusedHistory()?.canRedo ?? false`, exactly as `canUndo` is `focusedHistory()?.canUndo ?? false`. |

No behaviour changed. The five hooks the previous packet added (`focusedDocId`,
`zoneArtHash`, `zoneTileHash`, `zoneTileCount`, `artDocCellAt`, `artDocPixelAt`) are used
as they stand.

**Which rows are red, and why the harness exits 1:**

- **`S3`** — the twin of the previous packet's `T2`, for a third gesture. It asserts that
  Ctrl+Z after a doc-local **tile stamp** leaves the zone-art edits alone. It fails, which
  is the finding, and it goes green by itself the day the misfire is fixed.
- **`X3`** — asserts the eaten edit is still recoverable after the author makes another
  real edit. It fails, which is §4.

The docblock and the summary line both say so, and the summary names whichever fired.
Every recovery row (`R3`, `R4`, `R5`, `R7`, `R8`, `R9`, `R10`, `S4`) is written to **pass**
when Redo is a clean round trip, and all of them do.

---

## 7. What is still derived

- **Paste, cut, selection move and the seven transforms** on a chunk document. All are
  `allowCow` gestures through `commitWrites`' doc-local tail. **Three** gestures have now
  been driven (pencil P3b, collision paint, tile stamp) and all three behave identically,
  which makes the reading stronger — but no row here drives one of these seven, so they
  remain a reading.
- **Palette-apply.** The third mode of `applyTileCell`; the other two are now driven.
- **The map clipboard's collision paste** on a chunk document.
- **Whether the eaten edit is recoverable by any route other than Redo** (§4.1).
- **Everything about non-chunk documents.** Untouched here; the pure doc-local documents
  are covered by `harness:art-undo-path`, which is green.

---

## 8. What the answer moves about the recommendation

**It does not change which option is right, and it sharpens why.**

The measurement packet's §7 recommended **option 1** — write the doc-local half of a chunk
document through as `set-chunk` commands, so the document has one stack again — and ruled
out giving it a second stack, because this codebase already closed a live defect
(`editorStore.focusedDocId`'s `bgOverride` comment, "one document had two undo stacks
interleaved by facet") by refusing exactly that.

What the Redo answer adds:

1. **The severity is a window, not an absolute.** The loss is recoverable while it is the
   most recent thing on the stack and unrecoverable after one more command. That makes
   **option 2** (refuse: answer `null` from `focusedDocId` while a chunk document is open,
   so the chip greys and Ctrl+Z is inert) *more* attractive than it looked, because the
   thing it protects is not "an unrecoverable loss" but "a loss the author will not notice
   in time to press Ctrl+Y". A greyed chip removes the window entirely, at the price of the
   P3a half's working undo.
2. **Option 1 is still the one that leaves both halves undoable**, and the Redo result is
   evidence *for* it rather than against: the zone-art stack's redo side is already
   correct, deep, and symmetric — three down, three up, chips honest at both ends. It is
   not a stack that needs fixing. The defect is entirely in what gets *routed* onto it.
3. **Nothing here argues for option 3.**

**The standing warning is still right, and its wording should gain a clause:** `Ctrl+Z` on
a chunk document is unsafe whenever the session has any earlier zone-art edit, the canvas
will change in a way that looks like it worked — **and if you realise, press Redo before you
touch anything else, because the next real edit takes the rescue away.**

---

## 9. `npm test`

Not run at either end in this worktree, and the reason is stated rather than skipped over:
this parcel adds **no test**. The deliverable is a measurement and the instrument that
carries it is the committed harness, so the vitest totals could not move. The base's own
totals are recorded in `docs/reviews/2026-09-09-chunk-undo-measure.md` §8 — 77 failures at
**both** ends of that parcel, the same four files, every row
`TypeError: Cannot read properties of null (reading 'useCallback')`, the node-suite half of
the second-React-instance defect in `docs/reviews/2026-09-09-save-contract.md` §7, still
open and not this parcel's.

`.gitignore` gains the entry below, beside the one the previous harness's fixture already
has and for the same reason: an un-ignored hardlink copy of the aeon tree is read by
`scripts/check-peer-path-literals.mjs` as executable violations of this repo's own rule,
naming lines nobody in this tree wrote. A separate directory from the earlier harness's, so
the two can never be running against one tree at once.

```
scratchpad/fixtures/aeon-chunk-undo-redo/
```
