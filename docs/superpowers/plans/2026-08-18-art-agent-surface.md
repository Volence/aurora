# Art Agent Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put `commit_canvas` and `import_art_sheet` on Aurora's shared `EDITOR_METHODS` registry, so the 2A/2B/2C art line is reachable from both MCP and the Aether `editor/*` surface.

**Architecture:** Both tools are one operation with two pixel sources, converging on the existing pure `planFromSnapshot` and the existing `classicCommitCanvas` command. Nothing about commit logic is re-implemented. The only new logic is (a) a pure core module that turns PNG bytes into mapped pixels without a file dialog, and (b) a renderer helper that builds a `CommitSnapshot`, plans, optionally applies, and shapes the agent reply.

**Tech Stack:** TypeScript, Electron (main + renderer), Zustand stores, Zod schemas, vitest, `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-08-18-art-agent-surface-design.md`

---

## File Structure

**Create:**
- `src/core/art/sheet-import.ts` — pure core. `flattenActPalette`, `sheetFromBytes`, `explainSheetRefusal`. No dialog, no store, no React, so the node suite reaches all of it.
- `src/core/art/__tests__/sheet-import.test.ts`
- `src/renderer/agent/art-commit.ts` — the shared agent-side commit helper: snapshot → plan → apply → reply shape (report, engine ids, refusal view).
- `src/renderer/agent/__tests__/art-commit.test.ts`
- `src/main/__tests__/registry-conformance.test.ts` — asserts the MCP/Aether/handler triple never drifts.
- `scratchpad/art-agent-harness.mjs` — CDP runtime proof.

**Modify:**
- `src/renderer/state/import-sheet.ts` — keep the dialog, delegate the work to core.
- `src/renderer/state/classicLevelStore.ts:842` — export `editableTileRange`.
- `src/shared/agent-protocol.ts` — two new `AgentRequest` kinds.
- `src/main/editor-methods.ts` — two new registry entries.
- `src/renderer/agent/agent-handler.ts` — two new cases.

**Not modified:** `src/renderer/components/canvas/CommitPlanView.tsx`. See spec §3.2 — it already shares `planFromSnapshot` and needs its hooks for reactivity.

---

## Task 1: Pure sheet import (core)

Moves decode + palette-map + the artist-facing refusal text out of the renderer, so both the dialog and the agent use one copy.

**Files:**
- Create: `src/core/art/sheet-import.ts`
- Test: `src/core/art/__tests__/sheet-import.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/art/__tests__/sheet-import.test.ts
//
// The half of sheet import that has no dialog in it. Everything here used to sit
// inside `loadSheetForAct`, behind `window.api.selectFile` — which is exactly why
// none of it had a test.

import { describe, it, expect } from 'vitest';
import { flattenActPalette, sheetFromBytes, explainSheetRefusal } from '../sheet-import';
import { encodeIndexedPngForTest } from './helpers/indexed-png-fixture';
import type { LevelDoc } from '../../level-classic/model';

/** A LevelDoc carrying only what sheet import reads: four palette lines. */
function docWithPalette(words: number[]): LevelDoc {
  const palettes = [0, 1, 2, 3].map((l) => Uint16Array.from(words.slice(l * 16, l * 16 + 16)));
  return { palettes } as unknown as LevelDoc;
}

const BLACK = 0x0000;
const RED = 0x000e;

describe('flattenActPalette', () => {
  it('flattens four lines line-major into 64 words', () => {
    const words = Array.from({ length: 64 }, (_, i) => i);
    expect(flattenActPalette(docWithPalette(words))).toEqual(words);
  });

  it('fills a short or missing line with 0 rather than undefined', () => {
    const doc = { palettes: [Uint16Array.from([1, 2])] } as unknown as LevelDoc;
    const flat = flattenActPalette(doc);
    expect(flat).toHaveLength(64);
    expect(flat[0]).toBe(1);
    expect(flat[2]).toBe(0);
    expect(flat[63]).toBe(0);
  });
});

describe('sheetFromBytes', () => {
  it('maps an indexed PNG whose colours are all in the act', async () => {
    const words = Array.from({ length: 64 }, (_, i) => (i === 1 ? RED : BLACK));
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }],
      indices: new Uint8Array(64).fill(1),
    });
    const res = await sheetFromBytes(docWithPalette(words), png);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sheet.pixels.width).toBe(8);
    expect(res.sheet.palette).toHaveLength(64);
    expect(res.sheet.usedLines).toEqual([0]);
  });

  it('refuses a colour the act does not have, naming the colour', async () => {
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }],
      indices: new Uint8Array(64).fill(1),
    });
    const res = await sheetFromBytes(docWithPalette(new Array(64).fill(BLACK)), png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refusal.kind).toBe('colour-not-in-act');
    expect(explainSheetRefusal(res.refusal)).toMatch(/colours the act does not have/);
  });

  it('refuses an 8x8 cell that mixes colours from two palette lines', async () => {
    // PLANTED: two colours that exist, but only in DIFFERENT lines, inside one
    // cell. Line 0 entry 1 is red; line 1 entry 1 is green; no line holds both.
    const words = new Array(64).fill(BLACK);
    words[1] = RED;        // line 0, entry 1
    words[16 + 1] = GREEN; // line 1, entry 1
    const indices = new Uint8Array(64).fill(1);
    indices[0] = 2;        // one pixel of the other colour, same 8x8 cell
    const png = encodeIndexedPngForTest({
      width: 8, height: 8,
      palette: [{ r: 0, g: 0, b: 0 }, { r: 0xee, g: 0, b: 0 }, { r: 0, g: 0xee, b: 0 }],
      indices,
    });
    const res = await sheetFromBytes(docWithPalette(words), png);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.refusal.kind).toBe('cell-needs-two-lines');
    expect(explainSheetRefusal(res.refusal)).toMatch(/one line/);
  });

  it('throws, rather than refusing, on bytes that are not a PNG', async () => {
    await expect(sheetFromBytes(docWithPalette(new Array(64).fill(BLACK)), new Uint8Array([1, 2, 3])))
      .rejects.toThrow(/INDEXED/);
  });
});
```

