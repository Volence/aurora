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
import {
  resetProjectRuntime, ensureSaversRegistered,
  __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../../state/project-runtime';
import { useArtStore } from '../../state/artStore';
import { useProjectStore } from '../../state/projectStore';
import { createSection } from '../../../core/model/s4-types';
import { createDoc } from '../../../core/art/composer-buffer';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';

// `unsavable` and `anySavable` are REQUIRED fields of OpenDirtySnapshot, which is
// why every row below has to state them: the five-boolean snapshot conflated
// "dirty" with "dirty and savable", and the guard read it as the second — it
// offered Save as the primary over work no saver would touch. A producer that
// forgets now fails to compile rather than inheriting the dangerous default.
const CLEAN = {
  classicDirty: false, aeonDirty: false, spriteDirty: false, canvasDirty: false, artDirty: false,
  unsavable: [] as readonly string[], anySavable: false,
};

describe('planProjectOpen', () => {
  it('proceeds when nothing is dirty', () => {
    expect(planProjectOpen(CLEAN)).toEqual({ kind: 'proceed' });
  });
  it.each([
    ['classic level edits', { ...CLEAN, classicDirty: true, anySavable: true }],
    ['aeon project edits', { ...CLEAN, aeonDirty: true, anySavable: true }],
    ['a dirty sprite (unsaved edits)', { ...CLEAN, spriteDirty: true, anySavable: true }],
    ['a dirty canvas (unsaved pixels)', { ...CLEAN, canvasDirty: true, anySavable: true }],
    ['an unsaved aeon composer document', { ...CLEAN, artDirty: true, anySavable: true }],
  ] as const)('asks before opening over %s', (_label, snap) => {
    expect(planProjectOpen(snap)).toEqual({ kind: 'confirm', offerSave: true, unsavable: [] });
  });

  /**
   * THE OFFER IS PART OF THE PLAN. Save-and-open was unsatisfiable for a composer
   * drawing — no registered saver touched artStore and nothing cleared the flag —
   * so the dialog's primary button ran the savers, the re-snapshot read the same
   * dirt, and the guard aborted telling the user to save or discard first. The
   * plan now has to say whether Save can do anything at all.
   */
  it('a confirm over work NOTHING can save does not offer Save, and carries the reason', () => {
    const why = 'The art document "New Chunk" has no open zone and act to be saved into.';
    expect(planProjectOpen({ ...CLEAN, artDirty: true, unsavable: [why], anySavable: false }))
      .toEqual({ kind: 'confirm', offerSave: false, unsavable: [why] });
  });

  it('a MIXED confirm still offers Save, and still carries what Save cannot reach', () => {
    // A savable aeon project plus an unsavable document: Save is worth pressing
    // (it persists the project) and still cannot clear everything, so both facts
    // have to survive into the dialog.
    const why = 'X has no file yet, so Save cannot write it.';
    expect(planProjectOpen({
      ...CLEAN, aeonDirty: true, canvasDirty: true, unsavable: [why], anySavable: true,
    })).toEqual({ kind: 'confirm', offerSave: true, unsavable: [why] });
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

/**
 * R3. The aeon composer document (New Tile / Block / Chunk) keeps its strokes
 * in artStore alone — ComposerCanvas calls markOpenDirty() and records no
 * command, so editorStore.dirty stays false. It was in no dirty predicate and
 * in none of the three teardowns, so opening another project replaced it
 * outright with no dialog at all: the exact failure this module exists to
 * prevent, through the one store that was never joined to it.
 */
describe('confirmProjectOpen over an unsaved aeon composer document', () => {
  function dirtyComposer(): void {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null, name: 'New Chunk', dirty: false,
    });
    useArtStore.getState().markOpenDirty(); // what a stroke does
  }

  beforeEach(() => { useArtStore.getState().closeDocument(); });
  afterEach(() => { useArtStore.getState().closeDocument(); });

  it('asks instead of proceeding, with no other store dirty', async () => {
    dirtyComposer();
    const p = confirmProjectOpen();
    expect(useConfirmStore.getState().request).not.toBeNull();
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open?.dirty).toBe(true); // cancel keeps the work
  });

  it("'discard' drops the document", async () => {
    dirtyComposer();
    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('discard');
    await expect(p).resolves.toBe(true);
    expect(useArtStore.getState().open).toBeNull();
  });

  it('the CLEAN path still ends the composer session', async () => {
    // Its ComposerDoc is built from the OLD project's tiles, so a survivor
    // writes the previous project's art into the new one's atlas.
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: 4, chunkId: null, name: 'Tile $04', dirty: false,
    });
    await expect(confirmProjectOpen()).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
    expect(useArtStore.getState().open).toBeNull();
  });

  it('resetProjectRuntime closes it too', () => {
    dirtyComposer();
    resetProjectRuntime();
    expect(useArtStore.getState().open).toBeNull();
  });
});

