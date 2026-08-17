import { chunkIndexForId, type LevelDoc } from './model';

/**
 * Everything the Collision panel needs about one point of the FG plane.
 *
 * `reason` is why the point does NOT collide, and the three values are not
 * interchangeable: 'air' is a layout byte of 0 (no chunk at all), 'block0' is
 * the engine short-circuiting on the blank block BEFORE it tests solidity, and
 * 'solidity' is the `btst` failing on a real block. Someone hunting a hole in
 * their level needs to know which of the three they are looking at, because the
 * fix is different for each.
 */
export interface CollisionProbe {
  /** 1-based engine chunk id; 0 = air. */
  chunkId: number;
  /** Index into doc.chunks, or null for air. */
  chunkIndex: number | null;
  /** 0..255 within the chunk, row-major. */
  cellIndex: number;
  blockId: number;
  shapeIndex: number;
  solidity: number;
  collides: boolean;
  reason: 'air' | 'block0' | 'solidity' | null;
  /** How many layout cells stamp this chunk id, IN THIS ACT (FG plane). */
  chunkPlacements: number;
  /** How many chunk-DEFINITION cells, across every chunk, name this block. */
  blockCells: number;
  /**
   * The layout byte had bit 7 set — this cell is inside a looping region.
   *
   * On its own this changes nothing: `.specialtile` masks the id to 7 bits and,
   * unless the PLAYER's `sprite_looping_bit` is set, branches straight to
   * `.treatasnormal`. It is reported because it is the precondition for the one
   * case below.
   */
  looping: boolean;
  /**
   * This probe cannot be answered from level data alone.
   *
   * True only for a loop-flagged cell naming chunk **$28**, where FindNearestTile
   * substitutes chunk **$51** — but only while the player is behind the loop
   * (`btst #sprite_looping_bit,obRender(a0)`, lines 69-74 of
   * `_incObj/sub FindNearestTile & FindFloor & FindWall.asm`). Which of the two
   * chunks the engine reads therefore depends on RUNTIME OBJECT STATE that an
   * editor cannot see, so everything below — block, shape, solidity — is the
   * $28 answer and may not be the one the console uses.
   *
   * Reported rather than resolved, because picking either chunk would be a
   * confident answer to a question with two of them.
   */
  loopAmbiguous: boolean;
}

/** The one chunk id FindNearestTile substitutes behind a loop, and its target. */
export const LOOP_ALIAS = { from: 0x28, to: 0x51 } as const;

/**
 * Probe the FG plane at a level pixel. Returns null outside the layout.
 *
 * FG ONLY, deliberately: the engine reads collision from `v_lvllayout_fg` and
 * nothing else, so a BG probe would be a confident answer to a question the
 * console never asks.
 *
 * BOTH COUNTS UNDERSTATE ON PURPOSE, and callers must say so. `chunkPlacements`
 * scans this act's FG plane, but solidity is shared by every act that stamps the
 * chunk and one LevelDoc holds one act. `blockCells` counts chunk-definition
 * cells, not on-map positions — the real reach is each of those multiplied by
 * its chunk's placements. Presented unqualified, both read as smaller than the
 * blast radius they describe.
 */
export function probeCollision(doc: LevelDoc, x: number, y: number): CollisionProbe | null {
  if (x < 0 || y < 0) return null;
  const col = Math.floor(x / 256);
  const row = Math.floor(y / 256);
  if (col >= doc.fg.width || row >= doc.fg.height) return null;

  const raw = doc.fg.cells[row * doc.fg.width + col] ?? 0;
  // Bit 7 marks a looping region. Masking it off is what `.specialtile` itself
  // does first, and for every chunk but one that is the whole story — the
  // substitution below is the exception, and it is not resolvable from here.
  const chunkId = raw & 0x7f;
  const looping = (raw & 0x80) !== 0;
  const loopAmbiguous = looping && chunkId === LOOP_ALIAS.from;
  const cellIndex = (Math.floor((y % 256) / 16) * 16) + Math.floor((x % 256) / 16);

  let chunkPlacements = 0;
  for (const c of doc.fg.cells) if ((c & 0x7f) === chunkId) chunkPlacements++;

  const chunkIndex = chunkIndexForId(doc, chunkId);
  if (chunkIndex === null) {
    return {
      chunkId, chunkIndex: null, cellIndex, blockId: 0, shapeIndex: 0, solidity: 0,
      collides: false, reason: 'air', chunkPlacements, blockCells: 0,
      looping, loopAmbiguous,
    };
  }

  const cell = doc.chunks[chunkIndex]?.cells[cellIndex];
  const blockId = cell?.block ?? 0;
  const solidity = cell?.solidity ?? 0;
  const shapeIndex = doc.collision.colind[blockId] ?? 0;

  let blockCells = 0;
  for (const c of doc.chunks) for (const cc of c.cells) if (cc.block === blockId) blockCells++;

  // Engine order: block 0 short-circuits before the solidity test.
  const reason = blockId === 0 ? 'block0' : solidity === 0 ? 'solidity' : null;
  return {
    chunkId, chunkIndex, cellIndex, blockId, shapeIndex, solidity,
    collides: reason === null, reason, chunkPlacements, blockCells,
    looping, loopAmbiguous,
  };
}
