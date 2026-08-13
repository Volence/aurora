import { describe, it, expect, beforeEach } from 'vitest';
import type { FileAccess } from '../../adapter';
import {
  registerAdapter,
  clearAdapters,
  detectProject,
  openProject,
} from '../../adapter';
import { aeonAdapter, explainAeonReject } from '../index';
import { s1Adapter } from '../../s1/index';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

// ---------------------------------------------------------------------------
// Full-load fixture helpers — copied VERBATIM from aeon-load.test.ts (tests
// must not import each other), with memFa additionally setting `rootDir` so
// open() records a real basePath.
// ---------------------------------------------------------------------------

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like the IPC bridge. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
    rootDir: '/proj',
  };
}

const PROJECT_JSON = {
  name: 'Test Project',
  engine: 's4',
  objectLibrary: 'data/objects.json',
  chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone',
    tileset: 'data/ojz_tiles.bin',
    palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', parallax: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  // Palette: 48 words (3 CRAM lines) of Genesis 0x0EEE-style colors.
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  // One saved section: nametable referencing tile 1 on palette line 2.
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/ojz/act1/section_0.objects.json',
    new TextEncoder().encode(JSON.stringify([{ id: 'o1', typeId: 'ring-monitor', x: 8, y: 8 }])));
  files.set('data/objects.json',
    new TextEncoder().encode(JSON.stringify([
      { id: 'ring-monitor', name: 'Ring Monitor', codeLabel: 'Obj_Monitor', defaultSubtype: 0, properties: {} },
    ])));
  return files;
}

// ---------------------------------------------------------------------------
// In-memory FileAccess fake (same pattern as adapter.test.ts / s1-adapter.test.ts).
// ---------------------------------------------------------------------------

function memFs(files: Record<string, Uint8Array | string>): FileAccess {
  const map = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(files)) {
    map.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : v);
  }
  return {
    async exists(rel) {
      return map.has(rel);
    },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list(relDir) {
      const prefix = relDir === '' || relDir === '.' ? '' : relDir.replace(/\/?$/, '/');
      const names = new Set<string>();
      for (const key of map.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },
  };
}

/** A minimal aurora aeon project.json (engine "s4" is the distinguishing field). */
function aeonJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: 'My Aeon Game', engine: 's4', zones: [], ...extra });
}

/** A stock s1 fingerprint tree: sonic.asm + the three non-empty data dirs. */
function s1Tree(): Record<string, string> {
  return {
    'sonic.asm': 'x',
    'artnem/GHZ.bin': 'x',
    'map256/GHZ.bin': 'x',
    'levels/GHZ1.bin': 'x',
  };
}

const LABEL = 'Aeon Project';

// ---------------------------------------------------------------------------
// detect
// ---------------------------------------------------------------------------

