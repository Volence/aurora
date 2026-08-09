import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import {
  useClassicProjectStore,
  __setClassicBridgeForTest,
  __resetClassicBridgeForTest,
} from '../../state/classicProjectStore';
import { useClassicLevelStore, classicHistory } from '../../state/classicLevelStore';
import type { ClassicBridge } from '../../state/classic-bridge';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { ProjectHandle, ZoneActRef, WriteResult } from '../../../core/project/adapter';
import type { ResolutionReport } from '../../../core/project/report';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';

// ---------------------------------------------------------------------------
// Fixtures — a minimal validateLevelDoc-clean LevelDoc + fake project handle,
// mirroring src/renderer/state/__tests__/classicLevelStore.test.ts.
// ---------------------------------------------------------------------------

const TILE_COUNT = 5;

function makeDoc(): LevelDoc {
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
    sourceRefs: { start: 'startpos/s.bin' },
  };
}

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

const REPORT: ResolutionReport = {
  entries: [{ key: 'fg', path: 'levels/ghz1.bin', status: 'resolved' }],
  resolved: 1,
  total: 1,
};

function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: { levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false },
    report: REPORT,
    levels: {
      list: () => [REF],
      read: async () => makeDoc(),
      write: async (): Promise<WriteResult> => ({ written: [], skipped: [], errors: [] }),
    },
  };
}

/** Put both stores into a clean, open + ready editing session. */
function openReady(doc = makeDoc()): void {
  useClassicProjectStore.setState({
    status: 'open', dir: '/p', label: 'Sonic 1', type: 's1',
    capabilities: fakeHandle().capabilities, report: REPORT,
    zoneTree: [REF], handle: fakeHandle(), error: null,
  } as never);
  classicHistory.clear();
  useClassicLevelStore.setState({
    ref: REF, doc, status: 'ready', error: null,
    dirty: {}, chunkVersions: new Map(), chunkEpoch: 1, historyTick: 0,
  });
}

function bridgeReturning(open: ClassicBridge['open']): ClassicBridge {
  return { open };
}

const proj = () => useClassicProjectStore.getState();
const lvl = () => useClassicLevelStore.getState();

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  classicHistory.clear();
});
afterEach(() => {
  __resetClassicBridgeForTest();
  delete (globalThis as unknown as { window?: unknown }).window;
});

// ---------------------------------------------------------------------------
// open_project — reuses the Task-9 bridge
// ---------------------------------------------------------------------------

describe('classic-open-project', () => {
  it('opens a classic project and returns type/label/report/zoneTree', async () => {
    __setClassicBridgeForTest(bridgeReturning(async () => ({ kind: 'opened', handle: fakeHandle(), label: 'Sonic 1 Disassembly' })));
    const res = await handleAgentRequest({ kind: 'classic-open-project', dir: '/proj/s1' }) as {
      type: string; label: string; report: { resolved: number; total: number }; zoneTree: ZoneActRef[];
    };
    expect(res.type).toBe('s1');
    expect(res.label).toBe('Sonic 1 Disassembly');
    expect(res.report).toEqual({ resolved: 1, total: 1 });
    expect(res.zoneTree).toEqual([REF]);
    expect(proj().status).toBe('open');
  });

  it('leaves a real aeon project unchanged (opened:false)', async () => {
    __setClassicBridgeForTest(bridgeReturning(async () => ({ kind: 'not-classic', aeon: true })));
    const res = await handleAgentRequest({ kind: 'classic-open-project', dir: '/proj/aeon' }) as { type: string; opened: boolean };
    expect(res).toMatchObject({ type: 'aeon', opened: false });
    expect(proj().status).toBe('closed');
  });

  it('throws with the store notice for an unrecognized directory', async () => {
    __setClassicBridgeForTest(bridgeReturning(async () => ({ kind: 'not-classic', aeon: false })));
    await expect(handleAgentRequest({ kind: 'classic-open-project', dir: '/proj/junk' }))
      .rejects.toThrow(/not a recognized project/i);
  });
});

// ---------------------------------------------------------------------------
// Query tools
// ---------------------------------------------------------------------------

describe('classic-get-project-report', () => {
  it('returns the full ResolutionReport', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-get-project-report' })).toBe(REPORT);
  });
  it('errors when no project is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-get-project-report' })).rejects.toThrow(/no classic project is open/);
  });
});

describe('classic-list-levels', () => {
  it('returns the zone/act refs', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-list-levels' })).toEqual({ levels: [REF] });
  });
  it('errors when no project is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-list-levels' })).rejects.toThrow(/no classic project is open/);
  });
});

