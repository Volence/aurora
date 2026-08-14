// Aeon open glue — replaces useProject.loadFromPath. Core does the load
// (aeonAdapter.open via FileAccess); this commits the result to the stores
// ATOMICALLY and performs the post-open niceties the old path did (recents,
// dominant palette line, first-act selection, camera reset, toasts).

import { aeonAdapter } from '../../core/project/aeon';
import { dominantPaletteLine } from '../../core/project/aeon/load';
import { firstEditableChunk, fitComposerZoom } from '../../core/art/chunk-pick';
import { docFromChunk } from '../../core/art/composer-buffer';
import { createIpcFileAccess } from './classic-file-access';
import { documentHistoryHub } from './history-hub';
import { useProjectStore } from './projectStore';
import { useArtStore } from './artStore';
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
    // ONE palette line for both tile strips. `selectedPaletteLine` (editorStore)
    // is what the Layout facet's ArtBrowser previews tiles under; `paletteLine`
    // (artStore) is what the Art facet's TilesetPanel previews them under AND
    // what the composer paints with. They defaulted to the act's dominant line
    // and to a hardcoded 1 respectively, so the SAME tileset rendered
    // green/orange in one column and blue in the other, two facets apart, and
    // one of the two was necessarily lying about what the art looks like.
    //
    // Not unified into one field, which is the deeper fix and a bigger one: the
    // two genuinely mean different things (a VIEW line and a PAINT line) and
    // diverge again the moment the user picks either. Agreeing at rest is what
    // was actually wrong.
    const line = dominantPaletteLine(aeon.project);
    useEditorStore.getState().setSelectedPaletteLine(line);
    useArtStore.getState().setPaletteLine(line);
    // The Art facet opens on a chunk rather than on the New Document launcher.
    // The launcher was the resting state for a project whose zone had 919 tiles,
    // a palette and 71 chunks sitting in the right rail — a facet greeting you
    // with "create something" while showing you everything it already has.
    //
    // AT PROJECT OPEN, not on facet entry, for the reason classic's equivalent
    // landed in openAct: a facet-entry heal would rewrite a deliberate choice
    // (closing the document to start a new one is a real thing to want), where
    // an open-time default overrides nothing. openDocument directly, not
    // openDocumentGuarded — nothing can be dirty one statement after the project
    // was committed, so there is no discard to confirm.
    const first = firstEditableChunk(aeon.project.chunkLibrary);
    if (first) {
      // Zoom BEFORE the open, so the facet's first paint is already the fitted
      // one. artStore's default 24 is a single-tile zoom; at it a 128px chunk is
      // 3072px across and the composer opens on its top-left corner, which for
      // the first chunk of a jungle zone is sky. See fitComposerZoom.
      useArtStore.getState().setZoom(fitComposerZoom(first.widthTiles, first.heightTiles));
      useArtStore.getState().openDocument({
        doc: docFromChunk(first), liveTileIndex: null,
        chunkId: first.id, name: first.name, dirty: false,
      });
    } else {
      // An empty library genuinely has nothing to open, and the launcher is the
      // honest screen. Clear rather than leave the PREVIOUS project's document
      // standing over this one's stores.
      useArtStore.getState().closeDocument();
    }
    useViewStore.getState().setPosition(0, 0);
    for (const n of aeon.notices) useToastStore.getState().addToast(n, 'success');
    useToastStore.getState().addToast(`Opened ${aeon.config.name}`, 'success');
    return true;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}
