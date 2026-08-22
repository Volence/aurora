// The occlusion compositor's per-pixel decision — the one rule the viewport's
// priority-occlusion pass implements with canvas compositing, stated once as a
// pure function so it can be tested against derived real-act inputs.
//
// VDP layer order (back → front): B-low, A-low, sprite-LOW, B-high, A-high,
// sprite-HIGH. Editing shows ONE plane at a time, so the question collapses to
// plane-vs-sprite: a HIGH-priority plane tile's OPAQUE pixel renders in front
// of a LOW-priority sprite pixel; everything else shows the sprite.
//
//  - The plane tile's bit is pattern-word bit 15, derived per 8x8 tile
//    flip-exactly by chunkPriorityMask (priority-mask.ts, lens commit 337d2d3).
//  - The sprite piece's bit is mappings attrs bit 15 (sprite-mappings-import.ts
//    `priority: (attrs & 0x8000) !== 0`; ASM path spritePiece arg 9), carried
//    per winning pixel by RenderedObjectFrame.priMask.
//  - Transparency: a color-0 map pixel renders nothing on hardware, so it can
//    never occlude — a hi-pri tile's transparent pixels must not erase the
//    sprite (per-pixel occlusion, not per-tile).
//
// Pure core: no canvas, no DOM.

/** Who owns one screen pixel where an OPAQUE sprite pixel meets the plane. */
export type OcclusionWinner = 'sprite' | 'map';

/**
 * Decide the pixel: the map wins iff the plane tile is high priority AND its
 * pixel is opaque AND the sprite pixel's piece is NOT high priority. Callers
 * only ask about opaque sprite pixels (a transparent sprite pixel draws
 * nothing, so there is nothing to decide).
 */
export function occlusionWinner(spriteHi: boolean, tileHi: boolean, mapOpaque: boolean): OcclusionWinner {
  return tileHi && mapOpaque && !spriteHi ? 'map' : 'sprite';
}
