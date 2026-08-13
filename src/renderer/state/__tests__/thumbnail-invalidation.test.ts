// Chunk-thumbnail invalidation. ChunkLibrary bakes tile pixels and palette
// colors into an OffscreenCanvas per chunk and memoises it; every input it bakes
// is mutated IN PLACE by history.ts (`chunk.nametable = …`, `tiles[i] = …`,
// `palette.lines[n].colors = …` on the very objects it was handed), so prop
// identity can never be the cache key. editorStore.chunkLibraryVersion is the
// key, and these tests pin the contract the memo depends on: it must advance for
// UNDO and REDO exactly as it does for the edit — a thumbnail that only tracks
// the forward direction shows art the document no longer contains.

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../history-hub';
import { useEditorStore, executeCommand, focusedHistory } from '../editorStore';

const tile = (v: number) => ({ pixels: new Uint8Array(64).fill(v) });

function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [tile(0), tile(1)] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', sections: [] }],
    }],
    chunkLibrary: [{
      id: 'c0', name: 'c0', widthTiles: 1, heightTiles: 1,
      nametable: new Uint16Array(1), collisionA: new Uint16Array(1), collisionB: new Uint16Array(1),
    }],
  } as never;
}

const version = () => useEditorStore.getState().chunkLibraryVersion;

const level = () => getActiveLevel(useProjectStore.getState())!;

/** Execute, then undo, then redo — reporting the version after each step. */
function cycle(command: never): [number, number, number] {
  executeCommand(command, level());
  const afterExecute = version();
  focusedHistory()!.undo();
  const afterUndo = version();
  focusedHistory()!.redo();
  return [afterExecute, afterUndo, version()];
}

describe('chunk-thumbnail invalidation clock', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useProjectStore.setState({ project: fakeProject() });
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    useSessionStore.setState({ activeId: 'level:ojz:act1' });
  });

  // Tile pixels are shared: an edit to one tile changes every chunk drawing it.
  it('advances on a tileset-tile edit, its undo and its redo', () => {
    const before = version();
    const [exec, undone, redone] = cycle({
      type: 'set-tileset-tiles', description: 'edit tile', sectionIndex: -1,
      at: 0, oldTiles: [tile(0)], newTiles: [tile(9)],
    } as never);

    expect(exec).toBe(before + 1);
    expect(undone).toBe(before + 2);
    expect(redone).toBe(before + 3);
  });

  it('advances on a chunk edit, its undo and its redo', () => {
    const before = version();
    const [exec, undone, redone] = cycle({
      type: 'set-chunk', description: 'edit chunk', sectionIndex: -1, chunkId: 'c0',
      oldNametable: new Uint16Array(1), newNametable: Uint16Array.of(1),
      oldCollisionA: new Uint16Array(1), newCollisionA: new Uint16Array(1),
      oldCollisionB: new Uint16Array(1), newCollisionB: new Uint16Array(1),
    } as never);

    expect(exec).toBe(before + 1);
    expect(undone).toBe(before + 2);
    expect(redone).toBe(before + 3);
  });

  // Thumbnails bake palette colors, so a color revert restains every chunk.
  it('advances on a palette-line edit, its undo and its redo', () => {
    const before = version();
    const [exec, undone, redone] = cycle({
      type: 'set-palette-line', description: 'edit palette', sectionIndex: -1, line: 0,
      oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: 255, g: 0, b: 0, a: 255 }],
    } as never);

    expect(exec).toBe(before + 1);
    expect(undone).toBe(before + 2);
    expect(redone).toBe(before + 3);
  });

  // The counterweight: rebuilding every thumbnail costs an OffscreenCanvas per
  // chunk, so commands that cannot change a thumbnail must not trigger it.
  it('stays put for a command no thumbnail renders', () => {
    useProjectStore.getState().project!.zones[0].acts[0].sections = [{
      tileGrid: { nametable: new Uint16Array(4) }, objects: [], rings: [],
    }] as never;
    const before = version();
    executeCommand({
      type: 'add-object', description: 'add', sectionIndex: 0,
      object: { id: 1, subtype: 0, x: 0, y: 0 },
    } as never, level());
    expect(version()).toBe(before);
  });
});
