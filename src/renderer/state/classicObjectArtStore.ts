// Renderer-side object-sprite art for the classic (Sonic 1) viewport.
//
// The pure core (level-classic/object-sprite.ts) turns a mappings frame + decoded
// art into an indexed bitmap; this module does the IO + canvas half: read the
// object's art/mappings files from the open disasm (through the same per-file IPC
// FileAccess the project loader uses), render the declared frame against the act's
// LIVE palette line, and cache the resulting ImageBitmap for the viewport draw.
//
// CACHE KEY = `id:zone:epoch`. `epoch` is the store's `chunkEpoch`, which bumps on
// any palette edit (classicSetPalette → version-effect 'all'); object sprite colors
// come straight from `doc.palettes[link.pal]`, so re-keying on chunkEpoch is exactly
// the palette-version signal, no extra counter needed. There is therefore ONE cached
// canvas per (id, palette-version), never one per placement — every placement of the
// same id in a zone reuses the one bitmap.
//
// The published `sprites` map (id → ObjectSprite) is what the viewport / hit-test /
// library thumbnails read synchronously; a miss falls back to the hex box and kicks
// off an async load that republishes when ready.

import { create } from 'zustand';
import { decodeGenesisColor } from '../../core/formats/palette';
import { indicesToRGBA } from '../../core/art/sprite-render';
import { renderObjectFrameFromFiles, type RenderedObjectFrame } from '../../core/level-classic/object-sprite';
import { resolveObjectArt, type ObjectArtLink } from '../../core/project/profiles/s1-object-art';
import type { LevelDoc } from '../../core/level-classic/model';
import type { Color } from '../../core/model/s4-types';
import { createIpcFileAccess } from './classic-file-access';
import { ObjectSpriteCache } from './object-sprite-cache';

