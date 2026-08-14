import React, { useRef, useEffect } from 'react';
import { T } from '../ui';
import { renderTile, renderBlock } from '../../../core/level-classic/render';
import type { LevelDoc } from '../../../core/level-classic/model';
import type { Usage } from '../../../core/level-classic/usage-index';
import { COMPOSER_BADGE_TEXT } from '../../canvas/canvas-colors';
import { drawBufferScaled } from './composer-shared';

// Reusable art thumbnails for the composer dock's tile picker and block palette
// (Task B3). Both follow the ChunkPicker caching lesson: the render effect keys
// on a `versionKey` (the store's chunkEpoch — block/tile/palette edits all bump
// it) plus the entity id, NOT the churning `doc` identity, so a selection change
// never re-renders the art and an edit re-renders only what changed.

const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;

/** Draw a small RGBA buffer scaled (nearest-neighbor) to fill a square canvas. */
function drawScaled(canvas: HTMLCanvasElement | null, buf: Uint8ClampedArray, srcW: number, srcH: number, size: number): void {
  drawBufferScaled(canvas, buf, srcW, srcH, size, size);
}

function usageTitle(kind: string, id: number, u: Usage, unit: string): string {
  if (u.cells === 0) return `${kind} ${hex(id)} · unused`;
  return `${kind} ${hex(id)} · used in ${u.containers} ${unit}${u.containers === 1 ? '' : 's'} · ${u.cells} cell${u.cells === 1 ? '' : 's'}`;
}

export const TileThumb = React.memo(function TileThumb({
  doc, tileIndex, palLine, size, versionKey, selected, locked, usage, onSelect,
}: {
  doc: LevelDoc; tileIndex: number; palLine: number; size: number; versionKey: string;
  selected: boolean; locked: boolean; usage: Usage; onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const pal = doc.palettes[palLine] ?? doc.palettes[0] ?? new Uint16Array(16);
    drawScaled(ref.current, renderTile(doc.tiles, tileIndex, pal, false, false), 8, 8, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileIndex, palLine, versionKey, size]);
  return (
    <button
      onClick={() => onSelect(tileIndex)}
      title={usageTitle('tile', tileIndex, usage, 'block')}
      style={{ ...cellStyle(size), ...(selected ? selStyle : {}) }}
    >
      <canvas ref={ref} width={size} height={size} style={canvasStyle} />
      {locked && <span style={lockBadge}>🔒</span>}
      {usage.cells > 0 && <span style={countBadge}>{usage.containers}</span>}
    </button>
  );
});

export const BlockThumb = React.memo(function BlockThumb({
  doc, blockId, size, versionKey, selected, usage, onSelect,
}: {
  doc: LevelDoc; blockId: number; size: number; versionKey: string;
  selected: boolean; usage: Usage; onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawScaled(ref.current, renderBlock(doc, blockId), 16, 16, size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId, versionKey, size]);
  return (
    <button
      onClick={() => onSelect(blockId)}
      title={usageTitle('block', blockId, usage, 'chunk')}
      style={{ ...cellStyle(size), ...(selected ? selStyle : {}) }}
    >
      <canvas ref={ref} width={size} height={size} style={canvasStyle} />
      {usage.cells > 0 && <span style={countBadge}>{usage.containers}</span>}
    </button>
  );
});

function cellStyle(size: number): React.CSSProperties {
  return {
    position: 'relative', padding: 0, width: size, height: size, flexShrink: 0,
    background: T.overlay, borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: 3,
    cursor: 'pointer', overflow: 'hidden',
  };
}
const selStyle: React.CSSProperties = { outline: `2px solid ${T.accent}`, outlineOffset: -1, borderColor: T.accent };
const canvasStyle: React.CSSProperties = { display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' };
const countBadge: React.CSSProperties = {
  position: 'absolute', right: 0, bottom: 0, fontSize: 8, lineHeight: '10px', padding: '0 2px',
  background: 'rgba(0,0,0,0.65)', color: COMPOSER_BADGE_TEXT, fontFamily: T.fontMono, borderTopLeftRadius: 3,
};
const lockBadge: React.CSSProperties = {
  position: 'absolute', left: 1, top: 0, fontSize: 9, lineHeight: '11px',
};
