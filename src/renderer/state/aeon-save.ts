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

import { buildAeonSavePlan } from '../../core/project/aeon/save';
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
      let existing: Array<{ bytes: Uint8Array | null }> = [];
      try {
        existing = await window.api.readManyFiles?.(
          config.basePath, plan.files.map((f) => f.path),
        ) ?? [];
      } catch { existing = []; }
      const same = (a: Uint8Array, b: Uint8Array | null): boolean => {
        if (!b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      for (let i = 0; i < plan.files.length; i++) {
        const f = plan.files[i];
        const old = existing[i]?.bytes ?? null;
        if (same(f.bytes, old)) continue;
        await window.api.writeBinaryFile(config.basePath, f.path,
          f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
      }
      written.push(key);
    }

    // Clear exactly what was written, and only where the act has not moved
    // since: the writes above are real IPC, so an edit committed during one is
    // not in the bytes on disk.
    const withheld = useEditorStore.getState().markActsClean(written, atGen);
    s.setLoading(false);

    // The export step, and with it the R8 branch that reported its failure, was
    // retired 2026-08-19 (ROADMAP §4.2). A save now writes editor files only,
    // so there is no second half that can fail quietly behind "Project saved".
    if (withheld.length) {
      useToastStore.getState().addToast(
        'Project saved, but edits made during the save are still unsaved — save again',
        'info',
      );
    } else {
      useToastStore.getState().addToast('Project saved', 'success');
    }
    return { kind: 'saved' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useProjectStore.getState().setError(message);
    useToastStore.getState().addToast('Save failed', 'error');
    return { kind: 'error', message };
  }
}
