import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useArtStore } from '../../state/artStore';
import { useSpriteStore } from '../../state/spriteStore';
import SpriteCanvas from './SpriteCanvasHost';
import type { OverlayRect } from './SpriteCanvasHost';
import FrameGrid from './FrameGrid';
import Timeline from './Timeline';
import { exportSprite, exportSpriteAsm, loadSpriteByName, listSprites, loadEngineCharacter, openSprite, scanProjectForSprites, openDiscoveredSet, loadSpriteAnimations } from './export-sprite';
import type { ProjectScan } from './export-sprite';
import PaletteEditor from '../art/PaletteEditor';
import SpritePaletteHeader from './SpritePaletteHeader';
import { useAnchoredZoom } from '../art-shared/use-anchored-zoom';
import { useHandPan } from '../art-shared/use-hand-pan';
import { decomposeFrame } from '../../../core/art/sprite-decompose';
import type { SpriteFormatId } from '../../../core/formats/sprite-format-adapter';
import type { CompressionKind } from '../../../core/compress';
import { Panel, CollapsibleSection, T } from '../ui';
import EditorShell from '../../shell/EditorShell';
import SpriteToolDock from '../../shell/SpriteToolDock';
import SpriteToolOptions from '../../shell/SpriteToolOptions';
import SpriteStatusBar from '../../shell/SpriteStatusBar';

const FORMATS: { id: SpriteFormatId; label: string }[] = [
  { id: 's4', label: 'S4 (our engine)' },
  { id: 's1', label: 'Sonic 1' },
  { id: 's2', label: 'Sonic 2' },
  { id: 's3k', label: 'Sonic 3&K / S.C.E.' },
];

const COMPRESSIONS: { id: CompressionKind; label: string }[] = [
  { id: 'nemesis', label: 'Nemesis' },
  { id: 'kosinski-moduled', label: 'Kosinski (moduled)' },
  { id: 'kosinski', label: 'Kosinski (plain)' },
  { id: 'uncompressed', label: 'Uncompressed' },
];

/** Per-game default art compression (overridable — compression is per-sprite). */
const DEFAULT_COMPRESSION: Record<SpriteFormatId, CompressionKind> = {
  s1: 'nemesis', s2: 'nemesis', s3k: 'kosinski-moduled', s4: 'uncompressed',
};

