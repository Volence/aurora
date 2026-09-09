// DIRTY-DOMAINS-ASSUMED-SAVABLE — the reproduction, and the fix it unblocks.
//
// The row sat open through two passes for want of a reproduction: `classicDirty`
// and `aeonDirty` were counted savable outright while their savers fire on
// `openEngine() === 's1'` / `'aeon'` and never read those flags, so either state
// would be a FOURTH instance of the unsatisfiable-Save class — but nobody had
// built one.
//
// THE ROUTE. `openEngine()` gives CLASSIC PRECEDENCE: `classicProjectStore
// .status === 'open'` is answered before `projectStore.project !== null` is even
// read (state/open-project.ts). So a classic project opened over a resident,
// DIRTY aeon project leaves `aeonDirty` true with the aeon saver skipping — and
// `classicProjectStore.openDirectory` is exactly the body of the `__aurora
// .classic.openDir` debug hook, the only unguarded open door left
// (renderer/debug-hooks.ts). These rows drive that function, with the store's own
// injectable bridge, rather than poking `status: 'open'` into the store: the
// question was whether a REAL open leaves that state, and a hand-set field cannot
// answer it.
//
// NOT A USER GESTURE. Nothing in production reaches it — useProject.openPath is
// guarded, the Project Setup re-validate already has classic open, and the
// agent's classic-open-project refuses on any dirt — so this is a hardening, and
// the row's own census is why. It IS reachable in a dev build and by every CDP
// harness, which drive that hook on every run.
//
// ⚠ THE CONTROL ROWS ARE THE POINT AS MUCH AS THE DEFECT ROWS. The reason given
// for leaving this alone twice was "tightening would drop the Save button in
// states the guard is right about today". That is the claim `Save is still
// offered ...` measures: same dirt, right engine, Save offered and effective.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  planProjectOpen, confirmProjectOpen, currentOpenDirtySnapshot,
  unsavedAgentRefusal, unsavedDialogBody,
  __resetOpenGuardSaveForTest,
} from '../project-open-guard';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import {
  useClassicProjectStore, __setClassicBridgeForTest, __resetClassicBridgeForTest,
} from '../../state/classicProjectStore';
import type { ClassicBridge } from '../../state/classic-bridge';
import type { ProjectHandle, ZoneActRef } from '../../../core/project/adapter';
import { useConfirmStore } from '../../state/confirmStore';
import { useToastStore } from '../../state/toastStore';
import { openCanvasDoc, useCanvasStore, type CanvasSource } from '../../state/canvasStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import {
  ensureSaversRegistered, __setRuntimeSaversForTest, __resetRuntimeSaversForTest,
} from '../../state/project-runtime';
// The saver predicates this file claims to mirror, asserted rather than quoted.
import { openEngine } from '../../state/open-project';
import { createSection } from '../../../core/model/s4-types';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

const CANVAS = 'doc:canvas:sky';

/** An open canvas with unsaved pixels AND a file target, so Save All can write it
 *  — the SAVABLE half of the mixed row below. Same fixture shape as
 *  project-open-guard.test.ts's canvas block. */
function dirtyCanvas(): void {
  openCanvasDoc(CANVAS, { name: 'sky', width: 8, height: 8, profileId: 'none' });
  useCanvasStore.getState().setSource(CANVAS, {
    dir: '/old-project',
    pngPath: '.aurora/canvas/sky.png',
    sidecarPath: '.aurora/canvas/sky.canvas.json',
    pngMtimeMs: 1000, sidecarMtimeMs: 1000, sidecarRejected: false,
  } as CanvasSource);
  const buf = createBuffer(8, 8);
  buf.data[0] = canvasIndex(1, 2);
  useCanvasStore.getState().setPixels(CANVAS, buf);
}

function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: {
      levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false,
      facets: ['layout', 'art', 'objects', 'palette'],
    },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [REF],
      read: async () => { throw new Error('not used'); },
      write: async () => ({ written: [], skipped: [], errors: [] }),
    },
  } as ProjectHandle;
}

const openedBridge: ClassicBridge = {
  open: async () => ({ kind: 'opened', handle: fakeHandle(), label: 'Sonic 1 Disassembly' }),
};

/** An aeon project resident: one zone, one act — what `openLoaded` leaves. */
function aeonResident(): void {
  useProjectStore.setState({
    project: {
      zones: [{
        id: 'z', name: 'Z', tileset: { tiles: [] }, palette: { lines: [] },
        acts: [{
          id: 'a', name: 'A', gridWidth: 1, gridHeight: 1,
          sections: [createSection(0, 'sec0')],
        }],
      }],
      chunkLibrary: [], bgLibrary: [],
    } as never,
    currentZoneId: 'z',
    currentActId: 'a',
  });
}

/**
 * THE UNGUARDED DOOR, called the way the debug hook calls it:
 * `openDir: (dir) => useClassicProjectStore.getState().openDirectory(dir)`.
 */
