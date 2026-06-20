import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { T } from '../ui';
import type { Color } from '../../../core/model/s4-types';

export interface PixelHudHandle {
  /** Update the readout. Pass null pixel info when the cursor leaves the surface. */
  update(info: { x: number; y: number; idx: number; color: Color | null | undefined } | null, zoom: number): void;
}

/**
 * On-canvas readout (cursor pixel x/y, zoom, hovered color) for the shared pixel
 * surfaces. Updated imperatively via its ref handle in the host's onHover — never
 * through React state — so it never triggers a canvas re-blit. Place it inside a
 * position:relative wrapper that does NOT scroll (a sibling of the scroll
 * container), so it stays pinned to the corner.
 */
export const PixelHud = forwardRef<PixelHudHandle>(function PixelHud(_props, ref) {
  const posRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const swatchRef = useRef<HTMLSpanElement>(null);
  const idxRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(ref, () => ({
    update(info, zoom) {
      if (zoomRef.current) zoomRef.current.textContent = `${Math.round(zoom * 100) / 100}×`;
      if (info) {
        if (posRef.current) posRef.current.textContent = `${info.x}, ${info.y}`;
        if (idxRef.current) idxRef.current.textContent = String(info.idx);
        if (swatchRef.current) swatchRef.current.style.background = info.color && info.color.a !== 0
          ? `rgb(${info.color.r},${info.color.g},${info.color.b})` : 'transparent';
      } else {
        if (posRef.current) posRef.current.textContent = '—';
        if (idxRef.current) idxRef.current.textContent = '';
        if (swatchRef.current) swatchRef.current.style.background = 'transparent';
      }
    },
  }), []);

  return (
    <div style={{
      position: 'absolute', left: 6, bottom: 6, zIndex: 5, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', gap: 8, padding: '1px 8px',
      background: 'rgba(10,12,18,0.82)', border: `1px solid ${T.border}`, borderRadius: T.rMd,
      fontFamily: T.fontMono, fontSize: 11, color: T.textBase,
    }}>
      <span ref={posRef}>—</span>
      <span ref={zoomRef} style={{ color: T.textLo }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span ref={swatchRef} style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${T.border}` }} />
        <span ref={idxRef} />
      </span>
    </div>
  );
});
