// THE SECOND FABRICATED-ENOENT SITE: the object-sprite builder's prefetch read.
//
// `readOne` inside `buildSpriteFromFiles` (renderer/state/classicObjectArtStore.ts)
// threw a hand-typed `ENOENT: no such file or directory, open '<p>'` whenever its
// prefetch entry had no bytes, which folded together an absent file, an EACCES/
// EISDIR/EIO on a file that is right there, and a path Aurora refused to resolve.
// It now narrows on the producer's `outcome` and every sentence comes from
// `readFailureMessage` (core/project/read-failure.ts).
//
// ═══ WHAT THIS FILE CAN AND CANNOT CLAIM, STATED UP FRONT ════════════════════
//
// The message is NOT SHOWN TO ANYONE TODAY. `ObjectSpriteCache.load` wraps the
// build in `.catch(() => null)`, so an unreadable art file becomes a silently
// missing sprite in the viewport with no notice anywhere. These rows therefore
// prove the thrown Error states the real cause; they do NOT prove a person sees
// it, and this parcel does not claim that. The missing notice is tagged for the
// owner in the parcel report.
//
// That swallow is also why the rows call the builder DIRECTLY (via the module's
// `__buildSpriteFromFilesForTest` export) instead of going through
// `loadObjectSprite` / `refreshClassicObjectSprites`: through the cache the only
// observable is `null`, which says nothing at all about the wording. The other
// test seam in that module, `__setObjectSpriteBuilderForTest`, REPLACES the
// function under test, so it cannot be used here either.
//
// ═══ WHY THE MATCHERS ARE THE SHAPE THEY ARE ═════════════════════════════════
//
// In a parcel about messages the live hazard is a matcher a DIFFERENT rule
// satisfies. `/no such file/` is emitted by the correct 'absent' branch, by
// `unwrapBinaryRead`, AND by the fabricated throw, so a row keying on it proves
// nothing. Each row below keys on wording only its own branch emits and asserts
// the other branches' wording is ABSENT; the last row asserts the three are
// distinct, which no single-branch implementation can satisfy.
//
// PATHS ARE DERIVED FROM THE PROFILE, not typed in: the art/mappings file names
// come from `resolveEffectiveObjectArt` exactly as the builder resolves them, so
// a table edit cannot leave these rows quietly poking at nothing.
//
// RED-FIRST: proven by restoring the fabricated `throw new Error(...)` on disk in
// classicObjectArtStore.ts (mutation in the parcel's report). Runner:
// `npx vitest run src/renderer/state/__tests__/object-art-read-failure.test.ts`,
// inside `npm test`'s `vitest run`.
import { describe, it, expect } from 'vitest';
import { __buildSpriteFromFilesForTest } from '../classicObjectArtStore';
import { resolveObjectArt } from '../../../core/project/profiles/s1-object-art';
import { resolveEffectiveObjectArt } from '../../../core/project/profiles/object-subtype-rules';
import type { ReadManyValue } from '../../../core/project/adapter';
import type { ReadFailureOutcome } from '../../../shared/ipc-types';
import type { LevelDoc } from '../../../core/level-classic/model';

// Crabmeat $1F: a real GHZ id with `artSource: 'file'`, so the builder's FIRST act
// is to read a .nem through `readOne`. A LevelArt id would skip the art read.
const ID = 0x1f;
const ZONE = 'ghz';
const SUBTYPE = 0;

/** The art file the builder will ask for, resolved the way the builder resolves it. */
function artFile(): string {
  const base = resolveObjectArt(ID, ZONE);
  if (!base) throw new Error(`s1-object-art has no link for id ${ID} in zone ${ZONE}: this row cannot measure anything`);
  const { link } = resolveEffectiveObjectArt(ID, ZONE, SUBTYPE, base);
  if (link.artSource !== 'file') {
    throw new Error(`id ${ID} in ${ZONE} resolved to artSource '${link.artSource}', not 'file': pick a file-backed id`);
  }
  return link.artFile;
}

const doc = { tiles: new Uint8Array([0]), palettes: [] } as unknown as LevelDoc;

/** A prefetch in which the art file failed with `outcome`, and nothing else is present. */
function prefetchFailing(outcome: ReadFailureOutcome, reason: string | null): Map<string, ReadManyValue> {
  return new Map<string, ReadManyValue>([
    [artFile(), { bytes: null, mtime: null, outcome, reason }],
  ]);
}

async function messageFor(outcome: ReadFailureOutcome, reason: string | null): Promise<string> {
  const base = resolveObjectArt(ID, ZONE)!;
  try {
    await __buildSpriteFromFilesForTest(
      'dir', doc, ID, ZONE, SUBTYPE, base, prefetchFailing(outcome, reason),
    );
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return 'RESOLVED';
}

describe('the object-sprite builder reports the cause its prefetch actually had', () => {
  it("'absent' still throws the real ENOENT sentence, naming the art file", async () => {
    const msg = await messageFor('absent', null);
    expect(msg).toBe(`ENOENT: no such file or directory, open '${artFile()}'`);
  });

  it("'unreadable' says the art file could not be read, and never that it is missing", async () => {
    const msg = await messageFor('unreadable', `EACCES: permission denied, open '${artFile()}'`);
    expect(msg).toContain(`'${artFile()}' could not be read`);
    expect(msg).toContain('EACCES: permission denied');
    // The defect: an intact sprite art file reported as nonexistent.
    expect(msg).not.toMatch(/no such file or directory/);
    expect(msg).not.toMatch(/ENOENT/);
  });

  it("'refused' says Aurora declined to look at the path", async () => {
    const msg = await messageFor('refused', "unsafe project-relative path (escapes root): '../x.nem'");
    expect(msg).toContain(`refused to read '${artFile()}'`);
    expect(msg).toContain('escapes root');
    expect(msg).not.toMatch(/no such file or directory/);
    expect(msg).not.toMatch(/could not be read/);
  });

  it('CONTROL: the three causes give three different sentences for one art file', async () => {
    const msgs = [
      await messageFor('absent', null),
      await messageFor('unreadable', 'EIO: i/o error'),
      await messageFor('refused', 'escapes root'),
    ];
    // Before the fix this set had size 1: one sentence, four causes.
    expect(new Set(msgs).size).toBe(3);
    expect(msgs).not.toContain('RESOLVED');
  });

  it('CONTROL: the builder really does consult the prefetch for this id, so the rows above are not measuring an unrelated throw', async () => {
    // A prefetch entry the builder MUST hit: if it did not, `readOne` would fall
    // through to `fa.read`, which needs `window.api` and fails with a wholly
    // different message. Keying on the art file NAME is what ties the rejection to
    // the prefetch lookup.
    const msg = await messageFor('absent', null);
    expect(msg).toContain(artFile());
    expect(msg).not.toMatch(/window|api|undefined/i);
  });
});
