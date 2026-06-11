# MCP Art-Generation Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Embed an MCP server in the editor's Electron main process so a Claude Code session can generate level art live in the running editor, with screenshots and budget validation — plus fix two stale modules the MCP depends on.

**Architecture:** Main process hosts a Streamable-HTTP MCP server (`@modelcontextprotocol/sdk` + express). Tool calls forward over a new `agent:request`/`agent:response` IPC pair to a renderer handler that executes against the Zustand stores through the existing `EditHistory` command system (one batched command per tool call). Pure validation/budget logic lives in `src/core/agent/` with vitest coverage. Spec: `docs/specs/2026-06-11-mcp-art-generation-design.md`.

**Tech Stack:** TypeScript, Electron 41 (electron-vite), React 19, Zustand 5, vitest 4, `@modelcontextprotocol/sdk`, `zod`, `express`.

**Verification commands** (run from repo root `/home/volence/sonic_hacks/sonic-level-editor`):
- Unit tests: `npx vitest run` (or a single file: `npx vitest run test/formats/s4-strips.test.ts`)
- Type/build check: `npm run build`

**Engine ground truth** (verified 2026-06-11 against `/home/volence/sonic_hacks/s4_engine`):
- Strip file: 256 columns × 776 bytes = 198,656 bytes per section. Per column: 512 bytes (256 big-endian nametable words, full section height) + 128 collision bytes path A (1 byte per 16px cell = per 2 tile rows) + 128 collision bytes path B + 8 pad bytes. Source: `s4_engine/tools/ojz_strip_gen.py:1075-1080`.
- VRAM color-group bases are **measured**, not fixed: groups get cumulative bases from running union tile counts (`tile_dedupe.assign_section_slots`, `s4_engine/tools/tile_dedupe.py:205`). Sections in the same color group share one union tile blob.
- FG tile budget: BG region starts at tile slot 1024 ($400), so FG group unions must fit in slots 0–1023.
- Existing real data: `s4_engine/data/generated/ojz/act1/sec{N}_strips_source.bin` (the editor's `stripPath` per `s4_engine/project.json`; editor loads `{stripPrefix}{i}_strips_source.bin`).

---

## Task 1: Rewrite `s4-strips.ts` for the 776-byte wide-strip format

The current parser expects 48-row strips (128 bytes/column, nibble-packed collision). The engine emits 256-row strips with two byte-per-cell collision planes. The editor currently mis-parses real data.

**Files:**
- Modify: `src/core/formats/s4-strips.ts` (full rewrite, see below)
- Modify: `test/formats/s4-strips.test.ts` (full rewrite)
- No change needed: `src/renderer/hooks/useProject.ts` imports `STRIP_ROWS`/`STRIP_COLS` and loops over them (`useProject.ts:276-283`) — it adapts automatically when `STRIP_ROWS` becomes 256.

- [x] **Step 1: Write the failing tests**

Replace the entire contents of `test/formats/s4-strips.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  parseStrips, serializeStrips, STRIP_ROWS, STRIP_COLS, WIDE_STRIP_SIZE,
} from '../../src/core/formats/s4-strips';

function buildFile(): Uint8Array {
  // 256 columns x 776 bytes
  return new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE);
}

describe('s4-strips (engine wide-strip format)', () => {
  it('has the engine constants', () => {
    expect(STRIP_ROWS).toBe(256);
    expect(STRIP_COLS).toBe(256);
    expect(WIDE_STRIP_SIZE).toBe(776); // 512 NT + 128 collA + 128 collB + 8 pad
  });

  it('rejects undersized files', () => {
    expect(() => parseStrips(new Uint8Array(WIDE_STRIP_SIZE * 255))).toThrow(/too small/i);
  });

  it('parses nametable words column-major to row-major', () => {
    const data = buildFile();
    // column 3, row 5 -> word 0xA15B
    const off = 3 * WIDE_STRIP_SIZE + 5 * 2;
    data[off] = 0xA1; data[off + 1] = 0x5B;
    const grid = parseStrips(data);
    expect(grid.width).toBe(256);
    expect(grid.height).toBe(256);
    expect(grid.nametable[5 * 256 + 3]).toBe(0xA15B);
  });

  it('expands path-A collision bytes to both covered tile rows', () => {
    const data = buildFile();
    // column 7, collision cell 10 (tile rows 20 and 21) -> type 0x42
    const off = 7 * WIDE_STRIP_SIZE + 512 + 10;
    data[off] = 0x42;
    const grid = parseStrips(data);
    expect(grid.collision[20 * 256 + 7]).toBe(0x42);
    expect(grid.collision[21 * 256 + 7]).toBe(0x42);
  });

  it('ignores path B on parse (editor edits a single collision layer)', () => {
    const data = buildFile();
    const off = 0 * WIDE_STRIP_SIZE + 512 + 128 + 0; // plane B, cell 0
    data[off] = 0x99;
    const grid = parseStrips(data);
    expect(grid.collision[0]).toBe(0);
  });

  it('serializes: plane B is a copy of plane A, pad is zero', () => {
    const grid = parseStrips(buildFile());
    grid.nametable[12 * 256 + 4] = 0x1234;
    grid.collision[30 * 256 + 9] = 0x07; // tile row 30 -> cell 15
    const out = serializeStrips(grid);
    expect(out.length).toBe(STRIP_COLS * WIDE_STRIP_SIZE);
    const colBase = 4 * WIDE_STRIP_SIZE;
    expect(out[colBase + 12 * 2]).toBe(0x12);
    expect(out[colBase + 12 * 2 + 1]).toBe(0x34);
    const col9 = 9 * WIDE_STRIP_SIZE;
    expect(out[col9 + 512 + 15]).toBe(0x07);        // plane A
    expect(out[col9 + 512 + 128 + 15]).toBe(0x07);  // plane B = copy
    for (let i = 0; i < 8; i++) expect(out[col9 + 512 + 256 + i]).toBe(0);
  });

  it('round-trips parse -> serialize -> parse', () => {
    const data = buildFile();
    for (let col = 0; col < 256; col += 17) {
      for (let row = 0; row < 256; row += 13) {
        const off = col * WIDE_STRIP_SIZE + row * 2;
        data[off] = (col ^ row) & 0xFF; data[off + 1] = (col + row) & 0xFF;
      }
    }
    const a = parseStrips(data);
    const b = parseStrips(serializeStrips(a));
    expect(b.nametable).toEqual(a.nametable);
    expect(b.collision).toEqual(a.collision);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/formats/s4-strips.test.ts`
Expected: FAIL — `WIDE_STRIP_SIZE` is not exported; constants are 48/128.

- [x] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/core/formats/s4-strips.ts`:

```typescript
// Engine wide-strip format — must match s4_engine/tools/ojz_strip_gen.py
// (STRIP_TILE_HEIGHT=256, COLLISION_ROWS_PER_STRIP=128, STRIP_COLLISION_PAD=8).
//
// Per column (WIDE_STRIP_SIZE = 776 bytes):
//   [0..511]    256 big-endian nametable words (full section height)
//   [512..639]  128 collision bytes, path A — 1 byte per 16px cell (2 tile rows)
//   [640..767]  128 collision bytes, path B (engine ships B = copy of A)
//   [768..775]  8 bytes padding (0)

export const STRIP_ROWS = 256;
export const STRIP_COLS = 256;

const NT_BYTES_PER_STRIP = STRIP_ROWS * 2;          // 512
const COLL_CELLS_PER_STRIP = STRIP_ROWS / 2;        // 128
const STRIP_PAD = 8;
export const WIDE_STRIP_SIZE =
  NT_BYTES_PER_STRIP + 2 * COLL_CELLS_PER_STRIP + STRIP_PAD; // 776

export interface StripData {
  nametable: Uint16Array;
  collision: Uint8Array;
  width: number;
  height: number;
}

/**
 * Parse a section's wide-strip file (column-major) into row-major grids.
 * Collision is read from path A only; each cell byte covers two tile rows.
 */
export function parseStrips(data: Uint8Array): StripData {
  const expected = STRIP_COLS * WIDE_STRIP_SIZE;
  if (data.length < expected) {
    throw new Error(`Strip file too small: expected ${expected} bytes, got ${data.length}`);
  }

  const width = STRIP_COLS;
  const height = STRIP_ROWS;
  const nametable = new Uint16Array(width * height);
  const collision = new Uint8Array(width * height);

  for (let col = 0; col < STRIP_COLS; col++) {
    const stripOffset = col * WIDE_STRIP_SIZE;

    for (let row = 0; row < STRIP_ROWS; row++) {
      const wordOffset = stripOffset + row * 2;
      nametable[row * width + col] = (data[wordOffset] << 8) | data[wordOffset + 1];
    }

    const collOffset = stripOffset + NT_BYTES_PER_STRIP;
    for (let cell = 0; cell < COLL_CELLS_PER_STRIP; cell++) {
      const value = data[collOffset + cell];
      collision[(cell * 2) * width + col] = value;
      collision[(cell * 2 + 1) * width + col] = value;
    }
  }

  return { nametable, collision, width, height };
}

/**
 * Serialize row-major grids back to the wide-strip format.
 * Path A is sampled from even tile rows; path B is emitted as a copy of A.
 */
export function serializeStrips(data: StripData): Uint8Array {
  const output = new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE);

  for (let col = 0; col < STRIP_COLS; col++) {
    const stripOffset = col * WIDE_STRIP_SIZE;

    for (let row = 0; row < STRIP_ROWS; row++) {
      const word = data.nametable[row * data.width + col];
      output[stripOffset + row * 2] = (word >> 8) & 0xFF;
      output[stripOffset + row * 2 + 1] = word & 0xFF;
    }

    const collOffset = stripOffset + NT_BYTES_PER_STRIP;
    for (let cell = 0; cell < COLL_CELLS_PER_STRIP; cell++) {
      const value = data.collision[(cell * 2) * data.width + col] & 0xFF;
      output[collOffset + cell] = value;                          // path A
      output[collOffset + COLL_CELLS_PER_STRIP + cell] = value;   // path B
    }
    // pad bytes already 0
  }

  return output;
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/formats/s4-strips.test.ts`
Expected: PASS (6 tests)

- [x] **Step 5: Run the full suite to catch consumers**

Run: `npx vitest run`
Expected: PASS. If `useProject` or others reference removed names, fix imports (only `parseStrips`, `STRIP_ROWS`, `STRIP_COLS` are consumed today).

- [x] **Step 6: Commit**

```bash
git add src/core/formats/s4-strips.ts test/formats/s4-strips.test.ts
git commit -m "fix: parse engine 776-byte wide-strip format (256 rows, dual collision planes)"
```

---

## Task 2: Compute VRAM bases from measured group unions

Replace the hardcoded `VRAM_BASE_B = 113 * 32` with the engine's algorithm: checkerboard color groups, group union tile blobs, cumulative bases, hard failure past the FG pool limit.

**Files:**
- Modify: `src/core/export/vram-coloring.ts` (rewrite)
- Modify: `src/core/export/tile-dedup.ts` (replace per-section dedup with group unions)
- Modify: `src/core/export/index.ts` (new flow)
- Modify: `test/export/vram-coloring.test.ts` (rewrite)
- Create: `test/export/tile-dedup.test.ts`

- [x] **Step 1: Write failing tests for coloring + base assignment**

Replace the entire contents of `test/export/vram-coloring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  computeVramColoring, assignVramBases, generateVramBasesAsm, FG_TILE_LIMIT,
} from '../../src/core/export/vram-coloring';

