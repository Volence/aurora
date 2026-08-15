// Task 11: what focusing and closing a canvas tab does.
//
// The two failure modes these tests exist for, both from R14/R16:
//
//   • A FAILED LOAD THAT LEAVES SOMETHING BEHIND. A canvas tab id names a file
//     and survives a restart, so "the tab exists but the file does not" is a
//     normal event, not a corner case. A half-open document under the missing
//     file's name is indistinguishable from data loss, so a failed load must
//     leave no document, no undo stack and no focus change.
//
//   • A DOT WITH NOTHING BEHIND IT. Task 10 gave a dirty canvas tab an unsaved
//     dot; until confirmCloseCanvasDoc exists, closing that tab throws the work
//     away without asking.
//
// Plus the load-time WARNINGS (R16): decodeCanvasFiles computes real diagnoses
// about the artist's files and nothing above it read them.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  planCanvasDocActivation, activateCanvasDocTarget, confirmCloseCanvasDoc,
  requestOpenTab, requestCloseTab,
} from '../tab-activation';
import { canvasDocTab } from '../tabs';
import {
  useCanvasStore, openCanvasDoc, activateCanvasDoc, canvasDocState, type CanvasSource,
} from '../../state/canvasStore';
import { canvasPngPath, canvasSidecarPath, type LoadedCanvas } from '../../state/canvas-file';
import { useConfirmStore, type ConfirmRequest } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { useSessionStore } from '../../state/sessionStore';
import { documentHistoryHub } from '../../state/history-hub';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex, blankCanvasDoc } from '../../../core/art/canvas-doc';
import { HOME_TAB } from '../../../core/shell/session';
import type { GuardedWriteResult } from '../../../shared/ipc-types';

const TAB = canvasDocTab('sky');
const OTHER = canvasDocTab('rock');
const LEVEL_TAB = { id: 'level:ghz:1', kind: 'level' as const, title: 'GHZ 1' };

const realAsk = useConfirmStore.getState().ask;

function sourceFor(name: string, over: Partial<CanvasSource> = {}): CanvasSource {
  return {
    dir: '/p',
    pngPath: canvasPngPath(name),
    sidecarPath: canvasSidecarPath(name),
    pngMtimeMs: 1000,
    sidecarMtimeMs: 1000,
    sidecarRejected: false,
    ...over,
  };
}

/** What a successful loader hands back. `mark` paints one identifying pixel so a
 *  document's provenance is visible in its buffer. */
function loadedCanvas(name: string, opts: { mark?: number; warnings?: string[] } = {}): LoadedCanvas {
  const doc = blankCanvasDoc({ name, width: 8, height: 8, profileId: 'none' });
  if (opts.mark !== undefined) doc.pixels.data[0] = opts.mark;
  return { doc, source: sourceFor(name), warnings: opts.warnings ?? [], sidecarRejected: false };
}

/** Answer the next confirm dialog with `answer`, and record what it was asked.
 *  Typed through ConfirmRequest so the button list is readable off the call. */
function askStub(answer: string) {
  const ask = vi.fn(async (_request: ConfirmRequest): Promise<string> => answer);
  useConfirmStore.setState({ ask });
  return ask;
}

/** Dirty a document by drawing one pixel through the store. */
function paint(docId: string, value = canvasIndex(1, 1)): void {
  const buf = createBuffer(8, 8);
  buf.data[0] = value;
  useCanvasStore.getState().setPixels(docId, buf);
}

