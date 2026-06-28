# Sprite Palette Modes — Phase 3 (Cross-Sprite Pixel Copy/Paste) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy a marquee selection in one sprite and paste it into another (or the same) sprite — a clipboard that survives switching/loading sprites. Indices are preserved; the destination palette colors the pasted pixels (the destination always wins). Completes §8 of the Sprite Palette Modes spec.

**Architecture:** Pure region ops (`copyRegion`/`clearRegion`/`pasteRegion`) in `src/core/art/pixel-clipboard.ts`. The clip itself lives in `spriteStore` as `clipboard: ClipRegion | null` — a single global store, so it persists across `loadSprite`/`newSprite` (which never reset it) and gives the Paste button reactivity. New store actions `copySelection`/`cutSelection`/`paste` commit through the existing `setBuffer` (one sprite-history undo step). Keyboard (Ctrl+C/X/V) in `SpriteMode`, buttons in `SpriteToolOptions`.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (node env). Reuses `PixelBuffer` (`src/core/art/pixel-ops.ts`).

---

## Design decisions

- **Transparency-aware paste:** `pasteRegion` skips clip index 0, mirroring the existing move gesture (`pixel-edit-controller.ts:218` — `if (v !== 0) setPx(...)`). So a pasted shape doesn't punch a rectangular transparent hole into the destination.
- **Paste origin:** the current selection's top-left if one exists, else (0,0); clamped so the region fits in the destination buffer (overflow is clipped). After paste, the pasted rectangle becomes the selection, so the user can immediately drag it with the select tool. (Cursor-anchored paste is a deferred nicety.)
- **Clipboard persistence:** held in `spriteStore`; `newSprite`/`loadSprite` do NOT reset it, so copy-in-A → load-B → paste works. Copy stores indices only; the destination palette colors them (the spec's "destination wins"). Index-preserving; no remap (the "paste & match colors" variant is deferred per spec §1).
- **Undo:** `cut` and `paste` change pixels → one sprite-history step each (via `setBuffer`/`recordEdit`). `copy` changes nothing → not undoable. All consistent with the unified sprite-mode undo from Phase 2's follow-up.

## File Structure

- **Create** `src/core/art/pixel-clipboard.ts` — `ClipRegion`, `copyRegion`, `clearRegion`, `pasteRegion`.
- **Create** `test/art/pixel-clipboard.test.ts` — unit tests.
- **Modify** `src/renderer/state/spriteStore.ts` — `clipboard` state + `copySelection`/`cutSelection`/`paste` actions.
- **Modify** `src/renderer/components/sprite/SpriteMode.tsx` — Ctrl+C/X/V keyboard.
- **Modify** `src/renderer/shell/SpriteToolOptions.tsx` — Copy/Cut/Paste buttons.

Verification gate for every task: `npx tsc --noEmit && npm test && npm run build` all green; raw-hex guardrail stays at 0.

---

## Task A: Pure region ops (`pixel-clipboard.ts`)

**Files:**
- Create: `src/core/art/pixel-clipboard.ts`
- Test: `test/art/pixel-clipboard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/art/pixel-clipboard.test.ts
import { describe, it, expect } from 'vitest';
import { copyRegion, clearRegion, pasteRegion } from '../../src/core/art/pixel-clipboard';
import type { PixelBuffer } from '../../src/core/art/pixel-ops';

function buf(width: number, height: number, fill: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return { width, height, data };
}

describe('copyRegion', () => {
  it('extracts the selection rectangle of indices', () => {
    const b = buf(4, 4, (x, y) => x + y * 4); // 0..15
    const r = copyRegion(b, { x: 1, y: 1, w: 2, h: 2 });
    expect(r).not.toBeNull();
    expect(r!.w).toBe(2); expect(r!.h).toBe(2);
    expect(Array.from(r!.data)).toEqual([5, 6, 9, 10]);
  });
  it('clamps a selection that overruns the buffer', () => {
    const b = buf(3, 3, () => 7);
    const r = copyRegion(b, { x: 2, y: 2, w: 5, h: 5 });
    expect(r!.w).toBe(1); expect(r!.h).toBe(1);
    expect(Array.from(r!.data)).toEqual([7]);
  });
  it('returns null for an empty/offscreen selection', () => {
    const b = buf(3, 3, () => 1);
    expect(copyRegion(b, { x: 5, y: 5, w: 2, h: 2 })).toBeNull();
    expect(copyRegion(b, { x: 0, y: 0, w: 0, h: 0 })).toBeNull();
  });
});

describe('clearRegion', () => {
  it('zeroes the selection rect, leaving the rest and the original intact', () => {
    const b = buf(3, 3, () => 9);
    const out = clearRegion(b, { x: 1, y: 0, w: 2, h: 2 });
    expect(out).not.toBe(b);
    expect(b.data[1]).toBe(9); // original untouched
    expect(out.data[0]).toBe(9); // outside the rect
    expect(out.data[1]).toBe(0); expect(out.data[2]).toBe(0); // row 0, x=1..2
    expect(out.data[4]).toBe(0); expect(out.data[5]).toBe(0); // row 1, x=1..2
  });
});

describe('pasteRegion', () => {
  it('stamps non-zero indices at (px,py), skipping clip index 0 (transparency-aware)', () => {
    const dest = buf(4, 4, () => 3);
    const clip = { w: 2, h: 2, data: new Uint8Array([0, 5, 6, 0]) };
    const out = pasteRegion(dest, clip, 1, 1);
    expect(out).not.toBe(dest);
    expect(out.data[1 * 4 + 1]).toBe(3); // clip(0,0)=0 → skipped, dest kept
    expect(out.data[1 * 4 + 2]).toBe(5); // clip(1,0)=5 → stamped
    expect(out.data[2 * 4 + 1]).toBe(6); // clip(0,1)=6 → stamped
    expect(out.data[2 * 4 + 2]).toBe(3); // clip(1,1)=0 → skipped
  });
  it('clips overflow beyond the destination bounds', () => {
    const dest = buf(2, 2, () => 0);
    const clip = { w: 2, h: 2, data: new Uint8Array([1, 1, 1, 1]) };
    const out = pasteRegion(dest, clip, 1, 1); // only (1,1) lands in-bounds
    expect(Array.from(out.data)).toEqual([0, 0, 0, 1]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run test/art/pixel-clipboard.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/core/art/pixel-clipboard.ts
import type { PixelBuffer } from './pixel-ops';

/** A copied rectangular region of palette indices. */
export interface ClipRegion { w: number; h: number; data: Uint8Array; }

interface Rect { x: number; y: number; w: number; h: number; }

/** Extract the selection rectangle of indices (clamped to the buffer). Returns
 *  null if the clamped region is empty. */
export function copyRegion(buffer: PixelBuffer, sel: Rect): ClipRegion | null {
  const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y);
  const x1 = Math.min(buffer.width, sel.x + sel.w), y1 = Math.min(buffer.height, sel.y + sel.h);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    data[y * w + x] = buffer.data[(y0 + y) * buffer.width + (x0 + x)];
  }
  return { w, h, data };
}

/** A copy of `buffer` with the selection rect zeroed (transparent). For cut. */
export function clearRegion(buffer: PixelBuffer, sel: Rect): PixelBuffer {
  const out: PixelBuffer = { width: buffer.width, height: buffer.height, data: new Uint8Array(buffer.data) };
  const x0 = Math.max(0, sel.x), y0 = Math.max(0, sel.y);
  const x1 = Math.min(buffer.width, sel.x + sel.w), y1 = Math.min(buffer.height, sel.y + sel.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.data[y * buffer.width + x] = 0;
  return out;
}

/** A copy of `buffer` with `clip` stamped at (px,py). Index 0 in the clip is
 *  transparent (skipped), mirroring the move gesture; out-of-bounds pixels are
 *  clipped. The destination palette colors the result (indices preserved). */
export function pasteRegion(buffer: PixelBuffer, clip: ClipRegion, px: number, py: number): PixelBuffer {
  const out: PixelBuffer = { width: buffer.width, height: buffer.height, data: new Uint8Array(buffer.data) };
  for (let y = 0; y < clip.h; y++) for (let x = 0; x < clip.w; x++) {
    const v = clip.data[y * clip.w + x];
    if (v === 0) continue;
    const dx = px + x, dy = py + y;
    if (dx < 0 || dy < 0 || dx >= buffer.width || dy >= buffer.height) continue;
    out.data[dy * buffer.width + dx] = v;
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run test/art/pixel-clipboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/pixel-clipboard.ts test/art/pixel-clipboard.test.ts
git commit -m "feat(sprite): pure pixel-region copy/clear/paste ops for the clipboard"
```

---

## Task B: Clipboard state + copy/cut/paste actions in `spriteStore`

**Files:**
- Modify: `src/renderer/state/spriteStore.ts`

- [ ] **Step 1: Import the pure ops + ClipRegion** (with the other core imports near the top)

```ts
import { copyRegion, clearRegion, pasteRegion, type ClipRegion } from '../../core/art/pixel-clipboard';
```

- [ ] **Step 2: Add `clipboard` to the state interface** (in the `SpriteState` interface, near `selection`)

```ts
  clipboard: ClipRegion | null;
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
```

- [ ] **Step 3: Initialize `clipboard: null`** (in the store object, near `selection: null`). It is intentionally never reset by `newSprite`/`loadSprite`, so the clipboard survives switching/loading sprites.

```ts
  clipboard: null,
```

- [ ] **Step 4: Add the three actions** (place them right after the `setBuffer` action so they sit with the other frame mutators)

```ts
  copySelection: () => {
    const s = get();
    if (!s.selection) return;
    const region = copyRegion(s.frames[s.currentIndex], s.selection);
    if (region) set({ clipboard: region });
  },
  cutSelection: () => {
    const s = get();
    if (!s.selection) return;
    const region = copyRegion(s.frames[s.currentIndex], s.selection);
    if (!region) return;
    recordEdit(s);
    const frames = s.frames.slice();
    frames[s.currentIndex] = clearRegion(s.frames[s.currentIndex], s.selection);
    set({ frames, clipboard: region, selection: null, historyTick: s.historyTick + 1 });
  },
  paste: () => {
    const s = get();
    const clip = s.clipboard;
    if (!clip) return;
    const cur = s.frames[s.currentIndex];
    // Origin: the selection's top-left if present, else (0,0); clamped so the
    // region fits (overflow is clipped by pasteRegion regardless).
    const ox = Math.max(0, Math.min(s.selection?.x ?? 0, Math.max(0, cur.width - clip.w)));
    const oy = Math.max(0, Math.min(s.selection?.y ?? 0, Math.max(0, cur.height - clip.h)));
    recordEdit(s);
    const frames = s.frames.slice();
    frames[s.currentIndex] = pasteRegion(cur, clip, ox, oy);
    // Select the pasted rectangle (clamped to bounds) so it can be moved next.
    const w = Math.min(clip.w, cur.width - ox), h = Math.min(clip.h, cur.height - oy);
    set({ frames, selection: { x: ox, y: oy, w, h }, historyTick: s.historyTick + 1 });
  },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/spriteStore.ts
git commit -m "feat(sprite): clipboard state + copy/cut/paste actions (survive sprite switches)"
```

---

## Task C: Keyboard (Ctrl+C/X/V) in `SpriteMode`

**Files:**
- Modify: `src/renderer/components/sprite/SpriteMode.tsx:78-96` (the existing keydown handler)

- [ ] **Step 1: Add the clipboard shortcuts** inside the existing `handler`, after the undo/redo branches (before the closing `};`). They reuse the same text-field guard already at the top of the handler.

```ts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        useSpriteStore.getState().copySelection();
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        useSpriteStore.getState().cutSelection();
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        useSpriteStore.getState().paste();
        e.preventDefault();
        return;
      }
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/sprite/SpriteMode.tsx
git commit -m "feat(sprite): Ctrl+C/X/V copy/cut/paste shortcuts"
```

---

## Task D: Copy/Cut/Paste buttons in `SpriteToolOptions`

**Files:**
- Modify: `src/renderer/shell/SpriteToolOptions.tsx`

- [ ] **Step 1: Subscribe to selection + clipboard** (with the other `useSpriteStore` selectors, ~line 42)

```ts
  const selection = useSpriteStore((s) => s.selection);
  const clipboard = useSpriteStore((s) => s.clipboard);
```

- [ ] **Step 2: Add a Copy/Cut/Paste group** (after the `TransformGrid` span, before the right-aligned `ZoomControl` span)

```tsx
      <Divider />

      <span style={{ display: 'inline-flex', gap: 4 }}>
        <Chip disabled={!selection} title="Copy selection (Ctrl+C)" onClick={() => st().copySelection()}>Copy</Chip>
        <Chip disabled={!selection} title="Cut selection (Ctrl+X)" onClick={() => st().cutSelection()}>Cut</Chip>
        <Chip disabled={!clipboard} title="Paste (Ctrl+V)" onClick={() => st().paste()}>Paste</Chip>
      </span>
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; raw-hex guardrail stays 0 (Chip + tokens only).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/shell/SpriteToolOptions.tsx
git commit -m "feat(sprite): Copy/Cut/Paste buttons in the sprite tool options"
```

---

## Self-review checklist (after all tasks)

- **Spec §8 coverage:** module-/store-level clipboard survives sprite switch/load ✓ (never reset by newSprite/loadSprite); copy/cut from a marquee ✓; paste preserves indices, destination palette wins ✓ (no remap); paste never changes mode/palette ✓ (only frames + selection). The "paste & match colors" remap is deferred per spec §1.
- **Type consistency:** `ClipRegion` shape identical between `pixel-clipboard.ts` and `spriteStore.ts`; `copyRegion`/`clearRegion`/`pasteRegion` signatures match call sites.
- **Undo:** cut + paste each `recordEdit` once (one undo step); copy records nothing. Works with the unified sprite-mode undo.
- **Guardrail:** buttons use `Chip` + `T` tokens only.

## Manual verification (with user)

Marquee-select a region in a sprite → Ctrl+C → load/switch to another sprite → Ctrl+V → the pixels appear (in the new sprite's palette), selected and movable. Ctrl+X cuts (clears the source). Ctrl+Z undoes a paste/cut. Buttons mirror the shortcuts and disable when there's no selection / no clip. Paste a clip larger than the destination → it clips to bounds.
