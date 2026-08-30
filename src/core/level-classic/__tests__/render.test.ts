import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { renderChunk, renderTile } from '../render';
import { s1Adapter } from '../../project/s1';
import { referencePath } from '../../../../test/support/fixture-tree';
import type {
  LevelDoc,
  BlockDef,
  BlockCell,
  ChunkDef256,
  ChunkCell,
} from '../model';

// ---------------------------------------------------------------------------
// Hand-built fixture. Everything is computed by hand in comments so each pixel
// assertion is falsifiable.
//
// Tile pool (3 tiles, 4bpp packed, 32 bytes each; high nibble = left pixel):
//   tile 0 — all zeros → fully transparent.
//   tile 1 — pixel (0,0) = color index 1, rest 0. byte0 = 0x10.
//   tile 2 — pixel (0,0) = color index 2, rest 0. byte0 = 0x20.
// A single non-transparent corner pixel makes every flip combo land the marker
// on a DISTINCT corner, so flips are provable:
//   no flip → (0,0)   xf → (7,0)   yf → (0,7)   xf+yf → (7,7)
//
// Palettes (CRAM 0BGR 3-3-3 words; decode: b=(w>>9)&7, g=(w>>5)&7, r=(w>>1)&7):
//   pal0[1] = 0x000E → r=7 → {255,0,0,255}   (red)
//   pal0[2] = 0x00E0 → g=7 → {0,255,0,255}   (green)
//   pal1[2] = 0x0EEE → all 7 → {255,255,255,255} (white)
// Color index 0 is always transparent (alpha 0).

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

function makeTiles(): Uint8Array {
  const t = new Uint8Array(3 * 32);
  t[1 * 32 + 0] = 0x10; // tile 1: (0,0) = index 1
  t[2 * 32 + 0] = 0x20; // tile 2: (0,0) = index 2
  return t;
}

function makePalettes(): Uint16Array[] {
  const pals = [
    new Uint16Array(16),
    new Uint16Array(16),
    new Uint16Array(16),
    new Uint16Array(16),
  ];
  pals[0][1] = 0x000e; // red
  pals[0][2] = 0x00e0; // green
  pals[1][2] = 0x0eee; // white
  return pals;
}

function cell(tile: number, xf: boolean, yf: boolean, pal: number): BlockCell {
  return { tile, xf, yf, pal, pri: false };
}

const EMPTY = cell(0, false, false, 0);

function makeBlocks(): BlockDef[] {
  // block 0 — four-flip block: tile 1 in every slot, one flip combo each.
  //   TL no flip     → marker at block (0,0)
  //   TR xf          → marker at block (8+7,0)   = (15,0)
  //   BL yf          → marker at block (0,8+7)   = (0,15)
  //   BR xf+yf       → marker at block (15,15)
  const block0: BlockDef = {
    cells: [
      cell(1, false, false, 0),
      cell(1, true, false, 0),
      cell(1, false, true, 0),
      cell(1, true, true, 0),
    ],
  };

  // block 1 — single red marker at block (0,0), rest transparent. Asymmetric,
  // so a chunk-level flip visibly relocates the marker.
  const block1: BlockDef = {
    cells: [cell(1, false, false, 0), EMPTY, EMPTY, EMPTY],
  };

  // block 2 — TL tile 1 with a BLOCK-CELL xf → marker at block (7,0). Used to
  // prove chunk-xf ∘ block-xf composition.
  const block2: BlockDef = {
    cells: [cell(1, true, false, 0), EMPTY, EMPTY, EMPTY],
  };

  // block 3 — TL tile 2 (index 2), palette line 1 → white marker at (0,0).
  const block3: BlockDef = {
    cells: [cell(2, false, false, 1), EMPTY, EMPTY, EMPTY],
  };

  return [block0, block1, block2, block3];
}

function chunkCell(block: number, xf: boolean, yf: boolean): ChunkCell {
  return { block, xf, yf, solidity: 0 };
}

function makeChunk(): ChunkDef256 {
  // Start every cell as an OUT-OF-RANGE block ref (900, within the 10-bit field
  // but past the 4-entry block array) → must render transparent, not throw.
  const cells: ChunkCell[] = Array.from({ length: 256 }, () => chunkCell(900, false, false));

  const at = (cx: number, cy: number) => cy * 16 + cx;

  cells[at(0, 0)] = chunkCell(0, false, false); // four red corners in 16x16 at origin
  cells[at(1, 0)] = chunkCell(1, true, false); // block1 marker (0,0) -xf-> (15,0); +x16 → (31,0)
  cells[at(2, 0)] = chunkCell(1, false, true); // block1 marker (0,0) -yf-> (0,15); +x32 → (32,15)
  cells[at(3, 0)] = chunkCell(1, true, true); // block1 marker (0,0) -xf+yf-> (15,15); +x48 → (63,15)
  cells[at(0, 1)] = chunkCell(2, true, false); // block2 marker (7,0) -chunk xf-> (8,0); +y16 → (8,16)
  cells[at(5, 0)] = chunkCell(3, false, false); // block3 white marker (0,0); +x80 → (80,0)
  // cell (4,0) is left as the out-of-range 900 ref → transparent block region.

  return { cells };
}

