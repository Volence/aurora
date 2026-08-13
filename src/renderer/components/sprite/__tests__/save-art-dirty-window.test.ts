// The dirty flag must never be cleared over bytes that were not written.
//
// saveSpriteArt encodes the frames it read BEFORE awaiting the guarded write. An
// edit committed while that await is in flight is not in the bytes on disk, so
// clearing `unsavedEdits` afterwards parks real work with no dirty dot — it
// vanishes on close with no prompt. Ctrl+S (saveAllSpriteArt) makes this routine
// rather than theoretical: it walks every dirty document with a save-back target.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveSpriteArt, saveSpriteDocArt } from '../export-sprite';
import {
  useSpriteStore, openSpriteDoc, spriteDocState, type S1ArtSource,
} from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';
import { createBuffer } from '../../../../core/art/pixel-ops';

/** A save-back target the encoder actually accepts: one 8x8 tile and one frame
 *  with no pieces, so buildEditedTiles round-trips and the Nemesis self-check
 *  passes. The write itself is stubbed. */
function realSource(): S1ArtSource {
  return {
    basePath: '/p', relPath: 'X.nem', expectedMtimeMs: 1,
    originalTiles: [{ pixels: new Uint8Array(64) }],
    mappings: [{ id: 'f0', pieces: [] }],
    originX: 0, originY: 0, frameCount: 1,
  };
}

/** Resolve the pending writeGuarded call — the test's hook into the await window. */
let releaseWrite: (() => void) | null = null;

beforeEach(() => {
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
  (globalThis as unknown as { window: unknown }).window = {
    api: {
      writeGuarded: () => new Promise((resolve) => {
        releaseWrite = () => resolve({ newMtimes: { 'X.nem': 2 }, failed: null });
      }),
    },
  };
});

afterEach(() => {
  releaseWrite = null;
  delete (globalThis as unknown as { window?: unknown }).window;
  useSpriteStore.getState().closeAll();
});

/** Spin the microtask queue until writeGuarded has actually been reached. */
async function untilWriteStarted(): Promise<void> {
  for (let i = 0; i < 50 && !releaseWrite; i++) await Promise.resolve();
}

describe('an edit landing during the write keeps the document dirty', () => {
  it('the CHECKED-OUT document stays dirty when a stroke commits mid-write', async () => {
    useSpriteStore.setState({
      s1ArtSource: realSource(),
      frames: [createBuffer(8, 8)],
      currentIndex: 0,
      unsavedEdits: true,
    });

    const saving = saveSpriteArt();
    await untilWriteStarted();

    // A stroke commits while the bytes are in flight: it is NOT in what was
    // written, so it must survive as unsaved work.
    const edited = createBuffer(8, 8);
    edited.data[0] = 5;
    useSpriteStore.getState().setBuffer(edited);

    releaseWrite!();
    await saving;

    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    // The write still succeeded — the baseline mtime is refreshed either way.
    expect(useSpriteStore.getState().s1ArtSource?.expectedMtimeMs).toBe(2);
  });

  it('clears the flag when nothing changed during the write', async () => {
    useSpriteStore.setState({
      s1ArtSource: realSource(),
      frames: [createBuffer(8, 8)],
      currentIndex: 0,
      unsavedEdits: true,
    });

    const saving = saveSpriteArt();
    await untilWriteStarted();
    releaseWrite!();
    await saving;

    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
  });

  it('saves a PARKED document without ever checking it out', async () => {
    const PARKED = 'doc:sprite:s1:28';
    const ACTIVE = 'doc:sprite:s1:13';
    openSpriteDoc(PARKED, { width: 8, height: 8 });
    useSpriteStore.setState({ s1ArtSource: realSource(), unsavedEdits: true });
    openSpriteDoc(ACTIVE, { width: 8, height: 8 });

    const saving = saveSpriteDocArt(PARKED);
    await untilWriteStarted();
    // The user's view never moved to the document being written.
    expect(useSpriteStore.getState().activeDocId).toBe(ACTIVE);
    releaseWrite!();
    await saving;

    expect(useSpriteStore.getState().activeDocId).toBe(ACTIVE);
    expect(spriteDocState(PARKED)!.unsavedEdits).toBe(false);
    expect(spriteDocState(PARKED)!.s1ArtSource?.expectedMtimeMs).toBe(2);
    // The checked-out document is untouched by another document's save.
    expect(useSpriteStore.getState().s1ArtSource).toBe(null);
  });

  it('an edit to the CHECKED-OUT doc during a PARKED doc save dirties neither wrongly', async () => {
    const PARKED = 'doc:sprite:s1:28';
    const ACTIVE = 'doc:sprite:s1:13';
    openSpriteDoc(PARKED, { width: 8, height: 8 });
    useSpriteStore.setState({ s1ArtSource: realSource(), unsavedEdits: true });
    openSpriteDoc(ACTIVE, { width: 8, height: 8 });

    const saving = saveSpriteDocArt(PARKED);
    await untilWriteStarted();
    const edited = createBuffer(8, 8);
    edited.data[0] = 7;
    useSpriteStore.getState().setBuffer(edited);   // lands on ACTIVE, not PARKED
    releaseWrite!();
    await saving;

    expect(spriteDocState(PARKED)!.unsavedEdits).toBe(false); // its bytes did reach disk
    expect(useSpriteStore.getState().unsavedEdits).toBe(true); // the stroke's own doc
    expect(spriteDocState(PARKED)!.frames[0].data[0]).toBe(0); // no cross-contamination
  });
});
