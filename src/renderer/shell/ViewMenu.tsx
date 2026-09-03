import React from 'react';
import { Menu, T, Icons } from '../components/ui';
import { useViewStore, OVERLAY_KEYS_BY_ENGINE, type OverlayOptions } from '../state/viewStore';
import { useOpenEngine } from '../state/open-project';
import { useSessionStore } from '../state/sessionStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import {
  EFFECTS_FACET, useParallaxPreviewOn, toggleParallaxPreview,
} from '../providers/parallax-preview';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../core/model/screen';

const LABELS: Record<string, string> = {
  showBlockGrid: 'Chunk grid (128px)', showChunkGrid: 'Section grid (2048px)',
  showCollision: 'Collision (path A)', showCollisionPathB: 'Collision (path B)',
  showCollisionAngles: 'Collision angles', showStart: 'Player start',
  showPriority: 'Priority (above sprites)',
  showSolidBothPlanes: 'Solid on both paths (A + B)',
  showCrossover: 'Loop crossovers (path handoff)',
  occludeSprites: 'Sprite occlusion (game order)',
  // One toggle plays BOTH animated halves: level-art families AND the curated
  // object previews (rings spin, badniks walk) — they share one clock.
  playAnimatedArt: 'Play animations',
  // Row G: the size the label states is core/model/screen.ts's, which mirrors
  // aeon's SCREEN_WIDTH/HEIGHT — not typed here.
  showScreenFrame: `Screen frame (${SCREEN_WIDTH}x${SCREEN_HEIGHT})`,
};

/**
 * The parallax composite's label. Says what it DOES, not what it is: "camera
 * preview" alone reads as a second view, which is the thing the owner rejected.
 *
 * It is not in `LABELS` because it is not an overlay key any more — see
 * `PARALLAX_ROW` below.
 */
export const PARALLAX_PREVIEW_LABEL = 'Compose the background in the frame (parallax)';
function pretty(key: string) {
  return LABELS[key] ?? key.replace('show', '').replace(/([A-Z])/g, ' $1').trim();
}

export default function ViewMenu() {
  const overlays = useViewStore((s) => s.overlays);
  const toggle = useViewStore((s) => s.toggleOverlay);
  const engine = useOpenEngine();
  // Only the open engine's overlays: the set is shared between the two
  // viewports, but neither draws all of it, and a checkbox that toggles
  // something this engine never renders is dead chrome. No project open =>
  // show everything rather than an empty menu.
  const keys = engine
    ? OVERLAY_KEYS_BY_ENGINE[engine]
    : (Object.keys(overlays) as (keyof OverlayOptions)[]);
  return (
    <Menu label={<><Icons.IconView size={14} /> View <Icons.IconChevron size={12} /></>}>
      {keys.map((key) => (
        <label key={key} style={ROW} >
          <input type="checkbox" checked={overlays[key]} onChange={() => toggle(key)} />
          {pretty(key)}
        </label>
      ))}
      <ParallaxPreviewRow />
    </Menu>
  );
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: `${T.s1} ${T.s2}`,
  fontSize: T.tSm, color: T.textBase, cursor: 'pointer',
};

/**
 * ═══ THE PARALLAX COMPOSITE'S ROW — IN THE EFFECTS FACET AND NOWHERE ELSE ═══
 *
 * It is not driven by `OVERLAY_KEYS_BY_ENGINE` because it is not an overlay key
 * (viewStore says why), and it is written out by hand because it is the one row
 * in this menu that is FACET-scoped rather than engine-scoped.
 *
 * ⚠ THE FILTER IS THE POINT OF EW-SHAPE-PREVIEW'S FIRST HALF. This switch is now
 * ON BY DEFAULT on Effects > Parallax. Left in the generic list, that default
 * would have painted a TICKED box in Layout, Objects, Collision and Art — four
 * facets that draw no composite, offering to turn off something they never
 * turned on. The engine filter above exists for the milder version of exactly
 * this ("a checkbox that toggles something this engine never renders is dead
 * chrome"); a facet filter is that rule at the next level down, and it is what
 * lets the parcel prove the other facets are untouched instead of asserting it.
 *
 * The row stays REACHABLE FROM ALL THREE SUB-TABS, like the chip it mirrors:
 * the author's choice is facet-wide once he makes one, and only the DEFAULT is
 * scoped to Parallax.
 */
function ParallaxPreviewRow(): React.ReactElement | null {
  const on = useParallaxPreviewOn();
  const activeId = useSessionStore((s) => s.activeId);
  const facet = useWorkspaceStore((s) => s.facetFor(activeId));
  if (facet !== EFFECTS_FACET) return null;
  return (
    <label style={ROW}>
      <input type="checkbox" checked={on} onChange={() => toggleParallaxPreview()} />
      {PARALLAX_PREVIEW_LABEL}
    </label>
  );
}
