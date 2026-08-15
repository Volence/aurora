import React, { useEffect, useRef } from 'react';
import { useCanvasStore, type CanvasTool } from '../../state/canvasStore';
import { focusedHistory } from '../../state/editorStore';
import CanvasHost from './CanvasHost';
import { offeredGrids } from './canvas-pane-model';
import { useAnchoredZoom } from '../art-shared/use-anchored-zoom';
import { useHandPan } from '../art-shared/use-hand-pan';
import { PixelHud, type PixelHudHandle } from '../art-shared/PixelHud';
import PaletteGrid from '../art-shared/PaletteGrid';
import { useCanvasPaletteGridPort } from '../../providers/palette-canvas';
import {
  ToolButton as ModifierButton, DitherConfig, MirrorButton, ZoomControl,
} from '../art-shared/ToolColumnParts';
import {
  CANVAS_COLORS, canvasIndex, paletteEntryOf, paletteLineOf,
} from '../../../core/art/canvas-doc';
import {
  CONSTRAINT_PROFILE_IDS, constraintProfile, type ConstraintProfileId,
} from '../../../core/art/canvas-profiles';
import {
  Panel, CollapsibleSection, OptionBar, Chip, Divider, NumberField, StatusBar,
  ToolButton, Icons, T,
} from '../ui';
import EditorShell from '../../shell/EditorShell';

/**
 * The origination canvas's editor pane (spec §4.1) — tool dock, options bar,
 * viewport, palette and status bar, laid out exactly as SpriteMode lays out the
 * sprite editor because they are the same kind of thing: one editor, pointed at
 * whichever document the active tab names.
 *
 * IT TAKES ITS DOCUMENT ID AS A PROP, from the tab (R14c). App resolves it with
 * `canvasPaneState`, so this component never asks the store "what is focused?" —
 * a pane that answers that question for itself is a pane that can render
 * document X under tab Y.
 *
 * ONE MOUNTING POINT, in App, and NOT keep-alive. A second live instance would
 * double-register the window keydown handler below and fire undo twice per
 * Ctrl+Z. Everything worth keeping across a tab switch lives in the module-level
 * canvasStore (documents, tool, zoom, paint colour), so the remount is lossless.
 */
