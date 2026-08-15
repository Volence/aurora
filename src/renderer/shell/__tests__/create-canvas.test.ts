// Task 13 contract 4: creating a canvas WRITES BOTH FILES before the tab opens,
// and a create that could not reach disk leaves nothing behind.
//
// This drives the real flow with a fake `window.api`, which is as far as the node
// suite can go — no React, so the dialog is Task 14's. What it can prove is the
// part with consequences on disk:
//
//   • the file pair is written at CREATION, so the document has a `CanvasSource`
//     and Ctrl+S has a destination. Without one the tab shows an unsaved dot
//     that Ctrl+S cannot act on and a close confirm with no Save button — a dead
//     end, and canvas has no Export to escape through (R16's last item).
//   • the write is the OVERWRITE GUARD's second line: the baselines go out as
//     null ("did not exist when read"), which planGuardedWrite turns into a
//     conflict if the file is there after all. That is what covers the gap
//     between the name check and the write.
//   • a failed write closes the document again and opens NO tab.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCanvasDocument } from '../new-canvas';
import { canvasDocTab } from '../tabs';
import { useCanvasStore, canvasDocState } from '../../state/canvasStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useSessionStore } from '../../state/sessionStore';
import { useToastStore } from '../../state/toastStore';
import { documentHistoryHub } from '../../state/history-hub';
import { canvasPngPath, canvasSidecarPath } from '../../state/canvas-file';
import { canvasPaneState } from '../../components/canvas/canvas-pane-model';
import { HOME_TAB } from '../../../core/shell/session';
import { canvasIndex, paletteEntryOf } from '../../../core/art/canvas-doc';
import { paletteLuminance } from '../../../core/art/canvas-default-palette';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';

const TAB = canvasDocTab('cliffs');
const INPUT = { name: 'cliffs', width: 32, height: 24, profileId: 'genesis-level-art' as const };

/** Every write the flow attempted, so the guarded-write baselines are readable
 *  off the call rather than inferred. */
let writes: { dir: string; files: GuardedWriteFile[] }[] = [];
let listing: string[] = [];
/** The success reply, echoing whatever batch was just sent — so a test that
 *  creates a canvas under some other name still gets a truthful `written` list
 *  (saveCanvasFile derives `sidecarWritten` from it). */
const okWrite = (): GuardedWriteResult => {
  const files = writes[writes.length - 1]?.files ?? [];
  return {
    written: files.map((f) => f.relPath),
    newMtimes: Object.fromEntries(files.map((f, i) => [f.relPath, 111 * (i + 1)])),
  };
};
let writeReply: () => GuardedWriteResult = okWrite;

function stubApi(): void {
  vi.stubGlobal('window', {
    api: {
      listDir: async () => listing.map((n) => `${n}.png`),
      writeGuarded: async (dir: string, files: GuardedWriteFile[]) => {
        writes.push({ dir, files });
        return writeReply();
      },
    },
  });
}

