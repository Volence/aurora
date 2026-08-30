// HAND-DERIVED S1 frame layouts vs Aurora's maps parser + composer.
//
// Owner finding (2026-08-20): the sideways Spring ($41) frame "looks scrambled —
// parts scattered across the 40x40 canvas". Is that a maps-renderer bug (piece
// x/y sign-extension, per-piece h/v flip, VDP tile order) or faithful to the
// ROM data? This file answers by DERIVATION, not eyeball: every expected piece
// below is transcribed BY HAND from the s1disasm `_maps/*.asm` call-sites, and
// the expected pixels are worked out on paper from the piece geometry — never
// from the code under test.
//
// PIECE FORMAT SOURCE — s1disasm/_maps/_MapMacros.asm, `spritePiece` macro,
// argument order: xpos, ypos, width, height, tile, xflip, yflip, pal, pri.
// (SonicMappingsVer=1 encodes those as 5 bytes: ypos.b, size.b
// ((w-1)<<2|(h-1)), tile word with pri<<15|pal<<13|yflip<<12|xflip<<11, xpos.b
// — but the .asm parser reads the ARGUMENTS, so the derivation transcribes the
// arguments.) Multi-tile pieces are VDP COLUMN-major: tile index walks down
// each column then to the next column (tile + col*height + row).
//
// VERDICT (recorded here so the question stays answered): the parser and the
// composer are FAITHFUL — every derived piece and pixel below matches. What the
// owner saw on the sideways frames is the doc's ART PAIRING, not a render bug:
// _maps/Springs.asm frames 3-5 (.spg_Left*) are drawn by the engine from
// Nem_VSpring at ArtTile_Spring_Vertical (_incObj/41 Springs.asm:54-55 sets
// obFrame=3 AND swaps obGfx), while frames 0-2 (.spg_Up*) draw Nem_HSpring at
// ArtTile_Spring_Horizontal (:43). The $41 doc opens ONE art file for all six
// frames, so the left-facing frames show up-spring tiles — see the spring
// pairing test at the bottom.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAsmMappings } from '../../src/core/import/asm-mappings';
import { renderFrameToIndices } from '../../src/core/art/sprite-render';
import type { SpriteFrame } from '../../src/core/model/sprite-types';
import type { Tile } from '../../src/core/model/s4-types';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../support/fixture-tree';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const maps = (rel: string) => parseAsmMappings(fs.readFileSync(path.join(S1DIR, '_maps', rel), 'utf8'));

/**
 * Synthetic distinguishable tiles: tile t is filled with value (t % 14) + 1,
 * except pixel (0,0) which is 15 — a corner marker that makes PIXEL-level
 * flips visible (an h+v-flipped cell shows the marker at its bottom-right).
 * Values stay in 4bpp range and are distinct within every piece asserted here.
 */
function markedTiles(count: number): Tile[] {
  const out: Tile[] = [];
  for (let t = 0; t < count; t++) {
    const pixels = new Uint8Array(64).fill((t % 14) + 1);
    pixels[0] = 15;
    out.push({ pixels });
  }
  return out;
}

/** Render one frame into a canvas of exactly its own piece bounds. */
function renderAlone(frame: SpriteFrame, tiles: Tile[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of frame.pieces) {
    minX = Math.min(minX, p.xOffset); minY = Math.min(minY, p.yOffset);
    maxX = Math.max(maxX, p.xOffset + p.widthCells * 8);
    maxY = Math.max(maxY, p.yOffset + p.heightCells * 8);
  }
  const width = maxX - minX, height = maxY - minY;
  return {
    width, height, originX: -minX, originY: -minY,
    indices: renderFrameToIndices(frame, tiles, width, height, -minX, -minY),
  };
}

