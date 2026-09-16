// REGIONS VALIDATION NOTICES — editor spec §2.5 rules 2 and 3, as the author
// hears them.
//
// Two populations, kept apart on purpose:
//
//   1. THE PURE FUNCTION. `regionsValidationNotices` over documents built here.
//      Every row names the rule it is about, and every "nothing is wrong" row
//      has a control beside it that makes the same call produce something — a
//      validator that returned `[]` unconditionally would pass every clean row
//      in this file and nothing else.
//
//   2. THROUGH THE REAL LOAD. A project opened by `loadAeonProject` with a
//      regions document whose bindings do not resolve: the claim is that the
//      notices reach `r.notices`, which is a different claim from "the function
//      computes them".
//
// NOTHING HERE READS A PEER REPO. The `.emp` library text is transcribed from
// aeon's own declaration forms (including the column alignment that breaks a
// single-space pattern) and is asserted against the real file in
// src/core/formats/effects/__tests__/section-wiring.test.ts, which does read
// aeon at a committed revision.

import { describe, it, expect } from 'vitest';
import {
  regionsValidationNotices, BG_ACT_SENTINEL, type RegionBindingVocabulary,
} from '../../src/core/formats/regions/validate';
import { libraryPresetRecordNames } from '../../src/core/formats/effects/section-wiring';
import type { RegionsDocument, Region } from '../../src/core/formats/regions/document';
import type { FileAccess } from '../../src/core/project/adapter';
import { loadAeonProject } from '../../src/core/project/aeon/load';
import { serializeNametable } from '../../src/core/formats/s4-nametable';
import { serializeTiles } from '../../src/core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH, SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';
import type { Tile } from '../../src/core/model/s4-types';

// ---------------------------------------------------------------------------
// The pure function
// ---------------------------------------------------------------------------

/** One section: the act extent every row below derives its rectangles from. */
const ACT = { actW: SECTION_PIXEL_SIZE, actH: SECTION_PIXEL_SIZE };

function region(over: Partial<Region> & { id: string }): Region {
  return {
    name: over.id, preset: 'OJZ_Preset_Plain',
    rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH },
    ...over,
  };
}

function docOf(...regions: Region[]): RegionsDocument {
  return { schema: 1, act: 'ojz_act1', regions };
}

/** A vocabulary in which every binding used below resolves. */
function vocab(over: Partial<RegionBindingVocabulary> = {}): RegionBindingVocabulary {
  return {
    presetRecords: ['OJZ_Preset_Plain', 'OJZ_Preset_Night'],
    presetLibraryPath: 'games/sonic4/data/effects/ojz_effects.emp',
    sceneIds: ['ojz_act1_start'],
    sceneUnreadableIds: [],
    rasterIds: ['ojz_sec5_showcase'],
    rasterUnreadableIds: [],
    bgLayoutIds: ['forest_bg'],
    bgUnresolvedIds: [],
    ...over,
  };
}

const run = (doc: RegionsDocument, v = vocab()) =>
  regionsValidationNotices(doc, 'regions.json', ACT, v);
const messages = (doc: RegionsDocument, v = vocab()) => run(doc, v).map(n => n.message);

