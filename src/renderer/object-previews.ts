import { useProjectStore, getCurrentZone } from './state/projectStore';
import type { ObjectPreview } from './state/projectStore';
import { reconstructSpriteFrames, reconstructDPLCSprite } from '../core/import/sprite-import';
import { indicesToRGBA } from '../core/art/sprite-render';
import type { SpriteManifest } from '../core/export/sprite-export';
import type { Palette } from '../core/model/s4-types';

const BINDINGS_PATH = 'data/sprites/object-bindings.json';

/** objectId → saved-sprite name. Persisted editor-side (objectLibrary isn't saved). */
export type ObjectBindings = Record<string, string>;

async function tryRead(base: string, rel: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await window.api.readBinaryFile(base, rel)); } catch { return null; }
}
async function readJson<T>(base: string, rel: string): Promise<T | null> {
  const b = await tryRead(base, rel);
  if (!b) return null;
  try { return JSON.parse(new TextDecoder().decode(b)) as T; } catch { return null; }
}

export async function readObjectBindings(base: string): Promise<ObjectBindings> {
  return (await readJson<ObjectBindings>(base, BINDINGS_PATH)) ?? {};
}

async function writeObjectBindings(base: string, bindings: ObjectBindings): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(bindings, null, 2));
  await window.api.writeBinaryFile(base, BINDINGS_PATH, bytes.slice().buffer);
}

/** Render frame 0 of a saved sprite to an ImageBitmap + its origin. */
async function renderPreview(base: string, spriteName: string, palette: Palette): Promise<ObjectPreview | null> {
  const dir = `data/sprites/${spriteName}`;
  const map = await tryRead(base, `${dir}/mappings.bin`);
  const art = await tryRead(base, `${dir}/art.bin`);
  if (!map || !art) return null;
  const manifest = await readJson<SpriteManifest>(base, `${dir}/sprite.json`);
  const dplc = manifest?.dplc ? await tryRead(base, `${dir}/dplc.bin`) : null;

  const recon = dplc ? reconstructDPLCSprite(map, dplc, art) : reconstructSpriteFrames(map, art);
  if (recon.frames.length === 0) return null;
  const colors = palette.lines[manifest?.paletteLine ?? 0]?.colors ?? palette.lines[0]?.colors ?? [];
  const rgba = indicesToRGBA(recon.frames[0], colors);
  const img = new ImageData(new Uint8ClampedArray(rgba), recon.width, recon.height);
  const bitmap = await createImageBitmap(img);
  return { bitmap, originX: recon.originX, originY: recon.originY };
}

/** Read bindings, render each bound sprite's preview, and publish to the store. */
export async function refreshObjectPreviews(): Promise<void> {
  const project = useProjectStore.getState().project;
  const zone = getCurrentZone(useProjectStore.getState());
  if (!project || !zone) return;
  const base = project.basePath;
  const bindings = await readObjectBindings(base);
  const out = new Map<string, ObjectPreview>();
  for (const [objId, spriteName] of Object.entries(bindings)) {
    try {
      const p = await renderPreview(base, spriteName, zone.palette);
      if (p) out.set(objId, p);
    } catch { /* skip broken bindings */ }
  }
  useProjectStore.getState().setObjectSprites(out);
}

/** Assign (or clear, with '') a sprite to an object id, persist, and rebuild previews. */
export async function setObjectBinding(objId: string, spriteName: string): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project) return;
  const base = project.basePath;
  const bindings = await readObjectBindings(base);
  if (spriteName) bindings[objId] = spriteName; else delete bindings[objId];
  await writeObjectBindings(base, bindings);
  await refreshObjectPreviews();
}
