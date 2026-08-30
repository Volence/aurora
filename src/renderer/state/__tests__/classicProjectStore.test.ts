import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useClassicProjectStore,
  __setClassicBridgeForTest,
  __resetClassicBridgeForTest,
} from '../classicProjectStore';
import type { ClassicBridge, ClassicOpenResult } from '../classic-bridge';
import type { ProjectHandle, ZoneActRef } from '../../../core/project/adapter';
import type { ResolutionReport } from '../../../core/project/report';
import { createIpcFileAccess } from '../classic-file-access';
import { useClassicLevelStore } from '../classicLevelStore';
import { ensureAdaptersRegistered } from '../classic-bridge';
import { detectProject, openProject, type FileAccess } from '../../../core/project/adapter';
import { isRelPathSafe } from '../../../shared/rel-path';
import * as nodeFsMod from 'node:fs';
import * as nodePath from 'node:path';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../../../../test/support/fixture-tree';

// ---------------------------------------------------------------------------
// Fake handle + bridge
// ---------------------------------------------------------------------------

const REFS: ZoneActRef[] = [
  { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true },
  { zone: 'ghz', act: 2, label: 'Green Hill 2', available: false, reason: 'missing 1 file' },
];

const REPORT: ResolutionReport = {
  entries: [
    { key: 'ghz.act1.fgLayout', path: 'a.bin', status: 'resolved' },
    { key: 'ghz.act2.fgLayout', path: 'b.bin', status: 'missing' },
  ],
  resolved: 1,
  total: 2,
};

function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: REPORT,
    levels: {
      list: () => REFS,
      read: async () => { throw new Error('not used'); },
      write: async () => { throw new Error('not used'); },
    },
  };
}

