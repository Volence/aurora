import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import { createChunkDef } from '../../src/core/model/s4-types';
import { createDoc, docFromChunk } from '../../src/core/art/composer-buffer';

describe('set-chunk with collision planes', () => {
  it('applies and undoes both word planes', () => {
    const chunk = createChunkDef('c1', 'C1', 16, 16);
    const level = { sections: [], chunkLibrary: [chunk] };
    const h = new EditHistory();
    const newA = new Uint16Array(64); newA[3] = 0x9001;
    const newB = new Uint16Array(64); newB[7] = 0x2042;
    h.execute({
      type: 'set-chunk', description: 't', sectionIndex: -1, chunkId: 'c1',
      oldNametable: new Uint16Array(256), newNametable: new Uint16Array(256),
      oldCollisionA: new Uint16Array(64), newCollisionA: newA,
      oldCollisionB: new Uint16Array(64), newCollisionB: newB,
    }, level);
    expect(chunk.collisionA[3]).toBe(0x9001);
    expect(chunk.collisionB[7]).toBe(0x2042);
    // A copy-paste bug writing plane A's payload into B would leave collisionB[3]
    // set (from newA) and collisionB[7] unset — guard against both.
    expect(chunk.collisionB[3]).toBe(0);
    expect(chunk.collisionA[7]).toBe(0);
    h.undo(level);
    expect(chunk.collisionA[3]).toBe(0);
    expect(chunk.collisionB[7]).toBe(0);
  });

  it('docFromChunk carries the planes; createDoc zero-fills them', () => {
    const chunk = createChunkDef('c1', 'C1', 16, 16);
    chunk.collisionA[5] = 0x1042;
    const doc = docFromChunk(chunk);
    expect(doc.collisionA[5]).toBe(0x1042);
    expect(createDoc(16, 16).collisionA.length).toBe(64);
  });
});
