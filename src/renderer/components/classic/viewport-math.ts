// Pure viewport / overlay math for the classic (Sonic 1) level viewport.
//
// Extracted from ClassicLevelViewport.tsx so the load-bearing logic — which
// chunks the camera can see, how to index a possibly-irregular layout blob, and
// how object $25 expands into a visible ring group — is unit-testable without a
// DOM or canvas. The component is a thin drawing shell over these functions.

import type { LayoutGrid } from '../../../core/level-classic/model';

/** A chunk is a 256x256 world-pixel cell in the FG/BG layout grid. */
export const CHUNK_PX = 256;

export interface ChunkRange {
  startCol: number;
  startRow: number;
  /** Exclusive upper bounds (loop `col < endCol`). */
  endCol: number;
  endRow: number;
}

/**
 * The half-open range of chunk columns/rows intersecting the camera rectangle,
 * clamped to the grid. The camera is described the way the map viewport's
 * `useViewStore` does it (see src/renderer/state/viewStore.ts + MapViewport's
 * render effect): `vpX/vpY` is the world coordinate at the canvas' top-left and
 * `zoom` scales world→screen, so the visible world span is `canvasPx / zoom`.
 */
export function visibleChunkRange(
  vpX: number,
  vpY: number,
  canvasW: number,
  canvasH: number,
  zoom: number,
  gridW: number,
  gridH: number,
): ChunkRange {
  const worldW = canvasW / zoom;
  const worldH = canvasH / zoom;
  const startCol = Math.max(0, Math.floor(vpX / CHUNK_PX));
  const startRow = Math.max(0, Math.floor(vpY / CHUNK_PX));
  const endCol = Math.min(gridW, Math.ceil((vpX + worldW) / CHUNK_PX));
  const endRow = Math.min(gridH, Math.ceil((vpY + worldH) / CHUNK_PX));
  return {
    startCol,
    startRow,
    // Guard against an all-off-screen camera producing end < start.
    endCol: Math.max(startCol, endCol),
    endRow: Math.max(startRow, endRow),
  };
}

/**
 * The chunk id at layout cell (col, row), or `undefined` when the cell is
 * outside the declared grid OR beyond the bytes actually present in the blob.
 *
 * DEFENSIVE by contract (LayoutGrid docs, model.ts): four real S1 files have
 * `cells.length !== width*height` — ending.bin is truncated, others carry a
 * trailing byte. We clamp the linear index to `min(cells.length, width*height)`
 * and treat anything past it as blank (undefined → the caller draws nothing),
 * never reading out of bounds and never surfacing a stray trailing byte through
 * an in-grid coordinate.
 */
export function layoutCellAt(grid: LayoutGrid, col: number, row: number): number | undefined {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return undefined;
  const bound = Math.min(grid.cells.length, grid.width * grid.height);
  const index = row * grid.width + col;
  if (index >= bound) return undefined;
  return grid.cells[index];
}

/** A pan/zoom camera: `x/y` is the world coordinate at the canvas top-left. */
export interface ViewportCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface WorldPos {
  x: number;
  y: number;
}

/**
 * Convert a screen-space pixel offset (relative to the canvas top-left) to world
 * coordinates under the camera. This is the inverse of the draw transform
 * `scale(zoom); translate(-cam.x, -cam.y)` documented on ClassicLevelViewport:
 * screen→world is `cam.x + screenPx / zoom`. Passing a zero-origin camera
 * (`{x:0, y:0, zoom}`) turns a screen delta into a world delta (used for panning).
 */
export function screenToWorld(cam: ViewportCamera, sx: number, sy: number): WorldPos {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}

/** The layout cell (column, row) that contains a world-pixel coordinate. */
export function worldToLayoutCell(worldX: number, worldY: number): { col: number; row: number } {
  return { col: Math.floor(worldX / CHUNK_PX), row: Math.floor(worldY / CHUNK_PX) };
}

