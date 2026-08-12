import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAdapter,
  clearAdapters,
  detectProject,
  openProject,
  type FileAccess,
  type ProjectAdapter,
  type ProjectHandle,
  type ProjectOverrides,
} from '../adapter';
import { buildReport, type ResolutionEntry } from '../report';

// ---------------------------------------------------------------------------
// In-memory FileAccess fake — a Map<string, Uint8Array> of project-relative
// paths. Directory listing is derived from key prefixes so no fs is involved.
// ---------------------------------------------------------------------------

function memFs(files: Record<string, Uint8Array | string>): FileAccess {
  const map = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(files)) {
    map.set(k, typeof v === 'string' ? new TextEncoder().encode(v) : v);
  }
  return {
    async exists(rel) {
      return map.has(rel);
    },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list(relDir) {
      const prefix = relDir === '' || relDir === '.' ? '' : relDir.replace(/\/?$/, '/');
      const names = new Set<string>();
      for (const key of map.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        names.add(slash === -1 ? rest : rest.slice(0, slash));
      }
      return [...names];
    },
  };
}

// A stub adapter that fingerprints on the presence of a single file and produces
// an empty (but well-formed) handle when opened. It records the overrides it was
// opened with so tests can assert pass-through.
function stubAdapter(
  type: 'aeon' | 's1',
  fingerprintFile: string,
  label: string,
): ProjectAdapter & { openedWith?: ProjectOverrides } {
  const adapter: ProjectAdapter & { openedWith?: ProjectOverrides } = {
    type,
    async detect(fa) {
      return (await fa.exists(fingerprintFile)) ? { type, label } : null;
    },
    async open(_fa, overrides): Promise<ProjectHandle> {
      adapter.openedWith = overrides;
      return {
        type,
        capabilities: { levels: null, sprites: false, objects: null, build: false, facets: [] },
        report: buildReport([]),
        levels: null,
      };
    },
  };
  return adapter;
}

describe('detectProject registry', () => {
  beforeEach(() => clearAdapters());

  it('returns null on an empty registry', async () => {
    expect(await detectProject(memFs({ 'sonic.asm': 'x' }))).toBeNull();
  });

  it('returns null when no adapter fingerprint matches an empty dir', async () => {
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    expect(await detectProject(memFs({}))).toBeNull();
  });

  it('detects only when the fingerprint file exists', async () => {
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    expect(await detectProject(memFs({ 'readme.txt': 'x' }))).toBeNull();
    expect(await detectProject(memFs({ 'sonic.asm': 'x' }))).toEqual({
      type: 's1',
      label: 'Sonic 1',
    });
  });

  it('honours registration order as priority — first match wins', async () => {
    // Both adapters match a dir that has both fingerprint files; the one
    // registered first is returned.
    registerAdapter(stubAdapter('aeon', 'aeon.asm', 'Aeon'));
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    const fa = memFs({ 'aeon.asm': 'x', 'sonic.asm': 'x' });
    expect(await detectProject(fa)).toEqual({ type: 'aeon', label: 'Aeon' });
  });

  it('falls through to a later adapter when the earlier one does not match', async () => {
    registerAdapter(stubAdapter('aeon', 'aeon.asm', 'Aeon'));
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    const fa = memFs({ 'sonic.asm': 'x' });
    expect(await detectProject(fa)).toEqual({ type: 's1', label: 'Sonic 1' });
  });

  it('throws on duplicate-type registration', () => {
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    expect(() => registerAdapter(stubAdapter('s1', 'other.asm', 'Sonic 1 (dup)'))).toThrow(
      /already registered/,
    );
  });
});

describe('openProject', () => {
  beforeEach(() => clearAdapters());

  it('returns the matched adapter handle, null when nothing matches', async () => {
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    const handle = await openProject(memFs({ 'sonic.asm': 'x' }));
    expect(handle?.type).toBe('s1');
    expect(handle?.capabilities.build).toBe(false);
    expect(await openProject(memFs({ 'readme.txt': 'x' }))).toBeNull();
  });

  it('passes overrides through to the adapter open()', async () => {
    const s1 = stubAdapter('s1', 'sonic.asm', 'Sonic 1');
    registerAdapter(s1);
    const overrides: ProjectOverrides = { paths: { layout: 'custom/layout' } };
    await openProject(memFs({ 'sonic.asm': 'x' }), overrides);
    expect(s1.openedWith).toBe(overrides);
  });

  it('opens the first matching adapter in registration order', async () => {
    registerAdapter(stubAdapter('aeon', 'aeon.asm', 'Aeon'));
    registerAdapter(stubAdapter('s1', 'sonic.asm', 'Sonic 1'));
    const handle = await openProject(memFs({ 'aeon.asm': 'x', 'sonic.asm': 'x' }));
    expect(handle?.type).toBe('aeon');
  });
});

describe('memFs.list (fake sanity)', () => {
  it('derives immediate dir entries from key prefixes', async () => {
    const fa = memFs({
      'level/layout/z1.bin': 'a',
      'level/objects/z1.bin': 'b',
      'sonic.asm': 'c',
    });
    expect((await fa.list('')).sort()).toEqual(['level', 'sonic.asm']);
    expect((await fa.list('level')).sort()).toEqual(['layout', 'objects']);
  });
});

describe('buildReport', () => {
  it('counts resolved vs total across mixed statuses', () => {
    const entries: ResolutionEntry[] = [
      { key: 'layout', path: 'level/layout/z1.bin', status: 'resolved' },
      { key: 'objpos', path: 'level/objects/z1.bin', status: 'resolved' },
      { key: 'colind', path: 'level/colind/z1.bin', status: 'missing' },
      { key: 'palette', path: 'art/pal/z1.bin', status: 'ambiguous', detail: '2 candidates' },
    ];
    const report = buildReport(entries);
    expect(report.total).toBe(4);
    expect(report.resolved).toBe(2);
    expect(report.entries).toBe(entries);
  });

  it('reports zero resolved for an all-missing list and zeros for empty', () => {
    expect(buildReport([]).resolved).toBe(0);
    expect(buildReport([]).total).toBe(0);
    const r = buildReport([{ key: 'x', path: 'x', status: 'missing' }]);
    expect(r.resolved).toBe(0);
    expect(r.total).toBe(1);
  });
});
