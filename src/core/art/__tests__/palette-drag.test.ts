// The decision PaletteEditor's slider drags hang on. It is four lines, and it is
// extracted precisely because it is four lines that decide whether a half-made
// palette edit is KEPT (with an undo entry) or DROPPED — and the component it
// lives in cannot be rendered by this suite at all.

import { describe, it, expect } from 'vitest';
import { resolvePaletteDragEnd } from '../palette-drag';

const end = (o: Partial<Parameters<typeof resolvePaletteDragEnd>[0]>) =>
  resolvePaletteDragEnd({ hasSnapshot: true, sameDocument: true, changed: true, ...o });

describe('resolvePaletteDragEnd', () => {
  it('does nothing when no drag was in flight', () => {
    // Every drag ends at least twice — pointerup, then the blur behind it, then
    // the panel teardown behind THAT. Only the first may record.
    expect(end({ hasSnapshot: false })).toBe('noop');
    // …and it stays 'noop' no matter what else is true, because with no snapshot
    // nothing was mutated and `changed`/`sameDocument` describe nothing.
    expect(end({ hasSnapshot: false, changed: false, sameDocument: false })).toBe('noop');
  });

  it('COMMITS a real edit that ended on the document it started on', () => {
    // The whole point of commit-on-teardown: the user watched the color change,
    // so keep it, mark it dirty, and leave one undo entry to take it back with.
    expect(end({})).toBe('commit');
  });

  it('reverts a drag that never moved, rather than recording an empty step', () => {
    expect(end({ changed: false })).toBe('revert');
  });

  it('REVERTS rather than commits when the document changed under the drag', () => {
    // An act/sprite-doc switch mid-drag: there is no stack this step belongs on
    // (the command would be recorded against whatever is current now), so the
    // preview is rolled back off the document it was written to. Rolling back is
    // the only outcome that leaves nothing stranded.
    expect(end({ sameDocument: false })).toBe('revert');
    expect(end({ sameDocument: false, changed: false })).toBe('revert');
  });

  it('never answers commit unless the document survived', () => {
    // Exhaustive over the eight inputs — the property that matters is that
    // 'commit' implies sameDocument, since committing elsewhere corrupts a zone.
    for (const hasSnapshot of [true, false]) {
      for (const sameDocument of [true, false]) {
        for (const changed of [true, false]) {
          const r = resolvePaletteDragEnd({ hasSnapshot, sameDocument, changed });
          if (r === 'commit') expect({ hasSnapshot, sameDocument, changed })
            .toEqual({ hasSnapshot: true, sameDocument: true, changed: true });
          // And the outcome is always one of the three — no undefined branch.
          expect(['noop', 'revert', 'commit']).toContain(r);
        }
      }
    }
  });
});
