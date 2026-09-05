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
import { classifyCollisionCell, planCollisionCells, planCollisionRect, planCollisionWrite, SKIPPED_CELLS_CAP } from '../collision-write';
import { LOOP_ALIAS, type CollisionProbe } from '../collision-probe';
import type { LevelDoc } from '../model';
import type { SurfaceEditPlan } from '../../art/classic-surface-plan';

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
    // Two layout columns, both stamping engine chunk id 1 → chunks[0]. So the
    // act is 32 cells wide x 16 tall, cellIndex = (cy % 16) * 16 + (cx % 16),
    // and cells (0,0) and (16,0) are the SAME chunk-definition cell reached
    // through two placements. planCollisionWrite never reads this; the
    // rectangle planner addresses cells itself and cannot run without it.
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 1]) },
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

  it('refuses block 0: the engine never reads its collision', () => {
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

  it('refuses a DANGLING block ref rather than recommending a mode for it', () => {
    // This document used to be the one place `escapeFromLinkOverhang`'s "Use
    // Isolate" branch fired: a block ref PAST the table but with the table still
    // longer than the block list. That state is only reachable through a
    // DANGLING ref — validateLevelDoc bounds a chunk cell's block by the 10-bit
    // field (model.ts, MAX_BLOCK_REF), not by doc.blocks.length — and a dangling
    // ref is now refused in its own right, BEFORE the overhang is ever
    // considered. Isolate on it would emit `def: undefined` into
    // SurfaceEditPlan.newBlocks and crash classicPaintSurface's
    // `b.def.cells.map`, so recommending Isolate was never an escape at all.
    //
    // This test is what keeps `escapeFromLinkOverhang`'s collapse honest: if the
    // classifier's order ever changes, this refusal changes with it.
    const d = doc();                                 // 4 blocks
    d.collision.colind = new Uint8Array(8);          // 8 entries — longer than the block list
    d.chunks[0].cells[5] = { ...d.chunks[0].cells[5], block: 9 };  // no block 9 exists
    const r = planCollisionWrite(d, probe(), 7, 'link');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/dangling/i);
    expect(why).toMatch(/block 9/);
    expect(why).toMatch(/only 4 blocks/);
    expect(why, 'recommends a mode that would crash on a block that does not exist').not.toMatch(/Use Isolate/i);
  });

  it('refuses a DANGLING block ref in isolate mode too: there is nothing to clone', () => {
    // Isolate means "clone the block, keep its pixels, change its shape". With
    // no block to clone the operation is meaningless, and the plan it used to
    // build carried `def: undefined` straight into classicPaintSurface.
    const d = doc();
    d.collision.colind = new Uint8Array(8);
    d.chunks[0].cells[5] = { ...d.chunks[0].cells[5], block: 9 };
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/dangling/i);
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

  it('GUARANTEES Link when the clicked cell is the block\'s ONLY naming definition cell', () => {
    // doc() names block 3 from exactly one chunk-definition cell (chunks[0]
    // cell 5), and that is the cell the probe points at. So the clone Isolate
    // would mint would be referenced by that same one cell — Link reaches
    // nothing Isolate would have spared. A 4-entry table against 4 blocks still
    // refuses the clone, so the escape sentence is the whole answer here.
    const d = doc();
    d.collision.colind = new Uint8Array(4);
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const why = (r as { why: string }).why;
    expect(why).toMatch(/Use Link/);
    expect(why, 'hedges when it can guarantee').not.toMatch(/accepting it changes every use/);
    expect(why).toMatch(/no chunk-definition cell outside this one names block 3/);
  });

  it('keeps HEDGING when one more definition cell names the same block', () => {
    // The pair. Identical to the test above except for ONE extra naming cell,
    // which the click does not cover — so Link would change collision the user
    // did not point at, and the sentence must go back to saying so.
    const d = doc();
    d.collision.colind = new Uint8Array(4);
    d.chunks[0].cells[6] = { block: 3, xf: false, yf: false, solidity: 3 };
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/accepting it changes every use of block 3/);
  });

  it('counts a naming cell in a chunk the LAYOUT NEVER STAMPS as uncontained', () => {
    // TRAP 1. chunks[1] is engine chunk id 2 and fg is [1, 1] — nothing stamps
    // it, so no click anywhere in the act can reach its cells. A Link still
    // rewrites their collision, latently, surfacing the day that chunk is
    // stamped. Containment is a property of the chunk DEFINITIONS, not of the
    // layout, and a scan that walked only placed chunks would call this
    // contained and promise a guarantee it cannot keep.
    const d = doc();
    d.collision.colind = new Uint8Array(4);
    const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
    cells[0] = { block: 3, xf: false, yf: false, solidity: 3 };
    (d.chunks as unknown[]).push({ cells });
    const r = planCollisionWrite(d, probe(), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/accepting it changes every use of block 3/);
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

  it('skips air: no chunk is stamped at this cell', () => {
    const d = doc();
    expect(classifyCollisionCell(d, at(null, 0), 7, 'link').kind).toBe('skip');
    expect((classifyCollisionCell(d, at(null, 0), 7, 'link') as { reason: string }).reason).toBe('air');
  });

  it('skips block 0: the blank block the engine short-circuits before', () => {
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

  it('skips a cell naming a block the document does not have, in EITHER mode', () => {
    // validateLevelDoc bounds a chunk cell's block by the 10-bit field only
    // (model.ts, MAX_BLOCK_REF) — NOT by doc.blocks.length — so a dangling ref
    // is representable inside a document that validates. Isolate on one emits
    // `def: doc.blocks[id]` = undefined into SurfaceEditPlan.newBlocks and
    // classicPaintSurface's `b.def.cells.map` throws.
    const d = doc();                                          // 4 blocks
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 9 };
    expect((classifyCollisionCell(d, at(0, 2), 7, 'link') as { reason: string }).reason).toBe('no-such-block');
    expect((classifyCollisionCell(d, at(0, 2), 7, 'isolate') as { reason: string }).reason).toBe('no-such-block');
  });

  it('tests the dangling ref BEFORE the no-op: a dangling ref must never report success', () => {
    // THE ORDER, PINNED. The no-op test reads `colind[blockId] ?? 0`, so a
    // dangling ref past the end of the table answers 0 for a shape it does not
    // have. Asked for shape 0 it would return `noop` — reporting SUCCESS on
    // garbage, which for an autonomous caller is worse than the crash the
    // refusal replaces.
    const d = doc();                                          // 4 blocks
    d.collision.colind = new Uint8Array(8);                   // no entry 9 either
    d.chunks[0].cells[2] = { ...d.chunks[0].cells[2], block: 9 };
    expect(d.collision.colind[9]).toBeUndefined();            // the trap: `?? 0` answers 0
    const r = classifyCollisionCell(d, at(0, 2), 0, 'link');
    expect(r.kind, 'a dangling ref reported success').toBe('skip');
    expect((r as { reason: string }).reason).toBe('no-such-block');
  });

  it('skips the overhang in LINK mode only: isolate’s limit is aggregate', () => {
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

// A RECTANGLE IS ONE WRITE, not a loop over planCollisionWrite: one undo step
// means one store command. Partial by design in ONE direction — per-cell skips
// (air, block 0, a link overhang, past the layout edge) are expected inside any
// real rectangle, because a slope's bounding box contains air.
describe('planCollisionRect: link', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  /** doc() with the named chunk-definition cells pointed at real blocks. */
  const withCells = (assign: [number, number][]) => {
    const d = doc();
    for (const [cellIndex, block] of assign) {
      d.chunks[0].cells[cellIndex] = { block, xf: false, yf: false, solidity: 3 };
    }
    return d;
  };

  it('collapses cells sharing a block into ONE colind entry', () => {
    const d = withCells([[0, 1], [1, 1], [16, 1], [17, 1]]);
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('link');
    expect((r as { entries: unknown[] }).entries).toEqual([{ blockId: 1, value: 7 }]);
    expect(r.report.applied).toBe(4);   // four CELLS
    expect(r.report.blocks).toBe(1);    // one BLOCK
  });

  it('applies the writable cells and reports the skipped ones by reason', () => {
    // cell 0 → block 1 (writes), cell 1 → block 0 (skip), cell 16 → block 2
    // (writes), cell 17 → block 3 which ALREADY holds 7 (noop).
    const d = withCells([[0, 1], [1, 0], [16, 2], [17, 3]]);
    d.collision.colind[3] = 7;
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(2);
    expect(r.report.noop).toBe(1);
    expect(r.report.skipped).toEqual([{ reason: 'block0', count: 1 }]);
  });

  it('skips cells outside the layout instead of clamping or refusing', () => {
    // The act is 32 cells wide; ask for 36.
    const d = withCells([[0, 1]]);
    const r = planCollisionRect(d, rect(0, 0, 36, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.skipped.find((s) => s.reason === 'outside-layout')!.count).toBe(4);
  });

  it('is SUCCESS with no command when every cell already carries the shape', () => {
    // Idempotence. An agent retrying after a timeout must not get a refusal.
    const d = withCells([[0, 1]]);
    d.collision.colind[1] = 7;
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'link');
    expect(r.kind).toBe('nothing');
    expect(r.report.applied).toBe(0);
    expect(r.report.noop).toBe(1);
  });

  it('REFUSES when nothing was applied and nothing already matched', () => {
    // doc()'s cells are all block 0 except cell 5; the 2x2 at the origin misses it.
    const d = doc();
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('nothing-applicable');
    expect((r as { why: string }).why).toMatch(/blank block 0/i);
  });

  it('refuses a zero-area rectangle instead of throwing on an empty skip list', () => {
    // NOT in the plan. `dominantSkipWhy` reduces the skip array without a seed,
    // so a w=0 / h=0 rectangle — no cells scanned, no skips recorded, and still
    // nothing applied — took the refusal branch and crashed on an empty reduce.
    // An agent passing w:0 must get a sentence, not a TypeError.
    const d = withCells([[0, 1]]);
    const r = planCollisionRect(d, rect(0, 0, 0, 4), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('nothing-applicable');
    expect((r as { why: string }).why).toMatch(/no cells/i);
    expect(r.report.skipped).toEqual([]);
  });

  it('skips a LINK overhang block and still applies the rest', () => {
    // Block 3 is past a 2-entry table; block 1 is not.
    const d = withCells([[0, 1], [1, 3]]);
    d.collision.colind = new Uint8Array(2);
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect(r.report.skipped).toEqual([{ reason: 'overhang', count: 1 }]);
  });

  it('counts a dangling block ref as a skip and still applies the rest', () => {
    // The rectangle contract for the same refusal: a skip, counted and stepped
    // over, not a refusal of the whole call. doc() ships 4 blocks, so block 9
    // does not exist.
    const d = withCells([[0, 1], [1, 9]]);
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect(r.report.skipped).toEqual([{ reason: 'no-such-block', count: 1 }]);
  });

  it('has a summary phrase for a rectangle that is entirely dangling refs', () => {
    // `skipPhrase` is a separate switch from `skipRefusal`, and a missing arm
    // there is a compile error rather than a wrong sentence — this pins the
    // wording that reaches an agent through `dominantSkipWhy`.
    const d = withCells([[0, 9]]);
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/dangling/i);
    // No specific block id in the summary — a rectangle has no single block to name.
    expect((r as { why: string }).why).not.toMatch(/block 9/);
  });

  it('counts loop-ambiguous cells in ONE warning rather than one per cell', () => {
    // Needs the act to actually own engine chunk id $28, so build the pool out
    // to it. LOOP_ALIAS.from is $28 and chunkIndexForId is id - 1.
    const d = doc();
    const blank = () => ({ cells: Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 })) });
    d.chunks = Array.from({ length: LOOP_ALIAS.from }, blank);
    d.chunks[LOOP_ALIAS.from - 1].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.chunks[LOOP_ALIAS.from - 1].cells[1] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.fg = { width: 1, height: 1, cells: new Uint8Array([0x80 | LOOP_ALIAS.from]) };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'link');
    expect(r.report.warnings.length).toBe(1);
    expect(r.report.warnings[0]).toMatch(/\$51/);
    expect(r.report.warnings[0]).toMatch(/^2 cells/);
  });

  it('reports the LINK blast radius in chunk-definition cells', () => {
    // Link changes the block ZONE-wide. The rectangle is not the blast radius,
    // and an agent reading only `applied` would think it was.
    const d = withCells([[0, 1], [200, 1]]);   // cell 200 is outside the rect
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'link');
    expect(r.report.applied).toBe(1);
    expect(r.report.blockCellsAffected).toBe(2);
  });
});

