import { useProjectStore } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import type { AnimStepUI } from '../../state/spriteStore';
import { useToastStore } from '../../state/toastStore';
import { buildSpriteExport } from '../../../core/export/sprite-export';
import type { SpriteManifest } from '../../../core/export/sprite-export';
import { reconstructSpriteFrames, reconstructDPLCSprite } from '../../../core/import/sprite-import';
import { parsePaletteLine } from '../../../core/formats/palette';
import type { RawFrame } from '../../../core/art/sprite-decompose';
import type { PerFrameAnimation } from '../../../core/export/sprite-anim-export';

const SPRITES_DIR = 'data/sprites';
const INDEX_PATH = `${SPRITES_DIR}/index.json`;

interface SpriteIndexEntry { name: string; frameCount: number; tileCount: number; }

async function readJson<T>(basePath: string, rel: string): Promise<T | null> {
  try {
    const bytes = new Uint8Array(await window.api.readBinaryFile(basePath, rel));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** Copy a (possibly offset/shared) view into a standalone ArrayBuffer for IPC. */
function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer;
}

/**
 * Assemble the current sprite (frames + timeline) and write the engine artifacts
 * to s4_engine/data/sprites/<name>/ : mappings.bin, art.bin, <name>_anims.asm,
 * sprite.json (manifest). Reports via toast.
 */
export async function exportSprite(name: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const project = useProjectStore.getState().project;
  if (!project) { toast('No project open', 'error'); return; }

  const { frames, steps, originX, originY } = useSpriteStore.getState();
  const palette = useArtStore.getState().paletteLine;

  if (steps.length === 0) { toast('Add at least one animation step before exporting', 'error'); return; }

  const rawFrames: RawFrame[] = frames.map((b, i) => ({
    id: `f${i}`, pixels: b.data, width: b.width, height: b.height,
    originX, originY, palette, priority: false,
  }));
  const anim: PerFrameAnimation = {
    name: 'Loop',
    steps: steps.map((s) => ({ frame: s.frameIndex, duration: s.duration })),
    control: { kind: 'loop' },
  };

  try {
    const out = buildSpriteExport(name, rawFrames, anim);
    const base = project.basePath;
    const dir = `data/sprites/${name}`;
    const enc = new TextEncoder();
    await window.api.writeBinaryFile(base, `${dir}/mappings.bin`, toArrayBuffer(out.mappings));
    await window.api.writeBinaryFile(base, `${dir}/art.bin`, toArrayBuffer(out.art));
    await window.api.writeBinaryFile(base, `${dir}/${name}_anims.asm`, toArrayBuffer(enc.encode(out.animAsm)));
    await window.api.writeBinaryFile(base, `${dir}/sprite.json`, toArrayBuffer(enc.encode(JSON.stringify(out.manifest, null, 2))));

    // Upsert the sprite index so Load can list it.
    const index = (await readJson<{ sprites: SpriteIndexEntry[] }>(base, INDEX_PATH)) ?? { sprites: [] };
    const entry: SpriteIndexEntry = { name, frameCount: out.manifest.frameCount, tileCount: out.manifest.tileCount };
    index.sprites = [...index.sprites.filter((s) => s.name !== name), entry].sort((a, b) => a.name.localeCompare(b.name));
    await window.api.writeBinaryFile(base, INDEX_PATH, toArrayBuffer(enc.encode(JSON.stringify(index, null, 2))));

    toast(`Exported "${name}": ${out.manifest.frameCount} frames, ${out.manifest.tileCount} tiles → ${dir}/`, 'success');
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/** Names of sprites the editor knows about (from data/sprites/index.json). */
export async function listSprites(): Promise<string[]> {
  const project = useProjectStore.getState().project;
  if (!project) return [];
  const index = await readJson<{ sprites: SpriteIndexEntry[] }>(project.basePath, INDEX_PATH);
  return (index?.sprites ?? []).map((s) => s.name);
}

/**
 * Load a sprite from data/sprites/<name>/ into the editor: reconstruct editable
 * frame bitmaps from mappings.bin + art.bin, and restore the timeline from the
 * manifest. Works for editor-exported sprites and any non-DPLC sprite whose art
 * is fully present in art.bin.
 */
export async function loadSpriteByName(name: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const project = useProjectStore.getState().project;
  if (!project) { toast('No project open', 'error'); return; }
  const base = project.basePath;
  const dir = `${SPRITES_DIR}/${name}`;
  try {
    const mappings = new Uint8Array(await window.api.readBinaryFile(base, `${dir}/mappings.bin`));
    const art = new Uint8Array(await window.api.readBinaryFile(base, `${dir}/art.bin`));
    const recon = reconstructSpriteFrames(mappings, art);
    const frames = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));

    const manifest = await readJson<SpriteManifest>(base, `${dir}/sprite.json`);
    const steps: AnimStepUI[] = (manifest?.animSteps ?? [])
      .filter((s) => s.frame < frames.length)
      .map((s) => ({ frameIndex: s.frame, duration: s.duration }));

    useSpriteStore.getState().loadSprite(frames, steps, recon.originX, recon.originY);
    toast(`Loaded "${name}": ${frames.length} frames${steps.length ? `, ${steps.length} anim steps` : ''}`, 'success');
  } catch (e) {
    toast(`Load failed for "${name}": ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/**
 * Load a DPLC character (sonic / tails / knuckles) straight from the engine's
 * native layout (data/mappings, data/dplc unoptimized, art/uncompressed/characters)
 * into editable frames. EXPERIMENTAL: no timeline yet (the named animations live in
 * <name>_anims.asm, not parsed); colors use the active palette line, not the
 * character's own palette. Frames load so you can scrub/edit the poses.
 */
export async function loadEngineCharacter(name: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const project = useProjectStore.getState().project;
  if (!project) { toast('No project open', 'error'); return; }
  const base = project.basePath;
  try {
    const map = new Uint8Array(await window.api.readBinaryFile(base, `data/mappings/${name}.bin`));
    const dplc = new Uint8Array(await window.api.readBinaryFile(base, `data/dplc/${name}.bin`));
    const art = new Uint8Array(await window.api.readBinaryFile(base, `art/uncompressed/characters/${name}.bin`));
    const recon = reconstructDPLCSprite(map, dplc, art);
    const frames = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));
    useSpriteStore.getState().loadSprite(frames, [], recon.originX, recon.originY);
    // Load the character's own palette as a display override so it looks right.
    try {
      const palBytes = new Uint8Array(await window.api.readBinaryFile(base, `art/palettes/${name}.bin`));
      useSpriteStore.getState().setPaletteOverride(parsePaletteLine(palBytes, 0, 16).colors);
    } catch { /* palette optional — fall back to the active palette line */ }
    toast(`Loaded ${name}: ${frames.length} frames (${recon.width}×${recon.height})`, 'success');
  } catch (e) {
    toast(`Load ${name} failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}
