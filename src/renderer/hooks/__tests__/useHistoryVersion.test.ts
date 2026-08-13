// The repaint clock's SCOPING. The renderer suite is node-only, so there is no
// way to count React re-renders here; what is testable — and what the whole
// narrowing rests on — is the counter layer underneath the hooks: a change to
// one document's stack must advance that document's counter and no other's.
//
// Behavioural stake: TilesetPanel, ComposerCanvas, MapViewport and
// SectionGridNav key expensive caches (one OffscreenCanvas per tile in the zone,
// a full section re-prerender, a whole composer pixel buffer) on
// useAeonHistoryVersion. If a sprite document's stroke advanced that number,
// every one of those caches would be thrown away and rebuilt on every sprite
// brush stroke.

import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import { executeCommand } from '../../state/editorStore';
import { levelDocId, zoneArtDocId } from '../../shell/tabs';
import { historyVersionOf, historyVersionOfAll } from '../useHistoryVersion';

function fakeProject(): never {
  const act = (id: string) => ({ id, name: id, sections: [] });
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [act('act1'), act('act2')],
    }],
    chunkLibrary: [],
  } as never;
}

const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

function focus(actId: string, facet: 'layout' | 'art'): void {
  useProjectStore.getState().setCurrentAct('ojz', actId);
  useSessionStore.setState({ activeId: levelDocId('ojz', actId) });
  useWorkspaceStore.getState().setFacet(levelDocId('ojz', actId), facet);
}

/** The two documents useAeonHistoryVersion watches for the current zone/act. */
const aeonDocs = (actId: string) => [zoneArtDocId('ojz'), levelDocId('ojz', actId)];

describe('history repaint clock scoping', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useProjectStore.setState({ project: fakeProject() });
  });

  it('advances only the changed document\'s counter', () => {
    focus('act1', 'layout');
    const before = {
      act1: historyVersionOf(levelDocId('ojz', 'act1')),
      act2: historyVersionOf(levelDocId('ojz', 'act2')),
      sprite: historyVersionOf('doc:sprite:s1:sonic'),
    };

    executeCommand(setPal(7), getActiveLevel(useProjectStore.getState())!);

    expect(historyVersionOf(levelDocId('ojz', 'act1'))).toBe(before.act1 + 1);
    expect(historyVersionOf(levelDocId('ojz', 'act2'))).toBe(before.act2);
    expect(historyVersionOf('doc:sprite:s1:sonic')).toBe(before.sprite);
  });

  it('leaves the aeon clock untouched when a sprite document changes', () => {
    focus('act1', 'layout');
    const before = historyVersionOfAll(aeonDocs('act1'));

    documentHistoryHub.historyFor('doc:sprite:s1:sonic').undo();

    expect(historyVersionOfAll(aeonDocs('act1'))).toBe(before);
  });

  it('covers BOTH aeon documents: the act layout stack and the zone-art stack', () => {
    focus('act1', 'layout');
    const afterLayout = historyVersionOfAll(aeonDocs('act1'));
    executeCommand(setPal(1), getActiveLevel(useProjectStore.getState())!);
    expect(historyVersionOfAll(aeonDocs('act1'))).toBe(afterLayout + 1);

    // The art facet routes the same command to zoneart: — still inside scope.
    focus('act1', 'art');
    const afterArt = historyVersionOfAll(aeonDocs('act1'));
    executeCommand(setPal(2), getActiveLevel(useProjectStore.getState())!);
    expect(historyVersionOf(zoneArtDocId('ojz'))).toBeGreaterThan(0);
    expect(historyVersionOfAll(aeonDocs('act1'))).toBe(afterArt + 1);
  });

  it('does not tick the current act\'s clock for a background act tab', () => {
    focus('act2', 'layout');
    executeCommand(setPal(3), getActiveLevel(useProjectStore.getState())!);

    // Now act1 is the rendered act; act2's earlier edit must not be in its sum.
    const act1Sum = historyVersionOfAll(aeonDocs('act1'));
    documentHistoryHub.historyFor(levelDocId('ojz', 'act2')).undo();
    expect(historyVersionOfAll(aeonDocs('act1'))).toBe(act1Sum);
  });
});
