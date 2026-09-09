# Ctrl+Z on a chunk document takes back an edit you made somewhere else

Branch `parcel/chunk-undo-measure`, base `4e66b570`.
Instrument: `scratchpad/chunk-undo-measure-harness.mjs` (committed, registered as
`npm run harness:chunk-undo-measure`).
Evidence: `docs/captures/2026-09-09-chunk-undo-measure/` — the run's own `rows.json` and
the two screenshots, tracked so a reader can open them.

`docs/reviews/2026-09-09-art-undo-fix.md` §6.4 and lens row `ART-UNDO-CHUNK-SPLIT` both
carry the same sentence, and both label it **derived from source, not measured**:

> On a chunk document, a doc-local-only gesture followed by `Ctrl+Z` reaches the
> **zone-art** stack and takes back **some other edit** — one the author made earlier,
> elsewhere, and believed was safe.

**It reproduces.** Twice, byte-identical, in a run whose control differs from its
treatment in one field.

**The warning the owner is working under is correct and should stay up** until the design
question in §5 is answered. The measurement did not merely confirm the routing; it also
found that the app gives the author a *visible* change on the canvas when this happens,
which is the part that makes it silent-in-practice rather than only silent-in-principle
(§4.1).

---

## 1. Why an empty stack could not have shown this

With nothing on the zone-art stack, `Ctrl+Z` after a doc-local gesture does nothing at
all, and reads as *"undo is merely missing here"* — which is exactly how UX seat B filed
it, and exactly what both earlier packets measured, because neither of their projects had
a prior zone-art edit in the session.

The discriminating setup is therefore an ordering, not a gesture: **zone-art edit first,
then the doc-local gesture on the chunk document, then `Ctrl+Z`.**

Row C is that same session with the first step removed. It is the one-field control: the
same chunk document, opened from the same library cell, the same two gestures at the same
derived cell, the same integer client pixel, in the same app session. The only difference
between C and T is whether row Z ran in between.

---

## 2. The rig

`npm run harness:chunk-undo-measure`, in-tree build of this worktree:

```
root: /home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ac56fc0467fc9acdb
      pinned: AURORA_BUILT_TREE=/home/volence/sonic_hacks/aurora/.claude/worktrees/agent-ac56fc0467fc9acdb
```

