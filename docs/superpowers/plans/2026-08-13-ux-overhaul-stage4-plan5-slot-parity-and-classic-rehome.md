# Stage 4 Plan 5 — Slot Parity (F) + Classic Into The Workspace (G)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land re-home **Steps F and G** — neutralise the two map-facet slots classic will mount, then make classic render through `LevelWorkspace` and delete the classic-only shell (`LegacyWorkspace`, `ClassicProjectView`, `ZoneActTree`, `Toolbar`). This is the commit where classic stops feeling like a different app.

**Architecture:** Facet **identity** stays neutral in core (`FacetDescriptor`); facet **slots** become engine-keyed, replacing the Canvas-only `facetCanvases` registry with one `(engine, facetId)` module registry. A module may register for several engines, so a facet that has genuinely converged is written once. Slot components neutralise progressively — neutral presentation taking props + callbacks + an explicit `versionKey`, fed by engine-keyed providers — and each one that converges collapses two engine modules onto one shared component.

**Tech Stack:** TypeScript, React, Zustand, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md` — **§3.0 first** (its corrections outrank §3's prose), then §3.1, §3.6, §3.7.

**Status doc:** `docs/superpowers/plans/2026-08-13-stage4-status.md`.

**Baseline:** `master` @ `0ed2a8c`, working tree clean. **Measured, not copied:** `npx tsc --noEmit` clean; `npx vitest run` = 191 test files (190 passed, 1 skipped) / 1755 tests (1752 passed, 3 skipped) / 0 failed.

**Branch:** `feature/ux-stage4-plan5`, worktree `/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5`.

**Single worker, no fan-out.** Tasks 3–10 all converge on `LevelWorkspace.tsx`, `App.tsx` and the facet registry. The status doc records that two agents in one worktree already swept one another's work into a single commit once; plan 4 ran as one worker for the same reason and it was the right call.

---

## How to read this plan

Tasks whose files were **read line-by-line while writing this plan** carry complete code: Tasks 1, 3, 4, 5, 6, 9, 10, 11.

Tasks 2, 7 and 8 carry complete **contracts** — interfaces, test names, acceptance criteria — with code blocks marked **ILLUSTRATIVE**. Those files were measured (imports, call sites, prop surface) but not read line-by-line. Every fabricated code sketch in the plans before Plan 3 that had not been read first contained a real error. For those tasks: **read the named current source, satisfy the stated contract and tests, and derive the code.** If a contract does not survive contact with the code, **stop and report** — that is a plan bug, not an implementation detail.

---

## Decisions recorded in this plan

**1. The `collision` grant is dropped from s1** (owner decision, this session). Classic shows Layout / Art / Objects / Palette. `classicSetColind` keeps its agent-only caller and its tests; nothing is deleted. Re-adding the grant is a one-line change when the classic collision editor lands as its own designed feature. **Consequence: `CollisionPalette` leaves step F entirely** — it is mounted only by the collision facet (map variant) and the art facet, and the art facet is step H's. It was the largest item on the status doc's F list.

**2. F is re-scoped, and it shrinks.** The status doc's F list was written before the art/map split was clear. Of its seven components: `CollisionPalette` is gone (decision 1); `ArtToolOptions`, `TilesetPanel`, `PaletteEditor` and `ComposerCanvas` are **art-facet slots, which is step H by definition** — neutralising them here would be doing H's work under F's name, and `ComposerCanvas` should not be neutralised at all (recon: 44 `artStore` sites, and it is properly an engine-keyed *Canvas*). That leaves **`MapStatusBar` and `PropertiesPanel`** — the two slots classic's Layout and Objects facets actually mount. `MapFacetDock` needs nothing: `editorStore.tool` became the neutral vocabulary in plan 4, so its coupling is nominal.

**3. `facetCanvases` is replaced by engine-keyed facet modules.** `facet-canvases.ts:7-9` argues against this — "a facet is one concept with one label and one order across engines; only its canvas differs." **That objection does not hold:** id/label/order live on core `FacetDescriptor` (`core/shell/facets.ts`), which `facet-registry.ts:5-8` states explicitly. `FacetModule` carries *only slots*, and the slots genuinely differ per engine until each converges. Keying whole modules is **one** registry instead of two, and it kills the silent-fallback trap in pre-flight fact 4. Deviation from spec §3.1; recorded in code.

**4. Classic's art facet stays engine-keyed at G.** `ClassicComposerDock` becomes s1's art Canvas as-is. Merging it with aeon's staged pixel doc is step H, which the spec (§3.5) already flags as the hardest and possibly-shouldn't-be-fully-shared piece. G does not touch it beyond re-homing it.

---

## Pre-flight facts

Established by reading `master` @ `0ed2a8c`. **Verify anything you depend on; line numbers rot.**

1. **Plan 4 already unified classic's plane, tool and overlays — do not "fix" this.** A recon pass for this plan claimed `ClassicLevelViewport` reads `classicLevelStore.plane` / `.tool` and that two plane states would diverge at G. **That is wrong**, and it was checked: `ClassicLevelViewport.tsx:123-124` reads `useEditorStore.tool`/`setTool`, `:215-216` reads `useEditorStore.editingLayer`/`setEditingLayer`, `:217-218` reads `useViewStore.overlays`/`toggleOverlay`, and `:140` calls `toolsForFacet('layout')`. `classicLevelStore` has no `plane`/`tool` UI state at all — its `plane` occurrences are a function parameter. **The problem at G is therefore duplication, not divergence:** classic's `OptionBar` (`:950-981`) renders a *second* copy of controls `LevelWorkspace`'s header (`:52-55`, `:63`) already drives off the same stores. Task 6 deletes the duplicates.

2. **`ClassicProjectView` owns classic's only undo/redo key handler** (`:87-104` — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y through `focusedHistory()`, gated by `levelKeysEnabled()` + `isTypingTarget()`). `LevelWorkspace` has **no** keyboard handler; aeon gets undo keys per-canvas from `MapViewport.tsx:546-551` and `art-facet.tsx:209-214`. Delete `ClassicProjectView` without re-homing this and classic silently loses Ctrl+Z. Task 5 hoists one handler and deletes all three copies.

3. **s1 grants `['layout','art','objects','collision','palette']`** (`core/project/s1/index.ts:350`) and declares `facetTools.layout = ['view','stamp-chunk','select','place-object']` (`:366-368`). Aeon grants those plus `rings` and declares no `facetTools`. After decision 1, s1 grants four.

4. **`LevelWorkspace.tsx:75` is `canvasFor(engine, mod.id) ?? mod.Canvas`** — an unregistered `(s1, facet)` pair silently renders **aeon's `MapViewport` reading an empty `projectStore`**: a blank or garbage canvas, not an error. `workspace/__tests__/facet-canvases.test.ts:54` currently asserts `canvasFor('s1','layout')` is null. Task 3 removes the fallback.

5. **`executeCommand` / `executeAmbientCommand` throw** for a non-aeon focused document (`editorStore.ts:372-381`, `:444-456`). Measured throw sites in slots classic would mount: `PropertiesPanel.tsx:122` (`set-section-bg`, from the Background `<select>`). That is the *only* one in F's re-scoped set — the rest are in art-facet components classic will not mount at G.

6. **The `classic-surface` guard scans `src/renderer/{components,providers}`** recursively (`classic-surface.test.ts:28-29`), `.ts` + `.tsx`, skipping `__tests__`, matching `/\bclassic(?:Set|Edit|Add)[A-Za-z]*\b/` (`:76`) against comment-stripped source, and requires each matching file to appear in `COMMAND_SITES` (`:84-95`) with a `classicSurfaceProps('<surface>')` claim. `state/**` and `agent/**` are deliberately excluded. **It has been escaped twice.** `src/renderer/state/__tests__/classic-placement.test.ts:98` separately asserts `ClassicLevelViewport.tsx` is scanned — moving or renaming that file breaks two tests.

7. **`setFacet` has exactly one production caller** — `classic-surface.ts:62`. `switchFacet` has six (`FacetBar.tsx:21`, `chunk-grid-aeon.ts:117`, `agent-handler.ts:92`, `MapViewport.tsx:612,1457,1484`). The conversion is one line plus its docblock.

8. **`SpriteMode({ appBar })` is a required prop** (`SpriteMode.tsx:47`, used `:194`), passed a `Toolbar` at `App.tsx:220`. Deleting `Toolbar` requires a replacement header, which is also what resolves the Stage-3 carry-forward that switching acts from the sprite pane navigates the whole app away from the sprite doc (that selector is aeon's, reachable only from that pane).

9. **`ProjectSetupTab` already renders the resolution report.** Its own docblock (`ProjectSetupTab.tsx:2-8`) says it *is* "the Resolution Report promoted from readout to editor", rendering the same `report.entries` as editable path-override rows. Spec §3.7's "move `ResolutionReportPanel` to Project Setup" is therefore a **dedup/delete**, not a move. Task 8 verifies before deleting.

10. **`ChunkPicker` (19 LOC) and `ChunkLibrary` (18 LOC) are already the same component** — both are thin wrappers over `shared/ChunkGrid` differing only in port (`chunk-grid-classic.ts` vs `chunk-grid-aeon.ts`: `layout:'strip'` vs `'panel'`, `HeaderExtra` = `ChunkPickerHeader` loop-flag vs `AeonChunkActions`). Re-homing the picker is a slot-placement change, not a rewrite.

11. **`useOpenEngine()` returns the neutral engine id.** `App.tsx:118` already uses it (for ⌘K only); the shell ternary at `:189-195` still keys off `classicOpen` (classic store) vs `config` (aeon store), which is the disagreement plan 2 built `open-project.ts` to end.

---

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/renderer/components/shared/MapStatusBar.tsx` | Neutral status bar: labels/zoom in, `onZoom` out. No store imports. |
| `src/renderer/providers/map-status-aeon.ts` | Aeon port: `projectStore`/`editorStore`/`busStore` → props. |
| `src/renderer/providers/map-status-classic.ts` | Classic port: `classicLevelStore`/`classicProjectStore` → props. |
| `src/renderer/components/shared/PropertiesPanel.tsx` | Neutral key/value sections + optional select. No store imports. |
| `src/renderer/providers/properties-{aeon,classic}.ts` | Per-engine composition of those sections. |
| `src/renderer/workspace/facets/s1-facets.tsx` | s1's four facet modules (layout, objects, art, palette). |
| `src/renderer/shell/SpriteDocHeader.tsx` | Sprite-doc app bar replacing `Toolbar` (Task 10). |

Plus a `__tests__` sibling for each pure model module.

**Modify:** `facet-registry.ts`, `register-facets.ts`, `LevelWorkspace.tsx`, `FacetBar.tsx`, `App.tsx`, `ClassicLevelViewport.tsx`, `classic-surface.ts`, `chunk-grid-classic.ts`, `core/project/s1/index.ts`, `MapViewport.tsx`, `art-facet.tsx`, `layout-facet.tsx`, `objects-facet.tsx`, `SpriteMode.tsx` (call site only), `classic-surface.test.ts`, `facet-visibility.test.ts`, `history-routing.test.ts`.

**Delete:** `facet-canvases.ts` (folded into the module registry), `shell/LegacyWorkspace.tsx`, `components/classic/ClassicProjectView.tsx`, `components/classic/ZoneActTree.tsx`, `components/Toolbar.tsx`, `components/classic/ResolutionReportPanel.tsx` (pending Task 8's check), the old `shell/MapStatusBar.tsx` and `components/PropertiesPanel.tsx`.

**Commands:** `npx vitest run <path>`, `npx vitest run`, `npx tsc --noEmit`. **Every Bash call prefixed** `cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 &&`.

---

## Task 0: Worktree

- [ ] **Step 1: Create it**

```bash
cd /home/volence/sonic_hacks/aurora && \
  git worktree add .claude/worktrees/ux-plan5 -b feature/ux-stage4-plan5 master
```

- [ ] **Step 2: Confirm the baseline in the worktree**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: tsc silent; 191 test files (190 passed, 1 skipped) / 1755 tests (1752 passed, 3 skipped) / 0 failed. **If this does not match, stop and report** — every later "0 failed" claim is measured against it.

---

# STEP F — the two map-facet slots

### Task 1: Neutral `MapStatusBar`

The current `shell/MapStatusBar.tsx` (78 LOC) was read in full while writing this task; the code below is real, not illustrative. It reads five stores and calls no command. Classic's equivalent is the bespoke `statusLeft`/`statusRight` built inline in `ClassicProjectView.tsx:107-137`, which dies with that file — so classic needs this slot before it can lose the old one.

**Files:** Create `src/renderer/components/shared/MapStatusBar.tsx`, `src/renderer/components/shared/map-status-model.ts`, `src/renderer/components/shared/__tests__/map-status-model.test.ts`, `src/renderer/providers/map-status-aeon.ts`, `src/renderer/providers/map-status-classic.ts`. Delete `src/renderer/shell/MapStatusBar.tsx`. Modify `facet-registry.ts`.

- [ ] **Step 1: Write the failing model test**

The only real logic in the bar is which label/hint wins. Extract it so the `.tsx` is markup.

Create `src/renderer/components/shared/__tests__/map-status-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { statusLabel } from '../map-status-model';

describe('statusLabel', () => {
  it('shows the tool label and hint', () => {
    expect(statusLabel({ tool: 'select', pasting: false }))
      .toEqual({ label: 'Select', hint: expect.any(String) });
  });

  it('lets pasting override the active tool, because Ctrl+V does not switch tools', () => {
    const r = statusLabel({ tool: 'stamp-chunk', pasting: true });
    expect(r.label).toBe('Paste');
    expect(r.hint).toContain('Esc to stop');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx vitest run src/renderer/components/shared/__tests__/map-status-model.test.ts
```

Expected: FAIL — cannot resolve `../map-status-model`.

- [ ] **Step 3: Write the model**

Create `src/renderer/components/shared/map-status-model.ts`:

```ts
// The one piece of the map status bar with a decision in it. Everything else
// the bar shows is supplied by an engine port (providers/map-status-*.ts).

import { TOOL_LABELS, TOOL_HINTS } from '../../workspace/tool-meta';
import type { EditorTool } from '../../state/editorStore';

export interface StatusLabel { label: string; hint: string }

/** Pasting is independent of the active tool — Ctrl+V does not switch tools —
 *  so it overrides whatever the tool vocabulary would otherwise show. */
