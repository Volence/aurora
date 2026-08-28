import type { Section, ChunkDef } from '../model/s4-types';
import { copyFromSection, isBlockAligned } from './map-clipboard';

/** Slugify a chunk name into an id-safe token (mirrors art-facet's slug so
 *  library ids look the same however a chunk was minted). */
export function slugChunkName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk';
}

/**
 * Convert a committed marquee rect (tile coords, snapped to even/16px blocks by
 * the caller — same contract as copyFromSection) into a stampable ChunkDef.
 *
 * Reuses map-clipboard's copyFromSection for capture, so a "save as chunk" and a
 * Ctrl+C/paste of the identical rect carry byte-identical data: the FG
 * nametable in row order plus BOTH collision planes (missing/unseeded planes
 * read as air, matching the clipboard's convention). copyFromSection allocates
 * fresh arrays, so the chunk owns them outright (no aliasing of section state).
 *
 * `id` defaults to `<slug>-<Date.now()>` (same shape as art-facet's handleSave);
 * pass an explicit id for deterministic tests.
 *
 * RETURNS NULL for a rect that is not block-aligned, and that refusal is the
 * point rather than a limitation worked around. A ChunkDef sizes its collision
 * planes with `chunkCellCount` = `(w>>1)*(h>>1)`, which FLOORS — so a 5x3-tile
 * chunk would carry two collision cells describing its top-left 4x2 tiles and
 * nothing at all for the rest, while its art claimed the full 5x3. Stamping it
 * would then write those two cells (all air, since a non-block-aligned capture
 * has no collision to give them) straight over the destination's real
 * collision. Minting a chunk whose two halves disagree about its own size is
 * worse than declining to mint one, so the caller is told no and says so.
 */
export function selectionToChunk(
  section: Section, col: number, row: number, w: number, h: number,
  name: string, id?: string,
): ChunkDef | null {
  if (!isBlockAligned(col, row, w, h)) return null;
  const clip = copyFromSection(section, col, row, w, h);
  return {
    id: id ?? `${slugChunkName(name)}-${Date.now()}`,
    name,
    widthTiles: clip.widthTiles,
    heightTiles: clip.heightTiles,
    nametable: clip.nametable,
    collisionA: clip.collisionA,
    collisionB: clip.collisionB,
  };
}
