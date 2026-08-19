# Art Suite — Usage Guide

*Rewritten 2026-08-19 against the post-UX-overhaul shell (ROADMAP §2.6). Everything
here was re-verified against source on that date; where a feature has its own spec,
this guide stays short and points at it.*

> **Terminology**
>
> | Term | Size | Notes |
> |---|---|---|
> | **Tile** | 8×8 px (1×1 tile) | The atomic Genesis art unit |
> | **Block** | 16×16 px (2×2 tiles) | Classic Sonic block; editor-only concept in aeon |
> | **Chunk** | aeon: 128×128 px (16×16 tiles) · classic S1: 256×256 px | The standard authoring unit |
>
> In **aeon** projects, chunks and blocks exist only in the editor — the exported
> level data is flat tile grids. Caveat: the aeon engine internally calls its
> 128×128 slicing unit a "block" (`BLOCK_PIXEL_SIZE = 128` in `core/model/s4-types`).
> That naming is kept in core/export code identifiers but never appears in UI
> labels, where 128×128 is always a **chunk**. In **classic (S1)** projects the
> tile → block → chunk ladder is the engine's own native format, and a chunk is
> 256×256 px (a 16×16 grid of 16px blocks).

## The three art surfaces

Aurora has no "Art mode" toggle any more — the old Toolbar and its Map/Art buttons
were deleted in the UX overhaul (stage 4). Both engines now render through one
`LevelWorkspace` with a row of **facet pills** per level tab
(aeon: Layout · Objects · Rings · Collision · Palette · Art;
classic: Layout · Objects · Collision · Palette · Art). Art is a facet, not a mode,
and it is deliberately last in the row: it is the only facet that swaps the canvas
instead of putting a different lens over the map.

There are three distinct art-editing surfaces today:

1. **The aeon Art facet** — the composer for tiles/blocks/chunks of an aeon zone.
   The bulk of this guide (everything up to *Classic projects*) describes it.
2. **The classic Art facet** — the S1 composer dock (Chunk › Block › Tile tiers)
   plus paint-through. See *Classic (Sonic 1 disassembly) projects* below.
3. **The origination canvas** — a free-size, constraint-checked canvas document
   for creating art from scratch (or importing a PNG) and committing it into a
   classic act. See *Origination canvas & commit* below.

Sprite art (object art) is a fourth surface with its own document type: sprite
editing opens in a **sprite-doc tab**, not inside the level workspace — see the
classic section below for how you get there.

---

## Opening the Art facet (aeon)

Open a level tab (Explorer, or Ctrl+K) and click the **Art** pill in the facet
bar. The layout is: art tool rail on the left, composer canvas in the centre, a
tool-options bar across the top, and a right column stacking the Tileset panel,
Palette editor, and Chunk library. Switching facets preserves the open document —
you can hop to Layout and back without losing unsaved composer work.

Opening a project lands the composer on a chunk rather than an empty canvas, so
the **New Document launcher** is reached via the **New…** button in the options
bar (it closes the current document, with an unsaved-work guard).

Other routes into the composer:

- **Double-click a tile** in the Tileset panel — opens that tile as a **1×1
  edit-in-place document** (`liveTileIndex` set; edits write directly to the
  atlas via `set-tileset-tiles` commands).
- **Double-click a chunk** in the Chunk library — opens a chunk document *and*
  switches the tab to the Art facet if you were elsewhere.
- **Right-click on the map canvas** (Layout facet) — two quick-open entries:
  **Edit tile in Art mode** (the tile under the cursor, in place) and
  **Edit 128×128 chunk region** (copies the chunk-aligned region under the
  cursor into a new unsaved document).

## Document presets

The launcher offers:

| Preset | Size | Use for |
|---|---|---|
| **New Tile** | 1×1 tile (8×8 px) | Painting a brand-new 8×8 tile |
| **Block** | 2×2 tiles (16×16 px) | Composing a classic 16×16 block |
| **New Chunk W×H** | User-specified, 1–64 tiles each dimension (defaults to 16×16 tiles = one 128×128 px chunk) | Chunk assembly |

