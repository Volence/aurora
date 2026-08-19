// The agent's commit reply. The planner is not re-litigated here — these assert
// the SHAPE the agent sees: a refusal that arrives as a result rather than a
// throw, and the appended chunks' ENGINE ids, which are the whole reason the
// reply exists (without them the agent has minted chunks it cannot name in a
// follow-up set_layout_region).

import { describe, it, expect } from 'vitest';
import { appendedEngineIds, replyFromPlanResult } from '../art-commit';
import type {
  CommitPlanResult, CommitRefusal, CommitReport,
} from '../../../core/art/classic-commit-plan';
import type { BlockDef, ChunkDef256 } from '../../../core/level-classic/model';

describe('appendedEngineIds', () => {
  // classicLevelStore.ts:1361 — newEngineId = nextChunks.length, i.e. file index + 1.
  it('is file index + 1, contiguous from the pre-commit chunk count', () => {
    expect(appendedEngineIds(40, 3)).toEqual([41, 42, 43]);
  });

  it('is empty when the commit only replaced chunks', () => {
    expect(appendedEngineIds(40, 0)).toEqual([]);
  });
});

describe('replyFromPlanResult', () => {
  it('returns a refusal as ok:false with the panel\'s own sentences', () => {
    const result: CommitPlanResult = {
      ok: false,
      refusal: { kind: 'tiles-exhausted', needed: 12, available: 4, reclaimed: 0, free: 4 },
    };
    const reply = replyFromPlanResult(result, { apply: false });
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.refusal.kind).toBe('tiles-exhausted');
    expect(reply.message).toMatch(/12 tiles/);
    expect(reply.resolution).toMatch(/Replace more chunks/);
    expect(reply.offers).toEqual([]);
  });

  it('names the palette resolutions that would unblock a palette-drift refusal', () => {
    const result: CommitPlanResult = {
      ok: false,
      refusal: { kind: 'palette-drift', entries: [5], touchesLine0: false },
    };
    const reply = replyFromPlanResult(result, { apply: false });
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.offers).toEqual(['use-act-colours', 'adopt-into-zone']);
  });

  // The planner's own suite proves refusals are RAISED (core/art/__tests__/
  // classic-commit-plan.test.ts covers region-misaligned, region-out-of-bounds,
  // target-count and cell-clash). What is unproven at that tier is that every
  // member of the union SURVIVES the trip to the agent — that none throws, and
  // none arrives without a sentence.
  //
  // The samples are a mapped type over CommitRefusal['kind'], so coverage is
  // enforced by the COMPILER, not by this list being kept in step by hand: a new
  // member of the union makes this object a type error until it is sampled here,
  // and a sample whose fields drift from its variant is a type error too.
  //
  // VARIANTS THAT SHARE A SHAPE DELIBERATELY SHARE A PAYLOAD (the three `detail`
  // ones; blocks/chunks-exhausted; the two palette ones). Same-shaped variants
  // are precisely the pair a copy-paste swaps, and distinct sample numbers would
  // hide it: the duplicated template would still interpolate to two different
  // strings and the distinct-messages test below would pass anyway. Verified by
  // planting exactly that swap — with the real ceilings (1025/1024 against
  // 128/127) it did not fail; with a shared payload it does.
  const SAMPLES: { [K in CommitRefusal['kind']]: Extract<CommitRefusal, { kind: K }> } = {
    'region-misaligned': { kind: 'region-misaligned', detail: 'x' },
    'region-out-of-bounds': { kind: 'region-out-of-bounds', detail: 'x' },
    'target-count': { kind: 'target-count', expected: 2, got: 1 },
    'target-invalid': { kind: 'target-invalid', detail: 'x' },
    'grid-origin': { kind: 'grid-origin', originX: 3, originY: 3 },
    'cell-clash': { kind: 'cell-clash', cells: [] },
    'palette-drift': { kind: 'palette-drift', entries: [1], touchesLine0: false },
    'palette-unmappable': { kind: 'palette-unmappable', entries: [1] },
    'predicates-unknown': { kind: 'predicates-unknown', which: ['reservedTiles'] },
    'tiles-exhausted': { kind: 'tiles-exhausted', needed: 2, available: 1, reclaimed: 0, free: 1 },
    'blocks-exhausted': { kind: 'blocks-exhausted', needed: 2, ceiling: 1 },
    'chunks-exhausted': { kind: 'chunks-exhausted', needed: 2, ceiling: 1 },
  };
  const ALL_REFUSALS: CommitRefusal[] = Object.values(SAMPLES);

  it.each(ALL_REFUSALS.map((r) => [r.kind, r] as const))(
    'turns a %s refusal into a result with a message, never a throw',
    (_kind, refusal) => {
      const reply = replyFromPlanResult({ ok: false, refusal }, { apply: false });
      expect(reply.ok).toBe(false);
      if (reply.ok) return;
      expect(reply.message.length).toBeGreaterThan(0);
      expect(reply.resolution.length).toBeGreaterThan(0);
      // BY IDENTITY, not by shape. The sentences are for a human reading the
      // agent's output; `refusal` is the half a caller SWITCHES on, and an agent
      // retrying from `expected`/`got` or `entries` needs the planner's own
      // object, not a summary of it that could quietly drop a field.
      expect(reply.refusal).toBe(refusal);
    },
  );

  // Each refusal explains ITSELF. A copy-pasted `refusalView` case that returns a
  // neighbour's view is invisible to the per-kind assertions above — every one of
  // them still sees a non-empty message — and would tell an agent the wrong thing
  // about why its commit stopped.
  it('gives all 12 refusals distinct messages', () => {
    const messages = new Set(ALL_REFUSALS.map((refusal) => {
      const reply = replyFromPlanResult({ ok: false, refusal }, { apply: false });
      return reply.ok ? '' : reply.message;
    }));
    expect(messages.size).toBe(ALL_REFUSALS.length);
    expect(messages.size).toBe(12);
  });
});

