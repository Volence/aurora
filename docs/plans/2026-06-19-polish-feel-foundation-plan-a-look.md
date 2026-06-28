# Polish & Feel Foundation — Plan A ("Look") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aurora look like one tool — adopt the Empyrean design tokens through a shared UI-primitive layer and a single `EditorShell` that Map/Art/Sprite all render into — with no change to canvas drawing behavior.

**Architecture:** A token map (`ui/theme.ts`) + presentational primitives (`ui/*`) replace the 347 inline hex literals and 23 hand-rolled `const styles` blocks. One `EditorShell` owns the fixed regions (app bar · tool-options bar · left tool dock · canvas slot · right panels · status bar); each mode supplies its content. Overlay toggles move into an app-bar **View menu**. A ratcheting vitest guardrail drives raw-hex to zero. (Camera/HUD, `toolStore`, and sprite undo are **Plan B** — not here.)

**Tech Stack:** Electron + React 19 + TypeScript, Zustand stores, Vitest (node env, `test/**/*.test.ts`), inline-`style` components (no CSS-in-JS lib), CSS custom properties in `src/renderer/styles/theme.css`.

**Spec:** `docs/specs/2026-06-19-polish-feel-foundation-design.md` (this plan = §6 "Plan A", phases 1–2).

**Plan location note:** saved under the project's `docs/plans/` convention (not the skill default `docs/superpowers/plans/`).

**Verification convention (read once):** This project does NOT unit-test React components (vitest runs in node, no jsdom). UI tasks are verified by: (a) `npx tsc --noEmit` clean, (b) `npm test` (the 58 existing specs) green, (c) the ratchet guardrail, and (d) a **visual checkpoint** in the running app (`npm run dev`). Only genuinely pure logic (guardrail, panel-state) is TDD'd. Don't fake DOM tests.

---

## File Structure

**Create:**
- `src/renderer/components/ui/theme.ts` — `T`: typed map of token names → `var(--…)` strings. Single source for colors/spacing/radius/fonts in TS.
- `src/renderer/components/ui/icons.tsx` — small inline-SVG icon set (tools + chrome glyphs), token-colored via `currentColor`.
- `src/renderer/components/ui/primitives.tsx` — `Panel`, `PanelHeader`, `ToolButton`, `IconButton`, `Chip`, `Divider`, `StatusBar`, `OptionBar`.
- `src/renderer/components/ui/fields.tsx` — `Select`, `NumberField`.
- `src/renderer/components/ui/Menu.tsx` — `Menu` (dropdown button + popover) used by the View menu and the Open-recent dropdown.
- `src/renderer/components/ui/index.ts` — barrel re-export.
- `src/renderer/shell/panel-state.ts` — pure localStorage-backed collapse state (`isCollapsed`/`toggle`/`load`/`save`).
- `src/renderer/shell/EditorShell.tsx` — the one layout.
- `src/renderer/shell/ViewMenu.tsx` — overlay/grid toggles, sourced from `viewStore.overlays`.
- `test/renderer/no-raw-hex.test.ts` — ratchet guardrail.
- `test/renderer/panel-state.test.ts` — panel-state unit test.

**Modify:**
- `src/renderer/App.tsx` — render `EditorShell`; pass per-mode content.
- `src/renderer/components/Toolbar.tsx` — becomes the shell **app bar** content; overlay toggles removed (→ ViewMenu); tokenized.
- `src/renderer/components/art/ArtMode.tsx`, `components/sprite/SpriteMode.tsx`, and the Map-mode layout block in `App.tsx` — become shell **content providers** (dock items, panels, options, bottom extra); per-mode bespoke chrome deleted; tokenized.
- `src/renderer/state/artStore.ts` — add `pixelPerfect` (+ setter).
- `src/renderer/components/art/ToolColumn.tsx` — add a Pixel-Perfect toggle to art tool options.
- `src/renderer/components/art/ComposerCanvas.tsx:297` — read `pixelPerfect` from `artStore` instead of hardcoded `false`.
- The remaining 23 `const styles` components (`SectionGridNav`, `ChunkLibrary`, `ObjectPalette`, `RingPatternPalette`, `ArtBrowser`, `PaletteViewer`, `PropertiesPanel`, `TilesetPanel`, `PaletteEditor`, `FrameGrid`, `Timeline`, `SpriteToolColumn`, `CommandPalette`, `ToastContainer`, `SectionList`, `ChunkSheetImporter`, etc.) — migrate to `T`/primitives during their mode's shell task.

