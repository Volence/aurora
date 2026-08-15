import { describe, it, expect, beforeEach } from 'vitest';
import { canvasDocTab, parseCanvasDocTabId, isCanvasDocTabId } from '../tabs';
import { focusedDocId } from '../../state/editorStore';
import { levelKeysEnabled } from '../../workspace/level-keys';
import { useSessionStore } from '../../state/sessionStore';
import { documentHistoryHub } from '../../state/history-hub';
import { CanvasDocHistory } from '../../../core/editing/canvas-history';
import { openCanvasDoc, useCanvasStore } from '../../state/canvasStore';
import { HOME_TAB } from '../../../core/shell/session';

const TAB = canvasDocTab('sky-tiles');

beforeEach(() => {
  useCanvasStore.getState().closeAll();
  useSessionStore.setState({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
});

describe('canvas tab ids', () => {
  it('builds and parses a canvas doc tab', () => {
    expect(TAB.id).toBe('doc:canvas:sky-tiles');
    expect(TAB.kind).toBe('art-doc');
    expect(parseCanvasDocTabId(TAB.id)).toEqual({ name: 'sky-tiles' });
    expect(isCanvasDocTabId(TAB.id)).toBe(true);
  });

  it('does not parse a sprite doc, a level tab or Home', () => {
    expect(parseCanvasDocTabId('doc:sprite:s1:42')).toBeNull();
    expect(parseCanvasDocTabId('level:ghz:1')).toBeNull();
    expect(parseCanvasDocTabId('home')).toBeNull();
    expect(parseCanvasDocTabId('doc:canvas:')).toBeNull();  // no empty name
  });
});

describe('canvas undo routing', () => {
  it('builds a CanvasDocHistory for a doc:canvas: id', () => {
    openCanvasDoc(TAB.id, { name: 'sky-tiles', width: 8, height: 8, profileId: 'none' });
    expect(documentHistoryHub.historyFor(TAB.id)).toBeInstanceOf(CanvasDocHistory);
  });

  it('focusedDocId points at the canvas document while its tab is active', () => {
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    expect(focusedDocId()).toBe(TAB.id);
  });

  it('focusedDocId still resolves a sprite tab and Home', () => {
    // The canvas branch sits between the sprite branch and the level parse, so
    // it is placed where it could shadow either. Both neighbours stay pinned.
    useSessionStore.setState({ tabs: [HOME_TAB], activeId: 'doc:sprite:s1:42' });
    expect(focusedDocId()).toBe('doc:sprite:s1:42');
    useSessionStore.setState({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
    expect(focusedDocId()).toBeNull();
  });
});

describe('keyboard handoff', () => {
  it('level key handlers are inert while a canvas tab is active', () => {
    // Same rule sprite docs already have: the level editors stay MOUNTED behind
    // the canvas pane, so without this a single Ctrl+Z reaches TWO handlers that
    // both resolve focusedHistory() — the canvas's own stack — and consumes two
    // undo entries. (Not "canvas undo plus level undo": focusedDocId returns the
    // canvas tab's document, so the level pool is never reachable. Corrected
    // after Task 14 measured it; see workspace/level-keys.ts.)
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    expect(levelKeysEnabled()).toBe(false);
  });

  it('level key handlers are live on a level tab', () => {
    useSessionStore.setState({ tabs: [HOME_TAB], activeId: 'level:ghz:1' });
    expect(levelKeysEnabled()).toBe(true);
  });
});
