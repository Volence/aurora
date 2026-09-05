// Aeon save glue — replaces useProject.saveProject. Core builds the plan
// (all serialization); this writes the files over IPC and owns the store
// effects (loading flag, markClean, toasts). Result is a VARIANT, not a
// throw — consumers judge success from the variant themselves (matching
// classic-save.ts's convention, where the caller owns its success check).
//
// IT SAVES EVERY DIRTY ACT, not the current one. `buildAeonSavePlan` resolves
// exactly ONE act and loops its sections, and this used to call it once and
// then clear the whole project's dirty flag — so editing act 1, switching to
// act 2 and pressing Ctrl+S wrote act 2, reported success, left no dot on any
// tab, and let the next project switch proceed without a confirm. Act 1's
// edits were gone. Multi-act is a designed configuration, so the loop is the
// fix rather than a note to remember later.

import { buildAeonSavePlan, type AeonSaveRemoval } from '../../core/project/aeon/save';
import { planFileNeedsWrite } from '../../core/project/aeon/save-skip';
import { noteEffectsScenesPersisted } from '../../core/formats/effects/scene';
import { noteEffectsPresetsPersisted } from '../../core/formats/effects/preset';
import { nameSome } from '../../core/project/notice';
import { createIpcFileAccess } from './classic-file-access';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useToastStore } from './toastStore';

export type AeonSaveResult =
  | { kind: 'saved' }
  | { kind: 'nothing' }          // no project / no current act — nothing to write
  | { kind: 'error'; message: string };

/** `${zoneId}/${actId}` back into its two halves. Act ids never contain a
 *  slash; splitting on the FIRST one keeps that assumption in one place. */
function splitActKey(key: string): { zoneId: string; actId: string } | null {
  const at = key.indexOf('/');
  if (at <= 0 || at === key.length - 1) return null;
  return { zoneId: key.slice(0, at), actId: key.slice(at + 1) };
}

