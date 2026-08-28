// THE ONE PLACE A PAINT STROKE DECIDES WHAT SIXTEEN BITS TO WRITE.
//
// ═══ WHAT WENT WRONG ═══
//
// `packNametableWord` carries five fields — tileIndex 0..10, hFlip 11, vFlip
// 12, palette 13..14, priority 15 — and every interactive paint site in
// MapViewport wrote exactly two of them, open-coded:
//
//     (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13)
//
// Four copies of that expression (paint-tile's press and its drag, paint-block,
// and the background stroke) meant a stroke over a high-priority cell SILENTLY
// DROPPED IT BEHIND SONIC and a stroke over a flipped cell un-flipped it. It
// was invisible for as long as it existed because nothing in this engine could
// SHOW priority until the lens landed (canvas/priority-lens.ts, 2026-08-28).
//
// Four copies is also why the fix is a function and not four edits: the next
// paint site would have been a fifth copy. Nothing in the renderer may build a
// paint word by hand again — `packNametableWord` is the encoder, and THIS is
// the only thing allowed to choose what to hand it.
//
// ═══ THE RULE: THE BRUSH OWNS THE PICTURE, THE CELL KEEPS ITS DEPTH ═══
//
// Three rules were available and they are not interchangeable — preserve the
// destination's bits, carry the source tile's bits, or take them from an
// explicit brush. The answer is not one of the three; it is different per field,
// and the split is principled:
//
//   tileIndex  — from the brush. Always was.
//   palette    — from the brush. Always was, and works; untouched here.
//
//   hFlip/vFlip — FROM THE BRUSH. A flip is not a property of the cell, it is
//     part of WHICH PICTURE the cell shows: tile 75 flipped is a different
//     image from tile 75. The Art panel shows the tile UNFLIPPED, so a stroke
//     must put down the thing the picker depicted. Preserving the destination's
//     flip would mean painting what you saw and getting its mirror — WYSIWYG
//     broken in the one place an artist relies on it. So a flipped destination
//     un-flips when painted over, and that is not loss: it is the paint doing
//     exactly what it looked like it would do.
//
//   priority — TRI-STATE, DEFAULTING TO KEEP. Priority is a property of the
//     CELL'S DEPTH ("does this square draw in front of the player"), not of the
//     art, and NOTHING in the picker depicts it. An author retouching a cliff
//     edge is choosing a picture; they are not saying anything about depth, and
//     an editor that silently answered for them is what broke.
//
// ═══ WHY *KEEP* IS THE DEFAULT, AND NOT "OFF" ═══
//
// This is the load-bearing choice, and it is decided by DETECTABILITY, not by
// taste. Both defaults have a real failure mode:
//
//   • keep-by-default can carry priority onto art that should not have it —
//     paint sky over a high-priority cliff cell and the sky now draws in front
//     of Sonic.
//   • off-by-default drops priority from art that should keep it — which is
//     the bug the owner actually hit and reported.
//
// They are not symmetric. Under `keep`, the mistake is VISIBLE: the priority
// lens veils that sky cell violet the moment it happens, and a `Priority: off`
// stroke clears it. Under `off`, the mistake is the ABSENCE of a veil where one
// used to be, which nobody notices — it surfaces minutes later as a player
// walking behind a bush. A default whose failure mode you can see beats a
// default whose failure mode ambushes you, so `keep` is the default and the
// lens is the feedback loop that makes it safe.
//
// The two other states are what the owner asked for ("is there a way to draw
// the higher priority and such?"): `on` and `off` AUTHOR the bit, which is also
// what keeps `keep` honest — an editor that could only preserve priority would
// be one where a wrong bit is permanent.

import { packNametableWord, unpackNametableWord } from '../model/s4-types';

/**
 * What a stroke does to the destination's priority bit.
 *
 * `keep` is the default and preserves it; `on`/`off` author it. Three states
 * rather than a boolean because "leave it alone" is a real, distinct intent and
 * a two-state control cannot express it — a checkbox would force every stroke
 * to assert something about depth, which is the defect this replaces.
 */
export type BrushPriority = 'keep' | 'on' | 'off';

/** Everything a paint stroke carries besides the tile index itself. */
export interface BrushAttributes {
  /** Palette line 0..3. Unchanged behaviour — masked by `packNametableWord`. */
  paletteLine: number;
  hFlip: boolean;
  vFlip: boolean;
  priority: BrushPriority;
}

/** The brush as it arrives from a fresh editor: the picture as the picker shows
 *  it, and no claim at all about depth. */
export const DEFAULT_BRUSH_ATTRIBUTES: BrushAttributes = {
  paletteLine: 0, hFlip: false, vFlip: false, priority: 'keep',
};

/**
 * The word a stroke should write into `oldWord`'s cell.
 *
 * `oldWord` is READ, not merely passed through: under `priority: 'keep'` its
 * bit 15 is the answer. A caller with nothing there (an out-of-range index
 * reads `undefined`) gets `0`, i.e. "no priority", which is the same thing an
 * empty cell means.
 *
 * The bit positions are NEVER spelled here. `unpackNametableWord` decodes and
 * `packNametableWord` encodes; this function only decides WHICH VALUES to hand
 * over. That is deliberate — the four open-coded call sites this replaces each
 * carried their own copy of `0x7FF` and `<< 13`, and a fifth copy in the fixer
 * would have been the same defect wearing a different hat.
 */
export function brushNametableWord(
  tileIndex: number,
  oldWord: number | undefined,
  brush: BrushAttributes,
): number {
  const priority = brush.priority === 'keep'
    ? unpackNametableWord(oldWord ?? 0).priority
    : brush.priority === 'on';
  return packNametableWord(tileIndex, brush.paletteLine, priority, brush.vFlip, brush.hFlip);
}

/**
 * Does this brush AUTHOR the priority bit rather than leave it alone?
 *
 * The lens-surfacing rule turns on exactly this, and it lives here rather than
 * in the component so the condition and the rule it describes cannot drift: the
 * moment a stroke starts writing a field nothing on screen depicts is the
 * moment the author needs the field on screen.
 */
export function brushAuthorsPriority(brush: BrushAttributes): boolean {
  return brush.priority !== 'keep';
}
