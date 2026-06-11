# Art Suite — Usage Guide

The Art Suite adds an in-editor Art mode for creating and editing tiles, 16×16 blocks,
and chunks (arbitrary-size assemblies of tiles) without leaving the level editor.
All edits are one undo step (Ctrl+Z), shared with map edits and MCP agent edits.

---

## Entering Art Mode

Click the **Art** button in the Toolbar (next to **Map**). The main area switches to the
Art mode layout: tool column on the left, composer canvas in the centre, and a right
column stacking the Tileset Panel, Palette Editor, and Chunk Library. Switching between
**Map** and **Art** preserves the open document — you can toggle back and forth without
losing unsaved work.

---

## Document Presets

When no document is open the canvas shows a launcher with three options:

| Preset | Size | Use for |
|---|---|---|
| **New Tile 1×1** | 8×8 px | Painting a brand-new 8×8 tile |
| **Block — 128×128 px (16×16 tiles)** | 16×16 tiles (128×128 px) | Composing a full 16×16-tile engine block from existing tiles |
| **New Chunk W×H** | User-specified (1–64 tiles each dimension) | Custom-size chunk assembly |

Double-clicking a tile in the Tileset Panel opens that tile in a **1×1 edit-in-place
document** (liveTileIndex is set; edits write directly to the atlas via `set-tileset-tiles`
commands). Double-clicking a chunk in the Chunk Library opens a **chunk document**
(chunkId is set).

Right-click on the map canvas provides two quick-open entries: **Edit tile in Art mode**
(opens the tile under the cursor for in-place editing) and **Edit 128×128 block as chunk**
(copies the block-aligned region under the cursor into a new unsaved document).

---

## Pixel vs Tile Brush Space

The two brush space tabs in the Tool Column switch the canvas between modes:

- **Pixel space** — tools operate at individual pixel granularity. The pixel grid appears
  at zoom ≥ 8; tile boundaries are drawn as heavier lines every 8 pixels.
- **Tile space** — clicking or dragging stamps the selected atlas tile into a whole 8×8
  cell at once. Use **X** / **Y** keys to toggle horizontal / vertical flip for the next
  stamp. The collision value defaults from the tile's collision type in the atlas.

---

## Tool Column

### Drawing Tools (pixel space)

| Tool | Behaviour |
|---|---|
| **Pencil** | Paint `selectedColor` on every pixel the pointer drags across |
| **Eraser** | Paint index 0 (transparent) |
| **Fill** | Flood-fill a connected region with `selectedColor` |
| **Eyedropper** | Click to sample color; also switches `paletteLine` to the cell's palette |
| **Line** | Drag to preview a Bresenham line; released on pointerup |
| **Rect** | Drag to preview a rectangle outline; hold Shift to fill |
| **Select** | Drag a marquee; Ctrl+C/V copies/pastes the selection; transforms apply to the selection if one is active, else the whole document |
| **Dither** | Alternates two colors per a dither pattern (Checker/Sparse25/Sparse75); secondary color set in the dither panel below the tool buttons |
| **Tile-stamp** (tile space) | Stamp the selected atlas tile into a whole cell |
| **Collision** | Paint a collision type into a tile cell (reuses `selectedCollisionType` from the map editor) |

### Mirror Mode

Cycle through **off → H → V → Both** with the mirror button. Strokes are reflected
across the vertical axis (H), horizontal axis (V), or both simultaneously, with center
pixels written once.

### Repeat Preview

Toggles a 3×3 tiling of the document at 1/3 opacity around the canvas centre. Useful
for designing seamlessly repeating tiles.

### Transforms

Apply to the selection if active, otherwise to the whole document:

| Button | Action |
|---|---|
| Flip H | Mirror pixels left ↔ right |
| Flip V | Mirror pixels top ↔ bottom |
| Rotate 90° | Rotate clockwise (button disabled for non-square documents; silently skips non-square selections) |
| Wrap-shift arrows | Scroll content wrapping at edges (useful for aligning seams) |

### Zoom

