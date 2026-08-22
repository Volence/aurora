// src/core/art/sheet-slice.ts
//
// ONE SHEET -> A LIST OF FRAME RECTS. The geometry half of sprite-sheet import
// (ROADMAP §4.9), with no dialog, no document and no target in it: what comes
// back is rectangles, and deciding what to do with them belongs to whoever asked.
//
// TWO MODES, because sheets are made two ways. A sheet laid out on a grid states
// its cell size and the answer is arithmetic; a sheet whose frames were dropped
// wherever they fit states nothing, and the frames have to be found. Neither
// mode can produce the other's answer, so neither is a fallback for the other.
//
// RGBA IN, NOT INDEXED. `sheet-import.ts` takes indexed PNG because it maps
// colours onto an act's palette and needs a PLTE to map. Slicing asks a
// different question — "where is there art?" — which is about coverage, not
// colour, and a caller holding a truecolour sheet, an ImageData, or a decoded
// indexed PNG expanded to RGBA can all ask it. See `PALETTE_SUGGEST` in
// palette-suggest.ts, which takes the same view for the same reason.
//
// Pure core — no store, no fs, no React, no DOM (an ImageData is structurally a
// SheetImage, so a renderer caller passes one straight in).

/** A decoded image, RGBA, row-major. Structurally satisfied by `ImageData`. */
export interface SheetImage {
  width: number;
  height: number;
  /** `width * height * 4` bytes. */
  data: Uint8ClampedArray;
}

/** A frame's place on the sheet. `x`/`y` are the top-left; both are inclusive
 *  of the first pixel and exclusive of `x + w` / `y + h`. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SliceRefusal {
  kind: 'bad-geometry' | 'grid-empty' | 'too-many-regions';
  detail: string;
}

export type SliceResult<T> = { ok: true; value: T } | { ok: false; refusal: SliceRefusal };

/**
 * Alpha at or above which a pixel counts as drawn.
 *
 * Matches the threshold the tile quantizer already uses (`core/import/
 * color-quantize.ts`) rather than picking a second one: the Genesis has no
 * partial alpha at all, so anything below half opacity is going to be dropped
 * by the time these pixels reach hardware, and a bounding box that includes a
 * feathered edge no tile will ever draw is not tight.
 */
export const OPAQUE_ALPHA_MIN = 128;

// ---------------------------------------------------------------------------
// Grid mode
// ---------------------------------------------------------------------------

export interface GridSpec {
  cellWidth: number;
  cellHeight: number;
  /** Border left uncut on all four sides. Default 0. */
  margin?: number;
  /** Gap between adjacent cells, both axes. Default 0. */
  spacing?: number;
  /** Extra shift of the grid origin, beyond the margin — for a sheet whose
   *  first cell does not start where its border ends. Default 0. */
  offsetX?: number;
  offsetY?: number;
}

export interface GridSlice {
  frames: FrameRect[];
  columns: number;
  rows: number;
  /** Pixels of the usable area to the right of / below the last full cell —
   *  the ragged edge, reported rather than swallowed. */
  remainderX: number;
  remainderY: number;
}

const isNonNegInt = (v: number) => Number.isInteger(v) && v >= 0;

/**
 * Cut a sheet into fixed cells, row-major (a full row left-to-right, then the
 * next row down).
 *
 * A PARTIAL TRAILING CELL IS DROPPED, both axes. The artist declared the cell
 * size; a rect narrower than it is not a frame of this grid, and emitting one
 * would hand the commit planner a frame whose dimensions contradict the spec it
 * was cut with. What is dropped is reported as `remainderX`/`remainderY`
 * instead, so a caller can say "14px of this sheet is outside the grid" rather
 * than the sheet quietly losing a column.
 */