`AURORA_BUILT_TREE` **and** `ELECTRON_BIN` both passed. `VITE_AURORA_DEBUG=1 npx
electron-vite build`; `spawnGuarded` under `xvfb-run` (Ozone pinned to x11, private
profile, nothing attaches to the owner's compositor); a **hardlinked copy** of aeon as the
project, opened through the debug door — no native dialog anywhere; `killTree` in a
`finally`. The worktree's `node_modules` is a real hardlink copy of the parent's, not a
symlink.

**devicePixelRatio for every run below: 1.** The composer canvas rect is
`{x:308, y:135, w:1024, h:1024}` — integral. The aim is the integer client point
`(404,167)`; the doc pixel is derived from that integer through PixelViewport's own
`floor((client − rect.left) / zoom)` with `zoom = 8` recovered from the element
(`width / (widthTiles * 8)` = `1024 / 128`), and printed: **doc pixel (12,4)**, which is
**cell (1,0)** — asserted, not assumed, so nothing here rests on a fractional rect or a
boundary.

**The chunk under test is `OJZ_00` ("OJZ $00")**, 16×16 tiles, 128 of its 256 nametable
words nonzero. Cell (1,0) is one of the empty ones. That matters, and §3 says why.

**No emulator was touched, and none was attempted.**

---

## 3. The setup, and the control that keeps it honest

A pencil stroke on a chunk document is doc-local **only** on a cell whose `atlasTile` is
null. On an atlas-backed cell the identical stroke is a `set-tileset-tiles` command
(census path P3a) that pushes its own entry on the zone-art stack — so a `Ctrl+Z` taking
it back would look exactly like the defect while being correct behaviour.

So the aim is chosen from `artDocCellAt`, which reports the open document's own cell, and
**C3 asserts the stroke moved no zone art at all**. Without that row the whole packet
would be unfalsifiable.

The gestures are two of the ones `ART-UNDO-CHUNK-SPLIT` enumerates:

- **pencil on an empty cell** — census path P3b, `setPixels` + `markOpenDirty`, recorded
  nowhere.
- **collision paint** — `applyTileCell`, a writer that never reaches `commitWrites` at
  all; on a chunk document `recordComposerSnapshot` is a no-op because `composerDocId` is
  null for one.

The zone-art edits in row Z are made on a **different document**: a live-tile document
opened by double-clicking tile #0 in the Tileset panel — the path both earlier packets
measured as undoable on the zone-art stack. Two strokes on it are two commands and so two
stack entries, which is what lets row T show the undo eating them **one at a time**.

---

## 4. The numbers

`zoneArtHash()` is FNV over the open zone's whole tileset — the **zone-art witness**. It
reads the tileset bytes and no canvas, so it can be sampled while the composer is showing
some other document.

| | pencil (P3b) | collision (`applyTileCell`) |
|---|---|---|
| **CONTROL** — zone-art stack **empty** | zone `628154474 → 628154474 → 628154474` | zone `628154474 → 628154474 → 628154474` |
| **TREATMENT** — **two** entries on the stack | zone `3069218194 → 3069218194 → **218895101**` | zone `218895101 → **628154474**` |

Read the treatment row's three numbers against the setup's:

```
zone-art witness:  start 628154474  ->  edit1 218895101  ->  edit2 3069218194
```

- The pencil stroke leaves the zone art at `3069218194` (T2b — it is doc-local).
- Its `Ctrl+Z` puts the zone art at **`218895101`**: **the state before the second
  zone-art edit.** That edit is gone.
- The collision paint leaves it at `218895101` (T5b).
- Its `Ctrl+Z` puts it at **`628154474`**: **the state before both.** The first one is
  gone too.

And the doc-local gestures themselves **survive both undos**:

```
doc pixel (12,4)     control 0 -> 1 -> 1        treatment 0 -> 1 -> 1
collisionA[0]        control 0 -> 12289 -> 12289  treatment 0 -> 12289 -> 12289
```

So nothing the author just did is what came back.

**Which stack, read from the app.** `focusedDocId()` answered `zoneart:ojz` in **both**
rows — the control's and the treatment's. Not inferred from the source; the value is
returned by a debug hook that calls `editorStore.focusedDocId()` itself.

**Enabled and wrong, not disabled and inert.** These are different defects and the author
can tell them apart before pressing, so both were captured:

| | Undo chip `disabled` | `focusedHistory().canUndo` |
|---|---|---|
| CONTROL, at the moment of the doc-local gesture | `true` | `false` |
| TREATMENT, at the moment of the identical gesture | **`false`** | **`true`** |

In the control the app correctly offers nothing. In the treatment it offers a working
Undo control — and the control works, on a document that is not on screen.

**31 pass, 2 fail, 5 note over 38 rows**, and the two failures are `T2` and `T5`, which
are the finding. **Identical across two consecutive runs** (same hashes, same aim, same
counts), so this is deterministic rather than a timing artefact.

### 4.1 The part that is worse than "silent"

`OJZ_00`'s atlas-backed cells reference tile #0, which is the tile row Z edited. So when
the treatment's `Ctrl+Z` reverted that tile, **the composer canvas repainted**: its hash
went `2836917162 → 13661738`.

The author therefore presses Ctrl+Z, sees the picture change, and has every reason to read
that as "my undo worked". It did not: their stroke is still there (doc pixel still `1`),
and a tile they edited minutes ago in a different panel has been reverted underneath it.

This was not predicted by the source reading, and it is the strongest argument for the
warning staying up.

### 4.2 One thing that is NOT a defect, and had to be checked

Closing a document does not roll back the commands made from it. **T0b** is the control
for that: after the live-tile document was closed and the chunk re-opened, the zone-art
witness still read `3069218194`. Had it not, every row after it would have been measuring
the close, not the undo.

---

## 5. What is still derived, and what a first run got wrong

**Derived, not measured, and named as such:**

- **Paste, cut, selection move and the seven transforms** on a chunk document. All are
  `allowCow` gestures through `commitWrites`' doc-local tail — the same tail the pencil
  row drove — but no row here drives one, so they are a reading.
- **Tile-stamp and palette-apply.** The collision row drove `applyTileCell`; the other two
  modes of the same function were not driven.
- **The map clipboard's collision paste** on a chunk document.
- **Redo.** Only the `Undo` chip's `disabled` was read. Whether the destroyed zone-art edit
  can be recovered with Ctrl+Shift+Z was **not measured**, and it matters to how bad this
  is: a recoverable loss and an unrecoverable one are different rows.
- **Whether more than two edits deep behaves the same.** Two were staged; the third was
  not tried.
- **Everything about non-chunk documents.** Untouched here; the pure doc-local documents
  are covered by `harness:art-undo-path`, which is green.

**Two instrument findings, each of which first read as a defect in the app:**

- **A canvas hash cannot measure the doc-local half of a chunk document.** A chunk
  document's atlas-backed cells are drawn from the zone tileset, so the undo that reverted
  tile #0 repainted the canvas while the *document* was untouched. The first run's T3 read
  that as "the stroke was taken back" and failed. The row now reads the document's own
  pixel through `composer-buffer.getPixel`, and the canvas hash is reported beside it as
  the §4.1 observation instead of as the measurement.
- **The Tileset panel sat at `y = 2796` in a 1050 px window.** The double-click meant to
  open a live-tile document was dispatched at a coordinate no element occupies, opened
  nothing, and the setup strokes landed on the **chunk** document that was still open —
  producing real zone-art edits through census path P3a and quietly staging a *weaker*
  version of the experiment (the "other" edit would have come from the same document).
  It still reproduced, which is worth recording: `zoneArtHash 3709196434 → 3784752349`
  on the same pencil row. But `Z1` is now **fatal** rather than a failed row, and the
  panel is scrolled into view before the rect is read, because a setup that silently
  degrades is how a weaker claim gets reported as a stronger one.

---

## 6. What was added to the app, and why none of it is a fix

Five read-only entries on `AeonProbeApi` (`src/renderer/debug-hooks.ts`). No behaviour
changed; every one exists because the measurement had no other way to see the thing:

| Hook | Why nothing else served |
|---|---|
| `focusedDocId()` | `canUndo()` says whether the focused stack has anything on it, which is precisely *not* the question when the suspicion is that a gesture and its undo point at different documents. A `true` there is equally consistent with "your stroke is on the stack" and "somebody else's edit is". |
| `zoneArtHash()`, `zoneTileHash()`, `zoneTileCount()` | The zone-art witness. Every canvas on screen is a picture of one document, and the whole question is what happened to a document that is **not** open. |
| `artDocCellAt()` | Which cells are empty. `commitWrites` branches per cell, so "doc-local" is a property of the *aim*; nothing on screen distinguishes an empty cell from one holding an all-transparent tile. |
| `artDocPixelAt()` | §5's first instrument finding. The doc's own pixel, through the app's own `getPixel`. |

---

## 7. The fix — NOT APPLIED, and the reason is a written ruling

The obvious wide fix, giving the doc-local half of a chunk document its own stack, is
**forbidden by this codebase's own ruling**, in the comment that created the `bgOverride`
branch in `focusedDocId()` (`src/renderer/state/editorStore.ts`):

> *"Without this, one document had two undo stacks interleaved by facet (live-app finding
> F1)"*