/**
 * THE ROWS THAT ANSWER SAVE.
 *
 * Every art row above answers cancel or discard, and every save-branch row in
 * this file injects a fake saver that hardcodes the clean outcome — so nine
 * passing tests could not see that Save-and-open was UNSATISFIABLE for a
 * composer drawing. The SaveCoordinator had four savers, none of them touched
 * artStore, and nothing ever clears `open.dirty` on an existing entry, so
 * pressing the primary button ran the savers, re-snapshotted the same dirt, and
 * aborted with "save or discard them first" — advice whose only workable half
 * throws the drawing away.
 *
 * These rows answer SAVE, and the satisfiable one goes through the REAL registry
 * (`__resetOpenGuardSaveForTest` + `ensureSaversRegistered`) rather than a
 * hardcoded clean saver, because the registry's contents were the defect.
 */
describe('confirmProjectOpen: SAVE over an aeon composer document', () => {
  const KEYS = () => useConfirmStore.getState().request!.buttons.map((b) => b.key);

  function dirtyComposer(name = 'New Chunk'): void {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: null, name, dirty: false,
    });
    useArtStore.getState().markOpenDirty();
  }

  /** One zone, one act — the minimum `saveComposerDocument` needs to write into. */
  function aeonProjectOpen(): void {
    useProjectStore.setState({
      project: {
        zones: [{
          id: 'z', name: 'Z', tileset: { tiles: [] }, palette: { lines: [] },
          acts: [{
            id: 'a', name: 'A', gridWidth: 1, gridHeight: 1,
            sections: [createSection(0, 'sec0')],
          }],
        }],
        chunkLibrary: [],
        bgLibrary: [],
      } as never,
      currentZoneId: 'z',
      currentActId: 'a',
    });
  }

  beforeEach(() => {
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    ensureSaversRegistered();
    __resetRuntimeSaversForTest();
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => {
    useArtStore.getState().closeDocument();
    useProjectStore.getState().reset();
    useEditorStore.getState().markClean();
    __resetRuntimeSaversForTest();
    __resetOpenGuardSaveForTest();
    useConfirmStore.getState().answer('cancel');
  });

  it('with no project open, the dialog does not offer a Save that cannot work', async () => {
    // saveComposerDocument returns without writing when there is no zone/act, so
    // the primary button would be inert by construction. Offering it is the
    // defect; the body has to say why instead.
    dirtyComposer();
    const p = confirmProjectOpen();
    expect(KEYS()).toEqual(['discard', 'cancel']);
    const body = useConfirmStore.getState().request!.body!;
    expect(body).toMatch(/no open zone and act/i);   // WHY Save is absent
    expect(body).toMatch(/only ways out/i);          // so a missing primary is not a bug
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
    expect(useArtStore.getState().open?.dirty).toBe(true); // cancel keeps the drawing
  });

  it('SAVE on a savable drawing commits it through the real registry and proceeds', async () => {
    aeonProjectOpen();
    dirtyComposer();
    // The REAL saveAllDirty over the REAL saveCoordinator. Only the aeon leaf is
    // stubbed (it is the IPC write); `art-composer` is the saver under test.
    __resetOpenGuardSaveForTest();
    __setRuntimeSaversForTest({ aeon: async () => { useEditorStore.getState().markClean(); } });

    const p = confirmProjectOpen();
    expect(KEYS()).toEqual(['save', 'discard', 'cancel']); // Save is offered — it can work
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(true);

    // The drawing was COMMITTED, not thrown away: it is in the chunk library.
    expect(useProjectStore.getState().project!.chunkLibrary.map((c) => c.name))
      .toEqual(['New Chunk']);
    expect(useArtStore.getState().open).toBeNull(); // endDocumentSession ran after
  });

  it('CONTROL: neuter the composer saver and the SAME flow aborts', async () => {
    // Proves the row above measures the `art-composer` saver and not something
    // else in the pass: with its impl replaced by a no-op the guard is back to
    // the original defect — Save runs, the flag survives, the open aborts.
    aeonProjectOpen();
    dirtyComposer();
    __resetOpenGuardSaveForTest();
    __setRuntimeSaversForTest({
      aeon: async () => { useEditorStore.getState().markClean(); },
      artComposer: () => { /* the pre-fix world: nothing saves this store */ },
    });

    const p = confirmProjectOpen();
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);
    expect(useProjectStore.getState().project!.chunkLibrary).toEqual([]);
    expect(useArtStore.getState().open?.dirty).toBe(true);
  });

  it('MIXED: Save is offered, and the abort names the part Save could not write', async () => {
    // An aeon project Save can persist, plus a composer document it cannot. The
    // special-case sentence used to count only CANVAS documents, so this abort
    // fell through to the generic "save or discard them first" — which is exactly
    // the loop the user just failed to escape.
    //
    // ⚠ THE SAVABLE HALF USED TO BE A FALSE PREMISE (DIRTY-DOMAINS-ASSUMED-SAVABLE,
    // 2026-09-09). This row was `dirtyComposer()` + `editorStore.dirty = true`
    // with NO project open, commented "savable" — and the aeon-project saver's own
    // `isDirty` is `openEngine() === 'aeon'`, which is FALSE with nothing open, so
    // no registered saver would have written that dirt. The row passed because the
    // injected `__setOpenGuardSaveForTest` stub markCleaned the store itself: a
    // save no coordinator performs, verifying an offer the guard should never have
    // made. It is the FIFTH instance of this file's own class, encoded in its own
    // suite as an expectation.
    //
    // Both halves are now TRUE in the state they are asserted in: the aeon project
    // is resident (so its saver really does fire, and the stub below stands in for
    // the IPC write rather than for the decision), and the unsavable document is a
    // LIVE-TILE composer doc, which has no writer even with a project open — see
    // the row below this one.
    aeonProjectOpen();
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: 4, chunkId: null, name: 'Tile $04', dirty: false,
    });
    useArtStore.getState().markOpenDirty();     // unsavable: writes straight to the tileset
    useEditorStore.setState({ dirty: true });   // savable: openEngine() === 'aeon'

    __setOpenGuardSaveForTest(vi.fn(async () => {
      useEditorStore.getState().markClean();
      return { saved: ['aeon-project'], skipped: [], failed: [] };
    }));

    const p = confirmProjectOpen();
    expect(KEYS()).toContain('save');
    useConfirmStore.getState().answer('save');
    await expect(p).resolves.toBe(false);

    const msg = useToastStore.getState().toasts.at(-1)!.message;
    expect(msg).toMatch(/unsaved changes remain/i);   // the generic half still applies
    expect(msg).toMatch(/straight to the tileset/i);  // only composerSaveState says this
    expect(msg).toMatch(/Discard & open/);            // WHAT to do instead
    expect(useArtStore.getState().open?.dirty).toBe(true);
  });

  it('a live-tile document with doc-local dirt is reported, not silently called clean', async () => {
    // A live-tile doc writes straight to the tileset and the facet hides its Save
    // button, but ComposerCanvas.applyTileCell marks ANY document dirty — so this
    // state is reachable and has no writer. Calling it clean would put the
    // perimeter back to losing work without a dialog.
    aeonProjectOpen();
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: 4, chunkId: null, name: 'Tile $04', dirty: false,
    });
    useArtStore.getState().markOpenDirty();

    const p = confirmProjectOpen();
    expect(KEYS()).toEqual(['discard', 'cancel']);
    expect(useConfirmStore.getState().request!.body!).toMatch(/straight to the tileset/i);
    useConfirmStore.getState().answer('cancel');
    await expect(p).resolves.toBe(false);
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

  it("'discard' is what drops the documents: it is reached only via the dialog", async () => {
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
      // `atGen` is required (CANVAS-SAVE-GEN-OPTIONAL): this fake save stands in
      // for one that raced no edit, so it carries the counter as it stands.
      useCanvasStore.getState().markSaved(
        CANVAS, { pngMtimeMs: 2000, sidecarMtimeMs: 2000 },
        useCanvasStore.getState().docs.get(CANVAS)!.editGen,
      );
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
