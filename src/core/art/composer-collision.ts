import type { ComposerDoc } from './composer-buffer';
import type { MapClipboard } from '../editing/map-clipboard';
import { copyFromSection } from '../editing/map-clipboard';
import { collisionPaintWord } from '../editing/collision-word';
import type { Section } from '../model/s4-types';

/** Write one packed cell word into a composer doc plane at 8px-tile coords
 *  (tx,ty) — mapped to the 16px cell (tx>>1, ty>>1). Returns true if changed.
 *
 *  The Art facet's chunk collision brush and the map's collision tool are TWO
 *  DIFFERENT WRITERS of the same word, which is why the fix had to be swept for
 *  rather than read off the map path: an enumeration by TOOL finds one of them.
 *  Both now go through `collisionPaintWord`, so the brush writes the fields it
 *  owns and the doc cell keeps the rest — a doc seeded from a section
 *  (`seedDocCollisionFromSection`) carries whatever that section's cells had. */
export function paintDocCollision(
  doc: ComposerDoc, plane: 'a' | 'b', tx: number, ty: number, word: number,
): boolean {
  const cw = doc.widthTiles >> 1;
  const idx = (ty >> 1) * cw + (tx >> 1);
  const arr = plane === 'b' ? doc.collisionB : doc.collisionA;
  // Odd-dimension docs floor their cell count (chunkCellCount); painting the
  // odd trailing edge has no backing cell — no-op, not a phantom dirty write.
  if (idx >= arr.length) return false;
  const merged = collisionPaintWord(word, arr[idx]);
  if (arr[idx] === merged) return false;
  arr[idx] = merged;
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

/** Seed a composer doc's collision planes from a section region at tile coords
 *  (baseCol,baseRow) — the same footprint as the doc's already-captured art
 *  (e.g. capture-from-map's block/marquee flows). Delegates the per-cell
 *  extraction (top-left sub-tile read at even coords; unseeded section planes
 *  read as air) to copyFromSection so the two capture paths can't drift.
 *  baseCol/baseRow are assumed even and doc.widthTiles/heightTiles even and
 *  in-section-bounds, as with copyFromSection's other callers. Returns true if
 *  anything changed. */
export function seedDocCollisionFromSection(
  doc: ComposerDoc, section: Section, baseCol: number, baseRow: number,
): boolean {
  const captured = copyFromSection(section, baseCol, baseRow, doc.widthTiles, doc.heightTiles);
  let changed = false;
  for (let i = 0; i < doc.collisionA.length; i++) {
    if (doc.collisionA[i] !== captured.collisionA[i]) { doc.collisionA[i] = captured.collisionA[i]; changed = true; }
  }
  for (let i = 0; i < doc.collisionB.length; i++) {
    if (doc.collisionB[i] !== captured.collisionB[i]) { doc.collisionB[i] = captured.collisionB[i]; changed = true; }
  }
  return changed;
}
