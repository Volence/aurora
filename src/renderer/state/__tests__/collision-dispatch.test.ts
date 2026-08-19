// THE JOIN, TESTED FROM THE OUTSIDE.
//
// applyCollisionShape is the only place the Link/Isolate decision becomes a
// dispatched command — it reads doc + probe + mode from the store, asks
// planCollisionWrite what to do, and dispatches classicSetColind (link) or
// classicPaintSurface (isolate). These tests drive it exactly the way the
// (future) panel will: set a probe point, set a mode, call the function, read
// the doc back. A refusal must reach the caller with its `why` intact AND
// leave the doc untouched — a refusal that still mutates is the worst outcome
// this function could produce.

import { describe, it, expect, beforeEach } from 'vitest';
import { applyCollisionShape, applyCollisionShapeRect } from '../collision-dispatch';
import { useClassicLevelStore, zoneArtDocIdForCurrentZone } from '../classicLevelStore';
import { useClassicProjectStore } from '../classicProjectStore';
import { documentHistoryHub } from '../history-hub';
import { openReady, makeDoc } from './helpers/classic-fixture';
import type { LevelDoc } from '../../../core/level-classic/model';

const st = () => useClassicLevelStore.getState();

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  documentHistoryHub.clearAll();
});

// A level pixel of (256, 0) lands on fg cell (col 1, row 0) — makeDoc's
// fg.cells is [0, 1, 0, 1], so that cell holds engine chunk id 1, i.e.
// doc.chunks[0], cellIndex 0 (top-left of the chunk). That cell's block is
// overridden below to a real, non-blank, in-table block so link/isolate have
// something to act on.
const PROBE_POINT = { x: 256, y: 0 };

/** makeDoc() with chunk 0's cell 0 pointed at block 1, and a colind table
 *  sized by the caller (so tests can put a write in or out of range). */
function readyDoc(colindLength: number): LevelDoc {
  const base = makeDoc();
  const chunks = base.chunks.map((c) => ({ cells: c.cells.map((cc) => ({ ...cc })) }));
  chunks[0].cells[0] = { block: 1, xf: true, yf: false, solidity: 3 };
  return {
    ...base,
    chunks,
    collision: { ...base.collision, colind: new Uint8Array(colindLength) },
  };
}

describe('applyCollisionShape', () => {
  it('link dispatches classicSetColind and changes the one colind entry', () => {
    openReady(readyDoc(2)); // block 1 is within the table
    st().setCollisionProbe(PROBE_POINT);
    st().setCollisionDiverge('link');

    const r = applyCollisionShape(5);

    expect(r).toEqual({ ok: true });
    expect(st().doc!.collision.colind[1]).toBe(5);
    // Only the named entry moved — the block list itself is untouched.
    expect(st().doc!.blocks.length).toBe(2);
  });

  it('isolate dispatches classicPaintSurface: appends a block and repoints the cell', () => {
    openReady(readyDoc(4)); // room to grow past 2 blocks without the overhang refusal
    st().setCollisionProbe(PROBE_POINT);
    st().setCollisionDiverge('isolate');
    const before = st().doc!.blocks.length; // 2

    const r = applyCollisionShape(5);

    expect(r).toEqual({ ok: true });
    expect(st().doc!.blocks.length).toBe(before + 1);
    expect(st().doc!.chunks[0].cells[0].block).toBe(before);
    expect(st().doc!.collision.colind[before]).toBe(5);
  });

  it('a refusal reaches the caller with its why intact, and writes nothing', () => {
    // colind length 1: block 1 is past the end of the table, so planCollisionWrite
    // refuses the link outright (the overhang resolves into the adjacent zone's
    // table in ROM).
    openReady(readyDoc(1));
    st().setCollisionProbe(PROBE_POINT);
    st().setCollisionDiverge('link');
    const docBefore = st().doc;

    const r = applyCollisionShape(5);

    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toMatch(/adjacent|next zone|past the end/i);
    // Reference-identical: no new doc was ever built for a refused write.
    expect(st().doc).toBe(docBefore);
  });

  it('refuses when no cell has been probed yet, and writes nothing', () => {
    openReady(readyDoc(2));
    expect(st().collisionProbe).toBeNull();
    const docBefore = st().doc;

    const r = applyCollisionShape(5);

    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toMatch(/probe|cell/i);
    expect(st().doc).toBe(docBefore);
  });

  it('refuses when no classic level is open', () => {
    // reset() (in beforeEach) already left status 'idle' with doc null.
    const r = applyCollisionShape(5);
    expect(r.ok).toBe(false);
    expect((r as { why: string }).why).toMatch(/no classic level|open/i);
  });
});