describe('computeVramColoring', () => {
  it('checkerboards active sections and marks inactive as -1', () => {
    const colors = computeVramColoring(3, 1, [true, false, true]);
    expect(colors).toEqual([0, -1, 0]);
  });

  it('horizontal and vertical neighbors differ', () => {
    const colors = computeVramColoring(3, 3, Array(9).fill(true));
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[3]);
    expect(colors[0]).toBe(colors[4]); // diagonal shares
  });
});

describe('assignVramBases', () => {
  it('gives cumulative tile-slot bases from union counts', () => {
    const { colorBases, bases } = assignVramBases([0, 1, 0], [113, 87]);
    expect(colorBases).toEqual([0, 113]);
    // per-section byte addresses
    expect(bases).toEqual([0 * 32, 113 * 32, 0 * 32]);
  });

  it('inactive sections get base 0', () => {
    const { bases } = assignVramBases([0, -1], [50]);
    expect(bases[1]).toBe(0);
  });

  it('throws when groups exceed the FG pool', () => {
    expect(() => assignVramBases([0, 1], [800, FG_TILE_LIMIT - 800 + 1]))
      .toThrow(/VRAM/i);
  });
});

describe('generateVramBasesAsm', () => {
  it('emits one equate per section as slot * 32', () => {
    const asm = generateVramBasesAsm('OJZ', [0, 113 * 32]);
    expect(asm).toContain('OJZ_SEC0_VRAM = 0 * 32');
    expect(asm).toContain('OJZ_SEC1_VRAM = 113 * 32');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run test/export/vram-coloring.test.ts`
Expected: FAIL — `computeVramColoring`, `assignVramBases`, `FG_TILE_LIMIT` not exported.

- [x] **Step 3: Rewrite `src/core/export/vram-coloring.ts`**

```typescript
// VRAM color-group base assignment — mirrors s4_engine/tools/tile_dedupe.py
// assign_section_slots: groups get cumulative bases from measured union sizes.

// BG region starts at tile slot 1024 ($400); FG group unions must fit below it.
export const FG_TILE_LIMIT = 1024;

/**
 * Checkerboard coloring: active sections get (col+row)%2, inactive get -1.
 * Adjacent (H/V) sections are co-visible during teleports and must differ.
 */
export function computeVramColoring(
  gridWidth: number,
  gridHeight: number,
  activeSlots: boolean[],
): number[] {
  const count = gridWidth * gridHeight;
  const colors = new Array<number>(count).fill(-1);
  for (let i = 0; i < count; i++) {
    if (!activeSlots[i]) continue;
    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);
    colors[i] = (col + row) % 2;
  }
  return colors;
}

export interface VramBaseAssignment {
  /** Per-section VRAM byte address (colorBases[color] * 32; 0 for inactive). */
  bases: number[];
  /** Tile-slot base per color group (cumulative union counts). */
  colorBases: number[];
}

export function assignVramBases(
  colors: number[],
  groupUnionCounts: number[],
): VramBaseAssignment {
  const colorBases: number[] = [];
  let cursor = 0;
  for (let c = 0; c < groupUnionCounts.length; c++) {
    colorBases.push(cursor);
    cursor += groupUnionCounts[c];
  }
  if (cursor > FG_TILE_LIMIT) {
    throw new Error(
      `VRAM overflow: color groups need ${cursor} tiles, FG pool limit is ${FG_TILE_LIMIT}`,
    );
  }
  const bases = colors.map(c => (c < 0 ? 0 : colorBases[c] * 32));
  return { bases, colorBases };
}

export function generateVramBasesAsm(zonePrefix: string, bases: number[]): string {
  const lines: string[] = [];
  for (let i = 0; i < bases.length; i++) {
    const tileIndex = bases[i] / 32;
    lines.push(`${zonePrefix}_SEC${i}_VRAM = ${tileIndex} * 32   ; = $${bases[i].toString(16).toUpperCase().padStart(4, '0')}`);
  }
  return lines.join('\n');
}
```

- [x] **Step 4: Run coloring tests**

Run: `npx vitest run test/export/vram-coloring.test.ts`
Expected: PASS

- [x] **Step 5: Write failing tests for group unions**

Create `test/export/tile-dedup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildGroupUnions, remapNametableToGroup, serializeTiles } from '../../src/core/export/tile-dedup';
import { packNametableWord } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill & 0xF) };
}

describe('buildGroupUnions', () => {
  it('unions tiles across sections of the same color, first-seen order', () => {
    const tiles: Tile[] = [tile(0), tile(1), tile(2), tile(3)];
    const ntA = new Uint16Array(4);
    ntA[0] = packNametableWord(2, 0, false, false, false);
    ntA[1] = packNametableWord(1, 0, false, false, false);
    const ntB = new Uint16Array(4);
    ntB[0] = packNametableWord(3, 0, false, false, false);
    ntB[1] = packNametableWord(1, 0, false, false, false); // shared with A

    const unions = buildGroupUnions(
      [
        { nametable: ntA, tiles, color: 0 },
        { nametable: ntB, tiles, color: 0 },
      ],
      1,
    );
    // first-seen: tile2, tile1, tile3 — tile1 not duplicated
    expect(unions[0].tiles.length).toBe(3);
  });

  it('identical pixel content across different indices dedupes', () => {
    const tiles: Tile[] = [tile(0), tile(5), tile(5)];
    const nt = new Uint16Array(2);
    nt[0] = packNametableWord(1, 0, false, false, false);
    nt[1] = packNametableWord(2, 0, false, false, false);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 1);
    expect(unions[0].tiles.length).toBe(1);
  });
});

describe('remapNametableToGroup', () => {
  it('remaps indices to base + union slot, preserving flags; empty words stay 0', () => {
    const tiles: Tile[] = [tile(0), tile(7)];
    const nt = new Uint16Array(2);
    nt[0] = 0;
    nt[1] = packNametableWord(1, 2, true, false, true);
    const unions = buildGroupUnions([{ nametable: nt, tiles, color: 0 }], 1);
    const remapped = remapNametableToGroup(nt, tiles, unions[0], 113);
    expect(remapped[0]).toBe(0);
    expect(remapped[1]).toBe(packNametableWord(113 + 0, 2, true, false, true));
  });
});

describe('serializeTiles', () => {
  it('packs 2 pixels per byte, 32 bytes per tile', () => {
    const t = tile(0);
    t.pixels[0] = 0xA; t.pixels[1] = 0x3;
    const bytes = serializeTiles([t]);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0xA3);
  });
});
```

- [x] **Step 6: Run to verify failure**

Run: `npx vitest run test/export/tile-dedup.test.ts`
Expected: FAIL — functions not exported.

- [x] **Step 7: Rewrite `src/core/export/tile-dedup.ts`**

```typescript
import type { Tile } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';

function tileHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += pixels[i].toString(16);
  return s;
}

