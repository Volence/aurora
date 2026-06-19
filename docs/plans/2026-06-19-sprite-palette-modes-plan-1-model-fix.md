# Sprite Palette Modes — Plan 1 ("Model + character fix") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each sprite an explicit palette mode (zone-attached to a CRAM line, or standalone with its own colors), resolve/edit the canvas palette by that mode, and load the player palette into zone line 0 — which fixes the broken loaded-character palette.

**Architecture:** A pure `sprite-palette` module (mode + resolution + blank palette) feeds the sprite store's new per-sprite palette state; `SpriteCanvasHost` resolves the display palette by mode; `PaletteEditor` becomes mode-aware (line 0 editable in Sprite mode); project load seeds zone line 0 from the shared player palette; `loadEngineCharacter` binds to line 0 instead of the throwaway override.

**Tech Stack:** Electron + React 19 + TypeScript, Zustand, Vitest (node env). No new deps.

**Spec:** `docs/specs/2026-06-19-sprite-palette-modes-design.md` (this is Phase 1 of §12). Phases 2 (copy bridge + add-ons) and 3 (cross-sprite paste) are separate plans.

**Plan location:** `docs/plans/` (project convention).

**Verification convention:** pure logic is TDD'd; UI tasks verify via `npx tsc --noEmit` + `npm test` (the project doesn't DOM-test React) + `npm run build` + a named **visual checkpoint** in `npm run dev`. The raw-hex guardrail (`test/renderer/no-raw-hex.test.ts`, ceiling 0) stays in force — use the `T` tokens, no `#xxxxxx`.

---

## File Structure

**Create:**
- `src/core/art/sprite-palette.ts` — pure: `SpritePaletteMode`, `blankStandalonePalette()`, `resolveDisplayPalette(...)`.
- `src/renderer/components/sprite/SpritePaletteHeader.tsx` — mode toggle + zone-line picker + Clear palette / Clear canvas buttons.
- `test/art/sprite-palette.test.ts`.

**Modify:**
- `src/core/editing/sprite-history.ts` — extend `SpriteSnapshot` to carry palette state (so mode/standalone/clear are undoable with pixels).
- `test/editing/sprite-history.test.ts` — update the `snap()` helper + add a palette-restore case.
- `src/renderer/state/spriteStore.ts` — add `paletteMode`/`zoneLine`/`standalonePalette` + actions; remove `paletteOverride`; update `snap`/`undo`/`redo`/`setBuffer`/creation paths.
- `src/renderer/components/sprite/SpriteCanvasHost.tsx` — resolve palette by mode.
- `src/renderer/hooks/useProject.ts` — load the player palette into zone line 0.
- `src/renderer/components/sprite/export-sprite.ts` — `loadEngineCharacter` → zone line 0 (drop override); `openSprite`/`openDiscoveredSet` → standalone.
- `src/renderer/components/art/PaletteEditor.tsx` — mode-aware; line 0 editable in Sprite mode; standalone row.
- `src/renderer/components/sprite/SpriteMode.tsx` — mount `SpritePaletteHeader` above the palette.

---

## Task 1: `sprite-palette.ts` (pure) + tests