---

## Part 1 — Tokens, primitives, guardrail, pixel-perfect fix

### Task 1: Raw-hex ratchet guardrail

**Files:**
- Test: `test/renderer/no-raw-hex.test.ts`

- [ ] **Step 1: Write the guardrail test (counts hex, asserts ≤ ceiling)**

```ts
// test/renderer/no-raw-hex.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// Ratchet: lower this toward 0 as components migrate to tokens (ui/theme.ts).
// It must only ever DECREASE. Final task sets it to 0.
const MAX_RAW_HEX = 360;

const ROOT = join(__dirname, '..', '..', 'src', 'renderer');
const HEX = /#[0-9a-fA-F]{6}\b/g;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

function countRawHex(): { total: number; perFile: Record<string, number> } {
  const perFile: Record<string, number> = {};
  let total = 0;
  for (const file of walk(ROOT)) {
    if (basename(file) === 'theme.css') continue; // tokens live here (it's .css anyway)
    const hits = (readFileSync(file, 'utf8').match(HEX) ?? []).length;
    if (hits) { perFile[file] = hits; total += hits; }
  }
  return { total, perFile };
}

describe('design-token guardrail', () => {
  it(`has no more than ${MAX_RAW_HEX} raw hex literals in src/renderer`, () => {
    const { total } = countRawHex();
    // eslint-disable-next-line no-console
    console.log(`[guardrail] raw hex literals in src/renderer = ${total} (ceiling ${MAX_RAW_HEX})`);
    expect(total).toBeLessThanOrEqual(MAX_RAW_HEX);
  });
});
```

- [ ] **Step 2: Run it, read the real baseline count**

Run: `npm test -- no-raw-hex`
Expected: PASS, and the console prints `[guardrail] raw hex literals in src/renderer = N`.

- [ ] **Step 3: Pin the ceiling to the real baseline**

Set `MAX_RAW_HEX` to exactly the `N` the run printed (so any *new* hex fails the build immediately).

- [ ] **Step 4: Re-run to confirm green at the pinned baseline**

Run: `npm test -- no-raw-hex`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/renderer/no-raw-hex.test.ts
git commit -m "test(ui): ratcheting raw-hex guardrail (baseline pinned)"
```

---

### Task 2: Token map + icon set

**Files:**
- Create: `src/renderer/components/ui/theme.ts`
- Create: `src/renderer/components/ui/icons.tsx`

- [ ] **Step 1: Write `theme.ts` (token strings, no raw hex)**

```ts
// src/renderer/components/ui/theme.ts
// Typed bridge to the Empyrean CSS custom properties in styles/theme.css.
// Use in inline styles: style={{ background: T.surface, color: T.textHi }}.
export const T = {
  void: 'var(--void)', surface: 'var(--surface)', raised: 'var(--raised)',
  overlay: 'var(--overlay)', border: 'var(--border)', borderStrong: 'var(--border-strong)',
  textHi: 'var(--text-hi)', textBase: 'var(--text-base)', textLo: 'var(--text-lo)', textFaint: 'var(--text-faint)',
  accent: 'var(--accent)',
  success: 'var(--success)', warning: 'var(--warning)', error: 'var(--error)', info: 'var(--info)',
  fontUi: 'var(--font-ui)', fontMono: 'var(--font-mono)',
  s1: 'var(--space-1)', s2: 'var(--space-2)', s3: 'var(--space-3)', s4: 'var(--space-4)',
  s5: 'var(--space-5)', s6: 'var(--space-6)', s7: 'var(--space-7)', s8: 'var(--space-8)',
  rSm: 'var(--radius-sm)', rMd: 'var(--radius-md)', rLg: 'var(--radius-lg)', rXl: 'var(--radius-xl)', rPill: 'var(--radius-pill)',
  // emerald accent on void surface — for primary buttons/active states
  onAccent: 'var(--void)',
} as const;
```

- [ ] **Step 2: Write `icons.tsx` (inline SVGs, currentColor)**

```tsx
// src/renderer/components/ui/icons.tsx
import React from 'react';