async function debugOpenClassic(): Promise<void> {
  __setClassicBridgeForTest(openedBridge);
  const outcome = await useClassicProjectStore.getState().openDirectory('/s1');
  expect(outcome).toBe('opened');
}

const KEYS = () => useConfirmStore.getState().request!.buttons.map((b) => b.key);

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  useProjectStore.getState().reset();
  useEditorStore.getState().markClean();
  useSpriteStore.getState().setS1ArtSource(null);
  useSpriteStore.getState().setUnsavedEdits(false);
  useCanvasStore.getState().closeAll();
  useArtStore.getState().closeDocument();
  useToastStore.setState({ toasts: [] });
  useConfirmStore.getState().answer('cancel');
  ensureSaversRegistered();
  __resetRuntimeSaversForTest();
});

afterEach(() => {
  __resetClassicBridgeForTest();
  __resetRuntimeSaversForTest();
  __resetOpenGuardSaveForTest();
  useConfirmStore.getState().answer('cancel');
  useClassicProjectStore.getState().reset();
  useProjectStore.getState().reset();
  useEditorStore.getState().markClean();
  useClassicLevelStore.getState().reset();
});

describe('DIRTY-DOMAINS-ASSUMED-SAVABLE: a dirty aeon project under an open classic one', () => {
  it('THE STATE IS REAL: a classic open over dirty aeon work leaves the aeon saver skipping',
    async () => {
      aeonResident();
      useEditorStore.setState({ dirty: true });
      expect(openEngine()).toBe('aeon');          // before: the aeon saver would fire

      await debugOpenClassic();

      // The three facts that together are the reproduction.
      expect(openEngine()).toBe('s1');                             // classic wins
      expect(useProjectStore.getState().project).not.toBeNull();    // aeon still resident
      expect(useEditorStore.getState().dirty).toBe(true);           // and still dirty
      // Nothing cleared it, and no dialog was shown: this door has no guard.
      expect(useConfirmStore.getState().request).toBeNull();
    });

  it('the snapshot no longer promises a Save that will not happen', async () => {
    aeonResident();
    useEditorStore.setState({ dirty: true });
    await debugOpenClassic();

    const snap = currentOpenDirtySnapshot();
    // STILL DIRTY — the guard must still confirm; only the SAVABILITY changed.
    expect(snap.aeonDirty).toBe(true);
    expect(planProjectOpen(snap).kind).toBe('confirm');
    // PRE-FIX: anySavable true, unsavable [] — "Save & open" as the primary over
    // work no saver will write.
    expect(snap.anySavable).toBe(false);
    expect(snap.unsavable.join(' ')).toMatch(/aeon project edits are resident while a CLASSIC project is open/);
    // And the dialog body a user reads says so BEFORE they press anything.
    const body = unsavedDialogBody('open', planProjectOpen(snap) as never);
    expect(body).toMatch(/aeon saver skips them/);
    expect(body).toMatch(/only ways out/);
  });

  it('END TO END: the dialog offers no Save, and the drawing is not lost to an inert loop',
    async () => {
      aeonResident();
      useEditorStore.setState({ dirty: true });
      await debugOpenClassic();

      // The REAL saveAllDirty over the REAL coordinator; only the leaf writes are
      // stubbed, and each records that it RAN — which is how the pre-fix reading
      // was taken (the aeon impl never fired, and the classic one that did fire
      // wrote a classic project nobody had edited).
      const ran: string[] = [];
      __setRuntimeSaversForTest({
        aeon: async () => { ran.push('aeon'); useEditorStore.getState().markClean(); },
        classic: async () => { ran.push('classic'); return { written: [], skipped: [], errors: [] } as never; },
      });

      const p = confirmProjectOpen();
      expect(KEYS()).toEqual(['discard', 'cancel']);   // PRE-FIX: ['save','discard','cancel']
      useConfirmStore.getState().answer('cancel');
      await expect(p).resolves.toBe(false);
      // Cancel keeps the work, and no saver was tricked into running.
      expect(useEditorStore.getState().dirty).toBe(true);
      expect(ran).toEqual([]);
    });

  it('MIXED: Save is still offered for the savable half, and the abort NAMES the aeon half',
    async () => {
      // The other side of the fix, and the one that turns a loop into an exit. A
      // savable canvas plus the unsavable aeon dirt: Save is worth pressing, it
      // cannot clear everything, and the abort has to say WHICH part it could not
      // write or the user is back to "save or discard them first" with no way to
      // act on it.
      //
      // PRE-FIX, measured on this exact state with the terms removed: buttons
      // ["save","discard","cancel"], body the generic sentence alone, and pressing
      // Save ran the CLASSIC saver (a project the user never edited) while the
      // aeon dirt survived, ending in the bare
      // "Open cancelled: unsaved changes remain (save or discard them first)."
      aeonResident();
      useEditorStore.setState({ dirty: true });
      await debugOpenClassic();
      dirtyCanvas();
      expect(currentOpenDirtySnapshot().anySavable).toBe(true);   // the canvas half

      const ran: string[] = [];
      __setRuntimeSaversForTest({
        aeon: async () => { ran.push('aeon'); useEditorStore.getState().markClean(); },
        classic: async () => { ran.push('classic'); return { written: [], skipped: [], errors: [] } as never; },
        // `atGen` is what canvasStore.markSaved requires (CANVAS-SAVE-GEN-OPTIONAL):
        // this stand-in save must clear the flag the way the real one does, or the
        // row would read a save failure as this fix's refusal.
        canvasDoc: async (docId) => {
          ran.push('canvasDoc');
          // `atGen` is required (CANVAS-SAVE-GEN-OPTIONAL): this stand-in raced no
          // edit, so it carries the counter as it stands. It must clear the flag
          // the way the real saver does, or the row would read an ordinary save
          // failure as this fix's refusal.
          useCanvasStore.getState().markSaved(
            docId, { pngMtimeMs: 2000, sidecarMtimeMs: 2000 },
            useCanvasStore.getState().docs.get(docId)!.editGen,
          );
          return true;
        },
      });

      const p = confirmProjectOpen();
      expect(KEYS()).toContain('save');
      useConfirmStore.getState().answer('save');
      await expect(p).resolves.toBe(false);       // the aeon dirt is real and unpersisted
      expect(ran).toContain('canvasDoc');         // the savable half DID get written
      expect(ran).not.toContain('aeon');          // and the aeon saver skipped, as its predicate says
      const msg = useToastStore.getState().toasts.at(-1)!.message;
      expect(msg).toMatch(/unsaved changes remain/);       // the generic half still applies
      expect(msg).toMatch(/aeon saver skips them/);         // only this fix says this
      expect(msg).toMatch(/Discard & open/);                // WHAT to do instead
      expect(useEditorStore.getState().dirty).toBe(true);
    });

  it('the AGENT door gets the same verdict, in its own words', async () => {
    // A third door with no buttons: `classic-open-project` refuses and its
    // sentence is all the caller gets. Pre-fix it said "Save first", which is the
    // advice that cannot be followed.
    aeonResident();
    useEditorStore.setState({ dirty: true });
    await debugOpenClassic();

    const why = unsavedAgentRefusal(planProjectOpen(currentOpenDirtySnapshot()) as never);
    expect(why).toMatch(/aeon saver skips them/);
    expect(why).toMatch(/None of it can be saved/);
    expect(why).not.toMatch(/Save first/);
  });

  it('CONTROL: the same aeon dirt with NO classic project open still offers Save, and Save clears it',
    async () => {
      // THE RISK THAT HELD THIS ROW OPEN TWICE, measured: "tightening would drop
      // the Save button in states the guard is right about today". Same dirt, no
      // classic project, and the button is there and works.
      aeonResident();
      useEditorStore.setState({ dirty: true });
      expect(openEngine()).toBe('aeon');
      const snap = currentOpenDirtySnapshot();
      expect(snap.anySavable).toBe(true);
      expect(snap.unsavable).toEqual([]);

      const ran: string[] = [];
      __setRuntimeSaversForTest({
        aeon: async () => { ran.push('aeon'); useEditorStore.getState().markClean(); },
      });
      const p = confirmProjectOpen();
      expect(KEYS()).toEqual(['save', 'discard', 'cancel']);
      useConfirmStore.getState().answer('save');
      await expect(p).resolves.toBe(true);
      expect(ran).toEqual(['aeon']);
      expect(useEditorStore.getState().dirty).toBe(false);
    });
});