describe('classic-get-level', () => {
  it('opens + summarizes an act (dims, counts, palettes, objects, start, layout)', async () => {
    // Only the project store needs to be open; get-level drives openAct itself.
    useClassicProjectStore.setState({ status: 'open', dir: '/p', handle: fakeHandle(), zoneTree: [REF], report: REPORT, type: 's1' } as never);
    const res = await handleAgentRequest({ kind: 'classic-get-level', zone: 'ghz', act: 1 }) as {
      counts: { tiles: number; blocks: number; chunks: number; objects: number };
      dims: { fg: { width: number; height: number } };
      palettes: number[][]; objects: unknown[]; start: { x: number; y: number };
      layout: { fg: number[][]; bg: number[][] };
    };
    expect(res.counts).toEqual({ tiles: 5, blocks: 2, chunks: 2, objects: 1 });
    expect(res.dims.fg).toEqual({ width: 2, height: 2 });
    expect(res.palettes).toHaveLength(4);
    expect(res.palettes[0]).toHaveLength(16);
    expect(res.objects).toHaveLength(1);
    expect(res.start).toEqual({ x: 50, y: 50 });
    expect(res.layout.fg).toEqual([[0, 1], [0, 1]]);
    expect(lvl().status).toBe('ready');
  });

  it('errors for an unknown zone/act', async () => {
    useClassicProjectStore.setState({ status: 'open', dir: '/p', handle: fakeHandle(), zoneTree: [REF], report: REPORT, type: 's1' } as never);
    await expect(handleAgentRequest({ kind: 'classic-get-level', zone: 'zzz', act: 9 })).rejects.toThrow(/not found/);
  });

  it('errors when no project is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-get-level', zone: 'ghz', act: 1 })).rejects.toThrow(/no classic project is open/);
  });
});

// ---------------------------------------------------------------------------
// Mutation tools — one undo step each (via the Task-12 commands)
// ---------------------------------------------------------------------------

describe('classic-set-layout-region', () => {
  it('stamps a 2D chunk-id grid as one undo step', async () => {
    openReady();
    const res = await handleAgentRequest({ kind: 'classic-set-layout-region', plane: 'fg', x: 0, y: 0, chunkIds: [[1, 2], [3, 4]] });
    expect(res).toEqual({ plane: 'fg', cells: 4 });
    expect(Array.from(lvl().doc!.fg.cells)).toEqual([1, 2, 3, 4]);
    lvl().undo();
    expect(Array.from(lvl().doc!.fg.cells)).toEqual([0, 1, 0, 1]);
  });
  it('rejects an out-of-range chunk id (structured error)', async () => {
    openReady();
    await expect(handleAgentRequest({ kind: 'classic-set-layout-region', plane: 'fg', x: 0, y: 0, chunkIds: [[256]] })).rejects.toThrow(/chunk id/);
    expect(lvl().dirty.fg).toBeUndefined();
  });
  it('errors when no level is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-set-layout-region', plane: 'fg', x: 0, y: 0, chunkIds: [[0]] })).rejects.toThrow(/no classic level is open/);
  });
});

describe('classic-edit-chunk', () => {
  it('edits chunk cells as one undo step', async () => {
    openReady();
    const res = await handleAgentRequest({ kind: 'classic-edit-chunk', chunkId: 0, cells: [{ index: 5, word: 1 }] });
    expect(res).toEqual({ chunkId: 0, cells: 1 });
    expect(lvl().doc!.chunks[0].cells[5].block).toBe(1);
  });
  it('rejects a nonexistent chunk', async () => {
    openReady();
    await expect(handleAgentRequest({ kind: 'classic-edit-chunk', chunkId: 99, cells: [{ index: 0, word: 0 }] })).rejects.toThrow(/chunk 99/);
  });
  it('errors when no level is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-edit-chunk', chunkId: 0, cells: [] })).rejects.toThrow(/no classic level is open/);
  });
});

describe('classic-edit-block', () => {
  it('replaces a block definition', async () => {
    openReady();
    const def = { cells: Array.from({ length: 4 }, () => ({ tile: 1, xf: false, yf: true, pal: 2, pri: false })) };
    expect(await handleAgentRequest({ kind: 'classic-edit-block', blockId: 0, def })).toEqual({ blockId: 0 });
    expect(lvl().doc!.blocks[0].cells[0]).toEqual({ tile: 1, xf: false, yf: true, pal: 2, pri: false });
  });
  it('rejects a nonexistent block', async () => {
    openReady();
    const def = { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) };
    await expect(handleAgentRequest({ kind: 'classic-edit-block', blockId: 9, def })).rejects.toThrow(/block 9/);
  });
});