type IconProps = { size?: number };
const svg = (path: React.ReactNode) => ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
       stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

// Minimal set used by the tool docks + chrome. Add glyphs as tools need them.
export const IconPencil    = svg(<path d="M11 2l3 3-8 8H3v-3z" />);
export const IconEraser    = svg(<path d="M5 13h8M3 9l4-4 6 6-4 4H6z" />);
export const IconFill      = svg(<path d="M3 8l5-5 5 5-5 5z M13 11c1 1 1 2 0 2s-1-1 0-2z" />);
export const IconEyedrop   = svg(<path d="M10 3l3 3-6 6-3 1 1-3z" />);
export const IconLine      = svg(<path d="M3 13L13 3" />);
export const IconRect      = svg(<rect x="3" y="3" width="10" height="10" />);
export const IconSelect    = svg(<rect x="3" y="3" width="10" height="10" strokeDasharray="2 2" />);
export const IconDither    = svg(<path d="M3 3h2v2H3zM7 3h2v2H7zM11 3h2v2h-2zM5 7h2v2H5zM9 7h2v2H9zM3 11h2v2H3zM7 11h2v2H7zM11 11h2v2h-2z" fill="currentColor" stroke="none" />);
export const IconView      = svg(<><circle cx="8" cy="8" r="2.5" /><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /></>);
export const IconStamp     = svg(<path d="M5 9h6l1 4H4zM6 9V5a2 2 0 014 0v4" />);
export const IconCollision = svg(<path d="M2 11l4-6 3 4 2-3 3 5z" />);
export const IconObject    = svg(<><rect x="4" y="4" width="8" height="8" /><path d="M4 4l8 8" /></>);
export const IconRing      = svg(<circle cx="8" cy="8" r="4.5" />);
export const IconUndo      = svg(<path d="M6 4L3 7l3 3M3 7h7a3 3 0 010 6H7" />);
export const IconRedo      = svg(<path d="M10 4l3 3-3 3M13 7H6a3 3 0 000 6h3" />);
export const IconChevron   = svg(<path d="M4 6l4 4 4-4" />);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/theme.ts src/renderer/components/ui/icons.tsx
git commit -m "feat(ui): Empyrean token map + inline-SVG icon set"
```

---

### Task 3: Core primitives + fields + Menu

**Files:**
- Create: `src/renderer/components/ui/primitives.tsx`
- Create: `src/renderer/components/ui/fields.tsx`
- Create: `src/renderer/components/ui/Menu.tsx`
- Create: `src/renderer/components/ui/index.ts`

- [ ] **Step 1: Write `primitives.tsx`**

```tsx
// src/renderer/components/ui/primitives.tsx
import React from 'react';
import { T } from './theme';

export function Panel({ children, width, scroll = false, style }: {
  children: React.ReactNode; width?: number; scroll?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', background: T.void,
      borderLeft: `1px solid ${T.border}`, flexShrink: 0,
      ...(width ? { width } : {}), ...(scroll ? { overflow: 'auto' } : {}), ...style,
    }}>{children}</div>
  );
}

export function PanelHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${T.s2} ${T.s4}`, fontSize: 10, fontWeight: 600, color: T.textLo,
      textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${T.border}`,
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

export function ToolButton({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button title={label} aria-label={label} onClick={onClick} style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? T.accent : 'transparent', color: active ? T.onAccent : T.textLo,
      border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    }}>{icon}</button>
  );
}

export function IconButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button title={label} aria-label={label} disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.s2,
      padding: `${T.s2} ${T.s3}`, background: T.overlay, color: T.textBase,
      border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1, fontSize: 11,
    }}>{icon}</button>
  );
}

export function Chip({ children, active, onClick }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void;
}) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: T.s2, padding: `${T.s1} ${T.s3}`,
      background: active ? T.accent : T.raised, color: active ? T.onAccent : T.textBase,
      border: `1px solid ${active ? T.accent : T.border}`, borderRadius: T.rMd,
      fontSize: 11, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function Divider() {
  return <span style={{ width: 1, height: 16, background: T.borderStrong, flexShrink: 0 }} />;
}