**Files:** Create `src/core/art/sprite-palette.ts`; Test `test/art/sprite-palette.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// test/art/sprite-palette.test.ts
import { describe, it, expect } from 'vitest';
import { blankStandalonePalette, resolveDisplayPalette } from '../../src/core/art/sprite-palette';
import type { PaletteLine } from '../../src/core/model/s4-types';

describe('sprite-palette', () => {
  it('blankStandalonePalette is 16 colors, index 0 transparent, rest opaque black', () => {
    const p = blankStandalonePalette();
    expect(p).toHaveLength(16);
    expect(p[0]).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(p[1]).toEqual({ r: 0, g: 0, b: 0, a: 255 });
  });
  it('resolveDisplayPalette: zone mode returns the bound zone line', () => {
    const lines: PaletteLine[] = [
      { colors: [{ r: 1, g: 1, b: 1, a: 255 }] },
      { colors: [{ r: 2, g: 2, b: 2, a: 255 }] },
    ];
    expect(resolveDisplayPalette('zone', 1, [], lines)).toBe(lines[1].colors);
  });
  it('resolveDisplayPalette: standalone mode returns the standalone palette', () => {
    const sp = blankStandalonePalette();
    expect(resolveDisplayPalette('standalone', 0, sp, [])).toBe(sp);
  });
  it('resolveDisplayPalette: zone mode with an out-of-range line returns []', () => {
    expect(resolveDisplayPalette('zone', 3, [], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run test/art/sprite-palette.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/core/art/sprite-palette.ts
import type { Color, PaletteLine } from '../model/s4-types';

/** How a sprite is colored: bound to a zone CRAM line, or its own private palette. */
export type SpritePaletteMode = 'zone' | 'standalone';

/** A fresh 16-color standalone palette: index 0 transparent, 1-15 opaque black. */
export function blankStandalonePalette(): Color[] {
  return Array.from({ length: 16 }, (_, i) => ({ r: 0, g: 0, b: 0, a: i === 0 ? 0 : 255 }));
}

/**
 * The colors a sprite renders against: the bound zone line (zone mode) or the
 * sprite's own palette (standalone). Returns [] if a zone line is out of range.
 */
export function resolveDisplayPalette(
  mode: SpritePaletteMode, zoneLine: number, standalonePalette: Color[], zoneLines: PaletteLine[],
): Color[] {
  if (mode === 'standalone') return standalonePalette;
  return zoneLines[zoneLine]?.colors ?? [];
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run test/art/sprite-palette.test.ts` (4 pass). Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add src/core/art/sprite-palette.ts test/art/sprite-palette.test.ts && git commit -m "feat(art): pure sprite-palette mode + resolution helpers"`

---

## Task 2: Extend `SpriteSnapshot` for palette state + tests

**Files:** Modify `src/core/editing/sprite-history.ts`; Modify `test/editing/sprite-history.test.ts`.

- [ ] **Step 1: Update the test's `snap()` helper + add a palette case (write first, expect fail)**

In `test/editing/sprite-history.test.ts`, update the `snap()` helper to include the new fields, and add a test:
```ts
// in snap(fill): add palette fields
function snap(fill: number): SpriteSnapshot {
  const b = createBuffer(4, 4); b.data.fill(fill);
  return { frames: [b], currentIndex: 0, selection: null,
    paletteMode: 'zone', zoneLine: 1, standalonePalette: [] };
}

it('round-trips palette state (mode/line/standalone) through undo', () => {
  const h = new SpriteHistory();
  const a: SpriteSnapshot = { frames: [createBuffer(4, 4)], currentIndex: 0, selection: null,
    paletteMode: 'zone', zoneLine: 2, standalonePalette: [] };
  h.record(a);
  const b: SpriteSnapshot = { frames: [createBuffer(4, 4)], currentIndex: 0, selection: null,
    paletteMode: 'standalone', zoneLine: 2, standalonePalette: [{ r: 9, g: 0, b: 0, a: 255 }] };
  const back = h.undo(b)!;
  expect(back.paletteMode).toBe('zone');
  expect(back.zoneLine).toBe(2);
  // returned standalone array is a clone (mutating it doesn't corrupt history)
  back.standalonePalette.push({ r: 1, g: 1, b: 1, a: 255 });
  const fwd = h.redo(back)!;
  expect(fwd.standalonePalette).toEqual([{ r: 9, g: 0, b: 0, a: 255 }]);
});
```
Run `npx vitest run test/editing/sprite-history.test.ts` → FAIL (snapshot type lacks the fields).

- [ ] **Step 2: Extend the snapshot type + clone in `sprite-history.ts`**

```ts
// add import at top:
import type { Color } from '../model/s4-types';
import type { SpritePaletteMode } from '../art/sprite-palette';

