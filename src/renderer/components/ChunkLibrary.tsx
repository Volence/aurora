import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import { openDocumentGuarded } from './art/open-document';
import { docFromChunk } from '../../core/art/composer-buffer';
import { importChunks } from '../../core/formats/chunk-mappings';
import { kosinskiDecompress } from '../../core/formats/kosinski';
import { parseTiles } from '../../core/formats/tiles';
import { migrateChunkTilesIntoTileset } from '../../core/art/atlas-migration';
import { unpackNametableWord } from '../../core/model/s4-types';
import type { ChunkDef, Tile, Palette } from '../../core/model/s4-types';
import { T } from './ui';
import { CHUNK_LABEL_BG, CHUNK_LABEL_TEXT } from '../canvas/canvas-colors';

const CHUNK_PX = 128;            // source render resolution (one chunk = 16×16 tiles)
const SIZES = [56, 88, 120];     // thumbnail display sizes (S / M / L)

/** A chunk with no visible content — every cell references tile 0 (the engine's
 *  transparent tile). It renders fully transparent, so stamping it ERASES the
 *  16×16 area (a useful eraser, but easy to pick by mistake). We mark these in the
 *  palette so an empty thumbnail isn't mistaken for a dark content chunk. */
function isBlankChunk(chunk: ChunkDef): boolean {
  for (const w of chunk.nametable) if (unpackNametableWord(w).tileIndex !== 0) return false;
  return true;
}

