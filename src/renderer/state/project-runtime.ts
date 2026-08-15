// Project-scoped runtime singletons (watch-list #4 / spec §10): the ONE
// SaveCoordinator behind Ctrl+S / Ctrl+Shift+S. The ONE DocumentHistoryHub now lives in
// history-hub.ts (import-free, to break the editorStore→project-runtime cycle)
// and is re-exported below; this module still owns resetProjectRuntime's
// clearAll on project switch. The savers reproduce the
// retired save router's semantics — fire-when-context-open, not
// fire-when-strictly-dirty — so save behavior cannot regress in this stage:
//   • sprite-art: for every open sprite document whose art is checked out
//     (s1ArtSource set) AND has unsaved edits — writing back an untouched checkout
//     would be a pointless identical-bytes write + mtime churn. Registered FIRST
//     so pixel edits are never lost behind a level-save error.
//   • canvas-doc: for every open canvas document that has BOTH unsaved edits and
//     a file target (saveableDirtyCanvasDocIds). Registered second, beside
//     sprite-art and ahead of the project savers, for that same reason — these
//     are hand-drawn pixels, and a level-save error must not be able to strand
//     them.
//   • classic-level: whenever a classic project is open (its own writer skips
//     clean domains internally).
//   • aeon-project: whenever an aeon project is resident AND no classic project
//     is open — a classic open means projectStore holds a STALE aeon project
//     and must not be written. Statically registered like the others (its impl,
//     saveAeonProject, is a module import — no App-mount registration step).
// Honest per-surface dirtiness (for tab dots) lives in dirty-tabs.ts, not here.
//
// Ctrl+S is NOT save-all (that is Ctrl+Shift+S): it saves the ACTIVE tab's
// document only. Each saver above declares a `scope` — which tabs it owns, when
// one of them is dirty, and how to save just that one — so the active-tab →
// save-target mapping lives HERE, once, at the coordinator seam. Components call
// saveActive()/canSaveActive() and stay ignorant of save targets (an earlier
// stage deliberately deleted the scattered per-target save routing; don't bring
// it back). The mapping:
//   • sprite-doc tab   → that ONE sprite document (saveSpriteDocArt(tabId))
//   • canvas-doc tab   → that ONE canvas document (saveCanvasDocument(tabId))
//   • classic level tab → the classic project save
//   • aeon level tab    → the aeon project save
//   • Home / tool tabs  → nothing owns them: no-op
// Per-tab dirtiness reuses the tab strip's dot rule (dirty-tabs.tabHasDirtyDot)
// rather than inventing a second definition of "dirty".

import { SaveCoordinator, type SaveAllResult } from '../../core/editing/save-coordinator';
import { documentHistoryHub } from './history-hub';
import { openEngine } from './open-project';
import { useSessionStore } from './sessionStore';
import { useSpriteStore, saveableDirtySpriteDocIds } from './spriteStore';
import { useCanvasStore, saveableDirtyCanvasDocIds } from './canvasStore';
import { useToastStore } from './toastStore';
import { saveClassicProject } from './classic-save';
import { saveAllSpriteArt, saveSpriteDocArt } from '../components/sprite/export-sprite';
import { saveCanvasDocument } from './canvas-save';
import { saveAeonProject } from './aeon-save';
import { parseLevelTabId, parseSpriteDocTabId, parseCanvasDocTabId } from '../shell/tabs';
import { tabHasDirtyDot } from '../shell/dirty-tabs';
import { currentDirtySnapshot } from '../shell/dirty-snapshot';

export const saveCoordinator = new SaveCoordinator();
// Re-exported so existing importers (project-runtime.test) keep working; the
// instance itself lives in history-hub.ts and is used by resetProjectRuntime.
export { documentHistoryHub };

// -- Injectable savers (test seam, mirroring the retired save router's convention) --
type SaveFn = () => Promise<unknown> | unknown;
type SaveDocFn = (docId: string) => Promise<unknown> | unknown;
let spriteArtImpl: SaveFn = saveAllSpriteArt;
let spriteDocImpl: SaveDocFn = saveSpriteDocArt;
let canvasDocImpl: SaveDocFn = saveCanvasDocument;
let classicImpl: SaveFn = saveClassicProject;
let aeonImpl: SaveFn = saveAeonProject;

export function __setRuntimeSaversForTest(
  over: {
    spriteArt?: SaveFn; spriteDoc?: SaveDocFn; canvasDoc?: SaveDocFn;
    classic?: SaveFn; aeon?: SaveFn;
  },
): void {
  if (over.spriteArt) spriteArtImpl = over.spriteArt;
  if (over.spriteDoc) spriteDocImpl = over.spriteDoc;
  if (over.canvasDoc) canvasDocImpl = over.canvasDoc;
  if (over.classic) classicImpl = over.classic;
  if (over.aeon) aeonImpl = over.aeon;
}
export function __resetRuntimeSaversForTest(): void {
  spriteArtImpl = saveAllSpriteArt;
  spriteDocImpl = saveSpriteDocArt;
  canvasDocImpl = saveCanvasDocument;
  classicImpl = saveClassicProject;
  aeonImpl = saveAeonProject;
}

let registered = false;

