import { describe, it, expect } from 'vitest';
import {
  TILE_RGBA_BYTES,
  lutFromCramWords,
  lutFromColors,
  lutForPaletteLine,
  unpack4bppTile,
  rasterizeTile,
  blitRgba,
  rasterizeNametableChunk,
} from '../rasterize';
import { decodeGenesisColor } from '../../formats/palette';
import { packNametableWord, unpackNametableWord } from '../../model/s4-types';
import type { ChunkDef, Tile, Palette, Color } from '../../model/s4-types';
import { renderChunk, renderTile, renderBlock } from '../../level-classic/render';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell, BlockCell } from '../../level-classic/model';

// ---------------------------------------------------------------------------
// Reference implementations.
//
// Same technique as src/renderer/canvas/__tests__/compose-nametable.test.ts:
// replay the semantics of the code being replaced, naively and without sharing
// any code with the implementation under test, then compare bytes.
//
// There are TWO references here because the two engines genuinely differ:
//
//  - CLASSIC (src/core/level-classic/render.ts, pre-extraction): 4bpp packed
//    tile pool + raw CRAM words. Colour index 0 is skipped entirely, so those
//    pixels keep the zeroed buffer's (0,0,0,0) — the palette's own colour 0 is
//    never consulted. Chunks are block-indirect (chunk cell → block → 4 tiles)
//    and the chunk cell's flip mirrors the WHOLE 16x16 block.
//
//  - AEON (ChunkLibrary.renderChunkThumbnail / TilesetPanel + ArtBrowser
//    ensureTileCache, pre-extraction): byte-per-pixel tiles + Color objects.
//    Every pixel is written from the palette entry INCLUDING colour 0 and
//    INCLUDING its alpha, and a missing palette entry falls back to opaque
//    black. Chunks are a flat nametable — no block level.
//
// Those two transparency rules are why classic CRAM must not be routed through
// `Color`: index 0 means "(0,0,0,0)" for classic and "whatever colour 0 says"
// for aeon, and the CRAM word for index 0 decodes to a real RGB triple.
// ---------------------------------------------------------------------------

// ---- classic reference (verbatim replay of the old render.ts) ----

function refRenderTile(
  tiles: Uint8Array,
  tileIndex: number,
  palette: Uint16Array,
  xf: boolean,
  yf: boolean,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(8 * 8 * 4);
  const base = tileIndex * 32;
  if (tileIndex < 0 || base + 32 > tiles.length) return out;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const byte = tiles[base + y * 4 + (x >> 1)];
      const index = (x & 1) === 0 ? (byte >> 4) & 0xf : byte & 0xf;
      if (index === 0) continue;
      const dx = xf ? 7 - x : x;
      const dy = yf ? 7 - y : y;
      const o = (dy * 8 + dx) * 4;
      const c = decodeGenesisColor(palette[index] ?? 0);
      out[o] = c.r;
      out[o + 1] = c.g;
      out[o + 2] = c.b;
      out[o + 3] = 255;
    }
  }
  return out;
}

function refBlit(
  dest: Uint8ClampedArray,
  destW: number,
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  xf: boolean,
  yf: boolean,
): void {
  for (let y = 0; y < srcH; y++) {
    const sy = yf ? srcH - 1 - y : y;
    for (let x = 0; x < srcW; x++) {
      const sx = xf ? srcW - 1 - x : x;
      const so = (sy * srcW + sx) * 4;
      const doff = ((dy + y) * destW + (dx + x)) * 4;
      dest[doff] = src[so];
      dest[doff + 1] = src[so + 1];
      dest[doff + 2] = src[so + 2];
      dest[doff + 3] = src[so + 3];
    }
  }
}

function refRenderBlock(doc: LevelDoc, blockId: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(16 * 16 * 4);
  const block = doc.blocks[blockId];
  if (!block) return out;
  const positions = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  for (let i = 0; i < 4; i++) {
    const cell = block.cells[i];
    if (!cell) continue;
    const [bx, by] = positions[i];
    const palette = doc.palettes[cell.pal] ?? doc.palettes[0] ?? new Uint16Array(16);
    const tileBuf = refRenderTile(doc.tiles, cell.tile, palette, cell.xf, cell.yf);
    refBlit(out, 16, tileBuf, 8, 8, bx * 8, by * 8, false, false);
  }
  return out;
}

