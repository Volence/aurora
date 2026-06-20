import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';
import { useViewStore } from '../state/viewStore';
import { columnSolidRun } from '../../core/collision/collision-render';
import type { CollisionProfile, Solidity } from '../../core/collision/collision-model';
import { T } from './ui';
import {
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE, COLLISION_SURFACE_LINE,
} from '../canvas/canvas-colors';

const PX = 22; // thumbnail size

function solidityFill(s: Solidity): string {
  return s === 'all' ? COLLISION_FILL_ALL : s === 'top' ? COLLISION_FILL_TOP
    : s === 'sides-bottom' ? COLLISION_FILL_SIDES : COLLISION_FILL_NONE;
}

function Thumb({ profile }: { profile: CollisionProfile }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const s = PX / 16;
    ctx.clearRect(0, 0, PX, PX);
    ctx.fillStyle = solidityFill(profile.solidity);
    for (let c = 0; c < 16; c++) {
      const run = columnSolidRun(profile.heights[c]);
      if (run) ctx.fillRect(c * s, run.y * s, s, run.h * s);
    }
    ctx.strokeStyle = COLLISION_SURFACE_LINE; ctx.lineWidth = 1;
    for (let c = 0; c < 16; c++) {
      const h = profile.heights[c]; const run = columnSolidRun(h);
      if (!run) continue;
      const y = (h >= 0 ? run.y : run.y + run.h) * s;
      ctx.beginPath(); ctx.moveTo(c * s, y); ctx.lineTo((c + 1) * s, y); ctx.stroke();
    }
  }, [profile]);
  return <canvas ref={ref} width={PX} height={PX} style={{ display: 'block' }} />;
}

export default function CollisionPalette() {
  const profiles = useProjectStore((s) => s.collisionProfiles);
  const selected = useEditorStore((s) => s.selectedCollisionProfile);
  const set = useEditorStore((s) => s.setSelectedCollisionProfile);
  const plane = useEditorStore((s) => s.collisionPaintPlane);

  function pickPlane(p: 'a' | 'b') {
    useEditorStore.getState().setCollisionPaintPlane(p);
    const v = useViewStore.getState();
    v.setOverlay('showCollision', p === 'a');        // show the plane you're editing,
    v.setOverlay('showCollisionPathB', p === 'b');   // hide the other (diff is in the View menu)
  }
  // Show the active plane when the collision tool opens — but only if no collision
  // overlay is on yet, so an A/B-diff view the user set up in the View menu survives.
  useEffect(() => {
    const ov = useViewStore.getState().overlays;
    if (!ov.showCollision && !ov.showCollisionPathB) pickPlane(plane);
  }, []);

  if (!profiles) return <div style={styles.note}>Collision tables not found — open a project with collision data.</div>;

  const indices = [];
  for (let i = 1; i < profiles.solidCount; i++) indices.push(i);

  return (
    <div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Plane</span>
        <button onClick={() => pickPlane('a')} style={{ ...styles.planeBtn, ...(plane === 'a' ? styles.planeSel : {}) }}>A</button>
        <button onClick={() => pickPlane('b')} style={{ ...styles.planeBtn, ...(plane === 'b' ? styles.planeSel : {}) }}>B</button>
      </div>
      <div style={styles.hint}>Pick a shape, then paint on the map. Paints every block with the same tiles; hold Alt to paint just one.</div>
      <div style={styles.grid}>
        <button title="Erase (air)" onClick={() => set(0)} style={{ ...styles.cell, ...(selected === 0 ? styles.sel : {}) }}>
          <span style={styles.erase}>∅</span>
        </button>
        {indices.map((i) => (
          <button key={i} title={`#${i} · ${profiles.profiles[i].solidity}`} onClick={() => set(i)}
            style={{ ...styles.cell, ...(selected === i ? styles.sel : {}) }}>
            <Thumb profile={profiles.profiles[i]} />
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hint: { fontSize: 10, color: T.textLo, padding: `0 ${T.s2} ${T.s2}` },
  note: { fontSize: 11, color: T.textLo, padding: T.s2 },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  cell: {
    width: PX + 6, height: PX + 6, padding: 2, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sel: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
  erase: { color: T.textLo, fontSize: 14 },
  planes: { display: 'flex', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: 10, color: T.textLo, marginRight: 2 },
  planeBtn: { padding: `1px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: 11, minWidth: 22 },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
};
