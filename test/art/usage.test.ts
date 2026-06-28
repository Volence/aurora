import { describe, it, expect } from 'vitest';
import { tileUsageCounts, paletteLineUsageCounts } from '../../src/core/art/usage';
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

describe('paletteLineUsageCounts', () => {
  it('counts how many tiles reference each palette line across the act', () => {
    const act = makeAct();
    const s0 = createSection(0, 'S0');
    const s1 = createSection(1, 'S1');
    act.sections[0] = s0;
    act.sections[1] = s1;

    // line 2 used three times, line 1 once, line 0 once (all tileIndex > 0 so word != 0)
    s0.tileGrid.nametable[0] = packNametableWord(5, 2, false, false, false);
    s0.tileGrid.nametable[1] = packNametableWord(6, 2, false, false, false);
    s1.tileGrid.nametable[2] = packNametableWord(7, 2, false, false, false);
    s1.tileGrid.nametable[3] = packNametableWord(8, 1, false, false, false);
    s1.tileGrid.nametable[4] = packNametableWord(9, 0, false, false, false);

    const counts = paletteLineUsageCounts(act);
    expect(counts.get(2)).toBe(3);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(0)).toBe(1);
    expect(counts.get(3) ?? 0).toBe(0);
  });

  it('skips empty words (word === 0) and null sections', () => {
    const act = makeAct();
    act.sections[3] = createSection(0, 'S0'); // all words zero
    expect(paletteLineUsageCounts(act).size).toBe(0);
  });
});
