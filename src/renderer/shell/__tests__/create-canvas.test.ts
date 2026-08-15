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
let writeReply: () => GuardedWriteResult = () => ({
  written: [canvasPngPath('cliffs'), canvasSidecarPath('cliffs')],
  newMtimes: { [canvasPngPath('cliffs')]: 111, [canvasSidecarPath('cliffs')]: 222 },
});

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
    useCanvasStore.getState().setName(TAB.id, 'cliffs');  // dirty it, so a silent reuse would be visible
    const r = await createCanvasDocument(INPUT);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.reason).toContain('already open');
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(true);   // untouched
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
      writeReply = () => ({
        written: [canvasPngPath('cliffs'), canvasSidecarPath('cliffs')],
        newMtimes: { [canvasPngPath('cliffs')]: 111, [canvasSidecarPath('cliffs')]: 222 },
      });
    }
  });

  it('refuses with no project open', async () => {
    useClassicProjectStore.setState({ status: 'closed', dir: null } as never);
    const r = await createCanvasDocument(INPUT);
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });
});
