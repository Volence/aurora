import { describe, it, expect } from 'vitest';
import { buildSetupRows, applyPathEdits, pendingEditCount } from '../setup-model';
import { buildReport } from '../../../../core/project/report';
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
