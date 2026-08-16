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
    const exportErrors: string[] = [];
    const written: string[] = [];

    for (const key of targets) {
      const ref = splitActKey(key);
      if (!ref) continue;
      const plan = await buildAeonSavePlan(fa, config, project, ref.zoneId, ref.actId,
        { legacyAtlasMerged: s.legacyAtlasMerged });
      for (const f of plan.files) {
        await window.api.writeBinaryFile(config.basePath, f.path,
          f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
      }
      if (plan.exportError) exportErrors.push(`${key}: ${plan.exportError}`);
      written.push(key);
    }

    // Clear exactly what was written, and only where the act has not moved
    // since: the writes above are real IPC, so an edit committed during one is
    // not in the bytes on disk.
    const withheld = useEditorStore.getState().markActsClean(written, atGen);
    s.setLoading(false);

    // THE EXPORT STEP IS PART OF THE SAVE, so its failure is part of the
    // answer. Its only consumer used to be a console.warn while the toast said
    // "Project saved" — leaving export/act_descriptor.asm, entity_data.asm,
    // vram_bases.asm and the section binaries at the PREVIOUS save's contents,
    // which the engine build then consumes. Ordinary authoring mistakes reach
    // it (a 33rd unique object type, x past $7FF, a tile union past the pool),
    // and the diagnostic that would let the artist fix it existed only in
    // devtools.
    if (exportErrors.length) {
      console.warn('[save] Export step failed:', exportErrors.join('; '));
      useToastStore.getState().addToast(
        `Saved the level data, but the engine export failed — the files under export/ are STALE ` +
        `and a build will use the previous save's. ${exportErrors[0]}`,
        'error',
      );
    } else if (withheld.length) {
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
