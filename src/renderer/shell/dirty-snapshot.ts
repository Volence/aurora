// The store-reading half of dirty-tabs.ts: dirty-tabs owns the RULE (pure,
// snapshot in → verdict out), this owns the snapshot. Two readers need it and
// must not disagree — the tab strip's emerald dot and the app bar's Save button
// (whose old predicate knew only about level dirtiness while its click saved
// sprites too), so there is exactly one definition of "dirty" for both.
//
// `currentDirtySnapshot()` is the imperative read (savers, guards);
// `useDirtySnapshot()` is the same read plus the subscriptions a React surface
// needs to re-render when any of those flags move.

import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { useSpriteStore, dirtySpriteDocIds } from '../state/spriteStore';
import { useCanvasStore, dirtyCanvasDocIds } from '../state/canvasStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import type { DirtySnapshot } from './dirty-tabs';

export function currentDirtySnapshot(): DirtySnapshot {
  const classic = useClassicLevelStore.getState();
  return {
    classicOpen: useClassicProjectStore.getState().status === 'open',
    // classicRef = the LOADED act (store's ref), not a tree selection — dirty
    // dots must track the doc that owns the edits.
    classicRef: classic.ref ? { zone: classic.ref.zone, act: classic.ref.act } : null,
    classicDirty: Object.values(classic.dirty).some(Boolean),
    aeonOpen: useProjectStore.getState().project !== null,
    aeonDirty: useEditorStore.getState().dirty,
    dirtySpriteDocIds: dirtySpriteDocIds(),
    dirtyCanvasDocIds: dirtyCanvasDocIds(),
  };
}

/** The snapshot, wired for re-render. */
export function useDirtySnapshot(): DirtySnapshot {
  useClassicProjectStore((s) => s.status);
  useClassicLevelStore((s) => s.ref);
  useClassicLevelStore((s) => s.dirty);
  useProjectStore((s) => s.project);
  useEditorStore((s) => s.dirty);
  // Subscribe to the sprite pieces so the verdict re-renders as it changes:
  // unsavedEdits IS that verdict for the checked-out document, `docs` carries it
  // for the parked ones, and activeDocId decides which is which — a save/export
  // clears the flag without touching any history, so all three must be
  // subscribed. The history clock + s1ArtSource are belt-and-braces re-render
  // triggers for edits landing / art checkout-release.
  useSpriteStore((s) => s.unsavedEdits);
  useSpriteStore((s) => s.docs);
  useSpriteStore((s) => s.activeDocId);
  useHistoryVersion();
  useSpriteStore((s) => s.s1ArtSource);
  // One subscription, not three: canvasStore keeps EVERY document (active or
  // not) in `docs`, and `unsavedEdits` lives inside those entries, so `docs` is
  // the only reference that changes when a canvas dirties or is saved (every
  // mutation rebuilds the Map). The sprite store needs three because it hoists
  // its checked-out document's fields onto the store root.
  useCanvasStore((s) => s.docs);
  return currentDirtySnapshot();
}
