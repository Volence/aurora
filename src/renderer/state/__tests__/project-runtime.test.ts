import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  saveCoordinator, documentHistoryHub, ensureSaversRegistered, saveAllDirty,
  registerAeonSaver, resetProjectRuntime,
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
    useSpriteStore.setState({ s1ArtSource: null });
    registerAeonSaver(null);
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

  it('sprite-art saver fires whenever s1ArtSource is set, alongside classic', async () => {
    const log: string[] = [];
    __setRuntimeSaversForTest({
      classic: async () => { log.push('classic'); },
      spriteArt: async () => { log.push('sprite'); },
    });
    useClassicProjectStore.setState({ status: 'open' });
    useSpriteStore.setState({ s1ArtSource: {} as never });
    const r = await saveAllDirty();
    // Registration order: sprite-art first (art must never be lost to a level save race).
    expect(log).toEqual(['sprite', 'classic']);
    expect(r.saved).toEqual(['sprite-art', 'classic-level']);
  });

  it('aeon saver fires only when an aeon project is open and classic is NOT', async () => {
    const log: string[] = [];
    registerAeonSaver(async () => { log.push('aeon'); });
    useProjectStore.setState({ project: {} as never });
    await saveAllDirty();
    expect(log).toEqual(['aeon']);

    log.length = 0;
    useClassicProjectStore.setState({ status: 'open' });
    __setRuntimeSaversForTest({ classic: async () => {} });
    await saveAllDirty();
    expect(log).toEqual([]); // classic open → the resident aeon project is stale
  });

  it('a failing saver is reported but does not block the others', async () => {
    __setRuntimeSaversForTest({
      classic: async () => { throw new Error('disk on fire'); },
      spriteArt: async () => {},
    });
    useClassicProjectStore.setState({ status: 'open' });
    useSpriteStore.setState({ s1ArtSource: {} as never });
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
