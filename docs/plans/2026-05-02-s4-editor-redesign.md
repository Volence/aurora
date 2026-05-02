# S4 Engine Level Editor Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the S2/S3K format layer with S4-native flat tile grid editing, chunk stamps, and assembly/binary export.

**Architecture:** The core data model changes from chunk→block→tile hierarchy to a flat 256×256 nametable per section. The rendering pipeline collapses from 4 layers (Tile→Block→Chunk→Level) to 2 (TileCache→SectionRenderer). Export produces raw binary + assembly source for the S4 build tools. The Electron shell, React UI, Zustand stores, and undo/redo system stay but get rewired to the new model.

**Tech Stack:** TypeScript 6, React 19, Electron 41, Zustand 5, Vitest 4

---

## File Structure

### New files to create

| File | Responsibility |
|------|---------------|
| `src/core/model/s4-types.ts` | S4 data model (Section, SectionTileGrid, ChunkDef, ObjectDef, S4Project, Act, Zone) |
| `src/core/formats/s4-objects.ts` | Parse/serialize S4 4-byte packed object format |
| `src/core/formats/s4-rings.ts` | Parse/serialize S4 ring format (dc.w X,Y pairs, dc.l 0 term) |
| `src/core/formats/s4-nametable.ts` | Read/write raw 256×256 nametable binaries |
| `src/core/formats/s4-collision.ts` | Read/write raw 256×256 collision binaries |
| `src/core/export/act-descriptor.ts` | Generate `act_descriptor.asm` assembly source |
| `src/core/export/entity-data.ts` | Generate `entity_data.asm` (rings, objects, type tables) |
| `src/core/export/vram-coloring.ts` | Graph-coloring algorithm for VRAM base assignment |
| `src/core/export/tile-dedup.ts` | Per-section tile deduplication + index remapping for export |
| `src/core/export/index.ts` | Orchestrates full export pipeline |
| `src/core/config/s4-config.ts` | S4 project config types + loader |
| `src/core/import/png-import.ts` | PNG → 4bpp tile import with quantization + dedup |
| `src/renderer/canvas/SectionRenderer.ts` | Renders flat 256×256 tile grid with dirty-rect tracking |
| `src/renderer/components/SectionGridNav.tsx` | Section grid navigator (thumbnail grid, click to switch) |
| `src/renderer/components/ChunkLibrary.tsx` | Chunk stamp library panel |
| `src/renderer/components/GridOverlays.tsx` | Toggleable tile/block/chunk grid overlay controls |
| `test/formats/s4-objects.test.ts` | Tests for S4 object format |
| `test/formats/s4-rings.test.ts` | Tests for S4 ring format |
| `test/formats/s4-nametable.test.ts` | Tests for nametable read/write |
| `test/export/vram-coloring.test.ts` | Tests for graph-coloring |
| `test/export/act-descriptor.test.ts` | Tests for assembly generation |
| `test/export/entity-data.test.ts` | Tests for entity export |
| `test/export/tile-dedup.test.ts` | Tests for tile deduplication |

### Files to modify

| File | Changes |
|------|---------|
| `src/core/model/types.ts` | Replace with S4 types (or re-export from s4-types.ts) |
| `src/core/editing/commands.ts` | Replace `SetChunkCommand` with tile/block paint commands |
| `src/core/editing/history.ts` | Update to work with new Level type |
| `src/renderer/state/projectStore.ts` | New state shape for S4Project/Act/Section |
| `src/renderer/state/editorStore.ts` | New tools: `'paint-tile' | 'paint-block' | 'stamp-chunk' | 'paint-collision'` |
| `src/renderer/state/viewStore.ts` | Add tile/block/chunk grid overlay toggles |
| `src/renderer/canvas/TileRenderer.ts` | Keep mostly unchanged (shared) |
| `src/renderer/canvas/OverlayRenderer.ts` | Add tile grid, collision overlay, chunk stamp ghost |
| `src/renderer/canvas/LevelRenderer.ts` | Replace with SectionRenderer usage |
| `src/renderer/components/MapViewport.tsx` | Rewire to tile painting, new hit-test |
| `src/renderer/components/Toolbar.tsx` | Add new tool buttons |
| `src/renderer/App.tsx` | Add ChunkLibrary, SectionGridNav, GridOverlays panels |
| `src/renderer/hooks/useProject.ts` | Replace S2 loading with S4 config/binary loading |

### Files to remove

| File | Reason |
|------|--------|
| `src/core/compression/kosinski.ts` | S4 doesn't use Kosinski (build tools do S4LZ) |
| `src/core/compression/nemesis.ts` | S4 doesn't use Nemesis |
| `src/core/compression/index.ts` | Compression abstraction no longer needed |
| `src/core/formats/blocks.ts` | S2 block format (2×2 tiles) removed |
| `src/core/formats/chunks.ts` | S2 chunk format (8×8 blocks) removed |
| `src/core/formats/layout.ts` | S2 row-pointer layout format removed |
| `src/core/formats/serialize.ts` | S2 serialization replaced by export modules |
| `src/core/formats/serialize-art.ts` | S2 art serialization removed |
| `src/core/config/ini-migrator.ts` | SonLVL INI migration no longer needed |
| `src/core/import/chunk-builder.ts` | S2 chunk builder removed |
| `src/core/import/block-dedup.ts` | S2 block dedup removed |
| `src/renderer/canvas/BlockRenderer.ts` | Replaced by SectionRenderer |
| `src/renderer/canvas/ChunkRenderer.ts` | Replaced by SectionRenderer |
| `src/renderer/components/ChunkSheetImporter.tsx` | Replaced by ChunkLibrary |
| `test/compression/kosinski.test.ts` | Removed with compression |
| `test/formats/blocks.test.ts` | Removed with blocks format |
| `test/formats/chunks.test.ts` | Removed with chunks format |
| `test/formats/layout.test.ts` | Removed with layout format |
| `test/config/ini-migrator.test.ts` | Removed with INI migrator |
| `test/import/chunk-builder.test.ts` | Removed with chunk builder |

---

## Task 1: S4 Data Model

**Files:**
- Create: `src/core/model/s4-types.ts`
- Test: `test/model/s4-types.test.ts`

- [ ] **Step 1: Write the test for core type constructors and invariants**

```typescript
// test/model/s4-types.test.ts
import { describe, it, expect } from 'vitest';
import {
  createSectionTileGrid,
  createSection,
  createChunkDef,
  packNametableWord,
  unpackNametableWord,
  SECTION_TILES_WIDE,
  SECTION_TILES_HIGH,
} from '../src/core/model/s4-types';

describe('s4-types', () => {
  describe('SectionTileGrid', () => {
    it('creates a 256x256 grid with zeroed arrays', () => {
      const grid = createSectionTileGrid();
      expect(grid.width).toBe(256);
      expect(grid.height).toBe(256);
      expect(grid.nametable.length).toBe(65536);
      expect(grid.collision.length).toBe(65536);
      expect(grid.nametable[0]).toBe(0);
      expect(grid.collision[0]).toBe(0);
    });
  });

  describe('packNametableWord / unpackNametableWord', () => {
    it('roundtrips a nametable word with all flags', () => {
      const word = packNametableWord(42, 2, true, false, true);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(42);
      expect(unpacked.palette).toBe(2);
      expect(unpacked.priority).toBe(true);
      expect(unpacked.vFlip).toBe(false);
      expect(unpacked.hFlip).toBe(true);
    });

    it('handles zero tile with no flags', () => {
      const word = packNametableWord(0, 0, false, false, false);
      expect(word).toBe(0);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(0);
      expect(unpacked.palette).toBe(0);
    });

    it('handles max tile index (2047)', () => {
      const word = packNametableWord(2047, 3, true, true, true);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(2047);
      expect(unpacked.palette).toBe(3);
      expect(unpacked.priority).toBe(true);
      expect(unpacked.vFlip).toBe(true);
      expect(unpacked.hFlip).toBe(true);
    });
  });

  describe('createSection', () => {
    it('creates a section with empty tile grid and no entities', () => {
      const section = createSection(0, 'Test');
      expect(section.index).toBe(0);
      expect(section.name).toBe('Test');
      expect(section.tileGrid.nametable.length).toBe(65536);
      expect(section.objects).toEqual([]);
      expect(section.rings).toEqual([]);
      expect(section.paletteRef).toBeNull();
      expect(section.parallaxRef).toBeNull();
      expect(section.flags).toBe(0);
      expect(section.music).toBe(0);
    });
  });

  describe('createChunkDef', () => {
    it('creates a chunk with specified dimensions', () => {
      const chunk = createChunkDef('test-chunk', 'Test', 16, 8);
      expect(chunk.id).toBe('test-chunk');
      expect(chunk.widthTiles).toBe(16);
      expect(chunk.heightTiles).toBe(8);
      expect(chunk.nametable.length).toBe(128); // 16*8
      expect(chunk.collision.length).toBe(128);
    });
  });

  describe('constants', () => {
    it('defines section dimensions', () => {
      expect(SECTION_TILES_WIDE).toBe(256);
      expect(SECTION_TILES_HIGH).toBe(256);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/model/s4-types.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the S4 data model**

```typescript
// src/core/model/s4-types.ts

export const SECTION_TILES_WIDE = 256;
export const SECTION_TILES_HIGH = 256;
export const SECTION_PIXEL_SIZE = 2048; // 256 * 8
export const BLOCK_TILES = 16; // 16x16 tiles per engine block
export const BLOCK_PIXEL_SIZE = 128; // 16 * 8
export const BLOCKS_PER_SECTION = 16; // 256 / 16

export interface SectionTileGrid {
  width: number;
  height: number;
  nametable: Uint16Array;
  collision: Uint8Array;
}

export function createSectionTileGrid(): SectionTileGrid {
  return {
    width: SECTION_TILES_WIDE,
    height: SECTION_TILES_HIGH,
    nametable: new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
    collision: new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH),
  };
}

export interface NametableEntry {
  tileIndex: number;
  palette: number;
  priority: boolean;
  vFlip: boolean;
  hFlip: boolean;
}

export function packNametableWord(
  tileIndex: number,
  palette: number,
  priority: boolean,
  vFlip: boolean,
  hFlip: boolean,
): number {
  return (
    (tileIndex & 0x7FF) |
    ((hFlip ? 1 : 0) << 11) |
    ((vFlip ? 1 : 0) << 12) |
    ((palette & 0x3) << 13) |
    ((priority ? 1 : 0) << 15)
  );
}

export function unpackNametableWord(word: number): NametableEntry {
  return {
    tileIndex: word & 0x7FF,
    hFlip: (word & 0x0800) !== 0,
    vFlip: (word & 0x1000) !== 0,
    palette: (word >> 13) & 0x3,
    priority: (word & 0x8000) !== 0,
  };
}

export interface ObjectPlacement {
  x: number;
  y: number;
  typeId: string;
  subtype: number;
}

export interface RingPlacement {
  x: number;
  y: number;
}

export interface Section {
  index: number;
  name: string;
  tileGrid: SectionTileGrid;
  objects: ObjectPlacement[];
  rings: RingPlacement[];
  paletteRef: string | null;
  parallaxRef: string | null;
  bgLayoutRef: string | null;
  flags: number;
  music: number;
}

export function createSection(index: number, name: string): Section {
  return {
    index,
    name,
    tileGrid: createSectionTileGrid(),
    objects: [],
    rings: [],
    paletteRef: null,
    parallaxRef: null,
    bgLayoutRef: null,
    flags: 0,
    music: 0,
  };
}

export interface ChunkDef {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;
  collision: Uint8Array;
}

export function createChunkDef(
  id: string,
  name: string,
  widthTiles: number,
  heightTiles: number,
): ChunkDef {
  const size = widthTiles * heightTiles;
  return {
    id,
    name,
    widthTiles,
    heightTiles,
    nametable: new Uint16Array(size),
    collision: new Uint8Array(size),
  };
}

export interface ObjectDef {
  id: string;
  name: string;
  codeLabel: string;
  sprite?: string;
  defaultSubtype: number;
  properties: Record<string, unknown>;
}

