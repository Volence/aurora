# Collision Palette Redesign (kind tabs + preview + angle/solidity rendering) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the 83 collision shapes browsable and distinguishable. Today the palette draws only the floor heightmap, so full-block / wall / ceiling / loop pieces look identical and the angle is invisible. Fix the rendering (silhouette + **solid-side edges** + **angle needle**) and reorganize the palette into **Option 1**: a kind filter (Floor/Slope/Wall/Ceiling/Solid) + a big preview of the selected shape + a grid of the filtered shapes sorted by angle.

**Why:** Two full blocks that differ only in solidity ('all' vs 'top') and a near-flat angle render as the same green square. Drawing which sides are solid (orange) and the surface tilt (blue needle) is what tells them apart — verified with the user via rendered mockups.

**Scope:** PALETTE only. The map overlay already conveys solidity (fill color) + angle (surface line/ticks); leave it unchanged this pass to avoid regressions.

**Tech:** TypeScript, React 19, Zustand, Vitest (node env, no jsdom — pure core is unit-tested; canvas/React is GUI-verified). Gate: `npx tsc --noEmit && npm test && npm run build` green; raw-hex 0 (`canvas-colors.ts` is exempt).

**Types (existing, `src/core/collision/collision-model.ts`):**
`CollisionProfile { heights: Int8Array; angle: number; hasAngle: boolean; solidity: 'none'|'top'|'sides-bottom'|'all' }`,
`CollisionProfileSet { profiles: CollisionProfile[]; solidCount: number }`, `angleDegrees(p): number|null`.
`columnSolidRun(height): {y,h}|null` lives in `collision-render.ts`.

---

## Task A: profile classification (pure, TDD)

**Files:** Create `src/core/collision/collision-classify.ts`, `test/collision/classify.test.ts`.

```ts
import type { CollisionProfile } from './collision-model';
import { angleDegrees } from './collision-model';
export type CollisionKind = 'floor' | 'slope' | 'wall' | 'ceiling' | 'solid';
/** Tab order for the palette (does NOT include the 'all' pseudo-tab the UI adds). */
export const COLLISION_KINDS: CollisionKind[] = ['floor', 'slope', 'wall', 'ceiling', 'solid'];

/** Bucket a profile for browsing. Heuristic (not engine truth): by surface angle,
 *  with flat shapes split into 'solid' (collide every side) vs 'floor' (top/one-way). */
export function classifyProfile(p: CollisionProfile): CollisionKind {
  const deg = angleDegrees(p); // null when !hasAngle
  if (deg === null || deg <= 8 || deg >= 352) return p.solidity === 'all' ? 'solid' : 'floor';
  if (deg < 80 || deg > 280) return 'slope';
  if (deg <= 100 || deg >= 260) return 'wall';
  return 'ceiling';
}
```

- [ ] Test the bands: deg 0/360 & 'all' → 'solid'; deg 0 & 'top' → 'floor'; 45 → 'slope'; 300 → 'slope'; 90 → 'wall'; 270 → 'wall'; 135 → 'ceiling'; 200 → 'ceiling'; `!hasAngle` → flat path. Build a tiny profile factory `mk(deg, solidity, hasAngle=true)` (angle = round(deg/360*256)).
- [ ] Implement, run, commit `feat(collision): classifyProfile + COLLISION_KINDS`.

## Task B: shape rendering (pure helpers TDD + thin ctx draw)

**Files:** Create `src/core/collision/collision-shape-draw.ts`, `test/collision/shape-draw.test.ts`.

Pure, tested helpers:
```ts
export type Edge = 'top' | 'right' | 'bottom' | 'left';
/** Which cell edges the player collides with, for the orange outline. */
export function solidEdges(solidity: Solidity): Edge[] {
  switch (solidity) {
    case 'top': return ['top'];
    case 'sides-bottom': return ['left', 'right', 'bottom'];
    case 'all': return ['top', 'right', 'bottom', 'left'];
    default: return [];
  }
}
/** Endpoints of the angle "needle" (a spirit-level line) centred at (cx,cy), half-length L.
 *  deg measured CCW, screen-y down. deg 0 → horizontal; 90 → vertical. */
export function needleEndpoints(deg: number, cx: number, cy: number, L: number) {
  const r = (deg * Math.PI) / 180, dx = Math.cos(r) * L, dy = -Math.sin(r) * L;
  return { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy };
}
```
Thin ctx wrapper (NOT unit-tested — GUI-verified):
```ts
export interface ShapeDrawOpts { fill: string; line: string; solidEdge: string; needle: string;
  showSolidEdges?: boolean; showNeedle?: boolean; }
/** Draw silhouette (via columnSolidRun) + solid-side edges + angle needle into a size×size box at (x,y). */
export function drawCollisionShape(ctx, x, y, size, profile, opts): void { /* uses columnSolidRun, solidEdges, needleEndpoints, angleDegrees */ }
```

- [ ] Test `solidEdges` (4 cases) and `needleEndpoints` (deg 0 → y1≈y2 horizontal; deg 90 → x1≈x2 vertical; deg 180 → horizontal; point symmetry about (cx,cy)). Use `toBeCloseTo`.
- [ ] Implement, run, commit `feat(collision): drawCollisionShape (silhouette + solid edges + angle needle)`.

## Task C: CollisionPalette → Option 1 (integration)

**Files:** Modify `src/renderer/components/CollisionPalette.tsx`; add colors to `src/renderer/canvas/canvas-colors.ts`.

- Keep the existing **Plane A/B** and **Brush** rows and the **∅ erase** option and `selectedCollisionProfile` selection.
- Add `canvas-colors.ts` (rgba, exempt): `COLLISION_SHAPE_FILL`, `COLLISION_SHAPE_LINE`, `COLLISION_SOLID_EDGE` (orange), `COLLISION_ANGLE_NEEDLE` (blue).
- Local `useState` `kind: 'all' | CollisionKind` (default 'all'). Render a tab row: `All` + `COLLISION_KINDS`.
- Visible indices = `[1..solidCount)` filtered by `kind==='all' || classifyProfile(profiles[i])===kind`, sorted by `angleDegrees ?? -1`.
- **Big preview**: a `<canvas>` (~120px) drawing the selected profile via `drawCollisionShape` (solid edges + needle on), with text `#i · {kind} · {angle}° · solid: {solidity}`. When ∅/air selected, show "Erase (air)".
- **Grid**: filtered thumbnails (~28px) via `drawCollisionShape`, each with a small angle label, click → `set(i)`, selected outlined. Keep ∅ as the first cell.
- Verify gate + raw-hex 0. Commit `feat(collision): palette kind tabs + shape preview (Option 1)`.

## Review
- Adversarial correctness review + superpowers:code-reviewer. Controller folds fixes, commits.

## Manual verification (user)
Open Collision tool → kind tabs (All/Floor/Slope/Wall/Ceiling/Solid). Pick **Wall** or **Ceiling** → the steep/loop pieces appear (no longer hidden). Selected shape shows big with the orange solid-sides + blue angle needle + the angle number. Plane A/B, Brush, and ∅ erase still work; painting unaffected.
