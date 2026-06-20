# Sprite Palette Modes — Phase 2 (Copy Bridge + Add-ons) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the copy bridge (move colors between the sprite's standalone palette and the zone CRAM lines, both directions, at swatch and line granularity), Genesis-legal snapping on every copy, and a shared-line usage warning — completing §5 and §7 of the Sprite Palette Modes spec.

**Architecture:** Two pure core modules (`palette-copy.ts` for snap + copy ops; `paletteLineUsageCounts` added to `usage.ts`) drive UI changes in `PaletteEditor.tsx` (drag-to-copy within the displayed palette + a right-click "Copy to ▸" menu that bridges to the other palette model, index-preserving) and a small usage note in `SpritePaletteHeader.tsx`. A new presentational `PaletteCopyMenu.tsx` renders the cursor-anchored menu. Zone-destination copies commit through the existing `set-palette-line` command (level undo); standalone-destination copies commit through `setStandalonePalette` (sprite undo).

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (node env). Genesis color quantization via `encodeGenesisColor`/`decodeGenesisColor`.

---

## Design decisions (interpretation of spec §5)

The Phase-1 palette panel shows **one** palette at a time (zone lines *or* the standalone row, by mode). We keep that — showing both simultaneously would clutter the narrow panel. Given that, the copy bridge is two complementary interactions:

- **Drag-to-copy within the displayed palette** (the fast path): drag a swatch onto another swatch, or a line's grip onto another line's grip. Works among the visible zone lines (zone mode) or among the standalone row's swatches (standalone mode).
- **Right-click "Copy to ▸" menu** (the cross-model bridge): the source is the right-clicked swatch/line; the menu lists *explicit* destinations including the **other** palette model — so it copies sprite↔zone **both directions** even though only one palette is on screen. Swatch copies are **index-preserving** (index *i* → index *i* of the destination line, per spec §5).

Every copied color is snapped to the Genesis 512-color gamut on write. Index 0 (the transparent backdrop) is never a copy source or destination — it stays transparent on both sides.

**§7 "live preview on line switch" is already satisfied** — `SpriteCanvasHost`, `FrameGrid`, and `Timeline` all subscribe to `spriteStore.zoneLine` directly, so flipping the bound line re-resolves and repaints instantly. No code change; covered by manual verification only.

## File Structure

- **Create** `src/core/art/palette-copy.ts` — pure: `snapColorToGenesis`, `copySwatchInto`, `copyLineInto`.
- **Create** `test/art/palette-copy.test.ts` — unit tests for the above.
- **Modify** `src/core/art/usage.ts` — add `paletteLineUsageCounts(act)`.
- **Modify** `test/art/usage.test.ts` — add `paletteLineUsageCounts` tests.
- **Create** `src/renderer/components/art/PaletteCopyMenu.tsx` — presentational cursor-anchored menu.
- **Modify** `src/renderer/components/sprite/SpritePaletteHeader.tsx` — shared-line usage note (zone mode).
- **Modify** `src/renderer/components/art/PaletteEditor.tsx` — drag + right-click copy bridge wiring.

Verification gate for every task: `npx tsc --noEmit && npm test && npm run build` all green; the raw-hex guardrail (`test/renderer/no-raw-hex.test.ts`, MAX_RAW_HEX=0) stays at 0.

---

## Task A: Pure copy operations (`palette-copy.ts`)

