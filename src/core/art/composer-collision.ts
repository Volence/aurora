import type { ComposerDoc } from './composer-buffer';
import type { MapClipboard } from '../editing/map-clipboard';

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

/** Paste a MapClipboard's collision planes onto a composer doc at the origin
 *  (cell 0,0) — art is out of scope (chunk art still comes from stamps/save).
 *  Size-clamped to the smaller of the clipboard's and the doc's cell grids so
 *  an oversized clipboard silently truncates instead of overflowing. Returns
 *  true if anything changed. */
export function applyClipboardCollisionToDoc(doc: ComposerDoc, clip: MapClipboard): boolean {
  const docCellsW = doc.widthTiles >> 1, docCellsH = doc.heightTiles >> 1;
  const clipCellsW = clip.widthTiles >> 1, clipCellsH = clip.heightTiles >> 1;
  const w = Math.min(docCellsW, clipCellsW);
  const h = Math.min(docCellsH, clipCellsH);
  let changed = false;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const srcIdx = cy * clipCellsW + cx;
      const dstIdx = cy * docCellsW + cx;
      const a = clip.collisionA[srcIdx], b = clip.collisionB[srcIdx];
      if (doc.collisionA[dstIdx] !== a) { doc.collisionA[dstIdx] = a; changed = true; }
      if (doc.collisionB[dstIdx] !== b) { doc.collisionB[dstIdx] = b; changed = true; }
    }
  }
  return changed;
}
