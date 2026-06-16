import type { Act, Tileset, ObjectDef } from '../model/s4-types';
import { serializeNametable } from '../formats/s4-nametable';
import { serializeCollision } from '../formats/s4-collision';
import { buildGroupUnions, remapNametableToGroup, serializeTiles } from './tile-dedup';
import type { SectionTileData } from './tile-dedup';
import { computeVramColoring, assignVramBases, generateVramBasesAsm } from './vram-coloring';
import { generateActDescriptorAsm } from './act-descriptor';
import { generateEntityDataAsm } from './entity-data';

export interface SectionBinary {
  index: number;
  nametable: Uint8Array;
  collision: Uint8Array;
  tileArt: Uint8Array;
}

export interface ExportResult {
  actDescriptorAsm: string;
  entityDataAsm: string;
  vramBasesAsm: string;
  sectionBinaries: SectionBinary[];
}

export function exportAct(
  zonePrefix: string,
  act: Act,
  tileset: Tileset,
  objectLibrary: ObjectDef[],
): ExportResult {
  const { gridWidth, gridHeight, sections } = act;

  const activeSlots = sections.map(s => s !== null);
  const colors = computeVramColoring(gridWidth, gridHeight, activeSlots);

  // Group unions across sections sharing a color (engine: shared union blob)
  const sectionData: SectionTileData[] = sections.map((section, i) => ({
    nametable: section ? section.tileGrid.nametable : new Uint16Array(0),
    tiles: section ? (section.tiles ?? tileset.tiles) : [],
    color: section ? colors[i] : -1,
  }));
  const numColors = 2;
  const unions = buildGroupUnions(sectionData, numColors);
  const { bases, colorBases } = assignVramBases(
    colors,
    unions.map(u => u.tiles.length),
  );
  const vramBasesAsm = generateVramBasesAsm(zonePrefix, bases);

  const sectionBinaries: SectionBinary[] = [];
  const entityDataParts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    const color = colors[i];
    const tiles = section.tiles ?? tileset.tiles;
    const remapped = remapNametableToGroup(
      section.tileGrid.nametable, tiles, unions[color], colorBases[color],
    );

    sectionBinaries.push({
      index: i,
      nametable: serializeNametable(remapped),
      collision: serializeCollision(section.tileGrid.collision),
      tileArt: serializeTiles(unions[color].tiles), // group blob, shared per color
    });

    entityDataParts.push(generateEntityDataAsm(
      zonePrefix, i, section.rings, section.objects, objectLibrary,
    ));
  }

  const actDescriptorAsm = generateActDescriptorAsm(zonePrefix, act.id, {
    gridWidth,
    gridHeight,
    sections,
    startPosition: act.startPosition,
    parallaxRef: act.parallaxRef,
  });

  return {
    actDescriptorAsm,
    entityDataAsm: entityDataParts.join('\n\n'),
    vramBasesAsm,
    sectionBinaries,
  };
}
