import { describe, it, expect } from 'vitest';
import { collisionPaintTargets } from '../../src/core/collision/collision-paint';

// A 4×4-cell section (8×8 tiles). Cell (cc,cr) covers tiles (2cc..2cc+1, 2cr..2cr+1).
// Give two cells the same 4 words so reuse has something to match.
function nametable8(): Uint16Array {
  const nt = new Uint16Array(8 * 8);
  const w = 8;
  const stamp = (cc: number, cr: number, v: number) => {
    const tc = cc * 2, tr = cr * 2;
    nt[tr * w + tc] = v; nt[tr * w + tc + 1] = v + 1;
    nt[(tr + 1) * w + tc] = v + 2; nt[(tr + 1) * w + tc + 1] = v + 3;
  };
  stamp(0, 0, 0x100); // cell (0,0)
  stamp(3, 3, 0x100); // cell (3,3) — identical block
  stamp(1, 1, 0x200); // cell (1,1) — different
  return nt;
}

const base = { nametable: nametable8(), width: 8, cellsW: 4, cellsH: 4 };

describe('collisionPaintTargets', () => {
  it('brush 1 + justHere → only the cell', () => {
    const { all } = collisionPaintTargets({ cellCol: 1, cellRow: 1, brush: 1, justHere: true, ...base });
    expect(all).toEqual([{ cellCol: 1, cellRow: 1 }]);
  });

  it('brush 1 default → every block with the same tiles (reuse)', () => {
    const { all } = collisionPaintTargets({ cellCol: 0, cellRow: 0, brush: 1, justHere: false, ...base });
    expect(all).toEqual(expect.arrayContaining([{ cellCol: 0, cellRow: 0 }, { cellCol: 3, cellRow: 3 }]));
    expect(all).toHaveLength(2);
  });

  it('brush 3 → 3×3 area centred on the cell', () => {
    const { all } = collisionPaintTargets({ cellCol: 1, cellRow: 1, brush: 3, justHere: false, ...base });
    expect(all).toHaveLength(9); // fully inside a 4×4 grid
  });

  it('brush 3 at a corner → clamped to the section bounds', () => {
    const { all } = collisionPaintTargets({ cellCol: 0, cellRow: 0, brush: 3, justHere: false, ...base });
    expect(all).toHaveLength(4); // only (0,0),(1,0),(0,1),(1,1)
  });

  it('primary is always the cursor cell', () => {
    const { primary } = collisionPaintTargets({ cellCol: 2, cellRow: 3, brush: 5, justHere: false, ...base });
    expect(primary).toEqual({ cellCol: 2, cellRow: 3 });
  });
});
