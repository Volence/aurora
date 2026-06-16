import { describe, it, expect } from 'vitest';
import { tileUsageCounts } from '../../src/core/art/usage';
import { createSection, packNametableWord } from '../../src/core/model/s4-types';
import type { Act } from '../../src/core/model/s4-types';

function makeAct(): Act {
  return {
    id: 'act1',
    gridWidth: 4,
    gridHeight: 3,
    sections: new Array(12).fill(null),
    startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    bgLayout: null,
    bgTiles: null,
    parallaxRef: null,
  };
}

describe('tileUsageCounts', () => {
  it('counts tile usage across all sections of an act', () => {
    const act = makeAct();
    const s0 = createSection(0, 'S0');
    const s1 = createSection(1, 'S1');
    act.sections[0] = s0;
    act.sections[1] = s1;

    // Tile 5 used three times (two in section 0, one in section 1, with varied flags)
    s0.tileGrid.nametable[0] = packNametableWord(5, 0, false, false, false);
    s0.tileGrid.nametable[10] = packNametableWord(5, 2, true, false, true);
    s1.tileGrid.nametable[42] = packNametableWord(5, 1, false, true, false);

    // Tile 9 used once
    s1.tileGrid.nametable[100] = packNametableWord(9, 0, false, false, false);

    const counts = tileUsageCounts(act);
    expect(counts.get(5)).toBe(3);
    expect(counts.get(9)).toBe(1);
    expect(counts.has(7)).toBe(false);
  });

  it('skips empty words and null sections', () => {
    const act = makeAct();
    const s0 = createSection(0, 'S0');
    act.sections[3] = s0;
    // all words zero
    const counts = tileUsageCounts(act);
    expect(counts.size).toBe(0);
  });
});
