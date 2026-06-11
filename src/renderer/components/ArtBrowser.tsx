import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import type { Tile, Palette } from '../../core/model/s4-types';

// Pre-rendered tile thumbnail caches
let tileCache: OffscreenCanvas[] = [];
let cacheZoneId: string | null = null;
let cachePalLine: number = -1;

function ensureTileCache(tiles: Tile[], palette: Palette, zoneId: string, paletteLine: number) {
  if (cacheZoneId === zoneId && cachePalLine === paletteLine && tileCache.length === tiles.length) return;
  cacheZoneId = zoneId;
  cachePalLine = paletteLine;

  const pal = palette.lines[paletteLine]?.colors ?? palette.lines[0]?.colors ?? [];

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

export default function ArtBrowser() {
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const selectedTileIndex = useEditorStore((s) => s.selectedTileIndex);
  const selectedPaletteLine = useEditorStore((s) => s.selectedPaletteLine);
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

  // Build caches when zone or palette line changes
  useEffect(() => {
    if (zone && currentZoneId) {
      ensureTileCache(zone.tileset.tiles, zone.palette, currentZoneId, selectedPaletteLine);
    }
  }, [zone, currentZoneId, selectedPaletteLine]);

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

    // Highlight selected tile
    const selectedCol = selectedTileIndex % cols;
    const selectedRow = Math.floor(selectedTileIndex / cols);
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
  }, [zone, scrollTop, itemSize, itemCount, selectedTileIndex, selectedPaletteLine]);

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
        ? `#${newIdx} (0x${newIdx.toString(16).toUpperCase()})`
        : '';
    }
  }, [itemSize, itemCount]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + scrollTopRef.current;
    const cols = Math.max(1, Math.floor(canvas.width / (itemSize + 2)));
    const col = Math.floor(x / (itemSize + 2));
    const row = Math.floor(y / (itemSize + 2));
    const idx = row * cols + col;
    if (idx >= 0 && idx < itemCount) {
      useEditorStore.getState().setSelectedTileIndex(idx);
      useEditorStore.getState().setTool('paint-tile');
    }
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

  if (!zone) {
    return (
      <div style={styles.container}>
        <div style={styles.tabs}>
          <span style={styles.label}>Tile Browser</span>
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
      <div
        ref={containerRef}
        style={styles.canvasWrap}
        onWheel={handleScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
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
    background: '#1e1e2e', borderTop: '1px solid #313244',
    height: 180, flexShrink: 0,
  },
  tabs: {
    display: 'flex', alignItems: 'center', gap: 0,
    borderBottom: '1px solid #313244', flexShrink: 0,
  },
  label: {
    padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#a6adc8',
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  hoverLabel: {
    marginLeft: 'auto', padding: '0 12px',
    fontSize: 11, fontFamily: 'monospace', color: '#89b4fa',
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
