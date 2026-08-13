// Project-scoped runtime singletons (watch-list #4 / spec §10): the ONE
// SaveCoordinator behind Ctrl+S and the ONE DocumentHistoryHub the per-document
// undo rewiring (Stages 3–4) will hang off. The three savers reproduce the
// retired save router's semantics — fire-when-context-open, not
// fire-when-strictly-dirty — so save behavior cannot regress in this stage:
//   • sprite-art: whenever an S1 object's art is checked out (s1ArtSource set);
//     registered FIRST so pixel edits are never lost behind a level-save error.
//   • classic-level: whenever a classic project is open (its own writer skips
//     clean domains internally).
//   • aeon-project: whenever an aeon project is resident AND no classic project
//     is open — a classic open means projectStore holds a STALE aeon project
//     and must not be written.
// Honest per-surface dirtiness (for tab dots) lives in dirty-tabs.ts, not here.

import { SaveCoordinator, type SaveAllResult } from '../../core/editing/save-coordinator';
import { DocumentHistoryHub } from '../../core/editing/document-history';
import { useClassicProjectStore } from './classicProjectStore';
import { useProjectStore } from './projectStore';
import { useSpriteStore } from './spriteStore';
import { useToastStore } from './toastStore';
import { saveClassicProject } from './classic-save';
import { saveSpriteArt } from '../components/sprite/export-sprite';

export const saveCoordinator = new SaveCoordinator();
export const documentHistoryHub = new DocumentHistoryHub();

// -- Injectable savers (test seam, mirroring the retired save router's convention) --
type SaveFn = () => Promise<unknown> | unknown;
let spriteArtImpl: SaveFn = saveSpriteArt;
let classicImpl: SaveFn = saveClassicProject;
let aeonImpl: SaveFn | null = null;

export function __setRuntimeSaversForTest(over: { spriteArt?: SaveFn; classic?: SaveFn }): void {
  if (over.spriteArt) spriteArtImpl = over.spriteArt;
  if (over.classic) classicImpl = over.classic;
}
export function __resetRuntimeSaversForTest(): void {
  spriteArtImpl = saveSpriteArt;
  classicImpl = saveClassicProject;
}

/** The aeon save lives in the useProject hook; App registers it on mount. */
export function registerAeonSaver(fn: SaveFn | null): void {
  aeonImpl = fn;
}

let registered = false;

/** Idempotent (App mount, HMR, tests may all call it). */
export function ensureSaversRegistered(): void {
  if (registered) return;
  registered = true;
  saveCoordinator.register({
    id: 'sprite-art',
    isDirty: () => useSpriteStore.getState().s1ArtSource !== null,
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
      useProjectStore.getState().project !== null &&
      aeonImpl !== null,
    save: async () => { if (aeonImpl) await aeonImpl(); },
  });
}

/** Ctrl+S / app-bar Save entry point. Failures surface as toasts. */
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
