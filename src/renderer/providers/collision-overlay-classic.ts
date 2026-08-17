// Classic's CollisionOverlayPort — the thin adapter collision-overlay-scope.ts
// asks every collision-showing surface to supply.
//
// S1 HAS ONE COLLISION PLANE. viewStore's `showCollisionPathB` and the A/B-diff
// machinery are aeon concepts (a second, alternate collision path); the s1
// engine grants only `showCollision` and `showCollisionAngles` in
// OVERLAY_KEYS_BY_ENGINE (viewStore.ts). So `show`'s `plane` argument exists
// only to satisfy the shared port shape — the classic caller always passes
// 'a' — and `anyOn`/`hideAll` read and write `showCollision` alone.
//
// A PLAIN FUNCTION, not a hook: it makes no subscription (no rendered content
// depends on these fields — the panel that reads solidity gets it from the
// probe, not from viewStore), so there is nothing here for a hook to earn.
// `claimCollisionOverlay` calls its methods imperatively, once on mount and
// once on unmount, exactly like CollisionPalette's inline port literal — this
// is that same object lifted out so ClassicCollisionPanel.tsx's own source
// never calls `setOverlay` directly (see collision-panel.test.ts).

import { useViewStore } from '../state/viewStore';
import type { CollisionOverlayPort } from '../components/collision-overlay-scope';

export function classicCollisionOverlayPort(): CollisionOverlayPort {
  return {
    anyOn: () => useViewStore.getState().overlays.showCollision,
    show: () => useViewStore.getState().setOverlay('showCollision', true),
    hideAll: () => useViewStore.getState().setOverlay('showCollision', false),
  };
}
