import React from 'react';
import { T } from '../ui';
import type { ChunkEmptyKind, ChunkGridPort } from './chunk-grid-model';
import {
  CHUNK_LABEL_BG, CHUNK_LABEL_TEXT, CHUNK_AIR_CHECK_A, CHUNK_AIR_CHECK_B,
} from '../../canvas/canvas-colors';

/**
 * The one chunk grid both engines render (stage-4 plan 3, task 7). Replaces
 * aeon's ChunkLibrary and classic's ChunkPicker, which were the same panel —
 * "a scrollable wall of chunk thumbnails, click to arm one for stamping" —
 * differing in decoration and, more importantly, in which one had done the
 * performance work.
 *
 * WHAT AEON GAINS BY THE MERGE (all three were classic's):
 *  - lazy first paint. Mounting 256 cells and rasterizing all of them
 *    synchronously janks the first frame; an IntersectionObserver defers each
 *    cell's paint until it scrolls into view.
 *  - ONE shared scratch canvas per source resolution instead of one per
 *    thumbnail. Aeon allocated a 128x128 OffscreenCanvas per chunk and held it.
 *  - per-chunk invalidation. Aeon keyed its memo on the global
 *    `chunkLibraryVersion`, so a single tile-pixel edit re-rasterized every
 *    thumbnail in the library; `port.versionKey(id)` is per chunk.
 *
 * IT IMPORTS NO STORE, deliberately — see shared/ObjectList for the full reason.
 * Ports live in `providers/chunk-grid-{aeon,classic}.ts`.
 */
