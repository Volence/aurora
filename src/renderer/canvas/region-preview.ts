import { rasterizeNametableChunk } from '../../core/art/rasterize';
import type { Tile } from '../../core/model/s4-types';
import type { Palette } from '../../core/model/types';

/**
 * PREVIEWING AN ARBITRARY MAP REGION'S ART — the one path, for every caller.
 *
 * ═══ WHY THIS MODULE EXISTS AT ALL ═══
 *
 * Three surfaces now show the author what a rectangle of map actually contains:
 * the stamp ghost (a library chunk under the cursor), the paste ghost (what is
 * on the map clipboard) and the marquee panel's selection preview (what the
 * current drag has grabbed). All three ask the same question of the same kind
 * of object — a nametable plus its two dimensions — and all three answer it by
 * rasterising at the region's OWN footprint and drawing that into a canvas.
 *
 * A second copy of those four lines is not a style problem here. It is where the
 * crash was.
 *
 * ═══ THE CRASH THIS FILE IS SHAPED AROUND ═══
 *
 * The stamp ghost originally rasterised through `rasterizeAeonChunk`, which
 * returns a FIXED 128x128 buffer (the thumbnail grid's contract), and then paired
 * it with an ImageData sized to the chunk's own footprint. For any chunk smaller
 * than 16x16 tiles the source buffer is LONGER than the destination and
 * `img.data.set` throws RangeError; for any larger one it silently row-garbles.
 * Marquee-saved chunks are arbitrary-sized, so every one of them hit it. The
 * throw came from mousemove (which ate the ghost) and again from inside the
 * render effect after the stamp click, where it unmounted the React root — the
 * owner's crash. See `providers/chunk-grid-aeon.ts`, whose two rasterisers still
 * carry that warning between them.
 *
 * The fix was to size the buffer and the ImageData from the same two numbers.
 * That is a one-line invariant and it was restored in exactly one call site,
 * which left every FUTURE call site free to get it wrong again — and this parcel
 * adds two, over regions that are smaller (down to a single 8x8 tile), odder
 * (any width x any height, no longer even) and far more numerous than anything
 * the stamp path ever saw.
 *
 * So the derivation happens HERE, once, and both new call sites go through it:
 * `widthTiles`/`heightTiles` are read off the source and used for the raster
 * dimensions AND the ImageData dimensions, with no opportunity for a caller to
 * supply either separately. `regionPreviewRgba` is deliberately DOM-free so the
 * node suite can hold the length invariant directly at the sizes that used to
 * throw.
 */

/** Anything shaped like a rectangular nametable — a `ChunkDef`, a
 *  `MapClipboard`, or a region read straight off a section. */
export interface RegionPreviewSource {
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;
}

/**
 * RGBA for `source` at its NATIVE footprint: exactly
 * `(widthTiles*8) * (heightTiles*8) * 4` bytes, for every width and height
 * including 1x1 and odd sizes. Null for a degenerate (non-positive) region.
 *
 * DOM-free on purpose — see the module docblock.
 */
export function regionPreviewRgba(
  source: RegionPreviewSource,
  tiles: readonly Tile[],
  palette: Palette,
): Uint8ClampedArray | null {
  const { widthTiles, heightTiles } = source;
  if (widthTiles <= 0 || heightTiles <= 0) return null;
  return rasterizeNametableChunk(source, tiles, palette, widthTiles * 8, heightTiles * 8);
}

/**
 * `source` rasterised into a fresh canvas at its native footprint, or null when
 * the region is degenerate or no 2D context is available.
 *
 * The canvas, the ImageData and the raster buffer are all sized from the SAME
 * `widthTiles`/`heightTiles` read here, which is the whole point: there is no
 * argument a caller could pass that would let the three disagree.
 */
export function regionPreviewCanvas(
  source: RegionPreviewSource,
  tiles: readonly Tile[],
  palette: Palette,
): HTMLCanvasElement | null {
  const rgba = regionPreviewRgba(source, tiles, palette);
  if (!rgba) return null;
  const px = source.widthTiles * 8, py = source.heightTiles * 8;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = py;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // createImageData + set rather than the ImageData constructor, matching
  // TilesetPanel and the stamp ghost: the rasteriser hands back a
  // Uint8ClampedArray and the constructor wants its own buffer type.
  const img = ctx.createImageData(px, py);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * WHAT THE PASTE GHOST IS CURRENTLY SHOWING — a published report, read-only.
 *
 * The hovered footprint is deliberately a MapViewport-local ref rather than
 * store state (nothing outside the viewport needs the exact cell, only whether
 * pasting is active), and that is still right. But it is also the quantity a
 * bug can leave FROZEN while everything else keeps working, and a harness that
 * cannot read it cannot tell a pan that carries the ghost from a pan that
 * strands it. So it is published here the way `publishGuideReport` and
 * `publishScreenFrameReport` publish theirs — a PUBLISH, never a
 * re-derivation: whatever the viewport actually drew is what this says.
 *
 * `paints` makes "the ghost never updated" distinguishable from "the ghost
 * updated to the same cell", which a null-vs-value read alone cannot do.
 */
export interface PasteGhostReport {
  pasting: boolean;
  hover: { sectionIndex: number; baseCol: number; baseRow: number } | null;
  paints: number;
}

let lastPasteGhost: PasteGhostReport = { pasting: false, hover: null, paints: 0 };

export function publishPasteGhostReport(r: Omit<PasteGhostReport, 'paints'>): void {
  lastPasteGhost = { ...r, paints: lastPasteGhost.paints + 1 };
}

export function lastPasteGhostReport(): PasteGhostReport {
  return lastPasteGhost;
}
