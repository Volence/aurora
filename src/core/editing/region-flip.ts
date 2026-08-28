// MIRRORING A REGION — THE ONE TRANSFORM, APPLIED AT TWO MOMENTS.
//
// ═══ WHY THIS EXISTS ═══
//
// The owner, having established that mirrored tiles are FREE (the VDP carries
// H and V bits in every nametable word, so a mirrored tile is the same tile
// referenced twice and costs nothing against the unique-tile budget), asked the
// obvious next question: *"if I have something selected with marquee, because
// flip is free, how do I actually flip it?"* — and nothing did.
//
// There are two moments an author means by that and they are the SAME
// TRANSFORM:
//
//   • BEFORE IT LANDS. In paste mode, mirror the pending clipboard: the ghost
//     updates and the paste commits mirrored. This is what stamping tools do,
//     and it is the one that exploits "flips are free" for building mirrored
//     terrain — copy a slope once, stamp it both ways.
//   • IN PLACE. With a marquee standing, mirror the map content inside the
//     rectangle as one undoable edit. This is the literal reading of the
//     question — he had something selected.
//
// So the transform is HERE, once, and `flipSectionRegion` is literally
// "capture, flip, write back" over the same function the clipboard path uses.
// Two copies of a two-part bit transform is how you get one of them half-done.
//
// ═══ THE TRANSFORM IS TWO OPERATIONS, AND DOING ONE IS THE CLASSIC BUG ═══
//
// Mirroring a region horizontally means BOTH:
//
//   1. REVERSE THE ORDER of the words along that axis, and
//   2. TOGGLE EACH WORD'S OWN FLIP BIT on that axis.
//
// Do only (1) and every tile is in the right PLACE drawn the wrong way round.
// Do only (2) and every tile is mirrored WHERE IT STANDS, so the picture
// scrambles. Neither half is visibly wrong on symmetric art — which is most of
// a tiled background — so both halves have their own planted-violation rows in
// `__tests__/region-flip.test.ts`, on deliberately ASYMMETRIC fixtures.
//
// ═══ TWO WORD LAYOUTS, AND CROSSING THEM PRODUCES PLAUSIBLE OUTPUT ═══
//
// A selection can carry collision, and the collision cell word's flip bits are
// at DIFFERENT positions from the nametable word's:
//
//   nametable (s4-types.ts)           collision cell (collision-cell-word.ts)
//     tileIndex  bits 10:0              shape      bits 9:0
//     hFlip      bit 11                 xFlip      bit 10
//     vFlip      bit 12                 yFlip      bit 11
//     palette    bits 14:13             solidity   bits 13:12
//     priority   bit 15                 (spare)    bits 15:14
//
// Getting these crossed would flip art against palette bits and collision
// against solidity bits — output that still renders, still saves, and is wrong.
// So NO BIT POSITION IS SPELLED IN THIS FILE. Every mask below is DERIVED by
// asking the codec to encode exactly the one field, which means a codec change
// moves this file with it instead of silently desynchronising from it.
//
// ═══ WHY XOR, AND NOT UNPACK/REPACK ═══
//
// `packCollisionCell` writes four fields and DROPS bits 15:14, which the engine
// reserves (`collision_pipeline.py` reads them as path B's solidity shift, and
// a loop feature is being designed on top). A flip must transform the bits it
// OWNS and carry every other bit through untouched, so it XORs one mask rather
// than round-tripping through a codec that would answer for fields it was never
// asked about. Same rule on the art side: palette and priority survive a flip
// because nothing here rebuilds the word.
//
// ═══ AIR IS AIR, ON THE COLLISION PLANE ONLY ═══
//
// `collision-cell-word.ts` declares `AIR_CELL = 0` and `selectedCollisionWord`
// enforces *"Air (shape 0) is always the bare AIR_CELL word, never
// solidity/flip bits."* A blind XOR would turn every air cell in a flipped
// region into `0x400` — which still READS as air (shape 0) but is a different
// word, would dirty every air cell in the undo entry, and would break any
// `=== AIR_CELL` comparison downstream. So a shape-0 cell MOVES but keeps its
// word. The art plane has no such rule — tile 0 is an ordinary tile index, not
// a sentinel — so art words toggle unconditionally.
//
// ═══ GRANULARITY: THIS DOES NOT DECIDE WHAT A SELECTION CARRIES ═══
//
// Collision is per-16px CELL and art is per-8px TILE, so a selection carries
// collision iff its rectangle is block-aligned (`map-clipboard.ts`
// `isBlockAligned`); an art-only clipboard carries LENGTH-0 planes. A flip of
// an art-only clipboard flips art and nothing else, and that is CORRECT rather
// than a shortfall. Nothing here upgrades or downgrades what a selection
// carries: `artOnly` is copied through, and a plane whose length does not match
// the footprint's cell count is passed through unchanged rather than
// reinterpreted.
//
// An ODD-width selection is legal for art, and reversing an odd run is fine —
// the centre column maps to itself under `w - 1 - c` and still has its own flip
// bit toggled, which is the half an off-by-one would silently drop.

