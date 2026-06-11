import type { Tile, PaletteLine, Color } from '../../core/model/types';

/**
 * Renders 8x8 tiles into RGBA pixel buffers.
 * Pre-renders all tile+palette combinations into a cache.
 */
export class TileRenderer {
  private cache = new Map<string, ImageData>();

  /**
   * Pre-render all tiles with all palette lines.
   */
  prerender(tiles: Tile[], paletteLines: PaletteLine[]): void {
    this.cache.clear();
    for (let tileIdx = 0; tileIdx < tiles.length; tileIdx++) {
      for (let palIdx = 0; palIdx < paletteLines.length; palIdx++) {
        const key = `${tileIdx}:${palIdx}`;
        this.cache.set(key, this.renderTile(tiles[tileIdx], paletteLines[palIdx]));
      }
    }
  }

  /**
   * Get a pre-rendered tile. Returns null if not cached.
   */
  get(tileIndex: number, paletteIndex: number): ImageData | null {
    return this.cache.get(`${tileIndex}:${paletteIndex}`) ?? null;
  }

  /**
   * Render a single 8x8 tile with a palette line to RGBA ImageData.
   */
  renderTile(tile: Tile, paletteLine: PaletteLine): ImageData {
    const imageData = new ImageData(8, 8);
    const data = imageData.data;

    for (let i = 0; i < 64; i++) {
      const colorIdx = tile.pixels[i];
      const color: Color = paletteLine.colors[colorIdx] ?? { r: 0, g: 0, b: 0, a: 255 };
      const offset = i * 4;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = color.a;
    }

    return imageData;
  }
}
