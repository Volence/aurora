// THE SCENE SELECTION FOLLOWS THE SECTION, AS A SUBSCRIPTION.
// (SCENE-SELECTION-SNAPS-BACK, 2026-09-12; the follow itself is cold read C2.)
//
// ═══ WHAT WAS WRONG ═══
//
// C2's follow was a `useEffect` in EffectsScenePanel keyed on
// `[activeSectionIndex, sceneRef]`. An effect runs on mount whatever its deps
// are, and the Effects sub-tabs UNMOUNT the panels they hide
// (providers/effects-sub-tabs). So an author who picked a scene the section
// does not bind, looked at Colour and came back found the form on the section's
// scene, and the next value typed landed in a document they had not picked. The
// effect's own comment said "clicking another scene in the list below is never
// undone". `harness:raster-timeline` rows 6a/6b and its row-7 stop measured it
// (docs/reviews/2026-09-12-scene-selection-snaps-back.md).
//
// ═══ WHY A SUBSCRIPTION AND NOT A SMARTER EFFECT ═══
//
// The same shape as MAP-REMOUNT-DROPS-PASTE's fix (editorStore.ts, the marquee
// clear): it fires on the change itself, on screen or off, and never on a
// mount. A "last followed" key kept outside the component and compared at the
// next mount would fix the remount, but it cannot see a trip that came back to
// where it started: pick section 3 on Colour, go back to 0, return to Parallax,
// and "picking a section picks its scene" would silently not have happened.
// Here every change of the active section's identity follows, wherever the
// author made it, and a mount is not an input at all.
//
// THE IDENTITY is `SectionIdentity` (providers/effects-aeon): project directory,
// zone, act, section index and that section's `sceneRef`. Its docblock says why
// each is there and why the project is its directory.
//
// ═══ THREE SOURCES, BECAUSE THE FIVE FACTS LIVE IN THREE PLACES ═══
//
//   projectStore       the project (and its directory), the zone, the act
//   editorStore        the active section index
//   the history hub    the section's `sceneRef`. SECTION ASSIGNMENT, and its
//                      undo, mutate the act IN PLACE, so neither store changes
//                      identity. The panel re-renders on the hub for the same
//                      reason (hooks/useHistoryVersion).
//
// Each source calls the same step; a step whose identity did not change is five
// comparisons and returns, so hover-rate editorStore traffic costs nothing.
// Setting the selection from inside a step fires the editorStore subscription
// again, which finds the identity unchanged: `last` is recorded before the set.

import { useEditorStore } from './editorStore';
import { useProjectStore, getCurrentAct } from './projectStore';
import { documentHistoryHub } from './history-hub';
import { sceneSelectionFollowStep, type SectionIdentity } from '../providers/effects-aeon';

/** The active section's identity, read from the stores as they are now. */
export function currentSectionIdentity(): SectionIdentity {
  const ps = useProjectStore.getState();
  const sectionIndex = useEditorStore.getState().activeSectionIndex;
  // The panel's own reading of "the section": the act only when a project and
  // an act id are both there, and no invented section past the act's end.
  const act = ps.project && ps.currentActId ? getCurrentAct(ps) : null;
  return {
    projectPath: ps.project?.basePath ?? null,
    zoneId: ps.currentZoneId,
    actId: ps.currentActId,
    sectionIndex,
    sceneRef: act?.sections[sectionIndex]?.sceneRef ?? null,
  };
}

let installed: (() => void) | null = null;

/**
 * Start following. Idempotent: a second call returns the first call's
 * uninstaller rather than stacking a second follower. The returned function
 * stops it (tests; the app never does).
 *
 * The first step runs at install with no previous identity, so a project that is
 * already open when this installs is an arrival and follows.
 */
export function installEffectsSceneFollow(): () => void {
  if (installed) return installed;
  let last: SectionIdentity | null = null;
  const step = (): void => {
    const next = currentSectionIdentity();
    const prev = last;
    last = next;
    const select = sceneSelectionFollowStep(
      prev, next,
      useProjectStore.getState().project?.effectsScenes ?? null,
      useEditorStore.getState().selectedEffectsSceneId);
    if (select !== null) useEditorStore.getState().setSelectedEffectsSceneId(select);
  };
  const offProject = useProjectStore.subscribe(step);
  const offEditor = useEditorStore.subscribe(step);
  const offHistory = documentHistoryHub.onChange(step);
  step();
  const uninstall = (): void => {
    offProject(); offEditor(); offHistory();
    if (installed === uninstall) installed = null;
  };
  installed = uninstall;
  return uninstall;
}
