/**
 * THE BAND-STAMP GESTURE (parcel J, triage 2026-08-26 §A.8), out of `.tsx` so
 * the node suite can pin it — the shape `map-band-mark.ts` took.
 *
 * Press: one whole `cols x rows` pattern is laid under the press cell, live.
 * Drag: the rectangle between the press cell and the cursor replaces it, live,
 * and every cell that leaves the rectangle goes back to its pre-gesture word.
 * Release: ONE `set-bg-override-layout` command, whose entries carry the
 * pre-gesture word of every cell the final rectangle covers — so undo restores
 * every word, and a cell the rectangle crossed and left is not an entry at all.
 *
 * The geometry is `bandStampWords` (core/editing/band-stamp.ts): column-major
 * slots, tiled with the band's period, anchored at the press cell, attribute
 * bits kept. This module owns only the live bookkeeping. It reads and writes
 * through a `BandStampPlane` rather than the document so the viewport can hand
 * it the ONE writer (`writeBgOverrideLayoutWord`) and a test can hand it an
 * array.
 */

import type { BgOverrideBand } from '../../core/formats/bg-override/bg-override';
import { bandStampRegionOf, bandStampWords } from '../../core/editing/band-stamp';

export interface BandStampPlane {
  /** Plane size in cells. */
  cols: number;
  rows: number;
  readWord(index: number): number;
  writeWord(index: number, word: number): void;
}

export interface BandStampGesture {
  band: Pick<BgOverrideBand, 'cols' | 'rows'>;
  slotBase: number;
  anchor: { col: number; row: number };
  plane: BandStampPlane;
  /** Every cell currently under the rectangle: its pre-gesture word and the word down now. */
  applied: Map<number, { oldWord: number; newWord: number }>;
}

/** Begin at the press cell: the click shape (one whole pattern) goes down at once. */
export function beginBandStamp(
  band: Pick<BgOverrideBand, 'cols' | 'rows'>, slotBase: number,
  anchor: { col: number; row: number }, plane: BandStampPlane,
): BandStampGesture {
  const g: BandStampGesture = { band, slotBase, anchor, plane, applied: new Map() };
  moveBandStamp(g, anchor);
  return g;
}

/**
 * Reshape to the rectangle between the press cell and `cursor`. Returns the
 * indices whose word changed on this move (for the renderer's dirty list).
 */
export function moveBandStamp(g: BandStampGesture, cursor: { col: number; row: number }): number[] {
  const { plane } = g;
  const region = bandStampRegionOf(g.band, g.anchor, cursor, plane.cols, plane.rows);
  // The pre-gesture words of the region, row-major: what the FIRST touch saw,
  // not what the gesture itself put down.
  const oldOf = (index: number): number => g.applied.get(index)?.oldWord ?? plane.readWord(index);
  const target = new Map<number, number>();
  if (region.width > 0 && region.height > 0) {
    const existing: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r < region.height; r++) {
      for (let c = 0; c < region.width; c++) {
        const index = (region.row + r) * plane.cols + region.col + c;
        indices.push(index);
        existing.push(oldOf(index));
      }
    }
    const words = bandStampWords(g.band, g.slotBase, region, { anchor: g.anchor, existing });
    for (let i = 0; i < indices.length; i++) target.set(indices[i], words[i]);
  }

  const dirty: number[] = [];
  // Cells that left the rectangle go back to before the gesture.
  for (const [index, e] of g.applied) {
    if (target.has(index)) continue;
    plane.writeWord(index, e.oldWord);
    g.applied.delete(index);
    dirty.push(index);
  }
  // Cells under the rectangle take the pattern's word.
  for (const [index, newWord] of target) {
    const prev = g.applied.get(index);
    if (prev === undefined) {
      const oldWord = plane.readWord(index);
      g.applied.set(index, { oldWord, newWord });
      if (oldWord !== newWord) { plane.writeWord(index, newWord); dirty.push(index); }
    } else if (prev.newWord !== newWord) {
      prev.newWord = newWord;
      plane.writeWord(index, newWord);
      dirty.push(index);
    }
  }
  return dirty;
}

/**
 * The command's entries: every covered cell whose word actually changed, with
 * its pre-gesture word. A cell already naming its slot is left out — there is
 * nothing for undo to restore.
 */
export function endBandStamp(
  g: BandStampGesture,
): Array<{ index: number; oldWord: number; newWord: number }> {
  const entries: Array<{ index: number; oldWord: number; newWord: number }> = [];
  for (const [index, e] of g.applied) {
    if (e.oldWord !== e.newWord) entries.push({ index, oldWord: e.oldWord, newWord: e.newWord });
  }
  return entries;
}