---

## Pixel vs tile brush space

The **px / tile** chips in the tool-options bar switch the canvas between brush
spaces:

- **Pixel space** — tools operate at individual pixel granularity. The pixel grid
  appears at zoom ≥ 8; tile boundaries are drawn as heavier lines every 8 pixels.
- **Tile space** — clicking or dragging acts on a whole 8×8 cell at once.

Selecting a tile-space tool (**Tile-stamp**, **Collision**, **Palette line**)
switches to tile space automatically; selecting a pixel tool switches back.

## Tool rail

The 11 art tools, in rail order:

| Tool | Behaviour |
|---|---|
| **Pencil** | Paint `selectedColor` on every pixel the pointer drags across |
| **Eraser** | Paint index 0 (transparent) |
| **Fill** | Flood-fill a connected region with `selectedColor` |
| **Eyedropper** | Click to sample color; also switches `paletteLine` to the cell's palette |
| **Line** | Drag to preview a Bresenham line; committed on pointerup |
| **Rect** | Drag to preview a rectangle outline; hold Shift to fill |
| **Select** | Drag a marquee; Ctrl+C/V copies/pastes the selection; transforms apply to the selection if one is active, else the whole document |
| **Dither** | Alternates two colors per a dither pattern (Checker / Sparse25 / Sparse75); the secondary color is set in the dither config that appears in the options bar |
| **Tile-stamp** (tile space) | Stamp the selected atlas tile into a whole cell |
| **Collision** (tile space) | Paint a packed collision cell word (shape + flip + solidity) onto the chunk's dual A/B planes, one 16px cell (2×2 tiles) at a time; the shared `CollisionPalette` panel (same as the map editor's) picks the shape/flip/solidity and the plane |
| **Palette line** (tile space) | Apply the selected palette line to whole cells; the line picker appears in the options bar |

## Options bar

- **Mirror mode** — cycle **off → H → V → Both**. Strokes are reflected across the
  vertical axis (H), horizontal axis (V), or both, with center pixels written once.
- **Repeat preview** (`Rpt`) — a 3×3 tiling of the document at reduced opacity
  around the canvas centre, for designing seamlessly repeating tiles.
- **Pixel-perfect** — checkbox; removes the staircase doubles a freehand pencil
  stroke leaves on diagonals.
- **Transforms** — apply to the selection if active, otherwise the whole document:

  | Button | Action |
  |---|---|
  | Flip H | Mirror pixels left ↔ right |
  | Flip V | Mirror pixels top ↔ bottom |
  | Rotate 90° | Rotate clockwise (square documents/selections only) |
  | Wrap-shift arrows | Scroll content wrapping at edges (useful for aligning seams) |

- **Zoom** — **+** / **−** buttons (or scroll wheel over the canvas, anchored on
  the cursor) between 2× and 64×. Very large documents cap the effective zoom so
  the backing canvas stays within platform limits.

## Tile-stamp flip keys

While the **Tile-stamp** tool is active, press:

- **X** — toggle horizontal flip for the next stamp
- **Y** — toggle vertical flip for the next stamp

A small HUD on the canvas shows the current pending flips.

---

## Edit-in-place semantics

When a tile is opened via double-click in the Tileset panel or via the map
right-click "Edit tile in Art mode" entry, the document header shows:

> `tile #N — used K× in this act`

Every pixel stroke commits a `set-tileset-tiles` command that updates the atlas
in memory immediately; the map repaints live. All K uses of that tile update at
once, because chunks and sections reference the tile by index.

If you want to change only some uses, click **Duplicate instead** in the Tileset
panel header. This appends a copy of the tile at a new index and re-targets the
open document to it, leaving existing placements referencing the original.

---

## Save flows (aeon)

### New 1×1 tile → Add to tileset

After painting a new tile, click **Add to tileset** in the Tileset panel header.
The tile undergoes flip-aware deduplication against the atlas:

- If the pixels (or any flip of them) already exist, the editor opens that
  existing tile instead of appending a duplicate and shows a toast: "Identical
  tile already exists — opened #N" (or "Matches existing tile #N (flipped) —
  opened it" for flip matches).
