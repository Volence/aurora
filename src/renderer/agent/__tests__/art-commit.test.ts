// The agent's commit reply. The planner is not re-litigated here — these assert
// the SHAPE the agent sees: a refusal that arrives as a result rather than a
// throw, and the appended chunks' ENGINE ids, which are the whole reason the
// reply exists (without them the agent has minted chunks it cannot name in a
// follow-up set_layout_region).

import { describe, it, expect } from 'vitest';
import { appendedEngineIds, replyFromPlanResult } from '../art-commit';
import type { CommitPlanResult, CommitRefusal } from '../../../core/art/classic-commit-plan';

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
    'blocks-exhausted': { kind: 'blocks-exhausted', needed: 1025, ceiling: 1024 },
    'chunks-exhausted': { kind: 'chunks-exhausted', needed: 128, ceiling: 127 },
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
    },
  );
});
