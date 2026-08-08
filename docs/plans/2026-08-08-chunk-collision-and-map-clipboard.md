# Chunk-Carried Collision + Map Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aurora chunks carry real dual-plane 16-bit collision; stamping places art+collision atomically; a new marquee clipboard copies/pastes map regions (art + collision, or either alone); collision paint defaults to "just here"; legacy collision encodings retired; MCP/Aether surface updated.

**Architecture:** All code changes in the **Aurora repo** (`/home/volence/sonic_hacks/aurora/`, Electron/TS, vitest, `npm test`). Core logic goes in `src/core/` as pure testable modules (clipboard, stamp builder, migration); UI wiring in `MapViewport.tsx`/`ComposerCanvas.tsx` consumes them. aeon gets ONE doc-only commit. Spec: `docs/specs/2026-08-08-chunk-collision-and-map-clipboard-design.md` (APPROVED); base design: `aeon/docs/superpowers/specs/2026-07-02-editor-collision-authoring-design.md`.

**Tech stack:** TypeScript, zustand stores, vitest. Collision cell word = `collision-cell-word.ts` (shape 9:0, xflip 10, yflip 11, solidity 13:12; air = bare 0).

**Standing rules:**
- **Do NOT edit `aeon/tools/ojz_strip_gen.py` or anything under `aeon/games/sonic4/data/editor/ojz/**`** — daemon-watched; this design needs zero aeon code changes. aeon is touched read-only until Task 12 (doc-only commit).
- Branch `feat/chunk-collision` in aurora; commit per green task; never add a Co-Authored-By trailer.
- File anchors below were verified 2026-08-08 against master (`0c99ac4`). If a hunk doesn't match, re-read the file — don't force the edit.
- Attr-set cap: distinct painted (shape,flip,solidity) combos per aeon build must stay ≤255. Nothing here changes that math; keep it in mind for Task 12's verification.

**Verified codebase facts (2026-08-08) the plan builds on:**
- `BatchCommand` already exists (`src/core/editing/commands.ts:153-156`, apply/undo in `history.ts:72-74,188-190`) — the atomic-undo primitive. No new primitive needed.
- Section collision planes: `Section.collisionEdit/collisionEditB: Uint16Array(65536)` (`s4-types.ts:90,93`), lazily seeded from `engineCollision` via `resolvePlaneWords` (`MapViewport.tsx:536-541`).
- Stamp handler `MapViewport.tsx:748-794` writes ONLY `set-tiles` (nametable + legacy nibble). Paint handler `paintCollisionCell` `MapViewport.tsx:531-594`; `justHere` latched from `e.altKey` at `:800`.
- `collisionPaintTargets` (`src/core/collision/collision-paint.ts:15-35`): brush-1 default = propagate to matching blocks; `justHere` = Alt.
- Map keydown handler `MapViewport.tsx:435-451`: `c`/`s` guard `!e.ctrlKey`; **`v` does not** — Task 8 adds the guard.
- Chunk save path: `ArtMode.tsx:125-207` (`sliceForSave` → `set-chunk` or `addChunks`); composer doc = `ComposerDoc` (`src/core/art/composer-buffer.ts`), cells carry legacy `coll` nibble; composer collision tool = `ComposerCanvas.tsx:276-295` writing `cellAt(doc,cx,cy).coll`.
- Chunk import: `src/core/formats/chunk-mappings.ts` (`blockRefToCollision` nibble at `:90-92`).
- Save/load: `useProject.ts:151-206` (per-section writes incl. `.coll.bin` at `:161-163`), chunk library JSON `:209-221` and `:589-620`, `.collattr` load `:444-455`. `loadCollisionProfiles` runs AFTER `loadFullProject` (`:76-86`) — Task 2 reorders this so migration can resolve the full-block shape.
- Agent surface: `editor-methods.ts` (zod schemas, `entrySchema.coll` at `:17`), `agent-handler.ts` `save-chunk`/`stamp-chunk` at `:259-301` (stamp delegates to paint-region).
- MCP method list is shared by MCP + Aether (`editor-methods.ts:4-9`) — one edit covers both.

---

### Task 1: Branch + baseline

- [ ] **Step 1:** `cd /home/volence/sonic_hacks/aurora && git checkout -b feat/chunk-collision`
- [ ] **Step 2:** `npm test` — record the green baseline (all suites must pass before starting; if the baseline is red, STOP and report).

### Task 2: ChunkDef collision planes + library round-trip + legacy migration

**Files:**
- Modify: `src/core/model/s4-types.ts` (ChunkDef, createChunkDef)
- Create: `src/core/collision/full-block-shape.ts`
- Create: `src/core/model/chunk-migrate.ts`
- Modify: `src/renderer/hooks/useProject.ts` (save `:209-221`, load `:589-620`, profile-load reorder `:76-86`)
- Test: `test/model/chunk-collision-planes.test.ts`

