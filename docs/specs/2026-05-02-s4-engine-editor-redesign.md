# S4 Engine Level Editor — Design Spec

## Overview

Redesign the Sonic level editor to target the S4 engine exclusively. The editor currently targets Sonic 2/S3K formats (Nemesis/Kosinski compression, chunk→block→tile hierarchy, 6-byte objects, row-pointer layouts). The new S4 engine uses a fundamentally different architecture: flat tile grids per section, build-tool-driven block slicing, S4LZ compression, 4-byte packed objects, and assembly source output.

The editor's role is to provide a productive editing surface and export intermediate data that the existing S4 build tools consume. The architecture retains a format abstraction boundary so S2/S3K support can be re-added later.

---

## Data Model

### Section (editing surface)

Each section is a flat 256×256 tile grid (2048×2048 pixels). No chunk or block indirection in the data — build tools handle slicing.

```typescript
interface SectionTileGrid {
  width: 256
  height: 256
  nametable: Uint16Array  // 65536 entries, VDP nametable words
  collision: Uint8Array   // 65536 entries, collision type per tile (full-res)
}

interface Section {
  index: number
  name: string
  tileGrid: SectionTileGrid
  objects: ObjectPlacement[]
  rings: RingPlacement[]
  paletteRef: string | null      // null = zone default
  parallaxRef: string | null     // null = inherit act default
  bgLayoutRef: string | null     // null = use act default
  flags: number                  // SF_* bitmask
  music: number                  // 0 = keep current
}
```

Null sections are supported — a grid slot with no data exports as a zeroed-out 72-byte section entry (`sec_block_index = 0`).

### Nametable word format

Standard Genesis VDP format per tile reference:
```
Bit 15:    Priority
Bit 14-13: Palette line (0-3)
Bit 12:    V-flip
Bit 11:    H-flip
Bit 10-0:  Tile index (local to tileset, remapped to absolute VRAM on export)
```

### Collision

Collision types are assigned per tile in the tileset. When tiles are painted onto the grid, collision auto-populates. Manual override is available via the collision paint tool. On export, build tools downsample from the full-res grid (256×256) to the engine's half-vertical-res format (16 cols × 8 rows per 128×128 block).

### Objects

```typescript
interface ObjectPlacement {
  x: number           // section-local pixels (0-2047)
  y: number           // section-local pixels (0-2047)
  typeId: string      // references object library entry
  subtype: number     // 0-31
}
```

Project-wide object library defines available types. On export, the editor auto-generates per-section type tables (max 32 unique types per section — editor warns if exceeded). Objects are exported as 4-byte packed entries (X-sorted, `dc.l 0` terminated):
```
Bits 29-20: Section-local X (10 bits)
Bits 19-10: Section-local Y (10 bits)
Bits  9-5:  Type index into section's type table (5 bits)
Bits  4-0:  Subtype (5 bits)
Bits 31-30: Reserved (0)
```

### Rings

```typescript
interface RingPlacement {
  x: number   // section-local pixels
  y: number   // section-local pixels
}
```

Exported as `dc.w X, Y` pairs (X-sorted), terminated by `dc.l 0`.

### Chunk stamps (editor-only)

```typescript
interface ChunkDef {
  id: string
  name: string
  widthTiles: number    // user-configurable
  heightTiles: number   // user-configurable
  nametable: Uint16Array
  collision: Uint8Array
}
```

Chunks are reusable patterns stored in the editor's chunk library. They are flattened onto the tile grid when stamped. The engine never sees them.

### Object library

```typescript
interface ObjectDef {
  id: string
  name: string
  codeLabel: string         // assembly label (e.g., "Obj_Spring")
  sprite?: string           // path to preview sprite image
  defaultSubtype: number
  properties: Record<string, any>
}
```

### Top-level structure