/** One union per VRAM color group: ordered tiles + content-hash -> slot map. */
export interface GroupUnion {
  tiles: Tile[];
  slotByHash: Map<string, number>;
}

export interface SectionTileData {
  nametable: Uint16Array;
  tiles: Tile[];     // tileset the nametable indexes into
  color: number;     // VRAM color group (-1 = inactive, skipped)
}

/**
 * Build per-color-group tile unions in deterministic first-seen order
 * (sections in array order, nametable scan order) — mirrors
 * s4_engine/tools/tile_dedupe.py assign_section_slots.
 */
export function buildGroupUnions(
  sections: SectionTileData[],
  numColors: number,
): GroupUnion[] {
  const unions: GroupUnion[] = Array.from({ length: numColors }, () => ({
    tiles: [],
    slotByHash: new Map<string, number>(),
  }));

  for (const sec of sections) {
    if (sec.color < 0) continue;
    const union = unions[sec.color];
    for (let i = 0; i < sec.nametable.length; i++) {
      if (sec.nametable[i] === 0) continue;
      const entry = unpackNametableWord(sec.nametable[i]);
      const tile = sec.tiles[entry.tileIndex];
      if (!tile) continue;
      const hash = tileHash(tile.pixels);
      if (!union.slotByHash.has(hash)) {
        union.slotByHash.set(hash, union.tiles.length);
        union.tiles.push(tile);
      }
    }
  }

  return unions;
}

/**
 * Remap a section nametable to absolute VRAM indices: baseSlot + union slot.
 * Word 0 stays 0 (empty). Flags (palette/priority/flips) are preserved.
 */
export function remapNametableToGroup(
  nametable: Uint16Array,
  tiles: Tile[],
  union: GroupUnion,
  baseSlot: number,
): Uint16Array {
  const remapped = new Uint16Array(nametable.length);
  for (let i = 0; i < nametable.length; i++) {
    if (nametable[i] === 0) continue;
    const entry = unpackNametableWord(nametable[i]);
    const tile = tiles[entry.tileIndex];
    if (!tile) continue;
    const slot = union.slotByHash.get(tileHash(tile.pixels));
    if (slot === undefined) continue;
    remapped[i] = packNametableWord(
      baseSlot + slot, entry.palette, entry.priority, entry.vFlip, entry.hFlip,
    );
  }
  return remapped;
}

export function serializeTiles(tiles: Tile[]): Uint8Array {
  const bytes = new Uint8Array(tiles.length * 32);
  for (let t = 0; t < tiles.length; t++) {
    const pixels = tiles[t].pixels;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const hi = pixels[row * 8 + col * 2] & 0xF;
        const lo = pixels[row * 8 + col * 2 + 1] & 0xF;
        bytes[t * 32 + row * 4 + col] = (hi << 4) | lo;
      }
    }
  }
  return bytes;
}
```

(The old `deduplicateSectionTiles`/`DedupResult` are deleted — `export/index.ts` is the only consumer and is updated next.)

- [x] **Step 8: Update `src/core/export/index.ts` to the group flow**

Replace the body of `exportAct` (keep the imports/interfaces, adjusting imports):

```typescript
import type { Act, Tileset, ObjectDef } from '../model/s4-types';
import { serializeNametable } from '../formats/s4-nametable';
import { serializeCollision } from '../formats/s4-collision';
import { buildGroupUnions, remapNametableToGroup, serializeTiles } from './tile-dedup';
import type { SectionTileData } from './tile-dedup';
import { computeVramColoring, assignVramBases, generateVramBasesAsm } from './vram-coloring';
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

  const activeSlots = sections.map(s => s !== null);
  const colors = computeVramColoring(gridWidth, gridHeight, activeSlots);

  // Group unions across sections sharing a color (engine: shared union blob)
  const sectionData: SectionTileData[] = sections.map((section, i) => ({
    nametable: section ? section.tileGrid.nametable : new Uint16Array(0),
    tiles: section ? (section.tiles ?? tileset.tiles) : [],
    color: section ? colors[i] : -1,
  }));
  const numColors = 2;
  const unions = buildGroupUnions(sectionData, numColors);
  const { bases, colorBases } = assignVramBases(
    colors,
    unions.map(u => u.tiles.length),
  );
  const vramBasesAsm = generateVramBasesAsm(zonePrefix, bases);

  const sectionBinaries: SectionBinary[] = [];
  const entityDataParts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    const color = colors[i];
    const tiles = section.tiles ?? tileset.tiles;
    const remapped = remapNametableToGroup(
      section.tileGrid.nametable, tiles, unions[color], colorBases[color],
    );

    sectionBinaries.push({
      index: i,
      nametable: serializeNametable(remapped),
      collision: serializeCollision(section.tileGrid.collision),
      tileArt: serializeTiles(unions[color].tiles), // group blob, shared per color
    });

    entityDataParts.push(generateEntityDataAsm(
      zonePrefix, i, section.rings, section.objects, objectLibrary,
    ));
  }

  const actDescriptorAsm = generateActDescriptorAsm(zonePrefix, act.id, {
    gridWidth,
    gridHeight,
    sections,
    startPosition: act.startPosition,
    parallaxRef: act.parallaxRef,
  });

  return {
    actDescriptorAsm,
    entityDataAsm: entityDataParts.join('\n\n'),
    vramBasesAsm,
    sectionBinaries,
  };
}
```

- [x] **Step 9: Run the full suite, fix fallout**

Run: `npx vitest run`
Expected: tile-dedup and vram-coloring tests PASS. If other export tests asserted old base values (113 hardcode) or `deduplicateSectionTiles`, update them to the new API semantics — the behavior change is intentional.

- [x] **Step 10: Commit**

```bash
git add src/core/export/vram-coloring.ts src/core/export/tile-dedup.ts src/core/export/index.ts test/export/vram-coloring.test.ts test/export/tile-dedup.test.ts
git commit -m "fix: compute VRAM bases from measured group unions instead of hardcoded 113"
```

---

## Task 3: Shared agent protocol types

**Files:**
- Create: `src/shared/agent-protocol.ts`

- [x] **Step 1: Create the protocol module** (types + channel constants; no separate test — exercised by Tasks 4–9)

```typescript
// Wire protocol between the MCP server (main process) and the renderer's
// agent handler. Everything must be structured-clone serializable.

export const AGENT_REQUEST_CHANNEL = 'agent:request';
export const AGENT_RESPONSE_CHANNEL = 'agent:response';

export interface NametableEntrySpec {
  tile: number;        // tileset index (0..tileset.length-1, <= 0x7FF)
  pal: number;         // palette line 0-3
  pri?: boolean;
  hf?: boolean;
  vf?: boolean;
  coll?: number;       // collision type 0-255; omitted = keep existing
}

export type AgentRequest =
  | { kind: 'get-project-info' }
  | { kind: 'get-palette' }
  | { kind: 'get-tiles'; start: number; count: number }
  | { kind: 'get-nametable-region'; section: number; x: number; y: number; w: number; h: number }
  | { kind: 'check-budget'; section?: number }
  | { kind: 'set-palette'; line: number; colors: number[] }   // 16 Genesis CRAM words
  | { kind: 'write-tiles'; tiles: number[][]; at?: number }   // each tile: 64 values 0-15
  | { kind: 'paint-region'; section: number; x: number; y: number; w: number; h: number; entries: NametableEntrySpec[] }
  | { kind: 'save-chunk'; name: string; w: number; h: number; entries: NametableEntrySpec[] }
  | { kind: 'stamp-chunk'; chunkId: string; section: number; x: number; y: number }
  | { kind: 'goto'; section: number; x?: number; y?: number; zoom?: number }
  | { kind: 'screenshot'; region?: { x: number; y: number; w: number; h: number } };

export interface AgentRequestEnvelope {
  id: number;
  payload: AgentRequest;
}

export interface AgentResponseEnvelope {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}
```

- [x] **Step 2: Typecheck and commit**

Run: `npm run build`
Expected: builds clean.

```bash
git add src/shared/agent-protocol.ts
git commit -m "feat: add shared agent IPC protocol types"
```

---

## Task 4: Pure validation module

**Files:**
- Create: `src/core/agent/validation.ts`
- Create: `test/agent/validation.test.ts`

- [x] **Step 1: Write failing tests**

Create `test/agent/validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateGenesisColor, validatePaletteLine, validateTilePixels, validatePaintRegion,
} from '../../src/core/agent/validation';

describe('validateGenesisColor', () => {
  it('accepts valid 9-bit even-channel words', () => {
    expect(validateGenesisColor(0x0000)).toBeNull();
    expect(validateGenesisColor(0x0EEE)).toBeNull();
    expect(validateGenesisColor(0x0A42)).toBeNull();
  });
  it('rejects odd channel values and out-of-range bits', () => {
    expect(validateGenesisColor(0x0001)).toMatch(/even/i);
    expect(validateGenesisColor(0x0010)).toMatch(/even/i);
    expect(validateGenesisColor(0x1000)).toMatch(/even|range/i);
    expect(validateGenesisColor(0xF000)).toMatch(/even|range/i);
  });
});

