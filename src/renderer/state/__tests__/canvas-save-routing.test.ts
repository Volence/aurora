// src/renderer/state/__tests__/canvas-save-routing.test.ts
//
// Task 10: Ctrl+S / Save All / the tab dot for canvas documents.
//
// Two halves, and they check different things:
//   • ROUTING — which saver owns a canvas tab, that it writes THAT canvas and
//     no other, and that a project switch drops the documents. Driven through
//     the injected `canvasDoc` seam so the routing question is not tangled with
//     the IO question.
//   • THE BRIDGE (`saveCanvasDocument`) — driven with a REAL saveCanvasFile and
//     a fake guarded-write api, because the things worth pinning here are all
//     about telling the truth afterwards: R15's `sidecarWritten` toast, the
//     partial write's baseline refresh, and exactly-one-toast-per-failure.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveCoordinator, ensureSaversRegistered, saveActive, canSaveActive, saveAllDirty,
  resetProjectRuntime, __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../project-runtime';
import { openCanvasDoc, useCanvasStore, type CanvasSource } from '../canvasStore';
import { saveCanvasDocument } from '../canvas-save';
import type { GuardedWriteApi } from '../canvas-file';
import { canvasPngPath, canvasSidecarPath } from '../canvas-file';
import { useToastStore } from '../toastStore';
import { useSessionStore } from '../sessionStore';
import { canvasDocTab } from '../../shell/tabs';
import { tabHasDirtyDot, type DirtySnapshot } from '../../shell/dirty-tabs';
import { currentDirtySnapshot } from '../../shell/dirty-snapshot';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';
import type { GuardedWriteFile, GuardedWriteResult } from '../../../shared/ipc-types';

const TAB = canvasDocTab('sky');
const OTHER = canvasDocTab('rock');

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

/** An open, dirty canvas with a file target — the state Ctrl+S acts on. */
function dirtyCanvas(tabId: string, name: string, over: Partial<CanvasSource> = {}): void {
  openCanvasDoc(tabId, { name, width: 8, height: 8, profileId: 'none' });
  useCanvasStore.getState().setSource(tabId, sourceFor(name, over));
  const buf = createBuffer(8, 8);
  buf.data[0] = canvasIndex(1, 2);
  useCanvasStore.getState().setPixels(tabId, buf);
}

/** A guarded-write api that records its batches and answers with `reply`. */
function fakeApi(reply: (batch: { relPath: string }[]) => GuardedWriteResult): {
  api: GuardedWriteApi; batches: { relPath: string }[][];
} {
  const batches: { relPath: string }[][] = [];
  return {
    api: {
      writeGuarded: vi.fn(async (_dir: string, files: GuardedWriteFile[]) => {
        batches.push(files.map((f) => ({ relPath: f.relPath })));
        return reply(files);
      }),
    },
    batches,
  };
}

const okReply = (batch: { relPath: string }[]): GuardedWriteResult => ({
  written: batch.map((f) => f.relPath),
  newMtimes: Object.fromEntries(batch.map((f) => [f.relPath, 2000])),
});

function toastMessages(): string[] {
  return useToastStore.getState().toasts.map((t) => t.message);
}

beforeEach(() => {
  ensureSaversRegistered();
  useCanvasStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
  useSessionStore.getState().reset();
  __resetRuntimeSaversForTest();
});
afterEach(() => {
  __resetRuntimeSaversForTest();
});

