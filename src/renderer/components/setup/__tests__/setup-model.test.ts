import { describe, it, expect } from 'vitest';
import { buildSetupRows, applyPathEdits, pendingEditCount, planSetupSidecarWrite } from '../setup-model';
import { buildReport } from '../../../../core/project/report';
import { readProjectConfig } from '../../../../core/project/mapping';
import type { ProjectConfig } from '../../../../core/project/mapping';

const report = buildReport([
  { key: 'ghz.act1.fgLayout', path: 'levels/ghz1.bin', status: 'resolved' },
  { key: 'ghz.act1.blocks', path: 'map16/ghz-custom.bin', status: 'resolved', detail: 'override' },
  { key: 'lz.act2.chunks', path: 'map256/lz.bin', status: 'missing' },
  { key: 'collision.normal', path: 'collide/norm.bin', status: 'resolved' },
]);

describe('buildSetupRows', () => {
  it('groups rows by zone (globals last) with resolved counts', () => {
    const { groups } = buildSetupRows(report, {}, ['ghz', 'lz']);
    expect(groups.map((g) => g.id)).toEqual(['ghz', 'lz', 'global']);
    expect(groups[0].resolved).toBe(2);
    expect(groups[0].total).toBe(2);
    expect(groups[1].resolved).toBe(0);
  });

  it('rows carry key/path/status/detail and the active override (null when stock)', () => {
    const config: ProjectConfig = { paths: { 'ghz.act1.blocks': 'map16/ghz-custom.bin' } };
    const { groups } = buildSetupRows(report, config, ['ghz', 'lz']);
    const rows = groups[0].rows;
    expect(rows[0]).toEqual({
      key: 'ghz.act1.fgLayout', path: 'levels/ghz1.bin', status: 'resolved', override: null,
    });
    expect(rows[1]).toEqual({
      key: 'ghz.act1.blocks', path: 'map16/ghz-custom.bin', status: 'resolved',
      detail: 'override', override: 'map16/ghz-custom.bin',
    });
  });

  it('reports sidecar overrides that match no profile entry (typo detection)', () => {
    const config: ProjectConfig = { paths: { 'ghz.act1.blcoks': 'oops.bin' } };
    const { unknownOverrides } = buildSetupRows(report, config, ['ghz', 'lz']);
    expect(unknownOverrides).toEqual([{ key: 'ghz.act1.blcoks', path: 'oops.bin' }]);
  });
});

describe('applyPathEdits', () => {
  it('sets, replaces, and clears overrides; empty string clears too', () => {
    const config: ProjectConfig = { base: 's1-github', paths: { a: '1', b: '2' } };
    const next = applyPathEdits(config, { a: 'new', b: null, c: '3', d: '' });
    expect(next.paths).toEqual({ a: 'new', c: '3' });
    expect(next.base).toBe('s1-github');
    expect(config.paths).toEqual({ a: '1', b: '2' }); // input untouched
  });

  it('drops the paths channel entirely when the last override clears', () => {
    const next = applyPathEdits({ paths: { a: '1' } }, { a: null });
    expect('paths' in next).toBe(false);
  });

  it('preserves unknown fields and the assets channel untouched', () => {
    const config = { assets: { x: { path: 'p' } }, future: 1 } as ProjectConfig;
    const next = applyPathEdits(config, { k: 'v' });
    expect(next.assets).toEqual({ x: { path: 'p' } });
    expect((next as Record<string, unknown>).future).toBe(1);
    expect(next.paths).toEqual({ k: 'v' });
  });
});

