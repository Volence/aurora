# The origination canvas — document, drawing, persistence (Phase 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free-size indexed canvas document you can create, draw on, save and reopen — the surface phase 2's constraint checking (2B) and resolve-and-commit (2C) will land on top of.

**Architecture:** A new document type in the existing tab system, exactly as spec §4.1 asks: it inherits guarded activation, per-document undo, dirty tracking and `SaveCoordinator` routing by following the sprite-doc pattern already proven in the tree. Its one real difference from a sprite doc is the colour model — pixels index the whole 64-colour Genesis space (4 lines × 16), not one 16-colour line — and its one piece of genuinely new machinery is an indexed-PNG codec, so the files stay openable in Aseprite.

**Tech Stack:** TypeScript, React 19, zustand, Electron (renderer-side fs via `window.api`), vitest (node env — no React, no canvas). `CompressionStream`/`DecompressionStream` for PNG deflate; no new npm dependency.

---

## Context an engineer starting here needs

Read these before Task 1:

- `docs/superpowers/specs/2026-08-15-in-app-art-authoring-design.md` — §4 is what this plan builds. §4.2 (profiles), §4.3 (how violations surface) and §4.4 (resolve/commit) are **2B and 2C**, not this plan; §4.1 (the document) is.
- `docs/superpowers/plans/2026-08-15-art-authoring-phase1-paint-through.md` — phase 1, merged. Its `## Audit corrections` and later decision sections are authoritative over its task text.
- `src/renderer/state/spriteStore.ts` — the multi-document store this plan mirrors (deliberately with one simplification; see Task 7).
- `src/renderer/shell/tab-activation.ts` — how focusing a document tab checks a document out.
- `src/renderer/state/history-factories.ts`, `src/core/editing/document-history.ts` — per-document undo.
- `src/renderer/state/project-runtime.ts` — savers and Ctrl+S routing.

**The standing lesson from phase 1** (`aurora-guards-assert-nothing`): *plant a violation and watch each guard fail before believing it passes.* Several tasks below have an explicit falsification step. Do not skip them, and if a plant breaks nothing, **that is the finding** — say so.

**Suite baseline before you start:** `npm test` → 2382 passed / 3 skipped. `npx tsc --noEmit` clean. `npx electron-vite build` clean.

---

## Decisions this plan makes (spec §7 open decisions)

