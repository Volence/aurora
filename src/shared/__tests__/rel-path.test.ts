import { describe, it, expect } from 'vitest';
import { isRelPathSafe } from '../rel-path';

describe('isRelPathSafe', () => {
  it('accepts the root and plain relative paths', () => {
    expect(isRelPathSafe('')).toBe(true);
    expect(isRelPathSafe('.')).toBe(true);
    expect(isRelPathSafe('sonic.asm')).toBe(true);
    expect(isRelPathSafe('levels/GHZ1.bin')).toBe(true);
    expect(isRelPathSafe('a/b/c/d.bin')).toBe(true);
  });

  it('rejects any path with a .. segment (root escape)', () => {
    expect(isRelPathSafe('..')).toBe(false);
    expect(isRelPathSafe('../etc/passwd')).toBe(false);
    expect(isRelPathSafe('a/../../b')).toBe(false);
    expect(isRelPathSafe('levels/../../secret')).toBe(false);
    expect(isRelPathSafe('a\\..\\b')).toBe(false);
  });

  it('rejects absolute paths (POSIX, Windows drive, UNC)', () => {
    expect(isRelPathSafe('/etc/passwd')).toBe(false);
    expect(isRelPathSafe('C:\\Windows')).toBe(false);
    expect(isRelPathSafe('\\\\host\\share')).toBe(false);
  });
});
