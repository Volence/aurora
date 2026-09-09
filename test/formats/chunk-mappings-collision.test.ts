import { describe, it, expect } from 'vitest';
import { importChunks } from '../../src/core/formats/chunk-mappings';
import { kosinskiCompress } from '../../src/core/formats/kosinski';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import type { FullBlockShapeLookup } from '../../src/core/collision/full-block-shape';

const FB = 7; // stand-in full-block shape id for tests
/** `importChunks` takes the LOOKUP RESULT, not a shape id, so the two blind
 *  answers below cannot both arrive as 0 — ledger FULLBLOCK-ZERO-IS-TWO-ANSWERS. */
const FOUND: FullBlockShapeLookup = { status: 'found', shapeId: FB };

const BLOCKS_PER_CHUNK = 8;
const BYTES_PER_BLOCK = 8; // 2x2 tile words

/** Build a minimal one-block, one-chunk Kosinski fixture where every one of the
 *  64 block refs in the chunk is `blockRefWord` (blockIndex 0 in all cases, so
 *  the single defined block satisfies every ref). */
function buildFixture(blockRefWord: number): { chunkFileData: Uint8Array; blockFileData: Uint8Array } {
  // One block (index 0): arbitrary tile words, collision-irrelevant.
  const blockRaw = new Uint8Array(BYTES_PER_BLOCK); // all zero tile words
  // One chunk: 64 identical block-ref words.
  const chunkRaw = new Uint8Array(BLOCKS_PER_CHUNK * BLOCKS_PER_CHUNK * 2);
  for (let i = 0; i < BLOCKS_PER_CHUNK * BLOCKS_PER_CHUNK; i++) {
    chunkRaw[i * 2] = (blockRefWord >> 8) & 0xFF;
    chunkRaw[i * 2 + 1] = blockRefWord & 0xFF;
  }
  return {
    chunkFileData: kosinskiCompress(chunkRaw),
    blockFileData: kosinskiCompress(blockRaw),
  };
}

/** Build a fixture where every block ref is air (0x0000) except one solid
 *  (0x1000, solidAll) ref at (blockRow, blockCol) — for pinning down exactly
 *  which cell a given block ref lands in (uniform fixtures can't catch a
 *  row/col transposition). */
function buildSingleRefFixture(blockRow: number, blockCol: number): { chunkFileData: Uint8Array; blockFileData: Uint8Array } {
  const blockRaw = new Uint8Array(BYTES_PER_BLOCK);
  const chunkRaw = new Uint8Array(BLOCKS_PER_CHUNK * BLOCKS_PER_CHUNK * 2);
  const wordOffset = (blockRow * BLOCKS_PER_CHUNK + blockCol) * 2;
  chunkRaw[wordOffset] = 0x10;
  chunkRaw[wordOffset + 1] = 0x00;
  return {
    chunkFileData: kosinskiCompress(chunkRaw),
    blockFileData: kosinskiCompress(blockRaw),
  };
}

describe('importChunks seeds collision word planes from block-ref solidity', () => {
  it('solidAll bit (0x1000) yields solidity "all" on every cell', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x1000);
    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect(chunk.collisionA.length).toBe(64);
    const expected = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    expect([...chunk.collisionA].every(w => w === expected)).toBe(true);
  });

  it('solidTop bit (0x8000) yields solidity "top" on every cell', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x8000);
    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    const expected = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'top' });
    expect([...chunk.collisionA].every(w => w === expected)).toBe(true);
  });

  it('neither bit set yields word 0', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x0000);
    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect([...chunk.collisionA].every(w => w === 0)).toBe(true);
  });

  it('collisionB mirrors collisionA (donor format has no per-path split)', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x1000);
    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect([...chunk.collisionB]).toEqual([...chunk.collisionA]);
  });

  // ⚠ TWO ROWS WHERE THERE USED TO BE ONE, and that is the whole point of the
  // change under them. This was a single row passing `0`, because 0 was the one
  // value that meant BOTH "no profile set loaded" and "a real bank with no full
  // block". A row per fact is only expressible now that the argument is a
  // result; each names its own status, so narrowing the guard in
  // `blockRefToCollisionWord` to one of them reddens exactly one row.
  //
  // The CONTROL in each is the `expected` non-zero word: the same fixture with
  // a found lookup really does seed solid cells, so all-zero here is the guard
  // acting, not a fixture with no solidity bits in it.
  it('a NO-PROFILES lookup (could not look) yields all-zero planes regardless of solidity bits', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x1000);
    const expected = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const [control] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect([...control.collisionA].every(w => w === expected)).toBe(true);

    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', { status: 'no-profiles' });
    expect([...chunk.collisionA].every(w => w === 0)).toBe(true);
    expect([...chunk.collisionB].every(w => w === 0)).toBe(true);
  });

  it('a NO-FULL-BLOCK lookup (looked, bank has none) yields all-zero planes too', () => {
    const { chunkFileData, blockFileData } = buildFixture(0x1000);
    const expected = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const [control] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect([...control.collisionA].every(w => w === expected)).toBe(true);

    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', { status: 'no-full-block' });
    expect([...chunk.collisionA].every(w => w === 0)).toBe(true);
    expect([...chunk.collisionB].every(w => w === 0)).toBe(true);
  });

  it('places a single solid ref at the correct (blockRow, blockCol) index and nowhere else', () => {
    // Non-diagonal position: row 2, col 5 -> index 2*8+5 = 21. A row/col
    // transposition would put it at 5*8+2 = 42 instead.
    const blockRow = 2, blockCol = 5;
    const { chunkFileData, blockFileData } = buildSingleRefFixture(blockRow, blockCol);
    const [chunk] = importChunks(chunkFileData, blockFileData, 'Test', FOUND);
    expect(chunk.collisionA.length).toBe(64);
    const expected = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const expectedIndex = blockRow * BLOCKS_PER_CHUNK + blockCol;
    chunk.collisionA.forEach((w, i) => {
      if (i === expectedIndex) expect(w).toBe(expected);
      else expect(w).toBe(0);
    });
  });
});