**Files:**
- Create: `src/core/art/palette-copy.ts`
- Test: `test/art/palette-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/art/palette-copy.test.ts
import { describe, it, expect } from 'vitest';
import { snapColorToGenesis, copySwatchInto, copyLineInto } from '../../src/core/art/palette-copy';
import { encodeGenesisColor, decodeGenesisColor } from '../../src/core/formats/palette';
import type { Color } from '../../src/core/model/s4-types';

const C = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });
const line16 = (fill: Color): Color[] => Array.from({ length: 16 }, (_, i) => (i === 0 ? C(0, 0, 0, 0) : { ...fill }));

describe('snapColorToGenesis', () => {
  it('snaps a color to the 3-bit-per-channel Genesis gamut, preserving alpha', () => {
    const snapped = snapColorToGenesis(C(130, 200, 5, 200));
    expect(snapped).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 200 });
  });
  it('is idempotent (already-legal colors are unchanged)', () => {
    const legal = decodeGenesisColor(encodeGenesisColor(C(123, 45, 250)));
    expect(snapColorToGenesis(legal)).toEqual({ ...legal, a: 255 });
  });
});

describe('copySwatchInto', () => {
  it('replaces a single index with the snapped source color (opaque), returns a new array', () => {
    const dest = line16(C(10, 10, 10));
    const out = copySwatchInto(dest, 5, C(130, 200, 5, 50));
    expect(out).not.toBe(dest);
    expect(out[5]).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 255 });
    expect(out[4]).toEqual(dest[4]);     // others untouched
    expect(out[0]).toEqual(C(0, 0, 0, 0)); // index 0 stays transparent
  });
  it('refuses to write index 0 (transparent backdrop), returning an unchanged copy', () => {
    const dest = line16(C(10, 10, 10));
    const out = copySwatchInto(dest, 0, C(200, 200, 200));
    expect(out).not.toBe(dest);
    expect(out[0]).toEqual(C(0, 0, 0, 0));
  });
  it('refuses out-of-range indices, returning an unchanged copy', () => {
    const dest = line16(C(10, 10, 10));
    expect(copySwatchEq(copySwatchInto(dest, 16, C(1, 2, 3)), dest)).toBe(true);
    expect(copySwatchEq(copySwatchInto(dest, -1, C(1, 2, 3)), dest)).toBe(true);
  });
});

function copySwatchEq(a: Color[], b: Color[]): boolean {
  return a.length === b.length && a.every((c, i) => c.r === b[i].r && c.g === b[i].g && c.b === b[i].b && c.a === b[i].a);
}

describe('copyLineInto', () => {
  it('copies indices 1-15 snapped+opaque, preserves dest index 0', () => {
    const dest = line16(C(10, 10, 10));
    const src = line16(C(130, 200, 5));
    src[0] = C(99, 99, 99, 255); // a non-transparent src[0] must NOT leak into dest
    const out = copyLineInto(dest, src);
    expect(out[0]).toEqual(dest[0]); // dest backdrop preserved
    for (let i = 1; i < 16; i++) {
      expect(out[i]).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 255 });
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/art/palette-copy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/core/art/palette-copy.ts
import type { Color } from '../model/s4-types';
import { encodeGenesisColor, decodeGenesisColor } from '../formats/palette';

/** Snap a color to the Genesis 512-color gamut (3 bits/channel), preserving alpha. */
export function snapColorToGenesis(c: Color): Color {
  return { ...decodeGenesisColor(encodeGenesisColor(c)), a: c.a };
}

/**
 * Copy `src` into `dest[destIdx]`, snapped to Genesis and forced opaque. Index 0
 * (the transparent backdrop) and out-of-range indices are never written. Always
 * returns a fresh array (never mutates `dest`).
 */
export function copySwatchInto(dest: Color[], destIdx: number, src: Color): Color[] {
  const out = dest.map((c) => ({ ...c }));
  if (destIdx <= 0 || destIdx >= out.length) return out;
  out[destIdx] = { ...snapColorToGenesis(src), a: 255 };
  return out;
}

/**
 * Copy indices 1-15 of `src` into `dest`, snapped to Genesis and forced opaque.
 * `dest[0]` (the transparent backdrop) is preserved; `src[0]` is ignored. Returns
 * a fresh array.
 */
export function copyLineInto(dest: Color[], src: Color[]): Color[] {
  const out = dest.map((c) => ({ ...c }));
  for (let i = 1; i < out.length && i < src.length; i++) {
    out[i] = { ...snapColorToGenesis(src[i]), a: 255 };
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/art/palette-copy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/palette-copy.ts test/art/palette-copy.test.ts
git commit -m "feat(palette): pure Genesis-legal swatch/line copy ops for the copy bridge"
```

---

## Task B: Palette-line usage counts (`usage.ts`)

**Files:**
- Modify: `src/core/art/usage.ts`
- Test: `test/art/usage.test.ts:49` (append)

- [ ] **Step 1: Add the failing test** (append to `test/art/usage.test.ts`, after the existing `tileUsageCounts` describe block; reuse its `makeAct` import pattern — add `paletteLineUsageCounts` to the import on line 2)

