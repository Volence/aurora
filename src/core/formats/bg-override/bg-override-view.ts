// The BG override document, in the shapes the CANVAS speaks.
//
// The document holds `layout` as a plain `number[]` and `tiles` as
// `number[][]` (64 pixel values each) because that is what the consumer reads
// out of JSON. The renderer wants `Uint16Array` + `Tile[]`. This module is the
// one conversion, and the one place that keeps the two representations equal.
//
// ═══ WHY THE ARRAY IDENTITY IS LOAD-BEARING ═══
//
// `SectionRenderer.loadBg` HOLDS the nametable it is given by reference:
// `markBgDirty([i])` repaints cell `i` by reading `this.bg.nametable[i]` again.
// A live paint stroke depends on that — it writes the array and marks the cell,
// with no reload in between.
//
// So a converter that returned a FRESH `Uint16Array` on every call would hand
// the renderer one array and the paint gesture another. The paint would write a
// throwaway, the repaint would read the array the renderer kept, and the cell
// would not change — a gesture that silently does nothing, with no error and
// nothing on screen to distinguish it from a correct refusal. The cache below
// exists for that reason and no other: one document, one `Uint16Array`, for as
// long as the document lives.
//
// ═══ AND WHY THERE IS EXACTLY ONE WRITER ═══
//
// Two representations of one fact can drift. `writeBgOverrideLayoutWord` writes
// BOTH, and it is the only function in this repo that writes either — the live
// stroke, the command's apply and the command's undo all go through it. On top
// of that, `bgOverrideDisplay` re-syncs the mirror from the document on every
// call (a 4,096-element copy; the whole plane) while KEEPING the array's
// identity, so a write that somehow bypassed the writer is corrected at the next
// resolve instead of persisting as a picture that disagrees with the file.

import type { Tile } from '../../model/s4-types';
import type { BgOverrideDocument } from './bg-override';

/** The document as the canvas needs it. `layout` is stable per document. */
export interface BgOverrideDisplay {
  layout: Uint16Array;
  tiles: Tile[];
}

interface CacheEntry extends BgOverrideDisplay {
  /** Identity of the array `layout` mirrors — a new one means a new document. */
  layoutSource: number[];
  /** Identity of the array `tiles` was built from. Tiles are copied, not aliased. */
  tilesSource: number[][];
}

const cache = new WeakMap<BgOverrideDocument, CacheEntry>();

function buildTiles(src: number[][]): Tile[] {
  return src.map((t) => ({ pixels: Uint8Array.from(t) }));
}

/**
 * The document's background, in canvas shapes.
 *
 * The returned `layout` is THE SAME `Uint16Array` for the same document every
 * time, so the renderer's held reference and the paint gesture's are one array.
 * `tiles` is rebuilt only when the document's tile array is replaced (which is
 * what a band insert/remove does).
 */
export function bgOverrideDisplay(doc: BgOverrideDocument): BgOverrideDisplay {
  let entry = cache.get(doc);
  if (entry === undefined
      || entry.layoutSource !== doc.layout
      || entry.layout.length !== doc.layout.length) {
    entry = {
      layout: Uint16Array.from(doc.layout),
      layoutSource: doc.layout,
      tiles: buildTiles(doc.tiles),
      tilesSource: doc.tiles,
    };
    cache.set(doc, entry);
    return entry;
  }
  if (entry.tilesSource !== doc.tiles) {
    entry.tiles = buildTiles(doc.tiles);
    entry.tilesSource = doc.tiles;
  }
  // Re-sync in place. Identity survives (the renderer keeps this array); any
  // divergence from the document loses.
  for (let i = 0; i < doc.layout.length; i++) entry.layout[i] = doc.layout[i];
  return entry;
}

/**
 * Write one nametable word into the document AND into its display mirror.
 *
 * THE ONLY WRITER of either. Out-of-range indices are ignored rather than
 * throwing: the callers are a live paint stroke and an undo, and neither has a
 * useful thing to do with an exception — but the guard exists so a stale command
 * (a document that shrank under it) cannot append to the layout and silently
 * change the plane's height.
 */
export function writeBgOverrideLayoutWord(
  doc: BgOverrideDocument, index: number, word: number,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= doc.layout.length) return;
  doc.layout[index] = word;
  const entry = cache.get(doc);
  if (entry !== undefined && entry.layoutSource === doc.layout && index < entry.layout.length) {
    entry.layout[index] = word;
  }
}
