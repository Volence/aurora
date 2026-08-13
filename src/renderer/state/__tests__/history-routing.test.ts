// Classic edits must land on the undo stack of the DOCUMENT they change: layout
// edits on `level:<zone>:<act>`, zone-art edits on `zoneart:<zone>`. The old
// single classic history put a palette edit and a layout stamp on one stack, so
// a new edit anywhere killed every other facet's redo — the failure this splits.

import { describe, it, expect, beforeEach } from 'vitest';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';
import {
  useClassicLevelStore,
  layoutDocIdForCurrentAct,
  zoneArtDocIdForCurrentZone,
  commitLayout,
  commitArt,
  classicSetStart,
  classicSetPalette,
  classicSetLayoutCells,
} from '../classicLevelStore';
import { useClassicProjectStore } from '../classicProjectStore';
import { focusedHistory } from '../editorStore';
import { useSessionStore } from '../sessionStore';
import { useSpriteStore, openSpriteDoc } from '../spriteStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { focusClassicSurface } from '../../components/classic/classic-surface';
import { openReady } from './helpers/classic-fixture';

const st = () => useClassicLevelStore.getState();

describe('classic commit routing', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    openReady();
  });

  it('a start-position edit lands on the LAYOUT stack only', () => {
    const layout = documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetStart(64, 64);

    expect(layout.canUndo).toBe(true);
    expect(art.canUndo).toBe(false);
  });

  it('a palette edit lands on the ART stack only', () => {
    const layout = documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));

    expect(art.canUndo).toBe(true);
    expect(layout.canUndo).toBe(false);
  });

  it('undoing a layout edit does not disturb the art stack redo', () => {
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));
    art.undo();
    expect(art.canRedo).toBe(true);

    classicSetStart(96, 96);          // a new edit on a DIFFERENT document
    expect(art.canRedo).toBe(true);   // must survive — this is what killed the undo-bus
  });

  it('a start-position undo restores the previous start', () => {
    const before = st().doc!.start;
    classicSetStart(128, 128);
    documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!).undo();
    expect(st().doc!.start).toEqual(before);
  });

  it('a palette undo restores the previous line', () => {
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));
    documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!).undo();
    expect(st().doc!.palettes[1][0]).toBe(0);
  });

  // --- Domain-partition guard --------------------------------------------
  // The split is only sound because every commit site is single-domain. These
  // two prove a future cross-domain call site fails loudly instead of silently
  // recording the wrong document's snapshot.

  it('commitLayout rejects a dirty patch carrying an art domain', () => {
    expect(() => commitLayout(st().doc!, { palette: true }, { kind: 'none' }))
      .toThrow(/commitLayout.*palette/);
  });

  it('commitArt rejects a dirty patch carrying a layout domain', () => {
    expect(() => commitArt(st().doc!, { fg: true }, { kind: 'none' }))
      .toThrow(/commitArt.*fg/);
  });

  // The hub's level:/zoneart: factories pick the stack type from classicIsOpen()
  // at CONSTRUCTION time, so a stack built outside a classic 'open' status is an
  // aeon BoundEditHistory with no .record. The commits used to cast, which turned
  // that into "record is not a function" from deep inside an edit. No live repro
  // is constructible today (timing saves it), so this test forces the shape.
  it.each([
    ['commitLayout', () => commitLayout(st().doc!, { fg: true }, { kind: 'none' }), layoutDocIdForCurrentAct],
    ['commitArt', () => commitArt(st().doc!, { palette: true }, { kind: 'none' }), zoneArtDocIdForCurrentZone],
  ])('%s names the document when its stack was built for the other engine', (_name, commit, docId) => {
    documentHistoryHub.clearAll();
    // Build the stack while classic is NOT open — the aeon branch of the factory.
    useClassicProjectStore.setState({ status: 'opening' } as never);
    documentHistoryHub.historyFor(docId()!);
    useClassicProjectStore.setState({ status: 'open' } as never);

    expect(commit).toThrow(new RegExp(`${docId()}.*BoundEditHistory`));
  });
});

// --- Dirty-flag ownership ------------------------------------------------
// Each document's snapshot owns only its own domains' dirty flags. When the two
// stacks were split, both snapshots still captured (and restored) the WHOLE
// dirty map, so undoing on one stack silently wiped the other document's unsaved
// -changes flags — the UI then reported "nothing to save" over real edits.

