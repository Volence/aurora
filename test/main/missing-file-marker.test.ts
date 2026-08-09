import { describe, it, expect } from 'vitest';
import { isMissingFileMarker, unwrapBinaryRead } from '../../src/shared/ipc-types';

describe('read-binary missing-file marker', () => {
  it('unwrap throws an ENOENT-shaped error carrying the path', () => {
    expect(() => unwrapBinaryRead({ __missing: '/p/section_1.meta.json' }))
      .toThrowError(/ENOENT.*section_1\.meta\.json/);
  });

  it('binary payloads pass through untouched and are never mistaken for markers', () => {
    const buf = new Uint8Array([1, 2, 3]);
    expect(unwrapBinaryRead(buf)).toBe(buf);
    expect(isMissingFileMarker(buf)).toBe(false);
    expect(isMissingFileMarker(buf.buffer)).toBe(false);
    expect(isMissingFileMarker(null)).toBe(false);
  });
});
