// "Does the open engine have a level document to edit right now?" — the one
// answer, for both engines.
//
// This is the input to facet-chrome: a level TAB can be open with no ACT behind
// it (a read that failed, a restore whose act has not finished loading,
// `__dbg.resetLevel()`), and in that state every facet slot but the canvas is a
// control with nothing to act on.
//
// The two engines' signals are deliberately the SAME ones their own canvases
// key on, so the chrome cannot disagree with the picture:
//   - classic: `status === 'ready' && doc !== null`, which is exactly
//     ClassicComposerCanvas's `ready` and ClassicLevelViewport's own guard.
//   - aeon: `getCurrentAct(state) !== null`, which is exactly the condition
//     MapViewport falls back to its "Open a project to view sections" state on.
//
// A hook, so both subscriptions are live and a load completing re-renders the
// workspace. Both stores are read UNCONDITIONALLY — the engine branch is on the
// values, not on the hook calls, because hooks may not sit behind a condition.

import { useClassicLevelStore } from '../state/classicLevelStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import type { OpenEngine } from '../state/open-project';

export function useActLoaded(engine: OpenEngine | null): boolean {
  const classicReady = useClassicLevelStore((s) => s.status === 'ready' && s.doc !== null);
  const aeonAct = useProjectStore((s) => getCurrentAct(s) !== null);
  if (engine === 's1') return classicReady;
  if (engine === 'aeon') return aeonAct;
  return false;
}
