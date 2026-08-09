import { describe, it, expect, vi } from 'vitest';
import { ObjectSpriteCache } from '../object-sprite-cache';

// A deferred promise for controlling build resolution order in tests.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface FakeSprite { id: number; epoch: number }

describe('ObjectSpriteCache', () => {
  it('dedups concurrent loads of the same key into one build', async () => {
    const build = vi.fn(async (id: number) => ({ id, epoch: 1 }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, () => {});
    const [a, b] = await Promise.all([
      cache.load(1, 'ghz', '', 1, undefined),
      cache.load(1, 'ghz', '', 1, undefined),
    ]);
    expect(build).toHaveBeenCalledTimes(1);
    expect(a).toBe(b); // same resolved instance
    // A third load after resolution is a cache hit — still one build.
    await cache.load(1, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('caches a failure (rejection → null) and does not retry', async () => {
    const build = vi.fn(async () => { throw new Error('boom'); });
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, () => {});
    expect(await cache.load(2, 'ghz', '', 1, undefined)).toBeNull();
    expect(await cache.load(2, 'ghz', '', 1, undefined)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1); // the null miss is cached
  });

  it('caches a null miss (builder returned null) without retry', async () => {
    const build = vi.fn(async () => null);
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, () => {});
    expect(await cache.load(3, 'ghz', '', 1, undefined)).toBeNull();
    await cache.load(3, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('evictStale disposes + drops only entries not at the current epoch', async () => {
    const dispose = vi.fn();
    const build = vi.fn(async (id: number, _z: string) => ({ id, epoch: id }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, dispose);
    const s1 = await cache.load(1, 'ghz', '', 1, undefined); // epoch 1
    const s2 = await cache.load(2, 'ghz', '', 2, undefined); // epoch 2
    const nullMiss = new ObjectSpriteCache<FakeSprite, undefined>(async () => null, dispose);
    await nullMiss.load(9, 'ghz', '', 1, undefined);
    expect(cache.size).toBe(2);

    cache.evictStale(2);
    // Only the epoch-1 entry is evicted + disposed; the epoch-2 entry survives.
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(s1);
    expect(cache.size).toBe(1);
    expect(await cache.load(2, 'ghz', '', 2, undefined)).toBe(s2); // still cached (no rebuild)
    expect(build).toHaveBeenCalledTimes(2);

    // A null (failure) entry is dropped on eviction but NOT disposed.
    nullMiss.evictStale(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(nullMiss.size).toBe(0);
  });

  it('clear disposes every non-null entry and empties the cache', async () => {
    const dispose = vi.fn();
    const build = vi.fn(async (id: number) => (id === 0 ? null : { id, epoch: 1 }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, dispose);
    await cache.load(1, 'ghz', '', 1, undefined);
    await cache.load(2, 'ghz', '', 1, undefined);
    await cache.load(0, 'ghz', '', 1, undefined); // null miss
    expect(cache.size).toBe(3);
    cache.clear();
    expect(dispose).toHaveBeenCalledTimes(2); // the two real sprites, not the null
    expect(cache.size).toBe(0);
  });

  it('the variant discriminates cache entries (subtype-rule keying)', async () => {
    // Rule objects pass the subtype string as `variant`; static objects pass ''. Two
    // variants of the same (id, zone, epoch) must build + cache separately, while the
    // same variant dedups. This is what keeps a bridge of 8 logs distinct from one of
    // 12, without static ids ballooning the cache.
    const build = vi.fn(async (id: number, _z: string, variant: string) => ({ id, variant, epoch: 1 }));
    interface V { id: number; variant: string; epoch: number }
    const cache = new ObjectSpriteCache<V, undefined>(build, () => {});
    const a = await cache.load(0x11, 'ghz', '8', 1, undefined);
    const b = await cache.load(0x11, 'ghz', '12', 1, undefined);
    expect(a).not.toBe(b);
    expect(a!.variant).toBe('8');
    expect(b!.variant).toBe('12');
    expect(build).toHaveBeenCalledTimes(2);
    // Same variant → cache hit (no rebuild).
    await cache.load(0x11, 'ghz', '8', 1, undefined);
    expect(build).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(2);
  });

  it('interleaved deferred builds still dedup per key', async () => {
    const d = deferred<FakeSprite>();
    const build = vi.fn(() => d.promise);
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, () => {});
    const p1 = cache.load(5, 'ghz', '', 1, undefined);
    const p2 = cache.load(5, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
    d.resolve({ id: 5, epoch: 1 });
    expect(await p1).toEqual({ id: 5, epoch: 1 });
    expect(await p2).toEqual({ id: 5, epoch: 1 });
  });
});
