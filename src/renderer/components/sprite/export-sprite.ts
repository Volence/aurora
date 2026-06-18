import { useProjectStore } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import type { AnimStepUI } from '../../state/spriteStore';
import { useToastStore } from '../../state/toastStore';
import { buildSpriteExport } from '../../../core/export/sprite-export';
import type { SpriteManifest } from '../../../core/export/sprite-export';
import { reconstructDPLCSprite, reconstructWithAdapter, reconstructFromFrames } from '../../../core/import/sprite-import';
import { getAdapter } from '../../../core/formats/games';
import { parseAsmMappings, parseAsmDPLC } from '../../../core/import/asm-mappings';
import { discoverSpriteSets } from '../../../core/import/sprite-discovery';
import type { DiscoveredSpriteSet } from '../../../core/import/sprite-discovery';
import type { SpriteFormatId } from '../../../core/formats/sprite-format-adapter';
import { parsePaletteLine } from '../../../core/formats/palette';
import { parseCharacterAnims } from '../../../core/import/anim-import';

/** DUR_DYNAMIC (speed-scaled in-game) has no fixed hold — use this for editor playback. */
const DYNAMIC_PREVIEW_HOLD = 5;
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

  const { frames, steps, originX, originY, exportDplc, format } = useSpriteStore.getState();
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
    const out = buildSpriteExport(name, rawFrames, anim, { dplc: exportDplc, targetFormat: format });
    const base = project.basePath;
    const dir = `data/sprites/${name}`;
    const enc = new TextEncoder();
    await window.api.writeBinaryFile(base, `${dir}/mappings.bin`, toArrayBuffer(out.mappings));
    await window.api.writeBinaryFile(base, `${dir}/art.bin`, toArrayBuffer(out.art));
    if (out.dplc) await window.api.writeBinaryFile(base, `${dir}/dplc.bin`, toArrayBuffer(out.dplc));
    await window.api.writeBinaryFile(base, `${dir}/${name}_anims.asm`, toArrayBuffer(enc.encode(out.animAsm)));
    await window.api.writeBinaryFile(base, `${dir}/sprite.json`, toArrayBuffer(enc.encode(JSON.stringify(out.manifest, null, 2))));

    // Upsert the sprite index so Load can list it.
    const index = (await readJson<{ sprites: SpriteIndexEntry[] }>(base, INDEX_PATH)) ?? { sprites: [] };
    const entry: SpriteIndexEntry = { name, frameCount: out.manifest.frameCount, tileCount: out.manifest.tileCount };
    index.sprites = [...index.sprites.filter((s) => s.name !== name), entry].sort((a, b) => a.name.localeCompare(b.name));
    await window.api.writeBinaryFile(base, INDEX_PATH, toArrayBuffer(enc.encode(JSON.stringify(index, null, 2))));

    toast(`Exported "${name}" as ${format.toUpperCase()}: ${out.manifest.frameCount} frames, ${out.manifest.tileCount} tiles → ${dir}/`, 'success');
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

async function tryRead(base: string, rel: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await window.api.readBinaryFile(base, rel)); } catch { return null; }
}

/** Sanitize a folder name into a valid asm label for export. */
function sanitizeName(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `s_${cleaned}`;
}

/** Read a file by absolute path (selectFile returns absolute paths). */
async function readAbsolute(path: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(path, ''));
}

/** Strip a directory + extension from an absolute path to get a base sprite name. */
function nameFromPath(path: string): string {
  return sanitizeName(path.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.[^.]+$/, '') ?? 'Imported');
}

const isAsm = (path: string) => /\.asm$/i.test(path);

/**
 * Import a sprite by picking its files in sequence: the MAPPING first (a `.asm`
 * disassembly file OR an extracted `.bin` — auto-detected), then its ART file
 * (Nemesis for s1/s2/s3k, raw for s4), then an OPTIONAL DPLC file (.asm/.bin). Read
 * as the chosen game format, which becomes the Save-as target for cross-game porting.
 */
export async function openSprite(sourceFormat: SpriteFormatId = 's2'): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const adapter = getAdapter(sourceFormat);
  const mapPath = await window.api.selectFile('Select mapping file (.asm or .bin)', [{ name: 'Mapping', extensions: ['asm', 'bin'] }]);
  if (!mapPath) return;
  const artPath = await window.api.selectFile('Select art file (Nemesis .nem / .bin)', [{ name: 'Art', extensions: ['nem', 'bin'] }]);
  if (!artPath) return;
  const dplcPath = await window.api.selectFile('Optional DPLC file (.asm / .bin — cancel to skip)', [{ name: 'DPLC', extensions: ['asm', 'bin'] }]);
  try {
    const mapBytes = await readAbsolute(mapPath);
    const frames = isAsm(mapPath)
      ? parseAsmMappings(new TextDecoder().decode(mapBytes))
      : adapter.readMappings(mapBytes);
    if (frames.length === 0) { toast('No sprite mappings found in that file', 'error'); return; }

    let dplc: number[][] | undefined;
    if (dplcPath) {
      const dBytes = await readAbsolute(dplcPath);
      dplc = isAsm(dplcPath)
        ? parseAsmDPLC(new TextDecoder().decode(dBytes))
        : adapter.readDPLC?.(dBytes);
    }
    const recon = reconstructFromFrames(frames, await readAbsolute(artPath), adapter.artCompression, dplc);
    const frameBufs = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));

    const name = nameFromPath(mapPath);
    useSpriteStore.getState().loadSprite(frameBufs, [], recon.originX, recon.originY);
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(!!dplc);
    useSpriteStore.getState().setFormat(sourceFormat);
    toast(`Imported "${name}" as ${sourceFormat.toUpperCase()}: ${frameBufs.length} frames${dplc ? ' (DPLC)' : ''}`, 'success');
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

