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
import { exportAct } from '../../core/export/index';
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../core/model/s4-types';
import type {
  S4Project,
  Zone,
  Act,
  Section,
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

  const openProject = useCallback(async () => {
    try {
      const dir = await window.api.selectDirectory();
      if (!dir) return;

      setLoading(true);

      // Load project.json
      const jsonData = await readFile(dir, 'project.json');
      const json = JSON.parse(new TextDecoder().decode(jsonData)) as S4ProjectConfig;
      const config = loadS4Config(json, dir);

      setConfig(config);
      await window.api.addRecentProject(dir, config.name);

      // Load the full project
      const project = await loadFullProject(config);
      setProject(project);

      // Auto-select first zone/act
      if (config.zones.length > 0) {
        const zone = config.zones[0];
        if (zone.acts.length > 0) {
          useProjectStore.getState().setCurrentAct(zone.id, zone.acts[0].id);
        }
      }

      setPosition(0, 0);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

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
    } catch (err) {
      useProjectStore.getState().setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return { openProject, saveProject };
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

    // Load palette
    const palData = await readFile(basePath, zoneConfig.palette);
    const palette = buildPalette([{
      data: palData,
      srcOffset: 0,
      destOffset: 0,
      length: Math.min(64, Math.floor(palData.length / 2)),
    }]);

    // Load acts
    const acts: Act[] = [];
    for (const actConfig of zoneConfig.acts) {
      const totalSections = actConfig.gridWidth * actConfig.gridHeight;
      const sections: (Section | null)[] = [];

      for (let i = 0; i < totalSections; i++) {
        const prefix = `${actConfig.dataPath}section_${i}`;

        try {
          // Try to load section data
          const ntRaw = await readFile(basePath, `${prefix}.tiles.bin`);
          const collRaw = await readFile(basePath, `${prefix}.coll.bin`);

          const section = createSection(i, `Section ${i}`);
          section.tileGrid.nametable = parseNametable(ntRaw, SECTION_TILES_WIDE, SECTION_TILES_HIGH);
          section.tileGrid.collision = parseCollision(collRaw, SECTION_TILES_WIDE, SECTION_TILES_HIGH);

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
          bgLayout = parseNametable(bgRaw, 64, 8); // typical bg size
        }
        if (actConfig.bgTiles) {
          const bgTileRaw = await readFile(basePath, actConfig.bgTiles);
          bgTiles = parseTiles(bgTileRaw);
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
  if (config.chunkLibraryPath) {
    try {
      const chunkLibRaw = await readFile(basePath, config.chunkLibraryPath);
      const chunkLibText = new TextDecoder().decode(chunkLibRaw);
      chunkLibrary = JSON.parse(chunkLibText) as ChunkDef[];
    } catch {
      // no chunk library
    }
  }

  return {
    name: config.name,
    zones,
    objectLibrary,
    chunkLibrary,
    basePath,
  };
}
