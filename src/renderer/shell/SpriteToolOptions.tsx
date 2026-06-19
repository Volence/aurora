import React from 'react';
import { useSpriteStore } from '../state/spriteStore';
import type { SpriteTool, SpriteTransform } from '../state/spriteStore';
import { OptionBar, Chip, Divider, NumberField, T } from '../components/ui';
import {
  ToolButton, TransformGrid, DitherConfig, MirrorButton, ZoomControl,
} from '../components/art-shared/ToolColumnParts';

const SIZE_PRESETS = [16, 24, 32, 48, 64];

const TRANSFORMS: Array<{ action: SpriteTransform; glyph: string; label: string }> = [
  { action: 'flip-h', glyph: '⇋', label: 'Flip horizontal' },
  { action: 'flip-v', glyph: '⇵', label: 'Flip vertical' },
  { action: 'rotate-90', glyph: '⟳', label: 'Rotate 90° (square frames only)' },
];

/**
 * Sprite-mode tool-options bar. Holds the relocated top-bar controls (New-size
 * presets + custom size, Fit, zoom/dims readout, Show-pieces toggle) AND the
 * sprite tool MODIFIERS relocated out of the old SpriteToolColumn
 * (pixel-perfect, dither config, mirror, zoom, transforms). Each control keeps
 * its exact prior behavior; only its host moved (top-bar / column → option bar).
 *
 * `newSize` / `onNewSize` / `onFit` ride from SpriteMode, which owns the local
 * custom-size input state and the fit-to-view ref math.
 */
export default function SpriteToolOptions({
  newSize, onNewSize, onFit,
}: {
  newSize: number;
  onNewSize: (v: number) => void;
  onFit: () => void;
}) {
  const tool = useSpriteStore((s) => s.tool);
  const zoom = useSpriteStore((s) => s.zoom);
  const showPieces = useSpriteStore((s) => s.showPieces);
  const mirror = useSpriteStore((s) => s.mirror);
  const pixelPerfect = useSpriteStore((s) => s.pixelPerfect);
  const ditherPattern = useSpriteStore((s) => s.ditherPattern);
  const ditherSecondary = useSpriteStore((s) => s.ditherSecondary);
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);

  const cur = frames[currentIndex];
  const square = cur.width === cur.height;
  const st = useSpriteStore.getState;

  return (
    <OptionBar>
      {/* New-sprite size presets + custom size */}
      <span style={{ color: T.textLo }}>New</span>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {SIZE_PRESETS.map((s) => (
          <Chip key={s} onClick={() => st().newSprite(s, s)}>{s}</Chip>
        ))}
      </span>
      <NumberField value={newSize} min={8} max={128} width={48}
        title="custom size (px)"
        onChange={(v) => onNewSize(Math.max(8, Math.min(128, v || 8)))} />
      <Chip onClick={() => st().newSprite(newSize, newSize)}>New □</Chip>

      <Divider />

      <Chip onClick={onFit}>Fit</Chip>
      <span style={{ color: T.textLo }}>{zoom}× · {cur.width}×{cur.height}px</span>

      <Divider />

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textLo, cursor: 'pointer' }}>
        <input type="checkbox" checked={showPieces}
          onChange={(e) => st().setShowPieces(e.target.checked)} />
        Show pieces
      </label>

      <Divider />

      {/* Tool modifiers (gated by current tool, same as the old column) */}
      {/* Pencil/line/rect honor pixel-perfect; show the toggle for those. */}
      {(tool === 'pencil' || tool === 'line' || tool === 'rect') && (
        <ToolButton
          glyph="PP" small active={pixelPerfect}
          title="Pixel-perfect strokes (no doubled corner pixels)"
          onClick={() => st().setPixelPerfect(!pixelPerfect)}
        />
      )}

      {tool === 'dither' && (
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary}
          onPattern={(p) => st().setDither(p, ditherSecondary)}
          onSecondary={(v) => st().setDither(ditherPattern, v)}
        />
      )}

      <MirrorButton mirror={mirror} onChange={(m) => st().setMirror(m)} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <TransformGrid
          items={TRANSFORMS.map((t) => ({ ...t, disabled: t.action === 'rotate-90' && !square }))}
          onAction={(a) => st().applyTransform(a)}
        />
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <ZoomControl zoom={zoom} onZoomIn={() => st().setZoom(zoom + 2)} onZoomOut={() => st().setZoom(zoom - 2)} />
      </span>
    </OptionBar>
  );
}
