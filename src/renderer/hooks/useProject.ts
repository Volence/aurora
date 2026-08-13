import { useCallback } from 'react';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { openAeonProject } from '../state/aeon-open';
import { projectDataRoot } from '../../core/config/s4-config';
import { serializeBgTiles } from '../../core/formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, serializeBgLibraryIndex } from '../../core/formats/bg-library';
import { serializeSectionMeta } from '../../core/formats/section-meta';
import { serializeCollAttr } from '../../core/formats/s4-collattr';
import { serializeNametable } from '../../core/formats/s4-nametable';
import { exportAct } from '../../core/export/index';
import { serializeTiles } from '../../core/export/tile-dedup';
import { useToastStore } from '../state/toastStore';

export function useProject() {
  const setLoading = useProjectStore((s) => s.setLoading);

  // Open a directory. A single project-registry fingerprint (Task 17) routes it:
  // a classic (disasm) project → 'opened', classicProjectStore owns the view; an
  // aeon match → 'not-classic', so we hand off to the untouched aeon loader; an
  // unrecognized dir → 'error', the classic store already surfaced the notice, so
  // there is nothing more to do here.
  const openPath = useCallback(async (dir: string) => {
    const classic = useClassicProjectStore.getState();
    const outcome = await classic.openDirectory(dir);
    if (outcome === 'opened') {
      // Register in recent-projects, mirroring the aeon path (openAeonProject
      // calls addRecentProject on success). Reopening a classic recent routes
      // back through here classic-first, so it re-detects and refreshes its entry.
      const name = useClassicProjectStore.getState().label ?? dir;
      await window.api.addRecentProject(dir, name);
    } else if (outcome === 'not-classic') {
      await openAeonProject(dir);
    }
  }, []);

  const openProject = useCallback(async () => {
    const dir = await window.api.selectDirectory();
    if (!dir) return;
    await openPath(dir);
  }, [openPath]);

  const saveProject = useCallback(async () => {
    const state = useProjectStore.getState();
    const { config, project } = state;
    if (!config || !project) return;

    const zone = getCurrentZone(state);
    const act = getCurrentAct(state);
    if (!zone || !act) return;

    const zoneConfig = config.zones.find(z => z.id === zone.id);
    const actConfig = zoneConfig?.acts.find(a => a.id === act.id);
    if (!actConfig) return;

    try {
      setLoading(true);
      const basePath = config.basePath;
      const dataPath = actConfig.dataPath;

      // Write per-section data files
      for (let i = 0; i < act.sections.length; i++) {
        const section = act.sections[i];
        if (!section) continue;

        const prefix = `${dataPath}section_${i}`;

        // Write nametable (.tiles.bin)
        const ntData = serializeNametable(section.tileGrid.nametable);
        await window.api.writeBinaryFile(basePath, `${prefix}.tiles.bin`, ntData.buffer as ArrayBuffer);

        // Write editable collision attr plane (.collattr.bin) — the authored
        // collision. (Legacy .coll.bin is no longer written; stray files from
        // older saves are ignored on load.)
        if (section.collisionEdit) {
          const caData = serializeCollAttr(section.collisionEdit);
          await window.api.writeBinaryFile(basePath, `${prefix}.collattr.bin`, caData.buffer as ArrayBuffer);
        }
        if (section.collisionEditB) {
          const cbData = serializeCollAttr(section.collisionEditB);
          await window.api.writeBinaryFile(basePath, `${prefix}.collattrb.bin`, cbData.buffer as ArrayBuffer);
        }

        // Write objects (.objects.json)
        const objectsJson = JSON.stringify(section.objects, null, 2);
        const objectsBytes = new TextEncoder().encode(objectsJson);
        await window.api.writeBinaryFile(basePath, `${prefix}.objects.json`, objectsBytes.buffer as ArrayBuffer);

        // Write rings (.rings.json)
        const ringsJson = JSON.stringify(section.rings, null, 2);
        const ringsBytes = new TextEncoder().encode(ringsJson);
        await window.api.writeBinaryFile(basePath, `${prefix}.rings.json`, ringsBytes.buffer as ArrayBuffer);

        // Write meta sidecar (.meta.json) — scalar refs (bgLayoutRef,
        // paletteRef). Written only when at least one ref is non-null; when
        // all refs are null we still OVERWRITE an existing sidecar (with
        // nulls) so a previously-saved ref that was cleared in-session cannot
        // resurrect on the next load. A read probe gates that overwrite so
        // the common all-default case creates no files.
        const metaJson = serializeSectionMeta({ bgLayoutRef: section.bgLayoutRef, paletteRef: section.paletteRef });
        const metaPath = `${prefix}.meta.json`;
        if (metaJson !== null) {
          const metaBytes = new TextEncoder().encode(metaJson);
          await window.api.writeBinaryFile(basePath, metaPath, metaBytes.buffer as ArrayBuffer);
        } else {
          try {
            await window.api.readBinaryFile(basePath, metaPath);
            const clearedBytes = new TextEncoder().encode(JSON.stringify({ bgLayoutRef: null, paletteRef: null }, null, 2));
            await window.api.writeBinaryFile(basePath, metaPath, clearedBytes.buffer as ArrayBuffer);
          } catch {
            // no stale sidecar to clear
          }
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
        await window.api.writeBinaryFile(basePath, config.chunkLibraryPath, chunksBytes.buffer as ArrayBuffer);
      }

      // Persist each zone's tileset to an editor-owned path. The configured
      // tileset may point into the engine's regenerated data/generated tree
      // (or even alias the legacy chunks_tiles.bin), so we always write to
      // <dataRoot>editor/ and retarget project.json to it. Without this, MCP
      // write_tiles and imported/merged art vanish on reload. The root is
      // derived from the project layout (projectDataRoot) so post-split engine
      // repos get games/<game>/data/editor/, never a repo-root data/ dir.
      const dataRoot = projectDataRoot(config.raw);
      let configChanged = false;
      for (const projZone of project.zones) {
        const editorTilesetPath = `${dataRoot}editor/${projZone.id}_tiles.bin`;
        const tileBytes = serializeTiles(projZone.tileset.tiles);
        await window.api.writeBinaryFile(basePath, editorTilesetPath, tileBytes.buffer as ArrayBuffer);

        const rawZone = config.raw.zones.find(rz => rz.id === projZone.id);
        if (rawZone && rawZone.tileset !== editorTilesetPath) {
          rawZone.tileset = editorTilesetPath;
          configChanged = true;
        }
      }

      // Persist the current act's background (Plane B) to editor-owned paths,
      // mirroring the tileset retarget above: the configured bgLayout/bgTiles
      // may point into the engine's regenerated data/generated tree, so edits
      // (set-bg commands, BG-layer painting) would vanish on reload otherwise.
      if (act.bgLayout && act.bgTiles) {
        const editorBgLayoutPath = `${dataRoot}editor/${zone.id}_${act.id}_bg.bin`;
        const editorBgTilesPath = `${dataRoot}editor/${zone.id}_${act.id}_bg_tiles.bin`;
        // Editor-owned BG files stay in the LOCAL index convention (in-memory
        // arrays serialized verbatim) — the engine build pipeline regenerates
        // its own VRAM-absolute files. On reload, normalizeBgLayout detects
        // local indices and passes them through, so load(save(state))
        // reproduces the in-memory arrays exactly.
        const bgLayoutBytes = serializeNametable(act.bgLayout);
        await window.api.writeBinaryFile(basePath, editorBgLayoutPath, bgLayoutBytes.buffer as ArrayBuffer);
        const bgTileBytes = serializeBgTiles(act.bgTiles);
        await window.api.writeBinaryFile(basePath, editorBgTilesPath, bgTileBytes.buffer as ArrayBuffer);

        const rawAct = config.raw.zones.find(rz => rz.id === zone.id)
          ?.acts.find(ra => ra.id === act.id);
        if (rawAct && (rawAct.bgLayout !== editorBgLayoutPath || rawAct.bgTiles !== editorBgTilesPath)) {
          rawAct.bgLayout = editorBgLayoutPath;
          rawAct.bgTiles = editorBgTilesPath;
          configChanged = true;
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
        await window.api.writeBinaryFile(basePath, bgLibIndexPath(dataRoot, zone.id), indexBytes.buffer as ArrayBuffer);
        for (const entry of project.bgLibrary) {
          const layoutBytes = serializeNametable(entry.layout);
          await window.api.writeBinaryFile(basePath, bgLibLayoutPath(dataRoot, zone.id, entry.id), layoutBytes.buffer as ArrayBuffer);
          const tileBytes = serializeBgTiles(entry.tiles);
          await window.api.writeBinaryFile(basePath, bgLibTilesPath(dataRoot, zone.id, entry.id), tileBytes.buffer as ArrayBuffer);
        }
      }

      if (configChanged) {
        const projectJsonBytes = new TextEncoder().encode(JSON.stringify(config.raw, null, 2));
        await window.api.writeBinaryFile(basePath, 'project.json', projectJsonBytes.buffer as ArrayBuffer);
      }

      // RE-ENTRY HAZARD closure: the load-time atlas migration re-runs any
      // time chunks_tiles.bin parses non-empty, and it is not idempotent in
      // general. Now that the unified tileset is saved to the editor-owned
      // path and project.json points there, truncate the legacy atlas so the
      // migration can never re-enter on the merged data.
      // Guards (both must pass — belt-and-braces):
      //   1. legacyAtlasMerged — the migration actually ran and succeeded
      //      during the current load. If chunks.json failed to parse on load
      //      (swallowed in the catch block), the migration was skipped and we
      //      must NOT truncate — doing so would permanently destroy tile art
      //      that was never merged into the zone tileset. The aeon loader
      //      (core/project/aeon/load.ts) returns this flag on open and the glue
      //      commits it to the store via openLoaded, so we read it from there.
      //   2. aliasesLiveTileset check — skip if that path is still some zone's
      //      CURRENT raw-config tileset (i.e. the retarget above didn't move
      //      it). In the OJZ project the configured tileset literally aliases
      //      chunks_tiles.bin; truncating the live tileset file would destroy
      //      zone art.
      if (config.chunkLibraryPath && useProjectStore.getState().legacyAtlasMerged) {
        const atlasTruncatePath = config.chunkLibraryPath.replace('.json', '_tiles.bin');
        const aliasesLiveTileset = config.raw.zones.some(rz => rz.tileset === atlasTruncatePath);
        if (!aliasesLiveTileset) {
          await window.api.writeBinaryFile(basePath, atlasTruncatePath, new ArrayBuffer(0));
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
        await window.api.writeBinaryFile(basePath, `${exportPath}act_descriptor.asm`, actAsmBytes.buffer as ArrayBuffer);

        const entityBytes = new TextEncoder().encode(result.entityDataAsm);
        await window.api.writeBinaryFile(basePath, `${exportPath}entity_data.asm`, entityBytes.buffer as ArrayBuffer);

        const vramBytes = new TextEncoder().encode(result.vramBasesAsm);
        await window.api.writeBinaryFile(basePath, `${exportPath}vram_bases.asm`, vramBytes.buffer as ArrayBuffer);

        for (const secBin of result.sectionBinaries) {
          await window.api.writeBinaryFile(basePath, `${exportPath}section_${secBin.index}.tiles.bin`, secBin.nametable.buffer as ArrayBuffer);
          await window.api.writeBinaryFile(basePath, `${exportPath}section_${secBin.index}.art.bin`, secBin.tileArt.buffer as ArrayBuffer);
        }
      } catch (exportErr) {
        console.warn('[save] Export step failed (non-fatal):', exportErr);
      }

      useEditorStore.getState().markClean();
      setLoading(false);
      useToastStore.getState().addToast('Project saved', 'success');
    } catch (err) {
      useProjectStore.getState().setError(err instanceof Error ? err.message : String(err));
      useToastStore.getState().addToast('Save failed', 'error');
    }
  }, []);

  return { openProject, openProjectByPath: openPath, saveProject };
}
