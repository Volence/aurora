import { describe, it, expect } from 'vitest';
import type { Section } from '../../src/core/model/s4-types';
import { createSection, MAX_ACT_SECTIONS } from '../../src/core/model/s4-types';
import {
  cloneSection,
  addSection,
  removeSection,
  resizeGrid,
  moveSection,
  pasteSection,
  type GridState,
} from '../../src/core/editing/section-ops';

/** Build a section with a recognizable nametable marker so identity/independence is checkable. */
function sec(index: number, marker: number): Section {
  const s = createSection(index, `Section ${index}`);
  s.tileGrid.nametable[0] = marker;
  s.tileGrid.collision[0] = marker & 0xff;
  s.objects.push({ x: 1, y: 2, typeId: 'ring-monitor', subtype: marker & 0xff });
  s.rings.push({ x: 3, y: 4 });
  return s;
}

function grid(w: number, h: number, fill: (flat: number) => Section | null): GridState {
  const sections: (Section | null)[] = [];
  for (let i = 0; i < w * h; i++) sections.push(fill(i));
  return { gridWidth: w, gridHeight: h, sections };
}

describe('cloneSection', () => {
  it('produces independent typed arrays and object/ring copies', () => {
    const src = sec(0, 0x1234);
    const clone = cloneSection(src, 5, 'Renamed');
    expect(clone.index).toBe(5);
    expect(clone.name).toBe('Renamed');
    expect(clone.tileGrid.nametable[0]).toBe(0x1234);
    // Independent arrays
    expect(clone.tileGrid.nametable).not.toBe(src.tileGrid.nametable);
    expect(clone.tileGrid.collision).not.toBe(src.tileGrid.collision);
    clone.tileGrid.nametable[0] = 0xffff;
    expect(src.tileGrid.nametable[0]).toBe(0x1234);
    // Independent object/ring arrays + elements
    expect(clone.objects).not.toBe(src.objects);
    expect(clone.objects[0]).not.toBe(src.objects[0]);
    clone.objects[0].x = 99;
    expect(src.objects[0].x).toBe(1);
  });

  it('keeps the original name when none is supplied', () => {
    const src = sec(0, 1);
    const clone = cloneSection(src, 2);
    expect(clone.name).toBe(src.name);
  });

  it('deep-clones tiles when present and leaves null as null', () => {
    const withTiles = sec(0, 1);
    withTiles.tiles = [{ pixels: new Uint8Array([1, 2, 3]) }];
    const c = cloneSection(withTiles, 1);
    expect(c.tiles).not.toBeNull();
    expect(c.tiles![0].pixels).not.toBe(withTiles.tiles[0].pixels);
    c.tiles![0].pixels[0] = 9;
    expect(withTiles.tiles[0].pixels[0]).toBe(1);

    const noTiles = sec(0, 1);
    expect(cloneSection(noTiles, 1).tiles).toBeNull();
  });
});

describe('addSection', () => {
  it('fills the first empty slot when no atIndex given', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 10) : null));
    const r = addSection(g);
    expect(r).not.toBeNull();
    expect(r!.gridWidth).toBe(2);
    expect(r!.gridHeight).toBe(2);
    expect(r!.sections[1]).not.toBeNull();
    expect(r!.sections[1]!.index).toBe(1);
    expect(r!.focusIndex).toBe(1);
    // original untouched
    expect(g.sections[1]).toBeNull();
  });

  it('fills the requested empty slot when atIndex is empty', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 10) : null));
    const r = addSection(g, 3);
    expect(r).not.toBeNull();
    expect(r!.sections[3]).not.toBeNull();
    expect(r!.focusIndex).toBe(3);
    // falls back from a requested-but-occupied? here slot 3 was empty so it stays
    expect(r!.sections[1]).toBeNull();
  });

  it('falls back to first empty slot when atIndex is occupied', () => {
    const g = grid(2, 2, (i) => (i <= 1 ? sec(i, 10 + i) : null));
    const r = addSection(g, 0); // slot 0 occupied -> first empty is 2
    expect(r!.focusIndex).toBe(2);
    expect(r!.sections[2]).not.toBeNull();
  });

  it('appends a row when the grid is full', () => {
    const g = grid(2, 2, (i) => sec(i, 10 + i));
    const r = addSection(g);
    expect(r).not.toBeNull();
    expect(r!.gridWidth).toBe(2);   // never grow width
    expect(r!.gridHeight).toBe(3);  // grew a row
    expect(r!.sections.length).toBe(6);
    // new section in first slot of new row
    expect(r!.sections[4]).not.toBeNull();
    expect(r!.sections[4]!.index).toBe(4);
    expect(r!.sections[5]).toBeNull();
    expect(r!.focusIndex).toBe(4);
  });

  it('returns null at the section cap', () => {
    // 48 slots, all full (e.g. 8x6 = 48)
    const g = grid(8, 6, (i) => sec(i, i));
    expect(g.sections.length).toBe(MAX_ACT_SECTIONS);
    expect(addSection(g)).toBeNull();
  });

  it('returns null when appending a row would exceed the cap', () => {
    // 8x5 = 40 full; a new row would be 8x6 = 48 (ok). Use a width where +row exceeds.
    // 7x6 = 42 full; +row = 7x7 = 49 > 48 -> null
    const g = grid(7, 6, (i) => sec(i, i));
    expect(addSection(g)).toBeNull();
  });
});