describe('regions validation: rule 2, every rect inside the act', () => {
  it('a document that tiles the act exactly produces NO notice', () => {
    const clean = docOf(
      region({ id: 'left', rect: { x: 0, y: 0, w: ACT.actW / 2, h: ACT.actH } }),
      region({ id: 'right', rect: { x: ACT.actW / 2, y: 0, w: ACT.actW / 2, h: ACT.actH } }),
    );
    expect(run(clean)).toEqual([]);
    // ANTI-VACUOUS: the same call over the same shape, one pixel wider, DOES
    // speak. Without this, `[]` is what a correct document and a dead validator
    // both return.
    const overhang = docOf(
      region({ id: 'right', rect: { x: ACT.actW / 2, y: 0, w: ACT.actW / 2 + 1, h: ACT.actH } }),
    );
    expect(run(overhang)).toHaveLength(1);
  });

  it('a rect past the act\'s LAST PIXEL is named, with the act\'s real size', () => {
    // The boundary, not near it: `x + w === actW` is legal and `actW + 1` is not.
    const flush = docOf(region({ id: 'flush', rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH } }));
    expect(run(flush)).toEqual([]);

    const over = docOf(region({ id: 'over', rect: { x: 1, y: 0, w: ACT.actW, h: ACT.actH } }));
    const [m] = messages(over);
    expect(m).toContain('over (outside-act)');
    expect(m).toContain('Regions rule 2');
    expect(m, 'the act\'s own size, not a constant typed into the message')
      .toContain(`${ACT.actW} by ${ACT.actH}`);
  });

  it('a NEGATIVE origin is a different code from an overhang', () => {
    const neg = docOf(region({ id: 'neg', rect: { x: -16, y: 0, w: 64, h: 64 } }));
    expect(messages(neg)[0]).toContain('neg (negative-edge)');
  });

  it('an EMPTY extent is reported as inverted, and reported ONCE', () => {
    // w = 0 contains no pixel. `validateRectInAct` returns early on it, so this
    // is also the row that says an empty rect does not also claim to be outside
    // the act — one fault, one sentence.
    const empty = docOf(region({ id: 'empty', rect: { x: 0, y: 0, w: 0, h: 64 } }));
    const [m] = messages(empty);
    expect(m).toContain('empty (inverted)');
    expect(m).not.toContain('outside-act');
  });

  it('many faults are ONE coalesced notice that counts the rest', () => {
    const many = docOf(...Array.from({ length: 6 }, (_, i) =>
      region({ id: `bad${i}`, rect: { x: ACT.actW, y: 0, w: 64, h: 64 } })));
    const ns = run(many);
    expect(ns, 'six faults must not be six ten-second toasts').toHaveLength(1);
    expect(ns[0].message).toContain('+3 more');
    expect(ns[0].message).toContain('6 regions lie');
  });
});