export interface SpriteSnapshot {
  frames: PixelBuffer[];
  currentIndex: number;
  selection: { x: number; y: number; w: number; h: number } | null;
  paletteMode: SpritePaletteMode;
  zoneLine: number;
  standalonePalette: Color[];
}
```
In `cloneSnap`, add the new fields:
```ts
function cloneSnap(s: SpriteSnapshot): SpriteSnapshot {
  return {
    frames: s.frames.map(cloneBuf),
    currentIndex: s.currentIndex,
    selection: s.selection ? { ...s.selection } : null,
    paletteMode: s.paletteMode,
    zoneLine: s.zoneLine,
    standalonePalette: s.standalonePalette.map((c) => ({ ...c })),
  };
}
```

- [ ] **Step 3: Run, verify pass** — `npx vitest run test/editing/sprite-history.test.ts` (all pass). `npx tsc --noEmit`.

- [ ] **Step 4: Commit** — `git add src/core/editing/sprite-history.ts test/editing/sprite-history.test.ts && git commit -m "feat(editing): SpriteSnapshot carries palette mode/line/standalone"`

---

## Task 3: spriteStore palette state (drop `paletteOverride`)

**Files:** Modify `src/renderer/state/spriteStore.ts`.

This is the core integration. Read the current file first.

- [ ] **Step 1: Add imports + state fields**

Add imports:
```ts
import type { SpritePaletteMode } from '../../core/art/sprite-palette';
import { blankStandalonePalette } from '../../core/art/sprite-palette';
import { useProjectStore, getCurrentZone } from './projectStore';
```
In the `SpriteState` interface, REMOVE `paletteOverride: Color[] | null;` and `setPaletteOverride`. ADD:
```ts
  paletteMode: SpritePaletteMode;
  zoneLine: number;            // 0-3 when paletteMode === 'zone'
  standalonePalette: Color[];  // 16 colors when paletteMode === 'standalone'
  setPaletteMode: (m: SpritePaletteMode) => void;
  setZoneLine: (line: number) => void;
  setStandalonePalette: (colors: Color[]) => void;
  clearPalette: () => void;    // -> standalone, blank palette
  clearCanvas: () => void;     // blank the current frame's pixels
```

- [ ] **Step 2: Update the `snap()` helper to include palette state**

```ts
const snap = (s: SpriteState): SpriteSnapshot => ({
  frames: s.frames, currentIndex: s.currentIndex, selection: s.selection,
  paletteMode: s.paletteMode, zoneLine: s.zoneLine, standalonePalette: s.standalonePalette,
});
```

- [ ] **Step 3: Initial state + remove the override-clear in `setBuffer`**

In the store's initial state, REMOVE `paletteOverride: null,`; ADD:
```ts
  paletteMode: 'zone', zoneLine: 1, standalonePalette: blankStandalonePalette(),
```
Change `setBuffer` to stop touching the palette:
```ts
  setBuffer: (b) => {
    const s = get();
    history.record(snap(s));
    const frames = s.frames.slice();
    frames[s.currentIndex] = b;
    set({ frames, historyTick: s.historyTick + 1 });
  },
```

- [ ] **Step 4: New actions**

```ts
  setZoneLine: (zoneLine) => set({ zoneLine: Math.max(0, Math.min(3, zoneLine | 0)) }),
  setStandalonePalette: (standalonePalette) => {
    const s = get(); history.record(snap(s));
    set({ standalonePalette, historyTick: s.historyTick + 1 });
  },
  setPaletteMode: (mode) => {
    const s = get(); history.record(snap(s));
    if (mode === 'standalone' && s.paletteMode === 'zone') {
      // Seed the standalone palette from the current zone line so the sprite
      // looks the same, now editable independently.
      const zone = getCurrentZone(useProjectStore.getState());
      const line = zone?.palette.lines[s.zoneLine]?.colors;
      const seed = line ? line.map((c) => ({ ...c })) : blankStandalonePalette();
      set({ paletteMode: 'standalone', standalonePalette: seed, historyTick: s.historyTick + 1 });
    } else {
      set({ paletteMode: mode, historyTick: s.historyTick + 1 });
    }
  },
  clearPalette: () => {
    const s = get(); history.record(snap(s));
    set({ paletteMode: 'standalone', standalonePalette: blankStandalonePalette(), historyTick: s.historyTick + 1 });
  },
  clearCanvas: () => {
    const s = get(); history.record(snap(s));
    const cur = s.frames[s.currentIndex];
    const frames = s.frames.slice();
    frames[s.currentIndex] = createBuffer(cur.width, cur.height);
    set({ frames, historyTick: s.historyTick + 1 });
  },
```

- [ ] **Step 5: Restore palette state in `undo`/`redo`; set defaults in `newSprite`/`loadSprite`**

In `undo` and `redo`, add the palette fields to the `set({...})` (they come from `prev`/`next`):
```ts
  // undo:
  if (prev) set({ frames: prev.frames, currentIndex: prev.currentIndex, selection: prev.selection,
    paletteMode: prev.paletteMode, zoneLine: prev.zoneLine, standalonePalette: prev.standalonePalette,
    historyTick: s.historyTick + 1 });
  // redo: same with `next`
