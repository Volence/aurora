import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveCoordinator, documentHistoryHub, ensureSaversRegistered, saveAllDirty,
  resetProjectRuntime,
  __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../project-runtime';
import { useClassicProjectStore } from '../classicProjectStore';
import { useProjectStore } from '../projectStore';
import { useSpriteStore } from '../spriteStore';

describe('project runtime', () => {
  beforeEach(() => {
    ensureSaversRegistered();
    useClassicProjectStore.getState().reset();
    useProjectStore.getState().reset();
    useSpriteStore.setState({ s1ArtSource: null, unsavedEdits: false });
    __resetRuntimeSaversForTest();
  });
  afterEach(() => {
    __resetRuntimeSaversForTest();
  });

  it('registers exactly the three savers, idempotently', () => {
    ensureSaversRegistered();
    ensureSaversRegistered();
    return saveAllDirty().then((r) => {
      expect([...r.saved, ...r.skipped, ...r.failed.map((f) => f.id)].sort())
        .toEqual(['aeon-project', 'classic-level', 'sprite-art']);
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