Add `const GREEN = 0x00e0;` beside the other colour constants at the top of the file.

- [ ] **Step 2: Write the PNG fixture helper the test imports**

The suite has no indexed-PNG encoder. `src/core/art/__tests__/png-import.test.ts` builds its
fixtures inline; extract that into a shared helper so this test and that one agree.

```ts
// src/core/art/__tests__/helpers/indexed-png-fixture.ts
//
// A minimal PLTE+IDAT indexed PNG encoder, for tests only. `decodeIndexedPng` is
// the thing under test elsewhere, so this deliberately does NOT share code with
// it — a fixture built by the decoder's own helpers proves nothing.

import { deflateSync } from 'node:zlib';

export interface Rgb { r: number; g: number; b: number }

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodeIndexedPngForTest(
  { width, height, palette, indices }:
  { width: number; height: number; palette: Rgb[]; indices: Uint8Array },
): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type 3 = indexed
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => { plte[i * 3] = c.r; plte[i * 3 + 1] = c.g; plte[i * 3 + 2] = c.b; });

  // One filter byte (0 = None) per scanline.
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }

  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/core/art/__tests__/sheet-import.test.ts`
Expected: FAIL — `Failed to resolve import "../sheet-import"`.

- [ ] **Step 4: Write the implementation**

```ts
// src/core/art/sheet-import.ts
//
// FOREIGN ART SHEET -> PIXELS THE COMMIT PLANNER CAN TAKE. The half of sheet
// import with no dialog in it.
//
// This lives in core rather than in renderer/state/import-sheet.ts because two
// callers now need it: the Import dialog, and the agent surface's
// `import_art_sheet`. The refusal SENTENCES live here too, not just the refusal
// KINDS — the agent should read what the artist reads, and a second copy written
// for the agent would drift the first time either is reworded.
//
// It deliberately never builds a CanvasDoc; see import-sheet.ts's header for why
// (the CANVAS_MAX_SIDE cap belongs to the document, not to the decoder).

import { decodeIndexedPng } from './indexed-png';
import { importPngAgainstPalette } from './png-import';
import type { PngImport, PngImportRefusal } from './png-import';
import { fmtGenesisWord } from '../formats/palette';
import { CANVAS_LINE_LENGTH } from './canvas-doc';
import type { LevelDoc } from '../level-classic/model';

export interface ImportedSheet extends PngImport {
  /** The act palette the pixels were mapped against, flattened line-major — what
   *  the commit planner compares against, and by construction a match, so an
   *  imported sheet never trips the palette-drift refusal. */
  palette: number[];
}

export type SheetImportResult =
  | { ok: true; sheet: ImportedSheet }
  | { ok: false; refusal: PngImportRefusal };

/** The act's 64 CRAM words, line-major. */
export function flattenActPalette(doc: LevelDoc): number[] {
  const out: number[] = [];
  for (let l = 0; l < 4; l++) {
    for (let e = 0; e < CANVAS_LINE_LENGTH; e++) out.push(doc.palettes[l]?.[e] ?? 0);
  }
  return out;
}

/**
 * Decode PNG bytes and map them onto `doc`'s palette.
 *
 * THROWS for bytes that are not a usable PNG — that is a broken input, not a
 * decision about the art. REFUSES for the two things that actually go wrong with
 * a sheet made elsewhere: a colour the level does not have, and a cell that mixes
 * colours from lines the hardware cannot combine.
 */
export async function sheetFromBytes(doc: LevelDoc, bytes: Uint8Array): Promise<SheetImportResult> {
  let png;
  try {
    png = await decodeIndexedPng(bytes);
  } catch (e) {
    throw new Error(`${(e as Error).message} — the importer needs an INDEXED (paletted) PNG`);
  }
  const palette = flattenActPalette(doc);
  const mapped = importPngAgainstPalette(png, palette);
  if (!mapped.ok) return { ok: false, refusal: mapped.refusal };
  return { ok: true, sheet: { ...mapped.result, palette } };
}

/** The refusal, in the artist's terms. One copy, read by the dialog and the agent. */
export function explainSheetRefusal(refusal: PngImportRefusal): string {
  if (refusal.kind === 'colour-not-in-act') {
    const all = refusal.colours ?? [];
    const list = all.slice(0, 8).map(fmtGenesisWord).join(', ');
    const more = all.length - 8;
    return `This sheet uses colours the act does not have: ${list}${more > 0 ? `, and ${more} more` : ''}. `
      + 'Recolour it to the act\'s palette, or add those colours to the zone palette first.';
  }
  const cells = refusal.cells ?? [];
  const where = cells.slice(0, 4).map((c) => `(${c.x},${c.y})`).join(' ');
  return `${cells.length} cell${cells.length === 1 ? '' : 's'} mix colours that no single palette line holds — `
    + `${where}${cells.length > 4 ? ' and more' : ''}. Each 8×8 cell must draw from one line.`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/core/art/__tests__/sheet-import.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/sheet-import.ts src/core/art/__tests__/sheet-import.test.ts src/core/art/__tests__/helpers/indexed-png-fixture.ts
git commit -m "feat(art): sheet import without a file dialog

The decode/map/refuse half of loadSheetForAct moves to core, refusal
SENTENCES included — the agent surface must read what the artist reads,
and a second copy written for the agent drifts the first reword."
```

---

## Task 2: Rewire the dialog onto the core module

`loadSheetForAct` keeps its signature and behaviour; only its internals change. Existing callers (`ImportSheetDialog.tsx`) are untouched.

**Files:**
- Modify: `src/renderer/state/import-sheet.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/state/__tests__/import-sheet.test.ts` (create if absent):

