// A Save-All over N dirty canvas documents produces a BOUNDED number of toasts,
// not N.
//
// THE DEFECT. `saveCanvasDocument` has two toast paths that do NOT throw, so the
// Save-All loop walks straight past them to the next document:
//   • `!cleared` — the artist painted while the write was in flight.
//   • `!res.sidecarWritten` — the pixels landed but the settings did not.
// The canvas saver registered in project-runtime.ts saves every id in
// `saveableDirtyCanvasDocIds()`, whose length is however many canvas documents
// the artist has open with unsaved edits. One Ctrl+Shift+S therefore produced
// one toast per document.
//
// The sidecar case is the bad one. Its message is four sentences on the ten-
// second error dwell, and `sidecarRejected` deliberately SURVIVES a successful
// save ("the user has to be told every time"), so a project with several
// canvases whose sidecars are unreadable floods on EVERY save, not once.
//
// Fixed by the shape core/formats/effects/scene.ts already ships: one outcome
// keeps the message it always had, many fold to one summary per channel that
// counts them and names the first few, and every document's own reason stays
// reachable in the developer console.
//
// WHAT THESE ROWS PIN: the toast count does not grow with the number of dirty
// canvases (derived from the fixture's size, never a literal), the summary's
// count is the real one, the channel is unchanged, and a single failure keeps
// its exact message. They do NOT pin how many toasts the STACK paints — that is
// components/__tests__/toast-container-cap.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureSaversRegistered, saveAllDirty,
  __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../project-runtime';
import { openCanvasDoc, useCanvasStore, saveableDirtyCanvasDocIds, type CanvasSource } from '../canvasStore';
import { saveCanvasDocument } from '../canvas-save';
import { canvasPngPath, canvasSidecarPath } from '../canvas-file';
import { useToastStore } from '../toastStore';
import { canvasDocTab } from '../../shell/tabs';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';

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

/** `n` open, dirty canvases, each with an UNREADABLE sidecar — so each save
 *  succeeds on pixels and reports the settings it could not write. */
function openRejectedSidecarCanvases(n: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = canvasDocTab(`c${i}`).id;
    openCanvasDoc(id, { name: `c${i}`, width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(id, sourceFor(`c${i}`, { sidecarRejected: true }));
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 2);
    useCanvasStore.getState().setPixels(id, buf);
    ids.push(id);
  }
  return ids;
}

/** Every queued file lands — so the only thing left to say is the sidecar that
 *  was never queued. */
const okApi = {
  writeGuarded: vi.fn(async (_dir: string, files: GuardedWriteFile[]): Promise<GuardedWriteResult> => ({
    written: files.map((f) => f.relPath),
    newMtimes: Object.fromEntries(files.map((f) => [f.relPath, 2000])),
  })),
};

beforeEach(() => {
  // `ensureSaversRegistered` latches, and clearing the coordinator instead would
  // leave every test after the first with no savers at all — a green run over an
  // empty loop. Same order the routing suite uses.
  ensureSaversRegistered();
  useCanvasStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
  okApi.writeGuarded.mockClear();
  // The REAL bridge, with only the IPC stubbed: the loop, the two non-throwing
  // toast paths and the fold are all the shipping ones. Injecting a fake saver
  // here would test the fake.
  __setRuntimeSaversForTest({
    canvasDoc: (docId, report) => saveCanvasDocument(docId, okApi, report),
  });
});

afterEach(() => {
  __resetRuntimeSaversForTest();
  useCanvasStore.getState().closeAll();
});

describe('Save All over canvas documents is bounded', () => {
  it('does not produce one toast per dirty canvas', async () => {
    const ids = openRejectedSidecarCanvases(9);
    // A green row here would be meaningless if the loop were empty.
    expect(saveableDirtyCanvasDocIds().sort()).toEqual(ids.slice().sort());

    await saveAllDirty();

    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBeLessThan(ids.length);
  });

  it('names the real number, measured rather than asserted, on the same channel', async () => {
    const ids = openRejectedSidecarCanvases(6);
    expect(saveableDirtyCanvasDocIds()).toHaveLength(ids.length);

    await saveAllDirty();

    const errs = useToastStore.getState().toasts.filter((t) => t.type === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain(String(ids.length));
  });

  it('keeps the exact message when exactly one canvas has something to report', async () => {
    openRejectedSidecarCanvases(1);

    await saveAllDirty();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    // Word for word what a single-canvas Ctrl+S says — the instruction is the
    // point of the message, and a summary would lose it.
    expect(toasts[0].message).toMatch(/but not its settings/);
    expect(toasts[0].message).toMatch(/Fix that file by hand/);
    expect(toasts[0].type).toBe('error');
  });
});
