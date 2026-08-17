// src/core/art/commit-collision.ts
//
// GIVING A COMMIT'S NEW ART COLLISION, as a transform over the plan.
//
// The commit report is a PREVIEW (CommitPlanView.tsx renders reportLines(plan.
// report) from the CanvasCommitPlan before anything is applied), so this folds
// into the same plan and the same undo step rather than chasing the commit
// with a second edit. `withCollision(plan)` returns a NEW plan — it must not
// mutate its input, because the view re-renders the untransformed plan when
// the toggle is off.
//
// WHAT GETS TOUCHED, and why nothing else does:
//   - blockWrites with colind === 0 AND no `blanked` flag are the newly-minted
//     blocks that inherited no collision. The flag matters: blockWrites also
//     carries RECLAIMED ids nothing took, written back as blank cells so their
//     stale defs stop holding pool tiles — those also have colind 0, are not
//     counted in blocksWithoutCollision, and are referenced by no live chunk
//     cell. Including them would make the toggle's preview count read higher
//     than the "N have none" line directly above it, and would hand flat
//     collision to a blank block that is invisible if anything ever points at
//     it again.
//   - chunkAppends cells are exactly the ones with no predecessor: the planner
//     sets `old?.solidity ?? 0` from `src?.cells[ci] ?? null`, and `src` is
//     null only when the region cell targeted no chunk file (an append). A
//     REPLACED chunk (chunkWrites) has a predecessor for all 256 cells, so its
//     solidity was inherited, not missing — touching it would silently make an
//     existing jump-through platform solid.
//   - within an appended chunk, only cells naming a non-zero block: block 0 is
//     the engine-blank block (S1's FindFloor short-circuits on id 0 before it
//     ever reads solidity), so giving it solidity is noise, not signal.

import type { CanvasCommitPlan } from './classic-commit-plan';

/**
 * The one collision shape a blind commit-time assignment may use.
 *
 * $FB..$FF are the five full-height shapes in Collision Array (Normal).bin —
 * height 16 in every column — but only $FF is flat (Angle Map.bin: $FF -> $FF
 * flat; $FB/$FC/$FD/$FE -> $E0/$20/$A0/$60, the 45° loop-corner family).
 * Picking "a full block" by height alone would hand new flat ground a
 * diagonal angle, and the player runs up a floor. Only $FF is safe to assign
 * without knowing what the art actually is.
 */
export const FLAT_SHAPE = 0xff;

/** Solidity plane value for "solid from every direction" (see ChunkCell.solidity). */
const SOLID_ALL = 3;

export interface CommitCollisionApplied { blocks: number; cells: number }

export type CommitPlanWithCollision = CanvasCommitPlan & { applied: CommitCollisionApplied };

/**
 * Returns a NEW plan where every collisionless new block gets FLAT_SHAPE and
 * every appended-chunk cell naming a non-zero block gets solidity `All`.
 * Replaced chunks (chunkWrites) are left exactly as planned — see header.
 */
export function withCollision(plan: CanvasCommitPlan): CommitPlanWithCollision {
  let blocks = 0;
  const blockWrites = plan.blockWrites.map((w) => {
    if (w.colind !== 0 || w.blanked) return w;
    blocks++;
    return { ...w, colind: FLAT_SHAPE };
  });

  let cellsChanged = 0;
  const chunkAppends = plan.chunkAppends.map((chunk) => ({
    cells: chunk.cells.map((c) => {
      if (c.block === 0) return c;
      cellsChanged++;
      return { ...c, solidity: SOLID_ALL };
    }),
  }));

  return {
    ...plan,
    blockWrites,
    chunkAppends,
    applied: { blocks, cells: cellsChanged },
  };
}
