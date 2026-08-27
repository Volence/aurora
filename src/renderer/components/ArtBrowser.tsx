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
  tileThumbCacheStale, tilePickerBandGroups, tilePickerBandLabel,
  type TileThumbCacheKey, type TilePickerBandGroup, type TilePickerSource,
} from '../providers/tile-picker-source';
import {
  publishStripDrag, resolveStripDrag, stripDragHint, stripDragLabel,
} from '../providers/band-strip-range';
import { bandBudget } from '../providers/bg-anim-aeon';
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
  // The slot under the PRESS, or -1 for "no gesture in flight". The press only
  // RECORDS; the release decides (ROADMAP item 43 wave 2) — the same
  // press-records / release-commits shape `MapViewport.commitBandMark` uses.
  const dragAnchorRef = useRef(-1);
  // The picker's resolved source, kept fresh for the release handler. The
  // handlers are `useCallback`s that must NOT re-create on every source
  // identity, and a stale closure here would gate the drag on the layer the
  // author WAS on — see `resolveStripDrag`'s gate.
  const sourceRef = useRef<TilePickerSource | null>(null);

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
  // THE ANIMATED PREFIX BY BAND (parcel J). One card per band, its phase-0
  // pattern as one picture; picking a card arms `stamp-band` with that band.
  // Derived from the SAME source as the grid, so a card can never show a band
  // the stroke would not find.
  const bandGroups = tilePickerBandGroups(source, state.project?.bgOverride ?? null);
  sourceRef.current = source;
  const selectedBgBand = useEditorStore((s) => s.selectedBgBand);
  const tool = useEditorStore((s) => s.tool);

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
      // The strip drag's `title` belongs to the message it wrote; a move onto a
      // new tile replaces the message, so the tooltip goes with it.
      hoverLabelRef.current.title = '';
    }
  }, [itemSize, itemCount, source]);

  /** The strip cell under a pointer event, or -1 when it is past the end. */
  const slotAtEvent = useCallback((e: React.MouseEvent): number => {
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
  }, [itemSize, itemCount]);

  /**
   * THE PRESS ONLY RECORDS (ROADMAP item 43 wave 2). It never picks, never arms
   * a tool and never touches the candidate — taking the decision here would make
   * every drag commit its anchor before the author had finished choosing the far
   * end, which is the same reason `MapViewport`'s mark commits at mouseup.
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragAnchorRef.current = slotAtEvent(e);
  }, [slotAtEvent]);

  /**
   * THE RELEASE DECIDES, and `resolveStripDrag` is what decides — this function
   * supplies state and applies the answer, and holds no rule of its own.
   *
   * Two outcomes, and the boundary between them is the whole point of wave 2:
   *
   *  • `pick` — a press and release on ONE slot, or a strip that is not this
   *    document's blob. EXACTLY today's behaviour: the layer's picked tile moves
   *    and `paint-tile` arms. Nothing about a plain click changed.
   *  • `range` — a run across the slot axis. It sets the promotion CANDIDATE and
   *    must leave `selectedBgTileIndex` and the tool alone: a drag is aiming a
   *    band, not choosing a brush, and silently re-arming paint would put the
   *    author one click away from a stroke they did not ask for.
   *
   * `refused` changes nothing at all and SAYS SO on the hover line. An unclear
   * refusal is worse than a loud one.
   */
  const handleClick = useCallback((e: React.MouseEvent) => {
    const anchor = dragAnchorRef.current;
    dragAnchorRef.current = -1;
    const idx = slotAtEvent(e);
    if (idx < 0) return;

    // The gesture surface only exists once a press was seen on this strip; a
    // click arriving without one (a synthetic `.click()`, say) is a plain pick.
    const src = sourceRef.current;
    const ed = useEditorStore.getState();
    const doc = useProjectStore.getState().project?.bgOverride?.doc ?? null;
    const outcome = resolveStripDrag({
      layer: src?.layer ?? 'fg',
      origin: src?.origin ?? 'none',
      anchorSlot: anchor >= 0 ? anchor : idx,
      releaseSlot: idx,
      rows: ed.bandCandidate.rows,
      // The budget's own walk, never a second copy of it — `markFromLayoutWord`
      // clamps a click-seeded base to exactly this value.
      firstPromotableSlot: bandBudget(doc).firstPromotableSlot,
      blobTileCount: src?.tiles.length ?? 0,
    });
    publishStripDrag({ anchorSlot: anchor >= 0 ? anchor : idx, releaseSlot: idx }, outcome);

    if (outcome.kind === 'pick') {
      // Into the pick for THIS layer. The two indices name different arrays, so
      // one shared value would carry a foreground index into a background stroke
      // (editorStore.selectedBgTileIndex has the full reasoning).
      ed.setSelectedTileIndexForLayer(editingLayer, idx);
      ed.setTool('paint-tile');
      return;
    }
    if (outcome.kind === 'range') {
      // ONE store write, and it goes through `setBandCandidate` — which also
      // points `bandLensTarget` at the candidate, so the map lights the
      // footprint of this range the moment the button comes up. NO DOCUMENT
      // WRITE: the only writers in this arc are still promoteBandCommand /
      // addBandCommand.
      ed.setBandCandidate({ staticBase: outcome.staticBase, cols: outcome.cols });
    }
    // `range` and `refused` both report on the picker's own hover line — the
    // strip has no other surface, and the candidate they aim lives two panels
    // away in a section that arrives collapsed. The SHORT form goes on the line
    // and the full reasoning into `title`: a readout long enough to wrap grew
    // the header row and moved the tile grid out from under the cursor (see
    // `stripDragLabel`, and the harness row that caught it).
    if (hoverLabelRef.current) {
      hoverLabelRef.current.textContent = stripDragLabel(outcome);
      hoverLabelRef.current.title = stripDragHint(outcome);
    }
  }, [slotAtEvent, editingLayer]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = -1;
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
    if (hoverLabelRef.current) {
      hoverLabelRef.current.textContent = '';
      hoverLabelRef.current.title = '';
    }
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
    // Taller when the band cards are showing, so the grid under them keeps
    // the room it has today.
    <div style={{ ...styles.container, height: bandGroups.length > 0 ? 270 : 180 }}>
      <div style={styles.tabs}>
        <span style={styles.label}>
          {tilePickerCountLabel(source)}
        </span>
        {/* id: the strip drag (item 43 wave 2) reports on THIS line — it is the
            only surface the strip has — and the CDP harness reads it here. */}
        <span id="art-browser-hover-label" ref={hoverLabelRef} style={styles.hoverLabel} />
      </div>
      {bandGroups.length > 0 && (
        // id: the CDP harness finds the cards here and clicks one to arm the
        // stamp the way an author would.
        <div id="art-browser-bands" style={styles.bandRow}>
          {bandGroups.map((g) => (
            <BandCard
              key={g.index}
              group={g}
              tiles={tiles}
              selected={tool === 'stamp-band' && selectedBgBand === g.index}
              onPick={() => {
                useEditorStore.getState().setSelectedBgBand(g.index);
                useEditorStore.getState().setTool('stamp-band');
              }}
              onHover={(on) => {
                if (hoverLabelRef.current) {
                  hoverLabelRef.current.textContent = on ? tilePickerBandLabel(g) : '';
                }
              }}
            />
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        style={styles.canvasWrap}
        onWheel={handleScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
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

/**
 * One band of the prefix as a picture: the `cols x rows` phase-0 pattern drawn
 * from the picker's own thumbnail cache, at the grid's 2x. Selectable as a
 * unit — this is the card the stamp is armed from.
 */
function BandCard({ group, tiles, selected, onPick, onHover }: {
  group: TilePickerBandGroup;
  tiles: readonly Tile[];
  selected: boolean;
  onPick: () => void;
  onHover: (on: boolean) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = group.cols * 8;
    c.height = group.rows * 8;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = CANVAS_VOID;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < group.rows; r++) {
      for (let col = 0; col < group.cols; col++) {
        const slot = group.slots[r * group.cols + col];
        const thumb = tileCache[slot];
        if (thumb) ctx.drawImage(thumb, col * 8, r * 8, 8, 8);
      }
    }
    // `tiles` is the cache's identity key: a rebuilt array is new art.
  }, [group, tiles]);
  return (
    <div
      className="art-browser-band"
      data-band={group.index}
      title={tilePickerBandLabel(group)}
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        ...styles.bandCard,
        outline: selected ? `2px solid ${TILE_SELECTED}` : `1px solid ${T.border}`,
      }}
    >
      <canvas
        ref={ref}
        style={{ width: group.cols * 16, height: group.rows * 16, imageRendering: 'pixelated', display: 'block' }}
      />
      <span style={styles.bandLabel}>{group.label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bandRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 8px',
    borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  bandCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: 2, cursor: 'pointer', background: CANVAS_VOID,
  },
  bandLabel: {
    fontSize: T.t2xs, color: T.textLo, fontFamily: T.fontMono,
  },
  container: {
    display: 'flex', flexDirection: 'column',
    background: T.surface, borderTop: `1px solid ${T.border}`,
    height: 180, flexShrink: 0,
  },
  // ⚠ ONE LINE, AND IT MAY NOT GROW. The row below it is the tile grid, and this
  // row growing pushes that grid DOWN UNDER THE CURSOR — measured at 36px when
  // the strip-drag readout wrapped to three lines, which put the next press two
  // slots off and let the band cards slide under the pointer and erase the
  // message. `nowrap` here plus the ellipsis on `hoverLabel` means no message
  // length can reach the layout. (ROADMAP item 43 wave 2; harness row [6h].)
  tabs: {
    display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap',
    borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflow: 'hidden',
  },
  // A COUNT, not a heading. This panel is always mounted inside a
  // CollapsibleSection that names it (layout-facet.tsx: "Art"), and in heading
  // type this row read as a second, disagreeing title stacked under the first —
  // the same doubling ChunkGrid's countLabel fixed.
  label: {
    padding: '6px 12px', fontSize: T.t2xs, color: T.textLo, flexShrink: 0,
  },
  // The readout truncates rather than wrapping — see `tabs`. The full text is
  // always on the element's `title`, so nothing is lost to the ellipsis.
  hoverLabel: {
    marginLeft: 'auto', padding: '0 12px',
    fontSize: T.tXs, fontFamily: T.fontMono, color: T.accent,
    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
