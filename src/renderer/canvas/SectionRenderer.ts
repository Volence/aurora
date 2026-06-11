import type { Tile, PaletteLine, SectionTileGrid } from '../../core/model/s4-types';
import { unpackNametableWord, SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../core/model/s4-types';
import { TileRenderer } from './TileRenderer';

export interface SectionViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

interface SectionEntry {
  tileRenderer: TileRenderer;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  tileGrid: SectionTileGrid;
  dirtyTiles: Set<number>;
}

interface BgEntry {
  tileRenderer: TileRenderer;
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

    this.bg = { tileRenderer, canvas, ctx, nametable, width, height, dirtyTiles: new Set() };
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

  private renderFullBg(): void {
    if (!this.bg) return;
    for (let i = 0; i < this.bg.nametable.length; i++) {
      this.renderBgTileAt(i);
    }
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
    for (const idx of this.bg.dirtyTiles) {
      this.renderBgTileAt(idx);
    }
    this.bg.dirtyTiles.clear();
  }

  renderBg(ctx: CanvasRenderingContext2D, viewport: SectionViewport): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;

    // Always clear the backdrop — even with no BG loaded — so callers on the
    // BG editing layer never composite over a stale frame.
    ctx.fillStyle = '#000000';
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

  loadSection(index: number, tileGrid: SectionTileGrid, tiles: Tile[], paletteLines: PaletteLine[]): void {
    const canvas = new OffscreenCanvas(SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const tileRenderer = new TileRenderer();
    tileRenderer.prerender(tiles, paletteLines);

    const entry: SectionEntry = {
      tileRenderer,
      canvas,
      ctx,
      tileGrid,
      dirtyTiles: new Set(),
    };

    this.sections.set(index, entry);
    this.renderFullSection(entry);
  }

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
      for (const idx of entry.dirtyTiles) {
        this.renderTileAt(entry, idx);
      }
      entry.dirtyTiles.clear();
    }
  }

  private renderFullSection(entry: SectionEntry): void {
    for (let i = 0; i < entry.tileGrid.nametable.length; i++) {
      this.renderTileAt(entry, i);
    }
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
      ctx.fillStyle = '#000000';
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
      ctx.strokeStyle = 'rgba(137, 180, 250, 0.6)';
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(offset.x, offset.y, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE);
    }

    ctx.restore();
  }
}
