// Per-pixel sprite-piece PRIORITY mask on rendered object frames.
//
// A sprite piece carries its own VDP priority bit in the mappings word — bit 15
// of the attrs word on the binary path (sprite-mappings-import.ts:
// `priority: (attrs & 0x8000) !== 0`) and the 9th `spritePiece` macro argument
// on the ASM path (asm-mappings.ts: `priority: !!pri`). On hardware the bit
// decides plane-vs-sprite compositing PER PIECE: a high-priority piece's pixels
// render above high-priority plane tiles, a low piece's pixels behind them.
//
// The flat RenderedObjectFrame loses the piece structure, so the render path
// must carry a per-pixel mask of which WINNING pixel came from a high-priority
// piece. "Winning" follows the same rule as the pixel composite itself: the
// FIRST mappings piece is drawn on top (renderObjectFrame reverses the array
// before renderFrameToIndices' later-overwrites-earlier compositing), and a
// transparent pixel of a top piece never claims the pixel.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  renderObjectFrame, composeObjectFrames, decodeObjectArt,
} from '../object-sprite';
import { parseAsmMappings } from '../../import/asm-mappings';
import type { SpriteFrame } from '../../model/sprite-types';
import type { Tile } from '../../model/s4-types';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const S1_PRESENT = fs.existsSync(S1DIR);

/** A synthetic 8x8 tile whose every pixel is `v` (0 = fully transparent). */
function solidTile(v: number): Tile {
  return { pixels: Array.from(new Uint8Array(64).fill(v)) } as unknown as Tile;
}
/** A tile transparent on the left half (cols 0-3), value `v` on the right. */
function halfTile(v: number): Tile {
  const px = new Uint8Array(64);
  for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) px[y * 8 + x] = v;
  return { pixels: Array.from(px) } as unknown as Tile;
}

function piece(over: Partial<SpriteFrame['pieces'][number]>): SpriteFrame['pieces'][number] {
  return {
    xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1,
    tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    ...over,
  };
}

describe('renderObjectFrame priMask (synthetic)', () => {
  // tiles[0] unused sentinel, tiles[1] solid 1s, tiles[2] solid 2s, tiles[3] half-transparent 3s
  const tiles = [solidTile(9), solidTile(1), solidTile(2), halfTile(3)];

  it('is null when no piece carries the priority bit', () => {
    const frames: SpriteFrame[] = [{ id: 'f0', pieces: [piece({ tile: 1 })] }];
    const r = renderObjectFrame(frames, tiles, 0);
    expect(r.priMask).toBeNull();
  });

  it('marks exactly the pixels won by a priority piece', () => {
    // First mapping piece (drawn ON TOP) is priority, overlapping a low piece:
    //   A: pri, tile 1, at x 0..7
    //   B: low, tile 2, at x 4..11
    // Composite: x 0..7 shows A (top), x 8..11 shows B.
    const frames: SpriteFrame[] = [{
      id: 'f0',
      pieces: [
        piece({ tile: 1, priority: true }),
        piece({ tile: 2, xOffset: 4 }),
      ],
    }];
    const r = renderObjectFrame(frames, tiles, 0);
    expect(r.priMask).toBeInstanceOf(Uint8Array);
    const m = r.priMask!;
    expect(r.width).toBe(12);
    // Pixel (0,0): only A → high.
    expect(m[0]).toBe(1);
    // Pixel (5,0): overlap, A wins (first mapping piece on top) → high.
    expect(r.indices[5]).toBe(1);
    expect(m[5]).toBe(1);
    // Pixel (9,0): only B → low.
    expect(r.indices[9]).toBe(2);
    expect(m[9]).toBe(0);
  });

  it('a priority piece\'s TRANSPARENT pixels never claim the mask', () => {
    // Top piece is priority but transparent on its left half; the low piece
    // underneath shows through there — those pixels are LOW.
    const frames: SpriteFrame[] = [{
      id: 'f0',
      pieces: [
        piece({ tile: 3, priority: true }), // half-transparent, on top
        piece({ tile: 2 }),                 // solid low, underneath
      ],
    }];
    const r = renderObjectFrame(frames, tiles, 0);
    const m = r.priMask!;
    // (1,0): top piece transparent → underlying low pixel shows → low.
    expect(r.indices[1]).toBe(2);
    expect(m[1]).toBe(0);
    // (5,0): top priority pixel shows → high.
    expect(r.indices[5]).toBe(3);
    expect(m[5]).toBe(1);
  });
});

