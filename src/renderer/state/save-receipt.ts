// A SAVE THAT WROTE SOMETHING, ANNOUNCED WHERE THE PERSON WAS LOOKING.
//
// Owner card `d-38-save-surface-vocabulary`, answered `name_what_is_true`:
// "A save says so briefly on screen."
//
// ⚠ THIS IS NOT THE FIRST THING A SAVE SAYS, AND READING IT AS ONE WOULD BE
// WRONG. Every saver in the app already toasts on success — `saveAeonProject`
// ("Project saved"), `saveClassicProject` ("Saved N level(s)", which now names
// the files it wrote), `saveComposerDocument`, the sprite and canvas savers.
// What UX seat A measured on 2026-09-07 (uxa-walk.md F2) was not the absence of
// a message, it was that the only thing they could FIND was a 6 px dot: the
// toast lives in a corner on a 2.2 s dwell (`toastStore.dwellMs`) and the
// gesture that raised it, Ctrl+S, was itself a guess because a level surface
// had no Save control at all (uxb-audit.md F7).
//
// So this store is the OTHER half of the same sentence: the confirmation lands
// ON THE CONTROL the person pressed, and it lands there whichever gesture they
// used. That is the whole reason it is a store and not a `useState` inside the
// button, which is what `shell/SpriteDocHeader.tsx` has: a local flash can only
// ever fire for a CLICK, so the person who pressed Ctrl+S — the gesture the
// dirty dot's own tooltip advertises — got nothing on the control. Ctrl+S,
// Ctrl+Shift+S and the button now all arrive here.
//
// WHAT IS RECORDED IS "SOMETHING WAS WRITTEN", NOT "A SAVE RAN". The seq is
// bumped by `state/project-runtime.ts` only when a saver actually ran and none
// failed; a Ctrl+S the routing did not reach already has its own message
// (`dirty-tabs.unsavedElsewhereMessage`) and must NOT also flash "Saved!", which
// would be the app claiming a write that did not happen. That is the same class
// of defect the whole d-38 card is about.
//
// MONOTONE SEQ RATHER THAN A TIMESTAMP, so a consumer's effect fires once per
// save and can never miss two saves that land in the same millisecond. Nothing
// persists it: a receipt is about the last few seconds, not about the session.

import { create } from 'zustand';

interface SaveReceiptState {
  /**
   * How many saves have written something in this window. 0 means "none yet",
   * which is why a consumer must not flash on the initial value.
   */
  seq: number;
  /**
   * The tab whose document was saved, or null for a Save All (which is not
   * about one tab). Carried for consumers that want to scope a flash; the level
   * header deliberately does not, because a Save All that wrote this tab's
   * document is still a save this tab should acknowledge.
   */
  tabId: string | null;
  /** Record one save that wrote something. */
  note: (tabId: string | null) => void;
}

export const useSaveReceipt = create<SaveReceiptState>((set) => ({
  seq: 0,
  tabId: null,
  note: (tabId) => set((s) => ({ seq: s.seq + 1, tabId })),
}));

/** Test/reset seam: a fresh window has never saved. */
export function resetSaveReceipt(): void {
  useSaveReceipt.setState({ seq: 0, tabId: null });
}
