// THE MERGED `paint_collision` DISPATCH, driven through `handleAgentRequest` —
// the same entry point MCP and Aether both reach. The pure builders are covered
// in `test/agent/paint-collision-reconcile.test.ts`; THIS file is about the
// handler, which is where the 2026-08-29 merge of two parcels actually
// happened and where a combination could still be dropped on the floor:
//
//   • FORM  — `word` (fill) XOR `words` (per cell) — from `mcp-collision-read`
//   • PLANE — 'a' | 'b' | 'both'                   — from `lp2-loop-paint`
//
// (A third axis, CROSSOVER, was retired with the painted loop marks on
// 2026-09-26, ROADMAP rows 223+224: the handler now REFUSES it, [h2], and bits
// 15:14 are reserved. Its hand-off rows, [h2]/[h3] before, were deleted.)
//
// The handler is the only place the axes meet, and the only place that decides
// WHICH ARRAY IS THE AIMED ONE — the mistake a builder-level test cannot make,
// because the builder takes the array and the id as two separate arguments and
// believes whatever it is told. Packet:
// docs/reviews/2026-08-29-paint-collision-reconcile.md.
//
// ⚠ ANTI-VACUOUS: bits 15:14 are zero in every shipped plane file, so each row
// SEEDS its destination cells with a non-zero, PER-PLANE-DIFFERENT value in the
// reserved bits 15:14 before painting, and the seed is asserted before the paint.
//
// ⚠ THE UNDO STEP IS ASSERTED, not assumed: `plane: "both"` writing two planes
// in ONE command is the property that makes the feature safe, and an
// implementation that emitted two commands would pass every "the bytes are
// right" row.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color, Section } from '../../../core/model/s4-types';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import { packCollisionCell } from '../../../core/collision/collision-cell-word';
import { cellTileIndices } from '../../../core/collision/collision-cell';
import {
  planeReservedBits, PLANE_RESERVED_SHIFT, PLANE_RESERVED_BITS,
} from '../../../core/collision/reserved-bits';
import { unownedCollisionBits, COLLISION_CELL_UNOWNED_MASK } from '../../../core/editing/collision-word';
import { levelDocId } from '../../shell/tabs';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
const solid = (shape: number) => packCollisionCell({ shape, xFlip: false, yFlip: false, solidity: 'all' });
const PLANE_WORDS = SECTION_TILES_WIDE * SECTION_TILES_HIGH;

function fakeSection(index: number): Section {
  return {
    index, name: `s${index}`,
    tileGrid: { width: SECTION_TILES_WIDE, height: SECTION_TILES_HIGH, entries: new Uint16Array(PLANE_WORDS) },
    engineCollision: null, engineCollisionB: null,
    collisionEdit: new Uint16Array(PLANE_WORDS),
    collisionEditB: new Uint16Array(PLANE_WORDS),
    objects: [], rings: [],
  } as unknown as Section;
}

function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [fakeSection(0)],
        bgLayout: null, bgTiles: null,
      }],
    }],
    chunkLibrary: [], bgLibrary: [],
    effectsScenes: { scenes: [], unreadable: [], notices: [] },
    bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
  } as never;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const act = () => useProjectStore.getState().project!.zones[0].acts[0];
const sec = () => act().sections[0] as Section;
const planeA = () => sec().collisionEdit as Uint16Array;
const planeB = () => sec().collisionEditB as Uint16Array;

function cellWord(plane: Uint16Array, cc: number, cr: number): number {
  const [tl, tr, bl, br] = cellTileIndices(cc, cr, SECTION_TILES_WIDE).map((i) => plane[i]!);
  if (!(tl === tr && tr === bl && bl === br)) throw new Error(`cell (${cc},${cr}) is not uniform`);
  return tl;
}
function setCell(plane: Uint16Array, cc: number, cr: number, word: number): void {
  for (const i of cellTileIndices(cc, cr, SECTION_TILES_WIDE)) plane[i] = word;
}
const hex = (w: number) => `$${w.toString(16).toUpperCase().padStart(4, '0')}`;
const show = (cc: number, cr: number) =>
  `(${cc},${cr}) A=${hex(cellWord(planeA(), cc, cr))} B=${hex(cellWord(planeB(), cc, cr))}`;
