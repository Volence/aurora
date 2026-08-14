// Per-chunk thumbnail clocks (stage-4 plan 3, task 7).
//
// thumbnail-invalidation.test.ts pins the GLOBAL clock: it must advance for
// every command a thumbnail bakes, in both directions. That clock is honest but
// blunt — keyed on it, one tile-pixel edit re-rasterizes all 256 chunk
// thumbnails, which is what the aeon chunk grid did before it moved onto the
// shared ChunkGrid.
//
// These tests pin the SHARP clock the grid now keys on: a Map of per-chunk
// revisions, advanced only for the chunks a command can actually change, through
// execute, undo and redo alike. The claim "invalidation is genuinely per-chunk"
// is exactly the assertion that an untouched chunk's revision does NOT move.

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../history-hub';
import { useEditorStore, executeCommand, focusedHistory } from '../editorStore';
import { packNametableWord } from '../../../core/model/s4-types';

const tile = (v: number) => ({ pixels: new Uint8Array(64).fill(v) });

/** A 1x1 chunk drawing `tileIndex` through palette line `line`. */
const chunk = (id: string, tileIndex: number, line: number) => ({
  id, name: id, widthTiles: 1, heightTiles: 1,
  nametable: Uint16Array.of(packNametableWord(tileIndex, line, false, false, false)),
  collisionA: new Uint16Array(1), collisionB: new Uint16Array(1),
});

function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [tile(0), tile(1), tile(2)] },
      palette: { lines: [{ colors: [] }, { colors: [] }] },
      acts: [{ id: 'act1', name: 'act1', sections: [] }],
    }],
    chunkLibrary: [chunk('c0', 0, 0), chunk('c1', 1, 1), chunk('c2', 2, 0)],
  } as never;
}

const rev = (id: string): number => useEditorStore.getState().chunkVersions.get(id) ?? 0;
const revs = (): number[] => ['c0', 'c1', 'c2'].map(rev);
const level = () => getActiveLevel(useProjectStore.getState())!;

describe('per-chunk thumbnail clocks', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useEditorStore.getState().resetChunkVersions();
    useProjectStore.setState({ project: fakeProject() });
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    useSessionStore.setState({ activeId: 'level:ojz:act1' });
  });

  it('advances only the edited chunk on a set-chunk, and again on undo/redo', () => {
    const before = revs();
    executeCommand({
      type: 'set-chunk', description: 'edit chunk', sectionIndex: -1, chunkId: 'c1',
      oldNametable: Uint16Array.of(0), newNametable: Uint16Array.of(1),
      oldCollisionA: new Uint16Array(1), newCollisionA: new Uint16Array(1),
      oldCollisionB: new Uint16Array(1), newCollisionB: new Uint16Array(1),
    } as never, level());
    expect(rev('c1')).toBe(before[1] + 1);
    expect([rev('c0'), rev('c2')]).toEqual([before[0], before[2]]);

    focusedHistory()!.undo();
    expect(rev('c1')).toBe(before[1] + 2);
    focusedHistory()!.redo();
    expect(rev('c1')).toBe(before[1] + 3);
    // The whole point: two thirds of the library never repaints.
    expect([rev('c0'), rev('c2')]).toEqual([before[0], before[2]]);
  });

  it('advances only the chunks drawing an edited tile', () => {
    const before = revs();
    executeCommand({
      type: 'set-tileset-tiles', description: 'edit tile', sectionIndex: -1,
      at: 2, oldTiles: [tile(2)], newTiles: [tile(9)],
    } as never, level());
    // Only c2 draws tile 2.
    expect(revs()).toEqual([before[0], before[1], before[2] + 1]);
  });

  it('advances only the chunks on an edited palette line', () => {
    const before = revs();
    executeCommand({
      type: 'set-palette-line', description: 'recolor', sectionIndex: -1, line: 1,
      oldColors: [], newColors: [{ r: 1, g: 2, b: 3, a: 255 }],
    } as never, level());
    // Only c1 colours through line 1.
    expect(revs()).toEqual([before[0], before[1] + 1, before[2]]);
  });

  it('leaves every clock alone for a command no thumbnail bakes', () => {
    useProjectStore.getState().project!.zones[0].acts[0].sections = [{
      tileGrid: { nametable: new Uint16Array(4) }, objects: [], rings: [],
    }] as never;
    const before = revs();
    executeCommand({
      type: 'add-object', description: 'add', sectionIndex: 0,
      object: { typeId: 'x', subtype: 0, x: 0, y: 0 },
    } as never, level());
    expect(revs()).toEqual(before);
  });

  it('moves the epoch when the library is replaced wholesale', () => {
    // Chunk ids are derived from the source filename ($00.. per file), so a
    // clear-then-import can hand back the SAME ids with different art. The epoch
    // is what keeps a version key from repeating across that swap.
    executeCommand({
      type: 'set-chunk', description: 'edit chunk', sectionIndex: -1, chunkId: 'c1',
      oldNametable: Uint16Array.of(0), newNametable: Uint16Array.of(1),
      oldCollisionA: new Uint16Array(1), newCollisionA: new Uint16Array(1),
      oldCollisionB: new Uint16Array(1), newCollisionB: new Uint16Array(1),
    } as never, level());
    const epoch = useEditorStore.getState().chunkEpoch;
    expect(rev('c1')).toBeGreaterThan(0);

    useEditorStore.getState().resetChunkVersions();
    expect(useEditorStore.getState().chunkEpoch).toBe(epoch + 1);
    expect(rev('c1')).toBe(0);
  });
});