One document's gestures on two stacks unwinds them in an order that is neither the
author's nor either stack's. Re-introducing that here would undo a defect a previous live
finding closed. So this is a design question and it may be the owner's.

**What the measurement changes about the options.** The root is now visible as an
asymmetry rather than an omission: **a chunk document is half live-editing and half
buffered.** Its atlas-backed cells write *through* to the project immediately, as
`set-tileset-tiles` commands on the zone-art stack; its empty cells and every `allowCow`
gesture write into a buffer that reaches the project only at Save. `focusedDocId()` is
right about the first half and has nothing to say about the second, and Ctrl+Z lands
wherever the first half put it.

### Option 1 — write the doc-local half through, as `set-chunk` commands

Make P3b, the `allowCow` gestures and `applyTileCell` on a **chunk document** record a
`set-chunk` command against the library chunk, exactly as P3a records `set-tileset-tiles`.

- **One document, one stack.** `set-chunk` is already in `ZONE_SCOPED_COMMAND_TYPES`
  (`editorStore.ts`), so it routes to the *same* `zoneart:<zone>` document P3a routes to.
  The ruling is respected rather than worked around, and no new stack is minted.
- The command type already exists and already carries the whole payload: `chunkId`,
  `oldNametable`/`newNametable`, and both collision planes
  (`src/core/editing/commands.ts`).
