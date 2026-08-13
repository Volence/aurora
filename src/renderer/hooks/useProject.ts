import { useCallback } from 'react';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { openAeonProject } from '../state/aeon-open';

export function useProject() {
  // Open a directory. A single project-registry fingerprint (Task 17) routes it:
  // a classic (disasm) project → 'opened', classicProjectStore owns the view; an
  // aeon match → 'not-classic', so we hand off to the untouched aeon loader; an
  // unrecognized dir → 'error', the classic store already surfaced the notice, so
  // there is nothing more to do here.
  const openPath = useCallback(async (dir: string) => {
    const classic = useClassicProjectStore.getState();
    const outcome = await classic.openDirectory(dir);
    if (outcome === 'opened') {
      // Register in recent-projects, mirroring the aeon path (openAeonProject
      // calls addRecentProject on success). Reopening a classic recent routes
      // back through here classic-first, so it re-detects and refreshes its entry.
      const name = useClassicProjectStore.getState().label ?? dir;
      await window.api.addRecentProject(dir, name);
    } else if (outcome === 'not-classic') {
      await openAeonProject(dir);
    }
  }, []);

  const openProject = useCallback(async () => {
    const dir = await window.api.selectDirectory();
    if (!dir) return;
    await openPath(dir);
  }, [openPath]);

  return { openProject, openProjectByPath: openPath };
}
