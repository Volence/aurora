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

/**
 * The act FG art pool's ceiling, in tiles: aeon's `POOL_TILE_CEILING`.
 *
 * ⚠ THIS USED TO BE 1024, UNDER THE COMMENT "BG region starts at tile slot 1024
 * ($400); FG group unions must fit below it." THE PREMISE WAS TRUE AND THE
 * CONCLUSION WAS FALSE, which is why it survived (GUARD-SEAT-RESIDUE).
 *
 * aeon's BG arena does begin at slot 1024 — Aurora already vendors that number
 * as `BG_TILE_BASE_SLOT` in `src/core/formats/bg-override/bganim-consumer-contract.json`,
 * where `test/formats/bg-override-contract-currency.test.ts` keeps it current.
 * But the FG pool does not run up to it. aeon's VRAM map declares the FG pool as
 * one region, `fg_art_pool`, based at slot 0, and ELEVEN other regions sit
 * between that region's end and the BG arena: `spare_nametable`, `dust_puff`,
 * `dust_spindash`, `ring_sparkle`, `insta_shield`, `debug_preset_readout`,
 * `character_window`, `test_obj`, `ring_placeholder`, `test_marker` and
 * `debug_lab_name`. Using the BG base as the FG ceiling handed an author every
 * one of those slots.
 *
 * The ceiling is its own declared quantity and it MOVES: aeon's own `tiles`
 * comment records 960 -> 896 (the dust carve) -> its value today (EFFECTS-W1
 * item 0's `spare_nametable`). 1024 was never any of those, so this was not a
 * stale copy of a past value — it was a different number entirely.
 *
 * Read at aeon commit 544bd749af6eae9a5f47316cc39076ef71926b43 (origin/master):
 *   games/sonic4/vram.toml, blob ebbf4afba83beb8d79bd0ae74090041565684813 —
 *     THE AUTHORITY: the `[[region]]` named "fg_art_pool", its `tiles =` key,
 *     carrying `authority = "engine-endtiles:POOL_TILE_CEILING"`.
 *   tools/vram_map.py, blob 1c8e49f8f88cb73d1cb662c7191b9b75a51023d5 —
 *     the GENERATED copy: `POOL_TILE_CEILING = N`, generated from that toml by
 *     tools/gen_vram_map.py.
 *
 * `test/formats/fg-pool-ceiling-currency.test.ts` re-reads both at a committed
 * revision on every run and fails on a divergence, skipping LOUDLY when no aeon
 * checkout is present. Do not edit this number by hand against a memory of
 * aeon's map; move it because that gate went red.
 */
export const FG_TILE_LIMIT = 768;

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
