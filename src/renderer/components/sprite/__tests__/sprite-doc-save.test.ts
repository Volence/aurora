// saveSpriteArt addresses its document BY ID (spriteDocState / patchSpriteDoc),
// so saving a background sprite tab writes that tab without checking it out.
// Getting the targeting wrong is a data-integrity bug in both directions: one
// tab's pixels written into another tab's file, or a save that silently writes
// nothing. See save-art-dirty-window.test.ts for why the checkout that used to
// stand in for this had to go.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSpriteDocArt, saveAllSpriteArt } from '../export-sprite';
import {
  useSpriteStore, openSpriteDoc, saveableDirtySpriteDocIds,
} from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';

const CHECKED_OUT = 'doc:sprite:s1:13';
const PARKED = 'doc:sprite:s1:28';

/** An S1 art source stands in for "this document has somewhere to save back to".
 *  Never actually written here — the tests below stop before any IPC. */
const FAKE_SOURCE = { basePath: '/p', relPath: 'X.nem' } as never;

const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  useSpriteStore.getState().closeAll();
});

describe('saveSpriteDocArt', () => {
  it('writes the TARGET document, not whichever one happens to be checked out', async () => {
    // The parked document has no save-back source, the checked-out one does — so
    // "no S1 art source" proves the parked document is what got saved. A save
    // that ignored the target would instead have written the checked-out one.
    openSpriteDoc(PARKED, { width: 8, height: 8 });
    openSpriteDoc(CHECKED_OUT, { width: 8, height: 8 });
    useSpriteStore.getState().setS1ArtSource(FAKE_SOURCE);

    await saveSpriteDocArt(PARKED);

    expect(lastToast()?.message).toMatch(/no S1 art source/);
    expect(lastToast()?.type).toBe('error');
  });

  it('leaves the checked-out document exactly where it was', async () => {
    openSpriteDoc(PARKED, { width: 8, height: 8 });
    openSpriteDoc(CHECKED_OUT, { width: 8, height: 8 });
    useSpriteStore.getState().setS1ArtSource(FAKE_SOURCE);

    await saveSpriteDocArt(PARKED);

    const s = useSpriteStore.getState();
    expect(s.activeDocId).toBe(CHECKED_OUT);      // the user's view is where they left it
    expect(s.s1ArtSource).toBe(FAKE_SOURCE);      // with its own state, not the other doc's
    expect(s.isOpen(PARKED)).toBe(true);          // and the target is still open
  });

  it('is a no-op for a document that is not open', async () => {
    openSpriteDoc(CHECKED_OUT, { width: 8, height: 8 });
    await saveSpriteDocArt('doc:sprite:s1:99');
    expect(useSpriteStore.getState().activeDocId).toBe(CHECKED_OUT);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});

describe('saveAllSpriteArt', () => {
  it('visits only documents with BOTH unsaved edits and a save-back target', async () => {
    openSpriteDoc(PARKED, { width: 8, height: 8 });
    useSpriteStore.getState().clearCanvas();        // dirty, but no art source
    openSpriteDoc(CHECKED_OUT, { width: 8, height: 8 });
    useSpriteStore.getState().setS1ArtSource(FAKE_SOURCE); // a source, but clean

    expect(saveableDirtySpriteDocIds()).toEqual([]);
    await saveAllSpriteArt();
    expect(useToastStore.getState().toasts).toEqual([]); // nothing was attempted
  });
});