- If the tile is genuinely new, it is appended at the next free index via a
  `set-tileset-tiles` command (ceiling-guarded at 2048 tiles; a "Tileset full
  (2048 tiles) — cannot add" error toast aborts if full).

### Chunk documents → Save / Save to library

Click **Save** in the options bar's document header. The composer first resolves
all local pixels via `sliceForSave` (flip-aware dedup against the atlas), appends
any genuinely new tiles via `set-tileset-tiles`, then:

- **Existing chunk** — issues a `set-chunk` command, so the edit is fully
  undoable, and the document is reopened from the saved source so local buffers
  collapse back to atlas references.
- **New document** — adds the chunk to the library via `addChunks`. **Library
  adds stay outside the undo history** (matching the import flow) — the new-tile
  append is undoable, the library add is not.

### Tileset persistence

On every Ctrl+S project save the zone tileset is written to the editor-owned
`data/editor/{zone}_tiles.bin` under the game's data root (e.g.
`games/sonic4/data/editor/` — separate from `data/generated/`, which the build
regenerates). `project.json` is updated to point at this path on the first save.

---

## Palette editor

One shared palette grid (`art-shared/PaletteGrid`) is mounted on four screens —
aeon's Art and Palette facets, and classic's Art and Palette facets — each over
its own engine port. The aeon Art facet's instance shows 4 lines × 16 swatches:

- **Line 0** is locked: it is sprite-reserved and cannot be edited.
- **Swatch 0** of every line is drawn as a checkerboard: index 0 is transparent
  in the Genesis tile format and cannot hold a color.
- Click any editable swatch to select it and open three **R/G/B sliders** (0–7,
  the Genesis 3-bit channel range).
- While dragging a slider the map and composer canvas preview the change live;
  releasing commits a `set-palette-line` command (one undo step).
- The selected swatch's Genesis CRAM word (e.g. `$0A42`) is shown for
  cross-referencing with agent `set_palette` output.
- Swatches and whole lines can be **dragged to copy** onto another slot/line
  (locked targets reject the drop).
- Clicking a swatch also sets the active paint color and palette line for pixel
  brushes; the active line drives the Tileset panel preview, and empty composer
  cells adopt it when first painted.

The **Palette facet** (its own pill) shows the same editor beside the *map*
canvas instead of the composer — a Genesis palette line is shared by everything
drawn with it, so "did that recolour break anything?" is a question only the
whole act can answer.

---

## Undo

Undo is unified on the **DocumentHistoryHub**: one stack **per document**
(a level tab, a sprite doc, a canvas doc), so a palette edit in one act no
longer invalidates a layout redo in another. Within a document, every gesture —
pixel stroke, fill, line, rect, tile stamp, palette edit, tile add, chunk edit —
is **one Ctrl+Z step**, and agent (MCP/Aether) mutations land on the same
per-document stacks: undoing an agent `write_tiles` call and undoing a manual
brush stroke are identical operations. Ctrl+Z acts on the active tab's document.

---

## Classic (Sonic 1 disassembly) projects

Opening an S1 disassembly (File → Open on the disasm directory) opens levels in
the **same `LevelWorkspace`** — there is no separate classic surface any more.
A classic level tab shows five facet pills:

- **Layout** — terrain over the act's map (`ClassicLevelViewport`): the chunk
  picker and the stamp tool.
- **Objects** — placement over the same map: object library, selected-object
  inspector, `place-object`.
- **Collision** — the engine's real collision lookup (chunk-cell solidity gates
  the block-id `colind`; block 0 short-circuits both, verified against
  s1disasm's `FindFloor`), shown over the map with a shape picker and
  `paint-collision`: drag to paint, Shift-drag for a rectangle. Refusals are
  precise — a partial paint names *which* cells were skipped. Solidity itself is
  assigned in the composer's Chunk tab (Assign mode). Spec:
  `specs/2026-08-16-classic-collision-authoring-design.md`.
