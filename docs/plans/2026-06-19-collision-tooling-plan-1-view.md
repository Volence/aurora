# Collision Tooling — Phase 1 (Accurate View) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the engine's *real* collision (height profiles + angle + solidity) accurately on the map, read-only, behind an engine-agnostic model — so you can finally SEE true collision instead of a flat nibble color.

**Architecture:** A pure, engine-agnostic decode layer (`src/core/collision/`): a `CollisionProfile`/`CollisionProfileSet` view model, a `CollisionAdapter` interface with an `s4` implementation that decodes the four `data/collision/*.bin` tables, and a pure silhouette-geometry helper. A renderer-side loader reads the tables into `projectStore.collisionProfiles`; `OverlayRenderer` draws the real surface; `MapViewport`'s hover bar gains a collision readout. See `docs/specs/2026-06-19-collision-tooling-design.md` (Phase 1 = §3-§7, §11).

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (node env), HTML canvas 2D.

---

## Design notes locked from the spec + verification

- Collision is engine-meaningful per **16px cell** (2×2 tiles). The section `collision: Uint8Array` is per-8px-tile; both tiles of a cell carry the same attr byte (engine-baker invariant), so we sample the cell's **top-left tile**: `collision[(cellRow*2)*256 + (cellCol*2)]`.
- Height byte decode = signed-byte sign extension (the engine's `ext.w`): `b < 0x80 ? b : b - 256` (Int8 cast). Conformant bytes are 0..16 (solid up from bottom) and 0xF0..0xFF (= -16..-1, hangs down from top).
- Angle = raw 256-unit byte; **odd byte = "no usable angle"** flag, decoded in the s4 adapter into `hasAngle` (the odd-flag never leaks past the adapter).
- Solidity 0/1/2/3 = `'none'/'top'/'sides-bottom'/'all'` (s4 `SOL_NONE/TOP/LRB/ALL`).
- The model is the **decoded view form**, not the authoring form — no `bake_cell` inverse here.
- `canvas-colors.ts` is exempt from the raw-hex guardrail, so collision colors (rgba) live there.

## File Structure

- **Create** `src/core/collision/collision-model.ts` — `Solidity`, `CollisionProfile`, `CollisionProfileSet`, `angleDegrees`, `isAir`, `isKnownProfile`.
- **Create** `src/core/collision/collision-adapter.ts` — `CollisionTables`, `CollisionAdapter` interfaces.
- **Create** `src/core/collision/adapters/s4-collision-adapter.ts` — the `s4` decoder.
- **Create** `src/core/collision/collision-render.ts` — pure `columnSolidRun` + `heightSparkline`.
- **Create** `test/collision/collision-model.test.ts`, `test/collision/s4-collision-adapter.test.ts`, `test/collision/collision-render.test.ts`.
- **Create** `src/renderer/hooks/load-collision.ts` — reads the four `.bin`s → `CollisionProfileSet | null`.
- **Modify** `src/core/config/s4-config.ts` — optional `collisionDataPath` on `S4ProjectConfig`.
- **Modify** `src/renderer/state/projectStore.ts` — `collisionProfiles` state + setter + reset.
- **Modify** `src/renderer/hooks/useProject.ts` — load tables after `setProject`.
- **Modify** `src/renderer/state/viewStore.ts` — `showCollisionAngles` overlay flag.
- **Modify** `src/renderer/canvas/canvas-colors.ts` — solidity-class + unknown + surface tokens.
- **Modify** `src/renderer/canvas/OverlayRenderer.ts` — thread profiles; render real surfaces.
- **Modify** `src/renderer/components/MapViewport.tsx` — thread profiles at both render call sites; hover collision readout.

Verification gate for every task: `npx tsc --noEmit && npm test && npm run build` all green; raw-hex guardrail stays at 0.

---

## Task A: Collision view model

**Files:**
- Create: `src/core/collision/collision-model.ts`
- Test: `test/collision/collision-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/collision/collision-model.test.ts
import { describe, it, expect } from 'vitest';
import { angleDegrees, isAir, isKnownProfile, type CollisionProfile, type CollisionProfileSet } from '../../src/core/collision/collision-model';

const profile = (over: Partial<CollisionProfile> = {}): CollisionProfile => ({
  heights: new Int8Array(16), angle: 0, hasAngle: true, solidity: 'all', ...over,
});
const set = (n: number): CollisionProfileSet => ({
  profiles: Array.from({ length: n }, () => profile()), engine: 's4',
});

describe('angleDegrees', () => {
  it('returns null when the angle is unusable', () => {
    expect(angleDegrees(profile({ hasAngle: false, angle: 64 }))).toBeNull();
  });
  it('converts a 256-unit angle to degrees', () => {
    expect(angleDegrees(profile({ hasAngle: true, angle: 0 }))).toBe(0);
    expect(angleDegrees(profile({ hasAngle: true, angle: 64 }))).toBe(90);   // quarter turn
    expect(angleDegrees(profile({ hasAngle: true, angle: 128 }))).toBe(180);
  });
});

describe('isAir / isKnownProfile', () => {
  it('treats index 0 as air, never a known profile', () => {
    const s = set(4);
    expect(isAir(s, 0)).toBe(true);
    expect(isKnownProfile(s, 0)).toBe(false);
  });
  it('in-range nonzero index is a known profile, not air', () => {
    const s = set(4);
    expect(isAir(s, 2)).toBe(false);
    expect(isKnownProfile(s, 2)).toBe(true);
  });
  it('out-of-range index is neither air nor known (the "unknown" case)', () => {
    const s = set(4);
    expect(isAir(s, 9)).toBe(false);
    expect(isKnownProfile(s, 9)).toBe(false);
  });
  it('null set: nothing is known', () => {
    expect(isKnownProfile(null, 1)).toBe(false);
    expect(isAir(null, 0)).toBe(true); // 0 is always air regardless of set
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/collision/collision-model.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/core/collision/collision-model.ts

/** Canonical solidity class — which sensor directions a cell stops. Adapters
 *  decode their game's encoding INTO this; it is not any one game's byte layout. */
export type Solidity = 'none' | 'top' | 'sides-bottom' | 'all';

/** One decoded collision shape (the VIEW form, not the authoring form). */
export interface CollisionProfile {
  /** 16 signed height bytes, one per px-column of a 16px cell. >0 solid up from
   *  the bottom; <0 solid hanging down from the top (depth = -value); 0 empty. */
  heights: Int8Array;
  /** Surface angle in 256-units (0 = flat). Pair with hasAngle. */
  angle: number;
  /** Whether the angle is usable (s4's "odd byte = no angle" flag, decoded by the adapter). */
  hasAngle: boolean;
  solidity: Solidity;
}

/** The decoded set a level indexes into; index 0 is reserved for air. */
export interface CollisionProfileSet {
  profiles: CollisionProfile[];
  engine: string;
}

/** Angle in degrees for display, or null when unusable. 256 units = 360°. */
export function angleDegrees(p: CollisionProfile): number | null {
  if (!p.hasAngle) return null;
  return Math.round((p.angle / 256) * 360);
}

/** Index 0 is always air (independent of the set). */
export function isAir(_set: CollisionProfileSet | null, index: number): boolean {
  return index === 0;
}

/** True when index is a real, in-range solid profile (not air, not out of range). */
export function isKnownProfile(set: CollisionProfileSet | null, index: number): boolean {
  return set !== null && index > 0 && index < set.profiles.length;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/collision/collision-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collision/collision-model.ts test/collision/collision-model.test.ts
git commit -m "feat(collision): engine-agnostic collision view model + helpers"
```

---

## Task B: s4 collision adapter

**Files:**
- Create: `src/core/collision/collision-adapter.ts`
- Create: `src/core/collision/adapters/s4-collision-adapter.ts`
- Test: `test/collision/s4-collision-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/collision/s4-collision-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { s4CollisionAdapter } from '../../src/core/collision/adapters/s4-collision-adapter';
import type { CollisionTables } from '../../src/core/collision/collision-adapter';

function tables(): CollisionTables {
  const heightmaps = new Uint8Array(256 * 16);
  const angles = new Uint8Array(256);
  const solidity = new Uint8Array(256);
  // profile 1 = full block (sixteen 0x10), solidity 'all', angle 0 (usable)
  for (let c = 0; c < 16; c++) heightmaps[1 * 16 + c] = 0x10;
  solidity[1] = 3; angles[1] = 0;
  // profile 2 = hanging ceiling (0xF0 = -16), solidity 'sides-bottom', angle 64
  for (let c = 0; c < 16; c++) heightmaps[2 * 16 + c] = 0xF0;
  solidity[2] = 2; angles[2] = 64;
  // profile 3 = a malformed/odd byte 0x40 (signed +64) + odd angle (no-angle), solidity 'top'
  heightmaps[3 * 16 + 0] = 0x40; heightmaps[3 * 16 + 1] = 0xFF; // +64 and -1
  solidity[3] = 1; angles[3] = 7; // odd → no angle
  return { heightmaps, angles, solidity };
}

describe('s4CollisionAdapter.decodeProfiles', () => {
  const set = s4CollisionAdapter.decodeProfiles(tables());

  it('produces 256 profiles with engine id s4', () => {
    expect(set.engine).toBe('s4');
    expect(set.profiles).toHaveLength(256);
  });
  it('decodes a full block (0x10 -> +16, solidity all, angle usable)', () => {
    const p = set.profiles[1];
    expect(Array.from(p.heights)).toEqual(new Array(16).fill(16));
    expect(p.solidity).toBe('all');
    expect(p.hasAngle).toBe(true);
    expect(p.angle).toBe(0);
  });
  it('decodes a hanging ceiling (0xF0 -> -16, sides-bottom)', () => {
    const p = set.profiles[2];
    expect(p.heights[0]).toBe(-16);
    expect(p.solidity).toBe('sides-bottom');
  });
  it('sign-extends like ext.w (0x40 -> +64, 0xFF -> -1) and reads the odd-angle flag', () => {
    const p = set.profiles[3];
    expect(p.heights[0]).toBe(64);   // 0x40 stays positive (NOT -192)
    expect(p.heights[1]).toBe(-1);   // 0xFF -> -1
    expect(p.solidity).toBe('top');
    expect(p.hasAngle).toBe(false);  // angle 7 is odd
  });
  it('profile 0 is air (all-zero heights, solidity none)', () => {
    expect(Array.from(set.profiles[0].heights)).toEqual(new Array(16).fill(0));
    expect(set.profiles[0].solidity).toBe('none');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/collision/s4-collision-adapter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the interface + adapter**

```ts
// src/core/collision/collision-adapter.ts
import type { CollisionProfileSet } from './collision-model';

/** Raw per-game collision tables, already read from disk. */
export interface CollisionTables {
  heightmaps: Uint8Array;     // 256*16 raw bytes
  heightmapsRot?: Uint8Array; // optional (derivable; unused in Phase 1)
  angles: Uint8Array;         // 256
  solidity: Uint8Array;       // 256
}

/** Decodes one game's collision tables into the engine-agnostic view model. */
export interface CollisionAdapter {
  readonly id: string;
  decodeProfiles(tables: CollisionTables): CollisionProfileSet;
}
```

```ts
// src/core/collision/adapters/s4-collision-adapter.ts
import type { CollisionAdapter, CollisionTables } from '../collision-adapter';
import type { CollisionProfile, CollisionProfileSet, Solidity } from '../collision-model';

const SOLIDITY: Solidity[] = ['none', 'top', 'sides-bottom', 'all'];

/** Sign-extend a byte the way the 68k `ext.w` does (Int8): 0x00..0x7F stay
 *  positive, 0x80..0xFF become negative. Conformant s4 height bytes are only
 *  0..16 and 0xF0..0xFF, but matching ext.w keeps malformed bytes engine-faithful. */
function signed(b: number): number {
  return (b << 24) >> 24;
}

/** s4_engine collision: the four global tables baked by collision_pipeline.py. */
export const s4CollisionAdapter: CollisionAdapter = {
  id: 's4',
  decodeProfiles(tables: CollisionTables): CollisionProfileSet {
    const profiles: CollisionProfile[] = [];
    for (let i = 0; i < 256; i++) {
      const heights = new Int8Array(16);
      for (let c = 0; c < 16; c++) heights[c] = signed(tables.heightmaps[i * 16 + c] ?? 0);
      const angle = tables.angles[i] ?? 0;
      profiles.push({
        heights,
        angle,
        hasAngle: (angle & 1) === 0,            // s4 odd-flag, decoded here only
        solidity: SOLIDITY[(tables.solidity[i] ?? 0) & 0x3],
      });
    }
    return { profiles, engine: 's4' };
  },
};
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/collision/s4-collision-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collision/collision-adapter.ts src/core/collision/adapters/s4-collision-adapter.ts test/collision/s4-collision-adapter.test.ts
git commit -m "feat(collision): s4 adapter — decode heightmaps/angles/solidity tables"
```

---

## Task C: Silhouette geometry + sparkline (pure)

**Files:**
- Create: `src/core/collision/collision-render.ts`
- Test: `test/collision/collision-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/collision/collision-render.test.ts
import { describe, it, expect } from 'vitest';
import { columnSolidRun, heightSparkline } from '../../src/core/collision/collision-render';

describe('columnSolidRun', () => {
  it('positive height fills up from the cell bottom', () => {
    expect(columnSolidRun(16)).toEqual({ y: 0, h: 16 });   // full
    expect(columnSolidRun(4)).toEqual({ y: 12, h: 4 });    // 4px from the bottom
  });
  it('negative height hangs down from the cell top', () => {
    expect(columnSolidRun(-16)).toEqual({ y: 0, h: 16 });  // full ceiling
    expect(columnSolidRun(-4)).toEqual({ y: 0, h: 4 });    // 4px from the top
  });
  it('zero height is empty', () => {
    expect(columnSolidRun(0)).toBeNull();
  });
});

describe('heightSparkline', () => {
  it('renders a 16-char bar with a level per column', () => {
    const s = heightSparkline(new Int8Array([0, 4, 8, 12, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(s).toHaveLength(16);
    expect(s[0]).toBe(' ');     // empty column
    expect(s[4]).toBe('█');     // full
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/collision/collision-render.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/core/collision/collision-render.ts

/** The solid run of one 16px-cell column, in cell-local pixels (y from the top,
 *  0..16). null when the column is empty. h>0: solid `h` px up from the bottom
 *  → y = 16 - h. h<0: solid `-h` px down from the top → y = 0. */
export function columnSolidRun(height: number): { y: number; h: number } | null {
  if (height > 0) return { y: 16 - height, h: height };
  if (height < 0) return { y: 0, h: -height };
  return null;
}

const BARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** A 16-char unicode sparkline of a height profile (|height| 0..16 → 0..8 bar). */
export function heightSparkline(heights: Int8Array): string {
  let out = '';
  for (let c = 0; c < 16; c++) {
    const mag = Math.min(16, Math.abs(heights[c] ?? 0));
    out += BARS[Math.round((mag / 16) * 8)];
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/collision/collision-render.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/collision/collision-render.ts test/collision/collision-render.test.ts
git commit -m "feat(collision): pure silhouette-column + sparkline helpers"
```

---

## Task D: Load tables → config + store + loader

**Files:**
- Modify: `src/core/config/s4-config.ts:22-28`
- Modify: `src/renderer/state/projectStore.ts`
- Create: `src/renderer/hooks/load-collision.ts`
- Modify: `src/renderer/hooks/useProject.ts:77`

- [ ] **Step 1: Add the optional config field** (`s4-config.ts`, in `S4ProjectConfig`)

```ts
export interface S4ProjectConfig {
  name: string;
  engine: string;
  zones: S4ZoneConfig[];
  objectLibrary: string;
  chunkLibrary: string;
  /** Optional path (relative to the project) to the engine's collision tables
   *  dir. Defaults to 'data/collision/' when absent. */
  collisionDataPath?: string;
}
```

(No change to `loadS4Config` — the field is optional and read off `config.raw` at load.)

- [ ] **Step 2: Add `collisionProfiles` to projectStore**

In `src/renderer/state/projectStore.ts`: import the type, add the state field, setter, and clear it in `reset`.

```ts
import type { CollisionProfileSet } from '../../core/collision/collision-model';
```
In the `ProjectState` interface (near `objectSprites`):
```ts
  collisionProfiles: CollisionProfileSet | null;
  setCollisionProfiles: (profiles: CollisionProfileSet | null) => void;
```
In the store object (near `objectSprites: new Map()` default and `setObjectSprites`):
```ts
  collisionProfiles: null,
  setCollisionProfiles: (collisionProfiles) => set({ collisionProfiles }),
```
In `reset` (add `collisionProfiles: null` to the `set({...})`):
```ts
  reset: () => set({ config: null, project: null, currentZoneId: null, currentActId: null, loading: false, error: null, objectSprites: new Map(), collisionProfiles: null }),
```

- [ ] **Step 3: Create the loader**

```ts
// src/renderer/hooks/load-collision.ts
import { s4CollisionAdapter } from '../../core/collision/adapters/s4-collision-adapter';
import type { CollisionProfileSet } from '../../core/collision/collision-model';

async function readBin(basePath: string, rel: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(basePath, rel));
}

/**
 * Load the engine's four collision tables from `basePath/relDir` and decode them
 * via the s4 adapter. Returns null on any missing/unreadable table so the overlay
 * degrades gracefully (the view falls back to flat cell fills) rather than crashing.
 */
export async function loadCollisionProfiles(basePath: string, relDir: string): Promise<CollisionProfileSet | null> {
  const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
  try {
    const [heightmaps, angles, solidity] = await Promise.all([
      readBin(basePath, `${dir}heightmaps.bin`),
      readBin(basePath, `${dir}angles.bin`),
      readBin(basePath, `${dir}solidity.bin`),
    ]);
    return s4CollisionAdapter.decodeProfiles({ heightmaps, angles, solidity });
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Wire it into the load flow** (`useProject.ts`, in `loadFromPath`, right after `setProject(project);` at line 77)

```ts
      setProject(project);

      // Load the engine's collision tables (read-only view). Missing/unreadable
      // tables → null → the overlay falls back to flat fills (no crash).
      const collPath = config.raw.collisionDataPath ?? 'data/collision/';
      const collisionProfiles = await loadCollisionProfiles(config.basePath, collPath);
      useProjectStore.getState().setCollisionProfiles(collisionProfiles);
```

Add the import near the top of `useProject.ts` (with the other hook/helper imports):
```ts
import { loadCollisionProfiles } from './load-collision';
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/core/config/s4-config.ts src/renderer/state/projectStore.ts src/renderer/hooks/load-collision.ts src/renderer/hooks/useProject.ts
git commit -m "feat(collision): load engine collision tables into projectStore on open"
```

---

## Task E: Real-surface map overlay

**Files:**
- Modify: `src/renderer/state/viewStore.ts:3-11,31-39`
- Modify: `src/renderer/canvas/canvas-colors.ts`
- Modify: `src/renderer/canvas/OverlayRenderer.ts:19-45,129-159`
- Modify: `src/renderer/components/MapViewport.tsx:233,273,235`

- [ ] **Step 1: Add the angle sub-toggle** (`viewStore.ts`)

In `OverlayOptions` add `showCollisionAngles: boolean;` (after `showCollision`). In the `overlays` default object add `showCollisionAngles: false,` (after `showCollision: false,`).

- [ ] **Step 2: Add collision color tokens** (`canvas-colors.ts` — exempt from the raw-hex guardrail)

Add near the existing `COLLISION_PALETTE`/`COLLISION_OOB`:
```ts
/** Real-collision overlay fills, by solidity class (translucent so art shows). */
export const COLLISION_FILL_ALL = 'rgba(80,200,120,0.42)';        // full solid — green
export const COLLISION_FILL_TOP = 'rgba(240,200,70,0.42)';        // jump-through top — amber
export const COLLISION_FILL_SIDES = 'rgba(90,150,240,0.42)';      // walls/ceiling — blue
export const COLLISION_FILL_NONE = 'rgba(160,160,170,0.25)';      // no-solidity shape — faint gray
export const COLLISION_SURFACE_LINE = 'rgba(255,255,255,0.85)';   // crisp top-of-surface stroke
export const COLLISION_ANGLE_TICK = 'rgba(255,80,80,0.9)';        // angle indicator
export const COLLISION_UNKNOWN = 'rgba(255,0,255,0.5)';           // out-of-range attr index
export const COLLISION_FALLBACK = 'rgba(120,160,220,0.35)';       // flat fill when no tables
```

- [ ] **Step 3: Rewrite the overlay** (`OverlayRenderer.ts`)

Update imports (line 5-8) to add the new tokens + the model/render helpers:
```ts
import {
  GRID_TILE, GRID_BLOCK, GRID_SECTION,
  COLLISION_FILL_ALL, COLLISION_FILL_TOP, COLLISION_FILL_SIDES, COLLISION_FILL_NONE,
  COLLISION_SURFACE_LINE, COLLISION_ANGLE_TICK, COLLISION_UNKNOWN, COLLISION_FALLBACK,
  OBJECT_BOX_FILL, OBJECT_BOX_STROKE, OBJECT_LABEL, RING_FILL, RING_STROKE,
} from './canvas-colors';
import type { CollisionProfileSet, Solidity } from '../../core/collision/collision-model';
import { columnSolidRun } from '../../core/collision/collision-render';
```
(Drop the now-unused `COLLISION_OOB`/`COLLISION_PALETTE` from the import.)

Change `render(...)` to accept profiles (append param) and pass them + the angle flag to the overlay call:
```ts
  render(
    ctx: Ctx,
    sections: SectionOverlayInfo[],
    options: OverlayOptions,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    objectSprites?: Map<string, ObjectPreview>,
    collisionProfiles?: CollisionProfileSet | null,
  ): void {
```
Inside the `for (const info of sections)` loop, replace the `showCollision` call:
```ts
      if (options.showCollision) {
        this.drawCollisionOverlay(ctx, viewport, info.section.tileGrid.collision, info.offsetX, info.offsetY, collisionProfiles ?? null, options.showCollisionAngles);
      }
```

Replace the whole `drawCollisionOverlay` method (lines 129-159) with the real-surface renderer:
```ts
  drawCollisionOverlay(
    ctx: Ctx,
    viewport: { x: number; y: number; width: number; height: number; zoom: number },
    collision: Uint8Array,
    offsetX: number,
    offsetY: number,
    profiles: CollisionProfileSet | null,
    showAngles: boolean,
  ): void {
    const { x: vpX, y: vpY, width, height, zoom } = viewport;
    const vpW = width / zoom, vpH = height / zoom;
    const localVpX = vpX - offsetX, localVpY = vpY - offsetY;
    // 16px cells = 128×128 per section (256 tiles / 2). Keep W/H distinct so both
    // SECTION_TILES_WIDE and SECTION_TILES_HIGH stay used (no unused-import error).
    const cellsW = SECTION_TILES_WIDE / 2, cellsH = SECTION_TILES_HIGH / 2;
    const startCol = Math.max(0, Math.floor(localVpX / 16));
    const startRow = Math.max(0, Math.floor(localVpY / 16));
    const endCol = Math.min(cellsW, Math.ceil((localVpX + vpW) / 16));
    const endRow = Math.min(cellsH, Math.ceil((localVpY + vpH) / 16));

    for (let cr = startRow; cr < endRow; cr++) {
      for (let cc = startCol; cc < endCol; cc++) {
        // Sample the cell's top-left tile (both tiles of a cell share the byte).
        const index = collision[(cr * 2) * SECTION_TILES_WIDE + (cc * 2)];
        if (index === 0) continue; // air

        const cx = cc * 16 + offsetX, cy = cr * 16 + offsetY;

        if (!profiles) { // no tables: flat fallback fill
          ctx.fillStyle = COLLISION_FALLBACK;
          ctx.fillRect(cx, cy, 16, 16);
          continue;
        }
        if (index >= profiles.profiles.length) { // unknown / stale index
          ctx.fillStyle = COLLISION_UNKNOWN;
          ctx.fillRect(cx, cy, 16, 16);
          continue;
        }

        const p = profiles.profiles[index];
        ctx.fillStyle = solidityFill(p.solidity);
        // Per-column silhouette + crisp top-surface line.
        ctx.beginPath();
        for (let c = 0; c < 16; c++) {
          const run = columnSolidRun(p.heights[c]);
          if (!run) continue;
          ctx.fillRect(cx + c, cy + run.y, 1, run.h);
        }
        ctx.strokeStyle = COLLISION_SURFACE_LINE;
        ctx.lineWidth = 1 / zoom;
        for (let c = 0; c < 16; c++) {
          const run = columnSolidRun(p.heights[c]);
          if (!run) continue;
          ctx.beginPath();
          ctx.moveTo(cx + c, cy + run.y);
          ctx.lineTo(cx + c + 1, cy + run.y);
          ctx.stroke();
        }
        if (showAngles && p.hasAngle) {
          const a = (p.angle / 256) * Math.PI * 2;
          const mx = cx + 8, my = cy + 8, len = 6;
          ctx.strokeStyle = COLLISION_ANGLE_TICK;
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          ctx.moveTo(mx - Math.cos(a) * len, my + Math.sin(a) * len);
          ctx.lineTo(mx + Math.cos(a) * len, my - Math.sin(a) * len);
          ctx.stroke();
        }
      }
    }
  }
```
Add this small helper as a private method or module function in the same file (e.g. just above the class):
```ts
function solidityFill(s: Solidity): string {
  switch (s) {
    case 'all': return COLLISION_FILL_ALL;
    case 'top': return COLLISION_FILL_TOP;
    case 'sides-bottom': return COLLISION_FILL_SIDES;
    default: return COLLISION_FILL_NONE;
  }
}
```

- [ ] **Step 4: Thread profiles from MapViewport** (`MapViewport.tsx`)

Add a store subscription near the other `useProjectStore` selectors at the top of the component:
```ts
  const collisionProfiles = useProjectStore((s) => s.collisionProfiles);
```
Main render effect — update the `render` call (line 233) to pass profiles:
```ts
      overlayRenderer.render(ctx, sectionInfos, overlays, viewport, useProjectStore.getState().objectSprites, useProjectStore.getState().collisionProfiles);
```
…and add `collisionProfiles` to that effect's dependency array (line 235), so the overlay repaints once the tables finish loading.

ResizeObserver effect — update the `render` call (line 273):
```ts
        overlayRenderer.render(ctx, sectionInfos, overlays, viewport, undefined, useProjectStore.getState().collisionProfiles);
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; raw-hex guardrail stays 0 (new colors are in the exempt `canvas-colors.ts`; `OverlayRenderer` uses the tokens + `rgba(...)`/template strings only).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/viewStore.ts src/renderer/canvas/canvas-colors.ts src/renderer/canvas/OverlayRenderer.ts src/renderer/components/MapViewport.tsx
git commit -m "feat(collision): render real collision surfaces on the map overlay"
```

---

## Task F: Hover inspector

**Files:**
- Modify: `src/renderer/components/MapViewport.tsx:800-807`

- [ ] **Step 1: Add a collision readout to the hover bar**

In the hover handler's else-branch (the `worldToSectionTile` path, lines 800-807), when `showCollision` is on, append a collision readout. Replace the `if (info) { ... }` body:

```ts
      const info = worldToSectionTile(world.x, world.y);
      if (info) {
        let extra = '';
        const overlays = useViewStore.getState().overlays;
        if (overlays.showCollision) {
          const act = getCurrentAct(useProjectStore.getState());
          const section = act?.sections[info.sectionIndex] ?? null;
          if (section) {
            // Snap to the 16px cell's top-left tile (both tiles share the byte).
            const cellCol = Math.floor(info.col / 2) * 2;
            const cellRow = Math.floor(info.row / 2) * 2;
            const index = section.tileGrid.collision[cellRow * SECTION_TILES_WIDE + cellCol];
            const profiles = useProjectStore.getState().collisionProfiles;
            if (index === 0) {
              extra = ' | Coll: air';
            } else if (profiles && index < profiles.profiles.length) {
              const p = profiles.profiles[index];
              const deg = angleDegrees(p);
              extra = ` | Coll #${index} ${p.solidity} ${deg === null ? '—' : deg + '°'} ${heightSparkline(p.heights)}`;
            } else {
              extra = ` | Coll #${index} (unknown)`;
            }
          }
        }
        bar.innerHTML = `Sec ${info.sectionIndex} | Tile (${info.col}, ${info.row}) | Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}${extra}`;
      } else {
        bar.innerHTML = `Pos ${Math.floor(world.x)}, ${Math.floor(world.y)}`;
      }
```

Add imports at the top of `MapViewport.tsx` (with the other core imports):
```ts
import { angleDegrees } from '../../core/collision/collision-model';
import { heightSparkline } from '../../core/collision/collision-render';
```
(`getCurrentAct`, `useViewStore`, `useProjectStore`, and `SECTION_TILES_WIDE` are already imported in this file — confirm before adding; do not duplicate.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/MapViewport.tsx
git commit -m "feat(collision): hover readout — attr index, solidity, angle, profile sparkline"
```

---

## Self-review checklist (after all tasks)

- **Spec coverage:** §3 model + adapter (A, B) ✓; §4 table load + config + default `data/collision/` + null fallback (D) ✓; §5 overlay real surfaces + solidity color + top line + angle ticks + unknown marker + both render call sites threaded + deps (E) ✓; §6 hover inspector with attr/solidity/angle/sparkline (F) ✓; §7 fallback flat fill (E) + out-of-range marker (E) ✓.
- **Type consistency:** `CollisionProfile`/`CollisionProfileSet`/`Solidity` used identically across A→F; `columnSolidRun`/`heightSparkline`/`angleDegrees`/`s4CollisionAdapter` signatures match call sites.
- **Engine faithfulness:** height decode is the Int8 sign-extension (`(b<<24)>>24`), not a >16 threshold; odd-angle flag decoded in the adapter; 16px-cell sampling at the top-left tile.
- **Guardrail:** all overlay colors are tokens in the exempt `canvas-colors.ts`; no raw hex in renderer code.

## Manual verification (with user)

Open the OJZ project → toggle the collision overlay: real slopes/curves/surfaces appear, colored by solidity (no magenta blocks); hanging/ceiling cells fill from the top; enable the angle sub-toggle → ticks point along surfaces. Hover a sloped cell → correct attr #, solidity, angle°, sparkline. Point `collisionDataPath` at a missing dir (or rename the tables) → reopen → flat fallback fills, no crash. A cell with an out-of-range index → magenta "unknown" marker.
