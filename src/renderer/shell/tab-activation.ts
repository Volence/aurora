// EVERY tab open/focus flows through requestOpenTab/requestFocusTabId, so the
// three activation systems below live behind them and cannot be bypassed:
//
//   1. Classic LEVEL activation (planLevelActivation + activateLevelTarget):
//      classicLevelStore.openAct resets doc + dirty + undo history, so switching
//      away from a dirty classic act must confirm first (Save & switch / Discard
//      / Cancel). Aeon act switches are pointer moves over the resident
//      S4Project — always safe.
//
//   2. SPRITE-DOC activation (planSpriteDocActivation + activateSpriteDocTarget):
//      each sprite-doc tab owns a document, so focusing one CHECKS IT OUT and
//      parks the outgoing one — a switch discards nothing and asks nothing. The
//      only sprite path that still destroys work is CLOSING a tab, so that is
//      where the confirm now lives (confirmCloseSpriteDoc — Save / Discard /
//      Cancel).
//
//   3. CANVAS-DOC activation (planCanvasDocActivation + activateCanvasDocTarget):
//      same multi-document shape as (2), with the difference that a canvas tab
//      id is STABLE ACROSS SESSIONS — it names a file — so the first focus is
//      usually a disk read. Closing confirms through confirmCloseCanvasDoc,
//      which is what puts something behind the unsaved dot on a canvas tab.
//      A read that FAILS blocks the tab from being created, but never blocks an
//      existing tab from being focused — see requestOpenTab (R17(2)).
//
// Each planner is the pure, tested decision; the exported request*/activate*
// functions are the glue.
//
// WHERE THE CODE LIVES (R19). This file is the index; the systems above are one
// module each, under `tab-activation/`:
//
//   tab-activation/generation.ts — the activation counter all three share, and
//                                  the only state that crosses kinds
//   tab-activation/level.ts      — (1), plus the classic save seam
//   tab-activation/sprite.ts     — (2), plus its close confirm
//   tab-activation/canvas.ts     — (3), plus its close confirm
//   tab-activation/dispatch.ts   — requestOpenTab / requestFocusTabId /
//                                  requestCloseTab / requestFocusIndex, and undo-
//                                  stack disposal. It imports the three; none of
//                                  them imports another.
//
// THE RE-EXPORT LIST BELOW IS EXPLICIT, not `export *`, and that is the point of
// having an index at all. Splitting the file forced two helpers that were
// private to it — `confirmCloseSpriteDoc` and `focusCanvasForTab` — to become
// module exports so dispatch could reach them. Re-exporting everything would
// publish both, and each is half of an operation: a close confirm with no close
// behind it, a focus change with no session write behind it. The list keeps this
// module's public surface exactly what it was before the split, so the funnel
// claim in the first line stays true.

export {
  type ActivationPlan,
  planLevelActivation,
  activateLevelTarget,
  __setActivationSaveForTest,
  __resetActivationSaveForTest,
} from './tab-activation/level';

export {
  type SpriteDocPlan,
  planSpriteDocActivation,
  spriteTabCanResolveWithoutAct,
  activateSpriteDocTarget,
  getLoadedSpriteDocId,
  anySpriteDocDirty,
  closeAllSpriteDocs,
  __setSpriteModuleForTest,
} from './tab-activation/sprite';

export {
  type CanvasDocPlan,
  type CanvasLoader,
  planCanvasDocActivation,
  activateCanvasDocTarget,
  activateRestoredCanvasDocTarget,
  confirmCloseCanvasDoc,
} from './tab-activation/canvas';

export {
  requestOpenTab,
  requestFocusTabId,
  requestCloseTab,
  requestFocusIndex,
} from './tab-activation/dispatch';
