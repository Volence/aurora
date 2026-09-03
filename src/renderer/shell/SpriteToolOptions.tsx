import React from 'react';
import { useSpriteStore } from '../state/spriteStore';
import type { SpriteTool, SpriteTransform } from '../state/spriteStore';
import { OptionBar, Chip, Divider, NumberField, T } from '../components/ui';
import { actAndDropFocus } from '../components/ui/act-and-drop-focus';
import {
  GlyphButton, TransformGrid, DitherConfig, MirrorButton, ZoomControl,
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
  const selection = useSpriteStore((s) => s.selection);
  const clipboard = useSpriteStore((s) => s.clipboard);

  const cur = frames[currentIndex];
  const square = cur.width === cur.height;
  const st = useSpriteStore.getState;

  return (
    <OptionBar>
      {/* New-sprite size presets + custom size.
          ⚠ THESE CHIPS ACT AND THEN DROP FOCUS (d-27) — and they are the
          SHARPEST case the survey found, sharper than the collision wipes the
          ruling was made on. `newSprite` replaces the whole sprite document —
          every frame, every anim step, the origin — AND calls
          `activeSpriteHistory().clear()`, so unlike Reset/Clear this is NOT one
          Ctrl+Z away. The chips are permanently mounted in the option bar, so
          before d-27 a click left one focused and a bare Space threw the
          document away again with no confirmation and nothing to undo with.
          See `ui/act-and-drop-focus.ts`.
          SCOPE: this makes the chips drop focus and NOTHING ELSE. Whether a
          new-sprite wipe should be undoable, or should confirm, is a separate
          question filed for the owner; `newSprite` itself is untouched. */}
      <span style={{ color: T.textLo }}>New</span>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {SIZE_PRESETS.map((s) => (
          <Chip key={s} onClick={(e) => actAndDropFocus(e, () => st().newSprite(s, s))}>{s}</Chip>
        ))}
      </span>
      {/* `v || 8` USED TO BE THE EMPTY-BOX ARM: emptying the box handed this a
          `Number('')` of 0, and this turned it into an 8 the author never
          typed. The field now commits nothing for a box with no number in it,
          so an empty custom size leaves the last one standing; the clamp here
          is for a number somebody really typed. */}
      <NumberField value={newSize} min={8} max={128} width={48}
        title="custom size (px)"
        onChange={(v) => onNewSize(Math.max(8, Math.min(128, v || 8)))} />
      {/* Same writer, same ruling, its OWN dispatch line — see the block above.
          A blur wired to the preset chips and not to this one is exactly the
          shape this repo loses defects in, so the harness gives it its own
          row rather than assuming the loop above covers it. */}
      <Chip onClick={(e) => actAndDropFocus(e, () => st().newSprite(newSize, newSize))}>New □</Chip>

      <Divider />

      <Chip onClick={onFit}>Fit</Chip>
      <span style={{ color: T.textLo }}>{zoom}× · {cur.width}×{cur.height}px</span>

      <Divider />

      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: T.tXs, color: T.textLo, cursor: 'pointer' }}>
        <input type="checkbox" checked={showPieces}
          onChange={(e) => st().setShowPieces(e.target.checked)} />
        Show pieces
      </label>

      <Divider />

      {/* Tool modifiers (gated by current tool, same as the old column) */}
      {/* Pencil/line/rect honor pixel-perfect; show the toggle for those. */}
      {(tool === 'pencil' || tool === 'line' || tool === 'rect') && (
        <GlyphButton
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

      <Divider />

      <span style={{ display: 'inline-flex', gap: 4 }}>
        <Chip disabled={!selection} title="Copy selection (Ctrl+C)" onClick={() => st().copySelection()}>Copy</Chip>
        <Chip disabled={!selection} title="Cut selection (Ctrl+X)" onClick={() => st().cutSelection()}>Cut</Chip>
        <Chip disabled={!clipboard} title="Paste (Ctrl+V)" onClick={() => st().paste()}>Paste</Chip>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <ZoomControl zoom={zoom} onZoomIn={() => st().setZoom(zoom + 2)} onZoomOut={() => st().setZoom(zoom - 2)} />
      </span>
    </OptionBar>
  );
}
