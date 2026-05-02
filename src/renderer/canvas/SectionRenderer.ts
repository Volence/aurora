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
