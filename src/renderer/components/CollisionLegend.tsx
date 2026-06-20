import React from 'react';
import { useViewStore } from '../state/viewStore';
import { T } from './ui';
import {
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK, COLLISION_DIFF,
} from '../canvas/canvas-colors';

type Row = { kind: 'fill' | 'line' | 'outline'; color: string; label: string };

/** On-map key for the collision overlay colors. Shown only while a collision
 *  plane is on; adds the angle + A/B-diff rows only when those are active. */
export default function CollisionLegend() {
  const o = useViewStore((s) => s.overlays);
  if (!o.showCollision && !o.showCollisionPathB) return null;

  const rows: Row[] = [
    { kind: 'fill', color: COLLISION_FILL_ALL, label: 'Solid (all sides)' },
    { kind: 'fill', color: COLLISION_FILL_TOP, label: 'Jump-through (top)' },
    { kind: 'fill', color: COLLISION_FILL_SIDES, label: 'Wall / ceiling' },
    { kind: 'line', color: COLLISION_SURFACE_LINE, label: 'Surface' },
  ];
  if (o.showCollisionAngles) rows.push({ kind: 'line', color: COLLISION_ANGLE_TICK, label: 'Angle' });
  if (o.showCollision && o.showCollisionPathB) rows.push({ kind: 'outline', color: COLLISION_DIFF, label: 'Path A / B differ' });

  return (
    <div style={styles.box}>
      <div style={styles.title}>Collision</div>
      {rows.map((r) => (
        <div key={r.label} style={styles.row}>
          <span style={swatch(r)} />
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function swatch({ kind, color }: Row): React.CSSProperties {
  const base: React.CSSProperties = { width: 14, height: 12, flex: '0 0 auto', borderRadius: 2 };
  if (kind === 'fill') return { ...base, background: color, border: `1px solid ${T.border}` };
  if (kind === 'outline') return { ...base, border: `2px solid ${color}` };
  // line: a thick horizontal stroke centered in the swatch
  return { ...base, borderTop: `2px solid ${color}`, marginTop: 5, height: 0 };
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    position: 'absolute', top: 8, left: 8, zIndex: 6, pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px',
    background: 'rgba(10,12,18,0.82)', border: `1px solid ${T.border}`, borderRadius: T.rMd,
    fontFamily: T.fontUi, fontSize: 11, color: T.textBase,
  },
  title: { color: T.textLo, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 7 },
};
