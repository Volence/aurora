// THE TILE PICKER. What it shows depends on the layer being painted: the zone
// TILESET in FG, and the RESOLVED background blob in BG (ROADMAP item 47) — the
// same array `MapViewport.paintBgTile` writes an index into, so the art an
// author picks from is the art the stroke puts down.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore, getCurrentZone, getCurrentAct } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import type { Tile, Palette } from '../../core/model/s4-types';
import { lutForPaletteLine, rasterizeTile } from '../../core/art/rasterize';
import {
  resolveTilePickerSource, tilePickerCountLabel, tilePickerHoverLabel, pickedTileIndex,
  tileThumbCacheStale, type TileThumbCacheKey,
} from '../providers/tile-picker-source';
import { T } from './ui';
import { CANVAS_VOID, TILE_SELECTED, TILE_HOVER } from '../canvas/canvas-colors';

// Pre-rendered tile thumbnail cache.
//
// KEYED ON THE ARRAY'S OWN IDENTITY plus the palette line — the derivation, and
// what the old `(zoneId, paletteLine, tiles.length)` key could not tell apart,
// are written out in full at `tileThumbCacheStale`. The rule lives there rather
// than here because the node suite cannot see a `.tsx` file.
let tileCache: OffscreenCanvas[] = [];
const cacheKey: TileThumbCacheKey = { tiles: null, paletteLine: -1 };

function ensureTileCache(tiles: readonly Tile[], palette: Palette, paletteLine: number) {
  if (!tileThumbCacheStale(cacheKey, tiles, paletteLine)) return;
  cacheKey.tiles = tiles;
  cacheKey.paletteLine = paletteLine;

  // One RGBA lookup for the whole atlas; pixels come from the shared core
  // rasterizer, this loop only owns the canvas hand-off.
  const lut = lutForPaletteLine(palette, paletteLine);

  tileCache = tiles.map((tile) => {
    const c = new OffscreenCanvas(8, 8);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(8, 8);
    img.data.set(rasterizeTile(tile.pixels, lut));
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

export default function ArtBrowser() {
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  // Subscribed, not read from getState: the picker's ART changes with the layer
  // and with the active section (a BG-library ref is per section), so both have
  // to re-render this component, not merely be true the next time something else
  // does.
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const selectedFgTileIndex = useEditorStore((s) => s.selectedTileIndex);
  const selectedBgTileIndex = useEditorStore((s) => s.selectedBgTileIndex);
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
  const act = getCurrentAct(state);
  // THE ONE RESOLUTION. In BG mode this goes through `resolveDisplayedBg` — the
  // same call `MapViewport.reloadBg` and `paintBgTile` make — so the picker and
  // the stroke cannot name different arrays.
  const source = resolveTilePickerSource(
    editingLayer, zone, act, state.project?.bgLibrary ?? [], activeSectionIndex,
    state.project?.bgOverride ?? null,
  );
  const tiles = source.tiles;
  // The BG canvas is rendered with the ZONE palette (MapViewport hands
  // `zone.palette.lines` to `SectionRenderer.loadBg`), so the picker's colours
  // come from the same place in both layers and only the ART differs.
  const palette = zone?.palette ?? { lines: [] };
  const itemCount = tiles.length;
  const selectedTileIndex = pickedTileIndex(
    { selectedTileIndex: selectedFgTileIndex, selectedBgTileIndex }, editingLayer,
  );

  // Build caches when the array being shown, or the palette line, changes.
  useEffect(() => {
    if (zone) ensureTileCache(tiles, zone.palette, selectedPaletteLine);
  }, [zone, tiles, selectedPaletteLine]);

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
    ctx.fillStyle = CANVAS_VOID;
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
      ctx.strokeStyle = TILE_SELECTED;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, itemSize, itemSize);
    }

    // Also resize overlay to match
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = rect.width;
      overlay.height = rect.height;
    }
    // `tiles` is a dep in its own right, not covered by `itemCount`: two arrays
    // of EQUAL length are different art, and keying the repaint on the length
    // alone would leave the previous layer's thumbnails on screen whenever the
    // counts happened to agree — the same mistake the old cache key made.
  }, [zone, tiles, scrollTop, itemSize, itemCount, selectedTileIndex, selectedPaletteLine]);

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
      ctx.strokeStyle = TILE_HOVER;
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, itemSize, itemSize);
    }

    if (hoverLabelRef.current) {
      // Labelled in the space the index actually lives in — a blob-local slot in
      // BG, a zone tile index in FG.
      hoverLabelRef.current.textContent = tilePickerHoverLabel(source, newIdx);
    }
  }, [itemSize, itemCount, source]);

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
      // Into the pick for THIS layer. The two indices name different arrays, so
      // one shared value would carry a foreground index into a background stroke
      // (editorStore.selectedBgTileIndex has the full reasoning).
      useEditorStore.getState().setSelectedTileIndexForLayer(editingLayer, idx);
      useEditorStore.getState().setTool('paint-tile');
    }
  }, [itemSize, itemCount, editingLayer]);

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
          <span style={styles.label}>no zone open</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        <span style={styles.label}>
          {tilePickerCountLabel(source)}
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
        {/* id: the CDP harness reads THESE pixels rather than asking the
            component what it thinks it is showing (scratchpad/bg-tile-picker-harness.mjs). */}
        <canvas id="art-browser-canvas" ref={canvasRef} style={styles.canvas} />
        <canvas ref={overlayRef} style={styles.overlay} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column',
    background: T.surface, borderTop: `1px solid ${T.border}`,
    height: 180, flexShrink: 0,
  },
  tabs: {
    display: 'flex', alignItems: 'center', gap: 0,
    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  // A COUNT, not a heading. This panel is always mounted inside a
  // CollapsibleSection that names it (layout-facet.tsx: "Art"), and in heading
  // type this row read as a second, disagreeing title stacked under the first —
  // the same doubling ChunkGrid's countLabel fixed.
  label: {
    padding: '6px 12px', fontSize: T.t2xs, color: T.textLo,
  },
  hoverLabel: {
    marginLeft: 'auto', padding: '0 12px',
    fontSize: T.tXs, fontFamily: T.fontMono, color: T.accent,
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
