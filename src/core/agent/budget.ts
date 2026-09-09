import { unpackNametableWord } from '../model/s4-types';
import type { Section, Tile } from '../model/s4-types';
import { flipTile } from '../import/tile-dedup';
import {
  computeVramColoring, FG_TILE_LIMIT, FG_PAGE_TILES, FG_PAGE_FRAMES,
} from '../export/vram-coloring';

function rawHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += (pixels[i] & 0xF).toString(16);
  return s;
}

// Assumes Tile pixel arrays are immutable after creation (true: the editor
// paints nametables, never tile pixels).
const canonicalHashCache = new WeakMap<Uint8Array, string>();

/** Flip-aware canonical hash: minimum of the 4 flip-variant hashes. */
export function canonicalTileHash(pixels: Uint8Array): string {
  const cached = canonicalHashCache.get(pixels);
  if (cached !== undefined) return cached;
  let min = rawHash(pixels);
  for (const [xf, yf] of [[true, false], [false, true], [true, true]] as const) {
    const h = rawHash(flipTile(pixels, xf, yf));
    if (h < min) min = h;
  }
  canonicalHashCache.set(pixels, min);
  return min;
}

/**
 * ⚠ THE UNIT IS THE PAGE FRAME, NOT THE TILE, AND THIS SHAPE LEADS WITH IT.
 *
 * This interface has been wrong twice in one night about the same quantity. It
 * first carried a ceiling a third too generous (`FG_TILE_LIMIT` was 1024 against
 * an engine that declares 768 — see
 * docs/reviews/2026-09-09-guard-residue-offschema.md). That fixed the ceiling's
 * VALUE. The unit was still wrong, and this is that correction.
 *
 * WHAT THE ENGINE ACTUALLY REFUSES YOU ON. aeon carves the FG art window into
 * fixed `FG_PAGE_TILES`-tile frames and an act's baked art is split into pages of
 * that size; a page occupies a whole frame however full it is. So an act costs
 * its PACKED PAGE COUNT and the capacity is `FG_PAGE_FRAMES`. Packing happens at
 * bake time, in aeon's tooling — nothing in Aurora can run it — so the packed
 * count is NOT KNOWABLE HERE and `pageFramesAtLeast` is a LOWER BOUND.
 *
 * ⚠ THE COMMENT THIS REPLACED READ "Counts match export exactly (both flip-aware
 * + blank seed), so fits === !exportThrows", AND BOTH HALVES HAD EXPIRED: the
 * per-section VRAM-base export path was retired 2026-08-19 (see
 * core/export/vram-coloring.ts's header) and `computeActBudget` is the last
 * consumer of the two symbols that survived it, so the equivalence named a
 * comparand that no longer existed. There is deliberately no `fits` on this
 * interface now, for the same reason: Aurora cannot say an act fits.
 *
 * THREE THINGS REMAIN UNQUANTIFIED. They are carried in `unquantified` as
 * sentences so a reply cannot show the numbers without them, and repeated here
 * for whoever edits this file:
 *
 *   1. THE DOUBLE-COUNT. `groups` still splits the act into the two checkerboard
 *      VRAM colors the retired scheme needed and `tiles` SUMS their unions, while
 *      aeon holds act FG art in ONE globally-deduped pool. A tile used by both
 *      groups is counted twice here and once there, so this is CONSERVATIVE BY AN
 *      AMOUNT NOBODY HAS MEASURED. Answering the fragmentation question did not
 *      make this figure equivalent to aeon's.
 *   2. THE PACKING WASTE, which is why the bound is a bound.
 *   3. PINNING. `engine/level/page_cache.emp`: "a page whose refcount is 0 and is
 *      not pinned is an eviction candidate". A pinned frame is never a victim, so
 *      the capacity that must cover a MOVING view is the UNPINNED frame count,
 *      which is fewer than `pageFrames` by a number aeon has open and has not
 *      measured. Do not invent one.
 *
 * FRAGMENTATION IS NOT ON THAT LIST AND IS CLOSED: the frames are fixed-size, so
 * there are no variable-size holes and any free frame takes any page.
 */
export interface ActBudget {
  perSection: Array<{ index: number; uniqueTiles: number }>;
  groups: Array<{ color: number; unionTiles: number; baseSlot: number }>;
  /** Summed unique tiles across the color groups. Conservative — see `unquantified`. */
  tiles: number;
  /** aeon's POOL_TILE_CEILING, in tiles. Reported, but NOT the binding constraint. */
  tileCeiling: number;
  /** Tiles per page frame: aeon's ART_POOL_PAGE_TILES / the VRAM map's `quantum`. */
  pageTiles: number;
  /** Frames the FG window is carved into: aeon's PAGE_FRAMES. Derived, and it moves. */
  pageFrames: number;
  /**
   * LOWER BOUND on the page frames this act costs — `ceil(tiles / pageTiles)`.
   * The packed cost is AT LEAST this and may be higher. Never show it as a figure.
   */
  pageFramesAtLeast: number;
  /**
   * There are only two honest verdicts, and neither of them is "fits".
   *
   *   'over'         — the LOWER BOUND alone exceeds `pageFrames`, so the packed
   *                    count does too and aeon will refuse this act. A refusal is
   *                    the one thing a lower bound can prove.
   *   'undetermined' — the lower bound is within `pageFrames`. Whether the PACKED
   *                    count is, is not measured here.
   */
  verdict: 'over' | 'undetermined';
  /** What this reading cannot tell you, in sentences, always non-empty. */
  unquantified: string[];
}

