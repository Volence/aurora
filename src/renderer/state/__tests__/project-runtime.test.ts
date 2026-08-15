import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveCoordinator, documentHistoryHub, ensureSaversRegistered, saveAllDirty,
  saveActive, canSaveActive, resetProjectRuntime,
  __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../project-runtime';
import { useClassicProjectStore } from '../classicProjectStore';
import { useClassicLevelStore } from '../classicLevelStore';
import { useProjectStore } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useEditorStore } from '../editorStore';
import { useSpriteStore, openSpriteDoc, patchSpriteDoc } from '../spriteStore';

describe('project runtime', () => {
  beforeEach(() => {
    ensureSaversRegistered();
    useClassicProjectStore.getState().reset();
    useProjectStore.getState().reset();
    useSpriteStore.getState().closeAll();
    useSessionStore.getState().reset();
    useClassicLevelStore.setState({ ref: null, dirty: {} as never });
    useEditorStore.setState({ dirty: false });
    __resetRuntimeSaversForTest();
  });
  afterEach(() => {
    __resetRuntimeSaversForTest();
  });

  it('registers exactly the four savers, idempotently', () => {
    ensureSaversRegistered();
    ensureSaversRegistered();
    return saveAllDirty().then((r) => {
      expect([...r.saved, ...r.skipped, ...r.failed.map((f) => f.id)].sort())
        .toEqual(['aeon-project', 'canvas-doc', 'classic-level', 'sprite-art']);
    });
  });

  it('with nothing open, every saver skips', async () => {
    const r = await saveAllDirty();
    expect(r.saved).toEqual([]);
    expect(r.failed).toEqual([]);
  });

  it('classic open → classic saver fires (mirrors the retired save router)', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ classic: async () => { log.push('classic'); } });
    useClassicProjectStore.setState({ status: 'open' });
    const r = await saveAllDirty();
    expect(log).toEqual(['classic']);
    expect(r.saved).toEqual(['classic-level']);
  });

  it('sprite-art saver fires on a checkout WITH unsaved edits, alongside classic', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      spriteArt: async () => { log.push('sprite'); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    // A checkout is only dirty once it has unsaved edits (Fix A) — set both.
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: true });
    const r = await saveAllDirty();
    // Registration order: sprite-art first (art must never be lost to a level save race).
    expect(log).toEqual(['sprite', 'classic']);
    expect(r.saved).toEqual(['sprite-art', 'classic-level']);
  });

  it('sprite-art saver SKIPS a bare checkout with no unsaved edits (Fix A)', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ spriteArt: async () => { log.push('sprite'); } });
    // Checked out but untouched — writing it back would be an identical-bytes
    // write + mtime churn, so the saver must skip it.
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: false });
    const r = await saveAllDirty();
    expect(log).toEqual([]);
    expect(r.saved).not.toContain('sprite-art');
    expect(r.skipped).toContain('sprite-art');
  });

  it('sprite-art saver fires for a BACKGROUND document with unsaved art edits', async () => {
    // The under-report this closes: reporting only the CHECKED-OUT document let
    // Ctrl+S quietly skip a dirty sprite tab the user wasn't looking at, leaving
    // its dot up and its edits on the floor.
    const log: string[] = [];
    __setRuntimeSaversForTest({ spriteArt: async () => { log.push('sprite'); } });
    openSpriteDoc('doc:sprite:s1:13', { width: 16, height: 16 });
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: true });
    openSpriteDoc('doc:sprite:s1:28', { width: 16, height: 16 }); // parks the dirty one

    expect(useSpriteStore.getState().unsavedEdits).toBe(false);   // the visible doc is clean
    const r = await saveAllDirty();

    expect(log).toEqual(['sprite']);
    expect(r.saved).toEqual(['sprite-art']);
  });

  it('resetProjectRuntime also drops the open sprite documents', async () => {
    // A document that outlives its project keeps an s1ArtSource pointing into the
    // OLD project by absolute path — a later Ctrl+S would write across projects.
    openSpriteDoc('doc:sprite:s1:13', { width: 16, height: 16 });
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: true });

    resetProjectRuntime();

    const s = useSpriteStore.getState();
    expect(s.isOpen('doc:sprite:s1:13')).toBe(false);
    expect(s.s1ArtSource).toBeNull();
    expect(s.unsavedEdits).toBe(false);
  });

  it('aeon saver fires only when an aeon project is open and classic is NOT', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ aeon: async () => { log.push('aeon'); } });
    useProjectStore.setState({ project: {} as never });
    await saveAllDirty();
    expect(log).toEqual(['aeon']);

    log.length = 0;
    useClassicProjectStore.setState({ status: 'open' });
    __setRuntimeSaversForTest({ classic: async () => {} });
    await saveAllDirty();
    expect(log).toEqual([]); // classic open → the resident aeon project is stale
  });

  it('aeon saver is registered statically (no App-mount registration required)', async () => {
    // With an aeon project resident and classic closed, saveAll must invoke the
    // aeon saver even though nothing ever called a register function — the impl
    // is a static module import (saveAeonProject), not an App-mount injection.
    const log: string[] = [];
    __setRuntimeSaversForTest({ aeon: async () => { log.push('aeon'); } });
    useProjectStore.setState({ project: {} as never });
    const r = await saveAllDirty();
    expect(log).toEqual(['aeon']);
    expect(r.saved).toEqual(['aeon-project']);
  });

  it('a failing saver is reported but does not block the others', async () => {
    __setRuntimeSaversForTest({
      classic: async () => { throw new Error('disk on fire'); },
      spriteArt: async () => {},
    });
    useClassicProjectStore.setState({ status: 'open' });
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: true });
    const r = await saveAllDirty();
    expect(r.saved).toEqual(['sprite-art']);
    expect(r.failed).toEqual([{ id: 'classic-level', message: 'disk on fire' }]);
  });

  // -- Ctrl+S: the ACTIVE document only (Ctrl+Shift+S stays save-all) --------

  /** Open a sprite doc tab + document with unsaved edits and an art target. */
  function openDirtySprite(docId: string): void {
    openSpriteDoc(docId, { width: 16, height: 16 });
    useSpriteStore.setState({ s1ArtSource: {} as never, unsavedEdits: true });
  }
  function focusTab(id: string, kind: 'level' | 'sprite-doc' | 'tool' = 'sprite-doc'): void {
    useSessionStore.getState().open({ id, kind, title: id });
  }

  it('REGRESSION: Ctrl+S in sprite B does not write dirty sprite A', async () => {
    // The owner's exact complaint: edit sprite A, switch to B, edit B, Ctrl+S —
    // and A (a build input they weren't ready to commit) got written too.
    const saved: string[] = [];
    __setRuntimeSaversForTest({ spriteDoc: async (id) => { saved.push(id); } });
    openDirtySprite('doc:sprite:s1:13');           // A
    openDirtySprite('doc:sprite:s1:28');           // B (parks A, still dirty)
    focusTab('doc:sprite:s1:28');

    const r = await saveActive();

    expect(saved).toEqual(['doc:sprite:s1:28']);   // only B
    expect(r.saved).toEqual(['sprite-art']);
    // A is untouched and still dirty — its dot stays up, nothing was committed.
    expect(useSpriteStore.getState().isDirty('doc:sprite:s1:13')).toBe(true);
  });

  it('Ctrl+Shift+S (save all) still reaches the background sprite', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      // the save-ALL sprite writer — that it covers every dirty document is
      // sprite-doc-save.test.ts's subject; here it only has to be the one that runs
      spriteArt: async () => { log.push('sprite-all'); },
      spriteDoc: async (id) => { log.push(`one:${id}`); },
      classic: async () => { log.push('classic'); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    openDirtySprite('doc:sprite:s1:13');
    openDirtySprite('doc:sprite:s1:28');
    focusTab('doc:sprite:s1:28');

    const r = await saveAllDirty();

    expect(log).toEqual(['sprite-all', 'classic']);
    expect(r.saved).toEqual(['sprite-art', 'classic-level']);
  });

  it('Ctrl+S on a classic level tab saves the classic project', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      spriteDoc: async (id) => { log.push(`sprite:${id}`); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    useClassicLevelStore.setState({
      ref: { zone: 'ghz', act: 1, label: 'GHZ 1' } as never,
      dirty: { fg: true } as never,
    });
    openDirtySprite('doc:sprite:s1:13');   // dirty in the background — must NOT be written
    focusTab('level:ghz:1', 'level');

    const r = await saveActive();

    expect(log).toEqual(['classic']);
    expect(r.saved).toEqual(['classic-level']);
  });

  it('Ctrl+S on an aeon level tab saves the aeon project', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ aeon: async () => { log.push('aeon'); } });
    useProjectStore.setState({ project: {} as never });
    useEditorStore.setState({ dirty: true });
    focusTab('level:ehz:act1', 'level');

    const r = await saveActive();

    expect(log).toEqual(['aeon']);
    expect(r.saved).toEqual(['aeon-project']);
  });

  it('Ctrl+S with a stale aeon project still resident routes at CLASSIC', async () => {
    // Both savers claim "level:*" tabs, so the tie-break decides which files get
    // written. A classic open means projectStore holds the PREVIOUS project —
    // writing it would save the wrong project's files. Same precedence the
    // whole-window save uses (openEngine reports 's1', never 'aeon', here).
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      aeon: async () => { log.push('aeon'); },
    });
    useProjectStore.setState({ project: {} as never });   // stale, left over
    useClassicProjectStore.setState({ status: 'open' });
    useClassicLevelStore.setState({
      ref: { zone: 'ghz', act: 1, label: 'GHZ 1' } as never,
      dirty: { fg: true } as never,
    });
    focusTab('level:ghz:1', 'level');

    const r = await saveActive();

    expect(log).toEqual(['classic']);
    expect(r.saved).toEqual(['classic-level']);
  });

  it('Ctrl+S on a tool tab or Home is a safe no-op', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      spriteDoc: async (id) => { log.push(`sprite:${id}`); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    openDirtySprite('doc:sprite:s1:13');

    focusTab('tool:project-setup', 'tool');
    expect(await saveActive()).toEqual({ saved: [], skipped: [], failed: [] });
    useSessionStore.setState({ activeId: 'home' });
    expect(await saveActive()).toEqual({ saved: [], skipped: [], failed: [] });

    expect(log).toEqual([]);
  });

  it('Ctrl+S on a clean level tab writes nothing', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({ classic: async () => { log.push('classic'); } });
    useClassicProjectStore.setState({ status: 'open' });
    useClassicLevelStore.setState({ ref: { zone: 'ghz', act: 1 } as never, dirty: {} as never });
    focusTab('level:ghz:1', 'level');

    const r = await saveActive();

    expect(log).toEqual([]);
    expect(r.skipped).toEqual(['classic-level']);
  });

  it('canSaveActive tracks the ACTIVE document, sprites included', () => {
    openDirtySprite('doc:sprite:s1:13');
    openSpriteDoc('doc:sprite:s1:28', { width: 16, height: 16 }); // clean, parks the dirty one

    focusTab('doc:sprite:s1:28');
    expect(canSaveActive()).toBe(false);   // this document has nothing to write
    focusTab('doc:sprite:s1:13');
    expect(canSaveActive()).toBe(true);    // …but this one does

    // A dirty sprite with no in-place art target has no destination — Export is
    // the only way to persist it, so Save must not claim it.
    patchSpriteDoc('doc:sprite:s1:13', { s1ArtSource: null });
    expect(canSaveActive()).toBe(false);

    useSessionStore.setState({ activeId: 'home' });
    expect(canSaveActive()).toBe(false);
  });

  it('resetProjectRuntime clears the history hub', () => {
    documentHistoryHub.historyFor('level:ghz:1');
    resetProjectRuntime();
    expect(documentHistoryHub.has('level:ghz:1')).toBe(false);
  });

  it('coordinator and hub are stable module singletons', async () => {
    const again = await import('../project-runtime');
    expect(again.saveCoordinator).toBe(saveCoordinator);
    expect(again.documentHistoryHub).toBe(documentHistoryHub);
  });
});