function makeDoc(): LevelDoc {
  return {
    game: 's1',
    tiles: makeTiles(),
    blocks: makeBlocks(),
    chunks: [makeChunk()],
    fg: { width: 1, height: 1, cells: new Uint8Array(1) },
    bg: { width: 1, height: 1, cells: new Uint8Array(1) },
    collision: {
      colind: new Uint8Array(4),
      shapes: { heights: [], angles: new Uint8Array() },
    },
    palettes: makePalettes(),
    paletteSources: [] as unknown as LevelDoc['paletteSources'],
    objects: [],
    start: { x: 0, y: 0 },
    sourceRefs: {},
  };
}

// RGBA at (x,y) in a 256-wide buffer.
function px(buf: Uint8ClampedArray, x: number, y: number, w = 256): number[] {
  const o = (y * w + x) * 4;
  return [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]];
}

describe('renderTile', () => {
  const tiles = makeTiles();
  const pal0 = makePalettes()[0];

  it('renders index 0 as transparent and index 1 as its palette color', () => {
    const buf = renderTile(tiles, 1, pal0, false, false);
    expect(buf.length).toBe(8 * 8 * 4);
    expect(px(buf, 0, 0, 8)).toEqual(RED); // marker (0,0)
    expect(px(buf, 1, 0, 8)).toEqual([0, 0, 0, 0]); // index 0 → transparent
    expect(px(buf, 7, 7, 8)).toEqual([0, 0, 0, 0]);
  });

  it('x-flip moves the (0,0) marker to (7,0)', () => {
    const buf = renderTile(tiles, 1, pal0, true, false);
    expect(px(buf, 7, 0, 8)).toEqual(RED);
    expect(px(buf, 0, 0, 8)).toEqual([0, 0, 0, 0]);
  });

  it('y-flip moves the (0,0) marker to (0,7)', () => {
    const buf = renderTile(tiles, 1, pal0, false, true);
    expect(px(buf, 0, 7, 8)).toEqual(RED);
    expect(px(buf, 0, 0, 8)).toEqual([0, 0, 0, 0]);
  });

  it('x+y flip moves the (0,0) marker to (7,7)', () => {
    const buf = renderTile(tiles, 1, pal0, true, true);
    expect(px(buf, 7, 7, 8)).toEqual(RED);
    expect(px(buf, 0, 0, 8)).toEqual([0, 0, 0, 0]);
  });

  it('out-of-range tile index renders fully transparent without throwing', () => {
    const buf = renderTile(tiles, 999, pal0, false, false);
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});

describe('renderChunk', () => {
  const doc = makeDoc();

  it('produces a 256x256 RGBA buffer', () => {
    const buf = renderChunk(doc, 1);
    expect(buf.length).toBe(256 * 256 * 4);
    expect(buf).toBeInstanceOf(Uint8ClampedArray);
  });

  it('renders engine id 0 (air) as a fully transparent buffer (S1 layout is 1-based)', () => {
    // The hand-built doc has ONE chunk. Under 1-based S1 semantics engine id 1
    // draws it; id 0 is blank/air and must compose to nothing, even though
    // doc.chunks[0] is a real, non-empty chunk.
    const buf = renderChunk(doc, 0);
    expect(buf.length).toBe(256 * 256 * 4);
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  it('draws the file\'s first chunk at engine id 1, not id 0', () => {
    // Same marker the four-corner test checks, but asserted here as the id-1↔
    // chunks[0] contract: id 1 is non-empty, id 0 is empty.
    expect(px(renderChunk(doc, 1), 0, 0)).toEqual(RED);
    expect(px(renderChunk(doc, 0), 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('resolves block 0 through all four block-cell flip combos to four corners', () => {
    const buf = renderChunk(doc, 1);
    expect(px(buf, 0, 0)).toEqual(RED); // TL no flip
    expect(px(buf, 15, 0)).toEqual(RED); // TR xf
    expect(px(buf, 0, 15)).toEqual(RED); // BL yf
    expect(px(buf, 15, 15)).toEqual(RED); // BR xf+yf
    // interior of the block is transparent
    expect(px(buf, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(px(buf, 8, 8)).toEqual([0, 0, 0, 0]);
  });

  it('chunk-cell x-flip mirrors the whole 16x16 block', () => {
    // block1 marker at block-local (0,0), chunk cell (1,0) with xf.
    // xf: (0,0) → (15,0); cell x offset 16 → (31,0).
    const buf = renderChunk(doc, 1);
    expect(px(buf, 31, 0)).toEqual(RED);
    expect(px(buf, 16, 0)).toEqual([0, 0, 0, 0]); // marker is NOT at the unflipped spot
  });

  it('chunk-cell y-flip mirrors the whole 16x16 block', () => {
    // cell (2,0) yf: (0,0) → (0,15); x offset 32 → (32,15).
    const buf = renderChunk(doc, 1);
    expect(px(buf, 32, 15)).toEqual(RED);
    expect(px(buf, 32, 0)).toEqual([0, 0, 0, 0]);
  });

  it('chunk-cell x+y flip mirrors to the opposite corner', () => {
    // cell (3,0) xf+yf: (0,0) → (15,15); x offset 48 → (63,15).
    const buf = renderChunk(doc, 1);
    expect(px(buf, 63, 15)).toEqual(RED);
    expect(px(buf, 48, 0)).toEqual([0, 0, 0, 0]);
  });

  it('composes chunk-cell xf with block-cell xf: net-unflipped pixel, mirrored cell position', () => {
    // block2: TL tile1 with block-cell xf → marker at block-local (7,0)
    //   (right edge of the LEFT 8x8 slot).
    // chunk cell (0,1) applies chunk xf → whole 16x16 mirrors: (7,0) → (8,0)
    //   (left edge of the RIGHT 8x8 slot). Cell y offset 16 → chunk (8,16).
    // Two x-flips cancel to the tile's natural left-edge pixel, but the tile has
    // moved from the left half to the right half — mirrored cell position.
    const buf = renderChunk(doc, 1);
    expect(px(buf, 8, 16)).toEqual(RED);
    // NOT at block2's un-composed marker spot (7,16), NOR the origin (0,16).
    expect(px(buf, 7, 16)).toEqual([0, 0, 0, 0]);
    expect(px(buf, 0, 16)).toEqual([0, 0, 0, 0]);
  });

  it('selects the correct palette line and color index', () => {
    // block3 TL: tile2 (index 2), palette line 1 → pal1[2] = white at (80,0).
    const buf = renderChunk(doc, 1);
    expect(px(buf, 80, 0)).toEqual(WHITE);
  });

  it('renders an out-of-range block ref as transparent without throwing', () => {
    // cell (4,0) holds block ref 900 (past the 4-entry block array).
    const buf = renderChunk(doc, 1);
    for (let y = 0; y < 16; y++) {
      for (let x = 64; x < 80; x++) {
        expect(px(buf, x, y)).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it('renders a missing chunk id as a transparent buffer without throwing', () => {
    const buf = renderChunk(doc, 99);
    expect(buf.length).toBe(256 * 256 * 4);
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Golden: real GHZ1 through the S1 adapter. Cell (0,0) of the FG layout is byte
// $00 → air, so composing that cell must be transparent; a known ground cell
// (first non-zero layout id) must render something. Proves the 1-based mapping
// end-to-end against actual game data. skipIf-gated so CI without the disasm
// tree stays green.
// ---------------------------------------------------------------------------

const S1DIR = referencePath('s1disasm');

function realFs(root: string) {
  return {
    async exists(rel: string) { return fs.existsSync(`${root}/${rel}`); },
    async read(rel: string) { return new Uint8Array(fs.readFileSync(`${root}/${rel}`)); },
    async list(rel: string) { return fs.readdirSync(`${root}/${rel}`); },
  };
}

const anyOpaque = (buf: Uint8ClampedArray): boolean => {
  for (let i = 3; i < buf.length; i += 4) if (buf[i] !== 0) return true;
  return false;
};

describe('renderChunk golden (real GHZ1)', { skip: !fs.existsSync(`${S1DIR}/levels/ghz1.bin`), meta: { skipReason: `${S1DIR}/levels/ghz1.bin is absent — this machine has no s1disasm checkout` } }, () => {
  it('cell (0,0) is air (id 0) → transparent, and a ground cell renders opaque', async () => {
    const fa = realFs(S1DIR);
    const handle = await s1Adapter.open(fa);
    const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1 && r.available);
    expect(ref).toBeDefined();
    const doc = await handle.levels!.read(ref!);

    // Top-left of GHZ1's FG is open sky → layout byte $00 = air.
    const topLeft = doc.fg.cells[0] & 0x7f;
    expect(topLeft).toBe(0);
    expect(anyOpaque(renderChunk(doc, topLeft))).toBe(false);

    // First non-air layout cell → a real chunk that draws something.
    let groundId = 0;
    for (let i = 0; i < doc.fg.cells.length; i++) {
      const id = doc.fg.cells[i] & 0x7f;
      if (id !== 0) { groundId = id; break; }
    }
    expect(groundId).toBeGreaterThan(0);
    expect(anyOpaque(renderChunk(doc, groundId))).toBe(true);
  });
});
