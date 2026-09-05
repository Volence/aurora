import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCanvasStore, openCanvasDoc, loadCanvasDoc, activateCanvasDoc, closeCanvasDoc,
  canvasDocState, dirtyCanvasDocIds, saveableDirtyCanvasDocIds,
  readCanvasSnapshot, writeCanvasSnapshot, canvasHistory,
} from '../canvasStore';
import { documentHistoryHub } from '../history-hub';
import { canvasIndex, blankCanvasDoc } from '../../../core/art/canvas-doc';
import { createBuffer } from '../../../core/art/pixel-ops';
import { CANVAS_MAX_DEPTH } from '../../../core/editing/canvas-history';

const A = 'doc:canvas:alpha';
const B = 'doc:canvas:beta';

const SOURCE = {
  dir: '/p',
  pngPath: '.aurora/canvas/alpha.png',
  sidecarPath: '.aurora/canvas/alpha.canvas.json',
  pngMtimeMs: 1,
  sidecarMtimeMs: 1,
  sidecarRejected: false,
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
    expect(useCanvasStore.getState().activeDocId).toBeNull();
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

  /**
   * R4. A save encodes the document, awaits the guarded write, then clears the
   * flag. A stroke that lands during the write is not in the bytes on disk, so
   * clearing it loses the work in silence — no dot, no close prompt, and the
   * next Ctrl+S has nothing to save. The counter the saver read before its
   * await is what tells the two apart.
   */
  it('markSaved leaves a document dirty when it was edited during the write', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(A, SOURCE);
    const first = createBuffer(8, 8);
    first.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, first);

    const atGen = useCanvasStore.getState().docs.get(A)!.editGen; // what the saver sends

    const during = createBuffer(8, 8);
    during.data[1] = canvasIndex(1, 2);
    useCanvasStore.getState().setPixels(A, during);              // painted mid-write

    const cleared = useCanvasStore.getState().markSaved(A, { pngMtimeMs: 5, sidecarMtimeMs: 6 }, atGen);
    expect(cleared).toBe(false);
    expect(useCanvasStore.getState().isDirty(A)).toBe(true);
    // The mtimes still move: those files DID land, and a stale baseline would
    // make the retry conflict on a file Aurora itself just wrote.
    expect(useCanvasStore.getState().sourceOf(A)?.pngMtimeMs).toBe(5);
  });

  it('markSaved clears when nothing moved during the write', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(A, SOURCE);
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    const atGen = useCanvasStore.getState().docs.get(A)!.editGen;
    expect(useCanvasStore.getState().markSaved(A, { pngMtimeMs: 5, sidecarMtimeMs: 6 }, atGen)).toBe(true);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
  });

  it('an undo during the write counts as an edit', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(A, SOURCE);
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    const atGen = useCanvasStore.getState().docs.get(A)!.editGen;
    canvasHistory(A).undo();
    expect(useCanvasStore.getState().markSaved(A, { pngMtimeMs: 5, sidecarMtimeMs: 6 }, atGen)).toBe(false);
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

  it('writeCanvasSnapshot installs an INDEPENDENT buffer into the named document', () => {
    // Built independently rather than by mutating the live buffer: reading a
    // snapshot hands back the document's own pixels, so the mutate-then-write
    // version passes with writeCanvasSnapshot gutted to a no-op.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    const before = readCanvasSnapshot(A);
    const pixels = createBuffer(8, 8);
    pixels.data[0] = canvasIndex(3, 9);
    writeCanvasSnapshot(A, { ...before, pixels, palette: before.palette.slice() });
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(3, 9));
    expect(canvasDocState(A)!.pixels).toBe(pixels);   // the write installed it
    expect(canvasDocState(B)!.pixels.data[0]).toBe(0);
  });

  it('readCanvasSnapshot hands back the LIVE pixel buffer, by design', () => {
    // Pinning an aliasing contract on purpose, not accidentally: the history
    // deep-clones on record and on write, so nothing it keeps is reachable from
    // here — and copying instead would clone a megabyte on every record, the
    // cost this design exists to avoid. A consumer wanting a document should
    // call canvasDocState.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    expect(readCanvasSnapshot(A).pixels).toBe(canvasDocState(A)!.pixels);
  });

  it('a snapshot carries the profile through both directions', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'genesis-level-art' });
    const snap = readCanvasSnapshot(A);
    expect(snap.profileId).toBe('genesis-level-art');
    writeCanvasSnapshot(A, { ...snap, profileId: 'genesis-sprite' });
    expect(canvasDocState(A)!.profileId).toBe('genesis-sprite');
  });

  it('a snapshot carries the grid origin through both directions', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const snap = readCanvasSnapshot(A);
    expect(snap.gridOrigin).toEqual({ originX: 0, originY: 0 });
    writeCanvasSnapshot(A, { ...snap, gridOrigin: { originX: 3, originY: 5 } });
    expect(canvasDocState(A)!.gridOrigin).toEqual({ originX: 3, originY: 5 });
  });
});

