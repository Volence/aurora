// Renderer-side object-sprite art for the classic (Sonic 1) viewport.
//
// The pure core (level-classic/object-sprite.ts) turns a mappings frame + decoded
// art into an indexed bitmap; this module does the IO + canvas half: read the
// object's art/mappings files from the open disasm (through the same per-file IPC
// FileAccess the project loader uses), render the declared frame against the act's
// LIVE palette line, and cache the resulting ImageBitmap for the viewport draw.
//
// CACHE KEY = `id:zone:variant:epoch`, where `epoch` is now DERIVED PER SPRITE by
// `objectSpriteEpoch` from the store's two fine clocks (paletteEpoch, tileEpoch)
// rather than taken from the coarse `chunkEpoch`.
//
// Why: a sprite reads its palette line, and — only when `artSource:'levelArt'` —
// the act's tile pool. It never reads blocks or chunks. But `chunkEpoch` bumps on
// palette AND tile AND block edits, so keying on it meant every pencil stroke in
// the tile composer evicted and rebuilt EVERY sprite in the act (measured on GHZ
// act 1: 32 linked sprites, 34 files / ~41 KiB re-read over IPC, 25 Nemesis
// re-decodes, 32 fresh `createImageBitmap`s), and a block edit did all of that
// while changing no sprite at all. That per-stroke GPU-bitmap churn is what made
// the composer freeze after a few strokes on a GPU-poor machine.
//
// Now: a tile edit rebuilds only the LevelArt sprites (7 of 32 on GHZ act 1), a
// block edit rebuilds none, and a palette edit still rebuilds all — which is the
// one case that genuinely must. There is ONE cached canvas per
// (id, subtype-variant, epoch), never one per placement.
//
// The published `sprites` map (id → ObjectSprite) is what the viewport / hit-test /
// library thumbnails read synchronously; a miss falls back to the hex box and kicks
// off an async load that republishes when ready.

import { create } from 'zustand';
import { decodeGenesisColor } from '../../core/formats/palette';
import { indicesToRGBA } from '../../core/art/sprite-render';
import {
  renderResolvedObjectFrame, type RenderedObjectFrame,
} from '../../core/level-classic/object-sprite';
import { resolveObjectArt, type ObjectArtLink } from '../../core/project/profiles/s1-object-art';
import {
  resolveEffectiveObjectArt, objectHasSubtypeRule, objectArtKey,
} from '../../core/project/profiles/object-subtype-rules';
import { objectSpriteEpoch, type SpriteClocks } from '../../core/level-classic/object-sprite-clock';
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
  /**
   * The HIGH-priority piece pixels only (same size/origin as `bitmap`, all
   * other pixels transparent), or null/absent when no mappings piece carries
   * the priority bit — the common case, so nothing extra is allocated. The
   * occlusion pass re-blits this ABOVE the high-priority map pixels: on the
   * VDP a high sprite piece outranks even a high plane tile (layer order
   * ... B-high, A-high, sprite-high). Built from RenderedObjectFrame.priMask.
   */
  priBitmap?: ImageBitmap | null;
}

interface ClassicObjectArtState {
  /**
   * Current-act rendered sprites, keyed by `objectArtKey(id, zone, subtype)`:
   * `${id}` for a plain static object (one sprite per id) and `${id}:${subtype}`
   * for a subtype-rule object (one composed sprite per distinct subtype present).
   * `spriteFor` resolves the right key for a placement.
   */
  sprites: Map<string, ObjectSprite>;
  /** Bumped whenever `sprites` is republished, so the viewport can redraw. */
  version: number;
  setSprites: (sprites: Map<string, ObjectSprite>) => void;
  reset: () => void;
}

/**
 * Look up the rendered sprite for a placement (id + subtype) in the published map,
 * honouring subtype rules: rule objects are stored per-subtype, static ids under
 * their bare id. `zone` decides which of the two keys applies.
 */