describe('aeonAdapter.detect', () => {
  it('matches a project.json declaring engine "s4"', async () => {
    expect(await aeonAdapter.detect(memFs({ 'project.json': aeonJson() }))).toEqual({
      type: 'aeon',
      label: LABEL,
    });
  });

  it('matches even when the aeon project is otherwise broken (engine only) — validation is deferred to the loader', async () => {
    // No name, no zones — loadS4Config would reject this, but detect only sniffs
    // engine so the EXISTING loader still runs and surfaces its usual error.
    expect(await aeonAdapter.detect(memFs({ 'project.json': '{"engine":"s4"}' }))).toEqual({
      type: 'aeon',
      label: LABEL,
    });
  });

  it('returns null with no project.json (e.g. an s1 tree)', async () => {
    expect(await aeonAdapter.detect(memFs(s1Tree()))).toBeNull();
    expect(await aeonAdapter.detect(memFs({}))).toBeNull();
  });

  it('returns null for a non-aurora project.json (engine is not "s4")', async () => {
    expect(
      await aeonAdapter.detect(memFs({ 'project.json': JSON.stringify({ engine: 'godot', name: 'x' }) })),
    ).toBeNull();
    // engine missing entirely
    expect(
      await aeonAdapter.detect(memFs({ 'project.json': JSON.stringify({ name: 'some tool' }) })),
    ).toBeNull();
    // engine present but not a string
    expect(
      await aeonAdapter.detect(memFs({ 'project.json': JSON.stringify({ engine: 4 }) })),
    ).toBeNull();
  });

  it('returns null for a malformed (unparseable) project.json', async () => {
    expect(await aeonAdapter.detect(memFs({ 'project.json': '{ not valid json' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// explainAeonReject — the reason text behind a rejected project.json
// ---------------------------------------------------------------------------

describe('explainAeonReject', () => {
  it('returns null when there is no project.json (nothing aeon-specific to add)', async () => {
    expect(await explainAeonReject(memFs(s1Tree()))).toBeNull();
    expect(await explainAeonReject(memFs({}))).toBeNull();
  });

  it('reports invalid JSON when project.json does not parse', async () => {
    expect(await explainAeonReject(memFs({ 'project.json': '{ not valid json' }))).toBe(
      'project.json found but contains invalid JSON',
    );
  });

  it('reports the wrong engine when project.json parses but engine ≠ "s4"', async () => {
    expect(
      await explainAeonReject(memFs({ 'project.json': JSON.stringify({ engine: 'godot' }) })),
    ).toBe('project.json found but engine is "godot", expected "s4"');
  });

  it('covers a missing engine field under the engine-mismatch detail', async () => {
    expect(
      await explainAeonReject(memFs({ 'project.json': JSON.stringify({ name: 'some tool' }) })),
    ).toBe('project.json found but engine is "undefined", expected "s4"');
  });

  it('returns null for a valid aeon project.json (engine "s4" — not a reject)', async () => {
    expect(await explainAeonReject(memFs({ 'project.json': aeonJson() }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// open — full project load
// ---------------------------------------------------------------------------

describe('aeonAdapter.open', () => {
  it('open() loads the full project and returns it on handle.aeon', async () => {
    const handle = await aeonAdapter.open(memFa(fixtureFiles()));
    expect(handle.type).toBe('aeon');
    expect(handle.levels).toBeNull();
    expect(handle.capabilities.facets).toEqual(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(handle.aeon).toBeDefined();
    expect(handle.aeon!.project.zones).toHaveLength(1);
    expect(handle.aeon!.config.name).toBe('Test Project');
    expect(handle.aeon!.config.basePath).toBe('/proj'); // from fa.rootDir
  });

  it('open() surfaces loader errors (broken-but-s4 project.json still matches detect, then open throws)', async () => {
    const files = fixtureFiles();
    files.set('project.json', new TextEncoder().encode(JSON.stringify({ engine: 's4' }))); // missing name/zones
    await expect(aeonAdapter.open(memFa(files))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Registry disjointness — aeon and s1 fingerprints never collide, and the
// registry routes each tree to exactly one adapter.
// ---------------------------------------------------------------------------

describe('aeon + s1 registry routing (disjoint fingerprints)', () => {
  beforeEach(() => clearAdapters());

  it('routes an aeon tree to the aeon adapter', async () => {
    registerAdapter(s1Adapter);
    registerAdapter(aeonAdapter);
    expect(await detectProject(memFs({ 'project.json': aeonJson() }))).toEqual({
      type: 'aeon',
      label: LABEL,
    });
  });

  it('routes an s1 tree to the s1 adapter (aeon declines)', async () => {
    registerAdapter(s1Adapter);
    registerAdapter(aeonAdapter);
    const match = await detectProject(memFs(s1Tree()));
    expect(match?.type).toBe('s1');
  });

  it('returns null for a non-aurora project.json — routes to neither adapter', async () => {
    registerAdapter(s1Adapter);
    registerAdapter(aeonAdapter);
    expect(
      await detectProject(memFs({ 'project.json': JSON.stringify({ engine: 'other' }) })),
    ).toBeNull();
  });

  it('order is irrelevant: a hybrid dir (both fingerprints) is a nonsense tree, but each pure tree still resolves to its own adapter regardless of registration order', async () => {
    // Register aeon first this time — an s1 tree still resolves to s1 (aeon
    // declines it), proving the fingerprints are genuinely disjoint.
    registerAdapter(aeonAdapter);
    registerAdapter(s1Adapter);
    expect((await detectProject(memFs(s1Tree())))?.type).toBe('s1');
    expect((await detectProject(memFs({ 'project.json': aeonJson() })))?.type).toBe('aeon');
  });

  it('openProject opens (loads) the aeon project for an aeon tree', async () => {
    registerAdapter(s1Adapter);
    registerAdapter(aeonAdapter);
    const handle = await openProject(memFa(fixtureFiles()));
    expect(handle?.type).toBe('aeon');
    expect(handle?.levels).toBeNull();
    expect(handle?.capabilities.levels).toBe('aeon');
    expect(handle?.aeon).toBeDefined();
  });
});
