# Unified Drawing Core Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans / TDD. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extract a pure `PixelEditController` (all pixel-drawing logic) + a data-model-agnostic `PixelViewport` (rendering + input), used by both the level-art and sprite-art surfaces, with zero behavior regression.

**Architecture:** Engine (pure TS, gesture API over a `PixelBuffer`, returns updated buffer + selection/pick) → `PixelViewport` (renders pixels+overlays, routes pointer to the engine) → hosts (sprite/composer resolve data→pixels + own commit/undo). See `docs/specs/2026-06-18-unified-drawing-core-design.md`.

**Tech Stack:** TypeScript, React, Vitest, Zustand. Reuses `src/core/art/pixel-ops.ts`.

**Refinement vs spec:** the engine operates directly on `PixelBuffer` (which already carries `width/height/data` — it *is* the `Surface`) and returns an updated `PixelBuffer`; a `diffWrites(before, after)` helper yields `Write[]` for the Composer host. This matches the existing SpriteCanvas logic exactly (lower regression risk) while keeping the engine host-agnostic.

**Resolved open questions:** select/move geometry AND commit live in the engine (it returns the moved buffer + new selection — the sprite path already does cut+paste in one buffer; the Composer host applies the resulting writes through its commit path). Overlay model: a small typed set (`marquee`/`outline`/`move`/shape-`preview`) + an optional `drawOverlay(ctx, transform)` escape hatch for the collision HUD.

---

## Phase 1 — `PixelEditController` engine (pure, fully tested)

Extracts the gesture logic currently inline in `SpriteCanvas.tsx` (paintValue, renderStroke, Bresenham pushPathPoint, pixel-perfect addPoint, mirrorEndpointPairs, marquee select+move) into a pure, reusable class.

**Files:**
- Create: `src/core/art/pixel-edit-controller.ts`
- Test: `test/art/pixel-edit-controller.test.ts`

### Task 1: Engine skeleton + config + instantaneous tools (fill/eyedropper)

