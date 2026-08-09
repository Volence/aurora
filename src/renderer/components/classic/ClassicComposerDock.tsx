import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { T, Chip, Divider } from '../ui';
import {
  useClassicLevelStore,
  classicEditChunkCells, classicEditBlock, classicEditTiles,
  classicAddChunk, classicAddBlock,
  type ComposerTab,
} from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import { useToastStore } from '../../state/toastStore';
import { renderChunk, renderBlock, renderTile } from '../../../core/level-classic/render';
import {
  chunkIndexForId, packChunkCell,
  type LevelDoc, type BlockDef,
} from '../../../core/level-classic/model';
import { buildUsageIndex, type UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import type { EditableTileRange } from '../../../core/project/adapter';
import { cellIndexAt } from './composer-math';
import { TileThumb, BlockThumb } from './composer-thumbs';
import {
  STAMP_PREVIEW_STROKE, CANVAS_BLACK,
  COMPOSER_SEL_CELL, COMPOSER_CHECK_A, COMPOSER_CHECK_B, COMPOSER_SWATCH_A, COMPOSER_SWATCH_B,
} from '../../canvas/canvas-colors';

const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;

/** Whether a keyboard event targets a text-entry field (Escape belongs to it). */
function isTypingTarget(t: HTMLElement): boolean {
  return t.isContentEditable || t.tagName === 'TEXTAREA'
    || (t.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'radio'].includes((t as HTMLInputElement).type));
}

/**
 * Register a window Escape handler that cancels an in-progress canvas gesture
 * (a `strokeRef` Map, mutated during the drag) — matching the viewport's gesture
 * cancel. Guarded against text-entry so an Escape in a field isn't hijacked.
 */
function useEscapeCancel(strokeRef: React.MutableRefObject<Map<number, number> | null>, redraw: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isTypingTarget(e.target as HTMLElement)) return;
      if (strokeRef.current) { strokeRef.current = null; redraw(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [strokeRef, redraw]);
}

// Solidity vocabulary — verified against SonLVLAPI's Solidity enum
//   /home/volence/sonic_hacks/programs/SonLVL/SonLVLAPI/DataTypes.cs:400
//   0 NotSolid, 1 TopSolid, 2 LRBSolid, 3 AllSolid.
const SOLIDITY = [
  { v: 0, label: 'None', full: 'NotSolid', tint: null as string | null },
  { v: 1, label: 'Top', full: 'TopSolid', tint: 'rgba(80,160,255,0.30)' },
  { v: 2, label: 'LRB', full: 'LRBSolid', tint: 'rgba(255,170,60,0.30)' },
  { v: 3, label: 'All', full: 'AllSolid', tint: 'rgba(255,70,70,0.32)' },
];

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** The writable tile span for the open act, or null (unknown / fakes). */
function useEditableTileRange(): EditableTileRange | null {
  const ref = useClassicLevelStore((s) => s.ref);
  const handle = useClassicProjectStore((s) => s.handle);
  return useMemo(() => {
    if (!ref || !handle?.levels?.editableTileRange) return null;
    return handle.levels.editableTileRange(ref);
  }, [ref, handle]);
}

function tileLockReason(range: EditableTileRange | null, tileIndex: number): string | null {
  if (!range) return null;
  if (tileIndex >= range.baseTileCount) return 'gap/appended tile — not editable in v1';
  if (range.animRanges.some((r) => tileIndex >= r.start && tileIndex < r.start + r.count)) {
    return 'animated-art slot — not editable in v1';
  }
  return null;
}

/** An inline shared-edit warning banner with an optional Duplicate action. */
function SharedBanner({ text, onDuplicate, dupLabel }: { text: string; onDuplicate?: () => void; dupLabel?: string }) {
  return (
    <div style={styles.banner}>
      <span style={{ flex: 1 }}>⚠ {text}</span>
      {onDuplicate && (
        <button onClick={onDuplicate} style={styles.dupBtn}>{dupLabel ?? 'Duplicate'}</button>
      )}
    </div>
  );
}

