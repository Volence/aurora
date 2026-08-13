import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SectionRenderer } from '../SectionRenderer';
import { TileRenderer } from '../TileRenderer';
import {
  packNametableWord, unpackNametableWord,
  SECTION_TILES_WIDE, SECTION_PIXEL_SIZE,
  createSectionTileGrid,
  type Tile, type PaletteLine,
} from '../../../core/model/s4-types';

// ---------------------------------------------------------------------------
// A recording OffscreenCanvas that captures exactly which canvas operations the
// renderer issues, and the pixels it uploads. Installed as the global for the
// duration of these tests (the vitest setup stub is a no-op that discards
// everything, which is fine for import-time construction but useless here).
// ---------------------------------------------------------------------------

interface PutCall { x: number; y: number; width: number; height: number; data: Uint8ClampedArray }

class RecordingCtx {
  imageSmoothingEnabled = true;
  puts: PutCall[] = [];
  clears: Array<[number, number, number, number]> = [];
  draws = 0;
  putImageData(img: ImageData, x: number, y: number): void {
    this.puts.push({ x, y, width: img.width, height: img.height, data: img.data.slice() });
  }
  clearRect(x: number, y: number, w: number, h: number): void { this.clears.push([x, y, w, h]); }
  drawImage(): void { this.draws++; }
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  set fillStyle(_v: string) {}
  set strokeStyle(_v: string) {}
  set lineWidth(_v: number) {}
}

class RecordingCanvas {
  ctx = new RecordingCtx();
  constructor(public width: number, public height: number) { created.push(this); }
  getContext(): RecordingCtx { return this.ctx; }
}

let created: RecordingCanvas[] = [];
let realOffscreen: unknown;

beforeEach(() => {
  created = [];
  realOffscreen = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = RecordingCanvas;
});
afterEach(() => {
  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = realOffscreen;
});

function sectionCanvases(): RecordingCanvas[] {
  return created.filter(c => c.width === SECTION_PIXEL_SIZE);
}

// ---------------------------------------------------------------------------
// Fixtures: a small tileset + four distinguishable palette lines.
// ---------------------------------------------------------------------------

function makeTiles(count: number): Tile[] {
  return Array.from({ length: count }, (_, t) => ({
    // Colour indices 0..15; index 0 is the transparent one by convention.
    pixels: new Uint8Array(Array.from({ length: 64 }, (_, i) => (t * 7 + i * 3) % 16)),
  }));
}

function makePalettes(): PaletteLine[] {
  return Array.from({ length: 4 }, (_, p) => ({
    colors: Array.from({ length: 16 }, (_, i) => ({
      r: (p * 60 + i * 15) % 256,
      g: (i * 17) % 256,
      b: (p * 33 + i * 9) % 256,
      a: i === 0 ? 0 : 255, // index 0 transparent, everything else opaque
    })),
  }));
}

/**
 * Reference: replay the OLD per-cell semantics into a raw RGBA buffer.
 * clearRect -> zero the cell; putImageData -> replace; flipped drawImage over a
 * cleared cell -> flipped replace.
 */
function referenceSection(nametable: Uint16Array, tiles: Tile[], palettes: PaletteLine[]): Uint8ClampedArray {
  const tr = new TileRenderer();
  tr.prerender(tiles, palettes);
  const W = SECTION_PIXEL_SIZE;
  const out = new Uint8ClampedArray(W * W * 4); // starts transparent
  for (let i = 0; i < nametable.length; i++) {
    const word = nametable[i];
    if (word === 0) continue; // clearRect on an already-clear buffer
    const nt = unpackNametableWord(word);
    const img = tr.get(nt.tileIndex, nt.palette);
    if (!img) continue;
    const src = img.data;
    const px = (i % SECTION_TILES_WIDE) * 8;
    const py = Math.floor(i / SECTION_TILES_WIDE) * 8;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sr = nt.vFlip ? 7 - r : r;
        const sc = nt.hFlip ? 7 - c : c;
        const s = (sr * 8 + sc) * 4;
        const d = ((py + r) * W + px + c) * 4;
        out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
      }
    }
  }
  return out;
}

