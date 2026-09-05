// src/renderer/state/canvas-save.ts
//
// Save ONE canvas document back to its files — the bridge between the
// SaveCoordinator's `canvas-doc` saver (project-runtime.ts) and the path/IO
// layer (canvas-file.ts). Split out of canvas-file.ts so that pure path layer
// stays free of store imports, and out of project-runtime.ts so the saver's
// registration stays a wiring list.
//
// WHO REPORTS A FAILURE, AND WHY THIS MODULE MOSTLY DOESN'T TOAST.
// SaveCoordinator's contract is "throw to report failure", and BOTH entry
// points above it — `saveActive` and `saveAllDirty` in project-runtime.ts —
// already toast every entry of `result.failed`. Toasting here as well would put
// two notices on screen for one failed save. So every failure path below throws
// with the FULL recovery instruction in the message, because that message is
// the text the user actually reads.
//
// The one thing this module does toast is the case that is NOT a failure and
// that nothing above can see: `{ ok: true, sidecarWritten: false }` (R15). A
// save that succeeded but deliberately skipped the sidecar clears the dirty dot
// while the constraint profile and grid origin stay unpersisted — "clean means
// saved" would be a lie, and a silent one, since the coordinator only ever
// hears `ok`. See the toast below.

import { canvasDocState, useCanvasStore } from './canvasStore';
import { saveCanvasFile, type GuardedWriteApi } from './canvas-file';
import { useToastStore } from './toastStore';
import type { SaveReport } from './save-outcome-report';

/**
 * Write a canvas document back to the pair it was loaded from.
 *
 * Throws on failure (the coordinator's contract).
 *
 * Resolves silently for a document that is not open OR has no `CanvasSource`.
 * On the SAVER's path that means the document closed mid-save (the saver reads
 * `saveableDirtyCanvasDocIds`, which already requires a source), which is not
 * an error the user can act on. It is NOT a statement that this function only
 * works for already-saved documents: a first write goes through here too —
 * `setSource` with `pngMtimeMs`/`sidecarMtimeMs` of `null` (the guarded-write
 * spelling of "this file did not exist when we read it"), then call this. Task
 * 13's New Canvas flow should take that path rather than adding a second
 * `saveCanvasFile` call site, which is exactly what splitting this module out
 * was meant to prevent.
 *
 * `api` exists as a test seam only — the same one `saveCanvasFile` already
 * offers, threaded through so a routing test can drive the REAL save path
 * without standing up a global `window`.
 */
