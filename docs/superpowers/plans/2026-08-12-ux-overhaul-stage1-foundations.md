# Aurora UX Overhaul — Stage 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested core contracts the new shell hangs on: generic registries, facet descriptors with capability gating, the extended profile contract, the project mapping schema, per-document undo, the project-wide save coordinator, and the tab-session model with persistence.

**Architecture:** Everything in this stage is pure logic — fs-free core modules under `src/core/` plus one thin zustand wrapper under `src/renderer/state/`. No UI changes; the app keeps running on the old shell until Stage 2. Spec: `docs/superpowers/specs/2026-08-12-aurora-ux-overhaul-design.md` (§7 profiles, §9 registries, §10 save/undo/sessions, §12 stage 1).

**Tech Stack:** TypeScript (strict), zustand v5, zod v4, vitest. Follow the existing core conventions: no fs/Electron imports in `src/core/`, tests colocated in `__tests__/`, registries throw on duplicate registration (see `src/core/project/adapter.ts:175-180` for the house pattern).

**Conventions for every task:** run tests with `npx vitest run <test-file>` from `/home/volence/sonic_hacks/aurora`. Commit messages use the repo's `type(scope): summary` style. Never add a Co-Authored-By trailer.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the overhaul branch**

```bash
cd /home/volence/sonic_hacks/aurora
git checkout feature/disasm-project
git checkout -b feature/ux-overhaul
```

Expected: `Switched to a new branch 'feature/ux-overhaul'`. (Pre-existing uncommitted files from the disasm work may be present in the working tree; leave them alone — commit only the files each task names.)

---

### Task 1: Generic registry factory

The house pattern from `adapter.ts` (register / throw-on-duplicate / clear-for-tests), extracted so facets, explorer groups, and tools all reuse it (spec §9: "explorer groups and tool tabs use the same registration pattern").

**Files:**
- Create: `src/core/shell/registry.ts`
- Test: `src/core/shell/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/shell/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { createRegistry } from '../registry';

interface Widget { id: string; label: string }

describe('createRegistry', () => {
  it('registers and retrieves items by id', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    expect(reg.get('a')).toEqual({ id: 'a', label: 'A' });
    expect(reg.get('missing')).toBeUndefined();
  });

  it('lists items in registration order', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    reg.register({ id: 'b', label: 'B' });
    expect(reg.list().map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('throws on duplicate id', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    expect(() => reg.register({ id: 'a', label: 'A2' })).toThrow(
      "Widget 'a' is already registered",
    );
  });

  it('clear() empties the registry (test isolation support)', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    reg.clear();
    expect(reg.list()).toEqual([]);
  });

  it('list() returns a copy — mutating it does not affect the registry', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    const snapshot = reg.list();
    (snapshot as Widget[]).pop();
    expect(reg.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/shell/__tests__/registry.test.ts`
Expected: FAIL — cannot resolve `../registry`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/shell/registry.ts
// Generic id-keyed registry — the house registration pattern (register /
// throw-on-duplicate / clear-for-tests) extracted from the project-adapter
// registry so facets, explorer groups, and tool tabs share one mechanism.
// Registration is controlled startup code: a duplicate id is always a bug,
// never a runtime condition to tolerate.

export interface RegistryItem {
  readonly id: string;
}

export interface Registry<T extends RegistryItem> {
  register(item: T): void;
  get(id: string): T | undefined;
  /** Items in registration order. Returns a copy. */
  list(): readonly T[];
  /** Test support: reset so tests don't leak into each other. */
  clear(): void;
}

