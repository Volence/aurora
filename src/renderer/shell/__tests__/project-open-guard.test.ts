import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  planProjectOpen, confirmProjectOpen,
  __setOpenGuardSaveForTest, __resetOpenGuardSaveForTest,
} from '../project-open-guard';
import { useEditorStore } from '../../state/editorStore';
import { useSpriteStore, activeSpriteHistory } from '../../state/spriteStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { openCanvasDoc, useCanvasStore, type CanvasSource } from '../../state/canvasStore';
import { resetProjectRuntime } from '../../state/project-runtime';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';

const CLEAN = { classicDirty: false, aeonDirty: false, spriteDirty: false, canvasDirty: false };

describe('planProjectOpen', () => {
  it('proceeds when nothing is dirty', () => {
    expect(planProjectOpen(CLEAN)).toEqual({ kind: 'proceed' });
  });
  it.each([
    ['classic level edits', { ...CLEAN, classicDirty: true }],
    ['aeon project edits', { ...CLEAN, aeonDirty: true }],
    ['a dirty sprite (unsaved edits)', { ...CLEAN, spriteDirty: true }],
    ['a dirty canvas (unsaved pixels)', { ...CLEAN, canvasDirty: true }],
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
    activeSpriteHistory().clear();
    useCanvasStore.getState().closeAll();
    useConfirmStore.getState().answer('cancel'); // clear any leftover pending request
  });

  afterEach(() => {
    __resetOpenGuardSaveForTest();
    useConfirmStore.getState().answer('cancel');
    useClassicLevelStore.getState().reset();
    useEditorStore.getState().markClean();
    useSpriteStore.getState().setS1ArtSource(null);
    useSpriteStore.getState().setUnsavedEdits(false);
    activeSpriteHistory().clear();
    useCanvasStore.getState().closeAll();
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
    expect(activeSpriteHistory().canUndo).toBe(true);
    expect(useSpriteStore.getState().s1ArtSource).toBeNull();

    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull(); // a confirm was asked, not a silent proceed
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);

    // Discard must clear the history too, else the phantom-dirty trap recurs via canUndo.
    expect(activeSpriteHistory().canUndo).toBe(false);
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

// A canvas document is discarded by resetProjectRuntime on a project switch, so
// the guard is the ONLY thing standing between a dirty canvas and silent data
// loss. Before these tests, planProjectOpen returned 'proceed' over a dirty
// canvas and the pixels went with no dialog and no toast — the exact failure
// this module's header says it exists to prevent, through a store that did not
// exist when it was written.
describe('confirmProjectOpen over a dirty canvas', () => {
  const CANVAS = 'doc:canvas:sky';

  function source(over: Partial<CanvasSource> = {}): CanvasSource {
    return {
      dir: '/old-project',
      pngPath: '.aurora/canvas/sky.png',
      sidecarPath: '.aurora/canvas/sky.canvas.json',
      pngMtimeMs: 1000, sidecarMtimeMs: 1000, sidecarRejected: false,
      ...over,
    };
  }

  /** An open canvas with unsaved pixels. `withSource` decides whether Save All
   *  could write it — the two cases get different copy on the abort path. */
  function dirtyCanvas(withSource: boolean): void {
    openCanvasDoc(CANVAS, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    if (withSource) useCanvasStore.getState().setSource(CANVAS, source());
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 2);
    useCanvasStore.getState().setPixels(CANVAS, buf);
  }

  beforeEach(() => { useCanvasStore.getState().closeAll(); });
  afterEach(() => { useCanvasStore.getState().closeAll(); });

  it('asks instead of proceeding, with no other store dirty', async () => {
    dirtyCanvas(true);
    const saveSpy = vi.fn(async () => ({ saved: [], skipped: [], failed: [] }));
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull(); // asked, not silently proceeded
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);

    // Cancel keeps the work: the document is still open and still dirty.
    expect(useCanvasStore.getState().isDirty(CANVAS)).toBe(true);
  });

  it("'discard' is what drops the documents — and it is reached only via the dialog", async () => {
    dirtyCanvas(true);
    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });

  it('the CLEAN path still ends the canvas session (the cross-project write hazard)', async () => {
    // Not dirty, but its CanvasSource.dir is the OLD project root, so a later
    // Ctrl+S would write across projects. Same reasoning as the sprite checkout.
    openCanvasDoc(CANVAS, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(CANVAS, source());
    expect(useCanvasStore.getState().isDirty(CANVAS)).toBe(false);

    await expect(confirmProjectOpen()).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull(); // no dialog — nothing was dirty
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });

  it("'save' that persists the canvas resolves true and then drops it", async () => {
    dirtyCanvas(true);
    const saveSpy = vi.fn(async () => {
      useCanvasStore.getState().markSaved(CANVAS, { pngMtimeMs: 2000, sidecarMtimeMs: 2000 });
      return { saved: ['canvas-doc'], skipped: [], failed: [] };
    });
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });

  it('a canvas with NO file target blocks the open and gets its own sentence', async () => {
    // Save All cannot write it (saveableDirtyCanvasDocIds filters it out), so the
    // re-snapshot re-fails forever. Aborting is right; telling this user to
    // "save it first" is a loop with no exit, so the copy must name Discard.
    dirtyCanvas(false);
    useToastStore.setState({ toasts: [] });
    const saveSpy = vi.fn(async () => ({ saved: [], skipped: [], failed: [] }));
    __setOpenGuardSaveForTest(saveSpy);

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);

    // Not discarded — the pixels are still there to discard deliberately.
    expect(useCanvasStore.getState().isDirty(CANVAS)).toBe(true);
    const msg = useToastStore.getState().toasts.at(-1)!.message;
    expect(msg).toMatch(/unsaved changes remain/i); // the generic half still applies
    expect(msg).toMatch(/no file yet/i);            // WHY save could not help
    expect(msg).toMatch(/discard/i);                // WHAT to do instead
  });

  it('a SAVEABLE canvas that failed to save gets the generic copy only', async () => {
    // The extra sentence must not fire for a canvas that Save All could have
    // written — otherwise it misdescribes an ordinary save failure.
    dirtyCanvas(true);
    useToastStore.setState({ toasts: [] });
    __setOpenGuardSaveForTest(vi.fn(async () => ({ saved: [], skipped: [], failed: [] })));

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);
    expect(useToastStore.getState().toasts.at(-1)!.message).not.toMatch(/no file yet/i);
  });

  it('end to end: nothing reaches resetProjectRuntime without the user saying so', async () => {
    // The whole chain the hole ran through — useProject.openPath gates on
    // confirmProjectOpen, and session-lifecycle calls resetProjectRuntime after.
    dirtyCanvas(true);
    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    // The open aborted, so the switch never happens and the document survives.
    expect(useCanvasStore.getState().isDirty(CANVAS)).toBe(true);

    // Only after a deliberate discard does the teardown run over nothing.
    const p2 = confirmProjectOpen();
    useConfirmStore.getState().answer('discard');
    await expect(p2).resolves.toBe(true);
    resetProjectRuntime();
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });
});