function refRenderChunk(doc: LevelDoc, chunkId: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 256 * 4);
  // chunkIndexForId, replayed: S1 layout ids are 1-based, $00 = air.
  if (!Number.isInteger(chunkId)) return out;
  const index = chunkId - 1;
  if (index < 0 || index >= doc.chunks.length) return out;
  const chunk = doc.chunks[index];
  if (!chunk) return out;

  for (let i = 0; i < chunk.cells.length && i < 256; i++) {
    const cell = chunk.cells[i];
    if (!cell) continue;
    if (cell.block < 0 || cell.block >= doc.blocks.length) continue;
    const cx = i % 16;
    const cy = (i / 16) | 0;
    refBlit(out, 256, refRenderBlock(doc, cell.block), 16, 16, cx * 16, cy * 16, cell.xf, cell.yf);
  }
  return out;
}

// ---- aeon reference (verbatim replay of the old hand-rolled putImageData paths) ----

/** ChunkLibrary.renderChunkThumbnail, minus the OffscreenCanvas wrapper. */
function refAeonChunk(
  chunk: ChunkDef,
  tiles: Tile[],
  palette: Palette,
  chunkPx: number,
  chunkPxHigh: number = chunkPx,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(chunkPx * chunkPxHigh * 4);
  for (let tileRow = 0; tileRow < chunk.heightTiles; tileRow++) {
    for (let tileCol = 0; tileCol < chunk.widthTiles; tileCol++) {
      const word = chunk.nametable[tileRow * chunk.widthTiles + tileCol];
      const entry = unpackNametableWord(word);
      const tile = tiles[entry.tileIndex];
      if (!tile) continue;

      const palLine = palette.lines[entry.palette]?.colors ?? palette.lines[0]?.colors ?? [];

      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const srcX = entry.hFlip ? 7 - px : px;
          const srcY = entry.vFlip ? 7 - py : py;
          const colorIdx = tile.pixels[srcY * 8 + srcX];
          const color = palLine[colorIdx] ?? { r: 0, g: 0, b: 0, a: 255 };
          const destX = tileCol * 8 + px;
          const destY = tileRow * 8 + py;
          const offset = (destY * chunkPx + destX) * 4;
          data[offset] = color.r;
          data[offset + 1] = color.g;
          data[offset + 2] = color.b;
          data[offset + 3] = color.a;
        }
      }
    }
  }
  return data;
}

