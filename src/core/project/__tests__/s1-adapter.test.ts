import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileAccess } from '../adapter';
import { s1Adapter, enumerateProfileEntries, S1_FINGERPRINT } from '../s1/index';
import { s1Profile } from '../profiles/s1';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';
import { whenS1Act } from '../../../../test/support/s1-checkout';

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
      // Five pills, in the order the bar shows them: `art` is LAST because it is
      // the only classic facet that swaps the canvas, and the four before it
      // are lenses over one map. `objects` merged into `layout` for a day and
      // was reversed once the reorder made the split read correctly.
      // `collision` was granted read-only 2026-08-17 (spec stage 3a) and made
      // writable the same day (stage 3b, the shape picker over
      // paint-collision). `rings` stays out — S1 rings are objects in objpos,
      // not a separate layer. Argued at the grant itself (core/project/s1/index.ts).
      facets: ['layout', 'objects', 'collision', 'palette', 'art'],
      artTiers: [
        { id: 'chunk', label: 'Chunk', pixelSize: 256, shared: true },
        { id: 'block', label: 'Block', pixelSize: 16, shared: true },
        { id: 'tile', label: 'Tile', pixelSize: 8, shared: true },
      ],
      // `layout` is declared to REMOVE the shell default's marquee /
      // paint-tile / paint-block, none of which classic implements. No
      // place-object: that is the Objects facet's, which keeps the shell
      // default (['place-object','select','view']). Carrying it on layout too
      // made Objects a strict subset of Layout, and is what the 2026-08-14 merge
      // briefly re-created. See CapabilityManifest.facetTools — declaring
      // REPLACES.
      //
      // `collision` is declared as `['view', 'paint-collision']` — same order
      // as the shell default, restated rather than omitted so this test still
      // pins the facet's actual tool set. Stage 3b (2026-08-17) made the facet
      // write; `view` stays first because the first entry is the facet default
      // (facet-tools.ts), so arriving on Collision still hands you the
      // read-only probe, not an armed write tool.
      facetTools: {
        layout: ['view', 'stamp-chunk', 'select'],
        collision: ['view', 'paint-collision'],
      },
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

  it('surfaces the parsed sidecar config + per-entry issues on the handle', async () => {
    const files = fullFake({
      '.aurora/project.json': JSON.stringify({
        base: 's1-github',
        paths: { 'ghz.act1.fgLayout': 'levels/custom-ghz1.bin', broken: 42 },
      }),
      'levels/custom-ghz1.bin': '',
    });
    const handle = await s1Adapter.open(memFs(files));
    expect(handle.sidecar).toBeDefined();
    expect(handle.sidecar!.config.base).toBe('s1-github');
    expect(handle.sidecar!.config.paths).toEqual({ 'ghz.act1.fgLayout': 'levels/custom-ghz1.bin' });
    expect(handle.sidecar!.issues).toEqual([
      { where: 'paths.broken', message: expect.any(String) },
    ]);
  });

  it('a missing sidecar yields an empty sidecar state, not undefined', async () => {
    const handle = await s1Adapter.open(memFs(fullFake()));
    expect(handle.sidecar).toEqual({ config: {}, issues: [] });
  });

  it('a sidecar that exists but fails to read is treated as unreadable, not a parse failure', async () => {
    const files = fullFake({
      '.aurora/project.json': JSON.stringify({ base: 's1-github' }),
    });
    const fa = memFs(files);
    const realRead = fa.read.bind(fa);
    fa.read = async (rel: string) => {
      if (rel === '.aurora/project.json') throw new Error('EACCES');
      return realRead(rel);
    };
    const handle = await s1Adapter.open(fa);
    expect(handle.sidecar).toEqual({
      config: {},
      issues: [{ where: '$', message: expect.stringContaining('unreadable') }],
    });
  });
});

