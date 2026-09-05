// ROADMAP row 91, seam 1 — THE BRUSH SITES BREAK CHUNK LINKS.
//
// `withLinkBreaks` was wired at the two CORE call sites (paste, region-flip) by
// phase 1 and NOT at the sites that dispatch a raw `set-tiles` from a brush.
// This file covers the one of those three that is reachable without a canvas:
// the agent handler's `paint-region`. The two MapViewport sites (the tile-stroke
// commit in `endPaintStroke` and the `paint-block` click) are a rendered surface
// with a mouse gesture, so they are proved in
// scratchpad/chunk-links-harness.mjs and NOT here — a node row cannot see them.
//
// WHY IT MATTERS AND WHY IT LOOKED HARMLESS. A tile that keeps a link it should
// have lost is invisible until a chunk is edited: propagation then writes the
// library's art back over the paint. Phase 1 landed with no caller of
// `buildActPropagationCommand` in src/, so the gap was latent; this commit
// closes it BEFORE the propagation commit that would make it bite.
//
// ANTI-VACUOUS. Every row below asserts the link EXISTED before the paint (the
// stamp really recorded a placement) and that the paint really landed (the
// nametable word changed). A "the link is gone" claim against a section that
// never had one is a coin that lands heads.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import {
  createSection, createChunkDef, packNametableWord, SECTION_TILES_WIDE,
} from '../../../core/model/s4-types';
import type { ChunkDef, Color, Section } from '../../../core/model/s4-types';
import { chunkOriginAt, placementsOfChunk } from '../../../core/editing/chunk-links';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
const tile = () => ({ pixels: new Uint8Array(64) });

let section: Section;
let chunk: ChunkDef;

/** A 4x4-tile chunk carrying REAL art in every cell — an all-air chunk would
 *  make "the stamp wrote something" unfalsifiable. */
function fixtureChunk(): ChunkDef {
  const c = createChunkDef('chunk-a', 'Chunk A', 4, 4);
  for (let i = 0; i < c.nametable.length; i++) {
    c.nametable[i] = packNametableWord(1 + (i % 6), 0, false, false, false);
  }
  return c;
}

function fakeProject(): never {
  section = createSection(0, 'sec0');
  chunk = fixtureChunk();
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: Array.from({ length: 16 }, tile) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [section] }],
    }],
    chunkLibrary: [chunk],
    bgLibrary: [],
  } as never;
}

const idx = (col: number, row: number) => row * SECTION_TILES_WIDE + col;
const live = () => useProjectStore.getState().project!.zones[0].acts[0].sections[0]!;
const wordAt = (col: number, row: number) => live().tileGrid.nametable[idx(col, row)];
const originAt = (col: number, row: number) => chunkOriginAt(live(), idx(col, row));

beforeEach(() => {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useSessionStore.setState({ activeId: 'tool:project-setup' });
  useProjectStore.setState({ project: fakeProject() });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
});

/** Stamp the fixture chunk at (0,0) through the REAL agent path, then assert the
 *  identity layer actually recorded it. Returns the placement id. */
async function stampAtOrigin(): Promise<number> {
  await handleAgentRequest({
    kind: 'stamp-chunk', chunkId: 'chunk-a', section: 0, x: 0, y: 0,
  } as never);
  const placements = placementsOfChunk(live().chunkLinks, 'chunk-a');
  expect(placements.length).toBe(1);              // the fixture landed
  return placements[0].id;
}