- **Palette** — the shared palette grid beside the map (all four CRAM lines).
- **Art** — the composer, and the only classic facet that replaces the canvas.

### The classic composer (Art facet)

Three tabs over one shared selection, shown as a clickable
**Chunk › Block › Tile trail** in the dock header:

- **Chunk tab** — the selected chunk's 16×16 grid of blocks. **Assign mode**
  places block references (brush carries flips + solidity; right-click a cell to
  eyedrop). **Paint mode** composes the chunk into one pixel surface and lets
  you paint straight onto it — the stroke resolves down the tile→block→chunk
  reference ladder (**paint-through**, phase 1 of the art-authoring line)
  without silently damaging the other places sharing a tile. Duplicate / new
  blank chunk, capacity-aware (≤ $7F).
- **Block tab** — compose the 2×2 tile cells (flips, palette line, priority),
  with the same Assign/Paint mode split. Two strips with opposite semantics: the
  **browse-only block strip** picks which block to edit, while ⚠ the tile strip
  *assigns* the clicked tile to the selected cell; **Edit pixels →** jumps to
  the Tile tab.
- **Tile tab** — the 8×8 pixel editor, running on the same shared pixel
  substrate as aeon's composer (`PixelEditController`/`PixelViewport`), with the
  art tool rail narrowed to the tools that act on a single tile. Tile Copy/Paste
  survives act switches; the tile strip shows usage counts (no badge = unused,
  safe to repurpose; locked slots are anim/gap, view-only).

Everything shows usage counts and warns before shared edits (duplicate-then-edit
offered); each stroke/fill/paste is one undo step on the classic document's
stack. Save (Ctrl+S) writes S1's own native formats (Nemesis 8×8 art, Enigma
blocks, Kosinski chunks) back into the disasm through a guarded (mtime-checked)
channel.

### Sprite art

Object sprite art opens in a **sprite-doc tab**: via **Edit art…** on a selected
object (the inspector's trailing button), or per-object from the command palette
(Ctrl+K → "Edit art: <name>"), or from the Explorer. The sprite editor carries a
**Save to source (S1)** section — Nemesis re-encode into the original `.nem`
file, mtime-guarded.

### Agent surface

Agents reach the same commands through the shared editor-method registry
(36 tools, exposed identically over MCP and Aether), including `edit_chunk`,
`edit_block`, `set_block_collision`, `commit_canvas` and `import_art_sheet`.
See `docs/MCP.md` → *Classic project tools*.

---

## Origination canvas & commit

For making art *from scratch* (the bar: artists shouldn't have to leave for
Aseprite), Aurora has free-size **canvas documents**, opened from the Explorer's
**New Canvas** entry or Ctrl+K. A canvas is a named sidecar under the project:
`.aurora/canvas/<name>.png` + `<name>.canvas.json`.

- The canvas carries a configurable **constraint profile**; clashes,
  colours-per-line and the flip-aware tile count stay live in front of the
  artist while they draw.
- **PNG import** at any size feeds the same pipeline (`import_art_sheet` is the
  agent twin).
- **Resolve and commit** slices the drawing into whole 256px chunks
  (`canvas-resolve` → `classic-commit-plan` → one `classicCommitCanvas` store
  command) and commits them into a classic act — appending new chunks by
  default; replacing an existing chunk is one deliberate choice per chunk.
  Pixels outside the chunk grid are reported, never silently rounded away, and
  committed art gets collision rather than landing at colind 0.

Specs: `specs/2026-08-15-in-app-art-authoring-design.md` (**§0 · Corrections is
authoritative over the rest of the file**) and
`specs/2026-08-15-phase-2c-resolve-and-commit-design.md`.

---

## Atlas unification note (aeon, historical)

On the first load of an aeon project created before the 2026-06 update, the
editor merges the old `chunks_tiles.bin` sidecar atlas into the zone tileset
using flip-aware deduplication. A one-time toast reports how many tiles were
merged and how many were reused; after save, the sidecar is no longer written.
From that point on, rendering, export, VRAM budget accounting, and agent art
tools all read from a single zone tileset at `data/editor/{zone}_tiles.bin`.
