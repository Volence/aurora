// Parcel C (audit 2026-08-20 §3 model (c)) — raw tile grids with NO mappings
// file, opened as synthesized one-piece frames. The unit contract:
//
//   • one frame per fixed-size cell, tiles consumed consecutively in VDP
//     column-major piece order (`tile + col*heightCells + row`,
//     sprite-render.ts) — which for the S1 blitters IS the file order: the HUD
//     writes 2 consecutive tiles per 8×16 digit (`lsl.w #6 ; multiply by $40
//     (tile_size*2)`, s1disasm _inc/HUD Update.asm:336) into consecutive VRAM,
//     referenced as one 1×2-cell column.
//   • LOUD on unmeasurable: a tile count that is not a whole number of cells
//     throws instead of silently truncating a partial glyph.

import { describe, it, expect } from 'vitest';
import { synthesizeGridFrames } from '../sprite-import';
import { renderFrameToIndices } from '../../art/sprite-render';
import type { Tile } from '../../model/s4-types';

/** A tile whose 64 pixels all carry `v` (recognizable per-tile fill). */
const fill = (v: number): Tile => ({ pixels: new Uint8Array(64).fill(v) });

describe('synthesizeGridFrames', () => {
  it('slices an 8×16 grid (1×2 cells) into count = tiles/2 frames of consecutive tile pairs', () => {
    const frames = synthesizeGridFrames(24, { widthCells: 1, heightCells: 2 });
    expect(frames).toHaveLength(12); // 24 tiles ÷ 2 per cell
    // Frame i's single piece leads at tile 2i, 1 cell wide × 2 tall, unflipped,
    // at the origin (the grid has no inter-frame offsets to preserve).
    frames.forEach((f, i) => {
      expect(f.pieces).toHaveLength(1);
      expect(f.pieces[0]).toMatchObject({
        tile: i * 2, widthCells: 1, heightCells: 2,
        xOffset: 0, yOffset: 0, xFlip: false, yFlip: false, palette: 0,
      });
    });
  });

  it('renders top tile above bottom tile: the HUD blit order (2 consecutive tiles per digit)', () => {
    const frames = synthesizeGridFrames(4, { widthCells: 1, heightCells: 2 });
    const tiles = [fill(1), fill(2), fill(3), fill(4)];
    const px = renderFrameToIndices(frames[1], tiles, 8, 16, 0, 0);
    expect(px[0]).toBe(3);       // top-left pixel = tile 2 (frame 1's first tile)
    expect(px[8 * 8]).toBe(4);   // row 8 = the bottom tile
  });

  it('slices an 8×8 grid (1×1 cells) one tile per frame', () => {
    const frames = synthesizeGridFrames(41, { widthCells: 1, heightCells: 1 });
    expect(frames).toHaveLength(41);
    expect(frames[40].pieces[0]).toMatchObject({ tile: 40, widthCells: 1, heightCells: 1 });
  });

  it('throws LOUDLY when the tile count is not a whole number of cells', () => {
    expect(() => synthesizeGridFrames(25, { widthCells: 1, heightCells: 2 }))
      .toThrow(/25 tiles.*1×2/);
  });

  it('rejects cell geometry the VDP cannot express (cells are 1..4 per axis)', () => {
    expect(() => synthesizeGridFrames(10, { widthCells: 5, heightCells: 1 })).toThrow(/cell/i);
    expect(() => synthesizeGridFrames(10, { widthCells: 0, heightCells: 1 })).toThrow(/cell/i);
  });
});