/** A word with bits 15:14 = v: how a retired mark ARRIVES (nothing in Aurora writes one). */
const withReserved = (word: number, v: number): number =>
  ((word & ~PLANE_RESERVED_BITS) | (v << PLANE_RESERVED_SHIFT)) & 0xFFFF;

const CELLS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** How many 8px sub-tiles one 16px cell covers. DERIVED from the expansion the
 *  writers use, never typed as 4 — `painted` counts sub-tile entries and the
 *  reserved-bits audit reads the planes at TILE resolution, so every count below
 *  is `cells * SUBTILES` rather than a number copied out of a passing run. */
const SUBTILES = cellTileIndices(0, 0, SECTION_TILES_WIDE).length;

function open(): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

/** Seed the 2x2 region on BOTH planes with different shapes AND different
 *  reserved values (A: 2, B: 1), so no row can pass by broadcasting one plane's
 *  answer. */
function seed(): void {
  for (const [cc, cr] of CELLS) {
    setCell(planeA(), cc, cr, withReserved(solid(11), 2));
    setCell(planeB(), cc, cr, withReserved(solid(22), 1));
  }
  expect(planeReservedBits(cellWord(planeA(), 0, 0))).toBe(2);
  expect(planeReservedBits(cellWord(planeB(), 0, 0))).toBe(1);
  expect(unownedCollisionBits(cellWord(planeA(), 0, 0))).not.toBe(0);
}

const base = { kind: 'paint-collision' as const, section: 0, x: 0, y: 0, w: 2, h: 2 };
const WORDS = [solid(1), solid(2), solid(3), solid(4)];

beforeEach(() => { open(); seed(); });

// ═══════════════════════════════════════════════════════════════════════════
// [h1] words x plane:"both"
// ═══════════════════════════════════════════════════════════════════════════

