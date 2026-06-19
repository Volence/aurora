# Spec — Polish & Feel Foundation

Status: **design, awaiting user review** · 2026-06-19 (rev 2 — verified against repo;
added state-reconciliation seam, pinned undo model, split into two plans)
Roadmap context: first of three sub-projects under "make Aurora a best-in-class
professional editor." The other two — **collision authoring + in-game view** and
**multi-game level load/stitch/port** — are separate specs, sequenced after this. See
`docs/ideas/2026-06-16-art-suite-vision.md` and the merged
`docs/specs/2026-06-18-unified-drawing-core-design.md` this builds on.

## 0. Why this spec exists

The unified drawing core (PixelEditController + PixelViewport + shared ToolColumnParts,
phases 1–5) is **done in code**. The editor still doesn't *feel* or *look* finished. A
scoping pass narrowed the dissatisfaction to **look**, **feel**, and **lacks depth**, and
chose to fix the first two (**polish & feel foundation**) before adding craft depth,
because depth features land badly on a canvas that doesn't navigate like a pro tool.

Grounded findings (all verified against the repo, rev 2):

- **Look.** The Empyrean token system (`src/renderer/styles/theme.css`, imported once in
  `index.tsx`) is referenced **16 times total** across the whole renderer — and every one
  of those 16 still embeds a hardcoded hex *fallback* (`var(--border, #2A2F3D)`); 23 of 27
  component files reference **no** token at all. Meanwhile there are **347** hardcoded
  6-digit hex literals in `.tsx` and **23 of 27** components hand-roll an inline
  `const styles` object. No CSS classes, no shared component layer.
- **Feel — inconsistent shell.** Tools live in different places per mode (Map: top
  `Toolbar`, `Toolbar.tsx:180`; Art & Sprite: a left column). Sprite renders its **own**
  second top bar (`SpriteMode.tsx:111`) *below* the always-present global `Toolbar`
  (`App.tsx:69`) — double chrome. Left rail widths: 200 (Map) / 56 (Art) / column
  (Sprite); right panel: Properties (Map) / 220 (Art) / 240 (Sprite).
- **Feel — canvas navigation is split and uneven.** `MapViewport` and `PixelViewport`
  share **no** pan/zoom code. The *pixel* surface (Art/Sprite) zoom is **origin-based**
  (`PixelViewport` takes `zoom` as a prop, pan delegated to a CSS scroll container) — so
  deep zoom forces re-scrolling, and there's no hand-pan. The *map* surface is actually
  further along: `viewStore.setZoom(zoom, cx, cy)` already does **cursor-anchored** zoom,
  plus arrow-key and middle-drag pan. Neither surface has an **on-canvas HUD**
  (cursor pos, zoom, hovered color/tile), fit-to-window, or zoom-to-selection.
- **Feel — drift + a correctness hole.** `tool`, `mirror`, `dither`, and `zoom` are
  duplicated between `artStore` and `spriteStore` (each with its own setters/clamps).
  `pixelPerfect` is **not** duplicated — it exists *only* in `spriteStore`; `artStore` has
  no such field and the composer **hardcodes `pixelPerfect: false`** at
  `ComposerCanvas.tsx:297`. So the surfaces are out of sync by omission. And **Sprite mode
  has no undo/redo at all** — `spriteStore` mutates frame buffers directly (no history),
  while the composer rides the level `EditHistory`.

## 1. Goal & non-goals

**Goal:** make the existing app look and feel like **one** best-in-class tool — a design
system actually applied, one consistent shell, pro canvas navigation unified across both
viewports, unified tool state, and the two correctness gaps closed — with **zero loss** of
existing functionality.

**In scope (five workstreams, §3), delivered as two sequential plans (§6).**

**Out of scope — next spec ("Drawing craft depth"):** layer system; advanced selection
(lasso/wand/by-color, the four boolean modes, transform handles, floating-selection
paste/nudge); brush sizes/shapes/custom brushes; gradient/tolerance fill; replace-color;
shade/smudge. Also out: collision authoring and multi-game level formats (own specs).

**Locked design decisions** (brainstorming + delegated aesthetic calls):
- **Shell = Direction A**: tools always **left** (icon dock), panels always **right**
  (docked, collapsible), a **contextual tool-options bar** under the app bar, **on-canvas
  HUD**, **bottom status bar**. Same chrome for Map/Art/Sprite.