- [ ] **Step 1: Write failing tests** (`test/art/pixel-edit-controller.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { PixelEditController } from '../../src/core/art/pixel-edit-controller';
import { createBuffer } from '../../src/core/art/pixel-ops';
import type { ToolConfig } from '../../src/core/art/pixel-edit-controller';

const cfg = (over: Partial<ToolConfig> = {}): ToolConfig => ({
  tool: 'pencil', color: 5, mirror: null, ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false, ...over,
});
function buf(w: number, h: number, fill = 0) { const b = createBuffer(w, h); b.data.fill(fill); return b; }

describe('PixelEditController — instantaneous tools', () => {
  it('eyedropper begin() returns the pixel under the cursor as pick, no gesture', () => {
    const b = buf(4, 4); b.data[2 * 4 + 1] = 9;
    const c = new PixelEditController(cfg({ tool: 'eyedropper' }));
    const r = c.begin(b, 1, 2, null);
    expect(r).not.toBeNull();
    expect(r!.pick).toBe(9);
    expect(c.isActive).toBe(false);
  });
  it('fill begin() floods and returns the new buffer, no gesture', () => {
    const b = buf(3, 3);
    const c = new PixelEditController(cfg({ tool: 'fill', color: 7 }));
    const r = c.begin(b, 0, 0, null);
    expect(Array.from(r!.buffer.data)).toEqual(new Array(9).fill(7));
    expect(c.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run test/art/pixel-edit-controller.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement skeleton** (`src/core/art/pixel-edit-controller.ts`)

```ts
import { floodFill, drawLine, drawRect, ditherValue, mirrorPoints, isLCorner } from './pixel-ops';
import type { PixelBuffer, MirrorMode, DitherPattern } from './pixel-ops';

export type ArtTool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';
export interface Selection { x: number; y: number; w: number; h: number; }
export interface ToolConfig {
  tool: ArtTool; color: number; mirror: MirrorMode | null;
  ditherPattern: DitherPattern; ditherSecondary: number; pixelPerfect: boolean;
}
export interface Write { x: number; y: number; value: number; }
export type Preview =
  | { kind: 'none' }
  | { kind: 'line' | 'rect' | 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'move'; dx: number; dy: number; sel: Selection };
export interface GestureResult { buffer: PixelBuffer; selection?: Selection | null; pick?: number; }
interface Pt { x: number; y: number; }

const clone = (b: PixelBuffer): PixelBuffer => ({ width: b.width, height: b.height, data: new Uint8Array(b.data) });
const setPx = (b: PixelBuffer, x: number, y: number, v: number) => { if (x >= 0 && x < b.width && y >= 0 && y < b.height) b.data[y * b.width + x] = v; };

export function diffWrites(before: PixelBuffer, after: PixelBuffer): Write[] {
  const out: Write[] = [];
  for (let i = 0; i < after.data.length; i++) if (after.data[i] !== before.data[i]) out.push({ x: i % after.width, y: Math.floor(i / after.width), value: after.data[i] });
  return out;
}

export class PixelEditController {
  private cfg: ToolConfig;
  private snapshot: PixelBuffer | null = null;
  private working: PixelBuffer | null = null;
  private path: Pt[] = [];
  private start: Pt | null = null;
  private sel: Selection | null = null;
  private moveRegion: { data: Uint8Array; w: number; h: number; ox: number; oy: number } | null = null;
  private preview_: Preview = { kind: 'none' };
  private active = false;

  constructor(cfg: ToolConfig) { this.cfg = cfg; }
  setConfig(cfg: ToolConfig): void { this.cfg = cfg; }
  get isActive(): boolean { return this.active; }
  preview(): Preview { return this.preview_; }
  workingBuffer(): PixelBuffer | null { return this.working; }

  private paintValue(x: number, y: number): number {
    if (this.cfg.tool === 'eraser') return 0;
    if (this.cfg.tool === 'dither') return ditherValue(this.cfg.ditherPattern, x, y, this.cfg.color, this.cfg.ditherSecondary);
    return this.cfg.color;
  }

  begin(buffer: PixelBuffer, x: number, y: number, selection: Selection | null): GestureResult | null {
    this.sel = selection;
    if (this.cfg.tool === 'eyedropper') return { buffer, pick: buffer.data[y * buffer.width + x] };
    if (this.cfg.tool === 'fill') return { buffer: floodFill(buffer, x, y, this.paintValue(x, y)) };
    // gesture tools handled in Task 2/3
    this.active = true; this.snapshot = clone(buffer); this.start = { x, y };
    return null;
  }
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/art/pixel-edit-controller.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(art): PixelEditController skeleton + instantaneous tools"`

### Task 2: Stroke tools (pencil/eraser/dither) with Bresenham, mirror, pixel-perfect

- [ ] **Step 1: Write failing tests** — add to the test file:

```ts
describe('PixelEditController — strokes', () => {
  it('pencil single point sets the pixel (via working buffer + end)', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 3 }));
    expect(c.begin(buf(4, 4), 1, 1, null)).toBeNull();
    const r = c.end(1, 1);
    expect(r.buffer.data[1 * 4 + 1]).toBe(3);
  });
  it('pencil drag interpolates a connected line (Bresenham)', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 1 }));
    c.begin(buf(5, 5), 0, 0, null); c.move(4, 4); const r = c.end(4, 4);
    for (let i = 0; i < 5; i++) expect(r.buffer.data[i * 5 + i]).toBe(1); // diagonal filled
  });
  it('mirror both reflects each stroke point', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 2, mirror: 'both' }));
    c.begin(buf(4, 4), 0, 0, null); const r = c.end(0, 0);
    expect(r.buffer.data[0]).toBe(2);            // (0,0)
    expect(r.buffer.data[3]).toBe(2);            // (3,0)
    expect(r.buffer.data[12]).toBe(2);           // (0,3)
    expect(r.buffer.data[15]).toBe(2);           // (3,3)
  });
  it('pixel-perfect drops the L-corner middle pixel', () => {
    const c = new PixelEditController(cfg({ tool: 'pencil', color: 1, pixelPerfect: true }));
    // (0,0) -> (1,0) -> (1,1) : the (1,0) middle of the L should be dropped
    c.begin(buf(4, 4), 0, 0, null); c.move(1, 0); c.move(1, 1); const r = c.end(1, 1);
    expect(r.buffer.data[0]).toBe(1);     // (0,0) kept
    expect(r.buffer.data[1]).toBe(0);     // (1,0) dropped
    expect(r.buffer.data[5]).toBe(1);     // (1,1) kept
  });
  it('dither lays a checker of color/secondary', () => {
    const c = new PixelEditController(cfg({ tool: 'dither', color: 6, ditherSecondary: 2, ditherPattern: 'checker' }));
    c.begin(buf(2, 2), 0, 0, null); c.move(1, 0); c.move(1, 1); c.move(0, 1); const r = c.end(0, 1);
    expect(r.buffer.data[0]).toBe(6);  // (0,0) even -> a
    expect(r.buffer.data[1]).toBe(2);  // (1,0) odd  -> b
  });
});
```

- [ ] **Step 2: Run, verify fail** (end/move not implemented).
- [ ] **Step 3: Implement** — add the stroke machinery to the class (faithful port of SpriteCanvas `pushPathPoint`/`addPoint`/`renderStroke`):

```ts
  private addPoint(p: Pt): void {
    const last = this.path[this.path.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    this.path.push(p);
    if (this.cfg.pixelPerfect && this.path.length >= 3
      && isLCorner(this.path[this.path.length - 3], this.path[this.path.length - 2], this.path[this.path.length - 1])) {
      this.path.splice(this.path.length - 2, 1);
    }
  }
  private pushPathPoint(p: Pt): void {
    const last = this.path[this.path.length - 1];
    if (!last) { this.addPoint(p); return; }
    let x0 = last.x, y0 = last.y; const x1 = p.x, y1 = p.y;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (!(x0 === last.x && y0 === last.y)) this.addPoint({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  private renderStroke(): void {
    if (!this.snapshot) return;
    const b = clone(this.snapshot);
    for (const p of this.path) {
      const v = this.paintValue(p.x, p.y);
      for (const m of this.cfg.mirror ? mirrorPoints(b.width, b.height, p.x, p.y, this.cfg.mirror) : [p]) setPx(b, m.x, m.y, v);
    }
    this.working = b;
  }
```

Then update `begin()` (for stroke tools, after starting the gesture) to `this.path = []; this.pushPathPoint({ x, y }); this.renderStroke();`, add `move(x, y)` and `end(x, y)`:

```ts
  move(x: number, y: number): void {
    if (!this.active) return;
    const t = this.cfg.tool;
    if (t === 'line' || t === 'rect') { if (this.start) this.preview_ = { kind: t, x0: this.start.x, y0: this.start.y, x1: x, y1: y }; return; }
    if (t === 'select') { /* Task 4 */ return; }
    this.pushPathPoint({ x, y }); this.renderStroke();
  }
  end(x: number, y: number): GestureResult {
    const result = this.finish(x, y);
    this.active = false; this.snapshot = null; this.working = null; this.path = []; this.start = null; this.moveRegion = null; this.preview_ = { kind: 'none' };
    return result;
  }
  private finish(x: number, y: number): GestureResult {
    // strokes: working buffer is the result; line/rect/select in Task 3/4
    return { buffer: this.working ?? this.snapshot! };
  }
```

(`begin` stroke branch sets up the path; `move` extends it; `end` returns `working`.)

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `feat(art): controller stroke tools (bresenham, mirror, pixel-perfect, dither)`

### Task 3: Shape tools (line/rect) with mirrored endpoints

- [ ] **Step 1: Failing tests** — line draws between endpoints; rect fills; mirror reflects endpoints. (Concrete asserts mirroring SpriteCanvas pointer-up shape logic.)
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — port `mirrorEndpointPairs` (module-private) + handle line/rect in `finish()`: from `snapshot`, for each mirrored endpoint pair apply `drawLine`/`drawRect` (filled), accumulate, return.
- [ ] **Step 4/5: Pass + commit.**

### Task 4: Select + move (marquee, region cut/paste)

- [ ] **Step 1: Failing tests** — begin outside selection → marquee → end returns `selection`; begin inside selection → move → end returns moved buffer + updated selection; <2px marquee clears selection.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — port the select branch of SpriteCanvas (begin: detect inside-selection → cut region into snapshot; move: update `move`/`marquee` preview; finish: paste region OR set normalized selection). `norm()` helper module-private.
- [ ] **Step 4/5: Pass + commit.**

### Task 5: Full-suite + typecheck green

- [ ] Run `npx vitest run` and `npx tsc --noEmit`; commit nothing new unless fixes needed. The engine is complete and pure.

---

## Phase 2 — `PixelViewport` component (additive, non-breaking)

**Files:** Create `src/renderer/components/art-shared/PixelViewport.tsx`, `src/core/art/viewport-coords.ts` (pure), `test/art/viewport-coords.test.ts`.

### Task 6: Pure coordinate mapping
- [ ] TDD `pixelAt(clientX, clientY, rect, zoom, repeat?)` → `{x,y} | null` (canvas-local → pixel, with optional repeat offset). Unit-tested (pure).

### Task 7: PixelViewport component
- [ ] Build the component: render `pixels+palette` at zoom (OffscreenCanvas blit), checkerboard layer, grids layer (`pixel|cell8|tile|block`), overlay layer (marquee/outline/move/preview + optional `drawOverlay` escape hatch), repeat-tiling; pointer handlers drive a passed `PixelEditController` (`begin`/`move`/`end`), re-render from `controller.workingBuffer()` during a gesture, call `onCommit(result)` / `onPick`. Props per spec §5. Typecheck + build green. (Visual verification deferred to host migration with the user.)

---

## Phase 3 — Sprite host migration (needs visual verification — do WITH the user)

### Task 8: Move SpriteMode onto PixelViewport + controller
- [ ] Replace `SpriteCanvas` usage with `PixelViewport` driven by a `PixelEditController` built from spriteStore config; `onCommit` → `setBuffer`/`setSelection`; `onPick` → artStore.setSelectedColor. Keep piece overlays. Delete `SpriteCanvas.tsx`. **Verify in running app: pencil/eraser/fill/eyedropper/line/rect/select-move/dither/mirror/pixel-perfect/zoom all behave as before.**

---

## Phase 4 — Composer host migration (highest risk — do WITH the user)

### Task 9: Composition → buffer + overlays
- [ ] Point ComposerCanvas's existing cell/atlas/repeat composition at a `PixelBuffer` fed to `PixelViewport`; move grids/collision-HUD to overlays/escape-hatch. Keep tile-stamp + collision as a Composer-only interaction (not through the controller). Verify rendering parity.

### Task 10: Route drawing through the controller
- [ ] Route pixel tools (pencil/eraser/dither/fill/line/rect/select) through the `PixelEditController`; apply `diffWrites(result)` through the **existing** `bufferToWrites`/`commitWrites` + cell-adoption + live-atlas + undo path. **Verify in running app: live-atlas edit, undo/redo, palette-line adoption, collision, repeat preview, transforms all unchanged.**

---

## Phase 5 — Shared tool-column UI

### Task 11: Extract shared controls
- [ ] Create `art-shared/{ToolButtonGrid,DitherConfig,ZoomControl,MirrorButton,TransformGrid}.tsx` (presentational, props-driven). Rewire `ToolColumn` (+ brush-space tabs + collision config) and `SpriteToolColumn` (+ pixel-perfect) to compose them. Typecheck + build + tests green.

---

## Self-review notes

- **Spec coverage:** Phase 1 = engine (§4), Phase 2 = viewport (§5), Phases 3–4 = hosts (§6), Phase 5 = shared UI (§6 tool-column). Testing (§7) covered by Phase 1 unit tests + Task 5 + host visual checks. Phasing (§8) = the five phases.
- **Autonomy boundary:** Phases 1–2 are fully verifiable without a running app (pure engine + additive component) and are done autonomously. Phases 3–5 change/verify live editing surfaces and are done WITH the user (visual verification), per the no-silent-regression rule.
