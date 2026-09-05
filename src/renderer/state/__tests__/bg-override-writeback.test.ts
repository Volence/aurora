// DOES A BAND EDIT REACH THE PROJECT?
//
// This file exists because of a defect that every other layer of this feature is
// blind to, and that a green suite would have shipped.
//
// `getActiveLevel` builds an S4Level VIEW — a fresh object, rebuilt on every
// gesture and again on every undo (BoundEditHistory calls its `getLevel`
// supplier each time). Every command in the tree mutates through that view into
// an object the project owns: `level.act.bgLayout = …`, `placeEffectsScene(
// level.effectsScenes, …)`. A BgAnim band command cannot, because the plan
// appliers are PURE and return a NEW document — so history.ts writes
// `level.bgOverride = applyWithBand(…)`, which on a plain data field would land
// in the throwaway view, be garbage-collected one call later, and leave:
//
//   • the store holding the pre-edit document,
//   • the panel rendering an unchanged band list,
//   • the save plan writing back the file it loaded,
//   • and every unit test of the codec, the plans and the commands still green,
//     because none of them go through a view.
//
// A wired-up editing surface that silently does nothing. The rows below are the
// only place in `vitest run` where the wiring is the subject.
//
// ANTI-VACUOUS: the first row asserts the document actually gained a band before
// anything else is claimed about it, and the last row proves the instrument can
// see a FAILURE by driving the same command through a plain-field level, where
// the write-back is genuinely absent.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { documentHistoryHub } from '../history-hub';
import { focusedHistory, executeCommand } from '../editorStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { parseBgOverride, type BgOverrideDocument } from '../../../core/formats/bg-override/bg-override';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import { makeDemoteBandCommand } from '../../../core/editing/bg-override-band';
import { EditHistory } from '../../../core/editing/history';
import type { S4Level } from '../../../core/editing/commands';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';

function loadDoc(): BgOverrideDocument {
  return parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;
}

/** A one-zone/one-act project carrying a real override document in its holder. */
function fakeProject(doc: BgOverrideDocument): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', sections: [] }],
    }],
    chunkLibrary: [],
    bgOverride: { path: 'data/editor_bg_override.json', doc, unreadable: null, loadedText: null, notices: [] },
  } as never;
}

const holderDoc = () => useProjectStore.getState().project!.bgOverride.doc!;

describe('a band command written through getActiveLevel reaches the PROJECT', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useProjectStore.setState({ project: fakeProject(loadDoc()) });
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    useSessionStore.setState({ activeId: 'level:ojz:act1' });
  });

  it('the view READS the holder, so the level the commands see is the project document', () => {
    const level = getActiveLevel(useProjectStore.getState())!;
    // Identity, not equality: a copy here would let the two drift the moment
    // either side mutated, which is the whole hazard.
    expect(level.bgOverride).toBe(holderDoc());
    // Anti-vacuous: the fixture really does carry the bands the rows below move.
    expect(documentBands(holderDoc())).toHaveLength(2);
  });

  it('DEMOTING a band through executeCommand changes the document the STORE holds', () => {
    const before = documentBands(holderDoc()).length;
    const level = getActiveLevel(useProjectStore.getState())!;
    executeCommand(makeDemoteBandCommand(holderDoc(), 1), level);

    // THE ROW. On a plain data field this reads `before`, because the new
    // document went into the view and the view is gone.
    expect(documentBands(holderDoc())).toHaveLength(before - 1);
  });

  it('UNDO puts the band back, through a level view rebuilt after the edit', () => {
    const doc0 = holderDoc();
    const bands0 = documentBands(doc0).length;
    executeCommand(
      makeDemoteBandCommand(doc0, 1), getActiveLevel(useProjectStore.getState())!);
    expect(documentBands(holderDoc())).toHaveLength(bands0 - 1);

    // BoundEditHistory.undo() takes NO level — it calls its supplier, which
    // builds a brand-new view. That is the path a user's Ctrl+Z takes, and it is
    // a different code path from the execute above.
    focusedHistory()!.undo();
    expect(documentBands(holderDoc())).toHaveLength(bands0);
    // Value-restored, not merely count-restored: the band that came back is the
    // one that left, art and all.
    expect(holderDoc()).toEqual(doc0);
  });

  it('the same command on a PLAIN-FIELD level loses the edit: the instrument can see a failure',
    () => {
      // Not a hypothetical: this IS `getActiveLevel` without the accessor, and
      // it is what the field looked like before this parcel. If this row ever
      // starts agreeing with the rows above, the rows above have stopped
      // measuring anything.
      const doc = loadDoc();
      const plain: S4Level = { sections: [], bgOverride: doc };
      new EditHistory().execute(makeDemoteBandCommand(doc, 1), plain);

      expect(documentBands(plain.bgOverride!)).toHaveLength(1);   // the view saw it
      expect(documentBands(doc)).toHaveLength(2);                 // the document did not
    });
});
