import { describe, it, expect } from 'vitest';
import { kosinskiDecompress, kosinskiCompress, KosinskiError } from '../kosinski';

/**
 * R11. `readByte` returned 0 past the end of the input and the decode loop's
 * only exit was the terminator — so on data whose descriptor bits never route
 * there, the output array grew until V8 aborted the PROCESS. An abort is not a
 * throw: no try/catch can intercept it, so one bad file took the editor down
 * and every unsaved document with it, mid-session, from an import.
 *
 * And "bad file" is not exotic. Availability checks are existence-only, so a
 * placeholder, a truncated copy, or a git-lfs pointer file — plain ASCII —
 * walks straight into the decoder from project open or chunk import.
 *
 * Each case below aborted the process before the fix; each must now be an
 * ordinary catchable error.
 */
describe('kosinskiDecompress on malformed input', () => {
  const cases: [string, Uint8Array][] = [
    ['empty input', new Uint8Array(0)],
    ['a two-byte descriptor and nothing else', new Uint8Array([0, 0])],
    ['4KB of zeros', new Uint8Array(4096)],
    [
      'a git-lfs pointer file',
      new TextEncoder().encode(
        'version https://git-lfs.github.com/spec/v1\noid sha256:0123456789abcdef\nsize 41984\n',
      ),
    ],
    ['a truncated real stream', kosinskiCompress(new Uint8Array(512).fill(7)).subarray(0, 6)],
  ];

  it.each(cases)('throws rather than running away: %s', (_label, bytes) => {
    expect(() => kosinskiDecompress(bytes)).toThrow(KosinskiError);
  });

  /**
   * A match reaching back before anything written indexed the sliding window
   * with a negative number (JS `%` keeps the sign), read `undefined`, and wrote
   * a silent zero — corruption that decodes without complaint.
   */
  it('refuses a match that reaches before the start of the output', () => {
    // descriptor 0b...00 => short match first, distance 1 back from nothing.
    const stream = new Uint8Array([0x00, 0x00, 0xff]);
    expect(() => kosinskiDecompress(stream)).toThrow(KosinskiError);
  });

  it('still decodes a well-formed stream unchanged', () => {
    const raw = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 0xff);
    expect(Array.from(kosinskiDecompress(kosinskiCompress(raw)))).toEqual(Array.from(raw));
  });
});
