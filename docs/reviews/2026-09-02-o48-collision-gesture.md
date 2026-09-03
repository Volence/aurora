# O48 — the one collision surface still untested by gesture

**Branch** `test/o48-collision-gesture` · **Instrument**
`npm run harness:composer-collision-gesture`
**Environment** ELECTRON_BIN = the main checkout's `node_modules/.bin/electron`;
AURORA_BUILT_TREE = this worktree; `VITE_AURORA_DEBUG=1 npm run build`; xvfb-run
`1680x1050x24`; **dpr = 1**, composer canvas rect `1024.0x1024.0` at
`308.0,130.0`, backing store `1024x1024`, zoom 8 — every aim an integer derived
from that rect and verified with `elementFromPoint` before it was sent.

## What the row meant

O48's text does not name the surface — it was rescued from a retired row whose
fold was dangling. The finding is recoverable, and it is in
`docs/reviews/2026-08-28-collision-word-preservation.md` §8, in that parcel's own
words:

> The Art facet's collision brush is not driven by the harness.
> `paintDocCollision` is fixed and covered by node rows, but no CDP row performs
> a real press-and-drag in the chunk composer. […] A follow-up parcel should
> extend the harness rather than trust the reading.

That matches O48 exactly, including "the writers themselves are fixed and
shipped". The same review's §7 states the missing claim: *"press and drag share
one function, so one fix covers both"* is **measured** for `MapViewport` and only
**read** for `ComposerCanvas`, off the source text of `hostPointer.down` and
`.move`.

## The coverage table, by what a user can do to collision data

Registered = has a `package.json` script. Passing = run here on an unmodified
tree, 2026-09-02, on this build.

| Surface (what the user does) | Harness | Registered | Passing now |
|---|---|---|---|
| Freehand drag paints the cells the cursor crosses | `collision-gesture-harness` | no | **9/9** |
| Shift-drag paints the full rectangle, both drag directions | `collision-gesture-harness` (4, 5) | no | 9/9 |
| A press paints one cell, preserving the bits the brush doesn't own | `collision-preservation-harness` (p1, p2) | **yes** | **12/12** |
| A drag paints a far cell, same preservation | `collision-preservation-harness` (d1, d2) | yes | 12/12 |
| Tool armed by the real `c` hotkey on the collision facet | `collision-preservation-harness` (arm) | yes | 12/12 |
| Tool NOT armed → the drag pans and writes nothing | `collision-gesture-harness` (6) | no | 9/9 |
| Drag leaves the canvas mid-gesture → writes nothing | `collision-gesture-harness` (7) | no | 9/9 |
| Drag over blank blocks → skip reported, solids written | `collision-gesture-harness` (8) | no | 9/9 |
| Drag across a loop-flagged chunk → warning toast | `collision-gesture-harness` (9) | no | 9/9 |
| Shape-pick: clicking a palette swatch changes the block's shape | `collision-edit-harness` (1) | no | **7/7** |
| Undo: one Ctrl+Z from the map takes the edit back | `collision-edit-harness` (2), `collision-gesture-harness` (3) | no | 7/7, 9/9 |
| Isolate: refusal on GHZ; a clone where the table has room; undo | `collision-edit-harness` (3, 4, 5) | no | 7/7 |
| Probe click: reading a cell's collision off the map | `collision-lens-harness` (3, 4, 5) | no | **6/6** |
| A+B mode: one stroke writes both planes, one undo step | `loop-paint-harness` (b0–b4, u1) | **yes** | **45/45** |
| Crossover "hand-off" chip → real click, both planes, audit, lens | `loop-paint-harness` (x0–x6, o0–o3) | yes | 45/45 |
| Angle-mark overlay: View-menu toggles, gate, demotion, picker | `collision-legibility-harness`, `collision-mark-normal-harness` | no | not re-run (display-only; no writer) |
| Commit-to-ROM: new art gets flat shape / solidity per the toggle | `commit-collision-harness` | no | **8/8** |
| Agent road: `editor/set_block_collision`, idempotence, undo, dryRun | `collision-agent-harness` | no | **8/8** |
| Agent road: region read, mixed cells, unowned bits, budget | `collision-read-harness` | **yes** | **32/32** |
| **Art facet: the chunk collision brush, press and drag** | — | — | **THE GAP** |

**Uncovered by any gesture, and left uncovered — named, not closed.** These are
real controls in `CollisionPalette` that no CDP row clicks: **Reset** and
**Clear** on the map variant's `Sec N` row (the two wholesale, destructive
writers — `resetToEngineEntries` / `clearCollisionEntries`, the latter the only
gesture in the editor allowed to wipe unowned bits), the **brush-size** buttons,
the **Flip H / Flip V** chips, the **Floor** solidity chips, the **kind** filter
tabs, and **Alt-propagate** on brush 1. `loop-paint` arms A+B through
`armCollisionBrush`, saying so in its own row text; nothing clicked the **Plane
A/B** buttons before this parcel. Reset and Clear are the ones worth a row —
they are irreversible-looking and undo-routing is exactly what a gesture test
catches. Not done here: O48 is one row and the review names one surface.

