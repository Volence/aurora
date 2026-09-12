// CLASSIC-FAILED-OPEN-CLOSES-PROJECT (docs/reviews/2026-09-12-classic-failed-open.md).
//
// Filed: "A failed open from the Home path box closes the Sonic 1 project you
// had open, and can show a stale earlier project instead. An aeon project stays
// open on the same failure."
//
// The aeon behaviour is the intended one: a failed open leaves the project that
// was open, open. These rows hold the classic project to the same rule.
//
// THE ROAD these rows drive is the one Home's path box takes: the REAL
// `useProject.openProjectPath` over the REAL classic store (its bridge replaced
// through the store's own seam) and the REAL `openAeonProject` (its core loader
// replaced, so an aeon load can be made to fail). The unsaved-work guard is
// stubbed to "proceed": it runs before the open and is not what fails here.
//
// "OPEN" is measured the way the app reads it, not by one store field:
//   * `openEngine()`, the one answer every saver, tab activation and the facet
//     bar reads (state/open-project.ts);
//   * the session key, `classicDir ?? aeonBase`, spelled exactly as
//     shell/session-lifecycle.ts derives it. A change of key runs
//     resetProjectRuntime, so a key that flips mid-open and back is not "stayed
//     open" even if the final state matches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type React from 'react';

const aeonOpenMock = vi.fn();

vi.mock('../../../core/project/aeon', () => ({
  aeonAdapter: { open: (...a: unknown[]) => aeonOpenMock(...a) },
}));
vi.mock('../classic-file-access', () => ({
  createIpcFileAccess: () => ({
    exists: async () => false, read: async () => new Uint8Array(), list: async () => [],
  }),
}));
vi.mock('../../shell/project-open-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shell/project-open-guard')>()),
  confirmProjectOpen: vi.fn(async () => true),
}));
vi.mock('../recents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recents')>()),
  loadRecents: vi.fn(async () => []),
  recordRecentProject: vi.fn(async () => []),
}));

import { openProjectPath } from '../../hooks/useProject';
import {
  useClassicProjectStore, __setClassicBridgeForTest, __resetClassicBridgeForTest,
} from '../classicProjectStore';
import { useClassicLevelStore } from '../classicLevelStore';
import { useProjectStore } from '../projectStore';
import { openEngine } from '../open-project';
import type { ClassicBridge, ClassicOpenResult } from '../classic-bridge';
import type { ProjectHandle } from '../../../core/project/adapter';
import HomeTab from '../../components/home/HomeTab';
import { renderHooked } from '../../../test/render-hooked';

// -- fixtures ------------------------------------------------------------------

const RESIDENT = '/p/s1';
const OTHER_S1 = '/p/s1-other';
const TYPO = '/p/s1-tpyo';
const AEON_DIR = '/p/aeon';
const BROKEN_AEON = '/p/aeon-broken';
const CLASSIC_LABEL = 'Sonic 1 Disassembly';
const AEON_NAME = 'Aeon Checkout';

function classicHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [{ zone: 'ghz', act: 1, label: 'Green Hill 1', available: true }],
      read: async () => { throw new Error('not used'); },
      write: async () => { throw new Error('not used'); },
    },
  };
}