```ts
// src/renderer/state/__tests__/import-sheet.test.ts
//
// The dialog wrapper only. The decode/map/refuse logic is core and tested in
// core/art/__tests__/sheet-import.test.ts — this asserts the SPLIT: that the
// wrapper reports cancellation, and that a refusal arrives as the artist's
// sentence rather than as a bare kind.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSheetForAct } from '../import-sheet';
import type { LevelDoc } from '../../../core/level-classic/model';

const doc = { palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)) } as unknown as LevelDoc;

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    api: { selectFile: vi.fn(), readBinaryFile: vi.fn() },
  };
});

describe('loadSheetForAct', () => {
  it('reports cancellation when no file is chosen', async () => {
    (window.api.selectFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await loadSheetForAct(doc)).toEqual({ cancelled: true });
  });

  it('surfaces a decode failure as an error string, not a throw', async () => {
    (window.api.selectFile as ReturnType<typeof vi.fn>).mockResolvedValue('/tmp/x.png');
    (window.api.readBinaryFile as ReturnType<typeof vi.fn>).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const res = await loadSheetForAct(doc);
    expect(res).toMatchObject({ ok: false });
    if ('error' in res) expect(res.error).toMatch(/INDEXED/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/state/__tests__/import-sheet.test.ts`
Expected: **both tests PASS against the pre-rewrite code.** This step has no red state, and that is correct rather than a problem — Task 2 is a pure refactor.

*An earlier draft of this plan predicted a failure here, reasoning that `loadSheetForAct` "only catches around `decodeIndexedPng`" so the new core throw would escape. That was wrong: the pre-rewrite code already wrapped the decode in its own `try/catch` returning the identical `— the importer needs an INDEXED (paletted) PNG` message. Verified at `c50adfa:src/renderer/state/import-sheet.ts:63-69`.*

So these are **characterisation tests**: they pin the wrapper's catch in place across the move, and they would fail if the rewrite let the core throw escape. Write them first anyway — a refactor's tests are worth more before the refactor than after — but do not manufacture a red state, and do not treat green-first as a reason to skip them.

- [ ] **Step 3: Rewrite `import-sheet.ts` to delegate**

Replace the whole file below its header comment:

```ts
import { sheetFromBytes, explainSheetRefusal, flattenActPalette } from '../../core/art/sheet-import';
import type { ImportedSheet } from '../../core/art/sheet-import';
import type { LevelDoc } from '../../core/level-classic/model';

export { flattenActPalette };

export interface LoadedSheet extends ImportedSheet {
  /** The file it came from, for the dialog's title. */
  path: string;
}

export type LoadSheetOutcome =
  | { ok: true; sheet: LoadedSheet }
  | { ok: false; error: string }
  | { cancelled: true };

async function readAbsolute(path: string): Promise<Uint8Array> {
  return new Uint8Array(await window.api.readBinaryFile(path, ''));
}

/** Pick a PNG and map it onto `doc`'s palette. The decode/map/refuse half is core. */
export async function loadSheetForAct(doc: LevelDoc): Promise<LoadSheetOutcome> {
  const path = await window.api.selectFile('Import art sheet', [{ name: 'PNG image', extensions: ['png'] }]);
  if (!path) return { cancelled: true };

  let res;
  try {
    res = await sheetFromBytes(doc, await readAbsolute(path));
  } catch (e) {
    // A dialog reports; it does not throw at its caller.
    return { ok: false, error: (e as Error).message };
  }
  if (!res.ok) return { ok: false, error: explainSheetRefusal(res.refusal) };
  return { ok: true, sheet: { ...res.sheet, path } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/state/__tests__/import-sheet.test.ts src/core/art/__tests__/sheet-import.test.ts`
Expected: PASS, 8 tests total.

- [ ] **Step 5: Verify the dialog still type-checks against the new `LoadedSheet`**

Run: `npx tsc --noEmit`
Expected: clean. `ImportSheetDialog.tsx` reads `sheet.path`, `sheet.pixels`, `sheet.palette`, `sheet.usedLines`, `sheet.snappedColours` — all still present.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/state/import-sheet.ts src/renderer/state/__tests__/import-sheet.test.ts
git commit -m "refactor(art): the import dialog delegates to core

loadSheetForAct keeps its signature; only its internals move. It also stops
letting a decode failure escape as a throw — a dialog reports."
```

---

## Task 3: Export the non-hook `editableTileRange`

**Files:**
- Modify: `src/renderer/state/classicLevelStore.ts:842`

- [ ] **Step 1: Make the change**

At `src/renderer/state/classicLevelStore.ts:842`, add the `export` keyword and a docblock:

```ts
/**
 * The writable tile span for the open act, or null (unknown / fakes).
 *
 * EXPORTED for the agent surface. `useEditableTileRange`
 * (components/classic/composer-shared.tsx:36) is the React-reactive twin of this
 * and is what components use; the agent handler is not a component, and
 * `classicCommitCanvas` below already calls this one.
 */