- **Density = Compact**, **icon tools w/ tooltips** (local inline SVGs — no new icon
  dependency), Empyrean tokens only (emerald `--accent` reserved for active/primary).
- **Concrete shell metrics** (so the migration doesn't invent them): tool dock **44px**;
  right panel column **240px**; app bar **~40px**, tool-options bar **~32px**, status bar
  **~24px**; HUD background `rgba(10,12,18,0.85)`, 1px `--border`, mono 11px, bottom-left
  8px inset. Spacing from the `--space-*` scale (compact: 4/6/8px paddings).

## 2. Architecture — new seams

```
┌ Shared UI primitives  (src/renderer/components/ui/) ────────────────────────────┐
│  Panel · PanelHeader · ToolButton(icon+tooltip) · IconButton · OptionBar ·       │
│  Select · NumberField · Chip · Divider · StatusBar · Menu(dropdown) — token-only │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲ composed by
┌ EditorShell  (src/renderer/shell/EditorShell.tsx) ──────────────────────────────┐
│  app bar (incl. a "View" Menu hosting overlay/grid toggles) → tool-options bar → │
│  [ tool dock | <canvas slot> | right panels(collapsible) ] → status bar.         │
│  Modes supply: dock items, options content, panel set, optional bottom extra.    │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲ canvas slot hosts a Camera         ▲ reads (config) / writes (eyedropper→color)
┌ camera.ts (src/core/art/, pure) ───────────┐   ┌ toolStore (src/renderer/state/) ─┐
│  Camera{x,y,zoom}; zoomAtPoint (anchored),  │   │  PIXEL-tool config shared by     │
│  pan, fit, zoomToSelection, clampPan,       │   │  art+sprite: tool(ArtTool),      │
│  screen<->world. Calls viewport-coords      │   │  mirror, dither, pixelPerfect.   │
│  .pixelAt (kept, still unit-tested).        │   │  NOT zoom, NOT brush.             │
└────────────────────────────────────────────────┘   └────────────────────────────────┘
┌ sprite-history.ts (src/core/editing/) ──────────────────────────────────────────┐
│  SNAPSHOT-based doc history (frames[] + currentIndex + selection). Mirrors        │
│  EditHistory only at the canUndo/canRedo/undo/redo API surface — NOT its command  │
│  model. Covers pixel edits AND frame add/remove/reorder uniformly.                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Reconciling existing state (the load-bearing seam)

Five stores/enums currently overlap the new seams; this spec pins each:

- **`viewStore`** today owns Map **pan/zoom** *and* the **7 overlay toggles**, and is read
  by 7 files (`Toolbar`, `PropertiesPanel`, `SectionGridNav`, `MapViewport`,
  `OverlayRenderer`, `agent-handler`, `useProject`).
  → **Pan/zoom moves to a `camera.ts` instance** held by `MapViewport` (its existing
  anchored-zoom math becomes the reference implementation for `camera.zoomAtPoint`).
  → **Overlay toggles stay in `viewStore`** but are surfaced through the app bar **View
  menu** (their current home, `Toolbar` row 2, is deleted in the shell migration).
  → **`agent-handler`'s `goto`/screenshot** (which drive the Map via `viewStore` zoom/pan)
  migrate to read/write the Map camera. Listed as an explicit migration step.
- **`editorStore.tool`** is the **Map placement-tool** enum (view/select/paint-tile/
  stamp-chunk/paint-collision/place-object/place-ring) — a *different domain* from the
  pixel-drawing `ArtTool`. → It **stays in `editorStore`**. `toolStore` holds only the
  shared **pixel** tool config (art+sprite). The two are not merged.
- **Keyboard shortcuts** become **one central registry** that dispatches by active surface:
  in Map it sets `editorStore.tool` (absorbing MapViewport's existing s/c/etc. handlers so
  there are no competing key listeners); in Art/Sprite it sets `toolStore.tool`. One
  registry, surface-aware routing.
- **`artStore`/`spriteStore`** keep their non-tool fields (artStore: brushSpace/brushTile/
  paletteLine/repeatPreview/docVersion; spriteStore: frames/selection/currentIndex/…) and
  **drop** the duplicated `tool/mirror/dither/zoom`, reading those from `toolStore`
  (tool config) and their viewport's `camera` (zoom). This removes the duplication and the
  `pixelPerfect` asymmetry by construction.

## 3. Workstreams

### 3.1 Design-system adoption + shared UI primitives  *(look)*
- Add `src/renderer/components/ui/` (primitives in §2), token-driven, no raw hex.
- Migrate components to primitives + tokens, removing inline hex (order follows the shell
  migration so nothing is restyled twice). Tools become **icon buttons + tooltips** (local
  inline-SVG set).
- **Guardrail = a vitest test** (NOT a lint rule — the repo has no ESLint config) that
  fails on new 6-digit hex literals in `src/renderer/**` outside `theme.css`.
- **Cheap correctness fix lands here:** delete the `ComposerCanvas.tsx:297`
  `pixelPerfect: false` hardcode (it's one line; no need to gate it behind toolStore).

### 3.2 Unified shell — Direction A  *(look + feel)*
- `EditorShell` renders the fixed regions (§2 metrics). Map/Art/Sprite become content
  providers (dock items, options content, right-panel set, optional bottom extra =
  Sprite's `FrameGrid`+`Timeline`).
- Removes Sprite's second top bar, Art's doc-header sub-bar, the Map 2-row toolbar.
- **Overlay/grid toggles** move from `Toolbar` row 2 into an app-bar **"View" menu**
  (sourced from `viewStore.overlays`), available in every mode.
- Right panels collapsible; collapsed/expanded state **persisted to `localStorage`**
  (`aurora.shell.panels`), surviving restart.
- Existing `CommandPalette` (⌘K) stays and gains fit / zoom-to-selection / tool actions.

### 3.3 Pro canvas navigation + on-canvas HUD  *(feel — core)*
- `camera.ts` (pure, unit-tested): `Camera{x,y,zoom}` + `zoomAtPoint` (cursor-anchored),
  `pan`, `fit(content,viewport)`, `zoomToSelection(rect,viewport)`, `clampPan`, and
  screen↔world mapping. **Calls** the existing `viewport-coords.pixelAt` (the helper and
  its test are kept, not deleted).
- Both viewports navigate through `camera.ts`:
  - **Cursor-anchored wheel zoom** — new for `PixelViewport`; `MapViewport`'s existing
    anchored math is migrated onto the shared op (so it's the *same* code, not merely
    similar). Live `Camera` state lives at the viewport (zoom is **not** in toolStore).
  - **Hand-pan**: Space-drag or middle-mouse drag (grab cursor); doesn't disturb tool or
    selection. (`MapViewport` already has middle-drag/arrow pan — generalized + Space added
    + brought to the pixel surface, which has none today.)
  - **Fit-to-window**, **zoom-to-selection**, **100%/reset** (buttons + shortcuts).
- **On-canvas HUD** (shared overlay, mono, bottom-left, metrics in §1): cursor pos in
  **pixels and tiles**, zoom, hovered **color index/value** (+ tile under cursor on the
  map), live selection size. Drawn via the viewport's existing `drawOverlay` escape-hatch.

### 3.4 Unified tool state + shortcuts + tool-options bar  *(feel)*
- `toolStore` (Zustand): single source for the **pixel** tool config (`tool`, `mirror`,
  `dither`, `pixelPerfect`). `artStore`/`spriteStore` read it; their duplicated fields are
  removed. **No `zoom`** (camera owns), **no `brush`** field (deferred to the depth spec —
  we don't ship unused shared state).
- **Central keyboard-shortcut registry** (§2.1), surface-aware, absorbing the Map's
  existing per-key handlers so there are no duplicate listeners.
- **Tool-options bar** reflects the active tool from `toolStore` (pixel surfaces) /
  `editorStore` (map). Presentational.

### 3.5 Sprite undo/redo  *(feel / trust)*
- `sprite-history.ts`: **snapshot-based** history of the sprite document — `frames[]`,
  `currentIndex`, `selection` — bounded depth (default 50). Each undoable mutation pushes
  the prior snapshot; **covers pixel edits and frame add/remove/reorder uniformly**
  (resolves the "if cheap" ambiguity: structural undo is IN, for free, via doc snapshots).
- API exposes only `canUndo/canRedo/undo/redo` (mirrors `EditHistory`'s *surface*, not its
  command model). `spriteStore` mutations route through it.
- Wired to the **same** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y + app-bar undo/redo buttons; the
  app-bar control becomes **mode-aware** (level `EditHistory` in Map/Art, `sprite-history`
  in Sprite).

## 4. Data flow
- **Navigation:** pointer/wheel/key → viewport handler → pure `camera` op → new `Camera` →
  re-render; HUD reads cursor + camera + hovered buffer value.
- **Tools:** `toolStore` → tool-options bar (display) + controller (behavior). The gesture
  path through `PixelEditController` → host commit/undo is **unchanged**; toolStore only
  replaces the *source* of tool config. The viewport **writes** toolStore in exactly one
  case (eyedropper sets the active color); otherwise it reads.
- **Undo:** Map/Art → level `EditHistory`; Sprite → `sprite-history`; one mode-aware
  app-bar control + shared shortcuts.

## 5. Testing
- **Pure unit:** `camera.ts` (anchored zoom keeps the world point under the pointer fixed;
  pan clamp; fit; zoom-to-selection), `toolStore` (config/derivation), `sprite-history`
  (snapshot apply/undo/redo incl. a frame add/remove case).
- **Guardrail test:** no new raw hex in `src/renderer/**` outside `theme.css` (§3.1).
- **Parity / no-regression:** the 58 existing specs stay green; `viewport-coords.test.ts`
  kept.
- **Manual/visual — with the user**, per surface: Map (tile/collision/chunk/object/ring +
  overlays via View menu), Art (live-atlas edit, repeat preview, grids), Sprite (mirror,
  select-move, pixel-perfect, transforms, piece overlays, **and the new undo**). Confirm
  identical cursor-anchored zoom, hand-pan, fit, and HUD on all three.

## 6. Phasing — two plans (the spec is one design; implementation splits in two)

**Plan A — "Look" (phases 1–2):** shippable on its own; no canvas-behavior change.
1. UI primitives + token adoption + the raw-hex guardrail test + the one-line
   `pixelPerfect` composer fix.
2. `EditorShell`; move Map → Art → Sprite into it; delete per-mode chrome (incl. Sprite's
   second toolbar); overlay/grid toggles → app-bar **View menu**; localStorage panel state.

**Plan B — "Feel & correctness" (phases 3–5):** builds on Plan A's shell.
3. `camera.ts` (tested) on `PixelViewport` first (adds anchored zoom + Space/middle pan +
   fit + HUD), then migrate `MapViewport`'s pan/zoom off `viewStore` onto the shared camera
   (lower risk than first assumed — the map already has anchored zoom) and update
   `agent-handler` goto/screenshot to the camera.
4. `toolStore` + central shortcut registry + tool-options bar.
5. `sprite-history` undo/redo + mode-aware app-bar control.

Order rationale: tokens/primitives first; the shell unifies layout without touching canvas
behavior; the camera lands on the simpler pixel surface before the map; tool-state and the
sprite-undo correctness fix sit on the unified substrate last.

## 7. Risks & open questions
- **MapViewport camera migration (phase 3)** is the highest-touch step, but de-risked by
  the rev-2 finding that the map *already* does cursor-anchored zoom — the migration is
  mostly relocating existing pan/zoom state from `viewStore` into a shared `camera`, plus
  re-pointing `agent-handler`. "Identical navigation on all three surfaces" is a **hard
  Plan-B requirement**, not optional (the earlier "map keeps its own nav" fallback is
  dropped).
- **`viewStore` after migration:** it shrinks to overlays-only (its pan/zoom removed). If a
  thin compatibility shim is needed during phase 3 to avoid touching all 7 consumers at
  once, that's a planning detail; the end state is camera-owned view transform.
- Remaining genuinely-deferred-to-planning items: exact icon glyphs; the `Menu` primitive's
  interaction details; localStorage schema for panel state.

## 8. Success criteria
- No raw hex in `src/renderer/**` (outside `theme.css`); all chrome token-driven; the three
  modes share one shell and read as one tool; overlay toggles live in the View menu.
- Cursor-anchored zoom, Space/middle hand-pan, fit, zoom-to-selection, and a live HUD work
  **identically** on Map, Art, and Sprite, all driven by the one `camera.ts`.
- One `toolStore` for pixel tools; no duplicated `tool/mirror/dither/zoom`; `pixelPerfect`
  consistent across surfaces; Map tools remain their own domain in `editorStore` but share
  the one shortcut registry.
- Sprite mode has working snapshot-based undo/redo (incl. frame add/remove/reorder) on the
  same bindings as everywhere else.
- All 58 existing tests green; new pure-logic tests cover camera, toolStore, sprite-history;
  the raw-hex guardrail test is in place.