describe('validatePaletteLine', () => {
  it('rejects line 0 (sprite-reserved) and out-of-range lines', () => {
    expect(validatePaletteLine(0, Array(16).fill(0))).toMatch(/line 0|reserved/i);
    expect(validatePaletteLine(4, Array(16).fill(0))).toMatch(/line/i);
  });
  it('requires exactly 16 valid colors', () => {
    expect(validatePaletteLine(1, Array(15).fill(0))).toMatch(/16/);
    expect(validatePaletteLine(1, Array(16).fill(0))).toBeNull();
    expect(validatePaletteLine(2, [...Array(15).fill(0), 0x0003])).toMatch(/even/i);
  });
});

describe('validateTilePixels', () => {
  it('requires 64 pixels valued 0-15', () => {
    expect(validateTilePixels(Array(63).fill(0))).toMatch(/64/);
    expect(validateTilePixels([...Array(63).fill(0), 16])).toMatch(/0-15/);
    expect(validateTilePixels(Array(64).fill(15))).toBeNull();
  });
});

describe('validatePaintRegion', () => {
  const opts = { sectionCount: 9, tilesetSize: 100 };
  it('accepts an in-bounds region with matching entries', () => {
    const entries = Array(6).fill({ tile: 1, pal: 1 });
    expect(validatePaintRegion(0, 10, 20, 3, 2, entries, opts)).toBeNull();
  });
  it('rejects out-of-bounds regions', () => {
    expect(validatePaintRegion(0, 250, 0, 10, 1, Array(10).fill({ tile: 1, pal: 1 }), opts)).toMatch(/bounds/i);
    expect(validatePaintRegion(9, 0, 0, 1, 1, [{ tile: 1, pal: 1 }], opts)).toMatch(/section/i);
  });
  it('rejects entry count mismatch and bad entries', () => {
    expect(validatePaintRegion(0, 0, 0, 2, 2, Array(3).fill({ tile: 1, pal: 1 }), opts)).toMatch(/entries/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 100, pal: 1 }], opts)).toMatch(/tile/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 1, pal: 4 }], opts)).toMatch(/palette/i);
    expect(validatePaintRegion(0, 0, 0, 1, 1, [{ tile: 1, pal: 1, coll: 256 }], opts)).toMatch(/collision/i);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run test/agent/validation.test.ts`
Expected: FAIL — module missing.

- [x] **Step 3: Implement `src/core/agent/validation.ts`**

```typescript
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { NametableEntrySpec } from '../../shared/agent-protocol';

// All validators return null when valid, or a human-readable error string.

/** Genesis CRAM word: 0000 BBB0 GGG0 RRR0 — 9-bit color, even nibble values only. */
export function validateGenesisColor(word: number): string | null {
  if (!Number.isInteger(word) || word < 0 || word > 0xFFFF) {
    return `color $${word.toString(16)} is not a 16-bit word`;
  }
  if ((word & 0xF111) !== 0) {
    return `color $${word.toString(16).toUpperCase().padStart(4, '0')} invalid: channels must be even values 0-$E (word & $F111 must be 0)`;
  }
  return null;
}

export function validatePaletteLine(line: number, colors: number[]): string | null {
  if (line === 0) return 'palette line 0 is reserved for player/sprite art';
  if (!Number.isInteger(line) || line < 1 || line > 3) return `palette line must be 1-3, got ${line}`;
  if (colors.length !== 16) return `expected 16 colors, got ${colors.length}`;
  for (let i = 0; i < 16; i++) {
    const err = validateGenesisColor(colors[i]);
    if (err) return `color ${i}: ${err}`;
  }
  return null;
}

export function validateTilePixels(pixels: number[]): string | null {
  if (pixels.length !== 64) return `tile must have 64 pixels, got ${pixels.length}`;
  for (let i = 0; i < 64; i++) {
    const p = pixels[i];
    if (!Number.isInteger(p) || p < 0 || p > 15) {
      return `pixel ${i} = ${p}: values must be 0-15 (4bpp palette indices)`;
    }
  }
  return null;
}

export interface PaintRegionOptions {
  sectionCount: number;
  tilesetSize: number;
}

export function validatePaintRegion(
  section: number,
  x: number, y: number, w: number, h: number,
  entries: NametableEntrySpec[],
  opts: PaintRegionOptions,
): string | null {
  if (!Number.isInteger(section) || section < 0 || section >= opts.sectionCount) {
    return `section ${section} out of range (0-${opts.sectionCount - 1})`;
  }
  if (w < 1 || h < 1 || x < 0 || y < 0 ||
      x + w > SECTION_TILES_WIDE || y + h > SECTION_TILES_HIGH) {
    return `region ${w}x${h} at (${x},${y}) is out of bounds (section is ${SECTION_TILES_WIDE}x${SECTION_TILES_HIGH} tiles)`;
  }
  if (entries.length !== w * h) {
    return `entries length ${entries.length} != region size ${w * h}`;
  }
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!Number.isInteger(e.tile) || e.tile < 0 || e.tile >= opts.tilesetSize || e.tile > 0x7FF) {
      return `entry ${i}: tile ${e.tile} out of range (tileset has ${opts.tilesetSize} tiles, hardware max 2047)`;
    }
    if (!Number.isInteger(e.pal) || e.pal < 0 || e.pal > 3) {
      return `entry ${i}: palette line ${e.pal} out of range 0-3`;
    }
    if (e.coll !== undefined && (!Number.isInteger(e.coll) || e.coll < 0 || e.coll > 255)) {
      return `entry ${i}: collision type ${e.coll} out of range 0-255`;
    }
  }
  return null;
}
```

- [x] **Step 4: Run tests, expect PASS, commit**

Run: `npx vitest run test/agent/validation.test.ts`

```bash
git add src/core/agent/validation.ts test/agent/validation.test.ts
git commit -m "feat: add agent input validation (palette, tiles, paint regions)"
```

---

## Task 5: Budget module (flip-aware unique-tile counting)

**Files:**
- Modify: `src/core/import/tile-dedup.ts` — export the private `flipTile` function (change `function flipTile` to `export function flipTile`; no other change)
- Create: `src/core/agent/budget.ts`
- Create: `test/agent/budget.test.ts`

- [x] **Step 1: Write failing tests**

Create `test/agent/budget.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canonicalTileHash, computeActBudget } from '../../src/core/agent/budget';
import { packNametableWord, createSection } from '../../src/core/model/s4-types';
import type { Tile, Section } from '../../src/core/model/s4-types';

function tileFromRows(rows: number[][]): Tile {
  const pixels = new Uint8Array(64);
  rows.forEach((row, r) => row.forEach((v, c) => { pixels[r * 8 + c] = v; }));
  return { pixels };
}

describe('canonicalTileHash', () => {
  it('gives flips of the same tile the same hash', () => {
    const base = tileFromRows([[1, 2, 3, 4, 5, 6, 7, 8]]);
    const hflip = tileFromRows([[8, 7, 6, 5, 4, 3, 2, 1]]);
    expect(canonicalTileHash(hflip.pixels)).toBe(canonicalTileHash(base.pixels));
  });
  it('distinguishes genuinely different tiles', () => {
    const a = tileFromRows([[1, 1, 1, 1, 1, 1, 1, 1]]);
    const b = tileFromRows([[2, 2, 2, 2, 2, 2, 2, 2]]);
    expect(canonicalTileHash(a.pixels)).not.toBe(canonicalTileHash(b.pixels));
  });
});