beforeEach(() => {
  useCanvasStore.getState().closeAll();
  documentHistoryHub.clearAll();
  useSessionStore.setState({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
  useToastStore.setState({ toasts: [] });
  useConfirmStore.setState({ ask: realAsk, request: null, resolver: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useCanvasStore.getState().closeAll();
});

const toastMessages = (): string[] => useToastStore.getState().toasts.map((t) => t.message);

describe('planCanvasDocActivation', () => {
  it('loads a document that is not open yet', () => {
    expect(planCanvasDocActivation({ tabId: TAB.id, isOpen: false }))
      .toEqual({ kind: 'load', name: 'sky' });
  });

  it('just checks out a document that is already open', () => {
    expect(planCanvasDocActivation({ tabId: TAB.id, isOpen: true })).toEqual({ kind: 'activate' });
  });

  it('ignores a tab that is not a canvas doc', () => {
    expect(planCanvasDocActivation({ tabId: 'level:ghz:1', isOpen: false })).toEqual({ kind: 'none' });
    expect(planCanvasDocActivation({ tabId: 'doc:sprite:s1:42', isOpen: true })).toEqual({ kind: 'none' });
    expect(planCanvasDocActivation({ tabId: HOME_TAB.id, isOpen: false })).toEqual({ kind: 'none' });
  });
});

describe('activateCanvasDocTarget', () => {
  it('loads the tab\'s file and focuses the document it installs', async () => {
    const loader = vi.fn(async (name: string) => loadedCanvas(name, { mark: 5 }));

    expect(await activateCanvasDocTarget(TAB.id, loader)).toBe(true);

    expect(loader).toHaveBeenCalledWith('sky');                 // the NAME, not the tab id
    expect(useCanvasStore.getState().activeDocId).toBe(TAB.id);
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(5);
    expect(useCanvasStore.getState().sourceOf(TAB.id)).not.toBeNull();
  });

  it('focuses an already-open document without re-reading it', async () => {
    // Re-reading would throw away the unsaved edits multi-document exists to
    // keep — and loadCanvasDoc refuses it outright.
    const loader = vi.fn(async (name: string) => loadedCanvas(name));
    await activateCanvasDocTarget(TAB.id, loader);
    paint(TAB.id, canvasIndex(2, 3));
    await activateCanvasDocTarget(OTHER.id, loader);   // focus elsewhere
    loader.mockClear();

    expect(await activateCanvasDocTarget(TAB.id, loader)).toBe(true);

    expect(loader).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().activeDocId).toBe(TAB.id);
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(canvasIndex(2, 3)); // the edit survived
  });

  it('a failed load leaves NO half-open document behind', async () => {
    // The failure this prevents: a tab that reads as loaded but shows a blank
    // canvas under the missing file's name — indistinguishable from data loss.
    const loader = vi.fn(async () => { throw new Error('ENOENT'); });

    expect(await activateCanvasDocTarget(TAB.id, loader)).toBe(false);

    expect(canvasDocState(TAB.id)).toBeNull();
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(documentHistoryHub.has(TAB.id)).toBe(false);
    expect(toastMessages().join('\n')).toContain('ENOENT');
  });

  it('a failed load does not move the focus off the document already showing', async () => {
    const ok = vi.fn(async (name: string) => loadedCanvas(name, { mark: 5 }));
    await activateCanvasDocTarget(OTHER.id, ok);

    await activateCanvasDocTarget(TAB.id, async () => { throw new Error('ENOENT'); });

    expect(useCanvasStore.getState().activeDocId).toBe(OTHER.id);
  });

  it('LOADS THEN ACTIVATES — the store is untouched while the read is in flight', async () => {
    // R14: opening a document first and filling it in afterwards is what put the
    // pane on document X under tab Y. Nothing may exist for this tab until the
    // bytes are in hand.
    let release!: (v: LoadedCanvas) => void;
    const pending = new Promise<LoadedCanvas>((res) => { release = res; });
    const flow = activateCanvasDocTarget(TAB.id, () => pending);
    await Promise.resolve();

    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBeNull();

    release(loadedCanvas('sky', { mark: 7 }));
    await flow;
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(7);
  });

  it('a read that resolves after the document was edited does not overwrite the edits', async () => {
    // The race: a restored tab's read is in flight when another route (Task 13's
    // create flow) opens that same document and the user draws on it. Installing
    // the disk bytes on top would replace live work — loadCanvasDoc THROWS
    // rather than do it, which would surface as an unhandled rejection.
    let release!: (v: LoadedCanvas) => void;
    const pending = new Promise<LoadedCanvas>((res) => { release = res; });
    const slow = activateCanvasDocTarget(TAB.id, () => pending);
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id, canvasIndex(3, 4));

    release(loadedCanvas('sky', { mark: 1 }));
    await expect(slow).resolves.toBe(true);

    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(canvasIndex(3, 4));
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);
  });

  it('a superseded read neither installs nor steals focus', async () => {
    let release!: (v: LoadedCanvas) => void;
    const pending = new Promise<LoadedCanvas>((res) => { release = res; });
    const slow = activateCanvasDocTarget(TAB.id, () => pending);
    await activateCanvasDocTarget(OTHER.id, async (n) => loadedCanvas(n, { mark: 2 }));

    release(loadedCanvas('sky', { mark: 9 }));
    expect(await slow).toBe(false);

    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBe(OTHER.id);
  });
});

describe('load-time warnings (R16)', () => {
  it('surfaces every warning the load reported, naming the canvas', async () => {
    // Their whole purpose is to be the artist's FIRST notice that a sidecar was
    // rejected or that another tool recoloured their PNG. Computed and dropped,
    // the first signal is a save-time toast much later.
    const warnings = [
      'the sidecar could not be read (Unexpected token }); opening the art without it',
      "this PNG's colours no longer match its sidecar, as if another tool recoloured it",
    ];
    await activateCanvasDocTarget(TAB.id, async (n) => loadedCanvas(n, { warnings }));

    const messages = toastMessages();
    expect(messages).toHaveLength(2);          // one per diagnosis, not one joined wall of text
    expect(messages[0]).toContain('sky');      // attributable when a restore loaded it
    expect(messages[0]).toContain('sidecar could not be read');
    expect(messages[1]).toContain('recoloured');
    // 'error' for the DWELL: 10s, versus 2.2s for info — an unread warning is
    // the same as no warning.
    expect(useToastStore.getState().toasts.every((t) => t.type === 'error')).toBe(true);
  });

  it('says nothing about a clean load', async () => {
    await activateCanvasDocTarget(TAB.id, async (n) => loadedCanvas(n));
    expect(toastMessages()).toEqual([]);
  });
});

describe('canvas focus follows the tab strip', () => {
  it('routes a canvas tab through the canvas activation', async () => {
    // requestOpenTab has no loader seam, so this drives the DEFAULT loader with
    // no project open: the load fails, and the wiring is visible in the failure
    // (a tab that never opened, and a toast that names the canvas). Unwired,
    // the tab would open regardless and nothing would be said.
    await requestOpenTab(TAB);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME_TAB.id]);
    expect(toastMessages().join('\n')).toContain('sky');
  });

  it('focusing a NON-canvas tab clears the canvas focus', async () => {
    // Without this the last canvas stays "active" behind a level tab, and the
    // pane's first frame on the next canvas focus renders the stale document.
    await activateCanvasDocTarget(TAB.id, async (n) => loadedCanvas(n));
    expect(useCanvasStore.getState().activeDocId).toBe(TAB.id);

    await requestOpenTab(LEVEL_TAB);

    expect(useCanvasStore.getState().activeDocId).toBeNull();
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(true); // parked, not closed
  });
});

