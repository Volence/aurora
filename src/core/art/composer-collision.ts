import type { ComposerDoc } from './composer-buffer';

/** Write one packed cell word into a composer doc plane at 8px-tile coords
 *  (tx,ty) — mapped to the 16px cell (tx>>1, ty>>1). Returns true if changed. */
export function paintDocCollision(
  doc: ComposerDoc, plane: 'a' | 'b', tx: number, ty: number, word: number,
): boolean {
  const cw = doc.widthTiles >> 1;
  const idx = (ty >> 1) * cw + (tx >> 1);
  const arr = plane === 'b' ? doc.collisionB : doc.collisionA;
  // Odd-dimension docs floor their cell count (chunkCellCount); painting the
  // odd trailing edge has no backing cell — no-op, not a phantom dirty write.
  if (idx >= arr.length) return false;
  if (arr[idx] === word) return false;
  arr[idx] = word;
  return true;
}
