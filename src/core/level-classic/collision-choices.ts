// WHICH SHAPES TO OFFER, AND IN WHAT ORDER.
//
// The table is global across all six zones — 256 slots, ~247 distinct patterns
// — but any one zone uses a small fraction of it. Offering all 256 flat makes
// the picker a haystack; offering only the used ones makes the editor unable to
// express anything new. So: this zone's set first, marked, then the rest.
//
// Pure core — no store, no fs.

import type { LevelDoc } from './model';

export interface CollisionShapeChoice {
  index: number;
  /** True if some block OTHER THAN block 0 points colind at this shape. */
  usedInZone: boolean;
  /** How many blocks (block 0 excluded) point colind at this shape. */
  blocks: number;
  heights: Int8Array;
  angle: number;
}

/**
 * Every shape the doc's collision table defines, this zone's-used shapes
 * first (ascending by index), then the rest (ascending by index).
 *
 * Block 0's colind entry is NOT a use: FindFloor short-circuits on the blank
 * block before it ever reads solidity or colind, so a shape parked there can
 * never apply in game. Counting it would put a shape in the "used" group on
 * the strength of an entry that can never take effect.
 */
export function collisionShapeChoices(doc: LevelDoc): CollisionShapeChoice[] {
  const { colind, shapes } = doc.collision;

  const counts = new Map<number, number>();
  for (let blockId = 1; blockId < colind.length; blockId++) {
    const shapeIndex = colind[blockId];
    counts.set(shapeIndex, (counts.get(shapeIndex) ?? 0) + 1);
  }

  const used: CollisionShapeChoice[] = [];
  const rest: CollisionShapeChoice[] = [];
  for (let index = 0; index < shapes.heights.length; index++) {
    const blocks = counts.get(index) ?? 0;
    const choice: CollisionShapeChoice = {
      index,
      usedInZone: blocks > 0,
      blocks,
      heights: shapes.heights[index],
      angle: shapes.angles[index] ?? 0,
    };
    (choice.usedInZone ? used : rest).push(choice);
  }

  return [...used, ...rest];
}
