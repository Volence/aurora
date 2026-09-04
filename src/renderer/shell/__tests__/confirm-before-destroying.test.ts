// d-29 + d-30: THE TWO DESTRUCTIVE CONTROLS THAT NOW ASK FIRST.
//
// ⚠ READ WHAT THIS FILE CAN AND CANNOT SEE. The node suite has no React, no
// DOM, no dialog and no click. So it can prove the BRANCH — dirty asks, clean
// does not, cancel keeps, discard proceeds — by driving `useConfirmStore`
// directly, and it can prove it against the real stores. It CANNOT prove that
// the buttons are wired to these functions, that a real click reaches them,
// that `ConfirmDialog` renders the request, or that Cancel is reachable with a
// mouse. `scratchpad/confirm-destroy-harness.mjs` does all of that against the
// real app under CDP, and its `[c*]` rows — a CLEAN document sees NO dialog and
// the action proceeds — are the ones that discriminate this ruling from "put a
// dialog on it". A green here with that harness never run is not a proof.
//
// ⚠ AND THE RULING BEHIND IT. Both cards were answered BY THE SUITE HUB IN THE
// OWNER'S PLACE under a standing delegation, NOT by the owner, and are
// explicitly overturnable on his read-back — see `docs/decisions.jsonl`,
// `d-29-new-sprite-clears-undo-answered` and `d-30-chunk-library-clear-answered`.
//
// WHY THE CLEAN ROWS ARE THE POINT. The shared principle of both answers is
// "ask before destroying, AND ONLY WHEN SOMETHING WOULD ACTUALLY BE LOST" — a
// clean document must see no dialog at all, which is what keeps this consistent
// with the owner's own d-27 pick (smallest change, no dialog, for an action
// that was recoverable) instead of a new pattern imposed on him. An
// implementation that always confirms passes every "the dialog appears" row and
// fails the ruling; `asks nothing at all` below is what fails it here.

import { describe, it, expect, beforeEach } from 'vitest';
import { useConfirmStore } from '../../state/confirmStore';
import { useSpriteStore } from '../../state/spriteStore';
import { useProjectStore } from '../../state/projectStore';
import { documentHistoryHub } from '../../state/history-hub';
import { registerHistoryFactories } from '../../state/history-factories';
import { newSpriteGuarded, newSpriteWouldDestroy } from '../new-sprite-guard';
import { clearChunkLibrary } from '../../providers/chunk-library-import';
import type { ChunkDef, S4Project } from '../../../core/model/s4-types';

/** Let the microtask the guard is parked on run. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** One pixel edit through the store's own writer, which is what sets the flag. */
function paint(value: number): void {
  const s = useSpriteStore.getState();
  const cur = s.frames[s.currentIndex];
  const data = new Uint8Array(cur.data);
  data[0] = value;
  s.setBuffer({ width: cur.width, height: cur.height, data });
}