```
In `newSprite`, REMOVE `paletteOverride: null,`; ADD `paletteMode: 'zone', zoneLine: 1, standalonePalette: blankStandalonePalette(),`.
In `loadSprite`, REMOVE `paletteOverride: null,` (callers set the mode after — Task 6). Leave `paletteMode`/`zoneLine`/`standalonePalette` unchanged on load so the caller controls them; default them only if the store has none (they always do). Set `setPaletteMode`/`setZoneLine` from the callers instead.
REMOVE the `setPaletteOverride` action and the `paletteOverride` field everywhere they remain.

- [ ] **Step 6: Verify + commit**

Run `npx tsc --noEmit` (this will surface every remaining `paletteOverride` reference — fix them per Tasks 4/6). `npm test` (419+ green). Then:
```bash
git add src/renderer/state/spriteStore.ts
git commit -m "feat(sprite): per-sprite palette mode state (zone/standalone); drop paletteOverride"
```
(tsc will fail until Tasks 4 and 6 remove the other `paletteOverride` readers — that's expected; do Tasks 4 and 6 before this commit, or stage them together.)

---

## Task 4: `SpriteCanvasHost` — resolve palette by mode

**Files:** Modify `src/renderer/components/sprite/SpriteCanvasHost.tsx`.

- [ ] **Step 1: Replace the override-based palette resolution**

Remove `const override = useSpriteStore((s) => s.paletteOverride);` and `const paletteLine = useArtStore((s) => s.paletteLine);` (the line now comes from the sprite). Add:
```ts
import { resolveDisplayPalette } from '../../../core/art/sprite-palette';
// selectors:
const paletteMode = useSpriteStore((s) => s.paletteMode);
const zoneLine = useSpriteStore((s) => s.zoneLine);
const standalonePalette = useSpriteStore((s) => s.standalonePalette);
useArtStore((s) => s.paletteVersion); // keep: re-render on zone-line slider edits
```
Replace the palette line with:
```ts
const zone = getCurrentZone(useProjectStore.getState());
const palette = resolveDisplayPalette(paletteMode, zoneLine, standalonePalette, zone?.palette.lines ?? []);
```
In `onCommit`, the comment about "clear the palette override" is obsolete — keep the `diffWrites(...).length > 0` guard but drop the override mention.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean (for this file). `npm test` green. Visual (after Tasks 6/7): a zone-attached sprite shows its bound line; standalone shows its own colors.

- [ ] **Step 3: Commit** — `git add src/renderer/components/sprite/SpriteCanvasHost.tsx && git commit -m "feat(sprite): canvas palette resolves by per-sprite mode"`

---

## Task 5: `useProject` — load the player palette into zone line 0

**Files:** Modify `src/renderer/hooks/useProject.ts` (the zone palette build, ~L353).

- [ ] **Step 1: Add a line-0 source from the shared player palette**

Replace the single-source `buildPalette` call with one that also loads line 0:
```ts
const palData = await readFile(basePath, zoneConfig.palette);
const sources = [{ data: palData, srcOffset: 0, destOffset: 16, length: Math.min(48, Math.floor(palData.length / 2)) }];
// CRAM line 0 = the shared player palette (Sonic/Tails), which every zone carries
// in-game. Optional: if absent, line 0 stays empty.
try {
  const playerPal = await readFile(basePath, 'art/palettes/SonicAndTails.bin');
  sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
} catch {
  try {
    const playerPal = await readFile(basePath, 'art/palettes/sonic.bin');
    sources.unshift({ data: playerPal, srcOffset: 0, destOffset: 0, length: 16 });
  } catch { /* no player palette — line 0 stays empty */ }
}
const palette = buildPalette(sources);
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. `npm test` green. Visual: after loading the project, the palette panel's line 0 shows Sonic's colors (not empty).

- [ ] **Step 3: Commit** — `git add src/renderer/hooks/useProject.ts && git commit -m "feat(project): load the shared player palette into zone CRAM line 0"`

---

## Task 6: `loadEngineCharacter` → zone line 0; `openSprite` → standalone

**Files:** Modify `src/renderer/components/sprite/export-sprite.ts`.

- [ ] **Step 1: `loadEngineCharacter` binds to line 0 (drop override)**

