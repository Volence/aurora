import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore, spriteDocState, patchSpriteDoc, saveableDirtySpriteDocIds } from '../../state/spriteStore';
import type { AnimStepUI, CharacterAnimUI } from '../../state/spriteStore';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import { useToastStore } from '../../state/toastStore';
import { buildSpriteExport, buildDPLCData } from '../../../core/export/sprite-export';
import type { SpriteManifest } from '../../../core/export/sprite-export';
import { assembleSprite } from '../../../core/art/sprite-decompose';
import { writeAsmMappings, writeAsmDPLC } from '../../../core/export/sprite-asm-export';
import { reconstructDPLCSprite, reconstructWithAdapter, reconstructFromFrames } from '../../../core/import/sprite-import';
import { getAdapter } from '../../../core/formats/games';
import { parseTiles } from '../../../core/formats/tiles';
import { compressionFor } from '../../../core/compress';
import { encodeS1ArtWriteBack, type EditedFrame } from '../../../core/formats/games/s1-art-write';
import { parseAsmMappings, parseAsmDPLC, assembleDataAsm } from '../../../core/import/asm-mappings';
import type { SpriteFrame } from '../../../core/model/sprite-types';
import type { SpriteFormatAdapter } from '../../../core/formats/sprite-format-adapter';
import { discoverSpriteSets } from '../../../core/import/sprite-discovery';
import type { DiscoveredSpriteSet } from '../../../core/import/sprite-discovery';
import type { SpriteFormatId } from '../../../core/formats/sprite-format-adapter';
import type { CompressionKind } from '../../../core/compress';
import { parsePaletteLine, decodeGenesisColor } from '../../../core/formats/palette';
import { parseCharacterAnims, parseAnyAnimScript } from '../../../core/import/anim-import';
import { requestOpenTab } from '../../shell/tab-activation';
import { spriteDocTab } from '../../shell/tabs';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { resolveObjectArt, objectArtIsZoneFree } from '../../../core/project/profiles/s1-object-art';
import type { S1ZoneKey } from '../../../core/shell/session-persistence';
import { resolveObjectAnims } from '../../../core/project/profiles/s1-object-anims';
import type { SyncAnimEntry } from '../../../core/project/profiles/s1-object-anims';
import { parseS1DisasmAnimScript } from '../../../core/import/anim-import';
import { s1ObjectName, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import type { Color } from '../../../core/model/s4-types';
import type { ParsedAnim } from '../../../core/import/anim-import';

/** DUR_DYNAMIC (speed-scaled in-game) has no fixed hold — use this for editor playback. */
const DYNAMIC_PREVIEW_HOLD = 5;
import type { RawFrame } from '../../../core/art/sprite-decompose';
import type { PerFrameAnimation } from '../../../core/export/sprite-anim-export';

import { projectDataRoot } from '../../../core/config/s4-config';

/** The saved-sprites dir under the open project's data root (games/<game>/data/
 *  sprites post-split, data/sprites legacy) — never the engine repo root. */
function spritesDir(): string {
  const raw = useProjectStore.getState().config?.raw;
  return raw ? `${projectDataRoot(raw)}sprites` : 'data/sprites';
}
function spriteIndexPath(): string { return `${spritesDir()}/index.json`; }

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
    const dir = `${spritesDir()}/${name}`;
    const enc = new TextEncoder();
    await window.api.writeBinaryFile(base, `${dir}/mappings.bin`, toArrayBuffer(out.mappings));
    await window.api.writeBinaryFile(base, `${dir}/art.bin`, toArrayBuffer(out.art));
    if (out.dplc) await window.api.writeBinaryFile(base, `${dir}/dplc.bin`, toArrayBuffer(out.dplc));
    await window.api.writeBinaryFile(base, `${dir}/${name}_anims.asm`, toArrayBuffer(enc.encode(out.animAsm)));
    await window.api.writeBinaryFile(base, `${dir}/sprite.json`, toArrayBuffer(enc.encode(JSON.stringify(out.manifest, null, 2))));

    // Upsert the sprite index so Load can list it.
    const index = (await readJson<{ sprites: SpriteIndexEntry[] }>(base, spriteIndexPath())) ?? { sprites: [] };
    const entry: SpriteIndexEntry = { name, frameCount: out.manifest.frameCount, tileCount: out.manifest.tileCount };
    index.sprites = [...index.sprites.filter((s) => s.name !== name), entry].sort((a, b) => a.name.localeCompare(b.name));
    await window.api.writeBinaryFile(base, spriteIndexPath(), toArrayBuffer(enc.encode(JSON.stringify(index, null, 2))));

    // Exporting IS persisting the working sprite — clear the unsaved-edits flag
    // (reached only on the success path, after every write above resolved).
    useSpriteStore.getState().setUnsavedEdits(false);
    toast(`Exported "${name}" as ${format.toUpperCase()}: ${out.manifest.frameCount} frames, ${out.manifest.tileCount} tiles → ${dir}/`, 'success');
  } catch (e) {
    toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/**
 * Export the current sprite's MAPPINGS (+ DPLC if streaming) as Sonic-disassembly
 * macro source (spritePiece/dplcEntry), saved via a file dialog. Lets you port an
 * edited sprite back into a disassembly's native `.asm` form. Art is not included
 * (export it separately as a compressed binary, or via the engine export).
 */
export async function exportSpriteAsm(name: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const { frames, originX, originY, exportDplc } = useSpriteStore.getState();
  const palette = useArtStore.getState().paletteLine;
  if (frames.length === 0) { toast('No frames to export', 'error'); return; }

  const rawFrames: RawFrame[] = frames.map((b, i) => ({
    id: `f${i}`, pixels: b.data, width: b.width, height: b.height, originX, originY, palette, priority: false,
  }));
  try {
    let asm: string;
    if (exportDplc) {
      const d = buildDPLCData(rawFrames);
      asm = `${writeAsmMappings(d.frames, `Map_${name}`)}\n${writeAsmDPLC(d.perFrameTiles, `DPLC_${name}`)}`;
    } else {
      asm = writeAsmMappings(assembleSprite(rawFrames).frames, `Map_${name}`);
    }
    const ok = await window.api.saveFile(`Map_${name}.asm`, new TextEncoder().encode(asm).buffer as ArrayBuffer);
    if (ok) toast(`Exported "${name}" mappings as .asm${exportDplc ? ' (+ DPLC)' : ''}`, 'success');
  } catch (e) {
    toast(`ASM export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
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

/** Parent dir of a (possibly absolute) path — the guarded-write basePath. */
const dirOf = (p: string) => { const n = p.replace(/\\/g, '/'); const i = n.lastIndexOf('/'); return i < 0 ? '' : n.slice(0, i); };
/** Final path segment — the rel-path-safe filename under its parent dir. */
const baseOf = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;

/**
 * Capture the in-place ART save-back target after an S1 object sprite opens
 * (Task 15). Only S1, non-DPLC, Nemesis art gets a target — the write-back
 * re-encodes with Nemesis and keeps the read-only mappings, so any other shape
 * (DPLC, non-Nemesis, other games) is left with no source (edit/export only).
 * `loadSprite` already cleared any prior source, so a skip here leaves it null.
 * Non-fatal: a decode/stat failure just means no in-place save, not a broken open.
 */
async function captureS1ArtSource(
  game: SpriteFormatId,
  artCompression: CompressionKind,
  artBytes: Uint8Array,
  mappings: SpriteFrame[],
  originX: number,
  originY: number,
  hasDplc: boolean,
  basePath: string,
  relPath: string,
): Promise<void> {
  if (game !== 's1' || hasDplc || artCompression !== 'nemesis') return;
  try {
    const originalTiles = parseTiles(compressionFor('nemesis').decompress(artBytes));
    const expectedMtimeMs = await window.api.fileMtime(basePath, relPath);
    useSpriteStore.getState().setS1ArtSource({ basePath, relPath, expectedMtimeMs, originalTiles, mappings, originX, originY, frameCount: mappings.length });
  } catch { /* leave s1ArtSource null — sprite is still editable, just not save-back-able */ }
}

/** Are these the same pixels, buffer for buffer? Used to decide whether the
 *  document a save just wrote is still byte-identical to what went to disk. */
function framesEqual(a: PixelBuffer[], b: PixelBuffer[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x.width !== y.width || x.height !== y.height) return false;
    if (x.data.length !== y.data.length) return false;
    for (let j = 0; j < x.data.length; j++) if (x.data[j] !== y.data[j]) return false;
  }
  return true;
}

/**
 * Save edited S1 object ART back to its source `artnem/*.nem` (Task 15, spec §2.4).
 * Re-encodes the frames' pixels into the original tile layout with Nemesis behind
 * a self-check gate (encodeS1ArtWriteBack), then writes through the guarded IPC
 * (mtime conflict check). MAPPINGS ARE READ-ONLY: only art pixels save; shape/
 * frame changes the mappings can't express are silently not captured (the success
 * toast states the read-only limitation).
 *
 * `docId` names the document to write and defaults to the checked-out one. The
 * document is read BY ID (spriteDocState) and written back BY ID (patchSpriteDoc),
 * so saving a background tab needs NO checkout: the sprite pane renders the store
 * root, so a checkout would repaint the user's canvas with someone else's sprite
 * for the whole guarded write, and any stroke landing in that window would be
 * committed into the wrong document.
 *
 * DIRTY FLAG: `frames` is read synchronously, before the await. A stroke committed
 * while the write is in flight is therefore NOT in the bytes on disk, so the flag
 * is cleared only when the document's pixels still match what was written —
 * otherwise the save would park real work with no dirty dot, and closing the tab
 * would discard it without a prompt. (Palette/timeline edits are a separate,
 * pre-existing over-clear: this path writes art bytes only.)
 */
export async function saveSpriteArt(docId?: string): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const targetId = docId ?? useSpriteStore.getState().activeDocId;
  const doc = spriteDocState(targetId);
  if (!doc) return; // not open — nothing to save, and nothing to say about it
  const src = doc.s1ArtSource;
  if (!src) { toast('This sprite has no S1 art source to save back to', 'error'); return; }

  const frames = doc.frames;
  // Frames pair to mappings BY INDEX; a changed frame count means add/delete/
  // reorder happened, which would write pixels into the wrong tiles. Refuse
  // rather than silently corrupt art (mappings can't grow/shrink for S1 in v1).
  if (frames.length !== src.frameCount) {
    toast(`Frame add/remove isn't writable for S1 (opened ${src.frameCount}, now ${frames.length}) — revert frame changes to save art`, 'error');
    return;
  }
  const editedFrames: EditedFrame[] = frames.map((f) => ({ indices: f.data, width: f.width, height: f.height }));
  const res = encodeS1ArtWriteBack(src.originalTiles, editedFrames, src.mappings, src.originX, src.originY);
  if (!res.ok) { toast(`Art save failed: ${res.error}`, 'error'); return; }

  let out;
  try {
    out = await window.api.writeGuarded(src.basePath, [{ relPath: src.relPath, bytes: res.bytes, expectedMtimeMs: src.expectedMtimeMs }]);
  } catch (e) {
    toast(`Art save failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return;
  }
  if ('conflicts' in out) {
    toast(`Save aborted — ${src.relPath} changed on disk since it was opened. Reopen to pick up external changes.`, 'error');
    return;
  }
  if (out.failed) { toast(`Art save failed at ${out.failed.path}: ${out.failed.message}`, 'error'); return; }

  // The document may have moved (checked out, parked, or edited) across the await
  // — re-read it rather than trusting the pre-write snapshot. A document closed
  // mid-write has nothing left to update.
  const after = spriteDocState(targetId);
  if (!after) { toast(`Saved art to ${src.relPath} — S1 mappings are read-only in v1`, 'success'); return; }

  // Refresh the guarded-write baseline so a follow-up save doesn't spuriously
  // conflict. Rebuilt from the document's CURRENT source (not the captured one)
  // so a concurrent reopen isn't clobbered by a stale snapshot.
  const nm = out.newMtimes[src.relPath];
  const liveSrc = after.s1ArtSource ?? src;
  patchSpriteDoc(targetId, { s1ArtSource: { ...liveSrc, expectedMtimeMs: nm ?? liveSrc.expectedMtimeMs } });

  const stillMatches = framesEqual(after.frames, frames);
  if (stillMatches) patchSpriteDoc(targetId, { unsavedEdits: false });
  toast(
    stillMatches
      ? `Saved art to ${src.relPath} — S1 mappings are read-only in v1`
      : `Saved art to ${src.relPath}, but edits made during the save are still unsaved — save again`,
    stillMatches ? 'success' : 'info',
  );
}

/**
 * Save ONE sprite document's art back to its source file, named by doc id. A thin
 * alias for saveSpriteArt(docId) — which addresses documents by id and needs no
 * checkout — kept as the name the save coordinator and tab-close path call.
 * A no-op for a document that isn't open.
 */
export async function saveSpriteDocArt(docId: string): Promise<void> {
  await saveSpriteArt(docId);
}

/**
 * Ctrl+S is Save ALL: write back every open sprite document that has unsaved
 * edits AND an in-place art target, not just whichever one happens to be checked
 * out. A background sprite tab's edits are real, and its dirty dot would
 * otherwise survive a save the user reasonably believed covered it.
 */
export async function saveAllSpriteArt(): Promise<void> {
  for (const docId of saveableDirtySpriteDocIds()) await saveSpriteDocArt(docId);
}

/** Frames from a mapping file: macro call-sites if present, else assemble raw dc.b/.w. */
function framesFromMapping(path: string, bytes: Uint8Array, adapter: SpriteFormatAdapter): SpriteFrame[] {
  if (!isAsm(path)) return adapter.readMappings(bytes);
  const text = new TextDecoder().decode(bytes);
  const macro = parseAsmMappings(text);
  return macro.length ? macro : adapter.readMappings(assembleDataAsm(text));
}

/** Per-frame DPLC source-tile lists from a DPLC file (macro or raw dc form). */
function dplcFromFile(path: string, bytes: Uint8Array, adapter: SpriteFormatAdapter): number[][] | undefined {
  if (!isAsm(path)) return adapter.readDPLC?.(bytes);
  const text = new TextDecoder().decode(bytes);
  const macro = parseAsmDPLC(text);
  return macro.length ? macro : adapter.readDPLC?.(assembleDataAsm(text));
}

/**
 * Import a sprite by picking its files in sequence: the MAPPING first (a `.asm`
 * disassembly file OR an extracted `.bin` — auto-detected), then its ART file, then
 * an OPTIONAL DPLC file (.asm/.bin). Read as the chosen game format; ART COMPRESSION
 * is chosen independently (it is per-sprite, not per-game — e.g. S3K art is often
 * Kosinski-moduled, uncompressed, or Nemesis). The format becomes the Save-as target.
 */
export async function openSprite(sourceFormat: SpriteFormatId = 's2', artCompression: CompressionKind = 'nemesis'): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const adapter = getAdapter(sourceFormat);
  const mapPath = await window.api.selectFile('Select mapping file (.asm or .bin)', [{ name: 'Mapping', extensions: ['asm', 'bin'] }]);
  if (!mapPath) return;
  const artPath = await window.api.selectFile('Select art file (.nem / .bin)', [{ name: 'Art', extensions: ['nem', 'bin'] }]);
  if (!artPath) return;
  const dplcPath = await window.api.selectFile('Optional DPLC file (.asm / .bin — cancel to skip)', [{ name: 'DPLC', extensions: ['asm', 'bin'] }]);
  try {
    const frames = framesFromMapping(mapPath, await readAbsolute(mapPath), adapter);
    if (frames.length === 0) { toast('No sprite mappings found in that file', 'error'); return; }

    const dplc = dplcPath ? dplcFromFile(dplcPath, await readAbsolute(dplcPath), adapter) : undefined;
    const artBytes = await readAbsolute(artPath);
    const recon = reconstructFromFrames(frames, artBytes, artCompression, dplc);
    const frameBufs = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));

    const name = nameFromPath(mapPath);
    useSpriteStore.getState().loadSprite(frameBufs, [], recon.originX, recon.originY);
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(!!dplc);
    useSpriteStore.getState().setFormat(sourceFormat);
    await captureS1ArtSource(sourceFormat, artCompression, artBytes, frames, recon.originX, recon.originY, !!dplc, dirOf(artPath), baseOf(artPath));
    toast(`Imported "${name}" as ${sourceFormat.toUpperCase()}: ${frameBufs.length} frames${dplc ? ' (DPLC)' : ''}`, 'success');
  } catch (e) {
    toast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}

/** Convert parsed animations into editor timeline animations for the current frames.
 *  Per-frame flips (S1 `2|aniXFlip` bytes) ride along on the step. */
function toTimelineAnims(parsed: ParsedAnim[], frameCount: number) {
  return parsed.map((a) => ({
    name: a.name,
    steps: a.frames
      .filter((f) => f.index < frameCount)
      .map((f) => ({
        frameIndex: f.index,
        duration: a.duration === 'dynamic' ? DYNAMIC_PREVIEW_HOLD : Math.max(1, a.duration),
        xFlip: f.xFlip,
        yFlip: f.yFlip,
      })),
  })).filter((a) => a.steps.length > 0);
}

/**
 * Convert transcribed SynchroAnimate rows (profiles/s1-object-anims) into
 * timeline entries. These are a read-only VIEW of the engine's global sync
 * counters — constant-rate channels play exactly; the channel-3 accumulator
 * plays its measured average, with the honest caveat riding along in `note`
 * (surfaced as the picker tooltip). Frames past the loaded frame count drop,
 * same as toTimelineAnims.
 */
export function syncedTimelineAnims(sync: readonly SyncAnimEntry[] | undefined, frameCount: number): CharacterAnimUI[] {
  return (sync ?? []).map((s) => ({
    name: s.name,
    synced: true,
    note: s.note,
    // AnimStepUI.duration follows the engine's RAW-byte convention: the
    // timeline holds each step (duration + 1) ticks (Timeline.tsx playback,
    // matching `_anim` scripts whose byte N holds N+1 frames). framesPerStep
    // is the TRUE period (SynchroAnimate resets its timer to `#N-1` for an
    // N-frame hold), so the step stores N-1 and plays exactly N.
    steps: s.frames
      .filter((f) => f < frameCount)
      .map((f) => ({ frameIndex: f, duration: s.framesPerStep - 1, xFlip: false, yFlip: false })),
  })).filter((a) => a.steps.length > 0);
}

/**
 * Load an animation script (.asm) for the CURRENT sprite — classic Sonic ($FF/$FE)
 * or S4-engine (AF_*) form, auto-detected. Populates the animation picker and loads
 * the first animation into the timeline. Frame indices past the loaded frame count
 * are dropped.
 */
export async function loadSpriteAnimations(): Promise<void> {
  const toast = useToastStore.getState().addToast;
  const animPath = await window.api.selectFile('Select animation script (.asm)', [{ name: 'ASM source', extensions: ['asm'] }]);
  if (!animPath) return;
  try {
    const parsed = parseAnyAnimScript(new TextDecoder().decode(await readAbsolute(animPath)));
    const frameCount = useSpriteStore.getState().frames.length;
    const anims = toTimelineAnims(parsed, frameCount);
    if (anims.length === 0) { toast('No animations found in that file', 'error'); return; }
    useSpriteStore.getState().setCharacterAnims(anims);
    useSpriteStore.getState().setSteps(anims[0].steps);
    toast(`Loaded ${anims.length} animation${anims.length > 1 ? 's' : ''} (showing "${anims[0].name}")`, 'success');
  } catch (e) {
    toast(`Load animations failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
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
 * Returns true when a sprite actually loaded, false on any handled failure (a
 * toast has already fired) — callers that switch UI on open (the edit-art handoff)
 * gate on it so a failed open doesn't strand the user on a blank/stale sprite.
 */
export async function openDiscoveredSet(baseDir: string, set: DiscoveredSpriteSet, artCompression: CompressionKind = 'nemesis'): Promise<boolean> {
  const toast = useToastStore.getState().addToast;
  try {
    const adapter = getAdapter(set.game);
    const mapBytes = new Uint8Array(await window.api.readBinaryFile(baseDir, set.mappings));
    const frames = framesFromMapping(set.mappings, mapBytes, adapter);
    if (frames.length === 0) { toast(`"${set.name}" has no readable sprite mappings`, 'error'); return false; }

    let artBytes: Uint8Array;
    let artBase: string, artRel: string; // guarded-write target for the save-back path
    if (set.art) {
      artBytes = new Uint8Array(await window.api.readBinaryFile(baseDir, set.art));
      artBase = baseDir; artRel = set.art;
    } else {
      const artPath = await window.api.selectFile(`Select art for "${set.name}" (Nemesis .nem / .bin)`, [{ name: 'Art', extensions: ['nem', 'bin'] }]);
      if (!artPath) { toast('Art file required to open the sprite', 'error'); return false; }
      artBytes = await readAbsolute(artPath);
      artBase = dirOf(artPath); artRel = baseOf(artPath);
    }
    const dplc = set.dplc
      ? dplcFromFile(set.dplc, new Uint8Array(await window.api.readBinaryFile(baseDir, set.dplc)), adapter)
      : undefined;

    const recon = reconstructFromFrames(frames, artBytes, artCompression, dplc);
    const frameBufs = recon.frames.map((data) => ({ width: recon.width, height: recon.height, data }));
    const name = sanitizeName(set.name);
    useSpriteStore.getState().loadSprite(frameBufs, [], recon.originX, recon.originY);
    useSpriteStore.getState().setName(name);
    useSpriteStore.getState().setExportDplc(!!dplc);
    useSpriteStore.getState().setFormat(set.game);
    await captureS1ArtSource(set.game, artCompression, artBytes, frames, recon.originX, recon.originY, !!dplc, artBase, artRel);
    toast(`Opened "${set.name}" (${set.game.toUpperCase()}): ${frameBufs.length} frames${dplc ? ' (DPLC)' : ''}`, 'success');
    return true;
  } catch (e) {
    toast(`Open "${set.name}" failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return false;
  }
}

// --- Edit-art handoff (Task B2) --------------------------------------------
//
// Injectable seam: the handoff opens through the SAME discovered-set path a
// manual pick uses (openDiscoveredSet — do NOT fork a parallel open), but tests
// substitute a canvas/IPC-free fake to verify the wiring (correct absolute base
// dir + disasm-relative paths). Mirrors the classic stores' `__set…ForTest`
// convention.
type SpriteSetOpener = (baseDir: string, set: DiscoveredSpriteSet, comp: CompressionKind) => Promise<boolean>;
let openSetImpl: SpriteSetOpener = openDiscoveredSet;
export function __setSpriteSetOpenerForTest(fn: SpriteSetOpener): void { openSetImpl = fn; }
export function __resetSpriteSetOpenerForTest(): void { openSetImpl = openDiscoveredSet; }

// Same seam for the animation-script read (node tests have no window.api; they
// substitute a reader that returns real _anim text straight from fs).
type AnimScriptReader = (baseDir: string, relPath: string) => Promise<string>;
const readAnimScript: AnimScriptReader = async (baseDir, relPath) =>
  new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(baseDir, relPath)));
let readAnimImpl: AnimScriptReader = readAnimScript;
export function __setAnimScriptReaderForTest(fn: AnimScriptReader | null): void { readAnimImpl = fn ?? readAnimScript; }

/**
 * Load a classic object's art + mappings into the CHECKED-OUT sprite document
 * (Task B2 / Task 14). The object id resolves to an `ObjectArtLink` (profiles/
 * s1-object-art.ts) against a ZONE that comes from, in order:
 *
 *   1. `zoneKey` — the tab's own persisted zone/act identity (S1ZoneKey), which
 *      is what lets a session-RESTORED sprite tab re-run its checkout with no
 *      act loaded (the activation glue passes it; see tab-activation/sprite.ts);
 *   2. the OPEN classic level's `ref` (the original, act-derived behavior);
 *   3. no zone at all — allowed ONLY for zone-free ids (objectArtIsZoneFree:
 *      one shared art file, e.g. Ring's artnem/Rings.nem), which resolve from
 *      the base map and therefore support a genuinely level-free open.
 *
 * The link's disasm-relative `artFile`/`mapAsm` are opened through
 * `openDiscoveredSet`, so the S1 Nemesis guarded save-back (captureS1ArtSource)
 * is captured EXACTLY as a manual pick's. Returns false (a no-op) for an
 * unlinked id, no open project, or a zonal id with no zone from any of the
 * three sources — the calling buttons only render for linked ids, so those are
 * guards. A failed open leaves the user where they were with an error toast.
 *
 * This does NOT open a tab and does NOT open a document of its own — it loads
 * into whichever document is currently checked out. Sprite-doc activation is what
 * checks out the object's own document first, so the pixels land there; calling
 * this directly loads over whatever the editor is showing.
 *
 * PRESELECTION: the objdef's declared `frame` is selected. The declared palette
 * LINE (`pal`) can't bind to a zone CRAM line — a classic session has no aeon
 * zone — so instead the sprite's STANDALONE palette is seeded from the classic
 * doc's `palettes[pal]`, the correct-colors outcome. It is set directly (not via
 * setStandalonePalette) because loadSprite just cleared history and this must not
 * record an undo step — mirroring loadEngineCharacter's direct zone-bind setState.
 */
/**
 * The 16 CRAM words a checkout seeds its standalone palette from. The OPEN
 * act's LIVE `doc.palettes` win whenever they describe the target zone —
 * unsaved palette edits must color the checkout, exactly as before. With no
 * matching act loaded (session restore; a zone-free level-free open), the
 * adapter's palette-only read serves the same composed lines from disk: the
 * target act when it exists, else the target zone's first available act, else
 * — no target zone at all — the project's first available act as a
 * representative palette (zone-free art like Ring draws from a line every
 * zone's palette carries). `undefined` = no palette source reachable; the
 * caller skips seeding rather than failing the art open — colors are the one
 * soft part of a checkout, the pixels and save-back target are not.
 */
async function checkoutPaletteLine(pal: number, target: S1ZoneKey | null): Promise<Uint16Array | undefined> {
  const lvl = useClassicLevelStore.getState();
  if (lvl.doc && lvl.ref && (!target || lvl.ref.zone === target.zone)) {
    return lvl.doc.palettes[pal] ?? lvl.doc.palettes[0];
  }
  const proj = useClassicProjectStore.getState();
  const readPalettes = proj.handle?.levels?.readPalettes;
  if (!readPalettes) return undefined;
  const tree = proj.zoneTree;
  const ref = target
    ? tree.find((r) => r.zone === target.zone && r.act === target.act)
      ?? tree.find((r) => r.zone === target.zone && r.available)
    : tree.find((r) => r.available);
  if (!ref) return undefined;
  try {
    const palettes = await readPalettes(ref);
    return palettes[pal] ?? palettes[0];
  } catch {
    return undefined; // palette seeding is optional — the art still opens
  }
}

export async function editObjectArtCheckout(id: number, zoneKey?: S1ZoneKey | null): Promise<boolean> {
  const openRef = useClassicLevelStore.getState().ref;
  const target: S1ZoneKey | null =
    zoneKey ?? (openRef ? { zone: openRef.zone, act: openRef.act } : null);
  if (!target && !objectArtIsZoneFree(id)) {
    useToastStore.getState().addToast('Open a classic level before editing object art', 'error');
    return false;
  }
  const dir = useClassicProjectStore.getState().dir;
  const link = resolveObjectArt(id, target?.zone);
  if (!dir || !link) return false;

  const name = sanitizeName(s1ObjectName(id) || s1ObjectHex(id));
  const comp: CompressionKind = link.compression === 'uncompressed' ? 'uncompressed' : 'nemesis';
  const set: DiscoveredSpriteSet = { name, game: 's1', mappings: link.mapAsm, art: link.artFile };

  const opened = await openSetImpl(dir, set, comp);
  if (!opened) return false; // open failed (a toast already fired) — stay in the level view

  useSpriteStore.getState().selectFrame(link.frame);

  const words = await checkoutPaletteLine(link.pal, target);
  if (words) {
    const colors: Color[] = Array.from({ length: 16 }, (_, i) => {
      const c = decodeGenesisColor(words[i] ?? 0);
      return i === 0 ? { ...c, a: 0 } : c; // index 0 is transparent (sprite convention)
    });
    useSpriteStore.setState({ paletteMode: 'standalone', standalonePalette: colors });
  }

  // AUTO-LOAD the object's S1 animation script (S1 anim Parcel 1): the
  // transcribed link table (profiles/s1-object-anims) names the `_anim/*.asm`
  // file; parse the s1disasm dialect and populate the SHIPPED timeline +
  // animation picker, exactly as loadSpriteAnimations would from a manual pick.
  // An unlinked object (static art, or a named exclusion like Sonic/Caterkiller)
  // stays empty-but-honest: loadSprite already cleared characterAnims/steps.
  // A read/parse failure keeps the art open usable — anims are optional.
  const animLink = resolveObjectAnims(id);
  if (animLink) {
    const animFrameCount = useSpriteStore.getState().frames.length;
    // Synced (SynchroAnimate) entries come straight from the transcription
    // table — no file read, and they LEAD the picker: the sync cycle is what
    // the object shows at rest in-level (Ring's spin), while the `_anim`
    // script is event-driven (Ring's collect sparkle).
    const timeline = syncedTimelineAnims(animLink.sync, animFrameCount);
    if (animLink.animAsm) {
      try {
        const { anims, problems } = parseS1DisasmAnimScript(await readAnimImpl(dir, animLink.animAsm));
        timeline.push(...toTimelineAnims(anims, animFrameCount));
        if (problems.length) {
          useToastStore.getState().addToast(
            `Animation script ${animLink.animAsm}: ${problems.length} entr${problems.length === 1 ? 'y' : 'ies'} not understood (loaded the rest)`, 'info');
        }
      } catch { /* anim script optional — synced entries (if any) still load */ }
    }
    if (timeline.length) {
      useSpriteStore.getState().setCharacterAnims(timeline);
      useSpriteStore.getState().setSteps(timeline[0].steps);
      // A fresh load-from-disk is not unsaved work (setSteps dirties).
      useSpriteStore.getState().setUnsavedEdits(false);
    }
  }
  return true;
}

/**
 * "Edit art…" from the classic object UI: surface the object's sprite-doc tab.
 *
 * Opening the tab is the WHOLE action — sprite-doc activation owns the document
 * lifecycle (check out an already-open one, or open a fresh one and run
 * editObjectArtCheckout into it), so this no longer checks out by hand and no
 * longer needs a discard confirm: a second object's art now opens ALONGSIDE the
 * first instead of replacing it. Returns whether the object's document ended up
 * checked out (false = the checkout failed and already toasted).
 */
export async function editObjectArt(id: number): Promise<boolean> {
  const tabId = 'doc:sprite:s1:' + id;
  const name = s1ObjectName(id); // named object, or its $XX hex fallback
  await requestOpenTab(spriteDocTab('s1', String(id), name));
  return useSpriteStore.getState().activeDocId === tabId;
}

/** Names of sprites the editor knows about (from data/sprites/index.json). */
export async function listSprites(): Promise<string[]> {
  const project = useProjectStore.getState().project;
  if (!project) return [];
  const index = await readJson<{ sprites: SpriteIndexEntry[] }>(project.basePath, spriteIndexPath());
  return (index?.sprites ?? []).map((s) => s.name);
}

/**
 * Load a sprite from data/sprites/<name>/ into the editor: reconstruct editable
 * frame bitmaps from mappings.bin + art.bin, and restore the timeline from the
 * manifest. Works for editor-exported sprites and any non-DPLC sprite whose art
 * is fully present in art.bin.
 *
 * Resolves TRUE when a sprite was actually loaded. Failures are toasted, not
 * thrown (this is also a direct UI action), so the boolean is the only honest
 * signal a CALLER has: the sprite-doc activation path used to assume success and
 * opened the tab onto a blank 32×32 document instead of rolling back.
 */
export async function loadSpriteByName(name: string): Promise<boolean> {
  const toast = useToastStore.getState().addToast;
  const project = useProjectStore.getState().project;
  if (!project) { toast('No project open', 'error'); return false; }
  const base = project.basePath;
  const dir = `${spritesDir()}/${name}`;
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
    return true;
  } catch (e) {
    toast(`Load failed for "${name}": ${e instanceof Error ? e.message : String(e)}`, 'error');
    return false;
  }
}

