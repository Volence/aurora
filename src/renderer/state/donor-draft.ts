// The paste the author is composing on the Donors page, before it is pasted:
// the clip's id, where it goes, and (only when leaving the section grid) why.
// Shared by the panel's fields and the target pane's click, so either can set
// the destination and both show the same one.

import { create } from 'zustand';

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
  setClipId(id: string): void;
  setDst(d: { x: number; y: number } | null, touched?: boolean): void;
  setMode(m: PlacementMode): void;
  setReason(r: string): void;
  suggest(p: { clipId: string | null; dst: { x: number; y: number } | null }): void;
  reset(): void;
}

const INITIAL = { clipId: '', dst: null, mode: 'section' as PlacementMode, reason: '', idTouched: false, dstTouched: false };

export const useDonorDraft = create<DonorDraft>((set, get) => ({
  ...INITIAL,
  setClipId(id) { set({ clipId: id, idTouched: true }); },
  setDst(d, touched = true) { set({ dst: d, dstTouched: touched }); },
  setMode(m) { set({ mode: m }); },
  setReason(r) { set({ reason: r }); },
  suggest({ clipId, dst }) {
    const s = get();
    set({
      clipId: s.idTouched ? s.clipId : (clipId ?? ''),
      dst: s.dstTouched ? s.dst : dst,
    });
  },
  reset() { set({ ...INITIAL }); },
}));
