import { describe, it, expect } from 'vitest';
import {
  levelArtReservationRequests,
  buildReservedTileSet,
  type LevelArtReservationRequest,
} from '../s1-levelart-reservations';

// Synthetic mapping ASM text, in the same `spriteHeader`/`spritePiece` shape
// `parseAsmMappings` reads (see import/asm-mappings.ts + a real S1 _maps/*.asm
// file). Piece args: xpos, ypos, width, height, tile, xflip, yflip, pal, pri —
// width/height are in CELLS (1..4), confirmed against
// s1disasm/_maps/Platforms (GHZ).asm and model/sprite-types.ts.
const TWO_FRAME_MAP = `
Map_Test:	mappingsTable
	mappingsTableEntry.w	.frame0
	mappingsTableEntry.w	.frame1

.frame0:	spriteHeader
	spritePiece	0, 0, 2, 1, $10, 0, 0, 0, 0
.frame0_End

.frame1:	spriteHeader
	spritePiece	0, 0, 1, 2, $20, 0, 0, 0, 0
.frame1_End

	even
`;

describe('buildReservedTileSet', () => {
  it('expands a multi-frame, multi-cell mapping to the right index runs', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: 0, ids: [1] };
    const { tiles } = buildReservedTileSet([req], new Map([['test.asm', TWO_FRAME_MAP]]), 0x100);
    // frame0: piece at tile $10, 2x1 cells -> $10, $11
    // frame1: piece at tile $20, 1x2 cells -> $20, $21
    expect([...tiles].sort((a, b) => a - b)).toEqual([0x10, 0x11, 0x20, 0x21]);
  });

  it('shifts every index by tileBase', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: -0x10, ids: [1] };
    const { tiles } = buildReservedTileSet([req], new Map([['test.asm', TWO_FRAME_MAP]]), 0x100);
    expect([...tiles].sort((a, b) => a - b)).toEqual([0x00, 0x01, 0x10, 0x11]);
  });

  it('clamps away indices outside [0, poolTileCount)', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: 0, ids: [1] };
    // Pool only covers up to (not including) $20 -> frame1's $20/$21 both drop out.
    const { tiles } = buildReservedTileSet([req], new Map([['test.asm', TWO_FRAME_MAP]]), 0x20);
    expect([...tiles].sort((a, b) => a - b)).toEqual([0x10, 0x11]);
  });

  it('a negative shifted index is clamped away too', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: -0x1000, ids: [1] };
    const { tiles } = buildReservedTileSet([req], new Map([['test.asm', TWO_FRAME_MAP]]), 0x100);
    expect(tiles.size).toBe(0);
  });

  it('the frames filter restricts to the named frames', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: 0, frames: [1], ids: [1] };
    const { tiles } = buildReservedTileSet([req], new Map([['test.asm', TWO_FRAME_MAP]]), 0x100);
    expect([...tiles].sort((a, b) => a - b)).toEqual([0x20, 0x21]);
  });

  it('a mapping text missing from mapTextByPath contributes nothing', () => {
    const req: LevelArtReservationRequest = { mapAsm: 'missing.asm', tileBase: 0, ids: [1] };
    const { tiles } = buildReservedTileSet([req], new Map(), 0x100);
    expect(tiles.size).toBe(0);
  });

  it('byTile attributes each tile to every contributing object id', () => {
    // Two requests over the same file, different ids, both landing on frame0's
    // $10/$11 run — the overlap byTile must attribute to both ids.
    const reqA: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: 0, frames: [0], ids: [5] };
    const reqB: LevelArtReservationRequest = { mapAsm: 'test.asm', tileBase: 0, frames: [0], ids: [9] };
    const { byTile } = buildReservedTileSet(
      [reqA, reqB], new Map([['test.asm', TWO_FRAME_MAP]]), 0x100,
    );
    expect(byTile.get(0x10)).toEqual([5, 9]);
    expect(byTile.get(0x11)).toEqual([5, 9]);
  });
});

describe('levelArtReservationRequests — real S1 zone table', () => {
  // Pinned against s1-object-art.ts (verified by reading the real table, not
  // transcribed blind): every `lvl(...)` link in each zone's map, plus the two
  // supplemental engine-truth entries the id->art table cannot express.
  const cases: { zone: string; act: number; paths: string[] }[] = [
    { zone: 'ghz', act: 1, paths: ['_maps/Platforms (GHZ).asm', '_maps/Collapsing Ledge.asm'] },
    { zone: 'mz', act: 1, paths: ['_maps/MZ Large Grassy Platforms.asm', '_maps/MZ Bricks.asm'] },
    {
      zone: 'syz', act: 1,
      paths: [
        '_maps/Light.asm', '_maps/Platforms (SYZ).asm', '_maps/Floating Blocks and Doors.asm',
        '_maps/SYZ Boss Blocks.asm',
      ],
    },
    {
      zone: 'slz', act: 1,
      paths: [
        '_maps/Platforms (SLZ).asm', '_maps/Floating Blocks and Doors.asm',
        '_maps/SLZ Elevators.asm', '_maps/SLZ Circling Platform.asm', '_maps/Staircase.asm',
      ],
    },
    { zone: 'lz', act: 1, paths: ['_maps/SBZ Stomper and Door.asm'] },
    { zone: 'lz', act: 2, paths: ['_maps/SBZ Stomper and Door.asm'] },
    { zone: 'lz', act: 3, paths: ['_maps/SBZ Stomper and Door.asm'] },
    { zone: 'sbz', act: 1, paths: [] },
    { zone: 'sbz', act: 2, paths: [] },
    { zone: 'sbz', act: 3, paths: ['_maps/SBZ Stomper and Door.asm'] },
  ];

  for (const { zone, act, paths } of cases) {
    it(`${zone} act ${act}`, () => {
      const got = levelArtReservationRequests(zone, act).map((r) => r.mapAsm).sort();
      expect(got).toEqual([...paths].sort());
    });
  }

  it('the lz door entry cites object $6B, base 0x1F0, frame 0 only', () => {
    const reqs = levelArtReservationRequests('lz', 1);
    const door = reqs.find((r) => r.mapAsm === '_maps/SBZ Stomper and Door.asm');
    expect(door).toBeDefined();
    expect(door?.tileBase).toBe(0x1f0);
    expect(door?.frames).toEqual([0]);
    expect(door?.ids).toEqual([0x6b]);
  });

  it('the sbz-act-3 door entry matches the lz one exactly', () => {
    const a = levelArtReservationRequests('lz', 1).find((r) => r.mapAsm === '_maps/SBZ Stomper and Door.asm');
    const b = levelArtReservationRequests('sbz', 3).find((r) => r.mapAsm === '_maps/SBZ Stomper and Door.asm');
    expect(b).toEqual(a);
  });

  it('the syz boss-blocks entry cites object $76, base 0, all frames', () => {
    const reqs = levelArtReservationRequests('syz', 1);
    const boss = reqs.find((r) => r.mapAsm === '_maps/SYZ Boss Blocks.asm');
    expect(boss).toBeDefined();
    expect(boss?.tileBase).toBe(0);
    expect(boss?.frames).toBeUndefined();
    expect(boss?.ids).toEqual([0x76]);
  });

  it('derived requests use every frame (no frames filter) and zero tileBase', () => {
    for (const r of levelArtReservationRequests('ghz', 1)) {
      expect(r.frames).toBeUndefined();
      expect(r.tileBase).toBe(0);
    }
  });
});
