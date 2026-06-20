import React from 'react';
import { Menu, T, Icons } from '../components/ui';
import { useViewStore, type OverlayOptions } from '../state/viewStore';

const LABELS: Record<string, string> = {
  showBlockGrid: 'Chunk grid (128px)', showChunkGrid: 'Section grid (2048px)',
  showCollision: 'Collision (path A)', showCollisionPathB: 'Collision (path B)',
  showCollisionAngles: 'Collision angles',
};
function pretty(key: string) {
  return LABELS[key] ?? key.replace('show', '').replace(/([A-Z])/g, ' $1').trim();
}

export default function ViewMenu() {
  const overlays = useViewStore((s) => s.overlays);
  const toggle = useViewStore((s) => s.toggleOverlay);
  return (
    <Menu label={<><Icons.IconView size={14} /> View <Icons.IconChevron size={12} /></>}>
      {(Object.keys(overlays) as (keyof OverlayOptions)[]).map((key) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `${T.s1} ${T.s2}`, fontSize: 12, color: T.textBase, cursor: 'pointer' }}>
          <input type="checkbox" checked={overlays[key]} onChange={() => toggle(key)} />
          {pretty(key)}
        </label>
      ))}
    </Menu>
  );
}
