# Stage 4 Plan 3 — Slot Neutrality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and apply the pattern that lets one component serve both engines — **neutral presentation taking props and callbacks, with engine-keyed providers** — on the three slots where sharing is genuinely worth it, and wire the capability seam Plan 2 left unconnected.

**Architecture:** No neutral component imports a store. Each takes its data as row/cell models, its writes as callbacks, and its repaint signal as an explicit `versionKey` prop. Per engine, a small provider module reads that engine's stores and supplies those props. This is the pattern the codebase already runs four times — `documentHistoryHub`, `saveCoordinator`, `explorer-data.ts`, and `components/art-shared/` — the last of which already spans classic, aeon and the sprite editor.

**Tech Stack:** TypeScript, React, Zustand, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` — **§3.0 first**, then §3.

**Worktree:** `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan3`, branch `feature/ux-stage4-plan3`.

**Baseline:** 174 test files (173 passed, 1 skipped) / 1543 passed / 3 skipped / 0 failed, `npx tsc --noEmit` clean.

---

## How to read this plan

Tasks 1–3 carry complete code, because the files were read while writing them.

**Tasks 4–6 carry complete _contracts_ — interfaces, test names, acceptance criteria — but their code blocks are explicitly marked ILLUSTRATIVE.** Those components were not read line-by-line while writing this plan, and in the previous plan every fabricated code sketch that had not been read first turned out to contain an error (a conditional hook call, a wrong assumption about where a manifest is built, a wrong claim about which tests assert equality). Implementers caught all three, but the honest fix is to stop fabricating. For those tasks: **read the named current source, satisfy the stated contract and tests, and derive the code.** If the contract itself does not survive contact with the code, stop and report — that is a plan bug, not an implementation detail.

## Scope

This plan is **Steps 0–3** of a six-step re-home. Not included: classic viewport state moving to stores (Step 4), classic rendering through `LevelWorkspace` (Step 5), and assorted cleanup (Step 6). The classic **collision editor** is separate feature work with its own design pass, gated on a geometry verification (spec §9.2) — not in this plan.

## Pre-flight facts

Established by recon against `master` @ `5c1d564`. **Verify anything you depend on; do not trust a line number.**

1. **The write asymmetry is not "commands vs snapshots."** No component calls `commitLayout`/`commitArt`; classic components call named validating functions (`classicSetObjects`, `classicSetPalette`, …) that return `{ok} | {ok:false, error}`. The real differences are: aeon's `executeCommand` **throws**, classic returns a result; aeon callers must pass the level; and **aeon mutates in place while classic swaps an immutable doc** — which is why they repaint off different signals. That last one is why every neutral component takes a `versionKey` prop.
2. **`executeCommand` throws for a non-aeon focused document** (`editorStore.ts`). Any neutral component that keeps a direct import will hard-crash classic on first click. Ten call sites across six non-canvas files.
3. **`PropertiesPanel` is not classic's `ObjectInspector` counterpart.** It is a read-only stats readout with one editable control. **Aeon has no object property editor at all** — Task 5 gives it one.
4. **Three slot components are already neutral in mechanism:** `MapFacetDock`, `ArtToolDock`, `ArtStatusBar` (tool/selection state only, zero project reads).
5. **`openCapabilities()` / `openArtTiers()` have zero production consumers.** `LevelWorkspace` still reads `useProjectStore((s) => s.capabilities?.facets ?? [])`. Task 2 fixes that.
6. **The classic-surface guard scans only `src/renderer/components/classic`** (`classic-surface.test.ts`, via `readdirSync` + a `classic(Set|Edit|Add)` regex). **Moving a classic command call into a shared component silently escapes the guard**, and a surface that loses its facet claim sends Ctrl+Z to the wrong document with nothing failing. Task 4 extends the scan root *before* any such move.

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/renderer/components/shared/ObjectList.tsx` | Neutral object list: rows in, selection callback out. No store imports. |
| `src/renderer/components/shared/object-list-model.ts` | The row model + filter logic. Pure, node-testable. |
| `src/renderer/providers/object-list-aeon.ts` | Aeon provider: `objectLibrary` → rows. |
| `src/renderer/providers/object-list-classic.ts` | Classic provider: `S1_OBJECT_LIST` → rows. |
| `src/renderer/components/shared/ObjectInspector.tsx` | Neutral object property form (Task 5). |
| `src/renderer/providers/object-inspector-{aeon,classic}.ts` | (Task 5) |
| `src/core/art/rasterize.ts` | Chunk/tile → `Uint8ClampedArray`, engine-agnostic (Task 6). |
| `src/renderer/components/shared/ChunkGrid.tsx` | Neutral chunk grid with lazy paint (Task 7). |
| `src/renderer/providers/chunk-grid-{aeon,classic}.ts` | (Task 7) |

