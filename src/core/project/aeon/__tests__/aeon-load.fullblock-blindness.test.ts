// THE LOAD PATH SAYS WHICH BLINDNESS SKIPPED THE LEGACY MIGRATION.
//
// Ledger row FULLBLOCK-ZERO-IS-TWO-ANSWERS. `loadFullProject` migrates a legacy
// chunk library's nibble collision plane into word planes once, at load time,
// and skips silently when no full-block shape is available. Its BEHAVIOUR here
// is unchanged and stays unchanged deliberately — what happens to the author's
// project when the collision tables are absent is decision d-36's to rule, not
// this parcel's — but the REASON is no longer a 0 that meant either "no profile
// set was loaded" or "a real bank with no full block". The console line names
// which one, so a support question about a library that came back all-air has an
// answer in the log.
//
// ⚠ THE GUARD UNDER TEST IS THE `some(...)`, not the message. A project with no
// legacy collision at all has nothing this could have migrated, and warning
// there would train everyone to ignore the line. Both rows below are needed: one
// proves the line fires when there IS legacy data to lose, the other proves it
// stays quiet when there is not, and neither can stand in for the other.
//
// ⚠ WHAT IT DOES NOT COVER, said out loud. The `no-full-block` arm of the same
// message needs a decodable bank on disk that contains no full block, which this
// fixture does not build; that arm's guard is the shared `status` narrowing and
// is proved at the unit level (test/collision/full-block-shape.test.ts) and at
// the two writers (test/formats/chunk-mappings-collision.test.ts,
// test/model/chunk-collision-planes.test.ts). A load-level row for it is open.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

const tile = (fill: number): Tile => ({ pixels: new Uint8Array(64).fill(fill) });

/** In-memory FileAccess over a Map<rel, bytes>. read() throws on a miss, like
 *  the IPC bridge — which is how the collision-table probe misses here: no
 *  `heightmaps.bin` in the map, so `loadCollisionProfilesFa` returns null for
 *  every candidate directory and the open succeeds profile-less, exactly as a
 *  real aeon project whose bank is missing or renamed does. */
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
  objectLibrary: '',
  chunkLibrary: 'data/chunks.json',
  zones: [{
    id: 'ojz', name: 'OJ Zone',
    tileset: 'data/ojz_tiles.bin',
    palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1,
      dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

/** A 4x4-tile chunk (2x2 cells). `legacy` present = a pre-word-plane save, the
 *  only shape the migration has anything to do with. */
function chunkJson(legacy: number[] | null): string {
  const c: Record<string, unknown> = {
    id: 'c0', name: 'c0', widthTiles: 4, heightTiles: 4,
    nametable: new Array(16).fill(0),
  };
  if (legacy) c.collision = legacy;
  return JSON.stringify([c]);
}

function fixtureFiles(legacy: number[] | null): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  files.set('project.json', enc.encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/chunks.json', enc.encode(chunkJson(legacy)));
  return files;
}

/** Every line the load wrote to console.warn, joined. */
function warnings(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls.map((c) => c.map((a) => String(a)).join(' ')).join('\n');
}

afterEach(() => vi.restoreAllMocks());

describe('aeon load: a skipped legacy chunk migration names WHICH blindness skipped it', () => {
  it('legacy collision present and NO profiles loaded: warns, naming the absent tables', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A legacy plane with real solidity in it — cell (0,0) solidAll. This is
    // data that WOULD have migrated under a found lookup, which is what makes
    // the silence this line replaces worth reporting.
    const legacy = new Array(16).fill(0);
    legacy[0] = 1;

    const loaded = await loadAeonProject(memFa(fixtureFiles(legacy)), '/p');

    // ASSERT THE OPERANDS ARE REAL FIRST. A load that failed to find the chunk
    // library at all would produce an empty library and no warning, and a
    // "warning present" assertion alone cannot tell that apart from the case
    // under test.
    expect(loaded.collisionProfiles, 'the probe must have missed; otherwise this row tests nothing')
      .toBeNull();
    expect(loaded.project.chunkLibrary.length, 'the chunk library must have loaded').toBe(1);
    // And the migration really was skipped: the planes are still air.
    expect([...loaded.project.chunkLibrary[0].collisionA].every((w) => w === 0)).toBe(true);

    const text = warnings(spy);
    expect(text).toMatch(/legacy chunk collision NOT migrated/);
    expect(text, 'must name the blindness, not merely report a skip')
      .toMatch(/no collision profiles loaded/);
  });

  it('NO legacy collision and no profiles: silent, because there was nothing to migrate', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const loaded = await loadAeonProject(memFa(fixtureFiles(null)), '/p');

    // Same blind lookup as the row above — this differs only in whether the
    // library carries legacy data, so a warning here would be the line firing
    // on projects that have nothing to lose.
    expect(loaded.collisionProfiles).toBeNull();
    expect(loaded.project.chunkLibrary.length).toBe(1);

    expect(warnings(spy)).not.toMatch(/legacy chunk collision NOT migrated/);
  });
});
