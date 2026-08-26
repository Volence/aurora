// A SEEDED BAND LENS CAN BE PUT OUT.
//
// `setBandCandidate` lights the lens as a side-effect (that is the lift item 43
// wave 1 built), and until parcel A nothing in the UI ever wrote `null` back.
// These rows pin the store half: seeding lights, clearing yields exactly null,
// the candidate geometry survives the clear (Hide is not Reset), and none of
// it touches the undo stack — the lens is chrome, not an edit.

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, focusedHistory } from '../editorStore';
import { documentHistoryHub } from '../history-hub';

describe('band lens: seed then clear', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useEditorStore.setState({ bandLensTarget: null, bandCandidate: { staticBase: 0, cols: 1, rows: 1 } });
  });

  it('seeding a candidate lights the lens (anti-vacuous)', () => {
    useEditorStore.getState().setBandCandidate({ staticBase: 7 });
    expect(useEditorStore.getState().bandLensTarget).toEqual({ kind: 'candidate' });
  });

  it('clearing after a candidate seed yields null and keeps the candidate', () => {
    const ed = useEditorStore.getState();
    ed.setBandCandidate({ staticBase: 7, cols: 2, rows: 4 });
    ed.setBandLensTarget(null);
    expect(useEditorStore.getState().bandLensTarget).toBe(null);
    expect(useEditorStore.getState().bandCandidate).toEqual({ staticBase: 7, cols: 2, rows: 4 });
  });

  it('clearing after a band selection yields null too', () => {
    const ed = useEditorStore.getState();
    ed.setBandLensTarget({ kind: 'band', index: 1 });
    ed.setBandLensTarget(null);
    expect(useEditorStore.getState().bandLensTarget).toBe(null);
  });

  it('none of it is an edit: no history is created or grown', () => {
    const ed = useEditorStore.getState();
    ed.setBandCandidate({ staticBase: 3 });
    ed.setBandLensTarget(null);
    const h = focusedHistory();
    expect(h === null || !h.canUndo).toBe(true);
  });
});
