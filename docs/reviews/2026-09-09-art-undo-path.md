# WHICH commit path in the Art composer has no undo

Branch `parcel/art-undo-path`, base `c8652263`.
Instrument: `scratchpad/art-undo-path-harness.mjs` (committed).
Evidence: `docs/captures/2026-09-09-art-undo-path/` — the two screenshots and the run's
own `rows.json`, tracked so a reader can open them.

UX seat B filed F1 as **"a paint stroke in the Art composer cannot be undone — not by
the button, not by Ctrl+Z"** (`docs/reviews/2026-09-07-lens-ux/uxb-audit.md` §F1). That
headline is too broad to fix against: `ComposerCanvas.commitWrites` has **four** commit
paths and its own docblock claims one of them is undoable, with a committed test saying
so. So the first question was not "is the art canvas undoable" but **which path**.

**Answer: the DOC-LOCAL path.** The seat's finding reproduces exactly, and the reason it
is a defect rather than a design decision is now measurable inside the composer itself —
the *same* canvas component, the *same* gesture, the *same* client pixel, one store field
apart, undoes perfectly.

---

## 1. The census — every commit path, and what happens to a gesture through it

Derived by reading `src/renderer/components/art/ComposerCanvas.tsx:196-395` in full
(`commitWrites`, `commitAtlasTile`, `applyTileCell`), then cross-checked with a search.

⚠ The cross-check was run with `command grep`, not `grep`. In this session `grep` is a
shell function from a Claude Code shell snapshot that honours ignore files: a canary
string written to `dist/_canary.txt` (proved ignored by `git check-ignore -v`) returned
**0** from `grep -rl` and **1** from `command grep -rl`, same shell, same second. Nothing
in the census lives in an ignored path — `src/` is tracked — so the population is
unaffected, but a census whose search silently skips a class of file reads exactly like a
complete one, which is the same defect shape as the one under investigation.

| # | Path | Condition | What it does | Undoable? | By what |
|---|---|---|---|---|---|
| P1 | **live-tile** | `open.liveTileIndex !== null` | `commitAtlasTile` → `executeCommand({set-tileset-tiles}, level)` (`:335`) | **YES** | zone-art stack (`zoneArtDocId(zone)`) |
| P2 | **bgOverride** | `open.bgOverride` | `bgArtCommitCommand` → `executeCommand(cmd, level)` (`:238`) | **YES** | **act** stack — `focusedDocId()` has an explicit branch for it |
| P3a | **chunk doc, atlas cells** | `open.chunkId !== null && !allowCow`, write lands on a cell with `atlasTile !== null` | one `set-tileset-tiles` per crossed tile, batched → `executeCommand` (`:278`) | **YES** | zone-art stack |
| P3b | **chunk doc, empty/local cells** | same call, `atlasTile === null` | `setPixels(doc, atlas, localWrites)` + `markOpenDirty` (`:284`) | **NO** | *nothing is recorded* |
| P4 | **doc-local** | everything else, and every `allowCow` gesture | `setPixels(doc, atlas, writes)` + `markOpenDirty` (`:295`) | **NO** | *nothing is recorded* |
| P5 | **tile-space tools** | `applyTileCell` — tile-stamp / collision / palette-apply, on **any** document kind | `stampTile` / `paintDocCollision` / `applyPaletteLineToDocCell` + `markOpenDirty` (`:356`, `:379`, `:388`) | **NO** | *nothing is recorded* |

P5 is not a fifth branch of `commitWrites` — it never reaches `commitWrites` at all. It is
a separate writer wired straight to the viewport's host-pointer hook, and it is
un-undoable on **every** document kind, including the ones whose pencil is undoable.

Callers that reach `commitWrites` (so, the gestures P3b/P4 swallow): `onCommit` — every
pixel-tool gesture (`:416`); `pendingAction` transforms (`:652`); marquee **cut**
(`:696`); **paste** and selection **move** (`:742`). The last three always pass
`allowCow: true`, so on a chunk document they are P4 even though a pencil there is P3a.

