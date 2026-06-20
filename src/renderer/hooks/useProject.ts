import { useCallback } from 'react';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useEditorStore } from '../state/editorStore';
import { loadCollisionProfiles } from './load-collision';

// Set to true only when migrateChunkTilesIntoTileset ran successfully during
// the current loadFullProject call. Reset at the top of each load so stale
// flag from a previous session cannot gate a truncation on the next save.
let legacyAtlasMergedThisLoad = false;

/** Derive the legacy chunk-tiles atlas path from the chunk-library JSON path. */
function legacyAtlasPath(chunkLibraryPath: string): string {
  return chunkLibraryPath.replace('.json', '_tiles.bin');
}
import { loadS4Config, type S4ProjectConfig } from '../../core/config/s4-config';
import { parseTiles } from '../../core/formats/tiles';
import { parseBgTiles, serializeBgTiles, normalizeBgLayout, BG_TILE_BASE_SLOT, BG_WIDTH } from '../../core/formats/bg-tiles';
import { bgLibIndexPath, bgLibLayoutPath, bgLibTilesPath, serializeBgLibraryIndex, parseBgLibraryIndex } from '../../core/formats/bg-library';
import { serializeSectionMeta, parseSectionMeta } from '../../core/formats/section-meta';
import { buildPalette } from '../../core/formats/palette';
import { parseNametable } from '../../core/formats/s4-nametable';
import { parseCollision } from '../../core/formats/s4-collision';
import { serializeNametable } from '../../core/formats/s4-nametable';
import { serializeCollision } from '../../core/formats/s4-collision';
import { serializeRingList } from '../../core/formats/s4-rings';
import { parseRingList } from '../../core/formats/s4-rings';
import { parseObjectList } from '../../core/formats/s4-objects';
import { serializeObjectList } from '../../core/formats/s4-objects';
import { parseStrips, STRIP_COLS, STRIP_ROWS } from '../../core/formats/s4-strips';
import { exportAct } from '../../core/export/index';
import { serializeTiles } from '../../core/export/tile-dedup';
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import { migrateChunkTilesIntoTileset } from '../../core/art/atlas-migration';
import { useToastStore } from '../state/toastStore';
import type {
  S4Project,
  Zone,
  Act,
  Section,
  Tile,
  Tileset,
  Palette,
  ObjectDef,
  ChunkDef,
  ObjectPlacement,
  RingPlacement,
  BgLibraryEntry,
} from '../../core/model/s4-types';

async function readFile(basePath: string, relativePath: string): Promise<Uint8Array> {
  const buffer = await window.api.readBinaryFile(basePath, relativePath);
  return new Uint8Array(buffer);
}

