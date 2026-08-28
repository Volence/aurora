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
  /** The per-8x8-tile VDP priority lens, BOTH engines: marks tiles whose
   *  pattern word carries bit 15 — they render ABOVE sprites in game, i.e.
   *  they will cover the player. One depiction (canvas/tile-lens.ts) drawn
   *  from two different data sides (classic composes chunk→block→quad through
   *  core/level-classic/priority-mask.ts; aeon reads the flat 8px nametable
   *  through core/model/nametable-priority.ts). */
  showPriority: boolean;
  /** Occlusion-correct object previews (classic-only): re-draw high-priority
   *  map-tile PIXELS above low-priority sprite pieces — what the VDP shows —
   *  with the hidden portion kept discoverable as a translucent violet ghost.
   *  ON by default: it is what the game renders, not a lens. The ghost rides
   *  this same toggle (it is occlusion's discoverability affordance, not a
   *  separate concept). */
  occludeSprites: boolean;
  /** Play the animations. ONE key, both engines, and what it plays differs:
   *
   *  • classic — BOTH halves on one clock: the animated level art (GHZ
   *    waterfall/flowers, MZ lava/magma/torch, SBZ smoke at their real
   *    AnimateLevelGfx rates) and the curated object previews (rings spin on
   *    the synced channel, badniks play their spawn/locomotion anims —
   *    s1-object-anim.ts).
   *  • aeon — the BgAnim bands of the BG override document, at the phase the
   *    consumer would bake (bganim-preview.ts). ONLY `timer` bands need the
   *    clock; `camera_x`/`camera_y` bands are functions of the pan and preview
   *    clocklessly inside the draw pass that already repaints on it.
   *
   *  Overlay-only playback in both: never `doc.tiles`, never the object list,
   *  never the BG override document. */
  playAnimatedArt: boolean;
  /** The 320x224 screen frame (triage 2026-08-26 row G): a game-screen-sized
   *  rectangle pinned at `screenFrame` on the map, dragged by its edge. Size
   *  comes from core/model/screen.ts (mirrors aeon's SCREEN_WIDTH/HEIGHT).
   *  A reference the author asks for, so OFF by default like the lenses. */
  showScreenFrame: boolean;
  /** Inside the screen frame, compose Plane B the way the ROM would for a
   *  camera at the frame's anchor: each band at its own factor's offset, with
   *  the vsplits selecting the vertical region from their line down.
   *
   *  The owner: "I just want it to appear how it would in game." ONE CANVAS —
   *  he rejected a second view himself ("too cumbersome with wanting to do
   *  edits and having to go back and forth"), so this repaints the frame's
   *  interior inside the map's own pass and the foreground still composites
   *  over it.
   *
   *  ⚠ IT IS NOT THE WHOLE PICTURE and the composite says so on the canvas:
   *  no curve ramps, no deform (both need a clock this pass does not have),
   *  no foreground factors, no sprites, no priority. See
   *  canvas/camera-preview.ts's absence list.
   *
   *  A lens, so OFF by default. */
  showCameraPreview: boolean;
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
  s1: ['showObjects', 'showStart', 'showCollision', 'showCollisionAngles', 'showPriority', 'occludeSprites', 'playAnimatedArt'],
  aeon: [
    'showObjects', 'showRings', 'showTileGrid', 'showBlockGrid', 'showChunkGrid',
    'showCollision', 'showCollisionAngles', 'showCollisionPathB', 'showBgPlane',
    // PROMOTED 2026-08-28. The owner, from a play session: "No way to see what
    // art on fg is priority or not. Randomly sometimes sonic just goes behind a
    // tile that I wasn't aware was prioritised." The key, the label and the
    // OFF-by-default posture already existed for classic; aeon now draws the
    // SAME violet veil through the SAME shared depiction (canvas/tile-lens.ts),
    // so this is a registration, not a second lens.
    'showPriority',
    // PROMOTED for the BgAnim band preview (ROADMAP item 42), per
    // docs/reviews/2026-08-22-preview-posture-ruling.md §2 Q3. The key, the
    // toggle plumbing and the OFF-by-default posture already existed and were
    // engine-scoped exactly so this could happen without new mechanism — the
    // ruling rejected inventing a panel-open coupling for the same reason.
    'playAnimatedArt',
    // The screen frame (row G). Aeon only for now: classic's viewport is a
    // separate draw path (classic-surface) that does not read this key yet.
    'showScreenFrame',
    // The in-frame camera composite. Aeon only, and effects-only in practice —
    // it needs a scene, so it is inert in every other aeon facet.
    'showCameraPreview',
  ],
};

interface ViewState {
  vpX: number;
  vpY: number;
  zoom: number;
  overlays: OverlayOptions;
  /** The screen frame's top-left, in WORLD px. Session-lived like the overlay
   *  toggles: it is a reference the author placed, not document state, so it
   *  does not enter the undo stack or the project file. */
  screenFrame: { x: number; y: number };

  pan: (dx: number, dy: number) => void;
  setZoom: (zoom: number, centerX?: number, centerY?: number) => void;
  setPosition: (x: number, y: number) => void;
  /** Restore a snapshotted viewport (position + zoom) in one set — used by the
   *  per-tab viewport restore on aeon act switch. */
  setViewport: (x: number, y: number, zoom: number) => void;
  toggleOverlay: (key: keyof OverlayOptions) => void;
  setOverlay: (key: keyof OverlayOptions, value: boolean) => void;
  /** Pin the screen frame at a world point (clamped to the origin, whole px). */
  setScreenFrame: (x: number, y: number) => void;
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
    // NOT a lens: occlusion-correct previews are what the game shows, so the
    // default is ON; the toggle exists to compare against the flat composite.
    occludeSprites: true,
    // Playback is asked for, never ambient: OFF by default like the lenses.
    playAnimatedArt: false,
    // A reference, asked for: OFF like the lenses.
    showScreenFrame: false,
    // A lens: OFF until asked for.
    showCameraPreview: false,
  },
  screenFrame: { x: 0, y: 0 },

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

  setScreenFrame: (x, y) => set({
    screenFrame: { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) },
  }),
}));