describe('computeActBudget', () => {
  it('counts flip-aware unique tiles per section and per color group', () => {
    const tiles: Tile[] = [
      { pixels: new Uint8Array(64) },                 // 0: blank
      tileFromRows([[1, 2, 3, 4, 5, 6, 7, 8]]),       // 1
      tileFromRows([[8, 7, 6, 5, 4, 3, 2, 1]]),       // 2: hflip of 1
      tileFromRows([[9, 9, 0, 0, 0, 0, 0, 0]]),       // 3
    ];
    const sec0: Section = createSection(0, 'S0');
    sec0.tileGrid.nametable[0] = packNametableWord(1, 1, false, false, false);
    sec0.tileGrid.nametable[1] = packNametableWord(2, 1, false, false, false); // dup of 1
    const sec1: Section = createSection(1, 'S1');
    sec1.tileGrid.nametable[0] = packNametableWord(3, 1, false, false, false);

    const budget = computeActBudget(
      { gridWidth: 2, gridHeight: 1, sections: [sec0, sec1] },
      tiles,
    );
    expect(budget.perSection[0].uniqueTiles).toBe(1); // tiles 1+2 are one canonical
    expect(budget.perSection[1].uniqueTiles).toBe(1);
    expect(budget.groups.length).toBe(2);
    expect(budget.groups[0].unionTiles).toBe(1);
    expect(budget.groups[1].unionTiles).toBe(1);
    expect(budget.groups[1].baseSlot).toBe(1); // cumulative after group 0
    expect(budget.fits).toBe(true);
    expect(budget.limit).toBe(1024);
  });

  it('reports fits=false when unions exceed the FG pool', () => {
    // 1025 distinct tiles painted in one section
    const tiles: Tile[] = Array.from({ length: 1026 }, (_, i) => {
      const p = new Uint8Array(64);
      p[0] = i & 0xF; p[1] = (i >> 4) & 0xF; p[2] = (i >> 8) & 0xF;
      return { pixels: p };
    });
    const sec: Section = createSection(0, 'S0');
    for (let i = 0; i < 1025; i++) {
      sec.tileGrid.nametable[i] = packNametableWord(i + 1, 1, false, false, false);
    }
    const budget = computeActBudget({ gridWidth: 1, gridHeight: 1, sections: [sec] }, tiles);
    expect(budget.fits).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run test/agent/budget.test.ts`
Expected: FAIL — module missing.

- [x] **Step 3: Implement `src/core/agent/budget.ts`**

```typescript
import { unpackNametableWord } from '../model/s4-types';
import type { Section, Tile } from '../model/s4-types';
import { flipTile } from '../import/tile-dedup';
import { computeVramColoring, FG_TILE_LIMIT } from '../export/vram-coloring';

function rawHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += pixels[i].toString(16);
  return s;
}

/** Flip-aware canonical hash: minimum of the 4 flip-variant hashes. */
export function canonicalTileHash(pixels: Uint8Array): string {
  let min = rawHash(pixels);
  for (const [xf, yf] of [[true, false], [false, true], [true, true]] as const) {
    const h = rawHash(flipTile(pixels, xf, yf));
    if (h < min) min = h;
  }
  return min;
}

export interface ActBudget {
  perSection: Array<{ index: number; uniqueTiles: number }>;
  groups: Array<{ color: number; unionTiles: number; baseSlot: number }>;
  limit: number;
  fits: boolean;
}

export interface ActLike {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
}

export function computeActBudget(act: ActLike, tilesetTiles: Tile[]): ActBudget {
  const colors = computeVramColoring(
    act.gridWidth, act.gridHeight, act.sections.map(s => s !== null),
  );

  const perSection: ActBudget['perSection'] = [];
  const unionSets: Array<Set<string>> = [new Set(), new Set()];

  for (let i = 0; i < act.sections.length; i++) {
    const section = act.sections[i];
    if (!section) continue;
    const tiles = section.tiles ?? tilesetTiles;
    const seen = new Set<string>();
    const nt = section.tileGrid.nametable;
    for (let j = 0; j < nt.length; j++) {
      if (nt[j] === 0) continue;
      const entry = unpackNametableWord(nt[j]);
      const tile = tiles[entry.tileIndex];
      if (!tile) continue;
      const hash = canonicalTileHash(tile.pixels);
      seen.add(hash);
      unionSets[colors[i]].add(hash);
    }
    perSection.push({ index: i, uniqueTiles: seen.size });
  }

  let cursor = 0;
  const groups: ActBudget['groups'] = [];
  for (let c = 0; c < unionSets.length; c++) {
    groups.push({ color: c, unionTiles: unionSets[c].size, baseSlot: cursor });
    cursor += unionSets[c].size;
  }

  return { perSection, groups, limit: FG_TILE_LIMIT, fits: cursor <= FG_TILE_LIMIT };
}
```

- [x] **Step 4: Export `flipTile` from `src/core/import/tile-dedup.ts`**

Change line 6 from `function flipTile(` to `export function flipTile(`.

- [x] **Step 5: Run tests, expect PASS, run full suite, commit**

Run: `npx vitest run test/agent/budget.test.ts && npx vitest run`

```bash
git add src/core/agent/budget.ts test/agent/budget.test.ts src/core/import/tile-dedup.ts
git commit -m "feat: add flip-aware VRAM budget computation for agent tools"
```

---

## Task 6: Zone-level undo commands (palette line, tileset tiles)

`set_palette` and `write_tiles` mutate zone-level state, which the command system can't reach today (`S4Level` only carries sections). Extend it.

**Files:**
- Modify: `src/core/editing/commands.ts`
- Modify: `src/core/editing/history.ts`
- Create: `test/editing/zone-commands.test.ts`

- [x] **Step 1: Write failing tests**

Create `test/editing/zone-commands.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import type { Tile, Palette } from '../../src/core/model/s4-types';

function makeLevel(): S4Level {
  const palette: Palette = {
    lines: Array.from({ length: 4 }, () => ({
      colors: Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 })),
    })),
  };
  const tiles: Tile[] = [{ pixels: new Uint8Array(64) }];
  return { sections: [], tileset: { tiles, collisionTypes: new Uint8Array(0) }, palette };
}

describe('set-palette-line command', () => {
  it('applies and undoes a palette line swap', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const newColors = Array.from({ length: 16 }, (_, i) => ({ r: i * 10, g: 0, b: 0, a: 255 }));
    history.execute({
      type: 'set-palette-line',
      description: 'agent: set palette line 1',
      sectionIndex: -1,
      line: 1,
      oldColors: level.palette!.lines[1].colors.map(c => ({ ...c })),
      newColors,
    }, level);
    expect(level.palette!.lines[1].colors[5].r).toBe(50);
    history.undo(level);
    expect(level.palette!.lines[1].colors[5].r).toBe(0);
  });
});

describe('set-tileset-tiles command', () => {
  it('appends tiles and removes them on undo', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const newTile: Tile = { pixels: new Uint8Array(64).fill(3) };
    history.execute({
      type: 'set-tileset-tiles',
      description: 'agent: write 1 tile',
      sectionIndex: -1,
      at: 1,
      oldTiles: [null],          // null = appended (didn't exist before)
      newTiles: [newTile],
    }, level);
    expect(level.tileset!.tiles.length).toBe(2);
    expect(level.tileset!.tiles[1].pixels[0]).toBe(3);
    history.undo(level);
    expect(level.tileset!.tiles.length).toBe(1);
  });

  it('replaces existing tiles and restores them on undo', () => {
    const level = makeLevel();
    const history = new EditHistory();
    const replacement: Tile = { pixels: new Uint8Array(64).fill(7) };
    history.execute({
      type: 'set-tileset-tiles',
      description: 'agent: replace tile 0',
      sectionIndex: -1,
      at: 0,
      oldTiles: [{ pixels: new Uint8Array(level.tileset!.tiles[0].pixels) }],
      newTiles: [replacement],
    }, level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(7);
    history.undo(level);
    expect(level.tileset!.tiles[0].pixels[0]).toBe(0);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `npx vitest run test/editing/zone-commands.test.ts`
Expected: FAIL — types don't exist; `S4Level` has no `tileset`/`palette`.

- [x] **Step 3: Extend `src/core/editing/commands.ts`**

Update the imports and `S4Level`, and add the two command interfaces + union members:

```typescript
import type { ObjectPlacement, RingPlacement, Section, Tileset, Palette, Color, Tile } from '../model/s4-types';

export interface S4Level {
  sections: (Section | null)[];
  tileset?: Tileset;   // zone-level; present when zone commands are used
  palette?: Palette;
}
```

Add after `DeleteRingsCommand`:

```typescript
export interface SetPaletteLineCommand extends EditCommand {
  type: 'set-palette-line';
  line: number;
  oldColors: Color[];
  newColors: Color[];
}

export interface SetTilesetTilesCommand extends EditCommand {
  type: 'set-tileset-tiles';
  at: number;                  // first tileset index written
  oldTiles: (Tile | null)[];   // null = slot did not exist (appended)
  newTiles: Tile[];
}
```

And add both to the `AnyCommand` union:

```typescript
  | SetPaletteLineCommand
  | SetTilesetTilesCommand;
```

- [x] **Step 4: Extend `src/core/editing/history.ts`**

The current `applyCommand`/`undoCommand` fetch the section up front and bail if missing — zone commands use `sectionIndex: -1`. Restructure both functions to handle zone commands before the section lookup:

```typescript
function applyCommand(cmd: AnyCommand, level: S4Level): void {
  if (cmd.type === 'set-palette-line') {
    if (level.palette) level.palette.lines[cmd.line].colors = cmd.newColors.map(c => ({ ...c }));
    return;
  }
  if (cmd.type === 'set-tileset-tiles') {
    if (level.tileset) {
      for (let i = 0; i < cmd.newTiles.length; i++) {
        level.tileset.tiles[cmd.at + i] = { pixels: new Uint8Array(cmd.newTiles[i].pixels) };
      }
    }
    return;
  }

  const section = level.sections[cmd.sectionIndex];
  if (!section) return;
  // ... existing switch unchanged ...
}

function undoCommand(cmd: AnyCommand, level: S4Level): void {
  if (cmd.type === 'set-palette-line') {
    if (level.palette) level.palette.lines[cmd.line].colors = cmd.oldColors.map(c => ({ ...c }));
    return;
  }
  if (cmd.type === 'set-tileset-tiles') {
    if (level.tileset) {
      // Walk backwards so appended-slot truncation is safe
      for (let i = cmd.oldTiles.length - 1; i >= 0; i--) {
        const old = cmd.oldTiles[i];
        if (old === null) {
          level.tileset.tiles.splice(cmd.at + i, 1);   // was appended: remove
        } else {
          level.tileset.tiles[cmd.at + i] = { pixels: new Uint8Array(old.pixels) };
        }
      }
    }
    return;
  }

  const section = level.sections[cmd.sectionIndex];
  if (!section) return;
  // ... existing switch unchanged ...
}
```

- [x] **Step 5: Run tests, expect PASS, run full suite, commit**

Run: `npx vitest run test/editing/zone-commands.test.ts && npx vitest run`

```bash
git add src/core/editing/commands.ts src/core/editing/history.ts test/editing/zone-commands.test.ts
git commit -m "feat: add zone-level undo commands for palette lines and tileset tiles"
```

---

## Task 7: Renderer agent handler + preload bridge

**Files:**
- Modify: `src/preload/index.ts` (add agent bridge)
- Create: `src/renderer/agent/agent-handler.ts`
- Modify: `src/renderer/components/MapViewport.tsx` (add `id="map-canvas"` to the `<canvas>` element)
- Modify: `src/renderer/App.tsx` (register handler once on mount)
- Modify: `src/renderer/env.d.ts` (type `window.agentBridge`)

- [x] **Step 1: Add the bridge to `src/preload/index.ts`**

Add below the existing `api` (channel names are string literals here because preload can import from `../shared`; use the constants):

```typescript
import { AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL } from '../shared/agent-protocol';
import type { AgentRequestEnvelope, AgentResponseEnvelope } from '../shared/agent-protocol';

const agentBridge = {
  onRequest: (callback: (envelope: AgentRequestEnvelope) => void): void => {
    ipcRenderer.on(AGENT_REQUEST_CHANNEL, (_event, envelope: AgentRequestEnvelope) => callback(envelope));
  },
  respond: (envelope: AgentResponseEnvelope): void => {
    ipcRenderer.send(AGENT_RESPONSE_CHANNEL, envelope);
  },
};

contextBridge.exposeInMainWorld('agentBridge', agentBridge);

export type AgentBridge = typeof agentBridge;
```

- [x] **Step 2: Type the bridge in `src/renderer/env.d.ts`**

Add (alongside the existing `window.api` declaration style found in the file):

```typescript
import type { AgentBridge } from '../preload/index';

declare global {
  interface Window {
    agentBridge: AgentBridge;
  }
}
```

(Adapt to the file's existing declaration pattern — if it declares `interface Window` directly, extend that.)

- [x] **Step 3: Add the canvas id in `MapViewport.tsx`**

Find the `<canvas ref={canvasRef}` JSX element and add `id="map-canvas"`.

- [x] **Step 4: Create `src/renderer/agent/agent-handler.ts`**

```typescript
import { useProjectStore, getCurrentZone, getCurrentAct } from '../state/projectStore';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import type { S4Level, SetTilesCommand } from '../../core/editing/commands';
import {
  SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE,
  packNametableWord, unpackNametableWord, createChunkDef,
} from '../../core/model/s4-types';
import type { Tile, Zone, Act } from '../../core/model/s4-types';
import { validatePaletteLine, validateTilePixels, validatePaintRegion } from '../../core/agent/validation';
import { computeActBudget } from '../../core/agent/budget';
import { decodeGenesisColor } from '../../core/formats/palette';
import type { AgentRequest, AgentRequestEnvelope, NametableEntrySpec } from '../../shared/agent-protocol';

let registered = false;

export function registerAgentHandler(): void {
  if (registered || !window.agentBridge) return;
  registered = true;
  window.agentBridge.onRequest(async (envelope: AgentRequestEnvelope) => {
    try {
      const result = await handle(envelope.payload);
      window.agentBridge.respond({ id: envelope.id, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      window.agentBridge.respond({ id: envelope.id, ok: false, error: message });
    }
  });
}

interface Ctx { zone: Zone; act: Act; level: S4Level; }

function requireProject(): Ctx {
  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);
  if (!state.project || !zone || !act) throw new Error('no project loaded');
  return {
    zone,
    act,
    level: { sections: act.sections, tileset: zone.tileset, palette: zone.palette },
  };
}

function budgetSummary(ctx: Ctx) {
  return computeActBudget(ctx.act, ctx.zone.tileset.tiles);
}

async function handle(req: AgentRequest): Promise<unknown> {
  switch (req.kind) {
    case 'get-project-info': {
      const ctx = requireProject();
      const state = useProjectStore.getState();
      return {
        project: state.project!.name,
        zone: ctx.zone.id,
        act: { id: ctx.act.id, gridWidth: ctx.act.gridWidth, gridHeight: ctx.act.gridHeight },
        sections: ctx.act.sections.map((s, i) => s ? { index: i, name: s.name } : null),
        tilesetSize: ctx.zone.tileset.tiles.length,
        chunks: state.project!.chunkLibrary.map(c => ({
          id: c.id, name: c.name, w: c.widthTiles, h: c.heightTiles,
        })),
        activeSection: useEditorStore.getState().activeSectionIndex,
      };
    }

    case 'get-palette': {
      const ctx = requireProject();
      return {
        lines: ctx.zone.palette.lines.map(line =>
          line.colors.map(c => ({ r: c.r, g: c.g, b: c.b }))),
      };
    }

    case 'get-tiles': {
      const ctx = requireProject();
      const tiles = ctx.zone.tileset.tiles;
      if (req.start < 0 || req.start >= tiles.length) {
        throw new Error(`start ${req.start} out of range (tileset has ${tiles.length} tiles)`);
      }
      const count = Math.min(req.count, tiles.length - req.start, 256);
      return {
        start: req.start,
        tiles: tiles.slice(req.start, req.start + count).map(t => Array.from(t.pixels)),
      };
    }

    case 'get-nametable-region': {
      const ctx = requireProject();
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty or out of range`);
      const err = validatePaintRegion(req.section, req.x, req.y, req.w, req.h,
        new Array(req.w * req.h).fill({ tile: 0, pal: 0 }),
        { sectionCount: ctx.act.sections.length, tilesetSize: 0x800 });
      if (err && !err.includes('tile')) throw new Error(err);
      const rows: unknown[][] = [];
      for (let r = 0; r < req.h; r++) {
        const row: unknown[] = [];
        for (let c = 0; c < req.w; c++) {
          const idx = (req.y + r) * SECTION_TILES_WIDE + (req.x + c);
          const e = unpackNametableWord(section.tileGrid.nametable[idx]);
          row.push({ ...e, coll: section.tileGrid.collision[idx] });
        }
        rows.push(row);
      }
      return { rows };
    }

    case 'check-budget': {
      const ctx = requireProject();
      const budget = budgetSummary(ctx);
      return req.section !== undefined
        ? { ...budget, perSection: budget.perSection.filter(p => p.index === req.section) }
        : budget;
    }

    case 'set-palette': {
      const ctx = requireProject();
      const err = validatePaletteLine(req.line, req.colors);
      if (err) throw new Error(err);
      const newColors = req.colors.map(w => decodeGenesisColor(w));
      newColors[0] = { ...newColors[0], a: 0 }; // index 0 transparent
      executeCommand({
        type: 'set-palette-line',
        description: `agent: set palette line ${req.line}`,
        sectionIndex: -1,
        line: req.line,
        oldColors: ctx.zone.palette.lines[req.line].colors.map(c => ({ ...c })),
        newColors,
      }, ctx.level);
      return { ok: true, budget: budgetSummary(ctx) };
    }

    case 'write-tiles': {
      const ctx = requireProject();
      const tiles = ctx.zone.tileset.tiles;
      const at = req.at ?? tiles.length;
      if (at < 0 || at > tiles.length) {
        throw new Error(`at=${at} out of range (0-${tiles.length}; writes must be contiguous)`);
      }
      if (at + req.tiles.length > 0x800) throw new Error('tileset would exceed 2048 tiles (11-bit index)');
      const newTiles: Tile[] = [];
      for (let i = 0; i < req.tiles.length; i++) {
        const err = validateTilePixels(req.tiles[i]);
        if (err) throw new Error(`tile ${i}: ${err}`);
        newTiles.push({ pixels: Uint8Array.from(req.tiles[i]) });
      }
      const oldTiles = newTiles.map((_, i) =>
        at + i < tiles.length ? { pixels: new Uint8Array(tiles[at + i].pixels) } : null);
      executeCommand({
        type: 'set-tileset-tiles',
        description: `agent: write ${newTiles.length} tiles at ${at}`,
        sectionIndex: -1,
        at,
        oldTiles,
        newTiles,
      }, ctx.level);
      return { at, count: newTiles.length, budget: budgetSummary(ctx) };
    }

    case 'paint-region': {
      const ctx = requireProject();
      const section = ctx.act.sections[req.section];
      if (!section) throw new Error(`section ${req.section} is empty or out of range`);
      const err = validatePaintRegion(req.section, req.x, req.y, req.w, req.h, req.entries, {
        sectionCount: ctx.act.sections.length,
        tilesetSize: ctx.zone.tileset.tiles.length,
      });
      if (err) throw new Error(err);
      const entries: SetTilesCommand['entries'] = [];
      for (let r = 0; r < req.h; r++) {
        for (let c = 0; c < req.w; c++) {
          const spec = req.entries[r * req.w + c];
          const idx = (req.y + r) * SECTION_TILES_WIDE + (req.x + c);
          const oldNt = section.tileGrid.nametable[idx];
          const oldColl = section.tileGrid.collision[idx];
          entries.push({
            index: idx,
            oldNt,
            newNt: packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf),
            oldColl,
            newColl: spec.coll ?? oldColl,
          });
        }
      }
      executeCommand({
        type: 'set-tiles',
        description: `agent: paint ${req.w}x${req.h} at (${req.x},${req.y})`,
        sectionIndex: req.section,
        entries,
      }, ctx.level);
      return { painted: entries.length, budget: budgetSummary(ctx) };
    }

    case 'save-chunk': {
      const ctx = requireProject();
      if (req.w < 1 || req.h < 1 || req.entries.length !== req.w * req.h) {
        throw new Error(`entries length ${req.entries.length} != ${req.w}x${req.h}`);
      }
      const state = useProjectStore.getState();
      const id = `agent-${Date.now()}-${state.project!.chunkLibrary.length}`;
      const chunk = createChunkDef(id, req.name, req.w, req.h);
      req.entries.forEach((spec, i) => {
        chunk.nametable[i] = packNametableWord(spec.tile, spec.pal, !!spec.pri, !!spec.vf, !!spec.hf);
        chunk.collision[i] = spec.coll ?? 0;
      });
      state.addChunks([chunk]);
      // Note: chunk library additions are not part of EditHistory (matches
      // existing ChunkLibrary behavior); they are additive and non-destructive.
      return { id };
    }

    case 'stamp-chunk': {
      const ctx = requireProject();
      const state = useProjectStore.getState();
      const chunk = state.project!.chunkLibrary.find(c => c.id === req.chunkId);
      if (!chunk) throw new Error(`chunk ${req.chunkId} not found`);
      const entries: NametableEntrySpec[] = [];
      for (let i = 0; i < chunk.widthTiles * chunk.heightTiles; i++) {
        const e = unpackNametableWord(chunk.nametable[i]);
        entries.push({ tile: e.tileIndex, pal: e.palette, pri: e.priority, hf: e.hFlip, vf: e.vFlip, coll: chunk.collision[i] });
      }
      return handle({
        kind: 'paint-region',
        section: req.section, x: req.x, y: req.y,
        w: chunk.widthTiles, h: chunk.heightTiles, entries,
      });
    }

    case 'goto': {
      const ctx = requireProject();
      if (req.section < 0 || req.section >= ctx.act.sections.length) {
        throw new Error(`section ${req.section} out of range`);
      }
      useEditorStore.getState().setActiveSectionIndex(req.section);
      const col = req.section % ctx.act.gridWidth;
      const row = Math.floor(req.section / ctx.act.gridWidth);
      const view = useViewStore.getState();
      if (req.zoom !== undefined) view.setZoom(req.zoom);
      view.setPosition(
        col * SECTION_PIXEL_SIZE + (req.x ?? 0) * 8,
        row * SECTION_PIXEL_SIZE + (req.y ?? 0) * 8,
      );
      return { section: req.section, vpX: useViewStore.getState().vpX, vpY: useViewStore.getState().vpY, zoom: useViewStore.getState().zoom };
    }

    case 'screenshot': {
      requireProject();
      const canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
      if (!canvas) throw new Error('map canvas not found — is the viewport mounted?');
      // Give the renderer a frame to flush pending paints (e.g. right after goto/paint)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      let source: HTMLCanvasElement = canvas;
      if (req.region) {
        const { x, y, w, h } = req.region;
        if (w < 1 || h < 1 || x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) {
          throw new Error(`region out of canvas bounds (canvas is ${canvas.width}x${canvas.height})`);
        }
        const crop = document.createElement('canvas');
        crop.width = w; crop.height = h;
        crop.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
        source = crop;
      }
      const dataUrl = source.toDataURL('image/png');
      return { pngBase64: dataUrl.slice('data:image/png;base64,'.length), width: source.width, height: source.height };
    }
  }
}
```

- [x] **Step 5: Register the handler in `src/renderer/App.tsx`**

Add the import and a one-time effect (place with the other top-level hooks in the App component):

```typescript
import { useEffect } from 'react';
import { registerAgentHandler } from './agent/agent-handler';

// inside the App component body:
useEffect(() => { registerAgentHandler(); }, []);
```

- [x] **Step 6: Build and run suite**

Run: `npm run build && npx vitest run`
Expected: clean build, all tests pass. Fix any import-path or type errors (e.g. `decodeGenesisColor` signature — check `src/core/formats/palette.ts` and adapt the call if it returns `{r,g,b,a}` vs takes extra args).

- [x] **Step 7: Commit**

```bash
git add src/preload/index.ts src/renderer/agent/agent-handler.ts src/renderer/components/MapViewport.tsx src/renderer/App.tsx src/renderer/env.d.ts
git commit -m "feat: renderer agent handler + preload bridge (mutations, navigation, screenshots)"
```

---

## Task 8: Main-process agent bridge (request/response correlation)

**Files:**
- Create: `src/main/agent-bridge.ts`

- [x] **Step 1: Create `src/main/agent-bridge.ts`**

```typescript
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL,
} from '../shared/agent-protocol';
import type { AgentRequest, AgentResponseEnvelope } from '../shared/agent-protocol';