// THE RECTANGLE SIBLING.
//
// Same join, one command for the whole rectangle. There is no undo-DEPTH
// accessor anywhere in this repo (UndoStack exposes canUndo/canRedo/undo/redo/
// clear and nothing else), so "one undo step" is asserted the way the repo
// already asserts it (see agent-handler.classic.test.ts): change TWO things,
// undo ONCE, require BOTH back. A per-entry loop would leave the first behind.

// makeDoc's fg is 2x2 CHUNKS with cells [0, 1, 0, 1], so layout column 1 holds
// engine chunk id 1 → doc.chunks[0]. In 16px CELL units that chunk occupies
// cx 16..31, and cellIndex = (cy % 16) * 16 + (cx % 16). So cell (16,0) is
// chunk-definition cell 0 and cell (17,0) is cell 1.
const RECT_ORIGIN = { x: 16, y: 0 };

/** makeDoc() with TWO distinct in-table blocks under the first two cells. */
function rectDoc(colindLength = 8): LevelDoc {
  const base = makeDoc();
  const chunks = base.chunks.map((c) => ({ cells: c.cells.map((cc) => ({ ...cc })) }));
  chunks[0].cells[0] = { block: 1, xf: true, yf: false, solidity: 3 };
  chunks[0].cells[1] = { block: 2, xf: false, yf: true, solidity: 1 };
  return {
    ...base,
    // makeDoc ships 2 blocks; block 2 has to exist for the second cell. Cloned
    // from blocks[1] so its tile refs stay inside the fixture's 5-tile pool —
    // structuralError bounds a block cell's tile by the pool, so a fabricated
    // def would be rejected by the very command under test.
    blocks: [...base.blocks, { cells: base.blocks[1].cells.map((c) => ({ ...c })) }],
    chunks,
    collision: { ...base.collision, colind: new Uint8Array(colindLength) },
  };
}

const artStack = () => documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

