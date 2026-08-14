import React, { useCallback, useEffect, useMemo } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import type { EditableTileRange } from '../../../core/project/adapter';
import { CANVAS_BLACK } from '../../canvas/canvas-colors';
import { levelKeysEnabled } from '../../workspace/level-keys';
import type { CanvasGeom } from './composer-math';

// Shared building blocks for the composer dock's three tabs (Task B3/B4). The dock
// was split into ChunkTab/BlockTab/TileTab sibling files (a mechanical move, no
// behavior change); the pieces every tab shares live here so the split doesn't
// duplicate them: the solidity vocabulary, the editable-tile-range hook + lock
// reason, the shared-edit banner, the Escape-cancel gesture hook, a nearest-
// neighbor blit helper, and the composer `styles`.

export const hex = (n: number) => `$${n.toString(16).toUpperCase()}`;

// Solidity vocabulary — verified against SonLVLAPI's Solidity enum
//   /home/volence/sonic_hacks/programs/SonLVL/SonLVLAPI/DataTypes.cs:400
//   0 NotSolid, 1 TopSolid, 2 LRBSolid, 3 AllSolid.
export const SOLIDITY = [
  { v: 0, label: 'None', full: 'NotSolid', tint: null as string | null },
  { v: 1, label: 'Top', full: 'TopSolid', tint: 'rgba(80,160,255,0.30)' },
  { v: 2, label: 'LRB', full: 'LRBSolid', tint: 'rgba(255,170,60,0.30)' },
  { v: 3, label: 'All', full: 'AllSolid', tint: 'rgba(255,70,70,0.32)' },
];

/** The writable tile span for the open act, or null (unknown / fakes). */
export function useEditableTileRange(): EditableTileRange | null {
  const ref = useClassicLevelStore((s) => s.ref);
  const handle = useClassicProjectStore((s) => s.handle);
  return useMemo(() => {
    if (!ref || !handle?.levels?.editableTileRange) return null;
    return handle.levels.editableTileRange(ref);
  }, [ref, handle]);
}

// The lock predicate itself lives in core (project/editable-tiles) so the UI and
// the command that actually refuses the commit cannot drift, and so it is
// reachable from the node-only test suite — this file is .tsx, which vitest does
// not collect. Re-exported here because every composer tab imports it from the
// shared module.
export { tileLockReason } from '../../../core/project/editable-tiles';

/** An inline shared-edit warning banner with an optional Duplicate action. */
export function SharedBanner({ text, onDuplicate, dupLabel }: { text: string; onDuplicate?: () => void; dupLabel?: string }) {
  return (
    <div style={styles.banner}>
      <span style={{ flex: 1 }}>⚠ {text}</span>
      {onDuplicate && (
        <button onClick={onDuplicate} style={styles.dupBtn}>{dupLabel ?? 'Duplicate'}</button>
      )}
    </div>
  );
}

/** Whether a keyboard event targets a text-entry field (Escape belongs to it). */
export function isTypingTarget(t: HTMLElement): boolean {
  return t.isContentEditable || t.tagName === 'TEXTAREA'
    || (t.tagName === 'INPUT' && !['range', 'checkbox', 'button', 'radio'].includes((t as HTMLInputElement).type));
}

/**
 * Register a window Escape handler for a composer tab, under the two guards
 * every one of them needs: inert while a sprite-doc tab owns the keyboard (the
 * classic composer is keep-alive/hidden then — see workspace/level-keys.ts,
 * finding 1), and inert while a text field has focus, where Escape belongs to
 * the field.
 *
 * The guards are here rather than in each tab because they are what makes an
 * Escape binding SAFE, and a tab that reimplemented the keydown would be a tab
 * that could forget one. `handler` decides only whether there is anything to
 * cancel.
 */
export function useEscapeKey(handler: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!levelKeysEnabled()) return;
      if (e.key !== 'Escape') return;
      if (isTypingTarget(e.target as HTMLElement)) return;
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler]);
}

/**
 * Escape cancels an in-progress canvas gesture held as a `strokeRef` Map (the
 * Chunk and Block tabs' hand-rolled paint) — matching the viewport's gesture
 * cancel. The Tile tab's stroke lives inside a PixelEditController instead and
 * cancels through `useEscapeKey` directly.
 */
export function useEscapeCancel(strokeRef: React.MutableRefObject<Map<number, number> | null>, redraw: () => void): void {
  useEscapeKey(useCallback(() => {
    if (strokeRef.current) { strokeRef.current = null; redraw(); }
  }, [strokeRef, redraw]));
}