Replace the `setPaletteOverride(...)` block (the `try { ... art/palettes/${name}.bin ... setPaletteOverride ... }`) with:
```ts
    // Player characters use CRAM line 0. Load this character's palette INTO zone
    // line 0 so the canvas + palette panel show his real colors, and bind the
    // sprite to line 0 (Sonic/Tails share one; Knuckles his own).
    try {
      const palBytes = new Uint8Array(await window.api.readBinaryFile(base, `art/palettes/${name}.bin`));
      const colors = parsePaletteLine(palBytes, 0, 16).colors;
      const zone = getCurrentZone(useProjectStore.getState());
      if (zone) { zone.palette.lines[0].colors = colors; useArtStore.getState().bumpPaletteVersion(); }
    } catch { /* palette optional */ }
    useSpriteStore.getState().setPaletteMode('zone');
    useSpriteStore.getState().setZoneLine(0);
```
(Ensure `getCurrentZone` is imported from `../../state/projectStore` and `useArtStore` from `../../state/artStore` — both are already used elsewhere in this file; add to imports if not.)

- [ ] **Step 2: `openSprite`/`openDiscoveredSet` → standalone with the loaded palette**

In `openSprite` and `openDiscoveredSet`, after the existing `loadSprite(...)`, set the sprite standalone with its own palette if one was parsed (these reconstruct with a palette); if the reconstruction exposes the sprite's colors, call `useSpriteStore.getState().setStandalonePalette(colors)` then `setPaletteMode('standalone')`. If no palette is available from the import path, leave it zone-attached (default). (Read these functions; wire only where a palette is actually available — do not invent one.)

- [ ] **Step 3: Verify + commit**

`npx tsc --noEmit` clean (all `paletteOverride` references now gone — Task 3 commit can land here if staged together). `npm test` green. Visual: Load Engine Character → Sonic shows correct line-0 colors; **drawing keeps them**.
```bash
git add src/renderer/components/sprite/export-sprite.ts
git commit -m "feat(sprite): characters bind to zone line 0; imports open standalone"
```

---

## Task 7: `PaletteEditor` — mode-aware, line 0 editable in Sprite mode

**Files:** Modify `src/renderer/components/art/PaletteEditor.tsx`.

- [ ] **Step 1: Make the editor aware of Sprite mode + the sprite's palette**

Add selectors:
```ts
import { useSpriteStore } from '../../state/spriteStore';
const appMode = useEditorStore((s) => s.appMode);
const spriteMode = useSpriteStore((s) => s.paletteMode);
const spriteZoneLine = useSpriteStore((s) => s.zoneLine);
const standalone = useSpriteStore((s) => s.standalonePalette);
const inSprite = appMode === 'sprite';
```

- [ ] **Step 2: Render the right palette by context**

- **Art mode (unchanged):** the 4 zone lines; line 0 `locked` as today.
- **Sprite mode + zone:** render the 4 zone lines, but **line 0 is NOT locked** (it's the player palette). The bound line (`spriteZoneLine`) gets the paint-selection outline. `handleSwatchClick`: remove the `if (line === 0) return;` early-return when `inSprite` so line 0 is editable; clicking a swatch sets the paint color and, in sprite mode, the sprite's `zoneLine` (`useSpriteStore.getState().setZoneLine(line)`), not `artStore.paletteLine`.
- **Sprite mode + standalone:** render a single row of the 16 `standalone` colors; editing a swatch's sliders writes via `useSpriteStore.getState().setStandalonePalette(updatedColors)` (index 0 stays transparent). The zone palette is not shown in this sub-mode.

Concretely: gate the `locked` flag as `const locked = li === 0 && !inSprite;`, branch the swatch-click target by `inSprite`, and when `inSprite && spriteMode === 'standalone'` render `[{ colors: standalone }]` instead of `lines`. Keep the existing slider/quantize/commit path; for standalone, the commit writes `setStandalonePalette` instead of the `set-palette-line` command (standalone edits are undoable via the sprite snapshot — Task 3 — so call `setStandalonePalette`, which records history).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm test` green (guardrail 0 — use `T` tokens). Visual: in Sprite mode, line 0 is editable and selectable; switching the sprite to standalone shows its private palette; Art mode is unchanged (line 0 still locked).

- [ ] **Step 4: Commit** — `git add src/renderer/components/art/PaletteEditor.tsx && git commit -m "feat(palette): mode-aware editor; line 0 editable + standalone row in Sprite mode"`

---

## Task 8: `SpritePaletteHeader` (toggle + line picker + Clear buttons)

**Files:** Create `src/renderer/components/sprite/SpritePaletteHeader.tsx`; Modify `src/renderer/components/sprite/SpriteMode.tsx`.

- [ ] **Step 1: Build the header**

```tsx
// src/renderer/components/sprite/SpritePaletteHeader.tsx
import React from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { T, Chip, IconButton } from '../ui';

export default function SpritePaletteHeader() {
  const mode = useSpriteStore((s) => s.paletteMode);
  const zoneLine = useSpriteStore((s) => s.zoneLine);
  const st = useSpriteStore.getState;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, padding: `${T.s2} ${T.s4}`, fontSize: 11, color: T.textBase, borderBottom: `1px solid ${T.border}` }}>
      <Chip active={mode === 'zone'} onClick={() => st().setPaletteMode('zone')}>Zone</Chip>
      {mode === 'zone' && (
        <select value={zoneLine} onChange={(e) => st().setZoneLine(Number(e.target.value))}
          style={{ background: T.raised, color: T.textHi, border: `1px solid ${T.border}`, borderRadius: T.rMd, fontSize: 11 }}>
          <option value={0}>line 0 · player</option>
          <option value={1}>line 1</option>
          <option value={2}>line 2</option>
          <option value={3}>line 3</option>
        </select>
      )}
      <Chip active={mode === 'standalone'} onClick={() => st().setPaletteMode('standalone')}>Standalone</Chip>
      <span style={{ flex: 1 }} />
      <IconButton icon={<span>Clear pal</span>} label="Clear palette (→ standalone, blank)" onClick={() => st().clearPalette()} />
      <IconButton icon={<span>Clear canvas</span>} label="Clear canvas (blank pixels)" onClick={() => st().clearCanvas()} />
    </div>
  );
}
```

- [ ] **Step 2: Mount it above the Palette panel in Sprite mode**

In `src/renderer/components/sprite/SpriteMode.tsx`, find the Palette panel section (the `CollapsibleSection id="sprite.palette"` wrapping `<PaletteEditor/>`) and render `<SpritePaletteHeader/>` immediately above `<PaletteEditor/>` inside it.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm test` green; guardrail 0. Visual: the header shows Zone/Standalone toggle + the line dropdown (zone mode); Clear palette switches to standalone-blank; Clear canvas blanks pixels; everything is one undo step (Ctrl+Z).