```ts
import { tileUsageCounts, paletteLineUsageCounts } from '../../src/core/art/usage';
```

```ts
describe('paletteLineUsageCounts', () => {
  it('counts how many tiles reference each palette line across the act', () => {
    const act = makeAct();
    const s0 = createSection(0, 'S0');
    const s1 = createSection(1, 'S1');
    act.sections[0] = s0;
    act.sections[1] = s1;

    // line 2 used three times, line 1 once, line 0 once (all tileIndex > 0 so word != 0)
    s0.tileGrid.nametable[0] = packNametableWord(5, 2, false, false, false);
    s0.tileGrid.nametable[1] = packNametableWord(6, 2, false, false, false);
    s1.tileGrid.nametable[2] = packNametableWord(7, 2, false, false, false);
    s1.tileGrid.nametable[3] = packNametableWord(8, 1, false, false, false);
    s1.tileGrid.nametable[4] = packNametableWord(9, 0, false, false, false);

    const counts = paletteLineUsageCounts(act);
    expect(counts.get(2)).toBe(3);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(0)).toBe(1);
    expect(counts.get(3) ?? 0).toBe(0);
  });

  it('skips empty words (word === 0) and null sections', () => {
    const act = makeAct();
    act.sections[3] = createSection(0, 'S0'); // all words zero
    expect(paletteLineUsageCounts(act).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/art/usage.test.ts`
Expected: FAIL (`paletteLineUsageCounts` not exported).

- [ ] **Step 3: Implement** (append to `src/core/art/usage.ts`)

```ts
/** Map usage count per palette line (0-3) across all sections of an act. */
export function paletteLineUsageCounts(act: Act): Map<number, number> {
  const counts = new Map<number, number>();
  for (const section of act.sections) {
    if (!section) continue;
    const nt = section.tileGrid.nametable;
    for (let i = 0; i < nt.length; i++) {
      if (nt[i] === 0) continue;
      const line = unpackNametableWord(nt[i]).palette;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  return counts;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/art/usage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/usage.ts test/art/usage.test.ts
git commit -m "feat(art): paletteLineUsageCounts — per-line tile usage for the shared-line warning"
```

---

## Task C: Shared-line usage note in the sprite palette header

**Files:**
- Modify: `src/renderer/components/sprite/SpritePaletteHeader.tsx`

A small, non-blocking note shown in **zone mode** describing the weight of the bound line: `line 0 · player` is always "player · shared"; lines 1-3 show "used by N level tiles" when N > 0 (and nothing when unused). Mirrors `ArtMode`'s static shared-tile banner. Recompute with `useMemo` so we don't scan nametables every render.

- [ ] **Step 1: Add imports** (after line 4)

```tsx
import React, { useMemo } from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import { useProjectStore, getCurrentAct } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { paletteLineUsageCounts } from '../../../core/art/usage';
import { T, Chip } from '../ui';
```

(Replace the existing `import React from 'react';` and `import { useSpriteStore }...` lines accordingly; keep the existing `T, Chip` import.)

- [ ] **Step 2: Compute the note inside the component** (inside `SpritePaletteHeader`, after the existing `const st = useSpriteStore.getState;`)

```tsx
  const historyVersion = useEditorStore((s) => s.historyVersion); // recompute after level edits
  const currentActId = useProjectStore((s) => s.currentActId);
  const lineNote = useMemo(() => {
    if (mode !== 'zone') return null;
    if (zoneLine === 0) return 'player · shared';
    const act = getCurrentAct(useProjectStore.getState());
    if (!act) return null;
    const uses = paletteLineUsageCounts(act).get(zoneLine) ?? 0;
    return uses > 0 ? `used by ${uses.toLocaleString()} level tiles` : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, zoneLine, currentActId, historyVersion]);
```