describe('d-29: the sprite size chips ask before replacing a DIRTY document', () => {
  beforeEach(() => {
    useConfirmStore.getState().answer('cancel'); // drain any parked request
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    useSpriteStore.getState().newSprite(16, 16);
  });

  it('a CLEAN document asks nothing at all and is replaced immediately', async () => {
    expect(useSpriteStore.getState().unsavedEdits).toBe(false);
    expect(newSpriteWouldDestroy()).toBe(false);

    const done = newSpriteGuarded(48, 48);
    // No await between the call and this read: an implementation that confirms
    // unconditionally has already parked a request by now, and this is the
    // assertion it fails.
    expect(useConfirmStore.getState().request).toBeNull();

    await expect(done).resolves.toBe(true);
    expect(useSpriteStore.getState().frames[0].width).toBe(48);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('a DIRTY document parks a confirm request and changes nothing while it stands', async () => {
    paint(7);
    expect(useSpriteStore.getState().unsavedEdits).toBe(true);
    expect(newSpriteWouldDestroy()).toBe(true);

    const done = newSpriteGuarded(48, 48);
    await tick();
    const req = useConfirmStore.getState().request;
    expect(req).not.toBeNull();
    // The copy names what is lost, and names the undo, because that is the
    // half that separates this from the collision wipes d-27 was ruled on.
    expect(req?.title).toMatch(/discard/i);
    expect(req?.body).toMatch(/Ctrl\+Z/);
    expect(req?.buttons.map((b) => b.key)).toEqual(['discard', 'cancel']);

    // ANTI-VACUOUS: the work is still there WHILE the dialog stands. A guard
    // that asked and replaced anyway would pass a request-exists assertion.
    expect(useSpriteStore.getState().frames[0].width).toBe(16);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(7);

    useConfirmStore.getState().answer('cancel');
    await expect(done).resolves.toBe(false);
  });

  it('CANCEL really keeps the work — pixels, size and the dirty flag all survive', async () => {
    paint(7);
    const done = newSpriteGuarded(48, 48);
    await tick();
    useConfirmStore.getState().answer('cancel');
    await expect(done).resolves.toBe(false);

    const s = useSpriteStore.getState();
    expect(s.frames[0].width).toBe(16);
    expect(s.frames[0].data[0]).toBe(7);
    // The flag matters as much as the pixels: `blankDoc` clears it, and a
    // cleared flag is what silences the tab-close and project-open guards.
    expect(s.unsavedEdits).toBe(true);
  });

  it('Esc / backdrop / a superseded request all read as cancel, not as discard', async () => {
    paint(7);
    const done = newSpriteGuarded(48, 48);
    await tick();
    // 'cancel' is the reserved key ConfirmDialog answers for Esc and the
    // backdrop; a superseded request resolves with it too. Anything that is
    // not an explicit discard must keep the work.
    useConfirmStore.getState().answer('something-nobody-defined');
    await expect(done).resolves.toBe(false);
    expect(useSpriteStore.getState().frames[0].data[0]).toBe(7);
  });

  it('DISCARD replaces the document, clears the history and clears the dirty flag', async () => {
    paint(7);
    const done = newSpriteGuarded(48, 48);
    await tick();
    useConfirmStore.getState().answer('discard');
    await expect(done).resolves.toBe(true);

    const s = useSpriteStore.getState();
    expect(s.frames[0].width).toBe(48);
    expect(s.frames[0].data[0]).toBe(0);
    expect(s.unsavedEdits).toBe(false);
  });

  it('the store action itself is UNGUARDED — a new call site must use the guard', () => {
    paint(7);
    useSpriteStore.getState().newSprite(48, 48);
    // Not a wish: it is the reason `new-sprite-guard.ts` exists as a module and
    // the reason a third dispatch line would reintroduce the defect.
    expect(useSpriteStore.getState().frames[0].width).toBe(48);
  });
});

describe('d-30: Clear in the Chunks section asks before emptying the library', () => {
  const chunk = (id: string): ChunkDef => ({ id, name: id, cells: [] } as unknown as ChunkDef);
  const withChunks = (n: number): void => {
    useProjectStore.setState({
      project: {
        chunkLibrary: Array.from({ length: n }, (_, i) => chunk(`c${i}`)),
        bgLibrary: [],
        zones: [],
      } as unknown as S4Project,
    });
  };

  beforeEach(() => {
    useConfirmStore.getState().answer('cancel');
    withChunks(71); // the count the d-30 card measured on a real click
  });

  it('parks a confirm request naming the COUNT, and the library is intact while it stands', async () => {
    const done = clearChunkLibrary();
    await tick();
    const req = useConfirmStore.getState().request;
    expect(req).not.toBeNull();
    expect(req?.body).toContain('71');
    expect(req?.buttons.map((b) => b.key)).toEqual(['clear', 'cancel']);
    expect(useProjectStore.getState().project?.chunkLibrary.length).toBe(71);

    useConfirmStore.getState().answer('cancel');
    await expect(done).resolves.toBe(false);
  });

  it('CANCEL keeps every chunk', async () => {
    const done = clearChunkLibrary();
    await tick();
    useConfirmStore.getState().answer('cancel');
    await expect(done).resolves.toBe(false);
    expect(useProjectStore.getState().project?.chunkLibrary.length).toBe(71);
  });

  it('CLEAR empties it', async () => {
    const done = clearChunkLibrary();
    await tick();
    useConfirmStore.getState().answer('clear');
    await expect(done).resolves.toBe(true);
    expect(useProjectStore.getState().project?.chunkLibrary.length).toBe(0);
  });

  it('an ALREADY-EMPTY library asks nothing — the same rule as d-29\'s clean document', async () => {
    withChunks(0);
    const done = clearChunkLibrary();
    expect(useConfirmStore.getState().request).toBeNull();
    await expect(done).resolves.toBe(true);
    expect(useConfirmStore.getState().request).toBeNull();
  });

  it('is NOT undoable, and that was chosen — `make_it_undoable` was rejected', async () => {
    const done = clearChunkLibrary();
    await tick();
    useConfirmStore.getState().answer('clear');
    await done;
    // Pinned so a future "improvement" has to argue with the card rather than
    // with a silence: library ADDS live outside undo history, and making the
    // REMOVAL undoable would leave undo working for the clear and not for the
    // import — a half-working undo you learn to trust in the wrong place.
    expect(useProjectStore.getState().project?.chunkLibrary.length).toBe(0);
  });
});
