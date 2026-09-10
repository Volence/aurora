// ABSENT IS NOT REFUSED: the load-side section-file ledger.
//
// WHAT THIS PINS, AND WHY IT HAD TO EXIST BEFORE ANY SWEEP
//
// `load.ts` pushes `null` into `act.sections[i]` for a slot whose `tiles.bin`
// is ABSENT and for a slot whose `tiles.bin` it REFUSED to parse, through the
// same `if (!loaded)` branch, and the `Section` carrying the `unreadable`
// record is discarded with the slot. Downstream those two facts were one
// value. A save-side sweep of stranded `section_N` files reading that value
// cannot tell "the author emptied this slot" from "Aurora could not read this
// file", and deleting on the second is destroying the author's work.
//
// So `Act.sectionFiles` (core/model/s4-types.ts) carries the two apart:
// `loadedPaths` for reads that RETURNED and parsed, `unreadablePaths` for
// files that are there and would not. A path in neither list is one nothing
// was learned about, and that is a THIRD outcome, not a synonym for either.
//
// EXPECTATIONS ARE DERIVED: every expected path is built by the same
// `${DATA_PATH}section_${i}.${suffix}` expression the fixture writes with, and
// the corrupt slot's index is named once and reused, so no row can agree with
// a listing somebody printed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileAccess } from '../../adapter';
import { loadAeonProject } from '../load';
import { serializeNametable } from '../../../formats/s4-nametable';
import { serializeTiles } from '../../../export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import type { Tile } from '../../../model/s4-types';

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

const ZONE_ID = 'ojz';
const ACT_ID = 'act1';
const DATA_PATH = 'data/ojz/act1/';

/** The one path expression every row derives from. */
function sectionPath(index: number, suffix: string): string {
  return `${DATA_PATH}section_${index}.${suffix}`;
}

/** A full, parseable nametable for slot `i`, tagged so a reader can tell them apart. */
function goodTiles(i: number): Uint8Array {
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = 0x0100 + i;
  return serializeNametable(nt);
}

/**
 * A `tiles.bin` that EXISTS and will not parse.
 *
 * Truncated, not a token stub, and truncated by exactly one row: an interrupted
 * write and a hand edit gone wrong are what actually produces this file, and a
 * one-row-short nametable is the shape `parseNametable`'s length check is for.
 * A zero-length file would also throw, but it would throw for a reason a
 * different guard could be credited with.
 */
function truncatedTiles(): Uint8Array {
  const full = goodTiles(0);
  return full.subarray(0, full.length - SECTION_TILES_WIDE * 2);
}