describe('regions validation: rule 3, every binding resolves', () => {
  it('bindings that all resolve produce NO notice', () => {
    const ok = docOf(region({
      id: 'sec0', preset: 'OJZ_Preset_Night',
      sceneRef: 'ojz_act1_start', rasterRef: 'ojz_sec5_showcase',
      bg: { layoutRef: 'forest_bg' },
    }));
    expect(run(ok)).toEqual([]);
  });

  it('null and absent bindings resolve by definition, and so does the @act sentinel', () => {
    const inherits = docOf(
      region({ id: 'a', sceneRef: null, rasterRef: null, bg: { layoutRef: null } }),
      region({ id: 'b' }),
      region({ id: 'c', bg: { layoutRef: BG_ACT_SENTINEL } }),
    );
    expect(run(inherits)).toEqual([]);
    // ANTI-VACUOUS: a NON-sentinel unknown id in the same key does speak, so the
    // row above is about null/@act and not about `bg` being ignored entirely.
    expect(run(docOf(region({ id: 'c', bg: { layoutRef: 'nope' } })))).toHaveLength(1);
  });

  it('an unresolvable preset NAMES the library and says Aurora does not clear it', () => {
    const bad = docOf(region({ id: 'sec0', preset: 'OJZ_Preset_Ghost' }));
    const [m] = messages(bad);
    expect(m).toContain('sec0 → OJZ_Preset_Ghost');
    expect(m).toContain('games/sonic4/data/effects/ojz_effects.emp');
    expect(m, '§2.5 rule 3: a notice, and Aurora does not clear the binding on save')
      .toContain('does not clear');
  });

  it('LOUD ON UNMEASURABLE: an unreadable library says NOT CHECKED, never "all broken"', () => {
    const doc = docOf(
      region({ id: 'a', preset: 'OJZ_Preset_Ghost' }),
      region({ id: 'b', preset: 'OJZ_Preset_AlsoGhost' }),
    );
    const ns = run(doc, vocab({ presetRecords: null }));
    expect(ns, 'one sentence about the LIBRARY, not one per region').toHaveLength(1);
    expect(ns[0].message).toContain('NOT CHECKED');
    expect(ns[0].message).toContain('2 regions were');
    // The two ghost names must NOT be reported as unresolvable: Aurora did not
    // look, so it cannot say they are missing.
    expect(ns[0].message).not.toContain('OJZ_Preset_Ghost');

    // ANTI-VACUOUS CONTROL: the same two regions against a vocabulary that WAS
    // read produce the unresolvable notice instead. So `null` and `[]` are
    // genuinely different answers here, which is the whole point of the field.
    const looked = run(doc, vocab({ presetRecords: [] }));
    expect(looked).toHaveLength(1);
    expect(looked[0].message).toContain('OJZ_Preset_Ghost');
    expect(looked[0].message).not.toContain('NOT CHECKED');
  });

  it('a REFUSED scene document is not reported as a missing one', () => {
    // The file exists and Aurora could not read it. Telling the author the scene
    // is missing sends them to create a file that is already there.
    const doc = docOf(region({ id: 'sec0', sceneRef: 'ojz_act1_start' }));
    const ns = run(doc, vocab({ sceneIds: [], sceneUnreadableIds: ['ojz_act1_start'] }));
    expect(ns).toHaveLength(1);
    expect(ns[0].message).toContain('EXISTS and Aurora could not read it');
    expect(ns[0].message).not.toContain('does not hold');

    // The control: the same id with neither library entry NOR refusal record is
    // the missing case, and says so.
    const missing = run(doc, vocab({ sceneIds: [], sceneUnreadableIds: [] }));
    expect(missing[0].message).toContain('does not hold');
  });

  it('a REFUSED raster document is likewise not reported as missing', () => {
    const doc = docOf(region({ id: 'sec5', rasterRef: 'ojz_sec5_showcase' }));
    const ns = run(doc, vocab({ rasterIds: [], rasterUnreadableIds: ['ojz_sec5_showcase'] }));
    expect(ns[0].message).toContain('EXISTS and Aurora could not read it');
    expect(run(doc, vocab({ rasterIds: [], rasterUnreadableIds: [] }))[0].message)
      .toContain('does not hold');
  });

  it('a BODYLESS bg layout is the untracked-body class, not a wrong reference', () => {
    // C hazard A: the manifest NAMES the entry and one of its binaries did not
    // open. The id is right; the checkout is incomplete.
    const doc = docOf(region({ id: 'sec0', bg: { layoutRef: 'forest_bg' } }));
    const ns = run(doc, vocab({ bgLayoutIds: [], bgUnresolvedIds: ['forest_bg'] }));
    expect(ns[0].message).toContain('The reference is not wrong; the files are missing.');
    expect(run(doc, vocab({ bgLayoutIds: [], bgUnresolvedIds: [] }))[0].message)
      .toContain('does not hold');
  });

  it('each binding gets its OWN sentence: four faults on one region are four notices', () => {
    // Not folded into "4 bindings do not resolve": the repair is a different
    // file for each one.
    const doc = docOf(region({
      id: 'sec0', preset: 'Ghost', sceneRef: 'no_scene', rasterRef: 'no_raster',
      bg: { layoutRef: 'no_bg' },
    }));
    expect(run(doc)).toHaveLength(4);
  });
});