export interface ProjectScan { baseDir: string; sets: DiscoveredSpriteSet[]; }

/**
 * Scan a chosen disassembly project folder for sprite sets (mapping .asm paired
 * with sibling DPLC + art by the known layouts). Returns the base dir + detected
 * sets for the UI to list; opening a set re-validates by parsing it (6c).
 */
export async function scanProjectForSprites(): Promise<ProjectScan | null> {
  const toast = useToastStore.getState().addToast;
  const baseDir = await window.api.selectDirectory();
  if (!baseDir) return null;
  try {
    const files = await window.api.listProjectFiles(baseDir);
    const sets = discoverSpriteSets(files);
    if (sets.length === 0) toast('No sprite mapping .asm files found in that folder', 'info');
    return { baseDir, sets };
  } catch (e) {
    toast(`Project scan failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return null;
  }
}

/**
 * Open a discovered sprite set: read its mapping (+ DPLC) .asm and art relative to
 * the scanned base dir, parse the macro call-sites, and load. If the art file was
 * not auto-paired (s1/s2 store art under unrelated names), prompt for it manually.
 */
export async function openDiscoveredSet(baseDir: string, set: DiscoveredSpriteSet): Promise<void> {
  const toast = useToastStore.getState().addToast;
  try {
    const mapText = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(baseDir, set.mappings)));
    const frames = parseAsmMappings(mapText);
    if (frames.length === 0) { toast(`"${set.name}" has no parseable spritePiece mappings (raw bytes?)`, 'error'); return; }

    let artBytes: Uint8Array;
    if (set.art) {
      artBytes = new Uint8Array(await window.api.readBinaryFile(baseDir, set.art));
    } else {
      const artPath = await window.api.selectFile(`Select art for "${set.name}" (Nemesis .nem / .bin)`, [{ name: 'Art', extensions: ['nem', 'bin'] }]);
      if (!artPath) { toast('Art file required to open the sprite', 'error'); return; }
      artBytes = await readAbsolute(artPath);
    }
    const dplc = set.dplc
      ? parseAsmDPLC(new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(baseDir, set.dplc))))
      : undefined;

    const recon = reconstructFromFrames(frames, artBytes, getAdapter(set.game).artCompression, dplc);
    const frameBufs = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));
    const name = sanitizeName(set.name);
    useSpriteStore.getState().loadSprite(frameBufs, [], recon.originX, recon.originY);
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(!!dplc);
    useSpriteStore.getState().setFormat(set.game);
    toast(`Opened "${set.name}" (${set.game.toUpperCase()}): ${frameBufs.length} frames${dplc ? ' (DPLC)' : ''}`, 'success');
  } catch (e) {
    toast(`Open "${set.name}" failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
    const manifest = await readJson<SpriteManifest>(base, `${dir}/sprite.json`);
    const fmt: SpriteFormatId = manifest?.sourceFormat ?? 's4';
    const dplcBytes = manifest?.dplc ? await tryRead(base, `${dir}/dplc.bin`) : null;
    const recon = reconstructWithAdapter(getAdapter(fmt), mappings, art, dplcBytes ?? undefined);
    const frames = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));

    const steps: AnimStepUI[] = (manifest?.animSteps ?? [])
      .filter((s) => s.frame < frames.length)
      .map((s) => ({ frameIndex: s.frame, duration: s.duration }));

    useSpriteStore.getState().loadSprite(frames, steps, recon.originX, recon.originY);
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(!!manifest?.dplc); // default export mode to how it was saved
    useSpriteStore.getState().setFormat(fmt);
    toast(`Loaded "${name}" (${fmt.toUpperCase()}): ${frames.length} frames${steps.length ? `, ${steps.length} anim steps` : ''}`, 'success');
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
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(true); // characters are DPLC by nature
    // Load the character's own palette as a display override so it looks right.
    try {
      const palBytes = new Uint8Array(await window.api.readBinaryFile(base, `art/palettes/${name}.bin`));
      useSpriteStore.getState().setPaletteOverride(parsePaletteLine(palBytes, 0, 16).colors);
    } catch { /* palette optional — fall back to the active palette line */ }

    // Load the named animation scripts so they can be played in-editor.
    let animCount = 0;
    try {
      const asm = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(base, `data/animations/${name}_anims.asm`)));
      const parsed = parseCharacterAnims(asm);
      const charAnims = parsed.map((a) => ({
        name: a.name,
        steps: a.frames
          .filter((f) => f < frames.length)
          .map((f) => ({ frameIndex: f, duration: a.duration === 'dynamic' ? DYNAMIC_PREVIEW_HOLD : Math.max(1, a.duration) })),
      })).filter((a) => a.steps.length > 0);
      useSpriteStore.getState().setCharacterAnims(charAnims);
      if (charAnims[0]) useSpriteStore.getState().setSteps(charAnims[0].steps); // auto-load the first
      animCount = charAnims.length;
    } catch { /* anim script optional */ }

    toast(`Loaded ${name}: ${frames.length} frames${animCount ? `, ${animCount} animations` : ''} (${recon.width}×${recon.height})`, 'success');
  } catch (e) {
    toast(`Load ${name} failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}
