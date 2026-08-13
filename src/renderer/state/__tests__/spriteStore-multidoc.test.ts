import { describe, it, expect, beforeEach } from 'vitest';
import { useSpriteStore, openSpriteDoc, closeSpriteDoc, activateSpriteDoc } from '../spriteStore';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';

const A = 'doc:sprite:s1:18';
const B = 'doc:sprite:s1:24';

// Pixel edits reach the store through setBuffer (PixelEditController commits a
// whole frame), so "paint one pixel" is a read-modify-write of the live frame.
function paint(value: number): void {
  const s = useSpriteStore.getState();
  const cur = s.activeFrames()[s.currentIndex];
  const data = new Uint8Array(cur.data);
  data[0] = value;
  s.setBuffer({ width: cur.width, height: cur.height, data });
}

describe('sprite multi-document', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    useSpriteStore.getState().closeAll();
  });

  it('keeps two docs independent', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    paint(3);

    openSpriteDoc(B, { width: 8, height: 8 });
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(0);

    activateSpriteDoc(A);
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(3);
  });

  it('gives each doc its own undo stack', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    paint(3);

    openSpriteDoc(B, { width: 8, height: 8 });
    expect(documentHistoryHub.historyFor(B).canUndo).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(true);
  });

  it('undo in one doc does not affect the other', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    paint(3);
    openSpriteDoc(B, { width: 8, height: 8 });
    paint(5);

    documentHistoryHub.historyFor(B).undo();
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(0);

    activateSpriteDoc(A);
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(3);
  });

  // Undo must reach a doc that is NOT checked out: a background tab's dirty state
  // can be undone from the tab-close confirm.
  it('undoes a background document without activating it', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    paint(3);
    openSpriteDoc(B, { width: 8, height: 8 });

    documentHistoryHub.historyFor(A).undo();
    expect(useSpriteStore.getState().activeDocId).toBe(B);
    activateSpriteDoc(A);
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(0);
  });

  it('tracks unsavedEdits per document', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    openSpriteDoc(B, { width: 8, height: 8 });
    paint(5);   // dirties B only

    expect(useSpriteStore.getState().isDirty(B)).toBe(true);
    expect(useSpriteStore.getState().isDirty(A)).toBe(false);
  });

  it('closing a doc drops its state and its history', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    paint(3);

    closeSpriteDoc(A);
    expect(useSpriteStore.getState().isOpen(A)).toBe(false);
    expect(documentHistoryHub.has(A)).toBe(false);
  });
});
