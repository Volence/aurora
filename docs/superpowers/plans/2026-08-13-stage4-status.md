# Stage 4 status — handoff as of 2026-08-13

Everything below is on `master` and pushed to `origin`. Working tree clean,
no open worktrees, `npx tsc --noEmit` clean, `npx vitest run` =
**191 test files (190 passed, 1 skipped) / 1755 tests (1752 passed, 3 skipped)
/ 0 failed**.

> Count the passes and the skips separately — the earlier revision of this line
> read "1726 passed / 3 skipped", which double-counted.

## What Stage 4 is

Spec: `docs/superpowers/specs/2026-08-13-ux-overhaul-stage4-design.md`.
**Read §2 and §3.0 first** — they record seven claims from earlier documents
that were investigated and found wrong. Four of them changed the design.

Goal: **facet parity** — the same task uses the same UI regardless of whether
the open project is classic (S1 disassembly) or aeon.

## Merged this session

| Merge | What |
|---|---|
| `149a627` | **Plan 1 — undo unification.** Per-document undo stacks on `DocumentHistoryHub`; undo follows the focused facet. undo-bus, sprite-undo, edit-seq, classic-history deleted. |
| `5e94e44` | **Section-render perf.** Compose each section into one `ImageData`; 679,576 canvas ops → 9. |
| `66763cc` | **Aeon sprite binding.** Explorer respects UI bindings; "New Sprite…" breaks the chicken-and-egg. |
| `5c1d564` | **Plan 2 — facet foundations.** `open-project.ts`, `artTiers`, `facetCanvases`. |
| `152cff8` | **Plan 3 — slot neutrality.** Shared ObjectList / ObjectInspector / ChunkGrid / rasterizer. |
| *(plan 4)* | **Steps D + E.** One tool vocabulary; classic's plane/overlays/camera to the stores; per-tab viewport restore for classic. |

Plus `0db582d` (spec §3 amendment) and `3c81e81` (collision docblock fixes,
§9.2 resolved).

## The pattern — this is the load-bearing decision

**Neutral presentation taking props and callbacks + engine-keyed providers.
No component in `src/renderer/components/shared` imports a store or a command.**

Not a store facade — the two engines' command vocabularies overlap only ~40%.
Each neutral component takes an explicit `versionKey` prop, because **aeon
mutates in place and ticks a version clock while classic swaps an immutable
doc**, and nothing shared can straddle that.

This is the codebase's existing shape, used four times before this work:
`documentHistoryHub`, `saveCoordinator`, `explorer-data.ts`, and
`components/art-shared/` (which already spans classic, aeon and the sprite
editor).

Live examples to copy: `components/shared/ObjectList.tsx` +
`providers/object-list-{aeon,classic}.ts`.

## Remaining re-home steps

Eight steps were identified; 0–3, D and E are done.

- ~~**D — classic viewport state to stores.**~~ Done (plan 4). `plane` is
  `editorStore.editingLayer`, the four overlays are `viewStore` keys
  (`showStart` is new, and `OVERLAY_KEYS_BY_ENGINE` keeps it out of aeon's View
  menu), and the camera publishes to `viewStore` once per painted frame while
  staying a ref. Per-tab viewport restore now works for classic too.
- ~~**E — tool vocabulary merge.**~~ Done (plan 4). `ClassicTool` is gone;
  `ToolId` lives in `core/project/adapter.ts` beside `FacetCapability` and the
  s1 manifest declares `facetTools.layout`. **`classic-surface.ts` may now move
  from `setFacet` to `switchFacet`** — that was E's whole purpose, and it is
  Step G's to do.
- **F-remainder** — the other aeon-coupled slots. See §3.0.1.
- **G — classic into `LevelWorkspace`.** Delete `LegacyWorkspace`,
  `ClassicProjectView`, `ZoneActTree`, `Toolbar`. This is the commit where
  classic stops feeling like a different app. Forces the collision decision.
  Plan 4 left it two drop-ins: classic's chip row already renders from
  `toolsForFacet('layout')`, so swapping in `MapFacetDock` is a presentation
  change; and `TOOL_LABELS`/`TOOL_HINTS` are already shared.
- **H — shared Art facet.** Hardest, and possibly shouldn't be fully shared:
  classic's Chunk › Block › Tile drill-down with usage counts suits a pooled
  format; aeon's staged pixel doc with marquee/transforms suits a flat one.

