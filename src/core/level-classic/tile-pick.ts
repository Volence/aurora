import type { EditableTileRange } from '../project/adapter';
import { isTileEditable } from '../project/editable-tiles';
import type { BlockDef, ChunkDef256 } from './model';

// Default composer selections for act open. Tile $000 and block $000 are blank
// in every stock act, so landing there shows an empty checkerboard/black square
// that reads as "broken" — pick the first entity a user can actually see.
// Chunk $00 is worse than blank: it is AIR, which is not a chunk at all and
// cannot be edited, so firstEditableChunkId picks around it for the same reason.

/** True when the 32-byte span for tileIndex is all zero (renders fully transparent). */
export function isBlankTile(tiles: Uint8Array, tileIndex: number): boolean {
  const base = tileIndex * 32;
  if (base < 0 || base + 32 > tiles.length) return true;
  for (let i = base; i < base + 32; i++) if (tiles[i] !== 0) return false;
  return true;
}

/**
 * The tile index the composer should land on when an act opens: the first tile
 * that is neither blank nor locked. The lock rule is the SHARED one
 * (project/editable-tiles) rather than a third re-derivation of it: this picks
 * the tile the pencil lands on, so "pickable" and "editable" must be the same
 * question. Falls back to 0 when every tile is blank or locked (degenerate
 * pools, fakes).
 */
export function firstEditableNonBlankTile(tiles: Uint8Array, range: EditableTileRange | null): number {
  const poolCount = Math.floor(tiles.length / 32);
  for (let t = 0; t < poolCount; t++) {
    if (!isTileEditable(range, t)) continue;
    if (!isBlankTile(tiles, t)) return t;
  }
  return 0;
}

/**
 * The block id the composer should land on when an act opens: the first block
 * that DRAWS something — one with a cell referencing a tile that has pixels in
 * it. Falls back to 0 when every block is blank.
 *
 * "DRAWS SOMETHING" IS THE WHOLE POINT, and the first version of this rule
 * missed it. It asked for a non-DEFAULT cell — `tile !== 0 || xf || yf ||
 * pal !== 0 || pri` — and S1's Green Hill block $000 has cells on palette line
 * 2 pointing at tile $000. Non-default, entirely invisible. So the Block tier
 * still opened on four black quadrants, which is the exact impression the
 * landing pick exists to prevent, and it printed no message a source guard
 * could have caught.
 *
 * Flips, palette line and priority are all properties of HOW a tile is drawn,
 * so none of them can make a blank tile visible. Only the tile can, which is why
 * this now needs the pool and shares `isBlankTile` with the tile pick above
 * rather than re-deriving blankness from the cell record.
 */
export function firstNonBlankBlock(blocks: BlockDef[], tiles: Uint8Array): number {
  for (let b = 0; b < blocks.length; b++) {
    if (blocks[b].cells.some((c) => !isBlankTile(tiles, c.tile))) return b;
  }
  return 0;
}

/**
 * The palette line the composer should land on when an act opens: the line the
 * BLOCK TIER will already be drawing its tile strip under — the landing block's
 * top-left cell (BlockTab starts with `selCell` 0).
 *
 * WHY THIS EXISTS. The Art facet renders the same ~965-tile strip on two tiers
 * under two different palette-line fields:
 *   - Block tier: `block.cells[selCell].pal`, DATA — the line the tile will
 *     actually be drawn with once assigned to that cell, which is the only
 *     honest preview for a strip whose click rewrites the cell.
 *   - Tile tier: `classicLevelStore.composerPalLine`, a CHOICE — the `Line:`
 *     chips, and what the pencil colors with.
 * `composerPalLine` was only ever written by a click inside the Block tier, so
 * on a cold open it sat at its IDLE 0 while the Block tier showed line 2, and
 * Green Hill's tileset was green on one tier and unrecognisable red on the next.
 *
 * SEEDED, NOT MERGED — the same call round 3 made for aeon's two fields
 * (state/aeon-open.ts). A view line and a paint line genuinely mean different
 * things and are supposed to diverge the moment the user touches either; what
 * was wrong is that they disagreed BEFORE anyone touched anything.
 *
 * Takes the landing block id rather than re-deriving it, so the seed cannot
 * drift from `firstNonBlankBlock`'s answer. Falls back to 0 for an empty or
 * out-of-range block list, which is the IDLE value anyway.
 */
export function landingPaletteLine(blocks: BlockDef[], blockId: number): number {
  return blocks[blockId]?.cells[0]?.pal ?? 0;
}

/**
 * The chunk ENGINE ID the composer should land on when an act opens. Same rule
 * as the two above with one extra constraint that makes it not merely cosmetic:
 * id $00 is AIR, which has no data behind it at all (providers/chunk-grid-
 * classic.ts), so the Chunk tab's only possible response to it is the message
 * saying it cannot be edited. Landing there made the whole Art facet open
 * announcing it could not work.
 *
 * Engine ids are 1-based over `chunks` (chunkIndexForId owns the shift), so the
 * return is an id, not an index: chunk `chunks[i]` is id `i + 1`.
 *
 * Falls back to the first chunk when every chunk is blank, and only to air ($00)
 * when the pool is empty — at which point there is nothing editable to pick and
 * the message is the honest screen.
 */
export function firstEditableChunkId(chunks: ChunkDef256[]): number {
  if (chunks.length === 0) return 0;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].cells.some((c) => c.block !== 0 || c.xf || c.yf || c.solidity !== 0)) return i + 1;
  }
  return 1;
}