// The collision toggle. Reachable from node ONLY because `colindLength` is
// threaded in through `opts` rather than read off the store — which is also what
// removes the `?? 0` fallback that used to silently mean "every block id is
// overhang" whenever the store had no doc.
describe('replyFromPlanResult · collision', () => {
  const blockDef = (): BlockDef => ({
    cells: [
      { tile: 1, xf: false, yf: false, pal: 0, pri: false },
      { tile: 1, xf: false, yf: false, pal: 0, pri: false },
      { tile: 1, xf: false, yf: false, pal: 0, pri: false },
      { tile: 1, xf: false, yf: false, pal: 0, pri: false },
    ],
  });

  /** A chunk whose 256 cells all name `block` (0 = blank, which never gains solidity). */
  const chunkOf = (block: number): ChunkDef256 => ({
    cells: Array.from({ length: 256 }, () => ({ block, xf: false, yf: false, solidity: 0 })),
  });

  const report = (poolBeforeChunks: number): CommitReport => ({
    tilesNew: 0, tilesReused: 0, tilesReclaimed: 0,
    blocksNew: 2, blocksReused: 0, blocksReclaimed: 0, blocksZeroed: 0,
    chunksReplaced: 0, chunksAppended: 1,
    blocksInheritedCollision: 0, blocksWithoutCollision: 2,
    cellsInheritedSolidity: 0, cellsWithoutSolidity: 256,
    poolBefore: { tiles: 1, blocks: 100, chunks: poolBeforeChunks },
    poolAfter: { tiles: 1, blocks: 102, chunks: poolBeforeChunks + 1 },
    warnings: [],
  });

  /** Two collisionless new blocks (ids 400, 401) and one appended chunk of block 400. */
  const plan = (poolBeforeChunks = 40): CommitPlanResult => ({
    ok: true,
    plan: {
      tileWrites: [],
      blockWrites: [
        { blockId: 400, def: blockDef(), colind: 0 },
        { blockId: 401, def: blockDef(), colind: 0 },
      ],
      chunkWrites: [],
      chunkAppends: [chunkOf(400)],
      paletteWrites: null,
      report: report(poolBeforeChunks),
    },
  });

  it('reports what collision was actually applied when the toggle is on', () => {
    const reply = replyFromPlanResult(plan(), { apply: false, collision: { colindLength: 410 } });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    // Both blocks are inside the table, so both get FLAT_SHAPE; all 256 cells
    // name a non-zero block, so all 256 become solid.
    expect(reply.collision).toEqual({ blocks: 2, cells: 256, skippedOverhang: 0 });
  });

  it('omits the collision outcome when the toggle is off', () => {
    const reply = replyFromPlanResult(plan(), { apply: false });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.collision).toBeUndefined();
  });

  // THE SAFETY SIGNAL. A colind table shorter than the block ids means those
  // blocks keep colind 0 — while their cells are stamped solid regardless. Solid
  // cells over shapeless blocks is the two-tier model's fall-through-the-floor
  // case, so the count that says so must survive into the reply.
  it('counts blocks past the end of the colind table as skipped overhang', () => {
    const reply = replyFromPlanResult(plan(), { apply: false, collision: { colindLength: 401 } });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    // Block 400 is in range, block 401 is not (ids are 0-based against length).
    expect(reply.collision).toEqual({ blocks: 1, cells: 256, skippedOverhang: 1 });
  });

  it('names the appended chunks by engine id off the plan\'s own pre-commit count', () => {
    const reply = replyFromPlanResult(plan(40), { apply: false });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.appendedChunkIds).toEqual([41]);
    expect(reply.applied).toBe(false);
  });
});