describe('setPixels refuses a size mismatch', () => {
  it('throws rather than silently resizing the document', () => {
    // The bug: a paint handler whose dep array misses docId, captured while an
    // 8x8 document was active and firing after the user switched to a 16x16 one.
    // Silently resizing destroys B's art behind an undo entry and a dirty dot
    // that make it look deliberate; silently no-op'ing hides the edit instead.
    openCanvasDoc(A, { name: 'alpha', width: 16, height: 16, profileId: 'none' });
    const wrongSize = createBuffer(8, 8);
    expect(() => useCanvasStore.getState().setPixels(A, wrongSize)).toThrow(/16x16/);
    expect(canvasDocState(A)!.pixels.width).toBe(16);      // art intact
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);  // no undo entry either
  });

  it('says nothing about a document that is not open', () => {
    // Not-open is a legitimate race (the tab closed mid-stroke), not a
    // programmer error — it stays a no-op, and must not throw on the way past.
    expect(() => useCanvasStore.getState().setPixels('doc:canvas:gone', createBuffer(8, 8))).not.toThrow();
  });
});

describe('the paint index (Task 12)', () => {
  it('starts on a paintable colour, not the eraser', () => {
    // Index 0 is transparent, so a canvas that opened with it armed would answer
    // the first stroke a new user draws with nothing visible.
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 1));
  });

  it('folds every spelling of transparency to the one index', () => {
    // Through canvasIndex, the ONE constructor. A brush holding 16 looks like
    // the eraser, paints as the eraser, and stores as a value the document's own
    // normaliser rewrites — two spellings of one colour, entering through the
    // palette rather than through a file.
    for (const v of [0, 16, 32, 48]) {
      useCanvasStore.getState().setPaintIndex(v);
      expect(useCanvasStore.getState().paintIndex).toBe(0);
    }
  });

  it('masks a value outside 0..63 instead of arming it', () => {
    // An eyedropper on a corrupt pixel is the realistic source. 200 would paint
    // a value no palette entry names and no PNG round-trip preserves.
    useCanvasStore.getState().setPaintIndex(200);
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 8));
    useCanvasStore.getState().setPaintIndex(63);
    expect(useCanvasStore.getState().paintIndex).toBe(63);
  });

  it('neither records nor dirties: it is view state', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setPaintIndex(canvasIndex(2, 3));
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);
  });
});

