import { describe, it, expect } from 'vitest';
import {
  parseStrips, serializeStrips, STRIP_ROWS, STRIP_COLS, WIDE_STRIP_SIZE,
} from '../../src/core/formats/s4-strips';

function buildFile(): Uint8Array {
  // 256 columns x 776 bytes
  return new Uint8Array(STRIP_COLS * WIDE_STRIP_SIZE);
}

describe('s4-strips (engine wide-strip format)', () => {
  it('has the engine constants', () => {
    expect(STRIP_ROWS).toBe(256);
    expect(STRIP_COLS).toBe(256);
    expect(WIDE_STRIP_SIZE).toBe(776); // 512 NT + 128 collA + 128 collB + 8 pad
  });

  it('rejects undersized files', () => {
    expect(() => parseStrips(new Uint8Array(WIDE_STRIP_SIZE * 255))).toThrow(/too small/i);
  });

  it('parses nametable words column-major to row-major', () => {
    const data = buildFile();
    // column 3, row 5 -> word 0xA15B
    const off = 3 * WIDE_STRIP_SIZE + 5 * 2;
    data[off] = 0xA1; data[off + 1] = 0x5B;
    const grid = parseStrips(data);
    expect(grid.width).toBe(256);
    expect(grid.height).toBe(256);
    expect(grid.nametable[5 * 256 + 3]).toBe(0xA15B);
  });

  it('expands path-A collision bytes to both covered tile rows', () => {
    const data = buildFile();
    // column 7, collision cell 10 (tile rows 20 and 21) -> type 0x42
    const off = 7 * WIDE_STRIP_SIZE + 512 + 10;
    data[off] = 0x42;
    const grid = parseStrips(data);
    expect(grid.collision[20 * 256 + 7]).toBe(0x42);
    expect(grid.collision[21 * 256 + 7]).toBe(0x42);
  });

  it('reads path B into a separate collisionB layer (expanded to both tile rows)', () => {
    const data = buildFile();
    const off = 0 * WIDE_STRIP_SIZE + 512 + 128 + 0; // plane B, cell 0
    data[off] = 0x99;
    const grid = parseStrips(data);
    expect(grid.collision[0]).toBe(0);          // path A unaffected
    expect(grid.collisionB[0 * 256 + 0]).toBe(0x99); // path B, tile row 0
    expect(grid.collisionB[1 * 256 + 0]).toBe(0x99); // path B, tile row 1 (same cell)
  });

  it('serializes: plane B is a copy of plane A, pad is zero', () => {
    const grid = parseStrips(buildFile());
    grid.nametable[12 * 256 + 4] = 0x1234;
    grid.collision[30 * 256 + 9] = 0x07; // tile row 30 -> cell 15
    const out = serializeStrips(grid);
    expect(out.length).toBe(STRIP_COLS * WIDE_STRIP_SIZE);
    const colBase = 4 * WIDE_STRIP_SIZE;
    expect(out[colBase + 12 * 2]).toBe(0x12);
    expect(out[colBase + 12 * 2 + 1]).toBe(0x34);
    const col9 = 9 * WIDE_STRIP_SIZE;
    expect(out[col9 + 512 + 15]).toBe(0x07);        // plane A
    expect(out[col9 + 512 + 128 + 15]).toBe(0x07);  // plane B = copy
    for (let i = 0; i < 8; i++) expect(out[col9 + 512 + 256 + i]).toBe(0);
  });

  it('round-trips parse -> serialize -> parse', () => {
    const data = buildFile();
    for (let col = 0; col < 256; col += 17) {
      for (let row = 0; row < 256; row += 13) {
        const off = col * WIDE_STRIP_SIZE + row * 2;
        data[off] = (col ^ row) & 0xFF; data[off + 1] = (col + row) & 0xFF;
      }
    }
    const a = parseStrips(data);
    const b = parseStrips(serializeStrips(a));
    expect(b.nametable).toEqual(a.nametable);
    expect(b.collision).toEqual(a.collision);
  });
});
