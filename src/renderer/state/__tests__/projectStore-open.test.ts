import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../projectStore';

const fakeConfig = { name: 'P', engine: 's4', basePath: '/p', zones: [], objectLibraryPath: '', chunkLibraryPath: '', raw: { name: 'P', engine: 's4', zones: [], objectLibrary: '', chunkLibrary: '' } } as never;
const fakeProject = { name: 'P', zones: [], objectLibrary: [], chunkLibrary: [], bgLibrary: [], basePath: '/p' } as never;
const caps = { levels: 'aeon', sprites: true, objects: 'json', build: false, facets: ['layout'] } as never;

describe('projectStore.openLoaded', () => {
  beforeEach(() => useProjectStore.getState().reset());

  it('commits config+project+profiles+capabilities in ONE set (aeon→aeon sliver fix)', () => {
    // Subscribe BEFORE the commit: at no observable point may config be set while
    // project is null — that gap is exactly what let the session restore race the
    // loader (stage-3 notes, deferred gap #2).
    const gaps: boolean[] = [];
    const unsub = useProjectStore.subscribe((s) => gaps.push(s.config !== null && s.project === null));
    useProjectStore.getState().openLoaded({
      config: fakeConfig, project: fakeProject, collisionProfiles: null,
      capabilities: caps, legacyAtlasMerged: true,
    });
    unsub();
    expect(gaps.every((g) => g === false)).toBe(true);
    const s = useProjectStore.getState();
    expect(s.project).toBe(fakeProject);
    expect(s.capabilities).toBe(caps);
    expect(s.legacyAtlasMerged).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it('reset clears the new fields', () => {
    useProjectStore.getState().openLoaded({ config: fakeConfig, project: fakeProject, collisionProfiles: null, capabilities: caps, legacyAtlasMerged: true });
    useProjectStore.getState().reset();
    const s = useProjectStore.getState();
    expect(s.capabilities).toBeNull();
    expect(s.legacyAtlasMerged).toBe(false);
  });
});
