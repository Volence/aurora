// THE REGION DRAG MACHINE — `components/map-region-gesture.ts`, editor spec
// §3.2 and §3.3, build-plan row 8 second half (step 8B).
//
// ⚠ WHAT THIS FILE CANNOT SEE. It drives the machine `MapViewport` calls; it
// does NOT drive `MapViewport`. Nothing here proves a mouse reaches this code,
// that the overlay is painted, or that a toast appears. Those need the running
// app and are TAGGED in `docs/reviews/2026-09-16-regions-step8b-wiring.md` for
// the controller's foreground CDP work. What IS held here is every decision the
// viewport delegates: which gesture a press is, what rectangle a drag
// describes, how many undo steps a gesture costs, and what a refusal says.
//
// ⚠ NO ROW BELOW COUNTS A NUMBER IT GOT BY RUNNING THE CODE ONCE. The undo
// rows assert a PROPERTY of the history (one step restores the whole document)
// and derive the size of the gesture from the document itself.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  beginRegionDrag,
  describeRegionGesture,
  newRegionId,
  regionDragCommand,
  regionGestureOf,
  updateRegionDrag,
  NO_REGIONS_HERE,
  NO_SELECTION_ADVICE,
} from '../map-region-gesture';
import {
  applyRegionGestureToDocument,
  REGION_GRAB_PX,
  REGION_SNAP_PX,
  REGION_SNAP_FINE_PX,
} from '../../../core/editing/region-marquee';
import type { Region, RegionsDocument } from '../../../core/formats/regions/document';
import { EditHistory } from '../../../core/editing/history';
import { noRegionsLoaded } from '../../../core/formats/regions/act-regions';
import type { S4Level } from '../../../core/editing/commands';
import type { Act } from '../../../core/model/s4-types';
import { SECTION_PIXEL_SIZE } from '../../../core/model/s4-types';

const ACT_W = SECTION_PIXEL_SIZE * 2;
const ACT_H = SECTION_PIXEL_SIZE;
const HALF = ACT_W / 2;

function region(over: Partial<Region> & { id: string }): Region {
  return { name: over.id, preset: 'OJZ_Preset_Plain', rect: { x: 0, y: 0, w: HALF, h: ACT_H }, ...over };
}
function docOf(...regions: Region[]): RegionsDocument {
  return { schema: 1, act: 'ojz_act1', regions };
}
/** The act tiled by two regions. No holes: what `flatten.ts` will accept. */
function tiled(): RegionsDocument {
  return docOf(
    region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: ACT_H } }),
    region({ id: 'night', rect: { x: HALF, y: 0, w: HALF, h: ACT_H } }),
  );
}

/** Drive a whole gesture: press, move, release. The viewport's three events. */
function drag(
  doc: RegionsDocument, from: { x: number; y: number }, to: { x: number; y: number },
  selectedId: string | null, opts: { zoom?: number; invert?: boolean } = {},
) {
  let d = beginRegionDrag(doc, from, selectedId, opts.zoom ?? 1);
  d = updateRegionDrag(d, to, opts.invert ?? false);
  return { d, outcome: regionDragCommand(doc, d) };
}

// ---------------------------------------------------------------------------
// 1. WHICH GESTURE A PRESS IS — the ruled model, through this machine
// ---------------------------------------------------------------------------

