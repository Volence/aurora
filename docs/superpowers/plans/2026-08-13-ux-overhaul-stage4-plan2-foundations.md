# Stage 4 Plan 2 — Facet Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the three engine-neutral foundations the classic re-home needs — one open-project engine selector, a profile-declared art tier ladder, and a facet registry whose Canvas slot is keyed by engine — without changing a single pixel of behaviour.

**Architecture:** All three are additive and independently landable. `open-project.ts` replaces four ad-hoc "which engine is open" derivations that currently disagree. `CapabilityManifest.artTiers` is an **optional** field so no existing construction site breaks. `facetCanvases` is a second registry keyed `(engine, facetId)`; `mapFacet` takes its canvas as a parameter and `LevelWorkspace` resolves through the engine. Only aeon canvases are registered, so the app renders exactly as it does today.

**Tech Stack:** TypeScript, Zustand stores, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` §3 — **read §3.0 first**, which corrects four claims in the rest of §3.

**Worktree:** `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan2`, branch `feature/ux-stage4-plan2`.

**Baseline:** 170 test files / 1486 passed / 3 skipped / 0 failed, `npx tsc --noEmit` clean.

---

## Scope note — why this plan is only three of eight steps

A reconnaissance pass identified eight landable steps (A–H) for the classic re-home. This plan is **A, B and C only**: the pure foundations. They share three properties that make them safe to batch — no visible behaviour change, no component rewiring, and full node-side testability.

Everything else waits, for a reason recorded in spec §3.0.1: **the "shared" slot components are not shared.** All ~10 of them import aeon stores directly and several call `executeCommand`, which throws for a non-aeon document. Neutralising them (step F) is the long pole and must be sliced per-component against the interfaces this plan establishes.

Deliberately **not** in this plan: classic viewport state to stores (D), tool vocabulary merge (E), slot neutralisation (F), classic into the workspace (G), shared Art facet (H).

## Pre-flight: three facts established by recon

1. **Four engine derivations exist and two disagree.** `App.tsx` uses `config`; `tab-activation.ts` and `project-runtime.ts` use `project`; `Explorer.tsx` inlines a `classicOpen`/`config` branch. `config` and `project` differ **during aeon load**. Task 1 picks one deliberately.
2. **`CapabilityManifest` has 7 construction sites** (2 production, 5 fixtures) and **2 exact-equality assertions** (`core/project/__tests__/s1-adapter.test.ts`, `aeon/__tests__/aeon-adapter.test.ts`). A required field breaks all seven; an **optional** field breaks none but still trips the two equality assertions.
3. **`src/renderer/state/toolStore.ts` is dead code** kept alive by `test/renderer/tool-store.test.ts`. Do not build on it, do not extend it, do not delete it in this plan.

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/renderer/state/open-project.ts` | The ONE answer to "which engine is open, and what can it do". Selectors only, no state of its own. |
| `src/renderer/state/__tests__/open-project.test.ts` | |
| `src/core/project/__tests__/art-tiers.test.ts` | Contract test over both profiles' declared ladders. |
| `src/renderer/workspace/__tests__/facet-canvases.test.ts` | |

**Modify:**

| File | Change |
|---|---|
| `src/core/project/adapter.ts` | Add `ArtTier` interface and optional `CapabilityManifest.artTiers`. |
| `src/core/project/s1/index.ts` | Declare the classic ladder. |
| `src/core/project/aeon/index.ts` | Declare the aeon ladder. |
| `src/renderer/workspace/facet-registry.ts` | Add `facetCanvases` registry; `mapFacet` takes a Canvas parameter. |
| `src/renderer/workspace/register-facets.ts` | Register aeon canvases. |
| `src/renderer/workspace/LevelWorkspace.tsx` | Resolve Canvas via engine. |
| `src/renderer/App.tsx`, `src/renderer/shell/tab-activation.ts`, `src/renderer/shell/Explorer.tsx`, `src/renderer/state/project-runtime.ts` | Use the shared selector. |
| `src/core/project/__tests__/s1-adapter.test.ts`, `src/core/project/aeon/__tests__/aeon-adapter.test.ts` | Update the two manifest equality assertions. |

