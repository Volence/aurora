import React from 'react';
import { useArtStore } from '../state/artStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { OptionBar, Chip, Divider, T } from '../components/ui';
import {
  ToolButton, TransformGrid, DitherConfig, MirrorButton, ZoomControl,
} from '../components/art-shared/ToolColumnParts';
import type { Color } from '../../core/model/s4-types';

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

/** Compact CSS gradient strip previewing a palette line's 16 actual colors,
 *  in equal bands — cheaper than 16 child swatches for a tool-options chip. */
function lineGradient(colors: Color[]): string {
  if (colors.length === 0) return T.raised;
  const n = colors.length;
  const stops = colors.map((c, i) =>
    `rgb(${c.r},${c.g},${c.b}) ${(i / n) * 100}%, rgb(${c.r},${c.g},${c.b}) ${((i + 1) / n) * 100}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Palette-line picker for the palette-apply tool: four buttons (zone lines
 * 0-3), each showing a mini swatch strip of that line's actual colors so the
 * active line is identifiable at a glance. Click sets artStore.paletteLine —
 * same store field PaletteEditor's swatch grid writes, so the two stay in
 * sync (this is a second entry point onto the same selection, not a copy of
 * it). Pulls the zone palette the same way PaletteEditor does: getCurrentZone
 * off the live project state, re-read on project/history/palette-version
 * changes so live palette edits (slider drags) repaint the strips too.
 */
function PaletteLinePicker() {
  useProjectStore((s) => s.project);
  useHistoryVersion();
  useArtStore((s) => s.paletteVersion);
  const paletteLine = useArtStore((s) => s.paletteLine);
  const setPaletteLine = useArtStore((s) => s.setPaletteLine);
  const zone = getCurrentZone(useProjectStore.getState());
  const lines = zone ? zone.palette.lines : [];

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {[0, 1, 2, 3].map((li) => {
        const active = paletteLine === li;
        return (
          <button
            key={li}
            type="button"
            title={`Palette line ${li}`}
            onClick={() => setPaletteLine(li)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '2px 4px', background: active ? T.accent : T.raised,
              border: `1px solid ${active ? T.accent : T.border}`, borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 9, lineHeight: 1, color: active ? T.onAccent : T.textLo }}>{li}</span>
            <span style={{
              width: 32, height: 8, borderRadius: 2,
              background: lineGradient(lines[li]?.colors ?? []),
              border: `1px solid ${T.borderStrong}`,
            }} />
          </button>
        );
      })}
    </span>
  );
}

/**
 * WHICH OPTION CONTROLS THE HOST CAN ACTUALLY ACT ON.
 *
 * The bar is shared, its store is a CROSS-ENGINE SINGLETON, and its hosts are
 * not equally capable: every field here is read back by aeon's ComposerCanvas,
 * and only some of them by classic's TileTab (which consumes exactly `tool`,
 * `selectedColor`, `mirror`, `ditherPattern`, `ditherSecondary`,
 * `pixelPerfect` — see components/classic/TileTab.tsx). Drawing the rest for
 * classic would be facet-chrome.ts's dead chrome, and two of them are worse than
 * dead:
 *
 *   - `transforms` writes `artStore.pendingAction`, and the ONLY consumer is
 *     aeon's ComposerCanvas. From classic the click sets a flag nothing clears,
 *     so it is armed for the next aeon document rather than lost. (Today the
 *     grid is `disabled` under a null `open`, which hides that — but a disabled
 *     seven-button grid is still seven buttons that never do anything.)
 *   - `zoom` moves aeon's canvas zoom. Classic's tile editor draws at a fixed
 *     26px/pixel and does not read `artStore.zoom`, so the readout would count
 *     up beside a canvas that never changes size.
 *
 * `brushSpace` and `repeatPreview` are simply aeon-only (ComposerCanvas is the
 * sole reader of both), and `paletteLine` belongs to the `palette-apply` tool,
 * which is tile-space and not in CLASSIC_TILE_TOOLS — its picker also reads
 * `projectStore`, null under a classic open, so it would render four empty
 * swatch strips.
 *
 * Flags rather than a host enum: this file must not learn who its hosts are, and
 * a host that gains a capability (H1.5 transforms, H1.6 zoom) flips one boolean.
 */
export interface ArtOptionCaps {
  /** px / tile brush-space tabs. */
  readonly brushSpace: boolean;
  /** The 3x3 seamless repeat preview toggle. */
  readonly repeatPreview: boolean;
  /** The palette-line picker for the `palette-apply` tool. */
  readonly paletteLine: boolean;
  /** The flip / rotate / wrap-shift grid (via `artStore.pendingAction`). */
  readonly transforms: boolean;
  /** The zoom in/out readout (via `artStore.zoom`). */
  readonly zoom: boolean;
}

/** Everything — aeon's Art facet, whose canvas reads every field. */
export const FULL_CAPS: ArtOptionCaps = {
  brushSpace: true, repeatPreview: true, paletteLine: true, transforms: true, zoom: true,
};

/**
 * Classic's composer tile tier: mirror, dither and pixel-perfect only — the
 * three modifiers `toolConfigFrom` actually hands the PixelEditController.
 * Transforms and zoom turn on in H1.5 / H1.6, and this constant is the one line
 * either task edits.
 */
export const CLASSIC_TILE_CAPS: ArtOptionCaps = {
  brushSpace: false, repeatPreview: false, paletteLine: false, transforms: false, zoom: false,
};

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
 *
 * `caps` says which controls the HOST can act on — see ArtOptionCaps.
 */
export default function ArtToolOptions({ before, caps = FULL_CAPS }: { before?: React.ReactNode; caps?: ArtOptionCaps }) {
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
      {caps.brushSpace && (
        <>
          <span style={{ display: 'inline-flex', gap: 4 }}>
            <Chip active={brushSpace === 'pixel'} onClick={() => setBrushSpace('pixel')}>px</Chip>
            <Chip active={brushSpace === 'tile'} onClick={() => setBrushSpace('tile')}>tile</Chip>
          </span>
          <Divider />
        </>
      )}

      {/* Dither config: pattern + secondary color (0 = transparent) */}
      {tool === 'dither' && (
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary}
          onPattern={(p) => setDither(p, ditherSecondary)}
          onSecondary={(v) => setDither(ditherPattern, v)}
        />
      )}

      {/* Palette-line picker: which zone line palette-apply paints onto. */}
      {caps.paletteLine && tool === 'palette-apply' && <PaletteLinePicker />}

      {/* Collision config lives in the side panel (CollisionPalette — shape/flip/
          solidity/plane), same as Map mode's paint-collision tool. */}

      {/* Mirror cycle + repeat preview */}
      <MirrorButton mirror={mirror} onChange={setMirror} />
      {caps.repeatPreview && (
        <ToolButton glyph="Rpt" small active={repeatPreview} title="Toggle 3×3 repeat preview" onClick={toggleRepeatPreview} />
      )}

      {/* Pixel-perfect mode (pencil / line only) */}
      {(tool === 'pencil' || tool === 'line') && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textLo }}>
          <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} />
          Pixel-perfect
        </label>
      )}

      {/* Transforms (apply to selection if present, else whole doc). `open` is
          aeon's open document and is ALWAYS null under a classic open — the
          guard below already short-circuits on it, so no host needs a fake
          document to render this row safely. */}
      {caps.transforms && (
        <>
          <Divider />
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <TransformGrid
              items={TRANSFORMS.map((t) => ({
                ...t,
                disabled: !open || (t.action === 'rotate-90' && open.doc.widthTiles !== open.doc.heightTiles),
              }))}
              onAction={requestAction}
            />
          </span>
        </>
      )}

      {caps.zoom && (
        <>
          <Divider />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <ZoomControl zoom={zoom} onZoomIn={() => setZoom(zoom * 2)} onZoomOut={() => setZoom(zoom / 2)} />
          </span>
        </>
      )}
    </OptionBar>
  );
}
