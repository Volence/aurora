import React, { useEffect, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';

function Thumb({ buffer, colors, size }: { buffer: PixelBuffer; colors: Color[]; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { width, height, data } = buffer;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const idx = data[y * width + x];
      if (idx === 0) ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a';
      else { const c = colors[idx]; ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff'; }
      ctx.fillRect(x, y, 1, 1);
    }
  }, [buffer, colors]);
  // contain the frame in a square cell, preserving aspect
  const scale = size / Math.max(buffer.width, buffer.height);
  return <canvas ref={ref} width={buffer.width} height={buffer.height}
    style={{ width: buffer.width * scale, height: buffer.height * scale, imageRendering: 'pixelated' }} />;
}

/**
 * Collapsible, wrapping frame grid — scales to hundreds of frames (e.g. Sonic's
 * 224) instead of one giant horizontal strip. Click to select; add/duplicate/delete.
 */
export default function FrameGrid() {
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);
  const override = useSpriteStore((s) => s.paletteOverride);
  const zone = getCurrentZone(useProjectStore.getState());
  const colors = override ?? zone?.palette.lines[paletteLine]?.colors ?? [];
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button style={styles.collapse} onClick={() => setCollapsed((c) => !c)}>{collapsed ? '▸' : '▾'}</button>
        <span style={styles.title}>Frames ({frames.length})</span>
        <span style={{ flex: 1 }} />
        <button style={styles.op} title="Add blank frame" onClick={() => useSpriteStore.getState().addFrame()}>+ Frame</button>
        <button style={styles.op} title="Duplicate current" onClick={() => useSpriteStore.getState().duplicateFrame()}>Duplicate</button>
        <button style={styles.op} title="Delete current" onClick={() => useSpriteStore.getState().deleteFrame()}>Delete</button>
      </div>
      {!collapsed && (
        <div style={styles.grid}>
          {frames.map((f, i) => (
            <button key={i} onClick={() => useSpriteStore.getState().selectFrame(i)}
              style={{ ...styles.cell, ...(i === currentIndex ? styles.cellActive : {}) }} title={`Frame ${i}`}>
              <Thumb buffer={f} colors={colors} size={36} />
              <span style={styles.num}>{i}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { background: '#0A0C12', borderTop: '1px solid #2A2F3D', display: 'flex', flexDirection: 'column', maxHeight: 180 },
  header: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid #232334' },
  collapse: { background: 'none', border: 'none', color: '#E8EAF2', cursor: 'pointer', fontSize: 12, padding: 0, width: 16 },
  title: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9399b2' },
  op: { padding: '3px 8px', background: '#2A2F3D', color: '#E8EAF2', border: '1px solid #3A4152', borderRadius: 4, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, overflowY: 'auto', alignContent: 'flex-start' },
  cell: { position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, background: '#12151E', border: '1px solid #3A4152', borderRadius: 4, cursor: 'pointer', lineHeight: 0 },
  cellActive: { borderColor: '#34D399', boxShadow: '0 0 0 1px #34D399' },
  num: { position: 'absolute', bottom: 0, right: 1, fontSize: 8, color: '#E8EAF2', lineHeight: 1, textShadow: '0 0 2px #000' },
};