export default function ChunkGrid({ port }: { port: ChunkGridPort }): React.ReactElement {
  const [size, setSize] = React.useState(port.defaultSize);
  const { HeaderExtra } = port;
  const strip = port.layout === 'strip';

  const sizeControl = port.sizes.length > 1 ? (
    <div style={styles.sizeCtl}>
      {port.sizes.map((px, i) => (
        <button
          key={px}
          onClick={() => setSize(px)}
          title={`${px}px thumbnails`}
          style={{ ...styles.sizeBtn, ...(size === px ? styles.sizeBtnSel : {}) }}
        >
          {SIZE_NAMES[i] ?? String(px)}
        </button>
      ))}
    </div>
  ) : null;

  const badge = port.statusBadge !== null ? <span style={styles.selBadge}>{port.statusBadge}</span> : null;
  const hint = <span style={styles.hint}>{port.statusHint}</span>;

  return (
    // rootProps first: a port contributes behaviour, not layout, and must not be
    // able to override the grid's own styling.
    <div {...port.rootProps} style={strip ? styles.containerStrip : styles.containerPanel}>
      <div style={styles.header}>
        <span style={styles.heading}>{port.heading}</span>
        {/* A strip is wide enough for one row; a narrow panel wraps the status
            line under the header controls, which is where each engine already
            put them. */}
        {strip && badge}
        {HeaderExtra && <HeaderExtra />}
        {strip && hint}
        {strip && sizeControl}
      </div>
      {port.ids.length === 0 && port.emptyState ? (
        <div style={styles.empty}>
          <span>{port.emptyState.message}</span>
          {port.emptyState.hint && <span style={styles.emptyHint}>{port.emptyState.hint}</span>}
        </div>
      ) : (
        <>
          {!strip && (
            <div style={styles.toolbar}>
              {badge}
              {hint}
              {sizeControl}
            </div>
          )}
          <div style={strip ? styles.gridStrip : styles.gridPanel}>
            {port.ids.map((id) => (
              <ChunkCell
                key={id}
                id={id}
                size={size}
                sourcePx={port.sourcePx}
                versionKey={port.versionKey(id)}
                emptyKind={port.emptyKind(id)}
                label={port.label(id)}
                title={port.title(id)}
                selected={id === port.selectedId}
                rasterize={port.rasterize}
                select={port.select}
                activate={port.activate}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Labels for `port.sizes`, in order. Both engines' scales are S/M/L or shorter. */
const SIZE_NAMES = ['S', 'M', 'L'];

// ONE shared full-resolution scratch canvas per source size (aeon 128, classic
// 256) for every cell's downscale-blit source. Rendering is synchronous, so a
// reused canvas is safe — and it caps transient allocation: without it, mounting
// N cells on a library load creates N throwaway full-res canvases in one burst.
// Lazily created on first use (never in a canvas-less env), reused thereafter.
const scratches = new Map<number, HTMLCanvasElement>();
function scratchFor(px: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  let canvas = scratches.get(px);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    scratches.set(px, canvas);
  }
  // willReadFrequently keeps the scratch CPU-backed — it is only ever filled by
  // putImageData then downscale-blitted, the same GPU-poor-resilient strategy as
  // the classic viewport's chunk cache.
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

/** A checkerboard, so classic's air ($00) cell reads as "empty / erase". */
function drawAirChecker(ctx: CanvasRenderingContext2D, size: number): void {
  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      ctx.fillStyle = ((x / cell + y / cell) & 1) ? CHUNK_AIR_CHECK_A : CHUNK_AIR_CHECK_B;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/**
 * One chunk thumbnail. The rasterize is (re)run only when this chunk's content
 * key changes, so a click (selection change) never repaints art and an edit
 * repaints only the chunk(s) it touched. React reuses the <canvas> DOM node
 * across renders, so the effect is the single place pixels are produced.
 */
const ChunkCell = React.memo(function ChunkCell({
  id, size, sourcePx, versionKey, emptyKind, label, title, selected, rasterize, select, activate,
}: {
  id: string;
  size: number;
  sourcePx: number;
  versionKey: string;
  emptyKind: ChunkEmptyKind;
  label: string;
  title: string;
  selected: boolean;
  rasterize: (id: string) => Uint8ClampedArray | null;
  select: (id: string) => void;
  activate?: (id: string) => void;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  // Lazy paint: only rasterize once the cell scrolls into view. A library load
  // mounts every cell at once; painting each eagerly (rasterize + putImageData +
  // downscale-blit, x N) is a synchronous main-thread burst that janks first
  // paint. `visible` latches once true (a painted cell stays painted);
  // `versionKey` repaints it on an art change.
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    }, { rootMargin: '64px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    const ctx = ref.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    // Air has no data behind it (classic's synthetic $00) — a checker reads as
    // "erase". A BLANK chunk is not this case: it has data, it rasterizes, and
    // aeon paints its colour 0 for real. It gets a hatched cell background and
    // an "empty" tag instead, below.
    if (emptyKind === 'air') {
      drawAirChecker(ctx, size);
      return;
    }
    const rgba = rasterize(id);
    if (!rgba) return;
    // Rasterize at full res into the ONE shared scratch, then blit it scaled into
    // this (persistent) thumbnail canvas, so only the small size x size backing
    // store is retained per cell.
    const { canvas: full, ctx: fctx } = scratchFor(sourcePx);
    if (fctx) {
      // createImageData + data.set avoids the ImageData ctor rejecting the core's
      // Uint8ClampedArray<ArrayBufferLike> (repo pattern — see the viewport).
      const img = fctx.createImageData(sourcePx, sourcePx);
      img.data.set(rgba);
      fctx.putImageData(img, 0, 0);
    }
    ctx.drawImage(full, 0, 0, size, size);
    // `rasterize` is read via closure but deliberately OMITTED from the deps: it
    // is a fresh closure on every port rebuild (i.e. on every selection change),
    // so depending on it would repaint the whole grid per click — the exact cost
    // this cache exists to avoid. versionKey alone gates the repaint, and it
    // moves for anything that can change these pixels: the chunk's own revision,
    // the library epoch, and the zone whose tiles and palette it bakes. A render
    // with a new versionKey necessarily re-ran with the new closure in scope.
    // `size` IS a dep: a thumbnail is rasterized to its display size, so S/M/L
    // re-rasterizes. That is one burst on an explicit, rare click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, versionKey, visible, size, sourcePx, emptyKind]);

  return (
    <button
      ref={btnRef}
      onClick={() => select(id)}
      onDoubleClick={activate ? () => activate(id) : undefined}
      title={title}
      style={{
        ...styles.cell,
        width: size,
        height: size,
        ...(emptyKind === 'blank' ? styles.cellBlank : {}),
        ...(selected ? styles.cellSel : {}),
      }}
    >
      <canvas ref={ref} width={size} height={size} style={styles.thumbCanvas} />
      {emptyKind === 'blank' && <span style={styles.blankTag}>empty</span>}
      <span style={styles.cellLabel}>{label}</span>
    </button>
  );
});

const styles: Record<string, React.CSSProperties> = {
  containerPanel: {
    display: 'flex', flexDirection: 'column',
    borderTop: `1px solid ${T.border}`,
    flex: 1, minHeight: 120, flexShrink: 0,
  },
  containerStrip: {
    display: 'flex', flexDirection: 'column',
    borderTop: `1px solid ${T.border}`, background: T.void, flexShrink: 0,
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  heading: {
    fontSize: 11, fontWeight: 600, color: T.textBase,
    textTransform: 'uppercase' as const, letterSpacing: 1, flexShrink: 0,
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  selBadge: {
    fontSize: 10, fontWeight: 600, color: T.onAccent, background: T.accent,
    padding: '0 6px', borderRadius: 3, lineHeight: '16px', fontFamily: T.fontMono,
    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  // Takes the slack between the badge and the size control, so the size buttons
  // sit flush right without a second auto margin fighting for the same space.
  hint: {
    fontSize: 9, color: T.textFaint, flex: 1, minWidth: 0, textAlign: 'right' as const,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  sizeCtl: { display: 'flex', gap: 2, flexShrink: 0 },
  sizeBtn: {
    padding: '0 6px', background: T.overlay, color: T.textBase,
    border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer', fontSize: 10, lineHeight: '16px',
  },
  sizeBtnSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  // The scrollable wall: native overflow gives a real scrollbar, flex-wrap lays
  // out every chunk, minHeight:0 lets it shrink inside the flex column so it
  // actually scrolls instead of growing the panel.
  gridPanel: {
    flex: 1, minHeight: 0, overflowY: 'auto',
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4, padding: 4,
  },
  gridStrip: {
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4,
    padding: 6, maxHeight: 148, overflowY: 'auto', overflowX: 'hidden',
  },
  empty: {
    padding: '12px 8px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, color: T.textLo, fontSize: 11, textAlign: 'center' as const,
  },
  emptyHint: { fontSize: 9, color: T.borderStrong },
  cell: {
    position: 'relative', padding: 0, flexShrink: 0, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer', overflow: 'hidden',
  },
  cellSel: { outline: `2px solid ${T.accent}`, outlineOffset: -1, borderColor: T.accent },
  // Blank/eraser chunks: a faint diagonal hatch behind the canvas so an empty
  // thumbnail reads as deliberately empty, not as a dark content chunk.
  cellBlank: {
    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, ${T.border} 4px, ${T.border} 5px)`,
  },
  blankTag: {
    position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)',
    textAlign: 'center', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' as const,
    color: T.textLo, pointerEvents: 'none',
  },
  thumbCanvas: { display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' as const },
  cellLabel: {
    position: 'absolute', left: 0, bottom: 0, right: 0,
    background: CHUNK_LABEL_BG, color: CHUNK_LABEL_TEXT,
    fontSize: 9, fontFamily: T.fontMono, lineHeight: '12px', padding: '0 2px',
  },
};
