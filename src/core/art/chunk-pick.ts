// Aeon's "what should the composer be looking at?" answers.
//
// The sibling of core/level-classic/tile-pick.ts, which does the same job for
// the classic composer, and written for the same reason: the Art facet's resting
// state must be a thing the user can see and edit, not an invitation to make one.
//
// IN CORE, not beside the aeon chunk-grid port that used to own isBlankChunk:
// the port is a React module that imports a .tsx (AeonChunkActions), and the
// project-open path needs this answer WITHOUT pulling a component graph into a
// store module. providers/chunk-grid-aeon.ts re-exports isBlankChunk, so every
// existing import of it still resolves.

import type { ChunkDef } from '../model/s4-types';
import { unpackNametableWord } from '../model/s4-types';

/**
 * A chunk with no visible content — every cell references tile 0, the engine's
 * conventionally-transparent tile. It is a REAL chunk with real data (OJZ's
 * $00/$2A/$2B/$45 are legitimately blank, not corrupt); the flag exists because
 * stamping one ERASES the 16x16 area, which is a useful eraser and an easy
 * mis-click. Distinct from classic's air, which is not a chunk at all.
 */
export function isBlankChunk(chunk: ChunkDef): boolean {
  for (const w of chunk.nametable) if (unpackNametableWord(w).tileIndex !== 0) return false;
  return true;
}

/**
 * The chunk the Art composer should open on when a project loads: the first one
 * with any visible content.
 *
 * Falls back to the first chunk when every chunk is blank, and to null only for
 * an empty library — at which point there is genuinely nothing to open and the
 * New Document launcher IS the honest screen.
 *
 * Same rule and same fallback ladder as firstEditableChunkId's for classic, so
 * the two engines' composers arrive at their first screen the same way.
 */
export function firstEditableChunk(chunks: readonly ChunkDef[]): ChunkDef | null {
  if (chunks.length === 0) return null;
  return chunks.find((c) => !isBlankChunk(c)) ?? chunks[0];
}

/** Roughly the composer canvas' usable edge, in screen pixels. A constant
 *  rather than a measurement: the landing zoom is chosen at PROJECT OPEN, before
 *  the Art facet has ever been mounted, so there is no canvas to measure. */
const COMPOSER_FIT_PX = 640;

/**
 * The composer zoom (screen pixels per art pixel) that lands a whole document
 * on screen.
 *
 * The other half of opening on a chunk instead of the New Document launcher.
 * artStore's default zoom is 24, written for editing a single 8px tile — at
 * which a 128x128px chunk is 3072px across, so auto-opening one put you at its
 * top-left corner, which for the first chunk of a jungle zone is 40 rows of sky.
 * An empty checkerboard is not a better resting state than the launcher; it is a
 * worse one, because it looks like the document failed to load.
 *
 * Clamped to at least 1 so a huge document still renders at 1:1 rather than
 * vanishing, and to at most artStore's own 24 so a 1x1 tile does not open
 * absurdly magnified.
 */
export function fitComposerZoom(widthTiles: number, heightTiles: number): number {
  const px = Math.max(widthTiles, heightTiles) * 8;
  if (px <= 0) return 24;
  return Math.max(1, Math.min(24, Math.floor(COMPOSER_FIT_PX / px)));
}
