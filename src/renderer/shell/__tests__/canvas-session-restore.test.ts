// Task 13's R17(1) decision, pinned: canvas tabs SURVIVE A RESTART, and a
// canvas whose file has since been deleted does not toast at every boot.
//
// Both halves need a test because both are one line, and deleting either leaves
// the suite green while breaking a behaviour that is only observable by
// restarting the app:
//
//   • `restoredTabIsValid` — drop the canvas branch and pruneSession silently
//     deletes every canvas tab on restore, exactly as it did before this task.
//   • the silent failure — drop `reportLoadFailure: false` and a canvas whose
//     PNG was deleted between sessions produces a 10-second error toast at every
//     single launch, forever, about a file the user may have deleted on purpose.
//     That cost is the reason R17(1) left the policy open rather than calling
//     the two-line fix obvious.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { restoredTabIsValid } from '../session-lifecycle';
import { activateRestoredCanvasDocTarget } from '../tab-activation';
import { canvasDocTab, PROJECT_SETUP_TAB } from '../tabs';
import { useCanvasStore, canvasDocState } from '../../state/canvasStore';
import { useToastStore } from '../../state/toastStore';
import { documentHistoryHub } from '../../state/history-hub';
import { blankCanvasDoc } from '../../../core/art/canvas-doc';
import { canvasPngPath, canvasSidecarPath, type LoadedCanvas } from '../../state/canvas-file';

const TAB = canvasDocTab('cliffs');

const CLASSIC = { enumerated: new Set([PROJECT_SETUP_TAB.id]), classicOpen: true, aeonOpen: false };
const AEON = { enumerated: new Set([PROJECT_SETUP_TAB.id]), classicOpen: false, aeonOpen: true };
const NONE = { enumerated: new Set([PROJECT_SETUP_TAB.id]), classicOpen: false, aeonOpen: false };

describe('restoredTabIsValid', () => {
  it('keeps a canvas tab in EITHER engine — a canvas has no engine', () => {
    expect(restoredTabIsValid(TAB.id, CLASSIC)).toBe(true);
    expect(restoredTabIsValid(TAB.id, AEON)).toBe(true);
  });

  it('drops a canvas tab when no project is open', () => {
    // Its path only resolves under a project root; with none there is nothing
    // for the activation to read.
    expect(restoredTabIsValid(TAB.id, NONE)).toBe(false);
  });

  it('still keeps enumerated tabs and engine-matched sprite tabs, and drops the rest', () => {
    expect(restoredTabIsValid(PROJECT_SETUP_TAB.id, CLASSIC)).toBe(true);
    expect(restoredTabIsValid('doc:sprite:s1:75', CLASSIC)).toBe(true);
    expect(restoredTabIsValid('doc:sprite:s1:75', AEON)).toBe(false);
    expect(restoredTabIsValid('doc:sprite:aeon:motobug', AEON)).toBe(true);
    expect(restoredTabIsValid('level:ghz:1', CLASSIC)).toBe(false); // not in `enumerated`
    expect(restoredTabIsValid('something-else', CLASSIC)).toBe(false);
  });
});

describe('activateRestoredCanvasDocTarget', () => {
  beforeEach(() => {
    useCanvasStore.getState().closeAll();
    documentHistoryHub.clearAll();
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => { useCanvasStore.getState().closeAll(); });

  it('loads and focuses a canvas that reads fine, warnings included', () => {
    // Restoring is only worth doing if it actually restores.
    const doc = blankCanvasDoc({ name: 'cliffs', width: 8, height: 8, profileId: 'none' });
    doc.pixels.data[0] = 5;
    const loaded: LoadedCanvas = {
      doc,
      source: {
        dir: '/p', pngPath: canvasPngPath('cliffs'), sidecarPath: canvasSidecarPath('cliffs'),
        pngMtimeMs: 1, sidecarMtimeMs: 1, sidecarRejected: false,
      },
      warnings: ['its palette disagrees with its sidecar'],
      sidecarRejected: false,
    };
    return activateRestoredCanvasDocTarget(TAB.id, async () => loaded).then(() => {
      expect(canvasDocState(TAB.id)?.pixels.data[0]).toBe(5);
      expect(useCanvasStore.getState().activeDocId).toBe(TAB.id);
      // A file that OPENED still reports its diagnoses — the reader is about to
      // draw on it. Only the failure is silenced.
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  it('says NOTHING when the file is gone — the pane carries that report instead', async () => {
    await activateRestoredCanvasDocTarget(TAB.id, async () => { throw new Error('ENOENT'); });
    expect(useToastStore.getState().toasts).toEqual([]);
    // And leaves nothing behind, so canvasPaneState renders CanvasDocUnloaded:
    // the tab is focusable, names the file and offers Retry.
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().activeDocId).toBeNull();
  });
});
