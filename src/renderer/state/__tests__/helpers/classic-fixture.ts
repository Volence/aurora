// Shared classic (Sonic 1) editing fixture. Extracted from classicLevelStore.test.ts
// so the history-routing tests drive the store through the SAME doc/handle shape
// the command tests do — a second hand-rolled fixture would drift and let a
// routing test pass against a doc the real commands would reject.
//
//   • 5 tiles in the pool; the adapter reports baseTileCount 4 (so tile 4 is a
//     "gap/appended" tile) and an anim overlay at tile 2 → tiles 0,1,3 editable.

import { useClassicLevelStore } from '../../classicLevelStore';
import { useClassicProjectStore } from '../../classicProjectStore';
import { documentHistoryHub } from '../../history-hub';
import type { LevelDoc } from '../../../../core/level-classic/model';
import type { ProjectHandle, ZoneActRef, EditableTileRange } from '../../../../core/project/adapter';

export const TILE_COUNT = 5;
export const EDITABLE: EditableTileRange = { baseTileCount: 4, animRanges: [{ start: 2, count: 1 }] };

export function makeDoc(): LevelDoc {
  const chunkCells = () =>
    Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  return {
    game: 's1',
    tiles: new Uint8Array(TILE_COUNT * 32),
    blocks: [
      { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
      { cells: Array.from({ length: 4 }, () => ({ tile: 1, xf: false, yf: false, pal: 1, pri: false })) },
    ],
    chunks: [{ cells: chunkCells() }, { cells: chunkCells() }],
    fg: { width: 2, height: 2, cells: new Uint8Array([0, 1, 0, 1]) },
    bg: { width: 2, height: 2, cells: new Uint8Array([0, 0, 0, 0]) },
    collision: { colind: new Uint8Array([0, 0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [{ x: 100, y: 100, xflip: false, yflip: false, respawn: false, id: 1, subtype: 0 }],
    start: { x: 50, y: 50 },
    sourceRefs: {
      'tiles.0': 'artnem/t.nem',
      blocks: 'map16/b.eni',
      chunks: 'map256/c.kos',
      fg: 'levels/fg.bin',
      bg: 'levels/bg.bin',
      objpos: 'objpos/o.bin',
      start: 'startpos/s.bin',
      colind: 'colind/ci.bin',
      'palette.0': 'palette/p0.bin',
      'palette.1': 'palette/p1.bin',
    },
  };
}

export const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

export function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
      facets: ['layout', 'art', 'objects', 'collision', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [REF],
      read: async () => makeDoc(),
      write: async () => ({ written: [], skipped: [], errors: [] }),
      editableTileRange: (): EditableTileRange => EDITABLE,
    },
  };
}

/**
 * Put both classic stores in a clean 'ready' editing session over a fresh doc.
 * The project store must read as OPEN before any undo stack is built: the hub's
 * `level:`/`zoneart:` factories dispatch on it (history-factories.ts).
 */
export function openReady(doc = makeDoc()): void {
  useClassicProjectStore.setState({ status: 'open', dir: '/p', handle: fakeHandle() } as never);
  // Fresh session ⇒ fresh undo documents (what a real project switch does).
  documentHistoryHub.clearAll();
  useClassicLevelStore.setState({
    ref: REF,
    doc,
    status: 'ready',
    error: null,
    dirty: {},
    chunkVersions: new Map(),
    chunkEpoch: 1,
  });
}
