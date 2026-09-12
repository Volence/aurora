// UX SEAT A, FINDING F6 - "opening the aeon project while the classic project
// was open did nothing, silently" - REPRODUCED, ATTRIBUTED, AND REFUTED FOR THE
// USER INTERFACE.
//
// WHAT THE SEAT SAW, from docs/reviews/2026-09-07-lens-ux/uxa-walk.md: the call
// "returned `undefined`, threw nothing (I retried inside a try/catch), and the
// shell stayed on `Sonic 1 Disassembly (GitHub)` with the classic five pill
// facet set"; a restart with aeon opened first worked immediately. The seat
// filed it against `window.__dbg.aeon.open`, said in bold that it could NOT
// claim the UI behaves this way, and asked for a check by someone who can press
// the real control. This is that check.
//
// TWO THINGS WERE TRUE AT ONCE, and neither of them is "did nothing".
//
// 1. THE `undefined` WAS NEVER A SIGNAL. The hook read
//    `open: (dir) => openAeonProject(dir).then(() => undefined)`. It DISCARDED
//    the loader's boolean, so `undefined` came back from a successful open and
//    a failed one alike. Reading it as failure is reading a constant.
//
// 2. THE OPEN SUCCEEDED AND WAS MASKED. `openEngine()` (state/open-project.ts)
//    gives CLASSIC PRECEDENCE by design - a window holds one project, and
//    `classicProjectStore.status === 'open'` is answered before
//    `projectStore.project !== null` is read at all. `openAeonProject` wrote the
//    second and never touched the first, so the aeon project was fully loaded
//    and completely invisible behind the classic facet set: exactly the report.
//
// §1 is that mechanism, on the two stores. §2 is the CENSUS VERDICT, executed:
// no production road can produce the mask. That used to be because every road to
// an aeon project runs `classicProjectStore.openDirectory` first and its
// 'not-classic' branch closed the classic store on the way to that answer. Since
// CLASSIC-FAILED-OPEN-CLOSES-PROJECT (2026-09-12) that branch closes nothing (an
// aeon load that fails must leave the classic project open), so the user road
// now rests on §3's close, run once the aeon load has succeeded. §3 holds the fix, which is
// in the loader rather than in the debug door: the mask was being closed by an
// accident of call order in a store the aeon loader cannot see, and a safety
// property held by call order is the bet `shell/project-open-guard.ts` records
// losing four times.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const openMock = vi.fn();

vi.mock('../../../core/project/aeon', () => ({
  aeonAdapter: { open: (...a: unknown[]) => openMock(...a) },
}));
vi.mock('../classic-file-access', () => ({
  createIpcFileAccess: () => ({
    exists: async () => false, read: async () => new Uint8Array(), list: async () => [],
  }),
}));

import { openAeonProject } from '../aeon-open';
import { useProjectStore } from '../projectStore';
import {
  useClassicProjectStore, __setClassicBridgeForTest, __resetClassicBridgeForTest,
} from '../classicProjectStore';
import { useClassicLevelStore } from '../classicLevelStore';
import { openEngine } from '../open-project';
import type { ClassicBridge, ClassicOpenResult } from '../classic-bridge';
import type { ProjectHandle } from '../../../core/project/adapter';

// -- fixtures --------------------------------------------------------------

const config = {
  name: 'Sonic 4', engine: 's4', basePath: '/proj/aeon', zones: [],
  objectLibraryPath: '', chunkLibraryPath: '',
  raw: { name: 'Sonic 4', engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' },
} as never;
const project = {
  name: 'Sonic 4', zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [],
  bgLibraryUnresolved: [], basePath: '/proj/aeon',
  effectsScenes: { scenes: [], unreadable: [], notices: [] },
  effectsPresets: { presets: [], unreadable: [], notices: [] },
  bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
} as never;
const capabilities = {
  levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'],
} as never;

function aeonHandle() {
  return {
    capabilities,
    aeon: {
      config, project, collisionProfiles: null, notices: [], legacyAtlasMerged: false,
      scenes: (project as never as { effectsScenes: unknown }).effectsScenes,
      presets: (project as never as { effectsPresets: unknown }).effectsPresets,
      bgOverride: (project as never as { bgOverride: unknown }).bgOverride,
    },
  };
}

function classicHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [],
      read: async () => { throw new Error('not used'); },
      write: async () => { throw new Error('not used'); },
    },
  };
}