export function statusLabel(s: { tool: EditorTool; pasting: boolean }): StatusLabel {
  if (s.pasting) {
    return {
      label: 'Paste',
      hint: 'Click to paste · Alt: art only · Shift: collision only · Esc to stop',
    };
  }
  return { label: TOOL_LABELS[s.tool], hint: TOOL_HINTS[s.tool] };
}
```

- [ ] **Step 4: Run it, confirm it passes**

Same command as Step 2. Expected: 2 passed.

- [ ] **Step 5: Write the neutral component**

Create `src/renderer/components/shared/MapStatusBar.tsx`. **No store imports** — this is the rule the whole pattern rests on (`components/shared/ObjectList.tsx:11-19` states it canonically).

```tsx
// Neutral map status bar. Takes a port; imports no store and no command, so it
// cannot throw for a non-aeon document (spec §3.0.1, editorStore.ts:372-381).
// Engine-specific extras (aeon's Aether indicator) ride the `right` slot.

import React from 'react';
import { StatusBar, T, IconButton } from '../ui';
import { statusLabel } from './map-status-model';
import type { EditorTool } from '../../state/editorStore';

export interface MapStatusPort {
  tool: EditorTool;
  pasting: boolean;
  /** Uppercased by the bar; engines pass their own plane vocabulary. */
  layer: string;
  zoneName: string;
  /** Right of the zone name. Aeon passes `Section N`; classic passes its dims. */
  scopeInfo: string;
  /** Overrides the tool hint when non-empty — engine-specific context. */
  contextInfo: string;
  zoom: number;
  onZoom(zoom: number): void;
  /** Engine-only trailing content (aeon's Aether bus indicator). */
  right?: React.ReactNode;
  /** Repaint signal: aeon mutates in place and ticks a clock, classic swaps an
   *  immutable doc. Nothing shared can straddle that, so it is explicit. */
  versionKey?: unknown;
}