export async function saveCanvasDocument(
  docId: string, api?: GuardedWriteApi, report?: SaveReport,
): Promise<void> {
  // `report` exists so the Save-All loop in project-runtime.ts can COLLECT the
  // two non-throwing outcomes below instead of painting one per document — see
  // state/save-outcome-report.ts. Defaulted to the toast, so Ctrl+S on a single
  // canvas is unchanged. (The THROWING paths are untouched: they abort the loop,
  // so they were never the unbounded ones.)
  const say: SaveReport = report ?? useToastStore.getState().addToast;
  const doc = canvasDocState(docId);
  const source = useCanvasStore.getState().sourceOf(docId);
  if (!doc || !source) return; // nothing to write; not an error
  // The counter describing THESE bytes. Read beside the document, before the
  // encode and the write, so `markSaved` can tell whether the pixels that
  // landed are still the pixels the artist has.
  const atGen = useCanvasStore.getState().docs.get(docId)?.editGen;

  const res = await saveCanvasFile(
    source.dir, doc.name, doc,
    { pngMtimeMs: source.pngMtimeMs, sidecarMtimeMs: source.sidecarMtimeMs },
    // R12/R15: a sidecar Aurora could not READ is one it must not overwrite.
    // The flag lives on the source precisely so a save long after the load
    // still knows it.
    source.sidecarRejected,
    api,
  );

  if (!res.ok) {
    // Branch on `kind` ALONE, never on the optional payload. `SaveCanvasResult`
    // is one object type with a `kind` union rather than a discriminated union
    // of separate members, so `partial` is optional on every failure and the
    // compiler cannot prove it is present here. Testing `kind === 'partial' &&
    // res.partial` reads fine and silently routes a payload-less partial into
    // the catch-all at the bottom, reporting a batch that half-landed as if
    // nothing had been sent.
    if (res.kind === 'partial') {
      const p = res.partial;
      // SOME files landed. Fold their fresh mtimes into the source even though
      // the save failed overall, or the next attempt conflicts on a file AURORA
      // ITSELF just wrote — an unresolvable conflict whose only escape is
      // reopening the canvas. `setSource`, not `markSaved`: the document is
      // still dirty (the failed file's content is not on disk) and must keep
      // its dot so a retry is possible.
      if (p) refreshBaselines(docId, p.pngMtimeMs, p.sidecarMtimeMs);
      throw new Error(
        `${res.error}: ${p ? p.unwritten.length + 1 : 'some'} file(s) of this canvas did not land. ` +
        'The canvas is still marked unsaved; fix the error and save again.',
      );
    }
    if (res.kind === 'conflict') {
      // Main wrote NOTHING, so no baseline moves. Reopening is the only
      // recovery Aurora offers in 2A (there is no merge UI), and saying so is
      // the difference between a dead end and an instruction. Built ON TOP of
      // `res.error` rather than restating it: canvas-file.ts already names the
      // files and says nothing was written, and a second hand-written copy of
      // that sentence is one that drifts.
      throw new Error(
        `${res.error}. Reopen the canvas to pick up the external change ` +
        '(your unsaved edits in this tab will be lost).',
      );
    }
    if (res.kind === 'channel-error') {
      // The disk state is UNKNOWN — the call never came back — so deliberately
      // refresh no baselines. Same posture as classic-save.ts's channel-error.
      throw new Error(`${res.error}: the canvas may or may not have been written; reopen it to check.`);
    }
    throw new Error(res.error); // invalid-name: nothing was sent to disk
  }

  const cleared = useCanvasStore.getState().markSaved(docId, {
    pngMtimeMs: res.pngMtimeMs, sidecarMtimeMs: res.sidecarMtimeMs,
  }, atGen);

  // The write succeeded, but the artist kept painting while it was in flight,
  // so what is on disk is already behind what is on screen. Saying nothing here
  // is the silent case: the dot would have cleared over unsaved pixels.
  if (!cleared) {
    say(
      `Saved "${doc.name}", but edits made during the save are still unsaved; save again`,
      'info',
    );
  }

  // `ok && !sidecarWritten` happens for exactly one reason: `sidecarRejected`
  // made `saveCanvasFile` leave the sidecar out of the batch (a successful
  // batch writes everything it queued). The dot has just cleared and the pixels
  // ARE on disk — but the profile and grid origin are not, and they will not be
  // on the next save either, so the user has to be told every time, and told
  // what to DO about it rather than merely that something was skipped.
  if (!res.sidecarWritten) {
    say(
      `Saved the pixels of "${doc.name}", but not its settings: ${source.sidecarPath} could not be read ` +
      'when this canvas was opened, so Aurora left it alone instead of overwriting it. ' +
      'The constraint profile and grid origin were NOT written. ' +
      'Fix that file by hand (it must be valid JSON) and reopen the canvas to recover them.',
      'error',
    );
  }

  // DELIBERATELY NOT CLEARED: `source.sidecarRejected` survives a successful
  // save. `sidecarRejected` means "Aurora has not successfully READ this
  // sidecar", and only a successful read can disprove that — a write proves
  // nothing about readability. Reopening the canvas is that read, and it is the
  // documented recovery in the toast above. (Clearing on `sidecarWritten` would
  // also be dead code today, since a rejected sidecar is never queued and so
  // can never come back written; the risk is that it LOOKS like an in-session
  // recovery path and isn't. When the "overwrite it anyway" flow lands past 2A,
  // clearing belongs to that flow, where the user consented, not to a generic
  // save.)
}

/** Move the guarded-write baselines forward WITHOUT clearing the dirty flag.
 *  Re-reads the source rather than spreading the one captured before the await,
 *  so a `setSource` that landed during the write is not silently reverted. */
function refreshBaselines(docId: string, pngMtimeMs: number | null, sidecarMtimeMs: number | null): void {
  const store = useCanvasStore.getState();
  const current = store.sourceOf(docId);
  if (!current) return; // the document closed mid-save; nothing to update
  store.setSource(docId, { ...current, pngMtimeMs, sidecarMtimeMs });
}
