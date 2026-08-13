// Which tabs show the emerald unsaved dot (spec §3). Pure rule over a snapshot
// of store dirtiness — the stores own dirty state; the tab strip only reads.
// Classic dirtiness belongs to the ONE loaded act (the singleton doc); aeon
// dirtiness is project-wide, so every aeon level tab dots (spec §10: aggregate
// honestly). A checked-out sprite dots its OWN sprite-doc tab (the loaded doc),
// NOT the level tab it came from — the sprite editor is a distinct document.

import type { TabKind } from '../../core/shell/session';
import { parseLevelTabId } from './tabs';

export interface DirtySnapshot {
  classicOpen: boolean;
  classicRef: { zone: string; act: number } | null;
  classicDirty: boolean;
  aeonOpen: boolean;
  aeonDirty: boolean;
  /** The sprite-doc tab whose editor is currently loaded (getLoadedSpriteDocId). */
  loadedSpriteDocId: string | null;
  /** The loaded sprite has unsaved edits (spriteEditorDirty). */
  spriteDirty: boolean;
}

export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind === 'sprite-doc') return tabId === s.loadedSpriteDocId && s.spriteDirty;
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
