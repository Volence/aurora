// THE PER-RECTANGLE LIST — editor spec §3.4's `rects #1 …` detail row,
// `src/renderer/providers/regions-rect-list.ts`. ROADMAP §5.1 row 206 item 1.
//
// Expectations are derived from the spec's words and from the gesture layer's
// own contract, never from a run of the code under test:
//   · §3.4's mock: one line per rectangle, `#1`-numbered, with [Fit to 16];
//   · §3.2: base snap 16 px, NEAREST multiple (region-marquee.ts's header);
//   · §3.2's last row: "Delete on a selected rect: remove it; a region whose
//     last rect is removed is removed with it";
//   · the Q1 ruling (§8): a geometry writer trims what it lands on.
//
// Every "nothing" row has a control beside it that makes the same call speak.
//
// Row tags in [brackets] are what the packet's mutation table cites.

import { describe, it, expect } from 'vitest';
import {
  fitRectToGrid,
  regionRectDeleteOutcome,
  regionRectFieldCommand,
  regionRectFitOutcome,
  regionRectRows,
  regionsRemovedSentence,
} from '../../src/renderer/providers/regions-rect-list';
import { REGION_SNAP_PX } from '../../src/core/editing/region-marquee';
import { disjointness } from '../../src/core/editing/region-geometry';
import type { Region, RegionsDocument } from '../../src/core/formats/regions/document';
import { SECTION_PIXEL_SIZE } from '../../src/core/model/s4-types';
import type { SetRegionsCommand } from '../../src/core/editing/commands';

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
/** A command's new document, which every door here sets (the type allows null). */
function next(cmd: SetRegionsCommand | null): RegionsDocument {
  expect(cmd).not.toBeNull();
  expect(cmd!.newDocument).not.toBeNull();
  return cmd!.newDocument as RegionsDocument;
}

/**
 * A carved act: `forest` is TWO entries with `night` BETWEEN them in the file,
 * and forest's entries are NOT in x order (its right half is listed first), so
 * "document order" and "sorted" give different answers.
 */
