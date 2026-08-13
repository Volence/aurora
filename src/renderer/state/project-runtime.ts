// Project-scoped runtime singletons (watch-list #4 / spec §10): the ONE
// SaveCoordinator behind Ctrl+S. The ONE DocumentHistoryHub now lives in
// history-hub.ts (import-free, to break the editorStore→project-runtime cycle)
// and is re-exported below; this module still owns resetProjectRuntime's
// clearAll on project switch. The three savers reproduce the
// retired save router's semantics — fire-when-context-open, not
// fire-when-strictly-dirty — so save behavior cannot regress in this stage:
//   • sprite-art: when an S1 object's art is checked out (s1ArtSource set) AND it
//     has unsaved edits — writing back an untouched checkout would be a pointless
//     identical-bytes write + mtime churn. Registered FIRST so pixel edits are
//     never lost behind a level-save error.
//   • classic-level: whenever a classic project is open (its own writer skips
//     clean domains internally).
//   • aeon-project: whenever an aeon project is resident AND no classic project
//     is open — a classic open means projectStore holds a STALE aeon project
//     and must not be written. Statically registered like the others (its impl,
//     saveAeonProject, is a module import — no App-mount registration step).
// Honest per-surface dirtiness (for tab dots) lives in dirty-tabs.ts, not here.

import { SaveCoordinator, type SaveAllResult } from '../../core/editing/save-coordinator';
import { documentHistoryHub } from './history-hub';
import { useClassicProjectStore } from './classicProjectStore';
import { useProjectStore } from './projectStore';
import { useSpriteStore } from './spriteStore';
import { useToastStore } from './toastStore';
import { saveClassicProject } from './classic-save';
import { saveSpriteArt } from '../components/sprite/export-sprite';
import { saveAeonProject } from './aeon-save';

export const saveCoordinator = new SaveCoordinator();
// Re-exported so existing importers (project-runtime.test) keep working; the
// instance itself lives in history-hub.ts and is used by resetProjectRuntime.
export { documentHistoryHub };

// -- Injectable savers (test seam, mirroring the retired save router's convention) --
type SaveFn = () => Promise<unknown> | unknown;
let spriteArtImpl: SaveFn = saveSpriteArt;
let classicImpl: SaveFn = saveClassicProject;
let aeonImpl: SaveFn = saveAeonProject;

export function __setRuntimeSaversForTest(over: { spriteArt?: SaveFn; classic?: SaveFn; aeon?: SaveFn }): void {
  if (over.spriteArt) spriteArtImpl = over.spriteArt;
  if (over.classic) classicImpl = over.classic;
  if (over.aeon) aeonImpl = over.aeon;
}
export function __resetRuntimeSaversForTest(): void {
  spriteArtImpl = saveSpriteArt;
  classicImpl = saveClassicProject;
  aeonImpl = saveAeonProject;
}

let registered = false;

/** Idempotent (App mount, HMR, tests may all call it). */
export function ensureSaversRegistered(): void {
  if (registered) return;
  registered = true;
  saveCoordinator.register({
    id: 'sprite-art',
    // Only fire on a checkout that has actual unsaved edits — a bare checkout is
    // not dirty (identical-bytes write + mtime churn otherwise).
    isDirty: () => useSpriteStore.getState().s1ArtSource !== null && useSpriteStore.getState().unsavedEdits,
    save: async () => { await spriteArtImpl(); },
  });
  saveCoordinator.register({
    id: 'classic-level',
    isDirty: () => useClassicProjectStore.getState().status === 'open',
    save: async () => { await classicImpl(); },
  });
  saveCoordinator.register({
    id: 'aeon-project',
    isDirty: () =>
      useClassicProjectStore.getState().status !== 'open' &&
      useProjectStore.getState().project !== null,
    save: async () => { await aeonImpl(); },
  });
}

/**
 * Ctrl+S / app-bar Save entry point. Failures surface as toasts.
 * NOTE: `saved` means the saver RAN — the classic/sprite savers encode failures
 * in their return values (and toast them) rather than throwing, so `failed`
 * being empty is not proof everything persisted; do not gate destructive
 * actions on it.
 */
export async function saveAllDirty(): Promise<SaveAllResult> {
  const result = await saveCoordinator.saveAll();
  for (const f of result.failed) {
    useToastStore.getState().addToast(`Save failed (${f.id}): ${f.message}`, 'error');
  }
  return result;
}

/** Project switch/close: drop all per-document histories. */
export function resetProjectRuntime(): void {
  documentHistoryHub.clearAll();
}
