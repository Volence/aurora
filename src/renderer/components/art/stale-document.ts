// WHEN THE THING THE OPEN COMPOSER DOCUMENT IS EDITING STOPS EXISTING.
//
// Undo can shrink the zone tileset below an open live tile, take a band's bank
// with it, or remove the chunk a document was opened from; Clear can empty the
// chunk library outright. The art facet has watched for all three since long
// before it was a facet module, and the watching is right: it is not what this
// module changes.
//
// WHAT IT CHANGES IS WHERE THE RULE LIVES. The three checks were inline in
// `workspace/facets/art-facet.tsx`'s effect, which the node suite cannot mount
// (no jsdom, no testing-library), so the predicate that decides a drawing's fate
// had no test and could not have one. The predicate is pure: it is a question
// about an OpenDocument and three counts of what the project still has. So it
// moves here, is total, and is driven directly by
// `__tests__/art-discard-guard.test.ts`.
//
// THE SENTENCES MOVE WITH IT, and split in two. They used to end
// "Document closed" because closing was the only outcome. Closing over unsaved
// strokes is exactly the defect ART-DOC-CLOSED-UNGUARDED reports, so the outcome
// is now the caller's decision (`confirmStaleArtDocumentClose` in
// ./open-document.ts) and only the REASON clause belongs to this module.

import type { OpenDocument } from '../../state/artStore';

/** Which of the open document's three possible targets has gone. */
export type StaleTarget =
  /** `open.liveTileIndex` is past the end of the zone tileset. */
  | { kind: 'live-tile'; tileIndex: number }
  /** `open.bgOverride` names a slot or bank the BG override document no longer has. */
  | { kind: 'bg-art' }
  /** `open.chunkId` is not in the project's chunk library. */
  | { kind: 'chunk' };

/**
 * Everything the rule needs, read by the caller so this stays pure.
 *
 * `tilesetLength` and `chunkIds` are nullable for the same load-bearing reason:
 * null means "there is no current zone / no project to compare against", which is
 * NOT the same as "the target is gone". A project mid-open, or an act with no
 * zone, would otherwise report every open document stale and close it. The old
 * inline code got that right through `&&` ordering (`zone &&`,
 * `state.project &&`); here it is a stated contract instead.
 *
 * `bgTargetExists` is nullable for a DIFFERENT reason: null means "not asked",
 * because the document is not a BG-art document. The absent-project case is
 * already folded into `false` by the provider that answers it, deliberately and
 * unchanged from the old code: `bgArtTargetExists(null, target)` is false, so a
 * band-art document whose project has gone counts as stale exactly as it did
 * before. Do not "improve" that to null without checking who then closes it.
 */
export interface StaleTargetInputs {
  open: OpenDocument | null;
  /** `zone.tileset.tiles.length`, or null when there is no current zone. */
  tilesetLength: number | null;
  /** `bgArtTargetExists(project?.bgOverride.doc ?? null, open.bgOverride)`, or
   *  null when the open document has no `bgOverride` target to ask about. */
  bgTargetExists: boolean | null;
  /** Every id in `project.chunkLibrary`, or null when there is no project. */
  chunkIds: readonly string[] | null;
}

/**
 * The first of the open document's targets that no longer exists, or null.
 *
 * ORDER IS THE OLD ORDER (live tile, then band art, then chunk) because the old
 * code returned after the first match and a document can in principle carry a
 * live tile index and a chunk id at once. Nothing produces such a document
 * today, so the order is not observable; it is preserved rather than reasoned
 * about, which is the cheaper of the two ways to be right.
 */
export function staleTarget(i: StaleTargetInputs): StaleTarget | null {
  const o = i.open;
  if (!o) return null;
  if (o.liveTileIndex !== null && i.tilesetLength !== null
    && o.liveTileIndex >= i.tilesetLength) {
    return { kind: 'live-tile', tileIndex: o.liveTileIndex };
  }
  if (o.bgOverride && i.bgTargetExists === false) return { kind: 'bg-art' };
  if (o.chunkId !== null && i.chunkIds !== null
    && !i.chunkIds.some((id) => id === o.chunkId)) {
    return { kind: 'chunk' };
  }
  return null;
}

/**
 * Why this document has lost its target, as one sentence, with no claim about
 * what happens next. The caller appends that, because it differs: a clean
 * document is closed outright and a dirty one is put to the author.
 */
export function staleTargetSentence(t: StaleTarget): string {
  switch (t.kind) {
    case 'live-tile':
      return `The tile this document was editing (#${t.tileIndex}) no longer exists (undone).`;
    case 'bg-art':
      return 'The band art this document was editing no longer exists (undone).';
    case 'chunk':
      return 'The chunk this document was editing no longer exists.';
  }
}
