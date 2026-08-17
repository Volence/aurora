import React from 'react';
import { useArtStore, selectArtZoom } from '../state/artStore';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { OptionBar, Chip, Divider, T } from '../components/ui';
import {
  GlyphButton, TransformGrid, DitherConfig, MirrorButton, ZoomControl,
} from '../components/art-shared/ToolColumnParts';
import type { Color } from '../../core/model/s4-types';

// Transforms (apply to selection if present, else whole doc). Rotate is
// disabled here for non-square docs; SELECTION squareness is not knowable from
// this bar (the marquee lives in the host), so it stays a host-side guard —
// aeon's ComposerCanvas skips silently, classic's TileTab toasts.
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
            <span style={{ fontSize: T.t2xs, lineHeight: 1, color: active ? T.onAccent : T.textLo }}>{li}</span>
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
 * `pixelPerfect`, `pendingAction` (H1.5) and `zoom` (H1.6); see
 * components/classic/TileTab.tsx). Drawing the rest for classic would be
 * facet-chrome.ts's dead chrome.
 *
 * `zoom` is the worked example of a capability EARNING its flag rather than
 * being granted one: while the tile canvas drew at a fixed 26px/pixel the
 * readout counted up beside a canvas that never changed size, so the cap was
 * false; H1.6 made the canvas render at `artStore.zoom` (with the shared
 * cursor-anchored wheel zoom and hand-pan), and the same one field turned true.
 *
 * `brushSpace` is aeon-only (ComposerCanvas is its sole reader). `repeatPreview`
 * is the CAP that gates THIS BAR'S OWN "Rpt" button, which stays aeon-only too —
 * classic's TileTab reads the underlying `artStore.repeatPreview` field
 * directly and draws its own seam-preview toggle beside the tile's palette-line
 * Chips instead, so turning this cap on would put two controls on one field.
 * `paletteLine` belongs to the `palette-apply` tool,
 * which is tile-space and not in CLASSIC_TILE_TOOLS — its picker also reads
 * `projectStore`, null under a classic open, so it would render four empty
 * swatch strips.
 *
 * `transforms` used to be off here for a sharper reason than chrome: it writes
 * `artStore.pendingAction`, a single CROSS-ENGINE slot, and while aeon's
 * ComposerCanvas was its only consumer a click from classic armed a transform
 * for the next aeon document instead of doing nothing. classic-tile-transform.ts
 * plus TileTab's effect is that consumer now, and it clears the slot on every
 * path — so the capability is on, and it is a THREE-WAY value rather than a
 * boolean because the two hosts disagree about what the grid may act on:
 *
 *   - `'doc'` — the target is `artStore.open`'s document, so the grid is dead
 *     without one and rotate is dead on a non-square one.
 *   - `'fixed-square'` — the host's target is always present and always square
 *     (classic's 8x8 tile), so `open` says nothing about it and reading `open`
 *     here would disable the whole grid permanently. Rotate on a non-square
 *     MARQUEE is still refused, but host-side, where the marquee is known.
 *
 * Flags rather than a host enum: this file must not learn who its hosts are, and
 * a host that gains a capability edits one field.
 */
export interface ArtOptionCaps {
  /** px / tile brush-space tabs. */
  readonly brushSpace: boolean;
  /** The 3x3 seamless repeat preview toggle. */
  readonly repeatPreview: boolean;
  /** The palette-line picker for the `palette-apply` tool. */
  readonly paletteLine: boolean;
  /** The flip / rotate / wrap-shift grid (via `artStore.pendingAction`), and
   *  what its enablement is read from. `false` = the host cannot consume the
   *  action at all, so the grid must not be drawn. */
  readonly transforms: false | 'doc' | 'fixed-square';
  /** The zoom in/out readout (via `artStore.zoom`). */
  readonly zoom: boolean;
}

/** Everything — aeon's Art facet, whose canvas reads every field. */
export const FULL_CAPS: ArtOptionCaps = {
  brushSpace: true, repeatPreview: true, paletteLine: true, transforms: 'doc', zoom: true,
};

/**
 * Classic's composer tile tier: mirror, dither, pixel-perfect, the transform
 * grid and zoom — the modifiers `toolConfigFrom` hands the PixelEditController,
 * plus the pending-action slot TileTab consumes and the `artStore.zoom` its
 * canvas now renders at.
 *
 * Zoom was OFF until H1.6 for a specific reason worth remembering: the tile
 * canvas was a hardcoded 26px-per-pixel grid that never read the store, so the
 * control moved a number nothing on screen answered to. A capability here is a
 * claim about the HOST, not a preference — turn one on without the host
 * consuming it and the bar grows a dead control.
 */
export const CLASSIC_TILE_CAPS: ArtOptionCaps = {
  brushSpace: false, repeatPreview: false, paletteLine: false, transforms: 'fixed-square', zoom: true,
};

/**
 * Classic's Chunk and Block tiers in Paint mode — the same bar WITHOUT the
 * transform grid.
 *
 * `pendingAction` has exactly one consumer, TileTab, and only TileTab clears it
 * (in a `finally`, for the hazard its own comment names). Handing the grid to
 * hosts that cannot consume it drew three live buttons that did nothing — and
 * worse than nothing: the click left an action parked in the store, and the next
 * time the Tile tab MOUNTED its effect fired on the leftover and committed a
 * real, dirty-marking transform against a tile the artist never chose. A
 * capability is a claim about the host; these hosts make no such claim.
 */
export const CLASSIC_SURFACE_CAPS: ArtOptionCaps = {
  ...CLASSIC_TILE_CAPS, transforms: false,
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
  const zoom = useArtStore(selectArtZoom);
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
        <GlyphButton glyph="Rpt" small active={repeatPreview} title="Toggle 3×3 repeat preview" onClick={toggleRepeatPreview} />
      )}

      {/* Pixel-perfect mode (pencil / line only) */}
      {(tool === 'pencil' || tool === 'line') && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: T.tXs, color: T.textLo }}>
          <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} />
          Pixel-perfect
        </label>
      )}

      {/* Transforms (apply to selection if present, else the whole target).
          `open` is aeon's open document and is ALWAYS null under a classic open,
          so it may only gate the grid for a `'doc'` host — asking it under
          `'fixed-square'` would render seven permanently-disabled buttons over a
          tile that is perfectly transformable. */}
      {caps.transforms !== false && (
        <>
          <Divider />
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <TransformGrid
              items={TRANSFORMS.map((t) => ({
                ...t,
                disabled: caps.transforms === 'doc'
                  && (!open || (t.action === 'rotate-90' && open.doc.widthTiles !== open.doc.heightTiles)),
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
