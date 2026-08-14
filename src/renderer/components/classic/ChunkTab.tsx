import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chip, Divider } from '../ui';
import {
  useClassicLevelStore, classicEditChunkCells, classicAddChunk,
} from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import { renderChunk, renderBlock } from '../../../core/level-classic/render';
import { chunkIndexForId, packChunkCell, type LevelDoc } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { canvasCellIndexAt } from './composer-math';
import { BlockThumb } from './composer-thumbs';
import { STAMP_PREVIEW_STROKE } from '../../canvas/canvas-colors';
import {
  hex, SOLIDITY, SharedBanner, useEscapeCancel, useWindowStrokeEnd, drawBufferScaled,
  canvasGeom, styles,
} from './composer-shared';

// Chunk tab — 16x16 block-grid editor for the selected chunk. Paint = pick block
// + flips + solidity; one classicEditChunkCells per gesture. Duplicate / new-blank
// grow the pool (≤ $7F). Right-click eyedrops a cell's block+flips+solidity.

const CHUNK_CELL = 20; // px per 16x16 block cell → 320px grid
const CHUNK_SIZE = CHUNK_CELL * 16;

export default function ChunkTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const setSelectedChunkId = useClassicLevelStore((s) => s.setSelectedChunkId);
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const setComposerBlockId = useClassicLevelStore((s) => s.setComposerBlockId);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const chunkVersions = useClassicLevelStore((s) => s.chunkVersions);

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
  useEscapeCancel(strokeRef, redraw); // Esc cancels an in-progress chunk paint

  // Render base art + preview + solidity tint + grid.
  useEffect(() => {
    const canvas = canvasRef.current;
    // willReadFrequently keeps this editor canvas CPU-backed (GPU-poor resilience,
    // same as the classic viewport). Set on the first getContext for the canvas so
    // the option is honored (drawBufferScaled below reuses this same context).
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
    if (chunkIndex === null) return;

    drawBufferScaled(canvas, renderChunk(doc, selectedChunkId), 256, 256, CHUNK_SIZE, CHUNK_SIZE);

    const chunk = doc.chunks[chunkIndex];
    // Solidity tint (committed cells).
    if (showSolidity && chunk) {
      for (let i = 0; i < 256; i++) {
        const tint = SOLIDITY[chunk.cells[i]?.solidity ?? 0]?.tint;
        if (!tint) continue;
        ctx.fillStyle = tint;
        ctx.fillRect((i % 16) * CHUNK_CELL, ((i / 16) | 0) * CHUNK_CELL, CHUNK_CELL, CHUNK_CELL);
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
        const cx = (idx % 16) * CHUNK_CELL;
        const cy = ((idx / 16) | 0) * CHUNK_CELL;
        ctx.save();
        ctx.translate(cx + (brushXf ? CHUNK_CELL : 0), cy + (brushYf ? CHUNK_CELL : 0));
        ctx.scale(brushXf ? -1 : 1, brushYf ? -1 : 1);
        ctx.drawImage(tmp, 0, 0, CHUNK_CELL, CHUNK_CELL);
        ctx.restore();
        ctx.strokeRect(cx + 0.5, cy + 0.5, CHUNK_CELL - 1, CHUNK_CELL - 1);
      }
    }
    // Grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath(); ctx.moveTo(i * CHUNK_CELL, 0); ctx.lineTo(i * CHUNK_CELL, CHUNK_SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CHUNK_CELL); ctx.lineTo(CHUNK_SIZE, i * CHUNK_CELL); ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, selectedChunkId, chunkIndex, chunkEpoch, chunkVersions, composerBlockId, brushXf, brushYf, showSolidity, strokeVersion]);

  const cellAt = useCallback((e: React.MouseEvent): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvasCellIndexAt(e.clientX, e.clientY, canvasGeom(canvas), CHUNK_CELL, 16, 16);
  }, []);

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
          {chunkIndex !== null && (
            <button onClick={duplicateChunk} style={styles.smallBtn} title="Copy this chunk to a new id">Duplicate</button>
          )}
          <button onClick={newBlankChunk} style={styles.smallBtn}>+ New blank</button>
        </div>
        {selectedChunkId === 0 || chunkIndex === null ? (
          <div style={styles.notice}>
            The blank chunk (engine id $00 = air) is not editable. Select a chunk in the picker below,
            or right-click a layout cell in the viewport to eyedrop one.
          </div>
        ) : (
          <>
            {placements > 1 && (
              <SharedBanner
                text={`chunk ${hex(selectedChunkId)} is placed ${placements}× — edits affect every placement`}
                onDuplicate={duplicateChunk}
                dupLabel="Duplicate chunk"
              />
            )}
            <canvas
              ref={canvasRef}
              width={CHUNK_SIZE}
              height={CHUNK_SIZE}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={endStroke}
              onContextMenu={onContext}
              style={{ ...styles.gridCanvas, cursor: 'crosshair' }}
            />
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
