// WHERE THE GUIDE SHOULD BE SCROLLED TO — one number's worth of state, and the
// reason it is not in the tab id.
//
// A `?` beside a control opens the guide AT that control's paragraph. The tab
// id must stay `tool:guide:<slug>` (see shell/tabs.ts): if the anchor were part
// of it, every `?` in the app would open a SEPARATE tab for the same document,
// and the reader would collect six copies of one page while trying to find one
// paragraph.
//
// So the anchor lives here, beside the tab rather than inside it. It is set
// BEFORE the tab is opened, which matters: `requestOpenTab` may mount the pane
// synchronously, and a scroll target arriving after the mount would land one
// render late — the reader would see the top of the guide flash past.
//
// It is deliberately NOT persisted. Where the reader was last sent is not part
// of a project's session; on restart the guide opens at the top.

import { create } from 'zustand';
import { requestOpenTab } from '../shell/tab-activation';
import { guideTab } from '../shell/tabs';
import { guideBySlug } from '../components/guide/guides';

interface GuideState {
  /** The heading slug the open guide should scroll to, or null for the top. */
  anchor: string | null;
  /** Bumped on every open request, so re-opening the SAME anchor scrolls again. */
  nonce: number;
  setAnchor: (anchor: string | null) => void;
}

export const useGuideStore = create<GuideState>((set) => ({
  anchor: null,
  nonce: 0,
  setAnchor: (anchor) => set((s) => ({ anchor, nonce: s.nonce + 1 })),
}));

/**
 * Open a guide, optionally at one of its headings.
 *
 * REFUSES AN UNKNOWN SLUG rather than opening an empty tab: a `?` wired to a
 * guide that does not exist should do nothing visible here and fail in
 * `guides.test.ts`, not paint a blank page under a helpful-looking title.
 */
export function openGuide(slug: string, anchor?: string | null): void {
  const guide = guideBySlug(slug);
  if (!guide) return;
  useGuideStore.getState().setAnchor(anchor ?? null);
  void requestOpenTab(guideTab(guide.slug, guide.title));
}