function bridgeReturning(result: ClassicOpenResult | (() => Promise<ClassicOpenResult>)): ClassicBridge {
  return {
    open: typeof result === 'function' ? result : async () => result,
  };
}

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
});
afterEach(() => {
  __resetClassicBridgeForTest();
  useClassicLevelStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Store transitions
// ---------------------------------------------------------------------------

describe('classicProjectStore', () => {
  it('starts closed and empty', () => {
    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('closed');
    expect(s.dir).toBeNull();
    expect(s.handle).toBeNull();
    expect(s.zoneTree).toEqual([]);
  });

  it('opens an s1 project: status open, report + zoneTree + handle + label populated', async () => {
    const handle = fakeHandle();
    __setClassicBridgeForTest(bridgeReturning({ kind: 'opened', handle, label: 'Sonic 1 Disassembly' }));

    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(outcome).toBe('opened');

    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('open');
    expect(s.dir).toBe('/proj/s1');
    expect(s.type).toBe('s1');
    expect(s.label).toBe('Sonic 1 Disassembly');
    expect(s.capabilities).toEqual(handle.capabilities);
    expect(s.report).toBe(REPORT);
    expect(s.zoneTree).toEqual(REFS);
    expect(s.handle).toBe(handle);
    expect(s.error).toBeNull();
  });

  it('transitions through "opening" before resolving', async () => {
    let seenOpening = false;
    __setClassicBridgeForTest(
      bridgeReturning(async () => {
        seenOpening = useClassicProjectStore.getState().status === 'opening';
        return { kind: 'opened', handle: fakeHandle(), label: 'Sonic 1 Disassembly' };
      }),
    );
    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    expect(seenOpening).toBe(true);
  });

  it('returns "not-classic" and stays closed for an aeon dir (defers to aeon loader)', async () => {
    __setClassicBridgeForTest(bridgeReturning({ kind: 'not-classic', aeon: true }));
    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/aeon');
    expect(outcome).toBe('not-classic');
    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('closed');
    expect(s.error).toBeNull();
  });

  it('returns "error" with a helpful notice for an unrecognized dir', async () => {
    __setClassicBridgeForTest(bridgeReturning({ kind: 'not-classic', aeon: false }));
    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/junk');
    expect(outcome).toBe('error');
    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('closed');
    expect(s.error).toMatch(/not a recognized project/i);
    expect(s.error).toMatch(/sonic\.asm/);
    expect(s.error).toMatch(/project\.json/);
  });

  it('surfaces the aeon-reject reason for a dir with malformed project.json', async () => {
    __setClassicBridgeForTest(
      bridgeReturning({
        kind: 'not-classic',
        aeon: false,
        detail: 'project.json found but contains invalid JSON',
      }),
    );
    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/badjson');
    expect(outcome).toBe('error');
    const s = useClassicProjectStore.getState();
    expect(s.error).toMatch(/not a recognized project/i);
    expect(s.error).toMatch(/project\.json found but contains invalid JSON/);
  });

  it('surfaces the aeon-reject reason for a dir whose project.json has the wrong engine', async () => {
    __setClassicBridgeForTest(
      bridgeReturning({
        kind: 'not-classic',
        aeon: false,
        detail: 'project.json found but engine is "godot", expected "s4"',
      }),
    );
    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/godot');
    expect(outcome).toBe('error');
    const s = useClassicProjectStore.getState();
    expect(s.error).toMatch(/not a recognized project/i);
    expect(s.error).toMatch(/engine is "godot", expected "s4"/);
  });

  it('returns "error" and captures the message when the bridge throws', async () => {
    __setClassicBridgeForTest(
      bridgeReturning(async () => { throw new Error('disk exploded'); }),
    );
    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/x');
    expect(outcome).toBe('error');
    expect(useClassicProjectStore.getState().error).toBe('disk exploded');
    expect(useClassicProjectStore.getState().status).toBe('closed');
  });

  it('reset() clears an open project', async () => {
    __setClassicBridgeForTest(bridgeReturning({ kind: 'opened', handle: fakeHandle(), label: 'Sonic 1 Disassembly' }));
    await useClassicProjectStore.getState().openDirectory('/proj/s1');
    useClassicProjectStore.getState().reset();
    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('closed');
    expect(s.handle).toBeNull();
    expect(s.report).toBeNull();
    expect(s.zoneTree).toEqual([]);
  });

  // Task 7 follow-up: openDirectory must invalidate the loaded classic doc AS
  // SOON as a switch begins, not later via a view-layer effect — otherwise a
  // stale doc (read through the previous, now-dead handle) stays live if the
  // view unmounted mid-switch. Arrange a dirty level state left over from a
  // "previous project", then confirm openDirectory resets it back to idle.
  it('openDirectory resets useClassicLevelStore (closes the stale-handle window)', async () => {
    useClassicLevelStore.setState({
      ref: { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true },
      doc: { game: 's1' } as never,
      status: 'ready',
      error: null,
      dirty: { tiles: true },
    } as never);
    expect(useClassicLevelStore.getState().status).toBe('ready');
    expect(useClassicLevelStore.getState().dirty).toEqual({ tiles: true });

    __setClassicBridgeForTest(bridgeReturning({ kind: 'opened', handle: fakeHandle(), label: 'Sonic 1 Disassembly' }));
    await useClassicProjectStore.getState().openDirectory('/proj/s1');

    const lvl = useClassicLevelStore.getState();
    expect(lvl.status).toBe('idle');
    expect(lvl.doc).toBeNull();
    expect(lvl.ref).toBeNull();
    expect(lvl.dirty).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Renderer FileAccess bridge — rel-path safety (reject '..' before IPC)
// ---------------------------------------------------------------------------

describe('createIpcFileAccess rel-path safety', () => {
  const api = {
    pathExists: vi.fn(async () => true),
    readBinaryFile: vi.fn(async () => new ArrayBuffer(4)),
    listDir: vi.fn(async () => ['a', 'b']),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { window: unknown }).window = { api };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('delegates safe paths to the IPC api', async () => {
    const fa = createIpcFileAccess('/root');
    expect(await fa.exists('levels/GHZ1.bin')).toBe(true);
    expect(api.pathExists).toHaveBeenCalledWith('/root', 'levels/GHZ1.bin');

    const bytes = await fa.read('sonic.asm');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(api.readBinaryFile).toHaveBeenCalledWith('/root', 'sonic.asm');

    expect(await fa.list('artnem')).toEqual(['a', 'b']);
    expect(api.listDir).toHaveBeenCalledWith('/root', 'artnem');
  });

  it('rejects escaping paths without hitting IPC', async () => {
    const fa = createIpcFileAccess('/root');
    await expect(fa.exists('../etc/passwd')).rejects.toThrow(/escapes root/);
    await expect(fa.read('a/../../b')).rejects.toThrow(/escapes root/);
    await expect(fa.list('/abs')).rejects.toThrow(/escapes root/);
    expect(api.pathExists).not.toHaveBeenCalled();
    expect(api.readBinaryFile).not.toHaveBeenCalled();
    expect(api.listDir).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Headless integration — the store's open contract against the REAL s1disasm,
// through a node-fs FileAccess that mirrors the IPC bridge exactly (only the fs
// primitives differ). Skipped when the disasm tree is absent.
// ---------------------------------------------------------------------------

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const S1_PRESENT = referenceCheckout('s1disasm');

function nodeFileAccess(root: string): FileAccess {
  return {
    async exists(rel) {
      if (!isRelPathSafe(rel)) throw new Error(`escapes root: ${rel}`);
      return nodeFsMod.existsSync(nodePath.join(root, rel));
    },
    async read(rel) {
      if (!isRelPathSafe(rel)) throw new Error(`escapes root: ${rel}`);
      return new Uint8Array(nodeFsMod.readFileSync(nodePath.join(root, rel)));
    },
    async list(rel) {
      if (!isRelPathSafe(rel)) throw new Error(`escapes root: ${rel}`);
      try {
        return nodeFsMod.readdirSync(nodePath.join(root, rel));
      } catch {
        return [];
      }
    },
  };
}

// A ClassicBridge identical in shape to ipcClassicBridge but backed by node fs.
const nodeBridge: ClassicBridge = {
  async open(dir: string): Promise<ClassicOpenResult> {
    ensureAdaptersRegistered();
    const fa = nodeFileAccess(dir);
    const match = await detectProject(fa);
    if (match) {
      const handle = await openProject(fa);
      if (handle) return { kind: 'opened', handle, label: match.label };
    }
    return { kind: 'not-classic', aeon: await fa.exists('project.json') };
  },
};

describe('classicProjectStore integration (real s1disasm)', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
  beforeEach(() => {
    useClassicProjectStore.getState().reset();
    __setClassicBridgeForTest(nodeBridge);
  });
  afterEach(() => __resetClassicBridgeForTest());

  it('opens s1disasm → report 100%, 18 acts, all available', async () => {
    const outcome = await useClassicProjectStore.getState().openDirectory(S1DIR);
    expect(outcome).toBe('opened');

    const s = useClassicProjectStore.getState();
    expect(s.status).toBe('open');
    expect(s.type).toBe('s1');
    // Label captured for recent-projects (adapter's detect label).
    expect(s.label).toBe('Sonic 1 Disassembly (GitHub)');
    // 100% resolution.
    expect(s.report!.resolved).toBe(s.report!.total);
    // 6 zones x 3 acts, every one available.
    expect(s.zoneTree).toHaveLength(18);
    expect(s.zoneTree.every((r) => r.available)).toBe(true);
    // zoneTree carries the expected zone ids.
    expect([...new Set(s.zoneTree.map((r) => r.zone))].sort()).toEqual(
      ['ghz', 'lz', 'mz', 'sbz', 'slz', 'syz'],
    );
    expect(s.handle).not.toBeNull();
  });
});