describe('[h1] paint_collision: words + plane:"both"', () => {
  it('writes the per-cell picture to both planes, each merged against its OWN word', async () => {
    const r = await ask({ ...base, plane: 'both', words: WORDS }) as
      { painted: number; paintedOther: number; skipped: number; bothPlanes: boolean };
    console.log(`[h1] reply painted=${r.painted} paintedOther=${r.paintedOther} skipped=${r.skipped}\n`
      + CELLS.map(([cc, cr]) => '    ' + show(cc, cr)).join('\n'));

    expect(r.bothPlanes).toBe(true);
    // Two counts, never summed — 4 cells x 4 sub-tiles on each plane.
    expect(r.painted).toBe(CELLS.length * SUBTILES);
    expect(r.paintedOther).toBe(CELLS.length * SUBTILES);
    expect(r.skipped).toBe(0);

    for (let i = 0; i < CELLS.length; i++) {
      const [cc, cr] = CELLS[i];
      expect(cellWord(planeA(), cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS[i]);
      expect(cellWord(planeB(), cc, cr) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS[i]);
    }
    // ⚠ each plane KEPT ITS OWN reserved bits: not erased, and not copied (a
    // single merge broadcast to both would have made B's equal A's).
    expect(planeReservedBits(cellWord(planeA(), 0, 0))).toBe(2);
    expect(planeReservedBits(cellWord(planeB(), 0, 0))).toBe(1);
  });

  it('is ONE undo step, and undoing it restores BOTH planes in full', async () => {
    const beforeA = Array.from(planeA());
    const beforeB = Array.from(planeB());
    await ask({ ...base, plane: 'both', words: WORDS });
    expect(Array.from(planeA())).not.toEqual(beforeA);          // anti-vacuous
    expect(Array.from(planeB())).not.toEqual(beforeB);

    // The doc id is DERIVED from the same helper the store routes with, never
    // typed — a literal here could drift from where the command actually landed
    // and the row would silently stop reaching the stack it means to test.
    const stack = documentHistoryHub.historyFor(levelDocId('ojz', 'act1'));
    expect(stack.canUndo).toBe(true);
    stack.undo();
    console.log(`[h1u] after ONE undo: ${show(0, 0)}`);
    expect(Array.from(planeA())).toEqual(beforeA);
    expect(Array.from(planeB())).toEqual(beforeB);
    // ONE step: there is nothing left to undo, so the two planes were not two
    // commands. A second command would leave this true and the row above green.
    expect(stack.canUndo).toBe(false);
  });

  it('CONTROL: plane "a" leaves plane B untouched and reports paintedOther 0', async () => {
    const beforeB = Array.from(planeB());
    const r = await ask({ ...base, plane: 'a', words: WORDS }) as
      { painted: number; paintedOther: number; bothPlanes: boolean };
    expect(r.bothPlanes).toBe(false);
    expect(r.painted).toBe(CELLS.length * SUBTILES);
    expect(r.paintedOther).toBe(0);
    expect(Array.from(planeB())).toEqual(beforeB);
  });

  it('a null cell is skipped on BOTH planes; skipped counts cells once', async () => {
    const words = [solid(1), null, null, solid(4)];
    const r = await ask({ ...base, plane: 'both', words }) as
      { painted: number; paintedOther: number; skipped: number };
    console.log(`[h1n] words=${JSON.stringify(words)} painted=${r.painted} `
      + `paintedOther=${r.paintedOther} skipped=${r.skipped}\n    ${show(1, 0)}`);
    expect(r.skipped).toBe(2);                     // 2 cells, not 2 per plane
    expect(r.painted).toBe(2 * SUBTILES);          // the 2 written cells
    expect(r.paintedOther).toBe(2 * SUBTILES);
    // The null cells are untouched in EVERY bit, on both planes.
    expect(cellWord(planeA(), 1, 0)).toBe(withReserved(solid(11), 2));
    expect(cellWord(planeB(), 1, 0)).toBe(withReserved(solid(22), 1));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [h2] the RETIRED crossover parameters are refused, and the reply reports
// the reserved bits as an ERROR (ROADMAP rows 223+224)
// ═══════════════════════════════════════════════════════════════════════════

describe('[h2] paint_collision: retired crossover params, and the reserved-bits audit', () => {
  for (const extra of [{ crossover: 'hand-off' }, { crossover: 'keep' }, { crossoverSpan: 'left' }]) {
    it(`⚠ REFUSES ${JSON.stringify(extra)} by name and writes nothing`, async () => {
      const beforeA = Array.from(planeA());
      const beforeB = Array.from(planeB());
      await expect(ask({ ...base, plane: 'both', words: WORDS, ...extra } as never))
        .rejects.toThrow(/RETIRED.*layer_lines\.json.*Nothing was painted/);
      expect(Array.from(planeA())).toEqual(beforeA);
      expect(Array.from(planeB())).toEqual(beforeB);
    });
  }

  it('CONTROL: the same paint without the retired key goes through', async () => {
    const r = await ask({ ...base, plane: 'both', words: WORDS }) as { painted: number };
    expect(r.painted).toBe(CELLS.length * SUBTILES);
  });

  it('⚠ the reply carries reservedBitsAudit as an ERROR naming the seeded cells, which the paint neither wrote nor cleared', async () => {
    const r = await ask({ ...base, plane: 'a', words: WORDS }) as
      { reservedBitsAudit: { reservedA: number; reservedB: number; severity: string; note: string | null } };
    console.log(`[h2a] audit=${JSON.stringify(r.reservedBitsAudit)}`);
    expect(r.reservedBitsAudit.severity).toBe('error');
    expect(r.reservedBitsAudit.reservedA).toBe(CELLS.length * SUBTILES);
    expect(r.reservedBitsAudit.reservedB).toBe(CELLS.length * SUBTILES);
    expect(r.reservedBitsAudit.note).toMatch(/section 0 plane A editor cell \(0, 0\)/);
    // The picture changed; the reserved bits did not (no silent erase).
    expect(cellWord(planeA(), 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS[0]);
    expect(planeReservedBits(cellWord(planeA(), 0, 0))).toBe(2);
  });

  it('CONTROL: on a clean section the audit is ok with no note', async () => {
    for (const [cc, cr] of CELLS) { setCell(planeA(), cc, cr, solid(11)); setCell(planeB(), cc, cr, solid(22)); }
    const r = await ask({ ...base, plane: 'both', words: WORDS }) as
      { reservedBitsAudit: { reservedA: number; reservedB: number; severity: string; note: string | null } };
    expect(r.reservedBitsAudit).toEqual({ reservedA: 0, reservedB: 0, severity: 'ok', note: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [h4] The refusals, through the handler
// ═══════════════════════════════════════════════════════════════════════════

describe('[h4] the refusals', () => {
  it('get_collision_region REFUSES plane:"both", in prose, and names paint_collision', async () => {
    const p = ask({
      kind: 'get-collision-region', section: 0, plane: 'both' as never, x: 0, y: 0, w: 2, h: 2,
    });
    await expect(p).rejects.toThrow(/paint_collision accepts "both"/);
    await expect(ask({
      kind: 'get-collision-region', section: 0, plane: 'both' as never, x: 0, y: 0, w: 2, h: 2,
    })).rejects.toThrow(/Call it twice/);
    // …and 'a' on the same rectangle works, so this is not "the read is broken".
    const ok = await ask({
      kind: 'get-collision-region', section: 0, plane: 'a', x: 0, y: 0, w: 2, h: 2,
    }) as { words: (number | null)[]; reservedCells: number };
    console.log(`[h4] plane "a" on the same rect: words=${JSON.stringify(ok.words)} `
      + `reservedCells=${ok.reservedCells}`);
    expect(ok.words).toHaveLength(4);
    expect(ok.reservedCells).toBe(4);
  });

  it('paint_collision still refuses both forms at once, under plane:"both"', async () => {
    const beforeA = Array.from(planeA());
    await expect(ask({ ...base, plane: 'both', word: solid(9), words: WORDS }))
      .rejects.toThrow(/not both/);
    expect(Array.from(planeA())).toEqual(beforeA);         // and wrote nothing
  });

  it('paint_collision still refuses NEITHER form', async () => {
    const beforeA = Array.from(planeA());
    await expect(ask({ ...base, plane: 'both' } as never))
      .rejects.toThrow(/neither was given/);
    expect(Array.from(planeA())).toEqual(beforeA);
  });

  it('a words array of the wrong length is refused before anything is written', async () => {
    const beforeA = Array.from(planeA());
    await expect(ask({ ...base, plane: 'both', words: [solid(1), solid(2), solid(3)] }))
      .rejects.toThrow(/words length 3 != region size 2x2 = 4 cells/);
    expect(Array.from(planeA())).toEqual(beforeA);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [h5] The round trip, end to end on the handler
// ═══════════════════════════════════════════════════════════════════════════

describe('[h5] read → write over itself is exact, reserved bits and all', () => {
  it('restores the region byte for byte and needs no second call to do it', async () => {
    const before = Array.from(planeA());
    const read = await ask({
      kind: 'get-collision-region', section: 0, plane: 'a', x: 0, y: 0, w: 2, h: 2,
    }) as { words: (number | null)[]; reservedCells: number };
    expect(read.reservedCells).toBe(4);                     // anti-vacuous
    // Scribble over it (air), then put it back with the read's own `words`.
    await ask({ ...base, plane: 'a', word: 0 });
    expect(Array.from(planeA())).not.toEqual(before);
    // The scribble changed the picture and KEPT the reserved bits (no erase).
    expect(planeReservedBits(cellWord(planeA(), 0, 0))).toBe(2);
    const r = await ask({ ...base, plane: 'a', words: read.words }) as { painted: number };
    console.log(`[h5] restored painted=${r.painted}  ${show(0, 0)}`);
    // The whole region is back byte for byte: the picture from `words`, the
    // reserved bits because no paint ever touched them.
    expect(Array.from(planeA())).toEqual(before);
  });

  it('with the region left ALONE, the same round trip is a byte-exact no-op', async () => {
    const before = Array.from(planeA());
    const read = await ask({
      kind: 'get-collision-region', section: 0, plane: 'a', x: 0, y: 0, w: 2, h: 2,
    }) as { words: (number | null)[] };
    const r = await ask({ ...base, plane: 'a', words: read.words }) as { painted: number };
    console.log(`[h5=] over itself: painted=${r.painted} (0 means nothing needed changing)`);
    expect(r.painted).toBe(0);
    expect(Array.from(planeA())).toEqual(before);
  });
});
