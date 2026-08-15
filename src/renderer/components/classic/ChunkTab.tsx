import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Chip, Divider, T } from '../ui';
import {
  useClassicLevelStore, classicEditChunkCells, classicAddChunk, classicPaintSurface,
} from '../../state/classicLevelStore';
import { useArtStore } from '../../state/artStore';
import { useToastStore } from '../../state/toastStore';
import { renderChunk, renderBlock } from '../../../core/level-classic/render';
import { chunkIndexForId, packChunkCell, type LevelDoc } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import { isTileEditable } from '../../../core/project/editable-tiles';
import { PixelEditController, diffWrites } from '../../../core/art/pixel-edit-controller';
import type { GestureResult, Selection } from '../../../core/art/pixel-edit-controller';
import { toolConfigFrom } from '../../../core/art/tool-config';
import { buildChunkSurface, type Surface } from '../../../core/art/classic-surface-buffer';
import { planSurfaceEdit, type SurfaceWrite } from '../../../core/art/classic-surface-plan';
import PixelViewport from '../art-shared/PixelViewport';
import { useAnchoredZoom } from '../art-shared/use-anchored-zoom';
import { useHandPan } from '../art-shared/use-hand-pan';
import { cappedZoom } from '../art-shared/zoom-cap';
import { canvasCellIndexAt, fitCellSize } from './composer-math';
import { BlockThumb } from './composer-thumbs';
import { STAMP_PREVIEW_STROKE, COMPOSER_CHECK_RGB } from '../../canvas/canvas-colors';
import {
  hex, SOLIDITY, SharedBanner, useEditableTileRange, useEscapeKey, useEscapeCancel, useWindowStrokeEnd,
  drawBufferScaled, canvasGeom, useBoxSize, styles,
} from './composer-shared';
import { levelKeysEnabled } from '../../workspace/level-keys';

// Chunk tab — 16x16 block-grid editor for the selected chunk, with a second mode
// (Task 11, "decided" — see the plan doc's final section, "Task 11, decided —
// paint is an explicit per-tier mode, not an armed tool"). Assign is the
// default and unchanged: pick block + flips + solidity; one classicEditChunkCells
// per gesture. Paint composes the chunk into ONE pixel surface (buildChunkSurface)
// and mounts the shared pixel substrate (PixelViewport + PixelEditController),
// exactly as TileTab does — strokes resolve down the tile→block→chunk reference
// ladder via planSurfaceEdit, and commit as one classicPaintSurface undo entry.
// Duplicate / new-blank grow the pool (≤ $7F). Right-click (Assign mode only)
// eyedrops a cell's block+flips+solidity.
//
// PAINT NEVER CALLS classicEditTiles. That command mutates a tile in the pool
// unconditionally — no divergence, no reserved-tile guard — which is exactly the
// bug paint-through exists to prevent (a shared tile edited "in place" changes
// every block/chunk that references it, silently). The composed path's only
// write commands are `planSurfaceEdit` (pure planning) → `classicPaintSurface`
// (the one command that applies a plan atomically). See
// __tests__/chunk-paint-mode.test.ts for the standing guard.

/**
 * The cell size is FITTED to the room the layout gives the canvas, not fixed —
 * see `styles.fitBox` for why a bigger CELL and not a bigger CSS box, and what
 * was rejected. 20 was the constant this tab shipped with and is now the floor,
 * so nothing can make the grid smaller than it has always been; 48 is three
 * screen pixels per art pixel and a 768px grid, past which a 16x16 block grid
 * stops gaining anything from being bigger. ASSIGN MODE ONLY — Paint mode zooms
 * through `artStore.zoom` instead, the same cross-engine singleton TileTab uses.
 */
const CHUNK_MIN_CELL = 20;
const CHUNK_MAX_CELL = 48;