/** One accumulated stamp cell (grid column/row). */
export interface StampCell {
  x: number;
  y: number;
}

/**
 * Add layout cell (col,row) to an in-progress stamp-gesture accumulator (Task 13).
 *
 * The accumulator is a Map keyed by the linear cell index (`row*gridW+col`), so
 * re-touching a cell as the drag wiggles over it is a no-op — the whole gesture
 * collapses to at most one write per cell, which is exactly one undo step's worth
 * of `classicSetLayoutCells` on mouseup. Cells outside the declared grid are
 * dropped (a drag may wander past the level edge; only in-bounds cells paint, and
 * the store command would otherwise reject the whole gesture on an out-of-bounds
 * cell). Returns true iff a NEW in-bounds cell was added, so the caller can redraw
 * the stamp preview only when something changed.
 */
export function addStampCell(
  acc: Map<number, StampCell>,
  col: number,
  row: number,
  gridW: number,
  gridH: number,
): boolean {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return false;
  if (col < 0 || row < 0 || col >= gridW || row >= gridH) return false;
  const key = row * gridW + col;
  if (acc.has(key)) return false;
  acc.set(key, { x: col, y: row });
  return true;
}

/**
 * Flatten a stamp-gesture accumulator into the `classicSetLayoutCells` payload,
 * stamping the given chunk id into every accumulated cell. Insertion order is
 * preserved (Map iteration order), though the command result is order-independent.
 */
export function stampAccumToCells(
  acc: Map<number, StampCell>,
  chunkId: number,
): { x: number; y: number; chunkId: number }[] {
  const out: { x: number; y: number; chunkId: number }[] = [];
  for (const c of acc.values()) out.push({ x: c.x, y: c.y, chunkId });
  return out;
}

export interface RingPos {
  x: number;
  y: number;
}

// Ring spacing table — a byte-for-byte port of Ring_PosData in
// s1disasm/_incObj/25, 37 Rings.asm: [horizontal, vertical] step per orientation
// nibble (0..$F). Signed values are the disasm's negative dc.b entries.
const RING_POS_DATA: readonly [number, number][] = [
  [0x10, 0], [0x18, 0], [0x20, 0], // $0-$2 right: short / medium / far
  [0, 0x10], [0, 0x18], [0, 0x20], // $3-$5 down
  [0x10, 0x10], [0x18, 0x18], [0x20, 0x20], // $6-$8 diagonal right
  [-0x10, 0x10], [-0x18, 0x18], [-0x20, 0x20], // $9-$B diagonal left
  [0x10, 8], [0x18, 0x10], // $C-$D diagonal right-right
  [-0x10, 8], [-0x18, 0x10], // $E-$F diagonal left-left
];

/**
 * Expand an S1 ring group (object $25) to the individual ring positions the
 * engine spawns. Ported from Ring_Main:
 *   count       = (subtype & 7) + 1, with the disasm's 8-ring guard: a low
 *                 nibble of 7 spawns 7 rings, not 8 (it would corrupt the
 *                 respawn byte's MSB), so `& 7 == 7` still yields 7.
 *   orientation = (subtype >> 4) & 0xF → Ring_PosData step (dx, dy).
 * Each ring after the first is offset by the cumulative step.
 */
export function ringGroupPositions(subtype: number, x: number, y: number): RingPos[] {
  let d1 = subtype & 7; // Ring_Main: andi.w #7,d1
  if (d1 === 7) d1 = 6; // cmpi #7 / moveq #6,d1 — the 8-ring guard
  const count = d1 + 1; // dbf uses d1 as (count - 1)
  const orient = (subtype >> 4) & 0xf;
  const [dx, dy] = RING_POS_DATA[orient] ?? [0x10, 0];
  const out: RingPos[] = [];
  let cx = x;
  let cy = y;
  for (let i = 0; i < count; i++) {
    out.push({ x: cx, y: cy });
    cx += dx;
    cy += dy;
  }
  return out;
}