/** TilesetPanel/ArtBrowser ensureTileCache, per-tile body. */
function refAeonTileThumb(tile: Tile, pal: Color[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < 64; i++) {
    const color = pal[tile.pixels[i]] ?? { r: 0, g: 0, b: 0, a: 255 };
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = color.a;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function firstDiff(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length) return -2;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

// ---- classic ----

function makeClassicDoc(seed: number, tileCount = 24, blockCount = 20): LevelDoc {
  const rand = rng(seed);
  const tiles = new Uint8Array(tileCount * 32);
  for (let i = 0; i < tiles.length; i++) tiles[i] = Math.floor(rand() * 256);

  const palettes = [0, 1, 2, 3].map(() => {
    const line = new Uint16Array(16);
    // Deliberately give colour 0 a NON-black CRAM word: if the extraction ever
    // starts painting index-0 pixels from the palette, this makes it fail.
    line[0] = 0x0eee;
    for (let i = 1; i < 16; i++) line[i] = Math.floor(rand() * 0x1000);
    return line;
  });

  const cellOf = (): BlockCell => ({
    // Some tile refs deliberately past the end of the pool.
    tile: Math.floor(rand() * (tileCount + 4)),
    xf: rand() < 0.5,
    yf: rand() < 0.5,
    pal: Math.floor(rand() * 4),
    pri: rand() < 0.5,
  });
  const blocks: BlockDef[] = Array.from({ length: blockCount }, () => ({
    cells: [cellOf(), cellOf(), cellOf(), cellOf()],
  }));

  const chunkCells: ChunkCell[] = Array.from({ length: 256 }, () => ({
    // Some block refs past the end of the array → transparent, never throws.
    block: Math.floor(rand() * (blockCount + 3)),
    xf: rand() < 0.5,
    yf: rand() < 0.5,
    solidity: Math.floor(rand() * 4),
  }));
  const chunks: ChunkDef256[] = [{ cells: chunkCells }];

  return {
    game: 's1',
    tiles,
    blocks,
    chunks,
    fg: { width: 1, height: 1, cells: new Uint8Array(1) },
    bg: { width: 1, height: 1, cells: new Uint8Array(1) },
    collision: { colind: new Uint8Array(blockCount), shapes: { heights: [], angles: new Uint8Array() } },
    palettes,
    paletteSources: [] as unknown as LevelDoc['paletteSources'],
    objects: [],
    start: { x: 0, y: 0 },
    sourceRefs: {},
  };
}

// ---- aeon ----

function makeAeonTiles(count: number, seed: number): Tile[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => {
    const pixels = new Uint8Array(64);
    for (let i = 0; i < 64; i++) pixels[i] = Math.floor(rand() * 16);
    return { pixels };
  });
}

function makeAeonPalette(lineCount: number, seed: number): Palette {
  const rand = rng(seed);
  return {
    lines: Array.from({ length: lineCount }, () => ({
      colors: Array.from({ length: 16 }, (_, i) => ({
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
        // Colour 0 carries alpha 0 the way buildPalette leaves it, but a
        // NON-zero RGB — aeon writes those bytes, classic must not.
        a: i === 0 ? 0 : 255,
      })),
    })),
  };
}

function makeAeonChunk(seed: number, tileCount: number, w = 16, h = 16): ChunkDef {
  const rand = rng(seed);
  const nametable = new Uint16Array(w * h);
  for (let i = 0; i < nametable.length; i++) {
    if (rand() < 0.15) continue; // word 0 — tile 0, palette 0, no flips (NOT skipped)
    nametable[i] = packNametableWord(
      Math.floor(rand() * (tileCount + 5)), // some refs past the end of the tileset
      Math.floor(rand() * 4),
      rand() < 0.5,
      rand() < 0.5,
      rand() < 0.5,
    );
  }
  return {
    id: 'c0',
    name: 'chunk',
    widthTiles: w,
    heightTiles: h,
    nametable,
    collisionA: new Uint16Array((w >> 1) * (h >> 1)),
    collisionB: new Uint16Array((w >> 1) * (h >> 1)),
  };
}

// ===========================================================================

describe('palette LUTs: each engine keeps its own colour representation', () => {
  it('builds a classic LUT straight from CRAM words, with index 0 fully transparent', () => {
    const words = new Uint16Array(16);
    words[0] = 0x0eee; // white, but index 0 is transparent for classic
    words[1] = 0x000e; // red
    words[2] = 0x00e0; // green
    const lut = lutFromCramWords(words);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 0]);
    expect([lut[4], lut[5], lut[6], lut[7]]).toEqual([255, 0, 0, 255]);
    expect([lut[8], lut[9], lut[10], lut[11]]).toEqual([0, 255, 0, 255]);
  });

  it('decodes every classic entry exactly as decodeGenesisColor does', () => {
    const rand = rng(0xc1a551c);
    const words = new Uint16Array(16);
    for (let i = 0; i < 16; i++) words[i] = Math.floor(rand() * 0x10000);
    const lut = lutFromCramWords(words);
    for (let i = 1; i < 16; i++) {
      const c = decodeGenesisColor(words[i]);
      expect([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2], lut[i * 4 + 3]]).toEqual([c.r, c.g, c.b, 255]);
    }
  });

  it('builds an aeon LUT from Color objects, colour 0 included, alpha preserved', () => {
    const colors: Color[] = [
      { r: 10, g: 20, b: 30, a: 0 },
      { r: 1, g: 2, b: 3, a: 255 },
    ];
    const lut = lutFromColors(colors);
    // Aeon writes colour 0's RGB even though it is transparent — classic never does.
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([10, 20, 30, 0]);
    expect([lut[4], lut[5], lut[6], lut[7]]).toEqual([1, 2, 3, 255]);
    // Beyond the supplied colours: opaque black, matching `pal[i] ?? {0,0,0,255}`.
    expect([lut[8], lut[9], lut[10], lut[11]]).toEqual([0, 0, 0, 255]);
  });

  it('an empty aeon palette line is all opaque black, not a throw', () => {
    const lut = lutFromColors([]);
    for (let i = 0; i < 16; i++) {
      expect([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2], lut[i * 4 + 3]]).toEqual([0, 0, 0, 255]);
    }
  });

  it('lutForPaletteLine falls back to line 0, then to opaque black', () => {
    const pal = makeAeonPalette(2, 7);
    expect(lutForPaletteLine(pal, 1)).toEqual(lutFromColors(pal.lines[1].colors));
    // line 3 does not exist → line 0
    expect(lutForPaletteLine(pal, 3)).toEqual(lutFromColors(pal.lines[0].colors));
    // no lines at all → empty
    expect(lutForPaletteLine({ lines: [] }, 2)).toEqual(lutFromColors([]));
  });
});