describe('applyCollisionShapeRect', () => {
  it('refuses rather than throwing when no level is open, under its OWN kind', () => {
    // NOT 'nothing-applicable'. That kind's declared meaning is "cells were
    // scanned and none could take a shape" — here nothing was scanned at all,
    // because there was no document to scan. A human reads `why` and is fine; an
    // agent branching on `refusal.kind` gets a wrong answer, which is exactly
    // what a discriminated union invites.
    const r = applyCollisionShapeRect({ x: 0, y: 0, w: 1, h: 1 }, 7, 'link');
    expect(r.ok).toBe(false);
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('no-level');
    expect((r as { why: string }).why).toMatch(/no classic level is open/);
  });

  it('reports a planner/store disagreement under its OWN kind, not as nothing-applicable', () => {
    // The other kind that was lying. Here cells WERE applicable — the planner
    // produced a link plan for two of them — and the store rejected the write.
    // The `skipped` array a 'nothing-applicable' refusal carries has nothing to
    // do with that failure.
    //
    // REACHED WITHOUT MOCKING, through a real gap: the planner does not bound
    // `shapeIndex` at all, while classicSetColind bounds a colind value to
    // 0..255 (classicLevelStore.ts:1289). So shape 300 plans clean and the store
    // refuses it — which is precisely what this branch means by "the planner and
    // the store command disagree". (That the planner should bound the shape
    // itself is a separate, real defect; this test does not depend on which way
    // it is eventually fixed, only that the disagreement is reported honestly.)
    openReady(rectDoc());
    const docBefore = st().doc;

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 300, 'link');

    expect(r.ok).toBe(false);
    const refusal = (r as { refusal: { kind: string; error?: string } }).refusal;
    expect(refusal.kind).toBe('store-disagreement');
    expect(refusal.error).toMatch(/out of range 0\.\.255/);
    expect((r as { why: string }).why).toBe(refusal.error);
    expect((r as { resolution: string }).resolution).toMatch(/Aurora bug/i);
    // The report still describes the rectangle the planner actually scanned.
    expect((r as { report: { applied: number } }).report.applied).toBe(2);
    // A rejected command wrote nothing — reference-identical.
    expect(st().doc).toBe(docBefore);
  });

  it('writes a whole rectangle as ONE undo step', () => {
    openReady(rectDoc());
    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link');

    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number; blocks: number } }).report)
      .toMatchObject({ applied: 2, blocks: 2 });
    expect(st().doc!.collision.colind[1]).toBe(7);
    expect(st().doc!.collision.colind[2]).toBe(7);

    // THE ASSERTION THIS TASK EXISTS FOR. One undo must take BOTH back. If the
    // dispatch looped per entry, this would restore only the last one.
    artStack().undo();
    expect(st().doc!.collision.colind[1]).toBe(0);
    expect(st().doc!.collision.colind[2]).toBe(0);
  });

  it('records NO undo step when every cell already carries the shape', () => {
    const d = rectDoc();
    d.collision.colind[1] = 7;
    d.collision.colind[2] = 7;
    openReady(d);

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link');
    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number; noop: number } }).report)
      .toMatchObject({ applied: 0, noop: 2 });
    expect(artStack().canUndo, 'a no-op spent an undo entry').toBe(false);
  });

  it('takes its mode from the ARGUMENT, never from collisionDiverge', () => {
    openReady(rectDoc());
    st().setCollisionDiverge('isolate');

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 1, h: 1 }, 7, 'link');
    expect((r as { report: { mode: string } }).report.mode).toBe('link');
    // A link changed the colind entry and appended NO block; an isolate would
    // have done the opposite.
    expect(st().doc!.collision.colind[1]).toBe(7);
    expect(st().doc!.blocks.length).toBe(3);
  });

  it('isolate clones once per distinct block and repoints both cells, in one step', () => {
    openReady(rectDoc());
    const before = st().doc!.blocks.length; // 3

    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'isolate');

    expect(r.ok).toBe(true);
    expect(st().doc!.blocks.length).toBe(before + 2);
    expect(st().doc!.chunks[0].cells[0].block).toBe(before);
    expect(st().doc!.chunks[0].cells[1].block).toBe(before + 1);
    // Each cell kept its OWN flips and solidity.
    expect(st().doc!.chunks[0].cells[0]).toMatchObject({ xf: true, yf: false, solidity: 3 });
    expect(st().doc!.chunks[0].cells[1]).toMatchObject({ xf: false, yf: true, solidity: 1 });

    artStack().undo();
    expect(st().doc!.blocks.length).toBe(before);
    expect(st().doc!.chunks[0].cells[0].block).toBe(1);
    expect(st().doc!.chunks[0].cells[1].block).toBe(2);
  });

  it('dryRun reports the same numbers and writes nothing', () => {
    openReady(rectDoc());
    const r = applyCollisionShapeRect({ ...RECT_ORIGIN, w: 2, h: 1 }, 7, 'link', { dryRun: true });

    expect(r.ok).toBe(true);
    expect((r as { report: { applied: number } }).report.applied).toBe(2);
    expect(st().doc!.collision.colind[1]).toBe(0);
    expect(artStack().canUndo).toBe(false);
  });
});
