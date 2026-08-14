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
or canvas.** There is no jsdom, and `.tsx` test files are not collected at all. All ~1900
tests are source greps, pure-function tests, or store tests. Not one renders a component.

- **Proven** — structure and invariants: which module resolves for an `(engine, facet)`
  pair, which facets get the plane control, that no shared component imports a store,
  that `App` mounts one workspace under an engine gate. Backed by tests, most of them
  verified against a planted violation.
- **Observed** — things actually seen in a screenshot. Two capture rounds, 42 shots.
- **Inferred** — typechecked, reasoned about, never seen. Until last night this included
  **every "no act loaded" screen**, which is precisely where the worst remaining problems
  turned out to be.

When this report says something works, it says which of the three it means.

## What landed

Twelve planned tasks plus three fix rounds. Suite went 1755 → 1899 passing, 0 failed,
`tsc` clean throughout, production `electron-vite build` verified.

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

## Still open when you read this

A third fix round is running against findings from the second screenshot pass. Highlights:

- **The three "no act loaded" screens read like crashes.** Now seen for the first time — a
  facet stripped to two empty headers with a stale chunk id in the status bar; a `CHUNKS`
  header over 700px of void with a live FG/BG toggle for nothing; an interactive 23-object
  library with nowhere to place anything.
- **Aeon's Art facet opens on no document** — the same bug just fixed for classic, one
  engine over, while the right rail reports 919 tiles for the loaded zone.
- Classic's Art **Block** tier opens on the blank block, same class again, and prints no
  string so no grep guard can catch it.
- The collision legend leaks onto the Palette facet.
- FG→BG re-zooms the viewport from 58% to 200%.
- `RING PATTERNS` still doubled — the heading guard missed it because that panel isn't in
  the list the guard checks. **A guard that only checks what someone remembered to list**
  is the failure mode that has bitten this branch three times.

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
2. **Every "empty state" is newly written and barely seen.** They were invisible for the whole
   project because a cold open always restores an act. Worth a deliberate look.