- [ ] **Step 1: Write failing tests** (`test/model/chunk-collision-planes.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { createChunkDef } from '../../src/core/model/s4-types';
import { migrateLegacyChunkCollision } from '../../src/core/model/chunk-migrate';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

const FB = 7; // stand-in full-block shape id for tests

describe('ChunkDef collision planes', () => {
  it('createChunkDef yields zero-filled word planes at (w/2)*(h/2)', () => {
    const c = createChunkDef('x', 'X', 16, 16);
    expect(c.collisionA).toBeInstanceOf(Uint16Array);
    expect(c.collisionA.length).toBe(64);
    expect(c.collisionB.length).toBe(64);
    expect([...c.collisionA].every(w => w === 0)).toBe(true);
  });

  it('legacy byte plane migrates: solidAll wins, then solidTop, else air; B mirrors A', () => {
    const c = createChunkDef('x', 'X', 4, 4); // 2x2 cells
    const legacy = new Uint8Array(16);
    // cell(0,0): tiles 0,1,4,5 — solidAll (bit0)
    legacy[0] = legacy[1] = legacy[4] = legacy[5] = 1;
    // cell(1,0): solidTop (bit1)
    legacy[2] = legacy[3] = legacy[6] = legacy[7] = 2;
    // cell(0,1): both bits — solidAll wins
    legacy[8] = legacy[9] = legacy[12] = legacy[13] = 3;
    // cell(1,1): 0 — air
    migrateLegacyChunkCollision(c, legacy, FB);
    const all = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'all' });
    const top = packCollisionCell({ shape: FB, xFlip: false, yFlip: false, solidity: 'top' });
    expect([...c.collisionA]).toEqual([all, top, all, 0]);
    expect([...c.collisionB]).toEqual([...c.collisionA]);
  });

  it('migration is a no-op when word planes are already populated (idempotent load)', () => {
    const c = createChunkDef('x', 'X', 4, 4);
    c.collisionA[0] = 0x1234;
    migrateLegacyChunkCollision(c, new Uint8Array(16).fill(1), FB);
    expect(c.collisionA[0]).toBe(0x1234);
    expect(c.collisionA[1]).toBe(0);
  });
});
```

- [ ] **Step 2:** `npm test -- chunk-collision-planes` → FAIL (fields/module absent).
- [ ] **Step 3: Implement.**

`s4-types.ts` — extend `ChunkDef` (keep the legacy `collision` field for now; it dies in Task 10):

```ts
export interface ChunkDef {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;
  collision: Uint8Array;      // LEGACY nibble plane — read for migration only (Task 10 deletes)
  /** Dual-plane authored collision: one 16-bit cell word (collision-cell-word.ts)
   *  per 16px cell — (widthTiles/2)*(heightTiles/2) words. Same encoding as
   *  Section.collisionEdit/collisionEditB, so stamps copy verbatim. */
  collisionA: Uint16Array;
  collisionB: Uint16Array;
}
```

`createChunkDef` adds `collisionA: new Uint16Array((widthTiles >> 1) * (heightTiles >> 1))`, same for `collisionB`.

`src/core/collision/full-block-shape.ts`:

```ts
import type { CollisionProfileSet } from './collision-model';

/** The base-bank shape whose 16 height columns are all full (16px) — the plain
 *  solid block. Resolved from the loaded profile set, never hardcoded (the S&K
 *  import owns the ordering). Returns 0 (air) when no profiles are loaded —
 *  callers must treat 0 as "cannot migrate/seed solid cells". */
export function findFullBlockShapeId(profiles: CollisionProfileSet | null): number {
  if (!profiles) return 0;
  for (let i = 1; i < profiles.profiles.length; i++) {
    const p = profiles.profiles[i];
    if (p && p.heights.length === 16 && p.heights.every(h => h >= 16)) return i;
  }
  return 0;
}
```

(Research within this step: open `src/core/collision/collision-model.ts` and `src/renderer/hooks/load-collision.ts` to confirm the exact `CollisionProfileSet` shape — field names `profiles`/`heights` must match what `loadCollisionProfiles` returns; adjust the accessor, not the algorithm.)

`src/core/model/chunk-migrate.ts`:

```ts
import type { ChunkDef } from './s4-types';
import { packCollisionCell } from '../collision/collision-cell-word';

/** Seed the word planes from the legacy per-tile nibble plane (bit0 solidAll,
 *  bit1 solidTop; solidAll wins). Sampling: top-left tile of each 2x2 cell (the
 *  import wrote all four tiles identically). No-op if any plane word is already
 *  set (already-migrated chunk) or fullBlockShape is 0 (profiles missing). */
export function migrateLegacyChunkCollision(
  chunk: ChunkDef, legacy: Uint8Array, fullBlockShape: number,
): boolean {
  if (fullBlockShape === 0) return false;
  if (chunk.collisionA.some(w => w !== 0) || chunk.collisionB.some(w => w !== 0)) return false;
  const cw = chunk.widthTiles >> 1, ch = chunk.heightTiles >> 1;
  let wrote = false;
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const v = legacy[(cy * 2) * chunk.widthTiles + cx * 2] ?? 0;
      if (v === 0) continue;
      const word = packCollisionCell({
        shape: fullBlockShape, xFlip: false, yFlip: false,
        solidity: (v & 1) ? 'all' : 'top',
      });
      chunk.collisionA[cy * cw + cx] = word;
      chunk.collisionB[cy * cw + cx] = word;
      wrote = true;
    }
  }
  return wrote;
}
```

`useProject.ts`:
1. **Reorder profile load:** move the `loadCollisionProfiles` call (currently `:82-86`, after `loadFullProject`) to BEFORE `const project = await loadFullProject(config)` and pass the result into `loadFullProject(config, collisionProfiles)`. Keep the `setCollisionProfiles` store write where it is.
2. **Chunk library save** (`:210-217`): add `collisionA: Array.from(chunk.collisionA)`, `collisionB: Array.from(chunk.collisionB)` to the serialized object.
3. **Chunk library load** (`:596-607`): parse optional `collisionA`/`collisionB` number arrays into `Uint16Array` (absent → zero-filled at the right size), then run migration:

```ts
const fullBlock = findFullBlockShapeId(collisionProfiles);
for (const chunk of chunkLibrary) {
  if (migrateLegacyChunkCollision(chunk, chunk.collision, fullBlock)) {
    console.log(`[load] chunk ${chunk.id}: legacy collision migrated to word planes`);
  }
}
```

- [ ] **Step 4:** `npm test` → green (baseline + new).
- [ ] **Step 5:** `git add -A && git commit -m "feat(model): ChunkDef carries dual-plane 16-bit collision; legacy nibble migrates on load"`

### Task 3: Chunk import seeds real collision words

**Files:**
- Modify: `src/core/formats/chunk-mappings.ts`
- Test: `test/formats/chunk-mappings-collision.test.ts` (extend existing import tests if present — check `test/formats/` first)

- [ ] **Step 1: Failing test.** Build a minimal uncompressed fixture through the existing test helpers (check how current chunk-mappings tests construct Kosinski input — reuse their fixture builder; if none exists, compress a tiny buffer with the repo's Kosinski compressor in `src/core/formats/`). Assert: a block ref with `solidAll` yields `collisionA` cell = `packCollisionCell({shape: FB, ..., solidity:'all'})`, `solidTop`-only yields `'top'`, no bits yields 0; `collisionB` mirrors A (sonic_hack donor data has no per-path split — note this in the test).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** `importChunks` gains a `fullBlockShape: number` parameter (callers pass `findFullBlockShapeId(...)`; grep for `importChunks(` call sites — expected: `ChunkSheetImporter.tsx` and/or config load — and thread the loaded profile set through). Add alongside the legacy nibble write:

```ts
function blockRefToCollisionWord(ref: BlockRef, fullBlockShape: number): number {
  if (fullBlockShape === 0 || (!ref.solidTop && !ref.solidAll)) return 0;
  return packCollisionCell({
    shape: fullBlockShape, xFlip: false, yFlip: false,
    solidity: ref.solidAll ? 'all' : 'top',
  });
}
```

and in the block loop (`chunk-mappings.ts:114-134`), one word per block cell: `collisionA[blockRow * BLOCKS_PER_CHUNK + blockCol] = word` (planes sized 8×8=64), `collisionB` mirrors. Push both planes onto the ChunkDef literal at `:137-144`.
- [ ] **Step 4:** `npm test` → green.
- [ ] **Step 5:** `git commit -am "feat(import): chunk import seeds collision word planes from block-ref solidity"`

### Task 4: set-chunk carries word planes; ComposerDoc gains collision planes

**Files:**
- Modify: `src/core/editing/commands.ts` (`SetChunkCommand`), `src/core/editing/history.ts` (`set-chunk` apply/undo)
- Modify: `src/core/art/composer-buffer.ts` (`ComposerDoc`, `createDoc`, `docFromChunk`)
- Modify: `src/renderer/components/art/ArtMode.tsx` (`handleSave` `:125-207`)
- Test: `test/editing/set-chunk-planes.test.ts`

- [ ] **Step 1: Failing test:** `SetChunkCommand` with `oldCollisionA/newCollisionA/oldCollisionB/newCollisionB: Uint16Array` applies to `chunk.collisionA/B` and undoes exactly; `docFromChunk` copies chunk planes onto `doc.collisionA/B`; `createDoc` zero-fills them at (w/2)*(h/2).

```ts
import { describe, it, expect } from 'vitest';
import { EditHistory } from '../../src/core/editing/history';
import { createChunkDef } from '../../src/core/model/s4-types';
import { createDoc, docFromChunk } from '../../src/core/art/composer-buffer';

describe('set-chunk with collision planes', () => {
  it('applies and undoes both word planes', () => {
    const chunk = createChunkDef('c1', 'C1', 16, 16);
    const level = { sections: [], chunkLibrary: [chunk] };
    const h = new EditHistory();
    const newA = new Uint16Array(64); newA[3] = 0x9001;
    h.execute({
      type: 'set-chunk', description: 't', sectionIndex: -1, chunkId: 'c1',
      oldNametable: new Uint16Array(256), newNametable: new Uint16Array(256),
      oldCollisionA: new Uint16Array(64), newCollisionA: newA,
      oldCollisionB: new Uint16Array(64), newCollisionB: new Uint16Array(64),
    }, level);
    expect(chunk.collisionA[3]).toBe(0x9001);
    h.undo(level);
    expect(chunk.collisionA[3]).toBe(0);
  });

  it('docFromChunk carries the planes; createDoc zero-fills them', () => {
    const chunk = createChunkDef('c1', 'C1', 16, 16);
    chunk.collisionA[5] = 0x1042;
    const doc = docFromChunk(chunk);
    expect(doc.collisionA[5]).toBe(0x1042);
    expect(createDoc(16, 16).collisionA.length).toBe(64);
  });
});
```

- [ ] **Step 2:** Run → FAIL (type errors are the failure — vitest + tsc).
- [ ] **Step 3: Implement.**
  - `SetChunkCommand`: replace `oldCollision/newCollision: Uint8Array` with the four `Uint16Array` plane fields (grep every constructor site — `ArtMode.tsx:167-176` is the known one — and fix in the same edit; while the legacy `ChunkDef.collision` field still exists, `set-chunk` simply stops touching it).
  - `history.ts` `set-chunk` apply (`:90-97`): `chunk.collisionA = new Uint16Array(cmd.newCollisionA); chunk.collisionB = new Uint16Array(cmd.newCollisionB);` (drop the `chunk.collision` write); undo mirrors with `old*`.
  - `composer-buffer.ts`: `ComposerDoc` gains `collisionA/collisionB: Uint16Array`; `createDoc` zero-fills `(widthTiles >> 1) * (heightTiles >> 1)`; `docFromChunk` copies `new Uint16Array(chunk.collisionA)` / B.
  - `ArtMode.tsx handleSave`: `set-chunk` passes `oldCollisionA: new Uint16Array(chunk.collisionA), newCollisionA: new Uint16Array(o.doc.collisionA)` (and B); the new-chunk branch (`:179-187`) sets `collisionA: new Uint16Array(o.doc.collisionA)` etc. on the created ChunkDef. `sliceForSave` is untouched (collision no longer derives from cells).
- [ ] **Step 4:** `npm test` → green.
- [ ] **Step 5:** `git commit -am "feat(art): set-chunk and composer docs carry dual-plane collision words"`

### Task 5: Composer collision tool paints real cell words

**Files:**
- Modify: `src/renderer/components/art/ComposerCanvas.tsx` (`applyTileCell` `:276-295`, HUD `:417-451`)
- Test: `test/art/composer-collision-paint.test.ts` (pure logic extracted below)
- Create: `src/core/art/composer-collision.ts`

- [ ] **Step 1: Research.** Read `ComposerCanvas.tsx:250-460` in full: how `applyTileCell` receives cx/cy (8px tile coords), how the HUD paints per-cell text, and whether the doc is marked dirty via a helper. Read `CollisionPalette.tsx` to see which editorStore fields the map paint uses (`selectedCollisionProfile/EntryFlipX/XFlip/YFlip/Solidity`, `collisionPaintPlane` — same fields drive the composer paint so the ONE palette works in both modes).
- [ ] **Step 2: Failing test** for the pure helper:

```ts
// src/core/art/composer-collision.ts
import type { ComposerDoc } from './composer-buffer';

/** Write one packed cell word into a composer doc plane at 8px-tile coords
 *  (tx,ty) — mapped to the 16px cell (tx>>1, ty>>1). Returns true if changed. */
export function paintDocCollision(
  doc: ComposerDoc, plane: 'a' | 'b', tx: number, ty: number, word: number,
): boolean {
  const cw = doc.widthTiles >> 1;
  const idx = (ty >> 1) * cw + (tx >> 1);
  const arr = plane === 'b' ? doc.collisionB : doc.collisionA;
  if (arr[idx] === word) return false;
  arr[idx] = word;
  return true;
}
```

Test: painting tile (3,2) of a 16×16 doc writes cell index `1*8+1`; plane 'b' targets `collisionB`; repeat write returns false.
- [ ] **Step 3:** Run → FAIL; implement the module; green.
- [ ] **Step 4: Wire the canvas.** In `applyTileCell` (`ComposerCanvas.tsx:294`), replace the nibble write with: build the packed word exactly as `MapViewport.paintCollisionCell` does (`MapViewport.tsx:550-555` — shape 0 → `AIR_CELL`, else `packCollisionCell` with `effectiveXFlip(...)`), read the plane from `useEditorStore.getState().collisionPaintPlane`, call `paintDocCollision`, mark the doc dirty on true. Update the HUD (`:431-436`) to read the CELL word (`doc.collisionA/B[(cy>>1)*cw + (cx>>1)]`), render nonzero words with the existing nonzero style, and the status chip (`:450`) to show the selected shape id + solidity instead of `selectedCollisionType`. Extract the word-building snippet into a small shared function if it can be lifted without dragging store types into core — otherwise duplicate the 5 lines and note the pairing in a comment.
- [ ] **Step 5:** Manual check: `npm run dev` (or the repo's dev script — check `package.json`), open a chunk, paint collision in the composer, save, re-open → words persist. `npm test` → green.
- [ ] **Step 6:** `git commit -am "feat(art): composer collision tool paints packed cell words on chunk planes"`

### Task 6: Stamps place art + collision atomically

**Files:**
- Create: `src/core/editing/map-stamp.ts`
- Modify: `src/renderer/components/MapViewport.tsx` (stamp handler `:748-794`)
- Modify: `src/renderer/agent/agent-handler.ts` (`stamp-chunk` `:284-301`)
- Test: `test/editing/map-stamp.test.ts`

- [ ] **Step 1: Failing tests** against the pure builder:

```ts
// src/core/editing/map-stamp.ts — shape (implement in Step 3)
import type { ChunkDef, Section } from '../model/s4-types';
import type { BatchCommand } from './commands';

/** Build the atomic stamp command: chunk nametable + both collision planes
 *  written over the footprint at (baseCol,baseRow) tile coords (assumed
 *  chunk-aligned by the caller, as today). The chunk is AUTHORITATIVE for its
 *  footprint: air words/tiles clear the destination. artOnly=true skips the
 *  collision children. Returns null when nothing changes. Requires the
 *  section's collisionEdit planes to be seeded (caller seeds like
 *  paintCollisionCell does). */
export function buildStampCommand(args: {
  chunk: ChunkDef; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; artOnly: boolean; description: string;
}): BatchCommand | null;
```

Tests: (a) stamping a chunk with a solid cell writes that word into `collisionEdit` AND `collisionEditB` per the chunk's planes at the mapped cell (chunk cell (cx,cy) → section cell (baseCol/2+cx, baseRow/2+cy)); (b) a chunk air cell CLEARS a previously-solid destination cell; (c) ONE `history.undo` restores nametable + both planes; (d) `artOnly` leaves both planes untouched; (e) footprint clamps at section edge (chunk hanging off the right edge writes only in-bounds cells). Build sections via `createSection` + manually seeded `collisionEdit = new Uint16Array(65536)` etc.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `buildStampCommand`: one `set-tiles` child (nametable entries diffed as today, `oldColl/newColl` passthrough of the legacy plane until Task 10 removes those fields) + one `set-collision-edit` child per plane (entries diffed; include zero-words so air clears — diffing means "skip only when old === new", never "skip air"). Wrap non-empty children in `{type:'batch', description, sectionIndex, commands}`; return null if all children empty.
- [ ] **Step 4: Wire MapViewport.** Replace the body of the `stamp-chunk` branch (`:748-794`): seed the section planes (copy the lazy-seed lines from `paintCollisionCell:536-541`), call `buildStampCommand` with `artOnly: e.altKey`, `executeCommand(cmd, level)`, keep `sectionRenderer.markDirty` with the nametable indices (collect them from the set-tiles child). Alt = "stamp art only" — add that to the stamp hint in `src/renderer/shell/MapStatusBar.tsx:13`.
- [ ] **Step 5: Wire agent-handler.** Rewrite `case 'stamp-chunk'` to stop delegating to paint-region: resolve the section, snap x/y as the UI does (`Math.floor(x / chunk.widthTiles) * chunk.widthTiles`? — NO: the agent passes explicit tile coords; keep them, but validate bounds and require even x/y, erroring otherwise so art and collision stay cell-aligned), seed planes, call `buildStampCommand({... artOnly: false ...})`, execute. Return `{stamped: true}` plus the budget summary like paint-region does.
- [ ] **Step 6:** `npm test` → green. `git commit -am "feat(map): stamps place art + dual-plane collision atomically; Alt stamps art only"`

### Task 7: Marquee tool + clipboard copy

**Files:**
- Create: `src/core/editing/map-clipboard.ts`
- Modify: `src/renderer/state/editorStore.ts` (tool union `:8-10`, new state)
- Modify: `src/renderer/components/MapViewport.tsx` (keydown `:435-451`, mouse handlers, overlay draw)
- Modify: `src/renderer/shell/MapToolDock.tsx`, `src/renderer/shell/MapStatusBar.tsx`
- Test: `test/editing/map-clipboard.test.ts`

- [ ] **Step 1: Failing tests** for the pure core:

```ts
// src/core/editing/map-clipboard.ts — types + copy (implement in Step 3)
export interface MapClipboard {
  widthTiles: number;   // even, snapped to 16px blocks
  heightTiles: number;  // even
  nametable: Uint16Array;    // widthTiles*heightTiles, row-major
  collisionA: Uint16Array;   // (w/2)*(h/2)
  collisionB: Uint16Array;
}
export type PasteLayers = 'both' | 'art' | 'collision';

/** Snap a tile-coord drag rect to 16px block boundaries (round OUT so the
 *  marquee always covers what was dragged), clamped to the section. */
export function snapMarquee(c0: number, r0: number, c1: number, r1: number):
  { col: number; row: number; w: number; h: number };

/** Capture art + both collision planes from a section region (tile coords,
 *  pre-snapped). Missing/unseeded collision planes read as air. */
export function copyFromSection(section: Section, col: number, row: number,
  w: number, h: number): MapClipboard;
```

Tests: (a) `snapMarquee(3,3,4,4)` → `{col:2,row:2,w:4,h:4}`; reversed drag corners normalize; clamp at 255; (b) `copyFromSection` captures the nametable rect row-major and the (w/2)×(h/2) cell words from both planes; unseeded planes (`collisionEdit` null) → air words.
- [ ] **Step 2:** Run → FAIL; **Step 3:** implement; green.
- [ ] **Step 4: Store + tool.** `editorStore.ts`: add `'marquee'` to `EditorTool`; add state `marquee: { sectionIndex: number; col: number; row: number; w: number; h: number } | null`, `mapClipboard: MapClipboard | null`, `pasteLayers: PasteLayers` (default `'both'`), with setters. Keydown in MapViewport: `case 'm': setTool('marquee')`; fix `case 'v':` to `if (!e.ctrlKey)` (Task 8 uses Ctrl+V).
- [ ] **Step 5: Wire marquee drag.** In `handleMouseDown`/`handleMouseMove`/`handleMouseUp` for tool `'marquee'`: record drag start tile, update `marquee` with `snapMarquee` on move (single-section: clamp to the drag-start section), draw the marquee rect in the overlay pass (research: find where the collision hover preview / selection outlines draw — reuse that canvas layer; a 2px dashed stroke + 10% fill). `Ctrl+C` in keydown: if `marquee` set, `setMapClipboard(copyFromSection(...))` + toast `Copied WxH blocks`. Add the tool to `MapToolDock.tsx` (icon: reuse an existing select-style icon) and a `MapStatusBar.tsx` hint (`drag to select · Ctrl+C copy · Ctrl+V paste · S save as chunk`).
- [ ] **Step 6:** `npm test` green; manual dev-run sanity (drag, copy toast). `git commit -am "feat(map): marquee region tool with art+collision clipboard copy"`

### Task 8: Paste — ghost preview, layer modes, cross-section

**Files:**
- Modify: `src/core/editing/map-clipboard.ts` (add `buildPasteCommand`)
- Modify: `src/renderer/components/MapViewport.tsx`
- Modify: `src/renderer/components/art/ArtMode.tsx` + `ComposerCanvas.tsx` (composer copy/paste)
- Test: `test/editing/map-paste.test.ts`

- [ ] **Step 1: Failing tests** for `buildPasteCommand`:

```ts
/** Build the atomic paste command at (baseCol,baseRow) tile coords (snapped to
 *  even by the caller). Clipboard is authoritative over its footprint in the
 *  pasted layers (air clears); out-of-bounds cells are dropped. Same child
 *  structure as buildStampCommand. Returns null when nothing changes. */
export function buildPasteCommand(args: {
  clip: MapClipboard; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; layers: PasteLayers; description: string;
}): BatchCommand | null;
```

Tests: (a) round-trip: copy a region → paste into an empty section → nametable + both planes byte-identical over the footprint; (b) one undo restores everything; (c) `layers:'art'` leaves collision planes untouched, `layers:'collision'` leaves the nametable untouched; (d) clipboard air clears destination solid cells in pasted layers only; (e) paste into a DIFFERENT section object works (cross-section — the clipboard has no section identity); (f) edge clamp.
- [ ] **Step 2:** FAIL → **Step 3:** implement (share the entry-diffing internals with `buildStampCommand` — extract a common `diffRegionChildren(...)` helper inside `map-stamp.ts`/`map-clipboard.ts` rather than duplicating; both modules live in `src/core/editing/`, one can import the other) → green.
- [ ] **Step 4: Wire map paste mode.** `Ctrl+V` with a non-null `mapClipboard` enters paste mode (local state in MapViewport: `pasting: boolean`): on mouse move, compute hovered section + even-snapped (baseCol,baseRow) and draw the ghost — the clipboard footprint as a translucent fill + outline, PLUS per-cell shading where clipboard collision is nonzero when the collision overlay is visible (footprint-only ghost; full art preview is out of scope — the spec's ghost is a placement aid, not a render). Click commits: seed planes, `buildPasteCommand` with `useEditorStore.getState().pasteLayers`, execute, `markDirty` the nametable indices, STAY in paste mode (repeat pastes) until Escape. Add a small paste-layer toggle (`both/art/collision`) — research `App.tsx:96-100` for where per-tool option bars mount (the stamp-chunk options block) and mount a matching three-button group for marquee/paste; held modifiers at commit time override: Alt = art only, Shift = collision only.
- [ ] **Step 5: Composer integration.** In Art mode with an open chunk doc: `Ctrl+C` copies the WHOLE open chunk (`nametable` from `sliceForSave`? NO — copy the doc's CURRENT saved-form is complex with locals; copy from the underlying `ChunkDef` when `chunkId !== null`, via `copyChunkToClipboard(chunk)` — a thin adapter building a `MapClipboard` from the chunk's nametable + planes); `Ctrl+V` pastes the clipboard's collision planes onto the open doc (`layers` respected; art paste into a doc is out of scope — art still comes from stamps/save; document this in the shortcut hint). Implement `applyClipboardCollisionToDoc(doc, clip)` in `composer-collision.ts` (size-clamped at doc bounds) + a test (paste a 2×2-cell clipboard onto a 16×16 doc → cells 0..3 match; oversized clipboard clamps).
- [ ] **Step 6:** `npm test` green; manual: copy map region → paste in another section; copy chunk → paste collision onto another chunk. `git commit -am "feat(map): clipboard paste with ghost preview, art/collision layer modes, composer collision paste"`

### Task 9: Collision paint defaults to "just here"

**Files:**
- Modify: `src/core/collision/collision-paint.ts:15-35`, `src/renderer/components/MapViewport.tsx:796-805`, `src/renderer/components/CollisionPalette.tsx` (hint text — grep `Alt`/`just here`)
- Test: `test/collision/collision-paint-targets.test.ts` (extend the existing collision-paint test if present — check `test/collision/`)

- [ ] **Step 1: Failing test.** Rename the flag to `propagate` (explicit opt-in): `collisionPaintTargets({ ..., propagate: false })` at brush 1 returns only the clicked cell; `propagate: true` returns the matching-block set; brush > 1 unchanged (positional area, `propagate` ignored).
- [ ] **Step 2:** FAIL → **Step 3:** implement: in `collision-paint.ts` replace `justHere: boolean` with `propagate: boolean` and swap the brush-1 branch (`:33-34`) to `if (!propagate) return { primary, all: [primary] };`. In `MapViewport.tsx:800` latch `paintPropagate.current = e.altKey` (Alt now = propagate-to-matching) and thread it through `paintCollisionCell` (rename the param + the `:562` guard condition + the `:573-574` label strings: default label `'this block'`, Alt label `N matching blocks`). Update `CollisionPalette.tsx` hint text to "paints this block · hold Alt to apply to all matching blocks". Fix the hover-preview call site (grep `collisionPaintTargets(` — the preview shares the function; the rename makes the compiler find every site).
- [ ] **Step 4:** `npm test` green. Manual: default paint touches one block; Alt propagates. `git commit -am "feat(collision): paint defaults to just-here; propagation is the Alt modifier"`

### Task 10: Legacy retirement

**Files:**
- Modify: `src/core/model/s4-types.ts` (delete `SectionTileGrid.collision`, `ChunkDef.collision`), `src/core/editing/commands.ts` (delete `SetCollisionCommand`; strip `oldColl/newColl` from `SetTilesCommand`), `src/core/editing/history.ts`, `src/core/art/composer-buffer.ts` (delete `ComposerCell.coll`, `StampSpec.coll`, `sliceForSave` collision output), `src/renderer/hooks/useProject.ts` (drop `.coll.bin` write `:161-163` + read `:404-406,435` + `parseCollision` import), `src/core/formats/s4-collision.ts` (delete file), export path (`src/core/export/index.ts` — drop the `.coll.bin` section binary), every `tileGrid.collision` / `chunk.collision` / `.coll` reader the compiler + grep find
- Test: `test/editing/legacy-retirement.test.ts` + the whole suite as the real check

- [ ] **Step 1: Research (read-only, aeon).** `grep -rn "coll.bin" /home/volence/sonic_hacks/aeon/tools/ /home/volence/sonic_hacks/aeon/games/sonic4/` — confirm nothing consumes the editor's `.coll.bin` (the 2026-08-08 audit says collision comes only from `.collattr*`; verify before deleting the writer). If ANYTHING consumes it, STOP and report instead of deleting.
- [ ] **Step 2: Failing test:** saving-shaped serialization no longer produces `.coll.bin` content — test at the unit level: `serializeCollision` module is gone (import fails → restructure test to assert `useProject` save-path helpers), and loading a project directory WITH a stray `.coll.bin` still loads (write the load-tolerance test against `loadFullProject`'s section loop if it's exported; if it isn't exportable cheaply, cover via: `parseNametable` path no longer requires the paired `.coll.bin` read — move the nametable read out of the joint try block).
- [ ] **Step 3: Implement.** Delete in one sweep, compiler-guided: remove the fields/commands/file, fix every type error. Known knock-on sites (from the 2026-08-08 audit): `MapViewport.tsx` paint-tile/paint-block/stamp entries (`oldColl/newColl` — entries become `{index, oldNt, newNt}`), `agent-handler.ts` paint-region (`spec.coll` → ignored; see Task 11 for the schema), `ComposerCanvas.tsx` HUD (already reads planes after Task 5), `importChunks` legacy nibble write + `blockRefToCollision` (delete; keep only the word path — and drop the `fullBlockShape===0` early-return only if profiles are guaranteed; they are not, keep it), `chunk-migrate.ts` (`ChunkDef.collision` gone → migration reads the RAW parsed JSON array instead: move the legacy read into `useProject`'s chunk-library parse, passing the plain `number[]` to `migrateLegacyChunkCollision(chunk, legacyBytes, fb)`), the chunk-library serializer (stop writing `collision`), `s4-strips.ts` seeding at `useProject.ts:435` (drop the `tileGrid.collision` seed line only — `engineCollision` stays). Loaders must TOLERATE old files/fields on disk: stray `.coll.bin` ignored; chunk JSON `collision` array read only as migration input.
- [ ] **Step 4:** `npm test` → green (this is the task where the suite earns its keep). Manual dev-run: open the OJZ project, paint, stamp, save, re-open.
- [ ] **Step 5:** Status banners (doc edits, aurora repo): prepend to `docs/specs/2026-06-20-collision-authoring-v2-block-keyed-design.md`, `2026-06-20-collision-authoring-design.md`, `2026-06-19-collision-tooling-design.md`, `2026-06-21-sk-collision-import-design.md`: `> **STATUS (2026-08-08):** superseded/completed by docs/specs/2026-08-08-chunk-collision-and-map-clipboard-design.md — chunks now carry dual-plane collision; legacy nibble encodings are deleted.`
- [ ] **Step 6:** `git commit -am "refactor(editor)!: legacy collision encodings retired — collattr word planes are the single model"`

### Task 11: MCP/Aether surface

**Files:**
- Modify: `src/main/editor-methods.ts`, `src/renderer/agent/agent-handler.ts`, `src/shared/agent-protocol.ts`, `docs/MCP.md`
- Test: `test/agent/paint-collision.test.ts` (agent-handler level, like existing agent tests — check `test/agent/` conventions first)

- [ ] **Step 1: Research.** Read one existing method end-to-end (`paint_region`: `editor-methods.ts:48-50` → `agent-protocol.ts:26` kind union → `agent-handler.ts` case) to copy the pattern exactly. Read `docs/MCP.md` for doc format.
- [ ] **Step 2: Implement schemas.**
  - `entrySchema`: delete `coll` (`editor-methods.ts:17`).
  - New method:

```ts
{ name: 'paint_collision', kind: 'paint-collision', result: 'json',
  params: {
    section: z.number().int().min(0),
    plane: z.enum(['a', 'b']),
    x: z.number().int().min(0).describe('cell col (16px units, 0-127)'),
    y: z.number().int().min(0).describe('cell row (16px units, 0-127)'),
    w: z.number().int().min(1).max(128), h: z.number().int().min(1).max(128),
    word: z.number().int().min(0).max(0xFFFF).describe('packed collision cell word (shape 9:0, xflip 10, yflip 11, solidity 13:12); 0 = air'),
  },
  description: 'Fill a w*h CELL rectangle (16px units) of one collision plane with a packed cell word. One undo step.' },
```

  - `save_chunk` params gain `collisionA: z.array(z.number().int().min(0).max(0xFFFF)).optional()` + `collisionB` (length (w/2)*(h/2), validated in the handler); `stamp_chunk` description notes it now places collision and requires even x/y.
  - `agent-protocol.ts`: add the `paint-collision` kind + collision arrays on `save-chunk`.
- [ ] **Step 3: Implement handlers.** `paint-collision`: resolve section, seed planes (same lazy-seed), build one `set-collision-edit` with the rect's diffed entries (cell index = `(y+r)*2` rows of 8px tiles — REUSE `cellTileIndices` exactly as `paintCollisionCell:577-582` does: one cell word is written to all four 8px sub-tile indices), execute, return `{painted}`. `save-chunk`: validate + copy the collision arrays onto the created ChunkDef planes. Add a handler test: paint a 2×1 cell rect on plane b → the six underlying 8px indices hold the word; undo restores.
- [ ] **Step 4:** Update `docs/MCP.md` (new tool + changed schemas + the cell-word bit layout, referencing `collision-cell-word.ts`).
- [ ] **Step 5:** `npm test` green. Manual MCP smoke: with the app running, call `paint_collision` via the suite harness or a raw JSON-RPC request (discovery per `~/.aurora/mcp.json`); verify one undo step in-app.
- [ ] **Step 6:** `git commit -am "feat(mcp): paint_collision tool; chunk tools carry collision word planes"`

### Task 12: End-to-end verification + aeon doc closeouts + merge

- [ ] **Step 1: The user's scenario, full stack.** In Aurora (dev run): author a chunk — ground cells solid full-block, decorative grass cells air — stamp it TWICE into a section; marquee-copy a slope region and paste it (both layers) elsewhere; save the project (Aurora writes `games/sonic4/data/editor/ojz/**` as the user — normal operation; the daemon owns committing that tree).
- [ ] **Step 2: Build + probe.** Read `/home/volence/sonic_hacks/aeon/CLAUDE.md` conventions first. `cd /home/volence/sonic_hacks/aeon && SOUND_DRIVER_ENABLED=1 DEBUG=1 ./build.sh` → boots. Use the oracle MCP tools (`emulator_*`): load the ROM, teleport/walk the player across BOTH stamp placements — identical collision response; grass cells passable at both. Spot-check baked attr bytes with `python3 tools/collision_pipeline.py --probe` (read-only) at the stamped cells and at the pasted region. Path-B variant: author differing B words on the chunk, stamp, save, rebuild, probe layer B.
- [ ] **Step 3: aeon doc closeouts (aeon repo, doc-only).** Rewrite `aeon/docs/DEFERRED_WORK.md` "Path-B collision content" entry (~:439-450 — re-locate by heading, the file has drifted) to current truth: path B is editor-authorable; remaining work = path-swapper objects. Check the ARCH doc's collision-pipeline section states the live model (all-air baseline + editor-authoritative overlay + S&K vocabulary); update if stale. One commit in aeon: `docs: collision truth sync — chunk-carried authoring + clipboard live in Aurora (design #6 closeout)`.
- [ ] **Step 4: Merge.** In aurora: `npm test` one final time, then merge `feat/chunk-collision` → `master` (repo convention: plain merge on master, no PR — confirm nothing new landed on master first with `git log master..HEAD --oneline` / `git log HEAD..master --oneline`).

---

## Self-review (done at write time)

- **Spec coverage:** §3.1→T2,T3; §3.2→T6; §3.3→T4,T5; §3.4→T9; §3.5→T10; §3.6→T11; §4.1→T7; §4.2→T8; §4.3→T5+T8 Step 5; §6 verification→T6-T8 tests + T12. aeon closeouts→T12.
- **Types consistent:** `collisionA/collisionB` (chunk + doc + clipboard), `MapClipboard`, `PasteLayers`, `buildStampCommand`/`buildPasteCommand`, `propagate` (renamed from `justHere`), `paint-collision` kind.
- **Known judgment calls locked in:** ghost = footprint + collision shading (not full art render); composer paste = collision-only; agent `stamp_chunk` requires even coords; migration reads raw JSON bytes after the field dies (T10 Step 3); `findFullBlockShapeId` returns 0 = cannot-migrate sentinel.
- **Placeholders:** none; the two research-first steps (T5 canvas internals, T11 method pattern) name exactly what to read and what decision hangs on it.