describe('classic object tools', () => {
  const entry: S1ObjectEntry = { x: 10, y: 20, xflip: false, yflip: false, respawn: true, id: 0x25, subtype: 4 };

  it('place appends and returns the new index', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-place-object', entry })).toEqual({ index: 1, count: 2 });
    expect(lvl().doc!.objects).toHaveLength(2);
    expect(lvl().doc!.objects[1].id).toBe(0x25);
  });
  it('place rejects an invalid object (id out of range)', async () => {
    openReady();
    const bad: S1ObjectEntry = { ...entry, id: 0xff };
    await expect(handleAgentRequest({ kind: 'classic-place-object', entry: bad })).rejects.toThrow(/out of range/);
    expect(lvl().doc!.objects).toHaveLength(1);
  });
  it('move updates coords', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-move-object', index: 0, x: 7, y: 8 })).toEqual({ index: 0, x: 7, y: 8 });
    expect(lvl().doc!.objects[0]).toMatchObject({ x: 7, y: 8 });
  });
  it('move rejects an out-of-range index', async () => {
    openReady();
    await expect(handleAgentRequest({ kind: 'classic-move-object', index: 5, x: 0, y: 0 })).rejects.toThrow(/out of range/);
  });
  it('delete removes the placement', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-delete-object', index: 0 })).toEqual({ deleted: 0, count: 0 });
    expect(lvl().doc!.objects).toHaveLength(0);
  });
  it('place errors when no level is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-place-object', entry })).rejects.toThrow(/no classic level is open/);
  });
});

describe('classic-set-colind', () => {
  it('sets collision-shape indices', async () => {
    openReady();
    expect(await handleAgentRequest({ kind: 'classic-set-colind', entries: [{ blockId: 0, value: 7 }, { blockId: 1, value: 200 }] })).toEqual({ entries: 2 });
    expect(Array.from(lvl().doc!.collision.colind)).toEqual([7, 200]);
  });
  it('rejects a value > 255', async () => {
    openReady();
    await expect(handleAgentRequest({ kind: 'classic-set-colind', entries: [{ blockId: 0, value: 256 }] })).rejects.toThrow(/out of range/);
  });
  it('errors when no level is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-set-colind', entries: [] })).rejects.toThrow(/no classic level is open/);
  });
});

// ---------------------------------------------------------------------------
// save_project — structured outcome
// ---------------------------------------------------------------------------

describe('classic-save-project', () => {
  it('saves a dirty act through the guarded channel (structured saved result)', async () => {
    const written: string[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      api: {
        writeGuarded: async (_dir: string, files: { relPath: string }[]) => {
          for (const f of files) written.push(f.relPath);
          return { written: files.map((f) => f.relPath), newMtimes: {} };
        },
        addRecentProject: async () => [],
      },
    };
    const handle: ProjectHandle = {
      type: 's1',
      capabilities: fakeHandle().capabilities,
      report: REPORT,
      levels: {
        list: () => [REF],
        read: async () => makeDoc(),
        write: async (): Promise<WriteResult> => ({
          written: ['startpos/s.bin'], skipped: [], errors: [],
          files: [{ path: 'startpos/s.bin', bytes: new Uint8Array([1, 2]) }],
          fileMtimes: {},
        }),
      },
    };
    useClassicProjectStore.setState({ status: 'open', dir: '/p', handle, zoneTree: [REF], report: REPORT, type: 's1' } as never);
    useClassicLevelStore.setState({
      ref: REF, doc: makeDoc(), status: 'ready', error: null,
      dirty: { start: true }, chunkVersions: new Map(), chunkEpoch: 1, historyTick: 0,
    });

    const res = await handleAgentRequest({ kind: 'classic-save-project' });
    expect(res).toEqual({ kind: 'saved', count: 1 });
    expect(written).toEqual(['startpos/s.bin']);
  });

  it('returns { kind: "nothing" } when there are no dirty acts', async () => {
    openReady(); // ready but clean
    expect(await handleAgentRequest({ kind: 'classic-save-project' })).toEqual({ kind: 'nothing' });
  });

  it('errors when no project is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-save-project' })).rejects.toThrow(/no classic project is open/);
  });
});
