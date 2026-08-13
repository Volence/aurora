import type { Section, ChunkDef } from '../model/s4-types';
import { copyFromSection } from './map-clipboard';

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
 */
export function selectionToChunk(
  section: Section, col: number, row: number, w: number, h: number,
  name: string, id?: string,
): ChunkDef {
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
