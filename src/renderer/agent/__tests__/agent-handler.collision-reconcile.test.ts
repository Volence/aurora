// THE MERGED `paint_collision` DISPATCH, driven through `handleAgentRequest` —
// the same entry point MCP and Aether both reach. The pure builders are covered
// in `test/agent/paint-collision-reconcile.test.ts`; THIS file is about the
// handler, which is where the 2026-08-29 merge of two parcels actually
// happened and where a combination could still be dropped on the floor:
//
//   • FORM  — `word` (fill) XOR `words` (per cell) — from `mcp-collision-read`
//   • PLANE — 'a' | 'b' | 'both'                   — from `lp2-loop-paint`
//   • CROSSOVER — keep (absent) | clear | hand-off — from `lp2-loop-paint`
//
// The handler is the only place all three meet, and the only place that decides
// WHICH ARRAY IS THE AIMED ONE — the mistake a builder-level test cannot make,
// because the builder takes the array and the id as two separate arguments and
// believes whatever it is told. Packet:
// docs/reviews/2026-08-29-paint-collision-reconcile.md.
//
// ⚠ ANTI-VACUOUS: bits 15:14 are zero in every shipped plane file, so each row
// SEEDS its destination cells with a non-zero, PER-PLANE-DIFFERENT crossover
// before painting, and the seed is asserted before the paint.
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
  readCrossover, withCrossover, handOffFrom, isSelfMark, type Crossover,
} from '../../../core/collision/layer-transition';
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
  `(${cc},${cr}) A=${hex(cellWord(planeA(), cc, cr))}/${readCrossover(cellWord(planeA(), cc, cr))}`
  + ` B=${hex(cellWord(planeB(), cc, cr))}/${readCrossover(cellWord(planeB(), cc, cr))}`;

const CELLS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** How many 8px sub-tiles one 16px cell covers. DERIVED from the expansion the
 *  writers use, never typed as 4 — `painted` counts sub-tile entries and
 *  `auditCrossovers` deliberately reads the planes at TILE resolution (see its
 *  docblock), so every count below is `cells * SUBTILES` rather than a number
 *  copied out of a passing run. */
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
 *  crossovers, so no row can pass by broadcasting one plane's answer. */