- [ ] **Step 3: Render the note** (after the zone `<select>` block, before the `<Chip ... Standalone>`; insert just before line 55's Standalone chip)

```tsx
      {lineNote && <span style={note}>⚠ {lineNote}</span>}
```

And add the `note` style next to `btn`/`selectStyle`:

```tsx
const note: React.CSSProperties = {
  color: T.warning,
  fontSize: 10,
  whiteSpace: 'nowrap',
};
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; no-raw-hex stays 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sprite/SpritePaletteHeader.tsx
git commit -m "feat(sprite): shared-line usage note in the palette header (zone mode)"
```

---

## Task D: Cursor-anchored "Copy to" menu component

**Files:**
- Create: `src/renderer/components/art/PaletteCopyMenu.tsx`

A presentational, cursor-anchored menu mirroring `SectionGridNav`'s right-click menu recipe (fixed position, closes on document `mousedown` + Escape, stops propagation). All colors from `T` tokens (no raw hex).

- [ ] **Step 1: Implement**

```tsx
// src/renderer/components/art/PaletteCopyMenu.tsx
import React, { useEffect } from 'react';
import { T } from '../ui';

export interface CopyMenuItem {
  label: string;
  note?: string;        // dimmed trailing text, e.g. a usage count
  onSelect: () => void;
}

/**
 * A small cursor-anchored menu used by the palette copy bridge ("Copy to ▸").
 * Positioned at fixed (x, y); closes on outside mousedown or Escape. Items run
 * their onSelect then close. Purely presentational — the caller builds the items.
 */
export default function PaletteCopyMenu({
  x, y, heading, items, onClose,
}: { x: number; y: number; heading: string; items: CopyMenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      style={{ ...styles.menu, left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={styles.heading}>{heading}</div>
      {items.length === 0 && <div style={styles.empty}>no targets</div>}
      {items.map((it, i) => (
        <button
          key={i}
          style={styles.item}
          onClick={() => { it.onSelect(); onClose(); }}
        >
          <span>{it.label}</span>
          {it.note && <span style={styles.note}>{it.note}</span>}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 1000,
    minWidth: 160,
    background: T.raised,
    border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rMd,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    padding: 4,
    fontSize: 11,
  },
  heading: {
    padding: `${T.s1} ${T.s2}`,
    color: T.textLo,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: { padding: `${T.s1} ${T.s2}`, color: T.textFaint },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: T.s3,
    width: '100%',
    padding: `${T.s1} ${T.s2}`,
    background: 'transparent',
    color: T.textBase,
    border: 'none',
    borderRadius: T.rSm,
    cursor: 'pointer',
    textAlign: 'left',
  },
  note: { color: T.textLo, fontFamily: T.fontMono },
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; no-raw-hex stays 0 (the `rgba(...)` boxShadow is allowed; the regex only matches `#hex`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/art/PaletteCopyMenu.tsx
git commit -m "feat(palette): cursor-anchored Copy-to menu component"
```

---

## Task E: Copy bridge wiring in `PaletteEditor`

**Files:**
- Modify: `src/renderer/components/art/PaletteEditor.tsx`

Wires drag-to-copy (within the displayed palette) and the right-click "Copy to ▸" menu (cross-model, index-preserving) onto the swatches, plus per-row line grips. Depends on Tasks A, B, D.

### E.1 — Imports and apply helpers

- [ ] **Step 1: Add imports** (after line 6)

```tsx
import { encodeGenesisColor, decodeGenesisColor } from '../../../core/formats/palette';
import { copySwatchInto, copyLineInto } from '../../../core/art/palette-copy';
import { paletteLineUsageCounts } from '../../../core/art/usage';
import { getCurrentAct } from '../../state/projectStore';
import PaletteCopyMenu, { type CopyMenuItem } from './PaletteCopyMenu';
```

(Note: `getCurrentZone`, `getActiveLevel` are already imported from `../../state/projectStore` on line 2 — extend that import to add `getCurrentAct` rather than re-importing; the standalone import line above is shown for clarity, fold it into line 2.)

- [ ] **Step 2: Add a module-level drag payload + a same-colors helper** (top level, after `CHANNEL_COLORS` on line 25)

```tsx
/** Source carried by an in-progress swatch/line drag (HTML5 DnD; payload in a
 *  module ref, mirroring SectionGridNav — no dataTransfer). */
type DragPayload = { kind: 'swatch'; color: Color } | { kind: 'line'; colors: Color[] };
let dragPayload: DragPayload | null = null;

function sameColors(a: Color[], b: Color[]): boolean {
  return a.length === b.length && a.every((c, i) =>
    encodeGenesisColor(c) === encodeGenesisColor(b[i]) && c.a === b[i].a);
}
```

- [ ] **Step 3: Add apply helpers** (inside the component, after `commitDrag` ends at line 235)

```tsx
  /** Copy a single color into a zone line index, via the undoable set-palette-line command. */
  function applyZoneSwatchCopy(line: number, idx: number, src: Color) {
    if (idx <= 0) return;
    const state = useProjectStore.getState();
    const z = getCurrentZone(state);
    const level = getActiveLevel(state);
    if (!z || !level) return;
    const old = z.palette.lines[line].colors.map((c) => ({ ...c }));
    const edited = copySwatchInto(old, idx, src);
    if (sameColors(edited, old)) return;
    executeCommand({
      type: 'set-palette-line', line, oldColors: old, newColors: edited,
      sectionIndex: -1, description: `copy color into line ${line} idx ${idx}`,
    }, level);
  }

  /** Copy 16 colors (1-15) into a zone line, via set-palette-line. */
  function applyZoneLineCopy(line: number, src: Color[]) {
    const state = useProjectStore.getState();
    const z = getCurrentZone(state);
    const level = getActiveLevel(state);
    if (!z || !level) return;
    const old = z.palette.lines[line].colors.map((c) => ({ ...c }));
    const edited = copyLineInto(old, src);
    if (sameColors(edited, old)) return;
    executeCommand({
      type: 'set-palette-line', line, oldColors: old, newColors: edited,
      sectionIndex: -1, description: `copy palette line into ${line}`,
    }, level);
  }

  /** Copy a single color into the standalone palette, via setStandalonePalette (sprite undo). */
  function applyStandaloneSwatchCopy(idx: number, src: Color) {
    if (idx <= 0) return;
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = copySwatchInto(cur, idx, src);
    if (sameColors(edited, cur)) return;
    useSpriteStore.getState().setStandalonePalette(edited);
  }

  /** Copy 16 colors into the standalone palette. */
  function applyStandaloneLineCopy(src: Color[]) {
    const cur = useSpriteStore.getState().standalonePalette;
    const edited = copyLineInto(cur, src);
    if (sameColors(edited, cur)) return;
    useSpriteStore.getState().setStandalonePalette(edited);
  }
```

### E.2 — Menu state + builders

- [ ] **Step 4: Add menu + drag-over state** (after `const [sel, setSel] = useState<SwatchSel | null>(null);` on line 64)

```tsx
  const [menu, setMenu] = useState<{ x: number; y: number; heading: string; items: CopyMenuItem[] } | null>(null);
  // Highlighted drop target during a drag: `${kind}:${line}:${idx}`.
  const [dropKey, setDropKey] = useState<string | null>(null);
```

- [ ] **Step 5: Add menu builders** (inside component, after the apply helpers)

```tsx
  /** Usage note for a zone line: line 0 always shared; 1-3 show tile counts. */
  function zoneLineNote(line: number): string | undefined {
    if (line === 0) return 'player';
    const act = getCurrentAct(useProjectStore.getState());
    if (!act) return undefined;
    const uses = paletteLineUsageCounts(act).get(line) ?? 0;
    return uses > 0 ? `${uses.toLocaleString()} tiles` : undefined;
  }

  /** Build "Copy to ▸" targets for a single swatch (index-preserving). `srcLine`
   *  is the source zone line, or -1 when the source is the standalone palette. */
  function swatchMenuItems(srcLine: number, idx: number, src: Color): CopyMenuItem[] {
    const items: CopyMenuItem[] = [];
    for (let l = 0; l < lines.length; l++) {
      if (l === srcLine) continue; // skip the source line
      items.push({ label: `Zone line ${l} · idx ${idx}`, note: zoneLineNote(l), onSelect: () => applyZoneSwatchCopy(l, idx, src) });
    }
    if (srcLine !== -1) {
      items.push({ label: `Standalone · idx ${idx}`, onSelect: () => applyStandaloneSwatchCopy(idx, src) });
    }
    return items;
  }

  /** Build "Copy to ▸" targets for a whole line. */
  function lineMenuItems(srcLine: number, src: Color[]): CopyMenuItem[] {
    const items: CopyMenuItem[] = [];
    for (let l = 0; l < lines.length; l++) {
      if (l === srcLine) continue;
      items.push({ label: `Zone line ${l}`, note: zoneLineNote(l), onSelect: () => applyZoneLineCopy(l, src) });
    }
    if (srcLine !== -1) {
      items.push({ label: 'Standalone', onSelect: () => applyStandaloneLineCopy(src) });
    }
    return items;
  }

  function openSwatchMenu(e: React.MouseEvent, srcLine: number, idx: number, src: Color) {
    if (idx <= 0) return; // transparent backdrop isn't a copy source
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy color to', items: swatchMenuItems(srcLine, idx, src) });
  }
  function openLineMenu(e: React.MouseEvent, srcLine: number, src: Color[]) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, heading: 'Copy line to', items: lineMenuItems(srcLine, src) });
  }