Plus a `__tests__` sibling for each pure module.

**Modify:** `LevelWorkspace.tsx`, `objects-facet.tsx`, `editorStore.ts`, `ClassicProjectView.tsx`, `classic-surface.test.ts`, `facet-visibility.test.ts`.

**Delete:** `ObjectPalette.tsx`, `ObjectLibraryPanel.tsx` (superseded by Task 4); `MultiSelection` from `editorStore`.

**Commands:** `npx vitest run <path>`, `npx vitest run`, `npx tsc --noEmit`. Every Bash call prefixed `cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan3 &&`.

---

### Task 1: Delete dead code before abstracting over it

Dead API baked into a neutral interface is permanent. Clear it first.

**Files:** `src/renderer/state/editorStore.ts`, `src/renderer/components/ObjectPalette.tsx`, `src/renderer/workspace/facets/objects-facet.tsx`

- [ ] **Step 1: Confirm each is genuinely dead**

```bash
grep -rn "MultiSelection\|multiSelection" src test
grep -rn "selectedType\|onSelectType" src test
```

`MultiSelection` / `multiSelection` (`editorStore.ts`) should show only its own declaration, initialiser and setter — **no readers**. `ObjectPalette`'s `selectedType` / `onSelectType` props should show only the interface, the signature, and `objects-facet.tsx` passing them — `ObjectPalette` never reads either (it uses `editorStore.selectedObjectTypeId`).

**If either has a real consumer, stop and report** — the premise is wrong.

- [ ] **Step 2: Delete them**

Remove `MultiSelection` (type, state field, setter) from `editorStore.ts`. Remove the `ObjectPaletteProps` interface and both props from `ObjectPalette.tsx`, and stop passing them in `objects-facet.tsx`.

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean; `npx vitest run` 0 failed, count unchanged.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: drop dead multi-selection state and ObjectPalette props"
```

---

### Task 2: Wire the capability seam (Step 0)

Plan 2 built `openCapabilities()` and nothing consumed it. `LevelWorkspace` still reads `projectStore` directly, so pointing classic at it would render **no facet pills at all**.

**Files:** `src/renderer/workspace/LevelWorkspace.tsx`; test `src/renderer/workspace/__tests__/facet-visibility.test.ts`

**Scope limit:** this only changes *where the granted list comes from*. Classic still renders through `LegacyWorkspace`; nothing about which facets appear for aeon may change.

- [ ] **Step 1: Extend the visibility test**

Add to `src/renderer/workspace/__tests__/facet-visibility.test.ts` a case asserting the granted list resolves from the **open engine's** manifest, for both engines — set up a classic-open store state and an aeon-open one, and assert the resolved facet list matches each profile's grant. Follow the file's existing setup style.

The s1 grant currently includes `collision`, which classic cannot edit (spec §3.0.3). **That is a known open product decision and is NOT resolved here** — classic does not render through `LevelWorkspace` until Step 5, so nothing user-visible depends on it yet. Assert the grant as it is; leave a comment pointing at §3.0.3.

- [ ] **Step 2: Run it, confirm it fails**

Expected: the classic case fails, because the granted list comes from `projectStore`, which classic never populates.

- [ ] **Step 3: Switch the source**

In `LevelWorkspace.tsx`, replace `useProjectStore((s) => s.capabilities?.facets ?? [])` with the equivalent through `useOpenCapabilities()` from `src/renderer/state/open-project.ts`.

- [ ] **Step 4: Verify and commit**

Tests pass; `npx tsc --noEmit` clean; whole suite 0 failed. Confirm aeon's facet bar is unchanged.

```bash
git commit -am "feat(workspace): facet visibility reads the open engine's manifest"
```

---

### Task 3: The neutral object row model

Pure logic first, so the component in Task 4 has nothing testable left in it. **This is where the shared behaviour lives**; the `.tsx` is markup only.

**Files:** Create `src/renderer/components/shared/object-list-model.ts` and `src/renderer/components/shared/__tests__/object-list-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { filterRows, type ObjectRow } from '../object-list-model';

