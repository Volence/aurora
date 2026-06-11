import { useCallback } from 'react';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { useEditorStore } from '../state/editorStore';
import { loadS4Config, type S4ProjectConfig } from '../../core/config/s4-config';
import { parseTiles } from '../../core/formats/tiles';
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
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
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

      setConfig(config);
      await window.api.addRecentProject(dir, config.name);

      const project = await loadFullProject(config);
      setProject(project);

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

        // Save chunk tiles as raw 4bpp binary
        if (project.chunkTiles.length > 0) {
          const tilesPath = config.chunkLibraryPath.replace('.json', '_tiles.bin');
          const tileBytes = new Uint8Array(project.chunkTiles.length * 32);
          for (let t = 0; t < project.chunkTiles.length; t++) {
            const pixels = project.chunkTiles[t].pixels;
            for (let row = 0; row < 8; row++) {
              for (let col = 0; col < 4; col++) {
                const hi = pixels[row * 8 + col * 2] & 0xF;
                const lo = pixels[row * 8 + col * 2 + 1] & 0xF;
                tileBytes[t * 32 + row * 4 + col] = (hi << 4) | lo;
              }
            }
          }
          await window.api.writeBinaryFile(basePath, tilesPath, tileBytes.buffer as ArrayBuffer);
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
  const basePath = config.basePath;
  const zones: Zone[] = [];

  for (const zoneConfig of config.zones) {
    // Load tileset
    const tileData = await readFile(basePath, zoneConfig.tileset);
    const tiles = parseTiles(tileData);
    const tileset: Tileset = {
      tiles,
      collisionTypes: new Uint8Array(256), // TODO: load collision type table
    };

    // Load palette — S4 engine loads level palette at CRAM line 1 (offset $20),
    // line 0 is reserved for player sprites
    const palData = await readFile(basePath, zoneConfig.palette);
    const palette = buildPalette([{
      data: palData,
      srcOffset: 0,
      destOffset: 16,
      length: Math.min(48, Math.floor(palData.length / 2)),
    }]);

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

          if (!loaded && actConfig.stripPath) {
            try {
              const stripPrefix = actConfig.stripPrefix || 'sec';
              const stripFile = `${actConfig.stripPath}${stripPrefix}${i}_strips_source.bin`;
              const stripRaw = await readFile(basePath, stripFile);
              const stripData = parseStrips(stripRaw);

              for (let row = 0; row < STRIP_ROWS; row++) {
                for (let col = 0; col < STRIP_COLS; col++) {
                  const srcIdx = row * STRIP_COLS + col;
                  const dstIdx = row * SECTION_TILES_WIDE + col;
                  section.tileGrid.nametable[dstIdx] = stripData.nametable[srcIdx];
                  section.tileGrid.collision[dstIdx] = stripData.collision[srcIdx];
                }
              }
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
          const bgWidth = 64;
          const bgHeight = Math.floor(bgRaw.length / (bgWidth * 2));
          bgLayout = parseNametable(bgRaw, bgWidth, bgHeight);
        }
        if (actConfig.bgTiles) {
          const bgTileRaw = await readFile(basePath, actConfig.bgTiles);
          const rawBgTiles = parseTiles(bgTileRaw);

          if (bgLayout && rawBgTiles.length > 0) {
            // Find min tile index in nametable to determine VRAM base offset
            let vramBase = 0x7FF;
            for (let i = 0; i < bgLayout.length; i++) {
              const idx = bgLayout[i] & 0x7FF;
              if (idx > 0 && idx < vramBase) vramBase = idx;
            }
            if (vramBase > 0 && vramBase < 0x7FF) {
              const maxIndex = vramBase + rawBgTiles.length;
              const indexedTiles: Tile[] = new Array(maxIndex);
              for (let t = 0; t < maxIndex; t++) {
                indexedTiles[t] = { pixels: new Uint8Array(64) };
              }
              for (let t = 0; t < rawBgTiles.length; t++) {
                indexedTiles[vramBase + t] = rawBgTiles[t];
              }
              bgTiles = indexedTiles;
            } else {
              bgTiles = rawBgTiles;
            }
          } else {
            bgTiles = rawBgTiles;
          }
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

    // Load chunk tiles
    try {
      const tilesPath = config.chunkLibraryPath.replace('.json', '_tiles.bin');
      const tilesRaw = await readFile(basePath, tilesPath);
      chunkTiles = parseTiles(tilesRaw);
    } catch {
      // no chunk tiles
    }
  }

  return {
    name: config.name,
    zones,
    objectLibrary,
    chunkLibrary,
    chunkTiles,
    basePath,
  };
}
