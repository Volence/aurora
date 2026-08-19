// LINK vs ISOLATE, decided once, with every refusal in one place.
//
// Link is a one-entry colind write: the block's shape changes everywhere the
// block is used, ZONE-wide. Isolate clones the block, repoints THIS chunk cell
// at the clone, and gives the clone the new shape — same pixels, different
// collision, which is what SurfaceEditPlan.newBlocks' colind override exists
// for.
//
// The refusals carry as much weight as the writes, and two of them are about
// data the editor cannot see: a block id past the end of the colind table
// resolves into the NEXT ZONE's table in ROM, so both changing it (link) and
// creating one (isolate) would define entries whose real values are unknown.

import { describe, it, expect } from 'vitest';
import { classifyCollisionCell, planCollisionWrite } from '../collision-write';
import type { CollisionProbe } from '../collision-probe';
import type { LevelDoc } from '../model';

const probe = (over: Partial<CollisionProbe> = {}): CollisionProbe => ({
  chunkId: 1, chunkIndex: 0, cellIndex: 5, blockId: 3, shapeIndex: 2, solidity: 3,
  collides: true, reason: null, chunkPlacements: 4, blockCells: 9,
  looping: false, loopAmbiguous: false, ...over,
});

function doc(): LevelDoc {
  const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  cells[5] = { block: 3, xf: true, yf: false, solidity: 3 };
  const blockDef = () => ({ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) });
  return {
    chunks: [{ cells }],
    blocks: [blockDef(), blockDef(), blockDef(), blockDef()],
    collision: { colind: new Uint8Array(64), shapes: { heights: [], angles: new Uint8Array() } },
  } as unknown as LevelDoc;
}