**Commands:** tests `npx vitest run <path>`, whole suite `npx vitest run`, types `npx tsc --noEmit`. Every Bash call must be prefixed with `cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan2 &&` (see "Worktree discipline" at the end).

---

### Task 1: The open-project engine selector

**Files:**
- Create: `src/renderer/state/open-project.ts`
- Test: `src/renderer/state/__tests__/open-project.test.ts`

**The decision this task makes:** `openEngine()` keys aeon off `useProjectStore.getState().project !== null`, **not** `config`. Rationale: `project` is the fully-loaded signal, and it is what the two safety-critical consumers (save routing, tab activation) already use. `config` can be set mid-load while `project` is still null.

**Consequence you must not paper over:** `App.tsx`'s command list enumerates zones from `config`, and its recents-fetch is gated on `engine === null`. Those are questions about *what data is loaded*, not *which engine is open*. Leave `config` reads in `buildCommands` alone — replace only the engine derivation itself.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/state/__tests__/open-project.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openEngine, openCapabilities, openArtTiers } from '../open-project';
import { useProjectStore } from '../projectStore';
import { useClassicProjectStore } from '../classicProjectStore';

function resetStores() {
  useClassicProjectStore.setState({ status: 'closed' } as never);
  useProjectStore.setState({ project: null, config: null, capabilities: null } as never);
}

describe('openEngine', () => {
  beforeEach(resetStores);

  it('is null when nothing is open', () => {
    expect(openEngine()).toBeNull();
  });

  it("is 's1' when the classic project is open", () => {
    useClassicProjectStore.setState({ status: 'open' } as never);
    expect(openEngine()).toBe('s1');
  });

  it("is 'aeon' when an aeon project is resident", () => {
    useProjectStore.setState({ project: {} } as never);
    expect(openEngine()).toBe('aeon');
  });

  it('prefers classic when both are somehow resident', () => {
    useClassicProjectStore.setState({ status: 'open' } as never);
    useProjectStore.setState({ project: {} } as never);
    expect(openEngine()).toBe('s1');
  });

  it('is null while an aeon project is mid-load (config set, project not)', () => {
    useProjectStore.setState({ config: { name: 'x' }, project: null } as never);
    expect(openEngine()).toBeNull();
  });
});