export function createRegistry<T extends RegistryItem>(kind: string): Registry<T> {
  const items: T[] = [];
  return {
    register(item) {
      if (items.some((x) => x.id === item.id)) {
        throw new Error(`${kind} '${item.id}' is already registered`);
      }
      items.push(item);
    },
    get: (id) => items.find((x) => x.id === id),
    list: () => items.slice(),
    clear() {
      items.length = 0;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/shell/__tests__/registry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/registry.ts src/core/shell/__tests__/registry.test.ts
git commit -m "feat(shell): generic id-keyed registry factory"
```

---

### Task 2: Facet descriptors + capability gating

Facets are lenses over a level (spec §4); which ones a level workspace shows = registered facets ∩ the profile's capability list, in declared order (spec §9). Only the six facets that exist today are built-in; parallax/events/preview arrive later as one `register` call each — that is the whole point of the registry.

**Files:**
- Create: `src/core/shell/facets.ts`
- Test: `src/core/shell/__tests__/facets.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/shell/__tests__/facets.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { facetRegistry, registerBuiltinFacets, facetsFor } from '../facets';

describe('facets', () => {
  beforeEach(() => {
    facetRegistry.clear();
    registerBuiltinFacets();
  });

  it('registers the six built-in facets', () => {
    expect(facetRegistry.list().map((f) => f.id)).toEqual([
      'layout', 'art', 'objects', 'rings', 'collision', 'palette',
    ]);
  });

  it('registerBuiltinFacets is idempotent (safe to call from multiple entry points)', () => {
    registerBuiltinFacets();
    expect(facetRegistry.list()).toHaveLength(6);
  });

  it('facetsFor returns only capability-granted facets, in order', () => {
    // S1 profile: no rings facet (S1 rings are objects — spec §4)
    const s1 = facetsFor(['layout', 'art', 'objects', 'collision', 'palette']);
    expect(s1.map((f) => f.id)).toEqual(['layout', 'art', 'objects', 'collision', 'palette']);
  });

  it('facetsFor includes rings for an aeon-style capability list', () => {
    const aeon = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(aeon.map((f) => f.id)).toEqual(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
  });

  it('a capability with no registered facet renders nothing (no dead chrome)', () => {
    expect(facetsFor(['parallax'])).toEqual([]);
  });

  it('a later-registered facet slots in by order, not registration sequence', () => {
    facetRegistry.register({ id: 'parallax', label: 'Parallax', order: 25 });
    const ids = facetsFor(['layout', 'parallax', 'collision']).map((f) => f.id);
    expect(ids).toEqual(['layout', 'parallax', 'collision']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/shell/__tests__/facets.test.ts`
Expected: FAIL — cannot resolve `../facets`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/shell/facets.ts
// Facet descriptors for the level workspace (spec §4/§9). A facet is a lens
// over one level; which facets a workspace shows is registered-facets ∩ the
// project profile's capability list. Renderer components (canvas view, right
// panel, tool set) attach to these ids in later stages — core owns only the
// descriptor and the gating rule, so it stays fs- and React-free.

import { createRegistry, type Registry } from './registry';

/** Capability keys a profile may grant (spec §7). Superset of built-in facets:
 *  parallax/events/preview are declared now so profiles can be authored against
 *  them, but have no built-in facet until their stages land (no dead chrome). */
export type FacetCapability =
  | 'layout' | 'art' | 'objects' | 'rings' | 'collision' | 'palette'
  | 'parallax' | 'events' | 'preview';

export interface FacetDescriptor {
  readonly id: FacetCapability;
  readonly label: string;
  /** Display position in the facet bar; ascending. Built-ins use gaps of 10 so
   *  future facets (parallax 25, events 45, …) slot between without renumbering. */
  readonly order: number;
}

export const facetRegistry: Registry<FacetDescriptor> = createRegistry<FacetDescriptor>('Facet');

const BUILTIN_FACETS: FacetDescriptor[] = [
  { id: 'layout', label: 'Layout', order: 0 },
  { id: 'art', label: 'Art', order: 10 },
  { id: 'objects', label: 'Objects', order: 20 },
  { id: 'rings', label: 'Rings', order: 30 },
  { id: 'collision', label: 'Collision', order: 40 },
  { id: 'palette', label: 'Palette', order: 50 },
];

/** Idempotent: multiple entry points (renderer boot, tests) may call it. */
export function registerBuiltinFacets(): void {
  for (const f of BUILTIN_FACETS) {
    if (!facetRegistry.get(f.id)) facetRegistry.register(f);
  }
}

/** The facet bar for a level workspace: granted ∩ registered, by order. */
export function facetsFor(capabilities: readonly FacetCapability[]): FacetDescriptor[] {
  return facetRegistry
    .list()
    .filter((f) => capabilities.includes(f.id))
    .sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/shell/__tests__/facets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/facets.ts src/core/shell/__tests__/facets.test.ts
git commit -m "feat(shell): facet descriptors with capability gating"
```

---

### Task 3: Profile contract — facet capability lists

Extend `CapabilityManifest` so every opened project declares its facet list (spec §7: "the shell renders only from this contract and never branches on engine identity"). S1 gets no `rings` (rings are objects there); aeon does.

**Files:**
- Modify: `src/core/project/adapter.ts:58-64` (CapabilityManifest)
- Modify: `src/core/project/s1/index.ts:365` (s1 open() capabilities)
- Modify: `src/core/project/aeon/index.ts:112` (aeon open() capabilities)
- Modify: any test fixtures that construct a `CapabilityManifest` (found in Step 4)

- [ ] **Step 1: Add the field to CapabilityManifest**

In `src/core/project/adapter.ts`, add the import at the top (after the existing `ResolutionReport` import):

```typescript
import type { FacetCapability } from '../shell/facets';
```

and extend the interface (keep the existing fields exactly as they are):

```typescript
export interface CapabilityManifest {
  levels: 'chunk-hierarchy' | 'aeon' | null;
  sprites: boolean;
  objects: 'objpos' | 'json' | null;
  /** Aurora never drives the assembler; build is always false for now. */
  build: false;
  /** Which level-workspace facets this project's levels get (spec §4/§7).
   *  The shell renders registered-facets ∩ this list and nothing else. */
  facets: FacetCapability[];
}
```

Also re-export the type so profile authors import it from the project layer:

```typescript
export type { FacetCapability } from '../shell/facets';
```

- [ ] **Step 2: Declare facets in both adapters**

`src/core/project/s1/index.ts:365` — change the capabilities literal to:

```typescript
      capabilities: {
        levels: 'chunk-hierarchy',
        sprites: true,
        objects: 'objpos',
        build: false,
        facets: ['layout', 'art', 'objects', 'collision', 'palette'],
      },
```

`src/core/project/aeon/index.ts:112` — change the capabilities literal to:

```typescript
      capabilities: {
        levels: 'aeon',
        sprites: true,
        objects: 'json',
        build: false,
        facets: ['layout', 'art', 'objects', 'rings', 'collision', 'palette'],
      },
```

- [ ] **Step 3: Add gating tests for both adapters**

Append to `src/core/shell/__tests__/facets.test.ts` (inside the top-level `describe`):

```typescript
  it('S1 capability list yields no rings facet; aeon yields rings', () => {
    const s1Facets = facetsFor(['layout', 'art', 'objects', 'collision', 'palette']);
    const aeonFacets = facetsFor(['layout', 'art', 'objects', 'rings', 'collision', 'palette']);
    expect(s1Facets.some((f) => f.id === 'rings')).toBe(false);
    expect(aeonFacets.some((f) => f.id === 'rings')).toBe(true);
  });
```

- [ ] **Step 4: Fix fixture type errors across the suite**

Run: `npx vitest run`
Any test fixture that constructs a `CapabilityManifest` (search: `grep -rn "build: false" src --include="*.test.ts"`) now fails to typecheck. Fix each by adding a `facets` line matching the fixture's engine: `facets: ['layout', 'art', 'objects', 'collision', 'palette']` for s1-style fixtures, add `'rings'` after `'objects'` for aeon-style fixtures. Change nothing else in those fixtures.

Run again: `npx vitest run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/project/adapter.ts src/core/project/s1/index.ts src/core/project/aeon/index.ts src/core/shell/__tests__/facets.test.ts
git add -u src
git commit -m "feat(project): profiles declare facet capability lists"
```

---

### Task 4: Project mapping schema (`.aurora/project.json` v2)

The per-project mapping layer (spec §7): base-profile id + per-asset-class path/format/compression overrides, tolerant of unknown fields (older/newer Auroras must round-trip each other's files). This task is schema + parse/serialize only; the Project Setup UI consumes it in Stage 2. The existing `ProjectOverrides { paths }` shape stays valid — `paths` remains as the already-shipped override channel.

**Files:**
- Create: `src/core/project/mapping.ts`
- Test: `src/core/project/__tests__/mapping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/project/__tests__/mapping.test.ts
import { describe, it, expect } from 'vitest';
import { parseProjectConfig, serializeProjectConfig, type ProjectConfig } from '../mapping';

const enc = (s: string) => new TextEncoder().encode(s);

describe('project mapping config', () => {
  it('parses a full v2 config', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({
      base: 's2-github',
      paths: { 'level/layout': 'custom/layouts' },
      assets: {
        'level-art': { path: 'art/zx0', compression: 'zx0' },
        'sprites': { format: 's2', compression: 'kosinski' },
      },
    })));
    expect(cfg).not.toBeNull();
    expect(cfg!.base).toBe('s2-github');
    expect(cfg!.assets!['level-art'].compression).toBe('zx0');
  });

  it('parses the legacy v1 shape (paths only)', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({ paths: { a: 'b' } })));
    expect(cfg).toEqual({ paths: { a: 'b' } });
  });

  it('parses an empty object (stock project, no overrides)', () => {
    expect(parseProjectConfig(enc('{}'))).toEqual({});
  });

  it('preserves unknown top-level fields through a round-trip', () => {
    const cfg = parseProjectConfig(enc(JSON.stringify({ base: 'aeon', futureField: 42 })));
    expect(cfg).not.toBeNull();
    const rt = parseProjectConfig(serializeProjectConfig(cfg!));
    expect((rt as Record<string, unknown>).futureField).toBe(42);
  });

  it('rejects malformed JSON and wrong shapes with null (caller falls back to base profile)', () => {
    expect(parseProjectConfig(enc('not json'))).toBeNull();
    expect(parseProjectConfig(enc(JSON.stringify({ assets: 'nope' })))).toBeNull();
    expect(parseProjectConfig(enc(JSON.stringify({ assets: { x: { path: 3 } } })))).toBeNull();
  });

  it('serializes with trailing newline and 2-space indent (diff-friendly in repos)', () => {
    const cfg: ProjectConfig = { base: 'aeon' };
    const text = new TextDecoder().decode(serializeProjectConfig(cfg));
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('  "base": "aeon"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/project/__tests__/mapping.test.ts`
Expected: FAIL — cannot resolve `../mapping`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/project/mapping.ts
// The per-project mapping layer (spec §7): `.aurora/project.json` carries the
// nearest-base profile id plus per-asset-class overrides (path / format /
// compression) for hacks that diverge from stock. Loose at the top level so
// configs written by newer Auroras survive a round-trip through older ones;
// strict inside each asset override so typos fail loudly at parse time.

import { z } from 'zod';

const assetOverrideSchema = z.strictObject({
  path: z.string().optional(),
  format: z.string().optional(),
  compression: z.string().optional(),
});

export const projectConfigSchema = z.looseObject({
  /** Base profile id, e.g. 's1-github', 's1-hivebrain-2005', 'aeon'. */
  base: z.string().optional(),
  /** v1 channel: resolution path overrides, keyed by resolver key. */
  paths: z.record(z.string(), z.string()).optional(),
  /** v2 channel: per-asset-class overrides. */
  assets: z.record(z.string(), assetOverrideSchema).optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** null on malformed input — the caller falls back to the untouched base profile. */
export function parseProjectConfig(bytes: Uint8Array): ProjectConfig | null {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  const res = projectConfigSchema.safeParse(json);
  return res.success ? res.data : null;
}

export function serializeProjectConfig(cfg: ProjectConfig): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cfg, null, 2) + '\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/project/__tests__/mapping.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/project/mapping.ts src/core/project/__tests__/mapping.test.ts
git commit -m "feat(project): .aurora/project.json mapping schema (base + asset overrides)"
```

---

### Task 5: Per-document undo — DocumentHistoryHub

Spec §10: one undo stack per document (level doc, zone art doc, sprite doc), replacing the three bridged systems. This task builds the hub; rewiring the existing stores onto it happens in Stages 3–4. Reuses the existing `EditHistory` class (`src/core/editing/history.ts:6`) unchanged.

**Files:**
- Create: `src/core/editing/document-history.ts`
- Test: `src/core/editing/__tests__/document-history.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/editing/__tests__/document-history.test.ts
import { describe, it, expect } from 'vitest';
import { DocumentHistoryHub } from '../document-history';

describe('DocumentHistoryHub', () => {
  it('returns the same EditHistory for the same doc id', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.historyFor('level:ghz:1')).toBe(hub.historyFor('level:ghz:1'));
  });

  it('returns independent histories for different doc ids', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.historyFor('level:ghz:1')).not.toBe(hub.historyFor('doc:buzzbomber'));
  });

  it('has() reports without creating', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.has('level:ghz:1')).toBe(false);
    hub.historyFor('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(true);
  });

  it('dispose() clears and forgets a history; next access is fresh', () => {
    const hub = new DocumentHistoryHub();
    const first = hub.historyFor('level:ghz:1');
    hub.dispose('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(false);
    expect(hub.historyFor('level:ghz:1')).not.toBe(first);
  });

  it('clearAll() empties the hub (project close)', () => {
    const hub = new DocumentHistoryHub();
    hub.historyFor('a');
    hub.historyFor('b');
    hub.clearAll();
    expect(hub.has('a')).toBe(false);
    expect(hub.has('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/editing/__tests__/document-history.test.ts`
Expected: FAIL — cannot resolve `../document-history`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/editing/document-history.ts
// Per-document undo (spec §10): every document (level layout doc, zone art
// doc, sprite doc) owns one EditHistory; undo/redo follows the focused
// document. Stages 3–4 rewire the existing stores onto a shared hub instance,
// retiring the undo-bus sibling-invalidation scheme.
//
// Doc ids are the session tab ids ('level:ghz:1', 'doc:buzzbomber', …) so a
// tab and its history share one identity.

import { EditHistory } from './history';

export class DocumentHistoryHub {
  private histories = new Map<string, EditHistory>();

  /** Get-or-create the history for a document. */
  historyFor(docId: string): EditHistory {
    let h = this.histories.get(docId);
    if (!h) {
      h = new EditHistory();
      this.histories.set(docId, h);
    }
    return h;
  }

  has(docId: string): boolean {
    return this.histories.has(docId);
  }

  /** Drop a document's history entirely (document closed without reopening intent). */
  dispose(docId: string): void {
    this.histories.get(docId)?.clear();
    this.histories.delete(docId);
  }

  /** Project close: drop everything. */
  clearAll(): void {
    for (const h of this.histories.values()) h.clear();
    this.histories.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/editing/__tests__/document-history.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/document-history.ts src/core/editing/__tests__/document-history.test.ts
git commit -m "feat(editing): per-document undo hub"
```

---

### Task 6: Project-wide save — SaveCoordinator

Spec §10: Ctrl+S saves the project (all dirty state); standalone docs save their own file. The coordinator is the one place that knows who is dirty — replacing the current fragile mode-based save routing. Stages 2–4 register real savers; here we build and test the aggregation contract.

**Files:**
- Create: `src/core/editing/save-coordinator.ts`
- Test: `src/core/editing/__tests__/save-coordinator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/editing/__tests__/save-coordinator.test.ts
import { describe, it, expect } from 'vitest';
import { SaveCoordinator, type Saver } from '../save-coordinator';

function fakeSaver(id: string, opts: { dirty: boolean; fail?: string; log?: string[] }): Saver {
  return {
    id,
    isDirty: () => opts.dirty,
    save: async () => {
      opts.log?.push(id);
      if (opts.fail) throw new Error(opts.fail);
    },
  };
}

describe('SaveCoordinator', () => {
  it('saves only dirty savers, skipping clean ones', async () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('level', { dirty: true }));
    c.register(fakeSaver('zone-art', { dirty: false }));
    const result = await c.saveAll();
    expect(result.saved).toEqual(['level']);
    expect(result.skipped).toEqual(['zone-art']);
    expect(result.failed).toEqual([]);
  });

  it('saves in registration order', async () => {
    const log: string[] = [];
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: true, log }));
    c.register(fakeSaver('b', { dirty: true, log }));
    await c.saveAll();
    expect(log).toEqual(['a', 'b']);
  });

  it('a failing saver is reported and does not block the rest', async () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('bad', { dirty: true, fail: 'disk on fire' }));
    c.register(fakeSaver('good', { dirty: true }));
    const result = await c.saveAll();
    expect(result.failed).toEqual([{ id: 'bad', message: 'disk on fire' }]);
    expect(result.saved).toEqual(['good']);
  });

  it('anyDirty() aggregates dirtiness', () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: false }));
    expect(c.anyDirty()).toBe(false);
    c.register(fakeSaver('b', { dirty: true }));
    expect(c.anyDirty()).toBe(true);
  });

  it('throws on duplicate saver id; unregister frees the id', () => {
    const c = new SaveCoordinator();
    c.register(fakeSaver('a', { dirty: false }));
    expect(() => c.register(fakeSaver('a', { dirty: false }))).toThrow(
      "Saver 'a' is already registered",
    );
    c.unregister('a');
    expect(() => c.register(fakeSaver('a', { dirty: false }))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/editing/__tests__/save-coordinator.test.ts`
Expected: FAIL — cannot resolve `../save-coordinator`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/editing/save-coordinator.ts
// Project-wide save (spec §10): every dirty-able surface (level docs, zone
// art, sprite docs, palettes) registers a Saver; Ctrl+S calls saveAll() and
// the shell reports the aggregate. Replaces mode-based save routing — the
// coordinator, not the active view, knows what needs saving.

export interface Saver {
  readonly id: string;
  isDirty(): boolean;
  /** Persist this surface's dirty state. Throw to report failure. */
  save(): Promise<void>;
}

export interface SaveAllResult {
  saved: string[];
  skipped: string[];
  failed: { id: string; message: string }[];
}

export class SaveCoordinator {
  private savers: Saver[] = [];

  register(s: Saver): void {
    if (this.savers.some((x) => x.id === s.id)) {
      throw new Error(`Saver '${s.id}' is already registered`);
    }
    this.savers.push(s);
  }

  unregister(id: string): void {
    this.savers = this.savers.filter((s) => s.id !== id);
  }

  /** Test support / project close. */
  clear(): void {
    this.savers = [];
  }

  anyDirty(): boolean {
    return this.savers.some((s) => s.isDirty());
  }

  /** Save every dirty saver in registration order; failures don't block the rest. */
  async saveAll(): Promise<SaveAllResult> {
    const result: SaveAllResult = { saved: [], skipped: [], failed: [] };
    for (const s of this.savers) {
      if (!s.isDirty()) {
        result.skipped.push(s.id);
        continue;
      }
      try {
        await s.save();
        result.saved.push(s.id);
      } catch (e) {
        result.failed.push({ id: s.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/editing/__tests__/save-coordinator.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/save-coordinator.ts src/core/editing/__tests__/save-coordinator.test.ts
git commit -m "feat(editing): project-wide save coordinator"
```

---

### Task 7: Tab session model (pure core)

The everything-is-a-tab session (spec §3): Home pinned and uncloseable, open-focuses-existing, close picks the right-then-left neighbor. Pure reducers so the rules are testable without React or zustand; Task 8 wraps them in a store.

**Files:**
- Create: `src/core/shell/session.ts`
- Test: `src/core/shell/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/shell/__tests__/session.test.ts
import { describe, it, expect } from 'vitest';
import {
  HOME_TAB, initialSession, openTab, closeTab, focusTab, retitleTab,
  type TabDescriptor,
} from '../session';

const level = (id: string, title: string): TabDescriptor => ({ id, kind: 'level', title });

describe('tab session', () => {
  it('starts with only the Home tab, active', () => {
    expect(initialSession()).toEqual({ tabs: [HOME_TAB], activeId: 'home' });
  });

  it('openTab appends and focuses a new tab', () => {
    const s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(s.activeId).toBe('level:ghz:1');
  });

  it('openTab on an already-open id focuses it without duplicating', () => {
    let s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    s = openTab(s, level('level:mz:2', 'MZ Act 2'));
    s = openTab(s, level('level:ghz:1', 'GHZ Act 1'));
    expect(s.tabs).toHaveLength(3);
    expect(s.activeId).toBe('level:ghz:1');
  });

  it('closeTab of the active tab focuses the right neighbor, else the left', () => {
    let s = initialSession();
    s = openTab(s, level('a', 'A'));
    s = openTab(s, level('b', 'B'));
    s = openTab(s, level('c', 'C'));
    s = focusTab(s, 'b');
    s = closeTab(s, 'b');
    expect(s.activeId).toBe('c');           // right neighbor
    s = focusTab(s, 'c');
    s = closeTab(s, 'c');
    expect(s.activeId).toBe('a');           // no right neighbor → left
  });

  it('closeTab of an inactive tab keeps the active tab', () => {
    let s = openTab(initialSession(), level('a', 'A'));
    s = openTab(s, level('b', 'B'));
    s = closeTab(s, 'a');
    expect(s.activeId).toBe('b');
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'b']);
  });

  it('Home is uncloseable', () => {
    const s = closeTab(initialSession(), 'home');
    expect(s.tabs).toEqual([HOME_TAB]);
  });

  it('focusTab ignores unknown ids', () => {
    const s = focusTab(initialSession(), 'nope');
    expect(s.activeId).toBe('home');
  });

  it('retitleTab renames in place (dirty-name changes, act renames)', () => {
    let s = openTab(initialSession(), level('a', 'Old'));
    s = retitleTab(s, 'a', 'New');
    expect(s.tabs.find((t) => t.id === 'a')!.title).toBe('New');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/shell/__tests__/session.test.ts`
Expected: FAIL — cannot resolve `../session`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/shell/session.ts
// The everything-is-a-tab session model (spec §3), as pure reducers: the
// rules (Home pinned/uncloseable, open-focuses-existing, close falls to the
// right-then-left neighbor) live here, React/zustand-free, so they are
// testable in isolation. renderer/state/sessionStore.ts wraps these.
//
// Tab ids are stable identities shared with DocumentHistoryHub doc ids:
//   'home' | 'level:<zone>:<act>' | 'doc:<name>' | 'tool:<name>'
// Dirty state is NOT session state — documents/savers own dirtiness; the tab
// strip reads it from there at render time.

export type TabKind = 'home' | 'level' | 'sprite-doc' | 'art-doc' | 'palette-doc' | 'tool';

export interface TabDescriptor {
  readonly id: string;
  readonly kind: TabKind;
  readonly title: string;
}

export interface SessionState {
  tabs: TabDescriptor[];
  activeId: string;
}

export const HOME_TAB: TabDescriptor = { id: 'home', kind: 'home', title: 'Home' };

export function initialSession(): SessionState {
  return { tabs: [HOME_TAB], activeId: HOME_TAB.id };
}

export function openTab(state: SessionState, tab: TabDescriptor): SessionState {
  if (state.tabs.some((t) => t.id === tab.id)) return { ...state, activeId: tab.id };
  return { tabs: [...state.tabs, tab], activeId: tab.id };
}

export function focusTab(state: SessionState, id: string): SessionState {
  return state.tabs.some((t) => t.id === id) ? { ...state, activeId: id } : state;
}

export function closeTab(state: SessionState, id: string): SessionState {
  if (id === HOME_TAB.id) return state;
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return state;
  const tabs = state.tabs.filter((t) => t.id !== id);
  let activeId = state.activeId;
  if (activeId === id) {
    // Right neighbor keeps you "in the flow"; fall back left, then Home.
    activeId = (tabs[idx] ?? tabs[idx - 1] ?? HOME_TAB).id;
  }
  return { tabs, activeId };
}

export function retitleTab(state: SessionState, id: string, title: string): SessionState {
  return { ...state, tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/shell/__tests__/session.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/session.ts src/core/shell/__tests__/session.test.ts
git commit -m "feat(shell): pure tab-session model (home pinned, neighbor-close)"
```

---

### Task 8: Session store (zustand wrapper)

Thin renderer store over the Task 7 reducers, matching the house zustand style (`create<State>((set) => …)`, action methods on the store — see `src/renderer/state/editorStore.ts:152`).

**Files:**
- Create: `src/renderer/state/sessionStore.ts`
- Test: `src/renderer/state/__tests__/sessionStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/renderer/state/__tests__/sessionStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('exposes the initial session', () => {
    const s = useSessionStore.getState();
    expect(s.tabs.map((t) => t.id)).toEqual(['home']);
    expect(s.activeId).toBe('home');
  });

  it('open / focus / close delegate to the core reducers', () => {
    const s = useSessionStore.getState();
    s.open({ id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s.open({ id: 'doc:buzzbomber', kind: 'sprite-doc', title: 'Buzzbomber' });
    expect(useSessionStore.getState().activeId).toBe('doc:buzzbomber');

    s.focus('level:ghz:1');
    expect(useSessionStore.getState().activeId).toBe('level:ghz:1');

    s.close('level:ghz:1');
    const after = useSessionStore.getState();
    expect(after.tabs.map((t) => t.id)).toEqual(['home', 'doc:buzzbomber']);
    expect(after.activeId).toBe('doc:buzzbomber');
  });

  it('retitle renames a tab', () => {
    const s = useSessionStore.getState();
    s.open({ id: 'doc:x', kind: 'art-doc', title: 'Untitled' });
    s.retitle('doc:x', 'ghz-waterfall');
    expect(useSessionStore.getState().tabs.find((t) => t.id === 'doc:x')!.title).toBe('ghz-waterfall');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/sessionStore.test.ts`
Expected: FAIL — cannot resolve `../sessionStore`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/renderer/state/sessionStore.ts
// Zustand wrapper over the pure tab-session reducers (core/shell/session.ts).
// All rules live in core; this store only holds state and delegates, so the
// session behavior stays testable without React.

import { create } from 'zustand';
import {
  type SessionState, type TabDescriptor,
  initialSession, openTab, closeTab, focusTab, retitleTab,
} from '../../core/shell/session';

interface SessionStore extends SessionState {
  open: (tab: TabDescriptor) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  retitle: (id: string, title: string) => void;
  reset: () => void;
}

const asState = (s: SessionStore): SessionState => ({ tabs: s.tabs, activeId: s.activeId });

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialSession(),
  open: (tab) => set((s) => openTab(asState(s), tab)),
  close: (id) => set((s) => closeTab(asState(s), id)),
  focus: (id) => set((s) => focusTab(asState(s), id)),
  retitle: (id, title) => set((s) => retitleTab(asState(s), id, title)),
  reset: () => set(initialSession()),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/sessionStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/sessionStore.ts src/renderer/state/__tests__/sessionStore.test.ts
git commit -m "feat(shell): session store wrapping the core tab reducers"
```

---

### Task 9: Session persistence

Spec §10: open tabs + active tab persist per project and restore on reopen. Serialize/restore are pure and defensive — corrupt or partial input restores to a safe initial session rather than crashing the shell. (Wiring to actual storage keyed by project path is Stage 2, alongside the shell that reads it.)

**Files:**
- Create: `src/core/shell/session-persistence.ts`
- Test: `src/core/shell/__tests__/session-persistence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/core/shell/__tests__/session-persistence.test.ts
import { describe, it, expect } from 'vitest';
import { serializeSession, restoreSession } from '../session-persistence';
import { HOME_TAB, initialSession, openTab } from '../session';

describe('session persistence', () => {
  it('round-trips a session', () => {
    let s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s = openTab(s, { id: 'tool:converter', kind: 'tool', title: 'Converter' });
    expect(restoreSession(serializeSession(s))).toEqual(s);
  });

  it('restores garbage to the initial session', () => {
    expect(restoreSession('not json')).toEqual(initialSession());
    expect(restoreSession('{"tabs": "nope"}')).toEqual(initialSession());
  });

  it('injects Home if the persisted tab list lacks it', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [{ id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' }],
      activeId: 'level:ghz:1',
    }));
    expect(restored.tabs[0]).toEqual(HOME_TAB);
    expect(restored.activeId).toBe('level:ghz:1');
  });

  it('falls back to Home when the persisted activeId no longer exists', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [HOME_TAB],
      activeId: 'level:deleted:9',
    }));
    expect(restored.activeId).toBe('home');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/shell/__tests__/session-persistence.test.ts`
Expected: FAIL — cannot resolve `../session-persistence`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/core/shell/session-persistence.ts
// Serialize/restore for the tab session (spec §10: sessions restore on
// reopen). Restore is defensive: corrupt/partial input yields a safe initial
// session; a session missing Home gets it re-injected; a dangling activeId
// falls back to Home. Storage itself (keyed by project path) is wired in the
// Stage 2 shell — these stay pure.

import { z } from 'zod';
import { HOME_TAB, initialSession, type SessionState, type TabDescriptor } from './session';

const persistedTabSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['home', 'level', 'sprite-doc', 'art-doc', 'palette-doc', 'tool']),
  title: z.string(),
});

const persistedSessionSchema = z.looseObject({
  tabs: z.array(persistedTabSchema),
  activeId: z.string(),
});

export function serializeSession(state: SessionState): string {
  return JSON.stringify({ tabs: state.tabs, activeId: state.activeId });
}

export function restoreSession(json: string): SessionState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return initialSession();
  }
  const res = persistedSessionSchema.safeParse(parsed);
  if (!res.success) return initialSession();

  let tabs: TabDescriptor[] = res.data.tabs;
  if (!tabs.some((t) => t.id === HOME_TAB.id)) tabs = [HOME_TAB, ...tabs];
  const activeId = tabs.some((t) => t.id === res.data.activeId) ? res.data.activeId : HOME_TAB.id;
  return { tabs, activeId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/shell/__tests__/session-persistence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/shell/session-persistence.ts src/core/shell/__tests__/session-persistence.test.ts
git commit -m "feat(shell): defensive session serialize/restore"
```

---

### Task 10: Full-suite verification

**Files:** none

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: PASS across the board — all new Stage 1 suites plus every pre-existing suite (nothing in this stage may regress the running app; the only touched existing file is `adapter.ts` + the two adapter capability literals + fixture additions from Task 3).

- [ ] **Step 2: Commit any stragglers and mark the stage**

```bash
git status --short   # should show nothing unexpected
git commit --allow-empty -m "chore(shell): stage 1 foundations complete (registries, session, save/undo, mapping)"
```

---

## Self-review (performed at authoring time)

- **Spec coverage (stage 1 scope):** registries §9 → Tasks 1–2; profile contract + capability lists §7 → Task 3; mapping layer schema §7 → Task 4; per-document undo §10 → Task 5; project-wide save §10 → Task 6; document/session model §3 → Tasks 7–8; session restore §10 → Task 9. Project Setup UI, tab strip UI, explorer, Home, ⌘K, and storage wiring are Stage 2 by design.
- **Placeholders:** none; every code step is complete.
- **Type consistency:** `FacetCapability` defined once (Task 2), imported by Task 3; `TabDescriptor`/`SessionState`/`HOME_TAB` defined in Task 7, consumed by Tasks 8–9; `EditHistory` reused as-is from `src/core/editing/history.ts`.
- **Known follow-on:** zod v4 API (`z.looseObject`/`z.strictObject`) is used per the installed `zod@^4.4.3`; if the compiler flags these helpers, the fallback spelling is `z.object({...}).passthrough()` / `.strict()` — adjust in place, tests stay identical.