describe('arming the brush on the document\'s own palette (R18, BOTH doors)', () => {
  /** A zone-shaped palette: line 0 opens on black, as most zone palettes do,
   *  with the readable colours further along. */
  function zonePalette(): number[] {
    const p = new Array<number>(64).fill(0);
    p[canvasIndex(0, 1)] = 0;         // black — what the store's DEFAULT index names
    p[canvasIndex(0, 9)] = 0x0eee;    // white
    p[canvasIndex(1, 4)] = 0x0080;    // a mid green
    return p;
  }

  it('a LOADED canvas arms a visible colour, not the default black entry 1', () => {
    // THE BUG THE CDP RUN FOUND. R18's fix went into the create flow only, so a
    // canvas created in a zone opened with white armed and the SAME canvas
    // reopened next session armed entry 1 — black in a zone palette. The stroke
    // commits and the dot appears; nothing visible happens.
    const doc = blankCanvasDoc({ name: 'alpha', width: 8, height: 8, profileId: 'genesis-level-art' });
    doc.palette = zonePalette();
    loadCanvasDoc(A, doc, SOURCE);
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 9));
  });

  it('a CREATED canvas arms from the palette it was seeded with', () => {
    openCanvasDoc(A, {
      name: 'alpha', width: 8, height: 8, profileId: 'genesis-level-art', palette: zonePalette(),
    });
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 9));
  });

  it('does NOT re-arm on a plain focus change: the artist keeps their colour', () => {
    // Arming belongs to INSTALLING a document, not to looking at one: firing it
    // from activateCanvasDoc would reset the chosen colour on every tab switch.
    // The two palettes differ so the assertion can tell "left alone" from
    // "re-armed from whichever document just took focus".
    const doc = blankCanvasDoc({ name: 'alpha', width: 8, height: 8, profileId: 'none' });
    doc.palette = zonePalette();                    // brightest at line 0 entry 9
    loadCanvasDoc(A, doc, SOURCE);
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 9));

    const other = new Array<number>(64).fill(0);
    other[canvasIndex(2, 3)] = 0x0eee;              // brightest at line 2 entry 3
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none', palette: other });
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(2, 3));

    // Back and forth between two OPEN documents changes nothing.
    activateCanvasDoc(A);
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(2, 3));
    activateCanvasDoc(B);
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(2, 3));
  });

  it('is total: an all-black palette leaves the store\'s own default armed', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 1));
  });
});

describe('one gesture, one undo entry', () => {
  it('a whole stroke committed in one setPixels takes exactly one Ctrl+Z', () => {
    // Task 12's contract 3, which falls out of committing THROUGH the store: the
    // pane hands over the gesture's finished buffer once, and setPixels records
    // once. A pane that wrote per-pixel (or that called setPixels again on the
    // trailing pointerup) would leave the artist pressing Ctrl+Z once per pixel.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const stroke = createBuffer(8, 8);
    for (let x = 0; x < 8; x++) stroke.data[x] = canvasIndex(1, 4);   // one 8px stroke
    useCanvasStore.getState().setPixels(A, stroke);

    const history = documentHistoryHub.historyFor(A);
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(Array.from(canvasDocState(A)!.pixels.data.subarray(0, 8)).every((v) => v === 0)).toBe(true);
    expect(history.canUndo).toBe(false);   // the WHOLE stroke was one entry
  });
});

