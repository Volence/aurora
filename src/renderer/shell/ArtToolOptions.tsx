import React from 'react';
import { useArtStore } from '../state/artStore';
import { OptionBar, Chip, Divider, T } from '../components/ui';
import {
  ToolButton, TransformGrid, DitherConfig, MirrorButton, ZoomControl,
} from '../components/art-shared/ToolColumnParts';

// Transforms (apply to selection if present, else whole doc). Rotate is
// disabled for non-square docs; selection squareness is still guarded
// canvas-side (non-square selections silently skip).
const TRANSFORMS: Array<{ action: string; glyph: string; label: string }> = [
  { action: 'flip-h', glyph: '⇋', label: 'Flip horizontal' },
  { action: 'flip-v', glyph: '⇵', label: 'Flip vertical' },
  { action: 'rotate-90', glyph: '⟳', label: 'Rotate 90° (square docs/selections only)' },
  { action: 'shift-up', glyph: '↑', label: 'Wrap-shift up' },
  { action: 'shift-down', glyph: '↓', label: 'Wrap-shift down' },
  { action: 'shift-left', glyph: '←', label: 'Wrap-shift left' },
  { action: 'shift-right', glyph: '→', label: 'Wrap-shift right' },
];

/**
 * Art-mode tool-options bar. Holds the tool MODIFIERS relocated out of the old
 * ToolColumn — brush-space tabs, per-tool config (dither, pixel-perfect),
 * mirror, repeat preview, transforms, and zoom. Each control keeps its exact
 * prior behavior; only its host moved (column → option bar). The collision
 * tool's config (shape/flip/solidity/plane) lives in the side-panel
 * CollisionPalette instead — see workspace/facets/art-facet.tsx (ArtPanels).
 *
 * `before` is rendered at the left edge (the doc header / save info supplied by
 * workspace/facets/art-facet.tsx's ArtOptions) so the whole option row lives in
 * one OptionBar.
 */
export default function ArtToolOptions({ before }: { before?: React.ReactNode }) {
  const tool = useArtStore((s) => s.tool);
  const brushSpace = useArtStore((s) => s.brushSpace);
  const setBrushSpace = useArtStore((s) => s.setBrushSpace);
  const mirror = useArtStore((s) => s.mirror);
  const setMirror = useArtStore((s) => s.setMirror);
  const repeatPreview = useArtStore((s) => s.repeatPreview);
  const toggleRepeatPreview = useArtStore((s) => s.toggleRepeatPreview);
  const zoom = useArtStore((s) => s.zoom);
  const setZoom = useArtStore((s) => s.setZoom);
  const open = useArtStore((s) => s.open);
  const requestAction = useArtStore((s) => s.requestAction);
  const ditherPattern = useArtStore((s) => s.ditherPattern);
  const ditherSecondary = useArtStore((s) => s.ditherSecondary);
  const setDither = useArtStore((s) => s.setDither);
  const pixelPerfect = useArtStore((s) => s.pixelPerfect);
  const setPixelPerfect = useArtStore((s) => s.setPixelPerfect);

  return (
    <OptionBar>
      {before}

      {/* Brush space tabs */}
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <Chip active={brushSpace === 'pixel'} onClick={() => setBrushSpace('pixel')}>px</Chip>
        <Chip active={brushSpace === 'tile'} onClick={() => setBrushSpace('tile')}>tile</Chip>
      </span>

      <Divider />

      {/* Dither config: pattern + secondary color (0 = transparent) */}
      {tool === 'dither' && (
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary}
          onPattern={(p) => setDither(p, ditherSecondary)}
          onSecondary={(v) => setDither(ditherPattern, v)}
        />
      )}

      {/* Collision config lives in the side panel (CollisionPalette — shape/flip/
          solidity/plane), same as Map mode's paint-collision tool. */}

      {/* Mirror cycle + repeat preview */}
      <MirrorButton mirror={mirror} onChange={setMirror} />
      <ToolButton glyph="Rpt" small active={repeatPreview} title="Toggle 3×3 repeat preview" onClick={toggleRepeatPreview} />

      {/* Pixel-perfect mode (pencil / line only) */}
      {(tool === 'pencil' || tool === 'line') && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textLo }}>
          <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} />
          Pixel-perfect
        </label>
      )}

      <Divider />

      {/* Transforms (apply to selection if present, else whole doc). */}
      <span style={{ display: 'inline-flex', gap: 2 }}>
        <TransformGrid
          items={TRANSFORMS.map((t) => ({
            ...t,
            disabled: !open || (t.action === 'rotate-90' && open.doc.widthTiles !== open.doc.heightTiles),
          }))}
          onAction={requestAction}
        />
      </span>

      <Divider />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <ZoomControl zoom={zoom} onZoomIn={() => setZoom(zoom * 2)} onZoomOut={() => setZoom(zoom / 2)} />
      </span>
    </OptionBar>
  );
}