import { packNametableWord } from '../model/s4-types';
import type { Section } from '../model/s4-types';
import { packCollisionCell } from '../collision/collision-cell-word';
import type { MapClipboard } from './map-clipboard';
import { copyFromSection } from './map-clipboard';
import { buildRegionWriteCommand } from './map-stamp';
import type { BatchCommand } from './commands';

/** Which mirror. `h` swaps left and right, `v` swaps top and bottom. */
export type FlipAxis = 'h' | 'v';

// ─── DERIVED MASKS. Never typed; see the file header. ───────────────────────
//
// Each is the codec's own encoding of a word with exactly one field set, which
// IS that field's mask. `packNametableWord(tileIndex, palette, priority, vFlip,
// hFlip)` and `packCollisionCell({shape, xFlip, yFlip, solidity})`.

/** Bit 11 of a nametable word, however `packNametableWord` spells it. */
const NT_HFLIP_MASK = packNametableWord(0, 0, false, false, true);
/** Bit 12 of a nametable word. */
const NT_VFLIP_MASK = packNametableWord(0, 0, false, true, false);
/** Bit 10 of a collision cell word — the engine's `CHUNK_XFLIP_BIT`. */
const COLL_XFLIP_MASK = packCollisionCell({ shape: 0, xFlip: true, yFlip: false, solidity: 'none' });
/** Bit 11 of a collision cell word — the engine's `CHUNK_YFLIP_BIT`. */
const COLL_YFLIP_MASK = packCollisionCell({ shape: 0, xFlip: false, yFlip: true, solidity: 'none' });
/** Bits 9:0 of a collision cell word — the engine's `BLOCK_ID_MASK`. Derived
 *  by asking the codec to encode an all-ones shape and nothing else. */
const COLL_SHAPE_MASK = packCollisionCell({ shape: 0xFFFF, xFlip: false, yFlip: false, solidity: 'none' });

/** The masks, published so a test can assert them against the two codecs
 *  independently rather than against themselves. Not read by this module's
 *  callers. */
export const FLIP_MASKS = {
  ntH: NT_HFLIP_MASK, ntV: NT_VFLIP_MASK,
  collX: COLL_XFLIP_MASK, collY: COLL_YFLIP_MASK,
  collShape: COLL_SHAPE_MASK,
} as const;

/**
 * Half two, on a NAMETABLE word: the tile now faces the other way.
 *
 * Unconditional — every field except the one flip bit is carried through by
 * the XOR, which is what keeps palette and priority alive across a flip.
 */
export function flipArtWord(word: number, axis: FlipAxis): number {
  return word ^ (axis === 'h' ? NT_HFLIP_MASK : NT_VFLIP_MASK);
}

/**
 * Half two, on a COLLISION CELL word: the shape now slopes the other way.
 *
 * Air (shape 0) is returned untouched — see the header. Every bit this
 * function does not own, including the engine's reserved 15:14, survives.
 */
export function flipCollisionWord(word: number, axis: FlipAxis): number {
  if ((word & COLL_SHAPE_MASK) === 0) return word;
  return word ^ (axis === 'h' ? COLL_XFLIP_MASK : COLL_YFLIP_MASK);
}

