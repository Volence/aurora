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