export async function saveAeonProject(): Promise<AeonSaveResult> {
  const s = useProjectStore.getState();
  const { config, project, currentZoneId, currentActId } = s;
  if (!config || !project || !currentZoneId || !currentActId) return { kind: 'nothing' };

  // Every act with unsaved edits — plus the current one, so an explicit save
  // with nothing recorded still writes (the pre-tracking behaviour).
  const atGen = { ...useEditorStore.getState().dirtyActs };
  const targets = Object.keys(atGen);
  const current = `${currentZoneId}/${currentActId}`;
  if (!targets.includes(current)) targets.push(current);

  try {
    s.setLoading(true);
    const fa = createIpcFileAccess(config.basePath);
    const written: string[] = [];
    // Removals are collected across every act's plan and applied AFTER all of
    // them — see the ordering argument on `removalsFor` in core. The effects
    // libraries are per-PROJECT while a plan is per-ACT, so the same removal
    // appears in every act's plan; dedupe by path.
    const pendingRemovals = new Map<string, AeonSaveRemoval>();
    let ledgers: { scenePaths: string[]; presetPaths: string[] } | null = null;

    for (const key of targets) {
      const ref = splitActKey(key);
      if (!ref) continue;
      const plan = await buildAeonSavePlan(fa, config, project, ref.zoneId, ref.actId,
        { legacyAtlasMerged: s.legacyAtlasMerged });
      // WRITE ONLY WHAT CHANGED.
      //
      // The plan regenerates every file for the act whether or not you touched
      // it, so a blind write bumps the mtime of ~40 files — over a megabyte —
      // to change one chunk. That is slow, but the expensive part is what it
      // does DOWNSTREAM: aeon's build decides whether to re-bake the level tree
      // by comparing editor-source mtimes against generated ones, so rewriting
      // an untouched file marks the whole tree stale forever. Every build then
      // paid a 7s re-bake it did not need — measured, and named in aeon's own
      // build banner ("newest editor source: ojz_bg_..._tiles.bin").
      //
      // One batched read, compare, write the differences. A read that fails
      // (missing file, first save) simply has no old bytes and is written.
      // Degrades to writing everything if the batch read is unavailable or
      // throws: skipping an unchanged write is an optimisation, and a save must
      // never fail because an optimisation could not run.
      //
      // ⚠ THE COMPARISON IS BY MEANING, NOT BY BYTES, and the difference is the
      // whole of EW-SAVE-NOISE: a byte test let 23 files through on one Ctrl+S
      // whose parsed value had not moved — 22 gaining only the §8 trailing
      // newline aeon's Python writers omit, 2 gaining only `"rasterRef": null`.
      // `planFileNeedsWrite` owns every rule and every refusal to relax one;
      // read the header of save-skip.ts before widening anything there.
      let existing: Array<{ bytes: Uint8Array | null }> = [];
      try {
        existing = await window.api.readManyFiles?.(
          config.basePath, plan.files.map((f) => f.path),
        ) ?? [];
      } catch { existing = []; }
      for (let i = 0; i < plan.files.length; i++) {
        const f = plan.files[i];
        const old = existing[i]?.bytes ?? null;
        if (!planFileNeedsWrite(f.compare, old, f.bytes)) continue;
        await window.api.writeBinaryFile(config.basePath, f.path,
          f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
      }
      for (const r of plan.removals) pendingRemovals.set(r.path, r);
      ledgers = plan.ledgers;
      written.push(key);
    }

    // ═══ THE REMOVAL STEP ═════════════════════════════════════════════════
    //
    // WHY IT EXISTS: without it, `Delete scene` removed the scene from the
    // session and left its file on disk, so the author's deletion was silently
    // undone on the next open (measured — `npm run harness:deleted-scene-returns`
    // rows [1e]/[1h], and the same for raster presets at [2d]/[2f]).
    //
    // WHY IT IS LAST: a crash between the writes and here leaves the new state
    // written and the deleted documents still present — i.e. exactly the old
    // behaviour, recoverable by deleting again. The other order could take a
    // file away while the sidecar that stopped pointing at it never landed.
    //
    // WHAT IT MAY TOUCH is not decided here. `core/project/aeon/save.ts`
    // derives it from each library's `loadedPaths` ledger; a file this session
    // never read as a document of that kind is in no such list and is
    // unreachable from this loop.
    const removed: string[] = [];
    const failedRemovals = new Set<string>();
    for (const r of pendingRemovals.values()) {
      let outcome;
      try {
        outcome = await window.api.deleteFile?.(config.basePath, r.path);
      } catch (e) {
        outcome = { ok: false as const, reason: e instanceof Error ? e.message : String(e) };
      }
      if (outcome && outcome.ok) {
        removed.push(r.what);
        // Every removal is named individually in the console — the summary
        // below counts and samples, and a count that lost WHICH document went
        // would make the author's next step impossible (the rule
        // state/save-outcome-report.ts states for its own fold).
        console.warn(`[aeon-save] removed ${r.what} — ${r.path}`
          + (outcome.deleted ? '' : ' (it was already gone)'));
      } else {
        // KEPT IN THE LEDGER. A path this save could not remove must still be
        // removable by the next one; dropping it here would make one EPERM
        // permanent.
        failedRemovals.add(r.path);
        console.warn(`[aeon-save] could NOT remove ${r.what} — ${r.path}: `
          + `${outcome ? outcome.reason : 'no delete channel on window.api'}`);
      }
    }

    // ═══ THE LEDGER, UPDATED ONLY BY WHAT ACTUALLY HAPPENED ═══════════════
    //
    // After this save, the editor knows these paths hold a document: the ones
    // the plan wrote, PLUS any it meant to remove and could not. The first half
    // is what closes "create a scene, save, delete it, save" — its file was
    // never LOADED, so a ledger seeded only at load could never reach it.
    if (ledgers && project) {
      const keptScenes = project.effectsScenes.loadedPaths.filter((p) => failedRemovals.has(p));
      const keptPresets = project.effectsPresets.loadedPaths.filter((p) => failedRemovals.has(p));
      noteEffectsScenesPersisted(project.effectsScenes, [...ledgers.scenePaths, ...keptScenes]);
      noteEffectsPresetsPersisted(project.effectsPresets, [...ledgers.presetPaths, ...keptPresets]);
    }

    // Clear exactly what was written, and only where the act has not moved
    // since: the writes above are real IPC, so an edit committed during one is
    // not in the bytes on disk.
    const withheld = useEditorStore.getState().markActsClean(written, atGen);
    s.setLoading(false);

    // The export step, and with it the R8 branch that reported its failure, was
    // retired 2026-08-19 (ROADMAP §4.2). A save now writes editor files only,
    // so there is no second half that can fail quietly behind "Project saved".
    // A DELETION IS THE PART OF A SAVE AN AUTHOR MOST WANTS TO SEE, so it is
    // named on the same line that says the save happened rather than left to
    // the console alone. Counted and sampled through `nameSome`, the idiom the
    // effects loaders and the Save-All fold already use, so a long list can
    // never render "I could not tell" as silence.
    const removedNote = removed.length === 1
      ? ` · removed ${removed[0]}`
      : removed.length > 1
        ? ` · removed ${removed.length} files — ${nameSome(removed)}`
        : '';
    if (withheld.length) {
      useToastStore.getState().addToast(
        `Project saved, but edits made during the save are still unsaved — save again${removedNote}`,
        'info',
      );
    } else {
      useToastStore.getState().addToast(`Project saved${removedNote}`, 'success');
    }
    // A failed removal is its own channel and its own colour: the save DID
    // happen, and folding this into the green line would be the same defect
    // wearing the other one (core/project/notice.ts — coalescing changes the
    // count, never the channel).
    if (failedRemovals.size > 0) {
      useToastStore.getState().addToast(
        `Project saved, but ${failedRemovals.size} deleted document`
        + `${failedRemovals.size === 1 ? '' : 's'} could not be removed from disk — `
        + `${nameSome([...failedRemovals])}. They will be retried on the next save; `
        + 'each reason is in the developer console.',
        'error',
      );
    }
    return { kind: 'saved' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useProjectStore.getState().setError(message);
    useToastStore.getState().addToast('Save failed', 'error');
    return { kind: 'error', message };
  }
}