// Read/write 4bpp tile pixels (nibble layout matches core render.ts: the high
// nibble is the left/even-x pixel).
function readTilePixels(tiles: Uint8Array, tileIndex: number): Uint8Array {
  const px = new Uint8Array(64);
  const base = tileIndex * 32;
  if (base + 32 > tiles.length) return px;
  for (let i = 0; i < 64; i++) {
    const byte = tiles[base + (i >> 1)];
    px[i] = (i & 1) === 0 ? (byte >> 4) & 0xf : byte & 0xf;
  }
  return px;
}
function packTilePixels(px: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 64; i++) {
    const b = i >> 1;
    if ((i & 1) === 0) out[b] = (out[b] & 0x0f) | ((px[i] & 0xf) << 4);
    else out[b] = (out[b] & 0xf0) | (px[i] & 0xf);
  }
  return out;
}

function drawBufferScaled(canvas: HTMLCanvasElement | null, buf: Uint8ClampedArray, srcW: number, srcH: number, w: number, h: number): void {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  const tmp = document.createElement('canvas');
  tmp.width = srcW; tmp.height = srcH;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  const img = tctx.createImageData(srcW, srcH);
  img.data.set(buf);
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Chunk tab — 16x16 block-grid editor for the selected chunk
// ---------------------------------------------------------------------------

const CHUNK_CELL = 20; // px per 16x16 block cell → 320px grid
const CHUNK_SIZE = CHUNK_CELL * 16;

function ChunkTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
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
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<Map<number, number> | null>(null); // cell index → packed word
  const chunkIndex = chunkIndexForId(doc, selectedChunkId);
  useEscapeCancel(strokeRef, redraw); // Esc cancels an in-progress chunk paint

  // Render base art + preview + solidity tint + grid.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
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
      const tctx = tmp.getContext('2d');
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
  }, [doc, selectedChunkId, chunkIndex, chunkEpoch, chunkVersions, composerBlockId, brushXf, brushYf, showSolidity]);

  const cellAt = useCallback((e: React.MouseEvent): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return cellIndexAt(e.clientX - rect.left, e.clientY - rect.top, CHUNK_CELL, 16, 16);
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

  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || !stroke.size) { redraw(); return; }
    const cells = [...stroke.entries()].map(([index, word]) => ({ index, word }));
    const res = classicEditChunkCells(selectedChunkId, cells);
    if (!res.ok) useToastStore.getState().addToast(`Chunk edit failed: ${res.error}`, 'error');
    redraw();
  }, [selectedChunkId, redraw]);

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
              onMouseLeave={() => { strokeRef.current = null; redraw(); }}
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
              key={id} doc={doc} blockId={id} size={34} versionKey={versionKey}
              selected={id === composerBlockId} usage={usage.blockUsage(id)} onSelect={setComposerBlockId}
            />
          ))}
        </div>
        <div style={styles.hintRow}>right-click a cell to eyedrop · click a block to arm it</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block tab — 4-tile (2x2) composer for the selected block
// ---------------------------------------------------------------------------

const BLOCK_CELL = 64; // px per 8x8 tile cell → 128px block preview

function BlockTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerBlockId = useClassicLevelStore((s) => s.composerBlockId);
  const composerTileIndex = useClassicLevelStore((s) => s.composerTileIndex);
  const setComposerTileIndex = useClassicLevelStore((s) => s.setComposerTileIndex);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const range = useEditableTileRange();
  const [selCell, setSelCell] = useState(0); // 0..3 which of the 4 tile cells
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const block = doc.blocks[composerBlockId];
  const tileCount = Math.floor(doc.tiles.length / 32);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !block) return;
    ctx.imageSmoothingEnabled = false;
    drawBufferScaled(canvas, renderBlock(doc, composerBlockId), 16, 16, BLOCK_CELL * 2, BLOCK_CELL * 2);
    // Grid + selected-cell highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(BLOCK_CELL + 0.5, 0, 0, BLOCK_CELL * 2);
    ctx.beginPath(); ctx.moveTo(BLOCK_CELL, 0); ctx.lineTo(BLOCK_CELL, BLOCK_CELL * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, BLOCK_CELL); ctx.lineTo(BLOCK_CELL * 2, BLOCK_CELL); ctx.stroke();
    ctx.strokeStyle = COMPOSER_SEL_CELL;
    ctx.lineWidth = 2;
    ctx.strokeRect((selCell % 2) * BLOCK_CELL + 1, ((selCell / 2) | 0) * BLOCK_CELL + 1, BLOCK_CELL - 2, BLOCK_CELL - 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, composerBlockId, chunkEpoch, selCell, block]);

  const editCell = useCallback((patch: Partial<BlockDef['cells'][number]>) => {
    const b = doc.blocks[composerBlockId];
    if (!b) return;
    const def: BlockDef = { cells: b.cells.map((c, i) => (i === selCell ? { ...c, ...patch } : { ...c })) };
    const res = classicEditBlock(composerBlockId, def);
    if (!res.ok) useToastStore.getState().addToast(`Block edit failed: ${res.error}`, 'error');
  }, [doc, composerBlockId, selCell]);

  const onCellClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const idx = cellIndexAt(e.clientX - rect.left, e.clientY - rect.top, BLOCK_CELL, 2, 2);
    if (idx === null) return;
    setSelCell(idx);
    const cell = doc.blocks[composerBlockId]?.cells[idx];
    if (cell) { setComposerTileIndex(cell.tile); setComposerPalLine(cell.pal); }
  }, [doc, composerBlockId, setComposerTileIndex, setComposerPalLine]);

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
            text={`block ${hex(composerBlockId)} is used in ${blockUse.cells} cells — edits affect all uses`}
            onDuplicate={duplicateBlock}
            dupLabel="Duplicate block"
          />
        )}
        <canvas
          ref={canvasRef}
          width={BLOCK_CELL * 2}
          height={BLOCK_CELL * 2}
          onClick={onCellClick}
          style={{ ...styles.gridCanvas, cursor: 'pointer' }}
        />
        <div style={styles.rowWrap}>
          <span style={styles.dim}>Cell {['TL', 'TR', 'BL', 'BR'][selCell]} · tile {hex(cell.tile)}</span>
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
        <div style={styles.paletteHead}>Tiles ({tileCount}) · click to set cell {['TL', 'TR', 'BL', 'BR'][selCell]}</div>
        <div style={styles.paletteStrip}>
          {Array.from({ length: tileCount }, (_, id) => (
            <TileThumb
              key={id} doc={doc} tileIndex={id} palLine={cell.pal} size={26} versionKey={versionKey}
              selected={id === cell.tile} locked={tileLockReason(range, id) !== null}
              usage={usage.tileUsage(id)}
              onSelect={(t) => { editCell({ tile: t }); setComposerTileIndex(t); }}
            />
          ))}
        </div>
        <div style={styles.hintRow}>selected tile {hex(composerTileIndex)} · switch to the Tile tab to edit its pixels</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tile tab — 8x8 pixel editor for the selected tile
// ---------------------------------------------------------------------------

const PX = 26; // px per pixel → 208px editor

function TileTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerTileIndex = useClassicLevelStore((s) => s.composerTileIndex);
  const composerPalLine = useClassicLevelStore((s) => s.composerPalLine);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  const range = useEditableTileRange();

  const [colorIndex, setColorIndex] = useState(1);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<Map<number, number> | null>(null); // pixel index → color index
  useEscapeCancel(strokeRef, redraw); // Esc cancels an in-progress tile stroke

  const lockReason = tileLockReason(range, composerTileIndex);
  const locked = lockReason !== null;
  const palette = doc.palettes[composerPalLine] ?? doc.palettes[0] ?? new Uint16Array(16);
  const tileCount = Math.floor(doc.tiles.length / 32);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, PX * 8, PX * 8);
    if (composerTileIndex >= tileCount) return;
    const px = readTilePixels(doc.tiles, composerTileIndex);
    const stroke = strokeRef.current;
    if (stroke) for (const [i, ci] of stroke) px[i] = ci;
    for (let i = 0; i < 64; i++) {
      const x = (i % 8) * PX, y = ((i / 8) | 0) * PX;
      const idx = px[i];
      if (idx === 0) {
        // transparent → checker
        ctx.fillStyle = ((i % 8 + ((i / 8) | 0)) & 1) ? COMPOSER_CHECK_A : COMPOSER_CHECK_B;
        ctx.fillRect(x, y, PX, PX);
      } else {
        const c = decodeGenesisColor(palette[idx] ?? 0);
        ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        ctx.fillRect(x, y, PX, PX);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * PX, 0); ctx.lineTo(i * PX, PX * 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * PX); ctx.lineTo(PX * 8, i * PX); ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, composerTileIndex, composerPalLine, chunkEpoch, tileCount]);

  const pixelAt = useCallback((e: React.MouseEvent): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return cellIndexAt(e.clientX - rect.left, e.clientY - rect.top, PX, 8, 8);
  }, []);

  const onDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || locked) return;
    const i = pixelAt(e);
    if (i === null) return;
    const acc = new Map<number, number>();
    acc.set(i, colorIndex);
    strokeRef.current = acc;
    redraw();
  }, [pixelAt, locked, colorIndex, redraw]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    const i = pixelAt(e);
    if (i === null || stroke.get(i) === colorIndex) return;
    stroke.set(i, colorIndex);
    redraw();
  }, [pixelAt, colorIndex, redraw]);

  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    if (!stroke || !stroke.size) { redraw(); return; }
    const px = readTilePixels(doc.tiles, composerTileIndex);
    for (const [i, ci] of stroke) px[i] = ci;
    const res = classicEditTiles([{ tileIndex: composerTileIndex, data: packTilePixels(px) }]);
    if (!res.ok) useToastStore.getState().addToast(`Tile edit failed: ${res.error}`, 'error');
    redraw();
  }, [doc, composerTileIndex, redraw]);

  const tileUse = usage.tileUsage(composerTileIndex);

  return (
    <div style={styles.tabBody}>
      <div style={styles.editorCol}>
        <div style={styles.rowWrap}>
          <span style={styles.title}>Tile {hex(composerTileIndex)}</span>
          <span style={styles.count}>in {tileUse.containers} block{tileUse.containers === 1 ? '' : 's'} · {tileUse.cells} cell{tileUse.cells === 1 ? '' : 's'}</span>
        </div>
        {locked && (
          <div style={{ ...styles.banner, background: 'rgba(255,70,70,0.12)', borderColor: 'rgba(255,70,70,0.4)' }}>
            🔒 tile {hex(composerTileIndex)} is locked: {lockReason}
          </div>
        )}
        {!locked && tileUse.cells > 1 && (
          <SharedBanner text={`tile ${hex(composerTileIndex)} is used in ${tileUse.cells} block cells — edits affect all uses`} />
        )}
        <canvas
          ref={canvasRef}
          width={PX * 8}
          height={PX * 8}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={endStroke}
          onMouseLeave={() => { strokeRef.current = null; redraw(); }}
          style={{ ...styles.gridCanvas, cursor: locked ? 'not-allowed' : 'crosshair', opacity: locked ? 0.6 : 1 }}
        />
        <div style={styles.rowWrap}>
          <span style={styles.dim}>Line:</span>
          {[0, 1, 2, 3].map((p) => (
            <Chip key={p} active={composerPalLine === p} onClick={() => setComposerPalLine(p)}>{p}</Chip>
          ))}
          <Divider />
          <span style={styles.dim}>Pencil</span>
        </div>
        <div style={styles.swatchRow}>
          {Array.from({ length: 16 }, (_, i) => {
            const c = decodeGenesisColor(palette[i] ?? 0);
            const bg = i === 0 ? 'transparent' : `rgb(${c.r},${c.g},${c.b})`;
            return (
              <button
                key={i}
                onClick={() => setColorIndex(i)}
                title={i === 0 ? 'index 0 — transparent' : `index ${i}`}
                style={{
                  width: 22, height: 22, flexShrink: 0, cursor: 'pointer', borderRadius: 3,
                  background: bg,
                  backgroundImage: i === 0 ? `linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,transparent 25%,transparent 75%,${COMPOSER_SWATCH_A} 75%),linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,${COMPOSER_SWATCH_B} 25%,${COMPOSER_SWATCH_B} 75%,${COMPOSER_SWATCH_A} 75%)` : undefined,
                  backgroundSize: i === 0 ? '8px 8px' : undefined,
                  backgroundPosition: i === 0 ? '0 0,4px 4px' : undefined,
                  border: colorIndex === i ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dock shell
// ---------------------------------------------------------------------------

const TABS: { id: ComposerTab; label: string }[] = [
  { id: 'chunk', label: 'Chunk' },
  { id: 'block', label: 'Block' },
  { id: 'tile', label: 'Tile' },
];

/**
 * The classic composer dock (Task B3): tile/block/chunk content editing with a
 * shared selection context and shared-structure UX (usage counts + shared-edit
 * warnings + duplicate-then-edit). Sits above the ChunkPicker in the bottom area,
 * collapsible so it never crowds the viewport when not in use. Level-art editing
 * is self-contained here — deliberately NOT wired into aeon's Art mode (S1's
 * strict shared semantics get purpose-built UX).
 */
export default function ClassicComposerDock() {
  const status = useClassicLevelStore((s) => s.status);
  const doc = useClassicLevelStore((s) => s.doc);
  const open = useClassicLevelStore((s) => s.composerOpen);
  const setOpen = useClassicLevelStore((s) => s.setComposerOpen);
  const tab = useClassicLevelStore((s) => s.composerTab);
  const setTab = useClassicLevelStore((s) => s.setComposerTab);

  // Usage index — rebuilt on every doc change (the doc is small). Recomputes on
  // the identity churn a command produces, so counts stay exact after edits AND
  // after undo/redo (which restore a prior doc identity).
  const usage = useMemo(() => (doc ? buildUsageIndex(doc) : null), [doc]);

  // Undo/redo can shrink the pools under a stale selection (an added chunk/block
  // undone away). Selection is UI state, not in the undo snapshot — clamp it back
  // into range whenever the doc changes so no tab addresses a vanished entity.
  useEffect(() => {
    if (!doc) return;
    const s = useClassicLevelStore.getState();
    const tileCount = Math.floor(doc.tiles.length / 32);
    if (s.composerBlockId >= doc.blocks.length) s.setComposerBlockId(Math.max(0, doc.blocks.length - 1));
    if (s.composerTileIndex >= tileCount) s.setComposerTileIndex(Math.max(0, tileCount - 1));
    if (s.selectedChunkId > doc.chunks.length) s.setSelectedChunkId(0);
  }, [doc]);

  if (status !== 'ready' || !doc || !usage) return null;

  return (
    <div style={styles.dock}>
      <div style={styles.dockHead}>
        <button onClick={() => setOpen(!open)} style={styles.collapseBtn} title={open ? 'Collapse composer' : 'Expand composer'}>
          {open ? '▾' : '▸'} Composer
        </button>
        {open && (
          <div style={styles.tabBar}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
              >{t.label}</button>
            ))}
          </div>
        )}
        <span style={{ flex: 1 }} />
        {open && <span style={styles.dockHint}>shared tile/block/chunk editing — usage counts warn before shared edits</span>}
      </div>
      {open && (
        <div style={styles.dockContent}>
          {tab === 'chunk' && <ChunkTab doc={doc} usage={usage} />}
          {tab === 'block' && <BlockTab doc={doc} usage={usage} />}
          {tab === 'tile' && <TileTab doc={doc} usage={usage} />}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dock: { display: 'flex', flexDirection: 'column', borderTop: `1px solid ${T.border}`, background: T.void, flexShrink: 0 },
  dockHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px', borderBottom: `1px solid ${T.border}` },
  collapseBtn: {
    background: 'transparent', border: 'none', color: T.textBase, cursor: 'pointer',
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 4px',
  },
  tabBar: { display: 'flex', gap: 2 },
  tabBtn: {
    background: 'transparent', border: `1px solid transparent`, color: T.textLo,
    padding: '2px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
  },
  tabBtnActive: { background: T.accent, color: T.onAccent, borderColor: T.accent, fontWeight: 600 },
  dockHint: { fontSize: 9, color: T.textFaint },
  dockContent: { maxHeight: 380, overflowY: 'auto', overflowX: 'auto' },
  tabBody: { display: 'flex', gap: 12, padding: 10, alignItems: 'flex-start' },
  editorCol: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  paletteCol: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220, maxWidth: 360, flex: 1 },
  paletteHead: { fontSize: 10, color: T.textLo, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  paletteStrip: {
    display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 3,
    maxHeight: 300, overflowY: 'auto', padding: 2, background: T.surface, borderRadius: 3,
  },
  gridCanvas: { display: 'block', imageRendering: 'pixelated', background: CANVAS_BLACK, border: `1px solid ${T.border}`, borderRadius: 3 },
  rowWrap: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 12, fontWeight: 600, color: T.textHi, fontFamily: T.fontMono },
  count: { fontSize: 10, color: T.textLo, fontFamily: T.fontMono },
  dim: { fontSize: 10, color: T.textLo },
  hintRow: { fontSize: 9, color: T.textFaint },
  notice: { fontSize: 11, color: T.textLo, padding: '12px 4px', maxWidth: 320, lineHeight: 1.5 },
  banner: {
    display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: T.textBase,
    background: 'rgba(255,170,60,0.12)', border: '1px solid rgba(255,170,60,0.4)',
    borderRadius: 3, padding: '4px 8px', maxWidth: 340,
  },
  dupBtn: {
    background: T.accent, color: T.onAccent, border: 'none', borderRadius: 3,
    padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  smallBtn: {
    background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: 3,
    padding: '2px 8px', fontSize: 10, cursor: 'pointer',
  },
  swatchRow: { display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: PX * 8 },
};
