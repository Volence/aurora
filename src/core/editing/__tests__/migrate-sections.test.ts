// MIGRATION FROM SECTIONS — the planner, editor spec §4 (the EDITOR half,
// `2026-09-14-aurora-regions-editor-design.md`; the engine half numbers its own
// steps and this is not one of them).
//
// ⚠ THE SPEC NAMES THIS ROW'S VERIFICATION AS ABSENCE-SHAPED AND THEREFORE
// VACUOUS BY DEFAULT (§7's note, added 2026-09-16): "migrate act 1, assert nine
// or ten regions and every sidecar nulled" passes identically on a fixture whose
// sidecars were never populated. Every row here that asserts a null therefore
// asserts the NON-null first, in the same row, from the same fixture — and the
// end-to-end version of that discipline, through the real load and the real save
// plan, is `test/formats/aeon-migrate-sections-roundtrip.test.ts`.
//
// NOTHING HERE READS A PEER REPO OR THE FILESYSTEM. The act-1 reading, against
// aeon's own descriptor and sidecars at a committed revision, is
// `test/formats/regions-migrate-act1.test.ts`, which skips loudly without aeon.

import { describe, it, expect } from 'vitest';
import {
  planSectionMigration,
  sidecarCarriesIdentityRef,
  sidecarCarriesRef,
  type MigrationInput,
  type MigrationSection,
  type SectionSidecarTuple,
} from '../migrate-sections';
import { coverage, disjointness, type RegionPiece } from '../region-geometry';

const SIZE = 2048;

function tuple(over: Partial<SectionSidecarTuple> = {}): SectionSidecarTuple {
  return { sceneRef: null, rasterRef: null, bgLayoutRef: null, paletteRef: null, ...over };
}

function section(index: number, over: Partial<SectionSidecarTuple> = {}): MigrationSection {
  return { index, sidecar: tuple(over) };
}

/**
 * A 3x3 act whose nine sections bind nine DIFFERENT presets — act 1's shape, and
 * the reason act 1 produces nine section regions rather than one.
 */
function nineDistinct(over: Partial<MigrationInput> = {}): MigrationInput {
  return {
    actKey: 'zzz_act1',
    gridWidth: 3,
    gridHeight: 3,
    sectionSize: SIZE,
    sections: Array.from({ length: 9 }, (_, i) => section(i)),
    presets: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i, `ZZZ_Preset_Sec${i}`])),
    presetsUsable: true,
    unkeyed: [],
    ...over,
  };
}

/** Every region's rectangle as a geometry piece, for the coverage rows. */
function pieces(input: MigrationInput, regions: { id: string; rect: RegionPiece['rect'] }[])
: RegionPiece[] {
  void input;
  return regions.map((r) => ({ id: r.id, rect: r.rect }));
}