describe('grid origin', () => {
  it('records, so a nudge is undoable rather than merely dirtying', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setGridOrigin(A, { originX: 4, originY: 2 });
    expect(canvasDocState(A)!.gridOrigin).toEqual({ originX: 4, originY: 2 });
    expect(useCanvasStore.getState().isDirty(A)).toBe(true);

    documentHistoryHub.historyFor(A).undo();
    expect(canvasDocState(A)!.gridOrigin).toEqual({ originX: 0, originY: 0 });
  });

  it('copies the caller’s origin object', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const origin = { originX: 4, originY: 2 };
    useCanvasStore.getState().setGridOrigin(A, origin);
    origin.originX = 99;
    expect(canvasDocState(A)!.gridOrigin.originX).toBe(4);
  });

  it('a no-op setGridOrigin (same value the document already holds) neither dirties nor records', () => {
    // The two cases the missing guard used to fail: an emptied field parsed
    // back to the value already there, and re-typing an unchanged value.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setGridOrigin(A, { originX: 0, originY: 0 }); // already (0,0)
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);

    useCanvasStore.getState().setGridOrigin(A, { originX: 4, originY: 2 }); // a real change
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(true);
    useCanvasStore.getState().setGridOrigin(A, { originX: 4, originY: 2 }); // re-commit, unchanged
    documentHistoryHub.historyFor(A).undo();
    // Exactly ONE undo reaches (0,0). A second recorded entry from the
    // re-committed identical value would leave the origin at (4,2) here,
    // still one undo away from the start.
    expect(canvasDocState(A)!.gridOrigin).toEqual({ originX: 0, originY: 0 });
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);
  });

  it('PINS THE EVICTION: one committed origin edit costs exactly one undo slot, so real pixel edits at capacity all survive', () => {
    // What a per-keystroke field (typing "12" -> two calls to setGridOrigin,
    // one per digit) would have cost: TWO entries for one field edit. A test
    // that only checked "one entry per committed change" would still pass a
    // per-keystroke implementation that happened to coalesce — so this test
    // fills the stack to exactly ONE BELOW capacity with real, distinct pixel
    // edits, commits the origin exactly ONCE (what the fixed field's
    // commit-on-blur does for a whole "type 12, tab away" gesture), and then
    // undoes all the way back. If the origin edit had cost more than one slot,
    // the very FIRST pixel edit — the oldest entry in the stack — would have
    // been shifted off the bottom and be unreachable here.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const before = Array.from(canvasDocState(A)!.pixels.data); // all-transparent baseline

    const pixelEdits = CANVAS_MAX_DEPTH - 1; // leave exactly one slot for the origin commit
    for (let i = 0; i < pixelEdits; i++) {
      const buf = createBuffer(8, 8);
      buf.data.set(canvasDocState(A)!.pixels.data);
      buf.data[i % 64] = canvasIndex(1, (i % 15) + 1); // distinct, non-transparent, non-no-op
      useCanvasStore.getState().setPixels(A, buf);
    }

    useCanvasStore.getState().setGridOrigin(A, { originX: 12, originY: 0 }); // ONE commit, not one per digit

    const history = documentHistoryHub.historyFor(A);
    for (let i = 0; i < pixelEdits + 1; i++) history.undo();
    expect(Array.from(canvasDocState(A)!.pixels.data)).toEqual(before); // the first edit is reachable
    expect(history.canUndo).toBe(false); // capacity held everything; nothing was evicted
  });

  it('CONTRAST: two DIFFERENT origin commits at capacity DO evict the earliest real edit', () => {
    // The equality guard cannot save this case — both values genuinely differ
    // from what came before, exactly as two keystrokes of a per-keystroke field
    // would. This is the failure mode GridOriginField's commit-on-blur exists
    // to prevent (CanvasMode.tsx), demonstrated at the store boundary the field
    // ultimately calls into.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const before = Array.from(canvasDocState(A)!.pixels.data);

    const pixelEdits = CANVAS_MAX_DEPTH - 1;
    for (let i = 0; i < pixelEdits; i++) {
      const buf = createBuffer(8, 8);
      buf.data.set(canvasDocState(A)!.pixels.data);
      buf.data[i % 64] = canvasIndex(1, (i % 15) + 1);
      useCanvasStore.getState().setPixels(A, buf);
    }

    useCanvasStore.getState().setGridOrigin(A, { originX: 1, originY: 0 });  // "1"
    useCanvasStore.getState().setGridOrigin(A, { originX: 12, originY: 0 }); // "12"

    const history = documentHistoryHub.historyFor(A);
    for (let i = 0; i < pixelEdits + 2; i++) history.undo();
    expect(Array.from(canvasDocState(A)!.pixels.data)).not.toEqual(before); // the first edit is GONE
    expect(history.canUndo).toBe(false); // the stack is exhausted, not merely short of reaching it
  });
});