/** A rendered object sprite ready to blit: an ImageBitmap + its signed origin. */
export interface ObjectSprite {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

interface ClassicObjectArtState {
  /** Current-act object id → rendered sprite (present ids only). */
  sprites: Map<number, ObjectSprite>;
  /** Bumped whenever `sprites` is republished, so the viewport can redraw. */
  version: number;
  setSprites: (sprites: Map<number, ObjectSprite>) => void;
  reset: () => void;
}

export const useClassicObjectArtStore = create<ClassicObjectArtState>((set, get) => ({
  sprites: new Map(),
  version: 0,
  setSprites: (sprites) => set({ sprites, version: get().version + 1 }),
  reset: () => set({ sprites: new Map(), version: get().version + 1 }),
}));

/** Uint16 CRAM line → RGBA Color[] for indicesToRGBA (index 0 stays transparent). */
function paletteColors(doc: LevelDoc, line: number): Color[] {
  const words = doc.palettes[line] ?? doc.palettes[0] ?? new Uint16Array(16);
  const out: Color[] = [];
  for (let i = 0; i < 16; i++) out.push(decodeGenesisColor(words[i] ?? 0));
  return out;
}

/** Build context threaded through the cache to the real (canvas+IO) builder. */
interface BuildCtx {
  dir: string;
  doc: LevelDoc;
  /**
   * Optional byte cache prefetched by the caller in ONE batch round-trip (art +
   * mappings for every id in a refresh). When present the builder reads from it
   * instead of issuing two per-sprite IPC reads — collapsing ~2×N sprite reads
   * into a single round-trip. A missing entry falls back to a direct read.
   */
  prefetch?: Map<string, Uint8Array | null>;
}

async function buildSpriteFromFiles(
  dir: string, doc: LevelDoc, link: ObjectArtLink, prefetch?: Map<string, Uint8Array | null>,
): Promise<ObjectSprite | null> {
  const fa = createIpcFileAccess(dir);
  const readOne = async (p: string): Promise<Uint8Array> => {
    if (prefetch && prefetch.has(p)) {
      const b = prefetch.get(p);
      if (b === null || b === undefined) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      return b;
    }
    return fa.read(p);
  };
  const [artBytes, mapBytes] = await Promise.all([
    readOne(link.artFile),
    readOne(link.mapAsm),
  ]);
  const mapText = new TextDecoder('utf-8').decode(mapBytes);
  const frame: RenderedObjectFrame = renderObjectFrameFromFiles(
    mapText, artBytes, link.compression, link.frame,
  );
  // An all-transparent frame (bad frame index / empty mappings) is not useful —
  // treat it as a failure so the hex box shows instead of an invisible sprite.
  if (frame.width <= 0 || frame.height <= 0) return null;
  const rgba = indicesToRGBA(frame.indices, paletteColors(doc, link.pal));
  if (!rgba.some((v, i) => i % 4 === 3 && v !== 0)) return null; // fully transparent
  const img = new ImageData(new Uint8ClampedArray(rgba), frame.width, frame.height);
  const bitmap = await createImageBitmap(img);
  return { bitmap, width: frame.width, height: frame.height, originX: frame.originX, originY: frame.originY };
}

// The default builder (real IO + canvas). Indirected through `buildImpl` so tests
// can substitute a canvas-free fake (the refresh/stale-publish paths are then
// unit-testable without a DOM). See __setObjectSpriteBuilderForTest.
type SpriteBuilder = (id: number, zone: string, ctx: BuildCtx) => Promise<ObjectSprite | null>;
const defaultBuilder: SpriteBuilder = (id, zone, ctx) => {
  const link = resolveObjectArt(id, zone);
  return link ? buildSpriteFromFiles(ctx.dir, ctx.doc, link, ctx.prefetch) : Promise.resolve(null);
};
let buildImpl: SpriteBuilder = defaultBuilder;

/** Replace the sprite builder with a canvas-free fake (tests only). */
export function __setObjectSpriteBuilderForTest(fn: SpriteBuilder): void {
  buildImpl = fn;
}
/** Restore the real builder + wipe cache/generation (tests only). */
export function __resetObjectSpriteArtForTest(): void {
  buildImpl = defaultBuilder;
  spriteCache.clear();
  cacheDir = null;
  refreshGen = 0;
}

// The shared (id, zone, epoch) cache. Unlinked ids resolve to null (a cached
// miss); the disposer closes the GPU-backed ImageBitmap on eviction/clear.
const spriteCache = new ObjectSpriteCache<ObjectSprite, BuildCtx>(
  (id, zone, ctx) => buildImpl(id, zone, ctx),
  (sprite) => sprite.bitmap.close(),
);

// The dir the cache currently holds art for; a change wipes the cache (art bytes
// + palette are dir-specific and epochs from a prior project must not be reused).
let cacheDir: string | null = null;
// Refresh generation guard: a slow older-epoch Promise.all must not publish over
// a newer refresh. Only the latest generation's result is published.
let refreshGen = 0;

/**
 * Ensure the sprite for (id, zone, epoch) is loaded, returning it (or null on a
 * miss/failure). Cached + de-duplicated across concurrent callers.
 */
export async function loadObjectSprite(
  dir: string, doc: LevelDoc, id: number, zone: string, epoch: number,
  prefetch?: Map<string, Uint8Array | null>,
): Promise<ObjectSprite | null> {
  return spriteCache.load(id, zone, epoch, { dir, doc, prefetch });
}

/**
 * Refresh the published sprite map for the current act: render (or reuse cached)
 * every LINKED object id present in the doc, against the live palette. Called
 * when the act, palette epoch, or object-id set changes. Idempotent — cached
 * sprites are reused, so a palette-unchanged refresh does no re-render.
 *
 * Lifecycle guards: a project-dir change wipes the cache; a STALE publish (an
 * older-epoch Promise.all resolving after a newer refresh started) is dropped via
 * `refreshGen`; and old-epoch bitmaps are evicted AFTER the fresh map is published
 * (so the viewport never draws a just-closed bitmap).
 */
export async function refreshClassicObjectSprites(
  dir: string, doc: LevelDoc, zone: string, epoch: number,
): Promise<void> {
  if (dir !== cacheDir) {
    spriteCache.clear();
    cacheDir = dir;
  }
  const gen = ++refreshGen;
  const ids = new Set(doc.objects.map((o) => o.id));
  // Prefetch every linked id's art + mappings in ONE batch round-trip, then thread
  // the byte cache through the per-id builds. Without this each un-cached sprite
  // issues two separate IPC reads; on a fresh act load (the epoch busts the cache,
  // so every id rebuilds) that is ~2×N round-trips. `readMany` collapses them to
  // one. A superseded refresh still drops via the gen guard below.
  const fa = createIpcFileAccess(dir);
  let prefetch: Map<string, Uint8Array | null> | undefined;
  if (fa.readMany) {
    const wanted = new Set<string>();
    for (const id of ids) {
      const link = resolveObjectArt(id, zone);
      if (link) { wanted.add(link.artFile); wanted.add(link.mapAsm); }
    }
    if (wanted.size > 0) {
      const got = await fa.readMany([...wanted]);
      prefetch = new Map();
      for (const [p, e] of got) prefetch.set(p, e.bytes);
    }
  }
  const entries = await Promise.all(
    [...ids].map(async (id) => [id, await loadObjectSprite(dir, doc, id, zone, epoch, prefetch)] as const),
  );
  // Superseded by a newer refresh — drop this (stale) publish entirely.
  if (gen !== refreshGen) return;
  const map = new Map<number, ObjectSprite>();
  for (const [id, sprite] of entries) if (sprite) map.set(id, sprite);
  // ONE publish (and therefore ONE version bump) per refresh cycle, regardless of
  // how many sprites were (re)built: we await the whole Promise.all, assemble the
  // full map, and setSprites exactly once. This matters on GPU-poor machines where
  // each version bump forces a full viewport redraw — a per-sprite publish would be
  // ~N slow repaints (many seconds) instead of one. Locked by a regression test.
  useClassicObjectArtStore.getState().setSprites(map);
  // Evict prior-epoch bitmaps now that the current-epoch map is live.
  spriteCache.evictStale(epoch);
}

/** Wipe the cache + published map (project close / dir change). Test seam too. */
export function resetClassicObjectArt(): void {
  spriteCache.clear();
  cacheDir = null;
  refreshGen++;
  useClassicObjectArtStore.getState().reset();
}