describe('the library preset vocabulary the rule 3 check runs on', () => {
  // Declaration forms transcribed from aeon's ojz_effects.emp: the aligned
  // two-space colon that a single-space pattern misses, and the DEBUG-gated
  // ARRAY declaration that is not a bindable record.
  const LIB = [
    'pub data OJZ_Preset_Plain: EffectsPreset = preset(pal: OJZ_Palette, raster: Raster_Program_None)',
    'pub data OJZ_Preset_Sec0:  EffectsPreset = preset(pal: OJZ_Palette, patched: OJZ_TwoChannel)',
    'pub const OJZ_Preset_Sec1 : EffectsPreset = preset(pal: OJZ_Palette)',
    'pub data OJZ_Preset_NightSnap: [EffectsPreset; OJZ_PRESET_NIGHT_SNAP_LEN]'
      + ' = if DEBUG == 1 { [ ojz_e2_plain(OJZ_Palette_Night) ] } else { [] }',
    '// pub data OJZ_Preset_Commented: EffectsPreset = preset(pal: P)',
  ].join('\n');

  it('finds every record, whatever the column alignment', () => {
    // The two-space form is the one that matters: aeon's own file aligns its
    // columns, and a `: EffectsPreset` pattern with one literal space misses
    // seven of its ten records.
    expect(libraryPresetRecordNames(LIB))
      .toEqual(['OJZ_Preset_Plain', 'OJZ_Preset_Sec0', 'OJZ_Preset_Sec1']);
  });

  it('an ARRAY-typed declaration is not a bindable record', () => {
    // `OJZ_Preset_NightSnap` is `[EffectsPreset; N]`, a DEBUG look fixture. A
    // region cannot bind it, so it must not enter the vocabulary — and it is
    // excluded by the pattern rather than by a name list.
    expect(libraryPresetRecordNames(LIB)).not.toContain('OJZ_Preset_NightSnap');
  });

  it('a record that exists only in a COMMENT is not in the vocabulary', () => {
    expect(libraryPresetRecordNames(LIB)).not.toContain('OJZ_Preset_Commented');
  });
});

// ---------------------------------------------------------------------------
// Through the real load
// ---------------------------------------------------------------------------

const DATA = 'games/sonic4/data/editor/ojz/act1/';
const enc = (s: string) => new TextEncoder().encode(s);

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

function projectFiles(regionsDoc: RegionsDocument): Map<string, Uint8Array> {
  const proj = {
    name: 'Sonic 4', engine: 's4',
    zones: [{
      id: 'ojz', name: 'OJZ',
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
  files.set(`${DATA}regions.json`, enc(JSON.stringify(regionsDoc, null, 2) + '\n'));
  return files;
}

describe('the notices reach the author through the real load', () => {
  it('a rect past the act and a dangling sceneRef both surface on open', async () => {
    const doc = docOf(
      region({ id: 'over', rect: { x: 0, y: 0, w: SECTION_PIXEL_SIZE + 1, h: SECTION_PIXEL_SIZE } }),
      region({ id: 'dangling', sceneRef: 'no_such_scene',
        rect: { x: 0, y: 0, w: SECTION_PIXEL_SIZE, h: SECTION_PIXEL_SIZE } }),
    );
    const r = await loadAeonProject(memFa(projectFiles(doc)), '/proj');

    // The document itself loaded: these are notices, not a refusal.
    const act = r.project.zones[0].acts[0];
    expect(act.regions.document, 'rules 2 and 3 are NOTICES; the document still loads')
      .not.toBeNull();

    const said = r.notices.map(n => n.message);
    expect(said.some(m => m.includes('Regions rule 2') && m.includes('over'))).toBe(true);
    expect(said.some(m => m.includes('no_such_scene'))).toBe(true);
  });

  it('a clean document opens with no regions notice at all', async () => {
    // The act's effects library is absent from this fixture, so the preset
    // binding is UNMEASURABLE — and the load says so rather than staying quiet
    // or claiming the preset is missing.
    const doc = docOf(region({ id: 'whole' }));
    const r = await loadAeonProject(memFa(projectFiles(doc)), '/proj');
    const said = r.notices.map(n => n.message);

    expect(said.some(m => m.includes('Regions rule 2'))).toBe(false);
    expect(said.some(m => m.includes('NOT CHECKED'))).toBe(true);
    expect(said.some(m => m.includes('does not declare')),
      'Aurora must not claim a preset is missing from a library it could not read').toBe(false);
  });
});
