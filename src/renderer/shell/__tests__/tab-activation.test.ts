import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  planLevelActivation, activateLevelTarget, requestCloseTab,
  __setSpriteModuleForTest,
  __setActivationSaveForTest, __resetActivationSaveForTest,
} from '../tab-activation';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useSessionStore } from '../../state/sessionStore';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useSpriteStore, openSpriteDoc } from '../../state/spriteStore';
import { documentHistoryHub } from '../../state/history-hub';
import { classicLevelTab, spriteDocTab } from '../tabs';
import { createBuffer } from '../../../core/art/pixel-ops';
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

// aeon-switch viewport persistence (Task 16): a USER switch snapshots the
// outgoing act's live viewport into its record and restores the incoming act's
// seeded view; the BOOT-restore dispatch passes skipViewSnapshot so it does NOT
// snapshot the loader-default act (viewStore holds the default, not user state —
// snapshotting would clobber that act's just-seeded viewport).
describe('activateLevelTarget aeon viewport snapshot/restore', () => {
  beforeEach(() => {
    useClassicProjectStore.getState().reset(); // status stays !== 'open' → engine is aeon
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    // A resident aeon project (project !== null) makes currentEngine() 'aeon';
    // start "viewing" act1.
    useProjectStore.setState({ project: {} as never, currentZoneId: 'ehz', currentActId: 'act1' });
  });

  afterEach(() => {
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useClassicProjectStore.getState().reset();
    useViewStore.setState({ vpX: 0, vpY: 0, zoom: 1 });
  });

  it('user switch snapshots the outgoing act and restores the incoming act', async () => {
    useWorkspaceStore.getState().seed({
      'level:ehz:act1': { view: { x: 1, y: 2, zoom: 1 } },
      'level:ehz:act2': { view: { x: 30, y: 40, zoom: 2 } },
    });
    // Live viewport while viewing act1 (distinct from its seeded record):
    useViewStore.setState({ vpX: 11, vpY: 22, zoom: 4 });

    await activateLevelTarget('level:ehz:act2');

    // act1's record now holds the LIVE snapshot, not its stale seeded value:
    expect(useWorkspaceStore.getState().viewFor('level:ehz:act1')).toEqual({ x: 11, y: 22, zoom: 4 });
    // viewStore restored to act2's seeded view:
    const v = useViewStore.getState();
    expect({ x: v.vpX, y: v.vpY, zoom: v.zoom }).toEqual({ x: 30, y: 40, zoom: 2 });
  });

  it('restore dispatch (skipViewSnapshot) leaves the outgoing act untouched', async () => {
    useWorkspaceStore.getState().seed({
      'level:ehz:act1': { view: { x: 1, y: 2, zoom: 1 } },
      'level:ehz:act2': { view: { x: 30, y: 40, zoom: 2 } },
    });
    useViewStore.setState({ vpX: 11, vpY: 22, zoom: 4 }); // loader default, not user state

    await activateLevelTarget('level:ehz:act2', { skipViewSnapshot: true });

    // act1's seeded record is NOT overwritten by the (default) viewStore state:
    expect(useWorkspaceStore.getState().viewFor('level:ehz:act1')).toEqual({ x: 1, y: 2, zoom: 1 });
    // Incoming act2's seeded view is still applied:
    const v = useViewStore.getState();
    expect({ x: v.vpX, y: v.vpY, zoom: v.zoom }).toEqual({ x: 30, y: 40, zoom: 2 });
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

// Closing a sprite-doc tab is now the ONLY sprite path that destroys work:
// switching tabs parks documents instead of discarding them. So every dirty
// sprite-doc close confirms — for a parked (background) document as much as the
// checked-out one — and the closed document's undo stack goes with it.
describe('requestCloseTab — sprite-doc documents', () => {
  const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
  const SPRITE_TAB = spriteDocTab('s1', '13', 'Signpost'); // 'doc:sprite:s1:13'
  const OTHER_SPRITE = spriteDocTab('s1', '28', 'Bridge');  // 'doc:sprite:s1:28'
  const FAKE_SOURCE = { basePath: '/p', relPath: 'X.nem' } as never;

  /** Open a document for `tabId` and check it out, optionally with a save-back
   *  target and a real edit (which sets unsavedEdits + fills its undo stack). */
  function openDoc(tabId: string, opts: { dirty?: boolean; artSource?: boolean } = {}): void {
    openSpriteDoc(tabId, { width: 16, height: 16 });
    useSpriteStore.getState().loadSprite([createBuffer(16, 16)], [], 8, 8);
    if (opts.artSource !== false) useSpriteStore.getState().setS1ArtSource(FAKE_SOURCE);
    if (opts.dirty) useSpriteStore.getState().clearCanvas();
  }

  beforeEach(() => {
    useSessionStore.getState().reset();
    useSpriteStore.getState().closeAll();
    useConfirmStore.getState().answer('cancel');
  });

  afterEach(() => {
    __setSpriteModuleForTest(null);
    useConfirmStore.getState().answer('cancel');
    useSessionStore.getState().reset();
    useSpriteStore.getState().closeAll();
  });

  it('closing a DIRTY sprite tab asks, and on discard drops the document and its stack', async () => {
    openDoc(SPRITE_TAB.id, { dirty: true });
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });
    expect(documentHistoryHub.historyFor(SPRITE_TAB.id).canUndo).toBe(true);

    const p = requestCloseTab(SPRITE_TAB.id);
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('discard');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
    expect(useSpriteStore.getState().isOpen(SPRITE_TAB.id)).toBe(false);
    expect(documentHistoryHub.has(SPRITE_TAB.id)).toBe(false);
    expect(useSpriteStore.getState().s1ArtSource).toBeNull(); // fell back to the untitled doc
  });

  it('cancelling leaves the tab open and the document untouched', async () => {
    openDoc(SPRITE_TAB.id, { dirty: true });
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });

    const p = requestCloseTab(SPRITE_TAB.id);
    useConfirmStore.getState().answer('cancel');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, SPRITE_TAB.id]);
    expect(useSpriteStore.getState().isDirty(SPRITE_TAB.id)).toBe(true);
    expect(useSpriteStore.getState().s1ArtSource).toBe(FAKE_SOURCE);
  });

  it('closing a CLEAN sprite tab drops it silently (no confirm)', async () => {
    openDoc(SPRITE_TAB.id); // checkout, but no edits
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });

    await requestCloseTab(SPRITE_TAB.id);

    expect(useConfirmStore.getState().request).toBeNull(); // never asked
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
    expect(useSpriteStore.getState().isOpen(SPRITE_TAB.id)).toBe(false);
  });

  it('closing a PARKED dirty sprite tab asks too, and leaves the checked-out one alone', async () => {
    // The regression this guards: the old close path only looked at the ONE
    // loaded sprite, so closing a background tab discarded its edits in silence.
    openDoc(OTHER_SPRITE.id, { dirty: true }); // parked below
    openDoc(SPRITE_TAB.id);                    // checked out, clean
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB, OTHER_SPRITE], activeId: SPRITE_TAB.id });

    const p = requestCloseTab(OTHER_SPRITE.id);
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('discard');
    await p;

    expect(useSpriteStore.getState().isOpen(OTHER_SPRITE.id)).toBe(false);
    expect(documentHistoryHub.has(OTHER_SPRITE.id)).toBe(false);
    expect(useSpriteStore.getState().activeDocId).toBe(SPRITE_TAB.id); // untouched
  });

  it('offers Save when the document has an art save-back target, and closes once it saves', async () => {
    openDoc(SPRITE_TAB.id, { dirty: true });
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });
    const saved: string[] = [];
    __setSpriteModuleForTest({
      saveSpriteDocArt: async (docId: string) => {
        saved.push(docId);
        useSpriteStore.getState().setUnsavedEdits(false); // what a real save does
      },
    });

    const p = requestCloseTab(SPRITE_TAB.id);
    expect(useConfirmStore.getState().request!.buttons.map((b) => b.key)).toEqual(['save', 'discard', 'cancel']);
    useConfirmStore.getState().answer('save');
    await p;

    expect(saved).toEqual([SPRITE_TAB.id]);
    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
    expect(useSpriteStore.getState().isOpen(SPRITE_TAB.id)).toBe(false);
  });

  it('a FAILED save aborts the close instead of discarding the edits', async () => {
    openDoc(SPRITE_TAB.id, { dirty: true });
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });
    // The real savers report failure as a toast, not a rejection — the document
    // simply stays dirty. Closing anyway would destroy what Save protected.
    __setSpriteModuleForTest({ saveSpriteDocArt: async () => {} });

    const p = requestCloseTab(SPRITE_TAB.id);
    useConfirmStore.getState().answer('save');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id, SPRITE_TAB.id]);
    expect(useSpriteStore.getState().isDirty(SPRITE_TAB.id)).toBe(true);
  });

  it('offers no Save for a document with nowhere to save back to', async () => {
    openDoc(SPRITE_TAB.id, { dirty: true, artSource: false });
    useSessionStore.setState({ tabs: [HOME, SPRITE_TAB], activeId: SPRITE_TAB.id });

    const p = requestCloseTab(SPRITE_TAB.id);
    expect(useConfirmStore.getState().request!.buttons.map((b) => b.key)).toEqual(['discard', 'cancel']);
    useConfirmStore.getState().answer('discard');
    await p;

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME.id]);
  });
});

