import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  planProjectOpen, confirmProjectOpen,
  __setOpenGuardSaveForTest, __resetOpenGuardSaveForTest,
} from '../project-open-guard';
import { useEditorStore } from '../../state/editorStore';
import { useSpriteStore, spriteHistory } from '../../state/spriteStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';

describe('planProjectOpen', () => {
  it('proceeds when nothing is dirty', () => {
    expect(planProjectOpen({ classicDirty: false, aeonDirty: false, spriteDirty: false }))
      .toEqual({ kind: 'proceed' });
  });
  it.each([
    ['classic level edits', { classicDirty: true, aeonDirty: false, spriteDirty: false }],
    ['aeon project edits', { classicDirty: false, aeonDirty: true, spriteDirty: false }],
    ['a dirty sprite (unsaved edits)', { classicDirty: false, aeonDirty: false, spriteDirty: true }],
  ] as const)('asks before opening over %s', (_label, snap) => {
    expect(planProjectOpen(snap)).toEqual({ kind: 'confirm' });
  });
});

// confirmProjectOpen — the ask→save→re-snapshot GLUE, extracted from
// useProject.openPath specifically so it's testable here (a node-only suite,
// no React hook / jsdom needed). Mirrors tab-activation.test.ts's pattern:
// drive useConfirmStore's pending ask directly, substitute the save seam.
describe('confirmProjectOpen', () => {
  const FAKE_ART_SOURCE = { basePath: '/old-project', relPath: 'artnem/Obj01.nem' } as never;

  beforeEach(() => {
    useClassicLevelStore.getState().reset();
    useEditorStore.getState().markClean();
    useSpriteStore.getState().setS1ArtSource(null);
    useSpriteStore.getState().setUnsavedEdits(false); // spriteDirty keys on this flag now
    spriteHistory.clear();
    useConfirmStore.getState().answer('cancel'); // clear any leftover pending request
  });

  afterEach(() => {
    __resetOpenGuardSaveForTest();
    useConfirmStore.getState().answer('cancel');
    useClassicLevelStore.getState().reset();
    useEditorStore.getState().markClean();
    useSpriteStore.getState().setS1ArtSource(null);
    useSpriteStore.getState().setUnsavedEdits(false);
    spriteHistory.clear();
  });

  it('resolves true immediately when nothing is dirty (no confirm asked)', async () => {
    await expect(confirmProjectOpen()).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it("'cancel' resolves false and leaves every store untouched", async () => {
    useEditorStore.setState({ dirty: true });
    useSpriteStore.getState().setS1ArtSource(FAKE_ART_SOURCE);
    const saveSpy = vi.fn(async () => ({ saved: [], skipped: [], failed: [] }));
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(useSpriteStore.getState().s1ArtSource).toEqual(FAKE_ART_SOURCE);
  });

  it('asks before opening over an edited aeon/new sprite (history, no checkout)', async () => {
    // An edited aeon/new sprite dots + blocks tab switches via canUndo but has no
    // s1ArtSource — the OLD s1ArtSource-only predicate would have silently
    // discarded it on open (finding 3). Now it must trigger the confirm.
    useSpriteStore.getState().clearCanvas(); // records an undo step; leaves s1ArtSource null
    expect(spriteHistory.canUndo).toBe(true);
    expect(useSpriteStore.getState().s1ArtSource).toBeNull();

    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull(); // a confirm was asked, not a silent proceed
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);

    // Discard must clear the history too, else the phantom-dirty trap recurs via canUndo.
    expect(spriteHistory.canUndo).toBe(false);
  });

  it("'discard' resolves true and clears aeon dirty + sprite checkout", async () => {
    useEditorStore.setState({ dirty: true });
    useSpriteStore.getState().setS1ArtSource(FAKE_ART_SOURCE);
    const saveSpy = vi.fn(async () => ({ saved: [], skipped: [], failed: [] }));
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useSpriteStore.getState().s1ArtSource).toBeNull();
  });

  it("'save' that leaves everything clean resolves true", async () => {
    useEditorStore.setState({ dirty: true });
    // The seam clears the dirtiness itself — confirmProjectOpen re-snapshots the
    // REAL store state afterward, it does not trust the save's return value.
    const saveSpy = vi.fn(async () => {
      useEditorStore.getState().markClean();
      return { saved: ['aeon-project'], skipped: [], failed: [] };
    });
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  it("'save' that leaves something still dirty resolves false and toasts an abort (no silent abort)", async () => {
    useEditorStore.setState({ dirty: true });
    const toastCountBefore = useToastStore.getState().toasts.length;
    // The seam runs but does NOT clear the dirty flag (mirrors a saver that
    // toasted its own failure and returned without throwing).
    const saveSpy = vi.fn(async () => ({ saved: [], skipped: [], failed: [{ id: 'aeon-project', message: 'disk full' }] }));
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);

    expect(useEditorStore.getState().dirty).toBe(true); // still dirty — not discarded
    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBe(toastCountBefore + 1);
    expect(toasts[toasts.length - 1]).toMatchObject({ type: 'error' });
    expect(toasts[toasts.length - 1].message).toMatch(/unsaved changes remain/i);
  });
});