export function sliceGrid(image: SheetImage, spec: GridSpec): SliceResult<GridSlice> {
  const margin = spec.margin ?? 0;
  const spacing = spec.spacing ?? 0;
  const offsetX = spec.offsetX ?? 0;
  const offsetY = spec.offsetY ?? 0;

  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width < 1 || image.height < 1) {
    return refuse('bad-geometry', `the sheet is ${image.width}x${image.height}`);
  }
  if (!Number.isInteger(spec.cellWidth) || !Number.isInteger(spec.cellHeight)
    || spec.cellWidth < 1 || spec.cellHeight < 1) {
    return refuse('bad-geometry', `cell size ${spec.cellWidth}x${spec.cellHeight} — both sides must be whole pixels, at least 1`);
  }
  if (!isNonNegInt(margin) || !isNonNegInt(spacing) || !isNonNegInt(offsetX) || !isNonNegInt(offsetY)) {
    return refuse('bad-geometry', `margin ${margin}, spacing ${spacing}, offset ${offsetX},${offsetY} — all must be whole pixels, none negative`);
  }

  const left = margin + offsetX;
  const top = margin + offsetY;
  const spanX = image.width - margin - left;
  const spanY = image.height - margin - top;

  const columns = countCells(spanX, spec.cellWidth, spacing);
  const rows = countCells(spanY, spec.cellHeight, spacing);
  if (columns === 0 || rows === 0) {
    return refuse('grid-empty',
      `a ${spec.cellWidth}x${spec.cellHeight} cell does not fit in the ${Math.max(0, spanX)}x${Math.max(0, spanY)} area left `
      + `by a ${image.width}x${image.height} sheet with margin ${margin} and offset ${offsetX},${offsetY}`);
  }

  const frames: FrameRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      frames.push({
        x: left + col * (spec.cellWidth + spacing),
        y: top + row * (spec.cellHeight + spacing),
        w: spec.cellWidth,
        h: spec.cellHeight,
      });
    }
  }

  return {
    ok: true,
    value: {
      frames, columns, rows,
      remainderX: spanX - (columns * spec.cellWidth + (columns - 1) * spacing),
      remainderY: spanY - (rows * spec.cellHeight + (rows - 1) * spacing),
    },
  };
}

/** How many whole cells of `cell` (separated by `spacing`) fit in `span`. */
function countCells(span: number, cell: number, spacing: number): number {
  if (span < cell) return 0;
  return Math.floor((span + spacing) / (cell + spacing));
}

// ---------------------------------------------------------------------------
// Auto-bounds mode
// ---------------------------------------------------------------------------

/** What counts as sheet background — everything else is art. */
export type BackgroundSpec =
  /** Transparent pixels only (alpha < `OPAQUE_ALPHA_MIN`). */
  | { kind: 'alpha' }
  /** Transparent pixels, plus every opaque pixel of exactly this colour — the
   *  magenta-backdrop sheet, which has no alpha channel to read. */
  | { kind: 'colour'; r: number; g: number; b: number };

export interface AutoBoundsSpec {
  background?: BackgroundSpec;
  /** 8 lets diagonally-touching pixels join one frame; 4 does not. Default 8,
   *  because a pixel-art limb attached at a corner is one sprite, not two. */
  connectivity?: 4 | 8;
  /** Fold regions whose boxes overlap into one. Default true: a detached
   *  highlight or an eye drawn inside a silhouette is part of that frame, and
   *  its box sits inside the silhouette's. */
  mergeOverlapping?: boolean;
  /** Refuse rather than return a frame list nobody can use. Default
   *  `DEFAULT_MAX_REGIONS`. */
  maxRegions?: number;
}

export interface AutoFrame extends FrameRect {
  /** Non-background pixels inside the box. Reported, not filtered on: "is this
   *  dust or a frame?" is a decision for whoever is looking at the sheet. */
  pixels: number;
}

export interface AutoBoundsSlice {
  frames: AutoFrame[];
  /** Non-background pixels in the whole sheet. Zero means the sheet was blank
   *  — a caller must say that, not show an empty frame list as a result. */
  litPixels: number;
}

/**
 * A ceiling on how many separate regions are worth returning.
 *
 * Auto-bounds on a dithered or photographic sheet finds one region per speck,
 * and the honest answer there is "this is not a sprite sheet", not a list of
 * nine thousand one-pixel frames that a UI then has to survive rendering.
 */
export const DEFAULT_MAX_REGIONS = 2048;

/**
 * Find every connected run of art on the sheet and return its tight box.
 *
 * ORDER IS PART OF THE CONTRACT, not an artifact of the scan. Frames come back
 * top-to-bottom then left-to-right, ties broken by right edge, then bottom
 * edge, then by the first pixel each region was reached at — which is total,
 * because two distinct regions cannot share a pixel. Without that last
 * tie-break two interleaved regions with identical boxes would come back in
 * whatever order the scan happened to reach them, and a frame list that
 * reshuffles between runs re-numbers the artist's frames underneath them.
 */
