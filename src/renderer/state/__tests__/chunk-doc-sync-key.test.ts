// WHEN THE COMPOSER MAY REBUILD A CHUNK DOCUMENT FROM ITS LIBRARY CHUNK.
//
// `syncChunkDocFromLibrary` (owner ruling d-37) rebuilds the open document from
// the chunk it edits whenever the two disagree — and it CANNOT TELL the two
// reasons they might disagree apart: the library moved (an undo of a chunk step,
// the case it exists for) or the document moved (a gesture not yet committed).
// So the whole safety of it is WHEN it is asked, which is `chunkDocSyncKey` —
// the key `ComposerCanvas` hands its effect.
//
// THE DEFECT THESE ROWS GUARD (docs/reviews/2026-09-12-chunklinks-row9-regression.md):
// the key was `[historyVersion, open]`, and `markOpenDirty()` REPLACES `open` to
// flip one boolean. A tile stamp writes the document in `applyTileCell` and
// commits at `up` in `endTileGesture`, one React commit later — so the effect ran
// in between and threw the stamp away. Save then wrote the unchanged document
// back and propagated nothing into the section tiles linked to that chunk, which
// is what the CDP rig `harness:chunk-links` row 9 measured and what no node row
// could see.
//
// WHAT THESE ROWS CANNOT HOLD, stated so they are not read as more than they
// are: node cannot mount `ComposerCanvas`, so nothing here proves React calls
// this key, that `applyTileCell` is what marks the document dirty, or that the
// commit really happens at `up`. Row K0 reads the component SOURCE for the one
// call site, which catches its deletion and nothing subtler; the delivery stays
// harness-only.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkDocSyncKey, syncChunkDocFromLibrary } from '../chunk-doc-commit';
import { useArtStore } from '../artStore';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { useToastStore } from '../toastStore';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';
import { docFromChunk, stampTile, cellAt } from '../../../core/art/composer-buffer';
import {
  createChunkDef, createSection, packNametableWord,
} from '../../../core/model/s4-types';
import type { ChunkDef, Color, Tile } from '../../../core/model/s4-types';

const ZONE = 'ojz';
const ACT = 'act1';
const TAB = `level:${ZONE}:${ACT}`;
const CHUNK = 'ck';
const CHUNK_W = 4;
const CHUNK_H = 4;

/** The cell the rows stamp, and the atlas tile they arm. Both distinct from what
 *  the fixture chunk holds there, so "the stamp landed" is measurable. */
const EDIT_CX = 3;
const EDIT_CY = 0;
const BRUSH_TILE = 3;

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

function makeTiles(n: number): Tile[] {
  return Array.from({ length: n }, (_unused, i) => ({
    pixels: new Uint8Array(64).fill(i & 0xF),
  }));
}

function fixtureChunk(): ChunkDef {
  const chunk = createChunkDef(CHUNK, 'Chunk', CHUNK_W, CHUNK_H);
  for (let i = 0; i < chunk.nametable.length; i++) {
    chunk.nametable[i] = packNametableWord(1, 0, false, false, false);
  }
  return chunk;
}

function fixtureProject(): never {
  return {
    zones: [{
      id: ZONE,
      name: 'OJZ',
      tileset: { tiles: makeTiles(8) },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: ACT, name: 'act1', gridWidth: 1, gridHeight: 1,
        sections: [createSection(0, 'sec0')],
      }],
    }],
    chunkLibrary: [fixtureChunk()],
    bgLibrary: [],
  } as never;
}

const pstate = () => useProjectStore.getState();
const liveChunk = () => pstate().project!.chunkLibrary.find((c) => c.id === CHUNK)!;
const openDoc = () => useArtStore.getState().open!.doc;

function setUp(): void {
  documentHistoryHub.clearAll();
  documentHistoryHub.clearFactories();
  registerHistoryFactories();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useProjectStore.setState({ project: fixtureProject() });
  useProjectStore.getState().setCurrentAct(ZONE, ACT);
  useSessionStore.setState({
    tabs: [{ id: TAB, kind: 'level', title: 'OJZ act1' }], activeId: TAB,
  });
  useWorkspaceStore.getState().setFacet(TAB, 'art');
  useArtStore.getState().openDocument({
    doc: docFromChunk(liveChunk()), liveTileIndex: null, chunkId: CHUNK,
    name: 'Chunk', dirty: false,
  });
}

