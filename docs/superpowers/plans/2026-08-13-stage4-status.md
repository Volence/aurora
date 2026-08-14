# Stage 4 status — handoff as of 2026-08-14

**Two trees now.** The merged history is on `master` and pushed to `origin`.
Steps **F and G are complete but live only on `feature/ux-stage4-plan5`**
(worktree `.claude/worktrees/ux-plan5`) — **not merged, not pushed.** Everything
below marked "plan 5" is on that branch; everything in the merge table is on
`master`.

Baseline, measured on `feature/ux-stage4-plan5` @ `d1f0fb7`: `npx tsc --noEmit`
clean, `npx vitest run` = **205 test files (204 passed, 1 skipped) / 1977 tests
(1974 passed, 3 skipped) / 0 failed**.

> Count the passes and the skips separately — an earlier revision of this line
> read "1726 passed / 3 skipped", which double-counted.
>
> The `master` baseline before plan 5 was 191 files / 1755 tests
> (1752 passed, 3 skipped, 0 failed). Kept for the delta only.

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
| `3f43bba` | **Steps D + E.** One tool vocabulary; classic's plane/overlays/camera to the stores; per-tab viewport restore for classic. |

Plus `0db582d` (spec §3 amendment) and `3c81e81` (collision docblock fixes,
§9.2 resolved).

## Done, but NOT merged — `feature/ux-stage4-plan5`

Twelve planned tasks plus three fix rounds. Full report:
`docs/superpowers/plans/2026-08-14-plan5-overnight-report.md`.

| Step | What |
|---|---|
| **F** | `MapStatusBar` and `PropertiesPanel` became neutral over engine ports — which removed an `executeCommand` call site that would have hard-crashed classic on its first background change. |
| **G** | One `(engine, facetId)`-keyed module registry replaced the two that disagreed; classic's modules registered; one undo/redo binding for both engines; classic's duplicate OptionBar controls deleted; chunk picker re-homed; resolution report deduplicated; **`LegacyWorkspace` / `ClassicProjectView` / `ZoneActTree` / `Toolbar` deleted**; the sprite doc got its own header. |

Both engines now render through the same `LevelWorkspace`. Classic grants
Layout / Art / Objects; aeon grants those plus Rings / Collision / Palette.
Three fix rounds on top, driven by looking at screenshots rather than by the
suite: `facet-chrome.ts` (a control that cannot act is not drawn — the no-act
states), the collision-overlay scope, the landing picks for aeon's Art chunk and
classic's Art block, plane-switch camera preservation, dock ordering, and the
`PAL LINE` strip that gives aeon's Palette facet a job Art cannot do.

Final visual pass: 22 shots, both engines, all nine round-3 fixes verified on
screen, every probe first checked against a planted violation. Two things it
found that 1974 tests did not: aeon's no-act canvas says *"Open a project to view
sections"* when a project **is** open and only the act is missing, and classic's
`TILES (965)` strip renders the same tileset in two different palette lines one
tier apart (green on Block, line-0 red/blue on Tile) — the bug round 3 just fixed
for aeon. Neither blocks the merge.

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

Eight steps were identified. **0–3, D and E are done and merged; F and G are
done on `feature/ux-stage4-plan5` and not merged. H is the only step with work
left in it.**

- ~~**D — classic viewport state to stores.**~~ Done (plan 4). `plane` is
  `editorStore.editingLayer`, the four overlays are `viewStore` keys
  (`showStart` is new, and `OVERLAY_KEYS_BY_ENGINE` keeps it out of aeon's View
  menu), and the camera publishes to `viewStore` once per painted frame while
  staying a ref. Per-tab viewport restore now works for classic too.
- ~~**E — tool vocabulary merge.**~~ Done (plan 4). `ClassicTool` is gone;
  `ToolId` lives in `core/project/adapter.ts` beside `FacetCapability` and the
  s1 manifest declares `facetTools.layout`. The follow-on — moving from
  `setFacet` to `switchFacet`, which was E's whole purpose — **landed in G**:
  `LevelWorkspace` calls `switchFacet(tab, resolved)` from an effect, so a facet
  switch re-scopes the armed tool for both engines.
- ~~**F-remainder** — the other aeon-coupled slots.~~ Done (plan 5, **unmerged**).
  About ten slot components were aeon-coupled, not just the canvas; several would
  have thrown for a classic document.
- ~~**G — classic into `LevelWorkspace`.**~~ Done (plan 5, **unmerged**).
  `LegacyWorkspace`, `ClassicProjectView`, `ZoneActTree` and `Toolbar` are
  deleted. This was the commit where classic stopped feeling like a different
  app, and it forced the collision decision — see Open decisions 1 and 4, both
  now closed.
- **H — shared Art facet.** The only re-home step with work left. Hardest, and
  possibly shouldn't be fully shared: classic's Chunk › Block › Tile drill-down
  with usage counts suits a pooled format; aeon's staged pixel doc with
  marquee/transforms suits a flat one. Plan 5 deliberately did not attempt it.
  Two composition questions belong to it: the dead space under aeon's Palette
  editor, and whether that facet and Art's `PALETTE` section should be one
  component with two hosts.