describe('paint-region breaks the chunk link of every tile it rewrites (d-18c)', () => {
  it('the fixture really links the whole footprint before anything paints over it', async () => {
    const id = await stampAtOrigin();
    for (let r = 0; r < chunk.heightTiles; r++) {
      for (let c = 0; c < chunk.widthTiles; c++) {
        expect(originAt(c, r)?.id).toBe(id);
      }
    }
    // …and the art is real, so "the paint changed the word" below discriminates.
    expect(wordAt(0, 0)).not.toBe(0);
  });

  it('a painted tile stops tracking its chunk; its untouched neighbours do not', async () => {
    const id = await stampAtOrigin();
    const before = wordAt(1, 1);

    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 1, y: 1, w: 1, h: 1,
      entries: [{ tile: 9, pal: 2 }],
    } as never);

    expect(wordAt(1, 1)).not.toBe(before);        // the paint really happened
    expect(originAt(1, 1)).toBeNull();            // …and the link is gone
    expect(originAt(0, 0)?.id).toBe(id);          // the rest of the stamp survives
    expect(originAt(3, 3)?.id).toBe(id);
  });

  it('painting over the WHOLE placement drops the record, so "find every copy" reports none', async () => {
    await stampAtOrigin();
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 0, y: 0,
      w: chunk.widthTiles, h: chunk.heightTiles,
      entries: Array.from({ length: chunk.widthTiles * chunk.heightTiles },
        () => ({ tile: 9, pal: 2 })),
    } as never);

    expect(placementsOfChunk(live().chunkLinks, 'chunk-a')).toEqual([]);
    expect(originAt(2, 2)).toBeNull();
  });

  it('the link break is UNDOABLE with the paint it belongs to: one step, both halves', async () => {
    const id = await stampAtOrigin();
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 1, y: 1, w: 1, h: 1,
      entries: [{ tile: 9, pal: 2 }],
    } as never);
    expect(originAt(1, 1)).toBeNull();

    const stack = documentHistoryHub.historyFor('level:ojz:act1');
    expect(stack).toBeTruthy();
    stack!.undo();

    // ONE undo brings back BOTH the word and the link. If the link child were
    // dispatched as a separate command this would take two.
    expect(originAt(1, 1)?.id).toBe(id);
  });

  it('the DETACHED stamp records no placement, and it is opt-in', async () => {
    // The wire form of the checkbox. `detach` absent must mean KEEP — the two
    // surfaces (this and the panel's unchecked box) have to agree about what a
    // plain stamp means, and the ruling's default is remember.
    await handleAgentRequest({
      kind: 'stamp-chunk', chunkId: 'chunk-a', section: 0, x: 0, y: 0, detach: true,
    } as never);

    // The ART still landed — otherwise "no placement" would be true of a stamp
    // that did nothing at all.
    expect(wordAt(0, 0)).toBe(chunk.nametable[0]);
    expect(wordAt(0, 0)).not.toBe(0);
    expect(placementsOfChunk(live().chunkLinks, 'chunk-a')).toEqual([]);
    expect(originAt(0, 0)).toBeNull();
  });

  it('a DETACHED stamp CLEARS the links of the placement it lands on top of', async () => {
    // Not the same as "records nothing": the tiles genuinely no longer come
    // from the old chunk, and a surviving link would have the next propagation
    // overwrite this stamp.
    const id = await stampAtOrigin();
    expect(originAt(1, 1)?.id).toBe(id);

    await handleAgentRequest({
      kind: 'stamp-chunk', chunkId: 'chunk-a', section: 0, x: 0, y: 0, detach: true,
    } as never);

    expect(originAt(1, 1)).toBeNull();
    expect(placementsOfChunk(live().chunkLinks, 'chunk-a')).toEqual([]);
  });

  it('a paint on a section with NO identity layer is left exactly as it was', async () => {
    // The common path, and the reason `withLinkBreaks` returns its input
    // unchanged rather than wrapping everything in a batch.
    const before = wordAt(5, 5);
    await handleAgentRequest({
      kind: 'paint-region', section: 0, x: 5, y: 5, w: 1, h: 1,
      entries: [{ tile: 9, pal: 2 }],
    } as never);
    expect(wordAt(5, 5)).not.toBe(before);
    expect(live().chunkLinks).toBeUndefined();
  });
});