describe('removeSection', () => {
  it('nulls a populated slot', () => {
    const g = grid(2, 2, (i) => sec(i, 10 + i));
    const r = removeSection(g, 1);
    expect(r).not.toBeNull();
    expect(r!.sections[1]).toBeNull();
    expect(r!.sections[0]).not.toBeNull();
    // original untouched
    expect(g.sections[1]).not.toBeNull();
  });

  it('returns null for an already-empty slot', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 1) : null));
    expect(removeSection(g, 1)).toBeNull();
  });

  it('returns null for an out-of-range index', () => {
    const g = grid(2, 2, (i) => sec(i, i));
    expect(removeSection(g, -1)).toBeNull();
    expect(removeSection(g, 4)).toBeNull();
  });
});

describe('resizeGrid', () => {
  it('grows a column, preserving (col,row) positions and content', () => {
    // 2x2 grid, sections at flat 0,1,2,3 -> positions (0,0),(1,0),(0,1),(1,1)
    const g = grid(2, 2, (i) => sec(i, 100 + i));
    const r = resizeGrid(g, 3, 2);
    expect(r).not.toBeNull();
    expect(r!.gridWidth).toBe(3);
    expect(r!.gridHeight).toBe(2);
    expect(r!.sections.length).toBe(6);
    // (0,0) flat 0 -> flat 0
    expect(r!.sections[0]!.tileGrid.nametable[0]).toBe(100);
    // (1,0) flat 1 -> flat 1
    expect(r!.sections[1]!.tileGrid.nametable[0]).toBe(101);
    // (0,1) flat 2 (old) -> flat 3 (new width 3)
    expect(r!.sections[3]!.tileGrid.nametable[0]).toBe(102);
    // (1,1) flat 3 (old) -> flat 4
    expect(r!.sections[4]!.tileGrid.nametable[0]).toBe(103);
    // new column slots are empty
    expect(r!.sections[2]).toBeNull();
    expect(r!.sections[5]).toBeNull();
    // .index updated to new flat
    expect(r!.sections[3]!.index).toBe(3);
    expect(r!.sections[4]!.index).toBe(4);
  });

  it('remaps keepActive to its new flat position', () => {
    const g = grid(2, 2, (i) => sec(i, 100 + i));
    // active was old flat 3 = (1,1); new flat with width 3 = 1*3+1 = 4
    const r = resizeGrid(g, 3, 2, 3);
    expect(r!.focusIndex).toBe(4);
  });

  it('clamps keepActive to 0 when it falls outside the new grid', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 1) : null));
    // active = old flat 3 = (1,1); shrink to 2x1 -> row 1 gone -> clamp to 0
    const r = resizeGrid(g, 2, 1, 3);
    expect(r).not.toBeNull();
    expect(r!.focusIndex).toBe(0);
  });

  it('refuses to drop a non-null section off a shrunk edge', () => {
    // section at (1,1) flat 3; shrink to 2x1 drops row 1 -> null
    const g = grid(2, 2, (i) => (i === 3 ? sec(3, 9) : null));
    expect(resizeGrid(g, 2, 1)).toBeNull();
    // shrink width to drop column 1
    const g2 = grid(2, 2, (i) => (i === 1 ? sec(1, 9) : null));
    expect(resizeGrid(g2, 1, 2)).toBeNull();
  });

  it('allows shrinking when only empty slots are dropped', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 5) : null));
    const r = resizeGrid(g, 1, 1);
    expect(r).not.toBeNull();
    expect(r!.gridWidth).toBe(1);
    expect(r!.sections.length).toBe(1);
    expect(r!.sections[0]!.tileGrid.nametable[0]).toBe(5);
  });

  it('returns null for invalid dimensions and over-cap sizes', () => {
    const g = grid(2, 2, () => null);
    expect(resizeGrid(g, 0, 2)).toBeNull();
    expect(resizeGrid(g, 2, 0)).toBeNull();
    expect(resizeGrid(g, -1, 2)).toBeNull();
    expect(resizeGrid(g, 8, 7)).toBeNull(); // 56 > 48
  });
});

