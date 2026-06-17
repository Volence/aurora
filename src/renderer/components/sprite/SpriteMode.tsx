import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import SpriteCanvas from './SpriteCanvas';
import type { OverlayRect } from './SpriteCanvas';
import SpriteToolColumn from './SpriteToolColumn';
import FrameGrid from './FrameGrid';
import Timeline from './Timeline';
import { exportSprite, loadSpriteByName, listSprites, loadEngineCharacter } from './export-sprite';
import PaletteEditor from '../art/PaletteEditor';
import { decomposeFrame } from '../../../core/art/sprite-decompose';

const SIZE_PRESETS = [16, 24, 32, 48, 64];

export default function SpriteMode() {
  const project = useProjectStore((s) => s.project);
  const zoom = useSpriteStore((s) => s.zoom);
  const showPieces = useSpriteStore((s) => s.showPieces);
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);

  const [spriteName, setSpriteName] = useState('NewSprite');
  const [available, setAvailable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [newSize, setNewSize] = useState(32);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const buffer = frames[currentIndex];

  useEffect(() => { listSprites().then(setAvailable).catch(() => setAvailable([])); }, []);

  function fitToView() {
    const el = canvasWrapRef.current;
    if (!el) return;
    const pad = 24;
    const z = Math.floor(Math.min((el.clientWidth - pad) / buffer.width, (el.clientHeight - pad) / buffer.height));
    useSpriteStore.getState().setZoom(Math.max(1, Math.min(48, z)));
  }
  // Auto-fit when the frame dimensions change (e.g. after a load).
  useEffect(() => { fitToView(); /* eslint-disable-next-line */ }, [buffer.width, buffer.height]);

  async function handleLoad() {
    if (busy || !spriteName) return;
    setBusy(true);
    try { await loadSpriteByName(spriteName); } finally { setBusy(false); }
  }
  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try { await exportSprite(spriteName); await listSprites().then(setAvailable).catch(() => {}); } finally { setBusy(false); }
  }

  const decomp = useMemo(() => decomposeFrame({
    id: 'cur', pixels: buffer.data, width: buffer.width, height: buffer.height,
    originX: buffer.width / 2, originY: buffer.height / 2, palette: paletteLine, priority: false,
  }), [buffer, paletteLine]);

  const overlayRects: OverlayRect[] = useMemo(() => {
    if (!showPieces) return [];
    const ox = buffer.width / 2, oy = buffer.height / 2;
    return decomp.pieces.map((p) => ({ x: p.xOffset + ox, y: p.yOffset + oy, w: p.widthCells * 8, h: p.heightCells * 8 }));
  }, [showPieces, decomp, buffer]);

  if (!project) return <div style={styles.empty}>Open a project to edit sprites.</div>;

  return (
    <div style={styles.root}>
      <div style={styles.topbar}>
        <span style={styles.dim}>New</span>
        {SIZE_PRESETS.map((s) => (
          <button key={s} style={styles.sizeBtn} title={`New ${s}×${s} sprite`} onClick={() => { useSpriteStore.getState().newSprite(s, s); }}>{s}</button>
        ))}
        <input type="number" min={8} max={128} value={newSize} style={styles.sizeInput}
          onChange={(e) => setNewSize(Number(e.target.value))} title="custom size (px)" />
        <button style={styles.sizeBtn} onClick={() => useSpriteStore.getState().newSprite(newSize, newSize)}>New □</button>
        <span style={styles.sep} />
        <button style={styles.btn} onClick={fitToView}>Fit</button>
        <span style={styles.dim}>{zoom}× · {buffer.width}×{buffer.height}px</span>
        <span style={styles.sep} />
        <label style={styles.check}>
          <input type="checkbox" checked={showPieces} onChange={(e) => useSpriteStore.getState().setShowPieces(e.target.checked)} />
          Show pieces
        </label>
      </div>

      <div style={styles.body}>
        <SpriteToolColumn />
        <div ref={canvasWrapRef} style={styles.canvasWrap}>
          <div style={styles.canvasPad}>
            <SpriteCanvas overlayRects={overlayRects} />
          </div>
        </div>
        <div style={styles.rightPanel}>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Mapping</div>
            <div style={styles.stat}><span>Hardware pieces</span><b>{decomp.pieces.length}</b></div>
            <div style={styles.stat}><span>Unique tiles</span><b>{decomp.tiles.length}</b></div>
          </div>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Sprite</div>
            <input style={styles.nameInput} value={spriteName} spellCheck={false}
              onChange={(e) => setSpriteName(e.target.value)} placeholder="SpriteName" />
            {available.length > 0 && (
              <select style={styles.nameInput} value=""
                onChange={(e) => { if (e.target.value) { setSpriteName(e.target.value); } }}>
                <option value="">— load saved ({available.length}) —</option>
                {available.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <div style={styles.btnRow}>
              <button style={{ ...styles.primary, ...(busy ? styles.disabled : {}) }} disabled={busy} onClick={handleExport}>Export</button>
              <button style={{ ...styles.secondary, ...(busy ? styles.disabled : {}) }} disabled={busy} onClick={handleLoad}>Load</button>
            </div>
            <div style={styles.sectionTitle}>Load engine character</div>
            <div style={styles.btnRow}>
              {['sonic', 'tails', 'knuckles'].map((c) => (
                <button key={c} style={styles.secondary} onClick={() => loadEngineCharacter(c)}>{c[0].toUpperCase() + c.slice(1)}</button>
              ))}
            </div>
          </div>
          <PaletteEditor />
        </div>
      </div>

      <FrameGrid />
      <Timeline />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c7086' },
  topbar: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#181825', borderBottom: '1px solid #313244', flexShrink: 0 },
  dim: { fontSize: 11, color: '#9399b2' },
  sep: { width: 1, height: 18, background: '#45475a', margin: '0 4px' },
  sizeBtn: { padding: '3px 7px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  sizeInput: { width: 44, background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, fontSize: 11, padding: '2px 4px' },
  btn: { padding: '3px 10px', background: '#45475a', color: '#cdd6f4', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  check: { fontSize: 11, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvasWrap: { flex: 1, overflow: 'auto', background: '#11111b' },
  canvasPad: { display: 'inline-block', padding: 24 },
  rightPanel: { width: 240, flexShrink: 0, background: '#1e1e2e', borderLeft: '1px solid #313244', overflow: 'auto', display: 'flex', flexDirection: 'column' },
  section: { padding: '10px 12px', borderBottom: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: 6 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9399b2' },
  stat: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cdd6f4' },
  nameInput: { background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, fontSize: 12, padding: '4px 6px' },
  btnRow: { display: 'flex', gap: 6 },
  primary: { flex: 1, padding: '5px 8px', background: '#89b4fa', color: '#1e1e2e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  secondary: { flex: 1, padding: '5px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  disabled: { opacity: 0.5, cursor: 'default' },
};