export function editableTileRange(): EditableTileRange | null {
```

- [ ] **Step 2: Verify nothing else broke**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/state/classicLevelStore.ts
git commit -m "refactor(classic): export the non-hook editableTileRange

The agent handler is not a component, so it cannot use the hook twin."
```

---

## Task 4: The shared agent commit helper

The one place that builds a snapshot, plans, applies, and shapes the reply. Both tools call it; neither duplicates it.

> **THE CODE BELOW IS SUPERSEDED. Read `src/renderer/agent/art-commit.ts` instead.**
> Code review found three errors in this draft and they are fixed in the shipped
> module (`fb92c99`), not here:
>
> 1. **Two throws that should have been refusals.** The draft throws for a
>    wrong-length `targets` and for pixels holding no whole chunk. Both are
>    caller-fixable, and a throw becomes `-32603 INTERNAL` at the adapter — "Aurora
>    is broken" — for "you passed 3 targets for a 4-chunk canvas". Worse, my
>    rationale for keeping them was false: `planCanvasCommit` **already** refuses
>    the first as `target-count` (`classic-commit-plan.ts:308-310`) with a better
>    sentence, and the second lands in `region-out-of-bounds`. No wider type was
>    ever needed. The guard is deleted; the zero-chunk case returns a refusal.
> 2. **`withCollision`'s `applied` was discarded**, so a `collision: true` reply
>    described the plan *before* the toggle, and `skippedOverhang` — the count of
>    blocks that genuinely still lack collision — was dropped. It now surfaces as
>    `collision` on the ok-branch. (Not named `applied`: that field already exists
>    as a boolean meaning "written to the doc".)
> 3. **`collision` is an object, not a flag.** The draft's
>    `doc?.collision.colind.length ?? 0` silently produced a plan whose cells are
>    stamped solid while every block is skipped as overhang — the two-tier model's
>    fall-through-the-floor case. `collision?: { colindLength: number }` makes
>    asking for collision without the table length **unrepresentable**.

**Files:**
- Create: `src/renderer/agent/art-commit.ts`
- Test: `src/renderer/agent/__tests__/art-commit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/agent/__tests__/art-commit.test.ts
//
// The agent's commit reply. The planner is not re-litigated here — these assert
// the SHAPE the agent sees: a refusal that arrives as a result rather than a
// throw, and the appended chunks' ENGINE ids, which are the whole reason the
// reply exists (without them the agent has minted chunks it cannot name in a
// follow-up set_layout_region).

import { describe, it, expect } from 'vitest';
import { appendedEngineIds, replyFromPlanResult } from '../art-commit';
import type { CommitPlanResult } from '../../../core/art/classic-commit-plan';

describe('appendedEngineIds', () => {
  // classicLevelStore.ts:1354 — newEngineId = nextChunks.length, i.e. file index + 1.
  it('is file index + 1, contiguous from the pre-commit chunk count', () => {
    expect(appendedEngineIds(40, 3)).toEqual([41, 42, 43]);
  });

  it('is empty when the commit only replaced chunks', () => {
    expect(appendedEngineIds(40, 0)).toEqual([]);
  });
});

describe('replyFromPlanResult', () => {
  it('returns a refusal as ok:false with the panel\'s own sentences', () => {
    const result: CommitPlanResult = {
      ok: false,
      refusal: { kind: 'tiles-exhausted', needed: 12, available: 4, reclaimed: 0, free: 4 },
    };
    const reply = replyFromPlanResult(result, { apply: false });
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.refusal.kind).toBe('tiles-exhausted');
    expect(reply.message).toMatch(/12 tiles/);
    expect(reply.resolution).toMatch(/Replace more chunks/);
    expect(reply.offers).toEqual([]);
  });

  it('names the palette resolutions that would unblock a palette-drift refusal', () => {
    const result: CommitPlanResult = {
      ok: false,
      refusal: { kind: 'palette-drift', entries: [5], touchesLine0: false },
    };
    const reply = replyFromPlanResult(result, { apply: false });
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.offers).toEqual(['use-act-colours', 'adopt-into-zone']);
  });

  // The planner's own suite proves refusals are RAISED (core/art/__tests__/
  // classic-commit-plan.test.ts covers region-misaligned, region-out-of-bounds,
  // target-count and cell-clash). What is unproven at that tier is that every
  // member of the union SURVIVES the trip to the agent — that none throws, and
  // none arrives without a sentence.
  //
  // The samples are a mapped type over CommitRefusal['kind'], so coverage is
  // enforced by the COMPILER, not by this list being kept in step by hand: a new
  // member of the union makes this object a type error until it is sampled here,
  // and a sample whose fields drift from its variant is a type error too.
  const SAMPLES: { [K in CommitRefusal['kind']]: Extract<CommitRefusal, { kind: K }> } = {
    'region-misaligned': { kind: 'region-misaligned', detail: 'x' },
    'region-out-of-bounds': { kind: 'region-out-of-bounds', detail: 'x' },
    'target-count': { kind: 'target-count', expected: 2, got: 1 },
    'target-invalid': { kind: 'target-invalid', detail: 'x' },
    'grid-origin': { kind: 'grid-origin', originX: 3, originY: 3 },
    'cell-clash': { kind: 'cell-clash', cells: [] },
    'palette-drift': { kind: 'palette-drift', entries: [1], touchesLine0: false },
    'palette-unmappable': { kind: 'palette-unmappable', entries: [1] },
    'predicates-unknown': { kind: 'predicates-unknown', which: ['reservedTiles'] },
    'tiles-exhausted': { kind: 'tiles-exhausted', needed: 2, available: 1, reclaimed: 0, free: 1 },
    'blocks-exhausted': { kind: 'blocks-exhausted', needed: 1025, ceiling: 1024 },
    'chunks-exhausted': { kind: 'chunks-exhausted', needed: 128, ceiling: 127 },
  };
  const ALL_REFUSALS: CommitRefusal[] = Object.values(SAMPLES);

  it.each(ALL_REFUSALS.map((r) => [r.kind, r] as const))(
    'turns a %s refusal into a result with a message, never a throw',
    (_kind, refusal) => {
      const reply = replyFromPlanResult({ ok: false, refusal }, { apply: false });
      expect(reply.ok).toBe(false);
      if (reply.ok) return;
      expect(reply.message.length).toBeGreaterThan(0);
      expect(reply.resolution.length).toBeGreaterThan(0);
    },
  );
});
```

Import `CommitRefusal` alongside `CommitPlanResult` at the top of the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/agent/__tests__/art-commit.test.ts`
Expected: FAIL — `Failed to resolve import "../art-commit"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/agent/art-commit.ts
//
// THE AGENT'S HALF OF COMMIT. Both `commit_canvas` and `import_art_sheet` are the
// same operation with different pixel sources, so the snapshot/plan/apply/reply
// path exists exactly once, here.
//
// TWO THINGS THIS OWNS, AND NOTHING ELSE DOES:
//
//   1. A refusal comes back as a RESULT, not a throw. The Aether adapter maps a
//      throw to ERR.INTERNAL (-32603), which claims the server broke; "this needs
//      12 tiles and 4 are free" is the answer the caller asked for. Throws are
//      reserved for genuine faults — no act open, canvas not found, bad bytes.
//   2. The appended chunks' 1-based ENGINE ids. `classicCommitCanvas` returns a
//      bare {ok:true}, so they are derived rather than plumbed: an engine id is
//      its file index + 1 (classicLevelStore.ts:1354).

import { planFromSnapshot, refusalView, defaultTargets, canvasChunkCapacity } from '../components/canvas/canvas-commit-model';
import type { CommitSnapshot } from '../components/canvas/canvas-commit-model';
import type { CommitPlanResult, CommitReport, CommitRefusal, CommitTarget, PaletteResolution } from '../../core/art/classic-commit-plan';
import type { OfferedResolution } from '../components/canvas/canvas-commit-model';
import { withCollision } from '../../core/art/commit-collision';
import { useClassicLevelStore, classicCommitCanvas, editableTileRange } from '../state/classicLevelStore';
import type { PixelBuffer } from '../../core/art/pixel-ops';

export type ArtCommitReply =
  | { ok: true; report: CommitReport; appendedChunkIds: number[]; applied: boolean }
  | { ok: false; refusal: CommitRefusal; message: string; resolution: string; offers: OfferedResolution[] };

/**
 * The engine ids a commit's appended chunks were given.
 *
 * An engine chunk id is its file index PLUS ONE — `classicAddChunk` computes
 * `newEngineId = nextChunks.length`, annotated at classicLevelStore.ts:1354 as
 * "file index (length-1) + 1 = length". So `count` chunks appended against a
 * pre-commit pool of `before` chunks occupy engine ids before+1 .. before+count.
 * Replaced chunks keep their existing ids and are not in this list.
 */
export function appendedEngineIds(before: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => before + i + 1);
}