describe('openCapabilities / openArtTiers', () => {
  beforeEach(resetStores);

  it('returns empty facets when nothing is open', () => {
    expect(openCapabilities()?.facets ?? []).toEqual([]);
    expect(openArtTiers()).toEqual([]);
  });

  it('reads the aeon manifest when aeon is open', () => {
    useProjectStore.setState({
      project: {},
      capabilities: { facets: ['layout', 'art'], artTiers: [{ id: 'tile', label: 'Tile', pixelSize: 8, shared: true }] },
    } as never);
    expect(openCapabilities()?.facets).toEqual(['layout', 'art']);
    expect(openArtTiers().map((t) => t.id)).toEqual(['tile']);
  });

  it('reads the classic manifest when classic is open', () => {
    useClassicProjectStore.setState({
      status: 'open',
      capabilities: { facets: ['layout', 'art', 'objects'], artTiers: [] },
    } as never);
    expect(openCapabilities()?.facets).toEqual(['layout', 'art', 'objects']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/open-project.test.ts`
Expected: FAIL — `Failed to resolve import "../open-project"`.

- [ ] **Step 3: Implement the selectors**

Create `src/renderer/state/open-project.ts`:

```ts
// The ONE answer to "which engine is open, and what can it do".
//
// Four call sites used to derive this independently and TWO OF THEM DISAGREED:
// App keyed aeon off projectStore.config, while tab-activation and
// project-runtime keyed off projectStore.project. Those differ during an aeon
// load, so a mid-load render could route a save or a tab activation at the
// wrong engine. This module picks `project` — the fully-loaded signal, and the
// one the safety-critical consumers already used.
//
// A window holds exactly one project at a time. Classic wins the tie because a
// classic open leaves a previously-resident aeon project in the store (see
// project-runtime's saver ownership tests, which encode the same precedence).

import type { CapabilityManifest, ArtTier } from '../../core/project/adapter';
import { useProjectStore } from './projectStore';
import { useClassicProjectStore } from './classicProjectStore';

export type OpenEngine = 's1' | 'aeon';

/** Which engine's project is open, or null when none is. */
export function openEngine(): OpenEngine | null {
  if (useClassicProjectStore.getState().status === 'open') return 's1';
  if (useProjectStore.getState().project !== null) return 'aeon';
  return null;
}

/** The open project's capability manifest, or null when none is open. */
export function openCapabilities(): CapabilityManifest | null {
  const engine = openEngine();
  if (engine === 's1') return useClassicProjectStore.getState().capabilities ?? null;
  if (engine === 'aeon') return useProjectStore.getState().capabilities ?? null;
  return null;
}

/** The open profile's art tier ladder, outermost tier first. Empty when the
 *  profile declares none (the field is optional — see adapter.ts). */
export function openArtTiers(): readonly ArtTier[] {
  return openCapabilities()?.artTiers ?? [];
}

/** Hook forms. Subscribe to both stores so a project switch re-renders. */
export function useOpenEngine(): OpenEngine | null {
  const classicOpen = useClassicProjectStore((s) => s.status === 'open');
  const aeonResident = useProjectStore((s) => s.project !== null);
  if (classicOpen) return 's1';
  if (aeonResident) return 'aeon';
  return null;
}

export function useOpenCapabilities(): CapabilityManifest | null {
  const classicCaps = useClassicProjectStore((s) => s.capabilities);
  const aeonCaps = useProjectStore((s) => s.capabilities);
  const engine = useOpenEngine();
  if (engine === 's1') return classicCaps ?? null;
  if (engine === 'aeon') return aeonCaps ?? null;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/open-project.test.ts`
Expected: PASS, 8 tests.

Note `openArtTiers` will return `[]` for both profiles until Task 2 lands — that is what the first two assertions expect.

- [ ] **Step 5: Replace the four ad-hoc derivations**

Replace each with the shared selector. **Verify current line numbers before editing — another branch has been touching `App.tsx` and `Explorer.tsx`.**

- `src/renderer/App.tsx` — `const engine = classicOpen ? ('s1' as const) : config ? ('aeon' as const) : null;` becomes `const engine = useOpenEngine();`. **Leave every `config` read inside `buildCommands` alone** — those enumerate zone data, not engine identity.
- `src/renderer/shell/tab-activation.ts` — delete the module-private `currentEngine()` and import `openEngine` instead. It is a non-component call site, so use the plain function, not the hook.
- `src/renderer/shell/Explorer.tsx` — the inline `if (classicOpen) … else if (config) …` branch keeps its `config` read for zone lookup, but its engine test becomes `useOpenEngine()`.
- `src/renderer/state/project-runtime.ts` — the `classic-level` and `aeon-project` savers re-derive engine in both `isDirty` and `scope.owns`. Route all four through `openEngine()`. **Preserve the existing precedence** (a classic open means the resident aeon project is not the save target) — `openEngine()` already encodes it.

- [ ] **Step 6: Verify nothing regressed**

Run: `npx tsc --noEmit` — expect clean.
Run: `npx vitest run` — expect **0 failed**, count unchanged apart from the 8 new tests.

Pay attention to `project-runtime`'s saver-ownership tests and `tab-activation`'s tests; if either changes behaviour, the precedence was not preserved.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/open-project.ts src/renderer/state/__tests__/open-project.test.ts \
        src/renderer/App.tsx src/renderer/shell/tab-activation.ts \
        src/renderer/shell/Explorer.tsx src/renderer/state/project-runtime.ts
git commit -m "feat(shell): one open-project engine selector replaces four derivations"
```

---

### Task 2: Profile-declared art tier ladder

**Files:**
- Modify: `src/core/project/adapter.ts`, `src/core/project/s1/index.ts`, `src/core/project/aeon/index.ts`
- Modify: `src/core/project/__tests__/s1-adapter.test.ts`, `src/core/project/aeon/__tests__/aeon-adapter.test.ts`
- Test: `src/core/project/__tests__/art-tiers.test.ts`

**Read spec §3.0.2 before starting.** The flag is `shared`, **not** `pooled`. Aeon's chunk tier *is* pooled and id-addressed; what actually differs is that aeon stamping **flattens a copy** into the section nametable, so editing a chunk does not propagate to placements — whereas a classic layout cell **holds the chunk id**, so it does. Naming this `pooled` would make every downstream reader reason from a false invariant.

Nothing consumes `artTiers` in this plan. Declaring it now forces the naming decision early and gives step H an interface to build against.

- [ ] **Step 1: Write the failing test**

Create `src/core/project/__tests__/art-tiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { s1Adapter } from '../s1';
import { aeonAdapter } from '../aeon';
import type { ArtTier } from '../adapter';

// The ladders are declared on the adapters' capability manifests. These read
// them off the module rather than opening a project, so the test needs no fs.
const s1Tiers = s1Adapter.artTiers as readonly ArtTier[];
const aeonTiers = aeonAdapter.artTiers as readonly ArtTier[];

describe('classic art tier ladder', () => {
  it('descends chunk -> block -> tile', () => {
    expect(s1Tiers.map((t) => t.id)).toEqual(['chunk', 'block', 'tile']);
  });

  it('is 256 / 16 / 8 pixels', () => {
    expect(s1Tiers.map((t) => t.pixelSize)).toEqual([256, 16, 8]);
  });

  it('is shared at every tier — layout cells hold ids, so edits propagate', () => {
    expect(s1Tiers.every((t) => t.shared)).toBe(true);
  });
});

describe('aeon art tier ladder', () => {
  it('has NO 16px middle tier (spec §2.1)', () => {
    expect(aeonTiers.map((t) => t.id)).toEqual(['chunk', 'tile']);
    expect(aeonTiers.some((t) => t.pixelSize === 16)).toBe(false);
  });

  it('has a variable-size chunk tier', () => {
    expect(aeonTiers.find((t) => t.id === 'chunk')!.pixelSize).toBeNull();
  });

  it('marks the chunk tier unshared — stamping flattens a copy (spec §3.0.2)', () => {
    expect(aeonTiers.find((t) => t.id === 'chunk')!.shared).toBe(false);
  });

  it('marks the tile tier shared — the tileset is referenced by index', () => {
    expect(aeonTiers.find((t) => t.id === 'tile')!.shared).toBe(true);
  });
});

describe('ladder invariants hold for every profile', () => {
  for (const [name, tiers] of [['s1', s1Tiers], ['aeon', aeonTiers]] as const) {
    it(`${name}: ids are unique and non-empty`, () => {
      expect(new Set(tiers.map((t) => t.id)).size).toBe(tiers.length);
      expect(tiers.every((t) => t.id.length > 0 && t.label.length > 0)).toBe(true);
    });

    it(`${name}: the innermost tier is the 8px tile`, () => {
      const last = tiers[tiers.length - 1]!;
      expect(last.id).toBe('tile');
      expect(last.pixelSize).toBe(8);
    });

    it(`${name}: fixed pixel sizes descend outermost-first`, () => {
      const sizes = tiers.map((t) => t.pixelSize).filter((s): s is number => s !== null);
      expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/project/__tests__/art-tiers.test.ts`
Expected: FAIL — `artTiers` does not exist on either adapter.

**If the adapters turn out not to expose a module-level `artTiers` you can read without opening a project**, adapt the test to read `capabilities.artTiers` off an opened fixture handle in the same style the existing adapter tests use, and adjust Step 3 to match. Do not invent a new export shape just to satisfy the test as written.

- [ ] **Step 3: Add the type and declare both ladders**

In `src/core/project/adapter.ts`, above `CapabilityManifest`:

```ts
/**
 * One rung of a profile's art hierarchy, outermost first. The breadcrumb in the
 * Art facet has exactly one segment per tier, so this list IS the navigable
 * depth — a profile with no middle tier simply declares two rungs.
 */
export interface ArtTier {
  /** Stable id: 'chunk' | 'block' | 'tile' today. Used for behaviour lookups. */
  readonly id: string;
  /** Breadcrumb label. */
  readonly label: string;
  /** Edge length in px of one unit, or null when the tier is variable-size. */
  readonly pixelSize: number | null;
  /**
   * True when placements REFERENCE a unit by id, so editing it changes every
   * placement — which is what makes usage counts, a shared-edit banner and
   * Duplicate meaningful. False when a placement FLATTENS a copy at stamp time
   * (aeon chunks), where those affordances are meaningless and clipboard /
   * save-to-library take their place.
   *
   * NOT named `pooled`: aeon's chunk tier IS a pooled id-addressed library; it
   * is the STAMP that copies. See spec §3.0.2.
   */
  readonly shared: boolean;
}
```

Then add to `CapabilityManifest`, **optional** so the five fixture construction sites keep compiling:

```ts
  /** This profile's art hierarchy, outermost tier first (spec §3.3 as amended
   *  by §3.0.2). Optional: absent means the profile declares no ladder yet. */
  artTiers?: readonly ArtTier[];
```

Declare on the classic profile in `src/core/project/s1/index.ts`, beside the existing `facets` grant:

```ts
  artTiers: [
    { id: 'chunk', label: 'Chunk', pixelSize: 256, shared: true },
    { id: 'block', label: 'Block', pixelSize: 16,  shared: true },
    { id: 'tile',  label: 'Tile',  pixelSize: 8,   shared: true },
  ],
```

And on the aeon profile in `src/core/project/aeon/index.ts`:

```ts
  // No 16px middle tier: the aeon ENGINE's 128px "block" is positional and
  // build-time, not an editor tier (spec §2.1). The editor's chunk is a
  // variable W×H stamp from the chunk library — pooled by id, but FLATTENED
  // into the section nametable on stamp, hence shared: false (spec §3.0.2).
  artTiers: [
    { id: 'chunk', label: 'Chunk', pixelSize: null, shared: false },
    { id: 'tile',  label: 'Tile',  pixelSize: 8,    shared: true },
  ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/project/__tests__/art-tiers.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Fix the two manifest equality assertions**

`src/core/project/__tests__/s1-adapter.test.ts` and `src/core/project/aeon/__tests__/aeon-adapter.test.ts` each assert the manifest by exact equality, so both now fail on the added field. Add the expected `artTiers` to each expectation rather than loosening the assertion — exact equality is the point of those tests.

Run: `npx vitest run src/core/project/__tests__/s1-adapter.test.ts src/core/project/aeon/__tests__/aeon-adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run` — 0 failed. The five fixture sites should need no change; **if any does, the field was not optional** — go back and fix that rather than editing fixtures.

- [ ] **Step 7: Commit**

```bash
git add src/core/project/adapter.ts src/core/project/s1/index.ts src/core/project/aeon/index.ts \
        src/core/project/__tests__/art-tiers.test.ts \
        src/core/project/__tests__/s1-adapter.test.ts \
        src/core/project/aeon/__tests__/aeon-adapter.test.ts
git commit -m "feat(project): profiles declare their own art tier ladder"
```

---

### Task 3: Engine-keyed facet canvases

**Files:**
- Modify: `src/renderer/workspace/facet-registry.ts`, `src/renderer/workspace/register-facets.ts`, `src/renderer/workspace/LevelWorkspace.tsx`
- Test: `src/renderer/workspace/__tests__/facet-canvases.test.ts`

**What this task does NOT do.** Per spec §3.0.1, the other slots are *not* engine-neutral — they import aeon stores directly. This task keys **only the Canvas slot** by engine and leaves `FacetModule`'s other slots exactly as they are. Do not attempt to neutralise `ToolDock` / `RightPanel` / `StatusBar`; that is step F and it is a per-component job.

The end state here is **zero visible change**: only aeon canvases are registered, so aeon resolves exactly as before and classic still renders through `LegacyWorkspace`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/workspace/__tests__/facet-canvases.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { facetCanvases, registerFacetCanvas, canvasFor } from '../facet-canvases';

const A = () => null;
const B = () => null;

describe('facetCanvases', () => {
  beforeEach(() => { facetCanvases.clear(); });

  it('resolves a canvas by (engine, facet)', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor('aeon', 'layout')).toBe(A);
  });

  it('keeps engines independent for the same facet', () => {
    registerFacetCanvas('aeon', 'layout', A);
    registerFacetCanvas('s1', 'layout', B);
    expect(canvasFor('aeon', 'layout')).toBe(A);
    expect(canvasFor('s1', 'layout')).toBe(B);
  });

  it('returns null for an unregistered pair rather than throwing', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor('s1', 'layout')).toBeNull();
    expect(canvasFor('aeon', 'art')).toBeNull();
  });

  it('returns null when no engine is open', () => {
    registerFacetCanvas('aeon', 'layout', A);
    expect(canvasFor(null, 'layout')).toBeNull();
  });

  it('is register-if-absent, matching the house pattern', () => {
    registerFacetCanvas('aeon', 'layout', A);
    registerFacetCanvas('aeon', 'layout', B);
    expect(canvasFor('aeon', 'layout')).toBe(A);
  });
});

describe('registerAeonFacetModules registers every aeon canvas', () => {
  beforeEach(() => { facetCanvases.clear(); });

  it('covers all six built facets', async () => {
    const { registerAeonFacetModules } = await import('../register-facets');
    registerAeonFacetModules();
    for (const f of ['layout', 'art', 'objects', 'rings', 'collision', 'palette'] as const) {
      expect(canvasFor('aeon', f), `aeon/${f}`).not.toBeNull();
    }
  });

  it('registers no classic canvases yet', () => {
    expect(canvasFor('s1', 'layout')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/workspace/__tests__/facet-canvases.test.ts`
Expected: FAIL — `Failed to resolve import "../facet-canvases"`.

- [ ] **Step 3: Create the canvas registry**

Create `src/renderer/workspace/facet-canvases.ts`:

```ts
// The Canvas slot is the ONE part of a facet that is genuinely engine-specific:
// classic's map is a chunk-id grid, aeon's is a section nametable, and no
// abstraction over both is worth building. Everything else about a facet — its
// id, label, order, and (eventually) its other slots — stays engine-neutral on
// facetModules.
//
// Deliberately NOT folded into FacetModule: a facet is one concept with one
// label and one order across engines; only its canvas differs. Keying the whole
// module by engine would duplicate that shared identity per engine.

import type { ComponentType } from 'react';
import type { FacetCapability } from '../../core/project/adapter';
import type { OpenEngine } from '../state/open-project';

const key = (engine: OpenEngine, facet: FacetCapability) => `${engine}:${facet}`;

class FacetCanvasRegistry {
  private canvases = new Map<string, ComponentType>();

  /** Register-if-absent (HMR / repeated boot), matching registerFacetModule. */
  register(engine: OpenEngine, facet: FacetCapability, Canvas: ComponentType): void {
    const k = key(engine, facet);
    if (!this.canvases.has(k)) this.canvases.set(k, Canvas);
  }

  get(engine: OpenEngine | null, facet: FacetCapability): ComponentType | null {
    if (!engine) return null;
    return this.canvases.get(key(engine, facet)) ?? null;
  }

  /** Test support only. */
  clear(): void { this.canvases.clear(); }
}

export const facetCanvases = new FacetCanvasRegistry();

export function registerFacetCanvas(
  engine: OpenEngine, facet: FacetCapability, Canvas: ComponentType,
): void {
  facetCanvases.register(engine, facet, Canvas);
}

/** The canvas for an (engine, facet) pair, or null when none is registered —
 *  null rather than throwing, because a facet may legitimately have no canvas
 *  for an engine until that engine is re-homed. */
export function canvasFor(
  engine: OpenEngine | null, facet: FacetCapability,
): ComponentType | null {
  return facetCanvases.get(engine, facet);
}
```

- [ ] **Step 4: Make `mapFacet` take its canvas, and register aeon's**

In `src/renderer/workspace/facet-registry.ts`, `mapFacet` currently hardcodes `Canvas: MapViewport`. The `Canvas` field stays on `FacetModule` (it is still the fallback for anything not yet engine-keyed), but registration must also populate `facetCanvases`.

The minimal change that keeps every existing facet module file untouched: leave `mapFacet` as it is, and have `register-facets.ts` register each module's own `Canvas` under `'aeon'`. In `src/renderer/workspace/register-facets.ts`:

```ts
import { registerFacetCanvas } from './facet-canvases';

export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet]) {
    registerFacetModule(m);
    // The Canvas on each module IS aeon's canvas today; classic registers its
    // own in step G. Sourcing it from the module keeps one definition.
    registerFacetCanvas('aeon', m.id, m.Canvas);
  }
}
```

- [ ] **Step 5: Resolve the Canvas through the engine in `LevelWorkspace`**

In `src/renderer/workspace/LevelWorkspace.tsx`, replace the destructured `Canvas` with an engine-resolved one, falling back to the module's own so behaviour is unchanged if a pair is missing:

```ts
import { useOpenEngine } from '../state/open-project';
import { canvasFor } from './facet-canvases';

// …inside the component, after `mod` is resolved:
  const engine = useOpenEngine();
  const { ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
  // Engine-keyed canvas (spec §3.1); mod.Canvas is the fallback until every
  // engine registers one. NOTE: only the CANVAS is engine-keyed — the other
  // slots are still aeon-coupled (spec §3.0.1) and are step F's job.
  const Canvas = canvasFor(engine, mod.id) ?? mod.Canvas;
```

Leave the rest of the render untouched.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/renderer/workspace/__tests__/facet-canvases.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit` — clean.
Run: `npx vitest run` — 0 failed.

Also check `src/renderer/workspace/__tests__/facet-visibility.test.ts` still passes untouched; it is the closest existing guard on this area.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/workspace/facet-canvases.ts \
        src/renderer/workspace/__tests__/facet-canvases.test.ts \
        src/renderer/workspace/register-facets.ts \
        src/renderer/workspace/LevelWorkspace.tsx
git commit -m "feat(workspace): resolve the facet Canvas slot by engine"
```

---

### Task 4: Full verification

- [ ] **Step 1: Types and suite**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: tsc clean; **0 failed**; ~27 tests added over the 1486 baseline.

- [ ] **Step 2: Prove there is no behaviour change**

This plan's whole claim is that nothing user-visible changed. Verify by inspection:

```bash
git diff master --stat
```

Every changed renderer file should be either additive or a like-for-like substitution of the engine derivation. If any diff changes what renders, it is out of scope — back it out.

- [ ] **Step 3: Smoke test (manual, the owner's)**

The renderer suite is node-only, so these are eyeball-only:
1. Open an aeon project — all six facets switch and render exactly as before.
2. Open a classic project — still renders through `LegacyWorkspace`, unchanged.
3. Switch projects aeon → classic → aeon; the correct engine's UI appears each time.
4. Ctrl+S and Ctrl+Shift+S still route correctly for both engines (Task 1 touched save routing).

- [ ] **Step 4: Confirm master has not moved**

```bash
git log --oneline -1 master   # expect 5e94e44 or later, but NOT a commit you made
```

---

## Worktree discipline

Subagent shells start in the **main tree**, not the worktree. Every Bash call must be prefixed:

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan2 && <command>
```

All paths passed to Read/Edit/Write must be absolute under
`/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan2/`. This tripwire held for all of Stage 3 and Stage 4 Plan 1 (zero master incidents across ~30 subagent runs) precisely because it was applied without exception.

## Self-review notes

- **Spec coverage:** §3.1 → Task 3 (Canvas only; the rest is deferred per §3.0.1). §3.2 → Task 1. §3.3 → Task 2, with the §3.0.2 naming correction applied. §3.4–3.7 are steps D–H, out of scope by the re-slicing stated at the top.
- **Deliberate deviation:** §3.3 called the flag `pooled`. It is `shared` here, for the reason recorded in spec §3.0.2. This was a decision, not an oversight.
- **Type consistency:** `OpenEngine` (Task 1) is consumed by `facet-canvases` and `LevelWorkspace` (Task 3). `ArtTier` (Task 2) is consumed by `openArtTiers` (Task 1) — so Task 1's `openArtTiers` returns `[]` until Task 2 lands, which its test asserts. Land them in order.
- **Known hazard:** Task 1 touches save routing in `project-runtime.ts`. A precedence mistake there would send Ctrl+S at the wrong engine. Step 6 of Task 1 calls this out; the saver-ownership tests are the guard.
- **Deliberately untouched:** `src/renderer/state/toolStore.ts` is dead code with a live test. Do not adopt, extend, or delete it here.
