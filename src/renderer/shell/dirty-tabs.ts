// Which tabs show the emerald unsaved dot (spec §3). Pure rule over a snapshot
// of store dirtiness — the stores own dirty state; the tab strip only reads.
// Classic dirtiness belongs to the ONE loaded act (the singleton doc); aeon
// dirtiness is project-wide, so every aeon level tab dots (spec §10: aggregate
// honestly). A sprite dots its OWN sprite-doc tab, NOT the level tab it came
// from — the sprite editor is a distinct document. Every OPEN sprite document is
// considered, background ones included: a parked tab's unsaved edits are just as
// real as the checked-out one's, and a tab that silently stops dotting is how
// edits get thrown away by a close the user thought was safe.
//
// TWO RULES LIVE HERE, not one, and the split is the thing to read before
// editing either. `tabHasDirtyDot` answers "does this tab show unsaved work";
// `levelDocDirty` answers "does Ctrl+S on this tab have something to write".
// They were the same function until the aeon COMPOSER document joined the dot
// rule: it is the one open document with no tab of its own, so it dots the level
// tab it lives inside while Ctrl+S there saves the PROJECT and not the composer.
// state/project-runtime.ts registers the two level savers against the second
// one; the tab strip reads the first.
//
// AND THE SAME SNAPSHOT NOW REACHES TWO SURFACES THAT OUTLIVE A TAB (census
// B-F3). Closing a dirty level tab keeps the edit, and the close takes the tab
// and its dot away. `explorerRowDirty` puts the dot on the level's Explorer row
// (delegating to `tabHasDirtyDot`, so the row and the tab cannot disagree), and
// `hasUnsavedWork` puts a marker in the window title while anything at all is
// unsaved (derived from `unsavedKinds`, the same list the Ctrl+S toast names,
// so the title and the toast cannot disagree either).

import type { TabKind } from '../../core/shell/session';
import { parseLevelTabId } from './tabs';

export interface DirtySnapshot {
  classicOpen: boolean;
  classicRef: { zone: string; act: number } | null;
  classicDirty: boolean;
  aeonOpen: boolean;
  aeonDirty: boolean;
  /** Sprite-doc tab ids with unsaved edits — checked out or parked
   *  (spriteStore.dirtySpriteDocIds). */
  dirtySpriteDocIds: readonly string[];
  /** Canvas-doc tab ids with unsaved edits, active or background
   *  (canvasStore.dirtyCanvasDocIds). Deliberately the UNFILTERED list, not
   *  `saveableDirtyCanvasDocIds`: a dirty canvas with no file target cannot be
   *  saved by Ctrl+S but still holds real work, and a tab that stops dotting is
   *  how that work gets thrown away by a close the user thought was safe. */
  dirtyCanvasDocIds: readonly string[];
  /**
   * `artStore.open?.dirty` — the aeon composer document (New Tile / Block /
   * Chunk), which has no tab of its own and lives INSIDE a level tab's Art
   * facet.
   *
   * REQUIRED, on `OpenDirtySnapshot.unsavable`'s precedent: the two snapshots of
   * "what is dirty" disagreed about exactly this document for as long as this
   * field was missing, and a producer adding the next document store should have
   * to answer for both rather than inherit a default here.
   *
   * The UNFILTERED flag, not `composerSaveState() === 'savable'`, for the reason
   * spelled out on `dirtyCanvasDocIds` above: a composer document Save cannot
   * write still holds real work, and the dot is what says so. The perimeter
   * guards make the same distinction one layer up, where it belongs (they offer
   * Save only for what a saver reaches, and name the rest).
   */
  artDirty: boolean;
}

/**
 * IS THIS LEVEL TAB'S OWN DOCUMENT DIRTY — the narrower of the two questions
 * this module answers, and the one the SAVE ROUTING asks.
 *
 * Split out from `tabHasDirtyDot` when the composer joined the dot rule. The two
 * were the same predicate while every dot on a level tab meant "Ctrl+S here
 * writes something", and `project-runtime.ts` registered the classic-level and
 * aeon-project savers' `scope.isDirty` as a call to `tabHasDirtyDot`. The
 * composer breaks that identity: it dots the level tab it lives inside (it has no
 * tab of its own) while `saveActive` on that tab runs the PROJECT saver, which
 * does not write the composer document. Left as one predicate, a composer-only
 * dirt would have enabled Ctrl+S on the level tab, run `saveAeonProject`, written
 * nothing the user was looking at and left the dot standing: the inert-Save shape
 * the whole unsaved-work perimeter exists to remove, reintroduced through the dot.
 *
 * So: two questions, two names, one file. `tabHasDirtyDot` is "does this tab show
 * unsaved work"; this is "does Ctrl+S on this tab have something to write".
 */
export function levelDocDirty(tabId: string, s: DirtySnapshot): boolean {
  const ref = parseLevelTabId(tabId);
  if (!ref) return false;
  if (s.classicOpen) {
    const loaded =
      s.classicRef !== null && ref.zone === s.classicRef.zone && ref.act === String(s.classicRef.act);
    return loaded && s.classicDirty;
  }
  if (s.aeonOpen) return s.aeonDirty;
  return false;
}

