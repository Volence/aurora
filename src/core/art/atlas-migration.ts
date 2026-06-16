import type { Tile, Section, ChunkDef } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';
import { canonicalizeTile } from '../export/tile-dedup';

export interface MigrationResult {
  appended: number;   // tiles added to the zone tileset
  remapped: number;   // nametable entries rewritten (chunks + pinned sections)
}

interface TileMapping { index: number; fx: boolean; fy: boolean; }

/**
 * Phase 0 atlas unification: merge chunkTiles into the zone tileset
 * (flip-aware), remap chunk-library nametables and chunkTiles-pinned section
 * nametables to zone-tileset indices with XOR flip compensation, and unpin
 * sections. Mutates zoneTiles/chunks/sections in place (load-time transform,
 * not an undoable command — see the spec). Throws before any mutation if the
 * merged atlas would exceed the 2048-tile hardware ceiling.
 *
 * RE-ENTRY HAZARD: this function is NOT idempotent in the general case. If a
 * merge appended tiles and the remapped chunk nametables were saved, running
 * the migration again with the same chunkTiles input misinterprets the
 * already-zone-space indices as chunkTiles indices and corrupts references.
 * Callers must guarantee at-most-once semantics (the loader only migrates
 * when chunks_tiles.bin is non-empty, and the save path empties it after a
 * successful migration). The OJZ project is additionally safe because its
 * zone tileset and chunkTiles share one file, making re-runs a fixed point.
 */
export function migrateChunkTilesIntoTileset(
  zoneTiles: Tile[],
  chunkTiles: Tile[],
  chunks: ChunkDef[],
  sections: (Section | null)[],
): MigrationResult {
  // First-seen source orientation of tiles pending append (pass 1 bookkeeping).
  const pendingCanon = new Map<string, { fx: boolean; fy: boolean }>();

  // Canonical index of the existing zone tileset (first occurrence wins).
  const zoneByHash = new Map<string, TileMapping>();
  for (let i = 0; i < zoneTiles.length; i++) {
    const canon = canonicalizeTile(zoneTiles[i].pixels);
    if (!zoneByHash.has(canon.hash)) {
      // zone tile i satisfies canonical = flip(zoneTile, canon.fx, canon.fy);
      // an incoming tile matching this hash maps to index i with compensation
      // derived in pass 1.
      zoneByHash.set(canon.hash, { index: i, fx: canon.fx, fy: canon.fy });
    }
  }

  // Pass 1 (no mutation): resolve every chunkTiles entry to a mapping,
  // counting how many genuinely new tiles we would append.
  const mappings: TileMapping[] = [];
  const pendingByHash = new Map<string, number>(); // canon hash -> future index
  let appendCount = 0;
  for (const tile of chunkTiles) {
    const canon = canonicalizeTile(tile.pixels);
    const existing = zoneByHash.get(canon.hash);
    if (existing) {
      // source = flip(canonical, canon.fx, canon.fy); zone tile = flip(canonical, ex.fx, ex.fy)
      // => source = flip(zoneTile, canon.fx^ex.fx, canon.fy^ex.fy)
      mappings.push({ index: existing.index, fx: canon.fx !== existing.fx, fy: canon.fy !== existing.fy });
    } else if (pendingByHash.has(canon.hash)) {
      // Duplicate of a tile already queued for append: the stored tile keeps
      // its first-seen source orientation; compensate against it.
      const first = pendingCanon.get(canon.hash)!;
      mappings.push({
        index: pendingByHash.get(canon.hash)!,
        fx: canon.fx !== first.fx,
        fy: canon.fy !== first.fy,
      });
    } else {
      const idx = zoneTiles.length + appendCount;
      pendingByHash.set(canon.hash, idx);
      pendingCanon.set(canon.hash, { fx: canon.fx, fy: canon.fy });
      mappings.push({ index: idx, fx: false, fy: false }); // stored in source orientation
      appendCount++;
    }
  }

  if (zoneTiles.length + appendCount > 0x800) {
    throw new Error(
      `atlas merge needs ${zoneTiles.length + appendCount} tiles; hardware ceiling is 2048`,
    );
  }

  // Pass 2: append new tiles (in source orientation of their first occurrence).
  const appendedSeen = new Set<string>();
  for (let t = 0; t < chunkTiles.length; t++) {
    const canon = canonicalizeTile(chunkTiles[t].pixels);
    if (pendingByHash.has(canon.hash) && !appendedSeen.has(canon.hash)) {
      appendedSeen.add(canon.hash);
      zoneTiles.push({ pixels: new Uint8Array(chunkTiles[t].pixels) });
    }
  }

  // Pass 3: remap nametables.
  let remapped = 0;
  const remapWord = (word: number): number => {
    if (word === 0) return 0;
    const e = unpackNametableWord(word);
    const m = mappings[e.tileIndex];
    if (!m) return word; // index beyond chunkTiles: leave untouched
    remapped++;
    return packNametableWord(m.index, e.palette, e.priority, e.vFlip !== m.fy, e.hFlip !== m.fx);
  };

  for (const chunk of chunks) {
    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = remapWord(chunk.nametable[i]);
  }
  for (const section of sections) {
    if (!section || section.tiles !== chunkTiles) continue;
    const nt = section.tileGrid.nametable;
    for (let i = 0; i < nt.length; i++) nt[i] = remapWord(nt[i]);
    section.tiles = null;
  }

  return { appended: appendCount, remapped };
}