describe('planCollisionRect: isolate', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

  it('mints ONE clone per distinct block, not one per cell', () => {
    // The dedupe that `planSurfaceEdit` deliberately does NOT do (it keys clones
    // by chunk cell, because each cell's PIXELS differ). Here every cell gets
    // the same SHAPE, so one clone serves them all.
    const d = doc();
    for (const i of [0, 1, 16, 17]) d.chunks[0].cells[i] = { block: 1, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'isolate');
    expect(r.kind).toBe('isolate');
    const plan = (r as { plan: SurfaceEditPlan }).plan;
    expect(plan.newBlocks.length).toBe(1);
    expect(plan.newBlocks[0].colind).toBe(7);
    expect(plan.newBlocks[0].sourceBlockId).toBe(1);
    expect(plan.chunkCellEdits.length).toBe(4);
    const cloneId = d.blocks.length;
    expect(new Set(plan.chunkCellEdits.map((e) => e.cell.block))).toEqual(new Set([cloneId]));
    expect(r.report.isolate).toEqual({ blocksCloned: 1, chunkCellsRepointed: 4, chunksTouched: 1 });
  });

  it('gives each distinct block its own clone id, in order', () => {
    const d = doc();
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.chunks[0].cells[1] = { block: 2, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'isolate');
    const plan = (r as { plan: SurfaceEditPlan }).plan;
    expect(plan.newBlocks.map((b) => b.sourceBlockId)).toEqual([1, 2]);
    expect(plan.chunkCellEdits.map((e) => e.cell.block)).toEqual([d.blocks.length, d.blocks.length + 1]);
  });

  it("carries each cell's OWN flips and solidity onto the repoint", () => {
    // Re-derived from the doc, never from a cached probe, and never shared
    // between cells: two cells can use one block with different solidity.
    const d = doc();
    d.chunks[0].cells[0] = { block: 1, xf: true, yf: false, solidity: 1 };
    d.chunks[0].cells[1] = { block: 1, xf: false, yf: true, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 1), 7, 'isolate');
    const edits = (r as { plan: SurfaceEditPlan }).plan.chunkCellEdits;
    expect(edits[0].cell).toMatchObject({ xf: true, yf: false, solidity: 1 });
    expect(edits[1].cell).toMatchObject({ xf: false, yf: true, solidity: 3 });
  });

  it('de-duplicates chunk-cell edits when the rectangle spans two placements of one chunk', () => {
    // Cell (0,0) and cell (16,0) are BOTH chunk-definition cell 0 of chunk 1,
    // because fg is [1, 1].
    const d = doc();
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    // PLAN DISCREPANCY: the plan's fixture left doc()'s cell 5 (block 3) in
    // place, but a 17-wide rectangle passes over cx=5 — so it would have
    // written THREE cells across TWO definition cells, not the 2/1 the
    // assertions below state. Cleared, because the point of the test is the
    // (0,0)/(16,0) pair collapsing to one definition cell, not block 3.
    d.chunks[0].cells[5] = { block: 0, xf: false, yf: false, solidity: 0 };
    const r = planCollisionRect(d, { x: 0, y: 0, w: 17, h: 1 }, 7, 'isolate');
    const edits = (r as { plan: SurfaceEditPlan }).plan.chunkCellEdits;
    const keys = edits.map((e) => `${e.chunkIndex}:${e.cellIndex}`);
    expect(new Set(keys).size, 'duplicate chunk-cell edits').toBe(keys.length);
    expect(keys).toContain('0:0');
    // Two CELLS were applied, but they are one DEFINITION cell — the two units
    // must not collapse into each other.
    expect(r.report.applied).toBe(2);
    expect(r.report.isolate!.chunkCellsRepointed).toBe(1);
  });

  it('REFUSES the whole call when the clones would grow the colind table', () => {
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length);   // zero spare
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const ref = (r as { refusal: { kind: string; needed: number; spare: number } }).refusal;
    expect(ref.kind).toBe('isolate-grows-table');
    expect(ref.needed).toBe(1);
    expect(ref.spare).toBe(0);
    expect((r as { why: string }).why).toMatch(/adjacent|next zone/i);
  });

  it('names how many clones the rectangle needs against how many fit', () => {
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length + 1);   // exactly one spare
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.chunks[0].cells[1] = { block: 2, xf: false, yf: false, solidity: 3 };
    d.chunks[0].cells[16] = { block: 3, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 2, 2), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const ref = (r as { refusal: { needed: number; spare: number } }).refusal;
    expect(ref.needed).toBe(3);
    expect(ref.spare).toBe(1);
    expect((r as { resolution: string }).resolution).toMatch(/link|smaller/i);
  });

  it('REFUSES at the 1024-block ceiling, which classicPaintSurface does not check', () => {
    const d = doc();
    d.blocks = Array.from({ length: 1024 }, () => d.blocks[0]);
    d.collision.colind = new Uint8Array(2048);
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { kind: string } }).refusal.kind).toBe('block-ceiling');
  });

  it('is still SUCCESS-with-no-command when an isolate rectangle is entirely no-op', () => {
    // The success predicate sits BEFORE the mode split, so a rectangle needing
    // no clones never consults the clone budget — even in a zone with none spare.
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length);   // zero spare
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    d.collision.colind[1] = 7;
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('nothing');
    expect(r.report.noop).toBe(1);
  });

  it('reports no blockCellsAffected for isolate: that number is link-only', () => {
    const d = doc();
    d.chunks[0].cells[0] = { block: 1, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(0, 0, 1, 1), 7, 'isolate');
    expect(r.report.blockCellsAffected).toBeUndefined();
  });
});