const REQUEST_TIMEOUT_MS = 30_000;

let nextId = 1;
const pending = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}>();

let listenerInstalled = false;

function installListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  ipcMain.on(AGENT_RESPONSE_CHANNEL, (_event, envelope: AgentResponseEnvelope) => {
    const entry = pending.get(envelope.id);
    if (!entry) return;
    pending.delete(envelope.id);
    clearTimeout(entry.timer);
    if (envelope.ok) entry.resolve(envelope.result);
    else entry.reject(new Error(envelope.error ?? 'agent request failed'));
  });
}

/** Send a request to the renderer's agent handler and await its response. */
export function requestAgent(win: BrowserWindow, payload: AgentRequest): Promise<unknown> {
  installListener();
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.reject(new Error('editor not ready (window closed)'));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`agent request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send(AGENT_REQUEST_CHANNEL, { id, payload });
  });
}
```

- [x] **Step 2: Build and commit**

Run: `npm run build`

```bash
git add src/main/agent-bridge.ts
git commit -m "feat: main-process agent bridge with request correlation and timeouts"
```

---

## Task 9: MCP server in the main process

**Files:**
- Modify: `package.json` (deps)
- Create: `src/main/mcp-server.ts`
- Modify: `src/main/index.ts` (start/stop wiring)

- [x] **Step 1: Install dependencies**

```bash
npm install @modelcontextprotocol/sdk zod express
npm install -D @types/express
```

**API drift guard:** after install, skim `node_modules/@modelcontextprotocol/sdk/README.md` for the current `McpServer`/`registerTool`/`StreamableHTTPServerTransport` usage. The code below follows the documented stateless-HTTP pattern; adapt names if the installed major version differs.

- [x] **Step 2: Create `src/main/mcp-server.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import { app as electronApp } from 'electron';
import type { BrowserWindow } from 'electron';
import { createServer } from 'http';
import type { Server } from 'http';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { requestAgent } from './agent-bridge';
import type { AgentRequest } from '../shared/agent-protocol';

const DEFAULT_PORT = 38473;

const entrySchema = z.object({
  tile: z.number().int().describe('tileset tile index'),
  pal: z.number().int().min(0).max(3).describe('palette line 0-3'),
  pri: z.boolean().optional().describe('VDP priority bit'),
  hf: z.boolean().optional().describe('horizontal flip'),
  vf: z.boolean().optional().describe('vertical flip'),
  coll: z.number().int().min(0).max(255).optional().describe('collision type; omit to keep existing'),
});

function buildServer(getWindow: () => BrowserWindow | null): McpServer {
  const server = new McpServer({ name: 'sonic-level-editor', version: '0.1.0' });

  const forward = async (payload: AgentRequest) => {
    const win = getWindow();
    if (!win) throw new Error('editor not ready (no window)');
    return requestAgent(win, payload);
  };

  const textResult = (value: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  });

  server.registerTool('get_project_info',
    { description: 'Project, zone, act grid, sections, tileset size, chunk library, active section.' },
    async () => textResult(await forward({ kind: 'get-project-info' })));

  server.registerTool('get_palette',
    { description: 'The active 4x16 palette as RGB per line. Line 0 is sprite-reserved; index 0 of each line is transparent.' },
    async () => textResult(await forward({ kind: 'get-palette' })));

  server.registerTool('get_tiles',
    {
      description: 'Read raw 8x8 tiles as 64 palette indices each (max 256 per call).',
      inputSchema: { start: z.number().int().min(0), count: z.number().int().min(1).max(256) },
    },
    async ({ start, count }) => textResult(await forward({ kind: 'get-tiles', start, count })));

  server.registerTool('get_nametable_region',
    {
      description: 'Decoded nametable entries (tileIndex, palette, flips, priority, collision) for a tile-coordinate rectangle of a section.',
      inputSchema: {
        section: z.number().int().min(0), x: z.number().int().min(0), y: z.number().int().min(0),
        w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64),
      },
    },
    async (args) => textResult(await forward({ kind: 'get-nametable-region', ...args })));

  server.registerTool('check_budget',
    {
      description: 'Flip-aware unique-tile counts per section and per VRAM color group vs the 1024-tile FG pool. fits=false means export will fail.',
      inputSchema: { section: z.number().int().min(0).optional() },
    },
    async ({ section }) => textResult(await forward({ kind: 'check-budget', section })));

  server.registerTool('set_palette',
    {
      description: 'Write one palette line (1-3) as 16 Genesis CRAM words (0000BBB0GGG0RRR0, even channel values only). One undo step.',
      inputSchema: { line: z.number().int().min(1).max(3), colors: z.array(z.number().int()).length(16) },
    },
    async ({ line, colors }) => textResult(await forward({ kind: 'set-palette', line, colors })));

  server.registerTool('write_tiles',
    {
      description: 'Append or overwrite tileset tiles. Each tile is 64 pixel values 0-15 (index 0 = transparent). Omit "at" to append. One undo step.',
      inputSchema: {
        tiles: z.array(z.array(z.number().int().min(0).max(15)).length(64)).min(1).max(128),
        at: z.number().int().min(0).optional(),
      },
    },
    async ({ tiles, at }) => textResult(await forward({ kind: 'write-tiles', tiles, at })));

  server.registerTool('paint_region',
    {
      description: 'Paint a w*h tile rectangle of a section with nametable entries (row-major). One undo step. Reply includes updated VRAM budget.',
      inputSchema: {
        section: z.number().int().min(0),
        x: z.number().int().min(0), y: z.number().int().min(0),
        w: z.number().int().min(1), h: z.number().int().min(1),
        entries: z.array(entrySchema),
      },
    },
    async (args) => textResult(await forward({ kind: 'paint-region', ...args })));

  server.registerTool('save_chunk',
    {
      description: 'Save a reusable w*h pattern into the chunk library (row-major entries). Returns the chunk id.',
      inputSchema: {
        name: z.string().min(1),
        w: z.number().int().min(1).max(64), h: z.number().int().min(1).max(64),
        entries: z.array(entrySchema),
      },
    },
    async (args) => textResult(await forward({ kind: 'save-chunk', ...args })));

  server.registerTool('stamp_chunk',
    {
      description: 'Stamp a library chunk onto a section at tile coordinates. One undo step.',
      inputSchema: {
        chunkId: z.string(), section: z.number().int().min(0),
        x: z.number().int().min(0), y: z.number().int().min(0),
      },
    },
    async (args) => textResult(await forward({ kind: 'stamp-chunk', ...args })));

  server.registerTool('goto',
    {
      description: 'Set the active section and scroll the shared viewport to tile coords (x,y) at optional zoom (0.125-8).',
      inputSchema: {
        section: z.number().int().min(0),
        x: z.number().int().min(0).optional(), y: z.number().int().min(0).optional(),
        zoom: z.number().min(0.125).max(8).optional(),
      },
    },
    async (args) => textResult(await forward({ kind: 'goto', ...args })));

  server.registerTool('screenshot',
    {
      description: 'PNG of the map canvas (current viewport). Optional region crop in canvas pixels.',
      inputSchema: {
        region: z.object({
          x: z.number().int().min(0), y: z.number().int().min(0),
          w: z.number().int().min(1), h: z.number().int().min(1),
        }).optional(),
      },
    },
    async ({ region }) => {
      const result = await forward({ kind: 'screenshot', region }) as { pngBase64: string };
      return { content: [{ type: 'image' as const, data: result.pngBase64, mimeType: 'image/png' }] };
    });

  return server;
}

let httpServer: Server | null = null;
let discoveryPath: string | null = null;

export async function startMcpServer(getWindow: () => BrowserWindow | null): Promise<void> {
  const exp = express();
  exp.use(express.json({ limit: '16mb' }));

  // Stateless Streamable HTTP: fresh server+transport per POST (SDK-documented pattern)
  exp.post('/mcp', async (req, res) => {
    try {
      const server = buildServer(getWindow);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err);
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    }
  });
  exp.get('/mcp', (_req, res) => { res.status(405).end(); });
  exp.delete('/mcp', (_req, res) => { res.status(405).end(); });

  const listen = (port: number) => new Promise<number>((resolve, reject) => {
    const srv = createServer(exp);
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => {
      httpServer = srv;
      const addr = srv.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });

  let port: number;
  try {
    port = await listen(DEFAULT_PORT);
  } catch {
    port = await listen(0); // fallback to an ephemeral port
  }

  const dir = join(electronApp.getPath('home'), '.sonic-level-editor');
  mkdirSync(dir, { recursive: true });
  discoveryPath = join(dir, 'mcp.json');
  writeFileSync(discoveryPath, JSON.stringify({
    url: `http://127.0.0.1:${port}/mcp`, port, pid: process.pid,
  }, null, 2));
  console.log(`[mcp] listening on http://127.0.0.1:${port}/mcp`);
}

