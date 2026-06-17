import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import type { SpriteTool } from '../../state/spriteStore';
import SpriteCanvas from './SpriteCanvas';
import type { OverlayRect } from './SpriteCanvas';
import Timeline from './Timeline';
import { exportSprite, loadSpriteByName, listSprites, loadEngineCharacter } from './export-sprite';
import PaletteEditor from '../art/PaletteEditor';
import { decomposeFrame } from '../../../core/art/sprite-decompose';
import type { PixelBuffer } from '../../../core/art/pixel-ops';
import type { Color } from '../../../core/model/s4-types';

const TOOLS: { id: SpriteTool; label: string }[] = [
  { id: 'pencil', label: 'Pencil' },
  { id: 'fill', label: 'Fill' },
  { id: 'eraser', label: 'Eraser' },
];

/** Small thumbnail of a frame buffer using the active palette line. */
function FrameThumb({ buffer, colors }: { buffer: PixelBuffer; colors: Color[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { width, height, data } = buffer;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = data[y * width + x];
        if (idx === 0) { ctx.fillStyle = (x + y) % 2 === 0 ? '#2a2a3a' : '#33334a'; }
        else { const c = colors[idx]; ctx.fillStyle = c ? `rgb(${c.r},${c.g},${c.b})` : '#ff00ff'; }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [buffer, colors]);
  return <canvas ref={ref} width={buffer.width} height={buffer.height} style={{ width: 40, height: 40, imageRendering: 'pixelated' }} />;
}

/**
 * Sprite mode shell (chunk 2): tool strip + pixel canvas with live piece-outline
 * overlay, a mapping inspector (piece/tile counts from the Plan 2 decomposer),
 * the shared PaletteEditor, and a frame strip. Animation + export come next.
 */
export default function SpriteMode() {
  const project = useProjectStore((s) => s.project);
  const tool = useSpriteStore((s) => s.tool);
  const zoom = useSpriteStore((s) => s.zoom);
  const showPieces = useSpriteStore((s) => s.showPieces);
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);
  const [spriteName, setSpriteName] = useState('NewSprite');
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Refresh the list of saved sprites when entering sprite mode.
  useEffect(() => { listSprites().then(setAvailable).catch(() => setAvailable([])); }, []);

  async function handleLoad() {
    if (busy) return;
    setBusy(true);
    try { await loadSpriteByName(spriteName); } finally { setBusy(false); }
  }
  // Serialize export (the index.json read-modify-write isn't transactional).
  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      await exportSprite(spriteName);
      await listSprites().then(setAvailable).catch(() => {});
    } finally { setBusy(false); }
  }

  const override = useSpriteStore((s) => s.paletteOverride);
  const buffer = frames[currentIndex];
  const zone = getCurrentZone(useProjectStore.getState());
  const colors = override ?? zone?.palette.lines[paletteLine]?.colors ?? [];

  // Live auto-decomposition of the current frame (Plan 2).
  const decomp = useMemo(() => {
    const originX = buffer.width / 2;
    const originY = buffer.height / 2;
    return decomposeFrame({
      id: 'cur', pixels: buffer.data, width: buffer.width, height: buffer.height,
      originX, originY, palette: paletteLine, priority: false,
    });
  }, [buffer, paletteLine]);

  const overlayRects: OverlayRect[] = useMemo(() => {
    if (!showPieces) return [];
    const ox = buffer.width / 2, oy = buffer.height / 2;
    return decomp.pieces.map((p) => ({
      x: p.xOffset + ox, y: p.yOffset + oy, w: p.widthCells * 8, h: p.heightCells * 8,
    }));
  }, [showPieces, decomp, buffer]);

  if (!project) {
    return <div style={styles.empty}>Open a project to edit sprites.</div>;
  }

  return (
    <div style={styles.root}>
      <div style={styles.toolStrip}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => useSpriteStore.getState().setTool(t.id)}
            style={{ ...styles.toolBtn, ...(tool === t.id ? styles.toolActive : {}) }}
          >
            {t.label}
          </button>
        ))}
        <span style={styles.sep} />
        <label style={styles.zoomLabel}>Zoom {zoom}×</label>
        <input type="range" min={2} max={24} value={zoom}
          onChange={(e) => useSpriteStore.getState().setZoom(Number(e.target.value))} />
        <span style={styles.sep} />
        <label style={styles.checkLabel}>
          <input type="checkbox" checked={showPieces}
            onChange={(e) => useSpriteStore.getState().setShowPieces(e.target.checked)} />
          Show pieces
        </label>
      </div>

      <div style={styles.body}>
        <div style={styles.canvasWrap}>
          <SpriteCanvas overlayRects={overlayRects} />
        </div>
        <div style={styles.rightPanel}>
          <div style={styles.inspector}>
            <div style={styles.inspectorTitle}>Mapping</div>
            <div style={styles.stat}><span>Hardware pieces</span><b>{decomp.pieces.length}</b></div>
            <div style={styles.stat}><span>Unique tiles</span><b>{decomp.tiles.length}</b></div>
            <div style={styles.hint}>Pieces ≤ 4×4 cells, auto-packed. Toggle “Show pieces” to overlay.</div>
          </div>
          <div style={styles.exportBox}>
            <div style={styles.inspectorTitle}>Sprite</div>
            <input
              style={styles.nameInput}
              value={spriteName}
              onChange={(e) => setSpriteName(e.target.value)}
              placeholder="SpriteName"
              spellCheck={false}
            />
            {available.length > 0 && (
              <select style={styles.nameInput} value="" onChange={(e) => { if (e.target.value) setSpriteName(e.target.value); }}>
                <option value="">— saved sprites ({available.length}) —</option>
                {available.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <div style={styles.btnRow}>
              <button style={{ ...styles.exportBtn, ...(busy ? styles.btnDisabled : {}) }} onClick={handleExport} disabled={busy}>Export</button>
              <button style={{ ...styles.loadBtn, ...(busy ? styles.btnDisabled : {}) }} onClick={handleLoad} disabled={busy}>Load</button>
            </div>
            <div style={styles.hint}>Export writes mappings / art / anims + manifest to data/sprites/{spriteName || '<name>'}/. Load reconstructs editable frames + timeline from there.</div>
            <div style={styles.inspectorTitle}>Load engine character</div>
            <div style={styles.btnRow}>
              {['sonic', 'tails', 'knuckles'].map((c) => (
                <button key={c} style={styles.loadBtn} onClick={() => loadEngineCharacter(c)} title={`Load ${c} frames (experimental, no timeline)`}>
                  {c[0].toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
            <div style={styles.hint}>Experimental: loads DPLC character frames (poses) for viewing/editing. No timeline yet; colors use the active palette line.</div>
          </div>
          <PaletteEditor />
        </div>
      </div>

      <div style={styles.frameStrip}>
        {frames.map((f, i) => (
          <button key={i} onClick={() => useSpriteStore.getState().selectFrame(i)}
            style={{ ...styles.frameBtn, ...(i === currentIndex ? styles.frameActive : {}) }}
            title={`Frame ${i}`}>
            <FrameThumb buffer={f} colors={colors} />
            <span style={styles.frameNum}>{i}</span>
          </button>
        ))}
        <div style={styles.frameActions}>
          <button style={styles.frameOp} title="Add blank frame" onClick={() => useSpriteStore.getState().addFrame()}>+ Frame</button>
          <button style={styles.frameOp} title="Duplicate current frame" onClick={() => useSpriteStore.getState().duplicateFrame()}>Duplicate</button>
          <button style={styles.frameOp} title="Delete current frame" onClick={() => useSpriteStore.getState().deleteFrame()}>Delete</button>
        </div>
      </div>

      <Timeline />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c7086' },
  toolStrip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    background: '#181825', borderBottom: '1px solid #313244',
  },
  toolBtn: {
    padding: '4px 10px', background: '#313244', color: '#cdd6f4',
    border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  toolActive: { background: '#89b4fa', color: '#1e1e2e', borderColor: '#89b4fa' },
  sep: { width: 1, height: 20, background: '#45475a', margin: '0 6px' },
  zoomLabel: { fontSize: 12, color: '#a6adc8' },
  checkLabel: { fontSize: 12, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvasWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'auto', background: '#11111b',
  },
  rightPanel: {
    width: 240, flexShrink: 0, background: '#1e1e2e',
    borderLeft: '1px solid #313244', overflow: 'auto', display: 'flex', flexDirection: 'column',
  },
  inspector: { padding: '10px 12px', borderBottom: '1px solid #313244' },
  exportBox: { padding: '10px 12px', borderBottom: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: 6 },
  nameInput: { background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, fontSize: 12, padding: '4px 6px' },
  btnRow: { display: 'flex', gap: 6 },
  exportBtn: { flex: 1, padding: '5px 10px', background: '#89b4fa', color: '#1e1e2e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  loadBtn: { flex: 1, padding: '5px 10px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  btnDisabled: { opacity: 0.5, cursor: 'default' },
  inspectorTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9399b2', marginBottom: 8 },
  stat: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cdd6f4', padding: '2px 0' },
  hint: { fontSize: 11, color: '#6c7086', marginTop: 8, lineHeight: 1.4 },
  frameStrip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    background: '#181825', borderTop: '1px solid #313244', overflowX: 'auto', minHeight: 60,
  },
  frameBtn: {
    position: 'relative', padding: 2, background: '#313244', border: '1px solid #45475a',
    borderRadius: 4, cursor: 'pointer', lineHeight: 0,
  },
  frameActive: { borderColor: '#89b4fa', boxShadow: '0 0 0 1px #89b4fa' },
  frameNum: { position: 'absolute', bottom: 1, right: 2, fontSize: 9, color: '#cdd6f4', lineHeight: 1, textShadow: '0 0 2px #000' },
  frameActions: { display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 6 },
  frameOp: {
    padding: '3px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap',
  },
};
