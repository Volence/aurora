// VRAM checkerboard coloring, and the FG pool limit the budget readout measures
// against.
//
// This file used to also assign per-section VRAM bases and emit `vram_bases.asm`
// for the export path. That path was retired 2026-08-19 (ROADMAP §4.2) — the
// engine moved to an act-wide ZX0-paged art pool and never read the output —
// and `assignVramBases`/`generateVramBasesAsm`/`VramBaseAssignment` went with it.
// The ONE remaining consumer is `core/agent/budget.ts` (`computeActBudget`,
// behind the `check_budget` agent tool), which is why the two symbols below
// survive. It is also why this module is the last non-sprite thing in
// `core/export/`: keep that in mind before adding to it.

// BG region starts at tile slot 1024 ($400); FG group unions must fit below it.
export const FG_TILE_LIMIT = 1024;

/**
 * Checkerboard coloring: active sections get (col+row)%2, inactive get -1.
 * Adjacent (H/V) sections are co-visible during teleports and must differ.
 */
export function computeVramColoring(
  gridWidth: number,
  gridHeight: number,
  activeSlots: boolean[],
): number[] {
  const count = gridWidth * gridHeight;
  const colors = new Array<number>(count).fill(-1);
  for (let i = 0; i < count; i++) {
    if (!activeSlots[i]) continue;
    const col = i % gridWidth;
    const row = Math.floor(i / gridWidth);
    colors[i] = (col + row) % 2;
  }
  return colors;
}