describe('S1 sideways spring — derivation vs parser+composer', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  // HAND-TRANSCRIBED from _maps/Springs.asm (argument order per
  // _MapMacros.asm): the full six-frame table.
  //   0 .spg_Up:       (-$10,-8, 4x1, tile 0) (-$10,0, 4x1, tile 4)
  //   1 .spg_UpFlat:   (-$10,0, 4x1, tile 0)
  //   2 .spg_UpExt:    (-$10,-$18, 4x1, tile 0) (-8,-$10, 2x2, tile 8) (-$10,0, 4x1, tile $C)
  //   3 .spg_Left:     (-8,-$10, 2x4, tile 0)
  //   4 .spg_LeftFlat: (-8,-$10, 1x4, tile 4)
  //   5 .spg_LeftExt:  ($10,-$10, 1x4, tile 4) (-8,-8, 3x2, tile 8)
  //                    (-8,-$10, 1x1, tile 0) (-8,8, 1x1, tile 3)
  // No piece in the file sets xflip/yflip/pal/pri.
  const EXPECTED = [
    [{ x: -0x10, y: -8, w: 4, h: 1, t: 0 }, { x: -0x10, y: 0, w: 4, h: 1, t: 4 }],
    [{ x: -0x10, y: 0, w: 4, h: 1, t: 0 }],
    [{ x: -0x10, y: -0x18, w: 4, h: 1, t: 0 }, { x: -8, y: -0x10, w: 2, h: 2, t: 8 }, { x: -0x10, y: 0, w: 4, h: 1, t: 0xC }],
    [{ x: -8, y: -0x10, w: 2, h: 4, t: 0 }],
    [{ x: -8, y: -0x10, w: 1, h: 4, t: 4 }],
    [{ x: 0x10, y: -0x10, w: 1, h: 4, t: 4 }, { x: -8, y: -8, w: 3, h: 2, t: 8 }, { x: -8, y: -0x10, w: 1, h: 1, t: 0 }, { x: -8, y: 8, w: 1, h: 1, t: 3 }],
  ];

  it('parser: all 6 frames match the hand-derived piece lists exactly (offsets, sizes, tiles, no flips)', () => {
    const frames = maps('Springs.asm');
    expect(frames.length).toBe(6);
    frames.forEach((f, i) => {
      expect(f.pieces.length, `frame ${i} piece count`).toBe(EXPECTED[i].length);
      f.pieces.forEach((p, j) => {
        const e = EXPECTED[i][j];
        expect({ x: p.xOffset, y: p.yOffset, w: p.widthCells, h: p.heightCells, t: p.tile }, `frame ${i} piece ${j}`)
          .toEqual({ x: e.x, y: e.y, w: e.w, h: e.h, t: e.t });
        expect(p.xFlip, `frame ${i} piece ${j} xflip`).toBe(false);
        expect(p.yFlip, `frame ${i} piece ${j} yflip`).toBe(false);
        expect(p.palette, `frame ${i} piece ${j} pal`).toBe(0);
        expect(p.priority, `frame ${i} piece ${j} pri`).toBe(false);
      });
    });
  });

  it('composer: .spg_Left (frame 3, the sideways spring) is one 16x32 piece in VDP column-major tile order', () => {
    const frames = maps('Springs.asm');
    const { width, height, indices } = renderAlone(frames[3], markedTiles(16));
    // DERIVED: single 2x4 piece → canvas exactly 16x32; cell (col c, row r)
    // shows tile c*4 + r (column-major), i.e. value c*4 + r + 1; the corner
    // marker 15 sits at each cell's top-left (no flips).
    expect([width, height]).toEqual([16, 32]);
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 4; r++) {
        expect(indices[(r * 8 + 3) * width + (c * 8 + 3)], `cell ${c},${r} body`).toBe(c * 4 + r + 1);
        expect(indices[(r * 8 + 0) * width + (c * 8 + 0)], `cell ${c},${r} marker`).toBe(15);
      }
    }
  });

  it('composer: .spg_LeftExt (frame 5) scatters exactly as derived — plate at +$10, body, two lone 1x1s', () => {
    const frames = maps('Springs.asm');
    const { width, height, originX, originY, indices } = renderAlone(frames[5], markedTiles(16));
    // DERIVED bounds: x -8..$18, y -$10..$10 → 32x32 canvas, origin (8,16).
    expect([width, height, originX, originY]).toEqual([32, 32, 8, 16]);
    const at = (x: number, y: number) => indices[(y + originY) * width + (x + originX)];
    // Plate (1x4, tile 4) at x=$10: rows show tiles 4,5,6,7 → values 5,6,7,8.
    for (let r = 0; r < 4; r++) expect(at(0x10 + 3, -0x10 + r * 8 + 3), `plate row ${r}`).toBe(5 + r);
    // Body (3x2, tile 8) at (-8,-8): cell (c,r) shows tile 8 + c*2 + r.
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        expect(at(-8 + c * 8 + 3, -8 + r * 8 + 3), `body cell ${c},${r}`).toBe(((8 + c * 2 + r) % 14) + 1);
      }
    }
    // Lone 1x1s: tile 0 (value 1) at (-8,-$10); tile 3 (value 4) at (-8,8).
    expect(at(-8 + 3, -0x10 + 3)).toBe(1);
    expect(at(-8 + 3, 8 + 3)).toBe(4);
    // DERIVED empty regions: x 0..$10 is covered only by the body (y -8..8) —
    // the corners above and below it belong to no piece and must stay 0.
    // (The plate column x $10..$18 is covered at EVERY y: 1x4 = 32px tall.)
    expect(at(3, -0x10 + 3), 'above the body, right of the lone tile 0').toBe(0);
    expect(at(3, 8 + 3), 'below the body, right of the lone tile 3').toBe(0);
    expect(at(8 + 3, -0x10 + 3), 'top gap, x 8..16').toBe(0);
  });
});

