import React, { useEffect, useRef } from 'react';
import { useViewStore } from '../state/viewStore';
import { T } from './ui';
import {
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING, COLLISION_DIFF,
} from '../canvas/canvas-colors';
import {
  angleMark, drawAngleMark, MIN_CELL_PX_FOR_MARK,
  type MarkDrawCtx,
} from '../../core/collision/collision-angle-mark';
import type { CollisionProfile } from '../../core/collision/collision-model';

type Row =
  | { kind: 'fill' | 'line' | 'outline'; color: string; label: string }
  | { kind: 'mark'; label: string };

/**
 * The profile the legend's angle swatch depicts: a rising floor at $20 (45°).
 * A SLOPE, not flat ground, because the whole point of the swatch is to show
 * that the bar lies along the surface and the barb leaves it on the open side —
 * and on flat ground those are just a horizontal line and a vertical one, which
 * is indistinguishable from the old symmetric tick this replaced.
 */
const LEGEND_PROFILE: CollisionProfile = {
  heights: new Int8Array(Array.from({ length: 16 }, (_, c) => c + 1)),
  angle: 0x20,
  hasAngle: true,
  solidity: 'all',
};

/**
 * The legend's angle swatch DRAWS THE REAL MARK with the real drawing code.
 *
 * It used to be a CSS `borderTop` — a flat horizontal rule, which is to say a
 * picture of the symmetric tick this parcel removed. A legend that depicts the
 * overlay in a different medium is free to drift from it, and that drift is the
 * exact defect class the parcel is about (the picker and the map were drawing
 * one angle byte two ways). Routing it through `drawAngleMark` means the key
 * cannot disagree with the map: there is one function and it is this one.
 */
function AngleSwatch() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(SWATCH * dpr);
    cv.height = Math.round(SWATCH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SWATCH, SWATCH);
    const mark = angleMark(LEGEND_PROFILE);
    if (!mark) return;
    drawAngleMark(ctx as unknown as MarkDrawCtx, 0, 0, SWATCH, mark, {
      color: COLLISION_ANGLE_TICK,
      casing: COLLISION_ANGLE_CASING,
      coreWidth: 1.25,
      casingWidth: 3,
    });
  }, []);
  return <canvas ref={ref} style={{ width: SWATCH, height: SWATCH, flex: '0 0 auto' }} />;
}

const SWATCH = 16;

/** On-map key for the collision overlay colors. Shown only while a collision
 *  plane is on; adds the angle + A/B-diff rows only when those are active. */
export default function CollisionLegend() {
  const o = useViewStore((s) => s.overlays);
  const zoom = useViewStore((s) => s.zoom);
  if (!o.showCollision && !o.showCollisionPathB) return null;

  // The angle mark is suppressed below MIN_CELL_PX_FOR_MARK screen px per 16px
  // cell (see collision-angle-mark.ts). WITHOUT THIS LINE that suppression is a
  // trap: an author switches "Collision angles" on while zoomed out, nothing
  // appears, and the honest conclusion is that the toggle is broken. The legend
  // is the only surface that can say "it is on, and it is waiting for zoom".
  const marksHidden = 16 * zoom < MIN_CELL_PX_FOR_MARK;

  const rows: Row[] = [
    { kind: 'fill', color: COLLISION_FILL_ALL, label: 'Solid (all sides)' },
    { kind: 'fill', color: COLLISION_FILL_TOP, label: 'Jump-through (top)' },
    { kind: 'fill', color: COLLISION_FILL_SIDES, label: 'Wall / ceiling' },
    { kind: 'line', color: COLLISION_SURFACE_LINE, label: 'Surface' },
  ];
  if (o.showCollisionAngles) {
    rows.push({
      kind: 'mark',
      label: marksHidden ? 'Angle — zoom in to show' : 'Angle · barb = open side',
    });
  }
  if (o.showCollision && o.showCollisionPathB) rows.push({ kind: 'outline', color: COLLISION_DIFF, label: 'Path A / B differ' });

  return (
    <div style={styles.box}>
      <div style={styles.title}>Collision</div>
      {rows.map((r) => (
        <div key={r.label} style={styles.row}>
          {r.kind === 'mark' ? <AngleSwatch /> : <span style={swatch(r)} />}
          <span style={r.kind === 'mark' && marksHidden ? styles.dim : undefined}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function swatch({ kind, color }: Exclude<Row, { kind: 'mark' }>): React.CSSProperties {
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
    fontFamily: T.fontUi, fontSize: T.tXs, color: T.textBase,
  },
  title: { color: T.textLo, fontSize: T.t2xs, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  row: { display: 'flex', alignItems: 'center', gap: 7 },
  dim: { color: T.textLo },
};