function projectJson(gridWidth: number, gridHeight: number): string {
  return JSON.stringify({
    name: 'Section Ledger Fixture',
    engine: 's4',
    objectLibrary: 'data/objects.json',
    chunkLibrary: '',
    zones: [{
      id: ZONE_ID, name: 'OJ Zone',
      tileset: 'data/ojz_tiles.bin',
      palette: 'data/ojz_pal.bin',
      acts: [{
        id: ACT_ID, gridWidth, gridHeight,
        dataPath: DATA_PATH,
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  });
}

/**
 * A 2x2 act in which the four slots are deliberately four DIFFERENT outcomes:
 *
 *   slot 0: tiles.bin reads, objects.json reads      -> both loaded
 *   slot 1: tiles.bin reads, objects.json REFUSES    -> section survives, one refusal
 *   slot 2: tiles.bin REFUSES                        -> section is null, and it is REFUSED
 *   slot 3: nothing on disk at all                   -> section is null, and it is ABSENT
 *
 * Slots 2 and 3 are the pair the whole parcel turns on: identical in
 * `act.sections`, opposite in what a save is allowed to do about them.
 */
const REFUSED_SLOT = 2;
const ABSENT_SLOT = 3;

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(projectJson(2, 2)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('data/ojz_pal.bin', pal);
  files.set('data/objects.json', new TextEncoder().encode(JSON.stringify([])));

  files.set(sectionPath(0, 'tiles.bin'), goodTiles(0));
  files.set(sectionPath(0, 'objects.json'), new TextEncoder().encode('[]\n'));

  files.set(sectionPath(1, 'tiles.bin'), goodTiles(1));
  files.set(sectionPath(1, 'objects.json'), new TextEncoder().encode('[{"id": '));

  files.set(sectionPath(REFUSED_SLOT, 'tiles.bin'), truncatedTiles());
  // ABSENT_SLOT: nothing written, on purpose.
  return files;
}

async function loadFixture() {
  const files = fixtureFiles();
  const loaded = await loadAeonProject(memFa(files), '');
  return { files, loaded, act: loaded.project.zones[0].acts[0] };
}

beforeEach(() => {
  // markUnreadable writes the per-file reason to the console as it happens.
  // Silenced so the expected refusals in this fixture do not read as a broken run.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the act section-file ledger tells ABSENT from REFUSED', () => {
  it('the fixture really does produce two null slots for two different reasons', async () => {
    const { files, act } = await loadFixture();
    // Without this row every claim below is about a fixture that might have
    // collapsed into one case. The refused slot has a file; the absent one does not.
    expect(files.has(sectionPath(REFUSED_SLOT, 'tiles.bin'))).toBe(true);
    expect(files.has(sectionPath(ABSENT_SLOT, 'tiles.bin'))).toBe(false);
    // And the model cannot tell them apart, which is the whole problem.
    expect(act.sections[REFUSED_SLOT]).toBeNull();
    expect(act.sections[ABSENT_SLOT]).toBeNull();
  });

  it('a file that READ is in loadedPaths and in nothing else', async () => {
    const { act } = await loadFixture();
    expect(act.sectionFiles.loadedPaths).toContain(sectionPath(0, 'tiles.bin'));
    expect(act.sectionFiles.loadedPaths).toContain(sectionPath(0, 'objects.json'));
    expect(act.sectionFiles.unreadablePaths).not.toContain(sectionPath(0, 'tiles.bin'));
    expect(act.sectionFiles.unreadablePaths).not.toContain(sectionPath(0, 'objects.json'));
  });

  it('a file that REFUSED is in unreadablePaths and NEVER in loadedPaths', async () => {
    const { act } = await loadFixture();
    // The dangerous half. This is the record that has to survive the discarded
    // section, and the only thing standing between a truncated hand edit and a
    // sweep that deletes it.
    expect(act.sectionFiles.unreadablePaths).toContain(sectionPath(REFUSED_SLOT, 'tiles.bin'));
    expect(act.sectionFiles.loadedPaths).not.toContain(sectionPath(REFUSED_SLOT, 'tiles.bin'));
    // Same rule for a refusal in a slot whose section SURVIVED: slot 1 loaded
    // its nametable and refused its objects.
    expect(act.sectionFiles.unreadablePaths).toContain(sectionPath(1, 'objects.json'));
    expect(act.sectionFiles.loadedPaths).not.toContain(sectionPath(1, 'objects.json'));
    expect(act.sectionFiles.loadedPaths).toContain(sectionPath(1, 'tiles.bin'));
  });

  it('a file that is ABSENT is in NEITHER list, which is a third outcome and not a synonym',
    async () => {
      const { act } = await loadFixture();
      // Not "absent implies unreadable" and not "absent implies loaded". Every
      // suffix the loader probes for this slot, checked, so the row cannot pass
      // because it happened to name the one suffix nobody looks for.
      for (const suffix of ['tiles.bin', 'objects.json', 'rings.json', 'meta.json',
        'chunklinks.json', 'collattr.bin', 'collattrb.bin']) {
        const path = sectionPath(ABSENT_SLOT, suffix);
        expect(act.sectionFiles.loadedPaths, `${path} claimed as loaded`).not.toContain(path);
        expect(act.sectionFiles.unreadablePaths, `${path} claimed as refused`).not.toContain(path);
      }
    });

  it('the two lists are disjoint, and every path in them belongs to this act', async () => {
    const { act } = await loadFixture();
    const loaded = new Set(act.sectionFiles.loadedPaths);
    for (const p of act.sectionFiles.unreadablePaths) {
      expect(loaded.has(p), `${p} is in both lists`).toBe(false);
    }
    for (const p of [...act.sectionFiles.loadedPaths, ...act.sectionFiles.unreadablePaths]) {
      // A licence to delete must not be able to name a path outside the act it
      // was built for. Derived from the act's own dataPath, not a literal.
      expect(p.startsWith(`${DATA_PATH}section_`), `${p} is not this act's section file`).toBe(true);
    }
  });

  it('the refusal still reaches the author as a notice, so the ledger did not swallow it',
    async () => {
      const { loaded } = await loadFixture();
      // The ledger is folded into the project-wide collection after the act
      // loop; if that fold were dropped the refusals would be silent, which is
      // the failure the notice existed to prevent.
      const text = loaded.notices.map(n => n.message).join('\n');
      expect(text).toContain(sectionPath(REFUSED_SLOT, 'tiles.bin'));
    });
});
