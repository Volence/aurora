import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import SpriteCanvas from './SpriteCanvas';
import type { OverlayRect } from './SpriteCanvas';
import SpriteToolColumn from './SpriteToolColumn';
import FrameGrid from './FrameGrid';
import Timeline from './Timeline';
import { exportSprite, loadSpriteByName, listSprites, loadEngineCharacter, openSprite, scanProjectForSprites, openDiscoveredSet, loadSpriteAnimations } from './export-sprite';
import type { ProjectScan } from './export-sprite';
import PaletteEditor from '../art/PaletteEditor';
import { decomposeFrame } from '../../../core/art/sprite-decompose';
import type { SpriteFormatId } from '../../../core/formats/sprite-format-adapter';

const SIZE_PRESETS = [16, 24, 32, 48, 64];

const FORMATS: { id: SpriteFormatId; label: string }[] = [
  { id: 's4', label: 'S4 (our engine)' },
  { id: 's1', label: 'Sonic 1' },
  { id: 's2', label: 'Sonic 2' },
  { id: 's3k', label: 'Sonic 3&K / S.C.E.' },
];

export default function SpriteMode() {
  const project = useProjectStore((s) => s.project);
  const zoom = useSpriteStore((s) => s.zoom);
  const showPieces = useSpriteStore((s) => s.showPieces);
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion);

  const spriteName = useSpriteStore((s) => s.name);
  const setSpriteName = (n: string) => useSpriteStore.getState().setName(n);
  const exportDplc = useSpriteStore((s) => s.exportDplc);
  const format = useSpriteStore((s) => s.format);
  const [openAs, setOpenAs] = useState<SpriteFormatId>('s2');
  const [available, setAvailable] = useState<string[]>([]);
  const [scan, setScan] = useState<ProjectScan | null>(null);
  const [scanFilter, setScanFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSize, setNewSize] = useState(32);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const buffer = frames[currentIndex];

  useEffect(() => { listSprites().then(setAvailable).catch(() => setAvailable([])); }, []);

  function fitToView() {
    const el = canvasWrapRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return; // not laid out yet
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
  async function handleScanProject() {
    if (busy) return;
    setBusy(true);
    try { const r = await scanProjectForSprites(); if (r) { setScan(r); setScanFilter(''); } } finally { setBusy(false); }
  }

  const scanMatches = useMemo(() => {
    if (!scan) return [];
    const q = scanFilter.trim().toLowerCase();
    return q ? scan.sets.filter((s) => s.name.toLowerCase().includes(q)) : scan.sets;
  }, [scan, scanFilter]);

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
          onChange={(e) => setNewSize(Math.max(8, Math.min(128, Number(e.target.value) || 8)))} title="custom size (px)" />
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
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Open — import a sprite to edit or convert</div>
            <label style={styles.fmtRow} title="Read the opened files as this game's format. It also becomes the Save-as target, so you can convert by saving in another format.">
              <span style={styles.dim}>Read as</span>
              <select style={styles.fmtSelect} value={openAs} onChange={(e) => setOpenAs(e.target.value as SpriteFormatId)}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <button style={{ ...styles.primary, ...(busy ? styles.disabled : {}) }} disabled={busy}
              title="Pick the mapping file (.asm or .bin), then its art file (.nem/.bin), then an optional DPLC file."
              onClick={() => openSprite(openAs)}>Open sprite…</button>
            <div style={styles.hint}>Pick a mapping file (.asm or .bin), then its art file, then an optional DPLC.</div>
            <button style={{ ...styles.secondary, ...(busy ? styles.disabled : {}) }} disabled={busy}
              title="Scan a Sonic 1/2/3K (or S.C.E.) disassembly folder and list every sprite set it finds." onClick={handleScanProject}>
              Scan disassembly project…
            </button>
            <button style={{ ...styles.secondary, ...(busy ? styles.disabled : {}) }} disabled={busy}
              title="Load an animation script (.asm) for the current sprite — classic Sonic ($FF/$FE) or S4-engine (AF_*) form."
              onClick={async () => { if (busy) return; setBusy(true); try { await loadSpriteAnimations(); } finally { setBusy(false); } }}>
              Load animations…
            </button>
            {scan && (
              <div style={styles.scanPanel}>
                <div style={styles.fmtRow}>
                  <input style={styles.fmtSelect} value={scanFilter} placeholder={`Filter ${scan.sets.length} sets…`}
                    onChange={(e) => setScanFilter(e.target.value)} spellCheck={false} />
                  <button style={styles.sizeBtn} title="Close list" onClick={() => setScan(null)}>✕</button>
                </div>
                <div style={styles.scanList}>
                  {scanMatches.slice(0, 200).map((s) => (
                    <div key={s.mappings} style={styles.scanRow} title={s.mappings}>
                      <span style={styles.scanName}>{s.name}</span>
                      <span style={styles.scanBadges}>
                        <span style={styles.scanGame}>{s.game.toUpperCase()}</span>
                        {s.dplc && <span style={styles.scanTag} title="DPLC found">D</span>}
                        <span style={{ ...styles.scanTag, opacity: s.art ? 1 : 0.35 }} title={s.art ? 'art auto-paired' : 'art not found — pick on open'}>A</span>
                      </span>
                      <button style={styles.scanOpen} disabled={busy}
                        onClick={async () => { if (busy) return; setBusy(true); try { await openDiscoveredSet(scan.baseDir, s); } finally { setBusy(false); } }}>Open</button>
                    </div>
                  ))}
                  {scanMatches.length > 200 && <div style={styles.dim}>…{scanMatches.length - 200} more (filter to narrow)</div>}
                  {scanMatches.length === 0 && <div style={styles.dim}>no matches</div>}
                </div>
              </div>
            )}
            <div style={styles.divider} />
            <div style={styles.dim}>Reopen a sprite you exported:</div>
            <div style={styles.btnRow}>
              <select style={{ ...styles.nameInput, flex: 1 }} value=""
                onChange={(e) => { if (e.target.value) { setSpriteName(e.target.value); } }}>
                <option value="">{available.length ? `— pick saved (${available.length}) —` : '— none saved yet —'}</option>
                {available.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button style={{ ...styles.secondary, ...(busy ? styles.disabled : {}) }} disabled={busy} onClick={handleLoad}>Load</button>
            </div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Export to project</div>
            <label style={styles.check} title="Streamed art (DPLC) vs all art resident. Characters use DPLC; most objects don't.">
              <input type="checkbox" checked={exportDplc} onChange={(e) => useSpriteStore.getState().setExportDplc(e.target.checked)} />
              DPLC (streamed art)
            </label>
            <label style={styles.fmtRow} title="Game format the sprite is saved in. Pick a different format than it was opened in to port it.">
              <span style={styles.dim}>Save as</span>
              <select style={styles.fmtSelect} value={format}
                onChange={(e) => useSpriteStore.getState().setFormat(e.target.value as SpriteFormatId)}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <button style={{ ...styles.primary, ...(busy ? styles.disabled : {}) }} disabled={busy} onClick={handleExport}>Export</button>
          </div>

          <div style={styles.section}>
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
  hint: { fontSize: 10, color: '#7f849c', lineHeight: 1.3 },
  divider: { height: 1, background: '#45475a', margin: '2px 0' },
  fmtRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  fmtSelect: { flex: 1, background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, fontSize: 12, padding: '4px 6px' },
  scanPanel: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, padding: 6, background: '#1e1e2e', border: '1px solid #45475a', borderRadius: 4 },
  scanList: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' },
  scanRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 3, background: '#313244' },
  scanName: { flex: 1, fontSize: 11, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  scanBadges: { display: 'flex', alignItems: 'center', gap: 3 },
  scanGame: { fontSize: 9, color: '#9399b2', fontWeight: 700 },
  scanTag: { fontSize: 9, color: '#1e1e2e', background: '#89b4fa', borderRadius: 2, padding: '0 3px', fontWeight: 700 },
  scanOpen: { padding: '2px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 3, cursor: 'pointer', fontSize: 11 },
  primary: { flex: 1, padding: '5px 8px', background: '#89b4fa', color: '#1e1e2e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  secondary: { flex: 1, padding: '5px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  disabled: { opacity: 0.5, cursor: 'default' },
};
