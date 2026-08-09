import { describe, it, expect } from 'vitest';
import { createSection, createChunkDef, SECTION_TILES_WIDE } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import { buildStampCommand } from '../../src/core/editing/map-stamp';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

function seededSection() {
  const section = createSection(0, 'Test');
  section.collisionEdit = new Uint16Array(65536);
  section.collisionEditB = new Uint16Array(65536);
  return section;
}

const WORD_A = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
const WORD_B = packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' });

describe('buildStampCommand', () => {
  it('(a) writes a solid chunk cell word into collisionEdit and the distinct B word into collisionEditB, at all four sub-tile indices', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 4, 4); // 2x2 cells
    const cx = 1, cy = 0;
    const cellsW = chunk.widthTiles >> 1;
    chunk.collisionA[cy * cellsW + cx] = WORD_A;
    chunk.collisionB[cy * cellsW + cx] = WORD_B;

    const baseCol = 8, baseRow = 8;
    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    const sCellCol = baseCol / 2 + cx, sCellRow = baseRow / 2 + cy;
    const indices = cellTileIndices(sCellCol, sCellRow, SECTION_TILES_WIDE);
    expect(indices).toHaveLength(4);
    for (const idx of indices) {
      expect(section.collisionEdit![idx]).toBe(WORD_A);
      expect(section.collisionEditB![idx]).toBe(WORD_B);
    }
  });

  it('(b) a chunk air cell (word 0) clears a previously-solid destination cell', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 2, 2); // 1x1 cell, air by default
    const baseCol = 4, baseRow = 4;
    const indices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const idx of indices) {
      section.collisionEdit![idx] = WORD_A;
      section.collisionEditB![idx] = WORD_B;
    }

    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    for (const idx of indices) {
      expect(section.collisionEdit![idx]).toBe(0);
      expect(section.collisionEditB![idx]).toBe(0);
    }
  });

  it('(c) one history.undo restores nametable + both collision planes', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 2, 2);
    chunk.nametable[0] = 0x1234;
    chunk.collisionA[0] = WORD_A;
    chunk.collisionB[0] = WORD_B;

    const baseCol = 6, baseRow = 6;
    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);

    const origNt = section.tileGrid.nametable[ntIdx];
    const origA = cellIndices.map(i => section.collisionEdit![i]);
    const origB = cellIndices.map(i => section.collisionEditB![i]);

    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    expect(section.tileGrid.nametable[ntIdx]).toBe(0x1234);
    for (const i of cellIndices) {
      expect(section.collisionEdit![i]).toBe(WORD_A);
      expect(section.collisionEditB![i]).toBe(WORD_B);
    }

    history.undo(level);

    expect(section.tileGrid.nametable[ntIdx]).toBe(origNt);
    cellIndices.forEach((i, k) => {
      expect(section.collisionEdit![i]).toBe(origA[k]);
      expect(section.collisionEditB![i]).toBe(origB[k]);
    });
  });

  it('(d) artOnly leaves both planes untouched while art still lands', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 2, 2);
    chunk.nametable[0] = 0x5678;
    chunk.collisionA[0] = WORD_A;
    chunk.collisionB[0] = WORD_B;

    const baseCol = 10, baseRow = 10;
    const ntIdx = baseRow * SECTION_TILES_WIDE + baseCol;
    const cellIndices = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    const preA = cellIndices.map(i => section.collisionEdit![i]);
    const preB = cellIndices.map(i => section.collisionEditB![i]);

    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: true, description: 'stamp art only',
    });
    expect(cmd).not.toBeNull();
    history.execute(cmd!, level);

    expect(section.tileGrid.nametable[ntIdx]).toBe(0x5678);
    cellIndices.forEach((i, k) => {
      expect(section.collisionEdit![i]).toBe(preA[k]);
      expect(section.collisionEditB![i]).toBe(preB[k]);
    });
  });

  it('(e) footprint clamps at the section edge: no wrap, no throw, only in-bounds tiles/cells written', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 4, 4); // 2x2 cells
    // Fill every nametable slot and both planes with distinct nonzero data.
    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x100 + i;
    for (let i = 0; i < chunk.collisionA.length; i++) chunk.collisionA[i] = WORD_A;
    for (let i = 0; i < chunk.collisionB.length; i++) chunk.collisionB[i] = WORD_B;

    const baseCol = SECTION_TILES_WIDE - 2; // only the left 2-tile column of the chunk fits
    const baseRow = 8;

    expect(() => {
      const cmd = buildStampCommand({
        chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp edge',
      });
      expect(cmd).not.toBeNull();
      history.execute(cmd!, level);
    }).not.toThrow();

    // In-bounds column (c=0,1) landed.
    expect(section.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + baseCol]).toBe(0x100);
    expect(section.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + baseCol + 1]).toBe(0x101);
    // Out-of-bounds column never wrapped to col 0 of the section.
    expect(section.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + 0]).toBe(0);
    expect(section.tileGrid.nametable[(baseRow + 1) * SECTION_TILES_WIDE + 0]).toBe(0);

    // In-bounds cell (cx=0) landed in both planes.
    const inBoundsCell = cellTileIndices(baseCol / 2, baseRow / 2, SECTION_TILES_WIDE);
    for (const idx of inBoundsCell) {
      expect(section.collisionEdit![idx]).toBe(WORD_A);
      expect(section.collisionEditB![idx]).toBe(WORD_B);
    }
    // No wraparound into column 0's cell.
    const wrapCell = cellTileIndices(0, baseRow / 2, SECTION_TILES_WIDE);
    for (const idx of wrapCell) {
      expect(section.collisionEdit![idx]).toBe(0);
      expect(section.collisionEditB![idx]).toBe(0);
    }
  });

  it('(f) stamping a chunk identical to what is already there returns null', () => {
    const section = seededSection();
    const chunk = createChunkDef('c1', 'Chunk', 4, 4); // all-zero nametable + all-air planes, matches fresh section

    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 16, baseRow: 16, artOnly: false, description: 'stamp noop',
    });
    expect(cmd).toBeNull();
  });

  it('(g) unseeded section planes: collision children are silently omitted, the art child still builds', () => {
    // Deliberately NOT seededSection() -- collisionEdit/collisionEditB stay null,
    // pinning buildStampCommand's documented contract ("caller's contract to seed
    // first") so a future refactor can't accidentally turn this into a crash.
    const section = createSection(0, 'Test');
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();

    const chunk = createChunkDef('c1', 'Chunk', 2, 2);
    chunk.nametable[0] = 0x2222;
    chunk.collisionA[0] = WORD_A;
    chunk.collisionB[0] = WORD_B;

    const baseCol = 12, baseRow = 12;
    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp unseeded',
    });

    expect(cmd).not.toBeNull();
    expect(cmd!.commands).toHaveLength(1);
    expect(cmd!.commands[0].type).toBe('set-tiles');

    expect(() => history.execute(cmd!, level)).not.toThrow();
    expect(section.tileGrid.nametable[baseRow * SECTION_TILES_WIDE + baseCol]).toBe(0x2222);
    expect(section.collisionEdit).toBeUndefined();
    expect(section.collisionEditB).toBeUndefined();
  });
});
