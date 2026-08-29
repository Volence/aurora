// Chunk identity SURVIVES CLOSING AND REOPENING A PROJECT (owner ruling d-18c).
//
// The codec is tested in isolation next door; this file drives the real
// `loadAeonProject` -> stamp -> `buildAeonSavePlan` -> feed the plan back to
// disk -> `loadAeonProject` cycle, because "the serializer round-trips" and
// "the editor's save and load agree about this file" are different claims and
// only the second is the one a user experiences.
//
// The in-memory `FileAccess` is the same shape the other aeon save/load tests
// use. Fixtures are duplicated rather than imported: tests must not import each
// other. NOTHING HERE READS A PEER REPO — every byte is built in this file
// (OVERSEER bar 19).

import { describe, it, expect } from 'vitest';

import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { buildAeonSavePlan } from '../../src/core/project/aeon/save';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeBgTiles, BG_WIDTH } from '../../src/core/formats/bg-tiles';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { Section, Tile } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import { buildStampCommand } from '../../src/core/editing/map-stamp';
import {
  buildDetachAllCommand, chunkOriginAt, danglingPlaneRefs, linkedTileIndices,
} from '../../src/core/editing/chunk-links';

const CHUNK_ID = 'c1';
const CHUNK_W = 4, CHUNK_H = 4;
const LINKS_PATH = 'games/sonic4/data/editor/ojz/act1/section_0.chunklinks.json';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

function tile(fill: number): Tile {
  return { pixels: new Uint8Array(64).fill(fill) };
}

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