describe('classic dirty-flag ownership across the two stacks', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    openReady();
  });

  it('undoing a layout edit leaves the art domain dirty flag (and art content) intact', () => {
    classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 1 }]); // LAYOUT
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));    // ART
    expect(st().dirty).toEqual({ fg: true, palette: true });

    documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!).undo();

    expect(st().dirty.palette).toBe(true);            // the art edit is still unsaved
    expect(st().dirty.fg).toBeUndefined();            // ...and the layout edit is gone
    expect(st().doc!.palettes[1][0]).toBe(0x0e0e);    // art content untouched
  });

  it('undoing an art edit leaves the layout domain dirty flag (and layout content) intact', () => {
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));    // ART
    classicSetStart(64, 64);                                   // LAYOUT
    expect(st().dirty).toEqual({ palette: true, start: true });

    documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!).undo();

    expect(st().dirty.start).toBe(true);              // the layout edit is still unsaved
    expect(st().dirty.palette).toBeUndefined();
    expect(st().doc!.start).toEqual({ x: 64, y: 64 }); // layout content untouched
  });

  it('restoring still CLEARS a flag that was clean in the snapshot', () => {
    // Guards against "fix" by merge: a merge can only ever set flags, so undoing
    // back to the pristine state would leave `start` dirty forever.
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));    // ART, first
    classicSetStart(64, 64);                                   // LAYOUT

    documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!).undo();

    expect(st().dirty.start).toBeUndefined();
    expect(st().dirty.palette).toBe(true);
  });
});

// --- Focus routing -------------------------------------------------------
// The UI has ONE undo entry point (focusedHistory); which document it drives is
// decided here, by the active tab plus the focused facet.

describe('focusedHistory', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    useWorkspaceStore.getState().reset();
    useSpriteStore.getState().closeAll();
    openReady();
  });

  it('returns the LAYOUT doc stack when a map facet is focused', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'layout');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('level:ghz:1'));
  });

  it('returns the ZONE-ART doc stack when the art facet is focused', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'art');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('zoneart:ghz'));
  });

  it('returns the ZONE-ART doc stack for the palette facet too', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'palette');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('zoneart:ghz'));
  });

  it('returns the SPRITE doc stack when a sprite tab is active', () => {
    useSessionStore.setState({ activeId: 'doc:sprite:s1:18' });
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('doc:sprite:s1:18'));
  });

  it('returns null when no document is focused', () => {
    useSessionStore.setState({ activeId: 'tool:project-setup' });
    expect(focusedHistory()).toBeNull();
  });

  // The two tests below are the point of the whole exercise: the SAME keystroke
  // must revert a different edit depending on what the user is looking at.

  it('undo with the art facet focused reverts the ART edit, leaving the layout edit', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 1 }]);   // LAYOUT
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));      // ART

    useWorkspaceStore.getState().setFacet('level:ghz:1', 'art');
    focusedHistory()!.undo();

    expect(st().doc!.palettes[1][0]).toBe(0);      // the art edit is gone
    expect(st().doc!.fg.cells[0]).toBe(1);         // the layout edit survives
  });

  // --- Classic surfaces drive the facet -----------------------------------
  // The classic view has no facet bar, so nothing used to call setFacet for a
  // classic tab: facetFor fell back to 'layout' and a Ctrl+Z after an art edit
  // reverted an unrelated LAYOUT step while leaving the art edit in place. The
  // classic surfaces now claim the facet as the user works in them.

  it('working in the classic ART surface routes undo to the zone-art document', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    focusClassicSurface('art');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('zoneart:ghz'));
  });

  it('working in the classic MAP surface routes undo back to the act layout document', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    focusClassicSurface('art');
    focusClassicSurface('map');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('level:ghz:1'));
  });

  it('undo after a classic art edit reverts the ART edit, leaving the layout edit', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    focusClassicSurface('map');
    classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 1 }]);   // in the map surface
    focusClassicSurface('art');
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));      // in the composer/palette

    focusedHistory()!.undo();

    expect(st().doc!.palettes[1][0]).toBe(0);      // the art edit is gone
    expect(st().doc!.fg.cells[0]).toBe(1);         // the layout edit survives
  });

  it('leaves the facet alone when the active tab is not a level tab', () => {
    useSessionStore.setState({ activeId: 'doc:sprite:s1:18' });
    focusClassicSurface('art');
    expect(useWorkspaceStore.getState().record['doc:sprite:s1:18']).toBeUndefined();
  });

  it('undo with a sprite tab focused reverts THAT sprite document', () => {
    const docId = 'doc:sprite:s1:18';
    openSpriteDoc(docId, { width: 8, height: 8 });
    useSessionStore.setState({ activeId: docId });

    useSpriteStore.getState().setBuffer({ width: 8, height: 8, data: new Uint8Array(64).fill(3) });
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(3);

    focusedHistory()!.undo();
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(0);
  });
});
