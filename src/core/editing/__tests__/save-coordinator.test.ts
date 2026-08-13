import { describe, it, expect } from 'vitest';
import { SaveCoordinator, type Saver } from '../save-coordinator';

function fakeSaver(id: string, opts: { dirty: boolean; fail?: string; log?: string[] }): Saver {
  return {
    id,
    isDirty: () => opts.dirty,
    save: async () => {
      opts.log?.push(id);
      if (opts.fail) throw new Error(opts.fail);
    },
  };
}

/** A saver that claims tabs by prefix and records what it was asked to save. */
function scopedSaver(id: string, opts: {
  prefix: string; dirtyTabs?: string[]; fail?: string; log?: string[];
}): Saver {
  return {
    ...fakeSaver(id, { dirty: (opts.dirtyTabs ?? []).length > 0, log: opts.log }),
    scope: {
      owns: (tabId) => tabId.startsWith(opts.prefix),
      isDirty: (tabId) => (opts.dirtyTabs ?? []).includes(tabId),
      save: async (tabId) => {
        opts.log?.push(`${id}:${tabId}`);
        if (opts.fail) throw new Error(opts.fail);
      },
    },
  };
}

describe('SaveCoordinator', () => {
  it('saves only dirty savers, skipping clean ones', async () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('level', { dirty: true }));
    c.register(fakeSaver('zone-art', { dirty: false }));
    const result = await c.saveAll();
    expect(result.saved).toEqual(['level']);
    expect(result.skipped).toEqual(['zone-art']);
    expect(result.failed).toEqual([]);
  });

  it('saves in registration order', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: true, log }));
    c.register(fakeSaver('b', { dirty: true, log }));
    await c.saveAll();
    expect(log).toEqual(['a', 'b']);
  });

  it('a failing saver is reported and does not block the rest', async () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('bad', { dirty: true, fail: 'disk on fire' }));
    c.register(fakeSaver('good', { dirty: true }));
    const result = await c.saveAll();
    expect(result.failed).toEqual([{ id: 'bad', message: 'disk on fire' }]);
    expect(result.saved).toEqual(['good']);
  });

  it('anyDirty() aggregates dirtiness', () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: false }));
    expect(c.anyDirty()).toBe(false);
    c.register(fakeSaver('b', { dirty: true }));
    expect(c.anyDirty()).toBe(true);
  });

  it('saveActive runs ONLY the saver that owns the active tab', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(scopedSaver('doc', { prefix: 'doc:', dirtyTabs: ['doc:a', 'doc:b'], log }));
    c.register(scopedSaver('level', { prefix: 'level:', dirtyTabs: ['level:ghz:1'], log }));

    const r = await c.saveActive('doc:b');

    expect(log).toEqual(['doc:doc:b']);   // scoped save, one tab, one saver
    expect(r.saved).toEqual(['doc']);
    expect(r.skipped).toEqual([]);
  });

  it('saveActive is a no-op for a tab no saver owns', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(scopedSaver('doc', { prefix: 'doc:', dirtyTabs: ['doc:a'], log }));

    const r = await c.saveActive('tool:project-setup');

    expect(log).toEqual([]);
    expect(r).toEqual({ saved: [], skipped: [], failed: [] });
    expect(await c.saveActive(null)).toEqual({ saved: [], skipped: [], failed: [] });
  });

  it('saveActive skips an owned but clean tab', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(scopedSaver('doc', { prefix: 'doc:', dirtyTabs: ['doc:a'], log }));

    const r = await c.saveActive('doc:clean');

    expect(log).toEqual([]);
    expect(r.skipped).toEqual(['doc']);
  });

  it('saveActive reports a throwing scoped save as a failure', async () => {
    const c = new SaveCoordinator();
    c.register(scopedSaver('doc', { prefix: 'doc:', dirtyTabs: ['doc:a'], fail: 'disk on fire' }));
    const r = await c.saveActive('doc:a');
    expect(r.failed).toEqual([{ id: 'doc', message: 'disk on fire' }]);
    expect(r.saved).toEqual([]);
  });

  it('canSaveActive answers for the owning saver only', () => {
    const c = new SaveCoordinator();
    c.register(scopedSaver('doc', { prefix: 'doc:', dirtyTabs: ['doc:a'] }));
    c.register(fakeSaver('scopeless', { dirty: true })); // save-all only
    expect(c.canSaveActive('doc:a')).toBe(true);
    expect(c.canSaveActive('doc:b')).toBe(false);
    expect(c.canSaveActive('home')).toBe(false);
    expect(c.canSaveActive(null)).toBe(false);
  });

  it('a scopeless saver still participates in saveAll but never in saveActive', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(fakeSaver('scopeless', { dirty: true, log }));
    await c.saveActive('doc:a');
    expect(log).toEqual([]);
    await c.saveAll();
    expect(log).toEqual(['scopeless']);
  });

  it('throws on duplicate saver id; unregister frees the id', () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: false }));
    expect(() => c.register(fakeSaver('a', { dirty: false }))).toThrow(
      "Saver 'a' is already registered",
    );
    c.unregister('a');
    expect(() => c.register(fakeSaver('a', { dirty: false }))).not.toThrow();
  });
});