/** Turn a plan result into the agent reply. Applies only when told to. */
export function replyFromPlanResult(
  result: CommitPlanResult,
  opts: { apply: boolean; collision?: boolean },
): ArtCommitReply {
  if (!result.ok) {
    const view = refusalView(result.refusal);
    return {
      ok: false,
      refusal: result.refusal,
      message: view.message,
      resolution: view.resolution,
      offers: view.offers,
    };
  }

  const before = result.plan.report.poolBefore.chunks;
  const plan = opts.collision
    ? withCollision(result.plan, useClassicLevelStore.getState().doc?.collision.colind.length ?? 0)
    : result.plan;

  if (opts.apply) {
    const res = classicCommitCanvas(plan);
    // A rejection HERE is a genuine fault: the planner is the authority on what
    // is legal, so the command re-validating and disagreeing means the two have
    // drifted. That is not an answer the caller can act on — it throws.
    if (!res.ok) throw new Error(`commit rejected after planning: ${res.error}`);
  }

  return {
    ok: true,
    report: plan.report,
    appendedChunkIds: appendedEngineIds(before, plan.chunkAppends.length),
    applied: opts.apply,
  };
}

/** The level half of a snapshot, read without React. Throws if no act is open. */
export function commitContextFromStores(): Pick<CommitSnapshot, 'doc' | 'reservedTiles' | 'range'> {
  const s = useClassicLevelStore.getState();
  if (s.status !== 'ready' || !s.doc) throw new Error('no classic level is open');
  return { doc: s.doc, reservedTiles: s.reservedTiles ?? null, range: editableTileRange() };
}

/** Plan (and optionally apply) a commit of `pixels` into the open act. */
export function commitPixels(input: {
  pixels: PixelBuffer;
  canvasPalette: number[];
  gridOrigin?: { originX: number; originY: number };
  targets?: CommitTarget[];
  paletteResolution?: PaletteResolution;
  collision?: boolean;
  dryRun?: boolean;
}): ArtCommitReply {
  const ctx = commitContextFromStores();
  const cap = canvasChunkCapacity(input.pixels.width, input.pixels.height);
  if (cap.total === 0) {
    throw new Error(
      `these pixels hold no whole 256×256 chunk (${input.pixels.width}×${input.pixels.height})`,
    );
  }
  // A caller-supplied list of the wrong length would refuse as 'target-count',
  // which reads as a bug rather than as a mistake; say so plainly instead.
  if (input.targets && input.targets.length !== cap.total) {
    throw new Error(`targets must have ${cap.total} entries (got ${input.targets.length})`);
  }
  const result = planFromSnapshot({
    ...ctx,
    pixels: input.pixels,
    canvasPalette: input.canvasPalette,
    targets: input.targets ?? defaultTargets(cap.total),
    paletteResolution: input.paletteResolution ?? 'none',
    gridOrigin: input.gridOrigin,
  });
  return replyFromPlanResult(result, { apply: !input.dryRun, collision: input.collision });
}
```

- [ ] **Step 4: Export `OfferedResolution` from the commit model if it is not already**

Check `src/renderer/components/canvas/canvas-commit-model.ts:102-111`. If `OfferedResolution` is declared but not exported, add `export` to it.

Run: `grep -n "OfferedResolution" src/renderer/components/canvas/canvas-commit-model.ts`
Expected: an `export type OfferedResolution` line. If it says only `type OfferedResolution`, add the keyword.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/agent/__tests__/art-commit.test.ts`
Expected: PASS, 16 tests (4 plus the 12 parameterised refusals).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/agent/art-commit.ts src/renderer/agent/__tests__/art-commit.test.ts src/renderer/components/canvas/canvas-commit-model.ts
git commit -m "feat(agent): the shared art-commit helper

One snapshot/plan/apply/reply path for both art tools. Refusals return as
results carrying the panel's own sentences; appended chunks come back as
1-based ENGINE ids, without which the agent cannot name what it minted."
```

---

## Task 5: Protocol kinds and registry entries

**Files:**
- Modify: `src/shared/agent-protocol.ts:60`
- Modify: `src/main/editor-methods.ts:155`

- [ ] **Step 1: Add the two request kinds**

In `src/shared/agent-protocol.ts`, after the `classic-save-project` member (line 60), change the terminating `;` to `|` and append:

```ts
  | { kind: 'classic-commit-canvas'; name: string; targets?: { chunkFileIndex: number | null }[];
      paletteResolution?: 'none' | 'use-act-colours' | 'adopt-into-zone';
      collision?: boolean; dryRun?: boolean }
  | { kind: 'classic-import-art-sheet'; path: string; targets?: { chunkFileIndex: number | null }[];
      paletteResolution?: 'none' | 'use-act-colours' | 'adopt-into-zone';
      collision?: boolean; dryRun?: boolean };