function buildNametable(): Uint16Array {
  const grid = createSectionTileGrid();
  const nt = grid.nametable;
  let s = 12345;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  // ~17% occupancy, matching the measured Oracle Jungle Zone density.
  for (let i = 0; i < nt.length; i++) {
    if (rand() >= 0.17) continue;
    nt[i] = packNametableWord(
      Math.floor(rand() * 40),  // some indices land past the 32-tile tileset
      Math.floor(rand() * 4),
      rand() < 0.1,             // priority (ignored by the renderer, as before)
      rand() < 0.3,             // vFlip
      rand() < 0.3,             // hFlip
    );
  }
  // Pin down the corners and every flip combination explicitly.
  nt[0] = packNametableWord(1, 0, false, false, false);
  nt[SECTION_TILES_WIDE - 1] = packNametableWord(2, 1, false, false, true);
  nt[nt.length - SECTION_TILES_WIDE] = packNametableWord(3, 2, true, true, false);
  nt[nt.length - 1] = packNametableWord(4, 3, false, true, true);
  nt[SECTION_TILES_WIDE + 1] = 0;                                  // empty
  nt[SECTION_TILES_WIDE + 2] = packNametableWord(0, 0, false, false, false); // tile 0
  nt[SECTION_TILES_WIDE + 3] = packNametableWord(2000, 1, false, false, false); // out of range
  return nt;
}

// ---------------------------------------------------------------------------

describe('SectionRenderer.renderFullSection', () => {
  it('uploads one full-canvas frame that is pixel-identical to the per-tile path', () => {
    const tiles = makeTiles(32);
    const palettes = makePalettes();
    const nametable = buildNametable();

    const r = new SectionRenderer();
    r.setGrid(1, 1);
    r.prepareTiles(tiles, palettes);
    r.loadSection(0, { width: SECTION_TILES_WIDE, height: SECTION_TILES_WIDE, nametable });

    const canvases = sectionCanvases();
    expect(canvases).toHaveLength(1);
    const ctx = canvases[0].ctx;

    // Exactly ONE upload for the whole section — the point of the change.
    expect(ctx.puts).toHaveLength(1);
    expect(ctx.clears).toHaveLength(0);
    expect(ctx.draws).toBe(0);

    const put = ctx.puts[0];
    expect([put.x, put.y, put.width, put.height]).toEqual([0, 0, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE]);

    const expected = referenceSection(nametable, tiles, palettes);
    expect(put.data.length).toBe(expected.length);
    let diff = -1;
    for (let i = 0; i < expected.length; i++) {
      if (put.data[i] !== expected[i]) { diff = i; break; }
    }
    expect(diff).toBe(-1);
  });

  it('reuses an already-loaded section canvas instead of allocating a new one', () => {
    const tiles = makeTiles(8);
    const palettes = makePalettes();
    const grid = createSectionTileGrid();
    grid.nametable[0] = packNametableWord(1, 0, false, false, false);

    const r = new SectionRenderer();
    r.setGrid(1, 1);
    r.prepareTiles(tiles, palettes);
    r.loadSection(0, grid);
    expect(sectionCanvases()).toHaveLength(1);

    // A palette rebuild reloads the same index — must not allocate 16 MB again.
    r.prepareTiles(tiles, palettes);
    r.loadSection(0, grid);
    r.loadSection(0, grid);
    expect(sectionCanvases()).toHaveLength(1);
    expect(sectionCanvases()[0].ctx.puts).toHaveLength(3);
  });

  it('picks up new palette colours on reload without a structural reset', () => {
    const tiles = makeTiles(8);
    const grid = createSectionTileGrid();
    grid.nametable[0] = packNametableWord(1, 0, false, false, false);

    const before = makePalettes();
    const r = new SectionRenderer();
    r.setGrid(1, 1);
    r.prepareTiles(tiles, before);
    r.loadSection(0, grid);

    const after = makePalettes();
    after[0].colors[tiles[1].pixels[0]] = { r: 9, g: 9, b: 9, a: 255 };
    r.prepareTiles(tiles, after);
    r.loadSection(0, grid);

    const puts = sectionCanvases()[0].ctx.puts;
    expect(puts).toHaveLength(2);
    expect(Array.from(puts[1].data.slice(0, 4))).toEqual([9, 9, 9, 255]);
    expect(Array.from(puts[0].data.slice(0, 4))).not.toEqual([9, 9, 9, 255]);
  });
});

