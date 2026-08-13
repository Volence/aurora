# Stage 4 Plan 1 — History Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the undo-bus + three-history arrangement with per-document undo stacks on a generalized `DocumentHistoryHub`, so every document (classic layout, classic zone art, aeon layout, aeon zone art, each sprite doc) owns exactly one stack and undo follows the focused facet.

**Architecture:** A minimal argument-free `UndoStack` interface lets three structurally different histories (aeon's command-based `EditHistory`, classic's snapshot history, sprite's snapshot history) live in one hub keyed by doc id. Aeon's `EditHistory` is adapted rather than rewritten, via a thin `BoundEditHistory` that closes over a level supplier. Classic's whole-doc snapshot splits into layout and art domains along the existing `DirtyDomains` keys. The sprite store becomes multi-document so two open sprite tabs stop sharing one history. With per-document stacks there are no siblings to invalidate, so the undo-bus, the sprite/level recency-merge coordinator, and the global edit-seq counter are all deleted.

**Tech Stack:** TypeScript, Zustand stores, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` §4 (and §2 for corrections to prior documents).

**Worktree:** `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage4`, branch `feature/ux-overhaul-stage4`.

---

## Scope note — why this plan is the history half only

Spec §8 stages the branch in six steps. Its Step 1 ("Foundations") bundles history work with facet-registry and profile work that has **no consumer** until Step 3. Building unused scaffolding is worse than building it where it is used, so this plan re-slices:

- **Plan 1 (this document):** all history work — spec §4 in full. Ends with the undo-bus deleted and all stacks on the hub. Self-contained, mergeable, user-testable.
- **Plan 2 (later):** facet-canvas registry, open-project selectors, profile `artTiers`/tool declarations, and the classic re-home (spec §3) — written after Plan 1 lands, against the interfaces it establishes.
- **Plans 3+:** shared Art facet; guards + debt + a11y; BG bridge + band editor.

Report this re-slicing when Plan 1 merges so the spec's §8 staging can be amended.

## Pre-flight: the commit-site audit is already done

Spec §4.3 requires auditing every `classicLevelStore.commit()` call site and assigning it a domain, warning that cross-domain sites would need compound commands. **That audit is complete and no cross-domain site exists.** All ten sites are single-domain:

| Call site | dirty patch | Domain |
|---|---|---|
| `classicSetLayoutCells` (`classicLevelStore.ts:509`) | `{fg}` or `{bg}` | **layout** |
| `classicSetObjects` (`:668`) | `{objects}` | **layout** |
| `classicSetStart` (`:758`) | `{start}` | **layout** |
| `classicEditChunkCells` (`:549`) | `{chunks}` | **art** |
| `classicAddChunk` (`:714`) | `{chunks}` | **art** |
| `classicEditBlock` (`:569`) | `{blocks}` | **art** |
| `classicAddBlock` (`:742`) | `{blocks}` | **art** |
| `classicEditTiles` (`:603`) | `{tiles}` | **art** |
| `classicSetPalette` (`:627`) | `{palette}` | **art** |
| `classicSetColind` (`:652`) | `{colind}` | **art** |

The nine `DirtyDomains` keys therefore partition cleanly:

```
LAYOUT_DOMAINS = ['fg', 'bg', 'objects', 'start']
ART_DOMAINS    = ['tiles', 'blocks', 'chunks', 'palette', 'colind']
```

Task 6 encodes this partition and Task 7 asserts every site routes as tabled above. **If an implementer finds an eleventh site or a site whose patch spans both lists, stop and report** — that invalidates the audit and needs a plan amendment, not an improvised compound command.

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/core/editing/undo-stack.ts` | The `UndoStack` interface. Nothing else. |
| `src/core/editing/bound-edit-history.ts` | `BoundEditHistory` — adapts `EditHistory` (which needs an `S4Level` argument) to the argument-free interface. |
| `src/core/editing/classic-domain-history.ts` | `ClassicLayoutSnapshot`, `ClassicArtSnapshot`, and the two `UndoStack` implementations over them. |
| `src/renderer/state/history-factories.ts` | Registers the per-prefix stack factories on the hub. The one place that knows which doc-id prefix maps to which store. |
| `src/core/editing/__tests__/bound-edit-history.test.ts` | |
| `src/core/editing/__tests__/classic-domain-history.test.ts` | |
| `src/renderer/state/__tests__/history-routing.test.ts` | |
| `src/renderer/state/__tests__/spriteStore-multidoc.test.ts` | |

**Modify:**

| File | Change |
|---|---|
| `src/core/editing/document-history.ts` | `Map<string, EditHistory>` → `Map<string, UndoStack>`; prefix factories; hub-level `onChange`. |
| `src/renderer/shell/tabs.ts` | Add `zoneArtDocId` / `parseZoneArtDocId`. |
| `src/renderer/state/editorStore.ts` | `activeHistory()` → `focusedHistory()`; drop undo-bus wiring; drop `historyVersion`. |
| `src/renderer/state/classicLevelStore.ts` | `commit()` → `commitLayout`/`commitArt`; drop the singleton `classicHistory`; drop `historyTick`. |
| `src/renderer/state/spriteStore.ts` | Multi-document: state keyed by doc ref; drop the `spriteHistory` singleton and `historyTick`. |
| `src/renderer/components/Toolbar.tsx` | Undo/redo controls read `focusedHistory()`; delete both `isSpriteDoc ? spriteMode* : …` branches. |
| `src/renderer/components/classic/ClassicProjectView.tsx` | Ctrl+Z/Y handler → `focusedHistory()`. |
| `src/renderer/workspace/facets/art-facet.tsx` | Local Ctrl+Z/Y rebind → `focusedHistory()`. |
| `src/renderer/shell/tab-activation.ts` | Call `hub.dispose(docId)` on tab close. |
| `src/renderer/state/project-runtime.ts` | `clearAll()` also clears registered factories on project close. |

**Delete:** `src/core/editing/undo-bus.ts`, `src/renderer/state/sprite-undo.ts`, `src/core/editing/edit-seq.ts`, and their tests.

**Commands:** run tests with `npx vitest run <path>`; whole suite `npm test`; types `npx tsc --noEmit`. Every Bash call must be prefixed with `cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage4 &&` (see "Worktree discipline" at the end).

---

### Task 1: The `UndoStack` interface

**Files:**
- Create: `src/core/editing/undo-stack.ts`

- [ ] **Step 1: Write the interface**

```ts
// The one shape every undo history presents to the hub and the UI. Deliberately
// ARGUMENT-FREE: aeon's EditHistory takes an S4Level on every call, classic and
// sprite histories read/write their stores. Each concrete stack binds its own
// target at construction, so the hub can hold all three without knowing any of
// their data models (spec §4.1).
export interface UndoStack {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
  clear(): void;
  /** Subscribe to stack changes. Returns an unsubscribe function. */
  onChange(cb: () => void): () => void;
}
```

There is no test for this task — it is a type-only declaration with no behavior. Task 2 exercises it.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/core/editing/undo-stack.ts
git commit -m "feat(editing): UndoStack interface for per-document histories"
```

---

### Task 2: `BoundEditHistory` — adapt aeon's `EditHistory`

`EditHistory.undo(level)` / `.redo(level)` / `.execute(cmd, level)` all take an `S4Level`. Rather than change that signature (many call sites, high regression risk on working aeon code), wrap it.

**Files:**
- Create: `src/core/editing/bound-edit-history.ts`
- Test: `src/core/editing/__tests__/bound-edit-history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { EditHistory } from '../history';
import { BoundEditHistory } from '../bound-edit-history';
import type { S4Level } from '../commands';

function levelWithOneSection(): S4Level {
  return {
    sections: [{
      tileGrid: { nametable: new Uint16Array(4) },
      objects: [], rings: [],
      collisionEdit: null, collisionEditB: null, bgLayoutRef: null,
    }],
  } as unknown as S4Level;
}

describe('BoundEditHistory', () => {
  it('undoes through the bound level without taking an argument', () => {
    const level = levelWithOneSection();
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => level);

    raw.execute(
      { type: 'set-tiles', sectionIndex: 0, entries: [{ index: 0, oldNt: 0, newNt: 42 }] } as never,
      level,
    );
    expect(level.sections[0].tileGrid.nametable[0]).toBe(42);
    expect(bound.canUndo).toBe(true);

    bound.undo();
    expect(level.sections[0].tileGrid.nametable[0]).toBe(0);
    expect(bound.canUndo).toBe(false);
    expect(bound.canRedo).toBe(true);

    bound.redo();
    expect(level.sections[0].tileGrid.nametable[0]).toBe(42);
  });

  it('is inert when the level supplier returns null', () => {
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => null);
    expect(() => bound.undo()).not.toThrow();
    expect(() => bound.redo()).not.toThrow();
  });

  it('forwards onChange subscriptions to the underlying history', () => {
    const level = levelWithOneSection();
    const raw = new EditHistory();
    const bound = new BoundEditHistory(raw, () => level);
    let fired = 0;
    const off = bound.onChange(() => { fired++; });

    raw.execute(
      { type: 'set-tiles', sectionIndex: 0, entries: [{ index: 0, oldNt: 0, newNt: 7 }] } as never,
      level,
    );
    expect(fired).toBe(1);

    off();
    bound.undo();
    expect(fired).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/editing/__tests__/bound-edit-history.test.ts`
Expected: FAIL — `Failed to resolve import "../bound-edit-history"`.

- [ ] **Step 3: Write the implementation**

```ts
// Adapts EditHistory (command model, needs an S4Level on every call) to the
// argument-free UndoStack the hub holds. The level supplier is re-read on every
// call rather than captured, because the store swaps level objects on act load.
//
// `raw` is the escape hatch for command EXECUTION: executeCommand still needs
// EditHistory.execute(cmd, level), which is not part of the UndoStack contract.

import type { AnyCommand, S4Level } from './commands';
import type { EditHistory } from './history';
import type { UndoStack } from './undo-stack';

export class BoundEditHistory implements UndoStack {
  constructor(
    private readonly history: EditHistory,
    private readonly getLevel: () => S4Level | null,
  ) {}

  get canUndo(): boolean { return this.history.canUndo; }
  get canRedo(): boolean { return this.history.canRedo; }

  undo(): void {
    const level = this.getLevel();
    if (level) this.history.undo(level);
  }

  redo(): void {
    const level = this.getLevel();
    if (level) this.history.redo(level);
  }

  clear(): void { this.history.clear(); }

  onChange(cb: () => void): () => void { return this.history.onChange(cb); }

  /** Command execution needs the raw history; undo/redo must not. */
  execute(command: AnyCommand): void {
    const level = this.getLevel();
    if (level) this.history.execute(command, level);
  }

  get raw(): EditHistory { return this.history; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/editing/__tests__/bound-edit-history.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/bound-edit-history.ts src/core/editing/__tests__/bound-edit-history.test.ts
git commit -m "feat(editing): BoundEditHistory adapts EditHistory to UndoStack"
```

---

### Task 3: Generalize `DocumentHistoryHub`

**Files:**
- Modify: `src/core/editing/document-history.ts` (whole file)
- Test: `src/core/editing/__tests__/document-history.test.ts` (rewrite)

- [ ] **Step 1: Write the failing test**

Replace the file's contents:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentHistoryHub } from '../document-history';
import type { UndoStack } from '../undo-stack';

function fakeStack(label: string, log: string[]): UndoStack {
  let listeners: Array<() => void> = [];
  return {
    canUndo: true,
    canRedo: false,
    undo() { log.push(`${label}:undo`); listeners.forEach((l) => l()); },
    redo() { log.push(`${label}:redo`); },
    clear() { log.push(`${label}:clear`); },
    onChange(cb) {
      listeners.push(cb);
      return () => { listeners = listeners.filter((l) => l !== cb); };
    },
  };
}

describe('DocumentHistoryHub', () => {
  let hub: DocumentHistoryHub;
  let log: string[];

  beforeEach(() => {
    hub = new DocumentHistoryHub();
    log = [];
  });

  it('routes a doc id to the factory whose prefix matches', () => {
    hub.registerFactory('level:', (id) => fakeStack(`layout(${id})`, log));
    hub.registerFactory('zoneart:', (id) => fakeStack(`art(${id})`, log));

    hub.historyFor('level:ghz:1').undo();
    hub.historyFor('zoneart:ghz').undo();

    expect(log).toEqual(['layout(level:ghz:1):undo', 'art(zoneart:ghz):undo']);
  });

  it('prefers the longest matching prefix', () => {
    hub.registerFactory('doc:', (id) => fakeStack(`generic(${id})`, log));
    hub.registerFactory('doc:sprite:', (id) => fakeStack(`sprite(${id})`, log));

    hub.historyFor('doc:sprite:s1:18').undo();

    expect(log).toEqual(['sprite(doc:sprite:s1:18):undo']);
  });

  it('returns the same stack instance for the same doc id', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    expect(hub.historyFor('level:ghz:1')).toBe(hub.historyFor('level:ghz:1'));
  });

  it('throws on an unregistered prefix rather than silently no-oping', () => {
    expect(() => hub.historyFor('mystery:1')).toThrow(/no undo-stack factory/i);
  });

  it('keeps documents isolated', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1').undo();
    expect(log).toEqual(['level:ghz:1:undo']);
  });

  it('dispose clears and drops one document', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(true);

    hub.dispose('level:ghz:1');
    expect(log).toEqual(['level:ghz:1:clear']);
    expect(hub.has('level:ghz:1')).toBe(false);
  });

  it('clearAll clears and drops every document', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    hub.historyFor('level:ghz:1');
    hub.historyFor('level:ghz:2');

    hub.clearAll();
    expect(log).toEqual(['level:ghz:1:clear', 'level:ghz:2:clear']);
    expect(hub.has('level:ghz:1')).toBe(false);
    expect(hub.has('level:ghz:2')).toBe(false);
  });

  it('re-emits any stack change as a hub-level change', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    let fired = 0;
    hub.onChange(() => { fired++; });

    hub.historyFor('level:ghz:1').undo();
    expect(fired).toBe(1);

    hub.historyFor('level:ghz:2').undo();
    expect(fired).toBe(2);
  });

  it('stops re-emitting from a disposed stack', () => {
    hub.registerFactory('level:', (id) => fakeStack(id, log));
    let fired = 0;
    hub.onChange(() => { fired++; });

    const stack = hub.historyFor('level:ghz:1');
    hub.dispose('level:ghz:1');
    stack.undo();

    expect(fired).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/editing/__tests__/document-history.test.ts`
Expected: FAIL — `hub.registerFactory is not a function`.

- [ ] **Step 3: Write the implementation**

Replace `src/core/editing/document-history.ts` entirely:

```ts
// Per-document undo (spec §10, §4.1): every document owns one undo stack; undo
// and redo follow the focused document. The hub is data-model agnostic — it
// holds anything implementing UndoStack, so aeon's command history, classic's
// two domain snapshot histories and each sprite doc's snapshot history all live
// here. Concrete stacks are built by per-prefix factories registered at startup
// (see renderer/state/history-factories.ts), which is the only place that knows
// which doc-id prefix maps to which store.
//
// Doc ids are the session tab ids plus one synthetic kind:
//   level:<zone>:<act>        layout doc
//   zoneart:<zone>            zone art doc (no tab of its own; see tabs.ts)
//   doc:sprite:<engine>:<ref> sprite doc

import type { UndoStack } from './undo-stack';

export type UndoStackFactory = (docId: string) => UndoStack;

export class DocumentHistoryHub {
  private stacks = new Map<string, UndoStack>();
  private unsubs = new Map<string, () => void>();
  private factories: Array<{ prefix: string; make: UndoStackFactory }> = [];
  private listeners: Array<() => void> = [];

  /** Register the factory for a doc-id prefix. Longest matching prefix wins. */
  registerFactory(prefix: string, make: UndoStackFactory): void {
    const existing = this.factories.findIndex((f) => f.prefix === prefix);
    if (existing >= 0) this.factories[existing] = { prefix, make };
    else this.factories.push({ prefix, make });
    this.factories.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /** Get-or-create the stack for a document. */
  historyFor(docId: string): UndoStack {
    const existing = this.stacks.get(docId);
    if (existing) return existing;

    const factory = this.factories.find((f) => docId.startsWith(f.prefix));
    if (!factory) throw new Error(`No undo-stack factory registered for doc id '${docId}'`);

    const stack = factory.make(docId);
    this.stacks.set(docId, stack);
    this.unsubs.set(docId, stack.onChange(() => this.notify()));
    return stack;
  }

  has(docId: string): boolean { return this.stacks.has(docId); }

  /** Drop a document's stack entirely (tab closed). */
  dispose(docId: string): void {
    this.unsubs.get(docId)?.();
    this.unsubs.delete(docId);
    this.stacks.get(docId)?.clear();
    this.stacks.delete(docId);
  }

  /** Project close: drop every stack. Factories survive (they are startup wiring). */
  clearAll(): void {
    for (const docId of [...this.stacks.keys()]) this.dispose(docId);
  }

  /** Subscribe to "some stack changed". Returns an unsubscribe function. */
  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  /** Test support: forget registered factories so tests don't leak into each other. */
  clearFactories(): void { this.factories = []; }

  private notify(): void { for (const l of this.listeners) l(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/editing/__tests__/document-history.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/document-history.ts src/core/editing/__tests__/document-history.test.ts
git commit -m "feat(editing): hub holds any UndoStack via per-prefix factories"
```

Note: `npx tsc --noEmit` will now FAIL in `editorStore.ts` (it calls `historyFor(...).execute(cmd, level)` expecting an `EditHistory`). That is expected and is fixed in Task 9. Do not patch it here.

---

### Task 4: Zone-art doc ids

**Files:**
- Modify: `src/renderer/shell/tabs.ts`
- Test: `src/renderer/shell/__tests__/tabs.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Append to (or create) `src/renderer/shell/__tests__/tabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { zoneArtDocId, parseZoneArtDocId } from '../tabs';

describe('zone-art doc ids', () => {
  it('builds an id from a zone', () => {
    expect(zoneArtDocId('ghz')).toBe('zoneart:ghz');
  });

  it('round-trips', () => {
    expect(parseZoneArtDocId(zoneArtDocId('ojz'))).toEqual({ zone: 'ojz' });
  });

  it('rejects other doc kinds', () => {
    expect(parseZoneArtDocId('level:ghz:1')).toBeNull();
    expect(parseZoneArtDocId('zoneart:')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/shell/__tests__/tabs.test.ts`
Expected: FAIL — `zoneArtDocId is not exported`.

- [ ] **Step 3: Write the implementation**

Append to `src/renderer/shell/tabs.ts`:

```ts
// Zone-art doc ids — 'zoneart:<zone>'. Unlike the others this is NOT a tab id:
// zone art (chunks, blocks, tiles, palettes) is edited from act-scoped tabs but
// is zone-scoped data, so it owns its own undo document (spec §4.2). One zone's
// art stack is shared by every act tab of that zone, which is the point: a
// palette edit made from act 1 is undoable from act 2.
export function zoneArtDocId(zone: string): string {
  return `zoneart:${zone}`;
}

export function parseZoneArtDocId(id: string): { zone: string } | null {
  if (!id.startsWith('zoneart:')) return null;
  const zone = id.slice('zoneart:'.length);
  return zone.length > 0 ? { zone } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/shell/__tests__/tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/tabs.ts src/renderer/shell/__tests__/tabs.test.ts
git commit -m "feat(shell): zone-art doc ids for zone-scoped undo documents"
```

---

### Task 5: Split `ClassicSnapshot` into layout and art domains

**Files:**
- Create: `src/core/editing/classic-domain-history.ts`
- Test: `src/core/editing/__tests__/classic-domain-history.test.ts`

The two histories are structurally identical to today's `ClassicHistory` (`src/core/editing/classic-history.ts`) minus the edit-seq stamps and `clearRedo`, which per-document stacks make unnecessary. They differ only in the snapshot slice they own.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  ClassicLayoutHistory, ClassicArtHistory,
  LAYOUT_DOMAINS, ART_DOMAINS,
  type ClassicLayoutSnapshot, type ClassicArtSnapshot,
} from '../classic-domain-history';

function layoutSnap(marker: number): ClassicLayoutSnapshot {
  return {
    fg: { width: 2, height: 2, cells: new Uint8Array([marker, 0, 0, 0]) },
    bg: { width: 2, height: 2, cells: new Uint8Array(4) },
    objects: [],
    start: { x: marker, y: 0 },
    dirty: {},
  } as unknown as ClassicLayoutSnapshot;
}

function artSnap(marker: number): ClassicArtSnapshot {
  return {
    chunks: [], blocks: [],
    tiles: new Uint8Array([marker]),
    palettes: [],
    colind: new Uint8Array(0),
    chunkVersions: new Map([[1, marker]]),
    chunkEpoch: marker,
    dirty: {},
  } as unknown as ClassicArtSnapshot;
}

describe('domain partition', () => {
  it('covers all nine DirtyDomains keys with no overlap', () => {
    const all = [...LAYOUT_DOMAINS, ...ART_DOMAINS];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(
      new Set(['fg', 'bg', 'objects', 'start', 'tiles', 'blocks', 'chunks', 'palette', 'colind']),
    );
  });
});

describe('ClassicLayoutHistory', () => {
  it('undoes and redoes through the bound accessors', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });

    h.record(live);              // BEFORE the edit
    live = layoutSnap(2);        // the store applies the edit
    expect(h.canUndo).toBe(true);

    h.undo();
    expect(live.start.x).toBe(1);
    expect(h.canRedo).toBe(true);

    h.redo();
    expect(live.start.x).toBe(2);
  });

  it('a new record wipes the redo stack', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    h.record(live); live = layoutSnap(2);
    h.undo();
    expect(h.canRedo).toBe(true);

    h.record(live); live = layoutSnap(3);
    expect(h.canRedo).toBe(false);
  });

  it('notifies subscribers on record, undo and redo', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    let fired = 0;
    const off = h.onChange(() => { fired++; });

    h.record(live); live = layoutSnap(2);
    h.undo();
    h.redo();
    expect(fired).toBe(3);

    off();
    h.undo();
    expect(fired).toBe(3);
  });

  it('clear empties both stacks', () => {
    let live = layoutSnap(1);
    const h = new ClassicLayoutHistory(() => live, (s) => { live = s; });
    h.record(live);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

describe('ClassicArtHistory', () => {
  it('restores the chunk-version triple together', () => {
    let live = artSnap(1);
    const h = new ClassicArtHistory(() => live, (s) => { live = s; });

    h.record(live);
    live = artSnap(9);

    h.undo();
    expect(live.tiles[0]).toBe(1);
    expect(live.chunkEpoch).toBe(1);
    expect(live.chunkVersions.get(1)).toBe(1);
  });

  it('clones the mutable containers so restore is not aliased', () => {
    let live = artSnap(1);
    const h = new ClassicArtHistory(() => live, (s) => { live = s; });
    const original = live;
    h.record(live);
    live = artSnap(9);
    h.undo();
    expect(live.chunkVersions).not.toBe(original.chunkVersions);
  });
});

describe('document isolation', () => {
  it('an art edit does not touch a layout stack', () => {
    let liveL = layoutSnap(1);
    let liveA = artSnap(1);
    const layout = new ClassicLayoutHistory(() => liveL, (s) => { liveL = s; });
    const art = new ClassicArtHistory(() => liveA, (s) => { liveA = s; });

    layout.record(liveL); liveL = layoutSnap(2);
    layout.undo();
    expect(layout.canRedo).toBe(true);

    art.record(liveA); liveA = artSnap(2);   // a new edit on a DIFFERENT document
    expect(layout.canRedo).toBe(true);        // must NOT invalidate layout's redo
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/editing/__tests__/classic-domain-history.test.ts`
Expected: FAIL — `Failed to resolve import "../classic-domain-history"`.

- [ ] **Step 3: Write the implementation**

```ts
// Classic undo, split by document domain (spec §4.3). ClassicHistory used to
// snapshot the whole LevelDoc, which made per-document undo impossible: a
// palette edit and a layout stamp landed on one stack. The audit of all ten
// commit() sites found every one single-domain, so DirtyDomains' nine keys
// partition cleanly and each domain gets its own stack.
//
// Snapshots hold REFERENCES to the LevelDoc slices they own — the store treats
// the doc immutably (each command produces a new doc sharing unchanged
// sub-arrays), so this is cheap. Only the small mutable containers (the dirty
// object, the chunkVersions map) are cloned.
//
// No edit-seq stamps and no clearRedo: with per-document stacks there are no
// sibling stacks to invalidate, which is what retires the undo-bus.

import type { BlockDef, ChunkDef256, LayoutGrid } from '../level-classic/model';
import type { S1ObjectEntry } from '../level-classic/model';
import type { DirtyDomains } from '../project/adapter';
import type { UndoStack } from './undo-stack';

export const LAYOUT_DOMAINS = ['fg', 'bg', 'objects', 'start'] as const;
export const ART_DOMAINS = ['tiles', 'blocks', 'chunks', 'palette', 'colind'] as const;

export interface ClassicLayoutSnapshot {
  fg: LayoutGrid;
  bg: LayoutGrid;
  objects: S1ObjectEntry[];
  start: { x: number; y: number };
  dirty: DirtyDomains;
}

export interface ClassicArtSnapshot {
  chunks: ChunkDef256[];
  blocks: BlockDef[];
  tiles: Uint8Array;
  palettes: Uint16Array[];
  colind: Uint8Array;
  chunkVersions: Map<number, number>;
  chunkEpoch: number;
  dirty: DirtyDomains;
}

const MAX_DEPTH = 200;

/**
 * Shared machinery for both classic domain stacks. `read` returns the live slice,
 * `write` installs a restored one; the store supplies both, which is what makes
 * undo/redo argument-free.
 */
abstract class ClassicDomainHistory<S> implements UndoStack {
  private undoStack: S[] = [];
  private redoStack: S[] = [];
  private listeners: Array<() => void> = [];

  constructor(
    protected readonly read: () => S,
    protected readonly write: (snapshot: S) => void,
  ) {}

  protected abstract clone(s: S): S;

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** Record the BEFORE snapshot of an edit. The store applies the edit itself. */
  record(before: S): void {
    this.undoStack.push(this.clone(before));
    if (this.undoStack.length > MAX_DEPTH) this.undoStack.shift();
    this.redoStack = [];
    this.notify();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.clone(this.read()));
    this.write(this.clone(prev));
    this.notify();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.clone(this.read()));
    this.write(this.clone(next));
    this.notify();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notify();
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  private notify(): void { for (const l of this.listeners) l(); }
}

export class ClassicLayoutHistory extends ClassicDomainHistory<ClassicLayoutSnapshot> {
  protected clone(s: ClassicLayoutSnapshot): ClassicLayoutSnapshot {
    return {
      fg: s.fg,               // immutable by convention
      bg: s.bg,
      objects: s.objects,
      start: { ...s.start },
      dirty: { ...s.dirty },
    };
  }
}

export class ClassicArtHistory extends ClassicDomainHistory<ClassicArtSnapshot> {
  protected clone(s: ClassicArtSnapshot): ClassicArtSnapshot {
    return {
      chunks: s.chunks,       // immutable by convention
      blocks: s.blocks,
      tiles: s.tiles,
      palettes: s.palettes,
      colind: s.colind,
      chunkVersions: new Map(s.chunkVersions),
      chunkEpoch: s.chunkEpoch,
      dirty: { ...s.dirty },
    };
  }
}
```

If any imported type name (`LayoutGrid`, `ChunkDef256`, `BlockDef`, `S1ObjectEntry`) does not exist under that name in `src/core/level-classic/model.ts`, use the actual exported name — do not invent a local alias.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/editing/__tests__/classic-domain-history.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/classic-domain-history.ts src/core/editing/__tests__/classic-domain-history.test.ts
git commit -m "feat(editing): split classic undo into layout and art domain stacks"
```

---

### Task 6: Route `classicLevelStore` commits to the two domain stacks

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts`
- Test: `src/renderer/state/__tests__/history-routing.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';
import {
  useClassicLevelStore, classicSetStart, classicSetPalette,
} from '../classicLevelStore';
import { layoutDocIdForCurrentAct, zoneArtDocIdForCurrentZone } from '../classicLevelStore';

// Loads a minimal classic doc into the store. Replace the body with whatever the
// store's existing test helpers use (see classicLevelStore.test.ts) — do not
// hand-roll a second fixture builder.
async function loadFixtureAct(): Promise<void> {
  const { loadClassicFixture } = await import('./helpers/classic-fixture');
  await loadClassicFixture();
}

describe('classic commit routing', () => {
  beforeEach(async () => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    await loadFixtureAct();
  });

  it('a start-position edit lands on the LAYOUT stack only', () => {
    const layout = documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetStart(64, 64);

    expect(layout.canUndo).toBe(true);
    expect(art.canUndo).toBe(false);
  });

  it('a palette edit lands on the ART stack only', () => {
    const layout = documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetPalette(1, new Uint16Array(16));

    expect(art.canUndo).toBe(true);
    expect(layout.canUndo).toBe(false);
  });

  it('undoing a layout edit does not disturb the art stack redo', () => {
    const layout = documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
    const art = documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

    classicSetPalette(1, new Uint16Array(16));
    art.undo();
    expect(art.canRedo).toBe(true);

    classicSetStart(96, 96);          // a new edit on a DIFFERENT document
    expect(art.canRedo).toBe(true);   // must survive — this is what killed the undo-bus
  });

  it('a start-position undo restores the previous start', () => {
    const before = useClassicLevelStore.getState().doc!.start;
    classicSetStart(128, 128);
    documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!).undo();
    expect(useClassicLevelStore.getState().doc!.start).toEqual(before);
  });
});
```

**Before writing this test**, read `src/renderer/state/__tests__/classicLevelStore.test.ts` and reuse its existing fixture-loading helper. If it builds the doc inline rather than via a helper, extract that into `src/renderer/state/__tests__/helpers/classic-fixture.ts` as a preliminary commit and have both files import it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: FAIL — `registerHistoryFactories` and `layoutDocIdForCurrentAct` are not exported.

- [ ] **Step 3: Split `commit()` in the store**

In `src/renderer/state/classicLevelStore.ts`:

Delete the `classicHistory` singleton (`:210`), its `registerRedoClearer` call (`:214`), the `invalidateSiblingRedos` call inside `commit()`, the `historyTick` field, and the `classicCanUndo`/`classicCanRedo` exports (`:381-382`) — the hub answers those now.

Replace `currentSnapshot`/`applySnapshot`/`commit` with domain-scoped equivalents:

```ts
import { documentHistoryHub } from './history-hub';
import { zoneArtDocId } from '../shell/tabs';
import type {
  ClassicLayoutSnapshot, ClassicArtSnapshot,
} from '../../core/editing/classic-domain-history';

/** The layout doc id for the act currently loaded in this store, or null. */
export function layoutDocIdForCurrentAct(): string | null {
  const ref = useClassicLevelStore.getState().ref;
  return ref ? `level:${ref.zone}:${ref.act}` : null;
}

/** The zone-art doc id for the zone currently loaded in this store, or null. */
export function zoneArtDocIdForCurrentZone(): string | null {
  const ref = useClassicLevelStore.getState().ref;
  return ref ? zoneArtDocId(ref.zone) : null;
}

export function readLayoutSnapshot(): ClassicLayoutSnapshot {
  const s = useClassicLevelStore.getState();
  const doc = s.doc!;
  return { fg: doc.fg, bg: doc.bg, objects: doc.objects, start: doc.start, dirty: s.dirty };
}

export function writeLayoutSnapshot(snap: ClassicLayoutSnapshot): void {
  useClassicLevelStore.setState((s) => ({
    doc: { ...s.doc!, fg: snap.fg, bg: snap.bg, objects: snap.objects, start: snap.start },
    dirty: snap.dirty,
  }));
}

export function readArtSnapshot(): ClassicArtSnapshot {
  const s = useClassicLevelStore.getState();
  const doc = s.doc!;
  return {
    chunks: doc.chunks, blocks: doc.blocks, tiles: doc.tiles,
    palettes: doc.palettes, colind: doc.collision.colind,
    chunkVersions: s.chunkVersions, chunkEpoch: s.chunkEpoch, dirty: s.dirty,
  };
}

export function writeArtSnapshot(snap: ClassicArtSnapshot): void {
  useClassicLevelStore.setState((s) => ({
    doc: {
      ...s.doc!,
      chunks: snap.chunks, blocks: snap.blocks, tiles: snap.tiles, palettes: snap.palettes,
      collision: { ...s.doc!.collision, colind: snap.colind },
    },
    dirty: snap.dirty,
    chunkVersions: snap.chunkVersions,
    chunkEpoch: snap.chunkEpoch,
  }));
}

function commitLayout(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  const id = layoutDocIdForCurrentAct();
  if (id) (documentHistoryHub.historyFor(id) as ClassicLayoutHistory).record(readLayoutSnapshot());
  applyCommit(newDoc, dirtyPatch, ve);
}

function commitArt(newDoc: LevelDoc, dirtyPatch: DirtyDomains, ve: VersionEffect): void {
  const id = zoneArtDocIdForCurrentZone();
  if (id) (documentHistoryHub.historyFor(id) as ClassicArtHistory).record(readArtSnapshot());
  applyCommit(newDoc, dirtyPatch, ve);
}
```

`applyCommit` is the existing body of `commit()` from the `set(...)` call onward — the state application, unchanged, minus the history `record` and the `invalidateSiblingRedos` line. Extract it; do not duplicate it.

Then change each of the ten call sites to the domain from the audit table:

| Line | Call becomes |
|---|---|
| `:509` `classicSetLayoutCells` | `commitLayout(newDoc, plane === 'bg' ? { bg: true } : { fg: true }, { kind: 'none' })` |
| `:549` `classicEditChunkCells` | `commitArt(newDoc, { chunks: true }, { kind: 'chunk', id: chunkId })` |
| `:569` `classicEditBlock` | `commitArt(newDoc, { blocks: true }, { kind: 'all' })` |
| `:603` `classicEditTiles` | `commitArt(newDoc, { tiles: true }, { kind: 'all' })` |
| `:627` `classicSetPalette` | `commitArt(newDoc, { palette: true }, { kind: 'all' })` |
| `:652` `classicSetColind` | `commitArt(newDoc, { colind: true }, { kind: 'none' })` |
| `:668` `classicSetObjects` | `commitLayout(newDoc, { objects: true }, { kind: 'none' })` |
| `:714` `classicAddChunk` | `commitArt(newDoc, { chunks: true }, { kind: 'chunk', id: newEngineId })` |
| `:742` `classicAddBlock` | `commitArt(newDoc, { blocks: true }, { kind: 'none' })` |
| `:758` `classicSetStart` | `commitLayout(newDoc, { start: true }, { kind: 'none' })` |

- [ ] **Step 4: Register the factories**

Create `src/renderer/state/history-factories.ts`:

```ts
// The ONE place that knows which doc-id prefix maps to which store. Called once
// at renderer startup and again after a project close (project-runtime clears
// stacks but not factories, so this is idempotent by way of the hub's
// register-or-replace semantics).

import { documentHistoryHub } from './history-hub';
import { ClassicLayoutHistory, ClassicArtHistory } from '../../core/editing/classic-domain-history';
import {
  readLayoutSnapshot, writeLayoutSnapshot, readArtSnapshot, writeArtSnapshot,
} from './classicLevelStore';

export function registerHistoryFactories(): void {
  documentHistoryHub.registerFactory(
    'level:',
    () => new ClassicLayoutHistory(readLayoutSnapshot, writeLayoutSnapshot),
  );
  documentHistoryHub.registerFactory(
    'zoneart:',
    () => new ClassicArtHistory(readArtSnapshot, writeArtSnapshot),
  );
}
```

Aeon's `level:`/`zoneart:` factories and the sprite factory are added in Tasks 8 and 9; this task registers the classic ones only. **Task 9 must replace the `level:` and `zoneart:` factories with ones that dispatch on which project store is open** — a classic factory registered unconditionally would hijack aeon's level docs. Do not ship Task 6 to the user without Task 9.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the classic store's existing tests**

Run: `npx vitest run src/renderer/state/__tests__/classicLevelStore.test.ts`
Expected: failures only where tests assert on the deleted `historyTick` / `classicCanUndo` / `classicHistory`. Update those to read the hub stacks. Any OTHER failure means the commit split changed behavior — stop and investigate rather than editing the assertion.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/classicLevelStore.ts src/renderer/state/history-factories.ts \
        src/renderer/state/__tests__/history-routing.test.ts \
        src/renderer/state/__tests__/classicLevelStore.test.ts
git commit -m "feat(classic): route commits to per-domain undo stacks on the hub"
```

---

### Task 7: Make `spriteStore` multi-document

This is the largest task. `SpriteState` currently holds one working document (`frames`, `currentIndex`, `selection`, `paletteMode`, `zoneLine`, `standalonePalette`, `steps`, `s1ArtSource`, `unsavedEdits`) plus view state (`tool`, `zoom`, `clipboard`). Only the **document** fields become per-doc; view state stays global (one visible editor at a time).

**Files:**
- Modify: `src/renderer/state/spriteStore.ts`
- Test: `src/renderer/state/__tests__/spriteStore-multidoc.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSpriteStore, openSpriteDoc, closeSpriteDoc, activateSpriteDoc } from '../spriteStore';
import { documentHistoryHub } from '../history-hub';
import { registerHistoryFactories } from '../history-factories';

const A = 'doc:sprite:s1:18';
const B = 'doc:sprite:s1:24';

describe('sprite multi-document', () => {
  beforeEach(() => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    useSpriteStore.getState().closeAll();
  });

  it('keeps two docs independent', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 3);

    openSpriteDoc(B, { width: 8, height: 8 });
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(0);

    activateSpriteDoc(A);
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(3);
  });

  it('gives each doc its own undo stack', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 3);

    openSpriteDoc(B, { width: 8, height: 8 });
    expect(documentHistoryHub.historyFor(B).canUndo).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(true);
  });

  it('undo in one doc does not affect the other', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 3);
    openSpriteDoc(B, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 5);

    documentHistoryHub.historyFor(B).undo();
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(0);

    activateSpriteDoc(A);
    expect(useSpriteStore.getState().activeFrames()[0].data[0]).toBe(3);
  });

  it('tracks unsavedEdits per document', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    openSpriteDoc(B, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 5);   // dirties B only

    expect(useSpriteStore.getState().isDirty(B)).toBe(true);
    expect(useSpriteStore.getState().isDirty(A)).toBe(false);
  });

  it('closing a doc drops its state and its history', () => {
    openSpriteDoc(A, { width: 8, height: 8 });
    useSpriteStore.getState().setPixel(0, 0, 3);

    closeSpriteDoc(A);
    expect(useSpriteStore.getState().isOpen(A)).toBe(false);
    expect(documentHistoryHub.has(A)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/spriteStore-multidoc.test.ts`
Expected: FAIL — `openSpriteDoc is not exported`.

- [ ] **Step 3: Restructure the store**

Extract the document fields into a `SpriteDoc` and key them:

```ts
/** The per-document slice. Everything undo restores lives here (spec §4.4). */
export interface SpriteDoc {
  frames: PixelBuffer[];
  currentIndex: number;
  selection: { x: number; y: number; w: number; h: number } | null;
  paletteMode: SpritePaletteMode;
  zoneLine: number;
  standalonePalette: Color[];
  steps: AnimStep[];
  s1ArtSource: S1ArtSource | null;
  unsavedEdits: boolean;
}

interface SpriteState {
  docs: Map<string, SpriteDoc>;
  activeDocId: string | null;
  // View state stays global — one sprite editor is visible at a time.
  tool: SpriteTool;
  zoom: number;
  clipboard: PixelBuffer | null;
  // …existing view fields…
}
```

Rules for the rewrite:

1. Every existing action that reads or writes a document field now goes through the active doc. Add one private helper and route all of them through it, rather than repeating the lookup:
   ```ts
   function mutateActiveDoc(fn: (doc: SpriteDoc) => SpriteDoc): void {
     useSpriteStore.setState((s) => {
       if (!s.activeDocId) return s;
       const doc = s.docs.get(s.activeDocId);
       if (!doc) return s;
       const docs = new Map(s.docs);
       docs.set(s.activeDocId, fn(doc));
       return { docs };
     });
   }
   ```
2. `recordEdit(s)` (`:181`) — which today calls `spriteHistory.record(snap(s))`, `invalidateSiblingRedos`, and sets `unsavedEdits` — becomes: record onto `documentHistoryHub.historyFor(activeDocId)`, set that doc's `unsavedEdits`, and **no bus call**.
3. Delete the `spriteHistory` singleton (`:168-169`), `clearSpriteRedo` (`:173`), the `registerRedoClearer` call, every `historyTick` read and write, and the store's own `undo`/`redo` actions (`:336`, `:341`) — the hub's stack owns them now.
4. Add the exported doc lifecycle:
   ```ts
   export function openSpriteDoc(docId: string, size: { width: number; height: number }): void
   export function activateSpriteDoc(docId: string): void
   export function closeSpriteDoc(docId: string): void   // also documentHistoryHub.dispose(docId)
   ```
   plus selectors `activeFrames()`, `isOpen(docId)`, `isDirty(docId)`, and `closeAll()`.
5. Add the sprite factory to `registerHistoryFactories()`:
   ```ts
   documentHistoryHub.registerFactory(
     'doc:sprite:',
     (docId) => new SpriteDocHistory(
       () => readSpriteSnapshot(docId),
       (snap) => writeSpriteSnapshot(docId, snap),
     ),
   );
   ```
   `SpriteDocHistory` is `ClassicDomainHistory`'s sibling over `SpriteSnapshot`. Rather than a third near-identical class, **promote the abstract base out of `classic-domain-history.ts` into `src/core/editing/snapshot-history.ts`** and have all three extend it. Move it in this task; update the two classic imports.

   Note the read/write closures take `docId`, not "active" — undo must work on a doc that is not currently active (a background tab's dirty state can be undone from the tab-close confirm).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/spriteStore-multidoc.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the sprite store's existing tests**

Run: `npx vitest run src/renderer/state/__tests__/`
Expected: `sprite-undo` tests fail (deleted in Task 10 — leave them failing for now, note which). Other sprite tests should pass once updated to open a doc before editing.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/spriteStore.ts src/renderer/state/history-factories.ts \
        src/core/editing/snapshot-history.ts src/core/editing/classic-domain-history.ts \
        src/renderer/state/__tests__/spriteStore-multidoc.test.ts
git commit -m "feat(sprite): multi-document store with per-doc undo stacks"
```

---

### Task 8: Aeon factories and `focusedHistory()`

**Files:**
- Modify: `src/renderer/state/editorStore.ts`, `src/renderer/state/history-factories.ts`
- Test: extend `src/renderer/state/__tests__/history-routing.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/state/__tests__/history-routing.test.ts`:

```ts
import { focusedHistory } from '../editorStore';
import { useSessionStore } from '../sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';

describe('focusedHistory', () => {
  beforeEach(async () => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    await loadFixtureAct();
  });

  it('returns the LAYOUT doc stack when a map facet is focused', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'layout');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('level:ghz:1'));
  });

  it('returns the ZONE-ART doc stack when the art facet is focused', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'art');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('zoneart:ghz'));
  });

  it('returns the ZONE-ART doc stack for the palette facet too', () => {
    useSessionStore.setState({ activeId: 'level:ghz:1' });
    useWorkspaceStore.getState().setFacet('level:ghz:1', 'palette');
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('zoneart:ghz'));
  });

  it('returns the SPRITE doc stack when a sprite tab is active', () => {
    useSessionStore.setState({ activeId: 'doc:sprite:s1:18' });
    expect(focusedHistory()).toBe(documentHistoryHub.historyFor('doc:sprite:s1:18'));
  });

  it('returns null when no document is focused', () => {
    useSessionStore.setState({ activeId: 'tool:project-setup' });
    expect(focusedHistory()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: FAIL — `focusedHistory is not exported`.

- [ ] **Step 3: Implement `focusedHistory` and engine-dispatching factories**

In `src/renderer/state/editorStore.ts`, delete `activeHistory()` (`:152`), `clearLevelRedo` + `registerRedoClearer` (`:163-164`), the `invalidateSiblingRedos` call in `executeCommand` (`:285`), the undo-bus import (`:7`), the `historyVersion` field (`:86`, `:171`) and `bumpVersion` (`:227`). Add:

```ts
import { parseLevelTabId, parseSpriteDocTabId, zoneArtDocId } from '../shell/tabs';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import type { UndoStack } from '../../core/editing/undo-stack';

/** Facets whose edits belong to the ZONE-ART document rather than the act's layout. */
const ZONE_ART_FACETS = new Set(['art', 'palette']);

/**
 * The undo stack for whatever the user is currently looking at (spec §4.2).
 * Replaces activeHistory(), which keyed off projectStore's current act and so
 * was aeon-coupled and blind to the focused facet.
 */
export function focusedHistory(): UndoStack | null {
  const activeId = useSessionStore.getState().activeId;
  if (!activeId) return null;

  if (parseSpriteDocTabId(activeId)) return documentHistoryHub.historyFor(activeId);

  const level = parseLevelTabId(activeId);
  if (!level) return null;

  const facet = useWorkspaceStore.getState().facetFor(activeId);
  return documentHistoryHub.historyFor(
    facet && ZONE_ART_FACETS.has(facet) ? zoneArtDocId(level.zone) : activeId,
  );
}
```

`executeCommand` keeps using the aeon history directly, but through the bound stack:

```ts
export function executeCommand(command: AnyCommand, level: S4Level): void {
  const activeId = useSessionStore.getState().activeId;
  const docId = /* same resolution as focusedHistory */;
  const stack = documentHistoryHub.historyFor(docId);
  (stack as BoundEditHistory).raw.execute(command, level);
}
```

Extract the doc-id resolution into a shared `focusedDocId(): string | null` so `focusedHistory` and `executeCommand` cannot drift apart.

In `history-factories.ts`, make the `level:` and `zoneart:` factories dispatch on which project is open:

```ts
import { useProjectStore } from './projectStore';
import { useClassicProjectStore } from './classicProjectStore';
import { EditHistory } from '../../core/editing/history';
import { BoundEditHistory } from '../../core/editing/bound-edit-history';
import { getActiveLevel } from './projectStore';

function classicIsOpen(): boolean {
  return useClassicProjectStore.getState().status === 'open';
}

export function registerHistoryFactories(): void {
  documentHistoryHub.registerFactory('level:', (docId) =>
    classicIsOpen()
      ? new ClassicLayoutHistory(readLayoutSnapshot, writeLayoutSnapshot)
      : new BoundEditHistory(new EditHistory(), () => getActiveLevel(useProjectStore.getState())),
  );
  documentHistoryHub.registerFactory('zoneart:', (docId) =>
    classicIsOpen()
      ? new ClassicArtHistory(readArtSnapshot, writeArtSnapshot)
      : new BoundEditHistory(new EditHistory(), () => getActiveLevel(useProjectStore.getState())),
  );
  documentHistoryHub.registerFactory('doc:sprite:', (docId) =>
    new SpriteDocHistory(
      () => readSpriteSnapshot(docId), (snap) => writeSpriteSnapshot(docId, snap),
    ),
  );
}
```

A window holds one project at a time (spec §2 locked decision), so dispatching at stack-construction time is safe: a project switch calls `clearAll()`, so no stack outlives its engine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: errors only in `Toolbar.tsx`, `ClassicProjectView.tsx`, `art-facet.tsx`, `sprite-undo.ts` (all fixed in Tasks 9–10).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/editorStore.ts src/renderer/state/history-factories.ts \
        src/renderer/state/__tests__/history-routing.test.ts
git commit -m "feat(editing): focusedHistory routes undo by tab and facet"
```

---

### Task 9: Rewire the UI undo/redo entry points

Four places bind Ctrl+Z / Ctrl+Y or render undo buttons. All become one call.

**Files:**
- Modify: `src/renderer/components/Toolbar.tsx`, `src/renderer/components/classic/ClassicProjectView.tsx`, `src/renderer/workspace/facets/art-facet.tsx`, `src/renderer/workspace/LevelWorkspace.tsx`

- [ ] **Step 1: Replace every binding**

The uniform shape, everywhere:

```tsx
const history = focusedHistory();
// enabledness re-renders via the hub subscription below
<IconButton disabled={!history?.canUndo} onClick={() => history?.undo()} />
```

For re-render on history change, subscribe once with a small hook (create it in `src/renderer/hooks/useHistoryVersion.ts`, replacing the three deleted repaint clocks):

```ts
import { useSyncExternalStore } from 'react';
import { documentHistoryHub } from '../state/history-hub';

let version = 0;
documentHistoryHub.onChange(() => { version++; });

/** Re-renders the caller whenever any undo stack changes. */
export function useHistoryVersion(): number {
  return useSyncExternalStore(
    (cb) => documentHistoryHub.onChange(cb),
    () => version,
  );
}
```

Per file:
- **`Toolbar.tsx`** — delete both `isSpriteDoc ? spriteMode* : …` branches (aeon block ~129-148, classic block ~171-188) and the `classicCanUndo`/`classicCanRedo`/`spriteModeUndo`/`spriteModeRedo` imports. One undo/redo pair, `focusedHistory()`-driven, rendered unconditionally.
- **`ClassicProjectView.tsx`** — the `window` keydown effect (`:80-88`) calls `focusedHistory()?.undo()` / `.redo()`; keep the `levelKeysEnabled()` and `isTypingTarget` guards exactly as they are.
- **`art-facet.tsx`** — the local Ctrl+Z/Y rebind (`:207-213`) calls `focusedHistory()`; delete its direct `undo(level)`/`redo(level)` imports.
- **`LevelWorkspace.tsx`** — the header Undo/Redo chips read `focusedHistory()` and `useHistoryVersion()`; delete the `editorStore.historyVersion` subscription.

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: errors only in `sprite-undo.ts` and its importers (deleted next task).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/Toolbar.tsx \
        src/renderer/components/classic/ClassicProjectView.tsx \
        src/renderer/workspace/facets/art-facet.tsx \
        src/renderer/workspace/LevelWorkspace.tsx \
        src/renderer/hooks/useHistoryVersion.ts
git commit -m "refactor(ui): one undo/redo path driven by focusedHistory"
```

---

### Task 10: Delete the undo-bus, sprite-undo and edit-seq

**Files:**
- Delete: `src/core/editing/undo-bus.ts`, `src/renderer/state/sprite-undo.ts`, `src/core/editing/edit-seq.ts`, and their tests.
- Modify: `src/core/editing/history.ts`, `src/core/editing/sprite-history.ts`, `src/core/editing/classic-history.ts`

- [ ] **Step 1: Confirm nothing still imports them**

Run:
```bash
grep -rn "undo-bus\|sprite-undo\|edit-seq\|registerRedoClearer\|invalidateSiblingRedos\|nextEditSeq\|peekEditSeq" src
```
Expected: matches only inside the files being deleted, plus `topUndoSeq`/`topRedoSeq`/`clearRedo` members in `history.ts`. If anything else matches, rewire it before deleting.

- [ ] **Step 2: Delete**

```bash
git rm src/core/editing/undo-bus.ts src/renderer/state/sprite-undo.ts src/core/editing/edit-seq.ts
git rm src/core/editing/__tests__/undo-bus.test.ts src/renderer/state/__tests__/sprite-undo.test.ts \
       src/core/editing/__tests__/edit-seq.test.ts 2>/dev/null || true
```

Also delete the now-orphaned `src/core/editing/sprite-history.ts` and `src/core/editing/classic-history.ts` — Tasks 5 and 7 replaced both with snapshot-history subclasses.

- [ ] **Step 3: Strip the merge machinery from `EditHistory`**

In `src/core/editing/history.ts` remove: the `nextEditSeq` import, the `undoSeq`/`redoSeq` arrays and every line touching them, `topUndoSeq()`, `topRedoSeq()`, and `clearRedo()`. `applyCommand`/`undoCommand` are untouched.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all green. Investigate every failure — do not delete a failing test to make this pass.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(editing): delete undo-bus, sprite-undo and edit-seq"
```

---

### Task 11: Dispose stacks on tab close; offer Save on the sprite dirty confirm

**Files:**
- Modify: `src/renderer/shell/tab-activation.ts` (or wherever tab close is handled — find it with `grep -rn "closeTab" src/renderer`)
- Modify: the sprite-doc dirty confirm (find with `grep -rn "Discard" src/renderer | grep -i sprite`)
- Test: `src/renderer/state/__tests__/history-routing.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```ts
describe('tab close', () => {
  it('disposes the closed document\'s undo stack', async () => {
    documentHistoryHub.clearAll();
    documentHistoryHub.clearFactories();
    registerHistoryFactories();
    await loadFixtureAct();

    documentHistoryHub.historyFor('level:ghz:1');
    expect(documentHistoryHub.has('level:ghz:1')).toBe(true);

    const { closeTab } = await import('../../shell/tab-activation');
    closeTab('level:ghz:1');

    expect(documentHistoryHub.has('level:ghz:1')).toBe(false);
  });
});
```

Adjust the import to the real close-tab entry point found by the grep above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: FAIL — the stack survives the close.

- [ ] **Step 3: Wire dispose and the Save button**

In the tab-close path add `documentHistoryHub.dispose(tabId)` after the tab is removed from the session. For a level tab, dispose only the `level:` doc — the `zoneart:` doc is shared with the zone's other act tabs, so dispose it only when the last act tab of that zone closes.

In the sprite-doc dirty confirm, add a **Save** action beside Discard/Cancel. It is now well-defined: `saveSpriteDoc(docId)` on the multi-document store, rather than the old context-dependent `s1ArtSource != null` path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/state/__tests__/history-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): dispose undo stacks on tab close; sprite confirm offers Save"
```

---

### Task 12: Full verification

- [ ] **Step 1: Whole suite**

Run: `npm test`
Expected: all green. Test-file count will be lower than the 156 baseline (three test files deleted); passing count should be at or above 1344 minus the deleted files' tests, plus this plan's ~30 new ones.

- [ ] **Step 2: Types**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Confirm the bus is gone**

Run: `grep -rn "undo-bus\|sprite-undo\|edit-seq\|historyTick\|historyVersion\|activeHistory" src`
Expected: no matches.

- [ ] **Step 4: Manual smoke script** (report results; do not self-certify)

With a classic (S1) project open:
1. Stamp a chunk on the Layout facet, Ctrl+Z — the stamp reverts.
2. Edit a palette swatch, Ctrl+Z — the palette reverts, the stamp stays reverted.
3. Ctrl+Y twice — both come back in order.
4. Open two act tabs of the same zone. Edit a palette from act 1, switch to act 2, Ctrl+Z — **the palette edit undoes** (this is the intended §4.2 behavior change).
5. Open two sprite docs, edit both, Ctrl+Z in one — only that one changes.
6. Close a sprite doc with unsaved edits — the confirm offers Save, and Save works.

With an aeon project open: repeat 1–5. Nothing should regress from Stage 3.

- [ ] **Step 5: Confirm master has not moved**

```bash
cd /home/volence/sonic_hacks/aurora && git rev-parse master
```
Expected: `a7a274e` (the spec commit). If it has moved, a subagent wrote to the main tree — stop and report.

---

## Worktree discipline

Subagent shells start in the **main tree**, not the worktree. Every Bash call in this plan must be prefixed:

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage4 && <command>
```

All file paths passed to Read/Edit/Write must be absolute under `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-stage4/`. This tripwire held for all of Stage 3 (zero master incidents across ~20 subagent runs) precisely because it was applied without exception.

## Self-review notes

- **Spec coverage:** §4.1 → Tasks 1–3; §4.2 → Tasks 4, 8; §4.3 → Tasks 5–6 (audit pre-resolved above); §4.4 → Tasks 7, 11; §4.5 → Tasks 9–10. Spec §3, §5, §6, §7 are Plans 2+ by the re-slicing stated at the top.
- **Deliberate deviation from the spec:** §4.3 anticipated cross-domain commit sites needing compound commands. The audit found none, so that machinery is not built. If an implementer finds one, stop and amend.
- **Type consistency:** `UndoStack` (Task 1) is implemented by `BoundEditHistory` (2), `ClassicLayoutHistory`/`ClassicArtHistory` (5), `SpriteDocHistory` (7). `zoneArtDocId` (4) is consumed by 6 and 8. `readLayoutSnapshot`/`writeLayoutSnapshot`/`readArtSnapshot`/`writeArtSnapshot` (6) are consumed by the factories in 6 and 8. `focusedHistory` (8) is consumed by 9.
- **Known ordering hazard:** Task 6 registers a classic-only `level:` factory that would hijack aeon docs. Task 8 replaces it with the engine-dispatching version. The two must land together before any user-facing build.
