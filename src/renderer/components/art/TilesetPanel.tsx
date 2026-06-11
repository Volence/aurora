import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useProjectStore, getCurrentZone, getCurrentAct, getActiveLevel } from '../../state/projectStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useArtStore } from '../../state/artStore';
import { openDocumentGuarded } from './open-document';
import { useToastStore } from '../../state/toastStore';
import { docFromTile, sliceForSave } from '../../../core/art/composer-buffer';
import { tileUsageCounts } from '../../../core/art/usage';
import { unpackNametableWord } from '../../../core/model/s4-types';
import type { Tile, Palette } from '../../../core/model/s4-types';

// Pre-rendered tile thumbnail cache (separate from ArtBrowser's — that one
// stays for Map mode). Keyed on zone/palette-line/history so in-place atlas
// edits rebuild the thumbnails.
let tileCache: OffscreenCanvas[] = [];
let cacheKey = '';

function ensureTileCache(tiles: Tile[], palette: Palette, key: string) {
  if (cacheKey === key && tileCache.length === tiles.length) return;
  cacheKey = key;

  const palLine = Number(key.split('|')[1]);
  const pal = palette.lines[palLine]?.colors ?? palette.lines[0]?.colors ?? [];

  tileCache = tiles.map((tile) => {
    const c = new OffscreenCanvas(8, 8);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(8, 8);
    for (let i = 0; i < 64; i++) {
      const color = pal[tile.pixels[i]] ?? { r: 0, g: 0, b: 0, a: 255 };
      img.data[i * 4] = color.r;
      img.data[i * 4 + 1] = color.g;
      img.data[i * 4 + 2] = color.b;
      img.data[i * 4 + 3] = color.a;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export default function TilesetPanel() {
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const currentActId = useProjectStore((s) => s.currentActId);
  const historyVersion = useEditorStore((s) => s.historyVersion);
  const brushTile = useArtStore((s) => s.brushTile);
  const setBrushTile = useArtStore((s) => s.setBrushTile);
  const paletteLine = useArtStore((s) => s.paletteLine);
  const open = useArtStore((s) => s.open);
  const openDocument = useArtStore((s) => s.openDocument);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLSpanElement>(null);
  const scrollTopRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const hoveredRef = useRef(-1);

  const itemSize = 16; // Tile displayed at 2x

  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const tiles = zone?.tileset.tiles ?? [];
  const palette = zone?.palette ?? { lines: [] };
  const itemCount = tiles.length;

  // Usage counts across the current act's sections (recomputed on every edit)
  const usage = useMemo(() => {
    const act = getCurrentAct(useProjectStore.getState());
    return act ? tileUsageCounts(act) : new Map<number, number>();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyVersion, currentActId, currentZoneId]);
  const usageRef = useRef(usage);
  usageRef.current = usage;

  // Build caches when zone, palette line, or tileset content changes
  useEffect(() => {
    if (zone && currentZoneId) {
      ensureTileCache(zone.tileset.tiles, zone.palette,
        `${currentZoneId}|${paletteLine}|${historyVersion}`);
    }
  }, [zone, currentZoneId, paletteLine, historyVersion]);

  // Draw the tile grid
  const renderGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !zone) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cols = Math.max(1, Math.floor(canvas.width / (itemSize + 2)));
    const totalRows = Math.ceil(itemCount / cols);
    const startRow = Math.floor(scrollTop / (itemSize + 2));
    const visibleRows = Math.ceil(canvas.height / (itemSize + 2)) + 1;

    for (let row = startRow; row < Math.min(startRow + visibleRows, totalRows); row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        if (idx >= itemCount || idx >= tileCache.length) break;

        const x = col * (itemSize + 2);
        const y = row * (itemSize + 2) - scrollTop;
        ctx.drawImage(tileCache[idx], x, y, itemSize, itemSize);
      }
    }

    // Highlight the current brush tile
    const selectedCol = brushTile % cols;
    const selectedRow = Math.floor(brushTile / cols);
    const sx = selectedCol * (itemSize + 2);
    const sy = selectedRow * (itemSize + 2) - scrollTop;
    if (sy > -itemSize && sy < canvas.height) {
      ctx.strokeStyle = '#a6e3a1';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, itemSize, itemSize);
    }

    // Also resize overlay to match
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = rect.width;
      overlay.height = rect.height;
    }
  }, [zone, scrollTop, itemSize, itemCount, brushTile, paletteLine, historyVersion]);

  useEffect(() => {
    renderGrid();
  }, [renderGrid]);

  const handleScroll = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cols = Math.max(1, Math.floor(canvas.width / (itemSize + 2)));
    const totalRows = Math.ceil(itemCount / cols);
    const maxScroll = Math.max(0, totalRows * (itemSize + 2) - canvas.height);
    setScrollTop((prev) => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
  }, [itemSize, itemCount]);

  function tileIndexAt(e: React.MouseEvent): number {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTopRef.current;
    const cols = Math.max(1, Math.floor(canvas.width / (itemSize + 2)));
    const col = Math.floor(x / (itemSize + 2));
    const row = Math.floor(y / (itemSize + 2));
    const idx = row * cols + col;
    return idx >= 0 && idx < itemCount ? idx : -1;
  }

  // Hover: only redraws the lightweight overlay canvas
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTopRef.current;
    const cols = Math.max(1, Math.floor(canvas.width / (itemSize + 2)));
    const col = Math.floor(x / (itemSize + 2));
    const row = Math.floor(y / (itemSize + 2));
    const idx = row * cols + col;
    const newIdx = idx < itemCount ? idx : -1;

    if (newIdx === hoveredRef.current) return;
    hoveredRef.current = newIdx;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (newIdx >= 0) {
      const drawCol = newIdx % cols;
      const drawRow = Math.floor(newIdx / cols);
      const dx = drawCol * (itemSize + 2);
      const dy = drawRow * (itemSize + 2) - scrollTopRef.current;
      ctx.strokeStyle = '#89b4fa';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, itemSize, itemSize);
    }

    if (hoverLabelRef.current) {
      hoverLabelRef.current.textContent = newIdx >= 0
        ? `#${newIdx} (0x${newIdx.toString(16).toUpperCase()}) — used ${usageRef.current.get(newIdx) ?? 0}× in this act`
        : '';
    }
  }, [itemSize, itemCount]);

  // Single click: select as the tile-stamp brush (selectedColor untouched)
  const handleClick = useCallback((e: React.MouseEvent) => {
    const idx = tileIndexAt(e);
    if (idx >= 0) setBrushTile(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSize, itemCount, setBrushTile]);

  // Double click: open the tile for live in-place editing
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const idx = tileIndexAt(e);
    if (idx < 0) return;
    openDocumentGuarded({
      doc: docFromTile(idx),
      liveTileIndex: idx,
      chunkId: null,
      name: `tile #${idx}`,
      dirty: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSize, itemCount]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = -1;
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    if (hoverLabelRef.current) hoverLabelRef.current.textContent = '';
  }, []);

  // Keep scrollTopRef in sync
  useEffect(() => {
    scrollTopRef.current = scrollTop;
  }, [scrollTop]);

  // ---------- header actions ----------

  /** Duplicate the open live tile to a fresh atlas slot and edit that instead. */
  function handleDuplicate() {
    const o = useArtStore.getState().open;
    const pstate = useProjectStore.getState();
    const z = getCurrentZone(pstate);
    const level = getActiveLevel(pstate);
    if (!o || o.liveTileIndex === null || !z || !level) return;
    const atlas = z.tileset.tiles;
    if (atlas.length + 1 > 0x800) {
      useToastStore.getState().addToast('Tileset full (2048 tiles) — cannot duplicate', 'error');
      return;
    }
    const src = atlas[o.liveTileIndex];
    if (!src) return;
    const newIdx = atlas.length;
    executeCommand({
      type: 'set-tileset-tiles',
      description: `art: duplicate tile #${o.liveTileIndex}`,
      sectionIndex: -1,
      at: newIdx,
      oldTiles: [null],
      newTiles: [{ pixels: new Uint8Array(src.pixels) }],
    }, level);
    // Duplicate always replaces the current doc (it IS the current doc's copy),
    // so we call openDocument directly — no dirty-doc guard needed here.
    openDocument({
      doc: docFromTile(newIdx),
      liveTileIndex: newIdx,
      chunkId: null,
      name: `tile #${newIdx}`,
      dirty: false,
    });
    useToastStore.getState().addToast(`Duplicated to tile #${newIdx}`, 'success');
  }

  /** Save a new 1×1 doc's local pixels into the atlas (flip-aware dedup). */
  function handleAddToTileset() {
    const o = useArtStore.getState().open;
    const pstate = useProjectStore.getState();
    const z = getCurrentZone(pstate);
    const level = getActiveLevel(pstate);
    if (!o || !z || !level) return;
    const atlas = z.tileset.tiles;

    let result;
    try {
      result = sliceForSave(o.doc, atlas);
    } catch (err) {
      useToastStore.getState().addToast(String(err instanceof Error ? err.message : err), 'error');
      return;
    }
    if (atlas.length + result.newTiles.length > 0x800) {
      useToastStore.getState().addToast('Tileset full (2048 tiles) — cannot add', 'error');
      return;
    }

    const entry = unpackNametableWord(result.nametable[0]);
    const tileIdx = entry.tileIndex;
    if (result.newTiles.length > 0) {
      executeCommand({
        type: 'set-tileset-tiles',
        description: `art: add tile #${tileIdx}`,
        sectionIndex: -1,
        at: atlas.length,
        oldTiles: result.newTiles.map(() => null),
        newTiles: result.newTiles,
      }, level);
      useToastStore.getState().addToast(`Added tile #${tileIdx} to tileset`, 'success');
    } else if (entry.hFlip || entry.vFlip) {
      // Dedup matched only after flipping — say so, since the art won't look
      // identical to what was drawn.
      useToastStore.getState().addToast(`Matches existing tile #${tileIdx} (flipped) — opened it`, 'info');
    } else {
      useToastStore.getState().addToast(`Identical tile already exists — opened #${tileIdx}`, 'info');
    }
    // Add-to-tileset resolves the new doc to a live atlas tile — never dirty at
    // this point, so openDocument directly (no guard needed).
    openDocument({
      doc: docFromTile(tileIdx),
      liveTileIndex: tileIdx,
      chunkId: null,
      name: `tile #${tileIdx}`,
      dirty: false,
    });
  }

  const liveTileOpen = open !== null && open.liveTileIndex !== null;
  const canAddToTileset = open !== null
    && open.liveTileIndex === null
    && open.chunkId === null
    && open.doc.widthTiles === 1
    && open.doc.heightTiles === 1
    && open.doc.cells[0].localId !== null;

  if (!zone) {
    return (
      <div style={styles.container}>
        <div style={styles.tabs}>
          <span style={styles.label}>Tileset</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        <span style={styles.label}>
          Tiles ({itemCount})
        </span>
        <span ref={hoverLabelRef} style={styles.hoverLabel} />
      </div>

      {(liveTileOpen || canAddToTileset) && (
        <div style={styles.headerActions}>
          {liveTileOpen && open && (
            <>
              <span style={styles.liveInfo}>
                tile #{open.liveTileIndex} — used {usage.get(open.liveTileIndex!) ?? 0}× in this act
              </span>
              <button style={styles.actionButton} onClick={handleDuplicate}
                title="Copy this tile to a new atlas slot and edit the copy (map keeps the original)">
                Duplicate instead
              </button>
            </>
          )}
          {canAddToTileset && (
            <button style={styles.actionButton} onClick={handleAddToTileset}
              title="Save this new tile into the zone tileset">
              Add to tileset
            </button>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        style={styles.canvasWrap}
        onWheel={handleScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <canvas ref={canvasRef} style={styles.canvas} />
        <canvas ref={overlayRef} style={styles.overlay} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    background: '#1e1e2e',
    height: 280, flexShrink: 0,
    borderBottom: '1px solid #313244',
  },
  tabs: {
    display: 'flex', alignItems: 'center', gap: 0,
    borderBottom: '1px solid #313244', flexShrink: 0,
  },
  label: {
    padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#a6adc8',
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  hoverLabel: {
    marginLeft: 'auto', padding: '0 8px',
    fontSize: 10, fontFamily: 'monospace', color: '#89b4fa',
    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
  },
  headerActions: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 6,
    padding: '4px 8px',
    borderBottom: '1px solid #313244', flexShrink: 0,
    background: '#181825',
  },
  liveInfo: {
    fontSize: 10, fontFamily: 'monospace', color: '#f9e2af',
  },
  actionButton: {
    padding: '2px 8px',
    background: '#313244', color: '#cdd6f4',
    border: '1px solid #45475a', borderRadius: 4,
    cursor: 'pointer', fontSize: 10,
  },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
  },
  canvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    imageRendering: 'pixelated' as const,
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    pointerEvents: 'none',
  },
};
