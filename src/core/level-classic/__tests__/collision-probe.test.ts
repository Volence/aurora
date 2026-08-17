// THE COLLISION LOOKUP, as the engine performs it.
//
// Every field here answers a question the Collision panel asks on the user's
// behalf: which chunk am I standing on, which of its 256 cells, which block,
// which shape, and is any of it actually solid. The short-circuits are the
// interesting part — block 0 and solidity 0 each mean "no collision" for
// DIFFERENT reasons, and a panel that collapsed them would explain the wrong
// thing to someone hunting a hole in their level.

import { describe, it, expect } from 'vitest';
import { probeCollision } from '../collision-probe';
import type { LevelDoc } from '../model';

/** A 2x2-chunk act: layout row 0 = [chunk 1, air], row 1 = [air, air]. */
function doc(): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };   // top-left 16px cell: solid
  cells[1] = { block: 1, xf: false, yf: false, solidity: 0 };   // same block, NOT solid here
  cells[2] = { block: 0, xf: false, yf: false, solidity: 3 };   // blank block, solidity set
  return {
    chunks: [{ cells }],
    blocks: [{ cells: [] }, { cells: [] }],
    collision: {
      colind: new Uint8Array([0, 5]),
      shapes: { heights: [new Int8Array(16), new Int8Array(16)], angles: new Uint8Array([0, 0]) },
    },
    fg: { width: 2, height: 2, cells: new Uint8Array([1, 0, 0, 0]) },
    bg: { width: 2, height: 2, cells: new Uint8Array([0, 0, 0, 0]) },
  } as unknown as LevelDoc;
}

describe('probeCollision', () => {
  it('resolves a solid cell all the way to its shape', () => {
    const p = probeCollision(doc(), 0, 0);
    expect(p).toMatchObject({
      chunkId: 1, cellIndex: 0, blockId: 1, shapeIndex: 5, solidity: 3, collides: true,
    });
  });

  it('picks the right 16px cell inside the chunk', () => {
    // x=16 is the second cell of row 0; x=0,y=16 is the first cell of row 1.
    expect(probeCollision(doc(), 16, 0)?.cellIndex).toBe(1);
    expect(probeCollision(doc(), 0, 16)?.cellIndex).toBe(16);
  });

  it('reports air where the layout byte is 0', () => {
    // Second chunk column is air; there is no chunk to resolve.
    expect(probeCollision(doc(), 256, 0)).toMatchObject({ chunkId: 0, collides: false, reason: 'air' });
  });

  it('distinguishes the two ways a cell can be non-solid', () => {
    // Same block, solidity 0 → the engine's `btst` fails.
    expect(probeCollision(doc(), 16, 0)).toMatchObject({ collides: false, reason: 'solidity' });
    // Block 0 → short-circuits BEFORE solidity, even though solidity is set.
    expect(probeCollision(doc(), 32, 0)).toMatchObject({ collides: false, reason: 'block0' });
  });

  it('returns null outside the layout', () => {
    expect(probeCollision(doc(), -1, 0)).toBeNull();
    expect(probeCollision(doc(), 99999, 0)).toBeNull();
  });

  it('counts how much shares what — the numbers the panel warns with', () => {
    const p = probeCollision(doc(), 0, 0)!;
    // Chunk id 1 appears once in fg.cells. Block 1 is named by exactly TWO
    // chunk-definition cells (indices 0 and 1); every other cell names block 0.
    expect(p.chunkPlacements).toBe(1);
    expect(p.blockCells).toBe(2);
  });

  it('flags a loop-region cell without changing which chunk it reads', () => {
    // Bit 7 alone changes nothing: `.specialtile` masks to 7 bits and, unless
    // the PLAYER's loop bit is set, branches straight to .treatasnormal.
    const d = doc();
    d.fg.cells[0] = 0x81;                       // chunk 1, loop-flagged
    const p = probeCollision(d, 0, 0)!;
    expect(p.chunkId).toBe(1);
    expect(p.looping).toBe(true);
    expect(p.loopAmbiguous).toBe(false);        // only $28 is substituted
  });

  it('marks the $28 loop alias as unanswerable from level data', () => {
    // FindNearestTile swaps chunk $28 for $51 — but ONLY while the player is
    // behind the loop, which is runtime object state no editor can see. Two
    // possible answers, so the probe reports the ambiguity instead of picking.
    const d = doc();
    d.fg.cells[0] = 0x80 | 0x28;
    const p = probeCollision(d, 0, 0)!;
    expect(p.chunkId).toBe(0x28);
    expect(p.loopAmbiguous).toBe(true);
  });

  it('does not flag $28 when the cell is not in a loop region', () => {
    const d = doc();
    d.fg.cells[0] = 0x28;                       // no bit 7
    expect(probeCollision(d, 0, 0)!.loopAmbiguous).toBe(false);
  });

  it('reports the block-0 short-circuit even when solidity would allow it', () => {
    // Cell 16 (x=0,y=16) is block 0 AND solidity 0 — the ONE probe point where
    // the order of the two short-circuits is observable. See the plant step.
    expect(probeCollision(doc(), 0, 16)).toMatchObject({ reason: 'block0' });
  });
});