export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind === 'sprite-doc') return s.dirtySpriteDocIds.includes(tabId);
  // 'art-doc' is the canvas tab's kind (tabs.canvasDocTab); it dots its OWN tab
  // for the same reason a sprite doc does — it is a distinct document.
  if (kind === 'art-doc') return s.dirtyCanvasDocIds.includes(tabId);
  if (kind !== 'level') return false;
  if (levelDocDirty(tabId, s)) return true;
  // THE COMPOSER DOCUMENT, which has no tab of its own. It lives in the Art
  // facet inside a level tab, so the level tab is the only place its unsaved
  // state can be shown, and it dots every aeon level tab for exactly the reason
  // `aeonDirty` does: one composer document is open at a time and it belongs to
  // the project, not to one act. Aeon-only because the facet is
  // (workspace/register-facets.ts registers `artFacet` under ['aeon'] and gives
  // classic `s1ArtFacet` instead), so the classic branch above is untouched.
  //
  // `parseLevelTabId` has already run inside levelDocDirty, but a false from it
  // means "not a level tab id" as well as "not dirty", so it is asked again
  // rather than assumed: a non-level id must not pick up a dot here.
  return s.aeonOpen && !s.classicOpen && s.artDirty && parseLevelTabId(tabId) !== null;
}

/**
 * WHAT CTRL+S SHOULD SAY WHEN IT WROTE NOTHING AND SOMETHING IS UNSAVED, or
 * null when there is nothing to say.
 *
 * THE DEFECT THIS CLOSES. `saveActive` is deliberately narrow: it writes the
 * ACTIVE tab's document and nothing else, and "a tab nothing owns (Home,
 * Project Setup) or a clean one is a silent no-op". Silent is right for a clean
 * app. It is wrong while the tab strip is showing a dot whose own tooltip reads
 * "Unsaved changes. Ctrl+S to save": two independent UX seats pressed Ctrl+S on
 * exactly that advice, got no toast, no error and no message of any kind, and
 * both filed it (packet docs/reviews/2026-09-09-save-contract.md, receipt R2).
 * Measured here: `dirtyActs` was ["ojz/act1"] before the keypress and
 * ["ojz/act1"] after.
 *
 * SO IT SPEAKS ONLY WHEN THE SILENCE WAS MISLEADING. Nothing dirty anywhere
 * gives null, and Ctrl+S on a clean app stays as quiet as it always was.
 *
 * NO NEW CONTROL, and that is deliberate: what a SAVE control should look like
 * is the owner's call and is parked in that packet. This is the existing toast
 * channel saying what the existing gesture did.
 *
 * The sentence names KINDS rather than documents. The snapshot carries ids, not
 * titles, and a message that named `doc:canvas:sky` at a person would be worse
 * than one that says a canvas document is unsaved.
 */
export function unsavedElsewhereMessage(s: DirtySnapshot): string | null {
  const kinds = unsavedKinds(s);
  if (kinds.length === 0) return null;
  // NOT "the unsaved work is elsewhere". A canvas or sprite document can be
  // dirty on THIS tab and still have no file to write to, in which case Ctrl+S
  // honestly wrote nothing and the work is right here. The sentence is true in
  // both cases.
  return `Ctrl+S wrote nothing. Unsaved work is open in: ${kinds.join(', ')}. `
    + 'Ctrl+Shift+S saves everything that has somewhere to go.';
}

/**
 * EVERY KIND OF OPEN DOCUMENT THAT HOLDS UNSAVED WORK, as the words a person
 * reads. One list for two readers: `unsavedElsewhereMessage` names them, and
 * `hasUnsavedWork` (the window title's marker) asks whether there are any. Split
 * out so the two can never disagree about whether anything is unsaved.
 */
export function unsavedKinds(s: DirtySnapshot): string[] {
  const kinds: string[] = [];
  if (s.classicOpen && s.classicDirty) kinds.push('a level');
  if (s.aeonOpen && !s.classicOpen && s.aeonDirty) kinds.push('a level');
  if (s.aeonOpen && !s.classicOpen && s.artDirty) kinds.push('the art composer');
  if (s.dirtySpriteDocIds.length > 0) {
    kinds.push(s.dirtySpriteDocIds.length === 1 ? 'a sprite document' : `${s.dirtySpriteDocIds.length} sprite documents`);
  }
  if (s.dirtyCanvasDocIds.length > 0) {
    kinds.push(s.dirtyCanvasDocIds.length === 1 ? 'a canvas document' : `${s.dirtyCanvasDocIds.length} canvas documents`);
  }
  return kinds;
}

/**
 * IS ANY OPEN DOCUMENT UNSAVED, whatever tab is showing and whether or not the
 * document still has a tab. The window title's marker (window-title.ts).
 *
 * Census B-F3: a dirty level tab closes without a prompt and KEEPS its edit (the
 * act stays resident; tab-activation/dispatch.ts), so after the close the only
 * thing on screen that said "unsaved", the tab's dot, is gone. This is the
 * question that still has an answer once it is.
 */
export function hasUnsavedWork(s: DirtySnapshot): boolean {
  return unsavedKinds(s).length > 0;
}

/**
 * DOES THIS EXPLORER ROW SHOW THE UNSAVED DOT. True only for a LEVEL row
 * (`level:<zone>:<act>`, which is also that level's tab id; tabs.ts
 * `levelDocId`) whose tab would dot. Delegates to `tabHasDirtyDot` rather than
 * restating it, so the row and the tab give the same answer about the same
 * level, including the aeon aggregate (every aeon level dots while the project
 * is dirty, spec §10).
 *
 * Only level rows, deliberately. A sprite or canvas document's close is
 * CONFIRMED and discards (dispatch.ts `requestCloseTab`), so a dirty one always
 * has its tab open and its dot showing. A level is the one document that stays
 * unsaved with no tab, which is census B-F3.
 */
export function explorerRowDirty(itemId: string, s: DirtySnapshot): boolean {
  return parseLevelTabId(itemId) !== null && tabHasDirtyDot(itemId, 'level', s);
}

/** Does any row of this Explorer group show the dot. The group header repeats it. */
export function explorerGroupDirty(items: readonly { id: string }[], s: DirtySnapshot): boolean {
  return items.some((i) => explorerRowDirty(i.id, s));
}