1. **The document is called a Canvas.** Tab title "Canvas · `<name>`", command "New Canvas…", tab id `doc:canvas:<name>`, files under `.aurora/canvas/`. The spec's own phrase is "origination canvas"; "canvas" is what the user is looking at, and it does not collide with "sprite", "tile", "block" or "chunk", all of which already mean something exact here.
2. **Tab kind is `art-doc`.** `TAB_KINDS` in `src/core/shell/session.ts` already lists `'art-doc'` with no user — this plan claims it. No change to the kind list, and no new kind for the composer to fight over later (the composer lives inside a level tab's facets, not a document tab).
3. **Persistence is indexed PNG + a sidecar JSON**, both written through the existing `writeGuarded` IPC. No new IPC channel, no new dependency: deflate/inflate come from `CompressionStream`/`DecompressionStream`, which exist in both Chromium and the node test env (verified: node v24.15.0 reports both as `function`).
4. **A canvas holds 64 colours and refuses more.** Opening a PNG with more than 64 palette entries fails with the count and the ceiling rather than quantizing silently. Quantized import is a separate feature and is not in this plan.
5. **Pixels are stored `(line << 4) | entry`, and transparency has exactly one spelling: 0.** See Task 1's header comment for why the alternative is a correctness trap.
6. **Constraint profiles are declared here but not evaluated here.** Task 2 lands the preset table from spec §4.2 as data because the document must persist *which* profile it has and the canvas must draw the right grids. Evaluation, readouts and the clash overlay are 2B.

---

## What this plan does NOT do

Named so a reviewer does not read them as gaps:

- **No constraint evaluation, readouts or clash overlay** (spec §4.3) — plan 2B.
- **No resolve-and-commit into the tile/block/chunk pool** (spec §4.4) — plan 2C. Nothing here writes to a `LevelDoc`.
- **No quantized import** of arbitrary RGB art. Indexed PNGs of ≤64 colours open; anything else is refused with specifics.
- **No layers** (spec §2, out of scope for all of phase 2).
- **No canvas resize/crop after creation.** Size is chosen at New Canvas time. Add it when the gap is felt.

---

## File Structure

**Core (pure, node-tested — no React, no fs, no store):**

| File | Responsibility |
|---|---|
| `src/core/art/canvas-doc.ts` (new) | The `CanvasDoc` type, the 64-colour pixel encoding, and `normalizeTransparent` — the one choke point that keeps transparency single-spelled. |
| `src/core/art/canvas-profiles.ts` (new) | Spec §4.2's preset table as data: id, label, colour-space bits, palette shape, which rules are on, grid pitches. |
| `src/core/art/indexed-png.ts` (new) | 8-bit indexed PNG encode; 1/2/4/8-bit indexed decode with all five row filters. Refuses interlaced and non-indexed with a message that says what to do. |
| `src/core/art/canvas-file-format.ts` (new) | `CanvasDoc` ↔ `{ png bytes, sidecar json }`. Owns the sidecar schema and its version. |
| `src/core/editing/canvas-history.ts` (new) | `CanvasDocHistory` — one canvas document's undo stack (a `SnapshotHistory`). |

**Renderer:**

| File | Responsibility |
|---|---|
| `src/renderer/state/canvasStore.ts` (new) | Every open canvas document + the one editor's view state. |
| `src/renderer/state/canvas-file.ts` (new) | Load/save/list canvas files through `window.api`. The only file here that knows path layout. |
| `src/renderer/shell/tabs.ts` (modify) | `canvasDocTab` / `parseCanvasDocTabId`. |
| `src/renderer/state/history-factories.ts` (modify) | Register the `doc:canvas:` undo factory. |
| `src/renderer/state/editorStore.ts` (modify) | `focusedDocId` routes a canvas tab to its own document. |
| `src/renderer/workspace/level-keys.ts` (modify) | Level key handlers go inert under a canvas tab. |
| `src/renderer/shell/dirty-tabs.ts` (modify) | Canvas tabs get the unsaved dot. |
| `src/renderer/shell/dirty-snapshot.ts` (modify) | Feed canvas dirtiness into the snapshot. |
| `src/renderer/state/project-runtime.ts` (modify) | The `canvas-doc` saver + its Ctrl+S scope; drop canvas docs on project switch. |
| `src/renderer/shell/tab-activation.ts` (modify) | `planCanvasDocActivation` + activation glue + close confirm. |
| `src/renderer/components/canvas/CanvasMode.tsx` (new) | The editor pane: tool dock, palette, viewport, status bar. |
| `src/renderer/components/canvas/CanvasHost.tsx` (new) | Bridges `canvasStore` to the shared `PixelViewport` + `PixelEditController`. |
| `src/renderer/components/canvas/NewCanvasDialog.tsx` (new) | Name, size, profile. |
| `src/renderer/providers/palette-canvas.ts` (new) | The `PaletteGridPort` for a canvas's own 64 colours. |
| `src/renderer/App.tsx` (modify) | `CanvasMode`'s one mounting point. |
| `src/renderer/shell/commands.ts` (modify) | "New Canvas…" in ⌘K. |
| `src/renderer/shell/explorer-data.ts` + `Explorer.tsx` (modify) | List existing canvases. |

---

### Task 1: The canvas document and its pixel encoding

> **Superseded in part by R1, R3 and the renames — see `## Review corrections` at the foot of this plan.** The code block below is the version that shipped in `e434050` and is kept as history; `normalizeTransparent` is now `normalizeCanvasPixels` and covers the whole illegal domain, `CanvasDoc.grid` is now `gridOrigin`, and `blankCanvasDoc` clamps a ceiling as well as a floor. Do not copy this block verbatim.

**Files:**
- Create: `src/core/art/canvas-doc.ts`
- Test: `src/core/art/__tests__/canvas-doc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/canvas-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  CANVAS_LINES, CANVAS_LINE_LENGTH, CANVAS_COLORS,
  canvasIndex, paletteLineOf, paletteEntryOf, isTransparent,
  normalizeTransparent, blankCanvasPalette, blankCanvasDoc,
} from '../canvas-doc';
import { createBuffer } from '../pixel-ops';

describe('canvas pixel encoding', () => {
  it('packs line and entry into one 0..63 index', () => {
    expect(canvasIndex(0, 1)).toBe(1);
    expect(canvasIndex(1, 1)).toBe(17);
    expect(canvasIndex(3, 15)).toBe(63);
    expect(paletteLineOf(63)).toBe(3);
    expect(paletteEntryOf(63)).toBe(15);
    expect(paletteLineOf(17)).toBe(1);
    expect(paletteEntryOf(17)).toBe(1);
  });

  it('collapses every line-0 entry to the single transparent index', () => {
    // 0, 16, 32 and 48 would all draw the backdrop. Four spellings of one
    // colour is the bug this prevents.
    expect(canvasIndex(1, 0)).toBe(0);
    expect(canvasIndex(2, 0)).toBe(0);
    expect(canvasIndex(3, 0)).toBe(0);
    for (const v of [0, 16, 32, 48]) expect(isTransparent(v)).toBe(true);
    expect(isTransparent(1)).toBe(false);
  });

  it('normalizeTransparent rewrites foreign spellings and nothing else', () => {
    const buf = createBuffer(4, 1);
    buf.data.set([0, 16, 48, 17]);
    const out = normalizeTransparent(buf);
    expect(Array.from(out.data)).toEqual([0, 0, 0, 17]);
  });

  it('normalizeTransparent returns the SAME buffer when nothing needed fixing', () => {
    // Identity matters: the store compares by reference to decide whether an
    // edit happened at all.
    const buf = createBuffer(4, 1);
    buf.data.set([0, 1, 17, 63]);
    expect(normalizeTransparent(buf)).toBe(buf);
  });

  it('a blank palette is 64 words and a blank doc is all-transparent', () => {
    expect(CANVAS_LINES).toBe(4);
    expect(CANVAS_LINE_LENGTH).toBe(16);
    expect(CANVAS_COLORS).toBe(64);
    expect(blankCanvasPalette()).toHaveLength(64);
    const doc = blankCanvasDoc({ name: 'Test', width: 24, height: 16, profileId: 'genesis-level-art' });
    expect(doc.pixels.width).toBe(24);
    expect(doc.pixels.height).toBe(16);
    expect(doc.pixels.data.every((v) => v === 0)).toBe(true);
    expect(doc.palette).toHaveLength(64);
    expect(doc.grid).toEqual({ originX: 0, originY: 0 });
  });

  it('a blank doc clamps a nonsense size instead of producing a 0-pixel buffer', () => {
    const doc = blankCanvasDoc({ name: 'T', width: 0, height: -5, profileId: 'none' });
    expect(doc.pixels.width).toBeGreaterThanOrEqual(8);
    expect(doc.pixels.height).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/canvas-doc.test.ts`
Expected: FAIL — `Failed to resolve import "../canvas-doc"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/art/canvas-doc.ts
//
// The origination canvas document (spec §4.1): a free-size indexed image whose
// pixels index the WHOLE Genesis colour space — 4 palette lines x 16 colours —
// rather than one 16-colour line. That is the single thing that makes it a place
// to ORIGINATE art rather than a second sprite editor.
//
// THE PIXEL ENCODING, stated once.  A pixel is `(line << 4) | entry`, 0..63:
//     line  = v >> 4   (0..3)   which palette line it draws from
//     entry = v & 15   (0..15)  the colour within that line
//
// `entry === 0` is the BACKDROP in every line — hardware, not a convention (see
// TRANSPARENT_INDEX in components/art-shared/palette-grid-model.ts) — so 0, 16,
// 32 and 48 would all be the same transparent pixel. A document that holds four
// spellings of one colour breaks every downstream comparison in a way that looks
// plausible: `diffWrites` reports edits that changed nothing, a per-cell palette-
// line scan (2B) sees a clash between two lines where the artist drew only
// transparency, and tile dedup (2C) misses byte-identical tiles. So the document
// holds ONE spelling — 0 — and `normalizeTransparent` is the choke point every
// path that can introduce a foreign value must pass through: a decoded PNG, a
// paste, a fill seeded from a picked value.
//
// Pure core — no store, no fs, no React.

import type { PixelBuffer } from './pixel-ops';
import { createBuffer } from './pixel-ops';
import type { ConstraintProfileId } from './canvas-profiles';

/** Palette lines in the Genesis colour space. Hardware. */
export const CANVAS_LINES = 4;
/** Colours per line. Hardware. (Restated rather than imported: the existing
 *  LINE_LENGTH lives in a renderer component module, and core must not import
 *  the renderer.) */
export const CANVAS_LINE_LENGTH = 16;
export const CANVAS_COLORS = CANVAS_LINES * CANVAS_LINE_LENGTH; // 64

/** The one transparent index (see the header). */
export const CANVAS_TRANSPARENT = 0;

export function paletteLineOf(v: number): number { return (v >> 4) & (CANVAS_LINES - 1); }
export function paletteEntryOf(v: number): number { return v & (CANVAS_LINE_LENGTH - 1); }
export function isTransparent(v: number): boolean { return paletteEntryOf(v) === 0; }

/** The stored index for a (line, entry) pair — the ONE constructor. Entry 0
 *  collapses to CANVAS_TRANSPARENT whatever line it came from. */
export function canvasIndex(line: number, entry: number): number {
  const e = entry & (CANVAS_LINE_LENGTH - 1);
  if (e === 0) return CANVAS_TRANSPARENT;
  return ((line & (CANVAS_LINES - 1)) << 4) | e;
}

/**
 * Rewrite foreign spellings of transparency (16/32/48) to 0. Returns the SAME
 * buffer when nothing needed fixing — callers compare by reference to decide
 * whether anything actually changed.
 */
export function normalizeTransparent(buf: PixelBuffer): PixelBuffer {
  let dirty = false;
  for (let i = 0; i < buf.data.length; i++) {
    if (buf.data[i] !== 0 && isTransparent(buf.data[i])) { dirty = true; break; }
  }
  if (!dirty) return buf;
  const data = new Uint8Array(buf.data);
  for (let i = 0; i < data.length; i++) if (isTransparent(data[i])) data[i] = CANVAS_TRANSPARENT;
  return { width: buf.width, height: buf.height, data };
}

/** 64 CRAM words, all black — the sprite editor's blankStandalonePalette at
 *  canvas scale. A canvas created inside an open zone is seeded from that zone's
 *  palette instead (canvasStore.newCanvas); this is the fallback. */
export function blankCanvasPalette(): number[] {
  return new Array(CANVAS_COLORS).fill(0);
}

/**
 * ONE canvas document. Everything here belongs to a particular canvas. Tool/view
 * state (tool, zoom, brush) is NOT here — it belongs to the editor, which shows
 * one document at a time (same split as SpriteDoc).
 */
export interface CanvasDoc {
  name: string;
  /** Indices 0..63, normalized (see the header). */
  pixels: PixelBuffer;
  /** 64 CRAM words, line-major: palette[line * 16 + entry]. */
  palette: number[];
  profileId: ConstraintProfileId;
  /** Where the profile's grids start, so guides can align to the art rather
   *  than to the canvas corner. */
  grid: { originX: number; originY: number };
}

const MIN_SIDE = 8;

export function blankCanvasDoc(input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): CanvasDoc {
  const width = Math.max(MIN_SIDE, input.width | 0);
  const height = Math.max(MIN_SIDE, input.height | 0);
  const palette = input.palette && input.palette.length === CANVAS_COLORS
    ? input.palette.slice()
    : blankCanvasPalette();
  return {
    name: input.name,
    pixels: createBuffer(width, height),
    palette,
    profileId: input.profileId,
    grid: { originX: 0, originY: 0 },
  };
}

/** Deep copy — the undo snapshot and the store's document clone both need one. */
export function cloneCanvasDoc(d: CanvasDoc): CanvasDoc {
  return {
    name: d.name,
    pixels: { width: d.pixels.width, height: d.pixels.height, data: new Uint8Array(d.pixels.data) },
    palette: d.palette.slice(),
    profileId: d.profileId,
    grid: { ...d.grid },
  };
}
```

- [ ] **Step 4: Run the test — it still fails**

Run: `npx vitest run src/core/art/__tests__/canvas-doc.test.ts`
Expected: FAIL — `Failed to resolve import "./canvas-profiles"`. That module is Task 2. Write Task 2 next, then come back; the two are a single commit.

- [ ] **Step 5: Do Task 2, then run both suites and commit**

Run: `npx vitest run src/core/art/__tests__/canvas-doc.test.ts src/core/art/__tests__/canvas-profiles.test.ts`
Expected: PASS, both files.

```bash
git add src/core/art/canvas-doc.ts src/core/art/canvas-profiles.ts src/core/art/__tests__/canvas-doc.test.ts src/core/art/__tests__/canvas-profiles.test.ts
git commit -m "feat(canvas): the canvas document model and its constraint profiles"
```

---

### Task 2: Constraint profiles as data

Spec §4.2's table, verbatim, as a lookup. **Nothing evaluates these rules in this plan** — the document persists which profile it has, and the canvas draws the grids the profile names. 2B is what reads the rest.

**Files:**
- Create: `src/core/art/canvas-profiles.ts`
- Test: `src/core/art/__tests__/canvas-profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/canvas-profiles.test.ts
import { describe, it, expect } from 'vitest';
import {
  CONSTRAINT_PROFILES, CONSTRAINT_PROFILE_IDS, constraintProfile,
} from '../canvas-profiles';

describe('constraint profiles', () => {
  it('ships exactly the four presets the spec names, in menu order', () => {
    expect(CONSTRAINT_PROFILE_IDS).toEqual([
      'genesis-level-art', 'genesis-sprite', 'genesis-unrestricted', 'none',
    ]);
  });

  it('genesis-level-art matches spec §4.2', () => {
    const p = constraintProfile('genesis-level-art');
    expect(p.colorBitsPerChannel).toBe(3);
    expect(p.paletteLines).toBe(4);
    expect(p.lineLength).toBe(16);
    expect(p.cellPaletteRule).toBe(true);
    expect(p.spriteLimits).toBe(false);
    expect(p.grids).toEqual([8, 16, 256]);
  });

  it('genesis-sprite is one line, sprite-limited, no 256 grid', () => {
    const p = constraintProfile('genesis-sprite');
    expect(p.paletteLines).toBe(1);
    expect(p.cellPaletteRule).toBe(true);
    expect(p.spriteLimits).toBe(true);
    expect(p.grids).toEqual([8, 16]);
  });

  it('genesis-unrestricted keeps the colour space but drops the cell rule', () => {
    const p = constraintProfile('genesis-unrestricted');
    expect(p.colorBitsPerChannel).toBe(3);
    expect(p.cellPaletteRule).toBe(false);
    expect(p.spriteLimits).toBe(false);
  });

  it('none constrains nothing', () => {
    const p = constraintProfile('none');
    expect(p.cellPaletteRule).toBe(false);
    expect(p.spriteLimits).toBe(false);
    expect(p.colorBitsPerChannel).toBe(3); // the canvas still stores CRAM words
  });

  it('an unknown id falls back to none rather than throwing', () => {
    // A sidecar from a future Aurora can name a profile this build has never
    // heard of. Opening the art still has to work.
    expect(constraintProfile('made-up' as never).id).toBe('none');
  });

  it('every profile is a member of the table it claims to be in', () => {
    for (const id of CONSTRAINT_PROFILE_IDS) expect(CONSTRAINT_PROFILES[id].id).toBe(id);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/canvas-profiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/art/canvas-profiles.ts
//
// Spec §4.2's preset table as DATA. A canvas document names one; the canvas
// draws the grids it names; plan 2B evaluates the rest and shows violations.
//
// PRESETS, NOT A RULE BUILDER. Multipaint, GrafX2 and GB Studio all ship a fixed
// menu of target machines and none of them expose custom rule authoring —
// shipping a schema editor would be unusual, not standard (spec §4.2). Individual
// rules are exposed as toggles in the UI; they are still just overrides on top of
// a preset, which is why this is a table and not a class.
//
// Pure data — no evaluation lives here.

export type ConstraintProfileId =
  | 'genesis-level-art' | 'genesis-sprite' | 'genesis-unrestricted' | 'none';

export interface ConstraintProfile {
  id: ConstraintProfileId;
  label: string;
  /** Bits per RGB channel the colour space snaps to. 3 = the Genesis' 512. */
  colorBitsPerChannel: number;
  /** Palette lines available for drawing (a sprite may only use one). */
  paletteLines: number;
  lineLength: number;
  /** Entry index that is the backdrop in every line. */
  transparentIndex: number;
  /** Every 8x8 cell must draw from ONE palette line. Evaluated in 2B. */
  cellPaletteRule: boolean;
  /** Sprite-hardware limits: 4x4 tiles max, 20 sprites & 320 px per scanline,
   *  80 per frame. Evaluated in 2B. */
  spriteLimits: boolean;
  /** Grid overlay pitches, in pixels, coarsest last. */
  grids: number[];
}

const GENESIS_COLOR_BITS = 3;

export const CONSTRAINT_PROFILES: Record<ConstraintProfileId, ConstraintProfile> = {
  'genesis-level-art': {
    id: 'genesis-level-art', label: 'Genesis level art',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: true, spriteLimits: false,
    grids: [8, 16, 256],
  },
  'genesis-sprite': {
    id: 'genesis-sprite', label: 'Genesis sprite',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 1, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: true, spriteLimits: true,
    grids: [8, 16],
  },
  'genesis-unrestricted': {
    id: 'genesis-unrestricted', label: 'Genesis unrestricted',
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: false, spriteLimits: false,
    grids: [8, 16],
  },
  none: {
    id: 'none', label: 'No constraints',
    // The canvas still STORES CRAM words — "none" means nothing is checked, not
    // that the document changes shape.
    colorBitsPerChannel: GENESIS_COLOR_BITS,
    paletteLines: 4, lineLength: 16, transparentIndex: 0,
    cellPaletteRule: false, spriteLimits: false,
    grids: [8],
  },
};

/** Menu order (spec §4.2). */
export const CONSTRAINT_PROFILE_IDS: ConstraintProfileId[] = [
  'genesis-level-art', 'genesis-sprite', 'genesis-unrestricted', 'none',
];

/**
 * The profile for an id, falling back to `none` for anything unrecognised. A
 * sidecar written by a future Aurora can name a profile this build has never
 * heard of, and the right answer is to open the art unconstrained, not to refuse
 * to open it.
 */
export function constraintProfile(id: ConstraintProfileId): ConstraintProfile {
  return CONSTRAINT_PROFILES[id] ?? CONSTRAINT_PROFILES.none;
}
```

- [ ] **Step 4: Run both test files**

Run: `npx vitest run src/core/art/__tests__/canvas-doc.test.ts src/core/art/__tests__/canvas-profiles.test.ts`
Expected: PASS (this is where Task 1's step 5 lands).

- [ ] **Step 5: Commit** — done as Task 1 step 5's single commit.

---

### Task 3: Indexed PNG — encode

**Files:**
- Create: `src/core/art/indexed-png.ts`
- Test: `src/core/art/__tests__/indexed-png-encode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/indexed-png-encode.test.ts
import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { encodeIndexedPng } from '../indexed-png';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Walk the chunk list of a PNG: [{type, data}], in file order. */
function chunks(bytes: Uint8Array): { type: string; data: Uint8Array }[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: string; data: Uint8Array }[] = [];
  let p = 8;
  while (p < bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

const PAL = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }];

describe('encodeIndexedPng', () => {
  it('writes a signature and the mandatory chunks in order', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 2, indices: new Uint8Array([0, 1, 2, 1]), palette: PAL, transparentIndex: 0,
    });
    expect(Array.from(png.subarray(0, 8))).toEqual(SIG);
    expect(chunks(png).map((c) => c.type)).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
  });

  it('declares 8-bit indexed, non-interlaced', async () => {
    const png = await encodeIndexedPng({ width: 3, height: 1, indices: new Uint8Array([0, 1, 2]), palette: PAL });
    const ihdr = chunks(png).find((c) => c.type === 'IHDR')!.data;
    const dv = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(dv.getUint32(0)).toBe(3);   // width
    expect(dv.getUint32(4)).toBe(1);   // height
    expect(ihdr[8]).toBe(8);           // bit depth
    expect(ihdr[9]).toBe(3);           // colour type 3 = indexed
    expect(ihdr[12]).toBe(0);          // interlace
  });

  it('IDAT inflates to filter-0 scanlines of the source indices', async () => {
    const indices = new Uint8Array([0, 1, 2, 2, 1, 0]);
    const png = await encodeIndexedPng({ width: 3, height: 2, indices, palette: PAL });
    const idat = chunks(png).find((c) => c.type === 'IDAT')!.data;
    const raw = new Uint8Array(inflateSync(Buffer.from(idat)));
    expect(Array.from(raw)).toEqual([0, 0, 1, 2, 0, 2, 1, 0]); // filter byte per row
  });

  it('tRNS marks exactly the transparent index', async () => {
    const png = await encodeIndexedPng({ width: 1, height: 1, indices: new Uint8Array([0]), palette: PAL, transparentIndex: 0 });
    const trns = chunks(png).find((c) => c.type === 'tRNS')!.data;
    expect(Array.from(trns)).toEqual([0]); // alpha 0 for index 0; later entries default opaque
  });

  it('omits tRNS when no index is transparent', async () => {
    const png = await encodeIndexedPng({ width: 1, height: 1, indices: new Uint8Array([1]), palette: PAL, transparentIndex: null });
    expect(chunks(png).some((c) => c.type === 'tRNS')).toBe(false);
  });

  it('every chunk carries a correct CRC', async () => {
    // A wrong CRC is exactly the failure a viewer reports and a round-trip test
    // never notices — our own decoder could happily ignore it.
    const png = await encodeIndexedPng({ width: 2, height: 2, indices: new Uint8Array([0, 1, 2, 0]), palette: PAL });
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let p = 8;
    while (p < png.length) {
      const len = dv.getUint32(p);
      const expected = dv.getUint32(p + 8 + len);
      // node's zlib exposes the same CRC-32 PNG uses.
      const { crc32 } = require('node:zlib') as { crc32?: (b: Buffer) => number };
      if (crc32) expect(crc32(Buffer.from(png.subarray(p + 4, p + 8 + len)))).toBe(expected);
      p += 12 + len;
    }
  });

  it('refuses a mismatched index count and an oversized palette', async () => {
    await expect(encodeIndexedPng({ width: 2, height: 2, indices: new Uint8Array([0]), palette: PAL }))
      .rejects.toThrow(/4 indices/);
    await expect(encodeIndexedPng({
      width: 1, height: 1, indices: new Uint8Array([0]),
      palette: new Array(257).fill({ r: 0, g: 0, b: 0 }),
    })).rejects.toThrow(/257/);
  });
});
```

Note on the CRC test: `node:zlib`'s `crc32` exists on Node 20.15+/22+ (this tree runs v24). The `if (crc32)` guard keeps the test honest on an older runtime rather than silently passing — if you find it skipping, replace it with a literal expected CRC for one known chunk.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/indexed-png-encode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation (encode half)**

```ts
// src/core/art/indexed-png.ts
//
// 8-bit indexed PNG in, 1/2/4/8-bit indexed PNG out — the open format a canvas
// document is stored in (spec §4.1: "these files stay openable in Aseprite, and
// Aseprite output stays importable").
//
// NO DEPENDENCY, NO NEW IPC. Deflate comes from CompressionStream/
// DecompressionStream, which exist in Chromium (the renderer) and in Node 18+
// (the test env). 'deflate' is the zlib-wrapped format, which is exactly what a
// PNG IDAT holds — no wrapper arithmetic of our own.
//
// SCOPE, deliberately narrow: colour type 3 (indexed), non-interlaced. Anything
// else is refused with a message that says what to do about it, because the
// alternative — a partial truecolour reader — would be a second image pipeline
// to keep correct for no gain. Encoding always writes 8-bit; decoding accepts
// 1/2/4/8 because other tools emit the smaller depths for small palettes.
//
// Pure core: async because the compression streams are, but no fs and no DOM.

export interface Rgb { r: number; g: number; b: number }

export interface IndexedImage {
  width: number;
  height: number;
  /** One byte per pixel, each < palette.length. */
  indices: Uint8Array;
  palette: Rgb[];
  /** Written as tRNS (alpha 0). Null/undefined writes no tRNS chunk. */
  transparentIndex?: number | null;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the TYPE and the DATA, not the length.
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeIndexedPng(img: IndexedImage): Promise<Uint8Array> {
  const { width, height, indices, palette } = img;
  if (width <= 0 || height <= 0) throw new Error(`PNG size must be positive (got ${width}x${height})`);
  if (indices.length !== width * height) {
    throw new Error(`${width}x${height} needs ${width * height} indices (got ${indices.length})`);
  }
  if (palette.length === 0 || palette.length > 256) {
    throw new Error(`an indexed PNG palette holds 1..256 colours (got ${palette.length})`);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter method: adaptive
  ihdr[12] = 0;  // interlace: none

  const plte = new Uint8Array(palette.length * 3);
  for (let i = 0; i < palette.length; i++) {
    plte[i * 3] = palette[i].r & 0xff;
    plte[i * 3 + 1] = palette[i].g & 0xff;
    plte[i * 3 + 2] = palette[i].b & 0xff;
  }

  // Filter type 0 (None) on every row. Adaptive filtering would shrink the file
  // and buys nothing here — these are small, and a decoder we also own reads it.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('PLTE', plte)];
  const t = img.transparentIndex;
  if (t !== null && t !== undefined) {
    // tRNS is a prefix: entries past the array are opaque, so one byte marks
    // index 0 and says nothing about the other 63.
    const trns = new Uint8Array(t + 1).fill(255);
    trns[t] = 0;
    parts.push(chunk('tRNS', trns));
  }
  parts.push(chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0)));
  return concat(parts);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/art/__tests__/indexed-png-encode.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify a real viewer accepts it** (this is the point of the format)

```bash
node --input-type=module -e "
import { encodeIndexedPng } from './src/core/art/indexed-png.ts';
" 2>/dev/null || true
npx vitest run src/core/art/__tests__/indexed-png-encode.test.ts --reporter=dot
python3 - <<'PY'
# Only if Pillow is available; skip without failing the task if not.
try:
    from PIL import Image
except ImportError:
    print("SKIP: Pillow not installed — the decode round-trip in Task 4 is the fallback check")
    raise SystemExit(0)
print("Pillow present — write a PNG from the test above to /tmp and open it here")
PY
```

If Pillow is not installed, do not install it: Task 4's decoder plus the encode test's CRC check are the evidence. Record which check you actually ran.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/indexed-png.ts src/core/art/__tests__/indexed-png-encode.test.ts
git commit -m "feat(canvas): write 8-bit indexed PNGs with no new dependency"
```

---

### Task 4: Indexed PNG — decode, including every row filter

The decoder is where the correctness risk is: filters and sub-byte depths are exactly the parts a round-trip test against our own encoder cannot exercise, because our encoder emits neither.

**Files:**
- Modify: `src/core/art/indexed-png.ts`
- Test: `src/core/art/__tests__/indexed-png-decode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/indexed-png-decode.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import { encodeIndexedPng, decodeIndexedPng } from '../indexed-png';

const PAL = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }];

/** Build a PNG by hand so we can choose the bit depth, the filter per row and
 *  the colour type — none of which our own encoder ever varies. */
function handMade(opts: {
  width: number; height: number; depth: number; colorType?: number; interlace?: number;
  rows: number[][];            // raw (unfiltered) sample values per row
  filters: number[];           // one filter type per row
  palette?: { r: number; g: number; b: number }[];
}): Uint8Array {
  const { width, height, depth, rows, filters } = opts;
  const palette = opts.palette ?? PAL;
  const bpr = Math.ceil((width * depth) / 8);

  // Pack each row to `bpr` bytes at the given depth.
  const packed = rows.map((row) => {
    const out = new Uint8Array(bpr);
    if (depth === 8) { out.set(row.map((v) => v & 0xff)); return out; }
    const per = 8 / depth;
    for (let x = 0; x < width; x++) {
      const shift = 8 - depth * ((x % per) + 1);
      out[(x / per) | 0] |= (row[x] & ((1 << depth) - 1)) << shift;
    }
    return out;
  });

  // Apply the row filter (bpp is 1 byte for every indexed depth).
  const paeth = (a: number, b: number, c: number): number => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw = new Uint8Array((bpr + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (bpr + 1)] = filters[y];
    for (let i = 0; i < bpr; i++) {
      const cur = packed[y][i];
      const a = i >= 1 ? packed[y][i - 1] : 0;
      const b = y >= 1 ? packed[y - 1][i] : 0;
      const c = (y >= 1 && i >= 1) ? packed[y - 1][i - 1] : 0;
      let v: number;
      switch (filters[y]) {
        case 0: v = cur; break;
        case 1: v = cur - a; break;
        case 2: v = cur - b; break;
        case 3: v = cur - ((a + b) >> 1); break;
        case 4: v = cur - paeth(a, b, c); break;
        default: throw new Error('bad filter');
      }
      raw[y * (bpr + 1) + 1 + i] = v & 0xff;
    }
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const mk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = depth; ihdr[9] = opts.colorType ?? 3; ihdr[12] = opts.interlace ?? 0;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mk('IHDR', ihdr), mk('PLTE', plte),
    mk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    mk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

describe('decodeIndexedPng', () => {
  it('round-trips our own encoder', async () => {
    const indices = new Uint8Array([0, 1, 2, 3, 3, 2, 1, 0, 1, 1, 2, 2]);
    const png = await encodeIndexedPng({ width: 4, height: 3, indices, palette: PAL, transparentIndex: 0 });
    const got = await decodeIndexedPng(png);
    expect(got.width).toBe(4);
    expect(got.height).toBe(3);
    expect(Array.from(got.indices)).toEqual(Array.from(indices));
    expect(got.palette).toEqual(PAL);
    expect(got.transparentIndex).toBe(0);
  });

  it.each([0, 1, 2, 3, 4])('reads a row filtered with type %i', async (filter) => {
    // Each filter is a DIFFERENT reconstruction rule; a decoder that implements
    // only None passes a round-trip test against our encoder and fails here.
    const rows = [[1, 2, 3, 0], [3, 3, 1, 2], [0, 1, 1, 3]];
    const png = handMade({ width: 4, height: 3, depth: 8, rows, filters: [filter, filter, filter] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows.flat());
  });

  it('reads a file whose rows use DIFFERENT filters', async () => {
    const rows = [[1, 2, 3, 0], [3, 3, 1, 2], [0, 1, 1, 3]];
    const png = handMade({ width: 4, height: 3, depth: 8, rows, filters: [0, 4, 2] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows.flat());
  });

  it.each([1, 2, 4])('expands %i-bit samples to one byte per pixel', async (depth) => {
    const max = (1 << depth) - 1;
    const rows = [[0, max, 0, max, max, 0, 0, max]];  // 8 px: not a byte multiple at 4bpp
    const png = handMade({
      width: 8, height: 1, depth, rows, filters: [0],
      palette: Array.from({ length: max + 1 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual(rows[0]);
  });

  it('handles a row whose width is not a whole number of bytes at 4bpp', async () => {
    const rows = [[1, 2, 3]];  // 3 px at 4bpp = 1.5 bytes; the last nibble is padding
    const png = handMade({ width: 3, height: 1, depth: 4, rows, filters: [0] });
    const got = await decodeIndexedPng(png);
    expect(Array.from(got.indices)).toEqual([1, 2, 3]);
  });

  it('reads a file split across several IDAT chunks', async () => {
    // Real encoders chunk large images; a decoder that reads only the first IDAT
    // silently truncates the picture.
    const indices = new Uint8Array(Array.from({ length: 64 * 64 }, (_, i) => i % 4));
    const png = await encodeIndexedPng({ width: 64, height: 64, indices, palette: PAL });
    const split = splitFirstIdat(png);
    const got = await decodeIndexedPng(split);
    expect(Array.from(got.indices)).toEqual(Array.from(indices));
  });

  it('refuses a truecolour PNG with a message that says what to do', async () => {
    const png = handMade({ width: 1, height: 1, depth: 8, colorType: 2, rows: [[0]], filters: [0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/indexed/i);
  });

  it('refuses an interlaced PNG', async () => {
    const png = handMade({ width: 2, height: 2, depth: 8, interlace: 1, rows: [[0, 1], [1, 0]], filters: [0, 0] });
    await expect(decodeIndexedPng(png)).rejects.toThrow(/interlac/i);
  });

  it('refuses a file that is not a PNG at all', async () => {
    await expect(decodeIndexedPng(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/not a PNG/i);
  });
});

/** Re-chunk a PNG so its single IDAT becomes two. */
function splitFirstIdat(png: Uint8Array): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  while (p < png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    if (type === 'IDAT' && len > 4) {
      const data = png.subarray(p + 8, p + 8 + len);
      const head = png.subarray(0, p);
      const tail = png.subarray(p + 12 + len);
      const mk = (d: Uint8Array): Uint8Array => {
        // Reuse the module's own chunk writer via a second encode is not possible
        // here, so build it inline with the same CRC as the test helper above.
        const out = new Uint8Array(12 + d.length);
        const odv = new DataView(out.buffer);
        odv.setUint32(0, d.length);
        'IDAT'.split('').forEach((ch, i) => { out[4 + i] = ch.charCodeAt(0); });
        out.set(d, 8);
        let c = 0xffffffff;
        const body = out.subarray(4, 8 + d.length);
        for (let i = 0; i < body.length; i++) {
          c ^= body[i];
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        odv.setUint32(8 + d.length, (c ^ 0xffffffff) >>> 0);
        return out;
      };
      const half = len >> 1;
      const parts = [head, mk(data.subarray(0, half)), mk(data.subarray(half)), tail];
      const total = parts.reduce((n, x) => n + x.length, 0);
      const out = new Uint8Array(total);
      let at = 0;
      for (const x of parts) { out.set(x, at); at += x.length; }
      return out;
    }
    p += 12 + len;
  }
  return png;
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/indexed-png-decode.test.ts`
Expected: FAIL — `decodeIndexedPng is not a function`.

- [ ] **Step 3: Implement the decoder**

Append to `src/core/art/indexed-png.ts`:

```ts
export interface DecodedIndexedPng {
  width: number;
  height: number;
  /** One byte per pixel. */
  indices: Uint8Array;
  palette: Rgb[];
  /** The first palette entry tRNS marks fully transparent, or null. */
  transparentIndex: number | null;
}

// NOTE (review correction R8): `inflate` does NOT live here. Both directions
// moved to `src/core/art/zlib-stream.ts` — see the correction for why, and note
// that the version below does not compile in this toolchain. Import it instead:
//   import { inflate } from './zlib-stream';

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Undo the per-row filters. `bpp` — the byte distance to the pixel on the left —
 * is 1 for EVERY indexed depth: below 8 bits the filter still operates on whole
 * bytes, not on samples. Getting that wrong produces art that is subtly striped
 * rather than obviously broken.
 */
function unfilterRows(raw: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  const bpr = Math.ceil((width * depth) / 8);
  if (raw.length < (bpr + 1) * height) {
    throw new Error(`PNG data is short: expected ${(bpr + 1) * height} bytes, got ${raw.length}`);
  }
  const out = new Uint8Array(bpr * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const rowStart = y * bpr;
    const prevStart = (y - 1) * bpr;
    for (let i = 0; i < bpr; i++) {
      const x = raw[pos + i];
      const a = i >= 1 ? out[rowStart + i - 1] : 0;
      const b = y >= 1 ? out[prevStart + i] : 0;
      const c = (y >= 1 && i >= 1) ? out[prevStart + i - 1] : 0;
      let v: number;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`unsupported PNG row filter ${ft}`);
      }
      out[rowStart + i] = v & 0xff;
    }
    pos += bpr;
  }
  return out;
}

/** Expand sub-byte samples to one byte per pixel. Depth 8 is already there. */
function expandSamples(rows: Uint8Array, width: number, height: number, depth: number): Uint8Array {
  if (depth === 8) return rows.slice(0, width * height);
  const bpr = Math.ceil((width * depth) / 8);
  const per = 8 / depth;
  const mask = (1 << depth) - 1;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const byte = rows[y * bpr + ((x / per) | 0)];
      const shift = 8 - depth * ((x % per) + 1);
      out[y * width + x] = (byte >> shift) & mask;
    }
  }
  return out;
}

export async function decodeIndexedPng(bytes: Uint8Array): Promise<DecodedIndexedPng> {
  if (bytes.length < 8 || !SIGNATURE.every((b, i) => bytes[i] === b)) {
    throw new Error('not a PNG file (bad signature)');
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let width = 0, height = 0, depth = 0, colorType = -1, interlace = 0;
  let palette: Rgb[] | null = null;
  let transparentIndex: number | null = null;
  const idatParts: Uint8Array[] = [];

  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8);
      height = dv.getUint32(p + 12);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) palette.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    } else if (type === 'tRNS') {
      for (let i = 0; i < data.length; i++) if (data[i] === 0) { transparentIndex = i; break; }
    } else if (type === 'IDAT') {
      // Concatenated, not read-first: real encoders split large images, and a
      // decoder that stops at the first IDAT silently truncates the picture.
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }

  if (colorType !== 3) {
    throw new Error(
      `this PNG is colour type ${colorType}, not indexed — re-export it as an indexed (paletted) PNG`,
    );
  }
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported — re-export without Adam7 interlacing');
  if (![1, 2, 4, 8].includes(depth)) throw new Error(`unsupported indexed bit depth ${depth}`);
  if (!palette) throw new Error('indexed PNG has no PLTE palette chunk');
  if (idatParts.length === 0) throw new Error('PNG has no image data (no IDAT chunk)');

  const raw = await inflate(concat(idatParts));
  const rows = unfilterRows(raw, width, height, depth);
  return { width, height, indices: expandSamples(rows, width, height, depth), palette, transparentIndex };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/art/__tests__/indexed-png-decode.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the filter tests — plant a violation and watch them fail**

Temporarily make `unfilterRows` treat every row as filter 0 (`switch (0)`), then re-run.

Run: `npx vitest run src/core/art/__tests__/indexed-png-decode.test.ts`
Expected: the four non-zero filter cases FAIL, the filter-0 case and the round-trip still pass.
**If everything still passes, the tests are not testing what they claim — fix the tests before restoring the code.** Restore afterwards and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/indexed-png.ts src/core/art/__tests__/indexed-png-decode.test.ts
git commit -m "feat(canvas): read indexed PNGs written by other tools"
```

---

### Task 5: Canvas document ↔ files

**Files:**
- Create: `src/core/art/canvas-file-format.ts`
- Test: `src/core/art/__tests__/canvas-file-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/canvas-file-format.test.ts
import { describe, it, expect } from 'vitest';
import { encodeCanvasFiles, decodeCanvasFiles, parseCanvasSidecar, CANVAS_SIDECAR_VERSION } from '../canvas-file-format';
import { blankCanvasDoc, canvasIndex, CANVAS_COLORS } from '../canvas-doc';
import { encodeIndexedPng } from '../indexed-png';
import { encodeGenesisColor, decodeGenesisColor } from '../../formats/palette';

function docWithArt() {
  const doc = blankCanvasDoc({ name: 'Ramp', width: 16, height: 8, profileId: 'genesis-level-art' });
  // A recognisable palette: line L entry E -> a distinct CRAM word.
  doc.palette = Array.from({ length: CANVAS_COLORS }, (_, i) =>
    encodeGenesisColor({ r: (i % 8) * 36, g: ((i >> 3) % 8) * 36, b: 0, a: 255 }));
  doc.pixels.data[0] = canvasIndex(0, 1);
  doc.pixels.data[1] = canvasIndex(2, 15);
  doc.pixels.data[17] = canvasIndex(3, 7);
  return doc;
}

describe('canvas file format', () => {
  it('round-trips a document through PNG + sidecar', async () => {
    const doc = docWithArt();
    const { png, sidecar } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.name).toBe('Ramp');
    expect(back.profileId).toBe('genesis-level-art');
    expect(back.pixels.width).toBe(16);
    expect(back.pixels.height).toBe(8);
    expect(Array.from(back.pixels.data)).toEqual(Array.from(doc.pixels.data));
    expect(back.palette).toEqual(doc.palette);
  });

  it('recovers the palette from PLTE when the sidecar is missing', async () => {
    // A canvas opened from an Aseprite export has no sidecar. The colours still
    // have to come back — snapped to the Genesis 3-bit space.
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const back = await decodeCanvasFiles(png, null);
    expect(back.palette).toEqual(doc.palette.map((w) => encodeGenesisColor(decodeGenesisColor(w))));
    expect(back.profileId).toBe('none');   // unknown constraints, not assumed
  });

  it('normalizes foreign spellings of transparency on the way in', async () => {
    const png = await encodeIndexedPng({
      width: 4, height: 1,
      indices: new Uint8Array([0, 16, 32, 17]),
      palette: Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0 })),
      transparentIndex: 0,
    });
    const back = await decodeCanvasFiles(png, null);
    expect(Array.from(back.pixels.data)).toEqual([0, 0, 0, 17]);
  });

  it('refuses a PNG with more colours than a canvas holds, and says the numbers', async () => {
    const png = await encodeIndexedPng({
      width: 2, height: 1, indices: new Uint8Array([0, 1]),
      palette: Array.from({ length: 137 }, (_, i) => ({ r: i, g: 0, b: 0 })),
    });
    await expect(decodeCanvasFiles(png, null)).rejects.toThrow(/137.*64/s);
  });

  it('a sidecar naming an unknown profile still opens, unconstrained', async () => {
    const doc = docWithArt();
    const { png } = await encodeCanvasFiles(doc);
    const sidecar = JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, name: 'Ramp', profile: 'genesis-2027',
      palette: doc.palette, gridOrigin: { originX: 0, originY: 0 },
    });
    const back = await decodeCanvasFiles(png, sidecar);
    expect(back.profileId).toBe('none');
    expect(back.palette).toEqual(doc.palette);   // the palette is still honoured
  });

  it('parseCanvasSidecar rejects a future version and malformed JSON', () => {
    const bad = parseCanvasSidecar('{ not json');
    expect(bad.ok).toBe(false);
    const future = parseCanvasSidecar(JSON.stringify({ version: 99, name: 'x', profile: 'none', palette: [], gridOrigin: {} }));
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/99/);
  });

  it('parseCanvasSidecar rejects a palette that is the wrong length', () => {
    const r = parseCanvasSidecar(JSON.stringify({
      version: CANVAS_SIDECAR_VERSION, name: 'x', profile: 'none',
      palette: [1, 2, 3], gridOrigin: { originX: 0, originY: 0 },
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/64/);
  });

  it('writes a sidecar a human can read and diff', async () => {
    const { sidecar } = await encodeCanvasFiles(docWithArt());
    expect(sidecar.endsWith('\n')).toBe(true);
    expect(sidecar).toContain('"version": 1');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/art/__tests__/canvas-file-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/art/canvas-file-format.ts
//
// A canvas document on disk: an indexed PNG next to a JSON sidecar.
//
// WHY TWO FILES (spec §4.1). The PNG is the picture, in a format Aseprite, GIMP
// and every browser already open; the sidecar carries what a PNG cannot say —
// which constraint profile the artist chose, the exact CRAM words behind the
// 8-bit-per-channel PLTE, and the grid origin. Deliberately an open pair: the
// origination surface should win by being Genesis-aware, not by trapping files.
//
// WHICH FILE WINS. The PNG is authoritative for PIXELS; the sidecar is
// authoritative for everything else, and its absence is normal — that is what
// opening a plain Aseprite export looks like. When it is missing the palette is
// recovered from PLTE by snapping each colour into the Genesis 3-bit space, and
// the profile falls back to `none` rather than to a guess: an unconstrained
// canvas is honest about knowing nothing, a wrongly-assumed profile is not.
//
// Pure core — no fs. Path layout lives in renderer/state/canvas-file.ts.

import type { CanvasDoc } from './canvas-doc';
import { CANVAS_COLORS, CANVAS_TRANSPARENT, blankCanvasPalette, normalizeCanvasPixels } from './canvas-doc';
import { CONSTRAINT_PROFILES, constraintProfile } from './canvas-profiles';
import { decodeIndexedPng, encodeIndexedPng, type Rgb } from './indexed-png';
import { decodeGenesisColor, encodeGenesisColor } from '../formats/palette';

export const CANVAS_SIDECAR_VERSION = 1;

export interface CanvasSidecar {
  version: number;
  name: string;
  profile: string;              // a ConstraintProfileId, or an id this build doesn't know
  palette: number[];            // 64 CRAM words
  gridOrigin: { originX: number; originY: number };
}

export type SidecarParse =
  | { ok: true; sidecar: CanvasSidecar }
  | { ok: false; error: string };

export function parseCanvasSidecar(json: string): SidecarParse {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch (e) {
    return { ok: false, error: `sidecar is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'sidecar is not an object' };
  const o = raw as Record<string, unknown>;
  if (o.version !== CANVAS_SIDECAR_VERSION) {
    return {
      ok: false,
      error: `sidecar version ${String(o.version)} — this Aurora reads version ${CANVAS_SIDECAR_VERSION}`,
    };
  }
  if (!Array.isArray(o.palette) || o.palette.length !== CANVAS_COLORS) {
    return { ok: false, error: `sidecar palette must hold ${CANVAS_COLORS} CRAM words (got ${Array.isArray(o.palette) ? o.palette.length : 'none'})` };
  }
  const grid = (o.gridOrigin ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    sidecar: {
      version: CANVAS_SIDECAR_VERSION,
      name: typeof o.name === 'string' ? o.name : 'Canvas',
      profile: typeof o.profile === 'string' ? o.profile : 'none',
      palette: (o.palette as unknown[]).map((w) => Number(w) & 0xffff),
      gridOrigin: {
        originX: Number(grid.originX) || 0,
        originY: Number(grid.originY) || 0,
      },
    },
  };
}

