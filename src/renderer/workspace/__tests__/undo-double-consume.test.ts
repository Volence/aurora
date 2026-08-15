// WHY levelKeysEnabled() IS LOAD-BEARING — the half no test carried until Task
// 14's CDP run went looking for it.
//
// The claim written in five comments across this codebase was that reverting the
// guard makes one Ctrl+Z "fire both the canvas (or sprite) undo AND the hidden
// level undo". THAT MECHANISM DOES NOT EXIST. `LevelWorkspace`'s handler and
// `CanvasMode`'s / `SpriteMode`'s handler all call the same `focusedHistory()`,
// and `focusedDocId()` returns the ACTIVE TAB's own document for a canvas-doc or
// sprite-doc tab — so the level pane's handler resolves to the CANVAS's stack.
// The level pool cannot move. The CDP run reverted the guard and confirmed it
// does not.
//
// What actually breaks is a DOUBLE CONSUME: two registered handlers, one stack,
// one keypress — two undo entries popped, so two strokes vanish per press.
//
// This file pins that in the two pieces node can reach:
//
//   1. RESOLUTION — with a canvas tab active, `focusedHistory()` IS that
//      canvas's stack, so a live level handler is a second caller of it. This is
//      the half the old comments got wrong, so it is the half worth asserting.
//   2. ARITHMETIC — the stack pops exactly one entry per `undo()`, so N callers
//      per press cost N entries.
//
// Together those are the defect. WHAT NODE CANNOT DO is the composition: no DOM
// here, so nothing proves that both handlers are really registered on `window`
// at once and both really run for one keydown. That is Task 14's, and it was
// measured there by reverting the guard in the running app.

import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../../state/sessionStore';
import { focusedHistory, focusedDocId } from '../../state/editorStore';
import { levelKeysEnabled } from '../level-keys';
import { canvasDocTab } from '../../shell/tabs';
import { useCanvasStore, openCanvasDoc, canvasHistory } from '../../state/canvasStore';
import { documentHistoryHub } from '../../state/history-hub';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';
import { HOME_TAB } from '../../../core/shell/session';

const TAB = canvasDocTab('cliffs');

/** Draw one pixel through the store — one gesture, therefore one undo entry. */
function stroke(docId: string, value: number): void {
  const buf = createBuffer(8, 8);
  const cur = useCanvasStore.getState().docs.get(docId)!.doc.pixels;
  buf.data.set(cur.data);
  buf.data[value] = value;   // a different pixel each time, so no no-op collapse
  useCanvasStore.getState().setPixels(docId, buf);
}

beforeEach(() => {
  useCanvasStore.getState().closeAll();
  documentHistoryHub.clearAll();
  useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
});

describe('the level handler would drive the CANVAS document, not a level one', () => {
  it('focusedHistory() on a canvas tab is that canvas\'s own stack', () => {
    openCanvasDoc(TAB.id, { name: 'cliffs', width: 8, height: 8, profileId: 'none' });
    expect(focusedDocId()).toBe(TAB.id);
    // Same object, so any second handler calling focusedHistory() is a second
    // caller of THIS stack. There is no path from here to a level document.
    expect(focusedHistory()).toBe(canvasHistory(TAB.id));
  });

  it('and the guard is what keeps that second caller from running', () => {
    expect(levelKeysEnabled()).toBe(false);
  });
});

describe('one undo() per press, so two callers cost two entries', () => {
  it('a single Ctrl+Z leaves the earlier stroke intact; a doubled one does not', () => {
    openCanvasDoc(TAB.id, { name: 'cliffs', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setPaintIndex(canvasIndex(1, 1));
    stroke(TAB.id, 3);
    stroke(TAB.id, 9);
    const history = focusedHistory()!;

    // ONE press, ONE handler: the second stroke is gone, the first survives.
    history.undo();
    const after = canvasDocStatePixels();
    expect(after[3]).toBe(3);
    expect(after[9]).toBe(0);
    expect(history.canUndo).toBe(true);   // the first stroke is still undoable

    // The SAME press seen by a second, ungated handler: the first stroke goes
    // too. This is what reverting levelKeysEnabled() costs — two strokes for one
    // press, on the document the user is looking at.
    history.undo();
    expect(canvasDocStatePixels()[3]).toBe(0);
    expect(history.canUndo).toBe(false);
  });
});

function canvasDocStatePixels(): Uint8Array {
  return useCanvasStore.getState().docs.get(TAB.id)!.doc.pixels.data;
}