function carvedDoc(): RegionsDocument {
  return docOf(
    region({ id: 'forest', name: 'Forest', rect: { x: HALF + 256, y: 0, w: HALF - 256, h: ACT.actH } }),
    region({ id: 'night', name: 'Night', rect: { x: HALF, y: 0, w: 256, h: ACT.actH } }),
    region({ id: 'forest', name: 'Forest', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
  );
}

describe('the spec constant this file derives from', () => {
  it('[snap] §3.2\'s base snap and §3.4\'s "Fit to 16" are the same number', () => {
    expect(REGION_SNAP_PX).toBe(16);
  });
});

describe('ORDER: the selected region\'s entries in document order, numbered from 1', () => {
  it('[order] forest\'s two entries come back as #1 and #2 at document indices 0 and 2', () => {
    const rows = regionRectRows(carvedDoc(), 'forest', ACT);
    expect(rows.map((r) => r.n)).toEqual([1, 2]);
    expect(rows.map((r) => r.entryIndex)).toEqual([0, 2]);
    expect(rows.map((r) => r.rect.x)).toEqual([HALF + 256, 0]);
    // ANTI-VACUOUS: a sort by x would list them the other way round.
    const byX = [...rows].sort((a, b) => a.rect.x - b.rect.x).map((r) => r.entryIndex);
    expect(byX).not.toEqual(rows.map((r) => r.entryIndex));
  });

  it('[only] only the named region\'s entries are listed; an unknown id lists nothing', () => {
    const night = regionRectRows(carvedDoc(), 'night', ACT);
    expect(night.map((r) => r.entryIndex)).toEqual([1]);
    // CONTROL: the same call on a real id is not empty, so [] below is an answer.
    expect(regionRectRows(carvedDoc(), 'gone', ACT)).toEqual([]);
  });

  it('[all] every entry of the region is listed, not only the first (the defect this list replaces)', () => {
    const doc = carvedDoc();
    const rows = regionRectRows(doc, 'forest', ACT);
    expect(rows).toHaveLength(doc.regions.filter((r) => r.id === 'forest').length);
    expect(rows.length).toBeGreaterThan(1);
  });
});

describe('THE FOUR NUMBERS write the entry they sit beside', () => {
  it('[field] editing #2\'s x changes document entry 2 and leaves entry 0 byte-identical', () => {
    const doc = carvedDoc();
    const rows = regionRectRows(doc, 'forest', ACT);
    const cmd = regionRectFieldCommand(doc, rows[1].entryIndex, 'x', 16);
    expect(cmd).not.toBeNull();
    expect(next(cmd).regions[2].rect.x).toBe(16);
    // THE PRE-PARCEL DEFECT, pinned as a negative: rectangle 1 is untouched.
    expect(next(cmd).regions[0]).toEqual(doc.regions[0]);
    expect(next(cmd).regions[1]).toEqual(doc.regions[1]);
    expect(cmd!.description).toContain('#2');
  });

  it('[field-old] the command carries the whole old document for undo, not a reference to it', () => {
    const doc = carvedDoc();
    const cmd = regionRectFieldCommand(doc, 0, 'w', 64)!;
    expect(cmd.type).toBe('set-regions');
    expect(cmd.sectionIndex).toBe(-1);
    expect(cmd.oldDocument).toEqual(doc);
    expect(cmd.oldDocument).not.toBe(doc);
    // And the input was not mutated.
    expect(doc.regions[0].rect.w).toBe(HALF - 256);
  });

  it('[field-noop] the same number, or an index past the end, is no command', () => {
    const doc = carvedDoc();
    expect(regionRectFieldCommand(doc, 0, 'x', doc.regions[0].rect.x)).toBeNull();
    expect(regionRectFieldCommand(doc, doc.regions.length, 'x', 0)).toBeNull();
    // CONTROL: a different number on a real index IS a command.
    expect(regionRectFieldCommand(doc, 0, 'x', doc.regions[0].rect.x + 16)).not.toBeNull();
  });

  it('[field-nocarve] a typed number carves nothing: an overlap it makes is left for the status line', () => {
    const doc = carvedDoc();
    // forest #2 (entry 2) grows 16 px into night.
    const cmd = regionRectFieldCommand(doc, 2, 'w', HALF + 16)!;
    const pieces = next(cmd).regions.map((r) => ({ id: r.id, rect: r.rect }));
    expect(disjointness(pieces).disjoint).toBe(false);
    expect(next(cmd).regions[1].rect).toEqual(doc.regions[1].rect);
  });
});

describe('[Fit to 16]', () => {
  it('[fit-edges] fits EDGES, not x and w: x 3400 w 1400 becomes x 3408 w 1392', () => {
    // Derived by hand from "nearest multiple of 16" applied to each EDGE:
    // left 3400 = 212.5 cells -> Math.round -> 213 -> 3408; right 3400+1400 =
    // 4800 = 300 cells exactly -> 4800. So w = 4800 - 3408.
    const r = { x: 3400, y: 0, w: 1400, h: 2048 };
    expect(fitRectToGrid(r)).toEqual({ x: 3408, y: 0, w: 1392, h: 2048 });
    // CONTROL: snapping w as a NUMBER would have given a different answer
    // (1400 = 87.5 cells -> 88 -> 1408), moving the on-grid right edge to 4816.
    const wAsNumber = Math.round(1400 / REGION_SNAP_PX) * REGION_SNAP_PX;
    expect(3408 + wAsNumber).not.toBe(4800);
  });

  it('[fit-edge-kept] an edge already on the grid does not move', () => {
    const r = { x: 3401, y: 7, w: 4800 - 3401, h: 2048 - 7 };
    const f = fitRectToGrid(r);
    expect(f.x + f.w).toBe(4800);
    expect(f.y + f.h).toBe(2048);
    // CONTROL: the off-grid edges did move.
    expect(f.x).not.toBe(3401);
    expect(f.y).not.toBe(7);
  });

  it('[fit-min] a sliver narrower than one cell fits to exactly one cell, never zero', () => {
    const f = fitRectToGrid({ x: 100, y: 100, w: 3, h: 3 });
    expect(f.w).toBe(REGION_SNAP_PX);
    expect(f.h).toBe(REGION_SNAP_PX);
  });

  it('[fitted] a row offers a fit only when its rect is off the grid', () => {
    const doc = docOf(
      region({ id: 'a', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'a', rect: { x: HALF, y: 0, w: 5, h: 5 } }),
    );
    const rows = regionRectRows(doc, 'a', ACT);
    expect(rows[0].fitted).toBeNull();
    expect(rows[1].fitted).toEqual(fitRectToGrid(doc.regions[1].rect));
  });

  it('[fit-none] Fit on an on-grid rect is `none`, not an empty undo step', () => {
    expect(regionRectFitOutcome(carvedDoc(), 0)).toEqual({ kind: 'none' });
  });

  it('[fit-carves] Fit is a resize through the gesture layer, so it trims what it grows into', () => {
    // forest and night meet flush at HALF + 8, which is 0.5 cells off the grid.
    // Fitting forest rounds its right edge to the NEAREST line, HALF + 16
    // (Math.round of x.5 goes up), which is 8 px INTO night.
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF + 8, h: ACT.actH } }),
      region({ id: 'night', rect: { x: HALF + 8, y: 0, w: HALF - 8, h: ACT.actH } }),
    );
    const out = regionRectFitOutcome(doc, 0);
    expect(out.kind).toBe('command');
    if (out.kind !== 'command') return;
    expect(out.trimmedIds).toContain('night');
    const pieces = next(out.command).regions.map((r) => ({ id: r.id, rect: r.rect }));
    expect(disjointness(pieces).disjoint).toBe(true);
    // CONTROL: the same geometry TYPED into the fields does not trim, so this
    // row is about the door, not about the arithmetic.
    const typed = regionRectFieldCommand(doc, 0, 'w', next(out.command).regions
      .find((r) => r.id === 'forest')!.rect.w)!;
    expect(disjointness(next(typed).regions.map((r) => ({ id: r.id, rect: r.rect })))
      .disjoint).toBe(false);
  });
});

