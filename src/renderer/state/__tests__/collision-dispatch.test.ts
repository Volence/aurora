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
import { applyCollisionShape } from '../collision-dispatch';
import { useClassicLevelStore } from '../classicLevelStore';
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
