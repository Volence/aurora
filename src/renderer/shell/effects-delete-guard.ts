// ASK BEFORE A DELETE THAT WILL DESTROY A FILE — the UI half of the
// deleted-scene-returns parcel (`docs/reviews/2026-09-05-deleted-scene-returns.md`).
//
// ═══ WHAT CHANGED UNDER THESE BUTTONS ═════════════════════════════════════
//
// Until 2026-09-05 `Delete scene` and `Delete preset` were, on disk, no-ops:
// the document left the session, the save wrote every OTHER document and
// removed nothing, and the deleted one was back on the next open. That was the
// defect. Fixing it means a save now UNLINKS the file — so the same button that
// was recoverable-by-doing-nothing is now the first step of destroying an
// author's work, and it deserved a question it never needed before.
//
// ═══ WHY THE QUESTION IS HERE AND NOT ON Ctrl+S ═══════════════════════════
//
// A save-time confirm was considered and rejected on the merits, not on effort.
// At save time the two answers are both bad: "Cancel" means either "abandon the
// whole save" or "save but keep the file", and the second is the reported defect
// re-offered as a feature. At delete time Cancel has one clean meaning — do not
// delete — and the author still has the context that made them press it. So the
// question goes where the intent is, and the SAVE reports what it removed
// (state/aeon-save.ts: a toast that counts and samples, plus one console line
// per removal) rather than asking again.
//
// ═══ AND WHY THE UNSAVED DOCUMENT GETS NO DIALOG ══════════════════════════
//
// A scene created in this session and never saved has no file. Deleting it
// destroys nothing a Ctrl+Z cannot return, so it must not interrupt the author
// — the same rule `shell/new-sprite-guard.ts` states for a clean sprite, and
// the same reason: the dialog is paid for only in the case that can lose work.
//
// That makes a proof of this feature need THREE rows and not one:
//   • a document WITH a file asks, and the danger arm deletes it;
//   • Cancel keeps it, in the panel and on disk;
//   • a document with NO file deletes with no dialog at all.
// `scratchpad/deleted-scene-returns-harness.mjs` carries all three, at [1c],
// [3a] and [3b]. A file with only the first has tested a dialog, not the rule.
//
// ═══ THE MACHINERY IS BORROWED, NOT BUILT ═════════════════════════════════
//
// `useConfirmStore` is the same promise-based store the tab-close, project-open,
// window-close, new-sprite and clear-library doors already ask through, rendered
// by the same `shell/ConfirmDialog.tsx` under `ui/safe-focus.ts`'s rule that a
// destructive button is never the one focused on open. A second dialog
// mechanism would be a second set of those rules to get right.
//
// ⚠ IT IS NOT IN THE COMMAND. `deleteSceneCommand` / `deletePresetCommand` still
// build an unguarded command, and the agent/MCP handler still calls them
// directly — an agent's request IS its explicit act, and there is no human at a
// modal on that path. A NEW UI call site that wants the guard must call THIS,
// exactly as a new destructive control must route through
// `ui/act-and-drop-focus.ts` rather than blurring by hand.

import { useProjectStore } from '../state/projectStore';
import { useConfirmStore } from '../state/confirmStore';
import { projectDataRoot } from '../../core/config/s4-config';
import { effectsScenePath, type EffectsSceneLibrary } from '../../core/formats/effects/scene';
import { effectsPresetPath, type EffectsPresetLibrary } from '../../core/formats/effects/preset';
import { deleteSceneCommand } from '../providers/effects-aeon';
import { deletePresetCommand } from '../providers/effects-preset';
import type { AnyCommand } from '../../core/editing/commands';

/** What the panels pass in: their own `run`, so history stays theirs. */
export type RunCommand = (command: AnyCommand | null) => void;

/**
 * The project-relative file a delete would destroy, or null when there is none.
 *
 * ⚠ THE QUESTION IS "IS IT IN THE LEDGER", NOT "IS IT ON DISK". `loadedPaths`
 * is the same list `core/project/aeon/save.ts` derives its removals from — the
 * paths this session has read or written as a document of this kind — so the
 * dialog appears exactly when the save would actually remove something. Probing
 * the filesystem instead would drift from that in both directions: it would ask
 * about a file Aurora may not remove (one it could not parse, which lands at the
 * same path an id would), and it would stay silent about one it will.
 */
export function effectsSceneFileAtRisk(id: string): string | null {
  const { project, config } = useProjectStore.getState();
  if (!project || !config) return null;
  const path = effectsScenePath(projectDataRoot(config.raw), id);
  return project.effectsScenes.loadedPaths.includes(path) ? path : null;
}

/** The preset twin of `effectsSceneFileAtRisk`, on identical terms. */
export function effectsPresetFileAtRisk(id: string): string | null {
  const { project, config } = useProjectStore.getState();
  if (!project || !config) return null;
  const path = effectsPresetPath(projectDataRoot(config.raw), id);
  return project.effectsPresets.loadedPaths.includes(path) ? path : null;
}

/**
 * The confirm request for a document that has a file, in ONE place so the scene
 * and preset wordings cannot drift apart.
 *
 * The body says three things and each is load-bearing: WHICH file, WHEN it goes
 * (the next save, not now — so the author knows Ctrl+Z is still a way back),
 * and that Aurora keeps no copy.
 */
function askToDestroy(kind: string, id: string, path: string): Promise<string> {
  return useConfirmStore.getState().ask({
    title: `Delete ${kind} "${id}"?`,
    body: `Its file ${path} is removed from disk the next time you save. Until then Ctrl+Z `
      + 'puts it back; once the save has run it is gone, and Aurora keeps no copy of it.',
    buttons: [
      { key: 'delete', label: `Delete ${kind}`, tone: 'danger' },
      { key: 'cancel', label: 'Cancel' },
    ],
  });
}

/**
 * Delete a scene, asking first when doing so will destroy a file.
 *
 * Resolves true when the scene was removed from the library, false when the
 * author cancelled (Esc, the backdrop and a superseded request all answer
 * 'cancel', so anything that is not an explicit delete is treated as one).
 */
export async function deleteSceneGuarded(
  library: EffectsSceneLibrary, id: string, run: RunCommand,
): Promise<boolean> {
  const path = effectsSceneFileAtRisk(id);
  if (path !== null && (await askToDestroy('scene', id, path)) !== 'delete') return false;
  run(deleteSceneCommand(library, id));
  return true;
}

/** The preset twin of `deleteSceneGuarded`, on identical terms. */
export async function deletePresetGuarded(
  library: EffectsPresetLibrary, id: string, run: RunCommand,
): Promise<boolean> {
  const path = effectsPresetFileAtRisk(id);
  if (path !== null && (await askToDestroy('preset', id, path)) !== 'delete') return false;
  run(deletePresetCommand(library, id));
  return true;
}