```

### E.3 — Drag handlers

- [ ] **Step 6: Add drag handlers** (inside component, after the menu builders)

```tsx
  function onSwatchDragStart(color: Color) { dragPayload = { kind: 'swatch', color }; }
  function onLineDragStart(colors: Color[]) { dragPayload = { kind: 'line', colors: colors.map((c) => ({ ...c })) }; }
  function onSwatchDragOver(e: React.DragEvent, key: string, idx: number) {
    if (dragPayload?.kind !== 'swatch' || idx <= 0) return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function onLineDragOver(e: React.DragEvent, key: string) {
    if (dragPayload?.kind !== 'line') return;
    e.preventDefault();
    if (dropKey !== key) setDropKey(key);
  }
  function endDrag() { dragPayload = null; setDropKey(null); }
  /** Drop a swatch onto a target. `destLine` is the zone line, or -1 for standalone. */
  function onSwatchDrop(destLine: number, idx: number) {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'swatch' || idx <= 0) return;
    if (destLine === -1) applyStandaloneSwatchCopy(idx, p.color);
    else applyZoneSwatchCopy(destLine, idx, p.color);
  }
  function onLineDrop(destLine: number) {
    const p = dragPayload;
    endDrag();
    if (p?.kind !== 'line') return;
    if (destLine === -1) applyStandaloneLineCopy(p.colors);
    else applyZoneLineCopy(destLine, p.colors);
  }
