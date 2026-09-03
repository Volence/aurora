import { create } from 'zustand';
import type { OpenEngine } from './open-project';
import { loadPreviewChoice, savePreviewChoice, type PreviewChoice } from '../shell/preview-pref';

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
  /** The per-16px-CELL "solid on both collision planes" lens (aeon only): a teal
   *  veil over cells that stop the player on path A AND path B. The thing the
   *  "Both planes" collision brush authors, and otherwise invisible — the
   *  collision overlay shows one plane at a time by design. Derived from the two
   *  planes, never stored; see canvas/both-planes-lens.ts. */
  showSolidBothPlanes: boolean;
  /** The per-16px-CELL LOOP CROSSOVER lens (aeon only): an amber veil over
   *  cells whose word hands the player to the other collision path, and a RED
   *  one where that mark exists on the shown plane but not the other — a
   *  crossover that will work in one direction only. It is the ONLY depiction
   *  of a field that changes no shape, colour, solidity or overlay; see
   *  canvas/crossover-lens.ts. */
  showCrossover: boolean;
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
}

// ═══ WHERE THE PARALLAX COMPOSITE WENT, AND WHY IT IS NOT AN OVERLAY KEY ═══
//
// `showCameraPreview` used to be the eleventh key of `OverlayOptions`: one
// global boolean, listed in every aeon facet's View menu, off by default. It is
// now `ViewState.parallaxPreview` — a TRI-STATE owned by the Effects facet's
// Parallax sub-tab (`providers/parallax-preview.ts` derives what draws).
//
// It could not stay here, and the reason is not tidiness:
//
//   1. AN `OverlayOptions` VALUE IS A BOOLEAN, and "on by default until the
//      author says otherwise" needs three states, not two (shell/preview-pref).
//   2. A BOOLEAN NAMED `showCameraPreview` THAT READS FALSE WHILE THE PREVIEW
//      IS ON SCREEN is a label that outlives its meaning — and everything in
//      this repo that reads the overlay record (`__dbg.overlays()`, the View
//      menu's uniform checkbox, four test literals) would have believed it.
//   3. THE DEFAULT MUST NOT LEAK INTO THE OTHER FACETS. Every key in this
//      record is offered by the View menu in Layout, Objects, Collision and
//      Art. Flipping this one's default to `true` would have shown all four a
//      ticked box for a preview nobody asked for and nothing draws there. The
//      View menu now carries the parallax composite ONLY in the Effects facet,
//      because that is the only place it means anything.
//
// The canvas, the keyboard camera-step and both switches read one derivation,
// and nothing in this file can turn the preview on.

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
    // AEON ONLY, and structurally so: it compares path A against path B, and
    // classic's viewport has one collision plane. Registered beside the
    // collision keys because it is a statement about them.
    'showSolidBothPlanes',
    // AEON ONLY for the same structural reason, and armed automatically the
    // moment the crossover brush stops being `keep`.
    'showCrossover',
    // PROMOTED for the BgAnim band preview (ROADMAP item 42), per
    // docs/reviews/2026-08-22-preview-posture-ruling.md §2 Q3. The key, the
    // toggle plumbing and the OFF-by-default posture already existed and were
    // engine-scoped exactly so this could happen without new mechanism — the
    // ruling rejected inventing a panel-open coupling for the same reason.
    'playAnimatedArt',
    // The screen frame (row G). Aeon only for now: classic's viewport is a
    // separate draw path (classic-surface) that does not read this key yet.
    'showScreenFrame',
    // ⚠ `showCameraPreview` WAS HERE and is deliberately gone — see the block
    // above `ViewState`. The View menu still offers the parallax composite, but
    // from `ViewMenu`'s own effects-facet row rather than from this list, so it
    // cannot appear in Layout / Objects / Collision / Art.
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
  /**
   * THE PARALLAX COMPOSITE — the author's CHOICE, not what is drawn.
   *
   * `null` while he has never operated the switch, which is when the default
   * gets to speak. What actually draws is
   * `providers/parallax-preview.ts#parallaxPreviewOn()`, and nothing should
   * read this field except that module and the two switches: reading it raw is
   * how "the flag is false" and "the preview is off" come apart.
   *
   * Seeded from the author's stored choice, so an explicit OFF survives a
   * restart — shell/preview-pref.ts says why this one overlay is remembered
   * when none of the others is.
   */
  parallaxPreview: PreviewChoice;

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
  /**
   * Record the author's choice about the parallax composite, and remember it.
   *
   * There is no `toggleParallaxPreview`, on purpose: a toggle would have to
   * flip the STORED value, and the stored value is `null` exactly when the
   * thing on screen disagrees with it — so `!null` would turn the preview ON
   * while it was already on. The callers flip the EFFECTIVE value and set the
   * result.
   */
  setParallaxPreview: (v: PreviewChoice) => void;
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
    // A lens: OFF until asked for — but armed automatically the moment the
    // "Both planes" brush is switched on, because that stroke writes a plane
    // the author is not looking at (editorStore setCollisionPaintBothPlanes).
    showSolidBothPlanes: false,
    // A lens: OFF until asked for — armed by `setCollisionCrossoverBrush`.
    showCrossover: false,
    // NOT a lens: occlusion-correct previews are what the game shows, so the
    // default is ON; the toggle exists to compare against the flat composite.
    occludeSprites: true,
    // Playback is asked for, never ambient: OFF by default like the lenses.
    playAnimatedArt: false,
    // A reference, asked for: OFF like the lenses.
    showScreenFrame: false,
  },
  screenFrame: { x: 0, y: 0 },
  parallaxPreview: loadPreviewChoice(),

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

  setParallaxPreview: (v) => {
    savePreviewChoice(v);
    set({ parallaxPreview: v });
  },
}));
