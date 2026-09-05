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
// Ids here must stay UNLINKED in s1-object-art ($02/$03 — $01 is Sonic's DPLC
// row now), or refresh's prefetch reaches the Electron-only readMany bridge.
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

// Sprite epochs are now derived per sprite from two clocks (palette, tile) —
// see core/level-classic/object-sprite-clock. Most tests here use UNLINKED ids
// whose epoch is the palette clock, so this helper moves both together and keeps
// their original "one epoch" meaning.
const clk = (n: number) => ({ palette: n, tile: n });

// Real GHZ ids with known art sources (verified against s1-object-art):
//   $18 Platform  → artSource 'levelArt' (draws from doc.tiles)
//   $1F Crabmeat  → artSource 'file'     (draws from a .nem on disk)
// Publish keys are decimal; $18 carries a subtype rule so it keys per subtype
// ('24:0'), while the ruleless $1F keys under its bare id ('31').
const levelArtDoc = (marker: number): LevelDoc =>
  ({ objects: [{ id: 0x18, subtype: 0 }], tiles: new Uint8Array([marker]) }) as unknown as LevelDoc;
const fileBackedDoc = (): LevelDoc =>
  ({ objects: [{ id: 0x1f, subtype: 0 }], tiles: new Uint8Array([1]) }) as unknown as LevelDoc;

/** Linked ids make refresh reach the Electron-only readMany bridge — stub it. */
function stubReadMany(): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    api: {
      readManyFiles: async (_d: string, rels: string[]) =>
        rels.map((r) => ({ relPath: r, bytes: null, mtimeMs: null })),
    },
  };
  return () => { g.window = prev; };
}

afterEach(() => __resetObjectSpriteArtForTest());

