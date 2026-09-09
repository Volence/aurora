// PAINT-PLANE-NO-BACKSTOP — the collision WRITE trusted its schema alone for
// which plane to paint, while the READ beside it has a handler-side validator
// and a docblock arguing for one "for any road that reaches the handler without
// passing this schema".
//
// THE ASYMMETRY IS THE FINDING, so this file measures BOTH sides on the same
// off-schema value rather than asserting the read's half from its comment: a bad
// read shows you something wrong, a bad write CHANGES YOUR DATA, and the
// unguarded one was the second.
//
// WHAT THE OFF-SCHEMA ROAD IS, MEASURED RATHER THAN ASSUMED. Every production
// road into `handleAgentRequest` runs the same zod registry: main/mcp-server.ts
// registers each EDITOR_METHODS entry's `params` as an MCP tool inputSchema (the
// SDK parses arguments and throws InvalidParams before the callback), and
// main/aether/adapter.ts safeParses `z.object(m.params)` per method before
// forwarding. So `plane: "c"` cannot arrive over /mcp or /aether TODAY, and this
// is a backstop rather than a live-bug fix. It is worth having anyway, and the
// tests are worth having for the same reason the read's are:
//   • `handleAgentRequest` is exported and called directly by 14 test files and
//     by anything that becomes a third road (a devtools hook, an in-app agent
//     panel, a replay of a recorded envelope);
//   • the `aimedId: 'a' | 'b'` annotation on the ternary was a TYPE ASSERTION
//     over a runtime value tsc never sees, and the value it produced for an
//     off-schema plane was a silent, destructive paint of plane A — a write
//     aimed at a plane the caller did not name.
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
// DERIVED from the helper the store routes commands with, never typed: a literal
// could drift from where the command actually lands and the row would silently
// stop measuring the stack it means to.
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

const ask = (req: unknown) => handleAgentRequest(req as AgentRequest);
const act = () => useProjectStore.getState().project!.zones[0].acts[0];
const sec = () => act().sections[0] as Section;
const planeA = () => sec().collisionEdit as Uint16Array;
const planeB = () => sec().collisionEditB as Uint16Array;

function setCell(plane: Uint16Array, cc: number, cr: number, word: number): void {
  for (const i of cellTileIndices(cc, cr, SECTION_TILES_WIDE)) plane[i] = word;
}

/** Seeded DIFFERENTLY per plane, so "nothing moved" is a real reading and not
 *  two identical zero arrays agreeing with each other. */
const SEED_A = solid(11);
const SEED_B = solid(22);

function open(): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
  setCell(planeA(), 0, 0, SEED_A);
  setCell(planeB(), 0, 0, SEED_B);
}

const LEVEL_DOC = levelDocId('ojz', 'act1');

const base = { kind: 'paint-collision' as const, section: 0, x: 0, y: 0, w: 1, h: 1, word: solid(5) };
const readBase = { kind: 'get-collision-region' as const, section: 0, x: 0, y: 0, w: 1, h: 1 };

/** The full plane, so a stray write ANYWHERE (not just the aimed cell) shows. */
const snapshot = () => ({ a: Array.from(planeA()), b: Array.from(planeB()) });

beforeEach(open);

/** Every value a caller could send that the schema's enum would have refused.
 *  `'A'` is the realistic one — a caller that upper-cased a plane id — and
 *  `undefined` is what an omitted field arrives as on a road with no schema. */
const OFF_SCHEMA: [string, unknown][] = [
  ['a wrong letter', 'c'],
  ['the right letter, wrong case', 'A'],
  ['a number', 1],
  ['an omitted field', undefined],
  ['null', null],
  ['the read tool\'s spelling of both', 'BOTH'],
];

describe('paint_collision: an off-schema plane is refused, not painted onto plane A', () => {
  it('the fixture is anti-vacuous: the two planes differ, and a LEGAL paint moves one', async () => {
    // Without this row, "the planes are unchanged" could pass over a request
    // that was never able to write anything at all.
    expect(planeA()[0]).not.toBe(planeB()[0]);
    const before = snapshot();
    const r = await ask({ ...base, plane: 'a' }) as { painted: number };
    expect(r.painted).toBeGreaterThan(0);
    expect(Array.from(planeA())).not.toEqual(before.a);
    expect(Array.from(planeB())).toEqual(before.b);
    // The control for the `has(LEVEL_DOC)` assertion in the refusal rows: a
    // write that DOES happen creates the stack, so its absence there means
    // something.
    expect(documentHistoryHub.has(LEVEL_DOC)).toBe(true);
  });

  it.each(OFF_SCHEMA)('refuses %s and leaves BOTH planes byte-identical', async (_label, plane) => {
    const before = snapshot();
    await expect(ask({ ...base, plane })).rejects.toThrow(/plane must be "a", "b" or "both"/);
    // THE POINT OF THE ROW. Before the backstop, `req.plane === 'both' ? 'a' :
    // req.plane` handed the ternary below an off-schema value, `aimedId === 'b'`
    // was false, and the paint landed on plane A — a destructive edit aimed at a
    // plane the caller did not name.
    expect(Array.from(planeA())).toEqual(before.a);
    expect(Array.from(planeB())).toEqual(before.b);
    // And no undo step was pushed for a write that did not happen. `has` rather
    // than `canUndo`: the hub creates a stack the moment `historyFor` is called,
    // so "there is no stack for this document at all" is the stronger reading —
    // and asking `historyFor` here would MANUFACTURE the thing being measured.
    expect(documentHistoryHub.has(LEVEL_DOC)).toBe(false);
  });

  it('the refusal names all three legal values, because "both" is legal HERE and not on the read',
    async () => {
      const why = await ask({ ...base, plane: 'c' }).then(() => '', (e: Error) => e.message);
      expect(why).toContain('"a"');
      expect(why).toContain('"b"');
      expect(why).toContain('"both"');
      expect(why).toContain('"c"');   // what was actually sent, quoted back
    });

  it.each(['a', 'b', 'both'] as const)('still paints plane %s', async (plane) => {
    const before = snapshot();
    const r = await ask({ ...base, plane }) as { painted: number; paintedOther: number };
    expect(r.painted).toBeGreaterThan(0);
    const movedA = !Array.from(planeA()).every((w, i) => w === before.a[i]);
    const movedB = !Array.from(planeB()).every((w, i) => w === before.b[i]);
    expect([movedA, movedB]).toEqual(plane === 'a' ? [true, false]
      : plane === 'b' ? [false, true] : [true, true]);
  });
});

// THE READ HALF — measured, not quoted from its own docblock. The row this file
// closes said the read "has a backstop"; that claim is only worth acting on if
// it is true, and a reader comparing the two sides later needs both readings in
// one place.
describe('get_collision_region: the read twin refuses the same values', () => {
  it.each(OFF_SCHEMA)('refuses %s', async (_label, plane) => {
    await expect(ask({ ...readBase, plane })).rejects.toThrow(/plane must be "a" or "b"/);
  });

  it('and refuses "both" IN PROSE: the asymmetry the read argues for at length', async () => {
    const why = await ask({ ...readBase, plane: 'both' }).then(() => '', (e: Error) => e.message);
    expect(why).toMatch(/reads ONE plane/);
    expect(why).toMatch(/Call it twice/);
  });

  it('CONTROL: "a" and "b" read fine, so the rows above are not refusing everything', async () => {
    for (const plane of ['a', 'b'] as const) {
      const r = await ask({ ...readBase, plane }) as { plane: string; words: (number | null)[] };
      expect(r.plane).toBe(plane);
      expect(r.words).toHaveLength(1);
    }
  });
});