/**
 * Finish an in-progress canvas gesture on the window's mouseup — wherever the
 * button is actually released.
 *
 * WHY: the hand-rolled tab editors are small canvases (the Chunk tab's grid is
 * 320px square), so a paint drag leaves them constantly. They used to hang the
 * commit off the canvas's own `onMouseUp` and additionally DISCARD the whole
 * stroke on `onMouseLeave`, which meant any drag that crossed the edge silently
 * threw the user's work away — no commit, no message, nothing on the canvas.
 * Ending on the window instead is what every paint tool does, and it leaves
 * Escape (useEscapeCancel) as the ONE deliberate cancel.
 *
 * `endStroke` must be idempotent — the canvas's own onMouseUp may fire first.
 *
 * ONE CALLER TODAY: ChunkTab. BlockTab commits per click rather than per drag
 * and only borrows the latest-ref idiom (see its note); the Tile tab's release
 * is PixelViewport's pointer capture, which needs no window listener. Kept
 * shared because the two hand-rolled tabs remain a pair and either could grow a
 * drag back.
 */
export function useWindowStrokeEnd(endStroke: () => void): void {
  const latest = React.useRef(endStroke);
  useEffect(() => { latest.current = endStroke; }, [endStroke]);
  useEffect(() => {
    const onUp = (): void => latest.current();
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);
}

/**
 * Read a canvas's live box geometry for the hit-test math in composer-math.
 *
 * Kept as a one-liner DOM reader so the actual mapping stays pure and node-
 * testable (this file is .tsx, which vitest does not collect — same reason
 * tileLockReason lives in core). `clientLeft`/`clientTop` ARE the left/top
 * border widths, and `clientWidth`/`clientHeight` the rendered content size, so
 * no getComputedStyle parse is needed on this per-mousemove path.
 */
export function canvasGeom(canvas: HTMLCanvasElement): CanvasGeom {
  const rect = canvas.getBoundingClientRect();
  return {
    left: rect.left, top: rect.top,
    borderLeft: canvas.clientLeft, borderTop: canvas.clientTop,
    cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
    width: canvas.width, height: canvas.height,
  };
}

/**
 * Draw a small RGBA buffer scaled (nearest-neighbor) into a canvas via a temp
 * canvas. The ONE composer blit helper — shared by the tab editors and the
 * composer thumbnails (both were near-identical copies).
 */
export function drawBufferScaled(
  canvas: HTMLCanvasElement | null, buf: Uint8ClampedArray,
  srcW: number, srcH: number, dstW: number, dstH: number,
): void {
  // willReadFrequently keeps both the destination (composer tab / thumbnail) canvas
  // and the temp upscale-source CPU-backed. These are pixel-art putImageData +
  // nearest-neighbor blits — a GPU texture buys nothing, and on GPU-poor machines
  // (NVKMS/GEM allocation failures) canvas promotion is a stall path. Matches the
  // classic viewport's CPU-canvas strategy. NOTE: getContext options only apply on
  // the FIRST call for a canvas — the tab editors that call getContext directly
  // (before drawBufferScaled) set the same option there so their context is CPU-
  // backed too.
  const ctx = canvas?.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, dstW, dstH);
  const tmp = document.createElement('canvas');
  tmp.width = srcW; tmp.height = srcH;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });
  if (!tctx) return;
  const img = tctx.createImageData(srcW, srcH);
  img.data.set(buf);
  tctx.putImageData(img, 0, 0);
  ctx.drawImage(tmp, 0, 0, dstW, dstH);
}

export const styles: Record<string, React.CSSProperties> = {
  // THE CANVAS, not a bottom strip. Until task 9 this carried `borderTop` (the
  // rule separating it from the map above) and `flexShrink: 0` (so it kept its
  // content height in a column that also held the viewport). In the shell's
  // canvas slot both were wrong: the border read as a stray rule across the top
  // of the screen, and not growing left the composer a bordered card floating
  // above two thirds of empty window. `flex: 1` + `minHeight: 0` is what
  // MapViewport gets in the same slot.
  dock: { display: 'flex', flexDirection: 'column', background: T.void, flex: 1, minHeight: 0 },
  dockHead: { display: 'flex', alignItems: 'center', gap: 10, padding: '2px 8px', borderBottom: `1px solid ${T.border}` },
  tabBar: { display: 'flex', gap: 2 },
  tabBtn: {
    background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', color: T.textLo,
    padding: '2px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
  },
  tabBtnActive: { background: T.accent, color: T.onAccent, borderColor: T.accent, fontWeight: 600 },
  dockHint: { fontSize: 9, color: T.textFaint },
  // `maxHeight: 380` was the strip's cap on how much of the window it could take
  // from the map. As the canvas there is no map to protect, and the cap left a
  // hard edge with empty space below it — so it grows instead, and scrolls
  // inside itself when the open tier needs more room than the slot has.
  dockContent: { flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto' },
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
    background: 'rgba(255,170,60,0.12)', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(255,170,60,0.4)',
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
  swatchRow: { display: 'flex', gap: 3, flexWrap: 'wrap' },
};
