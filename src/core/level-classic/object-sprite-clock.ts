// Which clock invalidates a rendered object sprite.
//
// An object sprite is rasterized from exactly two live inputs:
//
//   • its PALETTE line (`doc.palettes[link.pal]`) — every sprite has one; and
//   • the act's TILE POOL (`doc.tiles`) — but ONLY for `artSource:'levelArt'`
//     links (GHZ platforms, collapsing ledges, MZ bricks, SYZ/SLZ platforms,
//     stairs, …). A `artSource:'file'` sprite reads its tiles from a `.nem` on
//     disk, which no in-editor edit can change.
//
// Nothing else feeds a sprite: blocks and chunks are level *composition*, never
// sprite pixels, so a block or chunk edit can never change one.
//
// The store keeps one monotonic version allocator, so `paletteEpoch` and
// `tileEpoch` are drawn from the SAME increasing sequence. That makes `Math.max`
// a valid "either of these moved" combinator: it strictly increases when either
// input bumps and is stable when neither does — exactly the contract a cache key
// needs. (Concatenating them into a string would work too; a number keeps the
// existing numeric cache/eviction keying intact.)
//
// This module is deliberately pure (no store, no canvas, no IO) so the
// invalidation decision itself is unit-testable in the node-only suite — the
// render path around it is not.

import { resolveObjectArt } from '../project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../project/profiles/object-subtype-rules';

/** The two content clocks a sprite can depend on. Both from one monotonic source. */
export interface SpriteClocks {
  /** Bumps when any palette line is written. Every sprite depends on this. */
  palette: number;
  /** Bumps when tile-pool pixels are written. Only LevelArt sprites depend on this. */
  tile: number;
}

/**
 * Does this placement's sprite draw from the act's tile pool (`doc.tiles`)?
 *
 * Resolved through the EFFECTIVE link, because a subtype rule may override the
 * art source (e.g. Spring $41 horizontal swaps to a `.nem`). The composed
 * `pieces` carry only frame/offset — the art source lives entirely on the one
 * resolved `link` — so the link alone decides this.
 */
export function objectSpriteDependsOnTiles(id: number, zone: string, subtype: number): boolean {
  const base = resolveObjectArt(id, zone);
  if (!base) return false; // unlinked id → no sprite at all
  return resolveEffectiveObjectArt(id, zone, subtype, base).link.artSource === 'levelArt';
}

/**
 * The cache epoch for this placement's sprite: the palette clock alone for a
 * file-backed sprite, or palette-or-tiles for a LevelArt one.
 *
 * This is the whole point of the split. Previously every sprite was keyed on the
 * coarse `chunkEpoch`, which bumps on tile AND block AND palette edits — so a
 * single pencil stroke in the tile composer evicted and rebuilt every sprite in
 * the act (re-read over IPC, re-decoded, re-`createImageBitmap`ed), and a block
 * edit did the same while changing no sprite at all.
 */
export function objectSpriteEpoch(
  id: number, zone: string, subtype: number, clocks: SpriteClocks,
): number {
  return objectSpriteDependsOnTiles(id, zone, subtype)
    ? Math.max(clocks.palette, clocks.tile)
    : clocks.palette;
}
