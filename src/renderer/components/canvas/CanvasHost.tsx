import React, { useMemo, useRef } from 'react';
import { useCanvasStore } from '../../state/canvasStore';
import PixelViewport from '../art-shared/PixelViewport';
import { PixelEditController } from '../../../core/art/pixel-edit-controller';
import type { GestureResult } from '../../../core/art/pixel-edit-controller';
import { toolConfigFrom } from '../../../core/art/tool-config';
import { decodeGenesisColor } from '../../../core/formats/palette';
import type { Color } from '../../../core/model/s4-types';
import type { PixelHudHandle } from '../art-shared/PixelHud';
import { planCanvasGrids, offeredGrids, CANVAS_GRID_STROKE } from './canvas-pane-model';

/**
 * Canvas host for the shared PixelViewport + PixelEditController — the canvas
 * counterpart of SpriteCanvasHost, and deliberately the same shape: bridge the
 * store to the shared engine, commit the result back through the store, own no
 * drawing logic of its own.
 *
 * THE ONE THING THAT DIFFERS IS THE COLOUR MODEL, and it needs no new machinery.
 * A canvas index is 0..63 and IS a palette index (canvas-doc.ts), so the whole
 * 64-colour palette goes in as `palette` — `PixelViewport.palette` is
 * `(Color | undefined)[]` with no length assumption — and no `lineMap` is
 * involved. `lineMap` exists for level art, where a pixel is a 0..15 index plus
 * a per-CELL line; here the line is in the pixel. `PixelEditController` never
 * masks a colour to 0..15, so a 0..63 paint index passes through unchanged
 * (pinned by a controller test, R6/R7).
 *
 * EVERY COMMIT GOES THROUGH THE STORE, never into the buffer. `setPixels` owns
 * the no-op check and `normalizeCanvasPixels` and records exactly one undo
 * snapshot per call — which is what makes one gesture one undo entry. Restating
 * either rule here (the sprite host does its own `diffWrites` check, because
 * spriteStore does not) would give the canvas two answers to the same question.
 */