```typescript
interface S4Project {
  name: string
  zones: Zone[]
  objectLibrary: ObjectDef[]
  chunkLibrary: ChunkDef[]
  basePath: string
}

interface Zone {
  id: string
  name: string
  acts: Act[]
  tileset: Tileset
  palette: Palette
}

interface Act {
  gridWidth: number
  gridHeight: number
  sections: (Section | null)[]   // null = empty slot
  startPosition: { secX: number; secY: number; localX: number; localY: number }
  bgLayout: Uint16Array | null   // 64×32 Plane B nametable
  bgTiles: Tile[] | null
  parallaxRef: string | null
}
```

---

## Export Pipeline

The editor outputs intermediate files consumed by the S4 build tools (`ojz_block_gen.py`, `s4lz.py`, assembler).

### Per-section binary files

| File | Size | Content |
|------|------|---------|
| `sec{N}_nametable.bin` | 131072 bytes | 256×256 × 2 bytes, big-endian VDP words, row-major. Tile indices rebased to absolute VRAM. |
| `sec{N}_collision.bin` | 65536 bytes | 256×256 × 1 byte, collision type per tile. Build tools downsample. |
| `sec{N}_tiles.bin` | Variable | Raw deduplicated tile art used by this section. |

### Assembly source files

| File | Content |
|------|---------|
| `act_descriptor.asm` | Act struct (34 bytes) + section table (N × 72 bytes) with label references |
| `entity_data.asm` | Per-section: ring lists, object lists (4-byte packed), auto-generated type tables |
| `sec_vram_bases.asm` | VRAM base equates per section (graph-colored) |

### Zone-level files

| File | Content |
|------|---------|
| `zone_palette.bin` | 128 bytes (4 CRAM lines × 32 bytes) |
| `zone_bg.bin` | 4096 bytes (64×32 × 2 bytes, Plane B nametable) |
| `bg_tiles.bin` | 2-byte length header + raw BG tile data |

### Export logic

1. For each active section, scan nametable for referenced tile indices
2. Deduplicate tiles (with flip detection), write `sec{N}_tiles.bin`
3. Remap nametable indices to deduplicated set + section VRAM base offset
4. Write `sec{N}_nametable.bin` and `sec{N}_collision.bin`
5. Sort objects by X, validate ≤32 unique types, generate type table, write packed entries
6. Sort rings by X, write `dc.w X, Y` pairs
7. Compute VRAM graph-coloring (adjacent sections get different bases)
8. Write `sec_vram_bases.asm`, `act_descriptor.asm`, `entity_data.asm`

### VRAM graph-coloring

