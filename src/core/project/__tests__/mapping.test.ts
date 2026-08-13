import { describe, it, expect } from 'vitest';
import { readProjectConfig, serializeProjectConfig, type ProjectConfig } from '../mapping';

const enc = (s: string) => new TextEncoder().encode(s);

describe('project mapping config', () => {
  it('parses a full v2 config with no issues', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      base: 's2-github',
      paths: { 'level/layout': 'custom/layouts' },
      assets: {
        'level-art': { path: 'art/zx0', compression: 'zx0' },
        'sprites': { format: 's2', compression: 'kosinski' },
      },
    })));
    expect(issues).toEqual([]);
    expect(config.base).toBe('s2-github');
    expect(config.assets!['level-art'].compression).toBe('zx0');
  });

  it('null bytes (no sidecar file) → empty config, no issues', () => {
    expect(readProjectConfig(null)).toEqual({ config: {}, issues: [] });
  });

  it('malformed JSON → empty config + a root issue', () => {
    const { config, issues } = readProjectConfig(enc('not json'));
    expect(config).toEqual({});
    expect(issues).toHaveLength(1);
    expect(issues[0].where).toBe('$');
  });

  it('non-object top level → empty config + a root issue', () => {
    expect(readProjectConfig(enc('[1,2]')).issues[0].where).toBe('$');
    expect(readProjectConfig(enc('"hi"')).issues[0].where).toBe('$');
  });

  it('drops a non-string base with an issue, keeps the rest', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({ base: 42, paths: { a: 'b' } })));
    expect(config.base).toBeUndefined();
    expect(config.paths).toEqual({ a: 'b' });
    expect(issues).toEqual([{ where: 'base', message: expect.stringContaining('string') }]);
  });

  it('drops individual bad paths entries, keeping good ones (per-entry diagnostics)', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      paths: { good: 'levels/ghz1.bin', bad: 42, worse: null },
    })));
    expect(config.paths).toEqual({ good: 'levels/ghz1.bin' });
    expect(issues.map((i) => i.where).sort()).toEqual(['paths.bad', 'paths.worse']);
  });

  it('drops a wholly-wrong paths shape with one issue', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({ paths: 'nope' })));
    expect(config.paths).toBeUndefined();
    expect(issues).toEqual([{ where: 'paths', message: expect.any(String) }]);
  });

  it('drops individual bad asset entries, keeping good ones', () => {
    const { config, issues } = readProjectConfig(enc(JSON.stringify({
      assets: {
        ok: { path: 'a', compression: 'zx0' },
        bad: { path: 3 },
        typo: { pth: 'a' },
      },
    })));
    expect(Object.keys(config.assets!)).toEqual(['ok']);
    expect(issues.map((i) => i.where).sort()).toEqual(['assets.bad', 'assets.typo']);
    const typoIssue = issues.find((i) => i.where === 'assets.typo')!;
    expect(typoIssue.message.toLowerCase()).toContain('pth'); // zod's unrecognized-key diagnosis surfaces
  });

  it('preserves unknown top-level fields through a round-trip', () => {
    const { config } = readProjectConfig(enc(JSON.stringify({ base: 'aeon', futureField: 42 })));
    const rt = readProjectConfig(serializeProjectConfig(config));
    expect(rt.issues).toEqual([]);
    expect((rt.config as Record<string, unknown>).futureField).toBe(42);
  });

  it('serializes with trailing newline and 2-space indent (diff-friendly in repos)', () => {
    const cfg: ProjectConfig = { base: 'aeon' };
    const text = new TextDecoder().decode(serializeProjectConfig(cfg));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "base": "aeon"');
  });
});
