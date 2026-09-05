import { describe, it, expect } from 'vitest';
import {
  readCollisionCell, readCollisionRegion, renderCollisionAscii, collisionCellGlyph,
  SECTION_CELLS_WIDE, SECTION_CELLS_HIGH, COLLISION_REGION_MAX_CELLS,
  GLYPH_AIR, GLYPH_UNKNOWN, GLYPH_MIXED, GLYPH_INERT, GLYPH_FULL, GLYPH_WALL,
  GLYPH_CEILING, GLYPH_SLOPE_UP_RIGHT, GLYPH_SLOPE_UP_LEFT, GLYPH_FLOOR,
} from '../../src/core/collision/collision-region-read';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import { COLLISION_CELL_UNOWNED_MASK } from '../../src/core/editing/collision-word';
import { validatePaintCollisionRect } from '../../src/core/agent/validation';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { CollisionProfileSet, CollisionProfile } from '../../src/core/collision/collision-model';

// ═══ WHY THESE ROWS AUTHOR THEIR OWN DESTINATIONS ═══
//
// Every cell in every shipped act holds ZERO in the collision word's unowned
// bits, and every Aurora writer that means "a cell" writes all four of its 8px
// sub-tiles. So a test that reads REAL content can only ever see a uniform cell
// with clean high bits — the two things this reader exists to be honest about
// are both invisible on real data. Each row below therefore constructs the
// condition it measures, deliberately, and says so.

const width = 8; // an 8-tile-wide plane = 4x4 cells

/** A plane where one cell's four sub-tiles have been written INDEPENDENTLY —
 *  which is what `project/aeon/load.ts` does when it copies the baked strips
 *  one 8px tile at a time, and what a hand-made .collattr.bin can express. */
function planeWithMixedCell(cellCol: number, cellRow: number, four: number[]): Uint16Array {
  const plane = new Uint16Array(width * width);
  cellTileIndices(cellCol, cellRow, width).forEach((idx, i) => { plane[idx] = four[i]; });
  return plane;
}

function uniform(plane: Uint16Array, cellCol: number, cellRow: number, word: number): void {
  for (const idx of cellTileIndices(cellCol, cellRow, width)) plane[idx] = word;
}

/** A profile set built from explicit height arrays — the glyph rules are about
 *  geometry, so the fixture is geometry. Index 0 is air by convention. */
function profileSet(heights: number[][]): CollisionProfileSet {
  const air: CollisionProfile = {
    heights: new Int8Array(16), angle: 0, hasAngle: false, solidity: 'none',
  };
  const profiles: CollisionProfile[] = [air, ...heights.map((h) => ({
    heights: Int8Array.from(h), angle: 0, hasAngle: true, solidity: 'all' as const,
  }))];
  return { profiles, engine: 'test', solidCount: profiles.length };
}

describe('SECTION_CELLS_WIDE/HIGH', () => {
  // NOT `expect(SECTION_CELLS_WIDE).toBe(128)` — that would be the copied pin
  // this repo keeps paying for. The property is that the read's cell extent and
  // the WRITE's cell extent are the same space, so a rectangle one accepts the
  // other accepts. Driven through the real validator, at the boundary.
  it('is exactly the cell space validatePaintCollisionRect bounds a paint to', () => {
    const opts = { sectionCount: 1, cellsW: SECTION_CELLS_WIDE, cellsH: SECTION_CELLS_HIGH };
    expect(validatePaintCollisionRect(0, SECTION_CELLS_WIDE - 1, SECTION_CELLS_HIGH - 1, 1, 1, opts)).toBeNull();
    expect(validatePaintCollisionRect(0, SECTION_CELLS_WIDE, 0, 1, 1, opts)).not.toBeNull();
    expect(validatePaintCollisionRect(0, 0, SECTION_CELLS_HIGH, 1, 1, opts)).not.toBeNull();
  });

  it('addresses every tile index a section plane holds, and no more', () => {
    // The last cell's bottom-right sub-tile must be the plane's last index.
    const last = cellTileIndices(SECTION_CELLS_WIDE - 1, SECTION_CELLS_HIGH - 1, SECTION_TILES_WIDE);
    expect(Math.max(...last)).toBe(SECTION_TILES_WIDE * SECTION_TILES_HIGH - 1);
  });

  it('a whole section needs more than one max-size read (the limit is real)', () => {
    expect(SECTION_CELLS_WIDE * SECTION_CELLS_HIGH).toBeGreaterThan(COLLISION_REGION_MAX_CELLS);
  });
});

