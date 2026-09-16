// WHERE A `set-regions` COMMAND IS RECORDED.
//
// `commandDocId` (editorStore.ts) is the one place a command's data is matched
// to the document whose undo stack owns it. A command missing from the
// zone-scoped list is recorded on the ACT stack, which is right for regions
// (`{dataPath}regions.json` is one act's file) and would be wrong for anything
// project- or zone-level. The list's own comment says to keep it in step with
// `applyCommand`; this file is the row that notices if the two disagree about
// `set-regions`.
//
// It is a UNIT row over two pure-ish functions and deliberately not a second
// copy of switch-window-edit.test.ts's whole-app drive: the claim here is "the
// scope decision is act, and the id is the current act's", not "the app routes
// undo correctly end to end".

import { describe, it, expect, beforeEach } from 'vitest';
import { commandDocId, isZoneScopedCommand } from '../editorStore';
import { useProjectStore } from '../projectStore';
import { levelDocId, zoneArtDocId } from '../../shell/tabs';
import type { SetRegionsCommand } from '../../../core/editing/commands';

const setRegions: SetRegionsCommand = {
  type: 'set-regions',
  description: 'Regions',
  sectionIndex: -1,
  oldDocument: null,
  newDocument: { schema: 1, act: 'ojz_act1', regions: [
    { id: 'sec0', name: 'Forest', preset: 'OJZ_Preset_Sec0', rect: { x: 0, y: 0, w: 2048, h: 2048 } },
  ] },
};

describe('set-regions routing', () => {
  beforeEach(() => {
    useProjectStore.setState({ currentZoneId: 'ojz', currentActId: 'act1' });
  });

  it('is ACT-scoped, so it records on the act stack and not the zone art stack', () => {
    expect(isZoneScopedCommand(setRegions)).toBe(false);
    expect(commandDocId(setRegions)).toBe(levelDocId('ojz', 'act1'));
    // ANTI-VACUOUS: the same call really does answer something ELSE for a
    // zone-scoped command, so "not the zone id" is a measurement and not a
    // consequence of both ids being null.
    expect(commandDocId({
      type: 'set-palette-line', description: 'p', sectionIndex: -1,
      line: 0, oldColors: [], newColors: [],
    })).toBe(zoneArtDocId('ojz'));
    expect(levelDocId('ojz', 'act1')).not.toBe(zoneArtDocId('ojz'));
  });

  it('follows the CURRENT act, so two open acts keep their own regions history', () => {
    useProjectStore.setState({ currentZoneId: 'ojz', currentActId: 'act2' });
    expect(commandDocId(setRegions)).toBe(levelDocId('ojz', 'act2'));
  });

  it('has no document at all when no act is current', () => {
    useProjectStore.setState({ currentZoneId: 'ojz', currentActId: null });
    expect(commandDocId(setRegions)).toBeNull();
  });
});
