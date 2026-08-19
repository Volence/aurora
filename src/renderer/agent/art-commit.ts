// THE AGENT'S HALF OF COMMIT. Both `commit_canvas` and `import_art_sheet` are the
// same operation with different pixel sources, so the snapshot/plan/apply/reply
// path exists exactly once, here.
//
// TWO THINGS THIS OWNS, AND NOTHING ELSE DOES:
//
//   1. A refusal comes back as a RESULT, not a throw. The Aether adapter maps a
//      throw to ERR.INTERNAL (-32603), which claims the server broke; "this needs
//      12 tiles and 4 are free" is the answer the caller asked for. Throws are
//      reserved for genuine faults — no act open, canvas not found, bad bytes.
//   2. The appended chunks' 1-based ENGINE ids. `classicCommitCanvas` returns a
//      bare {ok:true}, so they are derived rather than plumbed: an engine id is
//      its file index + 1 (classicLevelStore.ts:1361).

import {
  planFromSnapshot, refusalView, defaultTargets, canvasChunkCapacity,
} from '../components/canvas/canvas-commit-model';
import type { CommitSnapshot, OfferedResolution } from '../components/canvas/canvas-commit-model';
import type {
  CommitPlanResult, CommitReport, CommitRefusal, CommitTarget, PaletteResolution,
} from '../../core/art/classic-commit-plan';
import { withCollision } from '../../core/art/commit-collision';
import { useClassicLevelStore, classicCommitCanvas, editableTileRange } from '../state/classicLevelStore';
import type { PixelBuffer } from '../../core/art/pixel-ops';

export type ArtCommitReply =
  | { ok: true; report: CommitReport; appendedChunkIds: number[]; applied: boolean }
  | { ok: false; refusal: CommitRefusal; message: string; resolution: string; offers: OfferedResolution[] };

/**
 * The engine ids a commit's appended chunks were given.
 *
 * An engine chunk id is its file index PLUS ONE — `classicAddChunk` computes
 * `newEngineId = nextChunks.length`, annotated at classicLevelStore.ts:1361 as
 * "file index (length-1) + 1 = length". So `count` chunks appended against a
 * pre-commit pool of `before` chunks occupy engine ids before+1 .. before+count.
 * Replaced chunks keep their existing ids and are not in this list.
 */
export function appendedEngineIds(before: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => before + i + 1);
}

/** Turn a plan result into the agent reply. Applies only when told to. */
export function replyFromPlanResult(
  result: CommitPlanResult,
  opts: { apply: boolean; collision?: boolean },
): ArtCommitReply {
  if (!result.ok) {
    const view = refusalView(result.refusal);
    return {
      ok: false,
      refusal: result.refusal,
      message: view.message,
      resolution: view.resolution,
      offers: view.offers,
    };
  }

  // The report's OWN pre-commit chunk count, not a second read of the store:
  // the plan was made against that pool, so deriving ids from anything else
  // would misname them the moment the two disagree.
  const before = result.plan.report.poolBefore.chunks;
  const plan = opts.collision
    ? withCollision(result.plan, useClassicLevelStore.getState().doc?.collision.colind.length ?? 0)
    : result.plan;

  if (opts.apply) {
    const res = classicCommitCanvas(plan);
    // A rejection HERE is a genuine fault: the planner is the authority on what
    // is legal, so the command re-validating and disagreeing means the two have
    // drifted. That is not an answer the caller can act on — it throws.
    if (!res.ok) throw new Error(`commit rejected after planning: ${res.error}`);
  }

  return {
    ok: true,
    report: plan.report,
    appendedChunkIds: appendedEngineIds(before, plan.chunkAppends.length),
    applied: opts.apply,
  };
}

/** The level half of a snapshot, read without React. Throws if no act is open. */
export function commitContextFromStores(): Pick<CommitSnapshot, 'doc' | 'reservedTiles' | 'range'> {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) throw new Error('no classic level is open');
  return { doc: s.doc, reservedTiles: s.reservedTiles ?? null, range: editableTileRange() };
}

/** Plan (and optionally apply) a commit of `pixels` into the open act. */
export function commitPixels(input: {
  pixels: PixelBuffer;
  canvasPalette: number[];
  gridOrigin?: { originX: number; originY: number };
  targets?: CommitTarget[];
  paletteResolution?: PaletteResolution;
  collision?: boolean;
  dryRun?: boolean;
}): ArtCommitReply {
  const ctx = commitContextFromStores();
  const cap = canvasChunkCapacity(input.pixels.width, input.pixels.height);
  if (cap.total === 0) {
    throw new Error(
      `these pixels hold no whole 256×256 chunk (${input.pixels.width}×${input.pixels.height})`,
    );
  }
  // A caller-supplied list of the wrong length would refuse as 'target-count',
  // which reads as a bug rather than as a mistake; say so plainly instead.
  if (input.targets && input.targets.length !== cap.total) {
    throw new Error(`targets must have ${cap.total} entries (got ${input.targets.length})`);
  }
  const result = planFromSnapshot({
    ...ctx,
    pixels: input.pixels,
    canvasPalette: input.canvasPalette,
    targets: input.targets ?? defaultTargets(cap.total),
    paletteResolution: input.paletteResolution ?? 'none',
    gridOrigin: input.gridOrigin,
  });
  return replyFromPlanResult(result, { apply: !input.dryRun, collision: input.collision });
}
