import React, { useRef, useEffect } from 'react';
import { T } from '../ui';
import { renderTile, renderBlock } from '../../../core/level-classic/render';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { COMPOSER_BADGE_TEXT } from '../../canvas/canvas-colors';
import { drawBufferScaled } from './composer-shared';

// Reusable art thumbnails for the composer dock's tile picker and block palette
// (Task B3). Both follow the ChunkPicker caching lesson: the render effect keys
// on a `versionKey` (the store's chunkEpoch — block/tile/palette edits all bump
// it) plus the entity id, NOT the churning `doc` identity, so a selection change
// never re-renders the art and an edit re-renders only what changed.
//
// EVERY PROP HERE IS A PRIMITIVE OR A STABLE CALLBACK, and that is load-bearing,
// not tidiness. A tab renders ~965 TileThumbs / ~439 BlockThumbs, so `React.memo`
// is the only thing standing between one committed pencil stroke and a thousand
// re-renders. These used to take the whole `LevelDoc` as a prop (read only inside
// the paint effect, which deliberately excludes it from its deps) plus a `Usage`
// OBJECT — and a commit hands back a fresh doc AND a freshly-built usage index, so
// both props were reference-unequal on every edit and the memo never held:
// measured on real GHZ act 1, ONE tile stroke re-rendered all 965 TileThumbs.
//
// That is expensive in any build (965 element creations + memo compares + fiber
// work per stroke) and catastrophic in a dev build: React 19's DEV performance
// track deep-diffs every re-rendered component's CHANGED props into the timeline
// (addObjectDiffToProperties → addValueToProperties), and `doc` carries a
// 30,880-byte tile pool, 82x256 chunk cells and 439x4 block cells. Walking that
// once per thumbnail is ~9 SECONDS of frozen main thread per committed stroke —
// the composer freeze. The doc is therefore read from the store at PAINT time
// (exactly what providers/chunk-grid-classic.ts does for the same reason) and the
// usage counts arrive as two numbers.
//
// So: do not reintroduce an object/array/inline-closure prop here. `versionKey` is
// the ONE signal that says these pixels are stale.

const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;

/** Draw a small RGBA buffer scaled (nearest-neighbor) to fill a square canvas. */
function drawScaled(canvas: HTMLCanvasElement | null, buf: Uint8ClampedArray, srcW: number, srcH: number, size: number): void {
  drawBufferScaled(canvas, buf, srcW, srcH, size, size);
}

function usageTitle(kind: string, id: number, containers: number, cells: number, unit: string): string {
  if (cells === 0) return `${kind} ${hex(id)} · unused`;
  return `${kind} ${hex(id)} · used in ${containers} ${unit}${containers === 1 ? '' : 's'} · ${cells} cell${cells === 1 ? '' : 's'}`;
}

export const TileThumb = React.memo(function TileThumb({
  tileIndex, palLine, size, versionKey, selected, locked, containers, cells, onSelect,
}: {
  tileIndex: number; palLine: number; size: number; versionKey: string;
  selected: boolean; locked: boolean;
  /** usage.tileUsage(tileIndex), destructured — see the prop note above. */
  containers: number; cells: number;
  /** MUST be referentially stable (a store action or a useCallback). */
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const doc = useClassicLevelStore.getState().doc;
    if (!doc) return;
    const pal = doc.palettes[palLine] ?? doc.palettes[0] ?? new Uint16Array(16);
    drawScaled(ref.current, renderTile(doc.tiles, tileIndex, pal, false, false), 8, 8, size);
  }, [tileIndex, palLine, versionKey, size]);
  return (
    <button
      onClick={() => onSelect(tileIndex)}
      title={usageTitle('tile', tileIndex, containers, cells, 'block')}
      style={{ ...cellStyle(size), ...(selected ? selStyle : {}) }}
    >
      <canvas ref={ref} width={size} height={size} style={canvasStyle} />
      {locked && <span style={lockBadge}>🔒</span>}
      {cells > 0 && <span style={countBadge}>{containers}</span>}
    </button>
  );
});

export const BlockThumb = React.memo(function BlockThumb({
  blockId, size, versionKey, selected, containers, cells, onSelect,
}: {
  blockId: number; size: number; versionKey: string;
  selected: boolean;
  /** usage.blockUsage(blockId), destructured — see the prop note above. */
  containers: number; cells: number;
  /** MUST be referentially stable (a store action or a useCallback). */
  onSelect: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const doc = useClassicLevelStore.getState().doc;
    if (!doc) return;
    drawScaled(ref.current, renderBlock(doc, blockId), 16, 16, size);
  }, [blockId, versionKey, size]);
  return (
    <button
      onClick={() => onSelect(blockId)}
      title={usageTitle('block', blockId, containers, cells, 'chunk')}
      style={{ ...cellStyle(size), ...(selected ? selStyle : {}) }}
    >
      <canvas ref={ref} width={size} height={size} style={canvasStyle} />
      {cells > 0 && <span style={countBadge}>{containers}</span>}
    </button>
  );
});

function cellStyle(size: number): React.CSSProperties {
  return {
    position: 'relative', padding: 0, width: size, height: size, flexShrink: 0,
    background: T.overlay, borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rMd,
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
  position: 'absolute', left: 1, top: 0, fontSize: T.t2xs, lineHeight: '11px',
};
