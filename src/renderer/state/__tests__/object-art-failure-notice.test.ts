// DOES AN UNREADABLE SPRITE ART FILE REACH THE AUTHOR? (SPRITE-CACHE-SILENT-SWALLOW,
// lens sweep)
//
// ═══ WHAT THE PREVIOUS PARCEL COULD NOT CLAIM ════════════════════════════════
//
// `object-art-read-failure.test.ts` proved the builder THROWS the right sentence
// and said so out loud: `ObjectSpriteCache.load` wrapped the build in
// `.catch(() => null)`, so nobody ever read it. These rows are the other half —
// that a person is told.
//
// ⚠ AND ONE CORRECTION TO THE ROW ITSELF. It said the object "renders as simply
// missing". It does not: `drawObjects` (components/classic/classic-overlays.ts)
// falls back to the hex-id box on a null sprite. The defect is that an UNLINKED id
// draws exactly the same box, so the failure was camouflaged as the normal resting
// state of most of the S1 object table rather than being invisible. That is why the
// notice has to name which objects and why, and why the cache reports a THROWN
// build and stays silent on a legitimate miss (object-sprite-cache.test.ts).
//
// ═══ WHY THESE MATCHERS ════════════════════════════════════════════════════════
//
// The wording hazard on this parcel is a matcher another rule satisfies, and this
// module's neighbours emit similar sentences: `readFailureMessage` has three of its
// own, and the aeon loader's `markUnreadable` says "could not be read" too. So the
// end-to-end row keys on the notice's OWN clause ('show as their id box'), which
// only this producer emits, and separately on the reason text the read layer
// produced, so neither half can pass on the other's behalf.
//
// RED-FIRST: proven by restoring `.catch(() => null)` in object-sprite-cache.ts and
// by removing the drain from `refreshClassicObjectSprites` (both mutations shown on
// disk in the parcel report). Runner:
// `npx vitest run src/renderer/state/__tests__/object-art-failure-notice.test.ts`,
// inside `npm test`'s `vitest run`.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  refreshClassicObjectSprites, loadObjectSprite,
  __setObjectSpriteBuilderForTest, __resetObjectSpriteArtForTest,
} from '../classicObjectArtStore';
import { useToastStore } from '../toastStore';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../../../core/project/profiles/object-subtype-rules';
import { s1ObjectName, s1ObjectHex } from '../../../core/project/profiles/s1-objects';
import type { LevelDoc } from '../../../core/level-classic/model';

const ZONE = 'ghz';
/** Crabmeat: a real GHZ id whose art comes from a FILE, so the real builder's first
 *  act is a read that can fail. Asserted, not assumed. */
const FILE_BACKED = 0x1f;

const clk = (n: number) => ({ palette: n, tile: n });

/** Ids that resolve to NO art link, so refresh's prefetch never reaches the
 *  Electron-only readMany bridge (the convention in classicObjectArtStore.test.ts).
 *  Asserted below rather than trusted. */
const UNLINKED = [0x02, 0x03, 0x04];

function docOf(ids: number[]): LevelDoc {
  return { objects: ids.map((id) => ({ id, subtype: 0 })), tiles: new Uint8Array([1]) } as unknown as LevelDoc;
}

/** The art file the real builder will ask for, resolved the way it resolves it. */
function artFileFor(id: number): string {
  const base = resolveObjectArt(id, ZONE);
  if (!base) throw new Error(`s1-object-art has no link for id ${id} in ${ZONE}: this row measures nothing`);
  const { link } = resolveEffectiveObjectArt(id, ZONE, 0, base);
  if (link.artSource !== 'file') {
    throw new Error(`id ${id} resolved to artSource '${link.artSource}': pick a file-backed id`);
  }
  return link.artFile;
}

/**
 * Stand in for the preload's batch read, answering 'unreadable' with an errno for
 * every path asked for. The shape carries `outcome` because the bridge now refuses
 * an entry with no verdict by name (see ReadOutcome in shared/ipc-types).
 */
function stubReadManyUnreadable(errno: string): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    api: {
      readManyFiles: async (_d: string, rels: string[]) => rels.map((r) => ({
        relPath: r, bytes: null, mtimeMs: null, outcome: 'unreadable', reason: errno,
      })),
    },
  };
  return () => { g.window = prev; };
}

function toasts(): { message: string; type: string }[] {
  return useToastStore.getState().toasts.map((t) => ({ message: t.message, type: t.type }));
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  __resetObjectSpriteArtForTest();
  useToastStore.setState({ toasts: [] });
});

