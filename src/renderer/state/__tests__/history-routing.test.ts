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
} from '../classicLevelStore';
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
});