const rows: ObjectRow[] = [
  { key: '11', badge: '$11', label: 'Bridge' },
  { key: '18', badge: '$18', label: 'Platform' },
  { key: 'enemy', badge: 'enemy', label: 'Patrolling Enemy' },
];

describe('filterRows', () => {
  it('returns every row for an empty filter', () => {
    expect(filterRows(rows, '')).toHaveLength(3);
  });

  it('matches the label case-insensitively', () => {
    expect(filterRows(rows, 'bri').map((r) => r.key)).toEqual(['11']);
    expect(filterRows(rows, 'BRI').map((r) => r.key)).toEqual(['11']);
  });

  it('matches the badge too, so hex ids are findable', () => {
    expect(filterRows(rows, '$18').map((r) => r.key)).toEqual(['18']);
  });

  it('matches the key, so an aeon string id is findable', () => {
    expect(filterRows(rows, 'enemy').map((r) => r.key)).toEqual(['enemy']);
  });

  it('trims whitespace rather than matching nothing', () => {
    expect(filterRows(rows, '  bridge  ').map((r) => r.key)).toEqual(['11']);
  });

  it('returns an empty array on no match, not every row', () => {
    expect(filterRows(rows, 'zzz')).toEqual([]);
  });

  it('preserves source order', () => {
    expect(filterRows(rows, '').map((r) => r.key)).toEqual(['11', '18', 'enemy']);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** — `Failed to resolve import "../object-list-model"`.

- [ ] **Step 3: Implement**

```ts
// The row model both engines' object lists reduce to, plus the only logic worth
// testing in them. Deliberately store-free and engine-free: the classic list is
// 82 hardcoded S1 objects keyed by number, the aeon list is a project-declared
// library keyed by string, and neither fact belongs here.

/** One row. `key` is the engine's own id, stringified — never parsed back. */
export interface ObjectRow {
  readonly key: string;
  /** Short id chip: classic's '$1C', aeon's 'enemy'. */
  readonly badge: string;
  readonly label: string;
  /** Tooltip; falls back to `label` when absent. */
  readonly title?: string;
  /** True when this row has art to preview. The list draws a thumb slot for it
   *  and offers the secondary action; it never resolves the art itself. */
  readonly hasArt?: boolean;
}

/** Case-insensitive match over label, badge and key. Whitespace-trimmed, so a
 *  filter of spaces shows everything rather than nothing. */
export function filterRows(rows: readonly ObjectRow[], filter: string): ObjectRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) =>
      r.label.toLowerCase().includes(q) ||
      r.badge.toLowerCase().includes(q) ||
      r.key.toLowerCase().includes(q),
  );
}
```

- [ ] **Step 4: Run it — PASS, 7 tests. Then commit.**

```bash
git commit -am "feat(shared): engine-neutral object row model"
```

---

### Task 4: Neutral `ObjectList` + both providers

Replaces `ObjectPalette` (aeon, 140 LOC) and `ObjectLibraryPanel` (classic, 169 LOC). Both are "filterable list of rows → arm one"; they differ only in decoration.

**Both sides gain:** classic gets a filter box for its 82 unfiltered rows; aeon gets thumbnails (it already holds the bitmaps in `projectStore.objectSprites` and simply never draws them) and classic's better arm/disarm loop.

**Files:**
- Create: `src/renderer/components/shared/ObjectList.tsx`, `src/renderer/providers/object-list-aeon.ts`, `src/renderer/providers/object-list-classic.ts`, and a test for each provider
- Modify: `src/renderer/workspace/facets/objects-facet.tsx`, `src/renderer/components/classic/ClassicProjectView.tsx`, `src/renderer/components/classic/__tests__/classic-surface.test.ts`
- Delete: `ObjectPalette.tsx`, `ObjectLibraryPanel.tsx`

- [ ] **Step 1: Extend the classic-surface guard FIRST**

Per pre-flight fact 6, that guard scans only `components/classic`. This task moves classic's object list out of that directory, so **extend the scan root before moving anything**, or the guard silently stops covering it.

Read `src/renderer/components/classic/__tests__/classic-surface.test.ts` and widen its `readdirSync` root to also cover `src/renderer/providers` and `src/renderer/components/shared`, keeping the same `classic(Set|Edit|Add)` regex and the same surface-declaration requirement. Run it — it must still pass against the *current* tree before you move code.

- [ ] **Step 2: Write the provider tests**

Providers are pure functions from store state to `ObjectRow[]` — that is what makes this task node-testable. Write `src/renderer/providers/__tests__/object-list-classic.test.ts` and `…-aeon.test.ts` asserting:
- classic: rows come from `S1_OBJECT_LIST`, `badge` is the `$XX` hex, `hasArt` is true exactly when `resolveObjectArt(id, zone)` is defined
- aeon: rows come from `project.objectLibrary`, `key`/`badge` are the string id, `label` is the name, `hasArt` reflects a resolved sprite binding
- both: an empty/absent source yields `[]`, not a throw

- [ ] **Step 3: Implement the providers**

Each exports a hook returning everything `ObjectList` needs:

```ts
export interface ObjectListPort {
  readonly rows: readonly ObjectRow[];
  readonly selectedKey: string | null;
  /** Toggle semantics: selecting the already-selected row clears it. */
  select(key: string | null): void;
  /** Rendered in the thumb slot; null when the port has no art to show. */
  Thumb: React.ComponentType<{ rowKey: string }> | null;
  /** Optional per-row secondary action (classic's "edit art" pencil). */
  secondaryAction?: { icon: string; title(row: ObjectRow): string; run(key: string): void };
  /** Optional footer (aeon's sprite-binding select). */
  Footer?: React.ComponentType;
  /** Props spread on the root element — classic uses this to claim its facet. */
  rootProps?: React.HTMLAttributes<HTMLElement>;
  /** Changes when the rows or their art change; the list keys renders on it. */
  versionKey: string;
}
```

Classic's port supplies `rootProps: classicSurfaceProps('map')` (arming is the first half of a layout edit — keep that comment), the `ObjectThumb` component lifted from `ObjectLibraryPanel`, the edit-art secondary action, and `versionKey` from `` `${zone}:${chunkEpoch}` ``. Aeon's supplies the sprite-binding footer lifted from `ObjectPalette` and a thumb backed by `projectStore.objectSprites`.

**Aeon's `select` must adopt classic's toggle semantics** — today aeon's arm is sticky and never clears, which is a real bug classic doesn't have.

- [ ] **Step 4: Implement `ObjectList.tsx`**

Markup only: header + filter input, scrolling list of rows (thumb slot, badge, label, optional secondary button), empty state, optional footer, `rootProps` on the root. It imports `filterRows` and the port type — **no store imports**. Keep `ObjectLibraryPanel`'s accessibility (`role="listbox"` / `role="option"` / `aria-selected`) and its nested-button avoidance: the arm target is its own `<button>` sibling, not the whole row.

Distinguish the two empty states as `ObjectPalette` did ("No object library loaded" vs "No matches").

- [ ] **Step 5: Swap both call sites, delete the originals**

`objects-facet.tsx` renders `ObjectList` with the aeon port; `ClassicProjectView.tsx` with the classic port. Delete `ObjectPalette.tsx` and `ObjectLibraryPanel.tsx`. Grep to confirm no importers remain.

- [ ] **Step 6: Verify and commit**

`npx tsc --noEmit` clean; whole suite 0 failed; the widened classic-surface guard passes.

```bash
git commit -am "feat(shared): one object list for both engines"
```

---

### Task 5: Neutral `ObjectInspector` — aeon gains an object editor

> **CONTRACT ONLY — code below is ILLUSTRATIVE.** Read `src/renderer/components/classic/ObjectInspector.tsx` (234 LOC, the base) and aeon's `ObjectPlacement` model before writing anything.

This is the **first write-path crossing**. Classic's inspector is the base; aeon gains an editor it does not currently have.

**Data shapes differ in ways the port must absorb:**

| | classic `S1ObjectEntry` | aeon `ObjectPlacement` |
|---|---|---|
| type key | `id: number` | `typeId: string` |
| coords | level-global, x 0..$FFFF, y 0..$FFF | section-local, 0..$7FF |
| flips | `xflip`, `yflip` | **absent from the model** |
| respawn | `respawn` | absent |
| write | `classicSetObjects(...)` → `{ok}` | `executeCommand(cmd, level)` → throws |

Two findings to act on:
- **aeon's exporter already reserves flip bits** (`OEF_XFLIP`/`OEF_YFLIP` in `core/export/entity-data.ts`) and never sets them **because the model has no fields**. Adding `xflip`/`yflip` to `ObjectPlacement` is therefore closing an existing gap, not inventing a feature. Do it if it stays small; if it ripples into save/export, report and defer.
- **`respawn` is honestly classic-only.** The port declares which fields it supports; the inspector renders only those. No dead controls.

**Contract:**

```ts
// ILLUSTRATIVE — derive the real shape from ObjectInspector.tsx.
export interface ObjectInspectorPort {
  readonly selected: { key: string; fields: Record<string, number | boolean> } | null;
  readonly schema: readonly ObjectField[];   // which fields exist, ranges, labels
  commit(key: string, patch: Record<string, number | boolean>): { ok: true } | { ok: false; error: string };
  readonly versionKey: string;
  Preview?: React.ComponentType<{ rowKey: string; subtype: number }>;
}
```

**Errors normalise to classic's `{ok} | {ok:false, error}` convention** — the aeon port catches and converts. A throwing write is exactly what makes `executeCommand` a landmine.

**Tests (node-side, on the ports and schema — not the JSX):**
- each port's `schema` lists exactly the fields that engine supports; classic includes `respawn`, aeon does not
- clamping: a value past the engine's coordinate limit is rejected or clamped per the schema, and the two engines' limits differ (aeon section-local vs classic level-global)
- the aeon port converts a thrown `executeCommand` into `{ok: false}` rather than propagating
- one field edit produces exactly one undo step on each engine

**Done when:** both engines edit object properties through one component; aeon has an inspector where it had none; `npx tsc --noEmit` clean; suite 0 failed.

---

### Task 6: Extract the rasterizers to core

> **CONTRACT ONLY — code ILLUSTRATIVE.** Read `src/core/level-classic/render.ts` (the target signature already exists there) and the three aeon hand-rolled paths in `ChunkLibrary.tsx`, `TilesetPanel.tsx`, `ArtBrowser.tsx`.

Pure-core extraction, independently green, prerequisite for Task 7.

Classic already returns exactly the right shape from `core/level-classic/render.ts` — a `Uint8ClampedArray` of RGBA. Aeon has no equivalent: `ChunkLibrary`, `TilesetPanel` and `ArtBrowser` each hand-roll their own `putImageData`.

**Contract:** `src/core/art/rasterize.ts` exposes chunk and tile rasterization for both engines, returning `Uint8ClampedArray` RGBA at a caller-specified size. Pure — no canvas, no DOM, no stores — so it is fully node-testable.

**Tests:** byte-exact output against the existing implementations for a known fixture, per engine; correct handling of flips, palette line selection, and empty/air cells. **Reuse the reference-implementation technique from `src/renderer/canvas/__tests__/compose-nametable.test.ts`** — it exists precisely for this and proved a rendering rewrite byte-identical.

**Watch:** classic's palette words and aeon's `Color` objects are **lossy in both directions** (`decodeGenesisColor` drops bits; `Color.a` has no CRAM representation), and classic's save does a recompose self-check. **Do not route classic CRAM through `Color`** — take each engine's palette in its own representation and convert to RGBA at the last step.

**Done when:** both engines' existing thumbnails render byte-identically through the shared rasterizer; suite 0 failed.

---

### Task 7: Neutral `ChunkGrid`

> **CONTRACT ONLY — code ILLUSTRATIVE.** Read `ChunkLibrary.tsx` (324 LOC) and `ChunkPicker.tsx` (235 LOC).

**Aeon gains three things classic already has** and this is the main justification for the merge:
- `IntersectionObserver` lazy first paint
- one shared scratch canvas instead of one per thumbnail
- **per-chunk invalidation.** Aeon's cache key is the *global* `chunkLibraryVersion`, so one tile-pixel edit re-rasterizes **every** chunk thumbnail.

**Contract:**

```ts
// ILLUSTRATIVE.
export interface ChunkGridPort {
  readonly ids: readonly string[];
  rasterize(id: string): Uint8ClampedArray | null;   // via core/art/rasterize
  /** Per-chunk, so one chunk's edit invalidates one thumbnail. */
  versionKey(id: string): string;
  label(id: string): string;
  isEmpty(id: string): boolean;
  readonly selectedId: string | null;
  onSelect(id: string): void;
  HeaderExtra?: React.ComponentType;
  rootProps?: React.HTMLAttributes<HTMLElement>;
}
```

**Keep two distinct empty predicates, not one.** Classic has a synthetic air chunk `$00`; aeon has data-derived blank chunks. Collapsing them loses a real distinction — and a prior memory records that aeon chunks `$00/$2A/$2B/$45` are *legitimately* blank, not corrupt, so anything that treats "blank" as "absent" risks stamping over valid data.

Classic extras the port must preserve: **1-based ids**, the **bit-7 loop flag packed in-band** in layout cells, and `cells.length !== width*height` for four real S1 files.

**Tests:** port-level and pure — id enumeration, per-chunk version key changes only for the edited chunk, both empty predicates, selection toggle. Lazy paint and the shared canvas are eyeball-only.

**Done when:** both engines' chunk grids render through one component; aeon has lazy paint and per-chunk invalidation; suite 0 failed.

---

### Task 8: Full verification

- [ ] **Step 1:** `npx tsc --noEmit` clean; `npx vitest run` 0 failed.
- [ ] **Step 2:** `grep -rn "useProjectStore\|useClassicLevelStore\|executeCommand" src/renderer/components/shared` — **must return nothing.** A store import in a neutral component is the defect this whole plan exists to prevent.
- [ ] **Step 3:** `git diff master --stat` — confirm the deletions actually happened (`ObjectPalette.tsx`, `ObjectLibraryPanel.tsx`, `MultiSelection`).
- [ ] **Step 4: Smoke test (the owner's, eyeball-only):**
  1. **Classic:** object library filters; arming, disarming, placing and editing art all still work; Ctrl+Z after an object edit still hits the layout document.
  2. **Aeon:** object palette shows thumbnails (new); arming toggles off (new); sprite binding still works.
  3. **Aeon:** object properties are editable (new capability).
  4. **Both:** chunk grids render correctly; editing one chunk updates only that thumbnail.
  5. **Aeon:** the facet bar is unchanged.

---

## Worktree discipline

Subagent shells start in the **main tree**. Every Bash call must be prefixed:

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan3 && <command>
```

All Read/Edit/Write paths absolute under that directory. This tripwire has held for ~40 subagent runs across three stages precisely because it was applied without exception.

## Self-review notes

- **Spec coverage:** §3.0.1 is the whole premise. Step 0 → Task 2. Step 1 → Tasks 3–4. Step 2 → Task 5. Step 3 → Tasks 6–7. §3.0.3 (classic collision) is deliberately untouched and separately designed.
- **Deliberate deviation:** the spec's Option-1 framing implies one neutral store facade. There isn't one, and there shouldn't be — the two command vocabularies overlap only ~40%. Writes arrive as callbacks from engine-keyed providers instead.
- **Honest limit:** ~6 slots stay engine-keyed permanently (composer, palette editor, collision, rings, and the aeon-only panels). Facet parity for those is a convention enforced by registry tests, not by the type system. The shell guarantees the same slots exist and the same task is reachable — not identical panels.
- **Known hazards:** the classic-surface guard's scan root (Task 4 Step 1 — do it first); the repaint-clock asymmetry, which has already produced two live bugs the suite did not catch (`ArtBrowser`'s missing history key, `ArtToolOptions` on the unscoped clock); and `executeCommand` throwing.
- **Verification posture:** all shared logic lives in `.ts` providers and models so it is genuinely tested. If logic ends up in a `.tsx`, it is untested — the suite is node-only and does not collect `.tsx` at all.