describe('readCollisionCell: the four sub-tiles', () => {
  it('reports a uniform cell as its word, unpacked, with no mixed/sub fields', () => {
    const plane = new Uint16Array(width * width);
    const word = packCollisionCell({ shape: 5, xFlip: true, yFlip: false, solidity: 'top' });
    uniform(plane, 1, 1, word);
    const cell = readCollisionCell(plane, 1, 1, width, null);
    expect(cell.word).toBe(word);
    expect(cell.mixed).toBeUndefined();
    expect(cell.sub).toBeUndefined();
    expect(cell).toMatchObject({ shape: 5, xFlip: true, yFlip: false, solidity: 'top' });
  });

  it('DOES NOT SAMPLE a disagreeing cell: word is null, all four are reported', () => {
    // THE CENTRAL CLAIM. The top-left sub-tile is a perfectly plausible answer
    // and is exactly what OverlayRenderer.drawCollisionOverlay draws; a reader
    // that returned it would be green on every real act and silently wrong here.
    const a = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'all' });
    const b = packCollisionCell({ shape: 9, xFlip: false, yFlip: false, solidity: 'all' });
    const plane = planeWithMixedCell(2, 0, [a, a, a, b]);
    const cell = readCollisionCell(plane, 2, 0, width, null);
    expect(cell.word).toBeNull();
    expect(cell.mixed).toBe(true);
    expect(cell.sub).toEqual([a, a, a, b]);
    // and it offers NO single unpacked answer to be mistaken for the cell
    expect(cell.shape).toBeUndefined();
    expect(cell.solidity).toBeUndefined();
    expect(cell.xFlip).toBeUndefined();
  });

  it('a disagreement in ANY of the four is caught (not just the last)', () => {
    const a = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'all' });
    const b = packCollisionCell({ shape: 4, xFlip: false, yFlip: false, solidity: 'all' });
    for (const pos of [0, 1, 2, 3]) {
      const four = [a, a, a, a];
      four[pos] = b;
      const cell = readCollisionCell(planeWithMixedCell(0, 0, four), 0, 0, width, null);
      expect(cell.mixed, `sub-tile ${pos} differing must be caught`).toBe(true);
    }
  });

  it('a difference ONLY in the unowned bits still counts as mixed', () => {
    // The bits Aurora does not name are still bits: two sub-tiles that agree on
    // every field Aurora writes but differ in 15:14 are NOT the same cell, and
    // collapsing them would be the strip this reader is forbidden to do.
    const base = packCollisionCell({ shape: 7, xFlip: false, yFlip: false, solidity: 'all' });
    const high = (base | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    expect(high).not.toBe(base); // the fixture is real, not a no-op
    const cell = readCollisionCell(planeWithMixedCell(0, 0, [base, base, base, high]), 0, 0, width, null);
    expect(cell.mixed).toBe(true);
  });

  it('returns the RAW word: bits no Aurora field owns survive the read', () => {
    const base = packCollisionCell({ shape: 7, xFlip: false, yFlip: true, solidity: 'sides-bottom' });
    const word = (base | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    const plane = new Uint16Array(width * width);
    uniform(plane, 0, 0, word);
    const cell = readCollisionCell(plane, 0, 0, width, null);
    expect(cell.word).toBe(word);
    // and re-packing the unpacked view would have LOST them — the reason `word`
    // is carried separately at all.
    expect(packCollisionCell({
      shape: cell.shape!, xFlip: cell.xFlip!, yFlip: cell.yFlip!, solidity: cell.solidity!,
    })).not.toBe(word);
  });
});

