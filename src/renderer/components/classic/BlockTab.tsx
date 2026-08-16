import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Chip, Divider, T } from '../ui';
import {
  useClassicLevelStore, classicEditBlock, classicAddBlock, classicPaintSurface,
} from '../../state/classicLevelStore';
import { useArtStore, selectArtZoom } from '../../state/artStore';
import { useToastStore } from '../../state/toastStore';
import { renderBlock } from '../../../core/level-classic/render';
import type { LevelDoc, BlockDef } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import { isTileEditable } from '../../../core/project/editable-tiles';
import { countFreeTileSlots } from '../../../core/art/free-tile-slots';
import { PixelEditController, diffWrites } from '../../../core/art/pixel-edit-controller';
import type { GestureResult, Selection } from '../../../core/art/pixel-edit-controller';
import { toolConfigFrom } from '../../../core/art/tool-config';
import { buildBlockSurface } from '../../../core/art/classic-surface-buffer';
import { planSurfaceEdit, type SurfaceWrite } from '../../../core/art/classic-surface-plan';
import PixelViewport from '../art-shared/PixelViewport';
import { useAnchoredZoom } from '../art-shared/use-anchored-zoom';
import { useHandPan } from '../art-shared/use-hand-pan';
import { cappedZoom } from '../art-shared/zoom-cap';
import { canvasCellIndexAt, fitCellSize } from './composer-math';
import { TileThumb, BlockThumb } from './composer-thumbs';
import { COMPOSER_SEL_CELL, COMPOSER_CHECK_RGB } from '../../canvas/canvas-colors';
import {
  hex, SharedBanner, useEditableTileRange, useEscapeKey, tileLockReason,
  drawBufferScaled, canvasGeom, useBoxSize, styles,
} from './composer-shared';
import { levelKeysEnabled } from '../../workspace/level-keys';

// Block tab — 4-tile (2x2) composer for the selected block, with a second mode
// (Task 11, "decided" — see the plan doc's final section). Assign is the
// default and unchanged: two right-hand strips with opposite click semantics —
// a BROWSE-ONLY block strip and the tile "set cell" strip (clicking ASSIGNS the
// tile to the selected cell) — flips + palette line + priority per cell, one
// classicEditBlock per commit. Paint composes the block into ONE pixel surface
// (buildBlockSurface) and mounts the shared pixel substrate (PixelViewport +
// PixelEditController), exactly as TileTab/ChunkTab do.
//
// A BLOCK SURFACE HAS NO CHUNK CELL — `provenance.chunkIndex` is always null
// here (buildBlockSurface never sets it), which `planSurfaceEdit` already
// handles: with no chunk cell to repoint, Isolate protects other BLOCKS through
// tile divergence alone (a linked tile gets its own slot; there is no narrower
// "just this chunk cell" to diverge into, because this surface IS the block,
// not one placement of it).
//
// PAINT NEVER CALLS classicEditTiles — see ChunkTab's header for why. The
// composed path's only write commands are `planSurfaceEdit` (pure planning) →
// `classicPaintSurface` (the one command that applies a plan atomically). See
// __tests__/block-paint-mode.test.ts for the standing guard.

/**
 * The cell size is FITTED to the room the layout gives the canvas — see
 * `styles.fitBox` for why a bigger CELL and not a bigger CSS box, and what was
 * rejected. 64 (a 128px preview) is the constant this tab shipped with and is
 * now the floor; 192 is a 384px preview, the same on-screen size the Tile tier's
 * 8x8 canvas reaches at its default zoom of 24, which is as large as four tiles
 * usefully get. ASSIGN MODE ONLY — Paint mode zooms through `artStore.zoom`
 * instead, the same cross-engine singleton TileTab/ChunkTab use.
 */
const BLOCK_MIN_CELL = 64;
const BLOCK_MAX_CELL = 192;

/** Chunk cell's block field is 10 bits — see ChunkTab's identical constant and
 *  its docblock for why this is duplicated rather than imported. */
const MAX_BLOCK_REF = 0x3ff;

/** The floor on Paint mode's viewport box, in CSS px — see TileTab's identical
 *  `TILE_VIEW_PX` / ChunkTab's `PAINT_VIEW_PX`. */
