import React, { useEffect, useMemo } from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { useClassicProjectStore } from '../../state/classicProjectStore';
import type { EditableTileRange } from '../../../core/project/adapter';
import { CANVAS_BLACK } from '../../canvas/canvas-colors';

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

export function tileLockReason(range: EditableTileRange | null, tileIndex: number): string | null {
  if (!range) return null;
  if (tileIndex >= range.baseTileCount) return 'gap/appended tile — not editable in v1';
  if (range.animRanges.some((r) => tileIndex >= r.start && tileIndex < r.start + r.count)) {
    return 'animated-art slot — not editable in v1';
  }
  return null;
}

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
 * Register a window Escape handler that cancels an in-progress canvas gesture
 * (a `strokeRef` Map, mutated during the drag) — matching the viewport's gesture
 * cancel. Guarded against text-entry so an Escape in a field isn't hijacked.
 */
export function useEscapeCancel(strokeRef: React.MutableRefObject<Map<number, number> | null>, redraw: () => void): void {
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
  swatchRow: { display: 'flex', gap: 3, flexWrap: 'wrap' },
};
