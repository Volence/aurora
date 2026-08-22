import { create } from 'zustand';
import type { OpenEngine } from './open-project';

export interface OverlayOptions {
  showObjects: boolean;
  showRings: boolean;
  showTileGrid: boolean;
  showBlockGrid: boolean;
  showChunkGrid: boolean;
  showCollision: boolean;
  showCollisionAngles: boolean;
  showCollisionPathB: boolean;
  showBgPlane: boolean;
  /** The player-start marker. Classic-only so far — aeon has no spawn point in
   *  its level model — which is what OVERLAY_KEYS_BY_ENGINE below is for. */
  showStart: boolean;
  /** The per-8x8-tile VDP priority lens (classic-only): marks tiles whose
   *  pattern word carries bit 15 — they render ABOVE sprites in game. */
  showPriority: boolean;
  /** Play the S1 animations (classic-only), BOTH halves on one toggle/clock:
   *  the animated level art (GHZ waterfall/flowers, MZ lava/magma/torch, SBZ
   *  smoke at their real AnimateLevelGfx rates) and the curated object
   *  previews (rings spin on the synced channel, badniks play their spawn/
   *  locomotion anims — s1-object-anim.ts). Overlay-only playback — never
   *  touches doc.tiles (audit §2.3) nor the object list. */
  playAnimatedArt: boolean;
}

/**
 * Which overlays each engine actually renders.
 *
 * The overlay set is shared state now that classic's viewport reads it, but the
 * two engines do not draw the same things: classic has a spawn marker and aeon
 * does not; aeon has rings, sections and a BG-plane overlay classic has no
 * concept of. Listing them per engine keeps a key one engine needs from
 * becoming dead chrome in the other's View menu (parent §4).
 *
 * Declared here rather than on CapabilityManifest — unlike facetTools, whose
 * vocabulary lives in core, OverlayOptions is a renderer type, so a manifest
 * field would carry loose strings. It joins the manifest when the shared
 * overlay bar lands and classic's OptionBar stops declaring its own.
 */
export const OVERLAY_KEYS_BY_ENGINE: Record<OpenEngine, readonly (keyof OverlayOptions)[]> = {
  s1: ['showObjects', 'showStart', 'showCollision', 'showCollisionAngles', 'showPriority', 'playAnimatedArt'],
  aeon: [
    'showObjects', 'showRings', 'showTileGrid', 'showBlockGrid', 'showChunkGrid',
    'showCollision', 'showCollisionAngles', 'showCollisionPathB', 'showBgPlane',
  ],
};

interface ViewState {
  vpX: number;
  vpY: number;
  zoom: number;
  overlays: OverlayOptions;

  pan: (dx: number, dy: number) => void;
  setZoom: (zoom: number, centerX?: number, centerY?: number) => void;
  setPosition: (x: number, y: number) => void;
  /** Restore a snapshotted viewport (position + zoom) in one set — used by the
   *  per-tab viewport restore on aeon act switch. */
  setViewport: (x: number, y: number, zoom: number) => void;
  toggleOverlay: (key: keyof OverlayOptions) => void;
  setOverlay: (key: keyof OverlayOptions, value: boolean) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  vpX: 0,
  vpY: 0,
  zoom: 1,

  overlays: {
    showObjects: true,
    showRings: true,
    showTileGrid: false,
    showBlockGrid: true,
    showChunkGrid: false,
    showCollision: false,
    showCollisionAngles: false,
    showCollisionPathB: false,
    showBgPlane: false,
    // On by default, matching the local default classic's viewport carried
    // before the overlays became shared state.
    showStart: true,
    // A lens, not ambient chrome: off until asked for, like the collision lens.
    showPriority: false,
    // Playback is asked for, never ambient: OFF by default like the lenses.
    playAnimatedArt: false,
  },

  pan: (dx, dy) => set((state) => ({
    vpX: Math.max(0, state.vpX - dx / state.zoom),
    vpY: Math.max(0, state.vpY - dy / state.zoom),
  })),

  setZoom: (zoom, centerX, centerY) => set((state) => {
    const newZoom = Math.max(0.125, Math.min(8, zoom));
    if (centerX !== undefined && centerY !== undefined) {
      const worldX = state.vpX + centerX / state.zoom;
      const worldY = state.vpY + centerY / state.zoom;
      return {
        zoom: newZoom,
        vpX: Math.max(0, worldX - centerX / newZoom),
        vpY: Math.max(0, worldY - centerY / newZoom),
      };
    }
    return { zoom: newZoom };
  }),

  setPosition: (x, y) => set({ vpX: Math.max(0, x), vpY: Math.max(0, y) }),

  setViewport: (x, y, zoom) => set({
    vpX: Math.max(0, x),
    vpY: Math.max(0, y),
    zoom: Math.max(0.125, Math.min(8, zoom)),
  }),

  toggleOverlay: (key) => set((state) => ({
    overlays: { ...state.overlays, [key]: !state.overlays[key] },
  })),

  setOverlay: (key, value) => set((state) => ({
    overlays: { ...state.overlays, [key]: value },
  })),
}));
