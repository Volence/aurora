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
/**
 * What the position field shows when the cursor is off the surface.
 *
 * This was a bare em dash, and it was the ONE occurrence in this sweep that was
 * not punctuation at all: it is a placeholder GLYPH, so the repair is a chosen
 * character, not a rewritten sentence. Two ASCII hyphens, because:
 *   - the populated form of this field is `x, y`, and x/y can be NEGATIVE, so a
 *     single `-` in a coordinate readout is a number the reader has to rule out;
 *     `--` cannot be the start of one.
 *   - the HUD is monospaced, so an ASCII pair keeps the field a fixed width and
 *     needs no font that carries U+2014.
 *   - `·` was rejected: this codebase already spends the middle dot as a FIELD
 *     SEPARATOR (see the collision picker's status line), so reusing it for
 *     "empty" would make one glyph mean two things in the same window.
 */
const NO_READING = '--';

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
        if (posRef.current) posRef.current.textContent = NO_READING;
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
      fontFamily: T.fontMono, fontSize: T.tXs, color: T.textBase,
    }}>
      <span ref={posRef}>{NO_READING}</span>
      <span ref={zoomRef} style={{ color: T.textLo }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span ref={swatchRef} style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${T.border}` }} />
        <span ref={idxRef} />
      </span>
    </div>
  );
});
