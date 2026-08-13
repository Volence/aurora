// Aeon save glue — replaces useProject.saveProject. Core builds the plan
// (all serialization); this writes the files over IPC and owns the store
// effects (loading flag, markClean, toasts). Result is a VARIANT, not a
// throw — consumers judge success from the variant themselves (matching
// classic-save.ts's convention, where the caller owns its success check).

import { buildAeonSavePlan } from '../../core/project/aeon/save';
import { createIpcFileAccess } from './classic-file-access';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useToastStore } from './toastStore';

export type AeonSaveResult =
  | { kind: 'saved' }
  | { kind: 'nothing' }          // no project / no current act — nothing to write
  | { kind: 'error'; message: string };

export async function saveAeonProject(): Promise<AeonSaveResult> {
  const s = useProjectStore.getState();
  const { config, project, currentZoneId, currentActId } = s;
  if (!config || !project || !currentZoneId || !currentActId) return { kind: 'nothing' };
  try {
    s.setLoading(true);
    const fa = createIpcFileAccess(config.basePath);
    const plan = await buildAeonSavePlan(fa, config, project, currentZoneId, currentActId,
      { legacyAtlasMerged: s.legacyAtlasMerged });
    for (const f of plan.files) {
      await window.api.writeBinaryFile(config.basePath, f.path,
        f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
    }
    if (plan.exportError) console.warn('[save] Export step failed (non-fatal):', plan.exportError);
    useEditorStore.getState().markClean();
    s.setLoading(false);
    useToastStore.getState().addToast('Project saved', 'success');
    return { kind: 'saved' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    useProjectStore.getState().setError(message);
    useToastStore.getState().addToast('Save failed', 'error');
    return { kind: 'error', message };
  }
}
