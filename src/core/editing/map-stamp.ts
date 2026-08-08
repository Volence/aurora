import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { ChunkDef, Section } from '../model/s4-types';
import { cellTileIndices } from '../collision/collision-cell';
import type { AnyCommand, BatchCommand, SetTilesCommand, SetCollisionEditCommand } from './commands';

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

  // Art: legacy tileGrid.collision nibble is a passthrough (oldColl === newColl)
  // — that plane no longer records authored collision (collisionEdit/B do),
  // it stays put until Task 10 removes it. Only the nametable word can diff.
  const tileEntries: SetTilesCommand['entries'] = [];
  for (let r = 0; r < chunk.heightTiles; r++) {
    for (let c = 0; c < chunk.widthTiles; c++) {
      const col = baseCol + c, row = baseRow + r;
      if (col >= SECTION_TILES_WIDE || row >= SECTION_TILES_HIGH) continue;
      const idx = row * SECTION_TILES_WIDE + col;
      const oldNt = section.tileGrid.nametable[idx];
      const newNt = chunk.nametable[r * chunk.widthTiles + c];
      if (oldNt === newNt) continue;
      const oldColl = section.tileGrid.collision[idx];
      tileEntries.push({ index: idx, oldNt, newNt, oldColl, newColl: oldColl });
    }
  }

  const commands: AnyCommand[] = [];
  if (tileEntries.length > 0) {
    commands.push({ type: 'set-tiles', description, sectionIndex, entries: tileEntries });
  }

  if (!artOnly) {
    const cellsW = chunk.widthTiles >> 1;
    const cellsH = chunk.heightTiles >> 1;
    const baseCellCol = baseCol >> 1;
    const baseCellRow = baseRow >> 1;

    for (const plane of ['a', 'b'] as const) {
      const chunkPlane = plane === 'a' ? chunk.collisionA : chunk.collisionB;
      const sectionPlane = plane === 'a' ? section.collisionEdit : section.collisionEditB;
      if (!sectionPlane) continue; // unseeded — caller's contract to seed first

      const entries: SetCollisionEditCommand['entries'] = [];
      for (let cy = 0; cy < cellsH; cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          const sCellCol = baseCellCol + cx;
          const sCellRow = baseCellRow + cy;
          const tlCol = sCellCol * 2, tlRow = sCellRow * 2;
          // A cell is included iff its top-left tile is in bounds.
          if (tlCol >= SECTION_TILES_WIDE || tlRow >= SECTION_TILES_HIGH) continue;

          const word = chunkPlane[cy * cellsW + cx];
          const indices = cellTileIndices(sCellCol, sCellRow, SECTION_TILES_WIDE);
          const coords: Array<[number, number]> = [
            [tlCol, tlRow], [tlCol + 1, tlRow], [tlCol, tlRow + 1], [tlCol + 1, tlRow + 1],
          ];
          for (let k = 0; k < 4; k++) {
            const [tc, tr] = coords[k];
            if (tc >= SECTION_TILES_WIDE || tr >= SECTION_TILES_HIGH) continue; // sub-tile clamp
            const index = indices[k];
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
