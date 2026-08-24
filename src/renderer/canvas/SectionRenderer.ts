import type { Tile, PaletteLine, SectionTileGrid } from '../../core/model/s4-types';
import { unpackNametableWord, SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import { TileRenderer } from './TileRenderer';
import { composeNametable, type TilePixelLookup } from './compose-nametable';
import { CANVAS_BLACK, ACTIVE_SECTION_BORDER } from './canvas-colors';

/**
 * Above this many dirty cells, rebuilding the whole section with one
 * putImageData beats poking them one at a time: the per-cell path costs a
 * ~50us GPU round-trip each, while a full recompose is a few tens of ms for
 * the entire 65,536-cell section. Keeps a big paste/fill off the slow path.
 */
const RECOMPOSE_DIRTY_THRESHOLD = 2000;

/**
 * Wrap a TileRenderer as a `TilePixelLookup` with a numeric-keyed memo.
 * The composer asks per CELL (up to 65,536 times per section); TileRenderer.get
 * builds a `${tileIndex}:${palette}` string for every call, so memoising on a
 * packed integer key keeps composition off the string-allocation path.
 * The memo is owned by the caller and thrown away whenever the underlying
 * TileRenderer is re-prerendered, so it can never serve stale pixels.
 */
function pixelLookupFor(tileRenderer: TileRenderer): TilePixelLookup {
  const memo = new Map<number, Uint8ClampedArray | null>();
  return (tileIndex: number, palette: number) => {
    const key = (tileIndex << 2) | palette;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const pixels = tileRenderer.get(tileIndex, palette)?.data ?? null;
    memo.set(key, pixels);
    return pixels;
  };
}

export interface SectionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

interface SectionEntry {
  tileRenderer: TileRenderer;
  /** Memoised pixel accessor over `tileRenderer`; rebuilt whenever it is. */
  lookup: TilePixelLookup;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  tileGrid: SectionTileGrid;
  dirtyTiles: Set<number>;
}

interface BgEntry {
  tileRenderer: TileRenderer;
  lookup: TilePixelLookup;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  nametable: Uint16Array;
  width: number;
  height: number;
  dirtyTiles: Set<number>;
}

export class SectionRenderer {
  private sections = new Map<number, SectionEntry>();
  private bg: BgEntry | null = null;
  private gridWidth = 1;
  private gridHeight = 1;
  private tempCanvas = new OffscreenCanvas(8, 8);
  private tempCtx = this.tempCanvas.getContext('2d')!;
  // Prerendered zone tileset+palette, shared by every section that draws from
  // the zone atlas (the common case). Built once per reload via prepareTiles()
  // instead of once PER SECTION — the old per-section prerender re-rendered the
  // whole tileset N times at load.
  private sharedTileRenderer: TileRenderer | null = null;
  // One 2048x2048 RGBA staging buffer (16 MB) shared by EVERY section compose,
  // allocated on first use and never freed. Composition writes here and the
  // canvas gets one putImageData — see compose-nametable.ts for why.
  private sectionScratch: { data: Uint8ClampedArray; image: ImageData } | null = null;
  // Same idea for the BG plane, whose pixel size varies with the layout.
  private bgScratch: { data: Uint8ClampedArray; image: ImageData; width: number; height: number } | null = null;

  private sectionScratchBuffer(): { data: Uint8ClampedArray; image: ImageData } {
    if (!this.sectionScratch) {
      const data = new Uint8ClampedArray(SECTION_PIXEL_SIZE * SECTION_PIXEL_SIZE * 4);
      this.sectionScratch = { data, image: new ImageData(data, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE) };
    }
    return this.sectionScratch;
  }

  private bgScratchBuffer(width: number, height: number): { data: Uint8ClampedArray; image: ImageData } {
    if (!this.bgScratch || this.bgScratch.width !== width || this.bgScratch.height !== height) {
      const data = new Uint8ClampedArray(width * height * 4);
      this.bgScratch = { data, image: new ImageData(data, width, height), width, height };
    }
    return this.bgScratch;
  }

  setGrid(width: number, height: number): void {
    this.gridWidth = width;
    this.gridHeight = height;
  }

  getGridWidth(): number { return this.gridWidth; }
  getGridHeight(): number { return this.gridHeight; }

  clearSections(): void {
    this.sections.clear();
  }

  loadBg(nametable: Uint16Array, width: number, height: number, tiles: Tile[], paletteLines: PaletteLine[]): void {
    const pixelW = width * 8;
    const pixelH = height * 8;
    const canvas = new OffscreenCanvas(pixelW, pixelH);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const tileRenderer = new TileRenderer();
    tileRenderer.prerender(tiles, paletteLines);

    this.bg = {
      tileRenderer,
      lookup: pixelLookupFor(tileRenderer),
      canvas, ctx, nametable, width, height,
      dirtyTiles: new Set(),
    };
    this.renderFullBg();
  }

  clearBg(): void {
    this.bg = null;
  }

  hasBg(): boolean {
    return this.bg !== null;
  }

  getBg(): { nametable: Uint16Array; width: number; height: number } | null {
    if (!this.bg) return null;
    return { nametable: this.bg.nametable, width: this.bg.width, height: this.bg.height };
  }

  markBgDirty(tileIndices: number[]): void {
    if (!this.bg) return;
    for (const idx of tileIndices) this.bg.dirtyTiles.add(idx);
  }

  /**
   * Compose the whole BG plane in JS and upload it with ONE putImageData
   * instead of one canvas op per cell. The plane is 64 columns by whatever the
   * layout holds (64 rows for the engine's shape, 32 for a legacy one) — small
   * next to a section either way, but the per-cell path still measured ~90ms on
   * a GPU-backed canvas.
   */
  private renderFullBg(): void {
    if (!this.bg) return;
    const pixelW = this.bg.width * 8;
    const pixelH = this.bg.height * 8;
    const scratch = this.bgScratchBuffer(pixelW, pixelH);
    composeNametable(scratch.data, pixelW, pixelH, this.bg.nametable, this.bg.width, this.bg.lookup);
    this.bg.ctx.putImageData(scratch.image, 0, 0);
  }

  private renderBgTileAt(index: number): void {
    if (!this.bg) return;
    const word = this.bg.nametable[index];
    const col = index % this.bg.width;
    const row = Math.floor(index / this.bg.width);
    const px = col * 8;
    const py = row * 8;

    if (word === 0) {
      this.bg.ctx.clearRect(px, py, 8, 8);
      return;
    }

    const nt = unpackNametableWord(word);
    const tileImage = this.bg.tileRenderer.get(nt.tileIndex, nt.palette);
    if (!tileImage) {
      this.bg.ctx.clearRect(px, py, 8, 8);
      return;
    }

    if (!nt.hFlip && !nt.vFlip) {
      this.bg.ctx.putImageData(tileImage, px, py);
    } else {
      // Clear first: drawImage composites, so a flipped transparent tile would
      // otherwise leave the previous cell content showing through.
      this.bg.ctx.clearRect(px, py, 8, 8);
      this.tempCtx.putImageData(tileImage, 0, 0);
      this.bg.ctx.save();
      this.bg.ctx.translate(px + (nt.hFlip ? 8 : 0), py + (nt.vFlip ? 8 : 0));
      this.bg.ctx.scale(nt.hFlip ? -1 : 1, nt.vFlip ? -1 : 1);
      this.bg.ctx.drawImage(this.tempCanvas, 0, 0);
      this.bg.ctx.restore();
    }
  }

  private flushBgDirty(): void {
    if (!this.bg || this.bg.dirtyTiles.size === 0) return;
    if (this.bg.dirtyTiles.size >= RECOMPOSE_DIRTY_THRESHOLD) {
      this.renderFullBg();
    } else {
      for (const idx of this.bg.dirtyTiles) {
        this.renderBgTileAt(idx);
      }
    }
    this.bg.dirtyTiles.clear();
  }

  renderBg(ctx: CanvasRenderingContext2D, viewport: SectionViewport): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;

    // Always clear the backdrop — even with no BG loaded — so callers on the
    // BG editing layer never composite over a stale frame.
    ctx.fillStyle = CANVAS_BLACK;
    ctx.fillRect(0, 0, width, height);

    if (!this.bg) return;
    this.flushBgDirty();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);
    ctx.drawImage(this.bg.canvas, 0, 0);
    ctx.restore();
  }

  /**
   * Prerender the zone tileset+palette once. Call before the loadSection loop;
   * every section that omits its own tiles reuses this shared cache instead of
   * re-prerendering the whole tileset per section.
   */
  prepareTiles(tiles: Tile[], paletteLines: PaletteLine[]): void {
    const renderer = new TileRenderer();
    renderer.prerender(tiles, paletteLines);
    this.sharedTileRenderer = renderer;
  }

  loadSection(index: number, tileGrid: SectionTileGrid, tiles?: Tile[], paletteLines?: PaletteLine[]): void {
    // Per-section art override → its own cache; otherwise the shared zone cache.
    let tileRenderer: TileRenderer;
    if (tiles && paletteLines) {
      tileRenderer = new TileRenderer();
      tileRenderer.prerender(tiles, paletteLines);
    } else if (this.sharedTileRenderer) {
      tileRenderer = this.sharedTileRenderer;
    } else {
      return; // no tileset prepared and no override — nothing to draw
    }

    // Reuse the canvas already held for this index. Each one is a 2048x2048
    // backing store (16 MB); reloading a 9-section act used to throw all of
    // them away and allocate nine more. renderFullSection overwrites every
    // pixel, so nothing stale can survive the reuse.
    const existing = this.sections.get(index);
    let canvas: OffscreenCanvas;
    let ctx: OffscreenCanvasRenderingContext2D;
    if (existing && existing.canvas.width === SECTION_PIXEL_SIZE && existing.canvas.height === SECTION_PIXEL_SIZE) {
      canvas = existing.canvas;
      ctx = existing.ctx;
    } else {
      canvas = new OffscreenCanvas(SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE);
      ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
    }

    const entry: SectionEntry = {
      tileRenderer,
      lookup: pixelLookupFor(tileRenderer),
      canvas,
      ctx,
      tileGrid,
      dirtyTiles: new Set(),
    };

    this.sections.set(index, entry);
    this.renderFullSection(entry);
  }

  /** How many section canvases are currently loaded. */
  sectionCount(): number { return this.sections.size; }

  markDirty(sectionIndex: number, tileIndices: number[]): void {
    const entry = this.sections.get(sectionIndex);
    if (!entry) return;
    for (const idx of tileIndices) entry.dirtyTiles.add(idx);
  }

  markAllDirty(sectionIndex: number): void {
    const entry = this.sections.get(sectionIndex);
    if (!entry) return;
    for (let i = 0; i < entry.tileGrid.nametable.length; i++) {
      entry.dirtyTiles.add(i);
    }
  }

  private flushAllDirty(): void {
    for (const entry of this.sections.values()) {
      if (entry.dirtyTiles.size === 0) continue;
      if (entry.dirtyTiles.size >= RECOMPOSE_DIRTY_THRESHOLD) {
        // A big paste/fill: one recompose beats thousands of GPU round-trips.
        // The nametable is the source of truth, so this is exactly equivalent
        // to poking each dirty cell (and repaints the clean ones identically).
        this.renderFullSection(entry);
      } else {
        for (const idx of entry.dirtyTiles) {
          this.renderTileAt(entry, idx);
        }
      }
      entry.dirtyTiles.clear();
    }
  }

  /**
   * Compose the entire section in JS and upload it with ONE putImageData.
   * The old per-cell loop issued ~11,300 putImageData + ~54,200 clearRect per
   * section; on a GPU-backed canvas that is ~430ms EACH, ~3.9s for a 9-section
   * act, on every palette commit. See compose-nametable.ts.
   */
  private renderFullSection(entry: SectionEntry): void {
    const scratch = this.sectionScratchBuffer();
    composeNametable(
      scratch.data,
      SECTION_PIXEL_SIZE,
      SECTION_PIXEL_SIZE,
      entry.tileGrid.nametable,
      SECTION_TILES_WIDE,
      entry.lookup,
    );
    entry.ctx.putImageData(scratch.image, 0, 0);
  }

  private renderTileAt(entry: SectionEntry, index: number): void {
    const word = entry.tileGrid.nametable[index];
    const col = index % SECTION_TILES_WIDE;
    const row = Math.floor(index / SECTION_TILES_WIDE);
    const px = col * 8;
    const py = row * 8;

    if (word === 0) {
      entry.ctx.clearRect(px, py, 8, 8);
      return;
    }

    const nt = unpackNametableWord(word);
    const tileImage = entry.tileRenderer.get(nt.tileIndex, nt.palette);
    if (!tileImage) {
      entry.ctx.clearRect(px, py, 8, 8);
      return;
    }

    if (!nt.hFlip && !nt.vFlip) {
      entry.ctx.putImageData(tileImage, px, py);
    } else {
      // drawImage composites (source-over) — unlike putImageData it does NOT
      // replace, so a flipped tile with transparent pixels would leave the
      // previous cell content showing through. Clear the cell first.
      entry.ctx.clearRect(px, py, 8, 8);
      this.tempCtx.putImageData(tileImage, 0, 0);
      entry.ctx.save();
      entry.ctx.translate(px + (nt.hFlip ? 8 : 0), py + (nt.vFlip ? 8 : 0));
      entry.ctx.scale(nt.hFlip ? -1 : 1, nt.vFlip ? -1 : 1);
      entry.ctx.drawImage(this.tempCanvas, 0, 0);
      entry.ctx.restore();
    }
  }

  sectionWorldOffset(index: number): { x: number; y: number } {
    const col = index % this.gridWidth;
    const row = Math.floor(index / this.gridWidth);
    return { x: col * SECTION_PIXEL_SIZE, y: row * SECTION_PIXEL_SIZE };
  }

  sectionAtWorld(worldX: number, worldY: number): number {
    const col = Math.floor(worldX / SECTION_PIXEL_SIZE);
    const row = Math.floor(worldY / SECTION_PIXEL_SIZE);
    if (col < 0 || col >= this.gridWidth || row < 0 || row >= this.gridHeight) return -1;
    return row * this.gridWidth + col;
  }

  /**
   * Draw the foreground sections. Pass clearBackground=false to composite over
   * an already-painted backdrop (e.g. renderBg) — empty nametable words are
   * transparent in the section canvases, so Plane B shows through.
   */
  render(ctx: CanvasRenderingContext2D, viewport: SectionViewport, activeSectionIndex?: number, clearBackground = true): void {
    this.flushAllDirty();

    const { x: vpX, y: vpY, width, height, zoom } = viewport;

    if (clearBackground) {
      ctx.fillStyle = CANVAS_BLACK;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(zoom, zoom);
    ctx.translate(-vpX, -vpY);

    const vpRight = vpX + width / zoom;
    const vpBottom = vpY + height / zoom;

    for (const [index, entry] of this.sections) {
      const offset = this.sectionWorldOffset(index);
      const secRight = offset.x + SECTION_PIXEL_SIZE;
      const secBottom = offset.y + SECTION_PIXEL_SIZE;

      if (secRight < vpX || offset.x > vpRight || secBottom < vpY || offset.y > vpBottom) continue;

      ctx.drawImage(entry.canvas, offset.x, offset.y);
    }

    // Draw active section border
    if (activeSectionIndex !== undefined) {
      const offset = this.sectionWorldOffset(activeSectionIndex);
      ctx.strokeStyle = ACTIVE_SECTION_BORDER;
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(offset.x, offset.y, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE);
    }

    ctx.restore();
  }
}
