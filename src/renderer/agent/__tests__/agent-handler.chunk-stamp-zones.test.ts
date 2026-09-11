// CHUNK-STAMP-ACROSS-ZONES, THE AGENT DOOR. KNOWN, AND BLOCKED.
// (docs/reviews/2026-09-11-chunk-stamp-across-zones.md)
//
// `stamp_chunk` (src/main/editor-methods.ts) reads the same project-wide chunk
// library the map's stamp tool does, and writes into the OPEN act. `save_chunk`
// validates its entries against the OPEN zone's tile set ("Chunk nametables
// index into the unified zone tileset", agent-handler.ts), and records nothing
// about which zone that was. So in a project with two zones, a chunk an agent
// saved in zone A is stamped into zone B as zone A's tile numbers, which are
// other pictures in zone B's tile set.
//
// NOT REFUSED, for the reason the packet gives: there is no honest identity to
// refuse on. The first row PINS today's write, so a fix has to turn it into a
// refusal row on purpose. The second row is the control any fix must keep: a
// stamp inside the zone the chunk was saved in lands. The same pair, for the
// map's stamp tool, is in
// src/renderer/components/__tests__/map-viewport-mounted.test.ts.
//
// Both the save and the stamp go through `handleAgentRequest`, the door an MCP
// call reaches. Nothing is hand-built except the project.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import {
  createSection, packNametableWord, unpackNametableWord, SECTION_TILES_WIDE,
} from '../../../core/model/s4-types';
import type { ChunkDef, Color, Zone } from '../../../core/model/s4-types';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

const TILES = 8;
/** Tile i is solid colour pick(i). Zone ojz is i and zone mgz is 15 - i, which
 *  differ at every index because 15 is odd. */
const tilesOf = (pick: (i: number) => number) =>
  Array.from({ length: TILES }, (_, i) => ({ pixels: new Uint8Array(64).fill(pick(i)) }));

/** The tile numbers the agent saves, one 16px block of them. */
const SAVED = [1, 2, 3, 4];
const W = 2, H = 2;
/** The words `save_chunk` must mint for SAVED: line 0, unflipped, and no
 *  priority, which is what an omitted "pri" means for a freshly created chunk. */
const SAVED_WORDS = SAVED.map((t) => packNametableWord(t, 0, false, false, false));
/** Where every stamp lands: even, as `stamp_chunk` requires, and off the origin
 *  so a stamp is a visible change over the section's zero fill. */
const AT = { x: 8, y: 4 };

function act(id: string) {
  return { id, name: id, gridWidth: 1, gridHeight: 1, sections: [createSection(0, 'sec0')] };
}

function fakeProject(): never {
  return {
    zones: [
      {
        id: 'ojz', name: 'OJZ', tileset: { tiles: tilesOf((i) => i) },
        palette: { lines: [line(), line(), line(), line()] },
        acts: [act('act1'), act('act2')],
      },
      {
        id: 'mgz', name: 'MGZ', tileset: { tiles: tilesOf((i) => 15 - i) },
        palette: { lines: [line(), line(), line(), line()] },
        acts: [act('act1')],
      },
    ],
    chunkLibrary: [],
    bgLibrary: [],
  } as never;
}

function zone(id: string): Zone {
  const z = useProjectStore.getState().project?.zones.find((x) => x.id === id);
  if (!z) throw new Error(`chunk-stamp-zones: no zone ${id}; the fixture moved`);
  return z;
}

/** The W x H words at AT in one act's section 0, row-major like SAVED_WORDS. */
function wordsAt(zoneId: string, actId: string): number[] {
  const sec = zone(zoneId).acts.find((a) => a.id === actId)?.sections[0];
  if (!sec) throw new Error(`chunk-stamp-zones: no section 0 in ${zoneId}/${actId}; the fixture moved`);
  const out: number[] = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) out.push(sec.tileGrid.nametable[(AT.y + r) * SECTION_TILES_WIDE + AT.x + c]);
  }
  return out;
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.setState({ activeId: 'tool:project-setup' });
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
});

/** `save_chunk` with ojz/act1 open. Returns the library chunk, premises asserted. */
async function saveInOjz(): Promise<ChunkDef> {
  const reply = await handleAgentRequest({
    kind: 'save-chunk', name: 'Saved in OJZ', w: W, h: H,
    entries: SAVED.map((tile) => ({ tile, pal: 0 })),
  } as never) as { id: string };
  const chunk = useProjectStore.getState().project?.chunkLibrary.find((c) => c.id === reply.id);
  if (!chunk) throw new Error('chunk-stamp-zones: save_chunk put nothing in the library');
  expect([...chunk.nametable], 'the premise: the chunk holds ojz tile numbers 1 to 4').toEqual(SAVED_WORDS);
  return chunk;
}

async function stamp(chunkId: string): Promise<{ stamped: boolean }> {
  return await handleAgentRequest({
    kind: 'stamp-chunk', chunkId, section: 0, x: AT.x, y: AT.y,
  } as never) as { stamped: boolean };
}

describe('stamp_chunk of a chunk saved in one zone, into another (KNOWN, BLOCKED: CHUNK-STAMP-ACROSS-ZONES)', () => {
  it('PINNED AS FOUND: the agent stamps zone A\'s tile numbers into zone B, and the reply calls it a success', async () => {
    const chunk = await saveInOjz();
    // ANTI-VACUOUS: every saved word names a tile that is a different picture
    // in mgz, so a stamp there visibly puts other tiles down.
    for (const w of chunk.nametable) {
      const t = unpackNametableWord(w).tileIndex;
      expect(t, 'a saved word names a tile outside both fixture tile sets').toBeLessThan(TILES);
      expect([...zone('mgz').tileset.tiles[t].pixels], `tile ${t} is the same picture in both zones`)
        .not.toEqual([...zone('ojz').tileset.tiles[t].pixels]);
    }
    useProjectStore.getState().setCurrentAct('mgz', 'act1');
    expect(wordsAt('mgz', 'act1'), 'ANTI-VACUOUS: the target already holds the chunk').not.toEqual(SAVED_WORDS);
    const reply = await stamp(chunk.id);
    // THE DEFECT, PINNED. ojz tile numbers, written into mgz. A fix that refuses
    // this stamp must replace this row with a refusal row (nothing written, an
    // error naming the reason), not delete it.
    expect(wordsAt('mgz', 'act1'),
      'the cross-zone stamp no longer writes the chunk: if that is a fix, turn this row into a refusal row')
      .toEqual(SAVED_WORDS);
    expect(reply.stamped, 'the reply no longer reports success: update this pin with the fix').toBe(true);
  });

  it('CONTROL: in the zone the chunk was saved in, another act takes the stamp', async () => {
    const chunk = await saveInOjz();
    useProjectStore.getState().setCurrentAct('ojz', 'act2');
    expect(wordsAt('ojz', 'act2'), 'ANTI-VACUOUS: the target already holds the chunk').not.toEqual(SAVED_WORDS);
    const reply = await stamp(chunk.id);
    expect(wordsAt('ojz', 'act2'), 'a stamp inside the chunk\'s own zone did not land').toEqual(SAVED_WORDS);
    expect(reply.stamped, 'a stamp inside the chunk\'s own zone did not report success').toBe(true);
  });
});