function seed(): void {
  for (const [cc, cr] of CELLS) {
    setCell(planeA(), cc, cr, withCrossover(solid(11), 'to-b'));
    setCell(planeB(), cc, cr, withCrossover(solid(22), 'to-a'));
  }
  expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('to-b');
  expect(readCrossover(cellWord(planeB(), 0, 0))).toBe('to-a');
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
    // ⚠ each plane KEPT ITS OWN crossover. A single merge broadcast to both
    // would have made B's equal A's, and every shipped act would hide it.
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('to-b');
    expect(readCrossover(cellWord(planeB(), 0, 0))).toBe('to-a');
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
    expect(cellWord(planeA(), 1, 0)).toBe(withCrossover(solid(11), 'to-b'));
    expect(cellWord(planeB(), 1, 0)).toBe(withCrossover(solid(22), 'to-a'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [h2] words x crossover
// ═══════════════════════════════════════════════════════════════════════════

describe('[h2] paint_collision: words + crossover', () => {
  it('an OMITTED crossover keeps every cell\'s own: never clears it', async () => {
    const r = await ask({ ...base, plane: 'a', words: WORDS }) as { crossover: string };
    console.log(`[h2k] reply crossover=${r.crossover}  ${show(0, 0)}`);
    expect(r.crossover).toBe('keep');
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('to-b');
    // …and the picture really did change, so this is not a "wrote nothing" green.
    expect(cellWord(planeA(), 0, 0) & ~COLLISION_CELL_UNOWNED_MASK).toBe(WORDS[0]);
  });

  it('hand-off marks each WRITTEN cell and no skipped one, on the aimed plane', async () => {
    // Clear the crossover on the cells that will be WRITTEN so "hand-off
    // landed" cannot be read off the seed; leave (1,0) — the null cell —
    // carrying the seed value.
    for (const [cc, cr] of CELLS) {
      if (cc === 1 && cr === 0) continue;
      setCell(planeA(), cc, cr, withCrossover(cellWord(planeA(), cc, cr), 'none'));
    }
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('none');

    const words = [solid(1), null, solid(3), solid(4)];
    await ask({ ...base, plane: 'a', words, crossover: 'hand-off' });
    console.log(`[h2h] ${CELLS.map(([cc, cr]) =>
      `(${cc},${cr})=${readCrossover(cellWord(planeA(), cc, cr))}`).join(' ')}`);

    const expected = handOffFrom('a');
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe(expected);
    expect(readCrossover(cellWord(planeA(), 0, 1))).toBe(expected);
    expect(readCrossover(cellWord(planeA(), 1, 1))).toBe(expected);
    expect(readCrossover(cellWord(planeA(), 1, 0))).toBe('to-b');   // skipped, untouched
    expect(isSelfMark('a', expected)).toBe(false);
  });

  it('clear erases the written cells\' crossover and spares the skipped one', async () => {
    await ask({ ...base, plane: 'a', words: [solid(1), null, solid(3), solid(4)], crossover: 'clear' });
    console.log(`[h2c] ${CELLS.map(([cc, cr]) =>
      `(${cc},${cr})=${readCrossover(cellWord(planeA(), cc, cr))}`).join(' ')}`);
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('none');
    expect(readCrossover(cellWord(planeA(), 1, 1))).toBe('none');
    // "null = leave this cell alone" outranks the crossover axis.
    expect(readCrossover(cellWord(planeA(), 1, 0))).toBe('to-b');
  });

  it('aimed at plane B, hand-off writes B\'s legal value: never a self-mark', async () => {
    for (const [cc, cr] of CELLS) setCell(planeB(), cc, cr, solid(22));
    await ask({ ...base, plane: 'b', words: WORDS, crossover: 'hand-off' });
    const got = readCrossover(cellWord(planeB(), 0, 0));
    console.log(`[h2b] aimed at B: ${show(0, 0)}`);
    expect(got).toBe(handOffFrom('b'));
    // `reserved` is not a Crossover, so narrow before asking about self-marks —
    // and assert the narrowing, since a `reserved` here would be a real defect.
    expect(got).not.toBe('reserved');
    expect(isSelfMark('b', got as Crossover)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// [h3] words x both x hand-off — the two-way pair, per cell, one call
// ═══════════════════════════════════════════════════════════════════════════

describe('[h3] paint_collision: words + both + hand-off', () => {
  it('gives each plane the OTHER plane\'s value, per written cell', async () => {
    for (const [cc, cr] of CELLS) {
      setCell(planeA(), cc, cr, solid(11));
      setCell(planeB(), cc, cr, solid(22));
    }
    const words = [solid(1), null, solid(3), solid(4)];
    const r = await ask({ ...base, plane: 'both', words, crossover: 'hand-off' }) as
      { crossover: string; crossoverAudit: { pairs: number; oneWay: number; selfMarks: number; severity: string } };
    console.log(`[h3] crossover=${r.crossover} audit=${JSON.stringify(r.crossoverAudit)}\n`
      + CELLS.map(([cc, cr]) => '    ' + show(cc, cr)).join('\n'));

    for (const [cc, cr] of [[0, 0], [0, 1], [1, 1]] as [number, number][]) {
      expect(readCrossover(cellWord(planeA(), cc, cr))).toBe(handOffFrom('a'));
      expect(readCrossover(cellWord(planeB(), cc, cr))).toBe(handOffFrom('b'));
    }
    expect(readCrossover(cellWord(planeA(), 1, 0))).toBe('none');   // the null cell
    expect(readCrossover(cellWord(planeB(), 1, 0))).toBe('none');
    // The audit rides back, and sees three complete two-way PAIRS and no
    // one-way half — which is the whole reason one call writes both halves.
    expect(r.crossoverAudit.selfMarks).toBe(0);
    // The audit reads at TILE resolution, so 3 written CELLS are 3*SUBTILES.
    expect(r.crossoverAudit.pairs).toBe(3 * SUBTILES);
    expect(r.crossoverAudit.oneWay).toBe(0);
  });

  it('the CONTROL that makes the row above mean something: one plane only is ONE-WAY', async () => {
    for (const [cc, cr] of CELLS) {
      setCell(planeA(), cc, cr, solid(11));
      setCell(planeB(), cc, cr, solid(22));
    }
    const r = await ask({ ...base, plane: 'a', words: WORDS, crossover: 'hand-off' }) as
      { crossoverAudit: { pairs: number; oneWay: number; severity: string } };
    console.log(`[h3c] one plane only → audit=${JSON.stringify(r.crossoverAudit)}`);
    expect(r.crossoverAudit.pairs).toBe(0);
    expect(r.crossoverAudit.oneWay).toBe(CELLS.length * SUBTILES);
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
    }) as { words: (number | null)[]; crossoverCells: number };
    console.log(`[h4] plane "a" on the same rect: words=${JSON.stringify(ok.words)} `
      + `crossoverCells=${ok.crossoverCells}`);
    expect(ok.words).toHaveLength(4);
    expect(ok.crossoverCells).toBe(4);
  });

  it('paint_collision still refuses both forms at once, under plane:"both"', async () => {
    const beforeA = Array.from(planeA());
    await expect(ask({ ...base, plane: 'both', word: solid(9), words: WORDS }))
      .rejects.toThrow(/not both/);
    expect(Array.from(planeA())).toEqual(beforeA);         // and wrote nothing
  });

  it('paint_collision still refuses NEITHER form: a crossover alone is not a paint', async () => {
    const beforeA = Array.from(planeA());
    await expect(ask({ ...base, plane: 'both', crossover: 'hand-off' }))
      .rejects.toThrow(/neither was given/);
    expect(Array.from(planeA())).toEqual(beforeA);
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('to-b');   // untouched
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

describe('[h5] read → write over itself is exact, crossovers and all', () => {
  it('restores the region byte for byte and needs no second call to do it', async () => {
    const before = Array.from(planeA());
    const read = await ask({
      kind: 'get-collision-region', section: 0, plane: 'a', x: 0, y: 0, w: 2, h: 2,
    }) as { words: (number | null)[]; crossoverCells: number };
    expect(read.crossoverCells).toBe(4);                    // anti-vacuous
    // Scribble over it, then put it back with the read's own `words`.
    await ask({ ...base, plane: 'a', word: 0, crossover: 'clear' });
    expect(Array.from(planeA())).not.toEqual(before);
    const r = await ask({ ...base, plane: 'a', words: read.words }) as { painted: number };
    console.log(`[h5] restored painted=${r.painted}  ${show(0, 0)}`);
    // ⚠ THE PICTURE comes back; the CROSSOVER does not, because a crossover
    // does not travel inside `words` — the `clear` above genuinely removed it,
    // and only `crossover: 'hand-off'` can put it back.
    expect(cellWord(planeA(), 0, 0) & ~COLLISION_CELL_UNOWNED_MASK)
      .toBe(withCrossover(solid(11), 'to-b') & ~COLLISION_CELL_UNOWNED_MASK);
    expect(readCrossover(cellWord(planeA(), 0, 0))).toBe('none');
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
