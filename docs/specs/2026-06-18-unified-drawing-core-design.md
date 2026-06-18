# Spec — Unified drawing core (shared pixel-edit engine + viewport)

Status: **design, awaiting approval** · 2026-06-18 (rev 2 — unified render)
Context: the editor has two parallel pixel-drawing surfaces — **level art**
(`art/ComposerCanvas` + `art/ToolColumn`) and **sprite art** (`sprite/SpriteCanvas` +
`sprite/SpriteToolColumn`). They share only `core/art/pixel-ops.ts` but duplicate the
*drawing logic* (strokes, mirror, dither, pixel-perfect, line/rect/fill, select+move,
preview) **and** the *rendering/viewport* (zoom, pan, pointer→pixel mapping, pixel blit,
grids, overlays). This is the vision doc's "architecture keystone": extract a **shared
art core** so the drawing experience is consistent everywhere and future craft features
are written once. (Level *layout* editing — placing chunks/objects on the map — is out of
scope; level *art* is drawn pixels and is in scope.)

The professional pattern (Aseprite, Pro Motion, GraphicsGale): **one viewport** that
renders palette-indexed pixels at a zoom with configurable layers/overlays — it doesn't
care whether the pixels came from a sprite frame or a tilemap. We adopt that.

## 1. Goal & non-goals

**Goal:** one pure drawing **engine** + one data-model-agnostic **viewport**, used by both
the level-art and sprite-art surfaces, with **zero behavior regression** in either mode.

**In scope:**
- `PixelEditController` — all pixel-drawing *logic* (tools, strokes, shapes, select+move,
  mirror, dither, pixel-perfect, preview geometry), pure TS, fully unit-tested.
- `PixelViewport` — one React component that renders a palette-indexed pixel buffer at a
  zoom with configurable layers (checkerboard, grids, overlays, preview, repeat-tiling)
  and routes pointer input to the controller. **Knows nothing about docs, atlases, undo,
  or tiles** — it draws pixels + overlays.
- Thin **hosts** (sprite + composer): resolve their data model → a pixel buffer + overlay
  data, hand it to the viewport, and apply the controller's writes through their own
  commit/undo path.
- Shared presentational tool-column components.

**Out of scope (deferred / separate specs):**
- New craft features (onion-skin, brush dynamics, symmetry, palette workflows) — these
  build *on* this core, each its own spec. (The viewport's layer model is the hook for
  them — e.g. onion-skin becomes another overlay layer.)
- Level layout / object / collision-*placement* editing.
- Tile-space tools (tile-stamp, collision-nibble edit) — they aren't pixel *drawing*;
  they stay a Composer-only interaction layered over the same viewport.

## 2. Architecture — three layers

```
┌ Drawing engine  (src/core/art/, pure TS, no React) ───────────────────────────┐
│  PixelEditController — tool state + gesture API; emits Write[] + preview        │
│  Surface { width, height, get(x,y) }   Write { x, y, value }                    │
│  (reuses pixel-ops.ts: floodFill/drawLine/drawRect/ditherValue/mirrorPoints/…)  │
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲ driven by / applied by
┌ PixelViewport  (one React component — data-model-agnostic) ────────────────────┐
│  renders pixels+palette at zoom · checkerboard · grids · overlays · preview ·    │
│  repeat-tile · pan/zoom · pointer→pixel mapping · drives the controller          │
│  in:  pixels, palette, zoom, layers, overlays[]   out: onCommit(writes), onPick  │
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲ fed by (pixels + overlays) / commits to
┌ Hosts  (per surface — own the data model + commit/undo, NOT rendering) ─────────┐
│  SpriteHost   → frame buffer + piece overlays;  setBuffer(applyWrites(...))      │
│  ComposerHost → compose doc/atlas/flips/repeat → buffer + grid/collision overlays;│
│                 existing bufferToWrites/commitWrites + cell-adoption + undo       │
└─────────────────────────────────────────────────────────────────────────────────┘
            ▲ both also use
┌ Shared tool-column UI  (src/renderer/components/art-shared/) ──────────────────┐
│  ToolButtonGrid · DitherConfig · ZoomControl · MirrorButton · TransformGrid     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 3. The seam — `Surface` + `Write`

The engine never reads a store, doc, or undo stack. It reads pixels via `Surface` and
emits changed pixels as `Write[]`; the host decides what a write *means*.

```ts
interface Surface { readonly width: number; readonly height: number; get(x: number, y: number): number; }
interface Write { x: number; y: number; value: number; } // value 0..15 (0 = transparent)
```

- **Sprite** host: `Surface` wraps the current frame's `PixelBuffer`; writes apply to a
  clone via `setBuffer`.
- **Composer** host: `Surface` wraps the composed doc-region pixels; writes feed the
  host's **existing** commit path (cell adoption, live-atlas-tile + snapshot undo, chunk
  shared-tile warnings, palette-line adoption for empty cells). The engine decides *which*
  pixels changed; the Composer host keeps full ownership of *how* they're written/undone.

## 4. `PixelEditController` (the engine)

Pure class, configured with a `ToolConfig`, driven by a gesture API.

```ts
type ArtTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';
interface ToolConfig {
  tool: ArtTool; color: number; mirror: MirrorMode | null;
  dither: { pattern: DitherPattern; secondary: number }; pixelPerfect: boolean;
}
interface GestureResult { writes: Write[]; selection?: SpriteSelection | null; pick?: number; }
interface PreviewShape { kind: 'none' | 'line' | 'rect' | 'marquee' | 'move'; rect?: Rect; points?: Pt[]; }

