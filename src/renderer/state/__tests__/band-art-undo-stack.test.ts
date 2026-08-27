// ONE DOCUMENT, ONE UNDO STACK — the band-art half of parcel I.
//
// A band-art stroke is made in the ART facet (the composer opened on a band
// slot / phase bank via `OpenDocument.bgOverride`) and commits through
// `executeCommand`, which records on `focusedDocId()`. The art facet maps to the
// ZONE-ART document, but the data the stroke edits — the BG override — is the
// same document `set-bg-override-layout` (map facet) and `regenerate-shift`
// (Effects facet) edit on the ACT stack. Live-app finding F1
// (docs/reviews/2026-08-26-effects-foreground-checks-2.md): `canUndo()` true in
// Art, false in Effects; Ctrl+Z on the map ignored the stroke.
//
// The rule these rows pin: while the composer shows a BG override target, the
// art facet's focused document IS the act — the stroke records there, and the
// art facet's own Ctrl+Z reaches it too. With no override target open the art
// facet still edits the zone-art document (no regression).

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useProjectStore, getActiveLevel } from '../projectStore';
import { useSessionStore } from '../sessionStore';
import { useArtStore } from '../artStore';
import { documentHistoryHub } from '../history-hub';
import { focusedHistory, focusedDocId, executeCommand } from '../editorStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { parseBgOverride, type BgOverrideDocument } from '../../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../../core/formats/bg-override/bg-anim-band';
import { openBandBankDocument, openBgTileDocument, bgArtCommitCommand } from '../../providers/bg-anim-art';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const ACT_TAB = 'level:ojz:act1';
const ZONE_ART = 'zoneart:ojz';

function loadDoc(): BgOverrideDocument {
  return parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;
}

function fakeProject(doc: BgOverrideDocument): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [{ pixels: new Uint8Array(64) }] },
      palette: { lines: [{ colors: [{ r: 0, g: 0, b: 0, a: 255 }] }] },
      acts: [{ id: 'act1', name: 'act1', sections: [] }],
    }],
    chunkLibrary: [],
    bgOverride: { path: 'data/editor_bg_override.json', doc, unreadable: null, loadedText: null, notices: [] },
  } as never;
}

const holderDoc = () => useProjectStore.getState().project!.bgOverride.doc!;
const level = () => getActiveLevel(useProjectStore.getState())!;

const setPal = (v: number) => ({
  type: 'set-palette-line', description: 't', sectionIndex: -1, line: 0,
  oldColors: [{ r: 0, g: 0, b: 0, a: 255 }], newColors: [{ r: v, g: 0, b: 0, a: 255 }],
}) as never;

/** The composer's commit for one pixel write, exactly as ComposerCanvas builds it. */
function strokeCommand(value: number) {
  const open = useArtStore.getState().open!;
  const cmd = bgArtCommitCommand(holderDoc(), open.bgOverride!, open.doc, [{ x: 0, y: 0, value }]);
  expect(cmd).not.toBeNull();   // anti-vacuous: the write really changes a pixel
  return cmd!;
}

describe('a band-art stroke from the Art facet lands on the ACT history', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    useProjectStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useArtStore.getState().closeDocument();
    useProjectStore.setState({ project: fakeProject(loadDoc()) });
    useProjectStore.getState().setCurrentAct('ojz', 'act1');
    useSessionStore.setState({ activeId: ACT_TAB });
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'art');
  });

  it('opening a phase bank in the composer makes the act the focused document', () => {
    expect(focusedDocId()).toBe(ZONE_ART);           // plain art facet
    useArtStore.getState().openDocument(openBandBankDocument(holderDoc(), 0, 0)!);
    expect(focusedDocId()).toBe(ACT_TAB);
    useArtStore.getState().closeDocument();
    expect(focusedDocId()).toBe(ZONE_ART);           // and back when it closes
  });

  it('the stroke records on the act stack, Effects/map focus can undo it, and undo restores the tile', () => {
    expect(documentBands(holderDoc())).toHaveLength(2);   // anti-vacuous: bands exist
    useArtStore.getState().openDocument(openBandBankDocument(holderDoc(), 0, 0)!);
    const base = bandSlotBases(documentBands(holderDoc()))[0];
    const before = Array.from(holderDoc().tiles[base]);
    const value = (before[0] + 1) & 0xF;

    executeCommand(strokeCommand(value), level());

    expect(holderDoc().tiles[base][0]).toBe(value);
    expect(documentHistoryHub.historyFor(ACT_TAB).canUndo).toBe(true);
    expect(documentHistoryHub.historyFor(ZONE_ART).canUndo).toBe(false);

    // The map / Effects (facet id 'parallax') facets resolve the act, and their Ctrl+Z undoes it.
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'parallax');
    expect(focusedHistory()!.canUndo).toBe(true);
    focusedHistory()!.undo();
    expect(Array.from(holderDoc().tiles[base])).toEqual(before);
    expect(Array.from(documentBands(holderDoc())[0].phases[0][0])).toEqual(before);
  });

  it("the Art facet's own Ctrl+Z reaches the stroke while the band document is open", () => {
    useArtStore.getState().openDocument(openBgTileDocument(holderDoc(), 0)!);
    const before = Array.from(holderDoc().tiles[0]);
    executeCommand(strokeCommand((before[0] + 1) & 0xF), level());

    expect(focusedHistory()).toBe(documentHistoryHub.historyFor(ACT_TAB));
    expect(focusedHistory()!.canUndo).toBe(true);
    focusedHistory()!.undo();
    expect(Array.from(holderDoc().tiles[0])).toEqual(before);
  });

  it('a stroke and a layout command from the map interleave on ONE stack in order', () => {
    useArtStore.getState().openDocument(openBgTileDocument(holderDoc(), 0)!);
    const before = Array.from(holderDoc().tiles[0]);
    executeCommand(strokeCommand((before[0] + 1) & 0xF), level());

    useWorkspaceStore.getState().setFacet(ACT_TAB, 'layout');
    const word = holderDoc().layout[0];
    executeCommand({
      type: 'set-bg-override-layout', description: 't', sectionIndex: -1,
      entries: [{ index: 0, oldWord: word, newWord: word ^ 1 }],
    } as never, level());

    const act = documentHistoryHub.historyFor(ACT_TAB);
    act.undo();                                       // the layout word first…
    expect(holderDoc().layout[0]).toBe(word);
    expect(holderDoc().tiles[0][0]).not.toBe(before[0]);
    act.undo();                                       // …then the stroke
    expect(Array.from(holderDoc().tiles[0])).toEqual(before);
    expect(act.canUndo).toBe(false);
  });

  it('a plain zone-art edit (no override target open) still lands on the zone-art stack', () => {
    executeCommand(setPal(5), level());
    expect(documentHistoryHub.historyFor(ZONE_ART).canUndo).toBe(true);
    expect(documentHistoryHub.historyFor(ACT_TAB).canUndo).toBe(false);
  });

  it('the refinement is the ART facet only: palette focus with a band doc open still edits zone art', () => {
    useArtStore.getState().openDocument(openBgTileDocument(holderDoc(), 0)!);
    useWorkspaceStore.getState().setFacet(ACT_TAB, 'palette');
    expect(focusedDocId()).toBe(ZONE_ART);
  });
});
