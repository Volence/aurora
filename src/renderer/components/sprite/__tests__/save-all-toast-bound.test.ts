// A Save-All over N dirty sprite documents produces a BOUNDED number of toasts,
// not N.
//
// THE DEFECT. `saveSpriteArt` toasts on EVERY path it can leave by — success,
// refusal, encode failure, conflict, write failure — which is right for the
// Ctrl+S that saves ONE document. `saveAllSpriteArt` then called it once per
// document in `saveableDirtySpriteDocIds()`, so one Ctrl+Shift+S with twelve
// dirty sprite tabs open put twelve toasts on screen. The count is
// data-determined: it is however many sprite tabs the artist happens to have
// open with unsaved edits, and nothing in the producer bounds it.
//
// This is the same shape `loadEffectsSceneLibrary` had before it was coalesced,
// and it is fixed the same way (core/formats/effects/scene.ts): one notice when
// there is one outcome — keeping the message it always had, word for word — and
// one summary per channel when there are many, with each document's own reason
// still reachable in the developer console.
//
// WHAT THESE ROWS PIN:
//   • The toast count does NOT grow with the number of dirty documents. The
//     expectation is derived from the fixture's own size, so it cannot go stale:
//     a regression to one-toast-per-document fails at whatever N is set here.
//   • The COUNT in the summary is the real one, measured from the run rather
//     than written as a literal.
//   • Coalescing changed the count and NOT the channel — N failures still
//     arrive as 'error'.
//   • A SINGLE failure keeps its exact message. One dirty tab is the common
//     case and naming the reason outright is already the right answer.
//
// They do NOT pin how many toasts the STACK paints — that is
// components/__tests__/toast-container-cap.test.ts. Coalescing bounds the
// producer; the cap bounds the screen.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveAllSpriteArt } from '../export-sprite';
import { useSpriteStore, openSpriteDoc, saveableDirtySpriteDocIds } from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';

/** An art source with no `frameCount`, so every save refuses at the frame-count
 *  guard and stops before any IPC. The refusal is the per-document outcome; what
 *  is under test is how many of them reach the screen. */
const FAKE_SOURCE = { basePath: '/p', relPath: 'X.nem' } as never;

/** Open `n` documents that are all dirty AND all have a save-back target. */
function openDirtySaveableDocs(n: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `doc:sprite:s1:${i}`;
    openSpriteDoc(id, { width: 8, height: 8 });
    useSpriteStore.getState().setS1ArtSource(FAKE_SOURCE);
    useSpriteStore.getState().clearCanvas(); // marks unsavedEdits
    ids.push(id);
  }
  return ids;
}

beforeEach(() => {
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  useSpriteStore.getState().closeAll();
});

describe('saveAllSpriteArt toast production is bounded', () => {
  it('does not produce one toast per dirty document', async () => {
    const ids = openDirtySaveableDocs(12);
    // The fixture is only meaningful if every document really is saveable-dirty
    // — otherwise a green row would be measuring an empty loop.
    expect(saveableDirtySpriteDocIds().sort()).toEqual(ids.slice().sort());

    await saveAllSpriteArt();

    const toasts = useToastStore.getState().toasts;
    // Derived from the fixture, never a literal: this is the assertion that goes
    // red if the producer reverts to one-per-document, at whatever N is above.
    expect(toasts.length).toBeLessThan(ids.length);
  });

  it('names the real number of failures, measured rather than asserted', async () => {
    const ids = openDirtySaveableDocs(7);
    expect(saveableDirtySpriteDocIds()).toHaveLength(ids.length);

    await saveAllSpriteArt();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    // The count in the summary is the fixture's own size.
    expect(toasts[0].message).toContain(String(ids.length));
    // Coalescing changed the count, never the channel.
    expect(toasts[0].type).toBe('error');
  });

  it('folds the COUNT and keeps every document its own reason', async () => {
    // The summary names a sample, so the documents it does not name must stay
    // reachable — a fold that lost which document failed would make the user's
    // next step impossible. This is the half of the contract a count assertion
    // cannot see.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ids = openDirtySaveableDocs(5);
      await saveAllSpriteArt();

      const logged = warn.mock.calls.map((c) => String(c[0]));
      // Derived from the fixture: EVERY document, not just the named sample.
      for (const id of ids) {
        expect(logged.some((l) => l.includes(id))).toBe(true);
      }
      // And the reason travels with it, not merely the id.
      expect(logged.every((l) => /Frame add\/remove isn't writable for S1/.test(l))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps the exact message when exactly one document fails', async () => {
    openDirtySaveableDocs(1);

    await saveAllSpriteArt();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    // Word for word what the single-document Ctrl+S says — no summary wrapper,
    // because one dirty tab is the common case and the reason is the answer.
    expect(toasts[0].message).toMatch(/Frame add\/remove isn't writable for S1/);
    expect(toasts[0].type).toBe('error');
  });
});