export interface Tile {
  pixels: Uint8Array; // 64 bytes, 4bpp row-major
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PaletteLine {
  colors: Color[];
}

export interface Palette {
  lines: PaletteLine[];
}

export interface Tileset {
  tiles: Tile[];
  collisionTypes: Uint8Array; // one collision type per tile in the set
}

export interface Act {
  id: string;
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
  startPosition: { secX: number; secY: number; localX: number; localY: number };
  bgLayout: Uint16Array | null; // 64*32 = 2048 entries
  bgTiles: Tile[] | null;
  parallaxRef: string | null;
}

export interface Zone {
  id: string;
  name: string;
  acts: Act[];
  tileset: Tileset;
  palette: Palette;
}

export interface S4Project {
  name: string;
  zones: Zone[];
  objectLibrary: ObjectDef[];
  chunkLibrary: ChunkDef[];
  basePath: string;
}

// Section flag constants (from engine spec)
export const SF_HAS_WATER = 1 << 0;
export const SF_UNDERGROUND = 1 << 1;
export const SF_NO_Y_WRAP = 1 << 2;
export const SF_PRESERVE_STATE = 1 << 3;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/model/s4-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/model/s4-types.ts test/model/s4-types.test.ts
git commit -m "feat: add S4 engine data model types"
```

---

## Task 2: S4 Nametable Binary Format

**Files:**
- Create: `src/core/formats/s4-nametable.ts`
- Test: `test/formats/s4-nametable.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/formats/s4-nametable.test.ts
import { describe, it, expect } from 'vitest';
import { parseNametable, serializeNametable } from '../src/core/formats/s4-nametable';

describe('s4-nametable', () => {
  it('parses a small nametable (big-endian words)', () => {
    // 2x2 grid for simplicity (real is 256x256)
    const data = new Uint8Array([
      0x80, 0x2A, // tile 42, priority, pal 0
      0x00, 0x01, // tile 1, no flags
      0x68, 0x05, // tile 5, pal 3, hFlip
      0x00, 0x00, // empty
    ]);
    const nt = parseNametable(data, 2, 2);
    expect(nt.length).toBe(4);
    expect(nt[0]).toBe(0x802A);
    expect(nt[1]).toBe(0x0001);
    expect(nt[2]).toBe(0x6805);
    expect(nt[3]).toBe(0x0000);
  });

  it('serializes a nametable to big-endian bytes', () => {
    const nt = new Uint16Array([0x802A, 0x0001, 0x6805, 0x0000]);
    const bytes = serializeNametable(nt);
    expect(bytes.length).toBe(8);
    expect(bytes[0]).toBe(0x80);
    expect(bytes[1]).toBe(0x2A);
    expect(bytes[2]).toBe(0x00);
    expect(bytes[3]).toBe(0x01);
  });

  it('roundtrips a full section (256x256)', () => {
    const nt = new Uint16Array(65536);
    nt[0] = 0xFFFF;
    nt[65535] = 0x1234;
    nt[32768] = 0x6805;
    const bytes = serializeNametable(nt);
    expect(bytes.length).toBe(131072);
    const parsed = parseNametable(bytes, 256, 256);
    expect(parsed[0]).toBe(0xFFFF);
    expect(parsed[65535]).toBe(0x1234);
    expect(parsed[32768]).toBe(0x6805);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/formats/s4-nametable.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/formats/s4-nametable.ts

export function parseNametable(data: Uint8Array, width: number, height: number): Uint16Array {
  const count = width * height;
  const nt = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 2;
    nt[i] = (data[offset] << 8) | data[offset + 1];
  }
  return nt;
}

export function serializeNametable(nametable: Uint16Array): Uint8Array {
  const data = new Uint8Array(nametable.length * 2);
  for (let i = 0; i < nametable.length; i++) {
    const word = nametable[i];
    data[i * 2] = (word >> 8) & 0xFF;
    data[i * 2 + 1] = word & 0xFF;
  }
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/formats/s4-nametable.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/formats/s4-nametable.ts test/formats/s4-nametable.test.ts
git commit -m "feat: add S4 nametable binary read/write"
```

---

## Task 3: S4 Collision Binary Format

**Files:**
- Create: `src/core/formats/s4-collision.ts`
- Test: `test/formats/s4-collision.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/formats/s4-collision.test.ts
import { describe, it, expect } from 'vitest';
import { parseCollision, serializeCollision } from '../src/core/formats/s4-collision';

describe('s4-collision', () => {
  it('parses raw collision bytes (1 byte per tile)', () => {
    const data = new Uint8Array([0, 1, 2, 255]);
    const coll = parseCollision(data, 2, 2);
    expect(coll.length).toBe(4);
    expect(coll[0]).toBe(0);
    expect(coll[1]).toBe(1);
    expect(coll[3]).toBe(255);
  });

  it('serializes collision to bytes (identity)', () => {
    const coll = new Uint8Array([0, 1, 2, 255]);
    const bytes = serializeCollision(coll);
    expect(bytes).toEqual(coll);
  });

  it('roundtrips a full section (256x256)', () => {
    const coll = new Uint8Array(65536);
    coll[0] = 42;
    coll[65535] = 99;
    const bytes = serializeCollision(coll);
    expect(bytes.length).toBe(65536);
    const parsed = parseCollision(bytes, 256, 256);
    expect(parsed[0]).toBe(42);
    expect(parsed[65535]).toBe(99);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/formats/s4-collision.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/formats/s4-collision.ts

export function parseCollision(data: Uint8Array, _width: number, _height: number): Uint8Array {
  return new Uint8Array(data);
}

export function serializeCollision(collision: Uint8Array): Uint8Array {
  return new Uint8Array(collision);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/formats/s4-collision.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/formats/s4-collision.ts test/formats/s4-collision.test.ts
git commit -m "feat: add S4 collision binary read/write"
```

---

## Task 4: S4 Object Format (4-byte packed)

**Files:**
- Create: `src/core/formats/s4-objects.ts`
- Test: `test/formats/s4-objects.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/formats/s4-objects.test.ts
import { describe, it, expect } from 'vitest';
import { packObject, unpackObject, serializeObjectList, parseObjectList } from '../src/core/formats/s4-objects';

describe('s4-objects', () => {
  describe('packObject / unpackObject', () => {
    it('roundtrips an object entry', () => {
      const packed = packObject(512, 176, 1, 0);
      const unpacked = unpackObject(packed);
      expect(unpacked.x).toBe(512);
      expect(unpacked.y).toBe(176);
      expect(unpacked.typeIndex).toBe(1);
      expect(unpacked.subtype).toBe(0);
    });

    it('handles max values (x=1023, y=1023, type=31, subtype=31)', () => {
      const packed = packObject(1023, 1023, 31, 31);
      const unpacked = unpackObject(packed);
      expect(unpacked.x).toBe(1023);
      expect(unpacked.y).toBe(1023);
      expect(unpacked.typeIndex).toBe(31);
      expect(unpacked.subtype).toBe(31);
    });

    it('handles zero values', () => {
      const packed = packObject(0, 0, 0, 0);
      expect(packed).toBe(0);
      const unpacked = unpackObject(packed);
      expect(unpacked.x).toBe(0);
      expect(unpacked.y).toBe(0);
    });
  });

  describe('serializeObjectList', () => {
    it('serializes sorted objects with dc.l 0 terminator', () => {
      const entries = [
        { x: 512, y: 176, typeIndex: 1, subtype: 0 },
        { x: 256, y: 96, typeIndex: 2, subtype: 3 },
      ];
      const bytes = serializeObjectList(entries);
      // 2 entries × 4 bytes + 4 byte terminator = 12 bytes
      expect(bytes.length).toBe(12);
      // Should be X-sorted: 256 first, then 512
      const first = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
      const unpacked = unpackObject(first);
      expect(unpacked.x).toBe(256);
      // Terminator
      expect(bytes[8]).toBe(0);
      expect(bytes[9]).toBe(0);
      expect(bytes[10]).toBe(0);
      expect(bytes[11]).toBe(0);
    });

    it('empty list is just terminator', () => {
      const bytes = serializeObjectList([]);
      expect(bytes.length).toBe(4);
      expect(bytes[0]).toBe(0);
    });
  });

  describe('parseObjectList', () => {
    it('parses entries until dc.l 0 terminator', () => {
      const entry = packObject(512, 176, 1, 0);
      const data = new Uint8Array(8);
      data[0] = (entry >> 24) & 0xFF;
      data[1] = (entry >> 16) & 0xFF;
      data[2] = (entry >> 8) & 0xFF;
      data[3] = entry & 0xFF;
      // terminator
      data[4] = 0; data[5] = 0; data[6] = 0; data[7] = 0;
      const objects = parseObjectList(data);
      expect(objects.length).toBe(1);
      expect(objects[0].x).toBe(512);
      expect(objects[0].y).toBe(176);
      expect(objects[0].typeIndex).toBe(1);
      expect(objects[0].subtype).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/formats/s4-objects.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/formats/s4-objects.ts

export interface PackedObject {
  x: number;      // 0-1023
  y: number;      // 0-1023
  typeIndex: number; // 0-31
  subtype: number;   // 0-31
}

// Bit layout: [31-30: reserved][29-20: X][19-10: Y][9-5: type][4-0: subtype]
export function packObject(x: number, y: number, typeIndex: number, subtype: number): number {
  return ((x & 0x3FF) << 20) | ((y & 0x3FF) << 10) | ((typeIndex & 0x1F) << 5) | (subtype & 0x1F);
}

export function unpackObject(packed: number): PackedObject {
  return {
    x: (packed >> 20) & 0x3FF,
    y: (packed >> 10) & 0x3FF,
    typeIndex: (packed >> 5) & 0x1F,
    subtype: packed & 0x1F,
  };
}

export function serializeObjectList(entries: PackedObject[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.x - b.x);
  const data = new Uint8Array((sorted.length + 1) * 4); // +1 for terminator
  let offset = 0;

  for (const entry of sorted) {
    const packed = packObject(entry.x, entry.y, entry.typeIndex, entry.subtype);
    data[offset] = (packed >> 24) & 0xFF;
    data[offset + 1] = (packed >> 16) & 0xFF;
    data[offset + 2] = (packed >> 8) & 0xFF;
    data[offset + 3] = packed & 0xFF;
    offset += 4;
  }

  // dc.l 0 terminator
  data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;

  return data;
}

export function parseObjectList(data: Uint8Array): PackedObject[] {
  const objects: PackedObject[] = [];
  let offset = 0;

  while (offset + 4 <= data.length) {
    const packed = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    if (packed === 0) break; // terminator
    objects.push(unpackObject(packed));
    offset += 4;
  }

  return objects;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/formats/s4-objects.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/formats/s4-objects.ts test/formats/s4-objects.test.ts
git commit -m "feat: add S4 4-byte packed object format"
```

---

## Task 5: S4 Ring Format

**Files:**
- Create: `src/core/formats/s4-rings.ts`
- Test: `test/formats/s4-rings.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/formats/s4-rings.test.ts
import { describe, it, expect } from 'vitest';
import { serializeRingList, parseRingList } from '../src/core/formats/s4-rings';
import type { RingPlacement } from '../src/core/model/s4-types';

describe('s4-rings', () => {
  it('serializes rings as dc.w X, Y pairs, X-sorted, dc.l 0 terminated', () => {
    const rings: RingPlacement[] = [
      { x: 160, y: 96 },
      { x: 128, y: 96 },
      { x: 144, y: 96 },
    ];
    const bytes = serializeRingList(rings);
    // 3 rings × 4 bytes + 4 byte terminator = 16 bytes
    expect(bytes.length).toBe(16);
    // First ring should be x=128 (sorted)
    expect((bytes[0] << 8) | bytes[1]).toBe(128);
    expect((bytes[2] << 8) | bytes[3]).toBe(96);
    // Terminator
    expect(bytes[12]).toBe(0);
    expect(bytes[13]).toBe(0);
    expect(bytes[14]).toBe(0);
    expect(bytes[15]).toBe(0);
  });

  it('empty list is just terminator', () => {
    const bytes = serializeRingList([]);
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0);
  });

  it('parses ring list from binary', () => {
    const data = new Uint8Array([
      0x00, 0x80, 0x00, 0x60, // x=128, y=96
      0x00, 0xA0, 0x00, 0x60, // x=160, y=96
      0x00, 0x00, 0x00, 0x00, // terminator
    ]);
    const rings = parseRingList(data);
    expect(rings.length).toBe(2);
    expect(rings[0]).toEqual({ x: 128, y: 96 });
    expect(rings[1]).toEqual({ x: 160, y: 96 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/formats/s4-rings.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/formats/s4-rings.ts
import type { RingPlacement } from '../model/s4-types';

export function serializeRingList(rings: RingPlacement[]): Uint8Array {
  const sorted = [...rings].sort((a, b) => a.x - b.x || a.y - b.y);
  const data = new Uint8Array(sorted.length * 4 + 4); // +4 for dc.l 0 terminator
  let offset = 0;

  for (const ring of sorted) {
    data[offset] = (ring.x >> 8) & 0xFF;
    data[offset + 1] = ring.x & 0xFF;
    data[offset + 2] = (ring.y >> 8) & 0xFF;
    data[offset + 3] = ring.y & 0xFF;
    offset += 4;
  }

  // dc.l 0 terminator
  data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;

  return data;
}

export function parseRingList(data: Uint8Array): RingPlacement[] {
  const rings: RingPlacement[] = [];
  let offset = 0;

  while (offset + 4 <= data.length) {
    const word = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    if (word === 0) break; // dc.l 0 terminator
    const x = (data[offset] << 8) | data[offset + 1];
    const y = (data[offset + 2] << 8) | data[offset + 3];
    rings.push({ x, y });
    offset += 4;
  }

  return rings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/formats/s4-rings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/formats/s4-rings.ts test/formats/s4-rings.test.ts
git commit -m "feat: add S4 ring format (dc.w X,Y pairs)"
```

---

## Task 6: VRAM Graph-Coloring

**Files:**
- Create: `src/core/export/vram-coloring.ts`
- Test: `test/export/vram-coloring.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/export/vram-coloring.test.ts
import { describe, it, expect } from 'vitest';
import { computeVramBases } from '../src/core/export/vram-coloring';

describe('vram-coloring', () => {
  it('assigns different bases to horizontally adjacent sections', () => {
    // 3x1 grid: sec0, sec1, sec2
    const bases = computeVramBases(3, 1, [true, true, true]);
    expect(bases[0]).not.toBe(bases[1]);
    // sec0 and sec2 are NOT adjacent (sec1 is between them), so they CAN share
  });

  it('assigns different bases to vertically adjacent sections', () => {
    // 1x3 grid
    const bases = computeVramBases(1, 3, [true, true, true]);
    expect(bases[0]).not.toBe(bases[1]);
    expect(bases[1]).not.toBe(bases[2]);
  });

  it('checkerboards a 3x3 grid', () => {
    const bases = computeVramBases(3, 3, Array(9).fill(true));
    // Adjacent pairs should differ
    expect(bases[0]).not.toBe(bases[1]); // (0,0) vs (1,0)
    expect(bases[0]).not.toBe(bases[3]); // (0,0) vs (0,1)
    // Diagonal pairs CAN match
    expect(bases[0]).toBe(bases[4]); // (0,0) vs (1,1) — checkerboard
  });

  it('null sections get base 0', () => {
    // 2x1 grid, second section is null
    const bases = computeVramBases(2, 1, [true, false]);
    expect(bases[1]).toBe(0);
  });

  it('returns values that are multiples of 32 (byte addresses)', () => {
    const bases = computeVramBases(4, 3, Array(12).fill(true));
    for (const base of bases) {
      expect(base % 32).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/export/vram-coloring.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/export/vram-coloring.ts

const VRAM_BASE_A = 0 * 32;     // color 0: tile 0
const VRAM_BASE_B = 113 * 32;   // color 1: tile 113 ($0E20)

export function computeVramBases(
  gridWidth: number,
  gridHeight: number,
  activeSlots: boolean[],
): number[] {
  const count = gridWidth * gridHeight;
  const bases = new Array<number>(count).fill(0);

  for (let i = 0; i < count; i++) {
    if (!activeSlots[i]) {
      bases[i] = 0;
      continue;
    }

    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);

    // Checkerboard: (col + row) % 2 determines the color
    bases[i] = (col + row) % 2 === 0 ? VRAM_BASE_A : VRAM_BASE_B;
  }

  return bases;
}

export function generateVramBasesAsm(
  zonePrefix: string,
  bases: number[],
): string {
  const lines: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    const tileIndex = bases[i] / 32;
    lines.push(`${zonePrefix}_SEC${i}_VRAM = ${tileIndex} * 32   ; = $${bases[i].toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/export/vram-coloring.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export/vram-coloring.ts test/export/vram-coloring.test.ts
git commit -m "feat: add VRAM graph-coloring for section base assignment"
```

---

## Task 7: Tile Deduplication for Export

**Files:**
- Create: `src/core/export/tile-dedup.ts`
- Test: `test/export/tile-dedup.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/export/tile-dedup.test.ts
import { describe, it, expect } from 'vitest';
import { deduplicateSectionTiles } from '../src/core/export/tile-dedup';
import type { Tile } from '../src/core/model/s4-types';
import { packNametableWord } from '../src/core/model/s4-types';

describe('tile-dedup', () => {
  function makeTile(fill: number): Tile {
    const pixels = new Uint8Array(64).fill(fill);
    return { pixels };
  }

  it('deduplicates repeated tiles and remaps nametable', () => {
    const tiles: Tile[] = [
      makeTile(0), // tile 0 (blank)
      makeTile(1), // tile 1
      makeTile(1), // tile 2 = duplicate of tile 1
      makeTile(2), // tile 3
    ];

    // Nametable references tiles 1, 2, 3 (tile 2 is a dup of 1)
    const nametable = new Uint16Array(4);
    nametable[0] = packNametableWord(1, 0, false, false, false);
    nametable[1] = packNametableWord(2, 0, false, false, false);
    nametable[2] = packNametableWord(3, 1, true, false, false);
    nametable[3] = packNametableWord(0, 0, false, false, false);

    const result = deduplicateSectionTiles(nametable, tiles, 0x0E20);

    // Should have 3 unique tiles used: blank(0), fill-1, fill-2
    // Tile 2 maps to same deduplicated slot as tile 1
    expect(result.usedTiles.length).toBeLessThanOrEqual(3);

    // Remapped nametable should have absolute VRAM indices
    // All tile indices should be >= vramBase/32
    const baseSlot = 0x0E20 / 32;
    for (let i = 0; i < 4; i++) {
      const idx = result.remappedNametable[i] & 0x7FF;
      if (idx !== 0) { // skip empty tile
        expect(idx).toBeGreaterThanOrEqual(baseSlot);
      }
    }
  });

  it('handles empty nametable', () => {
    const tiles: Tile[] = [makeTile(0)];
    const nametable = new Uint16Array(4); // all zeros
    const result = deduplicateSectionTiles(nametable, tiles, 0);
    expect(result.usedTiles.length).toBe(0);
    expect(result.remappedNametable.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/export/tile-dedup.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/export/tile-dedup.ts
import type { Tile } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';

export interface DedupResult {
  usedTiles: Tile[];
  remappedNametable: Uint16Array;
  tileArtBytes: Uint8Array;
}

function tileHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) {
    s += pixels[i].toString(16);
  }
  return s;
}

function serializeTile(tile: Tile): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const hi = tile.pixels[row * 8 + col * 2] & 0xF;
      const lo = tile.pixels[row * 8 + col * 2 + 1] & 0xF;
      bytes[row * 4 + col] = (hi << 4) | lo;
    }
  }
  return bytes;
}

export function deduplicateSectionTiles(
  nametable: Uint16Array,
  allTiles: Tile[],
  vramBase: number,
): DedupResult {
  const vramBaseSlot = vramBase / 32;

  // Find which tile indices are actually used (non-zero entries)
  const usedIndices = new Set<number>();
  for (let i = 0; i < nametable.length; i++) {
    const entry = unpackNametableWord(nametable[i]);
    if (entry.tileIndex !== 0 || nametable[i] !== 0) {
      usedIndices.add(entry.tileIndex);
    }
  }

  // Deduplicate used tiles
  const hashToSlot = new Map<string, number>();
  const dedupedTiles: Tile[] = [];
  const originalToDeduped = new Map<number, number>();

  for (const idx of usedIndices) {
    if (idx >= allTiles.length) continue;
    const tile = allTiles[idx];
    const hash = tileHash(tile.pixels);

    if (hashToSlot.has(hash)) {
      originalToDeduped.set(idx, hashToSlot.get(hash)!);
    } else {
      const newSlot = dedupedTiles.length;
      hashToSlot.set(hash, newSlot);
      originalToDeduped.set(idx, newSlot);
      dedupedTiles.push(tile);
    }
  }

  // Remap nametable to absolute VRAM addresses
  const remapped = new Uint16Array(nametable.length);
  for (let i = 0; i < nametable.length; i++) {
    if (nametable[i] === 0) {
      remapped[i] = 0;
      continue;
    }
    const entry = unpackNametableWord(nametable[i]);
    const dedupSlot = originalToDeduped.get(entry.tileIndex);
    if (dedupSlot === undefined) {
      remapped[i] = 0;
      continue;
    }
    const absoluteIdx = vramBaseSlot + dedupSlot;
    remapped[i] = packNametableWord(absoluteIdx, entry.palette, entry.priority, entry.vFlip, entry.hFlip);
  }

  // Serialize tile art
  const tileArtBytes = new Uint8Array(dedupedTiles.length * 32);
  for (let i = 0; i < dedupedTiles.length; i++) {
    tileArtBytes.set(serializeTile(dedupedTiles[i]), i * 32);
  }

  return {
    usedTiles: dedupedTiles,
    remappedNametable: remapped,
    tileArtBytes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/export/tile-dedup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export/tile-dedup.ts test/export/tile-dedup.test.ts
git commit -m "feat: add tile deduplication for S4 section export"
```

---

## Task 8: Assembly Export — Entity Data

**Files:**
- Create: `src/core/export/entity-data.ts`
- Test: `test/export/entity-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/export/entity-data.test.ts
import { describe, it, expect } from 'vitest';
import { generateEntityDataAsm } from '../src/core/export/entity-data';
import type { ObjectPlacement, RingPlacement, ObjectDef } from '../src/core/model/s4-types';

describe('entity-data asm export', () => {
  it('generates ring list assembly', () => {
    const rings: RingPlacement[] = [
      { x: 128, y: 96 },
      { x: 160, y: 96 },
    ];
    const objects: ObjectPlacement[] = [];
    const objectLibrary: ObjectDef[] = [];
    const result = generateEntityDataAsm('OJZ', 0, rings, objects, objectLibrary);

    expect(result).toContain('OJZ_Sec0_Rings:');
    expect(result).toContain('dc.w $0080, $0060');
    expect(result).toContain('dc.w $00A0, $0060');
    expect(result).toContain('dc.l 0');
  });

  it('generates object list assembly with type table', () => {
    const rings: RingPlacement[] = [];
    const objects: ObjectPlacement[] = [
      { x: 512, y: 176, typeId: 'spring', subtype: 0 },
      { x: 256, y: 96, typeId: 'monitor', subtype: 3 },
    ];
    const objectLibrary: ObjectDef[] = [
      { id: 'spring', name: 'Spring', codeLabel: 'Obj_Spring', defaultSubtype: 0, properties: {} },
      { id: 'monitor', name: 'Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ];
    const result = generateEntityDataAsm('OJZ', 0, rings, objects, objectLibrary);

    expect(result).toContain('OJZ_Sec0_Objects:');
    expect(result).toContain('dc.l 0');
    expect(result).toContain('OJZ_Sec0_TypeTable:');
    expect(result).toContain('dc.b 2'); // count
    expect(result).toContain('Obj_Monitor');
    expect(result).toContain('Obj_Spring');
  });

  it('objects are X-sorted in output', () => {
    const objects: ObjectPlacement[] = [
      { x: 512, y: 176, typeId: 'a', subtype: 0 },
      { x: 256, y: 96, typeId: 'a', subtype: 0 },
    ];
    const objectLibrary: ObjectDef[] = [
      { id: 'a', name: 'A', codeLabel: 'Obj_A', defaultSubtype: 0, properties: {} },
    ];
    const result = generateEntityDataAsm('OJZ', 0, [], objects, objectLibrary);
    const lines = result.split('\n');
    const objLines = lines.filter(l => l.includes('dc.l') && l.includes('X='));
    // First object line should have smaller X
    expect(objLines[0]).toContain('X=$100'); // 256
  });

  it('throws if section exceeds 32 types', () => {
    const objects: ObjectPlacement[] = [];
    const objectLibrary: ObjectDef[] = [];
    for (let i = 0; i < 33; i++) {
      const id = `obj${i}`;
      objects.push({ x: i * 10, y: 0, typeId: id, subtype: 0 });
      objectLibrary.push({ id, name: `Obj${i}`, codeLabel: `Obj_${i}`, defaultSubtype: 0, properties: {} });
    }
    expect(() => generateEntityDataAsm('OJZ', 0, [], objects, objectLibrary)).toThrow(/32/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/export/entity-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/export/entity-data.ts
import type { ObjectPlacement, RingPlacement, ObjectDef } from '../model/s4-types';

export function generateEntityDataAsm(
  zonePrefix: string,
  sectionIndex: number,
  rings: RingPlacement[],
  objects: ObjectPlacement[],
  objectLibrary: ObjectDef[],
): string {
  const lines: string[] = [];
  const secLabel = `${zonePrefix}_Sec${sectionIndex}`;

  // --- Rings ---
  lines.push(`${secLabel}_Rings:`);
  const sortedRings = [...rings].sort((a, b) => a.x - b.x || a.y - b.y);
  for (const ring of sortedRings) {
    const xHex = ring.x.toString(16).toUpperCase().padStart(4, '0');
    const yHex = ring.y.toString(16).toUpperCase().padStart(4, '0');
    lines.push(`    dc.w $${xHex}, $${yHex}`);
  }
  lines.push('    dc.l 0               ; terminator');
  lines.push('');

  // --- Objects + Type Table ---
  const sortedObjects = [...objects].sort((a, b) => a.x - b.x);

  // Build type table from unique typeIds used
  const usedTypeIds: string[] = [];
  for (const obj of sortedObjects) {
    if (!usedTypeIds.includes(obj.typeId)) {
      usedTypeIds.push(obj.typeId);
    }
  }

  if (usedTypeIds.length > 32) {
    throw new Error(`Section ${sectionIndex} has ${usedTypeIds.length} unique object types (max 32)`);
  }

  // Type table
  lines.push(`${secLabel}_TypeTable:`);
  lines.push(`    dc.b ${usedTypeIds.length}       ; count`);
  lines.push('    dc.b 0           ; pad');
  for (const typeId of usedTypeIds) {
    const def = objectLibrary.find(d => d.id === typeId);
    const label = def?.codeLabel ?? `Obj_Unknown_${typeId}`;
    lines.push(`    dc.l ${label}    ; ${def?.name ?? typeId}`);
  }
  lines.push('');

  // Object list
  lines.push(`${secLabel}_Objects:`);
  for (const obj of sortedObjects) {
    const typeIndex = usedTypeIds.indexOf(obj.typeId);
    const xHex = obj.x.toString(16).toUpperCase().padStart(3, '0');
    const yHex = obj.y.toString(16).toUpperCase().padStart(3, '0');
    const packed = ((obj.x & 0x3FF) << 20) | ((obj.y & 0x3FF) << 10) | ((typeIndex & 0x1F) << 5) | (obj.subtype & 0x1F);
    const packedHex = packed.toString(16).toUpperCase().padStart(8, '0');
    const def = objectLibrary.find(d => d.id === obj.typeId);
    lines.push(`    dc.l $${packedHex}   ; X=$${xHex}, Y=$${yHex}, ${def?.name ?? obj.typeId}:${obj.subtype}`);
  }
  lines.push('    dc.l 0                                 ; terminator');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/export/entity-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export/entity-data.ts test/export/entity-data.test.ts
git commit -m "feat: add S4 entity data assembly export (rings, objects, type tables)"
```

---

## Task 9: Assembly Export — Act Descriptor

**Files:**
- Create: `src/core/export/act-descriptor.ts`
- Test: `test/export/act-descriptor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/export/act-descriptor.test.ts
import { describe, it, expect } from 'vitest';
import { generateActDescriptorAsm } from '../src/core/export/act-descriptor';
import type { Act, Section } from '../src/core/model/s4-types';
import { createSection } from '../src/core/model/s4-types';

describe('act-descriptor asm export', () => {
  it('generates act descriptor with section table', () => {
    const sections: (Section | null)[] = [
      createSection(0, 'Sec0'),
      createSection(1, 'Sec1'),
      null,
      createSection(3, 'Sec3'),
    ];
    const result = generateActDescriptorAsm('OJZ', 'Act1', {
      gridWidth: 2,
      gridHeight: 2,
      sections,
      startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
      parallaxRef: 'ParallaxConfig_OJZ_Default',
    });

    expect(result).toContain('OJZ_Act1_Descriptor:');
    expect(result).toContain('dc.l    OJZ_Act1_Sections');
    expect(result).toContain('dc.w    2                       ; grid_w');
    expect(result).toContain('dc.w    2                       ; grid_h');
    expect(result).toContain('dc.w    $0100                   ; start_local_x');
    expect(result).toContain('OJZ_Act1_Sections:');
    // Null section should have zeros
    expect(result).toContain('; --- Section 2 (null) ---');
  });

  it('null section exports as 72 zero bytes', () => {
    const sections: (Section | null)[] = [null];
    const result = generateActDescriptorAsm('OJZ', 'Act1', {
      gridWidth: 1,
      gridHeight: 1,
      sections,
      startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
      parallaxRef: null,
    });
    expect(result).toContain('dcb.b 72, 0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/export/act-descriptor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/export/act-descriptor.ts
import type { Section } from '../model/s4-types';

export interface ActDescriptorInput {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
  startPosition: { secX: number; secY: number; localX: number; localY: number };
  parallaxRef: string | null;
}

export function generateActDescriptorAsm(
  zonePrefix: string,
  actId: string,
  input: ActDescriptorInput,
): string {
  const { gridWidth, gridHeight, sections, startPosition, parallaxRef } = input;
  const label = `${zonePrefix}_${actId}`;
  const lines: string[] = [];

  // Act descriptor (34 bytes)
  lines.push(`${label}_Descriptor:`);
  lines.push(`    dc.l    ${label}_Sections       ; sec_grid_ptr`);
  lines.push(`    dc.w    ${gridWidth}                       ; grid_w`);
  lines.push(`    dc.w    ${gridHeight}                       ; grid_h`);
  lines.push(`    dc.w    $${startPosition.localX.toString(16).toUpperCase().padStart(4, '0')}                   ; start_local_x`);
  lines.push(`    dc.w    $${startPosition.localY.toString(16).toUpperCase().padStart(4, '0')}                   ; start_local_y`);
  lines.push(`    dc.b    ${startPosition.secX}                       ; start_sec_x`);
  lines.push(`    dc.b    ${startPosition.secY}                       ; start_sec_y`);
  lines.push(`    dc.w    SLOT_ORIGIN_L           ; cam_min_x`);
  lines.push(`    dc.w    SLOT_ORIGIN_L + (${gridWidth} * SECTION_SIZE) - SCREEN_WIDTH ; cam_max_x`);
  lines.push(`    dc.w    SLOT_ORIGIN_U           ; cam_min_y`);
  lines.push(`    dc.w    SLOT_ORIGIN_U + (${gridHeight} * SECTION_SIZE) - 224 ; cam_max_y`);
  lines.push(`    dc.l    ${label}_BG_Layout      ; act_bg_layout`);
  lines.push(`    dc.l    ${label}_BG_Tiles       ; act_bg_tiles`);
  lines.push(`    dc.l    ${parallaxRef ?? '0'}    ; act_parallax_config`);
  lines.push('');

  // Section table
  lines.push(`${label}_Sections:`);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);

    if (!section) {
      lines.push(`; --- Section ${i} (null) ---`);
      lines.push(`    dcb.b 72, 0`);
      continue;
    }

    const secLabel = `${zonePrefix}_Sec${i}`;
    lines.push(`; --- Section ${i} (${col},${row}) — flat_id ${i} ---`);
    lines.push(`${secLabel}:`);
    lines.push(`    dc.l    ${secLabel}_Blocks           ; sec_block_index`);
    lines.push(`    dc.l    ${secLabel}_Objects          ; sec_objects`);
    lines.push(`    dc.l    ${secLabel}_Rings            ; sec_rings`);
    lines.push(`    dc.l    0                         ; sec_plc`);
    lines.push(`    dc.l    ${section.paletteRef ?? `${zonePrefix}_Palette`}  ; sec_pal`);
    lines.push(`    dc.l    ${section.parallaxRef ?? '0'}  ; sec_parallax_config`);
    lines.push(`    dc.l    0                         ; sec_raster_table`);
    lines.push(`    dc.l    ${section.bgLayoutRef ?? '0'}  ; sec_bg_layout`);
    lines.push(`    dc.l    ${secLabel}_TypeTable        ; sec_type_table`);
    lines.push(`    dc.l    0                         ; sec_pal_cycle`);
    lines.push(`    dc.l    0                         ; sec_sound_bank`);
    lines.push(`    dc.l    0                         ; sec_reserved_2C`);
    lines.push(`    dc.l    0                         ; sec_anim_blocks`);
    lines.push(`    dc.l    0                         ; sec_collision_s4lz`);
    lines.push(`    dc.w    ${section.flags}                         ; sec_flags`);
    lines.push(`    dc.w    ${section.music}                         ; sec_music`);
    lines.push(`    dc.b    0, 0, 0, 0               ; reserved bytes`);
    lines.push(`    dc.l    ${secLabel}_Tiles_S4LZ       ; sec_tile_art_s4lz`);
    lines.push(`    dc.w    ${zonePrefix}_SEC${i}_VRAM   ; sec_tile_art_vram`);
    lines.push(`    dc.w    0                         ; pad`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/export/act-descriptor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export/act-descriptor.ts test/export/act-descriptor.test.ts
git commit -m "feat: add S4 act descriptor assembly export"
```

---

## Task 10: S4 Project Config

**Files:**
- Create: `src/core/config/s4-config.ts`
- Test: `test/config/s4-config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/config/s4-config.test.ts
import { describe, it, expect } from 'vitest';
import { loadS4Config, type S4ProjectConfig } from '../src/core/config/s4-config';

describe('s4-config', () => {
  it('loads a valid project config', () => {
    const json: S4ProjectConfig = {
      name: 'Sonic 4',
      engine: 's4',
      zones: [{
        id: 'ojz',
        name: 'Orange Juice Zone',
        tileset: 'data/tiles/ojz_tiles.bin',
        palette: 'data/palettes/ojz_palette.bin',
        acts: [{
          id: 'act1',
          gridWidth: 4,
          gridHeight: 3,
          dataPath: 'data/levels/ojz/act1/',
          bgLayout: 'data/bg/ojz_bg.bin',
          bgTiles: 'data/bg/ojz_bg_tiles.bin',
          parallax: 'data/parallax/ojz_default.asm',
          startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
        }],
      }],
      objectLibrary: 'data/objdefs/objects.json',
      chunkLibrary: 'data/chunks/chunks.json',
    };
    const config = loadS4Config(json, '/project');
    expect(config.name).toBe('Sonic 4');
    expect(config.basePath).toBe('/project');
    expect(config.zones.length).toBe(1);
    expect(config.zones[0].acts[0].gridWidth).toBe(4);
  });

  it('rejects config with missing required fields', () => {
    expect(() => loadS4Config({} as any, '/project')).toThrow();
  });

  it('rejects non-s4 engine', () => {
    const json = { name: 'Test', engine: 's2', zones: [] };
    expect(() => loadS4Config(json as any, '/project')).toThrow(/s4/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config/s4-config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/config/s4-config.ts

export interface S4ActConfig {
  id: string;
  gridWidth: number;
  gridHeight: number;
  dataPath: string;
  bgLayout: string;
  bgTiles: string;
  parallax: string | null;
  startPosition: { secX: number; secY: number; localX: number; localY: number };
}

export interface S4ZoneConfig {
  id: string;
  name: string;
  tileset: string;
  palette: string;
  acts: S4ActConfig[];
}

export interface S4ProjectConfig {
  name: string;
  engine: string;
  zones: S4ZoneConfig[];
  objectLibrary: string;
  chunkLibrary: string;
}

export interface LoadedS4Config {
  name: string;
  engine: 's4';
  basePath: string;
  zones: S4ZoneConfig[];
  objectLibraryPath: string;
  chunkLibraryPath: string;
}

export function loadS4Config(json: S4ProjectConfig, basePath: string): LoadedS4Config {
  if (!json.name) throw new Error('Project config missing "name"');
  if (json.engine !== 's4') throw new Error(`Expected engine "s4", got "${json.engine}"`);
  if (!json.zones || !Array.isArray(json.zones)) throw new Error('Project config missing "zones" array');

  for (const zone of json.zones) {
    if (!zone.id) throw new Error('Zone missing "id"');
    if (!zone.tileset) throw new Error(`Zone "${zone.id}" missing "tileset"`);
    if (!zone.palette) throw new Error(`Zone "${zone.id}" missing "palette"`);
    for (const act of zone.acts) {
      if (!act.id) throw new Error(`Act missing "id" in zone "${zone.id}"`);
      if (!act.gridWidth || !act.gridHeight) throw new Error(`Act "${act.id}" missing grid dimensions`);
      if (!act.dataPath) throw new Error(`Act "${act.id}" missing "dataPath"`);
    }
  }

  return {
    name: json.name,
    engine: 's4',
    basePath,
    zones: json.zones,
    objectLibraryPath: json.objectLibrary || '',
    chunkLibraryPath: json.chunkLibrary || '',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/config/s4-config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/config/s4-config.ts test/config/s4-config.test.ts
git commit -m "feat: add S4 project config schema and loader"
```

---

## Task 11: Editing Commands for Tile Painting

**Files:**
- Modify: `src/core/editing/commands.ts`
- Modify: `src/core/editing/history.ts`
- Test: `test/editing/tile-commands.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/editing/tile-commands.test.ts
import { describe, it, expect } from 'vitest';
import { EditHistory } from '../src/core/editing/history';
import type { S4Level } from '../src/core/editing/commands';
import { createSection } from '../src/core/model/s4-types';

describe('tile painting commands', () => {
  function makeLevel(): S4Level {
    return {
      sections: [createSection(0, 'Test')],
    };
  }

  it('set-tile command sets nametable and collision', () => {
    const history = new EditHistory();
    const level = makeLevel();
    history.execute({
      type: 'set-tiles',
      description: 'Paint tile',
      sectionIndex: 0,
      entries: [{ index: 0, oldNt: 0, newNt: 0x802A, oldColl: 0, newColl: 5 }],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x802A);
    expect(level.sections[0]!.tileGrid.collision[0]).toBe(5);
  });

  it('undo restores previous values', () => {
    const history = new EditHistory();
    const level = makeLevel();
    level.sections[0]!.tileGrid.nametable[0] = 0x1234;
    level.sections[0]!.tileGrid.collision[0] = 3;

    history.execute({
      type: 'set-tiles',
      description: 'Paint tile',
      sectionIndex: 0,
      entries: [{ index: 0, oldNt: 0x1234, newNt: 0x802A, oldColl: 3, newColl: 5 }],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x802A);

    history.undo(level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(0x1234);
    expect(level.sections[0]!.tileGrid.collision[0]).toBe(3);
  });

  it('batch set-tiles handles multiple entries', () => {
    const history = new EditHistory();
    const level = makeLevel();
    history.execute({
      type: 'set-tiles',
      description: 'Paint block',
      sectionIndex: 0,
      entries: [
        { index: 0, oldNt: 0, newNt: 1, oldColl: 0, newColl: 1 },
        { index: 1, oldNt: 0, newNt: 2, oldColl: 0, newColl: 2 },
        { index: 256, oldNt: 0, newNt: 3, oldColl: 0, newColl: 3 },
      ],
    }, level);
    expect(level.sections[0]!.tileGrid.nametable[0]).toBe(1);
    expect(level.sections[0]!.tileGrid.nametable[1]).toBe(2);
    expect(level.sections[0]!.tileGrid.nametable[256]).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/editing/tile-commands.test.ts`
Expected: FAIL — imports don't resolve

- [ ] **Step 3: Rewrite commands.ts for S4**

```typescript
// src/core/editing/commands.ts
import type { ObjectPlacement, RingPlacement, Section } from '../model/s4-types';

export interface S4Level {
  sections: (Section | null)[];
}

export interface EditCommand {
  type: string;
  description: string;
  sectionIndex: number;
}

export interface SetTilesCommand extends EditCommand {
  type: 'set-tiles';
  entries: Array<{ index: number; oldNt: number; newNt: number; oldColl: number; newColl: number }>;
}

export interface SetCollisionCommand extends EditCommand {
  type: 'set-collision';
  entries: Array<{ index: number; oldColl: number; newColl: number }>;
}

export interface MoveObjectCommand extends EditCommand {
  type: 'move-object';
  objectIndex: number;
  oldX: number; oldY: number;
  newX: number; newY: number;
}

export interface AddObjectCommand extends EditCommand {
  type: 'add-object';
  object: ObjectPlacement;
}

export interface DeleteObjectCommand extends EditCommand {
  type: 'delete-object';
  objectIndex: number;
  object: ObjectPlacement;
}

export interface MoveRingCommand extends EditCommand {
  type: 'move-ring';
  ringIndex: number;
  oldX: number; oldY: number;
  newX: number; newY: number;
}

export interface AddRingCommand extends EditCommand {
  type: 'add-ring';
  ring: RingPlacement;
}

export interface AddRingsCommand extends EditCommand {
  type: 'add-rings';
  rings: RingPlacement[];
}

export interface DeleteRingCommand extends EditCommand {
  type: 'delete-ring';
  ringIndex: number;
  ring: RingPlacement;
}

export interface MoveObjectsCommand extends EditCommand {
  type: 'move-objects';
  moves: Array<{ objectIndex: number; oldX: number; oldY: number; newX: number; newY: number }>;
}

export interface MoveRingsCommand extends EditCommand {
  type: 'move-rings';
  moves: Array<{ ringIndex: number; oldX: number; oldY: number; newX: number; newY: number }>;
}

export interface DeleteObjectsCommand extends EditCommand {
  type: 'delete-objects';
  items: Array<{ objectIndex: number; object: ObjectPlacement }>;
}

export interface DeleteRingsCommand extends EditCommand {
  type: 'delete-rings';
  items: Array<{ ringIndex: number; ring: RingPlacement }>;
}

export type AnyCommand =
  | SetTilesCommand
  | SetCollisionCommand
  | MoveObjectCommand
  | AddObjectCommand
  | DeleteObjectCommand
  | MoveRingCommand
  | AddRingCommand
  | AddRingsCommand
  | DeleteRingCommand
  | MoveObjectsCommand
  | MoveRingsCommand
  | DeleteObjectsCommand
  | DeleteRingsCommand;
```

- [ ] **Step 4: Rewrite history.ts for S4**

```typescript
// src/core/editing/history.ts
import type { AnyCommand, S4Level } from './commands';

const MAX_HISTORY = 200;

export class EditHistory {
  private undoStack: AnyCommand[] = [];
  private redoStack: AnyCommand[] = [];
  private listeners: Array<() => void> = [];

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notify(): void { for (const l of this.listeners) l(); }

  execute(command: AnyCommand, level: S4Level): void {
    applyCommand(command, level);
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  undo(level: S4Level): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    undoCommand(cmd, level);
    this.redoStack.push(cmd);
    this.notify();
  }

  redo(level: S4Level): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    applyCommand(cmd, level);
    this.undoStack.push(cmd);
    this.notify();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }
}

function applyCommand(cmd: AnyCommand, level: S4Level): void {
  const section = level.sections[cmd.sectionIndex];
  if (!section) return;

  switch (cmd.type) {
    case 'set-tiles':
      for (const e of cmd.entries) {
        section.tileGrid.nametable[e.index] = e.newNt;
        section.tileGrid.collision[e.index] = e.newColl;
      }
      break;
    case 'set-collision':
      for (const e of cmd.entries) {
        section.tileGrid.collision[e.index] = e.newColl;
      }
      break;
    case 'move-object': {
      const obj = section.objects[cmd.objectIndex];
      if (obj) { obj.x = cmd.newX; obj.y = cmd.newY; }
      break;
    }
    case 'add-object':
      section.objects.push({ ...cmd.object });
      break;
    case 'delete-object':
      section.objects.splice(cmd.objectIndex, 1);
      break;
    case 'move-ring': {
      const ring = section.rings[cmd.ringIndex];
      if (ring) { ring.x = cmd.newX; ring.y = cmd.newY; }
      break;
    }
    case 'add-ring':
      section.rings.push({ ...cmd.ring });
      break;
    case 'add-rings':
      for (const r of cmd.rings) section.rings.push({ ...r });
      break;
    case 'delete-ring':
      section.rings.splice(cmd.ringIndex, 1);
      break;
    case 'move-objects':
      for (const m of cmd.moves) {
        const obj = section.objects[m.objectIndex];
        if (obj) { obj.x = m.newX; obj.y = m.newY; }
      }
      break;
    case 'move-rings':
      for (const m of cmd.moves) {
        const ring = section.rings[m.ringIndex];
        if (ring) { ring.x = m.newX; ring.y = m.newY; }
      }
      break;
    case 'delete-objects': {
      const indices = cmd.items.map(i => i.objectIndex).sort((a, b) => b - a);
      for (const idx of indices) section.objects.splice(idx, 1);
      break;
    }
    case 'delete-rings': {
      const indices = cmd.items.map(i => i.ringIndex).sort((a, b) => b - a);
      for (const idx of indices) section.rings.splice(idx, 1);
      break;
    }
  }
}

function undoCommand(cmd: AnyCommand, level: S4Level): void {
  const section = level.sections[cmd.sectionIndex];
  if (!section) return;

  switch (cmd.type) {
    case 'set-tiles':
      for (const e of cmd.entries) {
        section.tileGrid.nametable[e.index] = e.oldNt;
        section.tileGrid.collision[e.index] = e.oldColl;
      }
      break;
    case 'set-collision':
      for (const e of cmd.entries) {
        section.tileGrid.collision[e.index] = e.oldColl;
      }
      break;
    case 'move-object': {
      const obj = section.objects[cmd.objectIndex];
      if (obj) { obj.x = cmd.oldX; obj.y = cmd.oldY; }
      break;
    }
    case 'add-object':
      section.objects.pop();
      break;
    case 'delete-object':
      section.objects.splice(cmd.objectIndex, 0, { ...cmd.object });
      break;
    case 'move-ring': {
      const ring = section.rings[cmd.ringIndex];
      if (ring) { ring.x = cmd.oldX; ring.y = cmd.oldY; }
      break;
    }
    case 'add-ring':
      section.rings.pop();
      break;
    case 'add-rings':
      section.rings.splice(section.rings.length - cmd.rings.length, cmd.rings.length);
      break;
    case 'delete-ring':
      section.rings.splice(cmd.ringIndex, 0, { ...cmd.ring });
      break;
    case 'move-objects':
      for (const m of cmd.moves) {
        const obj = section.objects[m.objectIndex];
        if (obj) { obj.x = m.oldX; obj.y = m.oldY; }
      }
      break;
    case 'move-rings':
      for (const m of cmd.moves) {
        const ring = section.rings[m.ringIndex];
        if (ring) { ring.x = m.oldX; ring.y = m.oldY; }
      }
      break;
    case 'delete-objects': {
      const sorted = [...cmd.items].sort((a, b) => a.objectIndex - b.objectIndex);
      for (const item of sorted) section.objects.splice(item.objectIndex, 0, { ...item.object });
      break;
    }
    case 'delete-rings': {
      const sorted = [...cmd.items].sort((a, b) => a.ringIndex - b.ringIndex);
      for (const item of sorted) section.rings.splice(item.ringIndex, 0, { ...item.ring });
      break;
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/editing/tile-commands.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/editing/commands.ts src/core/editing/history.ts test/editing/tile-commands.test.ts
git commit -m "feat: rewrite editing commands for S4 tile painting"
```

---

## Task 12: Section Renderer (Canvas)

**Files:**
- Create: `src/renderer/canvas/SectionRenderer.ts`

- [ ] **Step 1: Write the SectionRenderer**

```typescript
// src/renderer/canvas/SectionRenderer.ts
import type { Tile, PaletteLine, SectionTileGrid } from '../../core/model/s4-types';
import { unpackNametableWord, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { TileRenderer } from './TileRenderer';

export interface SectionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export class SectionRenderer {
  private tileRenderer = new TileRenderer();
  private tileGrid: SectionTileGrid | null = null;
  private dirtyTiles = new Set<number>();
  private sectionCanvas: OffscreenCanvas | null = null;
  private sectionCtx: OffscreenCanvasRenderingContext2D | null = null;

  loadTileset(tiles: Tile[], paletteLines: PaletteLine[]): void {
    this.tileRenderer.prerender(tiles, paletteLines);
  }

  loadSection(tileGrid: SectionTileGrid): void {
    this.tileGrid = tileGrid;
    const pixelW = SECTION_TILES_WIDE * 8;
    const pixelH = SECTION_TILES_HIGH * 8;
    this.sectionCanvas = new OffscreenCanvas(pixelW, pixelH);
    this.sectionCtx = this.sectionCanvas.getContext('2d')!;
    this.sectionCtx.imageSmoothingEnabled = false;
    this.renderFullSection();
  }

  markDirty(tileIndices: number[]): void {
    for (const idx of tileIndices) this.dirtyTiles.add(idx);
  }

  markAllDirty(): void {
    if (!this.tileGrid) return;
    for (let i = 0; i < this.tileGrid.nametable.length; i++) {
      this.dirtyTiles.add(i);
    }
  }

  flushDirty(): void {
    if (!this.tileGrid || !this.sectionCtx) return;
    for (const idx of this.dirtyTiles) {
      this.renderTileAt(idx);
    }
    this.dirtyTiles.clear();
  }

  private renderFullSection(): void {
    if (!this.tileGrid || !this.sectionCtx) return;
    for (let i = 0; i < this.tileGrid.nametable.length; i++) {
      this.renderTileAt(i);
    }
  }

  private renderTileAt(index: number): void {
    if (!this.tileGrid || !this.sectionCtx) return;
    const word = this.tileGrid.nametable[index];
    const col = index % SECTION_TILES_WIDE;
    const row = Math.floor(index / SECTION_TILES_WIDE);
    const px = col * 8;
    const py = row * 8;

    if (word === 0) {
      this.sectionCtx.clearRect(px, py, 8, 8);
      return;
    }

    const entry = unpackNametableWord(word);
    const tileImage = this.tileRenderer.get(entry.tileIndex, entry.palette);
    if (!tileImage) {
      this.sectionCtx.clearRect(px, py, 8, 8);
      return;
    }

    this.sectionCtx.save();
    this.sectionCtx.translate(px + (entry.hFlip ? 8 : 0), py + (entry.vFlip ? 8 : 0));
    this.sectionCtx.scale(entry.hFlip ? -1 : 1, entry.vFlip ? -1 : 1);
    this.sectionCtx.putImageData(tileImage, 0, 0);
    this.sectionCtx.restore();
  }

  render(
    ctx: CanvasRenderingContext2D,
    viewport: SectionViewport,
  ): void {
    if (!this.sectionCanvas) return;

    this.flushDirty();

    const { x: vpX, y: vpY, width, height, zoom } = viewport;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);
    ctx.drawImage(this.sectionCanvas, 0, 0);
    ctx.restore();
  }

  getCanvas(): OffscreenCanvas | null {
    return this.sectionCanvas;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/renderer/canvas/SectionRenderer.ts`
Expected: No errors (or only errors from unupdated dependent files)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/canvas/SectionRenderer.ts
git commit -m "feat: add SectionRenderer for flat 256x256 tile grid"
```

---

## Task 13: Remove S2/S3K Format Layer

**Files:**
- Remove: `src/core/compression/kosinski.ts`, `src/core/compression/nemesis.ts`, `src/core/compression/index.ts`
- Remove: `src/core/formats/blocks.ts`, `src/core/formats/chunks.ts`, `src/core/formats/layout.ts`
- Remove: `src/core/formats/serialize.ts`, `src/core/formats/serialize-art.ts`
- Remove: `src/core/config/ini-migrator.ts`
- Remove: `src/core/import/chunk-builder.ts`, `src/core/import/block-dedup.ts`
- Remove: `src/renderer/canvas/BlockRenderer.ts`, `src/renderer/canvas/ChunkRenderer.ts`
- Remove: Old test files for removed modules

- [ ] **Step 1: Remove S2/S3K source files**

```bash
rm src/core/compression/kosinski.ts src/core/compression/nemesis.ts src/core/compression/index.ts
rm src/core/formats/blocks.ts src/core/formats/chunks.ts src/core/formats/layout.ts
rm src/core/formats/serialize.ts src/core/formats/serialize-art.ts
rm src/core/config/ini-migrator.ts
rm src/core/import/chunk-builder.ts src/core/import/block-dedup.ts
rm src/renderer/canvas/BlockRenderer.ts src/renderer/canvas/ChunkRenderer.ts
```

- [ ] **Step 2: Remove old test files**

```bash
rm test/compression/kosinski.test.ts
rm test/formats/blocks.test.ts test/formats/chunks.test.ts test/formats/layout.test.ts
rm test/config/ini-migrator.test.ts
rm test/import/chunk-builder.test.ts
```

- [ ] **Step 3: Update src/core/model/types.ts to re-export from s4-types**

Replace `src/core/model/types.ts` content with:
```typescript
// Re-export S4 types as the canonical model
export type {
  Tile,
  Color,
  PaletteLine,
  Palette,
  Section,
  SectionTileGrid,
  ObjectPlacement,
  RingPlacement,
  ChunkDef,
  ObjectDef,
  Tileset,
  Act,
  Zone,
  S4Project,
} from './s4-types';

export {
  createSection,
  createSectionTileGrid,
  createChunkDef,
  packNametableWord,
  unpackNametableWord,
  SECTION_TILES_WIDE,
  SECTION_TILES_HIGH,
  SECTION_PIXEL_SIZE,
  BLOCK_TILES,
  BLOCK_PIXEL_SIZE,
  BLOCKS_PER_SECTION,
  SF_HAS_WATER,
  SF_UNDERGROUND,
  SF_NO_Y_WRAP,
  SF_PRESERVE_STATE,
} from './s4-types';
```

- [ ] **Step 4: Verify tests pass for new modules**

Run: `npx vitest run test/model test/formats/s4-*.test.ts test/export`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove S2/S3K format layer, wire types.ts to S4 model"
```

---

## Task 14: Update Editor Store for S4 Tools

**Files:**
- Modify: `src/renderer/state/editorStore.ts`

- [ ] **Step 1: Rewrite editorStore for S4 tools**

```typescript
// src/renderer/state/editorStore.ts
import { create } from 'zustand';
import { EditHistory } from '../../core/editing/history';
import type { AnyCommand, S4Level } from '../../core/editing/commands';

export type EditorTool =
  | 'view'
  | 'select'
  | 'paint-tile'
  | 'paint-block'
  | 'stamp-chunk'
  | 'paint-collision'
  | 'eraser'
  | 'place-object'
  | 'place-ring';

export interface Selection {
  type: 'object' | 'ring';
  sectionIndex: number;
  index: number;
}

export interface MultiSelection {
  sectionIndex: number;
  objects: number[];
  rings: number[];
}

export interface RingPattern {
  name: string;
  offsets: Array<{ dx: number; dy: number }>;
}

export const RING_PATTERNS: RingPattern[] = [
  { name: 'Single', offsets: [{ dx: 0, dy: 0 }] },
  { name: 'H×2', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }] },
  { name: 'H×3', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }] },
  { name: 'H×4', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }] },
  { name: 'H×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: i * 24, dy: 0 })) },
  { name: 'V×2', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }] },
  { name: 'V×3', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }] },
  { name: 'V×4', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }] },
  { name: 'V×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: 0, dy: i * 24 })) },
  { name: 'Diamond', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 48, dy: 24 }, { dx: 24, dy: 48 },
  ]},
  { name: '2×2 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 },
  ]},
  { name: '3×3 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 },
    { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
    { dx: 0, dy: 48 }, { dx: 24, dy: 48 }, { dx: 48, dy: 48 },
  ]},
];

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  multiSelection: MultiSelection | null;
  dirty: boolean;
  historyVersion: number;
  activeSectionIndex: number;
  selectedTileIndex: number;
  selectedPaletteLine: number;
  selectedChunkId: string | null;
  selectedObjectTypeId: string | null;
  selectedObjectSubtype: number;
  selectedRingPattern: number;
  selectedCollisionType: number;

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setMultiSelection: (ms: MultiSelection | null) => void;
  setActiveSectionIndex: (index: number) => void;
  setSelectedTile: (tileIndex: number, paletteLine: number) => void;
  setSelectedChunk: (id: string | null) => void;
  setSelectedObjectType: (id: string | null, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  setSelectedCollisionType: (type: number) => void;
  markDirty: () => void;
  markClean: () => void;
  bumpVersion: () => void;
}

export const editHistory = new EditHistory();

export const useEditorStore = create<EditorState>((set) => ({
  tool: 'view',
  selection: null,
  multiSelection: null,
  dirty: false,
  historyVersion: 0,
  activeSectionIndex: 0,
  selectedTileIndex: 0,
  selectedPaletteLine: 0,
  selectedChunkId: null,
  selectedObjectTypeId: null,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,
  selectedCollisionType: 1,

  setTool: (tool) => set({ tool, selection: null, multiSelection: null }),
  setSelection: (selection) => set({ selection, multiSelection: null }),
  setMultiSelection: (multiSelection) => set({ multiSelection, selection: null }),
  setActiveSectionIndex: (index) => set({ activeSectionIndex: index }),
  setSelectedTile: (tileIndex, paletteLine) => set({ selectedTileIndex: tileIndex, selectedPaletteLine: paletteLine }),
  setSelectedChunk: (id) => set({ selectedChunkId: id }),
  setSelectedObjectType: (id, subtype) => set({ selectedObjectTypeId: id, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  setSelectedCollisionType: (type) => set({ selectedCollisionType: type }),
  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  bumpVersion: () => set((s) => ({ historyVersion: s.historyVersion + 1 })),
}));

export function executeCommand(command: AnyCommand, level: S4Level): void {
  editHistory.execute(command, level);
  useEditorStore.getState().markDirty();
  useEditorStore.getState().bumpVersion();
}

export function undo(level: S4Level): void {
  editHistory.undo(level);
  useEditorStore.getState().bumpVersion();
}

export function redo(level: S4Level): void {
  editHistory.redo(level);
  useEditorStore.getState().bumpVersion();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/state/editorStore.ts
git commit -m "feat: update editor store for S4 tools (tile/block/chunk/collision)"
```

---

## Task 15: Update View Store for Grid Overlays

**Files:**
- Modify: `src/renderer/state/viewStore.ts`

- [ ] **Step 1: Add grid overlay toggles**

```typescript
// src/renderer/state/viewStore.ts
import { create } from 'zustand';

export interface OverlayOptions {
  showObjects: boolean;
  showRings: boolean;
  showTileGrid: boolean;
  showBlockGrid: boolean;
  showChunkGrid: boolean;
  showCollision: boolean;
  showBgPlane: boolean;
}

interface ViewState {
  vpX: number;
  vpY: number;
  zoom: number;
  overlays: OverlayOptions;

  pan: (dx: number, dy: number) => void;
  setZoom: (zoom: number, centerX?: number, centerY?: number) => void;
  setPosition: (x: number, y: number) => void;
  toggleOverlay: (key: keyof OverlayOptions) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  vpX: 0,
  vpY: 0,
  zoom: 1,

  overlays: {
    showObjects: true,
    showRings: true,
    showTileGrid: false,
    showBlockGrid: true,
    showChunkGrid: false,
    showCollision: false,
    showBgPlane: false,
  },

  pan: (dx, dy) => set((state) => ({
    vpX: Math.max(0, state.vpX - dx / state.zoom),
    vpY: Math.max(0, state.vpY - dy / state.zoom),
  })),

  setZoom: (zoom, centerX, centerY) => set((state) => {
    const newZoom = Math.max(0.125, Math.min(8, zoom));
    if (centerX !== undefined && centerY !== undefined) {
      const worldX = state.vpX + centerX / state.zoom;
      const worldY = state.vpY + centerY / state.zoom;
      return {
        zoom: newZoom,
        vpX: Math.max(0, worldX - centerX / newZoom),
        vpY: Math.max(0, worldY - centerY / newZoom),
      };
    }
    return { zoom: newZoom };
  }),

  setPosition: (x, y) => set({ vpX: Math.max(0, x), vpY: Math.max(0, y) }),

  toggleOverlay: (key) => set((state) => ({
    overlays: { ...state.overlays, [key]: !state.overlays[key] },
  })),
}));
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/state/viewStore.ts
git commit -m "feat: add tile/block/chunk/collision grid overlay toggles"
```

---

## Task 16: Update Project Store for S4

**Files:**
- Modify: `src/renderer/state/projectStore.ts`

- [ ] **Step 1: Rewrite projectStore for S4 model**

```typescript
// src/renderer/state/projectStore.ts
import { create } from 'zustand';
import type { LoadedS4Config } from '../../core/config/s4-config';
import type { S4Project, Zone, Act, Tileset, Palette, ObjectDef, ChunkDef } from '../../core/model/s4-types';

interface ProjectState {
  config: LoadedS4Config | null;
  project: S4Project | null;
  currentZoneId: string | null;
  currentActId: string | null;
  loading: boolean;
  error: string | null;
  objectSprites: Map<string, ImageBitmap>;

  setConfig: (config: LoadedS4Config) => void;
  setProject: (project: S4Project) => void;
  setCurrentAct: (zoneId: string, actId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setObjectSprites: (sprites: Map<string, ImageBitmap>) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  config: null,
  project: null,
  currentZoneId: null,
  currentActId: null,
  loading: false,
  error: null,
  objectSprites: new Map(),

  setConfig: (config) => set({ config, error: null }),
  setProject: (project) => set({ project }),
  setCurrentAct: (zoneId, actId) => set({ currentZoneId: zoneId, currentActId: actId, loading: false }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setObjectSprites: (objectSprites) => set({ objectSprites }),
  reset: () => set({ config: null, project: null, currentZoneId: null, currentActId: null, loading: false, error: null, objectSprites: new Map() }),
}));

// Convenience selectors
export function getCurrentZone(state: ProjectState): Zone | null {
  if (!state.project || !state.currentZoneId) return null;
  return state.project.zones.find(z => z.id === state.currentZoneId) ?? null;
}

export function getCurrentAct(state: ProjectState): Act | null {
  const zone = getCurrentZone(state);
  if (!zone || !state.currentActId) return null;
  return zone.acts.find(a => a.id === state.currentActId) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/state/projectStore.ts
git commit -m "feat: update project store for S4 zone/act/section model"
```

---

## Task 17: Tile Parsing (keep existing, adapt)

The existing `src/core/formats/tiles.ts` and `test/formats/tiles.test.ts` parse Genesis 4bpp tiles correctly and are format-agnostic. Keep them as-is — they work for S4 since tile data format is the same (32 bytes per 8×8 tile, no compression in the editor layer).

Similarly, keep `src/core/formats/palette.ts` and `test/formats/palette.test.ts` — palette format is unchanged.

- [ ] **Step 1: Verify existing tile and palette tests still pass**

Run: `npx vitest run test/formats/tiles.test.ts test/formats/palette.test.ts`
Expected: PASS

- [ ] **Step 2: Commit (no-op if nothing changed)**

No commit needed — just verification.

---

## Task 18: Full Export Pipeline Orchestrator

**Files:**
- Create: `src/core/export/index.ts`
- Test: `test/export/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/export/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { exportAct, type ExportResult } from '../src/core/export/index';
import { createSection, type Act, type Tileset, type Tile, type Palette, type ObjectDef } from '../src/core/model/s4-types';

describe('export pipeline', () => {
  function makeTile(fill: number): Tile {
    return { pixels: new Uint8Array(64).fill(fill) };
  }

  function makeTestAct(): { act: Act; tileset: Tileset; palette: Palette; objectLibrary: ObjectDef[] } {
    const sec0 = createSection(0, 'Sec0');
    sec0.tileGrid.nametable[0] = 0x0001; // tile 1, no flags
    sec0.rings.push({ x: 128, y: 96 });
    sec0.objects.push({ x: 256, y: 100, typeId: 'spring', subtype: 0 });

    const act: Act = {
      id: 'act1',
      gridWidth: 2,
      gridHeight: 1,
      sections: [sec0, null],
      startPosition: { secX: 0, secY: 0, localX: 256, localY: 256 },
      bgLayout: null,
      bgTiles: null,
      parallaxRef: null,
    };

    const tileset: Tileset = {
      tiles: [makeTile(0), makeTile(1)],
      collisionTypes: new Uint8Array([0, 5]),
    };

    const palette: Palette = { lines: [{ colors: Array(16).fill({ r: 0, g: 0, b: 0, a: 255 }) }] };
    const objectLibrary: ObjectDef[] = [
      { id: 'spring', name: 'Spring', codeLabel: 'Obj_Spring', defaultSubtype: 0, properties: {} },
    ];

    return { act, tileset, palette, objectLibrary };
  }

  it('produces expected output files', () => {
    const { act, tileset, palette, objectLibrary } = makeTestAct();
    const result = exportAct('OJZ', act, tileset, objectLibrary);

    expect(result.actDescriptorAsm).toContain('OJZ_act1_Descriptor:');
    expect(result.entityDataAsm).toContain('OJZ_Sec0_Rings:');
    expect(result.entityDataAsm).toContain('OJZ_Sec0_Objects:');
    expect(result.vramBasesAsm).toContain('OJZ_SEC0_VRAM');
    expect(result.sectionBinaries.length).toBe(1); // only sec0 is active
    expect(result.sectionBinaries[0].nametable.length).toBe(131072);
    expect(result.sectionBinaries[0].collision.length).toBe(65536);
    expect(result.sectionBinaries[0].tileArt.length).toBeGreaterThan(0);
  });

  it('skips null sections in binary output', () => {
    const { act, tileset, palette, objectLibrary } = makeTestAct();
    const result = exportAct('OJZ', act, tileset, objectLibrary);
    // Only section 0 should have binaries (section 1 is null)
    expect(result.sectionBinaries.length).toBe(1);
    expect(result.sectionBinaries[0].index).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/export/pipeline.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/export/index.ts
import type { Act, Tileset, ObjectDef } from '../model/s4-types';
import { serializeNametable } from '../formats/s4-nametable';
import { serializeCollision } from '../formats/s4-collision';
import { deduplicateSectionTiles } from './tile-dedup';
import { computeVramBases, generateVramBasesAsm } from './vram-coloring';
import { generateActDescriptorAsm } from './act-descriptor';
import { generateEntityDataAsm } from './entity-data';

export interface SectionBinary {
  index: number;
  nametable: Uint8Array;
  collision: Uint8Array;
  tileArt: Uint8Array;
}

export interface ExportResult {
  actDescriptorAsm: string;
  entityDataAsm: string;
  vramBasesAsm: string;
  sectionBinaries: SectionBinary[];
}

export function exportAct(
  zonePrefix: string,
  act: Act,
  tileset: Tileset,
  objectLibrary: ObjectDef[],
): ExportResult {
  const { gridWidth, gridHeight, sections } = act;

  // VRAM graph-coloring
  const activeSlots = sections.map(s => s !== null);
  const vramBases = computeVramBases(gridWidth, gridHeight, activeSlots);
  const vramBasesAsm = generateVramBasesAsm(zonePrefix, vramBases);

  // Per-section binaries
  const sectionBinaries: SectionBinary[] = [];
  const entityDataParts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    // Tile dedup + VRAM remapping
    const dedup = deduplicateSectionTiles(section.tileGrid.nametable, tileset.tiles, vramBases[i]);
    const nametable = serializeNametable(dedup.remappedNametable);
    const collision = serializeCollision(section.tileGrid.collision);

    sectionBinaries.push({
      index: i,
      nametable,
      collision,
      tileArt: dedup.tileArtBytes,
    });

    // Entity data
    entityDataParts.push(generateEntityDataAsm(
      zonePrefix,
      i,
      section.rings,
      section.objects,
      objectLibrary,
    ));
  }

  // Act descriptor
  const actDescriptorAsm = generateActDescriptorAsm(zonePrefix, act.id, {
    gridWidth,
    gridHeight,
    sections,
    startPosition: act.startPosition,
    parallaxRef: act.parallaxRef,
  });

  const entityDataAsm = entityDataParts.join('\n\n');

  return {
    actDescriptorAsm,
    entityDataAsm,
    vramBasesAsm,
    sectionBinaries,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/export/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export/index.ts test/export/pipeline.test.ts
git commit -m "feat: add full S4 export pipeline orchestrator"
```

---

## Task 19: Wire Up UI Components (Skeleton)

This task creates the skeleton UI components that will be fleshed out incrementally. Each component starts minimal and functional.

**Files:**
- Create: `src/renderer/components/SectionGridNav.tsx`
- Create: `src/renderer/components/ChunkLibrary.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`

- [ ] **Step 1: Create SectionGridNav**

```typescript
// src/renderer/components/SectionGridNav.tsx
import React from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';

export default function SectionGridNav() {
  const activeSectionIndex = useEditorStore(s => s.activeSectionIndex);
  const project = useProjectStore(s => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);

  if (!act) return <div style={styles.empty}>No act loaded</div>;

  const { gridWidth, gridHeight, sections } = act;

  return (
    <div style={styles.container}>
      <div style={styles.header}>Sections ({gridWidth}×{gridHeight})</div>
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${gridWidth}, 1fr)` }}>
        {sections.map((sec, i) => (
          <button
            key={i}
            style={{
              ...styles.cell,
              ...(i === activeSectionIndex ? styles.active : {}),
              ...(sec === null ? styles.null : {}),
            }}
            onClick={() => useEditorStore.getState().setActiveSectionIndex(i)}
          >
            {sec ? i : '—'}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, borderBottom: '1px solid #313244' },
  header: { fontSize: 11, color: '#6c7086', marginBottom: 4 },
  grid: { display: 'grid', gap: 2 },
  cell: {
    padding: '4px 0', textAlign: 'center', fontSize: 10,
    background: '#313244', border: '1px solid #45475a', borderRadius: 2,
    color: '#cdd6f4', cursor: 'pointer',
  },
  active: { background: '#89b4fa', color: '#1e1e2e', border: '1px solid #89b4fa' },
  null: { background: '#11111b', color: '#45475a' },
  empty: { padding: 8, color: '#6c7086', fontSize: 11 },
};
```

- [ ] **Step 2: Create ChunkLibrary**

```typescript
// src/renderer/components/ChunkLibrary.tsx
import React, { useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';

export default function ChunkLibrary() {
  const selectedChunkId = useEditorStore(s => s.selectedChunkId);
  const project = useProjectStore(s => s.project);
  const [newWidth, setNewWidth] = useState(16);
  const [newHeight, setNewHeight] = useState(16);

  const chunks = project?.chunkLibrary ?? [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>Chunk Library</div>
      <div style={styles.list}>
        {chunks.map(chunk => (
          <button
            key={chunk.id}
            style={{
              ...styles.item,
              ...(chunk.id === selectedChunkId ? styles.selected : {}),
            }}
            onClick={() => useEditorStore.getState().setSelectedChunk(chunk.id)}
          >
            <span>{chunk.name}</span>
            <span style={styles.dims}>{chunk.widthTiles}×{chunk.heightTiles}</span>
          </button>
        ))}
      </div>
      <div style={styles.newChunk}>
        <div style={styles.inputRow}>
          <label style={styles.label}>W:</label>
          <input type="number" min={1} max={256} value={newWidth} onChange={e => setNewWidth(+e.target.value)} style={styles.input} />
          <label style={styles.label}>H:</label>
          <input type="number" min={1} max={256} value={newHeight} onChange={e => setNewHeight(+e.target.value)} style={styles.input} />
        </div>
        <div style={styles.pixelHint}>{newWidth * 8}×{newHeight * 8} px</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, borderTop: '1px solid #313244' },
  header: { fontSize: 11, color: '#6c7086', marginBottom: 4 },
  list: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflow: 'auto' },
  item: {
    display: 'flex', justifyContent: 'space-between', padding: '4px 6px',
    background: '#313244', border: '1px solid #45475a', borderRadius: 2,
    color: '#cdd6f4', cursor: 'pointer', fontSize: 11,
  },
  selected: { background: '#89b4fa', color: '#1e1e2e' },
  dims: { fontSize: 9, color: '#6c7086' },
  newChunk: { marginTop: 8 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 4 },
  label: { fontSize: 10, color: '#6c7086' },
  input: { width: 40, padding: '2px 4px', background: '#11111b', border: '1px solid #45475a', color: '#cdd6f4', fontSize: 11, borderRadius: 2 },
  pixelHint: { fontSize: 9, color: '#45475a', marginTop: 2 },
};
```

- [ ] **Step 3: Update App.tsx to include new panels**

Replace the left panel section in App.tsx to show SectionGridNav and conditionally ChunkLibrary:

```tsx
// In App.tsx, update the left panel section:
import SectionGridNav from './components/SectionGridNav';
import ChunkLibrary from './components/ChunkLibrary';

// In the main area, replace the left panel logic:
<div style={styles.main}>
  <div style={styles.leftPanel}>
    <SectionGridNav />
    {tool === 'stamp-chunk' && <ChunkLibrary />}
    {tool === 'place-object' && (
      <ObjectPalette
        selectedType={selectedObjectTypeId}
        onSelectType={(id, subtype) => useEditorStore.getState().setSelectedObjectType(id, subtype)}
      />
    )}
    {tool === 'place-ring' && (
      <RingPatternPalette
        selectedIndex={selectedRingPattern}
        onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
      />
    )}
  </div>
  <MapViewport />
  <PropertiesPanel />
</div>
```

Add `leftPanel` to styles:
```typescript
leftPanel: { width: 200, overflow: 'auto', borderRight: '1px solid #313244' },
```

- [ ] **Step 4: Verify app compiles**

Run: `npx electron-vite build 2>&1 | head -20` (just check for compile errors)
Expected: No TypeScript errors in new components

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SectionGridNav.tsx src/renderer/components/ChunkLibrary.tsx src/renderer/App.tsx
git commit -m "feat: add section grid navigator and chunk library UI panels"
```

---

## Task 20: Integration — Project Loading

**Files:**
- Modify: `src/renderer/hooks/useProject.ts`

- [ ] **Step 1: Rewrite useProject for S4 config loading**

This rewrites the hook to:
- Load `project.json` (S4 format)
- Parse tileset binary
- Parse palette
- Load section data from per-section `.tiles.bin` / `.coll.bin` / `.objects.json` / `.rings.json`
- Build the `S4Project` object and store it

```typescript
// src/renderer/hooks/useProject.ts
import { useCallback } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useEditorStore } from '../state/editorStore';
import { loadS4Config, type S4ProjectConfig } from '../../core/config/s4-config';
import { parseTiles } from '../../core/formats/tiles';
import { buildPalette } from '../../core/formats/palette';
import { parseNametable } from '../../core/formats/s4-nametable';
import { parseCollision } from '../../core/formats/s4-collision';
import { createSection, createSectionTileGrid } from '../../core/model/s4-types';
import type { S4Project, Zone, Act, Section, Tileset, Palette, ObjectPlacement, RingPlacement, ObjectDef, ChunkDef } from '../../core/model/s4-types';

async function readFile(basePath: string, relativePath: string): Promise<Uint8Array> {
  const buffer = await window.api.readBinaryFile(basePath, relativePath);
  return new Uint8Array(buffer);
}

async function readJson(basePath: string, relativePath: string): Promise<unknown> {
  const data = await readFile(basePath, relativePath);
  return JSON.parse(new TextDecoder().decode(data));
}

export function useProject() {
  const setConfig = useProjectStore(s => s.setConfig);
  const setProject = useProjectStore(s => s.setProject);
  const setCurrentAct = useProjectStore(s => s.setCurrentAct);
  const setLoading = useProjectStore(s => s.setLoading);
  const setError = useProjectStore(s => s.setError);
  const setPosition = useViewStore(s => s.setPosition);

  const openProject = useCallback(async () => {
    try {
      const dir = await window.api.selectDirectory();
      if (!dir) return;
      await loadProject(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadProject = useCallback(async (dir: string) => {
    setLoading(true);

    const jsonData = await readFile(dir, 'project.json');
    const json = JSON.parse(new TextDecoder().decode(jsonData)) as S4ProjectConfig;
    const config = loadS4Config(json, dir);
    setConfig(config);

    // Load object library
    let objectLibrary: ObjectDef[] = [];
    if (config.objectLibraryPath) {
      try {
        objectLibrary = (await readJson(dir, config.objectLibraryPath)) as ObjectDef[];
      } catch { /* empty library */ }
    }

    // Load chunk library
    let chunkLibrary: ChunkDef[] = [];
    if (config.chunkLibraryPath) {
      try {
        chunkLibrary = (await readJson(dir, config.chunkLibraryPath)) as ChunkDef[];
      } catch { /* empty library */ }
    }

    // Load zones
    const zones: Zone[] = [];
    for (const zoneConfig of config.zones) {
      const tileData = await readFile(dir, zoneConfig.tileset);
      const tiles = parseTiles(tileData);
      const tileset: Tileset = {
        tiles,
        collisionTypes: new Uint8Array(tiles.length), // loaded separately if available
      };

      const palData = await readFile(dir, zoneConfig.palette);
      const palette = buildPalette([{ data: palData, srcOffset: 0, destOffset: 0, length: 64 }]);

      const acts: Act[] = [];
      for (const actConfig of zoneConfig.acts) {
        const sections: (Section | null)[] = [];
        const totalSections = actConfig.gridWidth * actConfig.gridHeight;

        for (let i = 0; i < totalSections; i++) {
          try {
            const ntData = await readFile(dir, `${actConfig.dataPath}sec${i}.tiles.bin`);
            const collData = await readFile(dir, `${actConfig.dataPath}sec${i}.coll.bin`);
            const sec = createSection(i, `Sec${i}`);
            sec.tileGrid.nametable = parseNametable(ntData, 256, 256);
            sec.tileGrid.collision = parseCollision(collData, 256, 256);

            try {
              const objJson = await readJson(dir, `${actConfig.dataPath}sec${i}.objects.json`);
              sec.objects = objJson as ObjectPlacement[];
            } catch { /* no objects */ }

            try {
              const ringJson = await readJson(dir, `${actConfig.dataPath}sec${i}.rings.json`);
              sec.rings = ringJson as RingPlacement[];
            } catch { /* no rings */ }

            sections.push(sec);
          } catch {
            sections.push(null); // section doesn't exist yet
          }
        }

        acts.push({
          id: actConfig.id,
          gridWidth: actConfig.gridWidth,
          gridHeight: actConfig.gridHeight,
          sections,
          startPosition: actConfig.startPosition,
          bgLayout: null,
          bgTiles: null,
          parallaxRef: actConfig.parallax,
        });
      }

      zones.push({ id: zoneConfig.id, name: zoneConfig.name, acts, tileset, palette });
    }

    const project: S4Project = { name: config.name, zones, objectLibrary, chunkLibrary, basePath: dir };
    setProject(project);

    // Auto-select first zone/act
    if (zones.length > 0 && zones[0].acts.length > 0) {
      setCurrentAct(zones[0].id, zones[0].acts[0].id);
    }

    await window.api.addRecentProject(dir, config.name);
    setLoading(false);
    setPosition(0, 0);
  }, []);

  const saveProject = useCallback(async () => {
    // TODO: implement save (write section binaries + JSON metadata)
    // This will be completed in a follow-up task
  }, []);

  return { openProject, saveProject };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/useProject.ts
git commit -m "feat: rewrite project loading hook for S4 config and section data"
```

---

## Task 21: Wire MapViewport to SectionRenderer

**Files:**
- Modify: `src/renderer/components/MapViewport.tsx`

This is a large file that needs significant rewiring. The key changes:
- Use `SectionRenderer` instead of `LevelRenderer`
- Render only the active section (the one selected in SectionGridNav)
- Hit-test returns tile coordinates instead of chunk coordinates
- Tool handlers dispatch tile painting commands instead of chunk painting

- [ ] **Step 1: Rewrite MapViewport core rendering**

The file should be rewritten to:
1. Import `SectionRenderer` instead of `LevelRenderer`
2. When active section changes, call `sectionRenderer.loadSection(section.tileGrid)`
3. Render using `sectionRenderer.render(ctx, viewport)`
4. Hit-test converts screen coords to tile col/row (divide by 8)
5. `paint-tile` tool: on click/drag, build `set-tiles` command
6. `paint-block` tool: on click, paint a 16×16 region of tiles
7. `stamp-chunk` tool: on click, stamp chunk nametable data onto grid
8. Keep object/ring tools mostly unchanged (just use new types)

Due to the size of this file (700+ lines), the implementor should follow the existing patterns for mouse handling but replace:
- All `chunkRow`/`chunkCol` logic with `tileRow`/`tileCol` (index into 256×256)
- The `paint-chunk` handler with `paint-tile`/`paint-block`/`stamp-chunk` handlers
- Hit-test info display to show tile coordinates

- [ ] **Step 2: Verify the editor launches and renders**

Run: `npx electron-vite dev`
Expected: Editor opens, no crash. If no project loaded, shows "No act loaded" state.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/MapViewport.tsx
git commit -m "feat: rewire MapViewport to SectionRenderer and tile painting"
```

---

## Task 22: Overlay Renderer Updates

**Files:**
- Modify: `src/renderer/canvas/OverlayRenderer.ts`

- [ ] **Step 1: Update OverlayRenderer for new grid types**

Add tile grid (8px spacing), collision overlay (colored rectangles per tile), and update grid drawing methods. The block grid (128px) and chunk grid (arbitrary, from active chunk dims) replace the old chunk/block grids.

```typescript
// Add to OverlayRenderer:
// - drawTileGrid (8px spacing, very subtle)
// - drawBlockGrid (128px spacing, medium visibility)
// - drawCollisionOverlay (per-tile colored fill based on collision type value)
// - Keep existing object/ring drawing (update ObjectPlacement type import)
```

The collision overlay should map collision type values to distinct colors (e.g., type 0 = transparent, type 1 = green, type 2 = blue, etc.).

- [ ] **Step 2: Commit**

```bash
git add src/renderer/canvas/OverlayRenderer.ts
git commit -m "feat: add tile grid, collision overlay to OverlayRenderer"
```

---

## Task 23: Save/Export Integration

**Files:**
- Modify: `src/renderer/hooks/useProject.ts` (add save implementation)

- [ ] **Step 1: Implement saveProject in useProject hook**

Add save functionality that:
1. Writes per-section `.tiles.bin` and `.coll.bin` (editor working format)
2. Writes per-section `.objects.json` and `.rings.json`
3. Calls `exportAct()` to generate assembly output + remapped binaries

```typescript
// Add to useProject.ts saveProject:
const saveProject = useCallback(async () => {
  const state = useProjectStore.getState();
  if (!state.project || !state.config) return;

  const project = state.project;
  const zone = project.zones.find(z => z.id === state.currentZoneId);
  const act = zone?.acts.find(a => a.id === state.currentActId);
  if (!zone || !act) return;

  const zoneConfig = state.config.zones.find(z => z.id === zone.id);
  const actConfig = zoneConfig?.acts.find(a => a.id === act.id);
  if (!actConfig) return;

  setLoading(true);
  const basePath = project.basePath;

  // Save working data (per-section)
  for (let i = 0; i < act.sections.length; i++) {
    const section = act.sections[i];
    if (!section) continue;

    const ntBytes = serializeNametable(section.tileGrid.nametable);
    await window.api.writeBinaryFile(basePath, `${actConfig.dataPath}sec${i}.tiles.bin`, ntBytes.buffer);

    const collBytes = serializeCollision(section.tileGrid.collision);
    await window.api.writeBinaryFile(basePath, `${actConfig.dataPath}sec${i}.coll.bin`, collBytes.buffer);

    const objJson = JSON.stringify(section.objects, null, 2);
    await window.api.writeBinaryFile(basePath, `${actConfig.dataPath}sec${i}.objects.json`, new TextEncoder().encode(objJson).buffer);

    const ringJson = JSON.stringify(section.rings, null, 2);
    await window.api.writeBinaryFile(basePath, `${actConfig.dataPath}sec${i}.rings.json`, new TextEncoder().encode(ringJson).buffer);
  }

  // Export assembly + build-tool-ready binaries
  const { exportAct } = await import('../../core/export/index');
  const result = exportAct(zone.id.toUpperCase(), act, zone.tileset, project.objectLibrary);

  const exportPath = `${actConfig.dataPath}export/`;
  const enc = new TextEncoder();
  await window.api.writeBinaryFile(basePath, `${exportPath}act_descriptor.asm`, enc.encode(result.actDescriptorAsm).buffer);
  await window.api.writeBinaryFile(basePath, `${exportPath}entity_data.asm`, enc.encode(result.entityDataAsm).buffer);
  await window.api.writeBinaryFile(basePath, `${exportPath}sec_vram_bases.asm`, enc.encode(result.vramBasesAsm).buffer);

  for (const secBin of result.sectionBinaries) {
    await window.api.writeBinaryFile(basePath, `${exportPath}sec${secBin.index}_nametable.bin`, secBin.nametable.buffer);
    await window.api.writeBinaryFile(basePath, `${exportPath}sec${secBin.index}_collision.bin`, secBin.collision.buffer);
    await window.api.writeBinaryFile(basePath, `${exportPath}sec${secBin.index}_tiles.bin`, secBin.tileArt.buffer);
  }

  useEditorStore.getState().markClean();
  setLoading(false);
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/useProject.ts
git commit -m "feat: implement save/export for S4 sections"
```

---

## Task 24: Final Cleanup and Test Suite

- [ ] **Step 1: Remove old test fixtures that reference S2/S3K formats**

```bash
find test -name "*.test.ts" -exec grep -l "kosinski\|nemesis\|parseChunks\|parseBlocks\|parseLayout\|ini-migrator\|chunk-builder" {} \; | xargs rm -f
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. If any test imports removed modules, delete or update it.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors. If there are errors from components not yet fully updated (e.g., ObjectPalette still expecting old types), stub them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final cleanup — remove stale tests, fix type errors"
```

---

## Summary

| Task | Component | Key Output |
|------|-----------|-----------|
| 1 | Data Model | `s4-types.ts` — Section, TileGrid, ChunkDef, S4Project |
| 2 | Nametable I/O | Big-endian word read/write (256×256) |
| 3 | Collision I/O | Raw byte read/write (256×256) |
| 4 | Objects | 4-byte packed format (pack/unpack/serialize/parse) |
| 5 | Rings | dc.w X,Y pairs with dc.l 0 terminator |
| 6 | VRAM Coloring | Checkerboard graph-coloring for adjacent sections |
| 7 | Tile Dedup | Deduplicate + remap nametable for export |
| 8 | Entity ASM | Generate ring lists, object lists, type tables |
| 9 | Act Descriptor ASM | Generate 34-byte descriptor + 72-byte section table |
| 10 | Config | S4 project.json schema + loader |
| 11 | Commands | Tile painting undo/redo commands |
| 12 | SectionRenderer | Flat grid rendering with dirty-rect tracking |
| 13 | Remove S2/S3K | Delete old compression, formats, renderers |
| 14 | Editor Store | New tools (paint-tile, paint-block, stamp-chunk) |
| 15 | View Store | Grid overlay toggles |
| 16 | Project Store | S4Project state shape |
| 17 | Tiles/Palette | Verify existing parsers still work |
| 18 | Export Pipeline | Orchestrates full export |
| 19 | UI Panels | SectionGridNav + ChunkLibrary |
| 20 | Project Loading | Load S4 project.json + section data |
| 21 | MapViewport | Wire to SectionRenderer + tile painting |
| 22 | Overlays | Tile grid, collision overlay |
| 23 | Save/Export | Write working data + build-tool binaries |
| 24 | Cleanup | Remove stale code, pass all tests |