function paletteToRgb(words: number[]): Rgb[] {
  return words.map((w) => {
    const c = decodeGenesisColor(w);
    return { r: c.r, g: c.g, b: c.b };
  });
}

export async function encodeCanvasFiles(doc: CanvasDoc): Promise<{ png: Uint8Array; sidecar: string }> {
  const png = await encodeIndexedPng({
    width: doc.pixels.width,
    height: doc.pixels.height,
    indices: doc.pixels.data,
    palette: paletteToRgb(doc.palette),
    transparentIndex: CANVAS_TRANSPARENT,
  });
  const sidecar: CanvasSidecar = {
    version: CANVAS_SIDECAR_VERSION,
    name: doc.name,
    profile: doc.profileId,
    palette: doc.palette.slice(),
    gridOrigin: { ...doc.gridOrigin },
  };
  // Trailing newline + 2-space indent: these land in a git tree next to the art
  // they describe, so they should diff like source, not like a blob.
  return { png, sidecar: `${JSON.stringify(sidecar, null, 2)}\n` };
}

export async function decodeCanvasFiles(png: Uint8Array, sidecarJson: string | null): Promise<CanvasDoc> {
  const img = await decodeIndexedPng(png);
  if (img.palette.length > CANVAS_COLORS) {
    throw new Error(
      `this PNG has ${img.palette.length} colours; a canvas holds ${CANVAS_COLORS} ` +
      `(${CONSTRAINT_PROFILES['genesis-level-art'].paletteLines} lines x ` +
      `${CONSTRAINT_PROFILES['genesis-level-art'].lineLength}) — reduce its palette before opening it`,
    );
  }

  const parsed = sidecarJson === null ? null : parseCanvasSidecar(sidecarJson);
  // A sidecar that fails to parse is treated as ABSENT, not fatal: the picture is
  // still openable, and refusing to open art because its metadata rotted would
  // lose the artist's work for the sake of the annotation about it.
  const sidecar = parsed && parsed.ok ? parsed.sidecar : null;
  // NOTE (review correction 2): `constraintProfile` takes a plain string and
  // falls back to `none` itself, so do NOT restate that rule here with a cast.

  let palette: number[];
  if (sidecar) {
    palette = sidecar.palette.slice();
  } else {
    // Snap PLTE into the Genesis colour space (spec §4.2: what is new is
    // SNAPPING colour that arrives by paste or import).
    palette = blankCanvasPalette();
    img.palette.forEach((c, i) => { palette[i] = encodeGenesisColor({ r: c.r, g: c.g, b: c.b, a: 255 }); });
  }

  const profileId = constraintProfile(sidecar?.profile ?? 'none').id;

  const pixels = normalizeCanvasPixels({
    width: img.width, height: img.height, data: new Uint8Array(img.indices),
  });

  return {
    name: sidecar?.name ?? 'Canvas',
    pixels,
    palette,
    profileId,
    gridOrigin: sidecar?.gridOrigin ?? { originX: 0, originY: 0 },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/art/__tests__/canvas-file-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/canvas-file-format.ts src/core/art/__tests__/canvas-file-format.test.ts
git commit -m "feat(canvas): store a canvas as an indexed PNG plus a JSON sidecar"
```

---

### Task 6: One canvas document's undo stack

**Files:**
- Create: `src/core/editing/canvas-history.ts`
- Test: `src/core/editing/__tests__/canvas-history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/editing/__tests__/canvas-history.test.ts
import { describe, it, expect } from 'vitest';
import { CanvasDocHistory, type CanvasSnapshot } from '../canvas-history';
import { createBuffer } from '../../art/pixel-ops';

function snapshot(fill: number): CanvasSnapshot {
  const pixels = createBuffer(4, 4);
  pixels.data.fill(fill);
  return { pixels, palette: new Array(64).fill(fill), selection: null };
}

describe('CanvasDocHistory', () => {
  it('restores the pixels a record captured', () => {
    let live = snapshot(1);
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live = snapshot(2);
    h.undo();
    expect(live.pixels.data[0]).toBe(1);
    h.redo();
    expect(live.pixels.data[0]).toBe(2);
  });

  it('deep-clones, so a later mutation of the live buffer cannot rewrite history', () => {
    // The bug this prevents: recording a REFERENCE, then painting into it, makes
    // undo restore the post-edit pixels — an undo that does nothing at all.
    let live = snapshot(1);
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live.pixels.data[0] = 9;
    live.palette[0] = 9;
    live = snapshot(2);
    h.undo();
    expect(live.pixels.data[0]).toBe(1);
    expect(live.palette[0]).toBe(1);
  });

  it('restores the selection alongside the pixels', () => {
    let live: CanvasSnapshot = { ...snapshot(1), selection: { x: 1, y: 1, w: 2, h: 2 } };
    const h = new CanvasDocHistory(() => live, (s) => { live = s; });
    h.record(live);
    live = snapshot(2);
    h.undo();
    expect(live.selection).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/core/editing/__tests__/canvas-history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/core/editing/canvas-history.ts
//
// ONE canvas document's undo stack. Bound at construction to that document's
// read/write closures (never to "the active document"), exactly like
// SpriteDocHistory — so a background canvas tab's edits can be undone from its
// close confirm without checking it out first.
//
// The snapshot is the whole editable state: pixels, the 64-word palette and the
// marquee. Name, profile and grid origin are document IDENTITY, not edits, and
// deliberately sit outside (matching SpriteSnapshot's split).

import type { PixelBuffer } from '../art/pixel-ops';
import type { Selection } from '../art/pixel-edit-controller';
import { SnapshotHistory } from './snapshot-history';

export interface CanvasSnapshot {
  pixels: PixelBuffer;
  palette: number[];
  selection: Selection | null;
}

/** Canvas pixels are dense buffers cloned in full per entry — same reasoning as
 *  SPRITE_MAX_DEPTH, and a canvas can be much larger than a sprite frame. */
const CANVAS_MAX_DEPTH = 40;

export function cloneCanvasSnapshot(s: CanvasSnapshot): CanvasSnapshot {
  return {
    pixels: { width: s.pixels.width, height: s.pixels.height, data: new Uint8Array(s.pixels.data) },
    palette: s.palette.slice(),
    selection: s.selection ? { ...s.selection } : null,
  };
}

export class CanvasDocHistory extends SnapshotHistory<CanvasSnapshot> {
  constructor(read: () => CanvasSnapshot, write: (s: CanvasSnapshot) => void) {
    super(read, write, CANVAS_MAX_DEPTH);
  }

  protected clone(s: CanvasSnapshot): CanvasSnapshot { return cloneCanvasSnapshot(s); }
}
```

Before writing this, **read `src/core/editing/snapshot-history.ts`** and match its actual constructor and `clone` signatures — the code above mirrors `sprite-history.ts` as of this writing; the base class is the authority.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/editing/__tests__/canvas-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/editing/canvas-history.ts src/core/editing/__tests__/canvas-history.test.ts
git commit -m "feat(canvas): per-document undo for canvas documents"
```

---

### Task 7: The canvas store

**Files:**
- Create: `src/renderer/state/canvasStore.ts`
- Test: `src/renderer/state/__tests__/canvasStore.test.ts`

**Where this deliberately differs from `spriteStore`.** The sprite store hoists the checked-out document onto the store root and keeps only *parked* documents in its map, because its whole view layer and its loaders read `frames`/`name`/… directly off the root. A canvas store has no such legacy callers, so **every document lives in the map, active or not**, and the active one is named by `activeDocId`. That deletes the entire `parkedDoc`/`activateSpriteDoc` copy-field-by-field dance and with it the class of bug it exists to catch. Do not "fix" this to match spriteStore.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/state/__tests__/canvasStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCanvasStore, openCanvasDoc, activateCanvasDoc, closeCanvasDoc,
  canvasDocState, dirtyCanvasDocIds, readCanvasSnapshot, writeCanvasSnapshot,
} from '../canvasStore';
import { documentHistoryHub } from '../history-hub';
import { canvasIndex } from '../../../core/art/canvas-doc';
import { createBuffer } from '../../../core/art/pixel-ops';

const A = 'doc:canvas:alpha';
const B = 'doc:canvas:beta';

beforeEach(() => { useCanvasStore.getState().closeAll(); });

describe('canvasStore documents', () => {
  it('opens a document and checks it out', () => {
    openCanvasDoc(A, { name: 'alpha', width: 32, height: 24, profileId: 'genesis-level-art' });
    expect(useCanvasStore.getState().activeDocId).toBe(A);
    expect(canvasDocState(A)!.pixels.width).toBe(32);
  });

  it('keeps every document\'s pixels when the editor switches between them', () => {
    openCanvasDoc(A, { name: 'alpha', width: 16, height: 16, profileId: 'none' });
    const bufA = createBuffer(16, 16);
    bufA.data[0] = canvasIndex(1, 5);
    useCanvasStore.getState().setPixels(A, bufA);

    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    expect(canvasDocState(B)!.pixels.width).toBe(8);

    activateCanvasDoc(A);
    expect(useCanvasStore.getState().activeDocId).toBe(A);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(1, 5));
    expect(canvasDocState(B)!.pixels.data[0]).toBe(0);
  });

  it('normalizes foreign transparency on the way in', () => {
    openCanvasDoc(A, { name: 'alpha', width: 4, height: 1, profileId: 'none' });
    const buf = createBuffer(4, 1);
    buf.data.set([0, 16, 48, 17]);
    useCanvasStore.getState().setPixels(A, buf);
    expect(Array.from(canvasDocState(A)!.pixels.data)).toEqual([0, 0, 0, 17]);
  });

  it('a no-op setPixels neither dirties the document nor pushes undo', () => {
    // Rule 3 from classic-tile-gesture: a gesture that changed nothing commits
    // nothing. Without this, clicking a pixel that is already the paint colour
    // costs an undo entry and a dirty dot.
    openCanvasDoc(A, { name: 'alpha', width: 4, height: 4, profileId: 'none' });
    const same = createBuffer(4, 4);
    useCanvasStore.getState().setPixels(A, same);
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(documentHistoryHub.historyFor(A).canUndo).toBe(false);  // a getter, not a method
  });

  it('an edit dirties only its own document', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[3] = canvasIndex(0, 2);
    useCanvasStore.getState().setPixels(A, buf);
    expect(dirtyCanvasDocIds()).toEqual([A]);
  });

  it('undo restores a BACKGROUND document without checking it out', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(2, 3);
    useCanvasStore.getState().setPixels(A, buf);
    openCanvasDoc(B, { name: 'beta', width: 8, height: 8, profileId: 'none' });
    expect(useCanvasStore.getState().activeDocId).toBe(B);

    documentHistoryHub.historyFor(A).undo();
    expect(canvasDocState(A)!.pixels.data[0]).toBe(0);
    expect(useCanvasStore.getState().activeDocId).toBe(B);   // focus did not move
  });

  it('closing a document drops it and its undo stack', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    closeCanvasDoc(A);
    expect(canvasDocState(A)).toBeNull();
    expect(documentHistoryHub.has(A)).toBe(false);
  });

  it('markSaved clears dirtiness without touching pixels', () => {
    openCanvasDoc(A, { name: 'alpha', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(A, buf);
    useCanvasStore.getState().markSaved(A, { pngMtimeMs: 5, sidecarMtimeMs: 6 });
    expect(useCanvasStore.getState().isDirty(A)).toBe(false);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(1, 1));
    expect(useCanvasStore.getState().sourceOf(A)?.pngMtimeMs).toBe(5);
  });

  it('read/writeCanvasSnapshot reach a document by id, active or not', () => {
    openCanvasDoc(A, { name: 'alpha', width: 4, height: 4, profileId: 'none' });
    openCanvasDoc(B, { name: 'beta', width: 4, height: 4, profileId: 'none' });
    const snap = readCanvasSnapshot(A);
    snap.pixels.data[0] = canvasIndex(3, 9);
    writeCanvasSnapshot(A, snap);
    expect(canvasDocState(A)!.pixels.data[0]).toBe(canvasIndex(3, 9));
    expect(canvasDocState(B)!.pixels.data[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/canvasStore.test.ts`
Expected: FAIL — module not found. (It will also fail on the missing history factory until Task 8; write Task 8's factory registration first if the error is "No undo-stack factory registered for doc id".)

- [ ] **Step 3: Implement**

```ts
// src/renderer/state/canvasStore.ts
//
// Every open CANVAS document, plus the one editor's view state.
//
// WHY THE SHAPE DIFFERS FROM spriteStore. The sprite store hoists its checked-
// out document onto the store root and keeps only PARKED documents in its map,
// because its view layer and loaders read `frames`/`name`/… straight off the
// root. Nothing here has that history, so every document — active or not — lives
// in `docs`, and `activeDocId` merely names one. That removes the park/unpark
// field-by-field copy entirely, along with the class of bug it exists to catch
// (a field added to the document type and forgotten in the copy).
//
// Undo lives on the DocumentHistoryHub, keyed by the same doc id as the tab
// (history-factories.ts registers the `doc:canvas:` factory). Every mutating
// action funnels through `recordEdit`, which is also where `unsavedEdits` flips
// true — the non-mutating ones (setTool, zoom, selection) deliberately do not.

import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';
import type { Selection } from '../../core/art/pixel-edit-controller';
import { diffWrites } from '../../core/art/pixel-edit-controller';
import type { ClipRegion } from '../../core/art/pixel-clipboard';
import type { CanvasDoc } from '../../core/art/canvas-doc';
import { blankCanvasDoc, normalizeCanvasPixels, cloneCanvasDoc } from '../../core/art/canvas-doc';
import type { ConstraintProfileId } from '../../core/art/canvas-profiles';
import type { CanvasSnapshot } from '../../core/editing/canvas-history';
import { CanvasDocHistory } from '../../core/editing/canvas-history';
import { documentHistoryHub } from './history-hub';

/** Where a canvas document was loaded from and will save back to. Null for a
 *  document that has never been written (Save is what gives it one). */
export interface CanvasSource {
  /** Absolute project root the two relative paths resolve under. */
  dir: string;
  pngPath: string;
  sidecarPath: string;
  /** Guarded-write conflict baselines; null when the file did not exist. */
  pngMtimeMs: number | null;
  sidecarMtimeMs: number | null;
}

export type CanvasTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';

interface OpenCanvas {
  doc: CanvasDoc;
  selection: Selection | null;
  unsavedEdits: boolean;
  source: CanvasSource | null;
}

interface CanvasState {
  docs: Map<string, OpenCanvas>;
  /** The document the editor shows. Empty string when none is open. */
  activeDocId: string;

  // --- Editor (view) state: one canvas editor, so these stay global ---
  tool: CanvasTool;
  zoom: number;
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  clipboard: ClipRegion | null;
  /** Which of the profile's grid pitches are drawn. */
  visibleGrids: number[];

  setTool: (t: CanvasTool) => void;
  setZoom: (z: number) => void;
  setMirror: (m: MirrorMode | null) => void;
  setPixelPerfect: (v: boolean) => void;
  setDither: (pattern: DitherPattern, secondary: number) => void;
  setVisibleGrids: (g: number[]) => void;
  setClipboard: (c: ClipRegion | null) => void;

  // --- Per-document ---
  setPixels: (docId: string, buffer: PixelBuffer) => void;
  setSelection: (docId: string, sel: Selection | null) => void;
  setPalette: (docId: string, palette: number[]) => void;
  setName: (docId: string, name: string) => void;
  setProfile: (docId: string, profileId: ConstraintProfileId) => void;
  setSource: (docId: string, source: CanvasSource | null) => void;
  markSaved: (docId: string, mtimes: { pngMtimeMs: number | null; sidecarMtimeMs: number | null }) => void;
  sourceOf: (docId: string) => CanvasSource | null;
  isOpen: (docId: string) => boolean;
  isDirty: (docId: string) => boolean;
  closeAll: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  docs: new Map(),
  activeDocId: '',

  tool: 'pencil',
  zoom: 8,
  mirror: null,
  pixelPerfect: true,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  clipboard: null,
  visibleGrids: [8],

  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(48, Math.max(1, Math.round(zoom))) }),
  setMirror: (mirror) => set({ mirror }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setVisibleGrids: (visibleGrids) => set({ visibleGrids }),
  setClipboard: (clipboard) => set({ clipboard }),

  setPixels: (docId, buffer) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    const next = normalizeCanvasPixels(buffer);
    // A gesture that changed nothing commits nothing: no undo entry, no dirty dot.
    if (next.width === entry.doc.pixels.width && next.height === entry.doc.pixels.height
        && diffWrites(entry.doc.pixels, next).length === 0) return;
    recordEdit(docId);
    patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, pixels: next }, unsavedEdits: true }));
  },

  setSelection: (docId, selection) => patch(set, get, docId, (e) => ({ ...e, selection })),

  setPalette: (docId, palette) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    recordEdit(docId);
    patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, palette: palette.slice() }, unsavedEdits: true }));
  },

  setName: (docId, name) => patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, name }, unsavedEdits: true })),
  setProfile: (docId, profileId) => patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, profileId }, unsavedEdits: true })),
  setSource: (docId, source) => patch(set, get, docId, (e) => ({ ...e, source })),

  markSaved: (docId, mtimes) => patch(set, get, docId, (e) => ({
    ...e,
    unsavedEdits: false,
    source: e.source ? { ...e.source, ...mtimes } : e.source,
  })),

  sourceOf: (docId) => get().docs.get(docId)?.source ?? null,
  isOpen: (docId) => get().docs.has(docId),
  isDirty: (docId) => get().docs.get(docId)?.unsavedEdits ?? false,

  closeAll: () => {
    for (const id of get().docs.keys()) documentHistoryHub.dispose(id);
    set({ docs: new Map(), activeDocId: '' });
  },
}));

