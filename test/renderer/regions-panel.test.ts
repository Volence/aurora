// THE REGIONS PANEL'S DERIVATIONS — editor spec §3.4, the list, the bindings
// rows, the badges and the status line. `src/renderer/providers/regions-aeon.ts`.
//
// ⚠ EVERY "NOTHING IS WRONG" ROW HERE CARRIES A CONTROL THAT MAKES THE SAME
// CALL SPEAK. An empty list, a clean document and a dead instrument all produce
// `[]`; a row that only ever sees the clean case proves nothing about which of
// the three it is looking at. This is the same bar `regions-validation.test.ts`
// sets one directory over, and the reason §7 row 6's badge gate ("badge text
// differs per row") is dangerous: it passes on an empty list.
//
// NOTHING HERE READS A PEER REPO AND NOTHING HERE RUNS THE APP. The facet
// gating and the badges ON SCREEN are the CDP harness's job
// (`scratchpad/regions-facet-harness.mjs`); this file is the pure half, and the
// packet says which claims belong to which instrument.

import { describe, it, expect } from 'vitest';
import {
  actBindingDefaults,
  actListRow,
  actValueWord,
  BINDING_ORDER,
  regionBgLabel,
  regionBindingCommand,
  regionBindingRows,
  regionBindingValue,
  type RegionBindingKey,
  regionListRows,
  regionRectFindings,
  regionStatusRows,
  setRegionBinding,
} from '../../src/renderer/providers/regions-aeon';
import { BG_ACT_SENTINEL, type RegionBindingVocabulary } from '../../src/core/formats/regions/validate';
import type { Region, RegionsDocument } from '../../src/core/formats/regions/document';
import type { BgLibraryEntry } from '../../src/core/model/s4-types';
import { SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';
import { EditHistory } from '../../src/core/editing/history';
import { noRegionsLoaded } from '../../src/core/formats/regions/act-regions';
import type { S4Level } from '../../src/core/editing/commands';
import type { Act } from '../../src/core/model/s4-types';

// ---------------------------------------------------------------------------
// Fixtures — the same shapes regions-validation.test.ts uses, so the two files
// disagree about nothing.
// ---------------------------------------------------------------------------

/** One section wide and high. Every rectangle below is derived from it. */
const ACT = { actW: SECTION_PIXEL_SIZE, actH: SECTION_PIXEL_SIZE };
const HALF = ACT.actW / 2;

function region(over: Partial<Region> & { id: string }): Region {
  return {
    name: over.id,
    preset: 'OJZ_Preset_Plain',
    rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH },
    ...over,
  };
}

function docOf(...regions: Region[]): RegionsDocument {
  return { schema: 1, act: 'ojz_act1', regions };
}

