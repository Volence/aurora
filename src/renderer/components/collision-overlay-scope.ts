// The collision overlay is scoped to the facet that turns it on.
//
// ---------------------------------------------------------------------------
// THE LEAK
// ---------------------------------------------------------------------------
// CollisionPalette's mount effect turned the collision overlay ON — reasonably,
// so the collision tool shows you the plane you are about to paint — and nothing
// ever turned it off. So visiting Collision once left the whole session
// collision-shaded: the terrain came up shaded and the floating COLLISION legend
// came up drawn over the top-left of the map on the Palette facet, on Layout, on
// Objects, on Rings, with no View toggle ever touched. It also covers map
// content, so it is not merely surplus.
//
// The rule this restores: AN IMPLICIT ENABLE IS IMPLICITLY REVERTED. What the
// facet switched on for you, leaving the facet switches back off; what YOU
// switched on in the View menu, the facet never touches — mount sees it already
// on and declines to take ownership, so leaving cannot clear it. That is the
// same shape agent-handler's `prevShowBg` save/restore already uses for the
// one other implicit overlay write in the app.
//
// A PORT-TAKING FUNCTION rather than an effect body: the renderer suite is
// node-only and CollisionPalette is .tsx, so a decision written inline is a
// decision nothing can test — and the interesting cases here (declining
// ownership, the art variant, the cleanup) are all decisions.

export interface CollisionOverlayPort {
  /** True when EITHER collision plane overlay is currently on. */
  anyOn(): boolean;
  /** Show the given plane and hide the other (the A/B diff is a View-menu job). */
  show(plane: 'a' | 'b'): void;
  /** Hide both collision plane overlays. */
  hideAll(): void;
}

/**
 * Claim the collision overlay for a mounting collision palette.
 *
 * @param variant  'map' paints the level; 'art' paints a chunk document in the
 *                 composer, whose canvas does not read viewStore.overlays at
 *                 all — so switching a MAP overlay on from there was a change
 *                 you could not see from the screen that made it, and it
 *                 persisted to every map facet afterwards.
 * @returns the cleanup to run on unmount, or null when this mount is not the
 *          owner and must leave the view exactly as it found it.
 */
export function claimCollisionOverlay(
  port: CollisionOverlayPort,
  plane: 'a' | 'b',
  variant: 'map' | 'art',
): (() => void) | null {
  if (variant !== 'map') return null;
  // Already on: the user set up this view (an A/B diff, say) and it survives
  // both the entry and the exit. Taking ownership here is what would make
  // leaving destroy a view the facet did not create.
  if (port.anyOn()) return null;
  port.show(plane);
  return () => port.hideAll();
}