describe('focus and lifecycle', () => {
  it('activating a document that is not open focuses NOTHING', () => {
    // Not a silent return: that would leave focus on the PREVIOUS canvas, and a
    // restored tab activates before its file has been read — pane showing
    // document X under tab Y.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    expect(useCanvasStore.getState().activeDocId).toBe(A);
    activateCanvasDoc('doc:canvas:never-opened');
    expect(useCanvasStore.getState().activeDocId).toBeNull();
  });

  it('reports whether it created a document or focused an existing one', () => {
    expect(openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' })).toBe('created');
    expect(openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' })).toBe('focused');
  });

  it('reopening a closed id does not inherit the old incarnation’s undo stack', () => {
    // historyFor creates on demand, so merely READING the stack after a close
    // leaves one alive. Without the clear in openCanvasDoc, this undo writes an
    // 8x8 snapshot into a 16x16 document.
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    closeCanvasDoc(A);
    documentHistoryHub.historyFor(A);   // a consumer merely looks at the stack

    openCanvasDoc(A, { name: 'alpha', width: 16, height: 16, profileId: 'none' });
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);
    expect(canvasDocState(A)!.pixels.width).toBe(16);
  });

  it('loadCanvasDoc refuses to discard unsaved edits', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    const fresh = blankCanvasDoc({ name: 'alpha', width: 8, height: 8, profileId: 'none' });
    expect(() => loadCanvasDoc(A, fresh, null)).toThrow(/unsaved edits/);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(1, 1));
  });

  it('loadCanvasDoc replaces a CLEAN open document', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const fresh = blankCanvasDoc({ name: 'alpha', width: 16, height: 16, profileId: 'none' });
    loadCanvasDoc(A, fresh, null);
    expect(canvasDocState(A)!.pixels.width).toBe(16);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
  });

  it('closeAll drops the paint index but keeps the view preferences', () => {
    // The paint index is a raw palette INDEX, so the same number names a
    // different colour under the next project's palette — a brush that survived
    // a project switch silently recolours itself. (This test replaces the
    // identical one for the clipboard, which Task 12 removed: nothing ever wrote
    // that field, so its careful lifetime rule guarded data that could not
    // exist. The rule was real; it just belonged to this field.)
    //
    // Zoom and tool describe how the user works, not what they were working on,
    // so they stay.
    useCanvasStore.getState().setPaintIndex(canvasIndex(3, 9));
    useCanvasStore.getState().setZoom(12);
    useCanvasStore.getState().closeAll();
    expect(useCanvasStore.getState().paintIndex).toBe(canvasIndex(0, 1));
    expect(useCanvasStore.getState().zoom).toBe(12);
  });
});

describe('constraint view flags', () => {
  beforeEach(() => {
    useCanvasStore.getState().setConstraintsLive(true);
    useCanvasStore.getState().setShowClashOverlay(true);
  });

  it('default to live checking with the overlay on', () => {
    const s = useCanvasStore.getState();
    expect(s.constraintsLive).toBe(true);
    expect(s.showClashOverlay).toBe(true);
  });

  it('toggle independently', () => {
    useCanvasStore.getState().setConstraintsLive(false);
    expect(useCanvasStore.getState().showClashOverlay).toBe(true);
    useCanvasStore.getState().setShowClashOverlay(false);
    expect(useCanvasStore.getState().constraintsLive).toBe(false);
  });

  // They are VIEW state: no undo entry, no dirty dot. A document that checks
  // nothing permanently is the `none` profile, not this flag — and a flag that
  // dirtied the document would put an unsaved dot on a canvas nobody edited.
  it('do not dirty a document or record undo', () => {
    openCanvasDoc(A, { name: 'alpha', width: 16, height: 16, profileId: 'genesis-level-art' });
    const before = canvasHistory(A).canUndo;
    useCanvasStore.getState().setConstraintsLive(false);
    useCanvasStore.getState().setShowClashOverlay(false);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(canvasHistory(A).canUndo).toBe(before);
    closeCanvasDoc(A);
  });
});
