// Ctrl+S / app-bar save routing for the shared App shell.
//
// A single global save shortcut serves three editing contexts that must NOT
// clobber each other:
//   1. Sprite mode editing an S1 object's art (reached via the Task B2 edit-art
//      handoff) — has a captured `s1ArtSource`, so Ctrl+S saves the ART back
//      through the guarded channel. Without this, guardedSave would fall to the
//      classic level save and silently no-op (no dirty level domains), losing the
//      user's pixel edits to silence.
//   2. A classic (disasm) project open (and NOT in sprite-art mode) — the classic
//      guarded level save.
//   3. Otherwise — the caller runs its default aeon project save.
//
// Extracted from App's inline handler so the branch is unit-testable with faked
// stores/savers (injectable seams, mirroring the classic stores' convention).

import { useEditorStore } from './editorStore';
import { useSpriteStore } from './spriteStore';
import { useClassicProjectStore } from './classicProjectStore';
import { saveClassicProject } from './classic-save';
import { saveSpriteArt } from '../components/sprite/export-sprite';

// The concrete savers have different return shapes (saveSpriteArt → Promise<void>,
// saveClassicProject → Promise<SaveClassicProjectResult>); routing ignores the
// result, so the seam is deliberately return-agnostic.
type Saver = () => unknown;

let saveSpriteArtImpl: Saver = saveSpriteArt;
let saveClassicImpl: Saver = saveClassicProject;

/** Substitute the savers (tests only). */
export function __setSaveRoutingForTest(over: { spriteArt?: Saver; classic?: Saver }): void {
  if (over.spriteArt) saveSpriteArtImpl = over.spriteArt;
  if (over.classic) saveClassicImpl = over.classic;
}
/** Restore the real savers (tests only). */
export function __resetSaveRoutingForTest(): void {
  saveSpriteArtImpl = saveSpriteArt;
  saveClassicImpl = saveClassicProject;
}

/**
 * Route a save to the classic/sprite-art saver when one applies. Returns true
 * when it handled the save; false when the caller should run its default (aeon)
 * project save. See the module header for the branch order + rationale.
 */
export function routeClassicSave(): boolean {
  if (useEditorStore.getState().appMode === 'sprite' && useSpriteStore.getState().s1ArtSource) {
    void saveSpriteArtImpl();
    return true;
  }
  if (useClassicProjectStore.getState().status === 'open') {
    void saveClassicImpl();
    return true;
  }
  return false;
}