describe('composeObjectFrames priMask (synthetic)', () => {
  const tiles = [solidTile(9), solidTile(1), solidTile(2)];
  const frames: SpriteFrame[] = [
    { id: 'f0', pieces: [piece({ tile: 1, priority: true })] }, // all-high 8x8
    { id: 'f1', pieces: [piece({ tile: 2 })] },                 // all-low 8x8
  ];

  it('carries each sub-frame\'s mask into the composite, later pieces overwriting', () => {
    const r = composeObjectFrames(frames, tiles, [
      { frame: 0, dx: 0, dy: 0 },  // high at x 0..7
      { frame: 1, dx: 4, dy: 0 },  // low at x 4..11, drawn LATER → wins overlap
    ]);
    expect(r.priMask).toBeInstanceOf(Uint8Array);
    const m = r.priMask!;
    expect(m[0]).toBe(1);              // only the high sub-frame
    expect(r.indices[5]).toBe(2);      // overlap: later (low) piece wins the pixel
    expect(m[5]).toBe(0);              // … and the mask follows the winner
    expect(m[9]).toBe(0);              // only the low sub-frame
  });

  it('mask mirrors with a piece xf exactly like the pixels', () => {
    // One high frame flipped: mask must be the mirror of the unflipped mask.
    const plain = composeObjectFrames(frames, tiles, [{ frame: 0, dx: 0, dy: 0 }]);
    const flipped = composeObjectFrames(frames, tiles, [{ frame: 0, dx: 0, dy: 0, xf: true }]);
    expect(plain.priMask).not.toBeNull();
    expect(flipped.priMask).not.toBeNull();
    for (let y = 0; y < plain.height; y++) {
      for (let x = 0; x < plain.width; x++) {
        expect(flipped.priMask![y * plain.width + (plain.width - 1 - x)])
          .toBe(plain.priMask![y * plain.width + x]);
      }
    }
  });

  it('is null when no sub-frame has priority pieces', () => {
    const r = composeObjectFrames(frames, tiles, [{ frame: 1, dx: 0, dy: 0 }]);
    expect(r.priMask).toBeNull();
  });
});

describe.skipIf(!S1_PRESENT)('priMask against real s1disasm data (Newtron frame 8)', () => {
  // Measured over every linked object's mappings with parseAsmMappings (the
  // same parser production uses): _maps/Newtron.asm frame 8 is the real MIXED
  // case whose priority piece's tiles actually RESOLVE in its art file (tile
  // 82 < pool size) — Wall of Lava / Button / LZ Blocks' pri pieces reference
  // dynamically-loaded VRAM tiles (e.g. tile 1834) that render transparent
  // from the standalone .nem, so they can't exercise the mask. Expectations
  // below are DERIVED from the parsed pieces' geometry, not hardcoded pixels:
  // a pixel covered by exactly one piece inherits that piece's bit.
  const mapText = fs.readFileSync(path.join(S1DIR, '_maps/Newtron.asm'), 'utf8');
  const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, 'artnem/Enemy Newtron.nem')));
  const FRAME = 8;

  it('frame 8 mask is present and mixed, and single-piece pixels match their piece bit', () => {
    const frames = parseAsmMappings(mapText);
    const f0 = frames[FRAME];
    const priCount = f0.pieces.filter((p) => p.priority).length;
    expect(priCount).toBeGreaterThan(0);
    expect(priCount).toBeLessThan(f0.pieces.length); // genuinely mixed

    const tiles = decodeObjectArt(artBytes, 'nemesis');
    const r = renderObjectFrame(frames, tiles, FRAME);
    expect(r.priMask).toBeInstanceOf(Uint8Array);
    const m = r.priMask!;

    // Search (never hardcode) for a non-transparent pixel covered by exactly
    // one piece, for each polarity, and check the mask matches the piece.
    const covering = (px: number, py: number) =>
      f0.pieces.filter((p) =>
        px >= p.xOffset + r.originX && px < p.xOffset + r.originX + p.widthCells * 8 &&
        py >= p.yOffset + r.originY && py < p.yOffset + r.originY + p.heightCells * 8);
    let checkedHigh = 0, checkedLow = 0;
    for (let py = 0; py < r.height; py++) {
      for (let px = 0; px < r.width; px++) {
        if (r.indices[py * r.width + px] === 0) continue;
        const cov = covering(px, py);
        if (cov.length !== 1) continue;
        expect(m[py * r.width + px]).toBe(cov[0].priority ? 1 : 0);
        if (cov[0].priority) checkedHigh++; else checkedLow++;
      }
    }
    // Anti-vacuous: both polarities must actually have been exercised.
    expect(checkedHigh).toBeGreaterThan(0);
    expect(checkedLow).toBeGreaterThan(0);
  });
});
