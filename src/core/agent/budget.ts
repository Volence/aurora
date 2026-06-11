import { unpackNametableWord } from '../model/s4-types';
import type { Section, Tile } from '../model/s4-types';
import { flipTile } from '../import/tile-dedup';
import { computeVramColoring, FG_TILE_LIMIT } from '../export/vram-coloring';

function rawHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) s += pixels[i].toString(16);
  return s;
}

/** Flip-aware canonical hash: minimum of the 4 flip-variant hashes. */
export function canonicalTileHash(pixels: Uint8Array): string {
  let min = rawHash(pixels);
  for (const [xf, yf] of [[true, false], [false, true], [true, true]] as const) {
    const h = rawHash(flipTile(pixels, xf, yf));
    if (h < min) min = h;
  }
  return min;
}

export interface ActBudget {
  perSection: Array<{ index: number; uniqueTiles: number }>;
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