describe('refreshClassicObjectSprites: lifecycle guards', () => {
  it('drops a STALE publish when a newer-epoch refresh resolves first', async () => {
    const builds: ReturnType<typeof deferred<ObjectSprite | null>>[] = [];
    __setObjectSpriteBuilderForTest(() => {
      const d = deferred<ObjectSprite | null>();
      builds.push(d);
      return d.promise;
    });

    const doc = fakeDoc([2]);
    const pA = refreshClassicObjectSprites('dir', doc, 'ghz', clk(1)); // gen 1
    const pB = refreshClassicObjectSprites('dir', doc, 'ghz', clk(2)); // gen 2
    expect(builds).toHaveLength(2); // one build per (epoch) key

    // Newer refresh (B) resolves first and publishes.
    builds[1].resolve(fakeSprite(2));
    await pB;
    expect(useClassicObjectArtStore.getState().sprites.get('2')?.width).toBe(2);
    const versionAfterB = useClassicObjectArtStore.getState().version;

    // Older refresh (A) resolves last — its publish must be DROPPED.
    builds[0].resolve(fakeSprite(1));
    await pA;
    expect(useClassicObjectArtStore.getState().sprites.get('2')?.width).toBe(2); // unchanged
    expect(useClassicObjectArtStore.getState().version).toBe(versionAfterB); // no extra publish
  });

  it('evicts + closes prior-epoch bitmaps after a new-epoch refresh publishes', async () => {
    const close = vi.fn();
    __setObjectSpriteBuilderForTest(async () => fakeSprite(1, close));
    const doc = fakeDoc([2]);
    await refreshClassicObjectSprites('dir', doc, 'ghz', clk(1));
    expect(close).not.toHaveBeenCalled();
    await refreshClassicObjectSprites('dir', doc, 'ghz', clk(2));
    // The epoch-1 bitmap is evicted (and closed) once the epoch-2 map is live.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('wipes + closes the cache on a project-dir change', async () => {
    const close = vi.fn();
    __setObjectSpriteBuilderForTest(async () => fakeSprite(1, close));
    await refreshClassicObjectSprites('dirA', fakeDoc([2]), 'ghz', clk(1));
    expect(close).not.toHaveBeenCalled();
    await refreshClassicObjectSprites('dirB', fakeDoc([2]), 'ghz', clk(1));
    // dirB's refresh cleared the dirA-built bitmap before rebuilding.
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('bumps the version exactly ONCE per refresh regardless of sprite count', async () => {
    // Each version bump forces a full viewport redraw; on GPU-poor machines a
    // per-sprite publish would be N slow repaints. A refresh of N sprites must
    // publish (and bump) exactly once.
    __setObjectSpriteBuilderForTest(async (id) => fakeSprite(id));
    const before = useClassicObjectArtStore.getState().version;
    await refreshClassicObjectSprites('dir', fakeDoc([2, 3, 4, 5, 6, 7, 8, 9]), 'ghz', clk(1));
    expect(useClassicObjectArtStore.getState().version).toBe(before + 1);
    expect(useClassicObjectArtStore.getState().sprites.size).toBe(8);
  });

  it('B6: a tile edit rebuilds LevelArt sprites against the new doc.tiles', async () => {
    // LevelArt sprites draw from doc.tiles, so a tile edit MUST invalidate them.
    // GHZ $18 (Platform) is LevelArt-linked. The fake builder maps
    // ctx.doc.tiles[0] → sprite width, so the rebuild is observable.
    __setObjectSpriteBuilderForTest(async (_id, _zone, _variant, ctx) => fakeSprite(ctx.doc.tiles[0]));
    const restore = stubReadMany();
    try {
      await refreshClassicObjectSprites('dir', levelArtDoc(5), 'ghz', { palette: 1, tile: 1 });
      expect(useClassicObjectArtStore.getState().sprites.get('24:0')?.width).toBe(5);

      // No clock moved, edited tiles → CACHED (the epoch is the key), width unchanged.
      await refreshClassicObjectSprites('dir', levelArtDoc(9), 'ghz', { palette: 1, tile: 1 });
      expect(useClassicObjectArtStore.getState().sprites.get('24:0')?.width).toBe(5);

      // The TILE clock alone moves → a LevelArt sprite rebuilds against the new pool.
      await refreshClassicObjectSprites('dir', levelArtDoc(9), 'ghz', { palette: 1, tile: 2 });
      expect(useClassicObjectArtStore.getState().sprites.get('24:0')?.width).toBe(9);
    } finally { restore(); }
  });

  // --- clock separation (the composer-freeze fix) ---------------------------
  // These lock the whole point of splitting paletteEpoch/tileEpoch off the coarse
  // chunkEpoch: a tile or block edit must NOT rebuild sprites that cannot have
  // changed, while a palette edit must still rebuild everything.

  it('a TILE-clock bump does NOT rebuild a file-backed sprite', async () => {
    // GHZ $1F (Crabmeat) reads its tiles from a .nem on disk — no in-editor tile
    // edit can change it. Before the split this rebuilt on every pencil stroke.
    const builds = vi.fn(async () => fakeSprite(1));
    __setObjectSpriteBuilderForTest(builds);
    const restore = stubReadMany();
    try {
      await refreshClassicObjectSprites('dir', fileBackedDoc(), 'ghz', { palette: 1, tile: 1 });
      expect(builds).toHaveBeenCalledTimes(1);
      await refreshClassicObjectSprites('dir', fileBackedDoc(), 'ghz', { palette: 1, tile: 2 });
      expect(builds).toHaveBeenCalledTimes(1); // still cached — no rebuild
      await refreshClassicObjectSprites('dir', fileBackedDoc(), 'ghz', { palette: 1, tile: 3 });
      expect(builds).toHaveBeenCalledTimes(1);
    } finally { restore(); }
  });

  it('a PALETTE bump still rebuilds every sprite (both art sources)', async () => {
    // The correctness guard on the optimization: palette colors are baked into
    // every sprite, so a palette edit must refresh the map's object previews.
    const builds = vi.fn(async () => fakeSprite(1));
    __setObjectSpriteBuilderForTest(builds);
    const restore = stubReadMany();
    try {
      const doc = { objects: [{ id: 0x1f, subtype: 0 }, { id: 0x18, subtype: 0 }], tiles: new Uint8Array([1]) } as unknown as LevelDoc;
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 1, tile: 1 });
      expect(builds).toHaveBeenCalledTimes(2);
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 2, tile: 1 });
      expect(builds).toHaveBeenCalledTimes(4); // BOTH rebuilt against the new palette
    } finally { restore(); }
  });

  it('a mixed act keeps file-backed sprites cached while LevelArt ones rebuild', async () => {
    // Both epochs coexist in the cache, so eviction must be set-based: a
    // single-epoch evict would drop one group on every refresh, leaving the
    // cache permanently cold — the rebuild storm this fix removes.
    const builds = vi.fn(async () => fakeSprite(1));
    __setObjectSpriteBuilderForTest(builds);
    const restore = stubReadMany();
    try {
      const doc = { objects: [{ id: 0x1f, subtype: 0 }, { id: 0x18, subtype: 0 }], tiles: new Uint8Array([1]) } as unknown as LevelDoc;
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 1, tile: 1 });
      expect(builds).toHaveBeenCalledTimes(2);
      // Three successive tile strokes: only the ONE LevelArt sprite rebuilds each
      // time. Before the split this was 2 rebuilds per stroke (6 total).
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 1, tile: 2 });
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 1, tile: 3 });
      await refreshClassicObjectSprites('dir', doc, 'ghz', { palette: 1, tile: 4 });
      expect(builds).toHaveBeenCalledTimes(5); // 2 + 1 + 1 + 1
      // The file-backed sprite survived every bump rather than being evicted.
      expect(useClassicObjectArtStore.getState().sprites.has('31')).toBe(true);
      expect(useClassicObjectArtStore.getState().sprites.has('24:0')).toBe(true);
    } finally { restore(); }
  });

  it('publishes only linked (non-null) sprites, skipping misses', async () => {
    __setObjectSpriteBuilderForTest(async (id) => (id === 2 ? fakeSprite(3) : null));
    await refreshClassicObjectSprites('dir', fakeDoc([2, 3]), 'ghz', clk(1));
    const map = useClassicObjectArtStore.getState().sprites;
    expect(map.get('2')?.width).toBe(3);
    expect(map.has('3')).toBe(false); // null miss not published
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
      await refreshClassicObjectSprites('dir', doc, 'ghz', clk(1));
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