/** Answers 'opened' for the classic fixture dir and aeon for anything else. */
function twoProjectBridge(): ClassicBridge {
  return {
    open: async (dir: string): Promise<ClassicOpenResult> =>
      dir === '/proj/s1'
        ? { kind: 'opened', handle: classicHandle(), label: 'Sonic 1 Disassembly (GitHub)' }
        : { kind: 'not-classic', aeon: true },
  };
}

/** Puts a classic project on screen, and refuses to proceed if it did not. */
async function openClassic(): Promise<void> {
  const outcome = await useClassicProjectStore.getState().openDirectory('/proj/s1');
  // LOUD ON UNMEASURABLE: if the fixture stopped opening, every row below would
  // be measuring an empty app rather than a project switch.
  expect(outcome, 'the classic fixture must actually open').toBe('opened');
  expect(openEngine(), 'and must be the visible engine before the switch').toBe('s1');
}

/** The atomic commit `openAeonProject` performs, on its own. */
function commitAeonProject(): void {
  useProjectStore.getState().openLoaded({
    config, project, collisionProfiles: null, capabilities, legacyAtlasMerged: false,
  } as never);
}

beforeEach(() => {
  vi.stubGlobal('window', {
    api: {
      addRecentProject: vi.fn(async () => (
        { projects: [], read: 'read', reason: null, path: '/p/recent-projects.json', dropped: 0 }
      )),
    },
  });
  useProjectStore.getState().reset();
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  __setClassicBridgeForTest(twoProjectBridge());
  openMock.mockReset();
  openMock.mockResolvedValue(aeonHandle());
});

afterEach(() => { __resetClassicBridgeForTest(); });

// -- §1 --------------------------------------------------------------------

describe('F6 §1 · the mechanism: a resident classic project MASKS a loaded aeon one', () => {
  /**
   * THE STATE THE SEAT'S APP WAS IN, constructed from the two stores rather than
   * through the loader, because the loader no longer produces it (§3).
   * `openLoaded` is the exact atomic commit `openAeonProject` performs, so this
   * is the same pair of store states, and it is what `openEngine()` was
   * answering while the shell stayed on the classic facet pills.
   */
  it('both projects resident: openEngine answers s1 and the aeon one is invisible', async () => {
    await openClassic();
    commitAeonProject();

    // The aeon project IS there. Nothing failed and nothing threw, which is
    // what the seat could not see through a hook returning a constant.
    expect(useProjectStore.getState().project).not.toBeNull();
    expect(useProjectStore.getState().config?.name).toBe('Sonic 4');

    // And it is invisible: `openEngine()` is what the facet bar, the savers and
    // tab activation all read, and classic precedence answers first.
    expect(openEngine(), 'classic precedence masks the loaded aeon project').toBe('s1');
    expect(useClassicProjectStore.getState().label).toBe('Sonic 1 Disassembly (GitHub)');
  });

  /**
   * THE CONTROL that makes the row above an attribution rather than a
   * restatement of `openEngine`'s source: with the classic store closed and
   * NOTHING else touched, the same resident aeon project appears. So the mask is
   * the classic store's residency, and nothing about the aeon load.
   */
  it('CONTROL: close classic, change nothing else, and the same project appears', async () => {
    await openClassic();
    commitAeonProject();
    expect(openEngine()).toBe('s1');

    useClassicProjectStore.getState().reset();

    expect(useProjectStore.getState().project, 'the aeon side was not touched').not.toBeNull();
    expect(openEngine()).toBe('aeon');
  });
});

// -- §2 --------------------------------------------------------------------