function patch(
  set: (partial: Partial<CanvasState>) => void,
  get: () => CanvasState,
  docId: string,
  fn: (e: OpenCanvas) => OpenCanvas,
): void {
  const entry = get().docs.get(docId);
  if (!entry) return;
  const docs = new Map(get().docs);
  docs.set(docId, fn(entry));
  set({ docs });
}

/** Record a pre-edit snapshot on THAT document's stack. */
function recordEdit(docId: string): void {
  documentHistoryHub.historyFor(docId).record(readCanvasSnapshot(docId));
}

// --- Document lifecycle ----------------------------------------------------

export function openCanvasDoc(docId: string, input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): void {
  const s = useCanvasStore.getState();
  if (s.docs.has(docId)) { activateCanvasDoc(docId); return; }
  const docs = new Map(s.docs);
  docs.set(docId, { doc: blankCanvasDoc(input), selection: null, unsavedEdits: false, source: null });
  useCanvasStore.setState({ docs, activeDocId: docId });
}

/** Install an already-decoded document (the file-open path). */
export function loadCanvasDoc(docId: string, doc: CanvasDoc, source: CanvasSource | null): void {
  const s = useCanvasStore.getState();
  const docs = new Map(s.docs);
  docs.set(docId, { doc, selection: null, unsavedEdits: false, source });
  documentHistoryHub.historyFor(docId).clear();  // a loaded canvas starts with empty history
  useCanvasStore.setState({ docs, activeDocId: docId });
}

