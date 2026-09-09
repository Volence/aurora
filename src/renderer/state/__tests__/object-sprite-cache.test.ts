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

/**
 * The failure reporter, for the rows that are not about it. NAMED rather than an
 * inline `() => {}` so that a reader can see these rows are DECLINING to look at
 * failures, which is the thing the parameter exists to make impossible to do by
 * accident (SPRITE-CACHE-SILENT-SWALLOW — see SpriteBuildFailure).
 */
const SILENT = (): void => {};

/** No-op disposer, for the rows that build fakes with nothing to release. */
const NO_DISPOSE = (): void => {};

describe('ObjectSpriteCache', () => {
  it('dedups concurrent loads of the same key into one build', async () => {
    const build = vi.fn(async (id: number) => ({ id, epoch: 1 }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, NO_DISPOSE, SILENT);
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
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, NO_DISPOSE, SILENT);
    expect(await cache.load(2, 'ghz', '', 1, undefined)).toBeNull();
    expect(await cache.load(2, 'ghz', '', 1, undefined)).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1); // the null miss is cached
  });

  it('caches a null miss (builder returned null) without retry', async () => {
    const build = vi.fn(async () => null);
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, NO_DISPOSE, SILENT);
    expect(await cache.load(3, 'ghz', '', 1, undefined)).toBeNull();
    await cache.load(3, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('evictStale disposes + drops only entries not at the current epoch', async () => {
    const dispose = vi.fn();
    const build = vi.fn(async (id: number, _z: string) => ({ id, epoch: id }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, dispose, SILENT);
    const s1 = await cache.load(1, 'ghz', '', 1, undefined); // epoch 1
    const s2 = await cache.load(2, 'ghz', '', 2, undefined); // epoch 2
    const nullMiss = new ObjectSpriteCache<FakeSprite, undefined>(async () => null, dispose, SILENT);
    await nullMiss.load(9, 'ghz', '', 1, undefined);
    expect(cache.size).toBe(2);

    cache.evictStale(new Set([2]));
    // Only the epoch-1 entry is evicted + disposed; the epoch-2 entry survives.
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(s1);
    expect(cache.size).toBe(1);
    expect(await cache.load(2, 'ghz', '', 2, undefined)).toBe(s2); // still cached (no rebuild)
    expect(build).toHaveBeenCalledTimes(2);

    // A null (failure) entry is dropped on eviction but NOT disposed.
    nullMiss.evictStale(new Set([2]));
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(nullMiss.size).toBe(0);
  });

  it('clear disposes every non-null entry and empties the cache', async () => {
    const dispose = vi.fn();
    const build = vi.fn(async (id: number) => (id === 0 ? null : { id, epoch: 1 }));
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, dispose, SILENT);
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
    const cache = new ObjectSpriteCache<V, undefined>(build, NO_DISPOSE, SILENT);
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

  // ═══ SPRITE-CACHE-SILENT-SWALLOW (lens sweep) ══════════════════════════════
  //
  // `.catch(() => null)` made a build that THREW indistinguishable from a build
  // that missed, and both drew the same hex-id box. The value still collapses to
  // null (the failure-caching is deliberate); the cause now leaves through the
  // reporter. These rows are what stops it from being wired back to nothing.
  //
  // The matcher is the DISTINCTION, not the notification: a reporter called on
  // both branches would be as useless as one called on neither, so the miss row
  // sits beside the failure row and asserts silence.

  it('reports a build that THREW, with the message it threw', async () => {
    const seen: { id: number; zone: string; variant: string; epoch: number; reason: string }[] = [];
    const build = vi.fn(async () => { throw new Error("'art/x.nem' could not be read: EACCES"); });
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(
      build, NO_DISPOSE, (f) => seen.push(f));
    expect(await cache.load(0x1f, 'ghz', '3', 7, undefined)).toBeNull();
    expect(seen.length, 'the build threw and nobody was told').toBe(1);
    // The key, so a coalesced notice can name WHICH object failed.
    expect(seen[0]).toMatchObject({ id: 0x1f, zone: 'ghz', variant: '3', epoch: 7 });
    // The repair hint, verbatim. This is the sentence read-failure.ts owns and the
    // one the old catch dropped on the floor.
    expect(seen[0].reason).toBe("'art/x.nem' could not be read: EACCES");
  });

  it('does NOT report a legitimate miss, which is what makes the row above mean something', async () => {
    const seen: unknown[] = [];
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(
      async () => null, NO_DISPOSE, (f) => seen.push(f));
    expect(await cache.load(0x20, 'ghz', '', 1, undefined)).toBeNull();
    expect(seen, 'an unlinked id is not a failure and must not raise a notice').toEqual([]);
  });

  it('reports once per build, not once per awaiting caller', async () => {
    // Concurrent callers share ONE build (the dedup above), so a notice per caller
    // would multiply a single unreadable file by however many placements asked for
    // it — 40 identical rings would be 40 notices for one file.
    const seen: unknown[] = [];
    const build = vi.fn(async () => { throw new Error('boom'); });
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(
      build, NO_DISPOSE, (f) => seen.push(f));
    await Promise.all([
      cache.load(4, 'ghz', '', 1, undefined),
      cache.load(4, 'ghz', '', 1, undefined),
      cache.load(4, 'ghz', '', 1, undefined),
    ]);
    // ...and a fourth load is a cached failure, which does not rebuild and so has
    // nothing new to report.
    await cache.load(4, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
    expect(seen.length).toBe(1);
  });

  it('a reporter that throws does not turn a failed sprite into a failed load', async () => {
    // The consumer contract is "null on a miss/failure" and every caller draws its
    // fallback from that. A notice mechanism that can break the render is worse
    // than the silence it replaced.
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(
      async () => { throw new Error('boom'); },
      NO_DISPOSE,
      () => { throw new Error('the reporter itself is broken'); },
    );
    await expect(cache.load(6, 'ghz', '', 1, undefined)).resolves.toBeNull();
  });

  it('interleaved deferred builds still dedup per key', async () => {
    const d = deferred<FakeSprite>();
    const build = vi.fn(() => d.promise);
    const cache = new ObjectSpriteCache<FakeSprite, undefined>(build, NO_DISPOSE, SILENT);
    const p1 = cache.load(5, 'ghz', '', 1, undefined);
    const p2 = cache.load(5, 'ghz', '', 1, undefined);
    expect(build).toHaveBeenCalledTimes(1);
    d.resolve({ id: 5, epoch: 1 });
    expect(await p1).toEqual({ id: 5, epoch: 1 });
    expect(await p2).toEqual({ id: 5, epoch: 1 });
  });
});