// THE GENERAL FORM. A freehand drag produces an arbitrary SET of cells, not a
// rectangle — taking its bounding box would write cells the user never touched,
// and on a Link write that is a zone-wide collision change nobody asked for.
// The rectangle is this with the box expanded, which is what keeps ONE copy of
// the Link/Isolate decision.
describe('planCollisionCells', () => {
  const withCells = (assign: [number, number][]) => {
    const d = doc();
    for (const [cellIndex, block] of assign) {
      d.chunks[0].cells[cellIndex] = { block, xf: false, yf: false, solidity: 3 };
    }
    return d;
  };

  it('plans an arbitrary set of cells, not just a rectangle', () => {
    // A diagonal — the shape a slope actually has, and the reason this exists.
    // cellIndex = (cy % 16) * 16 + (cx % 16): (0,0)→0, (1,1)→17, (2,2)→34.
    const d = withCells([[0, 1], [17, 2], [34, 3]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(3);
    expect(r.report.blocks).toBe(3);
  });

  it('DEDUPES repeated cells: a freehand drag revisits them constantly', () => {
    // The planner must not depend on its caller having deduped: it is pure core
    // with a second, agent-shaped caller. Without this, `applied` counts a cell
    // once per visit and every reported number is fiction.
    const d = withCells([[0, 1]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect((r as { entries: unknown[] }).entries).toEqual([{ blockId: 1, value: 7 }]);
  });

  it('dedupes before counting skips too', () => {
    const d = doc();   // every cell of the 2x2 origin is block 0
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 0, y: 0 }], 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { refusal: { skipped: { count: number }[] } }).refusal.skipped)
      .toEqual([{ reason: 'block0', count: 1 }]);
  });

  it('is what planCollisionRect is built on: same answer for the same cells', () => {
    // The guard against a SECOND copy of the decision. If the rect stops
    // delegating, the human gesture and the agent tool drift apart silently.
    const d = withCells([[0, 1], [1, 2], [16, 3], [17, 1]]);
    const viaRect = planCollisionRect(d, { x: 0, y: 0, w: 2, h: 2 }, 7, 'link');
    const viaCells = planCollisionCells(
      d, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 7, 'link',
    );
    expect(viaCells).toEqual(viaRect);
  });

  it('refuses an empty cell list without throwing', () => {
    // The freehand equivalent of the zero-area rectangle that crashed the
    // previous plan: an empty list means an empty `skipped`, and an unseeded
    // reduce over it throws.
    const r = planCollisionCells(doc(), [], 7, 'link');
    expect(r.kind).toBe('refused');
    expect((r as { why: string }).why).toMatch(/no cells/i);
  });

  it('isolate over a cell list clones once per distinct block', () => {
    const d = withCells([[0, 1], [17, 1], [34, 2]]);
    const r = planCollisionCells(d, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 7, 'isolate');
    expect(r.kind).toBe('isolate');
    expect((r as { plan: SurfaceEditPlan }).plan.newBlocks.length).toBe(2);
  });
});