// ---------------------------------------------------------------------------
// Golden — real s1disasm (skipped when the disasm tree is absent).
// ---------------------------------------------------------------------------

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);
const S1_PRESENT = referenceCheckout(S1_PINNED);

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
  // ⚠ THIS ROW IS THE LOUD ANCHOR, AND IT DELIBERATELY DOES NOT SKIP ON AN
  // INCOMPLETE CHECKOUT. Its subject IS the checkout's completeness — "every
  // profile entry resolves, every act is available" — so "a file is missing" is
  // the proposition under test, not a reason to stop measuring. Rows that
  // measure Aurora AGAINST the data now skip when the data is absent
  // (docs/reviews/2026-08-30-incomplete-checkout-rows.md); if this one skipped
  // too, an incomplete checkout would go entirely green. What it lacked was not
  // loudness but ADDRESS: `expected null to deeply equal { type: 's1', … }` said
  // nothing about which tree or which part of the fingerprint.
  it('detects and resolves 100% of profile entries; all acts available', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, async () => {
    const fa = realFs(S1DIR);
    // The fingerprint's own list, so this cannot drift from what detect() checks.
    const fingerprintMisses = [
      ...(fs.existsSync(path.join(S1DIR, S1_FINGERPRINT.file)) ? [] : [S1_FINGERPRINT.file]),
      ...S1_FINGERPRINT.dirsWithEntries.filter(
        (d) => !fs.existsSync(path.join(S1DIR, d)) || fs.readdirSync(path.join(S1DIR, d)).length === 0,
      ),
    ];
    expect(
      await s1Adapter.detect(fa),
      `s1Adapter.detect() refused ${S1DIR}. Its fingerprint wants ${S1_FINGERPRINT.file} plus `
      + `non-empty ${S1_FINGERPRINT.dirsWithEntries.join(', ')}; absent or empty here: `
      + `${fingerprintMisses.length > 0 ? fingerprintMisses.join(', ') : '(none — so this is an Aurora defect, not a checkout one)'}`,
    ).toEqual({ type: 's1', label: LABEL });

    const handle = await s1Adapter.open(fa);
    const misses = handle.report.entries
      .filter((e) => e.status !== 'resolved')
      .map((e) => `${e.key} -> ${e.path}`);
    expect(
      misses,
      `${misses.length} profile entr(y/ies) did not resolve under ${S1DIR} — an INCOMPLETE `
      + `s1disasm checkout looks exactly like this:\n${misses.join('\n')}`,
    ).toEqual([]);
    expect(
      handle.report.resolved,
      `${handle.report.total - handle.report.resolved} of ${handle.report.total} profile entries `
      + `are unresolved under ${S1DIR}`,
    ).toBe(handle.report.total);

    const unavailable = handle.levels!.list().filter((r) => !r.available);
    expect(
      unavailable.map((r) => `${r.zone}${r.act}: ${r.reason}`),
      `${unavailable.length} act(s) are unavailable under ${S1DIR} — the reasons name profile `
      + `KEYS, so cross-reference them against that tree:\n`
      + `${unavailable.map((r) => `${r.zone}${r.act}: ${r.reason}`).join('\n')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readPalettes — the palette-only read (sprite checkout on session restore)
// ---------------------------------------------------------------------------

describe('s1Adapter levels.readPalettes', () => {
  it('composes the act palette components without touching any level file', async () => {
    // Real bytes only for the two GHZ palette components; every other entry
    // stays fullFake() text, which would make a full read() blow up — so a
    // passing test also proves readPalettes read ONLY the palette files.
    // Expectations derive from the transcribed components (profiles/s1.ts):
    // Sonic.bin[0..16)→entries[0..16), Green Hill Zone.bin[0..48)→[16..64).
    const word = (n: number) => [n >> 8, n & 0xff];
    const sonic = new Uint8Array(Array.from({ length: 16 }, (_, i) => word(0x0a00 + i)).flat());
    const ghz = new Uint8Array(Array.from({ length: 48 }, (_, i) => word(0x0b00 + i)).flat());
    const handle = await s1Adapter.open(memFs(fullFake({
      'palette/Sonic.bin': sonic,
      'palette/Green Hill Zone.bin': ghz,
    } as never)));

    const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
    const palettes = await handle.levels!.readPalettes!(ref);

    expect(palettes).toHaveLength(4);
    expect([...palettes[0]]).toEqual(Array.from({ length: 16 }, (_, i) => 0x0a00 + i));
    expect([...palettes[1]]).toEqual(Array.from({ length: 16 }, (_, i) => 0x0b00 + i));
    expect([...palettes[2]]).toEqual(Array.from({ length: 16 }, (_, i) => 0x0b10 + i));
    expect([...palettes[3]]).toEqual(Array.from({ length: 16 }, (_, i) => 0x0b20 + i));
  });

  it('golden: equals the full read()\'s LevelDoc.palettes on real s1disasm (GHZ 1)', whenS1Act('ghz', 1), async () => {
    const handle = await s1Adapter.open(realFs(S1DIR));
    const ref = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
    const doc = await handle.levels!.read(ref);
    const palettes = await handle.levels!.readPalettes!(ref);
    expect(palettes.map((l) => [...l])).toEqual(doc.palettes.map((l) => [...l]));
    // Anti-vacuous: line 1 (Ring's declared line) is a real, non-blank palette.
    expect(palettes[1].some((w) => w !== 0)).toBe(true);
  });
});