Adjacent sections (horizontally/vertically in the grid) must have different VRAM base addresses. Simple 2-color checkerboard pattern works for most grids. Only horizontal/vertical neighbors are considered adjacent (diagonal doesn't count — engine only co-renders H/V neighbors during transitions).

### Tile deduplication

The editor internally uses sequential tile indices (position in tileset). On export:
- Scan each section's nametable for unique tile indices used
- Write only those tiles to the section's tile art file
- Remap nametable words to: `VRAM_base + deduplicated_index`

---

## Painting Tools

### Brush types

| Tool | Unit | Grid snapping | Behavior |
|------|------|---------------|----------|
| Tile brush | 8×8 px | Tile grid | Paint individual tiles. Collision auto-fills from tile's assignment. |
| Block brush | 128×128 px (16×16 tiles) | Block grid | Paint block-sized area. Select a 16×16 region from tileset or saved block. |
| Chunk stamp | User-defined W×H | Tile grid (not block-forced) | Stamp from chunk library. Preview ghost follows cursor. |
| Eraser | Tile or Block (toggle) | Respective grid | Clear to empty (tile index 0, collision 0). |
| Select | Arbitrary rectangle | Tile grid | Copy/paste/cut. Save selection as new chunk. |
| Object place | Point | None (free position) | Pick from object library, click to place. |
| Ring place | Point | None | Single ring or pattern (H-row, V-col, diamond, etc.) |
| Collision paint | 8×8 px | Tile grid | Override collision type manually (overrides auto-assigned). |

### Chunk creation workflow

1. Click "New Chunk" in chunk library panel
2. Set width and height in tiles (with pixel equivalent shown: e.g., "16×8 tiles = 128×64 px")
3. Mini-editor opens at that size — paint tiles within it
4. Save with a name → appears in chunk library
5. Select chunk, stamp onto level — flattened into tile grid

---

## Grid Overlays

Toggleable visual overlays on the main viewport:

| Overlay | Spacing | Style | Purpose |
|---------|---------|-------|---------|
| Tile grid | 8×8 px | Fine lines, subtle color | See individual tile boundaries |
| Block grid | 128×128 px | Thick lines, distinct color | See where engine will slice into blocks |
| Chunk grid | Active chunk's W×H | Dashed lines | Preview chunk stamp alignment |
| Collision | Per tile | Semi-transparent colored fill | Visualize collision types |

All overlays are independent toggles (toolbar buttons or keyboard shortcuts).

---

## UI Layout

### Main viewport
- Large canvas: current section's 256×256 tile grid
- Zoomable (pixel-level to full section overview)
- Pan with middle-mouse or space+drag

### Section grid navigator (panel)
- Thumbnail grid showing all sections in the act
- Click to switch focus, null sections shown as empty/greyed
- Right-click for section properties (flags, music, palette, parallax)
- Add/remove row/column buttons on edges for grid resizing

### Side panels

| Panel | Content |
|-------|---------|
| Tileset | Tile grid with palette-colored preview. Click to select. Collision type indicator per tile. Edit collision assignment here. |
| Chunk library | Saved chunks with thumbnails. New/edit/delete. Width/height displayed. |
| Object library | Available object types with sprite previews. Search/filter. |
| Properties | Context-sensitive: section props, selected object props, act settings. |

### BG editor
- Separate tab/mode — viewport shows 64×32 Plane B grid
- Same tile brush tool, operating on BG tileset/nametable
- No collision, no objects, no sections — one grid for the whole act

---

## Rendering Pipeline

### Two-layer cache (simplified from current 4-layer)

**TileCache:**
- Pre-renders each tile as 8×8 ImageData, indexed by palette line (4 variants)
- Shared between FG and BG modes
- Invalidated when tileset or palette changes

**SectionRenderer:**
- Renders visible portion of 256×256 grid from nametable + TileCache
- Handles flip/priority/palette bits per nametable word
- Dirty-rect tracking: only re-renders tiles that changed since last paint
- Viewport culling: only composites visible tiles at current zoom

**OverlayRenderer:**
- Grid lines, collision overlay, object/ring sprites, selection, cursor preview
- Re-rendered on tool state change or viewport scroll

### Compositing order (bottom to top)
1. BG plane (dimmed, optional toggle)
2. Section tile grid (main surface)
3. Collision overlay (if enabled)
4. Grid overlays (if enabled)
5. Object/ring sprites
6. Tool cursor/preview (stamp ghost, selection box)

### Zoom behavior
- Zoomed out: tile colors as single pixels
- Mid zoom: actual 8×8 tile rendering
- Zoomed in: pixel-level detail

---

## Project Config & Storage

### Project file (`project.json`)

```json
{
  "name": "Sonic 4",
  "engine": "s4",
  "zones": [
    {
      "id": "ojz",
      "name": "Orange Juice Zone",
      "tileset": "data/tiles/ojz_tiles.bin",
      "palette": "data/palettes/ojz_palette.bin",
      "acts": [
        {
          "id": "act1",
          "gridWidth": 4,
          "gridHeight": 3,
          "dataPath": "data/levels/ojz/act1/",
          "bgLayout": "data/bg/ojz_bg.bin",
          "bgTiles": "data/bg/ojz_bg_tiles.bin",
          "parallax": "data/parallax/ojz_default.asm",
          "startPosition": { "secX": 0, "secY": 0, "localX": 256, "localY": 256 }
        }
      ]
    }
  ],
  "objectLibrary": "data/objdefs/objects.json",
  "chunkLibrary": "data/chunks/chunks.json"
}
```

### Working data (editor format)

| File | Format | Content |
|------|--------|---------|
| `sec{N}.tiles.bin` | Binary | 131072 bytes, nametable grid |
| `sec{N}.coll.bin` | Binary | 65536 bytes, collision grid |
| `sec{N}.objects.json` | JSON | Object placements array |
| `sec{N}.rings.json` | JSON | Ring placements array |
| `chunks.json` | JSON | Chunk library index |
| `chunk_{id}.bin` | Binary | Chunk nametable + collision data |
| `objects.json` | JSON | Object library definitions |

### Import support

- **Binary tileset**: Load raw `.bin` tile data (32 bytes/tile, 4bpp)
- **PNG import**: Color-quantize to active palette (4bpp), deduplicate tiles (with flip detection), append to tileset
- **Existing assembly**: Parse `dc.w`/`dc.l` directives for ring/object lists (for importing the already-converted OJZ level)

---

## Section Grid Management

- Grid dimensions set at act creation
- Resizable later: add/remove rows and columns
- Adding a row/column appends null sections
- Removing a row/column warns if active sections will be deleted
- Sections can be toggled between active (has data) and null (empty)
- Non-rectangular shapes supported via null slots in the grid

---

## Parallax (deferred)

For now, the editor only provides a pointer assignment field per section and per act:
- `parallaxRef: string | null` — path to an externally-authored parallax config assembly file
- Null means inherit from act default

Full parallax editing tool to be designed and implemented separately.

---

## Palette Management

- Zone-wide base palette: 128 bytes (4 CRAM lines × 16 colors × 2 bytes)
- Per-section palette override: assign a different palette file path in section properties
- Palette viewer in the tileset panel (shows active 64-color palette)
- Color format: Genesis CRAM word `0000BBB0 GGG0RRR0` (9-bit, even values only)
- No in-editor palette color picker for now (external palette tool)

---

## Architecture Changes from Current Editor

### What stays
- Electron + React + TypeScript + Zustand stack
- Main/preload/renderer process architecture
- IPC layer for file I/O
- Editing command pattern (undo/redo history)
- Ring placement patterns (H-row, V-col, diamond, etc.)
- Basic project/viewport/zoom infrastructure

### What gets replaced

| Current | New |
|---------|-----|
| `core/model/types.ts` (Chunk/Block/Tile hierarchy) | Flat Section + TileGrid model |
| `core/formats/*` (S2/S3K parsers) | S4 binary + assembly exporters |
| `core/compression/kosinski.ts`, `nemesis.ts` | Removed (build tools handle S4LZ) |
| `core/config/types.ts` (S2/S3K engine presets) | S4-only project config |
| `canvas/ChunkRenderer.ts` | Removed (no chunk layer) |
| `canvas/BlockRenderer.ts` | Absorbed into SectionRenderer |
| `canvas/LevelRenderer.ts` | SectionRenderer (flat grid) |

### What gets added
- Chunk library system (editor-side stamps)
- Assembly source export (`act_descriptor.asm`, `entity_data.asm`)
- VRAM graph-coloring algorithm
- Tile deduplication on export
- Section grid navigator panel
- Block brush tool
- BG editing mode
- Grid overlay system
- PNG tile import with quantization

---

## Constraints & Validation

The editor enforces on export:
- Section flat array must be contiguous (`gridWidth × gridHeight` entries of 72 bytes each)
- Ring and object lists X-sorted ascending
- Object type indices valid for section's type table (max 32 unique types)
- Adjacent sections have different VRAM base assignments
- All binary output is big-endian
- Null sections export as zeroed-out 72-byte entries
