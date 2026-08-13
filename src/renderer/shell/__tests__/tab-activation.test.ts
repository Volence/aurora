import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  planLevelActivation, activateLevelTarget,
  __setActivationSaveForTest, __resetActivationSaveForTest,
} from '../tab-activation';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import type { ZoneActRef } from '../../../core/project/adapter';
import type { SaveClassicProjectResult } from '../../state/classic-save';

describe('planLevelActivation', () => {
  it('non-level ids and no-project plans are none', () => {
    expect(planLevelActivation({ tabId: 'home', engine: null, classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'none' });
    expect(planLevelActivation({ tabId: 'level:ghz:1', engine: null, classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'none' });
  });

  it('aeon level tabs always switch (all acts resident in memory — no loss possible)', () => {
    expect(planLevelActivation({ tabId: 'level:ehz:act1', engine: 'aeon', classicLoadedRef: null, classicDirty: false }))
      .toEqual({ kind: 'aeon-switch', zone: 'ehz', act: 'act1' });
  });

  it('classic: activating the already-loaded act is none', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:1', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: true,
    })).toEqual({ kind: 'none' });
  });

  it('classic: switching acts while clean opens directly', () => {
    expect(planLevelActivation({
      tabId: 'level:mz:2', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: false,
    })).toEqual({ kind: 'classic-open', zone: 'mz', act: 2 });
  });

  it('classic: switching acts while dirty requires confirmation (openAct discards edits)', () => {
    expect(planLevelActivation({
      tabId: 'level:mz:2', engine: 's1',
      classicLoadedRef: { zone: 'ghz', act: 1 }, classicDirty: true,
    })).toEqual({ kind: 'classic-confirm', zone: 'mz', act: 2 });
  });

  it('classic: first open (nothing loaded) opens directly even if dirty flag is somehow set', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:1', engine: 's1', classicLoadedRef: null, classicDirty: true,
    })).toEqual({ kind: 'classic-open', zone: 'ghz', act: 1 });
  });

  it('classic: a non-numeric act id is none (malformed / foreign id)', () => {
    expect(planLevelActivation({
      tabId: 'level:ghz:actX', engine: 's1', classicLoadedRef: null, classicDirty: false,
    })).toEqual({ kind: 'none' });
  });
});

// activateLevelTarget is the executor glue around planLevelActivation. It is
// intentionally not exhaustively covered (no jsdom, store-heavy) — this covers
// the specific bug the coordinator flagged: saveClassicProject never rejects,
// it encodes failure in its return value, so the confirm-flow's 'save' branch
// must check the result before falling through to openAct (which resets
// doc+dirty+undo and would otherwise destroy the edits "Save & switch" was
// meant to protect).
describe('activateLevelTarget (executor)', () => {
  const LOADED_REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };
  const TARGET_REF: ZoneActRef = { zone: 'mz', act: 2, label: 'Marble 2', available: true };
  let openActSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useClassicProjectStore.setState({ status: 'open', zoneTree: [LOADED_REF, TARGET_REF] } as never);
    openActSpy = vi.fn(async () => {});
    // A dirty act is already loaded, so any level tab for a DIFFERENT act plans
    // 'classic-confirm'. openAct is seamed via setState (fire-and-forget in the
    // executor) so tests can assert it was/was not reached without a real handle.
    useClassicLevelStore.setState({ ref: LOADED_REF, dirty: { tiles: true }, openAct: openActSpy } as never);
    useConfirmStore.getState().answer('cancel'); // clear any leftover pending request
  });

  afterEach(() => {
    __resetActivationSaveForTest();
    useConfirmStore.getState().answer('cancel');
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
  });

  it('save failure resolves false and does not open (edits are not discarded)', async () => {
    __setActivationSaveForTest(async (): Promise<SaveClassicProjectResult> => ({ kind: 'conflict', conflicts: ['levels/fg.bin'] }));
    const p = activateLevelTarget('level:mz:2');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);
    expect(openActSpy).not.toHaveBeenCalled();
  });

  it('save success resolves true and opens the target act', async () => {
    __setActivationSaveForTest(async (): Promise<SaveClassicProjectResult> => ({ kind: 'saved', count: 1 }));
    const p = activateLevelTarget('level:mz:2');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);
    expect(openActSpy).toHaveBeenCalledWith(TARGET_REF);
  });

  it("'cancel' resolves false without saving or opening", async () => {
    const saveSpy = vi.fn(async (): Promise<SaveClassicProjectResult> => ({ kind: 'saved', count: 1 }));
    __setActivationSaveForTest(saveSpy);
    const p = activateLevelTarget('level:mz:2');
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(openActSpy).not.toHaveBeenCalled();
  });

  it("'discard' resolves true and opens without saving", async () => {
    const saveSpy = vi.fn(async (): Promise<SaveClassicProjectResult> => ({ kind: 'saved', count: 1 }));
    __setActivationSaveForTest(saveSpy);
    const p = activateLevelTarget('level:mz:2');
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(openActSpy).toHaveBeenCalledWith(TARGET_REF);
  });

  it('a superseded flow aborts instead of racing its openAct in after a newer one', async () => {
    const saveSpy = vi.fn(async (): Promise<SaveClassicProjectResult> => ({ kind: 'saved', count: 1 }));
    __setActivationSaveForTest(saveSpy);
    const first = activateLevelTarget('level:mz:2'); // asks to confirm, left pending
    // A newer flow (re-activating the already-loaded act) runs to completion first.
    await activateLevelTarget('level:ghz:1');
    useConfirmStore.getState().answer('save');
    await expect(first).resolves.toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(openActSpy).not.toHaveBeenCalled();
  });
});