describe('an art file the author cannot read produces a notice, not a silent hex box', () => {
  it('END TO END: the real builder, a failed batch read, and a notice carrying the errno', async () => {
    const errno = `EACCES: permission denied, open '${artFileFor(FILE_BACKED)}'`;
    const restore = stubReadManyUnreadable(errno);
    try {
      await refreshClassicObjectSprites('dir', docOf([FILE_BACKED]), ZONE, clk(1));
    } finally {
      restore();
    }
    const errors = toasts().filter((t) => t.type === 'error');
    expect(errors.length, 'an unreadable sprite art file was swallowed').toBe(1);
    // The clause only this producer emits: what the author is looking at instead.
    expect(errors[0].message).toContain('show as their id box');
    // WHICH object, named the way the box on screen names it.
    expect(errors[0].message).toContain(s1ObjectName(FILE_BACKED));
    expect(errors[0].message).toContain(s1ObjectHex(FILE_BACKED));
    // The repair hint, from the read layer, unchanged in transit.
    expect(errors[0].message).toContain('could not be read');
    expect(errors[0].message).toContain('EACCES: permission denied');
    // NOT the fabricated cause. The file is right there; it is the permissions.
    expect(errors[0].message).not.toMatch(/no such file|ENOENT/);
  });

  it('a whole refresh of failures is ONE notice, naming some and counting the rest', async () => {
    // The wall this producer must not build: an error toast dwells ten seconds and
    // a broken art tree fails every linked id in the act. `nameSome` (notice.ts) is
    // the shape the repo settled on for exactly this.
    for (const id of UNLINKED) {
      expect(resolveObjectArt(id, ZONE), `id ${id} is linked now: pick another, or this row `
        + 'reaches the Electron-only readMany bridge').toBeFalsy();
    }
    __setObjectSpriteBuilderForTest(async () => { throw new Error('disk on fire'); });
    await refreshClassicObjectSprites('dir', docOf(UNLINKED), ZONE, clk(1));
    const errors = toasts().filter((t) => t.type === 'error');
    expect(errors.length, 'one notice per failed sprite is the wall notice.ts forbids').toBe(1);
    // The count is derived from the failures, so it cannot render "I could not tell"
    // as a number.
    expect(errors[0].message).toContain(`${UNLINKED.length} object sprites`);
    for (const id of UNLINKED) expect(errors[0].message).toContain(s1ObjectHex(id));
    expect(errors[0].message).toContain('disk on fire');
  });

  it('STILL one notice when the failures arrive at different times', async () => {
    // The row above does not actually test the suppression: three builds launched
    // together all reject before any of them resumes, so the first drain happens to
    // find all three and coalesces them even with the suppression removed (measured
    // — that mutation left it green). STAGGER the rejections and the difference is
    // real: without the batch guard the first drain emits before the later failures
    // exist, and the refresh produces one notice per sprite.
    for (const id of UNLINKED) expect(resolveObjectArt(id, ZONE)).toBeFalsy();
    __setObjectSpriteBuilderForTest(async (id) => {
      // A real delay per id, not a microtask count: microtask staggering is too
      // fine to separate the drains (measured), and the hazard is a build that
      // finishes late, which is what a slow file read actually is.
      await new Promise((r) => setTimeout(r, 5 * (UNLINKED.indexOf(id) + 1)));
      throw new Error(`build ${id} broke`);
    });
    await refreshClassicObjectSprites('dir', docOf(UNLINKED), ZONE, clk(1));
    const errors = toasts().filter((t) => t.type === 'error');
    expect(errors.length, 'the refresh emitted a notice per failed sprite').toBe(1);
    expect(errors[0].message).toContain(`${UNLINKED.length} object sprites`);
  });

  it('the DIRECT path (a thumbnail, a preview) notices too', async () => {
    // `loadObjectSprite` is what ObjectThumb / ObjectPreview / the armed placement
    // ghost call. A queue drained only by a refresh would hold their failures until
    // a refresh that may never come.
    expect(resolveObjectArt(UNLINKED[0], ZONE)).toBeFalsy();
    __setObjectSpriteBuilderForTest(async () => { throw new Error('thumb build broke'); });
    const sprite = await loadObjectSprite('dir', docOf([UNLINKED[0]]), UNLINKED[0], ZONE, 0, 1);
    expect(sprite, 'the contract is still null on a failure').toBeNull();
    const errors = toasts().filter((t) => t.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('thumb build broke');
  });

  it('CONTROL: a refresh in which nothing fails says nothing at all', async () => {
    // Without this, a producer that toasted unconditionally would satisfy every row
    // above. An UNLINKED id is the ordinary case — it is a miss, not a failure, and
    // the hex box is the honest picture of it.
    await refreshClassicObjectSprites('dir', docOf(UNLINKED), ZONE, clk(1));
    expect(toasts(), 'an id nobody has linked is not a failure').toEqual([]);
  });
});