beforeEach(() => {
  writes = [];
  listing = [];
  writeReply = okWrite;
  useCanvasStore.getState().closeAll();
  documentHistoryHub.clearAll();
  useSessionStore.setState({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
  useToastStore.setState({ toasts: [] });
  useClassicProjectStore.setState({ status: 'open', dir: '/p' } as never);
  useClassicLevelStore.setState({ doc: null } as never);
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  useCanvasStore.getState().closeAll();
  useClassicProjectStore.setState({ status: 'closed', dir: null } as never);
});

describe('createCanvasDocument', () => {
  it('writes both files, then opens the tab with a clean, saveable document', async () => {
    const result = await createCanvasDocument(INPUT);
    expect(result).toEqual({ ok: true, tabId: TAB.id });

    // ONE guarded batch, both files, and the baselines that say "this must not
    // already exist".
    expect(writes).toHaveLength(1);
    expect(writes[0].dir).toBe('/p');
    expect(writes[0].files.map((f) => f.relPath)).toEqual([
      canvasPngPath('cliffs'), canvasSidecarPath('cliffs'),
    ]);
    expect(writes[0].files.every((f) => f.expectedMtimeMs === null)).toBe(true);

    // The document exists, at the size asked for, with a destination and no dot.
    const doc = canvasDocState(TAB.id)!;
    expect([doc.pixels.width, doc.pixels.height]).toEqual([32, 24]);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().sourceOf(TAB.id)).toMatchObject({
      dir: '/p', pngMtimeMs: 111, sidecarMtimeMs: 222, sidecarRejected: false,
    });

    // and the tab is open and focused, with the document checked out.
    expect(useSessionStore.getState().tabs.some((t) => t.id === TAB.id)).toBe(true);
    expect(useSessionStore.getState().activeId).toBe(TAB.id);
    expect(useCanvasStore.getState().activeDocId).toBe(TAB.id);
  });

  it('arms a VISIBLE paint colour (R18)', async () => {
    // With no zone open the palette is the default ramp; the brush must land on
    // something that can be seen in it, or the first stroke is invisible.
    await createCanvasDocument(INPUT);
    const { paintIndex } = useCanvasStore.getState();
    expect(paletteEntryOf(paintIndex)).not.toBe(0);
    expect(paletteLuminance(canvasDocState(TAB.id)!.palette[paintIndex])).toBeGreaterThan(200);
  });

  it('seeds the palette from the OPEN ZONE, line-major', async () => {
    // The reason contract 3 exists: a canvas drawn for Green Hill has to look
    // like Green Hill or every colour decision on it is made against the wrong
    // reference.
    const palettes = [0, 1, 2, 3].map((line) => {
      const l = new Uint16Array(16);
      for (let e = 0; e < 16; e++) l[e] = ((line + 1) << 9) | ((e + 1) << 1);
      return l;
    });
    useClassicLevelStore.setState({ doc: { palettes } } as never);
    await createCanvasDocument(INPUT);
    const p = canvasDocState(TAB.id)!.palette;
    expect(p[canvasIndex(2, 5)]).toBe(palettes[2][5]);
    expect(p[canvasIndex(3, 15)]).toBe(palettes[3][15]);
  });

  it('REFUSES an existing name and writes nothing', async () => {
    listing = ['cliffs'];
    const r = await createCanvasDocument(INPUT);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('already exists');
    expect(writes).toEqual([]);
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
  });

  it('refuses a name whose document is already OPEN, without touching it', async () => {
    // The case the listing cannot see: a canvas whose files were deleted while
    // its tab stayed open. Focusing that document and reporting success would
    // hand the user someone else's art under the name they just typed — which
    // is what openCanvasDoc's 'focused' return value exists to prevent.
    await createCanvasDocument(INPUT);
    listing = [];                       // pretend the file vanished
    // Dirty it directly (there is no store setter left that dirties without
    // recording — `setName` used to be that setter and was deleted as dead
    // code, no production caller), so a silent reuse would be visible: if the
    // refusal below wrongly reset or replaced this document, the dirty flag
    // would go with it.
    useCanvasStore.setState((s) => {
      const e = s.docs.get(TAB.id)!;
      const docs = new Map(s.docs);
      docs.set(TAB.id, { ...e, unsavedEdits: true });
      return { docs };
    });
    const r = await createCanvasDocument(INPUT);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('already open');
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(true);   // untouched
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);  // still dirty: not silently reset
  });

  it('a conflict on the write leaves NO document and NO tab', async () => {
    // The guarded write refusing an expected-null file that exists is the second
    // overwrite guard. Whatever the reason, a create that could not reach disk
    // must not leave a tab whose every later save fails the same way.
    writeReply = () => ({ conflicts: [canvasPngPath('cliffs')] });
    try {
      const r = await createCanvasDocument(INPUT);
      expect(r.ok).toBe(false);
      expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
      expect(useSessionStore.getState().tabs.some((t) => t.id === TAB.id)).toBe(false);
      expect(documentHistoryHub.has(TAB.id)).toBe(false);
    } finally {
      writeReply = okWrite;
    }
  });

  // --- A refused or failed create must not move the artist's view -----------
  //
  // The pane derives its document from the ACTIVE TAB and treats activeDocId as
  // a mirror (R14c), so any create path that leaves the two disagreeing makes an
  // untouched canvas tab render CanvasDocUnloaded — "this canvas could not be
  // loaded" over work that is open, intact and possibly mid-stroke, with the
  // dialog still on screen in front of it. Both routes below produced exactly
  // that. `paneOverActiveTab` asks the question the app asks.

  function paneOverActiveTab() {
    const { tabs, activeId } = useSessionStore.getState();
    return canvasPaneState(tabs.find((t) => t.id === activeId), useCanvasStore.getState().activeDocId);
  }

  it('a FAILED WRITE leaves the canvas already on screen focused and drawable', async () => {
    await createCanvasDocument({ ...INPUT, name: 'alpha' });
    const alpha = canvasDocTab('alpha').id;
    expect(paneOverActiveTab()).toEqual({ kind: 'ready', docId: alpha });

    writeReply = () => ({ conflicts: [canvasPngPath('beta')] });
    try {
      expect((await createCanvasDocument({ ...INPUT, name: 'beta' })).ok).toBe(false);
    } finally {
      writeReply = okWrite;
    }
    // Was: { kind: 'unloaded', tabId: 'doc:canvas:alpha' } with activeDocId null,
    // because openCanvasDoc had focused beta and the rollback's closeCanvasDoc
    // cleared the focus outright.
    expect(useCanvasStore.getState().activeDocId).toBe(alpha);
    expect(paneOverActiveTab()).toEqual({ kind: 'ready', docId: alpha });
  });

  it('an ALREADY-OPEN name refusal does not steal focus to the colliding document', async () => {
    // Reachable whenever the listing cannot see an open canvas — its files were
    // deleted while the tab stayed open. A pure validation refusal was moving
    // the focus onto a canvas that is not even the active tab.
    await createCanvasDocument({ ...INPUT, name: 'alpha' });
    await createCanvasDocument({ ...INPUT, name: 'beta' });
    const beta = canvasDocTab('beta').id;
    expect(paneOverActiveTab()).toEqual({ kind: 'ready', docId: beta });

    listing = [];  // both files "deleted" behind Aurora's back
    const r = await createCanvasDocument({ ...INPUT, name: 'alpha' });
    expect(r.ok).toBe(false);
    // Was: activeDocId = doc:canvas:alpha while the beta TAB was active, so the
    // pane went { kind: 'unloaded', tabId: 'doc:canvas:beta' }.
    expect(useCanvasStore.getState().activeDocId).toBe(beta);
    expect(paneOverActiveTab()).toEqual({ kind: 'ready', docId: beta });
  });

  it('a FAILED WRITE leaves the artist\'s armed COLOUR alone too', async () => {
    // `openCanvasDoc` arms the brush from the new document's palette (the R18
    // rule, in the store so both doors share it), so a create that is then
    // rolled back would leave the colour derived from a palette no longer in
    // the store — a silently recoloured brush on the canvas actually on screen.
    // The same invariant as the focus restore, and it needs its own assertion:
    // deleting the restore left every other test in this file green.
    await createCanvasDocument({ ...INPUT, name: 'alpha' });
    const chosen = canvasIndex(1, 4);
    useCanvasStore.getState().setPaintIndex(chosen);

    writeReply = () => ({ conflicts: [canvasPngPath('beta')] });
    try {
      expect((await createCanvasDocument({ ...INPUT, name: 'beta' })).ok).toBe(false);
    } finally {
      writeReply = okWrite;
    }
    expect(useCanvasStore.getState().paintIndex).toBe(chosen);
  });

  it('a refusal BEFORE any store is touched still leaves the focus alone', async () => {
    // The no-op case, asserted so the uniform routing through `refuse` is not
    // mistaken for an over-reaction that could itself clobber something.
    await createCanvasDocument({ ...INPUT, name: 'alpha' });
    const alpha = canvasDocTab('alpha').id;
    listing = ['gamma'];
    expect((await createCanvasDocument({ ...INPUT, name: 'gamma' })).ok).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBe(alpha);
    expect(paneOverActiveTab()).toEqual({ kind: 'ready', docId: alpha });
  });

  it('refuses with no project open', async () => {
    useClassicProjectStore.setState({ status: 'closed', dir: null } as never);
    const r = await createCanvasDocument(INPUT);
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });
});
