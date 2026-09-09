import type { ChunkDef } from './s4-types';
import { packCollisionCell } from '../collision/collision-cell-word';
import type { FullBlockShapeLookup } from '../collision/full-block-shape';

/** Seed the word planes from the legacy per-tile nibble plane (bit0 solidAll,
 *  bit1 solidTop; solidAll wins). `legacy` is the raw `collision` array parsed
 *  straight from an old chunks.json (ChunkDef no longer carries the field —
 *  the legacy encoding survives ONLY as migration input here). Sampling:
 *  top-left tile of each 2x2 cell (the import wrote all four tiles
 *  identically). No-op if `legacy` is absent, any plane word is already set
 *  (already-migrated chunk), or the full-block lookup did not find a shape.
 *
 *  ⚠ `fullBlock` IS THE RESULT, NOT AN ID. It used to be a bare
 *  `fullBlockShape: number` with 0 meaning "profiles missing" — the same 0 that
 *  also meant "a real bank with no full block", which is the conflation ledger
 *  row FULLBLOCK-ZERO-IS-TWO-ANSWERS is about. This function did check its 0,
 *  correctly; it takes the result type anyway so that no caller can hand it a
 *  number that has already lost the distinction. See full-block-shape.ts. */
export function migrateLegacyChunkCollision(
  chunk: ChunkDef, legacy: Uint8Array | number[] | undefined, fullBlock: FullBlockShapeLookup,
): boolean {
  if (!legacy || fullBlock.status !== 'found') return false;
  const fullBlockShape = fullBlock.shapeId;
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
