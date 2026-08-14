# Stage 4 Plan 6 — Step H, Art convergence

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classic's tile editor gains aeon's drawing capability, the two palette editors become one component, and the composer fills the canvas it was given.

**Architecture:** Three independent phases, each separately mergeable and separately revertable. H1 rebinds classic's `TileTab` onto the existing `PixelEditController` + `PixelViewport` substrate. H2 merges `ClassicPalettePanel` into `PaletteEditor` as one component with four mounts. H3 makes the tier editors fill their slot. **No shared Art facet module is created — `s1ArtFacet` and `artFacet` stay separate.**

**Tech Stack:** TypeScript, React 18, zustand, Electron, vitest (node-only — no jsdom, `.tsx` test files are NOT collected).

**Branch:** `feature/ux-stage4-plan6-art`, worktree `.claude/worktrees/ux-plan6`.
**Baseline at branch point (`2f1db2b`):** `npx tsc --noEmit` clean; `npx vitest run` = 205 files (1 skipped) / 2029 passed / 3 skipped / 0 failed.

---

## 0. Read this before writing any code

### 0.1 What step H is, and what it is not

The Stage-4 spec §3.5 describes step H as one shared Art facet: "the substrate is aeon's… classic contributes navigation". **That framing was rejected on 2026-08-14 after a full audit of both facets, with the owner's agreement.** The reason:

**Only ONE of classic's three tiers is a pixel surface.** ChunkTab is a 16×16 *block-assignment* grid. BlockTab is a 2×2 *tile-assignment* composer. Neither paints pixels; both edit cells that **reference** a child by id — which is exactly what `ArtTier.shared` exists to express (`core/project/adapter.ts:110-131`). Aeon's chunk tier *flattens a copy on stamp*, so it has no equivalent concept and no equivalent affordances. Forcing the two together would mean inventing an open-document concept classic does not have and moving classic off immediate-commit, which is what its `zoneart:<zone>` undo stack is built on.

So: **ChunkTab and BlockTab are not touched by this plan except by H3's layout work.** They keep classic's model.

### 0.2 The one thing that is deliberately NOT ported

**Copy-on-write staging + explicit Save is out of scope, by owner decision.**

Aeon stages strokes into `ComposerDoc.localPixels` and commits nothing until `handleSave` (`workspace/facets/art-facet.tsx:75-161`). It needs this because its composer can open a whole *chunk* and paint across cells that have no atlas tile behind them yet — it mints tiles at save time.

Classic's Tile tier always edits an existing tile at a known index, so it gains nothing from staging and loses a lot: **staged pixel writes are not commands**, so adopting it would break Ctrl+Z on classic's Art facet.

**The rule this plan holds to: one gesture = one `classicEditTiles` = one undo entry.** That is TileTab's behaviour today (`TileTab.tsx:128-149`) and every task below preserves it. Marquee needs a scratch buffer for the duration of a drag — that is `PixelEditController`'s own internal `snapshot`/`working` state (`core/art/pixel-edit-controller.ts:67-72`), which already exists, lives entirely inside one gesture, and commits on `end()`. That is not staging.

### 0.3 Traps that have already bitten this branch

- **The test suite cannot see React or canvas.** No jsdom; `.tsx` test files are not collected at all. Every test in this plan is a pure-function test or a source-scan guard. Anything that only manifests in a rendered tree must be verified by driving the real app under CDP (`AURORA_DEBUG_PORT` + `VITE_AURORA_DEBUG`), not asserted in vitest.
- **Verify every new guard against a planted violation before believing it green.** Guards on this branch have passed while asserting nothing at least three times.
- **A guard that checks a hand-written list only checks what someone remembered to list.** `panel-headings.test.ts` and `panel-scrollers.test.ts` now *derive* their panel lists via `components/__tests__/helpers/section-panels.ts`. Any new panel is auto-enrolled. Do not add a hand-maintained array.
- **`executeCommand` throws for a non-aeon focused document** (`state/editorStore.ts`). Nothing classic mounts may call it.
- **Nothing under `src/renderer/components/shared/` may import from `state/`** — enforced by `shared/__tests__/shared-purity.test.ts` for any quote style and any import form. `components/art-shared/` has **no such restriction**; it is shared between the level-art composer and the sprite editor and already imports freely. H1 and H2 put code in `art-shared/`, not `shared/`.
- **When a comment and the code disagree, the code is the fact** — and fix the comment in the same commit. Eleven stale comments were found on this branch; two of them caused bugs.