```

### E.4 — Wire the swatch elements + line grips + render the menu

- [ ] **Step 7: Standalone swatch** — extend the standalone branch `<div>` (lines 255-267). Add drag/drop/context handlers. `standaloneSprite` source line is `-1`.

Replace the standalone swatch `<div ...>` opening (lines 255-258) with:

```tsx
                <div
                  key={ci}
                  title={title}
                  draggable={ci > 0}
                  onDragStart={() => onSwatchDragStart(c)}
                  onDragOver={(e) => onSwatchDragOver(e, `sa:0:${ci}`, ci)}
                  onDrop={() => onSwatchDrop(-1, ci)}
                  onDragEnd={endDrag}
                  onContextMenu={(e) => openSwatchMenu(e, -1, ci, c)}
                  onClick={() => handleStandaloneClick(ci)}
```

And add the drop-highlight to its style object (inside the `style={{ ... }}` for the standalone swatch, after `...(isEditSel ? styles.editSel : {}),`):

```tsx
                    ...(dropKey === `sa:0:${ci}` ? styles.dropTarget : {}),
```

- [ ] **Step 8: Zone swatch** — extend the zone branch `<div>` (lines 290-303). Source line is `li`.

Replace the zone swatch `<div ...>` opening (lines 290-293) with:

```tsx
                  <div
                    key={ci}
                    title={title}
                    draggable={ci > 0 && !locked}
                    onDragStart={() => onSwatchDragStart(c)}
                    onDragOver={(e) => onSwatchDragOver(e, `z:${li}:${ci}`, ci)}
                    onDrop={() => onSwatchDrop(li, ci)}
                    onDragEnd={endDrag}
                    onContextMenu={(e) => (locked ? undefined : openSwatchMenu(e, li, ci, c))}
                    onClick={() => handleSwatchClick(li, ci)}
```

And add to its style object (after `...(isEditSel ? styles.editSel : {}),`):

```tsx
                      ...(dropKey === `z:${li}:${ci}` ? styles.dropTarget : {}),