function renderChunkThumbnail(chunk: ChunkDef, tiles: Tile[], palette: Palette): OffscreenCanvas {
  const canvas = new OffscreenCanvas(CHUNK_PX, CHUNK_PX);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(CHUNK_PX, CHUNK_PX);

  for (let tileRow = 0; tileRow < chunk.heightTiles; tileRow++) {
    for (let tileCol = 0; tileCol < chunk.widthTiles; tileCol++) {
      const word = chunk.nametable[tileRow * chunk.widthTiles + tileCol];
      const entry = unpackNametableWord(word);
      const tile = tiles[entry.tileIndex];
      if (!tile) continue;

      const palLine = palette.lines[entry.palette]?.colors ?? palette.lines[0]?.colors ?? [];

      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const srcX = entry.hFlip ? 7 - px : px;
          const srcY = entry.vFlip ? 7 - py : py;
          const colorIdx = tile.pixels[srcY * 8 + srcX];
          const color = palLine[colorIdx] ?? { r: 0, g: 0, b: 0, a: 255 };
          const destX = tileCol * 8 + px;
          const destY = tileRow * 8 + py;
          const offset = (destY * CHUNK_PX + destX) * 4;
          img.data[offset] = color.r;
          img.data[offset + 1] = color.g;
          img.data[offset + 2] = color.b;
          img.data[offset + 3] = color.a;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** One chunk thumbnail: the source render is memoised; only the scaled draw
 *  re-runs when the display size changes. */
function ChunkThumb({ chunk, tiles, palette, size, selected, label, blank, onClick, onDoubleClick }: {
  chunk: ChunkDef; tiles: Tile[]; palette: Palette; size: number; selected: boolean; label: string;
  blank: boolean; onClick: () => void; onDoubleClick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useMemo(() => renderChunkThumbnail(chunk, tiles, palette), [chunk, tiles, palette]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(off, 0, 0, size, size);
  }, [off, size]);
  return (
    <button
      onClick={onClick} onDoubleClick={onDoubleClick}
      title={blank ? `${chunk.name} — blank (transparent) chunk; stamping it erases the area` : chunk.name}
      style={{ ...styles.cell, width: size, height: size, ...(blank ? styles.cellBlank : {}), ...(selected ? styles.cellSel : {}) }}
    >
      <canvas ref={ref} width={size} height={size} style={styles.thumbCanvas} />
      {blank && <span style={styles.blankTag}>empty</span>}
      <span style={styles.cellLabel}>{label}</span>
    </button>
  );
}

export default function ChunkLibrary() {
  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  const chunkLibraryVersion = useEditorStore((s) => s.chunkLibraryVersion);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const [importing, setImporting] = useState(false);
  const [size, setSize] = useState(SIZES[1]); // default M

  const zone = getCurrentZone(useProjectStore.getState());
  const chunks = project?.chunkLibrary ?? [];
  const tiles = zone?.tileset.tiles ?? [];
  const palette = zone?.palette ?? { lines: [] };

  // Which chunks are fully transparent (eraser chunks) — marked in the palette.
  const blankIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of chunks) if (isBlankChunk(c)) s.add(c.id);
    return s;
  }, [chunks]);

  const selectChunk = useCallback((chunk: ChunkDef) => {
    useEditorStore.getState().setSelectedChunkId(chunk.id);
  }, []);

  // Double-click: open the chunk as a composer document in Art mode.
  const editChunk = useCallback((chunk: ChunkDef) => {
    if (!openDocumentGuarded({
      doc: docFromChunk(chunk), liveTileIndex: null, chunkId: chunk.id, name: chunk.name, dirty: false,
    })) return;
    useEditorStore.getState().setAppMode('art');
  }, []);

  const handleImport = useCallback(async () => {
    try {
      setImporting(true);

      const chunkPath = await window.api.selectFile(
        'Select 128x128 chunk mappings (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
      if (!chunkPath) { setImporting(false); return; }

      const blockPath = await window.api.selectFile(
        'Select 16x16 block mappings (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
      if (!blockPath) { setImporting(false); return; }

      const artPath = await window.api.selectFile(
        'Select zone art tiles (Kosinski)', [{ name: 'Binary', extensions: ['bin'] }]);
      if (!artPath) { setImporting(false); return; }

      const chunkData = new Uint8Array(await window.api.readBinaryFile('', chunkPath));
      const blockData = new Uint8Array(await window.api.readBinaryFile('', blockPath));
      const artData = new Uint8Array(await window.api.readBinaryFile('', artPath));

      const namePrefix = chunkPath.split('/').pop()?.replace('.bin', '') ?? 'Chunk';
      const imported = importChunks(chunkData, blockData, namePrefix);

      const artDecompressed = kosinskiDecompress(artData);
      const artTiles = parseTiles(artDecompressed);

      // Unified atlas: merge the imported art into the zone tileset (flip-aware
      // dedup) and remap the imported chunks' nametables to zone-tileset indices.
      const pZone = getCurrentZone(useProjectStore.getState());
      if (!pZone) throw new Error('no active zone to import into');
      migrateChunkTilesIntoTileset(pZone.tileset.tiles, artTiles, imported, []);

      useProjectStore.getState().addChunks(imported);
      useEditorStore.getState().markDirty();

      // Default-select the first chunk with actual content (skip blank/eraser
      // chunks like $00 so a fresh stamp doesn't silently erase).
      const firstContent = imported.find(c => !isBlankChunk(c)) ?? imported[0];
      if (firstContent) {
        useEditorStore.getState().setSelectedChunkId(firstContent.id);
      }
      useToastStore.getState().addToast(`Imported ${imported.length} chunks -- Save to keep`, 'success');
    } catch (err) {
      useProjectStore.getState().setError(
        `Chunk import failed: ${err instanceof Error ? err.message : String(err)}`);
      useToastStore.getState().addToast('Chunk import failed', 'error');
    } finally {
      setImporting(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    useProjectStore.getState().clearChunks();
    useEditorStore.getState().markDirty();
  }, []);

  const selectedName = selectedChunkId
    ? chunks.find(c => c.id === selectedChunkId)?.name ?? selectedChunkId
    : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>Chunks ({chunks.length})</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={handleImport} style={styles.headerBtn} disabled={importing}>
            {importing ? 'Importing...' : 'Import'}
          </button>
          {chunks.length > 0 && (
            <button onClick={handleClear} style={styles.headerBtn}>Clear</button>
          )}
        </div>
      </div>
      {chunks.length === 0 ? (
        <div style={styles.empty}>
          <span>No chunks loaded</span>
          <span style={styles.hint}>Import 128x128 + 16x16 + art from S2/S3K/hack</span>
        </div>
      ) : (
        <>
          <div style={styles.toolbar}>
            {selectedName
              ? <><span style={styles.selectedBadge}>{selectedName}</span>
                  <span style={styles.hint}>Click map to stamp · dbl-click to edit</span></>
              : <span style={styles.hint}>Click a chunk to select</span>}
            <div style={styles.sizeCtl}>
              {(['S', 'M', 'L'] as const).map((name, i) => (
                <button key={name} onClick={() => setSize(SIZES[i])}
                  style={{ ...styles.sizeBtn, ...(size === SIZES[i] ? styles.sizeBtnSel : {}) }}>{name}</button>
              ))}
            </div>
          </div>
          <div style={styles.grid}>
            {chunks.map((chunk, idx) => (
              <ChunkThumb
                key={chunk.id}
                chunk={chunk} tiles={tiles} palette={palette} size={size}
                selected={chunk.id === selectedChunkId}
                blank={blankIds.has(chunk.id)}
                label={`$${idx.toString(16).toUpperCase().padStart(2, '0')}`}
                onClick={() => selectChunk(chunk)}
                onDoubleClick={() => editChunk(chunk)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    borderTop: `1px solid ${T.border}`,
    flex: 1, minHeight: 120, flexShrink: 0,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  label: {
    fontSize: 11, fontWeight: 600, color: T.textBase,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  headerBtn: {
    padding: '2px 8px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 3, cursor: 'pointer', fontSize: 10,
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  sizeCtl: { display: 'flex', gap: 2, marginLeft: 'auto' },
  sizeBtn: {
    padding: '0 6px', background: T.overlay, color: T.textBase,
    border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer', fontSize: 10, lineHeight: '16px',
  },
  sizeBtnSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  // The scrollable grid: native overflow gives a real scrollbar, flex-wrap lays
  // out every chunk, minHeight:0 lets it shrink inside the flex column so it
  // actually scrolls instead of growing the panel.
  grid: {
    flex: 1, minHeight: 0, overflowY: 'auto',
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 4, padding: 4,
  },
  cell: {
    position: 'relative', padding: 0, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: 3, cursor: 'pointer', overflow: 'hidden',
  },
  cellSel: { outline: `2px solid ${T.accent}`, outlineOffset: -1, borderColor: T.accent },
  // Blank/eraser chunks: a faint diagonal hatch behind the (transparent) canvas so
  // an empty thumbnail reads as deliberately empty, not a dark content chunk.
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
  selectedBadge: {
    fontSize: 10, fontWeight: 600, color: T.surface, background: T.success,
    padding: '0 5px', borderRadius: 3, lineHeight: '16px',
  },
  empty: {
    padding: '12px 8px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, color: T.textLo, fontSize: 11,
  },
  hint: { fontSize: 9, color: T.borderStrong },
};
