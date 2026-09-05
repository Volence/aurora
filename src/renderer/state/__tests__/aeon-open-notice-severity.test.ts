// The severity a producer assigned SURVIVES the trip to the toast store.
//
// Classifying at the producer is worth nothing if the consumer flattens it, and
// that is precisely what the consumer used to do:
//
//     for (const n of aeon.notices) addToast(n, 'success');
//
// So this drives the real openAeonProject with a stubbed adapter and reads back
// what landed in useToastStore. It asserts the store's `type`, not a rendered
// colour — a node suite cannot see React or paint, and ToastContainer's own
// token mapping is pinned separately by components/__tests__/toast-colors.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Notice } from '../../../core/project/notice';

const openMock = vi.fn();

vi.mock('../../../core/project/aeon', () => ({
  aeonAdapter: { open: (...a: unknown[]) => openMock(...a) },
}));
vi.mock('../classic-file-access', () => ({
  createIpcFileAccess: () => ({ exists: async () => false, read: async () => new Uint8Array(), list: async () => [] }),
}));

import { openAeonProject } from '../aeon-open';
import { useToastStore } from '../toastStore';
import { useProjectStore } from '../projectStore';

const config = {
  name: 'P', engine: 's4', basePath: '/p', zones: [], objectLibraryPath: '', chunkLibraryPath: '',
  raw: { name: 'P', engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' },
} as never;
const project = {
  name: 'P', zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [], bgLibraryUnresolved: [],
  basePath: '/p', effectsScenes: { scenes: [], unreadable: [], notices: [] },
  effectsPresets: { presets: [], unreadable: [], notices: [] },
  bgOverride: { path: null, doc: null, unreadable: null, loadedText: null, notices: [] },
} as never;
const capabilities = { levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'] } as never;

function handleWith(notices: Notice[]) {
  return {
    capabilities,
    aeon: {
      config, project, collisionProfiles: null, notices, legacyAtlasMerged: false,
      scenes: (project as never as { effectsScenes: unknown }).effectsScenes,
      presets: (project as never as { effectsPresets: unknown }).effectsPresets,
      bgOverride: (project as never as { bgOverride: unknown }).bgOverride,
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { api: { addRecentProject: vi.fn(async () => {}) } });
  useToastStore.setState({ toasts: [] });
  useProjectStore.getState().reset();
  openMock.mockReset();
});

describe('openAeonProject routes each notice on its own channel', () => {
  it('an error notice does NOT arrive green', async () => {
    openMock.mockResolvedValue(handleWith([
      { severity: 'error', message: 'x.json exists but could not be read. Fix it by hand and reopen.' },
    ]));
    expect(await openAeonProject('/p')).toBe(true);

    const t = useToastStore.getState().toasts.find((x) => x.message.startsWith('x.json'));
    expect(t).toBeDefined();
    expect(t!.type).toBe('error');
  });

  it('carries all three severities through unflattened, in order', async () => {
    openMock.mockResolvedValue(handleWith([
      { severity: 'success', message: 'N-ok' },
      { severity: 'warning', message: 'N-warn' },
      { severity: 'error', message: 'N-err' },
    ]));
    await openAeonProject('/p');

    const seen = useToastStore.getState().toasts
      .filter((t) => t.message.startsWith('N-'))
      .map((t) => [t.message, t.type]);
    expect(seen).toEqual([['N-ok', 'success'], ['N-warn', 'warning'], ['N-err', 'error']]);
  });

  it('still ends on the green "Opened <project>" line', async () => {
    // The final confirmation is not a notice and must stay green — the row above
    // would also pass if every toast in the app had been repainted.
    openMock.mockResolvedValue(handleWith([{ severity: 'error', message: 'N-err' }]));
    await openAeonProject('/p');

    const last = useToastStore.getState().toasts.at(-1)!;
    expect([last.message, last.type]).toEqual(['Opened P', 'success']);
  });
});