/** Idempotent (App mount, HMR, tests may all call it). */
export function ensureSaversRegistered(): void {
  if (registered) return;
  registered = true;
  saveCoordinator.register({
    id: 'sprite-art',
    // Only fire on a checkout that has actual unsaved edits — a bare checkout is
    // not dirty (identical-bytes write + mtime churn otherwise). Counts EVERY open
    // sprite document, not just the checked-out one: background sprite tabs hold
    // real edits, and saveAllSpriteArt writes them all back.
    isDirty: () => saveableDirtySpriteDocIds().length > 0,
    save: async () => { await spriteArtImpl(); },
    // Ctrl+S in a sprite tab writes THAT sprite and no other — the whole point
    // of the split. A dirty document with no in-place art target is not savable
    // work (Export is its only destination), so Save stays inert for it rather
    // than toasting a failure the user can't act on from here.
    scope: {
      owns: (tabId) => parseSpriteDocTabId(tabId) !== null,
      isDirty: (tabId) => saveableDirtySpriteDocIds().includes(tabId),
      save: async (tabId) => { await spriteDocImpl(tabId); },
    },
  });
  saveCoordinator.register({
    id: 'canvas-doc',
    // Only documents with a file target AND unsaved edits: a canvas that has
    // never been named has no destination, and a clean one is a pointless
    // identical-bytes write. `saveableDirtyCanvasDocIds` is the ONE predicate
    // all three of these read, so the saver can never disagree with itself
    // about which documents are savable.
    isDirty: () => saveableDirtyCanvasDocIds().length > 0,
    // Re-read the list on each iteration? No — the set is captured once and
    // each id saved in turn, which matches saveAllSpriteArt. A save that throws
    // aborts the rest, and the coordinator reports the failure; the untouched
    // documents keep their dirty dots.
    save: async () => { for (const id of saveableDirtyCanvasDocIds()) await canvasDocImpl(id); },
    // Ctrl+S in a canvas tab writes THAT canvas and no other. A dirty canvas
    // with no destination is not savable work, so Save stays inert for it
    // rather than failing — same rule the sprite scope above applies.
    scope: {
      owns: (tabId) => parseCanvasDocTabId(tabId) !== null,
      isDirty: (tabId) => saveableDirtyCanvasDocIds().includes(tabId),
      save: async (tabId) => { await canvasDocImpl(tabId); },
    },
  });
  saveCoordinator.register({
    id: 'classic-level',
    isDirty: () => openEngine() === 's1',
    save: async () => { await classicImpl(); },
    // Save is COARSER than undo: a classic level tab's layout doc and its zone-art
    // doc are separate undo documents but one classic project save, so the tab id
    // is all the routing needed (saveClassicProject writes the loaded act).
    scope: {
      owns: (tabId) => parseLevelTabId(tabId) !== null && openEngine() === 's1',
      isDirty: (tabId) => tabHasDirtyDot(tabId, 'level', currentDirtySnapshot()),
      save: async () => { await classicImpl(); },
    },
  });
  saveCoordinator.register({
    id: 'aeon-project',
    // openEngine() encodes the precedence this saver has always used: classic
    // wins the tie, so a classic open means the resident aeon project is STALE
    // and must not be written (it reports 's1', never 'aeon').
    isDirty: () => openEngine() === 'aeon',
    save: async () => { await aeonImpl(); },
    // Same ownership test as isDirty, narrowed to level tabs.
    scope: {
      owns: (tabId) => parseLevelTabId(tabId) !== null && openEngine() === 'aeon',
      isDirty: (tabId) => tabHasDirtyDot(tabId, 'level', currentDirtySnapshot()),
      save: async () => { await aeonImpl(); },
    },
  });
}

/**
 * Ctrl+Shift+S / "Save All" entry point. Failures surface as toasts.
 * NOTE: `saved` means the saver RAN — the classic/sprite savers encode failures
 * in their return values (and toast them) rather than throwing, so `failed`
 * being empty is not proof everything persisted; do not gate destructive
 * actions on it.
 */
export async function saveAllDirty(): Promise<SaveAllResult> {
  const result = await saveCoordinator.saveAll();
  for (const f of result.failed) {
    useToastStore.getState().addToast(`Save failed (${f.id}): ${f.message}`, 'error');
  }
  return result;
}

/** The tab whose document Ctrl+S and the app-bar Save button act on. */
function activeTabId(): string | null {
  return useSessionStore.getState().activeId || null;
}

/**
 * Ctrl+S / app-bar Save entry point: save ONLY the active tab's document.
 * A tab nothing owns (Home, Project Setup) or a clean one is a silent no-op —
 * pressing Save must never write a document the user wasn't looking at.
 * Same `saved`-is-not-proof-of-persistence caveat as saveAllDirty.
 */
export async function saveActive(tabId: string | null = activeTabId()): Promise<SaveAllResult> {
  ensureSaversRegistered(); // order-independent: a Save that predates App's mount effect still routes
  const result = await saveCoordinator.saveActive(tabId);
  for (const f of result.failed) {
    useToastStore.getState().addToast(`Save failed (${f.id}): ${f.message}`, 'error');
  }
  return result;
}

/** Would saveActive() write anything? The app-bar Save button's enabledness —
 *  so the button and its click can no longer disagree. */
export function canSaveActive(tabId: string | null = activeTabId()): boolean {
  ensureSaversRegistered(); // called from render, which can precede App's mount effect
  return saveCoordinator.canSaveActive(tabId);
}

/**
 * Project switch/close: drop all per-document histories AND every open sprite
 * and canvas document. The sprite documents have to go with them — a document
 * that outlived its project keeps an s1ArtSource pointing at the OLD project's
 * file by absolute path, so a later Ctrl+S would write across projects. A canvas
 * document is the same hazard through the same door: its `CanvasSource.dir` is
 * the old project root, and Task 11's activation reloads a canvas tab from the
 * new project anyway. Safe to blank the editor here (the concern that deferred
 * this in Task 7): session restore runs right after and re-activates the
 * restored tab, which loads its document again.
 */
export function resetProjectRuntime(): void {
  documentHistoryHub.clearAll();
  useSpriteStore.getState().closeAll();
  useCanvasStore.getState().closeAll();
}
