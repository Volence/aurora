// src/renderer/shell/__tests__/dirty-snapshot-subscriptions.test.ts
//
// The tab dot's ONLY delivery mechanism.
//
// `tabHasDirtyDot` is a pure rule and is well covered; `currentDirtySnapshot`
// reads the stores and is well covered. Neither of those is what puts a dot on
// screen. That job belongs to `useDirtySnapshot`'s bare subscription lines —
// `useSpriteStore((s) => s.unsavedEdits)`, `useCanvasStore((s) => s.docs)` and
// friends — and deleting any of them left the ENTIRE suite green: the verdict
// stayed correct, React just never asked for it again. A dot that is right and
// never repainted is a dot the user does not see. (Aurora's named dominant
// defect class: the guard checks the value, not the delivery.)
//
// HOW A HOOK IS TESTED IN A NODE-ONLY SUITE. There is no jsdom and no
// @testing-library here (see vitest.config.ts), so `renderHook` does not exist
// and adding a DOM stack for one test is the wrong trade. Mocking React itself
// does not work either: `react` and `zustand` are both externalised, so a
// vi.mock('react') never reaches zustand's `React.useSyncExternalStore`.
//
// So the STORE MODULES are mocked instead — they are local source, so the mock
// applies. Each bound store is replaced by a callable that records a zero-arg
// reader for the selector it was handed and then evaluates it. Calling
// `useDirtySnapshot()` therefore runs as a plain function, and re-evaluating the
// recorded readers after a mutation answers exactly the question React asks on
// the next store notification: did any subscribed value change? That is the
// condition for a re-render, so it is the condition for a repaint.
//
// `useHistoryVersion` is stubbed to a constant deliberately. It also re-renders
// on any undo-stack change, so leaving it live would let a pixel edit (which
// records) satisfy these assertions with the document subscriptions deleted —
// the test would pass for the wrong reason. The mutations below are also chosen
// to dirty WITHOUT recording (`setUnsavedEdits`, and — for the canvas case,
// since canvasStore has no setter left that dirties without recording; `setName`
// used to be that setter and was deleted as dead code — a direct `setState`
// poke of `unsavedEdits`), so the document stores are the only candidates
// twice over.

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Zero-arg readers for every selector the hook subscribed with, in call order. */
const rec = vi.hoisted(() => {
  const reads: (() => unknown)[] = [];
  /** Wrap a zustand bound store so a `useStore(selector)` call records the read
   *  it would have subscribed to, then returns the selected value. `Object.assign`
   *  carries getState/setState/subscribe across, so the store still behaves
   *  normally for every non-hook consumer. */
  const wrap = <T,>(real: T): T => {
    const api = real as unknown as { getState: () => unknown };
    const f = (selector?: (s: unknown) => unknown): unknown => {
      const read = (): unknown => (selector ? selector(api.getState()) : api.getState());
      if (selector) reads.push(read);
      return read();
    };
    return Object.assign(f, real) as unknown as T;
  };
  return { reads, wrap };
});

vi.mock('../../state/canvasStore', async (io) => {
  const actual = await io<typeof import('../../state/canvasStore')>();
  return { ...actual, useCanvasStore: rec.wrap(actual.useCanvasStore) };
});
vi.mock('../../state/spriteStore', async (io) => {
  const actual = await io<typeof import('../../state/spriteStore')>();
  return { ...actual, useSpriteStore: rec.wrap(actual.useSpriteStore) };
});
vi.mock('../../state/classicProjectStore', async (io) => {
  const actual = await io<typeof import('../../state/classicProjectStore')>();
  return { ...actual, useClassicProjectStore: rec.wrap(actual.useClassicProjectStore) };
});
vi.mock('../../state/classicLevelStore', async (io) => {
  const actual = await io<typeof import('../../state/classicLevelStore')>();
  return { ...actual, useClassicLevelStore: rec.wrap(actual.useClassicLevelStore) };
});
vi.mock('../../state/projectStore', async (io) => {
  const actual = await io<typeof import('../../state/projectStore')>();
  return { ...actual, useProjectStore: rec.wrap(actual.useProjectStore) };
});
vi.mock('../../state/editorStore', async (io) => {
  const actual = await io<typeof import('../../state/editorStore')>();
  return { ...actual, useEditorStore: rec.wrap(actual.useEditorStore) };
});
vi.mock('../../hooks/useHistoryVersion', async (io) => {
  const actual = await io<typeof import('../../hooks/useHistoryVersion')>();
  return { ...actual, useHistoryVersion: () => 0 }; // see the header
});

import { useDirtySnapshot } from '../dirty-snapshot';
import { openCanvasDoc, useCanvasStore } from '../../state/canvasStore';
import { useSpriteStore } from '../../state/spriteStore';
import { canvasDocTab } from '../tabs';

const CANVAS = canvasDocTab('sky').id;

/** Run the hook once; hand back the readers it subscribed with. */
function subscribedReads(): (() => unknown)[] {
  rec.reads.length = 0;
  useDirtySnapshot();
  return [...rec.reads];
}

/** True when a mutation moves at least one subscribed value — i.e. React
 *  re-renders and the strip repaints. */
function wouldRepaint(reads: (() => unknown)[], mutate: () => void): boolean {
  const before = reads.map((r) => r());
  mutate();
  const after = reads.map((r) => r());
  return after.some((v, i) => !Object.is(v, before[i]));
}

beforeEach(() => {
  useCanvasStore.getState().closeAll();
  useSpriteStore.getState().setUnsavedEdits(false);
});

/** Flip a canvas document's `unsavedEdits` WITHOUT recording an undo entry —
 *  exactly what the deleted `setName` used to give this test file for free.
 *  Pokes the map directly rather than through a public setter because there is
 *  no longer a public setter with this shape (canvasStore's header now says so
 *  explicitly): this test only needs SOMETHING on `docs` to change, not any
 *  particular real edit. */
function dirtyCanvasNoRecord(docId: string): void {
  useCanvasStore.setState((s) => {
    const e = s.docs.get(docId);
    if (!e) return s;
    const docs = new Map(s.docs);
    docs.set(docId, { ...e, unsavedEdits: true });
    return { docs };
  });
}

describe('useDirtySnapshot subscriptions', () => {
  it('subscribes to something at all (proves the mock is really engaged)', () => {
    // Guards the test itself: if the store mocks ever stopped applying, `reads`
    // would be empty and every assertion below would vacuously pass.
    expect(subscribedReads().length).toBeGreaterThan(0);
  });

  it('a canvas going dirty repaints the tab strip', () => {
    openCanvasDoc(CANVAS, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    const reads = subscribedReads();
    expect(wouldRepaint(reads, () => {
      dirtyCanvasNoRecord(CANVAS); // dirties, does NOT record
    })).toBe(true);
  });

  it('a canvas going CLEAN again repaints it (the dot has to come off, too)', () => {
    openCanvasDoc(CANVAS, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    dirtyCanvasNoRecord(CANVAS);
    const reads = subscribedReads();
    expect(wouldRepaint(reads, () => {
      useCanvasStore.getState().markSaved(CANVAS, { pngMtimeMs: 1, sidecarMtimeMs: 1 });
    })).toBe(true);
  });

  it('a sprite going dirty repaints the tab strip', () => {
    // Pre-existing hole, closed in the same pass: the sprite lines were exactly
    // as unpinned as the canvas one, and they share this file's fate.
    const reads = subscribedReads();
    expect(wouldRepaint(reads, () => {
      useSpriteStore.getState().setUnsavedEdits(true); // no history record
    })).toBe(true);
  });
});
