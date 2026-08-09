import React, { useRef, useEffect, useState, useCallback } from 'react';
import { T, Chip, Divider } from '../ui';
import { useClassicLevelStore, classicEditTiles } from '../../state/classicLevelStore';
import { useToastStore } from '../../state/toastStore';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { UsageIndex } from '../../../core/level-classic/usage-index';
import { decodeGenesisColor } from '../../../core/formats/palette';
import { cellIndexAt, readTilePixels, packTilePixels } from './composer-math';
import { COMPOSER_CHECK_A, COMPOSER_CHECK_B, COMPOSER_SWATCH_A, COMPOSER_SWATCH_B } from '../../canvas/canvas-colors';
import { hex, SharedBanner, useEditableTileRange, tileLockReason, useEscapeCancel, styles } from './composer-shared';

// Tile tab — 8x8 pixel editor for the selected tile (16-color row from the act
// palette; pencil only). One classicEditTiles per stroke. Anim/gap tiles lock.

const PX = 26; // px per pixel → 208px editor

export default function TileTab({ doc, usage }: { doc: LevelDoc; usage: UsageIndex }) {
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