export function activateCanvasDoc(docId: string): void {
  if (!useCanvasStore.getState().docs.has(docId)) return;
  useCanvasStore.setState({ activeDocId: docId });
}

export function closeCanvasDoc(docId: string): void {
  const s = useCanvasStore.getState();
  if (!s.docs.has(docId)) { documentHistoryHub.dispose(docId); return; }
  const docs = new Map(s.docs);
  docs.delete(docId);
  const activeDocId = s.activeDocId === docId ? (docs.keys().next().value ?? '') : s.activeDocId;
  useCanvasStore.setState({ docs, activeDocId });
  documentHistoryHub.dispose(docId);
}

/** A document's state, or null when it isn't open. */
export function canvasDocState(docId: string): CanvasDoc | null {
  return useCanvasStore.getState().docs.get(docId)?.doc ?? null;
}

/** Every open document with unsaved edits. A background tab's edits are as real
 *  as the active one's — this is what the tab dots and the close guard read. */
export function dirtyCanvasDocIds(): string[] {
  const out: string[] = [];
  for (const [id, e] of useCanvasStore.getState().docs) if (e.unsavedEdits) out.push(id);
  return out;
}

/** Every dirty document Ctrl+S can actually write. A canvas ALWAYS has a
 *  destination once it has a source; one that has never been saved gets one on
 *  first save (the New Canvas flow names the file up front), so this is
 *  currently the same set as dirtyCanvasDocIds — kept as its own function so the
 *  saver never has to restate the rule if that changes. */
export function saveableDirtyCanvasDocIds(): string[] {
  return dirtyCanvasDocIds().filter((id) => useCanvasStore.getState().docs.get(id)?.source != null);
}

const EMPTY_SNAPSHOT = (): CanvasSnapshot => ({ pixels: createBuffer(8, 8), palette: new Array(64).fill(0), selection: null });

export function readCanvasSnapshot(docId: string): CanvasSnapshot {
  const e = useCanvasStore.getState().docs.get(docId);
  if (!e) return EMPTY_SNAPSHOT();
  return { pixels: e.doc.pixels, palette: e.doc.palette, selection: e.selection };
}

/** Install a restored snapshot. Deliberately leaves `unsavedEdits` alone:
 *  undoing back to a pristine state still reads dirty, which over-asks rather
 *  than risking a silent discard (same rule as spriteStore). */
export function writeCanvasSnapshot(docId: string, snapshot: CanvasSnapshot): void {
  const s = useCanvasStore.getState();
  const e = s.docs.get(docId);
  if (!e) return;
  const docs = new Map(s.docs);
  docs.set(docId, {
    ...e,
    doc: { ...e.doc, pixels: snapshot.pixels, palette: snapshot.palette.slice() },
    selection: snapshot.selection,
  });
  useCanvasStore.setState({ docs });
}

/** The stack factory history-factories registers for `doc:canvas:`. */
export function makeCanvasHistory(docId: string): CanvasDocHistory {
  return new CanvasDocHistory(
    () => readCanvasSnapshot(docId),
    (snapshot) => writeCanvasSnapshot(docId, snapshot),
  );
}

export { cloneCanvasDoc };
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/state/__tests__/canvasStore.test.ts`
Expected: PASS (after Task 8's factory line exists).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/state/canvasStore.ts src/renderer/state/__tests__/canvasStore.test.ts
git commit -m "feat(canvas): the canvas document store"
```

---

### Task 8: Tab ids, undo routing, and the keyboard handoff

Three one-line-shaped changes that are each a guard. Every one of them gets falsified.

**Files:**
- Modify: `src/renderer/shell/tabs.ts`
- Modify: `src/renderer/state/history-factories.ts`
- Modify: `src/renderer/state/editorStore.ts` (`focusedDocId`)
- Modify: `src/renderer/workspace/level-keys.ts`
- Test: `src/renderer/shell/__tests__/canvas-doc-routing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/shell/__tests__/canvas-doc-routing.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { canvasDocTab, parseCanvasDocTabId, isCanvasDocTabId } from '../tabs';
import { focusedDocId } from '../../state/editorStore';
import { levelKeysEnabled } from '../../workspace/level-keys';
import { useSessionStore } from '../../state/sessionStore';
import { documentHistoryHub } from '../../state/history-hub';
import { CanvasDocHistory } from '../../../core/editing/canvas-history';
import { openCanvasDoc, useCanvasStore } from '../../state/canvasStore';
import { HOME_TAB } from '../../../core/shell/session';

const TAB = canvasDocTab('sky-tiles');

beforeEach(() => {
  useCanvasStore.getState().closeAll();
  useSessionStore.setState({ tabs: [HOME_TAB], activeId: HOME_TAB.id });
});

describe('canvas tab ids', () => {
  it('builds and parses a canvas doc tab', () => {
    expect(TAB.id).toBe('doc:canvas:sky-tiles');
    expect(TAB.kind).toBe('art-doc');
    expect(parseCanvasDocTabId(TAB.id)).toEqual({ name: 'sky-tiles' });
    expect(isCanvasDocTabId(TAB.id)).toBe(true);
  });

  it('does not parse a sprite doc, a level tab or Home', () => {
    expect(parseCanvasDocTabId('doc:sprite:s1:42')).toBeNull();
    expect(parseCanvasDocTabId('level:ghz:1')).toBeNull();
    expect(parseCanvasDocTabId('home')).toBeNull();
    expect(parseCanvasDocTabId('doc:canvas:')).toBeNull();  // no empty name
  });
});

describe('canvas undo routing', () => {
  it('builds a CanvasDocHistory for a doc:canvas: id', () => {
    openCanvasDoc(TAB.id, { name: 'sky-tiles', width: 8, height: 8, profileId: 'none' });
    expect(documentHistoryHub.historyFor(TAB.id)).toBeInstanceOf(CanvasDocHistory);
  });

  it('focusedDocId points at the canvas document while its tab is active', () => {
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    expect(focusedDocId()).toBe(TAB.id);
  });
});

describe('keyboard handoff', () => {
  it('level key handlers are inert while a canvas tab is active', () => {
    // Same rule sprite docs already have: the level editors stay MOUNTED behind
    // the canvas pane, so without this one Ctrl+Z fires both the canvas undo and
    // the hidden level undo.
    useSessionStore.setState({ tabs: [HOME_TAB, TAB], activeId: TAB.id });
    expect(levelKeysEnabled()).toBe(false);
  });

  it('level key handlers are live on a level tab', () => {
    useSessionStore.setState({ tabs: [HOME_TAB], activeId: 'level:ghz:1' });
    expect(levelKeysEnabled()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/shell/__tests__/canvas-doc-routing.test.ts`
Expected: FAIL — `canvasDocTab` is not exported.

- [ ] **Step 3: Make the four edits**

In `src/renderer/shell/tabs.ts`, after the sprite-doc section:

