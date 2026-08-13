// The agent's aeon edit tools are AMBIENT: they run against the loaded act no
// matter which tab happens to be active. Before executeAmbientCommand they
// resolved their undo document from FOCUS, so every edit tool threw (and the
// handler's try/catch turned it into an MCP error) whenever the active tab was
// Home, a tool tab, or a sprite doc — none of which own a command history.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { Color } from '../../../core/model/s4-types';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/** One zone, one act, one empty section — enough for requireProject + budget. */
function fakeProject(): never {
  return {
    zones: [{
      id: 'ojz',
      name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{ id: 'act1', name: 'act1', gridWidth: 1, gridHeight: 1, sections: [null] }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
  } as never;
}

const paletteRed = () =>
  useProjectStore.getState().project!.zones[0].palette.lines[1].colors[1].r;

describe('agent edit tools route by command scope, not by the active tab', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useProjectStore.setState({ project: fakeProject() });
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
  });

  it('set-palette succeeds with a SPRITE tab active and lands on the zone-art doc', async () => {
    useSessionStore.setState({ activeId: 'doc:sprite:aeon:Ring' });

    const colors = Array.from({ length: 16 }, (_, i) => (i === 1 ? 0x00E : 0));
    await expect(
      handleAgentRequest({ kind: 'set-palette', line: 1, colors } as never),
    ).resolves.toBeTruthy();

    expect(paletteRed()).toBeGreaterThan(0);
    expect(documentHistoryHub.historyFor('zoneart:ojz').canUndo).toBe(true);
    expect(documentHistoryHub.has('level:ojz:act1')).toBe(false);
    expect(documentHistoryHub.has('doc:sprite:aeon:Ring')).toBe(false);
  });

  it('set-palette succeeds with a TOOL tab active (no document focused at all)', async () => {
    useSessionStore.setState({ activeId: 'tool:project-setup' });

    const colors = Array.from({ length: 16 }, (_, i) => (i === 1 ? 0x0E0 : 0));
    await expect(
      handleAgentRequest({ kind: 'set-palette', line: 1, colors } as never),
    ).resolves.toBeTruthy();

    expect(documentHistoryHub.historyFor('zoneart:ojz').canUndo).toBe(true);
  });

  it('a zone-scoped agent edit is NOT recorded on the act stack even from the layout facet', async () => {
    useSessionStore.setState({ activeId: 'level:ojz:act1' });
    useWorkspaceStore.getState().setFacet('level:ojz:act1', 'layout');

    const colors = Array.from({ length: 16 }, (_, i) => (i === 1 ? 0xE00 : 0));
    await handleAgentRequest({ kind: 'set-palette', line: 1, colors } as never);

    // Recorded on the ZONE stack, which outlives the act tab — the act stack is
    // dropped when that tab closes, and a zone palette edit must survive it.
    expect(documentHistoryHub.historyFor('zoneart:ojz').canUndo).toBe(true);
    expect(documentHistoryHub.historyFor('level:ojz:act1').canUndo).toBe(false);
  });

  it('write-tiles (zone-scoped) succeeds with a sprite tab active', async () => {
    useSessionStore.setState({ activeId: 'doc:sprite:aeon:Ring' });

    await expect(handleAgentRequest({
      kind: 'write-tiles', at: 0, tiles: [Array.from({ length: 64 }, () => 1)],
    } as never)).resolves.toBeTruthy();

    expect(useProjectStore.getState().project!.zones[0].tileset.tiles.length).toBe(1);
    expect(documentHistoryHub.historyFor('zoneart:ojz').canUndo).toBe(true);
  });
});
