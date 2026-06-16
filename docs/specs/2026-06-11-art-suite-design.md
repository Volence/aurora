# In-Editor Art Suite — Design Spec

## Overview

Add human-facing art creation to the level editor: a dedicated **Art mode** hosting one
**ComposerCanvas** that edits any W×H-tile surface — a single tile (1×1), an engine block
(16×16 tiles), or a custom-size chunk — with pixel-level painting, tile-brush composition,
a palette editor, and quality-of-life tools for non-pixel-artists. Everything funnels
through the existing `EditHistory` command system and renderer invalidation built for the
MCP integration, so human edits, agent edits, and undo share one stack and one repaint path.

Prerequisite inside this project: **unify the dual tile atlas** (zone tileset vs
`project.chunkTiles`) so "the tileset" is one array for rendering, export, budget, MCP,
and the new editors.

## Goals

- Create and edit tiles (8×8, 4bpp), blocks (16×16-tile chunks), and chunks in-app.
- Open any existing tile/chunk in the editor, or start from an empty preset-size canvas.
- Everything made is immediately usable on the main layout via the existing tile brush and
  chunk stamp (and visible to the MCP tools).
- Edit the zone palette in-app with Genesis-accurate color pickers.
- One undo stack: every art gesture is one undoable command interleaved with map edits.

## Non-Goals (v1)

- Animation / tile-cycling preview.
- PNG import into the composer (the import pipeline remains separate).
- Per-section palette variant editing (zone base palette only).
- Custom dither pattern authoring (fixed pattern set ships).
- Color-count linting / art validation beyond what the budget system already reports.
- Engine-side changes of any kind.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Dual atlas | Unify into the zone tileset; delete `project.chunkTiles` and `section.tiles` pinning |
| Block vs chunk editors | One composer with size presets (Tile 1×1, Block 16×16 tiles, custom Chunk); "block" is a preset, saved to the chunk library |
| UI surface | Dedicated Art mode (toolbar toggle Map \| Art), not a modal or side panel |
| Tool set | Core (pencil/eraser/fill/eyedropper/zoom+grid) + transforms (flip/rotate/wrap-shift) + shapes & rect-selection + seamless aids (3×3 repeat preview, mirror symmetry) + dither brushes |
| Editing existing tiles | In place, with a live map usage count and a one-click "Duplicate instead" button |
| Palette | Full palette editor included (lines 1–3 editable; line 0 locked as sprite-reserved; index 0 locked transparent) |

## Phase 0 — Atlas Unification (runs before any UI work)

Executed automatically when a project with non-empty `chunkTiles` loads, as an in-memory
load-time transform — **not** an undoable command (it predates any edit history, and
undoing it would restore a state the post-migration code paths no longer render). A toast
announces it ("Tile atlases unified — N tiles merged, M remapped"). Nothing touches disk
until the user saves; closing without saving leaves project files untouched.

1. Build a flip-aware canonical index of `zone.tileset.tiles` (reuse `canonicalTileHash`
   from `src/core/agent/budget.ts`).
2. For each `chunkTiles` tile: find its canonical match in the zone tileset or append it;
   record old→new index plus flip compensation (XOR of flip bits, same math as export's
   `remapNametableToGroup`).
3. Remap all chunk-library nametables and all section nametables pinned to
   `section.tiles === chunkTiles`; then clear `section.tiles` pinning, empty
   `project.chunkTiles`, and remove the lazy-pin code paths (MapViewport stamp tool,
   agent `stamp-chunk`) and the chunkTiles render-preference chain.
4. MapViewport's tile resolution collapses to `zone.tileset.tiles` everywhere.
   `docs/MCP.md`'s chunkTiles known-limitation is deleted.

Known cosmetic effect: canonicalization may flip which orientation is stored, so some
chunk nametable entries gain compensating flip bits — visually identical, noisy binary
diff once.

Size sanity: OJZ merge lands ~900–1000 tiles, well under the 2048 hardware index ceiling.
The VRAM budget is unaffected (it counts only tiles referenced by section nametables).

## Art Mode UI

Toolbar mode toggle **Map | Art**. Art mode layout:

- **Center — ComposerCanvas**: edits a W×H-tile document (nametable + pixels) at any
  zoom with pixel and tile-boundary grids. Document kinds: existing tile (1×1), existing
  chunk, or new (preset picker: Tile / Block 16×16 / Chunk custom W×H — same dialog as
  current chunk creation).
- **Left — ToolColumn**: pencil, eraser, flood fill, eyedropper, line, rectangle,
  rect-select (move/copy/paste within the canvas), flip H/V, rotate 90° (square
  selections/documents only), wrap-shift (arrow nudges with wraparound), mirror-symmetry
  toggle (H, V, or both), dither brushes (2-color checker + 50% patterns), 3×3 repeat
  preview toggle (canvas surrounded by copies of itself for seamless-tiling judgment).
- **Right — context panels**: TilesetPanel (grown from ArtBrowser: usage counts per tile,
  click = brush, double-click = open in composer), PaletteEditor, ChunkLibrary (existing,
  plus double-click = open in composer).

### Brush spaces

- **Pixel mode**: paint palette indices 0–15; active line chosen in the palette panel;
  index 0 paints transparency. On a 1×1 document this is the tile editor; on larger
  documents strokes edit the pixels of the tiles under the region.