class PixelEditController {
  setConfig(c: ToolConfig): void;
  begin(surface: Surface, x: number, y: number, existingSelection?: SpriteSelection | null): void;
  move(x: number, y: number): void;
  end(): GestureResult;
  preview(): PreviewShape;     // geometry only — viewport draws it
  workingPixels(): Uint8Array; // in-gesture pixels for incremental live render
}
```

Owns the logic currently duplicated across both canvases: Bresenham strokes + mirror
expansion + pixel-perfect L-corner drop + dither (pencil/eraser/dither); line/rect with
preview + mirrored endpoints; flood fill; eyedropper; marquee select and move
(cut+paste region). It delegates pixel math to the existing pure helpers in
`pixel-ops.ts` — no logic is forked.

## 5. `PixelViewport` (the renderer)

One React component, data-model-agnostic. Props in / events out:

```ts
interface PixelViewportProps {
  pixels: Uint8Array; width: number; height: number;   // the buffer to render
  palette: Color[];                                     // index → color (index 0 transparent)
  zoom: number; onZoomChange(z: number): void;
  controller: PixelEditController;                      // input is routed to it
  layers?: {                                            // optional render layers
    checkerboard?: boolean;                             // sprite-style transparency bg
    grids?: ('pixel' | 'cell8' | 'tile' | 'block')[];
    repeat?: { tilesX: number; tilesY: number } | null; // 3×3 seamless preview
  };
  overlays?: Overlay[];                                 // host-supplied: rects, HUD text, piece outlines
  onCommit(result: GestureResult): void;                // forward controller.end()
  onPick?(value: number): void;                         // eyedropper
}
```

Responsibilities (all currently duplicated): zoom + clamped pan, canvas sizing, the
palette-indexed pixel blit (via OffscreenCanvas at native res, scaled), grid drawing,
checkerboard, repeat-tiling, a dedicated **overlay layer** (preview/marquee/HUD/piece
outlines — so previews never re-blit pixels), and pointer→pixel coordinate mapping that
drives `controller.begin/move/end`. Hosts pass overlays as data; the viewport draws them
(an optional custom-draw escape hatch covers anything host-specific like the collision
HUD without the viewport learning its semantics).

## 6. Hosts (own data model + commit, not rendering)

- **SpriteHost** (inside SpriteMode): hands the current frame buffer + piece-outline
  overlays to the viewport; on `onCommit`, `setBuffer(applyWrites(frame, writes))` and
  updates selection. Palette override unchanged.
- **ComposerHost** (inside ArtMode): composes doc/atlas/cell-flips/repeat → pixel buffer
  (its existing composition code, now outputting a buffer instead of painting a canvas
  directly) + grid/collision overlays; on `onCommit`, routes `writes` through the
  existing `bufferToWrites`/`commitWrites` + cell-adoption + undo. **Tile-space tools and
  collision-nibble editing remain a Composer-only interaction** layered over the viewport
  (they don't go through the controller); repeat-preview is just a layer flag.

## 7. Testing

- **Engine (unit, pure):** golden `Write[]` for representative gestures — plain pencil
  line, *mirrored* diagonal stroke, pixel-perfect L-corner drop, dither stroke, filled
  rect (with mirror), flood fill, eyedropper pick, select→move. These lock the shared
  behavior.
- **Viewport (light):** the pure coordinate-mapping helper (canvas-local → pixel, incl.
  zoom/pan/repeat offset) is extracted and unit-tested; the canvas drawing itself is
  verified visually (canvas 2D isn't worth DOM-mocking).
- **Behavior parity:** existing sprite/level tests stay green; a test asserts
  `applyWrites(buffer, controller-output)` equals the pre-refactor result for known
  strokes.
- **Manual/visual:** in the running app, confirm Art mode (live-atlas edit, undo,
  collision, repeat preview, grids) and Sprite mode (mirror, select-move, pixel-perfect,
  transforms, piece overlays) are unchanged.

## 8. Phasing (no big-bang)

1. **Engine + tests** — `PixelEditController` + `Surface`/`Write`; full unit suite. No UI
   touched.
2. **`PixelViewport`** — build the component + the pure coordinate-mapping helper (tested).
3. **Sprite host** — move SpriteMode onto viewport + controller (low risk: simple
   `setBuffer` commit, no atlas/undo). Verify sprite editing end-to-end. Delete
   `SpriteCanvas`.
4. **Composer host** — the careful step. Point ComposerCanvas's existing composition at
   a buffer fed to the viewport; route shapes/fill, then strokes, through the controller,
   preserving all commit/undo/atlas/cell-adoption code. Tile-tools/collision stay as a
   Composer interaction; repeat-preview becomes a layer flag. Verify level art
   end-to-end (highest risk).
5. **Shared tool-column UI** — extract the presentational components; rewire both columns.

Each phase leaves both modes fully working and independently reviewable. Phase 4 is the
one to review most carefully; the engine + viewport land first and are proven on the
simpler sprite surface before the level canvas is touched.

## 9. Open questions / resolved

- **Resolved:** rendering IS unified (one `PixelViewport`); it stays data-model-agnostic
  (pixels + overlays), so the Composer's atlas/undo internals never leak into it.
- **Resolved:** tile-space tools (stamp/collision) aren't pixel drawing — Composer-only
  interaction over the shared viewport; repeat-preview is a viewport layer flag.
- **Still open (resolve in planning):** whether `select/move` commit lives in the engine
  v1 or stays host-side (the marquee *geometry* is shared; sprite's move-region vs
  composer's selection-transform *commit* differ). Lean: geometry + marquee in the engine;
  cut/paste commit host-side if it proves leaky.
- **Still open (planning):** the overlay model's exact shape — a fixed set of overlay
  types (rect/outline/text) vs. a host-provided `drawOverlay(ctx, transform)` callback.
  Lean: a small typed set + one escape-hatch callback for the collision HUD.