describe('readCollisionRegion', () => {
  it('returns cells row-major and a flat words array that agree cell for cell', () => {
    const plane = new Uint16Array(width * width);
    const w1 = packCollisionCell({ shape: 1, xFlip: false, yFlip: false, solidity: 'all' });
    const w2 = packCollisionCell({ shape: 2, xFlip: false, yFlip: false, solidity: 'all' });
    uniform(plane, 0, 0, w1);
    uniform(plane, 1, 1, w2);
    const out = readCollisionRegion({
      plane: 'a', planeWords: plane, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(out.cells).toHaveLength(2);
    expect(out.cells[0]).toHaveLength(2);
    expect(out.words).toEqual([w1, 0, 0, w2]);
    expect(out.words).toEqual(out.cells.flat().map((c) => c.word));
    expect(out.mixedCells).toBe(0);
    expect(out.profilesLoaded).toBe(false);
  });

  it('counts mixed cells and puts null in words where they are', () => {
    const a = packCollisionCell({ shape: 3, xFlip: false, yFlip: false, solidity: 'all' });
    const b = packCollisionCell({ shape: 4, xFlip: false, yFlip: false, solidity: 'all' });
    const plane = planeWithMixedCell(1, 0, [a, b, a, a]);
    uniform(plane, 0, 0, a);
    const out = readCollisionRegion({
      plane: 'a', planeWords: plane, tileWidth: width, x: 0, y: 0, w: 2, h: 1,
      profiles: null, ascii: false,
    });
    expect(out.mixedCells).toBe(1);
    expect(out.words).toEqual([a, null]);
  });

  it('counts cells carrying unowned bits, including through a mixed cell', () => {
    const base = packCollisionCell({ shape: 2, xFlip: false, yFlip: false, solidity: 'all' });
    const high = (base | COLLISION_CELL_UNOWNED_MASK) & 0xFFFF;
    const plane = new Uint16Array(width * width);
    uniform(plane, 0, 0, high);                                   // uniform, carries them
    uniform(plane, 1, 0, base);                                   // uniform, clean
    cellTileIndices(0, 1, width).forEach((idx, i) => { plane[idx] = i === 3 ? high : base; }); // mixed, one sub carries them
    const out = readCollisionRegion({
      plane: 'a', planeWords: plane, tileWidth: width, x: 0, y: 0, w: 2, h: 2,
      profiles: null, ascii: false,
    });
    expect(out.cellsWithUnownedBits).toBe(2);
    expect(out.mixedCells).toBe(1);
  });

  it('omits ascii unless it is asked for', () => {
    const plane = new Uint16Array(width * width);
    const args = {
      plane: 'a' as const, planeWords: plane, tileWidth: width, x: 0, y: 0, w: 2, h: 2, profiles: null,
    };
    expect(readCollisionRegion({ ...args, ascii: false }).ascii).toBeUndefined();
    expect(typeof readCollisionRegion({ ...args, ascii: true }).ascii).toBe('string');
  });
});

describe('the ascii glyphs', () => {
  const FLAT_FULL = Array(16).fill(16);
  const RAMP_UP_RIGHT = Array.from({ length: 16 }, (_, i) => i + 1);
  const RAMP_UP_LEFT = Array.from({ length: 16 }, (_, i) => 16 - i);
  const WALL_LEFT = Array.from({ length: 16 }, (_, i) => (i < 8 ? 16 : 0));
  const CEILING = Array(16).fill(-4);
  const SHALLOW = Array(16).fill(4);
  const set = profileSet([FLAT_FULL, RAMP_UP_RIGHT, RAMP_UP_LEFT, WALL_LEFT, CEILING, SHALLOW]);
  const cellOf = (shape: number, solidity: 'all' | 'none' = 'all') => ({
    word: packCollisionCell({ shape, xFlip: false, yFlip: false, solidity }),
  });

  it('air is air whether or not tables are loaded', () => {
    expect(collisionCellGlyph({ word: 0 }, set)).toBe(GLYPH_AIR);
    expect(collisionCellGlyph({ word: 0 }, null)).toBe(GLYPH_AIR);
  });

  it('a mixed cell is loud, and is decided BEFORE the shape is looked at', () => {
    // The mixed cell's `word` is null, so any rule that reached the shape would
    // have to invent one. This row pins the ordering.
    expect(collisionCellGlyph({ word: null, mixed: true, sub: [1, 2, 3, 4] }, set)).toBe(GLYPH_MIXED);
  });

  it('a shape with no loaded tables reads unknown, not solid', () => {
    expect(collisionCellGlyph(cellOf(1), null)).toBe(GLYPH_UNKNOWN);
  });

  it('an out-of-range shape index reads unknown', () => {
    expect(collisionCellGlyph(cellOf(set.solidCount + 5), set)).toBe(GLYPH_UNKNOWN);
  });

  it('solidity=none is marked as inert even though the shape is real', () => {
    // The distinction a loop check lives or dies on: a cell that stops nothing.
    expect(collisionCellGlyph(cellOf(1, 'none'), set)).toBe(GLYPH_INERT);
  });

  it('reads the six geometries apart', () => {
    expect(collisionCellGlyph(cellOf(1), set)).toBe(GLYPH_FULL);
    expect(collisionCellGlyph(cellOf(2), set)).toBe(GLYPH_SLOPE_UP_RIGHT);
    expect(collisionCellGlyph(cellOf(3), set)).toBe(GLYPH_SLOPE_UP_LEFT);
    expect(collisionCellGlyph(cellOf(4), set)).toBe(GLYPH_WALL);
    expect(collisionCellGlyph(cellOf(5), set)).toBe(GLYPH_CEILING);
    expect(collisionCellGlyph(cellOf(6), set)).toBe(GLYPH_FLOOR);
  });

  it('the word X-flip flips the glyph, because resolveCell flips the profile', () => {
    // Not a restatement of flipProfile: the point is that the READER honours the
    // flip bits rather than drawing the base shape, which is what an author who
    // mirrored half a loop would be looking at.
    const flipped = { word: packCollisionCell({ shape: 2, xFlip: true, yFlip: false, solidity: 'all' }) };
    expect(collisionCellGlyph(flipped, set)).toBe(GLYPH_SLOPE_UP_LEFT);
  });

  it('a loop is recognisable in the grid', () => {
    // THE POINT OF THE ascii VIEW, asserted as a picture rather than described.
    // Cell shapes: 1 full, 2 ramp-up-right, 3 ramp-up-left, 4 wall, 5 ceiling.
    const rows: number[][] = [
      [0, 5, 5, 0],
      [4, 0, 0, 4],
      [4, 0, 0, 4],
      [3, 1, 1, 2],
    ];
    const plane = new Uint16Array(width * width);
    rows.forEach((row, r) => row.forEach((shape, c) => {
      uniform(plane, c, r, shape === 0 ? 0
        : packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' }));
    }));
    const out = readCollisionRegion({
      plane: 'a', planeWords: plane, tileWidth: width, x: 0, y: 0, w: 4, h: 4,
      profiles: set, ascii: true,
    });
    // Row labels + the ones ruler are stripped here; the shape is the claim.
    const body = out.ascii!.split('\n').slice(1).map((l) => l.slice(2));
    expect(body).toEqual([
      '."".',
      '|..|',
      '|..|',
      '\\##/',
    ]);
  });

  it('the ruler carries ABSOLUTE cell coordinates, not 0-based ones', () => {
    const ascii = renderCollisionAscii(
      [[{ word: 0 }, { word: 0 }, { word: 0 }]], null, 9, 12,
    );
    const lines = ascii.split('\n');
    expect(lines[0]).toContain('1');    // tens ruler: cols 9,10,11 -> ' 11'
    expect(lines[1]).toContain('901');  // ones ruler, absolute
    expect(lines[2].startsWith('12 ')).toBe(true); // the row is 12, not 0
  });
});