describe('planCollisionWrite', () => {
  it('link is a single colind entry', () => {
    const r = planCollisionWrite(doc(), probe(), 7, 'link');
    expect(r).toMatchObject({ kind: 'link', entries: [{ blockId: 3, value: 7 }] });
  });

  it('isolate clones the block, repoints the cell, and overrides the clone shape', () => {
    const d = doc();
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    if (r.kind !== 'isolate') throw new Error(`expected isolate, got ${r.kind}`);
    expect(r.newBlockId).toBe(d.blocks.length);              // appended
    expect(r.plan.newBlocks).toEqual([{ def: d.blocks[3], sourceBlockId: 3, colind: 7 }]);
    // The cell keeps flips and solidity; only the block it names changes.
    expect(r.plan.chunkCellEdits).toEqual([
      { chunkIndex: 0, cellIndex: 5, cell: { block: d.blocks.length, xf: true, yf: false, solidity: 3 } },
    ]);
    expect(r.plan.tileWrites).toEqual([]);
    expect(r.plan.blockCellEdits).toEqual([]);
    // `stats` is REQUIRED on SurfaceEditPlan (classic-surface-plan.ts:59, no `?`).
    // The store never reads it, but tsc will not accept a plan without it.
    expect(r.plan.stats).toEqual({ tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 });
  });

  it('re-derives the block from the doc rather than trusting a stale probe', () => {
    // collisionProbe survives undo. If the cell now names a different block than
    // the probe recorded, the probe is stale and writing its blockId would edit
    // a block the user is not looking at.
    const d = doc();
    d.chunks[0].cells[5] = { block: 2, xf: false, yf: false, solidity: 3 };
    const r = planCollisionWrite(d, probe({ blockId: 3 }), 7, 'link');
    expect(r).toMatchObject({ kind: 'link', entries: [{ blockId: 2, value: 7 }] });
  });

  it('refuses block 0 — the engine never reads its collision', () => {
    // PLAN DISCREPANCY: the plan's verbatim fixture overrode only probe.blockId
    // here, but doc()'s cell 5 (the probe's default cellIndex) is block 3 — so
    // under "re-derive from the doc" (required by the very next test) this
    // never actually reached block 0. Corrected by putting block 0 at the
    // probed cell, same pattern the next test already uses.
    const d = doc();
    d.chunks[0].cells[5] = { block: 0, xf: false, yf: false, solidity: 0 };
    const r = planCollisionWrite(d, probe({ blockId: 0, reason: 'block0' }), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/blank block|block 0/i);
  });

  it('refuses a cell with no chunk', () => {
    const r = planCollisionWrite(doc(), probe({ chunkIndex: null, reason: 'air' }), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/air|no chunk/i);
  });

  it('refuses a LINK to a block past the colind table, in the planner', () => {
    // classicSetColind refuses this too, but as a CommandResult error the panel
    // would have to render separately. One refusal path, shown in one place.
    const d = doc();
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/adjacent|next zone|past the end/i);
  });

  it('refuses an ISOLATE that would extend the colind table', () => {
    // The decided guardrail. GHZ (439 blocks, 410 entries) and SBZ (602/600)
    // hit this; the other four zones do not.
    const d = doc();
    d.collision.colind = new Uint8Array(2);                   // 4 blocks, 2 entries
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/3 entr/);      // ids 2,3 + the new 4
    expect((r as { why: string }).why).toMatch(/adjacent|next zone/i);
  });

  it('refuses an isolate at the block ceiling', () => {
    // classicPaintSurface has NO capacity check (only classicCommitCanvas at
    // :1125 and classicAddBlock at :1345 do), so without this the failure comes
    // back as validateLevelDoc's "block ref 1024 out of range".
    const d = doc();
    d.blocks = Array.from({ length: 1024 }, () => d.blocks[0]);
    d.collision.colind = new Uint8Array(2048);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/1024|capacity|ceiling/i);
  });

  it('warns but allows a write to a loop-ambiguous cell', () => {
    // $28 behind a loop may be read as $51 — runtime state no editor can see.
    // The edit is valid for one of the two answers, so it proceeds and says so.
    const r = planCollisionWrite(doc(), probe({ loopAmbiguous: true }), 7, 'link');
    expect(r.kind).toBe('link');
    expect((r as { warnings: string[] }).warnings.join(' ')).toMatch(/\$51|loop/i);
  });

  it('does not send a LINK overhang refusal to Isolate when Isolate would also refuse', () => {
    // The GHZ/SBZ shape: more blocks than the table has entries. Link refuses
    // the overhang block; Isolate would have to grow the table over the same
    // overhang, so it refuses too. Telling the caller to "Use Isolate" is a
    // dead end presented as an escape — and an AGENT will act on it.
    const d = doc();
    d.collision.colind = new Uint8Array(2);          // 4 blocks, 2 entries
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/past the end/i);
    expect(why, 'recommends a mode that this same document refuses').not.toMatch(/Use Isolate/i);
    expect(why).toMatch(/restamp|within the table/i);
  });

  it('still offers Isolate as the escape when Isolate would actually fit', () => {
    // The other side of the same branch, so the fix is a COMPUTATION and not a
    // blanket deletion.
    //
    // Reaching this state needs a block ref PAST the table but with the table
    // still longer than the block list — i.e. a DANGLING ref, which is exactly
    // the hole in the "both refusals are the same condition" proof:
    // validateLevelDoc bounds a chunk cell's block by the 10-bit field, not by
    // doc.blocks.length. Unreachable on stock data, representable in the model,
    // and the reason the escape is computed instead of asserted.
    const d = doc();                                 // 4 blocks
    d.collision.colind = new Uint8Array(8);          // 8 entries — a clone fits
    d.chunks[0].cells[5] = { ...d.chunks[0].cells[5], block: 9 };  // 9 >= 8
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/Use Isolate/i);
  });

  it('does not send an ISOLATE growth refusal to Link for a block Link cannot set', () => {
    // The mirrored defect. For an OVERHANG block both modes refuse, so "Use
    // Link, accepting it changes every use of block N" is false.
    // doc()'s probed cell already holds block 3; a 2-entry table puts it past
    // the end, and the clone at id 4 would grow that table by 3.
    const d = doc();
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/adjacent|next zone/i);
    expect(why, 'recommends Link for a block Link refuses').not.toMatch(/Use Link/i);
  });

  it('still offers Link when the block IS within the table', () => {
    // Table exactly as long as the block list: the clone at id 4 still grows it
    // (by 1), so isolate refuses — but block 3 is inside it, so Link genuinely
    // is the escape here.
    const d = doc();
    d.collision.colind = new Uint8Array(4);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/Use Link/i);
  });
});