### 0.4 Guards that constrain this work

| Guard | What it will fail on |
|---|---|
| `components/__tests__/panel-scrollers.test.ts` | A new unbounded scroller in any facet panel; a panel picking its own cap number; `SECTION_LIST_MAX_HEIGHT` reappearing |
| `components/__tests__/panel-headings.test.ts` | A panel inside a `CollapsibleSection` rendering its own uppercase heading |
| `workspace/__tests__/section-ids.test.ts` | A new section id without an `aeon.`/`classic.`/`art.`/`palette.` prefix, or one id with two different titles |
| `workspace/__tests__/facet-visibility.test.ts` | Pill order changing — asserts s1 `['layout','objects','palette','art']` and aeon `['layout','objects','rings','collision','palette','art']` exactly |
| `workspace/__tests__/facet-chrome.test.ts` | A slot rendering when no act is loaded; `viewMenu !== mapOverlays` |
| `components/classic/__tests__/classic-surface.test.ts` | A classic surface root that stops spreading `classicSurfaceProps` — silently sends Ctrl+Z to the wrong undo document |
| `state/__tests__/history-routing.test.ts` | Art/palette edits not routing to `zoneart:<zone>` |
| `core/project/__tests__/art-tiers.test.ts` | Either ladder changing shape |
| `workspace/__tests__/undo-keys.test.ts` | A second Ctrl+Z binding |

---

## Phase H1 — classic's tile editor onto the pixel substrate

**What the user gets:** zoom, pan, line, rect, eraser, eyedropper-as-a-tool, mirror, dither, pixel-perfect, marquee select/move, and flip/rotate/shift — on classic's Tile tier. Today it is pencil + fill at a fixed 26px zoom with no pan.

### The binding, in one table

`PixelViewport` (`components/art-shared/PixelViewport.tsx:29-46`) is already data-model-agnostic. Classic binds to it like this:

| `PixelViewport` prop | Classic's value |
|---|---|
| `buffer` | `{ width: 8, height: 8, data: readTilePixels(doc.tiles, composerTileIndex) }` |
| `palette` | the 16 decoded colours of `doc.palettes[composerPalLine]` |
| `zoom` | `useArtStore(s => s.zoom)` |
| `controller` | a `PixelEditController` held in a ref, `setConfig`'d from `artStore` |
| `selection` | local `useState<Selection \| null>` |
| `onCommit` | `packTilePixels(result.buffer.data)` → `classicEditTiles([...])` |
| `onPick` | `useArtStore.getState().setSelectedColor(value)` |

`readTilePixels(tiles, tileIndex)` returns a 64-entry `Uint8Array` and `packTilePixels(px)` returns the 32 bytes (`components/classic/composer-math.ts:115,127`), so the buffer conversion is a wrapper, not a rewrite.

### Task H1.1: the tile ↔ buffer adapter

**Files:**
- Create: `src/core/art/classic-tile-buffer.ts`
- Test: `src/core/art/__tests__/classic-tile-buffer.test.ts`

Pure, node-testable, no React. This is the seam that makes the rest of H1 testable in a suite that cannot render.

- [ ] **Step 1: Write the failing test**

```ts
// ILLUSTRATIVE — derive exact imports from current source.
import { describe, it, expect } from 'vitest';
import { tileToBuffer, bufferToTileBytes } from '../classic-tile-buffer';
import { packTilePixels } from '../../../renderer/components/classic/composer-math';

describe('tileToBuffer', () => {
  it('is 8x8 and reads the tile at its index', () => {
    const tiles = new Uint8Array(64);
    tiles[32] = 0x12;                       // first byte of tile 1 → pixels 0,1 = 1,2
    const b = tileToBuffer(tiles, 1);
    expect(b.width).toBe(8);
    expect(b.height).toBe(8);
    expect(b.data.length).toBe(64);
    expect(b.data[0]).toBe(1);
    expect(b.data[1]).toBe(2);
  });

  it('round-trips through bufferToTileBytes unchanged', () => {
    const tiles = new Uint8Array(32);
    for (let i = 0; i < 32; i++) tiles[i] = (i * 7) & 0xff;
    const b = tileToBuffer(tiles, 0);
    expect(Array.from(bufferToTileBytes(b))).toEqual(Array.from(tiles));
  });

  it('bufferToTileBytes agrees with packTilePixels', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 64; i++) px[i] = i & 0x0f;
    const b = { width: 8, height: 8, data: px };
    expect(Array.from(bufferToTileBytes(b))).toEqual(Array.from(packTilePixels(px)));
  });
});
```