// WHEN LINK IS PROVABLY ENOUGH. Isolate refuses in GHZ and SBZ for every cell,
// and the escape it offers used to be a hedge in every case: "Use Link,
// accepting it changes every use of block N". When every chunk-definition cell
// naming N is inside the selection, that hedge is describing a cost that does
// not exist — Link reaches nothing Isolate would have spared.
//
// The refusal is unchanged. Only the sentence, and the machine-readable set
// beside it, are.
describe('planCollisionRect: isolate refusal, containment', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const resolutionOf = (r: ReturnType<typeof planCollisionRect>) => (r as { resolution: string }).resolution;
  const refusalOf = (r: ReturnType<typeof planCollisionRect>) =>
    (r as { refusal: { kind: string; linkEquivalent?: number[] } }).refusal;

  /**
   * doc() with a colind table exactly as long as the block list: zero spare, so
   * ANY isolate refuses with `isolate-grows-table` while every block id (0..3)
   * is still inside the table. That is the state the guarantee is about.
   */
  const zeroSpare = () => {
    const d = doc();
    d.collision.colind = new Uint8Array(d.blocks.length);   // 4 entries, 4 blocks
    return d;
  };

  it('GUARANTEES Link when every definition cell naming the blocks is selected', () => {
    // doc() names block 3 from chunks[0] cell 5 and nowhere else, and cell 5 is
    // FG cell (5,0). A 1x1 rectangle there covers the block's whole use.
    const d = zeroSpare();
    const r = planCollisionRect(d, rect(5, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect(refusalOf(r).kind).toBe('isolate-grows-table');
    const res = resolutionOf(r);
    expect(res).toMatch(/^Use Link/);
    expect(res, 'hedges when it can guarantee').not.toMatch(/accepting it changes every use/);
    expect(res).toMatch(/every chunk-definition cell naming this block is inside this selection/);
    expect(refusalOf(r).linkEquivalent).toEqual([3]);
  });

  it('HEDGES when one further definition cell naming the block is left outside', () => {
    // THE PAIR. Identical to the test above except cell 6 also names block 3,
    // and the same 1x1 rectangle does not cover it.
    const d = zeroSpare();
    d.chunks[0].cells[6] = { block: 3, xf: false, yf: false, solidity: 3 };
    const r = planCollisionRect(d, rect(5, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect(resolutionOf(r)).toMatch(/accepting it changes every use of these blocks zone-wide/);
    expect(refusalOf(r).linkEquivalent).toEqual([]);
  });

  it('counts a naming cell in a chunk the LAYOUT NEVER STAMPS as uncontained', () => {
    // TRAP 1, on the rectangle path. chunks[1] is engine chunk id 2; fg is
    // [1, 1], so no rectangle in this act can ever reach it — yet a Link would
    // rewrite the collision of the cell inside it. Containment must be computed
    // from doc.chunks, never from the layout.
    const d = zeroSpare();
    const cells = Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
    cells[0] = { block: 3, xf: false, yf: false, solidity: 3 };
    (d.chunks as unknown[]).push({ cells });
    const r = planCollisionRect(d, rect(5, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    expect(resolutionOf(r), 'promised a guarantee for a cell no selection can reach')
      .toMatch(/accepting it changes every use of these blocks zone-wide/);
    expect(refusalOf(r).linkEquivalent).toEqual([]);
  });

  it('never guarantees Link for an OVERHANG block, however contained it is', () => {
    // TRAP 2. The classifier's overhang skip is link-mode only, so an isolate
    // refusal's block set CAN hold blocks past the end of the table — blocks
    // Link cannot set either. Block 3 here is named by exactly one definition
    // cell and the rectangle covers it, so it is fully contained; it is still
    // outside a 3-entry table, and promising Link for it would recreate the
    // "recommends a mode this same document refuses" defect.
    const d = doc();
    d.collision.colind = new Uint8Array(3);                 // block 3 is the overhang
    const r = planCollisionRect(d, rect(5, 0, 1, 1), 7, 'isolate');
    expect(r.kind).toBe('refused');
    const res = resolutionOf(r);
    expect(res).toMatch(/Link cannot set every block/);
    expect(res, 'recommends Link for a block Link refuses').not.toMatch(/^Use Link/);
    expect(refusalOf(r).linkEquivalent).toEqual([]);
  });

  it('hedges for a MIXED selection: one block contained, one not', () => {
    // The guarantee is all-or-nothing on purpose: it is one sentence about the
    // whole call, and "some of these are free" is not something a caller can
    // act on without knowing which. `linkEquivalent` carries the which.
    const d = zeroSpare();
    d.chunks[0].cells[4] = { block: 2, xf: false, yf: false, solidity: 3 };
    d.chunks[0].cells[6] = { block: 2, xf: false, yf: false, solidity: 3 };  // outside the rect
    const r = planCollisionRect(d, rect(4, 0, 2, 1), 7, 'isolate');          // cells 4 and 5
    expect(r.kind).toBe('refused');
    expect(refusalOf(r).kind).toBe('isolate-grows-table');
    expect(resolutionOf(r)).toMatch(/accepting it changes every use of these blocks zone-wide/);
    expect(refusalOf(r).linkEquivalent).toEqual([3]);        // block 2 escapes, block 3 does not
  });
});

// WHICH CELLS WERE SKIPPED, not just how many.
//
// `skipped` is a per-reason tally, and a tally is the wrong tier for the one
// axis the caller controls. A caller that asked for a 4-cell slope and got
// `applied: 2, skipped: [{ block0, 2 }]` cannot tell whether the two blank
// cells were the two it expected to be air or the two it most cared about —
// only a cell-by-cell probe answers that, which is the round-trip the reply
// exists to save. `applied` and `blocks` stay aggregates because they are
// about BLOCKS; this list is about CELLS.
describe('planCollisionCells: skippedCells', () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const withCells = (assign: [number, number][]) => {
    const d = doc();
    for (const [cellIndex, block] of assign) {
      d.chunks[0].cells[cellIndex] = { block, xf: false, yf: false, solidity: 3 };
    }
    return d;
  };

  it('names each skipped cell with the CALLER\'S coordinates and the reason it was tallied under', () => {
    // The rectangle sits at x=16..18, which is the SECOND placement of chunk 1
    // (fg is [1, 1]) — so definition cells 0/1/2 are reached through FG cells
    // 16/17/18. The list must report what the caller asked for, not the
    // chunk-definition cell index it resolved to; a caller correcting a
    // coordinate mistake can only act on its own coordinate space.
    //   (16,0) → cell 0 → block 1  → write
    //   (17,0) → cell 1 → block 0  → skip, block0
    //   (18,0) → cell 2 → block 9  → skip, no-such-block (doc() ships 4 blocks)
    const d = withCells([[0, 1], [2, 9]]);
    const r = planCollisionRect(d, rect(16, 0, 3, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect(r.report.skippedCells).toEqual([
      { x: 17, y: 0, reason: 'block0' },
      { x: 18, y: 0, reason: 'no-such-block' },
    ]);
    // Every listed reason is one the tally accounts for, with the same totals.
    expect(r.report.skipped).toEqual([
      { reason: 'block0', count: 1 },
      { reason: 'no-such-block', count: 1 },
    ]);
    expect(r.report.skippedCellsTruncated).toBe(false);
  });

  it('CAPS the list while the per-reason counts stay the true total', () => {
    // THE TEST THAT PROVES THE TWO ARE NOT THE SAME NUMBER. doc() is a 32x16
    // act whose only non-blank definition cell is 5, reached at FG (5,0) and
    // (21,0). A 32x4 rectangle scans 128 cells: 2 write, 126 skip as block 0.
    // 126 against a cap of 32 — no reader can mistake one for the other.
    const d = doc();
    const r = planCollisionRect(d, rect(0, 0, 32, 4), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(2);

    const total = r.report.skipped.reduce((n, s) => n + s.count, 0);
    expect(total, 'the counts are the authoritative total').toBe(126);
    expect(r.report.skipped).toEqual([{ reason: 'block0', count: 126 }]);
    expect(r.report.skippedCells).toHaveLength(SKIPPED_CELLS_CAP);
    expect(r.report.skippedCells!.length, 'the list length is NOT the total').not.toBe(total);
    expect(r.report.skippedCellsTruncated).toBe(true);
  });

  it('is FIRST-N IN SCAN ORDER: not sampled, not grouped by reason, not deduped', () => {
    // Deterministic and identical across a retry of the same call: a sampled or
    // set-ordered list would make two identical calls disagree, which is worse
    // than no list at all.
    //   (0,0) → cell 0  → block 1 → write        <- the scan's FIRST cell is not a skip
    //   (1,0) → cell 1  → block 1 → write
    //   (2,0) → cell 2  → block 0 → skip block0  <- so THIS is the list's head
    //   (3,0) → cell 3  → block 9 → skip no-such-block
    //   (0..3,1) → cells 16..19 → block 0 → skip block0 x4
    // The two reasons INTERLEAVE, so a collection keyed by reason — a Map or a
    // Set per reason — cannot reproduce this order, and one that deduped by
    // reason could not reproduce five separate block0 entries.
    const d = withCells([[0, 1], [1, 1], [3, 9]]);
    const cells = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
    ];
    const r = planCollisionCells(d, cells, 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.skippedCells).toEqual([
      { x: 2, y: 0, reason: 'block0' },
      { x: 3, y: 0, reason: 'no-such-block' },
      { x: 0, y: 1, reason: 'block0' },
      { x: 1, y: 1, reason: 'block0' },
      { x: 2, y: 1, reason: 'block0' },
      { x: 3, y: 1, reason: 'block0' },
    ]);
    expect(r.report.skippedCells![0], 'the head is the first cell the SCAN reached that skipped')
      .toEqual({ x: 2, y: 0, reason: 'block0' });
    expect(r.report.skipped).toEqual([
      { reason: 'block0', count: 5 },
      { reason: 'no-such-block', count: 1 },
    ]);
    expect(r.report.skippedCellsTruncated).toBe(false);

    // A retry of the same call returns the same list, entry for entry.
    const again = planCollisionCells(d, cells, 7, 'link');
    expect(again.report.skippedCells).toEqual(r.report.skippedCells);
  });

  it('lists cells the SCANNER rejected too, in the same order as the classifier\'s', () => {
    // THE OTHER BUMP SITE. 'outside-layout' is manufactured by the scanner when
    // `locateCell` returns null — the classifier never returns it, and for such
    // a cell there is no CellAddress at all, so the caller's own coordinate is
    // the ONLY thing that could be reported. The act is 32 cells wide.
    //   (30,0) → cell 14 → block 1 → write
    //   (31,0) → cell 15 → block 0 → skip block0
    //   (32,0), (33,0) → past the edge → skip outside-layout
    const d = withCells([[14, 1]]);
    const r = planCollisionRect(d, rect(30, 0, 4, 1), 7, 'link');
    expect(r.kind).toBe('link');
    expect(r.report.applied).toBe(1);
    expect(r.report.skippedCells).toEqual([
      { x: 31, y: 0, reason: 'block0' },
      { x: 32, y: 0, reason: 'outside-layout' },
      { x: 33, y: 0, reason: 'outside-layout' },
    ]);
    expect(r.report.skipped).toEqual([
      { reason: 'block0', count: 1 },
      { reason: 'outside-layout', count: 2 },
    ]);
  });
});