```ts
// Canvas-doc tab ids — 'doc:canvas:<name>' — host the origination canvas
// (spec §4.1). <name> is the canvas's file stem under .aurora/canvas/, which is
// what makes the tab id stable across sessions: session restore reopens the tab
// and the activation glue loads that file. Kind is 'art-doc', the entry
// TAB_KINDS has always listed and nothing has claimed.
export function canvasDocTab(name: string): TabDescriptor {
  return { id: `doc:canvas:${name}`, kind: 'art-doc', title: `Canvas · ${name}` };
}

export function parseCanvasDocTabId(id: string): { name: string } | null {
  const m = /^doc:canvas:(.+)$/.exec(id);
  return m ? { name: m[1] } : null;
}

export function isCanvasDocTabId(id: string): boolean {
  return parseCanvasDocTabId(id) !== null;
}
```

In `src/renderer/state/history-factories.ts`, inside `registerHistoryFactories()`:

```ts
  // One stack per canvas document. Like the sprite factory this needs no engine
  // dispatch — a canvas is engine-agnostic by construction (it is not yet
  // committed into anyone's pool).
  documentHistoryHub.registerFactory('doc:canvas:', (docId) => makeCanvasHistory(docId));
```

with `import { makeCanvasHistory } from './canvasStore';` at the top.

In `src/renderer/state/editorStore.ts`, in `focusedDocId`, directly after the sprite-doc line:

```ts
  // A canvas-doc tab IS its document, exactly like a sprite-doc tab — no facet
  // refinement applies.
  if (isCanvasDocTabId(activeId)) return activeId;
```

(add `isCanvasDocTabId` to the existing import from `../shell/tabs`).

In `src/renderer/workspace/level-keys.ts`:

```ts
import { isSpriteDocTabId, isCanvasDocTabId } from '../shell/tabs';

export function levelKeysEnabled(): boolean {
  // isSpriteDocTabId, not parseSpriteDocTabId: the "New Sprite…" tab mounts
  // SpriteMode exactly like an engine-bound one, so the level handlers must be
  // just as inert under it or one Ctrl+Z fires both. A canvas-doc tab mounts
  // CanvasMode for the same reason and gets the same treatment.
  const activeId = useSessionStore.getState().activeId;
  return !isSpriteDocTabId(activeId) && !isCanvasDocTabId(activeId);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/shell/__tests__/canvas-doc-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify all three guards, one at a time**

Each of these is a guard whose test must fail when the guard is removed. Do them one at a time and record what happened:

1. Revert `level-keys.ts` to the sprite-only predicate → the "inert while a canvas tab is active" test must FAIL.
2. Remove the `focusedDocId` canvas branch → the "focusedDocId points at the canvas document" test must FAIL.
3. Remove the `doc:canvas:` factory registration → the history test must FAIL with "No undo-stack factory registered".

**If any plant leaves the suite green, that is the finding: the test does not test what it says.** Fix the test, then restore.

- [ ] **Step 6: Run the whole suite and commit**

Run: `npm test`
Expected: 2382 + the new tests passing, 3 skipped, 0 failures.

```bash
git add src/renderer/shell/tabs.ts src/renderer/state/history-factories.ts src/renderer/state/editorStore.ts src/renderer/workspace/level-keys.ts src/renderer/shell/__tests__/canvas-doc-routing.test.ts
git commit -m "feat(canvas): route a canvas tab to its own document, undo and keyboard"
```

---

### Task 9: Reading and writing canvas files

**Files:**
- Create: `src/renderer/state/canvas-file.ts`
- Test: `src/renderer/state/__tests__/canvas-file.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/state/__tests__/canvas-file.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CANVAS_DIR, canvasPngPath, canvasSidecarPath, canvasNameIsSafe,
  listCanvasNames, loadCanvasFile, saveCanvasFile,
} from '../canvas-file';
import { blankCanvasDoc, canvasIndex } from '../../../core/art/canvas-doc';
import { encodeCanvasFiles } from '../../../core/art/canvas-file-format';

const DIR = '/home/user/s1disasm';

type Written = { relPath: string; bytes: Uint8Array; expectedMtimeMs: number | null };

function fakeApi(files: Map<string, Uint8Array>) {
  const written: Written[] = [];
  const api = {
    listDir: vi.fn(async (_dir: string, rel: string) =>
      [...files.keys()].filter((k) => k.startsWith(`${rel}/`)).map((k) => k.slice(rel.length + 1))),
    readBinaryFile: vi.fn(async (_dir: string, rel: string) => {
      const f = files.get(rel);
      if (!f) throw new Error(`ENOENT: ${rel}`);
      return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    }),
    fileMtime: vi.fn(async (_dir: string, rel: string) => (files.has(rel) ? 1000 : null)),
    writeGuarded: vi.fn(async (_dir: string, batch: Written[]) => {
      written.push(...batch);
      for (const f of batch) files.set(f.relPath, f.bytes);
      return { written: batch.map((f) => f.relPath), newMtimes: Object.fromEntries(batch.map((f) => [f.relPath, 2000])) };
    }),
  };
  (globalThis as { window?: unknown }).window = { api };
  return { api, written };
}

beforeEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('canvas file paths', () => {
  it('puts both files under the project sidecar dir', () => {
    expect(CANVAS_DIR).toBe('.aurora/canvas');
    expect(canvasPngPath('sky')).toBe('.aurora/canvas/sky.png');
    expect(canvasSidecarPath('sky')).toBe('.aurora/canvas/sky.canvas.json');
  });

  it('rejects a name that would escape the sidecar dir', () => {
    // A canvas name reaches a path. `../../s1.asm` must never become a write
    // target, and the check lives here rather than at the write.
    expect(canvasNameIsSafe('sky-tiles_2')).toBe(true);
    expect(canvasNameIsSafe('../escape')).toBe(false);
    expect(canvasNameIsSafe('a/b')).toBe(false);
    expect(canvasNameIsSafe('')).toBe(false);
    expect(canvasNameIsSafe('has space')).toBe(false);
  });
});

describe('listCanvasNames', () => {
  it('lists PNG stems and ignores the sidecars', async () => {
    fakeApi(new Map([
      ['.aurora/canvas/sky.png', new Uint8Array()],
      ['.aurora/canvas/sky.canvas.json', new Uint8Array()],
      ['.aurora/canvas/rock.png', new Uint8Array()],
      ['.aurora/canvas/notes.txt', new Uint8Array()],
    ]));
    expect((await listCanvasNames(DIR)).sort()).toEqual(['rock', 'sky']);
  });
});

