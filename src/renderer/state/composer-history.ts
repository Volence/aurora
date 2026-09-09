// THE ART COMPOSER'S UNDO STACK, wired to `artStore` — the counterpart of
// `spriteStore`'s `readSpriteSnapshot`/`writeSpriteSnapshot`/`recordEdit` trio,
// and written to that shape on purpose so the two read as one mechanism.
//
// WHAT THIS CLOSES. `ComposerCanvas.commitWrites` has a DOC-LOCAL tail that
// mutates `open.doc` through `setPixels` and calls `markOpenDirty()`, and
// `applyTileCell` (stamp / collision / palette-apply) is a second writer that
// never reaches `commitWrites` at all. Both recorded NOTHING, so on a document
// whose every write takes one of those paths — New Tile, New Block, New Chunk,
// and the map's "Edit block…" and marquee captures — a stroke could not be taken
// back for the whole life of the document, which for an unsaved one is its whole
// life. `markOpenDirty` is a SAVE signal; it was never a history one.
// (docs/reviews/2026-09-09-art-undo-path.md is the census that named the path.)
//
// ⚠ WHAT IT DOES NOT CLOSE, and must not be read as closing: a CHUNK document.
// Its doc-local half (`commitWrites`' empty-cell branch, and `applyTileCell` on
// any of its cells) is still un-undoable, deliberately — see
// `core/editing/composer-history.ts`'s header and `artStore.isPureDocLocal`.
//
// ⚠ RECORD BEFORE THE MUTATION, NOT AFTER. `SnapshotHistory.record` takes the
// BEFORE state and the caller applies the edit itself. The composer's mutators
// (`setPixels`, `stampTile`, `paintDocCollision`, `applyPaletteLineToDocCell`,
// `applyClipboardCollisionToDoc`) all write the document IN PLACE, so a snapshot
// taken after one of them is a snapshot of the result — an undo stack that
// restores what you just did, which looks exactly like a working one until you
// press Ctrl+Z.

import { documentHistoryHub } from './history-hub';
import { useArtStore } from './artStore';
import { cloneComposerDoc, createDoc, restoreComposerDoc } from '../../core/art/composer-buffer';
import type { ComposerSnapshot } from '../../core/editing/composer-history';
import { ComposerDocHistory } from '../../core/editing/composer-history';

/**
 * Read the live document as a snapshot. `ComposerDocHistory` deep-clones on
 * record / undo / redo, so handing over the live `doc` reference is safe — the
 * same contract `spriteStore.snap` relies on.
 *
 * Keyed by doc id and not by "whatever is open": the id is minted per document
 * and its stack is disposed the moment another document opens, so a mismatch
 * here means a stack outlived its document. Answering with a blank 1×1 rather
 * than the WRONG document's state is the honest reading of that.
 */
export function readComposerSnapshot(docId: string): ComposerSnapshot {
  const s = useArtStore.getState();
  if (s.composerDocId !== docId || !s.open) return { doc: createDoc(1, 1), dirty: false };
  return { doc: s.open.doc, dirty: s.open.dirty };
}

/**
 * Install a restored snapshot: the document's CONTENTS in place (see
 * `restoreComposerDoc` for why the object identity is kept), the dirty flag back
 * where the snapshot found it, and a `bumpDoc` so the canvas repaints.
 *
 * ⚠ THE `bumpDoc` IS LOAD-BEARING and is not covered by the hub's own change
 * signal. `ComposerCanvas`'s pixel buffer re-derives on `[open, docVersion,
 * historyVersion]`, but that `historyVersion` is `useAeonHistoryVersion()`,
 * which is scoped to the zone-art and level documents by design — a composer
 * stack is neither, so its changes never reach it. Without the bump an undo
 * would move the document and leave the picture on screen untouched.
 */
export function writeComposerSnapshot(docId: string, snapshot: ComposerSnapshot): void {
  const s = useArtStore.getState();
  if (s.composerDocId !== docId || !s.open) return;
  restoreComposerDoc(s.open.doc, snapshot.doc);
  s.setOpenDirty(snapshot.dirty);
  s.bumpDoc();
}

export function makeComposerHistory(docId: string): ComposerDocHistory {
  return new ComposerDocHistory(
    () => readComposerSnapshot(docId),
    (snapshot) => writeComposerSnapshot(docId, snapshot),
  );
}

/**
 * A DETACHED copy of the open document's current state, or null when this
 * document owns no stack.
 *
 * CLONED, unlike `readComposerSnapshot`'s live reference, because the caller
 * holds it across a mutation: the tile-space tools take one at the start of a
 * drag and commit it only if a cell actually changes, and the document is being
 * written in place the whole time in between.
 */
export function takeComposerSnapshot(): ComposerSnapshot | null {
  const s = useArtStore.getState();
  if (s.composerDocId === null || !s.open) return null;
  return { doc: cloneComposerDoc(s.open.doc), dirty: s.open.dirty };
}

/** Push a snapshot taken earlier by `takeComposerSnapshot` onto the stack. */
export function recordComposerSnapshot(snapshot: ComposerSnapshot): void {
  const docId = useArtStore.getState().composerDocId;
  if (docId === null) return;
  (documentHistoryHub.historyFor(docId) as ComposerDocHistory).record(snapshot);
}

/**
 * Record the open document's pre-edit state, if this document has a stack at
 * all. A NO-OP on every other document kind, which is what lets the call sites
 * in `ComposerCanvas` sit unconditionally in front of the doc-local writes
 * instead of each re-deciding which kind of document is open — one decision,
 * `artStore.isPureDocLocal`, made where the id is minted.
 *
 * For a write that is ALREADY KNOWN to land (a `commitWrites` batch is built
 * from a pixel diff, so it is non-empty by construction). Where landing is only
 * known afterwards, use the take/record pair above instead — a recorded step
 * that changes nothing is a Ctrl+Z that visibly does nothing, which is the
 * complaint this whole parcel exists to answer.
 */
export function recordComposerEdit(): void {
  const s = useArtStore.getState();
  if (s.composerDocId === null || !s.open) return;
  (documentHistoryHub.historyFor(s.composerDocId) as ComposerDocHistory)
    .record({ doc: s.open.doc, dirty: s.open.dirty });
}
