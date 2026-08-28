// ONE VEIL ALGORITHM, TWO ENGINES.
//
// The priority lens marks the tiles that will draw IN FRONT of the player. Both
// viewports need it and both were told the same thing by the owner ("no way to
// see what art on fg is priority or not — randomly sometimes sonic just goes
// behind a tile that I wasn't aware was prioritised"), so the DEPICTION lives
// here once instead of twice:
//
//   • a translucent veil over each marked 8x8 tile, merged into horizontal runs
//     so a solid region is a few wide blits rather than one rect per tile;
//   • a crisp 1-SCREEN-px stroke on every marked↔unmarked boundary, so a region
//     reads as one outlined shape instead of a tile-grid mush and a lone marked
//     tile stays unmissable at any zoom.
//
// MARK THE EXCEPTION, NOT THE RULE. Unmarked tiles are left as untouched art.
// Veiling the majority would turn the lens into a full-map dimmer, which is a
// worse answer to "I could not see it" than no lens at all.
//
// WHAT LIVES HERE AND WHAT DOES NOT. This module knows nothing about priority,
// nametables, blocks or chunks — it takes a boolean predicate over a tile grid.
// The two engines disagree completely about where the bit comes from (classic
// composes it through chunk→block→quad with a flip trap, see
// core/level-classic/priority-mask.ts; aeon reads it straight off an 8px
// nametable word, see core/model/nametable-priority.ts) and NOTHING about that
// generalises. What generalises is the picture, so only the picture is shared.
//
// UNKNOWN NEIGHBOURS NEVER GET A STROKE. `cols`/`rows` bound the GRID; a probe
// outside it is unknown, not unmarked, and an unknown neighbour is left
// unstroked. Classic sees one chunk at a time and genuinely cannot tell whether
// a region continues next door — a false 256px seam grid through a dense high
// region would be the lens lying — and aeon has the same problem at a section
// edge. The fill edge still carries the truth there.
//
// THE WINDOW IS NOT THE GRID. `colStart..colEnd` / `rowStart..rowEnd` bound the
// ITERATION only. Aeon's sections are 256x256 tiles (65,536 cells, up to 48 per
// act) so a full scan per repaint is not affordable and the caller windows to
// the viewport; the neighbour probes still reach outside that window, so a
// boundary at the window edge is decided against the REAL neighbour and no
// stroke appears where the region simply continues off-screen. Classic passes
// the whole chunk and is therefore bit-identical to the loop this replaced.

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface TileLensSpec {
  /** Grid extent, in tiles. Probes outside are UNKNOWN (see the docblock). */
  cols: number;
  rows: number;
  /** Iteration window in tile coords, half-open. Clamped into the grid here. */
  colStart: number;
  colEnd: number;
  rowStart: number;
  rowEnd: number;
  /** Tile edge in world px (8 in both engines today; named, not assumed). */
  tilePx: number;
  /** World-px origin added to every emitted coordinate. */
  originX: number;
  originY: number;
  /** Is this tile marked? Called with grid coords; may be probed out of range. */
  marked: (tx: number, ty: number) => boolean;
  /** Veil colour. */
  fill: string;
  /** Boundary stroke colour. */
  edge: string;
  /** One SCREEN px in world units — the ctx is scaled by zoom. */
  invZoom: number;
}

/** What one call actually painted, so a caller can publish a real count. */
export interface TileLensDrawn {
  /** `fillRect` calls issued (merged runs, so <= marked tiles). */
  veils: number;
  /** Boundary segments stroked (each is one moveTo/lineTo pair). */
  segments: number;
}

/**
 * Paint the lens. Returns what it painted — zero veils is a real answer (no
 * marked tile in the window), never an error.
 */
export function drawTileLens(ctx: Ctx, spec: TileLensSpec): TileLensDrawn {
  const { cols, rows, tilePx: T, originX, originY, invZoom } = spec;
  const c0 = Math.max(0, spec.colStart);
  const c1 = Math.min(cols, spec.colEnd);
  const r0 = Math.max(0, spec.rowStart);
  const r1 = Math.min(rows, spec.rowEnd);
  const drawn: TileLensDrawn = { veils: 0, segments: 0 };
  if (c1 <= c0 || r1 <= r0) return drawn;

  // In-grid probe. Out of range = unknown = false for the veil test, and the
  // stroke tests below range-check separately so unknown never strokes.
  const on = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && spec.marked(tx, ty);

  // Veils, merged into horizontal runs. The merge is clamped to the WINDOW so a
  // wide marked band does not blit far past the visible edge; correctness is
  // unaffected either way (the canvas would clip it), the cost is not.
  ctx.fillStyle = spec.fill;
  for (let ty = r0; ty < r1; ty++) {
    for (let tx = c0; tx < c1; tx++) {
      if (!on(tx, ty)) continue;
      let run = 1;
      while (tx + run < c1 && on(tx + run, ty)) run++;
      ctx.fillRect(originX + tx * T, originY + ty * T, run * T, T);
      drawn.veils++;
      tx += run; // skip the run; the loop's tx++ lands on the first unmarked tile
    }
  }

  // Boundary strokes: each marked tile's sides whose neighbour is KNOWN-unmarked.
  ctx.strokeStyle = spec.edge;
  ctx.lineWidth = 1 * invZoom;
  ctx.beginPath();
  for (let ty = r0; ty < r1; ty++) {
    for (let tx = c0; tx < c1; tx++) {
      if (!on(tx, ty)) continue;
      const x = originX + tx * T;
      const y = originY + ty * T;
      if (ty > 0 && !on(tx, ty - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + T, y); drawn.segments++; }
      if (ty < rows - 1 && !on(tx, ty + 1)) { ctx.moveTo(x, y + T); ctx.lineTo(x + T, y + T); drawn.segments++; }
      if (tx > 0 && !on(tx - 1, ty)) { ctx.moveTo(x, y); ctx.lineTo(x, y + T); drawn.segments++; }
      if (tx < cols - 1 && !on(tx + 1, ty)) { ctx.moveTo(x + T, y); ctx.lineTo(x + T, y + T); drawn.segments++; }
    }
  }
  ctx.stroke();
  return drawn;
}