describe('flip/negative-offset sweep — other objects, hand-derived', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('GHZ Ball .check2 (frame 2): h+v-flipped quadrants place tiles AND pixels mirrored', () => {
    // HAND-TRANSCRIBED from _maps/GHZ Ball.asm .check2:
    //   (-$18,-$18, 3x3, tile $12)  (0,-$18, 3x3, tile $1B)
    //   (-$18,0, 3x3, tile $1B, xflip=1, yflip=1)  (0,0, 3x3, tile $12, xflip=1, yflip=1)
    const frames = maps('GHZ Ball.asm');
    expect(frames.length).toBe(4);
    const f = frames[2];
    expect(f.pieces.map((p) => [p.xOffset, p.yOffset, p.widthCells, p.heightCells, p.tile, p.xFlip, p.yFlip]))
      .toEqual([
        [-0x18, -0x18, 3, 3, 0x12, false, false],
        [0, -0x18, 3, 3, 0x1B, false, false],
        [-0x18, 0, 3, 3, 0x1B, true, true],
        [0, 0, 3, 3, 0x12, true, true],
      ]);
    const { width, height, originX, originY, indices } = renderAlone(f, markedTiles(0x26));
    expect([width, height]).toEqual([48, 48]);
    const at = (x: number, y: number) => indices[(y + originY) * width + (x + originX)];
    const val = (t: number) => (t % 14) + 1;
    // Unflipped top-left quadrant: cell (c,r) = tile $12 + c*3 + r; marker 15
    // at each cell's TOP-LEFT pixel.
    expect(at(-0x18 + 3, -0x18 + 3)).toBe(val(0x12));
    expect(at(-0x18 + 8 + 3, -0x18 + 3)).toBe(val(0x12 + 3)); // col 1 row 0
    expect(at(-0x18, -0x18)).toBe(15);
    // h+v-flipped bottom-left quadrant (tile $1B): output cell (c,r) shows tile
    // $1B + (2-c)*3 + (2-r); its corner marker lands at the cell's BOTTOM-RIGHT.
    expect(at(-0x18 + 3, 0 + 3)).toBe(val(0x1B + 2 * 3 + 2)); // output cell (0,0) ← source cell (2,2)
    expect(at(-0x18 + 8 + 3, 0 + 3)).toBe(val(0x1B + 1 * 3 + 2)); // output cell (1,0) ← source (1,2)
    expect(at(-0x18 + 7, 0 + 7)).toBe(15); // marker mirrored to bottom-right of output cell (0,0)
    expect(at(-0x18, 0)).toBe(val(0x1B + 2 * 3 + 2)); // and NOT at the top-left
  });

  it('Eggman .escapeflame1 (frame 11): positive offsets + a y-flipped piece, derived exactly', () => {
    // HAND-TRANSCRIBED from _maps/Eggman.asm .escapeflame1:
    //   ($22,0, 3x1, tile $12A)  ($22,8, 3x1, tile $12A, yflip=1)
    const frames = maps('Eggman.asm');
    expect(frames.length).toBe(13);
    const f = frames[11];
    expect(f.pieces.map((p) => [p.xOffset, p.yOffset, p.widthCells, p.heightCells, p.tile, p.xFlip, p.yFlip]))
      .toEqual([
        [0x22, 0, 3, 1, 0x12A, false, false],
        [0x22, 8, 3, 1, 0x12A, false, true],
      ]);
    // Composer with a pool long enough to reach $12A: tiles $12A/$12B/$12C are
    // values ($12A%14)+1.. = 5,6,7 with markers. y-flip of a 1-row piece keeps
    // the tile order (h=1) but mirrors pixels vertically: marker at bottom-left.
    const { width, height, originX, originY, indices } = renderAlone(f, markedTiles(0x12D));
    expect([width, height, originX, originY + 0]).toEqual([24, 16, -0x22, 0]); // +0 normalizes JS -0 (originY = -minY, minY = 0)
    const at = (x: number, y: number) => indices[(y + originY) * width + (x + originX)];
    expect(at(0x22, 0)).toBe(15); // top piece, cell (0,0) marker top-left
    expect(at(0x22 + 3, 0 + 3)).toBe((0x12A % 14) + 1);
    expect(at(0x22 + 8 + 3, 0 + 3)).toBe((0x12B % 14) + 1); // 3x1: row-adjacent cells are +1 (h=1 column-major degenerates to +1 per col)
    expect(at(0x22, 8 + 7)).toBe(15); // y-flipped piece: marker at BOTTOM-left of its first cell
    expect(at(0x22 + 3, 8 + 3)).toBe((0x12A % 14) + 1);
  });
});

