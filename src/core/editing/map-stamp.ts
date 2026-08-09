import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { ChunkDef, Section } from '../model/s4-types';
import { cellTileIndices } from '../collision/collision-cell';
import type { AnyCommand, BatchCommand, SetTilesCommand, SetCollisionEditCommand } from './commands';

/** Structural shape shared by ChunkDef (stamp source) and MapClipboard (paste
 *  source) — a rectangular region of art + dual-plane collision, chunk-aligned
 *  (even width/height) so cells never straddle the footprint edge. */
export interface RegionSource {
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;
  collisionA: Uint16Array;
  collisionB: Uint16Array;
}

/** Build the atomic region-write command shared by stamp (chunk -> section)
 *  and paste (clipboard -> section): `source` nametable + `writeCollision`'s
 *  two collision planes written over the footprint at (baseCol,baseRow) tile
 *  coords (assumed even/chunk-aligned by the caller). The source is
 *  AUTHORITATIVE for its footprint: air words/tiles clear the destination.
 *  writeArt/writeCollision independently gate the two kinds of children.
 *  Returns null when nothing changes. Requires the section's collisionEdit
 *  planes to be seeded when writeCollision is true (caller seeds, as
 *  paintCollisionCell does). */
export function buildRegionWriteCommand(args: {
  source: RegionSource; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number;
  writeArt: boolean; writeCollision: boolean;
  description: string;
}): BatchCommand | null {
  const { source, section, sectionIndex, baseCol, baseRow, writeArt, writeCollision, description } = args;

  const commands: AnyCommand[] = [];

  if (writeArt) {
    const tileEntries: SetTilesCommand['entries'] = [];
    for (let r = 0; r < source.heightTiles; r++) {
      for (let c = 0; c < source.widthTiles; c++) {
        const col = baseCol + c, row = baseRow + r;
        if (col >= SECTION_TILES_WIDE || row >= SECTION_TILES_HIGH) continue;
        const idx = row * SECTION_TILES_WIDE + col;
        const oldNt = section.tileGrid.nametable[idx];
        const newNt = source.nametable[r * source.widthTiles + c];
        if (oldNt === newNt) continue;
        tileEntries.push({ index: idx, oldNt, newNt });
      }
    }
    if (tileEntries.length > 0) {
      commands.push({ type: 'set-tiles', description, sectionIndex, entries: tileEntries });
    }
  }

  if (writeCollision) {
    const cellsW = source.widthTiles >> 1;
    const cellsH = source.heightTiles >> 1;
    const baseCellCol = baseCol >> 1;
    const baseCellRow = baseRow >> 1;

    for (const plane of ['a', 'b'] as const) {
      const srcPlane = plane === 'a' ? source.collisionA : source.collisionB;
      const sectionPlane = plane === 'a' ? section.collisionEdit : section.collisionEditB;
      if (!sectionPlane) continue; // unseeded — caller's contract to seed first

      const entries: SetCollisionEditCommand['entries'] = [];
      for (let cy = 0; cy < cellsH; cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          const sCellCol = baseCellCol + cx;
          const sCellRow = baseCellRow + cy;
          const tlCol = sCellCol * 2, tlRow = sCellRow * 2;
          // A cell is included iff its top-left tile is in bounds. tlCol/tlRow
          // are always even, so tlCol+1/tlRow+1 (the cell's other sub-tiles)
          // are automatically in bounds too when the top-left is (max even
          // in-bounds value is SECTION_TILES_WIDE-2, +1 = SECTION_TILES_WIDE-1)
          // — no separate per-sub-tile bounds check is reachable here.
          if (tlCol >= SECTION_TILES_WIDE || tlRow >= SECTION_TILES_HIGH) continue;

          const word = srcPlane[cy * cellsW + cx];
          const indices = cellTileIndices(sCellCol, sCellRow, SECTION_TILES_WIDE);
          for (const index of indices) {
            const oldColl = sectionPlane[index];
            if (oldColl === word) continue; // skip only when unchanged — air clears, never skipped
            entries.push({ index, oldColl, newColl: word });
          }
        }
      }
      if (entries.length > 0) {
        commands.push({ type: 'set-collision-edit', plane, description, sectionIndex, entries });
      }
    }
  }

  if (commands.length === 0) return null;
  return { type: 'batch', description, sectionIndex, commands };
}

/** Build the atomic stamp command: chunk nametable + both collision planes
 *  written over the footprint at (baseCol,baseRow) tile coords (assumed
 *  chunk-aligned by the caller, as today). The chunk is AUTHORITATIVE for its
 *  footprint: air words/tiles clear the destination. artOnly=true skips the
 *  collision children. Returns null when nothing changes. Requires the
 *  section's collisionEdit planes to be seeded (caller seeds like
 *  paintCollisionCell does). */
export function buildStampCommand(args: {
  chunk: ChunkDef; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; artOnly: boolean; description: string;
}): BatchCommand | null {
  const { chunk, section, sectionIndex, baseCol, baseRow, artOnly, description } = args;
  return buildRegionWriteCommand({
    source: chunk, section, sectionIndex, baseCol, baseRow,
    writeArt: true, writeCollision: !artOnly, description,
  });
}