function fixtureFiles(extra: Record<string, Uint8Array> = {}): Map<string, Uint8Array> {
  const proj = {
    name: 'Sonic 4',
    engine: 's4',
    zones: [{
      id: 'ojz',
      name: 'Oracle Jungle Zone',
      tileset: 'games/sonic4/data/generated/ojz/act1/ojz_tiles.bin',
      palette: 'games/sonic4/data/generated/ojz/act1/ojz_palette.bin',
      acts: [{
        id: 'act1',
        gridWidth: 1,
        gridHeight: 1,
        dataPath: 'games/sonic4/data/editor/ojz/act1/',
        bgLayout: 'games/sonic4/data/generated/ojz/act1/ojz_bg.bin',
        bgTiles: 'games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin',
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: 'games/sonic4/data/editor/ojz/chunks.json',
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(proj, null, 2)));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  const bg = new Uint16Array(BG_WIDTH * 2);
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg.bin', serializeNametable(bg));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_bg_tiles.bin', serializeBgTiles([tile(2), tile(3)]));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.tiles.bin',
    serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.objects.json', enc('[]'));
  files.set('games/sonic4/data/editor/ojz/act1/section_0.rings.json', enc('[]'));
  files.set('games/sonic4/data/editor/ojz/chunks.json', enc(JSON.stringify([{
    id: CHUNK_ID, name: 'chunk one', widthTiles: CHUNK_W, heightTiles: CHUNK_H,
    nametable: Array.from({ length: CHUNK_W * CHUNK_H }, (_, i) => 0x100 + i),
    collisionA: Array.from({ length: (CHUNK_W >> 1) * (CHUNK_H >> 1) }, () => 0),
    collisionB: Array.from({ length: (CHUNK_W >> 1) * (CHUNK_H >> 1) }, () => 0),
  }])));
  files.set('games/sonic4/data/objdefs/objects.json', enc('[]'));
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  return files;
}

async function openAndPlan(
  files: Map<string, Uint8Array>,
  mutate?: (section: Section, r: Awaited<ReturnType<typeof loadAeonProject>>) => void,
) {
  const fa = memFa(files);
  const r = await loadAeonProject(fa, '/proj');
  const section = r.project.zones[0].acts[0].sections[0]!;
  mutate?.(section, r);
  const plan = await buildAeonSavePlan(
    fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged },
  );
  return { loaded: r, section, plan };
}

/** Apply a save plan back over the fixture, the way the renderer's writer does. */
function applyPlan(files: Map<string, Uint8Array>, plan: { files: { path: string; bytes: Uint8Array }[] }) {
  const next = new Map(files);
  for (const f of plan.files) next.set(f.path, f.bytes);
  return next;
}

function stampAt(section: Section, r: Awaited<ReturnType<typeof loadAeonProject>>, baseCol: number, baseRow: number) {
  const chunk = r.project.chunkLibrary.find(c => c.id === CHUNK_ID)!;
  const level: S4Level = { sections: [section] };
  const cmd = buildStampCommand({
    chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp',
  });
  expect(cmd).not.toBeNull();
  new EditHistory().execute(cmd!, level);
  return chunk;
}

describe('chunk identity survives close-and-reopen', () => {
  it('a stamped section writes .chunklinks.json, and reopening restores the SAME placement and plane', async () => {
    const first = await openAndPlan(fixtureFiles(), (section, r) => {
      stampAt(section, r, 8, 6);
      stampAt(section, r, 40, 40);
    });

    // The plan really carries the file — without this the round trip below
    // could "pass" by both sides having no links at all.
    const written = first.plan.files.find(f => f.path === LINKS_PATH);
    expect(written, 'the save plan must contain the chunk-links sidecar').toBeDefined();

    const before = first.section.chunkLinks!;
    expect(before.placements).toHaveLength(2);

    const reopened = await openAndPlan(applyPlan(fixtureFiles(), first.plan));
    const after = reopened.section.chunkLinks!;

    // Placements identical, ids included.
    expect(after.placements).toEqual(before.placements);
    // The plane is identical TILE FOR TILE, over the whole section, not just at
    // the footprints — so a run-length bug that shifted everything by one would
    // show rather than hide in an unchecked tail.
    expect(after.plane).toHaveLength(before.plane.length);
    expect(Array.from(after.plane)).toEqual(Array.from(before.plane));

    // And the layer is coherent after the trip, not merely equal to itself.
    expect(danglingPlaneRefs(after)).toEqual([]);
    expect(linkedTileIndices(after, after.placements[0].id)).toHaveLength(CHUNK_W * CHUNK_H);
    expect(chunkOriginAt(reopened.section, 6 * SECTION_TILES_WIDE + 8)!.chunkId).toBe(CHUNK_ID);
  });

  it('a section with NO links creates no file at all', async () => {
    const { plan } = await openAndPlan(fixtureFiles());
    expect(plan.files.map(f => f.path)).not.toContain(LINKS_PATH);
    // ANTI-VACUOUS: the plan is a real plan with this section's other files in it.
    expect(plan.files.map(f => f.path))
      .toContain('games/sonic4/data/editor/ojz/act1/section_0.tiles.bin');
  });

  it('DETACHING EVERYTHING does not resurrect on the next load', async () => {
    // Save a stamped section...
    const stamped = await openAndPlan(fixtureFiles(), (section, r) => { stampAt(section, r, 8, 6); });
    const onDisk = applyPlan(fixtureFiles(), stamped.plan);
    expect(onDisk.has(LINKS_PATH)).toBe(true);

    // ...reopen it, detach everything, save again.
    const detached = await openAndPlan(onDisk, (section) => {
      const cmd = buildDetachAllCommand({ section, sectionIndex: 0, description: 'detach all' });
      expect(cmd).not.toBeNull();
      new EditHistory().execute(cmd!, { sections: [section] });
      expect(section.chunkLinks!.placements).toHaveLength(0);
    });

    // The save must OVERWRITE the existing file with an empty document rather
    // than skip it — skipping would leave the old links on disk and the next
    // open would undo the detach.
    const cleared = detached.plan.files.find(f => f.path === LINKS_PATH);
    expect(cleared, 'clearing must overwrite the stale sidecar, not skip it').toBeDefined();

    const reopened = await openAndPlan(applyPlan(onDisk, detached.plan));
    expect(reopened.section.chunkLinks?.placements ?? []).toHaveLength(0);
  });

  it('a sidecar Aurora CANNOT READ is reported and is NOT overwritten', async () => {
    const broken = enc('{"placements":[{"id":1,"chunkId":"c1","baseCol":0,"baseRow":0,"collision":true}],"runs":[1,3]}\n');
    const files = fixtureFiles({ [LINKS_PATH]: broken });

    const fa = memFa(files);
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;

    // Refused (the runs cover 3 tiles, not the section's) — and SAID SO.
    expect(section.unreadable).toContain('chunklinks.json');
    expect(r.notices.some(n => n.includes('chunklinks.json'))).toBe(true);
    expect(section.chunkLinks ?? null).toBeNull();

    const plan = await buildAeonSavePlan(
      fa, r.config, r.project, 'ojz', 'act1', { legacyAtlasMerged: r.legacyAtlasMerged },
    );
    // The file Aurora did not understand is left exactly as the author left it.
    expect(plan.files.map(f => f.path)).not.toContain(LINKS_PATH);
    // ...while the section's OTHER files are still saved, so the refusal is
    // scoped to the one document and did not quietly disable the whole section.
    expect(plan.files.map(f => f.path))
      .toContain('games/sonic4/data/editor/ojz/act1/section_0.tiles.bin');
  });

  it('an ABSENT sidecar is silent — every project saved before this feature existed', async () => {
    const fa = memFa(fixtureFiles());
    const r = await loadAeonProject(fa, '/proj');
    const section = r.project.zones[0].acts[0].sections[0]!;
    expect(section.unreadable ?? []).not.toContain('chunklinks.json');
    expect(r.notices.some(n => n.includes('chunklinks'))).toBe(false);
  });

  it('the saved bytes end in exactly one newline, like every other JSON Aurora writes', async () => {
    const { plan } = await openAndPlan(fixtureFiles(), (section, r) => { stampAt(section, r, 0, 0); });
    const text = dec(plan.files.find(f => f.path === LINKS_PATH)!.bytes);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});
