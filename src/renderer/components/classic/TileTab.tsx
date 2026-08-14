import React, { useRef, useEffect, useState, useCallback } from 'react';
import { T, Chip, Divider } from '../ui';
import { useClassicLevelStore, classicEditTiles } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import { cellIndexAt, readTilePixels, packTilePixels, floodFillTile } from './composer-math';
import { TileThumb } from './composer-thumbs';
import { COMPOSER_CHECK_A, COMPOSER_CHECK_B, COMPOSER_SWATCH_A, COMPOSER_SWATCH_B } from '../../canvas/canvas-colors';
import {
  hex, SharedBanner, useEditableTileRange, tileLockReason, useEscapeCancel,
  useWindowStrokeEnd, styles,
} from './composer-shared';

// Tile tab — 8x8 pixel editor for the selected tile (16-color row from the act
// palette; pencil + fill, right-click eyedrops a pixel's color). One
// classicEditTiles per stroke/fill/paste. Anim/gap tiles lock. The right column
// is a BROWSE-ONLY tile strip (unlike the Block tab's strip, which assigns the
// clicked tile to a block cell) — selecting here never mutates anything.

const PX = 26; // px per pixel → 208px editor

type TileTool = 'pencil' | 'fill';

export default function TileTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
  const composerTileIndex = useClassicLevelStore((s) => s.composerTileIndex);
  const setComposerTileIndex = useClassicLevelStore((s) => s.setComposerTileIndex);
  const composerPalLine = useClassicLevelStore((s) => s.composerPalLine);
  const setComposerPalLine = useClassicLevelStore((s) => s.setComposerPalLine);
  const tileClipboard = useClassicLevelStore((s) => s.tileClipboard);
  const setTileClipboard = useClassicLevelStore((s) => s.setTileClipboard);
  const chunkEpoch = useClassicLevelStore((s) => s.chunkEpoch);
  // Fine clocks for the browse-only tile strip's per-thumbnail version key.
  const paletteEpoch = useClassicLevelStore((s) => s.paletteEpoch);
  const tileVersions = useClassicLevelStore((s) => s.tileVersions);
  const range = useEditableTileRange();

  const [colorIndex, setColorIndex] = useState(1);
  const [tool, setTool] = useState<TileTool>('pencil');
  // The in-progress stroke lives in a REF (mutated per pixel, no re-render per
  // move), so `strokeVersion` is what tells the paint effect below that the ref
  // moved. It MUST stay in that effect's dep list: without it `redraw()` bumped a
  // state nothing depended on, the effect never re-ran, and the pencil drew
  // nothing at all until the commit replaced `doc`.
  const [strokeVersion, force] = useState(0);
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
    // willReadFrequently keeps this editor canvas CPU-backed (GPU-poor resilience,
    // same as the classic viewport). Set on the first getContext for the canvas so
    // the option is honored.
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
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
  }, [doc, composerTileIndex, composerPalLine, chunkEpoch, tileCount, strokeVersion]);

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
    if (tool === 'fill') {
      // A fill is a click gesture: stage the region as a stroke so Esc still
      // cancels it and the shared endStroke commit path applies (one undo step).
      const px = readTilePixels(doc.tiles, composerTileIndex);
      const region = floodFillTile(px, i, colorIndex);
      if (!region.size) return;
      strokeRef.current = region;
      redraw();
      return;
    }
    const acc = new Map<number, number>();
    acc.set(i, colorIndex);
    strokeRef.current = acc;
    redraw();
  }, [pixelAt, locked, tool, doc, composerTileIndex, colorIndex, redraw]);

  const onMove = useCallback((e: React.MouseEvent) => {
    const stroke = strokeRef.current;
    if (!stroke || tool === 'fill') return; // a fill region is not extendable by drag
    const i = pixelAt(e);
    if (i === null || stroke.get(i) === colorIndex) return;
    stroke.set(i, colorIndex);
    redraw();
  }, [pixelAt, tool, colorIndex, redraw]);

  // Idempotent: the canvas's own onMouseUp and the window-level end (below) can
  // both fire for one release, and the second call finds no stroke in flight.
  const endStroke = useCallback(() => {
    const stroke = strokeRef.current;
    if (!stroke) return; // nothing in flight — a stray release elsewhere in the app
    strokeRef.current = null;
    if (!stroke.size) { redraw(); return; }
    const px = readTilePixels(doc.tiles, composerTileIndex);
    for (const [i, ci] of stroke) px[i] = ci;
    // NOTHING may escape a pointer handler here. An uncaught throw mid-gesture
    // leaves React's event dispatch half-unwound and the whole window reads as
    // frozen, which is a far worse failure than a refused edit — so the command's
    // own invariant guards (classicLevelStore's assertSingleDomain /
    // requireClassicHistory both throw) are turned into the same visible toast a
    // clean refusal gets.
    let res;
    try {
      res = classicEditTiles([{ tileIndex: composerTileIndex, data: packTilePixels(px) }]);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Tile edit failed: ${res.error}`, 'error');
    redraw();
  }, [doc, composerTileIndex, redraw]);
  useWindowStrokeEnd(endStroke);

  // Right-click eyedrops the pixel's palette index into the pencil (matches the
  // chunk tab's right-click-eyedrop idiom). Works on locked tiles too — reading
  // a color is not an edit.
  const onContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const i = pixelAt(e);
    if (i === null) return;
    setColorIndex(readTilePixels(doc.tiles, composerTileIndex)[i]);
  }, [pixelAt, doc, composerTileIndex]);

  const copyTile = useCallback(() => {
    setTileClipboard(readTilePixels(doc.tiles, composerTileIndex));
    useToastStore.getState().addToast(`Copied tile ${hex(composerTileIndex)} — select another tile and Paste`, 'info');
  }, [doc, composerTileIndex, setTileClipboard]);

  const pasteTile = useCallback(() => {
    if (!tileClipboard || locked) return;
    let res;
    try {
      res = classicEditTiles([{ tileIndex: composerTileIndex, data: packTilePixels(tileClipboard) }]);
    } catch (e) {
      res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) useToastStore.getState().addToast(`Paste failed: ${res.error}`, 'error');
  }, [tileClipboard, locked, composerTileIndex]);

  const tileUse = usage.tileUsage(composerTileIndex);
  // A tile thumbnail bakes exactly two things: the tile's own 32 bytes and the
  // selected palette line. So it invalidates on the palette clock plus that
  // tile's own version — NOT on `chunkEpoch`, which also bumps for block edits
  // (which cannot change a tile) and for edits to any OTHER tile. Keying the
  // whole strip on chunkEpoch repainted all 965 thumbnails on every committed
  // pencil stroke; this repaints the one tile the stroke actually wrote.
  const versionKeyFor = (id: number) => `${paletteEpoch}:${tileVersions.get(id) ?? 0}`;

  return (
    <div style={styles.tabBody}>
      <div style={styles.editorCol}>
        <div style={styles.rowWrap}>
          <span style={styles.title}>Tile {hex(composerTileIndex)}</span>
          <span style={styles.count}>in {tileUse.containers} block{tileUse.containers === 1 ? '' : 's'} · {tileUse.cells} cell{tileUse.cells === 1 ? '' : 's'}</span>
          <span style={{ flex: 1 }} />
          <button onClick={copyTile} style={styles.smallBtn} title="Copy this tile's pixels">Copy</button>
          <button
            onClick={pasteTile}
            disabled={!tileClipboard || locked}
            style={{ ...styles.smallBtn, ...(!tileClipboard || locked ? { opacity: 0.4, cursor: 'default' } : {}) }}
            title={tileClipboard ? `Paste the copied pixels onto tile ${hex(composerTileIndex)}` : 'Nothing copied yet'}
          >Paste</button>
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
          onContextMenu={onContext}
          style={{ ...styles.gridCanvas, cursor: locked ? 'not-allowed' : 'crosshair', opacity: locked ? 0.6 : 1 }}
        />
        <div style={styles.rowWrap}>
          <span style={styles.dim}>Line:</span>
          {[0, 1, 2, 3].map((p) => (
            <Chip key={p} active={composerPalLine === p} onClick={() => setComposerPalLine(p)}>{p}</Chip>
          ))}
          <Divider />
          <Chip active={tool === 'pencil'} onClick={() => setTool('pencil')}>Pencil</Chip>
          <Chip active={tool === 'fill'} onClick={() => setTool('fill')} title="Flood-fill the clicked region">Fill</Chip>
        </div>
        <div style={{ ...styles.swatchRow, maxWidth: PX * 8 }}>
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
                  backgroundColor: bg,
                  backgroundImage: i === 0 ? `linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,transparent 25%,transparent 75%,${COMPOSER_SWATCH_A} 75%),linear-gradient(45deg,${COMPOSER_SWATCH_A} 25%,${COMPOSER_SWATCH_B} 25%,${COMPOSER_SWATCH_B} 75%,${COMPOSER_SWATCH_A} 75%)` : undefined,
                  backgroundSize: i === 0 ? '8px 8px' : undefined,
                  backgroundPosition: i === 0 ? '0 0,4px 4px' : undefined,
                  border: colorIndex === i ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                }}
              />
            );
          })}
        </div>
        <div style={styles.hintRow}>right-click the canvas to eyedrop a color</div>
      </div>
      <div style={styles.paletteCol}>
        <div style={styles.paletteHead}>Tiles ({tileCount}) · click to edit</div>
        <div style={styles.paletteStrip}>
          {Array.from({ length: tileCount }, (_, id) => (
            <TileThumb
              key={id} doc={doc} tileIndex={id} palLine={composerPalLine} size={26} versionKey={versionKeyFor(id)}
              selected={id === composerTileIndex} locked={tileLockReason(range, id) !== null}
              usage={usage.tileUsage(id)}
              onSelect={setComposerTileIndex}
            />
          ))}
        </div>
        <div style={styles.hintRow}>browse-only — selecting never edits · badge = used-in count · no badge = unused (safe to repurpose) · 🔒 = view-only</div>
      </div>
    </div>
  );
}