describe('confirmCloseCanvasDoc', () => {
  it('closes a clean document with no prompt', async () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    const ask = askStub('discard');

    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks before discarding a dirty document, and keeps it open on cancel', async () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id);
    askStub('cancel');

    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(true);
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(canvasIndex(1, 1));
  });

  it('Discard answers yes', async () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id);
    askStub('discard');

    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(true);
  });

  it('offers Save only when the canvas has a file to write', async () => {
    // Without a CanvasSource there is nowhere to write, and saveCanvasDocument
    // resolves silently — a Save button would be a promise the dialog cannot keep.
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id);
    const ask = askStub('cancel');

    await confirmCloseCanvasDoc(TAB.id);
    expect(ask.mock.calls[0][0].buttons.map((b) => b.key)).toEqual(['discard', 'cancel']);

    useCanvasStore.getState().setSource(TAB.id, sourceFor('sky'));
    await confirmCloseCanvasDoc(TAB.id);
    expect(ask.mock.calls[1][0].buttons.map((b) => b.key)).toEqual(['save', 'discard', 'cancel']);
  });

  it('Save writes the canvas, and the close proceeds', async () => {
    stubWriteGuarded(() => ({ written: [canvasPngPath('sky'), canvasSidecarPath('sky')], newMtimes: { [canvasPngPath('sky')]: 2000, [canvasSidecarPath('sky')]: 2000 } }));
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(TAB.id, sourceFor('sky'));
    paint(TAB.id);
    askStub('save');

    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(true);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(false);
  });

  it('a FAILED save cancels the close and says why', async () => {
    // saveCanvasDocument reports failure by THROWING and never toasts (its
    // callers do), so a silent catch here would look like a dead Save button —
    // and closing anyway would destroy the work Save was meant to protect.
    stubWriteGuarded(() => ({ conflicts: [canvasPngPath('sky')] }));
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(TAB.id, sourceFor('sky'));
    paint(TAB.id);
    askStub('save');

    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);
    expect(toastMessages().join('\n')).toContain('changed on disk');
  });
});

