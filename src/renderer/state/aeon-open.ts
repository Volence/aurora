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
import { recordRecentProject } from './recents';
// The classic project store, closed HERE rather than only on the road in.
// No cycle: classicProjectStore imports the classic bridge and the classic level
// store, neither of which reaches back into the aeon loader.
import { useClassicProjectStore } from './classicProjectStore';
import { useClassicLevelStore } from './classicLevelStore';
// The cause clause and the name-some-and-count shape, both imported rather than
// worded here: core owns what a cause MEANS (bgUnresolvedCauseText) and what a
// coalesced summary looks like (notice.ts), and this toast is one reader of each.
import { bgUnresolvedCauseText } from '../../core/formats/bg-library';
import { nameSome } from '../../core/project/notice';

/**
 * A WINDOW HOLDS EXACTLY ONE PROJECT, and this is where the aeon loader keeps
 * that promise instead of assuming its caller did.
 *
 * `openEngine()` (state/open-project.ts) gives CLASSIC PRECEDENCE by design:
 * `classicProjectStore.status === 'open'` is answered before
 * `projectStore.project !== null` is read at all. So an aeon project committed
 * while a classic one is still resident is fully loaded and completely
 * invisible - the facet bar, the savers and tab activation all read
 * `openEngine()` and all of them still say 's1'.
 *
 * UX SEAT A'S F6 IS THAT STATE, observed. The seat opened aeon over an open
 * classic project, got `undefined` back (see debug-hooks.ts - the hook was
 * discarding the boolean, so `undefined` was a constant and not a signal), and
 * watched the shell stay on `Sonic 1 Disassembly (GitHub)` with the classic
 * facet pills. Nothing had failed. The project was there and masked.
 *
 * NO PRODUCTION ROAD COULD REACH IT and the fix is here anyway. Every user
 * entry point funnels through `useProject.openPath`, which calls
 * `classicProjectStore.openDirectory` FIRST, and its 'not-classic' branch does
 * `set({ ...CLOSED })` on the way to that answer - so the mask was closed as a
 * side effect of how the router happened to be ordered, by a store that is not
 * this one, on a road this function cannot see. That is a safety property held
 * by an accident of call order, which is the same bet
 * `shell/project-open-guard.ts` records losing four times. It is cheap to stop
 * betting: on the user road this is a no-op (classic is already closed one
 * statement earlier), and on every other caller it is the difference between a
 * loaded project and an invisible one.
 *
 * The classic LEVEL store goes too, exactly as `openDirectory` drops it at the
 * start of a switch: a surviving doc holds a handle into the project being left.
 */
function closeResidentClassicProject(): void {
  if (useClassicProjectStore.getState().status === 'closed') return;
  useClassicLevelStore.getState().reset();
  useClassicProjectStore.getState().reset();
}

export async function openAeonProject(dir: string): Promise<boolean> {
  const store = useProjectStore.getState();
  try {
    store.setLoading(true);
    closeResidentClassicProject();
    const handle = await aeonAdapter.open(createIpcFileAccess(dir));
    const aeon = handle.aeon!;
    // Register in recents BEFORE the atomic commit: openLoaded flips the session
    // projectKey, and no await may sit between it and the first-act selection
    // below (see the constraint comment there). Front-loading this await is also
    // strictly safer than the old ordering — if addRecentProject throws, nothing
    // has been committed (the old path could fail with config set, project null).
    await recordRecentProject(dir, aeon.config.name);
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
    // confirmArtDocumentOpen (components/art/open-document.ts) — nothing can be
    // dirty one statement after the project was committed, so there is no discard
    // to confirm, and that door is now async and would put a dialog in the middle
    // of an open.
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
    // Each notice on ITS OWN channel. This loop used to hardcode `'success'`
    // for the whole array, which was fine for the atlas-unified line and wrong
    // for every failure beside it — markUnreadable's "exists but could not be
    // read … fix it by hand and reopen" arrived green, on the 2.2s success
    // dwell, reading as confirmation that something worked. The severity now
    // rides on the notice (core/project/notice.ts) and is assigned by the
    // producer, which is the only place that knows whether a read succeeded.
    for (const n of aeon.notices) useToastStore.getState().addToast(n.message, n.severity);
    // THE ONE THING A CLEAN CHECKOUT MUST BE TOLD AT OPEN, and a `'warning'`
    // rather than a green, on toastStore's own bargain: nothing FAILED — the
    // project opened, every section is editable, the act default paints — but
    // this is a sentence to be ACTED on, and the 2.2s success dwell is not long
    // enough to read one.
    //
    // Still not part of `notices`, though it could now be routed through it
    // without arriving green. It is a fact about `project.bgLibraryUnresolved`
    // rather than about a file the loader touched, and the loader has no
    // producer site to hang it on.
    //
    // Names entries, not just a count: "3 backgrounds could not be opened" sends
    // the reader looking, where the ids are what they would have to find anyway.
    // Capped by `nameSome`, because the real number here is seventeen and a toast
    // is not a list.
    //
    // ⚠ AND EACH NAME CARRIES ITS OWN CAUSE (ABSENT-CAUSE-MISNAMED, lens sweep).
    // This used to end with one flat assertion for the whole list — "Their
    // layout/tile files are not in this checkout" — which is true of the
    // clean-clone case that motivated the toast and FALSE of every other way an
    // entry lands here: a body that is present and too short to hold a row, one
    // that would not parse, one behind a permissions failure, one whose path
    // Aurora refused. For those the sentence named a cause that is not the cause
    // and sent the author to `git status` for a file they were looking at. The
    // cause now travels on the entry (`BgUnresolvedCause`) and is rendered per
    // name, so the toast cannot over-claim for entries it is not about.
    const unresolved = aeon.project.bgLibraryUnresolved;
    if (unresolved.length > 0) {
      const named = nameSome(unresolved.map((e) => `${e.name} (${bgUnresolvedCauseText(e.cause)})`));
      useToastStore.getState().addToast(
        `${unresolved.length} background${unresolved.length === 1 ? '' : 's'} named by this ` +
        `zone's library could not be opened: ${named}. Sections that reference them show ` +
        'the act default. Editing still works, and saving will not drop their names.',
        'warning');
    }
    useToastStore.getState().addToast(`Opened ${aeon.config.name}`, 'success');
    return true;
  } catch (err) {
    store.setError(err instanceof Error ? err.message : String(err));
    return false;
  }
}