- [ ] **Step 4: Commit** — `git add src/renderer/components/sprite/SpritePaletteHeader.tsx src/renderer/components/sprite/SpriteMode.tsx && git commit -m "feat(sprite): palette-mode header (toggle/line/Clear) in the sprite panel"`

---

## Self-Review

**Spec coverage (Phase 1 = spec §3 model, §4 panel, §6 character fix, §7 live-preview, §9 data/undo):**
- §3 per-sprite mode + creation defaults → Tasks 3, 6 ✓ (new→zone line 1; character→zone 0; import→standalone; clear→standalone-blank). *Note: the spec said new sprites default to "zone-attached to the active line"; since Sprite mode no longer shares `artStore.paletteLine`, this plan uses line 1 as the default and the user re-binds via the picker — call out at the visual checkpoint.*
- §4 mode-aware panel + line-0 editable + Clear buttons → Tasks 7, 8 ✓
- §6 character fix (line 0 load + bind + drop override) → Tasks 5, 6, 3 ✓
- §7 live preview on line switch → falls out of `setZoneLine` re-resolving the palette (Task 4 + the `paletteVersion`/store subscription) ✓
- §9 data model + undo (snapshot carries palette) → Tasks 2, 3 ✓
- **Deferred to Phase 2/3 (correctly not here):** copy bridge, Genesis-legal-on-copy, shared-line warning, cross-sprite clipboard.

**Placeholder scan:** the only soft spots are Task 6 Step 2 (`openSprite` standalone wiring "where a palette is available") — this is deliberately conditional on what the reconstruct path exposes; the engineer wires it only if a palette is present, else leaves zone default. Not a behavior gap. No TBD/TODO elsewhere.

**Type consistency:** `SpritePaletteMode`, `blankStandalonePalette`, `resolveDisplayPalette` (Task 1) are used consistently in Tasks 2–4, 6. `paletteMode`/`zoneLine`/`standalonePalette` field names match across store (Task 3), snapshot (Task 2), host (Task 4), editor (Task 7), header (Task 8). `setPaletteMode`/`setZoneLine`/`setStandalonePalette`/`clearPalette`/`clearCanvas` defined in Task 3 and called in 6/7/8.

**Note for the implementer:** Tasks 3, 4, 6 are interdependent (removing `paletteOverride` breaks its readers until all three land) — stage them so `tsc` is green at the first commit that removes the field, or commit 3+4+6 together. Everything is verified headless via tsc/tests/build; the palette *display* correctness is the visual checkpoint (load Sonic → correct colors → draw keeps them).