export function sliceAutoBounds(image: SheetImage, spec: AutoBoundsSpec = {}): SliceResult<AutoBoundsSlice> {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return refuse('bad-geometry', `the sheet is ${width}x${height}`);
  }
  if (data.length < width * height * 4) {
    return refuse('bad-geometry', `a ${width}x${height} RGBA sheet needs ${width * height * 4} bytes; got ${data.length}`);
  }

  const background = spec.background ?? { kind: 'alpha' };
  const connectivity = spec.connectivity ?? 8;
  const maxRegions = spec.maxRegions ?? DEFAULT_MAX_REGIONS;

  const lit = litMask(image, background);
  let litPixels = 0;
  for (let i = 0; i < lit.length; i++) litPixels += lit[i];

  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const regions: (AutoFrame & { first: number })[] = [];

  for (let p = 0; p < lit.length; p++) {
    if (!lit[p] || seen[p]) continue;
    if (regions.length >= maxRegions) {
      return refuse('too-many-regions',
        `more than ${maxRegions} separate regions — this looks like dithered or photographic art rather than a sprite sheet; `
        + 'cut it on a grid, or flatten the background first');
    }
    regions.push(growRegion(p, width, height, lit, seen, stack, connectivity));
  }

  const merged = spec.mergeOverlapping === false ? regions : mergeBoxes(regions);
  merged.sort((a, b) => (a.y - b.y) || (a.x - b.x)
    || ((a.x + a.w) - (b.x + b.w)) || ((a.y + a.h) - (b.y + b.h)) || (a.first - b.first));

  return {
    ok: true,
    value: { frames: merged.map(({ x, y, w, h, pixels }) => ({ x, y, w, h, pixels })), litPixels },
  };
}

/** One byte per pixel: 1 where the sheet has art. */
function litMask(image: SheetImage, background: BackgroundSpec): Uint8Array {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  const keyed = background.kind === 'colour';
  const kr = keyed ? background.r : -1;
  const kg = keyed ? background.g : -1;
  const kb = keyed ? background.b : -1;
  for (let p = 0; p < mask.length; p++) {
    const o = p * 4;
    if (data[o + 3] < OPAQUE_ALPHA_MIN) continue;
    if (keyed && data[o] === kr && data[o + 1] === kg && data[o + 2] === kb) continue;
    mask[p] = 1;
  }
  return mask;
}

/** Flood the region containing `start`, marking `seen`, returning its box. */
function growRegion(
  start: number, width: number, height: number,
  lit: Uint8Array, seen: Uint8Array, stack: Int32Array, connectivity: 4 | 8,
): AutoFrame & { first: number } {
  let sp = 0;
  stack[sp++] = start;
  seen[start] = 1;
  let minX = width, maxX = -1, minY = height, maxY = -1, pixels = 0;

  while (sp > 0) {
    const p = stack[--sp];
    const x = p % width;
    const y = (p - x) / width;
    pixels++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    const x0 = x > 0 ? x - 1 : 0;
    const x1 = x < width - 1 ? x + 1 : width - 1;
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y < height - 1 ? y + 1 : height - 1;
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        if (connectivity === 4 && nx !== x && ny !== y) continue;
        const q = ny * width + nx;
        if (!lit[q] || seen[q]) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels, first: start };
}

const overlaps = (a: FrameRect, b: FrameRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Fold overlapping boxes together until none overlap.
 *
 * Repeated rather than single-pass: a merged box is larger than both its parts
 * and can reach a third region neither part touched, so one sweep can leave
 * overlaps behind. Each sweep that changes anything removes at least one box,
 * so the loop is bounded by the box count.
 */
function mergeBoxes<T extends AutoFrame & { first: number }>(input: T[]): T[] {
  let boxes = input.slice();
  for (let guard = 0; guard <= input.length; guard++) {
    const out: T[] = [];
    let changed = false;
    for (const box of boxes) {
      const hit = out.find((o) => overlaps(o, box));
      if (!hit) { out.push({ ...box }); continue; }
      const x = Math.min(hit.x, box.x);
      const y = Math.min(hit.y, box.y);
      hit.w = Math.max(hit.x + hit.w, box.x + box.w) - x;
      hit.h = Math.max(hit.y + hit.h, box.y + box.h) - y;
      hit.x = x;
      hit.y = y;
      hit.pixels += box.pixels;
      hit.first = Math.min(hit.first, box.first);
      changed = true;
    }
    boxes = out;
    if (!changed) return boxes;
  }
  return boxes;
}

function refuse(kind: SliceRefusal['kind'], detail: string): { ok: false; refusal: SliceRefusal } {
  return { ok: false, refusal: { kind, detail } };
}