export function stopMcpServer(): void {
  if (httpServer) { httpServer.close(); httpServer = null; }
  if (discoveryPath) {
    try { rmSync(discoveryPath); } catch { /* already gone */ }
    discoveryPath = null;
  }
}
```

- [x] **Step 3: Wire into `src/main/index.ts`**

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerIpcHandlers } from './ipc-handlers';
import { startMcpServer, stopMcpServer } from './mcp-server';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Sonic Level Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  mainWindow = win;
  return win;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  startMcpServer(() => mainWindow).catch(err => console.error('[mcp] failed to start:', err));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => { stopMcpServer(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

- [x] **Step 4: Build, full suite**

Run: `npm run build && npx vitest run`
Expected: clean. If electron-vite complains about bundling express/SDK into the main bundle, add them to `build.rollupOptions.external` is NOT correct (they must be bundled or available at runtime) — instead check `electron.vite.config.ts`: the default externalizes `dependencies`, which is fine because they're in `dependencies` and present in `node_modules` at runtime.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main/mcp-server.ts src/main/index.ts
git commit -m "feat: embed MCP server in main process (12 tools, stateless HTTP, discovery file)"
```

---

## Task 10: Documentation + final verification

**Files:**
- Create: `docs/MCP.md`
- Modify: `docs/specs/2026-06-11-mcp-art-generation-design.md` (note save_chunk undo nuance)

