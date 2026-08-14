# Stage 4 status — handoff as of 2026-08-13

Everything below is on `master` and pushed to `origin`. Working tree clean,
no open worktrees, `npx tsc --noEmit` clean, `npx vitest run` =
**188 test files / 1726 passed / 3 skipped / 0 failed**.

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

Eight steps were identified; 0–3 are done.

- **D — classic viewport state to stores.** `plane`/`overlays`/`camRef` are
  component-local `useState` in `ClassicLevelViewport.tsx`. Prerequisite for G
  (per-tab viewport restore is aeon-only today).
- **E — tool vocabulary merge.** `ClassicTool` → `EditorTool`; classic's
  `object` is really two aeon tools (unarmed select/move/delete vs armed
  place). **Must land before** switching `classic-surface.ts` from `setFacet`
  to `switchFacet` — `switchFacet` also re-scopes aeon's `editorStore.tool`.
- **F-remainder** — the other aeon-coupled slots. See §3.0.1.
- **G — classic into `LevelWorkspace`.** Delete `LegacyWorkspace`,
  `ClassicProjectView`, `ZoneActTree`, `Toolbar`. This is the commit where
  classic stops feeling like a different app. Forces the collision decision.
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
2. **`PropertiesPanel`'s "Selected Object" readout** was removed as
   superseded. Cost: objects are also selectable with the `select` tool in
   the Layout facet, where that readout was the only display. Offered to
   restore; not yet answered.
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