describe('unpack4bppTile', () => {
  it('reads the high nibble as the left pixel', () => {
    const tiles = new Uint8Array(32);
    tiles[0] = 0x35;
    const idx = unpack4bppTile(tiles, 0)!;
    expect(idx[0]).toBe(3);
    expect(idx[1]).toBe(5);
    expect(idx.length).toBe(64);
  });

  it('returns null for a tile past the end of the pool, and for a negative index', () => {
    const tiles = new Uint8Array(64); // 2 tiles
    expect(unpack4bppTile(tiles, 2)).toBeNull();
    expect(unpack4bppTile(tiles, -1)).toBeNull();
    expect(unpack4bppTile(tiles, 1)).not.toBeNull();
  });
});

describe('rasterizeTile', () => {
  it('is byte-identical to the classic per-pixel path for every flip combo', () => {
    const doc = makeClassicDoc(0xabc);
    for (const xf of [false, true]) {
      for (const yf of [false, true]) {
        for (let t = 0; t < 24; t++) {
          const lut = lutFromCramWords(doc.palettes[t % 4]);
          const actual = rasterizeTile(unpack4bppTile(doc.tiles, t)!, lut, xf, yf);
          const expected = refRenderTile(doc.tiles, t, doc.palettes[t % 4], xf, yf);
          expect(firstDiff(actual, expected)).toBe(-1);
        }
      }
    }
  });

  it('is byte-identical to the aeon tile-thumbnail path', () => {
    const tiles = makeAeonTiles(40, 0xdef);
    const pal = makeAeonPalette(4, 0x1234);
    for (let line = 0; line < 4; line++) {
      const lut = lutFromColors(pal.lines[line].colors);
      for (const tile of tiles) {
        expect(firstDiff(rasterizeTile(tile.pixels, lut), refAeonTileThumb(tile, pal.lines[line].colors))).toBe(-1);
      }
    }
  });

  it('matches the aeon path when the palette line is empty (opaque-black fallback)', () => {
    const tiles = makeAeonTiles(4, 0x5555);
    const lut = lutFromColors([]);
    for (const tile of tiles) {
      expect(firstDiff(rasterizeTile(tile.pixels, lut), refAeonTileThumb(tile, []))).toBe(-1);
    }
  });

  it('matches the aeon path for a pixel index past the end of the palette line', () => {
    // 4bpp data never exceeds 15, but the model does not enforce it; the old
    // per-pixel code fell back to opaque black, so the LUT must too.
    const tile: Tile = { pixels: new Uint8Array(64) };
    tile.pixels[0] = 200;
    tile.pixels[1] = 3;
    const pal = makeAeonPalette(1, 0x99);
    const lut = lutFromColors(pal.lines[0].colors);
    expect(firstDiff(rasterizeTile(tile.pixels, lut), refAeonTileThumb(tile, pal.lines[0].colors))).toBe(-1);
    expect([lut[200 * 4], lut[200 * 4 + 1], lut[200 * 4 + 2], lut[200 * 4 + 3]]).toEqual([0, 0, 0, 255]);
  });

  it('returns a 256-byte buffer', () => {
    expect(rasterizeTile(new Uint8Array(64), lutFromColors([])).length).toBe(TILE_RGBA_BYTES);
  });
});