/** Chunk cell's block field is 10 bits (model.ts / classic-surface-plan.ts's own
 *  MAX_BLOCK_REF) — the block-pool ceiling the Paint-mode limits readout reports
 *  against. Duplicated rather than imported: neither source exports it (each
 *  treats it as a private implementation constant), so this is the third literal
 *  '0x3ff' in the codebase rather than a fourth import edge for one number. */
const MAX_BLOCK_REF = 0x3ff;

/** The floor on Paint mode's viewport box, in CSS px — see TileTab's identical
 *  `TILE_VIEW_PX` for why this is a layout floor, not a fixed size, and why it
 *  must not be derived from zoom. */
const PAINT_VIEW_PX = 240;
const PAINT_SCROLLER: React.CSSProperties = {
  minWidth: PAINT_VIEW_PX, minHeight: PAINT_VIEW_PX, flex: '1 1 0', overflow: 'auto',
  display: 'flex', background: T.void, borderRadius: 3,
};
const PAINT_HOLDER: React.CSSProperties = { margin: 'auto', padding: 6, lineHeight: 0 };

/** A 1x1 placeholder buffer for the (short) window where Paint mode's hooks are
 *  live but there is no chunk to compose (air, or before the first chunk loads).
 *  Never rendered — the JSX only mounts PixelViewport when `chunkIndex !== null`
 *  — but the hooks above it (zoom/pan) are called unconditionally, so they need
 *  SOMETHING to measure against. */
const EMPTY_PAINT_BUFFER = { width: 1, height: 1, data: new Uint8Array(1) };