The third test is the load-bearing one: it pins the new path to the **existing** packer, so a future edit to either cannot silently diverge. `packTilePixels` is already covered by `components/classic/__tests__/composer-math.test.ts`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan6 && npx vitest run src/core/art/__tests__/classic-tile-buffer.test.ts
```
Expected: FAIL — `Failed to resolve import "../classic-tile-buffer"`.

- [ ] **Step 3: Implement**

Wrap the existing `readTilePixels` / `packTilePixels` rather than reimplementing the nibble packing. Two functions, a docblock saying why the wrapper exists (the substrate speaks `PixelBuffer`, classic's store speaks packed bytes) and that `bufferToTileBytes` must stay equivalent to `packTilePixels`.

- [ ] **Step 4: Run and watch it pass. Then run the whole suite.**

```bash
npx vitest run src/core/art/__tests__/classic-tile-buffer.test.ts && npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```
Expected: PASS; tsc clean; 2029 + 3 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/core/art/classic-tile-buffer.ts src/core/art/__tests__/classic-tile-buffer.test.ts
git commit -m "feat(art): a classic tile converts to and from the shared PixelBuffer"
```

### Task H1.2: the tool config seam

**Files:**
- Create: `src/core/art/tool-config.ts`
- Test: `src/core/art/__tests__/tool-config.test.ts`
- Modify: `src/renderer/components/art/ComposerCanvas.tsx` (adopt the shared builder)

`PixelEditController` takes a `ToolConfig` (`pixel-edit-controller.ts:16-23`). Aeon builds one inline in `ComposerCanvas`. Classic needs the same one. Extract the builder so there is one definition of "what the drawing config is", and so the **classic tool subset** is stated once.

- [ ] **Step 1: Write the failing test**

```ts
// ILLUSTRATIVE.
import { describe, it, expect } from 'vitest';
import { CLASSIC_TILE_TOOLS, isPixelTool, toolConfigFrom } from '../tool-config';

describe('CLASSIC_TILE_TOOLS', () => {
  it('is exactly the pixel tools the controller implements', () => {
    expect([...CLASSIC_TILE_TOOLS].sort()).toEqual(
      ['dither', 'eraser', 'eyedropper', 'fill', 'line', 'pencil', 'rect', 'select'],
    );
  });

  it('excludes every tile-space tool', () => {
    for (const t of ['tile-stamp', 'collision', 'palette-apply']) {
      expect(CLASSIC_TILE_TOOLS).not.toContain(t);
      expect(isPixelTool(t)).toBe(false);
    }
  });
});

describe('toolConfigFrom', () => {
  it('carries the drawing modifiers through verbatim', () => {
    const cfg = toolConfigFrom({
      tool: 'line', selectedColor: 7, mirror: 'both',
      ditherPattern: 'sparse25', ditherSecondary: 3, pixelPerfect: true,
    });
    expect(cfg).toEqual({
      tool: 'line', color: 7, mirror: 'both',
      ditherPattern: 'sparse25', ditherSecondary: 3, pixelPerfect: true,
    });
  });

  it('falls back to pencil for a tile-space tool, so a classic host never gets one', () => {
    const cfg = toolConfigFrom({
      tool: 'tile-stamp', selectedColor: 1, mirror: null,
      ditherPattern: 'checker', ditherSecondary: 0, pixelPerfect: false,
    });
    expect(cfg.tool).toBe('pencil');
  });
});
```

The last case matters: `artStore.tool` is a **cross-engine singleton**. Arm `tile-stamp` on aeon's Art facet, switch projects to classic, and classic's Tile tier would receive a tool `PixelEditController` cannot execute. Coercing at the seam is cheaper than a guard in every host.

- [ ] **Step 2: Run it and watch it fail.**

