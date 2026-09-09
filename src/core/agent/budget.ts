import { unpackNametableWord } from '../model/s4-types';
import type { Section, Tile } from '../model/s4-types';
import { flipTile } from '../import/tile-dedup';
import { computeVramColoring, FG_TILE_LIMIT } from '../export/vram-coloring';

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

export interface ActBudget {
  perSection: Array<{ index: number; uniqueTiles: number }>;
  // ⚠ THIS COMMENT USED TO READ "Counts match export exactly (both flip-aware +
  // blank seed), so fits === !exportThrows", AND BOTH HALVES HAVE EXPIRED.
  //
  // There is no export to throw: the per-section VRAM-base export path was
  // retired 2026-08-19 (see core/export/vram-coloring.ts's header), and
  // `computeActBudget` is the last consumer of the two symbols that survived it.
  // The equivalence therefore names a comparand that no longer exists, which is
  // how it went on reading as a guarantee.
  //
  // What the numbers below ARE: `groups` still splits the act into the two
  // checkerboard VRAM colors that scheme needed, and `fits` compares their
  // SUMMED unions against FG_TILE_LIMIT. aeon holds act FG art in ONE
  // globally-deduped paged pool, so a tile used by both groups is counted twice
  // here and once there. That makes this reading CONSERVATIVE on the tile axis
  // (fits=true has margin; fits=false can be pessimistic) and it is the honest
  // description, not a claimed equivalence.
  //
  // NOT MEASURED BY ANYTHING IN THIS REPO, and open rather than closed: whether
  // the two-group split is the right model at all now that the scheme it served
  // is gone, and whether page-frame fragmentation can refuse an act whose raw
  // tile count fits. See docs/reviews/2026-09-09-guard-residue-offschema.md §3.
  groups: Array<{ color: number; unionTiles: number; baseSlot: number }>;
  limit: number;
  fits: boolean;
}

export interface ActLike {
  gridWidth: number;
  gridHeight: number;
  sections: (Section | null)[];
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

  return { perSection, groups, limit: FG_TILE_LIMIT, fits: cursor <= FG_TILE_LIMIT };
}