### Which document kinds land on which path

Every opener of a composer document, enumerated from source (11 call sites):

**Pure doc-local (P4 — nothing about the document is undoable):**
- `workspace/facets/art-facet.tsx:39` — **New Tile (1×1)** ← *the seat's own entry point*
- `workspace/facets/art-facet.tsx:52` — New Block (2×2)
- `workspace/facets/art-facet.tsx:62` — New Chunk (W×H, up to 64×64 tiles)
- `components/MapViewport.tsx:4360` — **"Edit block…"**, a 16×16-tile region captured off the map
- `components/MapViewport.tsx:1982` — marquee → Block, an arbitrary region captured off the map

**chunk doc (P3a for pencil on atlas cells, P3b/P4 for the rest — mixed):**
- `providers/chunk-grid-aeon.ts:127`, `state/aeon-open.ts:94` (a project open lands here),
  `state/art-composer-save.ts:276` (re-open after save)

**live-tile (P1 — undoable):**
- `components/art/TilesetPanel.tsx:217` (double-click a tile), `:269` (Duplicate instead),
  `:321` (Add to tileset); `components/MapViewport.tsx:4332` ("Edit tile…")

**bgOverride (P2 — undoable, on the act stack):**
- `components/ArtBrowser.tsx:366` (bg strip), `components/effects/BgAnimBandPanel.tsx:743` (open bank)

---

## 2. The reproduction — one run, one canvas, two document kinds

`node scratchpad/art-undo-path-harness.mjs`, in-tree build of this worktree
(`root: …/agent-a43f4b4f0c217fd0b`, `in-tree: … has node_modules/.bin/electron and
dist/main/index.mjs` — not borrowed), `VITE_AURORA_DEBUG=1 npx electron-vite build`,
`spawnGuarded` under `xvfb-run`, hardlinked copy of aeon as the project (the live aeon
tree is never opened), project opened through the debug door — no native dialog anywhere.

**devicePixelRatio for this run: 1.** Composer canvas attr `64×64`, rect
`{x:690, y:445, w:64, h:64}` — integral, and identical to the rect the seat recorded. The
aim is the integer client point `(702,457)`; the doc pixel it lands on is derived through
PixelViewport's own arithmetic, `floor((client − rect.left) / zoom)` with `zoom = 8`
recovered from the element, and printed: **doc pixel (1,1)**. Both rows aim at the same
integer and land on the same doc pixel, well inside the canvas — nothing here rests on a
fractional rect or a boundary.

