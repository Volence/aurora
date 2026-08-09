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
    expect(useClassicObjectArtStore.getState().sprites.get(1)?.width).toBe(2);
    const versionAfterB = useClassicObjectArtStore.getState().version;

    // Older refresh (A) resolves last — its publish must be DROPPED.
    builds[0].resolve(fakeSprite(1));
    await pA;
    expect(useClassicObjectArtStore.getState().sprites.get(1)?.width).toBe(2); // unchanged
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

  it('publishes only linked (non-null) sprites, skipping misses', async () => {
    __setObjectSpriteBuilderForTest(async (id) => (id === 1 ? fakeSprite(3) : null));
    await refreshClassicObjectSprites('dir', fakeDoc([1, 2]), 'ghz', 1);
    const map = useClassicObjectArtStore.getState().sprites;
    expect(map.get(1)?.width).toBe(3);
    expect(map.has(2)).toBe(false); // null miss not published
  });
});
