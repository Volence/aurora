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
