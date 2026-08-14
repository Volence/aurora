# Plan 5 — overnight report

Written while you slept. **Nothing is merged and nothing is pushed.** Everything is on
`feature/ux-stage4-plan5` in `.claude/worktrees/ux-plan5`. `master` has moved only for
plan documents — verified after every task with
`git log --oneline 0ed2a8c..master --name-only`.

## The one-line version

**Steps F and G are done.** Classic renders through the same `LevelWorkspace` shell as
aeon, the legacy classic shell is deleted, and the last three rounds have been polish
driven by looking at screens rather than by the test suite.

## Read this part first: what is proven vs. observed vs. inferred

This distinction matters more than usual here, because **the test suite cannot see React
or canvas.** There is no jsdom, and `.tsx` test files are not collected at all. All ~1980
tests are source greps, pure-function tests, or store tests. Not one renders a component.

- **Proven** — structure and invariants: which module resolves for an `(engine, facet)`
  pair, which facets get the plane control, that no shared component imports a store,
  that `App` mounts one workspace under an engine gate. Backed by tests, most of them
  verified against a planted violation.
- **Observed** — things actually seen in a screenshot. Three capture rounds, 64 shots;
  the final set of 22 is `shots-final/` with `NOTES.md` beside it.
- **Inferred** — typechecked, reasoned about, never seen. Until last night this included
  **every "no act loaded" screen**, which is precisely where the worst remaining problems
  turned out to be.

When this report says something works, it says which of the three it means.

## What landed

Twelve planned tasks plus three fix rounds. Suite went 1755 → **1974 passing / 0 failed /
3 skipped** (205 files) at branch head `d1f0fb7`, `tsc` clean throughout, production
`electron-vite build` verified.

| | |
|---|---|
| **F** | `MapStatusBar` and `PropertiesPanel` became neutral over engine ports. This removed an `executeCommand` call site that would have hard-crashed classic on its first background change. |
| **G** | One `(engine, facetId)`-keyed module registry replaced two that disagreed; classic's modules registered; one undo/redo binding for both engines; classic's duplicate OptionBar controls deleted; chunk picker re-homed; resolution report deduplicated; `LegacyWorkspace` / `ClassicProjectView` / `ZoneActTree` / `Toolbar` deleted; the sprite doc got its own header. |

Deleting `Toolbar` also closed a two-stage-old annoyance: the zone/act selector reachable
only from the sprite pane, which navigated the whole app away from the sprite you were
editing.

## Decisions I made on your behalf

1. **Dropped the `collision` grant from classic** (you approved this one). No collision UI
   exists, so the pill would have opened an aeon-only palette. One line to restore when the
   editor is built.
2. **Dropped the `palette` grant from classic.** Its Art and Palette facets were the *same
   module* differing only in `id` — the pill navigated to a pixel-identical screen. Same
   reversible one-liner.
3. **Engine-keyed facet modules**, replacing the Canvas-only registry. Deviates from the
   spec, which assumed only the canvas differs per engine; it doesn't — about ten slot
   components were aeon-coupled and several would throw for a classic document.
4. **Split Layout and Objects for classic.** They were doing the same job because a tool
   declaration outlived the comment that predicted its own staleness. Classic now matches
   aeon: Layout is terrain, Objects owns placement.

## What you found, and what it says about the process

You found four real problems in about ten minutes of clicking: boxes-in-boxes, the
collapsible composer, Layout ≡ Objects, and the composer's dead space. Eight rounds of
automated review had not.

Three of the four trace to one root cause — **the composer was designed as a bottom strip
and is now being asked to be a whole screen** — and every piece of that costume (`borderTop`,
`maxHeight: 380`, the collapse toggle, the redundant title) had to be taken off separately.

The honest read: I had already classified most of what you saw as "known, deferred to step
H," and my CDP checklist was functional, so the agent would have ticked every box and
reported success. **Your eye is the only thing currently evaluating composition rather than
correctness**, and that is not a gap I can close by writing a better checklist.

## What the audits found that you couldn't

Two read-only audits, run once the shells were unified, compared the engines facet by facet
for the first time. Five broken things, **two of them pre-existing aeon bugs unrelated to
this work**:

- **Aeon's Rings facet stranded you on the BG plane** — rings aren't drawn there,
  `place-ring` had no plane guard so it silently wrote invisible rings, and the facet had no
  FG/BG control. Identical to a bug we fixed for Objects; `rings` was just left off a list.
- **Aeon's Collision facet could clear a section you weren't looking at.** Reset/Clear act on
  an index that only *other* facets could move, and `paint-collision` claimed it too late
  (behind four early returns), so a no-op click never claimed at all.
- Classic's status bar and hint line contradicted each other one row apart on the BG plane.
- Clicking a chunk on classic's Art facet silently armed the map's stamp tool — **caused by
  our own chunk-picker fix**, so returning to Layout left you armed to paint terrain you'd
  only meant to edit.
- An `eraser` tool in the shared vocabulary with a label, a hint and a dock icon, present in
  no facet and implemented by neither canvas.

Plus eleven stale comments — including one that would have led a future agent to delete
`useActTabSync` and silently break agent-driven act switching, and the sentence in
`classic-surface.ts` that *caused* the Layout/Objects bug, still asserting the thing that
was wrong.

