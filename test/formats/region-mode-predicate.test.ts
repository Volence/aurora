// REGION MODE IS "THE ACT'S regions.json EXISTS", AND NOTHING ELSE DECIDES IT.
//
// aeon `tools/effects_gen.py` `has_act_regions` is `os.path.isfile(regions_path(...))`,
// and `check_mode_conflict` refuses a region-mode act whose section sidecar
// still carries a ref. Aurora's copy of that predicate is `actHasRegionsFile`
// (core/formats/regions/act-regions.ts); its docblock carries the table of which
// load/edit state leaves the file on disk.
//
// These rows drive the REAL `loadAeonProject` over an in-memory tree
// (`aeon-regions-roundtrip.test.ts`'s pattern, fixtures duplicated rather than
// imported), so the input is what the app would hold, not a hand-built state.
//
// ⚠ THE ROW THAT MATTERS MOST IS THE PAIR WITH IDENTICAL SIDECARS. OJZ act 1 in
// region mode has every sidecar ref nulled, and a section-mode act nobody has
// bound looks exactly the same in its sidecars. If mode were inferred from the
// sidecars, those two would agree, so they are asserted to DISAGREE.

import { describe, it, expect } from 'vitest';

import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';
import type { S4Level } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import type { RegionsDocument } from '../../src/core/formats/regions/document';
import {
  actHasRegionsFile, cloneRegionsDocument, noRegionsLoaded,
} from '../../src/core/formats/regions/act-regions';

const DATA = 'games/sonic4/data/editor/ojz/act1/';
const REGIONS_PATH = `${DATA}regions.json`;
const META_0 = `${DATA}section_0.meta.json`;

const enc = (s: string) => new TextEncoder().encode(s);
const tile = (fill: number): Tile => ({ pixels: new Uint8Array(64).fill(fill) });

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