export function spriteFor(
  sprites: Map<string, ObjectSprite>, id: number, zone: string, subtype: number,
): ObjectSprite | undefined {
  return sprites.get(objectArtKey(id, zone, subtype));
}

export const useClassicObjectArtStore = create<ClassicObjectArtState>((set, get) => ({
  sprites: new Map<string, ObjectSprite>(),
  version: 0,
  setSprites: (sprites) => set({ sprites, version: get().version + 1 }),
  reset: () => set({ sprites: new Map<string, ObjectSprite>(), version: get().version + 1 }),
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
  dir: string, doc: LevelDoc, id: number, zone: string, subtype: number,
  base: ObjectArtLink, prefetch?: Map<string, Uint8Array | null>,
): Promise<ObjectSprite | null> {
  // Resolve the EFFECTIVE link FIRST: a subtype rule can override the art file,
  // mappings, compression, and palette line (Spring $41 horizontal → Spring
  // Vertical.nem frame 3; Spring color + Newtron $42 flying → other palette lines).
  // Reading/decoding/palletizing against `base` here would render an override's
  // frame against the wrong tiles/palette. Mirrors scripts/render-classic-act.mjs.
  const { link: effLink, pieces } = resolveEffectiveObjectArt(id, zone, subtype, base);
  const fa = createIpcFileAccess(dir);
  const readOne = async (p: string): Promise<Uint8Array> => {
    if (prefetch && prefetch.has(p)) {
      const b = prefetch.get(p);
      if (b === null || b === undefined) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      return b;
    }
    return fa.read(p);
  };
  // LevelArt objects draw from the act's own tile pool (doc.tiles), NOT a .nem — so
  // read only the mappings; the tile source is doc.tiles (offset-shifted per the
  // link). File-backed objects read + decode their art file.
  const isLevelArt = effLink.artSource === 'levelArt';
  const [artBytes, mapBytes] = await Promise.all([
    isLevelArt ? Promise.resolve<Uint8Array | null>(null) : readOne(effLink.artFile),
    readOne(effLink.mapAsm),
  ]);
  const mapText = new TextDecoder('utf-8').decode(mapBytes);
  // ONE shared render path (renderResolvedObjectFrame): resolves the tile pool from
  // the art source + offset, then renders the single frame or composes rule pieces
  // (bridge logs, monitor shell + icon, stairs, LZ cork variants, …). Same call the
  // headless render harness makes — app + harness cannot diverge.
  const frame: RenderedObjectFrame = renderResolvedObjectFrame(
    {
      artSource: effLink.artSource, compression: effLink.compression,
      tileIndexOffset: effLink.tileIndexOffset, frame: effLink.frame, pieces,
    },
    mapText, artBytes, isLevelArt ? doc.tiles : null,
  );
  // An all-transparent frame (bad frame index / empty mappings) is not useful —
  // treat it as a failure so the hex box shows instead of an invisible sprite.
  if (frame.width <= 0 || frame.height <= 0) return null;
  const rgba = indicesToRGBA(frame.indices, paletteColors(doc, effLink.pal));
  if (!rgba.some((v, i) => i % 4 === 3 && v !== 0)) return null; // fully transparent
  const img = new ImageData(new Uint8ClampedArray(rgba), frame.width, frame.height);
  const bitmap = await createImageBitmap(img);
  const priBitmap = await buildPriBitmap(frame, rgba);
  return { bitmap, width: frame.width, height: frame.height, originX: frame.originX, originY: frame.originY, priBitmap };
}

/**
 * Build the hi-pri-pieces-only companion bitmap (ObjectSprite.priBitmap): the
 * frame's RGBA with every pixel whose winning piece is NOT high priority made
 * transparent. Null when the frame has no priority pieces at all (priMask null
 * or empty) — the occlusion pass then has nothing to re-raise.
 */
async function buildPriBitmap(frame: RenderedObjectFrame, rgba: Uint8Array): Promise<ImageBitmap | null> {
  const mask = frame.priMask;
  if (!mask) return null;
  let any = false;
  for (let i = 0; i < mask.length; i++) if (mask[i] !== 0) { any = true; break; }
  if (!any) return null;
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < mask.length; i++) if (mask[i] === 0) out[i * 4 + 3] = 0;
  return createImageBitmap(new ImageData(out, frame.width, frame.height));
}

// The default builder (real IO + canvas). Indirected through `buildImpl` so tests
// can substitute a canvas-free fake (the refresh/stale-publish paths are then
// unit-testable without a DOM). See __setObjectSpriteBuilderForTest.
//
// `variant` is the cache-variant string the store passes down: `''` for a static
// id (single declared frame) and the subtype string for a subtype-rule id (compose
// the rule's pieces). It is exactly the signal that decides the composed path, so
// the builder derives `hasRule`/`subtype` straight from it.
type SpriteBuilder = (id: number, zone: string, variant: string, ctx: BuildCtx) => Promise<ObjectSprite | null>;
const defaultBuilder: SpriteBuilder = (id, zone, variant, ctx) => {
  const base = resolveObjectArt(id, zone);
  if (!base) return Promise.resolve(null);
  // variant carries the subtype for rule ids ('' for static → subtype 0, which
  // resolveEffectiveObjectArt maps to the single-frame base link).
  const subtype = variant !== '' ? Number(variant) : 0;
  return buildSpriteFromFiles(ctx.dir, ctx.doc, id, zone, subtype, base, ctx.prefetch);
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

// The shared (id, zone, variant, epoch) cache. Static ids use variant `''` (so the
// key stays effectively id:zone:epoch — no per-subtype explosion); rule ids key by
// subtype. Unlinked ids resolve to null (a cached miss); the disposer closes the
// GPU-backed ImageBitmap on eviction/clear.
const spriteCache = new ObjectSpriteCache<ObjectSprite, BuildCtx>(
  (id, zone, variant, ctx) => buildImpl(id, zone, variant, ctx),
  (sprite) => { sprite.bitmap.close(); sprite.priBitmap?.close(); },
);

/** Cache variant (== publish-key discriminator) for a placement: '' static, subtype-string for rules. */
function variantFor(id: number, zone: string, subtype: number): string {
  return objectHasSubtypeRule(id, zone) ? String(subtype) : '';
}

// The dir the cache currently holds art for; a change wipes the cache (art bytes
// + palette are dir-specific and epochs from a prior project must not be reused).
let cacheDir: string | null = null;
// Refresh generation guard: a slow older-epoch Promise.all must not publish over
// a newer refresh. Only the latest generation's result is published.
let refreshGen = 0;

/**
 * Ensure the sprite for a placement (id + subtype) is loaded, returning it (or null
 * on a miss/failure). Static ids ignore subtype (cached under variant `''`); rule
 * ids compose per-subtype. Cached + de-duplicated across concurrent callers.
 */
export async function loadObjectSprite(
  dir: string, doc: LevelDoc, id: number, zone: string, subtype: number, epoch: number,
  prefetch?: Map<string, Uint8Array | null>,
): Promise<ObjectSprite | null> {
  return spriteCache.load(id, zone, variantFor(id, zone, subtype), epoch, { dir, doc, prefetch });
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
  dir: string, doc: LevelDoc, zone: string, clocks: SpriteClocks,
): Promise<void> {
  if (dir !== cacheDir) {
    spriteCache.clear();
    cacheDir = dir;
  }
  const gen = ++refreshGen;
  // Distinct PLACEMENTS to render, keyed by the publish key: `${id}` for a static
  // id (one sprite reused by every placement) and `${id}:${subtype}` for a rule id
  // (one composed sprite per distinct subtype present). A level with 40 identical
  // rings + 3 bridge subtypes yields ~2 keys for those, not 43.
  const wantKeys = new Map<string, { id: number; subtype: number }>();
  for (const o of doc.objects) {
    const key = objectArtKey(o.id, zone, o.subtype);
    if (!wantKeys.has(key)) wantKeys.set(key, { id: o.id, subtype: o.subtype });
  }
  // Prefetch every linked art + mappings file in ONE batch round-trip, then thread
  // the byte cache through the per-key builds. Without this each un-cached sprite
  // issues two separate IPC reads; on a fresh act load (the epoch busts the cache,
  // so every key rebuilds) that is ~2×N round-trips. `readMany` collapses them to
  // one. A superseded refresh still drops via the gen guard below.
  //
  // Only keys that will actually REBUILD are prefetched. Previously this batch
  // ran unconditionally, so even a refresh where every sprite was already cached
  // still re-read every art + mappings file over IPC. With the clocks split, a
  // tile edit leaves all file-backed sprites cached, and this loop then asks for
  // (usually) nothing at all.
  const fa = createIpcFileAccess(dir);
  let prefetch: Map<string, Uint8Array | null> | undefined;
  if (fa.readMany) {
    const wanted = new Set<string>();
    for (const { id, subtype } of wantKeys.values()) {
      const base = resolveObjectArt(id, zone);
      if (!base) continue;
      // Already cached at ITS epoch ⇒ load() will hit; reading its bytes again
      // would be pure waste.
      if (spriteCache.has(id, zone, variantFor(id, zone, subtype), objectSpriteEpoch(id, zone, subtype, clocks))) {
        continue;
      }
      // Prefetch the EFFECTIVE files so a rule's art-file override (e.g. Spring
      // Vertical.nem) batches too, instead of falling back to a per-sprite read.
      const { link } = resolveEffectiveObjectArt(id, zone, subtype, base);
      // LevelArt links have no real art file (sentinel 'LevelArt') — prefetch only
      // the mappings; the tiles come from doc.tiles at build time.
      if (link.artSource === 'file') wanted.add(link.artFile);
      wanted.add(link.mapAsm);
    }
    if (wanted.size > 0) {
      const got = await fa.readMany([...wanted]);
      prefetch = new Map();
      for (const [p, e] of got) prefetch.set(p, e.bytes);
    }
  }
  // Each sprite is loaded at ITS OWN epoch, so file-backed sprites survive a tile
  // edit while LevelArt ones rebuild against the edited pool.
  const live = new Set<number>();
  const entries = await Promise.all(
    [...wantKeys.entries()].map(async ([key, { id, subtype }]) => {
      const epoch = objectSpriteEpoch(id, zone, subtype, clocks);
      live.add(epoch);
      return [key, await loadObjectSprite(dir, doc, id, zone, subtype, epoch, prefetch)] as const;
    }),
  );
  // Superseded by a newer refresh — drop this (stale) publish entirely.
  if (gen !== refreshGen) return;
  const map = new Map<string, ObjectSprite>();
  for (const [key, sprite] of entries) if (sprite) map.set(key, sprite);
  // ONE publish (and therefore ONE version bump) per refresh cycle, regardless of
  // how many sprites were (re)built: we await the whole Promise.all, assemble the
  // full map, and setSprites exactly once. This matters on GPU-poor machines where
  // each version bump forces a full viewport redraw — a per-sprite publish would be
  // ~N slow repaints (many seconds) instead of one. Locked by a regression test.
  useClassicObjectArtStore.getState().setSprites(map);
  // Evict prior-epoch bitmaps now that the current-epoch map is live. `live` holds
  // every epoch this refresh legitimately used (the palette epoch for file-backed
  // sprites, the palette-or-tiles epoch for LevelArt ones) — evicting on a single
  // epoch would drop one of those two groups on every refresh.
  spriteCache.evictStale(live);
}

/** Wipe the cache + published map (project close / dir change). Test seam too. */
export function resetClassicObjectArt(): void {
  spriteCache.clear();
  cacheDir = null;
  refreshGen++;
  useClassicObjectArtStore.getState().reset();
}
