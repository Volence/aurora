// ROADMAP O12 — the agent's `paint_region` must not flatten authored priority.
//
// `NametableEntrySpec.pri` is optional. The handler read the destination word
// into `oldNt` and then threw it away: `packNametableWord(spec.tile, spec.pal,
// !!spec.pri, …)` turned an OMITTED field into an authored `false`, so an agent
// bulk-painting over authored art cleared every priority bit it covered.
//
// WHAT THESE ROWS CAN AND CANNOT SEE. This drives `handleAgentRequest` directly:
// it covers the handler and the decider, and it does NOT cross zod, the Electron
// IPC bridge, or the Aether adapter. That crossing is what the CDP harness
// scratchpad/tile-attribute-harness.mjs ([w*] rows) exists for, and it is where
// an "optional field becomes false somewhere on the wire" bug would live. Both
// halves are required; neither substitutes for the other.
//
// ANTI-VACUOUS. Every preservation row paints onto a destination whose priority
// bit is already SET, asserts that it was set before painting, and asserts that
// the armed tile index actually landed — a preservation claim against a zero
// cell, or against a paint that never happened, is a coin that lands heads.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import {
  createSection, packNametableWord, unpackNametableWord, SECTION_TILES_WIDE,
} from '../../../core/model/s4-types';
import type { Color, Section } from '../../../core/model/s4-types';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
const tile = () => ({ pixels: new Uint8Array(64) });

let section: Section;

/** One zone, one act, ONE REAL SECTION, and a tileset big enough to index. */
function fakeProject(): never {
  section = createSection(0, 'sec0');
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: Array.from({ length: 16 }, tile) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section] }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
  } as never;
}

const idx = (col: number, row: number) => row * SECTION_TILES_WIDE + col;
const wordAt = (col: number, row: number) =>
  useProjectStore.getState().project!.zones[0].acts[0].sections[0]!.tileGrid.nametable[idx(col, row)];

/** A destination with EVERY attribute bit set — the only kind a preservation
 *  claim can be made against. Written straight into the document, so it is what
 *  an author's cell looks like, not something the tool under test produced. */
const LOADED = packNametableWord(9, 2, true, true, true);
const BARE = packNametableWord(9, 2, false, false, false);

function seed(col: number, row: number, word: number) {
  section.tileGrid.nametable[idx(col, row)] = word;
}

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.setState({ activeId: 'tool:project-setup' });
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
});