export default function MapStatusBar({ port }: { port: MapStatusPort }) {
  const info = statusLabel(port);
  const zoomPercent = Math.round(port.zoom * 100);

  const left = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: T.accent, fontWeight: 600 }}>{info.label}</span>
      <span style={{ color: T.textBase }}>{port.layer.toUpperCase()}</span>
      <span style={{ color: T.textLo }}>{port.zoneName}</span>
      <span style={{ color: T.textLo }}>{port.scopeInfo}</span>
      <span style={{ color: T.textLo }}>{port.contextInfo || info.hint}</span>
    </span>
  );

  const right = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconButton icon={<span>−</span>} label="Zoom out" onClick={() => port.onZoom(port.zoom / 1.5)} />
      <span style={{ minWidth: 36, textAlign: 'center', color: T.textBase }}>{zoomPercent}%</span>
      <IconButton icon={<span>+</span>} label="Zoom in" onClick={() => port.onZoom(port.zoom * 1.5)} />
      {port.right && <span style={{ marginLeft: 8 }}>{port.right}</span>}
    </span>
  );

  return <StatusBar left={left} right={right} />;
}
```

- [ ] **Step 6: Write the aeon port**

Create `src/renderer/providers/map-status-aeon.ts`. Move `AetherStatus` from the old file verbatim — it is aeon's bus indicator and belongs on the aeon side. Because it renders JSX, either give this provider a `.tsx` extension or keep `AetherStatus` in a small `components/AetherStatus.tsx` and import it; **prefer the latter**, so `providers/*.ts` stays JSX-free like its siblings.

Port contents, derived from the old component's reads (`MapStatusBar.tsx:30-56`):

- `tool`, `pasting`, `selectedChunkId`, `activeSectionIndex` ← `useEditorStore`
- `layer` ← `useEditorStore.editingLayer`
- `zoom` / `onZoom` ← `useViewStore`
- `zoneName` ← `getCurrentZone(useProjectStore.getState())?.name ?? ''`
- `scopeInfo` ← `` `Section ${activeSectionIndex}` ``
- `contextInfo` ← the stamp-chunk branch verbatim, including its three cases (no chunks loaded / none selected / `Chunk: N — Alt: art only`). Keep the comment explaining that Alt is aeon's stamp only.
- `right` ← `<AetherStatus />`

- [ ] **Step 7: Write the classic port**

Create `src/renderer/providers/map-status-classic.ts`. Source the equivalents from the bespoke bar in `ClassicProjectView.tsx:107-137` — **read it before writing this**, and preserve what it showed:

- `layer` ← `useEditorStore.editingLayer` (shared since plan 4 — pre-flight fact 1)
- `zoneName` ← the act label classic showed (S1 badge + act label)
- `scopeInfo` ← `` `${W}×${H} chunks · ${nChunks} chunks · ${nBlocks} blocks · ${nObjects} objects` ``
- `contextInfo` ← `''` (classic's stamp context already rides its own hint line; do not duplicate)
- `right` ← `undefined` (no Aether bus for classic)
- `versionKey` ← classic's doc version / dirty tick

**The dirty dot from the old classic bar does not move here** — the tab strip already carries it (`shell/dirty-tabs.ts`), and duplicating it was a legacy-shell artifact. Note this in the file.

- [ ] **Step 8: Point the aeon facet modules at the neutral bar**

In `facet-registry.ts`, `mapFacet()`'s `StatusBar` becomes a component that resolves the aeon port and renders the neutral bar. Delete `src/renderer/shell/MapStatusBar.tsx`.

- [ ] **Step 9: Verify**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: tsc clean, 0 failed, test count +1 file / +2 tests over baseline. Aeon's status bar must look **identical** — this task changes no aeon behaviour.

- [ ] **Step 10: Commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(workspace): the map status bar becomes neutral over an engine port"
```

**Outcome — four amendments made during review. Later tasks follow these, not the text above:**

1. **`versionKey` is NOT on `MapStatusPort`.** The field exists in sibling shared components to force a canvas repaint via React `key`; a text-only bar rendering fresh scalars every render has nothing to repaint, so it was inert by construction. Dropped rather than kept for symmetry. **The rule this sets: no unused port fields.** Tasks 2 and 7 should apply the same test — `PropertiesPanel` and `ChunkGrid` both render from state that genuinely can go stale, so they almost certainly *do* need one; justify it, don't copy it.
2. **Ports live in the `-model.ts`, not the `.tsx`** — matching `chunk-grid-model.ts`, `object-inspector-model.ts`, `object-list-model.ts`. A provider must never reach into a `.tsx` for its contract.
3. **`components/shared/` has zero `state/` references, and there is now a guard test enforcing it** (`components/shared/__tests__/shared-purity.test.ts`, verified to fail on a planted violation). Import `ToolId` from `workspace/tool-meta`, which re-exports it precisely so callers "don't reach past this module into the adapter" — not `EditorTool` from `state/editorStore`. **Task 2 will trip this guard if it imports a store type.**
4. **Pure helpers in providers are exported and node-tested**, matching every sibling in `providers/__tests__/`. The stated "+N tests" figures in this plan are predictions, not budgets — never suppress a test to hit one.

---

### Task 2: Neutral `PropertiesPanel`

**CONTRACT ONLY — the code blocks below are ILLUSTRATIVE.** `PropertiesPanel.tsx` (199 LOC) was measured, not read line-by-line. Read it, satisfy the contract, derive the code.

**Measured facts:** imports `useProjectStore, getCurrentAct, getCurrentZone, getActiveLevel` (×4 sites), `useViewStore` (×4), `useEditorStore, executeCommand` (×7), `useHistoryVersion` (×1). **One throw site: `:122`, `executeCommand({type:'set-section-bg'})` from the Background `<select>` onChange at `:117-129`.** Every rendered value is aeon-shaped (`act.sections[i]`, `section.bgLayoutRef`, `project.bgLibrary`, `zone.tileset.tiles.length`, `selection: {type:'object'|'ring', index}`). Plan 4 added a `showObjectSelection` prop, passed by the layout facet only.

**Files:** Create `src/renderer/components/shared/PropertiesPanel.tsx`, `src/renderer/providers/properties-aeon.ts`, `src/renderer/providers/properties-classic.ts`. Delete `src/renderer/components/PropertiesPanel.tsx`. Modify `layout-facet.tsx`, `objects-facet.tsx`.

> **PLAN BUG, found during execution:** `PropertiesPanel` is mounted at **four** facets, not two — `rings-facet.tsx` and `collision-facet.tsx` mount it too. All four must be repointed; leaving two pointed at a deleted module does not compile. The "Modify" line above was written from the spec's facet table rather than from a grep. **Grep for mount sites before trusting any file list in this plan.**

**Contract — the neutral component:**

```ts
// ILLUSTRATIVE
export interface PropertyRow { label: string; value: string }

export interface PropertySection {
  title: string;
  rows: PropertyRow[];
  /** Rendered under the rows. The ONLY interactive control this panel has. */
  select?: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange(value: string): void;
  };
}