describe('DIRTY-DOMAINS-ASSUMED-SAVABLE: the classic half', () => {
  // DEFENSIVE ONLY, and the file says so rather than implying a route exists:
  // `classicLevelStore.dirty` has one writer, reached only through commitLayout /
  // commitArt, both of which call requireClassicHistory first, which throws unless
  // the classic project is open. So `classicDirty` implies openEngine() === 's1'
  // by construction and this state is CONSTRUCTED here, not reproduced.
  it('a dirty classic level with no classic project open is reported unsavable', () => {
    useClassicLevelStore.setState({ dirty: { layout: true } as never });
    expect(openEngine()).toBeNull();
    const snap = currentOpenDirtySnapshot();
    expect(snap.classicDirty).toBe(true);
    expect(snap.anySavable).toBe(false);
    expect(snap.unsavable.join(' '))
      .toMatch(/classic level edits are resident with no classic project open/);
  });

  it('CONTROL: with the classic project open, the same dirt is savable and Save is offered',
    async () => {
      await debugOpenClassic();
      useClassicLevelStore.setState({ dirty: { layout: true } as never });
      expect(openEngine()).toBe('s1');
      const snap = currentOpenDirtySnapshot();
      expect(snap.classicDirty).toBe(true);
      expect(snap.anySavable).toBe(true);
      expect(snap.unsavable).toEqual([]);
      expect(planProjectOpen(snap)).toEqual({ kind: 'confirm', offerSave: true, unsavable: [] });
    });
});
