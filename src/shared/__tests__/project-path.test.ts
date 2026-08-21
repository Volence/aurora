// normalizeProjectPath — the one choke point every project-path-keyed store
// routes through. Cases mirror the observed bug (trailing slash minting a
// duplicate recents row) plus the other lexical variants that could do the same.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizeProjectPath } from '../project-path';

describe('normalizeProjectPath', () => {
  it('strips a trailing slash (the reported duplicate)', () => {
    expect(normalizeProjectPath('/home/u/proj/')).toBe('/home/u/proj');
  });

  it('is identity on an already-normal path', () => {
    expect(normalizeProjectPath('/home/u/proj')).toBe('/home/u/proj');
  });

  it('collapses doubled separators', () => {
    expect(normalizeProjectPath('/home//u///proj')).toBe('/home/u/proj');
  });

  it('drops `.` segments', () => {
    expect(normalizeProjectPath('/home/u/./proj/.')).toBe('/home/u/proj');
    expect(normalizeProjectPath('./proj/')).toBe('proj');
  });

  it('resolves `..` segments lexically', () => {
    expect(normalizeProjectPath('/home/u/other/../proj')).toBe('/home/u/proj');
    expect(normalizeProjectPath('/home/u/a/b/../../proj')).toBe('/home/u/proj');
  });

  it('clamps `..` at the root of an absolute path', () => {
    expect(normalizeProjectPath('/../proj')).toBe('/proj');
    expect(normalizeProjectPath('/..')).toBe('/');
  });

  it('keeps unresolvable `..` on a relative path', () => {
    expect(normalizeProjectPath('../proj/')).toBe('../proj');
  });

  it('handles the degenerate inputs', () => {
    expect(normalizeProjectPath('/')).toBe('/');
    expect(normalizeProjectPath('')).toBe('.');
  });

  // Anti-vacuous: distinct paths must NOT collapse.
  it('keeps genuinely different paths different', () => {
    expect(normalizeProjectPath('/home/u/proj')).not.toBe(normalizeProjectPath('/home/u/proj2'));
    expect(normalizeProjectPath('/home/u/proj/sub')).not.toBe(normalizeProjectPath('/home/u/proj'));
  });

  it('preserves case (Linux paths are case-sensitive)', () => {
    expect(normalizeProjectPath('/home/u/Proj')).toBe('/home/u/Proj');
    expect(normalizeProjectPath('/home/u/Proj')).not.toBe(normalizeProjectPath('/home/u/proj'));
  });

  // Lexical-only contract: a symlink spelling stays itself, never its target.
  // (Resolving symlinks would merge entries the user created as genuinely
  // distinct doors into the tree — see the module comment.)
  it('does NOT resolve a real symlink to its target', () => {
    const base = mkdtempSync(join(tmpdir(), 'aurora-projpath-'));
    try {
      const target = join(base, 'real-proj');
      const link = join(base, 'link-proj');
      mkdirSync(target);
      symlinkSync(target, link);
      expect(normalizeProjectPath(link)).toBe(link);
      expect(normalizeProjectPath(link + '/')).toBe(link);
      expect(normalizeProjectPath(link)).not.toBe(normalizeProjectPath(target));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