## Runnability, which is a separate question from presence

Of the eleven collision-family harnesses in `scratchpad/`, **four** are in
`package.json`: `collision-preservation`, `collision-read`, `loop-paint`, and now
`composer-collision-gesture`. `collision-gesture`, `collision-agent`,
`collision-edit`, `collision-lens`, `collision-needle`, `collision-legibility`,
`collision-mark-normal`, `commit-collision` and `crossover-paint` are runnable by
path only — no sweep reaches them by name. Every one I cite above was run, and
all passed, so this is a discoverability finding rather than a rot finding.

**One red, pre-existing and not mine:** `crossover-paint-harness` is 12/13 here.
`[2c] ANTI-VACUOUS: plane B carries its OWN geometry, distinct from plane A`
fails because both planes read `0x30ff` at its fixture cells in the scratch tree
it drives (`.aurora-crossover-paint`, a copy dating from 08-29). It is the same
shape as the `section-raster-select` finding banked at O66 — **not re-runnable on
a reused copy** — and it is not registered, so nothing would have caught it.
Re-materialise that copy before believing its result. Running it saved into that
scratch copy; **`aeon` and `s1disasm` were not touched** (below).

## What was added

`scratchpad/composer-collision-gesture-harness.mjs`, 13 rows, registered as
`harness:composer-collision-gesture`. It drives the real aeon project, the real
Art facet pill, a real chunk thumbnail (`OJZ_00`, 16x16 tiles = 8x8 collision
cells), a real click on **Collision paint** in the tool rail, a real **press**, a
real button-held **drag** across six cells, and the palette's own **Plane B**
button.

Three debug hooks: `artDocCollisionAt` and `artDocCollisionPoke` (the composer's
document is a copy `docFromChunk` took at open, so no section hook can see it),
and `collisionWordMasks`, so the ownership rule comes from
`COLLISION_CELL_OWNED_MASK` rather than a `0x3fff` typed into a harness — the
pin `collision-word.ts` states the rule as a mask complement to avoid. Measured
here: `owned=0x3fff unowned=0xc000`, fixture's unowned value `0x4000` = the
complement's lowest set bit, derived.

**Nothing is saved.** The file contains no save call; the document is in-memory;
`[z1]` restores all five touched cells and re-reads them.

## Red-first

Each plant was applied on disk, the **built bundle grepped to prove it arrived**
(a rebuild is not a plant until the artifact carries it), the harness re-run, and
the file restored with `git checkout` from commit `e04fd9f2`.

| Plant | On disk | In `dist/` | Result |
|---|---|---|---|
| P1 `collisionPaintWord(word, arr[idx])` → `word & 0xFFFF` (the pre-fix wholesale write) | `composer-collision.ts:25` | `const merged = word & 65535;` | **[p2] [d2] [b1] RED**, 10/13 |
| P2 move path gated to `t !== 'collision'` | `ComposerCanvas.tsx:486` | `if (t !== "collision") for (const pt of linePoints(…` | **[d1] RED alone**, 12/13 |
| P3 `est.collisionPaintPlane` → hard `'a'` | `ComposerCanvas.tsx:388` | `paintDocCollision(doc, "a", cx, cy, …` | **[b1] RED alone**, 12/13 |

P1's controls `[p1]` and `[d1]` stay green there, by design: they measure the
**owned** half, which a wholesale write still gets right. That is what makes them
controls rather than duplicates of `[p2]`/`[d2]`.

### The vacuous row, kept and named

**Under P2, `[d2]` passes vacuously.** It asks whether the far cell's unowned
bits survived the drag; under P2 the drag never reaches that cell, so the fixture
sits there untouched and the row is satisfied by a stroke that did not happen.
`[d2]` cannot carry the preservation claim alone. `[d1]` beside it is what says
the drag arrived — and the log shows it directly: under P2 `[d2]`'s own detail
printed `whole word 0x5402`, the fixture, where a real drag prints `0x7001`. The
harness header states this at the top rather than in a footnote.

## Suite

`npm test` — **465 files passed, 2 skipped; 6432 tests passed, 8 skipped**, every
skip naming its reason. The two file-level skips are the sibling-root
main-checkout row (this run stands in a linked worktree) and the s4_engine
sprite/anim rows (that tree is gone from this machine).

## Not done

- **No emulator.** Nothing here touched `mcp__oracle__*`. Whether a chunk's
  collision reaches a built ROM is the engine lane's question, and this parcel
  makes no claim about it.
- **The peer trees are untouched.** `aeon` at `73b07a4f` with the same two dirty
  files (`docs/lane-status.json`, `tools/freeze_preflight.sh`) it had before this
  session; `s1disasm` at `f6ece657` with the same four
  (`artnem/GHZ Bridge.nem`, `artnem/Signpost.nem`, `.aurora/`, `Test.hsproject`).
  Both pre-existing and not attributable to this run.