```bash
npx vitest run src/core/art/__tests__/tool-config.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `tool-config.ts`.**

`CLASSIC_TILE_TOOLS` as a `readonly` tuple, `isPixelTool`, and `toolConfigFrom(source)` taking the six `artStore` fields it needs (NOT the store itself — this file is in `core/` and must not import from `renderer/`).

- [ ] **Step 4: Point `ComposerCanvas` at the shared builder.**

Read `ComposerCanvas.tsx` first and find where it constructs its `ToolConfig`. Replace that construction with `toolConfigFrom(...)`. **Aeon must keep its tile-space tools** — those are routed via `hostPointer` and never reach the controller (`PixelViewport.tsx:180-186`), so the `pencil` coercion is correct for the controller config and changes no aeon behaviour. Verify that claim in the source before committing; if aeon does feed a tile-space tool to the controller, stop and report rather than changing aeon's behaviour.

- [ ] **Step 5: Full suite + tsc.**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```
Expected: clean, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/core/art/tool-config.ts src/core/art/__tests__/tool-config.test.ts src/renderer/components/art/ComposerCanvas.tsx
git commit -m "refactor(art): one tool-config builder, with the classic pixel-tool subset named"
```

### Task H1.3: TileTab renders through PixelViewport

**Files:**
- Modify: `src/renderer/components/classic/TileTab.tsx`

This is the big one. Read the whole current file first — it is 268 lines and every behaviour listed below is load-bearing.

**Behaviour that MUST survive, verbatim:**

1. **One `classicEditTiles` per gesture**, wrapped in the existing try/catch → toast. The comment at `TileTab.tsx:135-140` explains why an uncaught throw mid-gesture is worse than a refused edit — keep it and keep the guard.
2. **Locked tiles refuse edits.** `tileLockReason(range, composerTileIndex)` gates painting; the red banner, `cursor: not-allowed` and `opacity: 0.6` stay. Locked tiles are still **readable** — eyedropper must keep working on them.
3. **The palette-line chips stay a VIEW LENS.** `composerPalLine` selects which 16-colour row the tile is *rendered* through. It writes nothing. This is distinct from `artStore.paletteLine`, which is aeon's paint modifier. **Do not merge these two fields** — spec §3.5 requires both meanings stay distinct, and BlockTab's per-cell `pal` write is the third, different, meaning.
4. **The browse-only tile strip** on the right, with `versionKeyFor(id) = ${paletteEpoch}:${tileVersions.get(id) ?? 0}`. The comment at `:179-184` explains why it is NOT keyed on `chunkEpoch` — keying the strip on `chunkEpoch` repainted all 965 thumbnails on every stroke. Do not "simplify" this.
5. **Copy / Paste of a whole tile** via `tileClipboard`.
6. **`SharedBanner`** when the tile is used in more than one block cell.

**What changes:**

- The hand-written `useEffect` canvas painter (`:57-89`) is **deleted** — `PixelViewport` does that job.
- `pixelAt` / `onDown` / `onMove` / `endStroke` / `onContext` (`:91-160`) are **deleted** — `PixelViewport` + `PixelEditController` do that job. `useEscapeCancel` and `useWindowStrokeEnd` go with them; the controller owns gesture lifetime and `PixelViewport` uses pointer capture, so a release outside the canvas is already handled.
- Local `useState<TileTool>` (`:40`) and the Pencil/Fill chips (`:226-227`) are **deleted** — the tool comes from `artStore` and the dock (H1.4).
- Local `colorIndex` `useState` (`:39`) is **replaced** by `artStore.selectedColor`, so the tool options' colour and the swatch row are the same value.
- The 16-swatch row (`:229-249`) **stays** — it is classic's colour picker for the *view* line and has no aeon equivalent in this slot.

- [ ] **Step 1: Rewrite the component.**

```tsx
// ILLUSTRATIVE SHAPE ONLY — derive every import, prop and style from current source.
const controllerRef = useRef<PixelEditController | null>(null);
if (!controllerRef.current) controllerRef.current = new PixelEditController(toolConfigFrom(artCfg));
controllerRef.current.setConfig(toolConfigFrom(artCfg));

const [selection, setSelection] = useState<Selection | null>(null);
const buffer = useMemo(
  () => tileToBuffer(doc.tiles, composerTileIndex),
  [doc, composerTileIndex, chunkEpoch],
);