describe('canvas save routing', () => {
  it('the canvas saver owns canvas tabs and nothing else', () => {
    expect(saveCoordinator.activeSaver(TAB.id)?.id).toBe('canvas-doc');
    expect(saveCoordinator.activeSaver('level:ghz:1')?.id).not.toBe('canvas-doc');
    expect(saveCoordinator.activeSaver('home')).toBeNull();
    expect(saveCoordinator.activeSaver('tool:project-setup')).toBeNull();
    // NOT asserted here: that a sprite tab is not owned by canvas-doc. That
    // assertion cannot fail — `activeSaver` is first-match-wins and sprite-art
    // registers AHEAD of canvas-doc, so widening canvas's `owns` to `() => true`
    // leaves it green (verified by planting exactly that). A test that cannot
    // fail is not covering the sprite case; the registration ORDER is the fact
    // the safety actually rests on, so it gets its own test below.
  });

  it('registers behind sprite-art and ahead of both project savers', () => {
    // saveAll walks the savers in registration order and pushes each to `saved`
    // or `skipped`, so with nothing dirty `skipped` IS the registration order.
    // This is what makes the sprite/canvas split safe (first-match-wins gives
    // sprite tabs to sprite-art) and what keeps pixel edits from being stranded
    // behind a level-save error.
    return saveAllDirty().then((r) => {
      expect(r.skipped).toEqual(['sprite-art', 'canvas-doc', 'classic-level', 'aeon-project']);
    });
  });

  it('Ctrl+S on a canvas tab writes THAT canvas only', async () => {
    const saved: string[] = [];
    __setRuntimeSaversForTest({ canvasDoc: async (docId: string) => { saved.push(docId); } });
    dirtyCanvas(TAB.id, 'sky');
    dirtyCanvas(OTHER.id, 'rock');

    const result = await saveActive(TAB.id);
    expect(result.saved).toEqual(['canvas-doc']);
    expect(saved).toEqual([TAB.id]);
    // The background canvas keeps its unsaved edits — Ctrl+S is not Save All.
    expect(useCanvasStore.getState().isDirty(OTHER.id)).toBe(true);
  });

  it('Save All writes EVERY dirty canvas', async () => {
    const saved: string[] = [];
    __setRuntimeSaversForTest({ canvasDoc: async (docId: string) => { saved.push(docId); } });
    dirtyCanvas(TAB.id, 'sky');
    dirtyCanvas(OTHER.id, 'rock');

    const result = await saveAllDirty();
    expect(result.saved).toContain('canvas-doc');
    expect(saved.sort()).toEqual([OTHER.id, TAB.id].sort());
  });

  it('Save is inert on a clean canvas tab', () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    useCanvasStore.getState().setSource(TAB.id, sourceFor('sky'));
    expect(canSaveActive(TAB.id)).toBe(false);
  });

  it('Save is inert on a dirty canvas that has no destination yet', () => {
    // Dirty but source-less: nowhere to write. It still dots (see the dot test
    // below) — the dot and the savability are deliberately different questions.
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 2);
    useCanvasStore.getState().setPixels(TAB.id, buf);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);
    expect(canSaveActive(TAB.id)).toBe(false);
  });

  it('a dirty canvas dots its own tab', () => {
    dirtyCanvas(TAB.id, 'sky');
    const snap: DirtySnapshot = {
      classicOpen: false, classicRef: null, classicDirty: false,
      aeonOpen: false, aeonDirty: false,
      dirtySpriteDocIds: [], dirtyCanvasDocIds: [TAB.id],
    };
    expect(tabHasDirtyDot(TAB.id, 'art-doc', snap)).toBe(true);
    expect(tabHasDirtyDot(OTHER.id, 'art-doc', snap)).toBe(false);
  });

  it('the live snapshot carries canvas dirtiness, including a destination-less canvas', () => {
    // Pins the WIRING, not just the rule: a dirty-tabs branch that reads a field
    // dirty-snapshot never populates dots nothing.
    dirtyCanvas(TAB.id, 'sky');
    openCanvasDoc(OTHER.id, { name: 'rock', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(0, 5);
    useCanvasStore.getState().setPixels(OTHER.id, buf);

    const snap = currentDirtySnapshot();
    expect([...snap.dirtyCanvasDocIds].sort()).toEqual([OTHER.id, TAB.id].sort());
    expect(tabHasDirtyDot(TAB.id, 'art-doc', snap)).toBe(true);
    // Unsavable but unsaved: it must still dot, or a close discards it silently.
    expect(tabHasDirtyDot(OTHER.id, 'art-doc', snap)).toBe(true);
  });

  it('a project switch drops every canvas document', () => {
    // A document that outlived its project keeps a source pointing at the OLD
    // project's directory by absolute path — a later Ctrl+S would write across
    // projects. Same reasoning as the sprite closeAll already in
    // resetProjectRuntime.
    dirtyCanvas(TAB.id, 'sky');
    resetProjectRuntime();
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });
});

