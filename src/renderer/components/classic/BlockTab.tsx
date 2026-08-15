import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chip, Divider } from '../ui';
import {
  useClassicLevelStore, classicEditBlock, classicAddBlock,
} from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { renderBlock } from '../../../core/level-classic/render';
import type { LevelDoc, BlockDef } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { canvasCellIndexAt, fitCellSize } from './composer-math';
import { TileThumb, BlockThumb } from './composer-thumbs';
import { COMPOSER_SEL_CELL } from '../../canvas/canvas-colors';
import { hex, SharedBanner, useEditableTileRange, tileLockReason, drawBufferScaled, canvasGeom, useBoxSize, styles } from './composer-shared';

// Block tab — 4-tile (2x2) composer for the selected block. Two right-hand
// strips with opposite click semantics: a BROWSE-ONLY block strip (pick which
// block to edit — mirrors the Tile tab's strip) and the tile "set cell" strip
// (clicking ASSIGNS the tile to the selected cell). Flips + palette line +
// priority per cell; one classicEditBlock per commit.

/**
 * The cell size is FITTED to the room the layout gives the canvas — see
 * `styles.fitBox` for why a bigger CELL and not a bigger CSS box, and what was
 * rejected. 64 (a 128px preview) is the constant this tab shipped with and is
 * now the floor; 192 is a 384px preview, the same on-screen size the Tile tier's
 * 8x8 canvas reaches at its default zoom of 24, which is as large as four tiles
 * usefully get.
 */
const BLOCK_MIN_CELL = 64;
const BLOCK_MAX_CELL = 192;

export default function BlockTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const setComposerBlockId = useClassicLevelStore((s) => s.setComposerBlockId);
  const setComposerTileIndex = useClassicLevelStore((s) => s.setComposerTileIndex);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
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
  }, [doc, composerBlockId, chunkEpoch, selCell, block, cellPx]);

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
    const res = classicAddBlock({ cells: b.cells.map((c) => ({ ...c })) });
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
          <button onClick={duplicateBlock} style={styles.smallBtn} title="Copy this block to a new id">Duplicate</button>
          <button onClick={newBlankBlock} style={styles.smallBtn}>+ New blank</button>
        </div>
        {blockUse.cells > 1 && (
          <SharedBanner
            text={`Linked — used in ${blockUse.containers} chunk${blockUse.containers === 1 ? '' : 's'} · ${blockUse.cells} cell${blockUse.cells === 1 ? '' : 's'}. Edits appear in all of them.`}
            onDuplicate={duplicateBlock}
            dupLabel="Duplicate block"
          />
        )}
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
