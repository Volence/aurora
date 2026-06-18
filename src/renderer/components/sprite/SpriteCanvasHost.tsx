import React, { useRef } from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { useArtStore } from '../../state/artStore';
import { useProjectStore, getCurrentZone } from '../../state/projectStore';
import PixelViewport from '../art-shared/PixelViewport';
import type { ViewportOverlay } from '../art-shared/PixelViewport';
import { PixelEditController, diffWrites } from '../../../core/art/pixel-edit-controller';
import type { GestureResult } from '../../../core/art/pixel-edit-controller';

/** A piece outline to overlay, in sprite-pixel coords. */
export interface OverlayRect { x: number; y: number; w: number; h: number; }

/**
 * Sprite host for the shared PixelViewport + PixelEditController. Bridges the sprite
 * store (frames/tool/mirror/dither/selection/palette override) to the engine, and
 * commits results via setBuffer/setSelection. Replaces the old standalone SpriteCanvas;
 * all drawing logic + rendering now live in the shared core.
 */
export default function SpriteCanvasHost({ overlayRects }: { overlayRects?: OverlayRect[] }) {
  const buffer = useSpriteStore((s) => s.frames[s.currentIndex]);
  const zoom = useSpriteStore((s) => s.zoom);
  const tool = useSpriteStore((s) => s.tool);
  const mirror = useSpriteStore((s) => s.mirror);
  const pixelPerfect = useSpriteStore((s) => s.pixelPerfect);
  const ditherPattern = useSpriteStore((s) => s.ditherPattern);
  const ditherSecondary = useSpriteStore((s) => s.ditherSecondary);
  const selection = useSpriteStore((s) => s.selection);
  const override = useSpriteStore((s) => s.paletteOverride);
  const selectedColor = useArtStore((s) => s.selectedColor);
  const paletteLine = useArtStore((s) => s.paletteLine);
  useArtStore((s) => s.paletteVersion); // re-render on slider edits

  const zone = getCurrentZone(useProjectStore.getState());
  const palette = override ?? zone?.palette.lines[paletteLine]?.colors ?? [];

  // One persistent controller; reconfigured each render with the current tool state.
  const controllerRef = useRef<PixelEditController | null>(null);
  const config = { tool, color: selectedColor, mirror, ditherPattern, ditherSecondary, pixelPerfect };
  if (!controllerRef.current) controllerRef.current = new PixelEditController(config);
  controllerRef.current.setConfig(config);

  const overlays: ViewportOverlay[] = (overlayRects ?? []).map((r) => ({ kind: 'outline', x: r.x, y: r.y, w: r.w, h: r.h, color: '#f9e2af' }));

  function onCommit(r: GestureResult) {
    const st = useSpriteStore.getState();
    // Only replace the frame when pixels actually changed (a bare marquee mustn't
    // clear the palette override / bump the frame).
    if (diffWrites(buffer, r.buffer).length > 0) st.setBuffer(r.buffer);
    if (r.selection !== undefined) st.setSelection(r.selection);
  }

  return (
    <PixelViewport
      buffer={buffer}
      palette={palette}
      zoom={zoom}
      controller={controllerRef.current}
      selection={selection}
      layers={{ checkerboard: true, grids: ['cell8'] }}
      overlays={overlays}
      onCommit={onCommit}
      onPick={(v) => useArtStore.getState().setSelectedColor(v)}
    />
  );
}