export interface PropertiesPort {
  sections: PropertySection[];
  /** Plan 4's prop, preserved: the Selected Object readout is layout-facet only,
   *  so the Objects facet keeps its editor without a duplicate readout. */
  showObjectSelection: boolean;
  selection: { kind: 'object' | 'ring'; index: number } | null;
  versionKey?: unknown;
}
```

**Requirements:**

1. **No store import, no `executeCommand` import** in `components/shared/PropertiesPanel.tsx`. The background `<select>`'s write becomes `select.onChange`; the aeon provider supplies a callback that calls `executeCommand`, and the classic provider **omits `select` entirely** — classic has no per-section background. This is what removes the `:122` crash.
2. `showObjectSelection` keeps plan 4's exact semantics — passed `true` by the layout facet, `false`/absent by objects and any other mount.
3. The aeon provider reproduces today's rendered output **exactly**. This task must not change what aeon shows.
4. The classic provider supplies what `ClassicProjectView.tsx:107-131` showed that the status bar does not already carry (Task 1 took the dims/counts line). If that leaves classic with **no** sections, say so in the file and have the classic port return `sections: []`; the panel then renders nothing and the classic facet modules simply do not mount it. **Do not invent classic properties to fill the panel.**

**Tests:** a node test for whatever pure row-building helper you extract (follow `object-list-model.test.ts`'s style). No `.tsx` test — the suite does not collect them (spec §3.0.4).

**Acceptance:** `grep -n "executeCommand\|useProjectStore\|useEditorStore\|useViewStore" src/renderer/components/shared/PropertiesPanel.tsx` returns **nothing**. `tsc` clean, whole suite 0 failed, aeon's panel visually unchanged.

- [ ] **Step 1:** Read `src/renderer/components/PropertiesPanel.tsx` in full.
- [ ] **Step 2:** Write the failing test for the row-building helper.
- [ ] **Step 3:** Run it, confirm it fails.
- [ ] **Step 4:** Write the model + neutral component + both providers; delete the old file; repoint `layout-facet.tsx` and `objects-facet.tsx`.
- [ ] **Step 5:** Run the acceptance grep and the full suite.
- [ ] **Step 6:** Commit.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(workspace): the properties panel becomes neutral over an engine port"
```

---

# STEP G — classic into the workspace

### Task 3: Facet modules become engine-keyed; the silent fallback dies

This is G's load-bearing change and everything after it depends on the shape. See decision 3 for why this overrides `facet-canvases.ts:7-9` and spec §3.1.

**Files:** Modify `src/renderer/workspace/facet-registry.ts`, `register-facets.ts`, `LevelWorkspace.tsx`. Delete `src/renderer/workspace/facet-canvases.ts`. Rewrite `src/renderer/workspace/__tests__/facet-canvases.test.ts` → `facet-modules.test.ts`.

- [ ] **Step 1: Write the failing registry test**

Create `src/renderer/workspace/__tests__/facet-modules.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { facetModules, registerFacetModule, moduleFor } from '../facet-registry';

const Stub = () => null;

describe('engine-keyed facet modules', () => {
  beforeEach(() => { facetModules.clear(); });

  it('resolves a module per (engine, facet) pair', () => {
    registerFacetModule(['aeon'], { id: 'layout', Canvas: Stub });
    expect(moduleFor('aeon', 'layout')).not.toBeNull();
    expect(moduleFor('s1', 'layout')).toBeNull();
  });

  it('registers one module for several engines where they have converged', () => {
    registerFacetModule(['aeon', 's1'], { id: 'objects', Canvas: Stub });
    expect(moduleFor('aeon', 'objects')).toBe(moduleFor('s1', 'objects'));
  });

  it('returns null rather than another engine module for an unregistered pair', () => {
    registerFacetModule(['aeon'], { id: 'rings', Canvas: Stub });
    expect(moduleFor('s1', 'rings')).toBeNull();
  });

  it('registers if absent, so HMR and repeated boot do not duplicate', () => {
    const a = { id: 'layout' as const, Canvas: Stub };
    const b = { id: 'layout' as const, Canvas: () => null };
    registerFacetModule(['aeon'], a);
    registerFacetModule(['aeon'], b);
    expect(moduleFor('aeon', 'layout')).toBe(a);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx vitest run src/renderer/workspace/__tests__/facet-modules.test.ts
```

Expected: FAIL — `moduleFor` is not exported.

- [ ] **Step 3: Re-key the registry**

In `facet-registry.ts`: key by `` `${engine}:${facet}` ``, exactly as the deleted `facet-canvases.ts:20` did. Replace `registerFacetModule(m)` with `registerFacetModule(engines: OpenEngine[], m: FacetModule)` and add `moduleFor(engine, facet): FacetModule | null`. Widen `mapFacet(id, slots)` to `mapFacet(id, slots, canvas)` so s1 can reuse the map-facet shape with its own canvas.

**`facetModules` stops being a `createRegistry<FacetModule>`.** That helper keys strictly on `item.id` (`core/shell/registry.ts` — `RegistryItem` requires `id: string`, and `register` **throws** on a duplicate id), so a composite `engine:facet` key does not fit it and registering the same facet for two engines would throw. Use a bespoke composite-key class instead, exactly as `facet-canvases.ts:22-38` did — that file was written that way for this same reason. It must expose `get`, `clear()` (test support, as `facet-visibility.test.ts:14` already calls it) and register-if-absent semantics for HMR.

- [ ] **Step 3a: Make the pill filter engine-aware**

`FacetBar.tsx:15` is `facetsFor(granted).filter((f) => facetModules.get(f.id))` — **engine-blind**. Left as-is, classic would show a pill for every granted facet regardless of whether s1 has a module for it, and clicking one would land on `FacetUnavailable`. Give `FacetBar` an `engine` prop (`LevelWorkspace` already has it) and filter with `moduleFor(engine, f.id)`.

This turns the has-module filter into the "no dead chrome" rule working per engine: a facet granted by the manifest but unserved by the renderer simply shows no pill. Update the same expression in `facet-visibility.test.ts:20,29`, and add a case asserting a granted-but-module-less facet yields **no** pill for that engine.

Replace the file header's scope note with the decision-3 rationale, and carry over the useful half of the deleted `facet-canvases.ts` docblock:

```ts
// Facet modules are keyed by (engine, facetId). A facet's IDENTITY — id, label,
// order — stays neutral on core FacetDescriptor (core/shell/facets.ts); this
// registry supplies only SLOTS, and slots genuinely differ per engine until each
// one converges. A module may register for several engines, so a converged facet
// is still written once.
//
// This replaces the Canvas-only facetCanvases registry (spec §3.1, which assumed
// only the Canvas differs). §3.0.1 corrected that: ~10 slot components were
// aeon-store-coupled, several calling executeCommand, which THROWS for a non-aeon
// document. Two registries could not express that, and the Canvas-only version
// fell back to aeon's module for an unregistered pair — silently rendering aeon's
// MapViewport against an empty projectStore. There is no fallback now: an
// unregistered pair resolves to null and the workspace says so.
```

- [ ] **Step 4: Run the test, confirm it passes**

Expected: 4 passed.

- [ ] **Step 5: Update `register-facets.ts`**

```ts
export function registerAeonFacetModules(): void {
  registerBuiltinFacets();
  for (const m of [layoutFacet, artFacet, objectsFacet, ringsFacet, collisionFacet, paletteFacet]) {
    registerFacetModule(['aeon'], m);
  }
}
```

The `registerFacetCanvas` loop and its import go away — the Canvas rides its module.

- [ ] **Step 6: Remove the fallback in `LevelWorkspace.tsx`**

Replace lines 44-45 and 69-75 with a single engine-keyed resolve. The `?? facetModules.get('layout')` fallback also goes: with modules keyed by engine, falling back to another facet is the same class of lie as falling back to another engine.

```tsx
  const engine = useOpenEngine();
  const mod = moduleFor(engine, facetId);
  if (!mod) return <FacetUnavailable engine={engine} facetId={facetId} />;
  const { Canvas, ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
```

`FacetUnavailable` is a small local component rendering a centred `T.textLo` line — `This engine has no {facetId} editor yet.` A granted facet with no module is a **profile bug** (the manifest granted something the renderer cannot serve); make it visible rather than blank. Keep `useOpenEngine()` hoisted above the guard — a hook may not sit after an early return, which is the conditional-hook error a previous plan shipped.

- [ ] **Step 7: Delete `facet-canvases.ts`, carrying its surviving assertions across**