describe('[Delete] (§3.2\'s last row)', () => {
  it('[delete] removing one of two rectangles keeps the region, with one entry', () => {
    const doc = carvedDoc();
    const out = regionRectDeleteOutcome(doc, 2);
    expect(out.kind).toBe('command');
    if (out.kind !== 'command') return;
    expect(out.removedIds).toEqual([]);
    const forest = next(out.command).regions.filter((r) => r.id === 'forest');
    expect(forest).toHaveLength(1);
    expect(forest[0].rect).toEqual(doc.regions[0].rect);
    expect(out.command.description).toContain('#2');
  });

  it('[delete-last] removing a region\'s last rectangle removes the region, and says so', () => {
    const doc = carvedDoc();
    const out = regionRectDeleteOutcome(doc, 1);
    expect(out.kind).toBe('command');
    if (out.kind !== 'command') return;
    expect(out.removedIds).toEqual(['night']);
    expect(next(out.command).regions.some((r) => r.id === 'night')).toBe(false);
  });

  it('[delete-oob] an index past the end is `none`', () => {
    expect(regionRectDeleteOutcome(carvedDoc(), 99)).toEqual({ kind: 'none' });
  });
});

describe('per-rectangle marks', () => {
  it('[rect-overlap] the rectangle that collides is the one marked, naming the other region', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: 256, h: ACT.actH } }),
      region({ id: 'forest', rect: { x: 256, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT.actH } }),
    );
    const rows = regionRectRows(doc, 'forest', ACT);
    expect(rows[0].overlaps).toEqual([]);
    expect(rows[1].overlaps).toEqual(['night']);
    // And symmetric: night's own row names forest.
    expect(regionRectRows(doc, 'night', ACT)[0].overlaps).toEqual(['forest']);
  });

  it('[rect-overlap-self] two entries of ONE region overlapping name nobody (same-id pairs dropped)', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: 512, h: ACT.actH } }),
      region({ id: 'forest', rect: { x: 256, y: 0, w: ACT.actW - 256, h: ACT.actH } }),
    );
    // ANTI-VACUOUS: they really do overlap.
    expect(disjointness(doc.regions.map((r) => ({ id: r.id, rect: r.rect }))).disjoint).toBe(false);
    expect(regionRectRows(doc, 'forest', ACT).map((r) => r.overlaps)).toEqual([[], []]);
  });

  it('[rect-findings] a rectangle past the act\'s edge carries the finding on ITS row only', () => {
    const doc = docOf(
      region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: ACT.actH } }),
      region({ id: 'forest', rect: { x: HALF, y: 0, w: HALF + 16, h: ACT.actH } }),
    );
    const rows = regionRectRows(doc, 'forest', ACT);
    expect(rows[0].findings).toEqual([]);
    expect(rows[1].findings).toHaveLength(1);
    // validate.ts's rule-2 sentence is INCLUSIVE (aeon's convention): it names
    // the rect's last pixel and the act's last pixel.
    expect(rows[1].findings[0]).toContain(`(${HALF + HALF + 16 - 1}, ${ACT.actH - 1})`);
    expect(rows[1].findings[0]).toContain(`(${ACT.actW - 1}, ${ACT.actH - 1})`);
  });
});

describe('the removal sentence, shared by the map drag and the panel', () => {
  it('[sentence] names every removed id, with the right verb for one and for several', () => {
    expect(regionsRemovedSentence(['night'])).toContain('night had no rectangle left and was removed');
    expect(regionsRemovedSentence(['a', 'b'])).toContain('a, b had no rectangle left and were removed');
    expect(regionsRemovedSentence(['a'])).toContain('Ctrl+Z');
  });
});
