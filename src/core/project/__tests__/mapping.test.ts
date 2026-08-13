import { describe, it, expect } from 'vitest';
import { parseProjectConfig, serializeProjectConfig, type ProjectConfig } from '../mapping';

const enc = (s: string) => new TextEncoder().encode(s);

describe('project mapping config', () => {
  it('parses a full v2 config', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({
      base: 's2-github',
      paths: { 'level/layout': 'custom/layouts' },
      assets: {
        'level-art': { path: 'art/zx0', compression: 'zx0' },
        'sprites': { format: 's2', compression: 'kosinski' },
      },
    })));
    expect(cfg).not.toBeNull();
    expect(cfg!.base).toBe('s2-github');
    expect(cfg!.assets!['level-art'].compression).toBe('zx0');
  });

  it('parses the legacy v1 shape (paths only)', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({ paths: { a: 'b' } })));
    expect(cfg).toEqual({ paths: { a: 'b' } });
  });

  it('parses an empty object (stock project, no overrides)', () => {
    expect(parseProjectConfig(enc('{}'))).toEqual({});
  });

  it('preserves unknown top-level fields through a round-trip', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({ base: 'aeon', futureField: 42 })));
    expect(cfg).not.toBeNull();
    const rt = parseProjectConfig(serializeProjectConfig(cfg!));
    expect((rt as Record<string, unknown>).futureField).toBe(42);
  });

  it('rejects malformed JSON and wrong shapes with null (caller falls back to base profile)', () => {
    expect(parseProjectConfig(enc('not json'))).toBeNull();
    expect(parseProjectConfig(enc(JSON.stringify({ assets: 'nope' })))).toBeNull();
    expect(parseProjectConfig(enc(JSON.stringify({ assets: { x: { path: 3 } } })))).toBeNull();
  });

  it('serializes with trailing newline and 2-space indent (diff-friendly in repos)', () => {
    const cfg: ProjectConfig = { base: 'aeon' };
    const text = new TextDecoder().decode(serializeProjectConfig(cfg));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "base": "aeon"');
  });
});