- **What it costs:** a chunk document stops being a buffer. Edits reach the library chunk
  as they are made, and "Save" for a chunk document becomes a write-to-disk rather than a
  commit-from-buffer. That is a real behaviour change with its own perimeter (the
  unsaved-work dialog, `art-composer-save.ts`, the dirty flag), and it is a decision, not
  a cleanup.

### Option 2 — refuse the undo instead of aiming it elsewhere

While the art facet has a **chunk** document open, make `focusedDocId()` answer `null` (or
otherwise disable the Undo control), so the chip is greyed and Ctrl+Z is inert.

- Cheap, and it converts silent destruction into a visibly unavailable control — the shape
  this codebase already prefers elsewhere (refuse, do not erase).
- **What it costs:** the P3a half of a chunk document *is* legitimately undoable today and
  would stop being so from the art facet. That is removing function from the case that
  currently works, to protect the case that does not.

### Option 3 — split the document

Give the composer's chunk document two identities, one per half. This is a data-model
change, it is the largest of the three, and nothing here recommends it.

### Recommendation

**Option 1**, and I would not treat it as mechanical. It is the only one of the three that
leaves both halves of a chunk document undoable and keeps one stack per document, and it
reuses a command type and a routing rule that already exist. But it changes what "unsaved"
means for a chunk document, which touches the save perimeter another parcel has been
working in — so it wants the owner's ruling first, the way option 1 of the census packet
did.

**Until something lands, the standing warning is right:** `Ctrl+Z` on a chunk document is
unsafe whenever the session has any earlier zone-art edit, and the canvas will change in a
way that looks like it worked.

---

## 8. `npm test`, both ends, aggregate

| | Test Files | Tests | exit |
|---|---|---|---|
| **base** `4e66b570` (detached checkout, same worktree, same `node_modules`) | 4 failed \| 567 passed \| 3 skipped (574) | **77 failed \| 8447 passed \| 9 skipped (8533)** | **1** |
| **tip** `0a514b3c` (the whole chain — fourteen check scripts and a typecheck before vitest) | 4 failed \| 567 passed \| 3 skipped (574) | **77 failed \| 8447 passed \| 9 skipped (8533)** | **1** |

**Byte-identical at both ends, and none of the 77 are mine.** The same four files fail at
the base commit — `aether-badge-identity`, `classic-map-wheel`, `map-device-scale`,
`map-viewport-mounted` — every row `TypeError: Cannot read properties of null (reading
'useCallback')`. That is the node-suite half of the second-React-instance defect in
`docs/reviews/2026-09-09-save-contract.md` §7, still open; `resolve.dedupe` does not reach
vitest. This parcel adds no test, so the totals could not move: the deliverable is a
measurement, and the instrument that carries it is the committed harness.

Every check script printed `OK` at the tip, including `check-cited-paths`,
`check-doc-citations` over this packet, `check-ledger-timestamps` over the new row, and
`check-harness-guards` (259/259 clean, the new harness classified as guarded).

## 9. One environment note for whoever runs this next

**The hardlinked aeon fixture must be git-ignored, and not merely for tidiness.** The aeon
tree carries Python instruments with absolute sibling paths inside them —
aeon `docs/research/phase_harness/*.py` — so an un-ignored hardlink copy of it under
this repo's scratchpad fixtures directory is read by `scripts/check-peer-path-literals.mjs` as
**33 executable violations of this repo's own rule** — a gate that goes red on a *copy of
another repo* and names lines nobody in this tree wrote. `.gitignore` gains the entry
below, beside the ones the earlier harnesses' fixtures already have; with it the gate goes
from exit 1 to exit 0.

```
scratchpad/fixtures/aeon-chunk-undo/
```