/**
 * Half one plus half two over a rectangular plane: read the mirrored source
 * cell, and hand its word through `toggle` on the way out.
 *
 * The two halves are deliberately in ONE loop. Written as "reverse, then map"
 * they are two statements either of which can be deleted or skipped by a future
 * edit and leave something that still compiles and still nearly works.
 */
function flipPlane(
  src: Uint16Array, w: number, h: number, axis: FlipAxis,
  toggle: (word: number) => number,
): Uint16Array {
  const out = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const sr = axis === 'v' ? h - 1 - r : r;
      const sc = axis === 'h' ? w - 1 - c : c;
      out[r * w + c] = toggle(src[sr * w + sc]);
    }
  }
  return out;
}

/**
 * The clipboard, mirrored — the paste-mode call site.
 *
 * A NEW object every time, never a mutation: `MapViewport`'s paste ghost caches
 * its rasterised preview keyed on the clipboard's OBJECT IDENTITY, so a flip
 * that mutated in place would update the model and leave the ghost showing the
 * unflipped art. (`setMapClipboard` already stores a freshly built object for
 * the same reason.)
 *
 * `artOnly` is copied, never recomputed. A plane whose length does not match
 * the footprint's cell count is copied verbatim rather than flipped — that is
 * the art-only clipboard's length-0 planes, and refusing to touch them is what
 * stops a flip from inventing collision.
 */
export function flipClipboard(clip: MapClipboard, axis: FlipAxis): MapClipboard {
  const cellsW = clip.widthTiles >> 1, cellsH = clip.heightTiles >> 1;
  const cells = cellsW * cellsH;
  const plane = (src: Uint16Array): Uint16Array => (
    src.length === cells && cells > 0
      ? flipPlane(src, cellsW, cellsH, axis, (word) => flipCollisionWord(word, axis))
      : new Uint16Array(src)
  );
  return {
    widthTiles: clip.widthTiles,
    heightTiles: clip.heightTiles,
    nametable: flipPlane(clip.nametable, clip.widthTiles, clip.heightTiles, axis,
      (word) => flipArtWord(word, axis)),
    collisionA: plane(clip.collisionA),
    collisionB: plane(clip.collisionB),
    artOnly: clip.artOnly,
  };
}

/** How a flip of this rectangle should be DESCRIBED in the undo stack and in a
 *  toast. One function so the two surfaces cannot name the same edit two ways. */
export function flipDescription(axis: FlipAxis, what: string): string {
  return `Flip ${what} ${axis === 'h' ? 'horizontally' : 'vertically'}`;
}

/**
 * The map region, mirrored in place — the committed-marquee call site.
 *
 * CAPTURE, FLIP, WRITE BACK, through the same `copyFromSection` the clipboard
 * path uses and the same `buildRegionWriteCommand` paste and stamp use. There
 * is no second transform and no second alignment rule: `copyFromSection`
 * decides whether this rectangle carries collision, exactly as it does for a
 * Ctrl+C, so an art-only rectangle flips art only and a block-aligned one
 * flips both.
 *
 * ONE `BatchCommand`, so it is one undo entry and one repaint. Returns null
 * when the flip changes nothing (a region symmetric under this axis, or an
 * empty one) — the caller says so rather than pushing an empty step.
 *
 * ⚠ The caller must `ensureCollisionPlanes(section)` first when the section's
 * authored planes may be unseeded, exactly as the paste and paint sites do:
 * `buildRegionWriteCommand` skips a plane the section does not have, which
 * would flip the art and leave the collision behind it.
 */
export function flipSectionRegion(args: {
  section: Section; sectionIndex: number;
  col: number; row: number; w: number; h: number;
  axis: FlipAxis; description: string;
}): BatchCommand | null {
  const { section, sectionIndex, col, row, w, h, axis, description } = args;
  const flipped = flipClipboard(copyFromSection(section, col, row, w, h), axis);
  return buildRegionWriteCommand({
    source: flipped, section, sectionIndex, baseCol: col, baseRow: row,
    writeArt: true, writeCollision: !flipped.artOnly, description,
  });
}
