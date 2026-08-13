// Which tabs show the emerald unsaved dot (spec §3). Pure rule over a snapshot
// of store dirtiness — the stores own dirty state; the tab strip only reads.
// Classic dirtiness belongs to the ONE loaded act (the singleton doc); aeon
// dirtiness is project-wide, so every aeon level tab dots (spec §10: aggregate
// honestly). A sprite dots its OWN sprite-doc tab, NOT the level tab it came
// from — the sprite editor is a distinct document. Every OPEN sprite document is
// considered, background ones included: a parked tab's unsaved edits are just as
// real as the checked-out one's, and a tab that silently stops dotting is how
// edits get thrown away by a close the user thought was safe.

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
}

export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind === 'sprite-doc') return s.dirtySpriteDocIds.includes(tabId);
  if (kind !== 'level') return false;
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
