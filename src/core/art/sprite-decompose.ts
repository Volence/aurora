import type { Tile } from '../model/s4-types';

export const CELL = 8; // px per tile cell

/** Extract the 8x8 tile at grid cell (gx,gy). Out-of-bounds pixels pad to 0 (transparent). */
export function extractTile(pixels: Uint8Array, width: number, height: number, gx: number, gy: number): Tile {
  const out = new Uint8Array(64);
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      const sx = gx * CELL + px;
      const sy = gy * CELL + py;
      out[py * CELL + px] = sx < width && sy < height ? pixels[sy * width + sx] : 0;
    }
  }
  return { pixels: out };
}

export function tileIsEmpty(tile: Tile): boolean {
  for (let i = 0; i < tile.pixels.length; i++) if (tile.pixels[i] !== 0) return false;
  return true;
}

import type { SpritePiece } from '../model/sprite-types';

/**
 * A painted whole-frame bitmap. v1: a single palette line for the whole frame.
 * origin = the object origin within the bitmap (px); piece offsets are computed
 * relative to it. width/height need not be multiples of 8 (padded transparent).
 */
export interface RawFrame {
  id: string;
  pixels: Uint8Array; // width*height, indices 0..15 (0 = transparent)
  width: number;
  height: number;
  originX: number;
  originY: number;
  palette: number;    // 0..3
  priority: boolean;
}

function blockKey(block: Tile[]): string {
  // Identity key over the block's pixels in order. Small sprites → cheap.
  return block.map((t) => String.fromCharCode(...t.pixels)).join('|');
}

/**
 * Decompose a frame bitmap into a tile pool + pieces. Greedy rectangle packing:
 * grow right (≤4 cells) over contiguous non-empty tiles, then grow down (≤4) while
 * the full row is non-empty. Tiles within a piece are emitted VDP column-major.
 * Identical whole blocks are deduped (piece reuses the base tile index). Piece tile
 * indices are relative to THIS frame's block start (0-based); assembleSprite rebases.
 */
export function decomposeFrame(frame: RawFrame): { tiles: Tile[]; pieces: SpritePiece[] } {
  const cols = Math.ceil(frame.width / CELL);
  const rows = Math.ceil(frame.height / CELL);
  const grid: Tile[][] = [];
  const empty: boolean[][] = [];
  for (let gy = 0; gy < rows; gy++) {
    const r: Tile[] = [];
    const er: boolean[] = [];
    for (let gx = 0; gx < cols; gx++) {
      const t = extractTile(frame.pixels, frame.width, frame.height, gx, gy);
      r.push(t);
      er.push(tileIsEmpty(t));
    }
    grid.push(r);
    empty.push(er);
  }

  const visited: boolean[][] = empty.map((row) => row.map(() => false));
  const tiles: Tile[] = [];
  const blockMap = new Map<string, number>();
  const pieces: SpritePiece[] = [];

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (visited[gy][gx] || empty[gy][gx]) continue;
      // grow width (max 4 cells)
      let w = 1;
      while (w < 4 && gx + w < cols && !empty[gy][gx + w] && !visited[gy][gx + w]) w++;
      // grow height (max 4 cells) while the full row across [gx, gx+w) is usable
      const rowOk = (ry: number): boolean => {
        for (let c = 0; c < w; c++) if (empty[ry][gx + c] || visited[ry][gx + c]) return false;
        return true;
      };
      let h = 1;
      while (h < 4 && gy + h < rows && rowOk(gy + h)) h++;
      // mark visited
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) visited[gy + r][gx + c] = true;
      // extract block VDP column-major: down each column, then next column
      const block: Tile[] = [];
      for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) block.push(grid[gy + r][gx + c]);
      // dedup whole block
      const key = blockKey(block);
      let base = blockMap.get(key);
      if (base === undefined) {
        base = tiles.length;
        for (const t of block) tiles.push(t);
        blockMap.set(key, base);
      }
      pieces.push({
        xOffset: gx * CELL - frame.originX,
        yOffset: gy * CELL - frame.originY,
        widthCells: w,
        heightCells: h,
        tile: base,
        palette: frame.palette,
        priority: frame.priority,
        xFlip: false,
        yFlip: false,
      });
    }
  }
  return { tiles, pieces };
}
