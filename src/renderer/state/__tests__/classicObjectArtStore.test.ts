import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  refreshClassicObjectSprites,
  useClassicObjectArtStore,
  __setObjectSpriteBuilderForTest,
  __resetObjectSpriteArtForTest,
  type ObjectSprite,
} from '../classicObjectArtStore';
import type { LevelDoc } from '../../../core/level-classic/model';

// Minimal doc: refresh only reads doc.objects[].id (the builder is faked).
function fakeDoc(ids: number[]): LevelDoc {
  return { objects: ids.map((id) => ({ id })) } as unknown as LevelDoc;
}

// A doc carrying a one-byte tile pool marker, for the cache-invalidation test: the
// fake builder reads ctx.doc.tiles[0] so a "tile edit" (a different marker) is
// observable in the built sprite.
function fakeDocWithTiles(ids: number[], marker: number): LevelDoc {
  return { objects: ids.map((id) => ({ id, subtype: 0 })), tiles: new Uint8Array([marker]) } as unknown as LevelDoc;
}

function fakeSprite(width: number, close = () => {}): ObjectSprite {
  return { bitmap: { close } as unknown as ImageBitmap, width, height: width, originX: 0, originY: 0 };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

afterEach(() => __resetObjectSpriteArtForTest());

describe('refreshClassicObjectSprites — lifecycle guards', () => {
  it('drops a STALE publish when a newer-epoch refresh resolves first', async () => {
    const builds: ReturnType<typeof deferred<ObjectSprite | null>>[] = [];
    __setObjectSpriteBuilderForTest(() => {
      const d = deferred<ObjectSprite | null>();
      builds.push(d);
      return d.promise;
    });

    const doc = fakeDoc([1]);
    const pA = refreshClassicObjectSprites('dir', doc, 'ghz', 1); // gen 1
    const pB = refreshClassicObjectSprites('dir', doc, 'ghz', 2); // gen 2
    expect(builds).toHaveLength(2); // one build per (epoch) key

    // Newer refresh (B) resolves first and publishes.
    builds[1].resolve(fakeSprite(2));
    await pB;
    expect(useClassicObjectArtStore.getState().sprites.get('1')?.width).toBe(2);
    const versionAfterB = useClassicObjectArtStore.getState().version;

    // Older refresh (A) resolves last — its publish must be DROPPED.
    builds[0].resolve(fakeSprite(1));
    await pA;
    expect(useClassicObjectArtStore.getState().sprites.get('1')?.width).toBe(2); // unchanged
    expect(useClassicObjectArtStore.getState().version).toBe(versionAfterB); // no extra publish
  });

  it('evicts + closes prior-epoch bitmaps after a new-epoch refresh publishes', async () => {
    const close = vi.fn();
    __setObjectSpriteBuilderForTest(async () => fakeSprite(1, close));
    const doc = fakeDoc([1]);
    await refreshClassicObjectSprites('dir', doc, 'ghz', 1);
    expect(close).not.toHaveBeenCalled();
    await refreshClassicObjectSprites('dir', doc, 'ghz', 2);
    // The epoch-1 bitmap is evicted (and closed) once the epoch-2 map is live.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('wipes + closes the cache on a project-dir change', async () => {
    const close = vi.fn();
    __setObjectSpriteBuilderForTest(async () => fakeSprite(1, close));
    await refreshClassicObjectSprites('dirA', fakeDoc([1]), 'ghz', 1);
    expect(close).not.toHaveBeenCalled();
    await refreshClassicObjectSprites('dirB', fakeDoc([1]), 'ghz', 1);
    // dirB's refresh cleared the dirA-built bitmap before rebuilding.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bumps the version exactly ONCE per refresh regardless of sprite count', async () => {
    // Each version bump forces a full viewport redraw; on GPU-poor machines a
    // per-sprite publish would be N slow repaints. A refresh of N sprites must
    // publish (and bump) exactly once.
    __setObjectSpriteBuilderForTest(async (id) => fakeSprite(id));
    const before = useClassicObjectArtStore.getState().version;
    await refreshClassicObjectSprites('dir', fakeDoc([1, 2, 3, 4, 5, 6, 7, 8]), 'ghz', 1);
    expect(useClassicObjectArtStore.getState().version).toBe(before + 1);
    expect(useClassicObjectArtStore.getState().sprites.size).toBe(8);
  });

  it('B6: a tile edit (epoch bump) rebuilds LevelArt sprites against the new doc.tiles', async () => {
    // LevelArt sprites draw from doc.tiles, so a tile edit must invalidate their
    // cache. classicEditTiles bumps chunkEpoch (VersionEffect 'all') and the viewport
    // re-runs refresh with the fresh doc at the new epoch. Here the fake builder maps
    // ctx.doc.tiles[0] → sprite width, so the rebuild is observable.
    __setObjectSpriteBuilderForTest(async (_id, _zone, _variant, ctx) => fakeSprite(ctx.doc.tiles[0]));

    // Epoch 1 with tile marker 5 → sprite width 5.
    await refreshClassicObjectSprites('dir', fakeDocWithTiles([1], 5), 'ghz', 1);
    expect(useClassicObjectArtStore.getState().sprites.get('1')?.width).toBe(5);

    // Same epoch, edited tiles (marker 9) → CACHED: width unchanged (epoch is the key).
    await refreshClassicObjectSprites('dir', fakeDocWithTiles([1], 9), 'ghz', 1);
    expect(useClassicObjectArtStore.getState().sprites.get('1')?.width).toBe(5);

    // Tile edit bumps the epoch → rebuild picks up the new pool: width 9.
    await refreshClassicObjectSprites('dir', fakeDocWithTiles([1], 9), 'ghz', 2);
    expect(useClassicObjectArtStore.getState().sprites.get('1')?.width).toBe(9);
  });

  it('publishes only linked (non-null) sprites, skipping misses', async () => {
    __setObjectSpriteBuilderForTest(async (id) => (id === 1 ? fakeSprite(3) : null));
    await refreshClassicObjectSprites('dir', fakeDoc([1, 2]), 'ghz', 1);
    const map = useClassicObjectArtStore.getState().sprites;
    expect(map.get('1')?.width).toBe(3);
    expect(map.has('2')).toBe(false); // null miss not published
  });

  it('keys subtype-rule objects by subtype, static objects by bare id', async () => {
    // A doc with two Monitors ($26, subtype rule) of different subtypes + one Crabmeat
    // ($1F, static). The rule object must publish TWO keyed entries (one per subtype);
    // the static object publishes ONE regardless of its subtype.
    __setObjectSpriteBuilderForTest(async () => fakeSprite(8));
    // These ids are linked, so refresh's prefetch reaches the (Electron-only)
    // readMany bridge; stub it (the faked builder ignores the returned bytes).
    const g = globalThis as unknown as { window?: unknown };
    const prevWindow = g.window;
    g.window = { api: { readManyFiles: async (_d: string, rels: string[]) => rels.map((r) => ({ relPath: r, bytes: null, mtimeMs: null })) } };
    const doc = {
      objects: [
        { id: 0x26, subtype: 0 }, { id: 0x26, subtype: 6 }, { id: 0x26, subtype: 6 }, // two distinct monitor subtypes
        { id: 0x1f, subtype: 3 }, { id: 0x1f, subtype: 9 }, // crabmeat: subtype ignored
      ],
    } as unknown as LevelDoc;
    try {
      await refreshClassicObjectSprites('dir', doc, 'ghz', 1);
    } finally {
      g.window = prevWindow;
    }
    const map = useClassicObjectArtStore.getState().sprites;
    expect(map.has('38:0')).toBe(true); // Monitor $26 subtype 0
    expect(map.has('38:6')).toBe(true); // Monitor $26 subtype 6
    expect(map.has('31')).toBe(true); // Crabmeat $1F (bare id, no subtype)
    expect(map.has('31:3')).toBe(false); // static id is NOT subtype-keyed
    expect(map.size).toBe(3); // 2 monitor subtypes + 1 crabmeat (dupes collapsed)
  });
});