- **Tile mode**: brush = a tile (or multi-tile selection from tileset/chunk library) with
  flip modifiers, stamped on the document's tile grid — composing blocks/chunks from tiles.

### Opening flows

- Tileset double-click → 1×1 document, header `tile #N — used K× on map`, **Duplicate
  instead** button (copies pixels to a new appended tile and retargets the document).
- Chunk double-click → composer document for that chunk.
- Map right-click → "Edit in Art mode" (tile under cursor, or the 128×128 block region
  as an unsaved chunk document).
- New → preset picker → empty document.

### Commit semantics

- Edits to **existing tiles** apply live; each stroke is one command; the map repaints via
  the existing invalidation listener.
- **New documents** are editor-local until **Save to library** (chunks) / **Add to
  tileset** (tiles). Saving a chunk that contains brand-new pixel art appends the needed
  tiles to the atlas at that moment, flip-aware-deduped so existing tiles are reused with
  flip bits instead of duplicated.
- Pixel edits inside a chunk document touch shared tiles → same in-place rules + usage
  count surfaced per affected tile (the header shows the max-usage warning).

### Collision

The composer paints collision per tile (same types as the map collision tool), so saved
blocks/chunks carry collision exactly as chunks do today.

## Commands & Data Flow

All through `EditHistory` (shared with map tools and MCP):

| Gesture | Command | Notes |
|---|---|---|
| Pixel stroke on existing tile(s) | existing `set-tileset-tiles` | old/new pixel buffers per affected tile; batched per stroke (mouse-up) |
| Append new tiles | existing `set-tileset-tiles` with null `oldTiles` | identical to MCP `write_tiles` append semantics |
| Edit saved chunk (tile-mode stamp, collision, pixel edits to its nametable layout) | **new `set-chunk`** | `{chunkId, oldNametable, newNametable, oldCollision, newCollision}`; apply/undo in history.ts; invalidation arm refreshes chunk thumbnails |
| Palette change | existing `set-palette-line` | one command per swatch commit / slider release |
| Atlas migration (Phase 0) | not a command | load-time in-memory transform; see Phase 0 section |

For `set-chunk` to be applicable by `history.ts` (which only sees an `S4Level`), `S4Level`
gains an optional `chunkLibrary?: ChunkDef[]` reference and `getActiveLevel()` includes
`project.chunkLibrary` — the same pattern used when `tileset`/`palette` were added for the
zone-level commands. The zone-command rule applies: missing field → throw, never silently
skip.

Renderer invalidation: `set-tileset-tiles`/`set-palette-line` already trigger
`reloadAllSections`; `set-chunk` adds a chunk-thumbnail refresh arm. Nothing else needed —
the MCP work already centralized this.

`artStore.ts` (new zustand store) holds Art-mode UI state only: active tool, brush, open
document, zoom, symmetry/preview toggles. Document pixel data lives in the document object,
not the store, to keep undo authority in `EditHistory`.

## Palette Editor

- 4×16 swatch grid; line 0 visible but locked ("sprite-reserved" badge); index 0 per line
  rendered as transparency checkerboard, locked.
- Swatch selection opens R/G/B sliders with 8 detents (Genesis 3-bit levels), using the
  existing `encodeGenesisColor`/`decodeGenesisColor` helpers.
- Live preview on map and composer; commits as `set-palette-line`.

## File Structure

- `src/core/art/pixel-ops.ts` — pure pixel-buffer ops: fill, line, rect, wrap-shift,
  flip/rotate, dither patterns, symmetry mirroring. Fully unit-tested.
- `src/core/art/composer-buffer.ts` — W×H document model: nametable+pixels, region
  extract/apply, tile slicing for save, flip-aware dedup on save (reuses budget/export hashing).
- `src/core/art/atlas-migration.ts` — Phase 0 merge + remap. Fully unit-tested.
- `src/core/editing/commands.ts`, `history.ts` — add `set-chunk`.
- `src/renderer/components/art/ArtMode.tsx`, `ComposerCanvas.tsx`, `ToolColumn.tsx`,
  `PaletteEditor.tsx`, `TilesetPanel.tsx`.
- `src/renderer/state/artStore.ts`.
- Edits: `Toolbar.tsx` (mode toggle), `App.tsx` (mode switch), `MapViewport.tsx`
  (right-click entry; remove chunkTiles chain), `agent-handler.ts` + `useProject.ts`
  (remove chunkTiles paths), `projectStore.ts` (drop chunkTiles after migration).

## Testing

- `src/core/art/` and the new command: vitest (pixel-op edge cases, migration remapping
  with flip compensation on synthetic atlases, composer save dedup, set-chunk apply/undo).
- UI: build + manual; the MCP screenshot loop doubles as a verification tool (the agent
  can screenshot Art-mode results on the map).

## Error Handling

- Migration failure (corrupt chunk data, index out of range) → abort cleanly before any
  mutation, surface a toast, project loads in pre-migration state.
- Composer save with atlas at 2048-tile ceiling → blocked with a clear message naming the
  count needed vs available.
- Rotate on non-square selection/document → disabled in UI, guarded in pixel-ops.
- Usage counts computed from live section nametables; recomputed on open and after each
  command affecting the document's tiles (cheap: single scan per open document).
