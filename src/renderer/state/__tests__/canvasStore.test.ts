import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCanvasStore, openCanvasDoc, activateCanvasDoc, closeCanvasDoc,
  canvasDocState, dirtyCanvasDocIds, saveableDirtyCanvasDocIds,
  readCanvasSnapshot, writeCanvasSnapshot,
} from '../canvasStore';
import { documentHistoryHub } from '../history-hub';
import { canvasIndex } from '../../../core/art/canvas-doc';
import { createBuffer } from '../../../core/art/pixel-ops';

const A = 'doc:canvas:alpha';
const B = 'doc:canvas:beta';

const SOURCE = {
  dir: '/p',
  pngPath: '.aurora/canvas/alpha.png',
  sidecarPath: '.aurora/canvas/alpha.canvas.json',
  pngMtimeMs: 1,
  sidecarMtimeMs: 1,
};

beforeEach(() => { useCanvasStore.getState().closeAll(); });

describe('canvasStore documents', () => {
  it('opens a document and checks it out', () => {
    openCanvasDoc(A, { name: 'alpha', width: 32, height: 24, profileId: 'genesis-level-art' });
    expect(useCanvasStore.getState().activeDocId).toBe(A);
    expect(canvasDocState(A)!.pixels.width).toBe(32);
  });

  it("keeps every document's pixels when the editor switches between them", () => {
    openCanvasDoc(A, { name: 'alpha', width: 16, height: 16, profileId: 'none' });
    const bufA = createBuffer(16, 16);
    bufA.data[0] = canvasIndex(1, 5);
    useCanvasStore.getState().setPixels(A, bufA);

    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    expect(canvasDocState(B)!.pixels.width).toBe(8);

    activateCanvasDoc(A);
    expect(useCanvasStore.getState().activeDocId).toBe(A);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(1, 5));
    expect(canvasDocState(B)!.pixels.data[0]).toBe(0);
  });

  // NOTE on sizes: blankCanvasDoc clamps to MIN_SIDE = 8, so a document asked
  // for at 4x4 is really 8x8 — and setPixels compares dimensions, so a 4x4
  // buffer would read as a RESIZE rather than a no-op. Every buffer built here
  // is therefore the document's real size.
  it('normalizes foreign transparency on the way in', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data.set([0, 16, 48, 17]);
    useCanvasStore.getState().setPixels(A, buf);
    expect(Array.from(canvasDocState(A)!.pixels.data.subarray(0, 4))).toEqual([0, 0, 0, 17]);
  });

  it('a no-op setPixels neither dirties the document nor pushes undo', () => {
    // Rule 3 from classic-tile-gesture: a gesture that changed nothing commits
    // nothing. Without this, clicking a pixel that is already the paint colour
    // costs an undo entry and a dirty dot.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const same = createBuffer(8, 8);
    useCanvasStore.getState().setPixels(A, same);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);  // a getter, not a method
  });

  it('a setPixels whose only change was a foreign transparent spelling is still a no-op', () => {
    // The normaliser runs BEFORE the no-op test, so a stroke that painted 16
    // over a 0 changed nothing once folded — and must not cost an undo entry.
    // Testing the order, not the fold: reverse the two and this goes green-dirty.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data.set([16, 32, 48, 0]);
    useCanvasStore.getState().setPixels(A, buf);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);
  });

  it('an edit dirties only its own document', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[3] = canvasIndex(0, 2);
    useCanvasStore.getState().setPixels(A, buf);
    expect(dirtyCanvasDocIds()).toEqual([A]);
  });

  it('undo restores a BACKGROUND document without checking it out', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(2, 3);
    useCanvasStore.getState().setPixels(A, buf);
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    expect(useCanvasStore.getState().activeDocId).toBe(B);

    documentHistoryHub.historyFor(A).undo();
    expect(canvasDocState(A)!.pixels.data[0]).toBe(0);
    expect(useCanvasStore.getState().activeDocId).toBe(B);   // focus did not move
  });

  it('undo takes back a profile switch and nothing else (R13)', () => {
    // The profile is an EDIT, so it is on the stack. Without recordEdit in
    // setProfile this Ctrl+Z would revert the PAINT STROKE instead and leave
    // the new profile in place — dirty, un-undoable, and silently wrong.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(2, 3);
    useCanvasStore.getState().setPixels(A, buf);
    useCanvasStore.getState().setProfile(A, 'genesis-sprite');
    expect(canvasDocState(A)!.profileId).toBe('genesis-sprite');

    documentHistoryHub.historyFor(A).undo();
    expect(canvasDocState(A)!.profileId).toBe('none');
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(2, 3)); // the stroke survived
  });

  it('closing a document drops it and its undo stack', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    closeCanvasDoc(A);
    expect(canvasDocState(A)).toBeNull();
    expect(documentHistoryHub.has(A)).toBe(false);
  });

  it('closing the ACTIVE document leaves the next focus to the tab layer', () => {
    // Not "whichever document the Map yields first": the tab strip picks the
    // neighbouring tab, and a second independent answer here would leave the
    // pane showing a document whose tab is not the active one.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    closeCanvasDoc(B);
    expect(useCanvasStore.getState().activeDocId).toBe('');
    expect(canvasDocState(A)).not.toBeNull();   // A is still open, just not focused
  });

  it('closing a BACKGROUND document leaves focus where it was', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    closeCanvasDoc(A);
    expect(useCanvasStore.getState().activeDocId).toBe(B);
  });

  it('markSaved clears dirtiness without touching pixels', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(A, SOURCE);
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    useCanvasStore.getState().markSaved(A, { pngMtimeMs: 5, sidecarMtimeMs: 6 });
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(1, 1));
    expect(useCanvasStore.getState().sourceOf(A)?.pngMtimeMs).toBe(5);
  });

  it('a dirty document with no destination is not saveable work', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    expect(dirtyCanvasDocIds()).toEqual([A]);
    expect(saveableDirtyCanvasDocIds()).toEqual([]);   // no source yet
    useCanvasStore.getState().setSource(A, SOURCE);
    expect(saveableDirtyCanvasDocIds()).toEqual([A]);
  });

  it('read/writeCanvasSnapshot reach a document by id, active or not', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    const snap = readCanvasSnapshot(A);
    snap.pixels.data[0] = canvasIndex(3, 9);
    writeCanvasSnapshot(A, snap);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(3, 9));
    expect(canvasDocState(B)!.pixels.data[0]).toBe(0);
  });

  it('a snapshot carries the profile through both directions', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'genesis-level-art' });
    const snap = readCanvasSnapshot(A);
    expect(snap.profileId).toBe('genesis-level-art');
    writeCanvasSnapshot(A, { ...snap, profileId: 'genesis-sprite' });
    expect(canvasDocState(A)!.profileId).toBe('genesis-sprite');
  });
});