Independent, also queued: the **classic collision editor** the owner asked
for. Real feature work needing its own design pass. Geometry verified safe
(§9.2). Classic's model is `colind` (block id → shape index) + 2-bit solidity
in chunk cells — a shape picker at the block tier, not aeon's cell painting.
Do **not** try to share `CollisionPalette`.

## Open decisions

1. ~~**Classic collision facet.**~~ CLOSED (plan 5, owner-approved) — **the
   `collision` grant was dropped from classic.** Classic has no collision UI
   (`classicSetColind` still has zero component callers), so once both engines
   shared one registry the pill would have opened aeon's cell-painting palette
   over a `colind` model it cannot drive. **Reversible in one line** —
   `S1_FACETS` in `core/project/s1/index.ts` — when the classic collision editor
   is built, which remains queued as real feature work (see below).
2. ~~**`PropertiesPanel`'s "Selected Object" readout.**~~ CLOSED — restored in
   plan 4, prop-gated (`showObjectSelection`) and passed by the layout facet
   only, so the Objects facet keeps its editor without a duplicate readout.
3. **Classic chunk picker claims no facet** deliberately, so clicking a chunk
   doesn't steal focus from the composer beside it. Confirmed working by
   smoke test; revisit if it ever feels wrong.
4. ~~**Classic palette facet.**~~ CLOSED (plan 5) — **the `palette` grant was
   dropped from classic too.** Its Art and Palette facets resolved to the *same
   module*, differing only in `id`, so the pill navigated to a pixel-identical
   screen. Same one-line reversal in `S1_FACETS`.

   This is *not* an argument against aeon's Palette facet, which was flagged for
   the same reason and is a different case: aeon's Art facet puts the palette
   editor next to the **composer**, so a recolour is judged against one 128px
   chunk, while the Palette facet judges it against the **act** — the only place
   "did that change break anything?" can be answered, since a Genesis palette
   line is shared by everything drawn with it. Plan 5 kept the grant and gave it
   the thing Art cannot have: `BottomExtra: PaletteViewer`, the `PAL LINE` strip,
   so picking a line and editing that line's colours are finally one screen. The
   reasoning is written into `workspace/facets/palette-facet.tsx`'s header.

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
  that way. More traps from plan 5's harnesses: tab-strip tabs and
  command-palette rows fire `onMouseDown`, so `.click()` is inert on them;
  `CollapsibleSection` uppercases via **CSS**, so `textContent` is `"Chunks"`,
  never `"CHUNKS"`; the app bar's concatenated text reads `…PaletteFGBG…`, where
  `\bFG\b` never matches; and `.bin/electron` is a node **shim**, so SIGKILL on
  it leaves the real Electron holding the debug port and the next run silently
  attaches to the *previous* window. Spawn detached and kill the process group.
- **A source guard that checks a hand-written list of files only checks what
  someone remembered to list.** This bit plan 5 three times. The
  doubled-section-heading guard is the worked example: `RING PATTERNS` was
  rendered twice for weeks because `RingPatternPalette.tsx` was simply not in
  `panel-headings.test.ts`'s `PANELS` array. The guard now **derives** its own
  list by scanning the facet modules and following their imports transitively,
  and that immediately turned up another panel nobody had listed. Prefer a
  derived list to a maintained one; if you must maintain one, the guard's real
  job is to fail when the list is incomplete.
- **"Non-default" is not "visible".** `firstNonBlankBlock` — the predicate that
  picks which document the Art facet lands on — asked for a non-**default** cell
  (`tile !== 0 || xf || yf || pal !== 0 || pri`). S1 Green Hill's block `$000`
  has cells on **palette line 2 pointing at tile `$000`**: non-default in the
  data, entirely invisible on screen. So the Block tier still opened on four
  black quadrants, the exact impression a landing pick exists to prevent, and it
  printed no string a grep guard could have caught. Flips, palette line and
  priority are all properties of *how* a tile is drawn and none of them can make
  a blank tile visible; only the tile can. A landing pick must ask "does this
  draw anything?", not "does this differ from zero?".
- **Stale comments in this tree have sent agents the wrong way three times.**
  One would have caused a wrong deletion of `useActTabSync` (silently breaking
  agent-driven act switching); another, in `classic-surface.ts`, *caused* the
  Layout ≡ Objects bug by continuing to assert something that had stopped being
  true. Plan 5's audits found eleven of them. When a comment and the code
  disagree, the code is the fact — and fix the comment in the same commit.
- **The empty / no-act states were invisible for the entire project**, because a
  cold open always restores an act, so no CDP round-trip can land before the
  document exists. `__dbg.resetLevel()` (dev-only) is what finally reached them.
  They turned out to be the worst screens in the app — a facet stripped to two
  empty headers with a stale chunk id in the status bar, a `CHUNKS` header over
  700px of void with a live FG/BG toggle for nothing, a fully interactive
  23-object library with nowhere to place anything — and nobody had ever seen
  one. Assume any state you cannot reach by clicking is a state nobody has
  looked at.

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
