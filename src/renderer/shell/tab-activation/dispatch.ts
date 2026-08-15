// THE FUNNEL. Every tab open/focus/close from the tab strip flows through the
// four exports here, which is what makes the three activation guards (level,
// sprite, canvas) impossible to bypass.
//
// The dependency direction is the point of the split: this module imports the
// three kind modules, and none of them imports another. A rule that spans two
// kinds — "a promoted level tab must clear the canvas focus", "a sprite close
// confirm runs before neighbour promotion" — lives here, in the one place that
// knows about all three, rather than being half-stated in two of them.
//
// Tab close is also where per-document undo stacks are DISPOSED (spec §4.1): a
// closed document's stack is unreachable, and keeping it would both leak and let
// a reopened tab inherit the history of a document the user already threw away.

import { useSessionStore } from '../../state/sessionStore';
import { closeSpriteDoc } from '../../state/spriteStore';
import { closeCanvasDoc, clearCanvasFocus } from '../../state/canvasStore';
import { documentHistoryHub } from '../../state/history-hub';
import {
  parseLevelTabId, isSpriteDocTabId, isCanvasDocTabId, zoneArtDocId,
} from '../tabs';
import { HOME_TAB, type TabDescriptor } from '../../../core/shell/session';
import { activateLevelTarget } from './level';
import { activateSpriteDocTarget, confirmCloseSpriteDoc } from './sprite';
import { confirmCloseCanvasDoc, focusCanvasForTab } from './canvas';

/**
 * Open (or focus) a tab, running the level/sprite-doc/canvas activation guard
 * first. The canvas step runs for EVERY tab kind — see focusCanvasForTab: a tab
 * that is not a canvas has to CLEAR the canvas focus.
 *
 * This is every focus change FROM THE TAB STRIP (plus ⌘K and Ctrl+1..9, which
 * route through requestFocusTabId/requestFocusIndex). It is NOT every focus
 * change in the app: two paths deliberately call `useSessionStore.open`/
 * `replace` directly and are not covered here —
 *
 *   • useActTabSync (session-lifecycle.ts) opens the tab for an act the STORES
 *     switched to, which is how the MCP/agent surface, __dbg.openAct and
 *     aeon-open move the user. An agent-driven act switch therefore focuses a
 *     level tab WITHOUT clearing the canvas focus.
 *   • The restore effect calls replace(next) and hand-dispatches activation for
 *     the ACTIVE tab only — a level, sprite or canvas id (session-lifecycle.ts).
 *     A restored canvas tab therefore reaches activateRestoredCanvasDocTarget
 *     rather than this function, which is why the silent-failure option lives
 *     there and not here.
 *
 * Neither is a hole today — the agent path only ever focuses level tabs, and the
 * restore path clears nothing because nothing is open yet — but this function is
 * not a funnel anything may rely on.
 */
export async function requestOpenTab(tab: TabDescriptor): Promise<void> {
  if (tab.kind === 'level' && !(await activateLevelTarget(tab.id))) return;
  if (tab.kind === 'sprite-doc' && !(await activateSpriteDocTarget(tab.id))) return;
  const canvas = await focusCanvasForTab(tab);
  // A SUPERSEDED read always stops here: the user has moved to another tab
  // while this one's file was being read, and opening now would drag the focus
  // back to a tab they left.
  if (canvas === 'superseded') return;
  // A FAILED read stops here only when this tab is NOT already in the strip.
  //
  // R17(2), decided in Task 12. The two situations are genuinely different:
  //
  //   • The tab does not exist yet (an Explorer click, ⌘K, the create flow).
  //     Refusing to open it is right — the toast carries the decoder's own
  //     message, and a dead tab is debris the user then has to clean up.
  //
  //   • The tab is already open (its file was deleted, moved or made
  //     unreadable since; or a restore reopened it — Task 13). Refusing FOCUS
  //     makes a tab the user can see, cannot select, and gets a fresh toast
  //     from on every click: the strip appears frozen on that tab. The pane
  //     renders an honest "could not be loaded" card instead
  //     (canvasPaneState → CanvasDocUnloaded), with Retry and the file path.
  //
  // This is the rule requestCloseTab already states for the sprite path in
  // another form: a document that will not load is a reason not to CREATE or
  // to REDRAW a tab, never a reason to make an existing one unusable.
  if (canvas === 'failed') {
    if (!useSessionStore.getState().tabs.some((t) => t.id === tab.id)) return;
    // The tab is about to be focused with no document behind it, so no canvas
    // is showing — say so. Without this the mirror keeps naming whichever canvas
    // was focused before, which is the stale-mirror state R14 spent a whole
    // section on; the pane already refuses to draw it (it compares against the
    // TAB), but leaving the two disagreeing is how the next consumer inherits
    // the bug. The clear lives here rather than in the activation itself because
    // there it would also fire for a failed load that is NOT taking focus, and
    // that one must leave the visible document alone.
    clearCanvasFocus();
  }
  useSessionStore.getState().open(tab);
}

