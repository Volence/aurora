import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import {
  packBlockCell,
  unpackBlockCell,
  packChunkCell,
  unpackChunkCell,
  validateLevelDoc,
  type BlockCell,
  type ChunkCell,
  type BlockDef,
  type ChunkDef256,
  type LevelDoc,
} from '../model';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

// ---------------------------------------------------------------------------
// Builders for a minimal, valid LevelDoc — every test starts from `validDoc()`
// and introduces exactly one violation.
// ---------------------------------------------------------------------------

function blockCell(over: Partial<BlockCell> = {}): BlockCell {
  return { tile: 0, xf: false, yf: false, pal: 0, pri: false, ...over };
}
function chunkCell(over: Partial<ChunkCell> = {}): ChunkCell {
  return { block: 0, xf: false, yf: false, solidity: 0, ...over };
}
function block(): BlockDef {
  return { cells: [blockCell(), blockCell(), blockCell(), blockCell()] };
}
function chunk(): ChunkDef256 {
  return { cells: Array.from({ length: 256 }, () => chunkCell()) };
}

function validDoc(): LevelDoc {
  return {
    game: 's1',
    tiles: new Uint8Array(32 * 4), // 4 tiles → tile refs 0..3 valid
    blocks: [block()],
    chunks: [chunk()],
    fg: { width: 4, height: 2, cells: new Uint8Array(8) },
    bg: { width: 4, height: 2, cells: new Uint8Array(8) },
    collision: {
      colind: new Uint8Array(1),
      shapes: { heights: [], angles: new Uint8Array(0) },
    },
    palettes: [new Uint16Array(16), new Uint16Array(16), new Uint16Array(16), new Uint16Array(16)],
    paletteSources: [],
    objects: [{ x: 0x10, y: 0x20, xflip: false, yflip: false, respawn: false, id: 1, subtype: 2 }],
    start: { x: 0x50, y: 0x60 },
    sourceRefs: {},
  };
}

// ---------------------------------------------------------------------------
// Pack / unpack round-trips
// ---------------------------------------------------------------------------

describe('block cell pack/unpack', () => {
  // Representative tile indices incl. boundaries of the 11-bit field.
  const tiles = [0, 1, 0x2a, 0x400, 0x7fe, 0x7ff];
  const pals = [0, 1, 2, 3];

  it('round-trips exhaustively over flags/palette × representative tiles', () => {
    for (const tile of tiles) {
      for (const pal of pals) {
        for (const xf of [false, true]) {
          for (const yf of [false, true]) {
            for (const pri of [false, true]) {
              const c: BlockCell = { tile, xf, yf, pal, pri };
              expect(unpackBlockCell(packBlockCell(c))).toEqual(c);
            }
          }
        }
      }
    }
  });

  it('matches the verified SonLVLAPI PatternIndex bit positions', () => {
    // tile in low 11 bits; xf=0x800, yf=0x1000, pal<<13, pri=0x8000.
    expect(packBlockCell({ tile: 0x123, xf: false, yf: false, pal: 0, pri: false })).toBe(0x123);
    expect(packBlockCell({ tile: 0, xf: true, yf: false, pal: 0, pri: false })).toBe(0x800);
    expect(packBlockCell({ tile: 0, xf: false, yf: true, pal: 0, pri: false })).toBe(0x1000);
    expect(packBlockCell({ tile: 0, xf: false, yf: false, pal: 3, pri: false })).toBe(0x6000);
    expect(packBlockCell({ tile: 0, xf: false, yf: false, pal: 0, pri: true })).toBe(0x8000);
    // A fully-set word decodes back to every field.
    expect(unpackBlockCell(0xffff)).toEqual({ tile: 0x7ff, xf: true, yf: true, pal: 3, pri: true });
  });
});

describe('chunk cell pack/unpack', () => {
  const blocks = [0, 1, 0x2a, 0x100, 0x3fe, 0x3ff];
  const solidities = [0, 1, 2, 3];

  it('round-trips exhaustively over flags/solidity × representative blocks', () => {
    for (const b of blocks) {
      for (const solidity of solidities) {
        for (const xf of [false, true]) {
          for (const yf of [false, true]) {
            const c: ChunkCell = { block: b, xf, yf, solidity };
            expect(unpackChunkCell(packChunkCell(c))).toEqual(c);
          }
        }
      }
    }
  });

  it('matches the verified SonLVLAPI S1ChunkBlock bit positions', () => {
    // block in low 10 bits; xf=0x800, yf=0x1000, solidity<<13; no priority bit.
    expect(packChunkCell({ block: 0x123, xf: false, yf: false, solidity: 0 })).toBe(0x123);
    expect(packChunkCell({ block: 0, xf: true, yf: false, solidity: 0 })).toBe(0x800);
    expect(packChunkCell({ block: 0, xf: false, yf: true, solidity: 0 })).toBe(0x1000);
    expect(packChunkCell({ block: 0, xf: false, yf: false, solidity: 3 })).toBe(0x6000);
    // Bit 15 and bit 10 are unused in S1: a word with them set ignores them but
    // still recovers every real field.
    expect(unpackChunkCell(0x7fff)).toEqual({ block: 0x3ff, xf: true, yf: true, solidity: 3 });
  });
});

// ---------------------------------------------------------------------------
// Validation — a valid doc plus exactly one violation per test
// ---------------------------------------------------------------------------

