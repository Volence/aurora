# Spec — Unified drawing core (shared pixel-edit engine for level art + sprite art)

Status: **design, awaiting approval** · 2026-06-18
Context: the editor has two parallel pixel-drawing surfaces — **level art**
(`art/ComposerCanvas` + `art/ToolColumn`) and **sprite art** (`sprite/SpriteCanvas` +
`sprite/SpriteToolColumn`). They share only `core/art/pixel-ops.ts` but duplicate ~85%
of the *drawing logic* (stroke interpolation, mirror, dither, pixel-perfect, line/rect/
fill, marquee select+move, live preview) and ~70% of the tool-column UI. This is the
vision doc's "architecture keystone": extract a **shared art core** so the drawing
experience is consistent across all drawn art and future craft features are written
once. (Level *layout* editing — placing chunks/objects on the map — is out of scope;
level *art* is drawn pixels and is in scope.)

## 1. Goal & non-goals

**Goal:** one pure, framework-agnostic **drawing engine** + shared tool-column UI
pieces, used by both the level-art and sprite-art canvases, with **zero behavior
regression** in either mode.

**In scope:**
- `PixelEditController` — all pixel-drawing *logic* (tools, strokes, shapes, select+move,
  mirror, dither, pixel-perfect, preview geometry), pure TS, fully unit-tested.
- A tiny `Surface`/`Write` seam so the engine is independent of each surface's data
  model and undo system.
- Thin canvas adapters: each canvas keeps its own rendering + commit/undo, but drives
  the one controller.
- Shared presentational tool-column components.

**Out of scope (deferred / separate specs):**
- Merging the two render shells into one React component (riskier, low payoff — the
  surfaces render differently: composed atlas cells vs. transparency checkerboard).
- New craft features (onion-skin, brush dynamics, symmetry, palette workflows) — those
  build *on* this core, each its own spec.
- Level layout/object/collision-placement editing.
- Tile-space tools (tile-stamp, collision) and repeat-preview — stay Composer-only.

## 2. Architecture — three layers

```
┌ Drawing engine  (src/core/art/, pure TS, no React) ───────────────────────────┐
│  PixelEditController — tool state + gesture API; emits Write[] + preview        │
│  Surface { width, height, get(x,y) }   Write { x, y, value }                    │
│  (reuses pixel-ops.ts: floodFill/drawLine/drawRect/ditherValue/mirrorPoints/…)  │
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲ driven by (pointer events) / applied by (writes)
┌ Canvas adapters  (per surface — keep own render + commit/undo) ────────────────┐
│  SpriteCanvas  → setBuffer(applyWrites(frame, writes))                          │
│  ComposerCanvas→ existing bufferToWrites/commitWrites + cell-adoption + undo     │
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲ uses
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

- **Sprite** host: `Surface` wraps the current frame's `PixelBuffer`; writes are applied
  to a clone via `setBuffer`.
- **Composer** host: `Surface` wraps the relevant doc region as pixels (the engine sees a
  flat buffer); writes are fed into the host's **existing** commit path (cell adoption,
  live-atlas-tile in-place + snapshot undo, chunk shared-tile warnings, palette-line
  adoption for empty cells). The engine decides *which* pixels changed; Composer keeps
  full ownership of *how* they're written and undone.

## 4. `PixelEditController` (the engine)

Pure class, constructed/updated with a `ToolConfig` and driven by a gesture API.

```ts
type ArtTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';
interface ToolConfig {
  tool: ArtTool;
  color: number;            // active palette index 0..15
  mirror: MirrorMode | null;
  dither: { pattern: DitherPattern; secondary: number };
  pixelPerfect: boolean;
}
interface GestureResult {
  writes: Write[];                       // net changed pixels since begin()
  selection?: SpriteSelection | null;    // for the select tool
  pick?: number;                         // for eyedropper (value under the cursor)
}
interface PreviewShape { kind: 'none' | 'line' | 'rect' | 'marquee' | 'move'; rect?: Rect; points?: Pt[]; }