- [x] **Step 1: Write `docs/MCP.md`**

```markdown
# MCP Integration

The editor embeds an MCP server (Streamable HTTP) while running. It exposes
art-generation tools that operate on the live editing session — every mutation
is one undo step (Ctrl+Z), and nothing touches disk until you save.

## Connect (one time)

1. Launch the editor (`npm run dev`).
2. Check the port in `~/.sonic-level-editor/mcp.json` (default 38473).
3. `claude mcp add --transport http sonic-editor http://127.0.0.1:38473/mcp`

## Tools

Query: `get_project_info`, `get_palette`, `get_tiles`, `get_nametable_region`, `check_budget`
Mutate (one undo step each): `set_palette`, `write_tiles`, `paint_region`, `save_chunk`*, `stamp_chunk`
View: `goto`, `screenshot`

*`save_chunk` adds to the chunk library outside undo history (additive only),
matching the existing chunk-library behavior.

## Constraints enforced at the tool boundary

- Colors: Genesis 9-bit BGR, even channel values; palette line 0 rejected (sprite-reserved).
- Tiles: 8x8, pixel values 0-15, index 0 transparent; tileset capped at 2048.
- Budget: flip-aware unique tiles per VRAM color group must fit the 1024-tile FG pool
  (BG region starts at slot 1024). `check_budget` and every mutation reply report it.
```

- [x] **Step 2: Amend the spec's undo note**

In `docs/specs/2026-06-11-mcp-art-generation-design.md`, in the Mutate table row for `save_chunk`, append: "(chunk-library addition; additive and outside undo history, matching existing ChunkLibrary behavior)".

- [x] **Step 3: Final verification**

```bash
npx vitest run          # all green
npm run build           # clean build
```

- [x] **Step 4: Commit**

```bash
git add docs/MCP.md docs/specs/2026-06-11-mcp-art-generation-design.md
git commit -m "docs: MCP usage guide and spec clarification"
```

- [x] **Step 5: Manual E2E checklist (requires the user / a head)**

Left for the user after the overnight run — listed here so it isn't forgotten:
1. `npm run dev`, load the OJZ project.
2. `claude mcp add --transport http sonic-editor http://127.0.0.1:38473/mcp` (or port from `~/.sonic-level-editor/mcp.json`).
3. In a Claude Code session: `get_project_info` → `goto` section 1 → `screenshot` → `paint_region` a small rect → verify it appears live → Ctrl+Z removes it in one step → `check_budget`.

---

## Self-Review Notes

- Spec coverage: prerequisites (Tasks 1–2), pure logic + tests (4–5), undo integration (6), IPC + handler (7–8), MCP server + lifecycle + discovery (9), docs + verification (10). All 12 tools from the spec are implemented (spec said "ten tools" counting save/stamp and goto/screenshot pairs as grouped).
- Known judgment calls an executor must respect:
  - `decodeGenesisColor` call in Task 7 — verify the actual signature in `src/core/formats/palette.ts` and adapt.
  - `env.d.ts` declaration style — match the file's existing pattern for `window.api`.
  - SDK API drift — check installed `@modelcontextprotocol/sdk` README before writing Task 9 code.
- Out of scope (do NOT add): PNG import, object/ring/collision tools, undo tool, headless mode, saving as a tool side effect.
