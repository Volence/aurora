// ONE DOCUMENT, ONE UNDO STACK — the doc-local half, and the sibling of
// band-art-undo-stack.test.ts one document kind over.
//
// `ComposerCanvas.commitWrites` has a DOC-LOCAL tail that mutates `open.doc` in
// place and calls `markOpenDirty()`, and `applyTileCell` is a second writer that
// never reaches `commitWrites` at all. Neither recorded anything, and
// `focusedDocId()` resolved the art facet to the ZONE-ART document, so a stroke
// on a New Tile / New Block / New Chunk or a region captured off the map could
// not be taken back at all — and Ctrl+Z was not inert but aimed at another
// document's stack. Census: docs/reviews/2026-09-09-art-undo-path.md.
//
// The rule these rows pin, in both directions:
//   • a PURE doc-local document (every write lands in `open.doc`) IS the focused
//     document and owns one stack;
//   • a CHUNK document is NOT, deliberately — its pencil already records on the
//     zone-art stack, and a second stack would interleave two histories on one
//     document, which is the defect the bgOverride branch was created to close.

import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';
import { useArtStore, isPureDocLocal } from '../artStore';
import { documentHistoryHub } from '../history-hub';
import { focusedHistory, focusedDocId } from '../editorStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { recordComposerEdit } from '../composer-history';
import { createDoc, setPixels, cellAt } from '../../../core/art/composer-buffer';
import type { ComposerDoc } from '../../../core/art/composer-buffer';

const ACT_TAB = 'level:ojz:act1';
const ZONE_ART = 'zoneart:ojz';

/** A New Tile document, as art-facet.tsx builds one. */
function newTileDoc(dirty = false) {
  return { doc: createDoc(1, 1), liveTileIndex: null, chunkId: null, name: 'New Tile (1x1)', dirty };
}

/** The doc-local commit tail, exactly as ComposerCanvas runs it: record the
 *  BEFORE state, write the pixels in place, then mark the save flag. */
function docLocalStroke(value: number) {
  const doc = useArtStore.getState().open!.doc;
  recordComposerEdit();
  setPixels(doc, [], [{ x: 0, y: 0, value }]);
  useArtStore.getState().markOpenDirty();
}

/** The pixel at (0,0) through the document's own local-tile storage. */
function pixel0(doc: ComposerDoc): number {
  const local = cellAt(doc, 0, 0).localId;
  return local === null ? -1 : doc.localPixels.get(local)![0];
}

describe('a pure doc-local composer document owns one undo stack', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useWorkspaceStore.getState().reset();
    useArtStore.getState().closeDocument();
    useSessionStore.setState({ activeId: ACT_TAB });
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'art');
  });

  it('makes the composer document the focused document, not the zone art', () => {
    expect(focusedDocId()).toBe(ZONE_ART);            // plain art facet, nothing open
    useArtStore.getState().openDocument(newTileDoc());
    const id = useArtStore.getState().composerDocId;
    expect(id).toMatch(/^doc:composer:\d+$/);
    expect(focusedDocId()).toBe(id);
  });

  it('takes back a doc-local stroke, and clears dirty with it', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const doc = useArtStore.getState().open!.doc;

    docLocalStroke(7);
    expect(pixel0(doc)).toBe(7);
    expect(useArtStore.getState().open!.dirty).toBe(true);
    expect(focusedHistory()!.canUndo).toBe(true);

    focusedHistory()!.undo();
    expect(pixel0(doc)).toBe(-1);                     // back to an untouched cell
    expect(useArtStore.getState().open!.dirty).toBe(false);
  });

  it('redoes it again, dirty flag included', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const doc = useArtStore.getState().open!.doc;
    docLocalStroke(7);
    focusedHistory()!.undo();

    expect(focusedHistory()!.canRedo).toBe(true);
    focusedHistory()!.redo();
    expect(pixel0(doc)).toBe(7);
    expect(useArtStore.getState().open!.dirty).toBe(true);
  });

  // THE OTHER DIRECTION of the dirty rule, and the row that stops "just clear it
  // on undo" from passing: a region captured off the map opens DIRTY ("copied
  // off the map and not yet in the library"), so unwinding to ITS start state
  // must leave it dirty.
  it('leaves a document that OPENED dirty dirty when it is unwound', () => {
    useArtStore.getState().openDocument(newTileDoc(true));
    const doc = useArtStore.getState().open!.doc;
    docLocalStroke(7);
    focusedHistory()!.undo();
    // ⚠ THE PIXEL ASSERTION IS WHAT KEEPS THIS ROW FROM BEING VACUOUS, and it
    // was added after a mutation run: with the `focusedDocId` branch reverted the
    // undo reached the zone-art stack and did nothing, and "still dirty" was
    // trivially true. It has to say the undo HAPPENED before it can say what the
    // undo left behind.
    expect(pixel0(doc)).toBe(-1);
    expect(useArtStore.getState().open!.dirty).toBe(true);
  });

  it('restores the document in place, so the canvas keeps its identity', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const doc = useArtStore.getState().open!.doc;
    docLocalStroke(7);
    focusedHistory()!.undo();
    // Same anti-vacuous rule as the row above: an undo that did nothing also
    // leaves the object identity alone.
    expect(pixel0(doc)).toBe(-1);
    // ComposerCanvas keys its "the document changed identity" effect on
    // `open?.doc`; a restore that swapped the object would drop the marquee and
    // the stamp flips on every Ctrl+Z.
    expect(useArtStore.getState().open!.doc).toBe(doc);
  });
});

