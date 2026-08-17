// GIVING A COMMIT'S NEW ART COLLISION, as a transform over the plan.
//
// The commit report is a PREVIEW (CommitPlanView renders it from the plan, not
// from a result), so this folds into the same plan and the same undo step
// rather than chasing the commit with a second edit.
//
// $FF is not "a full block" chosen by height. Five shapes are full-height —
// $FB..$FF — and $FB..$FE carry 45°-family angles ($E0/$20/$A0/$60). Assigning
// one of those would give flat new ground a diagonal angle, so the player runs
// up a floor. Only $FF is flat.

import { describe, it, expect } from 'vitest';
import { withCollision, FLAT_SHAPE } from '../commit-collision';
import type { CanvasCommitPlan } from '../classic-commit-plan';

const block = (blockId: number, colind: number) => ({
  blockId, colind,
  def: { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
});
const cells = (spec: Array<{ block: number; solidity: number }>) => {
  const out = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  spec.forEach((s, i) => { out[i] = { block: s.block, xf: false, yf: false, solidity: s.solidity }; });
  return out;
};

const plan = (over: Partial<CanvasCommitPlan> = {}): CanvasCommitPlan => ({
  tileWrites: [],
  blockWrites: [block(10, 0), block(11, 7), block(12, 0)],
  chunkWrites: [{ chunkFileIndex: 3, def: { cells: cells([{ block: 5, solidity: 0 }]) } }],
  chunkAppends: [{ cells: cells([{ block: 9, solidity: 0 }, { block: 0, solidity: 0 }]) }],
  paletteWrites: null,
  report: {} as CanvasCommitPlan['report'],
  ...over,
}) as CanvasCommitPlan;

describe('withCollision', () => {
  it('gives every collisionless new block the FLAT shape', () => {
    const out = withCollision(plan(), 4096);
    expect(out.blockWrites.map((b) => b.colind)).toEqual([FLAT_SHAPE, 7, FLAT_SHAPE]);
  });

  it('uses $FF, not another full-height shape', () => {
    // $FB..$FE are full height too, and all four are 45° loop corners.
    expect(FLAT_SHAPE).toBe(0xff);
  });

  it('leaves inherited collision alone', () => {
    const out = withCollision(plan(), 4096);
    expect(out.blockWrites.find((b) => b.blockId === 11)!.colind).toBe(7);
  });

  it('makes appended chunks solid, but only where a block is named', () => {
    const out = withCollision(plan(), 4096);
    const c = out.chunkAppends[0].cells;
    expect(c[0].solidity).toBe(3);      // block 9 → solid from every direction
    expect(c[1].solidity).toBe(0);      // block 0 is blank; the engine skips it
    expect(c[2].solidity).toBe(0);      // untouched filler
  });

  it('does NOT touch replaced chunks', () => {
    // A replaced chunk has a predecessor for all 256 cells, so its solidity was
    // inherited rather than missing. Overwriting it would silently make an
    // existing jump-through platform solid.
    const out = withCollision(plan(), 4096);
    expect(out.chunkWrites[0].def.cells[0].solidity).toBe(0);
  });

  it('does not mutate the plan it was given', () => {
    const p = plan();
    withCollision(p, 4096);
    expect(p.blockWrites[0].colind).toBe(0);
    expect(p.chunkAppends[0].cells[0].solidity).toBe(0);
  });

  it('reports what it changed, so the view can say so before committing', () => {
    const out = withCollision(plan(), 4096);
    expect(out.applied).toEqual({ blocks: 2, cells: 1, skippedOverhang: 0 });
  });
});

describe('withCollision and reclaimed blanks', () => {
  it('does not give collision to a blanked reclaimed id', () => {
    // blockWrites carries two different things. Minted blocks that inherited
    // nothing have colind 0 — those are the point. But RECLAIMED ids nothing
    // took are also pushed, blanked, with colind 0, so their stale defs stop
    // holding pool tiles. They are referenced by no live chunk cell and are NOT
    // counted in blocksWithoutCollision, so treating them as minted would make
    // the toggle's preview read higher than the "N have none" line above it.
    const p = plan({
      blockWrites: [
        block(10, 0),
        { ...block(99, 0), blanked: true as const },
      ],
    });
    const out = withCollision(p, 4096);
    expect(out.blockWrites.find((b) => b.blockId === 10)!.colind).toBe(FLAT_SHAPE);
    expect(out.blockWrites.find((b) => b.blockId === 99)!.colind).toBe(0);
    expect(out.applied.blocks).toBe(1);
  });
});

describe('withCollision and the colind overhang', () => {
  it('does not stamp a shape into a block past the collision table', () => {
    // A zone can ship more blocks than its table has entries (GHZ: 439 vs 410),
    // and those ids resolve into the ADJACENT zone's table in ROM.
    // classicSetColind refuses to write them; the reclaim cursor can hand a
    // fresh drawing one, so this is the first path that could stamp a
    // deliberate value there. Skipped, and not counted as applied.
    const p = plan({ blockWrites: [block(5, 0), block(412, 0)] });
    const out = withCollision(p, 410);
    expect(out.blockWrites.find((b) => b.blockId === 5)!.colind).toBe(FLAT_SHAPE);
    expect(out.blockWrites.find((b) => b.blockId === 412)!.colind).toBe(0);
    expect(out.applied.blocks).toBe(1);
    expect(out.applied.skippedOverhang).toBe(1);
  });
});