`facet-canvases.test.ts` is not purely about the deleted registry. Before removing it, **move these into `facet-modules.test.ts`**, re-expressed against `moduleFor`:

- `:42-47` — `registerAeonFacetModules()` registers a canvas for every aeon facet (now: a module for every aeon facet).
- `:63-69` — the five map facets have `mapOverlays: true` and `art` does not. This is what keeps `ViewMenu` off the composer; losing it loses that guarantee.

`:54`'s `canvasFor('s1','layout')` is null assertion is **inverted** by this plan — after Task 4, `moduleFor('s1','layout')` is non-null. Rewrite it rather than delete it.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git rm src/renderer/workspace/facet-canvases.ts \
         src/renderer/workspace/__tests__/facet-canvases.test.ts
```

- [ ] **Step 8: Verify**

`npx tsc --noEmit` clean; whole suite 0 failed. **Aeon must be completely unaffected** — same pills, same slots, same canvas. Net test count: −1 file (facet-canvases) +1 file (facet-modules).

- [ ] **Step 9: Commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(workspace): facet modules key by engine; drop the silent aeon canvas fallback"
```

- [ ] **Step 10: Two carry-forwards from Task 2's review, since this task rewrites `objects-facet.tsx` anyway**

Both were deliberately kept out of Task 2 — its change added **zero** delta to either, and folding an unrelated pre-existing fix into that diff would have muddied it.

1. **Leaf-wrap `useAeonObjectInspectorPort`.** `providers/object-inspector-aeon.ts:182` is called from `ObjectsPanels`, i.e. the whole panel column, so `liveEditVersion` — bumped **per mousemove during an object drag** — re-renders the column. Wrap the mount the way `ChunkLibrary.tsx:12-15` documents and Task 2 did for `AeonPropertiesPanel`: subscriptions belong in a leaf, not the column. The leaf also unmounts when the user collapses the section, which the hoisted call does not.
2. **`React.memo` the `Row` in `components/shared/ObjectList.tsx:75`.** It is the expensive sibling in that column — roughly 82 rows × ~5 elements re-rendering per mousemove during a drag. (No canvas cost: `versionKey` is stable, so `<Thumb key={versionKey}>` is not remounted.)

Neither is a perf emergency — the measured cost is small against a full-viewport repaint — but this is the commit where they are free.

---

### Task 4: Register s1's facet modules; drop the collision grant

**Files:** Create `src/renderer/workspace/facets/s1-facets.tsx`. Modify `src/core/project/s1/index.ts`, `register-facets.ts`, `App.tsx`. Modify `src/renderer/workspace/__tests__/facet-visibility.test.ts`.

- [ ] **Step 1: Drop `collision` from the s1 grant**

`src/core/project/s1/index.ts:350`:

```ts
        // Classic has no collision-editing UI: classicSetColind's only caller is
        // the agent handler, and classic's sole collision affordance is a
        // read-only overlay. Granting the facet would put a Collision pill over
        // an aeon-only CollisionPalette (spec §3.0.3). Owner decision 2026-08-13:
        // drop the grant now, restore this entry when the classic collision
        // editor lands as its own designed feature.
        facets: ['layout', 'art', 'objects', 'palette'],
```

Update the existing s1 case in `facet-visibility.test.ts` to assert four facets, and replace its §3.0.3 comment with a pointer to this decision.

- [ ] **Step 2: Run the visibility test, confirm it passes**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx vitest run src/renderer/workspace/__tests__/facet-visibility.test.ts
```

- [ ] **Step 3: Write the s1 facet modules**

Create `src/renderer/workspace/facets/s1-facets.tsx`. Four modules. **Compose existing components — write no new UI here.**

**Signature note (changed by Task 3's review):** `mapFacet` is `mapFacet(id, slots)` where `slots` is `Pick<FacetModule, 'Canvas' | 'ToolDock' | 'StatusBar' | 'RightPanel' | 'BottomExtra'>`. The earlier plan text proposed a positional third `Canvas` argument; that was a **trap** and was removed. It let an engine override only the Canvas while silently inheriting `StatusBar: AeonMapStatusBar`, whose port reads `projectStore.project` — **null for a classic open** — rendering aeon vocabulary over an empty aeon store beside a classic canvas. That is the bug Task 3 exists to delete, one slot over. **s1 must supply its own `Canvas` and `StatusBar`.**

**`MapFacetDock` is correct for classic as-is — do not build a classic tool dock.** A Task 3 reviewer claimed otherwise, citing `classic-surface.ts`'s docblock that "classic runs its own tool system (`classicLevelStore.tool`)". That claim is **false and was verified false**: `classicLevelStore` has no tool state; its only `setTool` reference is a write *to* `editorStore`. `ClassicLevelViewport.tsx:123-124` reads `useEditorStore.tool`, and `toolsForFacet` already resolves classic's set from the s1 manifest's `facetTools.layout`. Plan 4 merged the two vocabularies deliberately. That stale docblock misled two separate agents on this branch and was corrected in Task 3.

- [ ] **Step 3b: Auto-heal an unserved facet (deferred here from Task 3)**

Task 3 made an unresolvable `(engine, facet)` render `FacetUnavailable` inside the shell rather than as a dead-end screen. This step adds the self-heal, now that a real mismatch exists to test against — s1 grants `collision` with no module until Step 1 drops the grant, and `focusClassicSurface` writes `setFacet` with no served check.

Put the decision in a **pure exported helper**, not the component — it is the only way to test it, since `.tsx` is not collected:

```ts
// facet-tools.ts
export function resolveFacet(
  engine: OpenEngine | null,
  granted: readonly FacetCapability[],
  requested: FacetCapability,
): FacetCapability | null
```

Returns `requested` when it resolves, else the first granted∩registered facet, else `null`. Redirecting to a **valid facet of the same engine** is not the "silent fallback" the plan forbids — the deleted fallback lied about the *data* (aeon's viewport over an empty store); this changes the *selection*, and it is made non-silent by writing back through `switchFacet(tabId, resolved)` so the active pill matches the screen. **The write cannot happen during render** — put it in a `useEffect` above the early return. `FacetUnavailable` stays as the terminal state, because the served set can legitimately be empty.

| Facet | Canvas | ToolDock | ToolOptions | RightPanel | BottomExtra | StatusBar |
|---|---|---|---|---|---|---|
| `layout` | `ClassicLevelViewport` | `MapFacetDock facet="layout"` | — †6 | `ObjectInspector` + `ObjectList` †7 | — | neutral bar + classic port (Task 1) |
| `objects` | `ClassicLevelViewport` | `MapFacetDock facet="objects"` | — | `ObjectInspector` + `ObjectList` | — | neutral bar + classic port |
| `art` | `ClassicComposerDock` | — | — | `ClassicPalettePanel` | — | — |
| `palette` | `ClassicComposerDock` | — | — | `ClassicPalettePanel` | — | — |

**Carried forward from Task 1's review — do this when you wire classic's status bar:** the old classic bar rendered load failures in `T.error` (`ClassicProjectView.tsx:118`), but `classicScopeInfo` now returns `'load failed'` into the neutral bar's `T.textLo` span. Add `scopeTone?: 'normal' | 'error'` to `MapStatusPort` **here**, where the consumer finally exists — it was deliberately not added in Task 1, which would have made it a third unused port field. Losing the red on the one state the user most needs to notice is a silent downgrade.

**† These slots are deliberately incomplete here, because the components do not exist yet.** Registering a module that imports something unwritten does not compile, so:

- **†6** — layout's `ToolOptions` stays `undefined`. Task 6 extracts classic's contextual hint line out of the viewport's `OptionBar` and fills this slot.
- **†7** — layout's `RightPanel` mounts the inspector and list only. Task 7 adds `ChunkPicker` to it, along with the layout/visibility decisions that task owns.

Do not forward-reference either. Each later task edits this file when its component is ready.

Set `mapOverlays: true` on `layout` and `objects` only — `ViewMenu` must not appear over the composer, which never reads `viewStore.overlays`.

**Note in the file:** `art` and `palette` share `ClassicComposerDock` because classic's composer is one surface with its own internal tabs. Merging it with aeon's staged pixel doc is **step H**, which spec §3.5 flags as the hardest piece and possibly not fully shareable. G re-homes it unchanged.

- [ ] **Step 4: Register them**

In `register-facets.ts`, add `registerS1FacetModules()`, and call it wherever `registerAeonFacetModules()` is called (`App.tsx` mount, and any test setup — grep for it). Registration must happen before any project can load, which is already the ordering `LevelWorkspace.tsx:38-43` documents.

- [ ] **Step 5: Verify**

`tsc` clean; whole suite 0 failed. Classic still renders through `LegacyWorkspace` at this point — **nothing user-visible changes yet.** That is deliberate: the registry is populated one commit before it is switched on, so a failure here is isolated from a failure there.

- [ ] **Step 6: Commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "feat(workspace): register s1 facet modules; drop the unbacked collision grant"
```

