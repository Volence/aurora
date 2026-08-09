import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileAccess } from '../adapter';
import { s1Adapter, enumerateProfileEntries } from '../s1/index';
import { s1Profile } from '../profiles/s1';

// ---------------------------------------------------------------------------
// In-memory FileAccess fake (same pattern as adapter.test.ts).
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

const ENTRIES = enumerateProfileEntries(s1Profile);
function entry(key: string) {
  const e = ENTRIES.find((x) => x.key === key);
  if (!e) throw new Error(`test bug: no profile entry '${key}'`);
  return e;
}

// A stock fake built DIRECTLY from the profile so it can never drift: a file at
// every entry's preferred path, plus the fingerprint file. Extra/overrides win.
function fullFake(extra: Record<string, Uint8Array | string> = {}): Record<string, string> {
  const files: Record<string, string> = { 'sonic.asm': 'x' };
  for (const e of ENTRIES) files[e.variant.path] = `data:${e.key}`;
  return { ...files, ...(extra as Record<string, string>) };
}

const LABEL = 'Sonic 1 Disassembly (GitHub)';

// ---------------------------------------------------------------------------
// detect
// ---------------------------------------------------------------------------

describe('s1Adapter.detect', () => {
  it('matches a stock s1 layout', async () => {
    expect(await s1Adapter.detect(memFs(fullFake()))).toEqual({ type: 's1', label: LABEL });
  });

  it('returns null without sonic.asm', async () => {
    const f = fullFake();
    delete (f as Record<string, string>)['sonic.asm'];
    expect(await s1Adapter.detect(memFs(f))).toBeNull();
  });

  it('returns null when the data dirs are absent (only sonic.asm)', async () => {
    expect(await s1Adapter.detect(memFs({ 'sonic.asm': 'x' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// open — resolution
// ---------------------------------------------------------------------------

describe('s1Adapter.open resolution', () => {
  it('resolves every profile entry and marks all acts available', async () => {
    const handle = await s1Adapter.open(memFs(fullFake()));
    expect(handle.type).toBe('s1');
    expect(handle.capabilities).toEqual({
      levels: 'chunk-hierarchy',
      sprites: true,
      objects: 'objpos',
      build: false,
    });
    expect(handle.report.total).toBe(ENTRIES.length);
    expect(handle.report.resolved).toBe(ENTRIES.length);
    const refs = handle.levels!.list();
    expect(refs.length).toBe(18); // 6 zones x 3 acts
    expect(refs.every((r) => r.available)).toBe(true);
  });

  it('never throws for missing files; a missing gating file flags only its act', async () => {
    const files = fullFake();
    delete files[entry('ghz.act1.fgLayout').variant.path];
    const handle = await s1Adapter.open(memFs(files));

    // Report shows the miss.
    const miss = handle.report.entries.find((e) => e.key === 'ghz.act1.fgLayout');
    expect(miss?.status).toBe('missing');
    expect(handle.report.resolved).toBe(ENTRIES.length - 1);

    // Only GHZ act 1 is unavailable; everything else stays available.
    const refs = handle.levels!.list();
    const ghz1 = refs.find((r) => r.zone === 'ghz' && r.act === 1)!;
    expect(ghz1.available).toBe(false);
    expect(ghz1.reason).toMatch(/ghz\.act1\.fgLayout/);
    expect(refs.filter((r) => !r.available)).toHaveLength(1);
  });

  it('does not flag an act when only a non-gating file (animated art) is missing', async () => {
    const files = fullFake();
    delete files[entry('ghz.act1.anim.0').variant.path];
    const handle = await s1Adapter.open(memFs(files));
    expect(handle.report.entries.find((e) => e.key === 'ghz.act1.anim.0')?.status).toBe('missing');
    const ghz1 = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
    expect(ghz1.available).toBe(true);
  });

  it('falls back to the REV00 variant when the preferred REV01 file is absent', async () => {
    const e = entry('ghz.act3.objpos');
    expect(e.variant.rev00Path).toBeDefined();
    const files = fullFake();
    delete files[e.variant.path]; // remove REV01
    files[e.variant.rev00Path!] = 'rev00';
    const handle = await s1Adapter.open(memFs(files));
    const resolved = handle.report.entries.find((x) => x.key === 'ghz.act3.objpos')!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.path).toBe(e.variant.rev00Path);
    expect(resolved.detail).toMatch(/REV00/);
    expect(handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 3)!.available).toBe(true);
  });

  it('read rejects an unavailable act with its reason', async () => {
    const files = fullFake();
    delete files[entry('ghz.act1.fgLayout').variant.path];
    const handle = await s1Adapter.open(memFs(files));
    const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
    await expect(handle.levels!.read(ref)).rejects.toThrow(/unavailable/);
  });

  it('write before read rejects (no cached read state)', async () => {
    const handle = await s1Adapter.open(memFs(fullFake()));
    const ref = handle.levels!.list()[0];
    await expect(handle.levels!.write(ref, null as never, {})).rejects.toThrow(/must be read/);
  });
});

// ---------------------------------------------------------------------------
// open — overrides (sidecar + param precedence)
// ---------------------------------------------------------------------------

describe('s1Adapter.open overrides', () => {
  const KEY = 'ghz.act1.objpos';

  it('redirects an entry via the .aurora/project.json sidecar', async () => {
    const files = fullFake({
      '.aurora/project.json': JSON.stringify({ paths: { [KEY]: 'custom/sidecar.bin' } }),
      'custom/sidecar.bin': 'sidecar',
    });
    const handle = await s1Adapter.open(memFs(files));
    const e = handle.report.entries.find((x) => x.key === KEY)!;
    expect(e.status).toBe('resolved');
    expect(e.path).toBe('custom/sidecar.bin');
    expect(e.detail).toBe('override');
  });

  it('lets the open() param override win over the sidecar', async () => {
    const files = fullFake({
      '.aurora/project.json': JSON.stringify({ paths: { [KEY]: 'custom/sidecar.bin' } }),
      'custom/sidecar.bin': 'sidecar',
      'custom/param.bin': 'param',
    });
    const handle = await s1Adapter.open(memFs(files), { paths: { [KEY]: 'custom/param.bin' } });
    const e = handle.report.entries.find((x) => x.key === KEY)!;
    expect(e.status).toBe('resolved');
    expect(e.path).toBe('custom/param.bin');
  });

  it('marks an override missing (no REV fallback) when its target is absent', async () => {
    const handle = await s1Adapter.open(memFs(fullFake()), { paths: { [KEY]: 'nope/gone.bin' } });
    const e = handle.report.entries.find((x) => x.key === KEY)!;
    expect(e.status).toBe('missing');
    expect(e.path).toBe('nope/gone.bin');
    expect(handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!.available).toBe(false);
  });

  it('tolerates a malformed sidecar (treated as empty)', async () => {
    const files = fullFake({ '.aurora/project.json': '{ not json' });
    const handle = await s1Adapter.open(memFs(files));
    expect(handle.report.resolved).toBe(ENTRIES.length);
  });

  it('filters non-string override values out of the sidecar', async () => {
    // A hand-edited sidecar with junk values (number, object, null) alongside a
    // valid string override. Only the string survives; the junk keys fall back
    // to their profile paths (so everything still resolves).
    const files = fullFake({
      '.aurora/project.json': JSON.stringify({
        paths: {
          [KEY]: 'custom/sidecar.bin',
          'ghz.act2.objpos': 42,
          'ghz.act3.objpos': { nested: 'x' },
          'mz.act1.objpos': null,
        },
      }),
      'custom/sidecar.bin': 'sidecar',
    });
    const handle = await s1Adapter.open(memFs(files));
    // The string override applied…
    expect(handle.report.entries.find((e) => e.key === KEY)!.path).toBe('custom/sidecar.bin');
    // …and the junk-valued keys fell back to their profile paths (still resolved).
    for (const junkKey of ['ghz.act2.objpos', 'ghz.act3.objpos', 'mz.act1.objpos']) {
      const e = handle.report.entries.find((x) => x.key === junkKey)!;
      expect(e.status).toBe('resolved');
      expect(e.detail).not.toBe('override');
    }
    expect(handle.report.resolved).toBe(ENTRIES.length);
  });
});

// ---------------------------------------------------------------------------
// Golden — real s1disasm (skipped when the disasm tree is absent).
// ---------------------------------------------------------------------------

const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const S1_PRESENT = fs.existsSync(S1DIR);

function realFs(root: string): FileAccess {
  return {
    async exists(rel) {
      return fs.existsSync(path.join(root, rel));
    },
    async read(rel) {
      return new Uint8Array(fs.readFileSync(path.join(root, rel)));
    },
    async list(rel) {
      return fs.readdirSync(path.join(root, rel));
    },
  };
}

describe('s1Adapter golden (real s1disasm)', () => {
  it.skipIf(!S1_PRESENT)('detects and resolves 100% of profile entries; all acts available', async () => {
    const fa = realFs(S1DIR);
    expect(await s1Adapter.detect(fa)).toEqual({ type: 's1', label: LABEL });

    const handle = await s1Adapter.open(fa);
    const misses = handle.report.entries
      .filter((e) => e.status !== 'resolved')
      .map((e) => `${e.key} -> ${e.path}`);
    expect(misses, `unresolved profile entries:\n${misses.join('\n')}`).toEqual([]);
    expect(handle.report.resolved).toBe(handle.report.total);

    const unavailable = handle.levels!.list().filter((r) => !r.available);
    expect(
      unavailable.map((r) => `${r.zone}${r.act}: ${r.reason}`),
      `unavailable acts:\n${unavailable.map((r) => `${r.zone}${r.act}: ${r.reason}`).join('\n')}`,
    ).toEqual([]);
  });
});