/**
 * Load a DPLC character (sonic / tails / knuckles) straight from the engine's
 * native layout (data/mappings, data/dplc unoptimized, art/uncompressed/characters)
 * into editable frames. EXPERIMENTAL: the named animations live in
 * <name>_anims.asm and are parsed into the picker. The character binds to zone
 * CRAM line 0, where its own palette is loaded so it looks right.
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
    // Bind the character to zone CRAM line 0 (the shared player palette) and load
    // its own colors there so it looks right.
    try {
      const palBytes = new Uint8Array(await window.api.readBinaryFile(base, `art/palettes/${name}.bin`));
      const colors = parsePaletteLine(palBytes, 0, 16).colors;
      const zone = getCurrentZone(useProjectStore.getState());
      if (zone) { zone.palette.lines[0].colors = colors; useArtStore.getState().bumpPaletteVersion(); }
    } catch { /* palette optional */ }
    // Set the bind directly (not via the history-recording actions): loadSprite
    // just cleared history, so a fresh character starts with an empty undo stack.
    useSpriteStore.setState({ paletteMode: 'zone', zoneLine: 0 });

    // Load the named animation scripts so they can be played in-editor.
    let animCount = 0;
    try {
      const asm = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(base, `data/animations/${name}_anims.asm`)));
      const parsed = parseCharacterAnims(asm);
      const charAnims = toTimelineAnims(parsed, frames.length);
      useSpriteStore.getState().setCharacterAnims(charAnims);
      if (charAnims[0]) useSpriteStore.getState().setSteps(charAnims[0].steps); // auto-load the first
      animCount = charAnims.length;
    } catch { /* anim script optional */ }
    // A fresh load-from-disk is not unsaved work (mirrors loadSprite): the
    // setSteps above dirties, so clear it back to clean here.
    useSpriteStore.getState().setUnsavedEdits(false);

    toast(`Loaded ${name}: ${frames.length} frames${animCount ? `, ${animCount} animations` : ''} (${recon.width}×${recon.height})`, 'success');
  } catch (e) {
    toast(`Load ${name} failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
  }
}
