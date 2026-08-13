import { useCallback } from 'react';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { openAeonProject } from '../state/aeon-open';
import { planProjectOpen, currentOpenDirtySnapshot } from '../shell/project-open-guard';
import { useConfirmStore } from '../state/confirmStore';
import { saveAllDirty } from '../state/project-runtime';

export function useProject() {
  // Open a directory. A single project-registry fingerprint (Task 17) routes it:
  // a classic (disasm) project → 'opened', classicProjectStore owns the view; an
  // aeon match → 'not-classic', so we hand off to the untouched aeon loader; an
  // unrecognized dir → 'error', the classic store already surfaced the notice, so
  // there is nothing more to do here.
  const openPath = useCallback(async (dir: string) => {
    // Stage-3 deferred gap #1: opening a project used to reset classic/aeon/sprite
    // stores unconditionally, silently discarding unsaved work. Guard first.
    if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') {
      const answer = await useConfirmStore.getState().ask({
        title: 'Unsaved changes',
        body:
          'Opening a project discards unsaved edits and undo history in the current one. ' +
          'A checked-out sprite keeps the open blocked after saving — close it from the Sprite editor first.',
        buttons: [
          { key: 'save', label: 'Save & open', tone: 'primary' },
          { key: 'discard', label: 'Discard & open', tone: 'danger' },
          { key: 'cancel', label: 'Cancel' },
        ],
      });
      if (answer === 'save') {
        await saveAllDirty();
        // saveAllDirty's `saved` only means the savers RAN (stage-3 notes item 7):
        // the honest gate is to re-snapshot — if anything is STILL dirty, a saver
        // failed (it already toasted) or a sprite checkout is still open (the
        // sprite saver never clears s1ArtSource); abort instead of destroying the
        // edits, at the cost of a sprite checkout permanently blocking "Save &
        // open" until it's closed from the Sprite editor (known rough edge).
        if (planProjectOpen(currentOpenDirtySnapshot()).kind === 'confirm') return;
      } else if (answer !== 'discard') {
        return; // cancel / dismissed
      }
    }
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
