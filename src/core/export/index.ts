import type { Act, Tileset, ObjectDef } from '../model/s4-types';
import { serializeNametable } from '../formats/s4-nametable';
import { serializeCollision } from '../formats/s4-collision';
import { deduplicateSectionTiles } from './tile-dedup';
import { computeVramBases, generateVramBasesAsm } from './vram-coloring';
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

  // VRAM graph-coloring
  const activeSlots = sections.map(s => s !== null);
  const vramBases = computeVramBases(gridWidth, gridHeight, activeSlots);
  const vramBasesAsm = generateVramBasesAsm(zonePrefix, vramBases);

  // Per-section binaries
  const sectionBinaries: SectionBinary[] = [];
  const entityDataParts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;

    // Tile dedup + VRAM remapping (prefer section-specific tiles over zone tileset)
    const tiles = section.tiles ?? tileset.tiles;
    const dedup = deduplicateSectionTiles(section.tileGrid.nametable, tiles, vramBases[i]);
    const nametable = serializeNametable(dedup.remappedNametable);
    const collision = serializeCollision(section.tileGrid.collision);

    sectionBinaries.push({
      index: i,
      nametable,
      collision,
      tileArt: dedup.tileArtBytes,
    });

    // Entity data
    entityDataParts.push(generateEntityDataAsm(
      zonePrefix,
      i,
      section.rings,
      section.objects,
      objectLibrary,
    ));
  }

  // Act descriptor
  const actDescriptorAsm = generateActDescriptorAsm(zonePrefix, act.id, {
    gridWidth,
    gridHeight,
    sections,
    startPosition: act.startPosition,
    parallaxRef: act.parallaxRef,
  });

  const entityDataAsm = entityDataParts.join('\n\n');

  return {
    actDescriptorAsm,
    entityDataAsm,
    vramBasesAsm,
    sectionBinaries,
  };
}