describe('pendingEditCount', () => {
  it('counts removing an unknown override (a key no report row carries)', () => {
    const config: ProjectConfig = { paths: { 'ghz.act1.blcoks': 'oops.bin' } };
    expect(pendingEditCount(config, { 'ghz.act1.blcoks': '' })).toBe(1);
  });

  it('does not count an edit reverted back to the original override', () => {
    const config: ProjectConfig = { paths: { a: 'orig.bin' } };
    expect(pendingEditCount(config, { a: 'orig.bin' })).toBe(0);
  });

  it('does not count clearing a stock (no-override) field to empty', () => {
    const config: ProjectConfig = {};
    expect(pendingEditCount(config, { a: '' })).toBe(0);
  });

  it('counts a genuine new edit', () => {
    const config: ProjectConfig = { paths: { a: 'orig.bin' } };
    expect(pendingEditCount(config, { a: 'new.bin', b: 'new2.bin' })).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// planSetupSidecarWrite — WRITER 2 of `.aurora/project.json`
//
// Setup -> Apply reaches the same file the open-time seed does, by a different
// door and with the same flaw: `applyPathEdits(sidecar.config, editMap)` over a
// `{}` that means UNREADABLE serializes a config containing only the user's
// newest edit, and writes it over everything they had.
//
// This is the same destruction as the seed's, and WORSE in one respect: the
// seed at least writes three known-good defaults, while Apply writes a document
// holding one path override and nothing else.
//
// The rows assert on the PLAN, not on a mocked writeBinaryFile: a mock that
// returns a hardcoded `true` cannot express a refusal (see
// state/__tests__/aeon-save.test.ts:78-82), so "no bytes were produced" is a
// stronger claim than "the write reported success".
// ---------------------------------------------------------------------------

describe('planSetupSidecarWrite refuses an unreadable sidecar', () => {
  const EDIT = { 'ghz.act1.fgLayout': 'my/layout.bin' };
  const enc = (t: string) => new TextEncoder().encode(t);
  const decode = (bytes: Uint8Array): unknown => JSON.parse(new TextDecoder().decode(bytes));

  it('unreadable => refused, and NO bytes are produced', () => {
    const plan = planSetupSidecarWrite(
      { config: {}, issues: [{ where: '$', message: 'sidecar unreadable; ignoring it' }], read: 'unreadable' },
      EDIT,
    );
    expect(plan.kind).toBe('refused');
    expect(plan).not.toHaveProperty('bytes');
  });

  it('invalid JSON => refused', () => {
    expect(planSetupSidecarWrite(readProjectConfig(enc('{"base":"s1-github",}')), EDIT).kind).toBe('refused');
  });

  it('a non-object JSON root => refused', () => {
    expect(planSetupSidecarWrite(readProjectConfig(enc('[1,2]')), EDIT).kind).toBe('refused');
  });

  // Assert on "left it alone" — the phrase only the sidecar REFUSAL emits.
  // Matching "could not be read" alone would also match mapping.ts's wording
  // for a merely malformed ENTRY, a different rule with a permissive outcome.
  it('the refusal says what happened, names the file, and says what to do', () => {
    const plan = planSetupSidecarWrite({ config: {}, issues: [], read: 'unreadable' }, EDIT);
    if (plan.kind !== 'refused') throw new Error('expected a refusal');
    expect(plan.reason).toMatch(/left it alone/);
    expect(plan.reason).toMatch(/\.aurora\/project\.json/);
    expect(plan.reason).toMatch(/reopen the project/);
  });

  // NON-REGRESSION. Apply is the tab's whole purpose; "refuse everything"
  // satisfies every row above and breaks the feature.
  it('readable => writes, merging the edit onto everything already there', () => {
    const plan = planSetupSidecarWrite(
      {
        config: { base: 's1-github', paths: { 'ghz.act1.tiles.0': 'my/tiles.bin' }, buildCommand: 'lua build.lua' },
        issues: [],
        read: 'read',
      },
      EDIT,
    );
    if (plan.kind !== 'write') throw new Error('expected a write');
    expect(decode(plan.bytes)).toEqual({
      base: 's1-github',
      buildCommand: 'lua build.lua',
      paths: { 'ghz.act1.tiles.0': 'my/tiles.bin', 'ghz.act1.fgLayout': 'my/layout.bin' },
    });
  });

  it('absent => writes (Apply on a project with no sidecar yet creates one)', () => {
    const plan = planSetupSidecarWrite(readProjectConfig(null), EDIT);
    if (plan.kind !== 'write') throw new Error('expected a write');
    expect(decode(plan.bytes)).toEqual({ paths: EDIT });
  });

  it('readable WITH per-entry issues => still writes', () => {
    const plan = planSetupSidecarWrite(
      readProjectConfig(enc(JSON.stringify({ base: 42, paths: { a: 'b' } }))),
      EDIT,
    );
    expect(plan.kind).toBe('write');
  });

  it("clearing an override still works ('' means back to stock)", () => {
    const plan = planSetupSidecarWrite(
      { config: { base: 's1-github', paths: { 'ghz.act1.fgLayout': 'my/layout.bin' } }, issues: [], read: 'read' },
      { 'ghz.act1.fgLayout': '' },
    );
    if (plan.kind !== 'write') throw new Error('expected a write');
    expect(decode(plan.bytes)).toEqual({ base: 's1-github' });
  });
});