export function OptionBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: T.s4, height: 32, padding: `0 ${T.s4}`,
      background: T.surface, borderBottom: `1px solid ${T.border}`, color: T.textLo,
      fontSize: 11, flexShrink: 0,
    }}>{children}</div>
  );
}

export function StatusBar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <footer style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 24,
      padding: `0 ${T.s4}`, background: T.void, borderTop: `1px solid ${T.border}`,
      color: T.textLo, fontFamily: T.fontMono, fontSize: 11, flexShrink: 0,
    }}>
      <span>{left}</span><span>{right}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Write `fields.tsx`**

```tsx
// src/renderer/components/ui/fields.tsx
import React from 'react';
import { T } from './theme';

const base: React.CSSProperties = {
  background: T.raised, color: T.textHi, border: `1px solid ${T.border}`,
  borderRadius: T.rMd, fontSize: 12, padding: `${T.s2} ${T.s3}`,
};

export function Select({ value, onChange, children, title, style }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  title?: string; style?: React.CSSProperties;
}) {
  return (
    <select title={title} value={value} onChange={(e) => onChange(e.target.value)}
            style={{ ...base, ...style }}>{children}</select>
  );
}

export function NumberField({ value, onChange, min, max, title, width = 48 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; title?: string; width?: number;
}) {
  return (
    <input type="number" title={title} value={value} min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...base, width }} />
  );
}
```

- [ ] **Step 3: Write `Menu.tsx` (dropdown button + popover, outside-click close)**

```tsx
// src/renderer/components/ui/Menu.tsx
import React, { useEffect, useRef, useState } from 'react';
import { T } from './theme';

export function Menu({ label, children, align = 'left' }: {
  label: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: T.s2, padding: `${T.s2} ${T.s3}`,
        background: open ? T.raised : T.overlay, color: T.textBase,
        border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer', fontSize: 11,
      }}>{label}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', [align]: 0, marginTop: T.s2, zIndex: 100,
          minWidth: 200, padding: T.s2, background: T.overlay, border: `1px solid ${T.borderStrong}`,
          borderRadius: T.rLg, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: T.s1,
        }}>{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the barrel `index.ts`**

```ts
// src/renderer/components/ui/index.ts
export { T } from './theme';
export * from './primitives';
export * from './fields';
export { Menu } from './Menu';
export * as Icons from './icons';
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/renderer/components/ui/
git commit -m "feat(ui): shared presentational primitives (Panel/ToolButton/Menu/fields)"
```

---

### Task 4: Panel collapse state (pure, localStorage-backed)

**Files:**
- Create: `src/renderer/shell/panel-state.ts`
- Test: `test/renderer/panel-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/renderer/panel-state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPanelState, savePanelState, isCollapsed, togglePanel } from '../../src/renderer/shell/panel-state';

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as unknown as Storage;
}

describe('panel-state', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeLocalStorage()); });

  it('isCollapsed returns the default when unset', () => {
    expect(isCollapsed({}, 'tileset', false)).toBe(false);
    expect(isCollapsed({}, 'tileset', true)).toBe(true);
  });
  it('togglePanel flips a panel against its default, immutably', () => {
    const a = togglePanel({}, 'tileset', false);
    expect(a).toEqual({ tileset: true });
    expect(togglePanel(a, 'tileset', false)).toEqual({ tileset: false });
  });
  it('save then load round-trips through localStorage', () => {
    savePanelState({ tileset: true, palette: false });
    expect(loadPanelState()).toEqual({ tileset: true, palette: false });
  });
  it('load returns {} on missing/corrupt storage', () => {
    expect(loadPanelState()).toEqual({});
    localStorage.setItem('aurora.shell.panels', '{not json');
    expect(loadPanelState()).toEqual({});
  });
});
```

- [ ] **Step 2: Run, verify it fails (module missing)**

Run: `npm test -- panel-state`
Expected: FAIL — cannot find `src/renderer/shell/panel-state`.

- [ ] **Step 3: Implement `panel-state.ts`**

```ts
// src/renderer/shell/panel-state.ts
// panelId -> collapsed? (absent = use the panel's default)
export type PanelState = Record<string, boolean>;
const KEY = 'aurora.shell.panels';