```

- [ ] **Step 2: Add the two registry entries**

In `src/main/editor-methods.ts`, above the closing `];` of `EDITOR_METHODS`, add:

```ts
  // --- the art line (spec 2026-08-18) ---
  // Both are the same commit with different pixel sources. A REFUSAL comes back
  // in the result as `ok:false` with the artist-facing sentence, not as a
  // protocol error — see the design's §4.
  { name: 'commit_canvas', kind: 'classic-commit-canvas', result: 'json',
    params: {
      name: z.string().describe('canvas name under .aurora/canvas (no path, no extension)'),
      targets: z.array(z.object({
        chunkFileIndex: z.number().int().min(0).nullable().describe('chunk to replace, or null to append'),
      })).optional().describe('one per whole 256x256 chunk of the canvas, row-major; omit to append them all'),
      paletteResolution: z.enum(['none', 'use-act-colours', 'adopt-into-zone']).optional(),
      collision: z.boolean().optional().describe('give the new art flat ($FF) collision in the same undo step'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Commit a saved canvas into the open act: cut to tiles/blocks/chunks, dedupe, reclaim, write. One undo step. Reply carries the full commit report plus the 1-based ENGINE ids of any appended chunks (pass those to set_layout_region). A refusal returns ok:false with a message, a resolution, and which paletteResolution values would unblock it.' },
  { name: 'import_art_sheet', kind: 'classic-import-art-sheet', result: 'json',
    params: {
      path: z.string().describe('absolute path to an INDEXED (paletted) PNG'),
      targets: z.array(z.object({
        chunkFileIndex: z.number().int().min(0).nullable().describe('chunk to replace, or null to append'),
      })).optional().describe('one per whole 256x256 chunk of the sheet, row-major; omit to append them all'),
      paletteResolution: z.enum(['none', 'use-act-colours', 'adopt-into-zone']).optional(),
      collision: z.boolean().optional().describe('give the new art flat ($FF) collision in the same undo step'),
      dryRun: z.boolean().optional().describe('plan and report without applying'),
    },
    description: 'Import an indexed PNG made elsewhere, mapped onto the open act\'s palette, and commit it. No size cap (unlike a canvas). Same reply and refusal shape as commit_canvas, plus two import-only refusals: a colour the act does not have, and an 8x8 cell mixing colours from two palette lines.' },
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: FAIL — `agent-handler.ts` does not handle the two new kinds. That is the next task.

- [ ] **Step 4: Commit**

```bash
git add src/shared/agent-protocol.ts src/main/editor-methods.ts
git commit -m "feat(agent): commit_canvas and import_art_sheet on the registry

One registry, so both MCP and Aether editor/* gain them together."
```

---

## Task 6: The two handler cases

**Files:**
- Modify: `src/renderer/agent/agent-handler.ts`
- Test: `src/renderer/agent/__tests__/agent-handler.art.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/agent/__tests__/agent-handler.art.test.ts
//
// The agent surface must refuse exactly what the UI refuses, and must not throw
// for anything a caller can act on. These plant the violation rather than
// trusting the guard — the discipline that caught three regressions in stages 1-4.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useClassicLevelStore } from '../../state/classicLevelStore';

beforeEach(() => {
  useClassicLevelStore.setState({ status: 'closed', doc: null, ref: null, reservedTiles: null } as never);
});

describe('commit_canvas', () => {
  it('throws when no act is open — a fault, not an answer', async () => {
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: 'sky' }))
      .rejects.toThrow(/no classic level is open/);
  });

  it('refuses a canvas name that is not safe as a path', async () => {
    useClassicLevelStore.setState({ status: 'ready', doc: {} as never } as never);
    await expect(handleAgentRequest({ kind: 'classic-commit-canvas', name: '../etc/passwd' }))
      .rejects.toThrow(/not a valid canvas name/);
  });
});

describe('import_art_sheet', () => {
  it('throws when no act is open', async () => {
    await expect(handleAgentRequest({ kind: 'classic-import-art-sheet', path: '/tmp/x.png' }))
      .rejects.toThrow(/no classic level is open/);
  });
});
```

Match the import name and call convention to `agent-handler.classic.test.ts` — read its first
30 lines and copy the harness it uses rather than inventing one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/agent/__tests__/agent-handler.art.test.ts`
Expected: FAIL — no case for `classic-commit-canvas`.

- [ ] **Step 3: Add the two cases**

In `src/renderer/agent/agent-handler.ts`, alongside the other `classic-*` cases, add:

```ts
    case 'classic-commit-canvas': {
      // No `requireClassicDoc()` here: `commitPixels` reads the doc itself via
      // commitContextFromStores and throws the same message. A second read would
      // be an unused local and a second copy of the guard.
      const dir = useClassicProjectStore.getState().dir;
      if (!dir) throw new Error('no project directory is open');
      // Name safety is loadCanvasFile's own guard (canvas-file.ts:120) and it
      // throws — which is right: a bad name is a fault, not a refusal.
      const loaded = await loadCanvasFile(dir, req.name);
      return commitPixels({
        pixels: loaded.doc.pixels,
        canvasPalette: loaded.doc.palette,
        gridOrigin: loaded.doc.gridOrigin,
        targets: req.targets,
        paletteResolution: req.paletteResolution,
        collision: req.collision,
        dryRun: req.dryRun,
      });
    }

    case 'classic-import-art-sheet': {
      const doc = requireClassicDoc();
      const bytes = new Uint8Array(await window.api.readBinaryFile(req.path, ''));
      const res = await sheetFromBytes(doc, bytes);
      if (!res.ok) {
        // An import refusal, like a commit refusal, is an ANSWER. Same shape, so
        // a caller handles both with one branch.
        return { ok: false, refusal: res.refusal, message: explainSheetRefusal(res.refusal),
                 resolution: 'Recolour the sheet, or widen the act palette, then import again.',
                 offers: [] };
      }
      // An imported sheet has no grid of its own — see CommitPlanInput.gridOrigin.
      return commitPixels({
        pixels: res.sheet.pixels,
        canvasPalette: res.sheet.palette,
        targets: req.targets,
        paletteResolution: req.paletteResolution,
        collision: req.collision,
        dryRun: req.dryRun,
      });
    }
```

Add the imports at the top of the file:

```ts
import { commitPixels } from './art-commit';
import { loadCanvasFile } from '../state/canvas-file';
import { sheetFromBytes, explainSheetRefusal } from '../../core/art/sheet-import';
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/renderer/agent/__tests__/agent-handler.art.test.ts && npx tsc --noEmit`
Expected: PASS, 3 tests; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/agent/agent-handler.ts src/renderer/agent/__tests__/agent-handler.art.test.ts
git commit -m "feat(agent): handle commit_canvas and import_art_sheet"
```

---

## Task 7: Registry conformance guards

The keystone claim — that MCP and Aether cannot drift — is true by construction and currently unasserted. The second test is the one that would actually rot: a registry line with no handler case fails only at call time.

**Files:**
- Create: `src/main/__tests__/registry-conformance.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/main/__tests__/registry-conformance.test.ts
//
// EDITOR_METHODS is consumed by the MCP server and by the Aether adapter so the
// two never drift (editor-methods.ts's header calls this the keystone). That was
// true by construction and asserted nowhere.
//
// The handler test is the load-bearing one: a registry entry whose `kind` has no
// case in agent-handler.ts type-checks fine and fails only when someone calls it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDITOR_METHODS } from '../editor-methods';
import { capabilities } from '../aether/adapter';

describe('registry conformance', () => {
  it('exposes every method on the Aether surface as editor/<name>', () => {
    const advertised = new Set(capabilities().methods);
    for (const m of EDITOR_METHODS) {
      expect(advertised.has(`editor/${m.name}`), `editor/${m.name} is not advertised`).toBe(true);
    }
  });

  it('has globally unique tool names — MCP registration requires it', () => {
    const names = EDITOR_METHODS.map((m) => m.name);
    expect(new Set(names).size, `duplicate tool name in ${names.join(', ')}`).toBe(names.length);
  });

  it('has a handler case for every method kind', () => {
    const src = readFileSync(join(__dirname, '../../renderer/agent/agent-handler.ts'), 'utf8');
    for (const m of EDITOR_METHODS) {
      expect(src.includes(`case '${m.kind}'`), `agent-handler.ts has no case for '${m.kind}'`).toBe(true);
    }
  });

  it('names every method in snake_case', () => {
    for (const m of EDITOR_METHODS) {
      expect(m.name, `'${m.name}' is not a snake_case tool name`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `npx vitest run src/main/__tests__/registry-conformance.test.ts`
Expected: PASS, 16 tests (4 plus the 12 parameterised refusals).

- [ ] **Step 3: PLANT a violation and prove each guard fires**

A guard no test has provoked is a guard we do not believe in. Do all four, one at a time,
**reverting each before starting the next**. Run `npx vitest run
src/main/__tests__/registry-conformance.test.ts` after each plant.

| # | Plant, in `src/main/editor-methods.ts` | Must fail with |
|---|---|---|
| 1 | Delete the `editor/`-advertised entry by removing `commit_canvas` from the array, then re-add it as a bare object missing from `capabilities()` — simplest version: temporarily filter it out inside `adapter.ts`'s `capabilities()` | `editor/commit_canvas is not advertised` |
| 2 | Duplicate the whole `set_colind` entry | `duplicate tool name in ...` |
| 3 | Change `commit_canvas`'s `kind` to `'classic-commit-canvas-x'` | `agent-handler.ts has no case for 'classic-commit-canvas-x'` |
| 4 | Change `commit_canvas`'s `name` to `'commitCanvas'` | `'commitCanvas' is not a snake_case tool name` |

Plant 4 exists because plants 1–3 cannot see a *renamed* tool: assertion 3 keys on `kind`, and
assertion 1 reads the same array the adapter does, so a rename stays self-consistent and silent.

Record the outcome of each plant in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/main/__tests__/registry-conformance.test.ts
git commit -m "test(main): the registry/MCP/Aether/handler triple cannot drift

Four guards, all planted and confirmed firing. The snake_case assertion was
added during planting: the other three all stay green through a rename,
because two of them read the same array and the third keys on \`kind\`."
```

---

## Task 8: Runtime proof under CDP

The node suite cannot see React or the real IPC, and this surface crosses that line throughout. Follow the shape of `scratchpad/commit-collision-harness.mjs`.

**Files:**
- Create: `scratchpad/art-agent-harness.mjs`

- [ ] **Step 1: Read the existing harness for the connection boilerplate**

Run: `sed -n '1,60p' scratchpad/commit-collision-harness.mjs`
Copy its CDP attach, `__dbg` access, and reporting conventions. Do not invent a second style.

- [ ] **Step 2: Write the harness**

It calls the tools **over the real `POST /aether` endpoint** (`mcp-server.ts:136`, default port
38473), not by importing the handler — the point is to exercise the transport, the Zod schemas,
and the IPC bridge.

```js
#!/usr/bin/env node
// STAGE 5: are the art tools actually reachable over the wire?
//
// The node suite proves the pure halves and guards the registry; none of it
// crosses the transport, the Zod layer, or the IPC bridge. This drives the BUILT
// app under xvfb over CDP against real s1disasm data and calls both tools the way
// an agent would — over POST /aether — then reads the result back out of the
// document through __dbg.classic.
//
// It REUSES canvas-cdp-harness.mjs for the app/project/canvas setup rather than
// reimplementing it; that harness's header records three defects that each
// produced a convincing FALSE result before being caught.
//
// ROW 6 IS THE ONE THAT WOULD REGRESS SILENTLY. A refusal must arrive as a
// JSON-RPC *result* carrying ok:false, not as a JSON-RPC *error*. Nothing in the
// node suite can see that distinction, because it is made by the adapter.
//
//   node scratchpad/art-agent-harness.mjs

import {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, drawArt, CANVAS_DIR,
} from './canvas-cdp-harness.mjs';
import { rmSync, existsSync, readdirSync } from 'node:fs';

const PORT = 38473;
const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
}

let nextId = 1;
/** One JSON-RPC call over the real Aether HTTP binding. Returns the whole envelope. */
async function rpc(method, params) {
  const res = await fetch(`http://127.0.0.1:${PORT}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${PORT}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

function clearCanvases() {
  if (!existsSync(CANVAS_DIR)) return;
  for (const f of readdirSync(CANVAS_DIR)) if (/^stage5-/.test(f)) rmSync(`${CANVAS_DIR}/${f}`);
}

const main = async () => {
  clearCanvases();
  const s = await session();
  await s.eval(INSTALL);
  await openProjectAndAct(s);

  // Pool counts straight from the document, so the harness never trusts the
  // reply it is checking.
  const pools = () => s.eval(`(() => {
    const d = window.__dbg.classic.doc();
    return { tiles: Math.floor(d.tiles.length / 32), blocks: d.blocks.length, chunks: d.chunks.length };
  })()`);

  // 1 -- discovery
  const init = await rpc('initialize', { protocolVersion: 1 });
  const methods = init.body.result?.methods ?? [];
  check(1, 'initialize advertises both art methods',
    methods.includes('editor/commit_canvas') && methods.includes('editor/import_art_sheet'),
    `saw ${methods.length} methods`);

  // A 256x256 drawing, saved under a known name.
  await openNewCanvasDialog(s);
  await fillDialog(s, { name: 'stage5-sheet', width: 256, height: 256 });
  await drawArt(s);
  await s.eval(`window.__dbg.canvas.save()`);
  await sleep(300);

  // 2 -- dryRun mutates nothing
  const before = await pools();
  const dry = await rpc('editor/commit_canvas', { name: 'stage5-sheet', dryRun: true });
  const afterDry = await pools();
  check(2, 'dryRun reports without mutating',
    dry.body.result?.ok === true && dry.body.result.applied === false
      && JSON.stringify(before) === JSON.stringify(afterDry),
    JSON.stringify({ before, afterDry }));

  // 3 -- the real commit, and the report matches the document
  const live = await rpc('editor/commit_canvas', { name: 'stage5-sheet' });
  const afterLive = await pools();
  const rep = live.body.result?.report;
  check(3, 'report.poolAfter matches the document',
    !!rep && rep.poolAfter.chunks === afterLive.chunks
      && rep.poolAfter.blocks === afterLive.blocks,
    JSON.stringify({ reported: rep?.poolAfter, actual: afterLive }));

  // 4 -- the appended ids name chunks that exist
  const ids = live.body.result?.appendedChunkIds ?? [];
  check(4, 'appendedChunkIds are real engine ids',
    ids.length > 0 && ids.every((id) => id >= 1 && id <= afterLive.chunks),
    `ids ${JSON.stringify(ids)} against ${afterLive.chunks} chunks`);

  // 5 -- the round trip those ids exist for
  const id = ids[0];
  await rpc('editor/set_layout_region', { plane: 'fg', x: 0, y: 0, chunkIds: [[id]] });
  const placed = await s.eval(`window.__dbg.classic.doc().layout.fg[0][0]`);
  check(5, 'set_layout_region accepts a returned id', placed === id, `placed ${placed}, wanted ${id}`);

  // 6 -- a refusal is a RESULT, not an error
  const refused = await rpc('editor/commit_canvas', {
    name: 'stage5-sheet',
    targets: [{ chunkFileIndex: 99999 }],
  });
  check(6, 'a refusal is a JSON-RPC result, not an error',
    refused.status === 200 && refused.body.error === undefined
      && refused.body.result?.ok === false && !!refused.body.result.message,
    JSON.stringify(refused.body).slice(0, 200));

  const passed = rows.filter((r) => r.pass).length;
  console.log(`\n${passed}/${rows.length}`);
  await s.close();
  process.exit(passed === rows.length ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });
```

Check the helper names against `canvas-cdp-harness.mjs`'s actual exports before running —
`openNewCanvasDialog`, `fillDialog` and `drawArt` are used by `commit-collision-harness.mjs`
and their signatures may differ from the calls above. Adapt the calls, not the assertions.

- [ ] **Step 3: Run it against the real app**

Run: `node scratchpad/art-agent-harness.mjs`
Expected: `6/6` pass.

- [ ] **Step 4: Commit**

```bash
git add scratchpad/art-agent-harness.mjs
git commit -m "test(runtime): the art tools over the real Aether transport

6/6. Includes the assertion that a refusal is a JSON-RPC result and not an
error — the one §4 decision that would regress silently."
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass. Baseline before this plan was 3125; expect ~3145.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 3: Re-run the runtime harnesses that touch commit**

Run: `node scratchpad/commit-collision-harness.mjs && node scratchpad/art-agent-harness.mjs`
Expected: 6/6 and 6/6. The first is the regression check — Task 2 changed a module the commit
path imports.

- [ ] **Step 4: Commit any fixes, then report**

Report the final test count, tsc status, build status, and both harness results. Do not claim
completion without those four numbers.

---

## Notes for the implementer

- **`classicLevelStore.ts:1354` drifts.** Task 3 adds 7 lines above it, so the `newEngineId = nextChunks.length` annotation moves to **1361**. Cite it from source at the time you write, not from this plan.
- **Do not widen `CommandResult`.** The appended engine ids are derived (Task 4), by design — see spec §4.1.
- **Do not modify `CommitPlanView.tsx`.** See spec §3.2; an earlier draft called for it and was wrong.
- **`paint_collision` is aeon's.** The classic collision tool is `set_block_collision` and is Plan B, a separate plan. Do not add it here.
- **The remaining §5.3 refusals are already covered at the planner tier** — `target-invalid` and `chunks-exhausted` in `classic-commit-plan.test.ts`, `cell-needs-two-lines` in `png-import.test.ts`. Task 4 asserts they SURVIVE the trip to the agent reply rather than re-proving they are raised.
- **DEFERRED (not done, deliberately): collapse `useEditableTileRange`.** Now that
  `editableTileRange` is exported (Task 3), the hook at `composer-shared.tsx:36`
  restates the same two null conditions and could become
  `useMemo(() => editableTileRange(), [ref, handle])`. This codebase refuses that
  duplication elsewhere ("never a second copy of the rule",
  `canvas-commit-model.ts:222`), so it is worth doing — but the hook feeds
  `TileTab`, `BlockTab` and `CommitPlanView`, and a reactivity regression there is
  invisible to the node suite. Out of scope for this plan; needs its own change
  with UI verification.
- **A refusal is never a throw.** If you find yourself writing `throw` for something the caller could fix by changing an argument, it belongs in the refusal shape instead.