function aeonParts(basePath: string) {
  const config = {
    name: AEON_NAME, engine: 's4', basePath, zones: [],
    objectLibraryPath: '', chunkLibraryPath: '',
    raw: { name: AEON_NAME, engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' },
  } as never;
  const project = {
    name: AEON_NAME, zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [],
    bgLibraryUnresolved: [], basePath,
    effectsScenes: { scenes: [], unreadable: [], notices: [] },
    effectsPresets: { presets: [], unreadable: [], notices: [] },
    bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
  } as never;
  const capabilities = {
    levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'],
  } as never;
  return { config, project, capabilities };
}

function aeonHandle(basePath: string) {
  const { config, project, capabilities } = aeonParts(basePath);
  return {
    capabilities,
    aeon: { config, project, collisionProfiles: null, notices: [], legacyAtlasMerged: false },
  };
}

/** What each directory is, as the classic bridge's detect would answer. */
function answerFor(dir: string): ClassicOpenResult {
  if (dir === RESIDENT || dir === OTHER_S1) {
    return { kind: 'opened', handle: classicHandle(), label: CLASSIC_LABEL };
  }
  if (dir === AEON_DIR || dir === BROKEN_AEON) return { kind: 'not-classic', aeon: true };
  return { kind: 'not-classic', aeon: false };
}

/** Answers only when released, so a row can look at the stores mid-open. */
function gatedBridge(): ClassicBridge & { release(): void; calls: string[] } {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return {
    calls,
    open: async (dir: string) => { calls.push(dir); await gate; return answerFor(dir); },
    release: () => release(),
  };
}

const immediateBridge: ClassicBridge = { open: async (dir: string) => answerFor(dir) };

/** The session key, spelled as shell/session-lifecycle.ts derives it. */
function sessionKey(): string | null {
  const c = useClassicProjectStore.getState();
  const classicDir = c.status === 'open' ? c.dir : null;
  const p = useProjectStore.getState();
  const aeonBase = p.project !== null ? p.config?.basePath ?? null : null;
  return classicDir ?? aeonBase;
}

/** A classic project, opened for real through the Home road, and resident. */
async function openClassicResident(): Promise<void> {
  __setClassicBridgeForTest(immediateBridge);
  await expect(openProjectPath(RESIDENT)).resolves.toBe(true);
  // LOUD ON UNMEASURABLE: every row below is about keeping THIS open.
  expect(openEngine(), 'premise: the classic project is the open project').toBe('s1');
  expect(sessionKey(), 'premise: the session is keyed on the classic project').toBe(RESIDENT);
}

/** An aeon project, opened for real through the Home road, and resident. */
async function openAeonResident(): Promise<void> {
  __setClassicBridgeForTest(immediateBridge);
  aeonOpenMock.mockResolvedValueOnce(aeonHandle(AEON_DIR));
  await expect(openProjectPath(AEON_DIR)).resolves.toBe(true);
  expect(openEngine(), 'premise: the aeon project is the open project').toBe('aeon');
  expect(sessionKey(), 'premise: the session is keyed on the aeon project').toBe(AEON_DIR);
}

/** An act of the resident classic project, loaded, the way openAct leaves it. */
function loadResidentAct(): void {
  useClassicLevelStore.setState({
    ref: { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true },
    doc: { game: 's1' } as never,
    status: 'ready',
    error: null,
  } as never);
  expect(useClassicLevelStore.getState().status, 'premise: an act is loaded').toBe('ready');
}

/** Every string Home renders, as data (render-hooked renders no children). */
function textsIn(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) { for (const c of node) textsIn(c, out); return out; }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (!node || typeof node !== 'object') return out;
  const el = node as React.ReactElement<{ children?: unknown }>;
  textsIn(el.props?.children, out);
  return out;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// -- the rows ------------------------------------------------------------------

describe('CLASSIC-FAILED-OPEN-CLOSES-PROJECT · a failed open keeps the open project open', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { api: {} });
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useProjectStore.getState().reset();
    aeonOpenMock.mockReset();
  });
  afterEach(() => {
    __resetClassicBridgeForTest();
    useClassicProjectStore.getState().reset();
    useClassicLevelStore.getState().reset();
    useProjectStore.getState().reset();
    vi.unstubAllGlobals();
  });

  it('REPRODUCTION: a classic project is still the open project after a failed open', async () => {
    await openClassicResident();
    __setClassicBridgeForTest(immediateBridge);

    await expect(openProjectPath(TYPO), 'premise: the open failed').resolves.toBe(false);
    expect(useClassicProjectStore.getState().error, 'premise: the failure is reported')
      .toMatch(/is not a recognized project/);

    expect(openEngine(), 'the classic project is still the open engine').toBe('s1');
    expect(useClassicProjectStore.getState().dir, 'and it is the SAME project').toBe(RESIDENT);
    expect(sessionKey(), 'the session is still keyed on it').toBe(RESIDENT);
  });

  it('REPRODUCTION: while the failing open is in flight, the classic project stays open', async () => {
    await openClassicResident();
    const b = gatedBridge();
    __setClassicBridgeForTest(b);

    const pending = openProjectPath(TYPO);
    await tick();
    expect(b.calls, 'premise: the bridge was asked for the typed path').toEqual([TYPO]);

    // A key that leaves and comes back is a project switch to session-lifecycle
    // (resetProjectRuntime runs on every change), so "open at the end" is not
    // enough: it must never have left.
    expect(openEngine(), 'mid-open, the classic project is still the open engine').toBe('s1');
    expect(sessionKey(), 'mid-open, the session key has not moved').toBe(RESIDENT);

    b.release();
    await expect(pending).resolves.toBe(false);
  });

  it('REPRODUCTION: an aeon project opened earlier does not resurface in its place', async () => {
    // The "stale earlier project": aeon first, then classic over it. The aeon
    // stores are never reset by a classic open (useProjectStore.reset() has no
    // production caller), so the aeon project sits under the classic one.
    await openAeonResident();
    await openClassicResident();
    expect(useProjectStore.getState().project, 'premise: the earlier aeon project is still in its store')
      .not.toBeNull();

    __setClassicBridgeForTest(immediateBridge);
    await expect(openProjectPath(TYPO), 'premise: the open failed').resolves.toBe(false);

    expect(openEngine(), 'the classic project, not the earlier aeon one').toBe('s1');
    expect(sessionKey(), 'the session is not re-keyed onto the earlier aeon project').toBe(RESIDENT);
  });

  it('REPRODUCTION: Home still shows the classic project, not the earlier aeon one, after a failed open', async () => {
    await openAeonResident();
    await openClassicResident();
    const home = renderHooked(HomeTab, {
      onOpenProject: () => {}, onOpenRecent: () => {}, onOpenPath: openProjectPath,
    });
    try {
      const before = textsIn(home.el());
      expect(before, 'premise: Home names the classic project').toContain(CLASSIC_LABEL);
      expect(before, 'premise: and not the aeon one').not.toContain(AEON_NAME);

      __setClassicBridgeForTest(immediateBridge);
      await expect(openProjectPath(TYPO), 'premise: the open failed').resolves.toBe(false);

      const after = textsIn(home.el());
      expect(after, 'Home still names the classic project').toContain(CLASSIC_LABEL);
      expect(after, 'Home does not show the earlier aeon project').not.toContain(AEON_NAME);
    } finally {
      home.unmount();
    }
  });

  it('REPRODUCTION: a classic project stays open when the typed path is an aeon project that fails to load', async () => {
    await openClassicResident();
    __setClassicBridgeForTest(immediateBridge);
    aeonOpenMock.mockRejectedValueOnce(new Error('project.json: zones[0] is missing an id'));

    await expect(openProjectPath(BROKEN_AEON), 'premise: the open failed').resolves.toBe(false);
    expect(aeonOpenMock, 'premise: the aeon loader was asked').toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().error, 'premise: the aeon failure is reported')
      .toMatch(/zones\[0\] is missing an id/);

    expect(openEngine(), 'the classic project is still the open engine').toBe('s1');
    expect(useClassicProjectStore.getState().dir).toBe(RESIDENT);
    expect(sessionKey()).toBe(RESIDENT);
  });

  it('REPRODUCTION: the act the classic project had loaded survives a failed open', async () => {
    await openClassicResident();
    loadResidentAct();
    __setClassicBridgeForTest(immediateBridge);

    await expect(openProjectPath(TYPO), 'premise: the open failed').resolves.toBe(false);

    const lvl = useClassicLevelStore.getState();
    expect(lvl.status, 'the loaded act is still loaded').toBe('ready');
    expect(lvl.ref?.zone).toBe('ghz');
    expect(lvl.doc).not.toBeNull();
  });

  // -- controls: green before and after -----------------------------------------

  it('CONTROL: an aeon project stays open after a failed open (not a project at all)', async () => {
    await openAeonResident();
    __setClassicBridgeForTest(immediateBridge);

    await expect(openProjectPath(TYPO), 'premise: the open failed').resolves.toBe(false);

    expect(openEngine()).toBe('aeon');
    expect(sessionKey()).toBe(AEON_DIR);
  });

  it('CONTROL: an aeon project stays open after a failed open (an aeon project that fails to load)', async () => {
    await openAeonResident();
    __setClassicBridgeForTest(immediateBridge);
    aeonOpenMock.mockRejectedValueOnce(new Error('project.json: zones[0] is missing an id'));

    await expect(openProjectPath(BROKEN_AEON), 'premise: the open failed').resolves.toBe(false);

    expect(openEngine()).toBe('aeon');
    expect(sessionKey()).toBe(AEON_DIR);
  });

  it('CONTROL: a successful classic switch replaces the project and drops its loaded act', async () => {
    await openClassicResident();
    loadResidentAct();
    __setClassicBridgeForTest(immediateBridge);

    await expect(openProjectPath(OTHER_S1)).resolves.toBe(true);

    expect(openEngine()).toBe('s1');
    expect(useClassicProjectStore.getState().dir).toBe(OTHER_S1);
    expect(sessionKey()).toBe(OTHER_S1);
    // A surviving doc would hold a handle into the project just left.
    expect(useClassicLevelStore.getState().status).toBe('idle');
    expect(useClassicLevelStore.getState().doc).toBeNull();
  });

  it('CONTROL: a successful aeon open over a classic project closes the classic one', async () => {
    await openClassicResident();
    loadResidentAct();
    __setClassicBridgeForTest(immediateBridge);
    aeonOpenMock.mockResolvedValueOnce(aeonHandle(AEON_DIR));

    await expect(openProjectPath(AEON_DIR)).resolves.toBe(true);

    expect(useClassicProjectStore.getState().status).toBe('closed');
    expect(openEngine()).toBe('aeon');
    expect(sessionKey()).toBe(AEON_DIR);
    expect(useClassicLevelStore.getState().doc).toBeNull();
  });
});