| Row | Document | hash before → after paint → after Ctrl+Z | Undo chip `disabled` | `focusedHistory().canUndo` |
|---|---|---|---|---|
| **B** | live-tile (`tile #0`, opened by double-click in the Tileset panel) | `1523021819` → `3126058246` → **`1523021819`** | `true` → **`false`** → `true` | `false` → **`true`** |
| **A** | **New Tile 1×1** (the seat's gesture) | `1523021819` → `524852502` → **`524852502`** | `true` → **`true`** → `true` | `false` → **`false`** |

Row A is byte-identical after Ctrl+Z, with the Undo control disabled the entire time.
Row B is byte-identical to *before the stroke*, with the Undo control offering itself.

**Row B is the control that settles it.** The seat's control was the *sprite* canvas — a
different store, a different history mechanism, a fair objection being "two different
editors". Row B removes that objection: it is the same `ComposerCanvas`, the same
`PixelViewport`, the same `PixelEditController`, the same toolbar, the same pixel, in the
same app session seconds apart. The only difference is `open.liveTileIndex`.

Row A reproduced identically across three separate app launches (`1523021819 →
524852502`), so this is deterministic rather than a timing artefact.

The two screenshots are both taken **after** the Ctrl+Z, and they say the same thing to an
eye. `A-doc-local-after-ctrl-z.png`: header `New Tile (1×1) · unsaved`, the painted pixel
still sitting one pixel in from the canvas's top-left corner, `Undo` greyed in the header.
`B-live-tile-after-ctrl-z.png`: header `tile #0`, the tileset panel naming
`tile #0, used 39443× in this act`, and the canvas back to its unpainted checker — the
stroke gone. (Only the `Undo` chip's `disabled` property was measured; nothing here is a
claim about `Redo`, which was not read.)

**The seat's own control still stands too**, and it was not re-run here: the sprite
document went `1782527648 → 3844028820 → 1782527648`. The sprite half is a different
mechanism (`SpriteDocHistory` snapshots on the hub) and nothing in this parcel touches it.

**P2 (bgOverride) confirmed undoable, but by a test, not by a gesture in this run.**
`src/renderer/state/__tests__/band-art-undo-stack.test.ts` — 6 tests, green on this branch.
Not driven live here; the live-app proof for it is the prior
`docs/reviews/2026-08-26-effects-foreground-checks-2.md` F1.

**P3 and P5 were NOT driven.** P3 needs a chunk document and P5 needs the tile-space tools
armed; both are stated above from source only, and are labelled as such. The honest
consequence: the P3b and P5 rows of the census are a *reading*, not a measurement, and the
seat's own standing warning applies — intent and behaviour diverged once already here.

---

## 3. The cause

`focusedDocId()` (`src/renderer/state/editorStore.ts:613`) resolves the art facet to
`zoneArtDocId(level.zone)` — the **zone art** document — unless `open.bgOverride` is set,
in which case it resolves to the act. It has no notion of a composer document that is
neither. Every undo entry point in the app (the header chips, `LevelWorkspace`'s single
Ctrl+Z binding at `:154`/`:97`) goes through it.

So for a pure doc-local document there is no stack that could hold the stroke, and
correspondingly `commitWrites`' doc-local tail records nothing — it mutates `o.doc` in
place through `setPixels` and calls `markOpenDirty()`. `markOpenDirty` is a *save* signal,
not a history one. `commitWrites`' own docblock says this plainly: *"otherwise / `allowCow`
→ doc-local setPixels (no command until save)"*. The behaviour matches the code's stated
intent; what nobody wrote down is that "no command until save" means **no undo at all**
for the entire lifetime of an unsaved document, which for a New Tile / New Block / map
block capture is the *whole* document.

There is a second, sharper consequence that the seat could not have seen, because its
project had no prior zone-art edit: **Ctrl+Z on a doc-local composer document is not
inert, it is aimed elsewhere.** It resolves to the zone-art stack, so with any earlier
zone-art edit in the session it will undo *that* — a change on a different document, out
of sight of the canvas the user is looking at. In the seat's run and in rows A above the
stack happened to be empty, so it read as "nothing happened". **Not measured**: no row
here drives a prior zone-art edit followed by a doc-local stroke and a Ctrl+Z. It is
derived from the resolution above, and it is the row I would drive first if this is picked
up.

---

## 4. The fix — PARKED, it is a design question

Per the brief's escape hatch: I am stopping on the fix rather than picking, because the
fix is not "the same shape as the paths that already work". The working paths all record a
**command against a document that already exists in the project** (an act, a zone's
tileset). A pure doc-local composer document is a transient unsaved buffer that is in no
project document until Save, so a fix has to answer *where its history lives* — and that
answer is a change to shared history plumbing.

**Not the open question:** what counts as one undo step. Every gesture already arrives at
`commitWrites` as one batch and would record one step; the existing paths behave that way
and `commitWrites`' docblock already commits to it.

**The open question, in two parts.**

**(a) Where does a pure doc-local document's history live?** The machinery exists and the
shape is established — `DocumentHistoryHub` takes a per-prefix stack factory
(`src/core/editing/document-history.ts:29`), `SnapshotHistory`
(`src/core/editing/snapshot-history.ts`) is the shared snapshot engine classic's domain
stacks and `SpriteDocHistory` are built on, and sprite documents already own one stack
each keyed by document id. So: mint an id for the open composer document, register a
`ComposerDocHistory` factory, snapshot the `ComposerDoc` on each `commitWrites` doc-local
tail **and each `applyTileCell` write** (P5 — otherwise the same document is half
undoable, which is worse than uniformly not), and add a branch to `focusedDocId()` beside
the existing `bgOverride` one. Lifetime is the document: cleared on open, dropped on close,
exactly as sprite documents do it.

**(b) The chunk document, where the two halves interleave.** A chunk document already
splits: pencil on atlas-backed cells records on the **zone-art** stack (P3a) while pencil
on empty cells and every paste/move/transform is doc-local (P3b/P4). Giving the doc-local
half its own stack would put **one document's gestures on two stacks**, so one Ctrl+Z would
undo them in an order that is neither the user's nor either stack's. That is precisely the
hazard this codebase already ruled against in writing, in the comment that created the
`bgOverride` branch: *"Without this, one document had two undo stacks interleaved by facet
(live-app finding F1)"* (`editorStore.ts:637-643`). Leaving P3b/P4 unrecorded on chunk
documents keeps that ruling but leaves half a chunk document's gestures silently
un-undoable, which is today's behaviour.

**Options.**

1. **Fix the pure doc-local documents only** (New Tile / New Block / New Chunk / map block
   and marquee captures) with a per-document composer stack, covering P4 *and* P5, and
   leave chunk documents exactly as they are. No interleave is possible on these documents
   because *every* write on them is doc-local. Smallest change; closes the seat's case and
   the two map-capture cases; leaves P3b/P5-on-chunk-docs open and named.
2. **Fix everything by moving the doc-local half onto the zone-art stack** — make
   P3b/P4/P5 record a command against the zone-art document like P3a does. One stack per
   document, no interleave. But it records edits to an *unsaved buffer* on a *project*
   document's stack, so undoing past the document's creation is undefined and a zone-art
   undo from another facet would reach into a buffer that facet cannot see. I think this is
   wrong and would not recommend it without the owner's ruling.
3. **Do nothing to the code; make the app say so.** Disable/annotate the Undo control on a
   doc-local document instead of leaving it looking like a working control that is merely
   idle. Cheapest, honest, and does not fix the user's problem.

**Recommendation: option 1**, followed by a separate row for the chunk document's split
(P3b/P5) which needs its own ruling.

**⚠ It touches shared plumbing that another parcel is in.** Option 1 requires one new
branch in `editorStore.focusedDocId()` and a factory registration on
`documentHistoryHub`. `parcel/save-contract` is working on dirty-state and undo-history at
the same time. Per the brief's branch discipline I have not made the change; whoever lands
it should sequence it after that parcel rather than race it.

---

## 5. What was not established

- P3 (chunk document) and P5 (tile-space tools) are **source-derived only**; no gesture was
  driven through either.
- The "Ctrl+Z undoes an unrelated zone-art edit" consequence in §3 is derived from the
  resolution in `focusedDocId`, not measured.
- The seat's own sprite control was not re-run; the sprite half is untouched by this parcel.
- No test was added. A test asserting that a doc-local stroke undoes would be permanently
  red until the design question above is answered, and this repo's bar for a new test is a
  red-first proof against a *fix*. The instrument that carries this finding is the
  committed harness, named above.
- **No emulator was touched, and none was attempted.**

## 6. One environment note for whoever runs this next

A linked worktree has no `node_modules`, so this parcel built the app in-tree by
symlinking the parent checkout's. **`scripts/check-cited-paths.mjs` cannot run against a
symlinked `node_modules`**: its ignore-query canary asks `git check-ignore` about a path
under `node_modules/`, and git answers `fatal: pathspec '…' is beyond a symbolic link`
(exit 128), so the gate exits 2 with `COULD NOT MEASURE`. It is a property of the
scaffolding, not of anything in this branch — with the symlink removed the same command
prints `OK: every in-repo path and source filename named in a comment is on disk`. Either
copy `node_modules` for real, or drop the symlink for the duration of that one check.