describe('closing a canvas tab', () => {
  it('drops the document and its undo stack', async () => {
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });

    await requestCloseTab(TAB.id);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME_TAB.id]);
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(documentHistoryHub.has(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBeNull();
  });

  it('a dirty tab asks first, and Cancel keeps both the tab and the work', async () => {
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id);
    askStub('cancel');

    await requestCloseTab(TAB.id);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME_TAB.id, TAB.id]);
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(canvasIndex(1, 1));
  });

  it('closes a BACKGROUND canvas tab, confirming for its edits too', async () => {
    // A parked document's edits are as real as the focused one's — the dot on
    // that tab says so.
    useSessionStore.setState({ tabs: [HOME_TAB, TAB, OTHER], activeId: OTHER.id });
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    paint(TAB.id);
    openCanvasDoc(OTHER.id, { name: 'rock', width: 8, height: 8, profileId: 'none' });
    askStub('discard');

    await requestCloseTab(TAB.id);

    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBe(OTHER.id); // focus never moved
  });

  it('hands the canvas focus to the PROMOTED neighbour', async () => {
    // R14(b): activation fires on every focus change, including the one
    // session.closeTab performs after a close. Deleting the promotion call in
    // requestCloseTab left the whole suite green — the other close tests promote
    // HOME (whose clear is indistinguishable from closeCanvasDoc's own null-out)
    // or close an INACTIVE tab (which early-returns before promoting).
    //
    // It also pins the ORDER: the promotion focus lands before session.close, so
    // closeCanvasDoc(TAB) then sees activeDocId !== its own id and leaves the
    // promotion alone. Reversed, the tab strip would show OTHER with no canvas
    // focused at all.
    useSessionStore.setState({ tabs: [HOME_TAB, TAB, OTHER], activeId: TAB.id });
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(OTHER.id, { name: 'rock', width: 8, height: 8, profileId: 'none' });
    activateCanvasDoc(TAB.id);   // the closing tab is the focused one

    await requestCloseTab(TAB.id);

    expect(useSessionStore.getState().activeId).toBe(OTHER.id);
    expect(useCanvasStore.getState().activeDocId).toBe(OTHER.id);
    expect(useCanvasStore.getState().isOpen(OTHER.id)).toBe(true);
  });

  it('a tab whose file never loaded is still closable', async () => {
    // The sprite version of this wedged the strip: a tab must be closable
    // whatever state its document is in.
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    await activateCanvasDocTarget(TAB.id, async () => { throw new Error('ENOENT'); });

    await requestCloseTab(TAB.id);

    expect(useSessionStore.getState().tabs.map((t) => t.id)).toEqual([HOME_TAB.id]);
    expect(useConfirmStore.getState().request).toBeNull(); // nothing to lose, nothing asked
  });
});

/** A `window.api.writeGuarded` for the two tests that drive the REAL save path
 *  (confirmCloseCanvasDoc calls saveCanvasDocument with no api seam — that is
 *  the production call, and stubbing it out would test the wrong function). */
function stubWriteGuarded(reply: () => GuardedWriteResult): void {
  vi.stubGlobal('window', { api: { writeGuarded: async () => reply() } });
}