export function loadPanelState(): PanelState {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as PanelState) : {}; }
  catch { return {}; }
}
export function savePanelState(s: PanelState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function isCollapsed(s: PanelState, id: string, def = false): boolean {
  return s[id] ?? def;
}
export function togglePanel(s: PanelState, id: string, def = false): PanelState {
  return { ...s, [id]: !(s[id] ?? def) };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npm test -- panel-state`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/panel-state.ts test/renderer/panel-state.test.ts
git commit -m "feat(shell): pure localStorage-backed panel collapse state"
```

---

### Task 5: Fix the pixel-perfect divergence (composer reads a real value)

**Files:**
- Modify: `src/renderer/state/artStore.ts`
- Modify: `src/renderer/components/art/ComposerCanvas.tsx:297`
- Modify: `src/renderer/components/art/ToolColumn.tsx`

- [ ] **Step 1: Add `pixelPerfect` to `artStore`**

In `src/renderer/state/artStore.ts`, add to the `ArtState` interface (near `mirror`):
```ts
  pixelPerfect: boolean;
  setPixelPerfect: (v: boolean) => void;
```
Add to the store initial state (near `mirror: null`):
```ts
  pixelPerfect: false,
```
Add to the store actions (near `setMirror`):
```ts
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
```

- [ ] **Step 2: Read it in the composer config**

In `src/renderer/components/art/ComposerCanvas.tsx`, replace the hardcode at line 297 (`pixelPerfect: false`) so the config reads the store. Near the other `useArtStore` selectors at the top of the component add:
```tsx
  const pixelPerfect = useArtStore((s) => s.pixelPerfect);
```
and in the `ToolConfig` object change `pixelPerfect: false,` → `pixelPerfect,`.

- [ ] **Step 3: Add a toggle to the art tool options**

In `src/renderer/components/art/ToolColumn.tsx`, add a Pixel-Perfect toggle next to the mirror/dither controls (use the existing control pattern in that file):
```tsx
  // near other useArtStore selectors:
  const pixelPerfect = useArtStore((s) => s.pixelPerfect);
  const setPixelPerfect = useArtStore((s) => s.setPixelPerfect);
  // in the rendered controls (pencil/line tools):
  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
    <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} />
    Pixel-perfect
  </label>
```

- [ ] **Step 4: Typecheck + existing tests + visual**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → all green.
Visual: `npm run dev` → in Art mode, draw a diagonal with pencil; toggling Pixel-perfect removes/keeps the doubled corner pixels (matches Sprite mode behavior).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/artStore.ts src/renderer/components/art/ComposerCanvas.tsx src/renderer/components/art/ToolColumn.tsx
git commit -m "fix(art): composer honors pixel-perfect (was hardcoded false)"
```

---

## Part 2 — The unified shell

Each mode task below does three things together so a component is touched once: (1) move the
mode's content into `EditorShell`, (2) delete its bespoke chrome, (3) tokenize the components
it touches (raw hex → `T`, hand-rolled buttons/panels → primitives). After each, **lower the
`MAX_RAW_HEX` ceiling** in `test/renderer/no-raw-hex.test.ts` to the new count the guardrail
prints, and visually verify the mode.

### Task 6: `EditorShell` skeleton + app bar + View menu

**Files:**
- Create: `src/renderer/shell/EditorShell.tsx`
- Create: `src/renderer/shell/ViewMenu.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Write `EditorShell.tsx`**

```tsx
// src/renderer/shell/EditorShell.tsx
import React from 'react';
import { T } from '../components/ui';

export interface EditorShellProps {
  appBar: React.ReactNode;                 // logo · mode tabs · zone/act · undo/redo/save · View menu
  toolOptions?: React.ReactNode;           // contextual options bar (omit to hide)
  toolDock: React.ReactNode;               // left icon tools
  children: React.ReactNode;               // canvas slot
  panels: React.ReactNode;                 // right column (Panel components)
  bottomExtra?: React.ReactNode;           // e.g. Sprite FrameGrid + Timeline (above status bar)
  status?: React.ReactNode;                // StatusBar content
}

export default function EditorShell(p: EditorShellProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface, color: T.textHi }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px', background: T.void, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        {p.appBar}
      </div>
      {p.toolOptions != null && p.toolOptions}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0', background: T.void, borderRight: `1px solid ${T.border}`, flexShrink: 0 }}>
          {p.toolDock}
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.surface }}>
          {p.children}
        </div>
        <div style={{ display: 'flex', flexShrink: 0 }}>{p.panels}</div>
      </div>
      {p.bottomExtra}
      {p.status}
    </div>
  );
}
```

- [ ] **Step 2: Write `ViewMenu.tsx` (overlay toggles from viewStore)**

```tsx
// src/renderer/shell/ViewMenu.tsx
import React from 'react';
import { Menu, T, Icons } from '../components/ui';
import { useViewStore, type OverlayOptions } from '../state/viewStore';

const LABELS: Record<string, string> = {
  showBlockGrid: 'Chunk grid (128px)', showChunkGrid: 'Section grid (2048px)',
};
function pretty(key: string) {
  return LABELS[key] ?? key.replace('show', '').replace(/([A-Z])/g, ' $1').trim();
}

export default function ViewMenu() {
  const overlays = useViewStore((s) => s.overlays);
  const toggle = useViewStore((s) => s.toggleOverlay);
  return (
    <Menu label={<><Icons.IconView size={14} /> View <Icons.IconChevron size={12} /></>}>
      {(Object.keys(overlays) as (keyof OverlayOptions)[]).map((key) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `${T.s1} ${T.s2}`, fontSize: 12, color: T.textBase, cursor: 'pointer' }}>
          <input type="checkbox" checked={overlays[key]} onChange={() => toggle(key)} />
          {pretty(key)}
        </label>
      ))}
    </Menu>
  );
}
```

- [ ] **Step 3: Rebuild `Toolbar.tsx` as app-bar content (tokenized, View menu, no row 2)**

Convert `Toolbar.tsx` to render a single horizontal row of app-bar content using `T`/primitives: brand (`AuroraMark` + wordmark), Open (+ recent `Menu`), zone/act `Select`, mode tabs (Map/Art/Sprite via `Chip` active state), the mode-aware Undo/Redo/Save (`IconButton` with `Icons.IconUndo`/`IconRedo`), the dirty badge, and `<ViewMenu />`. **Delete** the old "Row 2" (zoom buttons + overlay checkboxes) entirely — zoom moves to Plan B; overlays now live in `ViewMenu`. Replace every raw hex in this file with `T.*`. Keep all existing handlers (`onOpenProject`, recent dropdown, `setAppMode`, undo/redo/save) intact.

- [ ] **Step 4: Render `EditorShell` from `App.tsx` for one mode (Map) as the pattern**

In `App.tsx`, import `EditorShell` and render the **Map** branch through it: `appBar={<Toolbar … />}`, `toolDock={<MapToolDock/>}` (the map tools, moved out of Toolbar — a small new local component using `ToolButton`+icons mapping the existing `EditorTool`s), `panels={<Panel width={240} scroll><PropertiesPanel/>…</Panel>}`, `status={<StatusBar left={…}/>}`, `children={<MapViewport/>}`. Leave Art/Sprite on their current code path for now (Tasks 7–8 move them). Remove the now-duplicated outer `styles.main/leftPanel` Map layout from `App.tsx` and the raw hex in `App.tsx`.

- [ ] **Step 5: Typecheck + tests + lower ratchet + visual**

Run: `npx tsc --noEmit` → clean. `npm test` → green (guardrail prints a lower count → set `MAX_RAW_HEX` to it).
Visual: `npm run dev` → Map mode renders in the new shell; mode tabs switch; Open/recent, zone/act, undo/redo/save work; the **View menu** toggles grids/collision/objects/rings exactly as the old checkboxes did.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/shell/ src/renderer/components/Toolbar.tsx src/renderer/App.tsx test/renderer/no-raw-hex.test.ts
git commit -m "feat(shell): EditorShell + app bar + View menu; Map mode on the shell"
```

---

### Task 7: Move **Art** mode into the shell

**Files:**
- Modify: `src/renderer/components/art/ArtMode.tsx`
- Modify: `src/renderer/App.tsx`
- Modify (tokenize): `art/ToolColumn.tsx`, `art/TilesetPanel.tsx`, `art/PaletteEditor.tsx`, `ChunkLibrary.tsx`

- [ ] **Step 1: Make `ArtMode` a content provider**

Refactor `ArtMode.tsx` so it returns shell content instead of its own `root/leftPanel/center/rightPanel` layout: a `toolDock` (its `ToolColumn` tools rendered with `ToolButton`+icons), `panels` (`<Panel width={240} scroll>` wrapping `TilesetPanel` + a `PanelHeader`+`PaletteEditor` + `ChunkLibrary`), `toolOptions` (the doc header: name, dirty/shared-tile badges, Save button — now using `Chip`/`IconButton`), `status` (doc name · dims), and `children` = `<ComposerCanvas/>` (unchanged) or the New-Document launcher. Render it via `EditorShell` in `App.tsx`'s art branch. Delete `ArtMode`'s `const styles` block; use `T`/primitives.

- [ ] **Step 2: Tokenize the art panels**

In `ToolColumn.tsx`, `TilesetPanel.tsx`, `PaletteEditor.tsx`, `ChunkLibrary.tsx`: replace raw hex with `T.*` and hand-rolled headers/buttons with `PanelHeader`/`IconButton`/`Chip`. Keep all behavior/handlers identical.

- [ ] **Step 3: Typecheck + tests + lower ratchet + visual**

Run: `npx tsc --noEmit` → clean. `npm test` → green; set `MAX_RAW_HEX` to the new printed count.
Visual: `npm run dev` → Art mode in the shell: tool dock left, tileset/palette/chunk panels right (240px), doc header in the options bar, New/Save flows and live-atlas editing + repeat preview + grids unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/art/ src/renderer/components/ChunkLibrary.tsx src/renderer/App.tsx test/renderer/no-raw-hex.test.ts
git commit -m "feat(shell): Art mode on the shell; tokenize art panels"
```

---

### Task 8: Move **Sprite** mode into the shell (kill the double toolbar)

**Files:**
- Modify: `src/renderer/components/sprite/SpriteMode.tsx`
- Modify: `src/renderer/App.tsx`
- Modify (tokenize): `sprite/SpriteToolColumn.tsx`, `sprite/FrameGrid.tsx`, `sprite/Timeline.tsx`

- [ ] **Step 1: Make `SpriteMode` a content provider; remove its own top bar**

Refactor `SpriteMode.tsx`: delete its `styles.topbar` second toolbar (`SpriteMode.tsx:111`). Its New-size presets / Fit / show-pieces controls move into the shell `toolOptions` bar (`Chip`/`IconButton`/`NumberField`); its left `SpriteToolColumn` becomes the `toolDock`; its right 240px sections (Mapping/Sprite/Open/Export/Load char/Palette) become `panels` (`Panel`+`PanelHeader` per section); `FrameGrid`+`Timeline` become `bottomExtra`; `status` shows sprite name · tiles · pieces; `children` = `<SpriteCanvas …/>`. Render via `EditorShell` in `App.tsx`'s sprite branch. Delete `SpriteMode`'s `const styles`; use `T`/primitives.

- [ ] **Step 2: Tokenize sprite panels**

In `SpriteToolColumn.tsx`, `FrameGrid.tsx`, `Timeline.tsx`: raw hex → `T.*`, hand-rolled chrome → primitives. Keep behavior identical (frame selection, timeline scrub, etc.).

- [ ] **Step 3: Typecheck + tests + lower ratchet + visual**

Run: `npx tsc --noEmit` → clean. `npm test` → green; set `MAX_RAW_HEX` to the new printed count.
Visual: `npm run dev` → Sprite mode in the shell with **one** toolbar (no stacked second bar); tool dock left; Mapping/Open/Export panels right; FrameGrid+Timeline at the bottom; load/scan/export and draw/show-pieces all work.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/sprite/ src/renderer/App.tsx test/renderer/no-raw-hex.test.ts
git commit -m "feat(shell): Sprite mode on the shell; remove double toolbar; tokenize"
```

---

### Task 9: Wire panel collapse + sweep remaining components to zero hex

**Files:**
- Modify: `src/renderer/shell/EditorShell.tsx` (or a `Panel` wrapper) — collapse via `panel-state`
- Modify (tokenize): any remaining `const styles` components — `SectionGridNav`, `ObjectPalette`, `RingPatternPalette`, `ArtBrowser`, `PaletteViewer`, `PropertiesPanel`, `ToastContainer`, `SectionList`, `ChunkSheetImporter`, `CommandPalette` (already partly tokenized), `StatusBar` (old), `AuroraMark` (if any)
- Modify: `test/renderer/no-raw-hex.test.ts`

- [ ] **Step 1: Wire collapsible right panels to `panel-state`**

Give each right-side `Panel` a stable `id` and a header chevron that calls `togglePanel`, reading/writing via `loadPanelState`/`savePanelState` (hold the `PanelState` in a tiny `useState` initialized from `loadPanelState()`, persisting on each toggle). Collapsed = render only the header.

- [ ] **Step 2: Tokenize every remaining component**

Sweep the components listed above: replace each raw hex with the matching `T.*` token (the existing hex values already equal token values — `#0A0C12`=`T.void`, `#12151E`=`T.surface`, `#1A1E2A`=`T.raised`, `#222736`=`T.overlay`, `#2A2F3D`=`T.border`, `#3A4152`=`T.borderStrong`, `#E8EAF2`=`T.textHi`, `#B8BECE`=`T.textBase`, `#6E7589`=`T.textLo`, `#34D399`=`T.accent`, `#F87171`=`T.error`, `#FBBF24`=`T.warning`). Replace ad-hoc panels/headers/buttons with primitives where trivial; otherwise just swap the colors. Behavior unchanged.

- [ ] **Step 3: Drive the ratchet to zero**

Run: `npm test -- no-raw-hex` repeatedly; fix the files it still lists (the test logs `perFile` if you add `console.log` of `countRawHex().perFile` temporarily) until the count is 0. Set `MAX_RAW_HEX = 0`.

- [ ] **Step 4: Full typecheck + tests + visual sweep**

Run: `npx tsc --noEmit` → clean. `npm test` → all green (incl. guardrail at 0).
Visual: `npm run dev` → click through Map/Art/Sprite; collapse/expand panels and **restart the app** to confirm collapse state persists; confirm nothing looks broken or off-palette.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): collapsible persisted panels; raw-hex guardrail at zero"
```

---

## Self-Review

**Spec coverage (Plan A scope = spec §3.1, §3.2, §6 Plan A):**
- §3.1 token adoption + primitives + icon tools + vitest guardrail + pixelPerfect fix → Tasks 1,2,3,5,9. ✓
- §3.2 EditorShell + 3 modes in it + View menu + localStorage panels + remove double toolbar/doc-header/2-row toolbar → Tasks 4,6,7,8,9. ✓
- §2.1 reconciliation: overlay toggles → View menu (Task 6); `editorStore.tool` stays (Map tool dock just renders it, Task 6); `viewStore` pan/zoom untouched in Plan A (Plan B). ✓
- Deferred correctly to Plan B (not in this plan): camera/HUD, toolStore, sprite undo, agent-handler camera migration. ✓

**Placeholder scan:** Pure-logic tasks (1,4,5) carry complete code/tests. UI tasks (6–9) give exact files, the concrete refactor recipe, the hex→token mapping table, and per-task verification (typecheck + `npm test` + ratchet + named visual checks) — not "handle styling appropriately." No "TBD"/"similar to Task N".

**Type consistency:** `T` token names, `EditorShellProps`, `ToolButton`/`Panel`/`Menu`/`Select`/`NumberField` signatures, and `panel-state` exports (`loadPanelState`/`savePanelState`/`isCollapsed`/`togglePanel`, `PanelState`) are defined once (Tasks 2–4) and referenced consistently in Tasks 5–9.

**Note for the implementer:** the guardrail ceiling only ever decreases; if a task can't fully tokenize a file, lower the ceiling by what you did and leave the rest for Task 9 — never raise it.
