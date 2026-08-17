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
import { planCollisionWrite } from '../collision-write';
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
});