describe('blitRgba', () => {
  it('mirrors the source rect on each axis', () => {
    // 2x1 source: red then green.
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const dest = new Uint8ClampedArray(2 * 1 * 4);
    blitRgba(dest, 2, src, 2, 1, 0, 0, true, false);
    expect(Array.from(dest)).toEqual([0, 255, 0, 255, 255, 0, 0, 255]);
    blitRgba(dest, 2, src, 2, 1, 0, 0, false, false);
    expect(Array.from(dest)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });
});

describe('classic renderChunk through the shared rasterizer', () => {
  it('is byte-identical to the pre-extraction implementation on a randomized chunk', () => {
    const doc = makeClassicDoc(0x5eed);
    expect(firstDiff(renderChunk(doc, 1), refRenderChunk(doc, 1))).toBe(-1);
  });

  it('is byte-identical for a second, independently seeded document', () => {
    const doc = makeClassicDoc(0xfeed, 9, 6);
    expect(firstDiff(renderChunk(doc, 1), refRenderChunk(doc, 1))).toBe(-1);
  });

  it('renders air (engine id 0) as a fully transparent buffer, exactly as before', () => {
    const doc = makeClassicDoc(0x5eed);
    const actual = renderChunk(doc, 0);
    expect(firstDiff(actual, refRenderChunk(doc, 0))).toBe(-1);
    expect(actual.every((v) => v === 0)).toBe(true);
  });

  it('renders an out-of-range chunk id transparently, exactly as before', () => {
    const doc = makeClassicDoc(0x5eed);
    expect(firstDiff(renderChunk(doc, 99), refRenderChunk(doc, 99))).toBe(-1);
  });

  it('never paints colour index 0 from the palette, even when its CRAM word is white', () => {
    // makeClassicDoc sets every line's word 0 to $0EEE (white). Any pixel whose
    // 4bpp index is 0 must still be (0,0,0,0) — this is the exact byte-level
    // difference between classic's rule and aeon's.
    const doc = makeClassicDoc(0x5eed);
    const buf = renderChunk(doc, 1);
    let transparentPixels = 0;
    let leakedRgb = -1;
    for (let i = 3; i < buf.length; i += 4) {
      if (buf[i] !== 0) continue;
      transparentPixels++;
      if (leakedRgb < 0 && (buf[i - 3] !== 0 || buf[i - 2] !== 0 || buf[i - 1] !== 0)) leakedRgb = i - 3;
    }
    expect(transparentPixels).toBeGreaterThan(0);
    expect(leakedRgb).toBe(-1);
  });

  it('renderBlock is byte-identical to the pre-extraction implementation', () => {
    const doc = makeClassicDoc(0x0b10c, 12, 8);
    for (let b = 0; b < doc.blocks.length + 2; b++) {
      expect(firstDiff(renderBlock(doc, b), refRenderBlock(doc, b))).toBe(-1);
    }
  });

  it('renderTile is byte-identical to the pre-extraction implementation', () => {
    const doc = makeClassicDoc(0x71133);
    for (let t = -1; t < 26; t++) {
      for (const xf of [false, true]) {
        for (const yf of [false, true]) {
          expect(
            firstDiff(
              renderTile(doc.tiles, t, doc.palettes[1], xf, yf),
              refRenderTile(doc.tiles, t, doc.palettes[1], xf, yf),
            ),
          ).toBe(-1);
        }
      }
    }
  });
});

describe('rasterizeNametableChunk: aeon chunk thumbnails', () => {
  const CHUNK_PX = 128;

  it('is byte-identical to ChunkLibrary.renderChunkThumbnail on a randomized chunk', () => {
    const tiles = makeAeonTiles(60, 0xa11);
    const palette = makeAeonPalette(4, 0xb22);
    const chunk = makeAeonChunk(0xc33, 60);
    expect(
      firstDiff(
        rasterizeNametableChunk(chunk, tiles, palette, CHUNK_PX, CHUNK_PX),
        refAeonChunk(chunk, tiles, palette, CHUNK_PX),
      ),
    ).toBe(-1);
  });

  it('is byte-identical when the chunk only references palette lines that exist', () => {
    const tiles = makeAeonTiles(20, 0xd44);
    const palette = makeAeonPalette(2, 0xe55); // only lines 0 and 1
    const chunk = makeAeonChunk(0xf66, 20);
    expect(
      firstDiff(
        rasterizeNametableChunk(chunk, tiles, palette, CHUNK_PX, CHUNK_PX),
        refAeonChunk(chunk, tiles, palette, CHUNK_PX),
      ),
    ).toBe(-1);
  });

  it('is byte-identical with no palette lines at all', () => {
    const tiles = makeAeonTiles(20, 0x111);
    const palette: Palette = { lines: [] };
    const chunk = makeAeonChunk(0x222, 20);
    expect(
      firstDiff(
        rasterizeNametableChunk(chunk, tiles, palette, CHUNK_PX, CHUNK_PX),
        refAeonChunk(chunk, tiles, palette, CHUNK_PX),
      ),
    ).toBe(-1);
  });

  it('is byte-identical with an empty tileset (every cell left transparent)', () => {
    const palette = makeAeonPalette(4, 0x333);
    const chunk = makeAeonChunk(0x444, 8);
    const actual = rasterizeNametableChunk(chunk, [], palette, CHUNK_PX, CHUNK_PX);
    expect(firstDiff(actual, refAeonChunk(chunk, [], palette, CHUNK_PX))).toBe(-1);
    expect(actual.every((v) => v === 0)).toBe(true);
  });

  it('resolves each nametable flag: flips, palette line, and word 0', () => {
    // One tile whose only non-zero pixel is at (0,0), so each flip lands the
    // marker on a distinct corner. Colour 1 differs per palette line.
    const tiles: Tile[] = [
      { pixels: new Uint8Array(64) }, // tile 0 — all index 0
      { pixels: (() => { const p = new Uint8Array(64); p[0] = 1; return p; })() },
    ];
    const palette: Palette = {
      lines: [0, 1, 2, 3].map((n) => ({
        colors: Array.from({ length: 16 }, (_, i) => ({ r: i === 1 ? 40 + n : 0, g: 0, b: 0, a: i === 0 ? 0 : 255 })),
      })),
    };
    const w = 4, h = 2;
    const nametable = new Uint16Array(w * h);
    nametable[0] = packNametableWord(1, 0, false, false, false);
    nametable[1] = packNametableWord(1, 1, false, false, true);  // hFlip
    nametable[2] = packNametableWord(1, 2, false, true, false);  // vFlip
    nametable[3] = packNametableWord(1, 3, false, true, true);   // both
    nametable[4] = 0;                                            // word 0 → tile 0, line 0
    const chunk: ChunkDef = {
      id: 'c', name: 'c', widthTiles: w, heightTiles: h, nametable,
      collisionA: new Uint16Array(2), collisionB: new Uint16Array(2),
    };

    const destW = w * 8, destH = h * 8;
    const buf = rasterizeNametableChunk(chunk, tiles, palette, destW, destH);
    const at = (x: number, y: number) => {
      const o = (y * destW + x) * 4;
      return [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]];
    };
    expect(at(0, 0)).toEqual([40, 0, 0, 255]);   // cell 0, no flip
    expect(at(8 + 7, 0)).toEqual([41, 0, 0, 255]); // cell 1, hFlip → right edge
    expect(at(16, 7)).toEqual([42, 0, 0, 255]);  // cell 2, vFlip → bottom edge
    expect(at(24 + 7, 7)).toEqual([43, 0, 0, 255]); // cell 3, both
    // Word 0 is NOT skipped: it draws tile 0 with line 0, whose colour 0 is
    // transparent black here.
    expect(at(0, 8)).toEqual([0, 0, 0, 0]);
    // And it agrees with the reference byte for byte.
    expect(firstDiff(buf, refAeonChunk(chunk, tiles, palette, destW, destH))).toBe(-1);
  });

  it('word 0 paints palette colour 0 (including its RGB) rather than clearing', () => {
    // The distinction that separates this from composeNametable (which skips
    // word 0) and from classic (which never reads colour 0).
    const tiles: Tile[] = [{ pixels: new Uint8Array(64) }];
    const palette: Palette = {
      lines: [{ colors: Array.from({ length: 16 }, () => ({ r: 9, g: 8, b: 7, a: 0 })) }],
    };
    const chunk: ChunkDef = {
      id: 'c', name: 'c', widthTiles: 1, heightTiles: 1, nametable: new Uint16Array(1),
      collisionA: new Uint16Array(0), collisionB: new Uint16Array(0),
    };
    const buf = rasterizeNametableChunk(chunk, tiles, palette, 8, 8);
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual([9, 8, 7, 0]);
    expect(firstDiff(buf, refAeonChunk(chunk, tiles, palette, 8))).toBe(-1);
  });

  it('handles a chunk smaller than the destination without touching the rest', () => {
    const tiles = makeAeonTiles(8, 0x777);
    const palette = makeAeonPalette(4, 0x888);
    const chunk = makeAeonChunk(0x999, 8, 8, 8); // 8x8 tiles = 64x64 px
    const buf = rasterizeNametableChunk(chunk, tiles, palette, CHUNK_PX, CHUNK_PX);
    expect(firstDiff(buf, refAeonChunk(chunk, tiles, palette, CHUNK_PX))).toBe(-1);
    // Bottom-right quadrant untouched.
    for (let y = 64; y < CHUNK_PX; y += 17) {
      for (let x = 64; x < CHUNK_PX; x += 17) {
        const o = (y * CHUNK_PX + x) * 4;
        expect([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]).toEqual([0, 0, 0, 0]);
      }
    }
  });

  it('clips cells that fall outside the destination instead of wrapping', () => {
    // The pre-extraction code computed (destY * CHUNK_PX + destX) with no bound
    // check, so an oversized chunk wrapped into the next row. Nothing produces
    // one today (importChunks is 16x16), but clipping is the honest behaviour.
    const tiles = makeAeonTiles(4, 0xaaa);
    const palette = makeAeonPalette(4, 0xbbb);
    const chunk = makeAeonChunk(0xccc, 4, 32, 4); // 256px wide, dest is 128
    const buf = rasterizeNametableChunk(chunk, tiles, palette, 128, 128);
    expect(buf.length).toBe(128 * 128 * 4);

    // Rows past the chunk's 32px height stay untouched — under the old
    // unclipped offset maths the overflowing right-hand cells wrapped into
    // them.
    let painted = 0;
    for (let i = 32 * 128 * 4; i < buf.length; i++) if (buf[i] !== 0) painted++;
    expect(painted).toBe(0);

    // The cells that DO fit still paint exactly as a lone tile raster would.
    const entry = unpackNametableWord(chunk.nametable[0]);
    const cell0 = tiles[entry.tileIndex]
      ? rasterizeTile(tiles[entry.tileIndex].pixels, lutForPaletteLine(palette, entry.palette), entry.hFlip, entry.vFlip)
      : new Uint8ClampedArray(TILE_RGBA_BYTES);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const o = (y * 128 + x) * 4;
        const s = (y * 8 + x) * 4;
        expect([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]])
          .toEqual([cell0[s], cell0[s + 1], cell0[s + 2], cell0[s + 3]]);
      }
    }
  });
});