describe('planCollisionWrite no-op', () => {
  const doc2 = () => {
    const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
    cells[5] = { block: 3, xf: true, yf: false, solidity: 3 };
    const blockDef = () => ({ cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) });
    const colind = new Uint8Array(64);
    colind[3] = 9;                                   // block 3 already uses shape 9
    return {
      chunks: [{ cells }], blocks: [blockDef(), blockDef(), blockDef(), blockDef()],
      collision: { colind, shapes: { heights: [], angles: new Uint8Array() } },
    } as unknown as LevelDoc;
  };

  it('link to the shape already held writes nothing', () => {
    expect(planCollisionWrite(doc2(), probe(), 9, 'link')).toEqual({ kind: 'noop' });
  });

  it('ISOLATE to the shape already held does not clone a block', () => {
    // The expensive half. Without this, clicking the swatch the panel already
    // highlights as current appends a block and grows the colind table to give
    // the clone collision identical to the block it copied — spending the exact
    // capacity this file's ceiling and table-growth refusals protect.
    expect(planCollisionWrite(doc2(), probe(), 9, 'isolate')).toEqual({ kind: 'noop' });
  });

  it('still writes when the shape actually differs', () => {
    expect(planCollisionWrite(doc2(), probe(), 10, 'link').kind).toBe('link');
    expect(planCollisionWrite(doc2(), probe(), 10, 'isolate').kind).toBe('isolate');
  });
});

// THE PER-CELL DECISION, on its own. Both the single-cell panel path and the
// rectangle tool go through this, so it names each outcome without deciding
// what the write is — and without any of the AGGREGATE limits, which are
// properties of a whole call and not of a cell.
describe('classifyCollisionCell', () => {
  const at = (chunkIndex: number | null, cellIndex: number) =>
    ({ chunkId: 1, chunkIndex, cellIndex, looping: false, loopAmbiguous: false });

  it('skips air — no chunk is stamped at this cell', () => {
    const d = doc();
    expect(classifyCollisionCell(d, at(null, 0), 7, 'link').kind).toBe('skip');
    expect((classifyCollisionCell(d, at(null, 0), 7, 'link') as { reason: string }).reason).toBe('air');
  });

  it('skips block 0 — the blank block the engine short-circuits before', () => {
    const d = doc();
    d.chunks[0].cells[1] = { ...d.chunks[0].cells[1], block: 0 };
    expect((classifyCollisionCell(d, at(0, 1), 7, 'link') as { reason: string }).reason).toBe('block0');
  });

  it('is a no-op when the block already carries the shape, in EITHER mode', () => {
    const d = doc();
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 1 };
    d.collision.colind = new Uint8Array([0, 7, 0, 0]);
    expect(classifyCollisionCell(d, at(0, 2), 7, 'link').kind).toBe('noop');
    expect(classifyCollisionCell(d, at(0, 2), 7, 'isolate').kind).toBe('noop');
  });

  it('skips the overhang in LINK mode only — isolate’s limit is aggregate', () => {
    const d = doc();
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 1 };
    d.collision.colind = new Uint8Array(1);
    expect((classifyCollisionCell(d, at(0, 2), 7, 'link') as { reason: string }).reason).toBe('overhang');
    // Isolate does not have a per-cell overhang skip — its limit is aggregate.
    expect(classifyCollisionCell(d, at(0, 2), 7, 'isolate').kind).toBe('write');
  });

  it('carries the block and the cell back out in the ordinary case', () => {
    const d = doc();
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 1 };
    d.collision.colind = new Uint8Array([0, 3, 0, 0]);
    const w = classifyCollisionCell(d, at(0, 2), 7, 'link');
    expect(w).toMatchObject({ kind: 'write', blockId: 1, chunkIndex: 0, cellIndex: 2 });
    expect((w as { cell: unknown }).cell).toBe(d.chunks[0].cells[2]);
  });
});
