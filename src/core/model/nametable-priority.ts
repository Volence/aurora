// WHICH AEON FOREGROUND TILES DRAW IN FRONT OF THE PLAYER — the data side of
// the aeon priority lens, stated once as a pure predicate.
//
// THE RULE IT IMPLEMENTS. VDP layer order, back → front: B-low, A-low,
// sprite-LOW, B-high, A-high, sprite-HIGH. A HIGH-priority plane tile's OPAQUE
// pixel renders in FRONT of a LOW-priority sprite pixel; everything else shows
// the sprite (core/level-classic/occlusion.ts states the same rule for the
// classic viewport — one rule, two engines, and it must not be spelled two
// different ways).
//
// WHERE THE BIT IS. Aeon sections carry a FLAT per-8px nametable
// (`section.tileGrid.nametable`, row-major, stride SECTION_TILES_WIDE), one
// big-endian VDP pattern word per 8x8 tile. Bit 15 is priority —
// `packNametableWord`/`unpackNametableWord` in s4-types.ts are the encode/decode
// pair and this predicate is deliberately the same mask they use. There is no
// block/chunk indirection to compose and no flip trap: unlike classic, where a
// chunk cell's flip MOVES a tile (and its bit) to another quadrant, an aeon
// nametable word's own hFlip/vFlip mirror pixels INSIDE the 8x8 tile and can
// never move the priority bit anywhere. So there is nothing here to lift from
// core/level-classic/priority-mask.ts — that module's whole substance is the
// composition aeon does not have.
//
// EMPTY CELLS. `composeNametable` (renderer/canvas/compose-nametable.ts) skips
// `word === 0` as transparent — a cell that draws nothing cannot occlude
// anything, so it must not be veiled. A word with bit 15 set is necessarily
// non-zero, so the priority test ALREADY implies the renderer's own "this cell
// draws" gate and no extra check is needed; the assertion is written down here
// (and tested) because it is the thing a future word layout could quietly break.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not consult the tile's PIXELS. A
// high-priority tile occludes only where it is opaque, and the honest per-pixel
// answer needs the composed art (occlusion.ts's `mapOpaque`). Per-TILE is the
// right granularity for a LENS: the author is asking "will something here be in
// front of me", and a tile that is high but sparsely opaque is still a tile that
// can swallow the player. It also does not special-case tile index 0: the
// renderer draws index 0 like any other tile, so a lens that hid `0xC000` would
// be inventing a rule the picture does not follow.
//
// Pure core: no canvas, no DOM.

/** The VDP pattern word's priority bit. Same mask as unpackNametableWord. */
export const NAMETABLE_PRIORITY_BIT = 0x8000;

/**
 * Does this foreground nametable word draw ABOVE a low-priority sprite?
 *
 * True iff the word carries bit 15. Empty (`0`) words are excluded for free —
 * see the docblock — so this is exactly "the cell draws AND it draws high".
 */
export function tileWordDrawsAboveSprites(word: number): boolean {
  return (word & NAMETABLE_PRIORITY_BIT) !== 0;
}

/**
 * Count the high-priority words in a nametable. Not used by the draw path (the
 * lens windows to the viewport and never scans a whole section); it exists so a
 * harness or a test can say "this fixture has N of them" and a row that finds
 * nothing on screen can tell an empty document from a dead lens.
 */
export function countHighPriorityTiles(nametable: Uint16Array): number {
  let n = 0;
  for (let i = 0; i < nametable.length; i++) {
    if ((nametable[i] & NAMETABLE_PRIORITY_BIT) !== 0) n++;
  }
  return n;
}