class PixelEditController {
  setConfig(c: ToolConfig): void;
  begin(surface: Surface, x: number, y: number, existingSelection?: SpriteSelection | null): void;
  move(x: number, y: number): void;
  end(): GestureResult;
  preview(): PreviewShape;     // geometry only — host draws it
  workingPixels(): Uint8Array; // current in-gesture pixels, for incremental live render
}
```

Responsibilities (all currently duplicated across the two canvases):
- **Strokes** (pencil/eraser/dither): Bresenham interpolation between successive points,
  mirror-point expansion, pixel-perfect L-corner drop, dither value selection. Maintains
  a working buffer so the stroke reads its own pixels.
- **Shapes** (line/rect): preview during the gesture; final write list on `end`, with
  mirror applied to endpoints.
- **fill**: flood fill from the start point (one-shot).
- **eyedropper**: returns the value under the cursor (one-shot, no writes).
- **select / move**: marquee rect; if `begin` lands inside an existing selection, it's a
  move (cut + paste region) producing writes + an updated selection.

The controller delegates the actual pixel math to the existing pure helpers in
`pixel-ops.ts` (no logic forked).

## 5. Canvas adapters

**SpriteCanvas** (288 → ~thin): keep rendering (frame pixels + checkerboard + cell grid +
piece overlay); on pointer events, drive the controller; `move` re-renders from
`controller.workingPixels()`; `end` → `setBuffer(apply(frame, writes))` and
`setSelection(result.selection)`. Palette override + `overlayRects` unchanged.

**ComposerCanvas** (929 → thinner, but conservative): keep all rendering (composed cells,
pixel/tile/block grid, collision HUD, repeat preview), the dual-canvas overlay, and the
commit/undo/atlas code. Route pointer events through the controller; apply its `writes`
via the existing `bufferToWrites`/`commitWrites` path. **Tile-space tools (tile-stamp,
collision) and repeat-preview do NOT go through the controller** — they stay as-is.

## 6. Shared tool-column UI

Extract presentational components to `src/renderer/components/art-shared/`:
`ToolButtonGrid` (icons + selection), `DitherConfig` (pattern + secondary stepper),
`ZoomControl` (±, range-clamped via props), `MirrorButton` (off→H→V→both cycle),
`TransformGrid` (flip-h/v, rotate-90 with `disabled` prop). `ToolColumn` composes these
+ brush-space tabs + collision config; `SpriteToolColumn` composes these + pixel-perfect.
Stores stay separate; only the UI pieces are shared.

## 7. Testing

- **Engine (unit, pure):** golden `Write[]` for representative gestures — a plain pencil
  line, a *mirrored* diagonal stroke, pixel-perfect L-corner drop, dither stroke, a
  filled rect (with mirror), a flood fill, eyedropper pick, and a select→move. These lock
  the behavior the two canvases share today.
- **Adapters (behavior parity):** existing sprite/level tests stay green; add a small
  test that `applyWrites(buffer, controller-output)` equals the pre-refactor result for a
  known stroke.
- **Manual/visual:** verify in the running app that Art mode (level art, incl. live-atlas
  edit + undo + collision + repeat preview) and Sprite mode (incl. mirror, select-move,
  pixel-perfect, transforms) are unchanged.

## 8. Phasing (no big-bang)

1. **Engine + tests** — `PixelEditController` + `Surface`/`Write`; full unit suite. No UI
   touched.
2. **SpriteCanvas adapter** — migrate sprite drawing onto the engine (low risk: simple
   `setBuffer` commit). Verify sprite editing end-to-end.
3. **ComposerCanvas adapter** — migrate shapes/fill first (already buffer-based), then
   strokes, preserving all commit/undo/atlas/cell-adoption code. Tile-space tools and
   repeat-preview untouched. Verify level art end-to-end (the highest-risk step).
4. **Shared tool-column UI** — extract the presentational components; rewire both columns.

Each phase leaves both modes fully working and independently reviewable.

## 9. Open questions / resolved

- **Resolved:** keep two render shells (engine unifies *logic*, not pixel-blitting);
  route Composer writes through its existing commit path (no undo/atlas rewrite).
- **Resolved:** tile-space tools (stamp/collision) + repeat-preview are Composer-only and
  never enter the engine.
- **Still open (resolve in planning):** whether `select/move` belongs in the engine v1 or
  stays per-canvas initially (sprite's move-region and composer's selection-transform
  differ in commit; the *geometry* is shared, the *commit* isn't). Lean: geometry +
  marquee in the engine; the actual cut/paste commit stays host-side if it proves leaky.
