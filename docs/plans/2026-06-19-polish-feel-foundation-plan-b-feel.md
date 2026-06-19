# Polish & Feel Foundation — Plan B ("Feel & correctness") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use checkbox (`- [ ]`) syntax.

**Goal:** unify canvas navigation (cursor-anchored zoom, hand-pan, fit, on-canvas HUD) across both viewports via one pure `camera.ts`; unify the shared pixel-tool modifiers into one `toolStore`; and give Sprite mode real undo/redo — building on Plan A's shell.

**Architecture:** Three pure, headless-testable foundations (`core/art/camera.ts`, `state/toolStore.ts`, `core/editing/sprite-history.ts`) land first with full unit tests; then the GUI integration wires them into `PixelViewport`/`MapViewport`/`agent-handler` and the option bars. The camera mirrors the math `viewStore.setZoom` already uses, so the Map's navigation is preserved when migrated.

**Tech Stack:** Electron + React 19 + TS, Zustand, Vitest (node env). No new deps.

**Spec:** `docs/specs/2026-06-19-polish-feel-foundation-design.md` (§3.3, §3.4, §3.5, §2.1).

---

## ⚠️ Execution gating (READ FIRST)

This plan splits into **Foundations (Part 1)** and **Integration (Part 2)**.

- **Part 1 (camera / toolStore / sprite-history modules + unit tests)** is PURE logic — fully verifiable headless (tsc + vitest). Safe to execute unattended.
- **Part 2 (wiring into the viewports, HUD overlay, hand-pan, fit, agent-handler migration, option-bar/undo wiring)** changes *interactive canvas behavior* that has NO automated test in this project (it does not DOM-test React). It **MUST be verified in the running Electron app** (`npm run dev`) WITH a human — cursor-anchored zoom, hand-pan feel, HUD readout, and the MapViewport/viewStore→camera migration cannot be confidence-checked by tsc/tests alone. **Do not execute Part 2 unattended.** Each Part-2 task ends in a human visual checkpoint.

The raw-hex guardrail (`test/renderer/no-raw-hex.test.ts`, ceiling 0) remains in force — add no raw hex; use `T.*`.

---

## File Structure

**Create (Part 1):**
- `src/core/art/camera.ts` — pure `Camera{x,y,zoom}` + ops (pan/zoom-at-point/fit/zoom-to-selection/clamp/screen↔world). No React.
- `test/art/camera.test.ts` — golden math tests.
- `src/renderer/state/toolStore.ts` — shared pixel-tool modifiers (mirror, dither, pixelPerfect).
- `test/renderer/tool-store.test.ts` — reducer/derivation tests.
- `src/core/editing/sprite-history.ts` — snapshot undo/redo for the sprite document.
- `test/editing/sprite-history.test.ts` — apply/undo/redo round-trips.

**Modify (Part 2 — GUI-gated):**
- `src/renderer/components/art-shared/PixelViewport.tsx` — drive nav through `camera.ts`; cursor-anchored wheel zoom; spacebar/middle hand-pan; HUD overlay.
- `src/renderer/components/MapViewport.tsx` + `src/renderer/state/viewStore.ts` — migrate Map pan/zoom onto a `camera.ts` instance (viewStore keeps `overlays`, loses pan/zoom).
- `src/renderer/agent/agent-handler.ts` / wherever `goto`/screenshot drive the Map — repoint to the camera.
- `src/renderer/state/artStore.ts` + `spriteStore.ts` — read modifiers from `toolStore`; remove duplicated fields.
- `src/renderer/shell/ArtToolOptions.tsx` + `SpriteToolOptions.tsx` — read modifiers from `toolStore`.
- Sprite undo wiring: `spriteStore` mutations route through `sprite-history`; app-bar Undo/Redo + Ctrl+Z/Y become mode-aware.
- A shared on-canvas HUD overlay component + fit/zoom-to-selection controls.

---

## Part 1 — Pure foundations (safe to execute headless)

### Task 1: `camera.ts` + golden tests

**Files:** Create `src/core/art/camera.ts`; Test `test/art/camera.test.ts`.