describe('and the document kinds that must NOT own one', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useWorkspaceStore.getState().reset();
    useArtStore.getState().closeDocument();
    useSessionStore.setState({ activeId: ACT_TAB });
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'art');
  });

  it('a CHUNK document keeps resolving to the zone-art stack', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: 'ojz-chunk-1', name: 'chunk', dirty: false,
    });
    expect(isPureDocLocal(useArtStore.getState().open)).toBe(false);
    expect(useArtStore.getState().composerDocId).toBeNull();
    expect(focusedDocId()).toBe(ZONE_ART);
  });

  it('a LIVE-TILE document keeps resolving to the zone-art stack', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: 4, chunkId: null, name: 'tile #4', dirty: false,
    });
    expect(useArtStore.getState().composerDocId).toBeNull();
    expect(focusedDocId()).toBe(ZONE_ART);
  });

  it('a BG-OVERRIDE document keeps resolving to the act, as it already did', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: null, chunkId: null, name: 'bg tile 0', dirty: false,
      bgOverride: { kind: 'tile', tileIndex: 0 },
    });
    expect(useArtStore.getState().composerDocId).toBeNull();
    expect(focusedDocId()).toBe(ACT_TAB);
  });

  // A doc-local stroke is only recorded where a stack exists, so `commitWrites`'
  // doc-local tail can be called unconditionally on any document kind.
  it('recording on a document with no stack is a no-op, not a throw', () => {
    useArtStore.getState().openDocument({
      doc: createDoc(2, 2), liveTileIndex: null, chunkId: 'ojz-chunk-1', name: 'chunk', dirty: false,
    });
    expect(() => recordComposerEdit()).not.toThrow();
    expect(focusedHistory()!.canUndo).toBe(false);    // the ZONE-ART stack, untouched
  });
});

describe('the stack lives exactly as long as its document', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useWorkspaceStore.getState().reset();
    useArtStore.getState().closeDocument();
    useSessionStore.setState({ activeId: ACT_TAB });
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'art');
  });

  it('a second document gets a NEW id and cannot undo into the first', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const first = useArtStore.getState().composerDocId!;
    docLocalStroke(7);
    expect(documentHistoryHub.has(first)).toBe(true);

    useArtStore.getState().openDocument(newTileDoc());
    const second = useArtStore.getState().composerDocId!;
    expect(second).not.toBe(first);
    expect(documentHistoryHub.has(first)).toBe(false);   // dropped, not leaked
    expect(focusedHistory()!.canUndo).toBe(false);
  });

  // A SAVE re-opens the same drawing as a CHUNK document
  // (state/art-composer-save.ts), which owns no stack — so the pre-save stack
  // must go with it rather than sitting in the hub unreachable.
  it('a save re-open drops the stack and leaves no composer id behind', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const first = useArtStore.getState().composerDocId!;
    docLocalStroke(7);
    useArtStore.getState().openDocument({
      doc: createDoc(1, 1), liveTileIndex: null, chunkId: 'saved-1', name: 'saved', dirty: false,
    });
    expect(documentHistoryHub.has(first)).toBe(false);
    expect(useArtStore.getState().composerDocId).toBeNull();
  });

  it('closing the document drops the stack', () => {
    useArtStore.getState().openDocument(newTileDoc());
    const id = useArtStore.getState().composerDocId!;
    docLocalStroke(7);
    useArtStore.getState().closeDocument();
    expect(documentHistoryHub.has(id)).toBe(false);
    expect(useArtStore.getState().composerDocId).toBeNull();
  });
});
