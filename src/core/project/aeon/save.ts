// Aeon project save — the renderer's saveProject (hooks/useProject.ts 161–379)
// ported to pure core. Serializes everything and returns the writes as data;
// the renderer glue (state/aeon-save.ts, a later task) does the actual IPC
// writes. The one read this needs (the stale meta-sidecar probe) goes through fa.
//
// Ordering parity: files[] preserves the original write order exactly
// (sections → chunk library → tilesets → act BG → BG library → project.json →
// legacy-atlas truncation → export outputs) so a partial failure mid-plan
// leaves the same on-disk shape as a partial failure did before the port.
//
// Delta parity note: the original's export-failure path did a
// `console.warn('[save] Export step failed (non-fatal):', ...)`. In core we
// stay side-effect-free: the failure surfaces as `exportError` (a string) and
// the renderer glue owns the warn.

import type { FileAccess } from '../adapter';
import { legacyAtlasPath } from './load';
import {
  projectDataRoot,
  type LoadedS4Config,
} from '../../config/s4-config';
import { serializeBgTiles } from '../../formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, serializeBgLibraryIndex } from '../../formats/bg-library';
import { serializeSectionMeta } from '../../formats/section-meta';
import { serializeNametable } from '../../formats/s4-nametable';
import { serializeCollAttr } from '../../formats/s4-collattr';
import { exportAct } from '../../export/index';
import { serializeTiles } from '../../export/tile-dedup';
import type { S4Project } from '../../model/s4-types';

export interface AeonSavePlan {
  /** Every write, in order, keyed by project-relative path. */
  files: { path: string; bytes: Uint8Array }[];
  /** True when project.json was retargeted (it is then also present in files). */
  configChanged: boolean;
  /** Non-fatal export-step failure (parity with the old console.warn path). */
  exportError: string | null;
}