describe('saveCanvasDocument', () => {
  it('writes both files, clears the dot, and refreshes the baselines', async () => {
    dirtyCanvas(TAB.id, 'sky');
    const { api, batches } = fakeApi(okReply);

    await saveCanvasDocument(TAB.id, api);

    expect(batches[0].map((f) => f.relPath))
      .toEqual([canvasPngPath('sky'), canvasSidecarPath('sky')]);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(false);
    const src = useCanvasStore.getState().sourceOf(TAB.id)!;
    expect(src.pngMtimeMs).toBe(2000);
    expect(src.sidecarMtimeMs).toBe(2000);
    expect(toastMessages()).toEqual([]); // a clean save says nothing
  });

  it('a document that closed mid-flight is a silent no-op, not a throw', async () => {
    const { api, batches } = fakeApi(okReply);
    await expect(saveCanvasDocument('doc:canvas:gone', api)).resolves.toBeUndefined();
    expect(batches).toEqual([]);
  });

  describe('when the sidecar was rejected at load (R15)', () => {
    it('omits the sidecar, and says so with the recovery instruction', async () => {
      dirtyCanvas(TAB.id, 'sky', { sidecarRejected: true });
      const { api, batches } = fakeApi(okReply);

      await saveCanvasDocument(TAB.id, api);

      // Not in the batch: do not destroy what you could not read.
      expect(batches[0].map((f) => f.relPath)).toEqual([canvasPngPath('sky')]);
      // The dot DOES clear — the pixels are on disk and the sidecar never will
      // be for this document, so a permanent dot would be its own lie. The
      // toast is what keeps "clean" from meaning "fully saved".
      expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(false);

      const [msg, ...rest] = toastMessages();
      expect(rest).toEqual([]);           // exactly one notice
      expect(msg).toContain(canvasSidecarPath('sky'));  // WHICH file
      expect(msg).toMatch(/could not be read/);          // WHAT happened
      expect(msg).toMatch(/profile/i);                   // WHAT was not written
      expect(msg).toMatch(/grid origin/i);
      expect(msg).toMatch(/reopen/i);                    // WHAT to do about it
      expect(useToastStore.getState().toasts[0].type).toBe('error');
    });

    it('keeps the sidecar baseline, so the NEXT save does not conflict on it', async () => {
      // A file that was never queued did not change on disk. Folding its absence
      // from `newMtimes` to null would read as "did not exist at read" and turn
      // the next real sidecar write into a false external-change conflict.
      dirtyCanvas(TAB.id, 'sky', { sidecarRejected: true });
      await saveCanvasDocument(TAB.id, fakeApi(okReply).api);
      expect(useCanvasStore.getState().sourceOf(TAB.id)!.sidecarMtimeMs).toBe(1000);
    });

    it('a successful save does NOT clear sidecarRejected', async () => {
      // The flag means "Aurora has not successfully READ this sidecar", and only
      // a read can disprove that — reopening the canvas. A write proves nothing
      // about readability, so it must not silence the warning.
      dirtyCanvas(TAB.id, 'sky', { sidecarRejected: true });
      await saveCanvasDocument(TAB.id, fakeApi(okReply).api);
      expect(useCanvasStore.getState().sourceOf(TAB.id)!.sidecarRejected).toBe(true);

      // And it keeps reporting on every subsequent save, not just the first.
      useToastStore.setState({ toasts: [] });
      const buf = createBuffer(8, 8);
      buf.data[1] = canvasIndex(2, 3);
      useCanvasStore.getState().setPixels(TAB.id, buf);
      await saveCanvasDocument(TAB.id, fakeApi(okReply).api);
      expect(toastMessages()).toHaveLength(1);
    });
  });

  it('a conflict throws with recovery advice, writes nothing, and stays dirty', async () => {
    dirtyCanvas(TAB.id, 'sky');
    const { api } = fakeApi(() => ({ conflicts: [canvasPngPath('sky')] }));

    await expect(saveCanvasDocument(TAB.id, api)).rejects.toThrow(/changed on disk/);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);
    // Nothing landed, so no baseline may move.
    expect(useCanvasStore.getState().sourceOf(TAB.id)!.pngMtimeMs).toBe(1000);
  });

  it('a partial write keeps the dot but DOES move the baseline of what landed', async () => {
    // The trap this pins: the PNG is on disk with a new mtime while the store
    // still expects the old one, so the retry conflicts on a file Aurora itself
    // wrote — a conflict no reload can resolve.
    dirtyCanvas(TAB.id, 'sky');
    const { api } = fakeApi(() => ({
      written: [canvasPngPath('sky')],
      newMtimes: { [canvasPngPath('sky')]: 2000 },
      failed: { path: canvasSidecarPath('sky'), message: 'EACCES' },
      unwritten: [],
    }));

    await expect(saveCanvasDocument(TAB.id, api)).rejects.toThrow(/EACCES/);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true); // retryable
    const src = useCanvasStore.getState().sourceOf(TAB.id)!;
    expect(src.pngMtimeMs).toBe(2000);   // landed → new baseline
    expect(src.sidecarMtimeMs).toBe(1000); // did not land → unchanged
  });

  it('a channel error throws and refreshes NOTHING (the disk state is unknown)', async () => {
    dirtyCanvas(TAB.id, 'sky');
    const api: GuardedWriteApi = { writeGuarded: vi.fn(async () => { throw new Error('no ipc'); }) };

    await expect(saveCanvasDocument(TAB.id, api)).rejects.toThrow(/no ipc/);
    expect(useCanvasStore.getState().isDirty(TAB.id)).toBe(true);
    expect(useCanvasStore.getState().sourceOf(TAB.id)!.pngMtimeMs).toBe(1000);
  });

  it('a failed Ctrl+S produces exactly ONE toast', async () => {
    // saveActive already toasts every `failed` entry, so the bridge deliberately
    // throws instead of toasting: two notices for one failure is the bug.
    dirtyCanvas(TAB.id, 'sky');
    __setRuntimeSaversForTest({
      canvasDoc: async (docId: string) => {
        await saveCanvasDocument(docId, fakeApi(() => ({ conflicts: ['x'] })).api);
      },
    });

    const r = await saveActive(TAB.id);
    expect(r.failed.map((f) => f.id)).toEqual(['canvas-doc']);
    const msgs = toastMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('canvas-doc');
    expect(msgs[0]).toMatch(/changed on disk/); // the bridge's advice survives
  });
});