Independent, also queued: the **classic collision editor** the owner asked
for. Real feature work needing its own design pass. Geometry verified safe
(§9.2). Classic's model is `colind` (block id → shape index) + 2-bit solidity
in chunk cells — a shape picker at the block tier, not aeon's cell painting.
Do **not** try to share `CollisionPalette`.

## Open decisions

1. **Classic collision facet.** s1 grants `collision` but classic has no
   collision UI (`classicSetColind` has zero component callers). Forced at
   step G. The owner wants the editor built, so the grant can stay if the
   editor lands first.
2. ~~**`PropertiesPanel`'s "Selected Object" readout.**~~ CLOSED — restored in
   plan 4, prop-gated (`showObjectSelection`) and passed by the layout facet
   only, so the Objects facet keeps its editor without a duplicate readout.
3. **Classic chunk picker claims no facet** deliberately, so clicking a chunk
   doesn't steal focus from the composer beside it. Confirmed working by
   smoke test; revisit if it ever feels wrong.

## Traps

- **The test suite cannot see React or canvas.** Node-only, no jsdom,
  `.tsx` not collected. Every smoke-test failure this session was of that
  class. Drive the real app under CDP (`AURORA_DEBUG_PORT` +
  `VITE_AURORA_DEBUG`) or ask for a DevTools profile — don't reason from
  symptoms.
- **`classic-surface.test.ts` has been escaped twice** — once by its scan
  root, once by a regex requiring a trailing `(` that missed a bare function
  reference. Widen it *before* moving code it covers. A classic surface that
  loses its facet claim sends Ctrl+Z to the wrong undo document with nothing
  failing.
- **`executeCommand` throws** for a non-aeon focused document. Any shared
  component importing it hard-crashes classic on first click.
- **`src/renderer/state/toolStore.ts` is dead code** with a live test. It
  looks like "the engine-neutral tool store". It is not. Don't build on it.
- **`canvas/TileRenderer.ts` is a fifth copy** of the per-tile loop, left
  alone deliberately: swapping it needs `prerender`'s loop nesting inverted
  to avoid ~3.7k LUT rebuilds per zone.
- **Aeon has no palette persistence** — `aeon/save.ts` writes no palette
  bytes. Don't promise durability the engine side doesn't keep.
- **`editorStore.tool` and `viewStore` are now CROSS-ENGINE singletons.** A
  test that leaves a tool set leaks into the next one (`editorStore` has no
  `reset()`; `classicLevelStore.test.ts` puts it back by hand in `beforeEach`).
- **Classic's camera must not be a `useViewStore` selector.** The viewport's
  render effect has no dependency array, so a subscribed camera repaints on
  every mousemove — the storm the perf commits removed. It publishes from
  inside the rAF and adopts external writes via `subscribe`; a guard test
  (`components/classic/__tests__/classic-camera.test.ts`) protects the absence,
  because absence is what a later reader will "tidy" away.
- **Classic's fit-to-height defers to a remembered viewport on ACT LOAD only.**
  A plane switch still refits (FG and BG grids differ in height). The effect
  tracks the tab it last fitted to tell those apart — collapse that and either
  restore breaks or BG opens off-screen.
- **CDP harness selectors: the ui kit's `Chip` is a `<span>`, not a button, and
  the object-library rows are buttons that WRAP spans.** Both of plan 4's
  smoke-harness "failures" were the harness. Verify a harness fails on a
  planted violation before believing it — both new source guards were checked
  that way.

## Process notes

- Plans written with fabricated code for files not read first contained a
  real error every time (a conditional hook call, a wrong assumption about
  where manifests are built, a contract contradicting its own prose).
  Plan 3's fix: complete **contracts** — interfaces, test names, acceptance
  criteria — with code blocks explicitly marked ILLUSTRATIVE and implementers
  told to derive from current source. That worked.
- Don't run two subagents in the same worktree concurrently. Doing so once
  swept one agent's work into another's commit.
- Every plan's stated baseline test counts go stale fast. Verify, don't trust.
- Plan 4 ran as ONE worker on one branch rather than fanning out: every task
  edited `ClassicLevelViewport.tsx`, so parallelism bought nothing and would
  have re-run the two-agents-one-worktree collision recorded above.
- The node suite cannot see canvas, React or event ordering. Plan 4's three
  scratchpad CDP harnesses (`camera-`, `restore-`, `tool-split-`) are how the
  camera coalescing, the restore-vs-fit ordering and the tool split were
  actually confirmed. Reach for that before reasoning from symptoms.