export default function CanvasMode({ docId, appBar }: { docId: string; appBar: React.ReactNode }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const zoom = useCanvasStore((s) => s.zoom);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<PixelHudHandle>(null);

  // Cursor-anchored wheel zoom, measured against the CANVAS element rather than
  // the padded holder — `styles.canvasPad` insets it by 24px, which is 24/zoom
  // art px of anchor drift per notch if ignored (the bug SpriteMode's own
  // comment records).
  useAnchoredZoom(
    canvasWrapRef, canvasRef, zoom,
    () => useCanvasStore.getState().zoom,
    (z) => useCanvasStore.getState().setZoom(z),
  );
  useHandPan(canvasWrapRef);

  // Ctrl/Cmd+Z (no shift) → undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z → redo, both
  // driving `focusedHistory()` — which routes a canvas tab to its own document
  // (editorStore.focusedDocId). Same text-entry guard as SpriteMode: skip only
  // real text inputs, so undo still works right after a slider or checkbox.
  //
  // The hidden level editors' handlers are registered alongside this one (their
  // pane stays mounted at display:none), and they are inert while a canvas tab
  // is active because they all gate on levelKeysEnabled() — otherwise one Ctrl+Z
  // would undo both a canvas stroke and a level edit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTextEntry = target.isContentEditable
        || target.tagName === 'TEXTAREA'
        || (target.tagName === 'INPUT'
          && !['range', 'checkbox', 'button', 'radio'].includes((target as HTMLInputElement).type));
      if (isTextEntry) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        focusedHistory()?.undo();
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        focusedHistory()?.redo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // LEAVING THE SELECT TOOL DROPS THE MARQUEE — the decision canvasStore.setTool
  // explicitly left to this pane (its tool is global while the selection is
  // per-document, so the store has no document to apply the rule to).
  //
  // Clearing is the honest half of the choice: with the pencil armed there is no
  // gesture that can move, fill or cut the marquee, and nothing else on this
  // surface is scoped by it — so a dashed rectangle left on screen promises an
  // operation no tool can perform. It is also what the sprite editor does, and a
  // marquee that survives a tool switch on one pixel surface but not its
  // neighbour is worse than either rule applied consistently. The cost, stated:
  // a detour through the eyedropper loses the selection.
  const tool = useCanvasStore((s) => s.tool);
  useEffect(() => {
    if (tool === 'select') return;
    if (useCanvasStore.getState().docs.get(docId)?.selection) {
      useCanvasStore.getState().setSelection(docId, null);
    }
  }, [tool, docId]);

  function fitToView() {
    const el = canvasWrapRef.current;
    const d = useCanvasStore.getState().docs.get(docId)?.doc;
    if (!el || !d || el.clientWidth === 0 || el.clientHeight === 0) return; // not laid out yet
    const pad = 24;
    const z = Math.floor(Math.min((el.clientWidth - pad) / d.pixels.width, (el.clientHeight - pad) / d.pixels.height));
    useCanvasStore.getState().setZoom(Math.max(1, Math.min(48, z)));
  }
  // Auto-fit when the document's dimensions change — which here means a
  // different canvas was focused, since a canvas cannot be resized (yet).
  useEffect(() => { fitToView(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [doc?.pixels.width, doc?.pixels.height, docId]);

  if (!doc) return null; // App only mounts this for a loaded document

  return (
    <EditorShell
      appBar={appBar}
      toolDock={<CanvasToolDock />}
      toolOptions={<CanvasToolOptions docId={docId} onFit={fitToView} />}
      panels={
        <Panel width={240} scroll>
          <CollapsibleSection id="canvas.doc" title="Canvas">
            <CanvasDocSection docId={docId} />
          </CollapsibleSection>
          <CollapsibleSection id="canvas.palette" title="Palette">
            <CanvasPalette docId={docId} />
          </CollapsibleSection>
        </Panel>
      }
      status={<CanvasStatusBar docId={docId} />}
    >
      {/* Absolute full-fill so the scroll/pad wrapper expands to the shell's
          canvas slot, exactly as the sprite and level-art canvases do. */}
      <div ref={canvasWrapRef} style={styles.canvasWrap}>
        <div style={styles.canvasPad}>
          <CanvasHost docId={docId} hudRef={hudRef} canvasRef={canvasRef} />
        </div>
      </div>
      <PixelHud ref={hudRef} />
    </EditorShell>
  );
}

// --- Tool dock --------------------------------------------------------------

/** The eight pixel tools, in dock order — the same set and the same glyphs as
 *  the sprite dock, because they are the same tools driving the same shared
 *  controller. */
const TOOLS: [CanvasTool, string, React.FC<{ size?: number }>][] = [
  ['pencil', 'Pencil (paint pixels)', Icons.IconPencil],
  ['eraser', 'Eraser (paint index 0)', Icons.IconEraser],
  ['fill', 'Fill (flood fill)', Icons.IconFill],
  ['eyedropper', 'Eyedropper (pick colour)', Icons.IconEyedrop],
  ['line', 'Line', Icons.IconLine],
  ['rect', 'Rectangle', Icons.IconRect],
  ['select', 'Select (marquee + move)', Icons.IconSelect],
  ['dither', 'Dither brush', Icons.IconDither],
];

function CanvasToolDock() {
  const tool = useCanvasStore((s) => s.tool);
  return (
    <>
      {TOOLS.map(([t, label, Icon]) => (
        <ToolButton
          key={t}
          icon={<Icon size={18} />}
          label={label}
          active={tool === t}
          onClick={() => useCanvasStore.getState().setTool(t)}
        />
      ))}
    </>
  );
}

// --- Options bar ------------------------------------------------------------

function CanvasToolOptions({ docId, onFit }: { docId: string; onFit: () => void }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const tool = useCanvasStore((s) => s.tool);
  const zoom = useCanvasStore((s) => s.zoom);
  const mirror = useCanvasStore((s) => s.mirror);
  const pixelPerfect = useCanvasStore((s) => s.pixelPerfect);
  const ditherPattern = useCanvasStore((s) => s.ditherPattern);
  const ditherSecondary = useCanvasStore((s) => s.ditherSecondary);
  const visibleGrids = useCanvasStore((s) => s.visibleGrids);
  const st = useCanvasStore.getState;

  // The MENU of grid pitches is the profile's; `visibleGrids` is the selection
  // within it. Offering a pitch the profile does not name would draw a chunk
  // grid over a sprite canvas.
  const pitches = doc ? offeredGrids(doc.profileId) : [];

  return (
    <OptionBar>
      <Chip onClick={onFit}>Fit</Chip>
      <span style={{ color: T.textLo }}>
        {zoom}× · {doc ? `${doc.pixels.width}×${doc.pixels.height}px` : '—'}
      </span>

      <Divider />

      <span style={{ color: T.textLo }}>Grid</span>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {pitches.map((p) => (
          <Chip
            key={p}
            active={visibleGrids.includes(p)}
            title={`${p}px guides${p === 8 ? ' (one tile)' : p === 16 ? ' (one block)' : p === 256 ? ' (one chunk)' : ''}`}
            onClick={() => {
              const cur = st().visibleGrids;
              st().setVisibleGrids(cur.includes(p) ? cur.filter((v) => v !== p) : [...cur, p]);
            }}
          >
            {p}
          </Chip>
        ))}
      </span>

      <Divider />

      {/* Pencil/line/rect honour pixel-perfect; the toggle shows for those. */}
      {(tool === 'pencil' || tool === 'line' || tool === 'rect') && (
        <ModifierButton
          glyph="PP" small active={pixelPerfect}
          title="Pixel-perfect strokes (no doubled corner pixels)"
          onClick={() => st().setPixelPerfect(!pixelPerfect)}
        />
      )}

      {tool === 'dither' && (
        // colorCount 64: a canvas index spans all four palette lines, so the
        // secondary colour must be able to reach them. Every other surface in
        // the app leaves this at its 16 default.
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary} colorCount={CANVAS_COLORS}
          onPattern={(p) => st().setDither(p, ditherSecondary)}
          onSecondary={(v) => st().setDither(ditherPattern, v)}
        />
      )}

      <MirrorButton mirror={mirror} onChange={(m) => st().setMirror(m)} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
        <ZoomControl zoom={zoom} onZoomIn={() => st().setZoom(zoom + 2)} onZoomOut={() => st().setZoom(zoom - 2)} />
      </span>
    </OptionBar>
  );
}

// --- Right column -----------------------------------------------------------

/**
 * The document's own settings: its size (fixed at creation), its constraint
 * profile, and where the profile's grids start.
 *
 * NO NAME FIELD, deliberately. A canvas's name is its file stem and its tab id
 * (canvas-file.ts, tabs.ts) — `setName` changes neither the file nor the tab, so
 * an editable name here would show one name while saving under another. Renaming
 * belongs with the create/copy flow that owns the filename.
 */
function CanvasDocSection({ docId }: { docId: string }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  if (!doc) return null;
  const profile = constraintProfile(doc.profileId);

  return (
    <div style={styles.section}>
      <div style={styles.stat}><span>Size</span><b>{doc.pixels.width}×{doc.pixels.height}</b></div>

      <label style={styles.row} title="Which target the constraint checks describe. Nothing is prevented — plan 2B reports violations; this only chooses which rules apply and which grids are offered.">
        <span style={styles.dim}>Profile</span>
        <select
          style={styles.select}
          value={profile.id}
          onChange={(e) => useCanvasStore.getState().setProfile(docId, e.target.value as ConstraintProfileId)}
        >
          {CONSTRAINT_PROFILE_IDS.map((id) => (
            <option key={id} value={id}>{constraintProfile(id).label}</option>
          ))}
        </select>
      </label>

      {/* An EDIT, not a view setting: the origin decides which pixels share an
          8x8 cell, so it decides which palette-line clashes 2B will report.
          canvasStore records it, so Ctrl+Z reverts it like any other edit. */}
      <div style={styles.row} title="Where the grids start, so guides can align to the art rather than to the canvas corner.">
        <span style={styles.dim}>Grid origin</span>
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <NumberField
            value={doc.gridOrigin.originX} width={44} title="grid origin X (px)"
            onChange={(v) => useCanvasStore.getState().setGridOrigin(docId, { ...doc.gridOrigin, originX: v | 0 })}
          />
          <NumberField
            value={doc.gridOrigin.originY} width={44} title="grid origin Y (px)"
            onChange={(v) => useCanvasStore.getState().setGridOrigin(docId, { ...doc.gridOrigin, originY: v | 0 })}
          />
        </span>
      </div>
    </div>
  );
}

/** This canvas's own 64 colours, through the one shared swatch grid. */
function CanvasPalette({ docId }: { docId: string }) {
  const port = useCanvasPaletteGridPort(docId);
  return <PaletteGrid port={port} />;
}

// --- Status bar -------------------------------------------------------------

function CanvasStatusBar({ docId }: { docId: string }) {
  const doc = useCanvasStore((s) => s.docs.get(docId)?.doc);
  const paintIndex = useCanvasStore((s) => s.paintIndex);
  const zoom = useCanvasStore((s) => s.zoom);
  if (!doc) return <StatusBar />;

  const line = paletteLineOf(paintIndex), entry = paletteEntryOf(paintIndex);
  return (
    <StatusBar
      left={<span style={{ color: T.accent, fontWeight: 600 }}>{doc.name}</span>}
      right={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: T.textBase }}>
          <span>{constraintProfile(doc.profileId).label}</span>
          <span>{doc.pixels.width}×{doc.pixels.height}</span>
          {/* Both spellings, because both are true and each is the one some
              other part of the app speaks: the stored index is what a pixel
              holds, the line/entry pair is where the swatch is. */}
          <span>
            colour {canvasIndex(line, entry)}
            {paintIndex === 0 ? ' (transparent)' : ` · line ${line} idx ${entry}`}
          </span>
          <span>{zoom}× zoom</span>
        </span>
      }
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  canvasWrap: { position: 'absolute', inset: 0, overflow: 'auto', background: T.void },
  canvasPad: { display: 'inline-block', padding: 24 },
  section: { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 },
  stat: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.textHi },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  dim: { fontSize: 11, color: T.textLo },
  select: {
    flex: 1, background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`,
    borderRadius: 4, fontSize: 12, padding: '4px 6px',
  },
};
