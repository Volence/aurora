import type { ChunkDef } from './s4-types';
import { packCollisionCell } from '../collision/collision-cell-word';

/** Seed the word planes from the legacy per-tile nibble plane (bit0 solidAll,
 *  bit1 solidTop; solidAll wins). Sampling: top-left tile of each 2x2 cell (the
 *  import wrote all four tiles identically). No-op if any plane word is already
 *  set (already-migrated chunk) or fullBlockShape is 0 (profiles missing). */
export function migrateLegacyChunkCollision(
  chunk: ChunkDef, legacy: Uint8Array, fullBlockShape: number,
): boolean {
  if (fullBlockShape === 0) return false;
  if (chunk.collisionA.some(w => w !== 0) || chunk.collisionB.some(w => w !== 0)) return false;
  const cw = chunk.widthTiles >> 1, ch = chunk.heightTiles >> 1;
  let wrote = false;
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const v = legacy[(cy * 2) * chunk.widthTiles + cx * 2] ?? 0;
      if (v === 0) continue;
      const word = packCollisionCell({
        shape: fullBlockShape, xFlip: false, yFlip: false,
        solidity: (v & 1) ? 'all' : 'top',
      });
      chunk.collisionA[cy * cw + cx] = word;
      chunk.collisionB[cy * cw + cx] = word;
      wrote = true;
    }
  }
  return wrote;
}
