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
import type { CommitCollisionApplied } from '../../core/art/commit-collision';
import { useClassicLevelStore, classicCommitCanvas, editableTileRange } from '../state/classicLevelStore';
import type { PixelBuffer } from '../../core/art/pixel-ops';

export type ArtCommitReply =
  | {
    ok: true;
    report: CommitReport;
    /**
     * What the collision toggle actually did, when it was on. NOT derivable
     * from `report`: `withCollision` leaves the report untouched by design
     * (canvas-commit-model.ts:68-79 says the preview needs both), so a reply
     * carrying only the report would tell an agent that
     * `blocksWithoutCollision: 5` blocks lack collision moments after four of
     * them were given $FF. `skippedOverhang` is the half that is still true —
     * blocks whose id is past the zone's colind table, which keep no shape
     * while their cells are stamped solid regardless.
     */
    collision?: CommitCollisionApplied;
    appendedChunkIds: number[];
    applied: boolean;
  }
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

/**
 * Turn a plan result into the agent reply. Applies only when told to.
 *
 * `collision` carries the zone's `colind.length` rather than being a bare flag,
 * so asking for collision without the table length is not expressible. It used
 * to be read off the store behind a `?? 0`, and 0 is not a harmless default:
 * every block id is then past the table, so every new block is SKIPPED while all
 * 256 appended cells are still stamped solid — solid ground over shapeless
 * blocks, which is the two-tier model's fall-through-the-floor case. Threading
 * it in also keeps this function free of store access, which is what lets the
 * node suite reach the ok-path at all.
 */
export function replyFromPlanResult(
  result: CommitPlanResult,
  opts: { apply: boolean; collision?: { colindLength: number } },
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

  // The report's OWN pre-commit chunk count. The STORE is the authority at apply
  // time — `classicCommitCanvas` pushes onto `doc.chunks.slice()`
  // (classicLevelStore.ts:1196) — so if the two ever disagreed this would be the
  // wrong answer. They cannot disagree here because planning and applying happen
  // in one synchronous call, and taking it from the plan is what keeps this
  // function store-free, which is what makes the ok-path testable in node.
  const before = result.plan.report.poolBefore.chunks;
  const collided = opts.collision
    ? withCollision(result.plan, opts.collision.colindLength)
    : null;
  const plan = collided ?? result.plan;

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
    ...(collided ? { collision: collided.applied } : {}),
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
  const opts = {
    apply: !input.dryRun,
    collision: input.collision ? { colindLength: ctx.doc.collision.colind.length } : undefined,
  };
  const cap = canvasChunkCapacity(input.pixels.width, input.pixels.height);
  // A REFUSAL, not a throw: "your pixels are too small" is an answer the caller
  // can act on, and a throw would reach the client as -32603 "internal error",
  // claiming Aurora broke. Stated explicitly rather than left to the planner,
  // which refuses the same case (`chunksWide < 1`) with a detail that never
  // mentions the 256px floor the caller has to clear.
  if (cap.total === 0) {
    return replyFromPlanResult({
      ok: false,
      refusal: {
        kind: 'region-out-of-bounds',
        detail: `${input.pixels.width}×${input.pixels.height} holds no whole 256×256 chunk`,
      },
    }, opts);
  }
  // A wrong-length `targets` is deliberately NOT guarded here. On this surface it
  // is a caller's argument, and the planner already answers it with exactly the
  // refusal written for it — 'target-count', carrying `expected`/`got` an agent
  // can retry from. The panel's equivalent guard exists because ITS targets are
  // machine-generated, so a mismatch there is an Aurora bug rather than a mistake.
  const result = planFromSnapshot({
    ...ctx,
    pixels: input.pixels,
    canvasPalette: input.canvasPalette,
    targets: input.targets ?? defaultTargets(cap.total),
    paletteResolution: input.paletteResolution ?? 'none',
    gridOrigin: input.gridOrigin,
  });
  return replyFromPlanResult(result, opts);
}
