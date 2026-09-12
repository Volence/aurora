import { useCallback } from 'react';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { openAeonProject } from '../state/aeon-open';
import { confirmProjectOpen } from '../shell/project-open-guard';
import { recordRecentProject } from '../state/recents';
import { captureEditConsent } from '../state/edit-consent';

/**
 * Open a directory. A single project-registry fingerprint (Task 17) routes it:
 * a classic (disasm) project → 'opened', classicProjectStore owns the view; an
 * aeon match → 'not-classic', so we hand off to the untouched aeon loader; an
 * unrecognized dir → 'error', the classic store already surfaced the notice, so
 * there is nothing more to do here.
 *
 * Resolves `true` only when a project is now open from `dir`, `false` when the
 * open ran and failed, and `undefined` when the guard stopped it. Home's typed
 * path field clears on `true` and on nothing else
 * (HOME-PATH-FIELD-KEEPS-OLD-PATH). The guard line keeps its bare `return;`:
 * shell/__tests__/project-open-door-census.test.ts asserts that exact shape.
 *
 * A plain function, not a closure inside the hook, so a node-only suite can
 * execute it; it has no dependencies to memoize.
 */
export async function openProjectPath(dir: string): Promise<boolean | undefined> {
  // Stage-3 deferred gap #1: opening a project used to reset classic/aeon/sprite
  // stores unconditionally, silently discarding unsaved work. The ask→save→
  // re-snapshot flow lives in project-open-guard.ts (confirmProjectOpen) so it's
  // unit-testable without a React hook / jsdom. This function is just the glue.
  if (!(await confirmProjectOpen())) return;
  // THE CONSENT TOKEN (state/edit-consent.ts), taken the moment the guard's
  // answer is in hand and handed to BOTH primitives, so an edit that lands on
  // the project being left anywhere in the load below (the classic bridge's
  // reads, the aeon loader's, the recents IPC) cancels the commit instead of
  // being thrown away by it. Nothing sits between the guard's `return true` and
  // this line but the await's own resumption: the microtasks that drain there
  // are the ones the guard's answer itself triggered (a dialog click, or its
  // save's last IPC reply), and no edit hangs off those.
  const consent = captureEditConsent();
  const classic = useClassicProjectStore.getState();
  const outcome = await classic.openDirectory(dir, consent);
  if (outcome === 'opened') {
    // Register in recent-projects, mirroring the aeon path (openAeonProject
    // calls addRecentProject on success). Reopening a classic recent routes
    // back through here classic-first, so it re-detects and refreshes its entry.
    const name = useClassicProjectStore.getState().label ?? dir;
    await recordRecentProject(dir, name);
    return true;
  } else if (outcome === 'not-classic') {
    return openAeonProject(dir, consent);
  }
  return false;
}

export function useProject() {
  const openProject = useCallback(async () => {
    const dir = await window.api.selectDirectory();
    if (!dir) return;
    await openProjectPath(dir);
  }, []);

  return { openProject, openProjectByPath: openProjectPath };
}