const PAINT_VIEW_PX = 240;
const PAINT_SCROLLER: React.CSSProperties = {
  minWidth: PAINT_VIEW_PX, minHeight: PAINT_VIEW_PX, flex: '1 1 0', overflow: 'auto',
  display: 'flex', background: T.void, borderRadius: 3,
};
const PAINT_HOLDER: React.CSSProperties = { margin: 'auto', padding: 6, lineHeight: 0 };

export default function BlockTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const setComposerBlockId = useClassicLevelStore((s) => s.setComposerBlockId);
  const setComposerTileIndex = useClassicLevelStore((s) => s.setComposerTileIndex);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const blockPaintMode = useClassicLevelStore((s) => s.blockPaintMode);
  const setBlockPaintMode = useClassicLevelStore((s) => s.setBlockPaintMode);
  const paintDivergeMode = useClassicLevelStore((s) => s.paintDivergeMode);
  const setPaintDivergeMode = useClassicLevelStore((s) => s.setPaintDivergeMode);
  const reservedTiles = useClassicLevelStore((s) => s.reservedTiles);
  const range = useEditableTileRange();
  const [selCell, setSelCell] = useState(0); // 0..3 which of the 4 tile cells
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The canvas is sized to the fit box, which is sized by the layout. A callback
  // ref into state rather than a `useRef` — see useBoxSize's docblock (the box
  // is behind the `!block` early return below, so it is not mounted on the
  // first render of a doc with no block selected).
  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const fit = useBoxSize(fitEl);
  const cellPx = fitCellSize(fit.w, fit.h, 2, 2, BLOCK_MIN_CELL, BLOCK_MAX_CELL);

  const block = doc.blocks[composerBlockId];
  const tileCount = Math.floor(doc.tiles.length / 32);

  // ---------------------------------------------------------------------------
  // PAINT MODE — compose the block into one pixel surface, and drive it through
  // the shared substrate exactly as TileTab/ChunkTab do. Hooks are declared
  // unconditionally (rules of hooks, and ahead of the `!block` early return
  // below); the JSX only MOUNTS PixelViewport while blockPaintMode === 'paint'.
  // `buildBlockSurface` tolerates an out-of-range `composerBlockId` on its own
  // (a blank 2x2 surface), so this needs no extra null-guarding beyond that.
  // ---------------------------------------------------------------------------

  const surface = useMemo(
    () => buildBlockSurface(doc, composerBlockId),
    // Mirrors the ASSIGN-mode redraw effect's own invalidation clock below —
    // `chunkEpoch` bumps for both a classicEditBlock commit and a
    // classicPaintSurface commit (both use VersionEffect `{ kind: 'all' }`) —
    // rather than keying on doc.tiles/blocks directly.
    [doc, composerBlockId, chunkEpoch],
  );
  const paintBuffer = surface.buffer;

  // A composed surface draws EACH cell through its OWN stored palette line
  // (`SurfaceCell.pal`) — see ChunkTab's identical note for why this needs the
  // multi-palette path rather than TileTab's single "Line:" picker.
  const paletteLines = useMemo(
    () => [0, 1, 2, 3].map((i) => {
      const words = doc.palettes[i] ?? doc.palettes[0] ?? new Uint16Array(16);
      return Array.from({ length: 16 }, (_, k) => decodeGenesisColor(words[k] ?? 0));
    }),
    [doc.palettes],
  );
  const lineMap = useMemo(() => {
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

  // The drawing config is the ART STORE's — one vocabulary, shared with
  // TileTab/ChunkTab (see ChunkTab's identical note).
  const paintTool = useArtStore((s) => s.tool);
  const paintColor = useArtStore((s) => s.selectedColor);
  const paintMirror = useArtStore((s) => s.mirror);
  const paintDither = useArtStore((s) => s.ditherPattern);
  const paintDitherSecondary = useArtStore((s) => s.ditherSecondary);
  const paintPixelPerfect = useArtStore((s) => s.pixelPerfect);
  const paintZoom = useArtStore(selectArtZoom);

  const paintConfig = toolConfigFrom({
    tool: paintTool, selectedColor: paintColor, mirror: paintMirror,
    ditherPattern: paintDither, ditherSecondary: paintDitherSecondary, pixelPerfect: paintPixelPerfect,
  });
  const paintControllerRef = useRef<PixelEditController | null>(null);
  if (!paintControllerRef.current) paintControllerRef.current = new PixelEditController(paintConfig);
  paintControllerRef.current.setConfig(paintConfig);

  const paintEffectiveZoom = cappedZoom(paintZoom, Math.max(paintBuffer.width, paintBuffer.height));
  const paintScrollerRef = useRef<HTMLDivElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useAnchoredZoom(
    paintScrollerRef, paintCanvasRef, paintEffectiveZoom,
    () => selectArtZoom(useArtStore.getState()), (z) => useArtStore.getState().setZoom(z),
  );
  useHandPan(paintScrollerRef, { enabled: levelKeysEnabled });

  const [paintSelection, setPaintSelection] = useState<Selection | null>(null);
  const paintCancelledRef = useRef(false);
  const [, bumpPaintFrame] = useState(0);
  // A marquee/cancel-flag are scoped to ONE block, for the identical reason
  // TileTab's per-tile / ChunkTab's per-chunk reset effect is.
  useEffect(() => {
    setPaintSelection(null);
    paintCancelledRef.current = false;
  }, [composerBlockId]);

  const poolTileCount = Math.floor(doc.tiles.length / 32);
  // APPROXIMATE, for display only — countFreeTileSlots' header carries the whole
  // reason that is acceptable and what stays authoritative (`planSurfaceEdit`).
  const freeTileSlots = useMemo(() => countFreeTileSlots({
    poolTileCount, usage, reserved: reservedTiles ?? null,
    isEditable: (t) => isTileEditable(range, t),
  }), [poolTileCount, usage, reservedTiles, range]);
  const limitsReadout =
    `blocks ${doc.blocks.length}/${MAX_BLOCK_REF + 1} · tiles ${poolTileCount - freeTileSlots}/${poolTileCount}`;

  // THE ONE WRITE PATH for Paint mode. diffWrites -> planSurfaceEdit ->
  // classicPaintSurface, one call each, in that order — see ChunkTab's header
  // and __tests__/block-paint-mode.test.ts's standing guard.
  const commitSurfaceWrites = useCallback((writes: SurfaceWrite[]) => {
    if (!writes.length) return;
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
    // commitTileBytes / ChunkTab's commitSurfaceWrites.
    let res;
    try {
      res = classicPaintSurface(planResult.plan);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Paint failed: ${res.error}`, 'error');
  }, [doc, surface, usage, paintDivergeMode, range, reservedTiles]);

  const onPaintCommit = useCallback((result: GestureResult) => {
    if (paintCancelledRef.current) { paintCancelledRef.current = false; return; }
    if (result.selection !== undefined) setPaintSelection(result.selection ?? null);
    const writes = diffWrites(surface.buffer, result.buffer);
    if (writes.length) commitSurfaceWrites(writes);
  }, [surface, commitSurfaceWrites]);

  // Eyedropper -> the shared selected color. Reading a pixel is not an edit.
  const onPaintPick = useCallback((value: number) => {
    useArtStore.getState().setSelectedColor(value);
  }, []);

  // ESCAPE CANCELS AN IN-PROGRESS PAINT STROKE — the identical two-step pattern
  // TileTab/ChunkTab use (see TileTab's docblock for the full reasoning).
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

  useEffect(() => {
    const canvas = canvasRef.current;
    // willReadFrequently keeps this editor canvas CPU-backed (GPU-poor resilience,
    // same as the classic viewport). Set on the first getContext for the canvas so
    // the option is honored (drawBufferScaled below reuses this same context).
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx || !block) return;
    ctx.imageSmoothingEnabled = false;
    drawBufferScaled(canvas, renderBlock(doc, composerBlockId), 16, 16, cellPx * 2, cellPx * 2);
    // Grid + selected-cell highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(cellPx + 0.5, 0, 0, cellPx * 2);
    ctx.beginPath(); ctx.moveTo(cellPx, 0); ctx.lineTo(cellPx, cellPx * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cellPx); ctx.lineTo(cellPx * 2, cellPx); ctx.stroke();
    ctx.strokeStyle = COMPOSER_SEL_CELL;
    ctx.lineWidth = 2;
    ctx.strokeRect((selCell % 2) * cellPx + 1, ((selCell / 2) | 0) * cellPx + 1, cellPx - 2, cellPx - 2);
    // `cellPx` IS A DEPENDENCY — everything above is drawn in cell units, and
    // React resizing the canvas on a window resize also clears its backing
    // store, so a redraw has to follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `blockPaintMode` IS A DEPENDENCY for the same reason ChunkTab's is: the
    // Assign/Paint branches mount different element types, so a toggle recreates
    // this <canvas> and nothing would repaint it. Same bug, same tab shape.
  }, [doc, composerBlockId, chunkEpoch, selCell, block, cellPx, blockPaintMode]);

  const editCell = useCallback((patch: Partial<BlockDef['cells'][number]>) => {
    const b = doc.blocks[composerBlockId];
    if (!b) return;
    const def: BlockDef = { cells: b.cells.map((c, i) => (i === selCell ? { ...c, ...patch } : { ...c })) };
    // Nothing may escape this handler — see the note on TileTab's endStroke: the
    // command's own invariant guards throw, and an uncaught throw out of a React
    // event handler is what turns a refused edit into a frozen window.
    let res;
    try {
      res = classicEditBlock(composerBlockId, def);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Block edit failed: ${res.error}`, 'error');
  }, [doc, composerBlockId, selCell]);

  // The tile strip's "assign this tile to the selected cell" click, as a
  // REFERENTIALLY STABLE callback. `editCell` closes over doc/blockId/selCell and
  // so is rebuilt on every commit; handing that straight to ~965 memoized
  // TileThumbs would break their memo on every edit (the thousand-re-render storm
  // composer-thumbs' prop note describes). Same latest-ref idiom as
  // composer-shared's useWindowStrokeEnd.
  const editCellRef = useRef(editCell);
  useEffect(() => { editCellRef.current = editCell; }, [editCell]);
  const assignTileToCell = useCallback((t: number) => {
    editCellRef.current({ tile: t });
    setComposerTileIndex(t);
  }, [setComposerTileIndex]);

  const onCellClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const idx = canvasCellIndexAt(e.clientX, e.clientY, canvasGeom(canvas), cellPx, 2, 2);
    if (idx === null) return;
    setSelCell(idx);
    const cell = doc.blocks[composerBlockId]?.cells[idx];
    if (cell) { setComposerTileIndex(cell.tile); setComposerPalLine(cell.pal); }
  }, [doc, composerBlockId, cellPx, setComposerTileIndex, setComposerPalLine]);

  const duplicateBlock = () => {
    const b = doc.blocks[composerBlockId];
    if (!b) return;
    // The source id, so the copy inherits its collision shape — a duplicate
    // that looks identical and is not solid is worse than no duplicate.
    const res = classicAddBlock({ cells: b.cells.map((c) => ({ ...c })) },
      { sourceBlockId: composerBlockId });
    if (res.ok) { useClassicLevelStore.getState().setComposerBlockId(res.id); useToastStore.getState().addToast(`Duplicated to block ${hex(res.id)}`, 'info'); }
    else useToastStore.getState().addToast(res.error, 'error');
  };
  const newBlankBlock = () => {
    const res = classicAddBlock();
    if (res.ok) { useClassicLevelStore.getState().setComposerBlockId(res.id); useToastStore.getState().addToast(`New blank block ${hex(res.id)}`, 'info'); }
    else useToastStore.getState().addToast(res.error, 'error');
  };

  if (!block) {
    return <div style={styles.tabBody}><div style={styles.notice}>No block selected. Pick a block in the Chunk tab's palette.</div></div>;
  }

  const cell = block.cells[selCell];
  const blockUse = usage.blockUsage(composerBlockId);
  const versionKey = String(chunkEpoch);

  return (
    <div style={styles.tabBody}>
      <div style={styles.editorCol}>
        <div style={styles.rowWrap}>
          <span style={styles.title}>Block {hex(composerBlockId)}</span>
          <span style={styles.count}>in {blockUse.containers} chunk{blockUse.containers === 1 ? '' : 's'} · {blockUse.cells} cell{blockUse.cells === 1 ? '' : 's'}</span>
          <span style={{ flex: 1 }} />
          <Chip active={blockPaintMode === 'assign'} onClick={() => setBlockPaintMode('assign')} title="Assign a tile to each block cell">Assign</Chip>
          <Chip active={blockPaintMode === 'paint'} onClick={() => setBlockPaintMode('paint')} title="Paint pixels across the composed block">Paint</Chip>
          <Divider />
          <button onClick={duplicateBlock} style={styles.smallBtn} title="Copy this block to a new id">Duplicate</button>
          <button onClick={newBlankBlock} style={styles.smallBtn}>+ New blank</button>
        </div>
        {/* Hoisted above the Assign/Paint branch — see ChunkTab's identical note:
            this states BLOCK sharing (used in N chunks · M cells), which holds
            in both modes and is independent of Link/Isolate. The discovery
            breadcrumb (Task 11) points at the one place a single placement CAN
            be isolated: painting the owning chunk cell on the Chunk tab. */}
        {blockUse.cells > 1 && (
          <SharedBanner
            text={`Linked — used in ${blockUse.containers} chunk${blockUse.containers === 1 ? '' : 's'} · ${blockUse.cells} cell${blockUse.cells === 1 ? '' : 's'}. Edits appear in all of them. To change one place only, paint it on the Chunk tab (Isolate).`}
            onDuplicate={duplicateBlock}
            dupLabel="Duplicate block"
          />
        )}
        {blockPaintMode === 'paint' ? (
          <>
            {/* Same scroller/holder shape as TileTab's/ChunkTab's — see TileTab's
                docblock for why the box takes the column's size and the canvas
                centres inside it. */}
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
                    grids: ['cell8'],
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
            {/* The fit box is what has the height; the canvas is centred in it at
                whatever whole-pixel cell size fits. See styles.fitBox. */}
            <div ref={setFitEl} style={{ ...styles.fitBox, minHeight: BLOCK_MIN_CELL * 2 }}>
              <canvas
                ref={canvasRef}
                width={cellPx * 2}
                height={cellPx * 2}
                onClick={onCellClick}
                style={{ ...styles.gridCanvas, cursor: 'pointer' }}
              />
            </div>
            <div style={styles.rowWrap}>
              <span style={styles.dim}>Cell {['TL', 'TR', 'BL', 'BR'][selCell]} · tile {hex(cell.tile)}</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => {
                  setComposerTileIndex(cell.tile);
                  setComposerPalLine(cell.pal);
                  useClassicLevelStore.getState().setComposerTab('tile');
                }}
                style={styles.smallBtn}
                title={`Open tile ${hex(cell.tile)} in the Tile tab`}
              >Edit pixels →</button>
            </div>
            <div style={styles.rowWrap}>
              <Chip active={cell.xf} onClick={() => editCell({ xf: !cell.xf })}>X flip</Chip>
              <Chip active={cell.yf} onClick={() => editCell({ yf: !cell.yf })}>Y flip</Chip>
              <Chip active={cell.pri} onClick={() => editCell({ pri: !cell.pri })} title="VDP priority bit">Priority</Chip>
              <Divider />
              <span style={styles.dim}>Palette:</span>
              {[0, 1, 2, 3].map((p) => (
                <Chip key={p} active={cell.pal === p} onClick={() => editCell({ pal: p })}>{p}</Chip>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={styles.paletteCol}>
        <div style={styles.paletteHead}>Blocks ({doc.blocks.length}) · click to edit</div>
        {/* No `maxHeight` override any more. It was 140px so this strip did not
            crowd the tile strip beside it — but they are SEPARATE COLUMNS, so it
            never could: all the cap did was leave a 175px column beside a
            348px one in a 478px body. Each strip now fills its own column
            (styles.paletteStrip). */}
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
        <div style={styles.hintRow}>browse-only — selecting never edits</div>
      </div>
      <div style={styles.paletteCol}>
        <div style={styles.paletteHead}>Tiles ({tileCount}) · click to set cell {['TL', 'TR', 'BL', 'BR'][selCell]}</div>
        <div style={styles.paletteStrip}>
          {Array.from({ length: tileCount }, (_, id) => (
            <TileThumb
              key={id} tileIndex={id} palLine={cell.pal} size={26} versionKey={versionKey}
              selected={id === cell.tile} locked={tileLockReason(range, id) !== null}
              containers={usage.tileUsage(id).containers} cells={usage.tileUsage(id).cells}
              onSelect={assignTileToCell}
            />
          ))}
        </div>
        <div style={styles.hintRow}>⚠ clicking here REWRITES cell {['TL', 'TR', 'BL', 'BR'][selCell]} — to browse tiles without editing, use the Tile tab's strip</div>
      </div>
    </div>
  );
}