describe('moveSection', () => {
  it('swaps two populated slots and focuses to', () => {
    const g = grid(2, 2, (i) => sec(i, 100 + i));
    const r = moveSection(g, 0, 3);
    expect(r).not.toBeNull();
    expect(r!.sections[0]!.tileGrid.nametable[0]).toBe(103);
    expect(r!.sections[3]!.tileGrid.nametable[0]).toBe(100);
    expect(r!.sections[0]!.index).toBe(0);
    expect(r!.sections[3]!.index).toBe(3);
    expect(r!.focusIndex).toBe(3);
    // original untouched
    expect(g.sections[0]!.tileGrid.nametable[0]).toBe(100);
  });

  it('moves into an empty slot (one side null)', () => {
    const g = grid(2, 2, (i) => (i === 0 ? sec(0, 7) : null));
    const r = moveSection(g, 0, 3);
    expect(r).not.toBeNull();
    expect(r!.sections[0]).toBeNull();
    expect(r!.sections[3]!.tileGrid.nametable[0]).toBe(7);
    expect(r!.sections[3]!.index).toBe(3);
    expect(r!.focusIndex).toBe(3);
  });

  it('returns null when both slots are null', () => {
    const g = grid(2, 2, () => null);
    expect(moveSection(g, 0, 1)).toBeNull();
  });

  it('returns null for from===to or out-of-range', () => {
    const g = grid(2, 2, (i) => sec(i, i));
    expect(moveSection(g, 1, 1)).toBeNull();
    expect(moveSection(g, -1, 1)).toBeNull();
    expect(moveSection(g, 0, 4)).toBeNull();
  });
});

describe('pasteSection', () => {
  it('deep-clones the clip into a slot with independent typed arrays', () => {
    const g = grid(2, 2, () => null);
    const clip = sec(0, 0xabcd);
    const r = pasteSection(g, clip, 2);
    expect(r).not.toBeNull();
    expect(r!.sections[2]).not.toBeNull();
    expect(r!.sections[2]!.index).toBe(2);
    expect(r!.sections[2]!.tileGrid.nametable[0]).toBe(0xabcd);
    expect(r!.focusIndex).toBe(2);
    // Independence: mutating the pasted clone does NOT change the source clip
    r!.sections[2]!.tileGrid.nametable[0] = 0x1111;
    expect(clip.tileGrid.nametable[0]).toBe(0xabcd);
    expect(r!.sections[2]!.tileGrid.nametable).not.toBe(clip.tileGrid.nametable);
  });

  it('overwrites an occupied slot', () => {
    const g = grid(2, 2, (i) => sec(i, 50 + i));
    const clip = sec(0, 0x9999);
    const r = pasteSection(g, clip, 1);
    expect(r!.sections[1]!.tileGrid.nametable[0]).toBe(0x9999);
    expect(r!.sections[1]!.index).toBe(1);
    // original untouched
    expect(g.sections[1]!.tileGrid.nametable[0]).toBe(51);
  });

  it('returns null for an out-of-range slot', () => {
    const g = grid(2, 2, () => null);
    const clip = sec(0, 1);
    expect(pasteSection(g, clip, -1)).toBeNull();
    expect(pasteSection(g, clip, 4)).toBeNull();
  });
});
