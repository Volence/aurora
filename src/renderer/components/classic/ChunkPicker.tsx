import React, { useRef, useEffect, useState } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { renderChunk } from '../../../core/level-classic/render';
import type { LevelDoc } from '../../../core/level-classic/model';
import { CHUNK_PX } from './viewport-math';
import { CHUNK_LABEL_BG, CHUNK_LABEL_TEXT, CHUNK_AIR_CHECK_A, CHUNK_AIR_CHECK_B } from '../../canvas/canvas-colors';

// One chunk = 256x256 world px (CHUNK_PX, shared); thumbnails downscale that.
// Fixed display size (no S/M/L control — the picker is a compact bottom strip).
const THUMB = 56;

// ONE shared full-resolution scratch canvas for every ThumbCell's downscale-blit
// source. Rendering is synchronous, so a single reused 256x256 canvas is safe —
// and it caps transient canvas allocation: without it, mounting ~N ThumbCells on
// an act load would create N throwaway 256x256 canvases in one burst (per-frame GPU
// canvas churn). Lazily created on first use (never on the server / a canvas-less
// env), reused thereafter.
let sharedFull: HTMLCanvasElement | null = null;
function fullScratch(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  if (!sharedFull) {
    sharedFull = document.createElement('canvas');
    sharedFull.width = CHUNK_PX;
    sharedFull.height = CHUNK_PX;
  }
  // willReadFrequently keeps the shared scratch CPU-backed (it's only ever filled
  // by putImageData then downscale-blitted) — the same GPU-poor-resilient strategy
  // as the classic viewport's chunk cache.
  return { canvas: sharedFull, ctx: sharedFull.getContext('2d', { willReadFrequently: true }) };
}

const hex2 = (n: number) => `$${n.toString(16).toUpperCase().padStart(2, '0')}`;