// The spring ART-PAIRING truth the scramble traces to (not a composer bug):
// the engine draws frames 3-5 from a DIFFERENT art file than frames 0-2.
import { resolveObjectArt } from '../../src/core/project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../../src/core/project/profiles/object-subtype-rules';

describe('spring $41 art pairing (the actual source of the "scrambled" look)', () => {
  it('base link opens Nem_HSpring; the horizontal-subtype rule swaps to Nem_VSpring frame 3 — matching _incObj/41 Springs.asm:43/54-55', () => {
    const base = resolveObjectArt(0x41)!;
    expect(base.artFile).toBe('artnem/Spring Horizontal.nem');
    // Subtype $10 = horizontal (Direction bits 4-5 = 1): the engine sets
    // obFrame=3 AND obGfx=ArtTile_Spring_Vertical — one maps file, two art
    // files split BY FRAME RANGE. The in-level preview honors that via the
    // subtype rule; the DOC now honors it too via the row's frameSources
    // slice (formerly the recorded "scrambled frames 3-5" limitation — see
    // s1-open-refusal.test.ts for the hand-derived doc-render assertions).
    const eff = resolveEffectiveObjectArt(0x41, 'ghz', 0x10, base);
    expect(eff.link.artFile).toBe('artnem/Spring Vertical.nem');
    expect(eff.link.frame).toBe(3);
    // The doc-side transcription of the same engine fact:
    expect(base.frameSources).toEqual([
      { firstFrame: 3, lastFrame: 5, artFile: 'artnem/Spring Vertical.nem', compression: 'nemesis' },
    ]);
  });
});
