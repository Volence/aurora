// BG library persistence helpers.
//
// The project-level BG library (S4Project.bgLibrary) is a set of named
// backgrounds a section can display instead of the act default
// (Section.bgLayoutRef: null = act default, else a library entry id). It is
// persisted per zone to editor-owned paths (the data/editor convention used
// for the zone tileset and act BG in useProject.saveProject): a JSON index of
// id/name metadata plus per-entry binaries — layout via serializeNametable and
// tiles via serializeBgTiles, both in the LOCAL index convention (tile 0 =
// first blob tile), so load(save(state)) reproduces the in-memory arrays.

export function bgLibIndexPath(zoneId: string): string {
  return `data/editor/${zoneId}_bglib.json`;
}

export function bgLibLayoutPath(zoneId: string, id: string): string {
  return `data/editor/${zoneId}_bg_${id}.bin`;
}

export function bgLibTilesPath(zoneId: string, id: string): string {
  return `data/editor/${zoneId}_bg_${id}_tiles.bin`;
}

export interface BgLibraryIndexEntry {
  id: string;
  name: string;
}

/** Serialize the index JSON (metadata only — binaries are written separately). */
export function serializeBgLibraryIndex(entries: BgLibraryIndexEntry[]): string {
  return JSON.stringify(entries.map(e => ({ id: e.id, name: e.name })), null, 2);
}

/** Parse the index JSON, dropping malformed entries. */
export function parseBgLibraryIndex(text: string): BgLibraryIndexEntry[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { id: string; name: string } =>
      typeof e === 'object' && e !== null &&
      typeof (e as { id?: unknown }).id === 'string' &&
      typeof (e as { name?: unknown }).name === 'string')
    .map(e => ({ id: e.id, name: e.name }));
}

/**
 * Generate a library entry id: name slug + timestamp. Ids appear in file
 * names (bgLibLayoutPath) and, sanitized, in exported asm labels
 * ({zonePrefix}_BG_{id} in the act descriptor's section table).
 */
export function makeBgId(name: string, now: number = Date.now()): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bg';
  return `${slug}-${now}`;
}