export default function ChunkTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const setComposerBlockId = useClassicLevelStore((s) => s.setComposerBlockId);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);
  const chunkPaintMode = useClassicLevelStore((s) => s.chunkPaintMode);
  const setChunkPaintMode = useClassicLevelStore((s) => s.setChunkPaintMode);
  const paintDivergeMode = useClassicLevelStore((s) => s.paintDivergeMode);
  const setPaintDivergeMode = useClassicLevelStore((s) => s.setPaintDivergeMode);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();

  const [brushXf, setBrushXf] = useState(false);
  const [brushYf, setBrushYf] = useState(false);
  const [brushSolidity, setBrushSolidity] = useState(0);
  const [showSolidity, setShowSolidity] = useState(true);
  // See TileTab: the in-progress paint lives in a ref, so this counter is what
  // tells the paint effect the ref moved. It MUST stay in that effect's deps.
  const [strokeVersion, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<Map<number, number> | null>(null); // cell index → packed word
  const chunkIndex = chunkIndexForId(doc, selectedChunkId);
  useEscapeCancel(strokeRef, redraw); // Esc cancels an in-progress ASSIGN-mode chunk paint

  // The canvas is sized to the fit box, which is sized by the layout. A callback
  // ref into state rather than a `useRef`, because the box is not mounted on the
  // air-chunk branch — see useBoxSize's docblock.
  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const fit = useBoxSize(fitEl);
  const cellPx = fitCellSize(fit.w, fit.h, 16, 16, CHUNK_MIN_CELL, CHUNK_MAX_CELL);
  const sizePx = cellPx * 16;

  // ---------------------------------------------------------------------------
  // PAINT MODE — compose the chunk into one pixel surface, and drive it through
  // the shared substrate exactly as TileTab does. Hooks are declared
  // unconditionally (rules of hooks); the JSX below only MOUNTS PixelViewport
  // while chunkPaintMode === 'paint' && chunkIndex !== null.
  // ---------------------------------------------------------------------------

  const surface = useMemo<Surface | null>(
    () => (chunkIndex === null ? null : buildChunkSurface(doc, chunkIndex)),
    // Mirrors the ASSIGN-mode redraw effect's own invalidation clocks below
    // (chunkEpoch bumps for a paint-surface/block/tile commit; chunkVersions for
    // a classicEditChunkCells commit, keyed by ENGINE id) rather than keying on
    // doc.tiles/blocks/chunks directly, which would rebuild the 32x32-cell
    // surface on every edit to every OTHER chunk too — the memoising the plan
    // asked for, reusing the clock this tab already has rather than inventing one.
    [doc, chunkIndex, chunkEpoch, chunkVersions],
  );
  const paintBuffer = surface?.buffer ?? EMPTY_PAINT_BUFFER;

  // A composed surface draws EACH cell through its OWN stored palette line
  // (`SurfaceCell.pal`), unlike TileTab's single 8x8 tile which has one "Line:"
  // picker for the whole canvas — so this builds all four lines plus a per-pixel
  // line map, PixelViewport's multi-palette path (the one aeon's ComposerCanvas
  // already uses for the same reason: level art is never one palette).
  const paletteLines = useMemo(
    () => [0, 1, 2, 3].map((i) => {
      const words = doc.palettes[i] ?? doc.palettes[0] ?? new Uint16Array(16);
      return Array.from({ length: 16 }, (_, k) => decodeGenesisColor(words[k] ?? 0));
    }),
    [doc.palettes],
  );
  const lineMap = useMemo(() => {
    if (!surface) return new Uint8Array(0);
    const { buffer, provenance } = surface;
    const map = new Uint8Array(buffer.width * buffer.height);
    for (let cy = 0; cy < provenance.cellsY; cy++) {
      for (let cx = 0; cx < provenance.cellsX; cx++) {
        const pal = provenance.cells[cy * provenance.cellsX + cx]?.pal ?? 0;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) map[(cy * 8 + py) * buffer.width + (cx * 8 + px)] = pal;
        }
      }
    }
    return map;
  }, [surface]);

  // The drawing config is the ART STORE's — one vocabulary, shared with TileTab
  // and aeon's composer (see TileTab's header for why: `artStore.tool` is a
  // CROSS-ENGINE SINGLETON, and `toolConfigFrom` is the one seam that coerces a
  // stale tile-space tool to 'pencil' rather than handing the controller
  // something it has no case for).
  const paintTool = useArtStore((s) => s.tool);
  const paintColor = useArtStore((s) => s.selectedColor);
  const paintMirror = useArtStore((s) => s.mirror);
  const paintDither = useArtStore((s) => s.ditherPattern);
  const paintDitherSecondary = useArtStore((s) => s.ditherSecondary);
  const paintPixelPerfect = useArtStore((s) => s.pixelPerfect);
  // ZOOM IS THE ART STORE'S TOO — the same cross-engine singleton TileTab uses.
  const paintZoom = useArtStore((s) => s.zoom);

  const paintConfig = toolConfigFrom({
    tool: paintTool, selectedColor: paintColor, mirror: paintMirror,
    ditherPattern: paintDither, ditherSecondary: paintDitherSecondary, pixelPerfect: paintPixelPerfect,
  });
  const paintControllerRef = useRef<PixelEditController | null>(null);
  if (!paintControllerRef.current) paintControllerRef.current = new PixelEditController(paintConfig);
  paintControllerRef.current.setConfig(paintConfig);

  // Capped on the LARGER axis, same rule as TileTab and aeon's composer
  // (`cappedZoom`'s own contract) — a 256x256 chunk surface is nowhere near the
  // 16000px ceiling at zoom 64, but applying the shared rule unconditionally is
  // what keeps every pixel host agreeing with it rather than only happening to.
  const paintEffectiveZoom = cappedZoom(paintZoom, Math.max(paintBuffer.width, paintBuffer.height));
  const paintScrollerRef = useRef<HTMLDivElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useAnchoredZoom(
    paintScrollerRef, paintCanvasRef, paintEffectiveZoom,
    () => useArtStore.getState().zoom, (z) => useArtStore.getState().setZoom(z),
  );
  useHandPan(paintScrollerRef, { enabled: levelKeysEnabled });

  const [paintSelection, setPaintSelection] = useState<Selection | null>(null);
  const paintCancelledRef = useRef(false);
  const [, bumpPaintFrame] = useState(0);
  // A marquee/cancel-flag are scoped to ONE chunk, for the identical reason
  // TileTab's per-tile reset effect is — see its docblock.
  useEffect(() => {
    setPaintSelection(null);
    paintCancelledRef.current = false;
  }, [selectedChunkId]);

  const poolTileCount = Math.floor(doc.tiles.length / 32);
  // The limits readout is APPROXIMATE, for display only. It mirrors
  // `findFreeSlot`'s three conditions (classic-surface-plan.ts: unreferenced,
  // not object-reserved, editable) without importing it — that function is a
  // private implementation detail of the planner, not an exported predicate —
  // so this can only ever be off by the handful of slots a single in-flight
  // gesture claims, never wrong about what an edit is ALLOWED to do:
  // `planSurfaceEdit` remains the sole authority for that, every time.
  const freeTileSlots = useMemo(() => {
    let n = 0;
    for (let t = 1; t < poolTileCount; t++) { // 0 is the transparent tile — never counted free
      if (usage.tileUsage(t).cells !== 0) continue;
      if (reservedTiles?.has(t)) continue;
      if (!isTileEditable(range, t)) continue;
      n++;
    }
    return n;
  }, [poolTileCount, usage, reservedTiles, range]);
  const limitsReadout =
    `blocks ${doc.blocks.length}/${MAX_BLOCK_REF + 1} · tiles ${poolTileCount - freeTileSlots}/${poolTileCount}`;

  // THE ONE WRITE PATH for Paint mode. diffWrites -> planSurfaceEdit ->
  // classicPaintSurface, one call each, in that order — see this file's header
  // and __tests__/chunk-paint-mode.test.ts's standing guard. `classicEditTiles`
  // must never appear on this path: it has no divergence and no reserved-tile
  // guard, so it would silently corrupt shared art and object sprites.
  const commitSurfaceWrites = useCallback((writes: SurfaceWrite[]) => {
    if (!writes.length || !surface || chunkIndex === null) return;
    const planResult = planSurfaceEdit({
      doc, provenance: surface.provenance, index: usage, mode: paintDivergeMode,
      isEditableTile: (t) => isTileEditable(range, t),
      writes,
      reservedTiles: reservedTiles ?? undefined,
    });
    if (!planResult.ok) {
      // These strings were written to be actionable and name the Link-mode
      // escape (classic-surface-plan.ts) — surfaced verbatim, not rewritten here.
      useToastStore.getState().addToast(planResult.reason, 'error');
      return;
    }
    // Nothing may escape this handler — see the identical note on TileTab's
    // commitTileBytes / endStroke below: an uncaught throw out of a pointer
    // handler freezes the window, which is worse than a refused edit.
    let res;
    try {
      res = classicPaintSurface(planResult.plan);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Paint failed: ${res.error}`, 'error');
  }, [doc, surface, chunkIndex, usage, paintDivergeMode, range, reservedTiles]);

  const onPaintCommit = useCallback((result: GestureResult) => {
    if (paintCancelledRef.current) { paintCancelledRef.current = false; return; }
    if (result.selection !== undefined) setPaintSelection(result.selection ?? null);
    if (!surface) return;
    const writes = diffWrites(surface.buffer, result.buffer);
    if (writes.length) commitSurfaceWrites(writes);
  }, [surface, commitSurfaceWrites]);

  // Eyedropper -> the shared selected color. Reading a pixel is not an edit.
  const onPaintPick = useCallback((value: number) => {
    useArtStore.getState().setSelectedColor(value);
  }, []);

  // ESCAPE CANCELS AN IN-PROGRESS PAINT STROKE — the identical two-step pattern
  // TileTab uses (see its docblock for the full reasoning: ending the controller
  // kills the stroke and its result is thrown away; PixelViewport's own
  // `drawing` ref still delivers a second `end()` on release, and the cancel
  // flag is what makes onPaintCommit drop that one too).
  useEscapeKey(useCallback(() => {
    const ctl = paintControllerRef.current;
    if (!ctl?.isActive) return;
    ctl.end(0, 0);
    paintCancelledRef.current = true;
    bumpPaintFrame((n) => n + 1);
  }, []));

  const paintCanvasStyle: React.CSSProperties = { ...styles.gridCanvas, border: 'none', cursor: 'crosshair' };

  // ---------------------------------------------------------------------------
  // ASSIGN MODE — unchanged from before Task 11.
  // ---------------------------------------------------------------------------

  // Render base art + preview + solidity tint + grid.
  useEffect(() => {
    const canvas = canvasRef.current;
    // willReadFrequently keeps this editor canvas CPU-backed (GPU-poor resilience,
    // same as the classic viewport). Set on the first getContext for the canvas so
    // the option is honored (drawBufferScaled below reuses this same context).
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, sizePx, sizePx);
    if (chunkIndex === null) return;

    drawBufferScaled(canvas, renderChunk(doc, selectedChunkId), 256, 256, sizePx, sizePx);

    const chunk = doc.chunks[chunkIndex];
    // Solidity tint (committed cells).
    if (showSolidity && chunk) {
      for (let i = 0; i < 256; i++) {
        const tint = SOLIDITY[chunk.cells[i]?.solidity ?? 0]?.tint;
        if (!tint) continue;
        ctx.fillStyle = tint;
        ctx.fillRect((i % 16) * cellPx, ((i / 16) | 0) * cellPx, cellPx, cellPx);
      }
    }
    // In-progress paint preview.
    const stroke = strokeRef.current;
    if (stroke && stroke.size) {
      const blockBuf = renderBlock(doc, composerBlockId);
      const tmp = document.createElement('canvas');
      tmp.width = 16; tmp.height = 16;
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      if (tctx) { const img = tctx.createImageData(16, 16); img.data.set(blockBuf); tctx.putImageData(img, 0, 0); }
      ctx.strokeStyle = STAMP_PREVIEW_STROKE;
      ctx.lineWidth = 1;
      for (const idx of stroke.keys()) {
        const cx = (idx % 16) * cellPx;
        const cy = ((idx / 16) | 0) * cellPx;
        ctx.save();
        ctx.translate(cx + (brushXf ? cellPx : 0), cy + (brushYf ? cellPx : 0));
        ctx.scale(brushXf ? -1 : 1, brushYf ? -1 : 1);
        ctx.drawImage(tmp, 0, 0, cellPx, cellPx);
        ctx.restore();
        ctx.strokeRect(cx + 0.5, cy + 0.5, cellPx - 1, cellPx - 1);
      }
    }
    // Grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath(); ctx.moveTo(i * cellPx, 0); ctx.lineTo(i * cellPx, sizePx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cellPx); ctx.lineTo(sizePx, i * cellPx); ctx.stroke();
    }
    // `cellPx` IS A DEPENDENCY. It changes when the window resizes, and every
    // line above is drawn in cell units — without it a resize would leave the
    // grid, the tint and the preview drawn at the previous cell size over a
    // canvas React had already resized (which also CLEARS it: assigning
    // width/height resets the backing store).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedChunkId, chunkIndex, chunkEpoch, chunkVersions, composerBlockId, brushXf, brushYf, showSolidity, strokeVersion, cellPx, sizePx]);

  const cellAt = useCallback((e: React.MouseEvent): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvasCellIndexAt(e.clientX, e.clientY, canvasGeom(canvas), cellPx, 16, 16);
  }, [cellPx]);

  const brushWord = () => packChunkCell({ block: composerBlockId, xf: brushXf, yf: brushYf, solidity: brushSolidity });

  const onDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || chunkIndex === null) return;
    const idx = cellAt(e);
    if (idx === null) return;
    const acc = new Map<number, number>();
    acc.set(idx, brushWord());
    strokeRef.current = acc;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellAt, chunkIndex, composerBlockId, brushXf, brushYf, brushSolidity, redraw]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const idx = cellAt(e);
    if (idx === null || stroke.has(idx)) return;
    stroke.set(idx, brushWord());
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellAt, composerBlockId, brushXf, brushYf, brushSolidity, redraw]);

  // Idempotent (canvas onMouseUp + the window-level end can both fire); nothing
  // may throw out of it — see the same note in TileTab.
  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    if (!stroke) return; // nothing in flight — a stray release elsewhere in the app
    strokeRef.current = null;
    if (!stroke.size) { redraw(); return; }
    const cells = [...stroke.entries()].map(([index, word]) => ({ index, word }));
    let res;
    try {
      res = classicEditChunkCells(selectedChunkId, cells);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Chunk edit failed: ${res.error}`, 'error');
    redraw();
  }, [selectedChunkId, redraw]);
  useWindowStrokeEnd(endStroke);

  // Right-click eyedrops the cell's block + flips + solidity into the brush.
  const onContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (chunkIndex === null) return;
    const idx = cellAt(e);
    if (idx === null) return;
    const cell = doc.chunks[chunkIndex]?.cells[idx];
    if (!cell) return;
    setComposerBlockId(cell.block);
    setBrushXf(cell.xf); setBrushYf(cell.yf); setBrushSolidity(cell.solidity);
  }, [cellAt, chunkIndex, doc, setComposerBlockId]);

  const duplicateChunk = () => {
    if (chunkIndex === null) return;
    const words = doc.chunks[chunkIndex].cells.map((c, index) => ({ index, word: packChunkCell(c) }));
    const res = classicAddChunk(words);
    if (res.ok) { setSelectedChunkId(res.id); useToastStore.getState().addToast(`Duplicated to chunk ${hex(res.id)} — stamp it where you want it`, 'info'); }
    else useToastStore.getState().addToast(res.error, 'error');
  };
  const newBlankChunk = () => {
    const res = classicAddChunk();
    if (res.ok) { setSelectedChunkId(res.id); useToastStore.getState().addToast(`New blank chunk ${hex(res.id)}`, 'info'); }
    else useToastStore.getState().addToast(res.error, 'error');
  };

  const placements = usage.chunkPlacementCount(selectedChunkId);
  const versionKey = String(chunkEpoch);

  return (
    <div style={styles.tabBody}>
      <div style={styles.editorCol}>
        <div style={styles.rowWrap}>
          <span style={styles.title}>Chunk {selectedChunkId === 0 ? 'air ($00)' : hex(selectedChunkId)}</span>
          <span style={styles.count}>placed {placements}×</span>
          <span style={{ flex: 1 }} />
          <Chip active={chunkPaintMode === 'assign'} onClick={() => setChunkPaintMode('assign')} title="Assign a block to each chunk cell">Assign</Chip>
          <Chip active={chunkPaintMode === 'paint'} onClick={() => setChunkPaintMode('paint')} title="Paint pixels across the composed chunk">Paint</Chip>
          <Divider />
          {chunkIndex !== null && (
            <button onClick={duplicateChunk} style={styles.smallBtn} title="Copy this chunk to a new id">Duplicate</button>
          )}
          <button onClick={newBlankChunk} style={styles.smallBtn}>+ New blank</button>
        </div>
        {/* This banner is about CHUNK-PLACEMENT sharing (this engine chunk id is
            stamped N× in the layout, so its one definition is what every
            placement renders) — a fact that holds in BOTH Assign and Paint mode
            and is INDEPENDENT of Link/Isolate (which governs a different axis:
            whether painting propagates through the block/tile ladder BENEATH
            this chunk). So it is hoisted above the mode branch, shown once. */}
        {chunkIndex !== null && placements > 1 && (
          <SharedBanner
            text={`Linked — placed ${placements}×. Edits appear in every placement.`}
            onDuplicate={duplicateChunk}
            dupLabel="Duplicate chunk"
          />
        )}
        {selectedChunkId === 0 || chunkIndex === null ? (
          <div style={styles.notice}>
            The blank chunk (engine id $00 = air) is not editable. Select a chunk in the picker below,
            or right-click a layout cell in the viewport to eyedrop one.
          </div>
        ) : chunkPaintMode === 'paint' ? (
          <>
            {/* Same scroller/holder shape as TileTab's — see its docblock for why
                the box takes the column's size and the canvas centres inside it. */}
            <div ref={paintScrollerRef} style={PAINT_SCROLLER}>
              <div style={PAINT_HOLDER}>
                <PixelViewport
                  canvasRef={paintCanvasRef}
                  buffer={paintBuffer}
                  palette={paletteLines[0]}
                  paletteLines={paletteLines}
                  lineMap={lineMap}
                  zoom={paintEffectiveZoom}
                  controller={paintControllerRef.current}
                  selection={paintSelection}
                  layers={{
                    checkerboard: true, checkerScale: 1, checkerColors: COMPOSER_CHECK_RGB,
                    grids: ['cell8', 'block'],
                  }}
                  onCommit={onPaintCommit}
                  onPick={onPaintPick}
                  style={paintCanvasStyle}
                />
              </div>
            </div>
            <div style={styles.rowWrap}>
              <span style={styles.dim}>Diverge:</span>
              <Chip
                active={paintDivergeMode === 'isolate'}
                onClick={() => setPaintDivergeMode('isolate')}
                title="Painted pixels land only where you painted"
              >Isolate</Chip>
              <Chip
                active={paintDivergeMode === 'link'}
                onClick={() => setPaintDivergeMode('link')}
                title="Painted pixels change every place the art is used"
              >Link</Chip>
              <Divider />
              <span style={styles.dim}>{limitsReadout}</span>
            </div>
          </>
        ) : (
          <>
            {/* The fit box is what has the height; the canvas is centred in it
                at whatever whole-pixel cell size fits. See styles.fitBox. */}
            <div ref={setFitEl} style={{ ...styles.fitBox, minHeight: CHUNK_MIN_CELL * 16 }}>
              <canvas
                ref={canvasRef}
                width={sizePx}
                height={sizePx}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={endStroke}
                onContextMenu={onContext}
                style={{ ...styles.gridCanvas, cursor: 'crosshair' }}
              />
            </div>
            <div style={styles.rowWrap}>
              <span style={styles.dim}>Brush:</span>
              <Chip active={brushXf} onClick={() => setBrushXf((v) => !v)} title="Flip block horizontally">X flip</Chip>
              <Chip active={brushYf} onClick={() => setBrushYf((v) => !v)} title="Flip block vertically">Y flip</Chip>
              <Divider />
              <span style={styles.dim}>Solidity:</span>
              {SOLIDITY.map((s) => (
                <Chip key={s.v} active={brushSolidity === s.v} onClick={() => setBrushSolidity(s.v)} title={s.full}>{s.label}</Chip>
              ))}
              <Divider />
              <Chip active={showSolidity} onClick={() => setShowSolidity((v) => !v)} title="Overlay solidity tint">Show</Chip>
            </div>
          </>
        )}
      </div>
      <div style={styles.paletteCol}>
        <div style={styles.paletteHead}>Blocks ({doc.blocks.length}) · paint block {hex(composerBlockId)}</div>
        <div style={styles.paletteStrip}>
          {doc.blocks.map((_, id) => (
            <BlockThumb
              key={id} blockId={id} size={34} versionKey={versionKey}
              selected={id === composerBlockId}
              containers={usage.blockUsage(id).containers} cells={usage.blockUsage(id).cells}
              onSelect={setComposerBlockId}
            />
          ))}
        </div>
        <div style={styles.hintRow}>right-click a cell to eyedrop · click a block to arm it</div>
      </div>
    </div>
  );
}