describe('save and load', () => {
  it('writes both files in ONE guarded batch', async () => {
    // One batch, because the conflict check is per batch: writing the PNG and
    // then failing the sidecar would leave art whose metadata describes the
    // previous version.
    const { api, written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'genesis-level-art' });
    doc.pixels.data[0] = canvasIndex(1, 3);
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: null, sidecarMtimeMs: null });
    expect(res.ok).toBe(true);
    expect(api.writeGuarded).toHaveBeenCalledTimes(1);
    expect(written.map((w) => w.relPath)).toEqual(['.aurora/canvas/sky.png', '.aurora/canvas/sky.canvas.json']);
    if (res.ok) expect(res.pngMtimeMs).toBe(2000);
  });

  it('passes the mtime baselines through as the conflict check', async () => {
    const { written } = fakeApi(new Map());
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 111, sidecarMtimeMs: 222 });
    expect(written.map((w) => w.expectedMtimeMs)).toEqual([111, 222]);
  });

  it('reports a conflict without claiming a save', async () => {
    fakeApi(new Map());
    (window as unknown as { api: { writeGuarded: unknown } }).api.writeGuarded =
      vi.fn(async () => ({ conflicts: ['.aurora/canvas/sky.png'] }));
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 8, profileId: 'none' });
    const res = await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: 1, sidecarMtimeMs: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/changed on disk/i);
  });

  it('round-trips a saved canvas back through load', async () => {
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'sky', width: 8, height: 4, profileId: 'genesis-level-art' });
    doc.pixels.data[5] = canvasIndex(2, 9);
    await saveCanvasFile(DIR, 'sky', doc, { pngMtimeMs: null, sidecarMtimeMs: null });
    const loaded = await loadCanvasFile(DIR, 'sky');
    expect(loaded.doc.pixels.data[5]).toBe(canvasIndex(2, 9));
    expect(loaded.doc.profileId).toBe('genesis-level-art');
    expect(loaded.source.pngPath).toBe('.aurora/canvas/sky.png');
  });

  it('loads a PNG that has no sidecar', async () => {
    const files = new Map<string, Uint8Array>();
    fakeApi(files);
    const doc = blankCanvasDoc({ name: 'foreign', width: 8, height: 8, profileId: 'genesis-level-art' });
    const { png } = await encodeCanvasFiles(doc);
    files.set('.aurora/canvas/foreign.png', png);
    const loaded = await loadCanvasFile(DIR, 'foreign');
    expect(loaded.doc.profileId).toBe('none');
    expect(loaded.source.sidecarMtimeMs).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/canvas-file.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/renderer/state/canvas-file.ts
//
// The ONE place that knows where a canvas lives on disk. Everything above this
// module addresses a canvas by NAME.
//
// Layout: `<project>/.aurora/canvas/<name>.png` plus `<name>.canvas.json`. The
// `.aurora` directory is the project's existing sidecar home (see
// core/project/s1/index.ts SIDECAR = '.aurora/project.json'), so canvases land
// with the rest of Aurora's per-project state rather than scattered into the
// disassembly's own tree.
//
// THE NAME IS PART OF A PATH, so it is validated here and nowhere else: a canvas
// called `../../s1.asm` must never become a write target. The predicate is
// deliberately stricter than rel-path safety (no dots, no slashes, no spaces) —
// a canvas name also has to survive being a tab id and a file stem.

import type { CanvasDoc } from '../../core/art/canvas-doc';
import { encodeCanvasFiles, decodeCanvasFiles } from '../../core/art/canvas-file-format';
import type { CanvasSource } from './canvasStore';

export const CANVAS_DIR = '.aurora/canvas';

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function canvasNameIsSafe(name: string): boolean {
  return SAFE_NAME.test(name);
}

export function canvasPngPath(name: string): string { return `${CANVAS_DIR}/${name}.png`; }
export function canvasSidecarPath(name: string): string { return `${CANVAS_DIR}/${name}.canvas.json`; }

/** The canvases in a project, by name. Tolerant: a missing dir lists as empty
 *  (window.api.listDir already resolves [] rather than rejecting). */
export async function listCanvasNames(dir: string): Promise<string[]> {
  const entries = await window.api.listDir(dir, CANVAS_DIR);
  return entries
    .filter((e) => e.toLowerCase().endsWith('.png'))
    .map((e) => e.slice(0, -4))
    .filter(canvasNameIsSafe);
}

export interface LoadedCanvas { doc: CanvasDoc; source: CanvasSource }

export async function loadCanvasFile(dir: string, name: string): Promise<LoadedCanvas> {
  if (!canvasNameIsSafe(name)) throw new Error(`'${name}' is not a valid canvas name`);
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const png = new Uint8Array(await window.api.readBinaryFile(dir, pngPath));
  // The sidecar is OPTIONAL — that is what opening a plain Aseprite export looks
  // like — so a miss is not an error.
  let sidecarJson: string | null = null;
  try {
    sidecarJson = new TextDecoder().decode(new Uint8Array(await window.api.readBinaryFile(dir, sidecarPath)));
  } catch { sidecarJson = null; }

  const doc = await decodeCanvasFiles(png, sidecarJson);
  const [pngMtimeMs, sidecarMtimeMs] = await Promise.all([
    window.api.fileMtime(dir, pngPath),
    window.api.fileMtime(dir, sidecarPath),
  ]);
  return {
    doc: { ...doc, name },
    source: { dir, pngPath, sidecarPath, pngMtimeMs, sidecarMtimeMs },
  };
}

export type SaveCanvasResult =
  | { ok: true; pngMtimeMs: number | null; sidecarMtimeMs: number | null }
  | { ok: false; error: string };

/**
 * Write both files as ONE guarded batch. One batch because the conflict check is
 * per batch: a PNG that landed while its sidecar was refused would leave art
 * whose metadata describes the previous version — and the sidecar is where the
 * palette lives, so that is a silently recoloured picture.
 */
export async function saveCanvasFile(
  dir: string, name: string, doc: CanvasDoc,
  expected: { pngMtimeMs: number | null; sidecarMtimeMs: number | null },
): Promise<SaveCanvasResult> {
  if (!canvasNameIsSafe(name)) return { ok: false, error: `'${name}' is not a valid canvas name` };
  const { png, sidecar } = await encodeCanvasFiles({ ...doc, name });
  const pngPath = canvasPngPath(name);
  const sidecarPath = canvasSidecarPath(name);

  const result = await window.api.writeGuarded(dir, [
    { relPath: pngPath, bytes: png, expectedMtimeMs: expected.pngMtimeMs },
    { relPath: sidecarPath, bytes: new TextEncoder().encode(sidecar), expectedMtimeMs: expected.sidecarMtimeMs },
  ]);

  if ('conflicts' in result) {
    return {
      ok: false,
      error: `${result.conflicts.join(', ')} changed on disk since it was opened — nothing was written`,
    };
  }
  if (result.failed) {
    return { ok: false, error: `${result.failed.path}: ${result.failed.message}` };
  }
  return {
    ok: true,
    pngMtimeMs: result.newMtimes[pngPath] ?? null,
    sidecarMtimeMs: result.newMtimes[sidecarPath] ?? null,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/state/__tests__/canvas-file.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the batching guard**

Change `saveCanvasFile` to make two `writeGuarded` calls instead of one, re-run.
Expected: the "writes both files in ONE guarded batch" test FAILS. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/canvas-file.ts src/renderer/state/__tests__/canvas-file.test.ts
git commit -m "feat(canvas): read and write canvas files under .aurora/canvas"
```

---

### Task 10: Save routing and the dirty dot

**Files:**
- Modify: `src/renderer/state/project-runtime.ts`
- Modify: `src/renderer/shell/dirty-tabs.ts`
- Modify: `src/renderer/shell/dirty-snapshot.ts`
- Test: `src/renderer/state/__tests__/canvas-save-routing.test.ts`

- [ ] **Step 1: Read `src/renderer/shell/dirty-snapshot.ts` first**

The snapshot builder's exact shape is not reproduced here; add the canvas field the way the existing `dirtySpriteDocIds` field is built.

- [ ] **Step 2: Write the failing test**

```ts
// src/renderer/state/__tests__/canvas-save-routing.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveCoordinator, ensureSaversRegistered, saveActive, canSaveActive, resetProjectRuntime } from '../project-runtime';
import { openCanvasDoc, useCanvasStore } from '../canvasStore';
import { canvasDocTab } from '../../shell/tabs';
import { tabHasDirtyDot } from '../../shell/dirty-tabs';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';

const TAB = canvasDocTab('sky');

function dirtyCanvas(docId: string): void {
  openCanvasDoc(docId, { name: 'sky', width: 8, height: 8, profileId: 'none' });
  useCanvasStore.getState().setSource(docId, {
    dir: '/p', pngPath: '.aurora/canvas/sky.png', sidecarPath: '.aurora/canvas/sky.canvas.json',
    pngMtimeMs: 1, sidecarMtimeMs: 1,
  });
  const buf = createBuffer(8, 8);
  buf.data[0] = canvasIndex(1, 2);
  useCanvasStore.getState().setPixels(docId, buf);
}

beforeEach(() => { useCanvasStore.getState().closeAll(); });

describe('canvas save routing', () => {
  it('the canvas saver owns canvas tabs and nothing else', () => {
    ensureSaversRegistered();
    expect(saveCoordinator.activeSaver(TAB.id)?.id).toBe('canvas-doc');
    expect(saveCoordinator.activeSaver('doc:sprite:s1:42')?.id).not.toBe('canvas-doc');
    expect(saveCoordinator.activeSaver('level:ghz:1')?.id).not.toBe('canvas-doc');
  });

  it('Ctrl+S on a canvas tab writes THAT canvas only', async () => {
    ensureSaversRegistered();
    const saved: string[] = [];
    // Inject through the same test seam the other savers use.
    const { __setRuntimeSaversForTest, __resetRuntimeSaversForTest } = await import('../project-runtime');
    __setRuntimeSaversForTest({ canvasDoc: async (docId: string) => { saved.push(docId); } });
    dirtyCanvas(TAB.id);
    const other = canvasDocTab('rock');
    dirtyCanvas(other.id);

    const result = await saveActive(TAB.id);
    expect(result.saved).toEqual(['canvas-doc']);
    expect(saved).toEqual([TAB.id]);
    __resetRuntimeSaversForTest();
  });

  it('Save is inert on a clean canvas tab', () => {
    ensureSaversRegistered();
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    expect(canSaveActive(TAB.id)).toBe(false);
  });

  it('a dirty canvas dots its own tab', () => {
    dirtyCanvas(TAB.id);
    const snap = {
      classicOpen: false, classicRef: null, classicDirty: false,
      aeonOpen: false, aeonDirty: false,
      dirtySpriteDocIds: [], dirtyCanvasDocIds: [TAB.id],
    };
    expect(tabHasDirtyDot(TAB.id, 'art-doc', snap)).toBe(true);
    expect(tabHasDirtyDot(canvasDocTab('rock').id, 'art-doc', snap)).toBe(false);
  });

  it('a project switch drops every canvas document', () => {
    // A document that outlived its project keeps a source pointing at the OLD
    // project's directory by absolute path — a later Ctrl+S would write across
    // projects. Same reasoning as the sprite closeAll already in resetProjectRuntime.
    dirtyCanvas(TAB.id);
    resetProjectRuntime();
    expect(useCanvasStore.getState().docs.size).toBe(0);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/renderer/state/__tests__/canvas-save-routing.test.ts`
Expected: FAIL — no `canvas-doc` saver.

- [ ] **Step 4: Implement**

In `src/renderer/shell/dirty-tabs.ts`, add the field and the rule:

```ts
  /** Canvas-doc tab ids with unsaved edits (canvasStore.dirtyCanvasDocIds). */
  dirtyCanvasDocIds: readonly string[];
```

```ts
export function tabHasDirtyDot(tabId: string, kind: TabKind, s: DirtySnapshot): boolean {
  if (kind === 'sprite-doc') return s.dirtySpriteDocIds.includes(tabId);
  if (kind === 'art-doc') return s.dirtyCanvasDocIds.includes(tabId);
  if (kind !== 'level') return false;
  // …unchanged…
}
```

In `src/renderer/shell/dirty-snapshot.ts`, populate `dirtyCanvasDocIds` from `dirtyCanvasDocIds()`.

In `src/renderer/state/project-runtime.ts`:

```ts
import { useCanvasStore, saveableDirtyCanvasDocIds } from './canvasStore';
import { saveCanvasDocument } from './canvas-save';
import { parseCanvasDocTabId } from '../shell/tabs';

let canvasDocImpl: SaveDocFn = saveCanvasDocument;
```

extend `__setRuntimeSaversForTest` / `__resetRuntimeSaversForTest` with `canvasDoc`, register the saver **first, next to sprite-art** (pixel edits before project writes, same reasoning):

```ts
  saveCoordinator.register({
    id: 'canvas-doc',
    // Only documents with a file target AND unsaved edits: a canvas that has
    // never been named has no destination, and a clean one is a pointless
    // identical-bytes write.
    isDirty: () => saveableDirtyCanvasDocIds().length > 0,
    save: async () => { for (const id of saveableDirtyCanvasDocIds()) await canvasDocImpl(id); },
    scope: {
      owns: (tabId) => parseCanvasDocTabId(tabId) !== null,
      isDirty: (tabId) => saveableDirtyCanvasDocIds().includes(tabId),
      save: async (tabId) => { await canvasDocImpl(tabId); },
    },
  });
```

and in `resetProjectRuntime`, alongside the sprite line:

```ts
  useCanvasStore.getState().closeAll();
```

Create `src/renderer/state/canvas-save.ts` — the thin bridge the saver calls:

```ts
// src/renderer/state/canvas-save.ts
//
// Save ONE canvas document back to its files. Split out of canvas-file.ts so the
// pure path layer stays free of store imports, and split out of project-runtime
// so the saver's registration stays a wiring list.

import { canvasDocState, useCanvasStore } from './canvasStore';
import { saveCanvasFile } from './canvas-file';
import { useToastStore } from './toastStore';

export async function saveCanvasDocument(docId: string): Promise<void> {
  const doc = canvasDocState(docId);
  const source = useCanvasStore.getState().sourceOf(docId);
  if (!doc || !source) return;   // nothing to write; not an error

  const res = await saveCanvasFile(source.dir, doc.name, doc, {
    pngMtimeMs: source.pngMtimeMs, sidecarMtimeMs: source.sidecarMtimeMs,
  });
  if (!res.ok) {
    // Throwing is what the SaveCoordinator contract asks for on failure; the
    // toast is so the failure is visible even from Save All's aggregate.
    useToastStore.getState().addToast(`Canvas save failed: ${res.error}`, 'error');
    throw new Error(res.error);
  }
  useCanvasStore.getState().markSaved(docId, {
    pngMtimeMs: res.pngMtimeMs, sidecarMtimeMs: res.sidecarMtimeMs,
  });
}
```

- [ ] **Step 5: Run the test, then the suite**

Run: `npx vitest run src/renderer/state/__tests__/canvas-save-routing.test.ts && npm test`
Expected: PASS; suite green.

- [ ] **Step 6: Falsify the scope guard**

Widen `owns` to `() => true` and re-run: the "owns canvas tabs and nothing else" test must FAIL, and so should existing sprite/level save-routing tests. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/state/project-runtime.ts src/renderer/state/canvas-save.ts src/renderer/shell/dirty-tabs.ts src/renderer/shell/dirty-snapshot.ts src/renderer/state/__tests__/canvas-save-routing.test.ts
git commit -m "feat(canvas): Ctrl+S saves the canvas you are looking at"
```

---

### Task 11: Activating and closing a canvas tab

**Files:**
- Modify: `src/renderer/shell/tab-activation.ts`
- Test: `src/renderer/shell/__tests__/canvas-doc-activation.test.ts`

Read `planSpriteDocActivation` and `confirmCloseSpriteDoc` first; this is the same shape with a simpler loader (a canvas is one file pair, with no zone dependency).

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/shell/__tests__/canvas-doc-activation.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { planCanvasDocActivation, activateCanvasDocTarget, confirmCloseCanvasDoc } from '../tab-activation';
import { canvasDocTab } from '../tabs';
import { useCanvasStore, openCanvasDoc, canvasDocState } from '../../state/canvasStore';
import { useConfirmStore } from '../../state/confirmStore';
import { createBuffer } from '../../../core/art/pixel-ops';
import { canvasIndex } from '../../../core/art/canvas-doc';

const TAB = canvasDocTab('sky');

beforeEach(() => { useCanvasStore.getState().closeAll(); });

describe('planCanvasDocActivation', () => {
  it('loads a document that is not open yet', () => {
    expect(planCanvasDocActivation({ tabId: TAB.id, isOpen: false }))
      .toEqual({ kind: 'load', name: 'sky' });
  });

  it('just checks out a document that is already open', () => {
    expect(planCanvasDocActivation({ tabId: TAB.id, isOpen: true }))
      .toEqual({ kind: 'activate' });
  });

  it('ignores a tab that is not a canvas doc', () => {
    expect(planCanvasDocActivation({ tabId: 'level:ghz:1', isOpen: false })).toEqual({ kind: 'none' });
  });
});

describe('activateCanvasDocTarget', () => {
  it('a failed load leaves NO half-open document behind', async () => {
    // The failure this prevents: a tab that reads as loaded but shows a blank
    // canvas under the missing file's name — indistinguishable from data loss.
    const loader = vi.fn(async () => { throw new Error('ENOENT'); });
    await activateCanvasDocTarget(TAB.id, loader);
    expect(canvasDocState(TAB.id)).toBeNull();
  });
});

describe('confirmCloseCanvasDoc', () => {
  it('closes a clean document with no prompt', async () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    const ask = vi.fn();
    useConfirmStore.setState({ ask });
    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(false);
  });

  it('asks before discarding a dirty document, and keeps it open on cancel', async () => {
    openCanvasDoc(TAB.id, { name: 'sky', width: 8, height: 8, profileId: 'none' });
    const buf = createBuffer(8, 8);
    buf.data[0] = canvasIndex(1, 1);
    useCanvasStore.getState().setPixels(TAB.id, buf);

    useConfirmStore.setState({ ask: vi.fn(async () => 'cancel') });
    expect(await confirmCloseCanvasDoc(TAB.id)).toBe(false);
    expect(useCanvasStore.getState().isOpen(TAB.id)).toBe(true);
    expect(canvasDocState(TAB.id)!.pixels.data[0]).toBe(canvasIndex(1, 1));
  });
});
```

The `ask` contract (`'cancel'` and its siblings) is whatever `confirmCloseSpriteDoc` already uses — **read it and match, do not invent a second vocabulary.**

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/renderer/shell/__tests__/canvas-doc-activation.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** — mirror the sprite-doc section of `tab-activation.ts`:

- `planCanvasDocActivation({ tabId, isOpen })` → `{ kind: 'none' } | { kind: 'activate' } | { kind: 'load'; name }`. Pure; no store reads.
- `activateCanvasDocTarget(tabId, loader)` — calls `loadCanvasFile` through an injectable loader, then `loadCanvasDoc(tabId, doc, source)`. **On a thrown loader, leave nothing behind** (no `openCanvasDoc` fallback) and toast the error.
- `confirmCloseCanvasDoc(tabId)` — clean closes silently; dirty asks Save / Discard / Cancel, saving through `saveCanvasDocument`.
- Wire both into the existing activation switch and the tab-close path next to their sprite equivalents.

- [ ] **Step 4: Run the test and the suite**

Run: `npx vitest run src/renderer/shell/__tests__/canvas-doc-activation.test.ts && npm test`
Expected: PASS; suite green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/shell/tab-activation.ts src/renderer/shell/__tests__/canvas-doc-activation.test.ts
git commit -m "feat(canvas): focus and close a canvas tab without losing work"
```

---

### Task 12: The canvas editor *(ILLUSTRATIVE — derive from source)*

**The tree is the authority for this task.** `SpriteMode.tsx` + `SpriteCanvasHost.tsx` + `SpriteToolDock.tsx` + `SpriteStatusBar.tsx` are the working example of everything below; read them and follow their structure rather than the sketch here.

**Files:**
- Create: `src/renderer/components/canvas/CanvasMode.tsx`, `CanvasHost.tsx`
- Create: `src/renderer/providers/palette-canvas.ts`
- Modify: `src/renderer/App.tsx`

**Contract this task must meet:**

1. **`CanvasHost` renders the document through the SHARED `PixelViewport` and `PixelEditController`.** No second drawing engine. Pass the document's 64 palette words decoded to `Color[]` as the `palette` prop — the viewport takes `(Color | undefined)[]` with no length assumption, and a canvas index IS a palette index, so no `lineMap` is involved. Build the config with `toolConfigFrom` exactly as `SpriteCanvasHost` does.
2. **Commit through the store, not into the buffer.** `onCommit` calls `useCanvasStore.getState().setPixels(docId, r.buffer)` and `setSelection`. The store's no-op check and `normalizeCanvasPixels` are the only places those rules live.
3. **One gesture, one undo entry** — this falls out of (2): `setPixels` records exactly one snapshot per call.
4. **Grids come from the profile.** `constraintProfile(doc.profileId).grids` drives which pitches are offered; the store's `visibleGrids` says which are drawn. Map 8 → `'cell8'`, 16 → `'block'` via `layers.blockPx`, 256 → a `drawUnderlay` line, matching how the classic composer already draws its coarse grid.
5. **The palette is the canvas's own 64 colours**, edited through the shared `PaletteGrid` behind a new `PaletteGridPort` in `providers/palette-canvas.ts`. Its `lines` are the doc's words in 4 rows of 16; clicking a swatch binds `canvasIndex(line, idx)` as the paint colour; index 0 uses the `'paint'` transparent behaviour (it is the eraser here, exactly as in aeon); a slider commit calls `setPalette`. A canvas with fewer profile lines (`genesis-sprite`) still shows four rows — the profile is checked in 2B, never prevented here (spec §4.3: **never prevent**).
6. **`CanvasMode` mounts at ONE point in `App.tsx`**, only while a canvas tab is active, exactly like `SpriteMode` — a second live instance would double-register the window keydown handler and double-fire undo. Add `t.kind !== 'art-doc'` to the keep-alive filter, and render an "unloaded" state when `activeDocId !== activeTab.id` (a restored tab whose file failed to load), reusing `SpriteDocUnloaded`'s shape.
7. **Ctrl+Z/Ctrl+Y inside the pane drive `focusedHistory()`**, which Task 8 already routes to the canvas document.

**Verification:** the node suite cannot render this. Task 14 is where it is checked; do not claim it works before then.

- [ ] **Step 1: Read `SpriteMode.tsx`, `SpriteCanvasHost.tsx`, `providers/palette-classic.ts` and `PixelViewport.tsx`.**
- [ ] **Step 2: Build `palette-canvas.ts` and unit-test the pure parts** (which swatch click yields which paint index; that a slider commit produces the expected 64-word array). Put it in `src/renderer/providers/__tests__/palette-canvas.test.ts`.
- [ ] **Step 3: Build `CanvasHost.tsx`.**
- [ ] **Step 4: Build `CanvasMode.tsx` with the tool dock, palette, viewport and status bar.**
- [ ] **Step 5: Mount it in `App.tsx`.**
- [ ] **Step 6: `npx tsc --noEmit && npx electron-vite build && npm test`** — all three clean.
- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/canvas src/renderer/providers/palette-canvas.ts src/renderer/providers/__tests__/palette-canvas.test.ts src/renderer/App.tsx
git commit -m "feat(canvas): the canvas editor pane"
```

---

### Task 13: Creating and finding canvases *(ILLUSTRATIVE — derive from source)*

**Files:**
- Create: `src/renderer/components/canvas/NewCanvasDialog.tsx`
- Modify: `src/renderer/shell/commands.ts`, `src/renderer/shell/explorer-data.ts`, `src/renderer/shell/Explorer.tsx`, `src/renderer/App.tsx`

**Contract:**

1. **"New Canvas…" in ⌘K**, next to "New Sprite…". Unlike New Sprite it is **not** aeon-only: a canvas has no engine. Gate it on *a project being open* — the files land under that project's `.aurora/`.
2. **The dialog collects name, width, height and profile**, defaulting to `128 × 128` and *Genesis level art*. It refuses a name `canvasNameIsSafe` rejects, and a name that already exists, **with the reason** — an overwrite here silently destroys someone's art.
3. **Creating seeds the palette from the open zone when there is one.** A classic act open means `useClassicLevelStore.getState().doc?.palettes` holds 4×16 CRAM words; flatten them into the canvas's 64. This is what makes a canvas drawn for Green Hill actually *look* like Green Hill. With no zone open, fall back to `blankCanvasPalette()`.
4. **Creating writes the files immediately** (so the document has a `source` and Ctrl+S has a destination), opens the tab, and checks the document out.
5. **The Explorer lists existing canvases** for the open project, from `listCanvasNames`, opening one as a canvas tab. Follow how the sprite list is built in `explorer-data.ts`.
6. **Test the pure parts in node**: name validation and collision refusal, the zone-palette seeding (flatten order line-major), and that `buildCommands` includes the command exactly when a project is open.

- [ ] **Step 1: Write the pure tests** (`src/renderer/shell/__tests__/new-canvas.test.ts`) covering (2), (3) and (6).
- [ ] **Step 2: Run them and watch them fail.**
- [ ] **Step 3: Implement the dialog, the command, and the Explorer entry.**
- [ ] **Step 4: `npx tsc --noEmit && npx electron-vite build && npm test`.**
- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/canvas/NewCanvasDialog.tsx src/renderer/shell/commands.ts src/renderer/shell/explorer-data.ts src/renderer/shell/Explorer.tsx src/renderer/App.tsx src/renderer/shell/__tests__/new-canvas.test.ts
git commit -m "feat(canvas): create a canvas and find the ones you have"
```

---

### Task 14: Verify in the running app under CDP

The node suite renders no React and no canvas, so **nothing above is evidence that drawing works**. Phase 1's CDP harness is the model: `docs/superpowers/plans/2026-08-15-paint-through-cdp-report.md` records how the app was driven and what was asserted. Read it first, and write the equivalent report at `docs/superpowers/plans/2026-08-15-canvas-cdp-report.md`.

- [ ] **Step 1: Launch the app against the real `s1disasm` project and open a zone.**

- [ ] **Step 2: Drive and assert each of these, recording the evidence:**

| # | Action | Assertion |
|---|---|---|
| 1 | New Canvas, 64×64, Genesis level art | A canvas tab opens; the palette shows the zone's colours, not black |
| 2 | Draw a stroke | Pixels appear; the tab shows the unsaved dot |
| 3 | Ctrl+Z once | The **whole stroke** disappears — one gesture, one undo |
| 4 | Ctrl+S | Dot clears; `.aurora/canvas/<name>.png` and `.canvas.json` exist on disk |
| 5 | Open the PNG outside Aurora | It is a valid indexed PNG (`file` reports "PNG image data … 8-bit colormap"), and the drawn shape is visible |
| 6 | Close the tab, reopen the canvas | The pixels and palette come back exactly |
| 7 | Open a second canvas, edit it, switch back and forth | Each tab keeps its own pixels; each dots independently |
| 8 | With a canvas tab active, press Ctrl+Z after editing a LEVEL | The level does **not** undo — the keyboard handoff (Task 8) holds in the real app |
| 9 | Edit a canvas, then switch projects | No stale document survives; no write lands in the old project |

- [ ] **Step 3: Reintroduce one original bug and watch the app fail.** The strongest verification available (phase 1's lesson): revert the `levelKeysEnabled` canvas branch, rebuild, confirm row 8 now fails, revert back and confirm it passes again. Record both observations.

- [ ] **Step 4: Write the report and commit**

```bash
git add docs/superpowers/plans/2026-08-15-canvas-cdp-report.md
git commit -m "test(canvas): verify the canvas document in the running app under CDP"
```

---

## After this plan

- **Plan 2B — constraints made visible.** Evaluate `cellPaletteRule` per 8×8 cell (live clash overlay, never a number), scalar readouts (colours per line, flip-aware unique-tile count against a limit), colour-space snapping on paste/import, and the *unconstrained* escape hatch. Everything it needs from 2A is `CanvasDoc` + `ConstraintProfile`.
- **Plan 2C — resolve and commit** (spec §4.4). Cut a grid-aligned region into tiles, dedup exactly and flip-aware, match the existing pool first, compose blocks and chunks, report *N new tiles / M new blocks / K new chunks* with pool counts before and after, refuse over the limit with the numbers, apply as one command. **It inherits phase 1's no-mint constraint** — "new tiles" means claimed free pool slots, of which Labyrinth has zero — so the ceiling must be stated *before* the artist invests in a drawing that cannot land, not at commit.
- **Still open from phase 1**, unrelated to this plan but worth carrying forward: the `usePaintSurfaceMode` extraction (ChunkTab/BlockTab duplication), and the two pre-existing bugs — the `LevelArt` sentinel taken as a file path, and `tileIndexOffset` dropped in `openDiscoveredSet`.

---

## Self-review

**Spec coverage (§4.1 only — §4.2–4.4 are 2B/2C by decision):**

| Spec §4.1 requirement | Task |
|---|---|
| Free-size indexed canvas, no chunk/tile pool | 1 |
| A new document type in the existing tab system | 8, 11 |
| Inherits guarded activation | 11 |
| Inherits dirty tracking | 7, 10 |
| Inherits undo routing | 6, 7, 8 |
| Inherits `SaveCoordinator` | 10 |
| 64-colour space (4 lines × 16), not one line | 1, 12 |
| Indexed PNG + sidecar JSON persistence | 3, 4, 5, 9 |
| Aseprite output stays importable | 4, 5 (sidecar-less load, sub-byte depths, all filters) |
| Constraint profile attached to the document | 2, 5 |
| Preset menu (§4.2's four) | 2, 13 |
| Grid overlays from the profile | 12 |

**Placeholder scan:** no TBDs. Tasks 12 and 13 are marked ILLUSTRATIVE and carry a numbered contract plus the exact files to read instead of invented component code — the same convention phase 1's Tasks 9–11 used successfully, and the honest option given the node suite cannot test React.

**Type consistency:** `ConstraintProfileId` (Task 2) is the type used by `CanvasDoc.profileId` (Task 1), `CanvasSidecar.profile` is a bare `string` because a sidecar may name an unknown profile (Task 5 tests that path). `CanvasSource` is defined once in `canvasStore.ts` and imported by `canvas-file.ts`. `readCanvasSnapshot`/`writeCanvasSnapshot` (Task 7) match `CanvasDocHistory`'s constructor (Task 6). `saveableDirtyCanvasDocIds` is the one predicate both the saver's `isDirty` and its `scope.isDirty` read (Task 10).

---

## Review corrections

**These are AUTHORITATIVE over the task text above them.** Tasks 1 and 2 shipped first (`e434050`), were reviewed, and the review found real defects in the plan's own code. The task text above is left as written so the history reads honestly; where it disagrees with this section, this section wins. Forward references in Tasks 5, 7 and 12 have already been updated in place.

**R1 (IMPORTANT, Task 1) — the choke point only covered half the illegal domain.** `normalizeTransparent` collapsed the entry-0 aliases (16/32/48) but let any value above 63 through untouched, so 200 and 8 rendered identically and stored differently — the exact "two spellings of one colour" bug the module header argues must never exist, entering by another door. Task 5's decoder feeds raw PNG indices straight into it, so the hole was on the real path. **Renamed `normalizeCanvasPixels`** (the old name under-describes a function that owns the whole domain) and every pixel now routes through `canvasIndex(paletteLineOf(v), paletteEntryOf(v))`, which already masks both fields — making `canvasIndex`'s "the ONE constructor" claim literally true and removing the asymmetry where the constructor masked and the normaliser did not. A value above 63 is corrupt input; the file-format layer refuses over-large palettes before this point, so it should never arrive in practice.

**R2 (IMPORTANT, Task 2) — `constraintProfile` could not accept the input it exists for.** Its documented `none` fallback is justified by "a sidecar can name a profile this build has never heard of", but a sidecar yields a `string` and the parameter type rejected it — which is why the test needed `as never`, and why Task 5's loader had reimplemented the fallback inline with a cast. The parameter is now `string`; the return type stays exact; Task 5 calls it instead of restating the rule.

**R2b (IMPORTANT, follow-on) — the widening in R2 opened a prototype-chain hole, found on re-review.** `??` only fires on null/undefined, and an object-literal `Record` inherits from `Object.prototype`, so once the parameter accepted any string, `constraintProfile('toString')` returned `Function.prototype.toString` *typed as a `ConstraintProfile`* with `.id === undefined` — reachable directly from sidecar JSON, invisible to TypeScript, and surfacing far from its cause. The lookup is now gated on `Object.prototype.hasOwnProperty.call(...)` and tested over `toString`, `constructor`, `__proto__`, `valueOf` and `hasOwnProperty`. Worth remembering the shape: widening a parameter to accept untrusted input moves the problem from the type system to runtime, and an index into a plain object literal is where it lands.

**R8 (IMPORTANT, Task 4) — the deflate/inflate pair moves to its own module, and the plan's `inflate` never compiled.** Task 3 hit a real toolchain mismatch: `@types/node`'s `Uint8Array<ArrayBufferLike>` is not assignable to DOM's `BlobPart`, so `new Blob([raw])` fails `tsc`. The obvious fix — passing `raw.buffer` — is a trap: it discards the view's `byteOffset`/`byteLength`, so a subarray silently compresses its neighbours' bytes. That is dormant in the encoder (its scanline buffer is always freshly allocated at its own size, and `TypedArray.set` respects the source window, which is *why* a public-API test of it passes with the bug present) but live in the decoder, where chunk data genuinely arrives as `png.subarray(start, start + len)`. The correct cast is of the VIEW: `new Blob([data as unknown as BlobPart])`.

Rather than state that twice and leave `inflate` private and unguarded, **Task 4 creates `src/core/art/zlib-stream.ts`** exporting `deflate` and `inflate`, moves the view-safety rationale there, and gives each direction a test that passes a `subarray` with a non-zero `byteOffset` and asserts the window's bytes and not its neighbours'. `indexed-png.ts` imports both. This also retires the "exported only for testability" question Task 3 raised: in the new module both are the public surface. Plant the `.buffer` form in each direction and watch the matching test fail before believing either guard.

**R11 (testing lesson, found during Task 4) — a fixture can be too small to discriminate.** The depth × filter cross-product test initially used a 5-pixel-wide fixture. At 1bpp that is `bpr === 1`, and with only one byte per row the Sub filter is *structurally identical* to None — there is no byte to the left. So that cell of the matrix could never fail, whatever the decoder did. It was caught by re-running the `switch(0)` plant against the new test rather than by reading it, and fixed by widening the fixture to 12 pixels (`bpr >= 2` at every depth down to 1bpp). The general form: when a test sweeps a parameter, check that every cell of the sweep is capable of failing — a fixture sized for the common case can silently degenerate at the extremes.

**R10 (Task 5, carried from Task 4's review) — the codec guarantees less than its types suggest, and Task 5 is the checkpoint.** `decodeIndexedPng` deliberately does NOT guarantee that a decoded index is less than `palette.length`: a foreign file may index past its own PLTE, and guarding it in the codec would duplicate a rule `canvas-doc.ts` already owns (`normalizeCanvasPixels` folds the whole domain). Task 5 is therefore the layer that must not assume symmetry with the ENCODER's `IndexedImage.indices`, which does promise it. The same applies to a decoded palette shorter than the file's own indices imply. This is a real trap because the two JSDoc comments sit in one file and read as a matched pair.

Note also what Task 4's review measured about validation posture: the encoder validated hostile input carefully and the decoder initially did not, despite the decoder being the side that reads files this codebase did not write. Task 5 reads a JSON sidecar that a user can hand-edit, so it inherits that asymmetry as its own design question — `parseCanvasSidecar` returning a result object rather than throwing is the plan's answer, and its rejection cases are load-bearing rather than decorative.

**R9 (Task 4) — give chunk parsing one production home.** `chunk()` has no read sibling, so a decoder written straight from the plan inlines its own `while (p < bytes.length)` walker. Add `parseChunks(bytes): { type, data }[]` beside `chunk()` and have `decodeIndexedPng` use it. The hand-rolled walkers in the TEST files stay independent on purpose — a test that shares the parser it is checking proves nothing.

**R7 (IMPORTANT, follow-on) — half of R6 was comment-only.** `pixel-ops.ts`'s comment names the exact dangerous edit ("must not add an `& 15` in here"), but masking all three write sites in `floodFill`, `drawLine` and `drawRect` left the whole `src/core/art` + `src/core/editing` suite green: the controller guard from R6 only exercised the pencil path, which writes through the controller's own `setPx` and never reaches `pixel-ops`. The controller test now drives fill, line, rect and dither with a 0..63 colour, and each was validated by planting the mask and watching the matching test fail.

**R3 (IMPORTANT, Task 1) — no size ceiling.** `blankCanvasDoc` clamped the floor only. `cloneCanvasDoc` copies the whole buffer per undo entry and `CanvasDocHistory` keeps 40, so an unbounded "free-size" canvas is an unbounded history. `MAX_SIDE = 1024` (~1 MB per snapshot, ~40 MB of history); the ceiling is set by snapshot cost, not by anything about the art.

**R4/R5 (IMPORTANT, Task 1) — two regressions the suite would have reported green.** `cloneCanvasDoc` had no test at all despite being what undo depends on (a regression to `palette: d.palette` would produce an undo that mutates the snapshot it restores), and the normaliser's test could not tell a copy from an in-place mutation of the caller's buffer. Both now tested.

**R6 (IMPORTANT, cross-module) — `PixelBuffer`'s own documentation contradicts the canvas.** `pixel-ops.ts` says values are 0-15 and `pixel-edit-controller.ts` says `color` is 0..15; `CanvasDoc.pixels` is that type carrying 0..63. Nothing masks today, so the canvas works by accident of stale docs — someone tightening `pixel-ops` in good faith could add `v & 15` and flatten every canvas pixel to line 0. Both comments now say the range is set by the owner, and a controller test pushes a 0..63 colour through a stroke so the comment is backed by a guard.

**Renames to carry forward:** `normalizeTransparent` → `normalizeCanvasPixels`; `CanvasDoc.grid` → `CanvasDoc.gridOrigin` (it sat beside `ConstraintProfile.grids`, which holds pitches, so `doc.grid` read as the wrong thing) — and the sidecar JSON key changes with it, which is free because nothing has shipped.

---

**Contracts verified against the tree while writing this plan** (do not re-derive them, but do re-check if the code has moved): `SnapshotHistory`'s constructor is `(read, write, maxDepth?)` with a protected abstract `clone`, and `canUndo`/`canRedo` are **getters, not methods**; `PixelViewport.palette` is `(Color | undefined)[]` with no length assumption, so a 64-entry palette is legal; `PixelEditController` never masks a colour to 0..15, so a 0..63 paint index passes through unchanged; `TAB_KINDS` already contains `'art-doc'` with no user; `writeGuarded`, `readBinaryFile`, `fileMtime` and `listDir` already exist on `window.api`, so this plan adds **no IPC channel**; `CompressionStream`/`DecompressionStream` are present in node v24.15.0 and in Chromium.
