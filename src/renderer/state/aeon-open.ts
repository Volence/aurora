// Aeon open glue — replaces useProject.loadFromPath. Core does the load
// (aeonAdapter.open via FileAccess); this commits the result to the stores
// ATOMICALLY and performs the post-open niceties the old path did (recents,
// dominant palette line, first-act selection, camera reset, toasts).

import { aeonAdapter } from '../../core/project/aeon';
import { dominantPaletteLine } from '../../core/project/aeon/load';
import { createIpcFileAccess } from './classic-file-access';
import { documentHistoryHub } from './history-hub';
import { useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';
import { useViewStore } from './viewStore';
import { useToastStore } from './toastStore';

export async function openAeonProject(dir: string): Promise<boolean> {
  const store = useProjectStore.getState();
  try {
    store.setLoading(true);
    const handle = await aeonAdapter.open(createIpcFileAccess(dir));
    const aeon = handle.aeon!;
    // Register in recents BEFORE the atomic commit: openLoaded flips the session
    // projectKey, and no await may sit between it and the first-act selection
    // below (see the constraint comment there). Front-loading this await is also
    // strictly safer than the old ordering — if addRecentProject throws, nothing
    // has been committed (the old path could fail with config set, project null).
    await window.api.addRecentProject(dir, aeon.config.name);
    // Every aeon open starts fresh histories: the loaded project data is
    // fresh-from-disk, so pre-open histories must never be applied to it. Covers
    // the same-dir reopen case, where session-lifecycle's key-change reset never
    // fires (different-dir switches get a second, idempotent clear from the
    // lifecycle).
    documentHistoryHub.clearAll();
    // No await may sit between openLoaded and setCurrentAct: the atomic commit
    // flips the session projectKey, and an interleaved await lets the restore
    // effect run before the default-act selection — which would then clobber the
    // restored focus (session-lifecycle.ts restore race).
    useProjectStore.getState().openLoaded({
      config: aeon.config, project: aeon.project,
      collisionProfiles: aeon.collisionProfiles,
      capabilities: handle.capabilities, legacyAtlasMerged: aeon.legacyAtlasMerged,
    });
    // First-act selection immediately after the atomic commit (parity with the
    // old loader's synchronous config→project→setCurrentAct block). The session
    // restore that runs on the project-key change will re-point this if a stored
    // session exists.
    const zone = aeon.config.zones[0];
    if (zone && zone.acts.length > 0) {
      useProjectStore.getState().setCurrentAct(zone.id, zone.acts[0].id);
    }
    useEditorStore.getState().setSelectedPaletteLine(dominantPaletteLine(aeon.project));
    useViewStore.getState().setPosition(0, 0);
    for (const n of aeon.notices) useToastStore.getState().addToast(n, 'success');
    useToastStore.getState().addToast(`Opened ${aeon.config.name}`, 'success');
    return true;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}