// Task 11: a closed tab's undo stack is unreachable — disposing it stops the leak
// AND stops a reopened tab from inheriting the history of a document the user
// already threw away. The zone-art document is the exception: it is shared by
// every act tab of its zone.
describe('requestCloseTab — undo-stack disposal', () => {
  const HOME = { id: 'home', kind: 'home' as const, title: 'Home' };
  const GHZ1 = classicLevelTab({ zone: 'ghz', act: 1, label: 'GHZ 1', available: true });
  const GHZ2 = classicLevelTab({ zone: 'ghz', act: 2, label: 'GHZ 2', available: true });

  beforeEach(() => {
    useSessionStore.getState().reset();
    documentHistoryHub.clearAll();
    // No project open ⇒ activateLevelTarget plans 'none', so a promoted level tab
    // never blocks these closes.
    useClassicProjectStore.setState({ status: 'closed' } as never);
    useProjectStore.setState({ project: null } as never);
  });

  it('disposes the closed level tab\'s layout stack', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1], activeId: GHZ1.id });
    documentHistoryHub.historyFor(GHZ1.id);
    expect(documentHistoryHub.has(GHZ1.id)).toBe(true);

    await requestCloseTab(GHZ1.id);

    expect(documentHistoryHub.has(GHZ1.id)).toBe(false);
  });

  it('keeps the zone-art stack while another act tab of that zone is open', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ1, GHZ2], activeId: GHZ1.id });
    documentHistoryHub.historyFor('zoneart:ghz');

    await requestCloseTab(GHZ1.id);

    // Act 2 still shows this zone's art — throwing its undo away with act 1's tab
    // would silently drop history for edits still on screen.
    expect(documentHistoryHub.has('zoneart:ghz')).toBe(true);
  });

  it('disposes the zone-art stack when the LAST act tab of the zone closes', async () => {
    useSessionStore.setState({ tabs: [HOME, GHZ2], activeId: GHZ2.id });
    documentHistoryHub.historyFor('zoneart:ghz');

    await requestCloseTab(GHZ2.id);

    expect(documentHistoryHub.has('zoneart:ghz')).toBe(false);
  });
});