export default function CanvasHost({ docId, hudRef, canvasRef }: {
  docId: string;
  hudRef?: React.RefObject<PixelHudHandle | null>;
  /** Handed straight to PixelViewport so CanvasMode's `useAnchoredZoom` measures
   *  its anchor off the canvas element rather than the padded holder. */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  // Subscribed per FIELD, not per document entry: `patch` builds a fresh entry
  // object on every edit, so subscribing to the entry would re-render on a
  // selection change or a save-baseline refresh as well.
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const selection = useCanvasStore((s) => s.docs.get(docId)?.selection ?? null);
  const zoom = useCanvasStore((s) => s.zoom);
  const tool = useCanvasStore((s) => s.tool);
  const mirror = useCanvasStore((s) => s.mirror);
  const pixelPerfect = useCanvasStore((s) => s.pixelPerfect);
  const ditherPattern = useCanvasStore((s) => s.ditherPattern);
  const ditherSecondary = useCanvasStore((s) => s.ditherSecondary);
  const paintIndex = useCanvasStore((s) => s.paintIndex);
  const visibleGrids = useCanvasStore((s) => s.visibleGrids);

  // The 64 CRAM words as renderable colours. Keyed on the palette array's
  // identity, which canvasStore replaces wholesale on setPalette and on
  // undo/redo — so a recolour repaints and a pencil stroke does not.
  const palette = useMemo<(Color | undefined)[]>(
    () => (doc ? doc.palette.map((w) => decodeGenesisColor(w)) : []),
    [doc?.palette],
  );

  const grids = useMemo(
    () => (doc ? planCanvasGrids(offeredGrids(doc.profileId), visibleGrids, doc.gridOrigin)
      : { layerGrids: [], underlay: [] }),
    [doc?.profileId, doc?.gridOrigin, visibleGrids],
  );

  // Grids the shared viewport cannot draw (a 256px pitch, or any pitch the
  // document's gridOrigin offsets). Same shape as the classic composer's coarse
  // grid: one path, stroked in doc space, which the viewport has already
  // translated to the art origin for us.
  const drawUnderlay = React.useCallback((ctx: CanvasRenderingContext2D, z: number) => {
    if (!doc) return;
    const w = doc.pixels.width, h = doc.pixels.height;
    for (const g of grids.underlay) {
      // The stroke comes from the plan's own table, not from a conditional here.
      // The version this replaces read `g.weight === 'coarse' ? … : …` and drew
      // an offset 8px mesh at the 16px grid's brightness — so nudging gridOrigin
      // by a pixel changed how the mesh LOOKED, and the block grid vanished into
      // the tile grid in the branch reached by caring about block alignment.
      ctx.strokeStyle = CANVAS_GRID_STROKE[g.weight];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = g.offsetX; x <= w; x += g.pitch) { ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, h * z); }
      for (let y = g.offsetY; y <= h; y += g.pitch) { ctx.moveTo(0, y * z + 0.5); ctx.lineTo(w * z, y * z + 0.5); }
      ctx.stroke();
    }
  }, [doc, grids]);

  // One persistent controller, reconfigured each render with the current tool
  // state — SpriteCanvasHost's arrangement exactly. `toolConfigFrom`'s
  // tile-space coercion is a no-op here: CanvasTool is exactly the eight pixel
  // tools.
  const controllerRef = useRef<PixelEditController | null>(null);
  const config = toolConfigFrom({
    tool, selectedColor: paintIndex, mirror, ditherPattern, ditherSecondary, pixelPerfect,
  });
  if (!controllerRef.current) controllerRef.current = new PixelEditController(config);
  controllerRef.current.setConfig(config);

  if (!doc) return null; // the document closed between the pane's check and this render

  function onCommit(r: GestureResult) {
    const st = useCanvasStore.getState();
    // No no-op check and no normalisation here — setPixels owns both, and one
    // call is one undo entry.
    //
    // THE RESIDUAL HOLE, named rather than waved at. `docId` is this render's,
    // while `r.buffer` was seeded from whichever document the gesture BEGAN on.
    // Two things keep those the same: App keys this pane by docId, so switching
    // documents remounts rather than re-points it (no controller survives the
    // switch with a gesture in flight); and a pointer capture means the
    // pointerup lands here before any click that could change tabs. What is
    // left is genuinely uncovered: if a future path re-points a LIVE pane at
    // another document mid-gesture, `setPixels` catches it only when the two
    // documents differ in SIZE. Two 128x128 canvases — the plan's own default,
    // so the likely case — would let one document's buffer land in the other,
    // with an undo entry and a dirty dot that make it look deliberate.
    st.setPixels(docId, r.buffer);
    if (r.selection !== undefined) st.setSelection(docId, r.selection);
  }

  return (
    <PixelViewport
      canvasRef={canvasRef}
      buffer={doc.pixels}
      palette={palette}
      zoom={zoom}
      controller={controllerRef.current}
      selection={selection}
      layers={{
        checkerboard: true,
        grids: grids.layerGrids,
        ...(grids.blockPx !== undefined ? { blockPx: grids.blockPx } : {}),
      }}
      drawUnderlay={drawUnderlay}
      onCommit={onCommit}
      // The eyedropper hands back a 0..63 index, which IS the paint colour —
      // no palette-line bookkeeping, unlike every other surface in the app.
      onPick={(v) => useCanvasStore.getState().setPaintIndex(v)}
      onHover={(pixel) => {
        if (!hudRef) return;
        if (pixel && pixel.x >= 0 && pixel.y >= 0 && pixel.x < doc.pixels.width && pixel.y < doc.pixels.height) {
          const idx = doc.pixels.data[pixel.y * doc.pixels.width + pixel.x];
          hudRef.current?.update({ x: pixel.x, y: pixel.y, idx, color: palette[idx] }, zoom);
        } else {
          hudRef.current?.update(null, zoom);
        }
      }}
    />
  );
}
