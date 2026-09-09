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
 * Tiles per PAGE FRAME: aeon's `ART_POOL_PAGE_TILES`, spelled `quantum` in the
 * VRAM map.
 *
 * ⚠ THE TILE CEILING ABOVE IS NOT THE BINDING CONSTRAINT, AND THAT IS WHAT THIS
 * CONSTANT AND THE NEXT ONE EXIST TO SAY.
 *
 * aeon carves the FG art window into FIXED frames of this many tiles
 * (`engine/level/page_cache.emp`: "The FG art window (POOL_TILE_CEILING tiles) is
 * carved into PAGE_FRAMES fixed ... frames"). An act's art is split into pages of
 * the same size at bake time and each page occupies one whole frame.
 * A HALF-FULL PAGE STILL CONSUMES A WHOLE FRAME, so an act costs its PACKED PAGE
 * COUNT, not `ceil(tiles / quantum)`. An act whose tiles would fit in some number
 * of perfectly packed pages can need several more as actually baked.
 *
 * Aurora cannot compute the packed count — the packing runs in aeon's tooling at
 * bake time, not here — so everything downstream of this constant is a LOWER
 * BOUND and must be worded as one. See `core/agent/budget.ts`.
 *
 * FRAGMENTATION IS NOT THE HAZARD, AND THAT QUESTION IS CLOSED. Because the
 * frames are fixed-size there are no variable-size holes and nothing to
 * fragment: any free frame takes any page. The hazard is entirely the WASTE
 * INSIDE a partly-filled page.
 *
 * Read at aeon commit 49a8144cc8d286483c131f69bbc4ca9f91b8bc90 (origin/master):
 *   games/sonic4/vram.toml, blob ebbf4afba83beb8d79bd0ae74090041565684813 —
 *     THE AUTHORITY: the `[[region]]` named "fg_art_pool", its `quantum =` key.
 *   engine/system/constants.emp, blob 3b7f1b5fef0257b572785f858835082bf88b90ce —
 *     `pub const ART_POOL_PAGE_TILES` (the engine-side twin), `pub const
 *     PAGE_FRAMES = POOL_TILE_CEILING / ART_POOL_PAGE_TILES` and its `ensure`,
 *     and `pub const POOL_TILE_CEILING`.
 *   engine/level/page_cache.emp, blob 699f4cf2a35d658c7cf173b0bae724d09d5570ca —
 *     the fixed-frame carve and the pinning rule quoted below.
 *   games/sonic4/config/constants.emp, blob 3ee19baeb11762223d0fdce68bc3306746336dbf —
 *     `ensure(POOL_TILE_CEILING == 768, "vram.toml fg_art_pool drifted from engine
 *     POOL_TILE_CEILING ...")`, which makes toml/engine drift build-fatal on
 *     aeon's side. Our gate is therefore about OUR copy being current, not about
 *     policing theirs.
 *
 * `test/formats/fg-page-frame-currency.test.ts` re-reads the quantum and the
 * derivation at a committed revision on every run.
 */
export const FG_PAGE_TILES = 64;

/**
 * Divide the FG tile window into whole page frames, refusing an inexact split.
 *
 * This mirrors aeon's own comptime guard rather than inventing one:
 *
 *   ensure(PAGE_FRAMES * ART_POOL_PAGE_TILES == POOL_TILE_CEILING,
 *          "PAGE_FRAMES*ART_POOL_PAGE_TILES must tile the FG art window exactly")
 *
 * A ceiling that does not divide would otherwise yield a FRACTIONAL frame count
 * and every reading built on it would go quietly wrong rather than loud.
 */
export function deriveFgPageFrames(tiles: number, tilesPerPage: number): number {
  if (!Number.isInteger(tiles) || !Number.isInteger(tilesPerPage) || tilesPerPage <= 0) {
    throw new Error(
      `deriveFgPageFrames: the FG window (${tiles} tiles) and the page quantum `
      + `(${tilesPerPage} tiles) must both be positive integers.`,
    );
  }
  if (tiles % tilesPerPage !== 0) {
    throw new Error(
      `deriveFgPageFrames: ${tiles} tiles does not divide into whole ${tilesPerPage}-tile page `
      + 'frames. aeon enforces this exactly (engine/system/constants.emp: '
      + '"PAGE_FRAMES*ART_POOL_PAGE_TILES must tile the FG art window exactly"), so a remainder '
      + 'here means one of the two vendored numbers is wrong, not that the pool has a part '
      + 'frame. Re-read aeon\'s declaration; do not round.',
    );
  }
  return tiles / tilesPerPage;
}

/**
 * The number of page frames the FG art window is carved into: aeon's
 * `PAGE_FRAMES`.
 *
 * ⚠ DERIVED, NEVER TYPED, AND THE VALUE IS EXPECTED TO MOVE. aeon does not store
 * this number either — `engine/system/constants.emp` declares
 * `pub const PAGE_FRAMES = POOL_TILE_CEILING / ART_POOL_PAGE_TILES` and its own
 * comment says why: "NO LITERAL HERE, DELIBERATELY: this comment read
 * 'POOL_TILE_CEILING(960) ... = 15 frames' for two relayouts after the value
 * stopped being 960". The engine lane has an open recommendation to shrink the
 * pool again, which moves this count with it and announces nothing to us. So
 * every sentence, message and test expectation that shows this number must build
 * it from here rather than restate it: a derived constant with a hand-typed twin
 * in the sentence beside it is the same defect as the old bare `1024`, wearing a
 * derivation.
 */
export const FG_PAGE_FRAMES = deriveFgPageFrames(FG_TILE_LIMIT, FG_PAGE_TILES);

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