/** Paint a small checkerboard so the air ($00) cell reads as "empty / erase". */
function drawAirChecker(ctx: CanvasRenderingContext2D): void {
  const cell = 8;
  for (let y = 0; y < THUMB; y += cell) {
    for (let x = 0; x < THUMB; x += cell) {
      ctx.fillStyle = ((x / cell + y / cell) & 1) ? CHUNK_AIR_CHECK_A : CHUNK_AIR_CHECK_B;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/**
 * One chunk thumbnail. The `renderChunk` prerender is (re)run only when the
 * chunk's content key changes — the effect deps `[doc, chunkId, versionKey]` ARE
 * the cache, keyed exactly like the viewport's offscreen cache (chunkEpoch +
 * per-chunk version), so a click (selection change) never re-renders the art and
 * an edit re-renders only the chunk(s) it touched. React reuses the <canvas> DOM
 * node across renders, so the effect is the single place pixels are produced.
 */
const ThumbCell = React.memo(function ThumbCell({
  doc, chunkId, versionKey, selected, onSelect,
}: {
  doc: LevelDoc;
  chunkId: number;
  versionKey: string;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Lazy paint: only render a thumbnail once it scrolls into the strip's viewport.
  // On an act load ChunkPicker mounts every chunk's cell at once; painting each one
  // eagerly (renderChunk 256×256 + putImageData + downscale-blit, ~N of them) is a
  // synchronous main-thread burst that janks first paint. An IntersectionObserver
  // gates painting on visibility, so the initial burst is only the handful of cells
  // actually on-screen; the rest paint as the strip is scrolled. `visible` latches
  // once true (a painted cell stays painted); `versionKey` re-paints on art change.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    }, { rootMargin: '64px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const ctx = ref.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, THUMB, THUMB);
    // Engine id 0 is air/blank (renderChunk composes nothing) — draw a checker so
    // it reads as "erase", not a black chunk. Still a selectable entry so the
    // Stamp tool can paint air to clear a cell.
    if (chunkId === 0) {
      drawAirChecker(ctx);
      return;
    }
    // Render the chunk at full res into the ONE shared scratch canvas, then draw it
    // scaled into this (persistent) thumbnail canvas. The scratch is reused across
    // all cells, so only the small THUMB×THUMB backing store is retained per cell
    // and no per-cell 256×256 canvas is allocated.
    const { canvas: full, ctx: fctx } = fullScratch();
    if (fctx) {
      // createImageData + data.set avoids the ImageData ctor rejecting the core's
      // Uint8ClampedArray<ArrayBufferLike> (repo pattern — see the viewport).
      const img = fctx.createImageData(CHUNK_PX, CHUNK_PX);
      img.data.set(renderChunk(doc, chunkId));
      fctx.putImageData(img, 0, 0);
    }
    ctx.drawImage(full, 0, 0, THUMB, THUMB);
    // `doc` is read via closure but deliberately OMITTED from the deps: its
    // identity churns on EVERY edit (layout stamps bump no chunk versions yet
    // replace the doc), so depending on it would re-render all ~256 thumbnails per
    // stamp. versionKey alone (chunkEpoch + this chunk's version) gates re-render,
    // so only chunks whose ART actually changed rebuild — and a fresh act bumps
    // chunkEpoch, moving every key. `doc` is always current here because a render
    // with a new versionKey necessarily re-ran with the new doc in scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkId, versionKey, visible]);

  return (
    <button
      ref={btnRef}
      onClick={() => onSelect(chunkId)}
      title={chunkId === 0 ? 'Air ($00) — stamp to erase a cell' : `Chunk ${hex2(chunkId)}`}
      style={{ ...styles.cell, ...(selected ? styles.cellSel : {}) }}
    >
      <canvas ref={ref} width={THUMB} height={THUMB} style={styles.thumbCanvas} />
      <span style={styles.cellLabel}>{chunkId === 0 ? 'air' : hex2(chunkId)}</span>
    </button>
  );
});

/**
 * Bottom-dock chunk picker for the classic level editor (Task 13). Shows a
 * thumbnail of every chunk in the open act; click selects the chunk the Stamp
 * tool paints (right-click in the viewport eyedrops into the same selection). The
 * strip is scrollable and highlights the current selection.
 */
export default function ChunkPicker() {
  const doc = useClassicLevelStore((s) => s.doc);
  const status = useClassicLevelStore((s) => s.status);
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);
  const stampLoop = useClassicLevelStore((s) => s.stampLoop);
  const setStampLoop = useClassicLevelStore((s) => s.setStampLoop);

  if (status !== 'ready' || !doc) return null;

  // S1's bit-7 loop flag is only meaningful for a real engine id (1..$7F); air
  // ($00) can't loop, so the toggle only shows for an armed stampable chunk.
  const loopable = selectedChunkId >= 1 && selectedChunkId <= 0x7f;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Chunks ({doc.chunks.length})</span>
        <span style={styles.selBadge}>{hex2(selectedChunkId)}</span>
        {loopable && (
          <button
            onClick={() => setStampLoop(!stampLoop)}
            title="Stamp this chunk with S1's loop flag (bit 7) — used for loop-de-loop layout cells"
            style={{ ...styles.loopBtn, ...(stampLoop ? styles.loopBtnOn : {}) }}
          >
            ∞ Loop
          </button>
        )}
        <span style={styles.hint}>click to select · right-click viewport to eyedrop</span>
      </div>
      <div style={styles.strip}>
        {/* Engine-id space: a leading air ($00) entry, then $01..N mapping to the
            file's chunks[0..N-1] (S1 layout ids are 1-based). versionKey stays
            engine-id-keyed, exactly like the viewport's offscreen cache. */}
        {Array.from({ length: doc.chunks.length + 1 }, (_, id) => (
          <ThumbCell
            key={id}
            doc={doc}
            chunkId={id}
            versionKey={`${chunkEpoch}:${chunkVersions.get(id) ?? 0}`}
            selected={id === selectedChunkId}
            onSelect={setSelectedChunkId}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    borderTop: `1px solid ${T.border}`, background: T.void, flexShrink: 0,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '3px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  label: {
    fontSize: 11, fontWeight: 600, color: T.textBase,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  selBadge: {
    fontSize: 10, fontWeight: 600, color: T.onAccent, background: T.accent,
    padding: '0 6px', borderRadius: 3, lineHeight: '16px', fontFamily: T.fontMono,
  },
  loopBtn: {
    fontSize: 10, fontWeight: 600, color: T.textLo, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: 3, padding: '0 6px',
    lineHeight: '16px', cursor: 'pointer',
  },
  loopBtnOn: { color: T.onAccent, background: T.warning, borderColor: T.warning },
  hint: { fontSize: 9, color: T.textFaint, marginLeft: 'auto' },
  // Horizontal scrollable strip of thumbnails.
  strip: {
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4,
    padding: 6, maxHeight: 148, overflowY: 'auto', overflowX: 'hidden',
  },
  cell: {
    position: 'relative', padding: 0, width: THUMB, height: THUMB, flexShrink: 0,
    background: T.overlay, border: `1px solid ${T.border}`, borderRadius: 3,
    cursor: 'pointer', overflow: 'hidden',
  },
  cellSel: { outline: `2px solid ${T.accent}`, outlineOffset: -1, borderColor: T.accent },
  thumbCanvas: {
    display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' as const,
  },
  cellLabel: {
    position: 'absolute', left: 0, bottom: 0, right: 0,
    background: CHUNK_LABEL_BG, color: CHUNK_LABEL_TEXT,
    fontSize: 9, fontFamily: T.fontMono, lineHeight: '12px', padding: '0 2px',
  },
};
