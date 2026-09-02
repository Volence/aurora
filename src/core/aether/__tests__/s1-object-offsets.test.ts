// The S1 object-slot offsets, read out of the DISASSEMBLY'S OWN equates.
//
// `obX`/`obY` are `equ`s, and an equate cannot answer an address lookup in
// either direction — so play-from-cursor on the classic path cannot get them
// from the listing the way it gets `v_player`. It reads `_Constants.asm`
// instead, which is the file the ROM itself was assembled from, so the editor
// and the ROM cannot drift.
//
// The last row reads the REAL s1disasm checkout and skips WITH A MESSAGE when
// it is absent — the shape `core/model/screen.ts`'s test established.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  parseAsmEquate, parseS1ObjectOffsets, S1_OFFSET_SOURCE,
} from '../s1-object-offsets';
import { referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';

describe('parseAsmEquate', () => {
  it('reads a decimal equate', () => {
    expect(parseAsmEquate('obX:\t\t\tequ 8\t\t\t; x-axis position', 'obX')).toBe(8);
  });

  it('reads a $-prefixed hex equate', () => {
    expect(parseAsmEquate('obY:\t\t\tequ $C\t\t\t; y-axis position', 'obY')).toBe(0xc);
  });

  it('is anchored, so a query does not match a LONGER name that ends in it', () => {
    // Unanchored, `obY:` matches inside `v_boss_obY:` and silently returns
    // $20 — a plausible slot offset, and the player's Y would be poked into
    // whatever actually lives 32 bytes into the slot. The first version of
    // this row claimed `obX` would match `obSubpixelX`; poisoning the
    // implementation showed it would not (that name does not contain "obX"),
    // so the row was measuring nothing. This fixture is the real shape.
    const src = 'v_boss_obY:\t\tequ $20\n';
    expect(parseAsmEquate(src, 'obY')).toBeNull();
  });

  it('returns null for a SYMBOLIC equate rather than NaN', () => {
    // `obScreenY: equ obSubpixelX` is real in this file. A parser that ran the
    // token through parseInt would hand back NaN, and NaN >>> 0 is 0 — a poke
    // at the object's ID byte.
    expect(parseAsmEquate('obScreenY:\t\tequ obSubpixelX', 'obScreenY')).toBeNull();
  });

  it('returns null for an EXPRESSION equate rather than half of it', () => {
    expect(parseAsmEquate('object_size:\t\tequ 1<<object_size_bits', 'object_size')).toBeNull();
  });

  it('returns null when the name is absent', () => {
    expect(parseAsmEquate('obY:\tequ $C', 'obNope')).toBeNull();
  });

  it('does not match an indented instruction that happens to start with the name', () => {
    expect(parseAsmEquate('\t\tmove.w\tobX:equ 8', 'obX')).toBeNull();
  });
});

describe('parseS1ObjectOffsets', () => {
  it('returns both offsets when both equates are present', () => {
    expect(parseS1ObjectOffsets('obX:\tequ 8\nobSubpixelX:\tequ $A\nobY:\tequ $C\n'))
      .toEqual({ obX: 8, obY: 0xc });
  });

  it('returns null when EITHER equate is missing — never a half-derived pair', () => {
    expect(parseS1ObjectOffsets('obX:\tequ 8\n')).toBeNull();
    expect(parseS1ObjectOffsets('obY:\tequ $C\n')).toBeNull();
  });

  it('names the file and the two equates it reads, so the citation cannot drift', () => {
    expect(S1_OFFSET_SOURCE.file).toBe('_Constants.asm');
    expect(S1_OFFSET_SOURCE.x).toBe('obX');
    expect(S1_OFFSET_SOURCE.y).toBe('obY');
  });
});

/**
 * The sibling `s1disasm/` checkout's `_Constants.asm`, or null when absent.
 *
 * This used to WALK UP twelve directories looking for a directory that held a
 * `s1disasm/`. That found the tree on this machine, so it was honest about
 * absence — but it was the one route into the disassembly that
 * `AURORA_S1DISASM_REPO` / `AURORA_PEER_ROOT` could not redirect, and it was
 * (those two spellings are the ones that were current when this was measured;
 * the names today are `S1DISASM_DIR` / `EMPYREAN_SUITE_ROOT`, and the old ones
 * are accepted as transitional aliases — empyrean `contract/SUITE_PATHS.md`)
 * measured to be exactly that on 2026-08-30: with the override pointed at an
 * absent directory, an fs-level trace caught this file still opening the REAL
 * `_Constants.asm` (one of only two such leaks in the suite; see
 * `docs/reviews/2026-08-30-s1disasm-test-coupling.md`). A single derivation is
 * the point — a second one is a hole in whatever the first one promises.
 */
const constantsPath = ((): string | null => {
  const p = referencePath(S1_PINNED, S1_OFFSET_SOURCE.file);
  return existsSync(p) ? p : null;
})();
const row = constantsPath ? it : it.skip;
const why = constantsPath
  ? ''
  : ' — SKIPPED: no sibling s1disasm checkout found, the real equates could not be read';

describe('parseS1ObjectOffsets against the real s1disasm _Constants.asm', () => {
  row(`parses the checkout's own ${S1_OFFSET_SOURCE.x}/${S1_OFFSET_SOURCE.y}${why}`, () => {
    const src = readFileSync(constantsPath!, 'utf8');
    const off = parseS1ObjectOffsets(src);
    expect(off, `${S1_OFFSET_SOURCE.x}/${S1_OFFSET_SOURCE.y} not parsed from ${constantsPath}`)
      .not.toBeNull();
    // The invariant is derived from the SAME file: an object slot is
    // `object_size` = 1 << `object_size_bits` bytes, so both offsets must be
    // word-aligned positions inside one slot, and X must precede Y.
    const bits = parseAsmEquate(src, 'object_size_bits');
    expect(bits, `object_size_bits not parsed from ${constantsPath}`).not.toBeNull();
    const slot = 1 << bits!;
    for (const v of [off!.obX, off!.obY]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(slot);
      expect(v % 2).toBe(0);
    }
    expect(off!.obX).toBeLessThan(off!.obY);
    // And a word at obX must not overlap the word at obY.
    expect(off!.obX + 2).toBeLessThanOrEqual(off!.obY);
  });
});
