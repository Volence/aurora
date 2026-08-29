import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  renderObjectFrame,
  renderObjectFrameFromFiles,
  renderResolvedObjectFrame,
  objectArtTiles,
  composeObjectFrames,
  objectFrameRect,
  pointInRect,
} from '../object-sprite';
import { resolveObjectArt } from '../../project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../../project/profiles/object-subtype-rules';
import { s1Adapter } from '../../project/s1';
import type { FileAccess } from '../../project/adapter';
import type { LevelDoc } from '../model';
import type { SpriteFrame } from '../../model/sprite-types';
import type { Tile } from '../../model/s4-types';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;

function realFs(root: string): FileAccess {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

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

  describe('objectArtTiles (B6 tile-source resolution)', () => {
    // Raw 4bpp bytes: tile i marked with index (i+1) in its top-left pixel.
    const marked = (n: number): Uint8Array => {
      const b = new Uint8Array(n * 32);
      for (let i = 0; i < n; i++) b[i * 32] = ((i + 1) & 0xf) << 4; // high nibble = (i+1)
      return b;
    };

    it('levelArt source parses doc.tiles directly (no shift)', () => {
      const level = marked(3);
      const tiles = objectArtTiles('levelArt', null, 'uncompressed', level, 0);
      expect(tiles.length).toBe(3);
      expect(tiles[0].pixels[0]).toBe(1); // level tile 0
      expect(tiles[1].pixels[0]).toBe(2);
      expect(tiles[2].pixels[0]).toBe(3);
    });

    it('positive tileIndexOffset prepends blank tiles (MultiFileIndexer semantics)', () => {
      // offset +2 tiles: combined[i] = raw[i-2] → tiles 0,1 blank, tile 2 = raw tile 0.
      const raw = marked(2);
      const tiles = objectArtTiles('file', raw, 'uncompressed', null, 2);
      expect(tiles.length).toBe(4); // (2*32 + 2*32) / 32
      expect(tiles[0].pixels.every((v) => v === 0)).toBe(true);
      expect(tiles[1].pixels.every((v) => v === 0)).toBe(true);
      expect(tiles[2].pixels[0]).toBe(1); // raw tile 0
      expect(tiles[3].pixels[0]).toBe(2);
    });

    it('negative tileIndexOffset drops leading tiles (Switch offset=-128 → -4)', () => {
      // offset -1 tile: combined[i] = raw[i+1] → drop raw tile 0.
      const raw = marked(3);
      const tiles = objectArtTiles('file', raw, 'uncompressed', null, -1);
      expect(tiles.length).toBe(2); // (-1*32 + 3*32) / 32
      expect(tiles[0].pixels[0]).toBe(2); // raw tile 1
      expect(tiles[1].pixels[0]).toBe(3); // raw tile 2
    });
  });

  describe('B6 golden: LevelArt + offset-art against real s1disasm', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
    let ghz1: LevelDoc;
    beforeAll(async () => {
      const handle = await s1Adapter.open(realFs(S1DIR));
      const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
      ghz1 = await handle.levels!.read(ref);
    });

    function renderLevelArt(id: number, zone: string, subtype: number, doc: LevelDoc) {
      const base = resolveObjectArt(id, zone)!;
      const { link, pieces } = resolveEffectiveObjectArt(id, zone, subtype, base);
      const mapText = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(S1DIR, link.mapAsm)));
      const artBytes = link.artSource === 'file'
        ? new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile))) : null;
      return renderResolvedObjectFrame(
        { artSource: link.artSource, compression: link.compression, tileIndexOffset: link.tileIndexOffset, frame: link.frame, pieces },
        mapText, artBytes, link.artSource === 'levelArt' ? doc.tiles : null,
      );
    }

    it('GHZ $18 Platform (small, subtype 0) composes non-empty from doc.tiles at 64x32', () => {
      const r = renderLevelArt(0x18, 'ghz', 0x00, ghz1);
      // Platforms (GHZ).asm .small spans x[-32,32]=64, y[-12,20]=32.
      expect(r.width).toBe(64);
      expect(r.height).toBe(32);
      expect(r.indices.some((v) => v !== 0), 'platform art must be present in GHZ tile pool').toBe(true);
    });

    it('GHZ $18 Platform "Large" (subtype 0x0A) draws the taller frame 1', () => {
      const small = renderLevelArt(0x18, 'ghz', 0x00, ghz1);
      const large = renderLevelArt(0x18, 'ghz', 0x0a, ghz1);
      expect(large.indices.some((v) => v !== 0)).toBe(true);
      expect(large.height).toBeGreaterThan(small.height); // column platform is taller
    });

    it('GHZ $1A Collapsing Cliff composes non-empty from doc.tiles', () => {
      const r = renderLevelArt(0x1a, 'ghz', 0x00, ghz1);
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.indices.some((v) => v !== 0)).toBe(true);
    });

    it('LZ $32 Switch offset-art renders non-garbled (the -128 byte shift matters)', () => {
      const base = resolveObjectArt(0x32, 'lz')!;
      const { link, pieces } = resolveEffectiveObjectArt(0x32, 'lz', 0, base);
      expect(link.tileIndexOffset).toBe(-4);
      const mapText = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(S1DIR, link.mapAsm)));
      const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
      const withOff = renderResolvedObjectFrame(
        { artSource: 'file', compression: link.compression, tileIndexOffset: link.tileIndexOffset, frame: link.frame, pieces },
        mapText, artBytes, null,
      );
      // Button.asm .up = two 2x2 pieces at x[-16,16]=32, y[-11,5]=16; non-empty.
      expect(withOff.width).toBe(32);
      expect(withOff.height).toBe(16);
      expect(withOff.indices.some((v) => v !== 0)).toBe(true);
      // The offset is load-bearing: rendering the SAME art without the shift yields a
      // different (wrong) bitmap — proves the tile-pool shift is applied, not ignored.
      const noOff = renderResolvedObjectFrame(
        { artSource: 'file', compression: link.compression, tileIndexOffset: 0, frame: link.frame, pieces },
        mapText, artBytes, null,
      );
      expect(Array.from(withOff.indices)).not.toEqual(Array.from(noOff.indices));
    });
  });

  describe('golden render against real s1disasm', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
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