export async function buildAeonSavePlan(
  fa: FileAccess,
  config: LoadedS4Config,
  project: S4Project,
  zoneId: string,
  actId: string,
  opts: { legacyAtlasMerged: boolean },
): Promise<AeonSavePlan> {
  const files: { path: string; bytes: Uint8Array }[] = [];
  let exportError: string | null = null;

  const zone = project.zones.find(z => z.id === zoneId);
  const act = zone?.acts.find(a => a.id === actId);
  const zoneConfig = config.zones.find(z => z.id === zoneId);
  const actConfig = zoneConfig?.acts.find(a => a.id === actId);
  if (!zone || !act || !zoneConfig || !actConfig) {
    throw new Error(`act not found: ${zoneId}/${actId}`);
  }

  const dataPath = actConfig.dataPath;

  // Write per-section data files
  for (let i = 0; i < act.sections.length; i++) {
    const section = act.sections[i];
    if (!section) continue;

    const prefix = `${dataPath}section_${i}`;

    // A file the LOAD could not read holds a placeholder in memory, not the
    // user's data — writing it back is how a truncated hand-edit or a
    // merge-conflict marker turns into a permanent loss of every placement in
    // the section. Same rule as the legacy-atlas guard below: a load-time parse
    // failure must not lead to destroying data.
    const understood = (suffix: string): boolean => !section.unreadable?.includes(suffix);

    // Write nametable (.tiles.bin)
    if (understood('tiles.bin')) {
      const ntData = serializeNametable(section.tileGrid.nametable);
      files.push({ path: `${prefix}.tiles.bin`, bytes: ntData });
    }

    // Write editable collision attr plane (.collattr.bin) — the authored
    // collision. (Legacy .coll.bin is no longer written; stray files from
    // older saves are ignored on load.)
    if (section.collisionEdit) {
      const caData = serializeCollAttr(section.collisionEdit);
      files.push({ path: `${prefix}.collattr.bin`, bytes: caData });
    }
    if (section.collisionEditB) {
      const cbData = serializeCollAttr(section.collisionEditB);
      files.push({ path: `${prefix}.collattrb.bin`, bytes: cbData });
    }

    // Write objects (.objects.json)
    if (understood('objects.json')) {
      const objectsJson = JSON.stringify(section.objects, null, 2);
      const objectsBytes = new TextEncoder().encode(objectsJson);
      files.push({ path: `${prefix}.objects.json`, bytes: objectsBytes });
    }

    // Write rings (.rings.json)
    if (understood('rings.json')) {
      const ringsJson = JSON.stringify(section.rings, null, 2);
      const ringsBytes = new TextEncoder().encode(ringsJson);
      files.push({ path: `${prefix}.rings.json`, bytes: ringsBytes });
    }

    // Write meta sidecar (.meta.json) — scalar refs (bgLayoutRef,
    // paletteRef). Written only when at least one ref is non-null; when
    // all refs are null we still OVERWRITE an existing sidecar (with
    // nulls) so a previously-saved ref that was cleared in-session cannot
    // resurrect on the next load. An exists probe gates that overwrite so
    // the common all-default case creates no files.
    const metaJson = serializeSectionMeta({ bgLayoutRef: section.bgLayoutRef, paletteRef: section.paletteRef });
    const metaPath = `${prefix}.meta.json`;
    if (metaJson !== null) {
      const metaBytes = new TextEncoder().encode(metaJson);
      files.push({ path: metaPath, bytes: metaBytes });
    } else if (await fa.exists(metaPath)) {
      const clearedBytes = new TextEncoder().encode(JSON.stringify({ bgLayoutRef: null, paletteRef: null }, null, 2));
      files.push({ path: metaPath, bytes: clearedBytes });
    }
  }

  // Save chunk library
  if (config.chunkLibraryPath && project.chunkLibrary.length > 0) {
    const serializedChunks = project.chunkLibrary.map(chunk => ({
      id: chunk.id,
      name: chunk.name,
      widthTiles: chunk.widthTiles,
      heightTiles: chunk.heightTiles,
      nametable: Array.from(chunk.nametable),
      collisionA: Array.from(chunk.collisionA),
      collisionB: Array.from(chunk.collisionB),
    }));
    const chunksJson = JSON.stringify(serializedChunks);
    const chunksBytes = new TextEncoder().encode(chunksJson);
    files.push({ path: config.chunkLibraryPath, bytes: chunksBytes });
  }

  // Persist each zone's tileset to an editor-owned path.
  //
  // INVARIANT (see the editor-destination note in config/s4-config.ts): the
  // bytes and the pointer that names them are the same file, and exactly one
  // party fixes it.
  //   • `editorTilesetPath` declared → the REPO owns the destination. Write
  //     there and leave `tileset` alone, so a pointer the repo maintains (a
  //     bake regenerates zones[0].tileset) is not clobbered on every save.
  //   • absent → AURORA owns it: write to <dataRoot>editor/ and retarget
  //     `tileset` to match. The configured tileset may point into the engine's
  //     regenerated data/generated tree (or even alias the legacy
  //     chunks_tiles.bin); without the retarget, MCP write_tiles and
  //     imported/merged art vanish on reload.
  // The root is derived from the project layout (projectDataRoot) so post-split
  // engine repos get games/<game>/data/editor/, never a repo-root data/ dir.
  const dataRoot = projectDataRoot(config.raw);
  let configChanged = false;
  for (const projZone of project.zones) {
    const rawZone = config.raw.zones.find(rz => rz.id === projZone.id);
    const tilesetDest = rawZone?.editorTilesetPath || `${dataRoot}editor/${projZone.id}_tiles.bin`;
    const tileBytes = serializeTiles(projZone.tileset.tiles);
    files.push({ path: tilesetDest, bytes: tileBytes });

    if (rawZone && !rawZone.editorTilesetPath && rawZone.tileset !== tilesetDest) {
      rawZone.tileset = tilesetDest;
      configChanged = true;
    }
  }

  // Persist the current act's background (Plane B) to editor-owned paths,
  // mirroring the tileset rule above, per field: a declared `editorBgLayout` /
  // `editorBgTiles` is the repo's destination and suppresses that pointer's
  // rewrite; absent, Aurora derives the path and retargets. Without the
  // retarget in the Aurora-owned case, edits (set-bg commands, BG-layer
  // painting) vanish on reload, because the configured bgLayout/bgTiles may
  // point into the engine's regenerated data/generated tree.
  if (act.bgLayout && act.bgTiles) {
    const rawAct = config.raw.zones.find(rz => rz.id === zone.id)
      ?.acts.find(ra => ra.id === act.id);
    const editorBgLayoutPath = rawAct?.editorBgLayout || `${dataRoot}editor/${zone.id}_${act.id}_bg.bin`;
    const editorBgTilesPath = rawAct?.editorBgTiles || `${dataRoot}editor/${zone.id}_${act.id}_bg_tiles.bin`;
    // Editor-owned BG files stay in the LOCAL index convention (in-memory
    // arrays serialized verbatim) — the engine build pipeline regenerates
    // its own VRAM-absolute files. On reload, normalizeBgLayout detects
    // local indices and passes them through, so load(save(state))
    // reproduces the in-memory arrays exactly.
    const bgLayoutBytes = serializeNametable(act.bgLayout);
    files.push({ path: editorBgLayoutPath, bytes: bgLayoutBytes });
    const bgTileBytes = serializeBgTiles(act.bgTiles);
    files.push({ path: editorBgTilesPath, bytes: bgTileBytes });

    if (rawAct) {
      if (!rawAct.editorBgLayout && rawAct.bgLayout !== editorBgLayoutPath) {
        rawAct.bgLayout = editorBgLayoutPath;
        configChanged = true;
      }
      if (!rawAct.editorBgTiles && rawAct.bgTiles !== editorBgTilesPath) {
        rawAct.bgTiles = editorBgTilesPath;
        configChanged = true;
      }
    }
  }

  // Persist the BG library (named alternate backgrounds sections can
  // reference) to editor-owned paths: an id/name index JSON plus
  // per-entry layout/tile binaries in the LOCAL index convention (same
  // round-trip guarantee as the act BG above). Single-zone assumption:
  // like the chunk library, the data model has ONE library per project,
  // keyed here under the current zone's id.
  if (project.bgLibrary.length > 0) {
    const indexBytes = new TextEncoder().encode(serializeBgLibraryIndex(project.bgLibrary));
    files.push({ path: bgLibIndexPath(dataRoot, zone.id), bytes: indexBytes });
    for (const entry of project.bgLibrary) {
      const layoutBytes = serializeNametable(entry.layout);
      files.push({ path: bgLibLayoutPath(dataRoot, zone.id, entry.id), bytes: layoutBytes });
      const tileBytes = serializeBgTiles(entry.tiles);
      files.push({ path: bgLibTilesPath(dataRoot, zone.id, entry.id), bytes: tileBytes });
    }
  }

  if (configChanged) {
    // A pointer rewrite should read as a pointer rewrite in review, nothing
    // else: 2-space indent (what the committed project.json already uses, so
    // every untouched line re-serializes byte-identically) plus the source
    // file's own trailing-newline state, carried across the parse by the
    // loader. Re-stringifying without it silently strips the last byte and
    // adds a spurious "\ No newline at end of file" to every such diff.
    const trailer = config.rawTrailingNewline ? '\n' : '';
    const projectJsonBytes = new TextEncoder().encode(JSON.stringify(config.raw, null, 2) + trailer);
    files.push({ path: 'project.json', bytes: projectJsonBytes });
  }

  // RE-ENTRY HAZARD closure: the load-time atlas migration re-runs any
  // time chunks_tiles.bin parses non-empty, and it is not idempotent in
  // general. Now that the unified tileset is saved to the editor-owned
  // path and project.json points there, truncate the legacy atlas so the
  // migration can never re-enter on the merged data.
  // Guards (both must pass — belt-and-braces):
  //   1. opts.legacyAtlasMerged — the migration actually ran and
  //      succeeded during the current load. If chunks.json failed to parse
  //      on load (swallowed in the catch block), the migration was skipped
  //      and we must NOT truncate — doing so would permanently destroy
  //      tile art that was never merged into the zone tileset.
  //   2. aliasesLiveTileset check — skip if that path holds live zone art.
  //      In the OJZ project the configured tileset literally aliases
  //      chunks_tiles.bin; zeroing the live tileset file destroys zone art.
  //
  //      INVARIANT: a path holds live zone art if, for any zone, it is either
  //      the pointer a reader follows (`tileset`, as project.json will be
  //      written out — the retarget above may just have moved it) or the
  //      destination this plan writes the zone's tile bytes to. Under the
  //      editor-destination rule those are the same path in each case, but
  //      which field names it differs: Aurora-owned zones have it in the
  //      (rewritten) `tileset`, repo-owned zones in `editorTilesetPath` with
  //      `tileset` left pointing wherever the repo put it. Both must count, so
  //      the guard reads both fields and never only the one that happens to be
  //      authoritative today.
  if (config.chunkLibraryPath && opts.legacyAtlasMerged) {
    const atlasTruncatePath = legacyAtlasPath(config.chunkLibraryPath);
    const liveTilesetPaths = new Set<string>();
    for (const rz of config.raw.zones) {
      liveTilesetPaths.add(rz.tileset);
      if (rz.editorTilesetPath) liveTilesetPaths.add(rz.editorTilesetPath);
    }
    if (!liveTilesetPaths.has(atlasTruncatePath)) {
      files.push({ path: atlasTruncatePath, bytes: new Uint8Array(0) });
    }
  }

  // Export assembly + binaries
  try {
    const result = exportAct(
      zone.id,
      act,
      zone.tileset,
      project.objectLibrary,
    );

    // Write export outputs
    const exportPath = `${dataPath}export/`;

    const actAsmBytes = new TextEncoder().encode(result.actDescriptorAsm);
    files.push({ path: `${exportPath}act_descriptor.asm`, bytes: actAsmBytes });

    const entityBytes = new TextEncoder().encode(result.entityDataAsm);
    files.push({ path: `${exportPath}entity_data.asm`, bytes: entityBytes });

    const vramBytes = new TextEncoder().encode(result.vramBasesAsm);
    files.push({ path: `${exportPath}vram_bases.asm`, bytes: vramBytes });

    for (const secBin of result.sectionBinaries) {
      files.push({ path: `${exportPath}section_${secBin.index}.tiles.bin`, bytes: secBin.nametable });
      files.push({ path: `${exportPath}section_${secBin.index}.art.bin`, bytes: secBin.tileArt });
    }
  } catch (exportErr) {
    exportError = exportErr instanceof Error ? exportErr.message : String(exportErr);
  }

  return { files, configChanged, exportError };
}
