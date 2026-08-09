import React, { useRef, useEffect } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { renderChunk } from '../../../core/level-classic/render';
import type { LevelDoc } from '../../../core/level-classic/model';
import { CHUNK_LABEL_BG, CHUNK_LABEL_TEXT } from '../../canvas/canvas-colors';

// One chunk = 256x256 world px; thumbnails downscale that. Fixed display size
// (no S/M/L control — the picker is a compact bottom strip).
const CHUNK_PX = 256;
const THUMB = 56;

const hex2 = (n: number) => `$${n.toString(16).toUpperCase().padStart(2, '0')}`;

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
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    // Render the chunk at full res into a temp canvas, then draw it scaled into
    // the (persistent) thumbnail canvas. The temp canvas is GC'd, so only the
    // small THUMB×THUMB backing store is retained per cell.
    const full = document.createElement('canvas');
    full.width = CHUNK_PX;
    full.height = CHUNK_PX;
    const fctx = full.getContext('2d');
    if (fctx) {
      // createImageData + data.set avoids the ImageData ctor rejecting the core's
      // Uint8ClampedArray<ArrayBufferLike> (repo pattern — see the viewport).
      const img = fctx.createImageData(CHUNK_PX, CHUNK_PX);
      img.data.set(renderChunk(doc, chunkId));
      fctx.putImageData(img, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, THUMB, THUMB);
    ctx.drawImage(full, 0, 0, THUMB, THUMB);
    // `doc` is read via closure but deliberately OMITTED from the deps: its
    // identity churns on EVERY edit (layout stamps bump no chunk versions yet
    // replace the doc), so depending on it would re-render all ~256 thumbnails per
    // stamp. versionKey alone (chunkEpoch + this chunk's version) gates re-render,
    // so only chunks whose ART actually changed rebuild — and a fresh act bumps
    // chunkEpoch, moving every key. `doc` is always current here because a render
    // with a new versionKey necessarily re-ran with the new doc in scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkId, versionKey]);

  return (
    <button
      onClick={() => onSelect(chunkId)}
      title={`Chunk ${hex2(chunkId)}`}
      style={{ ...styles.cell, ...(selected ? styles.cellSel : {}) }}
    >
      <canvas ref={ref} width={THUMB} height={THUMB} style={styles.thumbCanvas} />
      <span style={styles.cellLabel}>{hex2(chunkId)}</span>
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

  if (status !== 'ready' || !doc) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Chunks ({doc.chunks.length})</span>
        <span style={styles.selBadge}>{hex2(selectedChunkId)}</span>
        <span style={styles.hint}>click to select · right-click viewport to eyedrop</span>
      </div>
      <div style={styles.strip}>
        {doc.chunks.map((_, id) => (
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