beforeEach(setUp);

/** The doc-local half of a tile stamp, exactly as `ComposerCanvas.applyTileCell`
 *  writes it — and NOT committed, which is the state the rows are about: a
 *  tile-space gesture commits at `up`, in `endTileGesture`. */
function stampWithoutCommitting(): void {
  stampTile(openDoc(), EDIT_CX, EDIT_CY, {
    tile: BRUSH_TILE, pal: 0, hf: false, vf: false, pri: 'keep',
  });
  useArtStore.getState().markOpenDirty();
}

const stampedTile = () => cellAt(openDoc(), EDIT_CX, EDIT_CY).atlasTile;

describe('the key that decides when a chunk document may be rebuilt from its chunk', () => {
  it('[K0] ComposerCanvas asks `syncChunkDocFromLibrary` through this key and no other', () => {
    // SOURCE, not behaviour: node cannot mount the component. This catches the
    // call site being deleted or re-keyed, which is exactly how the defect
    // arrived, and nothing subtler.
    const src = readFileSync(
      join(process.cwd(), 'src/renderer/components/art/ComposerCanvas.tsx'), 'utf8');
    const calls = src.match(/syncChunkDocFromLibrary\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(src).toContain(
      'useEffect(() => { syncChunkDocFromLibrary(); }, chunkDocSyncKey(historyVersion, open));');
  });

  it('[K1] marking the open document dirty does NOT change the key', () => {
    const openBefore = useArtStore.getState().open!;
    const before = chunkDocSyncKey(7, openBefore);
    stampWithoutCommitting();
    const openAfter = useArtStore.getState().open!;
    const after = chunkDocSyncKey(7, openAfter);
    // The wrapper really WAS replaced — otherwise this row would pass for the
    // wrong reason, and the defect it guards lived in exactly that replacement.
    expect(openAfter).not.toBe(openBefore);
    expect(openAfter.dirty).toBe(true);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) expect(after[i]).toBe(before[i]);
  });

  it('[K2] ...and it is not inert: opening a different document DOES change it', () => {
    const before = chunkDocSyncKey(7, useArtStore.getState().open);
    useArtStore.getState().openDocument({
      doc: docFromChunk(liveChunk()), liveTileIndex: null, chunkId: CHUNK,
      name: 'Chunk again', dirty: false,
    });
    const after = chunkDocSyncKey(7, useArtStore.getState().open);
    expect(after[1]).not.toBe(before[1]);
  });

  it('[K3] ...and a history tick changes it, which is the case the sync exists for', () => {
    const open = useArtStore.getState().open;
    expect(chunkDocSyncKey(8, open)[0]).not.toBe(chunkDocSyncKey(7, open)[0]);
  });

  it('[H1] THE HAZARD K1 PREVENTS: asked mid-gesture, the sync DESTROYS the stamp', () => {
    // Not a regression guard — it passes on both sides of the fix. It is the
    // statement of what K1 is protecting, so K1 cannot be deleted as harmless.
    stampWithoutCommitting();
    expect(stampedTile()).toBe(BRUSH_TILE);
    syncChunkDocFromLibrary();
    expect(stampedTile()).not.toBe(BRUSH_TILE);
    expect(stampedTile()).toBe(
      // ...back to whatever the LIBRARY chunk says, which is the rebuild.
      cellAt(docFromChunk(liveChunk()), EDIT_CX, EDIT_CY).atlasTile);
  });

  it('[H2] and the level really is the one the composer edits, so H1 is not vacuous', () => {
    expect(getActiveLevel(pstate())!.chunkLibrary).toBe(pstate().project!.chunkLibrary);
    expect(useArtStore.getState().open!.chunkId).toBe(CHUNK);
  });
});
