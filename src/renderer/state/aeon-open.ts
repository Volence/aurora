// Aeon open glue — replaces useProject.loadFromPath. Core does the load
// (aeonAdapter.open via FileAccess); this commits the result to the stores
// ATOMICALLY and performs the post-open niceties the old path did (recents,
// dominant palette line, first-act selection, camera reset, toasts).

import { aeonAdapter } from '../../core/project/aeon';
import { dominantPaletteLine } from '../../core/project/aeon/load';
import { createIpcFileAccess } from './classic-file-access';
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
    useProjectStore.getState().openLoaded({
      config: aeon.config, project: aeon.project,
      collisionProfiles: aeon.collisionProfiles,
      capabilities: handle.capabilities, legacyAtlasMerged: aeon.legacyAtlasMerged,
    });
    await window.api.addRecentProject(dir, aeon.config.name);
    // First-act selection AFTER the atomic commit (parity with the old loader's
    // ordering: config→project→setCurrentAct). The session restore that runs on
    // the project-key change will re-point this if a stored session exists.
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