/** The act tiled exactly by two regions — the ordinary, clean document. */
function tiledDoc(): RegionsDocument {
  return docOf(
    region({ id: 'forest', name: 'Forest', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
    region({ id: 'night', name: 'Night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
  );
}

const BG_LIB: BgLibraryEntry[] = [
  { id: 'forest_bg', name: 'Forest', layout: new Uint16Array(0), tiles: [] },
  { id: 'cave_bg', name: 'Cave', layout: new Uint16Array(0), tiles: [] },
];

function vocab(over: Partial<RegionBindingVocabulary> = {}): RegionBindingVocabulary {
  return {
    presetRecords: ['OJZ_Preset_Plain', 'OJZ_Preset_Night'],
    presetLibraryPath: 'games/sonic4/data/effects/ojz_effects.emp',
    sceneIds: ['ojz_act1_start'],
    sceneUnreadableIds: [],
    rasterIds: ['ojz_sec5_showcase'],
    rasterUnreadableIds: [],
    bgLayoutIds: ['forest_bg', 'cave_bg'],
    bgUnresolvedIds: [],
    ...over,
  };
}

const NO_ACT_SCENE = actBindingDefaults(null);

// ---------------------------------------------------------------------------
// 1. THE LIST ORDER — document order, and the painter's-order sentence is gone
// ---------------------------------------------------------------------------

describe('the list is in DOCUMENT order (the painter\'s-order sentence is superseded)', () => {
  it('one-entry-per-region: rows come back 1:1 with `regions[]`, unsorted, index matching position', () => {
    // Deliberately NOT in any geometric order: `zulu` is leftmost and last.
    const doc = docOf(
      region({ id: 'mid', rect: { x: HALF, y: 0, w: HALF / 2, h: ACT.actH } }),
      region({ id: 'right', rect: { x: HALF + HALF / 2, y: 0, w: HALF / 2, h: ACT.actH } }),
      region({ id: 'zulu', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
    );
    const rows = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(rows.map((r) => r.id)).toEqual(['mid', 'right', 'zulu']);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2]);

    // ANTI-VACUOUS: a sort by x would have produced a DIFFERENT list, so this
    // row can tell "preserved" from "happened to agree".
    const byX = [...doc.regions].sort((a, b) => a.rect.x - b.rect.x).map((r) => r.id);
    expect(byX).not.toEqual(rows.map((r) => r.id));
  });

  it('a region with no `name` is labelled by its id, and one with a name by its name', () => {
    const doc = docOf(
      region({ id: 'anon', name: undefined, rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'named', name: 'Forest, upper mid', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    );
    expect(regionListRows(doc, NO_ACT_SCENE, BG_LIB).map((r) => r.label))
      .toEqual(['anon', 'Forest, upper mid']);
  });

  it('an EMPTY document produces an empty list, and the fixture that is not empty proves the call works', () => {
    expect(regionListRows(docOf(), NO_ACT_SCENE, BG_LIB)).toEqual([]);
    expect(regionListRows(tiledDoc(), NO_ACT_SCENE, BG_LIB)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 1b. A REGION THAT IS SEVERAL RECTANGLES LISTS ONCE (step 8B, item B)
//
// ⚠ EVERY ROW HERE ASSERTS THE FIXTURE REALLY HAS MORE ENTRIES THAN ROWS. On a
// one-entry-per-region document every claim below is trivially true — that is
// the shape the 1:1 mapping was correct for, and the shape that hid this.
// ---------------------------------------------------------------------------

/**
 * `forest` as a genuine L: a tall-left block and a NARROWER one below it, with
 * `night` filling the right. The notch matters — a fixture whose two pieces
 * happen to tile a rectangle would make "the bounds are not the shape"
 * unfalsifiable, because the bounds WOULD be the shape.
 *
 * The two `forest` entries are NOT adjacent, so a grouping that only merged
 * neighbours would fail here.
 */
const L_TALL = { x: 0, y: 0, w: HALF, h: HALF };
const L_FOOT = { x: 0, y: HALF, w: HALF / 2, h: HALF };
function lShapedDoc(): RegionsDocument {
  return docOf(
    region({ id: 'forest', name: 'Forest', rect: L_TALL }),
    region({ id: 'night', name: 'Night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    region({ id: 'forest', name: 'Forest', rect: L_FOOT }),
  );
}

describe('a region with several rectangles is ONE row (step 8B item B)', () => {
  it('lists once, at its FIRST entry\'s position, naming every entry it covers', () => {
    const doc = lShapedDoc();
    const rows = regionListRows(doc, NO_ACT_SCENE, BG_LIB);

    // ⚠ THE ANTI-VACUOUS FLOOR: the document must really carry more entries
    // than there are rows, or "lists once" is true of any correct 1:1 mapping.
    expect(doc.regions.length).toBe(3);
    expect(rows).toHaveLength(2);

    expect(rows.map((r) => r.id)).toEqual(['forest', 'night']);
    // FIRST-APPEARANCE ORDER: `forest` leads because entry 0 is forest's, even
    // though its second entry comes after night's.
    expect(rows[0].index).toBe(0);
    expect(rows[0].entryIndices).toEqual([0, 2]);
    expect(rows[1].index).toBe(1);
    expect(rows[1].entryIndices).toEqual([1]);
    // Every index a row claims really carries that row's id.
    for (const r of rows) for (const i of r.entryIndices) expect(doc.regions[i].id).toBe(r.id);
    // And every entry of the document is claimed by exactly one row.
    expect(rows.flatMap((r) => r.entryIndices).sort()).toEqual([0, 1, 2]);
  });

  it('carries every piece, and its `rect` is the BOUNDS of them, which is not its shape', () => {
    const doc = lShapedDoc();
    const [forest] = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(forest.entryIndices.length).toBeGreaterThanOrEqual(2);

    expect(forest.rects).toEqual([L_TALL, L_FOOT]);
    // The bounds, DERIVED from the fixture's own constants: the tall block's
    // width and the two blocks' stacked height.
    expect(forest.rect).toEqual({ x: 0, y: 0, w: HALF, h: HALF * 2 });

    // ⚠ THE POINT OF `rects`, asserted rather than asserted-about: the bounds
    // hold strictly MORE area than the region does, so a panel that showed the
    // bounds alone would be showing a shape the region does not have.
    const boundsArea = forest.rect.w * forest.rect.h;
    const pieceArea = forest.rects.reduce((a, r) => a + r.w * r.h, 0);
    expect(pieceArea).toBeLessThan(boundsArea);
  });

  it('a ONE-rectangle region is unchanged: one piece, `rect` its own, `entryIndices` just itself', () => {
    // The control for every row above. If grouping had broken the ordinary
    // case, the three rows above would still pass.
    const rows = regionListRows(tiledDoc(), NO_ACT_SCENE, BG_LIB);
    expect(rows).toHaveLength(2);
    for (const [i, r] of rows.entries()) {
      expect(r.rects).toHaveLength(1);
      expect(r.entryIndices).toEqual([i]);
      expect(r.index).toBe(i);
      expect(r.rect).toEqual(tiledDoc().regions[i].rect);
    }
  });

  it('bindings and label come from the FIRST entry, the same representative `setRegionBinding` converges on', () => {
    const doc = lShapedDoc();
    doc.regions[0].bg = { layoutRef: 'cave_bg' };
    doc.regions[2].bg = { layoutRef: 'forest_bg' };
    const [forest] = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(forest.entryIndices).toEqual([0, 2]);
    // ANTI-VACUOUS: the two entries deliberately DISAGREE here, so the row can
    // tell "took the first" from "took whichever, they were the same". A
    // document out of `setRegionBinding` or the gesture layer never disagrees;
    // a hand-edited one can, and the panel must be predictable about it.
    expect(BG_LIB.find((b) => b.id === 'cave_bg')!.name).not
      .toBe(BG_LIB.find((b) => b.id === 'forest_bg')!.name);
    expect(forest.bg.text).toBe('Cave');
  });

  it('an OVERLAP with another region is named ONCE per id, however many entry pairs overlap', () => {
    // `night` is widened to cover BOTH of forest's pieces: two entry pairs, one
    // pair of ids. Per-entry rows would have said it twice.
    const doc = docOf(
      region({ id: 'forest', rect: L_TALL }),
      region({ id: 'night', rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH } }),
      region({ id: 'forest', rect: L_FOOT }),
    );
    const rows = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(rows).toHaveLength(2);
    expect(rows[0].entryIndices.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].overlaps).toEqual(['night']);
    expect(rows[1].overlaps).toEqual(['forest']);
  });

  it('a region does NOT name ITSELF when two of its own entries overlap, but the status row still does', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: HALF } }),
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: HALF } }),
    );
    const rows = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(rows).toHaveLength(1);
    expect(rows[0].entryIndices).toEqual([0, 1]);
    // The row's field is for "which OTHER region do I have to go and move".
    expect(rows[0].overlaps).toEqual([]);
    // ⚠ AND IT IS NOT SWALLOWED. Without this the row above would be
    // indistinguishable from dropping the finding on the floor.
    const overlap = statusOf(doc).find((r) => r.id === 'overlap');
    expect(overlap!.tone).toBe('warning');
    expect(overlap!.text).toContain('forest and forest');
  });
});

// ---------------------------------------------------------------------------
// 2. THE OVERLAP MARK — §3.4's "hidden" successor under the Q1 ruling
// ---------------------------------------------------------------------------

describe('the overlap mark (the successor to §3.4\'s "hidden", which the ruling made impossible)', () => {
  it('a DISJOINT set marks nothing, and an overlapping one names the other region, both ways', () => {
    // The clean control first, so "no marks" is known to be the disjoint answer
    // and not the answer of an instrument that never looks.
    expect(regionListRows(tiledDoc(), NO_ACT_SCENE, BG_LIB).map((r) => r.overlaps))
      .toEqual([[], []]);

    const overlapping = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF + 16, h: ACT.actH } }),
      region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    );
    const rows = regionListRows(overlapping, NO_ACT_SCENE, BG_LIB);
    // SYMMETRIC: each row names the OTHER. A one-directional mark would leave
    // the author staring at a clean-looking row that is half the problem.
    expect(rows[0].overlaps).toEqual(['night']);
    expect(rows[1].overlaps).toEqual(['forest']);
  });

  it('a region overlapping TWO others names both', () => {
    const doc = docOf(
      region({ id: 'a', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'b', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'wide', rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH } }),
    );
    const rows = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(rows[2].overlaps.sort()).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// 3. THE BACKGROUND LABEL — ALWAYS, in words (ruling 2026-09-16)
// ---------------------------------------------------------------------------

describe('the background is named in words on EVERY row, unconditionally', () => {
  it('the all-shared launch state (every region inherits) still says `act` on every row', () => {
    // THIS IS THE ROW THE RULING IS ABOUT. Under the rejected CONDITIONAL design
    // every one of these labels would be absent, which is why the assertion is
    // on presence and content, never on a difference between rows.
    const rows = regionListRows(tiledDoc(), NO_ACT_SCENE, BG_LIB);
    expect(rows.map((r) => r.bg.text)).toEqual(['act', 'act']);
    expect(rows.every((r) => r.bg.missing === false)).toBe(true);
    // ANTI-VACUOUS: the fixture has rows at all.
    expect(rows).toHaveLength(2);
  });

  it('a bound layout is named by the library entry\'s NAME, not its id', () => {
    const doc = docOf(region({ id: 'forest', bg: { layoutRef: 'forest_bg' } }));
    const [row] = regionListRows(doc, NO_ACT_SCENE, BG_LIB);
    expect(row.bg).toEqual({ text: 'Forest', missing: false });
    // The id and the name differ in the fixture, so this discriminates.
    expect(row.bg.text).not.toBe('forest_bg');
  });

  it('the `@act` SENTINEL and an inheriting null both read `act`, and neither is a warning', () => {
    expect(regionBgLabel(BG_ACT_SENTINEL, NO_ACT_SCENE, BG_LIB)).toEqual({ text: 'act', missing: false });
    expect(regionBgLabel(null, NO_ACT_SCENE, BG_LIB)).toEqual({ text: 'act', missing: false });
    expect(regionBgLabel(undefined, NO_ACT_SCENE, BG_LIB)).toEqual({ text: 'act', missing: false });
  });

  it('a DANGLING ref reads `MISSING <id>` in the warning arm: the third state the ruling names', () => {
    expect(regionBgLabel('gone_bg', NO_ACT_SCENE, BG_LIB))
      .toEqual({ text: 'MISSING gone_bg', missing: true });
    // The control: the same call on an id the library DOES hold is not a warning.
    expect(regionBgLabel('cave_bg', NO_ACT_SCENE, BG_LIB).missing).toBe(false);
  });

  it('the act row resolves its background through the SAME function a region does', () => {
    const row = actListRow(tiledDoc(), NO_ACT_SCENE, BG_LIB);
    expect(row.label).toBe('act');
    expect(row.actId).toBe('ojz_act1');
    expect(row.bg).toEqual(regionBgLabel(null, NO_ACT_SCENE, BG_LIB));
  });
});

// ---------------------------------------------------------------------------
// 4. THE BADGES — §7 row 6's named gate
// ---------------------------------------------------------------------------

describe('the four bindings rows and their badges (§3.4, gated by §7 row 6)', () => {
  it('the four rows are `preset`, `scene`, `raster`, `bg layout`, in §3.4\'s order', () => {
    const rows = regionBindingRows(region({ id: 'forest' }), NO_ACT_SCENE);
    expect(rows.map((r) => r.key)).toEqual([...BINDING_ORDER]);
    expect(rows.map((r) => r.label)).toEqual(['preset', 'scene', 'raster', 'bg layout']);
  });

  it('BADGE TEXT DIFFERS PER ROW on a wholly-inherited region: the §7 row 6 gate, non-vacuously', () => {
    const rows = regionBindingRows(region({ id: 'forest' }), NO_ACT_SCENE);
    const badges = rows.map((r) => r.badge);
    // The gate itself.
    expect(new Set(badges).size).toBe(4);
    // ⚠ AND WHAT IT SAYS, because "all distinct" is also true of four empty-ish
    // strings and of four copies of an id. An empty list would pass the set-size
    // assertion with size 0 === 0 on a zero-length array in a weaker phrasing;
    // this pins the count AND the content.
    expect(badges).toEqual([
      'explicit (required)',
      'inherited (act: default)',
      'inherited (act: none)',
      'inherited (act: @act)',
    ]);
  });

  it('the act\'s OWN scene appears in the scene badge: the badge reads the act, not a constant', () => {
    const rows = regionBindingRows(region({ id: 'forest' }), actBindingDefaults('ojz_act1_start'));
    expect(rows[1].badge).toBe('inherited (act: ojz_act1_start)');
    // The control: with no act scene the same row says `default`, so the badge
    // is a function of the act and not of the key.
    expect(regionBindingRows(region({ id: 'forest' }), NO_ACT_SCENE)[1].badge)
      .toBe('inherited (act: default)');
  });

  it('`preset` is REQUIRED: always explicit, never inherited, and never offers a revert', () => {
    const rows = regionBindingRows(region({ id: 'forest', preset: 'OJZ_Preset_Night' }), NO_ACT_SCENE);
    expect(rows[0].state).toBe('required');
    expect(rows[0].value).toBe('OJZ_Preset_Night');
    expect(rows[0].canRevert).toBe(false);
    // The control: a nullable row with a value DOES offer one, so `canRevert:
    // false` here is about `preset` and not about the whole function.
    const detached = regionBindingRows(
      region({ id: 'forest', sceneRef: 'ojz_act1_start' }), NO_ACT_SCENE);
    expect(detached[1].canRevert).toBe(true);
  });

  it('an EXPLICIT nullable row badges `explicit` and offers a revert; the other three stay inherited', () => {
    const rows = regionBindingRows(
      region({ id: 'forest', rasterRef: 'ojz_sec5_showcase' }), NO_ACT_SCENE);
    expect(rows.map((r) => r.state)).toEqual(['required', 'inherited', 'explicit', 'inherited']);
    expect(rows.map((r) => r.canRevert)).toEqual([false, false, true, false]);
    expect(rows[2].badge).toBe('explicit');
  });

  it('`actValueWord` answers for a preset with a sentence, never with `none`', () => {
    // `none` would read as "the act has a preset and it is empty". There is no
    // act preset at all — §2.3's own reason for making the region's required.
    expect(actValueWord('preset', NO_ACT_SCENE)).toBe('no act preset');
    expect(actValueWord('raster', NO_ACT_SCENE)).toBe('none');
  });

  it('`regionBindingValue` reads each binding from its own place in the contract', () => {
    const r = region({
      id: 'x', preset: 'OJZ_Preset_Night', sceneRef: 'ojz_act1_start',
      rasterRef: 'ojz_sec5_showcase', bg: { layoutRef: 'forest_bg' },
    });
    expect(BINDING_ORDER.map((k) => regionBindingValue(r, k)))
      .toEqual(['OJZ_Preset_Night', 'ojz_act1_start', 'ojz_sec5_showcase', 'forest_bg']);
    // Absent keys read null, and `bg` absent entirely is not a crash.
    const bare = region({ id: 'y' });
    expect(BINDING_ORDER.slice(1).map((k) => regionBindingValue(bare, k)))
      .toEqual([null, null, null]);
  });
});

// ---------------------------------------------------------------------------
// 5. DETACH ON EDIT, AND REVERT
// ---------------------------------------------------------------------------

describe('detach on edit and revert to inherited', () => {
  it('editing an INHERITED row makes it explicit, and the badge follows', () => {
    const doc = tiledDoc();
    expect(regionBindingRows(doc.regions[0], NO_ACT_SCENE)[1].state).toBe('inherited');

    const next = setRegionBinding(doc, 'forest', 'scene', 'ojz_act1_start');
    expect(next).not.toBeNull();
    const rows = regionBindingRows(next!.regions[0], NO_ACT_SCENE);
    expect(rows[1].state).toBe('explicit');
    expect(rows[1].badge).toBe('explicit');
    expect(rows[1].canRevert).toBe(true);
    // THE ORIGINAL IS UNTOUCHED — the command's old half must still restore.
    expect(doc.regions[0].sceneRef ?? null).toBeNull();
  });

  it('reverting sets the value back to null and the badge back to `inherited (act: …)`', () => {
    const doc = setRegionBinding(tiledDoc(), 'forest', 'scene', 'ojz_act1_start')!;
    const back = setRegionBinding(doc, 'forest', 'scene', null);
    expect(back).not.toBeNull();
    expect(back!.regions[0].sceneRef).toBeNull();
    expect(regionBindingRows(back!.regions[0], NO_ACT_SCENE)[1].badge)
      .toBe('inherited (act: default)');
  });

  it('`preset` REFUSES a revert: the schema makes it required and there is nothing to inherit', () => {
    expect(setRegionBinding(tiledDoc(), 'forest', 'preset', null)).toBeNull();
    // The control: the SAME call with a value succeeds, so the null refusal is
    // about the null and not about the key being unwritable.
    const set = setRegionBinding(tiledDoc(), 'forest', 'preset', 'OJZ_Preset_Night');
    expect(set!.regions[0].preset).toBe('OJZ_Preset_Night');
  });

  it('a no-op edit and an unknown region both return null, so no undo entry is pushed', () => {
    const doc = tiledDoc();
    expect(setRegionBinding(doc, 'forest', 'preset', 'OJZ_Preset_Plain')).toBeNull();
    expect(setRegionBinding(doc, 'forest', 'scene', null)).toBeNull();
    expect(setRegionBinding(doc, 'nobody', 'scene', 'ojz_act1_start')).toBeNull();
    // The control: a real change is not null.
    expect(setRegionBinding(doc, 'forest', 'scene', 'ojz_act1_start')).not.toBeNull();
  });

  it('`bg` is written into the contract\'s OBJECT, creating it when the region has none', () => {
    const doc = tiledDoc();
    expect(doc.regions[0].bg).toBeUndefined();
    const next = setRegionBinding(doc, 'forest', 'bg', 'forest_bg')!;
    expect(next.regions[0].bg).toEqual({ layoutRef: 'forest_bg' });
    const back = setRegionBinding(next, 'forest', 'bg', null)!;
    expect(back.regions[0].bg).toEqual({ layoutRef: null });
  });

  it('the command is act-ambient, describes itself, and its two halves do not share objects', () => {
    const doc = tiledDoc();
    const cmd = regionBindingCommand(doc, 'forest', 'scene', 'ojz_act1_start')!;
    expect(cmd.type).toBe('set-regions');
    expect(cmd.sectionIndex).toBe(-1);
    expect(cmd.description).toBe('Set forest scene');
    expect(regionBindingCommand(doc, 'forest', 'raster', null)).toBeNull();

    // NO ALIASING between the halves, and none with the caller's document: a
    // shared nested object is step 5's M1 defect one layer up.
    expect(cmd.oldDocument!.regions[0]).not.toBe(cmd.newDocument!.regions[0]);
    expect(cmd.oldDocument!.regions[0]).not.toBe(doc.regions[0]);
    expect(cmd.oldDocument!.regions[0].sceneRef ?? null).toBeNull();
    expect(cmd.newDocument!.regions[0].sceneRef).toBe('ojz_act1_start');
  });

  it('the command round-trips through the REAL history stack, not a hand-rolled apply', () => {
    // Anything less would assert that this module builds a plausible-looking
    // object, which is not the claim. `EditHistory` is what the app runs, and
    // its `set-regions` case goes through `writeActRegionsDocument`.
    const doc = tiledDoc();
    const act = { id: 'act1', regions: { ...noRegionsLoaded(), document: doc } } as unknown as Act;
    const level = { sections: [], act } as unknown as S4Level;
    const cmd = regionBindingCommand(doc, 'forest', 'scene', 'ojz_act1_start')!;
    const h = new EditHistory();

    h.execute(cmd, level);
    expect(act.regions.document!.regions[0].sceneRef).toBe('ojz_act1_start');
    h.undo(level);
    expect(act.regions.document!.regions[0].sceneRef ?? null).toBeNull();
    h.redo(level);
    expect(act.regions.document!.regions[0].sceneRef).toBe('ojz_act1_start');
    // ⚠ THE LOAD'S VERDICT IS NOT TOUCHED by an edit — step 5's M3.
    expect(act.regions.loadedPath).toBeNull();
    expect(act.regions.unreadable).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5b. A BINDING EDIT ON A REGION THAT IS SEVERAL ENTRIES (step 8B, item A)
//
// ⚠ EVERY ROW HERE ASSERTS ITS FIXTURE HOLDS ≥2 ENTRIES FOR THE ID *BEFORE*
// THE EDIT. Without that floor each row passes identically on a single-entry
// document — which is the shape that hid this defect for two steps: `findIndex`
// edits entry 0, and on a one-entry region entry 0 IS the region.
// ---------------------------------------------------------------------------

/**
 * `forest` as TWO entries, `night` as one — the shape a carve produces
 * (`applyRegionGestureToDocument`: one `rect` per entry, so a region's area is a
 * SET of entries).
 *
 * THE TWO `forest` ENTRIES ARE NOT ADJACENT, deliberately: `night` sits between
 * them, so a fix that walks a contiguous run from the first match, or that stops
 * at the second entry, fails here instead of passing by luck of the ordering.
 */
function carvedDoc(): RegionsDocument {
  return docOf(
    region({ id: 'forest', name: 'Forest', rect: { x: 0, y: 0, w: HALF, h: HALF } }),
    region({ id: 'night', name: 'Night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    region({ id: 'forest', name: 'Forest', rect: { x: 0, y: HALF, w: HALF, h: HALF } }),
  );
}

/** Every entry carrying `id`, in document order. The population each row edits. */
const entriesOf = (doc: RegionsDocument, id: string) => doc.regions.filter((r) => r.id === id);

/**
 * A legal value for each binding, taken from the SAME vocabulary the panel's
 * pickers offer, so no row asserts against a value the app could not produce.
 */
const A_VALUE: Record<RegionBindingKey, string> = {
  preset: 'OJZ_Preset_Night',
  scene: 'ojz_act1_start',
  raster: 'ojz_sec5_showcase',
  bg: 'cave_bg',
};

/** Every binding key's value on one entry — the census each row compares. */
const bindingCensus = (r: Region) =>
  BINDING_ORDER.map((k) => `${k}=${JSON.stringify(regionBindingValue(r, k))}`).join(' ');

describe('a binding edit reaches EVERY entry of a multi-entry region (step 8B item A)', () => {
  it('after an edit on ANY key, every entry of that id agrees on EVERY key', () => {
    // The population is BINDING_ORDER, derived from the module, not a list of
    // four keys typed here that would silently stop covering a fifth.
    for (const key of BINDING_ORDER) {
      const doc = carvedDoc();
      // ⚠ THE ANTI-VACUOUS FLOOR. Without this the whole loop passes on a
      // one-entry document, where "every entry agrees" is trivially true.
      const before = entriesOf(doc, 'forest');
      expect(before.length).toBeGreaterThanOrEqual(2);

      const next = setRegionBinding(doc, 'forest', key, A_VALUE[key]);
      expect(next, `${key}: the edit itself must not be refused`).not.toBeNull();

      const after = entriesOf(next!, 'forest');
      expect(after.length, `${key}: no entry may be added or dropped`).toBe(before.length);
      // THE PROPERTY, as a CENSUS over every key and not just the edited one: a
      // fix that wrote `key` to every entry but left the other three as they
      // were on entry 0 would still leave the pieces disagreeing.
      const censuses = new Set(after.map(bindingCensus));
      expect([...censuses], `${key}: the pieces of one region must agree`).toHaveLength(1);
      // And the edit actually landed — otherwise "they all agree" is satisfied
      // by a function that wrote nothing at all.
      for (const r of after) expect(regionBindingValue(r, key)).toBe(A_VALUE[key]);
    }
  });

  it('no OTHER region\'s entries change when one region\'s binding is edited', () => {
    const doc = carvedDoc();
    expect(entriesOf(doc, 'forest').length).toBeGreaterThanOrEqual(2);
    const nightBefore = JSON.stringify(entriesOf(doc, 'night'));
    // The control: `night` is a region this document really has, so an empty
    // "nothing changed" is not what is being measured.
    expect(entriesOf(doc, 'night')).toHaveLength(1);

    for (const key of BINDING_ORDER) {
      const next = setRegionBinding(carvedDoc(), 'forest', key, A_VALUE[key])!;
      expect(JSON.stringify(entriesOf(next, 'night')), `${key}`).toBe(nightBefore);
    }
  });

  it('entries that have DRIFTED apart are repaired, never read as "already that value"', () => {
    // The document the old short-circuit could not fix: entry 0 already carries
    // the value the author is asking for, and the other entry does not. Asking
    // the FIRST entry alone answers "no-op" and the disagreement becomes
    // unfixable from the panel.
    const doc = carvedDoc();
    doc.regions[0].sceneRef = 'ojz_act1_start';
    const drifted = entriesOf(doc, 'forest');
    expect(drifted.length).toBeGreaterThanOrEqual(2);
    expect(new Set(drifted.map(bindingCensus)).size,
      'the fixture must actually be drifted, or this row measures nothing').toBe(2);

    const next = setRegionBinding(doc, 'forest', 'scene', 'ojz_act1_start');
    expect(next, 'a drifted id must not short-circuit').not.toBeNull();
    const after = entriesOf(next!, 'forest');
    expect(new Set(after.map(bindingCensus))).toHaveLength(1);
    for (const r of after) expect(r.sceneRef).toBe('ojz_act1_start');

    // THE CONTROL, so the row above is not just "this function never returns
    // null": with every entry already agreeing, the same call IS a no-op.
    expect(setRegionBinding(next!, 'forest', 'scene', 'ojz_act1_start')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. THE STATUS LINE — §2.5 live
// ---------------------------------------------------------------------------

const statusOf = (doc: RegionsDocument, over: Partial<{ v: RegionBindingVocabulary; sidecars: number }> = {}) =>
  regionStatusRows({
    doc, act: ACT, vocab: over.v ?? vocab(), sidecarsWithRefs: over.sidecars ?? 0,
  });
const rowById = (doc: RegionsDocument, id: string, over = {}) =>
  statusOf(doc, over).find((r) => r.id === id);

describe('the status line: §2.5 live, where the author is looking at the thing judged', () => {
  it('a clean, exactly-tiling document reports coverage OK and sidecars none, and NOTHING as a warning bar rule 4', () => {
    const rows = statusOf(tiledDoc());
    expect(rows.filter((r) => r.tone === 'warning')).toEqual([]);
    expect(rowById(tiledDoc(), 'unassigned')!.tone).toBe('ok');
    expect(rowById(tiledDoc(), 'sidecars')!.tone).toBe('ok');
    // ANTI-VACUOUS: the clean run still produced rows, so "no warnings" is not
    // "no output".
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('an UNASSIGNED area is a warning naming its size and position: the state the ruling made first-class', () => {
    const hole = docOf(region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }));
    const row = rowById(hole, 'unassigned')!;
    expect(row.tone).toBe('warning');
    expect(row.text).toContain('UNASSIGNED');
    expect(row.text).toContain(`${HALF}x${ACT.actH} at ${HALF},0`);
    // ⚠ THE CONTROL THAT MAKES THIS NON-VACUOUS, and the seam review named it:
    // a stubbed `uncoveredRects` returning [] leaves a coverage row GREEN,
    // because [] is what a correct document and a dead instrument both produce.
    // Only punching a hole reddens it — which is what this test does, with the
    // tiled document above as the other half of the pair.
    expect(rowById(tiledDoc(), 'unassigned')!.tone).toBe('ok');
  });

  it('an OVERLAP names BOTH regions and the rectangle they share', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF + 16, h: ACT.actH } }),
      region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    );
    const row = rowById(doc, 'overlap')!;
    expect(row.tone).toBe('warning');
    expect(row.text).toContain('forest and night');
    expect(row.text).toContain(`16x${ACT.actH} at ${HALF},0`);
    // The control: a disjoint set puts the SAME row in its `ok` arm, never
    // nothing. (Before the 2026-09-16 CALL 1 ruling this line read
    // `toBeUndefined()`; the arm it was pinning was the defect.)
    expect(rowById(tiledDoc(), 'overlap')!.tone).toBe('ok');
  });

  it('a DISJOINT set SAYS SO: the overlap row has an `ok` arm, so silence never stands for a pass', () => {
    // ⚠ THE PAIR IS THE WHOLE ROW, and one half alone is vacuous in a way worth
    // spelling out: "on an overlapping document there is no `ok` row" passes
    // identically against a `regionStatusRows` that pushes NOTHING for overlap
    // at all, which is exactly the state this ruling ended. So both arms are
    // asserted here, on one id, against the same pair of documents.
    const clean = rowById(tiledDoc(), 'overlap');
    expect(clean, 'a clean document must still produce the row').toBeDefined();
    expect(clean!.tone).toBe('ok');
    expect(clean!.text).toContain('No two regions overlap');
    // The count is derived from the document, never typed: it is what tells a
    // reader "two regions were compared" from "there was nothing to compare".
    expect(clean!.text).toContain(`${tiledDoc().regions.length} regions checked`);

    const overlapping = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF + 16, h: ACT.actH } }),
      region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    );
    const bad = rowById(overlapping, 'overlap');
    expect(bad, 'an overlapping document must produce the row too').toBeDefined();
    expect(bad!.tone).toBe('warning');
    // And the two arms are DIFFERENT text, so neither is the other's default.
    expect(bad!.text).not.toContain('No two regions overlap');
  });

  it('the `ok` arm counts what it checked, so an EMPTY document cannot borrow a clean one\'s green', () => {
    // A document with no regions trivially has no overlapping pair. It gets the
    // same tone, and must not get the same sentence: the singular/plural count
    // is the only thing on screen that separates "nothing overlaps" from
    // "nothing is here".
    const empty = rowById(docOf(), 'overlap')!;
    expect(empty.tone).toBe('ok');
    expect(empty.text).toContain('0 regions checked');
    const one = rowById(docOf(region({ id: 'only' })), 'overlap')!;
    expect(one.text).toContain('1 region checked');
    expect(one.text).not.toContain('1 regions checked');
  });

  it('an unresolvable binding names the FILE, through the load\'s own function', () => {
    const doc = docOf(region({
      id: 'forest', rect: { x: 0, y: 0, w: ACT.actW, h: ACT.actH },
      preset: 'OJZ_Preset_Nope',
    }));
    const rows = statusOf(doc).filter((r) => r.id.startsWith('binding-'));
    expect(rows).toHaveLength(1);
    expect(rows[0].tone).toBe('warning');
    expect(rows[0].text).toContain('games/sonic4/data/effects/ojz_effects.emp');
    expect(rows[0].text).toContain('OJZ_Preset_Nope');
    // The control: the same document with the record in the vocabulary is silent.
    expect(statusOf(doc, { v: vocab({ presetRecords: ['OJZ_Preset_Nope'] }) })
      .filter((r) => r.id.startsWith('binding-'))).toEqual([]);
  });

  it('an UNREADABLE preset library is LOUD, not silent and not "all broken"', () => {
    const rows = statusOf(tiledDoc(), { v: vocab({ presetRecords: null }) })
      .filter((r) => r.id.startsWith('binding-'));
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain('NOT CHECKED');
    // The control: an EMPTY vocabulary is a different answer — every preset
    // unresolvable — and must not be confused with "could not read".
    const empty = statusOf(tiledDoc(), { v: vocab({ presetRecords: [] }) })
      .filter((r) => r.id.startsWith('binding-'));
    expect(empty).toHaveLength(1);
    expect(empty[0].text).not.toContain('NOT CHECKED');
    expect(empty[0].text).toContain('does not declare');
  });

  it('SIDECARS still carrying refs say "migrate", and the count is the input\'s', () => {
    const row = rowById(tiledDoc(), 'sidecars', { sidecars: 3 })!;
    expect(row.tone).toBe('warning');
    expect(row.text).toContain('3 sidecars still carry refs: migrate');
    // Singular, so the sentence is not a plural-only transcription.
    expect(rowById(tiledDoc(), 'sidecars', { sidecars: 1 })!.text)
      .toContain('1 sidecar still carries refs: migrate');
  });

  it('RULE 4 is UNMEASURABLE on EVERY document, clean or broken: never ok, never a warning', () => {
    // The rule this repository cannot answer must not render as a pass. It
    // names the constants and where they live, so the reader knows what is
    // missing rather than that something is.
    for (const doc of [tiledDoc(), docOf(), docOf(region({ id: 'tiny', rect: { x: 0, y: 0, w: 1, h: 1 } }))]) {
      const row = regionStatusRows({ doc, act: ACT, vocab: vocab(), sidecarsWithRefs: 0 })
        .find((r) => r.id === 'min-span')!;
      expect(row.tone).toBe('unmeasurable');
      expect(row.text).toContain('NOT CHECKED');
      expect(row.text).toContain('REGION_MIN_SPAN');
    }
    // ANTI-VACUOUS: `unmeasurable` is a tone this function can NOT emit for
    // everything — the other rows in the same call carry real verdicts.
    const tones = new Set(statusOf(tiledDoc()).map((r) => r.tone));
    expect(tones.has('ok')).toBe(true);
  });

  it('every status row id is unique, so a surface can address one', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF + 16, h: ACT.actH }, preset: 'Nope' }),
      region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH }, sceneRef: 'gone' }),
    );
    const ids = statusOf(doc, { sidecars: 2 }).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(4);
  });
});

describe('per-region rect findings, for the row that owns the rectangle', () => {
  it('a rect past the act\'s edge produces a finding naming the act\'s real size; a legal one produces none', () => {
    const bad = region({ id: 'over', rect: { x: 0, y: 0, w: ACT.actW + 1, h: ACT.actH } });
    const msgs = regionRectFindings(bad, ACT);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain(String(ACT.actW));
    expect(regionRectFindings(region({ id: 'ok' }), ACT)).toEqual([]);
  });
});
