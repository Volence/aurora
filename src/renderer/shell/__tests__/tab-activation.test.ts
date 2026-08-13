import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  planLevelActivation, activateLevelTarget, requestCloseTab,
  __setActivationSaveForTest, __resetActivationSaveForTest,
} from '../tab-activation';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useSessionStore } from '../../state/sessionStore';
import { classicLevelTab } from '../tabs';
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

// requestCloseTab (Task 13 fix): closing the ACTIVE tab promotes a neighbor
// (core closeTab's right-then-left-then-Home rule), and that promotion must
// pass through the SAME activation guard a click on the neighbor would — else
// a promoted classic level tab could silently swap the loaded doc out from
// under a dirty edit with no confirm.
describe('requestCloseTab', () => {
  const LOADED_REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };
  const TARGET_REF: ZoneActRef = { zone: 'mz', act: 2, label: 'Marble 2', available: true };
  const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
  const TAB_GHZ = classicLevelTab(LOADED_REF); // 'level:ghz:1'
  const TAB_MZ = classicLevelTab(TARGET_REF); // 'level:mz:2'
  let openActSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useSessionStore.getState().reset();
    useClassicProjectStore.setState({ status: 'open', zoneTree: [LOADED_REF, TARGET_REF] } as never);
    openActSpy = vi.fn(async () => {});
    useClassicLevelStore.setState({ ref: LOADED_REF, dirty: { tiles: true }, openAct: openActSpy } as never);
    useConfirmStore.getState().answer('cancel'); // clear any leftover pending request
  });

  afterEach(() => {
    __resetActivationSaveForTest();
    useConfirmStore.getState().answer('cancel');
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it('closing an inactive tab closes immediately without any confirm', async () => {
    useSessionStore.setState({ tabs: [HOME, TAB_GHZ, TAB_MZ], activeId: TAB_GHZ.id });
    await requestCloseTab(TAB_MZ.id);
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, TAB_GHZ.id]);
    expect(useSessionStore.getState().activeId).toBe(TAB_GHZ.id); // untouched — the active doc never changed
    expect(openActSpy).not.toHaveBeenCalled();
  });

  it('closing the active dirty classic level tab, neighbor is another level tab, cancel leaves it open', async () => {
    useSessionStore.setState({ tabs: [HOME, TAB_GHZ, TAB_MZ], activeId: TAB_GHZ.id });
    const p = requestCloseTab(TAB_GHZ.id);
    useConfirmStore.getState().answer('cancel');
    await p;
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, TAB_GHZ.id, TAB_MZ.id]);
    expect(useSessionStore.getState().activeId).toBe(TAB_GHZ.id);
    expect(openActSpy).not.toHaveBeenCalled();
  });

  it('closing the active dirty classic level tab, discard closes it and opens the promoted neighbor', async () => {
    useSessionStore.setState({ tabs: [HOME, TAB_GHZ, TAB_MZ], activeId: TAB_GHZ.id });
    const p = requestCloseTab(TAB_GHZ.id);
    useConfirmStore.getState().answer('discard');
    await p;
    expect(openActSpy).toHaveBeenCalledWith(TARGET_REF);
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, TAB_MZ.id]);
    expect(useSessionStore.getState().activeId).toBe(TAB_MZ.id);
  });

  it('closing the active tab with only Home remaining closes without any confirm', async () => {
    const TOOL_TAB = { id: 'tool:project-setup', kind: 'tool' as const, title: 'Project Setup' };
    useSessionStore.setState({ tabs: [HOME, TOOL_TAB], activeId: TOOL_TAB.id });
    await requestCloseTab(TOOL_TAB.id);
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
    expect(useSessionStore.getState().activeId).toBe(HOME.id);
    expect(openActSpy).not.toHaveBeenCalled();
  });
});