describe('F6 §2 · the census verdict, executed: no USER road can produce the mask', () => {
  /**
   * THE ROAD, in the order `useProject.openPath` runs it: `confirmProjectOpen()`,
   * then `classicProjectStore.openDirectory(dir)`, then - only on 'not-classic' -
   * `openAeonProject(dir)`. The guard is held by
   * `shell/__tests__/project-open-door-census.test.ts` and is not restated here;
   * what this file owns is that the classic primitive runs FIRST and what it
   * does to the classic store on its way past.
   *
   * Every production entry point funnels through that one function: the Home
   * hero and switch-card buttons, the Explorer's empty-state button, the command
   * palette's `open-project`, the recents rows in both Home states, the
   * palette's `recent:` commands, and (this parcel) the typed-path field.
   */
  it('opening an aeon directory from a resident classic project ends on aeon', async () => {
    await openClassic();

    const outcome = await useClassicProjectStore.getState().openDirectory('/proj/aeon');
    expect(outcome).toBe('not-classic');

    // THE CLASSIC PROJECT IS STILL OPEN HERE. The 'not-classic' branch used to
    // `set({ ...CLOSED })` before returning, and that was the whole reason F6
    // was unreachable from the UI. Since CLASSIC-FAILED-OPEN-CLOSES-PROJECT it
    // closes nothing, because the aeon load can still fail and a failed open
    // must leave the classic project open. The unmasking is now the loader's
    // own close (§3), after the load succeeds, and the last line below is what
    // proves the user road still ends visible.
    expect(useClassicProjectStore.getState().status).toBe('open');
    expect(openEngine(), 'the classic project stays open until the aeon one is loaded')
      .toBe('s1');

    expect(await openAeonProject('/proj/aeon')).toBe(true);
    expect(openEngine(), 'the user road ends with the aeon project VISIBLE').toBe('aeon');
  });

  /**
   * AND THE OTHER PRODUCTION SHAPE: aeon opened with nothing resident, which is
   * what the seat did after restarting and which worked immediately. Here so
   * the rule is not one that only ever fires in the switch case.
   */
  it('aeon from a cold start is visible, which is what the seat saw after a restart', async () => {
    expect(openEngine()).toBeNull();
    expect(await useClassicProjectStore.getState().openDirectory('/proj/aeon')).toBe('not-classic');
    expect(await openAeonProject('/proj/aeon')).toBe(true);
    expect(openEngine()).toBe('aeon');
  });
});

// -- §3 --------------------------------------------------------------------

describe('F6 §3 · the loader itself now refuses to mint that state', () => {
  it('openAeonProject over an open classic project ends VISIBLE', async () => {
    await openClassic();

    const loaded = await openAeonProject('/proj/aeon');

    expect(loaded, 'the aeon load succeeds, as it always did').toBe(true);
    expect(useProjectStore.getState().project).not.toBeNull();
    // THE FIX, and it is in the primitive rather than in the debug door: the
    // loader closes the resident classic project itself instead of relying on
    // its caller having done so one statement earlier.
    expect(useClassicProjectStore.getState().status).toBe('closed');
    expect(openEngine(), 'the seat would have seen the aeon facets').toBe('aeon');
  });

  it('the classic level doc does not survive into the aeon project', async () => {
    await openClassic();
    await openAeonProject('/proj/aeon');
    // A surviving doc holds a handle into the project just left; `openDirectory`
    // drops it at the start of a switch and this road now does the same.
    expect(useClassicLevelStore.getState().status).toBe('idle');
    expect(useClassicLevelStore.getState().doc).toBeNull();
  });

  it('the debug door returns the loader boolean instead of a constant undefined', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const src = readFileSync(
      join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'debug-hooks.ts'), 'utf8');
    // LOUD ON UNMEASURABLE: a moved file must fail here, not match nothing.
    expect(src.length, 'debug-hooks.ts unreadable').toBeGreaterThan(1000);
    // THE MISREADING, named so it cannot come back: this expression is what
    // turned a successful open into the seat's "returned undefined".
    expect(src).not.toContain('openAeonProject(dir).then(() => undefined)');
    expect(src).toContain('open: (dir) => openAeonProject(dir),');
  });
});