describe('what a press means, with the selection as the disambiguator', () => {
  it('inside the SELECTED region is a move; inside ANOTHER region is a draw', () => {
    const doc = tiled();
    const inForest = { x: 100, y: 100 };
    expect(beginRegionDrag(doc, inForest, 'forest', 1).press.kind).toBe('move');
    // ⚠ THE SAME POINT, a different selection. The spec's amended table:
    // "drag inside any OTHER region's rect -> draw and carve, exactly as on
    // empty space". A row that only tested empty ground could not tell the
    // amended reading from the literal one it replaced.
    expect(beginRegionDrag(doc, inForest, 'night', 1).press.kind).toBe('draw');
    expect(beginRegionDrag(doc, inForest, null, 1).press.kind).toBe('draw');
  });

  it('on the SELECTED region\'s edge is a resize, and the band is SCREEN px', () => {
    const doc = tiled();
    // A point just inside forest's right edge, by less than the grab band at
    // zoom 1 but MORE than it at zoom 4 (the band is REGION_GRAB_PX / zoom).
    const off = REGION_GRAB_PX - 1;
    const onEdge = { x: HALF - off, y: 100 };
    expect(beginRegionDrag(doc, onEdge, 'forest', 1).press.kind).toBe('resize');
    expect(beginRegionDrag(doc, onEdge, 'forest', 1).press.edge).toBe('e');
    // ⚠ ZOOMED IN, THE SAME WORLD POINT IS NO LONGER ON THE HANDLE, because the
    // handle is a fingertip on the display and not a distance in the level.
    // This is the row that fails if a caller ever passes 1 for the real zoom.
    const zoomedBand = REGION_GRAB_PX / 4;
    expect(off).toBeGreaterThan(zoomedBand);
    expect(beginRegionDrag(doc, onEdge, 'forest', 4).press.kind).toBe('move');
  });

  it('carries what the press is OVER, whoever owns it, so a carve can be named before it happens', () => {
    const doc = tiled();
    const press = beginRegionDrag(doc, { x: HALF + 100, y: 100 }, 'forest', 1).press;
    expect(press.kind).toBe('draw');
    expect(press.overId).toBe('night');
    // The control: over unassigned ground there is nothing to name. A document
    // with a hole is not shippable but IS an editing state.
    const holed = docOf(region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: ACT_H } }));
    expect(beginRegionDrag(holed, { x: HALF + 100, y: 100 }, 'forest', 1).press.overId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. WHAT A DRAG DESCRIBES — the snap, and Ctrl inverting it
// ---------------------------------------------------------------------------

describe('the rectangle a drag describes', () => {
  it('snaps to the base grid, and Ctrl inverts it to the fine one', () => {
    const doc = tiled();
    // A width deliberately off BOTH grids, so neither snap can pass by accident.
    const odd = REGION_SNAP_PX * 3 + 5;
    expect(odd % REGION_SNAP_PX).not.toBe(0);
    expect(odd % REGION_SNAP_FINE_PX).not.toBe(0);

    const base = drag(doc, { x: 0, y: 0 }, { x: odd, y: odd }, 'forest', { invert: false }).d;
    const fine = drag(doc, { x: 0, y: 0 }, { x: odd, y: odd }, 'forest', { invert: true }).d;
    // Derived from the constants, not from a measured rectangle: each edge is a
    // multiple of the snap in force.
    expect(base.rect.w % REGION_SNAP_PX).toBe(0);
    expect(fine.rect.w % REGION_SNAP_FINE_PX).toBe(0);
    // ANTI-VACUOUS: the two snaps must give DIFFERENT answers here, or this row
    // would pass with `invert` ignored entirely.
    expect(fine.rect.w).not.toBe(base.rect.w);
  });

  it('a press that never moves still describes one snap cell, never an empty rect', () => {
    const doc = tiled();
    // Unassigned ground, so the press is a draw and the rect is the drag's own.
    const holed = docOf(region({ id: 'forest', rect: { x: 0, y: 0, w: HALF, h: ACT_H } }));
    const d = beginRegionDrag(holed, { x: HALF + 64, y: 64 }, 'forest', 1);
    expect(d.moved).toBe(false);
    expect(d.rect.w).toBeGreaterThanOrEqual(REGION_SNAP_PX);
    expect(d.rect.h).toBeGreaterThanOrEqual(REGION_SNAP_PX);
    expect(doc).toBeDefined();
  });

  it('a MOVE snaps its DELTA, so an off-grid rectangle keeps its offset', () => {
    // A rect deliberately off the snap grid, which is what a migrated or
    // hand-typed one is.
    const offset = 5;
    expect(offset % REGION_SNAP_PX).not.toBe(0);
    const doc = docOf(
      region({ id: 'forest', rect: { x: offset, y: 0, w: HALF, h: ACT_H } }),
      region({ id: 'night', rect: { x: HALF + offset, y: 0, w: HALF - offset, h: ACT_H } }),
    );
    const { d } = drag(doc, { x: 100, y: 100 }, { x: 100 + REGION_SNAP_PX, y: 100 }, 'forest');
    expect(d.press.kind).toBe('move');
    // The offset SURVIVES: x is still off-grid by exactly what it was.
    expect(d.rect.x % REGION_SNAP_PX).toBe(offset % REGION_SNAP_PX);
    expect(d.rect.x).toBe(offset + REGION_SNAP_PX);
  });
});

// ---------------------------------------------------------------------------
// 3. ONE GESTURE, ONE UNDO STEP (spec §3.3)
// ---------------------------------------------------------------------------

/** The level shape `EditHistory` edits, around one act holding `doc`. */
function levelOf(doc: RegionsDocument) {
  const act = { id: 'act1', regions: { ...noRegionsLoaded(), document: doc } } as unknown as Act;
  return { level: { sections: [], act } as unknown as S4Level, act };
}

describe('one gesture is one undo step, however many rectangles it splits', () => {
  it('a draw across several regions is ONE step, and one undo restores every one of them', () => {
    // Four vertical stripes, each a region, tiling the act. A draw across the
    // middle of all four splits every one of them.
    const w = ACT_W / 4;
    const doc = docOf(
      region({ id: 'a', rect: { x: 0, y: 0, w, h: ACT_H } }),
      region({ id: 'b', rect: { x: w, y: 0, w, h: ACT_H } }),
      region({ id: 'c', rect: { x: w * 2, y: 0, w, h: ACT_H } }),
      region({ id: 'd', rect: { x: w * 3, y: 0, w, h: ACT_H } }),
    );
    const before = JSON.parse(JSON.stringify(doc)) as RegionsDocument;
    const { level, act } = levelOf(doc);

    // A horizontal band across the middle, given to `a`. It starts INSIDE a's
    // own rect, which under the ruled model would be a move; so the drag starts
    // in `b` and is given to `a`... which is also a move if `a` is selected.
    // The honest gesture: select `d` and draw the band, which carves a, b, c
    // and d's own middle.
    const y0 = ACT_H / 4;
    const { outcome } = drag(doc, { x: 0, y: y0 }, { x: ACT_W, y: y0 + ACT_H / 4 }, 'd');
    expect(outcome.kind).toBe('command');
    if (outcome.kind !== 'command') return;

    // ⚠ THE ANTI-VACUOUS FLOOR, DERIVED FROM THE FIXTURE and not pinned: the
    // gesture must actually have SPLIT several regions, or "one undo step" is a
    // claim about a gesture that did nothing interesting. The band crosses all
    // four stripes, so all four lose area -- INCLUDING `d`, the region drawn
    // into: a DRAW hands its own existing pieces to `applyDraw` along with
    // everyone else's (only move and resize take the pressed piece out first),
    // so d's stripe is split by its own band exactly as its neighbours are.
    expect(outcome.trimmedIds.sort()).toEqual(before.regions.map((r) => r.id).sort());
    expect(outcome.command.newDocument!.regions.length)
      .toBeGreaterThan(before.regions.length + 1);

    const h = new EditHistory();
    h.execute(outcome.command, level);
    expect(act.regions.document!.regions.length)
      .toBe(outcome.command.newDocument!.regions.length);

    // THE PROPERTY: ONE undo, and the document is what it was. Not "undo twice"
    // and not "undo until it looks right" — the history is asked for exactly one
    // step and the whole pre-gesture document has to come back.
    h.undo(level);
    expect(act.regions.document).toEqual(before);
    // And the history has nothing left to undo: the gesture was one entry.
    expect(h.undo(level)).toBeFalsy();
    expect(act.regions.document).toEqual(before);
  });

  it('a move and a resize are each one command too, described by what they did', () => {
    const doc = tiled();
    const moved = drag(doc, { x: 100, y: 100 }, { x: 100 + REGION_SNAP_PX, y: 100 }, 'forest');
    expect(moved.outcome.kind).toBe('command');
    if (moved.outcome.kind === 'command') {
      expect(moved.outcome.command.type).toBe('set-regions');
      expect(moved.outcome.command.sectionIndex).toBe(-1);
      expect(moved.outcome.command.description).toBe('Move forest rect');
    }
    const resized = drag(
      doc, { x: HALF - 1, y: 100 }, { x: HALF - REGION_SNAP_PX * 4, y: 100 }, 'forest',
    );
    expect(resized.d.press.kind).toBe('resize');
    expect(resized.outcome.kind).toBe('command');
    if (resized.outcome.kind === 'command') {
      expect(resized.outcome.command.description).toBe('Resize forest rect');
    }
  });

  it('the command\'s two halves share no object with each other or with the caller', () => {
    const doc = tiled();
    const { outcome } = drag(doc, { x: 100, y: 100 }, { x: 100 + REGION_SNAP_PX, y: 100 }, 'forest');
    expect(outcome.kind).toBe('command');
    if (outcome.kind !== 'command') return;
    const cmd = outcome.command;
    expect(cmd.oldDocument!.regions[0]).not.toBe(cmd.newDocument!.regions[0]);
    expect(cmd.oldDocument!.regions[0]).not.toBe(doc.regions[0]);
    // …and the OLD half really is the pre-gesture state, not a second copy of
    // the new one.
    expect(cmd.oldDocument!.regions[0].rect).toEqual(doc.regions[0].rect);
    expect(cmd.newDocument!.regions[0].rect).not.toEqual(doc.regions[0].rect);
  });
});

// ---------------------------------------------------------------------------
// 4. NOTHING HAPPENED vs I REFUSED — two outcomes, never one
// ---------------------------------------------------------------------------

describe('a gesture that changes nothing, and a gesture the layer refuses', () => {
  it('a press that did not move produces NO command and NO complaint', () => {
    const doc = tiled();
    const d = beginRegionDrag(doc, { x: 100, y: 100 }, 'forest', 1);
    const outcome = regionDragCommand(doc, d);
    expect(outcome.kind).toBe('none');
    // The control: the SAME press, moved, does produce a command — so `none` is
    // about the gesture and not about this machine never producing one.
    expect(regionDragCommand(doc, updateRegionDrag(d, { x: 100 + REGION_SNAP_PX, y: 100 }, false)).kind)
      .toBe('command');
  });

  it('a zero-delta move comes back REORDERED, and a permutation is NOT a change', () => {
    // ⚠ THE ROW ABOVE WOULD BE VACUOUS WITHOUT THIS ONE. A click inside the
    // selected region still goes through the layer's one transform: the pressed
    // piece leaves the set so it cannot carve itself, and `applyDraw` puts it
    // back at the END. So the layer hands back the SAME rectangles in a
    // DIFFERENT ORDER, and an order-sensitive "did anything change" test would
    // push an undo entry, and rewrite the file on the next save, for a click.
    const doc = tiled();
    const d = beginRegionDrag(doc, { x: 100, y: 100 }, 'forest', 1);
    const out = applyRegionGestureToDocument(doc, regionGestureOf(d));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // The subject, asserted: the layer really does permute.
    const ids = out.document.regions.map((r) => r.id);
    const was = doc.regions.map((r) => r.id);
    expect(ids).not.toEqual(was);
    expect([...ids].sort()).toEqual([...was].sort());
    // And this machine reads a permutation as no change, because the ruled
    // model says list order carries no meaning (region-geometry.ts's header).
    expect(regionDragCommand(doc, d).kind).toBe('none');
  });

  it('a draw with NO selection is REFUSED, carrying the layer\'s reason and what to do', () => {
    // ⚠ THIS IS THE REACHABLE REFUSAL, and it is reachable exactly because
    // `preset` is required per region and Aurora has none to invent.
    const doc = tiled();
    const { outcome, d } = drag(doc, { x: 100, y: 100 }, { x: 400, y: 400 }, null);
    expect(d.press.kind).toBe('draw');
    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') return;
    // The layer's own words, named rather than retyped: it must say the id it
    // could not create and why.
    expect(outcome.reason).toContain(JSON.stringify(d.drawId));
    expect(outcome.reason).toContain('preset');
    // …and the one sentence this module adds, taken from its constant so a
    // reworded toast cannot pass a retyped expectation.
    expect(outcome.reason).toContain(NO_SELECTION_ADVICE);
  });

  it('a draw INTO a selected region is not refused, and carries no no-selection advice', () => {
    // The control for the row above: same document, same drag, a selection.
    // Without it, "refused" could be this machine refusing every draw.
    const doc = tiled();
    const { outcome } = drag(doc, { x: HALF + 100, y: 100 }, { x: HALF + 400, y: 400 }, 'forest');
    expect(outcome.kind).toBe('command');
    if (outcome.kind !== 'command') return;
    expect(outcome.command.description).toBe('Draw forest rect');
    expect(JSON.stringify(outcome.command)).not.toContain(NO_SELECTION_ADVICE);
    // It CARVED, which is what every draw does under the Q1 ruling.
    expect(outcome.trimmedIds).toEqual(['night']);
  });

  it('the no-document sentence names a control the panel actually builds', () => {
    // ⚠ A TOAST THAT NAMES A BUTTON NOBODY BUILT sends the author looking for
    // it. `Migrate sections` is the one door into a first regions document and
    // RegionsPanel renders exactly that label, READ FROM THE COMPONENT rather
    // than retyped here -- a retyped expectation goes green against a renamed
    // button, which is the failure this row exists for.
    const panel = readFileSync(
      join(__dirname, '..', 'regions', 'RegionsPanel.tsx'), 'utf8',
    );
    const label = 'Migrate sections';
    expect(panel, 'the panel no longer renders this label').toContain(label);
    expect(NO_REGIONS_HERE).toContain(label);
  });

  it('a minted id never collides with one the document already holds', () => {
    expect(newRegionId(docOf())).toBe('region_1');
    const taken = docOf(region({ id: 'region_1' }), region({ id: 'region_2' }));
    const minted = newRegionId(taken);
    expect(taken.regions.map((r) => r.id)).not.toContain(minted);
    // The contract's own shape for a region id, so a minted one could be
    // written if a preset ever became available.
    expect(minted).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
  });
});

// ---------------------------------------------------------------------------
// 5. THE UNDO ENTRY'S WORDS
// ---------------------------------------------------------------------------

describe('what the undo entry says', () => {
  it('names the gesture and the region, for every arm', () => {
    const doc = tiled();
    const d = beginRegionDrag(doc, { x: 100, y: 100 }, 'forest', 1);
    expect(describeRegionGesture({ kind: 'draw', id: 'forest', rect: d.rect }, d))
      .toBe('Draw forest rect');
    expect(describeRegionGesture({ kind: 'move', pieceIndex: 0, rect: d.rect }, d))
      .toBe('Move forest rect');
    expect(describeRegionGesture({ kind: 'resize', pieceIndex: 0, rect: d.rect }, d))
      .toBe('Resize forest rect');
    expect(describeRegionGesture({ kind: 'delete', pieceIndex: 0 }, d))
      .toBe('Delete forest rect');
    // The gesture the drag IS, so the four above are not four strings nothing
    // in the machine would ever produce.
    expect(regionGestureOf(d).kind).toBe('move');
  });
});