```

- [ ] **Step 9: Line grips** — add a draggable grip at the start of each zone row and the standalone row, as the line-copy source + line-menu trigger.

For the standalone row, change its wrapper (line 246) from `<div style={styles.row}>` to include a grip:

```tsx
          <div style={styles.row}>
            <div
              style={styles.grip}
              title="Drag to copy this palette · right-click to copy to a zone line"
              draggable
              onDragStart={() => onLineDragStart(standalone)}
              onDragOver={(e) => onLineDragOver(e, 'sa-line')}
              onDrop={() => onLineDrop(-1)}
              onDragEnd={endDrag}
              onContextMenu={(e) => openLineMenu(e, -1, standalone)}
            />
            {standalone.map((c, ci) => {
```

For each zone row, change its wrapper (line 273) from `<div key={li} style={styles.row}>` to include a grip:

```tsx
            <div key={li} style={styles.row}>
              <div
                style={{ ...styles.grip, ...(dropKey === `z-line:${li}` ? styles.dropTarget : {}) }}
                title={`Drag to copy line ${li} · right-click to copy elsewhere`}
                draggable
                onDragStart={() => onLineDragStart(line.colors)}
                onDragOver={(e) => onLineDragOver(e, `z-line:${li}`)}
                onDrop={() => onLineDrop(li)}
                onDragEnd={endDrag}
                onContextMenu={(e) => openLineMenu(e, li, line.colors)}
              />
              {line.colors.map((c, ci) => {
```

- [ ] **Step 10: Render the menu** — at the end of the component's returned JSX, just before the final `</div>` that closes `styles.root` (after the `{sel && selColor && (...)}` block, line 343):

```tsx
      {menu && (
        <PaletteCopyMenu
          x={menu.x} y={menu.y} heading={menu.heading} items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
```

- [ ] **Step 11: Add the `grip` and `dropTarget` styles** (in the `styles` object, after `swatch`)

```tsx
  grip: {
    width: 6,
    alignSelf: 'stretch',
    minHeight: 20,
    borderRadius: 2,
    background: T.borderStrong,
    cursor: 'grab',
    flex: '0 0 auto',
  },
  dropTarget: {
    outline: `2px solid ${T.accent}`,
    outlineOffset: -1,
  },
```

- [ ] **Step 12: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; no-raw-hex stays 0.

- [ ] **Step 13: Commit**

```bash
git add src/renderer/components/art/PaletteEditor.tsx
git commit -m "feat(palette): copy bridge — drag + right-click Copy-to between sprite and zone palettes"
```

---

## Self-review checklist (run after all tasks)

- **Spec coverage:** §5 swatch copy (drag + menu) ✓, line copy (drag + menu) ✓, both directions (menu lists the other model) ✓, Genesis snap on every write (Task A) ✓, shared-line warning on copy-into-zone (menu notes + header note, Tasks B/C/E) ✓. §7 Genesis-legal everywhere ✓ (standalone slider already snaps; copies now snap), live preview on line switch ✓ (already satisfied — manual verify), shared-line warning ✓.
- **Type consistency:** `copySwatchInto`/`copyLineInto`/`snapColorToGenesis` signatures match between Task A and Task E call sites. `CopyMenuItem` shape matches between Task D and Task E.
- **Undo correctness:** zone destinations → `set-palette-line` (level history, old+new captured); standalone destinations → `setStandalonePalette` (sprite history, records pre-state). Both already proven paths in the existing slider commit code.
- **Guardrail:** all new UI colors come from `T`; only `rgb(data)`/`rgba(shadow)` literals, which the `#hex`-only regex ignores.

## Manual verification (with user)

Load Sonic (zone/line-0); switch zone/standalone; in zone mode confirm the header note ("player · shared" on line 0; "used by N level tiles" on a used line). Right-click a swatch → "Copy color to" lists zone lines + Standalone with tile-count notes; pick one and confirm the destination swatch updates and Ctrl+Z reverts it. Drag a swatch onto another swatch (same palette) and confirm the copy + drop-target outline. Drag a line grip onto another grip. Repeat a copy **into** a used zone line and confirm the note flags it. Confirm copies are Genesis-legal (no out-of-gamut colors).
