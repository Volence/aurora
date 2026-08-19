// Editor-destination fields (`editorTilesetPath`, `editorBgLayout`,
// `editorBgTiles`).
//
// INVARIANT: for each of the three art blobs Aurora persists on save, the
// project file names BOTH where the bytes go and where a reader finds them,
// and those two are the same file. Exactly one party fixes that file:
//
//   • field ABSENT  → Aurora owns it. It writes to `<dataRoot>editor/<derived>`
//     and rewrites the pointer (`tileset` / `bgLayout` / `bgTiles`) to match.
//   • field PRESENT → the repo owns it. Aurora writes the bytes to the declared
//     editor path and never touches the pointer, so a repo-managed pointer
//     (e.g. one a bake regenerates) survives every save.
//
// Either way bytes and pointer stay consistent by construction; what changes is
// who decides. See buildAeonSavePlan.

export interface S4ActConfig {
  id: string;
  gridWidth: number;
  gridHeight: number;
  dataPath: string;
  stripPath?: string;
  stripPrefix?: string;
  bgLayout: string;
  bgTiles: string;
  /** Repo-declared destination for the act's BG layout bytes (see above). */
  editorBgLayout?: string;
  /** Repo-declared destination for the act's BG tile blob (see above). */
  editorBgTiles?: string;
  parallax: string | null;
  startPosition: { secX: number; secY: number; localX: number; localY: number };
}

export interface S4ZoneConfig {
  id: string;
  name: string;
  tileset: string;
  palette: string;
  /** Repo-declared destination for the zone's tileset bytes (see above). */
  editorTilesetPath?: string;
  acts: S4ActConfig[];
}

export interface S4ProjectConfig {
  name: string;
  engine: string;
  zones: S4ZoneConfig[];
  objectLibrary: string;
  chunkLibrary: string;
  /** Optional path (relative to the project) to the engine's collision tables
   *  dir. Defaults to 'data/collision/' when absent. */
  collisionDataPath?: string;
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
  /**
   * Whether the project.json TEXT this config was parsed from ended with a
   * newline. A save re-stringifies `raw`, which cannot know that, so the fact
   * is carried here and the newline reproduced — otherwise every pointer
   * rewrite also silently strips the file's last byte, and the diff a reviewer
   * sees is "\ No newline at end of file" on top of the real change.
   * Absent (programmatic configs, no source text) means "no trailing newline".
   */
  rawTrailingNewline?: boolean;
}

export function loadS4Config(
  json: S4ProjectConfig,
  basePath: string,
  opts: { rawTrailingNewline?: boolean } = {},
): LoadedS4Config {
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
    rawTrailingNewline: opts.rawTrailingNewline ?? false,
  };
}

/**
 * Candidate dirs for the engine's collision tables, most specific first:
 * the explicit `collisionDataPath` if set, then `<dataRoot>/collision/`
 * derived from each act's dataPath (engine repos keep all game data under one
 * `data/` root — e.g. `games/sonic4/data/editor/...` → `games/sonic4/data/`),
 * then the legacy root-relative `data/collision/`. The loader probes each
 * until one yields tables, so pre-split and post-split repo layouts both
 * resolve without project.json edits.
 */
export function collisionDataPathCandidates(raw: S4ProjectConfig): string[] {
  const out: string[] = [];
  const push = (p: string) => { if (p && !out.includes(p)) out.push(p); };
  if (raw.collisionDataPath) push(raw.collisionDataPath);
  for (const zone of raw.zones ?? []) {
    for (const act of zone.acts ?? []) {
      const root = dataRootOfPath(act.dataPath ?? '');
      if (root) push(`${root}collision/`);
    }
  }
  push('data/collision/');
  return out;
}

/** The `data/` root a project-relative path lives under ('games/sonic4/data/'
 *  post-split, 'data/' legacy), or null if the path has no data/ segment. */
function dataRootOfPath(p: string): string | null {
  if (p.startsWith('data/')) return 'data/';
  const i = p.indexOf('/data/');
  return i >= 0 ? p.slice(0, i + 6) : null;
}

/**
 * The project's single data root, derived from the first act dataPath —
 * 'games/<game>/data/' for post-split engine repos, 'data/' for legacy
 * layouts (and as the fallback when nothing is derivable). Editor-owned
 * trees (editor/, sprites/) hang off this root, so saves land inside the
 * game's data dir instead of the repo root.
 */
export function projectDataRoot(raw: S4ProjectConfig): string {
  for (const zone of raw.zones ?? []) {
    for (const act of zone.acts ?? []) {
      const root = dataRootOfPath(act.dataPath ?? '');
      if (root) return root;
    }
  }
  return 'data/';
}