export default function SpriteMode({ appBar }: { appBar: React.ReactNode }) {
  const project = useProjectStore((s) => s.project);
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
  const [openComp, setOpenComp] = useState<CompressionKind>('nemesis');
  const [available, setAvailable] = useState<string[]>([]);
  const [scan, setScan] = useState<ProjectScan | null>(null);
  const [scanFilter, setScanFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [newSize, setNewSize] = useState(32);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const zoom = useSpriteStore((s) => s.zoom);
  // Cursor-anchored wheel zoom on the sprite canvas (sprite zoom is integer, so
  // the default 2x step crosses integer boundaries cleanly).
  useAnchoredZoom(canvasWrapRef, zoom, () => useSpriteStore.getState().zoom, (z) => useSpriteStore.getState().setZoom(z));
  useHandPan(canvasWrapRef);

  const buffer = frames[currentIndex];

  useEffect(() => { listSprites().then(setAvailable).catch(() => setAvailable([])); }, []);

  // Ctrl/Cmd+Z (no shift) → undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z → redo.
  // Mirror ArtMode's guard: skip only text-entry inputs so undo works right
  // after a slider/checkbox commit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT'
          && !['range', 'checkbox', 'button', 'radio'].includes(
            (target as HTMLInputElement).type)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        useSpriteStore.getState().undo();
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        useSpriteStore.getState().redo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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
    <EditorShell
      appBar={appBar}
      toolDock={<SpriteToolDock />}
      toolOptions={<SpriteToolOptions newSize={newSize} onNewSize={setNewSize} onFit={fitToView} />}
      panels={
        <Panel width={240} scroll>
          <CollapsibleSection id="sprite.mapping" title="Mapping">
          <div style={styles.section}>
            <div style={styles.stat}><span>Hardware pieces</span><b>{decomp.pieces.length}</b></div>
            <div style={styles.stat}><span>Unique tiles</span><b>{decomp.tiles.length}</b></div>
          </div>
          </CollapsibleSection>

          <CollapsibleSection id="sprite.name" title="Sprite">
          <div style={styles.section}>
            <input style={styles.nameInput} value={spriteName} spellCheck={false}
              onChange={(e) => setSpriteName(e.target.value)} placeholder="SpriteName" />
          </div>
          </CollapsibleSection>

          <CollapsibleSection id="sprite.open" title="Open — import a sprite to edit or convert">
          <div style={styles.section}>
            <label style={styles.fmtRow} title="Read the opened files as this game's format. It also becomes the Save-as target, so you can convert by saving in another format.">
              <span style={styles.dim}>Read as</span>
              <select style={styles.fmtSelect} value={openAs}
                onChange={(e) => { const f = e.target.value as SpriteFormatId; setOpenAs(f); setOpenComp(DEFAULT_COMPRESSION[f]); }}>
                {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label style={styles.fmtRow} title="Art compression of the picked art file. This is per-SPRITE, not per-game — e.g. most S3K badnik art is Kosinski-moduled; some is Nemesis or uncompressed.">
              <span style={styles.dim}>Art comp.</span>
              <select style={styles.fmtSelect} value={openComp} onChange={(e) => setOpenComp(e.target.value as CompressionKind)}>
                {COMPRESSIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <button style={{ ...styles.primary, ...(busy ? styles.disabled : {}) }} disabled={busy}
              title="Pick the mapping file (.asm or .bin), then its art file (.nem/.bin), then an optional DPLC file."
              onClick={() => openSprite(openAs, openComp)}>Open sprite…</button>
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
                        onClick={async () => { if (busy) return; setBusy(true); try { await openDiscoveredSet(scan.baseDir, s, openComp); } finally { setBusy(false); } }}>Open</button>
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
          </CollapsibleSection>

          <CollapsibleSection id="sprite.export" title="Export to project">
          <div style={styles.section}>
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
            <div style={styles.btnRow}>
              <button style={{ ...styles.primary, ...(busy ? styles.disabled : {}) }} disabled={busy} onClick={handleExport}>Export</button>
              <button style={{ ...styles.secondary, ...(busy ? styles.disabled : {}) }} disabled={busy}
                title="Save the mappings (+ DPLC) as disassembly .asm macro source (spritePiece/dplcEntry) — to port back into a Sonic 1/2/3K disassembly."
                onClick={async () => { if (busy) return; setBusy(true); try { await exportSpriteAsm(spriteName); } finally { setBusy(false); } }}>Export .asm…</button>
            </div>
          </div>
          </CollapsibleSection>

          <CollapsibleSection id="sprite.character" title="Load engine character">
          <div style={styles.section}>
            <div style={styles.btnRow}>
              {['sonic', 'tails', 'knuckles'].map((c) => (
                <button key={c} style={styles.secondary} onClick={() => loadEngineCharacter(c)}>{c[0].toUpperCase() + c.slice(1)}</button>
              ))}
            </div>
          </div>
          </CollapsibleSection>

          <CollapsibleSection id="sprite.palette" title="Palette">
            <SpritePaletteHeader />
            <PaletteEditor />
          </CollapsibleSection>
        </Panel>
      }
      bottomExtra={<><FrameGrid /><Timeline /></>}
      status={<SpriteStatusBar pieces={decomp.pieces.length} tiles={decomp.tiles.length} />}
    >
      {/* Fill the shell's canvas slot — absolute full-fill so the scroll/pad
          wrapper expands to the slot like ArtMode's canvas does. */}
      <div ref={canvasWrapRef} style={styles.canvasWrap}>
        <div style={styles.canvasPad}>
          <SpriteCanvas overlayRects={overlayRects} />
        </div>
      </div>
    </EditorShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textLo },
  dim: { fontSize: 11, color: T.textLo },
  sizeBtn: { padding: '3px 7px', background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 4, cursor: 'pointer', fontSize: 11 },
  canvasWrap: { position: 'absolute', inset: 0, overflow: 'auto', background: T.void },
  canvasPad: { display: 'inline-block', padding: 24 },
  section: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  stat: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.textHi },
  nameInput: { background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: 12, padding: '4px 6px' },
  btnRow: { display: 'flex', gap: 6 },
  check: { fontSize: 11, color: T.textBase, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  hint: { fontSize: 10, color: T.textFaint, lineHeight: 1.3 },
  divider: { height: 1, background: T.borderStrong, margin: '2px 0' },
  fmtRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  fmtSelect: { flex: 1, background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 4, fontSize: 12, padding: '4px 6px' },
  scanPanel: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, padding: 6, background: T.void, border: `1px solid ${T.borderStrong}`, borderRadius: 4 },
  scanList: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' },
  scanRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 3, background: T.raised },
  scanName: { flex: 1, fontSize: 11, color: T.textHi, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  scanBadges: { display: 'flex', alignItems: 'center', gap: 3 },
  scanGame: { fontSize: 9, color: T.textLo, fontWeight: 700 },
  scanTag: { fontSize: 9, color: T.onAccent, background: T.success, borderRadius: 2, padding: '0 3px', fontWeight: 700 },
  scanOpen: { padding: '2px 8px', background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 3, cursor: 'pointer', fontSize: 11 },
  primary: { flex: 1, padding: '5px 8px', background: T.success, color: T.onAccent, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  secondary: { flex: 1, padding: '5px 8px', background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`, borderRadius: 4, cursor: 'pointer', fontSize: 12 },
  disabled: { opacity: 0.5, cursor: 'default' },
};
