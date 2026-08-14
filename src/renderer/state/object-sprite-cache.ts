// Generic (id, zone, epoch)-keyed sprite cache with dedup, failure-caching, and
// epoch eviction — the reference caching pattern for the classic composer work
// (B2/B3 reuse it). Deliberately canvas/fs-free: the actual builder (which reads
// files + rasterizes to an ImageBitmap) and the resource disposer are INJECTED,
// so the keying/dedup/eviction logic is unit-testable with plain fakes.
//
// LIFECYCLE (why this exists): every distinct palette epoch produces a fresh set
// of rendered bitmaps; without eviction those GPU-backed ImageBitmaps leak (a
// palette drag in B4 would allocate ~one set per drag frame). `evictStale` closes
// and drops every entry not at the current epoch; `clear` disposes everything.

/** A cached build result, tagged with the epoch it was built for. */
interface CacheEntry<T> {
  epoch: number;
  /** null = a permanently-cached failure/miss (don't retry this key). */
  value: T | null;
}

export class ObjectSpriteCache<T, Ctx> {
  private cache = new Map<string, CacheEntry<T>>();
  private inFlight = new Map<string, Promise<T | null>>();

  /**
   * @param build   Produce the resource for (id, zone, ctx), or null on a miss.
   *                Rejections are caught and cached as a null (failure-caching).
   * @param dispose Release a built resource (e.g. `bitmap.close()`), called on
   *                eviction/clear. Never called on a null entry.
   */
  constructor(
    private readonly build: (id: number, zone: string, variant: string, ctx: Ctx) => Promise<T | null>,
    private readonly dispose: (value: T) => void,
  ) {}

  private static key(id: number, zone: string, variant: string, epoch: number): string {
    return `${id}:${zone}:${variant}:${epoch}`;
  }

  /**
   * Get (or build) the resource for (id, zone, variant, epoch). `variant` is the
   * empty string for a plain static object (so its key stays effectively
   * id:zone:epoch and the cache does not balloon) and the subtype string for a
   * subtype-rule object, so only rule objects get a per-subtype cache entry.
   * Concurrent calls for the same key share ONE in-flight build (dedup); a cached
   * hit (incl. a cached failure) returns immediately without rebuilding.
   */
  async load(id: number, zone: string, variant: string, epoch: number, ctx: Ctx): Promise<T | null> {
    const key = ObjectSpriteCache.key(id, zone, variant, epoch);
    const hit = this.cache.get(key);
    if (hit) return hit.value;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const p = this.build(id, zone, variant, ctx)
      .catch(() => null)
      .then((value) => {
        this.cache.set(key, { epoch, value });
        this.inFlight.delete(key);
        return value;
      });
    this.inFlight.set(key, p);
    return p;
  }

  /** True when (id, zone, variant, epoch) is already resolved in the cache. */
  has(id: number, zone: string, variant: string, epoch: number): boolean {
    return this.cache.has(ObjectSpriteCache.key(id, zone, variant, epoch));
  }

  /**
   * Dispose + drop every cached entry whose epoch is not in `live` (stale bitmaps).
   *
   * Takes a SET, not a single epoch, because entries are no longer all keyed on
   * one clock: a file-backed sprite is keyed on the palette epoch while a
   * LevelArt sprite is keyed on palette-or-tiles (see
   * core/level-classic/object-sprite-clock). With a single-epoch check the two
   * groups would evict each other on every refresh — permanently cache-cold,
   * i.e. the exact rebuild storm this split removes.
   */
  evictStale(live: ReadonlySet<number>): void {
    for (const [key, entry] of this.cache) {
      if (!live.has(entry.epoch)) {
        if (entry.value !== null) this.dispose(entry.value);
        this.cache.delete(key);
      }
    }
  }

  /** Dispose everything and empty the cache (e.g. project dir change). */
  clear(): void {
    for (const entry of this.cache.values()) if (entry.value !== null) this.dispose(entry.value);
    this.cache.clear();
    this.inFlight.clear();
  }

  /** Number of resolved (non-in-flight) cache entries — for tests/diagnostics. */
  get size(): number {
    return this.cache.size;
  }
}