describe('validateLevelDoc', () => {
  it('accepts a minimal valid doc', () => {
    expect(validateLevelDoc(validDoc())).toEqual([]);
  });

  it('flags too many blocks (> $400)', () => {
    const d = validDoc();
    d.blocks = Array.from({ length: 0x401 }, () => block());
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/too many blocks/));
  });

  it('flags a block without exactly 4 cells', () => {
    const d = validDoc();
    d.blocks[0].cells = [blockCell(), blockCell(), blockCell()];
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/exactly 4 cells/));
  });

  it('flags a block tile ref beyond the tile pool', () => {
    const d = validDoc();
    d.blocks[0].cells[0] = blockCell({ tile: 4 }); // pool holds tiles 0..3
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/tile 4 out of range 0\.\.3/));
  });

  it('flags a negative block tile ref (would wrap under the pack mask)', () => {
    const d = validDoc();
    d.blocks[0].cells[0] = blockCell({ tile: -1 });
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/tile -1 out of range 0\.\.3/));
  });

  it('flags a block cell pal out of range 0..3', () => {
    const d = validDoc();
    d.blocks[0].cells[0] = blockCell({ pal: 5 });
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/pal 5 out of range 0\.\.3/));
  });

  it('flags too many chunks (> 256)', () => {
    const d = validDoc();
    d.chunks = Array.from({ length: 257 }, () => chunk());
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/too many chunks/));
  });

  it('flags a chunk without exactly 256 cells', () => {
    const d = validDoc();
    d.chunks[0].cells = d.chunks[0].cells.slice(0, 255);
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/exactly 256 cells/));
  });

  it('flags a chunk block ref > $3FF', () => {
    const d = validDoc();
    d.chunks[0].cells[0] = chunkCell({ block: 0x400 });
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/block ref 1024 out of range 0\.\.1023/),
    );
  });

  it('flags a chunk cell solidity out of range 0..3', () => {
    const d = validDoc();
    d.chunks[0].cells[0] = chunkCell({ solidity: 4 });
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/solidity 4 out of range 0\.\.3/));
  });

  it('flags fg width below 1', () => {
    const d = validDoc();
    d.fg = { width: 0, height: 2, cells: new Uint8Array(0) };
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/fg width 0 out of range 1\.\.64/));
  });

  it('flags fg width above 64', () => {
    const d = validDoc();
    d.fg = { width: 65, height: 2, cells: new Uint8Array(130) };
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/fg width 65 out of range 1\.\.64/),
    );
  });

  it('flags bg height above 8', () => {
    const d = validDoc();
    d.bg = { width: 4, height: 9, cells: new Uint8Array(36) };
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/bg height 9 out of range 1\.\.8/),
    );
  });

  it('flags a palette without exactly 4 lines', () => {
    const d = validDoc();
    d.palettes = d.palettes.slice(0, 3);
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/exactly 4 lines/));
  });

  it('flags a palette line without exactly 16 words', () => {
    const d = validDoc();
    d.palettes[1] = new Uint16Array(15);
    expect(validateLevelDoc(d)).toContainEqual(expect.stringMatching(/palette line 1 must have 16/));
  });

  it('flags an object id > $7F', () => {
    const d = validDoc();
    d.objects[0].id = 0x80;
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/object 0 id 128 out of range 0\.\.127/),
    );
  });

  it('flags an object subtype > $FF', () => {
    const d = validDoc();
    d.objects[0].subtype = 0x100;
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/subtype 256 out of range 0\.\.255/),
    );
  });

  it('flags an object x of $FFFF (the objpos terminator sentinel — not a real X)', () => {
    const d = validDoc();
    d.objects[0].x = 0xffff;
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/x 65535 out of range 0\.\.65534/),
    );
  });

  it('accepts the max encodable object x ($FFFE)', () => {
    const d = validDoc();
    d.objects[0].x = 0xfffe;
    expect(validateLevelDoc(d)).not.toContainEqual(
      expect.stringMatching(/object 0 x .* out of range/),
    );
  });

  it('flags a negative object x (would wrap under the pack mask)', () => {
    const d = validDoc();
    d.objects[0].x = -1;
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/x -1 out of range 0\.\.65534/),
    );
  });

  it('flags an object y > $0FFF', () => {
    const d = validDoc();
    d.objects[0].y = 0x1000;
    expect(validateLevelDoc(d)).toContainEqual(
      expect.stringMatching(/y 4096 out of range 0\.\.4095/),
    );
  });
});

// ---------------------------------------------------------------------------
// Real-file check: every s1disasm bg layout fits the chosen 64x8 bg limit.
// (skipIf-gated so CI without the disasm tree stays green.)
// ---------------------------------------------------------------------------

describe.skipIf(!fs.existsSync(`${S1DIR}/levels`))('real bg layouts fit the 64x8 bg limit', () => {
  const dir = `${S1DIR}/levels`;
  const bgFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /bg.*\.bin$/i.test(f))
    : [];

  it('found bg layout files', () => {
    expect(bgFiles.length).toBeGreaterThan(0);
  });

  for (const f of bgFiles) {
    it(`${f} is within 64 wide × 8 tall`, () => {
      const b = fs.readFileSync(`${dir}/${f}`);
      const width = b[0] + 1;
      const height = b[1] + 1;
      expect(width).toBeLessThanOrEqual(64);
      expect(height).toBeLessThanOrEqual(8);
    });
  }
});