---

### Task 5: One undo/redo key handler on the workspace

Pre-flight fact 2: the handler exists four times (`ClassicProjectView.tsx:87-104`, `MapViewport.tsx:546-551`, `art-facet.tsx:209-214`, `SpriteMode.tsx:96-101`) and classic's copy dies with its file. All four call the same `focusedHistory()`. Hoist one; keep `SpriteMode`'s, which lives in a different pane.

**Files:** Modify `LevelWorkspace.tsx`, `MapViewport.tsx`, `art-facet.tsx`. Create `src/renderer/workspace/__tests__/undo-keys.test.ts`.

- [ ] **Step 1: Write the failing guard test**

The suite cannot render or dispatch events (spec §3.0.4), so this is a source guard in the style of `classic-surface.test.ts`.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const R = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(R, p), 'utf8');

describe('level undo keys live in exactly one place', () => {
  it('LevelWorkspace owns the handler', () => {
    const src = read('workspace/LevelWorkspace.tsx');
    expect(src).toContain('focusedHistory()?.undo()');
    expect(src).toContain('levelKeysEnabled()');
    expect(src).toContain('isTypingTarget(');
  });

  // Two canvases under one workspace each binding window keydown means one
  // Ctrl+Z undoes twice the moment both are mounted. The absence is the point.
  it('the canvases do not bind their own', () => {
    for (const p of ['components/MapViewport.tsx', 'workspace/facets/art-facet.tsx']) {
      expect(read(p)).not.toContain('focusedHistory()?.undo()');
    }
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Expected: FAIL on both — `LevelWorkspace` has no handler, and both canvases still have theirs.

- [ ] **Step 3: Move the handler**

Add to `LevelWorkspace.tsx` the effect from `ClassicProjectView.tsx:87-104` **verbatim** — same guards, same key set, same `preventDefault` placement. Import `levelKeysEnabled` and `isTypingTarget` from wherever `ClassicProjectView` imports them. Delete the blocks from `MapViewport.tsx:546-551` and `art-facet.tsx:209-214`, and any now-unused `focusedHistory` import.

Comment it:

```tsx
  // ONE level-undo binding for both engines. It was duplicated per canvas
  // (MapViewport, art-facet) plus once in the deleted classic shell; with
  // classic and aeon under this workspace, two window bindings would mean one
  // Ctrl+Z undoing twice. SpriteMode keeps its own — different pane, and
  // levelKeysEnabled() is what keeps this one inert under a sprite tab.
```

- [ ] **Step 4: Run the guard, confirm it passes; then plant a violation and confirm it fails**

Re-add `focusedHistory()?.undo()` to `MapViewport.tsx`, re-run, confirm **FAIL**, then revert. The status doc records two source guards that were green because they scanned the wrong thing — **verify the failure before believing the pass.**

- [ ] **Step 5: Verify and commit**

`tsc` clean; whole suite 0 failed.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(workspace): one level undo/redo key binding for both engines"
```

---

### Task 6: Classic's OptionBar stops duplicating the workspace header

Pre-flight fact 1: `ClassicLevelViewport`'s `OptionBar` (`:950-981`) renders Tool chips, Plane FG/BG and four Overlay chips off **the same stores** `LevelWorkspace`'s header already drives (`:52-55` plane, `:63` `ViewMenu`). Under the shared shell those are two live copies of one control.

**Files:** Modify `src/renderer/components/classic/ClassicLevelViewport.tsx`, `src/renderer/workspace/facets/s1-facets.tsx`.

- [ ] **Step 1: Delete the duplicated controls**

From the `OptionBar`, remove the `Plane` group (`:957-960`) and the `Overlays` group (`:961-966`), with their `<Divider/>`s. The header owns both, for both engines.

Remove the Tool chip row (`:951-956`) as well — `MapFacetDock` renders the same list from the same `toolsForFacet('layout')`, and s1's layout module (Task 4) mounts it in the `toolDock` slot. This is the drop-in the status doc recorded plan 4 as leaving ready.

- [ ] **Step 2: Keep the hint line, and move it to `ToolOptions`**

The trailing contextual hint (`:969-980` — stamp id + `∞loop`, "click to place …", the FG/BG select hints) is classic's, has no equivalent anywhere, and is genuinely useful. Extract it into a small component in `s1-facets.tsx` (or its own file beside the viewport) mounted in the `ToolOptions` slot. It reads `editorStore.tool`, `classicLevelStore.selectedChunkId/stampLoop`, `editorStore.editingLayer` and `armedPlacementId` — **all already-neutral or classic-owned reads.**

**Watch the guard:** if the extracted component references any `classic(Set|Edit|Add)*` symbol it must be added to `COMMAND_SITES` with a `classicSurfaceProps('map')` claim (pre-flight fact 6). It should only *read*, so it should not trip the guard — confirm with `npx vitest run src/renderer/components/classic/__tests__/classic-surface.test.ts`.

- [ ] **Step 3: Confirm the derivation still routes through `armedPlacementId`**

`armedObjectId` is a **payload, not a mode**, since plan 4 — it goes stale on a tool switch and nothing may read it raw. The hint line must keep using `armedPlacementId(tool, armedObjectId)` (`state/classic-placement.ts`). The compiler cannot see this; `state/__tests__/classic-placement.test.ts` is the guard. Run it.

- [ ] **Step 4: Verify and commit**

`tsc` clean; whole suite 0 failed. Classic still renders through `LegacyWorkspace`, so **the old shell now shows a viewport with no tool/plane/overlay chips** — expected and temporary, resolved by Task 9. Note it in the commit body so a bisect does not mistake it for a regression.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(classic): the map viewport stops duplicating the workspace header controls"
```

---

### Task 7: Re-home `ChunkPicker` into the Layout facet's right panel

**CONTRACT ONLY — ILLUSTRATIVE.** Pre-flight fact 10: `ChunkPicker` and `ChunkLibrary` are already one component behind two ports; the work is placement and a visibility rule, not a rewrite.

**Files:** Modify `src/renderer/providers/chunk-grid-classic.ts`, `src/renderer/workspace/facets/s1-facets.tsx`.

**Requirements:**

1. `ChunkPicker` moves from a bottom strip into s1's layout `RightPanel`, inside a `CollapsibleSection id="map.palette"` — matching aeon's `layout-facet.tsx:24-26` placement so the two engines put the same thing in the same place.
2. Decide `layout: 'strip'` vs `'panel'` in `chunk-grid-classic.ts`. **Prefer `'panel'`** for parity with aeon in the same slot; if classic's thumbs do not fit the 240–260px panel, keep `'strip'` inside the panel and say why in the file.
3. **The visibility gate is an open question — resolve it by reading, not by assuming.** Aeon's picker mounts only while `tool === 'stamp-chunk' && !pasting`. Classic's picker also **arms** the stamp tool on select (`classicLevelStore.ts:349` → `editor.setTool('stamp-chunk')`), so gating classic's on `tool === 'stamp-chunk'` risks a trap: switch to `select`, the picker vanishes, and the user cannot get back to stamping from the panel. **Recommended:** classic's picker is always mounted in the layout panel; selecting a chunk arms the tool, which is the existing behaviour and the escape hatch. Record the deviation from aeon's gate in the file.
4. `ChunkPickerHeader`'s loop-flag toggle rides along as `HeaderExtra`, unchanged.
5. **Open decision 3 stays closed:** classic's chunk picker deliberately claims **no facet**, so clicking a chunk does not steal focus from the composer beside it. Do not add `classicSurfaceProps` to it.

**Acceptance:** classic's Layout facet shows the chunk picker in its right panel; picking a chunk still arms stamp; the loop toggle still appears only for `$01..$7F`. `tsc` clean, suite 0 failed.

- [ ] **Step 1:** Read `providers/chunk-grid-classic.ts`, `chunk-grid-aeon.ts`, `layout-facet.tsx`, `ChunkPicker.tsx`, `ChunkPickerHeader.tsx`.
- [ ] **Step 2:** Move the mount into s1's layout `RightPanel`; settle 2 and 3 with the reasons written into the file.
- [ ] **Step 3:** Run `npx vitest run` and `npx tsc --noEmit`.
- [ ] **Step 4:** Commit.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "feat(classic): the chunk picker moves into the Layout facet's right panel"
```

---

### Task 8: Resolve `ResolutionReportPanel` against Project Setup

**CONTRACT ONLY — ILLUSTRATIVE.** Pre-flight fact 9: `ProjectSetupTab`'s own docblock says it already **is** the resolution report promoted to an editor. Spec §3.7 called this a move; it is probably a delete. **Verify before doing either.**

**Files:** Read `src/renderer/components/setup/ProjectSetupTab.tsx`, `setup-model.ts`, `components/classic/ResolutionReportPanel.tsx`, `report-grouping.ts`.

- [ ] **Step 1: Compare coverage**

Build the honest answer to: **is there anything `ResolutionReportPanel` shows that `ProjectSetupTab` does not?** Compare `buildSetupRows` (`setup-model.ts`) against `groupEntriesByZone` (`report-grouping.ts`). Candidates for a real gap: per-zone grouping with headers, `defaultCollapsed` when a zone is fully resolved, and the per-entry `detail`-or-`path` line.

**Third thing to place, surfaced by Task 1's review:** classic's old status bar carried a one-line roll-up in its `statusRight` — `` `${resolved}/${total} files resolved` `` (`ClassicProjectView.tsx:107-137`). Task 1 deliberately did not move it onto the neutral status bar (`right` is `undefined` for classic; it is a project-level fact, not a map-level one). `ResolutionReportPanel.tsx:41` renders `resolved/total` **per group**, so the underlying numbers are not lost — but the at-a-glance roll-up is, and Task 9 deletes the only thing that showed it. Give it a home in Project Setup or state in the commit message that dropping it is deliberate. **Do not let it vanish silently.**

- [ ] **Step 2: Act on the answer**

- **No gap:** delete `ResolutionReportPanel.tsx`. Keep `report-grouping.ts` **only** if something still imports it; it has its own passing tests, so deleting it means deleting those too — check first.
- **Real gap:** port the missing part into `ProjectSetupTab` (its `setup-model.ts` is the tested seam — put logic there, not in the `.tsx`), then delete the panel.

Either way `ResolutionReportPanel` stops being mounted, because its only mount is `ClassicProjectView.tsx:166-167`, which Task 9 deletes.

- [ ] **Step 3: State the finding in the commit message.** A future reader needs to know whether coverage was verified or assumed.

- [ ] **Step 4:** `tsc` clean, suite 0 failed. Commit.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(setup): the resolution report has one home"
```

---

### Task 9: Flip the shell; delete `LegacyWorkspace`, `ClassicProjectView`, `ZoneActTree`

The commit where classic stops feeling like a different app.

**Files:** Modify `src/renderer/App.tsx`. Delete `src/renderer/shell/LegacyWorkspace.tsx`, `src/renderer/components/classic/ClassicProjectView.tsx`, `src/renderer/components/classic/ZoneActTree.tsx`.

- [ ] **Step 1: Collapse the branch**

`App.tsx:189-195` becomes:

```tsx
            <div style={{ ...styles.tabPane, display: activeTab?.kind === 'level' ? 'flex' : 'none' }}>
              {/* One workspace, both engines (spec §3.7). The old ternary keyed
                  the classic branch off classicProjectStore and the aeon branch
                  off projectStore.config — two derivations that disagree mid-load,
                  which is what open-project.ts was built to end. */}
              {engine ? <LevelWorkspace /> : null}
            </div>
```

`engine` is the existing `useOpenEngine()` at `:118`. Delete the `LegacyWorkspace` import (`:7`) and the `classicOpen` selector (`:51`) **if nothing else uses it** — grep first; it may still gate an unrelated branch.

- [ ] **Step 2: Confirm nothing else mounts the deleted components**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  grep -rn "LegacyWorkspace\|ClassicProjectView\|ZoneActTree" src test
```

Expected after the edits: no production references. **`ClassicProjectView` must be gone from `classic-surface.test.ts`'s expectations too** if it is named there — check `COMMAND_SITES` and `CONTAINER_SURFACES` (`:84-100`).

- [ ] **Step 3: Re-home anything the deletions would drop**

Walk `ClassicProjectView`'s five owned behaviours (pre-flight fact 2 and the recon list) and confirm each has a home:

| Owned by `ClassicProjectView` | Home |
|---|---|
| undo/redo keydown (`:87-104`) | `LevelWorkspace` (Task 5) |
| bespoke status bar (`:107-136`) | neutral bar + classic port (Task 1) |
| `ZoneActTree` panel (`:155`) | Explorer Levels group (`explorer-data.ts:38-47`) + ⌘K |
| `ObjectInspector` / `ObjectList` / `ClassicPalettePanel` (`:159-163`) | s1 facet modules (Task 4) |
| `ResolutionReportPanel` (`:166-167`) | Task 8 |
| `ClassicComposerDock` + `ChunkPicker` bottomExtra (`:142`) | s1 art canvas (Task 4) + layout panel (Task 7) |
| module-level `lastResetHandle` reset effect (`:24`, `:72-77`) | **Drop it.** Its own comment (`:66-71`) says `classicProjectStore.openDirectory` already calls `reset()`; it is an idempotent backstop. If any new mount effect is added later, its remount-guard rationale must be carried over. |

**If any row has no home, stop — do not delete the file.**

- [ ] **Step 4: Delete**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git rm src/renderer/shell/LegacyWorkspace.tsx \
         src/renderer/components/classic/ClassicProjectView.tsx \
         src/renderer/components/classic/ZoneActTree.tsx
```

- [ ] **Step 5: Verify**

`tsc` clean; whole suite 0 failed. **This is the first task with real user-visible change** — it must be smoke-tested (Task 12) before the branch merges.

- [ ] **Step 6: Commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "feat(workspace): classic renders through LevelWorkspace; the legacy classic shell is deleted"
```

---

### Task 10: Delete `Toolbar`; give the sprite-doc pane its own header

Pre-flight fact 8: `Toolbar`'s last mount is the sprite pane. Its aeon zone/act selector is reachable **only** from there, and using it navigates the whole app away from the sprite doc — the Stage-3 carry-forward that spec §3.7 says deleting `Toolbar` resolves.

**Files:** Create `src/renderer/shell/SpriteDocHeader.tsx`. Modify `src/renderer/App.tsx`. Delete `src/renderer/components/Toolbar.tsx`.

- [ ] **Step 1: Audit what `Toolbar` offers before deleting it**

| `Toolbar` control | Home after this task |
|---|---|
| Undo / Redo (`:127-138`) | `SpriteDocHeader` (same `focusedHistory()` source) |
| Save chip + `canSaveActive` + "Saved!" flash (`:145-162`) | `SpriteDocHeader` |
| "unsaved" badge (`:164`) | tab-strip dirty dot (`shell/dirty-tabs.ts`) |
| Open + Recents ▾ (`:86-119`) | Explorer, HomeTab, ⌘K |
| Brand mark (`:79-82`) | HomeTab / Explorer |
| "Loading…" (`:168`) | dropped (aeon `projectStore.loading`; nothing depended on it) |
| aeon zone/act selector | **deliberately dropped** — see above |

- [ ] **Step 2: Write `SpriteDocHeader`**

Mirror `LevelWorkspace`'s header minus the facet bar: a spacer, Undo/Redo `Chip`s off `focusedHistory()` (with `useHistoryVersion()` for enabledness, exactly as `LevelWorkspace.tsx:32-33,64-65` does), and the Save chip lifted from `Toolbar:145-162` **including its disabled-reason `title` and its "Saved!" flash** — that flash is the only save confirmation in the sprite pane.

- [ ] **Step 3: Swap it in**

`App.tsx:220`: `<SpriteMode appBar={<SpriteDocHeader onSave={() => { void saveActive(); }} />} />`. Leave `SpriteMode`'s `appBar` prop required — a sprite doc always has a header.

- [ ] **Step 4: Delete `Toolbar` and confirm no references remain**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git rm src/renderer/components/Toolbar.tsx && grep -rn "Toolbar" src test
```

Expected: no hits other than unrelated words. If `openProject` / `openProjectByPath` in `App.tsx` are now unused, remove them **only if** nothing else calls them — the Explorer and ⌘K paths do, so check.

- [ ] **Step 5: Verify and commit**

`tsc` clean; suite 0 failed.

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "feat(shell): the sprite doc gets its own header; the legacy Toolbar is deleted"
```

---

### Task 11: `classic-surface` moves to `switchFacet`; widen the guard

Step E's whole purpose (status doc), deliberately left for G. Pre-flight fact 7: one production line.

**Files:** Modify `src/renderer/components/classic/classic-surface.ts`, `src/renderer/components/classic/__tests__/classic-surface.test.ts`.

- [ ] **Step 1: Widen the guard scan first**

Tasks 1, 2, 4, 6 and 7 moved classic surfaces into `workspace/facets/` and `components/shared/`. `SCAN_ROOTS` is `['components','providers']` (`:28-29`), so **`workspace/` is unscanned** — a classic command call landing in `s1-facets.tsx` would escape silently, which is exactly how this guard was escaped twice before. Add `'workspace'` to `SCAN_ROOTS`, then reconcile `COMMAND_SITES` with whatever the widened scan now finds.

- [ ] **Step 2: Confirm the widened guard fails on a planted violation**

Add `classicSetObjects` as a bare reference in `s1-facets.tsx`, run the guard, confirm **FAIL**, revert. Do not skip this — a guard that scans the wrong root passes for the wrong reason, and this one has done so twice.

- [ ] **Step 3: Make the switch**

`classic-surface.ts:62`: `setFacet` → `switchFacet`. Replace the `:17-21` docblock:

```ts
// switchFacet, not setFacet: it also re-scopes editorStore.tool via
// toolForFacet(). That was WRONG while classic ran its own tool vocabulary — it
// would have clobbered the classic tool with an aeon one — which is why this was
// setFacet until step E merged the vocabularies. toolsForFacet() now reads
// openCapabilities().facetTools, and the s1 manifest declares layout's set
// (core/project/s1/index.ts), so the re-scope resolves to classic's own tools.
```

- [ ] **Step 4: Verify the routing tests**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  npx vitest run src/renderer/state/__tests__/history-routing.test.ts \
                 src/renderer/components/classic/__tests__/classic-surface.test.ts \
                 src/renderer/state/__tests__/classic-placement.test.ts
```

`history-routing.test.ts` has prose naming `setFacet` — update it to match.

**`editorStore` has no `reset()` and `tool` is a cross-engine singleton**: a test that leaves a tool set leaks into the next. `classicLevelStore.test.ts` restores it by hand in `beforeEach`. If this change makes another suite order-dependent, fix it the same way rather than adding a `reset()` here.

- [ ] **Step 5: Whole suite, then commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "refactor(classic): surface focus switches facets, re-scoping the shared tool"
```

---

### Task 12: Smoke test, then the status doc

**The node suite cannot see React, canvas or event ordering.** Every smoke-test failure of the previous two sessions was of that class. This task is not optional and its findings are not predictable from the suite.

**Files:** Create `scratchpad/rehome-harness.mjs`. Modify `docs/superpowers/plans/2026-08-13-stage4-status.md`.

- [ ] **Step 1: Drive the real app under CDP**

`AURORA_DEBUG_PORT` + `VITE_AURORA_DEBUG`; `__dbg` exposes `view()`, `setView()`, `activate()`. Follow plan 4's three harnesses in `scratchpad/` (`camera-`, `restore-`, `tool-split-harness.mjs`) — copy their connection boilerplate.

**Selector traps, both of which faked a failure in plan 4:** the ui kit's `Chip` is a `<span>`, not a button; object-library rows are buttons that **wrap** spans. **Verify the harness fails on a planted violation before believing a pass.**

- [ ] **Step 2: Walk the checklist on a real s1 project**

- [ ] Four pills — Layout, Art, Objects, Palette. **No Collision pill.**
- [ ] Layout: viewport paints; tool dock shows view / stamp-chunk / select / place-object; header FG/BG switches plane; View menu toggles Collision / Angles / Objects / Start; **each control appears exactly once.**
- [ ] Chunk picker in the right panel; picking a chunk arms stamp; loop toggle shows for `$01..$7F` only.
- [ ] Objects: list + inspector; select an object, edit a property, see it move.
- [ ] Art / Palette: composer mounts; palette edits commit.
- [ ] **Ctrl+Z once undoes once** (Task 5's double-binding risk), in both Layout and Art, and undo follows the focused facet.
- [ ] Ctrl+S saves the current document; Ctrl+Shift+S saves all dirty.
- [ ] Per-tab viewport restore still works across act tabs; a plane switch still refits (FG/BG grids differ in height).
- [ ] Sprite doc: header has Undo/Redo/Save; **no zone/act selector**; editing a sprite no longer navigates away.
- [ ] Explorer Levels group opens acts; ⌘K opens acts and Project Setup.
- [ ] **Aeon regression sweep:** open an aeon project, confirm all six pills, canvas, status bar, properties panel and undo are unchanged.

- [ ] **Step 3: Update the status doc**

Rewrite the "Remaining re-home steps" section: F and G done, **H the only step left**. Record: measured baseline; decisions 1–4 from this plan; that `openArtTiers()` **still has zero production consumers** and is waiting for H; the new traps found in smoke testing.

- [ ] **Step 4: Commit**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan5 && \
  git add -A && git commit -m "docs(ux): status — steps F and G landed"
```

---

## Merge

Only after Step 2's checklist passes and the owner has smoke-tested.

```bash
cd /home/volence/sonic_hacks/aurora && \
  git checkout master && git merge --no-ff feature/ux-stage4-plan5 && \
  npx tsc --noEmit && npx vitest run 2>&1 | tail -5 && \
  git push origin master
```

**Push it.** `origin/master` has been in sync since plan 1; leaving merges local is how it got 104 commits behind once.

Then: `git worktree remove .claude/worktrees/ux-plan5 && git branch -d feature/ux-stage4-plan5`.

---

## What this plan does NOT do

- **Step H — the shared Art facet.** Classic's art and palette facets mount `ClassicComposerDock` unchanged; aeon's mount theirs. `ArtToolOptions`, `TilesetPanel`, `PaletteEditor` and `ComposerCanvas` keep every aeon-store import and command call they have today, which is safe because **classic never mounts them**. `openArtTiers()` still has zero consumers. H is where `PaletteEditor` ↔ `ClassicPalettePanel` finally merges — recon named it the best-matched pair of the whole set, already sharing `art-shared/GenesisColorSliders.tsx`.
- **The classic collision editor** (decision 1). Separate designed feature; the `colind` model and its validating store command already exist and are tested.
- **Piece C** — guards/debt/TabStrip a11y/`ConfirmDialog` focus trap.
- **Piece D** — aeon BG bridge and band editor.
