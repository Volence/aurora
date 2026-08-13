import type { EditableTileRange } from '../project/adapter';
import type { BlockDef } from './model';

// Default composer selections for act open. Tile $000 and block $000 are blank
// in every stock act, so landing there shows an empty checkerboard/black square
// that reads as "broken" — pick the first entity a user can actually see.

/** True when the 32-byte span for tileIndex is all zero (renders fully transparent). */
export function isBlankTile(tiles: Uint8Array, tileIndex: number): boolean {
  const base = tileIndex * 32;
  if (base < 0 || base + 32 > tiles.length) return true;
  for (let i = base; i < base + 32; i++) if (tiles[i] !== 0) return false;
  return true;
}

/**
 * The tile index the composer should land on when an act opens: the first tile
 * that is neither blank nor locked (lock rules mirror tileLockReason — indices
 * past baseTileCount and animated-art slots are view-only). Falls back to 0
 * when every tile is blank or locked (degenerate pools, fakes).
 */
export function firstEditableNonBlankTile(tiles: Uint8Array, range: EditableTileRange | null): number {
  const poolCount = Math.floor(tiles.length / 32);
  const limit = range ? Math.min(poolCount, range.baseTileCount) : poolCount;
  for (let t = 0; t < limit; t++) {
    if (range?.animRanges.some((r) => t >= r.start && t < r.start + r.count)) continue;
    if (!isBlankTile(tiles, t)) return t;
  }
  return 0;
}

/**
 * The block id the composer should land on when an act opens: the first block
 * with any non-default cell (a cell referencing tile 0 with no flips/pal/pri is
 * the blank pattern). Falls back to 0 when every block is blank.
 */
export function firstNonBlankBlock(blocks: BlockDef[]): number {
  for (let b = 0; b < blocks.length; b++) {
    if (blocks[b].cells.some((c) => c.tile !== 0 || c.xf || c.yf || c.pal !== 0 || c.pri)) return b;
  }
  return 0;
}
