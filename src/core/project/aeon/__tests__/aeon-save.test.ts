import { describe, it, expect } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { buildAeonSavePlan } from '../save';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

// Fixture helpers copied VERBATIM from aeon-load.test.ts (tests must not import
// each other).
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

describe('buildAeonSavePlan', () => {
  it('emits the per-section files, the editor-owned tileset, and a retargeted project.json', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: r.legacyAtlasMerged });
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('data/ojz/act1/section_0.objects.json');
    expect(paths).toContain('data/ojz/act1/section_0.rings.json');
    // Tileset is retargeted to the editor-owned path and project.json rewritten to match.
    expect(paths).toContain('data/editor/ojz_tiles.bin');
    expect(plan.configChanged).toBe(true);
    expect(paths).toContain('project.json');
    const projJson = JSON.parse(new TextDecoder().decode(plan.files.find((f) => f.path === 'project.json')!.bytes));
    expect(projJson.zones[0].tileset).toBe('data/editor/ojz_tiles.bin');
  });

  it('round-trips: loading the planned bytes reproduces the section nametable', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // Apply the plan to a fresh in-memory project dir and re-load.
    const files2 = fixtureFiles();
    for (const f of plan.files) files2.set(f.path, f.bytes);
    const r2 = await loadAeonProject(memFa(files2), '/proj');
    expect(Array.from(r2.project.zones[0].acts[0].sections[0]!.tileGrid.nametable))
      .toEqual(Array.from(r.project.zones[0].acts[0].sections[0]!.tileGrid.nametable));
  });

  it('never truncates the legacy atlas when it aliases a live tileset or migration did not run', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    // No chunkLibraryPath in the fixture AND merge didn't run → no zero-length truncation write.
    expect(plan.files.some((f) => f.bytes.length === 0)).toBe(false);
  });

  it('reports export failure as a non-fatal note instead of throwing', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    // An act id that exists is required for the plan; the export step runs on real
    // data here and should succeed, so exportError is null in the healthy case.
    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });
    expect(plan.exportError).toBeNull();
  });

  it('captures a genuine export throw (VRAM overflow) as exportError, keeps pre-export writes, drops export outputs', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');

    // Drive the REAL export path into its throw (no mocks): overflow the FG tile
    // pool (assignVramBases limit = 1024). Give the zone a tileset of >1024
    // distinct tiles and point the single color-0 section at all of them, so its
    // union exceeds the limit and assignVramBases throws "VRAM overflow" — before
    // any section binaries are produced.
    const N = 1100;
    const tiles: Tile[] = [{ pixels: new Uint8Array(64) }]; // slot 0 stays blank
    for (let n = 1; n <= N; n++) {
      const px = new Uint8Array(64);
      // Anchor at pixel 0 so only the identity orientation carries a nonzero
      // there → every T_n is flip-distinct → distinct canonical hashes (no dedup).
      px[0] = 1;
      px[1] = (n >> 8) & 0xF;
      px[2] = (n >> 4) & 0xF;
      px[3] = n & 0xF;
      tiles.push({ pixels: px });
    }
    r.project.zones[0].tileset.tiles = tiles;
    const section = r.project.zones[0].acts[0].sections[0]!;
    const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    for (let n = 1; n <= N; n++) nt[n - 1] = n; // reference each distinct tile once
    section.tileGrid.nametable = nt;

    const plan = await buildAeonSavePlan(fa, r.config, r.project, 'ojz', 'act1',
      { legacyAtlasMerged: false });

    // 1. Resolves rather than rejecting; 2. exportError is a non-null string.
    expect(typeof plan.exportError).toBe('string');
    expect(plan.exportError).toMatch(/VRAM overflow/);
    // 3. Everything written BEFORE the export step survives...
    const paths = plan.files.map((f) => f.path);
    expect(paths).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(paths).toContain('project.json');
    // ...and no export outputs leaked in (the throw is before the first push).
    expect(paths.some((p) => p.endsWith('act_descriptor.asm'))).toBe(false);
    expect(paths.some((p) => p.endsWith('.art.bin'))).toBe(false);
  });
});