describe('SectionRenderer dirty flushing', () => {
  const tiles = makeTiles(8);
  const palettes = makePalettes();

  function loaded(): { r: SectionRenderer; ctx: RecordingCtx; grid: ReturnType<typeof createSectionTileGrid> } {
    const grid = createSectionTileGrid();
    for (let i = 0; i < grid.nametable.length; i += 3) {
      grid.nametable[i] = packNametableWord(i % 8, i % 4, false, (i & 4) === 0, (i & 8) === 0);
    }
    const r = new SectionRenderer();
    r.setGrid(1, 1);
    r.prepareTiles(tiles, palettes);
    r.loadSection(0, grid);
    const ctx = sectionCanvases()[0].ctx;
    ctx.puts.length = 0; ctx.clears.length = 0; ctx.draws = 0;
    return { r, ctx, grid };
  }

  const nullCtx = new RecordingCtx() as unknown as CanvasRenderingContext2D;
  const viewport = { x: 0, y: 0, width: 320, height: 224, zoom: 1 };

  it('keeps the per-tile path for a small dirty set', () => {
    const { r, ctx } = loaded();
    r.markDirty(0, [0, 1, 2, 3, 4]);
    r.render(nullCtx, viewport);
    // Five cell-sized uploads (or clears for empty cells) — no full frame.
    expect(ctx.puts.every(p => p.width === 8 && p.height === 8)).toBe(true);
    expect(ctx.puts.length + ctx.clears.length).toBeGreaterThanOrEqual(5);
  });

  it('recomposes the whole section once a large dirty set accumulates', () => {
    const { r, ctx } = loaded();
    r.markAllDirty(0);
    r.render(nullCtx, viewport);
    expect(ctx.puts).toHaveLength(1);
    expect(ctx.puts[0].width).toBe(SECTION_PIXEL_SIZE);
    expect(ctx.clears).toHaveLength(0);
  });

  it('a bulk recompose equals the per-tile result for the same nametable', () => {
    const { r, ctx, grid } = loaded();
    r.markAllDirty(0);
    r.render(nullCtx, viewport);
    const expected = referenceSection(grid.nametable, tiles, palettes);
    let diff = -1;
    for (let i = 0; i < expected.length; i++) {
      if (ctx.puts[0].data[i] !== expected[i]) { diff = i; break; }
    }
    expect(diff).toBe(-1);
  });
});

describe('SectionRenderer.loadBg', () => {
  it('uploads one frame for the whole BG plane', () => {
    const tiles = makeTiles(16);
    const palettes = makePalettes();
    const width = 64, height = 32;
    const nametable = new Uint16Array(width * height);
    let s = 999;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    for (let i = 0; i < nametable.length; i++) {
      if (rand() < 0.25) continue;
      nametable[i] = packNametableWord(
        Math.floor(rand() * 20), Math.floor(rand() * 4), false, rand() < 0.4, rand() < 0.4,
      );
    }

    const r = new SectionRenderer();
    r.loadBg(nametable, width, height, tiles, palettes);

    const bgCanvas = created.find(c => c.width === width * 8);
    expect(bgCanvas).toBeDefined();
    const ctx = bgCanvas!.ctx;
    expect(ctx.puts).toHaveLength(1);
    expect([ctx.puts[0].width, ctx.puts[0].height]).toEqual([width * 8, height * 8]);

    // Same reference comparison, at BG dimensions.
    const tr = new TileRenderer();
    tr.prerender(tiles, palettes);
    const W = width * 8;
    const expected = new Uint8ClampedArray(W * height * 8 * 4);
    for (let i = 0; i < nametable.length; i++) {
      const word = nametable[i];
      if (word === 0) continue;
      const nt = unpackNametableWord(word);
      const img = tr.get(nt.tileIndex, nt.palette);
      if (!img) continue;
      const px = (i % width) * 8, py = Math.floor(i / width) * 8;
      for (let rr = 0; rr < 8; rr++) {
        for (let c = 0; c < 8; c++) {
          const sr = nt.vFlip ? 7 - rr : rr;
          const sc = nt.hFlip ? 7 - c : c;
          const s2 = (sr * 8 + sc) * 4;
          const d = ((py + rr) * W + px + c) * 4;
          expected[d] = img.data[s2]; expected[d + 1] = img.data[s2 + 1];
          expected[d + 2] = img.data[s2 + 2]; expected[d + 3] = img.data[s2 + 3];
        }
      }
    }
    let diff = -1;
    for (let i = 0; i < expected.length; i++) {
      if (ctx.puts[0].data[i] !== expected[i]) { diff = i; break; }
    }
    expect(diff).toBe(-1);
  });
});
