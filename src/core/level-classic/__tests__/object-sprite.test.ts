import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  renderObjectFrame,
  renderObjectFrameFromFiles,
  composeObjectFrames,
  objectFrameRect,
  pointInRect,
} from '../object-sprite';
import { resolveObjectArt } from '../../project/profiles/s1-object-art';
import type { SpriteFrame } from '../../model/sprite-types';
import type { Tile } from '../../model/s4-types';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

describe('object-sprite pure helpers', () => {
  it('renderObjectFrame sizes to the frame bounding box with signed origin', () => {
    // A single 2x2-cell (16x16) piece at (-16, -8).
    const frames: SpriteFrame[] = [
      { id: 'f0', pieces: [
        { xOffset: -16, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
      ] },
    ];
    // One solid tile (all pixels index 1).
    const solid: Tile = { pixels: new Uint8Array(64).fill(1) };
    const tiles: Tile[] = [solid, solid, solid, solid];
    const r = renderObjectFrame(frames, tiles, 0);
    expect(r.width).toBe(16);
    expect(r.height).toBe(16);
    expect(r.originX).toBe(16); // -minX
    expect(r.originY).toBe(8); // -minY
    // Non-empty (the solid tile filled every pixel).
    expect(r.indices.some((v) => v !== 0)).toBe(true);
  });

  it('renderObjectFrame tolerates an out-of-range frame index', () => {
    const r = renderObjectFrame([], [], 5);
    expect(r.width).toBe(8);
    expect(r.height).toBe(8);
    expect(r.indices.every((v) => v === 0)).toBe(true);
  });

  it('objectFrameRect anchors the origin and flips about the anchor', () => {
    const bounds = { width: 48, height: 32, originX: 24, originY: 16 };
    const plain = objectFrameRect(bounds, 100, 100, false, false);
    expect(plain).toEqual({ left: 76, top: 84, width: 48, height: 32 });
    const xf = objectFrameRect(bounds, 100, 100, true, false);
    expect(xf).toEqual({ left: 100 - (48 - 24), top: 84, width: 48, height: 32 });
    const yf = objectFrameRect(bounds, 100, 100, false, true);
    expect(yf).toEqual({ left: 76, top: 100 - (32 - 16), width: 48, height: 32 });
  });

  it('pointInRect is half-open on the far edge', () => {
    const rect = { left: 10, top: 10, width: 20, height: 20 };
    expect(pointInRect(rect, 10, 10)).toBe(true);
    expect(pointInRect(rect, 29, 29)).toBe(true);
    expect(pointInRect(rect, 30, 30)).toBe(false);
    expect(pointInRect(rect, 9, 20)).toBe(false);
  });

  describe('composeObjectFrames (subtype-rule compositing)', () => {
    // A 1x1-cell frame anchored at (0,0) filled with palette index `v` (its own tile).
    const cell = (v: number): Tile => ({ pixels: new Uint8Array(64).fill(v) });
    const frameOf = (): SpriteFrame => ({
      id: 'f', pieces: [
        { xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
      ],
    });

    it('unions piece bounds and offsets each piece by (dx, dy)', () => {
      const frames = [frameOf()];
      const tiles = [cell(1)];
      // Three 8x8 pieces in a horizontal row at dx 0, 16, 32.
      const r = composeObjectFrames(frames, tiles, [
        { frame: 0, dx: 0, dy: 0 }, { frame: 0, dx: 16, dy: 0 }, { frame: 0, dx: 32, dy: 0 },
      ]);
      expect(r.width).toBe(8 + 32); // spans [0, 40)
      expect(r.height).toBe(8);
      expect(r.originX).toBe(0); // -minX (minX = 0)
      // The middle gap (x 8..15) is empty; the three cells are opaque.
      expect(r.indices[0]).toBe(1); // first cell top-left
      expect(r.indices[16]).toBe(1); // second cell (dx 16) top-left
    });

    it('a negative dx shifts the origin so the composite stays anchored', () => {
      const r = composeObjectFrames([frameOf()], [cell(1)], [
        { frame: 0, dx: -16, dy: 0 }, { frame: 0, dx: 0, dy: 0 },
      ]);
      expect(r.width).toBe(24); // [-16, 8)
      expect(r.originX).toBe(16); // -minX
    });

    it('per-piece xf mirrors that piece about its own anchor', () => {
      // Two-cell wide frame: left cell index 1, right cell index 2.
      const frame: SpriteFrame = { id: 'f', pieces: [
        { xOffset: 0, yOffset: 0, widthCells: 2, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
      ] };
      const tiles = [cell(1), cell(2)];
      const plain = composeObjectFrames([frame], tiles, [{ frame: 0, dx: 0, dy: 0 }]);
      expect(plain.indices[0]).toBe(1); // left column is index 1
      const flipped = composeObjectFrames([frame], tiles, [{ frame: 0, dx: 0, dy: 0, xf: true }]);
      expect(flipped.indices[0]).toBe(2); // mirror: left column is now index 2
    });

    it('empty piece list yields an 8x8 origin-0 box', () => {
      const r = composeObjectFrames([frameOf()], [cell(1)], []);
      expect(r).toMatchObject({ width: 8, height: 8, originX: 0, originY: 0 });
    });
  });

  it('renderObjectFrame draws the FIRST mappings piece on top (S1 sprite priority)', () => {
    // Piece order matters where pieces overlap: piece[0] is the icon (index 2),
    // piece[1] is an opaque shell (index 1) covering the same cell. S1 draws piece[0]
    // on top, so the result must be the icon (2), not the shell (1).
    const frame: SpriteFrame = { id: 'f', pieces: [
      { xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 1, palette: 0, priority: false, xFlip: false, yFlip: false },
      { xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
    ] };
    const tiles: Tile[] = [
      { pixels: new Uint8Array(64).fill(1) }, // tile 0 = shell (index 1)
      { pixels: new Uint8Array(64).fill(2) }, // tile 1 = icon (index 2)
    ];
    const r = renderObjectFrame([frame], tiles, 0);
    expect(r.indices[0]).toBe(2); // icon wins (first piece on top)
  });

  describe.skipIf(!fs.existsSync(S1DIR))('golden render against real s1disasm', () => {
    function render(id: number, zone: string) {
      const link = resolveObjectArt(id, zone);
      if (!link) throw new Error(`no link for $${id.toString(16)}`);
      const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
      // Decode mappings text the SAME way production does (TextDecoder utf-8).
      const mapText = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(S1DIR, link.mapAsm)));
      return renderObjectFrameFromFiles(mapText, artBytes, link.compression, link.frame);
    }

    it('Crabmeat frame 0 renders non-empty at 48x32 (from its mappings)', () => {
      const r = render(0x1f, 'ghz');
      // .stand pieces span x[-24,24]=48, y[-16,16]=32.
      expect(r.width).toBe(48);
      expect(r.height).toBe(32);
      expect(r.originX).toBe(24);
      expect(r.originY).toBe(16);
      expect(r.indices.some((v) => v !== 0)).toBe(true);
    });

    it('Signpost frame 0 renders non-empty at 48x48', () => {
      const r = render(0x0d, 'ghz');
      // .eggman pieces span x[-24,24]=48, y[-16,32]=48.
      expect(r.width).toBe(48);
      expect(r.height).toBe(48);
      expect(r.indices.some((v) => v !== 0)).toBe(true);
    });

    it('Monitor frame 0 renders non-empty', () => {
      const r = render(0x26, 'ghz');
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.indices.some((v) => v !== 0)).toBe(true);
    });
  });
});