export function useProject() {
  const setConfig = useProjectStore((s) => s.setConfig);
  const setProject = useProjectStore((s) => s.setProject);
  const setLoading = useProjectStore((s) => s.setLoading);
  const setError = useProjectStore((s) => s.setError);
  const setPosition = useViewStore((s) => s.setPosition);

  const loadFromPath = useCallback(async (dir: string) => {
    try {
      setLoading(true);

      const jsonData = await readFile(dir, 'project.json');
      const json = JSON.parse(new TextDecoder().decode(jsonData)) as S4ProjectConfig;
      const config = loadS4Config(json, dir);

      // Load the full project BEFORE committing config to the store: a failed
      // load (e.g. atlas-migration abort) must not leave a new config paired
      // with a stale/absent project, or pollute the recent-projects list.
      const project = await loadFullProject(config);

      setConfig(config);
      await window.api.addRecentProject(dir, config.name);
      setProject(project);

      // Load the engine's collision tables (read-only view). Missing/unreadable
      // tables → null → the overlay falls back to flat fills (no crash).
      const collPath = config.raw.collisionDataPath ?? 'data/collision/';
      const collisionProfiles = await loadCollisionProfiles(config.basePath, collPath);
      useProjectStore.getState().setCollisionProfiles(collisionProfiles);

      if (config.zones.length > 0) {
        const zone = config.zones[0];
        if (zone.acts.length > 0) {
          useProjectStore.getState().setCurrentAct(zone.id, zone.acts[0].id);
        }
      }

      // Auto-detect dominant palette line from first non-null section's nametable
      if (project.zones.length > 0) {
        const firstZone = project.zones[0];
        const firstAct = firstZone.acts[0];
        if (firstAct) {
          const firstSection = firstAct.sections.find(s => s !== null);
          if (firstSection) {
            const lineCounts = [0, 0, 0, 0];
            for (let i = 0; i < firstSection.tileGrid.nametable.length; i++) {
              const word = firstSection.tileGrid.nametable[i];
              if ((word & 0x7FF) === 0) continue;
              const pal = (word >> 13) & 0x3;
              lineCounts[pal]++;
            }
            let dominant = 0;
            for (let i = 1; i < 4; i++) {
              if (lineCounts[i] > lineCounts[dominant]) dominant = i;
            }
            useEditorStore.getState().setSelectedPaletteLine(dominant);
          }
        }
      }

      setPosition(0, 0);
      setLoading(false);
      useToastStore.getState().addToast(`Opened ${config.name}`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openProject = useCallback(async () => {
    const dir = await window.api.selectDirectory();
    if (!dir) return;
    await loadFromPath(dir);
  }, [loadFromPath]);

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

        // Write collision (.coll.bin)
        const collData = serializeCollision(section.tileGrid.collision);
        await window.api.writeBinaryFile(basePath, `${prefix}.coll.bin`, collData.buffer as ArrayBuffer);

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
          collision: Array.from(chunk.collision),
        }));
        const chunksJson = JSON.stringify(serializedChunks);
        const chunksBytes = new TextEncoder().encode(chunksJson);
        await window.api.writeBinaryFile(basePath, config.chunkLibraryPath, chunksBytes.buffer as ArrayBuffer);
      }

      // Persist each zone's tileset to an editor-owned path. The configured
      // tileset may point into the engine's regenerated data/generated tree
      // (or even alias the legacy chunks_tiles.bin), so we always write to
      // data/editor/ and retarget project.json to it. Without this, MCP
      // write_tiles and imported/merged art vanish on reload.
      let configChanged = false;
      for (const projZone of project.zones) {
        const editorTilesetPath = `data/editor/${projZone.id}_tiles.bin`;
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
        const editorBgLayoutPath = `data/editor/${zone.id}_${act.id}_bg.bin`;
        const editorBgTilesPath = `data/editor/${zone.id}_${act.id}_bg_tiles.bin`;
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
        await window.api.writeBinaryFile(basePath, bgLibIndexPath(zone.id), indexBytes.buffer as ArrayBuffer);
        for (const entry of project.bgLibrary) {
          const layoutBytes = serializeNametable(entry.layout);
          await window.api.writeBinaryFile(basePath, bgLibLayoutPath(zone.id, entry.id), layoutBytes.buffer as ArrayBuffer);
          const tileBytes = serializeBgTiles(entry.tiles);
          await window.api.writeBinaryFile(basePath, bgLibTilesPath(zone.id, entry.id), tileBytes.buffer as ArrayBuffer);
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
      //   1. legacyAtlasMergedThisLoad — the migration actually ran and
      //      succeeded during the current load. If chunks.json failed to parse
      //      on load (swallowed in the catch block), the migration was skipped
      //      and we must NOT truncate — doing so would permanently destroy
      //      tile art that was never merged into the zone tileset.
      //   2. aliasesLiveTileset check — skip if that path is still some zone's
      //      CURRENT raw-config tileset (i.e. the retarget above didn't move
      //      it). In the OJZ project the configured tileset literally aliases
      //      chunks_tiles.bin; truncating the live tileset file would destroy
      //      zone art.
      if (config.chunkLibraryPath && legacyAtlasMergedThisLoad) {
        const atlasTruncatePath = legacyAtlasPath(config.chunkLibraryPath);
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
          await window.api.writeBinaryFile(basePath, `${exportPath}section_${secBin.index}.coll.bin`, secBin.collision.buffer as ArrayBuffer);
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

  return { openProject, openProjectByPath: loadFromPath, saveProject };
}

async function loadFullProject(config: ReturnType<typeof loadS4Config>): Promise<S4Project> {
  // Reset migration flag at the start of every load so a stale true from a
  // prior session cannot incorrectly gate truncation on the next save.
  legacyAtlasMergedThisLoad = false;

  const basePath = config.basePath;
  const zones: Zone[] = [];
  const bgLibrary: BgLibraryEntry[] = [];

  for (const zoneConfig of config.zones) {
    // Load tileset
    const tileData = await readFile(basePath, zoneConfig.tileset);
    const tiles = parseTiles(tileData);
    const tileset: Tileset = {
      tiles,
      collisionTypes: new Uint8Array(256), // TODO: load collision type table
    };

    // Load palette — level art at CRAM lines 1–3 (destOffset 16), and the shared
    // player palette (Sonic/Tails) into line 0, which every zone carries in-game.
    const palData = await readFile(basePath, zoneConfig.palette);
    const sources = [{ data: palData, srcOffset: 0, destOffset: 16, length: Math.min(48, Math.floor(palData.length / 2)) }];
    try {
      const playerPal = await readFile(basePath, 'art/palettes/SonicAndTails.bin');
      sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
    } catch {
      try {
        const playerPal = await readFile(basePath, 'art/palettes/sonic.bin');
        sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
      } catch { /* no player palette — line 0 stays empty */ }
    }
    const palette = buildPalette(sources);

    // Load acts
    const acts: Act[] = [];
    for (const actConfig of zoneConfig.acts) {
      const totalSections = actConfig.gridWidth * actConfig.gridHeight;
      const sections: (Section | null)[] = [];

      for (let i = 0; i < totalSections; i++) {
        const prefix = `${actConfig.dataPath}section_${i}`;

        try {
          const section = createSection(i, `Section ${i}`);

          // Try editor files first (user-saved data takes priority), then strip source
          let loaded = false;
          try {
            const ntRaw = await readFile(basePath, `${prefix}.tiles.bin`);
            const collRaw = await readFile(basePath, `${prefix}.coll.bin`);
            section.tileGrid.nametable = parseNametable(ntRaw, SECTION_TILES_WIDE, SECTION_TILES_HIGH);
            section.tileGrid.collision = parseCollision(collRaw, SECTION_TILES_WIDE, SECTION_TILES_HIGH);
            loaded = true;
          } catch {
            // No editor files — try strip source
          }

          // The engine's real per-cell collision attr indices come from the baked
          // strips. Load them into a read-only layer for the collision VIEW —
          // ALWAYS, independent of the editable .coll.bin above, which may hold a
          // crude/stale model (e.g. 0/1 solidity) that doesn't match the engine's
          // heightmap/angle/solidity tables. Also seed tileGrid from strips when no
          // editor files exist.
          if (actConfig.stripPath) {
            try {
              const stripPrefix = actConfig.stripPrefix || 'sec';
              const stripFile = `${actConfig.stripPath}${stripPrefix}${i}_strips_source.bin`;
              const stripRaw = await readFile(basePath, stripFile);
              const stripData = parseStrips(stripRaw);

              const engineColl = new Uint8Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
              for (let row = 0; row < STRIP_ROWS; row++) {
                for (let col = 0; col < STRIP_COLS; col++) {
                  const srcIdx = row * STRIP_COLS + col;
                  const dstIdx = row * SECTION_TILES_WIDE + col;
                  engineColl[dstIdx] = stripData.collision[srcIdx];
                  if (!loaded) {
                    section.tileGrid.nametable[dstIdx] = stripData.nametable[srcIdx];
                    section.tileGrid.collision[dstIdx] = stripData.collision[srcIdx];
                  }
                }
              }
              section.engineCollision = engineColl;
              loaded = true;
            } catch (stripErr) {
              const msg = stripErr instanceof Error ? stripErr.message : String(stripErr);
              console.error(`[STRIP_LOAD_FAIL] Section ${i}: ${msg}`);
            }
          }

          if (!loaded) {
            sections.push(null);
            continue;
          }

          // Load objects
          try {
            const objRaw = await readFile(basePath, `${prefix}.objects.json`);
            const objText = new TextDecoder().decode(objRaw);
            section.objects = JSON.parse(objText) as ObjectPlacement[];
          } catch {
            section.objects = [];
          }

          // Load rings
          try {
            const ringRaw = await readFile(basePath, `${prefix}.rings.json`);
            const ringText = new TextDecoder().decode(ringRaw);
            section.rings = JSON.parse(ringText) as RingPlacement[];
          } catch {
            section.rings = [];
          }

          // Load meta sidecar (bgLayoutRef/paletteRef) — optional, only
          // written when a section carries non-default refs.
          try {
            const metaRaw = await readFile(basePath, `${prefix}.meta.json`);
            const meta = parseSectionMeta(new TextDecoder().decode(metaRaw));
            section.bgLayoutRef = meta.bgLayoutRef;
            section.paletteRef = meta.paletteRef;
          } catch {
            // no meta sidecar — defaults from createSection stand
          }

          sections.push(section);
        } catch {
          // Section doesn't exist yet
          sections.push(null);
        }
      }

      // Load bg layout if present
      let bgLayout: Uint16Array | null = null;
      let bgTiles: import('../../core/model/s4-types').Tile[] | null = null;
      try {
        if (actConfig.bgLayout) {
          const bgRaw = await readFile(basePath, actConfig.bgLayout);
          const bgHeight = Math.floor(bgRaw.length / (BG_WIDTH * 2));
          // Normalize ONCE at load: engine-emitted layouts use VRAM-absolute
          // tile indices (BG_TILE_BASE_SLOT + n); the in-memory convention is
          // ALWAYS local to the BG blob (tile 0 = first blob tile). Editor-
          // saved files are already local and pass through unchanged.
          bgLayout = normalizeBgLayout(parseNametable(bgRaw, BG_WIDTH, bgHeight), BG_TILE_BASE_SLOT);
        }
        if (actConfig.bgTiles) {
          // parseBgTiles detects the engine blob's 2-byte byte-length header
          // (and accepts headerless dumps). The blob is used as-is — no blank
          // padding — because the layout above is normalized to local indices.
          const bgTileRaw = await readFile(basePath, actConfig.bgTiles);
          bgTiles = parseBgTiles(bgTileRaw);
        }
      } catch {
        // optional bg data
      }

      acts.push({
        id: actConfig.id,
        gridWidth: actConfig.gridWidth,
        gridHeight: actConfig.gridHeight,
        sections,
        startPosition: actConfig.startPosition,
        bgLayout,
        bgTiles,
        parallaxRef: actConfig.parallax,
      });
    }

    zones.push({
      id: zoneConfig.id,
      name: zoneConfig.name,
      acts,
      tileset,
      palette,
    });

    // Load the zone's BG library (editor-owned, optional): index JSON of
    // id/name plus per-entry layout/tile binaries. Editor-saved layouts are
    // already in the LOCAL index convention, so no normalization is needed
    // (parseBgTiles still detects the blob header shape). Entries accumulate
    // into the project-level library (single-zone assumption, like chunks).
    try {
      const idxRaw = await readFile(basePath, bgLibIndexPath(zoneConfig.id));
      const indexEntries = parseBgLibraryIndex(new TextDecoder().decode(idxRaw));
      for (const meta of indexEntries) {
        try {
          const layoutRaw = await readFile(basePath, bgLibLayoutPath(zoneConfig.id, meta.id));
          const tilesRaw = await readFile(basePath, bgLibTilesPath(zoneConfig.id, meta.id));
          const height = Math.floor(layoutRaw.length / (BG_WIDTH * 2));
          if (height < 1) continue;
          bgLibrary.push({
            id: meta.id,
            name: meta.name,
            layout: parseNametable(layoutRaw, BG_WIDTH, height),
            tiles: parseBgTiles(tilesRaw),
          });
        } catch (entryErr) {
          console.warn(`[load] BG library entry ${meta.id} failed to load:`, entryErr);
        }
      }
    } catch {
      // no BG library for this zone
    }
  }

  // Load object library
  let objectLibrary: ObjectDef[] = [];
  if (config.objectLibraryPath) {
    try {
      const objLibRaw = await readFile(basePath, config.objectLibraryPath);
      const objLibText = new TextDecoder().decode(objLibRaw);
      objectLibrary = JSON.parse(objLibText) as ObjectDef[];
    } catch {
      // no object library
    }
  }

  // Load chunk library
  let chunkLibrary: ChunkDef[] = [];
  let chunkTiles: Tile[] = [];
  if (config.chunkLibraryPath) {
    try {
      const chunkLibRaw = await readFile(basePath, config.chunkLibraryPath);
      const chunkLibText = new TextDecoder().decode(chunkLibRaw);
      const parsed = JSON.parse(chunkLibText) as Array<{
        id: string; name: string; widthTiles: number; heightTiles: number;
        nametable: number[]; collision: number[];
      }>;
      chunkLibrary = parsed.map(c => ({
        id: c.id,
        name: c.name,
        widthTiles: c.widthTiles,
        heightTiles: c.heightTiles,
        nametable: new Uint16Array(c.nametable),
        collision: new Uint8Array(c.collision),
      }));
    } catch {
      // no chunk library
    }

    // Load the legacy chunk-tiles atlas (chunks_tiles.bin) — used only as
    // migration input below; it is never put on the project object.
    try {
      const tilesRaw = await readFile(basePath, legacyAtlasPath(config.chunkLibraryPath));
      chunkTiles = parseTiles(tilesRaw);
    } catch {
      // no chunk tiles
    }
  }

  // Atlas unification: merge the legacy chunkTiles atlas into the zone tileset
  // and remap chunk-library/pinned-section nametables to zone-tileset indices.
  // At-most-once gate: only runs when chunks_tiles.bin parsed non-empty (the
  // migration is not idempotent in general — see its RE-ENTRY HAZARD note).
  // Single-zone assumption: the data model has ONE chunk library per project,
  // so we migrate into zones[0]'s tileset (the OJZ project has one zone).
  // Pointless-merge guard: with zero chunks there are no nametable entries to
  // remap, so merging the atlas would only bloat the tileset with orphan tiles.
  if (chunkTiles.length > 0 && chunkLibrary.length === 0) {
    console.warn(
      '[load] chunks_tiles.bin is non-empty but the chunk library is empty — skipping atlas migration (nothing references those tiles)',
    );
  }
  // TODO(art-suite follow-up): make chunks.json self-describing (tileSpace marker) so migration is idempotent without truncation ordering.
  if (chunkTiles.length > 0 && chunkLibrary.length > 0 && zones.length > 0) {
    try {
      const allSections = zones.flatMap(z => z.acts.flatMap(a => a.sections));
      const result = migrateChunkTilesIntoTileset(
        zones[0].tileset.tiles, chunkTiles, chunkLibrary, allSections,
      );
      // "checked" not "remapped": the count includes identity rewrites (on
      // projects where chunkTiles already equals the zone tileset, every
      // entry maps to itself).
      useToastStore.getState().addToast(
        `Tile atlases unified — ${result.appended} tiles merged, ${result.remapped} entries checked`,
        'success',
      );
      // Mark that migration ran successfully this load — saveProject uses this
      // to gate truncation of the legacy atlas (belt-and-braces with the alias
      // guard: BOTH must pass before we zero chunks_tiles.bin).
      legacyAtlasMergedThisLoad = true;
    } catch (err) {
      // Abort the load: post-migration code paths cannot render chunkTiles,
      // so a half-loaded project would reference the wrong atlas.
      throw new Error(
        `Atlas unification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    name: config.name,
    zones,
    objectLibrary,
    chunkLibrary,
    bgLibrary,
    basePath,
  };
}