- [ ] **Step 1: Write the failing tests** (`test/art/camera.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { zoomAtPoint, pan, fit, zoomToSelection, screenToWorld, worldToScreen, clampZoom } from '../../src/core/art/camera';

describe('camera', () => {
  it('zoomAtPoint keeps the world point under the cursor fixed', () => {
    const cam = { x: 10, y: 20, zoom: 2 };
    const sx = 100, sy = 50;
    const before = screenToWorld(cam, sx, sy);
    const next = zoomAtPoint(cam, sx, sy, 4, { min: 0.125, max: 8 });
    const after = screenToWorld(next, sx, sy);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBe(4);
  });
  it('zoomAtPoint clamps to [min,max]', () => {
    expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 999, { min: 0.125, max: 8 }).zoom).toBe(8);
    expect(zoomAtPoint({ x: 0, y: 0, zoom: 1 }, 0, 0, 0.001, { min: 0.125, max: 8 }).zoom).toBe(0.125);
  });
  it('pan moves the world origin opposite the screen drag, scaled by zoom', () => {
    const cam = { x: 100, y: 100, zoom: 2 };
    expect(pan(cam, 10, -6)).toEqual({ x: 100 - 10 / 2, y: 100 - -6 / 2, zoom: 2 });
  });
  it('screen<->world round-trips', () => {
    const cam = { x: 7, y: 9, zoom: 3 };
    const w = screenToWorld(cam, 33, 12);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(33, 6); expect(s.y).toBeCloseTo(12, 6);
  });
  it('fit centers content with integer-friendly zoom and padding', () => {
    const cam = fit({ width: 100, height: 50 }, { width: 420, height: 240 }, { padding: 20 });
    // zoom = min((420-20)/100,(240-20)/50)=min(4,4.4)=4; content 400x200 centered in 420x240
    expect(cam.zoom).toBe(4);
    expect(cam.x).toBeCloseTo(-(420 - 400) / 2 / 4, 6); // left margin 10px / zoom
    expect(cam.y).toBeCloseTo(-(240 - 200) / 2 / 4, 6);
  });
  it('zoomToSelection frames a rect within max zoom', () => {
    const cam = zoomToSelection({ x: 0, y: 0, w: 50, h: 50 }, { width: 200, height: 200 }, { max: 8, padding: 0 });
    expect(cam.zoom).toBe(4); // 200/50
  });
  it('clampZoom bounds', () => { expect(clampZoom(100, 0.125, 8)).toBe(8); expect(clampZoom(0, 0.125, 8)).toBe(0.125); });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run test/art/camera.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/core/art/camera.ts`:

```ts
// Pure camera for pixel/map viewports. `x,y` = world-space coords of the
// viewport's top-left corner; `zoom` = device px per world unit. Mirrors the
// anchored-zoom math viewStore.setZoom already uses, so the Map's navigation is
// preserved when it migrates onto this.
export interface Camera { x: number; y: number; zoom: number; }
export interface ZoomBounds { min: number; max: number; }

export function clampZoom(z: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, z));
}
export function screenToWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}
export function worldToScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}
export function pan(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom, zoom: cam.zoom };
}
export function zoomAtPoint(cam: Camera, sx: number, sy: number, newZoomRaw: number, b: ZoomBounds): Camera {
  const zoom = clampZoom(newZoomRaw, b.min, b.max);
  const w = screenToWorld(cam, sx, sy);          // world point under cursor (before)
  return { x: w.x - sx / zoom, y: w.y - sy / zoom, zoom }; // keep it under the cursor (after)
}
export function fit(content: { width: number; height: number }, viewport: { width: number; height: number }, opts?: { padding?: number; max?: number }): Camera {
  const pad = opts?.padding ?? 0;
  const z = Math.min((viewport.width - pad) / content.width, (viewport.height - pad) / content.height);
  const zoom = opts?.max ? Math.min(z, opts.max) : z;
  // center: left over screen-space margin, converted to world units
  return { x: -((viewport.width - content.width * zoom) / 2) / zoom, y: -((viewport.height - content.height * zoom) / 2) / zoom, zoom };
}
export function zoomToSelection(rect: { x: number; y: number; w: number; h: number }, viewport: { width: number; height: number }, opts?: { max?: number; padding?: number }): Camera {
  const fitted = fit({ width: rect.w, height: rect.h }, viewport, opts);
  // translate so the selection (not 0,0) is centered
  return { x: rect.x + fitted.x, y: rect.y + fitted.y, zoom: fitted.zoom };
}
export function clampPan(cam: Camera, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Camera {
  return { ...cam, x: Math.max(bounds.minX, Math.min(bounds.maxX, cam.x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, cam.y)) };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/art/camera.test.ts` (7 tests pass). Then `npm test` (all green) + `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add src/core/art/camera.ts test/art/camera.test.ts && git commit -m "feat(art): pure Camera (anchored zoom/pan/fit) + golden tests"`

### Task 2: `toolStore` (shared pixel-tool modifiers) + tests

**Files:** Create `src/renderer/state/toolStore.ts`; Test `test/renderer/tool-store.test.ts`.
Scope: the modifiers art+sprite both have — `mirror: MirrorMode|null`, `ditherPattern`, `ditherSecondary`, `pixelPerfect`. NOT `tool` (art/sprite enums differ) and NOT `zoom` (camera owns).

- [ ] **Step 1: failing test** (`test/renderer/tool-store.test.ts`): assert defaults (`mirror:null`, `ditherPattern:'checker'`, `ditherSecondary:0`, `pixelPerfect:false`), and that `setMirror`/`setDither`/`setPixelPerfect` update state. Use `useToolStore.getState()`.
- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** a small zustand store:
```ts
import { create } from 'zustand';
import type { MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
interface ToolState {
  mirror: MirrorMode | null; ditherPattern: DitherPattern; ditherSecondary: number; pixelPerfect: boolean;
  setMirror: (m: MirrorMode | null) => void; setDither: (p: DitherPattern, secondary: number) => void; setPixelPerfect: (v: boolean) => void;
}
export const useToolStore = create<ToolState>((set) => ({
  mirror: null, ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
  setMirror: (mirror) => set({ mirror }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
}));
```
- [ ] **Step 4: run → pass; npm test; tsc.**
- [ ] **Step 5: commit** — `feat(state): shared toolStore for pixel-tool modifiers (no migration yet)`.

(NOTE: migrating `artStore`/`spriteStore` to READ from `toolStore` and removing their duplicated fields is a Part-2 integration task — it changes both editing surfaces and needs GUI verification.)

### Task 3: `sprite-history.ts` (snapshot undo/redo) + tests

**Files:** Create `src/core/editing/sprite-history.ts`; Test `test/editing/sprite-history.test.ts`.
Model: a snapshot stack of the sprite document. Snapshot = `{ frames: PixelBuffer[]; currentIndex: number; selection: SpriteSelection | null }` (deep-cloned buffers). API mirrors EditHistory's surface: `push(snapshot)`, `canUndo`, `canRedo`, `undo(current): snapshot|null`, `redo(): snapshot|null`, bounded depth (default 50).

- [ ] **Step 1: failing test** (`test/editing/sprite-history.test.ts`): push two snapshots; undo returns the previous; redo returns forward; canUndo/canRedo flags; a new push after undo truncates the redo stack; cloned buffers are independent (mutating a returned snapshot's buffer doesn't change history). Build PixelBuffers with `createBuffer` from `core/art/pixel-ops`.
- [ ] **Step 2: run → fail.**
- [ ] **Step 3: implement** a pure class `SpriteHistory` with deep-clone on push/return (clone each `PixelBuffer` via `{width,height,data:new Uint8Array(data)}`), `cap` truncation, and the canUndo/canRedo/undo/redo surface. (Pure — no zustand, no store coupling; the Part-2 wiring connects it to spriteStore.)
- [ ] **Step 4: run → pass; npm test; tsc.**
- [ ] **Step 5: commit** — `feat(editing): pure snapshot SpriteHistory (undo/redo) + tests (no wiring yet)`.

---

## Part 2 — Integration (⚠️ GUI verification required — do WITH the user, not unattended)

Each task here ends with: `npm run dev` and a HUMAN confirms the behavior. Specified at the level of intent + touch-points; exact code is settled at execution time against the live app.

### Task 4 (GUI): cursor-anchored zoom + hand-pan + HUD on `PixelViewport`
- Give `PixelViewport` a `Camera` (via `camera.ts`); replace origin-based zoom with `zoomAtPoint` on wheel; add Space-drag + middle-mouse hand-pan (grab cursor); keep `viewport-coords.pixelAt` for pointer→pixel mapping (now fed camera-derived local coords). Add the shared on-canvas HUD (cursor px/tile, zoom, hovered color). **Verify in-app:** wheel zooms toward cursor; Space/middle pans; HUD reads correctly; sprite & art drawing unchanged.

### Task 5 (GUI): migrate `MapViewport` pan/zoom onto `camera.ts`; reconcile `viewStore`
- Replace MapViewport's bespoke pan/zoom (currently `viewStore.vpX/vpY/zoom/setZoom/pan`) with a shared `camera`. `viewStore` keeps `overlays` only. Repoint `agent-handler` goto/screenshot (and any of the 7 viewStore consumers that read pan/zoom) to the camera. Add the same HUD + fit + zoom-to-selection. **Verify in-app:** map zoom/pan identical-or-better; overlays still toggle; agent `goto` still frames a section; nothing regressed.

### Task 6 (GUI): unify modifiers via `toolStore`; tool-options bars; shared shortcuts
- Migrate `artStore`/`spriteStore` to read `mirror/dither/pixelPerfect` from `toolStore`; remove the duplicated fields; point `ArtToolOptions`/`SpriteToolOptions` at `toolStore`. Add the central, surface-aware keyboard-shortcut registry (absorbing MapViewport's existing per-key handlers). **Verify in-app:** modifiers behave identically in art & sprite and no longer drift; shortcuts work per surface with no double-handling.

### Task 7 (GUI): Sprite undo/redo wiring
- Route `spriteStore` mutations (setBuffer/applyTransform/addFrame/duplicateFrame/deleteFrame/selectFrame) through `SpriteHistory`; make the app-bar Undo/Redo + Ctrl+Z/Y mode-aware (level `EditHistory` in Map/Art, `SpriteHistory` in Sprite). **Verify in-app:** draw, undo, redo all work in Sprite mode; frame add/remove undoable; no interference with Map/Art undo.

---

## Self-Review
- Part 1 covers spec §3.3 (camera math), §3.4 (toolStore modifiers), §3.5 (sprite-history) as pure, tested modules.
- Part 2 covers the integration of all three + the HUD/hand-pan/fit (§3.3), the store migration + shortcuts (§3.4/§2.1), and sprite-undo wiring (§3.5) — each gated on human GUI verification because this project has no React/canvas behavioral tests.
- Types: `Camera`/`ZoomBounds` (Task 1), `ToolState` (Task 2), `SpriteHistory` snapshot shape (Task 3) are defined once and referenced by the Part-2 tasks.
- No placeholders in Part 1 (full code/tests). Part 2 is intentionally intent-level: its code must be written against the live app with a human, per the gating note.
