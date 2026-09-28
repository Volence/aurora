// The paste the author is composing on the Donors page, before it is pasted:
// the clip's id, where it goes, and (only when leaving the section grid) why.
// Shared by the panel's fields and the target pane's click, so either can set
// the destination and both show the same one.
//
// ROADMAP row 235 (a): the destination belongs to ONE act (`actId`). Choosing
// another act used to keep an author's placement verbatim, so a draft placed at
// (0,0) on a one-section act still pointed at (0,0) on s2_ehz_cpz, inside
// ehz_act1, where a Paste is refused R10. Now a placement that meets an act it
// was not made on is re-placed by `placeDraftOnAct`: kept when it is free there,
// otherwise the first free section origin, otherwise none (and the page says
// why, from `placement`). On the SAME act an author's placement is never moved,
// even onto a clip: that is the author's call and aeon's R10 answers it.

import { create } from 'zustand';
import {
  placeDraftOnAct, type ClipManifestDoc, type ClipRect, type DraftPlacement,
} from '../../core/formats/donors/clip-manifest-doc';

export type PlacementMode = 'section' | 'free';

export interface DonorDraft {
  clipId: string;
  dst: { x: number; y: number } | null;
  /** 'section' is aeon's R11 default; 'free' needs `reason` (R11's in-file opt-out). */
  mode: PlacementMode;
  reason: string;
  /** True once the author typed an id, so a new marquee stops replacing it. */
  idTouched: boolean;
  /** True once the author placed the clip, so a new suggestion stops replacing it. */
  dstTouched: boolean;
  /** The act `dst` was placed or suggested on; null before any act. */
  actId: string | null;
  /** How the page last placed `dst` (null once the author places it by hand). */
  placement: DraftPlacement['kind'] | null;
  setClipId(id: string): void;
  /** The author places the clip (a click on the act, or typed) on the act `actId` (the chosen one). */
  setDst(d: { x: number; y: number } | null, actId: string | null): void;
  setMode(m: PlacementMode): void;
  setReason(r: string): void;
  /**
   * The page's defaults for the act `actId` (its document `doc`) and the
   * marquee `src`: the id unless the author typed one, and the destination
   * unless the author placed it ON THIS ACT (see the header).
   */
  suggest(p: { clipId: string | null; actId: string; doc: ClipManifestDoc; src: ClipRect }): void;
  reset(): void;
}

const INITIAL = {
  clipId: '', dst: null, mode: 'section' as PlacementMode, reason: '', idTouched: false, dstTouched: false,
  actId: null, placement: null,
};

export const useDonorDraft = create<DonorDraft>((set, get) => ({
  ...INITIAL,
  setClipId(id) { set({ clipId: id, idTouched: true }); },
  setDst(d, actId) { set({ dst: d, dstTouched: true, actId, placement: null }); },
  setMode(m) { set({ mode: m }); },
  setReason(r) { set({ reason: r }); },
  suggest({ clipId, actId, doc, src }) {
    const s = get();
    const id = s.idTouched ? s.clipId : (clipId ?? '');
    if (s.dstTouched && s.actId === actId) {
      set({ clipId: id });
      return;
    }
    const p = placeDraftOnAct(doc, doc.gridW, doc.gridH, src, s.dstTouched ? s.dst : null);
    set({ clipId: id, dst: p.dst, dstTouched: p.kind === 'kept', actId, placement: p.kind });
  },
  reset() { set({ ...INITIAL }); },
}));
