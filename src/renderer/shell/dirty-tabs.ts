// Which tabs show the emerald unsaved dot (spec §3). Pure rule over a snapshot
// of store dirtiness — the stores own dirty state; the tab strip only reads.
// Stage 2 granularity matches the stores: classic dirtiness belongs to the ONE
// loaded act (the singleton doc); aeon dirtiness is project-wide, so every aeon
// level tab dots (spec §10: aggregate honestly). Per-document dots arrive with
// the per-document stores in Stages 3–4.

import type { TabKind } from '../../core/shell/session';
import { parseLevelTabId } from './tabs';

export interface DirtySnapshot {
  classicOpen: boolean;
  classicRef: { zone: string; act: number } | null;
  classicDirty: boolean;
  aeonOpen: boolean;
  aeonDirty: boolean;
  /** An S1 object's art is checked out with edits that Ctrl+S would write. */
  spriteArtPending: boolean;
}

export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind !== 'level') return false;
  const ref = parseLevelTabId(tabId);
  if (!ref) return false;
  if (s.classicOpen) {
    const loaded =
      s.classicRef !== null && ref.zone === s.classicRef.zone && ref.act === String(s.classicRef.act);
    return loaded && (s.classicDirty || s.spriteArtPending);
  }
  if (s.aeonOpen) return s.aeonDirty;
  return false;
}