**+** / **−** buttons (or scroll wheel over the canvas) between 2× and 64×.

---

## Tile-Stamp Flip Keys

While the **Tile-stamp** tool is active in tile brush space, press:

- **X** — toggle horizontal flip for the next stamp
- **Y** — toggle vertical flip for the next stamp

A small HUD in the canvas header shows the current pending flips.

---

## Edit-In-Place Semantics

When a tile is opened via double-click in the Tileset Panel or via the map right-click
"Edit tile in Art mode" entry, the document header shows:

> `tile #N — used K× in this act`

Every pixel stroke commits a `set-tileset-tiles` command that updates the atlas in memory
immediately; the map repaints live. All K uses of that tile update at once because chunks
and sections reference the tile by index.

If you want to change only some uses, click **Duplicate instead** in the TilesetPanel
header. This appends a copy of the tile at a new index and re-targets the open document to
it, leaving existing placements referencing the original.

---

## Save Flows

### New 1×1 tile → Add to tileset

After painting a new tile, click **Add to tileset** in the Tileset Panel header. The tile
undergoes flip-aware deduplication against the atlas:

- If the pixels (or any flip of them) already exist, the editor opens that existing tile
  instead of appending a duplicate and shows a toast: "Identical tile already exists —
  opened #N" (or "Matches existing tile #N (flipped) — opened it" for flip matches).
- If the tile is genuinely new, it is appended at the next free index via a
  `set-tileset-tiles` command with a "Added tile #N to tileset" toast (ceiling-guarded at
  2048 tiles; shows a "Tileset full (2048 tiles) — cannot add" error toast and aborts if
  full).

### New chunk → Save to library

Click **Save** in the document header. The composer first resolves all local pixels via
`sliceForSave` (flip-aware dedup against the atlas), appends any genuinely new tiles via
`set-tileset-tiles`, then adds the chunk to the library via `addChunks`. The document is
reopened from the saved source so local buffers collapse back to atlas references.

### Existing chunk → Save

Same flow as above but issues a `set-chunk` command instead of `addChunks`, so the edit
is fully undoable.

### Tileset persistence

On every Ctrl+S save the zone tileset is written to `data/editor/{zone}_tiles.bin`
(editor-owned; separate from the engine's `data/generated/` tree, which the build
regenerates). `project.json` is updated to point to this path on the first save.

---

## Palette Editor

The Palette Editor (right column, below the Tileset Panel) shows 4 lines × 16 swatches.

- **Line 0** is dimmed with a lock icon: it is sprite-reserved and cannot be edited.
- **Swatch 0** of every line is drawn as a gray checkerboard: index 0 is transparent in
  the Genesis tile format and cannot hold a color.
- Click any editable swatch (lines 1–3, indices 1–15) to select it and show three
  R/G/B sliders (0–7, matching the Genesis 3-bit channel range).
- While dragging a slider the map and composer canvas preview the color change live.
- Releasing the slider commits a `set-palette-line` command (one Ctrl+Z step).
- The selected swatch's Genesis word (e.g. `$0A42`) is shown next to the sliders for
  cross-referencing with MCP `set_palette` output.
- Clicking a swatch also sets it as the active paint color and palette line for pixel
  brushes.

---

## Undo

Every gesture — pixel stroke, fill, line, rect, tile stamp, palette edit, tile add,
chunk save — is **one Ctrl+Z step** in the shared project undo stack. This is the same
stack used by map tile-paint operations and MCP agent mutations; undoing an MCP
`write_tiles` call and undoing a manual brush stroke are identical operations.

---

## Atlas Unification Note

On the first load of a project created before the 2026-06 update, the editor merges the
old `chunks_tiles.bin` sidecar atlas into the zone tileset using flip-aware deduplication.
A one-time toast reports how many tiles were merged and how many were reused. After save,
the sidecar is no longer written.

From this point forward, rendering, export, VRAM budget accounting, and MCP art tools all
read from a single zone tileset. There is no longer a separate "chunk tile atlas": the
editor owns its tileset at `data/editor/{zone}_tiles.bin` after the first save.