describe('planSectionMigration: one region per contiguous run', () => {
  it('NINE DISTINCT PRESETS MAKE NINE REGIONS, each one section, and they TILE the act', () => {
    const input = nineDistinct();
    const plan = planSectionMigration(input);

    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const doc = plan.document!;
    // DERIVED, not typed: one run per distinct (preset, sceneRef, rasterRef)
    // tuple, and this fixture's nine presets are nine tuples.
    const tuples = new Set(Object.values(input.presets));
    expect(tuples.size).toBe(9);
    expect(doc.regions).toHaveLength(tuples.size);

    // The properties the build refuses an act for, checked on the OUTPUT rather
    // than assumed from the algorithm: disjoint, and every pixel assigned.
    const p = pieces(input, doc.regions);
    expect(disjointness(p).overlaps).toEqual([]);
    const act = { x: 0, y: 0, w: input.gridWidth * SIZE, h: input.gridHeight * SIZE };
    expect(coverage(act, p).unassigned).toEqual([]);
  });

  it('A CONTIGUOUS RUN OF IDENTICAL TUPLES IS ONE REGION, not one per section', () => {
    // The top row shares a tuple; the rest are distinct. §4: "one region per
    // contiguous run of identical settings, never one per section".
    const input = nineDistinct({
      presets: {
        0: 'ZZZ_Shared', 1: 'ZZZ_Shared', 2: 'ZZZ_Shared',
        3: 'ZZZ_Preset_Sec3', 4: 'ZZZ_Preset_Sec4', 5: 'ZZZ_Preset_Sec5',
        6: 'ZZZ_Preset_Sec6', 7: 'ZZZ_Preset_Sec7', 8: 'ZZZ_Preset_Sec8',
      },
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const doc = plan.document!;
    expect(doc.regions).toHaveLength(7);

    const run = doc.regions.find((r) => r.preset === 'ZZZ_Shared')!;
    expect(run, 'the shared run produced no region at all').toBeDefined();
    // ONE RECT FOR THE WHOLE ROW — §4's "a full row of cells is one rect".
    expect(run.rect).toEqual({ x: 0, y: 0, w: 3 * SIZE, h: SIZE });
    expect(run.id).toBe('sec_0');
    expect(run.name).toBe('Sections 0, 1, 2');
    // And the act is still tiled, which is what the merge must not break.
    const act = { x: 0, y: 0, w: 3 * SIZE, h: 3 * SIZE };
    expect(coverage(act, pieces(input, doc.regions)).unassigned).toEqual([]);
  });

  it('CONNECTIVITY IS 4-CONNECTED: two DIAGONAL sections with one tuple are TWO regions', () => {
    // The anti-vacuous half of the run rule. A migration that grouped by tuple
    // alone — ignoring adjacency — would emit ONE region here and it would have
    // to hold a rectangle covering sections it does not own.
    const input = nineDistinct({
      presets: { ...nineDistinct().presets, 0: 'ZZZ_Diag', 4: 'ZZZ_Diag' },
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const diag = plan.document!.regions.filter((r) => r.preset === 'ZZZ_Diag');
    expect(diag.map((r) => r.id)).toEqual(['sec_0', 'sec_4']);
    expect(diag.map((r) => r.rect)).toEqual([
      { x: 0, y: 0, w: SIZE, h: SIZE },
      { x: SIZE, y: SIZE, w: SIZE, h: SIZE },
    ]);
  });

  it('THE RUN KEY IS THE WHOLE TUPLE: same preset, different sceneRef, two regions', () => {
    const input = nineDistinct({
      presets: { ...nineDistinct().presets, 0: 'ZZZ_Same', 1: 'ZZZ_Same' },
      sections: [
        section(0, { sceneRef: 'scene_a' }), section(1, { sceneRef: 'scene_b' }),
        ...Array.from({ length: 7 }, (_, i) => section(i + 2)),
      ],
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const same = plan.document!.regions.filter((r) => r.preset === 'ZZZ_Same');
    expect(same.map((r) => r.id)).toEqual(['sec_0', 'sec_1']);
    expect(same.map((r) => r.sceneRef)).toEqual(['scene_a', 'scene_b']);
  });

  it('A BINDING THE FILE CANNOT CARRY DOES NOT SPLIT A RUN, and is reported as dropped', () => {
    // `bgLayoutRef` and `paletteRef` are read and then DROPPED (§2.3: the file
    // has no field for them). Splitting the run on a difference the document
    // cannot express would emit two regions no reader could tell apart.
    const input = nineDistinct({
      presets: { ...nineDistinct().presets, 0: 'ZZZ_Same', 1: 'ZZZ_Same' },
      sections: [
        section(0, { bgLayoutRef: 'forest-v15' }), section(1, { paletteRef: 'pal_two' }),
        ...Array.from({ length: 7 }, (_, i) => section(i + 2)),
      ],
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    expect(plan.document!.regions.filter((r) => r.preset === 'ZZZ_Same')).toHaveLength(1);
    expect(plan.notes.join('\n')).toMatch(/bgLayoutRef "forest-v15".*DROPPED/s);
  });
});

describe('planSectionMigration: the key-less row carves, and is a region of its own', () => {
  /** aeon's night region, in this fixture's terms: off the grid, straddling the line at 2x2048. */
  const night = {
    preset: 'ZZZ_Preset_Night',
    edges: { x0: 3400, x1: 4799, y0: 0, y1: SIZE - 1 },
    line: 560,
    constructorName: 'zzz_region',
  };

  it('IT CUTS THE RUNS IT CROSSES: the ruled model, not painter\'s order', () => {
    const input = nineDistinct({ unkeyed: [night] });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const doc = plan.document!;

    // Ten regions: nine runs plus the row. Counted from the fixture, not typed.
    expect(doc.regions).toHaveLength(Object.keys(input.presets).length + input.unkeyed.length);

    // The two rows it crosses are SHRUNK, exactly as aeon's hand table has them:
    // the left one ends one pixel before it, the right one begins one after.
    const sec1 = doc.regions.find((r) => r.id === 'sec_1')!;
    const sec2 = doc.regions.find((r) => r.id === 'sec_2')!;
    expect(sec1.rect).toEqual({ x: SIZE, y: 0, w: night.edges.x0 - SIZE, h: SIZE });
    expect(sec2.rect).toEqual({
      x: night.edges.x1 + 1, y: 0, w: 3 * SIZE - (night.edges.x1 + 1), h: SIZE,
    });

    // The row itself, LAST, with its preset explicit and its rect read from the
    // row rather than snapped to the section grid.
    const last = doc.regions[doc.regions.length - 1];
    expect(last.preset).toBe(night.preset);
    expect(last.rect).toEqual({ x: 3400, y: 0, w: 1400, h: SIZE });
    expect(last.id).toBe('zzz_preset_night');

    // And the act is STILL exactly tiled: no overlap, no hole. This is the
    // property a migration that appended without carving would break.
    const p = pieces(input, doc.regions);
    expect(disjointness(p).overlaps).toEqual([]);
    expect(coverage({ x: 0, y: 0, w: 3 * SIZE, h: 3 * SIZE }, p).unassigned).toEqual([]);
  });

  it('A ROW WHOSE EDGES DID NOT RESOLVE REFUSES THE WHOLE MIGRATION, and names the line', () => {
    // NOT dropped. Dropping it hands its area to the regions it was cut out of
    // and changes the act's identity in silence.
    const plan = planSectionMigration(nineDistinct({
      unkeyed: [{ ...night, edges: null }],
    }));
    expect(plan.document).toBeNull();
    expect(plan.sidecars).toEqual([]);
    expect(plan.refusals.join('\n')).toMatch(/line 560/);
    expect(plan.refusals.join('\n')).toMatch(/NO VALUE IS SUBSTITUTED/);
  });

  it('A RUN A ROW COVERS ENTIRELY BECOMES NO REGION, and says so', () => {
    const plan = planSectionMigration(nineDistinct({
      unkeyed: [{ ...night, edges: { x0: 0, x1: SIZE - 1, y0: 0, y1: SIZE - 1 } }],
    }));
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    expect(plan.document!.regions.some((r) => r.id === 'sec_0')).toBe(false);
    expect(plan.notes.join('\n')).toMatch(/Sections 0 became no region/);
  });

  it('A CARVE THAT SPLITS A RUN IN TWO BECOMES TWO ENTRIES, one rect each', () => {
    // The contract carries ONE rect per region. A vertical row-shaped run cut
    // through its middle survives as two rectangles, and the entry count is what
    // says the migration did not quietly emit a rectangle bigger than the run.
    const input = nineDistinct({
      presets: {
        0: 'ZZZ_Top', 1: 'ZZZ_Top', 2: 'ZZZ_Top',
        3: 'ZZZ_P3', 4: 'ZZZ_P4', 5: 'ZZZ_P5',
        6: 'ZZZ_P6', 7: 'ZZZ_P7', 8: 'ZZZ_P8',
      },
      unkeyed: [{ ...night, edges: { x0: 2048, x1: 4095, y0: 0, y1: SIZE - 1 } }],
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);
    const top = plan.document!.regions.filter((r) => r.preset === 'ZZZ_Top');
    expect(top.map((r) => r.id)).toEqual(['sec_0', 'sec_0_a']);
    expect(top.map((r) => r.rect)).toEqual([
      { x: 0, y: 0, w: SIZE, h: SIZE },
      { x: 2 * SIZE, y: 0, w: SIZE, h: SIZE },
    ]);
    expect(top[0].name).toBe(top[1].name);
    expect(plan.notes.join('\n')).toMatch(/needed 2 rectangles/);
    // Still one identity per pixel.
    const p = pieces(input, plan.document!.regions);
    expect(disjointness(p).overlaps).toEqual([]);
    expect(coverage({ x: 0, y: 0, w: 3 * SIZE, h: 3 * SIZE }, p).unassigned).toEqual([]);
  });
});

describe('planSectionMigration: the sidecars it clears', () => {
  it('EVERY SECTION IS LISTED, with what it CARRIED before, which is the anti-vacuous half', () => {
    const input = nineDistinct({
      sections: [
        section(0, { sceneRef: 'scene_start', bgLayoutRef: 'forest-v15' }),
        // Section 1 carries ONLY a paletteRef: not a rule-5 violation (the
        // generator objects to sceneRef/rasterRef), but still a ref the
        // migration clears — which is what makes the two counts below differ
        // and therefore what makes asserting both of them mean something.
        section(1, { paletteRef: 'pal_one' }), section(2), section(3),
        section(4, { sceneRef: 'scene_depth' }),
        section(5, { rasterRef: 'sec5_showcase' }),
        section(6, { rasterRef: 'sec6_baseswap', paletteRef: 'pal' }),
        section(7, { sceneRef: 'scene_water' }),
        section(8, { sceneRef: 'scene_floor' }),
      ],
    });
    const plan = planSectionMigration(input);
    expect(plan.refusals, plan.refusals.join('; ')).toEqual([]);

    // BEFORE: the fixture really did carry refs. Without this line every
    // assertion below passes on a fixture that never had any.
    const carriedBefore = input.sections.filter((s) => s !== null && sidecarCarriesRef(s.sidecar));
    expect(carriedBefore.length, 'the fixture carries no refs, so nulling them proves nothing')
      .toBe(7);
    expect(input.sections.filter((s) => s !== null && sidecarCarriesIdentityRef(s.sidecar)).length,
      'the fixture carries no sceneRef/rasterRef, which is what rule 5 is about').toBe(6);

    // EVERY section is listed, not only the dirty ones: undo needs the complete
    // before-picture, and a count of entries must mean "sections".
    expect(plan.sidecars.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // AFTER: all four refs null on every entry, all four named.
    for (const s of plan.sidecars) {
      expect(s.next, `section ${s.index}`).toEqual({
        sceneRef: null, rasterRef: null, bgLayoutRef: null, paletteRef: null,
      });
    }
    // And `old` is the tuple as it was, which is the only thing undo can restore from.
    expect(plan.sidecars[0].old).toEqual(
      { sceneRef: 'scene_start', rasterRef: null, bgLayoutRef: 'forest-v15', paletteRef: null },
    );
    // The refs reached the regions, rather than being cleared into nothing.
    const doc = plan.document!;
    expect(doc.regions.find((r) => r.id === 'sec_0')!.sceneRef).toBe('scene_start');
    expect(doc.regions.find((r) => r.id === 'sec_5')!.rasterRef).toBe('sec5_showcase');
    // A binding the file cannot carry is NOT written anywhere on the region.
    expect(Object.keys(doc.regions.find((r) => r.id === 'sec_0')!))
      .toEqual(['id', 'name', 'preset', 'rect', 'sceneRef']);
  });

  it('A REFUSED PLAN CLEARS NOTHING: no document AND no sidecars, never the half state', () => {
    const plan = planSectionMigration(nineDistinct({
      presetsUsable: false,
      presetsUnusableReason: 'act_descriptor.emp could not be read',
    }));
    expect(plan.document).toBeNull();
    expect(plan.sidecars).toEqual([]);
    expect(plan.refusals.join('\n')).toMatch(/act_descriptor\.emp could not be read/);
  });
});

describe('planSectionMigration: what it refuses', () => {
  it('a descriptor that binds no preset to a section, and Aurora will not invent one', () => {
    const presets = { ...nineDistinct().presets };
    delete (presets as Record<number, string>)[4];
    const plan = planSectionMigration(nineDistinct({ presets }));
    expect(plan.document).toBeNull();
    expect(plan.refusals.join('\n')).toMatch(/binds no preset to section 4/);
  });

  it('an empty grid slot, whose pixels would belong to no region', () => {
    const sections = nineDistinct().sections.slice();
    sections[7] = null;
    const plan = planSectionMigration(nineDistinct({ sections }));
    expect(plan.document).toBeNull();
    expect(plan.refusals.join('\n')).toMatch(/grid slots hold no section \(7\)/);
  });

  it('an act key the codec would refuse', () => {
    const plan = planSectionMigration(nineDistinct({ actKey: 'OJZ Act 1' }));
    expect(plan.document).toBeNull();
    expect(plan.refusals.join('\n')).toMatch(/not a legal regions-document act key/);
  });

  it('a section count that disagrees with the declared grid', () => {
    const plan = planSectionMigration(nineDistinct({ sections: [section(0), section(1)] }));
    expect(plan.document).toBeNull();
    expect(plan.refusals.join('\n')).toMatch(/9 slots.*carries 2 section slots/s);
  });

  it('a key-less row that lies outside the act entirely', () => {
    const plan = planSectionMigration(nineDistinct({
      unkeyed: [{
        preset: 'ZZZ_Elsewhere', line: 99, constructorName: 'zzz_region',
        edges: { x0: 99999, x1: 100000, y0: 0, y1: 10 },
      }],
    }));
    expect(plan.document).toBeNull();
    expect(plan.refusals.join('\n')).toMatch(/lies entirely outside this 3x3 act/);
  });
});
