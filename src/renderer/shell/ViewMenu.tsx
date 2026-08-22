import React from 'react';
import { Menu, T, Icons } from '../components/ui';
import { useViewStore, OVERLAY_KEYS_BY_ENGINE, type OverlayOptions } from '../state/viewStore';
import { useOpenEngine } from '../state/open-project';

const LABELS: Record<string, string> = {
  showBlockGrid: 'Chunk grid (128px)', showChunkGrid: 'Section grid (2048px)',
  showCollision: 'Collision (path A)', showCollisionPathB: 'Collision (path B)',
  showCollisionAngles: 'Collision angles', showStart: 'Player start',
  showPriority: 'Priority (above sprites)',
  // One toggle plays BOTH animated halves: level-art families AND the curated
  // object previews (rings spin, badniks walk) — they share one clock.
  playAnimatedArt: 'Play animations',
};
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
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `${T.s1} ${T.s2}`, fontSize: T.tSm, color: T.textBase, cursor: 'pointer' }}>
          <input type="checkbox" checked={overlays[key]} onChange={() => toggle(key)} />
          {pretty(key)}
        </label>
      ))}
    </Menu>
  );
}