## Was open when this was written — round 3 has since closed all of it

> **Amended 2026-08-14 after round 3 and the final visual pass** (22 shots, branch head
> `d1f0fb7`). The list below was written while the third fix round was still running.
> Every item on it is now fixed and verified on screen; kept for the record with its
> verdict attached.

- ~~**The three "no act loaded" screens read like crashes.**~~ **Fixed.** `facet-chrome.ts`
  now decides which slots are live from one rule — *a control that cannot act is not
  drawn* — and with no act every slot but the canvas is suppressed. All three classic
  facets show canvas-only, no dock, no option bar, no right panel, no status bar, no
  FG/BG chips, no View menu, with Undo/Redo present and disabled. Layout and Objects are
  pixel-identical below the app bar; **Art is not** — its empty canvas paints `T.surface`
  where the map viewport paints `T.void`, an ~8/level lift over the whole canvas. Worth
  one line to unify.
- ~~**Aeon's Art facet opens on no document.**~~ **Fixed.** It lands on OJZ `$01`, framed
  whole rather than at its corner, with `New…` in the doc header as the route back to the
  launcher. Its `TILESET` thumbnails also stopped rendering blue: mean colour `(70,81,38)`
  against Layout's `ART` at `(71,89,40)`, so both tile strips now agree on a palette line.
- ~~**Classic's Art Block tier opens on the blank block.**~~ **Fixed** — opens on `$1`.
  See the "non-default is not visible" trap in the stage-4 status doc; the first attempt
  at this fix did not work, for an interesting reason.
- ~~**The collision legend leaks onto the Palette facet.**~~ **Fixed.** An implicit enable
  is now implicitly reverted: the legend is on Collision and absent from Palette and
  Layout both before Collision is visited and after leaving it. An overlay *you* turned on
  in the View menu is still left alone.
- ~~**FG→BG re-zooms the viewport from 58% to 200%.**~~ **Fixed.** Zoom is `0.5796875`
  either side of the switch.
- ~~**`RING PATTERNS` still doubled.**~~ **Fixed**, and so is the guard: it no longer reads
  a hand-written `PANELS` array but derives the list by scanning the facet modules for
  components mounted directly inside a `<CollapsibleSection>` and resolving them through
  each facet's own imports. That immediately turned up another unlisted panel. **A guard
  that only checks what someone remembered to list** is the failure mode that has bitten
  this branch three times, and this is the shape of the answer.

Two further round-3 items, not on the original list: the tool dock's button order is now
sorted by the one tool vocabulary, so `View` is first on every facet under both engines
(it used to be top on Layout and bottom on Objects, moving the armed tool under the
cursor); and aeon's Palette facet gained the `PAL LINE` strip as its bottom bar.

What the final pass found that is still open is in
`…/scratchpad/shots-final/NOTES.md`. The two worth naming here: **aeon's no-act canvas
says "Open a project to view sections"** when a project *is* open and only the act is
missing (classic's equivalent copy is correct), and **classic's `TILES (965)` strip
renders in two different palettes one tier apart** — green on the Block tier, line-0
red/blue on the Tile tier — which is the same bug round 3 just fixed for aeon.

## What I deliberately did not do

- **Merge or push.** Yours to approve.
- **Step H** — the shared Art facet. Classic's chunk-block-tile drill-down and aeon's staged
  pixel doc are genuinely different, and the spec already says forcing them is wrong.
- The classic collision editor — its own designed feature; the `colind` model and a
  validating store command already exist, only the UI is missing.
- Classic's `select` on Layout still has no properties readout. Documented in-tree, needs
  design.

## Two things worth your judgement

1. **Aeon's Palette facet is nearly a duplicate of its Art facet** — the same reason classic's
   was dropped. Its one real difference is that you see a recolour against the *map* rather
   than the composer. Keep it and give it something Art can't do, or drop it? The round-3
   agent has been asked to choose and justify; overrule it if you disagree.

   **Round 3 chose "keep and differentiate":** the facet gained `BottomExtra: PaletteViewer`
   — the `PAL LINE` strip — so picking a line and editing that line's colours are one
   screen, with the act repainting under both. The reasoning is in
   `workspace/facets/palette-facet.tsx`'s header.

   **Correction to this report:** it stated elsewhere, and the round-2 screenshot notes
   stated, that the facet has *no RGB editor*. **That is wrong.** `PaletteEditor`'s R/G/B
   sliders are **selection-gated** — `sel` starts `null` and only swatch indices 1–15 open
   them — so the reviewed screenshot simply had no swatch selected. Selecting one shows
   `Line 2 · Index 5 · $026A` with three channel sliders
   (`shots-final/aeon-palette-swatch-selected.png`). The real complaint about that column
   is the ~600px of dead space under a 110px swatch grid, which is step-H shaped.
2. **Every "empty state" is newly written and barely seen.** They were invisible for the whole
   project because a cold open always restores an act — `defaultProjectSession` loads one
   before any CDP round-trip can land, so no harness could photograph them either. Reaching
   them at all needed a dev-only `__dbg.resetLevel()`. They turned out to be the worst
   screens in the app, and round 3 rewrote all of them; they have now had that deliberate
   look. Treat "a state I cannot reach by clicking" as "a state nobody has ever seen".