/** One 2048x2048 section of ojz act1, plus whatever `extra` adds. */
function tree(extra: Record<string, Uint8Array> = {}): Map<string, Uint8Array> {
  const proj = {
    name: 'Sonic 4', engine: 's4',
    zones: [{
      id: 'ojz', name: 'Oracle Jungle Zone',
      tileset: 'games/sonic4/data/generated/ojz/act1/ojz_tiles.bin',
      palette: 'games/sonic4/data/generated/ojz/act1/ojz_palette.bin',
      acts: [{
        id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: DATA,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
    objectLibrary: 'games/sonic4/data/objdefs/objects.json',
    chunkLibrary: '',
  };
  const files = new Map<string, Uint8Array>();
  files.set('project.json', enc(JSON.stringify(proj, null, 2)));
  files.set('games/sonic4/data/generated/ojz/act1/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0E; pal[i * 2 + 1] = 0xEE; }
  files.set('games/sonic4/data/generated/ojz/act1/ojz_palette.bin', pal);
  files.set(`${DATA}section_0.tiles.bin`,
    serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
  files.set(`${DATA}section_0.objects.json`, enc('[]'));
  files.set(`${DATA}section_0.rings.json`, enc('[]'));
  files.set('games/sonic4/data/objdefs/objects.json', enc('[]'));
  for (const [k, v] of Object.entries(extra)) files.set(k, v);
  return files;
}

/** OJZ act 1's shape at aeon e2af59ea: the binding on a region row. */
function ojzShapedDocument(): RegionsDocument {
  return {
    schema: 1,
    act: 'ojz_act1',
    regions: [{
      id: 'sec5', name: 'Band showcase', preset: 'OJZ_Preset_Sec5',
      rasterRef: 'ojz_sec5_showcase',
      rect: { x: 0, y: 0, w: 2048, h: 2048 },
    }],
  };
}

/** A sidecar with every ref nulled, the way e2af59ea left act 1's. */
const nulledSidecar = () => enc(JSON.stringify({ sceneRef: null, rasterRef: null }));

async function actOf(files: Map<string, Uint8Array>) {
  const r = await loadAeonProject(memFa(files), '/proj');
  return r.project.zones[0].acts[0];
}

describe('actHasRegionsFile answers "does regions.json exist", from the real load', () => {
  it('OJZ act 1 shape (regions.json present, sidecars nulled): REGION mode', async () => {
    const act = await actOf(tree({
      [REGIONS_PATH]: enc(JSON.stringify(ojzShapedDocument())),
      [META_0]: nulledSidecar(),
    }));
    // ANTI-VACUOUS: the load really read the document, so `true` is about a
    // file that is there and not about some other path through the state.
    expect(act.regions.loadedPath).toBe(REGIONS_PATH);
    expect(act.sections[0]?.rasterRef ?? null).toBeNull();
    expect(actHasRegionsFile(act.regions)).toBe(true);
  });

  it('a section-mode act with no regions.json: SECTION mode, bound sidecar or not', async () => {
    const bound = await actOf(tree({ [META_0]: enc(JSON.stringify({ rasterRef: 'glare' })) }));
    expect(bound.sections[0]?.rasterRef, 'fixture: the sidecar binding was not loaded').toBe('glare');
    expect(actHasRegionsFile(bound.regions)).toBe(false);
  });

  it('IDENTICAL nulled sidecars, different answers: the file decides, not the sidecars', async () => {
    const regionMode = await actOf(tree({
      [REGIONS_PATH]: enc(JSON.stringify(ojzShapedDocument())),
      [META_0]: nulledSidecar(),
    }));
    const sectionMode = await actOf(tree({ [META_0]: nulledSidecar() }));
    expect(regionMode.sections.map((s) => s?.rasterRef ?? null))
      .toEqual(sectionMode.sections.map((s) => s?.rasterRef ?? null));
    expect(actHasRegionsFile(regionMode.regions)).toBe(true);
    expect(actHasRegionsFile(sectionMode.regions)).toBe(false);
  });

  it('a regions.json Aurora REFUSED still exists: REGION mode', async () => {
    const act = await actOf(tree({ [REGIONS_PATH]: enc('{ this is not json') }));
    expect(act.regions.document, 'fixture: the document parsed').toBeNull();
    expect(act.regions.unreadable?.path).toBe(REGIONS_PATH);
    expect(actHasRegionsFile(act.regions)).toBe(true);
  });

  it('the save decides the file: migrated now is REGION mode, every region deleted is not', async () => {
    const migrated = await actOf(tree());
    expect(actHasRegionsFile(migrated.regions), 'fixture started in region mode').toBe(false);
    new EditHistory().execute({
      type: 'set-regions', description: 'as a migration would', sectionIndex: -1,
      oldDocument: null, newDocument: ojzShapedDocument(),
    }, { sections: migrated.sections, act: migrated } as unknown as S4Level);
    expect(migrated.regions.loadedPath, 'nothing was loaded: this is the save-will-write row').toBeNull();
    expect(actHasRegionsFile(migrated.regions)).toBe(true);

    const cleared = await actOf(tree({ [REGIONS_PATH]: enc(JSON.stringify(ojzShapedDocument())) }));
    expect(actHasRegionsFile(cleared.regions), 'fixture started in section mode').toBe(true);
    new EditHistory().execute({
      type: 'set-regions', description: 'delete every region', sectionIndex: -1,
      oldDocument: cloneRegionsDocument(cleared.regions.document!), newDocument: null,
    }, { sections: cleared.sections, act: cleared } as unknown as S4Level);
    expect(cleared.regions.loadedPath, 'the save removes a LOADED file: this row needs one').toBe(REGIONS_PATH);
    expect(actHasRegionsFile(cleared.regions)).toBe(false);
  });

  it('a hand-built act with no regions field is nothing-looked-at, so no file', () => {
    expect(actHasRegionsFile(undefined)).toBe(false);
    expect(actHasRegionsFile(noRegionsLoaded())).toBe(false);
  });
});
