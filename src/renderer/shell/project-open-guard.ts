// Guard for opening a project (path/dialog/recent) while ANY unsaved work is
// resident (stage-3 notes deferred gap #1: openPath previously reset stores with
// no confirm — silent data loss). Pure decision; the glue in useProject.openPath
// asks via confirmStore and re-checks dirtiness after a chosen save.

import { useClassicLevelStore } from '../state/classicLevelStore';
import { useEditorStore } from '../state/editorStore';
import { useSpriteStore } from '../state/spriteStore';

export interface OpenDirtySnapshot {
  classicDirty: boolean;      // any classicLevelStore dirty domain
  aeonDirty: boolean;         // editorStore.dirty (aeon project-wide)
  spriteArtPending: boolean;  // spriteStore.s1ArtSource !== null
}

export type ProjectOpenPlan = { kind: 'proceed' } | { kind: 'confirm' };

export function planProjectOpen(s: OpenDirtySnapshot): ProjectOpenPlan {
  return s.classicDirty || s.aeonDirty || s.spriteArtPending
    ? { kind: 'confirm' }
    : { kind: 'proceed' };
}

/** Live snapshot helper (kept beside the planner so the two stay in lockstep). */
export function currentOpenDirtySnapshot(): OpenDirtySnapshot {
  return {
    classicDirty: Object.values(useClassicLevelStore.getState().dirty).some(Boolean),
    aeonDirty: useEditorStore.getState().dirty,
    spriteArtPending: useSpriteStore.getState().s1ArtSource !== null,
  };
}