/** Focus an already-open tab by id (tab strip click, ⌘K "go to tab"). */
export async function requestFocusTabId(id: string): Promise<void> {
  const tab = useSessionStore.getState().tabs.find((t) => t.id === id);
  if (tab) await requestOpenTab(tab);
}

/**
 * Drop the undo stacks a closed tab leaves unreachable (Task 11). A sprite doc's
 * stack goes with its document (closeSpriteDoc), and a canvas doc's likewise
 * (closeCanvasDoc). A level tab disposes only its OWN layout document: the
 * zone-art document is shared by every act tab of that zone, so it survives
 * until the last of them closes — otherwise closing act 1 would silently throw
 * away undo for art edits still visible in act 2.
 */
function disposeStacksForClosedTab(id: string): void {
  if (isSpriteDocTabId(id)) { closeSpriteDoc(id); return; }
  // Runs AFTER the close confirm in requestCloseTab, so by here the user has
  // either saved or chosen to discard. closeCanvasDoc disposes the stack itself
  // — including for a tab whose document never loaded.
  if (isCanvasDocTabId(id)) { closeCanvasDoc(id); return; }
  const level = parseLevelTabId(id);
  if (!level) return;
  documentHistoryHub.dispose(id);
  const zoneStillOpen = useSessionStore.getState().tabs.some((t) => {
    const other = parseLevelTabId(t.id);
    return other !== null && other.zone === level.zone;
  });
  if (!zoneStillOpen) documentHistoryHub.dispose(zoneArtDocId(level.zone));
}

/**
 * Close a tab through the activation guard: closing the ACTIVE tab promotes a
 * neighbor (core closeTab picks right-then-left), so the promoted level tab
 * must pass the same activation gate as a click on it — on cancel the close is
 * abandoned and the tab stays. Closing an inactive tab never changes the active
 * document and closes directly.
 *
 * The promoted-tab gate is asymmetric, deliberately:
 *
 *   LEVEL promotion CAN veto — activateLevelTarget's false means the user hit
 *   Cancel in the "unsaved changes in this act" confirm, i.e. "don't switch",
 *   and switching is exactly what closing this tab would force.
 *
 *   SPRITE-DOC promotion CANNOT veto. Its false means the neighbour's document
 *   failed to load, which says nothing about the tab being closed. Letting it
 *   veto is what wedged the strip: two restored s1 sprite tabs, neither able to
 *   check out with no act loaded, each vetoing the other's close and re-toasting
 *   on every attempt. A tab must be closable whatever state its document is in,
 *   so the promotion runs for its effect only and the close proceeds regardless.
 */
export async function requestCloseTab(id: string): Promise<void> {
  // Home is uncloseable (core closeTab no-ops on it) — bail before the
  // activation guard so a future non-TabStrip caller can't run it either.
  if (id === HOME_TAB.id) return;

  // Closing a sprite-doc tab discards its document — whether it is the checked-out
  // one or a parked background one — so every sprite-doc close is confirmed when
  // it has unsaved edits. Runs BEFORE neighbor-promotion so a promoted level tab
  // isn't blocked by a now-stale sprite prompt.
  if (isSpriteDocTabId(id) && !(await confirmCloseSpriteDoc(id))) return;
  // Same for a canvas tab, and for the same reason: the document dies with the
  // tab (disposeStacksForClosedTab below), so this is what the unsaved dot on a
  // canvas tab means. Without it the dot is a warning with nothing behind it.
  if (isCanvasDocTabId(id) && !(await confirmCloseCanvasDoc(id))) return;

  const session = useSessionStore.getState();
  if (session.activeId !== id) {
    session.close(id);
    disposeStacksForClosedTab(id);
    return;
  }
  const idx = session.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const remaining = session.tabs.filter((t) => t.id !== id);
  const promoted = remaining[idx] ?? remaining[idx - 1] ?? remaining[0];
  if (promoted && promoted.kind === 'level' && !(await activateLevelTarget(promoted.id))) return;
  // Runs BEFORE the close (so the promoted tab never renders for a frame holding
  // someone else's document) but its result is discarded — see the asymmetry
  // note above.
  if (promoted && promoted.kind === 'sprite-doc') await activateSpriteDocTarget(promoted.id);
  // The canvas side of that same promotion, and it runs for EVERY promoted kind:
  // this is a focus change (session.close moves the active tab), so a promoted
  // canvas tab must check its document out and a promoted LEVEL tab must clear
  // the canvas focus. Result discarded for the sprite reason — a neighbour whose
  // file will not load is no argument for keeping the tab the user is closing.
  if (promoted) await focusCanvasForTab(promoted);
  useSessionStore.getState().close(id);
  // AFTER the session close: disposeStacksForClosedTab reads the surviving tabs
  // to decide whether the zone-art document still has an owner.
  disposeStacksForClosedTab(id);
}

/** Ctrl+1..9 — 1-based over the whole strip (1 = Home). */
export async function requestFocusIndex(oneBased: number): Promise<void> {
  const tab = useSessionStore.getState().tabs[oneBased - 1];
  if (tab) await requestOpenTab(tab);
}