const onCommit = useCallback((result: GestureResult) => {
  if (result.selection !== undefined) setSelection(result.selection);
  if (locked) return;                       // a locked tile takes no writes
  const bytes = bufferToTileBytes(result.buffer);
  let res;
  try {
    res = classicEditTiles([{ tileIndex: composerTileIndex, data: bytes }]);
  } catch (e) {
    res = { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
  if (!res.ok) useToastStore.getState().addToast(`Tile edit failed: ${res.error}`, 'error');
}, [locked, composerTileIndex]);
```

Note `result.selection !== undefined` rather than truthiness: `end()` returns `selection: null` to mean *cleared* and omits the key entirely for non-select tools (`pixel-edit-controller.ts:209,220,224,226`). Treating those the same would make a pencil stroke clear the marquee.

Note also that the selection is updated **before** the `locked` return, so marquee selection still works on a locked tile — selecting is not editing, the same reasoning that keeps the eyedropper live.

- [ ] **Step 2: Verify by hand in the real app.** The suite cannot see any of this.

```bash
npm run dev            # then drive it, or use a CDP harness under scratchpad/
```

Check, on a classic project, Art facet, Tile tier:
- pencil draws; one Ctrl+Z undoes the whole stroke, not one pixel
- fill fills; one Ctrl+Z undoes it
- line and rect preview while dragging and commit on release
- eyedropper picks a colour into the swatch row
- a locked tile (an anim-art slot) refuses the pencil and still eyedrops
- the tile strip repaints only the edited tile

- [ ] **Step 3: Full suite + tsc.**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```
Expected: clean; `composer-math.test.ts` still passes (`floodFillTile` may now be unused by TileTab but is still exported and tested — leave it until H1.7).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/classic/TileTab.tsx
git commit -m "feat(classic): the tile editor draws on the shared pixel substrate"
```

### Task H1.4: the tool dock, gated to the tile tier

**Files:**
- Modify: `src/renderer/workspace/facets/s1-facets.tsx`
- Create: `src/renderer/components/classic/ClassicArtToolDock.tsx`
- Test: `src/renderer/workspace/__tests__/classic-art-dock.test.ts`

`s1ArtFacet` (`s1-facets.tsx:454`) declares no `ToolDock`, so `facet-chrome.ts` drops the 44px rail. It needs one now — but **only the Tile tier can use these tools.**

**The decision, and why.** `facet-chrome.ts`'s established rule is *a control that cannot act is not drawn*. The Chunk and Block tiers are not pixel surfaces, so a pixel dock beside them is exactly the dead chrome that rule exists to prevent. Therefore: **the dock renders only when `composerTab === 'tile'`.** Same rule, applied one level deeper than facet granularity, because classic's Art facet has three sub-surfaces where every other facet has one.

The alternative — a per-tier tool declaration in `artTiers` — was considered and rejected for now: `ArtTier` is a *project-profile* type describing the data ladder, and the tool set is a *renderer* concern. Putting tools there would make the s1 and aeon adapters disagree about a field neither engine's loader uses. Revisit if a third tier ever needs its own tools.

- [ ] **Step 1: Write the failing guard.**

```ts
// ILLUSTRATIVE — a SOURCE-SCAN guard, because the suite cannot render.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../components/classic/ClassicArtToolDock.tsx');

describe('classic art tool dock', () => {
  it('renders nothing outside the tile tier', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toMatch(/composerTab\s*!==\s*'tile'/);
    expect(src).toMatch(/return null/);
  });

  it('offers only the pixel tools, from the one shared list', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).toContain('CLASSIC_TILE_TOOLS');
    // the tile-space tools must not be named here at all
    for (const t of ['tile-stamp', 'collision', 'palette-apply']) {
      expect(src).not.toContain(`'${t}'`);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** Expected: FAIL — file does not exist.

- [ ] **Step 3: Plant a violation and confirm the guard catches it.** Write the component *without* the `composerTab` gate first, run the guard, see the first case fail. Then add the gate and see it pass. **Do not skip this** — a guard nobody has seen fail is not a guard.

- [ ] **Step 4: Implement the dock and wire it into `s1ArtFacet`.**

Reuse `ArtToolDock`'s button rendering if it is parameterisable by tool list; read `src/renderer/shell/ArtToolDock.tsx` (37 lines) and decide. If it hardcodes all 11 tools, either add a `tools` prop (preferred — aeon passes its full list, classic passes `CLASSIC_TILE_TOOLS`) or wrap it. Do not fork the button styling.

Add `ToolOptions` to `s1ArtFacet` in the same task — `ArtToolOptions` (`shell/ArtToolOptions.tsx`) is what surfaces mirror, dither, pixel-perfect, the transform grid and the zoom control, which are the whole point of H1. It takes a `before` prop for a doc header; classic passes nothing. **Check whether `ArtToolOptions` reads `artStore.open`** — if it does, that path must be null-safe for classic, which never opens an aeon document. Fix by guarding, not by giving classic a fake document.

- [ ] **Step 5: Verify in the real app** that the rail appears on the Tile tier and is absent on Chunk and Block, and that the transform buttons act on the tile.

- [ ] **Step 6: Full suite + tsc, then commit.**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
git add -A && git commit -m "feat(classic): the tile tier gets the pixel tool dock and its options"
```

### Task H1.5: transforms and the marquee reach classic

**Files:**
- Modify: `src/renderer/components/classic/TileTab.tsx`

`ArtToolOptions`'s `TransformGrid` writes `artStore.pendingAction` (`'flip-h' | 'flip-v' | 'rotate-90' | 'shift-*'`), which `ComposerCanvas` consumes at `:503-540`. Classic must consume it too, or the buttons H1.4 just mounted do nothing.

- [ ] **Step 1: Read `ComposerCanvas.tsx:503-540`** and mirror its consume-and-clear shape. Apply to `selection ?? whole buffer`, then commit through the same `onCommit` path so it is one undo entry.

- [ ] **Step 2: The clearing is the hazard.** `pendingAction` is a single cross-engine slot. If classic's Art facet and aeon's composer are ever both mounted, both would consume it. They cannot be — `App` mounts one workspace under an engine gate — but the effect must still `clearAction()` unconditionally after consuming, exactly as aeon does, so a stale action cannot fire on the next mount.

- [ ] **Step 3: Verify in the real app:** flip-h on a tile, one Ctrl+Z restores it. Marquee a region, drag it, one Ctrl+Z restores it. Marquee + flip-h transforms only the marquee.

- [ ] **Step 4: Full suite + tsc, then commit.**

```bash
git add src/renderer/components/classic/TileTab.tsx
git commit -m "feat(classic): transforms and the marquee act on the selected tile"
```

### Task H1.6: pan and zoom

**Files:**
- Modify: `src/renderer/components/classic/TileTab.tsx`

Classic's tile canvas is a fixed 208px. Aeon's uses `useAnchoredZoom` + `useHandPan` (`components/art-shared/`) over a scroller ref.

- [ ] **Step 1: Read both hooks** (57 and 78 lines) and `ComposerCanvas`'s use of them, including its `effectiveZoom` cap at 16000px (`:138-143`).
- [ ] **Step 2: Adopt them.** An 8×8 tile at zoom 64 is 512px, well under any cap, but wire the cap anyway rather than reasoning that classic cannot hit it — `artStore.zoom` is a cross-engine singleton clamped to 2..64 (`artStore.ts:82`) and a future tier could be larger.
- [ ] **Step 3: Verify in the real app:** wheel zoom anchors on the cursor; space-drag or middle-drag pans; the zoom control in the tool options agrees with the canvas.
- [ ] **Step 4: Commit.**

```bash
git commit -am "feat(classic): the tile editor zooms and pans like aeon's"
```

### Task H1.7: delete what is now dead

**Files:**
- Modify: `src/renderer/components/classic/composer-shared.tsx`, `src/renderer/components/classic/composer-math.ts`

- [ ] **Step 1: Find the actual dead set.** After H1.3–H1.6, likely candidates are `floodFillTile`, `useEscapeCancel`, `useWindowStrokeEnd`, `canvasCellIndexAt` and parts of `canvasGeom`. **Check each against every caller** — ChunkTab and BlockTab still use several of these and are untouched by this plan. `grep -rn '<name>' src/` per symbol; do not delete on the strength of "TileTab no longer imports it".
- [ ] **Step 2: Delete only what has zero callers.** Remove the corresponding tests **only** for genuinely deleted exports; keep `composer-math.test.ts` coverage for everything that survives.
- [ ] **Step 3: Full suite + tsc.** A deletion that breaks nothing and drops no test count is suspicious — confirm the test count fell by exactly the tests you removed.
- [ ] **Step 4: Commit.**

```bash
git commit -am "refactor(classic): drop the tile editor's hand-rolled gesture code"
```

### H1 acceptance criteria

- [ ] Classic's Tile tier offers pencil, eraser, fill, eyedropper, line, rect, select and dither, from `CLASSIC_TILE_TOOLS`.
- [ ] Mirror, dither pattern, pixel-perfect and the transform grid all act on the classic tile.
- [ ] Marquee select, move, and transform-within-selection work.
- [ ] Wheel zoom and hand pan work; zoom agrees with the tool options control.
- [ ] **Every gesture is exactly one undo entry.** Verified by hand for: pencil stroke, fill, line, rect, marquee move, each transform.
- [ ] A locked tile refuses every write and still eyedrops.
- [ ] The palette-line chips still only change what is *shown*.
- [ ] The tile strip still repaints only the edited tile on a stroke.
- [ ] The tool dock is absent on the Chunk and Block tiers.
- [ ] `tsc` clean; suite green; every new guard seen to fail on a planted violation.

---

## Phase H2 — one palette editor

**The duplication:** `ClassicPalettePanel.tsx` (117 lines) and `PaletteEditor.tsx` (656 lines) both render a 4×16 Genesis CRAM grid over the same colour model, and **already share `art-shared/GenesisColorSliders.tsx`**. The audit called them the best-matched pair in the codebase. There are four mounts across two engines:

| Mount | Section id | Column |
|---|---|---|
| `s1-facets.tsx:364` | `classic.palette` | classic Art, 260px |
| `s1-facets.tsx:320` | `classic.mapPalette` | classic Palette, 260px |
| `art-facet.tsx:313` | `art.palette` | aeon Art, 240px |
| `palette-facet.tsx:49` | `palette.editor` | aeon Palette, 280px |

This closes **both** recorded "two hosts" open items at once — the one in `s1-facets.tsx:81-84` and the one in `palette-facet.tsx:36-37`.

**The section ids must stay four distinct ids.** A section id keys the collapse preference in `shell/panel-state.ts`, and `section-ids.test.ts` enforces one-id-one-title. Sharing an id would make collapsing the palette in the Art column also collapse it in the Palette facet. One component, four ids.

### Task H2.1: map the real difference

**Files:** none — this is a read-and-report task.

- [ ] **Step 1: Read both components in full.** `PaletteEditor` is 656 lines with **three context modes** (art / sprite+zone / sprite+standalone), drag-and-drop swatch and line copy, and `PaletteCopyMenu`. `ClassicPalettePanel` is 117 lines: a 4×16 grid, click-to-select, `GenesisColorSliders`, `classicSetPalette(line, next)` on channel release.
- [ ] **Step 2: Write the difference down** as a table in the plan file under this task: for each `PaletteEditor` capability, whether classic can support it (and via which command) or whether it is aeon-only.
- [ ] **Step 3: Stop and report before writing code.** If `PaletteEditor`'s sprite modes make a neutral extraction larger than a rewrite of `ClassicPalettePanel` onto a shared *grid* component, say so — extracting a shared `PaletteGrid` that both editors mount is a legitimate and probably better outcome than one component with an engine prop. **Decide from the source, not from this plan's expectation.**

### Task H2.2: the shared component

**Files:**
- Create: `src/renderer/components/art-shared/PaletteGrid.tsx` (name provisional — H2.1 decides the shape)
- Test: `src/renderer/components/art-shared/__tests__/palette-grid.test.ts` (pure model tests only)
- Modify: the four mount sites above

- [ ] **Step 1: Extract the pure model first.** Anything computable — swatch geometry, which line/index a click maps to, the copy-line/copy-swatch operations — goes in a plain `.ts` module with real tests. The `.tsx` cannot be tested by this suite at all, so the more that lives in the model, the more is actually verified.
- [ ] **Step 2: Write the model tests, watch them fail, implement, watch them pass.**
- [ ] **Step 3: Build the component over the model**, taking a port/props for the write path — classic writes via `classicSetPalette`, aeon via its own command. **The component must not import either store**; follow `components/shared/`'s provider pattern even though `art-shared/` is not purity-guarded, because the write paths genuinely differ.
- [ ] **Step 4: Repoint all four mounts**, keeping the four section ids and their existing titles exactly.
- [ ] **Step 5: Verify in the real app, all four screens.** Classic Art column, classic Palette facet, aeon Art column, aeon Palette facet. Edit a colour in each and confirm the act/composer repaints.
- [ ] **Step 6: Full suite + tsc, then commit.**

### H2 acceptance criteria

- [ ] One component renders the palette on all four screens.
- [ ] Four distinct section ids survive; collapsing one does not collapse another.
- [ ] Classic gains whatever of aeon's palette affordances H2.1 found portable (at minimum: whatever `PaletteEditor` offers that `classicSetPalette` can express).
- [ ] Aeon's Palette facet keeps its `BottomExtra: PaletteViewer` `PAL LINE` strip.
- [ ] `panel-headings.test.ts` still passes — the shared component must not render its own uppercase heading inside a `CollapsibleSection`.
- [ ] Both "two hosts" comments are updated to say what was decided, in the same commit.

---

## Phase H3 — the composer fills its canvas

**The defect:** `composer-shared.tsx:180` — `tabBody: { display: 'flex', gap: 12, padding: 10, alignItems: 'flex-start' }`. The parent `dockContent` (`:179`) and `dock` (`:166`) both grow correctly, so the container is full height; but `tabBody` is a row anchored to the top whose children are fixed-size canvases (320 / 128 / 208 px). Result: a ~320px composer under roughly 700px of empty canvas.

This is the item the owner noticed. It is listed first in the in-source open list (`s1-facets.tsx:77-80`).

### Task H3.1: the tab body fills

- [ ] **Step 1: Measure before.** Drive the real app and record, for each of the three tiers, the canvas slot height and the rendered `tabBody` height. Screenshot each. Without a before-measurement there is nothing to verify against — this is how the 260px cap got mistaken for a fix.
- [ ] **Step 2: Make `tabBody` fill** (`alignItems: 'stretch'`, `flex: 1`, `minHeight: 0`) and give `editorCol` / `paletteCol` sane flex behaviour. `paletteCol` already has `flex: 1`; `editorCol` is `flexShrink: 0`.
- [ ] **Step 3: The tier canvases must then use the room.** The Tile tier is easy after H1.6 — it zooms and pans, so it can simply be given the space. **Chunk and Block do not zoom.** Decide per tier and write the reasoning into `composer-shared.tsx` beside the style:
  - Tile: fill, and let zoom/pan use it.
  - Chunk (320px) and Block (128px): centre in the available space rather than stretching a fixed-size canvas, **or** give them a zoom-to-fit. Stretching a `CHUNK_CELL = 20` grid by CSS would blur it — these are `imageRendering: pixelated` canvases sized in integer cells, so any scaling must be done by changing the cell size, not the CSS box.
- [ ] **Step 4: Measure after,** same three tiers, and record the numbers in the commit message the way `5399202` did. Dead space at the bottom should be 0 or deliberate.
- [ ] **Step 5: Full suite + tsc, then commit.**

### Task H3.2: re-check the recorded open items

- [ ] **Step 1: Reread the "WHAT IS STILL OPEN FOR STEP H" block** at `s1-facets.tsx:60-93`. Items 1 and 2 are addressed by H3.1 and H2. **Item 3 (classic Layout's one-section column) is NOT in this plan** — it needs a classic properties surface or a plane panel, both of which are new design.
- [ ] **Step 2: Rewrite the block to match reality.** Delete what closed, keep item 3 with its reasoning intact, and add anything H1–H3 opened. A stale open-list in this file has already sent reviewers the wrong way twice.
- [ ] **Step 3: Commit the comment fix with the code it describes** — never as a follow-up.

### H3 acceptance criteria

- [ ] No tier leaves large dead space below it; measurements recorded before and after.
- [ ] Chunk and Block tiers stay pixel-crisp (no CSS-scaled canvases).
- [ ] The in-source open list matches the code.

---

## Merge

Only after all three phases are green and the owner has smoke-tested.

```bash
cd /home/volence/sonic_hacks/aurora && \
  git checkout master && git merge --no-ff feature/ux-stage4-plan6-art && \
  npx tsc --noEmit && npx vitest run 2>&1 | tail -5 && \
  git push origin master
```

Then `git worktree remove .claude/worktrees/ux-plan6 && git branch -d feature/ux-stage4-plan6-art`.

**Push it.** `origin/master` has been in sync since plan 1.

---

## What this plan does NOT do

- **No shared Art facet module.** `s1ArtFacet` and `artFacet` stay separate; §0.1 is the argument.
- **ChunkTab and BlockTab keep classic's model** — referenced-by-id cells, usage counts, `SharedBanner`, Duplicate. Only their layout is touched, by H3.
- **No copy-on-write staging for classic** (§0.2, owner decision).
- **Classic Layout's one-section column** — needs a classic properties surface, which is new design.
- **The classic collision editor** — separate designed feature; `classicSetColind` still has zero component callers.
- **Piece C** (guards / debt / a11y) and **piece D** (BG bridge + band editor) — their own plans.
- **`artTiers` still has no production consumer** after this plan. It was built for a shared breadcrumb that §0.1 rejects. Either a later plan finds it a real job or it should be deleted rather than left as tested scaffolding for a design that was abandoned. **Do not delete it in this plan** — that is a decision, not a cleanup.