export interface ActLike {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
}

/**
 * The three admitted unknowns, as sentences that travel WITH the numbers — plus,
 * last, the one neighbouring question that is CLOSED, said out loud so nobody
 * re-opens it and so "fragmentation cannot refuse you" cannot travel as "your
 * number is right".
 *
 * ⚠ EVERY FIGURE IN HERE IS INTERPOLATED, NEVER TYPED. The pool's size is
 * expected to move (the engine lane has an open recommendation to shrink it),
 * which moves `FG_PAGE_FRAMES` with it and announces nothing to this repo. A
 * typed twin beside a derived constant is the defect this parcel exists to
 * remove, not a shortcut. `test/agent/budget.test.ts` asserts this property over
 * the strings rather than trusting the rule.
 */
function unquantified(pageFramesAtLeast: number): string[] {
  return [
    `A LOWER BOUND, NOT A FIGURE: pageFramesAtLeast is ceil(tiles / ${FG_PAGE_TILES}) = `
    + `${pageFramesAtLeast}. aeon packs the act's art into pages at BAKE TIME, in its own `
    + 'tooling, and a half-full page still consumes a whole frame, so the real cost is AT '
    + 'LEAST this and can be several frames higher. Aurora cannot run that packing and does '
    + 'not know the packed count.',

    'CONSERVATIVE BY AN UNQUANTIFIED AMOUNT: the tile count sums the unique tiles of the TWO '
    + 'checkerboard VRAM color groups separately, which is the shape of a retired per-section '
    + 'VRAM-base scheme. aeon holds act FG art in one globally-deduped pool, so a tile used by '
    + 'both groups is counted twice here and once there. Nothing in Aurora measures the '
    + 'overcount, so the margin this buys you is unknown in size.',

    `UNMEASURED, AND IT REDUCES THE CAPACITY: a page frame can be PINNED, and a pinned frame is `
    + `never an eviction candidate, so the frames available to cover a moving view are fewer `
    + `than the ${FG_PAGE_FRAMES} the window is carved into. aeon has this open with no `
    + `measurement behind it; do not assume a number for it.`,

    `NOT A HAZARD, AND CLOSED: fragmentation cannot refuse an act whose page count fits. The `
    + `frames are fixed ${FG_PAGE_TILES}-tile slots, so there are no variable-size holes and `
    + `any free frame takes any page. The waste is inside a partly-filled page, which is what `
    + `the lower bound above cannot see.`,
  ];
}

export function computeActBudget(act: ActLike, tilesetTiles: Tile[]): ActBudget {
  const colors = computeVramColoring(
    act.gridWidth, act.gridHeight, act.sections.map(s => s !== null),
  );

  const perSection: ActBudget['perSection'] = [];
  const unionSets: Array<Set<string>> = [new Set(), new Set()];

  // Mirror export's buildGroupUnions: a blank tile is reserved at slot 0 of
  // group 0 so empty nametable words (VRAM tile 0) render blank.
  unionSets[0].add(canonicalTileHash(new Uint8Array(64)));

  for (let i = 0; i < act.sections.length; i++) {
    const section = act.sections[i];
    if (!section) continue;
    const tiles = section.tiles ?? tilesetTiles;
    const seen = new Set<string>();
    const nt = section.tileGrid.nametable;
    for (let j = 0; j < nt.length; j++) {
      if (nt[j] === 0) continue;
      const entry = unpackNametableWord(nt[j]);
      const tile = tiles[entry.tileIndex];
      if (!tile) continue;
      const hash = canonicalTileHash(tile.pixels);
      seen.add(hash);
      unionSets[colors[i]].add(hash);
    }
    perSection.push({ index: i, uniqueTiles: seen.size });
  }

  let cursor = 0;
  const groups: ActBudget['groups'] = [];
  for (let c = 0; c < unionSets.length; c++) {
    groups.push({ color: c, unionTiles: unionSets[c].size, baseSlot: cursor });
    cursor += unionSets[c].size;
  }

  const pageFramesAtLeast = Math.ceil(cursor / FG_PAGE_TILES);
  return {
    perSection,
    groups,
    tiles: cursor,
    tileCeiling: FG_TILE_LIMIT,
    pageTiles: FG_PAGE_TILES,
    pageFrames: FG_PAGE_FRAMES,
    pageFramesAtLeast,
    verdict: pageFramesAtLeast > FG_PAGE_FRAMES ? 'over' : 'undetermined',
    unquantified: unquantified(pageFramesAtLeast),
  };
}
