export interface S4ActConfig {
  id: string;
  gridWidth: number;
  gridHeight: number;
  dataPath: string;
  stripPath?: string;
  stripPrefix?: string;
  bgLayout: string;
  bgTiles: string;
  parallax: string | null;
  startPosition: { secX: number; secY: number; localX: number; localY: number };
}

export interface S4ZoneConfig {
  id: string;
  name: string;
  tileset: string;
  palette: string;
  acts: S4ActConfig[];
}

export interface S4ProjectConfig {
  name: string;
  engine: string;
  zones: S4ZoneConfig[];
  objectLibrary: string;
  chunkLibrary: string;
}

export interface LoadedS4Config {
  name: string;
  engine: 's4';
  basePath: string;
  zones: S4ZoneConfig[];
  objectLibraryPath: string;
  chunkLibraryPath: string;
  /**
   * The raw parsed project.json, retained verbatim so saveProject can
   * retarget zone tileset paths and write the file back without losing
   * fields the editor doesn't model. Note: `zones` above shares the same
   * objects as `raw.zones`, so mutations through either are visible to both.
   */
  raw: S4ProjectConfig;
}

export function loadS4Config(json: S4ProjectConfig, basePath: string): LoadedS4Config {
  if (!json.name) throw new Error('Project config missing "name"');
  if (json.engine !== 's4') throw new Error(`Expected engine "s4", got "${json.engine}"`);
  if (!json.zones || !Array.isArray(json.zones)) throw new Error('Project config missing "zones" array');

  for (const zone of json.zones) {
    if (!zone.id) throw new Error('Zone missing "id"');
    if (!zone.tileset) throw new Error(`Zone "${zone.id}" missing "tileset"`);
    if (!zone.palette) throw new Error(`Zone "${zone.id}" missing "palette"`);
    for (const act of zone.acts) {
      if (!act.id) throw new Error(`Act missing "id" in zone "${zone.id}"`);
      if (!act.gridWidth || !act.gridHeight) throw new Error(`Act "${act.id}" missing grid dimensions`);
      if (!act.dataPath) throw new Error(`Act "${act.id}" missing "dataPath"`);
    }
  }

  return {
    name: json.name,
    engine: 's4',
    basePath,
    zones: json.zones,
    objectLibraryPath: json.objectLibrary || '',
    chunkLibraryPath: json.chunkLibrary || '',
    raw: json,
  };
}
