import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import { useArtStore } from '../state/artStore';
import { openDocumentGuarded } from './art/open-document';
import { docFromChunk } from '../../core/art/composer-buffer';
import { importChunks } from '../../core/formats/chunk-mappings';
import { kosinskiDecompress } from '../../core/formats/kosinski';
import { parseTiles } from '../../core/formats/tiles';
import { migrateChunkTilesIntoTileset } from '../../core/art/atlas-migration';
import { unpackNametableWord } from '../../core/model/s4-types';
import type { ChunkDef, Tile, Palette } from '../../core/model/s4-types';
import { T } from './ui';
import { CANVAS_VOID, CHUNK_LABEL_BG, CHUNK_LABEL_TEXT, TILE_SELECTED } from '../canvas/canvas-colors';

const CHUNK_PX = 128;
const THUMB_SCALE = 0.5;
const THUMB_PX = CHUNK_PX * THUMB_SCALE;

let thumbCache: OffscreenCanvas[] = [];
let thumbCacheKey: string | null = null;

function renderChunkThumbnail(
  chunk: ChunkDef,
  tiles: Tile[],
  palette: Palette,
): OffscreenCanvas {
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

function rebuildThumbCache(chunks: ChunkDef[], tiles: Tile[], palette: Palette, key: string) {
  if (thumbCacheKey === key) return;
  thumbCacheKey = key;
  thumbCache = chunks.map((chunk) => renderChunkThumbnail(chunk, tiles, palette));
}

export default function ChunkLibrary() {
  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  const chunkLibraryVersion = useEditorStore((s) => s.chunkLibraryVersion);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const [importing, setImporting] = useState(false);

  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const chunks = project?.chunkLibrary ?? [];
  const tiles = zone?.tileset.tiles ?? [];
  const palette = zone?.palette ?? { lines: [] };

  useEffect(() => {
    if (zone && currentZoneId && chunks.length > 0 && tiles.length > 0) {
      rebuildThumbCache(
        chunks, tiles, palette,
        `${currentZoneId}:${chunks.length}:${tiles.length}:${chunkLibraryVersion}`,
      );
    }
  }, [zone, currentZoneId, chunks.length, tiles.length, chunkLibraryVersion]);

  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || chunks.length === 0) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = CANVAS_VOID;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gap = 4;
    const cols = Math.max(1, Math.floor(canvas.width / (THUMB_PX + gap)));
    const totalRows = Math.ceil(chunks.length / cols);
    const startRow = Math.floor(scrollTop / (THUMB_PX + gap));
    const visibleRows = Math.ceil(canvas.height / (THUMB_PX + gap)) + 1;

    for (let row = startRow; row < Math.min(startRow + visibleRows, totalRows); row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (idx >= chunks.length || idx >= thumbCache.length) break;

        const x = col * (THUMB_PX + gap);
        const y = row * (THUMB_PX + gap) - scrollTop;
        ctx.drawImage(thumbCache[idx], x, y, THUMB_PX, THUMB_PX);

        // Label
        ctx.fillStyle = CHUNK_LABEL_BG;
        ctx.fillRect(x, y + THUMB_PX - 12, THUMB_PX, 12);
        ctx.fillStyle = CHUNK_LABEL_TEXT;
        ctx.font = '9px monospace';
        ctx.fillText(`$${idx.toString(16).toUpperCase().padStart(2, '0')}`, x + 2, y + THUMB_PX - 3);

        if (chunks[idx].id === selectedChunkId) {
          ctx.strokeStyle = TILE_SELECTED;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, THUMB_PX, THUMB_PX);
        }
      }
    }
  }, [chunks, scrollTop, selectedChunkId, tiles.length, chunkLibraryVersion]);

  useEffect(() => {
    renderGrid();
  }, [renderGrid]);

  useEffect(() => {
    scrollTopRef.current = scrollTop;
  }, [scrollTop]);

  const handleScroll = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gap = 4;
    const cols = Math.max(1, Math.floor(canvas.width / (THUMB_PX + gap)));
    const totalRows = Math.ceil(chunks.length / cols);
    const maxScroll = Math.max(0, totalRows * (THUMB_PX + gap) - canvas.height);
    setScrollTop((prev) => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
  }, [chunks.length]);

  const chunkIndexAt = useCallback((e: React.MouseEvent): number => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTopRef.current;
    const gap = 4;
    const cols = Math.max(1, Math.floor(canvas.width / (THUMB_PX + gap)));
    const col = Math.floor(x / (THUMB_PX + gap));
    const row = Math.floor(y / (THUMB_PX + gap));
    const idx = row * cols + col;
    return idx >= 0 && idx < chunks.length ? idx : -1;
  }, [chunks]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const idx = chunkIndexAt(e);
    if (idx >= 0) {
      useEditorStore.getState().setSelectedChunkId(chunks[idx].id);
    }
  }, [chunks, chunkIndexAt]);

  // Double-click: open the chunk as a composer document in Art mode.
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const idx = chunkIndexAt(e);
    if (idx < 0) return;
    const chunk = chunks[idx];
    if (!openDocumentGuarded({
      doc: docFromChunk(chunk),
      liveTileIndex: null,
      chunkId: chunk.id,
      name: chunk.name,
      dirty: false,
    })) return;
    useEditorStore.getState().setAppMode('art');
  }, [chunks, chunkIndexAt]);

  const handleImport = useCallback(async () => {
    try {
      setImporting(true);

      const chunkPath = await window.api.selectFile(
        'Select 128x128 chunk mappings (Kosinski)',
        [{ name: 'Binary', extensions: ['bin'] }],
      );
      if (!chunkPath) { setImporting(false); return; }

      const blockPath = await window.api.selectFile(
        'Select 16x16 block mappings (Kosinski)',
        [{ name: 'Binary', extensions: ['bin'] }],
      );
      if (!blockPath) { setImporting(false); return; }

      const artPath = await window.api.selectFile(
        'Select zone art tiles (Kosinski)',
        [{ name: 'Binary', extensions: ['bin'] }],
      );
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

      // Invalidation: addChunks replaces the project object, which retriggers
      // MapViewport's reload effect — that is what re-prerenders the grown atlas.
      useProjectStore.getState().addChunks(imported);
      useEditorStore.getState().markDirty();

      if (imported.length > 0) {
        useEditorStore.getState().setSelectedChunkId(imported[0].id);
      }

      thumbCacheKey = null;
      setScrollTop(0);
      useToastStore.getState().addToast(`Imported ${imported.length} chunks -- Save to keep`, 'success');
    } catch (err) {
      useProjectStore.getState().setError(
        `Chunk import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      useToastStore.getState().addToast('Chunk import failed', 'error');
    } finally {
      setImporting(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    useProjectStore.getState().clearChunks();
    useEditorStore.getState().markDirty();
    thumbCacheKey = null;
    thumbCache = [];
    setScrollTop(0);
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
          {selectedName && (
            <div style={styles.selectionInfo}>
              <span style={styles.selectedBadge}>{selectedName}</span>
              <span style={styles.hint}>Click map to stamp · dbl-click to edit</span>
            </div>
          )}
          <div
            ref={containerRef}
            style={styles.canvasWrap}
            onWheel={handleScroll}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
          >
            <canvas ref={canvasRef} style={styles.canvas} />
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
    padding: '4px 8px', borderBottom: `1px solid ${T.border}`,
    flexShrink: 0,
  },
  label: {
    fontSize: 11, fontWeight: 600, color: T.textBase,
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  headerBtn: {
    padding: '2px 8px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: 3, cursor: 'pointer',
    fontSize: 10,
  },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
  },
  canvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    imageRendering: 'pixelated' as const,
  },
  selectionInfo: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', borderBottom: `1px solid ${T.border}`,
    flexShrink: 0,
  },
  selectedBadge: {
    fontSize: 10, fontWeight: 600, color: T.surface, background: T.success,
    padding: '0 5px', borderRadius: 3, lineHeight: '16px',
  },
  empty: {
    padding: '12px 8px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, color: T.textLo, fontSize: 11,
  },
  hint: {
    fontSize: 9, color: T.borderStrong, textAlign: 'center' as const,
  },
};
