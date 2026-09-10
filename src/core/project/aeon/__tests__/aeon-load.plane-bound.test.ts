// PLANE-BOUND-FROM-OWN-DATA — the loader's collision-plane bound must not be
// derived from the array it is bounding.
//
// collision-cell-resolve.ts's SECTION_PLANE_WORDS docblock states the rule for
// every call site: "Call sites must pass THIS to `resolvePlaneWords`, never an
// array's own `.length`: deriving the bound from the very data being bounded is
// how a short plane stays short (and how a short plane A silently set the bound
// for plane B)." aeon/load.ts passed `baseline.length` on both counts — the
// `.collattr.bin` byte-length expectation AND the fallback bound.
//
// WHY THESE ROWS GO THROUGH `readCollisionPlaneFile` AND NOT `loadAeonProject`:
// the loader allocates the baseline at exactly SECTION_PLANE_WORDS ten lines
// above the call, so no fixture reachable through `loadAeonProject` can hand it
// a short one — which is exactly why the wrong bound was invisible there and
// why every row below would be vacuous on that road. The loader-level rows
// (aeon-load.test.ts's "editable collision planes" block: absent / unreadable /
// truncated / odd / over-long) still measure the real road and still pass; these
// measure the property that road cannot reach.
//
// THE POISON IS ONE ROW SHORT, not a token stub: a producer that drops the last
// strip row is the failure this bound exists to catch, and a plane 128 words
// short still parses, still renders, and still saves.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readCollisionPlaneFile } from '../load';
import type { FileAccess } from '../../adapter';
import type { UnreadableItem } from '../../notice';
import { createSection, SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../model/s4-types';
import { SECTION_PLANE_WORDS } from '../../../collision/collision-cell-resolve';
import { resetPlaneLengthReports } from '../../../collision/collision-cell-resolve';
import { serializeCollAttr } from '../../../formats/s4-collattr';
import { packCollisionCell } from '../../../collision/collision-cell-word';

/** Every expectation below is derived from the consumers' own expression. */
const WORDS = SECTION_PLANE_WORDS;
const SHORT = WORDS - SECTION_TILES_WIDE; // one strip row lost

function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

/** A baseline of `n` words whose every cell is a real (non-air) shape, so a
 *  short plane's missing tail is distinguishable from a full one's. */
function baseline(n: number): Uint8Array {
  const b = new Uint8Array(n);
  b.fill(7);
  return b;
}

/** A full-length, authored `.collattr.bin` for the section (not the baseline). */
function authoredFile(): Uint8Array {
  const words = new Uint16Array(WORDS);
  for (let i = 0; i < WORDS; i++) {
    words[i] = packCollisionCell({ shape: 1 + (i % 9), xFlip: false, yFlip: false, solidity: 'all' });
  }
  return serializeCollAttr(words);
}

const read = (fa: FileAccess, base: Uint8Array, unreadable: UnreadableItem[] = []) =>
  readCollisionPlaneFile(
    fa, createSection(0, 'sec0'), 'data/z/a/section_0', 'collattr.bin', base,
    { loaded: [], unreadable });

afterEach(() => {
  resetPlaneLengthReports();
  vi.restoreAllMocks();
});

describe('PLANE-BOUND-FROM-OWN-DATA: the plane bound is independent of the baseline', () => {
  it('the derived figures are what this test thinks they are', () => {
    // The bound is a product of the section's own tile extent, and SHORT really
    // is short — a row asserting "length === WORDS" proves nothing if the poison
    // happens to be WORDS long.
    expect(WORDS).toBe(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    expect(SHORT).toBeLessThan(WORDS);
    expect(SHORT).toBeGreaterThan(0);
  });

  it('a SHORT baseline still yields a plane the consumers can index (no file present)', async () => {
    // The case the bound exists for. With `baseline.length` the fallback handed
    // back a plane of SHORT words, and OverlayRenderer / MapViewport index
    // SECTION_PLANE_WORDS: the tail read `undefined`, which unpacks to shape 0,
    // so the missing region rendered as AIR with nothing said.
    const plane = await read(memFa(new Map()), baseline(SHORT));
    expect(plane.length).toBe(WORDS);
    // And the words that ARE there came from the baseline, so this is not a
    // zero-filled plane passing on length alone.
    expect(plane[0]).not.toBe(0);
    expect(plane[SHORT - 1]).not.toBe(0);
    expect(plane[SHORT]).toBe(0); // the pad, honestly air
  });

  it('and resolvePlaneWords gets to REPORT the short producer, which it could not before',
    async () => {
      // `[COLLISION_PLANE_LENGTH]` compares engine.length with the bound. Passing
      // the array's own length made that comparison false by construction, so the
      // loader was holding its own instrument's mouth shut.
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      await read(memFa(new Map()), baseline(SHORT));
      expect(err.mock.calls.map((c) => String(c[0])).join('\n'))
        .toMatch(/\[COLLISION_PLANE_LENGTH\] engine plane has \d+ cell words/);
    });

  it('an absent file over a FULL baseline is unchanged: same length, silent, no report', async () => {
    // The control. Every row above must be about the SHORT baseline and not
    // about a bound that grew for everyone.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreadable: UnreadableItem[] = [];
    const plane = await read(memFa(new Map()), baseline(WORDS), unreadable);
    expect(plane.length).toBe(WORDS);
    expect(unreadable).toEqual([]);
    expect(err).not.toHaveBeenCalled();
  });

  it("a file sized for the SECTION is accepted over a short baseline, not rejected as wrong-length",
    async () => {
      // The byte-count gate was `raw.length !== baseline.length * 2`, so a short
      // baseline refused the section's REAL plane — losing an authored file to a
      // producer bug one array over.
      const unreadable: UnreadableItem[] = [];
      const file = authoredFile();
      expect(file.length).toBe(WORDS * 2);
      const plane = await read(memFa(new Map([['data/z/a/section_0.collattr.bin', file]])),
        baseline(SHORT), unreadable);
      expect(plane.length).toBe(WORDS);
      expect(unreadable).toEqual([]);          // accepted, not marked not-understood
      expect(plane[WORDS - 1]).not.toBe(0);    // the authored tail really arrived
    });

  it('a file sized for the SHORT BASELINE is still refused, and the reason names the section figure',
    async () => {
      // The other half, and the one a looser fix would break: independence must
      // not become permissiveness. A plane one row short is still not this
      // section's plane.
      const unreadable: UnreadableItem[] = [];
      const short = serializeCollAttr(new Uint16Array(SHORT));
      expect(short.length).toBe(SHORT * 2);
      const plane = await read(memFa(new Map([['data/z/a/section_0.collattr.bin', short]])),
        baseline(SHORT), unreadable);
      expect(unreadable).toHaveLength(1);
      expect(unreadable[0].reason).toContain(`this section needs ${WORDS * 2}`);
      expect(plane.length).toBe(WORDS);
    });

  it('CONTROL: the derivation this row forbids is the one that fails it', () => {
    // Stated in the suite rather than left to a reviewer: the pre-fix expression
    // and the fixed one differ ONLY when the baseline is short, which is why the
    // defect could sit in a loader that always allocates it right.
    expect(baseline(WORDS).length).toBe(WORDS);   // pre-fix and post-fix agree
    expect(baseline(SHORT).length).not.toBe(WORDS); // and here they do not
  });
});