describe('paint_region is a DECIDER: an omitted pri keeps the cell\'s depth', () => {
  it('the fixture really carries the bits every row below claims to preserve', () => {
    expect(unpackNametableWord(LOADED).priority).toBe(true);
    expect(unpackNametableWord(LOADED).hFlip).toBe(true);
    expect(unpackNametableWord(LOADED).vFlip).toBe(true);
    expect(unpackNametableWord(BARE).priority).toBe(false);
  });

  it('an OMITTED pri PRESERVES a set priority bit while changing the tile', async () => {
    seed(3, 4, LOADED);
    expect(unpackNametableWord(wordAt(3, 4)).priority).toBe(true);

    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1 }],
    } as never);

    const after = unpackNametableWord(wordAt(3, 4));
    expect(after.tileIndex).toBe(5);      // the paint really happened
    expect(after.palette).toBe(1);
    expect(after.priority).toBe(true);    // …and the depth survived it
  });

  it('an OMITTED pri does NOT invent priority on a cell that had none', async () => {
    seed(3, 4, BARE);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1 }],
    } as never);
    const after = unpackNametableWord(wordAt(3, 4));
    expect(after.tileIndex).toBe(5);
    expect(after.priority).toBe(false);
  });

  it('pri:false CLEARS a set bit: the discriminator that keeps "keep" honest', async () => {
    seed(3, 4, LOADED);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1, pri: false }],
    } as never);
    const after = unpackNametableWord(wordAt(3, 4));
    expect(after.tileIndex).toBe(5);
    expect(after.priority).toBe(false);
  });

  it('pri:true SETS it on a cell that had none', async () => {
    seed(3, 4, BARE);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1, pri: true }],
    } as never);
    expect(unpackNametableWord(wordAt(3, 4)).priority).toBe(true);
  });

  it('a BULK region decides PER CELL, not once for the rectangle', async () => {
    // The reported shape of the bug: an agent paints a big rectangle over art
    // whose priority is patchy. A rule applied once for the whole request would
    // pass a 1x1 row and fail here.
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) seed(c, r, (c + r) % 2 === 0 ? LOADED : BARE);
    }
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 0, y: 0, w: 3, h: 2,
      entries: Array.from({ length: 6 }, () => ({ tile: 7, pal: 0 })),
    } as never);

    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const after = unpackNametableWord(wordAt(c, r));
        expect(after.tileIndex).toBe(7);
        expect(after.priority).toBe((c + r) % 2 === 0);
      }
    }
  });

  it('the FLIPS still follow the request, and that is the rule: not a second defect', async () => {
    // Under "the brush owns the picture", an entry naming a tile and no flip has
    // named an UNFLIPPED picture. This row reddens if someone makes hf/vf
    // tri-state to match pri.
    seed(3, 4, LOADED);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1 }],
    } as never);
    const after = unpackNametableWord(wordAt(3, 4));
    expect(after.hFlip).toBe(false);
    expect(after.vFlip).toBe(false);
  });

  it('an explicit hf/vf lands', async () => {
    seed(3, 4, BARE);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1, hf: true, vf: true }],
    } as never);
    const after = unpackNametableWord(wordAt(3, 4));
    expect(after.hFlip).toBe(true);
    expect(after.vFlip).toBe(true);
  });

  it('undo restores the whole word, priority included (oldNt is captured whole)', async () => {
    seed(3, 4, LOADED);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 3, y: 4, w: 1, h: 1,
      entries: [{ tile: 5, pal: 1, pri: false }],
    } as never);
    expect(wordAt(3, 4)).not.toBe(LOADED);
    const hist = documentHistoryHub.historyFor('level:ojz:act1');
    expect(hist.canUndo).toBe(true);
    hist.undo();
    expect(wordAt(3, 4)).toBe(LOADED);
  });
});

describe('save_chunk is a CREATOR: an omitted pri means no priority', () => {
  it('createChunkDef hands back a zeroed nametable: the classification, verified', async () => {
    // The whole reason save_chunk keeps omitted-means-off: it has no
    // destination. If this stops being true, the verdict has to be revisited.
    const res = await handleAgentRequest({
      kind: 'save-chunk', name: 'o12', w: 2, h: 2,
      entries: Array.from({ length: 4 }, () => ({ tile: 3, pal: 1 })),
    } as never) as { id: string };

    const chunk = useProjectStore.getState().project!.chunkLibrary.find(c => c.id === res.id)!;
    expect(chunk).toBeTruthy();
    for (const w of chunk.nametable) {
      const e = unpackNametableWord(w);
      expect(e.tileIndex).toBe(3);
      expect(e.priority).toBe(false);
      expect(e.hFlip).toBe(false);
      expect(e.vFlip).toBe(false);
    }
  });

  it('an explicit pri:true still authors priority into a new chunk', async () => {
    const res = await handleAgentRequest({
      kind: 'save-chunk', name: 'o12b', w: 2, h: 2,
      entries: Array.from({ length: 4 }, (_, i) => ({ tile: 3, pal: 1, pri: i === 0 })),
    } as never) as { id: string };
    const chunk = useProjectStore.getState().project!.chunkLibrary.find(c => c.id === res.id)!;
    expect(unpackNametableWord(chunk.nametable[0]).priority).toBe(true);
    expect(unpackNametableWord(chunk.nametable[1]).priority).toBe(false);
  });
});
