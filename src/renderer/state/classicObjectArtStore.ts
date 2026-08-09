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

// Module cache: keyed by `id:zone:epoch`. A `null` entry records a permanent
// failure for that key (missing file / decode error) so we don't retry every
// refresh. Survives store resets (keyed by epoch, which changes per palette edit
// and per act load — a fresh act bumps chunkEpoch too).
const spriteCache = new Map<string, ObjectSprite | null>();
const inFlight = new Map<string, Promise<ObjectSprite | null>>();

const cacheKey = (id: number, zone: string, epoch: number): string => `${id}:${zone}:${epoch}`;

/** Uint16 CRAM line → RGBA Color[] for indicesToRGBA (index 0 stays transparent). */
function paletteColors(doc: LevelDoc, line: number): Color[] {
  const words = doc.palettes[line] ?? doc.palettes[0] ?? new Uint16Array(16);
  const out: Color[] = [];
  for (let i = 0; i < 16; i++) out.push(decodeGenesisColor(words[i] ?? 0));
  return out;
}

async function buildSprite(
  dir: string, doc: LevelDoc, link: ObjectArtLink,
): Promise<ObjectSprite | null> {
  const fa = createIpcFileAccess(dir);
  const [artBytes, mapBytes] = await Promise.all([
    fa.read(link.artFile),
    fa.read(link.mapAsm),
  ]);
  const mapText = new TextDecoder().decode(mapBytes);
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

/**
 * Ensure the sprite for (id, zone, epoch) is loaded, returning it (or null on a
 * miss/failure). Cached + de-duplicated across concurrent callers.
 */
export async function loadObjectSprite(
  dir: string, doc: LevelDoc, id: number, zone: string, epoch: number,
): Promise<ObjectSprite | null> {
  const link = resolveObjectArt(id, zone);
  if (!link) return null;
  const key = cacheKey(id, zone, epoch);
  if (spriteCache.has(key)) return spriteCache.get(key)!;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = buildSprite(dir, doc, link)
    .catch(() => null)
    .then((sprite) => {
      spriteCache.set(key, sprite);
      inFlight.delete(key);
      return sprite;
    });
  inFlight.set(key, p);
  return p;
}

/**
 * Refresh the published sprite map for the current act: render (or reuse cached)
 * every LINKED object id present in the doc, against the live palette. Called
 * when the act, palette epoch, or object-id set changes. Idempotent — cached
 * sprites are reused, so a palette-unchanged refresh does no re-render.
 */
export async function refreshClassicObjectSprites(
  dir: string, doc: LevelDoc, zone: string, epoch: number,
): Promise<void> {
  const ids = new Set(doc.objects.map((o) => o.id));
  const entries = await Promise.all(
    [...ids].map(async (id) => [id, await loadObjectSprite(dir, doc, id, zone, epoch)] as const),
  );
  const map = new Map<number, ObjectSprite>();
  for (const [id, sprite] of entries) if (sprite) map.set(id, sprite);
  useClassicObjectArtStore.getState().setSprites(map);
}
